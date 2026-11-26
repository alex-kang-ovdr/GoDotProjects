# R0 마감 및 R1 멀티플레이 코어 구현·검증 보고 (로드맵 25·26·27·28·30)

- 브랜치: `Forge-Multiplayer`
- 기준일: 2026-11-26
- 엔진 정책: **엔진 무변경** (Godot 공개 `SceneMultiplayer` / `WebSocketMultiplayerPeer` / `ENetMultiplayerPeer` + 애드온 GDScript, SSOT ADR-G08 준수)
- 검증 엔진: 포크 `Forge-Refactoring-Multiplayer` (`4.7.2.stable.custom_build.31e7ebb19`) + 순정 Godot 4.7.2 호환 검증

---

## 1. 구현 범위 요약

| 로드맵 항목 | 구현 모듈 (`forge/Godot/addons/playforge_netframework/`) | 핵심 계약·기능 |
| --- | --- | --- |
| **25·28·29 §6–7** (WSS & 재접속) | `runtime/net_transport.gd`, `runtime/net_game_mode.gd`, `runtime/net_player_state.gd`, `runtime/net_player_controller.gd`, `runtime/net_rpc_guard.gd` | `enet` / `ws` / `wss` 전송 추상화(능력 리포트 포함), `wss` 명시적 trust root TLS 검증(`client_unsafe` 금지), 재접속 유예(`--reconnect-grace`) 슬롯·Pawn 보존, `owner_epoch` 증가, 슬롯 하이재킹(`slot_taken`)·구 epoch RPC(`stale_owner_epoch`) 거부 |
| **26** (Iris 방식 상태 복제) | `replication/fg_*.gd`, `native/fg_iris_native.{h,cpp}` + `SConstruct` (`FgIrisNativeServer` C++ GDExtension) | cell-relative `Vector2` 양자화, `u16` 각도 양자화, SHA-256 `protocol_hash`, `atomic_groups`(혼합 scope 스키마 차단), 불변 상태 저장소(캡처 dirty vs 연결별 delivery 분리), `acked_baseline_rev` vs `synced_server_rev` 분리, bounded baseline history(16) 초과 시 자동 full refresh, `MSG_STORAGE_ACK`·위조 future revision ACK 거절, `keyed_collection` 인벤토리+tombstone, owner 전용 필드 wire 0바이트 격리, 공간 AOI hysteresis, dormancy, `SceneMultiplayer.send_bytes` 라이브 어댑터 + **C++ GDExtension 멀티스레드 핫패스(`FgIrisNativeServer`, GDScript 클라이언트와 100% 와이어 호환)** |
| **27** (이동 예측·보정·원격 보간) | `prediction/fg_movement_sim.gd`, `prediction/fg_predicted_character.gd`, `prediction/fg_remote_interpolator.gd` | 서버·클라이언트 공용 정적 월드/장애물 고정 tick 시뮬레이션, 로컬 입력 즉시 예측 + bounded `input_history`, `acked_input_seq` reconcile & replay(pre-ACK·중복 ACK 히스토리 보존, `max_replay_ticks=32` 초과 시 안전 hard correction), 시뮬레이션 위치 vs 화면 `visual_offset` 분리, `teleport_revision`/`world_epoch` 즉시 리셋, 원격 `server_tick` 정렬 snapshot ring + 적응형 jitter 지연 + `max_extrapolation_ms=100` 상한 |
| **29** (JoinTicket Control Plane) | `runtime/join_ticket.gd` (`kid` 키링·무중단 로테이션), `forge/Tools/dedicated-server/join-ticket-service.cjs` | provider 중립 HTTP Control Plane(`/sessions`, `/reserve`, `/join-ticket`, `/resume`, `/lease/renew`, `/keys/rotate`, `/results`, `/health`), 슬롯 CAS 예약·idempotencyKey·fencing `leaseEpoch`, 브로커 키링 파일 기반 무중단 `kid` 로테이션·폐기 키 즉시 거절(`key_retired_or_unknown`), HTTP 응답·로그 비밀값 비노출 |
| **30** (서버 입력·행동 Validator) | `validation/fg_server_validator.gd` | 연결별 슬라이딩 rate window(정상 300ms RTT/5% loss burst 허용), 미래/과거 clock 가속 거부, NaN/Inf·과속/순간이동 탐지, `request_id` idempotency(거래·보상 중복 지급 0건), `ValidationEvent` 구조화 기록(자동 영구 제재 0건, 원문 토큰 비노출) |

---

## 2. 실측 검증 결과 (2026-11-26, Windows 11 로컬 루프백)

### 2.1 ENet vs WSS(TLS 검증) 비교 (`run-ds-2clients.cjs`)

동일한 DS 1 + 클라이언트 2 + 늦은 입장 1 + 공격 probe 4 + drain 시나리오(23개 판정):

| 항목 | ENet (UDP) | WSS (WebSocket + TLS 검증) |
| --- | --- | --- |
| 전체 판정 (23개) | **23/23 PASS** | **23/23 PASS** |
| 암호화 / trust root 검증 | 없음 (`encrypted=false`) | **활성** (RSA 2048 `CN=localhost` + 명시적 `TLSOptions.client(cert, "localhost")`, `client_unsafe` 거부 확인) |
| 서버 ready | 452 ms | 952 ms *(루프백 RSA 2048 인증서 런타임 생성 포함)* |
| 클라이언트 연결+인증 | 775.9 ~ 876.8 ms | 675.8 ~ 789.9 ms |
| 서버 규칙 tick (30Hz) | p50 43 µs / p99 415 µs | p50 39 µs / p99 536 µs |
| 최종 위치/체력 수렴 오차 | 0 px / 불일치 0 | 0 px / 불일치 0 |
| 전체 벽시계 | 12.60 s | 12.77 s |

- **WSS trust root 누락 거부**: `--tls-ca` 미지정 시 코드 2(`tls_ca_required`)로 즉시 실패 확인.
- **재접속·`owner_epoch` 검증** (`wss-reconnect.godot.test.cjs`):
  - Client A 35틱 주행 후 강제 종료 → 서버 유예 슬롯 보존 및 `bot-a-resume.ticket` 발급
  - 유예 중 타 사용자(`bot-x`)의 슬롯 0 점유 시도 → `slot_taken` 거부
  - Client A 재접속 → 동일 `NetObjectId`·위치·체력 보존, `ownerEpoch=2` 승격, 신규 `peer_id` 부여
  - 재접속 후 구 `ownerEpoch=1` RPC 2회 전송 → 서버 `stale_owner_epoch=2` 거부, 정상 `ownerEpoch=2` 입력만 반영

### 2.2 Iris 방식 상태 복제 검증 (`iris_replication_selftest.gd`)

| 검증 항목 | 실측 결과 |
| --- | --- |
| cell-relative `Vector2` 양자화 (`-123456.78, 987654.32` 포함) | 오차 ≤ 0.002 m (PASS) |
| `u16` 각도 양자화 | 오차 ≤ 0.01 deg (기준 0.2 deg, PASS) |
| owner 전용 필드 비권한 wire 누출 | **0 bytes** (`owner_secret`, `inventory` 모두 비노출) |
| 패킷 크기 (Full vs Delta) | Full **97 B** → Delta **37 B** (**-61.9%**) |
| 위조 future revision ACK / 프로토콜 해시·epoch 불일치 | 전부 거부 (PASS) |
| 역순·중복·baseline miss·history 초과(16+)·late join | 상태 역행 0건, 자동 full refresh 수렴 (PASS) |
| tombstone 지연 패킷 재활성화 차단 | 2/2 차단, 신규 세대(gen+1) 격리 (PASS) |
| **100,000회 spawn/despawn 수명 스트레스** | ID/generation 충돌 **0건** (6,136 ms) |
| 공간 AOI 경계 왕복 20회 + Dormancy | ghost/중복 0건, 수면 중 0패킷, late join 정상 수신, 수면 중 파괴 tombstone 전달 |
| malformed packet fuzz (4,000건: 클라 2,000 + 서버 2,000) | 크래시·상태 오염 **0건**, 전부 안전 거절 |
| **N0 벤치마크** (2연결 / 100객체 / 10% dirty, GDScript) | tick p50 **2.63 ms**, p95 **3.56 ms**, 연결당 10Hz **5.10 KB/s** |
| **N1 벤치마크** (8연결 / 500객체 / 5% dirty, GDScript) | tick p50 **36.0 ms**, p95 **47.2 ms**, 연결당 10Hz **12.75 KB/s** |

#### Iris C++ GDExtension 핫패스 (`FgIrisNativeServer`, `iris_native_bench.gd`, Windows x86_64 MSVC `/O2`, 8 워커 스레드)

- GDScript `FgReplicationClient`와 100% 와이어 호환(`parityOk=true`, Full 81 B → Delta 37 B, 비권한 owner secret 누출 0 B, 위조 future ACK 거절, AOI 이탈 despawn, tombstone 격리 통과).
- 불변 스냅샷 메인 스레드 1회 캡처 + 읽기 전용 워커 스레드(Godot Node 비접근) 병렬 연결 빌드(`plans/26` §4 구현).

| 프로파일 | 연결 / 월드 객체 / dirty | 순수 GDScript p95 | **C++ Native p50 / p95** | **Total Flat p95 (Godot 경계 포함)** | 연결당 10Hz 대역폭 | 로드맵 26 목표 |
| --- | --- | --- | --- | --- | --- | --- |
| **N0** | 2 / 100 / 10% | 3.56 ms | 0.007 / **0.010 ms** | **0.012 ms** (296×↑) | 4.73 KB/s | 기본 일치 (**PASS**) |
| **N1** | 8 / 500 / 5% | 47.2 ms | 0.303 / **0.611 ms** | **0.620 ms** (76×↑) | 4.10 KB/s | 기본 협동 (**PASS**) |
| **N2** | 32 / 2,000 / 5% | — | 0.482 / **0.702 ms** | **0.717 ms** | 6.81 KB/s | p95 ≤ 4.0 ms (**PASS**) |
| **N3** | 100 / 10,000 / 5% | — | 0.872 / **1.186 ms** | **1.210 ms** | 17.30 KB/s | p95 ≤ 8.0 ms 연구목표 (**PASS**) |

### 2.4 외부 JoinTicket Control Plane & 키 로테이션 (`control-plane-join-ticket.godot.test.cjs`)

- **1,000회 cancel/reserve/join 경합**: 중복 슬롯 배정 **0건**, 동일 `idempotencyKey` 재시도 멱등 응답, 잘못된 `protocolHash` 409 거절, stale `leaseEpoch` 결과 확정 409 거절, 중복 `resultRevision` 커밋 멱등 처리, HTTP 응답 비밀키 비노출.
- **라이브 Godot DS + 외부 Control Plane + 무중단 키 로테이션**: `--keyring-file` 브로커 키링으로 DS 기동 → `k1` 발급 티켓으로 2명 입장 → 실행 중 `/keys/rotate (retirePrevious: true)`로 `k1` 폐기·`k2` 활성화 → 폐기된 `k1` 티켓 즉시 거절(`key_retired_or_unknown`), 신규 `k2` 티켓 정상 입장·소유·drain 완료.
- **Linux SIGTERM 검증기 & CI 워크플로우**: [verify-linux-ds-sigterm.cjs](../../forge/Tools/dedicated-server/verify-linux-ds-sigterm.cjs) `--dry-run` 계약 검증 PASS, [linux-ds-sigterm.workflow.yml](../../forge/Tools/dedicated-server/linux-ds-sigterm.workflow.yml) 및 [LINUX_DS_CI_WORKFLOW.md](LINUX_DS_CI_WORKFLOW.md) 작성 완료.

### 2.3 이동 예측·보정·원격 보간 & 서버 Validator (`prediction_validator_selftest.gd`, `run-r1-matrix.cjs`)

1) 결정론적 시뮬레이션 (`prediction_validator_selftest.gd`):
- LAN 정적 월드(장애물+대시): 예측 오차 p95 **0.000**, 보정 0회, 벽 관통 0회
- RTT 150 ms / loss 1%: 예측 오차 p95 **0.000**, hard correction **0회**, 벽 관통 0회
- RTT 300 ms / loss 5%: smooth replay **1회 (8 ticks)**, hard correction **0회**, 오차 p95 **0.000**, 최종 오차 **0.000**, 벽 관통 0회
- `teleport_revision` / `world_epoch` 변경: history & `visual_offset` 즉시 리셋, 구 epoch 패킷 무시
- 원격 보간기: 위치·회전 동일 `alpha`, `max_extrapolation_ms=100` 상한 클램프, teleport 시 ring 리셋
- 서버 Validator: 10,000건 중복 거래/액션 요청 → 실제 커밋 **1회**(중복 지급 0건), 미래 clock·NaN·과속·rate flood 전부 거절, 정상 300ms RTT/5% loss 입력 **자동 영구 제재 0건**

2) **실제 Godot DS + 2 clients + `NetEmulationProxy`(실 UDP 지연·손실) 라이브 매트릭스** (`run-r1-matrix.cjs`):

| 프로파일 | 수렴 최대 오차 | Iris 전송 (Full / Delta / ACK) | Client A 예측 (p95 / 보정 / Hard 보정) | Owner 누출 / 자동 제재 | 결과 |
| --- | --- | --- | --- | --- | --- |
| `lan_0ms_0pct` | **0.000** | 5 / 136 / 137 | 4.0 / 20 / **0** | 0 / 0 | **PASS** |
| `rtt150_loss1` (75+75ms, 1%) | **0.000** | 10 / 141 / 112 | 8.0 / 8 / **0** | 0 / 0 | **PASS** |
| `rtt300_loss5` (150+150ms, 5%) | **0.000** | 16 / 115 / 99 | 12.0 / 4 / **0** | 0 / 0 | **PASS** |

---

## 3. 남은 미검증·후속 과제

- **Linux 실 호스트 기동 & `SIGTERM` → drain**: 검증기([verify-linux-ds-sigterm.cjs](../../forge/Tools/dedicated-server/verify-linux-ds-sigterm.cjs))와 CI 워크플로우 템플릿([linux-ds-sigterm.workflow.yml](../../forge/Tools/dedicated-server/linux-ds-sigterm.workflow.yml)) 준비 완료. 실제 실행은 `PlayHub-Platform`의 `.github/workflows/` 승격 후 `ubuntu-latest` CI 또는 Linux VM에서 수행 필요.
- **Iris C++ GDExtension Linux `.so` 빌드**: Windows x86_64 `.dll` 빌드·N0~N3 벤치마크 완료; Linux x86_64 `.so` 크로스/CI 빌드 및 24시간 soak 메모리 추세 시험은 Linux 환경에서 수행 필요.
- **운영 CA/인증서 체인·실 PlayHub Hub 마운트·Android 실기기**: 현재 Control Plane은 독립 HTTP 서비스로 검증 완료했으며 `hub/server/` 라우트 마운트, 운영 CA 체인, 모바일망 전환(Wi-Fi↔LTE)은 후속 통합 범위.
- **27번 물리 Resimulation / Hit Rewind & 30번 UGC OS 격리**: 12번 물리 스냅샷·`Forge-BuildExport` 격리 런타임 연계 후속 단계.
