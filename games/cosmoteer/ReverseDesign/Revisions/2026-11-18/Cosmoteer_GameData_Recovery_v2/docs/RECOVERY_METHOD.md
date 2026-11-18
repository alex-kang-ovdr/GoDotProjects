# v2 복구 방법과 재현

## 관측 기준

확인일은 2026-11-18이다. 출시된 변경의 현재 조사 기준은 0.30.5·0.30.5a이며, 과거 정식 패치에 명시된 필드는 해당 패치의 범위로 기록한다. 공식 위키의 수치는 조회 시점의 스냅샷이다. 정확한 설치 빌드·원본 `.rules`는 확보하지 않았다.

v1의 원작 데이터는 `authoring/original_v1.json`에 바이트 그대로 보존한다. v2 입력은 `authoring/*_proposals.json` 세 파일이다. 각 변경에는 대상 레코드·필드·값·단위·상태·출처·사유가 있으며, 빌더가 같은 필드의 중복 수정과 알 수 없는 ID를 거부한다. 핵공장 과거 null 메모는 새 설명으로 교체하되 `note_history`에 보존했다.

## 채택과 철회

정식 패치가 값을 명시하면 해당 필드에 한해 채택한다. 두 값의 단위와 범위가 다르면 하나로 합치지 않는다. full missile당 전력과 missile part당 전력은 서로 다른 필드다. 상충하거나 비어 있는 항목은 null로 남기며 전체 공식·좌표·배치 크기를 임의로 완성하지 않는다. 새로 발견한 미확정 필드도 추가했기 때문에 v2의 null 수는 증가했다.

문헌상 일반 모드의 값을 OC 상태에 무조건 상속하지 않는다. 현재 확인 가능한 차이만 `mode_override`에 남긴다. 웹 게임에서 상속이나 보간을 선택하려면 별도 실행 프로필의 설계 결정으로 기록해야 한다.

## 출처 접근 상태

위키는 직접 열기 403이 발생한 항목에 대해 검색 색인에서 실제 제공된 텍스트를 관측했다. 이를 직접 페이지 전체 열람으로 표시하지 않는다. 개발자 공지는 Steam 본문을 읽었으며 같은 피드의 RC, 정식 버전, 향후 개발 공지를 구분했다. 일부 Steam URL은 여러 게임의 뉴스를 포함하므로 출처의 `located_section`, 제목·버전·조회 참조를 함께 제공한다.

자료의 원문 전체나 게임 자산을 배포하지 않는다. 표에는 필요한 사실·근거 링크와 연구자 설명만 담았다. 나무위키 링크는 기존 조사에서 본문 접근을 확보하지 못해 수치의 근거로 사용하지 않았다.

## 형식과 단일 기준

- 원작 정규 데이터: `data/cosmoteer_original.json`.
- 필드 변경 이력: `data/revision_v2.json`.
- CSV 무손실 필드 표현: `csv/observations.csv`의 `value_json`. 표시용 `value`의 빈칸을 0으로 읽지 않는다.
- SQLite: 원본 레코드 JSON, 필드별 관측, 출처, 근거 외래키를 함께 저장.
- Markdown: 시스템별 사람이 읽는 표이며 정규 데이터에서 생성.
- HTML: 같은 JSON을 내장한 오프라인 조회 화면. 현재 v4와 역사적 v3는 별도 탭.
- 개발 예정 자료: `data/roadmap_observations.json`, 현행 원작 레코드 수에 포함하지 않음.
- 웹 실행 제안: `planning/`, `design/`, 원작 수치로 취급하지 않음.

## 재생성 순서

```bash
node scripts/export_starforge_v4.cjs
python3 scripts/build_revision.py
python3 scripts/build_reports_v2.py
python3 scripts/validate_v2.py
node scripts/validate_loader.mjs
node scripts/validate_viewer.cjs
```

기본 빌더는 Python 표준 라이브러리만 사용한다. 스키마의 정식 검사는 `jsonschema`가 설치된 경우 추가 실행하고 그 여부를 보고한다. CSV·SQLite·이력·출처·계획 참조 검사는 선택 라이브러리 없이도 실행된다. Node 스크립트는 읽기 전용 추출과 조회 로직 검증에 사용하며 게임 파일을 수정하지 않는다.

조회 로직 검사는 실제 DOM을 갖춘 브라우저 렌더링을 대신하지 않는다. 이번 환경의 시스템 Chromium은 OS 소켓 권한 제한으로 시작하지 못했으며, 검색·필터·데이터 전환·다운로드 데이터는 Node VM 하네스로 확인했다. UI 배치와 실제 브라우저 클릭은 미검증으로 남겼다.
