# 공용 테스트 프레임워크 실행

## 목적

Captain Salvage는 공용 `game-test-framework`의 웹 타겟을 사용한다. 루트의 `Run-CaptainSalvage-Tests.bat`을 실행하면 같은 콘솔 메뉴에서 자동화 Test Suite 또는 수동 Visible Browser RHI를 고른다. 프레임워크 코드를 이 저장소에 복사하지 않으며, 기본 공용 경로는 `D:\Github\GoDotProjects-worktrees\game-test-framework`이다.

경로가 다르면 Windows 사용자·시스템 환경 변수 `GAME_TEST_FRAMEWORK_ROOT`에 공용 프레임워크 루트를 설정한다. Node.js와 Python 3, Edge 또는 Chrome 중 하나가 필요하다.

## 메뉴와 스위트

- `1 · syntax`: `data/balance.js`, `data/visual-tuning.js`, `game.js`, `sw.js` 문법과 병합 충돌 표식을 검사한다.
- `2 · runtime`: Canvas API 모의 런타임에서 출항·운석 지대 생성, 소형 운석 무피해, 대형 운석 고충격 모듈 피해, 다칸 점유·소켓, 드래그 장착·탄약고 병합, 컨트롤 타워 연결 분리, 수동/자동 미사일 소비, 질량 제한 방어막, 튜토리얼 대화, 일반/무기 충격 흔들림 강도를 확인한다.
- `3 · platform`: Manifest·서비스 워커 앱 셸 구성과 밸런스·시각 튜닝 로드, Android 가상 전진·해제·직교 줌·`MOVE` 재장착 시작, 기본 Top-View·우클릭 회전·좌표 역변환, 회전 일치 장착 소켓·운반 미리보기, 9-slice 베벨 규칙을 확인한다.
- `M · manual-rhi`: `--use-angle=d3d11`을 전달한 Edge·Chrome 창으로 `index.html`을 연다. 자동 판정은 하지 않으며 사람이 렌더링과 입력을 확인한다.

자동화 로그는 `Saved/AutomationTestResults/<suite>/<timestamp>/web.log`에 절대 경로로 남는다. 전체 스위트는 `Run-CaptainSalvage-Tests.bat --suite all`, 설정·명령 확인만은 `Run-CaptainSalvage-Tests.bat --suite all --dry-run`으로 실행한다.

## Visible Browser RHI의 경계

이 게임은 Canvas 2D 물리·렌더링 프로토타입이다. 따라서 `M`은 Unreal의 D3D12/Vulkan RHI를 게임에 추가하거나 성능을 자동 측정하는 기능이 아니다. Chromium ANGLE의 D3D11 백엔드와 브라우저 GPU 합성 창을 보이게 열어 수동 확인하는 경로다. GPU 비활성·헤드리스 옵션은 공용 프레임워크가 거부한다.

`file://` 수동 실행에서는 게임 조작을 확인할 수 있지만 PWA 서비스 워커는 등록되지 않는다. Android 설치·오프라인 캐시·저사양 성능은 HTTPS 호스트와 실제 기기에서 [수동 테스트 계획](TEST_PLAN.md)의 배포 시나리오로 별도 확인한다.
