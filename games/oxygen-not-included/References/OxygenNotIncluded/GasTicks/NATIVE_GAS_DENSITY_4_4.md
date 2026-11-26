# Native density and corner probes (4.4)

- Captured: 2026-11-26
- Installed Steam build: `24423041`
- Runtime: the same installed `SimDLL.dll`, base-game element table, seed `73`, and 0.2 s native frame synchronization documented in [the main trace report](NATIVE_GAS_TRACES_4_4.md).
- Reproduction: run `powershell -ExecutionPolicy Bypass -File ./capture-native-gas-supplement-4.4.ps1` from this directory. The script calls the shared [collector](capture-native-gas-traces.py); it does not duplicate native ABI or element extraction code.

These are supplemental, full 32×32 world probes. They do not modify the existing [36-chamber fixture](native-gas-traces-4.4.json). The four density layouts each contain 140 independent 2 kg + 2 kg vertical pairs. Cells outside the listed pairs are solid Unobtanium. The original scratch probes use native bottom-up grid coordinates; the JSON traces convert them to y-down coordinates using `31 - y`.

## First cross-species appearance

A flip event is the first processed tick where the species initially placed in the lower cell appears in that pair's upper cell. The time is right-censored at tick 120 for cases without an event.

| Layout (upper → lower) | Detect in upper cell | Flips | Mean first event | Range | Exposure event rate |
| --- | --- | ---: | ---: | ---: | ---: |
| O₂ → H₂ (`oh`) | H₂ | 140 / 140 | 15.471429 ticks | 1–63 | 140 / 2,166 = 0.064635 |
| CO₂ → O₂ (`co`) | O₂ | 140 / 140 | 15.471429 ticks | 1–63 | 140 / 2,166 = 0.064635 |
| O₂ → steam (`os`) | steam | 0 / 140 | not observed by tick 120 | — | censored |
| H₂ → O₂ (`ho`) | O₂ | 0 / 140 | not observed by tick 120 | — | censored |

For the two flipping layouts combined, the exposure event rate is `280 / (140 × 15.471429 × 2) = 280 / 4,332 = 0.064635` events per pair-tick. The denominator counts each pair-tick up to and including its first flip. This is a first-event statistic, not a per-tick chance estimate.

Each density JSON stores all 280 pair cells in the 121 frames (`t=0` through `t=24s`), with native element, mass, and temperature values. The raw observations support position-dependent first-flip times; the mean does not imply a single deterministic swap tick.

## Corner and high-mass probes

| Probe | Native observation |
| --- | --- |
| Diagonal cells only (0 opened edges) | No transfer through tick 16. |
| One edge opened between diagonal cells | 0.0288 kg appears in the diagonally opposite neighbor at tick 2 (0.4 s). |
| Both edges opened (2×2 opening) | 0.24 kg appears in each of the three neighboring cells at tick 1 (0.2 s). |
| Isolated O₂: 1,001, 9,999, 10,000, 10,001, 20,000, 100,000, 1,000,000 kg | Each initialized mass is retained unchanged through two processed ticks. This confirms these probes were accepted; it is not a general-purpose maximum-mass proof. |

Raw frames are preserved in [the corner captures](native-gas-corner-0-4.4.json), [one-edge capture](native-gas-corner-1-4.4.json), [two-edge capture](native-gas-corner-2-4.4.json), and [high-mass captures](native-gas-max-mass-4.4.json). The full density traces are [OH](native-gas-density-oh-4.4.json), [CO](native-gas-density-co-4.4.json), [OS](native-gas-density-os-4.4.json), and [HO](native-gas-density-ho-4.4.json).
