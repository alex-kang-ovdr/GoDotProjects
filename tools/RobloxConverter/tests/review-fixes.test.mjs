import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { escapeGodotString, prepareSafeOutputDir } from '../src/export-utils.mjs';
import { exportRobloxPlaceToGodot } from '../src/godot-exporter.mjs';
import { exportRojoProjectToGodot } from '../src/rojo-exporter.mjs';
import { importRojoProject } from '../src/rojo-importer.mjs';
import { registerRobloxPortInForge } from '../src/register-forge-project.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const CONVERTER_ROOT = path.resolve(__dir, '..');
const REPO_ROOT = path.resolve(CONVERTER_ROOT, '..', '..');
const BASEPLATE_RBXLX = path.join(CONVERTER_ROOT, 'fixtures', 'baseplate-413', 'xml.rbxlx');
const WAR_TYCOON_ROJO = path.join(CONVERTER_ROOT, 'fixtures', 'war-tycoon', 'default.project.json');
const GODOT_CANDIDATES = [
  process.env.GODOT_BIN,
  path.join(REPO_ROOT, 'artifacts', 'local-runtime', 'godot', 'Godot_v4.7.2-stable_win64_console.exe'),
  path.resolve(REPO_ROOT, '..', '..', 'GoDotProjects', 'Godot_v4.7.2-stable_win64_console.exe')
].filter(Boolean);
const GODOT_BIN = GODOT_CANDIDATES.find((p) => fs.existsSync(p)) || null;

test('Safe outDir guard blocks dangerous paths and non-empty directories without conversion marker', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roblox-outdir-guard-'));
  try {
    const driveRoot = path.parse(workDir).root;
    // Block drive root, home dir, tmp root, repo root, and input ancestor
    for (const badPath of [
      driveRoot,
      os.homedir(),
      os.tmpdir(),
      REPO_ROOT,
      path.dirname(BASEPLATE_RBXLX),
      CONVERTER_ROOT
    ]) {
      assert.throws(
        () => exportRobloxPlaceToGodot(BASEPLATE_RBXLX, badPath),
        /Refusing to use/i,
        `godot-exporter must block dangerous path: ${badPath}`
      );
    }
    for (const badPath of [
      driveRoot,
      os.homedir(),
      REPO_ROOT,
      path.dirname(WAR_TYCOON_ROJO)
    ]) {
      assert.throws(
        () => exportRojoProjectToGodot(WAR_TYCOON_ROJO, badPath),
        /Refusing to use/i,
        `rojo-exporter must block dangerous path: ${badPath}`
      );
    }

    // Block non-empty dir without conversion_report.json and keep existing files intact
    const nonEmptyDir = path.join(workDir, 'user-files');
    fs.mkdirSync(nonEmptyDir, { recursive: true });
    const sentinelFile = path.join(nonEmptyDir, 'precious.txt');
    fs.writeFileSync(sentinelFile, 'do-not-delete', 'utf8');

    assert.throws(
      () => exportRobloxPlaceToGodot(BASEPLATE_RBXLX, nonEmptyDir),
      /non-empty output directory/i
    );
    assert.throws(
      () => exportRojoProjectToGodot(WAR_TYCOON_ROJO, nonEmptyDir),
      /non-empty output directory/i
    );
    assert.equal(fs.readFileSync(sentinelFile, 'utf8'), 'do-not-delete');

    // Block non-empty dir with fake conversion_report.json (wrong schema)
    const fakeMarkerDir = path.join(workDir, 'fake-marker');
    fs.mkdirSync(fakeMarkerDir, { recursive: true });
    fs.writeFileSync(path.join(fakeMarkerDir, 'conversion_report.json'), JSON.stringify({ schema: 'other.tool.v1' }), 'utf8');
    fs.writeFileSync(path.join(fakeMarkerDir, 'keep.txt'), 'keep', 'utf8');
    assert.throws(
      () => prepareSafeOutputDir(fakeMarkerDir, BASEPLATE_RBXLX, { repoRoot: REPO_ROOT }),
      /conversion_report\.json/i
    );
    assert.equal(fs.readFileSync(path.join(fakeMarkerDir, 'keep.txt'), 'utf8'), 'keep');

    // Block directory containing .git even if it has a conversion_report.json
    const gitDir = path.join(workDir, 'fake-git-repo');
    fs.mkdirSync(path.join(gitDir, '.git'), { recursive: true });
    fs.writeFileSync(
      path.join(gitDir, 'conversion_report.json'),
      JSON.stringify({ schema: 'playforge.roblox.conversion_report.v1' }),
      'utf8'
    );
    assert.throws(
      () => prepareSafeOutputDir(gitDir, BASEPLATE_RBXLX, { repoRoot: REPO_ROOT }),
      /Git repository root/i
    );

    // Allow re-exporting into a directory that has a valid previous conversion_report.json marker
    const exportDir = path.join(workDir, 'valid-export');
    const first = exportRobloxPlaceToGodot(BASEPLATE_RBXLX, exportDir);
    assert.equal(first.schema, 'playforge.roblox.conversion_report.v1');
    const staleFile = path.join(exportDir, 'stale_artifact.txt');
    fs.writeFileSync(staleFile, 'old', 'utf8');
    const second = exportRobloxPlaceToGodot(BASEPLATE_RBXLX, exportDir);
    assert.equal(second.schema, 'playforge.roblox.conversion_report.v1');
    assert.equal(fs.existsSync(staleFile), false, 'previous export artifacts should be cleaned on re-export');
    assert.ok(fs.existsSync(path.join(exportDir, 'project.godot')));
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('registerRobloxPortInForge refuses to overwrite existing project.json unless force=true and writes atomically', () => {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roblox-forge-reg-'));
  const projectId = '0123456789abcdef01234567';
  try {
    const first = registerRobloxPortInForge({
      inputPath: BASEPLATE_RBXLX,
      format: 'rbxlx',
      projectId,
      projectName: 'Initial Port',
      projectsDir
    });
    assert.equal(first.projectId, projectId);

    const projectDir = path.join(projectsDir, projectId);
    const projectJsonPath = path.join(projectDir, 'project.json');
    assert.ok(fs.existsSync(projectJsonPath));
    // Verify no leftover temp files
    assert.deepEqual(fs.readdirSync(projectDir), ['project.json']);

    // Mutate project.json to simulate existing user history/releases
    const existing = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
    existing.releases = [{ id: 'rel_keep_me' }];
    existing.revision = 7;
    fs.writeFileSync(projectJsonPath, JSON.stringify(existing), 'utf8');

    // Without force, must fail and preserve existing project.json
    assert.throws(
      () =>
        registerRobloxPortInForge({
          inputPath: BASEPLATE_RBXLX,
          format: 'rbxlx',
          projectId,
          projectName: 'Accidental Overwrite',
          projectsDir
        }),
      (err) => err.code === 'EEXIST' && /--force/i.test(err.message)
    );
    const preserved = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
    assert.equal(preserved.revision, 7);
    assert.deepEqual(preserved.releases, [{ id: 'rel_keep_me' }]);

    // With force: true, overwrites cleanly via temp file + rename
    registerRobloxPortInForge({
      inputPath: BASEPLATE_RBXLX,
      format: 'rbxlx',
      projectId,
      projectName: 'Forced Overwrite',
      projectsDir,
      force: true
    });
    const overwritten = JSON.parse(fs.readFileSync(projectJsonPath, 'utf8'));
    assert.equal(overwritten.name, 'Forced Overwrite');
    assert.equal(overwritten.revision, 1);
    assert.deepEqual(fs.readdirSync(projectDir), ['project.json']);
  } finally {
    fs.rmSync(projectsDir, { recursive: true, force: true });
  }
});

test('rojo-importer handles non-script or missing $path without crashing and emits diagnostics', () => {
  const projDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roblox-rojo-null-'));
  try {
    fs.mkdirSync(path.join(projDir, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(projDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(projDir, 'assets', 'readme.txt'), 'not a luau script', 'utf8');
    fs.writeFileSync(path.join(projDir, 'assets', 'icon.png'), 'PNG', 'utf8');
    fs.writeFileSync(path.join(projDir, 'src', 'Config.luau'), 'return { Speed = 16 }\n', 'utf8');

    const projectJson = path.join(projDir, 'default.project.json');
    fs.writeFileSync(
      projectJson,
      JSON.stringify({
        name: 'NonScriptPathGame',
        tree: {
          $className: 'DataModel',
          ReplicatedStorage: {
            Shared: { $path: 'src' },
            DocFile: {
              $path: 'assets/readme.txt',
              $properties: { Archivable: false }
            },
            Logo: 'assets/icon.png',
            MissingScript: {
              $path: 'src/does-not-exist.luau',
              $properties: { Disabled: true }
            }
          }
        }
      }),
      'utf8'
    );

    const ir = importRojoProject(projectJson);
    assert.equal(ir.stats.scriptCount, 1);
    assert.ok(ir.diagnostics.some((d) => d.code === 'ROJO_UNSUPPORTED_FILE' && d.name === 'DocFile'));
    assert.ok(ir.diagnostics.some((d) => d.code === 'ROJO_PROPERTIES_DROPPED' && d.name === 'DocFile'));
    assert.ok(ir.diagnostics.some((d) => d.code === 'ROJO_UNSUPPORTED_FILE' && d.name === 'Logo'));
    assert.ok(ir.diagnostics.some((d) => d.code === 'ROJO_MISSING_PATH' && d.name === 'MissingScript'));
    assert.ok(ir.diagnostics.some((d) => d.code === 'ROJO_PROPERTIES_DROPPED' && d.name === 'MissingScript'));
  } finally {
    fs.rmSync(projDir, { recursive: true, force: true });
  }
});

test('rojo-exporter uses generic bootstrap + unsupported diagnostic for unknown projects and unique robloxPath filenames', () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roblox-rojo-unknown-'));
  const projDir = path.join(workDir, 'proj');
  const outDir = path.join(workDir, 'out');
  try {
    fs.mkdirSync(path.join(projDir, 'src', 'shared'), { recursive: true });
    fs.mkdirSync(path.join(projDir, 'src', 'server'), { recursive: true });
    fs.mkdirSync(path.join(projDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(projDir, 'assets', 'notes.txt'), 'plain text', 'utf8');
    fs.writeFileSync(
      path.join(projDir, 'src', 'shared', 'Config.luau'),
      'local Config = {}\nConfig.Mode = "shared"\nreturn Config\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(projDir, 'src', 'server', 'Config.luau'),
      'local Config = {}\nConfig.Mode = "server"\nreturn Config\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(projDir, 'src', 'server', 'Main.server.luau'),
      'print("hello")\n',
      'utf8'
    );

    const projectJson = path.join(projDir, 'default.project.json');
    fs.writeFileSync(
      projectJson,
      JSON.stringify({
        name: 'CustomMysteryGame',
        tree: {
          $className: 'DataModel',
          ReplicatedStorage: {
            Shared: { $path: 'src/shared' },
            Notes: { $path: 'assets/notes.txt' }
          },
          ServerScriptService: {
            Server: { $path: 'src/server' }
          }
        }
      }),
      'utf8'
    );

    const report = exportRojoProjectToGodot(projectJson, outDir);
    assert.equal(report.supported_project_profile, false);
    assert.equal(report.controller_profile, 'generic_bootstrap');
    assert.ok(
      report.diagnostics.some((d) => d.api === 'RojoProject.ControllerProfile' && d.severity === 'warning'),
      'must emit explicit unsupported project profile diagnostic'
    );
    assert.ok(
      report.diagnostics.some((d) => d.api === 'ROJO_UNSUPPORTED_FILE'),
      'must surface rojo-importer diagnostics in conversion report'
    );

    const controllerSrc = fs.readFileSync(path.join(outDir, 'game_controller.gd'), 'utf8');
    assert.match(controllerSrc, /CONTROLLER_PROFILE := "generic_bootstrap"/);
    assert.doesNotMatch(controllerSrc, /Lantai Runtuh|generate_wave|drop_unsafe_tiles/);

    const mainScriptReport = report.scripts.find((s) => s.robloxPath.endsWith('/Main'));
    assert.equal(mainScriptReport.mode, 'unsupported_project_script');

    // Both Config.luau files must exist separately with distinct robloxPath-based filenames
    const liveConfigs = report.scripts.filter((s) => s.mode === 'transpiled_live_module');
    assert.equal(liveConfigs.length, 2);
    assert.notEqual(liveConfigs[0].godotScriptFile, liveConfigs[1].godotScriptFile);
    assert.notEqual(liveConfigs[0].godotNodeName, liveConfigs[1].godotNodeName);

    const sharedGd = fs.readFileSync(path.join(outDir, liveConfigs[0].godotScriptFile), 'utf8');
    const serverGd = fs.readFileSync(path.join(outDir, liveConfigs[1].godotScriptFile), 'utf8');
    assert.ok(sharedGd.includes('"shared"') || serverGd.includes('"shared"'));
    assert.ok(sharedGd.includes('"server"') || serverGd.includes('"server"'));

    if (GODOT_BIN) {
      let stdout = '';
      try {
        stdout = execFileSync(GODOT_BIN, ['--headless', '--path', outDir, '--quit', 'res://main.tscn'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 20000
        });
      } catch (e) {
        stdout = (e.stdout || '') + '\n' + (e.stderr || '');
        assert.fail(`Generic bootstrap scene failed to load in Godot headless:\n${stdout}`);
      }
      assert.doesNotMatch(stdout, /SCRIPT ERROR|Parse Error/i);
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

test('Godot string escaping prevents config/tscn/gdscript injection in both exporters', () => {
  assert.equal(escapeGodotString('a\\b"c\nd\re\tf\0'), 'a\\\\b\\"c\\nd\\re\\tf');

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roblox-escape-'));
  const rbxlxOut = path.join(workDir, 'rbxlx-out');
  const rojoProj = path.join(workDir, 'rojo-proj');
  const rojoOut = path.join(workDir, 'rojo-out');
  try {
    const trickyName = 'Evil "Game" \\ Name\n[injected]\tTab';

    // 1. godot-exporter with tricky projectName and tricky TextLabel/Part metadata
    const trickyRbxlx = path.join(workDir, 'tricky.rbxlx');
    fs.writeFileSync(
      trickyRbxlx,
      `<roblox version="4">
  <Item class="Workspace" referent="RBX1">
    <Properties><string name="Name">Workspace</string></Properties>
    <Item class="Part" referent="RBX2">
      <Properties>
        <string name="Name">Part "A" \\ Line1
Line2</string>
        <Vector3 name="size"><X>4</X><Y>1</Y><Z>4</Z></Vector3>
        <CoordinateFrame name="CFrame">
          <X>0</X><Y>0</Y><Z>0</Z>
          <R00>1</R00><R01>0</R01><R02>0</R02>
          <R10>0</R10><R11>1</R11><R12>0</R12>
          <R20>0</R20><R21>0</R21><R22>1</R22>
        </CoordinateFrame>
      </Properties>
    </Item>
  </Item>
  <Item class="StarterGui" referent="RBX3">
    <Properties><string name="Name">StarterGui</string></Properties>
    <Item class="ScreenGui" referent="RBX4">
      <Properties><string name="Name">HUD</string></Properties>
      <Item class="TextLabel" referent="RBX5">
        <Properties>
          <string name="Name">Banner</string>
          <string name="Text"><![CDATA[Hello "World"
Path: C:\\temp\\x]]></string>
        </Properties>
      </Item>
    </Item>
  </Item>
</roblox>`,
      'utf8'
    );

    exportRobloxPlaceToGodot(trickyRbxlx, rbxlxOut, { projectName: trickyName });
    const rbxlxProjectGodot = fs.readFileSync(path.join(rbxlxOut, 'project.godot'), 'utf8');
    assert.ok(
      rbxlxProjectGodot.includes('config/name="Evil \\"Game\\" \\\\ Name\\n[injected]\\tTab (Godot Port)"'),
      `project.godot name was not escaped properly:\n${rbxlxProjectGodot}`
    );
    assert.equal(/^\[injected\]$/m.test(rbxlxProjectGodot), false, 'newline must not inject INI section');

    const rbxlxTscn = fs.readFileSync(path.join(rbxlxOut, 'main.tscn'), 'utf8');
    assert.ok(rbxlxTscn.includes('text = "Hello \\"World\\"\\nPath: C:\\\\temp\\\\x"'));
    assert.ok(rbxlxTscn.includes('metadata/roblox_name = "Part \\"A\\" \\\\ Line1\\nLine2"'));

    // 2. rojo-exporter with tricky projectName
    fs.mkdirSync(path.join(rojoProj, 'src'), { recursive: true });
    fs.writeFileSync(path.join(rojoProj, 'src', 'Config.luau'), 'return { X = 1 }\n', 'utf8');
    const rojoJson = path.join(rojoProj, 'default.project.json');
    fs.writeFileSync(
      rojoJson,
      JSON.stringify({
        name: trickyName,
        tree: {
          $className: 'DataModel',
          ReplicatedStorage: { Shared: { $path: 'src' } }
        }
      }),
      'utf8'
    );

    exportRojoProjectToGodot(rojoJson, rojoOut);
    const rojoProjectGodot = fs.readFileSync(path.join(rojoOut, 'project.godot'), 'utf8');
    assert.ok(
      rojoProjectGodot.includes('config/name="Evil \\"Game\\" \\\\ Name\\n[injected]\\tTab"'),
      `rojo project.godot name was not escaped properly:\n${rojoProjectGodot}`
    );
    assert.equal(/^\[injected\]$/m.test(rojoProjectGodot), false);

    const rojoCtrl = fs.readFileSync(path.join(rojoOut, 'game_controller.gd'), 'utf8');
    assert.ok(rojoCtrl.includes('const PROJECT_TITLE := "Evil \\"Game\\" \\\\ Name\\n[injected]\\tTab"'));

    if (GODOT_BIN) {
      for (const dir of [rbxlxOut, rojoOut]) {
        try {
          execFileSync(GODOT_BIN, ['--headless', '--path', dir, '--quit', 'res://main.tscn'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 20000
          });
        } catch (e) {
          assert.fail(`Godot failed to load escaped project at ${dir}:\n${e.stdout || ''}\n${e.stderr || ''}`);
        }
      }
    }
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
