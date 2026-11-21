class_name TanksShell
extends RigidBody3D

## Port of Assets/_Completed-Assets/Scripts/Shell/ShellExplosion.cs
## Ballistic 3D shell with OverlapSphere distance-falloff damage & explosion impulse.

@export var max_damage: float = 100.0
@export var explosion_force: float = 18.0
@export var max_life_time: float = 2.5
@export var explosion_radius: float = 5.5

var exploded: bool = false
var owner_tank: TanksUnit = null
var all_tanks: Array = []

func setup(spawn_pos: Vector3, launch_vel: Vector3, shooter: TanksUnit, tanks_ref: Array) -> void:
	owner_tank = shooter
	all_tanks = tanks_ref
	position = spawn_pos
	linear_velocity = launch_vel
	gravity_scale = 1.6
	contact_monitor = true
	max_contacts_reported = 4
	collision_layer = 4
	collision_mask = 3 # Ground/Obstacles (1) + Tanks (2)

	# Load Unity Shell.fbx model
	if ResourceLoader.exists("res://assets/models/Shell.fbx"):
		var s_vis := (load("res://assets/models/Shell.fbx") as PackedScene).instantiate() as Node3D
		s_vis.scale = Vector3(1.2, 1.2, 1.2)
		var smat := StandardMaterial3D.new()
		smat.albedo_color = Color(0.18, 0.16, 0.14, 1.0)
		smat.metallic = 0.6
		smat.roughness = 0.35
		_tint_meshes(s_vis, smat)
		add_child(s_vis)

	var col := CollisionShape3D.new()
	var sph := SphereShape3D.new()
	sph.radius = 0.32
	col.shape = sph
	add_child(col)

	body_entered.connect(_on_body_entered)
	get_tree().create_timer(max_life_time).timeout.connect(func():
		if is_instance_valid(self) and not exploded:
			queue_free()
	)

func _tint_meshes(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		(node as MeshInstance3D).material_override = mat
	for c in node.get_children():
		_tint_meshes(c, mat)

func _physics_process(_delta: float) -> void:
	if linear_velocity.length_squared() > 0.5:
		look_at(global_position + linear_velocity.normalized(), Vector3.UP)
	if global_position.y <= 0.15 and not exploded:
		explode()

func _on_body_entered(body: Node) -> void:
	if exploded or body == owner_tank:
		return
	explode()

func calculate_damage(target_pos: Vector3) -> float:
	var dist := target_pos.distance_to(global_position)
	var rel := (explosion_radius - dist) / explosion_radius
	return max(0.0, rel * max_damage)

func explode() -> void:
	if exploded:
		return
	exploded = true

	# OverlapSphere equivalent over active tanks
	for t in all_tanks:
		if not is_instance_valid(t) or t.is_dead:
			continue
		var dist: float = t.global_position.distance_to(global_position)
		if dist <= explosion_radius:
			var dmg := calculate_damage(t.global_position)
			var push_dir: Vector3 = (t.global_position - global_position)
			push_dir.y = 0.45
			if push_dir.length_squared() < 0.01:
				push_dir = Vector3.UP
			var falloff: float = maxf(0.2, 1.0 - dist / explosion_radius)
			t.apply_central_impulse(push_dir.normalized() * explosion_force * falloff)
			t.take_damage(dmg)

	# Spawn detached 3D explosion VFX + audio
	TanksShell.spawn_explosion_vfx(get_parent(), global_position, 1.0, "res://assets/audio/ShellExplosion.wav")
	queue_free()

static func spawn_explosion_vfx(parent_node: Node, pos: Vector3, scale_mul: float, audio_path: String) -> void:
	if parent_node == null:
		return
	var vfx := Node3D.new()
	vfx.position = pos + Vector3(0, 0.4, 0)
	parent_node.add_child(vfx)

	# Fireball core sphere flash
	var core := MeshInstance3D.new()
	var sm := SphereMesh.new()
	sm.radius = 1.15 * scale_mul
	sm.height = 2.3 * scale_mul
	var cmat := StandardMaterial3D.new()
	cmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	cmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	cmat.albedo_color = Color(1.0, 0.78, 0.22, 0.95)
	core.mesh = sm
	core.material_override = cmat
	vfx.add_child(core)
	var tw := vfx.create_tween()
	tw.tween_property(core, "scale", Vector3(2.3, 2.3, 2.3), 0.35)
	tw.parallel().tween_property(cmat, "albedo_color:a", 0.0, 0.35)

	# Smoke & fire particles using converted Smoke.tif -> Smoke.png
	var p := CPUParticles3D.new()
	p.one_shot = true
	p.explosiveness = 0.9
	p.amount = int(28 * scale_mul)
	p.lifetime = 0.85
	p.spread = 180.0
	p.gravity = Vector3(0, 3.5, 0)
	p.initial_velocity_min = 3.5 * scale_mul
	p.initial_velocity_max = 9.0 * scale_mul
	var qm := QuadMesh.new()
	qm.size = Vector2(1.5 * scale_mul, 1.5 * scale_mul)
	var pmat := StandardMaterial3D.new()
	pmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	pmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	pmat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	pmat.albedo_color = Color(1.0, 0.55, 0.15, 0.9)
	if ResourceLoader.exists("res://assets/sprites/Smoke.png"):
		pmat.albedo_texture = load("res://assets/sprites/Smoke.png")
	qm.material = pmat
	p.mesh = qm
	vfx.add_child(p)
	p.emitting = true

	if ResourceLoader.exists(audio_path):
		var sfx := AudioStreamPlayer.new()
		sfx.stream = load(audio_path)
		sfx.volume_db = -6.0
		vfx.add_child(sfx)
		sfx.play()

	vfx.get_tree().create_timer(1.4).timeout.connect(vfx.queue_free)
