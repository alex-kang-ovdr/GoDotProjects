# FTL 프로젝트 통합 산출물 — STARWARD v5

## 바로 실행

1. ZIP을 폴더에 압축 해제합니다.
2. 루트의 `PLAY.html`을 Chrome 또는 Edge로 엽니다.
3. 함선과 난이도를 선택하고 출항합니다.

`PLAY.html`은 최신 v5의 CSS와 JavaScript를 포함한 독립 실행 파일입니다. 별도 설치나 인터넷 연결 없이 실행할 수 있습니다.

## 포함 내용

- `PLAY.html`: 바로 실행하는 단일 HTML
- `STARWARD_Source/`: 최신 v5 웹 게임 소스, 시스템 구현 명세 9개, README, 변경 이력, 검증 코드, 이전 저장 검증 자료, 실제 화면
- `ftl_reverse_design/`: 원작 FTL 시스템별 역기획서와 출처 문서 24개 MD

## 소스 실행과 개발

분리된 웹 파일은 `STARWARD_Source/dist/index.html`입니다. 실행 방법과 조작법은 `STARWARD_Source/README.md`, 변경 내역은 `STARWARD_Source/CHANGELOG.md`를 확인하세요.

최신 v5는 함선별 실제 격실 구조, 문을 경유하는 승무원 이동, 구조에 따른 빔 판정, 이전 저장 호환을 구현합니다. 신규 도면은 새 항해에 적용되며, 이전 저장은 당시 도면을 보존합니다.

## 검증 기록

배포한 v5는 자동 검사 137/137 및 공개 명령을 이용한 캠페인 4/4 완주를 통과했습니다. 구체적인 검증 범위는 `STARWARD_Source/docs/v5_validation.md`를 참고하세요.

## 자료 구분

`ftl_reverse_design/`은 원작 분석 자료입니다. `STARWARD_Source/`와 `PLAY.html`은 해당 장르를 참고해 제작한 독립 웹 게임 STARWARD의 구현입니다.
