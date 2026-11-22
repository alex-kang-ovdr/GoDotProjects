import { createHash } from 'node:crypto';
import { ApiError } from './security.mjs';

export const SNAPSHOT_FORMAT = 'playhub-data-snapshot-v1';
export const SNAPSHOT_SCHEMA_VERSION = 1;
export const MAX_SNAPSHOT_IMPORT_BYTES = 32 * 1024 * 1024;

/**
 * Curated latest-version snapshot domains (ordered parent-before-child for FK safety).
 * Ephemeral, secret, credential, audit, event, and version-history tables are intentionally excluded.
 */
export const SNAPSHOT_DOMAINS = Object.freeze([
  {
    id: 'games',
    label: '게임 공개 · UGC 최신 배포',
    description: '게임 공개/비공개 오버라이드와 UGC 최신 퍼블리시 상태(히스토리 제외)',
    db: 'platform',
    tables: ['game_overrides', 'hub_publications']
  },
  {
    id: 'l10n',
    label: '다국어(L10N) 최신 스트링 · 용어집',
    description: '스트링 키·번역·단어집·프롬프트·미디어 및 최신 릴리스 1건',
    db: 'platform',
    tables: [
      'l10n_keys',
      'l10n_translations',
      'l10n_glossary',
      'l10n_prompts',
      'l10n_media_slots',
      'l10n_media_assets',
      'l10n_releases'
    ],
    latestOnlyTables: ['l10n_releases']
  },
  {
    id: 'store',
    label: 'Asset Store 운영 패키지 · 심사 큐',
    description: 'store-admin.sqlite의 패키지 상태·심사 제출 큐·메타데이터',
    db: 'storeAdmin',
    tables: ['store_admin_packages', 'store_admin_submissions', 'store_admin_meta']
  },
  {
    id: 'users_saves',
    label: '사용자 · 최신 세이브 슬롯 · 찜',
    description: '계정·프로필·언어설정·찜·최신 세이브 슬롯(세션/OAuth/비밀번호/백업 이력 제외)',
    db: 'platform',
    tables: [
      'users',
      'identities',
      'user_preferences',
      'user_profiles',
      'wishlist_items',
      'save_slots',
      'save_slot_versions'
    ]
  },
  {
    id: 'avatar_billing',
    label: '아바타 · 결제 카탈로그 · 지갑 · 권한',
    description: '아바타 인벤토리/장착·결제 SKU/보너스/권한·지갑 잔액(원장/결제 웹훅/크리에이터 연결 시크릿 제외)',
    db: 'platform',
    tables: [
      'avatar_wallets',
      'avatar_inventory',
      'avatar_loadouts',
      'billing_catalog_skus',
      'billing_channel_bonus_rules',
      'billing_creator_products',
      'billing_entitlements',
      'billing_wallet_accounts',
      'billing_wallet_lots',
      'iap_products',
      'player_wallet_accounts',
      'player_wallet_buckets',
      'player_entitlements'
    ]
  },
  {
    id: 'social_progression',
    label: '커뮤니티 · 소셜 · 리더보드 · 업적 · DataStore 최신값',
    description: '커뮤니티 글/추천·친구/차단·리더보드·스탯/업적·DataStore 최신 엔트리(버전 이력 제외)',
    db: 'platform',
    tables: [
      'community_items',
      'community_votes',
      'social_friendships',
      'social_blocks',
      'social_leaderboards',
      'leaderboard_boards',
      'leaderboard_entries',
      'stat_definitions',
      'player_stats',
      'achievement_definitions',
      'player_achievements',
      'datastore_quotas',
      'datastore_entries'
    ]
  },
  {
    id: 'creator_qa',
    label: '창작자 제출 · 체크리스트 · QA 요약',
    description: '창작자 게임 제출·심사 체크리스트·QA 실행 기록',
    db: 'platform',
    tables: ['creator_submissions', 'submission_checklists', 'qa_runs']
  }
]);

export const EXCLUDED_SECURITY_TABLES = Object.freeze([
  'sessions',
  'oauth_states',
  'mobile_tokens',
  'email_credentials',
  'billing_creator_connections',
  'audit',
  'errors',
  'events',
  'play_sessions',
  'save_backups',
  'save_idempotency',
  'hub_publication_history',
  'hub_publish_idempotency',
  'datastore_versions',
  'avatar_purchase_idempotency',
  'billing_idempotency',
  'billing_payment_events',
  'iap_webhook_events',
  'progression_idempotency',
  'cdn_idempotency',
  'merge_requests'
]);

const DOMAIN_MAP = new Map(SNAPSHOT_DOMAINS.map(d => [d.id, d]));
const ALLOWED_PLATFORM_TABLES = new Set(
  SNAPSHOT_DOMAINS.filter(d => d.db === 'platform').flatMap(d => d.tables)
);
const ALLOWED_STORE_TABLES = new Set(
  SNAPSHOT_DOMAINS.filter(d => d.db === 'storeAdmin').flatMap(d => d.tables)
);
const BLOCKED_SET = new Set(EXCLUDED_SECURITY_TABLES);
const LIVE_CHANNELS = new Set(['live', 'prod', 'production']);

const quoteIdent = name => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new ApiError(422, 'SNAPSHOT_INVALID_IDENTIFIER', `유효하지 않은 테이블/컬럼 식별자입니다: ${name}`);
  }
  return `"${name}"`;
};

export function resolveEnvironmentChannel(config = {}, env = process.env) {
  const explicit = String(env?.PLAYHUB_CHANNEL || config?.channel || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (env?.NODE_ENV === 'production' || env?.K_SERVICE || config?.secureCookies === true) {
    return 'live';
  }
  return 'dev';
}

function listExistingTables(sqliteDb) {
  const rows = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  return new Set(rows.map(r => r.name));
}

function inspectTableSchema(sqliteDb, tableName) {
  const cols = sqliteDb.prepare(`PRAGMA table_info(${quoteIdent(tableName)})`).all();
  const columns = cols.map(c => c.name);
  const primaryKey = cols
    .filter(c => Number(c.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map(c => c.name);
  return { columns, primaryKey };
}

function normalizeRowValue(value) {
  if (value === undefined) return null;
  if (value instanceof Uint8Array) {
    return { __playhub_bytes_b64: Buffer.from(value).toString('base64') };
  }
  return value;
}

function denormalizeRowValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && typeof value.__playhub_bytes_b64 === 'string') {
    return Buffer.from(value.__playhub_bytes_b64, 'base64');
  }
  return value === undefined ? null : value;
}

function readLatestTableRows(sqliteDb, tableName, { latestOnly = false } = {}) {
  const { columns, primaryKey } = inspectTableSchema(sqliteDb, tableName);
  let sql = `SELECT * FROM ${quoteIdent(tableName)}`;
  if (latestOnly && tableName === 'l10n_releases') {
    if (columns.includes('created_at')) {
      sql += ` ORDER BY ${quoteIdent('created_at')} DESC, ${quoteIdent(primaryKey[0] || columns[0])} DESC LIMIT 1`;
    } else {
      sql += ` ORDER BY ${quoteIdent(primaryKey[0] || columns[0])} DESC LIMIT 1`;
    }
  } else if (primaryKey.length) {
    sql += ` ORDER BY ${primaryKey.map(quoteIdent).join(', ')}`;
  }
  const rows = sqliteDb.prepare(sql).all().map(row => {
    const out = {};
    for (const col of columns) out[col] = normalizeRowValue(row[col]);
    return out;
  });
  return { columns, primaryKey, rows };
}

export function computeDatabasesChecksum(databases) {
  return createHash('sha256').update(JSON.stringify(databases)).digest('hex');
}

function resolveSelectedDomains(requested) {
  if (!requested || (Array.isArray(requested) && requested.length === 0)) {
    return SNAPSHOT_DOMAINS.map(d => d.id);
  }
  const list = Array.isArray(requested)
    ? requested
    : String(requested).split(',').map(s => s.trim()).filter(Boolean);
  const unique = [];
  for (const id of list) {
    if (!DOMAIN_MAP.has(id)) {
      throw new ApiError(422, 'SNAPSHOT_INVALID_DOMAIN', `알 수 없는 스냅샷 도메인입니다: ${id}`);
    }
    if (!unique.includes(id)) unique.push(id);
  }
  if (!unique.length) {
    throw new ApiError(422, 'SNAPSHOT_DOMAIN_REQUIRED', '최소 1개 이상의 데이터 도메인을 선택해야 합니다.');
  }
  return unique;
}

/**
 * Creates the Admin Data Snapshot Export/Import controller for Live <-> Dev migration.
 */
export function createDataSnapshotService({
  db,
  storeAdmin,
  config = {},
  env = process.env,
  now = Date.now,
  createBackup = null
} = {}) {
  const withStoreDb = fn => {
    if (storeAdmin && typeof storeAdmin.withStoreDb === 'function') {
      return storeAdmin.withStoreDb(fn);
    }
    return null;
  };

  function getMeta() {
    const channel = resolveEnvironmentChannel(config, env);
    const platformExisting = listExistingTables(db);
    const storeExisting = withStoreDb(sdb => listExistingTables(sdb)) || new Set();

    const domains = SNAPSHOT_DOMAINS.map(domain => {
      const targetExisting = domain.db === 'storeAdmin' ? storeExisting : platformExisting;
      const latestSet = new Set(domain.latestOnlyTables || []);
      let domainRows = 0;
      const tables = [];

      const countInDb = sqliteDb => {
        for (const table of domain.tables) {
          if (!targetExisting.has(table)) continue;
          const total = Number(sqliteDb.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`).get()?.n || 0);
          const count = latestSet.has(table) ? Math.min(total, 1) : total;
          domainRows += count;
          tables.push({ table, rows: count, latestOnly: latestSet.has(table) });
        }
      };

      if (domain.db === 'storeAdmin') {
        withStoreDb(countInDb);
      } else {
        countInDb(db);
      }

      return {
        id: domain.id,
        label: domain.label,
        description: domain.description,
        db: domain.db,
        totalRows: domainRows,
        tables
      };
    });

    return {
      format: SNAPSHOT_FORMAT,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      environment: {
        channel,
        isLive: LIVE_CHANNELS.has(channel),
        userBaseUrl: config?.userBaseUrl || ''
      },
      domains,
      excludedSecurityTables: [...EXCLUDED_SECURITY_TABLES]
    };
  }

  function exportSnapshot({ domains: requestedDomains } = {}) {
    const selectedIds = resolveSelectedDomains(requestedDomains);
    const channel = resolveEnvironmentChannel(config, env);
    const platformExisting = listExistingTables(db);
    const databases = { platform: {}, storeAdmin: {} };
    const byDomain = {};
    let totalTables = 0;
    let totalRows = 0;

    for (const domainId of selectedIds) {
      const domain = DOMAIN_MAP.get(domainId);
      const latestSet = new Set(domain.latestOnlyTables || []);
      let domainRowCount = 0;
      const domainTableCounts = {};

      if (domain.db === 'platform') {
        for (const table of domain.tables) {
          if (!platformExisting.has(table)) continue;
          const payload = readLatestTableRows(db, table, { latestOnly: latestSet.has(table) });
          databases.platform[table] = payload;
          domainTableCounts[table] = payload.rows.length;
          domainRowCount += payload.rows.length;
          totalTables++;
          totalRows += payload.rows.length;
        }
      } else if (domain.db === 'storeAdmin') {
        withStoreDb(sdb => {
          const storeExisting = listExistingTables(sdb);
          for (const table of domain.tables) {
            if (!storeExisting.has(table)) continue;
            const payload = readLatestTableRows(sdb, table, { latestOnly: latestSet.has(table) });
            databases.storeAdmin[table] = payload;
            domainTableCounts[table] = payload.rows.length;
            domainRowCount += payload.rows.length;
            totalTables++;
            totalRows += payload.rows.length;
          }
        });
      }

      byDomain[domainId] = { rows: domainRowCount, tables: domainTableCounts };
    }

    const exportedAt = new Date(now()).toISOString();
    const platformSchemaVersion = Number(db.prepare('PRAGMA user_version').get()?.user_version || 1);
    const sha256 = computeDatabasesChecksum(databases);

    return {
      format: SNAPSHOT_FORMAT,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      exportedAt,
      sourceEnv: {
        channel,
        userBaseUrl: config?.userBaseUrl || '',
        platformSchemaVersion
      },
      domains: selectedIds,
      summary: {
        totalTables,
        totalRows,
        byDomain
      },
      sha256,
      databases
    };
  }

  function applyTableImport(sqliteDb, tableName, tableData, { conflictMode, dryRun }) {
    const { columns: targetCols, primaryKey: targetPk } = inspectTableSchema(sqliteDb, tableName);
    const targetColSet = new Set(targetCols);
    const incomingRows = Array.isArray(tableData?.rows) ? tableData.rows : [];
    const incomingCols = Array.isArray(tableData?.columns) && tableData.columns.length
      ? tableData.columns
      : (incomingRows[0] ? Object.keys(incomingRows[0]) : []);

    // Intersect columns cleanly so minor live->dev schema diffs don't crash import
    const activeCols = incomingCols.filter(c => targetColSet.has(c));
    if (!activeCols.length || !incomingRows.length) {
      return { table: tableName, incoming: incomingRows.length, inserted: 0, overwritten: 0, skipped: 0 };
    }

    const pkCols = targetPk.length && targetPk.every(pk => activeCols.includes(pk))
      ? targetPk
      : (Array.isArray(tableData?.primaryKey) && tableData.primaryKey.every(pk => activeCols.includes(pk))
        ? tableData.primaryKey
        : []);

    const existsStmt = pkCols.length
      ? sqliteDb.prepare(`SELECT 1 FROM ${quoteIdent(tableName)} WHERE ${pkCols.map(c => `${quoteIdent(c)}=?`).join(' AND ')} LIMIT 1`)
      : null;

    const colListSql = activeCols.map(quoteIdent).join(', ');
    const placeholdersSql = activeCols.map(() => '?').join(', ');
    const nonPkCols = activeCols.filter(c => !pkCols.includes(c));

    let insertStmt = null;
    if (!dryRun) {
      if (pkCols.length) {
        if (conflictMode === 'overwrite' && nonPkCols.length > 0) {
          const updateSet = nonPkCols.map(c => `${quoteIdent(c)}=excluded.${quoteIdent(c)}`).join(', ');
          insertStmt = sqliteDb.prepare(
            `INSERT INTO ${quoteIdent(tableName)} (${colListSql}) VALUES (${placeholdersSql}) ON CONFLICT(${pkCols.map(quoteIdent).join(', ')}) DO UPDATE SET ${updateSet}`
          );
        } else {
          insertStmt = sqliteDb.prepare(
            `INSERT OR IGNORE INTO ${quoteIdent(tableName)} (${colListSql}) VALUES (${placeholdersSql})`
          );
        }
      } else {
        insertStmt = sqliteDb.prepare(
          `INSERT INTO ${quoteIdent(tableName)} (${colListSql}) VALUES (${placeholdersSql})`
        );
      }
    }

    let inserted = 0;
    let overwritten = 0;
    let skipped = 0;

    for (const rawRow of incomingRows) {
      if (!rawRow || typeof rawRow !== 'object') {
        throw new ApiError(422, 'SNAPSHOT_INVALID_ROW', `${tableName} 테이블에 올바르지 않은 행 데이터가 포함되어 있습니다.`);
      }
      const pkValues = pkCols.map(c => denormalizeRowValue(rawRow[c]));
      const exists = existsStmt ? Boolean(existsStmt.get(...pkValues)) : false;

      if (exists) {
        if (conflictMode === 'overwrite') {
          if (!dryRun && insertStmt) {
            insertStmt.run(...activeCols.map(c => denormalizeRowValue(rawRow[c])));
          }
          overwritten++;
        } else {
          skipped++;
        }
      } else {
        if (!dryRun && insertStmt) {
          insertStmt.run(...activeCols.map(c => denormalizeRowValue(rawRow[c])));
        }
        inserted++;
      }
    }

    return {
      table: tableName,
      incoming: incomingRows.length,
      inserted,
      overwritten,
      skipped
    };
  }

  async function importSnapshot({
    snapshot,
    domains: requestedDomains,
    conflictMode = 'skip',
    dryRun = false,
    createBackupBeforeImport = true,
    allowLiveImport = false
  } = {}) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new ApiError(422, 'SNAPSHOT_REQUIRED', '임포트할 스냅샷 JSON 객체가 필요합니다.');
    }
    if (snapshot.format !== SNAPSHOT_FORMAT) {
      throw new ApiError(422, 'SNAPSHOT_INVALID_FORMAT', `지원하지 않는 스냅샷 형식입니다. (${SNAPSHOT_FORMAT} 필요)`);
    }
    if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
      throw new ApiError(422, 'SNAPSHOT_UNSUPPORTED_VERSION', `지원하지 않는 스냅샷 버전입니다: ${snapshot.schemaVersion}`);
    }
    if (!['skip', 'overwrite'].includes(conflictMode)) {
      throw new ApiError(422, 'SNAPSHOT_INVALID_CONFLICT_MODE', '중복 처리 옵션은 skip 또는 overwrite 여야 합니다.');
    }
    if (!snapshot.databases || typeof snapshot.databases !== 'object') {
      throw new ApiError(422, 'SNAPSHOT_MISSING_DATABASES', '스냅샷에 databases 페이로드가 없습니다.');
    }

    // Strict SHA-256 integrity verification
    const expectedHash = computeDatabasesChecksum(snapshot.databases);
    if (!snapshot.sha256 || snapshot.sha256 !== expectedHash) {
      throw new ApiError(422, 'SNAPSHOT_CHECKSUM_MISMATCH', '스냅샷 SHA-256 무결성 검증에 실패했습니다. 파일이 손상되었거나 변조되었습니다.');
    }

    // Validate every table name in payload against strict allowlist / denylist
    const incomingPlatform = snapshot.databases.platform || {};
    const incomingStore = snapshot.databases.storeAdmin || {};
    for (const table of Object.keys(incomingPlatform)) {
      if (BLOCKED_SET.has(table) || !ALLOWED_PLATFORM_TABLES.has(table)) {
        throw new ApiError(422, 'SNAPSHOT_TABLE_FORBIDDEN', `보안 정책상 임포트할 수 없는 플랫폼 테이블이 포함되어 있습니다: ${table}`);
      }
    }
    for (const table of Object.keys(incomingStore)) {
      if (BLOCKED_SET.has(table) || !ALLOWED_STORE_TABLES.has(table)) {
        throw new ApiError(422, 'SNAPSHOT_TABLE_FORBIDDEN', `보안 정책상 임포트할 수 없는 Store 테이블이 포함되어 있습니다: ${table}`);
      }
    }

    const targetChannel = resolveEnvironmentChannel(config, env);
    const isTargetLive = LIVE_CHANNELS.has(targetChannel);
    if (!dryRun && isTargetLive && allowLiveImport !== true) {
      throw new ApiError(
        409,
        'LIVE_IMPORT_CONFIRMATION_REQUIRED',
        '운영(live) 환경으로 스냅샷을 반영하려면 allowLiveImport=true 확인이 필요합니다. (live → dev 이관 시 dev 환경에서는 즉시 반영 가능)'
      );
    }

    const selectedIds = resolveSelectedDomains(
      requestedDomains && requestedDomains.length ? requestedDomains : snapshot.domains
    );

    let preImportBackup = null;
    if (!dryRun && createBackupBeforeImport && typeof createBackup === 'function' && config?.dataDir) {
      try {
        preImportBackup = await createBackup();
      } catch {
        // If DB is in-memory or backup dir unavailable in tests, continue cleanly only if non-fatal
        preImportBackup = null;
      }
    }

    const tableReports = [];
    const totals = { incoming: 0, inserted: 0, overwritten: 0, skipped: 0 };

    // 1. Platform DB atomic import (parent-before-child order defined by SNAPSHOT_DOMAINS)
    const platformTablesToImport = [];
    const storeTablesToImport = [];
    for (const domainId of selectedIds) {
      const domain = DOMAIN_MAP.get(domainId);
      if (domain.db === 'platform') {
        for (const t of domain.tables) {
          if (Object.prototype.hasOwnProperty.call(incomingPlatform, t)) platformTablesToImport.push(t);
        }
      } else if (domain.db === 'storeAdmin') {
        for (const t of domain.tables) {
          if (Object.prototype.hasOwnProperty.call(incomingStore, t)) storeTablesToImport.push(t);
        }
      }
    }

    const runInTransaction = (sqliteDb, tables, sourceMap) => {
      if (!tables.length) return;
      const existing = listExistingTables(sqliteDb);
      if (dryRun) {
        for (const table of tables) {
          if (!existing.has(table)) continue;
          const report = applyTableImport(sqliteDb, table, sourceMap[table], { conflictMode, dryRun: true });
          tableReports.push({ db: sqliteDb === db ? 'platform' : 'storeAdmin', ...report });
        }
        return;
      }
      sqliteDb.exec('BEGIN IMMEDIATE');
      try {
        sqliteDb.exec('PRAGMA defer_foreign_keys = ON');
        for (const table of tables) {
          if (!existing.has(table)) continue;
          const report = applyTableImport(sqliteDb, table, sourceMap[table], { conflictMode, dryRun: false });
          tableReports.push({ db: sqliteDb === db ? 'platform' : 'storeAdmin', ...report });
        }
        const fkViolations = sqliteDb.prepare('PRAGMA foreign_key_check').all();
        if (fkViolations.length > 0) {
          throw new ApiError(
            422,
            'SNAPSHOT_FK_VIOLATION',
            `외래 키 참조 무결성 오류로 임포트를 롤백했습니다. (${fkViolations[0].table} → ${fkViolations[0].parent})`
          );
        }
        sqliteDb.exec('COMMIT');
      } catch (error) {
        try { sqliteDb.exec('ROLLBACK'); } catch {}
        throw error;
      }
    };

    runInTransaction(db, platformTablesToImport, incomingPlatform);
    if (storeTablesToImport.length) {
      withStoreDb(sdb => runInTransaction(sdb, storeTablesToImport, incomingStore));
    }

    for (const r of tableReports) {
      totals.incoming += r.incoming;
      totals.inserted += r.inserted;
      totals.overwritten += r.overwritten;
      totals.skipped += r.skipped;
    }

    return {
      ok: true,
      dryRun: Boolean(dryRun),
      conflictMode,
      sourceEnv: snapshot.sourceEnv || { channel: 'unknown' },
      targetEnv: {
        channel: targetChannel,
        isLive: isTargetLive,
        userBaseUrl: config?.userBaseUrl || ''
      },
      domains: selectedIds,
      preImportBackup: preImportBackup ? { filename: preImportBackup.filename, sha256Prefix: preImportBackup.sha256Prefix } : null,
      totals,
      tables: tableReports
    };
  }

  return {
    getMeta,
    exportSnapshot,
    importSnapshot
  };
}
