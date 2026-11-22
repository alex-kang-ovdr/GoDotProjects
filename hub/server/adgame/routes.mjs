import { readCatalog } from '../catalog.mjs';
import { ApiError, json, readJson, redirect, safeString } from '../security.mjs';
import { classifyUserAgent, createAdGameService } from './service.mjs';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function resolveRequestOrigin(req, fallbackBaseUrl) {
  const protoHeader = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (hostHeader && /^[a-zA-Z0-9._:-]+$/.test(hostHeader)) {
    const proto = protoHeader === 'https' || protoHeader === 'http' ? protoHeader : 'http';
    return `${proto}://${hostHeader}`;
  }
  return String(fallbackBaseUrl || 'http://127.0.0.1:18280').replace(/\/$/, '');
}

function renderSmartRouterHtml({ preview, uaFamily, rawCode }) {
  const snap = preview.snapshot || {};
  const title = snap.titleKo || preview.targetGameId;
  const rewardLabel = snap.reward?.label || '스타터 보상';
  const region = preview.regionTag || '우리동네';
  const isAndroid = uaFamily.startsWith('android');
  const isIos = uaFamily.startsWith('ios');
  const webUrl = preview.links.externalFullHub ? preview.links.webContinueUrl : preview.links.webContinuePath;
  const intentUrl = preview.links.androidIntentUrl;
  const storeUrl = isIos ? preview.links.appStoreUrl : preview.links.playStoreUrl;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${escapeHtml(title)} — PlayHub로 이어하기</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Pretendard", "Segoe UI", sans-serif; background: #111317; color: #f5f7fb; min-height: 100dvh; display: grid; place-items: center; padding: 20px; }
    .card { width: 100%; max-width: 420px; background: #1a1d24; border: 1px solid #2b313d; border-radius: 22px; padding: 24px; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; background: rgba(255,111,15,.16); color: #ff8a3d; font-size: 12px; font-weight: 700; }
    h1 { margin: 14px 0 6px; font-size: 22px; line-height: 1.3; }
    .sub { margin: 0 0 18px; color: #a7b0c0; font-size: 14px; line-height: 1.5; }
    .summary { background: #12151b; border: 1px solid #262c37; border-radius: 14px; padding: 14px; margin-bottom: 18px; display: grid; gap: 8px; font-size: 13px; }
    .row { display: flex; justify-content: space-between; gap: 10px; }
    .row span:first-child { color: #8c96a8; }
    .code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 18px; letter-spacing: .16em; color: #ff9c57; font-weight: 800; }
    .btn { display: block; width: 100%; text-align: center; text-decoration: none; border: 0; border-radius: 13px; padding: 14px 16px; font-size: 15px; font-weight: 700; cursor: pointer; margin-top: 10px; }
    .btn-primary { background: linear-gradient(135deg, #ff6f0f, #ff8d3a); color: #fff; }
    .btn-secondary { background: #262c38; color: #e8edf7; }
    .btn-ghost { background: transparent; color: #96a0b4; border: 1px solid #2d3442; font-size: 13px; }
    .meta { margin-top: 14px; font-size: 11px; color: #788296; word-break: break-all; }
  </style>
</head>
<body>
  <main class="card">
    <span class="badge">🥕 ${escapeHtml(region)} 데모 연동 · 스마트 라우터 (${escapeHtml(uaFamily)})</span>
    <h1>${escapeHtml(title)} 본 게임으로 이동</h1>
    <p class="sub">방금 플레이한 데모 기록과 스타터 보상이 PlayHub에 자동 연결됩니다.</p>
    <section class="summary">
      <div class="row"><span>데모 기록</span><strong>${escapeHtml(Number(snap.score || 0).toLocaleString())}점 (상위 ${escapeHtml(snap.topPercent || 10)}%)</strong></div>
      <div class="row"><span>지급 예정 보상</span><strong>🎁 ${escapeHtml(rewardLabel)}</strong></div>
      <div class="row"><span>이어하기 코드</span><span class="code">${escapeHtml(preview.shortCode)}</span></div>
      <div class="row"><span>토큰 상태</span><strong>${escapeHtml(preview.status)}</strong></div>
    </section>
    <a class="btn btn-primary" href="${escapeHtml(webUrl)}">⚡ PlayHub 웹 본편에서 바로 이어하기</a>
    ${isAndroid ? `<a class="btn btn-secondary" href="${escapeHtml(intentUrl)}">📱 Android PlayHub 앱 열기 / 설치</a>` : ''}
    ${isIos ? `<a class="btn btn-secondary" href="${escapeHtml(storeUrl)}">🍎 iOS App Store에서 PlayHub 설치</a>` : ''}
    ${!isAndroid && !isIos ? `<a class="btn btn-secondary" href="${escapeHtml(storeUrl)}" target="_blank" rel="noopener">📱 모바일 스토어 링크 확인 (Install Referrer)</a>` : ''}
    <a class="btn btn-ghost" href="/adgame/">← 당근 PoC 피드로 돌아가기</a>
    <p class="meta">Code: ${escapeHtml(rawCode)} · Target: ${escapeHtml(preview.targetGameId)} · Referrer: ${escapeHtml(preview.links.referrerParam)}</p>
  </main>
</body>
</html>`;
}

export function createAdGame({ config, db, rootDir, now, rate, audit, env = process.env }) {
  const androidPackage = config.mobile?.androidPackage || env.PLAYHUB_ANDROID_PACKAGE || 'com.playhub.gamedev.live';
  const androidSha256 = (config.mobile?.androidSha256Fingerprints || env.PLAYHUB_ANDROID_SHA256 || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const fullHubBaseUrl = config.adgame?.fullHubBaseUrl || env.PLAYHUB_ADGAME_FULL_HUB_URL || '';

  const service = createAdGameService({
    db,
    now,
    catalogGames: () => readCatalog(rootDir, db),
    androidPackage,
    fullHubBaseUrl
  });

  async function publicRoute(req, res, url, { getSession, rateLimitIp }) {
    const pathname = url.pathname;

    // 1) Android App Links (.well-known/assetlinks.json)
    if (pathname === '/.well-known/assetlinks.json' && (req.method === 'GET' || req.method === 'HEAD')) {
      const fingerprints = androidSha256.length ? androidSha256 : ['00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00'];
      const payload = JSON.stringify([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: androidPackage,
            sha256_cert_fingerprints: fingerprints
          }
        }
      ]);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(req.method === 'HEAD' ? undefined : payload);
      return true;
    }

    // 2) Smart Router: GET /ad/go/:code
    const goMatch = pathname.match(/^\/ad\/go\/([A-Za-z0-9_-]{4,64})$/);
    if (goMatch && req.method === 'GET') {
      const code = goMatch[1];
      const baseOrigin = resolveRequestOrigin(req, config.userBaseUrl);
      const preview = service.previewHandoff(code, baseOrigin);
      const uaFamily = classifyUserAgent(req.headers['user-agent'] || '');
      try {
        service.recordEvent({
          sessionId: preview.sessionId,
          eventType: 'store_redirect',
          meta: { via: 'smart_router', uaFamily, shortCode: preview.shortCode }
        });
      } catch {}
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(renderSmartRouterHtml({ preview, uaFamily, rawCode: code }));
      return true;
    }

    // 3) Universal Link / App Link browser fallback: GET /ad/claim/:token
    const claimLinkMatch = pathname.match(/^\/ad\/claim\/([A-Za-z0-9_-]{4,128})$/);
    if (claimLinkMatch && req.method === 'GET') {
      const tokenOrCode = claimLinkMatch[1];
      const baseOrigin = resolveRequestOrigin(req, config.userBaseUrl);
      const preview = service.previewHandoff(tokenOrCode, baseOrigin);
      const target = preview.targetGameId;
      const dest = preview.links.externalFullHub
        ? preview.links.webContinueUrl
        : `/play/${encodeURIComponent(target)}/?ad_handoff=${encodeURIComponent(tokenOrCode)}&autolaunch=1`;
      redirect(res, dest);
      return true;
    }

    // 4) Public AdGame REST APIs (/api/adgame/*)
    if (!pathname.startsWith('/api/adgame/')) return false;

    const ip = rateLimitIp ? rateLimitIp(req) : (req.socket?.remoteAddress || 'unknown');
    rate(`adgame:${ip}`, 300, 60000);

    if (pathname === '/api/adgame/campaigns' && req.method === 'GET') {
      const partnerId = url.searchParams.get('partner') || undefined;
      json(res, 200, service.listCampaigns({ partnerId }));
      return true;
    }

    if (pathname === '/api/adgame/sessions' && req.method === 'POST') {
      const body = await readJson(req, 16 * 1024);
      const session = service.startDemoSession({
        campaignId: body.campaignId,
        partnerId: body.partnerId,
        regionTag: body.regionTag,
        userAgent: body.userAgent || req.headers['user-agent'] || ''
      });
      json(res, 201, session);
      return true;
    }

    if (pathname === '/api/adgame/events' && req.method === 'POST') {
      const body = await readJson(req, 16 * 1024);
      const result = service.recordEvent({
        sessionId: body.sessionId,
        campaignId: body.campaignId,
        partnerId: body.partnerId,
        eventType: body.eventType,
        playMs: body.playMs,
        score: body.score,
        stage: body.stage,
        meta: body.meta
      });
      json(res, 201, result);
      return true;
    }

    const handoffMatch = pathname.match(/^\/api\/adgame\/sessions\/([a-zA-Z0-9_-]+)\/handoff$/);
    if (handoffMatch && req.method === 'POST') {
      const body = await readJson(req, 16 * 1024);
      const baseOrigin = resolveRequestOrigin(req, config.userBaseUrl);
      const issued = service.issueHandoffToken({
        sessionId: handoffMatch[1],
        score: body.score,
        stage: body.stage,
        playMs: body.playMs,
        carryOver: body.carryOver,
        targetOverride: body.targetGameId || null,
        baseOrigin
      });
      audit('adgame_handoff_issued', issued.campaignId, { shortCode: issued.shortCode, targetGameId: issued.targetGameId });
      json(res, 201, issued);
      return true;
    }

    if (pathname === '/api/adgame/handoff/preview' && req.method === 'GET') {
      const code = url.searchParams.get('code') || url.searchParams.get('token') || '';
      const baseOrigin = resolveRequestOrigin(req, config.userBaseUrl);
      json(res, 200, service.previewHandoff(code, baseOrigin));
      return true;
    }

    if (pathname === '/api/adgame/handoff/claim' && req.method === 'POST') {
      const body = await readJson(req, 16 * 1024);
      const currentSession = getSession ? getSession(req, 'public') : null;
      const result = service.claimHandoffToken({
        tokenOrCode: body.token || body.code,
        userId: currentSession?.principal_id || (safeString(body.userId, 128) ? body.userId : null),
        deviceId: safeString(body.deviceId, 128) ? body.deviceId : null,
        installChannel: body.installChannel || 'web_fallback'
      });
      audit('adgame_handoff_claimed', result.campaignId, {
        attributionId: result.attributionId,
        installChannel: result.installChannel,
        rewardGranted: result.rewardGranted
      });
      json(res, 200, result);
      return true;
    }

    const qualifyMatch = pathname.match(/^\/api\/adgame\/attributions\/([a-zA-Z0-9_-]+)\/qualify$/);
    if (qualifyMatch && req.method === 'POST') {
      const body = await readJson(req, 8 * 1024);
      const result = service.markQualifiedPlay({
        attributionId: qualifyMatch[1],
        playMs: body.playMs
      });
      json(res, 200, result);
      return true;
    }

    if (pathname === '/api/adgame/funnel' && req.method === 'GET') {
      const partnerId = url.searchParams.get('partner') || null;
      const campaignId = url.searchParams.get('campaign') || null;
      json(res, 200, service.getFunnelSummary({ partnerId, campaignId }));
      return true;
    }

    throw new ApiError(404, 'ADGAME_ROUTE_NOT_FOUND');
  }

  return { service, publicRoute };
}
