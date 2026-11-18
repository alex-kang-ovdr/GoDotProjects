# Cosmoteer 게임 데이터 테이블 복구 v1

작성·확인: **2026-11-17 (한국 시간)**

코스모티어 원작의 공개 자료를 구조화한 데이터와, 기존 STARFORGE v3 코드에서 직접 추출한 구현 데이터를 함께 제공한다. 원작 부분은 공식 위키의 공개 수치와 개발자 정식 패치를 대조한 **문헌 기반 재구축본**이다. 원작 설치 폴더의 `.rules` 파일이나 실행 파일을 추출한 결과는 아니다.

## 바로 확인하기

1. ZIP 전체를 압축 해제한다.
2. **[index.html](index.html)**을 브라우저에서 연다. 설치·서버·인터넷 연결 없이 검색, 필터, 필드별 출처 확인, JSON 다운로드가 가능하다.
3. 개발에 가져갈 때는 **[data/cosmoteer_original.json](data/cosmoteer_original.json)**을 사용하고 `value`, `unit`, `field_status`, `evidence`를 함께 읽는다.
4. 기존 웹 게임의 실제 수치는 **[data/starforge_v3.json](data/starforge_v3.json)**에 있다. 원작 데이터와 다른 데이터셋이다.

## 구성

| 위치 | 내용 | 사용 목적 |
| --- | --- | --- |
| `data/cosmoteer_original.json` | 원작의 채택값·단위·출처·관측 이력 | 프로그램에서 읽는 기준 파일 |
| `data/starforge_v3.json` | 기존 구현 109개 레코드 | 게임 코드 상수 복구·비교 |
| `data/cosmoteer_tables.sqlite` | 원작 데이터의 관계형 데이터베이스 | SQL 검색·대조 |
| `data/sources.json` | 출처 ID, URL, 접근 방식, 관측일 | 근거 추적 |
| `data/conflicts.json` | 충돌과 과거 관측값 | 후속 원본 대조 |
| `csv/parts.csv` | 부품 기본 테이블 | 가격·체력·크기·기능 비교 |
| `csv/mode_overrides.csv` | 일반 모드와 구분한 모드별 관측 | 오버클럭 등 확인 |
| `csv/munitions.csv` | 탄종별 성능 | 미사일·기뢰 효과 확인 |
| `csv/resources.csv` | 자원 가격·적재량 | 경제·물류 데이터 |
| `csv/recipes.csv`, `csv/recipe_resources.csv` | 생산식·입출력 관계 | 제조 데이터 |
| `csv/rules.csv` | 승무원·명성·평판·난이도·열 등 | 시스템 상수 |
| `csv/construction_resources.csv` | 부품과 건조 재료의 관계 | 재료 외래키·비용 대조 |
| `csv/observations.csv` | 원작의 모든 필드를 한 행씩 펼친 표 | 단위·상태·출처까지 포함한 완전한 CSV |
| `csv/starforge_v3_observations.csv` | 구현 데이터의 필드별 표 | 코드 파일·줄 범위 확인 |
| [tables/README.md](tables/README.md) | 시스템별 Markdown 목차 | 기획서에서 읽기 |
| [docs/FIELD_DICTIONARY.md](docs/FIELD_DICTIONARY.md) | 필드·단위 사전 | 데이터 해석 |
| [docs/RECOVERY_METHOD.md](docs/RECOVERY_METHOD.md) | 복구·채택 규칙과 한계 | 판본과 신뢰 수준 확인 |
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | JavaScript 및 SQL 사용 예 | 기존 구현과 연결 |
| [docs/STARFORGE_MAPPING.md](docs/STARFORGE_MAPPING.md) | 원작 개념과 구현 부품의 대응 | 수치 이식 전 검토 |
| [docs/VALIDATION.md](docs/VALIDATION.md) | 검증 결과와 복구 범위 | 전달본 검수 |
| `authoring/` | 분야별 사실 관측 입력 | 출처를 유지하며 수정·재생성 |
| `scripts/`, `schemas/` | 재생성·검증·조회 화면 원본·스키마 | 후속 유지보수 |

CSV는 **UTF-8 BOM**으로 저장했다. 한글을 포함하며, 빈 칸은 미확정 또는 해당 열이 기록되지 않은 상태다. `observations.csv`의 `value_json` 열은 `null`, `0`, `false`, 배열을 정확히 구분한다. 필드별 단위는 같은 파일의 `unit` 열에 있다.

## 확인 상태

| 상태 | 의미 | 사용 시 주의 |
| --- | --- | --- |
| `patch_confirmed` | 개발자 정식 패치가 해당 값을 명시 | 그 패치 이후 변경 여부는 별도 확인 |
| `wiki_snapshot` | 관측 당시 위키 색인에 기재된 값 | 정확한 게임 빌드와의 일치 미검증 |
| `wiki_history_resolved` | 위키 내 변경 이력으로 구형 표기를 정리 | 원본 설치 데이터 검증은 아님 |
| `derived` | 명시된 관계와 다른 관측값을 결합 | 입력 관측값의 불확실성을 함께 가짐 |
| `conflict` | 자료·단위·산술 관계가 충돌하여 채택 보류 | `value: null`, 원값은 관측 이력에 유지 |
| `unverified` | 필요한 수치 근거를 확보하지 못함 | `value: null` |
| `not_applicable` | 해당 필드가 적용되지 않음 | 실제 수치 0과 구분 |

**미확정값을 0이나 일반 모드 값으로 자동 채우면 안 된다.** 특히 모드 차이표는 전체 오버클럭 프로필을 복구했다는 뜻이 아니다. 자료에 없는 장치 상호작용, 포트 위치, 고유 엔진 ID, 배치 폴리곤도 생성하지 않았다.

## 원작과 STARFORGE의 관계

STARFORGE는 앞서 만든 독립 JavaScript 프로토타입이다. 추출 기준 커밋은 `f90387acd3f7ca25a8285423f235352dd47d07e4`이다. 부품 11종, 개량 9단계, 계약 3종, 구역별 의뢰 9개, 시작·적 함선 설계 10개, 프리셋 3개와 시뮬레이션 규칙을 포함한다.

원작의 부품은 크기·질량·승무원·가격·전력 단위가 다르다. 예를 들어 이름이 같은 원자로라도 STARFORGE의 한 칸짜리 장치와 원작의 다중 타일 장치는 직접 호환되지 않는다. 이 패키지는 데이터를 복구·연결할 수 있게 제공하며, 기존 웹 게임의 밸런스를 자동 교체하지 않는다.

## 다시 생성·검증하기

Python 3.10 이상에서 외부 패키지 없이 실행한다.

```bash
python3 scripts/build_exports.py
python3 scripts/validate_data.py
```

`authoring`의 값을 변경할 때는 `fields`뿐 아니라 `evidence`와 `field_status`도 함께 수정한다. 충돌을 해결하면 원래 관측값을 삭제하지 말고, 새 출처와 해결 근거를 남긴다. HTML, CSV, Markdown, SQLite는 기준 입력에서 재생성한다.

기존 STARFORGE 저장소가 있다면 지정 커밋에서 데이터를 다시 추출할 수 있다. 실행 형식은 [통합 설명](docs/INTEGRATION.md)을 따른다.

## 정확한 원작 파일과의 후속 대조

정확한 빌드를 고정하려면 해당 버전의 원작 `Data` 폴더에 있는 부품·자원·승무원·경제·문자열 `.rules`와 빌드 번호가 필요하다. 이번 전달본은 그 파일을 받았을 때 **어떤 필드를 우선 확인해야 하는지** 찾을 수 있도록 미확정 항목과 출처를 보존했다. 자세한 범위는 [복구 방식](docs/RECOVERY_METHOD.md)과 [미확정 목록](docs/UNRESOLVED.md)에 정리했다.

원작 이미지·음원·함선 파일·실행 파일은 포함하지 않았다. 자료의 출처와 이용 범위는 [NOTICE.md](NOTICE.md)에 있다.
