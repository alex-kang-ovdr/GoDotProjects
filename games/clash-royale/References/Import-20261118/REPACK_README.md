# Crownfall v4.5 — 2026-11-18 재취합 배포본

다운로드 실패에 대응해 기존 최신 산출물을 내용 변경 없이 새 ZIP으로 취합했습니다.
게임 코드·수치·그래픽·모델링·원작 분석 자료·기존 문서와 보고서는 수정하지 않았습니다.
게임 및 데이터 재빌드, 새 에셋 생성, 사이트 재배포는 수행하지 않았습니다.

## 실행

ZIP을 전체 압축 해제한 뒤 `crownfall-arena/dist/crownfall-offline.html`을 브라우저로 여세요.
JavaScript와 그래픽이 포함된 기존 v4.5 단일 파일 실행본입니다.
모듈 개발용 실행은 기존 `crownfall-arena/README.md`의 정적 서버 안내를 따릅니다.

## 포함 버전과 구성

| 경로 | 내용 | 버전 |
|---|---|---|
| `crownfall-arena/` | 기존 게임 실행본·소스·근거 부분집합·시스템 문서·테스트·스크립트 | Crownfall 4.5.0 |
| `crownfall-arena/dist/source.zip` | 이전에 제공한 원본 게임 소스 ZIP, 바이트 그대로 포함 | 4.5.0 |
| `clash_royale_reverse_design/` | 전체 원작 분석·재구축 자료, 46개 시스템 Markdown·22개 표·7,668행 | 연구 패키지 4.0.0, 2026-11-17 |
| `verification/original_game_v4_5_test_final.tap` | 기존 최종 게임 테스트 출력 | 251개 통과, 실패 0 |
| `REPACK_*.md`, `REPACK_MANIFEST.json` | 이번 취합 안내·변경 기록·CRC 및 원본 동일성 기록 | 재취합 2026-11-18 |

실행 게임은 전투 규칙 5, 저장·리플레이 형식 2를 유지합니다.
연구 패키지의 v4.4 게임 참조와 `implementation_reference/crownfall_4_4_cards.json`은
연구 작성 당시 기준을 보존한 자료입니다. 이번 실행 게임 버전은 별도 `crownfall-arena/`의 v4.5.0입니다.

## 보고서

- [게임 변경 기록](crownfall-arena/docs/RELEASE_NOTES.md)
- [게임 검증 기록](crownfall-arena/docs/VALIDATION_V4_5.md)
- [복원 데이터 구현 명세](crownfall-arena/docs/RECONSTRUCTION_V4_5.md)
- [원작 분석 개요](clash_royale_reverse_design/00_README.md)
- [연구 최종 검증](clash_royale_reverse_design/reports/release_validation.md)
- [이번 재취합 변경 기록](REPACK_CHANGELOG.md)
- [이번 재취합 동일성 검증](REPACK_VERIFICATION.md)

게임 251개, 연구 Node 99개·Python 55개 통과 수치는 기존 최종 보고서의 결과입니다.
이번 작업에서는 게임 검사를 다시 실행하거나 실행본을 재생성하지 않고 ZIP과 파일 동일성만 검사했습니다.
