import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { importRbxlxFile } from '../src/rbxlx-importer.mjs';
import { exportRobloxPlaceToGodot } from '../src/godot-exporter.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const CONVERTER_ROOT = path.resolve(__dir, '..');
const REPO_ROOT = path.resolve(CONVERTER_ROOT, '..', '..');
const BASEPLATE_RBXLX = path.join(CONVERTER_ROOT, 'fixtures', 'baseplate-413', 'xml.rbxlx');
const CHAOS_RBXLX = path.join(CONVERTER_ROOT, 'fixtures', 'chaos-obby', 'ChaosObby.rbxlx');
const VERIFY_GD = path.join(REPO_ROOT, 'forge', 'Tests', 'playforge_roblox_compat', 'verify_chaos_obby.gd');
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
