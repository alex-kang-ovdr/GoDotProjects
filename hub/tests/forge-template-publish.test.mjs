import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createForgeTemplatePublisher } from '../server/forge-template-publisher.mjs';

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
