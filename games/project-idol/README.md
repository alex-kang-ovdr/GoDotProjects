# PROJECT IDOL

## 소개 이미지 · v1.2.0

2026-11-18 PlayHub 로컬 런처에서 [실제 플레이 화면](Web/assets/gameplay-intro.png)을 캡처하여 소개 이미지로 등록했습니다. 게임 화면을 Chrome에서 1,360px 너비로 캡처하고 PNG 디코딩을 확인했습니다.

- 화면 이미지 SHA-256 `32b0c04d60143e90f359b1a1cda1d364a7f81c656b234dac6121e8962aa4a6e8`
- [통합판 ZIP](Archive/Releases/project-idol-v1.2.0.zip)
- 통합판 ZIP SHA-256 `78600f203877cb18b5ad7e99317ece1c3d8af9da7bf7c90116563e9d7d938fe9`

- [게임 시작](Web/index.html)
- [플랫폼 등록 정보](game.manifest.json)
- [개발 소스](Source/Project/)
- [이전 산출물](Archive/)

공통 실행 경로는 Web/index.html입니다. 플랫폼 노출 상태는 사용자 요청으로 제외이며 전체 목록은 상위 catalog.json에서 관리합니다.

통합판 1.1.0은 2026-11-18에 첫 화면 초기화를 복구했습니다. 스토리 탭에서 이번 달 이벤트의 대사를 읽고 선택할 수 있습니다. 완료한 이벤트는 스토리 아크별로 표시되며 기존 브라우저 저장 키 `idol_save_v1`에 기록됩니다.

- 원본은 [PROJECT_IDOL_Web_Playable_v1.zip](<../../references/hub-original/WebProjects/PROJECT IDOL (창작)/Archive/Web/PROJECT_IDOL_Web_Playable_v1.zip>)입니다. 수집본과 직전 개발 소스의 `index.html`이 일치했고, 두 실행본에 빠져 있던 스토리 화면을 기존 이벤트 처리 함수와 데이터에 연결했습니다.
- [통합 실행 보관본 1.1.0](Archive/Releases/project-idol-v1.1.0.zip)에 manifest와 `Web/` 전체가 들어 있습니다. SHA-256 `10334f4f9ac9fd7658c75a6e6e30a764958c9cd3b545dd6e34b81c8886823bb3`.
- 저장소 루트에서 `node tools/local-games/catalog-smoke.cjs project-idol`을 실행하면 첫 화면, 월 진행, 이벤트 선택, 저장, 재로딩 후 기록 복원을 검사합니다.
