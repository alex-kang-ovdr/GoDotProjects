# PlayHub · PlayForge AI/ML/RL 심화 딥 리서치 및 신규 사업 아이템 발굴 보고서

> **작성 기준일**: 2026-11-22  
> **상위 마스터 문서**: [AI_DATA_ML_RL_BUSINESS_STRATEGY.md](AI_DATA_ML_RL_BUSINESS_STRATEGY.md)  
> **조사 범위**: ① 글로벌 AI Growth / 게임 ML·RL / 규제(2026 AI 기본법·PIPA 제37조의2) 벤치마크 리서치 ② `PlayHub-Platform` 내부 시장·과금·AdGame·Desktop·Converter·Avatar·Store 실측 데이터 심화 분석 ③ Phase 0 기술/DDL/API 블루프린트 ④ PlayHub·PlayForge 고유 자산 기반 **신규 AI/ML/RL 사업 아이템 8선** 발굴 및 우선순위화

---

## Part A. [섹션 2 심화] Growth Hacker AI Agent 딥 리서치 & 정밀 설계

### A.1 글로벌 실증 벤치마크 (2025~2026)

| 영역 | 실증 사례 / 도구 | 검증된 성과 지표 | PlayHub 시사점 |
|---|---|---|---|
| **SaaS PLG 자율 그로스 에이전트** | Data Warehouse(Reverse ETL) + Contextual Bandit + LLM 가설·카피 루프 | 실험 주기 **14일 → 실시간 연속 최적화**, Free→Paid 전환율 **+42%** (60일 내) | PlayHub Free→Pro 창작자 전환 및 Guest→Registered 온보딩에 동일 패턴 직결 |
| **F2P 모바일 게임 자율 LiveOps** | 목표("30일 LTV 극대화, 이탈·인플레 악화 금지") + Contextual Bandit 오퍼·상점 | **ARPPU +28%**, 수동 LiveOps 운영 공수 대폭 절감 | PlayHub PlayCoin(+25% 웹 보너스)·아바타 상점·이탈 방지 오퍼에 적용 가능 |
| **AI 플레이어블 광고 자동화** | **Sett.ai**, **Layer.ai Playables** (Agentic 코드 생성, Claude 등 오케스트레이션) | 제작 기간 **수 주 → 수 시간** 단축, 일반 영상/배너 대비 CPI·IPM·CVR **최대 +40%**, 70~80초 몰입, 보상형 지면 수익 상관도 **3~4배** | PlayHub `Hub-AdGame`(당근·토스 + 글로벌 MRAID 3.0)의 핵심 병목인 데모 제작·로테이션을 AI로 돌파 |
| **모바일 게임 ROAS 기준선 (2025~2026)** | Liftoff / 업계 벤치마크 | 캐주얼 D7 ROAS **7.6~7.8%** / D30 **15%(AOS)~47%(iOS)**; 미드코어 D7 **4.3~6.1%** / D30 **40%+** (장기 200~400%); 하이브리드(IAP+IAA)가 단일 모델 압도 | PlayHub는 **웹 PlayCoin(+25% 보너스, KR PG 3.3% 수수료)**로 모바일 IAP(30%) 대비 순수익 **+10.1% 우위** → 동일 ROAS 기준 더 높은 CPA 입찰 여력 확보 |

### A.2 핵심 수학·통계 엔진 설계 (왜 LLM 단독이 아니라 통계+ML+Bandit인가)

#### 1) 실험 플랫폼: **GrowthBook(오픈소스) vs 자체 경량 엔진**
- **GrowthBook 패턴 채택 권장**: Warehouse-Native(DuckDB/BigQuery SQL 직접 조회), 빈도주의/베이지안/순차 검정(Sequential Testing), **CUPED(Controlled-Experiment Using Pre-Experiment Data)** 분산 축소, **Decision-Tree 기반 Thompson Sampling Contextual Bandit**을 오픈소스로 지원.
- **CUPED의 실무 위력**: 게임 결제(PlayCoin/IAP)는 소수 고래 유저 때문에 분산이 매우 크다. 실험 전 14일간의 유저별 플레이 시간/결제액을 공변량 $X$로 이용해 보정 지표 $Y_{\text{cuped}} = Y - \theta (X - \bar{X})$ ($\theta = \text{Cov}(Y, X) / \text{Var}(X)$)를 쓰면 **필요 표본 크기를 25~50% 단축**하여 초기 트래픽에서도 빠른 실험 결론이 가능하다.

#### 2) Uplift Modeling (4사분면 인과 타겟팅)
단순 이탈 예측(Churn Classification)으로 프로모션 PlayCoin을 뿌리면 "어차피 남을 유저"에게 돈을 낭비하거나 "알림/과금 유도에 반감을 느껴 오히려 떠나는 유저"를 자극한다. 반드시 **CATE(Conditional Average Treatment Effect)** $\tau(x) = P(Y=1 \mid T=1, X=x) - P(Y=1 \mid T=0, X=x)$를 추정하는 **T-Learner / X-Learner / Causal Forest (`EconML` / `CausalML`)**를 사용한다.

| 유저 사분면 | 개입 없이 잔존 | 개입 시 잔존 | Uplift ($\tau$) | Growth Agent 행동 |
|---|---|---|---|---|
| **Persuadables (설득 가능군)** | X | O | **양수 (+)** | **핵심 타겟**: 맞춤 프로모 PlayCoin / 복귀 파티 푸시 집행 |
| **Sure Things (충성 잔존군)** | O | O | **0** | 프로모션 **미지급** (원가 40~60% 절감) |
| **Lost Causes (확정 이탈군)** | X | X | **0** | 무의미한 할인 중단 (콘텐츠 추천만 유지) |
| **Sleeping Dogs (역효과군)** | O | X | **음수 (-)** | **절대 개입 금지** (과금/푸시 피로로 이탈 유발) |

#### 3) 복합 보상 함수 (Goodhart's Law 방지)
Contextual Bandit(LinUCB / Thompson Sampling)의 보상 $R$은 단순 클릭률이 아닌 아래 **가중 복합 효용 함수**로 정의한다:

$$R_i = w_1 \cdot \mathbb{I}(\text{active\_play\_60s}_i) + w_2 \cdot \hat{P}(\text{D7}_i) + w_3 \cdot \text{NetMargin}_i - \lambda_1 \cdot \text{PromoCost}_i - \lambda_2 \cdot \mathbb{I}(\text{RuntimeError}_i \lor \text{Report}_i)$$

- **의미**: 낚시성 쇼츠/썸네일(클릭만 높고 10초 내 이탈)이나 적자 프로모션(보상 비용 > 순증 마진), 버그 유발 게임을 에이전트가 스스로 배제하도록 수학적으로 강제한다.

### A.3 Creator Growth Hacker Agent (L3) 패키징 및 Pro Open Decision #1 연계

현행 `docs/billing/HUB_BILLING_PLAN.md`에서 **`Pro` 월 요금과 `ai_units` 초과 단가가 Open Decision #1(미확정)** 상태다. Growth Agent L3를 `Pro`의 핵심 킬러 가치로 묶으면 가격 정당성과 ARPC(창작자당 매출)가 극대화된다.

| 티어 / 상품 | 권장 가격안 (안) | 포함 Growth Agent 기능 | PlayCoin 종량 소모 (`ai_units` / 렌더) | 추정 GM |
|---|---|---|---|---|
| **Free** | ₩0 | 기본 대시보드 (`metrics.mjs` 요약), 월 1회 자동 퍼널 진단(L0 라이트) | 쇼츠 FFmpeg 20 PC / Veo 60~120 PC 직접 결제 | 55%+ |
| **PlayHub Pro** | **₩19,000 ~ ₩29,000 / 월** ($14.99~$19.99) | **주간 AI Growth Analyst(L0) 무제한**, **L1 초안 생성(월 500k 가중 토큰 포함)**, A/B 테스트 동시 3개, 8개국어 L10N 카피 자동 최적화 | 초과 AI 토큰(`2,000 weighted tokens = 1 PC`), Veo 쇼츠 렌더, **AI 1,000판 밸런스 리포트(150 PC/회)** | **60~70%** |
| **Growth Boost Pack (Add-on)** | PlayCoin 선충전 (예: ₩70,000 `t6` = 6,250 PC, +25% 웹 보너스) | **L2/L3 자율 최적화**: AI AdGame 45초 데모 자동 생성 + 당근/토스/피드 파일럿 부스팅 + 이탈 방지 자동 오퍼 | 집행 매체비/보상비 실비 + 에이전트 최적화/운영 수수료(15~20% in PC) | **50~65%** |

---

## Part B. [섹션 3 심화] 글로벌 게임 ML·RL 사례 & 도메인별 정밀 기술 명세

### B.1 글로벌 플랫폼 · 게임사 실전 벤치마크 매트릭스

| 기업 / 플랫폼 | 시장 규모 · 맥락 (실측/공개 자료) | 핵심 AI · ML · RL 활용 사례 | PlayHub · PlayForge 적용 시 벤치마킹 포인트 |
|---|---|---|---|
| **Roblox** | Q3 2026 DAU **138M (-9% YoY)**, 분기 매출 **$1.6B**, 2025 창작자 지급 **$1.5B+** | ① 수백만 경험 대상 GNN/딥러닝 추천 엔진 ② `GenerationService` 기반 생성형 AI 제작 + 안전 필터 ③ 창작자 데이터 학습 Opt-in/거버넌스 논란 대응 | **기회**: Roblox의 DAU/플레이시간 둔화(-9%/-15%)와 폐쇄형 고수수료에 지친 창작자를 **0% 수수료 + RobloxConverter RLVR + 투명한 Opt-in 정책**으로 흡수 |
| **Krafton** | PUBG 글로벌 라이브서비스 + AI 랩 | ① **CPC(Co-Playable Character)**: `sLM + RL + HAII` 결합으로 말하고 협동하는 AI 팀원 구현 ② 수천 경기 기반 실시간 승률 예측 AI ③ ML 기반 SBMM 및 안티치트 | PlayHub MMO 템플릿(`brawllabs`, `captainMMO`, `tappy-chicken-mmo`)의 초기 빈 방 이탈을 **경량 BC/RL 동반 봇**으로 방어 |
| **Nexon** | 메이플스토리·던파 등 대형 MMO 경제 | ① 밀리초 단위 텔레메트리 기반 경제 인플레·봇 탐지 ② **인간 플레이스타일 모방 RL 시뮬레이션 봇**으로 패치 전 드랍률·난이도·피로도 사전 검증 | `GamerQA` + Godot 헤드리스 롤아웃으로 창작자 게임 출시 전 **자동 밸런스·이탈 절벽 리포트** 상품화 |
| **EA / Supercell** | EA Sports FC·Apex / Clash·Brawl Stars | ① **EA**: DDA(동적 난이도 조절) + 이탈 시그널 기반 Uplift 복귀 보상 ② **Supercell**: 레벨별 분노 이탈(Rage-quit)·진행 병목 텔레메트리 탐지 및 매칭/자원 페이싱 보정 | PlayHub `play_sessions` + `round_start/complete` + `godot-sdk` 확장으로 **창작자 게임의 이탈 스테이지 자동 탐지** |
| **ZEPETO (NAVER Z)** | 누적 3~5억, MAU 1,500~2,000만, 창작자 200~470만, **아이템 410만 종 / 6,800만 개 판매** | 아바타 아이템 중심 UGC 경제 플라이휠(`제작→발행→발견→수익화→재투자`) | PlayHub `Forge-Avatar`는 현재 **38개 아이템(총 카탈로그 가치 6,570 PC)**에 불과 → AI 3D/리깅 파이프라인(신규 아이템 N2)으로 공급 병목 돌파 필수 |
| **Unity Muse** | 엔진 내장 AI 제작 코파일럿 | 텍스처·스프라이트·애니메이션·스크립트 생성. 저작권 소송 회피를 위해 **라이선스 확보/자체 에셋·동의 데이터만 학습** 원칙 천명 | PlayHub는 이미 **11,826종 `No generative AI used` 검증 오픈 에셋**을 보유 → 저작권 리스크 0% 시맨틱 검색·킷배싱(신규 아이템 N4)이 최강의 단기 무기 |

### B.2 도메인별 최소 데이터 임계치 · 추천 오픈소스 스택 · 추론 비용

| 도메인 | 최소 작동 데이터 규모 | 추천 오픈소스 / 경량 스택 | 추론 레이턴시 & 월 인프라 비용 (초기→성장기) |
|---|---|---|---|
| **D1. 추천 · 랭킹 · 이탈 · Uplift** | 일 활성 세션 **≥ 500건**, 누적 유저 ≥ 5,000명 | `LightGBM` / `CatBoost` + `EconML`(Uplift) + `Vowpal Wabbit` 또는 GrowthBook Bandit + **`onnxruntime-node`** (Hub Node.js 내장 추론) | 추론 **< 10 ms** (CPU, 별도 GPU 불필요) / 월 **\$50~300** (R2 Parquet + DuckDB) |
| **D2. Growth Agent (L0~L2)** | 일 세션 **≥ 1,000건**, 월 실험 ≥ 8건 (L2 기준; L0는 초기부터 가능) | 기존 `Hub-Agent`(Gemini 3.5 Flash/Pro) + GrowthBook(CUPED/SRM) + Postgres/SQLite 실험 메모리 | 오프라인/배치 추론 / 월 **\$200~1,000** (LLM 토큰 + Veo 렌더) |
| **D3. 게임플레이 BC / Offline RL / 안티치트** | 게임당 정상 플레이 궤적 **≥ 500~2,000 에피소드** (State Vector 기준) | `d3rlpy` (CQL/IQL Offline RL) · `CleanRL` (PPO/BC) · `scikit-learn` (Isolation Forest 안티치트) · Godot `--headless --fixed-fps 60` | 봇 추론 **< 2 ms** (ONNX CPU), 학습은 Spot GPU(L4/A10G) 일괄 실행 / 월 **\$150~800** |
| **D4. PlayForge 에디터 SFT/DPO** | Opt-in 검증 편집/포팅 쌍 **≥ 5,000~20,000건** (그 전엔 RAG) | 1단계: `pgvector` / Qdrant + 하이브리드 RAG; 2단계: `Unsloth` / `TRL` (GRPO/DPO) on Qwen/Gemma 7B~14B LoRA | 학습 Spot H100/A100 1회 \$50~300, 서빙 vLLM 또는 Ollama 로컬 |

---

## Part C. [섹션 4 심화] Phase 0 법무 · 데이터 · 계측 · Action API 상세 블루프린트

### C.1 2026년 규제 환경 실무 적용 매트릭스 (AI 기본법 · PIPA 제37조의2 · COPPA/GDPR-K)

**핵심 팩트**: 대한민국 **AI 기본법(인공지능 발전과 신뢰 기반 조성 등에 관한 기본법)이 2026년 1월 22일 공식 시행**되었으며, **개인정보보호법(PIPA) 제37조의2(자동화된 결정에 대한 정보주체의 권리)**와 맞물려 게임 플랫폼의 AI 개인화·제재·생성형 콘텐츠에 직접 적용된다.

| PlayHub AI 기능 | 적용 법령 조항 | 위험 등급 | 구체적 컴플라이언스 구현 규칙 (코드 레벨) |
|---|---|---|---|
| **AI 자동 부정행위/제재 탐지 (`ssot/sanctions.mjs`)** | **PIPA 제37조의2** (정보주체 권리·의무에 중대한 영향) | **높음** | **완전 자동 영구정지 금지**. ML 이상 탐지 모델은 `PENDING_REVIEW` 플래그·임시 리더보드 보류까지만 수행하고, 영구 제재(`user_sanctions`)는 **운영자(Human-in-the-Loop) 최종 승인**으로만 확정 + 이의신청/설명 경로 UI 제공 |
| **개인화 추천 · Uplift 프로모션 오퍼** | **PIPA 제37조의2**, **GDPR Art. 22** | **중** | ① **동적 가격 인상(차별적 정가 인상) 영구 금지** — 정가 SKU는 모든 유저 동일, 프로모션/보너스 혜택 제공만 허용 ② 계정 설정에 **"AI 개인화 추천·맞춤 오퍼 끄기"** 토글(OFF 시 비개인화 인기순 고정) 및 "왜 이 게임/오퍼가 추천되었는지" 요약 설명 제공 |
| **아동·청소년 계정 (`CHILD_PROTECTED`, `TEEN_MINOR`)** | **PIPA <14**, **COPPA <13**, **GDPR-K <16** | **치명적** | `user_age_compliance.age_tier !== 'ADULT'` 계정은 ① 모든 ML 학습 ETL에서 원천 배제 (`WHERE age_tier = 'ADULT'`) ② Growth Agent 프로모션·푸시·개인화 광고 타겟팅 0% ③ 아바타/소셜 안전 퀵메시지만 허용 |
| **생성형 AI 쇼츠 · AI 카피 · MMO AI 봇 · 3D 프롭** | **한국 AI 기본법 (2026.01.22 시행)** 생성형 AI 투명성·표시 의무, **EU AI Act** | **중** | ① `Hub-Shorts` Veo 생성 영상 및 메타데이터에 `ai_generated: true` 워터마크/UI 배지 의무 표기 ② MMO 동반 AI 봇 닉네임·프로필에 `[AI]` 식별 표시 및 공식 랭킹 분리 ③ Asset Store `ai_disclosure` 필드 일관 유지 |
| **창작자 코드 · 씬 · 프롬프트 학습 (`PlayForge`)** | **저작권법 · PIPA 목적 외 이용 제한** | **높음** | 기본값 **OFF (`consent_ai_training = 0`)**. 명시적 Opt-in 창작자에 한해 학습 데이터셋 포함 + **PlayCoin/무료 AI 토큰 리워드 지급**, Opt-out 즉시 차기 학습 파이프라인 제외 |
| **iOS / Android 앱 스토어 정책** | **Apple 4.7(미니게임), 5.1.1(v)(계정 삭제)**, 외부결제 유도 금지 | **높음** | ① `DELETE /api/account` 영구 삭제·익명화 API 구현(모바일 앱 내 노출) ② AdGame 데모 내 결제 UI 0원 유지 ③ Growth Agent 모바일 푸시/인앱 메시지에서 "웹에서 사면 +25% 보너스" 등 스토어 정책 위반 문구 발송을 **채널 룰 필터**로 자동 차단 |

### C.2 Phase 0 핵심 DB 스키마 확장 초안 (DDL Blueprint)

`PlayHub-Platform`의 `hub/server/db.mjs` (및 신규 `hub/server/growth/schema.mjs`)에 추가하고, `hub/tools/restore-data.mjs` (`OPTIONAL_TABLES`) 및 `hub/tools/sanitize-snapshot.mjs` (`SCHEMA_ALLOWLIST`)에 동시 등록해야 할 6대 테이블:

```sql
-- 1) 목적별 세분화 동의 원장 (PIPA / GDPR / AI Opt-in)
CREATE TABLE IF NOT EXISTS user_consents (
  principal_id TEXT NOT NULL,
  purpose TEXT NOT NULL,           -- 'analytics' | 'personalization' | 'ai_training_play' | 'ai_training_creator' | 'marketing_push' | 'marketing_email'
  granted INTEGER NOT NULL DEFAULT 0, -- 0 | 1
  policy_version TEXT NOT NULL,
  source TEXT NOT NULL,            -- 'signup' | 'settings' | 'prompt_banner'
  updated_at TEXT NOT NULL,
  PRIMARY KEY (principal_id, purpose)
);

-- 2) A/B 실험 및 Contextual Bandit 정의
CREATE TABLE IF NOT EXISTS growth_experiments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  surface TEXT NOT NULL,           -- 'home_feed' | 'shorts_feed' | 'adgame_demo' | 'promo_offer' | 'store_copy'
  mode TEXT NOT NULL,              -- 'ab_fixed' | 'contextual_bandit'
  status TEXT NOT NULL,            -- 'draft' | 'pending_approval' | 'running' | 'paused' | 'promoted' | 'rolled_back'
  variants_json TEXT NOT NULL,     -- [{id, weight, payload}]
  guardrails_json TEXT NOT NULL,   -- {maxErrorRateDelta, maxLoadP90DeltaMs, dailyPromoCoinCap, adultOnly: true}
  approved_by TEXT,
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL
);

-- 3) 결정론적 유저-실험 할당 이력 (SRM 검증 및 CUPED 조인용)
CREATE TABLE IF NOT EXISTS growth_experiment_assignments (
  experiment_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  propensity REAL NOT NULL DEFAULT 0.5, -- Bandit Inverse Propensity Scoring(IPS) 오프라인 평가용
  context_hash TEXT,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY (experiment_id, subject_id)
);

-- 4) Growth Agent 감사·실험 메모리 로그 (향후 DPO 학습원)
CREATE TABLE IF NOT EXISTS growth_agent_runs (
  id TEXT PRIMARY KEY,
  autonomy_level TEXT NOT NULL,    -- 'L0' | 'L1' | 'L2' | 'L3'
  scope TEXT NOT NULL,             -- 'platform' | 'creator:<game_id>'
  hypothesis TEXT NOT NULL,
  evidence_snapshot_json TEXT NOT NULL,
  proposed_actions_json TEXT NOT NULL,
  status TEXT NOT NULL,            -- 'proposed' | 'approved' | 'executed' | 'reverted' | 'rejected'
  outcome_summary_json TEXT,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

-- 5) 모바일 푸시 토큰 & CRM 빈도 제한 (APNs/FCM)
CREATE TABLE IF NOT EXISTS device_push_tokens (
  token_hash TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  platform TEXT NOT NULL,          -- 'ios_apns' | 'android_fcm' | 'web_push'
  raw_token_enc TEXT NOT NULL,     -- KMS/애플리케이션 암호화 저장 (sanitize 시 DROP)
  locale TEXT NOT NULL DEFAULT 'ko',
  quiet_tz TEXT NOT NULL DEFAULT 'Asia/Seoul',
  last_sent_at TEXT,
  weekly_sent_count INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

-- 6) 사용자 간 레퍼럴·초대 귀속
CREATE TABLE IF NOT EXISTS referral_links (
  code TEXT PRIMARY KEY,
  inviter_principal_id TEXT NOT NULL,
  game_id TEXT,
  reward_policy_id TEXT,
  uses_count INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL
);
```

**기존 테이블 핵심 보강 항목**:
- `events`: `placement_id`, `creative_id`, `slot_index`, `experiment_id`, `variant_id`, `utm_source`, `utm_campaign` 인덱스 컬럼 추가.
- `shorts_views`: `watch_ms`, `duration_ms`, `completed`, `play_clicked` 컬럼 추가.
- `store_events` (신규): `query`, `category`, `license_tier`, `asset_slug`, `action` (`search`/`view`/`save`/`install_in_forge`).

### C.3 누락 6대 Growth Action API 계약표 (Phase 1~2 구현 대상)

| # | 신규 API 모듈 | 핵심 엔드포인트 | 연결되는 Growth Agent 활용 |
|---|---|---|---|
| **1** | **Experiment & Flag API** | `GET /api/experiments/assign`, `POST /api/admin/experiments/{create,approve,pause,promote,rollback}` | 전 표면 A/B·Bandit 배정, Propensity 로깅, 자동 서킷브레이커 |
| **2** | **AdGame Admin CRUD API** | `POST/PATCH /api/admin/adgame/campaigns`, `PATCH /api/admin/adgame/partners/:id` | 45초 데모 시간·스타터 보상·CTA 문구 변형 배포 및 부진 소재 일시중지 |
| **3** | **Catalog Merchandising & Ranking API** | `GET /api/games?feed=personalized`, `PUT /api/admin/catalog/slots` | 정적 `catalog.json` 대체, 개인화 랭킹 + 신규 UGC Bandit 탐색 슬롯(10~15%) |
| **4** | **Push & Lifecycle CRM API** | `POST /api/mobile/push/register`, `POST /api/admin/crm/campaigns/send` | 기존 미연결 `apns.mjs` 연결 + FCM 추가, 야간(21:00~08:00) 및 주 2회 빈도 상한 강제 |
| **5** | **Referral & Invite API** | `POST /api/social/referrals/create`, `POST /api/social/referrals/claim` | 파티/친구 초대 링크 귀속 + 양측 소액 프로모 PlayCoin 자동 지급 |
| **6** | **Billing Bonus & Coupon API** | `PUT /api/admin/billing/bonus-rules`, `POST /api/admin/billing/coupons` | 기존 `policy.mjs` `upsertBonusRule()` HTTP 노출 + Pro 7일/14일 무료 체험 쿠폰 |

---

## Part D. [신규 발굴] PlayHub · PlayForge 고유 자산 기반 AI/ML/RL 사업 아이템 8선

현행 코드베이스(`UnityConverter`, `RobloxConverter`, `blender-pipeline`, `Forge-Avatar`, `PlayHub-Store` 11,826종, `Hub-AdGame`, `Hub-Shorts`, `SSOT/Billing`, `Desktop shader_telemetry`, `Multiplayer Hybrid Pool`)의 **구체적 병목과 숨은 훅(Hook)**을 교차 분석하여, 기존 5대 도메인 외에 **즉각적 경쟁 우위와 수익화로 직결되는 신규 아이템 8종**을 발굴했다.

---

### 신규 아이템 N1: **RLVR(GRPO) 자가진화 크로스엔진 게임 포팅 엔진** — `[최우선 추천 / 초대형 기술 해자]`
- **발굴 근거 (코드베이스 실측)**:
  - `tools/UnityConverter/src/orchestrator.mjs`에는 이미 **RLVR(Reinforcement Learning with Verifiable Rewards)에 완벽한 3단계 결정론적 오라클**(`validate-ir.mjs` IR 검증 + Godot `--headless --check-only` 컴파일러 + Live GPU `--fixed-fps 60` 동작 단언 및 PIL/NumPy 픽셀 텔레메트리)이 구현되어 있다!
  - 그러나 현재 `applyBoundedDeterministicRepairs()`는 **정규식 2개 규칙만 하드코딩**되어 있고, Unity 6종 샘플 328개 에셋 중 **79개(24.1%)가 Partial(부분 이식)**에 머물러 있으며, `RobloxConverter`는 60개 API·24개 검증 테스트는 있으나 자동 수리 루프가 없고 X-등급 서비스(`DataStoreService`, `MarketplaceService`)가 PlayHub `ssot/datastore.mjs`·`billing/direct-commerce.mjs`로 자동 배선되지 않는다.
- **AI/RL 설계**:
  - `(원본 Luau/C#/UE5 AST + Unified IR + 컴파일/런타임/픽셀 에러 진단) → GDScript/셰이더 패치`를 반복 시도하고 3-오라클 통과 여부를 **100% 객관적 보상(Verifiable Reward)**으로 채점하는 **Verifier-Guided Repair Agent** 구축.
  - 누적된 성공/실패 포팅 궤적을 수집해 오픈웨이트 코딩 모델(Qwen-Coder 등)에 **GRPO(RLVR)**로 학습 → **세계 유일의 "Roblox/Unity/Unreal → Godot 4.7.2 + PlayHub SSOT/0% 결제 자동 이식 AI"** 확보.
- **사업 임팩트 & 수익화**:
  - Roblox($1.5B 창작자 지급 풀, DAU 둔화) 및 Unity 창작자들의 PlayHub 이주 장벽을 "수 주 수작업 → 수십 분 원클릭"으로 파괴.
  - 대형 프로젝트 자동 포팅·검증을 `Hub-Agent` `project_porting` PlayCoin 과금(프로젝트당 200~1,000 PC) 또는 Pro 핵심 혜택으로 제공.

### 신규 아이템 N2: **VLM 시각비평 폐쇄루프 3D 프롭 & UGC 아바타 팩토리** — `[최우선 추천 / 아바타 경제 돌파구]`
- **발굴 근거 (코드베이스 실측)**:
  - ZEPETO는 **410만 종 아이템·6,800만 개 판매**로 아바타 UGC 경제를 증명했으나, PlayHub `Forge-Avatar`는 현재 **38개 아이템(총 가치 6,570 PC ≈ ₩92,000)**, `PlayHub-Store` 3D 캐릭터/장비 카테고리는 **단 8개**로 심각한 공급 병목 상태다.
  - 한편 `forge/Tools/blender-pipeline/`은 `MeshRecipe v1` → Blender CLI `.glb` 파이프라인을 이미 보유하고 있으나, **시각적·기하학적 검증 루프(떠있는 파츠, 비율 붕괴, 소켓/리깅 불일치)가 전혀 없다**.
- **AI/ML 설계**:
  - Blender CLI 생성 → **멀티뷰(정면/측면/후면/아이소메트릭) 자동 렌더링** → **VLM 시각 비평가(Critic) + 기하 검증기**(연결성·폴리곤 예산 `Skin ≤20k tris / Attachment ≤5k tris`·`kaykit_v1`/`robot_expressive_v1` 소켓 정렬·meshopt/KTX2 경량화) → 최대 3회 자동 리파인먼트(Self-Critique Loop) → 즉시 `Forge-Avatar` 4계층 모듈 패키징.
- **사업 임팩트 & 수익화**:
  - 누구나 텍스트/스케치로 규격 통과 UGC 아바타 아이템을 3분 만에 제작·판매(Track B 0% 수수료) + 생성/리깅 시 PlayCoin 소모(Track A 50~150 PC) → 아바타 카탈로그를 38개 → 수만 개로 폭증시켜 **한국/아시아형 아바타 소셜 플라이휠** 점화.

### 신규 아이템 N3: **AI 플레이어블 광고 자동 증류기 ("40MB 게임 → ≤2MB 45초 MRAID AdGame")** — `[강력 추천 / UA 게임체인저]`
- **발굴 근거 (코드베이스 실측)**:
  - PlayHub 풀 Godot 빌드는 **39~42MB WASM**이라 당근/토스 WebView 콜드로딩 불가, 심지어 현행 AdGame 플래그십 데모 5종 중 2종(`besiege` **4.55MB**, `league-of-legends` **6.37MB**)도 **2MB LTE/MRAID 상한을 2~3배 초과**한다.
  - 글로벌 시장에서 **Sett.ai** 등이 입증했듯 플레이어블 광고는 일반 영상 대비 **CPI·IPM·CVR 최대 +40%**를 기록하지만 수작업 제작 단가가 높다.
- **AI/ML 설계**:
  - ① 실제 플레이 세션 텔레메트리에서 **몰입도·재시도율·D1 상관도가 가장 높은 45초 핵심 루프 구간**을 ML로 자동 식별.
  - ② Agentic 코드 생성기 + 에셋 다운샘플러(텍스처 압축·오디오 트림·코드 트리셰이킹)가 해당 핵심 루프를 **≤2MB 단일 HTML5/MRAID 3.0 패키지**로 자동 경량화하고, `window.PlayHubDemo` 11단계 훅 주입 후 `tools/adgame/validate-demo-bundle.mjs` + 헤드리스 브라우저 TTI(≤2.0s) 자동 검증까지 완결.
  - ③ 당근(`karrot` ₩1,500 CPA+12%)·토스(`toss` 55% RevShare)·글로벌 MRAID(AppLovin/Unity/Meta)에 자동 배포.
- **사업 임팩트 & 수익화**:
  - 내부 UA 소재 제작비를 90% 절감하고, L3 Creator Growth Agent에서 창작자가 **"내 게임 45초 체험 광고 자동 생성(300~500 PC)"**을 원클릭 구매하는 고부가가치 상품으로 확장.

### 신규 아이템 N4: **11,826종 라이선스 안전 오픈 에셋 멀티모달 시맨틱 검색 & AI 씬 킷배싱** — `[강력 추천 / 즉시 저비용·저작권 리스크 0%]`
- **발굴 근거 (코드베이스 실측)**:
  - `store/data/collected-catalog.json`에는 이미 **11,826종의 라이선스 검증 완료 + `No generative AI used` 오픈 에셋**(CC0 5,510종, CC-BY/MIT/Apache 6,306종; 아이콘 4,243, PBR 재질 3,340, HDRI 1,438, 3D 프롭 580, Godot 도구/스크립트 1,892)이 깔끔하게 구조화되어 있다.
  - 그러나 현재 검색(`filterCatalogEntries`)은 단순 **`String.includes()` 문자열 일치** 수준이라 창작자도, `playforge_agent_chat` AI도 이 보물을 제대로 활용하지 못한다.
- **AI/ML 설계**:
  - 11,826종 전 에셋의 썸네일·PBR 속성·색상 팔레트·장르 태그·Godot API 설명을 **CLIP(이미지) + 다국어 Dense Embedding(텍스트)**으로 벡터 인덱싱(총 인덱스 크기 ~50MB 미만, 초저비용!).
  - `playforge_agent_chat`이 "사이버펑크 비 오는 밤 아레나 만들어줘"를 받으면, 생성형 AI로 저작권 불명 3D를 억지로 굽는 대신 **스타일·색감이 일관된 HDRI + PBR 바닥 + 3D 프롭 + UI 아이콘 + SFX 세트를 11,826종에서 자동 조합(Kitbashing)**하고 `Third-Party Notices.txt`까지 자동 완성.
- **사업 임팩트 & 수익화**:
  - **저작권/AI 학습 분쟁 리스크 0%**, 제작 품질·속도 수 배 향상, 외부 3D 생성 API 원가 80% 절감. Phase 0~1에서 가장 빠르게 체감 임팩트를 낼 수 있는 "숨은 퀵윈(Quick Win)".

### 신규 아이템 N5: **통합 서버 권위 안티치트 · AdGame CPA 부정방지 · Track A/B 결제 리스크 ML 엔진** — `[필수 방어 인프라]`
- **발굴 근거 (코드베이스 실측)**:
  - `docs/eos/EOS_FEASIBILITY_AND_SSOT_PLAN.md`에서 **Easy Anti-Cheat(EAC)는 웹/WASM 및 동적 `.pck` UGC 구조와 비호환으로 명시적 제외**되었다.
  - 동시에 플랫폼은 ① 리더보드/스탯 조작(`ssot/`) ② 당근·토스 ₩1,000~1,500 CPA 및 스타터 150~200 PC 보상 사냥(`adgame/`) ③ 웹 +25% 보너스 스트리핑 및 Track B 창작자 사기 상품/차지백(`billing/`)이라는 3대 어뷰징 표면을 가진다.
- **AI/ML 설계**:
  - 3개 표면의 로그(`leaderboard_submissions`, `datastore_entries` 락 경합, `ad_funnel_events`·`ad_demo_sessions`, `billing_orders`·`billing_direct_orders`·`billing_giftcards`)를 단일 **경량 이상 탐지 파이프라인(Isolation Forest + LightGBM Fraud Scorer)**으로 통합.
  - **PIPA 제37조의2 준수**: 고위험 점수 계정은 자동 영구정지가 아니라 `PENDING_REVIEW` 격리(리더보드 임시 제외·CPA 정산 보류·`billing_creator_products` 검토 큐 이동) 후 운영자 승인 확정.
- **사업 임팩트**:
  - 웹/모바일/데스크톱 통합 UGC 플랫폼에서 EAC 없이도 신뢰할 수 있는 경쟁/경제 환경 보장 + AdGame CPA 누수·차지백 손실 선제 방어.

### 신규 아이템 N6: **바이럴 게임플레이 하이라이트 자동 9:16 쇼츠 클리퍼** — `[높은 바이럴 ROI / 쇼츠 원가 95% 절감]`
- **발굴 근거 (코드베이스 실측)**:
  - 현재 `Hub-Shorts`는 프롬프트 기반 Veo 3.1 생성(60~120 PC, 비싼 원가 + 실제 게임화면과 괴리 위험) 또는 정적 이미지 Ken Burns FFmpeg(20 PC)에 의존한다.
  - 반면 실제 게임(`iron-wood`, `fortress-war`, `brawllabs`, `survivor-io`, `besiege`)에서는 폭발·역전·극적 클리어·웃긴 물리 붕괴 순간이 진짜 바이럴 콘텐츠다.
- **AI/ML 설계**:
  - 게임플레이 텔레메트리/리플레이 스트림에서 **흥분도 스파이크(점수 급등, 연속 콤보, HP 5% 미만 역전, 대형 물리 충돌, 다중 처치)**를 경량 시계열 탐지기로 자동 태깅.
  - 해당 전후 15초를 9:16 세로 크롭 + 자동 자막(8개국어 L10N) + BGM 싱크로 **로컬 FFmpeg 0~5 PC 원가**로 즉시 쇼츠 초안 생성 → 유저/창작자 1-클릭 게시.
- **사업 임팩트**:
  - 쇼츠 제작 단가 95% 절감 + "진짜 플레이 영상" 기반의 진정성 높은 숏폼 피드 공급 폭증 → 쇼츠→즉시 플레이 전환율 및 SNS 바이럴 극대화.

### 신규 아이템 N7: **데스크톱 셰이더 히치(6.65s→0.96s) 예측 프리워밍 & 하이브리드 MP Warm Pool 오토스케일러** — `[인프라 마진 · UX 직결]`
- **발굴 근거 (코드베이스 실측)**:
  - `HUB_DESKTOP_PLAN.md` M0 실측에서 **콜드 스타트 셰이더 컴파일 첫 프레임은 6,651 ms로 웜 스타트(963 ms) 대비 6.9배 느리다**. `bridge.v1` `shader_telemetry`가 이미 `(gpuVendor, gpuName, driverVersion, renderer, gameId, firstFrameLatencyMs, hitchCount)`를 수집하도록 설계되어 있다.
  - 또한 `multiplayer-deploy-billing-plan.md`의 **Option B Hybrid Pool(57.7~62.6% 마진)**은 롱테일 UGC 월드(90~95% 유휴)를 노드당 10~20개씩 패킹하고 2~4초 내 기동하는 **Warm Pool 효율**이 수익성의 핵심이다.
- **AI/ML 설계**:
  - **(a) 셰이더 캐시 우선순위 ML**: `shader_telemetry`를 `(gpuName, driverVersion, gameId)`로 군집화해 히치 임팩트가 가장 큰 조합을 자동 선정 → CI에서 Fossilize/R2 CAS 사전 빌드 파이프라인 캐시 및 `warmupShaders` 매니페스트 우선 배포.
  - **(b) MP Warm Pool 시계열 예측 오토스케일러 & Burn-Rate 예측기**: 요일·시간대·쇼츠/AdGame 캠페인 유입 시그널로 동접 피크를 30분~2시간 선행 예측해 Warm Pool을 탄력 조절하고, 창작자에게 정확한 **PlayCoin 소진 예상 시각**을 사전 경고.
- **사업 임팩트**:
  - 첫 프레임 6.65s → ≤2.0s 단축으로 **데스크톱 D1 이탈 대폭 방어** + 멀티플레이 유휴 서버 비용 25~40% 절감(마진 60%+ 안정화).

### 신규 아이템 N8: **윤리적 Flow-State 동적 난이도 조절(DDA) & 소셜 성향 기반 파티 매치메이킹 SDK** — `[Phase 2~3 리텐션 무기]`
- **발굴 근거 (코드베이스 실측)**:
  - `hub/server/social/`에는 이미 친구·프레즌스·4~8인 파티·동반 진입(`social_party_launches`)이 구현되어 있고, `ssot/progression.mjs`에는 플레이어 스탯/업적이 있다.
- **AI/ML 설계**:
  - **윤리적 DDA SDK**: `godot-sdk` 플러그인으로 연속 실패·조작 정체(좌절) 또는 무피격 연속 클리어(지루함)를 감지해 적 스폰/탄속/힌트 등 인게임 밸런스를 미세 조정(EA DDA 특허 논란·규제를 피하기 위해 **과금·결제 이력 변수를 입력 피처에서 완전 금지**하고 순수 스킬·몰입도 기반 싱글/협동 PvE에만 적용 + 설정에서 해제 가능).
  - **소셜 성향 클러스터링 매칭**: 플레이 행동(솔로/파티 비율, 플레이 시간, 경쟁 리더보드 참여, 협동 완료율)을 비지도 클러스터링해 **신규/이탈 위험 유저에게 친화적인 협동 파티·길드형 방**을 우선 추천.
- **사업 임팩트**:
  - 초반 5분 좌절 이탈 감소 + 소셜 유대 기반의 구조적 D30 장기 리텐션 강화.

---

### 신규 아이템 8선 종합 우선순위 매트릭스 (실행 추천 순위)

| 순위 | 코드 | 신규 아이템 | 현행 코드베이스 시너지 | 구현 난이도 | 단기 임팩트 | 장기 해자 | 추천 착수 시점 |
|---|---|---|---|---|---|---|---|
| **1** | **N4** | **11,826종 오픈 에셋 시맨틱 검색 & AI 씬 킷배싱** | `store/collected-catalog.json` + `playforge_agent_chat` | **낮음** (2~3주) | **매우 높음** | 중상 | **Phase 0~1 (즉시)** |
| **2** | **N1** | **RLVR(GRPO) 자가진화 크로스엔진 포팅 엔진** | `UnityConverter/orchestrator.mjs` 3-오라클 + `RobloxConverter` | 중~높음 | 높음 | **최상 (독보적)** | **Phase 1(수리 루프) → Phase 2(RLVR)** |
| **3** | **N3** | **AI 플레이어블 광고 자동 증류기 (≤2MB AdGame)** | `Hub-AdGame` + `validate-demo-bundle.mjs` + Growth Agent | 중 | **매우 높음** | **최상** | **Phase 1~2** |
| **4** | **N2** | **VLM 시각비평 3D 프롭 & UGC 아바타 팩토리** | `blender-pipeline` + `Forge-Avatar`(38개 병목) | 중 | 높음 | **매우 높음** | **Phase 2** |
| **5** | **N6** | **바이럴 게임플레이 하이라이트 9:16 자동 클리퍼** | `Hub-Shorts` + `play_sessions`/리플레이 | **낮음~중** | 높음 (원가 -95%) | 중상 | **Phase 1~2** |
| **6** | **N5** | **통합 서버 권위 안티치트 · CPA/결제 리스크 ML** | `ssot/` + `adgame/` + `billing/` (EAC 공백 대체) | 중 | 중상 (손실 방어) | 높음 | **Phase 1~2** |
| **7** | **N7** | **셰이더 히치 예측 프리워밍 & MP Warm Pool 스케일러** | `desktop shader_telemetry` + MP Hybrid Pool | 중 | 중 (마진·UX) | 중상 | **Phase 2** |
| **8** | **N8** | **윤리적 Flow-State DDA & 소셜 성향 매칭 SDK** | `godot-sdk` + `social/` + `ssot/progression` | 중~높음 | 중 | 높음 | **Phase 2~3** |

---

## Part E. 최종 전략 조합 제안 — "PlayHub AI 3대 킬러 플라이휠"

이번 딥 리서치와 신규 아이템 발굴을 종합하면, 한정된 리소스로 최대 임팩트를 내기 위해 **모든 아이템을 나열식으로 추진하지 말고 아래 3대 핵심 플라이휠에 집중 투자**하는 것이 최적이다:

1. **플라이휠 1 [즉시 수익·성장 엔진]**: **Growth Hacker Agent (L0→L3)** + **N3 (AI 플레이어블 광고 자동 증류기)** + **N6 (바이럴 하이라이트 쇼츠 클리퍼)** + **D1 (추천/Uplift)**
   - *효과*: 당근/토스/쇼츠 획득 단가(CPA) 급감 + 웹 PlayCoin(+25% 보너스) 전환 극대화 + 창작자용 **Creator Growth Agent (Pro + PlayCoin)** 고마진 신규 매출원 창출.
2. **플라이휠 2 [창작자 공급 압도 엔진]**: **N4 (11,826종 시맨틱 킷배싱)** + **N1 (RLVR 자가진화 Roblox/Unity 포팅)** + **N2 (VLM 3D/UGC 아바타 팩토리)**
   - *효과*: 0% 수수료 정책과 결합해 Roblox($1.5B 풀)·Unity 창작자의 이주 장벽을 없애고, 저작권 안전한 에셋·아바타 공급을 38개→수만 개 규모로 폭증.
3. **플라이휠 3 [품질·신뢰·마진 방어 엔진]**: **Phase 0 법무(PIPA 제37조의2·2026 AI 기본법·아동 격리·DSAR)** + **N5 (통합 안티치트·부정방지 ML)** + **D3 (`GamerQA` AI 밸런싱/MMO 봇)** + **N7 (셰이더 프리워밍·MP 오토스케일러)**
   - *효과*: EAC 없는 웹/UGC 환경의 공정성·안전성 확보, 법적 리스크 차단, 멀티플레이 60%대 인프라 마진 수성.
