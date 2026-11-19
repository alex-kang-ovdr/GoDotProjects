'use strict';

// Reverse proxies must configure the external origin explicitly. Forwarded
// headers are intentionally not trusted as browser authorization evidence.
function parseOrigin(entry) {
  const url = new URL(entry);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path or credentials');
  }
  return url.origin;
}

function createOriginPolicy(configured) {
  let allowedOrigins = null;
  if (configured !== undefined && configured !== null && configured !== '') {
    const rawList = Array.isArray(configured) ? configured : String(configured).split(',');
    const list = rawList.map(item => String(item).trim());
    if (!list.length || list.some(item => !item)) {
      throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path or credentials');
    }
    allowedOrigins = new Set(list.map(parseOrigin));
  }
  return request => {
    if (!request.headers.origin) return true;
    if (allowedOrigins) return allowedOrigins.has(request.headers.origin);
    return request.headers.origin === 'http://' + request.headers.host;
  };
}

function requestOrigin(request) {
  const protocol = request.socket?.encrypted ? 'https' : 'http';
  return `${protocol}://${request.headers.host}`;
}

module.exports = { createOriginPolicy, requestOrigin };
