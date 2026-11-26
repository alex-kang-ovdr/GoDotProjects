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
| **26** (Iris 방식 상태 복제) | `replication/fg_net_schema.gd`, `replication/fg_state_store.gd`, `replication/fg_interest_filter.gd`, `replication/fg_replication_server.gd`, `replication/fg_replication_client.gd`, `replication/fg_replication_bridge.gd` | cell-relative `Vector2` 양자화, `u16` 각도 양자화, SHA-256 `protocol_hash`, `atomic_groups`(혼합 scope 스키마 차단), 불변 상태 저장소(캡처 dirty vs 연결별 delivery 분리), `acked_baseline_rev` vs `synced_server_rev` 분리, bounded baseline history(16) 초과 시 자동 full refresh, `MSG_STORAGE_ACK`·위조 future revision ACK 거절, `keyed_collection` 인벤토리+tombstone, owner 전용 필드 wire 0바이트 격리, 공간 AOI hysteresis, dormancy(late join 초기 전송 + 수면 중 파괴 tombstone), `SceneMultiplayer.send_bytes` 라이브 어댑터 |
| **27** (이동 예측·보정·원격 보간) | `prediction/fg_movement_sim.gd`, `prediction/fg_predicted_character.gd`, `prediction/fg_remote_interpolator.gd` | 서버·클라이언트 공용 정적 월드/장애물 고정 tick 시뮬레이션, 로컬 입력 즉시 예측 + bounded `input_history`, `acked_input_seq` reconcile & replay(pre-ACK·중복 ACK 히스토리 보존, `max_replay_ticks=32` 초과 시 안전 hard correction), 시뮬레이션 위치 vs 화면 `visual_offset` 분리, `teleport_revision`/`world_epoch` 즉시 리셋, 원격 `server_tick` 정렬 snapshot ring + 적응형 jitter 지연 + `max_extrapolation_ms=100` 상한 |
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
| **N1 벤치마크** (8연결 / 500객체 / 5% dirty, GDScript) | tick p50 **36.0 ms**, p95 **47.2 ms**, 연결당 10Hz **12.75 KB/s** *(순수 GDScript 기준선; 대규모 N2/N3는 C++ GDExtension 전환 필요 근거 확보)* |

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

- **Linux 실 호스트 기동 & `SIGTERM` → drain**: 로컬 Windows 환경에 WSL/Docker가 없어 Linux ELF 실행 자체는 미검증(CI Ubuntu runner 또는 Linux VM에서 실행 필요).
- **운영 CA/인증서 체인 및 WSS Gateway 중계**: 현재 WSS 시험은 루프백 자체 서명 인증서 + 명시적 trust root 검증 범위이며, 실제 PlayHub WSS Gateway 및 운영 CA 체인·모바일망 전환(Wi-Fi↔LTE)은 별도 검증 필요.
- **Iris C++ GDExtension 핫패스 최적화**: 순수 GDScript 코어는 N0(p95 3.56ms)까지는 여유로우나 N1(8연결/500객체, p95 47.2ms)부터 30Hz 예산(33.3ms)을 초과하므로 N2(32연결/2,000객체) 이상 목표 시 C++ GDExtension 이전이 필요.
- **27번 물리 Resimulation / Hit Rewind & 29번 실 Hub JoinTicket 발급 API & 30번 UGC OS 격리**: 12번 물리 스냅샷·Hub 백엔드·`Forge-BuildExport` 격리 런타임 연계 후속 단계.
