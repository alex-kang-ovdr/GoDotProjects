# Cosmoteer 데이터 복구·시스템 개선 v2

원작 공개 문헌 재분석, 복구 테이블 개정, 현재 STARFORGE v4와의 차이 분석, 다음 구현 기획을 묶었다. **게임 실행 파일의 새 배포가 아니라 데이터·기획 개정본**이다.

## 먼저 열 파일

- [index.html](index.html): 인터넷 없이 원작 v2·STARFORGE v4·이전 v3 데이터를 검색·비교하는 조회 화면.
- [design/README.md](design/README.md): 시스템별 개선 기획 11개 본문과 목차.
- [docs/REVISION_V2.md](docs/REVISION_V2.md): 실제로 채운 값·교정한 값·철회한 값.
- [docs/VALIDATION.md](docs/VALIDATION.md): 데이터와 전달 형식 검증 범위·결과.

## 이번 복구 범위

원작 레코드 **219개**, 전체 필드 **2,107개**, 근거가 있는 비null 필드 **1,655개**, 미확정·상충 필드 **452개**다. v1의 196개 레코드·1,517개 비null 필드에서 시스템 규칙과 근거를 보강했다. 기존 null 4개 복구, 구형 수치 2개 교정, 과도한 값 2개 철회, 신규 필드 157개가 포함된다.

원작 설치 데이터와 exact build는 미확보다. 패치 확인은 각 패치 당시의 명시 관측이며, 위키는 조회 스냅샷이다. null을 0으로 치환하지 않는다. 원작 전체 복구율이나 바이너리 일치를 주장하지 않는다.

## 폴더 구성

| 경로 | 내용 |
| --- | --- |
| `data/` | 원작 v2 JSON·SQLite, 출처·변경 이력, v4/v3 구현 추출, 별도 로드맵 |
| `csv/` | 필드별 무손실 `value_json`, 부품·자원·생산식·규칙 표, v4 매핑 |
| `tables/` | 시스템/종류별 조회용 Markdown 테이블 |
| `design/` | 시스템별 개선 설계, 의존 순서, 저장 전환, UX·밸런스 |
| `planning/` | 제안 요구사항 18개·수용 명세 34개·계약 스키마 |
| `analysis/` | 분야별 연구 전문, 별도 경제 파생 분석, v4 매핑 |
| `authoring/` | 변하지 않는 v1 기준 JSON과 검토된 v2 수정 입력 |
| `reference_code/v4/` | 검토 기준이 된 4개 소스 파일과 SHA-256; 완성 게임 배포물은 별도 v4 산출물 |
| `reverse_design_v1/` | 기존 시스템별 역기획 25개 MD |
| `historical_v1/` | 이전 감사·검증·설명 자료; 이번 결과와 구분 |
| `scripts/` | 재생성·검증·읽기 전용 데이터 로더 |

## 재현

Python 3.10+와 Node.js가 필요하다. 기본 데이터 재생성에는 외부 라이브러리나 네트워크를 사용하지 않는다.

```bash
node scripts/export_starforge_v4.cjs
python3 scripts/build_revision.py
python3 scripts/build_reports_v2.py
python3 scripts/validate_v2.py
node scripts/validate_loader.mjs
node scripts/validate_viewer.cjs
```

v4 추출은 동봉된 고정 커밋 소스를 읽는다. 실제 저장소를 첫 인자로 지정하면 같은 커밋을 `git show`로 읽으며 체크아웃·게임 편집을 하지 않는다. catalogue 스키마의 추가 검사는 `jsonschema`가 설치된 환경에서 검증기에 의해 함께 실행된다.

웹 게임은 기존 v4 산출물을 사용한다. 이 패키지의 `index.html`은 게임이 아니라 데이터 조회 화면이다. 제안 v5 계약·수용 명세는 구현 완료된 게임 기능이 아니다.
