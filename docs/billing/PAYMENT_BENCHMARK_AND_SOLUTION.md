# 글로벌 결제 아키텍처 벤치마크(Airbnb · Uber · Lyft · Roblox) 및 PlayHub 최적 솔루션 검토

- **브랜치 / 워크트리**: `Hub-Billing` (`D:\Github\GoDotProjects-worktrees\Hub-Billing`)
- **작성일**: 2026-11-21
- **연결 문서**: [HUB_BILLING_PLAN.md](HUB_BILLING_PLAN.md), [reference-cases-research.md](../architecture/reference-cases-research.md), [multiplayer-deploy-billing-plan.md](../architecture/multiplayer-deploy-billing-plan.md)
- **조사 원칙**: 공개된 엔지니어링 블로그·기술 문서 요약에서 확인된 사실과 PlayHub 적용 해석/기획을 명확히 구분한다. 초거대 플랫폼의 인프라를 무비판적으로 복제(과설계)하지 않고, **PlayHub 현재 규모(Node 24 + SQLite WAL/Turso + Cloud Run)에서 즉시 취할 불변식과 매출 성장 시 전환할 정량 트리거**를 도출한다.

---

## 1. 사례별 결제 아키텍처 핵심 분석

### 1.1 Airbnb — Orpheus(멱등성) · Multi-PSP 어댑터 · 복식부기 원장

- **근거 수준**: Airbnb Engineering 공개 기술 블로그 및 아키텍처 해설 요약(Orpheus "Avoiding Double Payments in a Distributed Payments System", Double-Entry Ledger 사례).
- **핵심 패턴**:
  1. **Orpheus (공통 멱등성 라이브러리 & Primary-Only 읽기)**:
     - 결제·정산 요청마다 개별 서비스가 중복 방지를 따로 구현하지 않고, 트랜잭션 경계를 감싸는 공통 라이브러리(`Check → Execute → Record`)로 강제한다.
     - **결정적 교훈 — Read Replica 금지**: 결제 직후 타임아웃 재시도가 복제 지연(Replica Lag)이 있는 읽기 복제본을 조회하면 기존 처리 결과를 못 찾아 **이중 결제**가 발생한다. 따라서 모든 멱등성 조회·기록은 **반드시 Primary(Master) DB**에서만 수행한다.
  2. **Multi-PSP 어댑터 추상화**:
     - Adyen, Stripe, Braintree 및 국가별 로컬 결제망(브라질 Boleto, 유럽 Klarna 등)을 **동일한 내부 인터페이스(PSP Gateway/Adapter)** 뒤에 격리하여 특정 PG의 API 변경·장애·수수료 인상이 코어 비즈니스 로직에 전파되지 않게 한다.
  3. **불변 복식부기 원장(Immutable Double-Entry Ledger) & 이벤트 분리**:
     - 잔액 컬럼을 덮어쓰지 않고 모든 돈의 흐름을 **차변(Debit) = 대변(Credit)** 균형이 맞는 Append-Only 분개 로그로 기록한다. 수정·취소는 과거 행을 변경하지 않고 **역분개(Reversal) 행**을 추가한다.
     - 상품 도메인 이벤트(예약 확정)와 금융 이벤트(결제 매입·수수료·호스트 부채)를 분리해 정산·감사·세무 집계를 무결하게 유지한다.

### 1.2 Uber — LedgerStore · Multi-PSP 스마트 라우팅 · Uber Cash & 기프트카드 대사

- **근거 수준**: Uber Engineering 공개 아키텍처(Gulfstream · LedgerStore · Uber Cash · 기프트카드 선수금/대사 기술 문서 요약).
- **핵심 패턴**:
  1. **LedgerStore (Zero-Sum Money Order · Hold/Capture 2단계)**:
     - 모든 금융 트랜잭션을 Zero-Sum(`합계 = 0`) 분개 단위("Money Order")로 기록하며, 동시 다중 서비스 이용(예: Uber Ride + Uber Eats 동시 결제) 시 이중 지출을 막기 위해 **선점(Hold/Reserve) → 확정(Capture/Settle) 또는 해제(Release)** 2단계 강한 일관성(Strong Consistency)을 적용한다.
  2. **Multi-PSP 스마트 라우팅 & Soft-Decline 폴백**:
     - 카드 발급국, 통화, PG 실시간 응답속도·승인률, 수수료를 평가해 최적의 PG로 동적 라우팅한다. 일시적 네트워크 오류나 Soft Decline 발생 시 사용자에게 실패를 노출하지 않고 **보조 PG로 투명 폴백(Failover)**한다.
  3. **Uber Cash (폐쇄형 선불 지갑) & 기프트카드 선수금/Breakage 대사**:
     - 기프트카드 판매 시점의 현금은 즉시 매출이 아닌 **미리딤 상품권 부채(`Deferred Revenue - Gift Cards`)**로 잡고, 리딤 시 사용자 지갑 부채로 이전, 실제 소비 또는 법정 소멸시효(Breakage) 도달 시 매출로 인식한다.
     - 내부 원장과 외부 PG/제휴 유통사 정산 리포트를 **자동 대사(Reconciliation)**해 단 1원의 불일치도 조기 탐지한다.

### 1.3 Lyft — Lyft Cash 리로드 보너스 · 보너스 엔진 분리 · PCI 범위 최소화

- **근거 수준**: Lyft 결제·지갑 아키텍처 공개 분석 및 폐쇄형 선불 지갑(Lyft Cash / Auto-Reload) 케이스 스터디 요약.
- **핵심 패턴**:
  1. **폐쇄형 지갑 + 리로드 보너스(Interchange 절감 & LTV 락인)**:
     - 매 건마다 카드로 소액 결제하면 매번 카드망 수수료(Interchange + 고정비)가 발생한다. 사용자가 지갑에 목돈을 선충전(또는 자동 충전 Auto-Reload)하도록 **리로드 보너스(예: 최대 5%)**를 제공하면, 카드 수수료는 1회만 지불하고 내부 원장 차감 비용은 사실상 0원이 되며, 지갑 잔액이 남아 있는 이용자의 **경쟁 앱 이탈이 급감(LTV 상승)**한다.
  2. **결제 코어와 인센티브/보너스 엔진의 분리**:
     - 프로모션·리워드·보너스 계산을 결제 게이트웨이 계층과 분리된 전용 규칙 엔진으로 운영해, 보너스 정책이 수시로 바뀌어도 결제 안정성이 흔들리지 않게 한다.
  3. **PCI-DSS 범위 최소화 (토큰화)**:
     - 클라이언트와 백엔드 코어가 원시 카드번호(PAN)를 절대 만지지 않고 PSP 토큰/호스팅 체크아웃만 처리한다.

### 1.4 Roblox — Direct-to-Consumer 최대 +25% 보너스 & DevEx 경계 격리

- **근거 수준**: Roblox 공식 Help 문서, 가격 티어, Terms of Use / DevEx 규정.
- **핵심 패턴**:
  - 웹·PC·기프트카드 구매 시 모바일/콘솔 인앱(30% 수수료) 대비 **최대 +25% 추가 재화**를 상시 제공하여 수수료 절감분을 이용자에게 환원하면서도 플랫폼 순매출을 끌어올린다.
  - 구매·보너스·기프트카드 재화와 창작자 현금 출금 대상(`Earned`)을 **완전히 분리**하고, 차지백 시 음수 잔액 및 계정·출금 권한 정지로 자전거래/사기 루프를 봉쇄한다.

---

## 2. 4대 사례 종합 비교 및 PlayHub 과설계 방지 원칙

PlayHub는 현재 **단일 Node 24 Hub 서버 + SQLite WAL (향후 Turso) + 8개 언어 글로벌 확장 + 창작자/플레이어 통합 `PlayCoin` 생태계**다. Airbnb/Uber/Lyft의 모든 분산 인프라를 초기에 구축하는 것은 명백한 과설계이며, **"지금 당장 코드에 내재화해야 할 구조적 불변식"**과 **"매출 규모 도달 후 켜는 확장 모듈"**을 명확히 구분해야 한다.

| 역량 영역 | 초거대 플랫폼 원형 (Airbnb/Uber/Lyft) | **PlayHub 지금 적용 (M0~M2, 경량·고신뢰)** | **PlayHub 규모화 시 확장 (Phase 2~3)** |
|---|---|---|---|
| **원장 구조** | 수조 건 분산 `LedgerStore` / Spark 집계 | **SQLite/Turso 복식부기(`billing_journal_entries` + `billing_journal_lines`, Zero-Sum `SUM === 0`) + 4-Bucket/Lot 투영** | Turso 원장 분리 + 일일 BigQuery/DuckDB 재무 집계 파이프라인 |
| **멱등성** | `Orpheus` (키 샤딩 + Primary-Only) | **공통 `withIdempotency(db, scope, key, fn)` 트랜잭션 래퍼 + Turso Primary-Only 강제** | 다중 리전 시 멱등성 키 파티셔닝 |
| **PG 오케스트레이션** | 20~50개 PSP 동적 스마트 라우팅 | **내부 `router.mjs` + Uniform PSP Adapter** (1단계: `xsolla` 단일 + `google_play` IAP + `mock`) | 2단계: `toss`(KRW) 분기 + 서킷브레이커 폴백 / 3단계: `stripe`+`pay.js` 또는 `adyen` |
| **지갑 · 보너스** | Uber/Lyft Cash (+5% 리로드) + Roblox (+25%) | **`PlayCoin` 단일 통합 지갑 + 웹·PC·기프트카드 상시 최대 +25% + 로트 동반 사용 개시 규칙** | 성인 옵트인 **Auto-Reload(자동 충전)** — 제작자 서버 중단 방지 및 플레이어 LTV 락인 |
| **기프트카드 회계** | 선수금 부채 → 리딤 → 소비/Breakage 대사 | **시스템 계정 분개(`sys:liability:gc_unredeemed → user:paid → sys:revenue`) + Admin 대사 리포트** | POSA 외부 오프라인 유통사 실시간 활성화 Webhook + Breakage 자동 산출 |
| **창작자 수익 정산** | Airbnb 호스트 / Uber 드라이버 Express Payout | `earned` 버킷 원장 스키마 선반영 (구매/보너스 전환 절대 불가) | Stripe Connect / Hyperwallet / 국내 사업자 정산 출금(DevEx) 연동 |

---

## 3. PlayHub 최적 결제 솔루션 조합 검토 (4개 대안 정량 비교)

### 3.1 대안 비교 매트릭스

| 비교 기준 | **대안 1: Xsolla 단독 영구 사용** | **대안 2: Toss + Stripe 초기부터 직접 구축** | **대안 3: Adyen / Primer 엔터프라이즈 오케스트레이션** | **대안 4 (최적 권장): PlayHub 경량 오케스트레이터 + 단계별 하이브리드 PG** |
|---|---|---|---|---|
| **초기 출시 속도** | 최상 (1회 연동) | 하 (국내 PG + 글로벌 Stripe + 8개국 세무·VAT 직접 대응) | 최하 (엔터프라이즈 심사·최소 볼륨 요구, 스타트업 부적합) | **상 (1단계 Xsolla 1회 연동으로 최단 글로벌·한국·Google Pay 동시 오픈)** |
| **한국 KRW 수수료** | ~8.5% (비쌈) | **~3.3% (최저)** | ~3.5~5.0% + 오케스트레이션 비용 | 1단계 ~8.5% → **2단계 Toss 분기 시 ~3.3% (연 수천만 원 절감)** |
| **글로벌 세무 (MoR)** | **Xsolla 200+국 대행** | 직접 신고 부담 큼 (Stripe Tax 써도 각국 등록·납부 직접 수행) | 직접 신고 부담 | **1~2단계 Xsolla MoR이 200+국 VAT/차지백 전담** |
| **Google Pay 지원** | 내장 Instant Flow | `pay.js` + Stripe 직접 연동 (한국 미지원 대응 별도) | 지원 | **1단계 Xsolla Instant Flow → 3단계 `stripe-gpay.mjs` 선택 전환** |
| **벤더 종속성 (Lock-in)** | 높음 (Xsolla 카탈로그/웹샵 종속 시) | 낮음 | 중간 | **없음 (카탈로그·보너스·복식부기 원장·기프트카드를 PlayHub SSOT로 완전 소유)** |
| **장애 복원력 (Failover)** | 단일 장애점(SPOF) | 수동 전환 | 자동 폴백 | **2단계부터 `router.mjs` 서킷 브레이커로 PG 장애 시 자동 폴백** |

### 3.2 단계별 PG 전환 정량 트리거 (손익분기점 기준)

무작정 여러 PG를 동시에 붙이지 않고, **수수료 절감액이 추가 연동·운영·세무 유지비를 확실히 초과하는 정량 매출 구간**에서 다음 단계를 활성화한다.

| 진화 단계 | 활성화 조건 (정량 트리거) | 활성 PG 라우팅 구성 | 기대 효과 |
|---|---|---|---|
| **Stage 1 (M1 런칭 — Go-To-Market 최적)** | 초기 오픈 ~ 한국 월 결제액 < ₩3,000만 | • 웹·PC 전체(KR + 글로벌 + Google Pay): **Xsolla Pay Station (MoR)**<br/>• Android 앱: **Google Play Billing v7** (0% 보너스) | **개발·세무·CS 최소 비용**으로 8개 언어·200+국 VAT·Google Pay·한국 간편결제 동시 출시. 실효 ~8.5%에서도 +25% 보너스 지급 후 모바일 IAP 대비 **+3.6~4.6% 순매출 우위** |
| **Stage 2 (국내 수익성 극대화 & 이중화)** | 한국 `KRW` 월 결제액 **≥ ₩3,000만** (3개월 연속) | • `KRW` 국내 결제: **Toss Payments (또는 PortOne V2)** (~3.3%)<br/>• 해외 통화 · Google Pay · 국내 PG 장애 폴백: **Xsolla MoR** (~8.5%) | 한국 수수료 **~5.2%p 절감** (월 ₩5,000만 기준 월 +₩260만 / 연 +₩3,120만 순익 증가) + 국세청 현금영수증·국내 PASS 본인확인 완벽 연동 + PG 장애 시 Xsolla 자동 폴백 |
| **Stage 3 (글로벌 엔터프라이즈 최적화)** | 해외 월 결제액 **≥ USD 100,000** AND 해외 법인/자동 세무(Stripe Tax/Avalara) 체계 확보 | • `KRW`: **Toss Payments**<br/>• 북미·유럽·일본 카드 & **Google Pay Web(`pay.js`)**: **Stripe / Adyen** (~3.5%)<br/>• 신흥국 로컬 APM · 고위험 지역: **Xsolla MoR** | 글로벌 수수료 추가 **~4~5%p 절감** (연 USD 1.2M 기준 연 +USD 50K~60K 순익 증가) + **Airbnb/Uber/Lyft급 Multi-PSP 스마트 라우팅 & Soft-Decline Failover** 완성 |

---

## 4. `HUB_BILLING_PLAN.md`에 즉시 반영하는 4대 설계 업그레이드

본 벤치마크 검토를 통해 `Hub-Billing` M0~M2 설계에 아래 4가지 고부가가치 패턴을 선반영한다.

1. **진짜 복식부기(Double-Entry Zero-Sum) 원장 (`billing_journal_entries` + `billing_journal_lines`)**:
   - Airbnb·Uber 방식의 차변/대변 균형(`SUM(signed_coins) === 0`)을 SQLite `BEGIN IMMEDIATE` 트랜잭션 안에서 강제한다.
   - 시스템 계정(`sys:clearing:*`, `sys:contra:channel_bonus`, `sys:liability:gc_unredeemed`, `sys:revenue:platform`)과 사용자 계정(`user:<id>:paid|bonus|promo|earned`) 간 이동을 모두 추적해, **+25% 보너스 비용·기프트카드 선수금 부채·실현 매출·창작자 정산 부채**를 회계 감사 수준으로 즉시 집계한다.
2. **Airbnb Orpheus 패턴 공통 `withIdempotency()` 래퍼**:
   - 모든 결제·웹훅·리딤·소비·환불 핸들러가 동일한 `billing_idempotency` 테이블과 래퍼를 통과하며, Turso/복제 구성 확장 시에도 **Primary DB 읽기/쓰기만 허용**하는 계약을 코드 주석과 테스트로 고정한다.
3. **Uber/Lyft형 경량 Payment Orchestrator (`hub/server/billing/router.mjs`)**:
   - `selectProvider({ currency, country, channel, paymentMethodHint, healthMap })` 규칙 엔진을 M1부터 도입한다. Stage 1에서는 Xsolla 1개 어댑터로 단순 동작하지만, Stage 2(`toss.mjs`)·Stage 3(`stripe-gpay.mjs`) 추가 시 **라우팅 설정 변경만으로 무중단 전환 및 장애 폴백**이 가능하다.
4. **Lyft/Uber Cash형 성인 옵트인 `Auto-Reload` (Phase 2 확장 슬롯)**:
   - 제작자 멀티플레이 서버(`multiplayer-deploy-billing-plan.md`의 `autoTopUp`)와 헤비 플레이어를 위해 "잔액 임계치 도달 시 자동 충전(+25% 보너스 유지)"을 **성인(`ADULT`) 명시적 동의 전용 + 매회 이메일 고지 + 원클릭 해지** 조건으로 Phase 2 로드맵에 배치한다.
