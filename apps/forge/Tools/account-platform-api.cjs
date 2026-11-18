"use strict";
const crypto = require('node:crypto');
const path = require('node:path');
const { PlatformStore } = require('./platform-store.cjs');
const { createPlatformApi } = require('./platform-api.cjs');

// verifyIdentity must validate signature, issuer, audience, expiry and the server
// session. Never implement it using request body, query ownerId, email or headers
// supplied as a claimed identity. No development identity fallback is provided.
function accountKey(identity) {
  if (!identity || !['accounts.google.com', 'https://accounts.google.com'].includes(identity.iss) ||
      typeof identity.sub !== 'string' || !identity.sub || identity.sub.length > 255 || /[\x00-\x20\x7f]/.test(identity.sub)) {
    throw Object.assign(new Error('Authentication required'), { status: 401 });
  }
  return crypto.createHash('sha256').update('https://accounts.google.com\0' + identity.sub).digest('hex');
}
function createAccountPlatformApi({ root, directory, verifyIdentity, validateBuildForAccount, onStore, maxAccounts = 1024 } = {}) {
  if (typeof verifyIdentity !== 'function') throw new TypeError('A trusted server-side identity verifier is required');
  if (!root || !directory) throw new TypeError('Explicit root and private account directory are required');
  if (!Number.isSafeInteger(maxAccounts) || maxAccounts < 1) throw new TypeError('Invalid account limit');
  const accounts = new Map();
  const disposers=[];
  let closed = false;
  const send = (res, status, error) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error }));
  };
  const handle = async (req, res, url) => {
    const pathname = new URL(typeof url === 'string' ? url : url.href, 'http://localhost').pathname;
    if (!pathname.startsWith('/api/platform/')) return false;
    if (closed) { send(res, 503, 'Service unavailable'); return true; }
    let key;
    try { key = accountKey(await verifyIdentity(req)); }
    catch { send(res, 401, 'Authentication required'); return true; }
    let api = accounts.get(key);
    if (!api) {
      if (accounts.size >= maxAccounts) { send(res, 503, 'Account capacity reached'); return true; }
      const store = new PlatformStore(root, path.join(path.resolve(directory), key));
      if (onStore) { const dispose=onStore(key,store); if(typeof dispose==='function')disposers.push(dispose); }
      api = createPlatformApi(store, { validateBuild: validateBuildForAccount
        ? (id, projectId, revision) => validateBuildForAccount(key, id, projectId, revision) : undefined });
      accounts.set(key, api);
    }
    return api(req, res, url);
  };
  handle.close = () => { closed = true; for (const api of accounts.values()) api.close(); accounts.clear(); for(const dispose of disposers)dispose(); disposers.length=0; };
  return handle;
}
module.exports = { accountKey, createAccountPlatformApi };
