# 설비·반응 데이터 재구성

## 1. 이 데이터의 의미

이 문서는 **2026-11-18 열람한 공개 커뮤니티 문서**에서 공통 기반 설비 30종과 생산 반응 18개를 재구성한 결과다. 원작 실행 파일이나 개발사 내부 데이터 테이블을 추출한 결과가 아니다. 실행 빌드 번호는 `null`로 두었다. 특정 정식 빌드 또는 공개 테스트 브랜치에 모든 값이 일치한다고 주장하지 않는다.

기본게임에서 출발한 공통 설비를 우선했다. 확장팩 전용 설비, 최근 추가 연료, 실험 브랜치 전용 레시피는 범위를 확정하기 전 포함하지 않는다. 최근 문서가 예전 공통 설비까지 수정할 수 있으므로 **설비 존재 범위와 개별 수치의 실행 빌드 검증은 별개의 문제**다.

원작의 설비 수치는 다음 세 층으로 나누어 사용한다.

| 층 | 목적 | 적용 규칙 |
|---|---|---|
| 원작 참조 데이터 | 공개 문헌의 수치 보관 | 현재 웹 게임 수치로 덮어쓰지 않음 |
| 웹 게임 현행 데이터 | 숨4.0 저장과 밸런스 재현 | 현행 코드의 단위와 수치를 유지 |
| 차기 규칙 데이터 | 고도화 구현의 조정안 | 참조값, 조정 이유, 변환식을 함께 저장 |

`facilities.json`의 모든 수치 객체에는 값·단위·출처 ID·URL·범위·증거 상태가 있다. `null`은 0과 다르다. 발전기의 음수 W는 생산, 소비 설비의 양수 W는 소비다. 터빈과 태양광의 음수 W는 최대 출력이며 항상 발생하는 양이 아니다.

## 2. 산소 계통

질량은 활성 상태의 게임 시간 1초당 kg이다. 온도 하한은 출력물에 대한 규칙이며 건물 발열과 따로 적용한다.

| 설비 | 크기 | 전력소비W | 입력 kg/s | 출력 kg/s | 고정발열 kDTU/s | 출처 |
|---|---|---:|---|---|---:|---|
| 산소 확산기 | 1×2 | 120 | 조류0.55 | 산소0.50 | 1.5 | [F01](https://oxygennotincluded.wiki.gg/wiki/Oxygen_Diffuser) |
| 전해조 | 2×2 | 120 | 물1.0 | 산소0.888, 수소0.112 | 1.25 | [F02](https://oxygennotincluded.wiki.gg/wiki/Electrolyzer) |
| 탈취기 | 1×1 | 5 | 여과재0.13333, 오염산소0.10 | 점토0.14333, 산소0.09 | 0.625 | [F03](https://oxygennotincluded.wiki.gg/wiki/Deodorizer) |
| 탄소 스키머 | 2×2 | 120 | 물1.0, CO₂0.30 | 오염수1.0 | 1 | [F04](https://oxygennotincluded.wiki.gg/wiki/Carbon_Skimmer) |
| 조류 배양기 | 1×2 | 0 | 조류0.03, 물0.30 | 산소0.04, 오염수0.29033 | 미확정 | [F05](https://oxygennotincluded.wiki.gg/wiki/Algae_Terrarium) |
| 녹 산소 발생기 | 2×3 | 60 | 녹0.75, 소금0.25 | 산소0.57, 염소0.03, 철광석0.40 | 1.125 | [F06](https://oxygennotincluded.wiki.gg/wiki/Rust_Deoxidizer) |

산소 확산기의 산소 출력 하한은30°C, 전해조의 두 기체는70°C, 녹 산소 발생기의 출력은75°C로 문서화되어 있다. 입력물이 이미 더 뜨거울 때의 처리는 개별 온도 규칙을 보존해야 한다. 단순히 주변 칸 온도를 일정값 올리는 방식은 출력물의 운반 열량을 재현하지 못한다. [F01–F02, F06]

조류 배양기는 CO₂ 약0.00033333 kg/s를 흡수하지만, CO₂가 없어도 산소 생산이 가능하다. 빛이 있으면 산소 출력이0.044 kg/s로 늘어난다. 따라서 CO₂를 필수 입력으로 넣거나 산소 증가분을 항상 다른 원소에서 빼는 모델은 문서의 동작과 달라진다. 해당 레시피는 조건부 수지로 보관하고 자동 보존 검사에서 별도 처리했다. [F05]

## 3. 발전과 저장

| 설비 | 크기 | 최대/가동출력W | 주요 연료 kg/s | 부산물 kg/s | 고정발열 kDTU/s | 출처 |
|---|---|---:|---|---|---:|---|
| 수동 발전기 | 2×2 | 400 | 대원 노동 | 없음 | 1 | [F07](https://oxygennotincluded.wiki.gg/wiki/Manual_Generator) |
| 석탄 발전기 | 3×3 | 600 | 석탄1 | CO₂0.02 | 9 | [F08](https://oxygennotincluded.wiki.gg/wiki/Coal_Generator) |
| 수소 발전기 | 4×3 | 800 | 수소0.1 | 없음 | 4 | [F09](https://oxygennotincluded.wiki.gg/wiki/Hydrogen_Generator) |
| 천연가스 발전기 | 4×3 | 800 | 천연가스0.09 | CO₂0.0225, 오염수0.0675 | 10 | [F10](https://oxygennotincluded.wiki.gg/wiki/Natural_Gas_Generator), [F11](https://oxygennotincluded.wiki.gg/wiki/Guide/Natural_Gas_Geysers) |
| 석유 발전기 | 3×4 | 2000 | 석유2 | CO₂0.5, 오염수0.75 | 20 | [F12](https://oxygennotincluded.wiki.gg/wiki/Petroleum_Generator) |
| 증기 터빈 | 5×3 | 0–850 | 증기 최대2 | 물=흡입한 증기량 | 4+흡수열의10% | [F28](https://oxygennotincluded.wiki.gg/wiki/Steam_Turbine) |
| 태양광 패널 | 7×3 | 0–380 | 일조 | 해당 없음 | 미확정 | [F29](https://oxygennotincluded.wiki.gg/wiki/Solar_Panel) |

수동 발전기의 주요 비용은 대원 점유시간이다. 입력 물질이 없다는 이유로 무제한 자동 전력으로 취급하면 연구·건설·보급의 선택 구조가 사라진다. 태양광380 W와 터빈850 W는 이름표 출력으로만 사용하고, 실제 시뮬레이션에는 일조량·증기량·온도·배출 가능 여부를 함께 적용한다. [F07, F28, F29]

| 배터리 | 크기 | 저장J | 손실J/주기 | 고정발열 kDTU/s | 출처 |
|---|---|---:|---:|---:|---|
| 소형 | 1×2 | 10,000 | 1,000 | 1.25 | [F13](https://oxygennotincluded.wiki.gg/wiki/Battery) |
| 대형 | 2×2 | 40,000 | 2,000 | 1.25 | [F14](https://oxygennotincluded.wiki.gg/wiki/Jumbo_Battery) |
| 스마트 | 2×2 | 20,000 | 400 | 0.5 | [F15](https://oxygennotincluded.wiki.gg/wiki/Smart_Battery) |

배터리 누설은 충전된 상태에만 적용하도록 상태를 정의한다. 스마트 배터리는 하한과 상한 사이에서 이전 신호를 유지하는 히스테리시스를 사용한다. 배터리 용량과 회로 최대 W는 다른 변수이며, 배터리 여러 개를 달았다는 이유만으로 전선 허용 부하가 늘어나서는 안 된다. [F13–F15, [F32](https://oxygennotincluded.wiki.gg/wiki/Guide/Power_Circuits)]

## 4. 유체 운반·정화

| 설비 | 크기 | 전력W | 처리량·용량 | 특기사항 | 출처 |
|---|---|---:|---|---|---|
| 액체 펌프 | 2×2 | 240 | 최대10 kg/s | 액체 침수 및 출력 공간 필요 | [F16](https://oxygennotincluded.wiki.gg/wiki/Liquid_Pump) |
| 기체 펌프 | 2×2 | 240 | 최대0.5 kg/s | 현재 문서의 고정 발열0 | [F17](https://oxygennotincluded.wiki.gg/wiki/Gas_Pump), [F34](https://onidb.wiki/buildings/gas-pump) |
| 액체 필터 | 3×1 | 120 | 연결 배관 패킷의 원소별 분기 | 물 정화와 다른 기능 | [F22](https://oxygennotincluded.wiki.gg/wiki/Liquid_Filter) |
| 기체 필터 | 3×1 | 120 | 연결 배관 패킷의 원소별 분기 | 전력이 없으면 통과 정지 | [F23](https://oxygennotincluded.wiki.gg/wiki/Gas_Filter) |
| 액체 저장고 | 2×3 | 0 | 5000 kg | 밀폐되지만 단열되지 않음 | [F30](https://oxygennotincluded.wiki.gg/wiki/Liquid_Reservoir) |
| 기체 저장고 | 5×3 | 0 | 1000 kg | 과거150 kg 자료 혼용 주의 | [F31](https://oxygennotincluded.wiki.gg/wiki/Gas_Reservoir) |

비공식 DB의 기체 펌프 상세에 있는 `Transport limit 1 kg/s`는 기체 배관 시스템의 처리 한계다. 펌프 고유 흡입량0.5 kg/s와 같은 필드로 읽으면 전해 시스템의 펌프 수와 소비전력을 잘못 계산한다. 본 데이터는 기체 펌프 처리율과 배관 대역폭을 분리한다. 발열0은 wiki.gg 인포박스와 별도 onidb.wiki 상세의 자체열·배기열0을 교차 확인했으나, 특정 실행 빌드에 대한 확정은 아니다. [F17, F34]

| 정화 레시피 | 입력 kg/s | 출력 kg/s | 전력W | 출처 |
|---|---|---|---:|---|
| 물 정화기 | 오염수5, 여과재1 | 물5, 오염흙0.2 | 120 | [F18](https://oxygennotincluded.wiki.gg/wiki/Water_Sieve) |
| 담수화: 소금물 | 소금물5 | 물4.65, 소금0.35 | 480 | [F19](https://oxygennotincluded.wiki.gg/wiki/Desalinator) |
| 담수화: 염수 | 염수5 | 물3.5, 소금1.5 | 480 | [F19](https://oxygennotincluded.wiki.gg/wiki/Desalinator) |

물 정화기는 오염수의 물질 종류를 바꿔도 세균을 제거하지 않는다. `elementId=water`와 `germs=0`을 같은 상태로 취급하면 안 된다. 필터는 원소 분류, 정화기는 반응, 살균은 병원체 감소라는 서로 다른 연산으로 설계한다. [F18]

## 5. 생산·열 관리

| 설비 | 크기 | 전력W | 핵심 규칙 | 출처 |
|---|---|---:|---|---|
| 조류 증류기 | 3×4 | 120 | 슬라임0.6→조류0.2+오염수0.4 kg/s | [F24](https://oxygennotincluded.wiki.gg/wiki/Algae_Distiller) |
| 정유기 | 4×4 | 480 | 원유10→석유5+천연가스0.09 kg/s, 대원 필요 | [F25](https://oxygennotincluded.wiki.gg/wiki/Oil_Refinery) |
| 금속 제련기 | 3×4 | 1200 | 대표 금속광석100→금속100 kg, 기본40초 | [F26](https://oxygennotincluded.wiki.gg/wiki/Metal_Refinery) |
| 암석 분쇄기 | 4×4 | 240 | 대표 광석100→금속50+모래50 kg, 기본40초 | [F27](https://oxygennotincluded.wiki.gg/wiki/Rock_Crusher) |
| 액체 냉각기 | 2×2 | 1200 | 액체 패킷−14°C, 제거한 열을 장치로 전달 | [F20](https://oxygennotincluded.wiki.gg/wiki/Thermo_Aquatuner) |
| 기체 냉각기 | 2×2 | 240 | 기체 패킷−14°C, 제거한 열을 장치로 전달 | [F21](https://oxygennotincluded.wiki.gg/wiki/Thermo_Regulator) |

제련기의 기본40초는 대원 능력에 따라 달라진다. 배치형 입력100 kg을 고정100/40 kg/s 연속 입력으로 바꾸면 작업 중단·예약·물류·능력 상승 시 의미가 바뀐다. 냉각액400 kg은 레시피마다 열을 받아 되돌아오는 흐름이며, 매번 소멸하는 재료로 계산하지 않는다. [F26]

암석 분쇄기 페이지는 자체적으로 오래된 문서 경고를 표시한다. 해당 행의 증거 상태는 `documented_community_version_uncertain`이다. 이것은 참조 후보이며, 최신 정식 빌드 확인을 완료했다는 표시가 아니다. [F27]

## 6. 원작에서 질량이 보존되지 않는 경우

공개 설비 규칙을 그대로 적용하면 일부 반응은 입력 질량보다 출력 질량이 작다. 이 차이를 버그로 보고 임의 부산물을 추가하면 원작 플레이 수지가 달라진다. 반대로 기록 없이 삭제하면 구현 버그와 의도된 게임 규칙을 구별할 수 없다.

| 반응 | 입력합 kg/s | 출력합 kg/s | 명시적 소멸 kg/s | 출처 |
|---|---:|---:|---:|---|
| 산소 확산 | 0.55 | 0.50 | 0.05 | F01 |
| 탄소 제거 | 1.30 | 1.00 | 0.30 | F04 |
| 석탄 발전 | 1.00 | 0.02 | 0.98 | F08 |
| 수소 발전 | 0.10 | 0 | 0.10 | F09 |
| 석유 발전 | 2.00 | 1.25 | 0.75 | F12 |
| 오수 정화 | 6.00 | 5.20 | 0.80 | F18 |
| 정유 | 10.00 | 5.09 | 4.91 | F25 |

이 소멸 열은 자료의 입력·출력 숫자에서 계산한 **파생 분석값**이다. 원작에 별도 `sink` 원소가 존재한다는 뜻이 아니다. `mass_policy=intentional_sink`와 별도 원장 항목으로 저장한다.

검산식:

```text
입력합 - 출력합 - 명시소멸 = 0
```

18개 레시피 중17개가 균형식 또는 명시소멸을 포함한 검산을 통과한다. 조류 배양기1개는 선택적CO₂ 흡수·조명 보너스·표시 반올림 때문에 별도 조건부 레시피로 남겼다. [reaction-checks.json](../data/reaction-checks.json)

## 7. 남겨 둔 결측과 검증 범위

- 고정발열을 회수하지 못한 항목은 `null`이다. 표에 열 항목이 없다는 이유로0을 넣지 않는다.
- 배터리는 고정 전력소비 W가 `not_applicable`이며 저장J·누설J/주기를 사용한다.
- 원작 소스코드의 필드명과 내부 타일 포트 좌표는 이번 자료의 확정 범위가 아니다.
- 최근 확장 연료와 증기 터빈의 추가 재료는 범위가 불명확하므로 자동으로 예전 기본게임에 적용하지 않는다.
- 원소·재료별 열용량과 출력 온도 규칙을 결합하기 전에는 명목 발열 표만으로 기지 총열량을 예측하지 않는다.
- 이번 수치는 웹 구현에 아직 주입하지 않았다. 구현 단계에서는 단위 변환, 작업 예약, 포트 방향, 배출 막힘, 저장 이행부터 검증한다.

## 8. 파일 목록

- [facilities.json](../data/facilities.json): 수치 필드별 출처를 포함한30개 설비.
- [facilities.csv](../data/facilities.csv): 비교용 핵심 숫자 표. 상세 근거는 JSON을 기준으로 한다.
- [reactions.json](../data/reactions.json):18개 생산/정화 반응, 배치/연속 구분 및 수지 정책.
- [sources-facilities.json](../data/sources-facilities.json):34개 근거 레지스트리, 검색 회수 방식과 빌드 한계.
- [reaction-checks.json](../data/reaction-checks.json): 수지 검사 결과.
- [balance-scenarios.json](../data/balance-scenarios.json): 전해·8명호흡·펌핑전력·탄소제거루프·냉각·터빈의6개 파생 계산.
- [통합 검증기](../tools/validate.mjs): 데이터 구조·출처·수지와 파생 계산을 점검하는 스크립트.
