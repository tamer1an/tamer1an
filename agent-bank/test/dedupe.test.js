// Slice 2 (spec: argon, thr_mvefb6uz5eba07f6): near-duplicate detection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createMemoryBank, similarity } from '../src/memory.js';
import { distillInto } from '../src/distill.js';

const existing = { title: 'ADB carriage return stripping', body: "Always pipe adb.exe output through tr -d '\\r'.", kind: 'reference', author: 'claude' };
const sameFact = { title: 'Strip CRLF from adb.exe', body: "Pipe adb.exe calls through tr -d '\\r' to remove carriage returns.", kind: 'reference' };
const different = { title: 'ADB wireless pairing port', body: 'Wireless debugging pairs on a random port shown in Developer options.', kind: 'reference' };

test('similarity: same fact in other words >= 0.45, unrelated ADB fact well below', () => {
  assert.ok(similarity(existing, sameFact) >= 0.45, String(similarity(existing, sameFact)));
  assert.ok(similarity(existing, different) < 0.3, String(similarity(existing, different)));
  assert.equal(similarity(existing, existing), 1);
});

test('findSimilar returns ranked matches over active + proposed in scope', () => {
  const b = createMemoryBank(openDb(':memory:'));
  const m = b.save(existing);
  b.save({ ...different, author: 'local' });
  const hits = b.findSimilar(sameFact);
  assert.equal(hits[0].id, m.id);
  assert.ok(hits[0].similarity >= 0.45);
  assert.equal(b.findSimilar(sameFact, { threshold: 0.99 }).length, 0);
});

test('save({ dedupe: true }) refuses a near-duplicate unless it supersedes', () => {
  const b = createMemoryBank(openDb(':memory:'));
  const m = b.save(existing);
  assert.throws(() => b.save({ ...existing, title: 'ADB carriage returns stripping', author: 'copilot', dedupe: true }), new RegExp(`similar to ${m.id}`));
  assert.doesNotThrow(() => b.save({ ...existing, title: 'ADB carriage returns stripping', author: 'claude', dedupe: true, supersedes: m.id }));
  assert.doesNotThrow(() => b.save({ ...different, author: 'claude', dedupe: true }));
});

test('distillInto skips same-fact candidates and in-batch repeats, keeps new facts', async () => {
  const b = createMemoryBank(openDb(':memory:'));
  const m = b.save(existing);
  const fetchImpl = async () => ({ ok: true, json: async () => ({ message: { content: JSON.stringify({ memories: [sameFact, different, { ...different, title: 'ADB wireless pairing ports' }] }) } }) });
  const { saved, skipped } = await distillInto(b, 't', { fetchImpl });
  assert.deepEqual(saved.map((s) => s.title), ['ADB wireless pairing port']);
  assert.deepEqual(skipped.map((s) => s.reason), [`similar to ${m.id}`, `similar to ${saved[0].id}`]);
});

test('stemmer: silent -e and -ies inflections match (argon review of 54e3bed)', () => {
  const pair = (a, b) => similarity({ title: a }, { title: b });
  assert.equal(pair('caching', 'cache'), 1);
  assert.equal(pair('configured', 'configure'), 1);
  assert.equal(pair('retries', 'retry'), 1);
  assert.equal(pair('stripping', 'strip'), 1);
  assert.ok(pair('free', 'fre') < 1, '-ee words keep their e');
});
