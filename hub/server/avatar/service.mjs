import { createHmac } from 'node:crypto';
import fs from 'node:fs';
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
}) {
  ensureAvatarSchema(db);
  const addonDir = resolveAvatarAddonDir(platformRoot, rootDir);
  const catalog = loadAvatarCatalog(addonDir);
  const wallet = createPlayCoinWalletAdapter({ db, now, topupPacks: catalog.topupPacks });
  const signingSecret = config?.avatarSigningSecret || config?.sessionSecret || 'playhub-avatar-local-sign-v1';

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

    const assetMatch = pathname.match(/^\/api\/avatar\/assets\/(skins|accessories)\/([A-Za-z0-9_-]{1,80}\.glb)$/);
    if (assetMatch && req.method === 'GET') {
      const file = catalog.resolveAssetFile(assetMatch[1], assetMatch[2]);
      if (!file) throw new ApiError(404, 'AVATAR_ASSET_NOT_FOUND');
      const bytes = await fs.promises.readFile(file);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'model/gltf-binary');
      res.setHeader('Content-Length', String(bytes.length));
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
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
    catalog,
    publicRoute,
    getMe,
    buildVerifiedLoadout,
    purchaseItem,
    updateLoadout,
    wallet,
  };
}
