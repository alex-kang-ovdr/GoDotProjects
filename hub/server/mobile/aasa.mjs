/**
 * Apple Universal Links (apple-app-site-association / AASA) response builder and route handler.
 * Must be served at /.well-known/apple-app-site-association with application/json and zero redirects.
 */
export function buildAppleAppSiteAssociation({
  teamId,
  bundleIds = ['com.playhub.gamedev.live', 'com.playhub.gamedev.release', 'com.playhub.gamedev.test'],
  components = [
    { '/': '/join/*', comment: 'PlayHub game & party invite Universal Links' },
    { '/': '/games/*/play', comment: 'PlayHub direct game launch Universal Links' }
  ]
} = {}) {
  if (!teamId || !/^[A-Z0-9]{10}$/.test(teamId)) {
    throw new Error(`Invalid Apple Team ID for AASA: '${teamId}'`);
  }
  const uniqueBundles = [...new Set(bundleIds.filter(Boolean))];
  return {
    applinks: {
      details: [
        {
          appIDs: uniqueBundles.map(id => `${teamId}.${id}`),
          components
        }
      ]
    },
    webcredentials: {
      apps: uniqueBundles.map(id => `${teamId}.${id}`)
    }
  };
}

export function handleAasaRoute(req, res, url, options) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (url.pathname !== '/.well-known/apple-app-site-association' && url.pathname !== '/apple-app-site-association') {
    return false;
  }
  const payload = JSON.stringify(buildAppleAppSiteAssociation(options));
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(req.method === 'HEAD' ? undefined : payload);
  return true;
}
