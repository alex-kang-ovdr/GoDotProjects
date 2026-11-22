const config = window.PLAYHUB_ADMIN_CONFIG || {};
const hostname = location.hostname.includes(':') && !location.hostname.startsWith('[') ? `[${location.hostname}]` : location.hostname;
const apiBase = (config.apiBaseUrl || `${location.protocol}//${hostname}:${config.apiPort || 8091}`).replace(/\/$/, '');
const $ = id => document.getElementById(id);

let csrf = '';
let pollTimer = null;

function showBanner(msg, isError = false) {
  const b = $('banner');
  b.hidden = !msg;
  b.textContent = msg || '';
  b.classList.toggle('error', isError);
}

async function api(route, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
  const res = await fetch(apiBase + route, {
    method,
    headers,
    credentials: 'include',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `요청 실패 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function ensureAdminSession() {
  let sess = await api('/api/admin/session');
  csrf = sess.csrfToken || '';
  if (!sess.authenticated) {
    const localToken = window.takePlayHubLocalAdminToken?.();
    if (localToken) {
      sess = await api('/api/admin/local-login', { method: 'POST', body: { token: localToken } });
      csrf = sess.csrfToken || csrf;
    }
  }
  $('login-card').hidden = Boolean(sess.authenticated);
  $('console-body').hidden = !sess.authenticated;
  return Boolean(sess.authenticated);
}

function renderOverview(data) {
  const conn = data.connection;
  const pol = data.policy;

  const badge = $('conn-badge');
  if (conn.ready) {
    badge.textContent = `연결됨 (${conn.activeMode === 'gemini-oauth' ? 'Google OAuth' : 'Gemini API Key'})`;
    badge.classList.add('ok');
  } else {
    badge.textContent = '미연결 · 설정 필요';
    badge.classList.remove('ok');
  }

  $('oauth-detail').textContent = conn.oauth.connected
    ? `연결 완료${conn.oauth.email ? ` · 계정: ${conn.oauth.email}` : ''} (${conn.oauth.cliSource || 'managed gemini-cli'})`
    : conn.oauth.pending
      ? '브라우저 Google OAuth 로그인 완료를 기다리고 있습니다…'
      : (conn.oauth.cliInstalled ? '관리형 Gemini CLI 준비됨 · 아직 Google 계정이 연결되지 않았습니다.' : '관리형 Gemini CLI를 찾을 수 없습니다 (API 키 방식을 사용하세요).');

  if (conn.oauth.pending && conn.oauth.connectUrl) {
    $('oauth-url-box').hidden = false;
    $('oauth-url-link').href = conn.oauth.connectUrl;
    $('oauth-url-link').textContent = conn.oauth.connectUrl;
    if (!pollTimer) {
      pollTimer = setInterval(() => void loadStatus(), 2500);
    }
  } else {
    $('oauth-url-box').hidden = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  $('apikey-detail').textContent = conn.apiKey.connected
    ? `저장됨 (${conn.apiKey.maskedKey} · 출처: ${conn.apiKey.source})`
    : '저장된 운영자 Gemini API 키가 없습니다.';

  $('pol-provider').value = pol.defaultProvider;
  $('pol-model').value = pol.defaultModel;
  $('pol-tpc').value = pol.tokensPerCoin;
  $('pol-free-tokens').value = pol.freeTrialTokens;
  $('pol-pro-tokens').value = pol.proWeeklyTokens;
  $('pol-min-coins').value = pol.minCoinsPerCall;
  $('pol-in-bps').value = pol.inputWeightBps;
  $('pol-cache-bps').value = pol.cachedWeightBps;
  $('pol-out-bps').value = pol.outputWeightBps;
  $('pol-pro-mult').value = pol.proMultiplierBps;
  $('pol-max-hold').value = pol.maxHoldCoins;

  const tbody = $('feature-stats-body');
  tbody.replaceChildren();
  const rows = data.metricsByFeature || [];
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.textContent = '아직 집계된 AI 호출 내역이 없습니다.';
    tr.append(td);
    tbody.append(tr);
  } else {
    for (const r of rows) {
      const tr = document.createElement('tr');
      for (const val of [
        r.feature,
        r.auth_mode === 'user_byok' ? '본인 계정 연동 (0 코인)' : 'Hub 내장 Gemini',
        Number(r.calls).toLocaleString(),
        Number(r.total_tokens).toLocaleString(),
        Number(r.weighted_tokens).toLocaleString(),
        Number(r.quota_tokens_used).toLocaleString(),
        Number(r.overage_tokens).toLocaleString(),
        `🪙 ${Number(r.charged_coins).toLocaleString()}`
      ]) {
        const td = document.createElement('td');
        td.textContent = val;
        tr.append(td);
      }
      tbody.append(tr);
    }
  }
}

async function loadStatus() {
  try {
    const ok = await ensureAdminSession();
    if (!ok) return;
    const data = await api('/api/admin/hub-agent/status');
    renderOverview(data);
  } catch (err) {
    showBanner(err.message, true);
  }
}

$('admin-login-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const sess = await api('/api/admin/login', {
      method: 'POST',
      body: { username: $('adm-user').value, password: $('adm-pass').value }
    });
    csrf = sess.csrfToken || csrf;
    showBanner('');
    await loadStatus();
  } catch (err) {
    showBanner(err.message, true);
  }
});

$('oauth-connect-btn').addEventListener('click', async () => {
  try {
    showBanner('Google OAuth 인증 세션을 시작하는 중입니다…');
    const out = await api('/api/admin/hub-agent/connect/oauth', {
      method: 'POST',
      body: { openBrowser: true }
    });
    if (out.alreadyConnected) {
      showBanner('이미 운영자 Google Gemini 계정이 연결되어 있습니다.');
    } else if (out.connectUrl) {
      showBanner('브라우저에서 Google 계정 로그인을 완료하면 자동으로 연결됩니다.');
    }
    await loadStatus();
  } catch (err) {
    showBanner(err.message, true);
  }
});

$('oauth-disconnect-btn').addEventListener('click', async () => {
  try {
    await api('/api/admin/hub-agent/disconnect', { method: 'POST', body: { target: 'oauth' } });
    showBanner('Google OAuth 연결을 해제했습니다.');
    await loadStatus();
  } catch (err) {
    showBanner(err.message, true);
  }
});

$('apikey-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const key = $('apikey-input').value.trim();
    await api('/api/admin/hub-agent/connect/apikey', {
      method: 'POST',
      body: { apiKey: key, defaultModel: $('pol-model').value.trim() || 'gemini-2.5-flash' }
    });
    $('apikey-input').value = '';
    showBanner('운영자 Gemini API 키를 안전하게 저장하고 활성화했습니다.');
    await loadStatus();
  } catch (err) {
    showBanner(err.message, true);
  }
});

$('apikey-disconnect-btn').addEventListener('click', async () => {
  try {
    await api('/api/admin/hub-agent/disconnect', { method: 'POST', body: { target: 'apikey' } });
    showBanner('저장된 Gemini API 키를 삭제했습니다.');
    await loadStatus();
  } catch (err) {
    showBanner(err.message, true);
  }
});

$('smoke-btn').addEventListener('click', async () => {
  const box = $('smoke-output');
  box.hidden = false;
  box.textContent = '호출 중…';
  try {
    const out = await api('/api/admin/hub-agent/test', {
      method: 'POST',
      body: { prompt: $('smoke-prompt').value, model: $('pol-model').value.trim() }
    });
    box.textContent = `[${out.provider} / ${out.model}]\n응답: ${out.reply}\n실측 토큰: 입력 ${out.usage.inputTokens}, 캐시 ${out.usage.cachedTokens}, 출력 ${out.usage.outputTokens}, 추론 ${out.usage.thinkingTokens} (합계 ${out.usage.totalTokens})`;
  } catch (err) {
    box.textContent = `테스트 실패: ${err.message}`;
  }
});

$('policy-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await api('/api/admin/hub-agent/policy', {
      method: 'PUT',
      body: {
        defaultProvider: $('pol-provider').value,
        defaultModel: $('pol-model').value.trim(),
        tokensPerCoin: Number($('pol-tpc').value),
        freeTrialTokens: Number($('pol-free-tokens').value),
        proWeeklyTokens: Number($('pol-pro-tokens').value),
        minCoinsPerCall: Number($('pol-min-coins').value),
        inputWeightBps: Number($('pol-in-bps').value),
        cachedWeightBps: Number($('pol-cache-bps').value),
        outputWeightBps: Number($('pol-out-bps').value),
        proMultiplierBps: Number($('pol-pro-mult').value),
        maxHoldCoins: Number($('pol-max-hold').value)
      }
    });
    showBanner('Free 체험 · Pro 주간 한도 및 PlayCoin 과금 정책을 저장했습니다.');
    await loadStatus();
  } catch (err) {
    showBanner(err.message, true);
  }
});

$('refresh-btn').addEventListener('click', () => void loadStatus());

void loadStatus();
