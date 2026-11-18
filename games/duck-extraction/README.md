# Duck Extraction 1.2.0

## 소개 이미지 · v1.2.0

2026-11-18 PlayHub 로컬 런처에서 [실제 플레이 화면](Web/assets/gameplay-intro.png)을 캡처하여 소개 이미지로 등록했습니다. 게임 화면을 Chrome에서 1,360px 너비로 캡처하고 PNG 디코딩을 확인했습니다.

- 화면 이미지 SHA-256 `1d16b604319d914cc3530498b2b880235decb8c8eb957b4d5df4bd3220790c69`
- [통합판 ZIP](Archive/Releases/duck-extraction-v1.2.0.zip)
- 통합판 ZIP SHA-256 `6bc8a830388f50081d04d4a32e0f0bf3d2c59fa24d217cabf23261fc0f610160`

New disabled candidate integrated on 2026-11-18 from upstream v1. Shared catalog registration and Hub synchronization are intentionally not changed here.

## Scope and controls
Original single-file Canvas 2D extraction shooter prototype, not a 3D game or a recreation of original commercial assets. Korean UI with some English labels; supportedLocales: ko. Keyboard and mouse only. WASD move, Shift run, mouse aim/fire, R reload, E loot/extract, F heal, Tab inventory, B base, Esc close.

Implemented: enemy pursuit/shooting, collision, ammo/reload/healing, loot, extraction, stash, selling, attack/armor upgrades, death penalty and local saves. No external network/assets or WebGL, pointer lock, touch controls required. New SVG cover is an explicitly labelled placeholder, not a gameplay screenshot.

## Preservation
Archive/Incoming/Duck_Extraction_Web_Playable_v1.zip: 8089 bytes, SHA256 8e2f0f74eeb77c4db6f8ca6afa66a2e79cec7a52a475af1be05ecb2b92b7720d.
All 2 original files (3 ZIP entries including directory) preserved byte-for-byte in Source/Project; source path/hash inventory Source/import-v1-manifest.json. Web/index.html equals original index.html without game code edits. There was no previous integrated game to archive.

## Validation
Run `node --test games/duck-extraction/Source/Validation-v1/runtime.test.cjs` from repository root. 11/11 tests passed: 10 behavior/structure checks plus one documented corrupt-save failure check. VM tests execute actual game functions with mocked DOM/Canvas, not a real browser rendering test. Source hashes and release ZIP CRC verified; Hub readCatalog accepts a temporary disabled entry. Evidence in Source/Validation-v1.

## Known upstream limitations / release gates
- localStorage keys duck_credits, duck_stash, duck_upgrades are retained. Platform save schema 1 with legacy-localstorage integration; authenticated Hub save bridge is NOT verified. Opaque sandbox localStorage needs the normal Hub bridge before release.
- Malformed JSON saves or unavailable localStorage stop initialization; no recovery UI. This is confirmed/documented, not silently counted as successful recovery.
- Storage upgrade currently spends credits and increments its level but does not enforce or increase a capacity limit. Medkit stash is not consumed when deploying; two raid heals are always assigned. These are prototype gaps, not full inventory mechanics.
- No browser visual/input/mobile QA performed. Enemy/obstacle random generation and balancing are not exhaustively validated. Keep disabled pending gameplay review.

## Release
Archive/Releases/duck-extraction-v1.1.0.zip contains manifest and Web only.
SHA256: 78a390e6c8f738d45b76920b638222d0efe0ce54d22af0e611bd3c7090fa44f3
Bytes: 7877

Final Hub locale synchronization (2026-11-18): canonical Web includes generated locale helpers. Original source and pre-sync release are preserved; final release hashes are in docs/migration/game-update-20261118-final.json.
