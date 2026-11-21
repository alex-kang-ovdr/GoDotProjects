extends Node3D

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
	RobloxCompat.bind_place_root(self)
	cfg_mod = get_node("Modules/Config")
	econ_mod = get_node("Modules/Economy")
	combat_mod = get_node("Modules/Combat")
	hud_label = get_node("HUD/StatusLabel") as Label
	_build_tycoon_world()
	_spawn_characters()
	econ_mod.setup(RobloxCompat.get_local_player())
	combat_mod.watch(RobloxCompat.get_local_player(), player_character)
	_update_hud("Ready — Click/Step Buy Button")

func _build_tycoon_world() -> void:
	var ws := RobloxCompat.get_workspace()
	var colors: Array = cfg_mod.PlotColors
	var plot_size_m: float = float(cfg_mod.PlotSize) * STUD * 0.45
	var spacing_m: float = float(cfg_mod.PlotSpacing) * STUD * 0.42
	var offsets := [
		Vector3(-spacing_m * 0.55, 0, -spacing_m * 0.48),
		Vector3(spacing_m * 0.55, 0, -spacing_m * 0.48),
		Vector3(-spacing_m * 0.55, 0, spacing_m * 0.48),
		Vector3(spacing_m * 0.55, 0, spacing_m * 0.48),
	]
	for i in range(min(int(cfg_mod.PlotCount), offsets.size())):
		var col: Color = colors[i]
		var base := _make_box("Plot_%d" % (i + 1), offsets[i], Vector3(plot_size_m, 0.5, plot_size_m), Color(0.22, 0.24, 0.29), false)
		ws.add_child(base)
		var trim := _make_box("TeamPad_%d" % (i + 1), offsets[i] + Vector3(0, 0.35, -plot_size_m * 0.34), Vector3(plot_size_m * 0.72, 0.25, 1.4), col, true)
		ws.add_child(trim)
		# Conveyor + Dropper + Collector
		var conv := _make_box("Conveyor_%d" % (i + 1), offsets[i] + Vector3(-2.6, 0.4, 0.6), Vector3(1.6, 0.3, 6.2), Color(0.15, 0.16, 0.20), false)
		ws.add_child(conv)
		var drop := _make_box("Dropper_%d" % (i + 1), offsets[i] + Vector3(-2.6, 1.5, -2.0), Vector3(1.8, 1.6, 1.8), cfg_mod.DropperColors[i % 3], true)
		ws.add_child(drop)
		dropper_parts.append(drop)
		var collector := _make_box("Collector_%d" % (i + 1), offsets[i] + Vector3(-2.6, 0.9, 3.6), Vector3(2.2, 1.2, 1.6), Color(0.15, 0.85, 0.45), true)
		ws.add_child(collector)
		# Buy button + Turret pedestal
		var btn := _make_box("BuyButton_%d" % (i + 1), offsets[i] + Vector3(2.6, 0.42, 1.6), Vector3(1.8, 0.32, 1.8), Color(0.25, 0.95, 0.35), true)
		ws.add_child(btn)
		var turret := _make_box("Turret_%d" % (i + 1), offsets[i] + Vector3(plot_size_m * 0.36, 1.1, plot_size_m * 0.36), Vector3(1.1, 1.8, 1.1), col, false)
		ws.add_child(turret)
		plot_count_built += 1

	# Center battle arena floor
	var center := _make_box("CenterArena", Vector3(0, -0.35, 0), Vector3(spacing_m * 2.2, 0.4, spacing_m * 2.0), Color(0.16, 0.22, 0.18), false)
	ws.add_child(center)
	var cam := get_node("MainCamera") as Camera3D
	cam.position = Vector3(-16.0, 20.0, 26.0)
	cam.look_at(Vector3(0, 0.5, 0), Vector3.UP)

func _spawn_characters() -> void:
	var ws := RobloxCompat.get_workspace()
	player_character = _create_char("PlayerCharacter", Vector3(-6.0, 1.4, -5.0), Color(0.25, 0.65, 1.0))
	ws.add_child(player_character)
	RobloxCompat.register_player_character(player_character)
	enemy_character = _create_char("EnemyBot", Vector3(6.0, 1.4, -5.0), Color(0.95, 0.28, 0.28))
	ws.add_child(enemy_character)

func _create_char(c_name: String, pos: Vector3, tint: Color) -> CharacterBody3D:
	var ch := CharacterBody3D.new()
	ch.name = c_name
	ch.set_script(preload("res://addons/playforge_roblox_compat/roblox_humanoid_compat.gd"))
	ch.set_meta("roblox_class", "Model")
	ch.set_meta("roblox_name", c_name)
	ch.position = pos
	var col := CollisionShape3D.new()
	var cap := CapsuleShape3D.new()
	cap.radius = 0.38
	cap.height = 1.6
	col.shape = cap
	ch.add_child(col)
	var mesh := MeshInstance3D.new()
	var cm := CapsuleMesh.new()
	cm.radius = 0.38
	cm.height = 1.6
	var mat := StandardMaterial3D.new()
	mat.albedo_color = tint
	mat.emission_enabled = true
	mat.emission = tint
	mat.emission_energy_multiplier = 0.5
	cm.material = mat
	mesh.mesh = cm
	ch.add_child(mesh)
	var hum := Node.new()
	hum.name = "Humanoid"
	hum.set_script(HUMANOID_PROXY_SCRIPT)
	hum.set_meta("roblox_class", "Humanoid")
	hum.set_meta("roblox_name", "Humanoid")
	ch.add_child(hum)
	return ch

func _make_box(b_name: String, pos: Vector3, sz: Vector3, color: Color, neon: bool) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = b_name
	body.position = pos
	body.set_meta("roblox_class", "Part")
	body.set_meta("roblox_name", b_name)
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = sz
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	if neon:
		mat.emission_enabled = true
		mat.emission = color
		mat.emission_energy_multiplier = 1.15
	bm.material = mat
	mi.mesh = bm
	body.add_child(mi)
	var cs := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = sz
	cs.shape = bs
	body.add_child(cs)
	return body

func buy_item(player: Object, item_id: String) -> bool:
	for item in cfg_mod.Items:
		if item["id"] == item_id:
			if econ_mod.spend(player, int(item["price"])):
				bought_items[item_id] = true
				_update_hud("Bought %s" % item["name"])
				return true
	return false

func _physics_process(delta: float) -> void:
	_drop_timer += delta
	for d in dropper_parts:
		d.rotate_y(delta * 0.8)
	if _drop_timer >= float(cfg_mod.DropperInterval) and bought_items.has("dropper1"):
		_drop_timer = 0.0
		econ_mod.add(RobloxCompat.get_local_player(), 10)
		_update_hud("Dropper +$10")

func _update_hud(note: String = "") -> void:
	var pl := RobloxCompat.get_local_player()
	var cash := int(econ_mod.rbx_get(pl))
	var stats := RobloxCompat.find_first_child(pl, "leaderstats")
	var kills_node := RobloxCompat.find_first_child(stats, "Kills")
	var kills: int = int(kills_node.value) if kills_node != null else 0
	hud_label.text = "War Tycoon | Argent: $%d | Kills: %d | %s" % [cash, kills, note]
