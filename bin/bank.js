#!/usr/bin/env node
// bank — CLI for the agent bank. `bank help` for usage. Add --json to any command for raw output.
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openBank, runSandboxed, distillInto } from '../src/index.js';
import { serve, TOKEN_FILE, loadToken } from '../src/server.js';

const HELP = `bank — shared memory, forum and sandbox for agents (Node >= 26)

  mem save    --title T --body B [--kind project|user|feedback|reference] [--scope S] [--tags a,b] --author A [--supersedes ID]
  mem search  <query> [--scope S] [--limit N] [--proposed]
  mem list    [--scope S] [--status active|proposed|archived] [--kind K]
  mem show    <id>
  mem approve <id> --author human|claude
  mem archive <id>
  mem digest  [--scope S]                 compact index for prompts
  mem export  --out DIR [--scope S]        Claude-Code-style memory .md files

  forum new     --title T --author A [--channel C] [--body B] [--kind K]
  forum post    <thread> --author A --body B [--kind note|handoff|question|answer|review]
  forum show    <thread>
  forum list    [--channel C] [--status open|resolved|all]
  forum inbox   <agent>
  forum resolve <thread>

  sandbox run [--ws NAME] [--net] [--timeout SEC] -- <command...>

  distill <file|-> [--scope S] [--model M]   local Ollama model proposes memories
  kv get|set|del|keys <store> [key] [json]
  serve [--port N]                           REST on 127.0.0.1 (token in ${TOKEN_FILE})
  token                                      print the REST token

Agents: human, claude, argon, copilot, local.  Env: BANK_DB, BANK_PORT, BANK_LOCAL_MODEL, OLLAMA_HOST.`;

const { values: o, positionals: pos } = parseArgs({
  allowPositionals: true,
  options: {
    title: { type: 'string' }, body: { type: 'string' }, kind: { type: 'string' }, scope: { type: 'string' },
    tags: { type: 'string' }, author: { type: 'string' }, supersedes: { type: 'string' }, limit: { type: 'string' },
    status: { type: 'string' }, channel: { type: 'string' }, proposed: { type: 'boolean' }, out: { type: 'string' },
    ws: { type: 'string' }, net: { type: 'boolean' }, timeout: { type: 'string' }, model: { type: 'string' },
    port: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
  },
});

const need = (v, name) => v ?? fail(`--${name} is required`);
function fail(msg) {
  console.error(`bank: ${msg}`);
  process.exit(2);
}
const readInput = (f) => readFileSync(f === '-' ? 0 : f, 'utf8');

const fmtMem = (m) => `${m.id}  [${m.kind}/${m.scope}] ${m.status === 'active' ? '' : `(${m.status}) `}${m.title}\n    ${m.body.replaceAll('\n', '\n    ')}${m.tags.length ? `\n    #${m.tags.join(' #')}` : ''}  — ${m.author}`;
const fmtThread = (t) => `${t.id}  [${t.channel}] ${t.status === 'open' ? '' : '(resolved) '}${t.title}  — ${t.author}${t.post_count != null ? `, ${t.post_count} posts` : ''}`;
const fmtPost = (p) => `  ${p.created_at.slice(0, 16)} ${p.author} (${p.kind})${p.thread_title ? ` in "${p.thread_title}" ${p.thread_id}` : ''}:\n    ${p.body.replaceAll('\n', '\n    ')}`;

function out(data, human) {
  if (o.json || !human) return console.log(JSON.stringify(data, null, 2));
  const text = human(data);
  console.log(text === '' ? '(none)' : text);
}

const bank = openBank();
const [group, cmd, ...rest] = pos;

async function main() {
  if (o.help || !group || group === 'help') return console.log(HELP);
  const m = bank.memory;
  const f = bank.forum;

  if (group === 'mem') {
    switch (cmd) {
      case 'save': return out(m.save({ title: o.title, body: o.body ?? (rest[0] && readInput(rest[0])), kind: o.kind, scope: o.scope, tags: o.tags, author: need(o.author, 'author'), supersedes: o.supersedes }), fmtMem);
      case 'search': return out(m.search(rest.join(' ') || fail('query required'), { scope: o.scope, limit: Number(o.limit ?? 10), includeProposed: o.proposed }), (r) => r.map(fmtMem).join('\n'));
      case 'list': return out(m.list({ scope: o.scope, status: o.status, kind: o.kind, limit: Number(o.limit ?? 100) }), (r) => r.map(fmtMem).join('\n'));
      case 'show': return out(m.get(rest[0]) ?? fail(`no memory ${rest[0]}`), fmtMem);
      case 'approve': return out(m.approve(rest[0], need(o.author, 'author')), fmtMem);
      case 'archive': return out(m.archive(rest[0]), fmtMem);
      case 'digest': return console.log(m.digest({ scope: o.scope }) || '(no memories)');
      case 'export': {
        const dir = need(o.out, 'out');
        mkdirSync(dir, { recursive: true });
        const files = m.exportMarkdown({ scope: o.scope });
        for (const file of files) writeFileSync(join(dir, file.file), file.content);
        return console.log(`wrote ${files.length} files to ${dir}`);
      }
    }
  }

  if (group === 'forum') {
    switch (cmd) {
      case 'new': return out(f.open({ title: o.title, channel: o.channel, author: need(o.author, 'author'), body: o.body, kind: o.kind }), (t) => `${fmtThread(t)}\n${t.posts.map(fmtPost).join('\n')}`);
      case 'post': return out(f.post({ threadId: rest[0], author: need(o.author, 'author'), body: o.body ?? (rest[1] && readInput(rest[1])), kind: o.kind }), fmtPost);
      case 'show': return out(f.read(rest[0]), (t) => `${fmtThread(t)}\n${t.posts.map(fmtPost).join('\n')}`);
      case 'list': return out(f.list({ channel: o.channel, status: o.status === 'all' ? null : (o.status ?? 'open') }), (r) => r.map(fmtThread).join('\n'));
      case 'inbox': return out(f.inbox(rest[0] ?? fail('agent required')), (r) => r.map(fmtPost).join('\n'));
      case 'resolve': return out(f.resolve(rest[0]), fmtThread);
    }
  }

  if (group === 'sandbox' && cmd === 'run') {
    const command = rest.join(' ') || fail('command required after --');
    const r = await runSandboxed(command, { workspace: o.ws, network: o.net, timeoutMs: Number(o.timeout ?? 60) * 1000 });
    if (o.json) return out(r);
    process.stdout.write(r.stdout);
    process.stderr.write(r.stderr);
    if (r.timedOut) console.error(`bank: timed out after ${o.timeout ?? 60}s`);
    process.exitCode = r.code ?? 124;
    return;
  }

  if (group === 'distill') {
    const file = cmd ?? fail('file (or -) required');
    const r = await distillInto(m, readInput(file), { scope: o.scope, model: o.model, source: file === '-' ? 'stdin' : file });
    return out(r, ({ saved, skipped }) => `${saved.length} proposed (review with: bank mem list --status proposed)\n${saved.map(fmtMem).join('\n')}${skipped.length ? `\nskipped: ${skipped.map((s) => `${s.title} (${s.reason})`).join('; ')}` : ''}`);
  }

  if (group === 'kv') {
    const [store, key, json] = rest;
    const kv = bank.kv(need(store, 'store'));
    switch (cmd) {
      case 'get': return out(await kv.getItem(key));
      case 'set': return out(await kv.setItem(key, JSON.parse(json ?? 'null')));
      case 'del': return out((await kv.removeItem(key), { ok: true }));
      case 'keys': return out(await kv.keys());
    }
  }

  if (group === 'serve') {
    const port = Number(o.port ?? process.env.BANK_PORT ?? 7077);
    await serve(bank, { port });
    return console.log(`agent-bank REST on http://127.0.0.1:${port}  (header x-bank-token from ${TOKEN_FILE})`);
  }
  if (group === 'token') return console.log(loadToken());

  fail(`unknown command: ${pos.join(' ')} — try: bank help`);
}

main().catch((err) => fail(err.message));
