# gem/skills/2026

Reusable **agent skills** distilled from real Claude, Gemini CLI, and Antigravity sessions
run on this machine (VR-HAWK, WSL2 Ubuntu + Windows 11) through 2025–2026.

Each folder is a self-contained skill in the Anthropic "Skills" format: a `SKILL.md`
with YAML frontmatter (`name`, `description`) that an agent loads, plus `scripts/` and
`references/` for detail that only loads when needed.

## Design philosophy (Addy Osmani, applied)

These follow the principles Addy Osmani lays out for AI agent skills:

1. **One skill, one capability.** Narrow and composable beats a monolith. Skills call each
   other by name instead of repeating themselves.
2. **Progressive disclosure.** `SKILL.md` stays lean (the always-loaded layer). Heavy detail,
   long recipes, and lookup tables live in `references/` and load on demand. Don't pay tokens
   for what this run doesn't need.
3. **Trigger-rich descriptions.** The `description` says *when* to reach for the skill, in the
   words a request would use — that's what the agent matches on.
4. **Deterministic work → scripts.** If a procedure is fixed, ship it as a runnable script so
   the model executes instead of re-deriving (and re-mis-deriving) it each time.
5. **Concrete over abstract.** Real commands, real paths, and the *gotcha that actually bit us*
   — not generic advice you could get anywhere.
6. **Fail-safe by default.** Anything that touches a live system is idempotent, backs up before
   it edits, and prefers reversible moves. State the blast radius up front.

## The skills

| Skill | Use it when… |
|-------|--------------|
| [`wsl-health-tune`](wsl-health-tune/) | Auditing or non-destructively tuning a WSL2 Ubuntu box (repo-key breakage, safe cleanup, systemd/`wsl.conf`). |
| [`wsl-android-adb-bridge`](wsl-android-adb-bridge/) | Getting a USB Android phone/Kindle talking to ADB from WSL2 or Windows (usbipd, rootless adb server, WiFi ADB). |
| [`android-apk-smali-patch`](android-apk-smali-patch/) | Decompiling, patching, rebuilding and re-signing an APK (smali edits, debug keystore, shared-user signature healing). |
| [`android-debloat-tune`](android-debloat-tune/) | Diagnosing an Android phone's real CPU/battery hog and fixing it via ADB (Doze whitelist, force-stop, reversible `disable-user`, live Tasker edits). |
| [`kindle-jailbreak`](kindle-jailbreak/) | Jailbreaking a Kindle from Windows/WSL (WinterBreak/WinterBreak2, KOReader, OTA-starvation, correct build selection). |
| [`local-llm-wsl`](local-llm-wsl/) | Running a local LLM (Ollama / llama.cpp) on WSL with model storage on a big drive; picking a model for the hardware; exposing it as a REST/MCP endpoint. |
| [`windows-disk-relocation`](windows-disk-relocation/) | Freeing space on C: by safely relocating temp/dev caches to another drive and clearing only regenerable cruft. |
| [`pc-performance-audit`](pc-performance-audit/) | Auditing Windows CPU/RAM/GPU, confirming XMP/high-performance is actually engaged, and recommending what to run on it. |
| [`gearvr-offline-revival`](gearvr-offline-revival/) | Reviving a Samsung Gear VR headset offline after Meta shut the servers down (the full hard-won recipe). |
| [`explain-by-analogy`](explain-by-analogy/) | Teaching an unfamiliar framework/codebase by mapping it onto what the learner already knows, in layers. |

## How an agent should use these

Read a skill's `SKILL.md` first; open `references/` and run `scripts/` only when the task
actually needs them. When two skills overlap (they cross-link), compose them rather than
inlining. Everything here was verified on this machine — but system state drifts, so
re-check paths, bus IDs, and package names against reality before you trust a value.
