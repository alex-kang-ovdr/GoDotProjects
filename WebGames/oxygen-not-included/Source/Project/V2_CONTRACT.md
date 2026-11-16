# Breath Colony v2 — 생활 유지와 자립 운영

## 소유권과 목표

- engine.js 및 utilities.js 등 시뮬레이션 모듈: simulation_systems.
- renderer.js: colony_people.
- tests, README.md, CHANGELOG.md: production_space.
- index.html/styles.css/app.js 및 통합·배포: root.
- 완전한 원작 복제보다 실제 자원 소모·배관 단절·대원 생활·연구·자립 판정이 연결되는 플레이를 완성한다. 새 Site를 생성하지 않는다.
- 큰 재설계로 대기하지 말고 실행 가능한 패치를 먼저 기록한다. API 변경은 root와 즉시 공유한다.

## 기존 계약 유지

Game, BUILDINGS, MATERIALS, WORLD_W/H, CYCLE_SECONDS, 기존 queue/inspect/canPlace/serialize/load/recruit 등의 API는 유지한다. 게임 플레이 중 UI는 외부에서 0.1초 고정 step을 호출한다. 기존 산소 .8≈100%, water 0..1, 온도 °C, 전력 W/에너지 J 단위 유지.

## 새 필드와 API

- `cells[i].pipe`, `cells[i].wastepipe`: boolean, 청수/오수 배관 레이어. 같은 칸에 전선과 두 배관을 함께 둘 수 있다.
- `queue/canPlace('pipe'|'wastepipe',x,y)`: 전선처럼 소량 금속으로 즉시 설치, 중복 차감 금지. `removePipe` / `removeWastepipe` 전용 철거 도구도 지원해 시설과 겹쳐도 선택 제거한다. 취소 도구가 완공 인프라를 제거하지 않는다.
- 신규 BUILDINGS 키: `toilet`, `sink`, `reservoir`, `purifier`, `electrolyzer`, `hydrogenGen`, `cooler`. cost/power/color/unlock/name/description 기존 형식. 공백 대신 정확히 이 키를 사용한다.
- `buildings[].waterConnected`, `.wasteConnected`: 해당 레이어 연결 상태. 입력·출력 포트는 모두 시설 앵커 칸으로 단순화. 두 레이어가 구분되어 섞이지 않는다.
- `buildings[].cleanWater`, `.dirtyWater`: 실제 저장량(탱크 기능 설비에 사용). 파이프 자체 버퍼를 쓰면 `cells[].cleanWater`, `.dirtyWater` 사용 가능. 분리/합류/철거 시 질량 보존과 손실 정책 명시.
- `resources.water`는 총 청수 재고. 신규 `resources.waste`, `resources.hydrogen` 추가. 직접 자원 비용 변경과 탱크 합계가 불일치하지 않게 엔진이 일관성을 보장한다.
- `game.plumbing={waterStored,waterCapacity,wasteStored,wasteCapacity,waterFlow,wasteFlow,waterDemand}`: 모두 유한 비음수. waterFlow/wasteFlow는 현재 또는 짧은 측정 구간의 실제 L/s. UI가 내부 네트워크 자료구조에 의존하지 않도록 이 집계를 제공한다.
- `crew[].bladder`: 0=용변 필요 없음, 100=급함. `crew[].hygiene`: 100=깨끗함. toilet/wash 이용 작업과 접근 경로·예약을 실제로 처리한다.
- `tasks[].blockedReason`: 선택적 한국어 설명. 길 없음/자원/예약 등 진단. `game.stats.blockedTasks` 추가.
- `game.research={tier:0..3,cap:number,nextLabel:string}` 또는 동등한 공개 정보. 연구는 최소 100까지 확장하고 unlock 수치로 새 설비 접근을 제어한다.
- `setAutomation(id,mode)`: mode='always'|'battery'|'oxygen'|'temperature'. 결과 `{ok,message}`. 설비에 맞는 모드만 허용하고 히스테리시스 사용. `buildings[].automation` 저장. 기존 enabled 수동 스위치는 최우선.
- `game.stability={seconds,target,healthy,reasons:string[]}`: 자립 유지 시간과 미달 원인.
- `game.history` 최근 최대 90개 `{time,oxygen,food,water,power}` 실제 표본. UI의 추세 그래프용. 고정 길이, 저장 왕복.
- `game.production` 누적 생산량/위생 이용횟수/수확 등 집계. 세부 키는 엔진담당이 정해 root·테스트담당에 공유한다.
- 기존 `game.objectives` 유지하되 stage(1..3)를 추가하여 초기 정착/생활 기반/자립 목표를 배열 하나로 노출한다. UI가 배열 길이에 의존하지 않으므로 6개 이상 확장 가능.

## 플레이 순환

1. 초기 산소·식량·청수는 준비할 시간을 주되 생산을 장기간 무시하면 부족해진다. 농장의 식량 산출과 대원 소비를 현실적인 게임 난도로 조정한다. 목표 보상이 생산 검증을 가리지 않게 실제 생산 집계를 제공한다.
2. 청수/오수 네트워크는 연결된 설비끼리만 흐른다. 탱크를 다른 네트워크로 떼어도 물이 복제되지 않는다. UI의 총 재고가 충분해도 미연결 소비 설비는 멈추고 원인을 표시한다.
3. 코어에 초기 청수 저장소와 짧은 청수 배관 예시를 둔다. 새 화장실·세면대와 오수 탱크/정화는 플레이어가 설치한다. 용변 욕구에는 최소 1~2사이클 준비 시간이 있다.
4. 화장실은 대원이 이용하며 청수→오수, 세면대는 물을 사용해 위생 회복, 정화기는 오수와 필터 자원(광석 또는 조류)을 소비해 청수 회수. 막히면 멈춘다.
5. 물 수집기는 인접 지형 물을 취수하여 연결된 배관/탱크로 보낸다. 장기 자립을 위해 기존 오른쪽 물 웅덩이에 공개된 지하수 유입구를 둔다(`cell.spring=true` 등 표시 필드 공유). 유입은 생산 원천으로 명시하며 무한 물을 숨겨서 지급하지 않는다.
6. 물전해장치는 청수·전력→산소·수소, 수소발전기는 수소→전력·열. 산소 공급을 끄면 수소 생산도 줄어드는 상호작용이 있다. 수소는 이번 버전에서 공유 가스 저장고로 단순화하며 UI에 명시한다.
7. 냉각기는 전력과 냉각수(청수→오수)를 사용하여 주변 온도를 조절한다. 과열된 농장/설비 회복 수단이다.
8. 자동 제어는 배터리 충전율·산소·온도 기준으로 시설 대기를 제어한다. UI가 자동 대기와 수동 정지를 구분할 수 있는 status 제공.
9. 초기6개 목표 + 위생 이용/취수/정화/전해·수소 발전/안정 유지 목표를 추가한다. 최종 승리는 적어도 실제 생산을 거친 후 3명 건강·산소·식량·물·위생 조건을 180초 유지하는 방식. 일시적 자원부족이 무엇인지 stability.reasons로 설명한다. 승리 후 계속 운영 가능.

## 저장·검증

- save version 2. 기존 정상 v1 세이브를 마이그레이션하여 지형·설비·재고·진행을 보존하고 새 욕구·배관·고급 목표를 초기화한다. 기존 v1 승리는 새 목표 도전 상태로 이어진다. 원본을 변경하지 않는다.
- 잘못된 v2 세이브는 원자적으로 거부한다. 필요한 새 필드/NaN/음수/ID/경로/목표/네트워크 저장량·형식 검증.
- 테스트는 실제 작업으로 시설이 완성되고 네트워크 연결/단절이 소비·생산에 영향을 주는지 확인한다. 정상 승리 경로와 장기 유지, 안전 실패/회복, v1 마이그레이션을 포함한다.

## 렌더링과 UI

- renderer.overlay='plumbing' 및 tool pipe/wastepipe/removePipe/removeWastepipe. 청수는 파랑 실선·원형접합, 오수는 황갈색 점선·사각접합 등 모양도 구분한다.
- 신규 7설비의 독립 실루엣. 완공/활성/정지/미연결/가득참 상태와 실제 데이터 기반 흐름을 표시.
- root: 네번째 건설 분류 배관·위생, 생활 현황·생산 추세·작업 목록 탭, 단계별 목표, 신규 설비/영입/자동화/세이브 안내, 모바일 가로화면 최적화.
