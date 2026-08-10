---
name: wsl-health-tune
description: >-
  Audit and non-destructively tune a WSL2 Ubuntu instance. Use when asked to
  "check WSL health", diagnose a slow/broken WSL, fix apt errors from a broken
  repo signing key (HashiCorp, Docker, etc.), safely free disk space without
  deleting project data, or enable systemd and sane /etc/wsl.conf defaults.
  Keywords: WSL, WSL2, Ubuntu health, apt update NO_PUBKEY, autoremove, journald,
  wsl.conf, systemd, .wslconfig, vmmem memory.
---

# WSL2 health check & non-destructive tune-up

Diagnose a WSL2 Ubuntu box and apply only **reversible, non-destructive** fixes.
The prime directive from the sessions this came from: *tune without deletion,
except regenerable cache.* Never remove packages or project data to free space.

## When to use

- "Check my WSL Ubuntu health / suggest optimizations."
- `apt update` fails with `NO_PUBKEY` / `Signed-By` / missing-key errors.
- WSL feels slow, eats RAM, or the disk is full.
- systemd services aren't running under WSL.

## Blast radius

Read-only audit is safe. The tune step **edits `/etc/wsl.conf`** (backed up first),
clears apt/journal cache, and runs `autoremove` (orphans only). It never touches
`/tmp`, `/home`, or `/mnt`. A WSL restart (`wsl --shutdown` from Windows) is needed
for `wsl.conf` and memory-cap changes to take effect.

## Steps

### 1. Audit (read-only)
Run the collector to get a one-shot picture:
```bash
bash scripts/wsl-audit.sh
```
It reports: distro/kernel, disk (`df -h`), memory (`free -h`), uptime, the biggest
space hogs (apt cache, journal, `~/.cache`, node_modules), systemd status, and any
broken apt sources. Read it before changing anything.

### 2. Fix broken repo keys (the #1 apt failure here)
Modern Ubuntu rejects `apt-key`; each third-party repo needs a keyring file plus a
`Signed-By:` line in its `.sources`. For HashiCorp specifically:
```bash
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor \
  -o /etc/apt/keyrings/hashicorp.gpg
```
then ensure the `.sources` file points at it — see `references/repo-key-fix.md`
for the exact file template and how to generalise to Docker/NodeSource/etc.

### 3. Non-destructive tune
```bash
sudo bash scripts/wsl-tune.sh
```
This: fixes the HashiCorp key, `apt update && apt upgrade` (no removals),
`autoremove` (orphans), `apt clean` (regenerable .deb cache), vacuums journald to
100 MB, and writes a systemd-enabled `/etc/wsl.conf` (backing up the old one).

### 4. Cap runaway memory (Windows side)
If `vmmem`/WSL hogs RAM, create/edit `C:\Users\<you>\.wslconfig` — see
`references/wslconfig.md` for a sensible template (memory cap, swap, `sparseVhd`).
Then `wsl --shutdown` and relaunch.

## Gotchas

- **`journalctl --vacuum` needs systemd already running.** If systemd was just
  enabled, restart WSL first, then vacuum.
- **`apt clean` is safe; `apt autoclean`+`autoremove` are safe.** `apt purge` and
  removing "unused" kernels/packages are **not** — don't, per the no-deletion rule.
- **Disk doesn't shrink on its own.** WSL2's ext4 VHDX only grows. To reclaim
  freed space you must compact the VHDX from Windows (`diskpart` / `Optimize-VHD` /
  `wsl --manage <distro> --set-sparse true`) — see `references/wslconfig.md`.
- **`generateResolvConf=true` + a custom `/etc/resolv.conf`** conflict; pick one.

## Composes with

- [`windows-disk-relocation`](../windows-disk-relocation/) — when the space
  pressure is really on the Windows C: drive, not inside WSL.
