import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scryptSync } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { createBackup } from '../tools/backup.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-avatar-'));
  const dataDir = path.join(root, 'data');
  const configPath = path.join(root, 'config.json');
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
  const salt = 'a'.repeat(32);
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
  fs.writeFileSync(configPath, JSON.stringify(config));
  const app = createApp(config, { rootDir: root, platformRoot: repoRoot });
  t.after(async () => {
    await app.close();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  });
  const { public: pub } = await app.listen();
  return { root, dataDir, configPath, app, port: pub.port };
}

test('Avatar Shop & Locker E2E: catalog, GLB serving, PlayCoin 3-bucket topup/purchase, loadout validation, and backup/restore compatibility', async (t) => {
  const { root, dataDir, configPath, port } = await createFixture(t, { avatar: { allowMockTopup: true } });
  const client = new Client(port, userOrigin);

  // 1. Session bootstrap
  const sess = await client.call('/api/session');
  assert.equal(sess.status, 200);
  assert.ok(client.csrf);

  // 2. Catalog & binary GLB serving (10 skins + 20 attachments + 8 emotes)
  const cat = await client.call('/api/avatar/catalog');
  assert.equal(cat.status, 200);
  assert.equal(cat.data.ok, true);
  assert.equal(cat.data.currency, 'PlayCoin');
  assert.equal(cat.data.items.filter((i) => i.category === 'skin').length, 10);
  assert.equal(cat.data.items.filter((i) => i.category === 'attachment').length, 20);
  assert.equal(cat.data.items.filter((i) => i.category === 'emote').length, 8);

  // 2b. Layer 2 shared modular runtime manifest & core.pck (must be lightweight with 0 GLB binaries)
  const runtimeManifest = await client.call('/api/avatar/runtime/manifest');
  assert.equal(runtimeManifest.status, 200);
  assert.equal(runtimeManifest.data.ok, true);
  assert.equal(runtimeManifest.data.packaging, '4-layer-modular');
  assert.equal(runtimeManifest.data.assetCount, 30);
  assert.equal(runtimeManifest.data.corePack.containsGlbBinaries, false);
  assert.ok(runtimeManifest.data.corePack.bytes < 256 * 1024, `core.pck should stay tiny (<256KB), got ${runtimeManifest.data.corePack.bytes}`);
  const corePck = await client.call('/api/avatar/runtime/core.pck');
  assert.equal(corePck.status, 200);
  assert.equal(corePck.bytes.readUInt32LE(0), 0x43504447, 'core.pck must have Godot GDPC magic');
  assert.match(corePck.headers.get('cache-control') || '', /immutable/);

  const skinGlb = await client.call('/api/avatar/assets/skins/Knight.glb');
  assert.equal(skinGlb.status, 200);
  assert.equal(skinGlb.headers.get('content-type'), 'model/gltf-binary');
  assert.equal(skinGlb.headers.get('x-content-options') || skinGlb.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(skinGlb.bytes.readUInt32LE(0), 0x46546c67, 'Knight.glb must have glTF binary magic');

  const accGlb = await client.call('/api/avatar/assets/accessories/crown_gold.glb');
  assert.equal(accGlb.status, 200);
  assert.equal(accGlb.bytes.readUInt32LE(0), 0x46546c67, 'crown_gold.glb must have glTF binary magic');

  const badTraversal = await client.call('/api/avatar/assets/skins/..%2Fcatalog.json');
  assert.equal(badTraversal.status, 404);

  // 3. Initial wallet & loadout
  const me0 = await client.call('/api/avatar/me');
  assert.equal(me0.status, 200);
  assert.equal(me0.data.wallet.total, 250);
  assert.equal(me0.data.wallet.promo, 250);
  assert.equal(me0.data.loadout.skinId, 'skin_knight');
  assert.equal(me0.data.loadout.immutableInForge, true);
  assert.match(me0.data.loadout.signature, /^[a-f0-9]{64}$/);

  // 4. Buying expensive skin (300) before topup fails with 402
  const failBuy = await client.call('/api/avatar/purchase', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'buy-mage-fail-1' },
    body: { itemId: 'skin_mage' },
  });
  assert.equal(failBuy.status, 402);
  assert.equal(failBuy.data.error.code, 'INSUFFICIENT_PLAYCOIN');

  // 5. Top-up pack_500 (+500 paid + 50 bonus = +550 -> 800 total) + idempotency check
  const top1 = await client.call('/api/avatar/wallet/topup', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'topup-key-001' },
    body: { packId: 'pack_500' },
  });
  assert.equal(top1.status, 200);
  assert.equal(top1.data.replayed, false);
  assert.equal(top1.data.wallet.paid, 500);
  assert.equal(top1.data.wallet.bonus, 50);
  assert.equal(top1.data.wallet.promo, 250);
  assert.equal(top1.data.wallet.total, 800);

  const topReplay = await client.call('/api/avatar/wallet/topup', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'topup-key-001' },
    body: { packId: 'pack_500' },
  });
  assert.equal(topReplay.status, 200);
  assert.equal(topReplay.data.replayed, true);
  assert.equal(topReplay.data.wallet.total, 800);

  // 6. Purchase skin_mage (300): spends 250 promo + 50 bonus + 0 paid = 500 remaining paid!
  const buyMage = await client.call('/api/avatar/purchase', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'buy-mage-ok-1' },
    body: { itemId: 'skin_mage' },
  });
  assert.equal(buyMage.status, 200);
  assert.equal(buyMage.data.replayed, false);
  assert.deepEqual(buyMage.data.purchased.spent, { promo: 250, bonus: 50, paid: 0 });
  assert.equal(buyMage.data.wallet.total, 500);
  assert.equal(buyMage.data.wallet.paid, 500);

  // Replay purchase does not double-charge
  const buyMageReplay = await client.call('/api/avatar/purchase', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'buy-mage-ok-1' },
    body: { itemId: 'skin_mage' },
  });
  assert.equal(buyMageReplay.status, 200);
  assert.equal(buyMageReplay.data.replayed, true);
  assert.equal(buyMageReplay.data.wallet.total, 500);

  // Duplicate purchase with fresh key fails with 409 ALREADY_OWNED
  const dupBuy = await client.call('/api/avatar/purchase', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'buy-mage-dup-2' },
    body: { itemId: 'skin_mage' },
  });
  assert.equal(dupBuy.status, 409);
  assert.equal(dupBuy.data.error.code, 'ALREADY_OWNED');

  // Buy head attachment (250) + emote (200)
  const buyCrown = await client.call('/api/avatar/purchase', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'buy-crown-1' },
    body: { itemId: 'acc_crown_gold' },
  });
  assert.equal(buyCrown.status, 200);
  assert.equal(buyCrown.data.wallet.total, 250);

  const buyDance = await client.call('/api/avatar/purchase', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'buy-dance-1' },
    body: { itemId: 'emote_dance' },
  });
  assert.equal(buyDance.status, 200);
  assert.equal(buyDance.data.wallet.total, 50);

  // 7. Loadout security & validation
  const unownedEquip = await client.call('/api/avatar/loadout', {
    method: 'PUT',
    body: { skinId: 'skin_barbarian' },
  });
  assert.equal(unownedEquip.status, 403);
  assert.equal(unownedEquip.data.error.code, 'ITEM_NOT_OWNED');

  const wrongSlot = await client.call('/api/avatar/loadout', {
    method: 'PUT',
    body: { attachments: { head: 'acc_sword_1h' } },
  });
  assert.equal(wrongSlot.status, 422);
  assert.equal(wrongSlot.data.error.code, 'INVALID_ATTACHMENT_SLOT');

  const equipOk = await client.call('/api/avatar/loadout', {
    method: 'PUT',
    body: {
      skinId: 'skin_mage',
      attachments: { head: 'acc_crown_gold', back: 'acc_quiver', hand_r: 'acc_sword_1h', hand_l: null },
      emoteWheel: ['emote_dance', 'emote_cheer', 'emote_wave', null],
    },
  });
  assert.equal(equipOk.status, 200);
  assert.equal(equipOk.data.loadout.skinId, 'skin_mage');
  assert.equal(equipOk.data.loadout.attachments.head, 'acc_crown_gold');
  assert.equal(equipOk.data.loadout.emoteWheel[0], 'emote_dance');
  assert.equal(equipOk.data.loadout.skinAssetUrl, '/api/avatar/assets/skins/Mage.glb');
  assert.notEqual(equipOk.data.loadout.signature, me0.data.loadout.signature);

  // Verify GET /api/avatar/loadout reflects saved loadout
  const fetched = await client.call('/api/avatar/loadout');
  assert.equal(fetched.status, 200);
  assert.equal(fetched.data.loadout.skinId, 'skin_mage');
  assert.equal(fetched.data.loadout.signature, equipOk.data.loadout.signature);

  // 8. Backup & restore-data schema verification (OPTIONAL_TABLES)
  const backup = await createBackup({ configPath, out: path.join(root, 'snapshot.sqlite') });
  const dbCheck = inspectDatabase(backup.path);
  assert.equal(dbCheck.integrity, 'ok', `restore-data inspectDatabase failed: ${JSON.stringify(dbCheck)}`);
  assert.ok(fs.existsSync(path.join(dataDir, 'platform.sqlite')));
});

test('POST /api/avatar/wallet/topup is blocked with 403 TOPUP_DISABLED unless config.avatar.allowMockTopup === true', async (t) => {
  const { port } = await createFixture(t);
  const client = new Client(port, userOrigin);

  const sess = await client.call('/api/session');
  assert.equal(sess.status, 200);

  const blocked = await client.call('/api/avatar/wallet/topup', {
    method: 'POST',
    headers: { 'Idempotency-Key': 'topup-blocked-001' },
    body: { packId: 'pack_500' },
  });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.error.code, 'TOPUP_DISABLED');

  const me = await client.call('/api/avatar/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.wallet.paid, 0);
  assert.equal(me.data.wallet.bonus, 0);
  assert.equal(me.data.wallet.total, 250);
});

test('Avatar service degrades safely with 503 AVATAR_CATALOG_UNAVAILABLE when catalog.json is missing', async (t) => {
  const { port } = await createFixture(t, {
    avatar: { addonDir: path.join(os.tmpdir(), 'playhub-nonexistent-avatar-addon') },
  });
  const client = new Client(port, userOrigin);

  // Core Hub endpoints keep working normally
  const sess = await client.call('/api/session');
  assert.equal(sess.status, 200);

  const cat = await client.call('/api/avatar/catalog');
  assert.equal(cat.status, 503);
  assert.equal(cat.data.error.code, 'AVATAR_CATALOG_UNAVAILABLE');
});
