# PlayForge Godot — M01–M10 마일스톤 인덱스

> 최신 주력 경로: 공식 Godot 기반 통합 Creator 서비스. 빈 맵·예제 선택, 제작 과정 시연(커서/타이핑/속도), 파일 협업, 버전·테스트·배포는 [서비스 현황](PLATFORM_SERVICE.md)을 기준으로 합니다. 아래 기존 PoC 기록은 비교용으로 보존합니다.

갱신일: 2026-11-25. 상세한 범위, 선행조건, 진입·완료·중단 기준은 [구현 계획안](IMPLEMENTATION_PLAN.md)을 기준으로 합니다. 이 표는 구현·검증·미검증 상태를 요약하며 10개 마일스톤의 전체 완료를 뜻하지 않습니다.

2026-11-25에 기존 HTML/JS Studio 두 경로(Classic Web `/Studio/`, Godot-layout Web `/StudioGodot/`)와 Yjs 실시간 협업을 폐기했습니다. 남은 경로는 Official Godot Web Editor + PlayForge service/platform plugin입니다. 주력 PoC는 hash 확인된 upstream Godot 4.7.2 Web Editor vendor + 현재 engine core patch 0 + service EditorPlugin + own web frontend입니다. 공식 Editor fork source build 완료로 표현하지 않습니다.

| ID | 계획 범위 | 현재 구현·검증 상태 | 남은 기준 / evidence |
| --- | --- | --- | --- |
| M01 | 실행 기반·3경로 비교 및 lock | (폐기 전) 세 launcher `--smoke-test` start/routes/stop PASS. 2026-11-25 이후 Official launcher만 빌드. Official 4.7.2 Web Editor vendor hash 확인; engine core patch 0. | Three-path matrix, dependency/license/target lock. ZIP `Launch/PlayForge-Godot-Project.zip`. Review GATE-0 `T001–T004` not_run. |
| M02 | 공통 game data·ID·migration 계약 | Tappy fixture / manifest / settings가 존재. 범용 schema 검증 주장은 없음. | 2D/3D·stable IDs·override·coordinate/units·migration 증거. `T013–T021`; `F028–F034`; 상세 [구현 계획 M02](IMPLEMENTATION_PLAN.md). |
| M03 | Godot-layout Web 편집기 — **폐기 (2026-11-25)** | `StudioGodot/`, Classic `Studio/`, Yjs 공유 문서(`Tools/collaboration.cjs`)를 제거. `/Studio/`·`/StudioGodot/`는 404. | 후속 없음. 편집은 M04 Official Web Editor 경로가 담당. |
| M04 | Official Web Editor + service EditorPlugin + own frontend | Official Editor browser에서 ZIP project import와 `PLAYFORGE_EDITOR_READY`/`pluginReady:true` 확인. Plugin native headless import pass. Native HTTP GET/PUT/stale 409 test pass. | Full browser plugin API round-trip unverified. `npm run test:official-editor` strict smoke failed with thread-never-started + TCP `ERR_CANT_CREATE` 2 errors; fix/ret test. Fake build polling is not real plugin build integration evidence. SSO/cloud hosting unverified. |
| M05 | Live collaboration·cloud save authority | Classic/Godot-layout Yjs doc은 2026-11-25 폐기. Creator 프로젝트 파일 동기화(`/api/platform/*`)와 Native plugin source GET/PUT/409 test pass. | Authenticated cloud hosting/SSO, snapshots/restore/role ACL, full browser plugin API round-trip and Official Editor live scene collaboration. Historical `T022–T030` remain not_run. |
| M06 | GDScript runtime bridge·web/native trust | Local Tappy GDScript runtime and real Chrome Godot WASM load/input/pause freeze/restart pass via `npm run test:web-runtime`. | Tappy 2D focused check only. Lua review cases `T005–T012` are out of scope (Lua unsupported); no GDScript public UGC isolation evidence. |
| M07 | Web/native capability·target build | Actual Godot Web export succeeded; Chrome WASM Tappy smoke passed. | Full browser/3D/visual/platform capability, GPU, Android/iOS/headless, package quota. Official Editor strict smoke failure tracked separately. Review `T044–T052` not_run. |
| M08 | Multiplayer·physics/network readiness | 현재 제품의 Tappy local runtime만 확인. | Dedicated/Listen transport, initial replication/collision barrier, safe teleport, provider/SDK. `T031–T043`, `T053–T054` not_run. |
| M09 | Streaming·asset·middleware·security options | Review에서 제안된 범위만 정리. 사용자 확정 정책으로 간주하지 않음. | Cell/Mip/actor/CDN 요구 범위, middleware/provider/license/security 선택과 증거. `T053–T059` not_run. |
| M10 | Release·operations·upgrade·AI evaluation | 실제 Web artifact 생성 확인. | immutable release/rollback, clean vs incremental, target signoff, quota, upgrade, AI benchmark. `T060–T064` not_run. |

## Gate 상태 해석

- 원본 검토의 Runtime acceptance `T001–T064`는 전부 `not_run` 상태로 유지합니다. `npm test`의 31 checks와 Web runtime/browser editor smoke는 별도 구현 evidence이며 review case 전체 통과가 아닙니다.
- Actual game runtime은 `npm run test:web-runtime`으로 Chrome Godot WASM에서 Tappy load/input/pause freeze/restart까지 확인했습니다. 기존 Studio UI PIE(native Godot execution state mirror)는 Studio와 함께 폐기됐습니다.
- Official Web Editor project ZIP import와 `PLAYFORGE_EDITOR_READY`/`pluginReady:true`는 확인했습니다. `npm run test:official-editor` strict smoke는 `thread never started`와 TCP `ERR_CANT_CREATE`로 2 errors가 확인되어 실패 상태입니다. Browser plugin API round-trip은 미검증입니다.
- 정식 M 단계 완료 보고에는 재현 command, engine/template hash, revision/source hash, target/browser/device, 로그·image 경로, 미검증 범위를 연결합니다. 성능 수치/기준은 실제 측정 또는 사용자 결정 전에는 채우지 않습니다.
- Classic Web과 Godot-layout Web은 사용자 결정으로 2026-11-25에 폐기했습니다(M03). cloud hosting/SSO/live scene collaboration을 local API proof만으로 완료 처리하지 않습니다.

자세한 선행 gate 및 stage acceptance는 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), 실행 계약은 [GODOT_MIGRATION.md](GODOT_MIGRATION.md), launcher/API 상태는 [CLOUD_AND_FRONTENDS.md](CLOUD_AND_FRONTENDS.md)를 참조합니다.


