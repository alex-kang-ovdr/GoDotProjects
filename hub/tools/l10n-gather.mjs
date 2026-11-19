import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, TARGET_LOCALES, gatherPlatformTexts, parseLegacyPlatformDictionaries } from '../server/l10n-engine.mjs';

const hubRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generateBundle = process.argv.includes('--generate-bundle');

const gathered = gatherPlatformTexts(hubRoot);
const legacy = parseLegacyPlatformDictionaries(hubRoot);

if (generateBundle) {
  const keys = {};
  const meta = {};
  const usedSources = new Set();

  // 1. Gathered explicit LOCTEXT keys first, hydrated with existing 8-language translations when source matches
  for (const entry of gathered.entries) {
    const row = { ko: entry.sourceText };
    const prev = legacy[entry.sourceText];
    if (prev) {
      usedSources.add(entry.sourceText);
      for (const loc of TARGET_LOCALES) {
        if (typeof prev[loc] === 'string' && prev[loc]) row[loc] = prev[loc];
      }
    }
    keys[entry.key] = row;
    meta[entry.key] = {
      contextId: entry.contextId,
      description: '',
      maxChars: entry.maxChars,
      codeRefs: entry.codeRefs
    };
  }

  // 2. Migrate all remaining legacy platform/community dictionary entries into deterministic LOCTEXT keys
  let platformIdx = 0;
  let communityIdx = 0;
  for (const [source, row] of Object.entries(legacy)) {
    if (usedSources.has(source)) continue;
    const isCommunity = row._file === 'community.js';
    const key = isCommunity
      ? `community.legacy.k${String(++communityIdx).padStart(4, '0')}`
      : `platform.legacy.k${String(++platformIdx).padStart(4, '0')}`;
    const copy = { ko: source };
    for (const loc of TARGET_LOCALES) {
      if (typeof row[loc] === 'string' && row[loc]) copy[loc] = row[loc];
    }
    keys[key] = copy;
    meta[key] = { contextId: 'general', description: '', maxChars: null, codeRefs: [] };
  }

  const bundle = {
    schemaVersion: 1,
    tag: 'l10n-v1-seed',
    generatedAt: new Date().toISOString(),
    locales: LOCALES,
    keys,
    meta,
    media: {}
  };
  const outPath = path.join(hubRoot, 'shared', 'locales', 'l10n-bundle.json');
  fs.writeFileSync(outPath, JSON.stringify(bundle, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({
    ok: true,
    output: outPath,
    explicitKeys: gathered.entries.length,
    totalKeys: Object.keys(keys).length,
    conflicts: gathered.conflicts.length
  }, null, 2));
} else {
  console.log(JSON.stringify({
    ok: gathered.conflicts.length === 0,
    scannedFiles: gathered.scannedFiles,
    gatheredKeys: gathered.entries.length,
    conflicts: gathered.conflicts
  }, null, 2));
  if (gathered.conflicts.length) process.exitCode = 1;
}
