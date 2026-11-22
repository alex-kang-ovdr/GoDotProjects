#!/usr/bin/env node
/**
 * N3 AdGame Playable Demo Bundle Validator (Pure Node 24 ESM, zero external deps).
 * Checks raw/gzip size budgets, top file culprits, forbidden external http(s)://
 * network calls, and PlayHubDemo postMessage hook presence.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2,097,152 bytes (2 MiB)
export const DEFAULT_MAX_GZIP_BYTES = Math.floor(1.5 * 1024 * 1024); // 1,572,864 bytes (1.5 MiB)

const SKIP_DIRS = new Set(['.git', 'node_modules', '.DS_Store']);
const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.css', '.json', '.svg']);
const CODE_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.css']);

const EXTERNAL_NETWORK_PATTERNS = [
  { kind: 'external_script', regex: /<script\b[^>]*\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/gi },
  { kind: 'external_link', regex: /<link\b(?![^>]*\brel\s*=\s*["']canonical["'])[^>]*\bhref\s*=\s*["'](https?:\/\/[^"']+)["']/gi },
  { kind: 'external_fetch', regex: /\bfetch\s*\(\s*["'`](https?:\/\/[^"'`]+)["'`]/gi },
  { kind: 'external_xhr', regex: /\.open\s*\(\s*["'][A-Za-z]+["']\s*,\s*["'`](https?:\/\/[^"'`]+)["'`]/gi },
  { kind: 'external_dynamic_import', regex: /\bimport\s*\(\s*["'`](https?:\/\/[^"'`]+)["'`]\s*\)/gi },
  { kind: 'external_esm_import', regex: /\bimport\b[^;\n]*\bfrom\s*["'](https?:\/\/[^"']+)["']/gi },
  { kind: 'external_websocket', regex: /\bnew\s+WebSocket\s*\(\s*["'`](wss?:\/\/[^"'`]+)["'`]/gi },
  { kind: 'external_beacon', regex: /\bnavigator\.sendBeacon\s*\(\s*["'`](https?:\/\/[^"'`]+)["'`]/gi },
  { kind: 'external_css_import', regex: /@import\s+(?:url\s*\(\s*)?["']?(https?:\/\/[^"'\s)]+)["']?\)?/gi }
];

function toPosix(rel) {
  return rel.split(path.sep).join('/');
}

function classifyFile(relPath) {
  const lower = relPath.toLowerCase();
  if (/(^|\/)[^/]+-offline\.html?$/.test(lower)) return 'duplicate_offline_html';
  if (lower.endsWith('playhub-dictionary.js')) return 'l10n_dictionary';
  if (lower.startsWith('vendor/') && lower.endsWith('.js')) return 'vendor_js';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'script';
  if (lower.endsWith('.css')) return 'style';
  if (/\.(png|jpe?g|webp|gif|svg|ico|avif)$/.test(lower)) return 'image';
  if (/\.(wasm|pck|data)$/.test(lower)) return 'binary_engine';
  if (/\.(mp3|ogg|wav|m4a|webm|mp4)$/.test(lower)) return 'media';
  return 'other';
}

function walkFiles(rootDir) {
  const files = [];
  function visit(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  visit(rootDir);
  return files;
}

function stripCommentsForScan(content, ext) {
  if (ext === '.html' || ext === '.htm') {
    return content.replace(/<!--[\s\S]*?-->/g, '');
  }
  // Remove block comments only; preserve strings containing http(s):// in fetch()/script tags.
  return content.replace(/\/\*[\s\S]*?\*\//g, '');
}

function scanExternalNetwork(relPath, content, ext) {
  const cleaned = stripCommentsForScan(content, ext);
  const violations = [];
  const seen = new Set();
  for (const { kind, regex } of EXTERNAL_NETWORK_PATTERNS) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(cleaned)) !== null) {
      const url = match[1];
      const key = `${kind}:${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({ file: relPath, kind, url });
    }
  }
  return violations;
}

function detectPlayHubDemoHook(relPath, content) {
  const hasPlayHubDemo = /\bPlayHubDemo\b/.test(content);
  const hasSdkScript = /playhub-demo-sdk\.js/i.test(content);
  const hasChannel = /playhub:adgame:v1/.test(content);
  const hasPostMessage = /\bpostMessage\s*\(/.test(content);
  const hasHookCall = /\bPlayHubDemo\s*\.\s*(ready|reportProgress|milestone|completeDemo|requestInstall)\b/.test(content);
  const present = hasSdkScript || (hasPlayHubDemo && (hasPostMessage || hasChannel || hasHookCall));
  return {
    present,
    hasPostMessageBridge: hasSdkScript || (hasPlayHubDemo && hasPostMessage) || (hasChannel && hasPostMessage),
    file: present ? relPath : null
  };
}

export function validateDemoBundle(dirPath, options = {}) {
  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : DEFAULT_MAX_BYTES;
  const maxGzipBytes = Number.isFinite(options.maxGzipBytes) ? options.maxGzipBytes : DEFAULT_MAX_GZIP_BYTES;
  const topCulpritsCount = Number.isInteger(options.topCulpritsCount) && options.topCulpritsCount > 0 ? options.topCulpritsCount : 10;
  const requireDemoSdk = options.requireDemoSdk === true;

  const resolvedDir = path.resolve(dirPath);
  if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
    throw new Error(`Demo bundle directory does not exist: ${resolvedDir}`);
  }

  const allPaths = walkFiles(resolvedDir);
  const files = [];
  const externalViolations = [];
  const demoSdkMatches = [];
  let hasPostMessageBridge = false;
  let totalRawBytes = 0;
  let totalGzipBytes = 0;
  let hasIndexHtml = false;

  for (const fullPath of allPaths) {
    const relPath = toPosix(path.relative(resolvedDir, fullPath));
    const ext = path.extname(relPath).toLowerCase();
    const buf = fs.readFileSync(fullPath);
    const rawBytes = buf.length;
    const gzipBytes = zlib.gzipSync(buf, { level: 9 }).length;
    totalRawBytes += rawBytes;
    totalGzipBytes += gzipBytes;
    if (relPath === 'index.html') hasIndexHtml = true;

    const category = classifyFile(relPath);
    files.push({ path: relPath, rawBytes, gzipBytes, ext, category });

    if (CODE_EXTENSIONS.has(ext) && TEXT_EXTENSIONS.has(ext)) {
      const text = buf.toString('utf8');
      const found = scanExternalNetwork(relPath, text, ext);
      for (const v of found) externalViolations.push(v);

      const sdk = detectPlayHubDemoHook(relPath, text);
      if (sdk.present) {
        demoSdkMatches.push(relPath);
        if (sdk.hasPostMessageBridge) hasPostMessageBridge = true;
      }
    }
  }

  const topCulprits = [...files]
    .sort((a, b) => b.rawBytes - a.rawBytes || a.path.localeCompare(b.path))
    .slice(0, topCulpritsCount)
    .map(f => ({
      path: f.path,
      rawBytes: f.rawBytes,
      gzipBytes: f.gzipBytes,
      sharePct: totalRawBytes > 0 ? Number(((f.rawBytes / totalRawBytes) * 100).toFixed(2)) : 0,
      category: f.category
    }));

  const demoSdkPresent = demoSdkMatches.length > 0;
  const checks = {
    entryHtml: {
      pass: hasIndexHtml,
      entry: hasIndexHtml ? 'index.html' : null
    },
    rawSize: {
      pass: totalRawBytes <= maxBytes,
      actualBytes: totalRawBytes,
      limitBytes: maxBytes,
      overByBytes: Math.max(0, totalRawBytes - maxBytes)
    },
    gzipSize: {
      pass: totalGzipBytes <= maxGzipBytes,
      actualBytes: totalGzipBytes,
      limitBytes: maxGzipBytes,
      overByBytes: Math.max(0, totalGzipBytes - maxGzipBytes)
    },
    noExternalNetwork: {
      pass: externalViolations.length === 0,
      count: externalViolations.length,
      violations: externalViolations
    },
    demoSdkHook: {
      pass: requireDemoSdk ? demoSdkPresent : true,
      present: demoSdkPresent,
      hasPostMessageBridge,
      required: requireDemoSdk,
      matchedFiles: demoSdkMatches
    }
  };

  const failures = [];
  const warnings = [];
  if (!checks.entryHtml.pass) failures.push('ENTRY_HTML_MISSING: index.html not found in bundle root.');
  if (!checks.rawSize.pass) {
    failures.push(`RAW_SIZE_EXCEEDED: ${totalRawBytes} bytes > limit ${maxBytes} bytes (+${checks.rawSize.overByBytes} bytes).`);
  }
  if (!checks.gzipSize.pass) {
    failures.push(`GZIP_SIZE_EXCEEDED: ${totalGzipBytes} bytes > limit ${maxGzipBytes} bytes (+${checks.gzipSize.overByBytes} bytes).`);
  }
  if (!checks.noExternalNetwork.pass) {
    failures.push(`EXTERNAL_NETWORK_FORBIDDEN: ${externalViolations.length} external http(s):// call(s) detected.`);
  }
  if (!demoSdkPresent) {
    if (requireDemoSdk) {
      failures.push('DEMO_SDK_HOOK_MISSING: PlayHubDemo postMessage hook not detected.');
    } else {
      warnings.push('DEMO_SDK_HOOK_MISSING: PlayHubDemo postMessage hook not detected (inject via distill-demo-bundle.mjs).');
    }
  }

  const pass = failures.length === 0;
  return {
    ok: pass,
    pass,
    dirPath: resolvedDir,
    fileCount: files.length,
    totalRawBytes,
    totalGzipBytes,
    limits: { maxBytes, maxGzipBytes },
    checks,
    failures,
    warnings,
    topCulprits,
    files
  };
}

function parseCliArgs(argv) {
  const opts = { dirPath: null, json: false, requireDemoSdk: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--require-sdk') opts.requireDemoSdk = true;
    else if (a === '--max-bytes') opts.maxBytes = Number(argv[++i]);
    else if (a === '--max-gzip-bytes') opts.maxGzipBytes = Number(argv[++i]);
    else if (!a.startsWith('-') && !opts.dirPath) opts.dirPath = a;
  }
  return opts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.dirPath) {
    console.error('Usage: node tools/adgame/validate-demo-bundle.mjs <bundleDir> [--max-bytes N] [--max-gzip-bytes N] [--require-sdk] [--json]');
    process.exit(2);
  }
  const report = validateDemoBundle(args.dirPath, args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const kb = b => `${(b / 1024).toFixed(1)} KB`;
    console.log(`[validate-demo-bundle] ${report.pass ? 'PASS' : 'FAIL'} · ${report.dirPath}`);
    console.log(`  Files: ${report.fileCount} · Raw: ${kb(report.totalRawBytes)} / ${kb(report.limits.maxBytes)} · Gzip: ${kb(report.totalGzipBytes)} / ${kb(report.limits.maxGzipBytes)}`);
    console.log(`  External requests: ${report.checks.noExternalNetwork.count} · PlayHubDemo hook: ${report.checks.demoSdkHook.present ? 'present' : 'missing'}`);
    for (const f of report.failures) console.log(`  FAIL: ${f}`);
    for (const w of report.warnings) console.log(`  WARN: ${w}`);
    console.log('  Top culprits:');
    for (const c of report.topCulprits.slice(0, 5)) {
      console.log(`    - ${c.path}: ${kb(c.rawBytes)} raw / ${kb(c.gzipBytes)} gzip (${c.sharePct}%, ${c.category})`);
    }
  }
  process.exit(report.pass ? 0 : 1);
}
