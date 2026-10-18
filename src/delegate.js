// Delegate a task to a team role by spawning a Pi process for that role directly.
// No orchestrating model has to decide to call a tool, so it works with weak offline models and
// from any shell (Claude Code, Antigravity/argon, cron). The result is posted to the forum.
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { AGENTS } from './memory.js';

const ROOT = join(import.meta.dirname, '..');
export const ROLES_DIR = process.env.BANK_ROLES_DIR ?? join(ROOT, 'pi', 'agents');
const MAX_OUT = 64 * 1024;

/** Parse a role file: YAML-ish frontmatter (name, description, tools, model) + markdown body. */
export function loadRole(name, dir = ROLES_DIR) {
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(name)) throw new Error(`bad role name: ${name}`);
  const file = join(dir, `${name}.md`);
  if (!existsSync(file)) throw new Error(`no role ${name} in ${dir}`);
  const text = readFileSync(file, 'utf8');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: missing frontmatter`);
  const meta = Object.fromEntries(
    m[1].split('\n').map((l) => l.match(/^(\w[\w-]*):\s*(.*)$/)).filter(Boolean).map(([, k, v]) => [k, v.trim()]),
  );
  if (!meta.model) throw new Error(`${file}: model is required`);
  const tools = (meta.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean);
  return { name, model: meta.model, tools, thinking: meta.thinking, description: meta.description ?? '', prompt: m[2].trim() };
}

/** Bank identity for a role: the role name if it is a team member, else derived from the model. */
export function identityFor(role) {
  if (AGENTS.includes(role.name)) return role.name;
  if (role.model.startsWith('ollama/')) return 'local';
  if (role.model.includes('argon')) return 'argon';
  if (role.model.startsWith('github-copilot/')) return 'copilot';
  if (role.model.startsWith('anthropic/')) return 'claude';
  return 'local';
}

export function piArgs(role, task) {
  return [
    '-p', '--no-session', '--offline',
    '--model', role.model,
    // Slow reasoning models (DeepSeek-R1 ~3 tok/s) burn the whole timeout on hidden thinking otherwise.
    ...(role.thinking ? ['--thinking', role.thinking] : []),
    '--append-system-prompt', role.prompt,
    ...(role.tools.length ? ['--tools', role.tools.join(',')] : ['--no-tools']),
    '--', task,
  ];
}

/**
 * How to launch Pi: { command, args }. Pi's bin uses `#!/usr/bin/env node`, which picks Node 20 from PATH
 * in a default shell and crashes — so run its script with this process's Node (26) explicitly.
 * BANK_PI_BIN overrides (tests, other installs) and is executed directly.
 */
export function piCommand(args) {
  if (process.env.BANK_PI_BIN) return { command: process.env.BANK_PI_BIN, args };
  const sibling = join(dirname(process.execPath), 'pi');
  if (existsSync(sibling)) return { command: process.execPath, args: [realpathSync(sibling), ...args] };
  return { command: 'pi', args };
}

const cap = (s) => (s.length > MAX_OUT ? `${s.slice(0, MAX_OUT)}\n…[truncated]` : s);

/** Small local models sometimes print a tool call as text instead of making it. */
export const leakedToolCall = (out) => /^\s*\{\s*"name"\s*:\s*"[\w-]+"\s*,\s*"(parameters|arguments)"/m.test(out);

/**
 * Run `task` as `roleName`. Resolves { role, identity, code, output, stderr, timedOut, ms, attempts }.
 * Retries (default 2) when the output is a leaked, unexecuted tool call.
 */
export async function runRole(roleName, task, { retries = 2, ...opts } = {}) {
  let r;
  let attempts = 0;
  do {
    attempts++;
    r = await runOnce(roleName, task, opts);
  } while (attempts <= retries && !r.timedOut && r.code === 0 && leakedToolCall(r.output));
  return { ...r, attempts };
}

function runOnce(roleName, task, { timeoutMs = 15 * 60_000, cwd = process.cwd(), scope, signal } = {}) {
  const role = loadRole(roleName);
  const identity = identityFor(role);
  if (!String(task ?? '').trim()) throw new Error('task is required');
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const { command, args } = piCommand(piArgs(role, task));
    const child = spawn(command, args, {
      cwd,
      signal,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BANK_AGENT: identity, ...(scope && { BANK_SCOPE: scope }) },
    });
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      // Node prints ExperimentalWarning noise on stderr; keep only real lines.
      const stderr = err.split('\n').filter((l) => l && !/ExperimentalWarning|--trace-warnings/.test(l)).join('\n');
      resolve({ role: roleName, identity, code, output: cap(out.trim()), stderr: cap(stderr), timedOut, ms: Date.now() - started });
    });
  });
}

/** Delegate and record on the forum: reply in `threadId`, or open a thread in channel 'delegate'. */
export async function delegate(bank, roleName, task, { threadId, requester = 'human', ...opts } = {}) {
  const r = await runRole(roleName, task, opts);
  const status = `${r.timedOut ? 'TIMED OUT' : r.code === 0 ? 'done' : `exit ${r.code}`}${r.attempts > 1 ? `, ${r.attempts} attempts` : ''}`;
  const body = `[${roleName} via ${loadRole(roleName).model}, ${status}, ${(r.ms / 1000).toFixed(0)}s]\n\n${r.output || '(no output)'}${r.stderr ? `\n\nstderr:\n${r.stderr.slice(0, 2000)}` : ''}`;
  const thread = threadId
    ? (bank.forum.post({ threadId, author: requester, kind: 'handoff', body: `@${r.identity} ${task}` }), bank.forum.read(threadId))
    : bank.forum.open({ title: `${roleName}: ${task.slice(0, 80)}`, channel: 'delegate', author: requester, kind: 'handoff', body: `@${r.identity} ${task}` });
  const post = bank.forum.post({ threadId: thread.id, author: r.identity, kind: 'answer', body });
  return { ...r, threadId: thread.id, postId: post.id };
}
