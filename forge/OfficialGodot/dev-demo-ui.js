(function () {
  'use strict';

  const STORAGE_KEY = 'playhub.dev.testDemoUi';
  const ALLOWED_MODES = new Set(['dev', 'development', 'debug', 'test']);
  const rawMode = String(window.__PLAYFORGE_BUILD_MODE__ || 'debug').trim().toLowerCase();
  const included = window.__PLAYFORGE_DEV_DEMO_UI_INCLUDED__ === true
    || (window.__PLAYFORGE_DEV_DEMO_UI_INCLUDED__ !== false && ALLOWED_MODES.has(rawMode));

  if (!included) {
    return;
  }

  const buildMode = ALLOWED_MODES.has(rawMode) ? rawMode : 'debug';

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
      // Ignore storage failures
    }
  }

  try {
    const params = new URLSearchParams(location.search);
    if (params.has('devDemoUi')) {
      const qv = String(params.get('devDemoUi') || '').trim().toLowerCase();
      if (qv === '1' || qv === 'true' || qv === 'on') writeStored(true);
      else if (qv === '0' || qv === 'false' || qv === 'off') writeStored(false);
    }
  } catch {
    // Ignore URL errors
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
    window.dispatchEvent(new CustomEvent('playforge:dev-demo-ui-change', {
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

  async function pullAdminExperimentalFlag() {
    try {
      const res = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json().catch(() => null);
      if (data && typeof data.experimentalFeaturesEnabled === 'boolean') {
        syncFromServer(data.experimentalFeaturesEnabled);
      }
    } catch {
      // Standalone Forge without Hub proxy ignores /api/session errors
    }
  }

  // Ensure F5 refreshes cleanly even when editor canvas/controls are focused
  window.addEventListener('keydown', (event) => {
    if (event.key === 'F5' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      location.reload();
    }
  }, true);

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const next = event.newValue === '1';
    if (next === localEnabled) return;
    localEnabled = next;
    applyDocumentState();
    emitChange();
  });

  window.PlayForgeDevDemoUI = {
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
    document.addEventListener('DOMContentLoaded', () => {
      applyDocumentState();
      void pullAdminExperimentalFlag();
    }, { once: true });
  } else {
    void pullAdminExperimentalFlag();
  }
})();
