# 사용한 런타임 구성요소

기준일: 2026-11-17. 게임/에디터 원본 자료의 출처는 `imports.json`과 게임별 분석에 별도로 기록합니다.

| 구성요소 | 버전 | 출처 | 라이선스/역할 |
| --- | --- | --- | --- |
| Lua | 5.4.9 | [공식 배포](https://www.lua.org/ftp/), [참조 매뉴얼](https://www.lua.org/manual/5.4/manual.html) | MIT 계열 Lua 라이선스, 실제 게임 VM. `Engine/vendor/lua-5.4.9/doc/readme.html`에 원문 보존 |
| nlohmann/json | 3.11.3 | [공식 저장소](https://github.com/nlohmann/json/tree/v3.11.3) | MIT, 네이티브 JSONL 상태 전달. `Engine/vendor/nlohmann/LICENSE.MIT` 보존 |
| Yjs | package-lock.json에 고정 | [공식 저장소](https://github.com/yjs/yjs), [업데이트 API](https://docs.yjs.dev/api/document-updates) | MIT, Lua 텍스트 CRDT 병합과 사용자별 Undo |
| ws | package-lock.json에 고정 | [공식 저장소](https://github.com/websockets/ws) | MIT, 실제 협업 WebSocket |
| Playwright / esbuild | package-lock.json에 고정 | [Playwright](https://github.com/microsoft/playwright), [esbuild](https://github.com/evanw/esbuild) | 개발·검증 및 로컬 번들 제작용 |

Lua 5.4.9 배포 tar.gz SHA-256: `2335b6c582a52654f94612bf10d2f4672805d05329aa6568b1d8cd9e5c6fb8e6`.
브라우저용 Yjs는 `Tools/yjs-entry.js`를 로컬 번들로 만들며 CDN을 사용하지 않습니다.
다시 만들려면 `npm run build:studio`를 실행합니다.
Tappy SVG 파일은 이번 Lua 프로젝트의 도형 에셋이며 상용 게임의 원본 이미지 파일을 가져오지 않았습니다.
