import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { openDatabase, transaction } from '../server/db.mjs';
import { ApiError } from '../server/security.mjs';
import { resolveAvatarAddonDir } from '../server/avatar/catalog.mjs';
import { createAvatarService, mergeGuestAvatar } from '../server/avatar/service.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const hubRoot = path.join(repoRoot, 'hub');

function createTestDb(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-avatar-unit-'));
  const db = openDatabase(dir);
  t.after(() => {
    try { db.close(); } catch {}
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });
  return db;
}

function seedUser(db, id, kind = 'guest', displayName = null, createdAt = 1700000000000) {
  db.prepare('INSERT INTO users(id,kind,display_name,created_at) VALUES(?,?,?,?)')
    .run(id, kind, displayName, createdAt);
}

function makeReqRes(method, pathname, bodyObj, headers = {}) {
  const payload = bodyObj === undefined ? '' : JSON.stringify(bodyObj);
  const req = Readable.from(payload ? [Buffer.from(payload, 'utf8')] : []);
  req.method = method;
  req.headers = {
    ...(bodyObj !== undefined ? { 'content-type': 'application/json' } : {}),
    ...headers,
  };
  let statusCode = 200;
  const resHeaders = new Map();
  let ended = '';
  const res = {
    get statusCode() { return statusCode; },
    set statusCode(v) { statusCode = v; },
    setHeader(k, v) { resHeaders.set(String(k).toLowerCase(), v); },
    getHeader(k) { return resHeaders.get(String(k).toLowerCase()); },
    end(chunk) { ended = chunk ? String(chunk) : ''; },
    get bodyJson() { return ended ? JSON.parse(ended) : null; },
  };
  return { req, res, url: new URL(`http://127.0.0.1:8090${pathname}`) };
}

function makeHarness(t, { config = {}, env = {} } = {}) {
  const db = createTestDb(t);
  let clock = 1730000000000;
  const now = () => clock;
  const advance = (ms) => { clock += ms; };
  const audits = [];
  const session = { id_hash: 'sess-hash-1', principal_id: 'u-guest-1' };
  seedUser(db, 'u-guest-1', 'guest', '게스트1', clock);

  const service = createAvatarService({
    config,
    db,
    rootDir: hubRoot,
    platformRoot: repoRoot,
    now,
    sessionFor: () => session,
    requireSession: () => session,
    promote: (s) => s,
    rate: () => {},
    audit: (action, target, detail) => audits.push({ action, target, detail }),
    env,
  });

  return { db, service, session, now, advance, audits };
}

test('Item 1: POST /api/avatar/wallet/topup returns 403 TOPUP_DISABLED by default and succeeds only with config.avatar.allowMockTopup === true', async (t) => {
  // Default (disabled)
  {
    const { service, db } = makeHarness(t, { config: {} });
    const { req, res, url } = makeReqRes(
      'POST',
      '/api/avatar/wallet/topup',
      { packId: 'pack_500' },
      { 'idempotency-key': 'topup-default-blocked' }
    );
    await assert.rejects(
      () => service.publicRoute(req, res, url),
      (err) => err instanceof ApiError && err.status === 403 && err.code === 'TOPUP_DISABLED'
    );
    const walletRow = db.prepare('SELECT * FROM avatar_wallets WHERE principal_id=?').get('u-guest-1');
    assert.equal(walletRow, undefined, 'Blocked topup must not create or credit wallet');
  }

  // Explicitly false (disabled)
  {
    const { service } = makeHarness(t, { config: { avatar: { allowMockTopup: false } } });
    const { req, res, url } = makeReqRes(
      'POST',
      '/api/avatar/wallet/topup',
      { packId: 'pack_500' },
      { 'idempotency-key': 'topup-false-blocked' }
    );
    await assert.rejects(
      () => service.publicRoute(req, res, url),
      (err) => err instanceof ApiError && err.status === 403 && err.code === 'TOPUP_DISABLED'
    );
  }

  // Explicit opt-in true (enabled)
  {
    const { service } = makeHarness(t, { config: { avatar: { allowMockTopup: true } } });
    const { req, res, url } = makeReqRes(
      'POST',
      '/api/avatar/wallet/topup',
      { packId: 'pack_500' },
      { 'idempotency-key': 'topup-optin-001' }
    );
    const handled = await service.publicRoute(req, res, url);
    assert.equal(handled, true);
    assert.equal(res.statusCode, 200);
    assert.equal(res.bodyJson.ok, true);
    assert.equal(res.bodyJson.wallet.paid, 500);
    assert.equal(res.bodyJson.wallet.bonus, 50);
    assert.equal(res.bodyJson.wallet.promo, 250);
    assert.equal(res.bodyJson.wallet.total, 800);
  }
});

test('Item 2: mergeGuestAvatar atomically merges 3-bucket wallet + ledger, inventory union, loadout fallback, and cleans source rows', async (t) => {
  const { db, service } = makeHarness(t, { config: { avatar: { allowMockTopup: true } } });
  const guestId = 'u-guest-1';
  const targetId = 'u-reg-1';
  seedUser(db, targetId, 'registered', '등록유저', 1730000000000);

  // Guest tops up pack_500 (+500 paid, +50 bonus, +250 promo = 800) and buys skin_mage (300) + acc_crown_gold (250)
  // Remaining guest wallet: paid=250, bonus=0, promo=0 (since 250 promo + 50 bonus spent on mage, 250 paid spent on crown)
  service.wallet.topUpPack(guestId, 'pack_500', 'guest-topup-1');
  service.purchaseItem(guestId, 'skin_mage', 'guest-buy-mage');
  service.purchaseItem(guestId, 'acc_crown_gold', 'guest-buy-crown');
  service.updateLoadout(guestId, {
    skinId: 'skin_mage',
    attachments: { head: 'acc_crown_gold', back: 'acc_quiver', hand_r: null, hand_l: null },
    emoteWheel: ['emote_cheer', 'emote_wave', null, null],
  }, '게스트1');

  // Target already has a wallet (250 promo + 1200 paid + 240 bonus) and already owns acc_crown_gold (duplicate!)
  service.wallet.topUpPack(targetId, 'pack_1200', 'target-topup-1');
  service.purchaseItem(targetId, 'acc_crown_gold', 'target-buy-crown');
  // Target after crown (250): promo=0, bonus=240, paid=1200

  const mergeIso = '2026-11-21T06:00:00.000Z';
  const summary = transaction(db, () => mergeGuestAvatar(db, guestId, targetId, mergeIso));

  assert.equal(summary.merged, true);
  assert.equal(summary.walletTransferred, true);
  assert.deepEqual(summary.transferredCoins, { paid: 250, bonus: 0, promo: 0 });
  assert.equal(summary.inventoryMerged, 1, 'skin_mage newly merged, duplicate acc_crown_gold ignored');
  assert.equal(summary.loadoutTransferred, true, 'target had no loadout so guest loadout transferred');

  // Verify target wallet summed 3 buckets
  const targetWallet = service.wallet.getWallet(targetId);
  assert.equal(targetWallet.paid, 1450);
  assert.equal(targetWallet.bonus, 240);
  assert.equal(targetWallet.promo, 0);
  assert.equal(targetWallet.total, 1690);

  // Verify ledger records transfer on both source and target
  const targetLedger = service.wallet.listLedger(targetId, 10);
  const mergeIn = targetLedger.find((e) => e.kind === 'guest_merge_in');
  assert.ok(mergeIn, 'target ledger must include guest_merge_in');
  assert.equal(mergeIn.refId, guestId);
  assert.equal(mergeIn.deltaPaid, 250);
  assert.equal(mergeIn.createdAt, mergeIso);

  const sourceLedger = service.wallet.listLedger(guestId, 10);
  const mergeOut = sourceLedger.find((e) => e.kind === 'guest_merge_out');
  assert.ok(mergeOut, 'source ledger must include guest_merge_out');
  assert.equal(mergeOut.refId, targetId);
  assert.equal(mergeOut.deltaPaid, -250);

  // Verify inventory union
  const targetInvIds = new Set(db.prepare('SELECT item_id FROM avatar_inventory WHERE principal_id=?').all(targetId).map((r) => r.item_id));
  assert.equal(targetInvIds.has('skin_mage'), true);
  assert.equal(targetInvIds.has('acc_crown_gold'), true);

  // Verify loadout transferred
  const targetLoadout = service.buildVerifiedLoadout(targetId, '등록유저');
  assert.equal(targetLoadout.skinId, 'skin_mage');
  assert.equal(targetLoadout.attachments.head, 'acc_crown_gold');

  // Verify source rows cleaned up
  assert.equal(db.prepare('SELECT 1 FROM avatar_wallets WHERE principal_id=?').get(guestId), undefined);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM avatar_inventory WHERE principal_id=?').get(guestId).c, 0);
  assert.equal(db.prepare('SELECT 1 FROM avatar_loadouts WHERE principal_id=?').get(guestId), undefined);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM avatar_purchase_idempotency WHERE principal_id=?').get(guestId).c, 0);

  // Second call is an idempotent no-op
  const repeat = mergeGuestAvatar(db, guestId, targetId, mergeIso);
  assert.equal(repeat.walletTransferred, false);
  assert.equal(repeat.inventoryMerged, 0);
  assert.equal(repeat.loadoutTransferred, false);
  assert.equal(service.wallet.getWallet(targetId).total, 1690);
});

test('Item 2b: mergeGuestAvatar preserves existing target loadout, avoids duplicate starter promo on empty guest wallet, and rolls back with outer tx', async (t) => {
  const { db, service } = makeHarness(t, { config: { avatar: { allowMockTopup: true } } });

  // Case A: Target already has a loadout -> keep target's loadout
  const gA = 'u-guest-a';
  const tA = 'u-target-a';
  seedUser(db, gA, 'guest', 'GA');
  seedUser(db, tA, 'registered', 'TA');
  service.purchaseItem(gA, 'acc_crown_gold', 'ga-buy-crown'); // spends 250 promo -> 0/0/0
  service.updateLoadout(gA, { attachments: { head: 'acc_crown_gold', back: null, hand_r: null, hand_l: null } });
  service.purchaseItem(tA, 'emote_dance', 'ta-buy-dance'); // spends 200 promo -> 0/0/50
  service.updateLoadout(tA, { emoteWheel: ['emote_dance', 'emote_cheer', null, null] });

  const resA = mergeGuestAvatar(db, gA, tA, Date.now());
  assert.equal(resA.loadoutTransferred, false);
  const tALoadout = service.buildVerifiedLoadout(tA);
  assert.equal(tALoadout.emoteWheel[0], 'emote_dance');
  assert.equal(tALoadout.attachments.head, null, 'target existing loadout must not be overwritten');

  // Case B: Guest spent all 250 starter promo and merges into brand-new target (no wallet row yet)
  const gB = 'u-guest-b';
  const tB = 'u-target-b';
  seedUser(db, gB, 'guest', 'GB');
  seedUser(db, tB, 'registered', 'TB');
  service.purchaseItem(gB, 'acc_crown_gold', 'gb-buy-crown'); // guest wallet is now 0/0/0
  mergeGuestAvatar(db, gB, tB, '2026-11-21T07:00:00.000Z');
  const tBWallet = service.wallet.getWallet(tB);
  assert.equal(tBWallet.total, 0, 'target must inherit 0/0/0 wallet instead of getting a second free 250 welcome promo');

  // Case C: Outer transaction rollback undoes mergeGuestAvatar atomically
  const gC = 'u-guest-c';
  const tC = 'u-target-c';
  seedUser(db, gC, 'guest', 'GC');
  seedUser(db, tC, 'registered', 'TC');
  service.wallet.topUpPack(gC, 'pack_500', 'gc-topup-1');
  assert.throws(() => {
    transaction(db, () => {
      mergeGuestAvatar(db, gC, tC, '2026-11-21T08:00:00.000Z');
      throw new Error('SIMULATED_MERGE_FAILURE');
    });
  }, /SIMULATED_MERGE_FAILURE/);
  assert.equal(db.prepare('SELECT paid_balance FROM avatar_wallets WHERE principal_id=?').get(gC).paid_balance, 500);
  assert.equal(db.prepare('SELECT 1 FROM avatar_wallets WHERE principal_id=?').get(tC), undefined);
});

test('Item 3a: resolveAvatarAddonDir returns null when missing and createAvatarService degrades safely to disabled:true with 503 AVATAR_CATALOG_UNAVAILABLE', async (t) => {
  const missingDir = path.join(os.tmpdir(), `playhub-no-avatar-${Date.now()}`);
  assert.equal(resolveAvatarAddonDir(missingDir, missingDir, { includeModuleFallback: false }), null);

  const { service } = makeHarness(t, {
    config: { avatar: { addonDir: missingDir } },
  });
  assert.equal(service.disabled, true);
  assert.equal(service.catalog, null);

  // Non-avatar route returns false
  const nonAvatar = makeReqRes('GET', '/api/games');
  assert.equal(await service.publicRoute(nonAvatar.req, nonAvatar.res, nonAvatar.url), false);

  // Avatar routes throw 503 AVATAR_CATALOG_UNAVAILABLE
  for (const endpoint of ['/api/avatar/catalog', '/api/avatar/me', '/api/avatar/loadout']) {
    const { req, res, url } = makeReqRes('GET', endpoint);
    await assert.rejects(
      () => service.publicRoute(req, res, url),
      (err) => err instanceof ApiError && err.status === 503 && err.code === 'AVATAR_CATALOG_UNAVAILABLE'
    );
  }
});

test('Item 3b: HMAC signing uses config.avatar.signingSecret / PLAYHUB_AVATAR_SIGNING_SECRET and never falls back to hardcoded constant', async (t) => {
  const { service: svcConfig } = makeHarness(t, {
    config: { avatar: { signingSecret: 'secret-from-config-123' } },
    env: { PLAYHUB_AVATAR_SIGNING_SECRET: 'secret-from-env-456' },
  });
  const loadoutCfg = svcConfig.buildVerifiedLoadout('u-guest-1', '게스트1');
  const expectedCfg = createHmac('sha256', 'secret-from-config-123')
    .update(JSON.stringify({
      principalId: loadoutCfg.principalId,
      skinId: loadoutCfg.skinId,
      attachments: loadoutCfg.attachments,
      emoteWheel: loadoutCfg.emoteWheel,
      revision: loadoutCfg.revision,
      catalogVersion: loadoutCfg.catalogVersion,
    }))
    .digest('hex');
  assert.equal(loadoutCfg.signature, expectedCfg);

  const { service: svcEnv } = makeHarness(t, {
    config: {},
    env: { PLAYHUB_AVATAR_SIGNING_SECRET: 'secret-from-env-456' },
  });
  const loadoutEnv = svcEnv.buildVerifiedLoadout('u-guest-1', '게스트1');
  const expectedEnv = createHmac('sha256', 'secret-from-env-456')
    .update(JSON.stringify({
      principalId: loadoutEnv.principalId,
      skinId: loadoutEnv.skinId,
      attachments: loadoutEnv.attachments,
      emoteWheel: loadoutEnv.emoteWheel,
      revision: loadoutEnv.revision,
      catalogVersion: loadoutEnv.catalogVersion,
    }))
    .digest('hex');
  assert.equal(loadoutEnv.signature, expectedEnv);

  // Production secureCookies=true with no secret: warns and uses ephemeral random key (NOT hardcoded constant)
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const { service: svcProd1 } = makeHarness(t, { config: { secureCookies: true }, env: {} });
    const { service: svcProd2 } = makeHarness(t, { config: { secureCookies: true }, env: {} });
    const l1 = svcProd1.buildVerifiedLoadout('u-guest-1', '게스트1');
    const l2 = svcProd2.buildVerifiedLoadout('u-guest-1', '게스트1');
    const hardcodedSig = createHmac('sha256', 'playhub-avatar-local-sign-v1')
      .update(JSON.stringify({
        principalId: l1.principalId,
        skinId: l1.skinId,
        attachments: l1.attachments,
        emoteWheel: l1.emoteWheel,
        revision: l1.revision,
        catalogVersion: l1.catalogVersion,
      }))
      .digest('hex');
    assert.notEqual(l1.signature, hardcodedSig, 'must never sign with hardcoded constant key');
    assert.notEqual(l1.signature, l2.signature, 'each instance must generate a distinct ephemeral key');
    assert.ok(warnings.some((w) => w.includes('PLAYHUB_AVATAR_SIGNING_SECRET')));
  } finally {
    console.warn = origWarn;
  }
});

test('Item 4: hub/web/user/avatar.js cleans up click/change listeners via AbortController, guards alive() with disposed, and prevents concurrent busy calls', async () => {
  const source = fs.readFileSync(path.join(hubRoot, 'web', 'user', 'avatar.js'), 'utf8');

  // Lightweight EventTarget-backed DOM stub for root
  function makeRoot() {
    const target = new EventTarget();
    const elements = new Map();
    const makeEl = (id) => {
      if (!elements.has(id)) {
        elements.set(id, {
          id,
          innerHTML: '',
          textContent: '',
          hidden: false,
          disabled: false,
          classList: { toggle() {}, add() {}, remove() {} },
          close() {},
          showModal() {},
        });
      }
      return elements.get(id);
    };
    return {
      isConnected: true,
      innerHTML: '',
      elements,
      addEventListener(type, fn, opts) { target.addEventListener(type, fn, opts); },
      removeEventListener(type, fn, opts) { target.removeEventListener(type, fn, opts); },
      dispatch(type, eventObj) {
        const ev = new Event(type);
        Object.defineProperty(ev, 'target', { value: eventObj.target, configurable: true });
        target.dispatchEvent(ev);
      },
      querySelector(sel) {
        return makeEl(sel);
      },
      querySelectorAll() {
        return [];
      },
    };
  }

  const sandbox = {
    window: { PlayHubDevDemoUI: { isEnabled: () => true } },
    AbortController,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Promise,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'avatar.js' });
  const { mount } = sandbox.window.PlayHubAvatarUI;

  const catalogRes = {
    items: [
      { id: 'skin_knight', name: '기사', category: 'skin', pricePlayCoin: 0, assetUrl: '/api/avatar/assets/skins/Knight.glb', rigProfile: 'kaykit_v1' },
      { id: 'skin_mage', name: '마법사', category: 'skin', pricePlayCoin: 300, assetUrl: '/api/avatar/assets/skins/Mage.glb', rigProfile: 'kaykit_v1' },
    ],
    topupPacks: [{ id: 'pack_500', label: '스타터', paidCoins: 500, bonusCoins: 50, bonusPercent: 10, priceDisplay: '₩7,000' }],
    defaultLoadout: { skinId: 'skin_knight', attachments: { head: null, back: null, hand_r: null, hand_l: null }, emoteWheel: [null, null, null, null] },
    rigProfiles: {},
  };
  const meRes = {
    wallet: { paid: 500, bonus: 0, promo: 0, total: 500 },
    inventory: [{ itemId: 'skin_knight' }],
    loadout: { skinId: 'skin_knight', attachments: { head: null, back: null, hand_r: null, hand_l: null }, emoteWheel: [null, null, null, null] },
  };

  // 1. Re-mounting on the same connected root 3 times after cleanup must NOT leak listeners
  const root = makeRoot();
  let topupCalls = 0;
  let buyCalls = 0;
  let loadoutCalls = 0;
  let resolveTopup = null;
  let resolveBuy = null;
  let resolveLoadout = null;
  const api = async (endpoint) => {
    if (endpoint === '/api/avatar/catalog') return catalogRes;
    if (endpoint === '/api/avatar/me') return structuredClone(meRes);
    if (endpoint === '/api/avatar/wallet/topup') {
      topupCalls++;
      return await new Promise((resolve) => {
        resolveTopup = () => resolve({ wallet: { paid: 1000, bonus: 50, promo: 0, total: 1050 }, pack: catalogRes.topupPacks[0] });
      });
    }
    if (endpoint === '/api/avatar/purchase') {
      buyCalls++;
      return await new Promise((resolve) => {
        resolveBuy = () => resolve({ wallet: { paid: 200, bonus: 0, promo: 0, total: 200 }, inventory: [{ itemId: 'skin_knight' }, { itemId: 'skin_mage' }], loadout: meRes.loadout });
      });
    }
    if (endpoint === '/api/avatar/loadout') {
      loadoutCalls++;
      return await new Promise((resolve) => {
        resolveLoadout = () => resolve({ loadout: meRes.loadout });
      });
    }
    throw new Error('Unexpected endpoint: ' + endpoint);
  };

  const cleanup1 = mount(root, api, () => true);
  cleanup1();
  const cleanup2 = mount(root, api, () => true);
  cleanup2();
  const cleanup3 = mount(root, api, () => true);
  await new Promise((r) => setImmediate(r)); // wait for initial Promise.all

  // Trigger rapid double-click on topup pack -> busy guard + single active listener means exactly 1 API call!
  const fakePackTarget = {
    closest(sel) {
      if (sel === '[data-topup-pack]') return { dataset: { topupPack: 'pack_500' } };
      return null;
    },
  };
  root.dispatch('click', { target: fakePackTarget });
  assert.equal(root.elements.get('#avatar-topup-open').disabled, true, 'topup button must be disabled while busy');
  assert.ok(root.elements.get('#avatar-topup-packs').innerHTML.includes('disabled'), 'pack buttons must be disabled while busy');

  // Second click while busy must be ignored
  root.dispatch('click', { target: fakePackTarget });
  assert.equal(topupCalls, 1, 'must fire exactly 1 topup request despite 3 mounts and double click');

  // Resolve in-flight topup -> busy cleared
  resolveTopup();
  await new Promise((r) => setImmediate(r));
  assert.equal(root.elements.get('#avatar-topup-open').disabled, false);

  // Trigger rapid double-click on buy -> busy guard blocks duplicate
  const fakeBuyTarget = {
    closest(sel) {
      if (sel === '[data-buy]') return { dataset: { buy: 'skin_mage' } };
      return null;
    },
  };
  root.dispatch('click', { target: fakeBuyTarget });
  root.dispatch('click', { target: fakeBuyTarget });
  assert.equal(buyCalls, 1, 'buyItem busy guard must prevent duplicate purchases');
  resolveBuy();
  await new Promise((r) => setImmediate(r));

  // Trigger rapid double change on emote wheel select -> saveLoadout busy guard blocks duplicate
  const fakeChangeTarget = {
    closest(sel) {
      if (sel === '.avatar-emote-slot-select') return { dataset: { emoteId: 'emote_cheer' }, value: '0' };
      return null;
    },
  };
  root.dispatch('change', { target: fakeChangeTarget });
  root.dispatch('change', { target: fakeChangeTarget });
  assert.equal(loadoutCalls, 1, 'saveLoadout busy guard must prevent duplicate saves');
  resolveLoadout();
  await new Promise((r) => setImmediate(r));

  // Cleanup active mount -> subsequent click & change events must do nothing even though root.isConnected is still true
  cleanup3();
  root.dispatch('click', { target: fakePackTarget });
  root.dispatch('change', { target: fakeChangeTarget });
  assert.equal(topupCalls, 1, 'disposed mount must ignore click events');
  assert.equal(loadoutCalls, 1, 'disposed mount must ignore change events');
});
