// Track B: Creator Direct Commerce (0% Platform Fee) & EntitlementService.
//
// Core policy invariants (HUB_BILLING_PLAN.md v2.0):
// 1. PlayHub platform fee on creator UGC sales is strictly 0% (platform_fee_bps=0,
//    platform_fee_minor=0, no Stripe application_fee_amount).
// 2. Creator is the seller and receives proceeds directly into their connected
//    account. PlayHub NEVER holds creator sales proceeds, NEVER settles cash to
//    creators, and NEVER collects/stores creator private API secret keys.
// 3. PlayHub only verifies payment events and manages game Entitlements
//    (grant on PAID, immediate REVOKE on refund/chargeback) + RiskControls.
// 4. Mobile & TV platforms (android, ios, google_tv, apple_tv, samsung_tv) are
//    FREE-TO-PLAY FIRST (fail-closed) until P3 store & legal policy approval.

import { ApiError, uid, safeString } from '../security.mjs';
import { runAtomic, withIdempotency } from './idempotency.mjs';

export const DEFAULT_ENABLED_DIRECT_PLATFORMS = new Set(['web']);
export const ALL_PLATFORMS = new Set(['web', 'windows', 'android', 'ios', 'google_tv', 'apple_tv', 'samsung_tv']);
export const FORBIDDEN_SECRET_KEYS = ['apiKey', 'api_key', 'secretKey', 'secret_key', 'privateKey', 'private_key', 'accessToken', 'access_token', 'refreshToken', 'refresh_token'];

function assertNoSecretFields(payload) {
  if (!payload || typeof payload !== 'object') return;
  for (const field of FORBIDDEN_SECRET_KEYS) {
    if (payload[field] !== undefined && payload[field] !== null && payload[field] !== '') {
      throw new ApiError(400, 'CREATOR_SECRET_KEY_FORBIDDEN', 'PlayHub never collects or stores creator private payment keys');
    }
  }
}

// 1. CreatorPaymentConnection
export function upsertCreatorConnection(db, payload, now = Date.now) {
  assertNoSecretFields(payload);
  const {
    principalId,
    provider = 'stripe_connect',
    connectedAccountId,
    onboardingStatus = 'PENDING',
    chargesEnabled = false,
    payoutsEnabled = false,
    countryCode,
    platformFeeBps = 0
  } = payload || {};

  if (!safeString(principalId, 128)) throw new ApiError(400, 'PRINCIPAL_REQUIRED');
  if (!['stripe_connect', 'mor_partner'].includes(provider)) throw new ApiError(422, 'DIRECT_PROVIDER_INVALID');
  if (!safeString(connectedAccountId, 128)) throw new ApiError(422, 'CONNECTED_ACCOUNT_REQUIRED');
  if (!['NOT_CONNECTED', 'PENDING', 'ACTIVE', 'RESTRICTED', 'SUSPENDED'].includes(onboardingStatus)) {
    throw new ApiError(422, 'ONBOARDING_STATUS_INVALID');
  }
  if (!safeString(countryCode, 8) || !/^[A-Z]{2}$/.test(String(countryCode).toUpperCase())) {
    throw new ApiError(422, 'COUNTRY_CODE_INVALID');
  }
  if (platformFeeBps !== 0) {
    throw new ApiError(422, 'PLATFORM_FEE_MUST_BE_ZERO', 'PlayHub platform fee on creator direct sales is strictly 0%');
  }

  const stamp = now();
  db.prepare(`
    INSERT INTO billing_creator_connections(
      principal_id, provider, connected_account_id, onboarding_status,
      charges_enabled, payouts_enabled, country_code, platform_fee_bps, updated_at
    ) VALUES(?,?,?,?,?,?,?,0,?)
    ON CONFLICT(principal_id) DO UPDATE SET
      provider=excluded.provider,
      connected_account_id=excluded.connected_account_id,
      onboarding_status=excluded.onboarding_status,
      charges_enabled=excluded.charges_enabled,
      payouts_enabled=excluded.payouts_enabled,
      country_code=excluded.country_code,
      platform_fee_bps=0,
      updated_at=excluded.updated_at
  `).run(
    principalId, provider, connectedAccountId, onboardingStatus,
    chargesEnabled ? 1 : 0, payoutsEnabled ? 1 : 0, String(countryCode).toUpperCase(), stamp
  );
  return db.prepare('SELECT * FROM billing_creator_connections WHERE principal_id=?').get(principalId);
}

// 2. CreatorProductCatalog
export function createCreatorProduct(db, {
  creatorId,
  gameId,
  productKey,
  kind,
  title,
  currency,
  amountMinor,
  allowedRegions = ['*'],
  allowedPlatforms = ['web'],
  ageRating = 'ALL',
  status = 'ACTIVE',
  now = Date.now
}) {
  if (!safeString(creatorId, 128) || !safeString(gameId, 128) || !safeString(productKey, 96)) {
    throw new ApiError(422, 'PRODUCT_IDENTITY_INVALID');
  }
  if (!['game_access', 'consumable', 'durable', 'pass'].includes(kind)) throw new ApiError(422, 'PRODUCT_KIND_INVALID');
  if (!safeString(title, 160)) throw new ApiError(422, 'PRODUCT_TITLE_REQUIRED');
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new ApiError(422, 'PRODUCT_AMOUNT_INVALID');
  if (!Array.isArray(allowedPlatforms) || !allowedPlatforms.length || allowedPlatforms.some(p => !ALL_PLATFORMS.has(p))) {
    throw new ApiError(422, 'ALLOWED_PLATFORMS_INVALID');
  }
  if (!['ALL', '12+', '15+', '18+'].includes(ageRating)) throw new ApiError(422, 'AGE_RATING_INVALID');
  if (!['DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(status)) throw new ApiError(422, 'PRODUCT_STATUS_INVALID');

  const id = uid();
  const stamp = now();
  db.prepare(`
    INSERT INTO billing_creator_products(
      id, creator_id, game_id, product_key, kind, title, currency, amount_minor,
      allowed_regions_json, allowed_platforms_json, age_rating, status, created_at, updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    id, creatorId, gameId, productKey, kind, title, String(currency).toUpperCase(), amountMinor,
    JSON.stringify(allowedRegions), JSON.stringify(allowedPlatforms), ageRating, status, stamp, stamp
  );
  return db.prepare('SELECT * FROM billing_creator_products WHERE id=?').get(id);
}

// 3. DirectOrder creation (0% fee, fail-closed platform policy gate, RiskControls)
export function createDirectOrder(db, {
  buyerId,
  productId,
  platform = 'web',
  buyerRegion = null,
  enabledPlatforms = DEFAULT_ENABLED_DIRECT_PLATFORMS,
  idempotencyKey,
  now = Date.now
}) {
  if (!ALL_PLATFORMS.has(platform)) throw new ApiError(400, 'PLATFORM_INVALID');
  if (!enabledPlatforms.has(platform)) {
    throw new ApiError(403, 'PLATFORM_PAID_SALES_DISABLED', `Paid direct sales are currently disabled on platform: ${platform}`);
  }

  const outcome = withIdempotency({
    db,
    scope: 'billing.direct.order.create',
    key: idempotencyKey,
    principalId: buyerId,
    requestPayload: { productId, platform, buyerRegion },
    now,
    fn: () => {
      const buyer = db.prepare('SELECT id, kind FROM users WHERE id=?').get(buyerId);
      if (!buyer || buyer.kind !== 'registered') {
        throw new ApiError(403, 'REGISTERED_ACCOUNT_REQUIRED', 'Registered account is required to hold purchased entitlements');
      }

      const product = db.prepare('SELECT * FROM billing_creator_products WHERE id=?').get(productId);
      if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND');
      if (product.status !== 'ACTIVE') {
        throw new ApiError(403, 'PRODUCT_NOT_AVAILABLE', `Product status is ${product.status}`);
      }

      const productPlatforms = JSON.parse(product.allowed_platforms_json);
      if (!productPlatforms.includes(platform)) {
        throw new ApiError(403, 'PRODUCT_PLATFORM_NOT_ALLOWED');
      }
      const allowedRegions = JSON.parse(product.allowed_regions_json);
      if (buyerRegion && !allowedRegions.includes('*') && !allowedRegions.includes(String(buyerRegion).toUpperCase())) {
        throw new ApiError(403, 'PRODUCT_REGION_NOT_ALLOWED');
      }

      const conn = db.prepare('SELECT * FROM billing_creator_connections WHERE principal_id=?').get(product.creator_id);
      if (!conn || conn.onboarding_status !== 'ACTIVE' || conn.charges_enabled !== 1) {
        throw new ApiError(403, 'CREATOR_PAYMENTS_NOT_ACTIVE', 'Creator payment connection is not active');
      }

      const orderId = uid();
      const stamp = now();
      db.prepare(`
        INSERT INTO billing_direct_orders(
          id, buyer_id, creator_id, product_id, game_id, platform, provider,
          connected_account_id, provider_charge_id, currency, amount_minor,
          platform_fee_minor, state, idempotency_key, paid_at, created_at, updated_at
        ) VALUES(?,?,?,?,?,?,?,?,NULL,?,?,0,'CREATED',?,NULL,?,?)
      `).run(
        orderId, buyerId, product.creator_id, product.id, product.game_id, platform, conn.provider,
        conn.connected_account_id, product.currency, product.amount_minor, idempotencyKey, stamp, stamp
      );

      const order = db.prepare('SELECT * FROM billing_direct_orders WHERE id=?').get(orderId);
      return {
        status: 201,
        body: {
          order,
          directChargeSpec: {
            provider: conn.provider,
            connectedAccountId: conn.connected_account_id,
            currency: product.currency,
            amountMinor: product.amount_minor,
            applicationFeeAmount: 0 // Strictly 0% platform fee
          }
        }
      };
    }
  });

  return { replayed: outcome.replayed, ...outcome.body };
}

// 4. EntitlementService — Grant on verified direct payment (never touches PlayHub wallet!)
export function confirmDirectOrderPayment(db, {
  directOrderId,
  providerChargeId,
  expiresAt = null,
  idempotencyKey,
  now = Date.now
}) {
  if (!safeString(providerChargeId, 160)) throw new ApiError(400, 'PROVIDER_CHARGE_ID_REQUIRED');

  const outcome = withIdempotency({
    db,
    scope: 'billing.direct.order.confirm',
    key: idempotencyKey,
    requestPayload: { directOrderId, providerChargeId },
    now,
    fn: () => {
      const order = db.prepare('SELECT * FROM billing_direct_orders WHERE id=?').get(directOrderId);
      if (!order) throw new ApiError(404, 'DIRECT_ORDER_NOT_FOUND');
      if (order.state === 'PAID') {
        const existingEnt = db.prepare('SELECT * FROM billing_entitlements WHERE direct_order_id=?').get(directOrderId);
        return { status: 200, body: { order, entitlement: existingEnt } };
      }
      if (order.state !== 'CREATED') {
        throw new ApiError(409, 'DIRECT_ORDER_STATE_INVALID', `Cannot confirm order in state ${order.state}`);
      }

      const product = db.prepare('SELECT product_key FROM billing_creator_products WHERE id=?').get(order.product_id);
      const stamp = now();
      const updated = db.prepare(`
        UPDATE billing_direct_orders
        SET state='PAID', provider_charge_id=?, paid_at=?, updated_at=?
        WHERE id=? AND state='CREATED'
      `).run(providerChargeId, stamp, stamp, directOrderId);
      if (updated.changes !== 1) throw new ApiError(409, 'DIRECT_ORDER_CONCURRENT_MODIFICATION');

      const entId = uid();
      db.prepare(`
        INSERT INTO billing_entitlements(
          id, buyer_id, creator_id, game_id, product_id, product_key,
          direct_order_id, state, granted_at, expires_at, revoked_at, revoke_reason, updated_at
        ) VALUES(?,?,?,?,?,?,?,'ACTIVE',?,?,NULL,NULL,?)
      `).run(entId, order.buyer_id, order.creator_id, order.game_id, order.product_id, product.product_key, directOrderId, stamp, expiresAt, stamp);

      return {
        status: 200,
        body: {
          order: db.prepare('SELECT * FROM billing_direct_orders WHERE id=?').get(directOrderId),
          entitlement: db.prepare('SELECT * FROM billing_entitlements WHERE id=?').get(entId)
        }
      };
    }
  });

  return { replayed: outcome.replayed, ...outcome.body };
}

// 5. EntitlementService — Immediate revocation on refund or chargeback webhook
export function revokeDirectOrderEntitlement(db, {
  directOrderId,
  orderState = 'REFUNDED',
  reason,
  idempotencyKey,
  now = Date.now
}) {
  if (!['REFUNDED', 'CHARGEBACK'].includes(orderState)) throw new ApiError(400, 'REVOKE_STATE_INVALID');
  if (!safeString(reason, 160)) throw new ApiError(400, 'REVOKE_REASON_REQUIRED');

  const outcome = withIdempotency({
    db,
    scope: 'billing.direct.order.revoke',
    key: idempotencyKey,
    requestPayload: { directOrderId, orderState, reason },
    now,
    fn: () => {
      const order = db.prepare('SELECT * FROM billing_direct_orders WHERE id=?').get(directOrderId);
      if (!order) throw new ApiError(404, 'DIRECT_ORDER_NOT_FOUND');
      if (order.state !== 'PAID' && order.state !== orderState) {
        throw new ApiError(409, 'DIRECT_ORDER_NOT_REVOCABLE');
      }

      const stamp = now();
      db.prepare('UPDATE billing_direct_orders SET state=?, updated_at=? WHERE id=?').run(orderState, stamp, directOrderId);
      db.prepare(`
        UPDATE billing_entitlements
        SET state='REVOKED', revoked_at=COALESCE(revoked_at, ?), revoke_reason=?, updated_at=?
        WHERE direct_order_id=?
      `).run(stamp, reason, stamp, directOrderId);

      return {
        status: 200,
        body: {
          order: db.prepare('SELECT * FROM billing_direct_orders WHERE id=?').get(directOrderId),
          entitlement: db.prepare('SELECT * FROM billing_entitlements WHERE direct_order_id=?').get(directOrderId)
        }
      };
    }
  });

  return { replayed: outcome.replayed, ...outcome.body };
}

export function listActiveEntitlements(db, { buyerId, gameId = null, now = Date.now }) {
  const stamp = now();
  if (gameId) {
    return db.prepare(`
      SELECT * FROM billing_entitlements
      WHERE buyer_id=? AND game_id=? AND state='ACTIVE' AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY granted_at DESC
    `).all(buyerId, gameId, stamp);
  }
  return db.prepare(`
    SELECT * FROM billing_entitlements
    WHERE buyer_id=? AND state='ACTIVE' AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY granted_at DESC
  `).all(buyerId, stamp);
}

// 6. RiskControls — Suspend fraudulent product or creator connection immediately
export function suspendCreatorProduct(db, { productId, now = Date.now }) {
  const updated = db.prepare("UPDATE billing_creator_products SET status='SUSPENDED', updated_at=? WHERE id=?").run(now(), productId);
  if (updated.changes !== 1) throw new ApiError(404, 'PRODUCT_NOT_FOUND');
  return db.prepare('SELECT * FROM billing_creator_products WHERE id=?').get(productId);
}

export function suspendCreatorConnection(db, { principalId, now = Date.now }) {
  const updated = db.prepare(
    "UPDATE billing_creator_connections SET onboarding_status='SUSPENDED', charges_enabled=0, updated_at=? WHERE principal_id=?"
  ).run(now(), principalId);
  if (updated.changes !== 1) throw new ApiError(404, 'CREATOR_CONNECTION_NOT_FOUND');
  return db.prepare('SELECT * FROM billing_creator_connections WHERE principal_id=?').get(principalId);
}

export function restoreCreatorProduct(db, { productId, now = Date.now }) {
  const updated = db.prepare("UPDATE billing_creator_products SET status='ACTIVE', updated_at=? WHERE id=?").run(now(), productId);
  if (updated.changes !== 1) throw new ApiError(404, 'PRODUCT_NOT_FOUND');
  return db.prepare('SELECT * FROM billing_creator_products WHERE id=?').get(productId);
}

export function restoreCreatorConnection(db, { principalId, chargesEnabled = true, now = Date.now }) {
  const updated = db.prepare(
    "UPDATE billing_creator_connections SET onboarding_status='ACTIVE', charges_enabled=?, updated_at=? WHERE principal_id=?"
  ).run(chargesEnabled ? 1 : 0, now(), principalId);
  if (updated.changes !== 1) throw new ApiError(404, 'CREATOR_CONNECTION_NOT_FOUND');
  return db.prepare('SELECT * FROM billing_creator_connections WHERE principal_id=?').get(principalId);
}

export function getCreatorConnection(db, principalId) {
  if (!safeString(principalId, 128)) throw new ApiError(400, 'PRINCIPAL_REQUIRED');
  return db.prepare('SELECT * FROM billing_creator_connections WHERE principal_id=?').get(principalId) || null;
}

export function updateCreatorProduct(db, {
  creatorId,
  productId,
  title,
  amountMinor,
  allowedRegions,
  allowedPlatforms,
  ageRating,
  status,
  now = Date.now
}) {
  const existing = db.prepare('SELECT * FROM billing_creator_products WHERE id=? AND creator_id=?').get(productId, creatorId);
  if (!existing) throw new ApiError(404, 'PRODUCT_NOT_FOUND');
  if (existing.status === 'SUSPENDED') {
    throw new ApiError(403, 'PRODUCT_ADMIN_SUSPENDED', 'Suspended products can only be restored by a PlayHub administrator');
  }

  const nextTitle = title !== undefined ? title : existing.title;
  const nextAmount = amountMinor !== undefined ? amountMinor : existing.amount_minor;
  const nextRegions = allowedRegions !== undefined ? allowedRegions : JSON.parse(existing.allowed_regions_json);
  const nextPlatforms = allowedPlatforms !== undefined ? allowedPlatforms : JSON.parse(existing.allowed_platforms_json);
  const nextAge = ageRating !== undefined ? ageRating : existing.age_rating;
  const nextStatus = status !== undefined ? status : existing.status;

  if (!safeString(nextTitle, 160)) throw new ApiError(422, 'PRODUCT_TITLE_REQUIRED');
  if (!Number.isSafeInteger(nextAmount) || nextAmount <= 0) throw new ApiError(422, 'PRODUCT_AMOUNT_INVALID');
  if (!Array.isArray(nextPlatforms) || !nextPlatforms.length || nextPlatforms.some(p => !ALL_PLATFORMS.has(p))) {
    throw new ApiError(422, 'ALLOWED_PLATFORMS_INVALID');
  }
  if (!['ALL', '12+', '15+', '18+'].includes(nextAge)) throw new ApiError(422, 'AGE_RATING_INVALID');
  if (!['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(nextStatus)) {
    throw new ApiError(422, 'PRODUCT_STATUS_INVALID');
  }

  db.prepare(`
    UPDATE billing_creator_products
    SET title=?, amount_minor=?, allowed_regions_json=?, allowed_platforms_json=?, age_rating=?, status=?, updated_at=?
    WHERE id=? AND creator_id=?
  `).run(
    nextTitle, nextAmount, JSON.stringify(nextRegions), JSON.stringify(nextPlatforms),
    nextAge, nextStatus, now(), productId, creatorId
  );
  return db.prepare('SELECT * FROM billing_creator_products WHERE id=?').get(productId);
}

export function listCreatorProducts(db, { creatorId = null, gameId = null, activeOnly = false, limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const clauses = [];
  const params = [];
  if (creatorId) { clauses.push('creator_id=?'); params.push(creatorId); }
  if (gameId) { clauses.push('game_id=?'); params.push(gameId); }
  if (activeOnly) { clauses.push("status='ACTIVE'"); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(safeLimit);
  return db.prepare(`SELECT * FROM billing_creator_products ${where} ORDER BY created_at DESC LIMIT ?`).all(...params);
}

export function listCreatorDirectOrders(db, { creatorId, limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return db.prepare(`
    SELECT o.*, p.title AS product_title, p.product_key, e.id AS entitlement_id, e.state AS entitlement_state
    FROM billing_direct_orders o
    JOIN billing_creator_products p ON p.id = o.product_id
    LEFT JOIN billing_entitlements e ON e.direct_order_id = o.id
    WHERE o.creator_id = ?
    ORDER BY o.created_at DESC
    LIMIT ?
  `).all(creatorId, safeLimit);
}

export function consumeEntitlement(db, { buyerId, entitlementId, idempotencyKey, now = Date.now }) {
  if (!safeString(entitlementId, 128)) throw new ApiError(400, 'ENTITLEMENT_ID_REQUIRED');

  const outcome = withIdempotency({
    db,
    scope: 'billing.direct.entitlement.consume',
    key: idempotencyKey,
    principalId: buyerId,
    requestPayload: { entitlementId },
    now,
    fn: () => {
      const ent = db.prepare(`
        SELECT e.*, p.kind AS product_kind
        FROM billing_entitlements e
        JOIN billing_creator_products p ON p.id = e.product_id
        WHERE e.id=? AND e.buyer_id=?
      `).get(entitlementId, buyerId);
      if (!ent) throw new ApiError(404, 'ENTITLEMENT_NOT_FOUND');
      if (ent.product_kind !== 'consumable') {
        throw new ApiError(422, 'ENTITLEMENT_NOT_CONSUMABLE', 'Only consumable entitlements can be consumed');
      }
      const stamp = now();
      if (ent.expires_at !== null && ent.expires_at <= stamp) {
        throw new ApiError(422, 'ENTITLEMENT_EXPIRED');
      }
      if (ent.state !== 'ACTIVE') {
        throw new ApiError(409, 'ENTITLEMENT_NOT_ACTIVE', `Entitlement state is ${ent.state}`);
      }

      const updated = db.prepare(`
        UPDATE billing_entitlements
        SET state='CONSUMED', updated_at=?
        WHERE id=? AND buyer_id=? AND state='ACTIVE'
      `).run(stamp, entitlementId, buyerId);
      if (updated.changes !== 1) throw new ApiError(409, 'ENTITLEMENT_NOT_ACTIVE');

      return {
        status: 200,
        body: {
          entitlement: db.prepare('SELECT * FROM billing_entitlements WHERE id=?').get(entitlementId)
        }
      };
    }
  });

  return { replayed: outcome.replayed, ...outcome.body };
}
