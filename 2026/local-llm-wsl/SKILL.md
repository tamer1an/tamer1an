---
name: local-llm-wsl
description: >-
  Set up and run a local LLM (Ollama, or llama.cpp) on WSL/Linux with model
  files stored on a big secondary drive, pick a model that fits the GPU/RAM, and
  expose it as a REST or MCP endpoint for other tools. Use when asked to "run
  Llama/Mistral/DeepSeek locally", relocate Ollama model storage off C:, choose a
  quantization for given VRAM, or call a local model over HTTP. Keywords: ollama,
  OLLAMA_MODELS, OLLAMA_HOST, /api/generate 11434, llama.cpp, gguf, quantization,
  GPU offload layers, local model REST, MCP server for ollama.
---

# Local LLM on WSL with off-drive model storage

Stand up a local model without filling your system drive, sized to the hardware,
and reachable over HTTP. Distilled from real setups on an RTX 3070 (8 GB VRAM) /
48 GB RAM box using `/mnt/w` (a large secondary drive) for model files.

## When to use

- "Run Llama-3.1-8B / Mistral / DeepSeek locally."
- Ollama is filling C: — move the model store to another drive.
- "Which model fits my GPU?" / "expose the model as a REST/MCP service."

## Step 1 — Store models on the big drive (do this FIRST)

Models are many GB. Point Ollama at a spacious mount **before** pulling anything.

```bash
df -h /mnt/w                       # confirm space (had ~198 GB free)
mkdir -p /mnt/w/ollama_models
export OLLAMA_MODELS=/mnt/w/ollama_models   # persist in ~/.bashrc
```
If Ollama runs as a **systemd service**, the env var must be set for the service,
not just your shell — see `references/ollama-service.md`.

## Step 2 — Install & run Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve &                     # or: systemctl start ollama
ollama pull llama3.1:8b-instruct-q4_K_M
ollama run  llama3.1:8b-instruct-q4_K_M
```
Verify the weights really landed on the big drive:
```bash
du -sh /mnt/w/ollama_models        # should grow by the model size
```

> **WSL note:** `/mnt/w` is a Windows drive over the 9p filesystem — fine for
> storing/reading weights, but I/O is slower than native ext4. For max tokens/s
> keep the *runtime* native and only the **store** on `/mnt/w`. If load latency
> hurts, put hot models on the Linux disk and cold ones on `/mnt/w`.

## Step 3 — Pick a model for the hardware

Rule of thumb: a 4-bit (`q4_K_M`) model needs ≈ `params × 0.6 GB`. Fit it in VRAM
for full speed; spill into RAM via GPU-layer offload for bigger models (slower).
Full table in `references/model-picker.md`. For 8 GB VRAM + 48 GB RAM:

| Goal | Model |
|------|-------|
| Fast, all-GPU | Llama-3.1-8B-Instruct · Mistral-Nemo-12B (q4/q5) · DeepSeek-R1-Distill-Llama-8B |
| Smarter, hybrid GPU+RAM offload | 30–70B at low quant, offloading layers to the 48 GB RAM |

## Step 4 — Expose as REST / MCP

Ollama **is** a REST server on `:11434`:
```bash
curl http://localhost:11434/api/generate -d '{
  "model":"llama3.1:8b-instruct-q4_K_M","prompt":"Say hi","stream":false}'
# OpenAI-compatible shape:
curl http://localhost:11434/v1/chat/completions -H 'Content-Type: application/json' \
  -d '{"model":"llama3.1:8b-instruct-q4_K_M",
       "messages":[{"role":"user","content":"hi"}]}'
```
To reach it from Windows / LAN, bind all interfaces: `export OLLAMA_HOST=0.0.0.0:11434`.
For **MCP**, wrap the REST endpoint in a small MCP server (stdio or SSE) exposing a
`chat`/`generate` tool — template in `references/mcp-wrapper.md`.

## Gotchas

- **`OLLAMA_MODELS` set only in your shell won't reach the systemd service** → it
  silently uses `~/.ollama` on C:/the Linux disk. Set it in the unit override.
- **No NVIDIA in WSL?** Install the CUDA-on-WSL driver on *Windows* (not inside
  WSL); check with `nvidia-smi` inside WSL. Without it Ollama runs CPU-only.
- **"Model not found" after moving the store** = the var wasn't exported when you
  pulled; re-pull or move the blobs and re-run.

## Composes with

- [`pc-performance-audit`](../pc-performance-audit/) — confirm VRAM/RAM and
  driver state before choosing a model.
- [`windows-disk-relocation`](../windows-disk-relocation/) — same "move big data
  off C:" reflex, Windows side.
