# PlayForge Godot — M01–M10 마일스톤 인덱스

갱신일: 2026-11-17. 상세한 범위, 선행조건, 진입·완료·중단 기준은 [구현 계획안](IMPLEMENTATION_PLAN.md)을 기준으로 합니다. 이 표는 구현·검증·미검증 상태를 요약하며 10개 마일스톤의 전체 완료를 뜻하지 않습니다.

세 PoC 경로(Classic Web, Godot-layout Web, Official Godot Web Editor + PlayForge service plugin)를 모두 유지합니다. 우선 PoC는 hash 확인된 upstream Godot 4.7.2 Web Editor vendor + 현재 engine core patch 0 + service EditorPlugin + own web frontend입니다. 공식 Editor fork source build 완료로 표현하지 않습니다.

| ID | 계획 범위 | 현재 구현·검증 상태 | 남은 기준 / evidence |
| --- | --- | --- | --- |
| M01 | 실행 기반·3경로 비교 및 lock | 세 launcher `--smoke-test` start/routes/stop PASS. Official 4.7.2 Web Editor vendor hash 확인; engine core patch 0. | Three-path matrix, dependency/license/target lock. ZIP `Launch/PlayForge-Godot-Project.zip`. Review GATE-0 `T001–T004` not_run. |
| M02 | 공통 game data·ID·migration 계약 | Tappy fixture / manifest / settings가 존재. 범용 schema 검증 주장은 없음. | 2D/3D·stable IDs·override·coordinate/units·migration 증거. `T013–T021`; `F028–F034`; 상세 [구현 계획 M02](IMPLEMENTATION_PLAN.md). |
| M03 | Godot-layout Web 편집기 | `StudioGodot/` 파일이 존재하며 Classic Web과 같은 Yjs live document를 공유. | 편집 회귀와 일반 scene capability 범위는 후속. Studio UI의 PIE는 native Godot execution state mirror. |
| M04 | Official Web Editor + service EditorPlugin + own frontend | Official Editor browser에서 ZIP project import와 `PLAYFORGE_EDITOR_READY`/`pluginReady:true` 확인. Plugin native headless import pass. Native HTTP GET/PUT/stale 409 test pass. | Full browser plugin API round-trip unverified. `npm run test:official-editor` strict smoke failed with thread-never-started + TCP `ERR_CANT_CREATE` 2 errors; fix/ret test. Fake build polling is not real plugin build integration evidence. SSO/cloud hosting unverified. |
| M05 | Live collaboration·cloud save authority | Classic/Godot-layout same Yjs doc; `npm test` local suites include collaboration checks. Native plugin source GET/PUT/409 test pass. | Authenticated cloud hosting/SSO, snapshots/restore/role ACL, full browser plugin API round-trip and Official Editor live scene collaboration. Historical `T022–T030` remain not_run. |
| M06 | GDScript runtime bridge·web/native trust | Local Tappy GDScript runtime and real Chrome Godot WASM load/input/pause freeze/restart pass via `npm run test:web-runtime`. | Tappy 2D focused check only. Lua review cases `T005–T012` remain not_run; no GDScript public UGC isolation evidence. |
| M07 | Web/native capability·target build | Actual Godot Web export succeeded; Chrome WASM Tappy smoke passed. | Full browser/3D/visual/platform capability, GPU, Android/iOS/headless, package quota. Official Editor strict smoke failure tracked separately. Review `T044–T052` not_run. |
| M08 | Multiplayer·physics/network readiness | 현재 제품의 Tappy local runtime만 확인. | Dedicated/Listen transport, initial replication/collision barrier, safe teleport, provider/SDK. `T031–T043`, `T053–T054` not_run. |
| M09 | Streaming·asset·middleware·security options | Review에서 제안된 범위만 정리. 사용자 확정 정책으로 간주하지 않음. | Cell/Mip/actor/CDN 요구 범위, middleware/provider/license/security 선택과 증거. `T053–T059` not_run. |
| M10 | Release·operations·upgrade·AI evaluation | 실제 Web artifact 생성 확인. | immutable release/rollback, clean vs incremental, target signoff, quota, upgrade, AI benchmark. `T060–T064` not_run. |

## Gate 상태 해석

- 원본 검토의 Runtime acceptance `T001–T064`는 전부 `not_run` 상태로 유지합니다. `npm test`의 31 checks와 Web runtime/browser editor smoke는 별도 구현 evidence이며 review case 전체 통과가 아닙니다.
- Actual game runtime은 `npm run test:web-runtime`으로 Chrome Godot WASM에서 Tappy load/input/pause freeze/restart까지 확인했습니다. Studio UI PIE는 native Godot execution state mirror입니다.
- Official Web Editor project ZIP import와 `PLAYFORGE_EDITOR_READY`/`pluginReady:true`는 확인했습니다. `npm run test:official-editor` strict smoke는 `thread never started`와 TCP `ERR_CANT_CREATE`로 2 errors가 확인되어 실패 상태입니다. Browser plugin API round-trip은 미검증입니다.
- 정식 M 단계 완료 보고에는 재현 command, engine/template hash, revision/source hash, target/browser/device, 로그·image 경로, 미검증 범위를 연결합니다. 성능 수치/기준은 실제 측정 또는 사용자 결정 전에는 채우지 않습니다.
- Classic Web, Godot-layout Web, Official Web Editor/plugin 중 어떤 경로도 POC 비교 중 제거하지 않습니다. cloud hosting/SSO/live scene collaboration을 local API 또는 shared Yjs proof만으로 완료 처리하지 않습니다.

자세한 선행 gate 및 stage acceptance는 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), 실행 계약은 [GODOT_MIGRATION.md](GODOT_MIGRATION.md), launcher/API 상태는 [CLOUD_AND_FRONTENDS.md](CLOUD_AND_FRONTENDS.md)를 참조합니다.


