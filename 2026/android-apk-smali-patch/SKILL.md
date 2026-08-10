---
name: android-apk-smali-patch
description: >-
  Decompile, patch, rebuild and re-sign an Android APK to change app behaviour
  without source — e.g. bypass a signature/trust check, force a branch, or strip
  a server call. Use when editing smali, running apktool, re-signing with a debug
  keystore, or fixing install failures like INSTALL_FAILED_SHARED_USER_INCOMPATIBLE
  or signature mismatches. Keywords: apktool, smali, baksmali, jarsigner,
  apksigner, debug.keystore, re-sign apk, INSTALL_FAILED_UPDATE_INCOMPATIBLE,
  sharedUserId, INSTALL_PARSE_FAILED_NO_CERTIFICATES, SHA1 disabled JDK.
---

# Android APK smali patch & re-sign

Turn "this closed app calls a dead server / rejects my build" into a working
patched APK. Verified end-to-end on Oculus/Samsung system apps.

> **Scope & ethics.** This is for devices *you own* and interop/preservation of
> abandonware whose servers are gone. Don't ship tampered builds of others' apps
> or bypass paid licensing/DRM.

## Prereqs

- `apktool` (jar), a JDK (`jarsigner`), and Android SDK build-tools for
  `apksigner`/`zipalign` (optional but preferred over jarsigner).
- A debug keystore. Standard one: alias `androiddebugkey`, storepass `android`,
  keypass `android`. Create if missing — see `references/signing.md`.

## The loop

```bash
# 1. Decompile
java -jar apktool.jar d target.apk -o work_dir

# 2. Edit smali under work_dir/smali*/...  (see patterns below)

# 3. Rebuild
java -jar apktool.jar b work_dir -o out.apk

# 4. Strip the old signature, then re-sign
zip -d out.apk 'META-INF/*'                 # remove stale CERT.RSA/SF/MANIFEST
jarsigner -keystore debug.keystore -storepass android -keypass android \
  out.apk androiddebugkey                    # default SHA256 — do NOT force SHA1

# 5. Install
adb install -r -d out.apk                     # -r replace, -d allow downgrade
```

Or just run `scripts/rebuild-resign.sh work_dir out.apk` for steps 3–5.

## Common smali patch patterns

Make a method return true / false / void (the workhorse edits):

```smali
# force boolean method to return true (e.g. isTrusted / isCallerAppTrusted)
    const/4 v0, 0x1
    return v0

# make a void guard a no-op (e.g. checkRoadblocks that hits a dead server)
    return-void
```

Skip a branch (route past a login/NUX gate) — after the `move-result` that reads
the condition, insert a `goto` to the desired label:
```smali
    invoke-...->isUserLoggedIn()Z
    move-result v0
    goto :cond_2          # jump straight to the "already handled" path
```

Find the method fast:
```bash
grep -rn "isCallerAppTrusted\|checkRoadblocks" work_dir/smali*/
```

## Install-failure decoder (the ones that actually bit us)

| Error | Meaning | Fix |
|-------|---------|-----|
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | signature differs from installed app | uninstall old, or re-sign with the *same* key it was signed with |
| `INSTALL_FAILED_SHARED_USER_INCOMPATIBLE` | app shares a `sharedUserId` with others signed by a different key | re-sign **every** app in that shared-user group with one key, reinstall all — see `references/shared-user-heal.md` |
| `INSTALL_PARSE_FAILED_NO_CERTIFICATES` | you rebuilt but didn't re-sign, or META-INF stale | strip `META-INF/*` then sign |
| `jarsigner: SHA1 ... disabled` | modern JDK disabled SHA1 | **don't** pass `-sigalg SHA1withRSA`; use the default (SHA256) |

## Gotchas

- **Always strip `META-INF/*` before signing** a rebuilt apk, or the old cert
  files linger and installs fail to parse.
- **`apktool b` can fail on resource IDs / framework**: install the device's
  framework once with `apktool if framework-res.apk` if the app uses custom res.
- **Prefer `apksigner`** (v2/v3 scheme) over `jarsigner` for Android 11+ targets;
  `zipalign -p 4` first. `references/signing.md` has both.
- **System-app reality check**: `/system/priv-app` apps can't be `adb install`-ed
  over without root; you can only sideload user copies. If the real blocker is a
  system service, no amount of user-side patching fixes it — you need root.

## Composes with

- [`wsl-android-adb-bridge`](../wsl-android-adb-bridge/) — get ADB up first.
- [`gearvr-offline-revival`](../gearvr-offline-revival/) — a fully worked example
  of this loop across a whole shared-user app group.
