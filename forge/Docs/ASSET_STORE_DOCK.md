# PlayForge Asset Store 도크 Addon 및 Node 브리지

작성일: 2026-11-20 · 대상 브랜치: `Forge-AssetStore` · 기준 엔진: Godot 4.7.2 / Node v24

## 1. 개요 및 서비스 경계

이 문서는 PlayForge Store 독립 웹([store/README.md](../../store/README.md))과 Godot 4.7.2 에디터 사이의 비동기 연동 계층을 구현한 **Godot Store 도크 Addon**(`forge/Godot/addons/playforge_asset_store/`) 및 **Node 브리지**(`forge/Tools/asset-library.cjs`)의 설계·사용법을 정리합니다.

설계 근거([docs/STORE_UNITY_INTEGRATION_RESEARCH.md](../../docs/STORE_UNITY_INTEGRATION_RESEARCH.md))에 따라 다음 경계를 엄격히 준수합니다.

- **중앙 메인 화면 및 iframe 금지**: `plugin.gd`는 `_has_main_screen()`을 `false`로 유지하며, 에디터 중앙 작업 영역 탭을 추가하거나 Store 웹 페이지를 iframe으로 내장하지 않습니다.
- **기본 도크 슬롯 등록**: 기본값은 `DOCK_SLOT_RIGHT_UL`이며, 사용자 선택에 따라 `DOCK_SLOT_LEFT_UL` 또는 하단 패널(`add_control_to_bottom_panel`)로 검색어·선택 항목·검토 상태를 유지한 채 전환할 수 있습니다.
- **외부 브라우저 분리**: 풍부한 탐색·상세 콘텐츠·일반 게시글(`editorial`) 열람은 `OS.shell_open()`(웹 환경에서는 `window.open`)을 통해 외부 Store 웹에서 처리합니다.
- **불변 계약 준수**: 모든 패키지 검증·스테이징·적용은 [package-contract.schema.json](../../store/schemas/package-contract.schema.json)을 따릅니다.

## 2. 구성 파일

### Godot 4.7.2 Addon (`forge/Godot/addons/playforge_asset_store/`)

| 파일 | 역할 |
|---|---|
| `plugin.cfg` | 에디터 플러그인 메타데이터 (`PlayForge Asset Store`, v1.0) |
| `plugin.gd` | `EditorPlugin`. `DOCK_SLOT_RIGHT_UL`/`DOCK_SLOT_LEFT_UL`/하단 패널 등록·전환, 환경 변수 기반 엔드포인트 설정, 중앙 탭·iframe 미사용 |
| `store_dock.gd` | 네이티브 도크 UI (`스토어 웹 열기`, `내 라이브러리 새로고침`, 대상 프로젝트 선택, 검색·유형 필터, 버전·유형·호환성·다이제스트 표시, `설치 계획 검토`, `선택 프로젝트에 적용`, `editorial` 설치 버튼 숨김) |
| `package_installer.gd` | 6단계 상태 모델, 계약 검증, `editorial` 설치 차단, SHA-256 `artifact_digest` 및 파일 매니페스트 무결성 검사, 충돌·의존성 검토, 선택 프로젝트 격리 적용 및 `.playforge-store-installations.json` 기록 |

### Node 브리지 (`forge/Tools/asset-library.cjs`)

기존 Godot Asset Library 호환 `createAssetLibraryHandler(root, options)`의 읽기 전용 `GET`/`HEAD` 계약(`/api/asset-library`, `/tags`, `/licenses`, `/search/query`, `/assets/...`, `/releases/...`, `/packs/...`)은 그대로 유지하면서 Store 계약용 6단계 상태 모델과 `/api/asset-library/store/*` 엔드포인트를 제공합니다.

## 3. 6단계 상태 모델 및 안전 규칙

| 단계 | 상태 (`store_state`) | 담당 함수 (Node / GDScript) | 프로젝트 파일 변경 | 핵심 검증 |
|---|---|---|---|---|
| 1 | `saved_to_library` | `saveLibraryEntry`, `queryLibraryEntries` / `stage_1_verify_library_entry` | 없음 | Hub 계정 라이브러리(`StoreLibraryEntry`) 조회 및 계약 스키마 검사 |
| 2 | `license_verified` | `verifyUsageLicense` / `stage_2_verify_license` | 없음 | `editorial` 차단, `UsageGrant`·`license_snapshot_ref` 및 `engine_compatibility`(`godot_min`, `platforms`) 확인 |
| 3 | `artifact_downloaded` | `stageVerifiedArtifact` / `stage_3_verify_and_stage_artifact` | 없음 | 활성 프로젝트 외부(`staging_root`)에 다운로드/해제 후 전체 아카이브 SHA-256 `artifact_digest` 및 `file_manifest` 개별 해시·바이트 검증 |
| 4 | `plan_reviewed` | `reviewInstallPlan` / `stage_4_review_install_plan` | 없음 | 선택 프로젝트(`selected_project_root`) 기준 추가/동일/충돌 파일, 실행 가능 Addon(`addons/`), 의존성(`dependency_manifest_hash`) 점검 및 `project_fingerprint` 고정 |
| 5 | `applied_to_project` | `applyInstallPlan` / `stage_5_apply_install_plan` | 선택 프로젝트만 | `plan_reviewed` 상태, `project_fingerprint` 일치(변경 시 `STALE_INSTALL_PLAN`), 충돌 허용 여부 재확인 후 선택 프로젝트에만 기록 + `installation_record` 저장 |
| 6 | `update_available` | `checkReleaseUpdate` / `stage_6_check_update` | 없음 | 설치된 `installation_record`와 최신 불변 릴리스 비교(자동 파일 변경 없음) |

### 핵심 차단 규칙

1. **`release_kind === 'editorial'` 설치 차단**: `rejectEditorialInstall` / `reject_editorial_install` 및 2~5단계 모든 경로가 `editorial` 항목의 설치 시도 시 `EDITORIAL_NOT_INSTALLABLE` 오류로 즉시 거부하며, 도크 UI에서도 설치 검토·적용 버튼을 노출하지 않습니다.
2. **SHA-256 변조 거부**: 다운로드 바이트 또는 개별 파일이 `artifact_digest` / `file_manifest[].sha256`과 일치하지 않으면 `ARTIFACT_DIGEST_MISMATCH` / `FILE_HASH_MISMATCH`로 스테이징을 중단하고 활성 프로젝트 파일을 건드리지 않습니다.
3. **충돌·사전변경 보호**: 대상 프로젝트에 내용이 다른 동일 경로 파일이 존재하면 `CONFLICT_DETECTED`로 중단하며 사용자가 명시적으로 덮어쓰기를 허용해야 적용됩니다. 검토(4단계) 이후 대상 프로젝트가 수정되면 `STALE_INSTALL_PLAN`으로 차단하여 재검토를 강제합니다.
4. **선택 프로젝트 외 미변경**: 적용(5단계)은 선택된 `project_id` / `project_root` 내부의 안전한 `addons/`·`assets/` 경로와 `.playforge-store-installations.json`만 갱신합니다.

## 4. Store HTTP API (`/api/asset-library/store/*`)

루프백 요청(`localhost`, `127.0.0.1`, `::1`)에만 허용되며, 기존 `/api/asset-library` 하위 비-Store 경로는 계속 `GET`/`HEAD` 읽기 전용(`405`)으로 동작합니다.

- `GET /api/asset-library/store/library?account_id=...&project_id=...`
- `GET /api/asset-library/store/releases/:assetId?release_id=...`
- `GET /api/asset-library/store/artifacts/:releaseId` (`ETag`, `X-PlayForge-Artifact-Digest` 헤더 포함)
- `GET /api/asset-library/store/updates?account_id=...&project_id=...`
- `POST /api/asset-library/store/library`
- `POST /api/asset-library/store/license`
- `POST /api/asset-library/store/stage`
- `POST /api/asset-library/store/plan`
- `POST /api/asset-library/store/apply`
- `POST /api/asset-library/store/check-updates`

## 5. 환경 변수 및 로컬 설정

| 변수 / 파일 | 용도 | 기본값 |
|---|---|---|
| `PLAYFORGE_STORE_WEB_URL` | `스토어 웹 열기` 대상 URL | `http://127.0.0.1:4173/store` |
| `PLAYFORGE_STORE_API_URL` | Store API 루트 URL | `http://127.0.0.1:4173/api/asset-library/store` |
| `PLAYFORGE_ASSET_LIBRARY_URL` | 레거시 설정 시 `<url>/store`로 자동 유도 | 미설정 |
| `PLAYFORGE_PROJECT_ID` | 기본 선택 프로젝트 ID | `res://.playforge-platform.json` 또는 `current` |
| `PLAYFORGE_STORE_DOCK_SLOT` | 초기 도크 위치 (`right`, `left`, `bottom`) | `right` (`DOCK_SLOT_RIGHT_UL`) |
| `res://.playforge-store-library.json` | 오프라인/테스트용 라이브러리 캐시(선택) | 없음 |
| `<project_root>/.playforge-store-installations.json` | 프로젝트별 `installation_record` 영속 파일 | 적용 시 생성 |

## 6. 테스트 및 검증

```powershell
# Store 도크 Addon & Node 브리지 통합 테스트 (Node v24 + Godot 4.7.2 헤드리스)
node --test forge/Tests/playforge_asset_store/asset-store-dock.test.cjs

# 기존 Store 계약 및 레거시 Asset Library 회귀 확인
node --test store/tests/package-contract.test.mjs
node --test forge/Tests/playforge_replay/asset-library-editor.test.cjs

# 워크트리 소유권 검증
node tools/worktree-ownership/check-ownership.mjs
```
