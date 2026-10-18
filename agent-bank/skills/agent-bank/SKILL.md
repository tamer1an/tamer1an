---
name: agent-bank
description: Shared team memory, forum and sandbox for Claude Code, Pi (claude/argon/copilot/local roles) and the human. Use at the start of work to recall what the team already knows (`bank mem search`), to save durable facts for future sessions, to hand off or answer on the agent forum, to review memories proposed by the local model, or to run untrusted commands in a no-network sandbox.
---

# agent-bank

One SQLite bank at `/mnt/f/gems/local-memory/data/bank.db`, shared by every agent. CLI: `bank` (Node 26, on PATH).
In Claude Code you are author **claude**; your saves are `active` and you may approve proposals.

## Recall before re-deriving
```bash
bank mem search "adb serial" --scope androidauto   # scope also returns 'global'
bank mem digest --scope androidauto                # one-line index of everything active
```

## Save durable facts (not task chatter, never secrets)
```bash
bank mem save --author claude --kind project --scope androidauto \
  --title "PR #845 merged upstream" --body "Merged 2026-10-15 into v3.3.0; start new work from main." --tags pr,upstream
bank mem save ... --supersedes mem_xxx            # replace an outdated memory (old one archived)
```
Kinds: `user`, `feedback`, `project` (absolute dates + why), `reference` (paths, URLs, devices).

## Review what the local model proposed
```bash
bank mem list --status proposed
bank mem approve mem_xxx --author claude          # or: bank mem archive mem_xxx
```
Approve only facts you can verify; a wrong memory misleads every future session.

## Before saving: avoid duplicates
```bash
bank mem similar --title "..." --body "..." --scope androidauto   # near-duplicates with scores
bank mem save ... --dedupe                                        # refuse if >= 0.75 similar
```

## Delegate offline (free, local GPU) — results land on the forum, channel `delegate`
```bash
bank delegate local "summarise /path/to/logcat.txt: timeline, errors, final state" --author claude --scope androidauto
bank delegate local-deep "find the flaw in this plan: ..." --author claude     # DeepSeek-R1 32B, no tools, slow
```

## Argon (Antigravity) — second opinion / specs
`agy --conversation 1902ba86-e032-489f-bf65-7fa7daa4c62c --model gemini-4-argon-high -p="..."` (put -p last).
Headless argon cannot run shell commands (no allow-rule); give it file paths to read and relay its answers
to the forum as `--author claude` marked "Relayed from argon".

## Forum: hand off and answer
```bash
bank forum inbox claude
bank forum new --author claude --channel build --kind handoff --title "Slice 1: logcat digest" --body "@copilot ... acceptance: ..."
bank forum post thr_xxx --author claude --kind review --body "..."
bank forum resolve thr_xxx
```

## Sandbox (no network, no $HOME, no /mnt, workspace at /tmp/work)
```bash
bank sandbox run --ws exp1 -- 'node untrusted.js'
```

## Local model distiller (Ollama, free, offline)
```bash
bank distill path/to/transcript.txt --scope androidauto   # writes PROPOSED memories only
```

REST for other clients: `bank serve` → `http://127.0.0.1:7077`, header `x-bank-token: $(bank token)`.
Source and spec: `/mnt/f/gems/local-memory` (SPEC.md, README.md).
