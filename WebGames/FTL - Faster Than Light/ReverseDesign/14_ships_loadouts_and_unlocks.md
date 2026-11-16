# 14. 플레이어 함선·초기 구성·해금

> 범위: FTL 본편 및 Advanced Edition, 모드 제외. 확인일: 2026-11-13. [확인]은 공개 자료의 함선·해금 규칙, [해석]은 플레이 유형 분석, [재구성안]은 데이터 설계다. 모든 장비의 전체 원본 데이터 덤프를 제공하는 문서는 아니다.

## 1. 시스템 역할

함선 선택은 외형 선택이 아니라 한 런의 출발 조건 선택이다. 같은 종착점에 도달하더라도 시작 무기, 종족, 특수 시스템, 방 배치, 없는 시설에 따라 해결해야 할 첫 문제가 달라진다.

**[해석]** 성장의 상당 부분은 현재 약점을 메우는 과정에서 발생한다. 특정 함선이 강력한 도구로 시작하더라도 다른 도구가 없으면 첫 상점과 첫 업그레이드의 의미가 달라진다. A→B→C를 단순한 상위 성능 단계로 해석해서는 안 된다.

## 2. 구성 단위

**[확인]** 플레이어 함종은 10종이다. 기본 8함종은 A/B/C, Crystal과 Lanius는 A/B를 제공하여 합계 28레이아웃이다. 플레이어 함선의 최대 선체는 30으로 공통이지만 인원, 초기 장비, 시스템, 전력, 슬롯, 방 배치는 다르다. [S01–S02]

| 단위 | 의미 | 재구성 시 분리할 데이터 |
|---|---|---|
| 함종 | Kestrel·Engi 등 큰 계열 | 업적 집합·해금 관계 |
| 레이아웃 | A/B/C의 구체적 시작 조건 | 공간·장비·인원·설비 |
| 함선 이름 | 기본 이름 또는 사용자 이름 | 표시 문자열 |
| 런 상태 | 진행 중 얻은 장비·피해·숙련 | 시작 템플릿과 별도 저장 |
| 프로필 | 해금·기록·업적 | 런 실패와 독립한 저장 범위 |

기본 이름이 같은 문자열이라고 함선 ID로 사용하지 않는다. 사용자가 함선 이름을 바꾸어도 해금·업적 판정이 달라져서는 안 된다.

## 3. 28레이아웃 비교

`초기 핵심`은 확인 가능한 시작 요소를 요약했다. `설계상 과제`는 **[해석]**이며 고정 공략이나 절대적인 난이도 순위가 아니다. 무기 전체 목록·전력 전체 목록 대신 각 레이아웃을 구분하는 요소를 기록한다. [S03–S12]

| 함종·형 | 기본 이름 | 초기 핵심 | 설계상 과제 |
|---|---|---|---|
| Kestrel A | The Kestrel | Burst Laser II + Artemis | 일반 실드와 미사일의 역할 분담을 학습 |
| Kestrel B | Red-Tail | Basic Laser 4기, 혼합 종족 | 많은 발사체를 묶어 방어층을 벗김 |
| Kestrel C | The Swallow | Dual Lasers·Ion Stunner·클론 | 이온·기절·인원 회복의 연결 |
| Engi A | The Torus | Ion Blast II + 공격 드론 | 방어 억제와 실제 선체 피해원을 분리 |
| Engi B | The Vortex | Engi 1명, 선내 드론 | 조작·수리·방어의 인력 부족 해결 |
| Engi C | Tetragon | 해킹·빔 드론·Dual Lasers | 소모품과 제어 기능을 화력으로 변환 |
| Federation A | The Osprey | Artillery Beam·Burst Laser II | 일반 무장과 장주기 특수 화력 병행 |
| Federation B | Nisos | 강화된 초기 Artillery·보조 무장 | 포격 주기를 버틸 방어·전력 계획 |
| Federation C | The Fregatidae | Flak Artillery·텔레포터·클론 | 침투와 자동 특수 사격의 위험한 동시 운용 |
| Zoltan A | The Adjudicator | 특수 실드·Halberd Beam | 보호층이 유지되는 동안 첫 유효 공격 준비 |
| Zoltan B | Noether | 특수 실드·이온·Pike Beam | 이온 유지와 일반 실드 용량 보완 |
| Zoltan C | Cerenkov | 반응로 2·Zoltan 4명·배터리 | 이동하는 전력과 임시 전력의 공백 관리 |
| Mantis A | The Gila Monster | 텔레포터·Mantis 중심 인원 | 침투 성공과 자함 유지의 인력 분배 |
| Mantis B | The Basilisk | 4인 전송실·방어 드론·초기 무기 없음 | 방어를 기반으로 승무원 제거 경로 확보 |
| Mantis C | The Theseus | 4인 전송실·클론·봉쇄/기절 폭탄 | 제어 효과와 서로 다른 종족의 침투 결합 |
| Slug A | Man of War | Anti-Bio Beam 등 | 선체 파괴와 승무원 제거 목표를 선택 |
| Slug B | The Stormwalker | 텔레포터·Healing Burst·의료실 없음 | 탄약·회복·침투를 함께 관리 |
| Slug C | Ariolimax | 해킹·정신 지배·Chain Burst Laser | 약한 초기 화력을 제어 조합으로 보완 |
| Rock A | Bulwark | 미사일 중심 무장 | 탄약 지출과 지속 가능한 화력 확보 |
| Rock B | Shivan | 화재 무장·에어록 없음 | 배기 대신 인원·시설로 화재와 침입 대응 |
| Rock C | Tektite | Crystal 승무원·클론·결정 무기 | 특수 종족·관통·이벤트 접근의 혼합 |
| Stealth A | The Nesasio | 은폐·Dual Lasers·Mini Beam·일반 실드 없음 | 피격 전 제압과 은폐 타이밍 |
| Stealth B | DA-SR 12 | Glaive Beam·은폐·일반 실드 없음 | 긴 첫 충전 시간 동안 기능 유지 |
| Stealth C | Simo-H | 특수 실드 드론·일반 실드/은폐 없음 | 드론 제어에 방어가 집중되는 구조 |
| Lanius A [AE] | Kruos | Lanius·해킹·클론 | 산소 구역 분리와 시설 제어 |
| Lanius B [AE] | The Shrike | Lanius 침투·정신 지배·Advanced Flak | 무산소 공간과 수적 우세를 결합 |
| Crystal A | Bravais | 결정 무기·Crystal 승무원 | 관통 특성과 공간 통제를 성장에 연결 |
| Crystal B | Carnelian | 4인 전송실·은폐·초기 무기 없음 | Lockdown과 침투를 주력 승리 수단으로 사용 |

### 3.1 같은 특수 시스템도 시작 조건이 다르면 역할이 달라진다

**[해석]** Engi C의 해킹은 소수의 직접 화력을 보완하고, Slug C의 해킹은 정신 지배와 인원 이동을 묶는다. Stealth A와 B는 둘 다 은폐로 시작하지만 첫 발사까지 기다려야 하는 시간이 달라 방어 타이밍도 달라진다. 레이아웃을 단순히 기본 함선에 장비 몇 개를 바꾼 색상 변형으로 취급하지 않아야 한다.

## 4. 해금 규칙

### 4.1 공통 규칙

**[확인]** 시작 시 Kestrel A를 사용할 수 있다. Kestrel로 섹터 5에 도달하면 Engi를 해금한다. 다른 주요 A형은 관련 이벤트 경로 또는 이전 함종으로의 승리 경로가 있다. B형은 해당 함종 전용 업적 3개 중 2개, C형은 AE 콘텐츠를 켠 상태에서 해당 B형으로 섹터 8에 도달하는 조건이다. C형은 그 런의 최종 승리까지 요구하지 않는다. [S01, S13]

| 대상 | 조건 요약 | 흔한 오해 |
|---|---|---|
| Engi A | Kestrel로 섹터 5 도달 | 반드시 최종 보스 처치 필요 |
| 일반 B형 | 함종 전용 업적 3개 중 2개 | 모든 업적 완료 또는 A형 승리 필요 |
| 일반 C형 | AE on, 대응 B형으로 섹터 8 도달 | B형으로 최종 승리해야 함 |
| Lanius A | Kestrel 외 4함종 해금 | 레이아웃 4개만 추가해도 됨 |
| Crystal A | 특수 퀘스트 또는 별도 승리 수집 | C형까지 모두 클리어해야 함 |

**[확인]** Lanius와 Crystal은 C형이 없다. Crystal의 대체 해금은 Lanius를 제외한 기존 함선 A/B 승리 기록을 요구한다. 이를 초기 기본 8함종의 A/B로 표현하면 16개 승리 기록이다. [S11, S12, S13]

### 4.2 함종 승리 연결

| 얻을 함종 | 승리 경로의 선행 함종 | 별도 이벤트 접근 |
|---|---|---|
| Federation | Engi | Rebel Stronghold의 관련 조우 |
| Zoltan | Federation | Zoltan Homeworlds의 외교 조우 |
| Mantis | Zoltan | Mantis Homeworlds의 전설적 도적 조우 |
| Slug | Mantis | Slug Home Nebula의 관련 조우 |
| Rock | Slug | Rock Homeworlds의 도전 조우 |
| Stealth | Rock | Engi Homeworlds의 함선 관련 연쇄 |

이 표는 경로 구조만 정리한다. 이벤트별 세부 장비·대화·승무원 조건은 별도 이벤트 데이터와 함께 검증해야 한다. 특히 “해당 섹터에 가기만 하면 해금”으로 구현하지 않는다. [S05–S10, S13]

### 4.3 퀘스트와 승리 경로를 함께 둔 의미

**[해석]** 퀘스트는 특별한 발견과 세계관 경험을 만들지만 필요한 조우를 만나지 못할 수 있다. 승리 기록 경로는 반복 플레이의 실력과 진행 성취를 해금으로 연결한다. 개발자 Justin의 AE 사전 논의에서도 기존 퀘스트에 다른 해금 경로를 더하는 방향이 제시되었다. 다만 사전 제안의 문구와 실제 출시 조건은 구별해야 한다. [S14]

## 5. 업적을 콘텐츠 학습 과제로 사용

**[해석]** 함종별 업적은 그 함선의 특수 규칙을 사용해 보게 하는 학습 장치다. 침투 함선은 승무원 제거를, 특수 포격 함선은 해당 포격 운용을, 결정 함선은 봉쇄를 시험하게 한다. 이를 단순 누적 점수 과제만으로 바꾸면 레이아웃 해금과 플레이 방식의 관계가 약해진다.

**[재구성안]** 업적 조건은 아래 범위를 명시한다.

| 범위 | 예시 구조 | 저장·초기화 시점 |
|---|---|---|
| 순간 조건 | 같은 시점에 특정 시스템 활성 | 상태 변화 시 평가 |
| 한 전투 | 피해 없이 지정 방식으로 승리 | 조우 시작 때 초기화 |
| 한 런 | 특정 섹터 전 누적 목표 | 런 시작 때 초기화 |
| 프로필 | 여러 함선으로 승리 | 프로필에 영구 기록 |

무기 사격과 드론 사격을 같은 피해자로 합산하거나, 승무원 제거와 선체 파괴를 같은 승리 이벤트로 합치면 업적 오류가 생긴다. [20. 콘텐츠 제작](20_content_authoring_and_tools.md)에서 조건 언어를 재사용할 수 있다.

## 6. 시작 템플릿과 런 복제

**[재구성안]** 시작 함선은 읽기 전용 템플릿이며, 새 게임은 이를 깊은 복사하여 런 상태를 만든다.

```json
{
  "classId": "kestrel",
  "layoutId": "kestrel_a",
  "displayNameKey": "ship.kestrel_a",
  "layoutAssetId": "kestrel_a_rooms",
  "loadoutId": "kestrel_a_start",
  "crewTemplateId": "kestrel_a_crew",
  "unlockRuleId": "available_at_start",
  "achievementSetId": "kestrel_class"
}
```

시작 무기와 상점에서 얻는 유사한 이름의 무기가 서로 다른 변형일 수 있으므로 화면 이름만으로 합치지 않는다. 개별 장비 변형은 [08](08_weapons_shields_and_targeting.md)의 안정적 ID를 참조한다.

### 해금 처리의 재구성 예

1. 도달·승리·업적 완료 사건이 발생한다.
2. 사건에 함종·레이아웃·난이도·AE 플래그를 포함한다.
3. 아직 해금되지 않은 조건만 평가한다.
4. 만족한 해금 목록을 하나의 프로필 트랜잭션으로 기록한다.
5. 중복 없이 획득 UI를 보여 준다.
6. 런 저장과 별도로 프로필 상태를 유지한다.

실패 후에도 무엇이 남는지는 사용자 경험의 핵심이므로, 원작 실행 검증으로 실제 프로필 반영 시점을 확인한 뒤 동일한 정책을 사용한다.

## 7. 밸런스 분석

**[해석]** 시작 자산의 스크랩 합계만으로 레이아웃의 난이도를 판단하면 다음 차이를 놓친다.

- 첫 전투부터 사용할 수 있는 완성된 조합인지, 상점에서 추가 장비를 구해야 하는지.
- 피해를 줄 공격 경로가 하나인지 여러 개인지.
- 핵심 시설이 한 번 고장 나면 전체 전략이 멈추는지.
- 무인함선·특수 실드·침투 등 특정 상대에게 대응할 최소 수단이 있는지.
- 초반 회복·수리·탄약 비용이 이후 성장 자금을 얼마나 잠식하는지.

**[재구성안]** 레이아웃 검수에서는 `첫 유효 공격 시간`, `단일 시스템 고장 민감도`, `자원 1개당 기대 전투 수`, `초반 보완 구매 요구`, `정보·제어 수단 수`를 함께 기록한다. 이 지표는 원작에 존재하는 숨은 점수가 아니라 비교를 위한 분석 도구다.

## 8. QA·수용 기준

| ID | 조건 | 기대 결과 |
|---|---|---|
| SHIP-01 | 전체 목록 생성 | 10함종·28레이아웃, C형 예외 정확 |
| SHIP-02 | 함선 이름 변경 | 해금·업적 조건의 ID 유지 |
| SHIP-03 | B형으로 섹터 8 도달, AE off | AE 조건이 필요한 C형 해금과 구별 |
| SHIP-04 | AE on B형 섹터 8 도달 후 실패 | 실제 원작 프로필 반영 시점과 대조 |
| SHIP-05 | 한 함종에서 A/B/C만 해금 | Lanius 조건에서 함종 수와 레이아웃 수 구별 |
| SHIP-06 | Crystal 대체 경로 | C형·Lanius·미해금 Crystal의 순환 의존 없음 |
| SHIP-07 | 새 런 연속 생성 | 이전 런 장비·손상·해제된 시스템이 누적되지 않음 |
| SHIP-08 | 초기 의료실·실드가 없는 레이아웃 | 공통 기본값이 누락 시스템을 자동 설치하지 않음 |
| SHIP-09 | 함종 업적 두 개 완료 | 관련 없는 일반 업적을 개수에 포함하지 않음 |
| SHIP-10 | 해금 저장 직후 다시 같은 사건 발생 | 알림·보상 중복 없음 |

## 9. 출처·검증 범위

다음 Fandom 자료는 직접 열기에 제한이 있어 검색 색인에서 반환된 레이아웃·시작 구성·해금 본문을 확인했다. 전 함선의 원작 화면과 데이터 파일을 직접 대조하지는 않았다.

- [S01 Ship](https://ftl.fandom.com/wiki/Ship)
- [S02 Guides and tips](https://ftl.fandom.com/wiki/Guides_and_tips): 레이아웃·기본 이름 대조.
- [S03 The Kestrel Cruiser](https://ftl.fandom.com/wiki/The_Kestrel_Cruiser)
- [S04 The Engi Cruiser](https://ftl.fandom.com/wiki/The_Engi_Cruiser)
- [S05 The Federation Cruiser](https://ftl.fandom.com/wiki/The_Federation_Cruiser)
- [S06 The Zoltan Cruiser](https://ftl.fandom.com/wiki/The_Zoltan_Cruiser)
- [S07 The Mantis Cruiser](https://ftl.fandom.com/wiki/The_Mantis_Cruiser)
- [S08 The Slug Cruiser](https://ftl.fandom.com/wiki/The_Slug_Cruiser)
- [S09 The Rock Cruiser](https://ftl.fandom.com/wiki/The_Rock_Cruiser)
- [S10 The Stealth Cruiser](https://ftl.fandom.com/wiki/The_Stealth_Cruiser)
- [S11 The Lanius Cruiser](https://ftl.fandom.com/wiki/The_Lanius_Cruiser)
- [S12 The Crystal Cruiser](https://ftl.fandom.com/wiki/The_Crystal_Cruiser)
- [S13 Quick reference on unlocking ships](https://steamcommunity.com/sharedfiles/filedetails/?id=153931618): 해금 교차 확인, 검색 색인 확인.
- [S14 개발자 AE 해금 사전 논의](https://new.subsetgames.com/forum/viewtopic.php?p=61003): 출시 전 설계 배경. 직접 열기는 403, 검색 색인 본문 확인.
- [S15 Stealth C 플레이 기록](https://sullla.com/FTL/stealthc.html): 일반 실드·은폐 부재의 교차 확인.

**[검증 필요]** 모든 레이아웃의 전체 시작 소모품·시설 막대·상점 가격, 특수 무기 변형의 식별자, 프로필 기록 반영 프레임, 이벤트별 해금의 모든 선행 조건은 구현 직전 원작 화면 또는 합법적으로 보유한 게임 데이터와 대조한다.

[목차로 돌아가기](README.md)
