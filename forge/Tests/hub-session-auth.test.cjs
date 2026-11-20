'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createHubSessionAuth } = require('../Tools/hub-session-auth.cjs');

const STRONG = 'x'.repeat(32);
const create = options => createHubSessionAuth({ fetchImpl: async () => { throw new Error('unused'); }, ...options });

test('loopback verify URL keeps working without a secret', () => {
  assert.doesNotThrow(() => create({ verifyUrl: 'http://127.0.0.1:8091/internal/session/verify' }));
  assert.doesNotThrow(() => create({ verifyUrl: 'https://localhost/internal/session/verify' }));
});

test('non-loopback verify URL requires HTTPS', () => {
  assert.throws(() => create({ verifyUrl: 'http://hub.internal/internal/session/verify', internalSecret: STRONG }), /HTTPS/);
});

test('non-loopback verify URL requires a strong shared secret', () => {
  assert.throws(() => create({ verifyUrl: 'https://hub.internal/internal/session/verify' }), /INTERNAL_SECRET/);
  assert.throws(() => create({ verifyUrl: 'https://hub.internal/internal/session/verify', internalSecret: 'short' }), /INTERNAL_SECRET/);
  assert.doesNotThrow(() => create({ verifyUrl: 'https://hub.internal/internal/session/verify', internalSecret: STRONG }));
});

test('verify URL rejects credentials, query and hash', () => {
  for (const verifyUrl of [
    'https://user:pw@hub.internal/internal/session/verify',
    'https://hub.internal/internal/session/verify?x=1',
    'https://hub.internal/internal/session/verify#x',
    'not a url',
  ]) {
    assert.throws(() => create({ verifyUrl, internalSecret: STRONG }), Error);
  }
});

test('remote verify sends the shared secret and fails closed when Hub is unreachable', async () => {
  let seen;
  const auth = createHubSessionAuth({
    verifyUrl: 'https://hub.internal/internal/session/verify',
    internalSecret: STRONG,
    fetchImpl: async (url, init) => { seen = { url, headers: init.headers }; throw new Error('down'); },
  });
  const result = await auth.verify({ method: 'GET', headers: { cookie: 'a=b' } });
  assert.equal(seen.headers['X-PlayHub-Internal-Secret'], STRONG);
  assert.equal(result.authenticated, false);
  assert.equal(result.status, 503);
});
