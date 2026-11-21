import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { importRbxlxFile } from '../src/rbxlx-importer.mjs';
import { importRojoProject } from '../src/rojo-importer.mjs';
import { exportRobloxPlaceToGodot } from '../src/godot-exporter.mjs';
import { exportRojoProjectToGodot } from '../src/rojo-exporter.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const CONVERTER_ROOT = path.resolve(__dir, '..');
const REPO_ROOT = path.resolve(CONVERTER_ROOT, '..', '..');
const BASEPLATE_RBXLX = path.join(CONVERTER_ROOT, 'fixtures', 'baseplate-413', 'xml.rbxlx');
const CHAOS_RBXLX = path.join(CONVERTER_ROOT, 'fixtures', 'chaos-obby', 'ChaosObby.rbxlx');
const VERIFY_GD = path.join(REPO_ROOT, 'forge', 'Tests', 'playforge_roblox_compat', 'verify_chaos_obby.gd');
const VERIFY_MULTI_GD = path.join(REPO_ROOT, 'forge', 'Tests', 'playforge_roblox_compat', 'verify_multi_games.gd');
const GODOT_CANDIDATES = [
  process.env.GODOT_BIN,
  path.join(REPO_ROOT, 'artifacts', 'local-runtime', 'godot', 'Godot_v4.7.2-stable_win64_console.exe'),
  path.resolve(REPO_ROOT, '..', '..', 'GoDotProjects', 'Godot_v4.7.2-stable_win64_console.exe')
].filter(Boolean);
const GODOT_BIN = GODOT_CANDIDATES.find((p) => fs.existsSync(p)) || null;

function loadLabV01() {
  class MiniDOMParser {
    parseFromString(src) {
      const items = [];
      const itemRe = /<Item\s+class="([^"]+)"[^>]*>([\s\S]*?)(?=<Item\s+class="|<\/roblox>)/g;
      let m;
      while ((m = itemRe.exec(src))) {
        const cls = m[1];
        const nameMatch = m[2].match(/<string\s+name="Name">([^<]*)<\/string>/);
        const nameText = nameMatch ? nameMatch[1] : null;
        items.push({
          getAttribute: (a) => (a === 'class' ? cls : null),
          getElementsByTagName: (tag) =>
            tag === 'Properties'
              ? [{ querySelector: (sel) => (sel === 'string[name="Name"]' && nameText ? { textContent: nameText } : null) }]
              : []
        });
      }
      const rootMatch = src.match(/<(\w+)[\s>]/);
      return {
        documentElement: { tagName: rootMatch ? rootMatch[1] : '' },
        querySelector: () => null,
        getElementsByTagName: (tag) => (tag === 'Item' ? items : [])
      };
    }
  }
  const elements = new Map();
  const getEl = (id) => {
    if (!elements.has(id)) elements.set(id, { id, value: '', textContent: '', files: [], onclick: null, onchange: null });
    return elements.get(id);
  };
  getEl('mode').value = 'luau';
  getEl('sample').value = 'move';
  const ctx = {
    document: { getElementById: getEl },
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    Blob: class {},
    DOMParser: MiniDOMParser,
    setTimeout: () => 0,
    Set,
    JSON
  };
  vm.runInNewContext(fs.readFileSync(path.join(CONVERTER_ROOT, 'lab', 'converter.js'), 'utf8'), ctx);
  return ctx;
}

test('RBXLX Importer parses official Roblox baseplate-413 XML v4 faithfully', () => {
  const ir = importRbxlxFile(BASEPLATE_RBXLX);
  assert.equal(ir.robloxXmlVersion, '4');
  assert.equal(ir.stats.totalInstances, 41);
  assert.equal(ir.stats.partCount, 1);
  const ws = ir.children.find((c) => c.className === 'Workspace');
  assert.ok(ws, 'Workspace service missing');
  const baseplate = ws.children.find((c) => c.name === 'Baseplate');
  assert.ok(baseplate, 'Baseplate Part missing');
  assert.deepEqual(baseplate.properties.size, { x: 512, y: 20, z: 512 });
  assert.equal(baseplate.properties.Anchored, true);
});

test('Before (Lab v0.1) vs After (PoC Pipeline) measurable improvement on ChaosObby.rbxlx', () => {
  const lab = loadLabV01();
  const chaosXml = fs.readFileSync(CHAOS_RBXLX, 'utf8');
  const beforeScene = lab.convertXml(chaosXml);
  assert.equal(/^\[node name="[^"]+" type="[^"]+"\]$/m.test(beforeScene.code), false, 'Lab v0.1 baseline lacks a root node');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roblox-poc-after-'));
  try {
    const report = exportRobloxPlaceToGodot(CHAOS_RBXLX, tmpDir);
    assert.equal(report.ir_stats.totalInstances, 51);
    assert.equal(report.scene_stats.meshes_generated, 18);
    assert.equal(report.scene_stats.collision_shapes_generated, 18);
    assert.equal(report.scene_stats.touch_areas_generated, 18);
    assert.equal(report.scene_stats.scripts_ported, 7);
    assert.equal(report.kpis.total_todo_fallback_lines, 0);
    assert.equal(report.kpis.unreported_unsupported_count, 0);
    assert.ok(report.diagnostics.some((d) => d.api === 'DataStoreService' && d.grade === 'X'));
    assert.ok(report.diagnostics.some((d) => d.api === 'LuauTable.FunctionKey' && d.grade === 'V'));
    assert.ok(fs.existsSync(path.join(tmpDir, 'project.godot')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'main.tscn')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Godot 4.7.2 headless verification: 100% script compile & 9/9 gameplay behavior assertions pass', (t) => {
  if (!GODOT_BIN) {
    t.skip('Godot 4.7.2 console binary not found in environment');
    return;
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roblox-poc-godot-'));
  try {
    exportRobloxPlaceToGodot(CHAOS_RBXLX, tmpDir);
    fs.copyFileSync(VERIFY_GD, path.join(tmpDir, 'verify_chaos_obby.gd'));
    fs.writeFileSync(
      path.join(tmpDir, 'verify_harness.tscn'),
      `[gd_scene load_steps=3 format=3]
[ext_resource type="PackedScene" path="res://main.tscn" id="1"]
[ext_resource type="Script" path="res://verify_chaos_obby.gd" id="2"]
[node name="Harness" type="Node"]
[node name="Main" parent="." instance=ExtResource("1")]
[node name="Verifier" type="Node" parent="."]
script = ExtResource("2")
`,
      'utf8'
    );

    let stdout = '';
    try {
      stdout = execFileSync(GODOT_BIN, ['--headless', '--path', tmpDir, 'res://verify_harness.tscn'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 25000
      });
    } catch (e) {
      stdout = (e.stdout || '') + '\n' + (e.stderr || '');
    }

    const match = stdout.match(/BEHAVIOR_SUMMARY_JSON=(\{.*\})/);
    assert.ok(match, `Missing BEHAVIOR_SUMMARY_JSON in Godot output:\n${stdout.slice(0, 1500)}`);
    const summary = JSON.parse(match[1]);
    assert.equal(summary.passed, 9, `Expected 9/9 assertions passing: ${JSON.stringify(summary, null, 2)}`);
    assert.equal(summary.total, 9);
    assert.equal(summary.pass_rate, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Rojo Importer parses War Tycoon, Power Punch Simulator, and Lantai Runtuh into Typed IR', () => {
  const specs = [
    { dir: 'war-tycoon', minScripts: 11 },
    { dir: 'power-punch-sim', minScripts: 16 },
    { dir: 'lantai-runtuh', minScripts: 25 }
  ];
  for (const s of specs) {
    const ir = importRojoProject(path.join(CONVERTER_ROOT, 'fixtures', s.dir, 'default.project.json'));
    assert.equal(ir.sourceFormat, 'rojo');
    assert.ok(ir.stats.scriptCount >= s.minScripts, `${s.dir} expected >= ${s.minScripts} scripts, got ${ir.stats.scriptCount}`);
  }
});

test('Godot 4.7.2 headless verification for 3 Rojo games: War Tycoon, Power Punch Simulator, Lantai Runtuh (15/15)', (t) => {
  if (!GODOT_BIN) {
    t.skip('Godot 4.7.2 console binary not found in environment');
    return;
  }
  const cases = [
    { id: 'war_tycoon', dir: 'war-tycoon', expectedX: 0 },
    { id: 'power_punch_sim', dir: 'power-punch-sim', expectedX: 4 },
    { id: 'lantai_runtuh', dir: 'lantai-runtuh', expectedX: 1 }
  ];

  for (const c of cases) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `roblox-poc-${c.id}-`));
    try {
      const report = exportRojoProjectToGodot(path.join(CONVERTER_ROOT, 'fixtures', c.dir, 'default.project.json'), tmpDir);
      assert.equal(report.kpis.unreported_unsupported_count, 0);
      assert.ok(report.kpis.x_grade_diagnostics >= c.expectedX, `${c.id} expected X-grade diagnostics >= ${c.expectedX}`);

      fs.copyFileSync(VERIFY_MULTI_GD, path.join(tmpDir, 'verify_multi_games.gd'));
      fs.writeFileSync(
        path.join(tmpDir, 'verify_harness.tscn'),
        `[gd_scene load_steps=3 format=3]
[ext_resource type="PackedScene" path="res://main.tscn" id="1"]
[ext_resource type="Script" path="res://verify_multi_games.gd" id="2"]
[node name="Harness" type="Node"]
[node name="Main" parent="." instance=ExtResource("1")]
[node name="Verifier" type="Node" parent="."]
script = ExtResource("2")
game_id = "${c.id}"
`,
        'utf8'
      );

      let stdout = '';
      try {
        stdout = execFileSync(GODOT_BIN, ['--headless', '--path', tmpDir, 'res://verify_harness.tscn'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 25000
        });
      } catch (e) {
        stdout = (e.stdout || '') + '\n' + (e.stderr || '');
      }

      const match = stdout.match(/BEHAVIOR_SUMMARY_JSON=(\{.*\})/);
      assert.ok(match, `[${c.id}] Missing BEHAVIOR_SUMMARY_JSON:\n${stdout.slice(0, 1500)}`);
      const summary = JSON.parse(match[1]);
      assert.equal(summary.passed, 5, `[${c.id}] Expected 5/5 assertions: ${JSON.stringify(summary, null, 2)}`);
      assert.equal(summary.total, 5);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
});

test('PlayForge Godot Templates include all 4 Roblox-ported games and load cleanly in Godot 4.7.2', (t) => {
  const require = createRequire(import.meta.url);
  const { loadGameTemplates } = require(path.join(REPO_ROOT, 'forge', 'Tools', 'template-catalog.cjs'));
  const loaded = loadGameTemplates(path.join(REPO_ROOT, 'forge'));
  const expectedIds = ['roblox-chaos-obby', 'roblox-war-tycoon', 'roblox-power-punch-sim', 'roblox-lantai-runtuh'];

  for (const id of expectedIds) {
    assert.ok(loaded[id], `Missing Godot template: ${id}`);
    assert.equal(loaded[id].dimension, '3d');
    assert.ok(loaded[id].files['project.godot'], `${id} missing project.godot`);
    assert.ok(loaded[id].files['scenes/main.tscn'], `${id} missing scenes/main.tscn`);
    assert.match(loaded[id].files['project.godot'], /run\/main_scene="res:\/\/scenes\/main\.tscn"/);
    assert.match(loaded[id].files['project.godot'], /renderer\/rendering_method="gl_compatibility"/);
  }

  if (!GODOT_BIN) {
    t.skip('Godot 4.7.2 console binary not found in environment');
    return;
  }

  for (const id of expectedIds) {
    const tplDir = path.join(REPO_ROOT, 'forge', 'Templates', id);
    const probeTmp = fs.mkdtempSync(path.join(os.tmpdir(), `tpl-godot-${id}-`));
    try {
      fs.cpSync(tplDir, probeTmp, { recursive: true });
      fs.writeFileSync(
        path.join(probeTmp, 'probe_tpl.gd'),
        `extends SceneTree
func _initialize():
\tvar scn = load("res://scenes/main.tscn")
\tvar inst = scn.instantiate() if scn != null else null
\tprint("TEMPLATE_PROBE_OK=", inst != null)
\tif inst != null:
\t\tinst.free()
\tquit(0 if inst != null else 1)
`,
        'utf8'
      );
      let out = '';
      try {
        out = execFileSync(GODOT_BIN, ['--headless', '--path', probeTmp, '--script', 'res://probe_tpl.gd'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 20000
        });
      } catch (e) {
        out = (e.stdout || '') + '\n' + (e.stderr || '');
      }
      assert.match(out, /TEMPLATE_PROBE_OK=true/, `[${id}] scenes/main.tscn failed to instantiate in Godot 4.7.2:\n${out.slice(0, 1200)}`);
    } finally {
      fs.rmSync(probeTmp, { recursive: true, force: true });
    }
  }
});
