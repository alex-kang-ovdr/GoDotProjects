# 귀축왕 란스 (鬼畜王ランス / Kichikuou Rance)

> **핵심 아키텍처 축**: **전략 시뮬레이션(SLG)과 캐릭터별 시나리오(Character Scenario Graph)의 통합**
>
> 원작: AliceSoft, 1996년 (Windows 95) · 지역제압형 전략 시뮬레이션 RPG

---

## 빠른 실행 & 테스트 (Play & Test)

### 웹 프로토타입 실행 (Zero-CDN · `file://` 및 HTTP 동시 지원)
- 브라우저에서 `games/kichikuou-rance/Web/index.html`을 직접 열거나 로컬 HTTP 서버로 실행합니다.
- **주요 플레이 기능**:
  - **29개 대륙 영토 SVG 전략 맵**: 10대 세력 색상, 인접 연결선, 침공 가능 전선 강조, 시설 아이콘, 위기(!) 배지.
  - **유형별 주간 액션 슬롯**: 도시(징세/프레이야 저지), 캐릭터 시나리오, 부하 대화, 증원/보충(택1), 수도 시설 건설(병원·마법연구소·마리아연구소·도서관), 미궁 탐색(사사호 B66F 하니와 킹 포함), 닌자 공작(닌자당 5회), 침공.
  - **4v4 전열/후열 군단 전투 아레나**: 원작 핵심 규칙인 **최소 병수 우선 행동순 큐**, 전투역(`戦闘域`), 직접/원거리/마법/필살 저격(`Snipe`, `0..min(6, floor(strikes/5))`), 방어/대기, 닌자 +1 추격(마인 면역), 란스 전사 시 즉시 `end_death`.
  - **16대 캐릭터 시나리오 & 전역 위기 타이머**: 볼고 Z 구출 기한(소울 `LP 3/08/3`, 시일 `LP 4/01/3`), 제스 개전 5주 시즈카 결투 및 4탑 붕괴, 마인군 침공(69~73주), 케이브리스 격파 → 창조신 페이즈(`CREATOR_PHASE`), 14개 멀티 엔딩 도감 및 로컬 3슬롯 세이브/로드.

### 데이터 동기화 · 무결성 검증 · 자동화 테스트

```powershell
# 1. verified_data/*.json → Web/data/game-data.js 번들 동기화
node games/kichikuou-rance/Source/sync-data.mjs

# 2. 원작 검증 데이터 참조 무결성 & 29영토 그래프 검증
node games/kichikuou-rance/ReverseDesign/verified_data/validate_data.mjs

# 3. 결정론적 SLG + 4v4 전투 + 시나리오/타이머/엔딩 단위 테스트
node --test games/kichikuou-rance/Source/engine.test.mjs
```

---

## 프로젝트 개요

이 디렉터리는 PlayHub 멀티게임 플랫폼에서 **귀축왕 란스(1996)**의 핵심 시스템 구조를 복원·재설계한 **역기획서(Reverse Design)**, **검증 데이터셋(Verified Data)**, 그리고 **데이터 주도형 웹 프로토타입(Playable Web Prototype)**을 보관한다.

> **콘텐츠 안전 원칙**: 본 역기획서·데이터셋·웹 프로토타입은 전략 시뮬레이션, 국가 경제, 4부대 전투 메커니즘, 병과·지휘관 시스템, 시나리오 조건 그래프 및 엔딩 분기 아키텍처에 집중하며, 모든 캐릭터 이벤트는 노골적 묘사 없이 순수하게 **전략·영입·서사·사기·전술 보너스**로 구성한다.

---

## 디렉터리 구조

- `game.manifest.json` — PlayHub 게임 매니페스트 (`id: "kichikuou-rance"`, `version: "1.0.0"`)
- `Source/sync-data.mjs` — `ReverseDesign/verified_data/*.json` → `Web/data/game-data.js` 번들 생성기
- `Source/engine.test.mjs` — Node.js 내장 테스트 러너(`node --test`) 기반 코어 엔진 자동화 테스트
- `Web/index.html`, `Web/styles.css`, `Web/app.js` — 다크 판타지 전략 맵·주간 슬롯·4v4 전투·시나리오·도감 웹 UI
- `Web/engine.js` — 순수 결정론적 헤드리스 SLG + 시나리오 엔진 (`KichikuouRanceEngine`)
- `Web/data/game-data.js` — 자동 생성된 정적 마스터 데이터 번들 (`RANCE_DATA`)
- `Web/assets/cover.svg` — 대륙 전략 맵·리자스 깃발·황금 왕관 SVG 커버 아트
- [ReverseDesign/README.md](./ReverseDesign/README.md) — 역기획서 전체 색인 및 문서별 요약 (`00`~`08`, `SOURCE_REGISTER.md`, `DATA_GAPS.md`)
- [ReverseDesign/verified_data/](./ReverseDesign/verified_data/) — 6종 JSON/4종 CSV 검증 데이터 및 `validate_data.mjs`

---

## 검증 데이터 요약 (`verified_data/`)

| 데이터 파일 | 건수 | 검증기 검사 항목 |
|---|---:|---|
| `factions.json` / `factions.csv` | 10개 세력 | ID 유일성, 지도자·수도 참조 무결성, CSV 동치성 |
| `territories.json` / `territories.csv` | 29개 영토 | 무방향 인접 그래프 대칭성, 리자스성 기점 100% 연결성 |
| `unit_classes.json` / `unit_classes.csv` | 14개 병종 | 공격 유형·전열/후열·반격 규칙 정합성 |
| `characters.json` / `characters.csv` | 33명 핵심 인물 | 소속 세력·병종·초기 영토 참조 무결성 |
| `scenario_events_and_timers.json` | 16개 시나리오/타이머 | 영토·캐릭터·세력·엔딩 참조 무결성 |
| `endings.json` | 14개 메인 엔딩 (+132 운명 메타) | 선행 이벤트·필수 캐릭터 참조 무결성 |
