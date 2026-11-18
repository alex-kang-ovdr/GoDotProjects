# League of Legends / Nexus Front

- **검토일:** 2026-11-17
- **가져온 경로:** `WebProjects/League of Legends/`
- **버전·플랫폼:** Nexus Front는 첨부 README 기준 v7, PC 브라우저 중심의 독립 웹 프로토타입이며 모바일 폭/터치 HUD도 문서화되어 있습니다. 역기획 문서의 대상은 PC판 League of Legends, 소환사의 협곡 5대5입니다. 문서에 적힌 공식 패치 확인 기준은 2026-11-13, 26.22입니다.
- **통합 상태:** `WebProjects/League of Legends/Playable/Current/`의 JavaScript 게임은 원본 reference PoC로 유지됩니다. GamePlayForge native runtime에서 실행하거나 Studio 프로젝트로 Lua 이식하지 않았습니다. 향후 standalone C++20/Lua 엔진용 PoC-to-Lua 포팅 후보이며, Unreal Engine 대상이 아닙니다.

## 코드 확인: 실행본과 조작

실행 진입점은 [`Playable/Current/dist/index.html`](../../WebProjects/League%20of%20Legends/Playable/Current/README.md)입니다. JavaScript와 Canvas 2D, 브라우저 Web Audio를 사용하고, 영웅/규칙·렌더러·경로 탐색·입력·세이브 체크포인트·코치 기능을 분리한 모듈이 있습니다. 단일 오프라인 HTML 빌드도 제공됩니다. README는 플레이에 Node 설치가 필요 없고 원격 게임 API, CDN, 외부 이미지를 요청하지 않는다고 기록합니다. 설정과 진행은 브라우저 저장소에 둡니다.

조작은 방향키/조이스틱과 전장 클릭, Q/W/E/R 스킬, Shift+스킬 포인트 투자, D/F 보조기, B 귀환, P 상점, T 전술, G 안내, C 사망 분석, Tab 점수판, Esc 취소/닫기/일시정지 등입니다. 터치 환경은 드래그 조준과 터치형 HUD를 지원한다고 문서화되어 있습니다. 이 조작은 해당 프로토타입 설명이며 Riot 클라이언트 동작을 뜻하지 않습니다.

## 강점과 한계

**분석 — 강점:** 라인 압박, 파밍/골드, 레벨, 상점, 시야, 목표물, 팀 지시를 한 경기 흐름 안에서 연결합니다. 전장 길잡이·사망 분석·경기 보고서가 상태와 결과를 설명하고, 체크포인트 및 저장 버전 이전 처리도 구현되어 있습니다. 시뮬레이션과 렌더러의 분리, 명시적인 조작 취소와 목표물 경고는 다른 로컬 프로토타입에서 참고할 수 있습니다.

**첨부 문서 기록 — 한계:** Nexus Front는 LoL에서 라인·성장·시야·공성 개념을 참고한 독립 싱글 플레이어 5대5 MOBA입니다. 영웅, 스킬, 아이템, 수치, 그래픽, AI는 자체 구현이며 현행 LoL 규칙/밸런스 재현을 주장하지 않습니다. 온라인 멀티플레이가 없습니다. Riot의 비공개 서버 세부사항, 완전한 현행 수치, 일부 규칙은 역기획 문서에서도 미확인으로 둡니다.

GamePlayForge 적용은 기존 JS를 직접 연결하는 방식이 아니라 Lua 게임 규칙을 별도로 구현하고 native runtime에서 검증하는 계획입니다. 현재는 JS 원본 PoC와 설계 자료를 로컬에 보존한 상태이며 Lua 포팅은 미착수입니다.

## 출처와 권리

다음은 **첨부 문서에 기록된 URL, 이번 작업에서 웹 재확인하지 않음**입니다. 출처/버전 장부는 [90_sources_version_ledger.md](../../WebProjects/League%20of%20Legends/ReverseDesign/90_sources_version_ledger.md), 전체 목차는 [00_README.md](../../WebProjects/League%20of%20Legends/ReverseDesign/00_README.md)를 참고하십시오.

- Riot 공식 게임 개요: https://www.leagueoflegends.com/en-us/how-to-play/
- Riot 개발자 문서: https://developer.riotgames.com/docs/lol
- Riot 공식 패치 26.22: https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-22-notes/
- Riot 기술 글(결정성 소개): https://www.riotgames.com/en/news/determinism-league-legends-introduction

첨부 README는 원작 Riot 에셋을 번들하지 않는다고 설명하지만, 제3자 자료/파생 자료의 권리까지 이번 검토에서 확인한 것은 아닙니다. 재배포 전 출처와 라이선스를 확인하십시오. 게시본 링크는 [`Web/Previously_Published.url`](../../WebProjects/League%20of%20Legends/Web/Previously_Published.url)에 있습니다.

## 기존 검증 기록

`npm test`: **230 통과, 0 실패**. 로그: `Saved/Tests/source-review/league-tests.log`. Node 자동 테스트 결과이며 브라우저 시각·E2E 검증은 아닙니다.
