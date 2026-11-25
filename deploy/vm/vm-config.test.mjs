// Contract test for the single-VM deployment (deploy/vm): the pieces must agree on
// ports, loopback binding, shared Forge storage and origins, or the site breaks the
// same way the Firebase-hosted dev site did (403 origin, lost sessions, no WebSocket).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const read = name => fs.readFileSync(path.join(here, name), 'utf8').replace(/\r\n/g, '\n');
const compose = read('docker-compose.yml');
const caddy = read('Caddyfile');
const envExample = read('vm.env.example');

function service(name) {
  const m = new RegExp(`^  ${name}:\\n((?:(?:    .*)?\\n)+)`, 'm').exec(compose);
  assert.ok(m, `compose service ${name} missing`);
  const body = m[1];
  const env = {};
  const envBlock = /^    environment:\n((?:      .*\n)+)/m.exec(body);
  for (const line of (envBlock?.[1] || '').split('\n')) {
    const kv = /^      ([A-Z0-9_]+):\s*(.*)$/.exec(line);
    if (kv) env[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
  }
  const volumes = [...body.matchAll(/^      - (\S+):(\S+?)(?::ro)?$/gm)].map(v => ({ host: v[1], container: v[2] }));
  return { body, env, volumes };
}

const hub = service('hub');
const forge = service('forge');
const caddySvc = service('caddy');

test('Hub and Forge bind to loopback; only Caddy is public', () => {
  for (const svc of [hub, forge, caddySvc]) assert.match(svc.body, /^    network_mode: host$/m);
  assert.equal(hub.env.HOST, '127.0.0.1');
  assert.equal(forge.env.HOST, '127.0.0.1');
  assert.doesNotMatch(compose, /^\s+ports:/m, 'host networking must not publish extra ports');
});

test('ports line up: Caddy -> Hub edge -> Forge, and Forge -> Hub verify', () => {
  const hubPort = hub.env.PORT;
  const forgePort = forge.env.PORT;
  assert.notEqual(forgePort, '8090', 'Hub uses 8090/8091 internally');
  assert.notEqual(forgePort, '8091');
  assert.equal(hub.env.PLAYHUB_FORGE_UPSTREAM, `http://127.0.0.1:${forgePort}`);
  assert.equal(forge.env.PLAYHUB_SESSION_VERIFY_URL, `http://127.0.0.1:${hubPort}/internal/session/verify`);
  assert.match(caddy, new RegExp(`reverse_proxy 127\\.0\\.0\\.1:${hubPort}\\b`));
  assert.equal(hub.env.PLAYHUB_FORGE_REMOTE_VERIFY, '1', 'Hub must serve /internal/session/verify on its edge');
});

test('Forge accepts the loopback verify URL and the shared internal secret', () => {
  const { hubAuthConfigFromEnv, createHubSessionAuth } = require('../../forge/Tools/hub-session-auth.cjs');
  const config = hubAuthConfigFromEnv({
    PLAYHUB_FORGE_AUTH_MODE: forge.env.PLAYHUB_FORGE_AUTH_MODE,
    PLAYHUB_SESSION_VERIFY_URL: forge.env.PLAYHUB_SESSION_VERIFY_URL,
    PLAYHUB_FORGE_INTERNAL_SECRET: 'a'.repeat(64),
  });
  assert.doesNotThrow(() => createHubSessionAuth(config));
  assert.equal(hub.env.PLAYHUB_FORGE_INTERNAL_SECRET, '${PLAYHUB_FORGE_INTERNAL_SECRET:?set PLAYHUB_FORGE_INTERNAL_SECRET in .env}');
  assert.equal(forge.env.PLAYHUB_FORGE_INTERNAL_SECRET, '${PLAYHUB_FORGE_INTERNAL_SECRET}');
});

test('single origin for Hub and Forge; Caddy hides /internal', () => {
  assert.match(hub.env.PLAYHUB_PUBLIC_ORIGIN, /^\$\{PLAYHUB_PUBLIC_ORIGIN[:}]/);
  assert.equal(forge.env.PUBLIC_ORIGIN, '${PLAYHUB_PUBLIC_ORIGIN}');
  assert.equal(hub.env.PLAYHUB_SECURE_COOKIES, 'true');
  assert.equal(forge.env.PLAYFORGE_BASE_PATH, '/forge');
  assert.match(caddy, /^\{\$PLAYHUB_SITE\} \{/m);
  assert.match(caddy, /@internal path \/internal \/internal\/\*\n\s*respond @internal 404/);
  const site = /^PLAYHUB_SITE=(.+)$/m.exec(envExample)[1];
  assert.equal(/^PLAYHUB_PUBLIC_ORIGIN=(.+)$/m.exec(envExample)[1], `https://${site}`);
});

test('Hub forge directory and Forge accounts directory share one persistent volume', () => {
  const hostOf = (svc, container) => svc.volumes.find(v => v.container === container)?.host;
  assert.equal(hub.env.PLAYHUB_FORGE_DIR, '/data/forge');
  assert.equal(forge.env.PLAYHUB_FORGE_ACCOUNTS_DIR, '/data/forge/accounts');
  assert.equal(hostOf(hub, '/data/forge'), hostOf(forge, '/data/forge'));
  assert.match(hostOf(hub, '/data/hub'), /^\/var\/lib\/playhub\//);
});

test('every required compose variable is in vm.env.example', () => {
  const required = [...new Set([...compose.matchAll(/\$\{([A-Z0-9_]+)(?::\?[^}]*)?\}/g)].map(m => m[1]))];
  for (const name of required) {
    if (name === 'PLAYHUB_CHANNEL') continue;
    assert.match(envExample, new RegExp(`^${name}=`, 'm'), `${name} missing from vm.env.example`);
  }
});

test('CI deploy-vm job ships deploy/vm and pins host keys', () => {
  const wf = fs.readFileSync(path.join(repoRoot, '.github/workflows/cloudrun-pipeline.yml'), 'utf8');
  assert.match(wf, /^          - deploy-vm$/m);
  const job = /\n  deploy-vm:\n([\s\S]*?)\n  [a-z-]+:\n/.exec(wf.replace(/\r\n/g, '\n'));
  assert.ok(job, 'deploy-vm job missing');
  assert.match(job[1], /needs\.build\.outputs\.sha_tag/);
  assert.match(job[1], /StrictHostKeyChecking=yes/);
  assert.doesNotMatch(job[1], /StrictHostKeyChecking=no/);
  assert.match(job[1], /sudo bash playhub-vm\/deploy\.sh/);
});
