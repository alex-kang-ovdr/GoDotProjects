# PlayHub Desktop M0 기반 검증 리포트 (Windows x64)

- **일시**: 2026-11-22
- **브랜치**: `Hub-Desktop` (기준 `PlayHub-Platform` `b8efde0`)
- **호스트 환경**: Windows 11 (`10.0.26300` x64), Rust `1.100.0` (`x86_64-pc-windows-msvc`), Node `v24.22.1`, Godot `4.7.2-stable`

---

## 1. M0 구현 산출물

| 영역 | 경로 | 내용 |
|---|---|---|
| 계약 (SSOT) | `contracts/desktop/*.schema.json` (6종) | `launch-ticket.v1`, `bridge.v1`, `deeplink.v1`, `content-manifest.v1`, `release-manifest.v1`, `avatar-render-profile.v1` |
| Rust 코어 | `native/core/` | 딥링크 엄격 파서(비밀 파라미터 거부), 256-bit 1회용 토큰, loopback WebSocket IPC 서버(`Origin` 헤더 차단·단일 연결 강제), SHA-256 해시 |
| OS 백엔드 | `native/platform/` | `PlatformBackend` trait — Windows Win32 Job Object(`KILL_ON_JOB_CLOSE`), Linux(`PR_SET_PDEATHSIG` + pgid), macOS(pgid) |
| Bootstrapper | `native/bootstrapper/` | `playhub-bootstrapper` CLI (`info`, `parse-deeplink`, `launch` + 크래시·행 감지·JSON 리포트) |
| Pack CLI | `native/pack/` | `playhub-pack` CLI (`hash`, `manifest`) |
| Godot Bootstrap | `native/runtime-bootstrap/` | `PlayHubDesktopBridge`(GDScript `WebSocketPeer`), 유니버설 오버레이 골격(`Shift+Tab` / `Leave`), 게임 `.pck` 마운트, L2/L4 테스트 훅 |
| SDK 어댑터 | `godot-sdk/hosts/desktop_host.gd` | `playhub_runtime_sdk.gd`용 Desktop 호스트 어댑터 |
| TS 도구·하네스 | `tools/desktop/` | `prepare-player.ps1`, `lifecycle-harness.ts`(Node 24 type stripping, 빌드 없음), `ci-matrix-draft.yml` |
| 계약 테스트 | `hub/tests/desktop-contracts.test.mjs` | 6종 스키마·L9 티켓 오용·토큰 패턴 자동 테스트 |

---

## 2. 자동화 테스트 결과

| 검증 항목 | 명령 | 결과 |
|---|---|---|
| Rust 포맷·정적 검사 | `cargo fmt --all -- --check` · `cargo clippy --workspace --all-targets -- -D warnings` | **PASS** (경고 0) |
| Rust 단위 테스트 | `cargo test --workspace` | **PASS** (6/6 — `contracts` 4건, `ipc` 1건(`Origin`·오류 토큰·2차 연결 거부), `platform` 1건) |
| 계약 스키마 테스트 | `node24 --test hub/tests/desktop-contracts.test.mjs` | **PASS** (6/6) |
| 소유권·스킬 게이트 | `check-ownership.mjs --strict` · `sync-skills.mjs --check` | **PASS** (`ok 40 / warn 0 / fail 0`, 동기화 OK) |
| M0 생명주기 하네스 (Headless) | `node24 tools/desktop/lifecycle-harness.ts --headless` | **PASS** (4/4: L2, L4-crash, L4-hang, L5) |
| M0 생명주기 하네스 (Windowed GPU) | `node24 tools/desktop/lifecycle-harness.ts` | **PASS** (4/4: L2, L4-crash, L4-hang, L5) |

---

## 3. 실측 결과 (Windows x64)

### 3.1 바이너리·패키지 용량

| 산출물 | 원본 크기 | gzip(level 6) 크기 | 비고 |
|---|---:|---:|---|
| `playhub-bootstrapper.exe` | 359.5 KiB (368,128 B) | **176.6 KiB** (180,820 B) | 목표 "수 MiB" 대비 크게 여유 |
| `playhub-pack.exe` | 171.0 KiB (175,104 B) | 88.6 KiB (90,703 B) | 개발·CI 도구 |
| `PlayHubPlayer.exe` (Godot 4.7.2 release) | 104.2 MiB (109,268,480 B) | **37.17 MiB** (38,977,471 B) | 최초 1회 설치, 버전별 공유 |
| `PlayHubPlayer.pck` (bootstrap) | 12.5 KiB (12,780 B) | **11.2 KiB** (11,508 B) | `PlayHubPlayer.exe`와 함께 배포 |
| **초기 다운로드 합계 (gzip)** | — | **약 37.4 MiB** | 가설 예산(≤ 45 MiB) 충족 |

### 3.2 기동·첫 프레임 지연 (`survivor-arena-g2/Web/index.pck`, 1.87 MiB, `gl_compatibility`)

| 모드 | IPC 인증 | 첫 프레임 (`res://scenes/main.tscn`) | 비고 |
|---|---:|---:|---|
| Headless (`--headless`) | 345 ms | **346 ms** | CI 기본 검증 |
| Windowed GPU — 첫 실행 (셰이더 컴파일 포함) | 6,186 ms | **6,651 ms** | 최초 OpenGL/셰이더 초기화 |
| Windowed GPU — 재실행 (셰이더 캐시 적용) | 1,083 ms | **1,092 ms** | 계획서 목표(≤ 2,000 ms) 충족 |

### 3.3 장애 주입 검증 (L4 · L5)

| 시나리오 | 동작 | 실측 결과 |
|---|---|---|
| **L4-crash** | Player가 `exitCode = 42`로 비정상 종료 | `status: "crash_detected"`, `exitCode: 42`, 고아 프로세스 0개 |
| **L4-hang** | Player가 `first_frame` 이후 heartbeat 중단 | 1,500 ms 타임아웃 감지 → Job Object로 강제 종료(`status: "hang_detected"`), 고아 0개 |
| **L5** | 실행 중 `playhub-bootstrapper.exe`를 `taskkill /F`로 강제 종료 | Win32 Job Object(`KILL_ON_JOB_CLOSE`)로 `PlayHubPlayer.exe` 즉시 종료(`aliveBeforeKill: true` → `aliveAfterKill: false`), 고아 0개 |

---

## 4. M0 PoC에서 발견한 기술 사항

1. **Godot 4.7.2 `template_release`의 `--main-pack` 비활성화**:
   - 공식 release 템플릿은 `disable_path_overrides=yes`로 컴파일되어 `--main-pack` 인자 전달 시 즉시 종료(exit 1)한다.
   - **해결**: bootstrap 팩을 실행 파일과 같은 이름의 형제 파일 **`PlayHubPlayer.pck`**으로 배포하면 release 템플릿이 자동으로 로드하며, 외부에서 `--main-pack`으로 bootstrap/오버레이/IPC를 우회할 수 없어 보안상 더 유리하다.
2. **초기 WebSocket HTTP Upgrade 타임아웃**:
   - Godot이 게임 `.pck`를 동기 마운트하는 동안 첫 `_ws.poll()`이 수백 ms 지연될 수 있어, HTTP Upgrade 읽기 타임아웃을 5초로 설정하고 101 전환 이후에만 200 ms 폴링 타임아웃을 적용하도록 수정했다.

---

## 5. 미검증 항목 (M0 잔여)

- **macOS / Linux 실기·CI 실행**: `native/platform/src/unix.rs`는 코드 작성만 완료했으며 macOS/Linux 러너에서 컴파일·실행 검증은 미수행 (`tools/desktop/ci-matrix-draft.yml`을 트렁크 `.github/workflows/`에 승격 후 검증).
- **Velopack 자체 업데이트 PoC** 및 **Windows AppContainer 격리 PoC**: M0 후속 항목으로 미수행.
- **Azure Trusted Signing 자격 신청**: 조직 계정 절차로 에이전트 자동화 범위 외.
