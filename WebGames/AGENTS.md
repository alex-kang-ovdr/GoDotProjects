# WebGames 작업 규칙

- `catalog.json`의 게임 ID와 실제 폴더를 같은 영문 소문자 kebab-case로 유지한다. 예를 들어 `first-queen-iv/Web/index.html`을 사용한다.
- 수집본의 이전 원본, 새 원본, 현재 `Web` 실행본을 비교한다. `vendor/` 언어 런타임, 게임 ID, 저장 호환성, 공개 상태, 플랫폼 표지를 병합 과정에서 보존한다.
- 변경된 통합판의 마이너 버전을 올리고 manifest에 `updatedOn`을 기록한다. 동기화와 검증 뒤 `Archive/Releases/<id>-v<version>.zip`에 실행본을 보관한다.
- 상세 폴더 구조, 파일명과 검증 절차는 [README.md](README.md)를 따른다.
