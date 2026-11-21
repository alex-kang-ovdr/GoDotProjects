extends Node3D

const CONVERTED_SCRIPT_PATHS: Array[String] = [
	"Workspace/Disappearing/Disapearing",
	"ServerScriptService/Motion",
	"ServerScriptService/Checkpoints",
	"ServerScriptService/LavaObstacles",
	"ServerScriptService/Teleport",
	"ServerScriptService/ChaosFeatures",
	"StarterGui/ChaosHUD/TimerLabel/Timer"
]

const CAMERA_TARGET := Vector3(9.24, 0.35, 0)
const HUMANOID_PROXY_SCRIPT := preload("res://humanoid_proxy.gd")

var player_character: CharacterBody3D = null
var converted_scripts: Array[Node] = []

func _ready() -> void:
	var cam := get_node_or_null("MainCamera") as Camera3D
	if cam != null:
		cam.look_at(CAMERA_TARGET, Vector3.UP)
	RobloxCompat.bind_place_root(self)
	_spawn_playable_character()
	for rel_path in CONVERTED_SCRIPT_PATHS:
		var node := get_node_or_null(rel_path)
		if node != null and node.has_method("run_script"):
			converted_scripts.append(node)
			node.call("run_script", node.get_parent())
	RobloxCompat.notify_initial_players()

func _spawn_playable_character() -> void:
	var ws := RobloxCompat.get_workspace()
	if ws == null:
		return
	player_character = CharacterBody3D.new()
	player_character.name = "PlayerCharacter"
	player_character.set_script(preload("res://addons/playforge_roblox_compat/roblox_humanoid_compat.gd"))
	player_character.set_meta("roblox_class", "Model")
	player_character.set_meta("roblox_name", "PlayerCharacter")

	var col := CollisionShape3D.new()
	col.name = "_CharCollision"
	col.set_meta("roblox_internal", true)
	var cap := CapsuleShape3D.new()
	cap.radius = 0.35
	cap.height = 1.5
	col.shape = cap
	player_character.add_child(col)

	var mesh := MeshInstance3D.new()
	mesh.name = "_CharMesh"
	mesh.set_meta("roblox_internal", true)
	var cap_mesh := CapsuleMesh.new()
	cap_mesh.radius = 0.35
	cap_mesh.height = 1.5
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.95, 0.96, 1.0)
	mat.emission_enabled = true
	mat.emission = Color(0.25, 0.55, 0.95)
	mat.emission_energy_multiplier = 0.45
	cap_mesh.material = mat
	mesh.mesh = cap_mesh
	player_character.add_child(mesh)

	var hrp := Node3D.new()
	hrp.name = "HumanoidRootPart"
	hrp.set_meta("roblox_class", "Part")
	hrp.set_meta("roblox_name", "HumanoidRootPart")
	player_character.add_child(hrp)

	var hum := Node.new()
	hum.name = "Humanoid"
	hum.set_script(HUMANOID_PROXY_SCRIPT)
	hum.set_meta("roblox_class", "Humanoid")
	hum.set_meta("roblox_name", "Humanoid")
	player_character.add_child(hum)

	var spawn_node := RobloxCompat.find_first_child_of_class(ws, "SpawnLocation", true)
	var spawn_origin := Vector3(0, 2.0, 0)
	if spawn_node is Node3D:
		spawn_origin = RobloxCompat.get_cframe(spawn_node).origin + Vector3(0, 1.4, 0)
	player_character.position = spawn_origin
	ws.add_child(player_character)
	RobloxCompat.register_player_character(player_character)
