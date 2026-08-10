# Kindle model / firmware / build matrix

## Confirm the device before anything else

```bash
# Kindle mounted as USB drive (assume I: → /mnt/i)
cat /mnt/i/system/version.txt         # e.g. "Kindle 5.13.3 (367598 033)"
# on-device: Settings → Device Options → Device Info (serial + firmware)
```
Already-jailbroken markers in the drive root: `extensions/`, `mrpackages/`,
`mrinstaller/`, `koreader/`. Absent = clean.

## Serial prefix → model (common)

| Serial prefix | Model | Codename |
|---------------|-------|----------|
| `G090` | Paperwhite 3 (2015), DP75SDI | `kindlepw2` family |
| `G000`/`B0xx` | older Kindles/Touch | varies |
| `G0B0`/`G0A0` | Paperwhite 4 (2018) | `kindlepw2` |
| `G001` | Oasis / newer | `kindlehf` on modern fw |

(Prefixes drift across batches — treat as a hint, confirm firmware string too.)

## Exploit by firmware

| Firmware | Tool | Registration needed? |
|----------|------|----------------------|
| < 5.16.4 | **WinterBreak2** | No (Experimental Browser) |
| ≤ 5.18.0 | WinterBreak | Yes (Amazon-registered + saved WiFi) |
| > 5.18.0 | (no public jailbreak at time of writing) | — |

## KOReader build by firmware (NOT by model)

| Firmware | KOReader build |
|----------|----------------|
| ≤ 5.16.2 | `kindlepw2` |
| ≥ 5.16.3 | `kindlehf` |

The kindlemodding site may suggest `kindlehf` for a PW3 — that's for PW3s on
*modern* firmware. On 5.13.3 you need `kindlepw2` or KOReader won't launch.

## Space budget

| Phase | Free space target |
|-------|-------------------|
| Jailbreak (OTA starvation) | 50–90 MB (aim ~70 MB) |
| KUAL / MRPI install | ~220 MB |

Filler on before jailbreak, off after. **Back up `documents/` first** — the device
purges content to hit the low-space target.
