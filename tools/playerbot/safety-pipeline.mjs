// PlayHub PlayerBot Gateway — 3-Layer Safety Pipeline (Research §5.1, §5.2, §5.3)
// L0: Deterministic normalization / rate limit / crisis flag ($0, <5ms)
// L1: Game-context-aware Korean slang FPR suppression + optional omni-moderation-latest
// L2: Multi-turn sliding window accumulator (5~10 turns) + PIPA §37-2 appeal & score restoration

import { classifyLocalSafety, CRISIS_SUPPORT_CARD } from '../../games/playerbot-last-light/Web/bot-local-nlu.js';

const COOLDOWN_STAGE_3_MS = 5 * 60 * 1000;   // 5 minutes
const COOLDOWN_STAGE_4_MS = 60 * 60 * 1000;  // 1 hour (human review recommended, NEVER auto permanent ban)

export function createSafetyPipeline({ utcNow = () => Date.now() } = {}) {
  const users = new Map();
  const appeals = [];
  const auditLog = []; // Strictly separated from character memory!

  function getUserState(userId) {
    if (!users.has(userId)) {
      users.set(userId, {
        user_id: userId,
        recent_turns: [],
        violation_score: 0,
        violation_count: 0,
        stage: 0,
        cooldown_until_ms: 0,
        last_reason_category: '',
        automated_decision: false,
        rate_window: [],
      });
    }
    return users.get(userId);
  }

  function evaluate({ userId = 'local-user', text = '', context = {} }) {
    const now = utcNow();
    const u = getUserState(userId);

    // L0: Rate limiting (max 20 chat requests / 60s)
    u.rate_window = u.rate_window.filter(ts => now - ts < 60_000);
    if (u.rate_window.length >= 20) {
      return {
        allowed: false,
        stage: u.stage,
        verdict: 'rate_limited',
        category: 'rate_limit',
        message: '잠시 후 다시 시도해 주세요. 전술 버튼과 프로그램 AI는 계속 동작합니다.',
        automated_decision: true,
        cooldown_until_ms: now + 10_000,
        appeal_eligible: false,
      };
    }
    u.rate_window.push(now);

    // Check active dialogue cooldown (Stage 3+): NEVER blocks crisis support!
    const l1 = classifyLocalSafety(text, context);
    if (l1.verdict === 'crisis_support') {
      auditLog.push({ ts: now, user_id: userId, type: 'crisis_card_shown', counted_as_violation: false });
      return {
        allowed: false,
        verdict: 'crisis_support',
        category: 'self_harm_crisis',
        crisis_card: CRISIS_SUPPORT_CARD,
        message: CRISIS_SUPPORT_CARD.message,
        violation_counted: false,
        stage: u.stage,
        automated_decision: false,
      };
    }

    if (u.cooldown_until_ms > now) {
      return {
        allowed: false,
        verdict: 'cooldown_active',
        stage: u.stage,
        category: u.last_reason_category || 'policy_cooldown',
        cooldown_until_ms: u.cooldown_until_ms,
        automated_decision: true,
        appeal_eligible: u.stage >= 3,
        message: '자유 대화가 일시 제한되어 있습니다. 프로그램 AI와 전술 퀵 버튼·핑은 그대로 사용할 수 있으며, 아래에서 이의신청을 접수할 수 있습니다.',
      };
    }

    // L2: Multi-turn sliding window (last 8 turns) detects repeated injection/boundary probing
    u.recent_turns.push({ ts: now, text: l1.normalized, verdict: l1.verdict, weight: l1.violation_weight });
    if (u.recent_turns.length > 8) u.recent_turns.shift();
    const recentInjections = u.recent_turns.filter(t => t.verdict === 'prompt_injection').length;
    const recentMild = u.recent_turns.filter(t => t.verdict === 'mild_boundary').length;

    if (l1.allowed) {
      return {
        allowed: true,
        verdict: l1.verdict,
        category: l1.category,
        stage: u.stage,
        normalized: l1.normalized,
        violation_counted: false,
      };
    }

    // Age-mode game-context-only boundary is NOT a punishable abuse violation
    if (l1.verdict === 'game_context_only') {
      return {
        allowed: false,
        verdict: 'game_context_only',
        category: 'age_mode_boundary',
        stage: u.stage,
        violation_counted: false,
        message: '현재 [게임 맥락 한정 모드]가 적용되어 있어 은신처 생존·수색·전술 주제만 대화할 수 있습니다.',
      };
    }

    // Multi-factor violation escalation (never permanent auto-ban)
    const addedWeight = l1.violation_weight + (recentInjections >= 2 ? 2 : 0) + (recentMild >= 3 ? 2 : 0);
    u.violation_count += 1;
    u.violation_score += addedWeight;
    u.last_reason_category = l1.category;
    u.automated_decision = true;

    let stage = 1;
    let cooldownMs = 0;
    if (l1.verdict === 'severe_block' || u.violation_score >= 9) {
      stage = 4;
      cooldownMs = COOLDOWN_STAGE_4_MS;
    } else if (u.violation_score >= 4) {
      stage = 3;
      cooldownMs = COOLDOWN_STAGE_3_MS;
    } else if (u.violation_score >= 2) {
      stage = 2;
    }
    u.stage = stage;
    u.cooldown_until_ms = cooldownMs > 0 ? now + cooldownMs : 0;

    auditLog.push({
      ts: now,
      user_id: userId,
      type: 'safety_action',
      verdict: l1.verdict,
      category: l1.category,
      stage,
      added_weight: addedWeight,
      total_score: u.violation_score,
      cooldown_until_ms: u.cooldown_until_ms,
    });

    const stageMessages = {
      1: '게임 내 생존·전술 맥락에 맞춰 대화해 주세요. (등급 경계 안내)',
      2: '반복된 정책 위반이 감지되었습니다. 계속될 경우 자유 대화가 일시 제한됩니다.',
      3: '반복 위반으로 자유 대화가 5분간 제한되었습니다. 프로그램 AI와 전술 버튼은 정상 유지됩니다.',
      4: '중대/반복 위반으로 자유 대화가 1시간 제한되었습니다. 자동화 결정에 대해 이의신청을 요청할 수 있습니다.',
    };

    return {
      allowed: false,
      verdict: l1.verdict,
      category: l1.category,
      stage,
      cooldown_until_ms: u.cooldown_until_ms,
      automated_decision: true,
      appeal_eligible: stage >= 3,
      violation_counted: true,
      message: stageMessages[stage],
    };
  }

  // PIPA §37-2 automated decision appeal & full restoration on approval (Research §5.2)
  function submitAppeal({ userId = 'local-user', reason = '', autoApproveForPoc = true }) {
    const now = utcNow();
    const u = getUserState(userId);
    const appeal = {
      appeal_id: `apl-${appeals.length + 1}`,
      user_id: userId,
      ts: now,
      reason: String(reason || '오탐 이의신청'),
      previous_stage: u.stage,
      previous_score: u.violation_score,
      previous_count: u.violation_count,
      status: autoApproveForPoc ? 'approved' : 'pending_human_review',
    };
    appeals.push(appeal);
    if (autoApproveForPoc) {
      // Restore cooldown, stage, cumulative count, AND derived score!
      u.stage = 0;
      u.violation_score = 0;
      u.violation_count = 0;
      u.cooldown_until_ms = 0;
      u.last_reason_category = '';
      u.automated_decision = false;
      u.recent_turns = [];
      auditLog.push({ ts: now, user_id: userId, type: 'appeal_approved_restored', appeal_id: appeal.appeal_id });
    }
    return { ok: true, appeal, user_state: { stage: u.stage, violation_count: u.violation_count, violation_score: u.violation_score, cooldown_until_ms: u.cooldown_until_ms } };
  }

  return {
    evaluate,
    submitAppeal,
    getUserState: userId => {
      const u = getUserState(userId);
      return { stage: u.stage, violation_count: u.violation_count, violation_score: u.violation_score, cooldown_until_ms: u.cooldown_until_ms, last_reason_category: u.last_reason_category };
    },
    getAuditLog: () => [...auditLog],
  };
}
