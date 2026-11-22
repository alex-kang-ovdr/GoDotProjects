# Forge-Tripo 설계서 및 연동 PoC 실험 리포트

- **분류**: 실험 기능 (PoC · `PlayHub-Platform` 허브 트렁크 통합 제외)
- **작업 브랜치 / 워크트리**: `Forge-Tripo` (`D:\Github\GoDotProjects-worktrees\Forge-Tripo`, 기준 `PlayHub-Platform`)
- **작성일**: 2026-11-22
- **목표**: PlayForge에서 **Tripo3D OpenAPI v3**(`https://openapi.tripo3d.ai/v3`)를 연동해 **Text-to-3D · Image-to-3D · Multiview-to-3D · Auto-Rigging · Animation Retargeting · 게임용 폴리곤 최적화(Convert)**를 수행하고, 생성된 glTF 2.0(`.glb`)을 로컬 캐싱·무결성 검증 후 **Web Godot 4.7.2 에디터 씬에 즉시 임포트·배치**하는 End-to-End PoC를 검증한다.

---

## 1. PlayForge 3D 생성 파이프라인 비교

| 구분 | Headless Blender (`blender-cli`) | Headless Three.js (`threejs-cli`) | **Tripo3D API v3 (`Forge-Tripo` PoC)** |
|---|---|---|---|
| 생성 방식 | 선언형 `MeshRecipe v1` → 절차적 `bpy` 조립 | 선언형 `MeshRecipe v1` → 절차적 Three.js 조립 | **생성형 AI 3D 파운데이션 모델(H3.1 / P1)** |
| 입력 모달리티 | 자연어 → LLM 레시피 JSON | 자연어 → LLM 레시피 JSON | **Text / Single Image / 4-View Multiview** |
| 유기적·고디테일 품질 | 기하 프리미티브 조합 수준 | 기하 프리미티브 조합 수준 | **고해상도 오가닉 메시 + PBR 텍스처 맵** |
| 자동 리깅·애니메이션 | 미지원 | 미지원 | **`/v3/animations/rig` + `/retarget` 내장** |
| 게임 최적화 | 레시피 단계 통제 | 레시피 단계 통제 | **`/v3/models/convert` (`face_limit`, `quad`)** |
| 실행 비용·지연 | 로컬 무료 (~0.7s) | 로컬 무료 (~0.45s) | 클라우드 크레딧 (약 15~35cr, 수십 초 비동기) |
| Godot 연동 | `GLTFDocument` 즉시 임포트 | `GLTFDocument` 즉시 임포트 | **`GLTFDocument` + `Skeleton3D` + `AnimationPlayer` 자동 감지** |

---

## 2. Tripo3D OpenAPI v3 프로토콜 매핑

> **API 수명주기 참고**: 기존 `api.tripo3d.ai/v2/openapi/task` 단일 엔드포인트(V2)는 공식 종료·폐기되어, 본 PoC는 **공식 V3 엔드포인트**(`https://openapi.tripo3d.ai/v3` 글로벌 / `https://openapi.tripo3d.com/v3` 중국 리전)를 기본 대상으로 구현했다. 응답 파서는 V3(`output.model_url`, `output.model_mesh.url`, `output.rendered_image_url`)와 레거시 필드(`pbr_model`, `model`)를 모두 정규화한다.

| 기능 | HTTP 엔드포인트 (V3) | 핵심 파라미터 / 동작 |
|---|---|---|
| 크레딧 잔액 조회 | `GET /v3/account/balance` | `balance`, `frozen` 조회 |
| 소스 이미지 업로드 | `POST /v3/files` (`multipart/form-data`) | PNG/JPEG/WebP 업로드 → `file_token` 발급 |
| Text-to-3D | `POST /v3/generation/text-to-model` | `prompt`, `negative_prompt`, `model`(`v3.1-20260211` / `P1-20260311`), `texture`, `pbr`, `texture_quality`, `quad`, `face_limit`, `model_seed` |
| Image-to-3D | `POST /v3/generation/image-to-model` | `file: { type: 'file_token', file_token }`, `model`, `texture`, `pbr` |
| Multiview-to-3D | `POST /v3/generation/multiview-to-model` | `files: [...]` (2~4장 정면/좌/후/우), `model`, `pbr` |
| 태스크 폴링 | `GET /v3/tasks/{taskId}` | `queued` → `running(0~99%)` → `success` → 즉시 다운로드 |
| 리깅 가능 여부 확인 | `POST /v3/animations/rig-check` | `original_model_task_id` → `riggable`, `rig_type` |
| 자동 리깅 | `POST /v3/animations/rig` | `original_model_task_id`, `rig_type`(`biped` 등), `out_format: 'glb'` |
| 애니메이션 리타겟 | `POST /v3/animations/retarget` | `original_model_task_id`, `animation`(`preset:idle/walk/run/jump/slash/dance`) |
| 포맷 변환·최적화 | `POST /v3/models/convert` | `original_model_task_id`, `format`(`GLTF`/`FBX`/`OBJ`), `face_limit`, `quad` |

### 서명된 URL 단기 만료 대응
Tripo v3 결과 URL(`model_url`, `rendered_image_url`)은 약 5분 내 만료된다. 따라서 `tripo-job-manager.cjs`는 폴링 완료 즉시 서버가 `.glb`와 썸네일을 다운로드하여 `forge/Saved/Tripo/assets/<assetId>/`에 영구 캐싱하고, `glb-validator.cjs`로 glTF 2.0 바이너리 무결성·SHA-256·게임 적합성 등급(`A`/`B`/`C`)을 산출한다.

---

## 3. 듀얼 실행 모드 (Live vs Simulation)

1. **Live 모드 (`live`)**:
   - 환경변수 `TRIPO_API_KEY`(또는 `PLAYFORGE_TRIPO_API_KEY`) 또는 Tripo Studio UI의 로컬 전용 설정 모달(`POST /api/tripo/config`)에서 `tsk_...` 키를 입력하면 실제 Tripo3D API v3를 호출한다.
2. **Simulation / 샌드박스 모드 (`simulation`)**:
   - API 키 없이도 크레딧 0 소모로 전체 워크플로우를 즉시 체험·자동화 검증할 수 있다.
   - `tripo-simulator.cjs`가 Tripo v3 상태 전이(`queued` → `running` → `success`)와 크레딧 예약/정산을 그대로 모사하고, `glb-validator.cjs`의 절차적 glTF 2.0 합성기가 **내장 PNG PBR 알베도 텍스처 + 실제 5-본 `skins` 스켈레톤 + `animations` 키프레임 채널**을 포함한 표준 `.glb`를 생성한다.

---

## 4. 보안 및 격리 정책

- **API 키 비노출**: 서버 메모리 및 `forge/Saved/Tripo/.credentials.json`(gitignored, `0600`)에만 보관하며, `/api/tripo/status` 등 모든 응답에서는 `tsk_xx••••1234` 마스킹 값만 반환한다.
- **로컬 전용 설정 변경**: `POST /api/tripo/config`는 `127.0.0.1` / `::1` 직접 접속만 허용하며 `x-forwarded-for`·`cf-connecting-ip` 헤더가 존재하면 `403 Forbidden`으로 차단한다(Cloudflare 터널 외부 방문자의 키 변조 차단).
- **SSRF 방어**: 원격 URL 다운로드 시 HTTPS 외 프로토콜 및 사설·루프백·메타데이터 IP(`127.*`, `10.*`, `169.254.*`, `172.16-31.*`, `192.168.*`, `::1`, `localhost`)를 차단한다(테스트용 `allowLoopbackMock` 옵션이 명시된 경우에만 지정 origin 예외).
- **바이너리 검증**: 업로드 이미지는 PNG/JPEG/WebP 매직 바이트 및 10MB 상한 검증, 다운로드 GLB는 `glTF` v2 매직 헤더·청크 길이·메시/노드 존재·64MB 상한 검증을 거친다.

---

## 5. PlayForge REST API (`/api/tripo/*`) 및 파일 소유 구조

- **REST API**:
  - `GET /api/tripo/status`, `GET /api/tripo/balance`, `POST /api/tripo/config`
  - `POST /api/tripo/uploads`, `GET /api/tripo/uploads/:uploadId`
  - `POST /api/tripo/jobs`, `GET /api/tripo/jobs`, `GET /api/tripo/jobs/:jobId`, `POST /api/tripo/jobs/:jobId/cancel`
  - `POST /api/tripo/assets/:assetId/rig`, `/retarget`, `/convert`
  - `GET /api/tripo/assets`, `.../model.glb`, `.../preview.png`, `.../manifest.json`, `DELETE /api/tripo/assets/:assetId`
  - `GET /api/platform-addon/tripo`
- **전용 소유 경로 (`Forge-Tripo`)**:
  - `forge/Docs/TRIPO_PIPELINE_POC.md`
  - `forge/Tools/tripo-pipeline/` (`tripo-client.cjs`, `glb-validator.cjs`, `tripo-simulator.cjs`, `tripo-job-manager.cjs`)
  - `forge/Godot/addons/playforge_tripo/` (`plugin.cfg`, `plugin.gd`, `glb_importer.gd`, `tripo_dock.gd`)
  - `forge/OfficialGodot/tripo-studio.{html,css,js}`
  - `forge/Tests/playforge_tripo/` (`tripo-pipeline.test.cjs`, `tripo-godot-import.test.cjs`)
