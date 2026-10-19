import './support/register-typescript.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate as flush } from 'node:timers/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const { ApiClient, ApiError } = await import('../src/api/client.ts');
const { aiApi } = await import('../src/api/ai.ts');
const { AiSuggestionController, STALE_MESSAGE } = await import('../src/features/ai/AiSuggestionController.ts');
const { CitationList } = await import('../src/features/ai/CitationList.tsx');
const { AiSuggestion } = await import('../src/features/ai/AiSuggestion.tsx');
const { AiAssistantPanel, GenerateSuggestionButton } = await import('../src/features/ai/AiAssistantPanel.tsx');

const suggestion = (status, id = 'suggestion-1') => ({
  id, ticket_id: 'ticket-1', requested_by_user_id: 'agent', conversation_version: 1,
  status, draft_text: status === 'COMPLETED' ? 'Follow the policy [2].' : null,
  citations: status === 'COMPLETED' ? [{ citation: 2, document_id: 'document-2', chunk_id: 'chunk-2', chunk_index: 0, page_number: 4, similarity: 0.789 }] : null,
  created_at: '2026-10-18T00:00:00Z', completed_at: null, failed_at: null, failure_reason: null,
});
const response = payload => ({ id: 'feedback', suggestion_id: 'suggestion-1', feedback_by_user_id: 'agent', ...payload, final_text: payload.final_text ?? null, created_at: '2026-10-18T00:00:00Z' });
function setup(t, statuses = ['PROCESSING', 'COMPLETED'], options) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const seen = [];
  let getCalls = 0;
  const api = {
    generate: async () => suggestion('PENDING'),
    get: async () => { getCalls++; return suggestion(statuses.shift() ?? 'PROCESSING'); },
    feedback: async (id, payload) => { seen.push({ id, payload }); return response(payload); },
  };
  const controller = new AiSuggestionController(api, 'ticket-1', options);
  t.after(() => controller.stop());
  return { api, controller, seen, calls: () => getCalls };
}
async function tick(t, ms = 2000) { t.mock.timers.tick(ms); await flush(); }

test('PENDING → PROCESSING → COMPLETED; no polling after completion', async t => {
  const { controller, calls } = setup(t);
  await controller.generate();
  assert.equal(controller.getSnapshot().suggestion.status, 'PENDING');
  await tick(t);
  assert.equal(controller.getSnapshot().suggestion.status, 'PROCESSING');
  await tick(t);
  assert.equal(controller.getSnapshot().suggestion.status, 'COMPLETED');
  assert.equal(controller.getSnapshot().polling, false);
  await tick(t, 20_000);
  assert.equal(calls(), 2);
});

for (const terminal of ['FAILED', 'STALE']) {
  test(`polling stops after ${terminal}; feedback is blocked`, async t => {
    const { controller, calls, seen } = setup(t, [terminal]);
    await controller.generate(); await tick(t);
    assert.equal(controller.getSnapshot().suggestion.status, terminal);
    assert.equal(controller.getSnapshot().polling, false);
    await controller.submit({ feedback_type: 'ACCEPTED' });
    await tick(t, 20_000);
    assert.equal(calls(), 1);
    assert.equal(seen.length, 0);
  });
}

test('poll requests never overlap even when a response is slow', async t => {
  const { api, controller } = setup(t);
  let resolve;
  let count = 0;
  api.get = () => { count++; return new Promise(done => { resolve = done; }); };
  await controller.generate(); await tick(t);
  await tick(t, 10_000);
  assert.equal(count, 1);
  resolve(suggestion('COMPLETED')); await flush();
  assert.equal(controller.getSnapshot().polling, false);
});

test('unmount cleanup aborts in-flight polling, clears timers and ignores late responses', async t => {
  const { api, controller } = setup(t);
  let signal;
  let resolve;
  api.get = (_id, requestSignal) => { signal = requestSignal; return new Promise(done => { resolve = done; }); };
  await controller.generate(); await tick(t);
  controller.stop();
  assert.equal(signal.aborted, true);
  resolve(suggestion('COMPLETED')); await flush();
  assert.equal(controller.getSnapshot().suggestion.status, 'PENDING');
  assert.equal(controller.getSnapshot().polling, false);
  await tick(t, 200_000);
  assert.equal(controller.getSnapshot().error, '');
});

test('changing tickets disposes the previous polling scope', async t => {
  const { api, controller, calls } = setup(t);
  await controller.generate();
  controller.stop();
  const next = new AiSuggestionController(api, 'ticket-2');
  t.after(() => next.stop());
  await tick(t, 10_000);
  assert.equal(calls(), 0);
  assert.equal(next.getSnapshot().suggestion, null);
});

test('rapid double-click sends only one POST, and PENDING/PROCESSING block new generation', async t => {
  const { api, controller } = setup(t);
  let resolve;
  let posts = 0;
  api.generate = () => { posts++; return new Promise(done => { resolve = done; }); };
  const first = controller.generate();
  assert.equal(controller.getSnapshot().generating, true);
  await controller.generate();
  assert.equal(posts, 1);
  resolve(suggestion('PENDING')); await first;
  await controller.generate();
  assert.equal(posts, 1);
  await tick(t);
  assert.equal(controller.getSnapshot().suggestion.status, 'PROCESSING');
  await controller.generate();
  assert.equal(posts, 1);
  await tick(t);
  assert.equal(controller.getSnapshot().suggestion.status, 'COMPLETED');
  api.generate = async () => { posts++; return suggestion('PENDING', 'new-suggestion'); };
  await controller.generate();
  assert.equal(posts, 2);
  assert.equal(controller.getSnapshot().suggestion.id, 'new-suggestion');
});

for (const status of ['COMPLETED', 'FAILED', 'STALE']) {
  test(`generation is allowed again after ${status}`, async t => {
    const { api, controller } = setup(t, [status]);
    await controller.generate(); await tick(t);
    api.generate = async () => suggestion('PENDING', 'next');
    await controller.generate();
    assert.equal(controller.getSnapshot().suggestion.id, 'next');
  });
}

test('Generate button is disabled during POST, PENDING and PROCESSING, and enabled after terminal states', () => {
  const render = (status, generating = false) => renderToStaticMarkup(createElement(GenerateSuggestionButton, {
    state: { suggestion: status ? suggestion(status) : null, generating, submitting: null }, canGenerate: true, onGenerate: async () => {},
  }));
  assert.match(render(null, true), /disabled=""/);
  for (const status of ['PENDING', 'PROCESSING']) assert.match(render(status), /disabled=""/);
  for (const status of ['COMPLETED', 'FAILED', 'STALE']) assert.doesNotMatch(render(status), /disabled=/);
});

test('ACCEPTED displays its sent state and final_text from the feedback response', () => {
  const html = renderToStaticMarkup(createElement(AiSuggestion, {
    suggestion: suggestion('COMPLETED'), feedback: response({ feedback_type: 'ACCEPTED', final_text: 'The accepted response.' }),
    submitting: null, conflict: false, canAct: true, onFeedback: async () => {},
  }));
  assert.match(html, /Accepted &amp; sent/);
  assert.match(html, /Sent to customer without citation markers\./);
  assert.match(html, /class="ai-draft ai-final-text">The accepted response\.<\/div>/);
  assert.doesNotMatch(html, /SUGGESTED REPLY|Follow the policy|ai-actions/);
  assert.match(html, /Source \[2\]/);
});

test('EDITED prominently displays exact final_text, with original draft only in collapsed provenance', () => {
  const html = renderToStaticMarkup(createElement(AiSuggestion, {
    suggestion: suggestion('COMPLETED'), feedback: response({ feedback_type: 'EDITED', final_text: 'Agent final wording [2].' }),
    submitting: null, conflict: false, canAct: true, onFeedback: async () => {},
  }));
  assert.match(html, /Edited &amp; sent/);
  assert.match(html, /Sent to customer without citation markers\./);
  assert.match(html, /class="ai-draft ai-final-text">Agent final wording \[2\]\.<\/div>/);
  assert.match(html, /<details class="ai-original-draft"><summary>Original AI draft<\/summary>/);
  assert.match(html, /<details[^>]*>.*Follow the policy \[2\]\..*<\/details>/);
  assert.doesNotMatch(html.replace(/<details.*?<\/details>/, ''), /Follow the policy|SUGGESTED REPLY/);
  assert.doesNotMatch(html, /<details[^>]* open|ai-actions/);
  assert.match(html, /Source \[2\]/);
});

test('REJECTED shows rejection and reference draft, without implying a sent response', () => {
  const html = renderToStaticMarkup(createElement(AiSuggestion, {
    suggestion: suggestion('COMPLETED'), feedback: response({ feedback_type: 'REJECTED' }),
    submitting: null, conflict: false, canAct: true, onFeedback: async () => {},
  }));
  assert.match(html, /Rejected\. No reply was sent\./);
  assert.doesNotMatch(html, /Sent to customer without citation markers/);
  assert.match(html, /REFERENCE ONLY/);
  assert.match(html, /Follow the policy \[2\]\./);
  assert.doesNotMatch(html, /FINAL RESPONSE|ai-final-text|ai-actions/);
  assert.match(html, /Source \[2\]/);
});

test('three consecutive polling failures stop polling and expose a safe error', async t => {
  const { api, controller } = setup(t);
  let calls = 0;
  api.get = async () => { calls++; throw new ApiError(500, 'SECRET PROVIDER STACK'); };
  await controller.generate();
  for (let i = 0; i < 3; i++) await tick(t);
  assert.equal(controller.getSnapshot().polling, false);
  assert.match(controller.getSnapshot().error, /fresh suggestion/);
  assert.doesNotMatch(controller.getSnapshot().error, /SECRET/);
  await tick(t, 20_000);
  assert.equal(calls, 3);
});

test('polling has a finite deadline even if a request hangs', async t => {
  const { api, controller } = setup(t, [], { timeoutMs: 5000 });
  let signal;
  api.get = (_id, requestSignal) => { signal = requestSignal; return new Promise(() => {}); };
  await controller.generate(); await tick(t);
  await tick(t, 3000);
  assert.equal(signal.aborted, true);
  assert.equal(controller.getSnapshot().polling, false);
  assert.match(controller.getSnapshot().error, /longer than expected/);
});

for (const payload of [{ feedback_type: 'ACCEPTED' }, { feedback_type: 'EDITED', final_text: 'My revised reply [2].' }, { feedback_type: 'REJECTED' }]) {
  test(`${payload.feedback_type} posts exactly one feedback request with the correct payload`, async t => {
    const { api, controller, seen } = setup(t);
    api.generate = async () => suggestion('COMPLETED');
    await controller.generate();
    const result = await controller.submit(payload);
    assert.equal(result.feedback_type, payload.feedback_type);
    assert.deepEqual(seen, [{ id: 'suggestion-1', payload }]);
    assert.equal(controller.getSnapshot().feedback.feedback_type, payload.feedback_type);
    assert.equal(await controller.submit(payload), null);
    assert.equal(seen.length, 1);
  });
}

test('feedback 409 blocks all subsequent actions and asks for a fresh suggestion', async t => {
  const { api, controller } = setup(t);
  api.generate = async () => suggestion('COMPLETED');
  let calls = 0;
  api.feedback = async () => { calls++; throw new ApiError(409, 'Suggestion is stale because the conversation has changed'); };
  await controller.generate();
  await controller.submit({ feedback_type: 'ACCEPTED' });
  assert.equal(controller.getSnapshot().conflict, true);
  assert.match(controller.getSnapshot().error, /fresh suggestion/);
  await controller.submit({ feedback_type: 'EDITED', final_text: 'Override' });
  assert.equal(calls, 1);
  await controller.generate();
  assert.equal(controller.getSnapshot().conflict, false);
});

test('blank edited feedback is validated before sending', async t => {
  const { api, controller, seen } = setup(t);
  api.generate = async () => suggestion('COMPLETED');
  await controller.generate();
  await controller.submit({ feedback_type: 'EDITED', final_text: '   ' });
  assert.equal(seen.length, 0);
  assert.match(controller.getSnapshot().error, /Enter a reply/);
});

test('citations use source identifiers, handle TXT and omit unavailable fields', () => {
  const html = renderToStaticMarkup(createElement(CitationList, { citations: [
    ...suggestion('COMPLETED').citations,
    { citation: 7, document_id: 'text-document', page_number: null },
  ] }));
  assert.match(html, /Source \[2\]/);
  assert.match(html, /Source \[7\]/);
  assert.doesNotMatch(html, /Source \[1\]/);
  assert.match(html, /Page 4/);
  assert.match(html, /Similarity: 0.79/);
  assert.match(html, /Chunk index: 0/);
  assert.match(html, /Document: document-2/);
  assert.doesNotMatch(html, /Page null|undefined|chunk-2/);
  for (const citations of [null, []]) assert.match(renderToStaticMarkup(createElement(CitationList, { citations })), /No citation sources/);
});

test('draft retains citation markers and completed actions; stale and failures expose no actions or stack traces', () => {
  const props = { feedback: null, submitting: null, conflict: false, canAct: true, onFeedback: async () => {} };
  const html = renderToStaticMarkup(createElement(AiSuggestion, { ...props, suggestion: suggestion('COMPLETED') }));
  assert.match(html, /Follow the policy \[2\]\./);
  assert.match(html, />Accept</);
  assert.match(html, /Citations are for agent reference only and are automatically removed from customer-facing replies\./);
  assert.doesNotMatch(html, /Sent to customer without citation markers/);
  assert.match(html, /Edit &amp; Send/);
  const stale = renderToStaticMarkup(createElement(AiSuggestion, { ...props, suggestion: suggestion('STALE') }));
  assert.ok(stale.includes(STALE_MESSAGE));
  assert.doesNotMatch(stale, />Accept<|Edit &amp; Send/);
  const failed = renderToStaticMarkup(createElement(AiSuggestion, { ...props, suggestion: { ...suggestion('FAILED'), failure_reason: 'SECRET STACK' } }));
  assert.doesNotMatch(failed, /SECRET STACK|>Accept</);
  const conflict = renderToStaticMarkup(createElement(AiSuggestion, { ...props, conflict: true, suggestion: suggestion('COMPLETED') }));
  assert.match(conflict, /disabled=""/);
});

test('generation is disabled for unassigned, resolved and closed tickets', () => {
  for (const ticket of [
    { id: 'ticket', assigned_agent_id: null, status: 'OPEN' },
    { id: 'ticket', assigned_agent_id: 'agent', status: 'RESOLVED' },
    { id: 'ticket', assigned_agent_id: 'agent', status: 'CLOSED' },
  ]) {
    const html = renderToStaticMarkup(createElement(AiAssistantPanel, { client: new ApiClient(() => {}), ticket, userId: 'agent', onReplyCreated: () => {} }));
    assert.match(html, /disabled=""/);
  }
});

test('AI API adapter uses exact routes, no final_text for ACCEPTED/REJECTED, and no duplicate message POST', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    assert.equal(init.credentials, 'include');
    return new Response(JSON.stringify(url.endsWith('/feedback') ? response(JSON.parse(init.body)) : suggestion('COMPLETED')), { status: url.endsWith('/feedback') ? 201 : init.method === 'POST' ? 202 : 200 });
  });
  const api = aiApi(new ApiClient(() => {}));
  const signal = new AbortController().signal;
  await api.generate('ticket-1', signal);
  await api.get('suggestion-1', signal);
  for (const payload of [{ feedback_type: 'ACCEPTED' }, { feedback_type: 'EDITED', final_text: 'Edited' }, { feedback_type: 'REJECTED' }]) await api.feedback('suggestion-1', payload, signal);
  assert.deepEqual(calls.map(call => call.url), ['/api/tickets/ticket-1/ai-suggestions', '/api/ai-suggestions/suggestion-1', ...Array(3).fill('/api/ai-suggestions/suggestion-1/feedback')]);
  assert.deepEqual(calls.slice(2).map(call => call.body), [{ feedback_type: 'ACCEPTED' }, { feedback_type: 'EDITED', final_text: 'Edited' }, { feedback_type: 'REJECTED' }]);
});
