// Optional real Chromium check, with deterministic API fixtures and no test dependencies.
// npm run build; $env:BROWSER_BIN='C:\...\chrome.exe'; node --test tests/browser-navigation.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Runs in the isolated browser profile before the application loads.
function installFixtures() {
  const user = { id: 'agent', name: 'Test Agent', email: 'agent@example.test', role: 'AGENT' };
  const ticket = { id: 'ticket-1', title: 'Account access', customer_id: 'customer-1', primary_category_id: 'category-1', assigned_agent_id: 'agent', customer_urgency: 'NORMAL', status: 'OPEN', priority: 'MEDIUM' };
  const messages = Array.from({ length: 24 }, (_, index) => ({ id: `customer-message-${index}`, ticket_id: ticket.id, author_user_id: 'customer-1', message_type: 'CUSTOMER_REPLY', body: `Question ${index + 1}: Please help me sign in.`, created_at: new Date(Date.now() - (24 - index) * 60000).toISOString(), edited_at: null, deleted_at: null }));
  const notes = [];
  const attachments = [];
  let generation = 0; let polls = 0;
  window.__calls = []; window.__expireNext = false;
  const suggestion = status => ({ id: `suggestion-${generation}`, ticket_id: ticket.id, status, draft_text: 'Follow the policy [1].', citations: [{ citation: 1, document_id: 'document-1', chunk_id: 'chunk-1', chunk_index: 0, page_number: 2, similarity: 0.8 }] });
  function reply(body) {
    const message = { ...messages[0], id: `message-${messages.length}`, author_user_id: 'agent', message_type: 'AGENT_REPLY', body };
    messages.push(message); return message;
  }
  window.fetch = async (input, init = {}) => {
    const url = String(input); const method = init.method ?? 'GET';
    window.__calls.push({ url, method, credentials: init.credentials, body: typeof init.body === 'string' ? init.body : null });
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
    const json = (value, status = 200) => Promise.resolve(new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }));
    if (url === 'https://storage.example/upload') return new Response(null, { status: 200 });
    if (url === '/api/auth/refresh' || url === '/api/auth/login') return json({ access_token: 'fixture-token', token_type: 'bearer', user });
    if (url === '/api/auth/me') return json(user);
    if (url === '/api/auth/logout') return new Response(null, { status: 204 });
    if (window.__expireNext) { window.__expireNext = false; return json({ detail: 'Expired' }, 401); }
    if (url.startsWith('/api/tickets?')) return json([ticket]);
    if (url.endsWith('/status') || url.endsWith('/priority')) { Object.assign(ticket, body); return json(ticket); }
    if (url.endsWith('/internal-notes')) {
      if (method === 'POST') { const note = { id: `note-${notes.length}`, ticket_id: ticket.id, author_user_id: user.id, author_email: user.email, created_at: new Date().toISOString(), ...body }; notes.push(note); return json(note, 201); }
      return json(notes);
    }
    if (url.endsWith('/ai-suggestions') && method === 'POST') { generation++; polls = 0; return json(suggestion('PENDING'), 202); }
    if (url.endsWith('/feedback')) {
      const final_text = (body.final_text ?? 'Follow the policy [1].').replace(/\[\d+\]/g, '').trim();
      if (body.feedback_type !== 'REJECTED') reply(final_text);
      return json({ id: 'feedback-1', ...body, final_text });
    }
    if (url.startsWith('/api/ai-suggestions/')) return json(suggestion(++polls > 1 ? 'COMPLETED' : 'PROCESSING'));
    if (url.endsWith('/presign')) return json({ attachment_id: 'attachment-1', upload_url: 'https://storage.example/upload', storage_key: 'fixture', expires_in: 300 }, 201);
    if (url.endsWith('/confirm')) {
      const message_id = url.split('/messages/')[1].split('/')[0];
      const attachment = { id: 'attachment-1', message_id, original_filename: 'test.txt', size_bytes: 5, mime_type: 'text/plain', upload_status: 'UPLOADED' };
      attachments.push(attachment); return json(attachment);
    }
    if (url.endsWith('/download')) return json({ download_url: 'data:text/plain,hello', expires_in: 300 });
    if (url.endsWith('/attachments')) {
      const message_id = url.split('/messages/')[1].split('/')[0]; return json(attachments.filter(file => file.message_id === message_id));
    }
    if (url.endsWith('/messages')) return json(method === 'POST' ? reply(body.body) : messages, method === 'POST' ? 201 : 200);
    if (url === '/api/tickets/ticket-1') return json(ticket);
    return json({ detail: `Unexpected fixture route: ${method} ${url}` }, 404);
  };
}

test('real browser: routes, retained drafts/AI polling/feedback, notes, overview, attachments and refresh', { skip: !process.env.BROWSER_BIN, timeout: 60000 }, async () => {
  const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const asset = resolve(dist, `.${path}`);
    if (!asset.startsWith(dist + sep)) { response.writeHead(400).end(); return; }
    try {
      const filename = path.startsWith('/assets/') ? asset : join(dist, 'index.html');
      response.setHeader('Content-Type', { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[extname(filename)] ?? 'application/octet-stream');
      response.end(await readFile(filename));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = await mkdtemp(join(tmpdir(), 'ia-browser-'));
  const browser = spawn(process.env.BROWSER_BIN, ['--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    let port;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await delay(100); }
    }
    assert.ok(port, 'Chromium must expose its isolated debugging port');
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0; const pending = new Map(); const errors = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
      if (message.id) { const callbacks = pending.get(message.id); pending.delete(message.id); if (message.error) callbacks.reject(new Error(message.error.message)); else callbacks.resolve(message.result); }
    });
    const send = (method, params = {}) => new Promise((resolveMessage, reject) => { const id = ++sequence; pending.set(id, { resolve: resolveMessage, reject }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    };
    async function until(expression) {
      for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await delay(75); }
      throw new Error(`Timed out: ${expression}`);
    }
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const button = text => evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.getClientRects().length && button.textContent === ${JSON.stringify(text)}).click()`);
    const fill = (selector, text) => evaluate(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    async function section(name) {
      await click(`.ticket-section-nav a[href$="/${name}"]`);
      await until(`document.querySelector('[data-section="${name}"]:not([hidden])') !== null`);
      assert.equal(await evaluate(`document.querySelectorAll('.ticket-section:not([hidden])').length`), 1);
    }
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installFixtures.toString()})();` });
    await send('Page.navigate', { url: `${origin}/tickets` });
    await until(`document.querySelector('.ticket-row') !== null`);
    await click('.ticket-row');
    await until(`location.pathname.endsWith('/conversation') && document.querySelector('#reply') !== null`);
    await until(`(() => { const list = document.querySelector('.messages'); return list.scrollHeight > list.clientHeight && list.scrollHeight - list.clientHeight - list.scrollTop < 4; })()`);
    assert.equal(await evaluate(`(() => { const composer = document.querySelector('.reply-form').getBoundingClientRect(); return composer.bottom <= innerHeight && composer.top >= 0; })()`), true);
    await evaluate(`document.querySelector('.messages').scrollTop = 80`);
    await delay(100);
    assert.equal(await evaluate(`document.querySelector('.ticket-overview') === null`), true);
    await fill('#reply', 'Retained reply draft');
    await section('overview');
    await click('.ticket-update > summary');
    await evaluate(`(() => { const select = document.querySelector('[aria-label="Ticket priority"]'); select.value = 'HIGH'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await button('Apply priority');
    await until(`document.querySelector('.ticket-heading .priority-high') !== null`);
    await evaluate(`(() => { const select = document.querySelector('[aria-label="Ticket status"]'); select.value = 'IN_PROGRESS'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await button('Apply status');
    await until(`document.querySelector('.ticket-heading .status-in_progress') !== null`);
    await section('notes'); await until(`!document.querySelector('.internal-panel button:last-child').disabled || document.querySelector('.internal-list') !== null`);
    await fill('#internal-note', 'Staff only'); await button('Save internal note');
    await until(`document.querySelector('.internal-list').textContent.includes('Staff only')`);
    await section('conversation'); assert.equal(await evaluate(`document.querySelector('#reply').value`), 'Retained reply draft');
    assert.equal(await evaluate(`Math.abs(document.querySelector('.messages').scrollTop - 80) < 4`), true);
    assert.equal(await evaluate(`document.querySelector('.internal-list').textContent.includes('agent@example.test')`), true);
    assert.equal(await evaluate(`document.querySelector('.messages').textContent.includes('Staff only')`), false);
    await section('ai'); await button('Generate AI Suggestion');
    await until(`document.querySelector('.ai-status-pending') !== null`);
    await section('conversation');
    await until(`window.__calls.filter(call => call.url.startsWith('/api/ai-suggestions/') && !call.url.endsWith('/feedback')).length >= 2`);
    await section('ai'); await until(`document.querySelector('.ai-draft') !== null`);
    assert.equal(await evaluate(`window.__calls.filter(call => call.url.endsWith('/ai-suggestions') && call.method === 'POST').length`), 1);
    await button('Edit & Send'); await fill('.ai-edit-form textarea', 'Edited grounded reply [1].');
    await section('notes'); await evaluate('history.back()');
    await until(`location.pathname.endsWith('/ai') && !document.querySelector('[data-section="ai"]').hidden`);
    assert.equal(await evaluate(`document.querySelector('.ai-edit-form textarea').value`), 'Edited grounded reply [1].');
    await button('Send edited reply'); await until(`document.querySelector('.ai-final-text') !== null`);
    await section('conversation'); await section('ai');
    assert.equal(await evaluate(`document.querySelector('.ai-final-text').textContent`), 'Edited grounded reply .');
    assert.equal(await evaluate(`document.querySelector('.ai-original-draft') !== null`), true);
    assert.equal(await evaluate(`window.__calls.filter(call => call.url.endsWith('/messages') && call.method === 'POST').length`), 0);
    await section('conversation');
    await fill('#reply', 'Reply with attachment');
    await evaluate(`(() => { const transfer = new DataTransfer(); transfer.items.add(new File(['hello'], 'test.txt', { type: 'text/plain' })); const input = document.querySelector('input[type="file"]'); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await section('overview'); await section('conversation');
    assert.equal(await evaluate(`document.querySelector('input[type="file"]').files[0].name`), 'test.txt');
    await button('Send reply'); await until(`document.querySelector('.file-row') !== null`);
    await button('Download'); await until(`window.__calls.some(call => call.url.endsWith('/download'))`);
    assert.equal(await evaluate(`window.__calls.find(call => call.url === 'https://storage.example/upload').credentials`), 'omit');
    await evaluate('window.__expireNext = true'); await section('overview');
    await click('.ticket-update > summary');
    await evaluate(`(() => { const select = document.querySelector('[aria-label="Ticket priority"]'); select.value = 'CRITICAL'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await button('Apply priority');
    await until(`document.querySelector('.ticket-heading .priority-critical') !== null`);
    assert.equal(await evaluate(`window.__calls.filter(call => call.url === '/api/auth/refresh').length`), 2);
    for (const name of ['overview', 'conversation', 'notes', 'ai']) {
      await send('Page.navigate', { url: `${origin}/tickets/ticket-1/${name}` });
      await until(`document.querySelector('[data-section="${name}"]:not([hidden])') !== null`);
      assert.equal(await evaluate(`document.querySelectorAll('.ticket-section:not([hidden])').length`), 1);
    }
    for (const width of [1440, 1280, 1024]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 768, deviceScaleFactor: 1, mobile: false });
      for (const name of ['conversation', 'overview', 'notes', 'ai']) {
        await section(name);
        assert.equal(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'), true, `Page overflow at ${width}px in ${name}`);
        assert.equal(await evaluate(`(() => { const main = document.querySelector('.app-content'); return main.scrollWidth <= main.clientWidth; })()`), true, `Content overflow at ${width}px in ${name}`);
        if (name === 'conversation') {
          assert.equal(await evaluate(`document.querySelector('.reply-form').getBoundingClientRect().bottom <= innerHeight`), true, `Composer clipped at ${width}px`);
          assert.equal(await evaluate(`document.querySelector('.messages').clientHeight >= innerHeight * 0.6`), true, `Thread receives too little height at ${width}px`);
        }
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    socket?.close(); browser.kill(); server.closeAllConnections(); await new Promise(resolveClose => server.close(resolveClose));
    // Only delete the exact temporary profile created above, inside the system temp directory.
    if (dirname(resolve(profile)) === resolve(tmpdir()) && profile.split(sep).at(-1).startsWith('ia-browser-')) {
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    }
  }
});
