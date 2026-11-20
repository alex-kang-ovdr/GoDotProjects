import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { randomBytes, scryptSync } from 'node:crypto';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createApp } from '../server/app.mjs';

function makeAdminCreds(password) {
  const salt = randomBytes(16).toString('hex');
  return { salt, passwordHash: scryptSync(password, salt, 64).toString('hex') };
}

const adminContractsCtx = vm.createContext({ module: { exports: {} } });
vm.runInContext(fs.readFileSync(new URL('../web/admin/contracts.js', import.meta.url), 'utf8'), adminContractsCtx);
const Contracts = adminContractsCtx.module.exports;

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
  let rawBody = '';
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
      if (chunk) rawBody += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      this.headersSent = true;
    }
  };
  const done = handler(req, res);
  if (body !== undefined) req.end(JSON.stringify(body));
  else req.end();
  await done;
  const setCookies = headers['set-cookie'] ? (Array.isArray(headers['set-cookie']) ? headers['set-cookie'] : [headers['set-cookie']]) : [];
  const nextCookie = setCookies.map(c => c.split(';')[0]).join('; ');
  return { status: res.statusCode, headers, cookie: nextCookie || cookie, data: rawBody ? JSON.parse(rawBody) : null };
}

test('admin routing resolves ?tab=system&view=release-policy and index.html exposes system-release-policy-panel', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(Contracts.ADMIN_TABS.map(t => t.id))), ['system', 'hub', 'forge', 'qa', 'l10n', 'store']);
  assert.deepEqual(JSON.parse(JSON.stringify(Contracts.resolveAdminRoute('?tab=system&view=release-policy', ''))), {
    tab: 'system',
    view: 'release-policy',
    fromLegacyHash: false
  });
  const html = fs.readFileSync(new URL('../web/admin/index.html', import.meta.url), 'utf8');
  assert.ok(html.includes('id="system-release-policy-panel"'));
  const adminJs = fs.readFileSync(new URL('../web/admin/admin.js', import.meta.url), 'utf8');
  assert.ok(adminJs.includes('renderSystemReleasePolicy'));
  assert.ok(adminJs.includes('/api/admin/release-policy'));
});

test('renderSystemReleasePolicy renders 6-target force/optional controls and drain pool form cleanly', async () => {
  const { renderSystemReleasePolicy } = await import('../web/admin/domain-views.js');
  class FakeNode {
    constructor(tag) {
      this.tag = tag;
      this.textContent = '';
      this.className = '';
      this.dataset = {};
      this.children = [];
      this.listeners = {};
    }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = [...nodes]; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
  }
  const makeNode = (tag) => new FakeNode(tag);
  const prevDoc = globalThis.document;
  const prevNode = globalThis.Node;
  globalThis.Node = FakeNode;
  globalThis.document = { createElement: makeNode };
  try {
    const container = makeNode('section');
    const savedCalls = [];
    renderSystemReleasePolicy(
      container,
      {
        buildInfo: {
          buildId: 'hub-v0.3.0-20261121-0200-playhub-platform-ga3e1aef-b10',
          buildCode: 2026112101,
          semver: '0.3.0',
          channel: 'live',
          compat: { engineAbi: 'godot-4.7', engineApiRev: 1, netProtocol: '1.0', gameplayHash: 'default' }
        },
        policy: {
          revision: 3,
          defaultUpdatePolicy: 'optional',
          updatedAtUtc: '2026-11-21T02:00:00Z',
          updatedBy: 'opsadmin',
          targets: {
            aos: { updatePolicy: 'force', latestBuildCode: 2026112101, minBuildCode: 2026112100, graceMinutes: 15, storeUrl: 'https://play.google.com/store', notice: '필수 업데이트' },
            ios: { updatePolicy: 'optional', latestBuildCode: 2026112101, minBuildCode: 0, graceMinutes: 10, storeUrl: null, notice: '' }
          },
          activePools: [{ poolId: 'drain-v1', gameplayHash: 'rules-v1', endpoint: 'wss://legacy.example/ws', expiresAtUtc: '2026-11-22T00:00:00Z' }]
        }
      },
      {
        kstStamp: v => v,
        onSavePolicy: async (patch, label) => { savedCalls.push({ patch, label }); }
      }
    );
    assert.equal(container.children.length, 3);
    const collectTestIds = (node, out = new Set()) => {
      if (!node || typeof node !== 'object') return out;
      if (node.dataset?.testid) out.add(node.dataset.testid);
      for (const ch of node.children || []) collectTestIds(ch, out);
      return out;
    };
    const ids = collectTestIds(container);
    for (const target of ['aos', 'ios', 'forge-desktop', 'forge-web', 'hub', 'godot-server']) {
      assert.ok(ids.has(`target-policy-${target}`), `missing policy select for ${target}`);
      assert.ok(ids.has(`target-grace-${target}`), `missing grace input for ${target}`);
    }
    assert.ok(ids.has('preset-all-optional'));
    assert.ok(ids.has('preset-mobile-force'));
    assert.ok(ids.has('preset-all-force'));
    assert.ok(ids.has('release-policy-save-btn'));
    assert.ok(ids.has('remove-pool-drain-v1'));
    assert.ok(ids.has('pool-add-btn'));
  } finally {
    globalThis.document = prevDoc;
    globalThis.Node = prevNode;
  }
});

test('admin release-policy API integrates with Admin session, CSRF, and system audit domain', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-admin-relpol-'));
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const password = 'ReleasePolicy-Admin-2026!';
  const creds = makeAdminCreds(password);
  const platformRoot = path.resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  const app = createApp(
    {
      publicPort: 18992,
      adminPort: 18993,
      publicHost: '127.0.0.1',
      adminHost: '127.0.0.1',
      userOrigins: ['http://127.0.0.1:18982'],
      adminOrigins: ['http://127.0.0.1:8081'],
      userBaseUrl: 'http://127.0.0.1:18982',
      adminBaseUrl: 'http://127.0.0.1:8081',
      publicBaseUrl: 'http://127.0.0.1:18992',
      dataDir,
      secureCookies: false,
      admin: { username: 'admin', ...creds, localAutoLogin: false }
    },
    { rootDir: path.join(platformRoot, 'hub'), platformRoot }
  );
  t.after(async () => {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const init = await callHandler(app.adminHandler, '/api/admin/session');
  const login = await callHandler(app.adminHandler, '/api/admin/login', {
    method: 'POST',
    cookie: init.cookie,
    csrf: init.data.csrfToken,
    body: { username: 'admin', password }
  });
  const auth = { cookie: login.cookie, csrf: login.data.csrfToken };

  const getRes = await callHandler(app.adminHandler, '/api/admin/release-policy', auth);
  assert.equal(getRes.status, 200);
  assert.ok(getRes.data.buildInfo.buildId);
  assert.equal(getRes.data.policy.targets.aos.updatePolicy, 'optional');

  const postRes = await callHandler(app.adminHandler, '/api/admin/release-policy', {
    method: 'POST',
    ...auth,
    body: { forceTargets: ['aos', 'ios'] }
  });
  assert.equal(postRes.status, 200);
  assert.equal(postRes.data.policy.targets.aos.updatePolicy, 'force');
  assert.equal(postRes.data.policy.targets.ios.updatePolicy, 'force');
  assert.equal(postRes.data.policy.targets.hub.updatePolicy, 'optional');

  const auditRes = await callHandler(app.adminHandler, '/api/admin/audit?domain=system', auth);
  assert.equal(auditRes.status, 200);
  assert.ok(auditRes.data.audit.some(a => a.action === 'system_release_policy_update'));
});
