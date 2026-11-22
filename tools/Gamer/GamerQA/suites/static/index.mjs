import fs from 'node:fs';
import path from 'node:path';
import {
  GAME_ID_RE,
  SEMVER_RE,
  checkImageSignature,
  guardRelativePath,
  isValidIsoDate,
  parseHtmlDocument,
  readStrictJson,
  resolveWebAssetRef,
  walkWebTree,
} from '../../core/fs-utils.mjs';

const VALID_CONTROLS = new Set(['keyboard', 'mouse', 'touch', 'gamepad']);
const VALID_ORIENTATIONS = new Set(['any', 'landscape', 'portrait']);
const VALID_RESIZE = new Set(['fit', 'responsive']);
const VALID_INTEGRATIONS = new Set(['legacy-localstorage', 'native-sdk']);
const LINK_RELS = new Set([
  'stylesheet',
  'icon',
  'shortcut',
  'preload',
  'modulepreload',
  'manifest',
  'prefetch',
  'apple-touch-icon',
]);

function ruleSeverity(policy, ruleId, fallback) {
  return policy?.rules?.find((r) => r.id === ruleId)?.severity || fallback;
}

function makeCheck(policy, ruleId, status, title, message, details = [], evidence = null, fallbackSeverity = 'block') {
  const item = {
    id: ruleId,
    ruleId,
    suite: 'static',
    tier: 0,
    severity: ruleSeverity(policy, ruleId, fallbackSeverity),
    status,
    title,
    message,
  };
  if (details && details.length) item.details = details.slice(0, 30);
  if (evidence !== null && evidence !== undefined) item.evidence = evidence;
  return item;
}

function validateLocalizedPair(obj, field, { minLen = 1, maxLen = 100, allowHtml = false, allowActive = false } = {}) {
  const errors = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return [`${field} must be an object with ko and en strings`];
  }
  for (const lang of ['ko', 'en']) {
    const val = obj[lang];
    if (typeof val !== 'string') {
      errors.push(`${field}.${lang} must be a string`);
      continue;
    }
    const trimmed = val.trim();
    if (trimmed.length < minLen || val.length > maxLen) {
      errors.push(`${field}.${lang} length must be ${minLen}..${maxLen} chars (got ${trimmed.length})`);
    }
    if (!allowHtml && /<\s*\/?\s*[A-Za-z!]/.test(val)) {
      errors.push(`${field}.${lang} must be plain text without HTML tags`);
    }
    if (!allowActive && (/<\s*(?:script|iframe|object|embed|style)\b|(?:javascript|vbscript)\s*:/i.test(val))) {
      errors.push(`${field}.${lang} contains disallowed active content`);
    }
  }
  return errors;
}

function validateManifestContract(manifest, gameId) {
  const issues = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['Manifest root must be a JSON object'];
  }
  if (manifest.schemaVersion !== 1) issues.push(`schemaVersion must be 1 (got ${manifest.schemaVersion})`);
  if (manifest.id !== gameId) issues.push(`manifest.id (${manifest.id}) must match gameId (${gameId})`);
  if (manifest.slug !== gameId) issues.push(`manifest.slug (${manifest.slug}) must match gameId (${gameId})`);

  if (typeof manifest.entry !== 'string' || !manifest.entry.trim() || !/\.html?$/i.test(manifest.entry)) {
    issues.push(`manifest.entry must be an HTML filename (got ${JSON.stringify(manifest.entry)})`);
  }
  if (typeof manifest.version !== 'string' || !SEMVER_RE.test(manifest.version)) {
    issues.push(`manifest.version must be semver major.minor.patch (got ${JSON.stringify(manifest.version)})`);
  }
  if (manifest.publishedOn !== undefined && !isValidIsoDate(manifest.publishedOn)) {
    issues.push(`Invalid publishedOn date: ${manifest.publishedOn}`);
  }
  if (manifest.updatedOn !== undefined && !isValidIsoDate(manifest.updatedOn)) {
    issues.push(`Invalid updatedOn date: ${manifest.updatedOn}`);
  }
  if (manifest.integration !== undefined && !VALID_INTEGRATIONS.has(manifest.integration)) {
    issues.push(`Invalid integration mode: ${manifest.integration}`);
  }

  issues.push(...validateLocalizedPair(manifest.title, 'title', { minLen: 1, maxLen: 100 }));
  issues.push(...validateLocalizedPair(manifest.summary, 'summary', { minLen: 10, maxLen: 600 }));
  issues.push(...validateLocalizedPair(manifest.instructions, 'instructions', { minLen: 20, maxLen: 4000, allowHtml: true }));
  if (manifest.rules !== undefined) {
    issues.push(...validateLocalizedPair(manifest.rules, 'rules', { minLen: 20, maxLen: 4000, allowHtml: true }));
  }

  if (!Array.isArray(manifest.tags) || manifest.tags.length < 1 || manifest.tags.length > 10 || new Set(manifest.tags).size !== manifest.tags.length) {
    issues.push('tags must be a unique non-empty array of 1..10 identifiers');
  } else if (manifest.tags.some((t) => typeof t !== 'string' || !GAME_ID_RE.test(t))) {
    issues.push('All tags must match identifier pattern');
  }

  if (!Array.isArray(manifest.controls) || manifest.controls.length < 1 || manifest.controls.length > 4 || new Set(manifest.controls).size !== manifest.controls.length) {
    issues.push('controls must be a unique non-empty array of 1..4 entries');
  } else if (manifest.controls.some((c) => !VALID_CONTROLS.has(c))) {
    issues.push('controls contains unsupported control type');
  }

  const vp = manifest.viewport;
  if (!vp || typeof vp !== 'object') {
    issues.push('viewport object is required');
  } else {
    if (!Number.isInteger(vp.width) || vp.width < 240 || vp.width > 3840) issues.push(`Invalid viewport.width: ${vp.width}`);
    if (!Number.isInteger(vp.height) || vp.height < 240 || vp.height > 3840) issues.push(`Invalid viewport.height: ${vp.height}`);
    if (!VALID_ORIENTATIONS.has(vp.orientation)) issues.push(`Invalid viewport.orientation: ${vp.orientation}`);
    if (!VALID_RESIZE.has(vp.resize)) issues.push(`Invalid viewport.resize: ${vp.resize}`);
  }

  const cap = manifest.capabilities;
  if (!cap || typeof cap !== 'object') {
    issues.push('capabilities object is required');
  } else {
    for (const k of ['webgl', 'wasm', 'workers', 'fullscreen', 'pointerLock']) {
      if (typeof cap[k] !== 'boolean') issues.push(`capabilities.${k} must be boolean`);
    }
    if (!Array.isArray(cap.externalNetwork) || cap.externalNetwork.some((u) => typeof u !== 'string')) {
      issues.push('capabilities.externalNetwork must be an array of strings');
    }
  }

  const save = manifest.save;
  if (!save || typeof save !== 'object') {
    issues.push('save object is required');
  } else {
    if (typeof save.enabled !== 'boolean') issues.push('save.enabled must be boolean');
    if (!Number.isInteger(save.schemaVersion) || save.schemaVersion < 1) issues.push('save.schemaVersion must be integer >= 1');
    if (!Number.isInteger(save.maxSlots) || save.maxSlots < 0 || save.maxSlots > 10) issues.push('save.maxSlots must be 0..10');
    if (save.enabled === true && save.maxSlots < 1) issues.push('save.maxSlots must be >= 1 when save.enabled is true');
    if (save.enabled === false && save.maxSlots !== 0) issues.push('save.maxSlots must be 0 when save.enabled is false');
  }

  if (manifest.seo !== undefined) {
    if (!manifest.seo || typeof manifest.seo !== 'object') {
      issues.push('seo must be an object when present');
    } else {
      issues.push(...validateLocalizedPair(manifest.seo.title, 'seo.title', { minLen: 1, maxLen: 100 }));
      issues.push(...validateLocalizedPair(manifest.seo.description, 'seo.description', { minLen: 10, maxLen: 600 }));
      if (typeof manifest.seo.indexable !== 'boolean') issues.push('seo.indexable must be boolean');
    }
  }

  const media = manifest.media;
  if (!media || typeof media !== 'object' || typeof media.cover !== 'string' || !Array.isArray(media.screenshots)) {
    issues.push('media object with cover and screenshots array is required');
  } else if (media.screenshots.length > 8 || new Set(media.screenshots).size !== media.screenshots.length) {
    issues.push('media.screenshots must have at most 8 unique paths');
  }

  return issues;
}

function collectHtmlAssetRefs(parsedHtml) {
  const refs = [];
  for (const { tag, attrs } of parsedHtml.tags) {
    if (tag === 'script' && Object.hasOwn(attrs, 'src')) refs.push({ ref: attrs.src, context: 'script[src]' });
    if (tag === 'img' && Object.hasOwn(attrs, 'src')) refs.push({ ref: attrs.src, context: 'img[src]' });
    if (tag === 'source' && Object.hasOwn(attrs, 'src')) refs.push({ ref: attrs.src, context: 'source[src]' });
    if (tag === 'audio' && Object.hasOwn(attrs, 'src')) refs.push({ ref: attrs.src, context: 'audio[src]' });
    if (tag === 'video') {
      if (Object.hasOwn(attrs, 'src')) refs.push({ ref: attrs.src, context: 'video[src]' });
      if (Object.hasOwn(attrs, 'poster')) refs.push({ ref: attrs.poster, context: 'video[poster]' });
    }
    if (tag === 'track' && Object.hasOwn(attrs, 'src')) refs.push({ ref: attrs.src, context: 'track[src]' });
    if (tag === 'input' && Object.hasOwn(attrs, 'src')) refs.push({ ref: attrs.src, context: 'input[src]' });
    if (tag === 'iframe' && Object.hasOwn(attrs, 'src')) refs.push({ ref: attrs.src, context: 'iframe[src]' });
    if (tag === 'object' && Object.hasOwn(attrs, 'data')) refs.push({ ref: attrs.data, context: 'object[data]' });
    if (tag === 'embed' && Object.hasOwn(attrs, 'src')) refs.push({ ref: attrs.src, context: 'embed[src]' });
    if (tag === 'link' && Object.hasOwn(attrs, 'href')) {
      const rels = String(attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (rels.some((r) => LINK_RELS.has(r))) refs.push({ ref: attrs.href, context: 'link[href]' });
    }
    if ((tag === 'img' || tag === 'source') && Object.hasOwn(attrs, 'srcset')) {
      for (const item of String(attrs.srcset || '').split(',')) {
        const candidate = item.trim().split(/\s+/)[0];
        if (candidate) refs.push({ ref: candidate, context: `${tag}[srcset]` });
      }
    }
  }
  return refs;
}

export async function runStaticSuite({ projectRoot, gameId, policy, catalog: providedCatalog }) {
  const checks = [];
  const limits = policy?.limits || {};
  const gamesRoot = path.join(projectRoot, 'games');
  const gameDir = path.join(gamesRoot, gameId);
  const webDir = path.join(gameDir, 'Web');

  // 1. STATIC-CATALOG-SYNC
  let catalog = providedCatalog;
  let catalogEntry = null;
  const catalogIssues = [];
  if (!GAME_ID_RE.test(gameId)) {
    catalogIssues.push(`Invalid game ID format: ${gameId}`);
  }
  try {
    if (!catalog) {
      const catalogPath = guardRelativePath(projectRoot, 'games/catalog.json');
      catalog = readStrictJson(catalogPath, limits.maxJsonBytes ?? 1048576);
    }
    if (!catalog || catalog.schemaVersion !== 1 || !Array.isArray(catalog.entries)) {
      catalogIssues.push('games/catalog.json has invalid schemaVersion or entries array');
    } else {
      const seenIds = new Set();
      const seenPaths = new Set();
      for (const item of catalog.entries) {
        if (seenIds.has(item.id)) catalogIssues.push(`Duplicate catalog id: ${item.id}`);
        if (seenPaths.has(item.path)) catalogIssues.push(`Duplicate catalog path: ${item.path}`);
        seenIds.add(item.id);
        seenPaths.add(item.path);
      }
      catalogEntry = catalog.entries.find((e) => e.id === gameId) || null;
      if (!catalogEntry) {
        catalogIssues.push(`Game '${gameId}' is not registered in games/catalog.json`);
      } else if (catalogEntry.path !== gameId) {
        catalogIssues.push(`Catalog entry path '${catalogEntry.path}' must equal id '${gameId}'`);
      }
    }
  } catch (err) {
    catalogIssues.push(`Failed to read games/catalog.json: ${err.message}`);
  }
  checks.push(
    makeCheck(
      policy,
      'STATIC-CATALOG-SYNC',
      catalogIssues.length ? 'fail' : 'pass',
      'Catalog & manifest ID parity',
      catalogIssues.length
        ? catalogIssues[0]
        : `Catalog entry verified (enabled=${Boolean(catalogEntry?.enabled)}, kind=${catalogEntry?.kind || 'unknown'})`,
      catalogIssues,
      { catalogEntry }
    )
  );

  // 2. STATIC-PATH-TRAVERSAL & game directory presence
  const traversalIssues = [];
  if (!fs.existsSync(gameDir)) {
    traversalIssues.push(`Game directory missing: games/${gameId}`);
  } else {
    try {
      guardRelativePath(gamesRoot, gameId);
      if (!fs.statSync(gameDir).isDirectory()) traversalIssues.push(`games/${gameId} is not a directory`);
    } catch (err) {
      traversalIssues.push(err.message);
    }
  }

  // 3. STATIC-MANIFEST-SCHEMA
  let manifest = null;
  const manifestIssues = [];
  try {
    const manifestPath = guardRelativePath(gameDir, 'game.manifest.json');
    manifest = readStrictJson(manifestPath, limits.maxJsonBytes ?? 1048576);
    manifestIssues.push(...validateManifestContract(manifest, gameId));
  } catch (err) {
    manifestIssues.push(`Cannot validate game.manifest.json: ${err.message}`);
  }
  checks.push(
    makeCheck(
      policy,
      'STATIC-MANIFEST-SCHEMA',
      manifestIssues.length ? 'fail' : 'pass',
      'Manifest contract validation',
      manifestIssues.length
        ? `${manifestIssues.length} manifest validation issue(s)`
        : `Manifest valid (v${manifest.version}, integration=${manifest.integration || 'native'})`,
      manifestIssues,
      manifest ? { id: manifest.id, version: manifest.version, integration: manifest.integration, capabilities: manifest.capabilities } : null
    )
  );

  // Walk Web/ tree for traversal, symlinks, and budgets
  const walk = walkWebTree(webDir, limits);
  for (const issue of walk.issues) {
    if (/symlink|collision|escape/i.test(issue)) traversalIssues.push(issue);
  }
  if (manifest?.entry && (/\\|\.\.|^\//.test(manifest.entry) || manifest.entry.includes(':'))) {
    traversalIssues.push(`Unsafe manifest.entry path: ${manifest.entry}`);
  }
  if (manifest?.media) {
    for (const mPath of [manifest.media.cover, ...(manifest.media.screenshots || [])].filter(Boolean)) {
      if (/^[a-z]+:|\\|\.\.|^\//i.test(mPath)) {
        traversalIssues.push(`Unsafe media path in manifest: ${mPath}`);
      }
    }
  }
  checks.push(
    makeCheck(
      policy,
      'STATIC-PATH-TRAVERSAL',
      traversalIssues.length ? 'fail' : 'pass',
      'Path isolation & symlink prohibition',
      traversalIssues.length
        ? traversalIssues[0]
        : 'No symlinks, path escapes, or case collisions in Web bundle',
      traversalIssues
    )
  );

  // 4. STATIC-BUDGET
  const budgetIssues = walk.issues.filter((i) => !/symlink|collision|escape/i.test(i));
  const maxScriptBytes = limits.maxScriptBytes ?? 8 * 1024 * 1024;
  for (const fileInfo of walk.files) {
    if ((fileInfo.ext === '.js' || fileInfo.ext === '.mjs' || fileInfo.ext === '.cjs') && fileInfo.size > maxScriptBytes) {
      budgetIssues.push(`Script file exceeds maxScriptBytes (${maxScriptBytes} bytes): ${fileInfo.relPosix} (${fileInfo.size} bytes)`);
    }
  }
  checks.push(
    makeCheck(
      policy,
      'STATIC-BUDGET',
      budgetIssues.length ? 'fail' : 'pass',
      'Bundle size & tree budget',
      budgetIssues.length
        ? budgetIssues[0]
        : `${walk.files.length} files, ${(walk.totalBytes / (1024 * 1024)).toFixed(2)} MiB total`,
      budgetIssues,
      { fileCount: walk.files.length, totalBytes: walk.totalBytes, maxScriptBytes }
    )
  );

  // 5. STATIC-ENTRY-EXISTS
  const entryRel = typeof manifest?.entry === 'string' && manifest.entry ? manifest.entry : 'index.html';
  let entryFullPath = null;
  const entryIssues = [];
  try {
    entryFullPath = guardRelativePath(webDir, entryRel);
    const stat = fs.statSync(entryFullPath);
    if (!stat.isFile() || stat.size === 0) entryIssues.push(`Entry file is empty or invalid: Web/${entryRel}`);
  } catch (err) {
    entryIssues.push(`Entry file missing or unsafe (Web/${entryRel}): ${err.message}`);
  }
  checks.push(
    makeCheck(
      policy,
      'STATIC-ENTRY-EXISTS',
      entryIssues.length ? 'fail' : 'pass',
      'Web entry HTML existence',
      entryIssues.length ? entryIssues[0] : `Web/${entryRel} present (${fs.existsSync(entryFullPath) ? fs.statSync(entryFullPath).size : 0} bytes)`,
      entryIssues
    )
  );

  // 6. STATIC-ASSET-REFS & 7. STATIC-FORBIDDEN-PATTERN
  const assetIssues = [];
  const forbiddenBlocks = [];
  const forbiddenWarns = [];
  const resolvedAssetSet = new Set();
  const parsedHtmlFiles = [];
  let checkedRefCount = 0;

  // Validate manifest media references
  if (manifest?.media && fs.existsSync(webDir)) {
    const mediaPaths = [manifest.media.cover, ...(manifest.media.screenshots || [])].filter((x) => typeof x === 'string');
    for (const mPath of mediaPaths) {
      checkedRefCount++;
      try {
        const resolved = guardRelativePath(webDir, mPath);
        checkImageSignature(resolved);
        resolvedAssetSet.add(mPath);
      } catch (err) {
        assetIssues.push(`manifest.media (${mPath}): ${err.message}`);
      }
    }
  }

  // Parse all HTML files under Web/
  const htmlFiles = walk.files.filter((f) => f.ext === '.html' || f.ext === '.htm');
  for (const fileInfo of htmlFiles) {
    if (fileInfo.size > (limits.maxHtmlBytes ?? 4 * 1024 * 1024)) {
      assetIssues.push(`${fileInfo.relPosix}: HTML file exceeds size limit (${fileInfo.size} bytes)`);
      continue;
    }
    const html = fs.readFileSync(fileInfo.fullPath, 'utf8').replace(/^\uFEFF/, '');
    const parsed = parseHtmlDocument(html);
    parsedHtmlFiles.push({ ...fileInfo, html, parsed });

    // Check forbidden tags/patterns
    for (const { tag, attrs } of parsed.tags) {
      if (tag === 'base') {
        forbiddenBlocks.push(`${fileInfo.relPosix}: <base> tag is forbidden in relative asset contracts`);
      } else if (tag === 'object' || tag === 'embed') {
        forbiddenBlocks.push(`${fileInfo.relPosix}: <${tag}> embed is forbidden`);
      } else if (tag === 'iframe') {
        const src = String(attrs.src || '');
        if (/^(?:https?:)?\/\//i.test(src) || /^javascript:/i.test(src)) {
          forbiddenBlocks.push(`${fileInfo.relPosix}: external/active <iframe> (${src}) is forbidden`);
        } else {
          forbiddenWarns.push(`${fileInfo.relPosix}: nested <iframe> (${src || 'inline'}) requires sandbox review`);
        }
      } else if (tag === 'meta' && String(attrs['http-equiv'] || '').toLowerCase() === 'refresh') {
        const content = String(attrs.content || '');
        const urlMatch = /url\s*=\s*(['"]?)([^'"\s;]+)\1/i.exec(content);
        const target = urlMatch ? urlMatch[2] : '';
        if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) {
          forbiddenBlocks.push(`${fileInfo.relPosix}: external or invalid <meta http-equiv="refresh"> (${content})`);
        } else {
          try {
            resolveWebAssetRef(target, fileInfo.relPosix, webDir);
            forbiddenWarns.push(`${fileInfo.relPosix}: local <meta http-equiv="refresh" content="${content}"> violates platform_check strict HTML rule; prefer direct entry`);
          } catch (err) {
            forbiddenBlocks.push(`${fileInfo.relPosix}: broken <meta refresh> target (${err.message})`);
          }
        }
      } else if (tag === 'script') {
        const stype = String(attrs.type || '').trim().toLowerCase();
        if ((stype === 'module' || stype === 'importmap') && manifest?.integration === 'legacy-localstorage') {
          forbiddenWarns.push(`${fileInfo.relPosix}: <script type="${stype}"> is incompatible with legacy-localstorage script adapter`);
        }
      }
    }

    // Check local asset references
    const refs = collectHtmlAssetRefs(parsed);
    for (const { ref, context } of refs) {
      checkedRefCount++;
      if (!ref) {
        assetIssues.push(`${fileInfo.relPosix} ${context}: empty reference`);
        continue;
      }
      if (/^data:/i.test(ref)) {
        if (
          ['img[src]', 'video[poster]', 'input[src]', 'link[href]'].includes(context) &&
          /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml)(?:;base64|,|%3C)/i.test(ref)
        ) {
          continue;
        }
        assetIssues.push(`${fileInfo.relPosix} ${context}: unsupported data URL`);
        continue;
      }
      if (/^(?:https?:)?\/\//i.test(ref)) {
        // External URL handling belongs to SEC-EXTERNAL-URL-ACTIVE
        continue;
      }
      try {
        const { relPosix } = resolveWebAssetRef(ref, fileInfo.relPosix, webDir);
        resolvedAssetSet.add(relPosix);
      } catch (err) {
        assetIssues.push(`${fileInfo.relPosix} ${context} (${ref}): ${err.message}`);
      }
    }
  }

  checks.push(
    makeCheck(
      policy,
      'STATIC-ASSET-REFS',
      assetIssues.length ? 'fail' : 'pass',
      'Static local asset resolution',
      assetIssues.length
        ? `${assetIssues.length} unresolved or invalid asset reference(s)`
        : `${checkedRefCount} asset reference(s) verified inside Web/`,
      assetIssues,
      { checkedRefs: checkedRefCount, resolvedAssets: [...resolvedAssetSet].sort() }
    )
  );

  const forbiddenStatus = forbiddenBlocks.length ? 'fail' : forbiddenWarns.length ? 'warn' : 'pass';
  const forbiddenSeverity = forbiddenBlocks.length ? 'block' : ruleSeverity(policy, 'STATIC-FORBIDDEN-PATTERN', 'major');
  const forbiddenDetails = [...forbiddenBlocks, ...forbiddenWarns];
  const forbiddenCheck = makeCheck(
    policy,
    'STATIC-FORBIDDEN-PATTERN',
    forbiddenStatus,
    'Forbidden HTML / packaging patterns',
    forbiddenBlocks.length
      ? forbiddenBlocks[0]
      : forbiddenWarns.length
        ? forbiddenWarns[0]
        : 'No forbidden HTML/script patterns found',
    forbiddenDetails,
    null,
    forbiddenSeverity
  );
  forbiddenCheck.severity = forbiddenSeverity;
  checks.push(forbiddenCheck);

  return {
    suite: 'static',
    tier: 0,
    checks,
    context: {
      gameDir,
      webDir,
      manifest,
      catalogEntry,
      files: walk.files,
      totalBytes: walk.totalBytes,
      walkIssues: walk.issues,
      parsedHtmlFiles,
      resolvedAssets: [...resolvedAssetSet].sort(),
    },
  };
}
