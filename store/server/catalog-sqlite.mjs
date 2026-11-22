import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SAMPLE_CATALOG,
  isCommercialHubDistributable,
  validateReleaseContract,
  extractCatalogCategories,
  extractCatalogLicenses,
  extractCatalogTiers,
  extractCatalogSources,
  extractTopTags
} from '../web/store-catalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORE_ROOT = path.resolve(HERE, '..');

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function buildSearchText(item) {
  return [
    item.title,
    item.summary,
    item.category,
    item.asset_id,
    item.publisher_id,
    item.author,
    item.license,
    item.source_provider,
    ...(Array.isArray(item.tags) ? item.tags : []),
    ...(Array.isArray(item.article_body) ? item.article_body : [])
  ]
    .filter((v) => v !== undefined && v !== null && v !== '')
    .join(' ')
    .toLowerCase();
}

export function loadMergedCatalogEntries(storeRoot = STORE_ROOT) {
  const collectedPath = path.join(storeRoot, 'data', 'collected-catalog.json');
  const collectedGzPath = `${collectedPath}.gz`;
  const merged = SAMPLE_CATALOG.filter((item) => isCommercialHubDistributable(item));
  const seen = new Set(merged.map((item) => item.asset_id));
  let raw = null;
  if (fs.existsSync(collectedPath)) {
    raw = JSON.parse(fs.readFileSync(collectedPath, 'utf8'));
  } else if (fs.existsSync(collectedGzPath)) {
    raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(collectedGzPath)).toString('utf8'));
  }
  const coreCount = merged.length;
  if (raw) {
    const extra = Array.isArray(raw?.items) ? raw.items : [];
    for (const item of extra) {
      if (item?.asset_id && !seen.has(item.asset_id) && isCommercialHubDistributable(item)) {
        seen.add(item.asset_id);
        merged.push(item);
      }
    }
  }
  return { entries: merged, collectedCount: Math.max(0, merged.length - coreCount) };
}

export function buildCatalogSqlite({ entries, collectedCount = 0, dbPath }) {
  if (!dbPath) throw new Error('dbPath is required');
  const list = Array.isArray(entries) ? entries : [];
  for (const item of list) {
    const errors = validateReleaseContract(item);
    if (errors.length > 0) {
      throw new Error(`Invalid store catalog entry ${item?.asset_id}: ${errors.join(', ')}`);
    }
  }

  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const tmpPath = `${dbPath}.tmp-${process.pid}-${Date.now()}`;
  try { fs.unlinkSync(tmpPath); } catch {}

  const db = new DatabaseSync(tmpPath);
  try {
    db.exec('PRAGMA page_size = 4096; PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
    db.exec(`
      CREATE TABLE items (
        seq INTEGER PRIMARY KEY,
        asset_id TEXT UNIQUE NOT NULL,
        release_kind TEXT NOT NULL,
        category_lc TEXT NOT NULL,
        license_lc TEXT NOT NULL,
        tier_lc TEXT NOT NULL,
        source_lc TEXT NOT NULL,
        ai_no INTEGER NOT NULL,
        tags_lc TEXT NOT NULL,
        search_lc TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
      CREATE INDEX idx_items_rk ON items(release_kind);
      CREATE INDEX idx_items_cat ON items(category_lc);
      CREATE INDEX idx_items_lic ON items(license_lc);
      CREATE INDEX idx_items_tier ON items(tier_lc);
      CREATE INDEX idx_items_src ON items(source_lc);
    `);

    const insertItem = db.prepare(
      'INSERT INTO items (seq, asset_id, release_kind, category_lc, license_lc, tier_lc, source_lc, ai_no, tags_lc, search_lc, payload) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    );

    const categoryCounts = {};
    const licenseCounts = {};
    const tierCounts = {};
    const sourceCounts = {};
    let packageCount = 0;
    let editorialCount = 0;

    db.exec('BEGIN');
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (item.release_kind === 'package') packageCount += 1;
      else if (item.release_kind === 'editorial') editorialCount += 1;
      if (item.category) categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
      if (item.license) licenseCounts[item.license] = (licenseCounts[item.license] || 0) + 1;
      if (item.license_tier) tierCounts[item.license_tier] = (tierCounts[item.license_tier] || 0) + 1;
      if (item.source_provider) sourceCounts[item.source_provider] = (sourceCounts[item.source_provider] || 0) + 1;

      const tags = Array.isArray(item.tags) ? item.tags : [];
      const tagsLc = tags.length ? `|${tags.map((t) => String(t).toLowerCase()).join('|')}|` : '';
      const aiDisc = String(item.ai_disclosure || '').toLowerCase();
      const aiNo = (aiDisc.includes('no generative ai') || aiDisc.includes('no ai')) ? 1 : 0;

      insertItem.run(
        i,
        item.asset_id,
        item.release_kind || 'package',
        String(item.category || '').toLowerCase(),
        String(item.license || '').toLowerCase(),
        String(item.license_tier || '').toLowerCase(),
        String(item.source_provider || '').toLowerCase(),
        aiNo,
        tagsLc,
        buildSearchText(item),
        JSON.stringify(item)
      );
    }

    const summary = {
      catalog_total: list.length,
      package_count: packageCount,
      editorial_count: editorialCount,
      collected_count: collectedCount,
      categories: extractCatalogCategories(list),
      licenses: extractCatalogLicenses(list),
      tiers: extractCatalogTiers(list),
      sources: extractCatalogSources(list),
      top_tags: extractTopTags(list, 24),
      category_counts: categoryCounts,
      license_counts: licenseCounts,
      tier_counts: tierCounts,
      source_counts: sourceCounts
    };

    db.prepare('INSERT INTO meta (key, value_json) VALUES (?, ?)').run('summary', JSON.stringify(summary));
    db.exec('COMMIT');
    db.exec('VACUUM');
    db.close();
    fs.renameSync(tmpPath, dbPath);
    return { dbPath, count: list.length, packageCount, editorialCount, bytes: fs.statSync(dbPath).size };
  } catch (err) {
    try { db.close(); } catch {}
    try { fs.unlinkSync(tmpPath); } catch {}
    throw err;
  }
}

export function openCatalogSqlite(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  db.exec('PRAGMA cache_size = -1024; PRAGMA mmap_size = 0;');
  const metaRow = db.prepare('SELECT value_json FROM meta WHERE key = ?').get('summary');
  if (!metaRow?.value_json) {
    db.close();
    throw new Error(`Invalid catalog SQLite database (missing meta.summary): ${dbPath}`);
  }
  const meta = JSON.parse(metaRow.value_json);
  const stmtBySlug = db.prepare('SELECT payload FROM items WHERE asset_id = ?');

  function buildWhere(filters = {}) {
    const clauses = [];
    const params = [];
    const releaseKind = String(filters.release_kind ?? '').trim();
    const category = String(filters.category ?? '').trim().toLowerCase();
    const license = String(filters.license ?? '').trim().toLowerCase();
    const tier = String(filters.tier ?? '').trim().toLowerCase();
    const ai = String(filters.ai ?? '').trim().toLowerCase();
    const source = String(filters.source ?? '').trim().toLowerCase();
    const tag = String(filters.tag ?? '').trim().toLowerCase();
    const q = String(filters.q ?? '').trim().toLowerCase();

    if (releaseKind && releaseKind !== 'all') {
      clauses.push('release_kind = ?');
      params.push(releaseKind);
    }
    if (category && category !== 'all') {
      clauses.push("(category_lc = ? OR category_lc LIKE ? ESCAPE '\\')");
      params.push(category, `%${escapeLike(category)}%`);
    }
    if (license && license !== 'all') {
      clauses.push('license_lc = ?');
      params.push(license);
    }
    if (tier && tier !== 'all') {
      clauses.push('tier_lc = ?');
      params.push(tier);
    }
    if (ai && ai !== 'all') {
      if (ai === 'no-ai') {
        clauses.push('ai_no = 1');
      }
    }
    if (source && source !== 'all') {
      clauses.push("(source_lc = ? OR source_lc LIKE ? ESCAPE '\\')");
      params.push(source, `%${escapeLike(source)}%`);
    }
    if (tag && tag !== 'all') {
      clauses.push("tags_lc LIKE ? ESCAPE '\\'");
      params.push(`%|${escapeLike(tag)}|%`);
    }
    if (q) {
      clauses.push("search_lc LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(q)}%`);
    }
    return {
      whereSql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
      params
    };
  }

  let closed = false;

  return {
    meta,
    getBySlug(slug) {
      const row = stmtBySlug.get(slug);
      return row ? JSON.parse(row.payload) : null;
    },
    query(filters = {}, { paginate = false, page = 1, limit = 24 } = {}) {
      const { whereSql, params } = buildWhere(filters);
      const total = whereSql
        ? Number(db.prepare(`SELECT COUNT(*) AS cnt FROM items ${whereSql}`).get(...params)?.cnt || 0)
        : meta.catalog_total;
      if (!paginate) {
        const rows = db.prepare(`SELECT payload FROM items ${whereSql} ORDER BY seq`).all(...params);
        return {
          total,
          page: 1,
          limit: total,
          totalPages: 1,
          items: rows.map((r) => JSON.parse(r.payload))
        };
      }
      const safeLimit = Math.max(1, Math.min(200, Number(limit || 24) || 24));
      const totalPages = Math.max(1, Math.ceil(total / safeLimit));
      const safePage = Math.max(1, Math.min(totalPages, Number(page || 1) || 1));
      const offset = (safePage - 1) * safeLimit;
      const rows = db
        .prepare(`SELECT payload FROM items ${whereSql} ORDER BY seq LIMIT ? OFFSET ?`)
        .all(...params, safeLimit, offset);
      return {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages,
        items: rows.map((r) => JSON.parse(r.payload))
      };
    },
    close() {
      if (closed) return;
      closed = true;
      try { db.close(); } catch {}
    }
  };
}

export function readCatalogSqliteSummary(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) return null;
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db.prepare('SELECT value_json FROM meta WHERE key = ?').get('summary');
    return row?.value_json ? JSON.parse(row.value_json) : null;
  } finally {
    db.close();
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const args = process.argv.slice(2);
  let storeRoot = STORE_ROOT;
  let outPath = path.join(STORE_ROOT, 'data', 'collected-catalog.sqlite');
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--store-root' && args[i + 1]) storeRoot = path.resolve(args[++i]);
    else if (args[i] === '--out' && args[i + 1]) outPath = path.resolve(args[++i]);
  }
  const { entries, collectedCount } = loadMergedCatalogEntries(storeRoot);
  const res = buildCatalogSqlite({ entries, collectedCount, dbPath: outPath });
  console.log(
    `[catalog-sqlite] Built ${res.dbPath}: ${res.count} entries (${res.packageCount} packages, ${res.editorialCount} editorial), ${(res.bytes / 1048576).toFixed(2)} MB`
  );
}
