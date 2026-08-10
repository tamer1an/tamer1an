---
name: windows-disk-relocation
description: >-
  Free space on a full Windows C: drive by safely relocating temp folders and
  developer caches to another drive, and clearing only regenerable cruft. Use
  when C: is nearly full, when asked to move TEMP/TMP or npm/pip/cargo/Docker
  caches to another drive (e.g. W:), or to clean AppData\Local safely without
  losing data. Keywords: C drive full, move TEMP TMP, AppData Local cleanup,
  npm-cache, CrashDumps, setx TEMP, move dev caches, junction mklink, %LOCALAPPDATA%.
---

# Windows disk relocation & safe cleanup

Reclaim C: space in two moves: **clear** what regenerates itself, then **relocate**
the folders that will just refill. The rule from the source sessions: clean only
transient data; move personal folders through the Windows UI, never by script.

## When to use

- C: is nearly full and you need space without uninstalling apps.
- Temp/dev caches keep eating the system drive.
- "Move everything that can move from C: to W:."

## Safety model

- **Auto-clear (safe):** `%LOCALAPPDATA%\Temp`, `CrashDumps`, `npm-cache`, and
  other pure caches — transient, regenerated on demand.
- **Auto-relocate (safe):** `TEMP`/`TMP` env vars and dev tool caches (npm, pip,
  cargo, Docker) — apps recreate them at the new path.
- **Manual only (never script):** Downloads, Documents, Desktop, user profile
  folders. Move via *Properties → Location → Move* so Windows migrates the files
  and updates the known-folder registration. Scripting these risks data loss.

## Step 1 — Clear regenerable cruft

```powershell
# Safe: transient caches only
Get-ChildItem "$env:LOCALAPPDATA\Temp" -Recurse -Force -EA SilentlyContinue |
  Remove-Item -Recurse -Force -EA SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\CrashDumps\*" -Recurse -Force -EA SilentlyContinue
npm cache clean --force 2>$null
# Optional built-in: cleanmgr /sagerun, or Storage Sense
```

## Step 2 — Relocate TEMP/TMP and dev caches to W:

```powershell
New-Item -ItemType Directory -Force -Path W:\Temp | Out-Null
# User TEMP/TMP (per-user; restart shells/apps to pick up)
setx TEMP "W:\Temp"
setx TMP  "W:\Temp"
# Dev tool caches
setx NPM_CONFIG_CACHE "W:\caches\npm"
setx PIP_CACHE_DIR    "W:\caches\pip"
setx CARGO_HOME       "W:\caches\cargo"
```
Full per-tool table (yarn, pnpm, Docker, Gradle, HuggingFace, Ollama, VS Code) is
in `references/relocation-map.md`.

> **Restart shells and apps** after `setx` — running processes keep the old value.
> Some services (Docker Desktop) relocate via their own settings UI, not env vars.

## Step 3 — For anything without an env var: a directory junction

When a tool hardcodes a path under C:, move the folder and leave a junction so the
old path transparently points to the new drive:
```powershell
robocopy "C:\Old\CachePath" "W:\CachePath" /E /MOVE
mklink /J "C:\Old\CachePath" "W:\CachePath"
```
`/J` = directory junction (works cross-drive, no admin for most user paths).

## Gotchas

- **`setx` truncates values > 1024 chars** and writes to the *user* (or with `/M`,
  machine) environment — it does **not** affect the current shell. Reopen it.
- **Don't relocate `%TEMP%` onto a slow/removable drive** — build tools thrash it.
- **Junctions vs symlinks:** use `/J` (junction) for directories on local drives;
  symlinks (`/D`) need admin or Developer Mode.
- **W: must be always-present.** If it's a removable/networked drive that isn't
  mounted at boot, apps pointed at it will fail. Relocate only to fixed drives.

## Composes with

- [`wsl-health-tune`](../wsl-health-tune/) — when the space pressure is inside
  WSL's VHDX rather than on the Windows filesystem.
