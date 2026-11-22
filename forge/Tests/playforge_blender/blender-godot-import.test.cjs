'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createBlenderCliAdapter } = require('../../Tools/blender-pipeline/blender-cli-adapter.cjs');
const { BlenderJobManager } = require('../../Tools/blender-pipeline/job-manager.cjs');

function findGodotConsoleBinary() {
  const candidates = [
    process.env.PLAYFORGE_GODOT_BIN,
    process.env.GODOT_BIN,
    path.resolve(__dirname, '../../../../GoDotProjects/Godot_v4.7.2-stable_win64_console.exe'),
    path.resolve(__dirname, '../../../Godot_v4.7.2-stable_win64_console.exe'),
    'D:\\Github\\GoDotProjects\\Godot_v4.7.2-stable_win64_console.exe',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

test('real Headless Blender -> real Godot 4.7 Headless GLB import, scene placement, and .tscn persistence', async t => {
  const blenderProbe = await createBlenderCliAdapter().probe({ force: true });
  if (!blenderProbe.available) {
    t.skip(`Local Blender unavailable: ${blenderProbe.error}`);
    return;
  }
  const godotBin = findGodotConsoleBinary();
  if (!godotBin) {
    t.skip('Local Godot 4.7 console binary unavailable');
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-blender-godot-'));
  try {
    // 1. Generate a real 3D GLB with Headless Blender
    const mgr = new BlenderJobManager(tmpDir, { storageDir: path.join(tmpDir, 'blender') });
    const { donePromise } = mgr.submitJob({
      prompt: '빛나는 파란 크리스탈 검 x=1.5, z=-2',
      name: 'CrystalBlade',
    });
    const job = await donePromise;
    assert.equal(job.status, 'succeeded', `Blender generation failed: ${job.error}`);

    const glbPath = mgr.getAssetGlbPath(job.asset.assetId);
    assert.ok(glbPath && fs.existsSync(glbPath));

    // 2. Build a minimal Godot 4.7 project with playforge_blender/glb_importer.gd
    const projDir = path.join(tmpDir, 'godot_proj');
    fs.mkdirSync(path.join(projDir, 'addons', 'playforge_blender'), { recursive: true });
    fs.mkdirSync(path.join(projDir, 'scenes'), { recursive: true });

    fs.copyFileSync(
      path.resolve(__dirname, '../../Godot/addons/playforge_blender/glb_importer.gd'),
      path.join(projDir, 'addons', 'playforge_blender', 'glb_importer.gd')
    );
    fs.copyFileSync(glbPath, path.join(projDir, 'incoming.glb'));
    fs.writeFileSync(path.join(projDir, 'incoming_manifest.json'), JSON.stringify(job.asset, null, 2), 'utf8');

    fs.writeFileSync(
      path.join(projDir, 'project.godot'),
      `; Engine configuration file.\nconfig_version=5\n\n[application]\nconfig/name="BlenderImportVerify"\nconfig/features=PackedStringArray("4.7", "GL Compatibility")\n`,
      'utf8'
    );

    const verifyScript = `extends SceneTree

const GlbImporter = preload("res://addons/playforge_blender/glb_importer.gd")

func _init() -> void:
\tvar glb_bytes := FileAccess.get_file_as_bytes("res://incoming.glb")
\tvar manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://incoming_manifest.json"))
\tvar root := Node3D.new()
\troot.name = "Main"

\tvar res := GlbImporter.import_glb_bytes_into_scene(glb_bytes, manifest, root, null)
\tif not bool(res.get("ok", false)) or not bool(res.get("placed", false)):
\t\tprinterr("IMPORT_FAILED:" + JSON.stringify(res))
\t\tquit(1)
\t\treturn

\tvar placed: Node3D = res.get("node")
\tif placed == null:
\t\tprinterr("MISSING_PLACED_NODE")
\t\tquit(1)
\t\treturn

\t# Verify transform & provenance metadata
\tif placed.position.distance_to(Vector3(1.5, 0.0, -2.0)) > 0.001:
\t\tprinterr("BAD_POSITION:" + str(placed.position))
\t\tquit(1)
\t\treturn
\tif str(placed.get_meta("_playforge_blender_asset_id", "")) != str(manifest.get("assetId", "")):
\t\tprinterr("BAD_META_ASSET_ID")
\t\tquit(1)
\t\treturn

\t# Verify every child has owner == root for .tscn persistence
\tvar stack: Array[Node] = [placed]
\tvar mesh_count := 0
\twhile not stack.is_empty():
\t\tvar cur: Node = stack.pop_back()
\t\tif cur.owner != root:
\t\t\tprinterr("OWNER_MISMATCH:" + str(cur.name))
\t\t\tquit(1)
\t\t\treturn
\t\tif cur is MeshInstance3D:
\t\t\tmesh_count += 1
\t\tfor c in cur.get_children():
\t\t\tstack.append(c)

\tif mesh_count < 3:
\t\tprinterr("TOO_FEW_MESHES:" + str(mesh_count))
\t\tquit(1)
\t\treturn

\t# Save scene as .tscn and reload to verify persistence
\tvar packed := PackedScene.new()
\tvar pack_err := packed.pack(root)
\tif pack_err != OK:
\t\tprinterr("PACK_FAILED:" + str(pack_err))
\t\tquit(1)
\t\treturn
\tvar save_err := ResourceSaver.save(packed, "res://scenes/main.tscn")
\tif save_err != OK:
\t\tprinterr("SAVE_FAILED:" + str(save_err))
\t\tquit(1)
\t\treturn

\tvar reloaded := ResourceLoader.load("res://scenes/main.tscn") as PackedScene
\tif reloaded == null:
\t\tprinterr("RELOAD_FAILED")
\t\tquit(1)
\t\treturn
\tvar inst := reloaded.instantiate()
\tvar found := inst.get_node_or_null(NodePath(str(res.get("nodeName", ""))))
\tif found == null:
\t\tprinterr("RELOADED_NODE_MISSING")
\t\tquit(1)
\t\treturn

\tprint("GODOT_BLENDER_VERIFY_OK:" + JSON.stringify({
\t\t"nodeName": str(res.get("nodeName", "")),
\t\t"meshCount": mesh_count,
\t\t"resGlbPath": str(res.get("resGlbPath", "")),
\t\t"resManifestPath": str(res.get("resManifestPath", "")),
\t\t"position": [placed.position.x, placed.position.y, placed.position.z]
\t}))
\tinst.free()
\troot.free()
\tquit(0)
`;
    fs.writeFileSync(path.join(projDir, 'verify_import.gd'), verifyScript, 'utf8');

    // 3. Execute headless Godot 4.7
    const proc = spawnSync(godotBin, ['--headless', '--path', projDir, '--script', 'res://verify_import.gd'], {
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true,
    });
    assert.equal(proc.status, 0, `Godot headless failed (code=${proc.status}):\nSTDOUT:\n${proc.stdout}\nSTDERR:\n${proc.stderr}`);

    const match = proc.stdout.match(/GODOT_BLENDER_VERIFY_OK:(\{.*\})/);
    assert.ok(match, `Missing verification marker in Godot output:\n${proc.stdout}`);
    const verified = JSON.parse(match[1]);
    assert.ok(verified.meshCount >= 4);
    assert.deepEqual(verified.position, [1.5, 0, -2]);
    assert.ok(fs.existsSync(path.join(projDir, 'scenes', 'main.tscn')));
    assert.ok(fs.existsSync(path.join(projDir, verified.resGlbPath.replace('res://', ''))));
    assert.ok(fs.existsSync(path.join(projDir, verified.resManifestPath.replace('res://', ''))));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('real Three.js Headless Worker -> real Godot 4.7 Headless GLB import and .tscn persistence', async t => {
  const godotBin = findGodotConsoleBinary();
  if (!godotBin) {
    t.skip('Local Godot 4.7 console binary unavailable');
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-threejs-godot-'));
  try {
    const mgr = new BlenderJobManager(tmpDir, { storageDir: path.join(tmpDir, 'blender') });
    const { donePromise } = mgr.submitJob({
      prompt: '스타워즈 다스베이더 x=-1.5, z=2',
      engineId: 'threejs-cli',
      aiProvider: 'heuristic',
    });
    const job = await donePromise;
    assert.equal(job.status, 'succeeded', `Three.js generation failed: ${job.error}`);

    const glbPath = mgr.getAssetGlbPath(job.asset.assetId);
    assert.ok(glbPath && fs.existsSync(glbPath));

    const projDir = path.join(tmpDir, 'godot_proj');
    fs.mkdirSync(path.join(projDir, 'addons', 'playforge_blender'), { recursive: true });
    fs.mkdirSync(path.join(projDir, 'scenes'), { recursive: true });

    fs.copyFileSync(
      path.resolve(__dirname, '../../Godot/addons/playforge_blender/glb_importer.gd'),
      path.join(projDir, 'addons', 'playforge_blender', 'glb_importer.gd')
    );
    fs.copyFileSync(glbPath, path.join(projDir, 'incoming.glb'));
    fs.writeFileSync(path.join(projDir, 'incoming_manifest.json'), JSON.stringify(job.asset, null, 2), 'utf8');
    fs.writeFileSync(
      path.join(projDir, 'project.godot'),
      `; Engine configuration file.\nconfig_version=5\n\n[application]\nconfig/name="ThreeJsImportVerify"\nconfig/features=PackedStringArray("4.7", "GL Compatibility")\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(projDir, 'verify_import.gd'),
      `extends SceneTree
const GlbImporter = preload("res://addons/playforge_blender/glb_importer.gd")
func _init() -> void:
\tvar glb_bytes := FileAccess.get_file_as_bytes("res://incoming.glb")
\tvar manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://incoming_manifest.json"))
\tvar root := Node3D.new()
\troot.name = "Main"
\tvar res := GlbImporter.import_glb_bytes_into_scene(glb_bytes, manifest, root, null)
\tif not bool(res.get("ok", false)) or not bool(res.get("placed", false)) or int(res.get("meshCount", 0)) < 25:
\t\tprinterr("THREEJS_IMPORT_FAILED:" + JSON.stringify(res))
\t\tquit(1)
\t\treturn
\tvar packed := PackedScene.new()
\tif packed.pack(root) != OK or ResourceSaver.save(packed, "res://scenes/main.tscn") != OK:
\t\tprinterr("PACK_OR_SAVE_FAILED")
\t\tquit(1)
\t\treturn
\tprint("GODOT_THREEJS_VERIFY_OK:" + str(res.get("meshCount", 0)))
\troot.free()
\tquit(0)
`,
      'utf8'
    );

    const proc = spawnSync(godotBin, ['--headless', '--path', projDir, '--script', 'res://verify_import.gd'], {
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true,
    });
    assert.equal(proc.status, 0, `Godot headless failed:\n${proc.stdout}\n${proc.stderr}`);
    assert.match(proc.stdout, /GODOT_THREEJS_VERIFY_OK:33/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
