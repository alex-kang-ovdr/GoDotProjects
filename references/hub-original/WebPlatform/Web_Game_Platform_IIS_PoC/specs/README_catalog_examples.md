# 카탈로그와 매니페스트 예시 안내

이 파일들은 개발 계획을 구체화한 계약 초안이다. 실제 게임 8종, index.html, 이미지, 배포 시스템, CLI는 구현되어 있지 않다. catalog.example.json의 games 경로와 game.manifest.example.json의 이미지 경로는 향후 만들 파일의 예시이며 이 문서 묶음에 해당 파일이 존재한다고 의미하지 않는다. 실제 게임이 있는 것처럼 빈 games 폴더를 만들지 않았다.

| 파일 | 용도 |
|---|---|
| catalog.schema.json | 중앙 catalog/games.json 형식 검증 |
| catalog.example.json | 계획한 내장 게임 8종의 중앙 등록 예시 |
| game.manifest.schema.json | 게임별 메타데이터·조작법·입력·실행 권한·저장·SEO 형식 |
| game.manifest.example.json | match3-garden 한 작품의 매니페스트 예시 |

JSON Schema는 [Draft 2020-12 공식 규격](https://json-schema.org/draft/2020-12)을 사용한다. $id의 playhub.example.com은 예시 도메인이며 실제 접근 가능한 스키마 서비스가 아니다. 검증기는 로컬 스키마 파일을 사용하면 되고, 이 문서의 버전을 따라 온라인 스키마를 임의로 받아오지 않는다.

## 파일을 추가하는 개발 흐름

1. 실제 구현 시 games/<id>/에 game.manifest.json, index.html, 소스·자산을 작성한다.
2. 중앙 catalog/games.json에 {id, path, enabled} 항목을 추가한다.
3. CI가 JSON Schema와 아래 교차 검증을 실행하고 게임을 불변 산출물로 만든다.
4. 성공한 릴리스가 DB 투영, SSR 목록·상세, 검색, sitemap, 실행 빌드를 함께 반영한다.
5. 실패한 릴리스는 공개하지 않고 이전 카탈로그를 유지한다. UI 코드나 수동 DB 행 추가는 필요하지 않는다.

이는 다음 성공한 build/deploy에서 자동 반영되는 설계다. 정적 호스팅에 폴더만 복사하면 즉시 새 메뉴가 생긴다는 의미가 아니다. 원본은 저장소이며 DB는 source_kind=builtin의 투영이다. 향후 source_kind=upload는 별도의 제작자 업로드 경로로 관리한다.

## JSON Schema 외에 필요한 교차 검증

- id와 path 각각의 고유성. uniqueItems는 객체 전체의 중복만 검사하므로 ID만 같은 항목을 모두 잡지 못한다.
- path가 games/ + id와 정확히 같고 실제 디렉터리가 존재하는지 확인한다.
- catalog id, 폴더명, manifest id가 같은지 확인한다. 초기 slug도 id와 같게 유지하고 변경 시 URL redirect·저장·분석 ID 보존을 검토한다.
- 매니페스트와 index.html, 표지·스크린샷이 실제 존재하며 게임 폴더 밖 경로를 참조하지 않는지 검사한다.
- 표지·미디어의 실제 MIME·용량·크기, 제목·설명·조작법의 표시, 한국어·영어 fallback을 확인한다.
- 선언된 입력·화면 방향·권한이 실제 코드와 일치하는지, SDK ready·10초/60초·라운드 이벤트가 정상인지 시험한다.
- 게임 빌드 해시·카탈로그 버전·SSR·검색·sitemap이 같은 릴리스인지 확인한다.
- enabled=false와 운영 긴급 중단은 목록·검색·신규 실행에 반영하되 저장·분석 기록을 무단 삭제하지 않는다.

P0 기본 프로필은 workers=false와 externalNetwork=[]다. worker-src none 정책은 Dedicated Worker와 Service Worker 모두를 제한한다. fullscreen·pointerLock은 true 선언만으로 자동 권한을 주지 않으며 사용자 동작·지원 환경·플랫폼 정책을 함께 적용한다. wasm=true는 단일 스레드 프로필과 MIME·CSP 검증이 필요하며 검증되지 않은 호환성을 보장하지 않는다.

## 스키마 검증과 게임 검증의 구분

예시 JSON이 스키마에 맞다는 것은 계약 형식 확인이다. 파일 존재 검사·브라우저 실행·성능·SEO 렌더·보안·접근성·지표의 정확성까지 통과했다는 뜻이 아니다. 예시 경로의 실제 게임·이미지가 없으므로 이 문서 묶음을 그대로 실제 카탈로그 배포에 사용하면 파일 존재 단계에서 실패하는 것이 정상이다.

controls는 지원 입력의 배열이며 keyboard·mouse·touch·gamepad를 사용한다. 별도의 필수 instructions:{ko,en}에는 게임별 조작법을 각각 20–4000자로 작성한다. 선택 rules:{ko,en}도 제공한다면 두 언어와 같은 길이 제한을 충족해야 한다. 공통 상세 템플릿은 해당 필드를 읽어 SSR 본문과 게임 도움말을 자동 생성하므로 게임별 UI 코드를 수정할 필요가 없다.

instructions와 rules는 일반 텍스트 또는 제한된 Markdown으로 해석한다. 렌더러는 원시 HTML을 실행하지 않고 escape하며, 링크 스킴·속성은 허용 목록으로 제한한다. script·이벤트 속성·javascript URL·임의 iframe을 허용하지 않는다. JSON Schema의 문자열 검증 자체가 XSS를 막아 준다고 가정하지 않는다. 제목·요약·SEO 설명은 일반 텍스트로 출력한다. 현재 schemaVersion=1은 알 수 없는 필드를 거부한다.
