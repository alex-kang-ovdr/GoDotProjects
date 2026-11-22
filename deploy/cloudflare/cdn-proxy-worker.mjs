/**
 * PlayHub Cloud Run Front-Door CDN Edge Proxy (Cloudflare Workers)
 *
 * Offloads 90-99% of Cloud Run network egress (Godot 4.7.2 immutable WASM/JS,
 * Hub static assets, immutable CAS UGC .pck bundles, and anonymous public catalogs)
 * onto Cloudflare's free global edge cache while strictly bypassing authenticated
 * sessions, mutations, WebSockets, and Forge editor/build calls.
 *
 * Environment variables (wrangler.toml / Cloudflare dashboard):
 *   ORIGIN_URL = "https://playhub-hub-88778617121.us-west1.run.app"
 */

const IMMUTABLE_PREFIXES = ['/runtime/godot/'];
const PUBLIC_ANON_API_PATHS = new Set([
  '/api/games',
  '/api/avatar/catalog',
  '/api/store/catalog',
]);
const BYPASS_PREFIXES = [
  '/forge/',
  '/api/auth/',
  '/api/creator/',
  '/api/billing/',
  '/api/admin/',
  '/api/store/my-assets',
  '/api/store/session',
  '/internal/',
  '/_healthz',
];

function isCacheableRequest(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') return false;
  const { pathname } = url;
  if (BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) return false;

  // Immutable shared Godot runtime: always cacheable regardless of cookies
  if (IMMUTABLE_PREFIXES.some((p) => pathname.startsWith(p))) return true;

  // Immutable CAS UGC binary/asset files (non-HTML); HTML always revalidates for instant CAS switchover
  if (pathname.startsWith('/play-ugc/')) {
    return !pathname.endsWith('.html') && !pathname.endsWith('/');
  }

  // Anonymous public catalog APIs: NEVER cache when Cookie or Authorization is present
  if (PUBLIC_ANON_API_PATHS.has(pathname)) {
    return !request.headers.has('cookie') && !request.headers.has('authorization');
  }

  // Static Hub JS/CSS/images/fonts (non-HTML)
  if (/\.(?:js|mjs|css|svg|png|jpe?g|webp|ico|woff2|glb)$/i.test(pathname)) {
    return true;
  }

  return false;
}

function parseCdnMaxAge(response) {
  const cdnCc = response.headers.get('cdn-cache-control') || response.headers.get('cache-control') || '';
  if (/\bno-store\b|\bprivate\b/i.test(cdnCc)) return 0;
  const m = cdnCc.match(/(?:^|,\s*)(?:s-maxage|max-age)=(\d+)/i);
  return m ? Number(m[1]) : 0;
}

export default {
  async fetch(request, env, ctx) {
    const originBase = String(env?.ORIGIN_URL || '').trim().replace(/\/$/, '');
    if (!originBase) {
      return new Response('ORIGIN_URL is not configured', { status: 500 });
    }

    const reqUrl = new URL(request.url);
    const upstreamUrl = new URL(reqUrl.pathname + reqUrl.search, originBase);
    const cacheable = isCacheableRequest(request, reqUrl);
    const cache = caches.default;

    // Cache key normalized without cookies/auth; Cloudflare handles Accept-Encoding transparently
    const cacheKey = cacheable ? new Request(upstreamUrl.toString(), { method: 'GET' }) : null;
    if (cacheKey && request.method === 'GET') {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const hitHeaders = new Headers(cached.headers);
        hitHeaders.set('X-PlayHub-Edge-Cache', 'HIT');
        return new Response(cached.body, { status: cached.status, headers: hitHeaders });
      }
    }

    const fwdHeaders = new Headers(request.headers);
    fwdHeaders.set('X-Forwarded-Host', reqUrl.host);
    fwdHeaders.set('X-Forwarded-Proto', reqUrl.protocol.replace(':', ''));
    if (cacheable) {
      // Strip credentials on cacheable public requests so origin returns anonymous CDN-Cache-Control
      fwdHeaders.delete('cookie');
      fwdHeaders.delete('authorization');
    }

    const upstreamRes = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers: fwdHeaders,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });

    const resHeaders = new Headers(upstreamRes.headers);
    const maxAge = cacheable && upstreamRes.status === 200 && !resHeaders.has('set-cookie')
      ? parseCdnMaxAge(upstreamRes)
      : 0;

    resHeaders.set('X-PlayHub-Edge-Cache', maxAge > 0 ? 'MISS' : 'BYPASS');
    const outRes = new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: resHeaders,
    });

    if (cacheKey && request.method === 'GET' && maxAge > 0) {
      ctx.waitUntil(cache.put(cacheKey, outRes.clone()));
    }
    return outRes;
  },
};
