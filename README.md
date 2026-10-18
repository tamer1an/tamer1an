# agent-bank

Shared memory, forum, sandbox and REST API for a team of agents — **claude**, **argon**, **copilot**,
**local** (Ollama) and the **human** — under the [Pi](https://pi.dev) harness and Claude Code.
Zero npm dependencies: Node 26 built-ins only (`node:sqlite` + FTS5, `node:test`, `node:http`).
Design and decisions: [SPEC.md](SPEC.md).

```bash
nvm use 26
npm test                    # 27 tests: kv, memory, forum, sandbox, distill, REST
scripts/install.sh          # wire into ~/.pi/agent, ~/.claude/skills, ~/.local/bin/bank
```

## What you get

| Piece | Code | Use it from |
|---|---|---|
| localforage-compatible KV | `src/kv.js` | `import localforage, { createInstance } from 'agent-bank/kv'` · `bank kv` · `/kv/:store/:key` |
| Memory bank (FTS, trust tiers, supersede) | `src/memory.js` | Pi tools `memory_search`/`memory_save` · `bank mem` · `/memories` |
| Forum (threads, @mentions, inbox) | `src/forum.js` | Pi tools `forum_post`/`forum_read` · `bank forum` · `/forum/...` |
| Sandbox (bubblewrap, no net/home/mnt) | `src/sandbox.js` | Pi tool `sandbox_run` · `bank sandbox run` (not on REST, by design) |
| Distiller (Ollama → proposed memories) | `src/distill.js` | `bank distill <file>` · `local` agent |
| REST (127.0.0.1, token, Host check) | `src/server.js` | `bank serve`, header `x-bank-token: $(bank token)` |
| Pi extension | `pi/extension/index.ts` | injects memory digest + inbox into every run; `/bank` command |
| Team roles | `pi/agents/*.md` | `subagent` tool; `/team-build`, `/team-review`, `/logcat-digest` |
| Claude Code skill | `skills/agent-bank/SKILL.md` | `~/.claude/skills/agent-bank` |

## Trust model

- Identity comes from the **model**, not a parameter: a Pi run on `ollama/*` is `local`, `github-copilot/*` is
  `copilot`, `*argon*` is `argon`, `anthropic/*` is `claude`; anything unknown is `local`. Override with `BANK_AGENT`.
- `local` writes are **proposed**; only `human`/`claude` can `approve`. Archived memories never resurface.
- Secret-looking text (API keys, tokens, private keys) is refused at save time.
- The sandbox hides `$HOME` (so `~/.pi/agent/auth.json`, `~/.ssh` …), `/mnt/*` and the network.

## Team

| Role | Model (edit `pi/agents/<role>.md`) | Status 2026-10-18 |
|---|---|---|
| claude | `anthropic/claude-opus-5-5` | Pi → Anthropic needs *extra usage* (third-party app). Claude Code itself works as **claude** via `bank` + skill. |
| argon | `google/gemini-4-argon` (also `github-copilot/gemini-4-argon`) | Google key is IP-restricted; allow your IP or use the Copilot route. |
| copilot | `github-copilot/gpt-5-mini` | Pi holds a PAT; Copilot needs OAuth → run `pi`, then `/login` → GitHub Copilot. |
| local | `ollama/llama3.1-8k` | ✅ works — free, offline, ~24 tok/s on RTX 3070 |

`llama3.1-8k` is `llama3.1` with `num_ctx 8192`: the Ollama app's 128k default puts the whole KV cache
on CPU (0/33 layers on GPU, ~5 tok/s).

## Layout

```
src/        kv, db, memory, forum, sandbox, distill, server, index
bin/        bank CLI
pi/         extension, agents (roles), prompts (team workflows)
skills/     Claude Code skill
scripts/    install.sh
test/       node:test suites
data/       bank.db, token, sandboxes/   (git-ignored)
```
