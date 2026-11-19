import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

export const LOCALES = Object.freeze(['ko', 'en', 'ja', 'zh-CN', 'fr', 'es', 'pt-BR', 'hi']);
export const TARGET_LOCALES = Object.freeze(LOCALES.slice(1));
export const KEY_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+){1,5}$/;
export const SLOT_PATTERN = /^img\.[a-z][a-z0-9_]*(?:\.[a-z0-9_]+){0,4}$/;

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function extractPlaceholders(text) {
  const found = new Set();
  for (const match of String(text || '').matchAll(/\{([A-Za-z0-9_]+)\}/g)) {
    found.add(match[1]);
  }
  return [...found].sort();
}

export function lintTranslation({ sourceText, value, locale, maxChars = null, glossary = [], contextId = 'general' }) {
  const issues = [];
  const src = String(sourceText || '');
  const val = String(value || '');
  if (!val.trim()) return issues;

  // 1. Placeholder parity (blocking)
  const expected = extractPlaceholders(src);
  const actual = extractPlaceholders(val);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    issues.push({
      severity: 'block',
      code: 'PLACEHOLDER_MISMATCH',
      message: `자리표시자 불일치: 원문 [${expected.join(', ')}] ≠ 번역 [${actual.join(', ')}]`
    });
  }

  // 2. Unsafe HTML / script injection (blocking)
  if (/<script\b|javascript:|on[a-z]+\s*=/i.test(val)) {
    issues.push({
      severity: 'block',
      code: 'UNSAFE_HTML',
      message: '허용되지 않는 스크립트/HTML 패턴이 포함되어 있습니다.'
    });
  }

  // 3. Max length warning
  if (Number.isSafeInteger(maxChars) && maxChars > 0 && val.length > maxChars) {
    issues.push({
      severity: 'warn',
      code: 'MAX_CHARS_EXCEEDED',
      message: `권장 최대 글자수(${maxChars}자)를 초과했습니다 (${val.length}자).`
    });
  }

  // 4. Glossary & Do-Not-Translate (DNT) enforcement
  for (const term of glossary) {
    const token = term.termKo || term.term_ko || '';
    if (!token) continue;
    const isDnt = Boolean(term.isDnt ?? term.is_dnt);
    if (isDnt) {
      if (src.includes(token) && !val.includes(token)) {
        issues.push({
          severity: 'block',
          code: 'DNT_VIOLATION',
          message: `번역 금지 고유명사 '${token}'가 번역문에 보존되지 않았습니다.`
        });
      }
      continue;
    }
    const ctxTags = Array.isArray(term.contextTags) ? term.contextTags : [];
    const ctxMatches = !ctxTags.length || ctxTags.includes(contextId) || ctxTags.includes('all');
    if (!ctxMatches) continue;
    const forbidden = Array.isArray(term.forbidden) ? term.forbidden : [];
    for (const bad of forbidden) {
      if (bad && val.toLowerCase().includes(String(bad).toLowerCase())) {
        issues.push({
          severity: 'warn',
          code: 'FORBIDDEN_TERM',
          message: `금지 오역 '${bad}'가 포함되어 있습니다 (표준 용어: ${token}).`
        });
      }
    }
    if (locale && locale !== 'ko' && src.includes(token)) {
      const expectedTerm = term.translations?.[locale];
      if (expectedTerm && !val.toLowerCase().includes(String(expectedTerm).toLowerCase())) {
        issues.push({
          severity: 'warn',
          code: 'GLOSSARY_MISSING',
          message: `단어집 표준 번역 '${expectedTerm}'(${token}) 적용을 확인하세요.`
        });
      }
    }
  }
  return issues;
}

function walkFiles(dir, extensions, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules' || name === 'dist' || name === 'locales' || name === 'locale-data.js') continue;
    const full = path.join(dir, name);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walkFiles(full, extensions, out);
    else if (extensions.has(path.extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export function gatherPlatformTexts(hubRoot) {
  const roots = [
    path.join(hubRoot, 'web', 'user'),
    path.join(hubRoot, 'web', 'admin'),
    path.join(hubRoot, 'shared')
  ];
  const files = [];
  for (const dir of roots) walkFiles(dir, new Set(['.html', '.js', '.mjs']), files);
  files.sort();

  const gathered = new Map();
  const conflicts = [];

  function record(key, sourceText, ref, contextId = 'general', maxChars = null) {
    if (!KEY_PATTERN.test(key)) return;
    const cleanSource = String(sourceText || '').replace(/\s+/g, ' ').trim();
    if (!cleanSource) return;
    const existing = gathered.get(key);
    if (!existing) {
      gathered.set(key, {
        key,
        namespace: key.split('.').slice(0, -1).join('.'),
        sourceText: cleanSource,
        sourceHash: sha256Hex(cleanSource),
        contextId: contextId || 'general',
        maxChars,
        placeholders: extractPlaceholders(cleanSource),
        codeRefs: [ref]
      });
      return;
    }
    if (!existing.codeRefs.includes(ref)) existing.codeRefs.push(ref);
    if (existing.sourceText !== cleanSource) {
      conflicts.push({ key, existingSource: existing.sourceText, conflictingSource: cleanSource, ref });
    }
  }

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const rel = path.relative(hubRoot, file).replace(/\\/g, '/');
    const ext = path.extname(file).toLowerCase();

    if (ext === '.html') {
      // Match elements with data-l10n="ns.key">Text</tag>
      const tagRe = /<([a-z0-9-]+)\b([^>]*\bdata-l10n=["']([^"']+)["'][^>]*)>([^<]*)</gi;
      for (const m of content.matchAll(tagRe)) {
        const attrs = m[2];
        const key = m[3].trim();
        const inner = m[4];
        const ctx = attrs.match(/\bdata-l10n-ctx=["']([^"']+)["']/i)?.[1] || 'general';
        const maxRaw = attrs.match(/\bdata-l10n-max=["'](\d+)["']/i)?.[1];
        record(key, inner, `${rel}:${lineNumberAt(content, m.index)}`, ctx, maxRaw ? Number(maxRaw) : null);
      }
      // Match attribute keys like data-l10n-placeholder="ns.key" placeholder="원문"
      for (const attr of ['placeholder', 'title', 'aria-label']) {
        const attrRe = new RegExp(`<[^>]*\\bdata-l10n-${attr}=["']([^"']+)["'][^>]*>`, 'gi');
        for (const m of content.matchAll(attrRe)) {
          const tag = m[0];
          const key = m[1].trim();
          const val = tag.match(new RegExp(`\\b${attr}=["']([^"']+)["']`, 'i'))?.[1];
          const ctx = tag.match(/\bdata-l10n-ctx=["']([^"']+)["']/i)?.[1] || 'general';
          if (val) record(key, val, `${rel}:${lineNumberAt(content, m.index)}`, ctx, null);
        }
      }
    } else {
      // JS: t('ns.key', '원문') or PlayHubLocale.t('ns.key', '원문') or LOCTEXT('ns', 'key', '원문')
      const callRe = /\b(?:PlayHubLocale\.)?t\(\s*(['"])([a-z][a-z0-9_.]*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3(?:\s*,\s*\{([^}]*)\})?/g;
      for (const m of content.matchAll(callRe)) {
        const key = m[2];
        const src = m[4].replace(/\\(['"\\])/g, '$1');
        const opts = m[5] || '';
        const ctx = opts.match(/\bctx\s*:\s*['"]([^'"]+)['"]/)?.[1] || 'general';
        record(key, src, `${rel}:${lineNumberAt(content, m.index)}`, ctx, null);
      }
      const locRe = /\bLOCTEXT\(\s*(['"])([a-z][a-z0-9_.]*)\1\s*,\s*(['"])([a-z0-9_]+)\3\s*,\s*(['"])((?:\\.|(?!\5)[^\\])*)\5/g;
      for (const m of content.matchAll(locRe)) {
        const key = `${m[2]}.${m[4]}`;
        const src = m[6].replace(/\\(['"\\])/g, '$1');
        record(key, src, `${rel}:${lineNumberAt(content, m.index)}`, 'general', null);
      }
    }
  }

  return {
    scannedFiles: files.length,
    entries: [...gathered.values()].sort((a, b) => a.key.localeCompare(b.key)),
    conflicts
  };
}

export function buildTranslationPrompt({ items, targetLocale, promptProfile, glossary = [] }) {
  const dntTokens = glossary.filter(g => g.isDnt).map(g => g.termKo);
  const relevantTerms = glossary.filter(g => !g.isDnt && items.some(item => String(item.sourceText || '').includes(g.termKo)));
  const disambiguations = Array.isArray(promptProfile?.disambiguation) ? promptProfile.disambiguation : [];
  const rules = Array.isArray(promptProfile?.rules) ? promptProfile.rules : [];

  const system = [
    `You are a professional UI localization translator for PlayHub (a web game platform).`,
    `Target locale: ${targetLocale}. Source language: Korean (ko).`,
    `Global rules:`,
    `- Preserve every placeholder token such as {0}, {1}, {name} verbatim.`,
    `- Do NOT translate or alter Do-Not-Translate tokens: ${dntTokens.length ? dntTokens.join(', ') : '(none)'}.`,
    `- Never emit HTML or script tags.`,
    `- Return ONLY a JSON object mapping each key to its translated string: {"key": "translation"}.`,
    promptProfile?.systemPrompt ? `Context profile (${promptProfile.contextId}): ${promptProfile.systemPrompt}` : '',
    rules.length ? `Additional style rules:\n${rules.map(r => `- ${r}`).join('\n')}` : '',
    disambiguations.length ? `Contextual word choice rules:\n${disambiguations.map(d => `- "${d.source}" when [${d.context}] => "${d.prefer}" (${d.note || ''})`).join('\n')}` : '',
    relevantTerms.length ? `Glossary (must prefer these terms):\n${relevantTerms.map(g => `- "${g.termKo}" => "${g.translations?.[targetLocale] || g.termEn || g.termKo}"${g.forbidden?.length ? ` (avoid: ${g.forbidden.join(', ')})` : ''}`).join('\n')}` : ''
  ].filter(Boolean).join('\n');

  const userPayload = items.map(item => ({
    key: item.key,
    source: item.sourceText,
    context: item.contextId || 'general',
    ...(item.description ? { note: item.description } : {}),
    ...(item.maxChars ? { maxChars: item.maxChars } : {})
  }));

  return { system, user: JSON.stringify({ targetLocale, items: userPayload }, null, 2) };
}

export async function translateWithAi({
  provider = 'mock',
  model = '',
  baseUrl = '',
  apiKey = '',
  items = [],
  targetLocale,
  promptProfile = null,
  glossary = [],
  fetchImpl = globalThis.fetch
}) {
  if (!TARGET_LOCALES.includes(targetLocale)) throw new Error('UNSUPPORTED_LOCALE');
  if (!items.length) return { translations: {}, provider, model: model || provider, promptPreview: null };

  const prompt = buildTranslationPrompt({ items, targetLocale, promptProfile, glossary });

  if (provider === 'mock') {
    const translations = {};
    const disambiguations = Array.isArray(promptProfile?.disambiguation) ? promptProfile.disambiguation : [];
    for (const item of items) {
      let text = String(item.sourceText || '');
      let matchedOverride = false;
      for (const rule of disambiguations) {
        if (rule.source && text.trim() === rule.source && (!rule.locale || rule.locale === targetLocale)) {
          text = rule.prefer;
          matchedOverride = true;
          break;
        }
      }
      if (!matchedOverride) {
        for (const term of glossary) {
          if (term.isDnt) continue;
          const mapped = term.translations?.[targetLocale];
          if (mapped && text.includes(term.termKo)) {
            text = text.replaceAll(term.termKo, mapped);
          }
        }
        text = `[${targetLocale}] ${text}`;
      }
      translations[item.key] = text;
    }
    return { translations, provider: 'mock', model: 'mock-context-v1', promptPreview: prompt.system };
  }

  if (provider === 'gemini') {
    if (!apiKey) throw new Error('GEMINI_API_KEY_REQUIRED');
    const chosenModel = model || 'gemini-2.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(chosenModel)}:generateContent`;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: prompt.system }] },
        contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
      })
    });
    if (!response.ok) throw new Error(`GEMINI_HTTP_${response.status}`);
    const body = await response.json();
    const rawText = body?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const parsed = JSON.parse(rawText);
    return { translations: parsed, provider: 'gemini', model: chosenModel, promptPreview: prompt.system };
  }

  if (provider === 'openai') {
    if (!apiKey) throw new Error('OPENAI_API_KEY_REQUIRED');
    const chosenModel = model || 'gpt-4o-mini';
    const rootUrl = (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const response = await fetchImpl(`${rootUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: chosenModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user }
        ]
      })
    });
    if (!response.ok) throw new Error(`OPENAI_HTTP_${response.status}`);
    const body = await response.json();
    const rawText = body?.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(rawText);
    return { translations: parsed, provider: 'openai', model: chosenModel, promptPreview: prompt.system };
  }

  throw new Error('UNSUPPORTED_AI_PROVIDER');
}

export function validateMediaUpload({ base64, filename = '', maxBytes = 1024 * 1024, allowedFormats = ['webp', 'png', 'jpg', 'svg'] }) {
  if (typeof base64 !== 'string' || !base64.trim()) throw new Error('MEDIA_DATA_REQUIRED');
  const cleaned = base64.replace(/^data:[^;]+;base64,/i, '').trim();
  const buffer = Buffer.from(cleaned, 'base64');
  if (!buffer.length) throw new Error('MEDIA_EMPTY');
  if (buffer.length > maxBytes) throw new Error('MEDIA_TOO_LARGE');

  let ext = null;
  let mimeType = null;
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) {
    ext = 'png'; mimeType = 'image/png';
  } else if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    ext = 'jpg'; mimeType = 'image/jpeg';
  } else if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    ext = 'webp'; mimeType = 'image/webp';
  } else {
    const head = buffer.toString('utf8').trimStart();
    if (/^(?:<\?xml[\s\S]*?\?>\s*)?<svg\b/i.test(head) && head.includes('</svg>')) {
      if (/<script\b|<foreignObject\b|javascript:|on[a-z]+\s*=|https?:\/\/(?!www\.w3\.org\/)/i.test(head)) {
        throw new Error('MEDIA_UNSAFE_SVG');
      }
      ext = 'svg'; mimeType = 'image/svg+xml';
    }
  }

  if (!ext || !allowedFormats.includes(ext)) throw new Error('MEDIA_FORMAT_UNSUPPORTED');
  return { buffer, ext, mimeType, bytes: buffer.length, sha256: sha256Hex(buffer) };
}

export function parseLegacyPlatformDictionaries(hubRoot) {
  const collected = {};
  for (const name of ['platform.js', 'community.js']) {
    const file = path.join(hubRoot, 'shared', 'locales', name);
    if (!fs.existsSync(file)) continue;
    const code = fs.readFileSync(file, 'utf8');
    const ctx = vm.createContext({
      PlayHubLocale: {
        register(entries) {
          for (const [source, row] of Object.entries(entries || {})) {
            collected[source] = { ...(collected[source] || {}), ...row, _file: name };
          }
        }
      }
    });
    vm.runInContext(code, ctx);
  }
  return collected;
}

export function compileL10nBundleJs(bundle) {
  const keys = bundle?.keys || {};
  const media = bundle?.media || {};
  const legacy = {};
  for (const row of Object.values(keys)) {
    if (row?.ko && typeof row.ko === 'string') {
      const copy = {};
      for (const loc of LOCALES) if (typeof row[loc] === 'string' && row[loc]) copy[loc] = row[loc];
      if (Object.keys(copy).length > 1) legacy[row.ko] = copy;
    }
  }
  return [
    `/* Generated from PlayHub L10N release ${bundle?.tag || 'workspace'} (${bundle?.generatedAt || ''}) */`,
    `PlayHubLocale.registerKeys(${JSON.stringify(keys)});`,
    `PlayHubLocale.registerMedia(${JSON.stringify(media)});`,
    `PlayHubLocale.register(${JSON.stringify(legacy)});`,
    ''
  ].join('\n');
}
