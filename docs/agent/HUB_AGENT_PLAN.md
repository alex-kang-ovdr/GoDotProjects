# PlayHub 내장 Gemini 에이전트 및 토큰 기반 PlayCoin 과금 설계 (`Hub-Agent`)

- **브랜치**: `Hub-Agent` (Base: `PlayHub-Platform`)
- **연동 트랙**: `Hub-Billing` Track A (`PlayCoin` Zero-Sum 복식부기 원장 · `Free` / `Pro` 구독)
- **적용 범위**:
  1. **허브 내장 에이전트 채팅** (`hub_chat` — `/?view=agent`)
  2. **3D 모델링 생성** (`modeling_3d` — Hub AI 스튜디오 `.glb` 생성 및 PlayForge Blender Studio AI 플래너)
  3. **프로젝트 포팅** (`project_porting` — Roblox Luau / Unity C# / Unreal C++ → Godot 4.7.2 자동 변환 스튜디오)
  4. **PlayForge AI Chat** (`forge_chat` — `OfficialGodot/agent.html` 및 Godot 에디터 `playforge_agent_chat` 독에서 본인 계정 미연동 시)

---

## 1. 핵심 설계 결정: 왜 `Free 체험 한도 + Pro 주간 사용량 + 초과분 PlayCoin` 구조가 가장 단순한가?

AI 호출마다 매번 지갑 원장(`billing_journal_entries`, `billing_wallet_lots`)을 건드리면 소액 호출 수천 건이 복식부기 원장을 파편화시키고, 신규 가입자(`0 PlayCoin`)가 첫 프롬프트조차 실행하지 못하는 진입 장벽이 발생합니다. 이를 **3단계 워터폴(Waterfall)** 로 분리하면 아키텍처와 사용자 경험이 동시에 단순해집니다:

| 단계 | 조건 | 기본 한도 차감 | PlayCoin 원장 차감 | 특징 |
|---|---|---|---|---|
| **0단계: 본인 계정 연동 (BYOK)** | 사용자가 개인 Gemini / OpenAI / Claude API 키 또는 로컬 런타임 연결 | `0` | **`0 PlayCoin`** | 플랫폼 원가 0원 → 완전 무과금·무제한 |
| **1단계: 플랜 기본 포함 한도** | **Free**: 가입 1회 체험 한도 (`50,000` 가중 토큰)<br>**Pro**: 매주 월요일 `00:00 KST` 자동 리셋 (`500,000` 가중 토큰) | `hub_agent_quotas` 카운터만 증가 | **`0 PlayCoin`** | 원장 분개 없이 고속 차감, `0 코인` 신규 유저 즉시 체험, Pro 월간 한도 조기 소진 방지 |
| **2단계: 한도 초과분 종량 과금** | 플랜 기본 한도를 초과한 가중 토큰(`overageTokens > 0`) | 잔여 한도 우선 소진 후 초과분만 계산 | **`ceil(overage / 2,000)` PlayCoin** | `reserveHold` → `recordMeteredUsage`(`ai_units`) → `promo → bonus → paid` FIFO 정산 |

---

## 2. 운영자("내") Gemini 연결 아키텍처

운영자의 개인 작업 환경이나 사용자 세션과 섞이지 않도록 전용 격리 디렉터리(`<dataDir>/hub-agent/`)에서 두 가지 인증 수단을 지원합니다 (`hub/server/agent/gemini-provider.mjs`):

1. **전용 Gemini OAuth 프로필 (`gemini-oauth`, 기본 권장)**:
   - 관리형 `@google/gemini-cli` 번들을 `HOME`/`USERPROFILE=<dataDir>/hub-agent/gemini-account`, `GEMINI_FORCE_FILE_STORAGE=true` 환경으로 격리 실행합니다.
   - Loopback Admin 콘솔(`/agent-admin.html`)에서 **[Google OAuth 브라우저 로그인 시작]** 클릭 시 OAuth 인증 URL을 생성·오픈하며, 인증 완료 시 `.gemini/gemini-credentials.json`이 격리 폴더에만 저장됩니다.
   - 추론 호출 시 `--approval-mode plan --skip-trust -o json` (스트리밍 시 `-o stream-json`) 플래그로 실행하여 파일시스템/셸 도구 실행을 원천 차단하고 순수 텍스트/JSON 생성과 정확한 토큰 통계(`stats.models[*].tokens`)만 수집합니다.
2. **운영자 Gemini API Key (`gemini-apikey`, 무중단 서버용 보조/대체)**:
   - Google AI Studio API 키(`AIza...`)를 `<dataDir>/hub-agent/operator-secrets.json` (`0o600`, SQLite 외부 파일)에 저장합니다.
   - DB 백업/스냅샷(`playhub.sqlite`)에 운영자 비밀키가 절대 포함되지 않으며, Admin API 응답에는 마스킹 문자열(`AIzaSy...xxxx`)만 노출됩니다.

---

## 3. 토큰 가중치 및 PlayCoin 환산 공식

입출력 단가 차이와 추론(Thinking) 토큰 비용을 정확히 반영하기 위해 가중 토큰(`weightedTokens`) 공식을 사용합니다 (`hub/server/agent/pricing.mjs`, Admin에서 실시간 조정 가능):

$$\text{weightedTokens} = \lceil (\text{input} \times 1.0 + \text{cached} \times 0.25 + (\text{output} + \text{thinking}) \times 4.0) \times M_{\text{model}} \rceil$$

- **모델 배수 $M_{\text{model}}$**:
  - Flash 계열 (`gemini-3.5-flash`, `gemini-2.5-flash` 등): `1.0x`
  - Pro 계열 (`gemini-2.5-pro`, `gemini-3.5-pro` 등 `*-pro*`): `4.0x`
- **PlayCoin 차감량** (`overageTokens > 0`일 때):
  $$\text{chargedCoins} = \max\left(\text{minCoinsPerCall},\ \left\lceil \frac{\text{overageTokens}}{\text{tokensPerCoin}} \right\rceil\right)$$
  - 기본값: `tokensPerCoin = 2,000` 가중 토큰당 `1 PlayCoin`, `minCoinsPerCall = 1 PlayCoin`.
- **실패 시 자동 홀드 해제**:
  - 호출 전 예상 토큰이 잔여 기본 한도를 초과하면 `reserveHold`로 PlayCoin을 선점하고, 업스트림 LLM 오류 발생 시 즉시 `releaseHold`를 호출해 사용자 코인이 유실되지 않도록 보장합니다.

---

## 4. API 및 서비스 경계

### 4.1 Public User API (`/api/hub-agent/*`, 등록 계정 세션 + CSRF 필수)
- `GET /api/hub-agent/status` — 내장 에이전트 가용 상태, 단가 정책, 로그인 사용자의 플랜(`free`/`pro`), 잔여 기본 한도, PlayCoin 잔액 조회
- `GET /api/hub-agent/usage` — 기능별 토큰 사용량 및 차감 PlayCoin 영수증 내역 조회
- `POST /api/hub-agent/chat` — 허브 내장 에이전트 채팅 (`byok` 전달 시 0 코인)
- `POST /api/hub-agent/modeling` — 프롬프트 기반 `MeshRecipe v1` 생성 + 순수 Node 바이너리 glTF 2.0(`.glb`) 컴파일
- `GET /api/hub-agent/modeling/:assetId/model.glb` — 본인 세션 전용 `.glb` 바이너리 다운로드
- `POST /api/hub-agent/porting` — `roblox` / `unity` / `unreal` 소스 정적 매핑 분석 + Godot 4.7.2 프로젝트 번들(`project.godot`, `scenes/main.tscn`, `scripts/*.gd`, `PORTING_REPORT.md`) 생성 및 Unreal EULA 에셋 경고

### 4.2 Internal S2S API (`/internal/v1/hub-agent/*`, Loopback + `X-PlayHub-Internal-Secret`)
PlayForge(`forge/Tools/hub-agent-bridge.cjs`)가 본인 계정을 연동하지 않은 사용자의 AI 요청을 PlayHub로 위임할 때 사용합니다:
- `POST /internal/v1/hub-agent/resolve-session` — 로컬 개발 모드에서 Hub 세션 쿠키 검증
- `POST /internal/v1/hub-agent/status` — Forge 공급자 목록용 실시간 한도/잔액 조회
- `POST /internal/v1/hub-agent/chat` — JSON 및 `application/x-ndjson` 실시간 스트리밍(`delta` + `final` 영수증 프레임) 지원
- `POST /internal/v1/hub-agent/modeling` — 3D 모델링 위임
- `POST /internal/v1/hub-agent/porting` — 프로젝트 포팅 위임 (`createNewProject` / `applyToProjectId`로 PlayForge 워크스페이스 즉시 반영)

### 4.3 Loopback Admin API (`/api/admin/hub-agent/*`, `127.0.0.1` 관리자 전용)
- **보안 원칙**: 관리자 콘솔(`/agent-admin.html`)과 `/api/admin/hub-agent/*`는 로컬 루프백(`127.0.0.1`) 전용이며 외부 `cloudflared` 터널로 절대 노출하지 않습니다.
- `GET /api/admin/hub-agent/status` — OAuth/API 키 연결 상태, 정책, 기능별 누적 토큰/매출 코인 통계
- `POST /api/admin/hub-agent/connect/oauth` — 운영자 Google Gemini OAuth 로그인 시작
- `POST /api/admin/hub-agent/connect/apikey` — 운영자 Gemini API 키 저장
- `POST /api/admin/hub-agent/disconnect` — 연결 해제
- `PUT /api/admin/hub-agent/policy` — `freeTrialTokens`, `proWeeklyTokens`, `tokensPerCoin`, 가중치 실시간 변경
- `POST /api/admin/hub-agent/test` — 무과금 운영자 연결 스모크 테스트

---

## 5. 스냅샷 비식별화 및 멀티테넌트 안전성

- **Live → Dev 스냅샷 보호**: `hub/tools/sanitize-snapshot.mjs`의 `DROP_TABLES`에 `hub_agent_usage_logs`, `hub_agent_quotas`를 등록하여 실사용자 AI 사용 이력이 개발용 스냅샷으로 유출되지 않도록 삭제하고, `hub_agent_settings` 정책값만 유지합니다.
- **PlayForge 사용자별 BYOK 격리**: `forge/Tools/hub-agent-bridge.cjs`는 개인 API 키를 호스트 전역 파일에 저장하지 않고 `auth.userId`별 인메모리 세션 맵(TTL 12시간)에만 격리 보관하여 타 사용자 노출을 차단합니다.
- **Blender 백그라운드 큐 컨텍스트 보호**: `POST /api/blender/jobs` 요청 시 큐 적재 전에 요청자 `auth.userId` 컨텍스트에서 AI `MeshRecipe v1` 생성과 토큰/PlayCoin 정산을 즉시 완료하여, 비동기 큐 체이닝 중 다른 사용자의 계정에 과금되거나 `402` 오류가 지연되는 문제를 원천 방지합니다.
