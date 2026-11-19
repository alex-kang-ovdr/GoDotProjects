'use strict';

// Reverse proxies must configure the external origin explicitly. Forwarded
// headers are intentionally not trusted as browser authorization evidence.
function createOriginPolicy(configured) {
  let publicOrigin = null;
  if (configured) {
    const url = new URL(configured);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path or credentials');
    }
    publicOrigin = url.origin;
  }
  return request => !request.headers.origin || request.headers.origin === (publicOrigin || requestOrigin(request));
}

function requestOrigin(request) {
  const protocol = request.socket?.encrypted ? 'https' : 'http';
  return `${protocol}://${request.headers.host}`;
}

module.exports = { createOriginPolicy, requestOrigin };
