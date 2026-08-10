#!/usr/bin/env bash
# Read-only WSL2 Ubuntu health audit. Changes nothing. Safe to run anytime.
set -uo pipefail
h() { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

h "Distro / kernel"
( lsb_release -ds 2>/dev/null; uname -r ) | sed 's/^/  /'
grep -qi microsoft /proc/version && echo "  (running under WSL)"

h "Disk"
df -h / /mnt/wsl 2>/dev/null | sed 's/^/  /'

h "Memory / swap"
free -h | sed 's/^/  /'

h "Uptime / load"
uptime | sed 's/^/  /'

h "Biggest reclaimable space"
printf '  apt .deb cache : %s\n' "$(du -sh /var/cache/apt/archives 2>/dev/null | cut -f1)"
printf '  journald logs  : %s\n' "$(journalctl --disk-usage 2>/dev/null | grep -o '[0-9.]*[KMG].*' || echo n/a)"
printf '  ~/.cache       : %s\n' "$(du -sh "$HOME/.cache" 2>/dev/null | cut -f1)"
echo "  largest node_modules under \$HOME (top 5):"
find "$HOME" -maxdepth 5 -name node_modules -type d -prune 2>/dev/null \
  | xargs -r du -sh 2>/dev/null | sort -rh | head -5 | sed 's/^/    /'

h "systemd"
if pidof systemd >/dev/null 2>&1; then
  echo "  systemd is PID1 (enabled)"
  systemctl --failed --no-legend 2>/dev/null | sed 's/^/  FAILED: /' || true
else
  echo "  systemd NOT running — add [boot] systemd=true to /etc/wsl.conf"
fi

h "Broken / third-party apt sources"
sudo apt-get update -o Debug::Acquire::gpgv=false 2>&1 \
  | grep -iE 'NO_PUBKEY|not signed|Signed-By|Err:|W:' | sed 's/^/  /' \
  || echo "  apt update clean"

h "Done — this was read-only. Nothing was changed."
