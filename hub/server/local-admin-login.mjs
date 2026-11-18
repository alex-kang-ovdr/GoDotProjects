import { ApiError, digest, equal, secret } from './security.mjs';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const LOOPBACK_PEERS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const TOKEN_TTL_MS = 60_000;

export function createLocalAdminLogin(config, now) {
  const enabled = config.admin?.localAutoLogin;
  if (enabled === undefined || enabled === false) return null;
  if (enabled !== true) throw new Error('admin.localAutoLogin must be a boolean');

  let ui;
  try { ui = new URL(config.adminBaseUrl); }
  catch { throw new Error('Local administrator login requires a valid loopback adminBaseUrl'); }
  if (ui.protocol !== 'http:' || !LOOPBACK_HOSTS.has(ui.hostname) || ui.username || ui.password || ui.href !== `${ui.origin}/`
      || !config.adminOrigins.includes(ui.origin) || config.adminOrigins.some(origin => !LOOPBACK_HOSTS.has(new URL(origin).hostname))) {
    throw new Error('Local administrator login requires a loopback HTTP adminBaseUrl and loopback adminOrigins');
  }
  if (config.adminUiPort !== undefined && Number(ui.port || 80) !== config.adminUiPort) {
    throw new Error('Local administrator login requires adminBaseUrl to match adminUiPort');
  }

  let pending = null;
  return {
    issue() {
      const token = secret();
      pending = { hash: digest(token), expiresAt: now() + TOKEN_TTL_MS };
      return `${ui.origin}/#playhub-local-admin=${token}`;
    },

    requireDirectRequest(req, port) {
      const expectedHost = port === 80 ? ui.hostname : `${ui.hostname}:${port}`;
      const proxied = Object.keys(req.headers).some(name => name === 'forwarded' || name === 'x-real-ip'
        || name === 'via' || name.startsWith('x-forwarded-') || name.startsWith('x-original-'));
      if (!port || proxied || !LOOPBACK_PEERS.has(req.socket.remoteAddress) || !LOOPBACK_PEERS.has(req.socket.localAddress)
          || req.headers.host !== expectedHost || req.headers.origin !== ui.origin) {
        throw new ApiError(403, 'LOCAL_ADMIN_DIRECT_REQUEST_REQUIRED');
      }
    },

    consume(token) {
      if (pending && pending.expiresAt <= now()) pending = null;
      if (!pending || typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || !equal(digest(token), pending.hash)) {
        throw new ApiError(401, 'LOCAL_ADMIN_TOKEN_INVALID');
      }
      pending = null;
    },

    clear() { pending = null; }
  };
}
