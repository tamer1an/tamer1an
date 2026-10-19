// Sandbox: run a command inside bubblewrap with no network, no $HOME, no Windows drives,
// and exactly one writable workspace (data/sandboxes/<name> mounted at /tmp/work).
import { spawn } from 'node:child_process';
import { mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { capture } from './capture.js';

const ROOT = join(import.meta.dirname, '..');
export const SANDBOX_ROOT = process.env.BANK_SANDBOX_ROOT ?? join(ROOT, 'data', 'sandboxes');

export function workspacePath(name = 'default') {
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(name)) throw new Error('workspace name: letters, digits, - and _ only');
  const dir = join(SANDBOX_ROOT, name);
  mkdirSync(dir, { recursive: true });
  return realpathSync(dir);
}

/** bwrap argv. Exported for tests; `network` re-enables the host network only. */
export function bwrapArgs({ workspace, network = false, nodeDir = dirname(dirname(process.execPath)) }) {
  const home = homedir();
  const args = [
    '--ro-bind', '/', '/',
    '--dev', '/dev',
    '--proc', '/proc',
    '--tmpfs', '/tmp',
    '--tmpfs', home, // hides credentials: ~/.pi, ~/.claude, ~/.ssh, ~/.ollama ...
    '--tmpfs', '/mnt', // hides Windows drives
    '--ro-bind', nodeDir, nodeDir, // keep this Node available inside
    '--bind', workspace, '/tmp/work',
    '--chdir', '/tmp/work',
    '--setenv', 'HOME', '/tmp/work',
    '--setenv', 'PATH', `${join(nodeDir, 'bin')}:/usr/local/bin:/usr/bin:/bin`,
    '--unshare-all',
    '--die-with-parent',
    '--new-session',
  ];
  if (network) args.push('--share-net');
  return args;
}

/** Run `command` (a shell string) in the sandbox. Resolves { code, stdout, stderr, timedOut, workspace }. */
export function runSandboxed(command, { workspace = 'default', network = false, timeoutMs = 60_000, signal } = {}) {
  const ws = workspacePath(workspace);
  const args = [...bwrapArgs({ workspace: ws, network }), '--', 'bash', '-lc', command];
  return new Promise((resolve, reject) => {
    const child = spawn('bwrap', args, { stdio: ['ignore', 'pipe', 'pipe'], env: { LANG: 'C.UTF-8' }, signal });
    const stdout = capture(child.stdout);
    const stderr = capture(child.stderr);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err.code === 'ENOENT' ? new Error('bwrap not installed (apt install bubblewrap)') : err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: stdout.text(), stderr: stderr.text(), timedOut, workspace: ws });
    });
  });
}
