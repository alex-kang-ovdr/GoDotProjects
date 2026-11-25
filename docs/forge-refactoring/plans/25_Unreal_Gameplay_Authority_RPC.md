# 25. Unreal 방식 게임 프레임워크·서버 권한·RPC 개발 계획

| 항목 | 계획 |
| --- | --- |
| 계획 ID / 기준일 | NET-25 / 2026-11-24 |
| 원문 대응 | PDF 5-6쪽 멀티플레이 결함, 7-9쪽 네트코드 개선; 사용자 Unreal 방식 지정 |
| 우선순위 / 상태 | P0 / 개발 착수용 설계안, 구현·실행 검증 전 |
| 구현 위치 | 공용 GDExtension ForgeNet + GDScript 게임 프레임워크 + 에디터 실행 도구 |
| 선행 과제 | 16 빌드 기준선; 28 로컬 실행기와 병행 |
| 담당 / 예상 공수 | 네트워크·게임플레이 엔지니어, QA / 14-20 사람-주(PW) |
| 적용 범위 | Windows·Android·iOS 클라이언트, Linux 전용 서버; Web은 29의 별도 전송 어댑터 |

1 PW는 숙련 담당자 1명의 5근무일이다. 모든 기간·성능·시험 수치는 계획용 추정 또는 목표이며 실측 결과가 아니다. ForgeNet 및 아래 Fg 접두 클래스는 새로 제안하는 API이다.

## 1. 목표와 설계 결정

게임 규칙, 플레이어 입력, 소유권, 공개 상태, 비공개 상태를 분리한다. 서버가 스폰·피해·인벤토리·승패·소유권의 최종 권한을 갖고 클라이언트는 입력과 요청을 제출한다. 게임 제작자는 GDScript로 규칙을 작성하고 전송·직렬화·권한 검사·재접속은 공용 계층을 사용한다.

Unreal의 프레임워크 책임을 Godot의 Node/Resource 구성으로 구현한다. UE 클래스 바이너리 호환, UE 서버와의 접속, UE 소스의 직접 이식을 범위에 넣지 않는다. 공개 설계를 참고하는 독립 구현이다. Iris식 상태 복제는 [26번](26_Iris_Style_Replication.md), 이동 예측은 [27번](27_Movement_Prediction_Network_Physics.md), 호스팅은 [28번](28_Dedicated_Server_Runtime_Operations.md)의 책임이다.

## 2. 공식 확인 사실과 원문 보정

Unreal은 GameInstance와 GameMode·GameState·PlayerState의 수명을 구분하며 GameInstance를 자동 복제하지 않는다. 이를 책임 분리의 참고 모델로 사용한다. [Epic Gameplay Framework](https://dev.epicgames.com/documentation/unreal-engine/gameplay-framework-in-unreal-engine)

Owning connection은 owner 전용 상태와 RPC 대상 판정에 사용된다. 소유한 클라이언트가 곧 서버의 최종 권한을 가진다는 뜻으로 사용하지 않는다. [Epic Actor Owner and Owning Connection](https://dev.epicgames.com/documentation/en-us/unreal-engine/actor-owner-and-owning-connection-in-unreal-engine)

Godot에는 RPC·Spawner·Synchronizer가 이미 있다. 다만 SceneMultiplayer의 내부 프로토콜은 외부 서버용 안정 규격이 아니다. 기본 기능의 존재와 게임별 보안·예측 구현의 필요성을 구분한다. [Godot SceneMultiplayer](https://docs.godotengine.org/en/stable/classes/class_scenemultiplayer.html)

## 3. Unreal 개념과 제안 클래스 매핑

| Unreal 개념 | Godot 제안 구성 | 수명·복제·권한 |
| --- | --- | --- |
| GameInstance | FgGameInstance / 서비스 컨테이너 | 프로세스 수명, 자동 복제 없음; 계정 토큰을 게임 상태에 넣지 않음 |
| World / NetDriver | FgNetWorld / FgNetDriver | 세션·월드별 별도 상태, 전송과 게임 시뮬레이션 연결 |
| GameMode | FgGameMode | 서버에만 존재; 입장·리스폰·승패 규칙 |
| GameState | FgGameState | 서버 작성, 클라이언트에 공개 가능한 경기 상태 |
| PlayerController | FgPlayerController | 서버 및 해당 소유 클라이언트만; 입력·요청의 진입점 |
| PlayerState | FgPlayerState | 공개 점수·팀과 owner 전용 정보의 스키마를 분리 |
| Pawn / Character | FgPawn / FgCharacter | possession 관계; 이동은 NET-27 컴포넌트 |
| Actor / Component / Subobject | FgNetEntity + FgNetComponent | 루트와 서브오브젝트의 생성·파괴·복제 ID 추적 |
| Authority / Autonomous / Simulated | FgNetRole | 서버 권한 / 본인 입력 예측 / 원격 관찰 역할; 클라이언트 임의 변경 금지 |
| RepNotify | on_net_state_applied | 원자 상태 적용 후 알림; 임의 필드 알림 순서에 의존하지 않음 |

Godot Node.owner는 씬 저장 소유 관계이므로 네트워크 소유권으로 재사용하지 않는다. 별도 owner_connection_id를 둔다. peer_id 역시 인증된 사용자 ID와 분리한다.

## 4. 모듈 경계와 실행 순서

주 루프는 수신 검증 → 입력 큐 → 고정 시뮬레이션 → 서버 규칙 확정 → 상태 캡처 → 복제 송신 순으로 실행한다. 게임 Node 읽기·쓰기는 월드의 주 스레드에서 한다. 전송 작업 스레드는 검증된 바이트와 불변 상태만 처리한다.

FgNetDriver는 ITransport, IRpcRegistry, IReplicationBackend, IConnectionAuthorizer에 의존한다. 초기 비교 실험용 Godot 기본 복제 어댑터와 최종 NET-26 복제 어댑터를 선택할 수 있으나, 동일 객체·동일 필드를 두 복제기가 동시에 쓰지 못하게 한다. 드라이버 변경은 연결 시작 전 선택하고 다른 프로토콜끼리의 접속은 거절한다.

생성은 서버의 prefab_id allowlist로 제한한다. 클라이언트는 res:// 경로나 임의 스크립트를 보내 생성할 수 없다. 스폰 데이터는 인증된 build의 콘텐츠 카탈로그에 있는 항목만 참조한다.

## 5. 제안 데이터·API 계약

아래는 신규 설계의 의사 스키마이며 현재 Godot API가 아니다.

```text
WorldKey = {tenant_id, project_id, build_id, session_id, world_epoch}
NetObjectId = {index:u32, generation:u32}
Connection = {connection_id, authenticated_user_id, owner_epoch, permissions}
RpcEnvelope = {
  protocol_hash, world_epoch, object_id, rpc_id,
  input_seq_or_request_id, client_tick, owner_epoch, payload_length, payload
}
FgNetWorld.spawn(prefab_id, initial_state, owner_connection_id) -> NetObjectId
FgNetWorld.possess(controller_id, pawn_id) -> Result
FgNetWorld.destroy(object_id, reason) -> Result
FgNetDriver.submit_input(command) -> queued_or_rejected
FgNetEntity.mark_field_dirty(field_id)
FgNetEntity.on_net_state_applied(changed_field_mask, server_tick)
```

빌드 시 RPC ID·인자 타입·최대 길이·방향·신뢰성·권한 정책을 등록한다. 런타임 문자열 함수 이름 dispatch와 객체 자동 역직렬화를 사용하지 않는다. index 재사용 시 generation을 증가시키고 맵 이동 시 world_epoch를 바꿔 지연 패킷을 폐기한다.

## 6. RPC 방향·신뢰성 규약

| 종류 | 허용 발신 → 수신 | 사용 예 | 처리 정책 |
| --- | --- | --- | --- |
| Server command | 소유 클라이언트 → 서버 | 이동 입력, 상호작용 요청 | 소유권·시퀀스·속도·게임 조건 검증 |
| Owner Client | 서버 → 해당 소유 클라이언트 | 개인 오류, 비공개 UI | 다른 클라이언트에는 발송하지 않음 |
| Relevant Multicast | 서버 → 현재 관련 클라이언트 | 일회성 VFX·사운드 | 장기 상태나 아이템 지급을 맡기지 않음 |
| Durable state | 서버 → 구독 클라이언트 | 문 열림, 체력, 인벤토리 | NET-26 revision/ACK로 최종 상태 수렴 |

이동 입력은 중복분을 포함한 작은 unreliable ordered 패킷을 기본으로 검토한다. 채팅·거래처럼 reliable이 필요한 메시지는 별도 큐와 바이트 예산을 쓴다. 거래는 request_id로 중복 실행을 막고 결과 revision을 상태로 복구한다.

UE도 서로 다른 Actor RPC의 전역 순서나 개별 RepNotify의 호출 순서를 보장하지 않는다. 자체 규격도 reliable 순서를 명시한 스트림 안으로 한정하고 교차 객체 인과관계는 dependency_revision 또는 하나의 원자 명령으로 표현한다. [Epic RPC](https://dev.epicgames.com/documentation/en-us/unreal-engine/remote-procedure-calls-in-unreal-engine), [Execution Order](https://dev.epicgames.com/documentation/unreal-engine/replicated-object-execution-order-in-unreal-engine)

## 7. 연결·경기 수명

입장은 인증된 join ticket 검증 → build/protocol 일치 → PlayerController 생성 → PlayerState 생성 → 기존 공개 상태 전송 → Pawn possession → Ready 확인 순이다. 준비 전 입력은 버린다.

사망은 Pawn 수명만 끝내고 PlayerState·연결은 유지한다. 재접속은 인증된 동일 사용자와 예약 슬롯을 재결합하되 connection_id와 owner_epoch를 새로 발급한다. 다른 사용자의 옛 peer_id를 재사용해 권한을 이어받지 않는다.

맵 변경은 서버가 다음 콘텐츠 manifest와 world_epoch를 전달하고 클라이언트 준비를 확인한 뒤 전환한다. 1차는 재접속 기반 이동, 후속은 명시된 PlayerState만 이관하는 seamless-like 이동이다. 모든 Node를 자동 보존하는 기능은 별도 개발이다.

## 8. 작업분해와 공수

| 작업 ID | 작업 | PW | 산출물 |
| --- | --- | --- | --- |
| NET25-01 | 권한 모델·역할·API ADR 및 기존 프로젝트 스파이크 | 2-3 | ADR, 최소 규칙 샘플 |
| NET25-02 | NetWorld·객체 ID·스폰·서브오브젝트 수명 | 3-4 | 프레임워크 모듈 |
| NET25-03 | 소유권·RPC 레지스트리·안전 dispatch | 3-4 | 스키마 생성기, 정책 표 |
| NET25-04 | 입장·리스폰·재접속·맵 이동 1차 | 2-3 | 세션 상태 머신 |
| NET25-05 | GDScript 제작 API·에디터 역할 표시 | 2-3 | 샘플·API 안내 |
| NET25-06 | 다중 프로세스 회귀·오류 주입·배포 | 2-3 | 시험 스위트·검증 기록 |
| 합계 | 다른 계획서 공수 제외 | 14-20 | 기능 단위 인수 |

2명의 담당자가 병행해도 수명·RPC 계약 확정 전 관련 작업을 시작하지 않는다. 외부 인증 연동은 NET-29 완료까지 로컬 테스트 발급기로 대체한다.

## 9. 도입 단계

1. DS 1개와 독립 클라이언트 2개에서 입장·이동·스폰·체력·재접속을 구현한다.
2. NET-26 기본 상태 복제와 연결하고 late join/owner 변경/맵 이동을 고정한다.
3. NET-27 예측을 추가하고 정답 상태는 동일 서버 규칙으로 유지한다.
4. NET-29/30 실제 인증·검증과 묶어 배포한다. listen server는 별도 옵션으로 이후 추가한다.

## 10. 완료 기준과 재현 시험

| 시험 | 조건 | 목표 판정 |
| --- | --- | --- |
| 역할/소유권 | DS+2 clients, 타인 Pawn·Controller RPC 각 1,000회 | 권한 없는 변경 0건 |
| late join | 체력·문·인벤토리가 변경된 후 입장 | server revision과 모든 허용 상태 일치 |
| 유실/중복/역순 | RTT 0/50/150/300ms, 손실 0/1/5%, 중복·역순 각 1% | 중복 보상·아이템 지급 0건, 연결 복구 후 수렴 |
| 수명 | spawn/destroy 100,000회, ID 재사용·지연 패킷 주입 | 다른 세대 객체 오염 0건 |
| 재접속 | 강제 종료·네트워크 전환 100회 | 다른 플레이어 점유 0건, 동일 슬롯 정책대로 복원 |
| 맵 이동 | epoch 전환 100회, 이전 월드 패킷 재주입 | 옛 월드 상태 적용 0건 |

장치·OS·engine commit·build/protocol hash·seed·입력 로그를 저장한다. 지연 주입과 동기화 결과는 자동 비교하고 실제 입력/화면 동작은 2클라이언트 수동 QA를 추가한다.

## 11. 위험·대체 경로·중단 기준

NodePath와 자동 RPC에 의존한 기존 게임은 안정 ID·스키마로 이행하는 어댑터가 필요하다. 자동 변환이 애매한 소유권은 명시적 선언을 요구한다. 전체 Godot RPC API를 호환 재구현하는 작업은 범위 밖이다.

인증되지 않은 경로에서 상태 쓰기가 발견되거나 두 복제기의 동시 작성이 발생하면 외부 테스트 진입을 중단한다. 성능 문제는 권한 검사를 제거하는 방식으로 해결하지 않고 배치·스키마 캐시·객체 수명 비용부터 측정한다.

## 12. 제출 산출물과 출처

제출물은 API 명세, 역할/권한 표, serializer schema, 로컬 DS+2 clients 샘플, lifecycle 회귀 로그, 마이그레이션 가이드, 버전 호환 표이다. 공통 실행 조건은 [통합 계획](../00_Development_Roadmap.md)을 따른다.

공식 출처 확인일: 2026-11-24. 위 Epic 문서는 열람 중 5.8/5.9 표기가 혼재해 개념 설계 참고로 사용했으며 특정 UE minor의 바이너리 동작 동일성을 약속하지 않는다. Godot 문서의 stable 링크는 개발 착수 시 핀한 버전 페이지와 소스에 다시 대조한다.
