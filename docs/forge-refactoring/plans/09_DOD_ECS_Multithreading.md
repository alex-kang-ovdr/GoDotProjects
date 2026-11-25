# 09. 데이터 지향 연산·ECS·멀티스레딩 개발 계획

## 1. 계획 요약

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | IMP-09 / 2026-11-24 |
| 원문 대응 | PDF 3쪽 대규모 연산, 7-9쪽 멀티스레딩 감사·국소 ECS 적용 |
| 우선순위 | P1. 병목 계측과 스레드 안전성 점검은 P0에서 착수 |
| 구현 위치 | 게임 독립 GDExtension, 편집기 어댑터, 제한된 코어 계측 패치 |
| 선행 과제 | 13 프로파일링, 16 재현 가능한 빌드, 25 서버 권한 계약 |
| 담당 | 런타임 엔지니어 1명, 성능 엔지니어 1명, QA 부분 투입 |
| 예상 공수 | 18-30 PW. 1 PW는 숙련 담당자 1명의 5근무일이며 일정 보장이 아니다 |
| 구현 상태 | 개발 계획. 코드 구현·부하 측정은 수행하지 않음 |

## 2. 목표와 범위

프로파일링에서 비용이 확인된 군집 이동, 탄막, 대군 AI 등의 연속 데이터 연산을 SceneTree와 분리한다. 게임 규칙·UI·복잡한 캐릭터 조립은 기존 GDScript와 Node를 유지한다. 목표는 엔진 전체를 ECS로 전환하는 것이 아니라 반복 비용이 큰 루프에 예측 가능한 CPU·메모리 예산을 제공하는 것이다.

1차 범위는 구조화 배열(SoA), 엔티티 수명 관리, 고정 틱 작업 그래프, 메인 스레드 반영 큐, MultiMesh/RenderingServer 어댑터다. Flecs 도입은 자체 SoA 구현과의 측정 비교 후 결정한다. 물리 솔버 병렬화와 네트워크 전송 병렬화는 각각 [12](12_Physics_Step_Snapshot_Stability.md), [26](26_Iris_Style_Replication.md)에서 소유한다.

## 3. 확인한 사실과 설계 가정

- Godot는 활성 SceneTree 접근 전체를 스레드 안전하게 보장하지 않는다. 서버 API도 렌더링·물리 관련 설정과 동기화 조건을 확인해야 한다. 따라서 “모든 Node를 작업 스레드에서 실행”하는 접근은 제외한다. [공식 스레드 안전성 문서](https://docs.godotengine.org/en/stable/tutorials/performance/thread_safe_apis.html)
- 저수준 서버는 RID를 통해 씬 계층을 우회할 수 있지만 RID 참조만으로 Resource의 생존이 유지되는 것은 아니다. 수명 소유자를 별도로 둔다. [공식 Servers 문서](https://docs.godotengine.org/en/stable/tutorials/performance/using_servers.html)
- 이하 모듈·API·수치·공수는 자체 제안이다. PDF의 특정 엔진 대비 성능 우위와 cross-CPU 결정론 서술은 구현 전제로 사용하지 않는다.

## 4. 아키텍처

| 모듈 | 책임 | 경계 |
|---|---|---|
| SimulationStore | 위치·속도·수명·태그 배열, 안정적 entity ID | Node·Resource 포인터를 직접 보관하지 않음 |
| SystemRegistry | read/write 집합과 실행 순서 선언 | 쓰기 충돌이 있는 시스템은 동시 실행 금지 |
| JobScheduler | 고정 크기 청크 분배, 작업 배리어, 시간 계측 | SceneTree 변경 및 GPU 동기 조회 금지 |
| CommandJournal | spawn/despawn/태그 변경을 틱 경계에 반영 | 실행 중 배열 재배치 금지 |
| PresentationBridge | 결과 버퍼를 Node/MultiMesh에 반영 | 렌더링 보간과 authoritative 상태를 분리 |
| InspectorAdapter | 선택 객체 조회, entity-node 연결 | 상세 조회는 샘플링·온디맨드 처리 |

한 틱은 입력 고정 → 읽기 스냅샷 게시 → 독립 작업 실행 → 배리어 → 결정된 순서로 명령 병합 → authoritative 상태 확정 → 표시 버퍼 게시 순서다. 네트워크 복제는 확정된 상태만 읽으며, 작업 스레드 중간값을 전송하지 않는다.

작업 순서가 필요한 축적 연산은 안정적인 entity ID 순서 또는 명시한 트리 리덕션을 사용한다. 부동소수점 결과를 CPU·컴파일러 간 동일하다고 보장하지 않는다. 재현 요구가 높은 게임 규칙은 정수·고정소수점 구간을 별도 정의한다.

## 5. 제안 API·데이터 계약

아래는 신규 확장 계층의 설계 의사코드이며 현재 Godot API가 아니다.

```text
EntityId = { index: u32, generation: u32 }
WorldKey = { project_id, build_id, session_id }
SystemSpec = { id, reads[], writes[], before[], after[], chunk_size }
TickInput = { tick: u64, dt_num: u32, dt_den: u32, commands[] }
TickOutput = { tick, state_hash, changed_entities[], event_journal[] }

SimWorld.create_entity(archetype_id, initial_values) -> EntityId
SimWorld.enqueue(command, target_tick) -> CommandId
SimWorld.step(TickInput) -> TickOutput
SimWorld.copy_presentation_batch(first, count) -> PackedBatch
```

generation 검사는 해제된 entity ID의 재사용 오참조를 막는다. GPU RID·Node instance ID는 프로세스 로컬 매핑으로만 사용한다. 네트워크 ID는 [26](26_Iris_Style_Replication.md)의 별도 계약에 매핑한다. 여러 프로젝트의 ECS 데이터와 스키마는 공유하지 않고 실행 라이브러리만 재사용한다.

## 6. 작업분해와 공수

| 작업 ID | 구현 작업 | PW | 검토 가능한 산출물 |
|---|---|---:|---|
| DOD-01 | 1천/1만/5만 객체 벤치마크, 스레드 접근 감사 | 2-3 | 기준 trace, API 안전성 목록 |
| DOD-02 | SoA·entity generation·명령 저널 구현 | 3-5 | 코어 라이브러리와 수명 테스트 |
| DOD-03 | 시스템 read/write 선언·스케줄러·배리어 | 4-7 | race 검출 기록, task graph |
| DOD-04 | Node/MultiMesh/서버 출력 어댑터 | 3-5 | 표시·선택·디버그 연동 |
| DOD-05 | Flecs 대안 실험·직렬화·게임별 마이그레이션 | 3-5 | 비교 ADR, 교체 가능한 어댑터 |
| DOD-06 | 플랫폼 부하·장시간·업그레이드 회귀 | 3-5 | 성능 보고서, 릴리즈 패키지 |
| 합계 | 핵심 루프 한 종류의 제품화 기준 | **18-30** | 추가 장르 시스템은 별도 산정 |

## 7. 도입 순서와 게이트

G0에서는 기존 Node 구현의 프레임 시간 분해를 확보한다. 최적화 대상이 전체 CPU 시간의 15% 미만이면 전환을 보류하고 더 큰 병목을 먼저 해결한다. 이 임계값은 계획용 우선순위 기준이다.

G1에서는 단일 스레드 SoA로 데이터·결과 동등성을 확보한다. G2에서 멀티스레딩을 켜며, G3에서만 Flecs와 비교한다. 여러 구조를 동시에 바꾸지 않아 어느 변경이 효과를 냈는지 구분한다.

G4에서는 Windows·Linux 서버·Android ARM64·iOS에서 지원 조합을 고정한다. Web 싱글스레드 프로파일은 별도 스케줄러를 사용한다. 모든 플랫폼에서 스레드 수를 CPU 논리 코어 수에 그대로 맞추지 않고, 렌더·오디오·물리 스레드의 예산을 남긴다.

## 8. 완료 기준과 검증 방법

| 시험 | 조건 | 계획용 통과 기준 |
|---|---|---|
| 기능 동등성 | 같은 seed·입력, 10만 틱, 단일 스레드 기준 구현과 비교 | 게임 규칙 결과 일치, 허용 오차는 필드별 명세 |
| 수명 안정성 | 100만 회 spawn/despawn·ID 재사용 | stale ID 접근 거절, 해제 후 접근 0건 |
| 병렬 안전성 | 지원되는 빌드에서 sanitizer, 1/2/4/8 worker 비교 | race·deadlock 0건, 누락 명령 0건 |
| 성능 | 60초 warmup, 10분 측정, 5회 반복 | 선택 루프 p95 30% 이상 감소, 전체 프레임 p95 악화 5% 이내 |
| 메모리 | 1시간 spawn/despawn 순환 | 정상화 후 지속 증가 추세 없음, 예산 초과 시 전환 보류 |
| 서버 | 동일 게임 로직을 렌더 없는 Linux에서 실행 | 표시 기능 제거로 시뮬레이션 결과가 바뀌지 않음 |

장치·OS·GPU·드라이버·엔진 commit·컴파일 옵션·전력 상태·객체 구성·seed를 함께 기록한다. p50/p95/p99와 평균을 모두 남기며 작은 객체 수에서의 퇴행도 보고한다. 위 목표는 아직 측정된 수치가 아니다.

## 9. 위험·대체 경로·중단 기준

Node↔ECS 왕복 변환이 이득을 상쇄하면 변환 주기와 경계를 줄이고, 그래도 효과가 없으면 해당 시스템을 Node에 유지한다. 높은 churn으로 archetype 이동 비용이 커지면 sparse set/SoA를 유지한다. Resource·SceneTree를 여러 스레드에서 직접 수정해야만 작동하는 설계는 채택하지 않는다.

스레드 모델 변경으로 renderer나 physics의 회귀가 생기면 계산 작업만 병렬로 유지하고 서버 호출은 기존 스레드에 모은다. 전체 SceneTree의 멀티스레딩 재작성은 본 공수에 포함하지 않는다.

## 10. 제출 산출물·운영

- GDExtension 소스, 지원 플랫폼 바이너리, 스키마 및 버전 마이그레이션 가이드.
- 대표 벤치마크 프로젝트 3개와 입력 replay, 결과 비교기, thread-safety 감사표.
- 게임별 전환 목록, 기능 플래그, 기존 경로로 되돌리는 절차, 월별 성능 기준선.

## 11. 출처와 확인 범위

2026-11-24 열람: [Godot Thread-safe APIs](https://docs.godotengine.org/en/stable/tutorials/performance/thread_safe_apis.html), [Optimization using Servers](https://docs.godotengine.org/en/stable/tutorials/performance/using_servers.html), [Using multiple threads](https://docs.godotengine.org/en/stable/tutorials/performance/using_multiple_threads.html). 이 문서의 설계는 공식 문서의 안전성 경계를 토대로 제안했으며 엔진 소스 감사·실기기 성능 시험은 착수 작업으로 남겨 두었다.
