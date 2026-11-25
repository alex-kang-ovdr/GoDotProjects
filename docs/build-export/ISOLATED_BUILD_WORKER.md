# 격리 빌드 워커 — 기존 P0 설계 대비 gap 분석 (로드맵 16 R0)

- 브랜치: `Forge-BuildExport` · 성격: **설계 문서만** (코드 변경 없음)
- 기준 설계: [docs/architecture/build-worker-p0-plan.md](../architecture/build-worker-p0-plan.md) (Cloud Run Jobs 1회성 워커)
- 관련 검토: `Godot-Refactoring` 브랜치 `docs/godot-refactoring/REVIEW.md` §3.3, `docs/architecture/multiplayer-plan-review.md` §3.2
- 이 문서는 새 워커를 설계하지 않는다. 이미 있는 워커를 **기본 경로로 만들기 위해 빠진 것**만 정리한다.

## 1. 위협 (요약)

Godot `--editor --import` / `--export-*`는 사용자 프로젝트를 에디터 모드로 연다. 이때 `@tool` 스크립트, `addons/*/plugin.cfg`로 켠 에디터 플러그인, 커스텀 임포터·`EditorExportPlugin`, autoload 중 에디터에서 도는 코드가 **빌드 프로세스 권한으로 실행**된다. GDScript는 `OS.execute`, `FileAccess`, `HTTPRequest`, `OS.get_environment`를 쓸 수 있으므로 호스트에서 돌면 다음이 가능하다.

- 호스트 파일(다른 사용자 프로젝트, `forge/Saved`, SQLite, OAuth 토큰 파일) 읽기·변조
- 환경변수의 시크릿(`PLAYHUB_*`, `GOOGLE_*`, 서명 키) 탈취
- 클라우드 메타데이터 서버(`metadata.google.internal`)로 서비스 계정 토큰 획득
- 외부로 데이터 유출, 다른 빌드 출력 오염(공급망), 자원 고갈(무한 루프·대용량 쓰기)

## 2. 이미 있는 것 (트렁크 `668e4b9d` 파일 기준)

| 구성 | 위치 | 내용 |
| --- | --- | --- |
| 격리 백엔드 어댑터 | `forge/Tools/build-queue.cjs` `build()` | `PLAYFORGE_BUILD_BACKEND=cloudrun-job`이면 `runCloudRunBuild(job, snapshot, outputDir)` 호출 |
| 디스패처 | `forge/Tools/cloudrun-build-backend.cjs` | 스냅샷 GCS 업로드, 5분 V4 Signed URL 3개, Cloud Run Jobs `:run` 호출·폴링 |
| 워커 | `deploy/cloudrun/build-worker/worker.mjs` (`executeIsolatedBuild`) | 경로 탈출 차단, 자식 env 정화(`buildScrubbedChildEnv`), 명령별 120 s 타임아웃, ZIP 검증 |
| 이미지 | `deploy/cloudrun/build-worker/Dockerfile` | `node:24-slim` + 비root `builder`(uid 10001) + Godot 4.7.2 + Web 템플릿 |
| 실행 권한 게이트 | `forge/Tools/execution-allowlist.cjs`, `forge/server.cjs` | `PLAYHUB_FORGE_EXECUTION_ALLOWLIST` fail-closed. cloudrun-job이 켜져 있으면 인증 계정은 웹 빌드만 허용 |
| CI | `.github/workflows/cloudrun-pipeline.yml` | 워커 이미지 빌드·푸시, `worker.test.mjs`·`cloudrun-backend.test.mjs` 실행 |

즉 **임시 완화책(allow-list)과 격리 워커 둘 다 이미 있다.**

## 3. gap

| # | gap | 근거 (파일) | 위험 | 제안 |
| --- | --- | --- | --- | --- |
| G1 | 격리가 **opt-in**: 변수 미설정 시 호스트에서 로컬 spawn | `build-queue.cjs` `build()` 기본 분기, `deploy/vm/README.md` "PLAYFORGE_BUILD_BACKEND 를 설정하지 않았으므로…" | 운영 VM(e2-micro)은 현재 호스트 빌드 + allow-list에만 의존 | 운영 환경(`NODE_ENV=production` 또는 Hub 인증 사용 시) 기본값을 `cloudrun-job`으로, 로컬 spawn은 `PLAYFORGE_BUILD_BACKEND=local` 명시 + allow-list 둘 다 있을 때만 |
| G2 | 워커가 **stock 바이너리**를 다운로드 | Dockerfile `GODOT_RELEASE_BASE=…godotengine/godot-builds…`, engine-ssot `targets.cloudrun-worker.status = pending_fork_rebuild`, `knownStockFallbackPending` | 포크 전용 기능(`playforge_core`) 미포함, 바이너리·템플릿 해시 미고정(태그만) | 포크 릴리스 아티팩트 + **SHA-256 고정**(Dockerfile `ARG GODOT_SHA256`, `sha256sum -c`). BuildManifest `engine.binary_sha256`·`export.template_sha256`로 사후 확인 |
| G3 | 네트워크 egress 미차단 | P0 계획의 6중 방어에 egress 항목 없음. 워커는 Signed URL PUT 때문에 외부 접속 필요 | `@tool`이 `HTTPRequest`로 소스·결과 유출, 메타데이터 서버 질의 | 단계 분리: ① 다운로드(node) → ② Godot 실행은 **네트워크 없는 네임스페이스**(`unshare -n` 또는 별도 컨테이너 `--network none`) → ③ 업로드(node). Cloud Run에서는 Direct VPC egress + 방화벽 deny-all(메타데이터 제외 불가 시 ②단계 분리가 필수) |
| G4 | 메타데이터 서버 접근 | 제로 IAM이라 토큰 가치는 낮지만 SA 이메일·프로젝트 정보 노출 | 정보 노출 | G3의 ②단계 네트워크 차단으로 해결 |
| G5 | `@tool`/플러그인 실행 자체는 허용 | 워커는 실행을 막지 않고 피해 범위만 줄임 | 출력 오염(다른 사용자에게 배포될 ZIP을 악성 코드가 변조) | 출력은 "그 사용자 자신의 빌드"이므로 허용 범위. 단 `[editor_plugins] enabled`·`@tool` 존재를 BuildManifest 확장 필드(`build_flags.editor_code_present`)로 기록해 심사에 노출 |
| G6 | 동일 빌드 재현성 0 | [BUILD_MANIFEST.md §5](BUILD_MANIFEST.md): `unique_id` 없는 `.tscn` → 매 익스포트마다 `.scn` 난수 | 결과 검증·캐시·서명 불가 | 워커가 임시 복사본에 결정적 `unique_id` 주입 + `build-manifest.json` 생성 |
| G7 | 결과 무결성 연결 | `result.json`에 `artifactSha256`·`sourceHash`는 있으나 엔진/템플릿 해시 없음 | 어떤 엔진으로 빌드됐는지 사후 증명 불가 | `result.json`에 BuildManifest 포함 |
| G8 | PIE·Blender·Shorts는 여전히 호스트 실행 | `server.cjs` 주석 "host PIE/Blender/Shorts/local builds run on this host without isolation" | 웹 빌드만 격리 | 범위 밖(16은 빌드만). allow-list 유지, 별도 항목으로 추적 |
| G9 | 악성 `@tool` 픽스처 시험 없음 | P0 계획 §5 "다음 연동 작업 3" 미완 | 방어 계층 회귀 감지 불가 | `forge/Tests/build-export/fixtures/malicious-tool/`(env 읽기·파일 쓰기·HTTP 시도) + 워커 로컬 모드 integration 시험 |

## 4. 격리 선택지 비교 (Windows·Linux)

| 선택지 | Linux | Windows | 비고 |
| --- | --- | --- | --- |
| Cloud Run Job (현행) | 가능(현행) | 해당 없음 | 1회성, 제로 IAM. egress 분리만 추가하면 됨 |
| 로컬 컨테이너 (`docker run --network none --read-only --cap-drop ALL --pids-limit --memory --cpus -u 10001`) | 가능 | Docker Desktop(WSL2)에서 Linux 이미지 실행 가능 | 같은 이미지를 로컬·클라우드 공용으로. 개발 PC·VM 셀프호스트 경로 |
| gVisor(`runsc`) 런타임 | 가능 | 불가 | 커널 공격면 축소. Cloud Run gen1은 gVisor 기반 |
| 별도 저권한 OS 사용자 | `useradd` + `systemd-run --uid --property=PrivateNetwork=yes,MemoryMax=,CPUQuota=` | 전용 로컬 계정 + `CreateProcessAsUser`/Job Object(메모리·CPU·프로세스 수) + Windows 방화벽 아웃바운드 차단 규칙 | 컨테이너 없는 Windows 설치형 Forge용. 파일 ACL로 Saved/DB 접근 차단 필요 |
| Windows Sandbox / Hyper-V 격리 컨테이너 | — | Pro 이상, 기동 수 초~수십 초 | 설치형 데스크톱에서 선택 옵션 정도 |

공통 필수 조건:

- 자식 env는 허용 목록만(현행 `buildScrubbedChildEnv`와 같게). 시크릿을 env로 넘기지 않는다.
- 쓰기 가능 경로는 작업 디렉터리 1개(프로젝트 복사본 + 출력). HOME도 그 안으로.
- 네트워크: Godot 단계는 차단. 입출력 전송은 Godot 밖의 래퍼가 한다.
- 자원: CPU·메모리·프로세스 수·디스크 쿼터·명령별/전체 타임아웃·로그 상한.
- 바이너리·템플릿은 읽기 전용 + 해시 고정.

## 5. build-queue가 호출할 인터페이스 (현행 유지 + 확장)

현행 시그니처 `runCloudRunBuild(job, snapshot, outputDir, deps)`를 백엔드 공통 계약으로 일반화한다.

```text
interface BuildBackend {
  name: 'cloudrun-job' | 'local-container' | 'local-user' | 'host-unsafe'
  run(job, snapshot, outputDir, { timeoutMs, signal }) -> Promise<void>
  // 성공 시 outputDir에 최소: PlayForge-Web.zip (또는 index.*), build-manifest.json
  // job에 채움: artifactSha256, bytes, expandedBytes, entryCount, contentHash, inputHash, engine{binarySha256, matchesLock}
  // 실패 시 throw (메시지는 사용자 노출 가능한 수준, 원본 로그는 build.log)
}
selectBuildBackend(env) -> BuildBackend   // 운영 기본: cloudrun-job, 'host-unsafe'는 allow-list 필수
```

- 입력: `snapshot { id, revision, files[], buildProfile, ownerKey }` — 현행 `snapshot.json` 페이로드와 동일.
- 출력 계약의 `build-manifest.json`은 [BUILD_MANIFEST.md](BUILD_MANIFEST.md) v1. `build_id`는 `job.id` 그대로.

## 6. 임시 완화책

- 이미 시행 중: `PLAYHUB_FORGE_EXECUTION_ALLOWLIST`(미설정 = 아무도 안 됨, fail-closed). 유지한다.
- 추가 제안(코드 소유 브랜치 결정 사항):
  1. 호스트 빌드 경로에도 워커의 `buildScrubbedChildEnv`와 같은 env 정화를 적용(현재 `build-queue.cjs` `run()`은 부모 env를 그대로 상속).
  2. 호스트 빌드 전 프로젝트에 `@tool`/`[editor_plugins]`가 있으면 allow-list 계정이라도 거부하거나 경고(정적 검사, `repro-lint.cjs`와 같은 위치에 규칙 추가 가능).
  3. 운영 VM에서는 `PLAYFORGE_BUILD_BACKEND=cloudrun-job`을 켜는 것을 우선(G1).

## 7. 공수 (추정치 — 본 문서의 추정, 실측 아님)

| 작업 | 추정 |
| --- | --- |
| G1 운영 기본값 전환 + 백엔드 선택 함수 + 시험 | 0.5-1 PW |
| G2 포크 Linux 에디터/템플릿 릴리스 + Dockerfile SHA 고정 | 1-2 PW (포크 CI 상태에 따라 변동) |
| G3/G4 Godot 단계 네트워크 분리 (워커 내부 2단계화) | 1-1.5 PW |
| G6/G7 결정적 `unique_id` 주입 + build-manifest 생성 연동 | 0.5-1 PW |
| G9 악성 `@tool` 픽스처 integration 시험 | 0.5-1 PW |
| 로컬 컨테이너 백엔드(Linux/Docker Desktop) | 1-2 PW |
| Windows 저권한 사용자 백엔드 | 2-3 PW (선택) |
| **필수(G1-G4, G6, G7, G9) 합계** | **약 3.5-6.5 PW** |

REVIEW §3.3의 "+2-4 PW"는 워커가 없다고 가정한 값이었다. 워커가 이미 있으므로 필수 범위는 위와 같이 다시 잡되, 포크 Linux 빌드(G2)가 늦어지면 stock + SHA 고정으로 먼저 진행할 수 있다.
