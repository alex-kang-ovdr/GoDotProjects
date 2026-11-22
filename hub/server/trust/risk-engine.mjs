// N5 Server-Authoritative Risk ML + PIPA Art. 37-2 PENDING_REVIEW HITL Queue.
// Invariant: High risk (>= 0.7) NEVER issues an automated permanent ban.
// It always routes to PENDING_REVIEW with Korean explainability (topFactors + explanationKo),
// 48h operator SLA, user appeal API, and explicit human operator resolution.

import { transaction } from '../db.mjs';
import { ApiError, uid } from '../security.mjs';
import { ensureTrustSchema } from './schema.mjs';

export const RISK_MODEL_VERSION = 'trust-risk-v1.0.0';
export const VALID_RISK_DOMAINS = Object.freeze(['leaderboard', 'cpa', 'billing_a', 'billing_b', 'mmo']);
export const PENDING_REVIEW_THRESHOLD = 0.7;
export const FLAG_THRESHOLD = 0.4;
export const REVIEW_SLA_MS = 48 * 60 * 60 * 1000;

const VALID_DOMAIN_SET = new Set(VALID_RISK_DOMAINS);
const DOMAIN_LABELS_KO = Object.freeze({
  leaderboard: '리더보드 안티치트',
  cpa: 'AdGame CPA 부정방지',
  billing_a: 'Track A 1P 결제 리스크',
  billing_b: 'Track B 창작자 결제·차지백 리스크',
  mmo: 'MMO DataStore 경제 이상 탐지'
});

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

function num(v, fallback = 0) {
  return Number.isFinite(Number(v)) ? Number(v) : fallback;
}

function pushFactor(factors, feature, weight, value, contribution, reasonKo) {
  const c = round4(clamp(contribution, 0, 1));
  if (c > 0) {
    factors.push({ feature, weight, value, contribution: c, reasonKo });
  }
}

function scoreLeaderboard(features) {
  const factors = [];
  const score = num(features.score, 0);
  const activeMs = Math.max(0, num(features.activeMs, 0));
  const minPlayMs = Math.max(0, num(features.minPlayMs, 0));
  const expectedMaxScorePerSec = Math.max(1, num(features.expectedMaxScorePerSec, 100));
  const scorePerSec = features.scorePerSec !== undefined
    ? num(features.scorePerSec, 0)
    : score / Math.max(activeMs / 1000, 1);

  if (scorePerSec > expectedMaxScorePerSec) {
    const ratio = scorePerSec / expectedMaxScorePerSec;
    const contrib = clamp(0.25 + Math.log10(ratio) * 0.25, 0.25, 0.50);
    pushFactor(
      factors,
      'score_velocity',
      0.50,
      round4(scorePerSec),
      contrib,
      `점수 획득 속도(${Math.round(scorePerSec)}/초)가 정상 상한(${expectedMaxScorePerSec}/초)을 초과했습니다`
    );
  }

  if (minPlayMs > 0 && activeMs < minPlayMs) {
    pushFactor(
      factors,
      'min_play_ms_violation',
      0.35,
      activeMs,
      0.35,
      `서버 검증 플레이 시간(${activeMs}ms)이 최소 기준(${minPlayMs}ms)에 미달합니다`
    );
  }

  const zScore = num(features.boardZScore, 0);
  if (zScore >= 3.5) {
    const contrib = clamp((zScore - 3.0) * 0.08, 0.15, 0.35);
    pushFactor(
      factors,
      'board_z_score',
      0.35,
      round4(zScore),
      contrib,
      `보드 평균 대비 표준편차 이탈(z=${zScore.toFixed(2)})이 매우 큽니다`
    );
  }

  if (features.heartbeatIntervalCv !== undefined && Number.isFinite(Number(features.heartbeatIntervalCv))) {
    const cv = Number(features.heartbeatIntervalCv);
    if (cv >= 0 && cv < 0.05) {
      pushFactor(
        factors,
        'macro_rhythm_uniformity',
        0.25,
        round4(cv),
        0.25,
        `입력·하트비트 주기 변동계수(CV=${cv.toFixed(4)})가 매크로/자동화 패턴과 유사합니다`
      );
    }
  }

  const recentRejects = Math.max(0, num(features.recentRejectCount, 0));
  if (recentRejects >= 2) {
    const contrib = clamp(recentRejects * 0.07, 0.10, 0.25);
    pushFactor(
      factors,
      'recent_submission_rejects',
      0.25,
      recentRejects,
      contrib,
      `최근 리더보드 제출 거절 이력이 ${recentRejects}회 누적되었습니다`
    );
  }

  return factors;
}

function scoreCpa(features) {
  const factors = [];
  const claimedPlayMs = Math.max(0, num(features.claimedPlayMs, 0));
  const serverActiveMs = Math.max(0, num(features.serverActiveMs, 0));
  const minQualifiedMs = Math.max(1000, num(features.minQualifiedMs, 10000));

  if (claimedPlayMs > 0 && (serverActiveMs < claimedPlayMs * 0.5 || serverActiveMs < minQualifiedMs * 0.5)) {
    const gapRatio = claimedPlayMs > 0 ? clamp(1 - serverActiveMs / claimedPlayMs, 0.3, 1) : 0.8;
    const contrib = clamp(0.35 + gapRatio * 0.20, 0.35, 0.55);
    pushFactor(
      factors,
      'active_ms_mismatch',
      0.55,
      { claimedPlayMs, serverActiveMs },
      contrib,
      `클라이언트 보고 플레이 시간(${claimedPlayMs}ms)과 서버 검증 active_ms(${serverActiveMs}ms)가 불일치합니다`
    );
  }

  const priorDeviceClaims = Math.max(0, num(features.priorDeviceClaims, features.priorDeviceClaim ? 1 : 0));
  if (priorDeviceClaims > 0) {
    const contrib = clamp(0.35 + (priorDeviceClaims - 1) * 0.10, 0.35, 0.50);
    pushFactor(
      factors,
      'duplicate_device_claim',
      0.50,
      priorDeviceClaims,
      contrib,
      `동일 디바이스에서 기존 CPA 클레임 이력(${priorDeviceClaims}건)이 감지되었습니다`
    );
  }

  if (features.clickToClaimMs !== undefined && Number.isFinite(Number(features.clickToClaimMs))) {
    const dt = Number(features.clickToClaimMs);
    if (dt >= 0 && dt < 3000) {
      pushFactor(
        factors,
        'click_to_claim_velocity',
        0.25,
        dt,
        0.25,
        `광고 클릭 후 클레임 소요 시간(${dt}ms)이 정상 플레이 범위를 벗어납니다`
      );
    }
  }

  const subnetBurstCount = Math.max(0, num(features.subnetBurstCount, 0));
  if (subnetBurstCount >= 5) {
    pushFactor(
      factors,
      'ip_subnet_burst',
      0.25,
      subnetBurstCount,
      clamp(subnetBurstCount * 0.03, 0.15, 0.25),
      `동일 네트워크 대역에서 단시간 대량 CPA 요청(${subnetBurstCount}건)이 발생했습니다`
    );
  }

  if (features.inputEntropy !== undefined && Number.isFinite(Number(features.inputEntropy))) {
    const ent = Number(features.inputEntropy);
    if (ent < 0.25) {
      pushFactor(
        factors,
        'low_input_entropy',
        0.20,
        round4(ent),
        0.20,
        `데모 플레이 입력 엔트로피(${ent.toFixed(2)})가 비정상적으로 낮습니다`
      );
    }
  }

  return factors;
}

function scoreBillingA(features) {
  const factors = [];
  const ordersPerHour = Math.max(0, num(features.ordersPerHour, 0));
  if (ordersPerHour >= 5) {
    pushFactor(
      factors,
      'order_velocity_1h',
      0.35,
      ordersPerHour,
      clamp(0.15 + (ordersPerHour - 4) * 0.05, 0.15, 0.35),
      `최근 1시간 결제 주문 빈도(${ordersPerHour}건)가 급증했습니다`
    );
  }

  const failedIntents = Math.max(0, num(features.failedIntentsCount, 0));
  if (failedIntents >= 3) {
    pushFactor(
      factors,
      'failed_payment_intents',
      0.30,
      failedIntents,
      clamp(0.15 + (failedIntents - 2) * 0.05, 0.15, 0.30),
      `연속 결제 실패(${failedIntents}회)가 감지되었습니다`
    );
  }

  const giftcardPinFailures = Math.max(0, num(features.giftcardPinFailures, 0));
  if (giftcardPinFailures >= 3) {
    pushFactor(
      factors,
      'giftcard_pin_bruteforce',
      0.35,
      giftcardPinFailures,
      clamp(0.20 + (giftcardPinFailures - 2) * 0.05, 0.20, 0.35),
      `기프트카드 PIN 입력 연속 실패(${giftcardPinFailures}회)가 감지되었습니다`
    );
  }

  const linkedChargebacks = Math.max(0, num(features.linkedChargebackCount, 0));
  if (linkedChargebacks >= 1) {
    pushFactor(
      factors,
      'device_ip_chargeback_graph',
      0.45,
      linkedChargebacks,
      clamp(0.35 + (linkedChargebacks - 1) * 0.10, 0.35, 0.45),
      `동일 디바이스/IP와 연결된 과거 차지백 이력(${linkedChargebacks}건)이 확인되었습니다`
    );
  }

  const accountAgeHours = features.accountAgeHours !== undefined ? num(features.accountAgeHours, 999) : 999;
  const amountMinor = Math.max(0, num(features.amountMinor, 0));
  if (accountAgeHours < 24 && amountMinor >= 100000) {
    pushFactor(
      factors,
      'new_account_high_amount',
      0.25,
      { accountAgeHours, amountMinor },
      0.25,
      `신규 생성 계정(${accountAgeHours}시간)에서 단시간 고액 결제(${amountMinor})가 시도되었습니다`
    );
  }

  return factors;
}

function scoreBillingB(features) {
  const factors = [];
  const paidOrders30d = Math.max(0, num(features.paidOrders30d, 0));
  const chargebacks30d = Math.max(0, num(features.chargebacks30d, 0));
  const chargebackRate30d = features.chargebackRate30d !== undefined
    ? num(features.chargebackRate30d, 0)
    : (paidOrders30d > 0 ? chargebacks30d / paidOrders30d : 0);

  // Stripe Connect 0.75% chargeback rate monitoring threshold
  if (chargebackRate30d > 0.0075) {
    const pct = (chargebackRate30d * 100).toFixed(2);
    const contrib = chargebackRate30d >= 0.015
      ? 0.75
      : clamp(0.55 + ((chargebackRate30d - 0.0075) / 0.0075) * 0.20, 0.55, 0.75);
    pushFactor(
      factors,
      'stripe_connect_chargeback_rate_30d',
      0.75,
      round4(chargebackRate30d),
      contrib,
      `최근 30일 차지백 비율(${pct}%)이 Stripe Connect 임계치(0.75%)를 초과했습니다`
    );
  }

  const refundRate30d = num(features.refundRate30d, 0);
  if (refundRate30d > 0.10) {
    pushFactor(
      factors,
      'refund_spike_30d',
      0.25,
      round4(refundRate30d),
      clamp(0.15 + (refundRate30d - 0.10) * 0.5, 0.15, 0.25),
      `최근 30일 환불 비율(${(refundRate30d * 100).toFixed(1)}%)이 급등했습니다`
    );
  }

  const washPurchaseRatio = num(features.washPurchaseRatio, 0);
  if (washPurchaseRatio > 0.20) {
    pushFactor(
      factors,
      'wash_purchase_pattern',
      0.40,
      round4(washPurchaseRatio),
      clamp(0.25 + (washPurchaseRatio - 0.20) * 0.4, 0.25, 0.40),
      `창작자 자전거래(Wash-Purchase) 의심 거래 비중(${(washPurchaseRatio * 100).toFixed(1)}%)이 높습니다`
    );
  }

  const volumeMultiplier = num(features.suddenVolumeMultiplier, 1);
  if (volumeMultiplier >= 5) {
    pushFactor(
      factors,
      'sudden_volume_spike',
      0.20,
      round4(volumeMultiplier),
      0.20,
      `단기간 결제 거래량이 평소 대비 ${volumeMultiplier.toFixed(1)}배 급증했습니다`
    );
  }

  return factors;
}

function scoreMmo(features) {
  const factors = [];
  const currencyDeltaMultiplier = num(features.currencyDeltaMultiplier, 1);
  if (currencyDeltaMultiplier >= 10) {
    pushFactor(
      factors,
      'datastore_currency_spike',
      0.50,
      round4(currencyDeltaMultiplier),
      clamp(0.35 + Math.log10(currencyDeltaMultiplier / 10) * 0.20, 0.35, 0.50),
      `DataStore 연속 리비전 간 재화·아이템 수량이 ${currencyDeltaMultiplier}배 급증했습니다`
    );
  }

  const staleFencingCount = Math.max(0, num(features.staleFencingCount, 0));
  if (staleFencingCount >= 5) {
    pushFactor(
      factors,
      'fencing_token_conflict_burst',
      0.35,
      staleFencingCount,
      clamp(0.20 + (staleFencingCount - 4) * 0.04, 0.20, 0.35),
      `펜싱 토큰/리비전 충돌(409/412)이 비정상적으로 반복(${staleFencingCount}회)되었습니다`
    );
  }

  const eventRatePerSec = num(features.eventRatePerSec, 0);
  if (eventRatePerSec > 60) {
    pushFactor(
      factors,
      'mmo_event_flood',
      0.30,
      round4(eventRatePerSec),
      clamp(0.20 + (eventRatePerSec - 60) * 0.002, 0.20, 0.30),
      `초당 멀티플레이 이벤트 송신량(${Math.round(eventRatePerSec)}/초)이 임계치를 초과했습니다`
    );
  }

  return factors;
}

function buildKoreanExplanation({ domain, riskScore, decision, topFactors }) {
  const domainLabel = DOMAIN_LABELS_KO[domain] || domain;
  const scorePct = (riskScore * 100).toFixed(1);
  const reasons = topFactors.length
    ? topFactors.slice(0, 3).map(f => f.reasonKo).join('; ')
    : '특이 이상 요인이 감지되지 않았습니다';

  if (decision === 'PENDING_REVIEW') {
    return `[${domainLabel}] 위험도 ${scorePct}점 — 주요 요인: ${reasons}. 개인정보보호법 제37조의2에 따라 자동 영구정지 없이 운영자 검토(PENDING_REVIEW) 큐로 격리되었으며, 설명 확인 및 이의신청이 가능합니다.`;
  }
  if (decision === 'FLAG') {
    return `[${domainLabel}] 위험도 ${scorePct}점(모니터링 주의) — 주요 요인: ${reasons}. 서비스 제한 없이 추가 모니터링 대상으로 기록되었습니다.`;
  }
  return `[${domainLabel}] 위험도 ${scorePct}점(정상) — ${reasons}.`;
}

export function evaluateRisk(
  db,
  {
    domain,
    entityType,
    entityId,
    principalId = null,
    features = {},
    targetRef = null,
    now = Date.now
  }
) {
  ensureTrustSchema(db);
  if (!VALID_DOMAIN_SET.has(domain)) {
    throw new ApiError(422, 'RISK_DOMAIN_INVALID', `지원하지 않는 리스크 도메인입니다: ${domain}`);
  }
  if (typeof entityType !== 'string' || !entityType.trim() || typeof entityId !== 'string' || !entityId.trim()) {
    throw new ApiError(422, 'RISK_ENTITY_INVALID', 'entityType과 entityId가 필요합니다.');
  }

  const safeFeatures = features && typeof features === 'object' && !Array.isArray(features) ? features : {};
  let factors = [];
  if (domain === 'leaderboard') factors = scoreLeaderboard(safeFeatures);
  else if (domain === 'cpa') factors = scoreCpa(safeFeatures);
  else if (domain === 'billing_a') factors = scoreBillingA(safeFeatures);
  else if (domain === 'billing_b') factors = scoreBillingB(safeFeatures);
  else if (domain === 'mmo') factors = scoreMmo(safeFeatures);

  factors.sort((a, b) => b.contribution - a.contribution);
  const topFactors = factors.slice(0, 5);
  const rawScore = factors.reduce((sum, f) => sum + f.contribution, 0);
  const riskScore = round4(clamp(rawScore, 0, 1));

  // PIPA Art. 37-2 hard invariant: NEVER auto-ban!
  let decision = 'ALLOW';
  if (riskScore >= PENDING_REVIEW_THRESHOLD) decision = 'PENDING_REVIEW';
  else if (riskScore >= FLAG_THRESHOLD) decision = 'FLAG';

  const explanationKo = buildKoreanExplanation({ domain, riskScore, decision, topFactors });
  const stamp = typeof now === 'function' ? now() : Number(now) || Date.now();
  const assessmentId = uid();
  let reviewId = null;
  let slaDueAt = null;

  transaction(db, () => {
    db.prepare(`
      INSERT INTO risk_assessments(
        id, domain, entity_type, entity_id, principal_id, model_version,
        risk_score, decision, top_factors_json, feature_snapshot_json, created_at
      ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assessmentId,
      domain,
      entityType.trim(),
      entityId.trim(),
      principalId || null,
      RISK_MODEL_VERSION,
      riskScore,
      decision,
      JSON.stringify(topFactors),
      JSON.stringify(safeFeatures),
      stamp
    );

    if (decision === 'PENDING_REVIEW') {
      reviewId = uid();
      slaDueAt = stamp + REVIEW_SLA_MS;
      const ref = targetRef ? String(targetRef).slice(0, 256) : `${entityType.trim()}:${entityId.trim()}`;
      db.prepare(`
        INSERT INTO risk_review_queue(
          id, assessment_id, domain, principal_id, target_ref, status,
          assigned_to, resolution_note, explanation_ko, user_appeal_text,
          sla_due_at, resolved_at, created_at
        ) VALUES(?, ?, ?, ?, ?, 'PENDING_REVIEW', NULL, NULL, ?, NULL, ?, NULL, ?)
      `).run(
        reviewId,
        assessmentId,
        domain,
        principalId || null,
        ref,
        explanationKo,
        slaDueAt,
        stamp
      );
    }
  });

  return {
    assessmentId,
    reviewId,
    domain,
    entityType: entityType.trim(),
    entityId: entityId.trim(),
    principalId: principalId || null,
    modelVersion: RISK_MODEL_VERSION,
    riskScore,
    decision,
    autoBanned: false,
    topFactors,
    explanationKo,
    slaDueAt: slaDueAt ? new Date(slaDueAt).toISOString() : null,
    createdAt: new Date(stamp).toISOString()
  };
}

function mapReviewRow(row) {
  let topFactors = [];
  try { topFactors = JSON.parse(row.top_factors_json || '[]'); } catch {}
  return {
    id: row.id,
    assessmentId: row.assessment_id,
    domain: row.domain,
    principalId: row.principal_id || null,
    targetRef: row.target_ref,
    status: row.status,
    assignedTo: row.assigned_to || null,
    resolutionNote: row.resolution_note || null,
    explanationKo: row.explanation_ko,
    userAppealText: row.user_appeal_text || null,
    riskScore: row.risk_score ?? null,
    modelVersion: row.model_version || RISK_MODEL_VERSION,
    topFactors,
    slaDueAt: row.sla_due_at ? new Date(row.sla_due_at).toISOString() : null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null
  };
}

export function listUserRiskReviews(db, principalId) {
  ensureTrustSchema(db);
  if (!principalId) throw new ApiError(401, 'SESSION_REQUIRED');
  const rows = db.prepare(`
    SELECT q.*, a.risk_score, a.model_version, a.top_factors_json
    FROM risk_review_queue q
    LEFT JOIN risk_assessments a ON a.id = q.assessment_id
    WHERE q.principal_id = ?
    ORDER BY q.created_at DESC
    LIMIT 100
  `).all(principalId);
  return rows.map(mapReviewRow);
}

export function listAdminRiskReviews(db, { status = null, domain = null, limit = 50 } = {}) {
  ensureTrustSchema(db);
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const clauses = [];
  const params = [];
  if (status) {
    if (!['PENDING_REVIEW', 'APPEALED', 'APPROVED', 'CONFIRMED_FRAUD'].includes(status)) {
      throw new ApiError(422, 'REVIEW_STATUS_INVALID');
    }
    clauses.push('q.status = ?');
    params.push(status);
  }
  if (domain) {
    if (!VALID_DOMAIN_SET.has(domain)) {
      throw new ApiError(422, 'RISK_DOMAIN_INVALID');
    }
    clauses.push('q.domain = ?');
    params.push(domain);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT q.*, a.risk_score, a.model_version, a.top_factors_json
    FROM risk_review_queue q
    LEFT JOIN risk_assessments a ON a.id = q.assessment_id
    ${where}
    ORDER BY q.sla_due_at ASC, q.created_at DESC
    LIMIT ?
  `).all(...params, safeLimit);
  return rows.map(mapReviewRow);
}

export function submitAppeal(db, { reviewId, principalId, appealText, now = Date.now }) {
  ensureTrustSchema(db);
  if (!principalId) throw new ApiError(401, 'SESSION_REQUIRED');
  if (typeof appealText !== 'string' || !appealText.trim() || appealText.trim().length > 2000) {
    throw new ApiError(422, 'APPEAL_TEXT_INVALID', '이의신청 사유를 1~2000자 이내로 입력해 주세요.');
  }
  const row = db.prepare('SELECT * FROM risk_review_queue WHERE id=?').get(reviewId);
  if (!row) throw new ApiError(404, 'REVIEW_NOT_FOUND');
  if (row.principal_id !== principalId) throw new ApiError(403, 'FORBIDDEN');
  if (row.status === 'APPROVED' || row.status === 'CONFIRMED_FRAUD') {
    throw new ApiError(409, 'REVIEW_ALREADY_RESOLVED', '이미 검토가 완료된 건입니다.');
  }
  const cleanText = appealText.trim();
  db.prepare("UPDATE risk_review_queue SET user_appeal_text = ?, status = 'APPEALED' WHERE id = ?")
    .run(cleanText, reviewId);
  const updated = db.prepare(`
    SELECT q.*, a.risk_score, a.model_version, a.top_factors_json
    FROM risk_review_queue q
    LEFT JOIN risk_assessments a ON a.id = q.assessment_id
    WHERE q.id = ?
  `).get(reviewId);
  return mapReviewRow(updated);
}

export function resolveReview(db, { reviewId, adminUser, resolution, note = '', now = Date.now }) {
  ensureTrustSchema(db);
  if (!['APPROVED', 'CONFIRMED_FRAUD'].includes(resolution)) {
    throw new ApiError(422, 'RESOLUTION_INVALID', 'resolution은 APPROVED 또는 CONFIRMED_FRAUD여야 합니다.');
  }
  const row = db.prepare('SELECT * FROM risk_review_queue WHERE id=?').get(reviewId);
  if (!row) throw new ApiError(404, 'REVIEW_NOT_FOUND');
  if (row.status === 'APPROVED' || row.status === 'CONFIRMED_FRAUD') {
    throw new ApiError(409, 'REVIEW_ALREADY_RESOLVED', '이미 처리 완료된 검토 건입니다.');
  }
  const stamp = typeof now === 'function' ? now() : Number(now) || Date.now();
  const safeAdmin = typeof adminUser === 'string' && adminUser.trim() ? adminUser.trim().slice(0, 128) : 'admin';
  const safeNote = typeof note === 'string' ? note.trim().slice(0, 2000) : '';

  db.prepare(`
    UPDATE risk_review_queue
    SET status = ?, assigned_to = ?, resolution_note = ?, resolved_at = ?
    WHERE id = ?
  `).run(resolution, safeAdmin, safeNote, stamp, reviewId);

  const updated = db.prepare(`
    SELECT q.*, a.risk_score, a.model_version, a.top_factors_json
    FROM risk_review_queue q
    LEFT JOIN risk_assessments a ON a.id = q.assessment_id
    WHERE q.id = ?
  `).get(reviewId);
  return mapReviewRow(updated);
}
