# agent-bank — SPEC

Local, dependency-free infrastructure that lets a team of agents (Claude, Argon, Copilot, a local
Ollama model) share memory, talk to each other, and run untrusted commands safely — under the Pi
harness and Claude Code alike.

## Objective

Agents forget everything between sessions and cannot see each other's work. agent-bank gives them:

| Piece | What it is | Who uses it |
|---|---|---|
| **KV store** | localforage-compatible API (`createInstance`, `getItem`, `setItem`, `keys`, `iterate`…) on `node:sqlite` | everything below; any script |
| **Memory bank** | Durable facts (user / feedback / project / reference), full-text search, trust tiers | all agents, every session |
| **Forum** | Threads + posts for handoffs, questions, reviews; `@agent` inbox | agent ↔ agent, agent ↔ human |
| **Sandbox** | bubblewrap jail: no network, no `$HOME`, no `/mnt/*`, one writable workspace | any agent running untrusted code |
| **REST** | `127.0.0.1` HTTP API with token, for clients that cannot shell out (Windows tools, browsers later) | external clients |
| **Distiller** | Local Ollama model turns transcripts into *proposed* memories | local model, reviewed by a human/Claude |
| **Pi wiring** | Pi extension (tools + memory injected into system prompt), team role agents, Addy Osmani skills | Pi sessions |

## Decisions (2026-10-18)

1. `cloudforage` does not exist on npm → not used (also a typosquat risk).
2. `localforage` is browser-only (IndexedDB/localStorage). We keep its **API shape** and back it with
   `node:sqlite`, so a future browser forum UI can use real localforage with the same calls.
3. Node ≥ 26 (`nvm use 26`): built-in `node:sqlite` with FTS5, `node:test`, `parseArgs`. **Zero npm deps** in the bank itself;
   `tools/gist-cdp` is a separate, optional package (puppeteer-core) and nothing in `src/` imports it.
4. DB lives on `/mnt/f` (Windows drive, shared with Windows sessions) → `journal_mode=DELETE`
   + `busy_timeout`; WAL shared memory is unreliable across drvfs.
5. **Trust tiers:** memories written by `local` (small model) are always `proposed` until a
   human or Claude runs `approve`. A wrong memory is loaded every session, so it costs more than a missing one.
6. Sandbox is **not** exposed over REST (remote code execution on a port reachable from Windows).
7. REST checks the `Host` header (DNS-rebinding) and requires `x-bank-token` on every route except `/health`.
8. **Memory invariants:** FTS5 with Porter stemming; `save` refuses near-duplicates (weighted Jaccard ≥ 0.75);
   `supersedes` archives its target only when the replacement is active, and refuses an already-archived target.
9. **Digest** ranks by salience = (kind weight + 1 if in the current scope) × 0.5^(age / half-life),
   half-life 14 days for `project`, 90 for the rest (Park et al. 2023).
10. **Delegation:** `bank delegate <role> <task>` spawns Pi for that role directly and records the handoff
   and answer on the forum; a thread it opened is resolved once answered, failures stay open.
11. Child output (sandbox, delegate) is capped at 64 KB while it streams, not after exit.
12. `--author` is advisory: any local caller with a shell can claim any identity. Trust tiers guard against
   a weak model's mistakes, not against a hostile process on this machine.

## Team (Pi subagents)

| Role | Model | Job |
|---|---|---|
| `claude` | `anthropic/claude-opus-5-5` | architect: spec, plan, final review, approves memories |
| `argon` | `google/gemini-4-argon` | researcher / second opinion (doubt-driven review) |
| `copilot` | `github-copilot/gpt-5-mini` | implementer for small, well-specified slices |
| `local` | `ollama/qwen3-16k` | clerk: summarise logs/transcripts, propose memories — offline, free |
| `local-deep` | `ollama/deepseek-r1-32b-low-mem` | offline deep reasoner, no tools, thinking off; posts as `local` |

Models are one-line swaps in `pi/agents/*.md`.

## Commands

```bash
npm test                       # node --test
bin/bank.js mem search "adb"   # CLI (also: forum, sandbox, distill, kv, serve)
bin/bank.js serve              # REST on 127.0.0.1:7077
scripts/install.sh             # wire into ~/.pi/agent, ~/.claude/skills, ~/.local/bin
```

## Boundaries

- **Always:** tests for every module; data stays local; `local` writes go to `proposed`.
- **Ask first:** changing `~/.pi/agent/settings.json` beyond adding paths; any network-exposed listener
  other than 127.0.0.1.
- **Never:** store secrets in memories; give the sandbox network or `$HOME` by default.

## Success criteria

- `npm test` green.
- A Pi session sees active memories in its system prompt and can call `memory_search` / `memory_save` /
  `forum_post` / `sandbox_run`.
- `pi` subagent `local` answers via Ollama; `claude`, `argon`, `copilot` roles resolve to ready providers.
- Claude Code can use the same bank through the `bank` CLI and the `agent-bank` skill.
