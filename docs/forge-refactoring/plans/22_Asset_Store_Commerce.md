# 22. 에셋 스토어 결제·정산·평가·탐색 개발

| 항목 | 계획 |
|---|---|
| 계획 ID / 기준일 | PLAN-22 / 2026-11-24 |
| 원문 연결 | PDF 6-8쪽: 유료 판매, 정산, 품질 점수, 유사 에셋 탐색 |
| 우선순위 / 상태 | P1, 무료 카탈로그 검증 후 상거래 단계 / 설계안 |
| 구현 위치 | 사용자 조직이 운영하는 Hub/Forge 스토어 backend·웹 UI |
| 담당 | backend, 웹 frontend, QA, 운영·정산 담당 |
| 예상 공수 | 26-42 PW, 1 PW = 숙련 담당자 5근무일; PSP 계약 대기 제외 |
| 선행 / 연계 | 23 서명 패키지·버전, 계정/권한, 24 유지보수·검증 체계 |

## 1. 목표·운영 주체

제작자가 에셋을 등록·배포하고 사용자가 호환성·라이선스·평가를 비교해 선택할 수 있는 스토어를 만든다. 첫 출시는 무료 에셋과 제한된 제작자 그룹으로 검증하고, 판매·정산 경로를 추가한다.

우리 조직이 통제할 대상은 자체 스토어다. 공식 Godot Asset Store의 유료화·정산·수수료는 재단/운영자의 결정이므로 별도 기여 제안으로만 다룬다. 이 개발 계획이 공식 스토어 출시 약속을 의미하지 않는다.

## 2. 확인 사실과 설계 원칙

공식 Godot Asset Store roadmap은 무료 beta, 향후 유료 에셋, review score, tag 기반 discovery, CLI 등을 계획으로 제시한다. 현재 판매 기능이 이미 완성되었다는 전제는 두지 않는다. [공식 roadmap](https://store.godotengine.org/roadmap/)

PSP 예시인 Stripe는 marketplace의 판매자 계정·지급 구조와 비동기 webhook을 제공한다. 국가·판매 주체·거래 구조 적합성은 계약 검토 후 확정한다. [Marketplace](https://docs.stripe.com/connect/marketplace), [Webhook](https://docs.stripe.com/webhooks)

아래 데이터·공수·성능 수치는 자체 제안이다. 결제 provider는 교체 가능하게 설계하며 실제 수수료·세율·정산 주기는 추정 숫자로 채우지 않는다.

## 3. 서비스 구성

| 모듈 | 책임 | 핵심 데이터 |
|---|---|---|
| Catalog | 에셋·버전·분류·미리보기·호환성 | Asset, AssetVersion |
| Commerce | 가격·주문·결제·환불 상태 | Offer, Order, PaymentEvent |
| Entitlement | 프로젝트/사용자 사용 권한·무료 획득 | LicenseGrant, AccessGrant |
| Ledger | 매출·수수료·환불·지급 원장 | LedgerEntry, PayoutBatch |
| Review | 검증된 사용 평가·신고·응답 | Review, ModerationCase |
| Discovery | 태그·필터·유사 기능·언어 검색 | SearchDocument, Tag |
| Creator Portal | 업로드·호환성·판매/사용 현황 | Release, Metrics |

Catalog에 보이는 버전과 사용자의 프로젝트가 잠근 버전은 분리한다. 설명 수정과 binary 교체도 다른 revision으로 기록한다. 판매 취소가 이미 생성된 사용자 프로젝트 파일을 자동 삭제하지 않도록 계약·권한 상태로 처리한다.

## 4. 제안 데이터와 상태 전이

```yaml
# 자체 제안 스토어 스키마
AssetVersion:
  asset_id: creator.asset
  version: 1.2.0
  package_digest: resolved-sha256
  license_id: versioned-license
  supported_targets: [windows, android]
  engine_range: verified-engine-range
Offer:
  offer_id: immutable-offer
  currency: currency-code
  amount_minor_units: integer
Order:
  order_id: internal-id
  offer_id: immutable-offer
  state: created_pending_paid_refunded_disputed
  payment_provider_ref: provider-reference
```

`created → pending → paid → fulfilled`와 환불·분쟁 경로를 명시한다. `paid`는 provider 서버 검증으로만 진입한다. Client의 결제 완료 화면은 사실 확인을 요청하는 신호이며 권한 지급의 증거가 아니다.

Webhook은 서명 검증·event ID 중복 제거·원장 기록 후 처리한다. 역순 이벤트는 provider의 최신 상태와 reconciliation 작업으로 정리한다. 요청 재시도에는 idempotency key를 사용한다. [PSP idempotency](https://docs.stripe.com/api/idempotent_requests)

## 5. 정산·평가·탐색 정책

정산은 복식 원장 또는 동등한 금액 보존 모델을 사용하여 gross·fee·refund·reserve·net을 분리한다. 원장 수정은 기존 행 덮어쓰기 대신 역분개·보정으로 추적한다. 통화별 합계를 합산하며 원화/달러를 환율 없이 섞지 않는다.

무료 공유와 유료 구매 모두 버전 있는 권한을 발급한다. 구매하지 않고 합법적으로 공유받은 사용도 허용 범위를 표시하고, 에셋이 판매 종료되어도 과거 사용 집계의 일관성을 유지한다. 원문 없는 재배포 권리를 임의로 부여하지 않는다.

평가는 구매 또는 검증된 사용 여부, 엔진·플랫폼·에셋 버전을 함께 기록한다. 소수 표본의 단순 평균으로 순위를 독점하지 않도록 최소 표본 표시와 신뢰도 보정을 제안한다. 점수 알고리즘은 공개 설명과 운영 변경 이력을 가진다.

초기 discovery는 카테고리·태그·기능·호환 플랫폼·라이선스·한국어/영어 동의어 기반으로 만든다. 추천 모델 도입은 실제 검색 실패와 품질 데이터가 쌓인 이후로 미룬다. 모바일은 카드·필터 drawer·고정 선택바를 사용해 좁은 사이드바를 피한다.

## 6. 작업 분해

| 작업 | 내용 | PW | 산출물 |
|---|---|---:|---|
| S22-1 | 판매 범위·계정·라이선스·상태 모델 | 3-4 | 정책 스키마, PSP 선택 gate |
| S22-2 | Catalog·creator portal·version API | 6-10 | 등록/검토/발행·버전 관리 |
| S22-3 | 주문·PSP·entitlement·환불 | 5-8 | sandbox 구매·복구 흐름 |
| S22-4 | 원장·정산·대사·운영 화면 | 5-8 | payout batch와 audit |
| S22-5 | 리뷰·분류·유사 탐색·모바일 UI | 4-7 | 탐색/신고·responsive UX |
| S22-6 | 장애·부정 사용·release 인수 | 3-5 | 테스트·runbook·단계 공개 |
| 합계 | 실거래 운영 인력·계약 대기 별도 | **26-42** | 자체 스토어 기반 |

## 7. 단계별 출시 gate

G0 무료 카탈로그: 등록·설치·권한·검색·신고. G1 PSP sandbox: 성공·실패·환불·webhook 재처리. G2 제한 제작자: 서면 계약과 실제 정산 책임 확인. G3 공개: 고객 대응·장애·분쟁·백업 복구까지 확인.

결제 장애 중에는 설치 권한을 추정하여 부여하지 않고 `처리 중` 상태와 주문 조회를 제공한다. 지급 실패는 판매 성공과 분리하고 사용자의 구매 권한을 임의로 회수하지 않는다.

## 8. 완료 기준

| 검증 | 시험 | 계획 목표 |
|---|---|---|
| 주문 중복 | 같은 요청·webhook 100회 재전송 | 결제/권한/원장 중복 0 |
| 대사 | 성공·환불·부분환불·분쟁 1,000건 sandbox | 통화별 차액 0, 미확인 거래 명시 |
| 장애 | 지급 직전 process 중단·역순 이벤트 | 재처리 후 정합성 회복, 이중 지급 0 |
| 권한 | 타 프로젝트/다른 사용자 접근 | 비허용 다운로드 0 |
| 탐색 | 10,000개 fixture, 고정 서버 사양 | 검색 p95 500 ms 이하 후보 목표 |
| 리뷰 | 중복 계정·버전 변경·신고 사례 | 조작 탐지 flag·이의 절차 재현 |
| 모바일 | 360/390/430 CSS px와 데스크톱 | 결제·다운로드·등록 핵심 경로 잘림 0 |

fixture는 시험 데이터이며 실제 등록 에셋 수·매출·검색 품질을 뜻하지 않는다. 라이선스 분쟁은 자동 분류만으로 최종 판정하지 않는다.

## 9. 위험·대안·중단 기준

적합한 PSP·정산 주체·운영 책임이 확정되지 않으면 무료 카탈로그 단계에 머문다. 판매 기능을 출시 일정 때문에 비검증 수동 계좌 흐름으로 우회하지 않는다.

자체 스토어 확장이 공식 Godot 스토어와 중복되면 패키지 metadata·공개 링크를 연계하고 결제/권한을 혼동하지 않게 한다. 사용권 변환은 해당 라이선스·운영자 합의가 있을 때만 제공한다.

## 10. 산출물·출처

산출물: API·원장 schema, marketplace·creator/admin UI, PSP adapter, webhook replayer, 권한/환불/정산 runbook, 검색·평가 검증 보고서. 실제 결제·판매·지급을 수행한 결과물은 아니다.

확인일: 2026-11-24.

- [Godot Store roadmap](https://store.godotengine.org/roadmap/)
- [Stripe marketplace](https://docs.stripe.com/connect/marketplace)
- [Stripe webhooks](https://docs.stripe.com/webhooks)
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
