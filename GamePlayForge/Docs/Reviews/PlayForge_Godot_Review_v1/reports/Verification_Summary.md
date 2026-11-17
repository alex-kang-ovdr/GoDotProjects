# 문서 패키지 검증 요약

기준일: 2026-11-17

## 수행한 검사

- JSON 구문, 요구사항/출처/시험 식별자와 참조, 링크 대상, 주요 제품 결정 보존을 검사했습니다.
- 검토용 Runtime Profile의 JSON Schema: 정상 예시 1건과 금지 상태 변형 7건의 수락/거부를 확인했습니다.
- Chromium을 사용해 통합 HTML 문서의 데스크톱(1440×1050), 모바일(390×844) 표시, 문서 목차 검색, 앵커, 접기/펼치기를 검사했습니다. 해당 UI 검사 12개가 통과했습니다.
- 브라우저 정책이 file:// 탐색을 막아 HTML 내용을 Playwright의 set_content로 넣어 검사했습니다. 로컬 파일 직접 열기와 HTTP 배포의 모든 환경을 확인한 것은 아닙니다.
- 파일 Manifest에는 패키지 파일의 SHA-256과 바이트 크기를 기록했습니다. 완성된 패키지는 아래 명령으로 재검사할 수 있습니다.

```sh
python tools/verify_bundle.py
```

## 보고서 읽는 방법

[verification.json](verification.json)은 문서·스키마 정합성 검사입니다. 여기의 pass 횟수를 게임 기능·엔진 구현 테스트 통과 수로 해석하지 않습니다. 최종 파일 hash 검사는 위 명령이 MANIFEST.json을 읽어 별도 수행합니다.

[static-reader-check.json](static-reader-check.json)은 문서 열람 UI 검사입니다. 게임 에디터나 Godot 런타임 실행 시험이 아닙니다.

[Runtime_Acceptance_Checklist.md](Runtime_Acceptance_Checklist.md)의 64개 시험은 모두 미실시입니다. 실제 Godot 설치, C++/Lua 빌드, WASM Export, 협업 서버, Havok/Box2D, GPU 렌더링, 초기 Replication, 안전 Teleport, 성능 및 Unity MCP 비교를 수행한 것으로 표시하지 않았습니다.

## 포함하지 않은 자료

기존 v17/AI Workflow ZIP은 원본 확인 기록과 해시만 참조합니다. 기존 웹 목업, Godot 원본 코드·바이너리, 상용 SDK, 폰트 파일, 실행 가능한 마이그레이션 프로그램은 포함하지 않았습니다.
