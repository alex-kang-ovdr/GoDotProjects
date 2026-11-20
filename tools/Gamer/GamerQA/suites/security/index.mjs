import fs from 'node:fs';
import path from 'node:path';
import { parseHtmlDocument } from '../../core/fs-utils.mjs';

const BENIGN_XML_OR_DOC_URLS = new Set([
  'http://www.w3.org/2000/svg',
  'https://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/XML/1998/namespace',
]);

function ruleSeverity(policy, ruleId, fallback) {
  return policy?.rules?.find((r) => r.id === ruleId)?.severity || fallback;
}

function makeCheck(policy, ruleId, status, title, message, details = [], evidence = null, fallbackSeverity = 'block') {
  const item = {
    id: ruleId,
    ruleId,
    suite: 'security',
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

function isUrlAllowlisted(candidateUrl, allowlist) {
  if (!allowlist || !allowlist.length) return false;
  let parsed;
  try {
    parsed = new URL(candidateUrl.startsWith('//') ? `https:${candidateUrl}` : candidateUrl);
  } catch {
    return false;
  }
  if (['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname)) return true;
  return allowlist.some((allowed) => {
    try {
      const aUrl = new URL(allowed);
      return parsed.origin === aUrl.origin && (!aUrl.pathname || aUrl.pathname === '/' || parsed.pathname.startsWith(aUrl.pathname));
    } catch {
      return parsed.hostname === allowed || candidateUrl.startsWith(allowed);
    }
  });
}

function isExternalHttpOrWs(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (/^(?:https?:|wss?:)\/\//i.test(trimmed) || trimmed.startsWith('//')) {
    try {
      const u = new URL(trimmed.startsWith('//') ? `https:${trimmed}` : trimmed);
      return !['127.0.0.1', 'localhost', '::1'].includes(u.hostname);
    } catch {
      return true;
    }
  }
  return false;
}

function isGodotEmscriptenGlue(relPosix, code, webDir, manifest) {
  if (manifest?.capabilities?.wasm !== true) return false;
  const base = path.posix.basename(relPosix);
  if (base !== 'index.js' && !base.endsWith('.engine.js')) return false;
  const hasLicense = fs.existsSync(path.join(webDir, 'GODOT_LICENSE.txt'));
  const hasWasm = fs.readdirSync(webDir).some((n) => n.endsWith('.wasm'));
  return (hasLicense || hasWasm) && /GodotRuntime/.test(code) && /_godot_js_eval/.test(code);
}

function scanScriptForActiveNetwork(code, label, allowlist) {
  const hits = [];
  const patterns = [
    { name: 'fetch()', re: /\bfetch\s*\(\s*(['"`])((?:https?:|wss?:)?\/\/[^'"`\s)]+)\1/gi },
    { name: 'XMLHttpRequest.open()', re: /\.open\s*\(\s*['"`][A-Z]+['"`]\s*,\s*(['"`])((?:https?:)?\/\/[^'"`\s)]+)\1/gi },
    { name: 'WebSocket()', re: /\bnew\s+WebSocket\s*\(\s*(['"`])((?:wss?:|https?:)?\/\/[^'"`\s)]+)\1/gi },
    { name: 'sendBeacon()', re: /\bsendBeacon\s*\(\s*(['"`])((?:https?:)?\/\/[^'"`\s)]+)\1/gi },
    { name: 'EventSource()', re: /\bnew\s+EventSource\s*\(\s*(['"`])((?:https?:)?\/\/[^'"`\s)]+)\1/gi },
    { name: 'dynamic import()', re: /\bimport\s*\(\s*(['"`])((?:https?:)?\/\/[^'"`\s)]+)\1/gi },
  ];
  for (const { name, re } of patterns) {
    let m;
    while ((m = re.exec(code)) !== null) {
      const url = m[2];
      if (!isUrlAllowlisted(url, allowlist) && !BENIGN_XML_OR_DOC_URLS.has(url)) {
        hits.push(`${label}: unallowlisted ${name} target ${url}`);
      }
    }
  }
  return hits;
}

function scanScriptForDangerousApis(code, label, { isGodotGlue = false } = {}) {
  const blocks = [];
  const warns = [];

  if (/\bnew\s+Function\s*\(/g.test(code)) {
    blocks.push(`${label}: new Function() dynamic code execution detected`);
  }
  if (/\bdocument\.(?:write|writeln)\s*\(/g.test(code)) {
    blocks.push(`${label}: document.write/writeln detected`);
  }
  if (/(['"`])\s*javascript\s*:/i.test(code)) {
    blocks.push(`${label}: javascript: URI string detected`);
  }
  if (/\b(?:setTimeout|setInterval)\s*\(\s*(['"`])/g.test(code)) {
    blocks.push(`${label}: string-argument setTimeout/setInterval eval detected`);
  }
  if (/\.innerHTML\s*[+]?=\s*[^;]*<\s*script\b/i.test(code)) {
    blocks.push(`${label}: <script> injection into innerHTML detected`);
  }
  if (/\bdocument\.cookie\b/.test(code)) {
    warns.push(`${label}: document.cookie access detected`);
  }

  // eval() handling: detect direct & indirect eval, isolating Godot Emscripten _godot_js_eval
  const evalMatches = [...code.matchAll(/\beval\s*\(|(?:=|return|,|\(|\[|\?|:)\s*eval\b/g)];
  if (evalMatches.length > 0) {
    if (isGodotGlue) {
      const nonGodotEvals = evalMatches.filter((m) => {
        const snippet = code.slice(Math.max(0, m.index - 80), m.index + 80);
        return !/global_eval|js_code|_godot_js_eval/.test(snippet);
      });
      if (nonGodotEvals.length) {
        blocks.push(`${label}: unexpected eval() outside _godot_js_eval (${nonGodotEvals.length} occurrence(s))`);
      } else {
        warns.push(`${label}: Godot Emscripten runtime contains _godot_js_eval (requires 'unsafe-eval'/'wasm-unsafe-eval' CSP)`);
      }
    } else {
      blocks.push(`${label}: eval() dynamic execution detected (${evalMatches.length} occurrence(s))`);
    }
  }

  return { blocks, warns };
}

export async function runSecuritySuite({ gameId, policy, staticContext }) {
  const checks = [];
  const limits = policy?.limits || {};
  const webDir = staticContext.webDir;
  const manifest = staticContext.manifest;
  const files = staticContext.files || [];
  const allowlist = Array.isArray(manifest?.capabilities?.externalNetwork) ? manifest.capabilities.externalNetwork : [];

  let parsedHtmlFiles = staticContext.parsedHtmlFiles || [];
  if (!parsedHtmlFiles.length && fs.existsSync(webDir)) {
    for (const fileInfo of files.filter((f) => f.ext === '.html' || f.ext === '.htm')) {
      const html = fs.readFileSync(fileInfo.fullPath, 'utf8').replace(/^\uFEFF/, '');
      parsedHtmlFiles.push({ ...fileInfo, html, parsed: parseHtmlDocument(html) });
    }
  }

  const activeExternalIssues = [];
  const passiveUrls = new Set();
  const unsafeAnchorWarns = [];
  const dangerousBlocks = [];
  const dangerousWarns = [];
  const capabilityFindings = [];

  // Inspect HTML tags, inline styles, and inline scripts
  for (const htmlFile of parsedHtmlFiles) {
    const label = `Web/${htmlFile.relPosix}`;
    for (const { tag, attrs } of htmlFile.parsed.tags) {
      // Event handlers with javascript: or eval()
      for (const [attrName, attrVal] of Object.entries(attrs)) {
        if (/^on[a-z]+$/.test(attrName)) {
          if (/\beval\s*\(|\bnew\s+Function\s*\(|javascript\s*:/i.test(attrVal)) {
            dangerousBlocks.push(`${label}: dangerous code in ${attrName} handler`);
          }
        }
        if (['href', 'src', 'action', 'formaction', 'data', 'poster'].includes(attrName) && /^\s*javascript\s*:/i.test(attrVal)) {
          dangerousBlocks.push(`${label}: javascript: URI in <${tag} ${attrName}>`);
        }
      }

      if (tag === 'a' && Object.hasOwn(attrs, 'href')) {
        const href = String(attrs.href || '');
        if (isExternalHttpOrWs(href) && !BENIGN_XML_OR_DOC_URLS.has(href)) {
          passiveUrls.add(href);
          if (String(attrs.target || '').toLowerCase() === '_blank') {
            const rels = new Set(String(attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean));
            if (!rels.has('noopener') && !rels.has('noreferrer')) {
              unsafeAnchorWarns.push(`${label}: <a target="_blank" href="${href}"> missing rel="noopener"`);
            }
          }
        }
      } else {
        for (const attrName of ['src', 'href', 'data', 'poster', 'action']) {
          if (!Object.hasOwn(attrs, attrName)) continue;
          const val = String(attrs[attrName] || '');
          if (isExternalHttpOrWs(val) && !BENIGN_XML_OR_DOC_URLS.has(val) && !isUrlAllowlisted(val, allowlist)) {
            activeExternalIssues.push(`${label}: unallowlisted external <${tag} ${attrName}="${val}">`);
          }
        }
      }
    }

    // Inline <style>
    for (const styleBlock of htmlFile.parsed.styles) {
      const cssUrlRe = /(?:@import\s+(?:url\s*\(\s*)?|url\s*\(\s*)['"]?((?:https?:)?\/\/[^'")\s]+)['"]?/gi;
      let m;
      while ((m = cssUrlRe.exec(styleBlock.body)) !== null) {
        if (!isUrlAllowlisted(m[1], allowlist)) {
          activeExternalIssues.push(`${label}: unallowlisted external CSS resource ${m[1]}`);
        }
      }
    }

    // Inline <script>
    for (const scriptBlock of htmlFile.parsed.scripts) {
      if (!scriptBlock.body.trim()) continue;
      const stype = String(scriptBlock.attrs.type || '').trim().toLowerCase();
      if (stype === 'application/json' || stype === 'application/ld+json') continue;

      activeExternalIssues.push(...scanScriptForActiveNetwork(scriptBlock.body, label, allowlist));
      const d = scanScriptForDangerousApis(scriptBlock.body, label);
      dangerousBlocks.push(...d.blocks);
      dangerousWarns.push(...d.warns);

      for (const m of scriptBlock.body.matchAll(/https?:\/\/[^\s"'`<>)}\]\\]+/g)) {
        const u = m[0];
        if (!BENIGN_XML_OR_DOC_URLS.has(u) && isExternalHttpOrWs(u)) passiveUrls.add(u);
      }

      if (manifest?.capabilities?.webgl === false && /\.getContext\s*\(\s*['"]webgl/i.test(scriptBlock.body)) {
        capabilityFindings.push(`${label}: requests WebGL context while capabilities.webgl is false`);
      }
      if (manifest?.capabilities?.workers === false && /\b(?:new\s+(?:Shared)?Worker|serviceWorker\.register|audioWorklet\.addModule)\s*\(/i.test(scriptBlock.body)) {
        capabilityFindings.push(`${label}: uses Worker/AudioWorklet/ServiceWorker while capabilities.workers is false`);
      }
    }
  }

  // Inspect standalone JS / CSS files under Web/
  for (const fileInfo of files) {
    if (fileInfo.ext === '.css') {
      const css = fs.readFileSync(fileInfo.fullPath, 'utf8');
      const cssUrlRe = /(?:@import\s+(?:url\s*\(\s*)?|url\s*\(\s*)['"]?((?:https?:)?\/\/[^'")\s]+)['"]?/gi;
      let m;
      while ((m = cssUrlRe.exec(css)) !== null) {
        if (!isUrlAllowlisted(m[1], allowlist)) {
          activeExternalIssues.push(`Web/${fileInfo.relPosix}: unallowlisted external CSS resource ${m[1]}`);
        }
      }
      continue;
    }

    if (fileInfo.ext !== '.js' && fileInfo.ext !== '.mjs') continue;
    if (fileInfo.size > (limits.maxScriptBytes ?? 8 * 1024 * 1024)) continue;
    // Skip vendor localization dictionary data from passive URL noise
    const isVendorDict = fileInfo.relPosix === 'vendor/playhub-dictionary.js';
    const js = fs.readFileSync(fileInfo.fullPath, 'utf8');
    const label = `Web/${fileInfo.relPosix}`;
    const isGodotGlue = isGodotEmscriptenGlue(fileInfo.relPosix, js, webDir, manifest);

    activeExternalIssues.push(...scanScriptForActiveNetwork(js, label, allowlist));
    const d = scanScriptForDangerousApis(js, label, { isGodotGlue });
    dangerousBlocks.push(...d.blocks);
    dangerousWarns.push(...d.warns);

    if (!isVendorDict) {
      for (const m of js.matchAll(/https?:\/\/[^\s"'`<>)}\]\\]+/g)) {
        const u = m[0];
        if (!BENIGN_XML_OR_DOC_URLS.has(u) && isExternalHttpOrWs(u)) passiveUrls.add(u);
      }
    }

    if (!isGodotGlue && manifest?.capabilities?.webgl === false && /\.getContext\s*\(\s*['"]webgl/i.test(js)) {
      capabilityFindings.push(`${label}: requests WebGL context while capabilities.webgl is false`);
    }
    if (!isGodotGlue && manifest?.capabilities?.workers === false && /\b(?:new\s+(?:Shared)?Worker|serviceWorker\.register|audioWorklet\.addModule)\s*\(/i.test(js)) {
      capabilityFindings.push(`${label}: uses Worker/AudioWorklet/ServiceWorker while capabilities.workers is false`);
    }
  }

  // Check wasm/worklet files vs capabilities
  const hasWasmFile = files.some((f) => f.ext === '.wasm');
  const hasWorkletFile = files.some((f) => /worklet\.js$/i.test(f.relPosix));
  if (hasWasmFile && manifest?.capabilities?.wasm === false) {
    capabilityFindings.push('Web/ contains .wasm binary while capabilities.wasm is false');
  }
  if (hasWorkletFile && manifest?.capabilities?.workers === false) {
    capabilityFindings.push('Web/ contains audio worklet script while capabilities.workers is false');
  }

  checks.push(
    makeCheck(
      policy,
      'SEC-EXTERNAL-URL-ACTIVE',
      activeExternalIssues.length ? 'fail' : 'pass',
      'Unallowlisted active external network references',
      activeExternalIssues.length
        ? activeExternalIssues[0]
        : allowlist.length
          ? `All external active URLs match allowlist (${allowlist.length} origin(s))`
          : 'Zero unallowlisted external script/resource/fetch/XHR/WebSocket references',
      activeExternalIssues,
      { allowlist }
    )
  );

  const passiveList = [...passiveUrls].sort();
  const passiveStatus = unsafeAnchorWarns.length ? 'warn' : 'pass';
  const passiveSeverity = unsafeAnchorWarns.length ? 'minor' : ruleSeverity(policy, 'SEC-EXTERNAL-URL-PASSIVE', 'info');
  const passiveCheck = makeCheck(
    policy,
    'SEC-EXTERNAL-URL-PASSIVE',
    passiveStatus,
    'Passive external URLs in metadata/links',
    unsafeAnchorWarns.length
      ? unsafeAnchorWarns[0]
      : passiveList.length
        ? `No unsafe external links; ${passiveList.length} passive provenance/reference URL(s) inventoried`
        : 'Zero external URLs found in game bundle',
    unsafeAnchorWarns,
    { passiveUrlCount: passiveList.length, sampleUrls: passiveList.slice(0, 15) },
    passiveSeverity
  );
  passiveCheck.severity = passiveSeverity;
  checks.push(passiveCheck);

  const dangerStatus = dangerousBlocks.length ? 'fail' : dangerousWarns.length ? 'warn' : 'pass';
  const dangerSeverity = dangerousBlocks.length ? 'block' : dangerousWarns.length ? 'minor' : ruleSeverity(policy, 'SEC-DANGEROUS-API', 'block');
  const dangerCheck = makeCheck(
    policy,
    'SEC-DANGEROUS-API',
    dangerStatus,
    'Dangerous dynamic code & injection APIs',
    dangerousBlocks.length
      ? dangerousBlocks[0]
      : dangerousWarns.length
        ? dangerousWarns[0]
        : 'No dangerous dynamic execution or script injection APIs detected',
    [...dangerousBlocks, ...dangerousWarns],
    null,
    dangerSeverity
  );
  dangerCheck.severity = dangerSeverity;
  checks.push(dangerCheck);

  checks.push(
    makeCheck(
      policy,
      'SEC-CAPABILITY-CONSISTENCY',
      capabilityFindings.length ? 'warn' : 'pass',
      'Manifest capability consistency',
      capabilityFindings.length
        ? capabilityFindings[0]
        : `Declared capabilities consistent (webgl=${Boolean(manifest?.capabilities?.webgl)}, wasm=${Boolean(manifest?.capabilities?.wasm)}, workers=${Boolean(manifest?.capabilities?.workers)})`,
      capabilityFindings,
      {
        declared: manifest?.capabilities || null,
        observed: { hasWasmFile, hasWorkletFile },
      },
      'major'
    )
  );

  return {
    suite: 'security',
    tier: 0,
    checks,
    context: {
      gameId,
      allowlist,
      passiveUrlCount: passiveList.length,
    },
  };
}
