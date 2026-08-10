---
name: android-debloat-tune
description: >-
  Diagnose and fix Android performance/battery problems and safely debloat via
  ADB — find the real CPU/wakelock hog from logs, disable bloatware without
  uninstalling, fix Doze battery-optimization whitelisting, force-stop runaway
  apps, and edit a live Tasker config to automate it. Works rooted or not. Use
  when a phone lags, drains battery, a background app pegs CPU, or you want to
  disable Samsung/OEM bloat reversibly. Keywords: pm disable-user, pm list
  packages, adb debloat, Doze whitelist dumpsys deviceidle, am force-stop,
  wakelock BLE scan, accelerometer_rotation, Tasker autobackup.xml, WRITE_SECURE_SETTINGS.
---

# Android debloat & performance tune (ADB, root-optional)

Turn "my phone is laggy/hot/draining" into a named root cause and a reversible
fix. Distilled from a live Note 8 investigation (head-unit + Home Assistant +
Gear VR stack). Diagnose from evidence — never disable blind.

## When to use

- A phone lags, overheats, or drains battery and you want the *actual* cause.
- Reversibly disable OEM/Samsung bloat without uninstalling.
- Automate a recurring fix (kill an app each session) via Tasker.

## Prereqs

ADB to the device — [`wsl-android-adb-bridge`](../wsl-android-adb-bridge/). Most
steps work **without root**; a few (editing another app's private files) need it.

## Step 1 — Find the real hog (evidence first)

```bash
adb shell top -m 10 -s cpu -n 1          # top CPU consumers by name
adb shell dumpsys cpuinfo | head -20     # per-process CPU %
adb shell dumpsys batterystats --charged | grep -iE 'wakelock|wake lock' | head
adb logcat -d | grep -iE 'GattService onScanResult|Killing|ANR|wakelock' | tail -40
```
Real examples that turned up: Home Assistant flooding `BtGatt.GattService
onScanResult` (continuous BLE scan → 63 % CPU); Google Photos
`OnDeviceFaceClusteringTask` hammering SQLite at 114 % CPU, triggered because
`USB powered: true` made it think it was safe to run heavy jobs. **Name the
process before touching anything.**

## Step 2 — Fix Doze / battery-optimization whitelisting (often the real bug)

Counter-intuitive but common: the *hog* is whitelisted from Doze (never
throttled) while the apps you *care about* aren't (killed under memory pressure).
```bash
adb shell dumpsys deviceidle whitelist            # who's exempt now
adb shell dumpsys deviceidle whitelist +com.pkg   # add (protect a foreground app)
adb shell dumpsys deviceidle whitelist -com.pkg   # remove (let a hog be throttled)
```
Whitelist the apps that must stay alive (head-unit host, Tasker); consider
removing a background hog so Doze can throttle it.

## Step 3 — Force-stop a runaway app (sticky)

```bash
adb shell am force-stop com.google.android.apps.photos
```
`force-stop` puts the app in Android's "stopped state" — it **won't auto-restart**
via implicit broadcasts until you reopen it or reboot. One force-stop holds
between sessions. (If an app must never run, uninstalling/disabling it is cleaner.)

## Step 4 — Debloat reversibly (disable, don't uninstall)

Prefer `disable-user` over `uninstall` — it's fully reversible and doesn't need
root:
```bash
adb shell pm list packages | grep -iE 'vr|gear|oculus|hmt'   # find candidates
adb shell pm disable-user --user 0 com.oculus.horizon        # reversible off
adb shell pm enable com.oculus.horizon                        # undo
# (uninstall for current user, still restorable via install-existing:)
adb shell pm uninstall -k --user 0 com.some.bloat
adb shell cmd package install-existing com.some.bloat         # restore
```
**Verify names before disabling** — coincidental matches bite: `...gearhead` is
Android Auto (keep), `...gear360editor` is a photo editor (keep), not Gear VR.
A worked disable-list for the full Oculus/Samsung VR stack is in the composing
Gear VR skill.

## Step 5 — Common concrete fixes

- **Everything snaps to portrait / rotation broken:** system
  `accelerometer_rotation` is off.
  `adb shell settings put system accelerometer_rotation 1`. Note Samsung's launcher
  has a *separate* home-screen-rotation toggle.
- **BLE-scan battery drain:** the culprit app's background scanning — throttle via
  Doze (Step 2) or its in-app settings.
- **USB-triggered heavy jobs:** apps treat `USB powered: true` as "safe to do heavy
  work"; force-stop (Step 3) or disable the job.

## Step 6 — Automate with Tasker (edit the LIVE config safely)

Tasker's XML is version- and action-code-specific — **do not write it from
memory.** Procedure that avoids corrupting the user's project:
1. `adb shell am force-stop net.dinglisch.android.taskerm` (so it can't overwrite
   mid-edit).
2. Pull the real file: `/data/data/net.dinglisch.android.taskerm/files/autobackup.xml`
   (needs root to read app-private data).
3. **Model the new profile on the user's existing profiles' exact schema** — read
   the `tv="6.6.20"` version and mirror the action codes actually present. (Codes
   are not stable across versions: e.g. code `130` was a *Hub Widget* action here,
   not "Run Shell" — verify against real data, don't assume.)
4. Insert, push back, restart Tasker.

For settings changes Tasker needs, grant it once:
`adb shell pm grant net.dinglisch.android.taskerm android.permission.WRITE_SECURE_SETTINGS`.

`scripts/android-triage.sh` runs the Step-1 diagnostics in one shot.

## Gotchas

- **`disable-user` is reversible; `uninstall` (even `--user 0`) less so** — prefer
  disable for anything you might want back.
- **Doze whitelisting cuts both ways** — protecting a hog is worse than not
  whitelisting anything.
- **Never hand-write Tasker XML from memory** — mirror the installed version's
  real schema, or you corrupt the project.

## Composes with

- [`wsl-android-adb-bridge`](../wsl-android-adb-bridge/) — get ADB up first.
- [`gearvr-offline-revival`](../gearvr-offline-revival/) — the VR-stack package
  list this debloats/re-enables.
