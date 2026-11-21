class_name TanksUnit
extends RigidBody3D

## Port of TankMovement.cs + TankShooting.cs + TankHealth.cs + UIDirectionControl.cs
## Uses Unity original Tank.fbx, team color tinting, world-space health wheel & aim arrow,
## and converted EngineIdle/EngineDriving AIFF->WAV audio.

signal tank_destroyed(tank: TanksUnit)

@export var player_number: int = 1
@export var player_color: Color = Color(0.16, 0.42, 0.96, 1.0)
@export var move_speed: float = 12.0
@export var turn_speed: float = 160.0
@export var min_launch_force: float = 15.0
@export var max_launch_force: float = 30.0
@export var max_charge_time: float = 0.75
@export var starting_health: float = 100.0

var current_health: float = 100.0
var is_dead: bool = false
var control_enabled: bool = false
var current_launch_force: float = 15.0
var is_charging: bool = false
var charge_speed: float = 20.0
var spawn_position: Vector3 = Vector3.ZERO
var spawn_yaw_deg: float = 0.0

var synthetic_move: float = 0.0
var synthetic_turn: float = 0.0

var world_root: Node3D
var all_tanks: Array = []
var visual_root: Node3D
var health_ring_mat: ShaderMaterial
var aim_arrow_node: MeshInstance3D
var world_ui_pivot: Node3D
var engine_audio: AudioStreamPlayer
var shoot_audio: AudioStreamPlayer
var clip_idle: AudioStream
var clip_driving: AudioStream
var clip_charging: AudioStream
var clip_firing: AudioStream
var dust_particles: CPUParticles3D

func setup(p_num: int, p_color: Color, spawn_pos: Vector3, yaw_deg: float, w_root: Node3D, tanks_list: Array) -> void:
	player_number = p_num
	player_color = p_color
	spawn_position = spawn_pos
	spawn_yaw_deg = yaw_deg
	world_root = w_root
	all_tanks = tanks_list
	charge_speed = (max_launch_force - min_launch_force) / max_charge_time

	collision_layer = 2
	collision_mask = 7
	axis_lock_angular_x = true
	axis_lock_angular_z = true
	linear_damp = 4.0
	angular_damp = 6.0

	# Load Unity Tank.fbx and tint meshes with team color (TankManager.cs)
	visual_root = Node3D.new()
	visual_root.name = "TankVisual"
	add_child(visual_root)
	if ResourceLoader.exists("res://assets/models/Tank.tres"):
		var model := MeshInstance3D.new()
		model.mesh = load("res://assets/models/Tank.tres")
		# Rotate 180 so Unity +Z barrel aligns with Godot -Z forward
		model.rotation_degrees = Vector3(0, 180, 0)
		var tmat := StandardMaterial3D.new()
		tmat.albedo_color = player_color
		tmat.roughness = 0.42
		tmat.metallic = 0.18
		_tint_tank_meshes(model, tmat)
		visual_root.add_child(model)

	var col := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(1.8, 1.5, 2.2)
	col.shape = box
	col.position = Vector3(0, 0.75, 0)
	add_child(col)

	# World-space UI (Health Wheel + Aim Arrow) — UIDirectionControl keeps health ring upright
	_build_world_ui()
	_build_audio_and_dust()
	reset_tank()

func _tint_tank_meshes(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		for i in range(mi.get_surface_override_material_count()):
			mi.set_surface_override_material(i, mat)
	for c in node.get_children():
		_tint_tank_meshes(c, mat)

func _build_world_ui() -> void:
	world_ui_pivot = Node3D.new()
	world_ui_pivot.name = "WorldUI"
	world_ui_pivot.position = Vector3(0, 0.12, 0)
	add_child(world_ui_pivot)

	# Circular Health Wheel shader (green -> yellow -> red radial fill)
	var ring := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(3.6, 3.6)
	var sh := Shader.new()
	sh.code = """
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_opaque;
uniform float health_ratio = 1.0;
uniform vec4 fill_color : source_color = vec4(0.1, 0.92, 0.2, 1.0);
uniform vec4 bg_color : source_color = vec4(0.15, 0.15, 0.15, 0.45);
void fragment() {
	vec2 p = UV * 2.0 - vec2(1.0);
	float r = length(p);
	if (r < 0.74 || r > 0.96) discard;
	float ang = (atan(p.y, p.x) + 3.14159265) / 6.2831853;
	vec4 col = (ang <= health_ratio) ? fill_color : bg_color;
	ALBEDO = col.rgb;
	ALPHA = col.a;
}
"""
	health_ring_mat = ShaderMaterial.new()
	health_ring_mat.shader = sh
	ring.mesh = qm
	ring.material_override = health_ring_mat
	ring.rotation_degrees = Vector3(-90, 0, 0)
	world_ui_pivot.add_child(ring)

	# Aim Arrow (stretches ahead of tank during shot charging)
	aim_arrow_node = MeshInstance3D.new()
	var am := QuadMesh.new()
	am.size = Vector2(1.2, 2.8)
	var amat := StandardMaterial3D.new()
	amat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	amat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	amat.albedo_color = Color(1.0, 0.88, 0.15, 0.92)
	if ResourceLoader.exists("res://assets/sprites/Aim_Arrow.tres"):
		amat.albedo_texture = load("res://assets/sprites/Aim_Arrow.tres")
	aim_arrow_node.mesh = am
	aim_arrow_node.material_override = amat
	aim_arrow_node.rotation_degrees = Vector3(-90, 0, 0)
	aim_arrow_node.position = Vector3(0, 0.25, -2.8)
	aim_arrow_node.visible = false
	add_child(aim_arrow_node)

func _build_audio_and_dust() -> void:
	engine_audio = AudioStreamPlayer.new()
	engine_audio.volume_db = -18.0
	add_child(engine_audio)
	shoot_audio = AudioStreamPlayer.new()
	shoot_audio.volume_db = -10.0
	add_child(shoot_audio)

	if ResourceLoader.exists("res://assets/audio/EngineIdle.tres"):
		clip_idle = load("res://assets/audio/EngineIdle.tres")
	if ResourceLoader.exists("res://assets/audio/EngineDriving.tres"):
		clip_driving = load("res://assets/audio/EngineDriving.tres")
	if ResourceLoader.exists("res://assets/audio/ShotCharging.tres"):
		clip_charging = load("res://assets/audio/ShotCharging.tres")
	if ResourceLoader.exists("res://assets/audio/ShotFiring.tres"):
		clip_firing = load("res://assets/audio/ShotFiring.tres")

	dust_particles = CPUParticles3D.new()
	dust_particles.position = Vector3(0, 0.2, 1.1)
	dust_particles.amount = 14
	dust_particles.lifetime = 0.55
	dust_particles.gravity = Vector3(0, 0.8, 0)
	dust_particles.initial_velocity_min = 0.6
	dust_particles.initial_velocity_max = 1.6
	var dmesh := QuadMesh.new()
	dmesh.size = Vector2(0.55, 0.55)
	var dmat := StandardMaterial3D.new()
	dmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	dmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dmat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	dmat.albedo_color = Color(0.95, 0.78, 0.45, 0.55)
	dmesh.material = dmat
	dust_particles.mesh = dmesh
	add_child(dust_particles)

func reset_tank() -> void:
	is_dead = false
	visible = true
	freeze = false
	current_health = starting_health
	current_launch_force = min_launch_force
	is_charging = false
	linear_velocity = Vector3.ZERO
	angular_velocity = Vector3.ZERO
	global_position = spawn_position
	rotation_degrees = Vector3(0, spawn_yaw_deg, 0)
	if aim_arrow_node:
		aim_arrow_node.visible = false
	_update_health_ui()
	if dust_particles:
		dust_particles.emitting = true

func _update_health_ui() -> void:
	if health_ring_mat == null:
		return
	var ratio := clampf(current_health / starting_health, 0.0, 1.0)
	health_ring_mat.set_shader_parameter("health_ratio", ratio)
	var col := Color(0.92, 0.12, 0.1, 1.0).lerp(Color(0.12, 0.92, 0.18, 1.0), ratio)
	health_ring_mat.set_shader_parameter("fill_color", col)

func set_charge_visual(ratio: float) -> void:
	if aim_arrow_node == null:
		return
	aim_arrow_node.visible = ratio > 0.02
	var len_scale := 0.8 + ratio * 1.4
	aim_arrow_node.scale = Vector3(1.0, len_scale, 1.0)
	aim_arrow_node.position = Vector3(0, 0.25, -2.2 - ratio * 1.5)

func fire_shell(launch_force_override: float = -1.0) -> TanksShell:
	if is_dead or world_root == null:
		return null
	var force := launch_force_override if launch_force_override > 0.0 else current_launch_force
	var forward := -global_transform.basis.z.normalized()
	var muzzle := global_position + Vector3(0, 1.45, 0) + forward * 1.6
	# Slight upward pitch matching Unity FireTransform (~10 deg elevation)
	var launch_dir := (forward + Vector3(0, 0.22, 0)).normalized()

	var shell := TanksShell.new()
	world_root.add_child(shell)
	shell.setup(muzzle, launch_dir * force, self, all_tanks)

	if shoot_audio and clip_firing:
		shoot_audio.stream = clip_firing
		shoot_audio.play()

	is_charging = false
	current_launch_force = min_launch_force
	set_charge_visual(0.0)
	return shell

func take_damage(amount: float) -> void:
	if is_dead or amount <= 0.0:
		return
	current_health = max(0.0, current_health - amount)
	_update_health_ui()
	if current_health <= 0.0:
		_on_death()

func _on_death() -> void:
	is_dead = true
	control_enabled = false
	visible = false
	freeze = true
	if dust_particles:
		dust_particles.emitting = false
	TanksShell.spawn_explosion_vfx(world_root, global_position, 1.65, "res://assets/audio/TankExplosion.tres")
	tank_destroyed.emit(self)

func _physics_process(delta: float) -> void:
	# UIDirectionControl: keep health ring world-aligned
	if world_ui_pivot:
		world_ui_pivot.global_rotation = Vector3.ZERO

	if is_dead or not control_enabled:
		return

	var move_in := synthetic_move
	var turn_in := synthetic_turn
	if move_in == 0.0 and turn_in == 0.0:
		if player_number == 1:
			move_in = (1.0 if Input.is_key_pressed(KEY_W) else 0.0) - (1.0 if Input.is_key_pressed(KEY_S) else 0.0)
			turn_in = (1.0 if Input.is_key_pressed(KEY_A) else 0.0) - (1.0 if Input.is_key_pressed(KEY_D) else 0.0)
		else:
			move_in = (1.0 if Input.is_key_pressed(KEY_UP) else 0.0) - (1.0 if Input.is_key_pressed(KEY_DOWN) else 0.0)
			turn_in = (1.0 if Input.is_key_pressed(KEY_LEFT) else 0.0) - (1.0 if Input.is_key_pressed(KEY_RIGHT) else 0.0)

	if abs(turn_in) > 0.05:
		rotate_y(deg_to_rad(turn_in * turn_speed * delta))
	if abs(move_in) > 0.05:
		var fwd := -global_transform.basis.z
		linear_velocity.x = fwd.x * move_in * move_speed
		linear_velocity.z = fwd.z * move_in * move_speed
		if engine_audio and clip_driving and engine_audio.stream != clip_driving:
			engine_audio.stream = clip_driving
			engine_audio.pitch_scale = randf_range(0.85, 1.15)
			engine_audio.play()
	else:
		if engine_audio and clip_idle and engine_audio.stream != clip_idle:
			engine_audio.stream = clip_idle
			engine_audio.pitch_scale = randf_range(0.9, 1.1)
			engine_audio.play()

	# Charge & Fire input
	var fire_key := KEY_SPACE if player_number == 1 else KEY_ENTER
	if Input.is_key_pressed(fire_key):
		if not is_charging:
			is_charging = true
			current_launch_force = min_launch_force
			if shoot_audio and clip_charging:
				shoot_audio.stream = clip_charging
				shoot_audio.play()
		current_launch_force += charge_speed * delta
		var ratio := clampf((current_launch_force - min_launch_force) / (max_launch_force - min_launch_force), 0.0, 1.0)
		set_charge_visual(ratio)
		if current_launch_force >= max_launch_force:
			fire_shell(max_launch_force)
	elif is_charging:
		fire_shell(current_launch_force)
