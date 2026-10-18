import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createMemoryBank } from '../src/memory.js';
import { distillInto, proposeMemories } from '../src/distill.js';

const fakeOllama = (memories, capture = {}) => async (url, init) => {
  capture.url = url;
  capture.body = JSON.parse(init.body);
  return { ok: true, json: async () => ({ message: { content: JSON.stringify({ memories }) } }) };
};

test('sends schema-constrained request with GPU-sized context', async () => {
  const cap = {};
  await proposeMemories('x'.repeat(50_000), { fetchImpl: fakeOllama([], cap) });
  assert.match(cap.url, /\/api\/chat$/);
  assert.equal(cap.body.options.num_ctx, 8192);
  assert.equal(cap.body.format.required[0], 'memories');
  assert.ok(cap.body.messages[1].content.length < 21_000, 'long transcripts are trimmed to the tail');
});

test('drops malformed candidates from a drifting small model', async () => {
  const out = await proposeMemories('t', {
    fetchImpl: fakeOllama([{ kind: 'project', title: 'ok', body: 'fine' }, { kind: 'gossip', title: 'x', body: 'y' }, { kind: 'user', title: '', body: 'y' }, null]),
  });
  assert.deepEqual(out.map((m) => m.title), ['ok']);
});

test('saves as proposed, skips duplicates and secrets', async () => {
  const bank = createMemoryBank(openDb(':memory:'));
  bank.save({ title: 'Existing', body: 'b', author: 'claude' });
  const { saved, skipped } = await distillInto(bank, 't', {
    fetchImpl: fakeOllama([
      { kind: 'project', title: 'existing', body: 'dup' },
      { kind: 'reference', title: 'Ollama store on W:', body: 'Models live in W:\\ollama_models.', tags: ['ollama'] },
      { kind: 'reference', title: 'leak', body: 'password: hunter2hunter2' },
    ]),
  });
  assert.deepEqual(saved.map((m) => [m.title, m.status, m.author]), [['Ollama store on W:', 'proposed', 'local']]);
  assert.deepEqual(skipped.map((s) => s.title), ['existing', 'leak']);
});

test('surfaces non-JSON and HTTP errors', async () => {
  await assert.rejects(proposeMemories('t', { fetchImpl: async () => ({ ok: true, json: async () => ({ message: { content: 'nope' } }) }) }), /non-JSON/);
  await assert.rejects(proposeMemories('t', { fetchImpl: async () => ({ ok: false, status: 404, text: async () => 'model not found' }) }), /404/);
});
