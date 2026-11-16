# v3 협업 계약 — 자원 운반과 기지 생활

이 문서는 v2 위에서 구현할 범위와 UI·렌더러·테스트 간 데이터 계약이다. 세부 균형값은 정상 공개 명령 진행을 확인하며 조정할 수 있으나 필드명·API 변경은 root와 먼저 공유한다.

## 범위와 소유권

- 엔진 담당: `dist/engine.js`, `dist/utilities.js`, 새 `dist/community.js`. DOM 없이 모든 실제 규칙·검증·호환 구현.
- 렌더러 담당: `dist/renderer.js`만 수정.
- 테스트 담당: `tests/`, `examples/`, `README.md`, `CHANGELOG.md`.
- root: `dist/app.js`, `dist/index.html`, `dist/styles.css`, 패키지·안내·배포.

## 실제 운반

채굴한 고체(rock, metal, algae, coal)는 채굴 지점에 남고 대원이 주워 코어나 보관함으로 운반한 뒤에만 공용 비축으로 들어간다. 운반 중 경로 단절·대원 사망·역할 변경·휴식 선점에서 물질이 사라지거나 복제되지 않는다. 얼음과 청수·오수는 기존 물 시스템을 유지한다.

v3의 공간화 범위는 **채굴품 수거와 운반, 수거 거점 선택**이다. 수거된 고체는 공용 비축이며 건설·생산의 최종 투입 자원을 각 설비에 운반하는 단계까지 주장하지 않는다. 운반함의 물리적 용량을 넘으면 수거가 대기하고 이유를 표시한다. 비축 용량보다 작은 상태가 되는 창고 해체는 거부하거나 보존 가능한 규칙으로 처리한다.

```js
game.debris = [{id,x,y,resource,amount,priority:3,reservedBy:null,blockedReason:''}];
crew.cargo = null; // 또는 {resource, amount}, 운반량 최대 12
game.logistics = {loose,carried,stored,capacity,blockedPiles,activeHaulers};
```

`stored`는 수거 완료한 고체 4종의 합계이며 `resources`에 이미 포함된다. 중복 합산하지 않는다. 코어 기본 수거 용량 권장 600, 보관함 1개 추가 용량 240. 코어·완공 보관함을 수거 목적지로 사용하며 가까운 도달 가능한 곳을 선택한다. `setHaulPriority(pileId,1..5)`는 `{ok,message}`를 반환한다.

## 신규 설비 및 식품

BUILDINGS에 `storage`(자원 보관함), `kitchen`(조리대), `mess`(식탁), `fridge`(냉장고)를 추가한다. 기존 cost/power/unlock/color/name/description 구조를 유지한다.

- 보관함: 실제 운반 도착점·공용 고체 보관 용량. 권장 비용 광석15·금속5.
- 조리대: 실제 조리 대원, 전력, 청수, 수확 식량을 사용. 연구10, 권장 10W·6초·식량2+청수0.3L→조리식3. 기본 목표 조리식12, 수동 정지·공급 단절·작업자 중단 처리.
- 식탁: 대원이 실제 이동해 식사·휴식하며 스트레스를 낮춤. 침수·예약·접근 불가를 고려.
- 냉장고: 연구30, 권장 6W. 실제 전력 공급 중에만 공용 식품의 부패 속도를 낮춤. 정전 시 부패가 다시 빨라짐.

```js
resources.food // 기존 수확 식량, 그대로 먹을 수 있음
resources.meals // 새 조리식
game.foodStatus = {raw,cooked,total,cold,rawDecayPerSecond,cookedDecayPerSecond};
building.mealTarget // kitchen, 기본12
building.recipeProgress // kitchen, 0..1
game.setKitchenTarget(buildingId,0..60) // 정수, {ok,message}
```

식사는 조리식을 우선하며 수확 식량도 먹을 수 있다. 식량 일수는 둘의 합계로 계산한다. 실제 부패는 재고 감소와 `production.foodSpoiled`로 기록한다. 권장 부패율은 원식량 초당0.00015, 조리식0.0003 비율; 활성 냉장고는 이를80% 감소. 이 값은 게임용 균형 단위다. 목표량에 도달한 조리대는 새 작업을 시작하지 않는다. 레시피 투입·산출과 부분 진행을 저장하며 중단·재개로 중복 생산하지 않는다.

## 교대와 대원 생활

`setCrewRole`은 기존 역할 외 `haul`, `cook`를 지원한다. 역할은 선호도이며 필수 생활 행동을 막지 않는다.

```js
crew.schedule // 'auto'|'day'|'swing'|'night'; 신규·이전 저장 기본auto
crew.schedulePhase // 'work'|'break'|'sleep'
crew.restedCycles // 실제 계획 수면을 마친 횟수
game.setCrewSchedule(crewId,schedule) // {ok,message}
```

auto는 기존 필요 기반 행동을 유지한다. 나머지는 120초 주기 내 작업·여가·수면 구간을 가지며 위상이 각각 0, 1/3, 2/3 어긋난다. 실제 침상 수면을 최소6초 수행한 후 해당 주기의 휴식을 1회만 기록한다. 여가는 식탁으로 이동해 스트레스를 낮춘다. 위험한 호흡·굶주림·용변 필요는 일정에 우선한다. 일정·역할 변경, 작업 선점 시 운반 물질과 예약을 보존한다. 높은 스트레스는 작업 효율에 실제 영향을 주며 조리식·식탁·휴식이 이를 완화한다.

## 생산 이력과 목표

기존 production 필드를 유지하고 `hauledItems`, `mealsCooked`, `cookedEaten`, `tableMeals`, `foodSpoiled`, `scheduledRests`를 추가한다. 누계는 실제 행동에서만 증가한다.

기존12목표를 보존하고 4단계 '잘 사는 기지'에 아래4목표를 추가해 총16개로 한다.

| id | 달성 | target | tool |
|---|---|---:|---|
| haul | 실제 고체 운반 누계 | 80 | storage |
| cooking | 실제 조리식 생산 누계 | 12 | kitchen |
| dining | 실제 식탁 식사 누계 | 6 | mess |
| community | 건강·산소·물·식량·낮은 스트레스·계획 수면·가동 가능한 생활 설비의 연속 유지 | 240 | 없음 |

`game.settlement={seconds,target:240,healthy,reasons:[]}`를 추가한다. 기존 `game.stability`는 v2 자립을 위해 유지한다. 최종16목표가 모두 완료돼야 v3 승리. 목표4단계는 실제 수거·조리·식탁 식사·계획 수면 이력이 있어야 하며 연결·건강·식량 등 현재 조건이 깨지면 유지시간이0이 된다. 구체 임계치는 명료한 한글 `reasons`로 공개한다. v3 최종 달성 뒤 계속 운영 가능하다.

## 저장·호환

최종 `serialize().version=3`. v1→v3 및 v2→v3를 지원하며 지형·설비·비축·작업·생산·완료 목표를 보존한다. 이전 승리 상태는 새4개 목표를 도전하도록 변환한다. 신규 필드·화물·더미 예약·일정·식품·조리 진행·정착 판정을 검증한 후에만 전체 상태를 교체한다. 손상 저장은 현재 게임과 원본 입력을 부분 변경하지 않는다.

진짜 v2 fixture는 root가 코드 변경 전에 `tests/fixtures/v2-progress.json`, `v2-victory.json`으로 저장했다. v1 fixture도 유지한다. 전체 API와 Game.step,48×28 맵,0.1초 시뮬레이션 단계,기존오버레이는 유지한다.

## 렌더러·UI

- 새 오버레이 이름 `logistics`, 단축키H. 고체 더미·수거 거점·운반 화물을 표시한다.
- 더미는 평상시에도 작은 자원 실루엣으로 보이며 실제 운반 시에만 대원에게 화물을 그린다.
- 4종 신규 설비는 구별되는 실루엣. 조리·냉장·식사 모션은 실제 active/workerId에 연동.
- 생산 수치와 저장/부패·교대표·최종 조건은 실제 엔진 값을 표시한다. 존재하지 않는 수치나 시각적 가짜 활동을 만들지 않는다.
- 브라우저 시작 시 v1/v2 복원은 잠시 멈추고 새 운반·조리·교대 안내를 한다. 기존 저장은 삭제하지 않는다.

## 완료 조건

공개 명령만으로 채굴→운반→건설→v2 물 순환→조리·보관·식사·교대→16목표 달성 경로가 실행돼야 한다. 실제 방수벽 건설과 대원 안전을 유지한다. 예제 JSON을 재생성하고 추가10주기의 생존·농장 반복 수확·새 식사/운반 기록·수지 보존을 검사한다. 운반 중 선점/단절과 조리 중 공급 단절의 실패·복구 및 v1/v2 변환도 검증한다.
