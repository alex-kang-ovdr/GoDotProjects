# 03. 연결·기구 복원과 시스템 고도화

> 조사 기준: 2026-11-18, Steam PC의 공개 개발 자료. 이 문서는 **원작에서 문서로 확인한 규칙**, **설치본에서 확인할 가설**, **IRONWOOD 후속 설계안**을 구분한다. 원작 실행 파일을 추출하거나 원작 기체를 계측한 결과가 아니다. 출처 ID는 `research/physics_sources.json`, 실행 전 실험은 `data/experiments.json`과 연결된다.

## 1. 복원 방향의 핵심 수정

현재 IRONWOOD 4.0은 정수 격자 부품, 인접 연결, 단일 코어 도달성으로 동작하는 독립 구현이다. 원작에 가까운 조립 경험을 만들려면 부품 수를 늘리기 전에 **접속점, 가동측, 두 끝점 연결, 신호 수신 범위**를 독립적으로 표현해야 한다. 현행 코드의 `dist/parts.js::getConnections/validateDesign`, `dist/physics.js::_canControl`를 비교 대상으로 삼았다. 원작 내부 클래스와 필드가 확인됐다는 뜻은 아니다.

| 항목 | 확인 또는 미확정 범위 | 후속 기획 결정 |
|---|---|---|
| Starting Block | V1.75는 적어도 하나를 남기는 조건의 삭제와 부분 저장 보충을 설명한다. 정확히 하나·전역 HP 패배 규칙은 이 자료로 확인되지 않는다. | `referenceBlock`과 `missionVitalPart`를 분리하고 단일 코어 정책을 규칙 프리셋으로 둔다. |
| 접속 후보 | V1.26의 2차 연결 시간창과 Surface 대상 수정은 인접 격자만으로 설명되지 않는다. | 포트 후보·대상 결정·확정 시점을 데이터로 분리한다. |
| Brace | V1.25에 클릭 배치 옵션이 있다. 원작은 두 점으로 만드는 보강 도구로 분석하지만 세부 앵커 규칙은 계측한다. | 기존 한 칸 강철 보강과 별개 `brace_link`를 설계한다. |
| Axle | 두 축 굽힘을 허용하고 자체 축의 자유 비틀림을 제한해 회전 동력을 전달한다. | Ball Joint와 다른 자유도·토크 전달 계약을 둔다. |
| Piston | 부품 존재·설정 관련 변경은 확인되지만 실제 모터식·힘 상한·중립 상태는 공개 자료로 미확정이다. | 현행 120N 유한 힘 모터를 독립 모델로 유지하고 원작값 칸은 비워 둔다. |

근거: [PHY-001 V1.25](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements), [PHY-002 V1.26](https://store.steampowered.com/news/posts/?appids=346010&enddate=1715361118&feed=steam_community_announcements), [PHY-004 V1.75](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1772123201&feed=steam_community_announcements).

### 코어 분리 규칙의 처리

IRONWOOD의 코어는 승패·조작 가능 여부·관문 통과 위치의 기준이다. 이는 간결한 게임 규칙으로 유효하지만 원작 Starting Block의 기능 복원값은 아니다. 원작의 분리된 대포·바퀴가 입력을 받는지, Starting Block 파괴가 어떤 임무를 실패시키는지는 EXP-006/007로 확인한다. 확인 전에는 양쪽 어느 결과도 확정하지 않는다.

후속 저장 모델은 `controlScope: machine | component | explicitBus`, `requiredConnectedRoot: null | blockId`를 구분할 수 있게 설계한다. 기존 V4 설계는 `component + core` 정책을 유지하며, 사용자가 새 규칙을 선택하기 전 자동으로 달라지지 않는다. 이 정책들은 재구성 제안이다.

## 2. 네 가지 관계를 독립적으로 보존한다

| 관계 | 질문 | 후속 데이터 | 대표 오류 |
|---|---|---|---|
| 시각 외형 | 화면에서 무엇이 닿는가? | mesh/selection proxy | 장식 외형을 부착 영역으로 사용 |
| 접촉 | 무엇과 충돌하고 반발하는가? | collision shapes/filter pairs | 가동부 주변을 통째로 충돌 제외 |
| 구조 연결 | 어떤 자유도를 유지하는가? | joint/anchors/axes | 회전 관절을 고정 링크로 우회 |
| 기능 연결 | 누가 입력·연료를 공유하는가? | control/fuel networks | 구조 BFS로 모든 기능망을 대체 |

Colliderscope 제작자는 외형·충돌체·연결 트리거 차이를 관측했고, 복수 후보의 X+·배치 순서 경향과 일부 예외를 설명했다. 같은 설명에서 강성 차이의 완전한 규칙은 모른다고 밝혔다. 이 관측은 **도구 제작자 기록**이며 현행 공식 명세가 아니다. X+ 우선은 원작 엔진을 흉내 내기 위한 기본값으로 바로 넣지 않는다. [PHY-013 도구 제작자 설명](https://steamcommunity.com/sharedfiles/filedetails/?id=1865492589)

## 3. 연결 데이터 계약 — 독립 설계안

```json
{
  "id": "connection-0001",
  "kind": "hinge",
  "a": {"blockId": "frame-1", "portId": "mount", "localAnchor": [0, 0, 0]},
  "b": {"blockId": "arm-1", "portId": "moving", "localAnchor": [0, -0.5, 0]},
  "axisA": [0, 1, 0],
  "axisB": [0, 1, 0],
  "origin": "placement",
  "collisionPolicy": "disable_direct_pair",
  "driveProfileId": "iw_hinge_v4",
  "breakProfileId": "iw_hinge_v4",
  "evidence": "independent_design"
}
```

예시 좌표·ID·설정은 원작 추출물이 아니다. `ConnectionSpec`은 편집기에서 직렬화하고, 물리 제약 객체는 실행 시 생성한다. 런타임 오브젝트 주소를 저장하지 않는다. `portId`의 고정측/가동측은 메시의 부모 자식 계층과 독립적이다.

접속 후보를 정렬하는 새 알고리즘은 `사용자가 지정한 대상 → 포트 호환성 → 거리 → 안정 ID`처럼 결정적으로 정의할 수 있다. 이 순서를 원작 순서라고 표시하지 않는다. 저장/로드로 대상이 바뀌면 원작과 무관하게 독립 구현의 결함이다.

## 4. 부품별 자유도와 반력 경로

아래는 **구현을 위한 물리 해석**이다. 실제 Besiege 엔진의 Joint 타입과 일대일 대응한다고 가정하지 않는다.

| 부품 계열 | 허용 운동의 설계 모델 | 구동/수동 | 필요한 상태 | 원작 미확정 항목 |
|---|---|---|---|---|
| 고정 구조 | 상대 위치·회전 유지 | 수동 | intact/broken | 강성·감쇠·파단 기준 |
| Hinge | 한 축 회전 | 수동 | angle/angularVelocity | 축·마찰·충돌 제외 |
| Steering Hinge/Block | 한 축 목표 각도 | 구동 | target/current/limits | 속도·토크·복귀 조건 |
| Ball Joint | 앵커 일치, 다축 회전 | 수동 | local frame | 축별 제한·저항 |
| Axle | 두 축 굽힘과 비틀림 전달 | 수동 전달 | shaft phase | 실제 각 한계·파단 |
| Slider | 축 병진 | 수동 | extension/ends | 끝단·초기확장 연결 |
| Piston | 축 병진과 구동 | 구동 | target/current/drive | 중립·힘 제한·모터 법칙 |
| Suspension | 축 병진과 탄성·감쇠 | 수동 | compression/rate | 비선형성·바닥치기 |
| Spring | 두 끝점 거리 반응 | 수동/수축 입력 | rest/current length | 압축 반응·입력 의미 |
| Rope/Winch | 두 끝점 길이와 권상 | 수동/구동 | slack/tension/length | 중간 충돌·감김 |
| Grabber | 접촉 시 동적 연결 | 조건부 | idle/armed/attached | 대상 선택·재부착 |
| Decoupler | 기존 접속 해제 | 사건 | attached/released | 다른 연결 경로 영향 |

V1.25의 Suspension damper, Grabber flexible, Slider 사전 확장과 V1.26의 Grabber 분리 키·조향 tension·Spinning Block free-spin은 **설정 존재가 확인된 역사적 사실**이다. 정확한 수치와 반응 곡선은 데이터 복원 실험으로 채운다. [PHY-001](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements), [PHY-002](https://store.steampowered.com/news/posts/?appids=346010&enddate=1715361118&feed=steam_community_announcements)

## 5. 두 끝점 도구의 편집 UX

**제안 흐름:** 첫 점 선택 → 두 번째 점 미리보기 → 접속 대상·길이·충돌 표시 → 확정. 취소하면 첫 점과 임시 객체를 함께 제거한다. Hover는 후보를 보여 주고, 확정 시 대상 blockId와 로컬 앵커를 저장한다.

한쪽 끝이 삭제되었을 때의 정책은 도구별로 정한다. Brace는 결손 링크로 표시하고 출격 전에 수정하도록 할 수 있다. Rope는 남은 끝이 매달린 런타임 상태를 지원할 수 있지만, 편집 저장의 고아 참조를 자동 허용하지 않는다. 실제 원작 정책은 EXP-004/015/016에서 확인한다.

복제 시 내부 링크 양 끝은 새 ID로 재매핑한다. 선택 바깥을 가리키는 끝점은 사용자에게 미결 상태를 보여 주거나 외부 연결 유지 옵션으로 처리한다. 보이지 않는 원본 참조를 남기지 않는다. Mirror는 위치뿐 아니라 축·앵커·각도 부호·구동 방향을 함께 변환한다.

**수용 조건:** 동일 묶음의 복사→Undo→Redo에서 ID 중복과 고아 링크가 없어야 한다. 하나라도 경계·충돌·포트 불일치가 있으면 전체 조작을 취소한다. V4 그룹 편집의 원자성을 새 링크 편집에도 유지한다.

## 6. 피스톤을 고도화할 때 보존할 것

현재 V4의 유한 힘 피스톤은 목표 행정, 실제 행정, 구동력 상한, 가이드, 끝단을 구분한다. 이 구조는 독립 구현의 출발점으로 유지한다. 원작의 숫자를 추측해 덮어쓰기보다 다음을 추가한다.

1. 지지 포트와 가동 헤드 포트를 명시한다.
2. 출력이 바꾸는 항목을 `maximum_force`, `target_speed`, `holding_mode`로 구분한다.
3. 같은 중립 입력도 hold/free/return 모드를 프로필로 선택할 수 있게 한다.
4. 목표와 실제의 차이, 힘 포화, 가이드 반력을 별도로 표시한다.
5. actuator power lost와 guide broken을 다른 사건으로 기록한다.
6. 가이드가 살아 있을 때의 끝단과 가이드 파손 뒤의 운동을 독립 검증한다.

독립 구현의 단순 서보 후보는 `F = clamp(kp × positionError − kd × relativeVelocity, −Fmax, Fmax)`다. 이 식은 일반적인 제어 설계 예시이며 원작 수식이 아니다. 엔진이 충격량 한계를 받으면 `Jmax = Fmax × dt`로 변환해야 한다. 실제 엔진의 API 계약을 확인한 뒤 적용한다. 원작 비교용으로는 EXP-008~011의 시계열과 정지 하중을 우선 사용한다.

## 7. 파손·진단·성능의 결합

단순 하중비 색만으로 파손 이유를 확정하지 않는다. 보고서에는 `connection_created`, `drive_saturated`, `contact_impulse`, `connection_broken`, `part_destroyed`를 구분하고 첫 사건을 고정한다. V1.65의 응력 도구와 V1.73의 충돌·파손 표시는 원작의 진단 방향을 확인하는 근거다. [PHY-003](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1734029661&feed=steam_community_announcements), [PHY-009](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1750957475&feed=steam_community_announcements)

고정 부품 병합 최적화는 연결 의미를 확정한 뒤 시행한다. `blockId`와 선택/HP를 유지한 채 물리 그룹만 합쳐야 한다. 파손 시 운동량·앵커·충돌 필터를 다시 분배할 수 없다면 병합을 미룬다. 모든 기체 내부 접촉을 꺼 버리는 최적화는 기어·지렛대·충각을 손상시킬 수 있으므로 직접 연결 쌍부터 정책을 관리한다.

## 8. 구현 순서와 완료 기준

| 단계 | 작업 | 완료 기준 |
|---|---|---|
| P0-A | 규칙 프로필과 원작/독립 데이터 분리 | V4 원본 설계의 기존 거동 유지, 미확정 원작 숫자 사용 금지 |
| P0-B | 포트·앵커·명시적 연결 스키마 | 저장/로드/복제/대칭 후 동일 연결과 자유도 |
| P0-C | Brace 두 끝점 편집 | 단일 취소·Undo 원자성, 가동부 우회 경고 |
| P1-A | Slider·Suspension·수동 Hinge | 무동력 대조군·과적·횡하중 fixture 통과 |
| P1-B | Grabber·Decoupler | 런타임 연결 생성/해제 및 신호 도달성 분리 |
| P1-C | Rope·Winch | slack/tension/길이 제한을 계측과 비교 |

원작 측정은 EXP-001~019·038~039를 사용한다. 독립 구현의 자동 테스트 통과는 원작 규칙의 확정 증거가 아니다.
