# "Is it actually at max performance?" checklist

Enabling one setting rarely does it — throttles live in BIOS, Windows, and the
GPU driver simultaneously. Walk all of them.

## Memory
- [ ] **XMP/EXPO enabled** in BIOS. Verify with `ConfiguredClockSpeed == Speed`
      per DIMM (spec-report flags this). Running < rated = profile not applied.
- [ ] **Dual/quad channel populated correctly** — DIMMs in the board's specified
      slots (usually A2/B2). Wrong slots → single channel → ~half the bandwidth.
- [ ] Kit speed is on the board+CPU **QVL**; otherwise it may fall back or fail POST.

## CPU / power
- [ ] Active power plan = **High Performance** or **Ultimate Performance**
      (`powercfg /getactivescheme`). Balanced parks cores and downclocks.
- [ ] Processor state 100 % min/max on AC (`powercfg /q` → "Processor performance
      increase/decrease").
- [ ] Under load, clocks hold near boost — check for **thermal throttling**
      (HWiNFO/`Get-Counter '% Processor Performance'`). If throttling: cooling,
      not settings.
- [ ] BIOS: no eco/silent power limit (PL1/PL2, PPT) capping the CPU.

## GPU
- [ ] Vendor panel: **Prefer maximum performance** power mode.
- [ ] `nvidia-smi` — power limit not artificially low; clocks ramp under load.
- [ ] **Resizable BAR / Smart Access Memory** on (needs Above-4G Decoding in BIOS).
- [ ] Correct PCIe slot (x16 from CPU, not a chipset x4) and PCIe gen not forced low.

## Storage / thermals
- [ ] NVMe on a CPU-attached M.2 slot; not thermal-throttling (check drive temp).
- [ ] Case airflow adequate; no dust-choked coolers (the real fix when clocks sag).

## Reality checks
- Some gains are placebo: **2666 sticks running at 2666 are already at spec** —
  XMP gives nothing unless the kit is *rated* higher. Compare rated vs running
  before promising a boost.
- Laptops/OEM prebuilts frequently **lock** XMP and power states — the setting may
  not exist to toggle.
