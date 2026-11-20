# 12. 복원된 데이터의 실제 표본과 검토 방법

**기준:** Data Dragon **16.22.1**, 기본 로케일 `ko_KR`. 비교 데이터는 **16.21.1**이다. 이 문서는 동봉한 공식 정규화 데이터에서 대표 값을 그대로 읽어 제시한다. 공개 패치 명칭 `26.22`와 정적 데이터 빌드 `16.22.1`은 별도 식별자다.

전체 파일을 먼저 열지 않아도 어떤 수치를 실제로 확보했는지 검토할 수 있도록, 챔피언 6명·최상위 QWER 24개·아이템 5종·구조화 변경 11건을 골랐다. 영웅 이름과 스킬 이름은 원본 식별을 위한 것이며, 이 표를 기존 웹 프로토타입에 적용하거나 게임 규칙을 변경한 것은 아니다.

관련 문서: [08. 데이터 복원 계약](08_data_restoration_contract.md) · [09. 스킬 런타임 재구축](09_skill_runtime_reconstruction.md) · [10. 프로토타입 차이와 구현 순서](10_prototype_gap_and_roadmap.md) · [11. 검증과 관측 계획](11_qa_and_measurement_plan.md)

## 1. 챔피언 6명의 기초 스탯

다음은 `champions.json`의 기초 스탯 필드다. 룬·아이템·패시브·성장·현재 버프를 합산한 실제 경기 표시값은 아니다. 특히 `attackdamage`만으로 챔피언 고유 계산 이후의 최종 공격력을 확정하지 않는다. 정규화 원본: [champions.json](../data/champions.json), [champion_stats.csv](../data/champion_stats.csv).

| 챔피언 / key | HP | AD | 방어력 | MR | 이동 속도 | 공격 사거리 | 원본 stats 포인터 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 아리 / `Ahri` | 590 | 53 | 21 | 30 | 330 | 550 | `/data/Ahri/stats` |
| 애쉬 / `Ashe` | 610 | 59 | 26 | 33 | 325 | 600 | `/data/Ashe/stats` |
| 가렌 / `Garen` | 690 | 69 | 38 | 32 | 340 | 175 | `/data/Garen/stats` |
| 럭스 / `Lux` | 580 | 54 | 21 | 30 | 330 | 550 | `/data/Lux/stats` |
| 리 신 / `LeeSin` | 645 | 66 | 36 | 32 | 345 | 125 | `/data/LeeSin/stats` |
| 진 / `Jhin` | 655 | 61 | 24 | 33 | 330 | 550 | `/data/Jhin/stats` |

출처: [16.22.1 ko_KR champion.json](https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/champion.json). 각 행의 stats 포인터 아래 `hp`, `attackdamage`, `armor`, `spellblock`, `movespeed`, `attackrange` 순서다. `MR`은 원본 필드 `spellblock`에 대응한다.

예를 들어 아리 HP 590의 정확한 원본 위치는 `/data/Ahri/stats/hp`이고, 리 신의 공격 사거리 125는 `/data/LeeSin/stats/attackrange`다. 여기서 사거리는 저장된 기초 필드이며, 대상을 향한 실제 공격 가능 판정에 쓰이는 모든 반경·상태 조건을 표현하지 않는다.

## 2. 실제 QWER 랭크 배열

배열의 첫 원소는 **스킬 랭크 1**이다. Q/W/E는 여기서 각각 5개, R은 3개 원소를 갖는다. 쿨다운은 초 단위 원본값이며, 비용은 아래에 표시한 챔피언 자원에 관한 정적 `cost` 배열이다. 스킬 가속·모드 보정·재시전 비용·재충전·피해 계수를 이 배열만으로 계산하지 않는다.

각 스킬 표의 `i`는 원본 `/data/{championKey}/spells/{i}`의 0부터 시작하는 인덱스다. 해당 노드의 `cooldown`, `cost`, `range`가 세 배열의 출처이며, 배열 원소까지 확인하려면 뒤에 `/0`, `/1` 등을 붙인다. 예: 아리 Q 1랭크 비용은 `/data/Ahri/spells/0/cost/0`이다. 정규화 원본: [champion_spells.json](../data/champion_spells.json), [spell_ranks.csv](../data/spell_ranks.csv).

### 2.1. 아리 · Ahri

자원 표기: **마나**. [공식 상세 JSON](https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/champion/Ahri.json) · 포인터 기준 `/data/Ahri/spells`.

| 슬롯 | 스킬 | 쿨다운(초) | 비용 | range 원본값 | i |
| --- | --- | --- | --- | --- | --- |
| Q | 현혹의 구슬 | `[7, 7, 7, 7, 7]` | `[55, 65, 75, 85, 95]` | `[970, 970, 970, 970, 970]` | 0 |
| W | 여우불 | `[9, 8, 7, 6, 5]` | `[30, 30, 30, 30, 30]` | `[700, 700, 700, 700, 700]` | 1 |
| E | 매혹 | `[12, 12, 12, 12, 12]` | `[60, 60, 60, 60, 60]` | `[975, 975, 975, 975, 975]` | 2 |
| R | 혼령 질주 | `[140, 120, 100]` | `[100, 100, 100]` | `[450, 450, 450]` | 3 |

### 2.2. 애쉬 · Ashe

자원 표기: **마나**. [공식 상세 JSON](https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/champion/Ashe.json) · 포인터 기준 `/data/Ashe/spells`.

| 슬롯 | 스킬 | 쿨다운(초) | 비용 | range 원본값 | i |
| --- | --- | --- | --- | --- | --- |
| Q | 궁사의 집중 | `[0, 0, 0, 0, 0]` | `[30, 30, 30, 30, 30]` | `[400, 400, 400, 400, 400]` | 0 |
| W | 일제 사격 | `[18, 14.5, 11, 7.5, 4]` | `[75, 70, 65, 60, 55]` | `[1200, 1200, 1200, 1200, 1200]` | 1 |
| E | 매 날리기 | `[5, 5, 5, 5, 5]` | `[0, 0, 0, 0, 0]` | `[25000, 25000, 25000, 25000, 25000]` | 2 |
| R | 마법의 수정화살 | `[100, 80, 60]` | `[100, 100, 100]` | `[25000, 25000, 25000]` | 3 |

### 2.3. 가렌 · Garen

자원 표기: **없음**. [공식 상세 JSON](https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/champion/Garen.json) · 포인터 기준 `/data/Garen/spells`.

| 슬롯 | 스킬 | 쿨다운(초) | 비용 | range 원본값 | i |
| --- | --- | --- | --- | --- | --- |
| Q | 결정타 | `[8, 8, 8, 8, 8]` | `[0, 0, 0, 0, 0]` | `[300, 300, 300, 300, 300]` | 0 |
| W | 용기 | `[22, 19.5, 17, 14.5, 12]` | `[0, 0, 0, 0, 0]` | `[0, 0, 0, 0, 0]` | 1 |
| E | 심판 | `[9, 8.25, 7.5, 6.75, 6]` | `[0, 0, 0, 0, 0]` | `[325, 325, 325, 325, 325]` | 2 |
| R | 데마시아의 정의 | `[120, 100, 80]` | `[0, 0, 0]` | `[400, 400, 400]` | 3 |

### 2.4. 럭스 · Lux

자원 표기: **마나**. [공식 상세 JSON](https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/champion/Lux.json) · 포인터 기준 `/data/Lux/spells`.

| 슬롯 | 스킬 | 쿨다운(초) | 비용 | range 원본값 | i |
| --- | --- | --- | --- | --- | --- |
| Q | 빛의 속박 | `[10, 10, 10, 10, 10]` | `[50, 50, 50, 50, 50]` | `[1175, 1175, 1175, 1175, 1175]` | 0 |
| W | 프리즘 보호막 | `[12, 11.5, 11, 10.5, 10]` | `[60, 65, 70, 75, 80]` | `[1150, 1150, 1150, 1150, 1150]` | 1 |
| E | 광휘의 특이점 | `[10, 9.5, 9, 8.5, 8]` | `[70, 80, 90, 100, 110]` | `[1100, 1100, 1100, 1100, 1100]` | 2 |
| R | 최후의 섬광 | `[60, 50, 40]` | `[100, 100, 100]` | `[3340, 3340, 3340]` | 3 |

### 2.5. 리 신 · LeeSin

자원 표기: **기력**. [공식 상세 JSON](https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/champion/LeeSin.json) · 포인터 기준 `/data/LeeSin/spells`.

| 슬롯 | 스킬 | 쿨다운(초) | 비용 | range 원본값 | i |
| --- | --- | --- | --- | --- | --- |
| Q | 음파 / 공명의 일격 | `[10, 9, 8, 7, 6]` | `[50, 50, 50, 50, 50]` | `[1100, 1100, 1100, 1100, 1100]` | 0 |
| W | 방호 / 강철의 의지 | `[8, 8, 8, 8, 8]` | `[50, 50, 50, 50, 50]` | `[700, 700, 700, 700, 700]` | 1 |
| E | 폭풍/무력화 | `[8, 8, 8, 8, 8]` | `[50, 50, 50, 50, 50]` | `[450, 450, 450, 450, 450]` | 2 |
| R | 용의 분노 | `[110, 85, 60]` | `[0, 0, 0]` | `[375, 375, 375]` | 3 |

### 2.6. 진 · Jhin

자원 표기: **마나**. [공식 상세 JSON](https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/champion/Jhin.json) · 포인터 기준 `/data/Jhin/spells`.

| 슬롯 | 스킬 | 쿨다운(초) | 비용 | range 원본값 | i |
| --- | --- | --- | --- | --- | --- |
| Q | 춤추는 유탄 | `[7, 6.5, 6, 5.5, 5]` | `[40, 45, 50, 55, 60]` | `[550, 550, 550, 550, 550]` | 0 |
| W | 살상연희 | `[12, 12, 12, 12, 12]` | `[50, 55, 60, 65, 70]` | `[3000, 3000, 3000, 3000, 3000]` | 1 |
| E | 강제 관람 | `[2, 2, 2, 2, 2]` | `[30, 30, 30, 30, 30]` | `[750, 750, 750, 750, 750]` | 2 |
| R | 커튼 콜 | `[120, 105, 90]` | `[100, 100, 100]` | `[25000, 25000, 25000]` | 3 |

### 2.7. 배열을 동작 규칙으로 바꾸기 전에 확인할 부분

| 관측한 원본 | 확인된 범위 | 아직 이 값으로 확정할 수 없는 것 |
|---|---|---|
| 애쉬 Q `cooldown=[0,0,0,0,0]` | 정적 쿨다운 필드가 0 | 무조건 매 프레임 발동 가능하다는 의미가 아님. `maxstacks`, `stackduration` 등 미해결 참조가 있음. |
| 애쉬 E `cooldown=[5,5,5,5,5]` | 해당 쿨다운 필드가 5 | 미해결 `chargecooldown`이 별도로 있어, 이 5초를 충전 한 개의 회복 시간으로 대체할 수 없음. |
| 진 E `cooldown=[2,2,2,2,2]` | 해당 쿨다운 필드가 2 | `ammorechargeratetooltip`이 미해결이므로 탄약 재충전을 2초로 확정할 수 없음. |
| 애쉬 E/R, 진 R의 `range=25000` | 클라이언트 메타데이터에 25,000이 기록됨 | 특별한 표기·상한·sentinel 후보인지, 실제 모든 탄환의 비거리인지 독립 검증 필요. |
| 가렌 W `range=[0,0,0,0,0]` | 원본 사거리 필드가 0 | 효과가 없다는 뜻이 아님. 보호막·저항·피해 감소 등 효과값을 이 0으로 대체하지 않음. |
| 리 신 Q/W/E 각각 한 개의 배열 | 최상위 스킬 항목의 필드 확보 | 재시전의 별도 비용·사거리·대상 조건·실행 순서를 전부 복원했다는 의미가 아님. |

`0`, 빈 배열, `null`은 서로 다르다. 위 표의 0은 원본에 기록된 숫자다. `vars=[]`는 계수 목록이 비어 있다는 뜻이며, 미해결 토큰의 `numeric_value=null`은 값을 확정하지 못했다는 뜻이다. null을 숫자 0으로 치환하지 않는다.

### 2.8. 피해 공식에서 남은 공백의 실제 예

| 스킬 | 확정하지 못한 원본 변수 식별자 | 공식 상세 JSON 내 스킬 포인터 |
| --- | --- | --- |
| 아리 Q | `totaldamage` | `/data/Ahri/spells/0` |
| 가렌 Q | `totaldamage` | `/data/Garen/spells/0` |
| 럭스 Q | `totaldamagett` | `/data/Lux/spells/0` |
| 리 신 Q | `initialdamage`, `recastdamage`, `empowereddamage` | `/data/LeeSin/spells/0` |
| 진 R | `damagecalc`, `maxincreasecalc`, `fourthshotmultiplier*100` | `/data/Jhin/spells/3` |

전체 목록은 [spell_template_tokens.csv](../data/spell_template_tokens.csv)와 [스킬 재구축 문서](09_skill_runtime_reconstruction.md)를 참고한다. 이처럼 쿨다운·비용·사거리 배열은 확보했어도, 피해 공식·적용 횟수·대상별 보정은 별도 근거가 필요하다.

## 3. 아이템 5종의 가격과 조합

가격 단위는 골드다. `gold.total`은 원본 총가격, `gold.base`는 추가 조합 비용으로 사용되는 필드, `gold.sell`은 원본 판매가격이다. 기본 아이템은 정규화된 `from_ids`가 빈 배열일 수 있다. 아래의 “재료 참조 없음”은 이 정규화 결과를 가리킨다.

정규화 파일: [items.json](../data/items.json), [item_recipes.csv](../data/item_recipes.csv). 공식 원문: [16.22.1 ko_KR item.json](https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/item.json). 행별 원본 포인터는 `/data/{item_id}`이며, 가격은 `/gold/total`, `/gold/base`, `/gold/sell`, 재료 항목이 제공된 경우 목록은 `/from` 아래에서 확인한다.

| 아이템 / ID | 총가격 | base | 판매가격 | 재료와 수량 | 원본 포인터 |
| --- | --- | --- | --- | --- | --- |
| 도란의 검 `1055` | 450 | 450 | 180 | 재료 참조 없음 | `/data/1055` |
| 롱소드 `1036` | 350 | 350 | 245 | 재료 참조 없음 | `/data/1036` |
| 장화 `1001` | 300 | 300 | 210 | 재료 참조 없음 | `/data/1001` |
| 무한의 대검 `3031` | 3500 | 725 | 2450 | B.F. 대검(1038) × 1 + 곡괭이(1037) × 1 + 민첩성의 망토(1018) × 1 | `/data/3031` |
| 라바돈의 죽음모자 `3089` | 3500 | 1100 | 2450 | 쓸데없이 큰 지팡이(1058) × 2 | `/data/3089` |

### 3.1. 두 조합의 산술 확인

| 대상 | 재료 가격 합 | 추가 조합 비용 | 총합 |
|---|---:|---:|---:|
| 무한의 대검 3031 | B.F. 대검 1,300 + 곡괭이 875 + 민첩성의 망토 600 = **2,775** | **725** | **3,500** |
| 라바돈의 죽음모자 3089 | 쓸데없이 큰 지팡이 1,200 × 2 = **2,400** | **1,100** | **3,500** |

위 합계는 이 두 표본의 원본 가격에서 계산한 파생 검산이다. 모든 특수 업그레이드·자동 변환 아이템에 같은 조합 규칙이 적용된다는 선언은 아니다. 특히 라바돈의 원본 재료 ID `1058`이 두 번 나타나는 것을 서로 다른 재료 두 종류로 만들거나 한 개로 축약하지 않는다.

### 3.2. 같은 아이템의 구조화 스탯

| 아이템 | 원본 stats 객체 | 원본 포인터 |
| --- | --- | --- |
| 도란의 검 `1055` | `{"FlatHPPoolMod": 80, "FlatPhysicalDamageMod": 10}` | `/data/1055/stats` |
| 롱소드 `1036` | `{"FlatPhysicalDamageMod": 10}` | `/data/1036/stats` |
| 장화 `1001` | `{"FlatMovementSpeedMod": 25}` | `/data/1001/stats` |
| 무한의 대검 `3031` | `{"FlatCritChanceMod": 0.25, "FlatPhysicalDamageMod": 75}` | `/data/3031/stats` |
| 라바돈의 죽음모자 `3089` | `{"FlatMagicDamageMod": 130}` | `/data/3089/stats` |

이 객체는 아이템 설명의 모든 효과를 담는 완전한 스탯 모델이 아니다. 예를 들어 치명타 확률의 `0.25`는 원본 비율 값이며, 이를 25%로 표시하는 것은 UI 변환이다. 설명에만 있는 지속·사용 효과가 `stats`에 없다고 해서 그 효과가 없다고 판정하지 않는다. 맵별 후보 필터와 실제 구매 조건은 [경제·경험치·아이템 문서](systems/02_economy_experience_items.md)와 [복원 계약](08_data_restoration_contract.md)을 따른다.

## 4. 16.21.1 → 16.22.1 구조화 차이 11건

이 비교는 **챔피언 기초 스탯 객체와 아이템의 구조화 필드**에 한정한다. 스킬 상세·수식·문장에만 있는 변경과 서버 핫픽스까지 포함한 전체 패치 목록은 아니다. 원본 파일은 각 버전의 서로 다른 URL과 해시로 고정했다. 전체 대조 데이터: [patch_structured_diff.csv](../data/patch_structured_diff.csv), [patch_structured_diff.json](../data/patch_structured_diff.json).

| 출처 쌍 | 이전 | 현재 |
|---|---|---|
| C: 챔피언 | [16.21.1 champion.json](https://ddragon.leagueoflegends.com/cdn/16.21.1/data/ko_KR/champion.json) | [16.22.1 champion.json](https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/champion.json) |
| I: 아이템 | [16.21.1 item.json](https://ddragon.leagueoflegends.com/cdn/16.21.1/data/ko_KR/item.json) | [16.22.1 item.json](https://ddragon.leagueoflegends.com/cdn/16.22.1/data/ko_KR/item.json) |

| 번호 | 대상 | 필드 | 이전 값 | 현재 값 | 출처 쌍 · JSON 포인터 |
| --- | --- | --- | --- | --- | --- |
| 1 | 멜 `Mel` | `stats/armorperlevel` | 5.2 | 5.4 | C · `/data/Mel/stats/armorperlevel` |
| 2 | 멜 `Mel` | `stats/attackdamage` | 54 | 52 | C · `/data/Mel/stats/attackdamage` |
| 3 | 멜 `Mel` | `stats/attackspeedperlevel` | 2.5 | 2.75 | C · `/data/Mel/stats/attackspeedperlevel` |
| 4 | 멜 `Mel` | `stats/hp` | 630 | 590 | C · `/data/Mel/stats/hp` |
| 5 | 멜 `Mel` | `stats/hpperlevel` | 99 | 107 | C · `/data/Mel/stats/hpperlevel` |
| 6 | 멜 `Mel` | `stats/mp` | 480 | 455 | C · `/data/Mel/stats/mp` |
| 7 | 멜 `Mel` | `stats/mpperlevel` | 28 | 38 | C · `/data/Mel/stats/mpperlevel` |
| 8 | 쓰레쉬 `Thresh` | `stats/attackdamage` | 56 | 54 | C · `/data/Thresh/stats/attackdamage` |
| 9 | 빅토르 `Viktor` | `stats/hpperlevel` | 100 | 105 | C · `/data/Viktor/stats/hpperlevel` |
| 10 | 도란의 활 `1086` | `stats/FlatPhysicalDamageMod` | 8 | 7 | I · `/data/1086/stats/FlatPhysicalDamageMod` |
| 11 | 지배자의 피갑옷 `2501` | `stats/FlatPhysicalDamageMod` | 30 | 40 | I · `/data/2501/stats/FlatPhysicalDamageMod` |

성장 필드의 변화는 계수 자체의 변화다. 예를 들어 `hpperlevel`의 +8을 모든 레벨에서 즉시 체력 +8로 적용하는 방식은 이 표의 해석이 아니다. 레벨 성장식과 예외를 적용하는 규칙 계층은 별도로 검증한다.

## 5. 복원된 배열을 JavaScript에서 확인하기

다음 예시는 프로젝트 루트에서 실행하는 검토 도구 코드다. 파일을 읽어 표를 출력하며, 피해 공식을 보충하거나 게임을 실행하지 않는다. 별도 npm 패키지는 필요하지 않다.

```javascript
import { readFileSync } from 'node:fs';

const rows = JSON.parse(readFileSync('data/champion_spells.json', 'utf8'));
const selected = rows.filter(row => row.champion_key === 'Ahri');
if (selected.length !== 4 || selected.some(row => row.ddragon_version !== '16.22.1')) {
  throw new Error('검토할 빌드 또는 QWER 범위가 다릅니다.');
}
console.table(selected.map(row => ({
  slot: row.slot,
  cooldown: JSON.stringify(row.cooldown_by_rank),
  cost: JSON.stringify(row.cost_by_rank),
  range: JSON.stringify(row.range_by_rank),
  unresolved: row.unresolved_tokens.join(', ')
})));
```

데이터를 구현으로 옮기기 전에는 [원작·프로토타입 차이](10_prototype_gap_and_roadmap.md)를 기준으로 적용할 계층을 선택하고, [관측·검증 계획](11_qa_and_measurement_plan.md)의 조건을 통과시킨다. 본 문서의 수치 표는 그 검토를 시작하기 위한 실제 입력 자료다.

## 6. 출처와 재현성

이 문서의 값은 다음 정규화 파일에서 직접 선택했다.

- [champions.json](../data/champions.json): 6명 기초 스탯 및 한글 이름.
- [champion_spells.json](../data/champion_spells.json): 24개 최상위 스킬 배열과 미해결 변수.
- [items.json](../data/items.json): 5개 표본 및 참조 재료의 이름·가격·스탯.
- [patch_structured_diff.json](../data/patch_structured_diff.json): 구조화 변경 11건.

원본 URL·수집 시각·원본 응답 SHA-256·동봉 projection SHA-256은 [source_manifest.json](../raw/source_manifest.json)에 있다. `raw/`는 긴 설명을 제외한 선택 필드 projection이며 원본 HTTP 파일 전체와 바이트가 동일하다고 주장하지 않는다. 공식 데이터의 재생성 방법과 원본·파생 필드 구분은 [데이터 시트 안내](../data/README.md)에 있다.
