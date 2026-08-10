#!/usr/bin/env bash
# Rebuild a decompiled apktool dir, re-sign with a debug keystore, install.
# Usage: rebuild-resign.sh <work_dir> <out.apk> [keystore]
# Env:  APKTOOL=/path/apktool.jar  KS_PASS=android  KEY_ALIAS=androiddebugkey
set -euo pipefail
WORK="${1:?work_dir}"; OUT="${2:?out.apk}"; KS="${3:-debug.keystore}"
APKTOOL="${APKTOOL:-apktool.jar}"
KS_PASS="${KS_PASS:-android}"; KEY_ALIAS="${KEY_ALIAS:-androiddebugkey}"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# Create a debug keystore if the named one is missing.
if [ ! -f "$KS" ]; then
  step "No keystore at $KS — generating a debug keystore"
  keytool -genkeypair -v -keystore "$KS" -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -dname "CN=Android Debug,O=Android,C=US"
fi

step "Rebuilding $WORK -> $OUT"
if command -v apktool >/dev/null 2>&1; then apktool b "$WORK" -o "$OUT"
else java -jar "$APKTOOL" b "$WORK" -o "$OUT"; fi

step "Stripping stale signature (META-INF/*)"
zip -q -d "$OUT" 'META-INF/*' || true

if command -v apksigner >/dev/null 2>&1; then
  step "Signing with apksigner (v2/v3)"
  command -v zipalign >/dev/null 2>&1 && { zipalign -f -p 4 "$OUT" "$OUT.aligned"; mv "$OUT.aligned" "$OUT"; }
  apksigner sign --ks "$KS" --ks-pass "pass:$KS_PASS" --ks-key-alias "$KEY_ALIAS" \
    --key-pass "pass:$KS_PASS" "$OUT"
else
  step "Signing with jarsigner (default SHA256 — never force SHA1 on modern JDK)"
  jarsigner -keystore "$KS" -storepass "$KS_PASS" -keypass "$KS_PASS" "$OUT" "$KEY_ALIAS"
fi

step "Installing (-r replace, -d allow downgrade)"
adb install -r -d "$OUT" || {
  echo "Install failed — see the decoder table in SKILL.md (shared-user? uninstall old first?)"; exit 1; }
step "Done: $OUT installed"
