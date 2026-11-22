import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import vm from 'node:vm';
import { createApp } from '../server/app.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';
import {
  LOCALES,
  TARGET_LOCALES,
  lintTranslation,
  gatherPlatformTexts,
  validateOpenAiBaseUrl,
  translateWithAi,
  validateMediaUpload,
  assembleSurfaceLocaleData
} from '../server/l10n-engine.mjs';

function makeCreds(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, passwordHash: scryptSync(password, salt, 64).toString('hex') };
}

async function callHandler(handler, route, { method = 'GET', origin = 'http://127.0.0.1:8081', cookie = '', csrf = '', body } = {}) {
  const req = new PassThrough();
  req.method = method;
  req.url = route;
  req.socket = { remoteAddress: '127.0.0.1' };
  req.headers = {
    host: '127.0.0.1:8091',
    ...(origin ? { origin } : {}),
    ...(cookie ? { cookie } : {}),
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
    ...(body !== undefined ? { 'content-type': 'application/json' } : {})
  };
  const headers = {};
  const chunks = [];
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    getHeader(name) { return headers[name.toLowerCase()]; },
    removeHeader(name) { delete headers[name.toLowerCase()]; },
    writeHead(code, map = {}) {
      this.statusCode = code;
      for (const [k, v] of Object.entries(map)) headers[k.toLowerCase()] = v;
      this.headersSent = true;
    },
    end(chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8'));
      this.headersSent = true;
    }
  };
  const done = handler(req, res);
  if (body !== undefined) req.end(JSON.stringify(body));
  else req.end();
  await done;
  const buf = Buffer.concat(chunks);
  const ct = headers['content-type'] || '';
  const setCookies = headers['set-cookie'] ? (Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : [headers['set-cookie']]) : [];
  const nextCookie = setCookies.map(c => c.split(';')[0]).join('; ');
  return {
    status: res.statusCode,
    headers,
    cookie: nextCookie || cookie,
    buffer: buf,
    data: ct.includes('application/json') && buf.length ? JSON.parse(buf.toString('utf8')) : null
  };
}

test('lintTranslation catches placeholder mismatches, XSS, DNT violations, forbidden terms and maxChars', () => {
  const glossary = [
    { termKo: 'PlayHub', isDnt: true },
    { termKo: '찜한 게임', isDnt: false, contextTags: ['ui.nav'], translations: { en: 'Wishlist' }, forbidden: ['Steamed games'] }
  ];
  const badPh = lintTranslation({ sourceText: '총 {count}개 게임', value: 'Total games', locale: 'en', glossary });
  assert.ok(badPh.some(i => i.code === 'PLACEHOLDER_MISMATCH' && i.severity === 'block'));

  const xss = lintTranslation({ sourceText: '안녕', value: '<script>alert(1)</script>', locale: 'en', glossary });
  assert.ok(xss.some(i => i.code === 'UNSAFE_HTML' && i.severity === 'block'));

  const dnt = lintTranslation({ sourceText: 'PlayHub 시작', value: 'Start Play Game', locale: 'en', glossary });
  assert.ok(dnt.some(i => i.code === 'DNT_VIOLATION' && i.severity === 'block'));

  const term = lintTranslation({ sourceText: '찜한 게임', value: 'Steamed games list', locale: 'en', maxChars: 10, glossary, contextId: 'ui.nav' });
  assert.ok(term.some(i => i.code === 'FORBIDDEN_TERM'));
  assert.ok(term.some(i => i.code === 'GLOSSARY_MISSING'));
  assert.ok(term.some(i => i.code === 'MAX_CHARS_EXCEEDED'));
});

test('AI translation supports mock disambiguation, Gemini REST, and OpenAI-compatible endpoints', async () => {
  const promptProfile = {
    contextId: 'ui.button',
    systemPrompt: 'Short button label',
    disambiguation: [{ source: '플레이', context: 'ui.button', locale: 'ja', prefer: 'プレイ' }]
  };
  const mockRes = await translateWithAi({
    provider: 'mock', targetLocale: 'ja', promptProfile,
    items: [{ key: 'portal.game.play_btn', sourceText: '플레이', contextId: 'ui.button' }]
  });
  assert.equal(mockRes.translations['portal.game.play_btn'], 'プレイ');

  const geminiCalls = [];
  const geminiRes = await translateWithAi({
    provider: 'gemini', model: 'gemini-2.5-flash', apiKey: 'test-gemini-key', targetLocale: 'en', promptProfile,
    items: [{ key: 'portal.game.play_btn', sourceText: '플레이', contextId: 'ui.button' }],
    fetchImpl: async (url, init) => {
      geminiCalls.push({ url, headers: init.headers });
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"portal.game.play_btn":"Play"}' }] } }] }) };
    }
  });
  assert.equal(geminiRes.translations['portal.game.play_btn'], 'Play');
  assert.equal(geminiCalls[0].headers['x-goog-api-key'], 'test-gemini-key');

  const openaiCalls = [];
  const openaiRes = await translateWithAi({
    provider: 'openai', model: 'gpt-4o-mini', baseUrl: 'https://custom.llm.invalid/v1', apiKey: 'test-openai-key', targetLocale: 'en', promptProfile,
    items: [{ key: 'portal.game.play_btn', sourceText: '플레이', contextId: 'ui.button' }],
    fetchImpl: async (url, init) => {
      openaiCalls.push({ url, headers: init.headers });
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"portal.game.play_btn":"Play"}' } }] }) };
    }
  });
  assert.equal(openaiRes.translations['portal.game.play_btn'], 'Play');
  assert.equal(openaiCalls[0].url, 'https://custom.llm.invalid/v1/chat/completions');
});

test('media upload validation accepts clean SVG/PNG and rejects malicious SVG or fake magic bytes', () => {
  const cleanSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#13785d"/></svg>').toString('base64');
  const ok = validateMediaUpload({ base64: cleanSvg });
  assert.equal(ok.ext, 'svg');
  assert.equal(ok.mimeType, 'image/svg+xml');

  const evilSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64');
  assert.throws(() => validateMediaUpload({ base64: evilSvg }), /MEDIA_UNSAFE_SVG/);

  const fakePng = Buffer.from('not-a-real-image').toString('base64');
  assert.throws(() => validateMediaUpload({ base64: fakePng }), /MEDIA_FORMAT_UNSUPPORTED/);
});

test('gatherPlatformTexts scans hub web sources with zero key conflicts', () => {
  const hubRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')), '..');
  const result = gatherPlatformTexts(hubRoot);
  assert.ok(result.entries.length >= 20);
  assert.deepEqual(result.conflicts, []);
});

test('L10N admin API supports strings, gather, glossary, prompts, AI draft gating, media upload, releases, rollback, and backup compatibility', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-l10n-test-'));
  const dataDir = path.join(dir, 'data');
  const creds = makeCreds('AdminPassphrase!2026');
  const secretGemini = 'SECRET_GEMINI_KEY_NEVER_LEAK';
  const secretOpenai = 'SECRET_OPENAI_KEY_NEVER_LEAK';

  const app = createApp({
    dataDir, publicPort: 0, adminPort: 0,
    userBaseUrl: 'http://localhost:8080',
    adminBaseUrl: 'http://127.0.0.1:8081',
    userOrigins: ['http://localhost:8080'],
    adminOrigins: ['http://127.0.0.1:8081'],
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: false }
  }, {
    env: { ...process.env, PLAYHUB_L10N_GEMINI_API_KEY: secretGemini, PLAYHUB_L10N_OPENAI_API_KEY: secretOpenai }
  });
  t.after(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // Auth boundary
  assert.equal((await callHandler(app.publicHandler, '/api/admin/l10n/overview', { origin: 'http://localhost:8080' })).status, 404);
  assert.equal((await callHandler(app.adminHandler, '/api/admin/l10n/overview')).status, 401);

  const init = await callHandler(app.adminHandler, '/api/admin/session');
  const login = await callHandler(app.adminHandler, '/api/admin/login', {
    method: 'POST', cookie: init.cookie, csrf: init.data.csrfToken,
    body: { username: 'admin', password: 'AdminPassphrase!2026' }
  });
  const auth = { cookie: login.cookie, csrf: login.data.csrfToken };

  // Overview & zero secret leakage
  const ov = await callHandler(app.adminHandler, '/api/admin/l10n/overview', auth);
  assert.equal(ov.status, 200);
  assert.ok(ov.data.totalKeys > 0);
  const ovText = JSON.stringify(ov.data);
  assert.equal(ovText.includes(secretGemini), false);
  assert.equal(ovText.includes(secretOpenai), false);

  // Create key, run Mock AI translate (lands in ai_draft), block bad approval, approve cleanly
  const createKey = await callHandler(app.adminHandler, '/api/admin/l10n/strings', {
    method: 'POST', ...auth,
    body: { key: 'portal.test.play_btn', sourceText: '플레이', contextId: 'ui.button', maxChars: 20 }
  });
  assert.equal(createKey.status, 201);

  const aiRes = await callHandler(app.adminHandler, '/api/admin/l10n/ai/translate', {
    method: 'POST', ...auth,
    body: { provider: 'mock', targetLocale: 'en', keys: ['portal.test.play_btn'], contextId: 'ui.button' }
  });
  assert.equal(aiRes.status, 200);
  assert.equal(aiRes.data.results[0].translated, 'Play');
  assert.equal(aiRes.data.results[0].status, 'ai_draft');

  // Publish release v1 BEFORE approval -> unapproved ai_draft must NOT be included
  const rel1 = await callHandler(app.adminHandler, '/api/admin/l10n/releases', {
    method: 'POST', ...auth, body: { notes: 'Initial snapshot' }
  });
  assert.equal(rel1.status, 201);
  assert.equal(rel1.data.release.tag, 'l10n-v1');

  // Batch approve then publish v2, then rollback to v1
  const approved = await callHandler(app.adminHandler, '/api/admin/l10n/strings/approve', {
    method: 'POST', ...auth, body: { keys: ['portal.test.play_btn'], locales: ['en'] }
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.approved, 1);

  const rel2 = await callHandler(app.adminHandler, '/api/admin/l10n/releases', {
    method: 'POST', ...auth, body: { notes: 'After approval' }
  });
  assert.equal(rel2.status, 201);
  assert.equal(rel2.data.release.tag, 'l10n-v2');

  const rb = await callHandler(app.adminHandler, '/api/admin/l10n/releases/1/activate', {
    method: 'POST', ...auth, body: {}
  });
  assert.equal(rb.status, 200);
  assert.equal(rb.data.tag, 'l10n-v1');

  // Upload localized SVG media and fetch publicly
  const svgBase64 = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" fill="#13785d"/></svg>').toString('base64');
  const up = await callHandler(app.adminHandler, '/api/admin/l10n/media/assets', {
    method: 'POST', ...auth, body: { slotKey: 'img.portal.hero_banner', locale: 'en', filename: 'hero-en.svg', dataBase64: svgBase64 }
  });
  assert.equal(up.status, 201);
  const pubImg = await callHandler(app.publicHandler, up.data.publicUrl, { origin: 'http://localhost:8080' });
  assert.equal(pubImg.status, 200);
  assert.equal(pubImg.headers['content-type'], 'image/svg+xml');
  assert.equal(pubImg.headers['content-security-policy'], "sandbox; default-src 'none'");
  assert.equal(pubImg.headers['x-content-type-options'], 'nosniff');

  // Online backup + restore-data schema verification accepts all 7 l10n_* tables
  const bkp = await callHandler(app.adminHandler, '/api/admin/system/backups', { method: 'POST', ...auth, body: {} });
  assert.equal(bkp.status, 201);
  const inspected = inspectDatabase(path.join(dir, 'backups', bkp.data.backup.filename));
  assert.equal(inspected.integrity, 'ok');
  assert.equal(inspected.foreignKeys, 'ok');
});

test('l10n-bundle.json and Wave 2 per-game dictionaries provide complete 8-locale coverage without lint blocks', () => {
  const hubRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1')), '..');
  const repoRoot = path.resolve(hubRoot, '..');
  const bundle = JSON.parse(fs.readFileSync(path.join(hubRoot, 'shared/locales/l10n-bundle.json'), 'utf8'));
  const wave2Ids = ['crazy-arcade', 'poly-bridge-2', 'project-zomboid', 'survivor-arena-g2', 'kingdom-rush'];

  for (const [key, row] of Object.entries(bundle.keys)) {
    for (const loc of LOCALES) {
      assert.equal(typeof row[loc], 'string', `Missing ${loc} for ${key}`);
      assert.ok(row[loc].trim().length > 0, `Empty ${loc} for ${key}`);
    }
  }

  const sharedLocale = fs.readFileSync(path.join(hubRoot, 'shared/locale.js'), 'utf8').replace(/\r\n/g, '\n');
  const platDict = {};
  const platCtx = { PlayHubLocale: { register: e => Object.assign(platDict, e) } };
  platCtx.globalThis = platCtx;
  vm.runInNewContext(fs.readFileSync(path.join(hubRoot, 'shared/locales/platform.js'), 'utf8'), platCtx);

  for (const id of wave2Ids) {
    const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'games', id, 'game.manifest.json'), 'utf8'));
    const gameLocale = fs.readFileSync(path.join(repoRoot, 'games', id, 'Web/vendor/playhub-locale.js'), 'utf8').replace(/\r\n/g, '\n');
    assert.equal(gameLocale, sharedLocale, `playhub-locale.js out of sync for ${id}`);

    const gameDict = {};
    const gameCtx = { PlayHubLocale: { register: e => Object.assign(gameDict, e) } };
    gameCtx.globalThis = gameCtx;
    vm.runInNewContext(fs.readFileSync(path.join(hubRoot, 'shared/locales', `${id}.js`), 'utf8'), gameCtx);

    for (const field of ['title', 'summary', 'instructions', 'rules']) {
      const ko = manifest[field]?.ko;
      assert.ok(ko, `Missing ${field}.ko in ${id}`);
      assert.ok(gameDict[ko]?.ko, `Missing ko in ${id}.js for ${id}.${field}`);
      for (const dict of [platDict, gameDict]) {
        assert.ok(dict[ko]?.en && dict[ko]?.ja, `Missing en/ja for ${id}.${field}`);
        assert.equal(dict[ko].en, manifest[field].en, `Manifest EN mismatch for ${id}.${field}`);
      }
    }
  }
});

test('validateOpenAiBaseUrl blocks non-HTTPS, credentials, localhost, metadata, and private IP ranges', async () => {
  assert.equal(validateOpenAiBaseUrl(''), 'https://api.openai.com/v1');
  assert.equal(validateOpenAiBaseUrl('https://custom.llm.invalid/v1/'), 'https://custom.llm.invalid/v1');

  for (const bad of [
    'http://api.openai.com/v1',
    'file:///etc/passwd',
    'https://user:pass@api.openai.com/v1',
    'https://api.openai.com/v1?foo=bar',
    'https://localhost/v1',
    'https://api.localhost/v1',
    'https://service.local/v1',
    'https://metadata.google.internal/computeMetadata/v1',
    'https://127.0.0.1/v1',
    'https://10.0.0.5/v1',
    'https://172.16.0.1/v1',
    'https://192.168.1.10/v1',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/v1',
    'https://[::ffff:127.0.0.1]/v1',
    'https://[fc00::1]/v1',
    'https://[fe80::1]/v1'
  ]) {
    assert.throws(() => validateOpenAiBaseUrl(bad), /INVALID_OPENAI_BASE_URL/, `Should reject ${bad}`);
  }

  let fetched = false;
  await assert.rejects(() => translateWithAi({
    provider: 'openai',
    baseUrl: 'https://169.254.169.254/v1',
    apiKey: 'SECRET_KEY',
    targetLocale: 'en',
    items: [{ key: 'portal.test.a', sourceText: '안녕' }],
    fetchImpl: async () => { fetched = true; return { ok: true, json: async () => ({}) }; }
  }), /INVALID_OPENAI_BASE_URL/);
  assert.equal(fetched, false);
});

test('SVG allowlist validation accepts static vector SVG and blocks XSS/XXE/external-URL bypasses', () => {
  const richSafeSvg = Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40">' +
    '<defs><linearGradient id="bg1" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#13785d"/><stop offset="100%" stop-color="#0a4a3a"/></linearGradient></defs>' +
    '<rect width="120" height="40" fill="url(#bg1)"/><text x="10" y="24" font-size="14">PlayHub</text></svg>'
  ).toString('base64');
  assert.equal(validateMediaUpload({ base64: richSafeSvg }).ext, 'svg');

  const bypasses = [
    '<svg xmlns="http://www.w3.org/2000/svg"><animate onbegin="alert(1)" attributeName="x" dur="1s"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><set attributeName="onmouseover" to="alert(1)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="&#x6a;avascript:alert(1)"><rect width="10" height="10"/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><use href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.invalid/p.png" width="10" height="10"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://evil.invalid/x.css);</style></svg>',
    '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>',
    '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="evil.xsl"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><svg:script>alert(1)</svg:script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="url(https://evil.invalid/x#a)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" style="fill:url(javascript:alert(1))"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg><script>alert(1)</script>'
  ];
  for (const payload of bypasses) {
    assert.throws(
      () => validateMediaUpload({ base64: Buffer.from(payload, 'utf8').toString('base64') }),
      /MEDIA_UNSAFE_SVG/,
      `Should reject SVG payload: ${payload}`
    );
  }
});

test('L10N API blocks body.baseUrl SSRF, rejects unknown AI providers with 422, and cleans up deleted/unregistered media', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-l10n-sec-'));
  const dataDir = path.join(dir, 'data');
  const creds = makeCreds('AdminPassphrase!2026');
  const fetchCalls = [];

  const app = createApp({
    dataDir, publicPort: 0, adminPort: 0,
    userBaseUrl: 'http://localhost:8080',
    adminBaseUrl: 'http://127.0.0.1:8081',
    userOrigins: ['http://localhost:8080'],
    adminOrigins: ['http://127.0.0.1:8081'],
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: false }
  }, {
    env: {
      ...process.env,
      PLAYHUB_L10N_OPENAI_API_KEY: 'SECRET_OPENAI_KEY',
      PLAYHUB_L10N_OPENAI_BASE_URL: 'https://trusted.llm.invalid/v1'
    },
    fetch: async (url, init) => {
      fetchCalls.push({ url, headers: init?.headers });
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"portal.sec.key":"Hello"}' } }] }) };
    }
  });
  t.after(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const init = await callHandler(app.adminHandler, '/api/admin/session');
  const login = await callHandler(app.adminHandler, '/api/admin/login', {
    method: 'POST', cookie: init.cookie, csrf: init.data.csrfToken,
    body: { username: 'admin', password: 'AdminPassphrase!2026' }
  });
  const auth = { cookie: login.cookie, csrf: login.data.csrfToken };

  const created = await callHandler(app.adminHandler, '/api/admin/l10n/strings', {
    method: 'POST', ...auth, body: { key: 'portal.sec.key', sourceText: '안녕' }
  });
  assert.equal(created.status, 201);

  // Unknown provider must return 422 instead of silently falling back to mock
  const badProv = await callHandler(app.adminHandler, '/api/admin/l10n/ai/translate', {
    method: 'POST', ...auth, body: { provider: 'bogus-provider', targetLocale: 'en', keys: ['portal.sec.key'] }
  });
  assert.equal(badProv.status, 422);
  assert.equal(badProv.data.error.code, 'INVALID_AI_PROVIDER');

  // Client-supplied body.baseUrl must be rejected (no SSRF / API key leak)
  const ssrfAttempt = await callHandler(app.adminHandler, '/api/admin/l10n/ai/translate', {
    method: 'POST', ...auth,
    body: { provider: 'openai', baseUrl: 'https://attacker.invalid/v1', targetLocale: 'en', keys: ['portal.sec.key'] }
  });
  assert.equal(ssrfAttempt.status, 422);
  assert.equal(ssrfAttempt.data.error.code, 'BASE_URL_OVERRIDE_NOT_ALLOWED');
  assert.equal(fetchCalls.length, 0);

  // Valid server-configured OpenAI baseUrl works
  const okOpenAi = await callHandler(app.adminHandler, '/api/admin/l10n/ai/translate', {
    method: 'POST', ...auth,
    body: { provider: 'openai', targetLocale: 'en', keys: ['portal.sec.key'] }
  });
  assert.equal(okOpenAi.status, 200);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://trusted.llm.invalid/v1/chat/completions');

  // Media serving CSP + shared reference deletion + orphan file blocking
  const svgBase64 = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="#13785d"/></svg>').toString('base64');
  const upEn = await callHandler(app.adminHandler, '/api/admin/l10n/media/assets', {
    method: 'POST', ...auth, body: { slotKey: 'img.portal.hero_banner', locale: 'en', filename: 'a.svg', dataBase64: svgBase64 }
  });
  assert.equal(upEn.status, 201);
  const upJa = await callHandler(app.adminHandler, '/api/admin/l10n/media/assets', {
    method: 'POST', ...auth, body: { slotKey: 'img.portal.hero_banner', locale: 'ja', filename: 'b.svg', dataBase64: svgBase64 }
  });
  assert.equal(upJa.status, 201);
  assert.equal(upEn.data.filename, upJa.data.filename);

  const mediaFilePath = path.join(dataDir, 'l10n-media', upEn.data.filename);
  assert.equal(fs.existsSync(mediaFilePath), true);

  // Admin media endpoint also sends sandbox CSP + nosniff
  const adminImg = await callHandler(app.adminHandler, upEn.data.adminUrl, auth);
  assert.equal(adminImg.status, 200);
  assert.equal(adminImg.headers['content-security-policy'], "sandbox; default-src 'none'");
  assert.equal(adminImg.headers['x-content-type-options'], 'nosniff');

  // Deleting en keeps file on disk while ja still references it
  const delEn = await callHandler(app.adminHandler, '/api/admin/l10n/media/assets/img.portal.hero_banner/en', {
    method: 'DELETE', ...auth, body: {}
  });
  assert.equal(delEn.status, 200);
  assert.equal(fs.existsSync(mediaFilePath), true);
  assert.equal((await callHandler(app.publicHandler, upEn.data.publicUrl, { origin: 'http://localhost:8080' })).status, 200);

  // Deleting last reference (ja) removes file from disk and blocks public & admin serving
  const delJa = await callHandler(app.adminHandler, '/api/admin/l10n/media/assets/img.portal.hero_banner/ja', {
    method: 'DELETE', ...auth, body: {}
  });
  assert.equal(delJa.status, 200);
  assert.equal(fs.existsSync(mediaFilePath), false);
  assert.equal((await callHandler(app.publicHandler, upEn.data.publicUrl, { origin: 'http://localhost:8080' })).status, 404);
  assert.equal((await callHandler(app.adminHandler, upEn.data.adminUrl, auth)).status, 404);

  // Orphan file on disk (not registered in DB) must NOT be served
  const orphanName = '0123456789abcdef01234567.svg';
  fs.writeFileSync(path.join(dataDir, 'l10n-media', orphanName), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.equal((await callHandler(app.publicHandler, `/api/l10n/media/${orphanName}`, { origin: 'http://localhost:8080' })).status, 404);
});

test('exportBundleToRepo preserves catalogDictionary, writes atomically, and rolls back activation on write failure', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-l10n-export-'));
  const dataDir = path.join(dir, 'data');
  const tempHub = path.join(dir, 'hub');
  const tempGames = path.join(dir, 'games');
  const put = (file, content) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content, 'utf8'); };

  put(path.join(tempHub, 'shared/locales/platform.js'), '/* platform-dict */\nPlayHubLocale.register({"플랫폼":{"ko":"플랫폼","en":"Platform"}});\n');
  put(path.join(tempHub, 'shared/locales/community.js'), '/* community-dict */\nPlayHubLocale.register({"커뮤니티":{"ko":"커뮤니티","en":"Community"}});\n');
  put(path.join(tempHub, 'shared/locales/l10n-bundle.json'), JSON.stringify({
    schemaVersion: 1, tag: 'l10n-v0', generatedAt: '2026-11-20T00:00:00.000Z',
    locales: LOCALES,
    keys: { 'portal.export.title': { ko: '테스트 제목', en: 'Test Title' } },
    meta: { 'portal.export.title': { contextId: 'general', description: '', maxChars: null, codeRefs: [] } },
    media: {}
  }, null, 2));
  put(path.join(tempHub, 'web/user/locale-data.js'), '/* initial-user */');
  put(path.join(tempHub, 'web/admin/locale-data.js'), '/* initial-admin */');
  put(path.join(tempGames, 'catalog.json'), JSON.stringify({ schemaVersion: 1, entries: [{ id: 'demo-game', path: 'demo-game', enabled: true }] }));
  put(path.join(tempGames, 'demo-game/game.manifest.json'), JSON.stringify({
    title: { ko: '데모 게임', en: 'Demo Game', ja: 'デモゲーム' },
    summary: { ko: '데모 요약', en: 'Demo Summary' }
  }));

  const creds = makeCreds('AdminPassphrase!2026');
  const app = createApp({
    dataDir, publicPort: 0, adminPort: 0,
    userBaseUrl: 'http://localhost:8080',
    adminBaseUrl: 'http://127.0.0.1:8081',
    userOrigins: ['http://localhost:8080'],
    adminOrigins: ['http://127.0.0.1:8081'],
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: false }
  }, { rootDir: tempHub, platformRoot: dir });
  t.after(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const init = await callHandler(app.adminHandler, '/api/admin/session');
  const login = await callHandler(app.adminHandler, '/api/admin/login', {
    method: 'POST', cookie: init.cookie, csrf: init.data.csrfToken,
    body: { username: 'admin', password: 'AdminPassphrase!2026' }
  });
  const auth = { cookie: login.cookie, csrf: login.data.csrfToken };

  // Release v1 with exportToRepo=true must match assembleSurfaceLocaleData and preserve catalogDictionary
  const rel1 = await callHandler(app.adminHandler, '/api/admin/l10n/releases', {
    method: 'POST', ...auth, body: { notes: 'v1 export', exportToRepo: true }
  });
  assert.equal(rel1.status, 201);
  const userLocaleJs = fs.readFileSync(path.join(tempHub, 'web/user/locale-data.js'), 'utf8');
  const adminLocaleJs = fs.readFileSync(path.join(tempHub, 'web/admin/locale-data.js'), 'utf8');
  const expectedSurface = assembleSurfaceLocaleData({ root: tempHub, webgames: tempGames }).surfaceLocaleData;
  assert.equal(userLocaleJs, expectedSurface);
  assert.equal(adminLocaleJs, expectedSurface);
  assert.ok(userLocaleJs.includes('/* platform-dict */'));
  assert.ok(userLocaleJs.includes('/* community-dict */'));
  assert.ok(userLocaleJs.includes('"데모 게임"'));
  assert.ok(userLocaleJs.includes('"Demo Summary"'));

  // Publish v2 without export (becomes active)
  const rel2 = await callHandler(app.adminHandler, '/api/admin/l10n/releases', {
    method: 'POST', ...auth, body: { notes: 'v2 snapshot only', exportToRepo: false }
  });
  assert.equal(rel2.status, 201);
  assert.equal(rel2.data.release.tag, 'l10n-v2');

  // Simulate atomic write failure on web/admin/locale-data.js by replacing it with a directory
  const prevBundleText = fs.readFileSync(path.join(tempHub, 'shared/locales/l10n-bundle.json'), 'utf8');
  const prevUserJs = fs.readFileSync(path.join(tempHub, 'web/user/locale-data.js'), 'utf8');
  fs.rmSync(path.join(tempHub, 'web/admin/locale-data.js'));
  fs.mkdirSync(path.join(tempHub, 'web/admin/locale-data.js'));

  // 1) Publish v3 with exportToRepo=true fails -> rolls back DB insert/activation and restores already-written files
  const rel3Fail = await callHandler(app.adminHandler, '/api/admin/l10n/releases', {
    method: 'POST', ...auth, body: { notes: 'v3 should rollback', exportToRepo: true }
  });
  assert.equal(rel3Fail.status, 500);
  assert.equal(rel3Fail.data.error.code, 'L10N_REPO_EXPORT_FAILED');
  assert.equal(fs.readFileSync(path.join(tempHub, 'shared/locales/l10n-bundle.json'), 'utf8'), prevBundleText);
  assert.equal(fs.readFileSync(path.join(tempHub, 'web/user/locale-data.js'), 'utf8'), prevUserJs);
  assert.equal(fs.readdirSync(path.join(tempHub, 'web/user')).some(f => f.includes('.tmp.')), false);

  const listAfterFail = await callHandler(app.adminHandler, '/api/admin/l10n/releases', auth);
  assert.equal(listAfterFail.data.releases.length, 2);
  assert.equal(listAfterFail.data.releases.find(r => r.isActive)?.tag, 'l10n-v2');

  // 2) Activate v1 with exportToRepo=true fails -> rolls back active release to v2
  const actFail = await callHandler(app.adminHandler, '/api/admin/l10n/releases/1/activate', {
    method: 'POST', ...auth, body: { exportToRepo: true }
  });
  assert.equal(actFail.status, 500);
  assert.equal(actFail.data.error.code, 'L10N_REPO_EXPORT_FAILED');
  const listAfterActFail = await callHandler(app.adminHandler, '/api/admin/l10n/releases', auth);
  assert.equal(listAfterActFail.data.releases.find(r => r.isActive)?.tag, 'l10n-v2');
});

test('repo l10n-bundle.json changes merge missing keys and untranslated slots into DB on startup and via import-bundle API without overwriting admin edits', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-l10n-merge-'));
  const dataDir = path.join(dir, 'data');
  const tempHub = path.join(dir, 'hub');
  const bundlePath = path.join(tempHub, 'shared/locales/l10n-bundle.json');
  fs.mkdirSync(path.dirname(bundlePath), { recursive: true });
  fs.writeFileSync(bundlePath, JSON.stringify({
    schemaVersion: 1, tag: 'seed-1', generatedAt: '2026-11-20T00:00:00.000Z',
    locales: LOCALES,
    keys: {
      'portal.merge.keep': { ko: '유지 테스트', en: 'Initial EN' }
    },
    meta: { 'portal.merge.keep': { contextId: 'general', description: '', maxChars: null, codeRefs: [] } },
    media: {}
  }, null, 2));

  const creds = makeCreds('AdminPassphrase!2026');
  const baseCfg = {
    dataDir, publicPort: 0, adminPort: 0,
    userBaseUrl: 'http://localhost:8080',
    adminBaseUrl: 'http://127.0.0.1:8081',
    userOrigins: ['http://localhost:8080'],
    adminOrigins: ['http://127.0.0.1:8081'],
    admin: { username: 'admin', passwordHash: creds.passwordHash, salt: creds.salt, localAutoLogin: false }
  };

  let app = createApp(baseCfg, { rootDir: tempHub, platformRoot: dir });
  t.after(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const loginAs = async handler => {
    const init = await callHandler(handler, '/api/admin/session');
    const login = await callHandler(handler, '/api/admin/login', {
      method: 'POST', cookie: init.cookie, csrf: init.data.csrfToken,
      body: { username: 'admin', password: 'AdminPassphrase!2026' }
    });
    return { cookie: login.cookie, csrf: login.data.csrfToken };
  };
  const auth = await loginAs(app.adminHandler);

  // Admin customizes en (approved) and sets fr (ai_draft), leaving ja untranslated
  const editRes = await callHandler(app.adminHandler, '/api/admin/l10n/strings/portal.merge.keep', {
    method: 'PUT', ...auth,
    body: {
      translations: {
        en: { value: 'Admin Edited EN', status: 'approved' },
        fr: { value: 'Admin Draft FR', status: 'ai_draft' }
      }
    }
  });
  assert.equal(editRes.status, 200);

  // Simulate git pull adding translations and a new key to l10n-bundle.json
  fs.writeFileSync(bundlePath, JSON.stringify({
    schemaVersion: 1, tag: 'seed-2', generatedAt: '2026-11-21T00:00:00.000Z',
    locales: LOCALES,
    keys: {
      'portal.merge.keep': { ko: '유지 테스트', en: 'Repo Should Not Overwrite', ja: 'リポ日本語', fr: 'Repo Should Not Overwrite FR' },
      'portal.merge.added': { ko: '신규 번들 키', en: 'Added Bundle Key', ja: '追加キー' }
    },
    meta: {},
    media: {}
  }, null, 2));

  // Explicit admin API merge
  const imp = await callHandler(app.adminHandler, '/api/admin/l10n/import-bundle', {
    method: 'POST', ...auth, body: {}
  });
  assert.equal(imp.status, 200);
  assert.equal(imp.data.keysAdded, 1);
  assert.equal(imp.data.translationsFilled, 3); // ja on keep + en, ja on added

  const list1 = await callHandler(app.adminHandler, '/api/admin/l10n/strings?limit=50', auth);
  const keep1 = list1.data.items.find(i => i.key === 'portal.merge.keep');
  const added1 = list1.data.items.find(i => i.key === 'portal.merge.added');
  assert.equal(keep1.translations.en.value, 'Admin Edited EN');
  assert.equal(keep1.translations.fr.value, 'Admin Draft FR');
  assert.equal(keep1.translations.fr.status, 'ai_draft');
  assert.equal(keep1.translations.ja.value, 'リポ日本語');
  assert.equal(keep1.translations.ja.status, 'approved');
  assert.equal(added1.translations.en.value, 'Added Bundle Key');
  assert.equal(added1.translations.ja.value, '追加キー');

  // Close and restart with another new key in repo bundle -> merged automatically on startup
  await app.close();
  fs.writeFileSync(bundlePath, JSON.stringify({
    schemaVersion: 1, tag: 'seed-3', generatedAt: '2026-11-21T01:00:00.000Z',
    locales: LOCALES,
    keys: {
      'portal.merge.keep': { ko: '유지 테스트', en: 'Still Must Not Overwrite', ja: 'リポ日本語' },
      'portal.merge.added': { ko: '신규 번들 키', en: 'Added Bundle Key', ja: '追加キー' },
      'portal.merge.startup': { ko: '기동 병합 키', en: 'Startup Merged Key' }
    },
    meta: {},
    media: {}
  }, null, 2));

  app = createApp(baseCfg, { rootDir: tempHub, platformRoot: dir });
  const auth2 = await loginAs(app.adminHandler);
  const list2 = await callHandler(app.adminHandler, '/api/admin/l10n/strings?limit=50', auth2);
  assert.equal(list2.data.items.find(i => i.key === 'portal.merge.keep').translations.en.value, 'Admin Edited EN');
  assert.equal(list2.data.items.find(i => i.key === 'portal.merge.startup').translations.en.value, 'Startup Merged Key');
});
