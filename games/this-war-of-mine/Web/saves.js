import * as Core from './engine.js';
import * as Field from './expedition.js';

export const SAVE_KEY = 'last-light-campaign-v1';
export const BACKUP_KEY = 'last-light-backup-v1';
export const DAWN_KEY = 'last-light-dawn-v1';

function sameCampaign(a, b) {
  return a.seed === b.seed && (a.difficulty || 'standard') === (b.difficulty || 'standard');
}

export function decodeSnapshot(value) {
  if (typeof value === 'string') {
    if (value.length > 2000000) throw new Error('저장 파일은 2MB 이하여야 합니다.');
    try { value = JSON.parse(value); } catch { throw new Error('저장 파일의 형식을 읽을 수 없습니다.'); }
  }
  if (!value || value.schema !== 1 || !Core.isValidSave(value.state)) throw new Error('호환되지 않거나 손상된 생존 기록입니다.');
  const state = Core.restoreGame(value.state);
  let expedition = null;
  if (state.phase === 'expedition') {
    const source = value.expedition;
    if (!source || !Field.isValidExpedition(source)) throw new Error('수색 기록이 손상되었습니다.');
    expedition = Field.restoreExpedition ? Field.restoreExpedition(source) : structuredClone(source);
    if (!expedition || expedition.locationId !== state.nightPlan?.locationId || expedition.player.id !== state.nightPlan?.scavengerId) throw new Error('수색자와 장소 기록이 일치하지 않습니다.');
    const actor = state.characters.find(c => c.id === state.nightPlan.scavengerId);
    if (!actor || expedition.capacity !== actor.capacity || Core.usedSlots(expedition.bag) > actor.capacity) throw new Error('가방 용량이 생존자와 일치하지 않습니다.');
    if (expedition.done && !Core.finishNight(structuredClone(state), Field.expeditionResult(expedition)).ok) throw new Error('완료된 수색의 결과가 손상되었습니다.');
  }
  return { state, expedition, savedAt: typeof value.savedAt === 'string' ? value.savedAt : null };
}

export function encodeSnapshot(state, expedition = null) {
  const value = { schema: 1, state, expedition: state.phase === 'expedition' ? expedition : null, savedAt: new Date().toISOString() };
  decodeSnapshot(value);
  return JSON.stringify(value);
}

export function readCampaign(storage) {
  let primary;
  try { primary = storage.getItem(SAVE_KEY); } catch { return { status: 'unavailable', message: '브라우저 저장소를 사용할 수 없습니다. 파일로 기록을 보관하세요.' }; }
  if (!primary) return { status: 'empty' };
  try { return { ...decodeSnapshot(primary), status: 'loaded' }; } catch {}
  for (const key of [BACKUP_KEY, DAWN_KEY]) {
    try { const raw = storage.getItem(key); if (raw) return { ...decodeSnapshot(raw), status: 'recovered', message: '최근 자동 저장을 읽지 못해 정상 백업에서 복구했습니다.' }; } catch {}
  }
  return { status: 'invalid', message: '저장 기록을 읽지 못했습니다. 보관한 JSON 파일이 있다면 설정에서 불러올 수 있습니다.' };
}

export function writeCampaign(storage, state, expedition = null) {
  const serialized = encodeSnapshot(state, expedition);
  const previous = storage.getItem(SAVE_KEY);
  if (previous) {
    try { decodeSnapshot(previous); storage.setItem(BACKUP_KEY, previous); } catch {}
  }
  storage.setItem(SAVE_KEY, serialized);
  if (state.phase === 'day' && state.clock === 360 && !state.characters.some(c => c.job || c.queue?.length)) {
    let checkpoint = null;
    try { checkpoint = decodeSnapshot(storage.getItem(DAWN_KEY)); } catch {}
    if (!checkpoint || !sameCampaign(checkpoint.state, state) || checkpoint.state.day !== state.day) storage.setItem(DAWN_KEY, serialized);
  }
  return serialized;
}

export function startCampaign(storage, state) {
  if (state.day !== 1 || state.phase !== 'day' || state.clock !== 360 || state.characters.some(c => c.job || c.queue?.length)) throw new Error('새 생존기의 첫 아침만 초기 기록으로 보관할 수 있습니다.');
  const serialized = encodeSnapshot(state);
  // A deliberate new run replaces checkpoints even when its seed is repeated.
  storage.setItem(DAWN_KEY, serialized);
  storage.setItem(BACKUP_KEY, serialized);
  storage.setItem(SAVE_KEY, serialized);
  return serialized;
}

export function readDawn(storage, seed, difficulty = 'standard') {
  try { const value = decodeSnapshot(storage.getItem(DAWN_KEY)); return sameCampaign(value.state, {seed, difficulty}) ? value : null; } catch { return null; }
}
