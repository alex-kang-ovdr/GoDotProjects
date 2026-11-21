extends Node3D

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
	RobloxCompat.bind_place_root(self)
	cfg_mod = get_node("Modules/Config")
	pattern_mod = get_node("Modules/Pattern")
	rewards_mod = get_node("Modules/Rewards")
	hud_label = get_node("HUD/StatusLabel") as Label
	# Explicitly initialize X-grade DataStore stub per Config.Data.StoreName
	var _ds := RobloxCompat.get_datastore_stub(str(cfg_mod._data["Data"]["StoreName"]))
	_build_arena_and_lobby()
	_spawn_player()
	generate_wave(42, 4, 2)

func _build_arena_and_lobby() -> void:
	var ws := RobloxCompat.get_workspace()
	var arena: Dictionary = cfg_mod._data["Arena"]
	var n: int = int(arena["GridSize"])
	var tile_m := 1.45
	var gap_m := 0.14
	var span := float(n) * tile_m + float(n - 1) * gap_m
	var first := -span * 0.5 + tile_m * 0.5
	for z in range(n):
		for x in range(n):
			var body := StaticBody3D.new()
			body.name = "Tile_%d_%d" % [x, z]
			body.position = Vector3(first + float(x) * (tile_m + gap_m), 0.0, first + float(z) * (tile_m + gap_m))
			body.set_meta("roblox_class", "Part")
			body.set_meta("roblox_name", body.name)
			var mi := MeshInstance3D.new()
			var bm := BoxMesh.new()
			bm.size = Vector3(tile_m, 0.42, tile_m)
			var mat := StandardMaterial3D.new()
			mat.albedo_color = Color8(120, 126, 140)
			bm.material = mat
			mi.mesh = bm
			body.add_child(mi)
			var cs := CollisionShape3D.new()
			var bs := BoxShape3D.new()
			bs.size = Vector3(tile_m, 0.42, tile_m)
			cs.shape = bs
			body.add_child(cs)
			ws.add_child(body)
			tiles.append(body)
			tile_mats.append(mat)

	# Elevated Lobby with translucent glass walls & neon yellow spawn
	var lobby_pos := Vector3(0.0, 5.2, -span * 0.5 - 6.8)
	var lobby := StaticBody3D.new()
	lobby.name = "LobbyFloor"
	lobby.position = lobby_pos
	var lmi := MeshInstance3D.new()
	var lbm := BoxMesh.new()
	lbm.size = Vector3(13.0, 0.5, 6.5)
	var lmat := StandardMaterial3D.new()
	lmat.albedo_color = Color8(52, 58, 72)
	lbm.material = lmat
	lmi.mesh = lbm
	lobby.add_child(lmi)
	ws.add_child(lobby)

	var spawn_pad := StaticBody3D.new()
	spawn_pad.name = "LobbySpawn"
	spawn_pad.position = lobby_pos + Vector3(0, 0.42, 0)
	var smi := MeshInstance3D.new()
	var sbm := BoxMesh.new()
	sbm.size = Vector3(2.8, 0.3, 2.8)
	var smat := StandardMaterial3D.new()
	smat.albedo_color = Color8(255, 196, 0)
	smat.emission_enabled = true
	smat.emission = Color8(255, 196, 0)
	smat.emission_energy_multiplier = 1.2
	sbm.material = smat
	smi.mesh = sbm
	spawn_pad.add_child(smi)
	ws.add_child(spawn_pad)

	var cam := get_node("MainCamera") as Camera3D
	cam.position = Vector3(-11.0, 17.5, 17.5)
	cam.look_at(Vector3(0.0, 0.0, -1.5), Vector3.UP)

func _spawn_player() -> void:
	var ws := RobloxCompat.get_workspace()
	player_character = CharacterBody3D.new()
	player_character.name = "PlayerCharacter"
	player_character.set_script(preload("res://addons/playforge_roblox_compat/roblox_humanoid_compat.gd"))
	player_character.position = Vector3(0.0, 1.4, 0.0)
	var mesh := MeshInstance3D.new()
	var cm := CapsuleMesh.new()
	cm.radius = 0.38
	cm.height = 1.5
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1, 1, 1)
	mat.emission_enabled = true
	mat.emission = Color(0.25, 0.85, 1.0)
	mat.emission_energy_multiplier = 0.65
	cm.material = mat
	mesh.mesh = cm
	player_character.add_child(mesh)
	ws.add_child(player_character)
	RobloxCompat.register_player_character(player_character)

func generate_wave(seed_val: int, color_count: int, patch_size: int) -> Dictionary:
	var rng := RobloxCompat.random_new(seed_val)
	var rand_fn := func(a: int, b: int) -> int:
		return rng.next_integer(a, b)
	var arena: Dictionary = cfg_mod._data["Arena"]
	var pat: Dictionary = cfg_mod._data["Pattern"]
	var opts := {
		"size": int(arena["GridSize"]),
		"colors": color_count,
		"patch": patch_size,
		"minTargetShare": float(pat["MinTargetShare"]),
		"maxTargetShare": float(pat["MaxTargetShare"])
	}
	current_layout = pattern_mod.generate(rand_fn, opts)
	var palette: Array = cfg_mod._data["Colors"]
	var cells: Array = current_layout["cells"]
	for i in range(min(tiles.size(), cells.size())):
		var c_idx: int = int(cells[i]) - 1
		var rgb: Array = palette[c_idx]["rgb"]
		var col := Color8(int(rgb[0]), int(rgb[1]), int(rgb[2]))
		tile_mats[i].albedo_color = col
		tile_mats[i].emission_enabled = true
		tile_mats[i].emission = col
		tile_mats[i].emission_energy_multiplier = 0.25
		RobloxCompat.set_can_collide(tiles[i], true)
		RobloxCompat.set_transparency(tiles[i], 0.0)
		tiles[i].position.y = 0.0
	var t_idx: int = int(current_layout["target"]) - 1
	var t_def: Dictionary = palette[t_idx]
	safe_count = int(pattern_mod.count(cells, int(current_layout["target"])))
	dropped_count = 0
	hud_label.text = "Lantai Runtuh | Wave 1 | SAFE COLOR: [%s] %s (%d/%d tiles)" % [t_def["letter"], t_def["name"], safe_count, tiles.size()]
	return current_layout

func drop_unsafe_tiles() -> void:
	dropped_count = 0
	for i in range(tiles.size()):
		if not pattern_mod.isSafe(current_layout, i + 1):
			RobloxCompat.set_can_collide(tiles[i], false)
			RobloxCompat.set_transparency(tiles[i], 0.78)
			tiles[i].position.y = -2.4
			dropped_count += 1
	var palette: Array = cfg_mod._data["Colors"]
	var t_def: Dictionary = palette[int(current_layout["target"]) - 1]
	hud_label.text = "Lantai Runtuh | DROPPED %d unsafe tiles! Safe [%s] %s: %d" % [dropped_count, t_def["letter"], t_def["name"], safe_count]
