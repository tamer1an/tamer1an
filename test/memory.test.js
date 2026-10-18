import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createMemoryBank, ftsQuery } from '../src/memory.js';

const bank = () => createMemoryBank(openDb(':memory:'));
const base = { title: 'adb output has CRLF', body: 'Always pipe adb.exe through tr -d "\\r".', kind: 'reference', scope: 'androidauto', author: 'claude' };

test('save + search ranks title matches and filters by scope (plus global)', () => {
  const b = bank();
  const hit = b.save(base);
  b.save({ ...base, title: 'Pi needs Node 26', body: 'undici crashes on Node 20', scope: 'global' });
  b.save({ ...base, title: 'unrelated adb thing', body: 'x', scope: 'other' });
  const res = b.search('adb', { scope: 'androidauto' });
  assert.deepEqual(res.map((m) => m.id), [hit.id]);
  assert.equal(b.search('undici', { scope: 'androidauto' }).length, 1, 'global memories are visible in every scope');
  assert.deepEqual(hit.tags, []);
});

test('local model writes are proposed, hidden from search until approved by claude/human', () => {
  const b = bank();
  const m = b.save({ ...base, author: 'local' });
  assert.equal(m.status, 'proposed');
  assert.equal(b.search('adb').length, 0);
  assert.equal(b.search('adb', { includeProposed: true }).length, 1);
  assert.throws(() => b.approve(m.id, 'copilot'), /can approve/);
  assert.equal(b.approve(m.id, 'human').status, 'active');
  assert.equal(b.search('adb').length, 1);
  assert.throws(() => b.approve(m.id, 'human'), /not proposed/);
});

test('supersedes archives the old memory atomically; archived never searchable', () => {
  const b = bank();
  const old = b.save(base);
  const neu = b.save({ ...base, body: 'Use tr -d "\\r" on every adb.exe call.', supersedes: old.id });
  assert.equal(b.get(old.id).status, 'archived');
  assert.deepEqual(b.search('adb').map((m) => m.id), [neu.id]);
  assert.throws(() => b.save({ ...base, supersedes: 'mem_missing' }), /no memory/);
  assert.equal(b.list().length, 1, 'failed supersede rolled back the insert');
});

test('rejects bad input and secrets', () => {
  const b = bank();
  assert.throws(() => b.save({ ...base, author: 'mallory' }), /author/);
  assert.throws(() => b.save({ ...base, kind: 'gossip' }), /kind/);
  assert.throws(() => b.save({ ...base, title: '  ' }), /title is required/);
  assert.throws(() => b.save({ ...base, body: 'api_key = abcdef1234567890' }), /secret/);
  assert.throws(() => b.save({ ...base, body: 'token ghp_abcdefghijklmnopqrstuvwxyz0123' }), /secret/);
});

test('search input cannot inject FTS syntax', () => {
  const b = bank();
  b.save(base);
  assert.equal(ftsQuery('a" OR *'), '"a" OR "OR"');
  assert.doesNotThrow(() => b.search('NEAR( "*" ) AND title:'));
  assert.deepEqual(b.search('!!!'), []);
});

test('digest and markdown export for prompts / Claude memory dirs', () => {
  const b = bank();
  const m = b.save({ ...base, tags: 'adb, Windows' });
  assert.deepEqual(m.tags, ['adb', 'windows']);
  assert.match(b.digest(), /\[reference\] adb output has CRLF/);
  const [file] = b.exportMarkdown();
  assert.equal(file.file, 'reference_adb_output_has_crlf.md');
  assert.match(file.content, /type: reference/);
});

test('search across several scopes, or all scopes with scope "*"', () => {
  const b = bank();
  b.save({ ...base, scope: 'androidauto' });
  b.save({ ...base, title: 'adb in other project', scope: 'other' });
  assert.equal(b.search('adb', { scope: ['androidauto', 'other'] }).length, 2);
  assert.equal(b.search('adb', { scope: 'nowhere' }).length, 0);
  assert.equal(b.search('adb', { scope: '*' }).length, 2);
});

test('ftsQuery de-duplicates and caps tokens so long inputs stay bounded (argon review)', () => {
  assert.equal(ftsQuery('Serial serial SERIAL'), '("Serial" OR "Serial"*)');
  const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
  assert.equal(ftsQuery(long).split(' OR "word').length - 1 <= 64, true);
  assert.equal((ftsQuery(long).match(/\(/g) ?? []).length, 32);
});
