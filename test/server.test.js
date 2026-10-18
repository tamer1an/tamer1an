import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { openBank } from '../src/index.js';
import { createHandler } from '../src/server.js';

let server;
let base;
const token = 't0ken-for-tests-0123456789';
let port;

before(async () => {
  const bank = openBank(':memory:');
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  server.on('request', createHandler(bank, { token, port }));
  base = `http://127.0.0.1:${port}`;
});
after(() => server.close());

const call = (path, { method = 'GET', body, auth = true, headers = {} } = {}) =>
  fetch(base + path, {
    method,
    headers: { ...(auth && { 'x-bank-token': token }), ...(body && { 'content-type': 'application/json' }), ...headers },
    body: body && JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: await r.json() }));

test('health is open, everything else needs the token', async () => {
  assert.equal((await call('/health', { auth: false })).status, 200);
  assert.equal((await call('/memories', { auth: false })).status, 401);
  assert.equal((await call('/memories', { headers: { 'x-bank-token': 'wrong' } })).status, 401);
});

test('rejects foreign Host headers (DNS rebinding)', async () => {
  const { request } = await import('node:http');
  const status = await new Promise((resolve) => {
    request({ host: '127.0.0.1', port, path: '/health', headers: { host: 'evil.example:80' } }, (r) => resolve(r.statusCode)).end();
  });
  assert.equal(status, 421);
});

test('memory + forum + kv round trip', async () => {
  const saved = await call('/memories', { method: 'POST', body: { title: 'REST works', body: 'via curl', author: 'copilot', kind: 'reference' } });
  assert.equal(saved.status, 201);
  assert.equal((await call('/memories?q=curl')).json[0].id, saved.json.id);
  assert.match((await call('/memories/digest')).json.digest, /REST works/);

  const t = await call('/forum/threads', { method: 'POST', body: { title: 'hi', author: 'argon', body: '@claude ping' } });
  await call(`/forum/threads/${t.json.id}/posts`, { method: 'POST', body: { author: 'claude', body: 'pong', kind: 'answer' } });
  assert.equal((await call(`/forum/threads/${t.json.id}`)).json.posts.length, 2);
  assert.equal((await call('/forum/inbox/claude')).json.length, 1);

  await call('/kv/state/last%20run', { method: 'PUT', body: { value: { ok: 1 } } });
  assert.deepEqual((await call('/kv/state/last%20run')).json, { ok: 1 });
  assert.deepEqual((await call('/kv/state')).json, ['last run']);
});

test('errors are JSON with useful status', async () => {
  assert.equal((await call('/memories', { method: 'POST', body: { title: 'x', body: 'y', author: 'nobody' } })).status, 400);
  assert.equal((await call('/memories/mem_missing')).status, 404);
  assert.equal((await call('/sandbox/run', { method: 'POST', body: { cmd: 'id' } })).status, 404, 'sandbox is not exposed');
  const r = await fetch(base + '/memories', { method: 'POST', headers: { 'x-bank-token': token, 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(r.status, 415);
});
