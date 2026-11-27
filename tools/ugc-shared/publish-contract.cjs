'use strict';

// Single Source of Truth (SSOT) for PlayForge <-> PlayHub UGC publishing contract primitives.
const crypto = require('node:crypto');

const GAME_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DEPLOY_MODES = new Set(['singleplay', 'mo', 'mmo']);
const SERVER_RUNTIMES = new Set(['none', 'relay-spatial-v1', 'node-wss-v1', 'godot-linux-wss-v1']);
const LOBBY_MODES = new Set(['stateless_ui', 'realtime_3d_lobby']);
const VISIBILITIES = new Set(['private', 'unlisted', 'public']);
const ALLOWED_CONTROLS = new Set(['keyboard', 'mouse', 'touch', 'gamepad']);
const ALLOWED_ORIENTATIONS = new Set(['landscape', 'portrait', 'any']);
const ALLOWED_RESIZE = new Set(['fit', 'fill', 'fixed']);
const SERVER_ENTRY_RE = /^[a-zA-Z0-9._/-]{1,128}$/;

function clampInt(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function clampFloat(val, min, max, fallback) {
  const n = Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeRelayConfig(raw = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    dimensions: clampInt(src.dimensions, 1, 3, 2),
    aoiRadius: clampFloat(src.aoiRadius, 0, 100000, 520),
    aoiHysteresis: clampFloat(src.aoiHysteresis, 0, 10000, 60),
    maxPlayersPerChannel: clampInt(src.maxPlayersPerChannel, 2, 256, 64),
    maxVisiblePeers: clampInt(src.maxVisiblePeers, 1, 128, 12),
    flushIntervalMs: clampInt(src.flushIntervalMs, 16, 500, 50),
    maxPayloadBytes: clampInt(src.maxPayloadBytes, 64, 4096, 1024),
    sharedRoomSeed: src.sharedRoomSeed !== false,
    extrapolateVelocity: Boolean(src.extrapolateVelocity),
    maxVelocity: clampFloat(src.maxVelocity, 0, 100000, 1000),
  };
}

function normalizeRuntimeConfig(raw = {}) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const entry = typeof src.serverEntry === 'string' && SERVER_ENTRY_RE.test(src.serverEntry) && !src.serverEntry.includes('..')
    ? src.serverEntry
    : '';
  const pck = typeof src.serverPck === 'string' && SERVER_ENTRY_RE.test(src.serverPck) && !src.serverPck.includes('..')
    ? src.serverPck
    : '';
  return {
    serverEntry: entry,
    serverPck: pck,
    maxPlayersPerSession: clampInt(src.maxPlayersPerSession, 2, 256, 18),
    tickRateHz: clampInt(src.tickRateHz, 1, 60, 20),
    idleSleepSec: clampInt(src.idleSleepSec, 30, 3600, 180),
    resultCommitEnabled: Boolean(src.resultCommitEnabled),
  };
}

function cleanText(value, maxLen, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maxLen) : fallback;
}

function slugifyGameId(raw, fallbackSeed = 'forge-game') {
  const base = typeof raw === 'string'
    ? raw.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase()
    : '';
  let slug = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/-{2,}/g, '-');
  if (!slug || !/^[a-z]/.test(slug)) {
    const suffix = crypto.createHash('sha256').update(String(raw || fallbackSeed)).digest('hex').slice(0, 8);
    slug = slug ? `g-${slug}` : `game-${suffix}`;
  }
  slug = slug.slice(0, 48).replace(/-+$/g, '');
  if (!GAME_ID_RE.test(slug)) {
    const suffix = crypto.createHash('sha256').update(String(fallbackSeed)).digest('hex').slice(0, 8);
    return `game-${suffix}`;
  }
  return slug;
}

module.exports = {
  GAME_ID_RE,
  DEPLOY_MODES,
  SERVER_RUNTIMES,
  LOBBY_MODES,
  VISIBILITIES,
  ALLOWED_CONTROLS,
  ALLOWED_ORIENTATIONS,
  ALLOWED_RESIZE,
  cleanText,
  slugifyGameId,
  normalizeRelayConfig,
  normalizeRuntimeConfig,
};
