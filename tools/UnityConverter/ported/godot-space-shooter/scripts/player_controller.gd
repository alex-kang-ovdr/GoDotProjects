class_name SpacePlayer
extends Area3D

## Port of Assets/Scripts/PlayerController.cs
## Uses original Unity FBX vehicle_playerShip.FBX + converted PNG diffuse/normal maps.

@export var speed: float = 10.0
@export var tilt: float = 4.0
@export var fire_rate: float = 0.25
@export var x_min: float = -5.5
@export var x_max: float = 5.5
@export var z_min: float = -6.0
@export var z_max: float = 7.0

var next_fire: float = 0.0
var elapsed: float = 0.0
var alive: bool = true
var synthetic_input: Vector2 = Vector2.ZERO
var game_controller: SpaceGameController
var weapon_sfx: AudioStreamPlayer
var ship_visual: Node3D

func setup(controller: SpaceGameController) -> void:
	game_controller = controller
	set_meta("unity_tag", "Player")

	# Load Unity original FBX player ship and apply converted TIFF->PNG material
	if ResourceLoader.exists("res://assets/models/vehicle_playerShip.FBX"):
		var fbx_scene: PackedScene = load("res://assets/models/vehicle_playerShip.FBX")
		ship_visual = fbx_scene.instantiate()
		# Unity LH +Z forward -> rotate 180 deg Y in Godot RH so nose points to -Z (up)
		ship_visual.rotation_degrees = Vector3(0, 180, 0)
		_apply_ship_material(ship_visual)
		add_child(ship_visual)

	# Engine jet glow sprite
	var jet := MeshInstance3D.new()
	var jm := QuadMesh.new()
	jm.size = Vector2(1.2, 2.2)
	var jmat := StandardMaterial3D.new()
	jmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	jmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	jmat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	if ResourceLoader.exists("res://assets/textures/part_jet_flare_dff.png"):
		jmat.albedo_texture = load("res://assets/textures/part_jet_flare_dff.png")
	jet.mesh = jm
	jet.material_override = jmat
	jet.rotation_degrees = Vector3(-90, 0, 0)
	jet.position = Vector3(0, 0, 1.35)
	add_child(jet)

	var col := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1.5, 1.0, 1.8)
	col.shape = box
	add_child(col)

	weapon_sfx = AudioStreamPlayer.new()
	if ResourceLoader.exists("res://assets/audio/weapon_player.wav"):
		weapon_sfx.stream = load("res://assets/audio/weapon_player.wav")
	add_child(weapon_sfx)

func _apply_ship_material(root: Node) -> void:
	var mat := StandardMaterial3D.new()
	if ResourceLoader.exists("res://assets/textures/vehicle_playerShip_orange_dff.png"):
		mat.albedo_texture = load("res://assets/textures/vehicle_playerShip_orange_dff.png")
	if ResourceLoader.exists("res://assets/textures/vehicle_playerShip_orange_nrm.png"):
		mat.normal_enabled = true
		mat.normal_texture = load("res://assets/textures/vehicle_playerShip_orange_nrm.png")
	mat.metallic = 0.35
	mat.roughness = 0.4
	_override_meshes(root, mat)

func _override_meshes(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		(node as MeshInstance3D).material_override = mat
	for c in node.get_children():
		_override_meshes(c, mat)

func fire_bolt() -> SpaceMover:
	if not alive or game_controller == null:
		return null
	next_fire = elapsed + fire_rate
	if weapon_sfx and weapon_sfx.stream:
		weapon_sfx.play()
	return game_controller.spawn_player_bolt(position + Vector3(0, 0, -1.4))

func _process(delta: float) -> void:
	if not alive:
		return
	elapsed += delta

	var move_h := Input.get_axis("ui_left", "ui_right")
	var move_v := Input.get_axis("ui_down", "ui_up")
	if synthetic_input != Vector2.ZERO:
		move_h = synthetic_input.x
		move_v = synthetic_input.y

	var vel_x := move_h * speed
	var vel_z := -move_v * speed
	position.x = clamp(position.x + vel_x * delta, x_min, x_max)
	position.z = clamp(position.z + vel_z * delta, z_min, z_max)

	# Unity: rigidbody.rotation = Quaternion.Euler(0, 0, vel.x * -tilt)
	rotation_degrees = Vector3(0.0, 0.0, vel_x * -tilt)

	if (Input.is_action_pressed("ui_accept") or Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)) and elapsed >= next_fire:
		fire_bolt()
