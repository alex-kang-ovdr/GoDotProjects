#!/usr/bin/env node
/**
 * N3 AdGame Playable Demo Bundle Distiller (Pure Node 24 ESM, zero external deps).
 * Analyzes deterministic size savings (duplicate *-offline.html, oversized
 * playhub-dictionary.js, unminified vendor JS, unreferenced duplicate artifacts)
 * and writes a distilled demo copy when dryRun: false.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDemoBundle, DEFAULT_MAX_BYTES, DEFAULT_MAX_GZIP_BYTES } from './validate-demo-bundle.mjs';

const OVERSIZED_DICTIONARY_BYTES = 32 * 1024;
const UNMINIFIED_JS_MIN_BYTES = 32 * 1024;

export const INLINE_DEMO_SDK_SNIPPET = `<script data-playhub-demo-sdk="1">
(()=>{if(window.PlayHubDemo)return;const CH='playhub:adgame:v1';const send=(type,payload={})=>{try{if(window.parent&&window.parent!==window){window.parent.postMessage({channel:CH,type,payload,ts:Date.now()},'*');}}catch{}};window.PlayHubDemo={version:'1.0.0',ready(i={}){send('ready',i);},reportProgress({score=0,stage=1,elapsedMs=0,meta={}}={}){send('progress',{score,stage,elapsedMs,meta});},milestone(name,data={}){send('milestone',{name,...data});},completeDemo({score=0,stage=1,reason='stage_clear',carryOver={}}={}){send('complete',{score,stage,reason,carryOver});},requestInstall(ctx={}){send('request_install',ctx);}};addEventListener('load',()=>window.PlayHubDemo.ready({distilled:true}),{once:true});})();
</script>`;

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function resolveRelativeAsset(fromRel, ref) {
  if (!ref || /^(?:https?:|data:|blob:|mailto:|javascript:|#)/i.test(ref)) return null;
  const clean = ref.split(/[?#]/)[0].trim();
  if (!clean || clean.startsWith('/')) return null;
  const baseDir = path.posix.dirname(fromRel);
  const joined = baseDir === '.' ? clean : path.posix.join(baseDir, clean);
  return path.posix.normalize(joined).replace(/^\.\//, '');
}

function collectReachableFiles(rootDir, fileMap) {
  if (!fileMap.has('index.html')) return new Set(fileMap.keys());
  const visited = new Set(['index.html']);
  const queue = ['index.html'];

  const refPatterns = [
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
    /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi,
    /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi,
    /\bimport\s+[^;\n]*?\bfrom\s*["']([^"']+)["']/gi,
    /\bexport\s+[^;\n]*?\bfrom\s*["']([^"']+)["']/gi,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gi,
    /\burl\(\s*["']?([^"')]+)["']?\s*\)/gi
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    const ext = path.extname(current).toLowerCase();
    if (!['.html', '.htm', '.js', '.mjs', '.cjs', '.css'].includes(ext)) continue;
    const text = fs.readFileSync(path.join(rootDir, current), 'utf8');

    for (const pattern of refPatterns) {
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(text)) !== null) {
        const resolved = resolveRelativeAsset(current, m[1]);
        if (resolved && fileMap.has(resolved) && !visited.has(resolved)) {
          visited.add(resolved);
          queue.push(resolved);
        }
      }
    }

    // Also keep any file whose relative path appears literally in quotes inside reachable code
    for (const candidate of fileMap.keys()) {
      if (visited.has(candidate)) continue;
      if (/(^|\/)[^/]+-offline\.html?$/i.test(candidate)) continue;
      if (text.includes(`"${candidate}"`) || text.includes(`'${candidate}'`)) {
        visited.add(candidate);
        queue.push(candidate);
      }
    }
  }
  return visited;
}

function isUnminifiedJs(content) {
  const lines = content.split(/\r?\n/);
  if (lines.length < 40) return false;
  const avgLineLen = content.length / lines.length;
  const hasBlockComments = /\/\*[\s\S]{30,}?\*\//.test(content);
  const indentedLines = lines.filter(l => /^\s{2,}/.test(l)).length;
  return avgLineLen < 140 || (indentedLines / lines.length) > 0.25 || hasBlockComments;
}

/**
 * Deterministic, syntax-safe JS minifier (strips block comments, full-line comments,
 * leading indentation, and blank lines without corrupting string/regex literals).
 */
export function safeMinifyJs(source) {
  let out = '';
  let i = 0;
  const len = source.length;
  let state = 'code'; // code | single | double | template | lineComment | blockComment
  let lineStart = true;

  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === 'lineComment') {
      if (ch === '\n') {
        out += '\n';
        state = 'code';
        lineStart = true;
      }
      i++;
      continue;
    }
    if (state === 'blockComment') {
      if (ch === '*' && next === '/') {
        state = 'code';
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (state === 'single' || state === 'double' || state === 'template') {
      out += ch;
      if (ch === '\\' && i + 1 < len) {
        out += next;
        i += 2;
        continue;
      }
      if ((state === 'single' && ch === "'") || (state === 'double' && ch === '"') || (state === 'template' && ch === '`')) {
        state = 'code';
      }
      i++;
      continue;
    }

    // state === 'code'
    if (ch === '/' && next === '*') {
      state = 'blockComment';
      i += 2;
      continue;
    }
    if (lineStart && ch === '/' && next === '/') {
      state = 'lineComment';
      i += 2;
      continue;
    }
    if (ch === "'") { state = 'single'; lineStart = false; out += ch; i++; continue; }
    if (ch === '"') { state = 'double'; lineStart = false; out += ch; i++; continue; }
    if (ch === '`') { state = 'template'; lineStart = false; out += ch; i++; continue; }

    if (lineStart && (ch === ' ' || ch === '\t')) {
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      if (!lineStart) {
        out += '\n';
        lineStart = true;
      }
      i++;
      continue;
    }

    lineStart = false;
    out += ch;
    i++;
  }
  return out.trim() + '\n';
}

/**
 * Deterministic dictionary pruner for vendor/playhub-dictionary.js:
 * Keeps only dictionary keys referenced in reachable game text, keeping ko/en.
 */
export function prunePlayHubDictionary(dictSource, corpusText) {
  const entryRegex = /'((?:\\'|[^'])+)'\s*:\s*\{([^}]*)\}/g;
  const keptEntries = [];
  let match;
  let totalKeys = 0;

  while ((match = entryRegex.exec(dictSource)) !== null) {
    totalKeys++;
    const key = match[1];
    const body = match[2];
    const unescaped = key.replace(/\\'/g, "'");
    if (unescaped.length >= 2 && corpusText.includes(unescaped)) {
      const enMatch = body.match(/\ben\s*:\s*('(?:\\'|[^'])*'|"(?:\\"|[^"])*")/);
      if (enMatch) {
        keptEntries.push(`'${key}':{en:${enMatch[1]}}`);
      }
    }
  }

  const pruned = `(function(root){'use strict';if(!root.PlayHubLocale)return;root.PlayHubLocale.register({${keptEntries.join(',')}});})(typeof window!=='undefined'?window:globalThis);\n`;
  return {
    prunedSource: pruned,
    totalKeys,
    keptKeys: keptEntries.length,
    beforeBytes: Buffer.byteLength(dictSource, 'utf8'),
    afterBytes: Buffer.byteLength(pruned, 'utf8')
  };
}

function injectDemoSdkIntoHtml(html) {
  if (/\bPlayHubDemo\b/.test(html) || /playhub-demo-sdk\.js/i.test(html)) {
    return { html, injected: false };
  }
  if (/<\/head>/i.test(html)) {
    return { html: html.replace(/<\/head>/i, `${INLINE_DEMO_SDK_SNIPPET}\n</head>`), injected: true };
  }
  if (/<\/body>/i.test(html)) {
    return { html: html.replace(/<\/body>/i, `${INLINE_DEMO_SDK_SNIPPET}\n</body>`), injected: true };
  }
  return { html: `${html}\n${INLINE_DEMO_SDK_SNIPPET}\n`, injected: true };
}

export function analyzeDistillationPlan(dirPath, options = {}) {
  const validation = validateDemoBundle(dirPath, options);
  const resolvedDir = validation.dirPath;
  const fileMap = new Map(validation.files.map(f => [f.path, f]));
  const reachable = collectReachableFiles(resolvedDir, fileMap);

  // Build corpus from reachable non-dictionary HTML/JS files for dictionary pruning
  let corpusText = '';
  for (const rel of reachable) {
    if (rel.toLowerCase().endsWith('playhub-dictionary.js')) continue;
    const ext = path.extname(rel).toLowerCase();
    if (['.html', '.htm', '.js', '.mjs', '.cjs'].includes(ext)) {
      corpusText += '\n' + fs.readFileSync(path.join(resolvedDir, rel), 'utf8');
    }
  }

  const actions = [];
  let estimatedSavedBytes = 0;

  for (const file of validation.files) {
    const rel = file.path;
    const lower = rel.toLowerCase();
    const fullPath = path.join(resolvedDir, rel);

    // 1. Duplicate *-offline.html
    if (/(^|\/)[^/]+-offline\.html?$/.test(lower) && fileMap.has('index.html')) {
      actions.push({
        type: 'remove_duplicate_offline_html',
        file: rel,
        beforeBytes: file.rawBytes,
        afterBytes: 0,
        savedBytes: file.rawBytes,
        reason: 'Duplicate offline HTML mirror alongside index.html'
      });
      estimatedSavedBytes += file.rawBytes;
      continue;
    }

    // 2. Oversized playhub-dictionary.js
    if (lower.endsWith('playhub-dictionary.js') && file.rawBytes > OVERSIZED_DICTIONARY_BYTES) {
      const src = fs.readFileSync(fullPath, 'utf8');
      const pruned = prunePlayHubDictionary(src, corpusText);
      const saved = Math.max(0, file.rawBytes - pruned.afterBytes);
      actions.push({
        type: 'prune_dictionary',
        file: rel,
        beforeBytes: file.rawBytes,
        afterBytes: pruned.afterBytes,
        savedBytes: saved,
        meta: { totalKeys: pruned.totalKeys, keptKeys: pruned.keptKeys },
        reason: `Prune unused L10N keys (${pruned.totalKeys} -> ${pruned.keptKeys} keys, ko/en demo subset)`
      });
      estimatedSavedBytes += saved;
      continue;
    }

    // 3. Unminified vendor JS (either unreferenced or minified in place)
    if (lower.startsWith('vendor/') && lower.endsWith('.js') && !lower.endsWith('playhub-locale.js')) {
      const src = fs.readFileSync(fullPath, 'utf8');
      const unminified = file.rawBytes >= UNMINIFIED_JS_MIN_BYTES && isUnminifiedJs(src);
      if (!reachable.has(rel)) {
        actions.push({
          type: 'prune_unreferenced_vendor_js',
          file: rel,
          beforeBytes: file.rawBytes,
          afterBytes: 0,
          savedBytes: file.rawBytes,
          meta: { unminified },
          reason: unminified
            ? 'Unminified vendor JS not referenced by self-contained index.html'
            : 'Vendor JS not referenced by self-contained index.html'
        });
        estimatedSavedBytes += file.rawBytes;
        continue;
      }
      if (unminified) {
        const minified = safeMinifyJs(src);
        const afterBytes = Buffer.byteLength(minified, 'utf8');
        const saved = Math.max(0, file.rawBytes - afterBytes);
        if (saved > 0) {
          actions.push({
            type: 'minify_vendor_js',
            file: rel,
            beforeBytes: file.rawBytes,
            afterBytes,
            savedBytes: saved,
            reason: 'Strip comments and whitespace from unminified vendor JS'
          });
          estimatedSavedBytes += saved;
        }
        continue;
      }
    }

    // 4. Unreferenced duplicate source JS/CSS/assets when index.html is self-contained
    if (!reachable.has(rel)) {
      actions.push({
        type: 'prune_unreferenced_file',
        file: rel,
        beforeBytes: file.rawBytes,
        afterBytes: 0,
        savedBytes: file.rawBytes,
        reason: `Not referenced from index.html (${file.category})`
      });
      estimatedSavedBytes += file.rawBytes;
      continue;
    }

    // 5. Large reachable unminified JS (non-vendor)
    if ((lower.endsWith('.js') || lower.endsWith('.mjs')) && file.rawBytes >= UNMINIFIED_JS_MIN_BYTES && !lower.endsWith('playhub-locale.js')) {
      const src = fs.readFileSync(fullPath, 'utf8');
      if (isUnminifiedJs(src)) {
        const minified = safeMinifyJs(src);
        const afterBytes = Buffer.byteLength(minified, 'utf8');
        const saved = Math.max(0, file.rawBytes - afterBytes);
        if (saved > 1024) {
          actions.push({
            type: 'minify_script_js',
            file: rel,
            beforeBytes: file.rawBytes,
            afterBytes,
            savedBytes: saved,
            reason: 'Strip comments and indentation from unminified script'
          });
          estimatedSavedBytes += saved;
        }
      }
    }
  }

  // 6. Demo SDK hook injection
  const sdkHookBytes = Buffer.byteLength(INLINE_DEMO_SDK_SNIPPET + '\n', 'utf8');
  if (!validation.checks.demoSdkHook.present && fileMap.has('index.html')) {
    actions.push({
      type: 'inject_demo_sdk_hook',
      file: 'index.html',
      beforeBytes: 0,
      afterBytes: sdkHookBytes,
      savedBytes: -sdkHookBytes,
      reason: 'Inject lightweight PlayHubDemo postMessage bridge for AdGame telemetry'
    });
    estimatedSavedBytes -= sdkHookBytes;
  }

  const beforeRawBytes = validation.totalRawBytes;
  const estimatedAfterRawBytes = Math.max(0, beforeRawBytes - estimatedSavedBytes);
  const estimatedSavingsPct = beforeRawBytes > 0 ? Number(((estimatedSavedBytes / beforeRawBytes) * 100).toFixed(2)) : 0;

  return {
    dirPath: resolvedDir,
    beforeRawBytes,
    beforeGzipBytes: validation.totalGzipBytes,
    estimatedAfterRawBytes,
    estimatedSavedBytes,
    estimatedSavingsPct,
    reachableCount: reachable.size,
    totalFileCount: validation.fileCount,
    actions,
    validation
  };
}

export function distillDemoBundle(srcDir, outDir, options = {}) {
  const dryRun = options.dryRun !== false;
  const injectDemoSdk = options.injectDemoSdk !== false;
  const maxBytes = Number.isFinite(options.maxBytes) ? options.maxBytes : DEFAULT_MAX_BYTES;
  const maxGzipBytes = Number.isFinite(options.maxGzipBytes) ? options.maxGzipBytes : DEFAULT_MAX_GZIP_BYTES;

  const plan = analyzeDistillationPlan(srcDir, { maxBytes, maxGzipBytes });
  if (dryRun) {
    return {
      dryRun: true,
      srcDir: plan.dirPath,
      outDir: outDir ? path.resolve(outDir) : null,
      beforeRawBytes: plan.beforeRawBytes,
      beforeGzipBytes: plan.beforeGzipBytes,
      estimatedAfterRawBytes: plan.estimatedAfterRawBytes,
      estimatedSavedBytes: plan.estimatedSavedBytes,
      estimatedSavingsPct: plan.estimatedSavingsPct,
      actions: plan.actions,
      plan
    };
  }

  if (!outDir) {
    throw new Error('outDir is required when dryRun is false');
  }
  const resolvedOut = path.resolve(outDir);
  if (resolvedOut.toLowerCase() === plan.dirPath.toLowerCase()) {
    throw new Error('outDir must be different from srcDir to preserve original game files');
  }

  fs.rmSync(resolvedOut, { recursive: true, force: true });
  fs.mkdirSync(resolvedOut, { recursive: true });

  const actionByFile = new Map();
  for (const act of plan.actions) {
    if (!actionByFile.has(act.file)) actionByFile.set(act.file, []);
    actionByFile.get(act.file).push(act);
  }

  // Build corpus from kept HTML/JS files for dictionary pruning
  let corpusText = '';
  for (const file of plan.validation.files) {
    const acts = actionByFile.get(file.path) || [];
    if (acts.some(a => a.type.startsWith('remove_') || a.type.startsWith('prune_unreferenced'))) continue;
    if (file.path.toLowerCase().endsWith('playhub-dictionary.js')) continue;
    if (['.html', '.htm', '.js', '.mjs', '.cjs'].includes(file.ext)) {
      corpusText += '\n' + fs.readFileSync(path.join(plan.dirPath, file.path), 'utf8');
    }
  }

  const actionsApplied = [];
  for (const file of plan.validation.files) {
    const rel = file.path;
    const acts = actionByFile.get(rel) || [];
    const dropAction = acts.find(a =>
      a.type === 'remove_duplicate_offline_html' ||
      a.type === 'prune_unreferenced_vendor_js' ||
      a.type === 'prune_unreferenced_file'
    );
    if (dropAction) {
      actionsApplied.push(dropAction);
      continue;
    }

    const srcFile = path.join(plan.dirPath, rel);
    const dstFile = path.join(resolvedOut, rel);
    fs.mkdirSync(path.dirname(dstFile), { recursive: true });

    const pruneDictAction = acts.find(a => a.type === 'prune_dictionary');
    if (pruneDictAction) {
      const src = fs.readFileSync(srcFile, 'utf8');
      const { prunedSource } = prunePlayHubDictionary(src, corpusText);
      fs.writeFileSync(dstFile, prunedSource, 'utf8');
      actionsApplied.push(pruneDictAction);
      continue;
    }

    const minifyAction = acts.find(a => a.type === 'minify_vendor_js' || a.type === 'minify_script_js');
    if (minifyAction) {
      const src = fs.readFileSync(srcFile, 'utf8');
      fs.writeFileSync(dstFile, safeMinifyJs(src), 'utf8');
      actionsApplied.push(minifyAction);
      continue;
    }

    if (rel === 'index.html' && injectDemoSdk) {
      const src = fs.readFileSync(srcFile, 'utf8');
      const { html, injected } = injectDemoSdkIntoHtml(src);
      fs.writeFileSync(dstFile, html, 'utf8');
      if (injected) {
        const sdkAction = acts.find(a => a.type === 'inject_demo_sdk_hook');
        if (sdkAction) actionsApplied.push(sdkAction);
      }
      continue;
    }

    fs.copyFileSync(srcFile, dstFile);
  }

  const validationAfter = validateDemoBundle(resolvedOut, {
    maxBytes,
    maxGzipBytes,
    requireDemoSdk: injectDemoSdk
  });
  const afterRawBytes = validationAfter.totalRawBytes;
  const afterGzipBytes = validationAfter.totalGzipBytes;
  const actualSavedBytes = plan.beforeRawBytes - afterRawBytes;
  const savingsPct = plan.beforeRawBytes > 0 ? Number(((actualSavedBytes / plan.beforeRawBytes) * 100).toFixed(2)) : 0;

  return {
    dryRun: false,
    srcDir: plan.dirPath,
    outDir: resolvedOut,
    beforeRawBytes: plan.beforeRawBytes,
    afterRawBytes,
    actualSavedBytes,
    beforeGzipBytes: plan.beforeGzipBytes,
    afterGzipBytes,
    savingsPct,
    actionsApplied,
    validationAfter,
    plan
  };
}

function parseCliArgs(argv) {
  const opts = { srcDir: null, outDir: null, apply: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.apply = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--out') opts.outDir = argv[++i];
    else if (!a.startsWith('-') && !opts.srcDir) opts.srcDir = a;
  }
  return opts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseCliArgs(process.argv.slice(2));
  if (!args.srcDir) {
    console.error('Usage: node tools/adgame/distill-demo-bundle.mjs <srcDir> [--out <outDir>] [--apply] [--json]');
    process.exit(2);
  }
  const result = distillDemoBundle(args.srcDir, args.outDir, { dryRun: !args.apply });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const kb = b => `${(b / 1024).toFixed(1)} KB`;
    if (result.dryRun) {
      console.log(`[distill-demo-bundle] DRY-RUN · ${result.srcDir}`);
      console.log(`  Before: ${kb(result.beforeRawBytes)} -> Est. After: ${kb(result.estimatedAfterRawBytes)} (save ${kb(result.estimatedSavedBytes)}, ${result.estimatedSavingsPct}%)`);
      for (const act of result.actions) {
        console.log(`  - [${act.type}] ${act.file}: ${kb(act.beforeBytes)} -> ${kb(act.afterBytes)}`);
      }
    } else {
      console.log(`[distill-demo-bundle] APPLIED -> ${result.outDir} (${result.validationAfter.pass ? 'PASS' : 'FAIL'})`);
      console.log(`  Raw: ${kb(result.beforeRawBytes)} -> ${kb(result.afterRawBytes)} (saved ${kb(result.actualSavedBytes)}, ${result.savingsPct}%)`);
      console.log(`  Gzip: ${kb(result.beforeGzipBytes)} -> ${kb(result.afterGzipBytes)}`);
    }
  }
  if (!result.dryRun && !result.validationAfter.pass) process.exit(1);
}
