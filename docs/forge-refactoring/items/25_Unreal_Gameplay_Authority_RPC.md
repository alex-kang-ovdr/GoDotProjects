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

`NetMode`는 Forge bootstrap의 실행 모드이며 Godot 내장 CLI 옵션이 아니다. `--net-mode` 값은 소문자 케밥 표기를 사용하고 권한과 transport는 렌더링 여부와 별도로 정한다.

| `--net-mode` | 권한·게임 상태 | 로컬 플레이어 | 렌더링 | Transport |
| --- | --- | --- | --- | --- |
| `dedicated-server` | 서버 권위. 모든 입력·RPC를 검증하고 경기 결과를 확정 | 자동 생성하지 않음 | headless, 게임 화면 렌더링 없음 | 서버 endpoint 수신 |
| `listen-server` | 렌더링하는 서버 권위. remote client 입력을 검증하고 결과 확정 | 로컬 슬롯 없음. 호스트 플레이는 별도 `client` 프로세스로 접속 | 권위 서버 화면 렌더링 | 서버 endpoint 수신 및 remote client 연결 허용 |
| `standalone` | 단일 프로세스 로컬 권위. 세션 서버 권한·JoinTicket 없음 | 로컬 1명 | 렌더링 | 네트워크 transport 비활성 |
| `client` | 비권위. 입력·요청 제출과 로컬 예측만 허용; 최종 상태·보상 확정 금지 | 원격 identity로 접속; UI 없는 headless bot 허용 | 기본 렌더링; `--headless` bot에서는 생략 | 선택한 DedicatedServer 또는 ListenServer에 연결 |

`Client`는 봇 용도에서 `--headless` 실행할 수 있으며, 이때도 서버 권위는 갖지 않는다. 모든 Client 요청에는 서버 RPC 소유권·시퀀스·게임 조건 검증을 적용한다.

## 구현 경계와 다음 검증

기본 구현은 Godot 공개 `MultiplayerAPI`/ENet 재사용이며, 네 가지 NetMode와 권한·복제 스키마는 Forge bootstrap/addon 계층에 둔다. `listen-server`는 렌더링하는 권위 서버지만 로컬 플레이어를 자동 생성하지 않는다. 이번 실측 프로파일러·패킷 시뮬레이션을 위한 좁은 E3 예외는 [NET_DEBUG_E3_ADR](https://github.com/alex-kang-ovdr/godot-engine/blob/Forge-Refactoring-Multiplayer/playforge/NET_DEBUG_E3_ADR.md)에 따라 승인되어, 엔진 구현은 [`Forge-Refactoring-Multiplayer` 브랜치](https://github.com/alex-kang-ovdr/godot-engine/tree/Forge-Refactoring-Multiplayer)에 분리했다. Windows 엔진 검증은 33/33을 두 차례 통과했고, NetMode·연결 검증은 8/8 통과했다. 후속 기능은 Godot 공개 API와 Forge 계층으로 먼저 검증하고, 필요한 동작이나 계측을 제공할 수 없을 때만 엔진 수정 범위를 다시 검토한다.

다음 검증은 이미 성공한 Linux ELF export를 실제 Linux 호스트에서 기동해 접속·SIGTERM 종료까지 확인하고, 별도로 WSS Gateway 경로를 실행하는 것이다. Native ENet+DTLS는 실제 인증서 검증·호스트명·MTU·손실·재접속 시험이 남아 있으며, ENet 사용만으로 암호화 완료로 간주하지 않는다([항목 28](28_Dedicated_Server_Runtime_Operations.md), [원문 계획 29 §6](../plans/29_Online_Services_Sessions_Relay.md#6-native-web-전송-설계)).

## 첫 작업 (spike)

- 기존 Windows DS 스파이크를 재사용해 DS+2 clients, 작은 맵, 이동·스폰·체력·owner RPC 범위를 확인한다 (roadmap §9.1).
- Linux headless/WSS 경로는 아직 실행되지 않았으며 28번의 별도 이슈로 분리한다.

## 승격 gate

- GameMode/GameState/PlayerState/Controller/Pawn addon + 수명·소유권 시험

## 진행 상태

- [x] 원본 계획서 반입
- [ ] 첫 spike 이슈 분해
- [ ] spike 결과 기록 (실행한 검증과 미검증 구분)

## 원본 계획 대조

- 원본 WBS 참조: §8 8. 작업분해와 공수 (원본 97행); §9 9. 도입 단계 (원본 111행); §10 10. 완료 기준과 재현 시험 (원본 118행)
- 패키지 내 원문 SHA-256: `ba422e9f07d6e8b574c6de6641299df4c48721850d62dfa6ac8855e464e71e46`
- SSOT 적용: 25-30은 Godot 게임 내부 계층의 정본이다. 제작자 게임은 Godot DS를 사용하고 Node 권한 서버는 템플릿 전용이다. 게임 서버 접속은 JoinTicket 계약을 따른다(SSOT.md §1-2).
