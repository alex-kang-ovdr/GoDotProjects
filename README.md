# Captain Salvage

Captain Forever의 “전투 중 노획·재조립”에서 설계 영감을 얻은 오리지널 HTML Canvas 웹 프로토타입입니다. 원작의 코드, 아트, 이름, 음향이나 콘텐츠는 포함하지 않습니다.

## 실행

빌드 도구나 의존성은 없습니다. PC의 현대 브라우저에서 [index.html](index.html)을 열거나, 작업 폴더에서 정적 웹 서버를 실행해 접속하세요. HTTPS 정적 호스트에서는 Android·PC에서 설치 가능한 PWA 앱 셸과 오프라인 캐시가 활성화됩니다. `file://` 직접 열기는 게임만 실행하며 서비스 워커·설치는 제공하지 않습니다.

## 플레이

- `W` / `S`: 메인·후진 추진기의 실제 추력으로 전진·후진
- `A` / `D`: RCS 회전 추진기의 실제 힘으로 회전
- 우클릭 드래그: 기울임 없는 직교 Top-View의 수평 방향 회전
- 우클릭 짧은 클릭: 선택한 월드 좌표로 유도 `MISSILE` 발사
- `Space`: 레이저와 장착된 머신건·레일건 발사. 머신건은 총알 1발, 레일건은 총알 4발을 소비
- 중립 부품 좌클릭 드래그 → 빈 연결 격자 릴리스: 원하는 위치에 장착. 잘못 놓으면 원래 위치로 복귀
- `Shift` + 장착 부품 클릭 → 강조된 빈 연결점 클릭: 기존 부품을 떼어 재장착. 지휘 코어는 이동할 수 없습니다.
- `E`: 정거장 220px 안에서 1회 업그레이드와 전면 수리, 이후에는 전면 수리
- `R`: 즉시 새 항해

Android는 가로 화면을 권장합니다. 화면 조종계의 추진·회전·`FIRE`·`MSL`을 누르는 동안 비행/발사하고, `E`로 정거장을 사용합니다. `MOVE`를 누른 뒤 장착 부품을 탭하고 빈 소켓을 탭하면 재장착할 수 있습니다. 화면의 `−`/`＋`로 직교 줌을 바꿉니다.

기본 지휘 코어는 200 HP이며, 주무장은 레이저다. 좌·우 `MINI MSL`은 근거리 적을 자동 지정해 2초간 유도한 뒤 급가속하며 `MISSILE BAY` 재고를 소비한다. 수동 `MISSILE` 발사기 역시 미사일 2발을 소비한다. `BULLET BAY`와 `MISSILE BAY`는 서로 다른 재고이며, 같은 종류의 부유 탄약고는 드래그 릴리스로 병합해 탄약을 합치고 더 튼튼한 부품을 커서에 유지한다.

함선은 기울지 않은 Top-View의 마인크래프트풍 박스·도트 텍스처로 그리며, 맞닿은 박스 사이에는 베벨을 넣지 않습니다. 1칸 블록, 2·3·4칸 빔, 2×2 블록, 1·2칸 삼각 기둥을 회수·장착할 수 있습니다. 파트가 파괴되면 지휘 코어(컨트롤 타워)로 이어진 4방향 격자 연결만 유효하며, 끊어진 덩어리는 내구도·탄약을 보존한 중립 회수 부품으로 흩어집니다. `SHIELD GEN`은 생성기 커버 질량에 따라 0~5 레이어를 유지·복구하고, 좌측 상단의 파란 사각형과 레이어별 고정 투명도의 함선 외곽으로 표시됩니다. 충격으로 파트가 파괴되면 해당 함선 본체만 짧게 흔들리고, 무기 파괴는 조금 더 크게 반응합니다. 항로의 소형 운석은 밀어내기만 하고, 중·대형 운석은 큰 충격에서 접촉 부품을 손상시킵니다.

## 항로

출발 지점에서 최종 목표까지는 Kepler 수리 도크, Rift Breaker, Lyra 무기 중계소, Crown Eater, Perseus 반응로 베이를 지나는 7구역 항로다. 두 중간 보스를 격파해야 최종 보스 `VOID WARDEN`이 활성화된다. 출발 장비의 순항과 전투·정비를 합친 목표 세션 길이는 약 30분이며, 실제 플레이테스트로 아직 보정하지 않은 설계값이다. 자세한 경로·스폰·성능 상한은 [월드 설계](docs/WORLD_ROUTE.md)를 본다.

## 설계와 검증

- [GDD](docs/GDD.md): 조사 근거, 시스템 규칙, 범위, 성능 목표
- [10개 마일스톤](docs/MILESTONES.md): 커밋 단위 구현 순서
- [산출물·기능 검증 현황](docs/DELIVERABLES.md): 실행물, 문서, 조사 자료, 미검증 항목의 한글 인수인계 목록
- [수동 테스트 계획](docs/TEST_PLAN.md): 릴리스 후보 확인 절차
- [월드 항로 설계](docs/WORLD_ROUTE.md): 30분 루트, 스폰 디렉터, 보스·정거장 규칙
- [밸런스 단일 소스](docs/BALANCE_GUIDE.md): 조정 파일과 검증 순서
- [시각 튜닝 단일 소스](docs/VISUAL_TUNING_GUIDE.md): 색상·투명도·피드백 조정 파일
- [절차 우주 배경 구현 계획](docs/PROCEDURAL_SPACE_BACKGROUND_PLAN.md): 텍스처 없는 2D 생성기, 단계별 검증·커밋 기준
- [우주 배경 예산 시뮬레이션](docs/SPACE_BACKGROUND_BUDGET_SIMULATION.md): 메모리·배포 용량별 구현 선택과 측정 기준
- [PC · Android · 웹 배포 타겟](docs/PLATFORM_TARGETS.md): PWA, 터치 조작, 정적 호스팅·검증 경계
- [PC · Android · 웹 빌드](docs/BUILD_TARGETS.md): 재생성 가능한 정적 산출물, PC 실행 BAT, Android debug APK 빌드 절차
- [공용 테스트 프레임워크 실행](docs/TEST_AUTOMATION.md): BAT 메뉴, 자동화 스위트, Visible Browser RHI 수동 확인
- [References](References/README.md): 원작 분석, CC0 배경 텍스처, 별·은하수·생성기 조사

## 자동화 테스트

Windows에서는 [Run-CaptainSalvage-Tests.bat](Run-CaptainSalvage-Tests.bat)을 실행한다. 콘솔 메뉴에서 `syntax`, `runtime`, `platform` 자동화 스위트 또는 `M`의 Visible Browser RHI 수동 실행을 고른다. 공용 프레임워크가 다른 위치에 있으면 `GAME_TEST_FRAMEWORK_ROOT` 환경 변수에 그 경로를 설정한다. 자세한 전제·로그 위치·RHI의 범위는 [테스트 자동화 문서](docs/TEST_AUTOMATION.md)를 따른다.
