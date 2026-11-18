# Underworld Escape (Hades reference) v2

최초 통합 2.1.0 / 2026-11-18. catalog enabled:false 유지. 공식 Hades 게임이나 원작 포팅이 아니라 비공식 액션 프로토타입이다.

- 실행: Web/index.html. 원본 2개 파일은 Source/Project에 바이트 그대로 보존.
- 입력 ZIP: Archive/Hades_Web_Playable_v2.zip
- 입력 SHA-256: fcba95b8ed535ba317db83bc81ff93796e8bd14fd45898549e782c2aeef7aadc
- 실행 보관: Archive/Releases/hades-v2.1.0.zip (manifest + Web)
- 언어: 실제 게임 UI는 한국어. 영문 카탈로그 설명만 제공하며 supportedLocales는 ko.

## 실제 범위

Canvas 2D로 이동·조준·공격·특수·대시, 6무기, 적·보스, 방 클리어·축복 선택·사망·재도전·영구 강화를 구현한다. 정적 mockup은 아니지만 최종 탈출 엔딩 없이 방이 계속 이어지는 소형 프로토타입이다. 3D 옵션은 WebGL이 아니라 Canvas 2.5D 표현이다. 가로/세로는 게임 레이아웃이며 기기 회전 강제가 아니다. 그림은 코드 렌더이고 커버는 문자 placeholder SVG.

## 저장·주의

원본 localStorage 키 underworld_meta, underworld_upgrades, uw_view, uw_orientation을 유지한다. 영혼·영구 강화·화면 설정만 저장하며 진행 중 런은 복원하지 않는다. legacy-localstorage 브리지 적용은 Hub sync가 담당한다. Hub 계정 저장 E2E는 별도 검증 대상.

원본은 localStorage 실패를 처리하지 않으며 백그라운드/키 포커스 이탈 시 입력 초기화도 별도 보장하지 않는다. 전체 밸런스, 최종 엔딩, 실제 모바일 기기, 접근성, 계정 저장 검증 완료로 표기하지 않는다. 본 통합은 게임 동작을 임의 수정하지 않는다.

검증 기록: tests/validation.json. 정합성: node tests/integration.test.cjs.

Final Hub locale synchronization (2026-11-18): canonical Web includes generated locale helpers. Original source and pre-sync release are preserved; final release hashes are in docs/migration/game-update-20261118-final.json.
