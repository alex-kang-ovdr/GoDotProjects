// N8 Isolated Ethical Flow-State DDA (Dynamic Difficulty Adjustment).
// Architectural Hard Boundary:
// - Pure gameplay-telemetry function only.
// - ZERO database access and ZERO imports from monetization/store/cosmetic modules.
// - Hard-clamped difficulty multipliers [0.75, 1.25].
// - Neutral 1.0 whenever optIn === false, playerToggleEnabled === false, or PvP ranked mode.

export const DDA_MIN_MULTIPLIER = 0.75;
export const DDA_MAX_MULTIPLIER = 1.25;
export const DDA_NEUTRAL_MULTIPLIER = 1.0;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

export function computeEthicalDdaProfile({
  recentWinRate = 0.55,
  consecutiveLosses = 0,
  avgSessionMs = 180000,
  optIn = true,
  playerToggleEnabled = true,
  mode = 'solo'
} = {}) {
  const normalizedMode = typeof mode === 'string' ? mode.trim().toLowerCase() : 'solo';

  if (optIn === false) {
    return {
      active: false,
      reason: 'OPT_OUT',
      mode: normalizedMode,
      difficultyMultiplier: DDA_NEUTRAL_MULTIPLIER,
      enemySpeedMultiplier: DDA_NEUTRAL_MULTIPLIER,
      spawnRateMultiplier: DDA_NEUTRAL_MULTIPLIER,
      assistHintLevel: 0,
      bounds: { min: DDA_MIN_MULTIPLIER, max: DDA_MAX_MULTIPLIER }
    };
  }

  if (playerToggleEnabled === false) {
    return {
      active: false,
      reason: 'PLAYER_TOGGLE_DISABLED',
      mode: normalizedMode,
      difficultyMultiplier: DDA_NEUTRAL_MULTIPLIER,
      enemySpeedMultiplier: DDA_NEUTRAL_MULTIPLIER,
      spawnRateMultiplier: DDA_NEUTRAL_MULTIPLIER,
      assistHintLevel: 0,
      bounds: { min: DDA_MIN_MULTIPLIER, max: DDA_MAX_MULTIPLIER }
    };
  }

  if (normalizedMode === 'pvp' || normalizedMode === 'pvp_ranked' || normalizedMode === 'ranked') {
    return {
      active: false,
      reason: 'COMPETITIVE_MODE_EXCLUDED',
      mode: normalizedMode,
      difficultyMultiplier: DDA_NEUTRAL_MULTIPLIER,
      enemySpeedMultiplier: DDA_NEUTRAL_MULTIPLIER,
      spawnRateMultiplier: DDA_NEUTRAL_MULTIPLIER,
      assistHintLevel: 0,
      bounds: { min: DDA_MIN_MULTIPLIER, max: DDA_MAX_MULTIPLIER }
    };
  }

  const safeWinRate = Number.isFinite(recentWinRate) ? clamp(recentWinRate, 0, 1) : 0.55;
  const safeLosses = Number.isFinite(consecutiveLosses) ? Math.max(0, Math.floor(consecutiveLosses)) : 0;
  const safeSessionMs = Number.isFinite(avgSessionMs) ? Math.max(0, avgSessionMs) : 180000;

  // Target flow-state win band centered around 0.55.
  const winOffset = (safeWinRate - 0.55) * 0.5;
  const lossRelief = safeLosses >= 2 ? Math.min(0.25, (safeLosses - 1) * 0.06) : 0;
  const shortSessionRelief = safeSessionMs > 0 && safeSessionMs < 60000 ? 0.05 : 0;

  const rawDifficulty = 1.0 + winOffset - lossRelief - shortSessionRelief;
  const difficultyMultiplier = round4(clamp(rawDifficulty, DDA_MIN_MULTIPLIER, DDA_MAX_MULTIPLIER));
  const enemySpeedMultiplier = round4(
    clamp(1.0 + (difficultyMultiplier - 1.0) * 0.8, DDA_MIN_MULTIPLIER, DDA_MAX_MULTIPLIER)
  );
  const spawnRateMultiplier = round4(
    clamp(1.0 + (difficultyMultiplier - 1.0) * 0.9, DDA_MIN_MULTIPLIER, DDA_MAX_MULTIPLIER)
  );

  let assistHintLevel = 0;
  if (safeLosses >= 3 || difficultyMultiplier <= 0.8) assistHintLevel = 2;
  else if (safeLosses >= 1 || difficultyMultiplier < 0.92) assistHintLevel = 1;

  return {
    active: true,
    reason: 'FLOW_STATE_ACTIVE',
    mode: normalizedMode,
    difficultyMultiplier,
    enemySpeedMultiplier,
    spawnRateMultiplier,
    assistHintLevel,
    bounds: { min: DDA_MIN_MULTIPLIER, max: DDA_MAX_MULTIPLIER }
  };
}
