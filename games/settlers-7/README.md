# Settlers 7

New private integration candidate, upstream v27 / PlayHub 27.1.0 (2026-11-18). Catalog registration and Hub sync are handled separately; keep enabled:false until actual Hub/browser QA succeeds.

- [Play locally](Web/index.html), [source and play guide](Source/Project/README.md), [v27 strategy specification](Source/Project/docs/STRATEGY_v27.md).
- All 69 upstream files, planning documents, historical reports and the nested v23 reference ZIP are preserved unchanged in Source/Project. Do not mistake historical reports for new QA results.
- Original ZIP: Archive/Incoming/Settlers7_ReverseDesign_v27.zip, SHA256 `6574323992239b7569992c9a53917ce005aae63bb30e39b6d442c0b8865565dc`.
- Per-file original-to-import path/hash inventory: Source/import-v27-manifest.json. Ignored reports/*.json and nested *.zip must be included explicitly when committing the inventory.
- Integrated release: Archive/Releases/settlers-7-v27.1.0.zip, SHA256 `acdfdb588f2d761ad3abb9ad0d43665b70cbe5201a1f1a0a5783f43a4b964c4c`.
- Web/index.html is the unchanged upstream standalone embedded runtime. No network resource tags or runtime package installation. The cover is a labeled SVG placeholder, not a gameplay screenshot or new game model.
- Runtime UI is Korean only. Metadata English titles are not a claim of English gameplay localization.
- Local save S7_V27 with previous S7_V26/V25/V24 read fallback and backup handling is preserved. New game ID settlers-7 must be namespaced by the Hub legacy-storage bridge.
- Five local Node suites: 179 assertions passed. Tests ran in an isolated copy; current results are Source/Validation-v27/. Runtime JS syntax and ZIP CRC checks passed.
- Actual browser layout/input/audio and authenticated Hub storage/download permissions remain unverified. The Hub sandbox's JSON export/download limitations must be checked before public enabling.
