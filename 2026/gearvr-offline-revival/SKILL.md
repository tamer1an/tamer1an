---
name: gearvr-offline-revival
description: >-
  Revive a Samsung Gear VR headset offline after Meta/Oculus shut down the
  backing servers. Use when a Gear VR shows "Oculus…START" looping, error 210,
  DownloadInstallActivity, "Oculus Core Mobile Service keeps stopping", or won't
  leave 2D Oculus Home into stereo VR. Covers the APK/smali patch set, the
  vr_setupwizard_completed flag race, the shared-user signature heal, and the
  hard limits (needs root for true stereo VR). Keywords: Gear VR, Oculus, Note 8
  SM-N950F, com.oculus.horizon, vr_setupwizard_completed, DownloadInstallActivity
  error 210, GearVrManagerService setupwizard incompleted, Tasker WRITE_SECURE_SETTINGS.
---

# Gear VR offline revival

Meta killed the Gear VR servers; stock headsets loop on setup / hit error 210.
This is the worked recipe that got a **Note 8 (SM-N950F)** to a working offline
Oculus Home, plus an honest map of what needs root. It is highly device-specific
but the *techniques* generalise (see the composing skills).

## When to use

- Gear VR loops the "Oculus — Powered by oculus … START" welcome.
- `DownloadInstallActivity` / **error 210** / contacts dead `www2.oculus.com`.
- "Oculus Core Mobile Service keeps stopping" (com.oculus.ocms crash).
- Reaches 2D Oculus Home but **never engages stereo VR**.

## Prereqs

- ADB to the phone — set up via [`wsl-android-adb-bridge`](../wsl-android-adb-bridge/).
  Docking the headset takes the USB-C port, so plan on **WiFi ADB** (`adb tcpip 5555`).
- The APK patch loop — [`android-apk-smali-patch`](../android-apk-smali-patch/).
- Patched APK set + debug keystore. On this machine they persist at
  `~/gearvr/apks/` (WSL) and `C:\GearVR\apks\` (Windows). **Full recipe, exact
  smali patches, and root plan: `references/full-recipe.md`.**

## The mental model (why it loops)

Samsung's system service **`hmt.vrsvc`** runs a `SetupChecker` on every headset
mount. If any check fails (packages, signatures, or a real Oculus account — all
impossible offline) it **resets `global vr_setupwizard_completed` to 0**, which
routes the wizard to `DownloadInstallActivity` → dead server → error 210 → loop.

The flag's value mod 3 decides routing:
`…==0 → DownloadInstall (bad)`, `…==1 → "done" dialog`,
`…==2 → FinishActivity → Horizon directly (good)`. **Target: 2, in BOTH `secure`
and `global` (the flow reads global).**

## What works WITHOUT root (2D Oculus Home)

1. **Install the Oculus package set** (horizon, ocms, vrshell.home, home, input
   service) from the archived APKs, all re-signed with **one** debug key — the
   critical missing piece is `com.oculus.home`, whose absence makes SetupChecker
   reset the flag. Heal the `com.oculus.uid` shared-user group as one set (see
   [`android-apk-smali-patch`](../android-apk-smali-patch/) → shared-user-heal).
2. **Three horizon smali patches** (all baked into `apks/oculus_patched.apk`):
   - `auth/service/AuthService2.smali` → `isCallerAppTrusted()` returns true
     (fixes the ocms "keeps stopping" crash).
   - `main/StartActivity.smali` → skip the FB-login NUX when not logged in.
   - `main/RoadblocksHelper.smali` → `checkRoadblocks()` = `return-void`
     (skips PIN/ToS/min-version roadblocks that need dead servers).
3. **Set the flag to 2** in both namespaces:
   ```bash
   adb shell settings put secure vr_setupwizard_completed 2
   adb shell settings put global vr_setupwizard_completed 2
   ```
4. **Hold the flag through the mount.** `vrsvc` re-zeroes it on every dock; win the
   ~7 s race by holding it at 2 (an ADB watchdog proves it; the permanent no-root
   solution is a **Tasker** profile with `WRITE_SECURE_SETTINGS` granted via adb).

Result: StartActivity → **MainActivity Oculus Home** renders (Store tab dead =
expected; Library works). No crashes. This is verified.

## The hard limit — true stereo VR needs root

Even with the flag held, the framework logs `GearVR not ready: not allowed to
start VR Activity` and falls back to 2D, because `vrsvc`'s deeper checks
(`checkSideloadMode`/`checkDemoMode`/`checkOculusSetup` + signature checks) all
fail offline, and the magic-file sideload bypasses are SHA-256 gated on
Samsung-internal names (brute force failed, ~9800 guesses). The real prefs live
behind `signatureOrSystem` permission. **So: holding the flag is necessary but
not sufficient for stereo VR.** Remaining paths:

- **No-root long shot:** enable real dev mode — Settings → Apps → Gear VR Service
  → Storage → Manage Storage → tap "VR Service Version" ×6. Works on some units.
- **Definitive:** **root the SM-N950F** (Magisk-patched AP firmware via Odin/Thor),
  then set vrsvc's secure provider flags directly. `adbd cannot run as root` on the
  stock production build, so root is the only way to touch those.

Detailed patch sources, the rebuild recipe, connectivity gotchas, and the root
plan are in `references/full-recipe.md`.

## Key gotchas

- **Modern JDK disables SHA1** — sign the rebuilt APKs with the default SHA256,
  not `-sigalg SHA1withRSA`.
- **Docking re-triggers the USB-debugging RSA dialog** each time unless you tick
  "Always allow from this computer"; and it steals the USB port → use WiFi ADB.
- **`/system/priv-app/GearVRService` (vrsvc) is unpatchable without root** — it's a
  production-signed system service; you can only race its flag, not edit it.

## Composes with

- [`wsl-android-adb-bridge`](../wsl-android-adb-bridge/) · [`android-apk-smali-patch`](../android-apk-smali-patch/)
