# Fortress BLUE 1.3.0

Integrated 2026-11-18 from upstream 1.2.0 as a NEW DISABLED CANDIDATE. Shared catalog and Hub synchronization remain parent-owned and were not changed here.

## Runtime
Canvas 2D turn-based artillery: destructible terrain, trajectory/angle/power/wind, delay turn scheduling, bounded AI or same-device hotseat, classic/BLUE3 profiles, skills/items, win/draw/restart. Korean UI with English labels; supportedLocales ko. Mouse, touch and keyboard controls are implemented upstream. Arrow/WASD controls movement/aim and Space charges/fires. This is a simulation prototype, not a verified reproduction of original executable physics, balance or multiplayer. Recovered source values and assumptions remain separated in original provenance documents.

## Preservation
Input Archive/Incoming/Fortress_BLUE_Playable.zip: 139897 bytes, SHA256 68af1261944b5cadd265ca60172ab123c2464e30036cffdb3acd8176d289bd15.
All 17 source files unchanged under Source/Project. Source/import-v1.2-manifest.json inventories every original path and SHA256. Source/Project/index.html is upstream redirect; actual Web uses Source/Project/dist contents with identical bytes. Original reference/design/validation documents retained. No previous integrated game existed.

The upstream offline-download link targets a missing downloads/Fortress_BLUE_Playable.zip; Web/downloads now contains the exact supplied original ZIP so that relative resource resolves. Game logic/HTML/CSS unchanged. New cover SVG is explicitly a placeholder, not a gameplay screenshot.

## Validation
`node games/fortress-blue/Source/Project/tests/engine.test.cjs`: 29/29 integration checks passed, including deterministic flight, wall collision, terrain destruction, volley completion, AI match termination, ability/item attribution, angle ranges and power endpoints. Four runtime JavaScript syntax checks, source/runtime byte equality, local HTML reference resolution and release CRC passed. Evidence: Source/Validation-v1.2.

## Save and platform limits
Existing preference/history keys fortress-blue-prefs-v1 and fortress-blue-history-v1 retained; platform save schema1, legacy-localstorage. No mid-match persistence promised. Local storage errors are caught by upstream but may silently prevent persistence. Authenticated Hub save bridge and real browser rendering/input/audio are NOT tested. Fullscreen and download UI can be restricted by the Hub sandbox; no platform permissions were changed. External source citations are user-clicked reference links, not gameplay network requests. Keep disabled until integrated browser QA.

## Release
Current: Archive/Releases/fortress-blue-v1.3.0.zip, Korean manifest metadata corrected; previous English-metadata ZIP preserved at Archive/BuildSteps/fortress-blue-v1.3.0-before-ko-metadata.zip.
Contains manifest and Web, including the exact original offline ZIP. The file exists, but Hub ZIP-serving policy and sandbox download permissions are not changed or verified. If download is blocked use Archive/Incoming/Fortress_BLUE_Playable.zip directly.
SHA256: e638ff6353df585eafdd47eb635602e4212f1070ce70fb72104ff4fafe29f55b
Bytes: 233870
