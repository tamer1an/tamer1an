#!/usr/bin/env bash
# One-shot Android performance triage over ADB. Read-only: names the hogs,
# changes nothing. Requires a device visible to `adb devices`.
set -uo pipefail
ADB="${ADB:-adb}"
h() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

if ! $ADB get-state >/dev/null 2>&1; then
  echo "No ADB device. Bring one up first (see wsl-android-adb-bridge)."; exit 1
fi

h "Device"
$ADB shell getprop ro.product.model 2>/dev/null
$ADB shell getprop ro.build.version.release 2>/dev/null | sed 's/^/Android /'

h "Top CPU consumers"
$ADB shell top -m 10 -s cpu -n 1 2>/dev/null | sed 's/^/  /' | head -18

h "Per-process CPU (dumpsys cpuinfo)"
$ADB shell dumpsys cpuinfo 2>/dev/null | sed -n '1,15p' | sed 's/^/  /'

h "Doze / battery-optimization whitelist (who never gets throttled)"
$ADB shell dumpsys deviceidle whitelist 2>/dev/null | sed 's/^/  /'

h "Wakelocks (top)"
$ADB shell dumpsys batterystats --charged 2>/dev/null \
  | grep -iE 'wake lock|wakelock' | head -12 | sed 's/^/  /'

h "Recent churn in logcat (scans / kills / ANRs)"
$ADB logcat -d 2>/dev/null \
  | grep -iE 'onScanResult|Killing|ANR in|wakelock' | tail -25 | sed 's/^/  /'

h "Rotation setting (0=locked portrait, 1=auto)"
printf '  accelerometer_rotation = %s\n' \
  "$($ADB shell settings get system accelerometer_rotation 2>/dev/null)"

h "Done — read-only. Decide a target, then disable-user / force-stop / Doze it."
