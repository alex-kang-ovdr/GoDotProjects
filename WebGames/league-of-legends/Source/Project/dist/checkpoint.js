/* Nexus Front: one bounded, versioned, resumable match slot. */
(function (root) {
  'use strict';

  const KEY = 'nexus-front-checkpoint';
  const SCHEMA = 1;
  const MAX_BYTES = 2 * 1024 * 1024;
  const MILESTONES = ['equipment', 'move', 'skill', 'cs', 'growth', 'structure'];
  const ownObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const finite = value => typeof value === 'number' && Number.isFinite(value);

  function engine() {
    let api = root.NexusGame;
    if (!api && typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      api = require('./game.js');
    }
    if (!api || typeof api.Game?.fromState !== 'function') {
      const error = new Error('경기 복원 기능을 불러오지 못했습니다.');
      error.unavailable = true;
      throw error;
    }
    return api.Game;
  }

  function utf8Bytes(value) {
    let count = 0;
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code < 0x80) count++;
      else if (code < 0x800) count += 2;
      else if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length &&
        value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { count += 4; i++; }
      else count += 3;
    }
    return count;
  }

  function normalizeUI(value) {
    const ui = { speed: value?.speed === 2 ? 2 : 1 };
    const journey = ownObject(value) && ownObject(value.journey) ? value.journey : null;
    if (journey?.version === 1 && ownObject(journey.origin) &&
      finite(journey.origin.x) && journey.origin.x >= 0 && journey.origin.x <= 1600 &&
      finite(journey.origin.y) && journey.origin.y >= 0 && journey.origin.y <= 1600) {
      const completed = {};
      for (const id of MILESTONES) completed[id] = journey.completed?.[id] === true;
      ui.journey = { version: 1, origin: { x: journey.origin.x, y: journey.origin.y }, completed };
    }
    return ui;
  }

  function validate(value, validateEngine) {
    if (!ownObject(value) || value.version !== SCHEMA || !finite(value.savedAt) ||
      value.savedAt < 0 || value.savedAt > 8640000000000000 ||
      !ownObject(value.state) || value.state.version !== 1 || ![4, 5, 6].includes(value.state.engineVersion)) {
      throw new Error('지원하지 않거나 손상된 경기 저장 형식입니다.');
    }
    if (validateEngine) engine().fromState(value.state);
    return { version: SCHEMA, savedAt: Math.floor(value.savedAt), state: value.state, ui: normalizeUI(value.ui) };
  }

  function parse(value, validateEngine) {
    if (typeof value !== 'string' || utf8Bytes(value) > MAX_BYTES) {
      throw new Error('경기 저장 데이터가 허용 크기를 초과했습니다.');
    }
    return validate(JSON.parse(value), validateEngine);
  }

  function storageOrDefault(storage) {
    // Access to the localStorage property itself can throw in restricted contexts.
    return storage === undefined ? root.localStorage : storage;
  }

  function read(storage) {
    let raw;
    try {
      const target = storageOrDefault(storage);
      if (!target || typeof target.getItem !== 'function') throw new Error('Storage unavailable');
      raw = target.getItem(KEY);
    } catch (_) {
      return { status: 'unavailable', reason: '브라우저 저장소에 접근할 수 없습니다. 이 환경에서는 경기 이어하기를 사용할 수 없습니다.' };
    }
    if (raw === null || raw === undefined) return { status: 'empty' };
    try {
      return { status: 'ready', checkpoint: parse(raw, true) };
    } catch (error) {
      return { status: error.unavailable ? 'unavailable' : 'invalid',
        reason: error.unavailable ? error.message : '저장된 경기가 손상되었거나 현재 버전과 맞지 않아 이어 할 수 없습니다.' };
    }
  }

  function write(storage, game, ui, now) {
    if (!game || !game.started || game.over || typeof game.exportState !== 'function') {
      return { ok: false, reason: '진행 중인 경기만 저장할 수 있습니다.' };
    }
    let checkpoint, raw;
    try {
      const savedAt = now === undefined ? Date.now() : now;
      // Serialize once to detach every nested field, then prove the export can
      // actually be restored before replacing the one previous good slot.
      raw = JSON.stringify({ version: SCHEMA, savedAt, state: game.exportState(), ui: normalizeUI(ui) });
      checkpoint = parse(raw, true);
    } catch (_) {
      return { ok: false, reason: '경기 상태를 저장 형식으로 변환하지 못했습니다.' };
    }
    try {
      const target = storageOrDefault(storage);
      if (!target || typeof target.setItem !== 'function') throw new Error('Storage unavailable');
      // A single localStorage setItem is atomic. Never remove the prior slot first.
      target.setItem(KEY, raw);
      return { ok: true, checkpoint };
    } catch (_) {
      return { ok: false, reason: '브라우저 저장 공간이 부족하거나 저장이 허용되지 않아 경기를 저장하지 못했습니다.' };
    }
  }

  function remove(storage) {
    try {
      const target = storageOrDefault(storage);
      if (!target || typeof target.removeItem !== 'function') throw new Error('Storage unavailable');
      target.removeItem(KEY);
      return { ok: true };
    } catch (_) {
      return { ok: false, reason: '저장된 경기를 지우지 못했습니다. 브라우저 저장소 접근을 확인하세요.' };
    }
  }

  function restore(value) {
    try {
      // Callers may retain/mutate a read result; re-check and detach it on activation.
      const checkpoint = parse(JSON.stringify(value), false);
      const game = engine().fromState(checkpoint.state);
      return { ok: true, game, ui: checkpoint.ui };
    } catch (error) {
      return { ok: false, reason: error.unavailable ? error.message : '저장된 경기를 복원하지 못했습니다. 새 경기를 시작할 수 있습니다.' };
    }
  }

  const api = { KEY, SCHEMA, MAX_BYTES, read, write, remove, restore };
  root.NexusCheckpoint = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
