import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/api/client.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
const { ApiClient } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const session = token => ({ access_token: token, token_type: 'bearer', user: { id: 'agent', name: 'Agent', email: 'agent@example.test', role: 'AGENT' } });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test('concurrent expired requests share refresh and retry with rotated token', async () => {
  let refreshes = 0;
  const sessions = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(options.credentials, 'include');
    if (url === '/api/auth/refresh') {
      refreshes++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return json(session('rotated'));
    }
    return options.headers.Authorization === 'Bearer rotated' ? json({ ok: true }) : json({ detail: 'Expired' }, 401);
  };
  const client = new ApiClient(value => sessions.push(value));
  const results = await Promise.all([client.request('/tickets?unassigned=true'), client.request('/tickets?assigned_to_me=true')]);
  assert.equal(refreshes, 1);
  assert.deepEqual(results, [{ ok: true }, { ok: true }]);
  assert.equal(sessions.at(-1).access_token, 'rotated');
});

test('failed refresh clears session and stops retry', async () => {
  let calls = 0;
  let current = session('old');
  globalThis.fetch = async () => { calls++; return json({ detail: 'Session expired' }, 401); };
  const client = new ApiClient(value => { current = value; });
  await assert.rejects(client.request('/tickets'), /Session expired/);
  assert.equal(current, null);
  assert.equal(calls, 2);
});

test('403, 404, 409 and 422 preserve useful errors without refreshing', async () => {
  for (const status of [403, 404, 409, 422]) {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return json({ detail: 'Backend explanation' }, status); };
    const client = new ApiClient(() => {});
    await assert.rejects(client.request('/tickets'), error => error.status === status && error.message === 'Backend explanation');
    assert.equal(calls, 1);
  }
});

test('login validates identity; logout clears memory', async () => {
  let current = null;
  const urls = [];
  globalThis.fetch = async (url, options) => {
    urls.push(url);
    if (url.endsWith('/login')) return json(session('access'));
    if (url.endsWith('/me')) { assert.equal(options.headers.Authorization, 'Bearer access'); return json(session('access').user); }
    return new Response(null, { status: 204 });
  };
  const client = new ApiClient(value => { current = value; });
  await client.login('agent@example.test', 'test-only');
  assert.equal(current.user.role, 'AGENT');
  await client.logout();
  assert.equal(current, null);
  assert.deepEqual(urls, ['/api/auth/login', '/api/auth/me', '/api/auth/logout']);
});
