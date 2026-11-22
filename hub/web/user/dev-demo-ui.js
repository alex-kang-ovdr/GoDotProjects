(function () {
  'use strict';

  const STORAGE_KEY = 'playhub.dev.testDemoUi';
  const ALLOWED_MODES = new Set(['dev', 'development', 'debug', 'test']);
  const conf = window.PLAYHUB_CONFIG || {};
  const rawMode = String(conf.buildMode || 'dev').trim().toLowerCase();
  const included = conf.includeDevDemoUi === true || (conf.includeDevDemoUi !== false && ALLOWED_MODES.has(rawMode));

  if (!included) {
    return;
  }

  const buildMode = ALLOWED_MODES.has(rawMode) ? rawMode : 'dev';

  function readStored() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function writeStored(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // Ignore storage quota / private mode failures
    }
  }

  // Optional query param sync (?devDemoUi=1 or ?devDemoUi=0) launched from Admin "실험기능 보기"
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('devDemoUi')) {
      const qv = String(params.get('devDemoUi') || '').trim().toLowerCase();
      if (qv === '1' || qv === 'true' || qv === 'on') writeStored(true);
      else if (qv === '0' || qv === 'false' || qv === 'off') writeStored(false);
    }
  } catch {
    // Ignore URL parsing errors
  }

  let localEnabled = readStored();
  let serverEnabled = false;
  let effectiveEnabled = Boolean(localEnabled || serverEnabled);

  function applyDocumentState() {
    effectiveEnabled = Boolean(localEnabled || serverEnabled);
    document.documentElement.dataset.buildMode = buildMode;
    document.documentElement.dataset.devDemoUi = effectiveEnabled ? 'on' : 'off';
    for (const el of document.querySelectorAll('[data-dev-demo-ui]')) {
      if (el === document.documentElement) continue;
      el.hidden = !effectiveEnabled;
    }
  }

  function emitChange() {
    window.dispatchEvent(new CustomEvent('playhub:dev-demo-ui-change', {
      detail: { enabled: effectiveEnabled, buildMode }
    }));
  }

  function setEnabled(next, { reload = false } = {}) {
    const value = Boolean(next);
    localEnabled = value;
    if (!value) serverEnabled = false;
    writeStored(value);
    applyDocumentState();
    emitChange();
    if (reload) {
      location.reload();
    }
    return effectiveEnabled;
  }

  function syncFromServer(nextServerEnabled) {
    const next = Boolean(nextServerEnabled);
    if (next === serverEnabled) return effectiveEnabled;
    const prevEffective = effectiveEnabled;
    serverEnabled = next;
    applyDocumentState();
    if (effectiveEnabled !== prevEffective) {
      emitChange();
    }
    return effectiveEnabled;
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const next = event.newValue === '1';
    if (next === localEnabled) return;
    localEnabled = next;
    applyDocumentState();
    emitChange();
  });

  window.PlayHubDevDemoUI = {
    STORAGE_KEY,
    isIncluded: () => true,
    getBuildMode: () => buildMode,
    isEnabled: () => effectiveEnabled,
    setEnabled,
    syncFromServer,
    toggle: () => setEnabled(!effectiveEnabled),
    refresh: () => location.reload(),
    syncDom: applyDocumentState
  };

  applyDocumentState();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyDocumentState, { once: true });
  }
})();
