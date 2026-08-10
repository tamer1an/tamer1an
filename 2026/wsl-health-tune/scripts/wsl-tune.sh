#!/usr/bin/env bash
# WSL tune-up for Ubuntu 26.04 (resolute) — non-destructive.
# Fixes HashiCorp repo signing key, updates packages, clears only regenerable
# cache, and enables systemd. Does NOT touch /tmp project data.
set -euo pipefail

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

# --- 1. Fix HashiCorp repo: install signing key + add Signed-By ---------------
# Skip this block if you don't use the HashiCorp repo. Self-fetches the key.
say "Installing HashiCorp signing key (fp 798AEC65...A621E701)"
install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://apt.releases.hashicorp.com/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/hashicorp.gpg
chmod 0644 /etc/apt/keyrings/hashicorp.gpg

say "Rewriting HashiCorp source with Signed-By"
cat > /etc/apt/sources.list.d/archive_uri-https_apt_releases_hashicorp_com-noble.sources <<'EOF'
Types: deb
URIs: https://apt.releases.hashicorp.com
Suites: resolute
Components: main
Signed-By: /etc/apt/keyrings/hashicorp.gpg
Enabled: yes
EOF

# --- 2. Update package metadata + upgrade (no removals) -----------------------
say "apt update"
apt-get update

say "apt upgrade (installs updates; will not remove packages)"
DEBIAN_FRONTEND=noninteractive apt-get -y upgrade

# --- 3. Clean only regenerable cruft ------------------------------------------
say "Removing orphaned auto-installed packages (autoremove)"
DEBIAN_FRONTEND=noninteractive apt-get -y autoremove

say "Clearing downloaded .deb cache (682M, regenerable)"
apt-get clean

say "Vacuuming systemd journal to 100M (keeps recent logs)"
journalctl --vacuum-size=100M || true

# --- 4. Enable systemd + sensible WSL defaults --------------------------------
say "Backing up and updating /etc/wsl.conf"
cp -a /etc/wsl.conf /etc/wsl.conf.bak.$(date +%Y%m%d%H%M%S)
cat > /etc/wsl.conf <<'EOF'
[user]
default=mate

[boot]
systemd=true

[automount]
enabled=true
options="metadata,umask=22,fmask=11"

[interop]
enabled=true
appendWindowsPath=true

[network]
generateResolvConf=true
EOF

say "Done. Disk now:"
df -h / | tail -1
echo
echo "systemd will activate after you run from Windows:  wsl --shutdown"
echo "(then reopen the WSL terminal)"
