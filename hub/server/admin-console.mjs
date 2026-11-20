import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { readCatalog } from './catalog.mjs';
import { ApiError, assertId, json, readJson, uid } from './security.mjs';
import { assertNoLinks, hashFile, TOOL_VERSION } from '../tools/backup.mjs';
import { createForgeGateway } from './forge-gateway.mjs';

const DAY = 86400000;
const SUBMISSION_ID = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const CHECKLIST_ROUTE = new RegExp(`^/api/admin/submissions/(${SUBMISSION_ID})/checklist$`);
const GAME_DETAIL_ROUTE = /^\/api\/admin\/games\/([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;
const QA_STATUSES = new Set(['pending', 'running', 'passed', 'warned', 'failed', 'error']);
const QA_TARGET_TYPES = new Set(['catalog', 'game', 'submission', 'forge_template', 'forge_release', 'portable']);
const AUDIT_DOMAINS = new Set(['all', 'system', 'hub', 'forge', 'qa', 'l10n']);

export const MANUAL_CHECKLIST_V1 = Object.freeze({
  version: 'manual-review.v1',
  items: Object.freeze([
    Object.freeze({ id: 'content_safety', label: '콘텐츠 및 연령 적합성 확인', required: true }),
    Object.freeze({ id: 'metadata_match', label: '제목·설명·대표 이미지와 실제 게임 일치 확인', required: true }),
    Object.freeze({ id: 'controls_mobile', label: '지원 기기·조작 방식·모바일 안내 정확성 확인', required: true }),
    Object.freeze({ id: 'save_runtime', label: '저장·재개 동작 및 실행 오류 없음 확인', required: true }),
    Object.freeze({ id: 'copyright_origin', label: '저작권·에셋 출처 및 외부 네트워크 정책 확인', required: true })
  ])
});

export const RBAC_ROLES = Object.freeze([
  Object.freeze({ id: 'super_admin', label: 'Super Admin (시스템 운영자)', system: '전체', hub: '전체', forge: '전체', qa: '전체' }),
  Object.freeze({ id: 'hub_operator', label: 'Hub Operator (서비스 운영자)', system: '오류·감사 조회', hub: '대시보드·카탈로그·커뮤니티', forge: '조회 전용', qa: '리포트·지표 조회' }),
  Object.freeze({ id: 'reviewer', label: 'Reviewer (심사자)', system: '본인 감사 조회', hub: '제출 검수·판정', forge: '릴리스·패키지 검증 조회', qa: '자동 검수 증거 조회' }),
  Object.freeze({ id: 'forge_operator', label: 'Forge Operator (창작 인프라 운영자)', system: '헬스·오류 조회', hub: '제출 현황 조회', forge: '전체', qa: 'Forge 스위트 조회·실행' }),
  Object.freeze({ id: 'qa_maintainer', label: 'QA Maintainer (QA 관리자)', system: '오류 조회', hub: '카탈로그·오류 조회', forge: '템플릿·빌드 조회', qa: '전체' })
]);

export function auditDomain(action) {
  const name = String(action || '');
  if (name.startsWith('admin_login') || name.startsWith('admin_local_login') || name === 'admin_logout' || name.startsWith('system_')) return 'system';
  if (name.startsWith('forge_')) return 'forge';
  if (name.startsWith('qa_')) return 'qa';
  if (name.startsWith('l10n_')) return 'l10n';
  return 'hub';
}

function isOutside(baseDir, candidate) {
  if (!baseDir || !candidate || !path.isAbsolute(candidate)) return false;
  const rel = path.relative(path.resolve(baseDir), path.resolve(candidate));
  return Boolean(rel && (rel.startsWith('..') || path.isAbsolute(rel)));
}

function safeStat(filename) {
  try {
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink()) return null;
    return stat;
  } catch {
    return null;
  }
}

function safeReadJson(filename, maxBytes = 512 * 1024) {
  const stat = safeStat(filename);
  if (!stat || !stat.isFile() || stat.size <= 0 || stat.size > maxBytes) return null;
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function safeReadDir(directory) {
  const stat = safeStat(directory);
  if (!stat || !stat.isDirectory()) return [];
  try {
    return fs.readdirSync(directory);
  } catch {
    return [];
  }
}

function listBackups(dataDir) {
  const backupDir = path.join(path.dirname(dataDir), 'backups');
  const entries = [];
  for (const name of safeReadDir(backupDir)) {
    if (!name.endsWith('.sqlite.json')) continue;
    const meta = safeReadJson(path.join(backupDir, name), 65536);
    if (!meta || typeof meta !== 'object') continue;
    entries.push({
      filename: name.replace(/\.json$/, ''),
      createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : null,
      bytes: Number.isSafeInteger(meta.bytes) ? meta.bytes : null,
      sha256Prefix: typeof meta.sha256 === 'string' ? meta.sha256.slice(0, 16) : null,
      integrity: meta.integrity || 'unknown',
      foreignKeys: meta.foreignKeys || 'unknown',
      databaseUserVersion: Number.isInteger(meta.databaseUserVersion) ? meta.databaseUserVersion : null,
      ok: meta.ok === true
    });
  }
  entries.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || b.filename.localeCompare(a.filename));
  return entries.slice(0, 20);
}

function inspectReportArtifacts(rootDir, platformRoot) {
  const artifacts = [];
  const gamerQaDir = path.join(platformRoot, 'artifacts', 'gamerqa');
  for (const runId of safeReadDir(gamerQaDir).slice(0, 30)) {
    const report = safeReadJson(path.join(gamerQaDir, runId, 'report.json'), 512 * 1024);
    if (!report || typeof report !== 'object') continue;
    artifacts.push({
      id: runId,
      source: 'gamerqa',
      target: report.target || report.gameId || 'catalog',
      policyVersion: report.policyVersion || 'v1',
      status: report.status || (report.passed === true ? 'passed' : 'failed'),
      summary: report.summary || null,
      generatedAt: report.generatedAt || report.finishedAt || null
    });
  }
  const hubReportsDir = path.join(rootDir, 'reports');
  for (const name of safeReadDir(hubReportsDir).slice(0, 60)) {
    if (!name.endsWith('.json')) continue;
    const doc = safeReadJson(path.join(hubReportsDir, name), 512 * 1024);
    if (!doc || typeof doc !== 'object') continue;
    const checks = Array.isArray(doc.checks) ? doc.checks : Array.isArray(doc.results) ? doc.results : null;
    if (!checks && !doc.summary && typeof doc.passed !== 'boolean') continue;
    const counts = { pass: 0, fail: 0, warn: 0, skip: 0, notRun: 0 };
    if (checks) {
      for (const item of checks) {
        const st = item?.status || (item?.passed === true ? 'pass' : item?.passed === false ? 'fail' : item?.error ? 'fail' : 'pass');
        if (st === 'pass' || st === 'passed') counts.pass++;
        else if (st === 'fail' || st === 'failed' || st === 'error') counts.fail++;
        else if (st === 'warn' || st === 'warning') counts.warn++;
        else if (st === 'skip' || st === 'skipped') counts.skip++;
        else counts.notRun++;
      }
    }
    const status = doc.status || (doc.passed === true ? 'passed' : counts.fail > 0 ? 'failed' : counts.notRun > 0 ? 'not_run' : 'passed');
    artifacts.push({
      id: name.replace(/\.json$/, ''),
      source: 'hub-report',
      target: doc.target || doc.mode || name.replace(/\.json$/, ''),
      policyVersion: doc.schemaVersion ? `schema-v${doc.schemaVersion}` : 'report',
      status,
      summary: doc.summary || counts,
      generatedAt: doc.generatedAt || doc.at || doc.finishedAt || null
    });
  }
  artifacts.sort((a, b) => String(b.generatedAt || '').localeCompare(String(a.generatedAt || '')) || a.id.localeCompare(b.id));
  return artifacts.slice(0, 30);
}

function inspectAiQa(platformRoot) {
  const baseDir = path.join(platformRoot, 'tools', 'Gamer', 'TestResults');
  const health = safeReadJson(path.join(baseDir, 'inference-health.json'), 65536);
  const smoke = safeReadJson(path.join(baseDir, 'inference-smoke.json'), 131072);
  const runs = [];
  for (const name of safeReadDir(baseDir).slice(0, 50)) {
    const summary = safeReadJson(path.join(baseDir, name, 'summary.json'), 512 * 1024);
    if (!summary || typeof summary !== 'object') continue;
    const first = Array.isArray(summary.results) ? summary.results[0] : null;
    runs.push({
      runId: summary.options?.runId || name,
      at: summary.at || null,
      model: summary.modelHealth?.model || null,
      device: summary.modelHealth?.device || null,
      controller: first?.controller || summary.options?.controller || 'model',
      games: Array.isArray(summary.options?.games) ? summary.options.games : first?.game ? [first.game] : [],
      stepsLimit: summary.options?.steps ?? null,
      decisions: first?.countDecisions ?? null,
      objectiveMet: first ? Boolean(first.objectiveMet) : null,
      meaningfulGameplay: first ? Boolean(first.meaningfulGameplay) : null,
      stopReason: first?.stopReason || null,
      errorCount: (Array.isArray(summary.errors) ? summary.errors.length : 0) + (Array.isArray(first?.errors) ? first.errors.length : 0)
    });
  }
  runs.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')) || a.runId.localeCompare(b.runId));
  return {
    available: Boolean(health || runs.length || safeStat(path.join(platformRoot, 'tools', 'Gamer', 'inference_server.py'))),
    inferenceHealth: health ? {
      status: health.status || 'unknown',
      model: health.model || null,
      device: health.device || null,
      dtype: health.dtype || null,
      gpuName: health.gpu?.name || null,
      vramUsedMb: health.gpu?.memory_allocated_mb ?? null,
      vramTotalMb: health.gpu?.memory_total_mb ?? null,
      historyFrames: health.history_frames ?? null,
      maxImageSize: Array.isArray(health.max_image_size) ? health.max_image_size : null
    } : null,
    smokeOk: smoke ? Boolean(smoke.ok ?? smoke.status === 'ok' ?? !smoke.error) : null,
    runs: runs.slice(0, 20)
  };
}

function inspectQaPolicies(platformRoot) {
  const policiesDir = path.join(platformRoot, 'tools', 'Gamer', 'GamerQA', 'policies');
  const policies = [];
  for (const name of safeReadDir(policiesDir).sort()) {
    if (!name.endsWith('.json')) continue;
    const doc = safeReadJson(path.join(policiesDir, name), 262144);
    if (!doc || typeof doc !== 'object') continue;
    policies.push({
      file: name,
      version: doc.version || name.replace(/\.json$/, ''),
      ruleCount: Array.isArray(doc.rules) ? doc.rules.length : 0,
      updatedAt: doc.updatedAt || null
    });
  }
  const quarantineDoc = safeReadJson(path.join(platformRoot, 'tools', 'Gamer', 'GamerQA', 'ops', 'quarantine.json'), 262144);
  const quarantine = Array.isArray(quarantineDoc?.items) ? quarantineDoc.items : Array.isArray(quarantineDoc) ? quarantineDoc : [];
  const schedulesDoc = safeReadJson(path.join(platformRoot, 'tools', 'Gamer', 'GamerQA', 'ops', 'schedules.json'), 262144);
  const schedules = Array.isArray(schedulesDoc?.schedules) ? schedulesDoc.schedules : Array.isArray(schedulesDoc) ? schedulesDoc : [];
  return { policies, quarantine: quarantine.slice(0, 50), schedules: schedules.slice(0, 20) };
}

async function createOnlineBackup(dataDir, now) {
  const source = path.join(dataDir, 'platform.sqlite');
  const stat = safeStat(source);
  if (!stat || !stat.isFile()) throw new ApiError(503, 'DATABASE_UNAVAILABLE', '데이터베이스 파일을 찾을 수 없습니다.');
  if (fs.existsSync(path.join(dataDir, 'maintenance.lock'))) {
    throw new ApiError(409, 'MAINTENANCE_ACTIVE', '유지보수 잠금 상태에서는 백업을 시작할 수 없습니다.');
  }
  const stamp = new Date(now()).toISOString().replace(/[:.]/g, '-');
  const suffix = createHash('sha256').update(`${stamp}:${uid()}`).digest('hex').slice(0, 6);
  const target = assertNoLinks(path.join(path.dirname(dataDir), 'backups', `platform-${stamp}-${suffix}.sqlite`));
  const metadata = target + '.json';
  if (source === target || ['', '-wal', '-shm', '-journal', '.json'].some(ext => fs.existsSync(target + ext))) {
    throw new ApiError(409, 'BACKUP_TARGET_EXISTS', '백업 대상 경로가 이미 존재합니다.');
  }
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  let ownsTarget = false, ownsMeta = false, metaFd;
  try {
    const targetFd = fs.openSync(target, 'wx', 0o600);
    ownsTarget = true;
    fs.closeSync(targetFd);
    metaFd = fs.openSync(metadata, 'wx', 0o600);
    ownsMeta = true;
    const reader = new DatabaseSync(source, { readOnly: true, timeout: 5000 });
    try { await backup(reader, target); } finally { reader.close(); }
    if (process.platform !== 'win32') fs.chmodSync(target, 0o600);
    const verification = new DatabaseSync(target, { timeout: 5000 });
    let version;
    try {
      verification.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=DELETE');
      if (Object.values(verification.prepare('PRAGMA integrity_check(1)').get())[0] !== 'ok') throw new Error('integrity');
      if (verification.prepare('PRAGMA foreign_key_check').get()) throw new Error('foreign_keys');
      version = verification.prepare('PRAGMA user_version').get().user_version;
    } finally {
      verification.close();
    }
    const bytes = fs.statSync(target).size;
    const sha256 = await hashFile(target);
    const report = {
      schemaVersion: 1,
      appVersion: TOOL_VERSION,
      ok: true,
      createdAt: new Date(now()).toISOString(),
      path: target,
      bytes,
      sha256,
      integrity: 'ok',
      foreignKeys: 'ok',
      databaseUserVersion: version,
      snapshotType: 'sqlite-online-backup'
    };
    fs.writeFileSync(metaFd, JSON.stringify(report, null, 2) + '\n');
    fs.fsyncSync(metaFd);
    fs.closeSync(metaFd);
    metaFd = undefined;
    return {
      filename: path.basename(target),
      createdAt: report.createdAt,
      bytes,
      sha256Prefix: sha256.slice(0, 16),
      integrity: 'ok',
      foreignKeys: 'ok',
      databaseUserVersion: version,
      ok: true
    };
  } catch (error) {
    if (metaFd !== undefined) try { fs.closeSync(metaFd); } catch {}
    if (ownsMeta) try { fs.unlinkSync(metadata); } catch {}
    if (ownsTarget) for (const ext of ['', '-wal', '-shm', '-journal']) try { fs.unlinkSync(target + ext); } catch {}
    if (error instanceof ApiError) throw error;
    throw new ApiError(500, 'BACKUP_FAILED', '온라인 백업 생성에 실패했습니다.');
  }
}

export function createAdminConsole({ config, db, rootDir, platformRoot, now, audit, env = process.env, rate, requireSession, forgeGateway }) {
  // Forge templates/projects/builds/Drive state come only from the gateway (admin-only gateway by default).
  const forge = forgeGateway || createForgeGateway({ config: config.forge || {}, root: platformRoot, env, platform: false });
  db.exec(`
    CREATE TABLE IF NOT EXISTS qa_runs (
      id TEXT PRIMARY KEY,
      submission_id TEXT,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      release_revision INTEGER,
      policy_version TEXT NOT NULL,
      qa_status TEXT NOT NULL CHECK(qa_status IN ('pending','running','passed','warned','failed','error')),
      score REAL,
      report_path TEXT,
      summary_json TEXT NOT NULL DEFAULT '{}',
      started_at INTEGER NOT NULL,
      finished_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS qa_runs_submission ON qa_runs(submission_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS qa_runs_started ON qa_runs(started_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS submission_checklists (
      submission_id TEXT NOT NULL,
      submission_revision INTEGER NOT NULL,
      checklist_version TEXT NOT NULL,
      items_json TEXT NOT NULL,
      updated_by TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(submission_id, submission_revision)
    );
  `);

  function gameManifest(id) {
    const games = readCatalog(rootDir, db);
    const catalogItem = games.find(g => g.id === id);
    if (!catalogItem) throw new ApiError(404, 'GAME_NOT_FOUND');
    const manifest = safeReadJson(path.join(rootDir, 'games', id, 'game.manifest.json'), 262144) || {};
    const errors24h = db.prepare("SELECT COUNT(*) AS n FROM errors WHERE traffic_type='live' AND game_id=? AND created_at>=?").get(id, now() - DAY).n;
    const communityCount = db.prepare('SELECT COUNT(*) AS n FROM community_items WHERE game_id=?').get(id).n;
    const openReports = db.prepare(`SELECT COUNT(*) AS n FROM community_reports r
      JOIN community_items c ON c.id=r.item_id WHERE c.game_id=? AND c.hidden=0`).get(id).n;
    const wishlistCount = db.prepare('SELECT COUNT(*) AS n FROM wishlist_items WHERE game_id=?').get(id).n;
    const saveSlotCount = db.prepare('SELECT COUNT(*) AS n FROM save_slots WHERE game_id=?').get(id).n;
    return {
      ...catalogItem,
      version: manifest.version || null,
      titles: typeof manifest.title === 'object' && manifest.title ? manifest.title : { ko: catalogItem.title },
      summaries: typeof manifest.summary === 'object' && manifest.summary ? manifest.summary : { ko: catalogItem.description },
      instructionsByLocale: typeof manifest.instructions === 'object' && manifest.instructions ? manifest.instructions : { ko: catalogItem.instructions },
      capabilities: manifest.capabilities || null,
      viewport: manifest.viewport || null,
      stats: { errors24h, communityCount, openReports, wishlistCount, saveSlotCount }
    };
  }

  function checklistPayload(submissionId, revision) {
    const row = db.prepare('SELECT * FROM submission_checklists WHERE submission_id=? AND submission_revision=?').get(submissionId, revision);
    const checkedMap = row ? (() => { try { return JSON.parse(row.items_json); } catch { return {}; } })() : {};
    return {
      submissionId,
      submissionRevision: revision,
      version: row?.checklist_version || MANUAL_CHECKLIST_V1.version,
      items: MANUAL_CHECKLIST_V1.items.map(item => ({ ...item, checked: Boolean(checkedMap[item.id]) })),
      updatedBy: row?.updated_by || null,
      updatedAt: row ? new Date(row.updated_at).toISOString() : null
    };
  }

  function systemOverview() {
    const dbFile = path.join(config.dataDir, 'platform.sqlite');
    const dbStat = safeStat(dbFile);
    const walStat = safeStat(dbFile + '-wal');
    const journalMode = String(db.prepare('PRAGMA journal_mode').get()?.journal_mode || 'unknown');
    const userVersion = db.prepare('PRAGMA user_version').get()?.user_version ?? 0;
    const currentNow = now();
    const activeSessions = db.prepare("SELECT id_hash, admin_username, created_at, expires_at FROM sessions WHERE kind='admin' AND admin_authenticated=1 AND expires_at>? ORDER BY created_at DESC LIMIT 20")
      .all(currentNow)
      .map(row => ({
        sessionPrefix: row.id_hash.slice(0, 10),
        username: row.admin_username || 'admin',
        createdAt: new Date(row.created_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString()
      }));
    const backups = listBackups(config.dataDir);
    const googleConfigured = Boolean(config.google?.clientId && config.google?.clientSecret);
    const driveCreds = Boolean(env.PLAYHUB_DRIVE_CLIENT_ID && env.PLAYHUB_DRIVE_CLIENT_SECRET && env.PLAYHUB_DRIVE_REFRESH_TOKEN);
    return {
      service: {
        version: '0.3.0',
        nodeVersion: process.versions.node,
        platform: process.platform,
        pid: process.pid,
        uptimeSeconds: Math.floor(process.uptime()),
        asOf: new Date(currentNow).toISOString()
      },
      network: {
        publicHost: config.publicHost,
        publicPort: config.publicPort,
        adminHost: config.adminHost,
        adminPort: config.adminPort,
        publicBaseUrl: config.publicBaseUrl || null,
        userBaseUrl: config.userBaseUrl || null,
        adminBaseUrl: config.adminBaseUrl || null,
        userOrigins: config.userOrigins || [],
        adminOrigins: config.adminOrigins || [],
        adminLoopbackOnly: ['127.0.0.1', 'localhost', '::1'].includes(config.adminHost),
        secureCookies: Boolean(config.secureCookies),
        searchIndexingEnabled: Boolean(config.searchIndexingEnabled)
      },
      auth: {
        adminUsername: config.admin?.username || 'admin',
        passwordConfigured: Boolean(config.admin?.passwordHash && config.admin?.salt),
        localAutoLogin: Boolean(config.admin?.localAutoLogin),
        googleConfigured,
        googleRedirectUri: config.google?.redirectUri || null,
        rbacMode: 'single_admin_v0_3',
        plannedRoles: RBAC_ROLES
      },
      features: {
        forgeEnabled: config.forge?.enabled === true,
        forgeBuildsEnabled: config.forge?.builds?.enabled === true,
        forgeDriveEnabled: config.forge?.drive?.enabled === true,
        forgePackagesEnabled: config.forge?.packages?.enabled === true,
        forgeDirectoryOutsideRoot: config.forge?.directory ? isOutside(platformRoot, config.forge.directory) : null,
        driveCredentialsConfigured: driveCreds,
        cdnEnabled: config.cdn?.enabled === true,
        cdnProvider: config.cdn?.provider || null,
        r2CredentialsConfigured: Boolean(env.PLAYHUB_R2_ACCESS_KEY_ID && env.PLAYHUB_R2_SECRET_ACCESS_KEY)
      },
      database: {
        filename: 'platform.sqlite',
        dataDirOutsideRoot: isOutside(rootDir, config.dataDir),
        sizeBytes: dbStat?.size ?? null,
        walSizeBytes: walStat?.size ?? 0,
        journalMode,
        userVersion,
        maintenanceLock: fs.existsSync(path.join(config.dataDir, 'maintenance.lock')),
        counts: {
          users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
          registeredUsers: db.prepare("SELECT COUNT(*) AS n FROM users WHERE kind='registered'").get().n,
          guestUsers: db.prepare("SELECT COUNT(*) AS n FROM users WHERE kind='guest'").get().n,
          activeAdminSessions: activeSessions.length,
          playSessions: db.prepare("SELECT COUNT(*) AS n FROM play_sessions WHERE traffic_type='live'").get().n,
          qaPlaySessions: db.prepare("SELECT COUNT(*) AS n FROM play_sessions WHERE traffic_type='qa'").get().n,
          saveSlots: db.prepare('SELECT COUNT(*) AS n FROM save_slots').get().n,
          saveBackups: db.prepare('SELECT COUNT(*) AS n FROM save_backups').get().n,
          communityItems: db.prepare('SELECT COUNT(*) AS n FROM community_items').get().n,
          submissions: db.prepare('SELECT COUNT(*) AS n FROM creator_submissions').get().n,
          qaRuns: db.prepare('SELECT COUNT(*) AS n FROM qa_runs').get().n,
          errors: db.prepare('SELECT COUNT(*) AS n FROM errors').get().n,
          audit: db.prepare('SELECT COUNT(*) AS n FROM audit').get().n
        }
      },
      sessions: activeSessions,
      backups
    };
  }

  async function forgeOverview() {
    const forgeConfig = config.forge || {};
    let snapshot;
    try {
      snapshot = await forge.adminSnapshot();
    } catch (error) {
      throw new ApiError(error?.status === 503 ? 503 : 502, 'FORGE_UNAVAILABLE', 'Forge 내부 상태를 조회할 수 없습니다.');
    }
    const { templates, projects, builds, driveSync, serverPresent, officialEditorPresent } = snapshot;
    const buildSummary = {
      total: builds.length,
      queued: builds.filter(b => b.status === 'queued').length,
      running: builds.filter(b => b.status === 'running').length,
      succeeded: builds.filter(b => b.status === 'succeeded').length,
      failed: builds.filter(b => b.status === 'failed').length
    };
    const folderId = forgeConfig.drive?.folderId || '';
    const packageFolderId = forgeConfig.drive?.packageFolderId || '';
    return {
      configured: {
        enabled: forgeConfig.enabled === true,
        buildsEnabled: forgeConfig.builds?.enabled === true,
        driveEnabled: forgeConfig.drive?.enabled === true,
        packagesEnabled: forgeConfig.packages?.enabled === true,
        driveFolderConfigured: Boolean(folderId),
        packageFolderConfigured: Boolean(packageFolderId),
        separateFoldersValid: Boolean(folderId && packageFolderId && folderId !== packageFolderId),
        driveTokenConfigured: Boolean(env.PLAYHUB_DRIVE_CLIENT_ID && env.PLAYHUB_DRIVE_CLIENT_SECRET && env.PLAYHUB_DRIVE_REFRESH_TOKEN),
        serverPresent,
        officialEditorPresent
      },
      policy: {
        primaryEditorPath: '/OfficialGodot/',
        proxyPathPrefix: '/forge/*',
        maxBuildQueuePending: 3,
        maxZipCompressedMiB: 64,
        maxZipExpandedMiB: 128,
        retentionDefaults: { keepLatest: 20, minAgeDays: 30, dryRunOnly: true },
        multiplayerServices: ['BrawlLabs 3v3 (/brawllabs)', 'Fortress War (/fortress-war)', 'Tappy Chicken MMO (/tappy-chicken-mmo)']
      },
      templates,
      projects,
      buildSummary,
      builds,
      driveSync
    };
  }

  function qaOverview() {
    const qaRuns = db.prepare('SELECT * FROM qa_runs ORDER BY started_at DESC, id DESC LIMIT 50').all().map(row => ({
      id: row.id,
      submissionId: row.submission_id,
      targetType: row.target_type,
      targetId: row.target_id,
      releaseRevision: row.release_revision,
      policyVersion: row.policy_version,
      status: row.qa_status,
      score: row.score,
      reportPath: row.report_path,
      summary: (() => { try { return JSON.parse(row.summary_json || '{}'); } catch { return {}; } })(),
      startedAt: new Date(row.started_at).toISOString(),
      finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null
    }));
    const qaRunIds = db.prepare(`
      SELECT qa_run_id AS qaRunId,
             COUNT(*) AS sessions,
             MIN(started_at) AS firstAt,
             MAX(started_at) AS lastAt
      FROM play_sessions
      WHERE traffic_type='qa' AND qa_run_id IS NOT NULL
      GROUP BY qa_run_id
      ORDER BY lastAt DESC
      LIMIT 30
    `).all().map(row => ({
      qaRunId: row.qaRunId,
      sessions: row.sessions,
      errors: db.prepare("SELECT COUNT(*) AS n FROM errors WHERE traffic_type='qa' AND qa_run_id=?").get(row.qaRunId).n,
      firstAt: new Date(row.firstAt).toISOString(),
      lastAt: new Date(row.lastAt).toISOString()
    }));
    const artifacts = inspectReportArtifacts(rootDir, platformRoot);
    const aiQa = inspectAiQa(platformRoot);
    const { policies, quarantine, schedules } = inspectQaPolicies(platformRoot);
    return {
      datasetSummary: {
        qaPlaySessions: db.prepare("SELECT COUNT(*) AS n FROM play_sessions WHERE traffic_type='qa'").get().n,
        qaErrors: db.prepare("SELECT COUNT(*) AS n FROM errors WHERE traffic_type='qa'").get().n,
        qaErrors24h: db.prepare("SELECT COUNT(*) AS n FROM errors WHERE traffic_type='qa' AND created_at>=?").get(now() - DAY).n,
        distinctQaRuns: qaRunIds.length,
        qaRunIds
      },
      qaRuns,
      artifacts,
      aiQa,
      policies,
      quarantine,
      schedules,
      manualChecklist: MANUAL_CHECKLIST_V1
    };
  }

  async function summaryBadges() {
    const since24h = now() - DAY;
    const games = readCatalog(rootDir, db);
    const pendingSubmissions = db.prepare("SELECT COUNT(*) AS n FROM creator_submissions WHERE status='in_review'").get().n;
    const reportedCommunity = db.prepare(`SELECT COUNT(DISTINCT c.id) AS n FROM community_items c
      JOIN community_reports r ON r.item_id=c.id WHERE c.hidden=0`).get().n;
    const liveErrors24h = db.prepare("SELECT COUNT(*) AS n FROM errors WHERE traffic_type='live' AND created_at>=?").get(since24h).n;
    const qaErrors24h = db.prepare("SELECT COUNT(*) AS n FROM errors WHERE traffic_type='qa' AND created_at>=?").get(since24h).n;
    const qaRunsCount = db.prepare('SELECT COUNT(*) AS n FROM qa_runs').get().n;
    let builds = [], templates = [];
    try {
      const snap = await forge.adminSnapshot();
      builds = Array.isArray(snap?.builds) ? snap.builds : [];
      templates = Array.isArray(snap?.templates) ? snap.templates : [];
    } catch {}
    const aiQa = inspectAiQa(platformRoot);
    const { quarantine } = inspectQaPolicies(platformRoot);
    return {
      system: {
        errors24h: liveErrors24h,
        maintenanceLock: fs.existsSync(path.join(config.dataDir, 'maintenance.lock')),
        backupsCount: listBackups(config.dataDir).length
      },
      hub: {
        pendingSubmissions,
        reportedCommunity,
        totalGames: games.length,
        disabledGames: games.filter(g => !g.enabled).length
      },
      forge: {
        enabled: config.forge?.enabled === true,
        driveEnabled: config.forge?.drive?.enabled === true,
        templatesCount: templates.length,
        activeBuilds: builds.filter(b => b.status === 'queued' || b.status === 'running').length,
        failedBuilds: builds.filter(b => b.status === 'failed').length
      },
      qa: {
        qaRunsCount,
        qaErrors24h,
        aiRunsCount: aiQa.runs.length,
        quarantineCount: quarantine.length
      },
      l10n: {
        pendingReview: (() => { try { return db.prepare("SELECT COUNT(*) AS n FROM l10n_translations WHERE status IN ('ai_draft','needs_review','stale')").get().n; } catch { return 0; } })(),
        lintBlocks: (() => { try { return db.prepare("SELECT COUNT(*) AS n FROM l10n_translations WHERE lint_json LIKE '%\"block\"%'").get().n; } catch { return 0; } })(),
        totalKeys: (() => { try { return db.prepare('SELECT COUNT(*) AS n FROM l10n_keys WHERE unused_since IS NULL').get().n; } catch { return 0; } })()
      }
    };
  }

  function usersSummary() {
    const merges = db.prepare('SELECT id, status, expires_at, result_json FROM merge_requests ORDER BY expires_at DESC LIMIT 20').all().map(row => ({
      id: row.id.slice(0, 12),
      status: row.status,
      expiresAt: new Date(row.expires_at).toISOString(),
      hasResult: Boolean(row.result_json)
    }));
    const backupReasons = db.prepare('SELECT reason, COUNT(*) AS count FROM save_backups GROUP BY reason ORDER BY count DESC').all();
    return {
      counts: {
        totalUsers: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
        registeredUsers: db.prepare("SELECT COUNT(*) AS n FROM users WHERE kind='registered'").get().n,
        guestUsers: db.prepare("SELECT COUNT(*) AS n FROM users WHERE kind='guest'").get().n,
        googleIdentities: db.prepare("SELECT COUNT(*) AS n FROM identities WHERE provider='google'").get().n,
        saveSlots: db.prepare('SELECT COUNT(*) AS n FROM save_slots').get().n,
        saveBackups: db.prepare('SELECT COUNT(*) AS n FROM save_backups').get().n,
        analyticsLinks: db.prepare('SELECT COUNT(*) AS n FROM analytics_links').get().n,
        wishlistItems: db.prepare('SELECT COUNT(*) AS n FROM wishlist_items').get().n
      },
      backupReasons,
      recentMerges: merges
    };
  }

  function listAudit(url) {
    const domain = url.searchParams.get('domain') || 'all';
    if (!AUDIT_DOMAINS.has(domain)) throw new ApiError(400, 'INVALID_AUDIT_FILTER');
    const action = (url.searchParams.get('action') || '').trim();
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const rawLimit = url.searchParams.get('limit');
    let limit = 100;
    if (rawLimit !== null) {
      if (!/^\d{1,3}$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 200) throw new ApiError(400, 'INVALID_AUDIT_FILTER');
      limit = Number(rawLimit);
    }
    const rows = db.prepare('SELECT * FROM audit ORDER BY created_at DESC LIMIT 300').all().map(r => {
      const detail = (() => { try { return JSON.parse(r.detail); } catch { return {}; } })();
      return {
        id: r.id,
        action: r.action,
        domain: auditDomain(r.action),
        target: r.target,
        detail,
        createdAt: new Date(r.created_at).toISOString()
      };
    });
    const filtered = rows.filter(row => {
      if (domain !== 'all' && row.domain !== domain) return false;
      if (action && row.action !== action) return false;
      if (q) {
        const hay = `${row.action} ${row.target || ''} ${JSON.stringify(row.detail || {})}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).slice(0, limit);
    return { audit: filtered };
  }

  async function adminRoute(req, res, url, session) {
    const pathname = url.pathname;
    if (pathname === '/api/admin/summary/badges' && req.method === 'GET') {
      json(res, 200, await summaryBadges());
      return true;
    }
    if (pathname === '/api/admin/system/overview' && req.method === 'GET') {
      json(res, 200, systemOverview());
      return true;
    }
    if (pathname === '/api/admin/system/backups' && req.method === 'GET') {
      json(res, 200, { backups: listBackups(config.dataDir) });
      return true;
    }
    if (pathname === '/api/admin/system/backups' && req.method === 'POST') {
      if (rate) rate(`adminbackup:${req.socket?.remoteAddress || 'local'}`, 6, 60000);
      await readJson(req, 1024);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const created = await createOnlineBackup(config.dataDir, now);
      audit('system_backup_created', created.filename, { bytes: created.bytes, sha256Prefix: created.sha256Prefix, admin: active.admin_username });
      json(res, 201, { backup: created });
      return true;
    }
    if (pathname === '/api/admin/hub/users-summary' && req.method === 'GET') {
      json(res, 200, usersSummary());
      return true;
    }
    const gameMatch = pathname.match(GAME_DETAIL_ROUTE);
    if (gameMatch && req.method === 'GET') {
      json(res, 200, { game: gameManifest(assertId(gameMatch[1])) });
      return true;
    }
    const checklistMatch = pathname.match(CHECKLIST_ROUTE);
    if (checklistMatch) {
      const submissionId = checklistMatch[1];
      const submission = db.prepare("SELECT id, revision, status FROM creator_submissions WHERE id=? AND status<>'draft'").get(submissionId);
      if (!submission) throw new ApiError(404, 'SUBMISSION_NOT_FOUND');
      if (req.method === 'GET') {
        json(res, 200, { checklist: checklistPayload(submission.id, submission.revision) });
        return true;
      }
      if (req.method === 'PUT') {
        const body = await readJson(req, 8192);
        const active = requireSession ? requireSession(req, 'admin', true) : session;
        const fresh = db.prepare("SELECT id, revision, status FROM creator_submissions WHERE id=? AND status<>'draft'").get(submissionId);
        if (!fresh) throw new ApiError(404, 'SUBMISSION_NOT_FOUND');
        const expectedRev = body.revision ?? fresh.revision;
        if (!Number.isSafeInteger(expectedRev) || expectedRev !== fresh.revision) {
          throw new ApiError(409, 'SUBMISSION_REVISION_CONFLICT');
        }
        if (!body.items || typeof body.items !== 'object' || Array.isArray(body.items)) {
          throw new ApiError(422, 'INVALID_CHECKLIST');
        }
        const allowedIds = new Set(MANUAL_CHECKLIST_V1.items.map(i => i.id));
        const normalized = {};
        for (const [k, v] of Object.entries(body.items)) {
          if (!allowedIds.has(k) || typeof v !== 'boolean') throw new ApiError(422, 'INVALID_CHECKLIST');
          normalized[k] = v;
        }
        const stamp = now();
        db.prepare(`INSERT INTO submission_checklists(submission_id,submission_revision,checklist_version,items_json,updated_by,updated_at)
          VALUES(?,?,?,?,?,?)
          ON CONFLICT(submission_id,submission_revision) DO UPDATE SET items_json=excluded.items_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
          .run(fresh.id, fresh.revision, MANUAL_CHECKLIST_V1.version, JSON.stringify(normalized), active.admin_username || 'admin', stamp);
        audit('submission_checklist_saved', fresh.id, {
          revision: fresh.revision,
          checkedCount: Object.values(normalized).filter(Boolean).length,
          totalCount: MANUAL_CHECKLIST_V1.items.length,
          admin: active.admin_username
        });
        json(res, 200, { checklist: checklistPayload(fresh.id, fresh.revision) });
        return true;
      }
    }
    if (pathname === '/api/admin/forge/overview' && req.method === 'GET') {
      json(res, 200, await forgeOverview());
      return true;
    }
    if (pathname === '/api/admin/qa/overview' && req.method === 'GET') {
      json(res, 200, qaOverview());
      return true;
    }
    if (pathname === '/api/admin/qa/runs' && req.method === 'GET') {
      const submissionId = url.searchParams.get('submissionId');
      if (submissionId && !new RegExp(`^${SUBMISSION_ID}$`).test(submissionId)) throw new ApiError(400, 'INVALID_QA_FILTER');
      const rows = submissionId
        ? db.prepare('SELECT * FROM qa_runs WHERE submission_id=? ORDER BY started_at DESC, id DESC LIMIT 30').all(submissionId)
        : db.prepare('SELECT * FROM qa_runs ORDER BY started_at DESC, id DESC LIMIT 50').all();
      json(res, 200, {
        runs: rows.map(row => ({
          id: row.id,
          submissionId: row.submission_id,
          targetType: row.target_type,
          targetId: row.target_id,
          releaseRevision: row.release_revision,
          policyVersion: row.policy_version,
          status: row.qa_status,
          score: row.score,
          reportPath: row.report_path,
          summary: (() => { try { return JSON.parse(row.summary_json || '{}'); } catch { return {}; } })(),
          startedAt: new Date(row.started_at).toISOString(),
          finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null
        }))
      });
      return true;
    }
    if (pathname === '/api/admin/qa/runs' && req.method === 'POST') {
      const body = await readJson(req, 16384);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const targetType = String(body.targetType || '');
      const targetId = String(body.targetId || '').trim();
      const policyVersion = String(body.policyVersion || 'v1').trim();
      const qaStatus = String(body.status || 'pending');
      if (!QA_TARGET_TYPES.has(targetType) || !targetId || targetId.length > 120 || !policyVersion || policyVersion.length > 40 || !QA_STATUSES.has(qaStatus)) {
        throw new ApiError(422, 'INVALID_QA_RUN');
      }
      const id = uid();
      const stamp = now();
      const submissionId = typeof body.submissionId === 'string' && new RegExp(`^${SUBMISSION_ID}$`).test(body.submissionId) ? body.submissionId : null;
      const releaseRevision = Number.isSafeInteger(body.releaseRevision) ? body.releaseRevision : null;
      const score = typeof body.score === 'number' && Number.isFinite(body.score) ? body.score : null;
      const reportPath = typeof body.reportPath === 'string' && body.reportPath.length <= 240 && !body.reportPath.includes('..') ? body.reportPath : null;
      const summaryJson = JSON.stringify(body.summary && typeof body.summary === 'object' ? body.summary : {});
      const finishedAt = ['passed', 'warned', 'failed', 'error'].includes(qaStatus) ? stamp : null;
      db.prepare(`INSERT INTO qa_runs(id,submission_id,target_type,target_id,release_revision,policy_version,qa_status,score,report_path,summary_json,started_at,finished_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, submissionId, targetType, targetId, releaseRevision, policyVersion, qaStatus, score, reportPath, summaryJson, stamp, finishedAt);
      audit('qa_run_recorded', id, { targetType, targetId, status: qaStatus, policyVersion, admin: active.admin_username });
      json(res, 201, { run: { id, submissionId, targetType, targetId, releaseRevision, policyVersion, status: qaStatus, score, reportPath, startedAt: new Date(stamp).toISOString(), finishedAt: finishedAt ? new Date(finishedAt).toISOString() : null } });
      return true;
    }
    if (pathname === '/api/admin/audit' && req.method === 'GET') {
      json(res, 200, listAudit(url));
      return true;
    }
    return false;
  }

  return { adminRoute };
}
