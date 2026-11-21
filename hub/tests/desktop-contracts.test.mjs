import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const contractsDir = path.join(repoRoot, 'contracts', 'desktop');

const EXPECTED_SCHEMAS = [
  'launch-ticket.v1.schema.json',
  'bridge.v1.schema.json',
  'deeplink.v1.schema.json',
  'content-manifest.v1.schema.json',
  'release-manifest.v1.schema.json',
  'avatar-render-profile.v1.schema.json',
];

function loadSchema(name) {
  const full = path.join(contractsDir, name);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

test('all 6 desktop contract schemas exist and are valid JSON Schema Draft 2020-12', () => {
  for (const name of EXPECTED_SCHEMAS) {
    const schema = loadSchema(name);
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema', `${name} $schema`);
    assert.ok(typeof schema.$id === 'string' && schema.$id.endsWith(name), `${name} $id`);
    assert.ok(typeof schema.title === 'string' && schema.title.length > 0, `${name} title`);
  }
});

test('launch-ticket.v1 enforces singleUse, ttlSec <= 60, and OS/arch binding (L9 contract)', () => {
  const s = loadSchema('launch-ticket.v1.schema.json');
  const issueResp = s.$defs.issueResponse;
  assert.equal(issueResp.properties.singleUse.const, true);
  assert.equal(issueResp.properties.ttlSec.maximum, 60);
  assert.deepEqual(s.$defs.os.enum, ['windows', 'macos', 'linux']);
  assert.deepEqual(s.$defs.arch.enum, ['x86_64', 'arm64']);

  const dlRe = new RegExp(issueResp.properties.deepLink.pattern);
  assert.ok(dlRe.test('playhub://launch?ticket=abcdefghijklmnopqrstuvwxyz0123456789'));
  assert.ok(dlRe.test('playhub-hub-desktop-debug://avatar-studio?ticket=abcdefghijklmnopqrstuvwxyz0123456789'));
  // Must reject session/access tokens appended to URL
  assert.equal(dlRe.test('playhub://launch?ticket=abcdefghijklmnopqrstuvwxyz0123456789&access_token=abc'), false);
  // Must reject short/low-entropy ticket
  assert.equal(dlRe.test('playhub://launch?ticket=short'), false);
});

test('bridge.v1 requires 256-bit hex token on auth and includes desktop + AOS §6.2 methods', () => {
  const s = loadSchema('bridge.v1.schema.json');
  const tokenRe = new RegExp(s.$defs.authFrame.properties.token.pattern);
  assert.ok(tokenRe.test('a'.repeat(64)));
  assert.equal(tokenRe.test('a'.repeat(32)), false);
  assert.equal(tokenRe.test('G'.repeat(64)), false);

  const methods = new Set(s.$defs.methodName.enum);
  for (const required of ['ready', 'first_frame', 'heartbeat', 'shader_telemetry', 'save_load', 'save_write', 'get_profile', 'get_host_info', 'iap_purchase', 'social_open_overlay', 'overlay_leave']) {
    assert.ok(methods.has(required), `missing method: ${required}`);
  }
});

test('content-manifest.v1 enforces reviewStatus, playModes, platforms, and Ed25519 signature', () => {
  const s = loadSchema('content-manifest.v1.schema.json');
  assert.deepEqual(s.properties.playModes.items.enum, ['instant', 'native']);
  assert.deepEqual(s.properties.reviewStatus.enum, ['approved', 'pending', 'rejected', 'revoked']);
  assert.equal(s.properties.signature.properties.algorithm.const, 'ed25519');
  assert.ok(s.required.includes('signature'));
  assert.ok(s.required.includes('reviewStatus'));
});

test('release-manifest.v1 enforces monotonic tufVersion and COMPAT_* codes', () => {
  const s = loadSchema('release-manifest.v1.schema.json');
  assert.equal(s.properties.tufVersion.minimum, 1);
  assert.deepEqual(s.properties.channel.enum, ['dev', 'qa', 'rc', 'live']);
  assert.ok(s.properties.compatibility.properties.compatCode.enum.includes('COMPAT_BLOCK_FORCE'));
});

test('avatar-render-profile.v1 defines full_body/bust/face cameras and asset budgets', () => {
  const s = loadSchema('avatar-render-profile.v1.schema.json');
  assert.deepEqual(s.properties.cameras.required, ['full_body', 'bust', 'face']);
  assert.ok(s.properties.budgets.required.includes('skinMaxTriangles'));
  assert.ok(s.properties.budgets.required.includes('skinMaxBones'));
});
