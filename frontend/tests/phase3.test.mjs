import './support/register-typescript.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { ApiClient } = await import('../src/api/client.ts');
const { ticketApi } = await import('../src/api/tickets.ts');
const { canModify, transitions } = await import('../src/features/tickets/controls.ts');
const { uploadAttachment, validateFile } = await import('../src/features/tickets/uploadAttachment.ts');
const { Conversation } = await import('../src/features/tickets/Conversation.tsx');
const { InternalNotes } = await import('../src/features/tickets/InternalNotes.tsx');
const { TicketControls } = await import('../src/features/tickets/TicketControls.tsx');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const ticket = { id: 't', title: 'Help', assigned_agent_id: 'agent', status: 'OPEN', priority: 'MEDIUM' };
const message = { id: 'm', ticket_id: 't', author_user_id: 'agent', message_type: 'AGENT_REPLY', body: 'Reply', created_at: new Date().toISOString(), edited_at: null, deleted_at: null };

function setup(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => { calls.push({ url, ...init }); return handler(url, init); };
  return { api: ticketApi(new ApiClient(() => {})), calls };
}

test('internal note uses a separate route and never posts a conversation message', async () => {
  const note = { id: 'n', body: 'Staff only', author_email: 'support@example.test' };
  const { api, calls } = setup((url, init) => {
    assert.equal(url, '/api/tickets/t/internal-notes');
    return json(init.method === 'POST' ? note : [note]);
  });
  assert.deepEqual(await api.addNote('t', note.body), note);
  assert.deepEqual(await api.notes('t'), [note]);
  assert.deepEqual(JSON.parse(calls[0].body), { body: 'Staff only' });
  const markup = renderToStaticMarkup(createElement(InternalNotes, { api, ticketId: 't' }));
  assert.match(markup, /INTERNAL/);
  assert.match(markup, /Never sent to the customer/);
});

test('status success and conflict retain backend authority', async () => {
  const { api, calls } = setup((url, init) => {
    assert.equal(url, '/api/tickets/t/status');
    const { status } = JSON.parse(init.body);
    return status === 'IN_PROGRESS' ? json({ ...ticket, status }) : json({ detail: 'Invalid status transition' }, 409);
  });
  assert.equal((await api.status('t', 'IN_PROGRESS')).status, 'IN_PROGRESS');
  await assert.rejects(api.status('t', 'CLOSED'), error => error.status === 409 && /Invalid status/.test(error.message));
  assert.equal(calls[0].method, 'PATCH');
  assert.deepEqual(transitions.CLOSED, []);
  assert.deepEqual(transitions.RESOLVED, ['IN_PROGRESS', 'CLOSED']);
  assert.ok(transitions.OPEN.includes('RESOLVED'));
});

test('priority raise succeeds and unauthorized downgrade shows backend explanation', async () => {
  const { api } = setup((url, init) => {
    assert.equal(url, '/api/tickets/t/priority');
    return JSON.parse(init.body).priority === 'HIGH' ? json({ ...ticket, priority: 'HIGH' }) : json({ detail: 'Only the assigned agent can lower priority' }, 403);
  });
  assert.equal((await api.priority('t', 'HIGH')).priority, 'HIGH');
  await assert.rejects(api.priority('t', 'LOW'), error => error.status === 403 && /assigned agent/.test(error.message));
});

test('eligible own agent message edit, expired edit conflict, ownership and deleted guidance', async () => {
  const now = Date.parse(message.created_at);
  assert.equal(canModify(message, 'agent', now), true);
  assert.equal(canModify(message, 'other', now), false);
  assert.equal(canModify({ ...message, message_type: 'CUSTOMER_REPLY' }, 'agent', now), false);
  assert.equal(canModify({ ...message, deleted_at: message.created_at }, 'agent', now), false);
  assert.equal(canModify(message, 'agent', now + 900001), false);
  const { api } = setup((url, init) => {
    assert.equal(url, '/api/tickets/t/messages/m'); assert.equal(init.method, 'PATCH');
    return JSON.parse(init.body).body === 'Updated' ? json({ ...message, body: 'Updated', edited_at: message.created_at }) : json({ detail: 'Message can only be edited within 15 minutes' }, 409);
  });
  assert.ok((await api.edit('t', 'm', 'Updated')).edited_at);
  await assert.rejects(api.edit('t', 'm', 'Expired'), error => error.status === 409 && /15 minutes/.test(error.message));
});

test('soft delete preserves backend placeholder and hides actions and attachments', async () => {
  const deleted = { ...message, body: 'This message was deleted', deleted_at: message.created_at };
  const { api } = setup((url, init) => { assert.equal(init.method, 'DELETE'); return json(deleted); });
  const result = await api.delete('t', 'm');
  const markup = renderToStaticMarkup(createElement(Conversation, { api, userId: 'agent', revision: 0, onChanged() {}, ticket, messages: [result], canReply: true, onReply: async () => message }));
  assert.match(markup, /This message was deleted/);
  assert.doesNotMatch(markup, />Edit<|>Delete<|Staff only|aria-label="Attachments"/);
});

test('presign → direct PUT → confirm sends no application credentials to storage', async () => {
  const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
  const attachment = { id: 'a', original_filename: file.name, size_bytes: 5, mime_type: file.type, upload_status: 'UPLOADED' };
  const { api, calls } = setup((url, init) => {
    if (url.endsWith('/presign')) {
      assert.deepEqual(JSON.parse(init.body), { filename: 'hello.txt', mime_type: 'text/plain', size_bytes: 5 });
      return json({ attachment_id: 'a', upload_url: 'https://storage.example/upload', expires_in: 300 });
    }
    if (url === 'https://storage.example/upload') {
      assert.equal(init.body, file); assert.equal(init.method, 'PUT'); assert.equal(init.credentials, 'omit');
      assert.deepEqual(init.headers, { 'Content-Type': 'text/plain' });
      return new Response(null, { status: 200 });
    }
    assert.equal(url, '/api/tickets/t/messages/m/attachments/a/confirm');
    return json(attachment);
  });
  assert.deepEqual(await uploadAttachment(api, 't', 'm', file), attachment);
  assert.equal(calls.length, 3);
});

test('upload failure does not confirm; invalid files never presign', async () => {
  const { api, calls } = setup(url => url.endsWith('/presign') ? json({ attachment_id: 'a', upload_url: 'https://storage.example/upload' }) : new Response(null, { status: 500 }));
  await assert.rejects(uploadAttachment(api, 't', 'm', new File(['x'], 'x')), /upload failed/);
  assert.equal(calls.length, 2);
  assert.throws(() => validateFile(new File([], 'empty')), /nonempty/);
  assert.throws(() => validateFile({ size: 10485761, name: 'large' }), /10 MB/);
});

test('storage network/CORS failure identifies the failed stage and never confirms', async () => {
  const { api, calls } = setup(url => {
    if (url.endsWith('/presign')) return json({ attachment_id: 'a', upload_url: 'https://storage.example/upload?signature=secret' });
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(uploadAttachment(api, 't', 'm', new File(['x'], 'x')), error => /File storage/.test(error.message) && /reply is saved/.test(error.message) && !error.message.includes('signature'));
  assert.equal(calls.length, 2);
  assert.ok(!calls.some(call => call.url.endsWith('/confirm')));
});

test('presign and confirm connection failures are distinguished; backend permission errors are preserved', async () => {
  const { api } = setup(() => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(uploadAttachment(api, 't', 'm', new File(['x'], 'x')), /Could not request the file upload/);
  setup(url => {
    if (url.endsWith('/presign')) return json({ attachment_id: 'a', upload_url: 'https://storage.example/upload' });
    if (url === 'https://storage.example/upload') return new Response(null, { status: 200 });
    throw new TypeError('Failed to fetch');
  });
  await assert.rejects(uploadAttachment(api, 't', 'm', new File(['x'], 'x')), /upload confirmation/);
  setup(() => json({ detail: 'You can only attach files to your own messages' }, 403));
  await assert.rejects(uploadAttachment(api, 't', 'm', new File(['x'], 'x')), error => error.status === 403 && /your own messages/.test(error.message));
});

test('attachment list and temporary download metadata use authenticated backend routes', async () => {
  const attachment = { id: 'a', original_filename: 'file.txt', size_bytes: 12, mime_type: 'text/plain' };
  const metadata = { download_url: 'https://storage.example/temporary', expires_in: 300 };
  const { api, calls } = setup(url => json(url.endsWith('/download') ? metadata : [attachment]));
  assert.deepEqual(await api.attachments('t', 'm'), [attachment]);
  assert.deepEqual(await api.download('t', 'm', 'a'), metadata);
  assert.equal(calls[1].url, '/api/tickets/t/messages/m/attachments/a/download');
  assert.equal(calls[1].credentials, 'include');
});

test('validation and server failures are safe and useful', async () => {
  const { api } = setup(() => json({ detail: 'private stack trace' }, 500));
  await assert.rejects(api.addNote('t', 'note'), error => !error.message.includes('stack') && /retry/.test(error.message));
  setup(() => json({ detail: [{ msg: 'too long' }] }, 422));
  await assert.rejects(api.edit('t', 'm', 'invalid'), error => error.status === 422 && /submitted values/.test(error.message));
});

test('Phase 1 queue, detail, conversation, claim and reply contracts remain unchanged', async () => {
  const { api, calls } = setup(url => json(url.includes('?') ? [ticket] : url.endsWith('/messages') ? message : ticket));
  const signal = new AbortController().signal;
  await api.queue('assigned_to_me', signal); await api.queue('unassigned', signal);
  await api.detail('t'); await api.messages('t'); await api.claim('t'); await api.reply('t', 'Reply');
  assert.deepEqual(calls.map(call => [call.url, call.method ?? 'GET']), [
    ['/api/tickets?assigned_to_me=true', 'GET'], ['/api/tickets?unassigned=true', 'GET'],
    ['/api/tickets/t', 'GET'], ['/api/tickets/t/messages', 'GET'], ['/api/tickets/t/claim', 'POST'], ['/api/tickets/t/messages', 'POST'],
  ]);
  assert.deepEqual(JSON.parse(calls.at(-1).body), { body: 'Reply' });
});

test('ticket controls disable unassigned status and priority downgrade; CLOSED has no transitions', () => {
  const { api } = setup(() => json(ticket));
  const render = value => renderToStaticMarkup(createElement(TicketControls, { api, ticket: value, userId: 'agent', onUpdated() {}, onRefresh() {} }));
  const unassigned = render({ ...ticket, assigned_agent_id: null });
  assert.match(unassigned, /aria-label="Ticket status" disabled/);
  assert.match(unassigned, /value="LOW" disabled/);
  assert.doesNotMatch(unassigned, /value="HIGH" disabled/);
  const closed = render({ ...ticket, status: 'CLOSED' });
  assert.match(closed, /aria-label="Ticket status" disabled/);
  assert.doesNotMatch(closed, /value="IN_PROGRESS"/);
});
