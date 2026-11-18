# Harbor Run

Harbor Run은 GTA V를 참고해 항만에서 목표 차량을 회수하도록 만든 독립 3D 액션 프로토타입입니다. 2026-11-18에 PlayHub 공개 카탈로그에 등록한 통합판은 **4.2.0**입니다.

[로컬 게임](Web/index.html) · [원본 가이드](Source/Project/README.md) · [v4 플레이 분석](Source/Project/docs/PLAYABILITY_ANALYSIS_v4.md)

[게임 소개 이미지](Web/assets/gameplay-intro.png)는 4.2.0의 첫 임무 화면을 1280×720 Chrome에서 웹 렌더러로 직접 캡처했습니다.

## 실행과 저장

한국어 UI를 제공하며 WebGL2가 필요합니다. PC에서는 WASD로 움직이고 마우스로 시점을 바꿉니다. PlayHub에서는 Harbor Run에 필요한 포인터 잠금 권한을 iframe에 부여합니다. 첫 플레이 화면의 렌더링이 끝난 뒤 프레임 시간을 재기 때문에 초기 렌더링 지연이 플레이 중 정지로 이어지지 않습니다.

로컬 실행과 PlayHub 저장은 기존 `harbor-run-save-v1` 형식을 사용합니다. PlayHub에서는 일시정지 화면에서 진행을 저장하거나 기존 JSON을 가져올 수 있습니다. JSON 파일을 내보내려면 로컬 실행을 사용하세요.

## 검증과 보관

- [최종 배포 산출물 검증](../../hub/reports/harbor-deployment-browser.json)에서 Chrome 960×720의 낮은 그래픽 프리셋으로 WebGL2, 브라우저 포인터 잠금, W 입력에 따른 1.275m 이동을 확인했습니다. 실제 Hub API의 저장 버전 1로 저장한 뒤 다시 열어 복원했으며 게임 오류는 없었습니다.
- `node --test hub/tests/harbor-run.browser.test.mjs`는 첫 화면 렌더링이 500ms 걸리는 경우와 플레이 중 300ms 정지 감지, 고립된 iframe의 렌더링·상대 좌표 시점 변경·저장 브리지를 검사합니다.
- 원본 Node 테스트 6개 모음이 통과했습니다. [원본 ZIP](Archive/Incoming/Harbor_TPS_Playable_v4.zip)의 SHA-256은 `77c28ee3523a38ae67b9cd608d1cece180e44e7925b36fe75490daa8ea8842c3`이며, [원본 폴더](Source/Project/)의 67개 파일은 ZIP과 바이트가 일치합니다.
- [이전 통합판 4.1.0](Archive/Releases/harbor-run-v4.1.0.zip)의 SHA-256은 `56fbfc524eff29673c92f340fadb7baab05587482fea75485080b36bd9740607`입니다.
- [통합판 4.2.0](Archive/Releases/harbor-run-v4.2.0.zip)의 SHA-256은 `44185355608c73cc60f005e207790afdeb08b559910b2b376948fad16e58a405`입니다. manifest와 Web 전체 6개 파일의 바이트와 ZIP 무결성을 확인했습니다.
