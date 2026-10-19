// Smoke test for bin/bank.js: the CLI is how Claude Code and argon reach the bank, so a broken
// flag or subcommand must turn the suite red, not just the module APIs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BIN = join(import.meta.dirname, '..', 'bin', 'bank.js');
const env = { ...process.env, BANK_DB: join(mkdtempSync(join(tmpdir(), 'bank-cli-')), 'bank.db') };
const bank = (...args) => JSON.parse(execFileSync(process.execPath, [BIN, ...args, '--json'], { env, encoding: 'utf8' }));

test('cli: save, search, approve a proposal, digest', () => {
  const m = bank('mem', 'save', '--title', 'adb over wifi', '--body', 'use adb tcpip 5555', '--author', 'claude', '--kind', 'reference');
  assert.equal(m.status, 'active');
  assert.deepEqual(bank('mem', 'search', 'adb').map((r) => r.id), [m.id]);
  const p = bank('mem', 'save', '--title', 'ollama port', '--body', 'ollama listens on 11434', '--author', 'local');
  assert.equal(p.status, 'proposed');
  assert.equal(bank('mem', 'approve', p.id, '--author', 'human').status, 'active');
  const digest = execFileSync(process.execPath, [BIN, 'mem', 'digest'], { env, encoding: 'utf8' });
  assert.match(digest, new RegExp(`\\(${m.id}\\)`));
});

test('cli: forum thread, inbox, resolve', () => {
  const t = bank('forum', 'new', '--title', 'review slice', '--author', 'claude', '--body', '@argon look');
  assert.deepEqual(bank('forum', 'inbox', 'argon').map((p) => p.thread_id), [t.id]);
  bank('forum', 'resolve', t.id);
  assert.deepEqual(bank('forum', 'inbox', 'argon'), []);
});

test('cli: bad input exits non-zero with a message', () => {
  for (const args of [['bogus'], ['mem', 'save', '--title', 'x', '--body', 'y', '--author', 'bob']]) {
    const r = spawnSync(process.execPath, [BIN, ...args], { env, encoding: 'utf8' });
    assert.notEqual(r.status, 0, args.join(' '));
    assert.ok(r.stderr.trim() || r.stdout.trim(), 'explains the failure');
  }
});
