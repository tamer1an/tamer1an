#!/usr/bin/env bash
# Try the three ADB paths in order; report the first that sees a device.
# Read-only: does not bind/attach usbipd (that needs Windows admin) — it only
# probes what's already reachable.
set -uo pipefail
ok() { printf '\033[1;32m[OK]\033[0m %s\n' "$*"; }
no() { printf '\033[1;33m[--]\033[0m %s\n' "$*"; }

show() { "$1" devices 2>/dev/null | awk 'NR>1 && $2=="device"{print "    "$0}'; }
has()  { [ -n "$("$1" devices 2>/dev/null | awk 'NR>1 && $2=="device"')" ]; }

echo "== Path 1: Windows adb.exe via WSL interop =="
if command -v adb.exe >/dev/null 2>&1 && has adb.exe; then
  ok "adb.exe sees a device:"; show adb.exe; exit 0
else no "no device via adb.exe"; fi

echo "== Path 2: native Linux adb (needs usbipd already attached) =="
if command -v adb >/dev/null 2>&1; then
  if ! has adb; then
    no "native adb sees nothing; retrying with root server (usbipd node is 600)"
    wsl.exe -u root -e adb start-server 2>/dev/null || true
  fi
  if has adb; then ok "native adb sees a device:"; show adb; exit 0
  else no "native adb still empty — run 'usbipd attach --wsl --busid <B>' on Windows"; fi
else no "native adb not installed (sudo apt-get install -y adb)"; fi

echo "== Path 3: wireless adb =="
if command -v adb >/dev/null 2>&1; then
  echo "  If you know the phone IP:  adb connect <IP>:5555"
  echo "  (enable first over USB with: adb tcpip 5555)"
fi
no "no device found on any path"; exit 1
