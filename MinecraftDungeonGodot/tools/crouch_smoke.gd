extends SceneTree

var failures: Array[String] = []
var assertions := 0
var output_directory := "res://Saved/Verification/crouch"
var player: VoxelPlayer
var world: VoxelWorld


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	player = instance.get_node("Player") as VoxelPlayer
	world = instance.get_node("VoxelWorld") as VoxelWorld
	player.set_physics_process(false)
	# Isolated voxel platform above the generated world; a 1.55-high physics
	# tunnel exercises fractional clearance needed by future slabs/structures.
	for x in range(-3, 4):
		for z in range(-12, 3): world.set_cell_item(Vector3i(x, 70, z), BlockRegistry.BRICK)
	world.rebuild_dirty()
	var roof := StaticBody3D.new()
	roof.position = Vector3(0.5, 72.65, -5.0)
	var collision := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(5, 0.2, 6)
	collision.shape = box
	roof.add_child(collision)
	var visible_roof := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = box.size
	visible_roof.mesh = mesh
	roof.add_child(visible_roof)
	root.add_child(roof)
	await _teleport(Vector3(0.5, 71.02, 0.5))
	_key(KEY_W, true)
	await _frames(80)
	_key(KEY_W, false)
	_expect(player.global_position.z > -2.0, "standing capsule cannot enter 1.55-high tunnel")
	var feet_before := player.global_position.y
	_key(KEY_SHIFT, true)
	await _frames(3)
	_expect(player.crouched and is_equal_approx(player.body_capsule.height, 1.5), "Shift changes actual capsule height")
	_expect(absf(player.global_position.y - feet_before) < 0.03, "crouch preserves grounded feet")
	_expect(is_equal_approx(player.camera.position.y, 1.27), "crouch lowers eye height")
	_key(KEY_CTRL, true)
	_key(KEY_W, true)
	await _frames(160)
	_key(KEY_W, false)
	_key(KEY_CTRL, false)
	await _frames(5)
	_expect(player.global_position.z < -4.0 and player.global_position.z > -7.0, "crouch moves through tunnel at sneak speed even with Ctrl")
	_key(KEY_SHIFT, false)
	await _frames(10)
	_expect(player.crouched and not player.can_stand(), "releasing Shift under ceiling cannot stand into geometry")
	_expect(player.global_position.y + player.body_capsule.height < 72.55, "crouched body stays below roof")
	var saved := world.chunk_store.encode(player.capture_state())
	player.set_physics_process(false)
	player.global_position = Vector3(0.5, 71.02, 1.0)
	player._set_stance(false)
	_expect(world.apply_saved_game(saved, player).ok and player.crouched, "checkpoint restores crouched pose")
	player.set_physics_process(true)
	await _frames(5)
	_expect(player.crouched and not player.can_stand(), "loaded posture remains safe with Shift released")
	for invalid in [1, "true", null, []]:
		var bad := player.capture_state()
		bad.crouched = invalid
		var before := player.capture_state()
		_expect(not player.restore_state(bad) and player.capture_state() == before, "malformed posture rejected atomically")
	if DisplayServer.get_name() != "headless":
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
		await RenderingServer.frame_post_draw
		_expect(root.get_texture().get_image().save_png(output_directory.path_join("crouch.png")) == OK, "low tunnel view captured")
	_key(KEY_W, true)
	var exit_frames := 0
	while (player.crouched or player.global_position.z > -8.35) and exit_frames < 260:
		await physics_frame
		exit_frames += 1
	_key(KEY_W, false)
	await _frames(4)
	_expect(not player.crouched and player.global_position.z < -8.0, "standing resumes automatically after leaving ceiling")
	_expect(is_equal_approx(player.body_capsule.height, 1.8) and is_equal_approx(player.camera.position.y, 1.62), "standing body and eye restore")
	for rate in [30, 60, 120]:
		Engine.physics_ticks_per_second = rate
		await _teleport(Vector3(3.3, 71.02, 2.3))
		_key(KEY_SHIFT, true)
		_key(KEY_D, true)
		_key(KEY_S, true)
		await _frames(rate * 2)
		_key(KEY_D, false)
		_key(KEY_S, false)
		_expect(player.global_position.x < 4.01 and player.global_position.z < 3.01 and player.global_position.y > 70.9 and player.is_on_floor(), "diagonal ledge guard holds at %d Hz" % rate)
		print("CROUCH LEDGE rate=%d position=%s" % [rate, player.global_position])
		_key(KEY_SHIFT, false)
	Engine.physics_ticks_per_second = 60
	_key(KEY_S, true)
	await _frames(40)
	_key(KEY_S, false)
	_expect(player.global_position.z > 3.3 and player.global_position.y < 70.7, "releasing crouch permits walking off edge")
	await _teleport(Vector3(3.6, 71.02, 1.0))
	_key(KEY_SHIFT, true)
	_key(KEY_D, true)
	_key(KEY_SPACE, true)
	await _frames(35)
	_key(KEY_SPACE, false)
	_key(KEY_D, false)
	_key(KEY_SHIFT, false)
	_expect(player.global_position.x > 4.1, "intentional crouched jump can leave ledge")
	await _teleport(Vector3(-1.5, 71.02, 1.5))
	_key(KEY_SHIFT, true)
	await _frames(3)
	_expect(world.remove_cell_for_inventory(Vector3i(-2, 70, 1), player.inventory), "support block can be mined while crouched")
	world.rebuild_dirty()
	await _frames(30)
	_expect(player.global_position.y < 70.5 and not player.is_on_floor(), "ledge guard does not suspend player after support is removed")
	_key(KEY_SHIFT, false)
	player.set_physics_process(false)
	player._set_stance(true)
	_expect(player.return_to_spawn() and not player.crouched, "R safely resets posture at entrance")
	var legacy := player.capture_state()
	legacy.erase("crouched")
	player._set_stance(true)
	_expect(player.restore_state(legacy) and not player.crouched, "legacy checkpoint defaults to standing")
	for failure in failures: push_error(failure)
	print("CROUCH SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _teleport(position: Vector3) -> void:
	player.set_physics_process(false)
	player._set_stance(false)
	player.global_position = position
	player.velocity = Vector3.ZERO
	player.rotation = Vector3.ZERO
	player.pitch = 0.0
	player.camera.rotation.x = 0.0
	await _frames(4)
	player.set_physics_process(true)
	await _frames(8)


func _frames(count: int) -> void:
	for unused in count: await physics_frame


func _key(code: Key, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = pressed
	Input.parse_input_event(event)


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
