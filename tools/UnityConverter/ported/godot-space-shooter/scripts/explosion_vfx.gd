class_name SpaceExplosionVfx
extends Node3D

## Port of Assets/Scripts/DestroyByTime.cs + Unity Explosion particle burst

@export var lifetime: float = 1.6

func setup(pos: Vector3, scale_factor: float = 1.0, sound_path: String = "") -> void:
	position = pos

	var particles := CPUParticles3D.new()
	particles.one_shot = true
	particles.explosiveness = 0.92
	particles.amount = 28
	particles.lifetime = 0.75
	particles.spread = 180.0
	particles.gravity = Vector3.ZERO
	particles.initial_velocity_min = 3.0 * scale_factor
	particles.initial_velocity_max = 8.5 * scale_factor

	var quad := QuadMesh.new()
	quad.size = Vector2(1.4 * scale_factor, 1.4 * scale_factor)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.albedo_color = Color(1.0, 0.72, 0.25, 1.0)
	if ResourceLoader.exists("res://assets/textures/part_flash_dff.png"):
		mat.albedo_texture = load("res://assets/textures/part_flash_dff.png")
	quad.material = mat
	particles.mesh = quad
	add_child(particles)
	particles.emitting = true

	# Shockwave ring flash
	var ring := MeshInstance3D.new()
	var ring_mesh := QuadMesh.new()
	ring_mesh.size = Vector2(3.2 * scale_factor, 3.2 * scale_factor)
	var ring_mat := StandardMaterial3D.new()
	ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	ring_mat.albedo_color = Color(1.0, 0.65, 0.2, 0.9)
	if ResourceLoader.exists("res://assets/textures/part_shockwave_dff.png"):
		ring_mat.albedo_texture = load("res://assets/textures/part_shockwave_dff.png")
	ring.mesh = ring_mesh
	ring.material_override = ring_mat
	ring.rotation_degrees = Vector3(-90, 0, 0)
	add_child(ring)
	var tw := create_tween()
	tw.tween_property(ring, "scale", Vector3(2.2, 2.2, 2.2), 0.35)
	tw.parallel().tween_property(ring_mat, "albedo_color:a", 0.0, 0.35)

	if sound_path != "" and ResourceLoader.exists(sound_path):
		var sfx := AudioStreamPlayer.new()
		sfx.stream = load(sound_path)
		add_child(sfx)
		sfx.play()

	get_tree().create_timer(lifetime).timeout.connect(queue_free)
