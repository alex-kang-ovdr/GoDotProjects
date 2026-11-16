// Browser-independent operation records. This module never reads storage or the clock.
// The caller supplies a unique battleId and persists the returned career object.
export const OPERATIONS = Object.freeze([
  Object.freeze({ id: 'valley', title: '메마른 계곡', brief: '중앙 도로와 양쪽 우회로를 활용해 전선을 돌파하세요.', goalText: '피해·정찰 지원 600 / 생존 또는 2대 격파' }),
  Object.freeze({ id: 'depot', title: '강철 보급소', brief: '창고 사이에서 사선을 확보하고 적의 측면을 압박하세요.', goalText: '방어 300 또는 피해 900 / 2대 격파 또는 점령 25' }),
  Object.freeze({ id: 'ridge', title: '안개 능선', brief: '수풀에서 적을 발견하고 아군의 화력을 연결하세요.', goalText: '정찰 지원 250 또는 피해 900 / 발견 2 또는 격파 2' }),
]);

const IDS = OPERATIONS.map(operation => operation.id);
const MEDALS = Object.freeze({ none: 0, bronze: 1, silver: 2, gold: 3 });
const MAX_TOTAL = 1_000_000_000;
const MAX_RECORDED_IDS = 100_000;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const count = (value, maximum = MAX_TOTAL) => {
  const numeric = typeof value === 'number' || typeof value === 'string' && /^\s*\d+(?:\.\d+)?\s*$/.test(value) ? Number(value) : 0;
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(0, Math.floor(numeric))) : 0;
};
const amount = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(MAX_TOTAL, value)) : 0;
const ratio = value => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
const tier = value => Object.hasOwn(MEDALS, value) ? value : 'none';
const id = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 160 ? value.trim() : '';
const opId = value => IDS.includes(value) ? value : 'valley';
const emptyOperation = () => ({ played: 0, wins: 0, bestScore: 0, bestMedal: 'none' });

/** All three operations are selectable. Records never change vehicle combat stats. */
export function defaultCareer() {
  return {
    version: 2,
    battles: 0, wins: 0, draws: 0, bestDamage: 0, totalDamage: 0, totalKills: 0,
    operations: Object.fromEntries(IDS.map(operationId => [operationId, emptyOperation()])),
    history: [], recordedBattleIds: [],
  };
}

function cleanHistoryEntry(raw) {
  const item = object(raw);
  const battleId = id(item.battleId);
  if (!battleId || !IDS.includes(item.mapId)) return null;
  return {
    battleId, mapId: item.mapId,
    result: ['victory', 'draw', 'defeat'].includes(item.result) ? item.result : 'defeat',
    score: count(item.score), medal: tier(item.medal), damage: count(item.damage),
    assisted: count(item.assisted), blocked: count(item.blocked), kills: count(item.kills, 20),
    spots: count(item.spots, 20), accuracy: count(item.accuracy, 100), duration: count(item.duration, 3600),
  };
}

/** Accepts null, older flat records or damaged JSON data without mutating the input. */
export function sanitizeCareer(raw) {
  const value = object(raw);
  const career = defaultCareer();
  career.battles = count(value.battles);
  career.wins = count(value.wins, career.battles);
  career.draws = count(value.draws, career.battles - career.wins);
  career.bestDamage = count(value.bestDamage);
  career.totalDamage = count(value.totalDamage);
  career.totalKills = count(value.totalKills);
  const operations = object(value.operations);
  for (const operationId of IDS) {
    const saved = object(operations[operationId]);
    const played = count(saved.played);
    career.operations[operationId] = { played, wins: count(saved.wins, played), bestScore: count(saved.bestScore), bestMedal: tier(saved.bestMedal) };
  }
  const seen = new Set();
  if (Array.isArray(value.history)) {
    for (const rawEntry of value.history.slice(0, 1000)) {
      const entry = cleanHistoryEntry(rawEntry);
      if (entry && !seen.has(entry.battleId)) {
        seen.add(entry.battleId); career.history.push(entry);
        if (career.history.length === 10) break;
      }
    }
  }
  // History is intentionally short, but deduplication survives its ten-entry window.
  const recorded = Array.isArray(value.recordedBattleIds) ? value.recordedBattleIds.slice(-MAX_RECORDED_IDS) : [];
  career.recordedBattleIds = [...new Set([...recorded.map(id).filter(Boolean), ...career.history.map(entry => entry.battleId)])].slice(-MAX_RECORDED_IDS);
  return career;
}

function numericObjective(objectiveId, label, value, target, display) {
  return { id: objectiveId, label, complete: value >= target, value, target, progress: ratio(value / target), display };
}

function alternateObjective(objectiveId, label, firstValue, firstTarget, secondValue, secondTarget, display) {
  const progress = ratio(Math.max(firstValue / firstTarget, secondValue / secondTarget));
  return { id: objectiveId, label, complete: progress >= 1, value: progress >= 1 ? 1 : 0, target: 1, progress, display };
}

function operationObjectives(operationId, stats) {
  const { damage, assisted, blocked, kills, spots, captures, survived } = stats;
  if (operationId === 'depot') return [
    alternateObjective('frontline', '장갑으로 300 방어 또는 900 피해', blocked, 300, damage, 900, `방어 ${blocked} / 300 · 피해 ${damage} / 900`),
    alternateObjective('breakthrough', '적 2대 격파 또는 점령 25 기여', kills, 2, captures, 25, `격파 ${kills} / 2 · 점령 ${captures} / 25`),
  ];
  if (operationId === 'ridge') return [
    alternateObjective('spotting-support', '정찰 지원 250 또는 직접 피해 900', assisted, 250, damage, 900, `정찰 지원 ${assisted} / 250 · 피해 ${damage} / 900`),
    alternateObjective('recon-hunter', '적 2대 발견 또는 2대 격파', spots, 2, kills, 2, `발견 ${spots} / 2 · 격파 ${kills} / 2`),
  ];
  return [
    numericObjective('support-fire', '피해·정찰 지원 합계 600', damage + assisted, 600, `합계 ${damage + assisted} / 600`),
    alternateObjective('safe-return', '생존 귀환 또는 적 2대 격파', survived ? 1 : 0, 1, kills, 2, `${survived ? '생존 귀환 완료' : '전투 종료 시 생존 확인'} · 격파 ${kills} / 2`),
  ];
}

/** May also be called while a battle runs to render objective progress. */
export function summarizeBattle(state) {
  const battle = object(state);
  const tanks = Array.isArray(battle.tanks) ? battle.tanks : [];
  const player = tanks.find(tank => tank && (tank.id === battle.playerId || tank.isPlayer));
  const stats = { ...object(player?.stats), ...object(battle.statistics) };
  const ended = battle.phase === 'ended';
  const training = battle.mode === 'training' || battle.mapId === 'training' || battle.map?.id === 'training';
  const victory = ended && battle.winner === 0;
  const draw = ended && battle.winner === null;
  const damage = count(stats.damage), assisted = count(stats.assisted ?? stats.assistedDamage), blocked = count(stats.blocked);
  const kills = count(stats.kills, 20), spots = count(stats.spots, 20), captures = count(stats.captures, 100);
  const shots = count(stats.shots), hits = Math.min(shots, count(stats.hits));
  const survived = ended && Boolean(typeof stats.survived === 'boolean' ? stats.survived : player?.alive);
  const accuracy = shots ? Math.round(hits / shots * 100) : 0;
  const duration = Math.min(3600, amount(battle.elapsed ?? stats.duration));
  const mapId = opId(battle.mapId || battle.map?.id);
  let objectives = operationObjectives(mapId, { damage, assisted, blocked, kills, spots, captures, survived });
  let score = count(damage + assisted * 0.75 + blocked * 0.35 + kills * 250 + spots * 90 + captures * 8 + (victory ? 500 : 0) + (survived ? 150 : 0));
  let medalTier = 'none';
  const completed = objectives.filter(objective => objective.complete).length;
  const contribution = damage + assisted + blocked + kills + spots + captures;
  if (victory && completed === 2) medalTier = 'gold';
  else if (victory && completed >= 1 || !victory && completed === 2 && score >= 1500) medalTier = 'silver';
  else if (victory || contribution > 0) medalTier = 'bronze';
  const medal = { id: medalTier, label: { none: '작전 참가', bronze: '동성 훈장', silver: '은성 훈장', gold: '금성 훈장' }[medalTier], tier: medalTier };
  if (training) {
    const targets = tanks.filter(tank => tank?.team === 1);
    const completedTargets = targets.filter(tank => !tank.alive).length;
    const targetCount = Math.max(3, targets.length);
    objectives = [numericObjective('training-targets', '훈련 표적 3대 격파', completedTargets, targetCount, `표적 ${completedTargets} / ${targetCount}`)];
    score = 0;
    medal.id = 'training'; medal.label = victory ? '기초 훈련 수료' : '기초 훈련'; medal.tier = 'none';
  }
  return { score, medal, objectives, damage, assisted, blocked, kills, accuracy, spots, captures, shots, hits, duration, victory, draw, survived, training, mapId: training ? 'training' : mapId };
}

/** Records a finished, uniquely identified standard battle exactly once. */
export function recordBattle(previousCareer, state) {
  const career = sanitizeCareer(previousCareer);
  const summary = summarizeBattle(state);
  const battleId = id(state?.battleId);
  if (summary.training || state?.phase !== 'ended' || !battleId || career.recordedBattleIds.includes(battleId)) return { career, summary, recorded: false };
  career.battles = count(career.battles + 1);
  career.wins = count(career.wins + (summary.victory ? 1 : 0));
  career.draws = count(career.draws + (summary.draw ? 1 : 0));
  career.bestDamage = Math.max(career.bestDamage, summary.damage);
  career.totalDamage = count(career.totalDamage + summary.damage);
  career.totalKills = count(career.totalKills + summary.kills);
  const operation = career.operations[summary.mapId];
  operation.played = count(operation.played + 1);
  operation.wins = count(operation.wins + (summary.victory ? 1 : 0));
  operation.bestScore = Math.max(operation.bestScore, summary.score);
  if (MEDALS[summary.medal.tier] > MEDALS[operation.bestMedal]) operation.bestMedal = summary.medal.tier;
  career.recordedBattleIds.push(battleId);
  if (career.recordedBattleIds.length > MAX_RECORDED_IDS) career.recordedBattleIds.shift();
  career.history.unshift({ battleId, mapId: summary.mapId, result: summary.victory ? 'victory' : summary.draw ? 'draw' : 'defeat', score: summary.score, medal: summary.medal.tier, damage: summary.damage, assisted: summary.assisted, blocked: summary.blocked, kills: summary.kills, spots: summary.spots, accuracy: summary.accuracy, duration: Math.round(summary.duration) });
  career.history = career.history.slice(0, 10);
  return { career, summary, recorded: true };
}

export function nextOperation(mapId) {
  const index = IDS.indexOf(mapId);
  return index >= 0 && index < IDS.length - 1 ? IDS[index + 1] : null;
}
