#!/usr/bin/env bash
# Verify each hop separately so a failure points at the broken link, not just "it doesn't work".
#   ./check.sh            run on this machine (hops 1-3)
#   ./check.sh --remote   run on another tailnet device (hop 4)
set -u
host="${TS_HOSTNAME:-bank}"
bank_port="${BANK_PORT:-7077}"
ollama_port="${OLLAMA_PORT:-11434}"
fail=0
step() { printf '%-52s' "$1"; shift; if out=$("$@" 2>&1); then echo ok; else echo "FAIL"; echo "  $out" | head -3; fail=1; fi; }
cd "$(dirname "$0")"

if [[ "${1:-}" == "--remote" ]]; then
  step "4. tailnet -> $host:$bank_port/health" curl -fsS -m 5 "http://$host:$bank_port/health"
  step "4. tailnet -> $host:$ollama_port/api/version" curl -fsS -m 5 "http://$host:$ollama_port/api/version"
  exit $fail
fi

step "1. agent-bank on this host" curl -fsS -m 3 "http://127.0.0.1:$bank_port/health"
step "1. Ollama on this host" curl -fsS -m 3 "http://127.0.0.1:$ollama_port/api/version"
step "2. container -> host.docker.internal:$bank_port" docker compose exec -T proxy wget -qO- -T 5 "http://host.docker.internal:$bank_port/health" --header "Host: 127.0.0.1:$bank_port"
step "3. tailscale is logged in" docker compose exec -T tailscale tailscale status --peers=false
step "3. proxy answers inside the tailnet netns" docker compose exec -T proxy wget -qO- -T 5 "http://127.0.0.1:17077/health"
docker compose exec -T tailscale tailscale ip -4 2>/dev/null | sed 's/^/   stable tailnet IP: /'
exit $fail
