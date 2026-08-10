---
name: wsl-android-adb-bridge
description: >-
  Get a USB-connected Android device (phone, tablet, Kindle) talking to ADB from
  WSL2 or Windows. Use when adb can't see a device under WSL, when setting up
  usbipd-win to forward USB into WSL, when you hit permission-denied on
  /dev/bus/usb, when the "Allow USB debugging" RSA prompt won't stick, or when
  USB is unavailable and you need wireless ADB. Keywords: adb, usbipd, WSL USB
  passthrough, adb devices empty, no permissions (user in plugdev group), adb
  tcpip 5555, adb pair, Kindle root, Samsung debug bridge.
---

# WSL2 ⇄ Windows Android ADB bridge

WSL2 has no native USB stack, so a phone plugged into the PC is invisible to
`adb` inside WSL until you bridge it. This skill covers the three working paths,
in order of preference, plus the permission trick that avoids needing a sudo
password.

## When to use

- `adb devices` is empty inside WSL though the phone is plugged in.
- You need to script ADB against a phone/Kindle from Linux tooling.
- USB port is taken (e.g. a headset dock) and you need ADB anyway.

## Decision: which path?

1. **Just use Windows ADB via interop** — simplest, no bridge. Works because WSL
   can call `adb.exe`. Best when your scripts don't care whether adb is native.
2. **usbipd-win** — forwards the raw USB device into WSL so *native* Linux `adb`
   owns it. Use when you need Linux-native adb (udev rules, native tools).
3. **Wireless ADB (`adb tcpip`)** — no USB at all. Use when the USB port is
   occupied or usbipd keeps dropping.

## Path 1 — Windows ADB from WSL (zero setup)

```bash
adb.exe devices        # WSL interop calls the Windows adb.exe directly
```
Accept the RSA prompt on the phone. If you want a bare `adb` to resolve to it,
alias it. Done — nothing to install in Linux.

## Path 2 — usbipd-win (native Linux adb)

On **Windows** (admin PowerShell), install once:
```powershell
winget install --id dorssel.usbipd-win -e
```
Then per session:
```powershell
usbipd list                       # find the phone's BUSID (e.g. 2-4)
usbipd bind    --busid <BUSID>    # admin, once per device
usbipd attach  --wsl --busid <BUSID>
```
Inside **WSL**:
```bash
lsusb                             # phone should now appear
adb kill-server && adb start-server
adb devices
```

### The permission trick (no sudo password)
usbipd exposes the phone as a **root-owned** node under `/dev/bus/usb/...` (mode
600; WSL runs no udev to relax it). Instead of chasing udev rules, run the adb
**server** as root via WSL interop — this gives uid 0 with no password:
```bash
wsl.exe -u root -e adb start-server
adb devices    # your normal non-root client now talks to it on tcp:5037
```

### usbipd gotchas
- **BUSID changes** when you replug or use a different port. Re-run `usbipd list`.
- **"Device in error state" on attach** = stale enumeration. Fix:
  `usbipd detach --busid <B>; usbipd unbind --busid <B>; usbipd bind --busid <B>;
  usbipd attach --wsl --busid <B>`.
- Attaching a device **removes it from Windows** until detached — Windows ADB
  won't see it simultaneously.

## Path 3 — Wireless ADB

Over USB once (any path above), then cut the cord:
```bash
adb tcpip 5555
adb connect <PHONE_IP>:5555      # e.g. 10.0.0.14:5555
```
Android 11+ can pair fully wirelessly (Developer options → Wireless debugging →
Pair device with code):
```bash
adb pair <PHONE_IP>:<PAIR_PORT>   # enter the 6-digit code
adb connect <PHONE_IP>:5555
```
Wireless ADB survives a USB port being taken over (the exact scenario that made a
docked Gear VR drop its USB ADB — see the composing skill below).

## RSA prompt won't persist?

Tick **"Always allow from this computer"** in the on-phone dialog. If it never
appears: toggle *Developer options → USB debugging* off/on, replug, and confirm
the same adb server (same host key `~/.android/adbkey`) is the one connecting —
switching between Windows adb and WSL-root adb presents different keys and
re-prompts.

## Quick helper

`scripts/adb-find.sh` walks the three paths in order and reports the first that
sees a device.

## Composes with

- [`android-apk-smali-patch`](../android-apk-smali-patch/) — once ADB is up,
  install/patch APKs.
- [`gearvr-offline-revival`](../gearvr-offline-revival/) — heavy real-world user
  of the wireless-ADB fallback.
