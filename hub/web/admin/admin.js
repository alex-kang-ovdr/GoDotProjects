import { createSubmissionReview } from './submission-review.js';
import { createL10nController } from './l10n-views.js';
import { createStoreController } from './store-views.js';
import {
  renderActionQueue,
  renderGameDetail,
  renderHubUsers,
  renderSystemOverview,
  renderSystemConfig,
  renderSystemAccess,
  renderSystemBackups,
  renderSystemDevops,
  renderSystemReleasePolicy,
  renderForgeOverview,
  renderForgeProjects,
  renderForgeBuilds,
  renderForgeDrive,
  renderForgeSessions,
  renderForgeSettings,
  renderQaOverview,
  renderQaRuns,
  renderQaAi,
  renderQaPolicies,
  renderQaRunIdsTable
} from './domain-views.js';

let localLoginToken = window.takePlayHubLocalAdminToken?.();
const config = window.PLAYHUB_ADMIN_CONFIG || {};
const Rules = window.AdminRules;
const hostname = location.hostname.includes(':') && !location.hostname.startsWith('[') ? `[${location.hostname}]` : location.hostname;
const apiBase = (config.apiBaseUrl || `${location.protocol}//${hostname}:${config.apiPort || 8091}`).replace(/\/$/, '');
const $ = id => document.getElementById(id);
const text = (tag, value, className) => { const e = document.createElement(tag); e.textContent = value ?? ''; if (className) e.className = className; return e; };
const raw = (tag, value, className) => { const e = text(tag, value, className); e.dataset.noTranslate = ''; e.translate = false; return e; };
const locale = () => document.documentElement.lang || 'ko';
const number = value => Number(value || 0).toLocaleString(locale(), { maximumFractionDigits: 1 });
const percent = value => Rules.rateText(value, '—');
const kstToday = (daysAgo = 0) => new Date(Date.now() + 9 * 3600000 - daysAgo * 86400000).toISOString().slice(0, 10);
const kstStamp = value => new Date(value).toLocaleString(locale(), { timeZone: 'Asia/Seoul' }) + ' KST';
function activeTime(value) {
  if (value == null) return '—';
  const minutes = Math.floor(value / 60), seconds = value - minutes * 60;
  return minutes ? `${number(minutes)}분 ${number(seconds)}초` : `${number(seconds)}초`;
}

let csrf = '', authenticated = false, dataset = 'live', errorsDataset = 'live';
let busy = false, metricsRequest = 0, refreshTimer, generation = 0, catalog = [];
let filters = { from: '', to: '', gameId: '', qaRunId: '' };
let communityRequest = 0, communityOffset = 0, communityLoaded = false, communityBusy = false;
let gameRows = null, gameSort = { key: 'activePlayers', direction: 'descending' };
let selectedGameId = null;
let badgesCache = null, systemCache = null, forgeCache = null, qaCache = null, usersCache = null, auditCache = [];
let activeRoute = Rules.resolveAdminRoute(location.search, location.hash);

const datasetLabels = { live: '실제 이용 기록', qa: 'QA 실행 기록', demo: '독립 가상 예제' };
const domainLabels = { system: '시스템', hub: 'Hub', forge: 'Forge', qa: 'QA', l10n: 'L10N', store: 'Store' };

$('boundary-host').textContent = location.host || '127.0.0.1';
$('env-pill').textContent = config.mode === 'portable-rebex' ? 'Portable' : 'Local Admin';

function notice(message, error = false) {
  $('notice').hidden = !message;
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
}

async function api(route, { method = 'GET', body } = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-CSRF-Token'] = csrf;
    const response = await fetch(apiBase + route, {
      method, headers, credentials: 'include', cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error?.message || `요청 실패 (${response.status})`);
      error.status = response.status;
      error.code = data.error?.code;
      throw error;
    }
    return data;
  } catch (error) {
    if (!error.status) error.message = '관리 API에 연결할 수 없습니다. 현재 표는 갱신되지 않았습니다.';
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function handleAuthError(error) {
  if (error.status === 401 || (error.status === 403 && error.code === 'CSRF_INVALID')) {
    showSession({ authenticated: false });
    notice('관리자 세션이 끝났거나 변경됐습니다. 다시 로그인해 주세요.');
    return true;
  }
  return false;
}

function syncUrl(tab, view, push = false) {
  const params = new URLSearchParams(location.search);
  params.set('tab', tab);
  params.set('view', view);
  const next = `${location.pathname}?${params.toString()}`;
  if (next !== location.pathname + location.search || location.hash) {
    history[push ? 'pushState' : 'replaceState']({ tab, view }, '', next);
  }
}

function badgeCountForSubView(tabId, viewId) {
  if (!badgesCache) return null;
  if (tabId === 'hub' && viewId === 'submissions' && badgesCache.hub.pendingSubmissions > 0) return { count: badgesCache.hub.pendingSubmissions, alert: true };
  if (tabId === 'hub' && viewId === 'community' && badgesCache.hub.reportedCommunity > 0) return { count: badgesCache.hub.reportedCommunity, alert: true };
  if (tabId === 'system' && viewId === 'errors' && badgesCache.system.errors24h > 0) return { count: badgesCache.system.errors24h, alert: true };
  if (tabId === 'forge' && viewId === 'builds' && (badgesCache.forge.activeBuilds + badgesCache.forge.failedBuilds) > 0) {
    return { count: badgesCache.forge.activeBuilds + badgesCache.forge.failedBuilds, alert: badgesCache.forge.failedBuilds > 0 };
  }
  if (tabId === 'qa' && viewId === 'runs' && badgesCache.qa.qaRunsCount > 0) return { count: badgesCache.qa.qaRunsCount, alert: false };
  if (tabId === 'qa' && viewId === 'ai' && badgesCache.qa.aiRunsCount > 0) return { count: badgesCache.qa.aiRunsCount, alert: false };
  if (tabId === 'l10n' && viewId === 'strings' && badgesCache.l10n?.pendingReview > 0) return { count: badgesCache.l10n.pendingReview, alert: badgesCache.l10n.lintBlocks > 0 };
  if (tabId === 'store' && viewId === 'submissions' && badgesCache.store?.pendingSubmissions > 0) return { count: badgesCache.store.pendingSubmissions, alert: true };
  if (tabId === 'store' && viewId === 'packages' && badgesCache.store?.restrictedPackages > 0) return { count: badgesCache.store.restrictedPackages, alert: badgesCache.store.yankedPackages > 0 };
  return null;
}

function paintNavigation() {
  const tabMeta = Rules.findTab(activeRoute.tab);
  const viewMeta = Rules.findView(tabMeta, activeRoute.view);
  for (const btn of $('primary-tabs').querySelectorAll('button[data-tab]')) {
    const active = btn.dataset.tab === tabMeta.id;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  }
  $('subnav-heading').textContent = `${tabMeta.label} 메뉴`;
  $('view-eyebrow').textContent = tabMeta.eyebrow;
  $('view-title').textContent = viewMeta.title;
  $('subnav').replaceChildren(...tabMeta.views.map(view => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.view = view.id;
    btn.dataset.testid = `subnav-${tabMeta.id}-${view.id}`;
    const selected = view.id === viewMeta.id;
    btn.className = selected ? 'selected' : '';
    btn.setAttribute('aria-current', selected ? 'page' : 'false');
    const meta = text('span', '', 'subnav-meta');
    meta.append(text('span', view.kind, 'subnav-kind'));
    const badge = badgeCountForSubView(tabMeta.id, view.id);
    if (badge) meta.append(raw('span', String(badge.count), 'subnav-count' + (badge.alert ? ' alert' : '')));
    btn.append(text('span', view.label), meta);
    btn.addEventListener('click', () => navigate(tabMeta.id, view.id));
    return btn;
  }));
}

function paintTabBadges() {
  if (!badgesCache) return;
  const setBadge = (id, count, alert = false) => {
    const node = $(id);
    node.hidden = !(count > 0);
    node.textContent = count > 0 ? String(count) : '';
    node.classList.toggle('alert', Boolean(alert && count > 0));
  };
  setBadge('badge-system', badgesCache.system.errors24h + (badgesCache.system.maintenanceLock ? 1 : 0), true);
  setBadge('badge-hub', badgesCache.hub.pendingSubmissions + badgesCache.hub.reportedCommunity, badgesCache.hub.pendingSubmissions > 0 || badgesCache.hub.reportedCommunity > 0);
  setBadge('badge-forge', badgesCache.forge.activeBuilds + badgesCache.forge.failedBuilds, badgesCache.forge.failedBuilds > 0);
  setBadge('badge-qa', badgesCache.qa.qaErrors24h || badgesCache.qa.quarantineCount, badgesCache.qa.qaErrors24h > 0);
  setBadge('badge-l10n', badgesCache.l10n?.pendingReview || 0, (badgesCache.l10n?.lintBlocks || 0) > 0);
  setBadge('badge-store', badgesCache.store?.pendingSubmissions || 0, (badgesCache.store?.pendingSubmissions || 0) > 0 || (badgesCache.store?.yankedPackages || 0) > 0);
  paintNavigation();
  renderActionQueue($('hub-action-queue'), badgesCache, (tab, view, opts) => navigate(tab, view, opts));
}

const ALL_PANELS = [
  'metrics-toolbar-wrap', 'hub-live-bar', 'qa-dataset-bar', 'hub-action-queue',
  'overview', 'trends', 'play-funnel', 'retention', 'games', 'game-detail-panel',
  'submissions', 'community', 'hub-users-panel',
  'system-overview-panel', 'system-config-panel', 'system-access-panel', 'system-backups-panel', 'system-devops-panel', 'system-release-policy-panel', 'errors', 'audit',
  'forge-overview-panel', 'forge-projects-panel', 'forge-builds-panel', 'forge-drive-panel', 'forge-sessions-panel', 'forge-settings-panel',
  'qa-overview-panel', 'qa-runs-panel', 'qa-ai-panel', 'qa-policies-panel', 'qa-run-ids-panel',
  'l10n-overview-panel', 'l10n-strings-panel', 'l10n-gather-panel', 'l10n-ai-panel', 'l10n-glossary-panel', 'l10n-media-panel', 'l10n-releases-panel',
  'store-overview-panel', 'store-submissions-panel', 'store-packages-panel'
];

function updatePanelVisibility() {
  const { tab, view } = activeRoute;
  for (const id of ALL_PANELS) $(id).hidden = true;
  const show = (...ids) => ids.forEach(id => { $(id).hidden = false; });
  if (tab === 'hub') {
    if (view === 'dashboard') show('hub-action-queue', 'metrics-toolbar-wrap', 'hub-live-bar', 'overview', 'trends');
    else if (view === 'analytics') show('metrics-toolbar-wrap', 'hub-live-bar', 'play-funnel', 'retention');
    else if (view === 'games') { show('metrics-toolbar-wrap', 'hub-live-bar', 'games'); if (selectedGameId) $('game-detail-panel').hidden = false; }
    else if (view === 'submissions') show('submissions');
    else if (view === 'community') show('community');
    else if (view === 'users') show('hub-users-panel');
  } else if (tab === 'system') {
    if (view === 'overview') show('system-overview-panel');
    else if (view === 'config') show('system-config-panel');
    else if (view === 'access') show('system-access-panel');
    else if (view === 'backups') show('system-backups-panel');
    else if (view === 'devops') show('system-devops-panel');
    else if (view === 'release-policy') show('system-release-policy-panel');
    else if (view === 'errors') show('errors');
    else if (view === 'audit') show('audit');
  } else if (tab === 'forge') {
    if (view === 'overview') show('forge-overview-panel');
    else if (view === 'projects') show('forge-projects-panel');
    else if (view === 'builds') show('forge-builds-panel');
    else if (view === 'drive') show('forge-drive-panel');
    else if (view === 'sessions') show('forge-sessions-panel');
    else if (view === 'settings') show('forge-settings-panel');
  } else if (tab === 'qa') {
    if (view === 'overview') show('qa-overview-panel');
    else if (view === 'runs') show('qa-runs-panel');
    else if (view === 'ai') show('qa-ai-panel');
    else if (view === 'policies') show('qa-policies-panel');
    else if (view === 'metrics') show('metrics-toolbar-wrap', 'qa-dataset-bar', 'overview', 'play-funnel', 'retention', 'games', 'qa-run-ids-panel');
  } else if (tab === 'l10n') {
    show(`l10n-${view}-panel`);
  } else if (tab === 'store') {
    show(`store-${view}-panel`);
  }
  updateControls();
}

function navigate(tabId, viewId, options = {}) {
  const tabMeta = Rules.findTab(tabId);
  const viewMeta = Rules.findView(tabMeta, viewId || tabMeta.defaultView);
  const prevTab = activeRoute.tab;
  const prevView = activeRoute.view;
  activeRoute = { tab: tabMeta.id, view: viewMeta.id, fromLegacyHash: false };
  syncUrl(activeRoute.tab, activeRoute.view, options.push !== false);
  if (activeRoute.tab === 'hub' && ['dashboard', 'analytics', 'games'].includes(activeRoute.view) && dataset !== 'live') {
    dataset = 'live';
    filters.qaRunId = '';
    $('metrics-qa-run').value = '';
  } else if (activeRoute.tab === 'qa' && activeRoute.view === 'metrics' && (prevTab !== 'qa' || prevView !== 'metrics') && dataset === 'live') {
    dataset = 'qa';
  }
  if (options.reported && activeRoute.tab === 'hub' && activeRoute.view === 'community') {
    $('community-reported').value = options.reported;
  }
  paintNavigation();
  updatePanelVisibility();
  notice('');
  if (authenticated) {
    if (options.reported && activeRoute.tab === 'hub' && activeRoute.view === 'community') void refreshCommunity(0);
    else void refreshActiveView();
  }
}

function clearDashboard() {
  for (const id of ['overview', 'funnel', 'journey-summary', 'trend-period', 'trend-cards', 'trend-body', 'games-body', 'games-result', 'retention-cards', 'cohort-body', 'errors-list', 'errors-summary', 'audit-list', 'updated']) {
    $(id).replaceChildren();
  }
  $('trend-values').hidden = true;
  gameRows = null;
  selectedGameId = null;
  $('game-detail-panel').hidden = true;
  communityRequest++; communityLoaded = false; communityBusy = false; communityOffset = 0;
  $('community-list').replaceChildren(); $('community-message').textContent = '';
  $('community-prev').disabled = true; $('community-next').disabled = true;
  badgesCache = systemCache = forgeCache = qaCache = usersCache = null;
  auditCache = [];
}

const LOCAL_LOGOUT_KEY = 'playhub-admin-local-logout';
let localAutoLoginEnabled = false;

function showSession(session) {
  csrf = session.csrfToken || '';
  authenticated = session.authenticated === true;
  if (typeof session.localAutoLogin === 'boolean') localAutoLoginEnabled = session.localAutoLogin;
  $('login-panel').hidden = authenticated;
  $('dashboard').hidden = !authenticated;
  $('logout').hidden = !authenticated;
  $('refresh').hidden = !authenticated;
  $('session-label').textContent = authenticated ? `${session.username} · 관리자` : '관리자 인증 필요';
  const submitBtn = $('login-form').querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = false;
  const localBtn = $('local-auto-login-btn');
  if (localBtn) { localBtn.hidden = !localAutoLoginEnabled; localBtn.disabled = false; }
  if (authenticated) {
    updatePanelVisibility();
    submissionReview.start();
  } else {
    generation++;
    clearDashboard();
    submissionReview.reset();
    storeController.reset();
  }
}

function metric(label, value, detail, key) {
  const box = text('div', '', 'metric');
  box.dataset.metric = key;
  box.append(text('small', label), text('strong', value), text('p', detail));
  return box;
}

function gameTitle(id) {
  const title = catalog.find(item => item.id === id)?.title;
  return typeof title === 'string' ? title : title?.[locale()] || title?.ko || title?.en || id;
}

const trendMetrics = [
  ['visitors', '방문 주체', number],
  ['playSessions', '세션 시작', number],
  ['activePlayers', '유효 플레이어', number],
  ['activeSeconds', '활성 시간', activeTime]
];

function svgNode(tag, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function trendChart(values) {
  const width = 240, height = 66, left = 5, right = 235, bottom = 61, top = 5;
  const maximum = Math.max(1, ...values);
  const points = values.map((value, i) => [
    values.length > 1 ? left + i * (right - left) / (values.length - 1) : width / 2,
    bottom - (bottom - top) * value / maximum
  ]);
  const positions = points.map(([x, y]) => `${x},${y}`).join(' ');
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, 'aria-hidden': 'true', focusable: 'false' });
  const first = points[0], last = points.at(-1);
  for (const y of [top, 33, bottom]) svg.append(svgNode('line', { x1: left, x2: right, y1: y, y2: y, class: 'trend-gridline' }));
  if (points.length > 1) {
    svg.append(
      svgNode('polygon', { points: `${first[0]},${bottom} ${positions} ${last[0]},${bottom}`, class: 'trend-area' }),
      svgNode('polyline', { points: positions, class: 'trend-line' })
    );
  }
  svg.append(svgNode('circle', { cx: last[0], cy: last[1], r: 3.8, class: 'trend-point' }));
  return svg;
}

function paintTrends(data, applied, isDemo) {
  const days = data?.days || [], first = days[0]?.date, last = days.at(-1)?.date;
  let period = first ? (first === last ? first : `${first} – ${last}`) : '';
  if (period) {
    period += ' · KST';
    if (!isDemo && !applied.from) period += ' · 기본 최근 30일';
    if (data.truncated) period += ` · 선택 범위 끝에서 최근 ${number(data.maxDays)}일`;
  }
  $('trend-period').textContent = period;
  $('trend-body').replaceChildren();
  const hasData = days.some(day => trendMetrics.some(([key]) => day[key] > 0));
  $('trend-values').hidden = !hasData;
  if (!hasData) {
    $('trend-cards').replaceChildren(text('p', days.length ? '표시 기간에 수집된 활동이 없습니다.' : '조회 시점에 도달한 날짜가 없습니다.', 'empty trend-empty'));
    return;
  }
  $('trend-cards').replaceChildren(...trendMetrics.map(([key, label, format]) => {
    const values = days.map(d => d[key]), card = text('figure', '', 'trend-card'), caption = text('figcaption', '');
    card.dataset.metric = key;
    caption.append(text('span', label), text('strong', format(values.at(-1))));
    card.append(caption, trendChart(values), text('p', `마지막 날 ${last.slice(5)} · 기간 최고 ${format(Math.max(...values))}`));
    return card;
  }));
  $('trend-body').replaceChildren(...days.map(day => {
    const row = document.createElement('tr');
    const date = text('th', day.date);
    date.scope = 'row';
    row.append(date, ...trendMetrics.map(([key, , format]) => text('td', format(day[key]))));
    return row;
  }));
}

function paintMetrics(data) {
  const s = data.summary || {}, selected = Rules.selectedRetention(data), applied = data.filters || {}, gameId = applied.gameId;
  const funnel = data.funnel || {}, runtime = data.health?.runtimeErrors || {}, saves = data.health?.saves || {};
  $('overview').replaceChildren(
    metric('방문 주체', number(s.visitors), '기록을 남긴 고유 이용 주체', 'visitors'),
    metric('플레이 세션', number(s.playSessions), '선택 기간 내 서버 발급', 'playSessions'),
    metric('유효 플레이어', number(s.activePlayers), '서버 확인 활성 플레이 10초 기준', 'activePlayers'),
    metric('활성 플레이 시간', activeTime(s.totalActiveSeconds), '숨김 탭·일시정지·중복 구간 제외', 'totalActiveSeconds'),
    metric('카드 클릭률', percent(s.ctr), `${number(s.clicks)} 클릭 / ${number(s.impressions)} 가시 노출`, 'ctr'),
    metric('실행 오류 세션율', percent(runtime.rate), `${number(runtime.sessions)} 오류 세션 / ${number(s.playSessions)} 시작`, 'runtimeErrorRate')
  );
  paintTrends(data.dailyTrend, applied, data.dataset === 'demo');
  const stages = [
    ['세션 시작', funnel.started, funnel.started ? 1 : null, 'playSessions'],
    ['게임 준비', funnel.ready, funnel.readyRate, 'readySessions'],
    ['10초 플레이', funnel.active10s, funnel.active10sRate, 'active10sSessions'],
    ['60초 플레이', funnel.active60s, funnel.active60sRate, 'active60sSessions']
  ];
  $('funnel').replaceChildren(...stages.map(([label, value, ratio, key]) => {
    const box = text('div', '', 'funnel-item'), figures = text('div', '', 'funnel-value'), bar = text('div', '', 'bar');
    const fill = document.createElement('span');
    box.dataset.metric = key;
    fill.style.width = `${(ratio || 0) * 100}%`;
    bar.setAttribute('aria-hidden', 'true');
    bar.append(fill);
    figures.append(text('strong', number(value)), text('span', percent(ratio)));
    box.append(text('small', label), figures, bar);
    return box;
  }));
  $('journey-summary').replaceChildren(...[
    ['카드 가시 노출', s.impressions, `${number(s.clicks)}회 카드 클릭`, 'impressions'],
    ['라운드 완료 기록', s.roundsCompleted, '라운드를 보고하는 게임 기준', 'roundsCompleted'],
    ['서버 저장 성공', saves.successes ?? s.saveWrites, `복원 ${number(saves.restores)}건 포함 · 시도·실패 미수집`, 'saveWrites'],
    ['찜 추가', s.wishlistAdds, `찜 해제 ${number(s.wishlistRemovals)}회`, 'wishlistAdds']
  ].map(([label, value, detail, key]) => metric(label, number(value), detail, key)));
  $('retention-cards').replaceChildren(...[1, 7, 30].map(day => {
    const r = selected['d' + day] || {}, box = text('div', '', 'retention-card');
    box.dataset.metric = 'd' + day;
    box.append(
      text('span', 'D' + day, 'day'),
      text('strong', r.eligible ? Rules.rateText(r.rate, '대상 없음') : '집계 대기'),
      text('p', r.eligible ? `${number(r.retained)} / ${number(r.cohortSize)}명` : '확정 가능한 코호트가 없습니다')
    );
    return box;
  }));
  $('cohort-body').replaceChildren(...(selected.cohorts || []).map(r => {
    const tr = document.createElement('tr');
    for (const v of [r.cohortDate, 'D' + r.day, number(r.cohortSize), r.eligible ? number(r.retained) : '—', r.eligible ? Rules.rateText(r.rate, '대상 없음') : '—', r.eligible ? '확정' : '집계 대기']) {
      tr.append(text('td', v));
    }
    return tr;
  }));
  if (!selected.cohorts?.length) {
    const tr = document.createElement('tr'), td = text('td', '선택한 최초 플레이 기간에 해당하는 코호트가 없습니다.', 'empty');
    td.colSpan = 6; tr.append(td); $('cohort-body').append(tr);
  }
  const period = !applied.from && !applied.to ? '전체 기간' : `${applied.from || '최초 기록'} – ${applied.to || '현재'}`;
  const runSuffix = applied.qaRunId ? ` · qa_run_id: ${applied.qaRunId}` : '';
  $('metrics-scope').textContent = data.dataset === 'demo'
    ? '독립 가상 예제 · 고정된 계산 검증 데이터 · 기간·게임 필터 미적용'
    : `${datasetLabels[data.dataset]} · ${period} (KST, 양 끝 날짜 포함) · ${gameId ? gameTitle(gameId) : '전체 게임'}${runSuffix} · QA와 실제 이용 기록은 별도 집계`;
  $('retention-scope').textContent = `${data.retentionScope === 'game' ? gameTitle(gameId) + '의' : '플랫폼 전체의'} 첫 유효 플레이 코호트 · 날짜 필터는 최초일 기준`;
  $('updated').textContent = data.asOf ? kstStamp(data.asOf) + ' 기준' : '';
  return data.games || [];
}

function paintGameFilter(games) {
  const selected = $('metrics-game').value;
  $('metrics-game').replaceChildren(new Option('전체 게임', ''));
  for (const g of games) {
    $('metrics-game').append(new Option(gameTitle(g.id) + (g.enabled ? '' : ' · 비공개'), g.id));
  }
  $('metrics-game').value = selected;
}

const sortButtons = [...$('games').querySelectorAll('button[data-sort]')];
const gameCollator = () => new Intl.Collator(locale(), { numeric: true, sensitivity: 'base' });
function sortValue(row, key) {
  if (key === 'title') return row.title;
  if (key === 'readyRate') return row.metrics.funnel?.readyRate;
  if (key === 'errorRate') return row.metrics.health?.runtimeErrors?.rate;
  return row.metrics[key];
}

async function openGameDetail(gameId) {
  selectedGameId = gameId;
  $('game-detail-panel').hidden = false;
  $('game-detail-body').replaceChildren(text('p', '게임 메타데이터를 불러오는 중입니다.', 'muted'));
  try {
    const { game } = await api('/api/admin/games/' + encodeURIComponent(gameId));
    if (selectedGameId !== gameId) return;
    $('game-detail-title').textContent = `${gameTitle(game.id)} · 메타데이터 상세`;
    renderGameDetail($('game-detail-body'), game, {
      number, kstStamp,
      onToggle: target => void toggleGameVisibility(target, gameTitle(target.id))
    });
  } catch (error) {
    if (!handleAuthError(error)) $('game-detail-body').replaceChildren(text('p', error.message || '상세 정보를 불러오지 못했습니다.', 'empty'));
  }
}

async function toggleGameVisibility(game, title) {
  if (dataset !== 'live' || busy) return;
  if (!confirm(`${title}을(를) ${game.enabled ? '비공개' : '공개'} 상태로 변경할까요?`)) return;
  try {
    await api('/api/admin/games/' + encodeURIComponent(game.id), { method: 'PATCH', body: { enabled: !game.enabled } });
    notice('게임 공개 상태를 변경했습니다. 사용자 목록과 새 실행 요청에 반영됩니다.');
    await refresh();
    if (selectedGameId === game.id) await openGameDetail(game.id);
  } catch (error) {
    if (!handleAuthError(error)) notice(error.message, true);
  }
}

function secondsShort(value) {
  return value == null ? '—' : `${Number(value).toFixed(1)}초`;
}

function paintGameRows() {
  if (!gameRows) return;
  const query = $('game-search').value.trim().toLocaleLowerCase(locale());
  const minImpressions = Math.max(0, Number($('game-min-impressions')?.value) || 0);
  const collator = gameCollator();
  const { key, direction } = gameSort, order = direction === 'ascending' ? 1 : -1;
  const shown = gameRows.filter(row =>
    (row.metrics.impressions || 0) >= minImpressions &&
    [row.game.id, row.title].some(value => value.toLocaleLowerCase(locale()).includes(query))
  );
  shown.sort((a, b) => {
    const left = sortValue(a, key), right = sortValue(b, key);
    if (left == null) return right == null ? collator.compare(a.title, b.title) : 1;
    if (right == null) return -1;
    const comparison = key === 'title' ? collator.compare(left, right) : left - right;
    return order * comparison || collator.compare(a.title, b.title);
  });
  for (const button of sortButtons) {
    const indicator = button.querySelector('span');
    if (button.dataset.sort === key) {
      button.parentElement.setAttribute('aria-sort', direction);
      indicator.textContent = direction === 'ascending' ? '↑' : '↓';
    } else {
      button.parentElement.removeAttribute('aria-sort');
      indicator.textContent = '↕';
    }
  }
  $('games-result').textContent = `게임 ${number(shown.length)} / ${number(gameRows.length)}개${minImpressions > 0 ? ` (노출 ${number(minImpressions)} 이상)` : ''}`;
  if (!shown.length) {
    const row = document.createElement('tr'), cell = text('td', '검색 조건에 맞는 게임이 없습니다.', 'empty');
    cell.colSpan = sortButtons.length + 2; row.append(cell); $('games-body').replaceChildren(row);
    return;
  }
  $('games-body').replaceChildren(...shown.map(({ game, title, metrics: m }) => {
    const tr = document.createElement('tr'), name = document.createElement('th');
    name.scope = 'row';
    tr.dataset.gameId = game.id;
    if (selectedGameId === game.id) tr.classList.add('selected');
    tr.addEventListener('click', event => {
      if (event.target.closest('button, a, input, select')) return;
      for (const sibling of $('games-body').children) sibling.classList.toggle('selected', sibling === tr);
      void openGameDetail(game.id);
    });
    const cellWrap = text('div', '', 'game-cell');
    if (game.cover) {
      const img = document.createElement('img');
      img.className = 'game-thumb';
      img.src = game.cover;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => { img.replaceWith(text('span', (title || game.id || '?').slice(0, 1).toUpperCase(), 'game-thumb-fallback')); };
      cellWrap.append(img);
    } else {
      cellWrap.append(text('span', (title || game.id || '?').slice(0, 1).toUpperCase(), 'game-thumb-fallback'));
    }
    const nameText = document.createElement('div');
    nameText.append(text('strong', title), raw('small', game.id));
    cellWrap.append(nameText);
    name.append(cellWrap);
    tr.append(name);
    const progress = m.funnel || {}, errors = m.health?.runtimeErrors || {};
    const lowImp = (m.impressions || 0) < 200;
    const lowPlay = (m.plays || 0) < 30;
    const columns = [
      [number(m.impressions || 0), null, false],
      [number(m.clicks || 0), null, false],
      [percent(m.ctr), null, lowImp],
      [percent(m.userCtr), m.impressedUsers ? `${number(m.clickedUsers || 0)} / ${number(m.impressedUsers)}` : null, lowImp],
      [number(m.plays || 0), progress.active10s ? `10초 ${number(progress.active10s)}` : null, false],
      [percent(progress.readyRate), m.plays ? `${number(progress.ready || 0)} / ${number(m.plays)}` : null, lowPlay],
      [secondsShort(m.loadP50Seconds), null, lowPlay],
      [secondsShort(m.loadP90Seconds), null, lowPlay],
      [number(m.activePlayers || 0), null, false],
      [activeTime(m.medianActiveSeconds), m.averageActiveSeconds != null ? `평균 ${activeTime(m.averageActiveSeconds)}` : null, lowPlay],
      [number(m.newPlayers || 0), null, false],
      [percent(m.returningRatio), null, lowPlay],
      [percent(m.d1NewRate), null, lowPlay],
      [percent(m.d1ReturningRate), null, lowPlay],
      [percent(errors.rate), errors.sessions ? `${number(errors.sessions)} / ${number(m.plays || 0)}` : null, lowPlay],
      [number(m.wishlistAdds || 0), m.wishlistRemovals ? `해제 ${number(m.wishlistRemovals)}` : null, false]
    ];
    for (const [value, detail, dimmed] of columns) {
      const cell = text('td', value, 'game-number' + (dimmed ? ' low-sample' : ''));
      if (detail) cell.append(text('small', detail));
      tr.append(cell);
    }
    const status = document.createElement('td');
    status.append(text('span', game.enabled ? '공개' : '비공개', 'badge' + (game.enabled ? '' : ' off')));
    tr.append(status);
    const action = document.createElement('td');
    const actionWrap = text('div', '', 'row-actions');
    const detailBtn = text('button', '상세', 'toggle');
    detailBtn.type = 'button';
    detailBtn.addEventListener('click', () => void openGameDetail(game.id));
    const button = text('button', game.enabled ? '비공개로 전환' : '공개로 전환', 'toggle');
    button.type = 'button';
    button.disabled = dataset !== 'live';
    button.dataset.testid = 'game-visibility-toggle';
    button.dataset.gameId = game.id;
    button.title = dataset === 'live' ? '실제 공개 상태를 변경합니다.' : '실제 이용 기록(Hub)에서 공개 상태를 변경할 수 있습니다.';
    button.addEventListener('click', () => void toggleGameVisibility(game, title));
    actionWrap.append(detailBtn, button);
    action.append(actionWrap);
    tr.append(action);
    return tr;
  }));
}

function paintGames(games, metrics, gameId) {
  const byId = new Map(metrics.map(g => [g.id, g]));
  gameRows = games.filter(g => !gameId || g.id === gameId).map(game => ({ game, title: gameTitle(game.id), metrics: byId.get(game.id) || {} }));
  paintGameRows();
}

function paintErrors(items) {
  const byCode = new Map();
  for (const item of items || []) byCode.set(item.code || 'UNKNOWN', (byCode.get(item.code || 'UNKNOWN') || 0) + 1);
  $('errors-summary').replaceChildren(...[...byCode.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([code, count]) => raw('span', `${code}: ${count}건`, 'pill danger')));
  if (!items?.length) {
    $('errors-list').replaceChildren(text('div', '선택한 조건의 실행 오류가 없습니다.', 'empty'));
    return;
  }
  $('errors-list').replaceChildren(...items.slice(0, 50).map(item => {
    const row = text('div', '', 'activity');
    const head = text('div', '', 'activity-head');
    head.append(raw('strong', `${item.code || '오류'} · ${item.gameId || '플랫폼'}`), raw('span', item.trafficType || errorsDataset, 'pill muted'));
    row.append(head, raw('p', item.message), raw('time', kstStamp(item.createdAt)));
    return row;
  }));
}

function paintAudit(items) {
  auditCache = items || [];
  $('audit-count').textContent = `조회된 감사 로그 ${number(auditCache.length)}건`;
  if (!auditCache.length) {
    $('audit-list').replaceChildren(text('div', '조건에 맞는 운영 변경 기록이 없습니다.', 'empty'));
    return;
  }
  $('audit-list').replaceChildren(...auditCache.slice(0, 100).map(item => {
    const row = text('div', '', 'activity');
    const head = text('div', '', 'activity-head');
    head.append(
      raw('strong', `${item.action} · ${item.target || '서비스'}`),
      text('span', domainLabels[item.domain] || item.domain || 'Hub', 'pill info')
    );
    row.append(
      head,
      raw('p', typeof item.detail === 'string' ? item.detail : JSON.stringify(item.detail || {})),
      raw('time', kstStamp(item.createdAt))
    );
    return row;
  }));
}

function updateControls() {
  for (const value of ['live', 'qa', 'demo']) {
    $(value).classList.toggle('active', dataset === value);
    $(value).setAttribute('aria-pressed', String(dataset === value));
    $(value).disabled = false;
  }
  $('refresh').disabled = busy;
  $('metrics-qa-run').disabled = busy || dataset !== 'qa';
  for (const id of ['metrics-from', 'metrics-to', 'metrics-game', 'metrics-apply', 'metrics-last7', 'metrics-last30', 'metrics-reset']) {
    $(id).disabled = busy || dataset === 'demo';
  }
  for (const days of [7, 30]) {
    const active = dataset !== 'demo' && filters.to === kstToday() && filters.from === kstToday(days - 1);
    $(`metrics-last${days}`).setAttribute('aria-pressed', String(active));
  }
  $('demo-banner').hidden = dataset !== 'demo';
  $('qa-banner').hidden = dataset !== 'qa';
  $('errors-live').classList.toggle('active', errorsDataset === 'live');
  $('errors-live').setAttribute('aria-pressed', String(errorsDataset === 'live'));
  $('errors-qa').classList.toggle('active', errorsDataset === 'qa');
  $('errors-qa').setAttribute('aria-pressed', String(errorsDataset === 'qa'));
}

async function refreshBadges() {
  try {
    badgesCache = await api('/api/admin/summary/badges');
    paintTabBadges();
  } catch {}
}

async function refreshSystemViews() {
  const token = generation;
  if (activeRoute.view === 'errors') {
    const res = await api(`/api/admin/errors?dataset=${errorsDataset}`);
    if (token !== generation || !authenticated) return;
    paintErrors(res.errors);
    return;
  }
  if (activeRoute.view === 'audit') {
    const params = new URLSearchParams({ domain: $('audit-domain').value });
    if ($('audit-search').value.trim()) params.set('q', $('audit-search').value.trim());
    const res = await api(`/api/admin/audit?${params}`);
    if (token !== generation || !authenticated) return;
    paintAudit(res.audit);
    return;
  }
  if (activeRoute.view === 'devops') {
    const devopsData = await api('/api/admin/devops/overview');
    if (token !== generation || !authenticated) return;
    renderSystemDevops($('system-devops-panel'), devopsData, {
      kstStamp,
      onCreateManualPlan: async (payload) => {
        const res = await api('/api/admin/devops/manual-plan', { method: 'POST', body: payload });
        notice(`실행 계획 ${res.plan.runId} 생성 완료 (${res.plan.testTarget}).`);
        return res;
      },
      onStartPreview: async (payload) => {
        const res = await api('/api/admin/devops/preview/start', { method: 'POST', body: payload });
        notice(`로컬 격리 프리뷰 기동 완료: ${res.preview.urls.user}`);
        await refreshSystemViews();
      },
      onStopPreview: async (payload) => {
        const res = await api('/api/admin/devops/preview/stop', { method: 'POST', body: payload });
        notice(`로컬 프리뷰 ${res.result.runId} 중지 및 정리 완료.`);
        await refreshSystemViews();
      }
    });
    return;
  }
  if (activeRoute.view === 'release-policy') {
    const policyData = await api('/api/admin/release-policy');
    if (token !== generation || !authenticated) return;
    renderSystemReleasePolicy($('system-release-policy-panel'), policyData, {
      kstStamp,
      onSavePolicy: async (patch, summaryLabel = '릴리스·강업 정책') => {
        const res = await api('/api/admin/release-policy', { method: 'POST', body: patch });
        notice(`${summaryLabel} 저장 완료 (revision #${res.policy.revision}, 무재빌드 즉시 반영).`);
        await refreshSystemViews();
        return res;
      }
    });
    return;
  }
  systemCache = await api('/api/admin/system/overview');
  if (token !== generation || !authenticated) return;
  const ctx = {
    number, kstStamp,
    onNavigate: (tab, view) => navigate(tab, view),
    onCreateBackup: async () => {
      await api('/api/admin/system/backups', { method: 'POST', body: {} });
      notice('SQLite 온라인 백업을 생성하고 무결성 검증을 마쳤습니다.');
      await refreshSystemViews();
      void refreshBadges();
    }
  };
  renderSystemOverview($('system-overview-panel'), systemCache, ctx);
  renderSystemConfig($('system-config-panel'), systemCache);
  renderSystemAccess($('system-access-panel'), systemCache, ctx);
  renderSystemBackups($('system-backups-panel'), systemCache, ctx);
}

async function refreshForgeViews() {
  const token = generation;
  forgeCache = await api('/api/admin/forge/overview');
  if (token !== generation || !authenticated) return;
  const userBaseUrl = (config.userBaseUrl || `${location.protocol}//${hostname}:${Number(config.userPort) || 18130}`).replace(/\/$/, '');
  const ctx = {
    number,
    kstStamp,
    userBaseUrl,
    onNavigate: (tab, view) => navigate(tab, view),
    onPublishTemplates: async templateIds => (await api('/api/admin/forge/templates/publish', {
      method: 'POST',
      body: { templateIds, enableInCatalog: true, rebuildDist: true }
    })).job,
    onPollPublishJob: async jobId => (await api('/api/admin/forge/templates/publish/' + encodeURIComponent(jobId))).job,
    onPublishComplete: async () => {
      await refreshForgeViews();
      await refresh();
    }
  };
  renderForgeOverview($('forge-overview-panel'), forgeCache, ctx);
  renderForgeProjects($('forge-projects-panel'), forgeCache, ctx);
  renderForgeBuilds($('forge-builds-panel'), forgeCache, ctx);
  renderForgeDrive($('forge-drive-panel'), forgeCache, ctx);
  renderForgeSessions($('forge-sessions-panel'), forgeCache);
  renderForgeSettings($('forge-settings-panel'), forgeCache);
}

function populateQaRunSelect(qaRunIds) {
  const select = $('metrics-qa-run');
  const current = filters.qaRunId || select.value;
  select.replaceChildren(new Option('전체 QA 실행', ''));
  for (const item of qaRunIds || []) {
    select.append(new Option(`${item.qaRunId} (${item.sessions}세션)`, item.qaRunId));
  }
  if ((qaRunIds || []).some(item => item.qaRunId === current)) select.value = current;
  else { select.value = ''; filters.qaRunId = ''; }
}

async function refreshQaViews() {
  const token = generation;
  qaCache = await api('/api/admin/qa/overview');
  if (token !== generation || !authenticated) return;
  const ctx = {
    number, kstStamp,
    onNavigate: (tab, view) => navigate(tab, view),
    onSelectRunId: runId => {
      dataset = 'qa';
      filters.qaRunId = runId;
      $('metrics-qa-run').value = runId;
      void refreshMetrics();
    }
  };
  renderQaOverview($('qa-overview-panel'), qaCache, ctx);
  renderQaRuns($('qa-runs-panel'), qaCache, ctx);
  renderQaAi($('qa-ai-panel'), qaCache, ctx);
  renderQaPolicies($('qa-policies-panel'), qaCache);
  populateQaRunSelect(qaCache.datasetSummary?.qaRunIds || []);
  renderQaRunIdsTable($('qa-run-ids-body'), qaCache.datasetSummary?.qaRunIds || [], ctx);
}

async function refreshHubUsers() {
  const token = generation;
  usersCache = await api('/api/admin/hub/users-summary');
  if (token !== generation || !authenticated) return;
  renderHubUsers($('hub-users-panel'), usersCache, { number, kstStamp });
}

async function refreshMetrics() {
  if (!authenticated) return;
  let query;
  try { query = Rules.metricsQuery(dataset, filters); }
  catch (error) { notice(error.message, true); return; }
  const reqId = ++metricsRequest;
  const requestedDataset = dataset;
  busy = true;
  updateControls();
  const token = generation;
  try {
    const [metricsRes, gamesRes] = await Promise.all([
      api('/api/admin/metrics?' + query),
      api('/api/admin/games')
    ]);
    if (!authenticated || token !== generation || reqId !== metricsRequest) return;
    if (metricsRes.dataset !== requestedDataset) throw new Error('요청한 데이터 종류와 응답이 달라 표시를 중단했습니다.');
    catalog = gamesRes.games || [];
    paintCommunityGames();
    if (!communityLoaded && !communityBusy) void refreshCommunity(0);
    paintGameFilter(catalog);
    paintGames(catalog, paintMetrics(metricsRes), metricsRes.filters?.gameId);
  } catch (error) {
    if (token !== generation || reqId !== metricsRequest) return;
    $('metrics-scope').textContent = '조회 실패 · 이전 통계는 표시하지 않습니다.';
    if (!handleAuthError(error)) notice(error.message || '관리 API에 연결할 수 없습니다.', true);
  } finally {
    if (reqId === metricsRequest) {
      busy = false;
      updateControls();
    }
  }
}

async function refreshActiveView() {
  if (!authenticated) return;
  void refreshBadges();
  try {
    const { tab, view } = activeRoute;
    if (tab === 'hub') {
      if (['dashboard', 'analytics', 'games'].includes(view)) await refreshMetrics();
      else if (view === 'submissions') submissionReview.reload();
      else if (view === 'community') await refreshCommunity(communityOffset);
      else if (view === 'users') await refreshHubUsers();
    } else if (tab === 'system') {
      await refreshSystemViews();
    } else if (tab === 'forge') {
      await refreshForgeViews();
    } else if (tab === 'qa') {
      if (view === 'metrics') await Promise.all([refreshQaViews(), refreshMetrics()]);
      else await refreshQaViews();
    } else if (tab === 'l10n') {
      await l10nController.loadView(view);
    } else if (tab === 'store') {
      await storeController.loadView(view);
    }
  } catch (error) {
    if (!handleAuthError(error)) notice(error.message || '화면을 불러오지 못했습니다.', true);
  }
}

async function refresh() {
  await refreshActiveView();
}

// Primary tabs & navigation listeners
for (const btn of $('primary-tabs').querySelectorAll('button[data-tab]')) {
  btn.addEventListener('click', () => navigate(btn.dataset.tab));
}
window.addEventListener('popstate', () => {
  activeRoute = Rules.resolveAdminRoute(location.search, location.hash);
  paintNavigation();
  updatePanelVisibility();
  if (authenticated) void refreshActiveView();
});

$('jump-qa-metrics').addEventListener('click', () => navigate('qa', 'metrics'));
$('game-detail-close').addEventListener('click', () => { selectedGameId = null; $('game-detail-panel').hidden = true; });

// Auth
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('login-error').textContent = '';
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const fresh = await api('/api/admin/session');
    csrf = fresh.csrfToken || '';
    const session = await api('/api/admin/login', { method: 'POST', body: { username: $('username').value, password: $('password').value } });
    $('password').value = '';
    try { sessionStorage.removeItem(LOCAL_LOGOUT_KEY); } catch {}
    generation++;
    showSession(session);
    notice('');
    await refresh();
  } catch (error) {
    $('login-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('local-auto-login-btn')?.addEventListener('click', async event => {
  $('login-error').textContent = '';
  const button = event.currentTarget;
  button.disabled = true;
  try {
    try { sessionStorage.removeItem(LOCAL_LOGOUT_KEY); } catch {}
    const fresh = await api('/api/admin/session');
    csrf = fresh.csrfToken || '';
    const session = await api('/api/admin/local-auto-login', { method: 'POST', body: {} });
    generation++;
    showSession(session);
    notice('');
    await refresh();
  } catch (error) {
    $('login-error').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('logout').addEventListener('click', async () => {
  try {
    try { sessionStorage.setItem(LOCAL_LOGOUT_KEY, '1'); } catch {}
    await api('/api/admin/logout', { method: 'POST', body: {} });
    showSession({ authenticated: false });
    showSession(await api('/api/admin/session'));
    notice('로그아웃했습니다.');
  } catch (error) {
    if (!handleAuthError(error)) notice(error.message, true);
  }
});

$('refresh').addEventListener('click', () => { notice(''); void refresh(); });

// QA Dataset Switcher
for (const value of ['live', 'qa', 'demo']) {
  $(value).addEventListener('click', () => {
    if (dataset === value) return;
    dataset = value;
    if (dataset !== 'qa') { filters.qaRunId = ''; $('metrics-qa-run').value = ''; }
    $('metrics-scope').textContent = '자료를 불러오는 중입니다.';
    notice('');
    updateControls();
    void refreshMetrics();
  });
}

$('metrics-qa-run').addEventListener('change', () => {
  if (dataset !== 'qa') return;
  filters.qaRunId = $('metrics-qa-run').value;
  void refreshMetrics();
});

function applyFilters(from, to) {
  if (busy || dataset === 'demo') return;
  const next = { from, to, gameId: $('metrics-game').value, qaRunId: dataset === 'qa' ? $('metrics-qa-run').value : '' };
  try {
    Rules.metricsQuery(dataset, next);
    filters = next;
    $('metrics-from').value = from;
    $('metrics-to').value = to;
    notice('');
    void refreshMetrics();
  } catch (error) {
    notice(error.message, true);
  }
}

$('metrics-filters').addEventListener('submit', event => { event.preventDefault(); applyFilters($('metrics-from').value, $('metrics-to').value); });
for (const days of [7, 30]) $(`metrics-last${days}`).addEventListener('click', () => applyFilters(kstToday(days - 1), kstToday()));
$('metrics-reset').addEventListener('click', () => {
  filters.qaRunId = '';
  $('metrics-qa-run').value = '';
  $('metrics-game').value = '';
  applyFilters('', '');
});
$('game-search').addEventListener('input', paintGameRows);
$('game-min-impressions')?.addEventListener('input', paintGameRows);
for (const button of sortButtons) {
  button.addEventListener('click', () => {
    const key = button.dataset.sort;
    const direction = gameSort.key === key ? (gameSort.direction === 'ascending' ? 'descending' : 'ascending') : key === 'title' ? 'ascending' : 'descending';
    gameSort = { key, direction };
    paintGameRows();
  });
}

// System Errors & Audit Filters
for (const mode of ['live', 'qa']) {
  $(`errors-${mode}`).addEventListener('click', () => {
    if (errorsDataset === mode) return;
    errorsDataset = mode;
    updateControls();
    void refreshSystemViews();
  });
}
$('audit-filters').addEventListener('submit', event => { event.preventDefault(); void refreshSystemViews(); });
$('audit-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), audit: auditCache }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `playhub-audit-${kstToday()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

// Community Moderation
const communityStatuses = { open: '접수됨', planned: '반영 예정', completed: '반영 완료', declined: '보류' };
function paintCommunityGames() {
  const selected = $('community-game').value;
  $('community-game').replaceChildren(new Option('전체 게임', ''), ...catalog.map(game => new Option(gameTitle(game.id), game.id)));
  if (catalog.some(game => game.id === selected)) $('community-game').value = selected;
}

async function refreshCommunity(offset = 0) {
  if (!authenticated) return;
  const request = ++communityRequest, sessionGeneration = generation;
  communityBusy = true;
  $('community-message').textContent = '커뮤니티 글을 불러오는 중입니다.';
  $('community-prev').disabled = true; $('community-next').disabled = true;
  const query = new URLSearchParams({
    kind: $('community-kind').value,
    visibility: $('community-visibility').value,
    reported: $('community-reported').value,
    offset: String(offset),
    limit: '20'
  });
  if ($('community-game').value) query.set('gameId', $('community-game').value);
  try {
    const result = await api('/api/admin/community?' + query);
    if (request !== communityRequest || sessionGeneration !== generation || !authenticated) return;
    communityLoaded = true; communityOffset = offset;
    $('community-list').replaceChildren(...result.items.map(paintCommunityPost));
    $('community-message').textContent = result.total ? `전체 ${result.total}개 글` : '조건에 맞는 커뮤니티 글이 없습니다.';
    $('community-prev').disabled = offset === 0;
    $('community-next').disabled = !result.hasMore;
  } catch (error) {
    if (request !== communityRequest || sessionGeneration !== generation) return;
    $('community-list').replaceChildren();
    $('community-message').textContent = '커뮤니티 글을 불러오지 못했습니다. 다시 시도해 주세요.';
    handleAuthError(error);
  } finally {
    if (request === communityRequest) communityBusy = false;
  }
}

function paintCommunityPost(item) {
  const article = text('article', '', 'community-post');
  article.dataset.postId = item.id;
  const header = text('div', '', 'section-heading');
  const badges = text('div', '', 'inline-actions');
  badges.append(
    text('span', item.kind === 'suggestion' ? '개선 제안' : '댓글', 'community-badge'),
    text('span', item.hidden ? '숨김' : '공개', item.hidden ? 'pill warn' : 'pill ok')
  );
  if (item.reportCount > 0) badges.append(text('span', `신고 ${item.reportCount}건`, 'pill danger'));
  header.append(text('strong', gameTitle(item.gameId)), badges);
  article.append(header, item.authorName === 'Guest' ? text('p', '게스트') : raw('p', item.authorName), raw('time', kstStamp(item.createdAt)));
  if (item.title) article.append(raw('h3', item.title));
  const body = raw('p', item.body, 'community-body');
  article.append(body, text('p', `신고 ${item.reportCount || 0}건 · 공감 ${item.voteCount || 0}개`, 'muted'));
  if (item.reports?.length) {
    const details = document.createElement('details');
    details.append(text('summary', '신고 사유 보기'));
    for (const report of item.reports) {
      details.append(raw('p', report.reason, 'community-body'), raw('time', kstStamp(report.createdAt)));
    }
    article.append(details);
  }
  const form = document.createElement('form');
  form.className = 'community-actions';
  const hiddenLabel = text('label', '공개 상태');
  const hidden = document.createElement('select');
  hidden.name = 'visibility'; hidden.setAttribute('aria-label', '공개 상태');
  hidden.append(new Option('공개', 'visible'), new Option('숨김', 'hidden'));
  hidden.value = item.hidden ? 'hidden' : 'visible';
  hiddenLabel.append(hidden); form.append(hiddenLabel);
  let status;
  if (item.kind === 'suggestion') {
    const label = text('label', '제안 상태');
    status = document.createElement('select');
    status.name = 'status'; status.setAttribute('aria-label', '제안 상태');
    for (const [value, title] of Object.entries(communityStatuses)) status.append(new Option(title, value));
    status.value = item.status; label.append(status); form.append(label);
  }
  const save = text('button', '변경 저장', 'primary');
  save.type = 'submit'; save.dataset.testid = 'admin-community-save'; form.append(save);
  const message = text('span', ''); message.setAttribute('role', 'status'); form.append(message);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const token = generation, request = communityRequest;
    save.disabled = true; hidden.disabled = true; if (status) status.disabled = true;
    try {
      await api('/api/admin/community/' + encodeURIComponent(item.id), {
        method: 'PATCH', body: { hidden: hidden.value === 'hidden', ...(status ? { status: status.value } : {}) }
      });
      if (token === generation && request === communityRequest && authenticated) {
        await refreshCommunity(communityOffset);
        void refreshBadges();
      }
    } catch (error) {
      if (token !== generation || request !== communityRequest) return;
      message.textContent = '변경을 저장하지 못했습니다. 다시 시도해 주세요.';
      handleAuthError(error);
    } finally {
      save.disabled = false; hidden.disabled = false; if (status) status.disabled = false;
    }
  });
  article.append(form);
  return article;
}

$('community-filters').addEventListener('submit', event => { event.preventDefault(); void refreshCommunity(0); });
$('community-prev').addEventListener('click', () => { if (!communityBusy) void refreshCommunity(Math.max(0, communityOffset - 20)); });
$('community-next').addEventListener('click', () => { if (!communityBusy) void refreshCommunity(communityOffset + 20); });

// Localization
const languageSelect = $('language-select');
const supportedLanguages = new Set([...languageSelect.options].map(option => option.value));
function setLanguage(language) {
  if (!supportedLanguages.has(language)) return;
  document.documentElement.lang = language;
  languageSelect.value = language;
  try { localStorage.setItem('playhub.locale', language); } catch {}
  document.dispatchEvent(new CustomEvent('playhub:locale-change', { bubbles: true, detail: { locale: language } }));
}
setLanguage(globalThis.PlayHubLocale?.locale || 'ko');
languageSelect.addEventListener('change', () => {
  setLanguage(languageSelect.value);
  if (authenticated) void refresh();
});

// Boot
if (activeRoute.fromLegacyHash) syncUrl(activeRoute.tab, activeRoute.view, false);
if (activeRoute.tab === 'qa' && activeRoute.view === 'metrics') dataset = 'qa';
paintNavigation();

const submissionReview = createSubmissionReview({
  api, kstStamp,
  onSessionExpired: () => showSession({ authenticated: false }),
  onDecision: () => { void refreshBadges(); },
  onNavigate: (tab, view) => navigate(tab, view)
});
const l10nController = createL10nController({
  api, apiBase, number, percent, kstStamp, notice,
  onNavigate: (tab, view) => navigate(tab, view),
  onBadgesChanged: () => { void refreshBadges(); },
  onAuthError: handleAuthError
});
const storeController = createStoreController({
  api, number, kstStamp, notice,
  onNavigate: (tab, view) => navigate(tab, view),
  onBadgesChanged: () => { void refreshBadges(); },
  onAuthError: handleAuthError
});

try {
  let session = await api('/api/admin/session');
  if (localLoginToken) {
    csrf = session.csrfToken;
    try { session = await api('/api/admin/local-login', { method: 'POST', body: { token: localLoginToken } }); }
    catch {
      if (!session.authenticated && session.localAutoLogin === true) {
        try { session = await api('/api/admin/local-auto-login', { method: 'POST', body: {} }); }
        catch { notice('로컬 자동 로그인에 실패했습니다. 관리자 비밀번호로 로그인하거나 런처를 다시 열어 주세요.', true); }
      } else if (!session.authenticated) {
        notice('로컬 자동 로그인에 실패했습니다. 관리자 비밀번호로 로그인하거나 런처를 다시 열어 주세요.', true);
      }
    }
  } else if (!session.authenticated && session.localAutoLogin === true) {
    let loggedOut = false;
    try { loggedOut = sessionStorage.getItem(LOCAL_LOGOUT_KEY) === '1'; } catch {}
    if (!loggedOut) {
      csrf = session.csrfToken;
      try { session = await api('/api/admin/local-auto-login', { method: 'POST', body: {} }); }
      catch { /* fall back to login panel with local auto-login button */ }
    }
  }
  showSession(session);
  if (authenticated) {
    // Pre-fetch catalog and community silently when landing on non-metrics views so dropdowns & legacy flows are ready.
    await refresh();
    if (!catalog.length) {
      const gamesRes = await api('/api/admin/games').catch(() => ({ games: [] }));
      catalog = gamesRes.games || [];
      paintCommunityGames();
      paintGameFilter(catalog);
    }
    if (!communityLoaded) void refreshCommunity(0);
  }
} catch (error) {
  $('session-label').textContent = '연결 실패';
  $('login-panel').hidden = false;
  notice('관리 API 연결을 확인해 주세요. 서버가 준비되면 관리자 로그인을 다시 누를 수 있습니다. ' + error.message, true);
} finally {
  localLoginToken = undefined;
}
refreshTimer = setInterval(() => { if (!document.hidden && authenticated) void refresh(); }, 30000);
window.addEventListener('pagehide', () => clearInterval(refreshTimer));
