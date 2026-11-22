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
| Rust 단위 테스트 | `cargo test --workspace` | **PASS** (10/10 — `contracts` 4건, `ipc` 1건, `ticket` 2건, `platform` 3건(Job Object · Low-IL · HKCU 프로토콜)) |
| 계약·L9 티켓 테스트 | `node24 --test hub/tests/desktop-contracts.test.mjs hub/tests/desktop-ticket-l9.test.mjs` | **PASS** (7/7 — 6종 스키마 + L9 정상 교환·재사용 409·만료 410·gameId/OS 바인딩 불일치 403·딥링크 `access_token` 거부) |
| 소유권·스킬 게이트 | `check-ownership.mjs --strict` · `sync-skills.mjs --check` | **PASS** (`ok 42 / warn 0 / fail 0`, 동기화 OK) |
| M0 생명주기 하네스 (Headless) | `node24 tools/desktop/lifecycle-harness.ts --headless` | **PASS** (6/6: L2, L2-hitch, L4-crash, L4-hang, L5, L-sandbox) |
| M0 생명주기 하네스 (Windowed GPU) | `node24 tools/desktop/lifecycle-harness.ts` | **PASS** (6/6: L2, L2-hitch, L4-crash, L4-hang, L5, L-sandbox) |

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
| Windowed GPU — 재실행 (셰이더 캐시 적용) | 1,083 ms | **963 ~ 1,092 ms** | 계획서 목표(≤ 2,000 ms) 충족 |

### 3.3 셰이더 컴파일 · 프레임 히치 실측 (`L2-hitch`, Windowed GPU 재실행)

- **GPU / 드라이버**: `NVIDIA GeForce RTX 4070 Laptop GPU` / `NVIDIA 32.0.16.1060` / `gl_compatibility` / `shaderCacheEnabled: true`
- **단계 분해**: `.pck` 마운트 **1 ms**, 메인 씬 로드 **130 ms**, 첫 프레임 **963 ms**
- **초기 90프레임 히치 분포**: `p50` **0.95 ms**, `p95` **1.72 ms**, `p99` **8.68 ms**, `max` **8.68 ms** (`> 50 ms` 0건, `> 100 ms` 0건)
- **관찰 사항**: `RenderingServer`의 `PIPELINE_COMPILATIONS_*` 카운터는 Vulkan/D3D12(`Forward+`/`Mobile`) 파이프라인 컴파일 전용이라 `gl_compatibility`(OpenGL3)에서는 `0`으로 보고된다. 따라서 OpenGL3 게임은 **Cold vs Warm 첫 프레임 지연**과 **`maxFrameMs`/`hitchCount`**를 주 지표로 함께 모니터링해야 한다.

### 3.4 장애 주입 검증 (L4 · L5)

| 시나리오 | 동작 | 실측 결과 |
|---|---|---|
| **L4-crash** | Player가 `exitCode = 42`로 비정상 종료 | `status: "crash_detected"`, `exitCode: 42`, 고아 프로세스 0개 |
| **L4-hang** | Player가 `first_frame` 이후 heartbeat 중단 | 1,500 ms 타임아웃 감지 → Job Object로 강제 종료(`status: "hang_detected"`), 고아 0개 |
| **L5** | 실행 중 `playhub-bootstrapper.exe`를 `taskkill /F`로 강제 종료 | Win32 Job Object(`KILL_ON_JOB_CLOSE`)로 `PlayHubPlayer.exe` 즉시 종료(`aliveBeforeKill: true` → `aliveAfterKill: false`), 고아 0개 |
| **L-sandbox** | Windows Low Integrity(`S-1-16-4096`) 토큰 + Job Object로 Godot 4.7.2 실행 | GPU 부팅 **985 ms**, `%USERPROFILE%` 쓰기 **차단**(`userProfileWriteBlocked: true`), `%LOCALAPPDATA%\PlayHub\...` Low-IL 전용 폴더 쓰기 **허용**(`gameDataWriteAllowed: true`), 관리자 권한 불필요 |
| **L9** | `playhub-bootstrapper.exe exchange-ticket` + 인프로세스 목 인증 서버 | 1회 교환 성공(stdout에 `sessionToken` 미출력), 재사용 409·만료 410·`gameId`/OS 바인딩 불일치 403·딥링크 `access_token` 모두 거부 |

### 3.5 Velopack 자체 업데이트 검토 (M0 PoC)

- `crates.io` 최신 크레이트 확인: `velopack = "1.3.39-g8d2844f"` (**MIT 라이선스**, MSRV Rust 1.75, 기본 feature 비어 있음 `default = []`).
- **판정 (Go — M2 적용)**: M0 Bootstrapper 바이너리(425 KiB / gzip 205 KiB)를 불필요하게 키우지 않기 위해 M0에서는 의존성을 보류하고, M2에서 TUF 서명 검증 통과 후 `UpdateManager::apply_updates_and_restart`를 호출하는 구조로 통합한다.

---

## 4. M0 PoC에서 발견한 기술 사항

1. **Godot 4.7.2 `template_release`의 `--main-pack` 비활성화**:
   - 공식 release 템플릿은 `disable_path_overrides=yes`로 컴파일되어 `--main-pack` 인자 전달 시 즉시 종료(exit 1)한다.
   - **해결**: bootstrap 팩을 실행 파일과 같은 이름의 형제 파일 **`PlayHubPlayer.pck`**으로 배포하면 release 템플릿이 자동으로 로드하며, 외부에서 `--main-pack`으로 bootstrap/오버레이/IPC를 우회할 수 없어 보안상 더 유리하다.
2. **초기 WebSocket HTTP Upgrade 타임아웃**:
   - Godot이 게임 `.pck`를 동기 마운트하는 동안 첫 `_ws.poll()`이 수백 ms 지연될 수 있어, HTTP Upgrade 읽기 타임아웃을 5초로 설정하고 101 전환 이후에만 200 ms 폴링 타임아웃을 적용하도록 수정했다.
3. **Windows Low-IL 프로세스 격리 실증 사항**:
   - `CreateRestrictedToken(DISABLE_MAX_PRIVILEGE)` + `CreateProcessAsUserW` 조합은 `user32.dll` 초기화에서 `0xC0000142` (`STATUS_DLL_INIT_FAILED`)로 즉시 종료된다. Microsoft 권장 방식인 **`DuplicateTokenEx(TokenPrimary)` + `SetTokenInformation(TokenIntegrityLevel = S-1-16-4096)` + `lp_desktop = "winsta0\\default"` + `CREATE_SUSPENDED` → `AssignProcessToJobObject` → `ResumeThread`**로 전환해 Godot 4.7.2 GPU 실행과 `%USERPROFILE%` 쓰기 차단을 모두 검증했다.
   - Low-IL 레이블(`S:(ML;OICI;NW;;;LW)`) 부여에는 소유자/Full Control(`(F)`) 권한이 필요하므로, 게임 데이터 폴더는 반드시 **`%LOCALAPPDATA%\PlayHub\...`** 아래에 둔다(`D:\` 등 Modify(`(M)`) 권한 폴더에서는 `ERROR_ACCESS_DENIED`).

---

## 5. 미검증 항목 (잔여)

- **macOS / Linux 실기·CI 실행**: `native/platform/src/unix.rs`는 코드 작성만 완료했으며 macOS/Linux 러너에서 컴파일·실행 검증은 미수행 (`tools/desktop/ci-matrix-draft.yml`을 `PlayHub-Platform` `.github/workflows/`에 승격 후 검증).
- **Windows AppContainer 추가 격리**: Low-IL(No-Write-Up)로 파일·레지스트리 변조는 차단했으나, Medium-IL 읽기 차단·네트워크 아웃바운드 제한까지 강화하려면 M3에서 AppContainer로 확장한다.
- **Azure Trusted Signing 자격 신청**: 조직 계정 절차로 에이전트 자동화 범위 외.

---

## 6. 사용자 시나리오 전수 시각 검증 증거샷 (`verification-m0/`)

`node24 tools/desktop/capture-scenarios.ts`로 실제 Godot 4.7.2 GPU 뷰포트(`survivor-arena-g2/Web/index.pck`) 및 자동화 게이트 결과를 캡처해 육안 검수했다.

| # | 파일 | 검증 시나리오 | 핵심 확인 사항 |
|---|---|---|---|
| 1 | [01-native-game-live.png](verification-m0/01-native-game-live.png) | Native Play 진입 (L2) | `SURVIVOR ARENA` 3D 씬 정상 렌더링, 좌상단 `Play Hub [Shift+Tab]` 버튼 및 IPC 인증 완료 배지 |
| 2 | [02-overlay-people.png](verification-m0/02-overlay-people.png) | 인게임 오버레이 — People 탭 | `Shift+Tab` 토글, 한글 `SystemFont` 정상 렌더링, IPC 인증 상태·PID 표시, `클라우드 즉시 저장`·`허브로 나가기 (Leave)` 버튼 |
| 3 | [03-overlay-store.png](verification-m0/03-overlay-store.png) | 인게임 오버레이 — Store 탭 | 시스템 브라우저 웹 PG 연동(`Hub-Billing Track A +25%`) 및 토큰 비노출 안내 |
| 4 | [04-overlay-settings.png](verification-m0/04-overlay-settings.png) | 인게임 오버레이 — Settings 탭 | 실시간 엔진(`Godot 4.7.2 gl_compatibility`), GPU(`NVIDIA GeForce RTX 4070 Laptop GPU`), 셰이더 캐시 활성화 표기 |
| 5 | [05-low-il-sandbox-live.png](verification-m0/05-low-il-sandbox-live.png) | Windows Low-IL 격리 실행 (`L-sandbox`) | Low Integrity(`S-1-16-4096`) 토큰으로 3D 게임 정상 실행 + `USERPROFILE 쓰기 차단(PASS)` · `게임 데이터 폴더 쓰기 허용(PASS)` |
| 6 | [06-automated-verification-summary.png](verification-m0/06-automated-verification-summary.png) | 전수 자동화 게이트 요약 | Windowed GPU 6/6 PASS, 계약·L9 7/7 PASS, `--strict` 소유권 fail 0, gzip 합계 37.39 MiB, 셰이더 히치 0건 |
