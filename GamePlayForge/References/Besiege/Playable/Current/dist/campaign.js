/**
 * Pure campaign scoring and save normalization. No storage or UI side effects.
 * Progress records contain campaign missions only; sandbox has no score.
 */
import { MISSIONS } from './parts.js';

const CAMPAIGN = MISSIONS.filter((mission) => mission.campaign);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const owns = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isNonnegative = (value) => Number.isFinite(value) && value >= 0;
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const validIntegrity = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
const emptyRecord = () => ({ stars: 0, bestTime: null, bestShots: null, clears: 0 });
const best = (previous, current) => previous === null ? current : Math.min(previous, current);

/**
 * One completion star, one time star, and one integrity star. Destroy missions
 * also require the shot target for that third star; routes do not use shots.
 * Exact thresholds qualify. Missing/bad measurements never grant bonus stars.
 * Numeric fields always remain finite so results are safe to render or save.
 */
export function scoreRun(missionId, stats) {
  const mission = CAMPAIGN.find((item) => item.id === missionId);
  const run = isRecord(stats) ? stats : {};
  const completed = Boolean(mission && run.won === true);
  const timeStar = Boolean(completed && isNonnegative(run.elapsed) && run.elapsed <= mission.parTime);
  const precisionStar = Boolean(completed && validIntegrity(run.integrity) && run.integrity >= 0.75
    && (mission.objective === 'route' || (isCount(run.shots) && run.shots <= mission.parShots)));
  return {
    stars: completed ? 1 + Number(timeStar) + Number(precisionStar) : 0,
    timeStar,
    precisionStar,
    elapsed: isNonnegative(run.elapsed) ? run.elapsed : 0,
    shots: isCount(run.shots) ? run.shots : 0,
    integrity: Number.isFinite(run.integrity) ? Math.max(0, Math.min(1, run.integrity)) : 0,
    cost: isNonnegative(run.cost) ? run.cost : 0,
  };
}

/**
 * Canonical version 1 progress includes every current campaign mission, adding
 * new empty records while preserving the earlier land campaign records.
 * Unknown mission keys and extra fields are dropped. Unversioned early saves
 * with the same `missions` shape are supported; unknown numbered versions are
 * not interpreted as this schema. Null best values mean "no valid record".
 */
export function normalizeProgress(raw) {
  const progress = { version: 1, missions: {} };
  const compatible = isRecord(raw) && (raw.version === undefined || raw.version === 1);
  const source = compatible && isRecord(raw.missions) ? raw.missions : {};
  for (const mission of CAMPAIGN) {
    const entry = owns(source, mission.id) && isRecord(source[mission.id]) ? source[mission.id] : {};
    const record = emptyRecord();
    if (Number.isInteger(entry.stars)) record.stars = Math.max(0, Math.min(3, entry.stars));
    if (isNonnegative(entry.bestTime)) record.bestTime = entry.bestTime;
    if (isCount(entry.bestShots)) record.bestShots = entry.bestShots;
    if (isCount(entry.clears)) record.clears = entry.clears;
    // A best result or a star is evidence of at least one completion in an
    // older partial record. Conversely, every completion earns its first star.
    if (record.stars > 0 || record.bestTime !== null || record.bestShots !== null) {
      record.clears = Math.max(1, record.clears);
    }
    if (record.clears > 0) record.stars = Math.max(1, record.stars);
    progress.missions[mission.id] = record;
  }
  return progress;
}

/**
 * Record one successful campaign run without mutating either input. The caller
 * must invoke this once per terminal success; persistence belongs to the UI.
 * Personal bests are independent and can come from different successful runs.
 */
export function recordCompletion(progress, missionId, stats) {
  const next = normalizeProgress(progress);
  const result = scoreRun(missionId, stats);
  if (result.stars === 0) return next;
  const record = next.missions[missionId];
  record.stars = Math.max(record.stars, result.stars);
  record.clears = Math.min(Number.MAX_SAFE_INTEGER, record.clears + 1);
  // Do not turn scoreRun's safe display fallbacks into a false zero-time best.
  if (isNonnegative(stats.elapsed)) record.bestTime = best(record.bestTime, stats.elapsed);
  if (isCount(stats.shots)) record.bestShots = best(record.bestShots, stats.shots);
  return next;
}

/** Campaign order is explicit and ends at the switchback; it never wraps. */
export function nextCampaignMission(id) {
  const index = CAMPAIGN.findIndex((mission) => mission.id === id);
  return index >= 0 && index + 1 < CAMPAIGN.length ? CAMPAIGN[index + 1].id : null;
}
