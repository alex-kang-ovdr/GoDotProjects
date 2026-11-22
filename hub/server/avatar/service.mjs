import { createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { transaction } from '../db.mjs';
import { ApiError, digest, json, readJson, safeString, uid } from '../security.mjs';
import {
  ATTACHMENT_SLOTS,
  EMOTE_WHEEL_SIZE,
  loadAvatarCatalog,
  resolveAvatarAddonDir,
} from './catalog.mjs';
import { ensureAvatarSchema } from './schema.mjs';
import { createPlayCoinWalletAdapter } from './wallet-adapter.mjs';

function normalizeIdempotencyKey(req, body) {
  const raw = req.headers['idempotency-key'] || body?.idempotencyKey || '';
  if (typeof raw !== 'string' || !/^[A-Za-z0-9._:-]{6,120}$/.test(raw.trim())) {
    return null;
  }
  return raw.trim();
}

function resolveTimestampMs(nowIso) {
  if (typeof nowIso === 'number' && Number.isFinite(nowIso)) return Math.trunc(nowIso);
  if (typeof nowIso === 'string' && nowIso.trim()) {
    const parsed = Date.parse(nowIso);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function runInSavepoint(db, fn) {
  const sp = `sp_avatar_merge_${uid().replace(/[^A-Za-z0-9_]/g, '')}`;
  db.exec(`SAVEPOINT ${sp}`);
  try {
    const result = fn();
    db.exec(`RELEASE SAVEPOINT ${sp}`);
    return result;
  } catch (err) {
    try { db.exec(`ROLLBACK TO SAVEPOINT ${sp}`); } catch {}
    try { db.exec(`RELEASE SAVEPOINT ${sp}`); } catch {}
    throw err;
  }
}

function resolveSigningSecret(config, env = process.env) {
  const configured =
    (typeof config?.avatar?.signingSecret === 'string' && config.avatar.signingSecret.trim()) ||
    (typeof env?.PLAYHUB_AVATAR_SIGNING_SECRET === 'string' && env.PLAYHUB_AVATAR_SIGNING_SECRET.trim()) ||
    (typeof config?.avatarSigningSecret === 'string' && config.avatarSigningSecret.trim()) ||
    (typeof config?.sessionSecret === 'string' && config.sessionSecret.trim()) ||
    '';
  if (configured) {
    return { secret: configured, ephemeral: false };
  }
  const ephemeral = randomBytes(32).toString('hex');
  if (config?.secureCookies === true) {
    console.warn('[avatar] PLAYHUB_AVATAR_SIGNING_SECRET / config.avatar.signingSecret is not configured while secureCookies=true; using ephemeral random HMAC signing key.');
  }
  return { secret: ephemeral, ephemeral: true };
}

/**
 * Atomically merge a guest principal's avatar wallet (3-bucket balances + ledger transfer),
 * inventory (union via INSERT OR IGNORE), and loadout (transferred only if target has none),
 * then clean up source rows. Safe to invoke both standalone and inside an existing SQLite transaction.
 */
export function mergeGuestAvatar(db, sourcePrincipalId, targetPrincipalId, nowIso) {
  if (!sourcePrincipalId || !targetPrincipalId || sourcePrincipalId === targetPrincipalId) {
    return {
      merged: false,
      walletTransferred: false,
      transferredCoins: { paid: 0, bonus: 0, promo: 0 },
      inventoryMerged: 0,
      loadoutTransferred: false,
    };
  }
  const hasAvatarTables = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='avatar_wallets'")
    .get();
  if (!hasAvatarTables) {
    return {
      merged: false,
      walletTransferred: false,
      transferredCoins: { paid: 0, bonus: 0, promo: 0 },
      inventoryMerged: 0,
      loadoutTransferred: false,
    };
  }

  const ts = resolveTimestampMs(nowIso);
  return runInSavepoint(db, () => {
    const sourceWallet = db
      .prepare('SELECT paid_balance,bonus_balance,promo_balance FROM avatar_wallets WHERE principal_id=?')
      .get(sourcePrincipalId);
    const targetWallet = db
      .prepare('SELECT paid_balance,bonus_balance,promo_balance FROM avatar_wallets WHERE principal_id=?')
      .get(targetPrincipalId);

    let paid = 0;
    let bonus = 0;
    let promo = 0;
    if (sourceWallet) {
      paid = sourceWallet.paid_balance || 0;
      bonus = sourceWallet.bonus_balance || 0;
      promo = sourceWallet.promo_balance || 0;

      if (targetWallet) {
        db.prepare(
          'UPDATE avatar_wallets SET paid_balance=paid_balance+?, bonus_balance=bonus_balance+?, promo_balance=promo_balance+?, updated_at=? WHERE principal_id=?'
        ).run(paid, bonus, promo, ts, targetPrincipalId);
      } else {
        db.prepare(
          'INSERT INTO avatar_wallets(principal_id,paid_balance,bonus_balance,promo_balance,updated_at) VALUES(?,?,?,?,?)'
        ).run(targetPrincipalId, paid, bonus, promo, ts);
      }

      if (paid > 0 || bonus > 0 || promo > 0) {
        db.prepare(
          'INSERT OR IGNORE INTO avatar_wallet_ledger(id,principal_id,delta_paid,delta_bonus,delta_promo,kind,ref_id,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)'
        ).run(
          uid(),
          sourcePrincipalId,
          -paid,
          -bonus,
          -promo,
          'guest_merge_out',
          targetPrincipalId,
          `merge:out:${sourcePrincipalId}:${targetPrincipalId}`,
          ts
        );
        db.prepare(
          'INSERT OR IGNORE INTO avatar_wallet_ledger(id,principal_id,delta_paid,delta_bonus,delta_promo,kind,ref_id,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)'
        ).run(
          uid(),
          targetPrincipalId,
          paid,
          bonus,
          promo,
          'guest_merge_in',
          sourcePrincipalId,
          `merge:in:${sourcePrincipalId}:${targetPrincipalId}`,
          ts
        );
      }

      db.prepare('DELETE FROM avatar_wallets WHERE principal_id=?').run(sourcePrincipalId);
    }

    const invInsert = db
      .prepare(
        'INSERT OR IGNORE INTO avatar_inventory(principal_id,item_id,category,acquired_via,price_paid,acquired_at) SELECT ?,item_id,category,acquired_via,price_paid,acquired_at FROM avatar_inventory WHERE principal_id=?'
      )
      .run(targetPrincipalId, sourcePrincipalId);
    db.prepare('DELETE FROM avatar_inventory WHERE principal_id=?').run(sourcePrincipalId);

    const targetLoadout = db
      .prepare('SELECT 1 FROM avatar_loadouts WHERE principal_id=?')
      .get(targetPrincipalId);
    const sourceLoadout = db
      .prepare('SELECT skin_id,attachments_json,emote_wheel_json,revision FROM avatar_loadouts WHERE principal_id=?')
      .get(sourcePrincipalId);
    let loadoutTransferred = false;
    if (!targetLoadout && sourceLoadout) {
      db.prepare(
        'INSERT INTO avatar_loadouts(principal_id,skin_id,attachments_json,emote_wheel_json,revision,updated_at) VALUES(?,?,?,?,?,?)'
      ).run(
        targetPrincipalId,
        sourceLoadout.skin_id,
        sourceLoadout.attachments_json,
        sourceLoadout.emote_wheel_json,
        sourceLoadout.revision,
        ts
      );
      loadoutTransferred = true;
    }
    db.prepare('DELETE FROM avatar_loadouts WHERE principal_id=?').run(sourcePrincipalId);
    db.prepare('DELETE FROM avatar_purchase_idempotency WHERE principal_id=?').run(sourcePrincipalId);

    return {
      merged: true,
      walletTransferred: Boolean(sourceWallet),
      transferredCoins: { paid, bonus, promo },
      inventoryMerged: invInsert.changes || 0,
      loadoutTransferred,
    };
  });
}

export function createAvatarService({
  config,
  db,
  rootDir,
  platformRoot,
  now,
  sessionFor,
  requireSession,
  promote,
  rate,
  audit,
  env = process.env,
}) {
  ensureAvatarSchema(db);
  const addonDir = resolveAvatarAddonDir(platformRoot, rootDir, {
    addonDir: config?.avatar?.addonDir,
    includeModuleFallback: config?.avatar?.includeModuleFallback !== false,
  });

  let catalog = null;
  if (addonDir) {
    try {
      catalog = loadAvatarCatalog(addonDir);
    } catch (err) {
      console.warn(`[avatar] Failed to load catalog from ${addonDir}; disabling avatar service:`, err?.message || err);
      catalog = null;
    }
  }

  if (!catalog) {
    console.warn('[avatar] PlayForge Avatar canonical catalog.json not found; running in safe disabled fallback mode.');
    const unavailable = () => {
      throw new ApiError(503, 'AVATAR_CATALOG_UNAVAILABLE', '아바타 카탈로그를 사용할 수 없습니다.');
    };
    return {
      disabled: true,
      catalog: null,
      wallet: null,
      async publicRoute(req, res, url) {
        if (!url.pathname.startsWith('/api/avatar')) return false;
        unavailable();
      },
      getMe: unavailable,
      buildVerifiedLoadout: unavailable,
      purchaseItem: unavailable,
      updateLoadout: unavailable,
      getCorePack: unavailable,
      getAssetMetrics: () => ({ totalDownloads: 0, uniqueAssetsDownloaded: 0, perAsset: {} }),
    };
  }

  const forgeRoot = path.resolve(addonDir, '..', '..', '..');
  const wallet = createPlayCoinWalletAdapter({ db, now, topupPacks: catalog.topupPacks });
  const { secret: signingSecret } = resolveSigningSecret(config, env);
  const allowMockTopup = config?.avatar?.allowMockTopup === true;
  const localRequire = createRequire(import.meta.url);
  let cachedCorePack = null;
  const assetDownloadCounts = new Map();

  function getCorePack() {
    if (!cachedCorePack) {
      const { buildCorePack } = localRequire(path.join(forgeRoot, 'Tools', 'build-core-pack.cjs'));
      cachedCorePack = buildCorePack(forgeRoot);
    }
    return cachedCorePack;
  }

  function getAssetMetrics() {
    let totalDownloads = 0;
    const perAsset = {};
    for (const [k, v] of assetDownloadCounts.entries()) {
      totalDownloads += v;
      perAsset[k] = v;
    }
    return {
      totalDownloads,
      uniqueAssetsDownloaded: assetDownloadCounts.size,
      perAsset,
    };
  }

  function signLoadout(payload) {
    const canonical = JSON.stringify({
      principalId: payload.principalId || 'guest',
      skinId: payload.skinId,
      attachments: payload.attachments,
      emoteWheel: payload.emoteWheel,
      revision: payload.revision,
      catalogVersion: payload.catalogVersion,
    });
    return createHmac('sha256', signingSecret).update(canonical).digest('hex');
  }

  function ownedSet(principalId) {
    const owned = new Set(catalog.starterIds);
    if (!principalId) return owned;
    const rows = db.prepare('SELECT item_id FROM avatar_inventory WHERE principal_id=?').all(principalId);
    for (const r of rows) owned.add(r.item_id);
    return owned;
  }

  function buildVerifiedLoadout(principalId, displayName = null) {
    let skinId = catalog.defaultLoadout.skinId;
    let attachments = { ...catalog.defaultLoadout.attachments };
    let emoteWheel = [...catalog.defaultLoadout.emoteWheel];
    let revision = 1;
    let updatedAt = new Date(now()).toISOString();

    if (principalId) {
      const row = db.prepare('SELECT * FROM avatar_loadouts WHERE principal_id=?').get(principalId);
      if (row) {
        const owned = ownedSet(principalId);
        if (owned.has(row.skin_id) && catalog.itemsById.get(row.skin_id)?.category === 'skin') {
          skinId = row.skin_id;
        }
        try {
          const parsedAtt = JSON.parse(row.attachments_json);
          attachments = {};
          for (const slot of ATTACHMENT_SLOTS) {
            const candidate = parsedAtt?.[slot] || null;
            const item = candidate ? catalog.itemsById.get(candidate) : null;
            attachments[slot] = item && item.category === 'attachment' && item.slot === slot && owned.has(candidate)
              ? candidate
              : null;
          }
        } catch {}
        try {
          const parsedEm = JSON.parse(row.emote_wheel_json);
          emoteWheel = [];
          for (let i = 0; i < EMOTE_WHEEL_SIZE; i++) {
            const candidate = Array.isArray(parsedEm) ? (parsedEm[i] || null) : null;
            const item = candidate ? catalog.itemsById.get(candidate) : null;
            emoteWheel.push(item && item.category === 'emote' && owned.has(candidate) ? candidate : null);
          }
        } catch {}
        revision = row.revision;
        updatedAt = new Date(row.updated_at).toISOString();
      }
    }

    const skinItem = catalog.itemsById.get(skinId);
    const attachmentAssetUrls = {};
    for (const slot of ATTACHMENT_SLOTS) {
      const id = attachments[slot];
      attachmentAssetUrls[slot] = id ? (catalog.itemsById.get(id)?.assetUrl || null) : null;
    }

    const loadout = {
      principalId: principalId || null,
      displayName: displayName || 'Player',
      skinId,
      skinAssetUrl: skinItem?.assetUrl || null,
      rigProfile: skinItem?.rigProfile || 'kaykit_v1',
      attachments,
      attachmentAssetUrls,
      emoteWheel,
      revision,
      catalogVersion: catalog.catalogVersion,
      updatedAt,
      verified: true,
      immutableInForge: true,
    };
    loadout.signature = signLoadout(loadout);
    return loadout;
  }

  function listInventory(principalId) {
    const owned = ownedSet(principalId);
    const acquiredMeta = new Map();
    if (principalId) {
      for (const r of db.prepare('SELECT item_id,acquired_via,price_paid,acquired_at FROM avatar_inventory WHERE principal_id=?').all(principalId)) {
        acquiredMeta.set(r.item_id, r);
      }
    }
    return [...owned]
      .filter((id) => catalog.itemsById.has(id))
      .map((id) => {
        const item = catalog.itemsById.get(id);
        const row = acquiredMeta.get(id);
        return {
          itemId: id,
          category: item.category,
          slot: item.slot || null,
          acquiredVia: row ? row.acquired_via : 'starter',
          pricePaid: row ? row.price_paid : 0,
          acquiredAt: row ? new Date(row.acquired_at).toISOString() : null,
        };
      });
  }

  function getMe(session) {
    const principalId = session?.principal_id || null;
    const user = principalId ? db.prepare('SELECT id,kind,display_name FROM users WHERE id=?').get(principalId) : null;
    return {
      ok: true,
      principal: {
        id: principalId,
        kind: user?.kind || 'anonymous',
        displayName: user?.display_name || (principalId ? '게스트 플레이어' : '방문자'),
      },
      wallet: wallet.getWallet(principalId),
      inventory: listInventory(principalId),
      loadout: buildVerifiedLoadout(principalId, user?.display_name),
      ledger: wallet.listLedger(principalId, 15),
    };
  }

  function purchaseItem(principalId, itemId, idempotencyKey) {
    if (!safeString(itemId, 64) || !catalog.itemsById.has(itemId)) {
      throw new ApiError(404, 'AVATAR_ITEM_NOT_FOUND', '존재하지 않는 아바타 아이템입니다.');
    }
    const item = catalog.itemsById.get(itemId);
    const reqHash = digest(JSON.stringify({ itemId }));

    return transaction(db, () => {
      const replay = db
        .prepare('SELECT request_hash,response_json FROM avatar_purchase_idempotency WHERE principal_id=? AND idempotency_key=?')
        .get(principalId, idempotencyKey);
      if (replay) {
        if (replay.request_hash !== reqHash) {
          throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', '동일한 멱등키에 다른 아이템 구매가 요청되었습니다.');
        }
        return { ...JSON.parse(replay.response_json), replayed: true };
      }

      if (catalog.starterIds.has(itemId)) {
        throw new ApiError(409, 'ALREADY_OWNED', '이미 기본 지급으로 보유 중인 아이템입니다.');
      }
      const existing = db.prepare('SELECT 1 FROM avatar_inventory WHERE principal_id=? AND item_id=?').get(principalId, itemId);
      if (existing) {
        throw new ApiError(409, 'ALREADY_OWNED', '이미 보유 중인 아이템입니다.');
      }

      const spendResult = wallet.spendInTx(principalId, item.pricePlayCoin, 'avatar_purchase', item.id, idempotencyKey);
      const ts = now();
      db.prepare('INSERT INTO avatar_inventory(principal_id,item_id,category,acquired_via,price_paid,acquired_at) VALUES(?,?,?,?,?,?)')
        .run(principalId, item.id, item.category, 'playcoin_shop', item.pricePlayCoin, ts);

      audit('avatar_purchase', item.id, {
        principalId,
        category: item.category,
        pricePlayCoin: item.pricePlayCoin,
        spent: spendResult.spent,
      });

      const response = {
        ok: true,
        purchased: {
          itemId: item.id,
          name: item.name,
          category: item.category,
          pricePlayCoin: item.pricePlayCoin,
          spent: spendResult.spent,
        },
        wallet: spendResult.wallet,
        inventory: listInventory(principalId),
        loadout: buildVerifiedLoadout(principalId),
      };

      db.prepare('INSERT INTO avatar_purchase_idempotency(principal_id,idempotency_key,request_hash,response_json,created_at) VALUES(?,?,?,?,?)')
        .run(principalId, idempotencyKey, reqHash, JSON.stringify(response), ts);

      return { ...response, replayed: false };
    });
  }

  function updateLoadout(principalId, body, displayName = null) {
    const owned = ownedSet(principalId);
    const current = buildVerifiedLoadout(principalId, displayName);

    const nextSkin = body.skinId !== undefined ? body.skinId : current.skinId;
    if (!safeString(nextSkin, 64)) throw new ApiError(422, 'INVALID_SKIN_ID');
    const skinItem = catalog.itemsById.get(nextSkin);
    if (!skinItem || skinItem.category !== 'skin') throw new ApiError(422, 'INVALID_SKIN_ID', '유효한 스킨 ID가 아닙니다.');
    if (!owned.has(nextSkin)) throw new ApiError(403, 'ITEM_NOT_OWNED', `보유하지 않은 스킨입니다: ${skinItem.name}`);

    const rawAttachments = body.attachments !== undefined ? body.attachments : current.attachments;
    if (!rawAttachments || typeof rawAttachments !== 'object' || Array.isArray(rawAttachments)) {
      throw new ApiError(422, 'INVALID_ATTACHMENTS');
    }
    const nextAttachments = {};
    for (const slot of ATTACHMENT_SLOTS) {
      const value = Object.hasOwn(rawAttachments, slot) ? rawAttachments[slot] : current.attachments[slot];
      if (value === null || value === '') {
        nextAttachments[slot] = null;
        continue;
      }
      if (!safeString(value, 64)) throw new ApiError(422, 'INVALID_ATTACHMENT_ID');
      const item = catalog.itemsById.get(value);
      if (!item || item.category !== 'attachment' || item.slot !== slot) {
        throw new ApiError(422, 'INVALID_ATTACHMENT_SLOT', `${slot} 슬롯에 장착할 수 없는 아이템입니다.`);
      }
      if (!owned.has(value)) throw new ApiError(403, 'ITEM_NOT_OWNED', `보유하지 않은 장착물입니다: ${item.name}`);
      nextAttachments[slot] = value;
    }

    const rawWheel = body.emoteWheel !== undefined ? body.emoteWheel : current.emoteWheel;
    if (!Array.isArray(rawWheel) || rawWheel.length > EMOTE_WHEEL_SIZE) {
      throw new ApiError(422, 'INVALID_EMOTE_WHEEL', `이모지 휠은 최대 ${EMOTE_WHEEL_SIZE}개 슬롯만 허용됩니다.`);
    }
    const nextWheel = [];
    for (let i = 0; i < EMOTE_WHEEL_SIZE; i++) {
      const value = i < rawWheel.length ? rawWheel[i] : null;
      if (value === null || value === '') {
        nextWheel.push(null);
        continue;
      }
      if (!safeString(value, 64)) throw new ApiError(422, 'INVALID_EMOTE_ID');
      const item = catalog.itemsById.get(value);
      if (!item || item.category !== 'emote') {
        throw new ApiError(422, 'INVALID_EMOTE_ID', '유효한 이모지 ID가 아닙니다.');
      }
      if (!owned.has(value)) throw new ApiError(403, 'ITEM_NOT_OWNED', `보유하지 않은 이모지입니다: ${item.name}`);
      nextWheel.push(value);
    }

    const ts = now();
    transaction(db, () => {
      db.prepare(`
        INSERT INTO avatar_loadouts(principal_id,skin_id,attachments_json,emote_wheel_json,revision,updated_at)
        VALUES(?,?,?,?,1,?)
        ON CONFLICT(principal_id) DO UPDATE SET
          skin_id=excluded.skin_id,
          attachments_json=excluded.attachments_json,
          emote_wheel_json=excluded.emote_wheel_json,
          revision=avatar_loadouts.revision+1,
          updated_at=excluded.updated_at
      `).run(principalId, nextSkin, JSON.stringify(nextAttachments), JSON.stringify(nextWheel), ts);
    });

    audit('avatar_loadout_update', principalId, { skinId: nextSkin, attachments: nextAttachments, emoteWheel: nextWheel });
    return buildVerifiedLoadout(principalId, displayName);
  }

  async function publicRoute(req, res, url) {
    const pathname = url.pathname;
    if (!pathname.startsWith('/api/avatar')) return false;

    if (pathname === '/api/avatar/catalog' && req.method === 'GET') {
      json(res, 200, {
        ok: true,
        schemaVersion: catalog.schemaVersion,
        catalogVersion: catalog.catalogVersion,
        currency: catalog.currency,
        attachmentSlots: catalog.attachmentSlots,
        rigProfiles: catalog.rigProfiles,
        defaultLoadout: catalog.defaultLoadout,
        topupPacks: catalog.topupPacks,
        items: catalog.items,
      });
      return true;
    }

    if (pathname === '/api/avatar/runtime/manifest' && req.method === 'GET') {
      const core = getCorePack();
      const assets = catalog.items
        .filter((i) => i.assetPath && i.sha256)
        .map((i) => ({
          id: i.id,
          category: i.category,
          slot: i.slot || null,
          assetUrl: i.assetUrl,
          sha256: i.sha256,
          bytes: i.bytes || 0,
        }));
      json(res, 200, {
        ok: true,
        packaging: '4-layer-modular',
        catalogVersion: catalog.catalogVersion,
        corePack: {
          url: `/api/avatar/runtime/core.pck?v=${core.sha256.slice(0, 12)}`,
          sha256: core.sha256,
          bytes: core.bytes,
          fileCount: core.fileCount,
          containsGlbBinaries: false,
        },
        assetsBaseUrl: '/api/avatar/assets',
        assetCount: assets.length,
        totalAssetBytes: assets.reduce((acc, a) => acc + a.bytes, 0),
        telemetry: getAssetMetrics(),
      });
      return true;
    }

    if (pathname === '/api/avatar/runtime/core.pck' && req.method === 'GET') {
      const core = getCorePack();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', String(core.bytes));
      res.setHeader('ETag', `"${core.sha256}"`);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(core.buffer);
      return true;
    }

    const assetMatch = pathname.match(/^\/api\/avatar\/assets\/(skins|accessories)\/([A-Za-z0-9_-]{1,80}\.glb)$/);
    if (assetMatch && req.method === 'GET') {
      const file = catalog.resolveAssetFile(assetMatch[1], assetMatch[2]);
      if (!file) throw new ApiError(404, 'AVATAR_ASSET_NOT_FOUND');
      const assetKey = `${assetMatch[1]}/${assetMatch[2]}`;
      assetDownloadCounts.set(assetKey, (assetDownloadCounts.get(assetKey) || 0) + 1);
      const bytes = await fs.promises.readFile(file);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'model/gltf-binary');
      res.setHeader('Content-Length', String(bytes.length));
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(bytes);
      return true;
    }

    if (pathname === '/api/avatar/me' && req.method === 'GET') {
      const s = sessionFor(req, 'public');
      json(res, 200, getMe(s));
      return true;
    }

    if (pathname === '/api/avatar/loadout' && req.method === 'GET') {
      const s = sessionFor(req, 'public');
      const principalId = s?.principal_id || null;
      const user = principalId ? db.prepare('SELECT display_name FROM users WHERE id=?').get(principalId) : null;
      json(res, 200, { ok: true, loadout: buildVerifiedLoadout(principalId, user?.display_name) });
      return true;
    }

    if (pathname === '/api/avatar/wallet/topup' && req.method === 'POST') {
      if (!allowMockTopup) {
        throw new ApiError(403, 'TOPUP_DISABLED', 'PlayCoin 모의 충전이 비활성화되어 있습니다.');
      }
      const s = requireSession(req, 'public');
      rate(`avatar-topup:${s.id_hash}`, 30, 60000);
      const body = await readJson(req, 4096);
      const idempotencyKey = normalizeIdempotencyKey(req, body) || `auto-${uid()}`;
      const principal = promote(s, req, res);
      const result = wallet.topUpPack(principal.principal_id, body.packId, idempotencyKey);
      audit('avatar_wallet_topup', principal.principal_id, { packId: body.packId, replayed: result.replayed });
      json(res, 200, { ok: true, ...result, ledger: wallet.listLedger(principal.principal_id, 15) });
      return true;
    }

    if (pathname === '/api/avatar/purchase' && req.method === 'POST') {
      const s = requireSession(req, 'public');
      rate(`avatar-purchase:${s.id_hash}`, 60, 60000);
      const body = await readJson(req, 4096);
      const idempotencyKey = normalizeIdempotencyKey(req, body);
      if (!idempotencyKey) throw new ApiError(422, 'IDEMPOTENCY_KEY_REQUIRED', '구매 요청에는 Idempotency-Key가 필요합니다.');
      const principal = promote(s, req, res);
      const result = purchaseItem(principal.principal_id, body.itemId, idempotencyKey);
      json(res, 200, { ...result, ledger: wallet.listLedger(principal.principal_id, 15) });
      return true;
    }

    if (pathname === '/api/avatar/loadout' && req.method === 'PUT') {
      const s = requireSession(req, 'public');
      rate(`avatar-loadout:${s.id_hash}`, 120, 60000);
      const body = await readJson(req, 8192);
      const principal = promote(s, req, res);
      const user = db.prepare('SELECT display_name FROM users WHERE id=?').get(principal.principal_id);
      const loadout = updateLoadout(principal.principal_id, body, user?.display_name);
      json(res, 200, { ok: true, loadout });
      return true;
    }

    return false;
  }

  return {
    disabled: false,
    catalog,
    publicRoute,
    getMe,
    buildVerifiedLoadout,
    purchaseItem,
    updateLoadout,
    wallet,
    getCorePack,
    getAssetMetrics,
  };
}
