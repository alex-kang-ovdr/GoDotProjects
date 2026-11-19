import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createApp } from '../server/app.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';
import {
  lintTranslation,
  gatherPlatformTexts,
  translateWithAi,
  validateMediaUpload
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
  assert.equal(pubImg.headers['x-content-type-options'], 'nosniff');

  // Online backup + restore-data schema verification accepts all 7 l10n_* tables
  const bkp = await callHandler(app.adminHandler, '/api/admin/system/backups', { method: 'POST', ...auth, body: {} });
  assert.equal(bkp.status, 201);
  const inspected = inspectDatabase(path.join(dir, 'backups', bkp.data.backup.filename));
  assert.equal(inspected.integrity, 'ok');
  assert.equal(inspected.foreignKeys, 'ok');
});
