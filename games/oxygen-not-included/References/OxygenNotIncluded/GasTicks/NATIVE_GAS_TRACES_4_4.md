# ONI native gas tick traces (4.4)

- Captured: 2026-11-26
- Installed Steam build: `24423041` (`TargetBuildID` is `26798728` and was not used)
- Installed runtime: `OxygenNotIncluded_Data/Plugins/x86_64/SimDLL.dll`
- SimDLL SHA-256: `031960F120AC1D59FD8E43F6E1A7369111C629B90C24D52186B691DFE2D8A727`
- Native initialization seed: `73`
- Native cell width/height: `32×32`
- Native time step requested: `0.2 s`
- Coordinate convention in the JSON: X right, Y down; native grid Y is converted with `31 - y`.

## Artifacts

- [Capture script](capture-native-gas-traces.py)
- [36-case trace set](native-gas-traces-4.4.json)
- [Initial pair at native cells (15,15) and (16,15)](native-gas-anchor-oxygen-15-16.json)
- [Supplemental density, corner and high-mass probes](NATIVE_GAS_DENSITY_4_4.md)

The script loads the installed `SimDLL.dll` in a separate Python process through its native `SIM_Initialize`, `SIM_HandleMessage`, and `SIM_Shutdown` entry points. It reads the installed base-game `StreamingAssets/elements/*.yaml` files, initializes a 32×32 native sim grid, and reads native element index, mass, and temperature arrays. It does not launch the game, touch an installed game file, read or write a save, or include game binaries/assets in the repository.

The element table has 202 base-game entries. The capture reproduces the installed `ElementLoader` element order: phase (`state & Solid`) descending, then signed `SimHashes` ascending. The installed loader sets gas `defaultMass` to 1 kg and `maxMass` to 1.8 kg; these are element metadata defaults, not the limit used by the native cell initializer. The isolated cell probes were accepted without clamping through 1,000,000 kg. For the sim table, phase, flow, thermal values, transitions and state flags are populated from the installed YAML/loader rules. Material color, gradients and other renderer-facing metadata use placeholders because this standalone native run has no renderer; this does not provide a visual or full-game reproduction.

Every experiment is an isolated 5×5 chamber in the same 32×32 grid. The chamber perimeter and unused interior cells are solid `Unobtanium` at the chamber temperature. Each chamber is separated from its neighbors by solid cells. The solver records the full 5×5 chamber at each frame, including solid and vacuum cells. `frames[0]` is the native initialization output before a tick; every subsequent frame follows exactly one enqueued 0.2-second `NewGameFrame`. The capture polls `PrepareGameData` at 1 ms intervals until it reports exactly one processed frame, and fails on any count above one or on timeout. Cases with fewer ticks are cropped from the shared frame run.

Mass is the raw native `float32` cell mass in kg; `massG` is the corresponding kg-to-gram conversion. Temperature stores both the raw native float32 Kelvin value and Celsius (`K − 273.15`). The capture does not report Pascal pressure: it records per-cell gas mass, which is the direct quantity exposed in this native update view. Renderer overlays, pressure calculations and full-game systems are outside this measurement.

## Cases and results

The main JSON contains 36 cases: 18 calibration cases, 10 holdouts and 8 limit probes. It includes horizontal and vertical single-species expansion pairs for oxygen, hydrogen, carbon dioxide and steam; horizontal/vertical mixed pairs; stable and inverted vertical pairs; a 3×3 room, a two-cell heat-contact pair, isolated oxygen mass probes, and two 3×3 multi-cell holdouts. Steam starts at 400 K (126.85°C) so it remains gas during the run. Other gas tests start at 293.15 K (20°C). The thermal pair uses oxygen at 293.15 K and 353.15 K.

Observed in this installed native build:

- In a sealed two-cell pair with 2 kg oxygen next to vacuum, 0.24 kg moves during the first 0.2 s tick. At 0.4 s the cells contain 1.5776000023 kg and 0.4223999977 kg. The initial positions and eight-tick trace at `(15,15)` and `(16,15)` are preserved in the anchor JSON.
- With the same 2 kg single-gas/vacuum pair, the first tick transfers 0.20 kg for hydrogen, carbon dioxide and steam. Horizontal and vertical pair runs are recorded separately.
- The isolated equal-mass vertical pairs have arrangement-dependent results. In the 8-tick chamber traces, stable H₂-over-O₂, H₂-over-CO₂, O₂-over-CO₂, and steam-over-O₂ pairs, plus inverted CO₂-over-O₂ and O₂-over-steam pairs, do not cross species; inverted O₂-over-H₂ and CO₂-over-H₂ pairs first show the lower species in the upper cell at tick 5. The supplemental 140-pair density probes show O₂-over-H₂ and CO₂-over-O₂ first flips at a mean of 15.471429 ticks, while O₂-over-steam and H₂-over-O₂ do not flip within 120 ticks. See the [supplemental table and raw traces](NATIVE_GAS_DENSITY_4_4.md); the isolated pair and multi-pair chambers are distinct experiments.
- In the two-cell thermal contact case, two 1 kg oxygen cells at 20°C and 80°C remain at 1 kg each. After 2.4 s their recorded temperatures are about 23.263788°C and 76.736200°C.
- The two 3×3 room holdouts start with 3.75 kg oxygen at center and 0.65 kg at upper right, with the other cells either vacuum or 0.1 kg oxygen each. Initial total masses are 4.4 kg and 5.1 kg; the recorded total remains within native float32 rounding through 3.2 s.
- An isolated oxygen cell initialized to 5×10⁻¹⁰ kg is vacuum after the first processed tick. An initialized 1×10⁻⁹ kg cell (read back as 9.999999717×10⁻¹⁰ kg) and a 1.1×10⁻⁹ kg cell remain. This is consistent with the installed `Sim` minimum-gas-mass constant of `1e-9`; the observed 5×10⁻¹⁰ case is below it.
- Isolated oxygen masses 0.005, 0.5, 2, 10, 12, 100 and 1,000 kg retain their initialized mass through two ticks. This confirms acceptance and retention for those cells in this setup; it does not measure a maximum mass.
- All chamber wall cells remain solid in the 36-case, 16-tick run. The capture was repeated twice with the same seed and setup; the full JSON snapshots were identical.

The native simulation’s gas solver was run directly; this does not establish that every web simulation rule or a full rendered ONI colony matches it. The traces contain observed behavior only; any fitted rates, display limits or pressure values must be treated as a separate model choice.
