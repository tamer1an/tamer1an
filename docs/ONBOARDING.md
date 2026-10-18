# Onboarding: joining the agent-bank team

For any agent joining the team (first: **argon** in Antigravity `agy`). Read this, then `SPEC.md`.

## Who is who

| Member | Runs in | Bank identity | Can approve memories |
|---|---|---|---|
| human | you | `human` | yes |
| claude | Claude Code (`~/prj/androidauto`) | `claude` | yes |
| argon | Antigravity CLI `agy`, Gemini 4 Argon | `argon` | no |
| copilot | Pi, `github-copilot/*` (needs `/login`) | `copilot` | no |
| local | Pi, `ollama/qwen3-16k` (offline, GPU) | `local` (always *proposed*) | no |
| local-deep | Pi, `ollama/deepseek-r1-32b-low-mem` (offline, no tools) | `local` | no |

## One shared source

Everything lives in `/mnt/f/gems/local-memory` (git, branch `main`). The bank DB is `data/bank.db`.
The CLI is `bank` (on PATH, pinned to Node 26). Never fork this into a private copy: shared progress
means one repo, one DB, one forum.

## Session protocol (every session, every agent)

```bash
bank mem digest --scope <project>              # what the team knows
bank mem search "<topic>" --scope <project>     # before re-deriving anything
bank forum inbox <you>                          # who is waiting on you
```

While working:

```bash
bank mem save --author <you> --kind project|reference|feedback|user --scope <project|global> \
  --title "..." --body "... why it matters, absolute dates ..."
bank forum post <thread> --author <you> --kind answer|review|question|handoff --body "... @claude ..."
bank delegate local "summarise /path/to/log" --author <you> --scope <project>   # offline, free
bank delegate local-deep "find the flaw in this plan: ..." --author <you>        # offline, slow, no tools
bank sandbox run --ws <name> -- '<untrusted command>'                            # no net, no $HOME
```

Rules:
- Always `--author <you>`. Never write as someone else.
- Durable facts only. Never secrets (the bank refuses obvious ones; don't test it).
- Only `human`/`claude` run `bank mem approve`. Everyone may review `bank mem list --status proposed`
  and comment on the forum.

## How we change the code (Addy Osmani skills)

Skills: `~/.claude/plugins/marketplaces/addy-agent-skills/skills` and the user's own
`https://github.com/tamer1an/tamer1an/tree/master/2026` (local mirror `/mnt/f/gems/skills/2026`).

1. **spec-driven-development**: a proposal starts as a forum thread (channel `build`) with the problem,
   the evidence, and acceptance criteria. Large changes update `SPEC.md`.
2. **planning-and-task-breakdown → incremental-implementation**: one thin slice per commit.
3. **test-driven-development**: write the failing test first (`npm test`, `node:test`), then the code.
   Never weaken or skip a test to get green.
4. **doubt-driven-development / code-review-and-quality**: every slice gets a review from another member
   (`@claude` or `@argon`) before the next one starts.
5. **source-driven-development**: cite docs/URLs or file:line for claims.
6. Commit with your own attribution line. Do not push; the human pushes.

## Your first task (argon)

Deep research: **how should this memory bank get better?** Ground it in sources (papers, docs, other
agent-memory systems) and in this repo's code. Consider at least: retrieval quality (FTS5 vs local embeddings
via Ollama), memory decay and staleness, deduplication/merging, contradiction detection, evaluation (how
do we measure that recall improved?), and cross-agent conflicts. Use `bank delegate local-deep` for an offline
second opinion if useful.

Deliver on forum thread "argon: improve the memory bank" (channel `research`):
1. Ranked proposals (impact / effort / risk), each with sources.
2. The top proposal as a spec slice with acceptance criteria and the test that proves it.
3. Then implement that one slice (test first), and post the diff summary + `npm test` output for `@claude` review.
