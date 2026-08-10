---
name: kindle-jailbreak
description: >-
  Jailbreak a Kindle e-reader from Windows/WSL to install KOReader, KUAL, MRPI
  and block OTA updates — the safe, no-shady-tools way. Use when asked to
  jailbreak/root a Kindle, install KOReader, pick WinterBreak vs WinterBreak2,
  identify a Kindle model from its serial (DP75SDI etc.), stage the payload over
  USB, or stop a dormant Kindle from taking an OTA the moment WiFi connects.
  Keywords: Kindle jailbreak, WinterBreak, WinterBreak2, KOReader, KUAL, MRPI,
  Paperwhite PW3 DP75SDI, firmware 5.13.3, kindlepw2 vs kindlehf, OTA block,
  jb.sh developer key /etc/uks, hotfix.
---

# Kindle jailbreak (Windows/WSL-staged, no shady tools)

Get a Kindle jailbroken and loaded with open software using only the community's
transparent, auditable exploit — verified end-to-end on a Paperwhite 3 (DP75SDI)
on firmware 5.13.3. The agent does everything on the PC side; the user does the
on-device taps.

> **Scope.** For a Kindle *you own*, to run open software (KOReader) on hardware
> you paid for. The exploit used is open-source and reviewed below — no closed
> "one-click root" tools, no network callbacks.

## When to use

- "Jailbreak / root my Kindle" or "install KOReader".
- Choosing between WinterBreak and WinterBreak2 for a given firmware.
- A dormant old Kindle you don't want silently OTA-updated out of exploit range.

## Step 1 — Identify the exact model & firmware (never guess)

Model dictates which KOReader build launches; the wrong one is a brick-looking
non-boot. Read it from the device, don't assume:
```bash
# with the Kindle mounted as a USB drive (e.g. I:)
cat /mnt/i/system/version.txt 2>/dev/null           # firmware string
cat /mnt/i/system/.assets/  ...                      # or Settings→Device Info on-device
```
Map serial prefix → model (e.g. `G090` = PW3 / DP75SDI, 2015). Confirm the device
is **not already jailbroken** (no `extensions/`, `mrpackages/`, `mrinstaller/` in
root). A dormant device that never took an OTA is the lucky case. Full
model/serial/firmware matrix: `references/model-firmware-matrix.md`.

## Step 2 — Choose the exploit

| Tool | Needs | Use when |
|------|-------|----------|
| **WinterBreak** | firmware ≤ 5.18.0, **device registered** to Amazon + saved WiFi | registered, recent-ish |
| **WinterBreak2** | firmware **< 5.16.4**, **no registration** (uses the Experimental Browser) | dormant/unregistered devices — the robust pick |

For an old device dormant for years, **WinterBreak2** — betting a 5-year-old
Amazon registration still works is the fragile path. Get the authoritative README
from kindlemodding.org; don't work from memory.

## Step 3 — Pick the correct KOReader build

- **`kindlepw2`** → firmware ≤ 5.16.2 (e.g. 5.13.3). ✅ for the PW3 case.
- **`kindlehf`** → firmware ≥ 5.16.3 only.

The kindlemodding page may recommend `kindlehf` for a PW3 — that advice assumes
*modern* firmware; on 5.13.3 it gives a build that won't launch. Match the build
to the **actual** firmware, not the model.

## Step 4 — The disk-fill OTA-starvation trick (critical ordering)

Two constraints conflict:
- The **jailbreak** needs the disk **nearly full (50–90 MB free)** so the OTA
  downloader can't fetch an update that would patch the exploit.
- **KUAL/MRPI** need **~220 MB free** to install.

So: **filler on → jailbreak → tools that need space → remove filler → re-enable
airplane mode.** Keep WiFi off until after the OTA blocker is in place.

> Real gotcha observed: when free space was driven to 70 MB, the Kindle **purged
> 9 files / 314 MB from `documents`** to make room. **Back up `documents/` first.**

## Step 5 — Stage everything in one USB session

Copy per-item with verified hashes (not a bulk robocopy to the drive root):
jailbreak payload + inert post-jailbreak tools (KUAL, MRPI, renameotabin,
KOReader `kindlepw2`, OTA-blocker extension). **Hold back the hotfix `.bin` until
after** the jailbreak so the device doesn't try to install an unsigned update on
reboot. Verify each file on-device by hash before ejecting.

## Step 6 — Hand off the on-device taps

The button-presses inside the Experimental Browser are the only steps the agent
can't do. WinterBreak2 is **idempotent** (tapping 3× is harmless). Success =
`winterbreak.log` in root showing "Developer keys installed… Enabled mntus exec
flag… Finished installing jailbreak!".

## What the exploit actually does (audit before running)

- `/download` serves a **filename** carrying an XSS payload
  (`Content-Disposition: filename=<script>…sendMessage(...dialoger)</script>`).
- The download dialog renders that filename → path-traversal escape into local
  `dialoger.html` → calls the browser's `nativeBridge` with
  `source_command: "sh /mnt/us/jb.sh"`.
- `jb.sh` installs the community developer public key into `/etc/uks` so
  community-signed packages are accepted. **It also deliberately re-enables OTA**
  (so the official *hotfix* can install afterward) — which is exactly why you keep
  WiFi off and apply the OTA blocker before reconnecting.

Nothing obfuscated, no network callbacks. Read `jb.sh` yourself before staging.

## Post-jailbreak hardening

- Install the **OTA-blocker** KUAL extension (renameotabin) so future updates
  can't auto-apply.
- The Kindle may pre-queue an update as `update-<huge-number>-<uuid>.bin` — **hash
  it**; if it matches the intended hotfix it's *pending*, not installed. A leftover
  `update.bin.tmp.partial` in root means the disk-fill successfully aborted a real
  OTA grab.

## Gotchas

- **Verify firmware before choosing anything** — build/exploit selection hinges on it.
- **Back up `documents/` before the disk-fill** — the device deletes content to
  free space.
- **The final taps are physical** — the agent stages and verifies; the user taps.

## Composes with

- [`wsl-android-adb-bridge`](../wsl-android-adb-bridge/) — Kindles mount as a plain
  USB drive (no ADB needed), but the same "find the device from WSL/Windows"
  reflexes apply.
