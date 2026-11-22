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
      // Ignore storage quota / private mode failures
    }
  }

  // Optional query param sync (?devDemoUi=1 or ?devDemoUi=0) in dev/debug/test builds
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

  let enabled = readStored();

  function applyDocumentState() {
    document.documentElement.dataset.buildMode = buildMode;
    document.documentElement.dataset.devDemoUi = enabled ? 'on' : 'off';
    const checkbox = document.getElementById('dev-demo-ui-toggle');
    if (checkbox) checkbox.checked = enabled;
    const stateLabel = document.getElementById('dev-demo-ui-state');
    if (stateLabel) {
      stateLabel.textContent = enabled ? 'ON · 테스트/데모 UI 표시 중' : 'OFF · 숨김 (기본값)';
      stateLabel.dataset.state = enabled ? 'on' : 'off';
    }
    const navBtn = document.getElementById('dev-demo-nav-toggle');
    if (navBtn) {
      navBtn.setAttribute('aria-pressed', String(enabled));
      navBtn.dataset.state = enabled ? 'on' : 'off';
      navBtn.textContent = `${modeBadgeLabel} · 데모 ${enabled ? 'ON' : 'OFF'}`;
      navBtn.title = enabled
        ? '테스트·데모 UI 표시 중 (클릭하여 OFF, F5 새로고침 시 유지)'
        : '테스트·데모 UI 숨김 (클릭하여 ON, F5 새로고침 시 유지)';
    }
    for (const el of document.querySelectorAll('[data-dev-demo-ui]')) {
      el.hidden = !enabled;
    }
  }

  function setEnabled(next, { reload = false } = {}) {
    const value = Boolean(next);
    enabled = value;
    writeStored(value);
    applyDocumentState();
    window.dispatchEvent(new CustomEvent('playhub:dev-demo-ui-change', {
      detail: { enabled: value, buildMode }
    }));
    if (typeof window.PlayHubToast === 'function') {
      window.PlayHubToast(
        value
          ? `${modeBadgeLabel} 테스트·데모 UI를 ON으로 변경했습니다. (F5 새로고침 후에도 유지)`
          : `${modeBadgeLabel} 테스트·데모 UI를 OFF로 변경했습니다.`
      );
    }
    if (reload) {
      location.reload();
    }
    return value;
  }

  function mountControls() {
    // 1. Account page developer settings surface
    const accountPanel = document.getElementById('account-panel');
    if (accountPanel && !document.getElementById('dev-demo-settings-card')) {
      const section = document.createElement('section');
      section.id = 'dev-demo-settings-card';
      section.className = 'surface dev-demo-settings-card';
      section.dataset.testid = 'dev-demo-settings';
      section.setAttribute('aria-labelledby', 'dev-demo-settings-heading');
      section.innerHTML = `
        <div class="dev-demo-settings-head">
          <div>
            <span class="dev-demo-build-badge">${modeBadgeLabel} BUILD</span>
            <h2 id="dev-demo-settings-heading">개발자 설정 · 테스트/데모 UI</h2>
          </div>
          <span id="dev-demo-ui-state" class="dev-demo-state-pill" data-state="${enabled ? 'on' : 'off'}"></span>
        </div>
        <p class="muted">Dev · Debug · Test 빌드에서만 포함됩니다. 기본값은 <strong>OFF</strong>이며, ON으로 변경하면 데모 로그인·샌드박스 결제/시뮬레이터·테스트 PIN 등 테스트/데모 UI가 표시됩니다. 설정은 <strong>F5 새로고침</strong> 후에도 유지됩니다.</p>
        <div class="dev-demo-settings-controls">
          <label class="dev-demo-switch" for="dev-demo-ui-toggle">
            <input type="checkbox" id="dev-demo-ui-toggle" data-testid="dev-demo-ui-toggle" ${enabled ? 'checked' : ''}>
            <span class="dev-demo-switch-track" aria-hidden="true"></span>
            <span>테스트·데모 UI 표시</span>
          </label>
          <button type="button" class="button secondary small" id="dev-demo-ui-refresh" data-testid="dev-demo-ui-refresh">F5 새로고침 적용</button>
        </div>
      `;
      accountPanel.append(section);
      const toggleEl = section.querySelector('#dev-demo-ui-toggle');
      toggleEl?.addEventListener('change', () => setEnabled(toggleEl.checked));
      const refreshBtn = section.querySelector('#dev-demo-ui-refresh');
      refreshBtn?.addEventListener('click', () => location.reload());
    }

    // 2. Compact Dev-only header pill for 1-click toggle from any page
    const siteNav = document.querySelector('.site-nav');
    if (siteNav && !document.getElementById('dev-demo-nav-toggle')) {
      const btn = document.createElement('button');
      btn.id = 'dev-demo-nav-toggle';
      btn.type = 'button';
      btn.className = 'dev-demo-nav-pill';
      btn.dataset.testid = 'dev-demo-nav-toggle';
      btn.addEventListener('click', () => setEnabled(!enabled));
      siteNav.append(btn);
    }

    applyDocumentState();
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    const next = event.newValue === '1';
    if (next === enabled) return;
    enabled = next;
    applyDocumentState();
    window.dispatchEvent(new CustomEvent('playhub:dev-demo-ui-change', {
      detail: { enabled, buildMode }
    }));
  });

  window.PlayHubDevDemoUI = {
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
