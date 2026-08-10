# Gear VR offline revival — full recipe (SM-N950F / Note 8)

Consolidated from the live project. Paths: WSL `~/gearvr/`, Windows `C:\GearVR\`
(entry point `C:\GearVR\HANDOFF.md`). Patched sources saved under
`~/gearvr/patches/*.smali.patched`; canonical built APK `apks/oculus_patched.apk`.

## Package signing state (who's signed with what)

| Key | Packages |
|-----|----------|
| our debug key `3A:35:F4:AF…` | com.oculus.horizon, .vrshell.home, .ocms, .home |
| original Samsung key | vrsetupwizard, hmt.vrsvc, hmt.vrsystem |
| original Oculus key | vrshell, systemdriver, systemactivities, systemutilities, mediaplayer, browser |

The `com.oculus.uid` shared-user group (horizon/ocms/vrshell.home/home) was
originally signed with a **lost** debug key `57:A2:5E:46…`. Installing one member
alone → `INSTALL_FAILED_SHARED_USER_INCOMPATIBLE`. Heal by re-signing **all four**
on our key and reinstalling the set together.

## The three horizon smali patches (fixes the loop & crash)

1. **`auth/service/AuthService2.smali` → `isCallerAppTrusted()` returns true.**
   OCMSCredentialsManager binds `IAuthService2` and calls getCredentials();
   `isCallerAppTrusted()` ran `TrustedCallerVerifier.enforceTrustedCaller()` which
   threw SecurityException (our debug sig not in the trusted list) → "Oculus Core
   Mobile Service keeps stopping". Patch:
   ```smali
       const/4 v0, 0x1
       return v0
   ```
   After: getCredentials returns a null bundle (logged, non-fatal) instead of crashing.

2. **`main/StartActivity.smali` → skip FB-login NUX when unauthenticated.**
   In `newNextActivityIntent()`, right after `isUserLoggedIn()`'s `move-result v0`,
   insert `goto :cond_2` so unauthenticated users route to `main.MainActivity`
   instead of `Nux360Activity` (FB login).

3. **`main/RoadblocksHelper.smali` → `checkRoadblocks()` first instr `return-void`.**
   Skips PIN/ToS/privacy/min-version roadblocks that need dead servers.

Also (older, still valid): patch `GearVRApplicationLike.onCreate()` to catch the
SecurityException from `FirstPartySettings.querySettings()` (FirstPartySettings-
Provider is hosted by Facebook-signed `com.facebook.appmanager`, unreplaceable,
and rejects untrusted callers → null rollout token instead of crash).

## Rebuild recipe

```bash
# edit smali in /tmp/oculus_dec, then:
java -jar /tmp/apktool.jar b /tmp/oculus_dec -o out.apk
zip -d out.apk 'META-INF/*'
jarsigner -keystore apks/debug.keystore -storepass android -keypass android \
  out.apk androiddebugkey            # DEFAULT SHA256 — never -sigalg SHA1
adb install -r -d out.apk
```

## The setup flag & the mount race

- `vr_setupwizard_completed` exists in **both** `secure` and `global`; the flow
  reads **global**. Set both to 2.
- Routing (VRSetupWizard `h.smali`): value % 3 → 0 DownloadInstall(bad) / 1 dialog
  / 2 FinishActivity→Horizon (good).
- `hmt.vrsvc` SetupChecker (`age.smali`, method `AmLH`, logs "setupwizard state
  changed! 2 => 0") re-zeroes `global` on **every mount**. Win the ~7 s race by
  holding the flag at 2 → wizard reads 2 → FinishActivity→Horizon in ~0.5 s, no
  welcome. Permanent no-root hold = **Tasker** profile
  (`net.dinglisch.android.taskerm`, granted `WRITE_SECURE_SETTINGS` via
  `adb shell pm grant … android.permission.WRITE_SECURE_SETTINGS`).

## Why stereo VR still won't engage offline (the wall)

- Wear/proximity sensor must be **covered** for a stable mount (uncovered =
  `setMountState` flickers, VR never holds).
- Even stable: framework logs `GearVR not ready: not allowed to start VR Activity`
  → falls back to 2D `horizon.main.MainActivity`; VR compositor
  (vrshell/systemdriver/systemux) never starts.
- Root cause: `GearVrManagerService: setupwizard incompleted! setupWizardComplete=0`.
  SetupChecker passes only on `checkSideloadMode` OR `checkDemoMode` OR real Oculus
  account, **plus** package/signature checks (`Lub.yTqX` "vrsystem signature
  mismatch", likely tripped by our re-signing). All fail offline → re-writes 0.
- **Magic-file bypasses** (SHA-256 preimages of `/sdcard/<prefix>*` names, in
  uy.smali/sh.smali): sideload prefix `vr`→`302f1749…`; `skip`→`a6bad00877…`;
  distortion `4db02bab…`; demo `8ff035cb…`/`53e1c38d…`. ~9800 brute guesses, no
  match — Samsung-internal, not recoverable.
- Real prefs (`developer_check`, `setupwizard_skip_update_check`) live in provider
  `content://com.samsung.android.hmt.vrsvc.vr/secure/*`, gated by
  `com.samsung.android.hmt.permission.WRITE_SECURE_SETTINGS` = **signatureOrSystem**
  (ungrantable via adb). Only settable by vrsvc's own UI or **root**.

## Root plan (the definitive path)

Root the SM-N950F: Magisk-patched AP `N950FXXUGDVG5` flashed via Odin/Thor, then
patch vrsvc / set the secure provider flags directly. Firmware CLI downloaders
(samloader/samfirm) fail on Samsung's new FUS auth → get firmware via browser
(samfw.com). `usbipd-win` was uninstalled in favour of native-Windows ADB/Thor for
flashing (no USB bridging headaches).

## Connectivity gotchas

- Docking takes the USB-C port → USB ADB drops. Use WiFi ADB
  (`adb tcpip 5555`; phone was 10.0.0.14, host 10.0.0.15).
- Docking re-triggers "Allow USB debugging" each mount unless "Always allow from
  this computer" is ticked.
- Root the adb server without a password via WSL interop:
  `wsl.exe -u root -e adb start-server`.

## Tooling on this machine

- `~/gearvr/restore_gearvr.sh` — idempotent one-shot restore/verify (all checks
  green). `adb_root_up.sh`, `TASKER_WATCHDOG.md`, screenshots `vrshot*.png`,
  `mount_trace.log`, `reset_reason.log` alongside.
- Sources: `note9_install.zip` (all Oculus APKs, Note 9 set works on Note 8;
  "Oculus VR.apk" = com.oculus.home), `debug.keystore`
  (androiddebugkey / android / android), `apktool.jar`.
