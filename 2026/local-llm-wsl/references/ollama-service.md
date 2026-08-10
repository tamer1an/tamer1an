# Ollama as a systemd service with off-drive storage

The installer registers a systemd unit that runs as the `ollama` user. Env vars
you export in your shell **do not** reach it — set them in a drop-in override.

```bash
sudo systemctl edit ollama
```
Add:
```ini
[Service]
Environment="OLLAMA_MODELS=/mnt/w/ollama_models"
Environment="OLLAMA_HOST=0.0.0.0:11434"
# Environment="OLLAMA_KEEP_ALIVE=30m"   # keep model resident between calls
```
Then:
```bash
sudo chown -R ollama:ollama /mnt/w/ollama_models 2>/dev/null || true
sudo systemctl daemon-reload
sudo systemctl restart ollama
systemctl show ollama -p Environment      # confirm the vars took
```

> On a `/mnt/w` (9p/Windows) mount you may not be able to `chown` to `ollama`.
> If so, run Ollama as your own user instead (stop the service, `ollama serve`
> under your shell with the env vars), or store models on the Linux disk and keep
> only archives on `/mnt/w`.

## Verify storage location

```bash
ollama pull qwen2.5:0.5b          # tiny, quick test
du -sh /mnt/w/ollama_models       # must have grown
```
If it grew under `~/.ollama` instead, the override didn't apply — re-check
`systemctl show ollama -p Environment`.
