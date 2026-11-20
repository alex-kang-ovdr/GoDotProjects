// Storage adapter over the S3 API subset the CDN module actually uses. Provider differences (endpoint,
// credentials, error mapping) stay here so the service never sees URLs with signing material.
import { ApiError } from '../security.mjs';
import { presignUrl, signHeaders, UNSIGNED_PAYLOAD } from './sigv4.mjs';

const ROLES = ['quarantine', 'projects'];
const KEY_PATTERN = /^[a-z]\/[a-f0-9]{64}\/[A-Za-z0-9._-]{1,200}$/;

export function resolveStoreConfig(cdn, env) {
  const provider = cdn.provider || 'local';
  if (!['local', 'r2'].includes(provider)) throw new Error('cdn.provider must be "local" or "r2"');
  const buckets = { quarantine: cdn.buckets?.quarantine, projects: cdn.buckets?.projects };
  for (const role of ROLES) if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(buckets[role] || '')) throw new Error(`cdn.buckets.${role} must be a valid bucket name`);
  if (buckets.quarantine === buckets.projects) throw new Error('cdn.buckets.quarantine and projects must differ');
  const accessKeyId = env.PLAYHUB_R2_ACCESS_KEY_ID || (provider === 'local' ? 'local-dev-key' : '');
  const secretAccessKey = env.PLAYHUB_R2_SECRET_ACCESS_KEY || (provider === 'local' ? 'local-dev-secret-not-for-production' : '');
  if (!accessKeyId || !secretAccessKey) throw new Error('PLAYHUB_R2_ACCESS_KEY_ID and PLAYHUB_R2_SECRET_ACCESS_KEY are required for the r2 provider');
  let endpoint = null;
  if (provider === 'r2') {
    if (!/^[a-f0-9]{32}$/.test(cdn.accountId || '')) throw new Error('cdn.accountId must be the 32-hex Cloudflare account ID');
    endpoint = `https://${cdn.accountId}.r2.cloudflarestorage.com`;
  }
  return { provider, buckets, accessKeyId, secretAccessKey, endpoint, region: 'auto' };
}

export function createObjectStore(storeConfig, { fetchImpl = globalThis.fetch, clock = Date.now } = {}) {
  let endpoint = storeConfig.endpoint;
  const creds = { accessKeyId: storeConfig.accessKeyId, secretAccessKey: storeConfig.secretAccessKey, region: storeConfig.region };

  function objectUrl(role, key) {
    if (!ROLES.includes(role)) throw new Error('unknown bucket role');
    if (!KEY_PATTERN.test(key)) throw new Error('object key outside the allowed layout');
    if (!endpoint) throw new ApiError(503, 'STORAGE_UNAVAILABLE');
    return `${endpoint}/${storeConfig.buckets[role]}/${key}`;
  }

  async function send(method, role, key, { body, headers = {}, payloadHash } = {}) {
    const url = objectUrl(role, key);
    const signed = signHeaders({ method, url, ...creds, date: new Date(clock()), headers, payloadHash });
    let response;
    try {
      response = await fetchImpl(url, { method, headers: signed, body, redirect: 'error' });
    } catch {
      throw new ApiError(503, 'STORAGE_UNAVAILABLE');
    }
    return response;
  }

  return {
    setEndpoint(value) {
      const u = new URL(value);
      if (storeConfig.provider !== 'local' || u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw new Error('only the local provider may set a loopback endpoint');
      endpoint = u.origin;
    },
    presignPut(role, key, { contentLength, contentType = 'application/octet-stream', expiresIn }) {
      const { url, headers } = presignUrl({ method: 'PUT', url: objectUrl(role, key), ...creds, date: new Date(clock()), expiresIn, headers: { 'content-length': String(contentLength), 'content-type': contentType } });
      return { method: 'PUT', url, headers };
    },
    presignGet(role, key, { expiresIn, filename }) {
      const safeName = String(filename || 'download').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'download';
      const { url } = presignUrl({
        method: 'GET', url: objectUrl(role, key), ...creds, date: new Date(clock()), expiresIn,
        query: { 'response-content-disposition': `attachment; filename="${safeName}"`, 'response-content-type': 'application/octet-stream' },
      });
      return { method: 'GET', url };
    },
    async head(role, key) {
      const response = await send('HEAD', role, key);
      if (response.status === 404) return null;
      if (!response.ok) throw new ApiError(503, 'STORAGE_UNAVAILABLE');
      return { size: Number(response.headers.get('content-length')), etag: response.headers.get('etag') };
    },
    /** Read an object fully, refusing anything over `limit` bytes. Returns null when missing. */
    async read(role, key, limit) {
      const response = await send('GET', role, key);
      if (response.status === 404) { await response.body?.cancel(); return null; }
      if (!response.ok) { await response.body?.cancel(); throw new ApiError(503, 'STORAGE_UNAVAILABLE'); }
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > limit) { await response.body?.cancel(); return { tooLarge: true }; }
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > limit) { await response.body.cancel().catch(() => {}); return { tooLarge: true }; }
        chunks.push(chunk);
      }
      return { bytes: Buffer.concat(chunks.map(c => Buffer.from(c))) };
    },
    async put(role, key, bytes, contentType = 'application/octet-stream') {
      const response = await send('PUT', role, key, { body: bytes, headers: { 'content-type': contentType, 'content-length': String(bytes.length) }, payloadHash: UNSIGNED_PAYLOAD });
      await response.body?.cancel();
      if (!response.ok) throw new ApiError(503, 'STORAGE_UNAVAILABLE');
    },
    async delete(role, key) {
      const response = await send('DELETE', role, key);
      await response.body?.cancel();
      if (!response.ok && response.status !== 404) throw new ApiError(503, 'STORAGE_UNAVAILABLE');
    },
  };
}
