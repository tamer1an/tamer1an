import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'bank-roles-'));
writeFileSync(join(dir, 'local.md'), '---\nname: local\ndescription: d\ntools: read, memory_search\nmodel: ollama/llama3.1-8k\n---\n\nYou are local.\n');
writeFileSync(join(dir, 'local-deep.md'), '---\nname: local-deep\nmodel: ollama/deepseek-r1-32b-low-mem\n---\nThink hard.\n');
writeFileSync(join(dir, 'broken.md'), 'no frontmatter');
// Stub "pi": echoes its argv as JSON and BANK_AGENT, so we test wiring without a model.
const stub = join(dir, 'pi-stub');
writeFileSync(stub, `#!/usr/bin/env node\nconsole.log(JSON.stringify({ argv: process.argv.slice(2), agent: process.env.BANK_AGENT, scope: process.env.BANK_SCOPE }));\nif (process.argv.some((a) => a.startsWith('FAIL'))) process.exit(3);\nif (process.argv.some((a) => a.startsWith('LEAK'))) console.log('{"name": "memory_search", "parameters": {}}');\n`);
chmodSync(stub, 0o755);
process.env.BANK_ROLES_DIR = dir;
process.env.BANK_PI_BIN = stub;

const { loadRole, piArgs, identityFor, runRole, delegate, leakedToolCall } = await import('../src/delegate.js');
const { openBank } = await import('../src/index.js');

test('loadRole parses frontmatter, tools and body; rejects bad names/files', () => {
  const r = loadRole('local');
  assert.deepEqual([r.model, r.tools, r.prompt], ['ollama/llama3.1-8k', ['read', 'memory_search'], 'You are local.']);
  assert.throws(() => loadRole('../etc'), /bad role/);
  assert.throws(() => loadRole('nobody'), /no role/);
  assert.throws(() => loadRole('broken'), /frontmatter/);
});

test('piArgs: tool allowlist, or --no-tools for reasoning-only models; task after --', () => {
  assert.deepEqual(piArgs(loadRole('local'), '-rf task').slice(-4), ['--tools', 'read,memory_search', '--', '-rf task']);
  assert.ok(piArgs(loadRole('local-deep'), 't').includes('--no-tools'));
});

test('identity: team names stay, offline roles map to local', () => {
  assert.equal(identityFor(loadRole('local')), 'local');
  assert.equal(identityFor(loadRole('local-deep')), 'local');
  assert.equal(identityFor({ name: 'x', model: 'github-copilot/gpt-5-mini' }), 'copilot');
});

test('runRole spawns pi with role args and BANK_AGENT identity', async () => {
  const r = await runRole('local-deep', 'summarise', { scope: 'androidauto' });
  const echoed = JSON.parse(r.output);
  assert.equal(r.code, 0);
  assert.equal(echoed.agent, 'local');
  assert.equal(echoed.scope, 'androidauto');
  assert.deepEqual(echoed.argv.slice(-2), ['--', 'summarise']);
});

test('delegate records the handoff and the answer on the forum', async () => {
  const bank = openBank(':memory:');
  const r = await delegate(bank, 'local', 'FAIL please', { requester: 'argon' });
  const t = bank.forum.read(r.threadId);
  assert.equal(t.channel, 'delegate');
  assert.deepEqual(t.posts.map((p) => [p.author, p.kind]), [['argon', 'handoff'], ['local', 'answer']]);
  assert.match(t.posts[1].body, /exit 3/);
  const again = await delegate(bank, 'local', 'second', { threadId: r.threadId, requester: 'claude' });
  assert.equal(again.threadId, r.threadId);
  assert.equal(bank.forum.read(r.threadId).posts.length, 4);
});

test('retries when a small model leaks a tool call as text', async () => {
  assert.equal(leakedToolCall('{"name": "memory_search", "parameters": {"q": 1}}'), true);
  assert.equal(leakedToolCall('The serial is TESTSERIAL01.'), false);
  const r = await runRole('local', 'LEAK it', { retries: 2 });
  assert.equal(r.attempts, 3, 'stub always leaks: 1 try + 2 retries');
  assert.equal((await runRole('local', 'fine')).attempts, 1);
});
