#!/usr/bin/env bash
# Wire agent-bank into Pi, Claude Code and the shell. Idempotent; backs up files it changes.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PI_DIR="${PI_AGENT_DIR:-$HOME/.pi/agent}"
ADDY_SKILLS="${ADDY_SKILLS:-$HOME/.claude/plugins/marketplaces/addy-agent-skills/skills}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# shellcheck disable=SC1091
source "$HOME/.nvm/nvm.sh" >/dev/null
nvm use 26 >/dev/null
NODE26="$(command -v node)"
PI_PKG="$(npm root -g)/@earendil-works/pi-coding-agent"
[[ -d "$PI_PKG" ]] || { echo "Pi is not installed under Node 26: npm i -g @earendil-works/pi-coding-agent"; exit 1; }
[[ -d "$ADDY_SKILLS" ]] || { echo "Addy Osmani skills not found at $ADDY_SKILLS (set ADDY_SKILLS=...)"; exit 1; }

say() { printf '  %-10s %s\n' "$1" "$2"; }
backup() { [[ -f "$1" ]] && cp "$1" "$1.bak-$STAMP" && say backup "$1.bak-$STAMP" || true; }

echo "agent-bank install → $PI_DIR"
mkdir -p "$PI_DIR/agents" "$PI_DIR/extensions" "$HOME/.local/bin" "$HOME/.claude/skills"

# 1. Pi settings: add extension, Addy skills, team prompts (merge, never drop existing entries).
backup "$PI_DIR/settings.json"
"$NODE26" - "$PI_DIR/settings.json" "$REPO/pi/extension" "$ADDY_SKILLS" "$REPO/pi/prompts" <<'EOF'
const fs = require('node:fs');
const [file, ext, skills, prompts] = process.argv.slice(2);
const s = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const add = (k, v) => { s[k] = [...new Set([...(s[k] ?? []), v])]; };
add('extensions', ext); add('skills', skills); add('prompts', prompts);
fs.writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
EOF
say settings "extension + Addy skills + team prompts"

# 2. Local model provider (Ollama on Windows, reachable at localhost via mirrored networking).
backup "$PI_DIR/models.json"
"$NODE26" - "$PI_DIR/models.json" <<'EOF'
const fs = require('node:fs');
const file = process.argv[2];
const m = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
m.providers ??= {};
const p = (m.providers.ollama ??= { baseUrl: 'http://localhost:11434/v1', api: 'openai-completions', apiKey: 'ollama', models: [] });
// llama3.1-8k: same weights, num_ctx 8192 so the KV cache fits the 8 GB GPU.
for (const id of ['llama3.1-8k', 'llama3.1:latest']) if (!p.models.some((x) => x.id === id)) p.models.push({ id, contextWindow: id.endsWith('8k') ? 8192 : 131072 });
fs.writeFileSync(file, JSON.stringify(m, null, 2) + '\n');
EOF
say models "ollama/llama3.1-8k"

# 3. Team roles for the subagent tool (symlinks, so edits in the repo apply immediately).
for f in "$REPO"/pi/agents/*.md; do ln -sfn "$f" "$PI_DIR/agents/$(basename "$f")"; done
say agents "$(cd "$REPO/pi/agents" && ls | tr '\n' ' ')"

# 4. Subagent extension from Pi's own examples (copied: the nvm path changes on Node upgrades).
mkdir -p "$PI_DIR/extensions/subagent"
cp "$PI_PKG/examples/extensions/subagent/index.ts" "$PI_PKG/examples/extensions/subagent/agents.ts" "$PI_DIR/extensions/subagent/"
say subagent "$PI_DIR/extensions/subagent"

# 5. bank CLI on PATH, pinned to Node 26.
cat > "$HOME/.local/bin/bank" <<EOF
#!/usr/bin/env bash
exec "$NODE26" "$REPO/bin/bank.js" "\$@"
EOF
chmod +x "$HOME/.local/bin/bank"
say cli "$HOME/.local/bin/bank"

# 6. Claude Code skill.
ln -sfn "$REPO/skills/agent-bank" "$HOME/.claude/skills/agent-bank"
say skill "$HOME/.claude/skills/agent-bank"

# 7. Local model alias with a GPU-sized context (no extra disk: reuses llama3.1 weights).
if command -v ollama >/dev/null && ! ollama list 2>/dev/null | grep -q '^llama3.1-8k'; then
  tmp="$(mktemp -d)"; printf 'FROM llama3.1:latest\nPARAMETER num_ctx 8192\n' > "$tmp/Modelfile"
  mf="$tmp/Modelfile"; command -v wslpath >/dev/null && mf="$(wslpath -w "$mf")"
  ollama create llama3.1-8k -f "$mf" >/dev/null && say ollama "created llama3.1-8k"
  rm -rf "$tmp"
fi

echo "done. Run Pi with Node 26:  nvm use 26 && pi    (then /bank, /team-build <task>)"
