# APK signing reference

## Create a debug keystore

```bash
keytool -genkeypair -v -keystore debug.keystore -alias androiddebugkey \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass android -keypass android \
  -dname "CN=Android Debug,O=Android,C=US"
```
Standard debug creds: **alias** `androiddebugkey`, **storepass/keypass** `android`.

## Sign — two ways

**jarsigner (v1 / JAR signature, fine for pre-Android-11 or system-signed flows):**
```bash
zip -d out.apk 'META-INF/*'         # strip old cert first
jarsigner -keystore debug.keystore -storepass android -keypass android \
  out.apk androiddebugkey
```
> Do **not** add `-sigalg SHA1withRSA` — modern JDKs disable SHA1 and it errors.
> The default (SHA256withRSA) is correct.

**apksigner (v2/v3 scheme, preferred for Android 11+):**
```bash
zipalign -f -p 4 out.apk out-aligned.apk
apksigner sign --ks debug.keystore --ks-pass pass:android \
  --ks-key-alias androiddebugkey --key-pass pass:android out-aligned.apk
apksigner verify --print-certs out-aligned.apk
```

## Inspect a cert (match keys across a shared-user group)

```bash
# SHA-256 fingerprint of the signer
apksigner verify --print-certs app.apk
# or from an installed package:
adb shell dumpsys package <pkg> | grep -A2 signatures
```
Two apps that share a `sharedUserId` **must** carry the same signer fingerprint.
