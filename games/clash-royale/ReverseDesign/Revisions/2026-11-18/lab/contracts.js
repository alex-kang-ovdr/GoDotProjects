/* Pure reference contracts for the reconstruction lab, not the original game. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RoyaleContracts = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = '1.0.0';
  var CYCLE_SOURCES = ['COMBAT_SRC_02', 'COMBAT_SRC_07', 'COMBAT_SRC_19'];
  var CLOCK_SOURCES = ['COMBAT_SRC_01', 'COMBAT_SRC_08'];
  var SCHEDULE = Object.freeze([
    Object.freeze({ from: 0, to: 120, multiplier: 1 }),
    Object.freeze({ from: 120, to: 240, multiplier: 2 }),
    Object.freeze({ from: 240, to: 300, multiplier: 3 })
  ]);

  function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
  function nonnegative(value) { return finite(value) && value >= 0; }
  function meta(kind, sources, assumptions) {
    return {
      contractVersion: VERSION,
      evidenceStatus: kind || 'reproduction_design',
      originalClientObserved: false,
      sourceIds: (sources || []).slice(),
      assumptions: (assumptions || []).slice()
    };
  }
  function success(value, context) { return Object.assign({ ok: true, blocked: false }, context || meta(), value); }
  function invalid(code, message, fields, context) {
    return Object.assign({ ok: false, blocked: false, error: { code: code, message: message, fields: fields || [] } }, context || meta());
  }
  function blocked(code, message, fields, context) {
    return Object.assign({ ok: false, blocked: true, reason: message, missingFields: fields || [],
      error: { code: code, message: message, fields: fields || [] } }, context || meta());
  }
  function cycleMeta() {
    return meta('reproduction_design', CYCLE_SOURCES, [
      '8장 덱·4장 손패의 명시적 재현 큐. 4장 손패의 공식 근거 보강은 별도 과제다.',
      '입력 덱 순서를 초기 순서로 사용한다. 원작 셔플·첫 손패 제외 규칙은 구현하지 않는다.',
      'Champion도 일반 순환을 사용하며 생존 여부·능력 버튼은 이 큐를 바꾸지 않는다.'
    ]);
  }
  function validCardIds(ids, length) {
    return Array.isArray(ids) && ids.length === length && Array.from(ids).every(function (id) {
      return typeof id === 'string' && id.trim().length > 0 && id.length <= 128;
    }) && new Set(ids).size === length;
  }
  function validateState(state) {
    return record(state) && validCardIds(state.hand, 4) && validCardIds(state.queue, 4) &&
      validCardIds(state.hand.concat(state.queue), 8) && Number.isSafeInteger(state.plays) && state.plays >= 0;
  }
  function createCycle(deck) {
    var context = cycleMeta();
    if (!validCardIds(deck, 8)) return invalid('INVALID_DECK', '서로 다른 비어 있지 않은 카드 ID 8개가 필요합니다.', ['deck'], context);
    var state = { hand: deck.slice(0, 4), queue: deck.slice(4), plays: 0 };
    return success({ state: state, next: state.queue[0] }, context);
  }
  function playCycle(state, slot) {
    var context = cycleMeta();
    if (!validateState(state)) return invalid('INVALID_CYCLE_STATE', '손패 4장·대기열 4장·고유 ID·사용 횟수를 확인하세요.', ['state'], context);
    if (!Number.isInteger(slot) || slot < 0 || slot > 3) return invalid('INVALID_SLOT', '손패 슬롯은 0부터 3까지의 정수입니다.', ['slot'], context);
    if (state.plays === Number.MAX_SAFE_INTEGER) return invalid('PLAY_COUNT_OVERFLOW', '사용 횟수가 안전한 정수 범위를 넘습니다.', ['state.plays'], context);
    var played = state.hand[slot];
    var hand = state.hand.slice();
    var queue = state.queue.slice();
    var drawn = queue.shift();
    queue.push(played);
    hand[slot] = drawn;
    return success({ state: { hand: hand, queue: queue, plays: state.plays + 1 },
      played: played, drawn: drawn, next: queue[0] }, context);
  }
  function runCycle(deck, slots) {
    var initial = createCycle(deck);
    if (!initial.ok) return initial;
    if (!Array.isArray(slots) || slots.length > 10000 || !Array.from(slots).every(function (slot) {
      return Number.isInteger(slot) && slot >= 0 && slot <= 3;
    })) return invalid('INVALID_SEQUENCE', '0~3 슬롯 번호 배열이 필요하며 최대 10,000회입니다.', ['slots'], cycleMeta());
    var state = initial.state;
    var history = [];
    slots.forEach(function (slot, index) {
      var step = playCycle(state, slot);
      state = step.state;
      history.push({ step: index + 1, slot: slot, played: step.played, drawn: step.drawn,
        hand: state.hand.slice(), queue: state.queue.slice(), next: step.next });
    });
    return success({ state: state, next: state.queue[0], history: history }, cycleMeta());
  }

  function clockMeta() {
    return meta('reproduction_design', CLOCK_SOURCES, [
      '일반전에서 경기가 계속된 경우의 일정 조회이며 승패 판정기가 아니다.',
      '시간 구간은 좌측 포함·우측 제외로 정의한 연속 시간 재현 모델이다.',
      '정규전 승패·연장 서든데스·원작 tick 순서·시작 카운트다운은 처리하지 않는다.'
    ]);
  }
  function phaseAt(elapsedSeconds) {
    var context = clockMeta();
    if (!nonnegative(elapsedSeconds)) return invalid('INVALID_TIME', '경과 시간은 0 이상의 유한 숫자여야 합니다.', ['elapsedSeconds'], context);
    var phase = elapsedSeconds < 180 ? 'regular' : elapsedSeconds < 300 ? 'overtime' : 'tiebreak_pending';
    var multiplier = elapsedSeconds < 120 ? 1 : elapsedSeconds < 240 ? 2 : elapsedSeconds < 300 ? 3 : 0;
    return success({ elapsedSeconds: elapsedSeconds, phase: phase, multiplier: multiplier,
      remainingSeconds: Math.max(0, (elapsedSeconds < 180 ? 180 : 300) - elapsedSeconds),
      requiresUnresolvedMatch: elapsedSeconds >= 180,
      winner: null, winnerEvaluated: false,
      nextBoundarySeconds: elapsedSeconds < 120 ? 120 : elapsedSeconds < 180 ? 180 : elapsedSeconds < 240 ? 240 : elapsedSeconds < 300 ? 300 : null }, context);
  }

  function elixirMeta() {
    var context = clockMeta();
    context.assumptions.push('시작량·상한·기본 생성 간격은 사용자 입력이며 공식 확인값으로 승격하지 않는다.');
    context.assumptions.push('구간 시작 즉시 연속 생성한다고 가정한다. 생성 시작 지연·정수 표시는 구현하지 않는다.');
    context.assumptions.push('같은 시각은 생성 후 입력 배열 순서대로 소비한다. 이는 재현 정책이며 원작 우선순위가 아니다.');
    context.assumptions.push('180초 이후에도 미결착으로 경기가 계속된다고 가정한다.');
    context.assumptions.push('toSeconds 시각의 소비는 포함한다. 구간을 이어 붙일 때 경계 소비를 중복 전달하지 않는다.');
    return context;
  }
  function simulateElixir(input) {
    var context = elixirMeta();
    if (!record(input)) return invalid('INVALID_INPUT', '계산 입력 객체가 필요합니다.', ['input'], context);
    var profileFields = ['initialAmount', 'capacity', 'baseIntervalSeconds'];
    var missing = profileFields.filter(function (key) { return !record(input.profile) || input.profile[key] === undefined || input.profile[key] === null; });
    if (missing.length) return blocked('MISSING_PROFILE', '공식 데이터가 미확정인 엘릭서 프로필을 명시해야 계산할 수 있습니다.', missing.map(function (key) { return 'profile.' + key; }), context);
    var p = input.profile;
    if (!nonnegative(p.initialAmount) || !finite(p.capacity) || p.capacity <= 0 || p.initialAmount > p.capacity ||
        !finite(p.baseIntervalSeconds) || p.baseIntervalSeconds <= 0) {
      return invalid('INVALID_PROFILE', '0 ≤ 시작량 ≤ 상한, 상한 > 0, 기본 간격 > 0인 유한 숫자를 입력하세요.', ['profile'], context);
    }
    var from = input.fromSeconds;
    var to = input.toSeconds;
    if (!nonnegative(from) || !nonnegative(to) || from > to || to > 300) return invalid('INVALID_INTERVAL', '계산 구간은 0 ≤ 시작 ≤ 종료 ≤ 300초여야 합니다.', ['fromSeconds', 'toSeconds'], context);
    var start = input.startAmount;
    if (start === undefined || start === null) {
      if (from !== 0) return blocked('MISSING_START_AMOUNT', '0초 이후부터 계산할 때 해당 시각의 보유량이 필요합니다.', ['startAmount'], context);
      start = p.initialAmount;
    }
    if (!nonnegative(start) || start > p.capacity) return invalid('INVALID_START_AMOUNT', '시작 보유량은 0 이상 상한 이하의 유한 숫자여야 합니다.', ['startAmount'], context);
    var spends = input.spends === undefined ? [] : input.spends;
    if (!Array.isArray(spends) || spends.length > 10000) return invalid('INVALID_SPENDS', '소비 입력은 최대 10,000개의 배열이어야 합니다.', ['spends'], context);
    var previousTime = from;
    for (var i = 0; i < spends.length; i += 1) {
      var event = spends[i];
      if (!record(event) || !nonnegative(event.atSeconds) || event.atSeconds < previousTime || event.atSeconds > to || !nonnegative(event.cost)) {
        return invalid('INVALID_SPEND', '소비 시각은 계산 구간 안에서 오름차순이며 비용은 0 이상의 유한 숫자여야 합니다.', ['spends.' + i], context);
      }
      previousTime = event.atSeconds;
    }
    var amount = start;
    var generated = 0;
    var spent = 0;
    var overflow = 0;
    var cursor = from;
    var segments = [];
    var events = [];
    var numericalOverflow = false;
    function advance(end) {
      SCHEDULE.forEach(function (phase) {
        var a = Math.max(cursor, phase.from);
        var b = Math.min(end, phase.to);
        if (b <= a) return;
        var produced = (b - a) * phase.multiplier / p.baseIntervalSeconds;
        var before = amount;
        var accepted = Math.min(p.capacity - amount, produced);
        var lost = produced - accepted;
        amount += accepted;
        generated += produced;
        overflow += lost;
        if (![amount, generated, overflow].every(Number.isFinite)) numericalOverflow = true;
        segments.push({ fromSeconds: a, toSeconds: b, multiplier: phase.multiplier,
          generated: produced, acceptedGeneration: accepted, overflow: lost,
          before: before, after: amount });
      });
      cursor = end;
    }
    spends.forEach(function (event, index) {
      advance(event.atSeconds);
      var before = amount;
      // A small relative tolerance permits an exactly affordable action at a
      // mathematically exact boundary despite IEEE-754 accumulation error.
      var tolerance = Number.EPSILON * Math.max(amount, event.cost) * 8;
      var accepted = event.cost <= amount + tolerance;
      var committed = accepted ? event.cost : 0;
      if (accepted) { amount = Math.max(0, amount - committed); spent += committed; }
      events.push({ index: index, atSeconds: event.atSeconds, requestedCost: event.cost,
        committedCost: committed, accepted: accepted, before: before, after: amount,
        reason: accepted ? 'accepted' : 'insufficient_elixir' });
    });
    advance(to);
    if (numericalOverflow || !Number.isFinite(spent)) return invalid('NUMERICAL_RANGE', '이 입력은 계산 가능한 수치 범위를 넘습니다.', ['profile', 'spends'], context);
    var residual = (amount - start) - (generated - overflow - spent);
    if (!Number.isFinite(residual)) return invalid('NUMERICAL_RANGE', '이 입력은 보존식 계산 범위를 넘습니다.', ['profile', 'spends'], context);
    return success({ fromSeconds: from, toSeconds: to, initialAmount: start, finalAmount: amount,
      generated: generated, spent: spent, overflow: overflow, conservationResidual: residual,
      profile: { initialAmount: p.initialAmount, capacity: p.capacity, baseIntervalSeconds: p.baseIntervalSeconds },
      events: events, segments: segments }, context);
  }

  function resolveShield(input) {
    var context = meta('reproduction_design', [], [
      '단일 가상 피해 사건을 분석한다. 원작의 특정 카드·파동·변형·상태 효과를 모사한 결과가 아니다.',
      'overflowPolicy는 명시적 사용자 가정이다. 미선택 상태에서는 피해를 계산하지 않는다.',
      '본체 HP가 이미 0이면 죽은 대상에 대한 사건으로 보고 피해를 적용하지 않는다.'
    ]);
    if (!record(input)) return invalid('INVALID_INPUT', '피해 입력 객체가 필요합니다.', ['input'], context);
    if (!['bodyHp', 'shieldHp', 'damage'].every(function (key) { return nonnegative(input[key]); })) {
      return invalid('INVALID_DAMAGE_INPUT', 'HP·방패·피해는 0 이상의 유한 숫자여야 합니다.', ['bodyHp', 'shieldHp', 'damage'], context);
    }
    if (input.overflowPolicy === undefined || input.overflowPolicy === null || input.overflowPolicy === 'unknown') {
      return blocked('UNKNOWN_SHIELD_POLICY', '방패 초과 피해 정책은 미확정입니다. discard 또는 spill 가정을 선택하세요.', ['overflowPolicy'], context);
    }
    if (input.overflowPolicy !== 'discard' && input.overflowPolicy !== 'spill') return invalid('INVALID_SHIELD_POLICY', '허용 정책은 unknown, discard, spill입니다.', ['overflowPolicy'], context);
    var body = input.bodyHp;
    var shield = input.shieldHp;
    var bodyDamage = 0;
    var shieldDamage = 0;
    var discarded = 0;
    var overkill = 0;
    var ignored = 0;
    if (body === 0) ignored = input.damage;
    else {
      shieldDamage = Math.min(shield, input.damage);
      shield -= shieldDamage;
      var remaining = input.damage - shieldDamage;
      if (input.shieldHp > 0 && input.overflowPolicy === 'discard') discarded = remaining;
      else {
        bodyDamage = Math.min(body, remaining);
        body -= bodyDamage;
        overkill = remaining - bodyDamage;
      }
    }
    return success({ bodyHp: body, shieldHp: shield, bodyDamage: bodyDamage, shieldDamage: shieldDamage,
      discarded: discarded, overkill: overkill, ignoredDamage: ignored,
      shieldBroken: input.shieldHp > 0 && shield === 0, killed: input.bodyHp > 0 && body === 0,
      policy: input.overflowPolicy, policyEvidence: 'user_assumption', sourceCaseIds: ['CASE_SHIELD_OVERFLOW'] }, context);
  }

  function phalanx(input) {
    var context = meta('custom_only', ['LOCAL_CROWNFALL_44'], [
      'Crownfall v4.4.0의 기본 밀집보병 조건을 축약한 자체 카드 판정표다.',
      'aligned는 모든 생존자의 목표 슬롯 정렬 완료, deployed는 모든 생존자의 활성화·배치 완료를 뜻한다.',
      'stunned는 생존자 중 한 명 이상이 기절했는지를 나타낸다. 공격 가능은 분대 전체 준비 조건의 보수적 집계다.',
      '충돌·정렬 복구 시간·개별 유닛 공격·능력 비용과 쿨다운·실시간 수정값은 여기서 시뮬레이션하지 않는다.'
    ]);
    if (!record(input) || !['forming', 'guard', 'regroup', 'charge'].includes(input.state) ||
      !Number.isInteger(input.aliveCount) || input.aliveCount < 0 || input.aliveCount > 6 ||
      !['aligned', 'deployed', 'stunned'].every(function (key) { return typeof input[key] === 'boolean'; }) ||
      !nonnegative(input.incomingDamage)) {
      return invalid('INVALID_PHALANX_INPUT', '상태·생존 수 0~6·정렬/배치/기절 boolean·비음수 피해를 확인하세요.', ['input'], context);
    }
    var exists = input.aliveCount > 0;
    var defense = input.state === 'guard' && input.aliveCount >= 3 && input.aligned && input.deployed && !input.stunned;
    var canAttack = input.state === 'charge' && exists && input.deployed && !input.stunned;
    var reduction = defense ? 0.7 : 0;
    return success({ defenseActive: defense, damageReduction: reduction,
      receivedDamage: exists ? input.incomingDamage * (1 - reduction) : 0,
      ignoredDamage: exists ? 0 : input.incomingDamage,
      canAttack: canAttack, attackPolicy: 'charge_only',
      sourceCaseIds: ['CASE_PHALANX_ISOLATION'], originalCardId: null,
      evaluationScope: 'aggregate_reference_decision_not_runtime_equivalence' }, context);
  }

  return Object.freeze({ VERSION: VERSION, createCycle: createCycle, playCycle: playCycle,
    runCycle: runCycle, phaseAt: phaseAt, simulateElixir: simulateElixir,
    resolveShield: resolveShield, phalanx: phalanx });
}));
