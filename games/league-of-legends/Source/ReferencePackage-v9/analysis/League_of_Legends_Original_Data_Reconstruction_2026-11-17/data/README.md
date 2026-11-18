# 원작 공개 데이터 시트 사용법

이 폴더는 Riot의 공개 Data Dragon 자료와 공식 식별자 레지스트리에서 추출한 **사실·수치·식별자**를 제공한다. 게임 서버 바이너리, 내부 스크립트, 챔피언의 모든 상태 전이와 숨겨진 판정을 복원한 자료는 아니다. 현재 확보 건수는 [coverage_report.json](coverage_report.json), 검증 결과는 [validation_report.json](validation_report.json), 열의 공통 계약은 [data_dictionary.json](data_dictionary.json)에 있다.

## 기준과 집계 분모

- 현재 정적 데이터 빌드: **16.22.1**. 공개 패치 표기 **26.22**와 별도로 관리한다.
- 비교 빌드: **16.21.1**. 이전판은 챔피언 기본 스탯과 아이템 구조 비교에 사용한다.
- 기본 로케일은 `ko_KR`이며 영문 이름은 같은 빌드의 `en_US`에서 연결한다.
- `champions`의 한 행은 챔피언 한 명이다. 두 로케일을 두 명으로 중복 집계하지 않는다.
- `champion_spells`는 챔피언당 최상위 Q/W/E/R 네 행이다. 변신 형태·재시전·강화 형태·숨겨진 내부 스킬을 모두 센 개수가 아니다.
- 아이템·소환사 주문·큐는 여러 게임 모드와 과거 식별자를 포함한다. 전체 행 수를 현재 소환사의 협곡에서 선택 가능한 개수로 해석하지 않는다.

## 파일 구성

아래 표의 데이터셋은 각각 JSON과 CSV를 함께 제공한다. CSV는 한글 Windows Excel에서 읽기 쉬운 UTF-8 BOM 형식이다. 배열과 객체는 셀 안의 JSON 문자열이다.

| 데이터셋 | 행 단위 | 핵심 열 |
|---|---|---|
| `champions` | 챔피언 | 숫자 `champion_id`, 문자열 `champion_key`, 한·영 이름, 자원 종류, 클래스 태그, 기본·성장 스탯 |
| `champion_stats` | 챔피언 × 원본 스탯 필드 | `stat_key`, `value`, 해당 필드 JSON 포인터 |
| `champion_passives` | 챔피언 패시브 | 패시브 이름과 수치 복원 상태 |
| `champion_spells` | 챔피언 × Q/W/E/R | 랭크 수, 쿨다운·비용·사거리 배열, effect, vars, 미해결 토큰 |
| `spell_ranks` | 스킬 × 랭크 | 랭크별 쿨다운·비용·사거리, 각 배열 원소 포인터 |
| `spell_effect_arrays` | 스킬 × effect 인덱스 | 원본 효과 배열과 미확정 의미 연결 상태 |
| `spell_template_tokens` | 스킬 × 툴팁 변수 식별자 | 원본 필드로 직접 연결 가능한지, 미해결인지, 연결된 값과 포인터 |
| `items` | 아이템 식별자 | 한·영 이름, 가격, 구조화 스탯, 재료·후속 아이템, 모드 맵 플래그 |
| `item_stats` | 아이템 × 구조화 스탯 | 원본 `stats` 객체의 필드와 값 |
| `item_recipes` | 재료 → 완성 아이템 | 재료 ID, 완성 ID, 중복 재료 수량, 존재 여부, 원본 가격 |
| `item_map_flags` | 아이템 × 맵 플래그 | 원본 `maps` 값. 플래그만으로 실제 상점 노출을 확정하지 않음 |
| `items_sr_shop_candidates` | 협곡 상점 후보 | 맵 11·구매 가능·숨김 여부로 거른 후보. 챔피언·모드 조건의 실전 검증은 별도 |
| `rune_paths`, `runes` | 경로 / 룬 | 경로 ID, 슬롯 인덱스, 슬롯 내 순서, 한·영 이름 |
| `summoner_spells` | 소환사 주문 | ID, 요구 소환사 레벨, 원본 쿨다운·비용·사거리와 모드 |
| `official_queues`, `official_maps` | 공식 식별자 | 과거·폐기된 식별자를 포함하는 비버전 레지스트리 |
| `official_gameModes`, `official_gameTypes`, `official_seasons` | 공식 식별자 | 현재 활성 여부와 분리한 모드·유형·시즌 이름 |
| `ddragon_maps` | 현재 정적 맵 항목 | 해당 Data Dragon 빌드에 포함된 맵 메타데이터 |
| `patch_structured_diff` | 구조화 필드 변경 | 이전·현재 빌드, 추가·삭제·변경, 전후 값과 각각의 출처 |

## 원본 필드와 파생 필드

`source_url`, `source_json_pointer`, `source_sha256`, `ddragon_version`, `locale`를 통해 원본 기록을 추적한다. 영문 이름의 출처는 `name_en_source_url`에 따로 둔다. `*_derived`, `status`, `interpretation`은 이 재구축 작업에서 계산하거나 부여한 설명이며 Riot 원본 필드가 아니다.

`raw/`의 파일은 원본 HTTP 바이트 전체가 아닌 **선택한 필드를 보존한 projection**이다. 긴 이야기·배경 설명·툴팁 본문을 제외하고 수치와 식별 구조를 유지했다. 스킬 템플릿 식별자는 `__text_annotations`라는 파생 메타데이터로 남겼다. [source_manifest.json](../raw/source_manifest.json)의 `source_sha256`는 다운로드한 원본 응답 바이트를, `stored_sha256`는 함께 배포하는 projection 파일을 해시한다. 두 해시는 목적이 다르며 동일할 필요가 없다.

## 오해하기 쉬운 수치

1. `hpperlevel`, `armorperlevel`, `attackdamageperlevel` 같은 성장 필드를 단순히 `(level-1)`배 하여 원작 최종 능력치를 확정하지 않는다. 실제 성장식·챔피언 예외는 별도 규칙 계층에서 검증해야 한다.
2. `effect[0]`의 null은 원본의 인덱스 정렬을 위한 자리일 수 있다. `e1`은 `effect[1]`에 연결한다. 연결 성공은 해당 배열이 전체 피해 공식이라는 증거가 아니다.
3. 원본의 0은 0으로 보존한다. 원본 누락 값과 미해결 토큰은 JSON null/CSV 빈칸으로 보존하며 0으로 대체하지 않는다. 0 배열은 실제 무피해 스킬이라는 증거가 아니다.
4. `range`는 클라이언트의 정적 캐스팅 메타데이터다. 0 또는 매우 큰 값, 변신·재시전의 별도 사거리, 목표물 반경·투사체 폭을 실제 전투 사거리와 혼동하지 않는다.
5. `cost`만으로 체력·마나·기력·기타 자원 비용을 전부 확정하지 않는다. `resource_template` 및 별도 effect 연결이 필요한 경우가 있다.
6. 아이템 `gold_base`는 일반적인 조합에서 추가 조합 비용이다. `gold_total`·`gold_sell`과 구별한다. 원본 `stats`에 없는 설명 전용 패시브·액티브 효과를 누락 없이 복원했다고 해석하지 않는다.
7. `sr_shop_candidate_derived`는 정적 후보 필터다. 구매 시점, 챔피언 전용·특수 업그레이드, 모드·핫픽스에 따른 상점 조건을 보장하지 않는다.
8. 룬의 경로·슬롯·ID를 복원했지만, 긴 설명에만 있는 수치·발동 조건·중첩 규칙을 실행 가능한 수식으로 복원하지 않았다.
9. KR realm의 레거시 `rune=7.23.1`과 현대 `runesReforged.json`을 같은 버전 체계로 취급하지 않는다. 이번 현대 룬 자료는 16.22.1의 명시적 URL에서 읽었다.
10. 비버전 큐 레지스트리의 항목 존재는 그 큐가 현재 한국 서버에서 열려 있다는 뜻이 아니다.

미해결 토큰 집계에는 공통 `spellmodifierdescriptionappend` 식별자가 들어간다. 보고서는 이 정확한 식별자 하나를 제외한 보조 집계도 제공한다. 이 제외는 공통 템플릿이 모든 스킬의 집계에 미치는 영향을 보여 주기 위한 것이며, 해당 식별자를 게임 규칙에 무관한 값이라고 확정한 것은 아니다.

## 다시 생성하기

프로젝트 루트에서 Python 3로 실행한다. 외부 패키지 설치와 API 키는 필요하지 않다.

```sh
# 동봉한 projection에서 CSV/JSON을 다시 생성하고 검증한다. 네트워크 사용 없음.
python scripts/rebuild_data.py

# 같은 명시적 버전을 공식 공개 URL에서 다시 내려받은 뒤 재생성한다.
python scripts/rebuild_data.py --download --version 16.22.1 --previous 16.21.1 --workers 8
```

새 패치로 갱신할 때는 `versions.json`과 KR realm을 확인한 뒤 두 버전을 명시한다. 공개 패치 표기는 자동 숫자 변환으로 추정하지 않으며, 코드가 알고 있는 표기 외에는 null로 둔다. 같은 CDN 빌드가 다시 게시될 가능성 때문에 재다운로드의 원본 해시는 이전 수집과 비교해야 한다. 날짜·해시가 바뀌면 새로운 수집본으로 다룬다.

## 검증 범위

입력 projection의 해시와 빌드, 챔피언 ID 유일성, 모든 챔피언의 QWER 네 항목, 미해결 토큰의 null 유지, 아이템 참조와 재료 수량, 룬 경로 참조, CSV/JSON 행 수 일치를 확인한다. 원본에서 발견한 랭크 배열 길이 차이와 누락 참조는 경고로 기록하며 임의 수정하지 않는다. 실제 클라이언트 전투를 재현하는 테스트와는 다르다.
