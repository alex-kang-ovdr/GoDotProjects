# Fortress War 1.5.0

## 소개 이미지 · v1.5.0

2026-11-18 PlayHub 로컬 런처에서 [실제 플레이 화면](Web/assets/gameplay-intro.png)을 캡처하여 소개 이미지로 등록했습니다. 게임 화면을 Chrome에서 1,360px 너비로 캡처하고 PNG 디코딩을 확인했습니다.

- 화면 이미지 SHA-256 `1c946a736273d2cecd7ce0136d5ea4a33c31f0a33b70636ffa8735263f2afcdd`
- [통합판 ZIP](Archive/Releases/fortress-blue-v1.5.0.zip)
- 통합판 ZIP SHA-256 `aae240f3b6a64318277e2dcc93ddcbdfa52f0168b80884432cd41d6ba9a3aa34`

First published on PlayHub on 2026-11-18. This integration updates the display name from Fortress BLUE to Fortress War and keeps the `fortress-blue` game ID.

## Runtime
Canvas 2D turn-based artillery with destructible terrain, aiming and wind, delay-based turns, AI or same-device two-player battles, and Classic and BLUE3 profiles. Use arrows or WASD to move and aim, and hold Space to charge and release to fire. Mouse and touch controls are also available.

The lobby, battle controls, status, weapon descriptions, results, settings and history support Korean, English, Japanese, Simplified Chinese, French, Spanish, Brazilian Portuguese and Hindi. PlayHub sends language changes to the active game. The standalone game offers a language selector in battle setup. Detailed source evidence remains in its original language.

## Preservation
Input Archive/Incoming/Fortress_BLUE_Playable.zip: 139897 bytes, SHA256 68af1261944b5cadd265ca60172ab123c2464e30036cffdb3acd8176d289bd15.
All 17 files under [Source/Project](Source/Project) match [the upstream SHA-256 manifest](Source/import-v1.2-manifest.json). The Web engine, game data and renderer match the original bytes. The previous 1.3.0 integration remains in `Archive/Releases/fortress-blue-v1.3.0.zip`.

`Web/downloads` retains the exact supplied 1.2.0 ZIP. The download link is hidden in embedded play views, where Hub does not serve that ZIP. The public cover shows an active match captured from the integrated Web game.

## Validation
- `node games/fortress-blue/Source/Project/tests/engine.test.cjs` passed 29 engine tests for deterministic flight, terrain destruction, turn and ability attribution, angle and power bounds, and AI match completion.
- `node --test games/fortress-blue/Source/Validation-v1.4/browser.test.cjs` passed two Chrome tests. The tests exercise all eight languages in a sandbox with keyboard aiming and firing, preserve active match state during language changes, and check standalone saved settings, history and a 390px viewport.
- Ten shared runtime asset files match the manually built Hub distribution byte for byte. PlayHub’s generated entry page runs the same six scripts through its save bridge.

## Save and platform limits
Existing preference and history keys `fortress-blue-prefs-v1` and `fortress-blue-history-v1` are retained with PlayHub’s `legacy-localstorage` integration and save schema 1. They are used for settings and finished-match history. The release does not add mid-match persistence. The recovered data documents distinguish historical values from simulation assumptions.

## Release
`Archive/Releases/fortress-blue-v1.4.0.zip` contains `game.manifest.json` and `Web/`. All 13 entries passed CRC and byte comparisons against the integration files.

- SHA-256 `ac259711fb9431108e0df379680761f73ff252292e98cd2099e35fae6d9174e1`
- Size 305,254 bytes
