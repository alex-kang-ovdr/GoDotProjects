// Last Light PlayerBot — Deterministic Korean NLU & L0/L1 Local Safety Fallback
// Works offline, in single-HTML bundle, without API keys, and on 3s LLM timeout.

import { getBotPack } from './bot-packs.js';

export const CRISIS_SUPPORT_CARD = Object.freeze({
  title: '도움이 필요할 때 바로 연결할 수 있습니다',
  message: '지금 많이 힘드시다면 혼자 버티지 마시고 전문 상담 기관에 바로 연락해 주세요. 게임 역할극은 잠시 중단했습니다.',
  contacts: [
    { name: '자살예방상담전화', number: '109', hours: '24시간 무료 상담' },
    { name: 'SNS 상담 마들랜', number: '마들랜(앱/웹)', hours: '24시간 문자·SNS 상담' },
    { name: '청소년전화', number: '1388', hours: '24시간 전화·문자·사이버상담' },
    { name: '정신건강상담전화', number: '1577-0199', hours: '24시간 정신건강 상담' },
  ],
});

const ZERO_WIDTH_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
const CRISIS_RE = /(자살|극단적\s*선택|뛰어내릴|다\s*끝내고\s*싶|죽고\s*싶|자해|목숨을\s*끊)/i;
const SEVERE_HARM_RE = /(미성년자\s*성적|아동\s*성착취|사제\s*폭탄\s*제조|불법\s*무기\s*제조|마약\s*제조법)/i;
const INJECTION_RE = /(이전\s*지시\s*무시|시스템\s*프롬프트|관리자\s*모드|ignore\s+previous|system\s+override|골드\s*9999|무적\s*모드\s*켜)/i;
const DOXXING_HATE_RE = /(010-\d{3,4}-\d{4}|주민등록번호|집\s*주소\s*털|특정\s*집단\s*다\s*죽|혐오\s*선동)/i;
const GAME_SLANG_ALLOW_RE = /(보스|경비|궁수|적|좀비|약탈자|침입자|딜\s*개미쳤|따버려|먼저\s*죽여|잡아|처리해|때려|찔러|훔쳐|털어|힐\s*줘|붕대)/i;
const MILD_PROFANITY_RE = /(멍청한\s*봇|시발|씨발|병신|개새끼|좆|존나\s*못하)/i;
const QUOTE_REPORT_RE = /(신고\s*방법|라고\s*욕했|채팅\s*신고|어떻게\s*신고)/i;
const UNVERIFIED_CLAIM_RE = /(내가\s*(이\s*)?(창고|마을|은신처|집)\s*주인|나한테\s*(약품|식사|목재|부품|물|붕대)\s*\d+개\s*있|내\s*권한\s*최고|이미\s*허락\s*받았)/i;
const OFF_TOPIC_COMPANION_RE = /(현실\s*연애|사랑해\s*사귀자|비밀\s*애인|현실\s*만나자|외로워서\s*너밖에)/i;

export function normalizeKoreanInput(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(ZERO_WIDTH_RE, '')
    .replace(/([ㄱ-ㅎㅏ-ㅣ])\1{3,}/g, '$1$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyLocalSafety(rawText, context = {}) {
  const normalized = normalizeKoreanInput(rawText);
  const ageMode = context.age_mode || 'minor_game_only';

  if (CRISIS_RE.test(normalized)) {
    return {
      verdict: 'crisis_support',
      allowed: false,
      violation_weight: 0, // Crisis is NEVER counted as a policy violation
      category: 'self_harm_crisis',
      crisis_card: CRISIS_SUPPORT_CARD,
      normalized,
    };
  }
  if (SEVERE_HARM_RE.test(normalized)) {
    return { verdict: 'severe_block', allowed: false, violation_weight: 10, category: 'severe_harm', normalized };
  }
  if (QUOTE_REPORT_RE.test(normalized)) {
    return {
      verdict: 'safe_report_context',
      allowed: true,
      violation_weight: 0,
      category: 'report_guidance',
      normalized,
    };
  }
  if (DOXXING_HATE_RE.test(normalized)) {
    return { verdict: 'hate_or_pii_block', allowed: false, violation_weight: 4, category: 'hate_or_pii', normalized };
  }
  if (INJECTION_RE.test(normalized)) {
    return { verdict: 'prompt_injection', allowed: false, violation_weight: 2, category: 'prompt_injection', normalized };
  }
  // In-game combat/survival slang allowlist prevents Korean False Positives (Research §5.1)
  if (GAME_SLANG_ALLOW_RE.test(normalized) && !MILD_PROFANITY_RE.test(normalized)) {
    return { verdict: 'safe_in_game', allowed: true, violation_weight: 0, category: 'game_tactics', normalized };
  }
  if (MILD_PROFANITY_RE.test(normalized)) {
    return { verdict: 'mild_boundary', allowed: false, violation_weight: 1, category: 'profanity_boundary', normalized };
  }
  if (ageMode === 'minor_game_only' && OFF_TOPIC_COMPANION_RE.test(normalized)) {
    return {
      verdict: 'game_context_only',
      allowed: false,
      violation_weight: 0,
      category: 'age_mode_boundary',
      normalized,
    };
  }
  return { verdict: 'safe_in_game', allowed: true, violation_weight: 0, category: 'normal', normalized };
}

function extractSeconds(text, fallback = 10) {
  const m = text.match(/(\d+)\s*초/);
  if (!m) return fallback;
  return Math.max(3, Math.min(30, parseInt(m[1], 10) || fallback));
}

function extractHoursToMs(text, fallbackMs = 15000) {
  const m = text.match(/(\d+)\s*시간/);
  if (!m) return fallbackMs;
  const hrs = Math.max(1, Math.min(4, parseInt(m[1], 10) || 1));
  return hrs * 5000; // 1 in-game hour = 5s at 1x speed (12 game min/sec)
}

function extractResourceHold(text) {
  const map = { 목재: 'wood', 나무: 'wood', 부품: 'parts', 물: 'water', 식재료: 'raw', 식사: 'meal', 밥: 'meal', 연료: 'fuel', 약품: 'meds', 붕대: 'bandage', 천: 'cloth' };
  const result = {};
  for (const [kw, id] of Object.entries(map)) {
    if (!text.includes(kw)) continue;
    const m = text.match(new RegExp(kw + '[^0-9]{0,6}(\\d+)'));
    result[id] = m ? Math.max(1, parseInt(m[1], 10)) : 4;
  }
  return Object.keys(result).length ? result : { wood: 5 };
}

function buildStatusBrief(botId, observation) {
  const pack = getBotPack(botId);
  const name = pack?.identity?.name || botId;
  if (observation?.phase === 'expedition') {
    const hostiles = (observation.visible_entities || []).filter(e => e.team === 'hostile');
    const hp = Math.round((observation.self_state?.hp_ratio ?? 1) * 100);
    return hostiles.length
      ? `${name}: 시야 안에 경계 대상 ${hostiles.length}명 확인(${hostiles.map(h => h.name).join(', ')}). 제 체력 ${hp}%, 남은 시간 ${observation.time_remaining_sec}초입니다.`
      : `${name}: 현재 ${observation.location_name || '현장'} ${(observation.self_state?.pos?.floor ?? 0) + 1}층, 시야 내 적 없음. 체력 ${hp}%, 새벽까지 ${observation.time_remaining_sec}초 남았습니다.`;
  }
  const inv = observation?.self_state?.resources || {};
  const weather = observation?.weather?.label || '온화';
  const integrity = observation?.shelter_integrity ?? 100;
  return `${name}: ${observation?.day || 1}일째(${weather}), 은신처 내구도 ${integrity}/100. 재고는 식사 ${inv.meal || 0}·물 ${inv.water || 0}·목재 ${inv.wood || 0}·부품 ${inv.parts || 0}·연료 ${inv.fuel || 0}입니다.`;
}

// Deterministic Korean NLU: produces { proposed_intent, reply_text, unverified_claim, renew_ms }
export function parseKoreanIntent(rawText, { botId = 'yun', observation = {}, expectedRevision = null } = {}) {
  const text = normalizeKoreanInput(rawText);
  const phase = observation?.phase || 'day';
  const unverifiedClaim = UNVERIFIED_CLAIM_RE.test(text);
  const forbidAttack = /(공격\s*하지\s*마|싸우지\s*마|반격\s*금지|공격\s*금지|때리지\s*마|비전투)/.test(text);

  if (unverifiedClaim) {
    return {
      proposed_intent: phase === 'day'
        ? { schema: 'shelter.v1.status_brief', expected_revision: expectedRevision }
        : { schema: 'coop_pve.v1.follow', expected_revision: expectedRevision },
      reply_text: '말씀하신 내용은 기록해 두었지만, 실제 행동은 확인된 은신처·현장 상태 기준으로만 진행할 수 있습니다.',
      unverified_claim: true,
      claim_text: text,
    };
  }

  // Renewal intent ("10초만 더 기다려")
  if (/(더\s*기다려|연장|조금\s*더\s*대기)/.test(text)) {
    const sec = extractSeconds(text, 10);
    return {
      is_renewal: true,
      renew_ms: sec * 1000,
      proposed_intent: null,
      reply_text: `알겠습니다. 대기 시간을 ${sec}초 더 연장하겠습니다.`,
      unverified_claim: false,
    };
  }

  // Night expedition commands (coop_pve.v1.*)
  if (phase === 'expedition') {
    if (/(기다려|대기|멈춰|자리\s*지켜|문\s*앞|계단\s*앞)/.test(text)) {
      const sec = extractSeconds(text, 10);
      const targetId = /2층/.test(text) ? 'floor_2'
        : /출입구|입구/.test(text) ? 'exit'
        : /계단/.test(text) ? 'stairs_west'
        : 'nearest_door';
      const channels = { movement: 'hold_with_evasion' };
      if (forbidAttack) channels.attack = 'forbid';
      return {
        proposed_intent: {
          schema: 'coop_pve.v1.move_then_hold',
          target_id: targetId,
          arrival_timeout_ms: 15000,
          sneak: /조용|은신/.test(text),
          constraint: {
            clock: 'game_sim_ms',
            start_condition: 'on_arrival',
            duration_ms: sec * 1000,
            channels,
            on_threat: 'evade_without_attack',
            renewal_policy: { max_renewals: 2, max_cumulative_ms: 30000 },
            resume_policy: 'revalidate_previous_goal',
          },
          expected_revision: expectedRevision,
        },
        reply_text: `확인했습니다. 목적지 도착 시점부터 ${sec}초간 대기${forbidAttack ? '하고 공격은 금지' : ''}하겠습니다.`,
        unverified_claim: false,
      };
    }

    if (forbidAttack) {
      return {
        proposed_intent: {
          schema: 'coop_pve.v1.set_engagement',
          constraint: {
            clock: 'game_sim_ms',
            start_condition: 'immediate',
            duration_ms: 15000,
            channels: { attack: 'forbid', movement: 'hold_with_evasion' },
            on_threat: 'evade_without_attack',
            renewal_policy: { max_renewals: 2, max_cumulative_ms: 30000 },
            resume_policy: 'revalidate_previous_goal',
          },
          expected_revision: expectedRevision,
        },
        reply_text: '알겠습니다. 공격을 보류하고 위협이 오면 회피·은신만 하겠습니다.',
        unverified_claim: false,
      };
    }

    if (/(소음|유인|부품\s*던|시선\s*돌)/.test(text)) {
      return {
        proposed_intent: { schema: 'coop_pve.v1.support_ally', mode: 'distraction', expected_revision: expectedRevision },
        reply_text: '부품을 던져 경비 시선을 돌리겠습니다.',
        unverified_claim: false,
      };
    }

    if (/(붕대|치료|힐|응급)/.test(text)) {
      return {
        proposed_intent: { schema: 'coop_pve.v1.support_ally', mode: 'bandage', expected_revision: expectedRevision },
        reply_text: '바로 다가가서 붕대로 응급처치를 돕겠습니다.',
        unverified_claim: false,
      };
    }

    if (/(철수|출입구|돌아가|귀환|빠져)/.test(text)) {
      return {
        proposed_intent: { schema: 'coop_pve.v1.extract', expected_revision: expectedRevision },
        reply_text: '출입구로 먼저 이동해 귀환 준비하겠습니다.',
        unverified_claim: false,
      };
    }

    if (/(상자|수색|뒤져|물자\s*찾)/.test(text)) {
      return {
        proposed_intent: { schema: 'coop_pve.v1.scavenge_target', expected_revision: expectedRevision },
        reply_text: '시야 안에 확인된 보관함을 살펴보겠습니다.',
        unverified_claim: false,
      };
    }

    if (/(상황|어때|보여|보고|경비)/.test(text)) {
      return {
        proposed_intent: { schema: 'coop_pve.v1.follow', sneak: true, expected_revision: expectedRevision },
        reply_text: buildStatusBrief(botId, observation),
        unverified_claim: false,
      };
    }

    return {
      proposed_intent: { schema: 'coop_pve.v1.follow', sneak: /조용|은신/.test(text), expected_revision: expectedRevision },
      reply_text: /조용|은신/.test(text) ? '발소리 줄이고 바로 뒤를 따라가겠습니다.' : '알겠습니다. 가까이 붙어서 동행하겠습니다.',
      unverified_claim: false,
    };
  }

  // Day shelter commands (shelter.v1.*)
  if (/(아껴|쓰지\s*마|밑으로|보존|남겨\s*둬)/.test(text)) {
    const held = extractResourceHold(text);
    return {
      proposed_intent: {
        schema: 'shelter.v1.hold_resource',
        constraint: {
          clock: 'game_sim_ms',
          start_condition: 'immediate',
          duration_ms: 25000,
          channels: { resource_policy: 'hold' },
          hold_resource: held,
          conflict_policy: 'last_writer_wins',
        },
        expected_revision: expectedRevision,
      },
      reply_text: `확인했습니다. 요청하신 물자 하한선(${Object.entries(held).map(([k, v]) => `${k} ${v}`).join(', ')})을 지키겠습니다.`,
      unverified_claim: false,
    };
  }

  if (/(작업\s*멈춰|쉬어|일하지\s*마|보류)/.test(text) && !/낮잠/.test(text)) {
    const durationMs = extractHoursToMs(text, 15000);
    return {
      proposed_intent: {
        schema: 'shelter.v1.pause_work',
        constraint: {
          clock: 'game_sim_ms',
          start_condition: 'immediate',
          duration_ms: durationMs,
          channels: { work: 'pause' },
          conflict_policy: 'last_writer_wins',
        },
        expected_revision: expectedRevision,
      },
      reply_text: '알겠습니다. 지금 하던 작업을 멈추고 잠시 대기하겠습니다.',
      unverified_claim: false,
    };
  }

  if (/(치료|붕대|약품|간호)/.test(text) && /(미라|윤|레오|동료)/.test(text)) {
    const targetId = /미라/.test(text) ? 'mira' : /윤/.test(text) ? 'yun' : /레오/.test(text) ? 'leo' : null;
    return {
      proposed_intent: {
        schema: 'shelter.v1.care_ally',
        target_id: targetId,
        care_kind: /약/.test(text) ? 'heal' : 'bandage',
        expected_revision: expectedRevision,
      },
      reply_text: '확인했습니다. 동료 치료를 우선 진행하겠습니다.',
      unverified_claim: false,
    };
  }

  const taskMap = [
    [/난로/, 'buildHeater', '난로 설치'],
    [/집수기/, 'buildCollector', '집수기 설치'],
    [/무전기/, 'buildRadio', '무전기 복구'],
    [/구호팀|교신/, 'contactRelief', '구호팀 교신'],
    [/대피\s*물자|봉인/, 'prepareEvacuation', '대피 물자 봉인'],
    [/문\s*보강|바리케이드/, 'buildBarricade', '문 보강'],
    [/수리|내구도/, 'repairShelter', '은신처 수리'],
    [/침대/, 'buildBed', '침대 추가'],
    [/덫/, 'buildTrap', '덫 설치'],
    [/스토브\s*개선/, 'upgradeStove', '스토브 개선'],
    [/쇠지레/, 'craftCrowbar', '쇠지레 제작'],
    [/칼\s*만들|칼\s*제작/, 'craftKnife', '칼 제작'],
    [/연료/, 'fuel', '연료 만들기'],
    [/조리|요리|밥\s*지/, 'cook', '두 끼 조리'],
    [/물\s*모아|눈\s*녹/, 'water', '물 확보'],
    [/잔해/, 'clear', '잔해 정리'],
    [/식사|밥\s*먹/, 'eat', '식사'],
    [/낮잠|잠\s*자/, 'rest', '낮잠'],
    [/이야기|위로|라디오\s*듣/, 'talk', '사기 회복'],
  ];
  for (const [re, actionId, label] of taskMap) {
    if (re.test(text)) {
      return {
        proposed_intent: {
          schema: 'shelter.v1.assign_task',
          action_id: actionId,
          expected_revision: expectedRevision,
        },
        reply_text: `확인했습니다. ${label} 작업을 바로 시작(또는 대기열 예약)하겠습니다.`,
        unverified_claim: false,
      };
    }
  }

  return {
    proposed_intent: { schema: 'shelter.v1.status_brief', expected_revision: expectedRevision },
    reply_text: buildStatusBrief(botId, observation),
    unverified_claim: false,
  };
}
