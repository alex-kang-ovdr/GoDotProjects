# Godot 데디케이티드 서버 R0 기술 스파이크 (로드맵 25 + 28)

- 브랜치: `Forge-Multiplayer` (트렁크 `PlayHub-Platform` 기준)
- 범위: 로드맵 §9.1 스파이크 중 "로컬 DS+2 clients, 작은 맵, 이동·스폰·체력·owner RPC, 단순 full snapshot, headless export"
- 엔진: Godot 4.7.2 stable 공식 바이너리 (`4.7.2.stable.official.ed1daf0bf`), **엔진 무변경**. 모든 코드는 애드온 GDScript.
- 측정일: 2026-11-25, Windows 11 Pro 로컬 PC(loopback), 같은 머신에서 서버·클라이언트 동시 실행

## 1. 무엇을 만들었나

| 경로 | 내용 |
| --- | --- |
| `forge/Godot/addons/playforge_netframework/runtime/` | 게임 프레임워크 클래스(아래 표), `NetRpcGuard`, `NetJoinTicketAuthority`, `NetIds`(WorldKey·NetObjectId), `NetEventLog`(JSON 이벤트) |
| `forge/Godot/addons/playforge_netframework/demo/spike.tscn` + `spike_main.gd` | 하나의 씬을 `--netmode=dedicated-server` / `--netmode=client`로 별도 프로세스 실행. 클라이언트는 스크립트 봇(a/b/c)과 공격 probe |
| `forge/Godot/addons/playforge_netframework/demo/ticket_selftest.gd` | JoinTicket·NetObjectId 단위 자가 시험(`--script`) |
| `forge/Tools/dedicated-server/run-ds-2clients.cjs` | 서버 1 + 클라이언트 2 + 늦은 입장 1 + probe 4를 띄우고 JSON 이벤트로 판정. 실패 시 종료 코드 1 |
| `forge/Tools/dedicated-server/export-linux-ds.cjs` | 스테이징 프로젝트에서 `dedicated_server=true` 프리셋으로 Linux x86_64 export |
| `forge/Tests/netframework/ds-spike.godot.test.cjs` | 위 실행기를 감싼 integration/godot 시험(`tools/qa/test-catalog.json` 등록) |

`forge/Godot/project.godot`은 수정하지 않았다. 애드온을 활성화하지 않아도 씬 경로로 바로 실행된다.

```text
godot --headless --path forge/Godot res://addons/playforge_netframework/demo/spike.tscn -- --netmode=dedicated-server --port=24565 --run-dir=<dir>
godot --headless --path forge/Godot res://addons/playforge_netframework/demo/spike.tscn -- --netmode=client --port=24565 --bot=a --ticket=<dir>/tickets/bot-a.ticket
node forge/Tools/dedicated-server/run-ds-2clients.cjs        # 전체 시나리오 + 판정
node forge/Tools/dedicated-server/export-linux-ds.cjs        # Linux DS export
```

## 2. 아키텍처: Unreal 역할 대응

| Unreal | 이 애드온 | 존재 위치 | 권한·복제 |
| --- | --- | --- | --- |
| GameMode | `NetGameMode` (`net_game_mode.gd`) | **서버에만** (복제 트리 밖) | 입장 인증(JoinTicket)·슬롯 예약·스폰·tick 규칙(이동 적용, 위험 지역 피해)·수명(waiting→play→settle→draining) |
| GameState | `NetGameState` | 서버 + 모든 클라이언트 | 서버만 씀. `phase`, `server_tick`, `play_tick`, `world_key`, `player_peers`를 `MultiplayerSynchronizer`로 전체 복제 |
| PlayerState | `NetPlayerState` | 플레이어마다, 모든 peer | `slot`/`user_id`/`peer_id`는 스폰 데이터, `score`·`acked_input_seq`는 Sync로 복제 |
| PlayerController | `NetPlayerController` | 플레이어마다 | owner 전용 RPC 채널. client→server `server_submit_input(seq, move)`(서버가 발신자==owner 검증), server→owner `client_input_ack(seq)`(`rpc_id(owner)`) |
| Pawn | `NetPawn` (Node2D) | 플레이어마다, 모든 peer | 서버 권한 이동·체력. 클라이언트는 Sync로 받은 `position`·`health`만 표시 |
| (NetDriver/ReplicationGraph 일부) | `NetWorld` + Godot `MultiplayerSpawner`/`MultiplayerSynchronizer`/`ENetMultiplayerPeer`/`SceneMultiplayer` | 공통 | 스폰은 `spawn_function`, 서버 권한 Sync(30Hz). 클라이언트 간 relay 끔(`server_relay=false`) |

- **서버는 플레이어가 아니다**: 서버(peer 1)는 슬롯·Pawn·PlayerState를 갖지 않고 `player_peers`에 들어가지 않는다(시험으로 확인).
- **입장 = 인증 단계**: `SceneMultiplayer.auth_callback`에서 티켓을 검증해야만 peer가 연결 상태가 된다. 인증 전 peer는 RPC·복제를 받지 못한다.
- **Ready barrier**: 클라이언트는 GameState 첫 복제(`world_key`)와 자기 Pawn 스폰이 모두 도착한 뒤에 조작을 시작한다. 실측에서 스폰 패킷이 정적 노드 GameState의 Sync보다 먼저 도착하는 경우가 있었다(첫 실행에서 늦은 입장 클라이언트가 `phase=waiting`을 본 원인).
- **RPC 검증(`NetRpcGuard`)**: owner 불일치(`not_owner`), 비서버 수신(`not_server`), 순번 역행(`stale_seq`), NaN/Inf(`malformed`)는 거부·계수·로그, 크기 1 초과 입력은 정규화(`clamped`).
- **수명/drain**: `request_drain(reason)` 하나로 매치 종료·외부 신호 파일(`<run-dir>/control/drain`)·`NOTIFICATION_WM_CLOSE_REQUEST`(`auto_accept_quit=false`)를 모은다. drain 중 새 인증은 `draining`으로 거부하고, 남은 플레이어가 모두 나가면 종료 코드 0, 시한(10초) 초과 시 3. 빈 방 유휴 종료(기본 90초)도 같은 경로다.
- **NetMode**: 실행 인자 `--netmode`로 아래 네 모드를 선택한다.

### NetMode별 실행

동일한 `spike.tscn`을 열고 Godot 인자 구분자 `--` 뒤에 모드를 전달한다.

| 실행 인자 | 경기 상태를 확정하는 곳 | 화면과 플레이어 | 연결 |
| --- | --- | --- | --- |
| `--netmode=dedicated-server` | 서버 | 헤드리스로 실행하며 서버 슬롯은 없다 | 클라이언트 입장 대기 |
| `--netmode=listen-server` | 서버 | 서버 월드를 렌더링하며 서버 슬롯은 없다 | 클라이언트 입장 대기 |
| `--netmode=standalone` | 로컬 프로세스 | 로컬 플레이어가 직접 조작한다 | 오프라인 |
| `--netmode=client` | 접속한 서버 | 플레이어 화면 또는 헤드리스 테스트 봇 | 서버에 접속 |

리슨 서버는 화면이 있는 일반 Godot 실행 파일로 시작한다. 클라이언트 접속에는 서버가 발급한 티켓을 사용한다. 싱글플레이에는 서버 주소나 티켓이 필요하지 않다.

게임 로직은 `NetWorld.get_net_mode()`로 현재 프로세스의 모드를 읽을 수 있다. 예를 들어 같은 경기에 참가해도 서버 월드에서는 `listen-server`, 접속한 플레이어의 월드에서는 `client`를 반환한다. 아래 두 명령은 각각 렌더링하는 서버와 오프라인 싱글플레이를 시작한다. 싱글플레이는 방향키로 이동한다.

```text
godot --path forge/Godot res://addons/playforge_netframework/demo/spike.tscn -- --netmode=listen-server
godot --path forge/Godot res://addons/playforge_netframework/demo/spike.tscn -- --netmode=standalone
```

## 3. 사용한 계약 (로드맵 §7)

| 계약 | 구현 | 비고 |
| --- | --- | --- |
| WorldKey | `{tenantId, projectId, buildId, sessionId, worldEpoch}` → `local/forge-ds-spike/dev-4.7.2/<sessionId>#1` | GameState로 모든 클라이언트에 복제, 시험에서 일치 확인 |
| NetObjectId | `{index, generation}`, 슬롯 재사용 시 generation 증가 (`NetIds.ObjectIdAllocator`) | Pawn에 저장, 노드 이름 `Player_<index>_g<gen>`. RID·UID·user_id와 별개 |
| AuthoritySnapshot 일부 | `server_tick`, `acked_input_seq` | 완전한 schema_hash/state_revision은 미구현(26번 범위) |
| SessionLease/JoinTicket | 아래 필드 | 로컬 가짜 제공자(서버 프로세스 내부)가 발급·검증 |

JoinTicket payload(camelCase, `contracts/desktop/launch-ticket.v1.schema.json`의 `version`/`expiresAt`/`ttlSec`/`singleUse` 명명을 따름):

```text
{ "version": 1, "sessionId": "...", "instanceId": "local-<pid>", "leaseEpoch": 1,
  "userId": "bot-a", "slot": 0, "expiresAt": "2026-11-25T01:38:04Z", "expiresAtUnix": <같은 시각 unix>,
  "ttlSec": 60, "singleUse": true, "nonce": "<16B base64url>" }
```

- 형식: `base64url(payload) + "." + base64url(HMAC-SHA256(secret, payload_b64))`. 비교는 `Crypto.constant_time_compare`.
- 서명 키는 서버 시작 시 `Crypto.generate_random_bytes(32)`로 생성하고 디스크·로그·네트워크로 내보내지 않는다. 저장소에 비밀값 없음. 티켓 파일(`<run-dir>/tickets/*.ticket`)에는 서명된 티켓만 있다.
- 검증 순서: 길이·문자 → 서명 → JSON → `version` → `sessionId`/`instanceId` → `leaseEpoch` → 만료 → nonce 재사용. 성공하면 nonce를 즉시 소비(single-use). 이후 GameMode가 slot 범위·점유를 검사한다.
- TTL 60초는 deploy-billing 계획의 "Gateway JoinTicket 60초 검증"과 맞췄다.
- 주의: 서명·만료가 유효하지만 슬롯이 이미 점유된 티켓(`slot_taken`)도 nonce는 소비된다. 운영 제공자에서는 "slot 예약 후 소비"로 바꿀지 결정이 필요하다(29번).

## 4. 기존 결정과의 정합성

| 기존 결정 (문서) | 이 스파이크 |
| --- | --- |
| Node 권위 서버(`forge/Tools/*-multiplayer.cjs`)는 템플릿 전용, 제작자 게임용은 새 Godot DS 경로 (multiplayer-plan-review, ADR-12) | 따름. Node 서버·템플릿 무수정, 별도 애드온·별도 도구 경로 |
| `serverRuntime: none / node-wss-v1 / godot-linux-wss-v1`, WSS Gateway + JoinTicket (multiplayer-deploy-billing-plan) | 부분. 티켓 필드·60초 TTL·single-use는 호환. 전송은 아직 ENet(UDP)이며 WSS(`WebSocketMultiplayerPeer`)·Gateway 중계는 미구현 → `godot-linux-wss-v1` 전 단계 |
| `godot-server` 런타임, Gateway에서 ConnectTicket 검증, 유휴 hibernate (game-server-cost-optimization-plan) | 부분. 서버 측 티켓 검증·빈 방 유휴 종료 경로는 있음. Gateway 검증·스냅샷 hibernate는 없음 |
| `dedicated_server` feature tag, 장르별 tick, SIGTERM 시 정상 종료 (creator-server-optimization-guide) | 따름(부분 검증). 역할 결정에 feature tag 사용, Linux export 프리셋 `dedicated_server=true`, 30Hz tick(아레나 권장 20~30Hz), close request/신호 파일 → drain → `quit(0)`. **Linux SIGTERM 자체는 미검증**(아래 6절) |
| ADR-G07 Room별 프로세스부터 (PlayForge_Godot_Review_v1/15) | 따름. 1 세션 = 1 서버 프로세스 |
| ADR-G08 PF Net Schema/Ready Barrier를 엔진 밖에 유지 | 따름. 엔진 무변경, 애드온 내 GDScript. 클라이언트 Ready barrier 구현 |
| 07 Dedicated PIE: 서버 1 + 클라이언트 2 | 따름. 각 클라이언트 별도 프로세스·별도 identity·slot·ticket |
| 매치메이킹은 PlayHub 소유(Gateway+JoinTicket), EAC 보류 (EOS_FEASIBILITY_AND_SSOT_PLAN) | 따름. 티켓 발급자는 로컬 가짜 제공자(향후 Hub 백엔드로 교체), EAC 없음 |

## 5. 실측 결과 (2026-11-25, `run-ds-2clients.cjs`)

서버는 A·B 입장 후 150틱(30Hz에서 5초) 동안 경기를 진행한다. 실행기는 그 뒤에 C와 입장 검사용 클라이언트 세 개를 시작한다. 서버는 C가 플레이어를 할당받고 세 클라이언트가 거부 응답을 받을 때까지 play를 유지한다. 종료 중 입장을 시도할 클라이언트의 준비가 끝나면 실행기가 settle과 외부 drain을 차례로 요청한다. 서버가 `drain_started`를 기록한 뒤 해당 클라이언트를 접속시키고, 실제 `join_refused` 응답을 받은 뒤 기존 플레이어의 퇴장을 허용한다. 실행기 전용 신호 파일을 지정하지 않은 경기에서는 설정된 틱 수와 퇴장 유예 시간을 따른다.

봇: A는 오른쪽 45 tick, 아래 30 tick. B는 오른쪽 60 tick(위험 지역 x∈[300,420] 진입, tick당 체력 1 감소), 30 tick 대기, 왼쪽 30 tick. B는 play tick 20부터 **A의 Controller**에 `server_submit_input`을 3회 위조 전송. C는 위로 20 tick.

판정(마지막 실행, 모두 PASS. 첫 실행은 늦은 입장 판정 1건 FAIL → Ready barrier 추가 후 실행기 단독 5회 + 통합 시험 1회 연속 PASS):

| 판정 | 결과 |
| --- | --- |
| ticket_selftest (정상·재사용·slot 위조·만료·형식·다른 서버 키·NetObjectId generation) | PASS |
| server_clean_exit / drain_waited_for_players | PASS — exit 0, forced=false, remaining=0 |
| client-a/b/c 정상 종료 | PASS — 모두 exit 0 |
| server_not_in_player_list | PASS — `player_peers` 3개 모두 ≠ 1, 서버 스냅샷·클라이언트 스냅샷 모두 peer 1 없음 |
| clients_converge_to_server | PASS — A·B·C 모두 위치 최대 오차 0 px(허용 0.5), 체력 불일치 0, 누락·초과 0 |
| server_rules_applied | PASS — A 위치 (276, 320), B 체력 51 |
| illegal_owner_rpc_rejected | PASS — 위조 3회, `not_owner` 거부 3회, A의 acked seq 148(위조 seq 1000000 미적용) |
| ticket_reused (A의 티켓 재사용) | PASS — 서버 `join_rejected: ticket_reused`, probe 미연결 |
| hmac_invalid (B 티켓의 slot을 0으로 변조) | PASS |
| slot_taken (유효 서명이지만 점유된 slot 0) | PASS |
| draining (drain 중 입장) | PASS |
| late_join_receives_world | PASS — 서버 입장 시 phase=play, C가 기존 Pawn 2개 + 자기 Pawn을 받고 수렴 |
| world_key_consistent | PASS |
| drain_order (drain_started → 3명 퇴장 → drain_complete) | PASS |

계측(같은 실행):

| 항목 | 값 |
| --- | --- |
| 서버 프로세스 시작 → listening | 265 ms |
| 클라이언트 연결 시간(ENet 연결 + 티켓 인증 포함) | 34.6 / 51.4 / 51.4 ms (A/B/C) |
| 서버 게임 규칙 tick 시간 (30Hz, 263 tick) | p50 43 µs, p95 182 µs, p99 348 µs, max 11.4 ms(1회 이상치) — 33.3 ms 예산 대비 p99 1% |
| 서버 ENet 총 송신/수신 | 84,916 B / 1,236 pkts, 21,488 B / 989 pkts (약 9초, 최대 3명) |
| 클라이언트별 ENet 수신/송신 | A 28,677 / 6,629 B, B 28,331 / 6,839 B, C 27,286 / 6,165 B |
| 입력 RPC | 클라이언트당 137~149개 전송, 서버 accepted 435, stale/malformed/clamped 0 |
| 전체 시나리오 벽시계 | 약 9.6초 (Godot 프로세스 9개) |

Ready barrier 이후 실행기 단독 5회 범위: listening 259~314 ms, 연결 34.5~68.0 ms, tick p99 257~402 µs, max 0.9~11.7 ms.

해석: 서버 송신은 플레이어 1인당 대략 3 KB/s 수준(full snapshot, 델타·양자화 없음)으로 creator-server 가이드의 10 KB/s 기준 안이다. tick 시간은 "게임 규칙 tick"만 잰 값이며 Godot 복제(Sync 직렬화)·ENet 처리 시간은 포함하지 않는다. 같은 PC loopback이므로 RTT/손실·지터는 측정 대상이 아니었다.

증거 위치(커밋 안 함): `forge/Saved/Tests/netframework/ds-spike-<시각>/` — 프로세스별 로그, `tickets/`, `summary.json`.

### Linux 데디케이티드 export

`export-linux-ds.cjs`: Godot 4.7.2 Linux export template(`linux_release.x86_64`)이 로컬에 있어 export를 실행했다. `dedicated_server=true` 프리셋, PCK 내장, 결과 ELF x86_64 **73,564,344 B**, import+export 7.7초. 프리셋 조건으로 텍스처 포맷 1개(S3TC/BPTC) 선택이 필요했다(미선택 시 export 실패). **Linux 호스트(WSL 없음)에서 실행·접속은 하지 않았다.**

## 6. 하지 않은 것 (미검증)

- Linux 바이너리 실행, Linux에서의 SIGTERM 처리: Godot가 SIGTERM을 `NOTIFICATION_WM_CLOSE_REQUEST`로 전달하는지 이 스파이크에서 확인하지 않았다. 현재 검증된 drain 트리거는 외부 신호 파일(오케스트레이터 대체)과 매치 종료다. Linux 실행 시 SIGTERM → drain 확인이 다음 작업이다.
- Windows에서 `dedicated_server` feature가 켜진 export 실행(역할 결정 분기는 코드만 존재, 현재 실행기는 `--netmode`를 지정).
- Android 실기기(로드맵 §9.1의 기기 1종 검증), RTT/손실·재정렬 주입, 지터.
- Iris식 dirty/quantize/delta/ACK, 관심 영역·dormancy·우선순위(26번). 현재는 Godot 기본 Sync full 값 복제.
- 클라이언트 예측·보정·보간, physics rewind(27번). 클라이언트는 서버 값을 그대로 표시.
- WSS 전송(`WebSocketMultiplayerPeer`)과 WSS Gateway 중계, 실제 Hub 발급 JoinTicket, lease 갱신·fleet(28/29번).
- owner 전용 노드 가시성: Controller 노드는 모든 peer에 스폰된다(RPC 검증으로 보호). 노드 자체를 owner에게만 보이게 하는 visibility 필터는 미적용.
- 부하(CCU·세션 수), 장시간 메모리 추세, 서버 RAM 측정.

## 7. Node 템플릿 서버와의 공존

- 기존 `forge/Tools/*-multiplayer.cjs`(BrawlLabs·Fortress·Captain Forever MMO)는 플랫폼 템플릿 전용 `node-wss-v1` 경로로 그대로 둔다. 이 스파이크는 그 파일들과 포트·프로토콜·코드를 공유하지 않는다.
- 제작자 게임은 이 애드온(`playforge_netframework`)을 프로젝트에 포함해 같은 씬을 서버/클라이언트로 실행하는 Godot DS 경로를 쓴다. 배포 manifest에서는 `serverRuntime: godot-linux-wss-v1`로 구분될 예정이다(현재는 ENet, WSS 전환 필요).
- 두 경로가 공통으로 맞출 것은 Gateway가 검증할 JoinTicket 필드와 세션 수명(drain·유휴 종료) 규약이다.

## 8. 실제 패킷 지연·손실과 런타임 프로파일링

저장소 루트에서 다음 명령을 실행하면 로컬 서버와 클라이언트 A·B가 한 경기를 시작한다. 각 클라이언트의 ENet 패킷은 별도의 루프백 UDP 프록시를 통과한다. 기본값은 지연 0ms, 손실 0%다.

```text
node forge/Tools/dedicated-server/run-net-lab.cjs --windowed-client --seed 17
```

A는 방향키로 움직이고 B는 자동으로 입력을 보낸다. 두 클라이언트를 모두 헤드리스 봇으로 실행하려면 `--windowed-client`를 생략한다. `--listen-server`는 서버 월드도 렌더링한다. `NET_LAB_READY`가 표시되면 터미널에서 다음과 같이 조건을 바꿀 수 있다. 게임 창에서는 백틱(`~` 키)을 눌러 같은 명령을 입력한다. 창에서는 현재 프로세스의 송수신 방향을 사용하므로 `a`나 `server` 접두어를 생략한다.

```text
a NetEmulation.PktLag 80
a NetEmulation.PktLoss 5
a NetEmulation.PktIncomingLag 40
NetEmulation.Status
server stat net
a NetEmulation.Off
quit
```

이 예에서 A→서버 패킷은 80ms 지연되고 각각 5% 확률로 유실되며, 서버→A 패킷은 40ms 지연된다. A의 왕복에 더해지는 설정 지연은 120ms다. `PktIncomingLoss`로 수신 방향 손실률도 조절할 수 있다. `a` 또는 `b`를 붙이면 그 클라이언트에만 적용한다. 접두어를 생략하면 두 클라이언트에 적용한다. `server`를 붙이면 송수신 방향은 서버 기준이다. 지연 범위는 0~2,000ms, 손실 범위는 0~100%다. seed는 방향별·클라이언트별 손실 난수열을 고정하며 실제 프레임 시간은 실행 환경에 따라 달라진다.

`netprofile` 또는 `stat net`은 최근 측정 구간의 ENet 송수신 바이트·패킷과 RPC 메서드별 송수신 횟수를 보여 준다. ENet 통계에는 해당 연결의 게임 데이터와 프로토콜 트래픽이 들어간다. RPC 전송 횟수는 애플리케이션 호출 단위이며 복제 패킷이나 전송 계층의 재전송 횟수와 단위가 다르다. `NetEmulation.Status`에서 프록시가 방향별로 받은 패킷, 전달한 패킷, 설정에 따라 버린 패킷, 큐 한도에 걸린 패킷을 확인할 수 있다.

실행 시 출력된 `Evidence` 디렉터리의 `profile.jsonl`에 프로세스별 시계열, `commands.jsonl`에 적용한 명령, `summary.json`에 종료 시 누계가 저장된다. `quit`은 지연·손실을 해제하고 경기를 종료한다. 이 실행기는 Windows/Linux 로컬 ENet 개발 시험용이다. 운영 WSS Gateway와 인터넷 경로의 성능은 별도로 측정한다.

명령 단위와 송수신 방향은 [Unreal Network Emulation](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-network-emulation-in-unreal-engine)을 참고했고, 트래픽과 RPC 호출 수를 분리해 읽는 방식은 [Unreal Network Profiler](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-the-network-profiler-in-unreal-engine)를 참고했다.

### 엔진 포크와 순정 Godot의 계측 경계

포크 `Forge-Refactoring-Multiplayer`에서는 일반 `@rpc`도 `SceneMultiplayer.get_rpc_profile()`에 잡힌다. 캡처는 `set_rpc_profiling_enabled(true)`로 시작하며 반환값은 메서드별 누적 발신·수신 횟수와 인코딩된 RPC 바이트다. 같은 메서드 이름은 하나로 합산된다. 순정 엔진에서 데모의 두 RPC는 애드온 래퍼에서 횟수만 기록한다. 각 표본의 `rpcSource`는 각각 `engine` 또는 `wrapper_fallback`이다. 포크를 사용하면 래퍼 카운트를 합산하지 않는다.

포크에서 프록시 없이 실행한 `spike.tscn -- --net-debug` 세션은 게임 콘솔 명령을 현재 ENet 호스트의 `apply_debug_packet_command()`에 직접 전달한다. 위의 다중 클라이언트 실행기는 순정 엔진과 동일한 조건을 재현하기 위해 프록시만 사용한다. 한 연결에서 장애를 두 번 주입하지 않는다. 엔진 호스트의 `pop_statistic()`는 읽을 때 초기화되므로 각 프로세스에서는 프로파일러 한 곳에서만 읽는다. 바이트 수는 ENet에서 센 값이며 IP 헤더를 포함한 실제 회선 사용량이나 상대방의 수신 보장을 뜻하지 않는다.

## 9. 다음 단계 제안

1. WSS 전송으로 같은 시나리오 재실행(`WebSocketMultiplayerPeer`), 측정 비교.
2. Linux 호스트(또는 CI ubuntu runner)에서 export 바이너리 실행 + SIGTERM → drain 확인.
3. §8의 지연·손실 설정으로 기기별 입력 ACK 지연과 보정 오차를 측정해 예측(27번) 기준값을 정한다.
4. JoinTicket 발급을 Hub 백엔드 API로 옮기고 서명 키 관리(비대칭 서명 또는 Gateway 내부 키) 결정.
