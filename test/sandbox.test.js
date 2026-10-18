import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

process.env.BANK_SANDBOX_ROOT = mkdtempSync(join(tmpdir(), 'bank-sb-'));
const { runSandboxed, workspacePath } = await import('../src/sandbox.js');

test('workspace is writable and persists to the host', async () => {
  const r = await runSandboxed('echo hello > out.txt && pwd', { workspace: 't1' });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout.trim(), '/tmp/work');
  assert.equal(readFileSync(join(workspacePath('t1'), 'out.txt'), 'utf8'), 'hello\n');
});

test('home, Windows drives and network are hidden', async () => {
  const r = await runSandboxed(`ls -A ${homedir()} | grep -v '^.nvm$' | wc -l; ls -A /mnt | wc -l; getent hosts github.com >/dev/null && echo NET || echo NONET; touch /etc/x 2>/dev/null || echo RO`);
  assert.equal(r.code, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), ['0', '0', 'NONET', 'RO']);
});

test('node is available inside', async () => {
  const r = await runSandboxed('node -e "console.log(1+1)"');
  assert.equal(r.stdout.trim(), '2', r.stderr);
});

test('timeout kills the process', async () => {
  const r = await runSandboxed('sleep 5', { timeoutMs: 300 });
  assert.equal(r.timedOut, true);
});

test('workspace names cannot escape', () => {
  assert.throws(() => workspacePath('../etc'), /workspace name/);
  assert.throws(() => workspacePath(''), /workspace name/);
});
