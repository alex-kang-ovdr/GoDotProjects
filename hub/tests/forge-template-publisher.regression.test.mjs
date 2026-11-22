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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-forge-pub-reg-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  fs.mkdirSync(path.join(dir, 'forge', 'Tools'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'forge', 'Templates'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'games'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'hub', 'dist', 'user', 'games'), { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, 'forge', 'Tools', 'template-catalog.cjs'),
    path.join(dir, 'forge', 'Tools', 'template-catalog.cjs')
  );
  const src = path.join(repoRoot, 'forge', 'Templates', 'tappy-chicken');
  if (fs.existsSync(src)) {
    fs.cpSync(src, path.join(dir, 'forge', 'Templates', 'tappy-chicken'), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'games', 'catalog.json'), JSON.stringify({
    schemaVersion: 1, defaultLocale: 'ko', supportedLocales: ['ko', 'en'], entries: []
  }, null, 2));
  return dir;
}

async function waitDone(publisher, jobId) {
  for (let i = 0; i < 150; i++) {
    const job = publisher.getJob(jobId);
    if (job.status !== 'running') return job;
    await delay(20);
  }
  throw new Error('Publish job timed out (activeJob stuck in running)');
}

test('regression: unexpected exception in runJob() marks job failed and releases activeJobId', async t => {
  const platformRoot = makeTempPlatform(t);
  let nowCalls = 0;
  let shouldThrow = true;
  const publisher = createForgeTemplatePublisher({
    platformRoot,
    now: () => {
      nowCalls++;
      // Call 1 is startBatchPublish() startedAt; throw on runJob() entry kstToday(now)
      if (shouldThrow && nowCalls === 2) {
        throw new Error('Unexpected clock failure inside runJob');
      }
      return Date.now();
    },
    exportTemplate: async (_tpl, outDir) => {
      fs.writeFileSync(path.join(outDir, 'index.html'), '<!doctype html>', 'utf8');
    },
    syncAndBuild: async () => {}
  });

  const job1 = publisher.startBatchPublish({ templateIds: ['tappy-chicken'], rebuildDist: false });
  const done1 = await waitDone(publisher, job1.id);

  assert.equal(done1.status, 'failed');
  assert.ok(done1.finishedAt, 'finishedAt must be populated on unexpected failure');
  assert.equal(done1.buildStatus, 'failed');
  assert.equal(done1.items[0].status, 'failed');
  assert.equal(publisher.statusSummary().activeJob, null, 'activeJobId must be released in finally');

  // Subsequent job must NOT fail with 409 PUBLISH_JOB_IN_PROGRESS
  shouldThrow = false;
  const job2 = publisher.startBatchPublish({ templateIds: ['tappy-chicken'], rebuildDist: false });
  const done2 = await waitDone(publisher, job2.id);
  assert.equal(done2.status, 'completed');
  assert.equal(publisher.statusSummary().activeJob, null);
});

test('regression: stageWeb rmSync EBUSY uses retry options, catches error, and releases activeJobId', async t => {
  const platformRoot = makeTempPlatform(t);
  const origRmSync = fs.rmSync;
  const stageCalls = [];
  fs.rmSync = (targetPath, options) => {
    if (String(targetPath).includes('.Web-stage-')) {
      stageCalls.push({ targetPath: String(targetPath), options });
      const err = new Error('EBUSY: resource busy or locked');
      err.code = 'EBUSY';
      throw err;
    }
    return origRmSync(targetPath, options);
  };
  t.after(() => { fs.rmSync = origRmSync; });

  let failExport = true;
  const publisher = createForgeTemplatePublisher({
    platformRoot,
    exportTemplate: async (_tpl, outDir) => {
      if (failExport) throw new Error('Simulated export crash');
      fs.writeFileSync(path.join(outDir, 'index.html'), '<!doctype html>', 'utf8');
    },
    syncAndBuild: async () => {}
  });

  const job1 = publisher.startBatchPublish({ templateIds: ['tappy-chicken'], rebuildDist: false });
  const done1 = await waitDone(publisher, job1.id);

  assert.equal(done1.status, 'failed');
  assert.equal(done1.items[0].status, 'failed');
  assert.match(done1.items[0].error, /Simulated export crash/);
  assert.equal(stageCalls.length, 1);
  assert.equal(stageCalls[0].options?.maxRetries, 5);
  assert.equal(stageCalls[0].options?.retryDelay, 100);
  assert.equal(stageCalls[0].options?.recursive, true);
  assert.equal(stageCalls[0].options?.force, true);
  assert.equal(publisher.statusSummary().activeJob, null, 'activeJobId must not stay locked after stageWeb rmSync error');

  failExport = false;
  const job2 = publisher.startBatchPublish({ templateIds: ['tappy-chicken'], rebuildDist: false });
  const done2 = await waitDone(publisher, job2.id);
  assert.equal(done2.status, 'completed');
});

test('regression: backupWeb rmSync EPERM uses retry options and does not abort published item', async t => {
  const platformRoot = makeTempPlatform(t);
  const existingWeb = path.join(platformRoot, 'games', 'forge-tappy-chicken', 'Web');
  fs.mkdirSync(existingWeb, { recursive: true });
  fs.writeFileSync(path.join(existingWeb, 'index.html'), 'old version', 'utf8');

  const origRmSync = fs.rmSync;
  const backupCalls = [];
  fs.rmSync = (targetPath, options) => {
    if (String(targetPath).includes('.Web-old-')) {
      backupCalls.push({ targetPath: String(targetPath), options });
      const err = new Error('EPERM: operation not permitted');
      err.code = 'EPERM';
      throw err;
    }
    return origRmSync(targetPath, options);
  };
  t.after(() => { fs.rmSync = origRmSync; });

  const publisher = createForgeTemplatePublisher({
    platformRoot,
    exportTemplate: async (_tpl, outDir) => {
      fs.writeFileSync(path.join(outDir, 'index.html'), 'new version', 'utf8');
    },
    syncAndBuild: async () => {}
  });

  const job = publisher.startBatchPublish({ templateIds: ['tappy-chicken'], rebuildDist: false });
  const done = await waitDone(publisher, job.id);

  assert.equal(done.status, 'completed');
  assert.equal(done.items[0].status, 'published');
  assert.equal(backupCalls.length, 1);
  assert.equal(backupCalls[0].options?.maxRetries, 5);
  assert.equal(backupCalls[0].options?.retryDelay, 100);
  assert.equal(backupCalls[0].options?.recursive, true);
  assert.equal(backupCalls[0].options?.force, true);
  assert.equal(fs.readFileSync(path.join(existingWeb, 'index.html'), 'utf8'), 'new version');
  assert.equal(publisher.statusSummary().activeJob, null);
});
