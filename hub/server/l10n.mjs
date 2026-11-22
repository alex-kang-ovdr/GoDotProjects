import fs from 'node:fs';
import path from 'node:path';
import { transaction } from './db.mjs';
import { ApiError, json, readJson, uid } from './security.mjs';
import {
  LOCALES,
  TARGET_LOCALES,
  KEY_PATTERN,
  SLOT_PATTERN,
  sha256Hex,
  extractPlaceholders,
  lintTranslation,
  gatherPlatformTexts,
  validateOpenAiBaseUrl,
  translateWithAi,
  validateMediaUpload,
  parseLegacyPlatformDictionaries,
  assembleSurfaceLocaleData
} from './l10n-engine.mjs';

const VALID_STATUSES = new Set(['untranslated', 'ai_draft', 'needs_review', 'approved', 'stale', 'archived']);
const VALID_AI_PROVIDERS = ['gemini', 'openai', 'mock'];
const MEDIA_FILENAME = /^[a-f0-9]{16,64}\.(png|jpg|webp|svg)$/;
const MIME_BY_EXT = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

const DEFAULT_GLOSSARY = [
  { termKo: 'PlayHub', termEn: 'PlayHub', isDnt: true, notes: '플랫폼 브랜드명 (번역 금지)' },
  { termKo: 'PlayForge', termEn: 'PlayForge', isDnt: true, notes: '창작 스튜디오 브랜드명 (번역 금지)' },
  { termKo: 'Godot', termEn: 'Godot', isDnt: true, notes: '엔진 고유명사 (번역 금지)' },
  { termKo: 'KST', termEn: 'KST', isDnt: true, notes: '한국 표준시 약어 (번역 금지)' },
  { termKo: 'OAuth', termEn: 'OAuth', isDnt: true, notes: '인증 프로토콜명 (번역 금지)' },
  { termKo: 'Google', termEn: 'Google', isDnt: true, notes: '외부 제공자명 (번역 금지)' },
  { termKo: 'CSRF', termEn: 'CSRF', isDnt: true, notes: '보안 토큰 약어 (번역 금지)' },
  {
    termKo: '찜한 게임', termEn: 'Wishlist', isDnt: false,
    contextTags: ['ui.nav', 'ui.button', 'general'],
    translations: { en: 'Wishlist', ja: 'お気に入り', 'zh-CN': '愿望清单', fr: 'Favoris', es: 'Favoritos', 'pt-BR': 'Favoritos', hi: 'पसंदीदा' },
    forbidden: ['Steamed games'], notes: '사용자 찜 목록 표준 용어'
  },
  {
    termKo: '제출 심사', termEn: 'Submission review', isDnt: false,
    contextTags: ['creator.review', 'ui.nav', 'general'],
    translations: { en: 'Submission review', ja: '提出審査', 'zh-CN': '提交审核', fr: 'Examen des soumissions', es: 'Revisión de envíos', 'pt-BR': 'Revisão de envios', hi: 'सबमिशन समीक्षा' },
    forbidden: ['Publish approval'], notes: '카탈로그 공개가 아닌 심사 단계 의미 유지'
  },
  {
    termKo: '유효 플레이어', termEn: 'Active players', isDnt: false,
    contextTags: ['general', 'ui.nav'],
    translations: { en: 'Active players', ja: '有効プレイヤー', 'zh-CN': '有效玩家', fr: 'Joueurs actifs', es: 'Jugadores activos', 'pt-BR': 'Jogadores ativos', hi: 'सक्रिय खिलाड़ी' },
    forbidden: ['Valid users'], notes: '10초 이상 활성 플레이 기준 지표 용어'
  }
];

const DEFAULT_PROMPTS = [
  {
    id: 'prompt-ui-button',
    name: 'UI 버튼 (간결 명령형)',
    contextId: 'ui.button',
    systemPrompt: 'Translate concise action button labels. Use 1 to 3 words, imperative or compact noun form, no trailing period.',
    rules: ['버튼 너비 초과를 피하기 위해 간결하게 번역한다.', '마침표를 붙이지 않는다.'],
    disambiguation: [
      { source: '플레이', context: 'ui.button (게임 실행)', locale: 'en', prefer: 'Play', note: '게임 실행 버튼' },
      { source: '플레이', context: 'ui.button (게임 실행)', locale: 'ja', prefer: 'プレイ', note: '영상 재생(再生)과 구분' },
      { source: '저장', context: 'ui.button (게임 저장)', locale: 'en', prefer: 'Save', note: '게임 진행 저장' },
      { source: '보관', context: 'ui.button (별도 슬롯 보관)', locale: 'en', prefer: 'Archive', note: '일반 저장과 구분' }
    ]
  },
  {
    id: 'prompt-ui-nav',
    name: '내비게이션 · 탭 메뉴',
    contextId: 'ui.nav',
    systemPrompt: 'Translate navigation menu and tab titles using short noun phrases suitable for horizontal tabs and sidebars.',
    rules: ['명사형으로 통일한다.', '2~3단어 이내를 권장한다.'],
    disambiguation: [
      { source: '만들기', context: 'ui.nav (창작자 메뉴)', locale: 'en', prefer: 'Create', note: '창작자 대시보드 진입' }
    ]
  },
  {
    id: 'prompt-feedback-error',
    name: '오류 · 복구 안내 문구',
    contextId: 'feedback.error',
    systemPrompt: 'Translate user-facing error and recovery messages politely and clearly, stating cause and next action without exposing internal stack details.',
    rules: ['원인과 사용자가 취할 다음 행동을 명확히 안내한다.', '공격적이거나 비난하는 어조를 피한다.'],
    disambiguation: []
  },
  {
    id: 'prompt-creator-review',
    name: '창작자 제출 · 심사 정책',
    contextId: 'creator.review',
    systemPrompt: 'Translate creator submission and administrator review terms accurately. Strictly distinguish metadata approval from package verification and public catalog publication.',
    rules: ['메타데이터 승인을 공개(publish)로 오역하지 않는다.'],
    disambiguation: [
      { source: '메타데이터 승인', context: 'creator.review', locale: 'en', prefer: 'Approve metadata', note: '공개 승인과 구분' }
    ]
  },
  {
    id: 'prompt-marketing-banner',
    name: '배너 · 온보딩 · 소개 문구',
    contextId: 'marketing.banner',
    systemPrompt: 'Translate promotional banners and onboarding copy naturally for each locale while keeping PlayHub brand terms intact.',
    rules: ['직역보다 자연스러운 현지화 표현을 우선한다.'],
    disambiguation: []
  }
];

const DEFAULT_MEDIA_SLOTS = [
  { slotKey: 'img.portal.hero_banner', description: '사용자 포털 상단 히어로 배너', altTextKey: 'portal.hero.banner_alt', width: 1200, height: 320 },
  { slotKey: 'img.creator.workflow', description: '창작자 만들기 안내 일러스트', altTextKey: 'portal.creator.workflow_alt', width: 960, height: 540 },
  { slotKey: 'img.og.default', description: '공유용 기본 Open Graph 이미지', altTextKey: 'portal.og.default_alt', width: 1200, height: 630 }
];

function safeJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

function legacyKeyFor(source, index, file) {
  const prefix = file === 'community.js' ? 'community.legacy' : 'platform.legacy';
  return `${prefix}.k${String(index + 1).padStart(4, '0')}`;
}

export function createL10n({ config, db, rootDir, now, audit, env = process.env, fetchImpl = globalThis.fetch, requireSession }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS l10n_keys (
      key TEXT PRIMARY KEY,
      namespace TEXT NOT NULL,
      source_text TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      context_id TEXT NOT NULL DEFAULT 'general',
      description TEXT NOT NULL DEFAULT '',
      max_chars INTEGER,
      placeholders_json TEXT NOT NULL DEFAULT '[]',
      code_refs_json TEXT NOT NULL DEFAULT '[]',
      unused_since INTEGER,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS l10n_keys_ns ON l10n_keys(namespace, key);
    CREATE TABLE IF NOT EXISTS l10n_translations (
      key TEXT NOT NULL REFERENCES l10n_keys(key) ON DELETE CASCADE,
      locale TEXT NOT NULL,
      value TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('untranslated','ai_draft','needs_review','approved','stale','archived')),
      ai_provider TEXT,
      ai_model TEXT,
      lint_json TEXT NOT NULL DEFAULT '[]',
      updated_by TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(key, locale)
    );
    CREATE INDEX IF NOT EXISTS l10n_translations_status ON l10n_translations(locale, status);
    CREATE TABLE IF NOT EXISTS l10n_glossary (
      id TEXT PRIMARY KEY,
      term_ko TEXT NOT NULL,
      term_en TEXT NOT NULL DEFAULT '',
      is_dnt INTEGER NOT NULL DEFAULT 0 CHECK(is_dnt IN (0,1)),
      context_tags_json TEXT NOT NULL DEFAULT '[]',
      translations_json TEXT NOT NULL DEFAULT '{}',
      forbidden_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS l10n_prompts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      context_id TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      rules_json TEXT NOT NULL DEFAULT '[]',
      disambiguation_json TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS l10n_media_slots (
      slot_key TEXT PRIMARY KEY,
      description TEXT NOT NULL DEFAULT '',
      alt_text_key TEXT,
      width INTEGER,
      height INTEGER,
      max_bytes INTEGER NOT NULL DEFAULT 1048576,
      allowed_formats_json TEXT NOT NULL DEFAULT '["webp","png","jpg","svg"]',
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS l10n_media_assets (
      slot_key TEXT NOT NULL REFERENCES l10n_media_slots(slot_key) ON DELETE CASCADE,
      locale TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      updated_by TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(slot_key, locale)
    );
    CREATE TABLE IF NOT EXISTS l10n_releases (
      version INTEGER PRIMARY KEY,
      tag TEXT NOT NULL UNIQUE,
      sha256 TEXT NOT NULL,
      key_count INTEGER NOT NULL,
      media_count INTEGER NOT NULL,
      coverage_json TEXT NOT NULL,
      bundle_json TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 0 CHECK(is_active IN (0,1)),
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  const mediaDir = path.join(config.dataDir, 'l10n-media');

  function syncBundleFromRepo({ actor = 'repo-sync' } = {}) {
    const bundleFile = path.join(rootDir, 'shared', 'locales', 'l10n-bundle.json');
    if (!fs.existsSync(bundleFile)) {
      return { bundleFound: false, keysAdded: 0, translationsFilled: 0, skippedExisting: 0, totalBundleKeys: 0 };
    }
    const bundle = safeJson(fs.readFileSync(bundleFile, 'utf8'), null);
    if (!bundle || typeof bundle !== 'object' || !bundle.keys || typeof bundle.keys !== 'object') {
      return { bundleFound: false, keysAdded: 0, translationsFilled: 0, skippedExisting: 0, totalBundleKeys: 0 };
    }
    const keys = bundle.keys;
    const meta = bundle.meta && typeof bundle.meta === 'object' ? bundle.meta : {};
    const stamp = now();
    const selKey = db.prepare('SELECT key, source_hash FROM l10n_keys WHERE key=?');
    const insKey = db.prepare('INSERT OR IGNORE INTO l10n_keys VALUES(?,?,?,?,?,?,?,?,?,?,1,?)');
    const selTr = db.prepare('SELECT value, status FROM l10n_translations WHERE key=? AND locale=?');
    const insTr = db.prepare('INSERT OR IGNORE INTO l10n_translations VALUES(?,?,?,?,?,?,?,?,?)');
    const updTr = db.prepare("UPDATE l10n_translations SET value=?,status='approved',updated_by=?,updated_at=? WHERE key=? AND locale=?");

    let keysAdded = 0;
    let translationsFilled = 0;
    let skippedExisting = 0;
    let totalBundleKeys = 0;

    transaction(db, () => {
      for (const [key, row] of Object.entries(keys)) {
        if (!KEY_PATTERN.test(key) || typeof row?.ko !== 'string' || !row.ko.trim()) continue;
        totalBundleKeys++;
        const sourceHash = sha256Hex(row.ko);
        const existingKey = selKey.get(key);
        if (!existingKey) {
          const m = meta[key] || {};
          const ns = key.split('.').slice(0, -1).join('.');
          insKey.run(
            key, ns, row.ko, sourceHash,
            m.contextId || 'general', m.description || '', m.maxChars ?? null,
            JSON.stringify(extractPlaceholders(row.ko)), JSON.stringify(m.codeRefs || []),
            null, stamp
          );
          keysAdded++;
          for (const loc of TARGET_LOCALES) {
            const val = typeof row[loc] === 'string' ? row[loc].trim() : '';
            insTr.run(key, loc, val, val ? 'approved' : 'untranslated', null, null, '[]', actor, stamp);
            if (val) translationsFilled++;
          }
          continue;
        }

        if (existingKey.source_hash !== sourceHash) {
          skippedExisting++;
          continue;
        }
        for (const loc of TARGET_LOCALES) {
          const val = typeof row[loc] === 'string' ? row[loc].trim() : '';
          if (!val) continue;
          const existingTr = selTr.get(key, loc);
          if (!existingTr) {
            insTr.run(key, loc, val, 'approved', null, null, '[]', actor, stamp);
            translationsFilled++;
          } else if (existingTr.status === 'untranslated' && !String(existingTr.value || '').trim()) {
            updTr.run(val, actor, stamp, key, loc);
            translationsFilled++;
          } else {
            skippedExisting++;
          }
        }
      }
    });

    return { bundleFound: true, keysAdded, translationsFilled, skippedExisting, totalBundleKeys };
  }

  function seedIfEmpty() {
    const stamp = now();
    if (db.prepare('SELECT COUNT(*) AS n FROM l10n_glossary').get().n === 0) {
      const ins = db.prepare('INSERT INTO l10n_glossary VALUES(?,?,?,?,?,?,?,?,?)');
      for (const item of DEFAULT_GLOSSARY) {
        ins.run(uid(), item.termKo, item.termEn || '', item.isDnt ? 1 : 0, JSON.stringify(item.contextTags || []), JSON.stringify(item.translations || {}), JSON.stringify(item.forbidden || []), item.notes || '', stamp);
      }
    }
    if (db.prepare('SELECT COUNT(*) AS n FROM l10n_prompts').get().n === 0) {
      const ins = db.prepare('INSERT INTO l10n_prompts VALUES(?,?,?,?,?,?,?)');
      for (const p of DEFAULT_PROMPTS) {
        ins.run(p.id, p.name, p.contextId, p.systemPrompt, JSON.stringify(p.rules || []), JSON.stringify(p.disambiguation || []), stamp);
      }
    }
    if (db.prepare('SELECT COUNT(*) AS n FROM l10n_media_slots').get().n === 0) {
      const ins = db.prepare('INSERT INTO l10n_media_slots VALUES(?,?,?,?,?,?,?,?)');
      for (const s of DEFAULT_MEDIA_SLOTS) {
        ins.run(s.slotKey, s.description, s.altTextKey || null, s.width || null, s.height || null, 1024 * 1024, JSON.stringify(['webp', 'png', 'jpg', 'svg']), stamp);
      }
    }
    const existingCount = db.prepare('SELECT COUNT(*) AS n FROM l10n_keys').get().n;
    const bundleFile = path.join(rootDir, 'shared', 'locales', 'l10n-bundle.json');
    if (fs.existsSync(bundleFile)) {
      syncBundleFromRepo({ actor: existingCount === 0 ? 'seed' : 'repo-sync' });
    } else if (existingCount === 0) {
      const insKey = db.prepare('INSERT OR IGNORE INTO l10n_keys VALUES(?,?,?,?,?,?,?,?,?,?,1,?)');
      const insTr = db.prepare('INSERT OR IGNORE INTO l10n_translations VALUES(?,?,?,?,?,?,?,?,?)');
      const legacy = parseLegacyPlatformDictionaries(rootDir);
      const entries = Object.entries(legacy);
      transaction(db, () => {
        entries.forEach(([source, row], idx) => {
          const key = legacyKeyFor(source, idx, row._file);
          const ns = key.split('.').slice(0, -1).join('.');
          insKey.run(key, ns, source, sha256Hex(source), 'general', '', null, JSON.stringify(extractPlaceholders(source)), '[]', null, stamp);
          for (const loc of TARGET_LOCALES) {
            const val = typeof row[loc] === 'string' ? row[loc] : '';
            insTr.run(key, loc, val, val ? 'approved' : 'untranslated', null, null, '[]', 'seed', stamp);
          }
        });
      });
    }
  }

  seedIfEmpty();

  function allGlossary() {
    return db.prepare('SELECT * FROM l10n_glossary ORDER BY is_dnt DESC, term_ko ASC').all().map(r => ({
      id: r.id,
      termKo: r.term_ko,
      termEn: r.term_en,
      isDnt: Boolean(r.is_dnt),
      contextTags: safeJson(r.context_tags_json, []),
      translations: safeJson(r.translations_json, {}),
      forbidden: safeJson(r.forbidden_json, []),
      notes: r.notes,
      updatedAt: new Date(r.updated_at).toISOString()
    }));
  }

  function allPrompts() {
    return db.prepare('SELECT * FROM l10n_prompts ORDER BY context_id ASC, name ASC').all().map(r => ({
      id: r.id,
      name: r.name,
      contextId: r.context_id,
      systemPrompt: r.system_prompt,
      rules: safeJson(r.rules_json, []),
      disambiguation: safeJson(r.disambiguation_json, []),
      updatedAt: new Date(r.updated_at).toISOString()
    }));
  }

  function configuredOpenAiBaseUrl() {
    return config?.l10n?.openaiBaseUrl || env.PLAYHUB_L10N_OPENAI_BASE_URL || 'https://api.openai.com/v1';
  }

  function aiProvidersStatus() {
    const geminiKey = Boolean(env.PLAYHUB_L10N_GEMINI_API_KEY || env.GEMINI_API_KEY);
    const openaiKey = Boolean(env.PLAYHUB_L10N_OPENAI_API_KEY || env.OPENAI_API_KEY);
    const openaiBaseUrl = configuredOpenAiBaseUrl();
    return {
      providers: [
        { id: 'gemini', label: 'Google Gemini API', configured: geminiKey, defaultModel: env.PLAYHUB_L10N_GEMINI_MODEL || 'gemini-2.5-flash' },
        { id: 'openai', label: 'OpenAI 호환 API', configured: openaiKey, defaultModel: env.PLAYHUB_L10N_OPENAI_MODEL || 'gpt-4o-mini', baseUrl: openaiBaseUrl },
        { id: 'mock', label: '오프라인 Mock (테스트·검증용)', configured: true, defaultModel: 'mock-context-v1' }
      ]
    };
  }

  function computeOverview() {
    const totalKeys = db.prepare('SELECT COUNT(*) AS n FROM l10n_keys WHERE unused_since IS NULL').get().n;
    const unusedKeys = db.prepare('SELECT COUNT(*) AS n FROM l10n_keys WHERE unused_since IS NOT NULL').get().n;
    const namespaces = db.prepare('SELECT namespace, COUNT(*) AS count FROM l10n_keys GROUP BY namespace ORDER BY count DESC, namespace ASC').all();
    const byLocale = {};
    for (const loc of TARGET_LOCALES) {
      const counts = { untranslated: 0, ai_draft: 0, needs_review: 0, approved: 0, stale: 0, archived: 0 };
      const rows = db.prepare(`SELECT t.status, COUNT(*) AS n FROM l10n_translations t
        JOIN l10n_keys k ON k.key=t.key WHERE t.locale=? AND k.unused_since IS NULL GROUP BY t.status`).all(loc);
      for (const r of rows) counts[r.status] = r.n;
      const missing = Math.max(0, totalKeys - Object.values(counts).reduce((a, b) => a + b, 0));
      counts.untranslated += missing;
      byLocale[loc] = { ...counts, total: totalKeys, approvedRate: totalKeys ? counts.approved / totalKeys : 0 };
    }
    const pendingReview = db.prepare("SELECT COUNT(*) AS n FROM l10n_translations WHERE status IN ('ai_draft','needs_review','stale')").get().n;
    const lintBlocks = db.prepare("SELECT COUNT(*) AS n FROM l10n_translations WHERE lint_json LIKE '%\"block\"%'").get().n;
    const activeRelease = db.prepare('SELECT version, tag, sha256, key_count, media_count, created_at FROM l10n_releases WHERE is_active=1 LIMIT 1').get() || null;
    const slots = db.prepare('SELECT COUNT(*) AS n FROM l10n_media_slots').get().n;
    const assets = db.prepare('SELECT COUNT(*) AS n FROM l10n_media_assets').get().n;
    return {
      locales: LOCALES,
      totalKeys,
      unusedKeys,
      pendingReview,
      lintBlocks,
      glossaryCount: db.prepare('SELECT COUNT(*) AS n FROM l10n_glossary').get().n,
      promptCount: db.prepare('SELECT COUNT(*) AS n FROM l10n_prompts').get().n,
      mediaSlots: slots,
      mediaAssets: assets,
      namespaces,
      byLocale,
      activeRelease: activeRelease ? {
        version: activeRelease.version,
        tag: activeRelease.tag,
        sha256Prefix: activeRelease.sha256.slice(0, 16),
        keyCount: activeRelease.key_count,
        mediaCount: activeRelease.media_count,
        createdAt: new Date(activeRelease.created_at).toISOString()
      } : null,
      ai: aiProvidersStatus()
    };
  }

  function listStrings(url) {
    const ns = (url.searchParams.get('namespace') || '').trim();
    const status = (url.searchParams.get('status') || 'all').trim();
    const locale = (url.searchParams.get('locale') || 'all').trim();
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0) || 0);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 30) || 30));

    const allKeys = db.prepare('SELECT * FROM l10n_keys ORDER BY key ASC').all();
    const trRows = db.prepare('SELECT * FROM l10n_translations').all();
    const trMap = new Map();
    for (const r of trRows) {
      let bucket = trMap.get(r.key);
      if (!bucket) { bucket = {}; trMap.set(r.key, bucket); }
      bucket[r.locale] = {
        value: r.value,
        status: r.status,
        aiProvider: r.ai_provider,
        aiModel: r.ai_model,
        lint: safeJson(r.lint_json, []),
        updatedBy: r.updated_by,
        updatedAt: new Date(r.updated_at).toISOString()
      };
    }

    const filtered = [];
    for (const k of allKeys) {
      if (ns && k.namespace !== ns) continue;
      const translations = trMap.get(k.key) || {};
      const targetCheck = locale !== 'all' && TARGET_LOCALES.includes(locale) ? [locale] : TARGET_LOCALES;
      if (status === 'unused') {
        if (!k.unused_since) continue;
      } else if (status === 'lint_error') {
        const hasBlock = targetCheck.some(loc => (translations[loc]?.lint || []).some(i => i.severity === 'block'));
        if (!hasBlock) continue;
      } else if (status !== 'all') {
        const matches = targetCheck.some(loc => (translations[loc]?.status || 'untranslated') === status);
        if (!matches) continue;
      }
      if (q) {
        const hay = [k.key, k.source_text, k.description, ...Object.values(translations).map(t => t.value)].join(' ').toLowerCase();
        if (!hay.includes(q)) continue;
      }
      filtered.push({
        key: k.key,
        namespace: k.namespace,
        sourceText: k.source_text,
        sourceHash: k.source_hash.slice(0, 12),
        contextId: k.context_id,
        description: k.description,
        maxChars: k.max_chars,
        placeholders: safeJson(k.placeholders_json, []),
        codeRefs: safeJson(k.code_refs_json, []),
        unusedSince: k.unused_since ? new Date(k.unused_since).toISOString() : null,
        revision: k.revision,
        updatedAt: new Date(k.updated_at).toISOString(),
        translations
      });
    }
    const items = filtered.slice(offset, offset + limit);
    return { total: filtered.length, offset, limit, hasMore: offset + items.length < filtered.length, items };
  }

  function mediaOverview() {
    const slots = db.prepare('SELECT * FROM l10n_media_slots ORDER BY slot_key ASC').all();
    const assets = db.prepare('SELECT * FROM l10n_media_assets').all();
    const bySlot = new Map();
    for (const a of assets) {
      let bucket = bySlot.get(a.slot_key);
      if (!bucket) { bucket = {}; bySlot.set(a.slot_key, bucket); }
      bucket[a.locale] = {
        filename: a.filename,
        mimeType: a.mime_type,
        bytes: a.bytes,
        sha256Prefix: a.sha256.slice(0, 16),
        adminUrl: `/api/admin/l10n/media/file/${a.filename}`,
        publicUrl: `/api/l10n/media/${a.filename}`,
        updatedBy: a.updated_by,
        updatedAt: new Date(a.updated_at).toISOString()
      };
    }
    return {
      locales: LOCALES,
      slots: slots.map(s => ({
        slotKey: s.slot_key,
        description: s.description,
        altTextKey: s.alt_text_key,
        width: s.width,
        height: s.height,
        maxBytes: s.max_bytes,
        allowedFormats: safeJson(s.allowed_formats_json, ['webp', 'png', 'jpg', 'svg']),
        assets: bySlot.get(s.slot_key) || {},
        updatedAt: new Date(s.updated_at).toISOString()
      }))
    };
  }

  function buildReleaseBundle(tag) {
    const keys = {};
    const meta = {};
    const keyRows = db.prepare('SELECT * FROM l10n_keys WHERE unused_since IS NULL ORDER BY key ASC').all();
    const approvedRows = db.prepare("SELECT key, locale, value FROM l10n_translations WHERE status='approved'").all();
    const trMap = new Map();
    for (const r of approvedRows) {
      let bucket = trMap.get(r.key);
      if (!bucket) { bucket = {}; trMap.set(r.key, bucket); }
      if (r.value) bucket[r.locale] = r.value;
    }
    const coverage = Object.fromEntries(TARGET_LOCALES.map(l => [l, 0]));
    for (const k of keyRows) {
      const row = { ko: k.source_text };
      const tr = trMap.get(k.key) || {};
      for (const loc of TARGET_LOCALES) {
        if (tr[loc]) { row[loc] = tr[loc]; coverage[loc]++; }
      }
      keys[k.key] = row;
      meta[k.key] = {
        contextId: k.context_id,
        description: k.description,
        maxChars: k.max_chars,
        codeRefs: safeJson(k.code_refs_json, [])
      };
    }
    const media = {};
    const mediaData = mediaOverview();
    let mediaCount = 0;
    for (const slot of mediaData.slots) {
      const urls = {};
      for (const [loc, asset] of Object.entries(slot.assets)) {
        urls[loc] = asset.publicUrl;
        mediaCount++;
      }
      if (Object.keys(urls).length) {
        media[slot.slotKey] = { altTextKey: slot.altTextKey, assets: urls };
      }
    }
    const bundle = {
      schemaVersion: 1,
      tag,
      generatedAt: new Date(now()).toISOString(),
      locales: LOCALES,
      keys,
      meta,
      media
    };
    const jsonText = JSON.stringify(bundle, null, 2);
    return {
      bundle,
      jsonText,
      sha256: sha256Hex(jsonText),
      keyCount: keyRows.length,
      mediaCount,
      coverage: Object.fromEntries(TARGET_LOCALES.map(l => [l, { approved: coverage[l], total: keyRows.length, rate: keyRows.length ? coverage[l] / keyRows.length : 0 }]))
    };
  }

  function writeFilesAtomically(targets) {
    const snapshots = targets.map(({ filePath }) => {
      if (!fs.existsSync(filePath)) return { filePath, existed: false, content: null };
      const stat = fs.lstatSync(filePath);
      if (stat.isDirectory()) return { filePath, existed: true, isDir: true, content: null };
      return { filePath, existed: true, isDir: false, content: fs.readFileSync(filePath) };
    });

    const staged = [];
    const committed = [];
    try {
      for (const { filePath, content } of targets) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        const tmpPath = `${filePath}.tmp.${process.pid}.${uid()}`;
        fs.writeFileSync(tmpPath, content, 'utf8');
        staged.push({ filePath, tmpPath });
      }
      for (let i = 0; i < staged.length; i++) {
        const { filePath, tmpPath } = staged[i];
        fs.renameSync(tmpPath, filePath);
        staged[i].renamed = true;
        committed.push(snapshots[i]);
      }
    } catch (error) {
      for (const item of staged) {
        if (!item.renamed) {
          try { fs.unlinkSync(item.tmpPath); } catch {}
        }
      }
      for (let i = committed.length - 1; i >= 0; i--) {
        const snap = committed[i];
        try {
          if (snap.existed && !snap.isDir) {
            const restoreTmp = `${snap.filePath}.restore.${process.pid}.${uid()}`;
            fs.writeFileSync(restoreTmp, snap.content);
            fs.renameSync(restoreTmp, snap.filePath);
          } else if (!snap.existed) {
            fs.unlinkSync(snap.filePath);
          }
        } catch {}
      }
      throw error;
    }
  }

  function exportBundleToRepo(bundle) {
    const bundlePath = path.join(rootDir, 'shared', 'locales', 'l10n-bundle.json');
    const { surfaceLocaleData } = assembleSurfaceLocaleData({ root: rootDir, bundle });
    const targets = [
      { filePath: bundlePath, content: JSON.stringify(bundle, null, 2) + '\n' }
    ];
    for (const surface of ['user', 'admin']) {
      const dir = path.join(rootDir, 'web', surface);
      if (fs.existsSync(dir)) {
        targets.push({ filePath: path.join(dir, 'locale-data.js'), content: surfaceLocaleData });
      }
    }
    writeFilesAtomically(targets);
    return {
      bundleFile: 'shared/locales/l10n-bundle.json',
      files: targets.map(t => path.relative(rootDir, t.filePath).replace(/\\/g, '/'))
    };
  }

  function cleanupUnreferencedMediaFile(filename) {
    if (!filename || !MEDIA_FILENAME.test(filename)) return;
    const stillUsed = db.prepare('SELECT 1 FROM l10n_media_assets WHERE filename=? LIMIT 1').get(filename);
    if (stillUsed) return;
    const full = path.resolve(mediaDir, filename);
    if (!full.startsWith(path.resolve(mediaDir) + path.sep)) return;
    try {
      fs.unlinkSync(full);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  function serveMediaFile(res, filename) {
    if (!MEDIA_FILENAME.test(filename)) throw new ApiError(400, 'INVALID_MEDIA_FILENAME');
    const registered = db.prepare('SELECT 1 FROM l10n_media_assets WHERE filename=? LIMIT 1').get(filename);
    if (!registered) throw new ApiError(404, 'MEDIA_NOT_FOUND');
    const full = path.resolve(mediaDir, filename);
    if (!full.startsWith(path.resolve(mediaDir) + path.sep) || !fs.existsSync(full)) throw new ApiError(404, 'MEDIA_NOT_FOUND');
    const stat = fs.lstatSync(full);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new ApiError(404, 'MEDIA_NOT_FOUND');
    const ext = path.extname(filename).slice(1).toLowerCase();
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME_BY_EXT[ext] || 'application/octet-stream');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(fs.readFileSync(full));
  }

  async function publicRoute(req, res, url) {
    const m = url.pathname.match(/^\/api\/l10n\/media\/([a-f0-9]{16,64}\.(?:png|jpg|webp|svg))$/);
    if (m && req.method === 'GET') {
      serveMediaFile(res, m[1]);
      return true;
    }
    return false;
  }

  async function adminRoute(req, res, url, session) {
    const p = url.pathname;
    if (!p.startsWith('/api/admin/l10n')) return false;

    if (p === '/api/admin/l10n/overview' && req.method === 'GET') {
      json(res, 200, computeOverview());
      return true;
    }

    if (p === '/api/admin/l10n/strings' && req.method === 'GET') {
      json(res, 200, listStrings(url));
      return true;
    }

    if (p === '/api/admin/l10n/strings' && req.method === 'POST') {
      const body = await readJson(req, 32768);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const key = String(body.key || '').trim();
      const sourceText = String(body.sourceText || '').trim();
      const contextId = String(body.contextId || 'general').trim() || 'general';
      const description = String(body.description || '').trim().slice(0, 500);
      const maxChars = body.maxChars == null || body.maxChars === '' ? null : Number(body.maxChars);
      if (!KEY_PATTERN.test(key) || !sourceText || sourceText.length > 2000 || (maxChars !== null && (!Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > 2000))) {
        throw new ApiError(422, 'INVALID_L10N_KEY');
      }
      if (db.prepare('SELECT 1 FROM l10n_keys WHERE key=?').get(key)) throw new ApiError(409, 'L10N_KEY_EXISTS');
      const ns = key.split('.').slice(0, -1).join('.');
      const stamp = now();
      transaction(db, () => {
        db.prepare('INSERT INTO l10n_keys VALUES(?,?,?,?,?,?,?,?,?,?,1,?)')
          .run(key, ns, sourceText, sha256Hex(sourceText), contextId, description, maxChars, JSON.stringify(extractPlaceholders(sourceText)), '[]', null, stamp);
        const insTr = db.prepare('INSERT INTO l10n_translations VALUES(?,?,?,?,?,?,?,?,?)');
        for (const loc of TARGET_LOCALES) {
          insTr.run(key, loc, '', 'untranslated', null, null, '[]', active.admin_username || 'admin', stamp);
        }
      });
      audit('l10n_key_created', key, { namespace: ns, contextId, admin: active.admin_username });
      json(res, 201, { key });
      return true;
    }

    const stringMatch = p.match(/^\/api\/admin\/l10n\/strings\/([a-z][a-z0-9_.]*)$/);
    if (stringMatch && req.method === 'PUT') {
      const key = stringMatch[1];
      const body = await readJson(req, 65536);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const existing = db.prepare('SELECT * FROM l10n_keys WHERE key=?').get(key);
      if (!existing) throw new ApiError(404, 'L10N_KEY_NOT_FOUND');
      if (body.revision !== undefined && body.revision !== existing.revision) throw new ApiError(409, 'L10N_REVISION_CONFLICT');

      const nextSource = body.sourceText !== undefined ? String(body.sourceText).trim() : existing.source_text;
      if (!nextSource || nextSource.length > 2000) throw new ApiError(422, 'INVALID_L10N_SOURCE');
      const nextContext = body.contextId !== undefined ? String(body.contextId).trim() || 'general' : existing.context_id;
      const nextDesc = body.description !== undefined ? String(body.description).trim().slice(0, 500) : existing.description;
      const nextMax = body.maxChars !== undefined ? (body.maxChars === null || body.maxChars === '' ? null : Number(body.maxChars)) : existing.max_chars;
      if (nextMax !== null && (!Number.isSafeInteger(nextMax) || nextMax < 1 || nextMax > 2000)) throw new ApiError(422, 'INVALID_MAX_CHARS');

      const sourceChanged = nextSource !== existing.source_text;
      const glossary = allGlossary();
      const stamp = now();
      const lintByLocale = {};

      transaction(db, () => {
        db.prepare('UPDATE l10n_keys SET source_text=?,source_hash=?,context_id=?,description=?,max_chars=?,placeholders_json=?,revision=revision+1,updated_at=? WHERE key=?')
          .run(nextSource, sha256Hex(nextSource), nextContext, nextDesc, nextMax, JSON.stringify(extractPlaceholders(nextSource)), stamp, key);
        if (sourceChanged) {
          db.prepare("UPDATE l10n_translations SET status='stale',updated_at=? WHERE key=? AND status='approved'").run(stamp, key);
        }
        if (body.translations && typeof body.translations === 'object') {
          const upsert = db.prepare(`INSERT INTO l10n_translations(key,locale,value,status,ai_provider,ai_model,lint_json,updated_by,updated_at)
            VALUES(?,?,?,?,NULL,NULL,?,?,?)
            ON CONFLICT(key,locale) DO UPDATE SET value=excluded.value,status=excluded.status,lint_json=excluded.lint_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`);
          for (const [loc, patch] of Object.entries(body.translations)) {
            if (!TARGET_LOCALES.includes(loc) || !patch || typeof patch !== 'object') continue;
            const value = String(patch.value ?? '').trim();
            const issues = lintTranslation({ sourceText: nextSource, value, locale: loc, maxChars: nextMax, glossary, contextId: nextContext });
            lintByLocale[loc] = issues;
            const hasBlock = issues.some(i => i.severity === 'block');
            let nextStatus = patch.status && VALID_STATUSES.has(patch.status) ? patch.status : (value ? 'needs_review' : 'untranslated');
            if (nextStatus === 'approved' && (!value || hasBlock)) {
              throw new ApiError(422, 'L10N_LINT_BLOCKED', `${loc} 번역에 차단 Lint 오류가 있어 승인할 수 없습니다.`);
            }
            upsert.run(key, loc, value, nextStatus, JSON.stringify(issues), active.admin_username || 'admin', stamp);
          }
        }
      });
      audit('l10n_string_updated', key, { sourceChanged, locales: Object.keys(body.translations || {}), admin: active.admin_username });
      json(res, 200, { ok: true, key, revision: existing.revision + 1, lint: lintByLocale });
      return true;
    }

    if (p === '/api/admin/l10n/strings/approve' && req.method === 'POST') {
      const body = await readJson(req, 32768);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const keys = Array.isArray(body.keys) ? body.keys.filter(k => typeof k === 'string' && KEY_PATTERN.test(k)) : [];
      const locales = Array.isArray(body.locales) && body.locales.length ? body.locales.filter(l => TARGET_LOCALES.includes(l)) : [...TARGET_LOCALES];
      if (!keys.length) throw new ApiError(422, 'KEYS_REQUIRED');
      const glossary = allGlossary();
      const stamp = now();
      let approved = 0;
      const blocked = [];
      transaction(db, () => {
        for (const key of keys) {
          const k = db.prepare('SELECT * FROM l10n_keys WHERE key=?').get(key);
          if (!k) continue;
          for (const loc of locales) {
            const tr = db.prepare('SELECT * FROM l10n_translations WHERE key=? AND locale=?').get(key, loc);
            if (!tr || !tr.value.trim()) continue;
            const issues = lintTranslation({ sourceText: k.source_text, value: tr.value, locale: loc, maxChars: k.max_chars, glossary, contextId: k.context_id });
            if (issues.some(i => i.severity === 'block')) {
              blocked.push({ key, locale: loc, issues });
              continue;
            }
            db.prepare("UPDATE l10n_translations SET status='approved',lint_json=?,updated_by=?,updated_at=? WHERE key=? AND locale=?")
              .run(JSON.stringify(issues), active.admin_username || 'admin', stamp, key, loc);
            approved++;
          }
        }
      });
      audit('l10n_batch_approved', `${keys.length} keys`, { approved, blockedCount: blocked.length, admin: active.admin_username });
      json(res, 200, { approved, blocked });
      return true;
    }

    if (p === '/api/admin/l10n/strings/export' && req.method === 'GET') {
      const format = url.searchParams.get('format') || 'json';
      const data = listStrings(new URL('http://local/api/admin/l10n/strings?limit=5000'));
      if (format === 'csv') {
        const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const header = ['key', 'namespace', 'contextId', 'ko', ...TARGET_LOCALES].join(',');
        const lines = data.items.map(item => [
          item.key, item.namespace, item.contextId, item.sourceText,
          ...TARGET_LOCALES.map(loc => item.translations[loc]?.value || '')
        ].map(esc).join(','));
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.end('\uFEFF' + [header, ...lines].join('\n'));
        return true;
      }
      json(res, 200, { exportedAt: new Date(now()).toISOString(), items: data.items });
      return true;
    }

    if (p === '/api/admin/l10n/gather' && req.method === 'POST') {
      const body = await readJson(req, 8192);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const apply = body.apply === true;
      const result = gatherPlatformTexts(rootDir);
      const existingRows = db.prepare('SELECT * FROM l10n_keys').all();
      const existingMap = new Map(existingRows.map(r => [r.key, r]));
      const gatheredKeys = new Set(result.entries.map(e => e.key));

      const added = [], changed = [], unused = [];
      for (const entry of result.entries) {
        const prev = existingMap.get(entry.key);
        if (!prev) added.push(entry);
        else if (prev.source_hash !== entry.sourceHash) changed.push({ ...entry, previousSource: prev.source_text });
      }
      for (const prev of existingRows) {
        if (!prev.key.includes('.legacy.') && !gatheredKeys.has(prev.key) && !prev.unused_since) {
          unused.push({ key: prev.key, sourceText: prev.source_text });
        }
      }

      if (apply && !result.conflicts.length) {
        const stamp = now();
        transaction(db, () => {
          const insKey = db.prepare('INSERT INTO l10n_keys VALUES(?,?,?,?,?,?,?,?,?,?,1,?)');
          const insTr = db.prepare('INSERT OR IGNORE INTO l10n_translations VALUES(?,?,?,?,?,?,?,?,?)');
          for (const entry of result.entries) {
            const prev = existingMap.get(entry.key);
            if (!prev) {
              insKey.run(entry.key, entry.namespace, entry.sourceText, entry.sourceHash, entry.contextId, '', entry.maxChars, JSON.stringify(entry.placeholders), JSON.stringify(entry.codeRefs), null, stamp);
              for (const loc of TARGET_LOCALES) insTr.run(entry.key, loc, '', 'untranslated', null, null, '[]', 'gather', stamp);
            } else {
              const sourceDiff = prev.source_hash !== entry.sourceHash;
              db.prepare('UPDATE l10n_keys SET source_text=?,source_hash=?,context_id=?,max_chars=?,placeholders_json=?,code_refs_json=?,unused_since=NULL,revision=revision+?,updated_at=? WHERE key=?')
                .run(entry.sourceText, entry.sourceHash, entry.contextId || prev.context_id, entry.maxChars ?? prev.max_chars, JSON.stringify(entry.placeholders), JSON.stringify(entry.codeRefs), sourceDiff ? 1 : 0, stamp, entry.key);
              if (sourceDiff) {
                db.prepare("UPDATE l10n_translations SET status='stale',updated_at=? WHERE key=? AND status='approved'").run(stamp, entry.key);
              }
            }
          }
          for (const u of unused) {
            db.prepare('UPDATE l10n_keys SET unused_since=?,updated_at=? WHERE key=?').run(stamp, stamp, u.key);
          }
        });
        audit('l10n_gather_applied', `${result.entries.length} keys`, { added: added.length, changed: changed.length, unused: unused.length, admin: active.admin_username });
      }
      json(res, 200, {
        applied: apply && !result.conflicts.length,
        scannedFiles: result.scannedFiles,
        totalGathered: result.entries.length,
        added: added.slice(0, 100),
        changed: changed.slice(0, 100),
        unused: unused.slice(0, 100),
        conflicts: result.conflicts,
        counts: { added: added.length, changed: changed.length, unused: unused.length, conflicts: result.conflicts.length }
      });
      return true;
    }

    if (p === '/api/admin/l10n/import-bundle' && req.method === 'POST') {
      await readJson(req, 4096);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const result = syncBundleFromRepo({ actor: active.admin_username || 'admin' });
      if (!result.bundleFound) throw new ApiError(404, 'L10N_BUNDLE_NOT_FOUND');
      audit('l10n_bundle_imported', 'shared/locales/l10n-bundle.json', {
        keysAdded: result.keysAdded,
        translationsFilled: result.translationsFilled,
        skippedExisting: result.skippedExisting,
        admin: active.admin_username
      });
      json(res, 200, { ok: true, ...result });
      return true;
    }

    // Glossary CRUD
    if (p === '/api/admin/l10n/glossary' && req.method === 'GET') {
      json(res, 200, { items: allGlossary() });
      return true;
    }
    if (p === '/api/admin/l10n/glossary' && req.method === 'POST') {
      const body = await readJson(req, 16384);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const termKo = String(body.termKo || '').trim();
      if (!termKo || termKo.length > 120) throw new ApiError(422, 'INVALID_GLOSSARY_TERM');
      const id = uid();
      const stamp = now();
      db.prepare('INSERT INTO l10n_glossary VALUES(?,?,?,?,?,?,?,?,?)').run(
        id, termKo, String(body.termEn || '').trim().slice(0, 120), body.isDnt ? 1 : 0,
        JSON.stringify(Array.isArray(body.contextTags) ? body.contextTags.slice(0, 10) : []),
        JSON.stringify(body.translations && typeof body.translations === 'object' ? body.translations : {}),
        JSON.stringify(Array.isArray(body.forbidden) ? body.forbidden.slice(0, 10) : []),
        String(body.notes || '').trim().slice(0, 300), stamp
      );
      audit('l10n_glossary_created', termKo, { id, isDnt: Boolean(body.isDnt), admin: active.admin_username });
      json(res, 201, { id });
      return true;
    }
    const glossaryMatch = p.match(/^\/api\/admin\/l10n\/glossary\/([a-zA-Z0-9_-]+)$/);
    if (glossaryMatch && req.method === 'DELETE') {
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const deleted = db.prepare('DELETE FROM l10n_glossary WHERE id=?').run(glossaryMatch[1]);
      if (!deleted.changes) throw new ApiError(404, 'GLOSSARY_NOT_FOUND');
      audit('l10n_glossary_deleted', glossaryMatch[1], { admin: active.admin_username });
      json(res, 200, { ok: true });
      return true;
    }

    // Prompts CRUD
    if (p === '/api/admin/l10n/prompts' && req.method === 'GET') {
      json(res, 200, { items: allPrompts() });
      return true;
    }
    if (p === '/api/admin/l10n/prompts' && req.method === 'POST') {
      const body = await readJson(req, 32768);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const name = String(body.name || '').trim();
      const contextId = String(body.contextId || '').trim();
      const systemPrompt = String(body.systemPrompt || '').trim();
      if (!name || !contextId || !systemPrompt) throw new ApiError(422, 'INVALID_PROMPT');
      const id = body.id && /^[a-z0-9_-]{3,60}$/.test(body.id) ? body.id : `prompt-${uid().slice(0, 8)}`;
      const stamp = now();
      db.prepare(`INSERT INTO l10n_prompts VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET name=excluded.name,context_id=excluded.context_id,system_prompt=excluded.system_prompt,rules_json=excluded.rules_json,disambiguation_json=excluded.disambiguation_json,updated_at=excluded.updated_at`)
        .run(id, name.slice(0, 120), contextId.slice(0, 60), systemPrompt.slice(0, 4000), JSON.stringify(Array.isArray(body.rules) ? body.rules : []), JSON.stringify(Array.isArray(body.disambiguation) ? body.disambiguation : []), stamp);
      audit('l10n_prompt_saved', id, { contextId, admin: active.admin_username });
      json(res, 200, { id });
      return true;
    }
    const promptMatch = p.match(/^\/api\/admin\/l10n\/prompts\/([a-zA-Z0-9_-]+)$/);
    if (promptMatch && req.method === 'DELETE') {
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const deleted = db.prepare('DELETE FROM l10n_prompts WHERE id=?').run(promptMatch[1]);
      if (!deleted.changes) throw new ApiError(404, 'PROMPT_NOT_FOUND');
      audit('l10n_prompt_deleted', promptMatch[1], { admin: active.admin_username });
      json(res, 200, { ok: true });
      return true;
    }

    // AI Translation
    if (p === '/api/admin/l10n/ai/status' && req.method === 'GET') {
      json(res, 200, aiProvidersStatus());
      return true;
    }
    if (p === '/api/admin/l10n/ai/translate' && req.method === 'POST') {
      const body = await readJson(req, 32768);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const rawProvider = body.provider === undefined ? 'mock' : body.provider;
      if (typeof rawProvider !== 'string' || !VALID_AI_PROVIDERS.includes(rawProvider)) {
        throw new ApiError(422, 'INVALID_AI_PROVIDER');
      }
      const provider = rawProvider;
      if (body.baseUrl !== undefined && body.baseUrl !== null && body.baseUrl !== '') {
        throw new ApiError(422, 'BASE_URL_OVERRIDE_NOT_ALLOWED');
      }
      const targetLocale = String(body.targetLocale || 'en');
      if (!TARGET_LOCALES.includes(targetLocale)) throw new ApiError(422, 'INVALID_LOCALE');
      const requestedKeys = Array.isArray(body.keys) ? body.keys.filter(k => typeof k === 'string' && KEY_PATTERN.test(k)).slice(0, 50) : [];
      if (!requestedKeys.length) throw new ApiError(422, 'KEYS_REQUIRED');

      const items = requestedKeys.map(k => db.prepare('SELECT * FROM l10n_keys WHERE key=?').get(k)).filter(Boolean).map(r => ({
        key: r.key, sourceText: r.source_text, contextId: r.context_id, description: r.description, maxChars: r.max_chars
      }));
      if (!items.length) throw new ApiError(404, 'L10N_KEYS_NOT_FOUND');

      const prompts = allPrompts();
      const primaryCtx = body.contextId || items[0].contextId || 'general';
      const promptProfile = prompts.find(pr => pr.id === body.promptId) || prompts.find(pr => pr.contextId === primaryCtx) || prompts[0] || null;
      const glossary = allGlossary();
      const apiKey = provider === 'gemini'
        ? (env.PLAYHUB_L10N_GEMINI_API_KEY || env.GEMINI_API_KEY || '')
        : provider === 'openai'
          ? (env.PLAYHUB_L10N_OPENAI_API_KEY || env.OPENAI_API_KEY || '')
          : '';
      let baseUrl = configuredOpenAiBaseUrl();
      if (provider === 'openai') {
        try {
          baseUrl = validateOpenAiBaseUrl(baseUrl);
        } catch {
          throw new ApiError(422, 'INVALID_OPENAI_BASE_URL');
        }
      }

      let aiResult;
      try {
        aiResult = await translateWithAi({
          provider, model: body.model || '', baseUrl, apiKey, items, targetLocale, promptProfile, glossary, fetchImpl
        });
      } catch (error) {
        throw new ApiError(502, 'AI_TRANSLATION_FAILED', `AI 번역 호출 실패: ${error.message}`);
      }

      const stamp = now();
      const results = [];
      transaction(db, () => {
        const upsert = db.prepare(`INSERT INTO l10n_translations(key,locale,value,status,ai_provider,ai_model,lint_json,updated_by,updated_at)
          VALUES(?,?,?,'ai_draft',?,?,?,?,?)
          ON CONFLICT(key,locale) DO UPDATE SET value=excluded.value,status='ai_draft',ai_provider=excluded.ai_provider,ai_model=excluded.ai_model,lint_json=excluded.lint_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`);
        for (const item of items) {
          const translated = String(aiResult.translations?.[item.key] ?? '').trim();
          if (!translated) continue;
          const issues = lintTranslation({ sourceText: item.sourceText, value: translated, locale: targetLocale, maxChars: item.maxChars, glossary, contextId: item.contextId });
          upsert.run(item.key, targetLocale, translated, aiResult.provider, aiResult.model, JSON.stringify(issues), active.admin_username || 'admin', stamp);
          results.push({ key: item.key, sourceText: item.sourceText, translated, status: 'ai_draft', lint: issues });
        }
      });
      audit('l10n_ai_translated', `${results.length} keys (${targetLocale})`, { provider: aiResult.provider, model: aiResult.model, promptId: promptProfile?.id || null, admin: active.admin_username });
      json(res, 200, { provider: aiResult.provider, model: aiResult.model, targetLocale, promptPreview: aiResult.promptPreview, results });
      return true;
    }

    // Localized Media Management
    if (p === '/api/admin/l10n/media' && req.method === 'GET') {
      json(res, 200, mediaOverview());
      return true;
    }
    const mediaFileMatch = p.match(/^\/api\/admin\/l10n\/media\/file\/([a-f0-9]{16,64}\.(?:png|jpg|webp|svg))$/);
    if (mediaFileMatch && req.method === 'GET') {
      serveMediaFile(res, mediaFileMatch[1]);
      return true;
    }
    if (p === '/api/admin/l10n/media/slots' && req.method === 'POST') {
      const body = await readJson(req, 8192);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const slotKey = String(body.slotKey || '').trim();
      if (!SLOT_PATTERN.test(slotKey)) throw new ApiError(422, 'INVALID_MEDIA_SLOT_KEY');
      const altKey = body.altTextKey ? String(body.altTextKey).trim() : null;
      if (altKey && !KEY_PATTERN.test(altKey)) throw new ApiError(422, 'INVALID_ALT_TEXT_KEY');
      const stamp = now();
      db.prepare(`INSERT INTO l10n_media_slots VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(slot_key) DO UPDATE SET description=excluded.description,alt_text_key=excluded.alt_text_key,width=excluded.width,height=excluded.height,updated_at=excluded.updated_at`)
        .run(slotKey, String(body.description || '').trim().slice(0, 300), altKey, Number.isSafeInteger(body.width) ? body.width : null, Number.isSafeInteger(body.height) ? body.height : null, 1024 * 1024, JSON.stringify(['webp', 'png', 'jpg', 'svg']), stamp);
      audit('l10n_media_slot_saved', slotKey, { altKey, admin: active.admin_username });
      json(res, 201, { slotKey });
      return true;
    }
    if (p === '/api/admin/l10n/media/assets' && req.method === 'POST') {
      const body = await readJson(req, 2 * 1024 * 1024);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const slotKey = String(body.slotKey || '').trim();
      const locale = String(body.locale || '').trim();
      if (!LOCALES.includes(locale)) throw new ApiError(422, 'INVALID_LOCALE');
      const slot = db.prepare('SELECT * FROM l10n_media_slots WHERE slot_key=?').get(slotKey);
      if (!slot) throw new ApiError(404, 'MEDIA_SLOT_NOT_FOUND');
      let validated;
      try {
        validated = validateMediaUpload({
          base64: body.dataBase64,
          filename: body.filename || '',
          maxBytes: slot.max_bytes,
          allowedFormats: safeJson(slot.allowed_formats_json, ['webp', 'png', 'jpg', 'svg'])
        });
      } catch (error) {
        throw new ApiError(422, error.message || 'MEDIA_INVALID', `이미지 검증 실패: ${error.message}`);
      }
      const prevAsset = db.prepare('SELECT filename FROM l10n_media_assets WHERE slot_key=? AND locale=?').get(slotKey, locale);
      fs.mkdirSync(mediaDir, { recursive: true, mode: 0o700 });
      const filename = `${validated.sha256.slice(0, 24)}.${validated.ext}`;
      fs.writeFileSync(path.join(mediaDir, filename), validated.buffer);
      const stamp = now();
      db.prepare(`INSERT INTO l10n_media_assets VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(slot_key,locale) DO UPDATE SET filename=excluded.filename,mime_type=excluded.mime_type,bytes=excluded.bytes,sha256=excluded.sha256,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
        .run(slotKey, locale, filename, validated.mimeType, validated.bytes, validated.sha256, active.admin_username || 'admin', stamp);
      if (prevAsset && prevAsset.filename !== filename) {
        cleanupUnreferencedMediaFile(prevAsset.filename);
      }
      audit('l10n_media_uploaded', `${slotKey}:${locale}`, { filename, bytes: validated.bytes, sha256Prefix: validated.sha256.slice(0, 16), admin: active.admin_username });
      json(res, 201, {
        slotKey, locale, filename, mimeType: validated.mimeType, bytes: validated.bytes,
        adminUrl: `/api/admin/l10n/media/file/${filename}`,
        publicUrl: `/api/l10n/media/${filename}`
      });
      return true;
    }
    const delMediaMatch = p.match(/^\/api\/admin\/l10n\/media\/assets\/(img\.[a-z0-9_.]+)\/([A-Za-z-]+)$/);
    if (delMediaMatch && req.method === 'DELETE') {
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const existing = db.prepare('SELECT filename FROM l10n_media_assets WHERE slot_key=? AND locale=?').get(delMediaMatch[1], delMediaMatch[2]);
      if (!existing) throw new ApiError(404, 'MEDIA_ASSET_NOT_FOUND');
      db.prepare('DELETE FROM l10n_media_assets WHERE slot_key=? AND locale=?').run(delMediaMatch[1], delMediaMatch[2]);
      cleanupUnreferencedMediaFile(existing.filename);
      audit('l10n_media_deleted', `${delMediaMatch[1]}:${delMediaMatch[2]}`, { filename: existing.filename, admin: active.admin_username });
      json(res, 200, { ok: true });
      return true;
    }

    // Releases (Hybrid Versioning: Immutable SQLite Snapshots + Repo Export + Rollback)
    if (p === '/api/admin/l10n/releases' && req.method === 'GET') {
      const rows = db.prepare('SELECT version,tag,sha256,key_count,media_count,coverage_json,notes,is_active,created_by,created_at FROM l10n_releases ORDER BY version DESC LIMIT 30').all();
      json(res, 200, {
        releases: rows.map(r => ({
          version: r.version,
          tag: r.tag,
          sha256Prefix: r.sha256.slice(0, 16),
          keyCount: r.key_count,
          mediaCount: r.media_count,
          coverage: safeJson(r.coverage_json, {}),
          notes: r.notes,
          isActive: Boolean(r.is_active),
          createdBy: r.created_by,
          createdAt: new Date(r.created_at).toISOString()
        }))
      });
      return true;
    }
    if (p === '/api/admin/l10n/releases' && req.method === 'POST') {
      const body = await readJson(req, 8192);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const notes = String(body.notes || '').trim().slice(0, 500);
      const exportToRepo = body.exportToRepo === true;
      const lastVersion = db.prepare('SELECT COALESCE(MAX(version),0) AS v FROM l10n_releases').get().v;
      const nextVersion = lastVersion + 1;
      const tag = `l10n-v${nextVersion}`;
      const built = buildReleaseBundle(tag);
      const stamp = now();
      let exported = null;
      try {
        transaction(db, () => {
          db.prepare('UPDATE l10n_releases SET is_active=0 WHERE is_active=1').run();
          db.prepare('INSERT INTO l10n_releases VALUES(?,?,?,?,?,?,?,?,1,?,?)')
            .run(nextVersion, tag, built.sha256, built.keyCount, built.mediaCount, JSON.stringify(built.coverage), built.jsonText, notes, active.admin_username || 'admin', stamp);
          if (exportToRepo) exported = exportBundleToRepo(built.bundle);
        });
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(500, 'L10N_REPO_EXPORT_FAILED', `리포 번들 내보내기 실패로 릴리스 활성화를 롤백했습니다 (${error?.code || 'WRITE_ERROR'}).`);
      }
      audit('l10n_release_published', tag, { version: nextVersion, keyCount: built.keyCount, mediaCount: built.mediaCount, exportToRepo, admin: active.admin_username });
      json(res, 201, {
        release: { version: nextVersion, tag, sha256Prefix: built.sha256.slice(0, 16), keyCount: built.keyCount, mediaCount: built.mediaCount, coverage: built.coverage, isActive: true, exported }
      });
      return true;
    }
    const activateMatch = p.match(/^\/api\/admin\/l10n\/releases\/(\d+)\/activate$/);
    if (activateMatch && req.method === 'POST') {
      const body = await readJson(req, 4096);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const version = Number(activateMatch[1]);
      const target = db.prepare('SELECT * FROM l10n_releases WHERE version=?').get(version);
      if (!target) throw new ApiError(404, 'RELEASE_NOT_FOUND');
      let exported = null;
      try {
        transaction(db, () => {
          db.prepare('UPDATE l10n_releases SET is_active=0 WHERE is_active=1').run();
          db.prepare('UPDATE l10n_releases SET is_active=1 WHERE version=?').run(version);
          if (body.exportToRepo === true) exported = exportBundleToRepo(safeJson(target.bundle_json, {}));
        });
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(500, 'L10N_REPO_EXPORT_FAILED', `리포 번들 내보내기 실패로 릴리스 활성화를 롤백했습니다 (${error?.code || 'WRITE_ERROR'}).`);
      }
      audit('l10n_release_activated', target.tag, { version, exportToRepo: Boolean(body.exportToRepo), admin: active.admin_username });
      json(res, 200, { ok: true, version, tag: target.tag, exported });
      return true;
    }

    return false;
  }

  return { publicRoute, adminRoute, computeOverview };
}
