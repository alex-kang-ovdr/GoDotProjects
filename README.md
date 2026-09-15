# Captain Salvage

Captain Forever의 “전투 중 노획·재조립”에서 설계 영감을 얻은 오리지널 HTML Canvas 웹 프로토타입입니다. 원작의 코드, 아트, 이름, 음향이나 콘텐츠는 포함하지 않습니다.

## 실행

빌드 도구나 의존성은 없습니다. PC의 현대 브라우저에서 [index.html](index.html)을 열거나, 작업 폴더에서 정적 웹 서버를 실행해 접속하세요. HTTPS 정적 호스트에서는 Android·PC에서 설치 가능한 PWA 앱 셸과 오프라인 캐시가 활성화됩니다. `file://` 직접 열기는 게임만 실행하며 서비스 워커·설치는 제공하지 않습니다.

## 플레이

- `W` / `S`: 전진·후진 추진
- `A` / `D`: 회전
- `Space`: 모든 레이저 발사
- 클릭: 420px 안의 회수 가능 부품을 가장 가까운 빈 연결점에 장착
- `Shift` + 장착 부품 클릭 → 강조된 빈 연결점 클릭: 기존 부품을 떼어 재장착. 지휘 코어는 이동할 수 없습니다.
- `E`: 정거장 220px 안에서 1회 업그레이드와 전면 수리, 이후에는 전면 수리
- `R`: 즉시 새 항해

Android는 가로 화면을 권장합니다. 화면 조종계의 추진·회전·`FIRE`를 누르는 동안 비행하고, `E`로 정거장을 사용합니다. `MOVE`를 누른 뒤 장착 부품을 탭하고 빈 소켓을 탭하면 재장착할 수 있습니다. 화면의 `−`/`＋`로 직교 줌을 바꿉니다.

지휘 코어를 잃으면 항해가 끝납니다. 적의 지휘 코어를 먼저 파괴하면 살아 있는 모듈이 회수 가능 잔해로 남습니다. 부품과 함선은 개별 모듈 단위의 2D 충돌을 하며, 큰 충격과 피격은 균열·파편·스파크로 표시됩니다. 항로의 소형 운석은 밀어내기만 하고, 중·대형 운석은 큰 충격에서 접촉 부품을 손상시킵니다.

## 항로

출발 지점에서 최종 목표까지는 Kepler 수리 도크, Rift Breaker, Lyra 무기 중계소, Crown Eater, Perseus 반응로 베이를 지나는 7구역 항로다. 두 중간 보스를 격파해야 최종 보스 `VOID WARDEN`이 활성화된다. 출발 장비의 순항과 전투·정비를 합친 목표 세션 길이는 약 30분이며, 실제 플레이테스트로 아직 보정하지 않은 설계값이다. 자세한 경로·스폰·성능 상한은 [월드 설계](docs/WORLD_ROUTE.md)를 본다.

## 설계와 검증

- [GDD](docs/GDD.md): 조사 근거, 시스템 규칙, 범위, 성능 목표
- [10개 마일스톤](docs/MILESTONES.md): 커밋 단위 구현 순서
- [산출물·기능 검증 현황](docs/DELIVERABLES.md): 실행물, 문서, 조사 자료, 미검증 항목의 한글 인수인계 목록
- [수동 테스트 계획](docs/TEST_PLAN.md): 릴리스 후보 확인 절차
- [월드 항로 설계](docs/WORLD_ROUTE.md): 30분 루트, 스폰 디렉터, 보스·정거장 규칙
- [절차 우주 배경 구현 계획](docs/PROCEDURAL_SPACE_BACKGROUND_PLAN.md): 텍스처 없는 2D 생성기, 단계별 검증·커밋 기준
- [우주 배경 예산 시뮬레이션](docs/SPACE_BACKGROUND_BUDGET_SIMULATION.md): 메모리·배포 용량별 구현 선택과 측정 기준
- [PC · Android · 웹 배포 타겟](docs/PLATFORM_TARGETS.md): PWA, 터치 조작, 정적 호스팅·검증 경계
- [공용 테스트 프레임워크 실행](docs/TEST_AUTOMATION.md): BAT 메뉴, 자동화 스위트, Visible Browser RHI 수동 확인
- [References](References/README.md): 원작 분석, CC0 배경 텍스처, 별·은하수·생성기 조사

## 자동화 테스트

Windows에서는 [Run-CaptainSalvage-Tests.bat](Run-CaptainSalvage-Tests.bat)을 실행한다. 콘솔 메뉴에서 `syntax`, `runtime`, `platform` 자동화 스위트 또는 `M`의 Visible Browser RHI 수동 실행을 고른다. 공용 프레임워크가 다른 위치에 있으면 `GAME_TEST_FRAMEWORK_ROOT` 환경 변수에 그 경로를 설정한다. 자세한 전제·로그 위치·RHI의 범위는 [테스트 자동화 문서](docs/TEST_AUTOMATION.md)를 따른다.
