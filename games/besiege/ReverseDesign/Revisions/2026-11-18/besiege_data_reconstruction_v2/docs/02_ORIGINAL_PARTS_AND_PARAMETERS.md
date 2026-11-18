# 02. 원작 부품·매개변수 데이터 복원

> R2 · 조사 기준 2026-11-18 · Steam PC 공개 문헌. **실행 파일·설치본·원본 데이터 파일을 추출하지 않았다.** 아래 표는 공개 사실을 출처·버전·적용 범위와 함께 재구축한 연구 데이터다.

## 1. 이번 복원의 결과와 정확한 범위

부품 카탈로그는 **93개 조사 레코드**다. 이 숫자는 원작의 전체 블록 수, 내부 ID 수, 고유 팔레트 항목 수를 뜻하지 않는다. 개별 변형 명칭의 대응을 확정하지 못한 후보도 별도로 보관한다.

| 판정 | 수 | 의미 |
|---|---:|---|
| 동작 설명 확인 | 66 | 공식 설명에서 복원 가능한 행동이나 설정 변경이 있음 |
| 명칭·변경 이력 확인 | 19 | 해당 이름이나 수정 이력만 확인했으며 상세 동작까지 복원한 것은 아님 |
| 재검증 대기 | 8 | 이전 분석에서 이어받은 개별 변형·항목으로 이번 공식 본문 대조가 부족함 |

[부품 원장 JSON](../data/original_parts.json), [매개변수 원장 JSON](../data/original_parameters.json), [출처 원장 JSON](../research/catalog_sources.json)을 함께 사용한다. 매개변수 **80행은 수치 80개가 아니다.** 배율·범위·수량·단위 미확정 질량 기록, bool 설정, enum 모드, 역사적 동작 변경을 포함한다.

한글 명칭은 이 자료에서 이해를 돕기 위해 붙인 번역이며 원작 한국어 UI 문자열을 추출한 결과가 아니다. `bsg_*`, `PAR-*`, `CAT-*`도 이 자료의 관리 ID이다. `original_block_id`는 모두 `null`이며 이를 `.bsg` 파일의 내부 숫자 ID로 사용하면 안 된다.

## 2. 가장 중요한 데이터 정정

### 2.1 원작 수치와 IRONWOOD 수치를 한 테이블에서 덮어쓰지 않는다

현재 웹 게임의 질량, HP, 출력, 관절 강도는 독립 구현값이다. 원작 공식 글에 동일 이름이 나타난다는 이유로 해당 값을 원작 데이터로 승격하지 않는다. 특히 아래 세 문장을 구분한다.

1. **확인된 기록:** 어느 공식 발표가 특정 설정이나 수치를 언급했다.
2. **현행 동작:** 현재 보유 설치판에서 해당 설정이 실제로 그렇게 작동한다.
3. **구현안:** 웹 게임에서 비슷한 제작 경험을 제공하기 위해 정한 모델과 계수다.

이 원장은 1을 복구한다. 2는 아직 계측하지 않았고, 3은 별도 구현 테이블에서 관리한다. 모든 부품의 `current_numeric_parameters`와 매개변수의 `current_applicable_value`를 `null`로 유지한 이유다.

### 2.2 같은 부품도 저장 시점에 따라 규칙이 달라진다

| 근거 | 복원할 경계 | 잘못된 적용 |
|---|---|---|
| V1.26 | 바퀴 collider 개편과 구형 저장의 원래 구성 유지 | 모든 저장 기체에 새 collider를 일괄 대입 |
| V1.75 | Small Wheel의 구체 collider·자유 구름 | 다른 모든 바퀴 변형도 동일하다고 확대 |
| V1.75 | 새 Build Surface의 공력 기본 OFF | 과거 저장의 명시 ON 설정까지 끄기 |
| V1.77 본 공지 | Cannon·Water Cannon 상한3x | 3N 또는 탄속3배로 해석 |
| V1.91 | Booster의 연료 공급량에 따른 추력 제한 | 무한 공급으로만 검증한 추진식을 그대로 확정 |

근거: [V1.26](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements), [V1.75](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1772123201&feed=steam_community_announcements), [V1.77](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1778853723&feed=steam_community_announcements), [V1.91](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0).

### 2.3 숫자가 보이더라도 충돌을 숨기지 않는다

| 그룹 | 공개 기록 A | 공개 기록 B | 채택 판정 |
|---|---|---|---|
| `CF-ROPE-MASS-SCOPE` | V1.20: Rope total 기본1→0.4, 기존 저장 제외 | 후속1.20.17395: Rope+Winch 로딩 질량0.5 | component/aggregate 및 저장 범위를 확인하기 전 서로 덮어쓰지 않음 |
| `CF-FUEL-BARREL-MASS` | 2026-06-05: Large 질량은 Small의10배 | 2026-06-12: 100Fuel Large1개가10Fuel Small10개보다 가벼움 | 건조·충전·평가 조건 미확정. 두 주장 보존, 현행값 `null` |

Rope 수치는 게임 질량 단위이며 kg 환산 근거가 없다. 연료 질량 비교는 두 출시 전 설명의 차이여서 실제 설치판의 충전상태별 질량 측정이 필요하다. [Rope 공지와 hotfix](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements), [연료 개발 글 두 편](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0).

## 3. 주요 공개 설정 원장 읽기

| 대상 | 복구된 내용 | 적용 범위 |
|---|---|---|
| Axle | 두 방향 굽힘, 자유 축회전 차단 | V1.25 기능 설명 |
| Suspension / Grabber / Slider | 감쇠 / 유연 연결 / 사전 확장 설정 | V1.25 추가 기능 |
| Cannon | 탄체 크기, chainshot | V1.73 추가 기능 |
| Grenade | 퓨즈 지연, 화염으로 퓨즈 시작, 연속 충돌 | V1.73 |
| Anglometer | initial / gravity / velocity | V1.77; initial 기본 |
| Logic Gate | counter / SR latch / D latch / random 추가 | V1.10; 전체 목록은 아님 |
| Small / Large Fuel Barrel | 10 / 100 Fuel | 2026-06-05 출시 전 발표 |
| Booster | 내장1Fuel, 기본1Fuel/s | 같은 출시 전 발표; 출력에 따른 소비식 미공개 |
| Flamethrower | 내장10Fuel, 1Fuel/s | 같은 출시 전 발표 |
| Blaster | 1.25Fuel/발 | 같은 발표에서 추후 조정 가능 명시 |
| Crossbow | 탄약30 | V0.42 역사값; 현행값 미확정 |

위 항목은 [V1.25](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements), [V1.73](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1750957475&feed=steam_community_announcements), [V1.10](https://store.steampowered.com/news/posts/?appids=346010&enddate=1652972552&feed=steam_community_announcements), [V1.77](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1778853723&feed=steam_community_announcements), [연료 개발 글](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0), [V0.42](https://store.steampowered.com/news/posts/?appids=346010&enddate=1491653692)을 대조했다. 더 상세한 행마다 출처·버전·저장 적용 범위를 JSON에 기록했다.

## 4. 전체 카탈로그 색인

판정 `동작`은 공개 설명이 있는 범위만 확인한 것이다. 완전한 수치 복원이나 현행 설치판 검증을 뜻하지 않는다. `명칭/변경`은 이름 또는 변경 이력만 확인했다. `대기` 행은 아직 공식 사실 데이터로 사용하지 않는다.

### 4.1 기본 게임

| 관리 키 | 영문명 / 한글 참조명 | 판정 | 근거 |
|---|---|---|---|
| `bsg_starting_block` | Starting Block / Source Cube / 시작 블록 | 동작 | [CAT-011](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1772123201&feed=steam_community_announcements), [CAT-012](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1750957475&feed=steam_community_announcements) |
| `bsg_small_wooden_block` | Small Wooden Block / 작은 목재 블록 | 명칭/변경 | [CAT-022](https://store.steampowered.com/news/posts/?appids=346010&enddate=1485899208) |
| `bsg_wooden_block` | Wooden Block / 목재 블록 | 동작 | [CAT-010](https://store.steampowered.com/news/posts/?appids=346010&enddate=1716555565&feed=steam_community_announcements), [CAT-021](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1429530687) |
| `bsg_wooden_pole` | Wooden Pole / 목재 기둥 | 명칭/변경 | [CAT-021](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1429530687), [CAT-018](https://store.steampowered.com/news/posts/?appids=346010&enddate=1450557513) |
| `bsg_log` | Log / 통나무 | 동작 | [CAT-022](https://store.steampowered.com/news/posts/?appids=346010&enddate=1485899208), [CAT-013](https://store.steampowered.com/news/posts/?appids=346010&enddate=1491653692) |
| `bsg_brace` | Brace / 보강대 | 동작 | [CAT-001](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements), [CAT-002](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements) |
| `bsg_ballast` | Ballast / 밸러스트 | 동작 | [CAT-010](https://store.steampowered.com/news/posts/?appids=346010&enddate=1716555565&feed=steam_community_announcements) |
| `bsg_half_pipe` | Half Pipe / 반원통 | 명칭/변경 | [CAT-021](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1429530687) |
| `bsg_build_surface` | Build Surface / 자유 표면 | 동작 | [CAT-020](https://store.steampowered.com/news/posts/?appids=346010&enddate=1652972552&feed=steam_community_announcements), [CAT-011](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1772123201&feed=steam_community_announcements) |
| `bsg_unpowered_wheel` | Unpowered Wheel / 무동력 바퀴 | 명칭/변경 | [CAT-020](https://store.steampowered.com/news/posts/?appids=346010&enddate=1652972552&feed=steam_community_announcements) |
| `bsg_small_wheel` | Small Wheel / 작은 바퀴 | 동작 | [CAT-011](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1772123201&feed=steam_community_announcements) |
| `bsg_roller_wheel` | Roller Wheel / 롤러 바퀴 | 동작 | [CAT-003](https://store.steampowered.com/news/posts/?appids=346010&enddate=1734029661&feed=steam_community_announcements) |
| `bsg_steering_block` | Steering Block / 조향 블록 | 동작 | [CAT-008](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements), [CAT-003](https://store.steampowered.com/news/posts/?appids=346010&enddate=1734029661&feed=steam_community_announcements), [CAT-004](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1778853723&feed=steam_community_announcements) |
| `bsg_steering_hinge` | Steering Hinge / 조향 힌지 | 동작 | [CAT-020](https://store.steampowered.com/news/posts/?appids=346010&enddate=1652972552&feed=steam_community_announcements), [CAT-008](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |
| `bsg_suspension` | Suspension / 현가 장치 | 동작 | [CAT-001](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements) |
| `bsg_bounce_pad` | Bounce Pad / 반발 패드 | 동작 | [CAT-003](https://store.steampowered.com/news/posts/?appids=346010&enddate=1734029661&feed=steam_community_announcements) |
| `bsg_hinge` | Hinge / 힌지 | 명칭/변경 | [CAT-013](https://store.steampowered.com/news/posts/?appids=346010&enddate=1491653692) |
| `bsg_swivel_joint` | Swivel Joint / 스위블 관절 | 명칭/변경 | [CAT-021](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1429530687) |
| `bsg_ball_joint` | Ball Joint / 볼 관절 | 동작 | [CAT-001](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements), [CAT-021](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1429530687) |
| `bsg_axle` | Axle / 구동축 관절 | 동작 | [CAT-001](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements) |
| `bsg_spinning_block` | Spinning Block / 회전 블록 | 동작 | [CAT-018](https://store.steampowered.com/news/posts/?appids=346010&enddate=1450557513), [CAT-008](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |
| `bsg_powered_cog` | Powered Cog / 구동 기어 | 명칭/변경 | [CAT-024](https://store.steampowered.com/news/posts/?appids=346010&enddate=1716555565&feed=steam_community_announcements) |
| `bsg_unpowered_cog` | Unpowered Cog / 무동력 기어 | 동작 | [CAT-018](https://store.steampowered.com/news/posts/?appids=346010&enddate=1450557513) |
| `bsg_large_cog` | Large Cog / 큰 기어 | 동작 | [CAT-017](https://store.steampowered.com/news/posts/?appids=346010&enddate=1435070217), [CAT-007](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |
| `bsg_fly_wheel` | Fly Wheel / 플라이휠 | 동작 | [CAT-003](https://store.steampowered.com/news/posts/?appids=346010&enddate=1734029661&feed=steam_community_announcements) |
| `bsg_slider` | Slider / 슬라이더 | 동작 | [CAT-021](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1429530687), [CAT-001](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements) |
| `bsg_piston` | Piston / 피스톤 | 동작 | [CAT-018](https://store.steampowered.com/news/posts/?appids=346010&enddate=1450557513), [CAT-013](https://store.steampowered.com/news/posts/?appids=346010&enddate=1491653692) |
| `bsg_contractable_spring` | Contractable Spring / 수축 스프링 | 명칭/변경 | [CAT-021](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1429530687), [CAT-018](https://store.steampowered.com/news/posts/?appids=346010&enddate=1450557513) |
| `bsg_rope_winch` | Rope & Winch / 로프와 윈치 | 동작 | [CAT-018](https://store.steampowered.com/news/posts/?appids=346010&enddate=1450557513), [CAT-002](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements) |
| `bsg_grabber` | Grabber / 집게 | 동작 | [CAT-018](https://store.steampowered.com/news/posts/?appids=346010&enddate=1450557513), [CAT-001](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements), [CAT-008](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |
| `bsg_decoupler` | Decoupler / 분리기 | 명칭/변경 | [CAT-018](https://store.steampowered.com/news/posts/?appids=346010&enddate=1450557513), [CAT-008](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |
| `bsg_flying_block` | Flying Block / 비행 블록 | 명칭/변경 | [CAT-002](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements), [CAT-012](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1750957475&feed=steam_community_announcements) |
| `bsg_propeller` | Propeller / 프로펠러 | 동작 | [CAT-021](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1429530687), [CAT-023](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1780297200&feed=steam_community_announcements) |
| `bsg_small_propeller` | Small Propeller / 작은 프로펠러 | 명칭/변경 | [CAT-018](https://store.steampowered.com/news/posts/?appids=346010&enddate=1450557513) |
| `bsg_wing` | Wing / 날개 | 동작 | [CAT-023](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1780297200&feed=steam_community_announcements) |
| `bsg_balloon` | Small Balloon / Balloon / 소형 풍선 | 동작 | [CAT-021](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1429530687), [CAT-001](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements) |
| `bsg_hot_air_balloon` | Hot Air Balloon / 열기구 | 동작 | [CAT-002](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements) |
| `bsg_drag_block` | Drag Block / 저항 블록 | 동작 | [CAT-003](https://store.steampowered.com/news/posts/?appids=346010&enddate=1734029661&feed=steam_community_announcements) |
| `bsg_cannon` | Cannon / 대포 | 동작 | [CAT-012](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1750957475&feed=steam_community_announcements), [CAT-004](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1778853723&feed=steam_community_announcements) |
| `bsg_shrapnel_cannon` | Shrapnel Cannon / 산탄포 | 명칭/변경 | [CAT-017](https://store.steampowered.com/news/posts/?appids=346010&enddate=1435070217), [CAT-013](https://store.steampowered.com/news/posts/?appids=346010&enddate=1491653692) |
| `bsg_crossbow` | Crossbow / 쇠뇌 | 동작 | [CAT-013](https://store.steampowered.com/news/posts/?appids=346010&enddate=1491653692) |
| `bsg_flamethrower` | Flamethrower / 화염방사기 | 동작 | [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0), [CAT-014](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_water_cannon` | Water Cannon / 물대포 | 동작 | [CAT-018](https://store.steampowered.com/news/posts/?appids=346010&enddate=1450557513), [CAT-004](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1778853723&feed=steam_community_announcements) |
| `bsg_vacuum` | Vacuum / 흡입기 | 동작 | [CAT-013](https://store.steampowered.com/news/posts/?appids=346010&enddate=1491653692), [CAT-008](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |
| `bsg_torch` | Small Flame Torch / Torch / 횃불 | 명칭/변경 | [CAT-021](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1429530687), [CAT-012](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1750957475&feed=steam_community_announcements) |
| `bsg_spike` | Spike / 스파이크 | 명칭/변경 | [CAT-013](https://store.steampowered.com/news/posts/?appids=346010&enddate=1491653692) |
| `bsg_blade` | Blade / 칼날 | 명칭/변경 | [CAT-017](https://store.steampowered.com/news/posts/?appids=346010&enddate=1435070217) |
| `bsg_drill` | Drill / 드릴 | 동작 | [CAT-017](https://store.steampowered.com/news/posts/?appids=346010&enddate=1435070217), [CAT-020](https://store.steampowered.com/news/posts/?appids=346010&enddate=1652972552&feed=steam_community_announcements) |
| `bsg_metal_jaw` | Metal Jaw / 금속 턱 | 동작 | [CAT-001](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements) |
| `bsg_bomb` | Bomb / 폭탄 | 명칭/변경 | [CAT-013](https://store.steampowered.com/news/posts/?appids=346010&enddate=1491653692), [CAT-020](https://store.steampowered.com/news/posts/?appids=346010&enddate=1652972552&feed=steam_community_announcements) |
| `bsg_remote_grenade` | Remote Grenade / 원격 수류탄 | 동작 | [CAT-018](https://store.steampowered.com/news/posts/?appids=346010&enddate=1450557513), [CAT-012](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1750957475&feed=steam_community_announcements) |
| `bsg_explosive_rocket` | Explosive Rocket / Rocket / 폭발 로켓 | 명칭/변경 | [CAT-001](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements), [CAT-012](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1750957475&feed=steam_community_announcements), [CAT-013](https://store.steampowered.com/news/posts/?appids=346010&enddate=1491653692) |
| `bsg_flaming_ball` | Flaming Ball / Flameball / 화염구 | 명칭/변경 | [CAT-012](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1750957475&feed=steam_community_announcements) |
| `bsg_boulder` | Boulder / 바위 | 동작 | [CAT-017](https://store.steampowered.com/news/posts/?appids=346010&enddate=1435070217), [CAT-020](https://store.steampowered.com/news/posts/?appids=346010&enddate=1652972552&feed=steam_community_announcements) |
| `bsg_sensor` | Sensor / 센서 | 동작 | [CAT-019](https://store.steampowered.com/news/posts/?appids=346010&enddate=1591733466&feed=steam_community_announcements), [CAT-012](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1750957475&feed=steam_community_announcements) |
| `bsg_logic_gate` | Logic Gate / 논리 게이트 | 동작 | [CAT-020](https://store.steampowered.com/news/posts/?appids=346010&enddate=1652972552&feed=steam_community_announcements), [CAT-008](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |
| `bsg_altimeter` | Altimeter / 고도계 | 명칭/변경 | [CAT-019](https://store.steampowered.com/news/posts/?appids=346010&enddate=1591733466&feed=steam_community_announcements) |
| `bsg_anglometer` | Anglometer / 각도계 | 동작 | [CAT-019](https://store.steampowered.com/news/posts/?appids=346010&enddate=1591733466&feed=steam_community_announcements), [CAT-004](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1778853723&feed=steam_community_announcements) |
| `bsg_speedometer` | Speedometer / 속도계 | 동작 | [CAT-019](https://store.steampowered.com/news/posts/?appids=346010&enddate=1591733466&feed=steam_community_announcements), [CAT-012](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1750957475&feed=steam_community_announcements), [CAT-011](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1772123201&feed=steam_community_announcements) |
| `bsg_length_detector` | Length Detector / 길이 검출기 | 동작 | [CAT-001](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements) |
| `bsg_pin` | Pin / 고정 핀 | 동작 | [CAT-018](https://store.steampowered.com/news/posts/?appids=346010&enddate=1450557513) |
| `bsg_camera_block` | Camera Block / 카메라 블록 | 동작 | [CAT-018](https://store.steampowered.com/news/posts/?appids=346010&enddate=1450557513), [CAT-004](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1778853723&feed=steam_community_announcements) |
| `bsg_grip_pad` | High Friction Grip Pad / 고마찰 패드 | 동작 | [CAT-017](https://store.steampowered.com/news/posts/?appids=346010&enddate=1435070217) |
| `bsg_powered_wheel` | Powered Wheel / 구동 바퀴 | 대기 | 재검증 대기 |
| `bsg_large_powered_wheel` | Large Powered Wheel / 큰 구동 바퀴 | 대기 | 재검증 대기 |
| `bsg_large_unpowered_wheel` | Large Unpowered Wheel / 큰 무동력 바퀴 | 대기 | 재검증 대기 |
| `bsg_wooden_panel` | Wooden Panel / 목재 패널 | 대기 | 재검증 대기 |
| `bsg_armour_plate` | Armour Plate / 장갑판 | 대기 | 재검증 대기 |
| `bsg_wing_panel` | Wing Panel / 날개 패널 | 대기 | 재검증 대기 |
| `bsg_circular_saw` | Circular Saw / 원형 톱 | 대기 | 재검증 대기 |
| `bsg_timer` | Timer / 타이머 | 대기 | 재검증 대기 |

### 4.2 The Splintered Sea

| 관리 키 | 영문명 / 한글 참조명 | 판정 | 근거 |
|---|---|---|---|
| `bsg_curved_wooden_block` | Curved Wooden Block / 곡선 목재 블록 | 동작 | [CAT-016](https://store.steampowered.com/app/2165710/Besiege_The_Splintered_Sea/) |
| `bsg_small_barrel` | Small Barrel / 작은 부유 통 | 동작 | [CAT-007](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |
| `bsg_large_barrel` | Large Barrel / 큰 부유 통 | 동작 | [CAT-007](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |
| `bsg_sail_panel` | Sail Panel / 돛 패널 | 동작 | [CAT-007](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |
| `bsg_aquatic_screw` | Aquatic Screw / 수중 스크루 | 동작 | [CAT-007](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |
| `bsg_paddle` | Paddle / 노 | 동작 | [CAT-007](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |
| `bsg_rudder` | Rudder / 방향타 | 동작 | [CAT-007](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |
| `bsg_harpoon_launcher` | Harpoon Launcher / 작살 발사기 | 동작 | [CAT-007](https://store.steampowered.com/news/posts/?appids=346010&enddate=1714752154&feed=steam_community_announcements) |

### 4.3 The Broken Beyond

| 관리 키 | 영문명 / 한글 참조명 | 판정 | 근거 |
|---|---|---|---|
| `bsg_booster` | Booster / 로켓 추진기 | 동작 | [CAT-009](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1780297200&feed=steam_community_announcements), [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0), [CAT-005](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_metal_wheel` | Metal Wheel / 금속 바퀴 | 동작 | [CAT-009](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1780297200&feed=steam_community_announcements), [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_control_thruster` | Control Thruster / 자세 추력기 | 동작 | [CAT-009](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1780297200&feed=steam_community_announcements), [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_inertial_steering` | Inertial Steering / 관성 조향기 | 동작 | [CAT-009](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1780297200&feed=steam_community_announcements), [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_rocket_fin` | Rocket Fin / 로켓 핀 | 동작 | [CAT-009](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1780297200&feed=steam_community_announcements), [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_grid_fin` | Grid Fin / 격자 핀 | 동작 | [CAT-009](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1780297200&feed=steam_community_announcements), [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_parachute` | Parachute / 낙하산 | 동작 | [CAT-009](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1780297200&feed=steam_community_announcements), [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_small_fuel_barrel` | Small Fuel Barrel / 작은 연료통 | 동작 | [CAT-014](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0), [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_large_fuel_barrel` | Large Fuel Barrel / 큰 연료통 | 동작 | [CAT-014](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0), [CAT-015](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0), [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_fuel_hose` | Fuel Hose / 연료 호스 | 동작 | [CAT-014](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0), [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_fuel_coupler` | Fuel Coupler / 연료 결합기 | 동작 | [CAT-014](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0), [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_fuel_gauge` | Fuel Gauge / 연료계 | 동작 | [CAT-014](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0), [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0), [CAT-005](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_blaster` | Blaster / 블래스터 | 동작 | [CAT-014](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0), [CAT-006](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |
| `bsg_fuel_pump` | Fuel Pump / 연료 펌프 | 동작 | [CAT-005](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0) |

## 5. 데이터 계약과 채택 절차 — 재구성 제안

### 5.1 레코드 계약

| 필드 | 의미 | 규칙 |
|---|---|---|
| `record_id` | 이 자료의 외부 식별자 | 런타임 ID 및 원작 내부 ID와 분리 |
| `evidence_status` | 공식문헌/역사/미확인 | 기능 존재와 현재 기본값을 혼동하지 않음 |
| `evidence_coverage` | 동작/이름만/대기 | 동작 복원률 계산 시 이름만 확인한 항목 제외 |
| `evidence_scope` / `function_evidence_status` | 근거가 뒷받침하는 범위와 기능 판정 | 이름·변경 이력만 확인한19행은 기능 `unverified` |
| `version_scope` | 확인된 발표·버전 | 최신 숫자를 일괄 현재값으로 선택하지 않음 |
| `save_scope` | 신규/기존/양쪽/미확정 | old-save 예외를 데이터 마이그레이션 조건으로 보존 |
| `unit` | 원문 단위의 의미 | `game_*`, `ui_multiplier`를 SI 단위로 자동 변환하지 않음 |
| `value` | 문헌에서 확인한 값 | 일부 bool은 기본값이 아니라 기능 존재 표시 |
| `current_applicable_value` | 현재 설치판에 적용할 검증값 | 현재는 전부 `null` |
| `conflict_group` | 비교가 충돌하거나 범위가 다른 기록 | 해결 전 자동 선택 금지 |
| `source_ids` | 구체적 근거 목록 | 이름만 나오는 출처로 전체 물리 규칙을 확정하지 않음 |

`null`은 0, 무한, 해당없음과 다르다. 예를 들어 미확인 파단력 `null`을 0으로 바꾸면 모든 연결이 즉시 부러지고, 무한으로 바꾸면 파손을 숨기게 된다. 미확인값을 필요한 런타임 설정에 대입할 때는 가져오기 실패 또는 명시적인 독립 구현 프로필 선택으로 처리한다.

### 5.2 채택은 별도의 프로필로 수행한다

제안 파이프라인은 `공개 기록 → 버전·저장 범위 필터 → 충돌 검사 → 설치판 계측 대조 → 채택 프로필`이다. `original_parameters.json`을 게임 상수로 직접 import하지 않는다. bool 설정의 존재를 재구현할 수 있어도 상세 힘·토크·포트·입력 시간 의미는 추가 설계가 필요하다.

추천 채택 프로필 필드는 `target_build`, `platform`, `dlcs`, `save_generation`, `mods`, `parameter_id`, `adopted_value`, `units`, `measurement_run`, `acceptance_reason`이다. 원장의 `value`를 바꾸는 대신 프로필에서 채택 기록을 추가해야 문헌과 구현이 분리된다.

### 5.3 명칭 대응

현재 한글 번역·이전 팔레트명·현행 영문명·내부 enum을 하나의 문자열에 억지로 맞추면 잘못된 호환성이 생긴다. 이름 대응표에서 각 alias의 자료 날짜와 판정 상태를 따로 관리한다. 특히 `Large Wheel`이라는 초기 표현을 `Large Powered Wheel`의 현행 정의와 자동 병합하지 않았으며, 해당 개별 변형은 대기 상태로 남겼다.

`Flamethrower`는 기본 게임 부품이지만 연료망 규칙은 V1.9 변경이다. 반대로 우주 DLC 전용 `Small Fuel Barrel`과 해양 DLC `Small Barrel`은 서로 다른 항목이다. 이름 일부가 같다는 이유로 부력과 연료를 같은 값으로 처리하지 않는다.

## 6. 시스템별 복원 우선순위 — 구현 제안

### P0: 제작 관계를 표현할 수 있는 데이터

각 부품을 단일 크기·질량 행으로 끝내지 말고 고정측/가동측 포트, 연결 허용 방향, 부착 대상, 상대 축을 표현한다. 부품과 연결의 파손 상태를 따로 보존한다. 이 단계가 없으면 관절과 보강대의 차이를 수치 튜닝으로 해결하려 하게 된다.

원작 문헌에서 함수나 계수까지 공개하지 않은 포트 생성·우선순위는 미확정이다. 웹 게임의 구현 계약에는 독립 정책을 명시하고 원작 대조 실험 결과를 나중에 연결한다.

### P1: 구동·수동·공력 부품의 역할 분리

회전시키는 모터, 회전이 허용되는 관절, 상대 유동으로 힘을 만드는 표면을 구분한다. 현재 웹 게임의 편의용 추진 부품을 원작 Propeller의 동일 데이터라고 부르지 않는다. 원작과 대응시키려면 외력·자체구동·입력 해제·분리 후 반응을 따로 확인한다.

같은 방법으로 원작 피스톤을 복원할 때는 행정과 속도만 맞추지 말고 무부하·과적·끼임·입력 해제·구형 저장·기울어진 축에서의 행동을 비교한다. 지금의 독립 피스톤 테스트는 웹 구현 검증이지 원작 일치 검증이 아니다.

### P1: 편집 도구의 매개변수 공유

원작의 다중 Keymapper는 동일 설정을 공유하는 부품에 변경을 전파한다. 재구성에서는 `property_key`, `value_type`, `unit`, `range`, `capability`를 먼저 합의하고 선택된 부품끼리 타입·단위가 호환되는 설정만 편집한다. 서로 다른 값은 혼합 상태를 표시하고 입력 확정 시 한 Undo 트랜잭션으로 처리한다. 범위 밖 데이터의 자동 보정 여부를 저장 호환성과 분리해 기록한다.

### P2: 해양·연료 확장의 작동 조건

해양 부품은 젖음·침수·상대 유속·바람을 구분하고, 연료망은 구조 연결과 독립 그래프로 다룬다. 실제 단위를 확인하지 못한 Fuel은 게임 자원 단위로 유지한다. 펌프·저장고·소비자 사이의 이송량과 소비량 수지를 기록하여 부품수 증가에 따라 연료가 생성되거나 증발하는 오류를 막는다.

## 7. 아직 복구하지 못한 항목과 다음 계측

| 미확정 항목 | 필요한 관측 | 결과에 남길 내용 |
|---|---|---|
| 현재 내부 ID와 정확한 팔레트 변형 | 동일 설치판의 정상 저장·툴팁 | 빌드·DLC·명칭·원본 필드명 |
| 질량·관성·마찰 | 허용된 진단 화면 또는 통제된 실험 | 단위·오차·부품 스케일·저장 세대 |
| 모터 힘·토크·브레이크 | 하중 스윕·중립·역입력 | 입력 이력·정지 한계·포화 상태 |
| 접점/가동측 | 최소 기체의 방향별 부착 시험 | 월드/로컬 축과 포트 쌍 |
| 파단·손상 | 인장·굽힘·충격 대조 | 최초 파단 시점·부품 HP와 joint 상태 |
| 연료통 질량 충돌 | 동일 빌드에서 빈/가득 상태 비교 | Small10개와Large1개의 조건별 총질량 |
| Rope 범위 충돌 | Rope/Winch 구성과 old-save 분리 | 구성요소 질량·전체 질량·버전 |
| 후속 hotfix 범위 | 설치판 UI와 공식 hotfix 대조 | V1.77 본 공지 이후 변경 여부 |

실험을 실행하지 않은 행은 `planned`로 남긴다. 원작에서 한 번 움직였다는 관찰만으로 전체 부하 범위·재현성·프레임 독립성을 확정하지 않는다. 측정 환경과 입력 로그를 함께 확보한 뒤 관측값과 구현값의 비교를 수행한다.

## 8. 검증 상태

JSON 식별자 중복, 필수 필드, 부품→매개변수 참조, 출처 참조, 미확인 내부 ID·현행 수치의 `null` 유지, 충돌 그룹의 자동채택 금지를 구조 검사했다. 이는 문헌 정합성 검사다. 설치판 플레이나 실제 계측을 완료한 것이 아니다.
