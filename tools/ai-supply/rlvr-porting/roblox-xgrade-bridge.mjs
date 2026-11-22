// N1 — Roblox X-Grade API Bridge -> PlayHub SSOT DataStore & Track B 0% Direct Commerce
// Pure Node 24 ESM (zero external dependencies)
// Enforces:
//   - hub/server/ssot/datastore.mjs SCOPE_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/
//   - hub/server/billing/direct-commerce.mjs Track B 0% platform fee (platform_fee_bps: 0)

import { createHash } from 'node:crypto';

// Exact regex from hub/server/ssot/datastore.mjs:5
export const DATASTORE_SCOPE_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;

const VALID_PRODUCT_KINDS = new Set(['pass', 'consumable', 'durable', 'game_access']);

function shortHashHex(input, length = 8) {
  return createHash('sha256').update(String(input), 'utf8').digest('hex').slice(0, length);
}

/**
 * Normalizes any Roblox DataStore name into a valid PlayHub SSOT scope matching
 * /^[a-z0-9][a-z0-9_-]{0,31}$/ with a deterministic collision-safe hash suffix
 * whenever normalization or truncation is required (or when alwaysHash is true).
 */
export function slugifyDataStoreScope(storeName, options = {}) {
  const { alwaysHash = false, hashLength = 8 } = options;
  const raw = String(storeName ?? '');
  const trimmed = raw.trim();

  if (!alwaysHash && DATASTORE_SCOPE_RE.test(raw) && raw === trimmed) {
    return raw;
  }

  const suffixLen = Math.max(6, Math.min(12, hashLength));
  const suffix = shortHashHex(raw, suffixLen);

  // Convert camelCase boundaries and non-alphanumeric runs to underscores, lowercase ASCII
  let stem = trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[_-]+$/, '');

  if (!stem) {
    stem = 'ds';
  }

  // Max total length is 32: stem + '_' + suffix
  const maxStemLen = 32 - 1 - suffixLen;
  if (stem.length > maxStemLen) {
    stem = stem.slice(0, maxStemLen).replace(/[_-]+$/, '') || 'ds';
  }

  const slug = `${stem}_${suffix}`;
  if (!DATASTORE_SCOPE_RE.test(slug)) {
    return `ds_${suffix}`.slice(0, 32);
  }
  return slug;
}

function normalizeProductKind(rawType, rawKind) {
  const k = String(rawKind || '').toLowerCase().trim();
  if (VALID_PRODUCT_KINDS.has(k)) return k;
  const t = String(rawType || '').toLowerCase().trim();
  if (t === 'gamepass' || t === 'game_pass' || t === 'pass') return 'pass';
  if (t === 'durable') return 'durable';
  if (t === 'devproduct' || t === 'dev_product' || t === 'product' || t === 'consumable') return 'consumable';
  return 'consumable';
}

function estimateDefaultPriceMinor(ref, currency) {
  if (Number.isSafeInteger(ref.amountMinor) && ref.amountMinor > 0) return ref.amountMinor;
  if (Number.isSafeInteger(ref.priceMinor) && ref.priceMinor > 0) return ref.priceMinor;
  const robux = Number(ref.priceRobux ?? ref.robux ?? 0);
  if (Number.isFinite(robux) && robux > 0) {
    // Rough creator draft conversion: 1 Robux ≈ 15 KRW (or 0.0125 USD -> 1.25 cents)
    const rate = currency === 'KRW' ? 15 : 1.25;
    return Math.max(100, Math.round(robux * rate));
  }
  return currency === 'KRW' ? 1500 : 199;
}

/**
 * Generates a PlayHub Track B 0%-fee commerce_manifest.json mapping numeric Roblox
 * gamePassId / devProductId references to billing_creator_products draft descriptors.
 */
export function generateCommerceManifest(gameId, robloxMarketplaceRefs = [], options = {}) {
  const cleanGameId = String(gameId ?? '').trim();
  if (!cleanGameId) {
    throw new Error('generateCommerceManifest requires a non-empty gameId');
  }
  const currency = String(options.currency || 'KRW').toUpperCase();
  const allowedPlatforms = Array.isArray(options.allowedPlatforms) && options.allowedPlatforms.length > 0
    ? options.allowedPlatforms
    : ['web'];
  const allowedRegions = Array.isArray(options.allowedRegions) && options.allowedRegions.length > 0
    ? options.allowedRegions
    : ['*'];
  const ageRating = options.ageRating || 'ALL';
  const generatedAt = options.generatedAt || new Date().toISOString();

  const seenKeys = new Set();
  const products = [];

  for (const raw of Array.isArray(robloxMarketplaceRefs) ? robloxMarketplaceRefs : []) {
    if (!raw || typeof raw !== 'object') continue;
    const isGamePass = raw.gamePassId !== undefined && raw.gamePassId !== null;
    const isDevProduct = raw.devProductId !== undefined && raw.devProductId !== null;
    const numericId = Number(raw.gamePassId ?? raw.devProductId ?? raw.robloxId ?? raw.id);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) continue;

    const robloxRefType = isGamePass
      ? 'gamepass'
      : isDevProduct
        ? 'devproduct'
        : String(raw.type || raw.robloxRefType || 'devproduct').toLowerCase();

    const kind = normalizeProductKind(robloxRefType, raw.kind);
    const keyPrefix = kind === 'pass' ? 'rbx_pass' : kind === 'durable' ? 'rbx_durable' : 'rbx_prod';
    const productKey = raw.productKey || `${keyPrefix}_${numericId}`;

    if (seenKeys.has(productKey)) continue;
    seenKeys.add(productKey);

    const title = String(
      raw.title ||
      raw.name ||
      `${kind === 'pass' ? 'Game Pass' : kind === 'durable' ? 'Durable Item' : 'Developer Product'} #${numericId}`
    ).trim().slice(0, 160);

    const amountMinor = estimateDefaultPriceMinor(raw, currency);

    products.push({
      robloxRefType,
      robloxNumericId: numericId,
      product_key: productKey,
      game_id: cleanGameId,
      kind,
      title,
      currency,
      amount_minor: amountMinor,
      platform_fee_bps: 0,
      allowed_regions: [...allowedRegions],
      allowed_platforms: [...allowedPlatforms],
      age_rating: ageRating,
      status: 'DRAFT',
      source_file: raw.sourceFile || null,
      billing_endpoints: {
        entitlement_check: `/api/billing/entitlements?gameId=${encodeURIComponent(cleanGameId)}`,
        create_order: '/api/billing/direct/orders',
        consume_entitlement: '/api/billing/entitlements/:id/consume',
      },
    });
  }

  return {
    schemaVersion: 1,
    track: 'B_DIRECT_COMMERCE',
    gameId: cleanGameId,
    platform_fee_bps: 0,
    platform_fee_percent: 0,
    currency,
    generatedAt,
    productCount: products.length,
    products,
  };
}

/**
 * Extracts numeric GamePass / Developer Product IDs referenced in Luau or GDScript snippets.
 */
export function extractMarketplaceRefsFromSource(source) {
  const text = String(source ?? '');
  const refs = [];
  const seen = new Set();

  const patterns = [
    { type: 'gamepass', kind: 'pass', re: /(?:UserOwnsGamePassAsync|user_owns_game_pass_async)\s*\([^,\r\n]+,\s*(\d{2,15})\s*\)/g },
    { type: 'gamepass', kind: 'pass', re: /(?:PromptGamePassPurchase|prompt_game_pass_purchase)\s*\([^,\r\n]+,\s*(\d{2,15})\s*\)/g },
    { type: 'devproduct', kind: 'consumable', re: /(?:PromptProductPurchase|prompt_product_purchase)\s*\([^,\r\n]+,\s*(\d{2,15})\s*\)/g },
    { type: 'devproduct', kind: 'consumable', re: /ProductId\s*==\s*(\d{2,15})/g },
  ];

  for (const { type, kind, re } of patterns) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const id = Number(m[1]);
      const key = `${type}:${id}`;
      if (!Number.isSafeInteger(id) || seen.has(key)) continue;
      seen.add(key);
      refs.push({
        type,
        kind,
        ...(type === 'gamepass' ? { gamePassId: id } : { devProductId: id }),
      });
    }
  }
  return refs;
}

/**
 * Rewrites Roblox X-Grade DataStoreService & MarketplaceService calls (from Luau or
 * partially transpiled GDScript) into async `await` GDScript wired to PlayHub SSOT
 * DataStore (with CAS retry on UpdateAsync) and Track B 0% Billing.
 */
export function rewriteRobloxXGradeSnippet(luauOrGdSnippet, options = {}) {
  const {
    gameId = 'playhub_game',
    casMaxRetries = 3,
    bindPrincipalId = false,
  } = options;

  let code = String(luauOrGdSnippet ?? '');
  const rewrites = [];
  const discoveredScopes = [];
  const scopeSeen = new Set();

  const recordScope = (originalName, kind) => {
    const slug = slugifyDataStoreScope(originalName);
    if (!scopeSeen.has(`${kind}:${originalName}`)) {
      scopeSeen.add(`${kind}:${originalName}`);
      discoveredScopes.push({ originalName, scope: slug, kind });
    }
    return slug;
  };

  // 1. GetDataStore("Name") or RobloxCompat.get_datastore_stub("Name")
  code = code.replace(
    /(?:([A-Za-z_]\w*)\s*[:.]\s*GetDataStore|RobloxCompat\.get_datastore_stub)\s*\(\s*["']([^"']+)["'](?:\s*,\s*([^)\r\n]+))?\s*\)/g,
    (_m, _recv, rawName) => {
      const scope = recordScope(rawName, 'datastore');
      rewrites.push({ api: 'DataStoreService.GetDataStore', from: rawName, to: scope });
      return `PlayHubDataStore.open_scope("${scope}")`;
    }
  );

  // 2. GetOrderedDataStore("Name") -> SSOT Leaderboard bridge
  code = code.replace(
    /([A-Za-z_]\w*)\s*[:.]\s*GetOrderedDataStore\s*\(\s*["']([^"']+)["'](?:\s*,\s*([^)\r\n]+))?\s*\)/g,
    (_m, _recv, rawName) => {
      const scope = recordScope(rawName, 'ordered_leaderboard');
      rewrites.push({ api: 'DataStoreService.GetOrderedDataStore', from: rawName, to: scope });
      return `PlayHubLeaderboard.open_board("${scope}")`;
    }
  );

  // 3. DataStore GetAsync / get_async -> await <recv>.get_async(...)
  code = code.replace(
    /(?<!await\s)(\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*[:.]\s*(?:GetAsync|get_async)\s*\(([^)\r\n]*)\)/g,
    (_m, recv, args) => {
      rewrites.push({ api: 'DataStore.GetAsync', target: `${recv}.get_async` });
      return `await ${recv}.get_async(${args.trim()})`;
    }
  );

  // 4. DataStore SetAsync / set_async -> await <recv>.set_async(...)
  code = code.replace(
    /(?<!await\s)(\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*[:.]\s*(?:SetAsync|set_async)\s*\(([^)\r\n]*)\)/g,
    (_m, recv, args) => {
      rewrites.push({ api: 'DataStore.SetAsync', target: `${recv}.set_async` });
      return `await ${recv}.set_async(${args.trim()})`;
    }
  );

  // 5. DataStore RemoveAsync / remove_async -> await <recv>.remove_async(...)
  code = code.replace(
    /(?<!await\s)(\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*[:.]\s*(?:RemoveAsync|remove_async)\s*\(([^)\r\n]*)\)/g,
    (_m, recv, args) => {
      rewrites.push({ api: 'DataStore.RemoveAsync', target: `${recv}.remove_async` });
      return `await ${recv}.remove_async(${args.trim()})`;
    }
  );

  // 6. DataStore UpdateAsync / update_async -> await <recv>.update_async(key, fn, {"max_retries": 3, "cas_mode": "expected_revision"})
  code = code.replace(
    /(?<!await\s)(\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*[:.]\s*(?:UpdateAsync|update_async)\s*\(([^)\r\n]*)\)/g,
    (_m, recv, args) => {
      rewrites.push({ api: 'DataStore.UpdateAsync', target: `${recv}.update_async`, casMaxRetries });
      const trimmedArgs = args.trim();
      const hasOpts = trimmedArgs.includes('cas_mode') || trimmedArgs.includes('max_retries');
      const finalArgs = hasOpts
        ? trimmedArgs
        : `${trimmedArgs}, {"max_retries": ${casMaxRetries}, "cas_mode": "expected_revision"}`;
      return `await ${recv}.update_async(${finalArgs})`;
    }
  );

  // Extract Marketplace numeric IDs before rewriting
  const discoveredMarketplaceRefs = extractMarketplaceRefsFromSource(code);

  // 7. MarketplaceService UserOwnsGamePassAsync -> await PlayHubBilling.user_owns_game_pass_async(...)
  code = code.replace(
    /(?<!await\s)(?:\b[A-Za-z_]\w*\s*[:.]\s*)?(?:UserOwnsGamePassAsync|user_owns_game_pass_async)\s*\(([^)\r\n]*)\)/g,
    (_m, args) => {
      rewrites.push({ api: 'MarketplaceService.UserOwnsGamePassAsync', endpoint: `/api/billing/entitlements?gameId=${gameId}` });
      return `await PlayHubBilling.user_owns_game_pass_async(${args.trim()})`;
    }
  );

  // 8. MarketplaceService PromptGamePassPurchase -> await PlayHubBilling.prompt_game_pass_purchase(...)
  code = code.replace(
    /(?<!await\s)(?:\b[A-Za-z_]\w*\s*[:.]\s*)?(?:PromptGamePassPurchase|prompt_game_pass_purchase)\s*\(([^)\r\n]*)\)/g,
    (_m, args) => {
      rewrites.push({ api: 'MarketplaceService.PromptGamePassPurchase', endpoint: '/api/billing/direct/orders' });
      return `await PlayHubBilling.prompt_game_pass_purchase(${args.trim()})`;
    }
  );

  // 9. MarketplaceService PromptProductPurchase -> await PlayHubBilling.prompt_product_purchase(...)
  code = code.replace(
    /(?<!await\s)(?:\b[A-Za-z_]\w*\s*[:.]\s*)?(?:PromptProductPurchase|prompt_product_purchase)\s*\(([^)\r\n]*)\)/g,
    (_m, args) => {
      rewrites.push({ api: 'MarketplaceService.PromptProductPurchase', endpoint: '/api/billing/direct/orders' });
      return `await PlayHubBilling.prompt_product_purchase(${args.trim()})`;
    }
  );

  // 10. MarketplaceService.ProcessReceipt = handler -> PlayHubBilling.process_receipt(handler)
  code = code.replace(
    /(?:\b[A-Za-z_]\w*\.)?ProcessReceipt\s*=\s*([^\r\n]+)/g,
    (_m, rhs) => {
      rewrites.push({ api: 'MarketplaceService.ProcessReceipt', endpoint: '/api/billing/entitlements/:id/consume' });
      return `PlayHubBilling.process_receipt(${rhs.trim()})`;
    }
  );

  // Optional principalId binding for Roblox Player.UserId
  if (bindPrincipalId) {
    code = code.replace(/\b([A-Za-z_]\w*)\.(?:UserId|user_id)\b/g, (_m, playerVar) => {
      rewrites.push({ api: 'Player.UserId', target: 'PlayHubSession.get_principal_id' });
      return `PlayHubSession.get_principal_id(${playerVar})`;
    });
  }

  return {
    code,
    rewrites,
    discoveredScopes,
    discoveredMarketplaceRefs,
    hasAsyncCalls: /\bawait\s+/.test(code),
  };
}
