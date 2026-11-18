'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createApp, deployment, listen, portFor } = require('./server.cjs');

const DEPLOYED_URL = 'https://playhub-launcher.example.test';
const ids = {
  legacy: 'fixture-launcher-legacy',
  sdk: 'fixture-launcher-sdk',
  disabled: 'fixture-launcher-disabled',
  unregistered: 'fixture-launcher-unregistered',
  invalid: 'fixture-launcher-invalid'
};

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-launcher-modes-'));
  const catalog = path.join(root, 'games', 'catalog.json');
  const config = path.join(root, 'hub', 'config', 'local.json');
  const entries = [ids.legacy, ids.sdk, ids.disabled, ids.invalid].map(id => ({ id, path: id, enabled: id !== ids.disabled }));
  writeJson(catalog, { schemaVersion: 1, entries });
  writeJson(config, { userBaseUrl: DEPLOYED_URL });
  for (const id of Object.values(ids)) {
    const game = path.join(root, 'games', id);
    writeJson(path.join(game, 'game.manifest.json'), {
      id: id === ids.invalid ? 'invalid-manifest-id' : id,
      entry: 'index.html',
      integration: id === ids.sdk ? 'native-sdk' : 'legacy-localstorage',
      title: { ko: id }
    });
    fs.mkdirSync(path.join(game, 'Web'));
    fs.writeFileSync(path.join(game, 'Web', 'index.html'), `<title>${id}</title>`);
  }

  const apps = [];
  t.after(async () => {
    await Promise.all(apps.map(app => app.close()));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root, catalog, config, entries,
    async start(env = {}) {
      const app = createApp(root, { port: 0, env });
      apps.push(app);
      await listen(app.server, 0);
      return { app, port: app.server.address().port };
    }
  };
}

function request(port, url, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: url, method, headers }, res => {
      res.setEncoding('utf8');
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

test('deployment configuration precedence is explicit and invalid configuration fails closed', t => {
  const { root, config } = fixture(t);
  const launcherConfig = path.join(root, 'launcher-config.json');
  const hubConfig = path.join(root, 'hub-config.json');
  writeJson(launcherConfig, { userBaseUrl: 'https://launcher-selected.example.test' });
  writeJson(hubConfig, { userBaseUrl: 'https://hub-selected.example.test' });

  for (const [env, configPath, origin] of [
    [{}, config, DEPLOYED_URL],
    [{ PLAYHUB_CONFIG: hubConfig }, hubConfig, 'https://hub-selected.example.test'],
    [{ PLAYHUB_CONFIG: hubConfig, PLAYHUB_DEPLOY_CONFIG: launcherConfig }, launcherConfig, 'https://launcher-selected.example.test']
  ]) {
    const result = deployment(root, env);
    assert.equal(result.configPath, configPath);
    assert.equal(new URL(result.baseUrl).origin, origin);
    assert.ok(!result.error);
  }

  const env = { PLAYHUB_DEPLOY_CONFIG: launcherConfig, PLAYHUB_CONFIG: hubConfig };
  for (const userBaseUrl of [
    undefined, '/relative', 'ftp://invalid.example.test', 'https://secret:password@invalid.example.test',
    'https://invalid.example.test/?injected=1', 'https://invalid.example.test/#injected'
  ]) {
    writeJson(launcherConfig, { userBaseUrl });
    const result = deployment(root, env);
    assert.equal(result.configPath, launcherConfig);
    assert.ok(!result.baseUrl, userBaseUrl);
    assert.ok(result.error, userBaseUrl);
  }
  fs.writeFileSync(launcherConfig, '{malformed JSON');
  assert.ok(deployment(root, env).error);
  fs.unlinkSync(launcherConfig);
  assert.ok(deployment(root, env).error);
});

test('each deployed selection checks the repository catalog and redirects to the configured Hub only', async t => {
  const repo = fixture(t);
  // The generated catalog deliberately disagrees with the source catalog.
  writeJson(path.join(repo.root, 'hub', 'catalog', 'games.json'), {
    schemaVersion: 1,
    entries: [{ id: ids.disabled, path: `games/${ids.disabled}`, enabled: true }]
  });
  const { app, port } = await repo.start();
  const { body: localCards } = await request(port, '/');
  const deployedCards = await request(port, '/?mode=deployed');
  assert.equal(deployedCards.status, 200);
  for (const id of Object.values(ids)) {
    assert.match(localCards, new RegExp(`<article[^>]*data-name="[^"]*${id}`));
  }
  assert.doesNotMatch(localCards, /<article[^>]*data-name="[^"]*project-zomboid/);
  assert.match(localCards, /id="unavailable-sources"/);
  for (const id of [ids.legacy, ids.sdk]) {
    assert.match(deployedCards.body, new RegExp(`<article[^>]*data-name="[^"]*${id}`));
  }
  for (const id of [ids.disabled, ids.unregistered, ids.invalid]) {
    assert.doesNotMatch(deployedCards.body, new RegExp(`<article[^>]*data-name="[^"]*${id}`));
  }
  assert.match(deployedCards.body, /id="unpublished-games"/);
  assert.match(deployedCards.body, /<select[^>]*\bname="mode"/);
  assert.match(deployedCards.body, new RegExp(`/play/${ids.sdk}\\?mode=deployed`));
  const filtered = await request(port, '/?mode=deployed&q=fixture-launcher-sdk');
  assert.match(filtered.body, /<input[^>]*\bid="q"[^>]*\bvalue="fixture-launcher-sdk"/);
  assert.match(filtered.body, new RegExp(`<article[^>]*data-name="[^"]*${ids.legacy}" hidden>`));

  const target = `/play/${ids.sdk}?mode=deployed`;
  const deployed = await request(port, target);
  assert.equal(deployed.status, 302);
  assert.equal(deployed.headers.location, `${DEPLOYED_URL}/play/${ids.sdk}/`);
  for (const id of [ids.disabled, ids.unregistered, ids.invalid, 'project-zomboid']) {
    const result = await request(port, `/play/${id}?mode=deployed`);
    assert.equal(result.status, 409, id);
    assert.equal(result.headers.location, undefined);
  }
  assert.equal(app.servers.size, 0);

  const injected = await request(port, `${target}&target=https://injected.example.test&origin=https://injected.example.test`);
  assert.equal(injected.status, 302);
  assert.equal(injected.headers.location, deployed.headers.location);
  assert.equal((await request(port, '/?mode=invalid')).status, 400);
  assert.equal((await request(port, '/?mode=')).status, 400);
  assert.equal((await request(port, `${target}&mode=local`)).status, 400);
  assert.equal((await request(port, target, { method: 'POST' })).status, 403);
  assert.equal((await request(port, target, { headers: { Host: 'injected.example.test' } })).status, 403);
  assert.equal((await request(port, target, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);

  const entries = repo.entries.map(entry => entry.id === ids.sdk ? { ...entry, enabled: false } : entry);
  writeJson(repo.catalog, { schemaVersion: 1, entries });
  const disabled = await request(port, target);
  assert.equal(disabled.status, 409);
  assert.equal(disabled.headers.location, undefined);
  fs.unlinkSync(repo.config);
  const noDeploymentCards = await request(port, '/?mode=deployed');
  assert.equal(noDeploymentCards.status, 200);
  assert.match(noDeploymentCards.body, /role="status"[^>]*>[^<]*userBaseUrl/);
  assert.doesNotMatch(noDeploymentCards.body, new RegExp(`href="/play/${ids.legacy}`));
  const noDeployment = await request(port, `/play/${ids.legacy}?mode=deployed`);
  assert.equal(noDeployment.status, 503);
  assert.equal(noDeployment.headers.location, undefined);
  assert.equal(app.servers.size, 0);

  const playLocal = await request(port, `/play/${ids.disabled}`);
  assert.equal(playLocal.status, 200);
  const gamePort = portFor(ids.disabled);
  assert.match(playLocal.body, new RegExp(`src="http://127\\.0\\.0\\.1:${gamePort}/index.html#nonce=[a-f0-9]{48}"`));
  const game = await request(gamePort, '/index.html');
  assert.equal(game.status, 200);
  assert.equal(game.body, `<title>${ids.disabled}</title>`);
  assert.match(game.headers['content-security-policy'], new RegExp(`frame-ancestors http://127\\.0\\.0\\.1:${port}$`));
  assert.ok(app.servers.has(ids.disabled));
  const sdkLocal = await request(port, `/play/${ids.sdk}?mode=local`);
  assert.equal(sdkLocal.status, 200);
  assert.match(sdkLocal.body, /id="game-frame"/);
  assert.match(sdkLocal.body, /src="\/runtime\/sdk-host.js"/);
  assert.match(sdkLocal.body, /#nonce=[a-f0-9]{48}/);
});

test('deployment mode does not contact the configured server from the launcher', async t => {
  const repo = fixture(t);
  let requests = 0;
  const target = http.createServer((_req, res) => {
    requests++;
    res.writeHead(200).end('stub');
  });
  await listen(target, 0);
  t.after(() => new Promise(resolve => target.close(resolve)));
  const origin = `http://127.0.0.1:${target.address().port}`;
  writeJson(repo.config, { userBaseUrl: origin });
  const { port } = await repo.start();
  assert.equal((await request(port, '/?mode=deployed')).status, 200);
  const deployed = await request(port, `/play/${ids.legacy}?mode=deployed`);
  assert.equal(deployed.status, 302);
  assert.equal(deployed.headers.location, `${origin}/play/${ids.legacy}/`);
  assert.equal(requests, 0);
});

test('first publication and recent update badges come from the source manifests', async t => {
  const repo = fixture(t);
  const seoulDay = daysAgo => new Date(Date.now() + 9 * 3600000 - daysAgo * 86400000).toISOString().slice(0, 10);
  for (const [id, publishedOn, updatedOn] of [
    [ids.legacy, seoulDay(2), seoulDay(2)],
    [ids.sdk, seoulDay(20), seoulDay(2)],
    [ids.disabled, '2026-02-30', undefined]
  ]) {
    const filename = path.join(repo.root, 'games', id, 'game.manifest.json');
    const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
    writeJson(filename, { ...manifest, publishedOn, updatedOn });
  }
  const { port } = await repo.start();
  const local = (await request(port, '/')).body;
  const deployed = (await request(port, '/?mode=deployed')).body;
  const card = (html, id) => html.match(new RegExp(`<article data-name="[^"]*${id}"[^>]*>(.*?)</article>`))[1];
  for (const html of [local, deployed]) {
    assert.match(card(html, ids.legacy), /class="release-badge new"><strong>New<\/strong>/);
    assert.doesNotMatch(card(html, ids.legacy), /<strong>Updated<\/strong>/);
    assert.match(card(html, ids.sdk), /class="release-badge update"><strong>Updated<\/strong>/);
  }
  assert.doesNotMatch(card(local, ids.disabled), /release-badge/);
  assert.doesNotMatch(card(local, ids.unregistered), /release-badge/);
  assert.doesNotMatch(local, /모든 게임 보기/);
});
