// N7 Infrastructure Margin & UX ML:
// 1. Desktop Shader Hitch Prioritizer (Steam/Fossilize R2 CAS prewarm ranking)
//    HitchImpactScore = P95(cold - warm) * cold_sessions * (1 + avg_hitch_100ms)
// 2. Multiplayer Warm Pool Demand Forecaster & Predictive Burn-Rate Alerting
//    Leverages mmo_room_telemetry + leading indicator social_party_launches.

import { ApiError, uid } from '../security.mjs';
import { ensureTrustSchema } from './schema.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;

function safeText(value, field, maxLen = 128) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLen) {
    throw new ApiError(422, 'SHADER_TELEMETRY_INVALID', `유효한 ${field} 값이 필요합니다.`);
  }
  return value.trim();
}

function nonNegNumber(value, field, defaultVal = 0) {
  if (value === undefined || value === null) return defaultVal;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ApiError(422, 'SHADER_TELEMETRY_INVALID', `${field}는 0 이상의 숫자여야 합니다.`);
  }
  return n;
}

function nonNegInt(value, field, defaultVal = 0) {
  const n = nonNegNumber(value, field, defaultVal);
  return Math.floor(n);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  const weight = rank - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function hasTable(db, tableName) {
  return Boolean(
    db && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(tableName)
  );
}

export function recordShaderTelemetry(db, payload, { now = Date.now } = {}) {
  ensureTrustSchema(db);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(422, 'SHADER_TELEMETRY_INVALID', '유효한 셰이더 텔레메트리 JSON 객체가 필요합니다.');
  }
  const gameId = safeText(payload.gameId ?? payload.game_id, 'gameId', 96);
  const gameVersion = safeText(payload.gameVersion ?? payload.game_version ?? '0.0.0', 'gameVersion', 64);
  const engineVersion = safeText(payload.engineVersion ?? payload.engine_version ?? '4.7', 'engineVersion', 64);
  const renderer = safeText(payload.renderer ?? 'vulkan', 'renderer', 64);
  const gpuVendor = safeText(payload.gpuVendor ?? payload.gpu_vendor ?? 'unknown', 'gpuVendor', 64);
  const gpuName = safeText(payload.gpuName ?? payload.gpu_name ?? 'unknown', 'gpuName', 128);
  const driverVersion = safeText(payload.driverVersion ?? payload.driver_version ?? 'unknown', 'driverVersion', 64);

  const rawCold = payload.coldStart ?? payload.cold_start;
  if (typeof rawCold !== 'boolean' && rawCold !== 0 && rawCold !== 1) {
    throw new ApiError(422, 'SHADER_TELEMETRY_INVALID', 'coldStart(boolean) 값이 필요합니다.');
  }
  const coldStart = rawCold === true || rawCold === 1 ? 1 : 0;

  const firstFrameMs = nonNegNumber(payload.firstFrameMs ?? payload.first_frame_ms, 'firstFrameMs');
  const frameP95Ms = nonNegNumber(payload.frameP95Ms ?? payload.frame_p95_ms, 'frameP95Ms', 0);
  const frameP99Ms = nonNegNumber(payload.frameP99Ms ?? payload.frame_p99_ms, 'frameP99Ms', 0);
  const maxFrameMs = nonNegNumber(payload.maxFrameMs ?? payload.max_frame_ms, 'maxFrameMs', 0);
  const hitch50ms = nonNegInt(payload.hitch50ms ?? payload.hitch_50ms, 'hitch50ms', 0);
  const hitch100ms = nonNegInt(payload.hitch100ms ?? payload.hitch_100ms, 'hitch100ms', 0);

  const rawPipelines = payload.pipelineCounts ?? payload.pipeline_counts ?? {};
  const pipelineCountsJson = JSON.stringify(
    rawPipelines && typeof rawPipelines === 'object' && !Array.isArray(rawPipelines) ? rawPipelines : {}
  );
  if (pipelineCountsJson.length > 8192) {
    throw new ApiError(422, 'SHADER_TELEMETRY_INVALID', 'pipelineCounts 크기가 허용 범위를 초과했습니다.');
  }

  const stamp = typeof now === 'function' ? now() : Number(now) || Date.now();
  const id = uid();
  db.prepare(`
    INSERT INTO desktop_shader_telemetry(
      id, game_id, game_version, engine_version, renderer,
      gpu_vendor, gpu_name, driver_version, cold_start, first_frame_ms,
      frame_p95_ms, frame_p99_ms, max_frame_ms, hitch_50ms, hitch_100ms,
      pipeline_counts_json, created_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, gameId, gameVersion, engineVersion, renderer,
    gpuVendor, gpuName, driverVersion, coldStart, firstFrameMs,
    frameP95Ms, frameP99Ms, maxFrameMs, hitch50ms, hitch100ms,
    pipelineCountsJson, stamp
  );

  return {
    id,
    gameId,
    gameVersion,
    engineVersion,
    renderer,
    gpuVendor,
    gpuName,
    driverVersion,
    coldStart: coldStart === 1,
    firstFrameMs,
    hitch100ms,
    createdAt: new Date(stamp).toISOString()
  };
}

export function rankShaderPrewarmPriorities(db, { days = 7, limit = 20, now = Date.now } = {}) {
  ensureTrustSchema(db);
  const safeDays = Math.max(1, Math.min(90, Number(days) || 7));
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));
  const stamp = typeof now === 'function' ? now() : Number(now) || Date.now();
  const cutoff = stamp - safeDays * DAY_MS;

  const rows = db.prepare(`
    SELECT game_id, engine_version, renderer, gpu_vendor, gpu_name, driver_version,
           cold_start, first_frame_ms, hitch_50ms, hitch_100ms
    FROM desktop_shader_telemetry
    WHERE created_at >= ?
  `).all(cutoff);

  const groups = new Map();
  for (const row of rows) {
    const key = [
      row.game_id,
      row.engine_version,
      row.renderer,
      row.gpu_vendor,
      row.gpu_name,
      row.driver_version
    ].join('|');
    let g = groups.get(key);
    if (!g) {
      g = {
        gameId: row.game_id,
        engineVersion: row.engine_version,
        renderer: row.renderer,
        gpuVendor: row.gpu_vendor,
        gpuName: row.gpu_name,
        driverVersion: row.driver_version,
        coldFrames: [],
        warmFrames: [],
        coldHitch100: []
      };
      groups.set(key, g);
    }
    if (row.cold_start === 1) {
      g.coldFrames.push(Number(row.first_frame_ms || 0));
      g.coldHitch100.push(Number(row.hitch_100ms || 0));
    } else {
      g.warmFrames.push(Number(row.first_frame_ms || 0));
    }
  }

  const ranked = [];
  for (const g of groups.values()) {
    const coldSessions = g.coldFrames.length;
    const warmSessions = g.warmFrames.length;
    if (coldSessions === 0) continue;

    const warmBaselineMs = warmSessions > 0 ? percentile(g.warmFrames, 50) : 0;
    const coldDeltas = g.coldFrames.map(ms => Math.max(0, ms - warmBaselineMs));
    const p95ColdMinusWarmMs = percentile(coldDeltas, 95);
    const p95ColdFirstFrameMs = percentile(g.coldFrames, 95);
    const avgHitch100ms = g.coldHitch100.reduce((sum, v) => sum + v, 0) / coldSessions;

    // Blueprint formula: HitchImpactScore = P95(cold - warm) * cold_sessions * (1 + avg_hitch_100ms)
    const hitchImpactScore = round2(p95ColdMinusWarmMs * coldSessions * (1 + avgHitch100ms));

    ranked.push({
      gameId: g.gameId,
      engineVersion: g.engineVersion,
      renderer: g.renderer,
      gpuVendor: g.gpuVendor,
      gpuName: g.gpuName,
      driverVersion: g.driverVersion,
      coldSessions,
      warmSessions,
      p50WarmFirstFrameMs: round2(warmBaselineMs),
      p95ColdFirstFrameMs: round2(p95ColdFirstFrameMs),
      p95ColdMinusWarmMs: round2(p95ColdMinusWarmMs),
      avgHitch100ms: round2(avgHitch100ms),
      hitchImpactScore,
      fossilizePrewarmRecommended: hitchImpactScore > 0
    });
  }

  ranked.sort((a, b) =>
    b.hitchImpactScore - a.hitchImpactScore ||
    b.p95ColdMinusWarmMs - a.p95ColdMinusWarmMs ||
    a.gameId.localeCompare(b.gameId)
  );

  return {
    windowDays: safeDays,
    generatedAt: new Date(stamp).toISOString(),
    totalGroups: ranked.length,
    items: ranked.slice(0, safeLimit)
  };
}

export function recordMmoRoomTelemetry(db, payload, { now = Date.now } = {}) {
  ensureTrustSchema(db);
  const stamp = typeof now === 'function' ? now() : Number(now) || Date.now();
  const id = uid();
  const roomId = safeText(payload.roomId ?? payload.room_id, 'roomId', 128);
  const gameId = safeText(payload.gameId ?? payload.game_id, 'gameId', 96);
  const isParty = payload.isParty || payload.is_party ? 1 : 0;
  const onlineCount = nonNegInt(payload.onlineCount ?? payload.online_count, 'onlineCount', 0);
  const botCount = nonNegInt(payload.botCount ?? payload.bot_count, 'botCount', 0);
  const rttP50Ms = nonNegNumber(payload.rttP50Ms ?? payload.rtt_p50_ms, 'rttP50Ms', 0);
  const rttP95Ms = nonNegNumber(payload.rttP95Ms ?? payload.rtt_p95_ms, 'rttP95Ms', 0);
  const eventsDelta = nonNegInt(payload.eventsReceivedDelta ?? payload.events_received_delta, 'eventsReceivedDelta', 0);
  const sampledAt = Number.isFinite(Number(payload.sampledAt ?? payload.sampled_at))
    ? Number(payload.sampledAt ?? payload.sampled_at)
    : stamp;

  db.prepare(`
    INSERT INTO mmo_room_telemetry(
      id, room_id, game_id, is_party, online_count, bot_count,
      rtt_p50_ms, rtt_p95_ms, events_received_delta, sampled_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, roomId, gameId, isParty, onlineCount, botCount, rttP50Ms, rttP95Ms, eventsDelta, sampledAt);

  return { id, roomId, gameId, onlineCount, botCount, sampledAt };
}

export function forecastWarmPoolDemand(
  db,
  {
    gameId,
    recentRoomSamples = null,
    activePartyLaunches = null,
    currentBurnRatePerHour = 0,
    remainingPoints = null,
    playersPerWarmNode = 15,
    targetPackingEfficiency = 0.75,
    now = Date.now
  } = {}
) {
  const stamp = typeof now === 'function' ? now() : Number(now) || Date.now();
  let samples = Array.isArray(recentRoomSamples) ? recentRoomSamples : null;

  if (!samples && db && hasTable(db, 'mmo_room_telemetry') && gameId) {
    const windowStart = stamp - 60 * 60 * 1000;
    samples = db.prepare(`
      SELECT room_id, is_party, online_count, bot_count, rtt_p50_ms, rtt_p95_ms,
             events_received_delta, sampled_at
      FROM mmo_room_telemetry
      WHERE game_id = ? AND sampled_at >= ?
      ORDER BY sampled_at ASC
    `).all(gameId, windowStart);
  }
  samples = samples || [];

  let partyLaunches = activePartyLaunches;
  if (partyLaunches === null || partyLaunches === undefined) {
    if (db && hasTable(db, 'social_party_launches') && gameId) {
      const recentWindow = stamp - 5 * 60 * 1000;
      const row = db.prepare(
        "SELECT COUNT(*) AS cnt FROM social_party_launches WHERE game_id=? AND status='active' AND created_at>=?"
      ).get(gameId, recentWindow);
      partyLaunches = Number(row?.cnt || 0);
    } else {
      partyLaunches = 0;
    }
  }
  partyLaunches = Math.max(0, Math.floor(Number(partyLaunches) || 0));

  const onlineSeries = samples.map(s => Math.max(0, Number(s.onlineCount ?? s.online_count ?? 0)));
  const currentOnline = onlineSeries.length ? onlineSeries[onlineSeries.length - 1] : 0;
  const peakOnline = onlineSeries.length ? Math.max(...onlineSeries) : 0;
  const avgOnline = onlineSeries.length
    ? onlineSeries.reduce((a, b) => a + b, 0) / onlineSeries.length
    : 0;
  const upwardTrend = onlineSeries.length >= 2
    ? Math.max(0, onlineSeries[onlineSeries.length - 1] - onlineSeries[0])
    : 0;

  // Leading indicator: social_party_launches precedes WebSocket room joins by 5-30s (~4 players/party)
  const leadingPartyPlayers = partyLaunches * 4;
  const forecastedCcu = Math.ceil(Math.max(currentOnline, peakOnline, avgOnline) + upwardTrend * 0.5 + leadingPartyPlayers);

  const effectiveNodeCapacity = Math.max(1, Math.floor(playersPerWarmNode * targetPackingEfficiency));
  const recommendedWarmNodes = forecastedCcu > 0 || partyLaunches > 0
    ? Math.max(1, Math.ceil(forecastedCcu / effectiveNodeCapacity))
    : 0;
  const prewarmPckRecommended = partyLaunches > 0 || upwardTrend >= 8 || forecastedCcu >= effectiveNodeCapacity;

  const baseBurn = Math.max(0, Number(currentBurnRatePerHour) || 0);
  const baselineDemand = Math.max(1, currentOnline || avgOnline || 1);
  const surgeRatio = forecastedCcu > baselineDemand
    ? Math.min(5, forecastedCcu / baselineDemand)
    : (partyLaunches > 0 ? 1 + Math.min(2, partyLaunches * 0.25) : 1);
  const projectedBurnRatePerHour = round2(baseBurn * surgeRatio);

  let projectedRunwayHours = null;
  let burnAlertTier = 'OK';
  if (remainingPoints !== null && remainingPoints !== undefined && Number.isFinite(Number(remainingPoints))) {
    const rem = Number(remainingPoints);
    if (rem <= 0) {
      projectedRunwayHours = 0;
      burnAlertTier = 'CRITICAL';
    } else if (projectedBurnRatePerHour > 0) {
      projectedRunwayHours = round2(rem / projectedBurnRatePerHour);
      if (projectedRunwayHours <= 2) burnAlertTier = 'CRITICAL';
      else if (projectedRunwayHours <= 24) burnAlertTier = 'URGENT';
      else if (projectedRunwayHours <= 72) burnAlertTier = 'WARNING';
      else burnAlertTier = 'OK';
    }
  }

  return {
    gameId: gameId || null,
    sampleCount: samples.length,
    currentOnline,
    activePartyLaunches: partyLaunches,
    forecastedCcu,
    recommendedWarmNodes,
    prewarmPckRecommended,
    projectedBurnRatePerHour,
    projectedRunwayHours,
    burnAlertTier
  };
}
