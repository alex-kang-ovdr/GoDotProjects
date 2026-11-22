'use strict';

// Single Source of Truth (SSOT) for PlayForge <-> PlayHub UGC publishing contract primitives.
const crypto = require('node:crypto');

const GAME_ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DEPLOY_MODES = new Set(['singleplay', 'mo', 'mmo']);
const SERVER_RUNTIMES = new Set(['none', 'node-wss-v1', 'godot-linux-wss-v1']);
const LOBBY_MODES = new Set(['stateless_ui', 'realtime_3d_lobby']);
const VISIBILITIES = new Set(['private', 'unlisted', 'public']);
const ALLOWED_CONTROLS = new Set(['keyboard', 'mouse', 'touch', 'gamepad']);
const ALLOWED_ORIENTATIONS = new Set(['landscape', 'portrait', 'any']);
const ALLOWED_RESIZE = new Set(['fit', 'fill', 'fixed']);

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
};
