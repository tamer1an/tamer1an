# Wrapping a local Ollama endpoint as an MCP server

Ollama already speaks REST; MCP just lets an agent call it as a *tool*. A minimal
stdio MCP server exposing one `generate` tool:

```python
# ollama_mcp.py  —  pip install mcp httpx
import httpx
from mcp.server.fastmcp import FastMCP

OLLAMA = "http://localhost:11434"
mcp = FastMCP("ollama-local")

@mcp.tool()
def generate(prompt: str, model: str = "llama3.1:8b-instruct-q4_K_M") -> str:
    """Run a prompt through the local Ollama model and return the completion."""
    r = httpx.post(f"{OLLAMA}/api/generate",
                   json={"model": model, "prompt": prompt, "stream": False},
                   timeout=300)
    r.raise_for_status()
    return r.json()["response"]

if __name__ == "__main__":
    mcp.run()   # stdio transport
```

Register it with your MCP client (Claude Code / Antigravity) as a stdio server:
```json
{ "mcpServers": {
    "ollama-local": { "command": "python", "args": ["ollama_mcp.py"] } } }
```

For a network-reachable server use SSE/HTTP transport instead of stdio and bind a
port. For plain REST consumers, skip MCP entirely and just `curl` `:11434` — MCP
is only worth it when an agent needs the model as a discoverable tool.
