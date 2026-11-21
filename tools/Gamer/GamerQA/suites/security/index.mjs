import fs from 'node:fs';
import path from 'node:path';
import { parseHtmlDocument, sha256File } from '../../core/fs-utils.mjs';

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

const REGEX_PRECURSOR_CHARS = new Set([
  '', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^',
]);
const REGEX_PRECURSOR_KEYWORDS = new Set([
  'return', 'case', 'throw', 'in', 'of', 'typeof', 'void', 'delete', 'new', 'else', 'do', 'yield', 'await', 'instanceof',
]);

function blankPreservingNewlines(text) {
  return text.replace(/[^\n]/g, ' ');
}

/**
 * Replace JS comments (and optionally string/template literal interiors) with spaces
 * while preserving exact character offsets and newlines.
 * Used only for identification/span matching (fail-safe): a mis-tokenized file can at worst
 * lose its Godot-glue status, which makes eval() checks stricter, never looser.
 */
export function stripJsComments(code, { maskStrings = false } = {}) {
  let out = '';
  let i = 0;
  const n = code.length;
  let lastToken = '';
  while (i < n) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === '/' && next === '/') {
      let end = i + 2;
      while (end < n && code[end] !== '\n') end++;
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    if (ch === '/' && next === '*') {
      const close = code.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      out += blankPreservingNewlines(code.slice(i, end));
      i = end;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n && code[j] !== ch) {
        if (code[j] === '\\') {
          j += 2;
          continue;
        }
        if (ch !== '`' && code[j] === '\n') break;
        j++;
      }
      const end = j < n && code[j] === ch ? j + 1 : Math.min(n, j);
      const slice = code.slice(i, end);
      if (maskStrings && slice.length >= 2 && slice[slice.length - 1] === ch) {
        out += ch + blankPreservingNewlines(slice.slice(1, -1)) + ch;
      } else if (maskStrings) {
        out += ch + blankPreservingNewlines(slice.slice(1));
      } else {
        out += slice;
      }
      i = end;
      lastToken = ch;
      continue;
    }
    if (ch === '/' && (REGEX_PRECURSOR_CHARS.has(lastToken) || REGEX_PRECURSOR_KEYWORDS.has(lastToken))) {
      let j = i + 1;
      let inClass = false;
      while (j < n && code[j] !== '\n') {
        if (code[j] === '\\') {
          j += 2;
          continue;
        }
        if (code[j] === '[') inClass = true;
        else if (code[j] === ']') inClass = false;
        else if (code[j] === '/' && !inClass) break;
        j++;
      }
      const end = j < n && code[j] === '/' ? j + 1 : Math.min(n, j);
      const slice = code.slice(i, end);
      out += maskStrings && slice.length >= 2 && slice[slice.length - 1] === '/'
        ? '/' + blankPreservingNewlines(slice.slice(1, -1)) + '/'
        : slice;
      i = end;
      lastToken = '/';
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(code[j])) j++;
      const ident = code.slice(i, j);
      out += ident;
      lastToken = REGEX_PRECURSOR_KEYWORDS.has(ident) ? ident : 'id';
      i = j;
      continue;
    }
    out += ch;
    if (!/\s/.test(ch)) lastToken = /[0-9)\]]/.test(ch) ? 'id' : ch;
    i++;
  }
  return out;
}

// Exact body of Godot's Emscripten `_godot_js_eval` (platform/web/js/libs/library_godot_javascript_singleton.js),
// whitespace/semicolon tolerant so that both minified release and debug exports match.
const GODOT_JS_EVAL_BODY_RE = new RegExp(
  [
    String.raw`function\s+_godot_js_eval\s*\(\s*(?!eval\b)[A-Za-z_$][A-Za-z0-9_$]*(?:\s*,\s*(?!eval\b)[A-Za-z_$][A-Za-z0-9_$]*)*\s*\)\s*\{\s*`,
    String.raw`const\s+js_code\s*=\s*GodotRuntime\.parseString\(\s*p_js\s*\)\s*;?\s*`,
    String.raw`let\s+eval_ret\s*=\s*null\s*;?\s*`,
    String.raw`try\s*\{\s*if\s*\(\s*p_use_global_ctx\s*\)\s*\{\s*`,
    String.raw`const\s+global_eval\s*=\s*eval\s*;?\s*`,
    String.raw`eval_ret\s*=\s*global_eval\(\s*js_code\s*\)\s*;?\s*\}\s*`,
    String.raw`else\s*\{\s*eval_ret\s*=\s*eval\(\s*js_code\s*\)\s*;?\s*\}\s*\}`,
  ].join(''),
  'g'
);

export function findGodotJsEvalSpans(code) {
  const codeOnly = stripJsComments(code, { maskStrings: true });
  const spans = [];
  GODOT_JS_EVAL_BODY_RE.lastIndex = 0;
  let m;
  while ((m = GODOT_JS_EVAL_BODY_RE.exec(codeOnly)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length });
  }
  return spans;
}

export function isGodotEmscriptenGlue(relPosix, code, webDir, manifest, glueHashAllowlist = [], fileSha256 = null) {
  if (manifest?.capabilities?.wasm !== true) return false;
  const base = path.posix.basename(relPosix);
  if (base !== 'index.js' && !base.endsWith('.engine.js')) return false;
  // Optional strict mode: when the policy pins official glue hashes, only those files qualify.
  if (Array.isArray(glueHashAllowlist) && glueHashAllowlist.length) {
    return Boolean(fileSha256) && glueHashAllowlist.map((h) => String(h).toLowerCase()).includes(String(fileSha256).toLowerCase());
  }
  const hasLicense = Boolean(webDir) && fs.existsSync(path.join(webDir, 'GODOT_LICENSE.txt'));
  const hasWasm = Boolean(webDir) && fs.existsSync(webDir) && fs.readdirSync(webDir).some((n) => n.endsWith('.wasm'));
  if (!hasLicense && !hasWasm) return false;
  // Identification runs on comment/string-stripped code so comments or string literals cannot fake glue status.
  const codeOnly = stripJsComments(code, { maskStrings: true });
  if (!/\bGodotRuntime\s*=/.test(codeOnly) && !/\bGodotRuntime\s*\.\s*\w+\s*\(/.test(codeOnly)) return false;
  return findGodotJsEvalSpans(code).length === 1;
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

  // eval() handling: detect direct & indirect eval, isolating ONLY exact Godot Emscripten _godot_js_eval spans
  const evalMatches = [...code.matchAll(/\beval\s*\(|(?:=|return|,|\(|\[|\?|:)\s*eval\b/g)];
  if (evalMatches.length > 0) {
    if (isGodotGlue) {
      const godotSpans = findGodotJsEvalSpans(code);
      const nonGodotEvals = evalMatches.filter((m) => {
        const start = m.index;
        const end = m.index + m[0].length;
        return !godotSpans.some((span) => start >= span.start && end <= span.end);
      });
      if (!godotSpans.length || nonGodotEvals.length) {
        blocks.push(`${label}: unexpected eval() outside _godot_js_eval (${nonGodotEvals.length || evalMatches.length} occurrence(s))`);
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
  const maxHtmlBytes = limits.maxHtmlBytes ?? 4 * 1024 * 1024;
  const maxScriptBytes = limits.maxScriptBytes ?? 8 * 1024 * 1024;
  const glueHashAllowlist = Array.isArray(policy?.godotGlueSha256Allowlist) ? policy.godotGlueSha256Allowlist : [];
  const webDir = staticContext?.webDir;
  const manifest = staticContext?.manifest || null;
  const files = Array.isArray(staticContext?.files) ? staticContext.files : [];
  const walkIssues = Array.isArray(staticContext?.walkIssues) ? staticContext.walkIssues : [];
  const allowlist = Array.isArray(manifest?.capabilities?.externalNetwork) ? manifest.capabilities.externalNetwork : [];

  if (!webDir || !fs.existsSync(webDir) || files.length === 0) {
    const reason = !webDir || !fs.existsSync(webDir)
      ? 'Missing Web/ directory; security suite cannot inspect game bundle'
      : 'No Web/ files available in staticContext.files; security suite refuses to pass an empty inspection context';
    return {
      suite: 'security',
      tier: 0,
      checks: [
        makeCheck(policy, 'SEC-EXTERNAL-URL-ACTIVE', 'error', 'Unallowlisted active external network references', reason),
        makeCheck(policy, 'SEC-EXTERNAL-URL-PASSIVE', 'error', 'Passive external URLs in metadata/links', reason, [], null, 'info'),
        makeCheck(policy, 'SEC-DANGEROUS-API', 'error', 'Dangerous dynamic code & injection APIs', reason),
        makeCheck(policy, 'SEC-CAPABILITY-CONSISTENCY', 'error', 'Manifest capability consistency', reason, [], null, 'major'),
      ],
      context: {
        gameId,
        allowlist,
        passiveUrlCount: 0,
        emptyContext: true,
      },
    };
  }

  const activeExternalIssues = [];
  const passiveUrls = new Set();
  const unsafeAnchorWarns = [];
  const dangerousBlocks = [];
  const dangerousWarns = [];
  const capabilityFindings = [];
  const oversizedScripts = [];

  for (const issue of walkIssues) {
    if (/File tree entry count exceeds|Total Web bundle size exceeds|Directory depth exceeds|Symlink forbidden/i.test(issue)) {
      const msg = `Incomplete Web/ tree security scan: ${issue}`;
      activeExternalIssues.push(msg);
      dangerousBlocks.push(msg);
    }
  }

  let parsedHtmlFiles = Array.isArray(staticContext?.parsedHtmlFiles) ? [...staticContext.parsedHtmlFiles] : [];
  const parsedHtmlRelSet = new Set(parsedHtmlFiles.map((f) => f.relPosix));
  for (const fileInfo of files.filter((f) => f.ext === '.html' || f.ext === '.htm')) {
    if (fileInfo.size > maxHtmlBytes) {
      const msg = `Web/${fileInfo.relPosix}: HTML exceeds maxHtmlBytes (${fileInfo.size} > ${maxHtmlBytes} bytes); blocked because security scan cannot verify oversized HTML`;
      activeExternalIssues.push(msg);
      dangerousBlocks.push(msg);
      continue;
    }
    if (!parsedHtmlRelSet.has(fileInfo.relPosix)) {
      const html = fs.readFileSync(fileInfo.fullPath, 'utf8').replace(/^\uFEFF/, '');
      parsedHtmlFiles.push({ ...fileInfo, html, parsed: parseHtmlDocument(html) });
      parsedHtmlRelSet.add(fileInfo.relPosix);
    }
  }

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

    if (fileInfo.ext !== '.js' && fileInfo.ext !== '.mjs' && fileInfo.ext !== '.cjs') continue;
    if (fileInfo.size > maxScriptBytes) {
      const msg = `Web/${fileInfo.relPosix}: script exceeds maxScriptBytes (${fileInfo.size} > ${maxScriptBytes} bytes); blocked because security scan cannot verify oversized script`;
      oversizedScripts.push({ path: `Web/${fileInfo.relPosix}`, bytes: fileInfo.size, limit: maxScriptBytes });
      activeExternalIssues.push(msg);
      dangerousBlocks.push(msg);
      continue;
    }
    // Skip vendor localization dictionary data from passive URL noise
    const isVendorDict = fileInfo.relPosix === 'vendor/playhub-dictionary.js';
    const js = fs.readFileSync(fileInfo.fullPath, 'utf8');
    const label = `Web/${fileInfo.relPosix}`;
    const fileSha256 = glueHashAllowlist.length ? sha256File(fileInfo.fullPath) : null;
    const isGodotGlue = isGodotEmscriptenGlue(fileInfo.relPosix, js, webDir, manifest, glueHashAllowlist, fileSha256);

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
    oversizedScripts.length ? { oversizedScripts } : null,
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
