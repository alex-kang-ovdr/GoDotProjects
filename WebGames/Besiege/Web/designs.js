/** Named blueprint slots. Persistence and the current draft stay in the UI. */
import { MISSIONS } from './parts.js';
import { normalizeBlueprint } from './editor.js';

export const DESIGN_SLOT_LIMIT = 8;
export const DESIGN_NAME_LIMIT = 40;
const EPOCH = '1970-01-01T00:00:00.000Z';
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 128;
const nameLength = value => [...value].length;

function timestamp(value, fallback = EPOCH) {
  const milliseconds = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(milliseconds)) return fallback;
  try { return new Date(milliseconds).toISOString(); } catch { return fallback; }
}

function blueprint(value) {
  const checked = normalizeBlueprint(value);
  return { format: 'ironwood-design', version: 1,
    mission: MISSIONS.some(m => m.id === checked.mission) ? checked.mission : 'outpost',
    parts: checked.parts };
}

function storedName(value, fallback) {
  const cleaned = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
  return cleaned ? [...cleaned].slice(0, DESIGN_NAME_LIMIT).join('') : fallback;
}

function requestedName(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned && nameLength(cleaned) <= DESIGN_NAME_LIMIT && !/[\u0000-\u001f\u007f]/.test(cleaned) ? cleaned : null;
}

/**
 * Normalize each slot independently so one damaged slot cannot erase the rest.
 * A legacy quick save is copied only into a new/empty, not-yet-migrated store.
 * Every normalized result closes migration, even if the old save is absent or
 * invalid; deleting the migrated slot therefore cannot make it reappear.
 */
export function normalizeDesigns(raw, { legacySaved = null } = {}) {
  const compatible = isRecord(raw) && raw.version === 1;
  const migrated = compatible && raw.legacyMigrated === true;
  const slots = [], used = new Set();
  if (compatible && Array.isArray(raw.slots)) {
    for (const slot of raw.slots) {
      if (slots.length >= DESIGN_SLOT_LIMIT) break;
      if (!isRecord(slot) || !validId(slot.id) || used.has(slot.id)) continue;
      try {
        const checked = blueprint(slot.blueprint);
        slots.push({ id: slot.id, name: storedName(slot.name, `설계 ${slots.length + 1}`),
          updatedAt: timestamp(slot.updatedAt), blueprint: checked });
        used.add(slot.id);
      } catch { /* Reject only this malformed blueprint, keeping other slots. */ }
    }
  }
  if (!migrated && slots.length === 0 && legacySaved !== null) {
    try {
      slots.push({ id: 'slot-1', name: '이전 빠른 저장', updatedAt: timestamp(legacySaved?.savedAt), blueprint: blueprint(legacySaved) });
    } catch { /* A broken legacy save must not prevent the workshop opening. */ }
  }
  return { version: 1, slots, legacyMigrated: true };
}

/**
 * New saves use the first unused stable slot ID. Replacing a slot is possible
 * only with an explicit replaceId; a duplicate name never implies overwrite.
 * `now` is supplied by the caller to keep this module deterministic and pure.
 */
export function saveDesignSlot(store, design, { name, replaceId = null, now } = {}) {
  const current = normalizeDesigns(store);
  const fail = error => ({ ok: false, store: current, slotId: null, error });
  const index = replaceId === null ? -1 : current.slots.findIndex(slot => slot.id === replaceId);
  if (replaceId !== null && index < 0) return fail('교체할 설계 슬롯이 없습니다. 목록에서 다시 선택해 주세요.');
  if (replaceId === null && current.slots.length >= DESIGN_SLOT_LIMIT) return fail('설계 슬롯 8개가 모두 찼습니다. 교체할 슬롯을 명시적으로 선택하거나 하나를 삭제해 주세요.');
  const nextName = requestedName(name === undefined ? index >= 0 ? current.slots[index].name : '새 설계' : name);
  if (nextName === null) return fail('설계 이름을 1~40자로 입력해 주세요.');
  let checked;
  try { checked = blueprint(design); } catch (error) { return fail(error.message || '설계 데이터를 확인해 주세요.'); }
  let id = replaceId;
  if (id === null) {
    const used = new Set(current.slots.map(slot => slot.id));
    for (let i = 1; i <= DESIGN_SLOT_LIMIT; i++) if (!used.has(`slot-${i}`)) { id = `slot-${i}`; break; }
  }
  const slot = { id, name: nextName, updatedAt: timestamp(now, index >= 0 ? current.slots[index].updatedAt : EPOCH), blueprint: checked };
  const slots = [...current.slots];
  if (index >= 0) slots[index] = slot;
  else slots.push(slot);
  return { ok: true, store: { ...current, slots }, slotId: id, error: null };
}

export function renameDesignSlot(store, id, name, { now } = {}) {
  const current = normalizeDesigns(store);
  const index = current.slots.findIndex(slot => slot.id === id);
  if (index < 0) return { ok: false, store: current, slotId: null, error: '이름을 바꿀 설계 슬롯이 없습니다.' };
  const nextName = requestedName(name);
  if (nextName === null) return { ok: false, store: current, slotId: id, error: '설계 이름을 1~40자로 입력해 주세요.' };
  const slots = current.slots.map((slot, i) => i === index
    ? { ...slot, name: nextName, updatedAt: timestamp(now, slot.updatedAt) } : slot);
  return { ok: true, store: { ...current, slots }, slotId: id, error: null };
}

export function deleteDesignSlot(store, id) {
  const current = normalizeDesigns(store);
  if (!current.slots.some(slot => slot.id === id)) return { ok: false, store: current, slotId: null, error: '삭제할 설계 슬롯이 없습니다.' };
  return { ok: true, store: { ...current, slots: current.slots.filter(slot => slot.id !== id) }, slotId: id, error: null };
}

/** A caller can edit the returned blueprint without modifying the saved slot. */
export function getDesignSlot(store, id) {
  return normalizeDesigns(store).slots.find(slot => slot.id === id) || null;
}
