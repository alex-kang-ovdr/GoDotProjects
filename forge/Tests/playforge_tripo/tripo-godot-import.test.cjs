'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { TripoJobManager } = require('../../Tools/tripo-pipeline/tripo-job-manager.cjs');

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

test('Tripo PBR & Auto-Rigged/Animated GLB -> real Godot 4.7.2 Headless import, Skeleton3D/AnimationPlayer check, and .tscn persistence', async t => {
  const godotBin = findGodotConsoleBinary();
  if (!godotBin) {
    t.skip('Local Godot 4.7 console binary unavailable');
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-tripo-godot-'));
  try {
    const mgr = new TripoJobManager(tmpDir, {
      storageDir: path.join(tmpDir, 'tripo'),
      mode: 'simulation',
      pollIntervalSimMs: 15,
      simPollsToFinish: 2,
    });

    // 1. Generate base Text-to-3D character -> Auto-Rig -> Retarget Walk animation
    const { donePromise: baseDone } = mgr.submitGenerationJob({
      taskType: 'text_to_model',
      prompt: 'Stylized fantasy knight in blue and gold armor',
      name: 'PaladinKnight',
    });
    const baseJob = await baseDone;
    assert.equal(baseJob.status, 'succeeded');

    const { donePromise: rigDone } = mgr.submitPostProcessJob(baseJob.asset.assetId, 'rig', { rigType: 'biped' });
    const rigJob = await rigDone;
    assert.equal(rigJob.status, 'succeeded');

    const { donePromise: animDone } = mgr.submitPostProcessJob(rigJob.asset.assetId, 'retarget', { animation: 'preset:walk' });
    const animJob = await animDone;
    assert.equal(animJob.status, 'succeeded');

    const glbPath = mgr.getAssetFilePath(animJob.asset.assetId, 'model.glb');
    assert.ok(glbPath && fs.existsSync(glbPath));

    const manifestWithPlacement = {
      ...animJob.asset,
      placement: {
        position: [2.5, 0.0, -1.5],
        rotationDeg: [0.0, 45.0, 0.0],
        scale: [1.0, 1.0, 1.0],
      },
    };

    // 2. Build a minimal Godot 4.7 project with playforge_tripo/glb_importer.gd
    const projDir = path.join(tmpDir, 'godot_proj');
    fs.mkdirSync(path.join(projDir, 'addons', 'playforge_tripo'), { recursive: true });
    fs.mkdirSync(path.join(projDir, 'scenes'), { recursive: true });

    fs.copyFileSync(
      path.resolve(__dirname, '../../Godot/addons/playforge_tripo/glb_importer.gd'),
      path.join(projDir, 'addons', 'playforge_tripo', 'glb_importer.gd')
    );
    fs.copyFileSync(glbPath, path.join(projDir, 'incoming_tripo.glb'));
    fs.writeFileSync(path.join(projDir, 'incoming_manifest.json'), JSON.stringify(manifestWithPlacement, null, 2), 'utf8');

    fs.writeFileSync(
      path.join(projDir, 'project.godot'),
      `; Engine configuration file.\nconfig_version=5\n\n[application]\nconfig/name="TripoImportVerify"\nconfig/features=PackedStringArray("4.7", "GL Compatibility")\n`,
      'utf8'
    );

    const verifyScript = `extends SceneTree

const GlbImporter = preload("res://addons/playforge_tripo/glb_importer.gd")

func _init() -> void:
\tvar glb_bytes := FileAccess.get_file_as_bytes("res://incoming_tripo.glb")
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

\tif placed.position.distance_to(Vector3(2.5, 0.0, -1.5)) > 0.001:
\t\tprinterr("BAD_POSITION:" + str(placed.position))
\t\tquit(1)
\t\treturn

\tif str(placed.get_meta("_playforge_tripo_asset_id", "")) != str(manifest.get("assetId", "")):
\t\tprinterr("BAD_META_ASSET_ID")
\t\tquit(1)
\t\treturn

\tif int(res.get("meshCount", 0)) < 1:
\t\tprinterr("NO_MESHES:" + JSON.stringify(res))
\t\tquit(1)
\t\treturn

\tif int(res.get("skeletonCount", 0)) < 1 or int(res.get("boneCount", 0)) < 5:
\t\tprinterr("SKELETON_MISSING:" + JSON.stringify(res))
\t\tquit(1)
\t\treturn

\tvar anims: Array = res.get("animationNames", [])
\tif not anims.has("tripo_walk"):
\t\tprinterr("ANIMATION_MISSING:" + JSON.stringify(res))
\t\tquit(1)
\t\treturn

\tvar stack: Array[Node] = [placed]
\twhile not stack.is_empty():
\t\tvar cur: Node = stack.pop_back()
\t\tif cur.owner != root:
\t\t\tprinterr("OWNER_MISMATCH:" + str(cur.name))
\t\t\tquit(1)
\t\t\treturn
\t\tfor c in cur.get_children():
\t\t\tstack.append(c)

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

\tprint("GODOT_TRIPO_VERIFY_OK:" + JSON.stringify({
\t\t"nodeName": str(res.get("nodeName", "")),
\t\t"meshCount": int(res.get("meshCount", 0)),
\t\t"skeletonCount": int(res.get("skeletonCount", 0)),
\t\t"boneCount": int(res.get("boneCount", 0)),
\t\t"animationNames": anims,
\t\t"resGlbPath": str(res.get("resGlbPath", "")),
\t\t"resManifestPath": str(res.get("resManifestPath", ""))
\t}))
\tinst.free()
\troot.free()
\tquit(0)
`;
    fs.writeFileSync(path.join(projDir, 'verify_tripo_import.gd'), verifyScript, 'utf8');

    const proc = spawnSync(
      godotBin,
      ['--headless', '--path', projDir, '--script', 'res://verify_tripo_import.gd'],
      { encoding: 'utf8', timeout: 60000, windowsHide: true }
    );

    const combined = `${proc.stdout || ''}\n${proc.stderr || ''}`;
    assert.equal(proc.status, 0, `Godot headless import failed (code=${proc.status}):\n${combined}`);
    const okLine = (proc.stdout || '').split(/\r?\n/).find(l => l.startsWith('GODOT_TRIPO_VERIFY_OK:'));
    assert.ok(okLine, `Missing GODOT_TRIPO_VERIFY_OK marker in output:\n${combined}`);

    const summary = JSON.parse(okLine.slice('GODOT_TRIPO_VERIFY_OK:'.length));
    assert.ok(summary.meshCount >= 1);
    assert.equal(summary.skeletonCount, 1);
    assert.equal(summary.boneCount, 5);
    assert.ok(summary.animationNames.includes('tripo_walk'));

    mgr.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
