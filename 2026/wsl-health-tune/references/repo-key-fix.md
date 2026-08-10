# Fixing broken third-party apt repo keys (the modern way)

Ubuntu 24.04+ deprecates `apt-key`. Each third-party repo needs **(a)** a dearmored
keyring in `/etc/apt/keyrings/` and **(b)** a `Signed-By:` pointing at it. Symptoms of
a break: `NO_PUBKEY`, `the following signatures couldn't be verified`, or
`repository is not signed`.

## General recipe

```bash
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL <VENDOR_GPG_URL> | sudo gpg --dearmor -o /etc/apt/keyrings/<vendor>.gpg
```

Then make the source (deb822 `.sources` form, preferred) reference it:

```
Types: deb
URIs: <REPO_URL>
Suites: <codename>          # e.g. noble, resolute — match your release
Components: main
Signed-By: /etc/apt/keyrings/<vendor>.gpg
Enabled: yes
```

Save as `/etc/apt/sources.list.d/<vendor>.sources`, then `sudo apt-get update`.

If a legacy one-line `deb [signed-by=...] URL codename main` entry exists in
`/etc/apt/sources.list` or `*.list`, delete/​comment it so it doesn't shadow the new one.

## Concrete: HashiCorp (the one that broke here)

```bash
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor \
  -o /etc/apt/keyrings/hashicorp.gpg
```
`.sources`:
```
Types: deb
URIs: https://apt.releases.hashicorp.com
Suites: resolute
Components: main
Signed-By: /etc/apt/keyrings/hashicorp.gpg
Enabled: yes
```

## Other common vendors

| Vendor | GPG URL | Suite note |
|--------|---------|-----------|
| Docker | `https://download.docker.com/linux/ubuntu/gpg` | use Ubuntu codename |
| NodeSource | `https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key` | `nodistro` |
| Kubernetes | `https://pkgs.k8s.io/core:/stable:/vX.Y/deb/Release.key` | `/` suite |
| Microsoft | `https://packages.microsoft.com/keys/microsoft.asc` | per-product |

## Verify a key fingerprint before trusting it

```bash
gpg --show-keys /etc/apt/keyrings/<vendor>.gpg   # compare fp against vendor docs
```
