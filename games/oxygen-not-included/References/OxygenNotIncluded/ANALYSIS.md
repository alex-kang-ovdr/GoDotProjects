# Oxygen Not Included — 원소 물성과 웹 열 모델

- 조사·갱신일: 2026-11-26
- 확인 플랫폼: Windows / Steam 설치본
- 확인 설치 경로: `C:/Program Files (x86)/Steam/steamapps/common/OxygenNotIncluded`
- 매니페스트의 설치 `buildid`: `24423041`
- 매니페스트의 `TargetBuildID`: `26798728` (설치 ID와 다름. 이 문서는 설치된 파일만 기준으로 함)
- 매니페스트 `LastUpdated`: 2026-11-13 07:09:49 UTC (Unix timestamp 변환)

## 4.3에서 대조한 기체, 배관, 건물과 연구

2026-11-26에 위 Windows 설치본의 기본 게임을 기준으로 확인했다. 대조 대상은 `OxygenNotIncluded_Data/Managed/Assembly-CSharp.dll`의 건물 설정, `ConduitFlow`, `Research`, `ResearchCenter`, `Database.Techs`와 `OxygenNotIncluded_Data/resources.assets` 안의 기본 게임 TechTree GraphML이다. 게임 실행 코드와 그래픽은 배포물에 포함하지 않았다. [Steam 제품 페이지](https://store.steampowered.com/app/457140/Oxygen_Not_Included/)

| 영역 | 설치본에서 확인한 사실 | 숨 4.3의 적용 |
| --- | --- | --- |
| 기체 | 셀의 기체는 원소 ID와 질량으로 취급된다. | 산소·이산화탄소·수소·증기는 한 칸에서 서로 섞이지 않는다. 같은 기체를 합치거나, 다른 기체를 이웃 칸으로 옮길 수 있을 때만 공간을 차지한다. |
| 배관 | 기체관 1 kg, 액체관 10 kg, 1초 주기의 이동, 분기·합류 방향 순환 | 청수·오수는 같은 액체관을 사용한다. 같은 원소의 패킷만 합쳐지고, 막힌 출구는 건너뛴다. 분기 순번을 저장하며 관 다리의 입구·출구 우선순위를 처리한다. |
| 건설 | 건물별 폭·높이, 설치 조건, Unity 기준점의 포트 오프셋 | 아래 왼쪽 점유 칸 기준으로 변환해 건물 전체의 충돌과 지지면, 포트 좌표를 판정한다. 예를 들어 연구 작업대는 2×2, 슈퍼컴퓨터는 3×3, 정화기는 4×3, 터빈은 5×4다. 다리 회전 시 두 포트도 이동한다. |
| 연구 | 기본 게임 86개 기술, 직접 선행 관계 89개, 단계별 기초·고급·우주 비용 | 연구 장소와 자원이 다르다. 기초 1점에는 흙 50 kg, 고급 1점에는 청수 50 kg, 우주 1점에는 데이터뱅크 1 kg이 필요하다. 기초 연구 작업대는 60 W, 슈퍼컴퓨터와 천체 연구소는 각각 120 W다. |
| 탐사 자료 | 연구 모듈 귀환 시 데이터뱅크 10 kg, 가까운 천체의 기본 조사 항목 5개는 각각 50 kg 추가 | 웹판은 7×5 증기 엔진과 연구 탑재체를 한 건물로 조작한다. 증기 100 kg, 왕복 600초는 이 지도의 설정값이다. 한 천체의 기본 조사가 끝나면 귀환 보상만 받는다. |

기술 관계와 비용은 기본 게임 기준이다. 웹판에 존재하는 건물만 실제 해금되어 건설 메뉴에 나타난다. 대원의 작업 능력·운반, 기지 코어와 조리대의 물 연결, 천체 탐사는 기존 웹판의 시스템으로 처리한다. 설치본의 전체 별지도, DLC 기술 트리 및 독립된 로켓 모듈 조립을 구현한 범위에는 포함되지 않는다.

한 칸의 원소와 포트 타일을 직접 볼 수 있어 막힌 배관을 추적하기 쉽다. 작은 지도에서는 건물을 넓게 배치할 때 초반 굴착과 전선 재배치가 더 필요하다. 기체 이동은 질량·온도를 추적하는 웹 시뮬레이션이다. 설치본 SimDLL의 격리된 기체 틱과 질량 이동은 측정했다. 전체 웹 시뮬레이션의 일치나 임의의 복합 순환 배관망 전체의 동일성은 미검증이다. [원작 기체 틱 측정](GasTicks/NATIVE_GAS_TRACES_4_4.md) · [배관 분기 회귀 테스트](../../Source/Project/tests/conduits43.test.mjs) · [건물 연결 및 탐사 테스트](../../Source/Project/tests/packet-buildings43.test.mjs)

4.3 회귀 테스트 138개와 렌더링 시나리오 180개가 통과했다. 시드 73에서 보관함·연구 작업대·확산기를 건설하고 흙을 채굴·운반해 환기 연구를 완료했다. 연구 중간에 저장을 불러오고, 해금 후 세로 기체관 다리를 실제 건설했다. 별도 자원 공급 시험에서는 세 연구 시설로 86개 기술을 모두 완료하고 저장을 다시 열었다. Chrome 1365×850과 모바일 에뮬레이션 390×844에서 기술 검색·선택 및 호환 프로필 전환을 확인했다. [실제 기지와 전체 연구 트리 시험](../../Source/Project/tests/colony43.test.mjs)

## 출처와 확인 범위

수치의 1차 출처는 설치본의 `OxygenNotIncluded_Data/StreamingAssets/elements/gas.yaml`, `liquid.yaml`, `solid.yaml`이다. YAML의 `specificHeatCapacity`, `thermalConductivity`, `molarMass`, `state`, `lowTemp`/`highTemp`, 전이 대상 필드를 확인했다. 원소 임계 온도는 파일에 기록된 K 값을 `°C = K − 273.15`로 변환했다. 나머지 열 물성 값은 원본의 숫자를 그대로 보존했다.

로컬 설치본 식별에는 Steam의 `steamapps/appmanifest_457140.acf`를 읽었다. 이 파일은 설치 ID와 대상 ID가 서로 다르므로, ID가 일치한다고 가정하지 않았다. Steam 상점은 게임의 배급사/제품 식별에, Klei EULA는 이용권과 지식재산 귀속 확인에만 사용했다.

| 종류 | 확인한 근거 |
|---|---|
| 설치 YAML | `OxygenNotIncluded_Data/StreamingAssets/elements/{gas,liquid,solid}.yaml` |
| 설치 빌드 메타데이터 | `steamapps/appmanifest_457140.acf`: `buildid=24423041`, `TargetBuildID=26798728` |
| 프로젝트 웹판 계약 | [`V4_CONTRACT.md`](../../Source/Project/V4_CONTRACT.md) |
| 프로젝트 열 모델 | [`Web/environment.js`](../../Web/environment.js), [`Web/elements.js`](../../Web/elements.js) |
| 공식 제품 정보 | [Steam의 Oxygen Not Included](https://store.steampowered.com/app/457140/Oxygen_Not_Included/), [Klei 제품 페이지](https://www.klei.com/games/oxygen-not-included) |
| 라이선스 | [Oxygen Not Included EULA](https://store.steampowered.com/eula/457140_eula_0) |

외부 공개 게임 DB나 위키의 상수는 이번 숫자 표의 원본으로 사용하지 않았다. 설치된 YAML 원문과 비교하는 검증은 해당 로컬 설치본에만 유효하다.

## 원소 데이터

비열과 열전도도는 원본 숫자 그대로이며 원작 게임의 엔진 단위다. 표시 단위로 `specificHeatCapacity`는 DTU/(g·°C), `thermalConductivity`는 DTU/(m·s·°C)를 사용한다. `molarMass`는 YAML 필드 그대로 g/mol로 표시했다. 임계 온도는 게임 파일 값을 섭씨로 환산했으며, `—`는 이 행의 상태에서 해당 방향 전이 필드가 YAML에 없음을 뜻한다.

| Element ID | 원작 상태 | 비열 | 열전도도 | 저온 임계값 °C → 전이 | 고온 임계값 °C → 전이 | molarMass |
|---|---|---:|---:|---|---|---:|
| Oxygen | Gas | 1.005 | 0.024 | -182.96 → LiquidOxygen | — | 15.9994 |
| CarbonDioxide | Gas | 0.846 | 0.0146 | -48.15 → LiquidCarbonDioxide | — | 44.01 |
| Hydrogen | Gas | 2.4 | 0.168 | -252.15 → LiquidHydrogen | — | 1.00794 |
| Water | Liquid | 4.179 | 0.609 | -0.65 → Ice | 99.35 → Steam | 18.01528 |
| Ice | Solid | 2.05 | 2.18 | — | -0.65 → Water | 18.01528 |
| Steam | Gas | 4.179 | 0.184 | 99.35 → Water | — | 18.01528 |
| Dirt | Solid | 1.48 | 2 | — | 326.85 → Sand | 50 |
| IgneousRock | Solid | 1 | 2 | — | 1409.85 → Magma | 50 |
| SandStone | Solid | 0.8 | 2.9 | — | 926.85 → Magma | 50 |
| Algae | Solid | 0.2 | 2 | — | 125 → Dirt | 4 |
| IronOre | Solid | 0.449 | 4 | — | 1534.85 → MoltenIron | 159.6882 |
| Carbon | Solid | 0.71 | 1.25 | — | 276.85 → RefinedCarbon | 12.0107 |
| Granite | Solid | 0.79 | 3.39 | — | 668.85 → Magma | 50 |
| Obsidian | Solid | 0.2 | 2 | — | 2726.85 → Magma | 50 |
| Cuprite | Solid | 0.386 | 4.5 | — | 1083.85 → MoltenCopper | 143.09 |
| Katairite | Solid | 4 | 0.00001 | — | 3421.85 → MoltenTungsten | 341.76 |

`Carbon`은 이 게임에서 석탄으로 쓰이는 원소 ID다. 웹 지형의 `copper`는 원작 원소 `Cuprite`에 연결된다. `rock`, `dirt`, `algae`, `coal`, `ice`, `bedrock`, `tile`의 웹 매핑은 구현을 위한 선택이며 이름만으로 원작 지형과 동일하다고 간주하지 않는다.

## 관찰, 해석, 웹판 적용

### 설치본에서 확인한 사실

- 기체, 액체, 고체 원소 정의가 각각 세 YAML 파일에 나뉘어 있다.
- 상변화 임계값과 목표 원소는 행마다 명시되거나 생략되어 있다. 예를 들어 `Water`에는 저온·고온 두 임계값이 있고, `Steam`에는 `lowTemp → Water`가 있다.
- `Ice`는 고체 원소이며 `highTemp → Water`로 정의된다. 따라서 원작의 채굴 가능한 얼음 광맥도 고체 `Ice`를 월드 타일로 쓰는 흐름이다.
- `Katairite`는 비열 4, 열전도도 0.00001의 고체이며 3695 K에서 `MoltenTungsten`으로 전이한다. 이 물성은 심부 암반의 단열 경계 후보를 뒷받침하지만, 원소 YAML은 생성 위치나 심부 분포를 정하지 않는다.
- 기체·액체·고체 YAML의 원소 레코드는 원작 물성 값의 출처다. 여기서 수치를 읽은 사실만으로 웹판의 유체 이동, 열교환, 상변화 알고리즘이 원작과 같다고 볼 수는 없다.

### 해석 및 적용 결정

- 웹 열 계산에 쓸 원소 객체는 [`Web/elements.js`](../../Web/elements.js)의 `ELEMENTS`에 보관한다. 게임 파일의 숫자, 상태와 목표 ID는 유지하고 K 임계값만 °C로 변환한다. 이 모듈은 원본 YAML 덤프나 게임 자산을 포함하지 않는다.
- 웹 고체 지형은 `rock → IgneousRock`, `dirt → Dirt`, `copper → Cuprite`, `algae → Algae`, `coal → Carbon`, `ice → Ice`, `bedrock → Granite`, `tile → SandStone`로 열 물성을 연결한다. 이 연결은 웹판의 간소화된 지형 분류이며 원작 지형 전부를 재현하는 표가 아니다.
- 심부의 뜨거운 지대 둘레에는 원작 `Katairite` 물성을 쓰는 단열 경계를 배치한다. 지대 배치와 구조는 웹판의 지형 설계이며, `Katairite` 물성만 설치본 YAML에서 가져왔다.
- 기존 바닥 타일을 선택해 암석 6을 사용하여 단열 보강하는 조작을 제공한다. 보강 타일 열전도도는 기본 `SandStone` 값에 `0.01`을 곱한다. 재료 선택·비용·계수는 웹판 플레이 규칙이며 원작 수치가 아니다.
- 웹 시뮬레이션은 한 셀의 액체 기준량을 12 L로 둔다. 액체 물과 서리는 셀 용량을 함께 쓰며, 증기는 별도 `steam` 질량으로 둔다. 물의 원작 상변화 임계값을 중심으로 웹판 온도 이력을 ±1°C 두어 전이가 반복적으로 흔들리는 현상을 줄인다.
- 웹판에서 액체가 얼면 이동 가능한 셀의 `frost` 바닥층이 된다. 고체 `ice` 타일은 계속 채굴할 수 있고, 채굴 시 웹판의 지정 생산량을 보존한다. 바닥 서리를 타일로 승격하거나 광맥을 서리로 치환하지 않는다.
- 액체는 아래로 우선 이동하고 옆으로 퍼지며, 증기는 위쪽 셀로 이동하는 편향을 갖는다. 증기는 원작 `Steam → Water` 임계값 아래에서 액체로 응결한다. 이 유체 흐름의 계수와 셀 한도는 웹판 가정이다.
- 타일 건설 시 대상 셀의 물·산소·CO₂·증기를 인접 셀로 옮길 공간이 충분한지 먼저 전체 계획을 세운다. 어느 한 원소라도 이동 공간이 모자라면 이동을 적용하지 않고 배치 작업을 보류한다. 타일 건설에서 소량의 액체도 조용히 버리거나 대상 칸만 비우지 않도록 하는 웹판의 원자적 변위 규칙이다.

## 4.1 원자적 타일 변위, 생산량 한계와 검증 범위

### 웹판의 원자적 타일 변위

[`displaceForTile`](../../Web/environment.js)은 인접 후보를 아래, 왼쪽, 오른쪽, 위 순서로 모아 이동 계획을 만든다. 셀 물질 상한은 액체 1 단위(12 L), 산소 3 단위, CO₂ 3 단위, 증기 12 kg으로 계산한다. 대상 셀에 서리가 있으면 설치를 막는다. 모든 물질이 이웃 셀 용량에 수용될 수 있을 때만 계획 전체를 적용한다. 물 이동 중에는 열량을 함께 전달한다. 따라서 불가능 판정 시 원래 셀 및 이웃 셀 상태가 변하지 않는 것이 기대 동작이다.

이는 ONI의 내부 배치 규칙을 그대로 복원한 것이 아니라, 웹 시뮬레이터가 삭제·복제 없이 닫힌 공간에 타일을 설치하도록 정한 정책이다. 여기에서 생산량 한도는 환경 셀의 수용량 상한이다. 산소 발생기의 웹판 생산률은 0.35 단위/초이지만 셀 산소는 3 단위에서 포화된다. 액체·서리 총량은 셀 하나당 12 L 상당량을 넘지 않으며, 증기는 셀당 12 kg을 넘지 않는다. 이 값은 설치 YAML의 원작 상수가 아니다.

단열 보강은 이미 설치된 바닥 타일을 선택하고 암석 6을 소비해 해당 타일의 웹 열전도도를 기본값의 1%로 만든다. 이는 일반적인 원작 타일 재료 선택·열전달 API를 재현한 것이 아니라, 웹판에서 기존 구조를 보수·개량하는 전용 규칙이다. 비용 차감은 성공 가능한 단일 타일 작업에서만 발생해야 하며, 실패 시 자원과 타일의 열전도도가 바뀌지 않는지 확인한다.

### 확인한 검증

- 2026-11-26 실행에서 16개 원소의 상태·물성값·전이값이 설치 YAML과 대조되었고, 엔진 테스트 82/82(20개 목표 달성 후 10주기 포함)와 렌더링 168 시나리오가 통과했으며 상변화·단열·접촉 열 수지·타일 변위·터빈/벤트·구버전 로드를 포함했다.
- 미검증 범위는 웹판과 원작의 전체 물리 동작 일치, 원작의 상전이 잠열·최소 질량·혼합 기체 열 계산 규칙, Steam 업데이트 이후의 데이터 변화이며, 웹 셀 크기·용량·유동 계수·±1°C 히스테리시스는 웹판 설계값이다.

## 설치 코드 상수 대조

2026-11-26에 설치본 `Assembly-CSharp.dll`을 읽기 전용으로 검사했다. 매니페스트 설치 build ID는 `24423041`이고 DLL SHA-256은 `A58E04D0FFDF89B86FB28B71AD900625B3B539DB30D67F8C6269F73A9F5AE599`이다. `StreamingAssets/Tuning.json` SHA-256은 `D4CE06820474C9553EB86B221493D784DA019E87F9B76632B0BAEB5F0D01B73E`이며, 그 안에 아래 설정의 수치는 없다.

| 타입 / 메서드 | IL에서 확인한 수치 | 해석 범위 |
|---|---|---|
| `ElectrolyzerConfig.ConfigureBuildingTemplate` | Water 1.0 kg/s 소비, Oxygen 0.888 kg/s 및 Hydrogen 0.112 kg/s 생산, 기체 출력 343.15 K (70°C) | `ConsumedElement`/`OutputElement` 생성 인자를 확인했다. |
| `MineralDeoxidizerConfig.ConfigureBuildingTemplate`, `CreateBuildingDef` | Algae 0.55 kg/s 소비, Oxygen 0.5 kg/s 생산(303.15 K / 30°C), 전력 120 W, 자체 발열 1 kW, 배기 발열 0.5 kW | 설치 코드의 입력 태그 문자열은 `Algae`다. `OxyRock`과 혼동하지 않는다. |
| `HydrogenGeneratorConfig.DoPostConfigureComplete`, `CreateBuildingDef` | Hydrogen 입력률 0.1 kg/s, 버퍼 2 kg, 정격 800 W, 작동 중 자체 발열 2 kW 및 배기 발열 2 kW | `EnergyGenerator.CreateSimpleFormula` 인자와 `BuildingDef` 필드 대입값을 확인했다. |
| `BASESTATS..ctor`, `BaseMinionTraits`, `BaseMinion` | `OXYGEN_USED_PER_SECOND=0.1 kg/s`, `OXYGEN_TO_CO2_CONVERSION=0.02` 연결 확인 | 산소 소비 0.1 kg/s, 동등 CO₂ 생성 0.002 kg/s (2 g/s) |

`Tuning.json`에 해당 값이 없어 DLL 메서드와 인자만 기록했다. 원본 코드·디컴파일 산출물·자산은 저장소에 복사하지 않았으며, 위 단위는 메서드의 질량률 인자와 건물 전력 필드 의미를 따른다.

## 4.2 설치본 코드·기체 설비 대조

아래 값은 같은 설치 DLL에서 타입·메서드와 IL 인자/필드 대입으로 확인한 항목이다. 수치는 해당 메서드가 넘긴 게임 내부 질량률·전력·저장량이다. 기체관·액체관의 칸당 질량은 `ConduitFlow` 생성자에서 확인했다. 관 분기와 패킷 전송 방식은 웹 구현 항목에 기록했다.

| 확인 항목 | 설치본에서 확인한 사실 | 식별·해석 범위 |
|---|---|---|
| 주기 | `GameClock`의 사이클 길이 600초 | 게임 사이클 기준값 |
| 일반 대원 | `BASESTATS..ctor`에서 산소 0.1 kg/s, 이산화탄소 변환율 0.02, 열량 상한 4,000 kcal, 주기당 열량 소모 1,000 kcal | `BaseMinionTraits`와 `BaseMinion`이 일반 모델의 호흡 속성과 변환율에 적용한다. 웹판은 호흡 중 매 틱 배출량을 합산한다. |
| 전해조 | `ElectrolyzerConfig.ConfigureBuildingTemplate`: Water 1 kg/s 입력, Oxygen 0.888 kg/s 및 Hydrogen 0.112 kg/s 출력, 출력 온도 343.15 K (70°C) | 산소 확산기와 전해조의 `maxMass`는 각각 1.8 kg이다. |
| 조류 산소 확산기 | `MineralDeoxidizerConfig.ConfigureBuildingTemplate`: Algae 0.55 kg/s 입력, Oxygen 0.5 kg/s 출력 @303.15 K (30°C); `CreateBuildingDef`: 120 W, 자체 발열 1 kW, 배기 발열 0.5 kW | 확산기/기체 제거기 후보는 `MineralDeoxidizerConfig`다. `AlgaeHabitatConfig`와 별도 설비 |
| 산소 발생 생물 서식지 | `AlgaeHabitatConfig.ConfigureBuildingTemplate` 입력 `SimHashes.Algae=-1870043872` 0.03 kg/s 및 `SimHashes.Water=1836671383` 0.3 kg/s; 출력 `SimHashes.Oxygen=-1528777920` 0.04 kg/s 및 `SimHashes.DirtyWater=1832607973` 0.290333 kg/s, 출력 온도 303.15 K | 입력·출력 SimHashes를 raw enum 값과 대조. 이 설비는 Mineral Deoxidizer와 다른 타입 |
| 물질 ID 구분 | `SimHashes.Algae=-1870043872`, `OxyRock=1262005685`; 설치 YAML ID는 `Algae` 및 `OxyRock`이고 `Oxylite` YAML ID/enum 항목은 찾지 못함 | 정수 enum 식별자와 IL 문자열 리터럴/태그는 다른 근거다. 값만 보고 문자열 태그를 해석하지 않음 |
| 기체 펌프 | `GasPumpConfig.CreateBuildingDef` 240 W; `ConfigureBuildingTemplate` 0.5 kg/s 소비/이송률, 저장소 1 kg | 설치본 수치. 프로젝트 구현의 펌프 선택·관 네트워크 동작은 웹 모델 |
| 액체 펌프 | `LiquidPumpConfig`: 240 W, 10 kg/s 소비률, 20 kg 저장소, 자체 발열 2 kW | 여기의 kg/s는 설정 인자 대조 |
| 수동 발전기 | `ManualGeneratorConfig`: 정격 400 W, 자체 발열 1 kW | 대원 조작 시간은 별도 수치 |
| 석탄 발전기 | `GeneratorConfig.ConfigureBuildingTemplate`: Carbon 1 kg/s 입력, CO₂ 0.02 kg/s 출력 @383.15 K (110°C); 정격 600 W, 자체 발열 1 kW, 배기 열 8 kW | CoalGenerator prefab 설정. Carbon은 원소 ID |
| 소형 배터리 | `BatteryConfig`: 10,000 J 용량, 손실률 1.6666666 J/s | 원작 설정값 |
| Mealwood | `BasicSingleHarvestPlantConfig.CreatePrefab`: `meallice_kanim`, `BasicPlantFood`, 283.15–303.15 K 성장, 주변 기체 최소량 0.15 kg, Dirt 0.0166667 kg/s. `TUNING.CROPS..cctor`: BasicPlantFood 성장 시간 1800 s, 수량 1. `FOOD_TYPES..cctor`: 600000 cal (600 kcal) | prefab·tuning·식품 데이터 대조 |
| ConduitFlow | `Game.OnPrefabInit`의 생성자 인자: 기체 슬롯 max mass 1 kg, 액체 슬롯 max mass 10 kg | 원작 슬롯 용량. 웹판 전송/분기 솔버와 동등성은 의미하지 않음 |

웹 시뮬레이터는 기체 질량을 kg로 저장하고 O₂/CO₂의 기존 셀 단위를 0.5328 kg/unit으로 환산한다. 새 기체관의 1 kg/칸 저장, 셀당 1 kg/s 집계 전송 한도, 전해조 직접 대기 배출, 가스 펌프의 같은 칸 관 연결, 증기/수소 대기량 상한과 버퍼는 웹 구현 정책이다. 원작의 도관 슬롯 질량값은 확인했으나 웹 네트워크의 이동·혼합·분기 솔버가 원작과 같다는 주장은 하지 않는다.

`Algae`와 `OxyRock`는 서로 다른 ID다. DLL의 `MineralDeoxidizerConfig`가 사용한 입력은 enum raw 정수값이 아니라 `Algae` 문자열 태그였고, `AlgaeHabitatConfig` IL의 `SimHashes` operand는 `Algae` raw 값이다. 이 구분은 IL operand를 enum 상수와 대조한 결과이며 `ToString()` 출력 자체를 raw IL 값으로 간주하지 않았다.

### 원작 물질 질량·채굴 자료

아래 수치는 설치본 `StreamingAssets/elements/liquid.yaml`과 `solid.yaml`에서 확인했다. 4.2의 새 기지는 물 한 칸의 기준 질량으로 1,000 kg을 사용하고, 자연 고체 지형의 열용량과 채굴량은 해당 원소의 `defaultMass`를 기준으로 계산한다.

| Element | `maxMass` / `defaultMass` (kg) |
|---|---:|
| Water | 1000 / 1000 |
| Algae | 300 / 200 |
| Dirt | 1840 / 1840 |
| IgneousRock | 1840 / 1840 |
| Cuprite | 1840 / 800 |
| Carbon | 4000 / 600 |
| Ice | 1100 / 1000 |
| Katairite | 3200 / 500 |
| Granite | 1840 / 1840 |

웹 구현에서 채굴 회수율은 50%다. 고체 자원은 현장 더미로 남고, 채굴한 얼음은 해당 칸의 `frost`에 남아 기온에 따라 물이 된다. 이 표현은 웹판 자체 설계다. 4.1 호환 기지는 기존 물 용량 12 kg/칸을 사용한다.

새 기지 시드 73에서 연구, 채굴, 사다리 건설, 전력 연결, 기체관 배치 명령으로 천장 펌프를 가동해 수소 발전 2,000 J를 달성했다. 자동 검증은 대기·관·발전기 버퍼·누적 소비량의 합과 전해조의 누적 수소 생산량을 대조한다. [재현 테스트](../../Source/Project/tests/oni-rules.test.mjs)

## 플레이에 적용한 4.1 규칙

숨의 기체 1단위는 0.5328 kg이다. 정격 물 0.18 kg/s를 쓰는 전해조의 기존 산소 출력 0.30 단위/s와 산소 질량비 0.888을 함께 만족시키는 웹판 환산값이다. 대원은 산소 농도와 물 깊이에 따라 휴대 산소를 사용한다. 주변에서 직접 호흡할 때 배출하는 CO₂ 질량은 흡입 산소의 2%다. 웹판의 호흡 가능 조건은 산소 0.16 단위 초과, 혼합 기체 중 산소 질량비 16% 이상, 물 깊이 70% 미만이다.

남동쪽 심부의 분출구는 웹판에서 120초 주기의 첫 36초 동안 최대 0.20 kg/s의 165°C 증기를 낸다. 분출 칸의 증기 2.5 kg에서 멈춘다. 연구 60에서 건설하는 소형 증기 터빈은 오른쪽 흡입구에서 125°C 이상의 증기를 받아 최대 0.2 kg/s를 같은 질량의 청수로 응축한다. 200°C 증기에서 최대 85 W를 내고 본체가 100°C에 이르면 정지한다. 출력 배관과 축전지의 남은 용량, 연결된 전력 수요로 가동량을 제한한다. 배관은 액체량만 추적하므로 응축수의 온도는 급수망에 전파되지 않는다. 분출 주기와 1칸 설비는 이 게임의 설계값이다. [기존 터빈 반응 조사](../../ReverseDesign/Revisions/2026-11-18/ONI_Data_Reconstruction_Plan_v1/data/reactions.json)

## 라이선스와 재사용

Steam의 ONI EULA는 게임 설치·사용에 한정된 개인용 비독점 라이선스를 부여하고, 게임 및 그 지식재산에 대한 나머지 권리를 Klei에 남긴다고 적고 있다. 이에 따라 프로젝트는 설치본 YAML, 게임 이미지·문구·코드 등 원본 파일을 복사하거나 재배포하지 않는다. `Web/elements.js`에는 열 시뮬레이션에 필요한 숫자 사실, 원소 식별자, 상태, 전이 관계만 새 객체로 기록했다. 이는 게임 자산 사용 허가나 전체 원작 데이터 재사용을 뜻하지 않는다. 웹판 고유 수치는 별도 설계 가정으로 관리한다.

## 미확인 사항

- 설치 매니페스트의 `buildid`와 `TargetBuildID`가 다르므로, 기준 게임 버전의 정확한 공개 버전명과 데이터 파일의 실제 출처 빌드 여부는 추가 확인이 필요하다.
- 온도 경계의 내부 비교 연산, 상전이 잠열, 최소 질량, 여러 물질이 한 셀의 열 계산에 참여하는 세부 순서는 YAML 수치만으로 확인할 수 없다.
- 게임 설치 파일은 업데이트될 수 있다. 향후 YAML 값이 바뀌면 다시 비교하고 이 문서의 빌드 식별자를 갱신해야 한다.

## 4.3 BuildingDef footprint와 포트 좌표

조사·갱신일은 위 문서와 같으며, Windows Steam 설치본의 `Assembly-CSharp.dll`을 `ilspycmd`로 확인했다. 아래는 `CreateBuildingDef`의 `width`/`height`와 `BuildingDef`의 `PowerInputOffset`, `PowerOutputOffset`, `UtilityInputOffset`, `UtilityOutputOffset`, conduit type 대입을 비교한 사실이다. 원본 DLL이나 디컴파일 산출물은 저장소에 포함하지 않았다.

| prefab/config | 설치본에서 확인한 footprint | 확인한 관련 포트 |
|---|---:|---|
| `ResearchCenterConfig` | 2×2 | 전력 입력 활성화, 전력 offset은 기본값 `(0,0)` |
| `AdvancedResearchCenterConfig` | 3×3 | 120 W 입력, 명시 offset 없음(기본 `(0,0)`) |
| `CosmicResearchCenterConfig` | 4×4 | 120 W 입력, 명시 offset 없음(기본 `(0,0)`) |
| `LiquidPumpConfig` | 2×2 | 전력 입력 `(0,1)`, 액체 출력 `(1,1)` |
| `WaterPurifierConfig` | 4×3 | 전력 입력 `(2,0)`, 액체 입력 `(-1,2)`, 액체 출력 `(2,2)` |
| `ElectrolyzerConfig` | 2×2 | 전력 입력 `(1,0)`, 액체 입력 `(0,0)`; 기체는 설비 주변 대기로 출력 |
| `HydrogenGeneratorConfig` | 4×3 | 기체 입력 `(-1,0)`, 전력 출력 `(1,0)` |
| `GasConduitBridgeConfig`, `LiquidConduitBridgeConfig` | 각 3×1 | 각 입력 `(-1,0)`, 출력 `(1,0)`; 회전 허용 |
| `LiquidVentConfig`, `GasVentConfig` | 각 1×1 | 관련 유틸리티 입력 `(0,0)` |
| `SteamEngineConfig` | 7×5 | 가스 입력 `(2,3)`; 게임 설비 자체는 전력 입력을 요구하지 않음 |

`BuildingDef.GenerateOffsets(width,height)`는 X 배치 offset 시작값을 `width / 2 - width + 1`로 만든다. 따라서 원본 `CellOffset`은 건물의 좌하단 모서리가 아니라 게임의 배치 셀 기준이다. 웹판은 `building.x/y`를 footprint의 좌하단 점유칸으로 계약하고, 원본 X offset에서 이 시작값을 빼서 footprint 내부 포트로 정규화한다. 예를 들어 폭 4의 purifier/hydrogen generator에서 원본 X `-1`은 좌측 끝 칸(상대 X 0), purifier의 X `2`는 상대 X 3이 된다. 원본 Y는 위쪽 양수이므로 웹의 아래쪽 증가 좌표에서는 building anchor Y에서 뺀다. 이 좌표 변환과 0–3 회전의 웹 API는 [`Web/footprint.js`](../../Web/footprint.js)에 구현했다.

설치본에서 읽은 footprint/CellOffset 사실과 웹판만을 위한 `core`, `kitchen`, `cooler`, `steamTurbine`의 포트 근사는 `BUILDING_FOOTPRINTS`의 `evidence`/`portEvidence`로 구분한다. 방 크기·점유를 위해 웹판에서 사용한 가상 anchor 규칙은 ONI 설치본의 건축 위치 UX와 완전히 같은 동작을 뜻하지 않는다.


## 4.4 기체 틱과 기압 대조

2026-11-26에 Windows Steam 설치 빌드 24423041의 SimDLL을 별도 프로세스에서 실행했다. 설치된 기본 게임의 원소 YAML로 물성표를 만들고, 32×32칸 격자에 서로 벽으로 분리된 실험실 36개를 배치했다. 시드는 73이다. 원작의 200 ms 환경 업데이트를 한 번 요청한 후 원작이 한 프레임을 처리했다고 응답할 때마다 각 칸의 원소 번호, 질량과 온도를 읽었다. 이 비교에서 기체 압력의 관측량은 타일당 기체 질량(kg)이다. 파스칼 단위 압력은 측정하지 않았다. 측정 스크립트와 수치 기록을 제공하며 원작 DLL이나 리소스는 포함하지 않는다. [원작 소개](https://www.klei.com/games/oxygen-not-included) · [측정 스크립트](GasTicks/capture-native-gas-traces.py) · [원작 측정값](GasTicks/native-gas-traces-4.4.json) · [초기 좌표 재현 (15,15)](GasTicks/native-gas-anchor-oxygen-15-16.json)

- 밀폐된 두 칸에 산소 2 kg과 진공을 두면 첫 0.2초에 0.24 kg이 이동한다. 양쪽 산소의 다음 교환량은 0.1824 kg이다. 수소·이산화탄소·증기의 기체 유동 계수는 0.10, 산소는 0.12다. 설치본의 원소 정의와 실제 실행 결과를 대조했다.
- 평면에서 원작은 상하좌우 네 방향과 한 쌍의 대각 방향 사이에서 질량을 교환한다. 대각 방향은 다음 틱에 반대로 바뀐다. 이미 같은 기체가 있던 칸은 여러 이웃의 흐름을 한꺼번에 받는다. 같은 진공 칸을 여러 이웃이 채우려 하면 네이티브 격자에서 먼저 처리되는 기체 칸 하나가 채운다. 산소 3.75 kg과 0.65 kg의 배치를 맞바꿔도 우선순위가 유지됐다.
- 고립된 산소 칸에서 12, 100, 1,000 kg을 각각 두 틱 동안 유지하는 것을 확인했다. 추가 실험에서는 1,001 kg부터 1,000,000 kg까지 일곱 가지 질량을 같은 방법으로 확인했다. 4.4의 1,000,000 kg 입력 제한은 웹판에서 검증한 범위다. 가스 분출구의 과압 정지 질량과 대기 타일에 존재할 수 있는 질량은 별개의 값이다.
- 같은 원소인 두 칸도 원작에서는 질량 교환 후 좌우의 내용물이 통째로 바뀌는 틱이 있었다. 균질한 산소 실험에서 이웃 칸에 계산값이 자리만 바꿔 나타나는 것을 관측했다. 혼합 원소가 만나는 경계에서도 위치별 오차가 남는다. 게임의 기체 오버레이에서 **원작과 대조**를 열면 초기 조건과 틱을 골라 각 좌표의 원소와 질량 차이를 확인할 수 있다.

### 좌표별 재생 결과

독립 산소 기준 실험과 36개 비교 실험을 재생했다. 초기 배치를 제외한 260개 프레임의 기체·진공 타일을 808회 비교했다. 프레임 일치 기준은 그 프레임의 모든 관측 칸에서 원소가 같고 질량 오차가 0.001 g 이내인 경우다. 셀당 평균 절대 질량 오차에는 서로 다른 원소가 점유한 칸도 포함하며 원소가 다른 칸 수를 별도로 센다.

| 측정값 | 4.3 | 4.4 |
|---|---:|---:|
| 일치 프레임 | 131 / 260 | 194 / 260 |
| 셀당 평균 절대 질량 오차 | 106.93 g | 12.46 g |
| 최대 절대 질량 오차 | 1,752.85 g | 1,024.00 g |
| 원소가 다른 셀 관측 | 26 / 808 | 44 / 808 |

밀폐된 두 칸 독립 산소 실험은 8개 틱 모두 좌표별 허용 오차 이내다. 부력에 따른 위치 역전은 배열과 초기 위치에 따라 달랐다. 추가 140쌍 실험에서는 O₂ 위 H₂와 CO₂ 위 O₂가 모두 뒤집혔고, O₂ 위 증기와 H₂ 위 O₂는 120틱 안에 뒤집히지 않았다. 개별 뒤집힘 시간은 1~63틱 범위였다. 산소 위에 수소를 둔 140개 밀폐실에서 원작의 첫 교환 시점은 평균 15.47틱, 웹판은 평균 16.06틱이었다. 평균 질량 오차가 줄어도 특정 틱의 원소 위치는 달라질 수 있다. [부력·모서리 추가 실측](GasTicks/NATIVE_GAS_DENSITY_4_4.md) · [측정 조건](GasTicks/NATIVE_GAS_TRACES_4_4.md) · [추가 밀도·모서리 측정표와 원자료](GasTicks/NATIVE_GAS_DENSITY_4_4.md) · [두 버전 비교 명령](../../Source/Project/scripts/compare-gas-ticks.mjs)

## 4.4 기본 게임의 우주 탐사

같은 설치본의 SteamEngineConfig, ResearchModuleConfig, CommandModuleConfig, RocketStats, Spacecraft, ResearchModule.OnLand 및 SpacecraftManager.GenerateFixedDestinations 설정과 동작을 확인했다. 확장팩의 로켓 내부 공간과 성단 지도는 이 대조에서 제외했다.

- **조립**. 엔진은 7×5, 연구 모듈과 조종 모듈은 5×5다. 엔진 위 중앙 결합점에 연구 모듈을 차례로 잇고 맨 위에 조종 모듈을 붙인다. 조종 모듈을 엔진에 바로 붙인 비행에서는 데이터를 얻지 않는다.
- **연료와 항속 거리**. 증기 엔진의 탱크는 900 kg이다. 원작의 증기 연료 효율, 엔진과 모듈의 질량, 적재 질량에 따른 항속 거리 공식을 적용했다. 원작의 첫 거리에는 별개의 탄소질 소행성 두 개가 있다. 새 목적지의 연구 기회를 사용한 모듈은 데이터뱅크 50 kg을 발견하고 모든 연구 모듈은 귀환 시 10 kg을 추가로 받는다. 각 목적지의 연구 기회는 5개다.
- **웹판 적용**. 건설은 웹 기지의 보유 금속과 암석을 사용한다. 기존 숙련 체계의 기술점으로 조종사를 훈련하고 배정한다. 4.4 지도 상단 x=37~43에 우주 출구를 뒀다. 엔진, 연구 모듈, 조종 모듈을 완성하고 발사 경로의 지형을 정리해야 한다. 배정된 대원은 조종 모듈 옆의 접근 가능한 칸으로 직접 이동해 승선한다. 비행 중인 조종사는 기지 작업에 참여하지 않는다.
