'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { promisify } = require('node:util');

const { createServer } = require('../../server.cjs');
const { PlatformStore } = require('../../Tools/platform-store.cjs');
const { normalizeFiles } = require('../../Tools/platform-project.cjs');
const {
  buildSealManifest,
  injectSealedAvatarIntoProjectDir,
  isSealedAvatarPath,
  loadSealedAvatarBundle,
  stripSealedAvatarEntries,
} = require('../../Tools/avatar-seal.cjs');

const run = promisify(execFile);
const forgeRoot = path.resolve(__dirname, '../..');
const godotConsole = process.env.GODOT_BIN || 'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64_console.exe';

async function withForgeServer(fn) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const workspace = fs.mkdtempSync(path.join(tempRoot, 'playforge-avatar-srv-'));
  const server = createServer({
    hubAuth: false,
    workspace: path.join(workspace, 'studio'),
    platformWorkspace: path.join(workspace, 'platform'),
    buildDirectory: path.join(workspace, 'builds'),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await fn(baseUrl, workspace);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

test('Forge Layer 1 seal: PlatformStore & platform-project block any direct modification of addons/playforge_avatar', async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-avatar-store-'));
  try {
    const store = new PlatformStore(forgeRoot, workspace);
    const project = store.createProject({ name: 'Avatar Seal Test', template: 'blank3d' });

    // 1. Direct single-file write to addons/playforge_avatar/* must fail with HTTP 400 read-only
    assert.throws(
      () =>
        store.updateFile(project.id, {
          path: 'addons/playforge_avatar/avatar_controller.gd',
          content: 'extends Node\n# tampered by creator\n',
          baseRevision: project.revision,
        }),
      (err) => err.status === 400 && /read-only/i.test(err.message)
    );

    assert.throws(
      () =>
        store.updateFile(project.id, {
          path: 'addons/playforge_avatar/catalog.json',
          content: '{"items":[]}',
          baseRevision: project.revision,
        }),
      (err) => err.status === 400
    );

    // 2. Bulk updateFiles must silently drop any addons/playforge_avatar/* entries while saving valid user files
    const updated = await store.updateFiles(project.id, {
      baseRevision: project.revision,
      files: [
        ...Object.entries(project.files).map(([p, c]) => ({ path: p, content: c })),
        { path: 'addons/playforge_avatar/avatar_rig.gd', content: '# hacked' },
        { path: 'scripts/game_rule.gd', content: 'extends Node\n' },
      ],
    });
    assert.equal(updated.files['scripts/game_rule.gd'], 'extends Node\n');
    assert.equal(updated.files['addons/playforge_avatar/avatar_rig.gd'], undefined);

    // 3. platform-project normalizeFiles strips sealed avatar paths
    const normalized = normalizeFiles([
      { path: 'project.godot', content: '[application]\n' },
      { path: 'addons/playforge_avatar/avatar_spawn.gd', content: '# override attempt' },
    ]);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].path, 'project.godot');
    assert.equal(isSealedAvatarPath('addons/playforge_avatar/plugin.gd'), true);

    // 4. Case-insensitive Windows/macOS sealed path bypass regression checks
    const caseVariants = [
      'Addons/playforge_avatar/avatar_controller.gd',
      'ADDONS/PlayForge_Avatar/catalog.json',
      'addons/PLAYFORGE_AVATAR/avatar_bridge.gd',
      'Addons/PlayForge_Avatar',
    ];
    for (const variant of caseVariants) {
      assert.equal(isSealedAvatarPath(variant), true, `isSealedAvatarPath must block ${variant}`);
      assert.throws(
        () =>
          store.updateFile(project.id, {
            path: variant,
            content: '# case-bypass attempt',
            baseRevision: updated.revision,
          }),
        (err) => err.status === 400 && /read-only/i.test(err.message),
        `PlatformStore.updateFile must reject case variant ${variant}`
      );
    }
    assert.equal(isSealedAvatarPath('Addons\\PlayForge_Avatar\\plugin.gd'), true);
    assert.equal(isSealedAvatarPath('./Addons/playforge_avatar/plugin.gd'), true);
    assert.equal(isSealedAvatarPath('res://addons/playforge_avatar/avatar_rig.gd'), true);
    assert.equal(isSealedAvatarPath('RES:///./addons/playforge_avatar/plugin.gd'), true);
    assert.equal(isSealedAvatarPath('foo/../addons/playforge_avatar/avatar_rig.gd'), true);
    assert.equal(isSealedAvatarPath('../addons/playforge_avatar/avatar_rig.gd'), true);
    assert.equal(isSealedAvatarPath('scenes/../../addons/playforge_avatar/catalog.json'), true);
    assert.equal(isSealedAvatarPath('addons//./playforge_avatar//avatar_rig.gd'), true);
    assert.equal(isSealedAvatarPath('scripts/player.gd'), false);

    // 4b. Verify avatar_rig.gd enforces fail-closed SHA-256 verification and release-mode external dir guard
    const avatarRigSrc = fs.readFileSync(path.join(forgeRoot, 'Godot', 'addons', 'playforge_avatar', 'avatar_rig.gd'), 'utf8');
    assert.match(avatarRigSrc, /OS\.is_debug_build\(\)/, 'avatar_rig.gd must gate external assets dir override behind OS.is_debug_build()');
    assert.match(avatarRigSrc, /_is_valid_sha256_hex\(/, 'avatar_rig.gd must validate 64-hex expected_sha fail-closed');
    assert.doesNotMatch(avatarRigSrc, /if expected_sha\.is_empty\(\) or _sha256_hex\(fetched\)/, 'Layer 3D must not allow empty expected_sha bypass');
    assert.deepEqual(
      stripSealedAvatarEntries([
        { path: 'scripts/ok.gd', content: '' },
        { path: 'Addons/playforge_avatar/avatar_rig.gd', content: '# hacked' },
        ['ADDONS/PLAYFORGE_AVATAR/catalog.json', '{}'],
      ]),
      [{ path: 'scripts/ok.gd', content: '' }]
    );

    const updatedCase = await store.updateFiles(project.id, {
      baseRevision: updated.revision,
      files: [
        ...Object.entries(updated.files).map(([p, c]) => ({ path: p, content: c })),
        { path: 'Addons/playforge_avatar/avatar_rig.gd', content: '# hacked mixed case' },
        { path: 'ADDONS/PlayForge_Avatar/catalog.json', content: '{}' },
        { path: 'scripts/safe_case_test.gd', content: 'extends Node\n' },
      ],
    });
    assert.equal(updatedCase.files['scripts/safe_case_test.gd'], 'extends Node\n');
    assert.equal(updatedCase.files['Addons/playforge_avatar/avatar_rig.gd'], undefined);
    assert.equal(updatedCase.files['ADDONS/PlayForge_Avatar/catalog.json'], undefined);

    const normalizedCase = normalizeFiles([
      { path: 'project.godot', content: '[application]\n' },
      { path: 'Addons/playforge_avatar/avatar_spawn.gd', content: '# case bypass' },
      { path: 'ADDONS/PlayForge_Platform/plugin.gd', content: '# case bypass' },
    ]);
    assert.equal(normalizedCase.length, 1);
    assert.equal(normalizedCase[0].path, 'project.godot');

    // 5. Verify editor-bridge.js uses lowercased case-insensitive sealed path filtering
    const editorBridgeSrc = fs.readFileSync(path.join(forgeRoot, 'OfficialGodot', 'editor-bridge.js'), 'utf8');
    assert.ok(
      editorBridgeSrc.includes('toLowerCase()') &&
      /addons\\\/playforge_\(platform\|replay\|showcase\|agent_chat\|remote_control\|avatar(?:\|[a-z0-9_|]+)?\)/.test(editorBridgeSrc),
      'editor-bridge.js must normalize sealed addon paths with toLowerCase()'
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('Forge Layer 2 seal: server exposes canonical avatar bundle & build injector overwrites tampered files', async () => {
  await withForgeServer(async (baseUrl, workspace) => {
    const res = await fetch(`${baseUrl}/api/platform-addon/avatar`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.sealed, true);
    assert.ok(data.files['avatar_controller.gd'].includes('PlayForgeAvatarController'));
    assert.ok(data.files['seal_manifest.json'].includes('"sealed": true'));
    assert.ok(data.assets.length >= 30, 'Expected 10 GLB skins + 20 GLB accessories');

    // Binary GLB asset endpoint works and rejects traversal
    const glbRes = await fetch(`${baseUrl}/api/platform-addon/avatar/assets/skins/RobotExpressive.glb`);
    assert.equal(glbRes.status, 200);
    const glbBuf = Buffer.from(await glbRes.arrayBuffer());
    assert.equal(glbBuf.readUInt32LE(0), 0x46546c67);

    const badRes = await fetch(`${baseUrl}/api/platform-addon/avatar/assets/skins/..%2F..%2Fserver.cjs`);
    assert.ok([400, 404, 405].includes(badRes.status), `Expected blocked traversal status, got ${badRes.status}`);
    const missingRes = await fetch(`${baseUrl}/api/platform-addon/avatar/assets/skins/NonExistent.glb`);
    assert.equal(missingRes.status, 404);

    // Build injection wipes tampered files and restores canonical SHA-256 copy
    const fakeBuildDir = path.join(workspace, 'fake-build-project');
    const tamperedDir = path.join(fakeBuildDir, 'addons', 'playforge_avatar');
    fs.mkdirSync(tamperedDir, { recursive: true });
    fs.writeFileSync(path.join(tamperedDir, 'avatar_controller.gd'), '# HACKED SKIN OVERRIDE');
    fs.writeFileSync(path.join(tamperedDir, 'evil_inject.gd'), 'extends Node');

    const manifest = injectSealedAvatarIntoProjectDir(forgeRoot, fakeBuildDir);
    assert.equal(fs.existsSync(path.join(tamperedDir, 'evil_inject.gd')), false);
    const canonical = loadSealedAvatarBundle(forgeRoot);
    assert.equal(
      fs.readFileSync(path.join(tamperedDir, 'avatar_controller.gd'), 'utf8'),
      canonical.files['avatar_controller.gd']
    );
    assert.equal(fs.existsSync(path.join(tamperedDir, 'assets/skins/Knight.glb')), true);
    assert.equal(manifest.fileCount, buildSealManifest(forgeRoot).fileCount);
  });
});

test(
  'Forge Layer 3 runtime: Godot 4.7.2 headless loads all 10 CC0 GLB skins, 4 sockets, TPS/FPS/TopDown locomotion, emotes & 12-bone ragdoll',
  {
    skip: process.platform !== 'win32' || !fs.existsSync(godotConsole) ? 'Windows Godot console unavailable' : false,
    timeout: 90000,
  },
  async () => {
    const probeScript = path.join(__dirname, 'fixtures', 'avatar-runtime-probe.gd');
    const { stdout } = await run(
      godotConsole,
      ['--headless', '--path', path.join(forgeRoot, 'Godot'), '--script', probeScript],
      { timeout: 60000 }
    );
    const line = stdout.split(/\r?\n/).find((l) => l.startsWith('AVATAR_PROBE_JSON='));
    assert.ok(line, `Expected AVATAR_PROBE_JSON in Godot output:\n${stdout}`);
    const report = JSON.parse(line.slice('AVATAR_PROBE_JSON='.length));
    assert.deepEqual(report.failures, []);
    assert.equal(report.catalogOk, true);
    assert.equal(report.sealVerifiedOnLoad, true);
    assert.equal(report.checksumOk, true);
    assert.equal(report.offlineNullLoadoutWebOk, true);
    assert.equal(report.offlineNullLoadoutHttpOk, true);
    assert.equal(report.skinsTested.length, 10);
    for (const s of report.skinsTested) {
      assert.equal(s.ok, true, `skin failed: ${s.skinId}`);
      assert.equal(s.mountedCount, 4, `all 4 attachment sockets must mount on ${s.skinId}`);
      assert.equal(s.ragdollBones, 12, `all 12 ragdoll physical bones must build on ${s.skinId}`);
    }
    assert.deepEqual(report.cameraModesTested, ['TPS', 'FPS', 'TopDown']);
    assert.equal(report.fpsHeadHidden, true);
    assert.ok(report.tpsMovedDistance > 0.8);
    assert.ok(report.topDownMovedDistance > 0.4);
    assert.ok(report.jumpHeightDelta > 0.35);
    assert.equal(report.emoteStarted, true);
    assert.equal(report.emoteStoppedOnMove, true);
    assert.equal(report.ragdollActive, true);
    assert.equal(report.ragdollRecovered, true);
    assert.equal(report.creatorClampOk, true);
    assert.equal(report.creatorHasNoCosmeticSetter, true);
  }
);

test(
  'Forge Layer 3 runtime seal: tampered sealed file causes PlayForgeAvatarCatalog.load_catalog() to fail closed',
  {
    skip: process.platform !== 'win32' || !fs.existsSync(godotConsole) ? 'Windows Godot console unavailable' : false,
    timeout: 60000,
  },
  async () => {
    const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-avatar-tamper-'));
    try {
      fs.writeFileSync(
        path.join(tmpProject, 'project.godot'),
        'config_version=5\n\n[application]\nconfig/name="AvatarTamperProbe"\n'
      );
      injectSealedAvatarIntoProjectDir(forgeRoot, tmpProject, { includeAssets: false });
      // Tamper with avatar_controller.gd after seal_manifest.json was generated
      fs.appendFileSync(
        path.join(tmpProject, 'addons', 'playforge_avatar', 'avatar_controller.gd'),
        '\n# tampered after seal\n'
      );
      const probePath = path.join(tmpProject, 'tamper_probe.gd');
      fs.writeFileSync(
        probePath,
        [
          'extends SceneTree',
          'const AvatarCatalogScript = preload("res://addons/playforge_avatar/avatar_catalog.gd")',
          'func _initialize() -> void:',
          '\tvar c := AvatarCatalogScript.new()',
          '\tvar ok := c.load_catalog()',
          '\tvar report := c.get_seal_report()',
          '\tprint("TAMPER_PROBE_JSON=" + JSON.stringify({"loadOk": ok, "verified": c.is_seal_verified(), "mismatches": report.get("mismatches", [])}))',
          '\tquit(0)',
          '',
        ].join('\n')
      );
      const { stdout } = await run(
        godotConsole,
        ['--headless', '--path', tmpProject, '--script', probePath],
        { timeout: 45000 }
      );
      const line = stdout.split(/\r?\n/).find((l) => l.startsWith('TAMPER_PROBE_JSON='));
      assert.ok(line, `Expected TAMPER_PROBE_JSON in Godot output:\n${stdout}`);
      const res = JSON.parse(line.slice('TAMPER_PROBE_JSON='.length));
      assert.equal(res.loadOk, false, 'Tampered addon must fail load_catalog()');
      assert.equal(res.verified, false, 'is_seal_verified() must be false after tampering');
      assert.ok(
        res.mismatches.includes('avatar_controller.gd'),
        `Expected avatar_controller.gd in mismatches, got ${JSON.stringify(res.mismatches)}`
      );
    } finally {
      fs.rmSync(tmpProject, { recursive: true, force: true });
    }
  }
);
