import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scryptSync } from 'node:crypto';
import { createApp } from '../server/app.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const userOrigin = 'http://127.0.0.1:8080';
const adminOrigin = 'http://127.0.0.1:8081';

class Client {
  constructor(port, origin) {
    this.port = port;
    this.origin = origin;
    this.jar = new Map();
    this.csrf = null;
  }

  headers(method, hasBody, extra = {}) {
    const headers = { Origin: this.origin, ...extra };
    if (this.jar.size) headers.Cookie = [...this.jar.values()].join('; ');
    if (hasBody) headers['Content-Type'] = 'application/json';
    if (this.csrf && method !== 'GET') headers['X-CSRF-Token'] = this.csrf;
    return headers;
  }

  async call(target, { method = 'GET', body, headers = {} } = {}) {
    const response = await fetch('http://127.0.0.1:' + this.port + target, {
      method,
      headers: this.headers(method, body !== undefined, headers),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const value of response.headers.getSetCookie()) {
      const token = value.split(';')[0];
      this.jar.set(token.split('=')[0], token);
    }
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (data.csrfToken) this.csrf = data.csrfToken;
      return { status: response.status, headers: response.headers, data };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, bytes };
  }
}

async function createFixture(t, configOverrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-avatar-dual-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(path.join(root, 'catalog'));
  fs.writeFileSync(
    path.join(root, 'catalog/games.json'),
    JSON.stringify({ schemaVersion: 1, entries: [{ id: 'demo', path: 'games/demo', enabled: true }] })
  );
  fs.mkdirSync(path.join(root, 'games/demo'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'games/demo/game.manifest.json'),
    JSON.stringify({ id: 'demo', entry: 'index.html', title: { ko: '데모', en: 'Demo' } })
  );
  const salt = 'b'.repeat(32);
  const config = {
    publicHost: '127.0.0.1',
    publicPort: 0,
    adminHost: '127.0.0.1',
    adminPort: 0,
    dataDir,
    userOrigins: [userOrigin],
    adminOrigins: [adminOrigin],
    userBaseUrl: userOrigin,
    publicBaseUrl: 'http://127.0.0.1:8090',
    secureCookies: false,
    admin: { username: 'admin', salt, passwordHash: scryptSync('test-pass', salt, 64).toString('hex') },
    ...configOverrides,
  };
  const app = createApp(config, { rootDir: root, platformRoot: repoRoot });
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  const { public: pub } = await app.listen();
  return { root, app, port: pub.port };
}

test('Dual-Runtime Avatar Preview: render-profile.v1 contract, L9 studio tickets, and cloud web guard', async (t) => {
  const { port } = await createFixture(t);
  const client = new Client(port, userOrigin);

  const sess = await client.call('/api/session');
  assert.equal(sess.status, 200);

  // 1. Canonical render-profile.v1 & previewModes exposed on catalog + /render-profile
  const cat = await client.call('/api/avatar/catalog');
  assert.equal(cat.status, 200);
  assert.equal(cat.data.previewModes?.web, 'web-js');
  assert.equal(cat.data.previewModes?.desktop, 'godot-runtime');
  assert.equal(cat.data.renderProfile?.profileId, 'playhub_studio_v1');
  assert.equal(cat.data.renderProfile?.tonemapping, 'aces');
  assert.equal(cat.data.renderProfile?.backgroundHex, '#10231e');
  assert.ok(cat.data.renderProfile?.lights?.key?.direction?.length === 3);
  assert.ok(cat.data.renderProfile?.cameras?.full_body?.fovDeg > 0);
  assert.ok(cat.data.renderProfile?.cameras?.bust?.fovDeg > 0);
  assert.ok(cat.data.renderProfile?.cameras?.face?.fovDeg > 0);
  assert.ok(cat.data.renderProfile?.budgets?.skinMaxBones >= 41);

  const rp = await client.call('/api/avatar/render-profile');
  assert.equal(rp.status, 200);
  assert.deepEqual(rp.data.renderProfile, cat.data.renderProfile);

  // 2. L9 Desktop Avatar Studio single-use launch ticket issuance + exchange + binding + replay checks
  const issued = await client.call('/api/avatar/studio/ticket', {
    method: 'POST',
    body: {
      os: 'windows',
      arch: 'x86_64',
      camera: 'PortraitUpper',
      loadout: { skinId: 'skin_mage', attachments: { head: 'acc_wizard_hat' } },
    },
  });
  assert.equal(issued.status, 200);
  assert.equal(issued.data.ok, true);
  assert.equal(issued.data.version, 1);
  assert.equal(issued.data.singleUse, true);
  assert.ok(issued.data.ttlSec > 0 && issued.data.ttlSec <= 60);
  assert.equal(issued.data.gameId, 'avatar-studio');
  assert.match(issued.data.deepLink, /^playhub:\/\/avatar-studio\?ticket=[A-Za-z0-9_-]{32,}$/);

  // Optional native Rust bootstrapper parse-deeplink verification when built
  const bootstrapperBin = path.join(repoRoot, 'native', 'target', 'release', process.platform === 'win32' ? 'playhub-bootstrapper.exe' : 'playhub-bootstrapper');
  if (fs.existsSync(bootstrapperBin)) {
    const raw = execFileSync(bootstrapperBin, ['parse-deeplink', issued.data.deepLink], { encoding: 'utf8' });
    const parsed = JSON.parse(raw);
    assert.equal(parsed.scheme, 'playhub');
    assert.equal(parsed.action, 'avatar-studio');
    assert.equal(parsed.ticket, issued.data.ticket);
  }

  // Wrong OS binding rejected with 403
  const wrongOs = await client.call('/api/avatar/studio/exchange', {
    method: 'POST',
    body: { ticket: issued.data.ticket, gameId: 'avatar-studio', os: 'macos', arch: 'x86_64' },
  });
  assert.equal(wrongOs.status, 403);
  assert.equal(wrongOs.data.error?.code, 'TICKET_BINDING_MISMATCH');

  // Valid exchange succeeds once
  const exchanged = await client.call('/api/avatar/studio/exchange', {
    method: 'POST',
    body: { ticket: issued.data.ticket, gameId: 'avatar-studio', os: 'windows', arch: 'x86_64' },
  });
  assert.equal(exchanged.status, 200);
  assert.equal(exchanged.data.ok, true);
  assert.equal(exchanged.data.gameId, 'avatar-studio');
  assert.ok(exchanged.data.sessionToken);
  assert.match(exchanged.data.corePackUrl, /^\/api\/avatar\/runtime\/core\.pck\?v=/);
  assert.equal(exchanged.data.camera, 'PortraitUpper');
  assert.equal(exchanged.data.loadout?.skinId, 'skin_mage');
  assert.equal(exchanged.data.renderProfile?.profileId, 'playhub_studio_v1');

  // Replay rejected with 409
  const replay = await client.call('/api/avatar/studio/exchange', {
    method: 'POST',
    body: { ticket: issued.data.ticket, gameId: 'avatar-studio', os: 'windows', arch: 'x86_64' },
  });
  assert.equal(replay.status, 409);
  assert.equal(replay.data.error?.code, 'TICKET_REPLAY');

  // Unknown ticket rejected with 401
  const unknown = await client.call('/api/avatar/studio/exchange', {
    method: 'POST',
    body: { ticket: 'unknown_ticket_value_0123456789abcdef', gameId: 'avatar-studio', os: 'windows', arch: 'x86_64' },
  });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.data.error?.code, 'TICKET_UNKNOWN');
});

test('Cloud Public Web Guard: desktop Godot preview endpoints are strictly disabled when allowDesktopGodotPreview=false', async (t) => {
  const { port } = await createFixture(t, { avatar: { allowDesktopGodotPreview: false } });
  const client = new Client(port, userOrigin);
  await client.call('/api/session');

  const status = await client.call('/api/avatar/desktop-preview/status');
  assert.equal(status.status, 200);
  assert.equal(status.data.desktopPreviewEnabled, false);
  assert.equal(status.data.available, false);

  const render = await client.call('/api/avatar/desktop-preview/render', {
    method: 'POST',
    body: { loadout: { skinId: 'skin_knight' }, camera: 'TPS' },
  });
  assert.equal(render.status, 403);
  assert.equal(render.data.error?.code, 'DESKTOP_PREVIEW_DISABLED');

  const openWin = await client.call('/api/avatar/desktop-preview/open-window', {
    method: 'POST',
    body: { loadout: { skinId: 'skin_knight' }, camera: 'TPS' },
  });
  assert.equal(openWin.status, 403);
  assert.equal(openWin.data.error?.code, 'DESKTOP_PREVIEW_DISABLED');
});

test('Desktop App Godot 4.7.2 Runtime Preview Worker: renders real GPU PNGs with skin/camera/emote fidelity', async (t) => {
  const { port } = await createFixture(t, { avatar: { allowDesktopGodotPreview: true } });
  const client = new Client(port, userOrigin);
  await client.call('/api/session');

  const status = await client.call('/api/avatar/desktop-preview/status');
  assert.equal(status.status, 200);
  if (!status.data.available) {
    t.skip('Godot 4.7.2 desktop binary not present on this machine');
    return;
  }

  // 1. Default Knight + Quiver (TPS)
  const r1 = await client.call('/api/avatar/desktop-preview/render', {
    method: 'POST',
    body: {
      loadout: { skinId: 'skin_knight', attachments: { back: 'acc_quiver' } },
      camera: 'TPS',
      width: 440,
      height: 484,
    },
  });
  assert.equal(r1.status, 200);
  assert.equal(r1.headers.get('content-type'), 'image/png');
  assert.equal(r1.headers.get('x-playhub-avatar-renderer'), 'godot-runtime');
  assert.equal(r1.headers.get('x-playhub-render-profile'), 'playhub_studio_v1');
  assert.equal(r1.headers.get('x-playhub-skin-id'), 'skin_knight');
  assert.ok(Number(r1.headers.get('x-playhub-bone-count')) >= 41, 'Knight must have >=41 bones');
  assert.ok(Number(r1.headers.get('x-playhub-animation-count')) >= 70, 'Knight must have >=70 animations');
  assert.equal(r1.bytes.readUInt32BE(0), 0x89504e47, 'Response must be a valid PNG');
  assert.ok(r1.bytes.length > 8000, `Expected non-blank Godot PNG (>8KB), got ${r1.bytes.length} bytes`);

  // 2. Mage + Wizard Hat + Staff (PortraitUpper)
  const r2 = await client.call('/api/avatar/desktop-preview/render', {
    method: 'POST',
    body: {
      loadout: { skinId: 'skin_mage', attachments: { head: 'acc_wizard_hat', hand_r: 'acc_wizard_staff' } },
      camera: 'PortraitUpper',
      width: 440,
      height: 484,
    },
  });
  assert.equal(r2.status, 200);
  assert.equal(r2.headers.get('x-playhub-skin-id'), 'skin_mage');
  assert.equal(r2.bytes.readUInt32BE(0), 0x89504e47);
  assert.notEqual(Buffer.compare(r1.bytes, r2.bytes), 0, 'Mage PortraitUpper PNG must visually differ from Knight TPS');

  // 3. Emote animation seeking (`emote_cheer` at t=0.0 vs t=0.55)
  const r3a = await client.call('/api/avatar/desktop-preview/render', {
    method: 'POST',
    body: {
      loadout: { skinId: 'skin_knight', attachments: { back: 'acc_quiver' } },
      camera: 'TPS',
      emoteId: 'emote_cheer',
      animTimeSec: 0.0,
      width: 440,
      height: 484,
    },
  });
  const r3b = await client.call('/api/avatar/desktop-preview/render', {
    method: 'POST',
    body: {
      loadout: { skinId: 'skin_knight', attachments: { back: 'acc_quiver' } },
      camera: 'TPS',
      emoteId: 'emote_cheer',
      animTimeSec: 0.55,
      width: 440,
      height: 484,
    },
  });
  assert.equal(r3a.status, 200);
  assert.equal(r3b.status, 200);
  assert.notEqual(Buffer.compare(r3a.bytes, r3b.bytes), 0, 'Godot emote animation frames at t=0.0 and t=0.55 must differ');
});
