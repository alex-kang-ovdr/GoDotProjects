const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
};

const raw = (tag, text, className) => {
  const node = el(tag, text, className);
  node.dataset.noTranslate = '';
  node.translate = false;
  return node;
};

const pill = (text, tone = 'muted', noTranslate = false) =>
  (noTranslate ? raw : el)('span', text, `pill ${tone}`);

function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function panel(eyebrow, title, rightNode) {
  const sec = el('section', '', 'panel');
  const head = el('div', '', 'section-heading');
  const left = el('div', '');
  if (eyebrow) left.append(el('p', eyebrow, 'eyebrow'));
  left.append(el('h2', title));
  head.append(left);
  if (rightNode) head.append(rightNode);
  sec.append(head);
  return sec;
}

function kvList(rows) {
  const grid = el('div', '', 'kv-grid');
  for (const [label, value, tone, isRaw] of rows) {
    const row = el('div', '', 'kv-row');
    row.append(el('span', label));
    if (tone) row.append(pill(String(value), tone, Boolean(isRaw)));
    else row.append((isRaw ? raw : el)('strong', String(value ?? '—')));
    grid.append(row);
  }
  return grid;
}

function kpiGrid(items, fourCols = false) {
  const box = el('div', '', fourCols ? 'metrics four' : 'metrics');
  for (const [label, value, detail, isRaw] of items) {
    const card = el('div', '', 'metric');
    card.append(el('small', label), (isRaw ? raw : el)('strong', String(value)), el('p', detail || ''));
    box.append(card);
  }
  return box;
}

function simpleTable(headers, rows, emptyText) {
  const wrap = el('div', '', 'table-wrap');
  const table = el('table', '');
  const thead = el('thead', '');
  const headRow = el('tr', '');
  for (const h of headers) {
    const th = el('th', h);
    th.scope = 'col';
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = el('tbody', '');
  if (!rows.length) {
    const tr = el('tr', '');
    const td = el('td', emptyText, 'empty');
    td.colSpan = headers.length;
    tr.append(td);
    tbody.append(tr);
  } else {
    for (const cells of rows) {
      const tr = el('tr', '');
      for (const cell of cells) {
        const td = el('td', '');
        if (cell instanceof Node) td.append(cell);
        else td.textContent = String(cell ?? '—');
        tr.append(td);
      }
      tbody.append(tr);
    }
  }
  table.append(thead, tbody);
  wrap.append(table);
  return wrap;
}

export function renderActionQueue(container, badges, onNavigate) {
  if (!badges) { container.replaceChildren(); return; }
  const items = [
    {
      label: '제출 심사 대기',
      value: badges.hub.pendingSubmissions,
      cta: '제출 검수 센터 →',
      alert: badges.hub.pendingSubmissions > 0,
      target: ['hub', 'submissions']
    },
    {
      label: '미처리 신고 커뮤니티 글',
      value: badges.hub.reportedCommunity,
      cta: '신고 글 확인 →',
      alert: badges.hub.reportedCommunity > 0,
      target: ['hub', 'community', { reported: 'only' }]
    },
    {
      label: '최근 24시간 실행 오류',
      value: badges.system.errors24h,
      cta: '통합 오류 모니터링 →',
      alert: badges.system.errors24h > 0,
      target: ['system', 'errors']
    },
    {
      label: 'QA 리포트 · AI 실행',
      value: `${badges.qa.qaRunsCount} / ${badges.qa.aiRunsCount}`,
      cta: 'QA 대시보드 →',
      alert: badges.qa.qaErrors24h > 0,
      target: ['qa', 'overview']
    }
  ];
  container.replaceChildren(...items.map(item => {
    const btn = el('button', '', 'action-card' + (item.alert ? ' alert' : ''));
    btn.type = 'button';
    btn.append(el('small', item.label), raw('strong', String(item.value)), el('span', item.cta));
    btn.addEventListener('click', () => onNavigate(...item.target));
    return btn;
  }));
}

export function renderGameDetail(container, detail, { number, kstStamp, onToggle }) {
  const titles = Object.entries(detail.titles || {}).map(([loc, text]) => `${loc}: ${text}`).join(' · ');
  const summaryRows = [
    ['게임 ID', detail.id, null, true],
    ['공개 상태', detail.enabled ? '공개' : '비공개', detail.enabled ? 'ok' : 'warn'],
    ['빌드 ID', detail.buildId || '—', null, true],
    ['버전', detail.version || '—', null, true],
    ['장르 / 태그', (detail.tags || []).join(', ') || detail.genre || '—', null, true],
    ['조작 방식', (detail.controls || []).join(', ') || '미지정', null, true],
    ['화면 방향', detail.orientation || 'any', null, true],
    ['저장 스키마', `v${detail.saveSchemaVersion || 1}`, null, true],
    ['출시 / 갱신일', `${detail.publishedOn || '—'} / ${detail.updatedOn || '—'}`, null, true],
    ['최근 24시간 오류', number(detail.stats?.errors24h || 0), detail.stats?.errors24h ? 'danger' : 'ok']
  ];
  const stats = kpiGrid([
    ['커뮤니티 글', number(detail.stats?.communityCount || 0), '전체 댓글·개선 제안'],
    ['공개 글 신고', number(detail.stats?.openReports || 0), '숨김 전 미처리 신고'],
    ['찜 등록', number(detail.stats?.wishlistCount || 0), '사용자 찜 합계'],
    ['저장 슬롯', number(detail.stats?.saveSlotCount || 0), '서버 저장 슬롯 수']
  ], true);
  const localesBlock = el('div', '', 'sub-card');
  localesBlock.append(el('h3', '다국어 제목 현황'), raw('p', titles || detail.title));
  const actionRow = el('div', '', 'inline-actions');
  const toggleBtn = el('button', detail.enabled ? '비공개로 전환' : '공개로 전환', detail.enabled ? 'quiet' : 'primary');
  toggleBtn.type = 'button';
  toggleBtn.addEventListener('click', () => onToggle(detail));
  actionRow.append(toggleBtn, el('span', '카탈로그 메타데이터는 읽기 전용으로 조회되며 공개 상태 변경은 감사 로그에 기록됩니다.', 'muted'));
  container.replaceChildren(stats, el('div', '', 'panel-foot'), kvList(summaryRows), el('div', '', 'panel-foot'), localesBlock, el('div', '', 'panel-foot'), actionRow);
}

export function renderHubUsers(container, data, { number, kstStamp }) {
  const c = data.counts || {};
  const top = panel('USERS & SAVES', '사용자 및 저장 현황');
  top.append(kpiGrid([
    ['전체 이용 주체', number(c.totalUsers), `회원 ${number(c.registeredUsers)} · 게스트 ${number(c.guestUsers)}`],
    ['Google 연동 계정', number(c.googleIdentities), 'Hub OAuth 신원 연결'],
    ['서버 저장 슬롯', number(c.saveSlots), `충돌·복원 백업 ${number(c.saveBackups)}건`],
    ['분석 연결 · 찜', `${number(c.analyticsLinks)} / ${number(c.wishlistItems)}`, '게스트 이력 연결 / 찜 합계']
  ], true));
  top.append(el('p', '개인정보 보호 원칙에 따라 원시 게임 저장 payload와 Google subject 원문은 표시하지 않습니다.', 'panel-foot'));

  const merges = panel('MERGE & BACKUPS', '최근 게스트 기록 병합 및 백업 사유');
  const reasons = (data.backupReasons || []).map(r => [raw('strong', r.reason), number(r.count)]);
  const mergeRows = (data.recentMerges || []).map(m => [
    raw('strong', m.id),
    pill(m.status, m.status === 'completed' ? 'ok' : m.status === 'pending' ? 'warn' : 'muted', true),
    raw('span', kstStamp(m.expiresAt)),
    m.hasResult ? '기록 있음' : '—'
  ]);
  const cols = el('div', '', 'two-columns');
  const left = el('div', '');
  left.append(el('h3', '저장 백업 사유 집계'), simpleTable(['사유', '건수'], reasons, '저장 백업 기록이 없습니다.'));
  const right = el('div', '');
  right.append(el('h3', '최근 기록 병합 요청'), simpleTable(['요청 ID(앞 12자)', '상태', '만료 시각', '결과'], mergeRows, '기록 병합 요청이 없습니다.'));
  cols.append(left, right);
  merges.append(cols);
  container.replaceChildren(top, merges);
}

export function renderSystemOverview(container, data, { number, kstStamp, onNavigate }) {
  const s = data.service, n = data.network, d = data.database, f = data.features, a = data.auth;
  const kpis = kpiGrid([
    ['API 서비스 상태', 'ONLINE', `v${s.version} · Node ${s.nodeVersion}`, true],
    ['SQLite DB 크기', formatBytes(d.sizeBytes), `WAL ${formatBytes(d.walSizeBytes)} · schema v${d.userVersion}`, true],
    ['활성 관리자 세션', number(d.counts.activeAdminSessions), `총 감사 기록 ${number(d.counts.audit)}건`],
    ['최근 백업 스냅샷', `${number(data.backups?.length || 0)}건`, d.maintenanceLock ? '유지보수 잠금 활성' : '정상 운영 중']
  ], true);

  const healthPanel = panel('SYSTEM HEALTH', '런타임 및 보안 경계 요약');
  healthPanel.append(kpis, el('div', '', 'panel-foot'), kvList([
    ['관리자 리스너 격리 (Loopback)', n.adminLoopbackOnly ? `PASS (${n.adminHost}:${n.adminPort})` : `WARN (${n.adminHost})`, n.adminLoopbackOnly ? 'ok' : 'danger', true],
    ['공개 리스너 바인딩', `${n.publicHost}:${n.publicPort}`, 'info', true],
    ['데이터 경로 분리 (루트 외부)', d.dataDirOutsideRoot ? 'PASS' : 'CHECK', d.dataDirOutsideRoot ? 'ok' : 'warn'],
    ['유지보수 잠금 (maintenance.lock)', d.maintenanceLock ? 'LOCKED' : 'OFF', d.maintenanceLock ? 'danger' : 'ok'],
    ['Google OAuth 설정', a.googleConfigured ? 'CONFIGURED' : 'NOT CONFIGURED', a.googleConfigured ? 'ok' : 'muted'],
    ['Forge 통합 활성화', f.forgeEnabled ? 'ENABLED' : 'DISABLED', f.forgeEnabled ? 'ok' : 'muted'],
    ['로컬 자동 관리자 로그인', a.localAutoLogin ? 'ON (로컬 개발용)' : 'OFF (비밀번호 인증)', a.localAutoLogin ? 'warn' : 'ok'],
    ['프로세스 가동 시간', `${number(s.uptimeSeconds)}초 (PID ${s.pid})`, null, true]
  ]));

  const countsPanel = panel('DATA INVENTORY', '플랫폼 데이터베이스 테이블 현황');
  countsPanel.append(kpiGrid([
    ['플레이 세션 (live / qa)', `${number(d.counts.playSessions)} / ${number(d.counts.qaPlaySessions)}`, '트래픽 유형 분리'],
    ['제출 심사 · QA 실행', `${number(d.counts.submissions)} / ${number(d.counts.qaRuns)}`, 'creator_submissions / qa_runs'],
    ['커뮤니티 · 오류 기록', `${number(d.counts.communityItems)} / ${number(d.counts.errors)}`, '전체 누적 건수']
  ]));
  const shortcuts = el('div', '', 'inline-actions');
  for (const [label, tab, view] of [['환경·연동 설정', 'system', 'config'], ['온라인 백업 실행', 'system', 'backups'], ['빌드·배포 (DevOps)', 'system', 'devops'], ['통합 오류 확인', 'system', 'errors'], ['통합 감사 로그', 'system', 'audit']]) {
    const btn = el('button', label, 'quiet');
    btn.type = 'button';
    btn.addEventListener('click', () => onNavigate(tab, view));
    shortcuts.append(btn);
  }
  countsPanel.append(el('div', '', 'panel-foot'), shortcuts);
  container.replaceChildren(healthPanel, countsPanel);
}

export function renderSystemConfig(container, data) {
  const n = data.network, a = data.auth, f = data.features;
  const p1 = panel('CONFIGURATION (READ-ONLY)', '네트워크·도메인 및 인증 설정 진단');
  p1.append(kvList([
    ['사용자 사이트 주소 (userBaseUrl)', n.userBaseUrl || '—', null, true],
    ['공개 API 주소 (publicBaseUrl)', n.publicBaseUrl || '—', null, true],
    ['관리자 사이트 주소 (adminBaseUrl)', n.adminBaseUrl || '—', null, true],
    ['허용 사용자 Origin', (n.userOrigins || []).join(', ') || '—', null, true],
    ['허용 관리자 Origin', (n.adminOrigins || []).join(', ') || '—', null, true],
    ['Secure Cookie', n.secureCookies ? 'true (HTTPS)' : 'false (Local HTTP)', n.secureCookies ? 'ok' : 'warn', true],
    ['검색 엔진 인덱싱', n.searchIndexingEnabled ? '허용' : '차단 (noindex)', n.searchIndexingEnabled ? 'info' : 'muted'],
    ['Google OAuth 콜백', a.googleRedirectUri || '미설정', a.googleConfigured ? 'ok' : 'muted', true]
  ]));
  p1.append(el('p', '보안 원칙에 따라 OAuth Client Secret, Drive Refresh Token, 관리자 해시·salt 등 비밀정보는 API 및 화면에 노출하지 않으며 설정 변경은 서버 private 설정/환경변수에서만 수행합니다.', 'panel-foot'));

  const p2 = panel('FEATURE FLAGS', '컴포넌트 기능 활성화 상태');
  p2.append(kvList([
    ['Forge 계정/프로젝트 API (forge.enabled)', f.forgeEnabled ? 'ON' : 'OFF', f.forgeEnabled ? 'ok' : 'muted'],
    ['Forge Web 빌드 워커 (forge.builds.enabled)', f.forgeBuildsEnabled ? 'ON' : 'OFF', f.forgeBuildsEnabled ? 'ok' : 'muted'],
    ['운영자 Google Drive 동기화 (forge.drive.enabled)', f.forgeDriveEnabled ? 'ON' : 'OFF', f.forgeDriveEnabled ? 'ok' : 'muted'],
    ['배포 ZIP 아카이브 (forge.packages.enabled)', f.forgePackagesEnabled ? 'ON' : 'OFF', f.forgePackagesEnabled ? 'ok' : 'muted'],
    ['Drive OAuth 환경변수 (PLAYHUB_DRIVE_*)', f.driveCredentialsConfigured ? 'SET' : 'UNSET', f.driveCredentialsConfigured ? 'ok' : 'muted'],
    ['Forge 저장 경로 루트 외부 격리', f.forgeDirectoryOutsideRoot === null ? '미설정' : f.forgeDirectoryOutsideRoot ? 'PASS' : 'WARN', f.forgeDirectoryOutsideRoot ? 'ok' : 'muted']
  ]));
  container.replaceChildren(p1, p2);
}

export function renderSystemAccess(container, data, { kstStamp }) {
  const a = data.auth;
  const p1 = panel('ADMINISTRATOR SESSIONS', '현재 관리자 계정 및 활성 세션');
  p1.append(kvList([
    ['현재 구성 모드', '단일 관리자 계정 (v0.3)', 'info'],
    ['관리자 이름', a.adminUsername, null, true],
    ['비밀번호 해시 구성', a.passwordConfigured ? 'scrypt 설정 완료' : '미설정 (hub/tools/setup.mjs 필요)', a.passwordConfigured ? 'ok' : 'warn'],
    ['로컬 자동 로그인 링크', a.localAutoLogin ? '활성 (127.0.0.1 단일 사용 60초)' : '비활성', a.localAutoLogin ? 'warn' : 'ok']
  ]));
  const sessionRows = (data.sessions || []).map(s => [
    raw('strong', s.sessionPrefix + '…'),
    raw('span', s.username),
    raw('span', kstStamp(s.createdAt)),
    raw('span', kstStamp(s.expiresAt))
  ]);
  p1.append(el('div', '', 'panel-foot'), simpleTable(['세션 식별자', '계정', '발급 시각', '만료 시각'], sessionRows, '활성 관리자 세션이 없습니다.'));

  const p2 = panel('RBAC ROADMAP (P3)', '목표 역할별 4대 탭 권한 모델');
  const roleRows = (a.plannedRoles || []).map(r => [
    el('strong', r.label),
    r.system,
    r.hub,
    r.forge,
    r.qa
  ]);
  p2.append(simpleTable(['역할', '시스템', 'Hub', 'Forge', 'QA'], roleRows, '역할 정보 없음'));
  container.replaceChildren(p1, p2);
}

export function renderSystemBackups(container, data, { kstStamp, onCreateBackup }) {
  const createBtn = el('button', '온라인 백업 지금 생성', 'primary');
  createBtn.type = 'button';
  createBtn.dataset.testid = 'create-backup-btn';
  createBtn.disabled = Boolean(data.database?.maintenanceLock);
  const statusSpan = el('span', '', 'muted');
  statusSpan.setAttribute('role', 'status');
  const actions = el('div', '', 'inline-actions');
  actions.append(statusSpan, createBtn);

  createBtn.addEventListener('click', async () => {
    createBtn.disabled = true;
    statusSpan.textContent = 'SQLite 온라인 스냅샷 생성 및 무결성 검사 중...';
    try {
      await onCreateBackup();
      statusSpan.textContent = '백업 생성 및 무결성 검사를 완료했습니다.';
    } catch (error) {
      statusSpan.textContent = error.message || '백업 생성에 실패했습니다.';
      createBtn.disabled = false;
    }
  });

  const p1 = panel('ONLINE SNAPSHOTS', 'SQLite 온라인 백업 및 복원 관리', actions);
  const rows = (data.backups || []).map(b => [
    raw('strong', b.filename),
    raw('span', b.createdAt ? kstStamp(b.createdAt) : '—'),
    raw('span', formatBytes(b.bytes)),
    raw('span', b.sha256Prefix ? `${b.sha256Prefix}…` : '—'),
    pill(b.integrity === 'ok' && b.foreignKeys === 'ok' ? '무결성 OK' : '확인 필요', b.integrity === 'ok' && b.foreignKeys === 'ok' ? 'ok' : 'danger')
  ]);
  p1.append(simpleTable(['파일명', '생성 시각', '크기', 'SHA-256 (앞 16자)', '검증'], rows, '아직 생성된 온라인 백업이 없습니다.'));
  p1.append(el('p', '복원은 서비스 중지 및 유지보수 잠금(maintenance.lock) 절차가 필요하므로 CLI 도구(node hub/tools/restore-data.mjs --verify / --apply)를 통해 수행합니다.', 'panel-foot'));
  container.replaceChildren(p1);
}

export function renderForgeOverview(container, data, { number, onNavigate }) {
  const c = data.configured, b = data.buildSummary;
  const p1 = panel('FORGE OVERVIEW', 'PlayForge 창작 인프라 현황');
  p1.append(kpiGrid([
    ['Forge 통합 API', c.enabled ? 'ENABLED' : 'DISABLED', c.serverPresent ? 'forge/server.cjs 확인됨' : 'forge 서버 파일 없음', true],
    ['공식 템플릿', number(data.templates?.length || 0), 'forge/Templates 카탈로그'],
    ['창작자 프로젝트', number(data.projects?.length || 0), c.enabled ? 'Hub 소유 private 저장소' : 'Forge 비활성 시 0건'],
    ['Web 빌드 잡', `${number(b.succeeded)} 성공 / ${number(b.failed)} 실패`, `대기 ${number(b.queued)} · 실행 ${number(b.running)}`]
  ], true));
  p1.append(el('div', '', 'panel-foot'), kvList([
    ['공식 웹 에디터 자산 (/OfficialGodot/)', c.officialEditorPresent ? '설치됨' : '미설치', c.officialEditorPresent ? 'ok' : 'warn'],
    ['Web 빌드 워커 (forge.builds.enabled)', c.buildsEnabled ? '활성' : '비활성', c.buildsEnabled ? 'ok' : 'muted'],
    ['운영자 Drive 동기화 (forge.drive.enabled)', c.driveEnabled ? '활성' : '비활성', c.driveEnabled ? 'ok' : 'muted'],
    ['배포 ZIP 아카이브 (forge.packages.enabled)', c.packagesEnabled ? '활성' : '비활성', c.packagesEnabled ? 'ok' : 'muted'],
    ['Drive 폴더 분리 검증 (스냅샷 ≠ 패키지)', c.separateFoldersValid ? 'PASS' : '미구성', c.separateFoldersValid ? 'ok' : 'muted'],
    ['Drive OAuth 토큰 환경변수', c.driveTokenConfigured ? '구성됨' : '미구성', c.driveTokenConfigured ? 'ok' : 'muted']
  ]));
  const navRow = el('div', '', 'inline-actions');
  for (const [label, view] of [['템플릿·프로젝트', 'projects'], ['Web 빌드 큐', 'builds'], ['Drive 동기화', 'drive'], ['협업·멀티플레이', 'sessions']]) {
    const btn = el('button', label, 'quiet');
    btn.type = 'button';
    btn.addEventListener('click', () => onNavigate('forge', view));
    navRow.append(btn);
  }
  p1.append(el('div', '', 'panel-foot'), navRow);
  container.replaceChildren(p1);
}

export function renderForgeProjects(container, data, { number, kstStamp, onPublishTemplates, onPollPublishJob, onPublishComplete, userBaseUrl = '' }) {
  const pub = data.templatePublish || {};
  const templates = Array.isArray(pub.templates) && pub.templates.length ? pub.templates : (data.templates || []).map(t => ({
    ...t,
    gameId: `forge-${t.id}`,
    published: false,
    inHubDist: false,
    playUrl: `/play/forge-${t.id}/`
  }));
  const godotOk = pub.godot?.available !== false;
  const selectedIds = new Set(templates.filter(t => !t.published).map(t => t.id));
  if (!selectedIds.size) templates.forEach(t => selectedIds.add(t.id));

  const toolbar = el('div', '', 'inline-actions');
  const godotPill = pill(godotOk ? 'Godot Web 빌드 준비됨' : 'Godot 미감지', godotOk ? 'ok' : 'warn');
  const toggleAllBtn = el('button', '전체 선택/해제', 'quiet');
  toggleAllBtn.type = 'button';
  const batchBtn = el('button', `선택 일괄 퍼블리시 (${selectedIds.size})`, 'primary');
  batchBtn.type = 'button';
  batchBtn.dataset.testid = 'forge-batch-publish-btn';
  const publishAllBtn = el('button', '전체 일괄 퍼블리시', 'quiet');
  publishAllBtn.type = 'button';
  publishAllBtn.dataset.testid = 'forge-publish-all-btn';
  toolbar.append(godotPill, toggleAllBtn, batchBtn, publishAllBtn);

  const p1 = panel('OFFICIAL TEMPLATES · BATCH PUBLISH', '공식 스타터 템플릿 카탈로그 및 일괄 퍼블리시', toolbar);
  const progressHost = el('div', '', 'forge-publish-progress');
  progressHost.dataset.testid = 'forge-publish-progress';
  const checkboxes = new Map();
  const actionButtons = [];

  function syncButtons(running = false) {
    batchBtn.textContent = `선택 일괄 퍼블리시 (${selectedIds.size})`;
    batchBtn.disabled = running || !godotOk || selectedIds.size === 0 || !onPublishTemplates;
    publishAllBtn.disabled = running || !godotOk || templates.length === 0 || !onPublishTemplates;
    for (const btn of actionButtons) btn.disabled = running || !godotOk || !onPublishTemplates;
  }

  let pollTimer = null;
  function stopPoll() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  function renderJob(job) {
    if (!job) { progressHost.replaceChildren(); return; }
    const toneMap = { queued: 'muted', exporting: 'info', packaging: 'info', published: 'ok', failed: 'danger', running: 'info', completed: 'ok', partial: 'warn', succeeded: 'ok', pending: 'muted', skipped: 'muted', not_run: 'muted' };
    const statusLabel = { running: '퍼블리시 진행 중', completed: '일괄 퍼블리시 완료', partial: '일부 완료 (오류 확인)', failed: '퍼블리시 실패' }[job.status] || job.status;
    const box = el('div', '', 'surface-box');
    const head = el('div', '', 'section-heading');
    const left = el('div', '');
    left.append(
      pill(statusLabel, toneMap[job.status] || 'muted'),
      el('span', `  성공 ${number(job.summary?.succeeded || 0)} / ${number(job.summary?.total || 0)} · 실패 ${number(job.summary?.failed || 0)} · Hub 빌드: ${job.buildStatus || 'pending'}`, 'muted')
    );
    head.append(left, raw('small', `Job ${String(job.id || '').slice(0, 8)}`));
    box.append(head);
    if (job.buildError) box.append(el('p', `Hub 빌드 오류: ${job.buildError}`, 'form-error'));
    const jobRows = (job.items || []).map(item => {
      const linkCell = item.status === 'published' && job.buildStatus === 'succeeded'
        ? (() => {
            const a = el('a', 'Hub에서 플레이 ↗', 'toggle');
            a.href = `${userBaseUrl}${item.playUrl}`;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            return a;
          })()
        : raw('span', item.error || '—');
      return [
        raw('strong', `${item.name} (${item.gameId})`),
        pill(item.step || item.status, toneMap[item.status] || 'muted'),
        raw('span', item.durationMs != null ? `${(item.durationMs / 1000).toFixed(1)}초` : '—'),
        linkCell
      ];
    });
    box.append(simpleTable(['템플릿 (Hub ID)', '진행 상태', '소요 시간', '결과 / 링크'], jobRows, '항목 없음'));
    progressHost.replaceChildren(box);
  }

  async function watchJob(initialJob) {
    stopPoll();
    renderJob(initialJob);
    syncButtons(initialJob?.status === 'running');
    if (!initialJob || initialJob.status !== 'running' || !onPollPublishJob) return;
    const poll = async () => {
      if (!container.isConnected) { stopPoll(); return; }
      try {
        const latest = await onPollPublishJob(initialJob.id);
        renderJob(latest);
        if (latest.status === 'running') {
          pollTimer = setTimeout(poll, 1200);
        } else {
          syncButtons(false);
          if (onPublishComplete) await onPublishComplete();
        }
      } catch {
        syncButtons(false);
      }
    };
    pollTimer = setTimeout(poll, 1200);
  }

  async function triggerPublish(ids) {
    if (!onPublishTemplates) return;
    syncButtons(true);
    try {
      const job = await onPublishTemplates(ids);
      await watchJob(job);
    } catch (error) {
      syncButtons(false);
      progressHost.replaceChildren(el('p', error?.message || '일괄 퍼블리시 요청에 실패했습니다.', 'form-error'));
    }
  }

  toggleAllBtn.addEventListener('click', () => {
    const selectAll = selectedIds.size < templates.length;
    selectedIds.clear();
    for (const [id, cb] of checkboxes) {
      cb.checked = selectAll;
      if (selectAll) selectedIds.add(id);
    }
    syncButtons(false);
  });
  batchBtn.addEventListener('click', () => void triggerPublish([...selectedIds]));
  publishAllBtn.addEventListener('click', () => void triggerPublish('all'));

  const tRows = templates.map(t => {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selectedIds.has(t.id);
    cb.dataset.templateSelect = t.id;
    cb.setAttribute('aria-label', `${t.name} 선택`);
    cb.addEventListener('change', () => {
      if (cb.checked) selectedIds.add(t.id);
      else selectedIds.delete(t.id);
      syncButtons(false);
    });
    checkboxes.set(t.id, cb);

    const nameBox = el('div', '');
    nameBox.append(raw('strong', `${t.name} (${t.id})`), raw('small', `Hub ID: ${t.gameId}`));

    const statusWrap = el('div', '', 'row-actions');
    if (t.published && t.inHubDist) {
      statusWrap.append(pill('배포됨 · 플레이 가능', 'ok'));
      const playLink = el('a', '플레이 ↗', 'toggle');
      playLink.href = `${userBaseUrl}${t.playUrl}`;
      playLink.target = '_blank';
      playLink.rel = 'noopener noreferrer';
      statusWrap.append(playLink);
    } else if (t.published) {
      statusWrap.append(pill('카탈로그 등록 (빌드 대기)', 'warn'));
    } else {
      statusWrap.append(pill('미배포', 'muted'));
    }

    const oneBtn = el('button', t.published ? '재퍼블리시' : '퍼블리시', 'toggle');
    oneBtn.type = 'button';
    oneBtn.dataset.testid = `forge-publish-one-${t.id}`;
    oneBtn.addEventListener('click', () => void triggerPublish([t.id]));
    actionButtons.push(oneBtn);

    return [
      cb,
      nameBox,
      pill(String(t.dimension || '2d').toUpperCase(), 'info', true),
      raw('span', t.description || '—'),
      number(t.assetCount || 0),
      statusWrap,
      oneBtn
    ];
  });

  p1.append(
    progressHost,
    simpleTable(['선택', '템플릿 / Hub ID', '차원', '설명', '에셋', 'Hub 퍼블리시 상태', '실행'], tRows, '등록된 공식 템플릿이 없습니다.'),
    el('p', '선택한 Forge 템플릿을 Godot 헤드리스 Web 빌드로 내보낸 뒤 games/forge-<id> 패키지·카탈로그 등록 및 hub/dist 빌드까지 일괄 반영합니다.', 'panel-foot')
  );

  const initialJob = pub.activeJob || pub.recentJobs?.[0] || null;
  if (initialJob) void watchJob(initialJob);
  else syncButtons(false);

  const p2 = panel('CREATOR PROJECTS', '창작자 프로젝트 메타데이터 (읽기 전용)');
  const pRows = (data.projects || []).map(p => [
    raw('strong', p.name),
    raw('span', p.projectId),
    raw('span', p.ownerKeyPrefix + '…'),
    raw('span', `r${p.revision}`),
    number(p.releaseCount),
    raw('span', p.updatedAt ? kstStamp(p.updatedAt) : '—')
  ]);
  p2.append(simpleTable(['프로젝트명', '프로젝트 ID', '소유자 키', '리비전', '릴리스 수', '최근 수정'], pRows, data.configured?.enabled ? '저장된 창작자 프로젝트가 없습니다.' : 'Forge 통합이 비활성화되어 있습니다. private config에서 forge.enabled를 구성하세요.'));
  container.replaceChildren(p1, p2);
}

export function renderForgeBuilds(container, data, { number, kstStamp }) {
  const b = data.buildSummary || {}, pol = data.policy || {};
  const p1 = panel('WEB BUILD QUEUE', 'Godot Web 빌드 큐 및 ZIP 구조 검증');
  p1.append(kpiGrid([
    ['대기 / 실행 중', `${number(b.queued)} / ${number(b.running)}`, `큐 대기 상한 ${pol.maxBuildQueuePending || 3}건`],
    ['성공 빌드', number(b.succeeded), 'PlayForge-Web.zip 산출'],
    ['실패 빌드', number(b.failed), '로그 확인 필요'],
    ['ZIP 검증 한도', `${pol.maxZipCompressedMiB || 64} / ${pol.maxZipExpandedMiB || 128} MiB`, '압축 / 해제 · 루트 index.html 필수', true]
  ], true));
  const tone = st => st === 'succeeded' ? 'ok' : st === 'failed' ? 'danger' : st === 'running' ? 'info' : 'warn';
  const rows = (data.builds || []).map(job => [
    raw('strong', job.id),
    pill(job.source, 'muted', true),
    raw('span', job.projectId ? `${job.projectId} (r${job.revision ?? '?'})` : '—'),
    pill(job.status, tone(job.status), true),
    number(job.fileCount),
    raw('span', job.createdAt ? kstStamp(job.createdAt) : '—'),
    raw('span', job.error || '—')
  ]);
  p1.append(el('div', '', 'panel-foot'), simpleTable(['빌드 ID', '출처', '프로젝트 / 리비전', '상태', '파일 수', '요청 시각', '오류'], rows, '기록된 Web 빌드 잡이 없습니다.'));
  p1.append(el('p', 'ZIP 구조 검증 통과는 실행 검증(runnableVerified)이나 카탈로그 공개를 의미하지 않습니다. 신뢰되지 않은 다중 테넌트 빌드는 OS 격리 워커에서만 활성화하세요.', 'panel-foot'));
  container.replaceChildren(p1);
}

export function renderForgeDrive(container, data, { number }) {
  const c = data.configured || {}, d = data.driveSync || {}, ret = data.policy?.retentionDefaults || {};
  const p1 = panel('OPERATOR DRIVE STORAGE', '운영자 Google Drive 동기화 및 보존 정책');
  const rows = [
    ['프로젝트 스냅샷 (ProjectDriveSync)', d.snapshots],
    ['릴리스 소스 제출 아카이브 (<= 4 MiB JSON)', d.submissions],
    ['배포 Web ZIP 아카이브 (DeploymentZipArchive)', d.deployments]
  ].map(([label, stat]) => [
    el('strong', label),
    number(stat?.total || 0),
    pill(`${number(stat?.committed || 0)}건`, stat?.committed ? 'ok' : 'muted'),
    pill(`${number(stat?.verified || 0)}건`, stat?.verified ? 'ok' : 'muted'),
    number(stat?.pending || 0),
    pill(`${number(stat?.failed || 0)}건`, stat?.failed ? 'danger' : 'muted')
  ]);
  p1.append(simpleTable(['아카이브 유형', '총 기록', '업로드 완료 (cloudCommitted)', '원격 재검증 (cloudVerified)', '대기', '실패'], rows, '동기화 매니페스트 없음'));
  p1.append(el('div', '', 'panel-foot'), kvList([
    ['저장소 소유 주체', '서비스 운영자 Google 계정 (사용자 개인 Drive 아님)', 'info'],
    ['스냅샷 / 패키지 폴더 분리', c.separateFoldersValid ? '분리 확인됨' : '미구성', c.separateFoldersValid ? 'ok' : 'warn'],
    ['보존 정책 기본값 (drive-retention-policy)', `최신 ${ret.keepLatest || 20}개 유지 · 최소 ${ret.minAgeDays || 30}일 · Dry-Run 전용`, 'muted']
  ]));
  container.replaceChildren(p1);
}

export function renderForgeSessions(container, data) {
  const p1 = panel('LIVE COLLABORATION & MULTIPLAYER', '협업 편집 및 권한형 멀티플레이 운영 경계');
  const grid = el('div', '', 'card-grid');
  const c1 = el('div', '', 'sub-card');
  c1.append(
    el('h3', '협업 편집 세션 (SSE / 파일 동기화)'),
    el('p', '프로젝트별 참여자 활동(커서/클릭/타이핑)과 1.5초 주기 플러그인 파일 동기화를 제공합니다.'),
    el('p', '현재 접속 수는 브라우저 세션 기준이며, 같은 파일 충돌은 보존 후 충돌 해결 창으로 안내합니다.')
  );
  const c2 = el('div', '', 'sub-card');
  c2.append(
    el('h3', '권한형 멀티플레이 서버 방'),
    el('p', `지원 서비스: ${(data.policy?.multiplayerServices || []).join(' · ')}`),
    el('p', '방은 실행 중인 Forge 프로세스 메모리에 유지되며 방 생성 시 성공한 빌드와 리비전을 고정합니다.')
  );
  grid.append(c1, c2);
  p1.append(grid, el('p', '실시간 방 목록 조회 및 강제 종료 제어는 단일 도메인 프록시(/forge/*) 및 내부 세션 검증 연동(P2)에서 연결됩니다.', 'panel-foot'));
  container.replaceChildren(p1);
}

export function renderForgeSettings(container, data) {
  const pol = data.policy || {}, c = data.configured || {};
  const p1 = panel('FORGE POLICY & BOUNDARIES', 'Forge 운영 설정 및 단일 도메인 통합 정책');
  p1.append(kvList([
    ['주력 웹 에디터 경로', pol.primaryEditorPath || '/OfficialGodot/', 'ok', true],
    ['단일 도메인 프록시 경로', pol.proxyPathPrefix || '/forge/*', 'info', true],
    ['Cross-Origin Isolation (COOP/COEP)', '/forge/* 경로에만 격리 적용 (Hub 미적용)', 'ok'],
    ['인증 소유자', 'Hub Google 세션 쿠키 단일 권한 (Authorization 헤더 거부)', 'ok'],
    ['에디터 실행 방식', '최상위 문서 이동(새 탭 포함) · Hub 페이지 iframe 비권장', 'info'],
    ['GDScript 신뢰 경계', '로컬 신뢰 코드 · 공개 UGC는 별도 OS 격리 워커 필수', c.buildsEnabled ? 'warn' : 'muted']
  ]));
  container.replaceChildren(p1);
}

export function renderQaOverview(container, data, { number, onNavigate }) {
  const ds = data.datasetSummary || {}, ai = data.aiQa || {};
  const p1 = panel('QA QUALITY OVERVIEW', '품질 자동화 및 검증 현황');
  p1.append(kpiGrid([
    ['기록된 QA 실행 (qa_runs)', number(data.qaRuns?.length || 0), `리포트 산출물 ${number(data.artifacts?.length || 0)}건`],
    ['QA 플레이 세션', number(ds.qaPlaySessions || 0), `고유 qa_run_id ${number(ds.distinctQaRuns || 0)}건`],
    ['최근 24시간 QA 오류', number(ds.qaErrors24h || 0), `누적 QA 오류 ${number(ds.qaErrors || 0)}건`],
    ['AI 모델 플레이 QA', number(ai.runs?.length || 0), ai.inferenceHealth ? `${ai.inferenceHealth.model} (${ai.inferenceHealth.device})` : '추론 스냅샷 없음']
  ], true));
  const nav = el('div', '', 'inline-actions');
  for (const [label, view] of [['자동화 리포트 보기', 'runs'], ['AI 모델 플레이 QA', 'ai'], ['정책·체크리스트·격리', 'policies'], ['QA·가상 검증 지표 →', 'metrics']]) {
    const btn = el('button', label, view === 'metrics' ? 'primary' : 'quiet');
    btn.type = 'button';
    btn.addEventListener('click', () => onNavigate('qa', view));
    nav.append(btn);
  }
  p1.append(el('div', '', 'panel-foot'), nav);
  container.replaceChildren(p1);
}

export function renderQaRuns(container, data, { kstStamp }) {
  const statusTone = st => ['passed', 'pass'].includes(st) ? 'ok' : ['warned', 'warn', 'partial'].includes(st) ? 'warn' : ['failed', 'fail', 'error'].includes(st) ? 'danger' : 'muted';
  const p1 = panel('AUTOMATED QA RUNS', 'SQLite 기록 자동 QA 실행 (qa_runs)');
  const runRows = (data.qaRuns || []).map(r => [
    raw('strong', r.id.slice(0, 12)),
    raw('span', `${r.targetType}: ${r.targetId}`),
    raw('span', r.policyVersion),
    pill(r.status, statusTone(r.status), true),
    r.score == null ? '—' : String(r.score),
    raw('span', kstStamp(r.startedAt))
  ]);
  p1.append(simpleTable(['실행 ID', '대상', '정책', '상태', '점수', '시작 시각'], runRows, '아직 qa_runs 테이블에 기록된 실행이 없습니다.'));

  const p2 = panel('REPORT ARTIFACTS', '로컬 검증 보고서 산출물 (artifacts/gamerqa · hub/reports)');
  const artRows = (data.artifacts || []).map(a => {
    const s = a.summary || {};
    const summaryText = s.pass != null ? `pass ${s.pass} · fail ${s.fail || 0} · warn ${s.warn || 0} · skip ${s.skip || 0}` : '상세 JSON 참고';
    return [
      raw('strong', a.id),
      pill(a.source, 'info', true),
      raw('span', String(a.target || '—')),
      pill(String(a.status || 'unknown'), statusTone(a.status), true),
      raw('span', summaryText),
      raw('span', a.generatedAt ? kstStamp(a.generatedAt) : '—')
    ];
  });
  p2.append(simpleTable(['리포트 ID', '출처', '대상', '상태', '집계 (skip/not_run 미합산)', '생성 시각'], artRows, '감지된 검증 보고서 JSON이 없습니다.'));
  p2.append(el('p', 'skip, not_run, error 항목은 통과(pass)로 합산하지 않습니다.', 'panel-foot'));
  container.replaceChildren(p1, p2);
}

export function renderQaAi(container, data, { kstStamp }) {
  const ai = data.aiQa || {}, h = ai.inferenceHealth;
  const p1 = panel('GAMER AI PLAYTEST', 'GameScaling 추론 서버 및 AI 모델 플레이 QA');
  if (h) {
    p1.append(kvList([
      ['추론 스냅샷 상태', h.status, h.status === 'ok' ? 'ok' : 'warn', true],
      ['모델 체크포인트', h.model || '—', null, true],
      ['실행 장치 / 정밀도', `${h.device || '—'} / ${h.dtype || '—'}`, 'info', true],
      ['GPU / VRAM', h.gpuName ? `${h.gpuName} (${h.vramUsedMb ?? '?'} / ${h.vramTotalMb ?? '?'} MB)` : '—', null, true],
      ['최대 입력 해상도', h.maxImageSize ? `${h.maxImageSize[0]}×${h.maxImageSize[1]}` : '—', null, true],
      ['스모크 검증 (inference-smoke.json)', ai.smokeOk === null ? '미확인' : ai.smokeOk ? 'PASS' : 'FAIL', ai.smokeOk ? 'ok' : 'muted']
    ]));
  } else {
    p1.append(el('p', 'tools/Gamer/TestResults/inference-health.json 스냅샷이 아직 없습니다. 로컬에서 Run-Inference.ps1 및 Smoke-Inference.ps1 실행 후 결과가 표시됩니다.', 'muted'));
  }

  const p2 = panel('AI RUN HISTORY', 'AI 플레이테스트 실행 결과 (tools/Gamer/TestResults)');
  const rows = (ai.runs || []).map(r => [
    raw('strong', r.runId),
    raw('span', (r.games || []).join(', ') || '—'),
    pill(r.controller || 'model', 'info', true),
    r.objectiveMet === null ? pill('미측정', 'muted') : pill(r.objectiveMet ? '목표 달성' : '미달성', r.objectiveMet ? 'ok' : 'warn'),
    raw('span', `${r.decisions ?? '—'} / ${r.stepsLimit ?? '—'}`),
    raw('span', r.stopReason || '—'),
    raw('span', r.at ? kstStamp(r.at) : '—')
  ]);
  p2.append(simpleTable(['실행 ID', '게임', '컨트롤러', '목표 달성', '결정 / 스텝', '종료 사유', '실행 시각'], rows, '기록된 AI 모델 플레이 QA 결과가 없습니다.'));
  container.replaceChildren(p1, p2);
}

export function renderQaPolicies(container, data) {
  const p1 = panel('REVIEW CHECKLIST', `수동 검수 기준 (${data.manualChecklist?.version || 'manual-review.v1'})`);
  const list = el('div', '');
  for (const item of data.manualChecklist?.items || []) {
    const row = el('div', '', 'kv-row');
    row.append(el('span', item.label), pill(item.required ? '필수 항목' : '선택', item.required ? 'ok' : 'muted'));
    list.append(row);
  }
  p1.append(list);

  const p2 = panel('POLICIES · SCHEDULES · QUARANTINE', '자동 심사 정책 · 스케줄 · Flaky 격리 현황');
  const polRows = (data.policies || []).map(p => [raw('strong', p.version), raw('span', p.file), String(p.ruleCount), raw('span', p.updatedAt || '—')]);
  const qRows = (data.quarantine || []).map(q => [raw('strong', q.testId || q.id || '—'), raw('span', q.reason || '—'), raw('span', q.expiresAt || '만료일 필수')]);
  const cols = el('div', '', 'two-columns');
  const left = el('div', '');
  left.append(el('h3', '심사 정책 버전 (policies/*.json)'), simpleTable(['버전', '파일', '규칙 수', '갱신일'], polRows, '등록된 정책 JSON이 아직 없습니다.'));
  const right = el('div', '');
  right.append(el('h3', 'Flaky 격리 목록 (quarantine.json)'), simpleTable(['테스트 ID', '사유', '만료일'], qRows, '격리 중인 불안정 테스트가 없습니다.'));
  cols.append(left, right);
  p2.append(cols, el('p', '증거 보존 기준: 심사 보고서 영구 · 영상/스크린샷 90일 · 회귀 산출물 30일. 정책 변경은 기존 vN 수정 없이 새 버전으로 추가합니다.', 'panel-foot'));
  container.replaceChildren(p1, p2);
}

export function renderQaRunIdsTable(container, qaRunIds, { number, kstStamp, onSelectRunId }) {
  const rows = (qaRunIds || []).map(r => {
    const btn = el('button', '이 실행으로 필터', 'quiet');
    btn.type = 'button';
    btn.addEventListener('click', () => onSelectRunId(r.qaRunId));
    return [
      raw('strong', r.qaRunId),
      number(r.sessions),
      pill(`${number(r.errors)}건`, r.errors ? 'danger' : 'ok'),
      raw('span', kstStamp(r.lastAt)),
      btn
    ];
  });
  container.replaceChildren(simpleTable(['qa_run_id', '세션 수', '오류 수', '최근 시각', '조회'], rows, '기록된 QA 실행 ID가 없습니다.'));
}

export function renderSystemDevops(container, data, { kstStamp, onCreateManualPlan, onStartPreview, onStopPreview }) {
  const b = data.briefing || {};
  const verdictTone = b.verdict === 'PASS' ? 'ok' : b.verdict === 'MISSED_TODAY' ? 'warn' : 'danger';

  const briefPanel = panel('DAILY BUILD BRIEFING (READ-ONLY)', `오전 데일리 브리핑 (${data.todayKst || ''})`, pill(b.verdict || 'UNKNOWN', verdictTone, true));
  briefPanel.append(kpiGrid([
    ['오늘 빌드 판정', b.verdict || '—', b.latestRunId || '오늘 실행 기록 없음', true],
    ['최근 정상 빌드 (last-known-good)', b.latestGoodRunId || '—', '롤백 기준 포인터', true],
    ['Google Drive 아카이브', b.archiveStatus || 'none', 'SHA-256 검증 상태', true],
    ['로컬 격리 프리뷰', `${(data.previews || []).filter(p => p.alive).length}개 실행 중`, `총 ${(data.previews || []).length}개 기록`]
  ], true));

  const triggerPanel = panel('MANUAL BUILD & TEST TRIGGER', '특정 브랜치 · 커밋 수동 빌드 및 로컬 / Dev 선택 테스트');
  const form = el('form', '', 'metrics-filters');
  form.dataset.testid = 'devops-manual-form';

  const refSelect = el('select', '');
  refSelect.id = 'devops-ref-select';
  refSelect.dataset.testid = 'devops-ref-select';
  for (const br of (data.refs?.branches || [])) {
    const opt = el('option', `브랜치: ${br.name} (${br.shortCommit})`);
    opt.value = br.name;
    refSelect.append(opt);
  }
  for (const cm of (data.refs?.commits || []).slice(0, 12)) {
    const opt = el('option', `커밋: ${cm.shortCommit} — ${cm.subject.slice(0, 48)}`);
    opt.value = cm.commit;
    refSelect.append(opt);
  }
  const refInput = el('input', '');
  refInput.id = 'devops-ref-input';
  refInput.dataset.testid = 'devops-ref-input';
  refInput.placeholder = '직접 입력 (브랜치명 또는 커밋 SHA)';
  refInput.value = refSelect.value || 'HEAD';
  refSelect.addEventListener('change', () => { refInput.value = refSelect.value; });

  const buildSelect = el('select', '');
  buildSelect.dataset.testid = 'devops-build-target';
  for (const [val, label] of [['local', '로컬 격리 빌드'], ['cloudbuild', 'Google Cloud Build (playhub-dev-2611)']]) {
    const opt = el('option', label); opt.value = val; buildSelect.append(opt);
  }

  const testSelect = el('select', '');
  testSelect.dataset.testid = 'devops-test-target';
  for (const [val, label] of [
    ['local-preview', '로컬 격리 프리뷰 (포트 18280+)'],
    ['dev-tag', 'Dev 서버 독립 태그 (rev-<sha>, 트래픽 0%)'],
    ['dev-promote', 'Dev 서버 메인 승격 (트래픽 100%)'],
    ['none', '빌드·아카이브만 (테스트 서버 없음)']
  ]) {
    const opt = el('option', label); opt.value = val; testSelect.append(opt);
  }

  const portInput = el('input', '');
  portInput.type = 'number';
  portInput.min = '1024';
  portInput.max = '60000';
  portInput.value = '18280';
  portInput.dataset.testid = 'devops-preview-port';

  const makeLabel = (text, ctrl) => { const lb = el('label', text); lb.append(ctrl); return lb; };
  const planBtn = el('button', '실행 계획 생성', 'primary');
  planBtn.type = 'submit';
  planBtn.dataset.testid = 'devops-plan-btn';
  const startBtn = el('button', '로컬 격리 프리뷰 시작', 'quiet');
  startBtn.type = 'button';
  startBtn.dataset.testid = 'devops-start-preview-btn';
  if (!data.localPreviewAvailable) {
    startBtn.disabled = true;
    startBtn.title = 'tools/devops/local-preview.mjs가 현재 워크트리에서 확인되지 않았습니다.';
  }

  form.append(
    makeLabel('브랜치 / 커밋 선택', refSelect),
    makeLabel('대상 Ref', refInput),
    makeLabel('빌드 위치', buildSelect),
    makeLabel('테스트 대상', testSelect),
    makeLabel('로컬 포트', portInput),
    planBtn,
    startBtn
  );

  const planResultBox = el('div', '', 'sub-card');
  planResultBox.hidden = true;
  planResultBox.dataset.testid = 'devops-plan-output';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    planBtn.disabled = true;
    try {
      const res = await onCreateManualPlan({
        ref: refInput.value.trim() || 'HEAD',
        buildTarget: buildSelect.value,
        testTarget: testSelect.value,
        localBasePort: Number(portInput.value || 18280)
      });
      const plan = res.plan;
      planResultBox.hidden = false;
      const linkNode = plan.previewUrl.startsWith('http://127.0.0.1')
        ? (() => { const a = el('a', plan.previewUrl); a.href = plan.previewUrl; a.target = '_blank'; a.rel = 'noopener'; return a; })()
        : raw('strong', plan.previewUrl);
      planResultBox.replaceChildren(
        el('h3', `생성된 실행 계획 (${plan.runId})`),
        kvList([
          ['확정 커밋', `${plan.source.shortCommit} (${plan.source.ref})`, 'info', true],
          ['빌드 / 테스트', `${plan.buildTarget} → ${plan.testTarget}`, 'ok', true],
          ['예상 테스트 주소', plan.previewUrl, null, true],
          ['Dev 트래픽 영향', plan.devDeployment ? `${plan.devDeployment.trafficPercent}% (${plan.devDeployment.revisionTag || 'main'})` : '0% (로컬 격리)', 'ok', true]
        ]),
        el('p', '', 'panel-foot')
      );
      planResultBox.lastChild.append('테스트 대상 URL: ', linkNode);
    } finally {
      planBtn.disabled = false;
    }
  });

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    try {
      await onStartPreview({
        ref: refInput.value.trim() || 'HEAD',
        basePort: Number(portInput.value || 18280)
      });
    } finally {
      startBtn.disabled = false;
    }
  });

  triggerPanel.append(
    form,
    planResultBox,
    el('p', '보안 경계: 기본 포트(8080/8081/8090/8091/4177) 충돌을 자동 차단하며, 모든 수동 트리거는 관리자 CSRF 검증 및 감사 로그에 기록됩니다.', 'panel-foot')
  );

  const previewPanel = panel('LOCAL ISOLATED PREVIEWS', '로컬 격리 테스트 인스턴스');
  const previewRows = (data.previews || []).map(p => {
    const link = p.urls?.user
      ? (() => { const a = el('a', p.urls.user); a.href = p.urls.user; a.target = '_blank'; a.rel = 'noopener'; return a; })()
      : raw('span', '—');
    const stopBtn = el('button', '중지 및 정리', 'quiet');
    stopBtn.type = 'button';
    stopBtn.addEventListener('click', async () => {
      stopBtn.disabled = true;
      try { await onStopPreview({ runId: p.runId, cleanup: true }); } finally { stopBtn.disabled = false; }
    });
    return [
      raw('strong', p.runId),
      raw('span', `${p.ref} (${p.shortCommit})`),
      pill(p.alive ? 'RUNNING' : 'STOPPED', p.alive ? 'ok' : 'muted', true),
      link,
      raw('span', kstStamp(p.startedAt)),
      stopBtn
    ];
  });
  previewPanel.append(simpleTable(['프리뷰 ID', '브랜치/커밋', '상태', '접속 URL', '시작 시각', '작업'], previewRows, '실행 중인 로컬 프리뷰가 없습니다.'));

  const buildsPanel = panel('DAILY & MANUAL BUILD HISTORY', '최근 빌드 · 아카이브 이력');
  const buildRows = (data.builds || []).map(row => [
    raw('strong', row.runId),
    pill(String(row.overallStatus || '').toUpperCase(), row.overallStatus === 'pass' ? 'ok' : row.overallStatus === 'fail' ? 'danger' : 'warn', true),
    raw('span', `${row.branch} (${row.shortCommit})`),
    raw('span', row.source),
    pill(row.archiveStatus, row.archiveStatus === 'archived' ? 'ok' : 'muted', true),
    raw('span', kstStamp(row.finishedAt))
  ]);
  buildsPanel.append(simpleTable(['실행 ID', '상태', '브랜치/커밋', '소스', '아카이브', '완료 시각'], buildRows, '기록된 데일리/수동 빌드 이력이 아직 없습니다.'));

  container.replaceChildren(briefPanel, triggerPanel, previewPanel, buildsPanel);
}

const RELEASE_TARGETS = [
  { id: 'aos', label: 'AOS (.aab / .apk)' },
  { id: 'ios', label: 'iOS (.ipa)' },
  { id: 'forge-desktop', label: '설치형 PlayForge (Desktop)' },
  { id: 'forge-web', label: '웹 PlayForge (Web)' },
  { id: 'hub', label: 'PlayHub (Web / Portable)' },
  { id: 'godot-server', label: 'Godot 멀티플레이어 서버' }
];

export function renderSystemReleasePolicy(container, data, { kstStamp, onSavePolicy }) {
  const info = data?.buildInfo || {};
  const policy = data?.policy || { revision: 1, defaultUpdatePolicy: 'optional', targets: {}, activePools: [] };
  const compat = info.compat || {};
  const forceCount = RELEASE_TARGETS.filter(t => policy.targets?.[t.id]?.updatePolicy === 'force').length;

  const summaryPanel = panel(
    'BUILD IDENTITY & COMPAT GATE',
    '서버 빌드 식별자 및 릴리스 정책 현황',
    pill(forceCount > 0 ? `강업 활성 ${forceCount}개 타깃` : '전체 선업 (optional)', forceCount > 0 ? 'warn' : 'ok', true)
  );
  summaryPanel.append(kpiGrid([
    ['서버 빌드 ID', info.buildId || '—', `채널: ${info.channel || 'local'}`, true],
    ['숫자 빌드 코드 (YYYYMMDDNN)', info.buildCode || '—', `SemVer v${info.semver || '0.0.0'}`, true],
    ['호환성 계약 키', `${compat.engineAbi || 'godot-4.7'} · proto ${compat.netProtocol || '1.0'}`, `apiRev ${compat.engineApiRev ?? 1} · rules ${compat.gameplayHash || 'default'}`, true],
    ['정책 리비전', `#${policy.revision ?? 1}`, policy.updatedAtUtc ? `${kstStamp(policy.updatedAtUtc)} (${policy.updatedBy || 'system'})` : '초기 상태', true]
  ], true));

  const targetsPanel = panel('PER-TARGET UPDATE POLICY (FORCE / OPTIONAL)', '6대 타깃별 강업(force) · 선업(optional) · 매치 유예 제어');
  const presetBar = el('div', '', 'inline-actions');
  const makePresetBtn = (label, patch, testId) => {
    const btn = el('button', label, 'quiet');
    btn.type = 'button';
    btn.dataset.testid = testId;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { await onSavePolicy(patch, label); } finally { btn.disabled = false; }
    });
    return btn;
  };
  presetBar.append(
    makePresetBtn('전체 선업(optional)', { defaultUpdatePolicy: 'optional', forceTargets: [] }, 'preset-all-optional'),
    makePresetBtn('모바일만 강업(aos, ios)', { forceTargets: ['aos', 'ios'] }, 'preset-mobile-force'),
    makePresetBtn('전체 강업(force)', { defaultUpdatePolicy: 'force', forceTargets: RELEASE_TARGETS.map(t => t.id) }, 'preset-all-force')
  );

  const form = el('form', '');
  form.dataset.testid = 'release-policy-form';
  const controlsByTarget = new Map();

  const rows = RELEASE_TARGETS.map(({ id, label }) => {
    const cur = policy.targets?.[id] || {};
    const modeSel = el('select', '');
    modeSel.dataset.testid = `target-policy-${id}`;
    for (const [val, txt] of [['optional', '선업 (optional)'], ['force', '강업 (force)']]) {
      const opt = el('option', txt);
      opt.value = val;
      modeSel.append(opt);
    }
    modeSel.value = cur.updatePolicy === 'force' ? 'force' : 'optional';

    const latestInput = el('input', '');
    latestInput.type = 'number';
    latestInput.min = '0';
    latestInput.max = '2099123199';
    latestInput.value = String(cur.latestBuildCode || 0);
    latestInput.dataset.testid = `target-latest-${id}`;

    const minInput = el('input', '');
    minInput.type = 'number';
    minInput.min = '0';
    minInput.max = '2099123199';
    minInput.value = String(cur.minBuildCode || 0);
    minInput.dataset.testid = `target-min-${id}`;

    const graceInput = el('input', '');
    graceInput.type = 'number';
    graceInput.min = '0';
    graceInput.max = '1440';
    graceInput.value = String(cur.graceMinutes ?? 10);
    graceInput.dataset.testid = `target-grace-${id}`;

    const storeInput = el('input', '');
    storeInput.type = 'url';
    storeInput.placeholder = 'https://...';
    storeInput.value = cur.storeUrl || '';
    storeInput.dataset.testid = `target-store-url-${id}`;

    const noticeInput = el('input', '');
    noticeInput.type = 'text';
    noticeInput.placeholder = '업데이트 안내 문구';
    noticeInput.value = cur.notice || '';
    noticeInput.dataset.testid = `target-notice-${id}`;

    controlsByTarget.set(id, { modeSel, latestInput, minInput, graceInput, storeInput, noticeInput });

    const nameCell = el('div', '');
    nameCell.append(raw('strong', id), el('small', ` ${label}`, 'muted'));
    return [
      nameCell,
      modeSel,
      latestInput,
      minInput,
      graceInput,
      storeInput,
      noticeInput
    ];
  });

  const saveBar = el('div', '', 'inline-actions');
  const saveBtn = el('button', '타깃별 정책 저장 (무재빌드 즉시 반영)', 'primary');
  saveBtn.type = 'submit';
  saveBtn.dataset.testid = 'release-policy-save-btn';
  saveBar.append(saveBtn);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    saveBtn.disabled = true;
    try {
      const targets = {};
      for (const [id, ctrl] of controlsByTarget.entries()) {
        targets[id] = {
          updatePolicy: ctrl.modeSel.value,
          latestBuildCode: Number(ctrl.latestInput.value || 0),
          minBuildCode: Number(ctrl.minInput.value || 0),
          graceMinutes: Number(ctrl.graceInput.value || 0),
          storeUrl: ctrl.storeInput.value.trim() || null,
          notice: ctrl.noticeInput.value.trim()
        };
      }
      await onSavePolicy({ targets }, '타깃별 강업/선업 정책');
    } finally {
      saveBtn.disabled = false;
    }
  });

  form.append(
    simpleTable(
      ['타깃', '업데이트 정책', '최신 코드 (YYYYMMDDNN)', '긴급 하한선 (minBuildCode)', '매치 유예 (분)', '스토어/다운로드 URL', '안내 문구'],
      rows,
      '타깃 정책이 없습니다.'
    ),
    saveBar
  );

  targetsPanel.append(
    presetBar,
    form,
    el('p', '하드 기술 가드레일: 선업(optional)을 선택하더라도 engineAbi, engineApiRev, netProtocol.major 불일치 또는 qa/rc/live 채널의 -dirty 빌드는 항상 COMPAT_BLOCK_FORCE_UPDATE (HTTP 426 / WS 4009)로 차단됩니다.', 'panel-foot')
  );

  const poolsPanel = panel('LEGACY DRAIN POOLS (COMPAT_ROUTE_LEGACY_POOL)', '구버전 게임(gameplayHash) 드레인 풀 관리');
  const activePools = Array.isArray(policy.activePools) ? policy.activePools : [];
  const poolRows = activePools.map((pool, idx) => {
    const removeBtn = el('button', '제거', 'quiet');
    removeBtn.type = 'button';
    removeBtn.dataset.testid = `remove-pool-${pool.poolId}`;
    removeBtn.addEventListener('click', async () => {
      removeBtn.disabled = true;
      try {
        const nextPools = activePools.filter((_, i) => i !== idx);
        await onSavePolicy({ activePools: nextPools }, `드레인 풀 ${pool.poolId} 제거`);
      } finally {
        removeBtn.disabled = false;
      }
    });
    return [
      raw('strong', pool.poolId),
      raw('span', pool.gameplayHash),
      raw('span', pool.endpoint),
      raw('span', pool.expiresAtUtc ? kstStamp(pool.expiresAtUtc) : '무기한'),
      removeBtn
    ];
  });

  const poolForm = el('form', '', 'metrics-filters');
  poolForm.dataset.testid = 'drain-pool-form';
  const makeLabeled = (labelText, inputEl) => { const lb = el('label', labelText); lb.append(inputEl); return lb; };
  const poolIdInput = el('input', ''); poolIdInput.required = true; poolIdInput.placeholder = 'drain-rules-v1'; poolIdInput.dataset.testid = 'pool-id-input';
  const poolHashInput = el('input', ''); poolHashInput.required = true; poolHashInput.placeholder = 'rules-v1'; poolHashInput.dataset.testid = 'pool-hash-input';
  const poolEndpointInput = el('input', ''); poolEndpointInput.required = true; poolEndpointInput.placeholder = 'wss://legacy-v1.playhub.example/ws'; poolEndpointInput.dataset.testid = 'pool-endpoint-input';
  const poolExpiresInput = el('input', ''); poolExpiresInput.placeholder = '2026-11-22T00:00:00Z (선택)'; poolExpiresInput.dataset.testid = 'pool-expires-input';
  const addPoolBtn = el('button', '드레인 풀 추가', 'primary');
  addPoolBtn.type = 'submit';
  addPoolBtn.dataset.testid = 'pool-add-btn';
  poolForm.append(
    makeLabeled('풀 ID', poolIdInput),
    makeLabeled('gameplayHash', poolHashInput),
    makeLabeled('엔드포인트 (http/ws)', poolEndpointInput),
    makeLabeled('만료 시각 (UTC ISO)', poolExpiresInput),
    addPoolBtn
  );
  poolForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    addPoolBtn.disabled = true;
    try {
      const nextEntry = {
        poolId: poolIdInput.value.trim(),
        gameplayHash: poolHashInput.value.trim(),
        endpoint: poolEndpointInput.value.trim(),
        drainOnly: true,
        ...(poolExpiresInput.value.trim() ? { expiresAtUtc: poolExpiresInput.value.trim() } : {})
      };
      const nextPools = [...activePools.filter(p => p.poolId !== nextEntry.poolId), nextEntry];
      await onSavePolicy({ activePools: nextPools }, `드레인 풀 ${nextEntry.poolId} 등록`);
    } finally {
      addPoolBtn.disabled = false;
    }
  });

  poolsPanel.append(
    simpleTable(['풀 ID', 'gameplayHash', '엔드포인트', '만료 시각', '작업'], poolRows, '활성 레거시 드레인 풀이 없습니다. gameplayHash 불일치 클라이언트는 매칭 풀이 없으면 강제 업데이트됩니다.'),
    poolForm
  );

  container.replaceChildren(summaryPanel, targetsPanel, poolsPanel);
}
