# Capping WSL2 resources & reclaiming disk (Windows side)

Two different files, don't confuse them:

- **`/etc/wsl.conf`** — *inside* the distro. Boot/user/mount/interop settings.
  Written by `wsl-tune.sh`.
- **`C:\Users\<you>\.wslconfig`** — on *Windows*, global to the WSL2 VM. RAM/CPU/swap.

## `.wslconfig` template

```ini
[wsl2]
memory=8GB            # hard cap; default is 50% of host RAM and can balloon
processors=6          # logical CPUs exposed to WSL
swap=4GB
swapfile=C:\\wsl-swap.vhdx
localhostForwarding=true
sparseVhd=true        # let the ext4 VHDX return freed space (WSL 2.0+)
# guiApplications=true  # WSLg
# networkingMode=mirrored  # Win11 22H2+, better localhost/VPN behaviour
```

Apply with `wsl --shutdown` (from PowerShell/CMD), then reopen the terminal.

## Reclaiming a bloated VHDX

WSL2's disk only grows. After you free space *inside* the distro (`apt clean`,
deleting big files), the `.vhdx` on Windows stays large. To shrink it:

**Easiest (WSL 2.0+):** set `sparseVhd=true` above, `wsl --shutdown`, done — or
convert an existing distro in place:
```powershell
wsl --manage <DistroName> --set-sparse true
```

**Manual compact (any version):**
```powershell
wsl --shutdown
# find the vhdx: usually %LOCALAPPDATA%\Packages\<Distro...>\LocalState\ext4.vhdx
diskpart
```
then in diskpart:
```
select vdisk file="C:\...\ext4.vhdx"
attach vdisk readonly
compact vdisk
detach vdisk
exit
```
(Hyper-V hosts can use `Optimize-VHD -Path ... -Mode Full` instead.)

Find the exact path:
```powershell
(Get-ChildItem -Recurse "$env:LOCALAPPDATA\Packages" -Filter ext4.vhdx `
  -ErrorAction SilentlyContinue).FullName
```
