# PlayForge Godot — 제품 구현 계획안

> 최신 주력 경로: 공식 Godot 기반 통합 Creator 서비스. 빈 맵·예제 선택, 제작 과정 시연(커서/타이핑/속도), 파일 협업, 버전·테스트·배포는 [서비스 현황](PLATFORM_SERVICE.md)을 기준으로 합니다. 아래 기존 PoC 기록은 비교용으로 보존합니다.

작성일: 2026-11-17 · 기준 저장소: `PlayForge-GoDot` · 상태: 계획·검토 기준, 출시 승인 아님

이 문서는 [Godot 검토 v1](Reviews/PlayForge_Godot_Review_v1/README.md)의 제안과 현재 구현을 대조해 실행 가능한 순서로 정리한다. 검토 패키지 자체는 설계 자료이며 런타임 구현물이 아니다. 사용자 결정과 검토 패키지의 권고가 다를 때는 [결정 추적표](REVIEW_DECISIONS.md)를 기준으로 하고, 미확정 사항을 승인된 제품 정책처럼 구현하지 않는다.

## 제품 기준과 현재 상태

### 사용자 확정 방향과 구현 선택

- Godot 기반 실행 런타임을 목표로 한다. 게임 스크립트 언어는 GDScript만 지원한다(사용자 확정, 2026-11-25). Lua와 C#은 지원하지 않는다.
- 무설치 협업 제작은 웹에서 제공한다. 제작 UI는 Godot 네이티브 Editor UI를 복제하지 않고, Godot Editor의 익숙한 도킹 레이아웃과 패널 구성을 웹 UI로 구현한다.
- 세 가지 제작 경로를 지금 모두 유지하고 비교한다: **기존 Classic Web**, **Godot-layout Web**, **공식 Godot Web Editor + PlayForge 서비스 EditorPlugin**. 세 launcher 실행 파일은 존재하며 `--smoke-test`에서 실제 시작·라우트·정지 통과를 확인했다. 현재 우선 검증 경로는 official upstream Godot 4.7.2 Web Editor의 hash 검증 vendor 설치 + minimal engine core + service EditorPlugin + own web frontend의 3층 접근이다. 현재 core 수정은 0이며 upstream source fork build 완료로 표현하지 않는다. POC 단계에서는 나머지 두 경로도 제거하지 않고 동일 요구·증거 기준으로 분리 비교한다.
- Studio의 UI PIE는 현재 Windows/native Godot 실행의 state/visual mirror다. 별도 actual Web runtime은 Web export된 Godot WASM을 Chrome에서 실행해 Tappy GDScript load/input/pause freeze/restart smoke까지 통과했다. 두 경로를 혼동하지 않는다.
- Classic Web과 Godot-layout Web은 같은 Yjs live document를 사용한다. 기존 연동 구현은 협업/클라우드 제품 전체의 검증 완료를 뜻하지 않는다.
- Tappy Chicken은 현재 검증 fixture다. 제품을 게임 독립적으로 제한할지는 review의 권고로 추적하며 사용자 확정으로 취급하지 않는다.

### 지금 확인 가능한 구현 증거

| 능력 | 현재 증거 | 제한 및 다음 확인 |
|---|---|---|
| GDScript 실행 계약 | `Projects/TappyChicken/Scripts/Game.gd`, `Godot/scripts/runtime_host.gd`, `Tools/native-runtime.cjs`; `npm test`와 `npm run test:visible` 결과 경로는 `Saved/Tests/` | 현재 Tappy 예제와 Windows 로컬 Godot 실행 계약. 범용 scene/project·공개 UGC 검증 아님 |
| Godot 창 및 Studio 연동 | `Godot/scripts/tappy_view.gd`, `Studio/studio.js`, `Tools/run-godot.cjs` | Godot 창이 실제 렌더/입력 소유자. 브라우저 Canvas는 미러 |
| Yjs 협업 연결 | `Tools/collaboration.cjs`, `Tools/yjs-entry.js`, `Tests/collaboration.test.cjs` | 로컬/신뢰된 참여 범위; cloud identity/authority·durable snapshot 미확인 |
| 세 경로 launcher | `Launch/PlayForge-Web-Classic.exe`, `Launch/PlayForge-Web-Godot.exe`, `Launch/PlayForge-Web-Official.exe`; `--smoke-test` 실제 시작/라우트/정지 확인 | Official browser import/ready 확인; strict smoke 2 upstream errors. Browser plugin API 왕복 미검증 |
| Godot-layout Web 협업 | `StudioGodot/`의 실제 파일, Classic/Godot-layout 공용 Yjs 문서 | 두 웹 UI는 같은 live doc 사용. 이를 ZIP import/export only로 축소하지 않음 |
| Official Godot Web Editor service plugin | hash-verified official 4.7.2 Web Editor; `Godot/addons/playforge_service/plugin.gd`; project ZIP import completed, `PLAYFORGE_EDITOR_READY`/`pluginReady:true`; native HTTP GET/PUT/stale-409 test pass (`Tests/plugin-service.test.cjs`) | Full browser plugin API round-trip unverified. `npm run test:official-editor` strict smoke fails with two upstream errors: thread never started and TCP `ERR_CANT_CREATE`; see `Saved/Tests/web-runtime/official-result.json`, `official-browser.log`. SSO/cloud hosting unverified |
| Web export/build | `npm run test:web-runtime`: real Godot WASM Tappy load/input/pause freeze/restart pass; server web export success. Evidence `Saved/Tests/web-runtime/{runtime.json,build.json,web-game.png}` | Focused 2D runtime smoke. Official strict-editor smoke is separate and failed; full review `T001–T064` remain not_run |

현재 확인: 세 launcher EXE `--smoke-test` start/routes/stop PASS. `npm test`는 31 checks pass, 누락된 과거 게임 2개 suite는 skip. Browser automation은 두 browser 각각 6 pass·2 skip(누락된 원본 game fixture 2개). `Tests/plugin-service.test.cjs`는 native Godot plugin의 HTTP `GET /api/project`, `PUT /api/editor/source`, stale revision 409를 확인; 빌드 상태 polling은 fake fixture를 사용했으므로 실제 plugin build request 통합으로 계산하지 않는다. 실제 server Web export/WASM game load/input/pause/restart는 별도 `npm run test:web-runtime`에서 통과했다. Official Web Editor browser에서 프로젝트 import와 `PLAYFORGE_EDITOR_READY`/`pluginReady:true`가 확인됐다(`Saved/Tests/web-runtime/official-result.json`, `official-project.png`). 그러나 strict `npm run test:official-editor`는 thread-never-started와 TCP `ERR_CANT_CREATE` 2 errors로 실패(`official-browser.log`); 이를 전체 성공으로 요약하지 않는다. Full browser plugin API 왕복, SSO/cloud hosting은 검증 안 됨. Studio UI PIE는 여전히 native Godot state mirror다. 원본 review `T001–T064`는 전부 not_run이며 별도 smoke들이 이를 완료 처리하지 않는다.

## 세 경로를 유지하는 POC 아키텍처

```text
Classic Web launcher ─────────┐
Godot-layout Web launcher ────┼── same Yjs live document / shared Workspace APIs
Official Godot Web Editor ────┘      │
     ├─ confirmed: ZIP project import + pluginReady marker; strict official smoke has 2 upstream errors
     ├─ implemented PoC code: service EditorPlugin ─ cloud save / server build APIs
     └─ later research: live scene collaboration / deeper editor event bridge
             │
             └── own web frontend: login, project/team, comparison, build status
Official upstream Godot Web Editor 4.7.2 (hash-verified vendor install)
     └─ planned: fork only if required; current PlayForge core modifications = 0
```

**세 경로 모두 POC 비교 대상으로 유지한다.** 초기 비교 기준은 user experience, live collaboration, cloud save authority, web/native actual runtime 경계, branding, server build/API, data loss/restore, maintenance/upgrade evidence다. 아무 경로도 이번 문서만으로 폐기하거나 운영 정답으로 확정하지 않는다.

현재 official Web Editor 경로는 ZIP import/export를 기본으로 유지하며 ZIP에는 PlayForge EditorPlugin이 포함된다. 공식 upstream Godot 4.7.2 Web Editor는 hash 검증 후 vendor 설치됐고 plugin은 native headless import를 통과했다. `GET /api/project`, revision 기반 `PUT /api/editor/source`(stale revision 409), `POST /api/builds`, `GET /api/builds/{id}` API 코드가 있다. `Tests/plugin-service.test.cjs`에서 native Godot HTTP GET/PUT/409를 확인했으나 build polling은 fake fixture다. Web export/WASM smoke는 별도 `npm run test:web-runtime`에서 성공했다. Official Editor project ZIP import와 `PLAYFORGE_EDITOR_READY`/`pluginReady:true`를 확인했지만 strict `npm run test:official-editor`는 upstream thread `never started` 및 TCP `ERR_CANT_CREATE` 2 errors로 실패했다. 전체 브라우저 plugin API round-trip은 미검증이며 SSO/cloud hosting도 미검증이다. 현재 engine core patch는 0, fork source build 완료가 아니다.

POC는 (1) 필요한 경우에만 선택할 upstream fork와 최소 core 변경, (2) cloud save/server build API를 호출하는 service EditorPlugin, (3) 계정·프로젝트·팀·운영 화면을 담당하는 own web frontend로 나눈다. Live scene collaboration과 광범위한 filesystem virtualization은 후속이다.

Classic Web과 Godot-layout Web은 같은 Yjs live document를 쓴다. 이 둘을 import/export 전용 별도 저장소라고 표현하지 않는다. Official Editor의 기존 ZIP import/export는 유지하며, plugin PoC에 narrow cloud save/build API를 추가한다. 단일 source authority와 세 경로 간 conflict/reconciliation 정책은 시험을 거쳐 결정한다.

Web editor UI의 PIE surface와 실제 game runtime을 구별한다. 현재 Studio UI PIE는 native Godot execution의 state/visual mirror다. 별도의 Web export는 실제 Godot WASM runtime이며 Chrome smoke에서 Tappy GDScript load/input/pause/restart까지 실행됨; 이는 3D/general project, full browser matrix나 full review acceptance 완료를 뜻하지 않는다. Canvas mirror를 WASM runtime으로 표기하지 않는다. 네이티브와 Web renderer capability 차이는 계속 별도 기록한다.

GDScript 현재 실행은 신뢰된 로컬 코드다. timeout/프로세스 종료는 보안 sandbox가 아니다. UGC/public execution은 별도 OS/process/worker 격리, 권한 제한, 자원 예산, credential 분리 및 공격 시험을 통과하기 전 배포할 수 없다. GDScript만 지원한다는 결정도 이 경계를 낮추지 않는다.

## 우선순위 및 진행 원칙

1. **P0 세 경로 비교:** 세 launcher와 기능을 모두 유지한다. 우선 PoC는 upstream Godot 4.7.2 vendor Web Editor + engine core patch 0 + service EditorPlugin + own web frontend.
2. **P1 협업·저장:** Classic/Godot-layout same Yjs live doc 보존; official path는 ZIP exchange 및 구현된 plugin/API 코드에서 출발하되 external Editor network flow를 검증한다.
3. **P2 일반 게임 편집·실행:** 2D/3D fixtures, stable ID/override 및 web/native runtime. Game-agnostic 제약은 review 제안으로 다루며 제품 결정과 구별한다.
4. **P3 확장 범위:** live scene collaboration, 게임 멀티플레이, streaming, physics/middleware, 모바일/server, 성능, release 운영은 증거와 우선순위를 정해 평가한다.

세부 순서는 아래 M01–M10과 gate 의존 관계로 조정한다. 날짜·기간·성능 목표치는 근거 자료가 없어 설정하지 않는다. Gate의 진입조건이 빠졌으면 시작 전 보충하고, 완료 조건을 못 넘으면 기능을 명시적으로 보류한다. 우회 구현을 완료로 재명명하지 않는다.

## 10개 마일스톤

| 단계 | 내용 / 원본 검토 추적 | 선행 gate | 상태 및 정책 |
|---|---|---|---|
| M01 실행 기반·3경로 비교 기준 | GATE-0 `T001–T004`; `F014–F016`, `F036`, `F061`, `F064–F066`; `R06`, `R11`, `R12` | 시작 | 세 launcher `--smoke-test` PASS, Godot 4.7.2 upstream Web Editor vendor hash 확인, current core patch 0 기준. ZIP local validation. ZIP import/plugin ready 확인. Strict official smoke는 upstream 오류 2건; browser plugin API 왕복은 미검증. 세 경로를 보존하고 official+plugin 우선 비교. **완료:** 공통 기준/evidence table와 version/license lock 기록. **중단:** 미검증은 미검증으로 남기고 어느 경로도 자동 폐기하지 않음. |
| M02 게임 데이터/ID·migration 계약 | GATE-2 `T013–T021`; `F028–F034`, `F059`, `R07`, `R08`, `R15` | M01 기준 고정 | Stable Actor/Component/Property/Asset IDs, explicit override, import mapping과 좌표/단위 fixture를 PoC 대상 간 비교한다. 이 모델이 game-agnostic이어야 한다는 것은 review proposal이며 확정 제품 제약이 아니다. **진입:** 각 경로의 저장 표현/보존 규칙 수집. **완료:** T013–T020의 해당 시험 또는 명시적 gap; 같은 타입 component/override/rename에 대한 비교 evidence. **중단:** ID/단위 손실이 발생한 import/export 경로는 차단. |
| M03 Godot-layout Web 편집 경로 | GATE-2; `F001`, `F009`, `F023–F027`; `T013`, `T019–T021`, `T044`, `T047–T049`; `R03`, `R14` | M01, M02 | Godot Editor 레이아웃 기반 웹 UI를 제공하고 same Yjs live document를 유지한다. Official Editor 경로와 독립 비교. 2D/3D, sorting/material/capability 및 게임 독립성은 review 요구/제안으로 분류해 검증·결정한다. **진입:** 공통 schema·UI API 초안. **완료:** 실제 common live doc update/협업 회귀와 편집 evidence. **중단:** 데이터 손실 또는 shared doc 우회가 재현되면 기능 중단. |
| M04 Official Web Editor + plugin + own frontend PoC | `F001`, `F028`, `F059–F061`; `T018`, `T060–T062` 일부 | M01, M02; ZIP 교환 | Official 4.7.2 Web Editor hash-verified vendor, project ZIP import 및 pluginReady marker 확인, plugin native headless import/API GET/PUT/stale-409 통과. API test build polling은 fake fixture. `npm run test:official-editor` strict smoke는 thread-never-started/TCP `ERR_CANT_CREATE`로 2 errors. **남음:** full browser plugin API round-trip과 strict-smoke 원인 확인; SSO/cloud hosting 미검증. Engine core patch=0. |
| M05 live collaboration·cloud save authority | GATE-3 `T022–T030`; `F002–F008`; `R13`, `R15` | M03 live doc, M04 API PoC | Classic와 Godot-layout은 same Yjs live doc. Service API의 revision conflict(409) 보호 코드가 구현됨; native HTTP plugin source API와 stale 409는 pass; full browser plugin API round-trip은 미검증. Hosted cloud/SSO, snapshots/restore, official Editor live scene collaboration은 미검증/후속. **완료:** T022–T030의 cloud/browser 증거. **중단:** source loss/overwrite/권한 우회 시 write disabled, 나머지 PoC 보존. |
| M06 GDScript runtime bridge·Web 실행 및 trust 조사 | GATE-1 `T005–T012`; Web 측 `F009`, `F012`; `R01`, `R02` | M01 lock, M02 runtime contract | 게임 스크립트 언어는 GDScript만 지원한다(사용자 확정). 좁은 typed API/handle/command 계약, browser/native 경로, source snapshot binding을 비교한다. Chrome Godot WASM Tappy load/input/pause freeze/restart smoke는 `npm run test:web-runtime`에서 통과했다. GATE-1 `T005–T012`는 원본 review의 Lua 기준 시험이므로 Lua 미지원 결정에 따라 적용하지 않는다. **진입:** trust tier 정리. **완료:** 선택한 POC의 목표 target에서 동일 시나리오·권한/loop/heap 시험. **중단:** 공개 UGC isolation evidence 전 public execution 금지 |
| M07 실제 Web runtime 및 native/Web capability 검증 | GATE-5 `T044–T052`; `F009–F027`, `F050`, `F065`; `R03`, `R10`, `R14` | M06 웹 실행물; M03 fixture | 실제 Godot Web/WASM Tappy runtime은 Chrome에서 load/input/pause freeze/restart smoke 통과(`npm run test:web-runtime` (`Tools/test-godot-web.cjs`), `Saved/Tests/web-runtime/`). Studio UI PIE는 여전히 native Godot mirror다. 이는 full acceptance 아님. Official Editor strict smoke는 별도 명령으로 재현되며 현재 2 errors로 실패. Windows DX12, Android Vulkan, iOS, headless, Chrome/Firefox/Safari를 요구 수준에 따라 profile로 나눈다. 화면 비교, 카메라/정렬/debug view, 패키지 용량, runtime HTTP 자산 차단, 서버 시각 리소스 제거. 수치 목표는 제품이 정하고 계측 전 수치 입력 금지. **진입:** 지원 target, 기능 capability table 및 실제 hardware/browser fixture 확보. **완료:** 각 출시 target의 명시 기능과 표현 차이 보고, 용량/quota 계산 및 headless 산출물 확인. **중단:** 필수 renderer 기능·target 또는 quota가 실패하면 지원 target 축소는 제품 승인 후에만; 숨겨진 fallback 금지. |
| M08 게임 멀티플레이·physics/network readiness | GATE-4 `T031–T043`; `F039–F053`, `F055`; `R05`, `R09`, `R12` | M02 IDs/schema, M06 runtime bridge, M07 선택 target | Dedicated/Listen은 별도 프로필. 한 Authority World+로컬 host input 정책 유지; 자체 안정 NetID/Generation/schema와 선택된 replication provider 하나만 사용. initial required set→참조/충돌 준비→epoch/digest Ready→server StartPlay, teleport pin/검사/commit, Room process isolation부터. Havok/Box2D/EOS 및 Godot 내장은 provider capability/권한 검증 뒤 채택. **진입:** transport·authority·provider 선택 초안, 테스트 server/client fixture. **완료:** 실 transport 1 Dedicated+2 clients 및 listen 경로에서 T031–T043; Room 간 오염·이전 epoch·collision 미준비 차단. **중단:** readiness 안전성 또는 SDK/서버 격리 미달이면 networked public release를 보류. |
| M09 streaming/asset/middleware/security/governance 옵션 평가 | GATE-6 `T053–T059`; `F039–F046`, `F054–F058`, `F063–F066`; `R02`, `R04`, `R12` | M07 profile; M08 cell/collision dependency | Review가 제안한 local Cell loading, runtime CDN/Actor streaming exclusion, Mip Residency를 서로 다른 요구 후보로 분리한다. 이 범위·금지를 사용자 확정으로 취급하지 않는다. 채택 대상은 Cell readiness, Mip 실제 VRAM 반환, provider/SDK, native plugin allowlist, malicious import/scene/shader·iframe security 증거를 수집. **진입:** 요구별 필수/선택 여부를 결정 대기 항목으로 기록; SDK/license/target 근거 준비. **완료:** 승인한 항목의 T053–T059와 asset lifecycle/Room 자원 증거. **중단:** mandatory 항목의 검증 실패는 해당 profile 출시 보류; 일반 mip sampling으로 Mip Residency를 충족 처리 금지. |
| M10 Release·운영·업그레이드·성능/AI 비교 | GATE-7 `T060–T064`; `F005–F008`, `F059–F066`; `R06`, `R10`, `R12–R16` | 이전 출시 후보 gates; 제품 quota/권한 승인 | immutable source+original/import input+runtime artifact+engine lock+test evidence 보관, reproducible clean/incremental build, snapshot restore/rollback와 save 호환, 신규 버전 회귀. 멀티룸/대용량 성능은 목표 부하를 제품이 정의한 뒤 계측. AI/Unity MCP 비교는 동등 조건·평가 보호·사용량 증거 있을 때 수행. **진입:** 실제 후보 artifact 및 지원/요금제/운영 책임자 지정. **완료:** T060–T064 evidence, 재구성/rollback 절차, license/security sign-off, unsupported feature 목록 및 해당 release capability manifest가 재현 가능. **중단:** artifact 복원이 안 되거나 입력 hash가 불완전하거나 미승인 평가기 변경이 있으면 release 거부. |

## 검증 증거 규칙 및 게이트 매핑

원본 검토 패키지 [acceptance checklist](Reviews/PlayForge_Godot_Review_v1/reports/Runtime_Acceptance_Checklist.md)의 **T001–T064는 현재 모두 미실시**로 시작한다. 이 작업 계획 문서와 기존 Tappy 테스트는 그 상태를 바꾸지 않는다. 시험을 수행하면 case ID, 코드/엔진/template lock, 시나리오·fixture hash, target/hardware/browser, 결과, 로그·캡처·CSV 위치, 제한 사항을 기록해 `Saved/Tests/` 및 해당 milestone report에 증거를 연결한다. 코드 unit/smoke 결과는 관련 acceptance case 전체의 성공을 뜻하지 않는다.

| 원본 검토 gate | 계획 단계 | 주요 범위 |
|---|---|---|
| GATE-0 | M01 | 버전·확장·라이선스·target lock |
| GATE-1 | M06 | review의 Lua 시험은 Lua 미지원으로 적용 제외; GDScript 현 구현과 Web/native runtime/bridge/trust 조사 |
| GATE-2 | M02–M04 | scene data, ID/override, 좌표, 두 web UI 및 공식 Editor ZIP/plugin exchange |
| GATE-3 | M05 | 동일 Yjs web live doc, 실제 cloud multi-user·AI/undo/snapshot; official Editor live scene sync은 후속 |
| GATE-4 | M08 | transport, listen/dedicated, replication barrier, teleport, room isolation |
| GATE-5 | M07 | renderer capability, 플랫폼, 패키지/headless |
| GATE-6 | M09 | streaming, middleware, UGC security, SDK/license |
| GATE-7 | M10 | incremental build, upgrade, rollback, AI 비교 |

### 교차 절차

- 각 구조 변경은 승인된 typed command schema, actor/component/property stable ID, base revision, idempotency key, validation result, undo metadata를 사용한다. 자유형 `.tscn` 직접 편집은 검토/가져오기 경계를 우회하는 명령이 아니다. AI도 사용자 권한·검증 gate·평가기·보안 정책을 바꿀 수 없다.
- 같은 property의 경쟁 변경은 source authority에서 판정하고 거부/merge 사유와 사용자 초안을 보존한다. presence는 일시 상태, source 변경은 내구 operation, runtime 결과는 특정 source revision/hash에 고정한다.
- 모든 profile은 `requested capability`와 `effective capability`를 별도로 기록한다. 미지원 Shader, sorting, physics, network transport, middleware 기능을 무시하지 않고 오류/승인된 fallback으로 표시한다.
- build/import cache key에는 engine/template/extension/plugin/config/target/source input hash를 포함한다. cache hit 자체는 동일성 증거가 아니다; clean/incremental 결과를 비교한다.
- workspace quota, deployment quota, runtime common package 제외 여부, AI 비용, 성능 기준치는 사용자/사업 결정 또는 실측 근거 없이는 이 계획에서 정하지 않는다.

## 미해결 결정 및 재검토 기준

미결정 항목은 [REVIEW_DECISIONS.md](REVIEW_DECISIONS.md)에 owner/증거/변경 필요 여부를 남긴다. 진행 우선순위는 official Godot Web Editor fork + minimal core + service EditorPlugin + own web frontend의 수직 PoC이며 기존 ZIP 교환을 유지한다. Classic Web과 Godot-layout Web 또한 동일 Yjs live document를 사용하는 보존할 비교 경로다. 외부 Web Editor 연동, cloud save/build plugin, source authority/충돌 모델, live scene collaboration, 실제 browser runtime, security tier와 review 제안 정책은 증거·결정 상태를 분리한다.

검토 패키지의 권고와 사용자의 방향이 다르면 패키지 제안이 사용자 결정을 대체하지 않는다. 요구 범위 변경·fallback·release exclusion은 승인과 evidence를 결정표에 기록한 이후에만 적용한다.




