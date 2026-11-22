# PlayForge Asset Store 크로스 플랫폼 유저 시나리오 검증 리포트

작성일: 2026-11-21 · 대상 브랜치/워크트리: `Forge-AssetStore` (`D:/Github/GoDotProjects-worktrees/Forge-AssetStore`) · 기준 커밋: `8d627d5` (`origin/main` 최신화 완료)  
검증 범위: **PlayForge 전용 (PC Web · Mobile Web · Godot 웹 에디터 · 설치형 데스크톱 Godot 4.7.2 [Windows/Linux/macOS])** — **AOS / iOS 네이티브 앱 미지원 경계 포함**

---

## 1. 워크트리 구성 및 소유권 점검

- 기존 워크트리 `D:/Github/GoDotProjects-worktrees/Forge-AssetStore`를 최신 `origin/main` (`8d627d5`)으로 fast-forward 동기화함.
- 소유권 검사 (`node tools/worktree-ownership/check-ownership.mjs`): **fail 0** (`ok` 소유 경로 + `shared` 2건 `forge/server.cjs`, `forge/OfficialGodot/editor-bridge.js`).

---

## 2. 검증 중 발견·수정한 크로스 플랫폼 결함

| # | 발견 결함 | 영향 플랫폼 | 수정 파일 | 수정 내용 |
|---|---|---|---|---|
| 1 | **Store Web ↔ Forge 브리지 미연동**: `forge/Tools/asset-library.cjs`의 `createStoreBridge()`가 빈 인메모리 맵만 사용하여, Store Web에서 저장한 `StoreLibraryEntry`가 Godot Store 도크의 `내 라이브러리 새로고침`에 나타나지 않음 | PC Web · Mobile Web ↔ 설치형/웹 Godot | `forge/Tools/asset-library.cjs` | `storeServerUrl`(`PLAYFORGE_STORE_SERVER_URL`) 기반 업스트림 동기화(`syncUpstreamLibrary`, `ensureUpstreamArtifact`) 추가. 계정별 `My Assets` 조회, `package-contract.schema.json` 엄격 검증, `.playforgepkg` SHA-256 검증 후 중계 |
| 2 | **AOS/iOS 플랫폼 오분류 버그**: `package_installer.gd::current_platform_name()`가 `Android`/`iOS`에서 `"linux"`로 폴백되어 `PLATFORM_INCOMPATIBLE` 차단을 우회할 수 있었음 | AOS / iOS 차단 경계 | `forge/Godot/addons/playforge_asset_store/package_installer.gd`, `forge/Tools/asset-library.cjs` | `android`/`ios` 명시 판별 및 `is_supported_forge_platform()` 추가. Forge 전용 4개 플랫폼(`web`, `windows`, `linux`, `macos`) 외 즉시 거부 |
| 3 | **Godot 웹 에디터 애드온 미마운트**: `forge/server.cjs`와 `forge/OfficialGodot/editor-bridge.js`에 `playforge_asset_store` 배포/마운트 경로가 누락되어 웹 에디터에서 도크가 로드되지 않음 | Godot 웹 에디터 | `forge/server.cjs`, `forge/OfficialGodot/editor-bridge.js`, `forge/Godot/addons/playforge_asset_store/plugin.gd` | `GET /api/platform-addon/asset-store` 추가, `editor-bridge.js` 자동 마운트 및 `.playforge-store-config.json` / `window.__playforgeStoreWebUrl` 전달 |
| 4 | **웹 에디터 팝업 차단 폴백 및 계정 연동 누락**: `store_dock.gd` 웹 `window.open()` 실패 시 클립보드 폴백 미동작, `plugin.gd`에 `PLAYFORGE_STORE_ACCOUNT_ID` 미전달 | Godot 웹 에디터 · 설치형 Godot (Hub SSO) | `forge/Godot/addons/playforge_asset_store/store_dock.gd`, `plugin.gd` | `Boolean(window.open(...))` 반환 확인으로 팝업 차단 시 클립보드 복사 폴백 동작, `set_account_id()` 및 `PLAYFORGE_STORE_ACCOUNT_ID` 연동 |

---

## 3. 크로스 플랫폼 유저 시나리오 검증 결과

### 실행 명령 및 총계
```powershell
node --test forge/Tests/playforge_asset_store/asset-store-dock.test.cjs forge/Tests/playforge_asset_store/cross-platform-scenarios.test.cjs store/tests/package-contract.test.mjs store/tests/store-api.test.mjs
```
- **결과: 34 / 34 PASS (0 FAIL, 0 SKIP)** — 실행 시간 25.3s

### 시나리오별 상세 검증표

| 시나리오 | 대상 플랫폼 / 경로 | 검증 항목 | 결과 |
|---|---|---|---|
| **S1** | PC Store Web (`store-api.mjs`) → Forge Bridge (`server.cjs` + `asset-library.cjs`) → 설치형 Godot 4.7.2 (`StoreDock`) | 웹에서 `lowpoly-fortress-pack`, `ui-tactical-hud-kit` 저장 → Godot 도크 `refresh_library()` 실시간 동기화 → 실제 `.playforgepkg` 다운로드·SHA-256/`file_manifest` 검증 → `executable_addon` 감지 → `proj-a`만 격리 적용 & `.playforge-store-installations.json` 기록 (`proj-b` 미변경) | **PASS** |
| **S2** | Hub SSO 멀티 계정 (Store Web ↔ Forge Bridge ↔ Godot 4.7.2 `--editor`) | `alice@playhub.local` / `bob@playhub.local` / `charlie@playhub.local` 간 라이브러리 완전 격리 및 `PLAYFORGE_STORE_ACCOUNT_ID` 연동 | **PASS** |
| **S3** | Forge 4개 플랫폼(`web`, `windows`, `linux`, `macos`) + **AOS/iOS 미지원 경계** | `package-contract.schema.json`·Node 브리지·Godot `PackageInstaller` 모두 `android`/`ios` 거부(`PLATFORM_INCOMPATIBLE`/`ENGINE_INCOMPATIBLE`), `android/`·`ios/` 네이티브 소스에 Forge Asset Store 미노출 확인 | **PASS** |
| **S4** | Godot 웹 에디터 (`server.cjs` + `editor-bridge.js` + `plugin.gd` + `store_dock.gd`) | `/api/platform-addon/asset-store` 4개 파일·설정 서빙, `editor-bridge.js` 마운트·활성화, `.playforge-store-config.json` 로드, 우측→하단 도크 전환 후 재기동 시 슬롯 복원, 브라우저 열기 차단 시 클립보드 폴백, `_has_main_screen() == false` | **PASS** |
| **S5** | 장애 격리 & 보안 경계 | Store Web 중단 시 Forge 기본/프로젝트 API 200 유지 및 Store 브리지 `503 STORE_UPSTREAM_UNAVAILABLE` 안전 반환, 변조된 업스트림 `.playforgepkg` `422 ARTIFACT_DIGEST_MISMATCH` 즉시 차단 | **PASS** |
| **S6** | 모바일 웹 비동기 핸드오프 & Editorial 차단 | 모바일 웹에서 `sfx-siege-audio-pack` 저장(`installation_record: null`, `canInstallInStoreWeb() === false`), `editorial`(`godot-47-dock-guide`) 저장 시도 `422 EDITORIAL_NOT_INSTALLABLE` 거부, 이후 Forge 브리지 동기화 확인 | **PASS** |
| **S7** | 실제 Chrome CDP (PC Web 1280×800 + Mobile Web 390×844) → Forge Bridge 실시간 반영 | 실브라우저 DOM 클릭으로 PC/모바일 웹 라이브러리 저장, 가로 오버플로 0(`scrollWidth <= innerWidth`), 런타임 예외 0건, 실시간 Forge 브리지 2건 동기화 및 증거 스크린샷 확보 | **PASS** |
| **회귀** | `asset-store-dock.test.cjs` (11건) · `package-contract.test.mjs` (3건) · `store-api.test.mjs` (13건) | 기존 레거시 `/api/asset-library`, 6단계 계약, ZIP bomb 방어, CORS/Origin 보안, CLI 프로세스 재기동 영속성 | **27/27 PASS** |

---

## 4. 미검증 / 타 브랜치 소유 사전 기준선 참고 사항

- **실제 WebAssembly Godot 웹 에디터 브라우저 기동**: Windows 로컬 환경에서 `server.cjs` 애드온 서빙 + `editor-bridge.js` 마운트 + Godot 4.7.2 헤드리스 `.playforge-store-config.json`/도크 동작까지 검증했으며, 실제 브라우저 WASM 캔버스 내부에서의 수동 클릭은 라이브 서버 URL에서 바로 확인 가능.
- **타 브랜치 소유 기존 테스트 관찰 사항 (본 브랜치 미수정)**:
  - `forge/Tests/playforge_replay/asset-library-editor.test.cjs` (`Forge-AgentReplay` 소유): 한국어 Windows 로캘에서 Godot 기본 Asset Store 다이얼로그 버튼 텍스트가 `"다운로드"`로 표시되어 영문 `"Download"` 기대값과 불일치.
  - `hub/tests/store-admin.test.mjs` (`PlayHub-Admin` 소유): Node v24.22.1 실행 시 5건 중 4건 통과, 1건(`line 158`)은 기존 `/api/admin/games` 세션 쿠키 전달 이슈 확인.

---

## 5. 증거 스크린샷

- PC Web (1280×800): `forge/Saved/Tests/asset-store-xplat/01-pc-web-store-1280x800.png`
- Mobile Web (390×844): `forge/Saved/Tests/asset-store-xplat/02-mobile-web-store-390x844.png`
