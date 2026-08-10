# Picking a local model for your hardware

## Sizing rule

4-bit (`q4_K_M`) footprint ≈ **params × 0.6 GB** + ~1–2 GB overhead/context.

| Model size | ~q4 weight | Fits 8 GB VRAM? |
|-----------|-----------|-----------------|
| 7–8B | ~4.5–5 GB | Yes, fully on GPU |
| 12–14B | ~7–8 GB | Tight; q4 yes, longer context may spill |
| 30–34B | ~18–20 GB | No — offload layers to RAM (slower) |
| 70B | ~40 GB | RAM-heavy hybrid only |

Higher quant = smarter but bigger: `q4_K_M` (balanced default) < `q5_K_M` <
`q6_K` < `q8_0` (near-lossless, 2× the size).

## Recommendations for RTX 3070 (8 GB) + 48 GB RAM

**Fast, entirely on GPU (~50+ tok/s):**
- `llama3.1:8b-instruct-q4_K_M` — the general-purpose default.
- `mistral-nemo:12b` (q4/q5) — smarter than 8B, still fits with headroom.
- `deepseek-r1:8b` (distill-llama) — a reasoning model that stays fast.

**Smarter, hybrid GPU + RAM offload (slower, big context):**
- 30–34B at q4 with `num_gpu` layers offloaded; the 48 GB RAM absorbs the rest.
- 70B only for quality-over-speed batch work.

## Control GPU offload (Ollama)

```bash
# per-run: how many layers to push onto the GPU
OLLAMA_NUM_GPU=999 ollama run <model>     # 999 = as many as fit
# or in a Modelfile:  PARAMETER num_gpu 35
```
Watch VRAM headroom with `nvidia-smi -l 1` while a model loads; back off
`num_gpu` if it OOMs.

## llama.cpp alternative

If you want raw `gguf` control instead of Ollama:
```bash
./llama-server -m model.q4_K_M.gguf -ngl 35 -c 8192 --host 0.0.0.0 --port 8080
```
`-ngl` = GPU layers, `-c` = context. Serves an OpenAI-compatible API on `/v1`.
