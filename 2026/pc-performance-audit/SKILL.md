---
name: pc-performance-audit
description: >-
  Audit a Windows PC's real hardware and confirm it's running at full
  performance — gather CPU/RAM/GPU specs via CIM/WMI, check that XMP/EXPO memory
  profile and the High Performance / Ultimate power plan are actually engaged,
  and recommend compatible upgrades or what workloads (e.g. which local LLM) the
  machine can handle. Use when asked "what's my spec", "is everything set to max
  performance", "best CPU/RAM for my motherboard", or "did enabling XMP actually
  help". Keywords: Get-CimInstance Win32_Processor, XMP EXPO, powercfg high
  performance, RAM speed 2666 3200, VRAM, thermal throttling, upgrade compatibility.
---

# PC performance audit (Windows)

Answer two questions with evidence: *what is this machine* and *is it actually
running at full tilt* — then recommend upgrades or workloads that fit.

## When to use

- "What's the best CPU/RAM for my motherboard <X>?"
- "I enabled XMP but didn't feel a boost — is everything at max performance?"
- "What can this PC run?" (pairs with `local-llm-wsl` for model choice).

## Step 1 — Gather ground-truth specs

```powershell
powershell -File scripts/spec-report.ps1
```
It prints CPU (name/cores/threads/max clock), total RAM + **configured vs rated
memory speed**, per-DIMM channel/slot, GPU + VRAM, motherboard model & BIOS
version, and the active power plan — as JSON you can act on.

## Step 2 — Confirm performance is engaged (the part people miss)

Enabling XMP in BIOS is necessary but not sufficient; Windows and firmware have
their own throttles. Check all of them:

- **Memory actually at rated speed?** `Win32_PhysicalMemory.Speed` (rated) vs
  `Win32_PhysicalMemory.ConfiguredClockSpeed` (running). If configured < rated,
  XMP/EXPO isn't applied — enable it in BIOS. *2666 running on 3200 sticks = not
  on.* (The IRDM 2666 kit here **is** its rated speed — nothing to gain unless you
  swap kits.)
- **Power plan = High Performance / Ultimate.**
  ```powershell
  powercfg /getactivescheme
  powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61  # Ultimate Perf
  powercfg /setactive SCHEME_MIN                                   # High Perf
  ```
- **CPU not throttling:** min/max processor state 100 % on AC; watch clocks under
  load (`Get-Counter '\Processor Information(_Total)\% Processor Performance'`).
- **GPU at full power:** vendor control panel set to "prefer max performance";
  check `nvidia-smi` clocks/power aren't capped.
- **Resizable BAR / Above-4G** on in BIOS for modern GPUs.

Full checklist with the "why" for each item: `references/perf-checklist.md`.

## Step 3 — Recommend

- **Upgrades:** match CPU to the board's socket/chipset and BIOS support list, and
  RAM to the QVL (speed the board+CPU actually validate). Never quote a part
  without checking the motherboard's supported-CPU/QVL page for that BIOS.
- **Workloads:** feed the GPU VRAM + system RAM into
  [`local-llm-wsl`](../local-llm-wsl/) `references/model-picker.md` to size a model.

## Gotchas

- **`Win32_VideoController.AdapterRAM` is a signed 32-bit field** — it reports
  wrong (often ~4 GB) for GPUs with ≥4 GB VRAM. Trust `nvidia-smi` /
  `dxdiag` / the registry `HardwareInformation.qwMemorySize` instead.
- **"Rated" vs "running" RAM speed** is the single most common false "I enabled
  XMP" — always compare `Speed` to `ConfiguredClockSpeed`.
- **DDR speed is per-kit and CPU/board-limited.** A board that lists "3200 (OC)"
  won't run 3200 on a CPU whose IMC tops out lower.
- **Laptop/OEM boards** often lock XMP and power states — BIOS may simply not
  expose them.

## Composes with

- [`local-llm-wsl`](../local-llm-wsl/) — turn the spec into a model recommendation.
