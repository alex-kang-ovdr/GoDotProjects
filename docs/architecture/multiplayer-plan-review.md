# 외부 컨설팅 계획안 리뷰: Godot 멀티플레이 아키텍처 v1

- 대상: `PlayForge_PlayHub_Godot_Multiplayer_Architecture_Implementation_Plan_v1_20261120.md` (외부 컨설팅, 2026-11-20, 1577줄)
- 리뷰: 2026-11-20. 계획안 전문을 읽고 현재 코드(`PlayHub-Platform` 브랜치, `2b75942`)와 대조했다.
- 관련: [hub-forge-decoupling-plan.md](hub-forge-decoupling-plan.md), [hub-forge-internal-api-design.md](hub-forge-internal-api-design.md), [site-operations-plan.md](site-operations-plan.md), [reference-cases-research.md](reference-cases-research.md)

## 1. 총평

- **방향은 채택할 만하다.** 책임 분리(Forge 제작·빌드 / Hosting 실행 / Hub 노출·신원), 불변 release, 게임별 별도 origin, 게임 코드와 독립된 Gateway 입장 검증, 서비스 간 원자 커밋을 가정하지 않는 idempotency·outbox 설계는 우리가 이미 정한 방향과 같거나 그것을 확장한다.
- **현재 코드를 보지 않고 쓴 문서다.** 계획안 스스로 §24에서 "실제 저장소 미열람"이라고 밝힌다. 그래서 이미 있는 멀티플레이 구현, 엔진 버전, 빌드 실행 방식과 어긋나는 부분이 있다(§3).
- **범위가 매우 크다.** 18개 컴포넌트, G0~G6 단계다. 지금 팀이 한 번에 착수할 크기가 아니다. G0 기술 실증과 그 선행 조건만 우선 채택하는 것을 권한다(§5).
- **보안상 가장 중요한 지적(빌드·실행 격리)은 미래 과제가 아니라 현재 위험이다**(§3.2).

## 2. 기존 계획과 일치하는 부분

| 계획안 | 기존 결정 | 비고 |
|---|---|---|
| ADR-01 Forge·Hosting·Hub 책임 분리, §5.1 빌드·릴리스는 Forge 소유 | `/api/platform/*` 처리 주체 Forge 일원화(`ce261e3`), 빌드 검증 일원화(S1.5) | 일치 |
| ADR-10, §10.3 게임별 별도 origin, Hub 토큰을 게임에 주지 않음, LaunchGrant 약 60초 1회 | 분리 계획 P5(쿠키 없는 콘텐츠 origin, 60초 서명 토큰, `allow-same-origin` 금지) | 일치. 계획안이 더 세분화(LaunchGrant/PlaySessionCredential/Connect·JoinTicket) |
| §10.1 Hub가 신원 기준, 사이트별 세션 | 현행 Hub 단일 로그인 + Forge 매 요청 검증, P1 원격 검증 | 일치 |
| §17.5 멀티스레드 Web export는 별도 프로필, 포털 전체 헤더 변경 금지 | COOP/COEP는 `/forge/*`에만(현행), P4 | 일치 |
| §15.2 서비스 간 원자 커밋 가정 금지, idempotent API·outbox | 내부 API 설계 §4 | 계획안이 더 구체적. 내부 API에 idempotency key 규칙 추가 필요 |
| §15.3 초기 PostgreSQL 기반 상태·큐 | 분리 계획 P3(객체 스토리지 + 메타데이터 DB) | 방향 일치, DB 선택은 미정 |

## 3. 현재 코드와 어긋나거나 계획안이 놓친 부분

### 3.1 이미 멀티플레이 서버가 있다 (ADR-05와 다른 구조)

- 현재 Forge에는 `brawllabs`, `fortress-war`, `tappy-chicken-mmo` 세 개의 멀티플레이 서버가 있다(`forge/Tools/*-multiplayer.cjs`, 합계 약 1,100줄). **게임 규칙을 Node.js가 직접 계산하는 권위 서버**이고(예: BrawlLabs는 50ms 간격 `tick()`·`simulate()`), Forge 에디터와 **같은 프로세스**에서 WebSocket(`/brawllabs` 등)으로 열린다.
- 계획안 ADR-05는 "게임 시뮬레이션은 Godot Linux 서버"이고, §3은 Godot high-level 프로토콜이 Godot 아닌 서버용이 아니라고 짚는다. 현재 구현은 Godot RPC가 아니라 템플릿별 자체 메시지 프로토콜이라 이 제약에 걸리지는 않는다. 하지만 **템플릿마다 서버 로직을 Node로 다시 쓰는 구조**라 UGC 제작자가 자기 게임 서버를 만들 수 없다.
- 판단: 계획안의 ADR-12(기존 게임은 선택적 등록)를 적용해 **현재 Node 서버는 "플랫폼 제공 템플릿 전용 경로"로 유지**하고, 제작자 게임용 Godot 데디케이티드 서버 경로를 새로 만든다. 단, 멀티플레이 서버가 에디터와 같은 프로세스에 있는 것은 ADR-01에 어긋나므로 **분리 계획에 "멀티플레이 서버의 Forge 프로세스 분리"를 추가**한다(§4).

### 3.2 빌드·실행이 격리 없이 Forge 호스트에서 돈다 (현재 위험)

- `forge/Tools/build-queue.cjs`는 사용자 프로젝트 파일을 호스트 디스크에 쓰고, 호스트의 Godot을 `--headless --editor --import`로 직접 실행한다(`spawn(findGodot(...))`). `native-runtime.cjs`의 PIE 런타임도 같은 방식이다.
- 계획안 §7.2·§17.3이 지적하듯, Godot import/export는 `@tool` 스크립트와 에디터 플러그인을 실행할 수 있다. Hub 인증 모드에서는 **Google 로그인 사용자 누구나** 빌드를 요청할 수 있으므로, 이론상 임의 코드가 Forge 호스트 권한으로 실행될 수 있다. 이 경로는 실제로 재현해 보지 않았다(코드 읽기와 Godot 동작 근거).
- 판단: 계획안 C06(격리 Build Worker)과 §17.3을 **공개 전 필수 조건(P0)** 으로 올린다. 격리가 준비되기 전에는 공개 환경에서 빌드·PIE를 허용 목록 사용자로 제한하거나 끄는 임시 조치가 필요하다(결정 필요).

### 3.3 엔진 버전

- 계획안은 Godot 4.6 문서를 근거로 하고 "기존 PoC의 4.3 메타데이터"를 언급한다. 실제로 저장소의 엔진은 **Godot 4.7.2 stable** 커스텀 빌드(`godot-engine/version.py`)이고 템플릿도 4.7 기능 플래그다.
- 판단: 계획안의 4.6 근거는 4.7.2 기준으로 재확인이 필요하다. 특히 Web export 스레드 조건, `WebSocketMultiplayerPeer.supported_protocols`, `get_requested_url()` 동작은 G0에서 4.7.2로 검증한다.

### 3.4 설치형 Godot 연동 경로가 없다

- 현재 `playforge_platform` 애드온은 웹 에디터 안에서만 동작한다(`JavaScriptBridge`로 페이지의 CSRF 토큰을 읽는다, `plugin.gd:570`). 설치형 Godot에서 Hub 신원으로 Forge에 연결하는 경로는 없다.
- 계획안 R02·§10.1(외부 브라우저 + PKCE)은 신규 구현이다. Hub에는 OIDC 제공자 기능이 없으므로(현행: 쿠키 세션 + 내부 검증 엔드포인트), 설치형 연동에는 **Hub에 디바이스/네이티브 앱용 인증 흐름을 새로 만드는 작업**이 포함된다. 계획안은 이를 "기존 Hub 계약에 맞춰"라고만 적어 규모를 과소평가한다.

### 3.5 저장소·데이터 계층

- 계획안은 PostgreSQL을 전제로 원자성 규칙(좌석, ticket 소비, CAS)을 설계한다. 현재 Hub는 SQLite, Forge는 파일(`PlatformStore`, 프로세스 간 잠금 없음, S0 차이 6)이다.
- 판단: Hosting 제어 상태는 처음부터 트랜잭션 DB로 시작해야 한다(계획안 동의). Forge 프로젝트 저장의 DB 이관은 분리 계획 P3과 같은 일정으로 묶는다.

### 3.6 문서 자체의 문제

- 출처 P01·P02가 `chatgpt.com/library` 비공개 링크라 팀이 열 수 없다. 원문을 저장소 `docs/`에 넣거나 링크를 교체해야 한다.
- 일정·인력·비용 추정이 없다(의도적이라고 밝힘). 착수 판단에는 G0의 기간 추정이 최소한 필요하다.

## 4. 기존 계획에 반영할 사항

| # | 반영 | 대상 문서 |
|---|---|---|
| U1 | **빌드·PIE 실행 격리를 P0 보안 과제로 추가**(§3.2). 격리 전 공개 환경의 빌드·PIE 제한 결정 | 분리 계획(신규 P0), 운영 계획 §9 |
| U2 | **멀티플레이 서버를 Forge 에디터 프로세스에서 분리**하는 단계 추가. 현재 Node 템플릿 서버는 "플랫폼 템플릿 전용"으로 유지 | 분리 계획(신규 P6) |
| U3 | 사용자 게임 origin(P5)을 계획안의 LaunchGrant → PlaySessionCredential → Connect/JoinTicket 단계와 맞춘다 | 분리 계획 P5 |
| U4 | 내부 API에 idempotency key 규칙(주체·작업·본문 해시 결합, 다른 본문은 충돌) 추가 | 내부 API 설계 §4 |
| U5 | 운영 계획에 Linux 서버 기준, 빌드 워커 격리, 게임 서버 용량 산정식(계획안 §19) 참조 추가 | 운영 계획 §2·§7 |
| U6 | 엔진 기준을 Godot 4.7.2로 명시하고 계획안의 4.6 근거를 G0에서 재확인 | 이 문서, 분리 계획 |

## 5. 실행 권고

계획안의 착수 순서(MP-001~014)를 그대로 따르되 앞부분만 지금 채택한다.

| 순서 | 작업 | 상태 |
|---|---|---|
| MP-001 | 기존 Hub/Forge API·계정·프로젝트·배포 경계 조사 | **이 리뷰 §6과 기존 설계 문서로 대부분 완료** |
| (신규) P0 | 빌드·PIE 격리 또는 공개 환경 제한 | 결정 필요 |
| MP-002 | 엔진·템플릿·언어 지원 프로필 등록(`godot-web-wss-v1`, 4.7.2 기준) | 다음 |
| MP-003·004 | Linux 서버 + Web/native 공통 WSS 접속, Gateway subprotocol ticket spike | G0 핵심 |
| 그 이후 | G1~G6 | G0 결과로 범위·일정 재평가 |

진행 중인 Hub–Forge 분리(S3 Forge 내부 API, S4 원격 Gateway)는 계획안과 충돌하지 않는다. 계획안의 Forge Project/Build API가 우리 내부 API 계약(§4)의 상위 집합이므로, S3에서 경로를 `/internal/v1/...`로 정할 때 계획안의 snapshot·build-job 개념을 수용할 수 있게 설계한다.

## 6. 계획안 §24 "기존 구현 확인 항목"에 대한 답 (MP-001)

| 항목 | 계획안 상태 | 현재 코드 기준 확인 결과 |
|---|---|---|
| Hub 인증 프로토콜·Forge 신원 매핑 | 미확인 | Hub Google 로그인 쿠키 세션. Forge는 매 요청 `POST /internal/session/verify`로 검증(루프백 기본, `646aae1`부터 HTTPS+시크릿 원격 옵션). 계정 키는 `sha256("https://accounts.google.com\0" + sub)`. OIDC 제공자 기능 없음 |
| Forge 저장·revision·snapshot API | 미열람 | `PlatformStore`(파일, `projects/<id>/project.json`, revision·history·releases). `createPlatformApi`가 `/api/platform/*` 제공. 불변 snapshot 개념은 없고 history의 revision별 파일이 그 역할. 프로세스 간 잠금 없음 |
| Hub Delivery 게시 API | 미확인 | Hub에 제작자 제출·심사(`creator_submissions`, 승인해도 자동 게시 안 함)는 있다. 게시 포인터(publication)·CAS 계약은 없다. 카탈로그는 파일 기반(`readCatalog`) |
| 실제 Godot engine/export template | 미확정 | Godot 4.7.2 stable 커스텀 빌드(`godot-engine/`). Web export만 빌드(`BuildQueue`), 서버 export preset 없음 |
| 웹 에디터의 내부 데이터 형식 | React/TS 가능성 | 공식 Godot 웹 에디터(`forge/OfficialGodot/`) + `playforge_platform` 애드온. 프로젝트는 일반 Godot 파일 구조로 저장. 별도 Studio(`forge/Studio*`)는 자체 문서 형식 |
| 런타임 언어·확장 | 미확인 | 템플릿은 GDScript. 멀티플레이 서버 로직은 Node.js(템플릿별) |
| 최초 게임 장르·정원·리전 | 제안값 | 기존 템플릿: BrawlLabs 3v3, Fortress War, Tappy Chicken MMO. 단일 호스트 |
| 사용 클라우드·월 예산 | 미확정 | 미확정(운영 계획 열린 결정 1과 같음) |
| 플랫폼 공통 재화·랭킹 | 범위 밖 | 해당 기능 없음 |
