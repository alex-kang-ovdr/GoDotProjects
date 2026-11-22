import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server/app.mjs';

function makeTempConfig(rootDir) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-adgame-test-'));
  return {
    dataDir,
    config: {
      publicHost: '127.0.0.1',
      publicPort: 0,
      adminHost: '127.0.0.1',
      adminPort: 0,
      userOrigins: ['http://127.0.0.1:18280'],
      adminOrigins: ['http://127.0.0.1:18281'],
      userBaseUrl: 'http://127.0.0.1:18280',
      publicBaseUrl: 'http://127.0.0.1:18290',
      adminBaseUrl: 'http://127.0.0.1:18281',
      dataDir,
      secureCookies: false
    }
  };
}

function makeFakeCatalogRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-adgame-root-'));
  fs.mkdirSync(path.join(dir, 'catalog'), { recursive: true });
  const ids = ['world-of-warships', 'besiege', 'league-of-legends', 'clash-royale', 'survivor-io', 'forge-iron-wood', 'forge-survivor-io'];
  const entries = ids.map(id => ({ id, path: `games/${id}`, enabled: true }));
  fs.writeFileSync(path.join(dir, 'catalog', 'games.json'), JSON.stringify({ schemaVersion: 1, entries }));
  for (const id of ids) {
    const gdir = path.join(dir, 'games', id);
    fs.mkdirSync(path.join(gdir, 'assets'), { recursive: true });
    const cover = id === 'league-of-legends' ? 'assets/platform-cover.jpg' : 'assets/platform-cover.png';
    fs.writeFileSync(path.join(gdir, 'index.html'), '<!doctype html><html><body>ok</body></html>');
    fs.writeFileSync(path.join(gdir, cover), 'img');
    fs.writeFileSync(path.join(gdir, 'game.manifest.json'), JSON.stringify({
      id,
      slug: id,
      entry: 'index.html',
      title: { ko: id, en: id },
      summary: { ko: id, en: id },
      instructions: { ko: id, en: id },
      media: { cover },
      capabilities: { workers: false, externalNetwork: [] },
      seo: { indexable: false, title: { ko: id, en: id }, description: { ko: id, en: id } }
    }));
  }
  return dir;
}

test('Hub-AdGame PoC end-to-end flow: 5 games, cooperation modes, one-time handoff, anti-fraud, smart router & CPA qualification', async () => {
  const rootDir = makeFakeCatalogRoot();
  const { config, dataDir } = makeTempConfig(rootDir);
  let clock = 1795309200000;
  const app = createApp(config, { rootDir, clock: () => clock });
  const { public: pub } = await app.listen();
  const base = `http://127.0.0.1:${pub.port}`;

  try {
    // 1. Verify all 5 requested games + partner cooperation modes
    const campRes = await fetch(`${base}/api/adgame/campaigns?partner=karrot`);
    assert.equal(campRes.status, 200);
    const campData = await campRes.json();
    assert.equal(campData.partner.ctaMode, 'install_direct');
    const titles = campData.campaigns.map(c => c.titleKo);
    assert.deepEqual(titles, ['아이언 타이드', '비 시즈', '넥서스전선', '클래시 로얄', '탕탕특공대']);
    const demoIds = campData.campaigns.map(c => c.demoGameId);
    assert.deepEqual(demoIds, ['world-of-warships', 'besiege', 'league-of-legends', 'clash-royale', 'survivor-io']);

    const tossRes = await fetch(`${base}/api/adgame/campaigns?partner=toss`);
    const tossData = await tossRes.json();
    assert.equal(tossData.partner.ctaMode, 'content_only');

    // 2. Android App Links (.well-known/assetlinks.json)
    const assetRes = await fetch(`${base}/.well-known/assetlinks.json`);
    assert.equal(assetRes.status, 200);
    const assetLinks = await assetRes.json();
    assert.equal(assetLinks[0].target.namespace, 'android_app');

    // 3. Start anonymous demo session for 탕탕특공대 (survivor-io)
    const sessRes = await fetch(`${base}/api/adgame/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Karrot/24.1' },
      body: JSON.stringify({ campaignId: 'karrot-survivor-io', partnerId: 'karrot', regionTag: '일원본동' })
    });
    assert.equal(sessRes.status, 201);
    const session = await sessRes.json();
    assert.equal(session.demoGameId, 'survivor-io');
    assert.equal(session.userAgentFamily, 'android-inapp');

    // 4. Record loaded & first_input events
    for (const evType of ['loaded', 'first_input']) {
      const evRes = await fetch(`${base}/api/adgame/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.sessionId, eventType: evType, playMs: 12000, score: 4200 })
      });
      assert.equal(evRes.status, 201);
    }

    // 5. Issue one-time handoff token (with Forge Godot target override test on besiege/survivor-io)
    const hoRes = await fetch(`${base}/api/adgame/sessions/${session.sessionId}/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: 12450, stage: 2, playMs: 45000, targetGameId: 'forge-survivor-io' })
    });
    assert.equal(hoRes.status, 201);
    const handoff = await hoRes.json();
    assert.match(handoff.handoffToken, /^adh_/);
    assert.equal(handoff.shortCode.length, 6);
    assert.equal(handoff.targetGameId, 'forge-survivor-io');
    assert.match(handoff.links.webContinuePath, /^\/play\/forge-survivor-io\/\?ad_handoff=/);

    // 6. Smart router HTML (/ad/go/:shortCode) & Universal link browser fallback (/ad/claim/:token)
    const goRes = await fetch(`${base}/ad/go/${handoff.shortCode}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14)' }
    });
    assert.equal(goRes.status, 200);
    const goHtml = await goRes.text();
    assert.match(goHtml, /탕탕특공대/);
    assert.match(goHtml, new RegExp(handoff.shortCode));

    const claimRedirectRes = await fetch(`${base}/ad/claim/${handoff.handoffToken}`, { redirect: 'manual' });
    assert.equal(claimRedirectRes.status, 302);
    assert.match(claimRedirectRes.headers.get('location') || '', /^\/play\/forge-survivor-io\/\?ad_handoff=adh_/);

    // 7. Claim handoff token atomically on PlayHub entry
    const claimRes = await fetch(`${base}/api/adgame/handoff/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: handoff.handoffToken, deviceId: 'device-001', installChannel: 'aos_referrer' })
    });
    assert.equal(claimRes.status, 200);
    const claimed = await claimRes.json();
    assert.equal(claimed.claimed, true);
    assert.equal(claimed.rewardGranted, true);
    assert.equal(claimed.snapshot.score, 12450);

    // 8. Re-claiming the same one-time token must fail with 409
    const doubleRes = await fetch(`${base}/api/adgame/handoff/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: handoff.handoffToken, deviceId: 'device-001', installChannel: 'aos_referrer' })
    });
    assert.equal(doubleRes.status, 409);

    // 9. Anti-fraud: same device claiming a second token for the same campaign gets duplicateDeviceGuard
    const ho2Res = await fetch(`${base}/api/adgame/sessions/${session.sessionId}/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: 9999, stage: 1, playMs: 20000 })
    });
    const ho2 = await ho2Res.json();
    const claim2Res = await fetch(`${base}/api/adgame/handoff/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: ho2.shortCode, deviceId: 'device-001', installChannel: 'short_code' })
    });
    assert.equal(claim2Res.status, 200);
    const claim2 = await claim2Res.json();
    assert.equal(claim2.rewardGranted, false);
    assert.equal(claim2.duplicateDeviceGuard, true);

    // 10. Qualify full-game play for partner CPA
    const shortQualRes = await fetch(`${base}/api/adgame/attributions/${claimed.attributionId}/qualify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playMs: 1000 })
    });
    assert.equal(shortQualRes.status, 422);

    const qualRes = await fetch(`${base}/api/adgame/attributions/${claimed.attributionId}/qualify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playMs: 12000 })
    });
    assert.equal(qualRes.status, 200);
    const qual = await qualRes.json();
    assert.equal(qual.payoutStatus, 'qualified');

    // 11. Verify funnel telemetry aggregation
    const funnelRes = await fetch(`${base}/api/adgame/funnel`);
    assert.equal(funnelRes.status, 200);
    const funnel = await funnelRes.json();
    assert.equal(funnel.counts.impression, 1);
    assert.equal(funnel.counts.demo_complete, 2);
    assert.equal(funnel.counts.handoff_claimed, 2);
    assert.equal(funnel.counts.qualified_play, 1);
  } finally {
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
