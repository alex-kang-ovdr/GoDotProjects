# 07 · 멀티플레이·Listen·PIE·초기 준비 장벽

**검토 기준일:** 2026-11-17 · **상태:** 설계·공식 문서 검토, Godot 런타임 실증 미실시

## 자체 네트워크 계약은 엔진 바깥에 유지 가능

Godot SceneMultiplayer는 RPC/Scene 복제를 제공하지만 프로토콜을 내부 구현으로 문서화한다. 비-Godot 서버용 영구 규약으로 사용하지 않는다. MultiplayerSynchronizer에는 Object/Resource·프로세스별 instance ID·RID 복제 제한도 있다. [G30](../references/Verified_Sources.md#g30)[G31](../references/Verified_Sources.md#g31)

두 경로를 비교하되 제품에서는 동일 상태에 하나만 선택한다.

| 경로 | 용도 | 주의 |
|---|---|---|
| Godot 고수준 복제 | 빠른 PoC·Godot-only 결과 검증 | 버전 고정, 별도 Ready Barrier, 향후 교체 비용 |
| PF Replication Bridge | 안정 Net ID·양자화·baseline·AOI 계약 | 직접 구현량 큼, Godot에 자동 존재하지 않음 |

Iris 소스를 이식한다는 의미가 아니라 독립적인 상태 수집·필터·양자화 설계를 구현하는 것이다. Godot는 해당 상태를 적용할 객체·표현 기반으로 사용한다.

## Listen Server 정의 보존

```text
Host Process
└── Authority Runtime / World 하나
    ├── Local Host Player + Input
    ├── Game Lua / Physics
    ├── Host Render / Audio
    └── Remote Replication → 원격 클라이언트
```

호스트에 별도 Client World나 Loopback 연결을 만들지 않는다. 입력은 서버 공통 Command 검증으로 바로 들어간다. Host UI는 상태 변경 이벤트를 사용하고 `OnRep` 실행을 기대하지 않는다. 로컬 호스트가 Native SDK 인증 인터페이스를 사용하더라도 게임 World를 일반 클라이언트로 바꾸지 않는다.

## PIE 실행과 스냅샷

Editor World와 PIE 상태는 분리한다. Dedicated PIE는 서버 1개+클라이언트 2개, Listen PIE 3인 구성은 Host 1개+Remote 2개이다. 탭은 표시 방식이지 백그라운드 정확한 tick을 보장하는 실행 격리가 아니다. 실제 부하 검증은 별도 실행 환경으로 수행한다.

브라우저 원격 클라이언트는 WebSocket/WebRTC 같은 지원 경로가 필요하다. 네이티브 UDP/ENet 패킷을 브라우저에서 그대로 보내는 것을 가정하지 않는다. 순서 보장 전송의 메시지를 일부 버리는 것이 실제 UDP 손실 환경과 같다고 표시하지 않는다. [G06](../references/Verified_Sources.md#g06)

## Initial Play Barrier

필수 집합에는 Object ID+Generation, required state revision, required reference, Collision Cell ID+content hash를 기록한다. 객체 개수나 마지막 패킷 수신만으로 완료 판단하지 않는다.

```text
Connect / Auth / Contract Hash 확인
→ Required Snapshot + Cell Set
→ Object 생성 + 상태 적용 + 참조 해결
→ Collision 등록 / Query Ready
→ AppliedReady(Epoch, SnapshotId, Digest)
→ Server StartPlay 승인
→ 입력·예측·게임 규칙 활성화
```

수신 중 새 delta는 생성 상태와 순서를 보존해 적용한다. 삭제된 필수 객체는 해당 generation의 tombstone 적용으로 완료 처리한다. 버퍼 크기와 최대 대기시간을 제한하며 오버플로는 재동기화한다. 연결만 성립했다고 입력을 허용하지 않는다.

Client의 Ready 보고는 **동기화 진행 신호이지 클라이언트 무결성 증명은 아니다.** 서버 게임플레이 검증과 anti-cheat 정책을 대체하지 않는다.

## 안전한 장거리 Teleport

서버는 목적지와 주변 충돌 영역을 pin한 뒤 실제 Shape의 overlap/sweep·바닥·머리 공간을 검사한다. 등록 callback이나 `_ready()`를 Physics Query 완료로 보지 않는다. 목적지 준비 상태를 검사하는 안전 시점과 Commit 사이에 unload가 발생하지 않게 한다.

| 단계 | 서버 | 클라이언트 |
|---|---|---|
| Prepare | 목적지 pin, collision, 초기 관심 상태 전송 | 해당 로컬 Cell과 필수 복제 적용 |
| Ready | epoch·입력 자격 검사 | 준비 ACK, 이전 입력 중지 |
| Commit | 안전 위치 재검사, 새 위치·teleport epoch 확정 | Commit 상태 적용, 예측 이력 초기화 |
| Resume | 새 입력 epoch 허용 | 승인 후 입력·예측 재개 |

이 과정에서 Texture 고해상도 mip은 대기 조건이 아니다. 네트워크가 지연되면 기존 위치 유지·입력 잠금·명시적 타임아웃을 사용하고, 충돌을 꺼서 먼저 목적지로 보내는 우회는 금지한다.

## EOS 등 외부 서비스

EOS Voice/Auth/Session/EAC 요구는 별도 Provider로 유지한다. Godot 채택만으로 SDK의 브라우저·모바일·UGC 재배포 지원이 생기지 않는다. 공급자별 승인과 Native SDK 빌드를 별도 통과 조건으로 둔다. Matchmaker/Join Token은 플랫폼의 서버측 서비스이며 게임 Lua에 자격증명을 주지 않는다.

## Headless와 Room 격리

Dedicated는 headless Export Template을 사용하고 서버용 시각 리소스를 제거한다. 단순히 창만 끄고 Client 패키지를 그대로 올리는 것과는 다르다. [G32](../references/Verified_Sources.md#g32)

P0 제안은 Room/신뢰경계별 프로세스다. 같은 Release의 다중 Room은 이후 성능·오염·장애 테스트를 통과한 경우만 허용한다. 하나의 GodotInstance/SceneTree에서 World별로 모든 전역 상태와 scheduling이 분리된다고 보장하지 않는다. [G22](../references/Verified_Sources.md#g22)[G20](../references/Verified_Sources.md#g20)
