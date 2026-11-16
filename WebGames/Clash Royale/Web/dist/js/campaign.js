import { Game, CARDS } from './engine.js';
import { OPPONENTS } from './decks.js';

const VERSION = 1;
const RULES_VERSION = 3;
const MAX = Number.MAX_SAFE_INTEGER;
const EPS = 1e-7;
const stage = (number, name, description, hint, opponentId, difficulty, arenaTheme,
  enemyDeck = OPPONENTS.find(o => o.id === opponentId).deck) => Object.freeze({
  id: `stage-${number}`, number, name, description, hint, opponentId, difficulty, arenaTheme,
  seed: 410600 + number, enemyDeck: Object.freeze([...enemyDeck]),
});

export const CAMPAIGN_STAGES = Object.freeze([
  stage(1, '숲길의 첫 왕관', '푸른 숲에서 철벽의 브란과 첫 승부를 펼칩니다. 기본 배치와 역공을 익혀 보세요.',
    '거인이 다가오면 지원 병력을 먼저 살펴보세요. 수비에서 살아남은 유닛 앞에 전열을 세우면 역공이 됩니다.', 'bran', 'easy', 'grove'),
  stage(2, '갈림길의 추격전', '질주의 루나가 두 레인으로 빈틈을 노립니다. 성급한 지출보다 남겨 둔 수비 카드가 중요합니다.',
    '돌격 기수를 중앙 건물로 유인하고, 상대 병력이 몰린 반대 레인에 작은 역공을 보내세요.', 'luna', 'easy', 'grove'),
  stage(3, '황혼의 안개', '안개의 세라가 병력을 받아내며 기회를 기다립니다. 황혼의 전장에서 배치 간격을 조절하세요.',
    '원거리 병력을 한곳에 겹치지 마세요. 독 안개가 깔린 뒤에는 다른 위치에서 다음 병력을 준비하세요.', 'sera', 'normal', 'dusk'),
  stage(4, '성문 앞의 행진', '브란이 더욱 빠른 판단으로 무거운 전열을 완성합니다. 큰 공격이 만들어지는 순서를 끊어 보세요.',
    '거인에게 모든 화력을 쓰기 전에 뒤따르는 총사와 폭탄병을 확인하세요. 주문은 지원 병력이 모였을 때 효과적입니다.', 'bran', 'normal', 'dusk'),
  stage(5, '빙원의 질주', '얼어붙은 길에서 루나의 연속 압박을 견뎌야 합니다. 짧은 수비와 빠른 재배치로 흐름을 바꾸세요.',
    '다음 기수를 막을 카드를 손패에 남겨 두세요. 수비가 끝나면 생존 병력과 함께 반대편을 압박해 보세요.', 'luna', 'hard', 'frost'),
  stage(6, '얼어붙은 성채', '마지막 상대 세라가 수비와 지속 피해를 엮습니다. 두 레인의 기회를 비교해 마지막 왕관을 차지하세요.',
    '한 레인에 병력을 계속 쌓기보다 다른 레인의 수비 상태를 확인하세요. 킹 타워가 위험하면 타워 마무리보다 생존이 먼저입니다.', 'sera', 'hard', 'frost'),
]);

const byId = id => CAMPAIGN_STAGES.find(s => s.id === id);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const integer = v => Number.isSafeInteger(v) && v >= 0;
const counter = v => integer(v) ? v : 0;
const bounded = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
const sum = values => values.reduce((n, value) => Math.min(MAX, n + value), 0);
const sameArray = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
const validDeck = deck => Array.isArray(deck) && deck.length === 8 && new Set(deck).size === 8 &&
  deck.every(id => typeof id === 'string' && Object.hasOwn(CARDS, id));
const blankStage = () => ({ attempts: 0, wins: 0, bestMedals: 0, totalMedals: 0, bestCrowns: 0, bestTime: null });
const copyContext = c => c ? { version: c.version, mode: c.mode, stageId: c.stageId, battleId: c.battleId, attempt: c.attempt, deck: [...c.deck] } : null;
const sequenceOf = id => {
  if (typeof id !== 'string' || !/^campaign-[1-9]\d{0,15}$/.test(id)) return null;
  const value = Number(id.slice(9));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};
function validContext(c) {
  return object(c) && c.version === VERSION && c.mode === 'campaign' && Boolean(byId(c.stageId)) &&
    sequenceOf(c.battleId) !== null && integer(c.attempt) && c.attempt > 0 && validDeck(c.deck);
}
function sameContext(a, b) {
  return validContext(a) && validContext(b) && a.version === b.version && a.mode === b.mode &&
    a.stageId === b.stageId && a.battleId === b.battleId && a.attempt === b.attempt && sameArray(a.deck, b.deck);
}
function configFor(s, deck) {
  return { deck: [...deck], enemyDeck: [...s.enemyDeck], difficulty: s.difficulty,
    seed: s.seed, practice: false, rulesVersion: RULES_VERSION };
}

// Accept missing historical fields, but never evaluate imported accessors or
// recursively walk an unbounded, cyclic or prototype-bearing save object.
function inspectJSON(value) {
  let nodes = 0;
  const path = new Set();
  function visit(v, depth) {
    if (++nodes > 5000 || depth > 12) throw new TypeError('캠페인 저장 데이터가 너무 큽니다.');
    if (v === null || typeof v === 'boolean' || typeof v === 'number' || v === undefined) return;
    if (typeof v === 'string') {
      if (v.length > 512) throw new TypeError('캠페인 저장 문자열이 올바르지 않습니다.');
      return;
    }
    if (!v || typeof v !== 'object' || path.has(v) ||
        ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(v))) {
      throw new TypeError('캠페인 저장 데이터는 순환 없는 JSON 객체여야 합니다.');
    }
    if (Array.isArray(v) && v.length > 100) throw new TypeError('캠페인 저장 배열이 너무 큽니다.');
    path.add(v);
    for (const key of Reflect.ownKeys(v)) {
      if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new TypeError('캠페인 저장 키가 올바르지 않습니다.');
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError('캠페인 저장 속성이 올바르지 않습니다.');
      visit(descriptor.value, depth + 1);
    }
    path.delete(v);
  }
  visit(value, 0);
}

/**
 * Pure local campaign progression. One active attempt is retained; starting a
 * new one retires an unfinished attempt without awarding a result. A monotonic
 * sequence plus the settled watermark makes repeated completion idempotent
 * across reloads, without an ever-growing list of battle IDs.
 */
export class CampaignProgress {
  #stages;
  #sequence;
  #settledThrough;
  #active;
  #bindings = new WeakMap();

  constructor(snapshot = null) {
    if (snapshot == null) snapshot = {};
    inspectJSON(snapshot);
    if (!object(snapshot) || (snapshot.version !== undefined && snapshot.version !== VERSION)) {
      throw new TypeError('지원하지 않는 캠페인 저장 버전입니다.');
    }
    this.#stages = {};
    let reachable = true;
    for (const s of CAMPAIGN_STAGES) {
      const raw = object(snapshot.stages) && object(snapshot.stages[s.id]) ? snapshot.stages[s.id] : {};
      const p = blankStage();
      if (reachable) {
        p.attempts = counter(raw.attempts);
        p.wins = Math.min(p.attempts, counter(raw.wins));
        p.bestCrowns = p.attempts > 0 && integer(raw.bestCrowns) ? Math.min(3, raw.bestCrowns) : 0;
        if (p.wins > 0) {
          p.bestMedals = integer(raw.bestMedals) && raw.bestMedals >= 1 ? Math.min(3, raw.bestMedals) : 1;
          p.totalMedals = Math.max(p.wins, Math.min(p.wins * p.bestMedals, counter(raw.totalMedals), MAX));
          p.bestTime = bounded(raw.bestTime, 0, 301) ? raw.bestTime : null;
        }
      }
      this.#stages[s.id] = p;
      reachable = reachable && p.wins > 0;
    }
    const attempts = sum(Object.values(this.#stages).map(p => p.attempts));
    this.#sequence = Math.max(counter(snapshot.sequence), attempts);
    this.#settledThrough = Math.min(this.#sequence, counter(snapshot.settledThrough));
    this.#active = null;
    const active = snapshot.activeAttempt;
    if (validContext(active) && this.isUnlocked(active.stageId) &&
        sequenceOf(active.battleId) === this.#sequence && sequenceOf(active.battleId) > this.#settledThrough &&
        active.attempt === this.#stages[active.stageId].attempts) this.#active = copyContext(active);
  }

  static fromSnapshot(snapshot) { return new CampaignProgress(snapshot); }

  isUnlocked(stageId) {
    const index = CAMPAIGN_STAGES.findIndex(s => s.id === stageId);
    return index >= 0 && CAMPAIGN_STAGES.slice(0, index).every(s => this.#stages[s.id].wins > 0);
  }

  getStageProgress(stageId) {
    if (!byId(stageId)) throw new TypeError('캠페인 단계를 찾을 수 없습니다.');
    const p = this.#stages[stageId];
    return { stageId, unlocked: this.isUnlocked(stageId), completed: p.wins > 0, ...p };
  }

  getSummary() {
    const values = Object.values(this.#stages);
    return { attempts: sum(values.map(p => p.attempts)), wins: sum(values.map(p => p.wins)),
      totalMedals: sum(values.map(p => p.totalMedals)), bestMedals: sum(values.map(p => p.bestMedals)),
      completedStages: values.filter(p => p.wins > 0).length,
      unlockedStages: CAMPAIGN_STAGES.filter(s => this.isUnlocked(s.id)).length, totalStages: CAMPAIGN_STAGES.length };
  }

  beginAttempt(stageId, deck) {
    const s = byId(stageId);
    if (!s || !this.isUnlocked(stageId)) throw new Error('먼저 이전 캠페인 단계를 승리로 완료하세요.');
    if (!validDeck(deck)) throw new TypeError('서로 다른 카드 8장을 선택하세요.');
    if (this.#sequence >= MAX || this.#stages[stageId].attempts >= MAX) throw new RangeError('캠페인 시도 번호를 저장할 수 없습니다.');
    this.#sequence++;
    const progress = this.#stages[stageId];
    progress.attempts++;
    this.#active = { version: VERSION, mode: 'campaign', stageId,
      battleId: `campaign-${this.#sequence}`, attempt: progress.attempts, deck: [...deck] };
    return { config: configFor(s, deck), context: copyContext(this.#active) };
  }

  /** Pure validation: configuration, stage and the currently active attempt agree. */
  validateContext(game, context) {
    try {
      if (!(game instanceof Game) || !sameContext(context, this.#active) || !this.isUnlocked(context.stageId)) return false;
      const expected = configFor(byId(context.stageId), context.deck);
      const actual = game.initialConfig;
      return object(actual) && game.practice === false && actual.practice === false &&
        actual.seed === expected.seed && game.seed === expected.seed &&
        actual.difficulty === expected.difficulty && game.difficulty === expected.difficulty &&
        actual.rulesVersion === RULES_VERSION && game.rulesVersion === RULES_VERSION &&
        sameArray(actual.deck, expected.deck) && sameArray(game.deck, expected.deck) &&
        sameArray(actual.enemyDeck, expected.enemyDeck) && sameArray(game.enemyDeck, expected.enemyDeck);
    } catch { return false; }
  }

  /**
   * Call immediately after creating or restoring a live campaign Game.
   * Replays create different Game instances and never receive this binding.
   */
  bindGame(game, context, { replay = false, training = false } = {}) {
    if (replay || training || !this.validateContext(game, context) ||
        game.state.phase === 'finished' || game.state.winner !== null) return false;
    const existing = this.#bindings.get(game);
    if (existing && !sameContext(existing, context)) return false;
    try { Game.fromSnapshot(game.exportSnapshot()); } catch { return false; }
    this.#bindings.set(game, copyContext(context));
    return true;
  }

  applyResult(game, context, { replay = false, training = false } = {}) {
    const reject = reason => ({ ok: false, reason });
    if (replay || training || game?.practice) return reject('excluded-mode');
    const sequence = sequenceOf(context?.battleId);
    if (sequence !== null && sequence <= this.#settledThrough) return reject('already-applied');
    if (!this.validateContext(game, context)) return reject('invalid-context');
    if (!sameContext(this.#bindings.get(game), context)) return reject('unbound-game');
    const s = game.state;
    if (s.phase !== 'finished' || s.running || !['player', 'enemy', 'draw'].includes(s.winner)) return reject('not-finished');
    try { Game.fromSnapshot(game.exportSnapshot()); } catch { return reject('invalid-result'); }
    if (!['king', 'crowns', 'suddenDeath', 'tiebreaker', 'concede'].includes(s.reason)) return reject('invalid-result');

    const definition = byId(context.stageId), progress = this.#stages[context.stageId];
    const next = CAMPAIGN_STAGES[definition.number];
    const nextWasLocked = next ? !this.isUnlocked(next.id) : false;
    const before = { ...progress };
    const won = s.winner === 'player';
    const intact = s.towers.filter(t => t.team === 'player').every(t => t.hp > 0 && !t.destroyed);
    const medals = won ? 1 + Number(intact) + Number(s.time <= 180 + EPS) : 0;
    progress.bestCrowns = Math.max(progress.bestCrowns, s.crowns.player);
    if (won) {
      progress.wins++;
      progress.bestMedals = Math.max(progress.bestMedals, medals);
      progress.totalMedals = Math.min(MAX, progress.totalMedals + medals);
      progress.bestTime = progress.bestTime === null ? s.time : Math.min(progress.bestTime, s.time);
    }
    this.#settledThrough = sequence;
    this.#active = null;
    this.#bindings.delete(game);
    const newBest = progress.bestMedals > before.bestMedals || progress.bestCrowns > before.bestCrowns ||
      (won && (before.bestTime === null || progress.bestTime < before.bestTime));
    return { ok: true, stageId: context.stageId, battleId: context.battleId, won, medals, newBest,
      unlockedStageId: won && nextWasLocked ? next.id : null,
      progress: this.getStageProgress(context.stageId), summary: this.getSummary() };
  }

  exportSnapshot() {
    return { version: VERSION, sequence: this.#sequence, settledThrough: this.#settledThrough,
      stages: Object.fromEntries(CAMPAIGN_STAGES.map(s => [s.id, { ...this.#stages[s.id] }])),
      activeAttempt: copyContext(this.#active) };
  }
}
