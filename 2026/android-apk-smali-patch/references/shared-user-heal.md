# Healing a shared-user signature group

## The failure

`INSTALL_FAILED_SHARED_USER_INCOMPATIBLE` when installing one app that declares
`android:sharedUserId="com.example.uid"`. Android requires **every** package in a
shared-user group to be signed by the **same** key. If the installed group was
signed by key A (often a *lost* original debug key) and you re-sign one member
with your key B, the install is rejected.

## Diagnose

```bash
# which packages share the uid?
adb shell dumpsys package | grep -B2 "sharedUser=com.example.uid"
# what key is each currently signed with?
adb shell dumpsys package <pkg> | grep -A2 signatures
```

## Heal — re-sign the WHOLE group on one key

1. Collect APKs for **all** members of the shared-user group.
2. Re-sign every one with the *same* keystore (see `signing.md`).
3. Uninstall the members that block the swap, then install the full set together:

```bash
# example: an Oculus/uid group of four
for p in com.oculus.horizon com.oculus.ocms com.oculus.vrshell.home com.oculus.home; do
  adb uninstall "$p" 2>/dev/null || true
done
for a in horizon ocms vrshell.home home; do
  adb install -r -d "apks/${a}.apk"       # all signed with the same key
done
```

## Worked case (Gear VR)

The device's `com.oculus.uid` group (horizon / vrshell.home / ocms / home) was
signed with a **lost** debug key `57:A2:5E:46…`; our keystore was `3A:35:F4:AF…`.
Installing horizon alone → `SHARED_USER_INCOMPATIBLE`. Fix: uninstall
vrshell.home + ocms + home, reinstall all four from the one `3A:35` set. After
that the group was internally consistent and installs succeeded.
