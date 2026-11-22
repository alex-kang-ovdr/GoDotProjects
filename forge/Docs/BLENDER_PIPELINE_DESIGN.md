# Forge-Blender 설계서 (Headless Blender + Web Godot + AI 3D 에셋 파이프라인)

- **상태**: Phase 1 (MVP) 설계 확정 · 구현 진행 (2026-11-21)
- **작업 브랜치 / 워크트리**: `Forge-Blender` (`D:\Github\GoDotProjects-worktrees\Forge-Blender`, 기준 `origin/main` `ede6f79`)
- **목표**: 사용자가 Blender를 설치하거나 직접 조작하지 않고도, PlayForge Web Godot 에디터에서 **자연어(한국어/영어)**로 3D 프롭·메시를 생성하고, 서버의 **Headless Blender 독립 프로세스**가 glTF 2.0 (`.glb`)을 생성한 뒤, **Web Godot 에디터 씬에 자동 임포트·배치**하는 End-to-End 파이프라인을 구축한다.

---

## 1. 핵심 라이선스 및 프로세스 격리 정책 (필수 준수)

PlayForge의 자체 소스코드를 비공개로 안전하게 운영하고(GPLv3 경계 분리), 추후 다른 3D 처리 엔진으로 교체할 수 있도록 아래 4대 정책을 코드·프로토콜 레벨에서 강제한다.

| 정책 항목 | 강제 구현 방식 | 목적 |
|---|---|---|
| **1. Blender 공식 바이너리 무수정** | 공식 배포 `blender` / `blender.exe` 바이너리를 수정·패치·재컴파일 없이 그대로 호출 (`PLAYFORGE_BLENDER_BIN` 또는 OS 표준 설치 경로 탐색) | GPLv3 파생 저작물 생성 방지, 업그레이드 단순화 |
| **2. DLL 직접 링크 금지** | `bpy` C/C++ 공유 라이브러리, N-API 네이티브 바인딩, FFI, DLL 로드 일체 금지. Node.js 서버는 표준 `child_process.spawn`만 사용 | 프로세스 메모리 공간 완전 분리 |
| **3. 독립 프로세스 실행** | 작업(Job)마다 격리된 작업 디렉터리에서 `blender --background --factory-startup --python-exit-code 1 --python <worker.py> -- --request <req.json> --response <res.json>`으로 단발 실행 (`shell: false`, 타임아웃·동시성 제한) | 크래시 격리, 리소스 통제, 보안 샌드박싱 |
| **4. JSON/파일 기반 통신** | 프로세스 간 통신은 오직 스키마 검증된 JSON 파일(`request.json`, `response.json`)과 표준 파일 아티팩트(`output.glb`)로만 수행 | 엔진 비종속 계약, 추후 타 3D 엔진(Houdini, Open3D, Custom Mesher, AI 3D API 등) 무중단 교체 |

---

## 2. 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1. PlayForge Web Godot Editor & AI 3D Workbench                              │
│   - Godot Web Editor Addon: addons/playforge_blender (AI 3D Dock + Bridge)   │
│   - Standalone / Drawer UI: OfficialGodot/blender-studio.html (WebGL GLB 뷰어) │
│   - 자연어 입력 · 생성 계획 미리보기 · 3D 프리뷰 · 씬 자동 임포트/배치        │
└────────────────────────────────────┬─────────────────────────────────────────┘
                                     │ HTTPS/HTTP REST JSON + Binary GLB
                                     │ (/api/blender/plan, /jobs, /assets/:id/model.glb)
┌────────────────────────────────────▼─────────────────────────────────────────┐
│ 2. PlayForge AI Planner & 3D Pipeline Orchestrator (Node.js)                 │
│   - prompt-planner.cjs : 자연어(한/영) → 검증된 MeshRecipe v1 + 실행 계획     │
│   - job-manager.cjs    : 비동기 작업 큐 · 동시성/타임아웃 · 아티팩트 저장소    │
│   - engine-adapter.cjs : 엔진 중립 MeshEngineAdapter 인터페이스 & 레지스트리   │
│                          + glTF 2.0 (.glb) 바이너리/청크 무결성 검증기        │
└────────────────────────────────────┬─────────────────────────────────────────┘
                                     │ JSON / File IPC (No DLL Link)
                                     │ jobDir/request.json  ──▶  spawn(blender)
                                     │ jobDir/response.json ◀──  jobDir/output.glb
┌────────────────────────────────────▼─────────────────────────────────────────┐
│ 3. Swappable 3D Engine Adapter (Default: blender-cli-adapter.cjs)            │
│   - Unmodified Official Blender Binary (4.x+) in --background mode           │
│   - worker/blender_worker.py: MeshRecipe v1 해석 → 절차적 메시/PBR 생성 →    │
│     원점/스케일 정규화(Bottom-Center, Y-Up) → glTF 2.0 (.glb) 내보내기        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 엔진 교체성 (Swappable Engine Adapter)

PlayForge 코어(`job-manager.cjs`, `server.cjs`, Godot 애드온)는 Blender에 직접 의존하지 않고 `MeshEngineAdapter` 계약만 참조한다.

```js
// engine-adapter.cjs 계약
{
  id: 'blender-cli',           // 엔진 식별자
  displayName: 'Blender CLI',
  policy: {
    unmodifiedOfficialBinary: true,
    directDllLink: false,
    isolatedProcess: true,
    ipcMode: 'json-file',
  },
  async probe(),               // 설치 여부·버전·상태 진단
  async execute(jobContext),   // request.json 작성 → 독립 프로세스 실행 → response.json & .glb 반환
}
```

추후 다른 3D 엔진(예: `three-headless`, `open3d-cli`, `meshy-cloud`, `custom-cad`)을 추가할 때는 `MeshEngineRegistry.register(adapter)`에 새 어댑터만 등록하면 REST API, Godot 애드온, Web UI를 수정하지 않고 엔진을 전환할 수 있다.

---

## 3. 보안 설계: "임의 파이썬 실행 금지" → 선언형 `MeshRecipe v1`

LLM이 생성한 임의의 `bpy` 파이썬 코드를 서버의 Blender 프로세스에서 직접 `exec()`하는 방식은 파일 시스템 탈취·원격 코드 실행(RCE) 위험이 크다.
따라서 MVP 단계부터 **선언형 JSON 설계도(`MeshRecipe v1`)** 기반 파이프라인을 채택한다.

1. AI Planner(`prompt-planner.cjs`)는 사용자의 자연어를 **화이트리스트된 스키마의 JSON(`MeshRecipe v1`)**으로 변환한다.
2. Node.js 서버가 `request.json`을 기록하기 전에 모든 필드(프리셋 ID, 파트 개수 상한, 치수 범위, 재질 파라미터, 파일명 정규식)를 엄격히 검증한다.
3. `blender_worker.py`는 검증된 JSON 데이터만 읽어 `bpy` / `bmesh`로 3D 지오메트리를 조립하며, `eval` / `exec` / 외부 네트워크 호출을 일절 수행하지 않는다.

---

## 4. JSON / 파일 기반 IPC 프로토콜 (`schemaVersion: 1`)

### 4.1 입력 파일: `request.json`

```json
{
  "schemaVersion": 1,
  "jobId": "job_20261121_a1b2c3d4",
  "operation": "generate_prop",
  "output": {
    "glbPath": "output.glb",
    "format": "GLB",
    "yUp": true,
    "applyModifiers": true,
    "normalizePivot": "bottom_center"
  },
  "recipe": {
    "schemaVersion": 1,
    "name": "GoldenTreasureChest",
    "archetype": "chest",
    "style": "stylized",
    "dimensions": { "width": 1.2, "depth": 0.8, "height": 0.9 },
    "palette": {
      "primary": "#7a4a24",
      "secondary": "#d8a832",
      "accent": "#4fc3f7"
    },
    "materialProfile": {
      "primary": { "metallic": 0.08, "roughness": 0.62, "emissionStrength": 0.0 },
      "secondary": { "metallic": 0.88, "roughness": 0.24, "emissionStrength": 0.0 },
      "accent": { "metallic": 0.15, "roughness": 0.18, "emissionStrength": 1.2 }
    },
    "detailLevel": "medium",
    "seed": 42,
    "parts": []
  }
}
```

- **지원 아키타입 (`archetype`)**: `chest`(보물상자), `crate`(나무상자), `tree`(소나무/참나무), `sword`(검), `staff`(지팡이), `tower`(감시탑), `house`(집), `pillar`(기둥), `rock`(바위), `crystal`(크리스탈), `barrel`(통/드럼통), `lantern`(랜턴), `table`(탁자), `robot`(로봇), `car`(차량), `custom`(임의 `parts[]` 조합).
- **`parts[]` 커스텀 조합**: `box`, `cylinder`, `cone`, `sphere`, `icosphere`, `torus` 프리미티브에 위치(`position`), 회전(`rotationDeg`), 스케일(`scale`), 베벨(`bevel`), 색상/재질 슬롯(`materialSlot`), 스무스 셰이딩(`smooth`)을 조합해 무한 확장 가능.

### 4.2 출력 파일: `response.json` + `output.glb`

```json
{
  "schemaVersion": 1,
  "jobId": "job_20261121_a1b2c3d4",
  "ok": true,
  "engine": {
    "id": "blender-cli",
    "version": "4.3.2"
  },
  "artifact": {
    "glbPath": "output.glb",
    "format": "GLB",
    "bytes": 18432
  },
  "metrics": {
    "objectCount": 6,
    "meshCount": 6,
    "vertexCount": 412,
    "triangleCount": 768,
    "materialCount": 3,
    "boundingBox": {
      "min": [-0.6, 0.0, -0.4],
      "max": [0.6, 0.9, 0.4],
      "size": [1.2, 0.9, 0.8]
    },
    "durationMs": 640
  },
  "warnings": []
}
```

### 4.3 서버 측 바이너리 무결성 검증

`engine-adapter.cjs`는 워커가 종료된 뒤 `output.glb`에 대해 다음을 직접 검증한다.
1. 파일 크기 상한 (`<= 16 MB`, `>= 20 bytes`)
2. glTF 2.0 매직 헤더 (`0x46546C67` = `"glTF"`), 버전 `2`, 전체 길이 일치
3. JSON 청크(`0x4E4F534A`) 파싱 후 `asset.version === "2.0"`, 최소 1개 이상의 `meshes` 및 `nodes` 존재 확인
4. SHA-256 체크섬 계산 및 아티팩트 매니페스트(`manifest.json`) 영구 저장

---

## 5. REST API 계약 (`/api/blender/*`)

| 메서드 | 경로 | 설명 |
|---|---|---|
| `GET` | `/api/blender/status` | 등록된 3D 엔진 목록(`blender-cli`, `threejs-cli`), 버전, 정책 준수 플래그, 큐 상태 |
| `GET` | `/api/blender/models` | PlayForge에 연결된 AI 공급자·모델 목록(`claude-connect`, `chatgpt-connect`, `gemini-connect`, `ollama`, API 등) 및 오프라인 규칙 플래너(`heuristic`) 조회 |
| `POST` | `/api/blender/models/connect` | 로컬 호스트 전용 AI 공급자 연결(OAuth / 로컬 Ollama / API 키) |
| `POST` | `/api/blender/concept` | **1단계**: 자연어 아이디어 → 변형 가능한 컨셉 아트 시트 SVG + PBR 팔레트/비율 메타데이터 생성 (`GET /api/blender/concepts`, `/image.svg`) |
| `POST` | `/api/blender/prompt` | **2단계**: 선택한 컨셉 시트 기반 편집 가능한 상세 3D 모델링 프롬프트 및 체크리스트 생성 |
| `POST` | `/api/blender/plan` | **3-1단계**: 선택한 AI 모델로 다중 파트 `MeshRecipe v1` 모델링 계획 수립 |
| `POST` | `/api/blender/jobs` | **3-2단계**: 검토된 `recipe` 또는 프롬프트를 선택한 3D 엔진(`engineId`: `blender-cli` 또는 `threejs-cli`) 독립 프로세스로 반복 실행 (`202 Accepted` / `sync=1`) |
| `GET` | `/api/blender/jobs` | 최근 작업 목록 조회 (`projectId` 필터 지원) |
| `GET` | `/api/blender/jobs/:jobId` | 작업 상태(`queued`/`running`/`succeeded`/`failed`), 로그, IPC 요청/응답 요약, 결과 `asset` 조회 |
| `GET` | `/api/blender/assets` | 생성된 3D 에셋 목록 조회 (`projectId` 필터 지원) |
| `GET` | `/api/blender/assets/:assetId/model.glb` | 생성된 `.glb` 바이너리 다운로드 (`Content-Type: model/gltf-binary`) |
| `GET` | `/api/blender/assets/:assetId/manifest.json` | 에셋 전체 메타데이터(프롬프트, 레시피, 폴리곤/바운딩박스, SHA-256, 엔진 버전) 조회 |
| `DELETE` | `/api/blender/assets/:assetId` | 생성된 에셋 삭제 |
| `GET` | `/api/platform-addon/blender` | Web Godot 에디터 부팅 시 `addons/playforge_blender` 애드온 파일 번들 제공 |

---

## 6. Web Godot 에디터 자동 임포트 및 씬 배치 흐름

Web Godot 에디터(WASM)는 브라우저 내 MEMFS/IDBFS 위에서 동작하며 외부 Blender 프로세스를 직접 띄울 수 없다.
PlayForge는 `playforge_avatar`에서 이미 검증된 **`GLTFDocument` 직접 바이너리 파싱** 전략을 확장해 즉시 임포트·배치를 구현한다.

1. 사용자가 **Godot 에디터 내부 `AI 3D` 독** 또는 **툴바 `AI 3D` 워크벤치 드로어(`blender-studio.html`)**에 자연어 프롬프트를 입력한다.
2. 서버가 `MeshRecipe v1`을 수립하고 Headless Blender 독립 프로세스로 `output.glb`를 생성한다.
3. `addons/playforge_blender/glb_importer.gd`가 `/api/blender/assets/:assetId/model.glb` 바이트를 수신한다.
4. 프로젝트 가상 파일시스템에 아래 두 파일을 기록한다:
   - `res://assets/blender/<slug>.glb` (원본 GLB 바이너리)
   - `res://assets/blender/<slug>.blender-asset.json` (텍스트 매니페스트 — `PlatformStore` 리비전 동기화 대상)
5. `GLTFDocument.append_from_buffer(bytes, base_dir, state)` → `gltf.generate_scene(state)`로 `.import` 대기 없이 즉시 `Node3D` 계층을 생성한다.
6. 현재 편집 중인 씬 루트(`EditorInterface.get_edited_scene_root()`)에 요청된 위치/회전/스케일로 노드를 부착하고, 하위 모든 노드의 `owner`를 씬 루트로 설정하며, `EditorUndoRedoManager`에 등록해 `Ctrl+Z` 실행 취소를 지원한다.
7. 씬 저장(`.tscn`) 시 지오메트리와 메타데이터(`_playforge_blender_asset_id`, `_playforge_blender_prompt`, `_playforge_blender_sha256`)가 안전하게 보존된다.

---

## 7. 파일 소유 구조 (`Forge-Blender` 브랜치)

타 브랜치 소유 경로(`tools/worktree-ownership/owners.json`)를 침범하지 않고 독립 디렉터리에 배치하며, 공유 핫스팟은 최소 연결만 수행한다.

- **전용 경로**:
  - `forge/Docs/BLENDER_PIPELINE_DESIGN.md`
  - `forge/Tools/blender-pipeline/**` (`engine-adapter.cjs`, `blender-cli-adapter.cjs`, `prompt-planner.cjs`, `job-manager.cjs`, `worker/blender_worker.py`)
  - `forge/Godot/addons/playforge_blender/**` (`plugin.cfg`, `plugin.gd`, `blender_dock.gd`, `glb_importer.gd`)
  - `forge/OfficialGodot/blender-studio.html`, `blender-studio.css`, `blender-studio.js`
  - `forge/Tests/playforge_blender/**`
- **최소 공유 핫스팟 연동**:
  - `forge/server.cjs` (라우트 마운트 + `/api/platform-addon/blender`)
  - `forge/OfficialGodot/editor.html`, `forge/OfficialGodot/editor-bridge.js` (`playforge_blender` 애드온 마운트 + `AI 3D` 드로어/브리지)
  - `forge/Godot/addons/playforge_platform/plugin.gd` (`IGNORED_DIRS` / `MANAGED_PLUGINS`에 `playforge_blender` 등록)
  - `forge/package.json` (`test:playforge-blender` 스크립트 추가)

---

## 8. 검증 계획

1. **단위·정책·엔진 교체 테스트** (`forge/Tests/playforge_blender/blender-pipeline.test.cjs`):
   - 라이선스/격리 정책 플래그 및 CLI 인자(`--background`, `--factory-startup`, `--python-exit-code`, `shell: false`) 검증
   - 커스텀 Mock 3D 엔진 어댑터 등록 및 교체 동작 검증
   - 한국어/영어 자연어 플래너 파싱 및 보안 입력 거부(경로 탈출, 비정상 치수, 파트 수 초과) 검증
2. **로컬 Blender 4.3.2 실측 통합 테스트**:
   - 실제 `blender.exe` 독립 프로세스를 실행해 한국어/영어 프롬프트 3종 이상에서 `.glb` 생성
   - glTF 2.0 바이너리 헤더·JSON 청크·메시/머티리얼/바운딩박스·SHA-256 검증
   - HTTP API 전체 흐름(`status` → `plan` → `jobs` → `model.glb` → `manifest.json`) 검증
3. **Godot 4.7.2 Headless 임포트·씬 배치 실측 테스트** (`forge/Tests/playforge_blender/blender-godot-import.test.cjs`):
   - Blender가 생성한 `.glb`를 `Godot_v4.7.2-stable_win64_console.exe --headless`로 `glb_importer.gd` 실행
   - `Node3D` / `MeshInstance3D` 생성, `owner` 할당, `.tscn` 저장 및 재로드 검증
4. **웹 UI 및 라이브 터널 검증**:
   - PlayForge 서버 실행 + `blender-studio.html` 3D 뷰포트 렌더링 및 Web Godot 에디터 드로어 확인 + `cloudflared` 외부 HTTPS 접속 링크 제공
