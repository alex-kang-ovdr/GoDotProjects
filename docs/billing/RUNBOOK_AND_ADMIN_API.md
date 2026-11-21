# PlayHub Billing 운영 런북 및 Admin API 연동 명세 (M4)

> 기준 브랜치: `Hub-Billing` (2-Track 과금 아키텍처 v2.0 — Track A 1P PlayCoin +25% · Pro/사용량 + Track B 창작자 직접판매 0%)
> 소유권 경계: 관리자 UI 파일(`hub/web/admin/**`)은 `PlayHub-Admin` 워크트리 소유이므로, 본 문서는 `PlayHub-Admin`의 `?tab=billing` 화면이 루프백 전용 `/api/admin/billing/*` API에 충돌 없이 바로 연동할 수 있도록 전체 계약과 운영 절차를 제공한다.

---

## 1. 환경 변수 및 `config/local.json` 설정

과금 모듈은 기본 **비활성(Fail-Closed)** 상태이며, `config.billing.enabled === true` 또는 `PLAYHUB_BILLING_ENABLED=1`일 때만 마운트된다.

```json
{
  "billing": {
    "enabled": true,
    "routingStage": "stage1",
    "allowMockProvider": false,
    "allowDemoAccount": false,
    "giftcardPepper": "<32자 이상 랜덤 시크릿 (env: PLAYHUB_BILLING_GIFTCARD_PEPPER)>",
    "internalSecret": "<32자 이상 S2S 시크릿 (env: PLAYHUB_BILLING_INTERNAL_SECRET)>",
    "circuitBreakerFailureThreshold": 3,
    "circuitBreakerCooldownMs": 60000,
    "xsolla": {
      "merchantId": "...",
      "projectId": "...",
      "apiKey": "...",
      "webhookSecret": "...",
      "sandbox": false
    },
    "toss": {
      "clientKey": "live_ck_...",
      "secretKey": "live_sk_...",
      "webhookSecret": "...",
      "sandbox": false
    },
    "stripeGpay": {
      "publishableKey": "pk_live_...",
      "secretKey": "sk_live_...",
      "webhookSecret": "whsec_...",
      "googlePayEnvironment": "PRODUCTION"
    },
    "stripeConnect": {
      "secretKey": "sk_live_...",
      "webhookSecret": "whsec_..."
    }
  }
}
```

### 프로덕션 보안 가드 (기동 시 자동 검증)
- `secureCookies === true` 환경에서 `allowMockProvider: true`를 설정하면 서버 기동이 즉시 중단된다.
- `secureCookies === true` 환경에서 `giftcardPepper`가 32자 미만이면 기동이 거부된다.
- 모든 웹훅(`/api/billing/webhooks/:provider`) 및 내부 S2S 사용량 API(`/api/billing/usage`, `/api/billing/usage/holds*`)는 브라우저 `Origin` 헤더가 포함되면 `403`으로 즉시 거부한다.
- 창작자 개인 API 비밀키(`apiKey`, `secretKey`, `privateKey`, `accessToken`, `refreshToken`)는 어떤 엔드포인트에서도 입력 시 `400 CREATOR_SECRET_KEY_FORBIDDEN`으로 거부된다.

---

## 2. Stage 1 → Stage 2 → Stage 3 PG 전환 및 서킷브레이커 롤백 절차

| 단계 | 전환 조건 | 라우팅 규칙 (`router.mjs`) | 장애 폴백 |
|---|---|---|---|
| **Stage 1 (`stage1`)** | 초기 출시 (P0~P1) | 전 통화 웹·PC → `xsolla` (MoR · Google Pay Instant Flow · 200+국 VAT · 한국 간편결제) | — |
| **Stage 2 (`stage2`)** | 한국 월 KRW 매출 ≥ ₩3,000만 | `KRW` → `toss` (~3.3%, +5.2%p 절감) / 기타 통화 → `xsolla` | `toss` 연속 3회 5xx 시 60초간 `xsolla` 자동 폴백 |
| **Stage 3 (`stage3`)** | 해외 월 매출 ≥ USD 100K | `KRW` → `toss` / `google_pay` & USD·EUR·GBP·JPY → `stripe_gpay` (Google 수수료 0%) / 기타 → `xsolla` | `stripe_gpay` 또는 `toss` 서킷 오픈 시 `xsolla` 자동 폴백 |

### 무중단 롤백 방법
1. `config.billing.routingStage`를 이전 단계(`stage2` 또는 `stage1`)로 되돌리고 프로세스를 재시작한다.
2. 이미 생성된 주문의 결제 확정(`/confirm`), 환불(`/withdraw`), 웹훅(`/webhooks/:provider`)은 주문 레코드에 기록된 `billing_orders.provider` 어댑터를 통해 계속 처리되므로 진행 중 거래가 유실되지 않는다.

---

## 3. 루프백 전용 Admin API 계약 (`127.0.0.1:8091`, `PlayHub-Admin` 연동용)

모든 `/api/admin/billing/*` 엔드포인트는 루프백 관리자 리스너(`127.0.0.1:8091`)에서만 응답하며, 인증된 Admin 세션 쿠키(`poc_admin_session`)와 POST 시 `X-CSRF-Token` 및 `Origin: http://127.0.0.1:8081`이 필수이다.

| 메서드 및 경로 | 목적 | 주요 응답 / 요청 필드 |
|---|---|---|
| `GET /api/admin/billing/status` | 통합 운영 요약 | `ok`, `integrity` (`globalSum === 0`), `routerHealth`, `ordersByState`, `activeProCount`, `activeEntitlementCount`, `giftcardsByState`, `usageByMetric`, `directOrdersByState` |
| `GET /api/admin/billing/reconcile` | 일일 전수 대사 감사 | `ok`, `ledgerIntegrity`, `trackAChecks`(25% 하드캡·주문-원장 일치), `giftcardLiabilityCheck`(`sys:liability:gc_unredeemed == ACTIVE 카드 원금`), `trackBChecks`(0% 수수료·`Entitlement` 일치·원장 미혼입), `alerts` |
| `GET /api/admin/billing/giftcards/batches` | 기프트카드 배치 목록 | `batches[]` (`counts: { ISSUED, ACTIVE, REDEEMED, VOIDED, EXPIRED }`) |
| `POST /api/admin/billing/giftcards/batches` | 배치 발행 (1회성 PIN/CSV) | 요청: `{ channel, partnerName, currency, faceValueMinor, baseCoins, bonusBps <= 2500, quantity, expiresAt, activateImmediately }` → 응답: `{ batch, oneTimePins, csv }` |
| `POST /api/admin/billing/giftcards/batches/:id/activate` | 배치 활성화 & 선수금 분개 | `activatedCount`, `liabilityEntryId`, `batch` |
| `POST /api/admin/billing/giftcards/batches/:id/void` | 배치 미사용 카드 일괄 폐기 | 요청: `{ reason }` → 미사용 `ACTIVE` 카드 선수금 자동 역분개 |
| `POST /api/admin/billing/giftcards/:serial/void` | 도난/훼손 단건 카드 폐기 | 요청: `{ reason }` → `REDEEMED` 카드 보호, `ACTIVE` 카드 선수금 역분개 |
| `POST /api/admin/billing/wallets/:principalId/promo` | CS 무상 `promo` 지급 | 헤더: `Idempotency-Key` / 요청: `{ coins, reason, expiresAt? }` (감사 로그 자동 기록) |
| `GET /api/admin/billing/direct/overview` | Track B 리스크 현황 조회 | `connections[]`, `products[]`, `orders[]` |
| `POST /api/admin/billing/direct/products/:id/suspend` | 사기성 상품 즉시 판매 정지 | 요청: `{ reason }` (창작자 자가 해제 불가) |
| `POST /api/admin/billing/direct/products/:id/restore` | 상품 심사 후 판매 복구 | 요청: `{ reason }` |
| `POST /api/admin/billing/direct/connections/:principalId/suspend` | 창작자 직접판매 계정 정지 | 요청: `{ reason }` (외부 Stripe `account.updated` 웹훅 덮어쓰기 차단) |
| `POST /api/admin/billing/direct/connections/:principalId/restore` | 창작자 계정 복구 | 요청: `{ reason }` |

---

## 4. 장애·리스크 대응 플레이북

1. **일일 대사(`GET /api/admin/billing/reconcile`)에서 `ok: false` 발생 시**:
   - `ledgerIntegrity.ok === false`: 즉시 신규 충전/소비를 점검하고, `billing_journal_entries`와 `billing_wallet_lots` 불일치 원인을 감사 로그(`audit`)와 대조한다.
   - `giftcardLiabilityCheck.diffCoins !== 0`: 배치 활성화/폐기 누락 여부를 확인한다.
   - `trackBChecks.refundedDirectStillActiveCount > 0`: 누락된 Stripe Connect 환불/분쟁 웹훅을 재전송(Stripe Dashboard → Webhooks → Resend)하여 멱등하게 `REVOKED` 전이를 완료한다.
2. **차지백 발생 시**:
   - Xsolla `dispute` 또는 Stripe `charge.dispute.created` 웹훅이 도착하면 Track A는 미사용 로트 우선 회수 + 기사용분 `debt_coins` 기록 + 계정 자동 동결(`frozen_reason = 'chargeback_debt'`)을 즉시 수행한다.
   - Track B는 해당 주문의 `billing_entitlements.state`를 즉시 `REVOKED`로 전환하고, 반복 발생 시 `POST /api/admin/billing/direct/connections/:id/suspend`로 창작자 판매를 정지한다.
3. **도난 기프트카드 신고 시**:
   - 단건 시리얼이면 `POST /api/admin/billing/giftcards/:serial/void`, 박스/배치 단위면 `POST /api/admin/billing/giftcards/batches/:id/void`를 호출한다. 이미 등록된 카드는 보존되며 미등록 카드만 즉시 무효화 및 선수금 부채 역분개 처리된다.
4. **백업·복원 검증**:
   - 20개 `billing_*` 테이블 전체가 `hub/tools/restore-data.mjs`의 `OPTIONAL_TABLES`에 등록되어 있으며 `PRAGMA user_version = 1` 및 무뷰/무트리거 규칙을 준수한다. 배포 전 `node --test tests/billing-*.test.mjs tests/restore.data.test.mjs` 통과를 필수 게이트로 삼는다.
