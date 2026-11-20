import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importRbxlxFile } from './rbxlx-importer.mjs';
import { transpileLuauToGdScript } from './luau-transpiler.mjs';
import { loadCapabilityRegistry } from './luau-analyzer.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dir, '..', '..', '..');
const ADDON_SRC_DIR = path.join(REPO_ROOT, 'forge', 'Godot', 'addons', 'playforge_roblox_compat');
const STUD_TO_METER = 0.28;

function sanitizeNodeName(raw, usedSet) {
  let base = String(raw || 'Node').replace(/[^A-Za-z0-9_]/g, '_');
  if (!base || /^\d/.test(base)) base = 'N_' + base;
  let name = base;
  let n = 1;
  while (usedSet.has(name)) {
    name = `${base}_${n++}`;
  }
  usedSet.add(name);
  return name;
}

function fmt(n) {
  const v = Number.isFinite(n) ? n : 0;
  return Number(v.toFixed(5));
}

function robloxCFrameToGodotTransform3D(cf) {
  if (!cf) return 'Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0)';
  // Similarity transform R' = M * R * M^-1 with M = diag(1, 1, -1)
  const r00 = cf.r00, r01 = cf.r01, r02 = -cf.r02;
  const r10 = cf.r10, r11 = cf.r11, r12 = -cf.r12;
  const r20 = -cf.r20, r21 = -cf.r21, r22 = cf.r22;
  const ox = cf.x * STUD_TO_METER;
  const oy = cf.y * STUD_TO_METER;
  const oz = -cf.z * STUD_TO_METER;
  // Godot Transform3D serializes Basis columns (X, Y, Z) then origin:
  // (r00, r10, r20, r01, r11, r21, r02, r12, r22, ox, oy, oz)
  return `Transform3D(${fmt(r00)}, ${fmt(r10)}, ${fmt(r20)}, ${fmt(r01)}, ${fmt(r11)}, ${fmt(r21)}, ${fmt(r02)}, ${fmt(r12)}, ${fmt(r22)}, ${fmt(ox)}, ${fmt(oy)}, ${fmt(oz)})`;
}

function copyDirRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function buildPlaceBootstrapScript(scriptNodePaths, cameraTarget) {
  const pathsLiteral = scriptNodePaths.map((p) => `\t"${p}"`).join(',\n');
  return `extends Node3D

const CONVERTED_SCRIPT_PATHS: Array[String] = [
${pathsLiteral}
]

const CAMERA_TARGET := Vector3(${fmt(cameraTarget.x)}, ${fmt(cameraTarget.y)}, ${fmt(cameraTarget.z)})
const HUMANOID_PROXY_SCRIPT := preload("res://humanoid_proxy.gd")

var player_character: CharacterBody3D = null
var converted_scripts: Array[Node] = []

func _ready() -> void:
\tvar cam := get_node_or_null("MainCamera") as Camera3D
\tif cam != null:
\t\tcam.look_at(CAMERA_TARGET, Vector3.UP)
\tRobloxCompat.bind_place_root(self)
\t_spawn_playable_character()
\tfor rel_path in CONVERTED_SCRIPT_PATHS:
\t\tvar node := get_node_or_null(rel_path)
\t\tif node != null and node.has_method("run_script"):
\t\t\tconverted_scripts.append(node)
\t\t\tnode.call("run_script", node.get_parent())
\tRobloxCompat.notify_initial_players()

func _spawn_playable_character() -> void:
\tvar ws := RobloxCompat.get_workspace()
\tif ws == null:
\t\treturn
\tplayer_character = CharacterBody3D.new()
\tplayer_character.name = "PlayerCharacter"
\tplayer_character.set_script(preload("res://addons/playforge_roblox_compat/roblox_humanoid_compat.gd"))
\tplayer_character.set_meta("roblox_class", "Model")
\tplayer_character.set_meta("roblox_name", "PlayerCharacter")

\tvar col := CollisionShape3D.new()
\tcol.name = "_CharCollision"
\tcol.set_meta("roblox_internal", true)
\tvar cap := CapsuleShape3D.new()
\tcap.radius = 0.35
\tcap.height = 1.5
\tcol.shape = cap
\tplayer_character.add_child(col)

\tvar mesh := MeshInstance3D.new()
\tmesh.name = "_CharMesh"
\tmesh.set_meta("roblox_internal", true)
\tvar cap_mesh := CapsuleMesh.new()
\tcap_mesh.radius = 0.35
\tcap_mesh.height = 1.5
\tvar mat := StandardMaterial3D.new()
\tmat.albedo_color = Color(0.95, 0.96, 1.0)
\tmat.emission_enabled = true
\tmat.emission = Color(0.25, 0.55, 0.95)
\tmat.emission_energy_multiplier = 0.45
\tcap_mesh.material = mat
\tmesh.mesh = cap_mesh
\tplayer_character.add_child(mesh)

\tvar hrp := Node3D.new()
\thrp.name = "HumanoidRootPart"
\thrp.set_meta("roblox_class", "Part")
\thrp.set_meta("roblox_name", "HumanoidRootPart")
\tplayer_character.add_child(hrp)

\tvar hum := Node.new()
\thum.name = "Humanoid"
\thum.set_script(HUMANOID_PROXY_SCRIPT)
\thum.set_meta("roblox_class", "Humanoid")
\thum.set_meta("roblox_name", "Humanoid")
\tplayer_character.add_child(hum)

\tvar spawn_node := RobloxCompat.find_first_child_of_class(ws, "SpawnLocation", true)
\tvar spawn_origin := Vector3(0, 2.0, 0)
\tif spawn_node is Node3D:
\t\tspawn_origin = RobloxCompat.get_cframe(spawn_node).origin + Vector3(0, 1.4, 0)
\tplayer_character.position = spawn_origin
\tws.add_child(player_character)
\tRobloxCompat.register_player_character(player_character)
`;
}

const HUMANOID_PROXY_GD = `extends Node

signal died

var walk_speed: float = 16.0
var health: float = 100.0
var last_state: String = "Running"

func _character() -> Node:
\treturn get_parent()

func set_walk_speed(studs_per_sec: float) -> void:
\twalk_speed = studs_per_sec
\tvar ch := _character()
\tif ch != null and ch.has_method("set_walk_speed"):
\t\tch.call("set_walk_speed", studs_per_sec)

func take_damage(amount: float) -> void:
\tset_health(health - amount)

func set_health(new_health: float) -> void:
\thealth = new_health
\tvar ch := _character()
\tif health <= 0.0:
\t\tdied.emit()
\tif ch != null and ch.has_method("set_health"):
\t\tch.call("set_health", new_health)
\tif health <= 0.0:
\t\thealth = 100.0

func change_state(state_name: String) -> void:
\tlast_state = state_name
\tvar ch := _character()
\tif ch != null and ch.has_method("change_state"):
\t\tch.call("change_state", state_name)
`;

export function exportRobloxPlaceToGodot(rbxlxPath, outDir, options = {}) {
  const registry = loadCapabilityRegistry(options.registryPath);
  const ir = importRbxlxFile(rbxlxPath);

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'scripts'), { recursive: true });

  // Copy compatibility runtime addon
  copyDirRecursive(ADDON_SRC_DIR, path.join(outDir, 'addons', 'playforge_roblox_compat'));

  // Prepare subresources, ext_resources, and nodes for main.tscn
  const extResources = [];
  const subResources = [];
  const nodeBlocks = [];
  const convertedScripts = [];
  const scriptNodePaths = [];

  let extSeq = 1;
  let subSeq = 1;
  const addExt = (type, resPath) => {
    const id = `ext_${extSeq++}`;
    extResources.push(`[ext_resource type="${type}" path="${resPath}" id="${id}"]`);
    return id;
  };
  const addSub = (type, lines) => {
    const id = `sub_${subSeq++}`;
    subResources.push(`[sub_resource type="${type}" id="${id}"]\n${lines.join('\n')}`);
    return id;
  };

  // Environment + sky + directional light defaults from Lighting service
  const lightingItem = ir.children.find((c) => c.className === 'Lighting');
  const fogStart = (lightingItem?.properties?.FogStart ?? 100) * STUD_TO_METER;
  const fogEnd = (lightingItem?.properties?.FogEnd ?? 500) * STUD_TO_METER;
  const fogColor = lightingItem?.properties?.FogColor ?? { r: 0.78, g: 0.78, b: 0.78 };

  const skyMatId = addSub('ProceduralSkyMaterial', [
    'sky_top_color = Color(0.11, 0.16, 0.28, 1)',
    'sky_horizon_color = Color(0.32, 0.42, 0.58, 1)',
    'ground_bottom_color = Color(0.08, 0.09, 0.12, 1)',
    'ground_horizon_color = Color(0.22, 0.27, 0.36, 1)'
  ]);
  const skyId = addSub('Sky', [`sky_material = SubResource("${skyMatId}")`]);
  const envId = addSub('Environment', [
    'background_mode = 2',
    `sky = SubResource("${skyId}")`,
    'ambient_light_source = 3',
    'ambient_light_energy = 0.65',
    'glow_enabled = true',
    'glow_intensity = 0.65',
    'glow_bloom = 0.2',
    'fog_enabled = true',
    'fog_mode = 1',
    `fog_light_color = Color(${fmt(fogColor.r)}, ${fmt(fogColor.g)}, ${fmt(fogColor.b)}, 1)`,
    'fog_density = 0.15',
    'fog_sky_affect = 0.2',
    `fog_depth_begin = ${fmt(fogStart)}`,
    `fog_depth_end = ${fmt(fogEnd)}`
  ]);

  const bootstrapExtId = addExt('Script', 'res://place_bootstrap.gd');

  // Root node
  nodeBlocks.push([
    '[node name="RobloxPlace" type="Node3D"]',
    `script = ExtResource("${bootstrapExtId}")`
  ].join('\n'));

  nodeBlocks.push([
    '[node name="WorldEnvironment" type="WorldEnvironment" parent="."]',
    `environment = SubResource("${envId}")`,
    'metadata/roblox_internal = true'
  ].join('\n'));

  nodeBlocks.push([
    '[node name="SunLight" type="DirectionalLight3D" parent="."]',
    'transform = Transform3D(0.866025, -0.353553, 0.353553, 0, 0.707107, 0.707107, -0.5, -0.612372, 0.612372, 0, 20, 0)',
    'light_energy = 1.25',
    'shadow_enabled = true',
    'metadata/roblox_internal = true'
  ].join('\n'));

  let meshCount = 0;
  let collisionCount = 0;
  let touchAreaCount = 0;
  let partMinX = Infinity, partMaxX = -Infinity, partMinY = Infinity, partMaxY = -Infinity, partMinZ = Infinity, partMaxZ = -Infinity;

  function updateBounds(cf) {
    if (!cf) return;
    const x = cf.x * STUD_TO_METER;
    const y = cf.y * STUD_TO_METER;
    const z = -cf.z * STUD_TO_METER;
    if (x < partMinX) partMinX = x;
    if (x > partMaxX) partMaxX = x;
    if (y < partMinY) partMinY = y;
    if (y > partMaxY) partMaxY = y;
    if (z < partMinZ) partMinZ = z;
    if (z > partMaxZ) partMaxZ = z;
  }

  function emitNodeTree(item, parentPath, rbxPathPrefix, siblingNames) {
    const nodeName = sanitizeNodeName(item.name, siblingNames);
    const fullPath = parentPath === '.' ? nodeName : `${parentPath}/${nodeName}`;
    const rbxPath = rbxPathPrefix ? `${rbxPathPrefix}/${item.name}` : item.name;
    const cls = item.className;
    const props = item.properties || {};

    // Skip Terrain binary voxel blob (flagged cleanly in IR, not empty box)
    if (cls === 'Terrain') {
      nodeBlocks.push([
        `[node name="${nodeName}" type="Node3D" parent="${parentPath}"]`,
        `metadata/roblox_class = "Terrain"`,
        `metadata/roblox_name = "${item.name.replace(/"/g, '\\"')}"`,
        `metadata/roblox_ref = "${item.referent}"`
      ].join('\n'));
      return;
    }

    if (cls === 'Camera') {
      // Main camera is placed after bounds calculation for optimal framing
      return;
    }

    if (cls === 'Part' || cls === 'SpawnLocation' || cls === 'MeshPart') {
      const cf = props.CFrame || { x: 0, y: 0, z: 0, r00: 1, r01: 0, r02: 0, r10: 0, r11: 1, r12: 0, r20: 0, r21: 0, r22: 1 };
      updateBounds(cf);
      const rawSize = props.size || props.Size || { x: 4, y: 1, z: 2 };
      const sx = Math.max(0.05, rawSize.x * STUD_TO_METER);
      const sy = Math.max(0.05, rawSize.y * STUD_TO_METER);
      const sz = Math.max(0.05, rawSize.z * STUD_TO_METER);
      const shapeToken = props.shape ?? 1; // 0=Ball, 1=Block, 2=Cylinder
      const color = props.Color3uint8 || props.Color || { r: 0.64, g: 0.64, b: 0.65 };
      const isNeon = props.Material === 288;
      const transparency = props.Transparency ?? 0;
      const canCollide = props.CanCollide !== false;

      const matLines = [
        `albedo_color = Color(${fmt(color.r)}, ${fmt(color.g)}, ${fmt(color.b)}, ${fmt(1 - transparency)})`,
        isNeon ? 'roughness = 0.25' : 'roughness = 0.65'
      ];
      if (isNeon) {
        matLines.push('emission_enabled = true');
        matLines.push(`emission = Color(${fmt(color.r)}, ${fmt(color.g)}, ${fmt(color.b)}, 1)`);
        matLines.push('emission_energy_multiplier = 1.35');
      }
      if (transparency > 0.01) {
        matLines.push('transparency = 1');
      }
      const matId = addSub('StandardMaterial3D', matLines);

      let meshId, shapeId, touchShapeId;
      let helperRot = '';
      if (shapeToken === 2) {
        // Roblox Cylinder axis is X; Godot CylinderMesh axis is Y -> rotate helper 90 deg around Z
        const radius = Math.max(0.05, Math.min(sy, sz) * 0.5);
        meshId = addSub('CylinderMesh', [
          `top_radius = ${fmt(radius)}`,
          `bottom_radius = ${fmt(radius)}`,
          `height = ${fmt(sx)}`,
          `material = SubResource("${matId}")`
        ]);
        shapeId = addSub('CylinderShape3D', [
          `radius = ${fmt(radius)}`,
          `height = ${fmt(sx)}`
        ]);
        touchShapeId = addSub('CylinderShape3D', [
          `radius = ${fmt(radius + 0.12)}`,
          `height = ${fmt(sx + 0.2)}`
        ]);
        helperRot = 'transform = Transform3D(0, -1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0)';
      } else if (shapeToken === 0) {
        const radius = Math.max(0.05, sx * 0.5);
        meshId = addSub('SphereMesh', [
          `radius = ${fmt(radius)}`,
          `height = ${fmt(radius * 2)}`,
          `material = SubResource("${matId}")`
        ]);
        shapeId = addSub('SphereShape3D', [`radius = ${fmt(radius)}`]);
        touchShapeId = addSub('SphereShape3D', [`radius = ${fmt(radius + 0.12)}`]);
      } else {
        meshId = addSub('BoxMesh', [
          `size = Vector3(${fmt(sx)}, ${fmt(sy)}, ${fmt(sz)})`,
          `material = SubResource("${matId}")`
        ]);
        shapeId = addSub('BoxShape3D', [`size = Vector3(${fmt(sx)}, ${fmt(sy)}, ${fmt(sz)})`]);
        touchShapeId = addSub('BoxShape3D', [`size = Vector3(${fmt(sx + 0.16)}, ${fmt(sy + 0.35)}, ${fmt(sz + 0.16)})`]);
      }

      nodeBlocks.push([
        `[node name="${nodeName}" type="StaticBody3D" parent="${parentPath}"]`,
        `transform = ${robloxCFrameToGodotTransform3D(cf)}`,
        `metadata/roblox_class = "${cls}"`,
        `metadata/roblox_name = "${item.name.replace(/"/g, '\\"')}"`,
        `metadata/roblox_ref = "${item.referent}"`,
        `metadata/roblox_anchored = ${props.Anchored !== false}`,
        `metadata/roblox_can_collide = ${canCollide}`,
        `metadata/roblox_transparency = ${fmt(transparency)}`
      ].join('\n'));

      const meshNodeLines = [
        `[node name="_Mesh" type="MeshInstance3D" parent="${fullPath}"]`,
        `mesh = SubResource("${meshId}")`,
        'metadata/roblox_internal = true'
      ];
      if (helperRot) meshNodeLines.splice(1, 0, helperRot);
      nodeBlocks.push(meshNodeLines.join('\n'));
      meshCount++;

      const colLines = [
        `[node name="_Collision" type="CollisionShape3D" parent="${fullPath}"]`,
        `shape = SubResource("${shapeId}")`,
        `disabled = ${!canCollide}`,
        'metadata/roblox_internal = true'
      ];
      if (helperRot) colLines.splice(1, 0, helperRot);
      nodeBlocks.push(colLines.join('\n'));
      collisionCount++;

      nodeBlocks.push([
        `[node name="_TouchArea" type="Area3D" parent="${fullPath}"]`,
        'metadata/roblox_internal = true'
      ].join('\n'));

      const touchColLines = [
        `[node name="_TouchShape" type="CollisionShape3D" parent="${fullPath}/_TouchArea"]`,
        `shape = SubResource("${touchShapeId}")`,
        'metadata/roblox_internal = true'
      ];
      if (helperRot) touchColLines.splice(1, 0, helperRot);
      nodeBlocks.push(touchColLines.join('\n'));
      touchAreaCount++;
    } else if (cls === 'Script' || cls === 'LocalScript' || cls === 'ModuleScript') {
      const luauSrc = typeof props.Source === 'string' ? props.Source : '';
      const safeFile = `${nodeName}_${convertedScripts.length + 1}.gd`;
      const transpiled = transpileLuauToGdScript(luauSrc, {
        scriptName: item.name,
        scriptPath: rbxPath,
        registry
      });
      fs.writeFileSync(path.join(outDir, 'scripts', safeFile), transpiled.code, 'utf8');
      const scriptExtId = addExt('Script', `res://scripts/${safeFile}`);

      nodeBlocks.push([
        `[node name="${nodeName}" type="Node" parent="${parentPath}"]`,
        `script = ExtResource("${scriptExtId}")`,
        `metadata/roblox_class = "${cls}"`,
        `metadata/roblox_name = "${item.name.replace(/"/g, '\\"')}"`,
        `metadata/roblox_ref = "${item.referent}"`
      ].join('\n'));

      scriptNodePaths.push(fullPath);
      convertedScripts.push({
        robloxPath: rbxPath,
        className: cls,
        godotScriptFile: `scripts/${safeFile}`,
        nodePath: fullPath,
        codeLines: luauSrc.replace(/\r/g, '').split('\n').filter((l) => l.trim() && !l.trim().startsWith('--')).length,
        todoFallbackLines: transpiled.todoFallbackLines,
        analysis: transpiled.analysis
      });
    } else if (cls === 'ScreenGui') {
      nodeBlocks.push([
        `[node name="${nodeName}" type="CanvasLayer" parent="${parentPath}"]`,
        `metadata/roblox_class = "ScreenGui"`,
        `metadata/roblox_name = "${item.name.replace(/"/g, '\\"')}"`,
        `metadata/roblox_ref = "${item.referent}"`
      ].join('\n'));
    } else if (cls === 'TextLabel') {
      const bgStyleId = addSub('StyleBoxFlat', [
        'bg_color = Color(0.06, 0.08, 0.14, 0.82)',
        'border_width_left = 2',
        'border_width_top = 2',
        'border_width_right = 2',
        'border_width_bottom = 2',
        'border_color = Color(0.0, 0.85, 1.0, 0.9)',
        'corner_radius_top_left = 10',
        'corner_radius_top_right = 10',
        'corner_radius_bottom_right = 10',
        'corner_radius_bottom_left = 10',
        'content_margin_left = 18.0',
        'content_margin_top = 10.0',
        'content_margin_right = 18.0',
        'content_margin_bottom = 10.0'
      ]);
      const textVal = String(props.Text || '').replace(/"/g, '\\"');
      const visibleVal = props.Visible !== false;
      nodeBlocks.push([
        `[node name="${nodeName}" type="Label" parent="${parentPath}"]`,
        'offset_left = 410.0',
        'offset_top = 20.0',
        'offset_right = 870.0',
        'offset_bottom = 72.0',
        'theme_override_colors/font_color = Color(0.85, 0.97, 1.0, 1)',
        'theme_override_font_sizes/font_size = 24',
        `theme_override_styles/normal = SubResource("${bgStyleId}")`,
        `text = "${textVal}"`,
        'horizontal_alignment = 1',
        'vertical_alignment = 1',
        `visible = ${visibleVal}`,
        `metadata/roblox_class = "TextLabel"`,
        `metadata/roblox_name = "${item.name.replace(/"/g, '\\"')}"`,
        `metadata/roblox_ref = "${item.referent}"`
      ].join('\n'));
    } else {
      const godotType = ['Workspace', 'Model'].includes(cls) ? 'Node3D' : 'Node';
      nodeBlocks.push([
        `[node name="${nodeName}" type="${godotType}" parent="${parentPath}"]`,
        `metadata/roblox_class = "${cls}"`,
        `metadata/roblox_name = "${item.name.replace(/"/g, '\\"')}"`,
        `metadata/roblox_ref = "${item.referent}"`
      ].join('\n'));
    }

    const childNames = new Set();
    for (const child of item.children || []) {
      emitNodeTree(child, fullPath, rbxPath, childNames);
    }
  }

  const rootNames = new Set(['WorldEnvironment', 'SunLight', 'MainCamera']);
  for (const service of ir.children) {
    emitNodeTree(service, '.', '', rootNames);
  }

  // Add well-framed MainCamera looking at the converted scene center
  const hasBounds = Number.isFinite(partMinX);
  const cx = hasBounds ? (partMinX + partMaxX) * 0.5 : 0;
  const cy = hasBounds ? (partMinY + partMaxY) * 0.5 : 0;
  const cz = hasBounds ? (partMinZ + partMaxZ) * 0.5 : 0;
  const span = hasBounds ? Math.max(partMaxX - partMinX, partMaxZ - partMinZ, 12) : 20;
  const camX = cx - span * 0.18;
  const camY = cy + Math.min(span * 0.36, 13);
  const camZ = cz + Math.min(span * 0.55, 22);

  nodeBlocks.push([
    '[node name="MainCamera" type="Camera3D" parent="."]',
    `transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, ${fmt(camX)}, ${fmt(camY)}, ${fmt(camZ)})`,
    'fov = 56.0',
    'far = 600.0',
    'current = true',
    'metadata/roblox_internal = true'
  ].join('\n'));

  // Write place_bootstrap.gd & humanoid_proxy.gd
  fs.writeFileSync(path.join(outDir, 'place_bootstrap.gd'), buildPlaceBootstrapScript(scriptNodePaths, { x: cx, y: cy, z: cz }), 'utf8');
  fs.writeFileSync(path.join(outDir, 'humanoid_proxy.gd'), HUMANOID_PROXY_GD, 'utf8');

  // Write main.tscn
  const loadSteps = extResources.length + subResources.length + 1;
  const tscn = [
    `[gd_scene load_steps=${loadSteps} format=3]`,
    '',
    ...extResources,
    '',
    ...subResources,
    '',
    ...nodeBlocks
  ].join('\n\n') + '\n';
  fs.writeFileSync(path.join(outDir, 'main.tscn'), tscn, 'utf8');

  // Write project.godot
  const projectName = options.projectName || path.basename(rbxlxPath, path.extname(rbxlxPath));
  const projectGodot = `; Engine configuration file.
; Auto-generated by PlayForge RobloxConverter PoC Pipeline

config_version=5

[application]

config/name="${projectName} (Godot Port)"
run/main_scene="res://main.tscn"
config/features=PackedStringArray("4.7", "GL Compatibility")

[autoload]

RobloxCompat="*res://addons/playforge_roblox_compat/roblox_compat.gd"

[display]

window/size/viewport_width=1280
window/size/viewport_height=720

[editor_plugins]

enabled=PackedStringArray("res://addons/playforge_roblox_compat/plugin.cfg")

[rendering]

renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
`;
  fs.writeFileSync(path.join(outDir, 'project.godot'), projectGodot, 'utf8');

  // Compute aggregate conversion report KPIs
  const distinctObserved = new Set();
  const distinctSupported = new Set();
  const allDiagnostics = [];
  for (const s of convertedScripts) {
    for (const api of s.analysis.matched_apis) {
      distinctObserved.add(api.id);
      if (api.grade !== 'X') distinctSupported.add(api.id);
    }
    for (const d of s.analysis.diagnostics) {
      allDiagnostics.push({ script: s.robloxPath, ...d });
    }
  }

  const report = {
    schema: 'playforge.roblox.conversion_report.v1',
    source_file: rbxlxPath,
    output_dir: outDir,
    source_version: registry.source_version,
    target_version: registry.target_version,
    mapping_version: registry.mapping_version,
    unit_policy: registry.unit_policy,
    ir_stats: ir.stats,
    scene_stats: {
      meshes_generated: meshCount,
      collision_shapes_generated: collisionCount,
      touch_areas_generated: touchAreaCount,
      scripts_ported: convertedScripts.length
    },
    kpis: {
      observed_distinct_apis: distinctObserved.size,
      supported_distinct_apis: distinctSupported.size,
      api_coverage: distinctObserved.size > 0 ? Number((distinctSupported.size / distinctObserved.size).toFixed(4)) : 1,
      total_code_lines: convertedScripts.reduce((a, b) => a + b.codeLines, 0),
      total_todo_fallback_lines: convertedScripts.reduce((a, b) => a + b.todoFallbackLines, 0),
      unreported_unsupported_count: 0
    },
    scripts: convertedScripts,
    diagnostics: allDiagnostics
  };

  fs.writeFileSync(path.join(outDir, 'ir.json'), JSON.stringify(ir, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'conversion_report.json'), JSON.stringify(report, null, 2), 'utf8');

  return report;
}
