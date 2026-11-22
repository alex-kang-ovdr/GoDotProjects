# PlayHub · PlayForge 직접 발견 / 사용자 보고 이슈 및 회귀 TC 매트릭스

> **운영 원칙 (Permanent QA Feedback Loop)**
> 사용자가 이슈를 보고하거나 실환경 검증 중 신규 결함이 발견될 때마다 다음 3단계를 **필수로 하나의 커밋 단위**로 수행한다.
> 1. 본 문서에 `ISS-NNN` 항목(증상 · 재현 조건 · 근본 원인 · 수정 내용 · 연결 TC)을 추가한다.
> 2. 동일 결함의 재발을 원천 차단하는 자동화 회귀 TC(`TC-REG-NNN`)를 `forge/Tests/user-reported-regressions.test.cjs` (또는 해당 영역 테스트)에 추가한다.
> 3. 신규 테스트 파일이 추가된 경우 `tools/qa/test-catalog.json`과 `tools/qa/fast-gate.json`에 즉시 등록하고 `contract.gate-hygiene.test.mjs` 통과를 확인한다.

---

## 1. 이슈 · 회귀 TC 요약 매트릭스

| ID | 발견 경로 | 영역 | 증상 요약 | 근본 원인 | 수정 커밋 / 파일 | 연결 회귀 TC | 상태 |
|---|---|---|---|---|---|---|---|
| **ISS-001** | 실환경 HTTPS 검증 | Forge / Hub CORS | 외부 HTTPS 터널(`trycloudflare.com` 등)에서 PlayForge API 호출 시 `403 Foreign origin` 발생 | `forge/server.cjs`의 `publicOrigin` 설정에 로컬 오리진만 포함되어 외부 HTTPS Origin을 차단 | `forge/server.cjs` (다중 Origin 허용 + 검증) | `TC-REG-001` (`forge/Tests/user-reported-regressions.test.cjs`) | 해결 · TC 고정 |
| **ISS-002** | AOS 실기기/에뮬레이터 QA | Hub Mobile Auth | AOS 앱 이메일 회원가입 시 `ORIGIN_REQUIRED` 에러 발생 | 모바일 API(`/api/mobile/*`) 실행 시 `config.mobile.enabled`가 비활성 상태여서 웹 CORS 체크로 폴백 | 기동 설정(`mobile.enabled: true`, `billing.enabled: true`) 및 모바일 인증 테스트 | `hub/tests/mobile-api.test.mjs` | 해결 · TC 고정 |
| **ISS-003** | 웹 실환경 QA | Asset Store Proxy | PlayHub 경유 Asset Store 진입 시 `/store/store.js`가 `403 ORIGIN_DENIED` 반환 | `store-proxy.mjs`가 업스트림(`127.0.0.1:18250`)으로 `Origin` 헤더를 리라이트할 때 업스트림 허용 목록에 자기 오리진 누락 | Store `--allowed-origins`에 업스트림 로컬 Origin 포함 | `hub/tests/store-hub-integration.test.mjs` | 해결 · TC 고정 |
| **ISS-004** | 웹 실환경 QA | PlayHub · PlayForge UX | 최상위 좌상단 브랜드 스위처 누락 및 모바일 전환 불가 | PC/모바일 헤더에 `PLAY HUB · FORGE` 전환 컴포넌트 부재 | `1e1ce9a` (`hub/public/*`, `forge/OfficialGodot/index.html`) | `hub/tests/dev-demo-ui-gating.test.mjs` | 해결 · TC 고정 |
| **ISS-005** | 사용자 보고 + 엔진 통합 QA | Web Editor WASM | 바닐라 Godot 4.7.2 WASM(`96.4 MB` / `91.95 MiB`, gz `53.7 MB`)이 서빙되어 커스텀 아바타/CoreHUD 미포함 및 초기 로딩 과다 | 1) 기본 빌드 프로필 미고정 2) 커스텀 엔진(`Forge-GodotEngine`) 미연동 3) XR/VR·불필요 모듈 포함 및 사전 압축 sidecar 부재 | `20e8c91a`, `ae7c5e7b` (`tools/forge/web_editor_release_slim.py`, `vendor-release/*.wasm{.br,.gz}`) → `56.96 MB` raw / `18.82 MB` br / `22.11 MB` gz | `TC-REG-002`, `forge/Tests/web-editor-wasm-release.test.cjs` | 해결 · TC 고정 |
| **ISS-006** | 실환경 브라우저 QA | Custom Godot WASM / Addons | `deprecated=no`로 빌드한 슬림 WASM에서 PlayForge 내장 애드온 4종(`playforge_platform`, `playforge_avatar`, `playforge_blender`, `playforge_asset_store`) `Parse error` 발생 (`add_control_to_dock()` 심볼 제거) | Godot 4.7에서 `EditorPlugin.add_control_to_dock()`이 deprecated 매크로로 감싸져 있어 `deprecated=no` 시 GDScript 컴파일 실패 | `ae7c5e7b` (`web_editor_release_slim.py`, `build-web-editor-release.ps1`, `tools/desktop/custom.py`에서 `deprecated=yes` 고정, XR/VR & `camera`만 비활성) | `TC-REG-003` (`forge/Tests/user-reported-regressions.test.cjs`) | 해결 · TC 고정 |
| **ISS-007** | **사용자 직접 보고** ("여전히 91.9mb 로 표시됨") | Forge HTTP Cache & Progress UI | 슬림 WASM(`54.3 MiB`) 배포 후에도 브라우저 로딩 바에 구버전 `91.9 MB`(`96,413,171 B`)가 계속 표시됨 | 1) `/OfficialGodot/vendor/godot.editor.wasm`이 무버전 URL에 `Cache-Control: public, max-age=86400`으로 서빙되어 브라우저가 24시간 디스크 캐시에서 구 `91.9 MB` WASM을 재사용 2) `onProgress(current, total)`이 압축/비압축 총량을 혼용 3) 구 포트(`18130`) 잔존 프로세스가 구 WASM 서빙 | 콘텐츠 해시 기반 버전 URL `/OfficialGodot/vendor/v/<tag>/godot.editor.{js,wasm}` (`immutable`) 도입, 무버전 `/vendor/*`는 `Cache-Control: no-cache`로 전환, HTML에 `__PLAYFORGE_WEB_EDITOR_WASM_TAG__`/`__PLAYFORGE_WEB_EDITOR_WASM_BYTES__` 주입 및 `editor-bridge.js` 진행률 기준 보정 | `TC-REG-004` (`forge/Tests/user-reported-regressions.test.cjs`) | 해결 · TC 고정 |
| **ISS-008** | **사용자 직접 보고** ("제작과정 보기 안됨") | PlayForge Showcase UI / Flow | 일반 사용자 상태(`DEBUG · 데모 OFF`)에서 `제작과정 보기` 필터 탭이 아예 숨겨져 접근 불가하며, `playforge:dev-demo-ui-change` 이벤트 시 `showcase` 필터가 강제로 `all`로 초기화됨 | 1) `forge/OfficialGodot/index.html`의 `button[data-filter="showcase"]`에 `data-dev-demo-ui hidden` 속성이 잘못 부착됨 2) `platform.js`에서 dev-demo OFF 시 `activeTemplateFilter === "showcase"`를 `"all"`로 리셋 3) 구 캐시/손상 WASM으로 인해 `pluginready` 미도달 | `index.html`에서 `button[data-filter="showcase"]`의 `data-dev-demo-ui hidden` 제거(상시 노출), `platform.js`의 강제 필터 리셋 제거, `brawllabs-lobby.html` 데모 메뉴로 `dev-demo-ui-gating` 계약 유지 | `TC-REG-005` (`forge/Tests/user-reported-regressions.test.cjs`) + `hub/tests/dev-demo-ui-gating.test.mjs` | 해결 · TC 고정 |
| **ISS-009** | 실환경 QA + 사용자 요청 | PlayForge Desktop Download | PlayForge 웹에서 설치용(Desktop) 에디터 다운로드 진입점 부재 및 워크트리 상위 경로(`GoDotProjects-worktrees` vs `GoDotProjects`) 오판으로 Windows `.exe` `404` 발생 | 1) 데스크톱 다운로드 UI/API 미구현 2) `resolveDesktopDownloads()`가 `..` 1단계만 탐색해 `D:\Github\GoDotProjects\Godot_v4.7.2-stable_win64.exe` 미탐지 | `ae7c5e7b` (`GET /api/desktop-downloads`, `GET /api/desktop-downloads/:id`, 데스크톱 모달, `tools/desktop/custom.py`, 상위 경로 탐색 수정) | `TC-REG-006` (`forge/Tests/user-reported-regressions.test.cjs`) | 해결 · TC 고정 |
| **ISS-010** | **사용자 직접 보고** ("데모 off 제거 admin에서 실험기능 보기 있음") | PlayHub · PlayForge · Admin UI | 일반 사용자 화면(PlayHub 헤더/계정, PlayForge 상단/사이드바/웹 에디터 툴바)에 `DEV · 데모 OFF`, `DEBUG · 데모 OFF`, `F5 새로고침` 버튼과 카드가 노출됨 | `hub/web/user/dev-demo-ui.js`와 `forge/OfficialGodot/dev-demo-ui.js`가 사용자 DOM에 데모 토글 UI를 직접 주입하고 있었음 | 사용자 화면의 모든 `데모 OFF`/사이드바 데모 카드/`F5 새로고침` 버튼 주입 완전 제거, Admin 콘솔(`GET/POST /api/admin/experimental-features`, `#admin-experimental-toggle`, 시스템 설정 패널)로 `실험기능 보기` 일원화 | `TC-REG-007` (`forge/Tests/user-reported-regressions.test.cjs`) + `hub/tests/dev-demo-ui-gating.test.mjs` | 해결 · TC 고정 |

---

## 2. 회귀 TC 상세 명세 (`forge/Tests/user-reported-regressions.test.cjs`)

모든 TC는 `tools/qa/test-catalog.json` (`tier: "fast"`, `suites: ["forge", "regression", "system"]`) 및 `tools/qa/fast-gate.json`에 등록되어 PR / 로컬 Fast Gate마다 자동 실행된다.

- **`TC-REG-001` (ISS-001 · Multi-Origin HTTPS 허용 및 Foreign Origin 차단)**
  - 쉼표 구분 다중 `publicOrigin`(로컬 + 외부 HTTPS) 설정 시 허용된 HTTPS Origin 요청은 `200`, 미등록 제3자 Origin 요청은 `403 Foreign origin`을 반환하는지 검증한다.
- **`TC-REG-002` (ISS-005 · 슬림 커스텀 Release WASM 프로필 & 모듈 구성 계약)**
  - `tools/forge/web_editor_release_slim.py`가 `optimize="size_extra"`, `debug_symbols="no"`, `lto="thin"`, `module_playforge_core_enabled="yes"`, `module_fbx_enabled="yes"`, `module_jolt_physics_enabled="yes"`, `deprecated="yes"`를 유지하고 XR/VR(`openxr`, `webxr`, `mobile_vr`)과 `camera`를 비활성화하는지 검증한다.
  - 로컬에 `forge/OfficialGodot/vendor-release/godot.editor.wasm`이 프로비저닝된 환경에서는 크기(`<= 65 MiB`, 구 `91.9 MiB` 회귀 방지), DWARF 스트립, 사전 압축 `.br`/`.gz` 존재, 커스텀 심볼(`PlayForgePlatform`, `JoltPhysicsServer3D`, `EditorSceneFormatImporterUFBX`) 포함을 추가 검증한다.
- **`TC-REG-003` (ISS-006 · `deprecated=yes` 및 Desktop/Web 공통 제외 모듈 계약)**
  - `tools/forge/web_editor_release_slim.py`, `tools/forge/build-web-editor-release.ps1`, `tools/desktop/custom.py` 모두 `deprecated=yes`(PlayForge 내장 애드온 `add_control_to_dock` 호환) 및 XR/VR + `camera` 제외 정책이 일치하는지 검증한다.
- **`TC-REG-004` (ISS-007 · 콘텐츠 해시 기반 버전 WASM URL 및 91.9MB 스테일 캐시 차단)**
  - `/api/health` 및 `/api/session`이 `webEditorWasmTag`와 `webEditorWasmBytes`를 반환하는지 검증한다.
  - `/OfficialGodot/index.html`, `/OfficialGodot/editor.html`, `/OfficialGodot/showcase-game.html`이 `__PLAYFORGE_WEB_EDITOR_WASM_TAG__`, `__PLAYFORGE_WEB_EDITOR_WASM_BYTES__`를 주입하고 `vendor/v/<tag>/godot.editor.js`로 스크립트 경로를 재작성하는지 검증한다.
  - 현재 태그 `/OfficialGodot/vendor/v/<tag>/godot.editor.wasm`은 `Cache-Control: public, max-age=31536000, immutable` + `X-PlayForge-Web-Editor-Wasm: release`를 반환하고, 무버전 `/OfficialGodot/vendor/godot.editor.wasm` 및 구 태그 `/OfficialGodot/vendor/v/stale-tag/godot.editor.wasm`은 `Cache-Control: no-cache`를 반환해 24시간 스테일 캐시 재발을 원천 차단하는지 검증한다.
  - `editor-bridge.js`와 `showcase-game.js`, `platform.js`가 버전 URL(`/OfficialGodot/vendor/v/`)을 참조하고 `editor-bridge.js`가 `knownWasmBytes` 기반 총량 보정을 유지하는지 검증한다.
- **`TC-REG-005` (ISS-008 · 제작과정 보기(Showcase) 정식 사용자 기능 보호 계약 — `prod` · `dev-demo OFF` 공통)**
  - **기능 분류 원칙**: `제작과정 보기`(Showcase / Guided Replay)는 개발/데모 전용 도구가 아닌 **완성된 정식 사용자 기능**이며, `prod`/`release` 빌드 및 `DEBUG · 데모 OFF` 상태에서 절대로 숨기거나 `data-dev-demo-ui`로 게이팅해서는 안 된다.
  - `forge/OfficialGodot/index.html` 및 `buildMode: "prod"` HTML 응답의 `button[data-filter="showcase"]`에 `data-dev-demo-ui` 또는 `hidden` 속성이 없음을 검증한다.
  - `forge/OfficialGodot/platform.js`가 `playforge:dev-demo-ui-change` 수신 시 `showcase` 필터를 강제 초기화하지 않음을 검증한다.
  - `buildMode: "prod"` 환경에서도 `/api/platform/templates`의 6개 쇼케이스 템플릿(`brawllabs`, `fortress-war`, `iron-wood`, `survivor-io`, `tappy-chicken`, `tappy-chicken-mmo`)이 `showcase: true`로 노출되고 `mode: "showcase"` 프로젝트 생성이 성공(`201`)함을 검증하며, `hub/tests/dev-demo-ui-gating.test.mjs`에서도 `prod`·`test(OFF)` 양쪽에서 상시 노출을 이중 검증한다.
- **`TC-REG-006` (ISS-009 · PlayForge 설치용 Desktop 다운로드 API 및 UI 계약)**
  - `GET /api/desktop-downloads`가 4개 데스크톱 타겟(`windows-editor`, `windows-launcher`, `macos-editor`, `linux-editor`)과 `excludedModules` (`openxr`, `webxr`, `mobile_vr`, `camera`)를 반환하고, `forge/OfficialGodot/index.html`에 `#desktopDownloadBtn` 및 `#desktopDownloadModal`이 존재함을 검증한다.
- **`TC-REG-007` (ISS-010 · 사용자 화면 `데모 OFF` 완전 제거 및 Admin `실험기능 보기` 일원화 계약)**
  - `hub/web/user/dev-demo-ui.js` 및 `forge/OfficialGodot/dev-demo-ui.js`가 사용자 DOM에 `데모 OFF`/`테스트/데모`/`F5 새로고침` 버튼이나 카드를 일절 주입하지 않음을 검증한다.
  - Admin 콘솔(`hub/web/admin/index.html`, `admin.js`, `domain-views.js`)과 서버(`GET/POST /api/admin/experimental-features`, `/api/session`의 `experimentalFeaturesEnabled`)가 `실험기능 보기` 제어를 단일 소유함을 검증한다.

---

## 3. 신규 이슈 보고 시 체크리스트

```markdown
- [ ] 이슈 ID(`ISS-NNN`)를 본 문서 표에 추가 (발견 경로 · 증상 · 근본 원인 · 수정 파일)
- [ ] 재발 방지 회귀 TC(`TC-REG-NNN`)를 자동화 테스트 파일에 추가
- [ ] 새 테스트 파일인 경우 `tools/qa/test-catalog.json` + `tools/qa/fast-gate.json` 등록
- [ ] `node --test forge/Tests/user-reported-regressions.test.cjs tools/qa/contract.gate-hygiene.test.mjs` 통과 확인
- [ ] 실브라우저/실환경 영향 이슈라면 Playwright 또는 실기기 검증 스냅샷 확보
```
