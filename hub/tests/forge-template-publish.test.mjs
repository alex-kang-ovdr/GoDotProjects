import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { bumpMinorVersion, createForgeTemplatePublisher } from '../server/forge-template-publisher.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function makeTempPlatform(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-forge-pub-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));
  fs.mkdirSync(path.join(dir, 'forge', 'Tools'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'forge', 'Templates'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'games'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'hub', 'dist', 'user', 'games'), { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, 'forge', 'Tools', 'template-catalog.cjs'),
    path.join(dir, 'forge', 'Tools', 'template-catalog.cjs')
  );
  for (const id of ['tappy-chicken', 'brawllabs']) {
    const src = path.join(repoRoot, 'forge', 'Templates', id);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(dir, 'forge', 'Templates', id), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'games', 'catalog.json'), JSON.stringify({
    schemaVersion: 1, defaultLocale: 'ko', supportedLocales: ['ko', 'en'], entries: []
  }, null, 2));
  return dir;
}

async function waitDone(publisher, jobId) {
  for (let i = 0; i < 100; i++) {
    const job = publisher.getJob(jobId);
    if (job.status !== 'running') return job;
    await delay(20);
  }
  throw new Error('Publish job timed out');
}

test('batch publishes selected Forge templates, updates catalog, builds once, and records audit', async t => {
  const platformRoot = makeTempPlatform(t);
  const audits = [];
  let buildCalls = 0;
  const publisher = createForgeTemplatePublisher({
    platformRoot,
    rootDir: path.join(platformRoot, 'hub', 'dist', 'user'),
    audit: (action, target, detail) => audits.push({ action, target, detail }),
    exportTemplate: async (tpl, outDir) => {
      fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><title>${tpl.name}</title>`, 'utf8');
      fs.writeFileSync(path.join(outDir, 'index.wasm'), Buffer.from('wasm'));
      fs.writeFileSync(path.join(outDir, 'index.pck'), Buffer.from('pck'));
      fs.writeFileSync(path.join(outDir, 'playhub-godot-shell.js'), '// bridge', 'utf8');
    },
    syncAndBuild: async () => {
      buildCalls++;
      for (const id of ['forge-tappy-chicken', 'forge-brawllabs']) {
        const d = path.join(platformRoot, 'hub', 'dist', 'user', 'games', id);
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, 'index.html'), '<!doctype html>', 'utf8');
      }
    }
  });

  const before = publisher.listTemplates();
  assert.equal(before.length, 2);
  assert.equal(before.every(item => item.published === false), true);

  const started = publisher.startBatchPublish({ templateIds: 'all', enableInCatalog: true, rebuildDist: true });
  assert.equal(started.status, 'running');
  assert.equal(started.items.length, 2);

  const done = await waitDone(publisher, started.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.buildStatus, 'succeeded');
  assert.equal(done.summary.succeeded, 2);
  assert.equal(done.summary.failed, 0);
  assert.equal(buildCalls, 1);

  const catalog = JSON.parse(fs.readFileSync(path.join(platformRoot, 'games', 'catalog.json'), 'utf8'));
  assert.deepEqual(catalog.entries.map(e => e.id).sort(), ['forge-brawllabs', 'forge-tappy-chicken']);
  for (const id of ['forge-brawllabs', 'forge-tappy-chicken']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(platformRoot, 'games', id, 'game.manifest.json'), 'utf8'));
    assert.equal(manifest.id, id);
    assert.equal(manifest.integration, 'native-sdk');
    assert.equal(manifest.capabilities.wasm, true);
    assert.ok(fs.existsSync(path.join(platformRoot, 'games', id, 'Web', 'assets', 'cover.svg')));
  }

  const after = publisher.listTemplates();
  assert.equal(after.every(item => item.published === true && item.inHubDist === true), true);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].action, 'forge_templates_batch_publish');
  assert.equal(audits[0].detail.succeeded, 2);
});

test('validates template IDs, rejects concurrent jobs, and reports partial failures cleanly', async t => {
  const platformRoot = makeTempPlatform(t);
  const publisher = createForgeTemplatePublisher({
    platformRoot,
    exportTemplate: async (tpl, outDir) => {
      await delay(30);
      if (tpl.id === 'brawllabs') throw new Error('Simulated Godot export failure');
      fs.writeFileSync(path.join(outDir, 'index.html'), '<!doctype html>', 'utf8');
    },
    syncAndBuild: async () => {}
  });

  assert.throws(() => publisher.startBatchPublish({ templateIds: [] }), { code: 'TEMPLATE_IDS_REQUIRED' });
  assert.throws(() => publisher.startBatchPublish({ templateIds: ['../evil'] }), { code: 'TEMPLATE_ID_INVALID' });
  assert.throws(() => publisher.startBatchPublish({ templateIds: ['nonexistent'] }), { code: 'TEMPLATE_ID_INVALID' });
  assert.throws(() => publisher.getJob('missing-job'), { code: 'PUBLISH_JOB_NOT_FOUND' });

  const job = publisher.startBatchPublish({ templateIds: ['brawllabs', 'tappy-chicken'] });
  assert.throws(() => publisher.startBatchPublish({ templateIds: ['tappy-chicken'] }), { code: 'PUBLISH_JOB_IN_PROGRESS' });

  const done = await waitDone(publisher, job.id);
  assert.equal(done.status, 'partial');
  assert.equal(done.summary.succeeded, 1);
  assert.equal(done.summary.failed, 1);
  assert.equal(done.buildStatus, 'succeeded');
  assert.match(done.items.find(i => i.templateId === 'brawllabs').error, /Simulated Godot export failure/);
  assert.equal(done.items.find(i => i.templateId === 'tappy-chicken').status, 'published');
});

test('bumpMinorVersion increments minor version and resets patch to 0', () => {
  assert.equal(bumpMinorVersion('1.0.0'), '1.1.0');
  assert.equal(bumpMinorVersion('1.9.0'), '1.10.0');
  assert.equal(bumpMinorVersion('2.3.4'), '2.4.0');
  assert.equal(bumpMinorVersion('0.0.1'), '0.1.0');
  assert.equal(bumpMinorVersion('invalid'), '1.1.0');
  assert.equal(bumpMinorVersion(''), '1.1.0');
});

test('auto-bumps minor version on re-publish, preserves publishedOn, updates updatedOn, and handles mixed batches', async t => {
  const platformRoot = makeTempPlatform(t);
  const audits = [];
  // Day 1: 2026-11-21 12:00 KST (03:00 UTC)
  let currentNow = Date.parse('2026-11-21T03:00:00Z');
  const publisher = createForgeTemplatePublisher({
    platformRoot,
    rootDir: path.join(platformRoot, 'hub', 'dist', 'user'),
    now: () => currentNow,
    audit: (action, target, detail) => audits.push({ action, target, detail }),
    exportTemplate: async (tpl, outDir) => {
      fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><title>${tpl.name}</title>`, 'utf8');
      fs.writeFileSync(path.join(outDir, 'index.wasm'), Buffer.from('wasm'));
      fs.writeFileSync(path.join(outDir, 'index.pck'), Buffer.from('pck'));
      fs.writeFileSync(path.join(outDir, 'playhub-godot-shell.js'), '// bridge', 'utf8');
    },
    syncAndBuild: async () => {}
  });

  // 1) Initial publish of tappy-chicken only on 2026-11-21
  const job1 = await waitDone(publisher, publisher.startBatchPublish({ templateIds: ['tappy-chicken'] }).id);
  assert.equal(job1.status, 'completed');
  assert.equal(job1.items[0].previousVersion, null);
  assert.equal(job1.items[0].version, '1.0.0');
  assert.equal(job1.items[0].versionAction, 'initial');

  const manifest1 = JSON.parse(fs.readFileSync(path.join(platformRoot, 'games', 'forge-tappy-chicken', 'game.manifest.json'), 'utf8'));
  assert.equal(manifest1.version, '1.0.0');
  assert.equal(manifest1.publishedOn, '2026-11-21');
  assert.equal(manifest1.updatedOn, '2026-11-21');

  // Verify listTemplates reflects current version and planned nextVersion
  const listedMid = publisher.listTemplates();
  const tappyMid = listedMid.find(item => item.id === 'tappy-chicken');
  const brawlMid = listedMid.find(item => item.id === 'brawllabs');
  assert.equal(tappyMid.version, '1.0.0');
  assert.equal(tappyMid.nextVersion, '1.1.0');
  assert.equal(brawlMid.version, null);
  assert.equal(brawlMid.nextVersion, '1.0.0');

  // 2) Day 2 (2026-11-22): mixed batch ['tappy-chicken', 'brawllabs']
  currentNow = Date.parse('2026-11-22T03:00:00Z');
  const job2 = await waitDone(publisher, publisher.startBatchPublish({ templateIds: ['tappy-chicken', 'brawllabs'] }).id);
  assert.equal(job2.status, 'completed');

  const tappyItem2 = job2.items.find(i => i.templateId === 'tappy-chicken');
  const brawlItem2 = job2.items.find(i => i.templateId === 'brawllabs');
  assert.equal(tappyItem2.previousVersion, '1.0.0');
  assert.equal(tappyItem2.version, '1.1.0');
  assert.equal(tappyItem2.versionAction, 'bumped');
  assert.equal(brawlItem2.previousVersion, null);
  assert.equal(brawlItem2.version, '1.0.0');
  assert.equal(brawlItem2.versionAction, 'initial');

  const tappyManifest2 = JSON.parse(fs.readFileSync(path.join(platformRoot, 'games', 'forge-tappy-chicken', 'game.manifest.json'), 'utf8'));
  assert.equal(tappyManifest2.version, '1.1.0');
  assert.equal(tappyManifest2.publishedOn, '2026-11-21');
  assert.equal(tappyManifest2.updatedOn, '2026-11-22');

  const brawlManifest2 = JSON.parse(fs.readFileSync(path.join(platformRoot, 'games', 'forge-brawllabs', 'game.manifest.json'), 'utf8'));
  assert.equal(brawlManifest2.version, '1.0.0');
  assert.equal(brawlManifest2.publishedOn, '2026-11-22');
  assert.equal(brawlManifest2.updatedOn, '2026-11-22');

  // 3) Re-publish tappy-chicken again -> 1.1.0 -> 1.2.0
  currentNow = Date.parse('2026-11-23T03:00:00Z');
  const job3 = await waitDone(publisher, publisher.startBatchPublish({ templateIds: ['tappy-chicken'] }).id);
  assert.equal(job3.status, 'completed');
  assert.equal(job3.items[0].previousVersion, '1.1.0');
  assert.equal(job3.items[0].version, '1.2.0');
  assert.equal(job3.items[0].versionAction, 'bumped');

  const tappyManifest3 = JSON.parse(fs.readFileSync(path.join(platformRoot, 'games', 'forge-tappy-chicken', 'game.manifest.json'), 'utf8'));
  assert.equal(tappyManifest3.version, '1.2.0');
  assert.equal(tappyManifest3.publishedOn, '2026-11-21');
  assert.equal(tappyManifest3.updatedOn, '2026-11-23');

  assert.equal(audits[1].detail.versionChanges.length, 2);
  assert.deepEqual(
    audits[1].detail.versionChanges.find(v => v.templateId === 'tappy-chicken'),
    { templateId: 'tappy-chicken', gameId: 'forge-tappy-chicken', previousVersion: '1.0.0', version: '1.1.0', action: 'bumped' }
  );
});
