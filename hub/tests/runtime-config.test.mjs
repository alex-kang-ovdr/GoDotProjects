import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeConfig } from '../server/runtime-config.mjs';

const local = { userBaseUrl: 'http://localhost:8080', userOrigins: ['http://localhost:8080'], google: { redirectUri: 'http://localhost:8090/api/auth/google/callback' } };
const credentials = { PLAYHUB_GOOGLE_CLIENT_ID: 'test-client', PLAYHUB_GOOGLE_CLIENT_SECRET: 'test-secret' };
test('Google environment settings are server-only overrides without mutating input', () => {
  const result = resolveRuntimeConfig(local, credentials);
  assert.equal(result.google.clientId, 'test-client');
  assert.equal(result.google.clientSecret, 'test-secret');
  assert.equal(local.google.clientSecret, undefined);
  assert.deepEqual(resolveRuntimeConfig(local, {}).google, local.google);
});
test('partial credentials fail closed without exposing secrets', () => {
  assert.throws(() => resolveRuntimeConfig(local, { PLAYHUB_GOOGLE_CLIENT_SECRET: 'private-secret' }), error => !error.message.includes('private-secret') && /requires/.test(error.message));
});
test('callback validates exact path, same cookie host and rejects URL credentials', () => {
  for (const uri of ['https://evil.example/api/auth/google/callback', 'http://localhost:8090/wrong', 'http://localhost:8090/api/auth/google/callback?next=x', 'http://localhost:8090/api/auth/google/callback#x', 'http://user:pass@localhost:8090/api/auth/google/callback', 'file:///api/auth/google/callback']) {
    assert.throws(() => resolveRuntimeConfig(local, { ...credentials, PLAYHUB_GOOGLE_REDIRECT_URI: uri }));
  }
});
test('remote login requires secure transport and cookies for every allowed origin', () => {
  const input = { userBaseUrl: 'https://play.example', userOrigins: ['https://play.example'], secureCookies: true };
  const env = { ...credentials, PLAYHUB_GOOGLE_REDIRECT_URI: 'https://play.example/api/auth/google/callback' };
  assert.equal(resolveRuntimeConfig(input, env).google.clientId, 'test-client');
  assert.throws(() => resolveRuntimeConfig({ ...input, secureCookies: false }, env));
  assert.throws(() => resolveRuntimeConfig({ ...input, userOrigins: ['http://play.example'] }, env));
  assert.throws(() => resolveRuntimeConfig(input, { ...env, PLAYHUB_GOOGLE_REDIRECT_URI: 'http://play.example/api/auth/google/callback' }));
});
