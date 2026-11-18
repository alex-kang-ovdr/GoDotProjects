# 06. IRONWOOD V4 소스 감사와 원작 재구성 차이

> 감사일: 2026-11-18 (한국 날짜 기준). 대상: `IRONWOOD 4.0.0`, commit `af19c56113079416b4763ce2c0d4d2148ee1592f`.
> **이 문서는 현재 JavaScript 소스에서 확인한 구현 사실과 이후 변경 제안을 구분한다. Besiege 실행 파일의 내부 테이블을 추출한 결과가 아니다.**

## 1. 판정과 읽는 방법

V4는 제작·출격·주행·항해·비행·기계 작동·목표 판정·파손 관찰·재설계를 연결한 독립 게임이다. 현재 작동을 원작의 정확한 파트 규칙으로 간주하면 설계가 어긋나는 지점이 있다. 특히 동일한 이름의 부품이라도 힘을 만드는 원인과 연결 구조가 다를 수 있다.

이번 개선 기획은 기존 플레이를 보존하면서 **부품별 힘의 원인, 연결 프레임, 입력의 시간 의미, 자원과 제어권, 임무 실패 규칙**을 분리하는 데 우선순위를 둔다. 부품 종류를 늘리는 작업은 이 계약 뒤에 배치한다.

- 코드 사실: 본문의 `dist/...::symbol`은 위 commit 기준이다. 패키지의 실제 숫자는 [현재 구현 스냅샷](../data/ironwood_v4_snapshot.json)에 있다.
- 원작 사실: [원작 부품·매개변수](02_ORIGINAL_PARTS_AND_PARAMETERS.md)와 [연결·기구](03_CONNECTIONS_AND_MECHANISMS.md), [육상·공중·수중](04_GROUND_AIR_WATER.md), [무기·손상·자동화](05_WEAPONS_DAMAGE_AUTOMATION.md)의 출처를 따로 확인한다.
- 개선 제안: 아래 GAP, TASK의 `status`는 모두 `planned`다. 원작 코드·데이터 구조를 복원했다고 표시하지 않는다.
- 재현 범위: export된 순수 생성 함수에서 부품·기본 설계·임무 레이아웃을 추출했다. 이번 감사에서 새 물리 실행·브라우저 GPU·실기기 검증은 수행하지 않았다.

## 2. 현재 수치의 출처를 고정

다음 값은 **IRONWOOD 자체 튜닝 데이터**다. 원작 수치표에 복사해서는 안 된다. 질량 단위 kg와 공간 단위 m도 현재 웹 구현의 단위 선택이다.

| 부품 ID | UI 이름 | 질량 kg | 자재 | HP | 구현 근거 |
|---|---|---:|---:|---:|---|
| `core` | 중심 코어 | 3 | 5 | 100 | `dist/parts.js::PARTS.core` |
| `wood` | 목재 블록 | 1 | 1 | 55 | `dist/parts.js::PARTS.wood` |
| `wheel` | 구동 바퀴 | 1.4 | 3 | 50 | `dist/parts.js::PARTS.wheel` |
| `cannon` | 대포 | 3 | 5 | 75 | `dist/parts.js::PARTS.cannon` |
| `brace` | 강철 보강 | 1.3 | 2 | 110 | `dist/parts.js::PARTS.brace` |
| `hinge` | 회전 관절 | 1.5 | 3 | 65 | `dist/parts.js::PARTS.hinge` |
| `float` | 부유체 | 0.7 | 3 | 65 | `dist/parts.js::PARTS.float` |
| `propeller` | 추진 프로펠러 | 1.5 | 5 | 55 | `dist/parts.js::PARTS.propeller` |
| `wing` | 양력 날개 | 0.6 | 3 | 45 | `dist/parts.js::PARTS.wing` |
| `piston` | 선형 피스톤 | 1.8 | 4 | 70 | `dist/parts.js::PARTS.piston` |

| 공통 설정 | 현재 값 | 해석 |
|---|---|---|
| 물리 고정 스텝 | 1/120초 | 원작 fixed timestep으로 추정하지 않음 |
| 프레임당 최대 substep | 12 | 늦은 프레임의 시간 누적을 무제한 처리하지 않음 |
| 제작 한도 | 100부품, X/Z ±12, Y 0~10 | 웹 구현 편집 규칙 |
| 출력 배율 | 0.3~2.0 | 여러 파트가 서로 다른 의미로 사용 |
| 피스톤 힘 / 목표 속도 | 출력 1에서 120N / 0.8m/s | 유한 힘의 독립 액추에이터 모델 |
| 피스톤 행정 | 0.25~2m, 기본 1.5m | 원작 행정 설정의 복원값이 아님 |
| 단일 float 부력 | 최대 35N × 침수율 | 살아 있는 float에만 적용 |
| 직접 추진기 | 물 없는 임무 80N, 물 있는 임무 55N × 출력·입력 | 실제 수중 잠김에 따른 선택이 아님 |
| 대포 재장전 | 모든 대포가 공유하는 0.65초 | 부품별 무기 상태가 아님 |
| 저장과 보고서 | 8칸 설계 / 70개 편집 이력 / 최대 12Hz 표본 / 최근 100사건 | 서로 다른 수명주기와 범위 |

소스: `dist/parts.js::{BUILD_BOUNDS,POWER_LIMITS,STROKE_LIMITS}`, `dist/physics.js::{STEP,MAX_STEPS,RELOAD_TIME,Simulation._applyFluidForces}`, `dist/main.js::{remember,captureReport}`, `dist/designs.js::DESIGN_SLOT_LIMIT`, `dist/report.js::{REPORT_SAMPLE_PERIOD,REPORT_EVENT_LIMIT}`. 원본 파일 12개의 SHA-256도 스냅샷에 남겨 이후 변경과 구분한다.

## 3. 기존에 잘 작동하는 계약

기능 확장 중 아래 성질을 회귀시키지 않는다.

1. 배치·묶음 변형은 전체가 유효할 때만 반영된다. 실패한 변형은 원본을 보존한다.
2. 시험은 설계 복사본을 사용한다. 파손된 실행 상태가 편집 원본에 덮어써지지 않는다.
3. 부품 HP와 연결 health/파단은 서로 다른 상태다. HP 0 부품도 충돌 파편으로 남을 수 있다.
4. 결과는 한 번만 결정되고 동일 step의 실패가 성공보다 우선한다.
5. 모달·일시정지·설계 교체·이전 결과 지연 콜백의 세션 소유권을 관리한다.
6. 저장 설계의 질량과 자재는 가져온 임의 값이 아니라 승인된 카탈로그에서 계산한다.
7. 기존 V1 설계와 피스톤 `stroke` 생략을 허용하는 호환 경로가 있다.

근거: `dist/editor.js::{planPlacement,planGroupTransform,normalizeBlueprint}`, `dist/main.js::{startSimulation,resetSimulation,settleOutcome,loadDesign}`, `dist/physics.js::{_damagePart,_afterStep,_checkTerminal,_finish}`, `dist/parts.js::getDesignStats`.

## 4. 높은 우선순위의 의미 차이

### 4.1 추진기 이름과 힘의 원인

현재 `propeller`는 연결된 동안 입력을 직접 추력으로 바꾸는 독립 엔진이다. 날개처럼 외부 회전·상대 유동에 반응하는 블레이드와 힘 생성 경로가 다르다. 후속 재구성에서는 기존 타입을 보존하고 능동 추력원과 수동 블레이드를 따로 제공한다. 원작 Propeller/Flying Block/Aquatic Screw의 구분은 원작 조사표에 연결한다.

현재의 80N/55N 선택은 수면이 존재하는 **임무인지**에 따른다. 물 위로 완전히 나온 추진기도 harbor에서는 55N 계수를 사용한다. 국소 매질을 도입할 때는 각 부품의 잠김·상대 유속으로 계산하고 기존 V4 프로필만 과거 계산을 유지해야 한다.

### 4.2 보강 블록과 끝점 보강

현재 `brace`는 한 칸 크기의 구조 블록이다. 두 끝점을 찍는 비인접 보강을 도입하려면 외형만 늘리는 것으로 충분하지 않다. `LinkRecord`가 대상 부품 ID와 각 로컬 끝점을 보유해야 하고, 복사·대칭·삭제·Undo가 끝점 참조를 함께 처리해야 한다. 관절의 회전부와 고정부를 가로지르는 경로를 사전에 보여주는 UX가 필요하다.

### 4.3 보조 OFF와 물리 조종은 같은 상태가 아니다

`Simulation._applyControlTorques`는 연결된 날개가 2개 이상 또는 물 환경에서 부유체가 2개 이상일 때 코어에 조종 토크를 추가한다. `assist=false`에서도 목표 각속도와 현재 각속도의 차이에 비례하는 제어가 남는다. 저속에서도 최소 authority가 있다. 따라서 현재 OFF는 자세 목표를 해제하는 수동 각속도 제어이며, 실제 조종면만 사용하는 모드가 아니다.

개선 기획에서는 **legacy_assisted / assisted / physical** 세 정책을 명시한다. `physical`은 구동기·조종 관절·추진기·공력면이 만드는 힘만 사용한다. `assisted`는 이 장치들의 명령을 보정한다. 현재 직접 코어 토크는 `legacy_assisted`에서만 유지한다. 각 모드가 만들어내는 힘의 출처는 디버그 뷰와 시험 보고서에 남긴다.

### 4.4 구조 단절, 조종 단절, 연료 단절, 패배를 분리

현재 `_canControl`은 코어 도달 가능성과 HP를 함께 검사한다. 코어가 파괴되면 sandbox도 종료된다. 이는 독립 게임의 규칙이다. 원작 Starting Block의 제어권·생존 조건으로 사용하지 않는다. 분리 가능한 화물·발사체·소형 기구를 지원하려면 구조 graph 외에 control policy와 resource graph가 필요하다. 살아 있는 수동 부품이 계속 부력·공기력을 받는 현행 규칙은 유지한다.

### 4.5 솔버 숫자와 실제 힘을 분리

피스톤은 `force × dt`로 방정식 제한을 설정한다. 바퀴·힌지는 `setMotorMaxForce(16/35/...)`에 직접 값을 넣는다. vendor `GSSolver.solve`는 lambda를 제한한 후 `multiplier=lambda/dt`를 기록한다. 따라서 코드 인자의 이름만 보고 실제 구동력·토크를 N 또는 N·m로 확정하면 안 된다.

또한 파단은 선형·회전 방정식 multiplier의 최대값을 하나의 threshold로 나눈다. 현재 `stress`는 **게임용 위험 비율**로 읽어야 한다. 다음 프로필에서는 선형력과 토크의 각 임계값을 독립 처리하고, 정규화한 위험도만 사용자 표시에서 합칠 수 있다. 현재 숫자를 원작 파단력이나 재료 응력 Pa로 간주하지 않는다.

## 5. 시스템별 차이 목록

[system_gaps.json](../data/system_gaps.json)에는 같은 내용을 기계가 읽을 수 있는 21개 레코드로 제공한다. P0는 확장의 전제·오해 방지·실행 검증, P1은 조립·물리 표현력, P2는 확장 콘텐츠와 평가다.

### GAP-001 · data_provenance · P0

**현재 코드:** PARTS의 질량·HP·cost, physics의 계수가 IRONWOOD 독립값으로 정의되어 있으나 모든 물리 매개변수에 별도의 출처·단위·프로필 메타데이터가 있지는 않다.

**확인할 원작 근거:** 원작 수치는 데이터 복원 표의 원문·발표 버전·실행 계측을 통과한 항목만 승인한다.

**개선 제안:** 원작 관찰 레코드와 런타임 튜닝 카탈로그를 분리하고 원작 미확인 수치에는 null을 유지한다.

**완료 조건:**

- 원작 레코드에 IRONWOOD 120N/35N/HP 등 튜닝값이 자동 복사되지 않는다.
- 모든 런타임 물리 계수는 단위·프로필·출처 유형과 함께 조회된다.
- 원작 내부 ID와 자체 record_id가 별도 필드다.

근거: `dist/parts.js::PARTS`, `dist/physics.js::Simulation`.

### GAP-002 · propulsion · P0

**현재 코드:** propeller는 직접 구동 추력원이며 매 물리 스텝에 world forward × 80 또는 55 × power × throttle을 적용한다. 외부 회전으로 힘을 얻는 블레이드가 아니다.

**확인할 원작 근거:** 원작 Propeller/Flying Block/Aquatic Screw의 공식 기능을 각각 확인하고 동일 이름으로 통합하지 않는다.

**개선 제안:** 기존 추진기를 legacy_thruster로 보존하고 능동 추력원·수동 공력 블레이드·수중 추진기의 타입과 동작 계약을 나눈다.

**완료 조건:**

- V1 설계의 propeller는 동일한 legacy 물리 프로필로 실행된다.
- 수동 블레이드는 회전·상대 유동이 없으면 스스로 추력을 만들지 않는다.
- 팔레트 설명에서 힘 생성 원인과 필요한 구동 연결이 보인다.

근거: `dist/physics.js::Simulation._applyFluidForces`, `dist/parts.js::PARTS.propeller`.

### GAP-003 · connection_graph · P0

**현재 코드:** brace는 격자 한 칸을 차지하는 강철 블록이다. 연결 중 한쪽이 brace이면 fixed strength가 2200이 된다.

**확인할 원작 근거:** 원작 Brace의 두 끝점 부착·길이·가동부 우회 연결 규칙과 구형 저장 호환성을 확인한다.

**개선 제안:** 기존 강철 블록과 별도인 endpoint_brace를 추가하고 끝점 로컬 좌표·연결 대상·길이·파단을 명시적으로 저장한다.

**완료 조건:**

- 두 블록 사이 비인접 보강을 만들고 취소할 수 있다.
- 끝점 대상 삭제 시 dangling link를 차단 또는 명시적으로 제거한다.
- 관절 우회 경로를 배치 전에 경고한다.
- 기존 brace의 cost/shape/strength를 변경하지 않는다.

근거: `dist/parts.js::PARTS.brace`, `dist/parts.js::getConnections`.

### GAP-004 · assembly_coordinates · P1

**현재 코드:** 설계 위치는 정수 격자이고 rot는 Y축 0~3의 90도 회전이다. 기구는 아래 지지와 위 탑재물에 한정된다.

**확인할 원작 근거:** 원작 고급 이동·임의각 회전과 스케일 지원 범위를 버전별로 확인한다.

**개선 제안:** 격자 편집과 정밀 편집을 분리하고 포트의 로컬 프레임으로 연결·기구 축을 정의한다.

**완료 조건:**

- 정밀 이동·회전이 강체와 시각 모델에 같은 transform을 사용한다.
- V1 rot에서 quaternion으로 변환할 때 기존 축이 변하지 않는다.
- 회전된 지지체에 부착한 관절·피스톤 축이 포트 프레임을 따른다.

근거: `dist/parts.js::validateDesign`, `dist/editor.js::planGroupTransform`, `dist/physics.js::Simulation._createMachine`.

### GAP-005 · group_parameter_edit · P1

**현재 코드:** 묶음 변형은 지원하지만 부품별 설정은 묶음 선택에서 숨겨진다. 공통 매개변수의 혼합값 표시·일괄 변경 모델이 없다.

**확인할 원작 근거:** 원작 다중 key mapper의 마지막 선택 기준·혼합값·동종 필드 전파 범위를 확인한다.

**개선 제안:** 선택집합에서 공통 설정을 교집합으로 표시하고 mixed 상태와 명시적으로 변경한 필드만 일괄 적용한다.

**완료 조건:**

- 값이 다른 항목을 0 또는 기본값으로 표시하지 않는다.
- 한 필드 변경이 다른 혼합 필드를 덮어쓰지 않는다.
- 변경 전 유효성 검증을 완료하고 묶음 한 단계로 Undo 한다.

근거: `dist/main.js::selectPart`, `dist/editor.js::planGroupTransform`.

### GAP-006 · per_part_control · P0

**현재 코드:** forward/turn/turret/aim/actuate/fire는 기체 공용 명령이다. 바퀴·추진기의 left/right/all만 부분 그룹을 나눈다.

**확인할 원작 근거:** 원작 부품별 키 매핑·변수·hold/toggle/press·역방향 설정의 확인 범위를 정한다.

**개선 제안:** ActionMap과 PartBindings를 분리해 부품별 actionId·입력 의미·부호·범위·그룹을 저장한다.

**완료 조건:**

- 피스톤 A를 확장하면서 B를 수축할 수 있다.
- 두 대포를 서로 다른 버튼으로 독립 발사한다.
- toggle은 물리 substep 수와 무관하게 press edge당 한 번 변경된다.
- 포커스 상실·모달·일시정지 후 held 입력이 남지 않는다.

근거: `dist/input.js::readControls`, `dist/physics.js::Simulation.step`, `dist/physics.js::Simulation._updateMotors`, `dist/physics.js::Simulation.fire`.

### GAP-007 · control_authority · P0

**현재 코드:** 코어와 연결된 생존 부품만 제어된다. 코어 HP 0은 모든 임무·sandbox에서 즉시 실패한다.

**확인할 원작 근거:** 이 규칙은 원작 Starting Block의 공개 규칙으로 확정하지 않는다. 분리 후 장치 작동을 설치본에서 확인한다.

**개선 제안:** 구조 연결, 신호 도달, 자원 공급, 임무 생존 조건을 독립 정책으로 분리한다. V4 정책은 legacy 프로필로 유지한다.

**완료 조건:**

- 단절 시 모터·패시브 부품·저장된 toggle 동작을 각각 정책으로 결정한다.
- 실험 sandbox에서 코어 손실 후 파편 관찰을 이어갈 수 있다.
- 캠페인 기존 코어 생존 규칙은 별도 policy로 동일하게 재현된다.

근거: `dist/physics.js::Simulation._canControl`, `dist/physics.js::Simulation._refreshConnectivity`, `dist/physics.js::Simulation._checkTerminal`.

### GAP-008 · ground_mechanisms · P1

**현재 코드:** 구동 바퀴와 차동 조향만 제공하고 수동 바퀴·조향 조인트·현가·감쇠 설정이 없다.

**확인할 원작 근거:** 원작 Suspension damper, Steering Block/Hinge, free spin과 구형 바퀴 collider 차이를 확인한다.

**개선 제안:** 수동 바퀴·조향 관절·유한 이동량의 spring-damper 현가를 추가하고 조립 축·가동 영역을 보여준다.

**완료 조건:**

- 무입력 수동 바퀴는 구동 토크를 생성하지 않는다.
- 요철 fixture에서 현가 압축·복원·감쇠와 끝단 접촉이 관측된다.
- 같은 차체에 차동 조향과 전륜 조향을 각각 구성할 수 있다.

근거: `dist/parts.js::PARTS`, `dist/physics.js::Simulation._updateMotors`.

### GAP-009 · constraint_units · P0

**현재 코드:** 피스톤 모터는 F×dt로 제한하지만 바퀴·힌지의 setMotorMaxForce 파라미터는 직접 숫자로 전달된다. 연결 stress는 선형·회전 방정식 multiplier 최대를 공용 threshold로 나눈다.

**확인할 원작 근거:** 원작 force/torque/strength의 실제 단위는 미확인이다. 먼저 독립 런타임의 단위 계약을 확립한다.

**개선 제안:** force N·torque N·m·impulse N·s·angular impulse N·m·s를 구분하고 linear/angular failure 채널과 게임용 정규화 위험도를 분리한다.

**완료 조건:**

- 동일한 물리 하중에서 dt를 바꿔도 실효 force/torque 제한이 목표 범위에 든다.
- 선형력과 토크를 max로 직접 비교하지 않는다.
- 사용자에게 하중비를 Pa 단위 응력으로 표시하지 않는다.
- legacy 파단 튜닝을 새 SI 임계값으로 무검증 치환하지 않는다.

근거: `dist/linear-actuator.js::LinearActuatorConstraint.setActuatorForce`, `dist/physics.js::Simulation._updateMotors`, `dist/physics.js::Simulation._afterStep`, `dist/vendor/cannon-es.js::GSSolver.solve`.

### GAP-010 · water · P1

**현재 코드:** 수면은 평면이다. 살아 있는 float만 최대 35N의 부력을 받는다. 모든 잠긴 부품에 타입과 무관한 공통 축별 저항이 작용하고 코어 깊이로 침수 실패를 판정한다.

**확인할 원작 근거:** 원작 객체별 부력·형상별 저항·젖음·물 속 무기 규칙을 공식 자료와 대조한다. 밀폐 선체 flooding은 별도 미확정이다.

**개선 제안:** 부력/유체 프로필을 부품별로 두고 실제 submerged fraction과 상대 유속을 사용한다. 임무 실패는 유체 모델과 분리한다.

**완료 조건:**

- float 없는 재질도 지정된 부력 프로필에 따라 반응한다.
- 수중 추진기는 실제 잠김에 따라 추력이 변한다.
- 선박 무게와 부력 중심 변화가 전복·복원 토크에 반영된다.
- 침수 실패 규칙을 꺼도 물리 부력·저항은 유지된다.

근거: `dist/physics.js::getMissionLayout`, `dist/physics.js::Simulation._applyFluidForces`, `dist/physics.js::Simulation._checkTerminal`.

### GAP-011 · flight_and_steering_policy · P0

**현재 코드:** 날개 2개 또는 수중 부유체 2개가 있으면 코어에 직접 조종 토크를 가한다. assist=false에서도 목표 각속도와 감쇠 제어가 남고 낮은 속도에서도 최소 authority가 유지된다.

**확인할 원작 근거:** 원작 공력 블레이드·관절·Rudder와 조종 반력 관계를 확인한다. V4의 직접 토크 제어를 원작 복원값으로 취급하지 않는다.

**개선 제안:** legacy_assisted, assisted, physical의 제어 정책을 명시하고 physical에서는 실제 구동 부품·조종면만 힘과 토크를 생성하게 한다.

**완료 조건:**

- physical 모드에서 조종면/구동기 없는 강체에 방향키를 눌러도 제어 토크가 생기지 않는다.
- assisted는 action/actuator 명령을 보정하고 별도 숨은 코어 토크를 추가하지 않는다.
- 기존 저장은 legacy_assisted로 동일하게 복원한다.
- 보조 OFF가 자세 목표만 끄는 것인지 물리 조종으로 바꾸는 것인지 UI에서 명확하다.

근거: `dist/physics.js::Simulation._applyControlTorques`, `dist/input.js::readControls`.

### GAP-012 · weapons · P1

**현재 코드:** 모든 살아 있는 대포가 한 번의 공용 fire edge로 발사되고 _nextFireAt·ammoRemaining을 공유한다. 단일 구형 폭발탄이며 초기 0.12초의 충돌 마스크가 진영에 따라 다르다.

**확인할 원작 근거:** 원작 Cannon/Repeating Crossbow/Grenade 등의 부품별 탄약·발사·재장전·기폭·탄체 속성은 버전별로 확인한다.

**개선 제안:** WeaponState를 부품별로 분리하고 발사체/도화선/접촉/폭발 프로필을 구분한다. 빠른 탄체 판정과 소유자 제외 정책을 명시한다.

**완료 조건:**

- 여러 포의 발사·탄약·cooldown이 독립적이다.
- 같은 입력을 여러 프레임 유지해도 press 무기는 중복 발사하지 않는다.
- 고속 작은 탄체가 얇은 정적 판을 통과하는 fixture를 검사한다.
- 총구 막힘·자기 기체 근접 충돌의 결과를 일관되게 정의한다.

근거: `dist/physics.js::Simulation.fire`, `dist/physics.js::Simulation._spawnProjectile`, `dist/physics.js::Simulation._afterStep`.

### GAP-013 · material_damage · P2

**현재 코드:** HP, 연결 health, stress를 분리하지만 열·점화·연소·소화·젖음·재질 저항 프로필은 없다. 폭발 피해는 거리 감쇠이고 차폐 판정이 없다.

**확인할 원작 근거:** 원작 목재/장갑/화염/물 관련 공식 규칙을 확인하고 미확인 계수는 비워 둔다.

**개선 제안:** MaterialResponse와 DamageEvent를 분리해 충격·폭발·열·물 반응을 조합한다. 재질과 연결 강도를 각각 튜닝한다.

**완료 조건:**

- 부품 HP 손실과 연결 분리가 독립 사건으로 남는다.
- 열원이 꺼지거나 물에 닿았을 때 소화/냉각 정책이 시간 기반으로 적용된다.
- 차폐 유무가 판정과 보고서에 동일하게 반영된다.

근거: `dist/physics.js::Simulation._damagePart`, `dist/physics.js::Simulation._explode`, `dist/physics.js::Simulation._afterStep`.

### GAP-014 · mission_objectives · P1

**현재 코드:** 목표는 destroy/route/sandbox이며 경로는 코어 선분의 world-Z 평면 통과다. 회수·운반·정지 유지·구역 점유·다중 단계는 없다.

**확인할 원작 근거:** 원작 캠페인의 회수·운반·통과 등 목표 존재와 데이터 구조 추정은 구분한다. 내부 레벨 JSON 복원이라고 주장하지 않는다.

**개선 제안:** Event→ObjectiveState→OutcomeResolver의 목표 그래프를 두고 임의 normal 관문, 회수·운반·보존 목표를 구성한다.

**완료 조건:**

- 기존 6개 작전을 같은 결과로 표현한다.
- 임의 방향 관문을 고속으로 지나도 통과를 감지한다.
- 동일 step의 성공/실패 우선순위가 데이터로 명시된다.
- 운반 물체의 ID·영역 도달·유지 시간을 함께 판정한다.

근거: `dist/parts.js::MISSIONS`, `dist/physics.js::segmentCrossesCheckpoint`, `dist/physics.js::Simulation._advanceCheckpoints`, `dist/physics.js::Simulation._checkTerminal`.

### GAP-015 · scoring · P2

**현재 코드:** 완수·시간·보존의 3별과 최단 시간·최소 발사 수를 저장한다. 원작 Time/Damage Taken/Block Total 계열 점수와 동일하지 않다.

**확인할 원작 근거:** 원작 공개 점수 산식 또는 부품 가중값의 확인 범위를 추적한다. 모르는 가중치를 임의 복원하지 않는다.

**개선 제안:** legacy_stars와 reconstruction_metrics를 구분하고 측정 가능한 시간·부품수·피해 지표부터 제공한다.

**완료 조건:**

- 기존 별과 기록이 사라지지 않는다.
- 모르는 가중 점수를 수치 0으로 채우지 않는다.
- 점수 정책 버전이 달라진 기록을 같은 순위로 비교하지 않는다.

근거: `dist/campaign.js::scoreRun`, `dist/campaign.js::recordCompletion`.

### GAP-016 · experiment_reporting · P1

**현재 코드:** 보고서는 최대 12Hz 정기 표본과 사건을 사용하고 최근 100개 사건 및 최초 파단을 보관한다. 입력 시계열·매 step peak·A/B 비교·replay 상태는 없다.

**확인할 원작 근거:** 원작 진단 도구와 재생/기록 기능의 공개 범위를 확인한다. 본 계획의 정밀 실험 도구는 독립 개선안이다.

**개선 제안:** 매 step 최대값 집계와 제한된 ring buffer를 분리하고 입력·프로필·설계 hash·실험 조건을 기록한다. A/B 비교는 조건 일치 여부를 먼저 검사한다.

**완료 조건:**

- 12Hz 출력에서도 두 표본 사이 최대 하중을 놓치지 않는 집계가 있다.
- 사건 window가 잘려도 최초 파단 및 누계는 유지된다.
- 보고서에 반복 실행용 입력을 넣되 완전 결정론/상태 replay를 보장한다고 표시하지 않는다.
- 제어 정책·물리 프로필이 다른 기록은 조건 불일치로 표시한다.

근거: `dist/report.js::REPORT_SAMPLE_PERIOD`, `dist/report.js::recordRunEvent`, `dist/main.js::captureReport`.

### GAP-017 · subassemblies · P1

**현재 코드:** 완전한 설계 8칸과 묶음 편집은 있으나 선택 부품만 라이브러리화하거나 기존 설계에 추가 로드하는 기능은 없다. 정상 설계는 core가 정확히 하나 필요하다.

**확인할 원작 근거:** 원작 additive loading·선택 저장·Starting Block 보충 처리의 버전 경계를 확인한다.

**개선 제안:** 완전 기체와 부품 모듈 저장 타입을 구분하고 추가 로드 시 ID·참조·입력 충돌을 한 거래로 재매핑한다.

**완료 조건:**

- 모듈에 core가 없어도 저장할 수 있으나 완전 기체 출격 규칙과 혼동하지 않는다.
- 추가 로드의 partId/linkId/actionId 충돌을 자동 재매핑한다.
- 한 번 Undo로 추가 로드를 모두 취소한다.
- 불완전 endpoint를 가진 모듈은 연결 필요 상태로 표시한다.

근거: `dist/designs.js::saveDesignSlot`, `dist/editor.js::normalizeBlueprint`, `dist/parts.js::validateDesign`.

### GAP-018 · test_sandbox · P1

**현재 코드:** sandbox는 육상 환경이며 일정 경계와 코어 파괴 실패가 유지된다. 물/바람/경사/하중 fixture를 독립 설정하는 연구 환경은 없다.

**확인할 원작 근거:** 원작 sandbox/editor 환경 기능과 독립 측정 fixture 설계를 분리한다.

**개선 제안:** 평지·경사·물·바람·매달린 하중 fixture와 실패 후 관찰을 제공하는 실험 모드를 둔다.

**완료 조건:**

- 임무 목표와 독립적으로 환경을 선택한다.
- 실험 fixture·시작 높이·질량·입력·스텝 설정을 저장한다.
- 부품 파괴 후에도 물리 관찰을 계속할 수 있다.
- 시험 조건 reset은 동일한 blueprint와 프로필로 시작한다.

근거: `dist/physics.js::getMissionLayout`, `dist/physics.js::Simulation._checkTerminal`.

### GAP-019 · schema_migration · P0

**현재 코드:** V1 normalizeBlueprint는 알려진 필드만 복사하고 알 수 없는 부품과 잘못된 범위를 거부한다. 추가 필드는 제거되므로 미래 버전 필드를 V1로 보내면 조용히 손실될 수 있다.

**확인할 원작 근거:** 원작 저장 형식의 호환성을 주장하지 않는다. 제안하는 schemaVersion은 IRONWOOD 전용이다.

**개선 제안:** V1→V2 명시 변환, unknown version 거부, V2 unknown critical fields 거부/경고, namespace extensions 보존 정책을 정의한다.

**완료 조건:**

- 6개 V1 프리셋과 사용자 설계를 legacy profile로 무손실 변환한다.
- 알 수 없는 version을 V1로 추정하여 읽지 않는다.
- 지원하지 않는 중요한 필드는 조용히 버리지 않고 오류나 보류 상태를 반환한다.
- mass/cost override는 승인된 카탈로그 정책 없이 적용하지 않는다.

근거: `dist/editor.js::normalizeBlueprint`, `dist/designs.js::normalizeDesigns`, `dist/main.js::normalizeImported`.

### GAP-020 · runtime_validation · P0

**현재 코드:** 기존 88개 테스트 및 CPU UI 검사와 GPU·실기기 판정이 구분되어 있다. 살아 있는 기체는 allowSleep=false이며 최대 100부품이다.

**확인할 원작 근거:** 원작 성능을 현재 웹 구현의 Node 테스트 시간으로 대체하지 않는다.

**개선 제안:** 기능 확장 전 실제 WebGL/모바일 입력 smoke와 대표 기체의 frame·physics·render 시간을 측정하고 예산을 정한다.

**완료 조건:**

- GPU context 생성·실제 pointer/키보드/touch 조립→출격→재설계 흐름을 기록한다.
- 25/50/100부품, 물·공중·기구 fixture에서 평균뿐 아니라 p95를 기록한다.
- 부품 수 상한 상향은 계측 후 결정한다.
- 브라우저와 기기·해상도·quality 설정을 결과에 포함한다.

근거: `dist/physics.js::Simulation._createMachine`, `dist/parts.js::BUILD_BOUNDS`, `scripts/check_ui_cpu.mjs::main UI integration`, `VALIDATION.md::브라우저 QA의 현재 한계`.

### GAP-021 · automation · P2

**현재 코드:** 센서·논리 게이트·timer·변수·부품별 신호 그래프는 없다. 직접 물리 입력만 읽는다.

**확인할 원작 근거:** 원작 Logic Gate/Timer/Sensor 계열의 존재·모드·수치 범위를 버전별로 확인한다.

**개선 제안:** 입력 action과 같은 신호 버스에서 timer·sensor·logic을 평가하고 순환·고정 step·edge 중복 정책을 정의한다.

**완료 조건:**

- 같은 step에 sensor→logic→actuator 명령의 평가 순서가 고정된다.
- 조합 논리 순환은 저장 시 거부하거나 명시적인 한 tick delay 노드가 필요하다.
- 일시정지에서 timer가 진행하지 않고 slow mode는 simulation time을 따른다.

근거: `dist/input.js::readControls`, `dist/physics.js::Simulation.step`, `dist/parts.js::PARTS`.

## 6. 기획 반영 경계

이번 산출물은 소스 감사·복원 데이터·개선 명세다. 현재 배포된 V4 게임 코드나 저장 스키마를 변경하지 않았다. 과거 검증 기록의 88개 테스트 통과를 새 부품·새 제어 정책의 완료 증거로 사용하지 않는다. 이후 구현 시에는 [실험 프로토콜](09_MEASUREMENT_PROTOCOL.md)의 원작 관측과 [개선 백로그](07_SYSTEM_UPGRADE_BACKLOG.md)의 독립 구현 수용 조건을 별도로 통과시킨다.
