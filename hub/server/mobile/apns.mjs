import { createPrivateKey, createSign } from 'node:crypto';
import http2 from 'node:http2';

const APNS_HOST_PROD = 'https://api.push.apple.com';
const APNS_HOST_SANDBOX = 'https://api.sandbox.push.apple.com';
const TOKEN_REFRESH_MS = 50 * 60 * 1000; // Refresh every 50 min (< Apple 60-min limit)

export function createApnsClient({
  teamId,
  keyId,
  privateKeyPem,
  bundleId,
  production = true,
  now = () => Date.now(),
  transport = null
}) {
  if (!teamId || !keyId || !privateKeyPem || !bundleId) {
    throw new Error('APNs configuration requires teamId, keyId, privateKeyPem, and bundleId');
  }
  const keyObj = createPrivateKey(privateKeyPem);
  let cachedJwt = null;
  let cachedJwtAt = 0;

  function getProviderToken() {
    const stamp = now();
    if (cachedJwt && stamp - cachedJwtAt < TOKEN_REFRESH_MS) {
      return cachedJwt;
    }
    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ iss: teamId, iat: Math.floor(stamp / 1000) })).toString('base64url');
    const signer = createSign('SHA256');
    signer.update(`${header}.${payload}`);
    signer.end();
    const sig = signer.sign({ key: keyObj, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    cachedJwt = `${header}.${payload}.${sig}`;
    cachedJwtAt = stamp;
    return cachedJwt;
  }

  function buildPayload({ title, body, badge = null, sound = 'default', data = {} }) {
    const aps = { alert: { title, body }, sound };
    if (badge !== null && badge !== undefined) aps.badge = badge;
    return { aps, ...data };
  }

  async function sendNotification({
    deviceToken,
    title,
    body,
    badge = null,
    sound = 'default',
    data = {},
    sandbox = !production,
    pushType = 'alert',
    priority = 10
  }) {
    if (!deviceToken || !/^[a-fA-F0-9]{64,200}$/.test(deviceToken)) {
      throw new Error('INVALID_APNS_DEVICE_TOKEN');
    }
    const host = sandbox ? APNS_HOST_SANDBOX : APNS_HOST_PROD;
    const path = `/3/device/${deviceToken}`;
    const headers = {
      ':method': 'POST',
      ':path': path,
      authorization: `bearer ${getProviderToken()}`,
      'apns-topic': bundleId,
      'apns-push-type': pushType,
      'apns-priority': String(priority),
      'content-type': 'application/json'
    };
    const jsonBody = JSON.stringify(buildPayload({ title, body, badge, sound, data }));

    if (transport) {
      return transport({ host, path, headers, body: jsonBody });
    }

    return new Promise((resolve, reject) => {
      const client = http2.connect(host);
      client.on('error', reject);
      const req = client.request(headers);
      let status = 0;
      let responseText = '';
      req.on('response', h => { status = Number(h[':status'] || 0); });
      req.setEncoding('utf8');
      req.on('data', chunk => { responseText += chunk; });
      req.on('end', () => {
        client.close();
        resolve({ ok: status >= 200 && status < 300, status, body: responseText ? JSON.parse(responseText) : null });
      });
      req.on('error', err => { client.close(); reject(err); });
      req.end(jsonBody);
    });
  }

  return {
    getProviderToken,
    buildPayload,
    sendNotification
  };
}
