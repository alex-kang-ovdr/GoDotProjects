'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  SPEC_TIERS,
  slugifyGameId,
  estimateMonthlyHubPoints,
  buildReleaseManifest,
  validateReleaseManifest,
  deriveHubGameManifest
} = require('../Tools/release-manifest.cjs');
const { injectPlayHubShell } = require('../Tools/build-queue.cjs');
const { zipFiles } = require('../Tools/export-godot-project.cjs');
const { validateDeploymentZip } = require('../Tools/deployment-zip-validator.cjs');
const { PlatformStore } = require('../Tools/platform-store.cjs');

test('estimateMonthlyHubPoints matches multiplayer-deploy-billing-plan flat-rate pricing', () => {
  const sp = estimateMonthlyHubPoints({ deployMode: 'singleplay', specTier: 'large', activeHoursPerDay: 24, avgCcu: 1000 });
  assert.equal(sp.monthlyPoints, 0);
  assert.equal(sp.monthlyKrw, 0);
  assert.equal(sp.freeTierEligible, true);

  const freeMo = estimateMonthlyHubPoints({ deployMode: 'mo', specTier: 'free-nano', activeHoursPerDay: 1, avgCcu: 5 });
  assert.equal(freeMo.monthlyPoints, 0);
  assert.equal(freeMo.estimatedUsagePoints, 90);
  assert.equal(freeMo.freeTierEligible, true);
  assert.equal(freeMo.warnings.length, 0);

  const overFreeMo = estimateMonthlyHubPoints({ deployMode: 'mo', specTier: 'free-nano', activeHoursPerDay: 3, avgCcu: 20 });
  assert.equal(overFreeMo.freeTierEligible, false);
  assert.ok(overFreeMo.warnings.length >= 1);

  const smallMo = estimateMonthlyHubPoints({ deployMode: 'mo', specTier: 'small', activeHoursPerDay: 6, avgCcu: 60 });
  // 1 instance * 12 P/hr * 180h = 2160 P
  assert.equal(smallMo.estimatedInstances, 1);
  assert.equal(smallMo.monthlyPoints, 2160);
  assert.equal(smallMo.monthlyKrw, 2160 * 14);

  const mmoAlways = estimateMonthlyHubPoints({ deployMode: 'mmo', specTier: 'medium', activeHoursPerDay: 2, avgCcu: 350, alwaysOn: true });
  // 2 instances * 24 P/hr * 720h = 34560 P
  assert.equal(mmoAlways.estimatedInstances, 2);
  assert.equal(mmoAlways.monthlyHours, 720);
  assert.equal(mmoAlways.monthlyPoints, 34560);
  assert.ok(mmoAlways.warnings.some(w => w.includes('alwaysOn')));
});

test('buildReleaseManifest + validateReleaseManifest enforce deployProfile & gameMetadata contracts', () => {
  const projectId = 'a'.repeat(24);
  const buildId = '1'.repeat(16);

  const validSp = buildReleaseManifest({
    releaseId: 'b'.repeat(24),
    projectId,
    projectName: 'Sky Hop Arena',
    sourceRevision: 4,
    sourceHash: 'c'.repeat(64),
    build: { buildId, artifactSha256: 'd'.repeat(64), bytes: 1024, expandedBytes: 2048 },
    visibility: 'public',
    deployProfile: { deployMode: 'singleplay' },
    gameMetadata: {
      slug: 'sky-hop-arena',
      title: { ko: '스카이 홉', en: 'Sky Hop' },
      summary: { ko: '점프 게임', en: 'Jump game' },
      tags: ['arcade', 'platformer']
    }
  });
  const spCheck = validateReleaseManifest(validSp);
  assert.equal(spCheck.ok, true);
  assert.equal(validSp.deployProfile.serverRuntime, 'none');
  assert.equal(validSp.engine.version, '4.7.2-stable');

  const hubManifest = deriveHubGameManifest(validSp);
  assert.equal(hubManifest.schemaVersion, 1);
  assert.equal(hubManifest.id, 'sky-hop-arena');
  assert.equal(hubManifest.entry, 'index.html');
  assert.equal(hubManifest.version, '0.1.4');
  assert.equal(hubManifest.capabilities.workers, false);
  assert.equal(hubManifest.seo.indexable, true);

  // MMO + free-nano + public must be rejected
  const invalidMmo = buildReleaseManifest({
    projectId,
    projectName: 'Free MMO',
    sourceRevision: 1,
    build: { buildId },
    visibility: 'public',
    deployProfile: { deployMode: 'mmo', specTier: 'free-nano', serverRuntime: 'node-wss-v1' }
  });
  const mmoCheck = validateReleaseManifest(invalidMmo);
  assert.equal(mmoCheck.ok, false);
  assert.ok(mmoCheck.errors.includes('MMO_PUBLIC_REQUIRES_PAID_TIER'));

  assert.equal(slugifyGameId('  Super Jump 3D!!  '), 'super-jump-3d');
  assert.match(slugifyGameId('한글 게임', 'seed-1'), /^game-[a-f0-9]{8}$/);
  assert.equal(SPEC_TIERS.small.pointsPerHour, 12);
});

test('injectPlayHubShell injects bridge script idempotently and passes deployment ZIP security validator', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-shell-'));
  try {
    fs.writeFileSync(path.join(tmp, 'index.html'), '<!doctype html><html><head><title>Test</title></head><body><canvas></canvas></body></html>');
    fs.writeFileSync(path.join(tmp, 'index.wasm'), Buffer.from([0x00, 0x61, 0x73, 0x6d]));
    fs.writeFileSync(path.join(tmp, 'index.pck'), Buffer.from('GDPCtest'));

    assert.equal(injectPlayHubShell(tmp), true);
    assert.equal(injectPlayHubShell(tmp), true); // idempotent

    const html = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
    assert.equal((html.match(/playhub-godot-shell\.js/g) || []).length, 1);
    assert.equal(fs.existsSync(path.join(tmp, 'playhub-godot-shell.js')), true);

    const shellSrc = fs.readFileSync(path.join(tmp, 'playhub-godot-shell.js'), 'utf8');
    assert.ok(shellSrc.includes('reportFailure'), 'shell bridge must expose failure reporting');
    assert.doesNotMatch(shellSrc, /resolveConnect\(\);\s*sendReadyOnce\(\);/, 'shell bridge must not fire ready before engine initialization');

    const names = fs.readdirSync(tmp).sort();
    const zipBuffer = zipFiles(names.map(name => [name, fs.readFileSync(path.join(tmp, name))]));
    const validated = validateDeploymentZip(zipBuffer);
    assert.equal(validated.entryPoint, 'index.html');
    assert.equal(validated.entries, 4);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('tappy-chicken-mmo Forge template exposes showcase, publishDefaults (MMO portrait), and valid release manifest', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tappy-mmo-tpl-'));
  try {
    const forgeRoot = path.resolve(__dirname, '..');
    const store = new PlatformStore(forgeRoot, tmp);
    const tpl = store.getTemplate('tappy-chicken-mmo');
    assert.equal(tpl.id, 'tappy-chicken-mmo');
    assert.equal(tpl.dimension, '2d');
    assert.ok(tpl.publishDefaults);
    assert.equal(tpl.publishDefaults.deployProfile.deployMode, 'mmo');
    assert.equal(tpl.publishDefaults.deployProfile.specTier, 'small');
    assert.equal(tpl.publishDefaults.gameMetadata.slug, 'tappy-chicken-mmo');
    assert.equal(tpl.publishDefaults.gameMetadata.viewport.width, 480);
    assert.equal(tpl.publishDefaults.gameMetadata.viewport.height, 640);
    assert.equal(tpl.publishDefaults.gameMetadata.viewport.orientation, 'portrait');

    const showcase = store.getShowcase('tappy-chicken-mmo');
    assert.equal(showcase.schemaVersion, 3);
    assert.ok(showcase.bootstrapFiles.includes('Scripts/MmoNetwork.gd'));

    const createdReady = store.createProject({ name: 'My Tappy MMO', template: 'tappy-chicken-mmo', mode: 'ready' });
    assert.equal(createdReady.template, 'tappy-chicken-mmo');
    assert.ok(createdReady.files['Scripts/MmoNetwork.gd']);

    const createdShowcase = store.createProject({ name: 'My Tappy MMO Showcase', template: 'tappy-chicken-mmo', mode: 'showcase' });
    assert.equal(createdShowcase.mode, 'showcase');

    const manifest = buildReleaseManifest({
      releaseId: 'e'.repeat(24),
      projectId: createdReady.id,
      projectName: createdReady.name,
      sourceRevision: createdReady.revision,
      build: { buildId: '1'.repeat(16), artifactSha256: '2'.repeat(64) },
      visibility: 'public',
      deployProfile: tpl.publishDefaults.deployProfile,
      gameMetadata: tpl.publishDefaults.gameMetadata
    });
    const check = validateReleaseManifest(manifest);
    assert.equal(check.ok, true);
    assert.equal(manifest.deployProfile.deployMode, 'mmo');
    assert.equal(manifest.gameMetadata.viewport.orientation, 'portrait');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
