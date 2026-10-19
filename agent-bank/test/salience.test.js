// Slice 3 (spec: argon, thr_mvefb6uz5eba07f6): salience/staleness-ranked digest (Generative Agents 2023).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { createMemoryBank, salience } from '../src/memory.js';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-19T12:00:00Z');
const at = (days) => new Date(NOW - days * DAY).toISOString();

test('salience: kind weight x half-life recency + in-scope boost (argon numbers)', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);
  close(salience({ kind: 'feedback', scope: 'global', updated_at: at(20) }, { nowMs: NOW }), 3 * 0.5 ** (20 / 90));
  close(salience({ kind: 'project', scope: 'global', updated_at: at(5) }, { nowMs: NOW }), 0.5 ** (5 / 14));
  close(salience({ kind: 'project', scope: 'aa', updated_at: at(1) }, { scope: 'aa', nowMs: NOW }), (1 + 1) * 0.5 ** (1 / 14)); // boost ages with the memory
  close(salience({ kind: 'project', scope: 'global', updated_at: at(1) }, { scope: 'aa', nowMs: NOW }), 0.5 ** (1 / 14));
  close(salience({ kind: 'user', scope: 'global', updated_at: at(-3) }, { nowMs: NOW }), 2.5); // future clock skew → no boost
});

test('digest ranks by salience, not just recency', () => {
  const db = openDb(':memory:');
  const b = createMemoryBank(db);
  const put = (title, kind, scope, days) => {
    const m = b.save({ title, body: `${title} body`, kind, scope, author: 'claude' });
    db.prepare('UPDATE memories SET updated_at=? WHERE id=?').run(at(days), m.id);
  };
  put('old feedback rule', 'feedback', 'global', 20);
  put('recent global status', 'project', 'global', 1);
  put('fresh in-scope status', 'project', 'aa', 1);
  put('newest stale-kind status', 'project', 'global', 0);
  const order = b.digest({ scope: 'aa', nowMs: NOW }).split('\n').map((l) => l.match(/\] (.*) \(mem_/)[1]);
  assert.deepEqual(order, ['old feedback rule', 'fresh in-scope status', 'newest stale-kind status', 'recent global status']);
  assert.equal(b.digest({ scope: 'aa', nowMs: NOW, limit: 2 }).split('\n').length, 2);
});

test('salience never returns NaN for a malformed date (argon review of 40b3dfe)', () => {
  assert.equal(salience({ kind: 'feedback', scope: 'global', updated_at: 'garbage' }, { nowMs: NOW }), 3);
});

test('an old in-scope status note does not outrank global rules forever (argon review, Doubt Cycle 1)', () => {
  const stale = salience({ kind: 'project', scope: 'aa', updated_at: at(365) }, { scope: 'aa', nowMs: NOW });
  const rule = salience({ kind: 'feedback', scope: 'global', updated_at: at(143) }, { scope: 'aa', nowMs: NOW });
  assert.ok(rule > stale, `${rule} > ${stale}`);
});
