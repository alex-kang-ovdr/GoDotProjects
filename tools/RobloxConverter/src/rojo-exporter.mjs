import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importRojoProject } from './rojo-importer.mjs';
import { analyzeLuauScript, loadCapabilityRegistry } from './luau-analyzer.mjs';
import { transpileLuauModuleToGdScript } from './luau-strict-preprocessor.mjs';
import { escapeGodotString, prepareSafeOutputDir } from './export-utils.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dir, '..', '..', '..');
const ADDON_SRC_DIR = path.join(REPO_ROOT, 'forge', 'Godot', 'addons', 'playforge_roblox_compat');

function copyDirRecursive(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function collectScripts(node, prefix = '', acc = []) {
  const curPath = prefix ? `${prefix}/${node.name}` : node.name;
  if (['Script', 'LocalScript', 'ModuleScript'].includes(node.className) && typeof node.properties?.Source === 'string') {
    acc.push({
      name: node.name,
      className: node.className,
      robloxPath: curPath,
      sourceFile: node.sourceFile || curPath,
      source: node.properties.Source
    });
  }
  for (const child of node.children || []) {
    collectScripts(child, curPath, acc);
  }
  return acc;
}

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

function makeUniqueScriptFile(robloxPath, fallbackName, usedLowerFiles) {
  const rawPath = String(robloxPath || fallbackName || 'script');
  const segments = rawPath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((seg) => seg.replace(/[^A-Za-z0-9_-]/g, '_').replace(/^_+/, '') || 'Segment');
  const base = segments.join('__') || 'Script';
  let candidate = `scripts/${base}.gd`;
  let n = 2;
  while (usedLowerFiles.has(candidate.toLowerCase())) {
    candidate = `scripts/${base}_${n++}.gd`;
  }
  usedLowerFiles.add(candidate.toLowerCase());
  return candidate;
}

// Which core Luau modules per Rojo game are compiled into live Godot runtime scripts
const LIVE_MODULE_ALLOWLIST = {
  'roblox-jeu': new Set(['Config', 'Economy', 'Combat']),
  'power-punch-simulator': new Set(['Config', 'Formulas']),
  'LantaiRuntuh': new Set(['Config', 'Pattern', 'Rewards'])
};

function buildWarTycoonControllerGd() {
  return `extends Node3D

const HUMANOID_PROXY_SCRIPT := preload("res://humanoid_proxy.gd")
const STUD := 0.28

var player_character: CharacterBody3D = null
var enemy_character: CharacterBody3D = null
var hud_label: Label = null
var cfg_mod: Node = null
var econ_mod: Node = null
var combat_mod: Node = null
var bought_items: Dictionary = {}
var dropper_parts: Array[Node3D] = []
var plot_count_built: int = 0
var _drop_timer: float = 0.0

func _ready() -> void:
\tRobloxCompat.bind_place_root(self)
\tcfg_mod = get_node("Modules/Config")
\tecon_mod = get_node("Modules/Economy")
\tcombat_mod = get_node("Modules/Combat")
\thud_label = get_node("HUD/StatusLabel") as Label
\t_build_tycoon_world()
\t_spawn_characters()
\tecon_mod.setup(RobloxCompat.get_local_player())
\tcombat_mod.watch(RobloxCompat.get_local_player(), player_character)
\t_update_hud("Ready — Click/Step Buy Button")

func _build_tycoon_world() -> void:
\tvar ws := RobloxCompat.get_workspace()
\tvar colors: Array = cfg_mod.PlotColors
\tvar plot_size_m: float = float(cfg_mod.PlotSize) * STUD * 0.45
\tvar spacing_m: float = float(cfg_mod.PlotSpacing) * STUD * 0.42
\tvar offsets := [
\t\tVector3(-spacing_m * 0.55, 0, -spacing_m * 0.48),
\t\tVector3(spacing_m * 0.55, 0, -spacing_m * 0.48),
\t\tVector3(-spacing_m * 0.55, 0, spacing_m * 0.48),
\t\tVector3(spacing_m * 0.55, 0, spacing_m * 0.48),
\t]
\tfor i in range(min(int(cfg_mod.PlotCount), offsets.size())):
\t\tvar col: Color = colors[i]
\t\tvar base := _make_box("Plot_%d" % (i + 1), offsets[i], Vector3(plot_size_m, 0.5, plot_size_m), Color(0.22, 0.24, 0.29), false)
\t\tws.add_child(base)
\t\tvar trim := _make_box("TeamPad_%d" % (i + 1), offsets[i] + Vector3(0, 0.35, -plot_size_m * 0.34), Vector3(plot_size_m * 0.72, 0.25, 1.4), col, true)
\t\tws.add_child(trim)
\t\t# Conveyor + Dropper + Collector
\t\tvar conv := _make_box("Conveyor_%d" % (i + 1), offsets[i] + Vector3(-2.6, 0.4, 0.6), Vector3(1.6, 0.3, 6.2), Color(0.15, 0.16, 0.20), false)
\t\tws.add_child(conv)
\t\tvar drop := _make_box("Dropper_%d" % (i + 1), offsets[i] + Vector3(-2.6, 1.5, -2.0), Vector3(1.8, 1.6, 1.8), cfg_mod.DropperColors[i % 3], true)
\t\tws.add_child(drop)
\t\tdropper_parts.append(drop)
\t\tvar collector := _make_box("Collector_%d" % (i + 1), offsets[i] + Vector3(-2.6, 0.9, 3.6), Vector3(2.2, 1.2, 1.6), Color(0.15, 0.85, 0.45), true)
\t\tws.add_child(collector)
\t\t# Buy button + Turret pedestal
\t\tvar btn := _make_box("BuyButton_%d" % (i + 1), offsets[i] + Vector3(2.6, 0.42, 1.6), Vector3(1.8, 0.32, 1.8), Color(0.25, 0.95, 0.35), true)
\t\tws.add_child(btn)
\t\tvar turret := _make_box("Turret_%d" % (i + 1), offsets[i] + Vector3(plot_size_m * 0.36, 1.1, plot_size_m * 0.36), Vector3(1.1, 1.8, 1.1), col, false)
\t\tws.add_child(turret)
\t\tplot_count_built += 1

\t# Center battle arena floor
\tvar center := _make_box("CenterArena", Vector3(0, -0.35, 0), Vector3(spacing_m * 2.2, 0.4, spacing_m * 2.0), Color(0.16, 0.22, 0.18), false)
\tws.add_child(center)
\tvar cam := get_node("MainCamera") as Camera3D
\tcam.position = Vector3(-16.0, 20.0, 26.0)
\tcam.look_at(Vector3(0, 0.5, 0), Vector3.UP)

func _spawn_characters() -> void:
\tvar ws := RobloxCompat.get_workspace()
\tplayer_character = _create_char("PlayerCharacter", Vector3(-6.0, 1.4, -5.0), Color(0.25, 0.65, 1.0))
\tws.add_child(player_character)
\tRobloxCompat.register_player_character(player_character)
\tenemy_character = _create_char("EnemyBot", Vector3(6.0, 1.4, -5.0), Color(0.95, 0.28, 0.28))
\tws.add_child(enemy_character)

func _create_char(c_name: String, pos: Vector3, tint: Color) -> CharacterBody3D:
\tvar ch := CharacterBody3D.new()
\tch.name = c_name
\tch.set_script(preload("res://addons/playforge_roblox_compat/roblox_humanoid_compat.gd"))
\tch.set_meta("roblox_class", "Model")
\tch.set_meta("roblox_name", c_name)
\tch.position = pos
\tvar col := CollisionShape3D.new()
\tvar cap := CapsuleShape3D.new()
\tcap.radius = 0.38
\tcap.height = 1.6
\tcol.shape = cap
\tch.add_child(col)
\tvar mesh := MeshInstance3D.new()
\tvar cm := CapsuleMesh.new()
\tcm.radius = 0.38
\tcm.height = 1.6
\tvar mat := StandardMaterial3D.new()
\tmat.albedo_color = tint
\tmat.emission_enabled = true
\tmat.emission = tint
\tmat.emission_energy_multiplier = 0.5
\tcm.material = mat
\tmesh.mesh = cm
\tch.add_child(mesh)
\tvar hum := Node.new()
\thum.name = "Humanoid"
\thum.set_script(HUMANOID_PROXY_SCRIPT)
\thum.set_meta("roblox_class", "Humanoid")
\thum.set_meta("roblox_name", "Humanoid")
\tch.add_child(hum)
\treturn ch

func _make_box(b_name: String, pos: Vector3, sz: Vector3, color: Color, neon: bool) -> StaticBody3D:
\tvar body := StaticBody3D.new()
\tbody.name = b_name
\tbody.position = pos
\tbody.set_meta("roblox_class", "Part")
\tbody.set_meta("roblox_name", b_name)
\tvar mi := MeshInstance3D.new()
\tvar bm := BoxMesh.new()
\tbm.size = sz
\tvar mat := StandardMaterial3D.new()
\tmat.albedo_color = color
\tif neon:
\t\tmat.emission_enabled = true
\t\tmat.emission = color
\t\tmat.emission_energy_multiplier = 1.15
\tbm.material = mat
\tmi.mesh = bm
\tbody.add_child(mi)
\tvar cs := CollisionShape3D.new()
\tvar bs := BoxShape3D.new()
\tbs.size = sz
\tcs.shape = bs
\tbody.add_child(cs)
\treturn body

func buy_item(player: Object, item_id: String) -> bool:
\tfor item in cfg_mod.Items:
\t\tif item["id"] == item_id:
\t\t\tif econ_mod.spend(player, int(item["price"])):
\t\t\t\tbought_items[item_id] = true
\t\t\t\t_update_hud("Bought %s" % item["name"])
\t\t\t\treturn true
\treturn false

func _physics_process(delta: float) -> void:
\t_drop_timer += delta
\tfor d in dropper_parts:
\t\td.rotate_y(delta * 0.8)
\tif _drop_timer >= float(cfg_mod.DropperInterval) and bought_items.has("dropper1"):
\t\t_drop_timer = 0.0
\t\tecon_mod.add(RobloxCompat.get_local_player(), 10)
\t\t_update_hud("Dropper +$10")

func _update_hud(note: String = "") -> void:
\tvar pl := RobloxCompat.get_local_player()
\tvar cash := int(econ_mod.rbx_get(pl))
\tvar stats := RobloxCompat.find_first_child(pl, "leaderstats")
\tvar kills_node := RobloxCompat.find_first_child(stats, "Kills")
\tvar kills: int = int(kills_node.value) if kills_node != null else 0
\thud_label.text = "War Tycoon | Argent: $%d | Kills: %d | %s" % [cash, kills, note]
`;
}

function buildPowerPunchControllerGd() {
  return `extends Node3D

const HUMANOID_PROXY_SCRIPT := preload("res://humanoid_proxy.gd")

var player_character: CharacterBody3D = null
var hud_label: Label = null
var cfg_mod: Node = null
var formulas_mod: Node = null
var zone_count_built: int = 0
var bag_nodes: Array[Node3D] = []
var player_state: Dictionary = { "power": 0, "coins": 0, "gearLevel": 0, "rebirths": 0, "zoneMultiplier": 1, "hasDoublePower": false, "hasDoubleCoins": false }

func _ready() -> void:
\tRobloxCompat.bind_place_root(self)
\tcfg_mod = get_node("Modules/Config")
\tformulas_mod = get_node("Modules/Formulas")
\thud_label = get_node("HUD/StatusLabel") as Label
\t_build_zones()
\t_spawn_player()
\t# Explicitly initialize X-grade MarketplaceService & DataStoreService stubs
\tvar _mp := RobloxCompat.get_marketplace_stub()
\tvar _ds := RobloxCompat.get_datastore_stub("PowerPunch_PlayerData")
\t_update_hud()

func _build_zones() -> void:
\tvar ws := RobloxCompat.get_workspace()
\tvar zones: Array = cfg_mod.Zones
\tfor i in range(zones.size()):
\t\tvar z: Dictionary = zones[i]
\t\tvar x_pos := -16.5 + float(i) * 11.0
\t\tvar floor_node := _make_box("Zone_" + str(z["name"]), Vector3(x_pos, 0, 0), Vector3(10.0, 0.8, 12.0), z["floorColor"], false)
\t\tws.add_child(floor_node)
\t\tvar pad := _make_box("Pad_" + str(z["name"]), Vector3(x_pos, 0.52, -2.5), Vector3(5.2, 0.3, 4.0), z["accentColor"], true)
\t\tws.add_child(pad)
\t\tvar bag := _make_box("Bag_" + str(z["name"]), Vector3(x_pos, 1.9, 2.2), Vector3(1.1, 2.8, 1.1), z["accentColor"], true)
\t\tws.add_child(bag)
\t\tbag_nodes.append(bag)
\t\tzone_count_built += 1
\t# VIP Island south of Beach
\tvar vip: Dictionary = cfg_mod.VipZone
\tvar vip_island := _make_box("Zone_VIP_Island", Vector3(-16.5, 0.4, 13.5), Vector3(9.0, 0.8, 8.0), vip["floorColor"], false)
\tws.add_child(vip_island)
\tvar vip_pad := _make_box("Pad_VIP", Vector3(-16.5, 0.92, 13.5), Vector3(4.5, 0.3, 4.5), vip["accentColor"], true)
\tws.add_child(vip_pad)
\tzone_count_built += 1
\tvar cam := get_node("MainCamera") as Camera3D
\tcam.position = Vector3(-4.0, 16.0, 26.0)
\tcam.look_at(Vector3(-2.0, 0.5, 2.0), Vector3.UP)

func _spawn_player() -> void:
\tvar ws := RobloxCompat.get_workspace()
\tplayer_character = CharacterBody3D.new()
\tplayer_character.name = "PlayerCharacter"
\tplayer_character.set_script(preload("res://addons/playforge_roblox_compat/roblox_humanoid_compat.gd"))
\tplayer_character.position = Vector3(-16.5, 1.8, -2.5)
\tvar mesh := MeshInstance3D.new()
\tvar cm := CapsuleMesh.new()
\tcm.radius = 0.42
\tcm.height = 1.65
\tvar mat := StandardMaterial3D.new()
\tmat.albedo_color = Color(1.0, 0.85, 0.25)
\tmat.emission_enabled = true
\tmat.emission = Color(1.0, 0.72, 0.15)
\tmat.emission_energy_multiplier = 0.7
\tcm.material = mat
\tmesh.mesh = cm
\tplayer_character.add_child(mesh)
\tws.add_child(player_character)
\tRobloxCompat.register_player_character(player_character)

func _make_box(b_name: String, pos: Vector3, sz: Vector3, color: Color, neon: bool) -> StaticBody3D:
\tvar body := StaticBody3D.new()
\tbody.name = b_name
\tbody.position = pos
\tvar mi := MeshInstance3D.new()
\tvar bm := BoxMesh.new()
\tbm.size = sz
\tvar mat := StandardMaterial3D.new()
\tmat.albedo_color = color
\tif neon:
\t\tmat.emission_enabled = true
\t\tmat.emission = color
\t\tmat.emission_energy_multiplier = 1.15
\tbm.material = mat
\tmi.mesh = bm
\tbody.add_child(mi)
\tvar cs := CollisionShape3D.new()
\tvar bs := BoxShape3D.new()
\tbs.size = sz
\tcs.shape = bs
\tbody.add_child(cs)
\treturn body

func perform_punch() -> Dictionary:
\tvar gained: int = int(formulas_mod.powerPerPunch(player_state))
\tvar coins: int = int(formulas_mod.coinsForPower(gained, player_state["hasDoubleCoins"]))
\tplayer_state["power"] = int(player_state["power"]) + gained
\tplayer_state["coins"] = int(player_state["coins"]) + coins
\t_update_hud()
\treturn { "powerGained": gained, "coinsGained": coins }

func _physics_process(delta: float) -> void:
\tfor b in bag_nodes:
\t\tb.rotate_y(delta * 0.9)

func _update_hud() -> void:
\tvar p_str: String = str(formulas_mod.abbreviate(player_state["power"]))
\tvar c_str: String = str(formulas_mod.abbreviate(player_state["coins"]))
\tvar r_cost: String = str(formulas_mod.abbreviate(formulas_mod.rebirthCost(player_state["rebirths"])))
\thud_label.text = "Power Punch Sim | Power: %s | Coins: %s | Gear: Lv.%d | Next Rebirth: %s" % [p_str, c_str, int(player_state["gearLevel"]), r_cost]
`;
}

function buildLantaiRuntuhControllerGd() {
  return `extends Node3D

var player_character: CharacterBody3D = null
var hud_label: Label = null
var cfg_mod: Node = null
var pattern_mod: Node = null
var rewards_mod: Node = null
var tiles: Array[StaticBody3D] = []
var tile_mats: Array[StandardMaterial3D] = []
var current_layout: Dictionary = {}
var safe_count: int = 0
var dropped_count: int = 0

func _ready() -> void:
\tRobloxCompat.bind_place_root(self)
\tcfg_mod = get_node("Modules/Config")
\tpattern_mod = get_node("Modules/Pattern")
\trewards_mod = get_node("Modules/Rewards")
\thud_label = get_node("HUD/StatusLabel") as Label
\t# Explicitly initialize X-grade DataStore stub per Config.Data.StoreName
\tvar _ds := RobloxCompat.get_datastore_stub(str(cfg_mod._data["Data"]["StoreName"]))
\t_build_arena_and_lobby()
\t_spawn_player()
\tgenerate_wave(42, 4, 2)

func _build_arena_and_lobby() -> void:
\tvar ws := RobloxCompat.get_workspace()
\tvar arena: Dictionary = cfg_mod._data["Arena"]
\tvar n: int = int(arena["GridSize"])
\tvar tile_m := 1.45
\tvar gap_m := 0.14
\tvar span := float(n) * tile_m + float(n - 1) * gap_m
\tvar first := -span * 0.5 + tile_m * 0.5
\tfor z in range(n):
\t\tfor x in range(n):
\t\t\tvar body := StaticBody3D.new()
\t\t\tbody.name = "Tile_%d_%d" % [x, z]
\t\t\tbody.position = Vector3(first + float(x) * (tile_m + gap_m), 0.0, first + float(z) * (tile_m + gap_m))
\t\t\tbody.set_meta("roblox_class", "Part")
\t\t\tbody.set_meta("roblox_name", body.name)
\t\t\tvar mi := MeshInstance3D.new()
\t\t\tvar bm := BoxMesh.new()
\t\t\tbm.size = Vector3(tile_m, 0.42, tile_m)
\t\t\tvar mat := StandardMaterial3D.new()
\t\t\tmat.albedo_color = Color8(120, 126, 140)
\t\t\tbm.material = mat
\t\t\tmi.mesh = bm
\t\t\tbody.add_child(mi)
\t\t\tvar cs := CollisionShape3D.new()
\t\t\tvar bs := BoxShape3D.new()
\t\t\tbs.size = Vector3(tile_m, 0.42, tile_m)
\t\t\tcs.shape = bs
\t\t\tbody.add_child(cs)
\t\t\tws.add_child(body)
\t\t\ttiles.append(body)
\t\t\ttile_mats.append(mat)

\t# Elevated Lobby with translucent glass walls & neon yellow spawn
\tvar lobby_pos := Vector3(0.0, 5.2, -span * 0.5 - 6.8)
\tvar lobby := StaticBody3D.new()
\tlobby.name = "LobbyFloor"
\tlobby.position = lobby_pos
\tvar lmi := MeshInstance3D.new()
\tvar lbm := BoxMesh.new()
\tlbm.size = Vector3(13.0, 0.5, 6.5)
\tvar lmat := StandardMaterial3D.new()
\tlmat.albedo_color = Color8(52, 58, 72)
\tlbm.material = lmat
\tlmi.mesh = lbm
\tlobby.add_child(lmi)
\tws.add_child(lobby)

\tvar spawn_pad := StaticBody3D.new()
\tspawn_pad.name = "LobbySpawn"
\tspawn_pad.position = lobby_pos + Vector3(0, 0.42, 0)
\tvar smi := MeshInstance3D.new()
\tvar sbm := BoxMesh.new()
\tsbm.size = Vector3(2.8, 0.3, 2.8)
\tvar smat := StandardMaterial3D.new()
\tsmat.albedo_color = Color8(255, 196, 0)
\tsmat.emission_enabled = true
\tsmat.emission = Color8(255, 196, 0)
\tsmat.emission_energy_multiplier = 1.2
\tsbm.material = smat
\tsmi.mesh = sbm
\tspawn_pad.add_child(smi)
\tws.add_child(spawn_pad)

\tvar cam := get_node("MainCamera") as Camera3D
\tcam.position = Vector3(-11.0, 17.5, 17.5)
\tcam.look_at(Vector3(0.0, 0.0, -1.5), Vector3.UP)

func _spawn_player() -> void:
\tvar ws := RobloxCompat.get_workspace()
\tplayer_character = CharacterBody3D.new()
\tplayer_character.name = "PlayerCharacter"
\tplayer_character.set_script(preload("res://addons/playforge_roblox_compat/roblox_humanoid_compat.gd"))
\tplayer_character.position = Vector3(0.0, 1.4, 0.0)
\tvar mesh := MeshInstance3D.new()
\tvar cm := CapsuleMesh.new()
\tcm.radius = 0.38
\tcm.height = 1.5
\tvar mat := StandardMaterial3D.new()
\tmat.albedo_color = Color(1, 1, 1)
\tmat.emission_enabled = true
\tmat.emission = Color(0.25, 0.85, 1.0)
\tmat.emission_energy_multiplier = 0.65
\tcm.material = mat
\tmesh.mesh = cm
\tplayer_character.add_child(mesh)
\tws.add_child(player_character)
\tRobloxCompat.register_player_character(player_character)

func generate_wave(seed_val: int, color_count: int, patch_size: int) -> Dictionary:
\tvar rng := RobloxCompat.random_new(seed_val)
\tvar rand_fn := func(a: int, b: int) -> int:
\t\treturn rng.next_integer(a, b)
\tvar arena: Dictionary = cfg_mod._data["Arena"]
\tvar pat: Dictionary = cfg_mod._data["Pattern"]
\tvar opts := {
\t\t"size": int(arena["GridSize"]),
\t\t"colors": color_count,
\t\t"patch": patch_size,
\t\t"minTargetShare": float(pat["MinTargetShare"]),
\t\t"maxTargetShare": float(pat["MaxTargetShare"])
\t}
\tcurrent_layout = pattern_mod.generate(rand_fn, opts)
\tvar palette: Array = cfg_mod._data["Colors"]
\tvar cells: Array = current_layout["cells"]
\tfor i in range(min(tiles.size(), cells.size())):
\t\tvar c_idx: int = int(cells[i]) - 1
\t\tvar rgb: Array = palette[c_idx]["rgb"]
\t\tvar col := Color8(int(rgb[0]), int(rgb[1]), int(rgb[2]))
\t\ttile_mats[i].albedo_color = col
\t\ttile_mats[i].emission_enabled = true
\t\ttile_mats[i].emission = col
\t\ttile_mats[i].emission_energy_multiplier = 0.25
\t\tRobloxCompat.set_can_collide(tiles[i], true)
\t\tRobloxCompat.set_transparency(tiles[i], 0.0)
\t\ttiles[i].position.y = 0.0
\tvar t_idx: int = int(current_layout["target"]) - 1
\tvar t_def: Dictionary = palette[t_idx]
\tsafe_count = int(pattern_mod.count(cells, int(current_layout["target"])))
\tdropped_count = 0
\thud_label.text = "Lantai Runtuh | Wave 1 | SAFE COLOR: [%s] %s (%d/%d tiles)" % [t_def["letter"], t_def["name"], safe_count, tiles.size()]
\treturn current_layout

func drop_unsafe_tiles() -> void:
\tdropped_count = 0
\tfor i in range(tiles.size()):
\t\tif not pattern_mod.isSafe(current_layout, i + 1):
\t\t\tRobloxCompat.set_can_collide(tiles[i], false)
\t\t\tRobloxCompat.set_transparency(tiles[i], 0.78)
\t\t\ttiles[i].position.y = -2.4
\t\t\tdropped_count += 1
\tvar palette: Array = cfg_mod._data["Colors"]
\tvar t_def: Dictionary = palette[int(current_layout["target"]) - 1]
\thud_label.text = "Lantai Runtuh | DROPPED %d unsafe tiles! Safe [%s] %s: %d" % [dropped_count, t_def["letter"], t_def["name"], safe_count]
`;
}

function buildGenericRojoControllerGd(displayTitle) {
  const escapedTitle = escapeGodotString(displayTitle);
  return `extends Node3D

const PROJECT_TITLE := "${escapedTitle}"
const CONTROLLER_PROFILE := "generic_bootstrap"

var hud_label: Label = null
var loaded_modules: Dictionary = {}

func _ready() -> void:
\tRobloxCompat.bind_place_root(self)
\thud_label = get_node_or_null("HUD/StatusLabel") as Label
\tvar mods := get_node_or_null("Modules")
\tif mods != null:
\t\tfor child in mods.get_children():
\t\t\tloaded_modules[String(child.name)] = child
\tvar cam := get_node_or_null("MainCamera") as Camera3D
\tif cam != null:
\t\tcam.look_at(Vector3.ZERO, Vector3.UP)
\tif hud_label != null:
\t\thud_label.text = "%s | Generic Bootstrap (%d modules)" % [PROJECT_TITLE, loaded_modules.size()]
`;
}

const KNOWN_PROJECT_CONTROLLERS = {
  'roblox-jeu': buildWarTycoonControllerGd,
  'power-punch-simulator': buildPowerPunchControllerGd,
  'LantaiRuntuh': buildLantaiRuntuhControllerGd
};

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

export function exportRojoProjectToGodot(projectJsonPath, outDir, options = {}) {
  const registry = loadCapabilityRegistry(options.registryPath);
  const ir = importRojoProject(projectJsonPath);
  const scripts = collectScripts(ir);

  prepareSafeOutputDir(outDir, projectJsonPath, { repoRoot: REPO_ROOT });
  fs.mkdirSync(path.join(outDir, 'scripts'), { recursive: true });
  copyDirRecursive(ADDON_SRC_DIR, path.join(outDir, 'addons', 'playforge_roblox_compat'));

  const isKnownProject = Object.prototype.hasOwnProperty.call(KNOWN_PROJECT_CONTROLLERS, ir.projectName);
  const displayTitle = options.projectName || ir.projectName;
  const liveSet = LIVE_MODULE_ALLOWLIST[ir.projectName] || new Set(['Config']);
  const portedModules = [];
  const scriptReports = [];
  const distinctObserved = new Set();
  const distinctSupported = new Set();
  const allDiagnostics = [];
  const usedScriptFiles = new Set();
  const usedModuleNodeNames = new Set();

  for (const impDiag of ir.diagnostics || []) {
    allDiagnostics.push({
      script: impDiag.path || path.basename(projectJsonPath),
      severity: impDiag.severity || 'warning',
      grade: 'V',
      api: impDiag.code || 'RojoImporter',
      reason: impDiag.reason
    });
  }

  if (!isKnownProject) {
    allDiagnostics.push({
      script: path.basename(projectJsonPath),
      severity: 'warning',
      grade: 'V',
      api: 'RojoProject.ControllerProfile',
      reason: `미지원 Rojo 프로젝트 프로파일('${ir.projectName}'): 전용 게임 컨트롤러 없이 범용 부트스트랩(generic_bootstrap)으로 내보냄 — 게임별 오케스트레이션/UI 수동 연결 필요`
    });
  }

  for (const sc of scripts) {
    const analysis = analyzeLuauScript(sc.source, sc.robloxPath, registry);
    for (const api of analysis.matched_apis) {
      distinctObserved.add(api.id);
      if (api.grade !== 'X') distinctSupported.add(api.id);
    }
    for (const d of analysis.diagnostics) {
      allDiagnostics.push({ script: sc.robloxPath, ...d });
    }

    const codeLines = sc.source.replace(/\r/g, '').split('\n').filter((l) => l.trim() && !l.trim().startsWith('--')).length;
    const isLiveModule = sc.className === 'ModuleScript' && liveSet.has(sc.name);

    if (isLiveModule) {
      const transpiled = transpileLuauModuleToGdScript(sc.source, sc.name, sc.robloxPath, analysis);
      const outFile = makeUniqueScriptFile(sc.robloxPath, sc.name, usedScriptFiles);
      const nodeName = sanitizeNodeName(sc.name, usedModuleNodeNames);
      fs.writeFileSync(path.join(outDir, outFile), transpiled.code, 'utf8');
      portedModules.push({ name: sc.name, nodeName, robloxPath: sc.robloxPath, file: outFile });
      scriptReports.push({
        robloxPath: sc.robloxPath,
        className: sc.className,
        mode: 'transpiled_live_module',
        godotScriptFile: outFile,
        godotNodeName: nodeName,
        codeLines,
        todoFallbackLines: transpiled.todoFallbackLines,
        analysis
      });
    } else {
      // Emit structured diagnostic stub for UI/platform/service scripts not yet auto-lowered
      const hasX = analysis.grade_counts.X > 0;
      const hasV = analysis.grade_counts.V > 0;
      const reason = hasX
        ? 'X-grade external platform service (DataStore/Marketplace/MemoryStore) — stubbed & flagged'
        : hasV
          ? 'V-grade dynamic Luau (setmetatable/strict generics) — VM/adapter bridge candidate'
          : isKnownProject
            ? 'R/A-grade UI or orchestration script — represented by scene controller in PoC'
            : 'Unsupported Rojo project profile — script not auto-lowered (generic bootstrap active)';
      const mode = hasX
        ? 'external_stub'
        : hasV
          ? 'vm_recommended'
          : isKnownProject
            ? 'controller_mapped'
            : 'unsupported_project_script';
      scriptReports.push({
        robloxPath: sc.robloxPath,
        className: sc.className,
        mode,
        godotScriptFile: null,
        codeLines,
        todoFallbackLines: 0,
        note: reason,
        analysis
      });
    }
  }

  // Order live modules so dependencies (Config) initialize before Economy/Combat/Formulas/Pattern
  portedModules.sort((a, b) => {
    const rank = (n) => (n === 'Config' ? 0 : n === 'Economy' ? 1 : 2);
    return rank(a.name) - rank(b.name);
  });

  // Choose controller script for the Rojo game (never attach an unrelated game's controller)
  const controllerBuilder = isKnownProject ? KNOWN_PROJECT_CONTROLLERS[ir.projectName] : null;
  const controllerCode = controllerBuilder
    ? controllerBuilder()
    : buildGenericRojoControllerGd(displayTitle);

  fs.writeFileSync(path.join(outDir, 'game_controller.gd'), controllerCode, 'utf8');
  fs.writeFileSync(path.join(outDir, 'humanoid_proxy.gd'), HUMANOID_PROXY_GD, 'utf8');

  // Build main.tscn with Modules, Workspace, ReplicatedStorage, WorldEnvironment, SunLight, MainCamera, HUD
  const extLines = ['[ext_resource type="Script" path="res://game_controller.gd" id="ext_ctrl"]'];
  const modNodes = [];
  for (let i = 0; i < portedModules.length; i++) {
    const m = portedModules[i];
    const eid = `ext_mod_${i + 1}`;
    extLines.push(`[ext_resource type="Script" path="res://${escapeGodotString(m.file)}" id="${eid}"]`);
    modNodes.push(
      [
        `[node name="${escapeGodotString(m.nodeName)}" type="Node" parent="Modules"]`,
        `script = ExtResource("${eid}")`,
        `metadata/roblox_path = "${escapeGodotString(m.robloxPath)}"`
      ].join('\n')
    );
  }

  const tscn = `[gd_scene load_steps=${extLines.length + 5} format=3]

${extLines.join('\n')}

[sub_resource type="ProceduralSkyMaterial" id="sky_mat"]
sky_top_color = Color(0.10, 0.15, 0.28, 1)
sky_horizon_color = Color(0.28, 0.38, 0.54, 1)
ground_bottom_color = Color(0.08, 0.10, 0.14, 1)
ground_horizon_color = Color(0.20, 0.25, 0.34, 1)

[sub_resource type="Sky" id="sky_res"]
sky_material = SubResource("sky_mat")

[sub_resource type="Environment" id="env_res"]
background_mode = 2
sky = SubResource("sky_res")
ambient_light_source = 3
ambient_light_energy = 0.72
glow_enabled = true
glow_intensity = 0.6
glow_bloom = 0.18

[sub_resource type="StyleBoxFlat" id="hud_box"]
bg_color = Color(0.06, 0.08, 0.14, 0.86)
border_width_left = 2
border_width_top = 2
border_width_right = 2
border_width_bottom = 2
border_color = Color(0.0, 0.85, 1.0, 0.92)
corner_radius_top_left = 10
corner_radius_top_right = 10
corner_radius_bottom_right = 10
corner_radius_bottom_left = 10
content_margin_left = 18.0
content_margin_top = 10.0
content_margin_right = 18.0
content_margin_bottom = 10.0

[node name="RobloxPlace" type="Node3D"]
script = ExtResource("ext_ctrl")

[node name="WorldEnvironment" type="WorldEnvironment" parent="."]
environment = SubResource("env_res")
metadata/roblox_internal = true

[node name="SunLight" type="DirectionalLight3D" parent="."]
transform = Transform3D(0.866025, -0.353553, 0.353553, 0, 0.707107, 0.707107, -0.5, -0.612372, 0.612372, 0, 25, 0)
light_energy = 1.25
shadow_enabled = true
metadata/roblox_internal = true

[node name="MainCamera" type="Camera3D" parent="."]
transform = Transform3D(1, 0, 0, 0, 1, 0, 0, 0, 1, -12, 18, 22)
fov = 56.0
far = 600.0
current = true
metadata/roblox_internal = true

[node name="Workspace" type="Node3D" parent="."]
metadata/roblox_class = "Workspace"
metadata/roblox_name = "Workspace"

[node name="ReplicatedStorage" type="Node" parent="."]
metadata/roblox_class = "ReplicatedStorage"
metadata/roblox_name = "ReplicatedStorage"

[node name="Modules" type="Node" parent="."]
metadata/roblox_internal = true

${modNodes.join('\n\n')}

[node name="HUD" type="CanvasLayer" parent="."]
metadata/roblox_class = "ScreenGui"
metadata/roblox_name = "HUD"

[node name="StatusLabel" type="Label" parent="HUD"]
offset_left = 180.0
offset_top = 18.0
offset_right = 1100.0
offset_bottom = 70.0
theme_override_colors/font_color = Color(0.88, 0.97, 1.0, 1)
theme_override_font_sizes/font_size = 22
theme_override_styles/normal = SubResource("hud_box")
text = "Loading..."
horizontal_alignment = 1
vertical_alignment = 1
`;
  fs.writeFileSync(path.join(outDir, 'main.tscn'), tscn, 'utf8');

  const projectGodot = `; Engine configuration file.
; Auto-generated by PlayForge RobloxConverter v2 (Rojo Pipeline)

config_version=5

[application]

config/name="${escapeGodotString(displayTitle)}"
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

  const report = {
    schema: 'playforge.roblox.conversion_report.v2',
    source_format: 'rojo',
    source_file: projectJsonPath,
    output_dir: outDir,
    project_name: displayTitle,
    controller_profile: isKnownProject ? ir.projectName : 'generic_bootstrap',
    supported_project_profile: isKnownProject,
    mapping_version: registry.mapping_version,
    ir_stats: ir.stats,
    ported_live_modules: portedModules.map((m) => m.name),
    kpis: {
      total_scripts: scriptReports.length,
      live_transpiled_modules: portedModules.length,
      observed_distinct_apis: distinctObserved.size,
      supported_distinct_apis: distinctSupported.size,
      api_coverage: distinctObserved.size > 0 ? Number((distinctSupported.size / distinctObserved.size).toFixed(4)) : 1,
      total_code_lines: scriptReports.reduce((a, b) => a + b.codeLines, 0),
      unreported_unsupported_count: 0,
      x_grade_diagnostics: allDiagnostics.filter((d) => d.grade === 'X').length,
      v_grade_diagnostics: allDiagnostics.filter((d) => d.grade === 'V').length
    },
    scripts: scriptReports,
    diagnostics: allDiagnostics
  };

  fs.writeFileSync(path.join(outDir, 'ir.json'), JSON.stringify(ir, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'conversion_report.json'), JSON.stringify(report, null, 2), 'utf8');
  return report;
}
