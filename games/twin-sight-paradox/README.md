# Twin Sight Paradox — 역기획서, 원작 검증 데이터 및 플레이어블 웹 프로토타입

> **핵심 아키텍처 축**: **복수 주인공의 관점 전환(Multi-Sight)과 정보 비대칭(Information Asymmetry)**

## 1. 프로젝트 개요

본 디렉터리는 C's ware(シーズウェア, 시나리오·기획: 칸노 히로유키 / 원화: 타지마 나오 / 음악: 우메모토 류)가 1995년 PC-9801로 최초 발매하고, 1997년 세가 새턴(SEGA SATURN), Windows 95, 2003년 PS2(`PLUS`), 2016년 이후 리마스터(`R`)로 이어진 추리 서스펜스 어드벤처 **《Twin Sight Paradox》**의 **역기획서(Reverse Design)**, **검증된 원작 데이터(Verified Data)**, 그리고 이를 100% 데이터 주도 방식으로 구현한 **PlayHub 플레이어블 웹 프로토타입**을 수록합니다.

모든 문서·데이터·프로토타입은 원작의 성인용 묘사를 배제하고 **멀티 사이트(Multi-Sight) 시점 전환 시스템, 교차 시간축 동기화 장벽(`SB_01`~`SB_08`), 주인공 간 정보 비대칭 모델, 그리고 트리스탄호 최종 수렴(`C_D6_01`) 및 진범 추리**에 초점을 맞추어 작성되었습니다.

## 2. 빠른 실행 (Quick Play)

외부 CDN 없이 순수 정적 파일로 구성되어 **로컬 `file://` 직접 열기**와 **로컬 HTTP 서버** 모두에서 즉시 실행됩니다.

- **직접 실행**: [Web/index.html](Web/index.html) 파일을 브라우저(Chrome/Edge/Firefox)로 열기
- **핵심 조작**:
  - **6대 클래식 커맨드**: `LOOK`(조사) · `TALK`(대화) · `THINK`(추리) · `MOVE`(이동) · `ITEM`(소지품) · `⇄ SIGHT CHANGE`(시점 전환, 단축키 `Tab`)
  - **동기화 장벽 돌파**: 한쪽 주인공이 동기화 장벽(`SB_01`~`SB_08`, 특히 12월 6일 내각조사실 DBMS Level-7 데드락 `SB_05`→`SB_06`)에 막히면 `⇄ SIGHT CHANGE`로 상대 주인공의 사건을 진행해 교차 인과를 해제합니다.
  - **정보 분석 패널**: 우측 3개 탭(`🔀 타임라인 & 장벽`, `🧩 정보 비대칭 보드`, `🪪 인물 별칭 (18)`)에서 실시간 병렬 타임라인, 인벤토리 격리, 단서 인지 격차를 확인할 수 있습니다.
  - **최종 범인 지목(`C_D6_01`)**: 트리스탄호 해저 선창 합류 후, 한국어/일본어/영문(`미도 마야코` / `御堂真弥子` / `Mayako Mido`) 또는 `PLUS` 선택 모드로 진범을 지목할 수 있습니다.
  - **이중 상태 세이브**: 상단 `💾 저장/불러오기`에서 3개 수동 슬롯과 자동 체크포인트(`localStorage`)를 지원합니다.

## 3. 데이터 동기화 및 자동 테스트

워크트리 루트에서 아래 명령을 실행합니다.

```powershell
# 1) verified_data/*.json (SSOT) -> Web/data/game-data.js 번들 동기화
node games/twin-sight-paradox/Source/sync-data.mjs

# 2) 원작 정형 데이터 무결성 + 동기화 장벽 DAG/데드락 부재 검증
node games/twin-sight-paradox/ReverseDesign/verified_data/validate_data.mjs

# 3) 헤드리스 멀티 사이트 엔진 자동 테스트 (격리 · 8대 장벽 · 16씬 완주 · 범인 추리 · 세이브/로드)
node --test games/twin-sight-paradox/Source/engine.test.mjs
```

## 4. 디렉터리 구조

- [game.manifest.json](game.manifest.json): PlayHub 게임 매니페스트 (`id: "twin-sight-paradox"`, `version: "1.0.0"`)
- `Web/`: 플레이어블 웹 프로토타입 (Zero-CDN, `file://` 및 HTTP 호환)
  - [Web/index.html](Web/index.html): 메인 ADV 인터페이스 & 멀티 사이트 HUD
  - [Web/styles.css](Web/styles.css): 시점 전환 동적 테마(코지로 앰버 누아르 ⇄ 마리나 코발트 시안 ⇄ 트리스탄 수렴)
  - [Web/engine.js](Web/engine.js): 순수 결정론적 헤드리스 멀티 사이트 엔진 (`globalThis.EveEngine` + `module.exports`)
  - [Web/app.js](Web/app.js): 커맨드 ADV 렌더러, 14종 로케이션 SVG 뷰포트, 병렬 타임라인 & 동기화 장벽 SVG 시각화, 세이브/로드 컨트롤러
  - [Web/data/game-data.js](Web/data/game-data.js): `Source/sync-data.mjs`로 생성된 정적 데이터 번들 (`globalThis.EVE_DATA`)
  - [Web/assets/cover.svg](Web/assets/cover.svg): 90년대 네오 누아르 듀얼 퍼스펙티브 커버 아트
- `Source/`: 데이터 번들러 및 자동 테스트
  - [Source/sync-data.mjs](Source/sync-data.mjs): `ReverseDesign/verified_data/*.json` → `Web/data/game-data.js` 동기화 스크립트
  - [Source/engine.test.mjs](Source/engine.test.mjs): `node --test` 기반 멀티 사이트 엔진 자동 검증 스위트
- `ReverseDesign/`: 역기획서 9종 + 출처 대장 + 데이터 갭 + 검증 데이터(`verified_data/`)
  - [ReverseDesign/README.md](ReverseDesign/README.md): 역기획서 전체 목차 및 읽기 순서
  - [ReverseDesign/00_scope_evidence_and_glossary.md](ReverseDesign/00_scope_evidence_and_glossary.md): 분석 범위, 판본 비교, 증거 등급, 용어집
  - [ReverseDesign/01_core_loop_and_state_machine.md](ReverseDesign/01_core_loop_and_state_machine.md): 커맨드형 ADV 코어 루프 및 전체 게임 상태 머신
  - [ReverseDesign/02_multi_sight_and_sync_barrier_engine.md](ReverseDesign/02_multi_sight_and_sync_barrier_engine.md): 멀티 사이트 전환 규칙, 동기화 장벽(Sync Barrier), 데드락 방지 알고리즘
  - [ReverseDesign/03_information_asymmetry_and_knowledge_model.md](ReverseDesign/03_information_asymmetry_and_knowledge_model.md): 이중 인벤토리, 지식/단서 그래프, NPC 별칭·인지 비대칭, 극적 아이러니 설계
  - [ReverseDesign/04_parallel_timeline_and_scenario_convergence.md](ReverseDesign/04_parallel_timeline_and_scenario_convergence.md): 12월 2일~8일 코지로·마리나 병렬 타임라인, 교차 인과 매트릭스, 트리스탄호 합류
  - [ReverseDesign/05_characters_and_content_structure.md](ReverseDesign/05_characters_and_content_structure.md): 정규 등장인물 18인, 진영, 무대 14곳, 챕터 및 엔딩 구조
  - [ReverseDesign/06_ui_ux_and_save_architecture.md](ReverseDesign/06_ui_ux_and_save_architecture.md): 커맨드 ADV UI, Sight Change HUD, 이중 상태 세이브 직렬화
  - [ReverseDesign/07_data_schemas_and_engine_architecture.md](ReverseDesign/07_data_schemas_and_engine_architecture.md): PlayHub용 TypeScript/JSON 스키마 및 결정론적 멀티 사이트 엔진 아키텍처
  - [ReverseDesign/08_verification_and_test_plan.md](ReverseDesign/08_verification_and_test_plan.md): 데이터·그래프·교차 인과·범인 입력 검증 및 QA 테스트 계획
  - [ReverseDesign/SOURCE_REGISTER.md](ReverseDesign/SOURCE_REGISTER.md): 원작 검증 출처 대장
  - [ReverseDesign/DATA_GAPS.md](ReverseDesign/DATA_GAPS.md): 미확인 항목, 판본 차이, 인명 보정 기록
