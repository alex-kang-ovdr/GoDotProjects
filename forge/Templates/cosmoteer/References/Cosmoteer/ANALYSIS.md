# Cosmoteer의 함선 부품, 전력 보급과 교전

- 조사·갱신일: 2026-11-26
- 대상 스냅샷: `C:\Temp\Cosmoteer` (Windows PC). `Bin\Cosmoteer.exe` ProductVersion `1.0.0+5bc3b6093b01604ae6f4c25a61b1cd61a986e6e4`, FileVersion `1.0.0.0`, `datahash` `e9686e55d34a1965ef0f0ddcba3f71ec`. 함께 배포된 표준 모드 5종의 `CompatibleGameVersions` 값은 `0.30.4c`다. Steam 빌드 번호는 스냅샷에서 확인하지 못했다.
- 범위: 설치 데이터의 정적 판독, 제한된 카탈로그 추출, 선택한 .NET IL 메서드 메타데이터 분석, 이 저장소의 단일 표적 사격장과 조립 함선 간 교전, 자동화 검증 결과.

## Cosmoteer 데이터 구조와 부품 근거

**확인 사실.** 스냅샷의 `Data/cosmoteer.rules`는 함선 클래스와 게임 모드, Codex, UI, 자원, AI 등 게임 데이터를 파일 참조로 모은다. `Data/Rules Syntax.md`는 `.rules`를 Halfling ObjectText 기반 계층형 텍스트 형식으로 설명하며, 필드/그룹/리스트, 파일 참조, 상속을 사용한다. 의미는 규칙 파일 자체만이 아니라 게임의 코드와 데이터 스키마가 해석한다.

`Data/ships/terran/terran.rules`는 부품 정의의 `Part` 노드를 모은다. 예를 들어 `cannon_med.rules`의 직접 부모는 `base_med_part_terran_overclock.rules`의 `Part`이며, 이 중형 테란 기반 파일은 다시 `base_part_overclock.rules`를 상속한다. 부품 규칙에는 ID, 크기, 비용, 카테고리, 체력, 작동 조건과 하위 컴포넌트 등이 들어간다.

**이 저장소의 카탈로그.** `tools/extract_catalog.py`는 제한된 필드만 추출해 `data/catalog.json`에 출처 파일과 필드별 출처(provenance)를 남긴다. 현재 파일에는 스냅샷 인벤토리 12,042개 파일과 916개 `.rules`, 테란 부품 96종과 자원 27종이 기록되어 있고, `unresolved` 항목은 0개다. 전 부품을 완전 해석한 결과가 아니라 도구가 다루는 범위의 카탈로그다. 예를 들어 소형 원자로는 8,000 배터리 용량, 1,000 단위 픽업 및 생산량, 약 0.667초 생산 간격을 제공하고, 소형 레이저는 4,000 용량, 200 단위/발, 0.75초 발사 간격, 0.4초 지연, 사거리 260, 탄속 408, 피해 500을 카탈로그로 가져온다. 장갑은 체력 4,000이다. 값과 출처는 카탈로그 JSON에서 직접 확인할 수 있다.

## 전력 보급 사격장

**구현 사실.** `sim/power_range.gd`는 카탈로그의 소형 원자로·소형 레이저·장갑·복도 정의를 읽어 사격장 상태를 만든다. 120 Hz 고정 틱으로 전력 생산, 통로를 통한 전력 운반, 사격 조건, 발사체 이동, 장갑 피해를 갱신하고 각 사건을 기록한다. 조작 상태에는 보급 통로, 포수, 사격 허가, 표적 거리, 재생 및 속도 제어가 있다. `ui/main.gd`는 사격장과 추출 카탈로그 화면을 제공하고, 단면도·계통 계기·상태·최근 이벤트를 표시한다.

**자동화 검증.** `tests/test_power_range.gd`는 고정된 조건으로 보급 경로 차단, 포수/사격 허가/사거리 조건, 전력량, 경로 거리, 프레임 분할 독립성 등을 검사한다. 저장된 `tests/results/power_range.log`에는 52 checks, 0 failures가 기록되어 있다. 기본 시나리오 로그는 첫 전달 1.883초, 첫 발사 2.283초, 첫 명중 2.583초, 장갑 파괴 7.833초를 보고한다. 이 검증은 이 저장소의 사격장 모델에 대한 것이며 Cosmoteer 게임 실행 결과가 아니다.

**한계.** 이 사격장은 선택된 규칙값을 바탕으로 한 축소 시뮬레이션이다. 원본 승무원 경로 탐색, 전력 분배 전체, 무기 조준/탄도, 물리, 동시성, AI 및 게임 UI를 재현한다고 주장하지 않는다. 모델의 처리 순서는 `power_range.gd` 구현에 한정된다.

## 규칙 간 파일 참조

원본 규칙 916개에서 명시적 외부 파일 참조 2,720곳을 추출했다. 파일 쌍은 1,923개다. 예를 들어 `ships/terran/terran.rules` 26행은 소형 레이저를 등록하고, 그 레이저 파일 440행은 소형 레이저 탄환 파일을 가리킨다. 루트 파일이 참조하는 내장 함선, 음악, 오버레이 규칙 파일 3개는 스냅샷에 없다. [원본 행과 누락 경로](../../data/rule_graph.json)

## .NET IL 정적 호출 분석

`analysis/Program.cs`는 .NET 메타데이터와 IL 바이트를 `PEReader`로 읽으며 어셈블리를 로드하거나 실행하지 않는다. `data/logic_trace.json`은 스냅샷의 `Bin/Cosmoteer.dll`과 SHA-256 `da314bf6d4d84224c7ab380c8b6cb6f67f1626e0ae92a6a8690fe3e997dfe788`가 일치하는 어셈블리에서 선택한 메서드 9개의 `call`, `callvirt`, `newobj` 지점 242곳을 기록한다. 아래는 그 정적 참조를 도메인별로 묶은 것이다.

**읽는 법.** 화살표는 해당 메서드 IL에 직접 나타나는 호출 대상의 관계를 요약한다. IL 오프셋 순으로 발견한 호출 토큰이지 런타임 추적이 아니다. 조건 분기, 이벤트 타이밍, 호출 횟수, 프레임 간 순서 또는 모든 실행에서의 호출 여부를 보장하지 않는다. `ResourceConverter`의 예약/변환과 `Emitter`의 즉시/지연 발사처럼 가능한 분기를 실행 순서로 단정하면 안 된다.

| 선택한 메서드 (메타데이터 토큰) | 정적으로 확인한 직접 호출 경로/대상 |
|---|---|
| `ResourceConverter.OnConversionTick` (`0x06002A4E`) | `WantsResourceConversion`; 변환 입력 저장소 제거용 컴파일러 생성 헬퍼; 출력 저장소 `AddResources`; operational 상태 확인; 토글 및 값 공급자 변경; `ResourceConverterManager.EnqueueConversion`. |
| `ResourceConverter.WantsResourceConversion` (`0x06002A4F`) | 입력/출력 규칙과 저장소의 준비·현재·예상 자원 및 최대 용량 조회; 함선 자원 관리자에서 자원 총량·총 용량 조회; 함선 메타데이터에서 자원 수요 조회. |
| `ResourceConsumer.OnStorageResourcesChanged` (`0x06002A1C`) | `UpdateSinkRegistration` 호출. |
| `ResourceConsumer.UpdateSinkRegistration` (`0x06002A1E`) | 함선, 소비 활성 상태, 규칙, operational 상태, 저장소 남은 용량 확인; `RegisterSinksImpl`와 `UnregisterSinksImpl` 참조. |
| `Weapon.TryFireSyncStep` (`0x06002777`) | 발사 권한 및 `Weapon.HasResources` 확인; 컴파일러 생성 발사 헬퍼; 규칙/표적/직접 조종 상태 조회; 토글 변경. |
| `Emitter.HasResources` (`0x06002641`) | 자원 사용 배율, `ResourcesReadyToUse`, `AnticipatedResources`, 규칙 및 부품 조회. |
| `Emitter.OnFireTriggered` (`0x06002656`) | 작동 상태와 트리거 값을 조회하고 `Emitter.Fire` 및 무기 관리자의 `AddFireDelayedEmitter`를 참조한다. 둘의 상호 배타성·선택 조건은 IL 호출 목록만으로 확정하지 않는다. |
| `Emitter.Fire` (`0x06002658`) | 자원/작동 상태 확인, `Emitter.Emit`, 무기 관리자 통지, 자원 사용 배율 및 `ISimpleResourceStorage.AddResources`; 부품 위치·방향과 물리 본체 조회. |
| `BulletEmitter.Emit` (`0x0600261D`) | 탄환 규칙, 발사 위치/방향/표적, 난수와 확산, 광선 검사(`RayCastFirst`), 탄환 파라미터/객체 생성, 시뮬레이션 탄환 관리자 `Add` 등을 참조한다. |

**해석.** 이 선택 집합은 자원 소비자 등록, 자원 변환 의사 확인/예약, 무기의 발사 조건·트리거·탄환 생성 사이에 코드상 연결 지점이 있음을 보여준다. 다만 IL 호출 피연산자만으로 전체 시뮬레이션 단계, 동시 실행 관계, 정확한 에너지 소비 시점 또는 실제 교전에서의 인과 순서를 복원할 수 없다. 이 저장소의 사격장 모델은 이러한 복잡한 로직을 대체하는 축소 모델이다.

## UI·조작 관찰과 디자인 메모

**확인 사실.** `Data/codex/tutorials/` 아래에는 빌드, 카메라, 명령, 전투 등의 튜토리얼 규칙 파일이 있다. 이전 카메라 튜토리얼은 가장자리 이동/줌 항목을, 후속 튜토리얼은 가운데 버튼 드래그, 포커스 클릭, Alt+드래그 이미지를 지정한다. 빌드 튜토리얼은 건조 UI, 부품, 승무원, 회전 내용을 별도 항목으로 정의한다. 이는 규칙 파일의 주제 분류에 대한 정적 확인일 뿐, 실제 화면 배치나 입력 동작을 이번 조사에서 플레이 검증한 것은 아니다.

**프로젝트 적용과 검증.** 조선소는 등록 부품 96종의 ID·크기·비용·체력을 사용한다. 기본 기동형에는 3방향 소형 추진기 4기와 선실 4개가 있다. 양측은 같은 물리·무기·승무원 보급 모델을 사용한다. 추진기가 없는 이전 설계도 정지 포대로 출격한다. [정지 함선 회귀 검사 코드](../../tests/test_ship_battle.gd)

**자체 구현한 규칙.** 방 가장자리에 연결된 통로로 승무원이 이동해 배터리를 전달한다. 기동형은 반응로 비축분을 연결된 함교와 추진기에 일부 옮긴 상태로 출발한다. 교전 시작 간격 120m, AI의 거리 유지와 최초 사격 준비 시간은 실험용 설정이다. 탄환은 움직이는 선체의 회전된 부품 직사각형에 충돌하고 먼저 만난 부품이 피해를 받는다. [설계 모델](../../sim/ship_design.gd) · [전투 모델](../../sim/ship_battle.gd)

## 추진 데이터와 직접 조종

**로컬 스냅샷에서 확인한 값.** `Data/ships/terran/thruster_*/`의 일반 추진기 6종은 개별 노즐의 위치와 분사각, 추력, 전력 소모, 가감속 시간을 정의한다. 3방향 소형은 분사각 90°·0°·180°의 노즐이 배터리 저장고 하나를 공유한다. 소형은 노즐당 추력 400, 중형 1,300, 대형 3,600, 초대형 8,000이다. `ships/base_ship.rules`에는 선형 항력과 각속도 감쇠 설정이 있다. `laser_blaster_small.rules`의 포탑 선회 범위는 200°, 최대 선회 속도는 90°/초다. 각 수치와 원본 행은 카탈로그의 `provenance`에 기록했다. [추출 결과](../../data/catalog.json)

**재현 방식.** 선체에 장착한 노즐 위치를 회전 변환한 뒤 실제 힘과 무게중심 기준 토크를 합산한다. 입력은 원하는 기동을 지시하고 출력 배분기가 사용 가능한 노즐을 고른다. 출처가 없는 개별 부품 질량은 밀도와 물리 면적으로 근사한다. 보급, 접촉 처리, 출력 배분기와 AI는 실험에서 구현한 모델이며 원작 런타임과의 일치도는 측정하지 않았다. [비행 물리](../../sim/flight_dynamics.gd)

**검증 결과.** 기본 기동형의 전진 키 입력 100틱에서 플레이어가 전방으로 약 35m 이동하고 적함까지의 거리가 약 120m에서 83m로 줄었다. 별도 교전에서 적 레이저를 우선 공격했을 때 승리하고 선미를 노출했을 때 패배하는 조건도 검증했다. [조종 입력 검사 코드](../../tests/test_flight_ui.gd) · [기동 및 교전 검사 코드](../../tests/test_flight.gd)

### 부스트와 모듈식 로켓 · 2026-11-26

**원본 데이터 관찰.** Windows 스냅샷의 `Data/ships/terran/thruster_boost`에서 일반·부스트 노즐, 전력 5,001/0 작동 래치, 6,000/5,999 완충 판정, 부스트 중 주기 방전 및 종료 방전 조건을 추출했다. `thruster_rocket_nozzle`, `thruster_rocket_extender`, `thruster_rocket_battery`는 상대 회전, 연결 위치와 정렬 기준, 저장소 프록시와 담당 인원 등을 정의한다. 노즐·연장기의 자체 용량은 각각 2,000이며 측면 배터리는 4,000이다. 저장소 프록시가 단계별로 노출하는 용량 한도는 2,000이다. [필드와 원본 행](../../data/catalog.json)

**원본 코드 관찰.** `Cosmoteer.dll`의 `Thruster.ApplyForce`는 연료 타이머에 `min(|활성도|, 1)`을, 타이머 만료 시 소모량에 `max(1, |활성도|)`을 적용한다. `ThrusterManager.CommitActivationLevels`는 틱 간격을 유효 상승 시간으로 나눈 만큼 활성도를 증가시킨다. 일반 모드에서 전력을 공급받는 단계 수를 N이라 하면 최대 활성도는 N, 최대 추력은 10,000N, 평균 최대 소모는 300N/초다. 상승 시간 필드는 4/√N이므로 0에서 최대까지는 4√N초가 걸린다.

**조작과 재현 범위.** 실험선에서 B로 부스트를 켜고 W로 분사한다. 조선소의 금색 접점과 최대치, 전투 화면의 실제 추력·소모율로 연결과 보급 효과를 구분할 수 있다. 긴 로켓은 최대 출력이 높고 도달 시간이 길어 짧은 조작에서는 차이가 작다. 반응로 비축분으로 출격 준비를 하는 방식과 B 키 배치는 이 프로젝트의 설계다. [로켓 연결 모델](../../sim/rocket_network.gd) · [특수 추진 전투 모델](../../sim/special_propulsion.gd)

**전력 계측.** 실험실은 60Hz마다 실제 출력을 적분해 전력의 정수 부분을 차감하고 소수 잔여량을 다음 틱에 넘긴다. 원본은 연료 타이머가 만료될 때 묶어서 차감하므로 짧은 구간의 잔량 표시에는 차이가 생긴다. 풀 출력 1초 동안 부스트는 전력 550을 사용했고, 2단 로켓은 노즐 측과 연장기 측에서 각각 300씩 사용했다. [부스트·로켓 전투 검사 코드](../../tests/test_special_propulsion.gd) · [조립과 직접 조작 검사 코드](../../tests/test_special_propulsion_ui.gd)

**실험실의 엔진룸과 열 모델.** 엔진룸에 맞닿은 추진기에 O 키로 추가 출력을 걸고 전력과 열의 증가를 확인하는 자체 설계다. 추력 배율 1.30, 추진 전력 배율 1.45와 엔진 단위의 100/35 열 차단·복구 기준을 적용한다. 전투 계기는 발열과 누적 열을 함께 표시하며, 부스트 전력에는 평균 유지 소모를 포함한다. [엔진룸 및 열 규칙](../../sim/engine_room.gd) · [조작 및 비교표](../../README.md)

### 실험실 임무 흐름

기존 함선 조립, 승무원 보급과 교전은 자유 교전 및 임무에 공통으로 적용한다. 실험실용 임무는 자체 데이터에서 목표, 시작 거리, 상대 설계, 기동 성향과 해금 조건을 읽는다. 무장 해제에서는 적 함교를 보호하고, 대피 임무에서는 제한 시간까지 아군 함교를 지킨다. 전투가 끝나면 결과의 원인과 전투 수치를 표시하고 임무 완료 기록을 저장한다. [작전 데이터](../../data/operations.json) · [교전 검사 코드](../../tests/test_operation_combat.gd)

## 출처와 사용 조건

### 로컬 스냅샷 및 저장소 파일 (2026-11-26 확인)

- `C:\Temp\Cosmoteer\Bin\Cosmoteer.exe`, `datahash` — 대상 빌드 식별 정보.
- `C:\Temp\Cosmoteer\Bin\Cosmoteer.dll` — SHA-256가 `data/logic_trace.json`에 기록된 어셈블리.
- `C:\Temp\Cosmoteer\Data\cosmoteer.rules`, `Data\Rules Syntax.md`, `Data\ships\terran\terran.rules`, `Data\ships\terran\cannon_med\cannon_med.rules`, `Data\ships\terran\base_med_part_terran_overclock.rules`, `Data\ships\base_part_overclock.rules` — 규칙 구조/직접 상속 근거.
- `CosmoteerLab/data/catalog.json`, `tools/extract_catalog.py` — 제한 카탈로그와 출처 필드.
- `CosmoteerLab/analysis/Program.cs`, `data/logic_trace.json` — 선택한 IL 호출 피연산자 추출 코드/결과.
- `CosmoteerLab/sim/power_range.gd`, `ui/main.gd`, `ui/range_view.gd` — 시뮬레이션과 화면 구현.
- `CosmoteerLab/tests/test_power_range.gd`, `tests/results/power_range.log` — 자동 검증 코드와 저장된 결과.

### 웹 출처

- [Cosmoteer 공식 웹사이트](https://cosmoteer.net/) — 제품 사이트. 사이트 링크의 공식 여부는 Cosmoteer 공식 위키의 제품 문서에서 확인했다.

### 라이선스·배포 조건

스냅샷에서 `LICENSES.txt`를 확인하지 못했고, 이 분석은 게임 규칙/코드/이미지/음향의 재사용 권한을 판단하지 않는다. 이 프로젝트에는 외부 게임 자산을 복사하지 않았으며, 로컬 분석 자료는 사실 확인을 위한 출처로만 기록했다. 재배포 또는 게임 데이터 직접 사용 권리는 별도로 확인되지 않아 불확실하다.
