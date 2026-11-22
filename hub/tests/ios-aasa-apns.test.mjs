import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { buildAppleAppSiteAssociation, handleAasaRoute } from '../server/mobile/aasa.mjs';
import { createApnsClient } from '../server/mobile/apns.mjs';

test('AASA Universal Links builder & HTTP route handler', () => {
  const aasa = buildAppleAppSiteAssociation({
    teamId: 'ABCDE12345',
    bundleIds: ['com.playhub.gamedev.live', 'com.playhub.gamedev.test']
  });
  assert.deepEqual(aasa.applinks.details[0].appIDs, [
    'ABCDE12345.com.playhub.gamedev.live',
    'ABCDE12345.com.playhub.gamedev.test'
  ]);
  assert.throws(() => buildAppleAppSiteAssociation({ teamId: 'bad' }));

  const headers = {};
  let body = '';
  const res = {
    statusCode: 0,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    end(chunk) { body = chunk || ''; }
  };
  const handled = handleAasaRoute(
    { method: 'GET' },
    res,
    new URL('https://playhub.example.com/.well-known/apple-app-site-association'),
    { teamId: 'ABCDE12345' }
  );
  assert.equal(handled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(JSON.parse(body).applinks.details[0].appIDs[0], 'ABCDE12345.com.playhub.gamedev.live');
});

test('APNs ES256 provider JWT signing, 50-min caching, and sandbox/prod routing', async () => {
  const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privPem = ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  let clock = Date.UTC(2026, 10, 21, 3, 0, 0);
  const sent = [];

  const apns = createApnsClient({
    teamId: 'ABCDE12345',
    keyId: 'APNS123456',
    privateKeyPem: privPem,
    bundleId: 'com.playhub.gamedev.live',
    now: () => clock,
    transport: async req => {
      sent.push(req);
      return { ok: true, status: 200, body: null };
    }
  });

  const tok1 = apns.getProviderToken();
  const [h, p, s] = tok1.split('.');
  const verifier = createVerify('SHA256');
  verifier.update(`${h}.${p}`);
  verifier.end();
  assert.equal(verifier.verify({ key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), true);

  // Within 50 minutes -> cached token reused
  clock += 30 * 60 * 1000;
  assert.equal(apns.getProviderToken(), tok1);

  // After 50 minutes -> rotated
  clock += 25 * 60 * 1000;
  assert.notEqual(apns.getProviderToken(), tok1);

  const deviceToken = 'a'.repeat(64);
  const res = await apns.sendNotification({
    deviceToken,
    title: '파티 초대',
    body: '친구와 Survivor Arena G2 함께 플레이!',
    sandbox: true,
    data: { gameId: 'survivor-arena-g2', roomCode: 'ROOM-42' }
  });
  assert.equal(res.ok, true);
  assert.equal(sent[0].host, 'https://api.sandbox.push.apple.com');
  assert.equal(sent[0].headers['apns-topic'], 'com.playhub.gamedev.live');
  assert.equal(JSON.parse(sent[0].body).roomCode, 'ROOM-42');

  await assert.rejects(
    apns.sendNotification({ deviceToken: 'not-hex!', title: 'x', body: 'y' }),
    /INVALID_APNS_DEVICE_TOKEN/
  );
});
