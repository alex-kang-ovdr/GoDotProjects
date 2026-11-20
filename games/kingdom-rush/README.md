# Kingdom Rush · PlayHub 통합 (v18.1.0)

- 실행 SSOT: [Web/index.html](Web/index.html) (`Source/Project/dist/index.html` + PlayHub 언어 런타임)
- 소스 SSOT: [Source/Project](Source/Project/README.md) (`KingdomRush_Playable_v18_Source.zip` 기준)
- 공개 상태: 상위 `games/catalog.json`의 기존 `enabled: false` 유지 (통합·검증 후 수동 공개)

## 버전 및 아카이브 이력 (과거 버전 포함 보존)

| 버전 | 일자 | 구분 | 파일 경로 | SHA-256 |
|---|---|---|---|---|
| **v18.1.0 (최신)** | 2026-11-20 | 통합 릴리스 ZIP | [Archive/Releases/kingdom-rush-v18.1.0.zip](Archive/Releases/kingdom-rush-v18.1.0.zip) | `54e8edecf970fb1f1811445e88c56563f4a780c09d0f78efaa402cef2c650d24` |
| **v18 원본** | 2026-11-20 | 수집 원본 ZIP | [Archive/Incoming/KingdomRush_Playable_v18_Source.zip](Archive/Incoming/KingdomRush_Playable_v18_Source.zip) | `1552068510f4939d5a4fb699b7d3cdf2b373e5934fccc45f484e74f1b1473799` |
| **v15.2.0 사전 스냅샷** | 2026-11-20 | 업그레이드 직전 스냅샷 | [Archive/BuildSteps/kingdom-rush-v15.2.0-before-v18.zip](Archive/BuildSteps/kingdom-rush-v15.2.0-before-v18.zip) | v15.2.0 `manifest` + `Web/` + `Source/Project/` 전체 보존 |
| **v15.2.0 (과거)** | 2026-11-18 | 통합 릴리스 ZIP | [Archive/Releases/kingdom-rush-v15.2.0.zip](Archive/Releases/kingdom-rush-v15.2.0.zip) | `fc6ad7ea0af376d4fd1ea1369f6db1762cae4a07e0a9000cfd3af06a77ec2c01` |
| **v15.1.0 (과거)** | 2026-11-18 | 최초 통합 ZIP | [Archive/Releases/kingdom-rush-v15.1.0.zip](Archive/Releases/kingdom-rush-v15.1.0.zip) | 보존됨 |
| **v15 원본 (과거)** | 2026-11-18 | 수집 원본 ZIP | [Archive/KingdomRush_Playable_v15_Source.zip](Archive/KingdomRush_Playable_v15_Source.zip) | `51e661bd4ddbb047001b7a0a6b729ed28abef607f63041ceedc95c5942ae4e01` |

## v18 주요 변경 및 저장·언어
- v18에서 전투 이어하기(체크포인트), JSON 백업, 12개 전장 및 타워·적 데이터 보강, 소형 화면 선택·조작 개선이 추가되었습니다.
- 기존 `Web/vendor/playhub-locale.js`, `Web/vendor/playhub-dictionary.js`, `Web/assets/platform-cover.svg`, `Web/assets/gameplay-intro.png`를 보존했습니다.
- 게임 UI는 한국어(`supportedLocales: ["ko"]`)이며 원작 공식 포팅 제품이 아닙니다.

## 검증
- 원본 엔진·체크포인트 테스트: `node Source/Project/tests/engine.test.js` (및 `camera/checkpoint/picking/progress.test.js`)
- 통합 정합성: `node tests/integration.test.cjs`
