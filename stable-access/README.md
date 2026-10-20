# stable-access

Reach this machine's agent-bank REST API (`:7077`) and Ollama (`:11434`) at one fixed name, `bank`,
from your laptop, phone or another PC, even when the machine's LAN or Wi-Fi IP changes or it
moves to a different network.

## The problem, stated precisely

An IP address is a location, not an identity. DHCP leases, a new router, tethering or travel all
change it, and anything that saved `10.0.0.15` breaks. What we actually want is:

1. **A stable identity** for this machine that doesn't depend on where it is plugged in.
2. **Reachability** through NAT and changing networks, with no router configuration.
3. **No new attack surface.** Both services bind to loopback on purpose, and agent-bank also
   checks `Host` and requires a token. A fix that weakens these is a regression.

## Options weighed

| Option | Stable identity | Works off-LAN | Exposure | Moving parts | Verdict |
|---|---|---|---|---|---|
| Static IP or DHCP reservation | LAN only | no | LAN | router config | Fixes one network only |
| mDNS `<pc>.local` | LAN only | no | LAN | none | Good zero-cost LAN fallback |
| Dynamic DNS + port forward | yes | yes | **public internet** | DDNS client, router, TLS | Rejected: opens ports, breaks under CGNAT |
| Cloudflare Tunnel | yes | yes | public URL (behind Access) | domain, account, Access policy | Overkill for private tools |
| **Tailscale node + Caddy (this)** | **yes (100.x IP + MagicDNS)** | **yes, through NAT** | **your tailnet only** | 2 containers | **Chosen** |
| Tailscale installed on Windows + `tailscale serve` | yes | yes | tailnet | 1 app | Simplest, but `serve` keeps the original `Host`, which both upstreams reject |

**Decision:** a userspace Tailscale node in Docker gives the machine a permanent identity on a
private WireGuard mesh, and a Caddy container rewrites `Host` before forwarding to loopback. Both
run on the host network because the upstreams listen on `127.0.0.1` only. WireGuard roams, so
peers reconnect on their own after an IP change. The proxy only ever talks to `127.0.0.1`, so it
never needs the host's IP either. No Dockerfile is needed: two pinned official images beat a
custom build you have to maintain.

## Trade-offs (accepted)

- **Depends on Tailscale's coordination server** to set up connections. Existing tunnels keep
  working briefly if it goes away. To remove this dependency, self-host Headscale.
- **Clients must be in the tailnet**, which means the Tailscale app on each device. That's the
  point: access requires being enrolled.
- **The Host rewrite bypasses the DNS-rebinding guard for tailnet traffic only.** On this machine
  the guard still applies, and agent-bank still requires `x-bank-token`. Use tailnet ACLs if
  other people share the tailnet.
- **Plain HTTP over the tailnet.** WireGuard already encrypts it end to end. If a browser needs
  HTTPS, add `"Web"` handlers to `serve.json` (Tailscale issues the cert).

## Run

```bash
cp .env.example .env        # paste a one-off auth key into TS_AUTHKEY
docker compose up -d
./check.sh                  # on this machine
./check.sh --remote         # on another device in the tailnet
```

After that, clients use `http://bank:7077` (header `x-bank-token: $(bank token)`) and
`OLLAMA_HOST=bank:11434`. Remove `TS_AUTHKEY` from `.env` after the first successful `up`.

## Rollback

`docker compose down` stops access. `docker compose down -v` also deletes the node identity;
then remove `bank` in the Tailscale admin console. Nothing on the host was changed.

## Prerequisite: a running Docker engine in WSL

This machine uses Docker Engine installed in Ubuntu (not Docker Desktop), and WSL starts without
systemd, so `dockerd` never starts. Enable systemd once:

```bash
printf '\n[boot]\nsystemd=true\n' | sudo tee -a /etc/wsl.conf
wsl.exe --shutdown          # then reopen the terminal
docker ps                   # should list (no) containers instead of erroring
```

Ollama runs on Windows and is reached at `127.0.0.1:11434` through `networkingMode=mirrored`.
