extends Node3D

const HUMANOID_PROXY_SCRIPT := preload("res://humanoid_proxy.gd")

var player_character: CharacterBody3D = null
var hud_label: Label = null
var cfg_mod: Node = null
var formulas_mod: Node = null
var zone_count_built: int = 0
var bag_nodes: Array[Node3D] = []
var player_state: Dictionary = { "power": 0, "coins": 0, "gearLevel": 0, "rebirths": 0, "zoneMultiplier": 1, "hasDoublePower": false, "hasDoubleCoins": false }

func _ready() -> void:
	RobloxCompat.bind_place_root(self)
	cfg_mod = get_node("Modules/Config")
	formulas_mod = get_node("Modules/Formulas")
	hud_label = get_node("HUD/StatusLabel") as Label
	_build_zones()
	_spawn_player()
	# Explicitly initialize X-grade MarketplaceService & DataStoreService stubs
	var _mp := RobloxCompat.get_marketplace_stub()
	var _ds := RobloxCompat.get_datastore_stub("PowerPunch_PlayerData")
	_update_hud()

func _build_zones() -> void:
	var ws := RobloxCompat.get_workspace()
	var zones: Array = cfg_mod.Zones
	for i in range(zones.size()):
		var z: Dictionary = zones[i]
		var x_pos := -16.5 + float(i) * 11.0
		var floor_node := _make_box("Zone_" + str(z["name"]), Vector3(x_pos, 0, 0), Vector3(10.0, 0.8, 12.0), z["floorColor"], false)
		ws.add_child(floor_node)
		var pad := _make_box("Pad_" + str(z["name"]), Vector3(x_pos, 0.52, -2.5), Vector3(5.2, 0.3, 4.0), z["accentColor"], true)
		ws.add_child(pad)
		var bag := _make_box("Bag_" + str(z["name"]), Vector3(x_pos, 1.9, 2.2), Vector3(1.1, 2.8, 1.1), z["accentColor"], true)
		ws.add_child(bag)
		bag_nodes.append(bag)
		zone_count_built += 1
	# VIP Island south of Beach
	var vip: Dictionary = cfg_mod.VipZone
	var vip_island := _make_box("Zone_VIP_Island", Vector3(-16.5, 0.4, 13.5), Vector3(9.0, 0.8, 8.0), vip["floorColor"], false)
	ws.add_child(vip_island)
	var vip_pad := _make_box("Pad_VIP", Vector3(-16.5, 0.92, 13.5), Vector3(4.5, 0.3, 4.5), vip["accentColor"], true)
	ws.add_child(vip_pad)
	zone_count_built += 1
	var cam := get_node("MainCamera") as Camera3D
	cam.position = Vector3(-4.0, 16.0, 26.0)
	cam.look_at(Vector3(-2.0, 0.5, 2.0), Vector3.UP)

func _spawn_player() -> void:
	var ws := RobloxCompat.get_workspace()
	player_character = CharacterBody3D.new()
	player_character.name = "PlayerCharacter"
	player_character.set_script(preload("res://addons/playforge_roblox_compat/roblox_humanoid_compat.gd"))
	player_character.position = Vector3(-16.5, 1.8, -2.5)
	var mesh := MeshInstance3D.new()
	var cm := CapsuleMesh.new()
	cm.radius = 0.42
	cm.height = 1.65
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.85, 0.25)
	mat.emission_enabled = true
	mat.emission = Color(1.0, 0.72, 0.15)
	mat.emission_energy_multiplier = 0.7
	cm.material = mat
	mesh.mesh = cm
	player_character.add_child(mesh)
	ws.add_child(player_character)
	RobloxCompat.register_player_character(player_character)

func _make_box(b_name: String, pos: Vector3, sz: Vector3, color: Color, neon: bool) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = b_name
	body.position = pos
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

func perform_punch() -> Dictionary:
	var gained: int = int(formulas_mod.powerPerPunch(player_state))
	var coins: int = int(formulas_mod.coinsForPower(gained, player_state["hasDoubleCoins"]))
	player_state["power"] = int(player_state["power"]) + gained
	player_state["coins"] = int(player_state["coins"]) + coins
	_update_hud()
	return { "powerGained": gained, "coinsGained": coins }

func _physics_process(delta: float) -> void:
	for b in bag_nodes:
		b.rotate_y(delta * 0.9)

func _update_hud() -> void:
	var p_str: String = str(formulas_mod.abbreviate(player_state["power"]))
	var c_str: String = str(formulas_mod.abbreviate(player_state["coins"]))
	var r_cost: String = str(formulas_mod.abbreviate(formulas_mod.rebirthCost(player_state["rebirths"])))
	hud_label.text = "Power Punch Sim | Power: %s | Coins: %s | Gear: Lv.%d | Next Rebirth: %s" % [p_str, c_str, int(player_state["gearLevel"]), r_cost]
