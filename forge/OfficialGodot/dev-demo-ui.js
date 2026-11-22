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
  const modeBadgeLabel = buildMode === 'debug' ? 'DEBUG' : buildMode === 'test' ? 'TEST' : 'DEV';

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

  let enabled = readStored();

  function applyDocumentState() {
    document.documentElement.dataset.buildMode = buildMode;
    document.documentElement.dataset.devDemoUi = enabled ? 'on' : 'off';

    for (const el of document.querySelectorAll('[data-dev-demo-ui]')) {
      el.hidden = !enabled;
    }

    const topBtn = document.getElementById('forge-dev-demo-toggle');
    if (topBtn) {
      topBtn.setAttribute('aria-pressed', String(enabled));
      topBtn.dataset.state = enabled ? 'on' : 'off';
      topBtn.textContent = `${modeBadgeLabel} · 테스트/데모 ${enabled ? 'ON' : 'OFF'}`;
    }

    const editorBtn = document.getElementById('forge-editor-dev-demo-toggle');
    if (editorBtn) {
      editorBtn.setAttribute('aria-pressed', String(enabled));
      editorBtn.dataset.state = enabled ? 'on' : 'off';
      editorBtn.textContent = `${modeBadgeLabel} · 데모 ${enabled ? 'ON' : 'OFF'}`;
    }

    const checkbox = document.getElementById('forge-dev-demo-checkbox');
    if (checkbox) checkbox.checked = enabled;

    const statePill = document.getElementById('forge-dev-demo-state');
    if (statePill) {
      statePill.textContent = enabled ? 'ON (표시)' : 'OFF (숨김)';
      statePill.dataset.state = enabled ? 'on' : 'off';
    }
  }

  function setEnabled(next, { reload = false } = {}) {
    const value = Boolean(next);
    enabled = value;
    writeStored(value);
    applyDocumentState();
    window.dispatchEvent(new CustomEvent('playforge:dev-demo-ui-change', {
      detail: { enabled: value, buildMode }
    }));
    if (reload) {
      location.reload();
    }
    return value;
  }

  function mountControls() {
    // 1. PlayForge Creator Hub (OfficialGodot/index.html)
    const topActions = document.querySelector('.forge-topbar-actions');
    if (topActions && !document.getElementById('forge-dev-demo-toggle')) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.id = 'forge-dev-demo-toggle';
      toggleBtn.className = 'forge-dev-demo-pill';
      toggleBtn.dataset.testid = 'forge-dev-demo-toggle';
      toggleBtn.addEventListener('click', () => setEnabled(!enabled));
      topActions.prepend(toggleBtn);
    }

    const sidebar = document.querySelector('.forge-sidebar');
    if (sidebar && !document.getElementById('forge-dev-demo-panel')) {
      const panel = document.createElement('div');
      panel.id = 'forge-dev-demo-panel';
      panel.className = 'forge-dev-demo-card';
      panel.dataset.testid = 'forge-dev-demo-panel';
      panel.innerHTML = `
        <div class="forge-dev-demo-card-head">
          <span class="forge-dev-build-badge">${modeBadgeLabel}</span>
          <span id="forge-dev-demo-state" class="forge-dev-state-pill"></span>
        </div>
        <label class="forge-dev-demo-switch" for="forge-dev-demo-checkbox">
          <input type="checkbox" id="forge-dev-demo-checkbox" data-testid="forge-dev-demo-checkbox">
          <span>테스트·데모 UI 표시</span>
        </label>
        <p class="forge-dev-demo-note">Dev · Debug · Test 빌드 전용 (기본 OFF · F5 새로고침 유지)</p>
        <button type="button" class="forge-dev-refresh-btn" id="forge-dev-demo-refresh" data-testid="forge-dev-demo-refresh">F5 새로고침</button>
      `;
      sidebar.append(panel);
      const cb = panel.querySelector('#forge-dev-demo-checkbox');
      cb?.addEventListener('change', () => setEnabled(cb.checked));
      panel.querySelector('#forge-dev-demo-refresh')?.addEventListener('click', () => location.reload());
    }

    // 2. PlayForge Web Editor (OfficialGodot/editor.html)
    const editorActions = document.getElementById('actions');
    if (editorActions && !document.getElementById('forge-editor-dev-demo-toggle')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'forge-editor-dev-demo-toggle';
      btn.dataset.testid = 'forge-editor-dev-demo-toggle';
      btn.addEventListener('click', () => setEnabled(!enabled));
      const f5Btn = document.createElement('button');
      f5Btn.type = 'button';
      f5Btn.id = 'forge-editor-f5-refresh';
      f5Btn.textContent = 'F5 새로고침';
      f5Btn.addEventListener('click', () => location.reload());
      editorActions.prepend(f5Btn);
      editorActions.prepend(btn);
    }

    applyDocumentState();
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
    if (next === enabled) return;
    enabled = next;
    applyDocumentState();
    window.dispatchEvent(new CustomEvent('playforge:dev-demo-ui-change', {
      detail: { enabled, buildMode }
    }));
  });

  window.PlayForgeDevDemoUI = {
    STORAGE_KEY,
    isIncluded: () => true,
    getBuildMode: () => buildMode,
    isEnabled: () => enabled,
    setEnabled,
    toggle: () => setEnabled(!enabled),
    refresh: () => location.reload(),
    syncDom: applyDocumentState
  };

  applyDocumentState();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountControls, { once: true });
  } else {
    mountControls();
  }
})();
