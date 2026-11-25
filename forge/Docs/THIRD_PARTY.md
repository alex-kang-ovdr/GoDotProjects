# 사용한 런타임 구성요소

기준일: 2026-11-17. 게임/에디터 원본 자료의 출처는 `imports.json`과 게임별 분석에 별도로 기록합니다.

| 구성요소 | 버전 | 출처 | 라이선스/역할 |
| --- | --- | --- | --- |
| nlohmann/json | 3.11.3 | [공식 저장소](https://github.com/nlohmann/json/tree/v3.11.3) | MIT, 네이티브 JSONL 상태 전달. `Engine/vendor/nlohmann/LICENSE.MIT` 보존 |
| Yjs | package-lock.json에 고정 | [공식 저장소](https://github.com/yjs/yjs), [업데이트 API](https://docs.yjs.dev/api/document-updates) | MIT, GDScript 텍스트 CRDT 병합과 사용자별 Undo |
| ws | package-lock.json에 고정 | [공식 저장소](https://github.com/websockets/ws) | MIT, 실제 협업 WebSocket |
| Playwright / esbuild | package-lock.json에 고정 | [Playwright](https://github.com/microsoft/playwright), [esbuild](https://github.com/evanw/esbuild) | 개발·검증 및 로컬 번들 제작용 |

브라우저용 Yjs는 `Tools/yjs-entry.js`를 로컬 번들로 만들며 CDN을 사용하지 않습니다.
다시 만들려면 `npm run build:studio`를 실행합니다.
Tappy SVG 파일은 이번 프로젝트의 도형 에셋이며 상용 게임의 원본 이미지 파일을 가져오지 않았습니다.
