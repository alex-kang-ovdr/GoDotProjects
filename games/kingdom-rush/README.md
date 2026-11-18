# Kingdom Rush v15 PlayHub 통합

## 소개 이미지 · v15.2.0

2026-11-18 PlayHub 로컬 런처에서 [실제 플레이 화면](Web/assets/gameplay-intro.png)을 캡처하여 소개 이미지로 등록했습니다. 게임 화면을 Chrome에서 1,360px 너비로 캡처하고 PNG 디코딩을 확인했습니다.

- 화면 이미지 SHA-256 `0d38144ff2faada5c0d8b275d358ff1da127c51d9bec04ba30d69d6c9a8b1e66`
- [통합판 ZIP](Archive/Releases/kingdom-rush-v15.2.0.zip)
- 통합판 ZIP SHA-256 `fc6ad7ea0af376d4fd1ea1369f6db1762cae4a07e0a9000cfd3af06a77ec2c01`

- 실행: [Web/index.html](Web/index.html)
- 통합 버전: 15.1.0 (2026-11-18). 최초 통합이며 공개 여부는 상위 catalog.json의 enabled:false를 유지한다.
- 원본: Source/Project 전체 20개 파일을 바이트 그대로 보존했다. 원본 dist와 중복 단일 HTML도 생략하지 않았다.
- 원본 ZIP: Archive/KingdomRush_Playable_v15_Source.zip
- 원본 SHA-256: 51e661bd4ddbb047001b7a0a6b729ed28abef607f63041ceedc95c5942ae4e01
- 실행 보관본: Archive/Releases/kingdom-rush-v15.1.0.zip (manifest 및 Web 전체)

## 실행과 저장

외부 에셋·네트워크 의존성 없는 Canvas 2D 단일 HTML이다. Web 실행 파일은 원본 dist/index.html과 동일하다. PlayHub 동기화 도구가 legacy-localstorage 브리지를 적용한다. 원본 키 kr_frontier_v15_progress를 변경하지 않았다. 최고 별, 강화, 설정만 저장하며 전투 중간 저장·계정 연동·멀티플레이는 원본에 없다. Hub 저장 브리지의 실제 계정 간 분리 및 재접속은 별도 Hub QA 대상이다.

## 언어·기기·권리

게임 UI는 한국어만 확인되어 supportedLocales는 ko만 선언한다. 영문 카탈로그 설명이 영어 게임 UI 지원을 의미하지 않는다. 마우스·키보드·터치 버튼 코드가 있으나 실제 모바일 기기 성능과 전체 36모드 밸런스는 미검증이다. 대표 이미지는 공식 아트가 아닌 문자형 placeholder SVG이다. 원작 공식 게임/포팅 제품이 아니며 원 권리 표기와 참조 데이터 설명은 Source/Project/README.md 및 data/DATA_NOTES.md를 유지한다.

## 검증

원본 엔진: node Source/Project/tests/engine.test.js
통합 정합성: node tests/integration.test.cjs
브라우저·Hub sync 결과는 담당 통합 작업에서 별도 보고한다. 소스 및 테스트 존재만으로 게임 전체 플레이 검증 완료를 주장하지 않는다.

Final Hub locale synchronization (2026-11-18): canonical Web includes generated locale helpers. Original source and pre-sync release are preserved; final release hashes are in docs/migration/game-update-20261118-final.json.
