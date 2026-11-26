# 25. Unreal 방식 게임 프레임워크·서버 권한·RPC

- 원본 계획서: [`plans/25_Unreal_Gameplay_Authority_RPC.md`](../plans/25_Unreal_Gameplay_Authority_RPC.md) (ZIP 원문 SHA-256 대조 및 저장소 반입 완료)
- 통합 대상 브랜치: `Forge-Multiplayer` — 신규 (R0 착수)
- 구현 위치: 실행 모드·권한은 `Forge-Multiplayer`, 엔진 계측·패킷 시뮬레이션은 `Forge-Refactoring-Multiplayer`
- 우선순위: P0 / 본체 공수: 14-20 PW / 착수 단계: R0
- 커밋 영역 성격: GD-Ext

## 저장소에 이미 있는 관련 자산

- 기존 Node 권위 서버 3종(forge/Tools/*-multiplayer.cjs, PlayHub-Platform 소유) — 템플릿 전용 경로로 유지(multiplayer-plan-review ADR-12)
- PlayHub-EOS 서버 권위 MMO DataStore

## NetMode와 권한·표시 계약

`NetMode`는 Forge bootstrap의 실행 모드이며 Godot 내장 CLI 옵션이 아니다. Forge bootstrap은 `--netmode=<mode>` 하나만 받아 소문자 케밥 값으로 모드를 정하고, 권한과 transport는 렌더링 여부와 별도로 정한다.

| `--netmode` | 권한·게임 상태 | 로컬 플레이어 | 렌더링 | Transport |
| --- | --- | --- | --- | --- |
| `dedicated-server` | 서버 권위. 모든 입력·RPC를 검증하고 경기 결과를 확정 | 자동 생성하지 않음 | headless, 게임 화면 렌더링 없음 | 서버 endpoint 수신 |
| `listen-server` | 렌더링하는 서버 권위. remote client 입력을 검증하고 결과 확정 | 로컬 슬롯 없음. 호스트 플레이는 별도 `client` 프로세스로 접속 | 권위 서버 화면 렌더링 | 서버 endpoint 수신 및 remote client 연결 허용 |
| `standalone` | 단일 프로세스 로컬 권위. 세션 서버 권한·JoinTicket 없음 | 로컬 1명 | 렌더링 | 네트워크 transport 비활성 |
| `client` | 비권위. 입력·요청 제출과 로컬 예측만 허용; 최종 상태·보상 확정 금지 | 원격 identity로 접속; UI 없는 headless bot 허용 | 기본 렌더링; `--headless` bot에서는 생략 | 선택한 DedicatedServer 또는 ListenServer에 연결 |

`Client`는 봇 용도에서 `--headless` 실행할 수 있으며, 이때도 서버 권위는 갖지 않는다. 모든 Client 요청에는 서버 RPC 소유권·시퀀스·게임 조건 검증을 적용한다.

## 구현 경계와 다음 검증

기본 구현은 Godot 공개 `MultiplayerAPI`/ENet 재사용이며, 네 가지 NetMode와 권한·복제 스키마는 Forge bootstrap/addon 계층에 둔다. `listen-server`는 렌더링하는 권위 서버지만 로컬 플레이어를 자동 생성하지 않는다. 좁은 E3 예외는 [NET_DEBUG_E3_ADR](https://github.com/alex-kang-ovdr/godot-engine/blob/Forge-Refactoring-Multiplayer/playforge/NET_DEBUG_E3_ADR.md)에 따라 승인됐고, 현재 엔진 회귀는 [후속 커밋 `4153e53e1b60f138a31d36381bf9fd4eacf5e911`](https://github.com/alex-kang-ovdr/godot-engine/commit/4153e53e1b60f138a31d36381bf9fd4eacf5e911)에 있다. Windows loopback DTLS 시험은 런타임 생성한 `CN=localhost` 자체 서명 인증서를 명시적 trust root로 사용해 안전한 TLS client 인증서·호스트명 검증, reliable 요청·응답 실제 수신을 확인한다. NetMode·연결 검증은 8/8을 통과했고, `enet_rpc_netdebug`는 두 차례 각각 50/50 통과했다. 두 반복 모두 120 ms 설정 지연이 80 ms 판정 하한을 넘었고, `Off` 뒤 같은 연결에서 secure payload 전달이 복구됐다. 이 테스트는 운영 CA/인증서 체인을 검증하지 않는다.

남은 검증은 Linux ELF export의 실제 Linux 호스트 기동·접속·SIGTERM 종료, WSS Gateway 경로, 운영 인증서 체인, MTU, 패킷 손실, 재접속이다. 현재 인증서·호스트명 시험은 Windows loopback 자체 서명 인증서 범위이며 운영 인증서로의 검증을 대신하지 않는다. ENet 사용만으로 암호화 완료로 간주하지 않는다([항목 28](28_Dedicated_Server_Runtime_Operations.md), [원문 계획 29 §6](../plans/29_Online_Services_Sessions_Relay.md#6-native-web-전송-설계)).

## 첫 작업 (spike)

- 기존 Windows DS 스파이크를 재사용해 DS+2 clients, 작은 맵, 이동·스폰·체력·owner RPC 범위를 확인한다 (roadmap §9.1).
- Linux headless/WSS 경로는 아직 실행되지 않았으며 28번의 별도 이슈로 분리한다.

## 승격 gate

- GameMode/GameState/PlayerState/Controller/Pawn addon + 수명·소유권 시험

## 진행 상태

- [x] 원본 계획서 반입
- [x] 첫 spike 이슈 분해 (`Forge-Multiplayer`: `GODOT_DS_SPIKE.md`, `R1_REPLICATION_PREDICTION_REPORT.md`)
- [x] spike 결과 기록 (Windows ENet/WSS TLS 검증 23/23 PASS, 재접속 `owner_epoch`·하이재킹/구 epoch RPC 차단 검증 완료; 운영 CA 체인·Linux 호스트 기동·WSS Gateway·Android 실기기는 미검증으로 구분 기록)

## 원본 계획 대조

- 원본 WBS 참조: §8 8. 작업분해와 공수 (원본 97행); §9 9. 도입 단계 (원본 111행); §10 10. 완료 기준과 재현 시험 (원본 118행)
- 패키지 내 원문 SHA-256: `ba422e9f07d6e8b574c6de6641299df4c48721850d62dfa6ac8855e464e71e46`
- SSOT 적용: 25-30은 Godot 게임 내부 계층의 정본이다. 제작자 게임은 Godot DS를 사용하고 Node 권한 서버는 템플릿 전용이다. 게임 서버 접속은 JoinTicket 계약을 따른다(SSOT.md §1-2).
