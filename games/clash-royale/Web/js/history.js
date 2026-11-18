import { Game } from './engine.js';
import { ReplayPlayer } from './session.js';

export const HISTORY_LIMIT = 8;
const clone = value => JSON.parse(JSON.stringify(value));
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,96}$/.test(value);

function cleanEntry(entry) {
  if (!entry || !validId(entry.id) || !entry.replay || !['player', 'enemy', 'draw'].includes(entry.replay.winner)) return null;
  try {
    new ReplayPlayer(entry.replay);
    return {
      id: entry.id, replay: clone(entry.replay),
      opponentId: ['bran', 'luna', 'sera'].includes(entry.opponentId) ? entry.opponentId : 'bran',
      stageId: typeof entry.stageId === 'string' && /^stage-[1-6]$/.test(entry.stageId) ? entry.stageId : null,
      arenaTheme: ['grove', 'dusk', 'frost'].includes(entry.arenaTheme) ? entry.arenaTheme : 'grove',
      savedAt: Number.isSafeInteger(entry.savedAt) && entry.savedAt >= 0 && entry.savedAt <= 8640000000000000 ? entry.savedAt : 0,
    };
  } catch { return null; }
}

/** Bounded local match history. This module never awards profile or campaign progress. */
export class BattleHistory {
  constructor(snapshot = null) {
    this.entries = [];
    this.seenIds = [];
    if (!snapshot || snapshot.version !== 1) return;
    if (Array.isArray(snapshot.entries)) {
      for (const entry of snapshot.entries.slice(0, HISTORY_LIMIT)) {
        const clean = cleanEntry(entry);
        if (clean && !this.entries.some(e => e.id === clean.id)) this.entries.push(clean);
      }
    }
    const seen = Array.isArray(snapshot.seenIds) ? snapshot.seenIds.filter(validId).slice(0, 128) : [];
    this.seenIds = [...new Set([...this.entries.map(e => e.id), ...seen])].slice(0, 128);
  }

  has(id) { return this.seenIds.includes(id); }

  add(game, metadata) {
    if (!(game instanceof Game) || game.practice || game.state.phase !== 'finished' || !validId(metadata?.id)) return false;
    if (this.has(metadata.id)) return false;
    const entry = cleanEntry({ ...metadata, replay: game.exportReplay() });
    if (!entry) return false;
    this.entries.unshift(entry);
    this.entries.length = Math.min(this.entries.length, HISTORY_LIMIT);
    this.seenIds = [entry.id, ...this.seenIds].slice(0, 128);
    return true;
  }

  get(id) { const entry = this.entries.find(e => e.id === id); return entry ? clone(entry) : null; }
  list() { return clone(this.entries); }
  exportSnapshot() { return clone({ version: 1, entries: this.entries, seenIds: this.seenIds }); }
}
