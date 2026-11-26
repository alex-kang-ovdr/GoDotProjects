#!/usr/bin/env node
/**
 * FTL: Faster Than Light — Complete Zero-Missing Sprite & Icon Asset Extractor
 *
 * Extracts ALL PNG sprite and icon assets (2,837 files) from C:\Temp\FTL\ftl.dat.vanilla
 * into forge/Templates/ftl/Saved/extracted_assets/ (gitignored) with PNG signature
 * verification and a categorized asset-manifest.json report.
 *
 * Usage:
 *   node forge/Templates/ftl/tools/extract-ftl-assets.mjs
 *   node forge/Templates/ftl/tools/extract-ftl-assets.mjs --all   (extracts all 3,219 entries including XML/OGG/WAV)
 *   node forge/Templates/ftl/tools/extract-ftl-assets.mjs --out "C:\Temp\FTL\extracted"
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FtlPkgReader } from './serve-ftl-web.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const extractAll = args.includes('--all');
const outIdx = args.indexOf('--out');
const outDir = outIdx >= 0 && args[outIdx + 1]
  ? path.resolve(args[outIdx + 1])
  : path.join(projectDir, 'Saved', 'extracted_assets');

const datIdx = args.indexOf('--dat');
const datPath = datIdx >= 0 && args[datIdx + 1]
  ? path.resolve(args[datIdx + 1])
  : (process.env.FTL_DAT_PATH || 'C:/Temp/FTL/ftl.dat.vanilla');

if (!fs.existsSync(datPath)) {
  console.error(`[ftl-extract] Archive not found: ${datPath}`);
  process.exit(1);
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const reader = new FtlPkgReader(datPath);
const allKeys = [...reader.entries.keys()];
const targetKeys = extractAll
  ? allKeys
  : allKeys.filter((k) => k.toLowerCase().endsWith('.png'));

fs.mkdirSync(outDir, { recursive: true });
// Prevent Godot Editor from scanning/importing thousands of extracted PNGs if outDir is inside a Godot project
fs.writeFileSync(path.join(outDir, '.gdignore'), '', 'utf8');

let extracted = 0;
let invalidPng = 0;
let totalBytes = 0;
const categories = {};
const missing = [];

for (const key of targetKeys) {
  const buf = reader.readEntry(key);
  if (!buf || buf.length === 0) {
    missing.push(key);
    continue;
  }
  if (key.toLowerCase().endsWith('.png')) {
    if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIG)) {
      invalidPng += 1;
      missing.push(`${key} (invalid PNG header)`);
      continue;
    }
  }
  const dest = path.join(outDir, ...key.split('/'));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  extracted += 1;
  totalBytes += buf.length;

  const parts = key.split('/');
  const cat = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
  categories[cat] = (categories[cat] || 0) + 1;
}

reader.close();

const manifest = {
  sourceArchive: datPath,
  outputDir: outDir,
  mode: extractAll ? 'all' : 'sprites_and_icons_png',
  archiveTotalEntries: allKeys.length,
  targetCount: targetKeys.length,
  extractedCount: extracted,
  missingCount: missing.length,
  invalidPngCount: invalidPng,
  totalBytes,
  categories,
  missing,
  generatedAt: new Date().toISOString(),
};

const manifestPath = path.join(outDir, 'asset-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

console.log(
  `[ftl-extract] Extracted ${extracted}/${targetKeys.length} assets (${(totalBytes / (1024 * 1024)).toFixed(2)} MiB) -> ${outDir}`
);
console.log(`[ftl-extract] Missing: ${missing.length}, Invalid PNG: ${invalidPng}, Manifest: ${manifestPath}`);
if (missing.length > 0 || extracted !== targetKeys.length) {
  process.exit(1);
}
