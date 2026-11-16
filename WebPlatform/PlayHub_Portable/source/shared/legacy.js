(function () {
  'use strict';
  const gameId = document.currentScript.dataset.gameId;
  const maxStorageBytes = 2 * 1024 * 1024;
  const maxSaveLength = 65536;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const embedded = parent !== window && new URLSearchParams(location.hash.slice(1)).has('nonce');

  function memoryStorage(entries, onChange) {
    const values = new Map(entries);
    let size = 0;
    const bytes = value => encoder.encode(value).length;
    for (const [key, value] of values) size += bytes(key) + bytes(value);
    const storage = {
      get length() { return values.size; },
      key(index) { return [...values.keys()][Number(index) >>> 0] ?? null; },
      getItem(key) { return values.get(String(key)) ?? null; },
      setItem(key, value) {
        key = String(key); value = String(value);
        const previous = values.get(key);
        if (previous === value) return;
        const next = size + bytes(value) + (previous === undefined ? bytes(key) : -bytes(previous));
        if (next > maxStorageBytes) throw new DOMException('Game storage quota exceeded.', 'QuotaExceededError');
        values.set(key, value); size = next; onChange?.();
      },
      removeItem(key) {
        key = String(key);
        const value = values.get(key);
        if (!values.delete(key)) return;
        size -= bytes(key) + bytes(value); onChange?.();
      },
      clear() {
        if (!values.size) return;
        values.clear(); size = 0; onChange?.();
      }
    };
    return { storage, entries: () => [...values] };
  }

  async function convert(bytes, format, maximum) {
    const reader = new Blob([bytes]).stream().pipeThrough(format).getReader();
    const chunks = [];
    let length = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > maximum) throw new DOMException('Game save quota exceeded.', 'QuotaExceededError');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  }

  async function decodeSave(value) {
    if (!value) return [];
    if (value.gameId !== gameId || value.schemaVersion !== 1) throw new Error('Invalid game save identity.');
    let entries = value.legacyStorage;
    if (typeof value.legacyStorageGzip === 'string' && value.legacyStorageGzip.length <= maxSaveLength) {
      const bytes = Uint8Array.from(atob(value.legacyStorageGzip), char => char.charCodeAt(0));
      entries = JSON.parse(decoder.decode(await convert(bytes, new DecompressionStream('gzip'), maxStorageBytes * 7)));
    }
    if (!Array.isArray(entries) || !entries.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(value => typeof value === 'string')) ||
      entries.reduce((bytes, [key, value]) => bytes + encoder.encode(key).length + encoder.encode(value).length, 0) > maxStorageBytes) {
      throw new Error('Invalid game storage contents.');
    }
    return entries;
  }

  function report(code, error) {
    if (embedded) GameSDK.event('runtime_error', { code, message: String(error?.message || error) }).catch(() => {});
  }

  async function run() {
    let notice = null;
    function warn(message) {
      if (!notice) {
        notice = document.createElement('p');
        notice.setAttribute('role', 'status');
        notice.style.cssText = 'position:fixed;z-index:2147483647;bottom:8px;left:8px;margin:0;padding:8px 12px;border-radius:6px;background:#171717;color:#fff;font:12px/1.4 sans-serif;pointer-events:none';
        document.body.append(notice);
      }
      notice.textContent = message;
    }
    let saved = null;
    let initial = [];
    let writable = false;
    if (embedded) {
      try {
        saved = (await GameSDK.load()).value;
        initial = await decodeSave(saved);
        writable = true;
      } catch (error) {
        report('LEGACY_LOAD_FAILED', error);
        warn('기존 저장을 불러오지 못했습니다. 이번 진행은 이 게임 화면에만 남습니다.');
      }
    }

    let revision = 0, timer = null, saving = false;
    const local = memoryStorage(initial, () => {
      revision++;
      if (writable && !timer && !saving) timer = setTimeout(persist, 500);
    });
    async function snapshot() {
      if (!writable || (!saved && revision === 0)) return null;
      const identity = { gameId, schemaVersion: 1 };
      const entries = local.entries();
      const ordinary = { ...identity, legacyStorage: entries };
      if (JSON.stringify(ordinary).length <= maxSaveLength) return ordinary;
      const bytes = await convert(encoder.encode(JSON.stringify(entries)), new CompressionStream('gzip'), Math.floor((maxSaveLength - 150) * 3 / 4));
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return { ...identity, legacyStorageGzip: btoa(binary) };
    }
    async function persist() {
      timer = null;
      saving = true;
      const version = revision;
      try {
        const value = await snapshot();
        if (value && version === revision) {
          await GameSDK.save(value);
          notice?.remove(); notice = null;
        }
      } catch (error) {
        report('LEGACY_SAVE_FAILED', error);
        warn('PlayHub에 저장하지 못했습니다. 이번 진행은 이 게임 화면에 남아 있습니다.');
      }
      finally {
        saving = false;
        if (version !== revision) timer = setTimeout(persist, 500);
      }
    }
    Object.defineProperties(window, {
      localStorage: { configurable: true, value: local.storage },
      sessionStorage: { configurable: true, value: memoryStorage([]).storage }
    });
    if (embedded) GameSDK.onSnapshot(async () => {
      try { return await snapshot(); }
      catch (error) { report('LEGACY_SAVE_FAILED', error); return null; }
    });

    for (const marker of document.querySelectorAll('script[type="application/x-playhub-script"]')) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.async = false;
        script.onload = resolve;
        script.onerror = () => reject(new Error('게임 파일을 불러오지 못했습니다. ' + marker.dataset.src));
        script.src = marker.dataset.src;
        marker.replaceWith(script);
      });
    }
    if (embedded) await GameSDK.ready();
  }

  run().catch(error => {
    report('LEGACY_BOOT_FAILED', error);
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = '게임을 시작하지 못했습니다. 게임을 닫고 다시 열어 주세요.';
    document.body.prepend(message);
  });
})();
