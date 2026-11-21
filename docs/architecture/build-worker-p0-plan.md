# PlayForge `P0` 격리 웹 빌드 워커 설계안 (Cloud Run Jobs)

- 상태: Step 1 설계 및 워커 초안 구현 완료 (2026-11-21)
- 대상 프로젝트: `forge-dev-2611` (Dev/QA), `forge-live-2611` (Live)
- 관련 문서: [hub-forge-decoupling-plan.md](hub-forge-decoupling-plan.md) (`P0` 빌드·PIE 실행 격리), [cloud-run-pipeline-plan.md](cloud-run-pipeline-plan.md)

---

## 1. 목적 (설치본 없는 브라우저 환경 + `P0` 보안 격리 동시 해결)

현재 웹 포지(`OfficialGodot`)의 Step 3 Web 빌드는 서버 호스트에서 Godot `--headless --editor --import`와 `--export-release Web`을 실행합니다.
- **문제 1 (설치본 없음)**: 사용자 PC에 Godot이 없고 경량 Cloud Run `playhub-forge`에도 Godot 바이너리가 없으면 Step 3 빌드가 불가능합니다.
- **문제 2 (`P0` 보안 위협)**: Godot `--import`는 사용자 프로젝트 안의 `@tool` 스크립트를 실행할 수 있어, Hub·Forge 본체 프로세스와 같은 머신·권한에서 실행하면 시크릿·DB 탈취 경로가 됩니다.

**해법**: 매 빌드마다 1회성 **GCP Cloud Run Job (`forge-build-worker`)** 컨테이너를 실행해 Web Export와 `PlayForge-Web.zip` 생성·검증만 수행한 뒤 컨테이너를 즉시 폐기합니다.

---

## 2. 아키텍처 및 데이터 흐름

```text
[웹 포지 (설치본 없는 브라우저)]
   │  POST /forge/api/platform-builds/:projectId
   ▼
[Cloud Run: playhub-forge (API · 협업 전담, Godot 미포함)]
   │  1) 프로젝트 스냅샷(snapshot.json)을 GCS에 업로드
   │  2) 5분 만료 V4 Signed URL 3개 발급:
   │     - BUILD_INPUT_URL      (GET snapshot.json)
   │     - BUILD_OUTPUT_ZIP_URL (PUT PlayForge-Web.zip)
   │     - BUILD_RESULT_URL     (PUT result.json)
   │  3) Cloud Run Jobs API로 forge-build-worker 1회 실행 요청
   ▼
[Cloud Run Job: forge-build-worker (1회성 · 권한 0 · 실행 후 즉시 폐기)]
   │  - Linux Godot 4.7.2-stable headless + Web Export Template만 내장
   │  - 서비스 계정 IAM 역할: 0개 (DB · Hub · Billing · 타 유저 버킷 접근 불가)
   │  - child godot 프로세스 실행 시 환경변수 완전 정화 (Signed URL조차 미노출!)
   │  - --editor --import → --export-release Web
   │  - playhub-godot-shell.js 주입 → PlayForge-Web.zip 압축 → deployment-zip-validator 검증
   │  - Signed PUT으로 PlayForge-Web.zip & result.json 업로드 후 종료
   ▼
[playhub-forge / playhub-hub]
   └─ result.json의 sourceHash·artifactSha256 검증(OwnedBuildPackages 계약 동일)
      → /play-ugc/ 미리보기 또는 PlayHub 공개 심사 제출 완료!
```

---

## 3. `P0` 6중 방어 계층 (악성 `@tool` 스크립트 대응)

| 계층 | 방어 내용 |
| :--- | :--- |
| **1. 실행 격리** | Cloud Run Job 1회성 샌드박스 컨테이너 (빌드 종료 즉시 폐기, 타 요청과 파일시스템 미공유) |
| **2. 제로 IAM** | 워커 전용 서비스 계정(`forge-build-worker-sa`)에 GCP 프로젝트/버킷/결제 IAM 역할을 **하나도 부여하지 않음** (Signed URL로만 단일 객체 접근) |
| **3. 자식 프로세스 환경변수 정화** | `worker.mjs`가 `godot` 프로세스를 `spawn`할 때 `HOME`, `PATH`, `LANG`, `XDG_*`만 남기고 `BUILD_*_URL`, `PLAYHUB_*`, `GOOGLE_*` 등을 **전부 제거** → `@tool` GDScript가 `OS.get_environment()`로 Signed URL을 훔칠 수 없음 |
| **4. 경로 탈출 차단** | `snapshot.files` 전개 시 `..`, 절대경로, 제어문자, 심볼릭 링크, 봉인 아바타 경로를 모두 거부 |
| **5. 리소스/시간 상한** | CPU 1 / RAM 2 GiB / 단일 명령 타임아웃 120초 / 로그 1 MB 캡 |
| **6. 출력 ZIP 무결성 검증** | `forge/Tools/deployment-zip-validator.cjs`로 64 MiB 압축 / 128 MiB 전개 / 허용 확장자 / `index.html` / CRC32 통과 시에만 업로드 |

---

## 4. 비용 추정 (동접 1명 · `us-west1`)

- **대기 비용**: **\$0 / 월** (Cloud Run Jobs는 실행하지 않을 때 0원)
- **빌드 1회 실행 비용**: 1 vCPU · 2 GiB RAM · 약 25초 실행 ≈ 25 vCPU-초 · 50 GiB-초
- **Always Free 한도**: 월 180,000 vCPU-초 / 360,000 GiB-초 기준 → **월 수천 회 빌드까지 \$0** (GCS 5 GB 무료 한도 내 빌드 아티팩트는 7일 수명주기 삭제로 관리)

---

## 5. 구현 산출물 및 후속 연동 단계

- [deploy/cloudrun/build-worker/Dockerfile](../../deploy/cloudrun/build-worker/Dockerfile): `node:24-slim` + 공식 `Godot_v4.7.2-stable_linux.x86_64` + Web Export 템플릿만 선별 설치(이미지 경량화)
- [deploy/cloudrun/build-worker/worker.mjs](../../deploy/cloudrun/build-worker/worker.mjs): Signed URL 모드 + 로컬 파일 테스트 모드 겸용, 환경변수 정화, `PlayForge-Web.zip` 패키징·검증, `result.json` 생성
- [deploy/cloudrun/build-worker/worker.test.mjs](../../deploy/cloudrun/build-worker/worker.test.mjs): 경로 탈출 차단 · 자식 환경변수 정화 · 모의 Godot 종단간 패키징/해시 검증 테스트

### 다음 연동 작업 (Step 2 이후)
1. Artifact Registry(`playhub-containers`)에 `build-worker` 이미지 빌드·푸시 및 `forge-dev-2611`에 Cloud Run Job `forge-build-worker` 등록 (서비스 계정 `forge-build-worker-sa`, 역할 0개)
2. `forge/Tools/build-queue.cjs`에 `PLAYFORGE_BUILD_BACKEND=cloudrun-job` 어댑터 추가 (로컬 실행은 기존 로컬 `BuildQueue` 100% 유지!)
3. `P0` 완료 기준 시험: 악성 `@tool` 스크립트 픽스처로 호스트 파일·환경변수·메타데이터 토큰 탈취 불가 검증
