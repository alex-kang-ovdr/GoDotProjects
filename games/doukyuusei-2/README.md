# 동급생 2 (同級生2 / Doukyuusei 2)

PlayHub 웹 게임 복원·재구현 프로젝트를 위한 **《동급생 2》(elf, 1995 PC-98 원작 / 2024 FG REMAKE 기준)** 역기획서, 원작 검증 데이터 번들, 그리고 **데이터 기반 웹 시뮬레이션 프로토타입**입니다.

## 핵심 설계 기둥

> **"동급생 2: NPC 일정·동선, 시간 진행, 관계 이벤트를 데이터 기반으로 구성"**

- **시간·캘린더 엔진**: 12월 22일 ~ 1월 7일(17일간, 자유행동 16일 + 1/7 3학기 시업식 엔딩 판정), 5분 양자 시계, 시설 진입 15분 / 실내·교내 이동 10분 / 전철 30분(역 진입 포함 45분) 소비 모델, 다익스트라 최단 경로 탐색.
- **NPC 일정·동선 엔진**: 원작 15인 히로인의 3대 출현 유형(`고정 출현`, `아치코치 순회`, `복합 전환`)을 선언적 스케줄 테이블(`npc_schedules.json`, 57슬롯)과 우선순위 리졸버로 데이터화.
- **관계 이벤트 DAG 및 마크로 분기**: 12월 28일 아키라의 동지온천 당첨 전화(참가 여부 + 파트너 3택), 12월 29~30일 온천/마을 배타 분기, 12월 29일 미노리 vs 미사 일정 충돌, 요코 엔딩 우선권 덮어쓰기(priority 1000), 1월 6일 자택 귀가 제약까지 비순환 이벤트 그래프(`events_and_flags.json`)로 구동.
- **듀얼 UI 모드**: **클래식 모드(1995 원작 준거)**와 **이지 레이더 모드(2024 리메이크 준거)**를 실시간 전환하며 동일한 스케줄 엔진의 투영 차이를 체험 가능.
- **콘텐츠 정책**: 성인용 씬 묘사를 완전히 배제하고 순수 관계 단계 마일스톤(`milestone_abstracted`)과 전연령 서사 장면·플래그 전이로 추상화.

## 디렉터리 구조

- [`game.manifest.json`](./game.manifest.json) — PlayHub 게임 매니페스트 (`id: "doukyuusei-2"`)
- [`Web/index.html`](./Web/index.html) — 외부 CDN 없이 로컬(`file://`) 및 HTTP에서 바로 실행되는 웹 프로토타입 진입점
- [`Web/engine.js`](./Web/engine.js) — DOM 비의존 순수 결정론적 헤드리스 시뮬레이션 엔진
- [`Web/data/game-data.js`](./Web/data/game-data.js) — `Source/sync-data.mjs`가 `verified_data/*.json`에서 생성하는 런타임 데이터 번들
- [`Web/assets/cover.svg`](./Web/assets/cover.svg) — 야소하치 겨울밤 테마 SVG 커버 아트워크
- [`Source/sync-data.mjs`](./Source/sync-data.mjs) — `verified_data/*.json` → `Web/data/game-data.js` 동기화 스크립트
- [`Source/engine.test.mjs`](./Source/engine.test.mjs) — Node 내장 테스트(`node --test`) 자동 검증 스위트
- [`ReverseDesign/README.md`](./ReverseDesign/README.md) — 역기획서 전체 색인 및 읽기 순서
- [`ReverseDesign/verified_data/`](./ReverseDesign/verified_data/) — 검증 완료된 원작 데이터(JSON/CSV) 및 자동 정합성 검증기(`validate_data.mjs`)

## 복원 데이터 현황 (검증 완료)

| 항목 | 수량 | 파일 |
|---|---:|---|
| 등장인물 (15인 히로인 + 주인공 + 조연/라이벌 6인) | 22명 | `verified_data/characters.json`, `characters.csv` |
| 지역(Zone) / 세부 장소(Location) | 4존 / 41장소 | `verified_data/locations.json`, `locations.csv` |
| 캘린더 일자 (12/22 ~ 1/7) | 17일 | `verified_data/calendar_days.json` |
| 상태 플래그 / 관계 이벤트 / 상호 배타 규칙 | 60 / 51 / 3 | `verified_data/events_and_flags.json` |
| 데이터 기반 NPC 일정 슬롯 | 57개 (히로인 15/15) | `verified_data/npc_schedules.json` |
| 엔딩 (히로인 16종 + 실패 2종 + 솔로 1종) | 19종 (히로인 15/15) | `verified_data/endings.json` |

## 빠른 실행 및 테스트

### 웹 프로토타입 실행
- `games/doukyuusei-2/Web/index.html`을 브라우저에서 직접 열거나(`file://` 지원), 로컬 정적 서버로 실행합니다.
- 상단 우측에서 **클래식 / 이지 레이더** 모드 전환, **3슬롯 세이브/로드**, **19종 엔딩 도감**을 이용할 수 있습니다.

### 데이터 동기화 · 정합성 검증 · 엔진 테스트

```bash
node games/doukyuusei-2/Source/sync-data.mjs
node games/doukyuusei-2/ReverseDesign/verified_data/validate_data.mjs
node --test games/doukyuusei-2/Source/engine.test.mjs
```
