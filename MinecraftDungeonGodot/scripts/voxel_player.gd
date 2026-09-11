class_name VoxelPlayer
extends CharacterBody3D

signal selection_changed(slot: int)
signal action_feedback(message: String)
signal challenge_changed
signal debug_visibility_changed
signal stance_changed(crouched: bool)
signal debug_workbench_requested

const WALK_SPEED := 4.317
const SPRINT_SPEED := 5.612
const JUMP_VELOCITY := 6.2
const MOUSE_SENSITIVITY := 0.0022
const MINE_TARGET := 8
const PLACE_TARGET := 4
const CROUCH_SPEED := 1.295
const STANDING_HEIGHT := 1.8
const CROUCH_HEIGHT := 1.5
const STANDING_EYE := 1.62
const CROUCH_EYE := 1.27

var inventory := BlockInventory.new(8)
var selected_slot := 0
var world: VoxelWorld
var camera: Camera3D
var pitch := 0.0
var total_mined := 0
var total_placed := 0
var cheat_hud_visible := false
var performance_hud_visible := false
var voxel_debug_visible := false
var last_profile_path := ""
var profile_directory := "user://Profiles"
var crouched := false
var body_collision: CollisionShape3D
var body_capsule: CapsuleShape3D
var standing_probe: CapsuleShape3D
var controls_open := false:
	set(value):
		controls_open = value
		if value: cancel_mining()
var mining_tools := MiningTools.new()
var survival := SurvivalState.new()
var mining_held := false
var mining_elapsed := 0.0
var mining_duration := 0.0
var mining_cell := Vector3i.ZERO
var mining_material := -1
var mining_serial := -1


func _ready() -> void:
	_build_body()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func setup(target_world: VoxelWorld) -> void:
	mining_tools.inventory = inventory
	world = target_world
	world.drops.player = self
	global_position = world.spawn_position()
	rotation_degrees.y = 24.0
	pitch = deg_to_rad(-12.0)
	camera.rotation.x = pitch
	world.action_feedback.connect(func(message: String) -> void: action_feedback.emit(message))
	world.block_mined.connect(_on_block_mined)
	world.block_placed.connect(_on_block_placed)
	world.generation_completed.connect(_reset_for_world)


func _unhandled_input(event: InputEvent) -> void:
	if controls_open or (world != null and world.gameplay_locked()):
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		rotate_y(-event.relative.x * MOUSE_SENSITIVITY)
		pitch = clampf(pitch - event.relative.y * MOUSE_SENSITIVITY, deg_to_rad(-89.0), deg_to_rad(89.0))
		camera.rotation.x = pitch
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE:
			cancel_mining()
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if Input.mouse_mode == Input.MOUSE_MODE_CAPTURED else Input.MOUSE_MODE_CAPTURED
		elif event.ctrl_pressed and not event.alt_pressed and not event.meta_pressed and event.keycode == KEY_8 and world != null:
			world.save_game(self)
		elif event.ctrl_pressed and not event.alt_pressed and not event.meta_pressed and event.keycode == KEY_9 and world != null:
			world.load_game(self)
		elif event.ctrl_pressed or event.alt_pressed or event.meta_pressed:
			_handle_development_key(event)
		elif event.keycode == KEY_F4 and OS.is_debug_build():
			debug_workbench_requested.emit()
		elif event.keycode == KEY_R:
			cancel_mining()
			return_to_spawn()
		elif event.keycode == KEY_T:
			cancel_mining()
			mining_tools.selected = posmod(mining_tools.selected + (-1 if event.shift_pressed else 1), MiningTools.COUNT)
		elif event.keycode >= KEY_1 and event.keycode <= KEY_9:
			selected_slot = event.keycode - KEY_1
			selection_changed.emit(selected_slot)
	elif event is InputEventMouseButton and event.pressed and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		if event.button_index == MOUSE_BUTTON_LEFT:
			_break_target()
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			cancel_mining()
			_place_target()


func _input(event: InputEvent) -> void:
	# Releases must cancel even if a UI or world lock consumes the event.
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		cancel_mining()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_WINDOW_FOCUS_OUT: cancel_mining()


func cancel_mining() -> void:
	mining_held = false
	mining_elapsed = 0.0
	mining_material = -1
	mining_serial = -1


func _process(delta: float) -> void:
	if world == null: return
	survival.tick(delta)
	if controls_open or world.gameplay_locked() or Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
		cancel_mining()
		return
	if not mining_held: return
	var target := world.get_target(camera.global_position, -camera.global_basis.z)
	if target.is_empty():
		mining_elapsed = 0.0
		mining_material = -1
		return
	var material := world.get_cell_item(target.hit)
	var duration := mining_tools.duration(material)
	if not is_finite(duration):
		mining_elapsed = 0.0
		mining_material = -1
		return
	if target.hit != mining_cell or material != mining_material or mining_serial != world.chunk_store.change_serial:
		mining_cell = target.hit
		mining_material = material
		mining_serial = world.chunk_store.change_serial
		mining_elapsed = 0.0
	mining_duration = duration
	mining_elapsed += delta
	if mining_elapsed >= mining_duration:
		world.finish_mining(mining_cell, mining_material, self)
		mining_elapsed = 0.0
		mining_material = -1


func _physics_process(delta: float) -> void:
	if controls_open or (world != null and world.gameplay_locked()):
		return
	if Input.is_key_pressed(KEY_SHIFT):
		_set_stance(true)
	elif crouched and can_stand():
		_set_stance(false)
	if not is_on_floor():
		velocity.y -= 18.0 * delta
	elif Input.is_key_pressed(KEY_SPACE):
		velocity.y = JUMP_VELOCITY
	var input_vector := Vector2(
		float(Input.is_key_pressed(KEY_D)) - float(Input.is_key_pressed(KEY_A)),
		float(Input.is_key_pressed(KEY_S)) - float(Input.is_key_pressed(KEY_W))
	).normalized()
	var direction := (transform.basis * Vector3(input_vector.x, 0.0, input_vector.y)).normalized()
	var speed := CROUCH_SPEED if crouched else (SPRINT_SPEED if Input.is_key_pressed(KEY_CTRL) else WALK_SPEED)
	velocity.x = move_toward(velocity.x, direction.x * speed, speed * 10.0 * delta)
	velocity.z = move_toward(velocity.z, direction.z * speed, speed * 10.0 * delta)
	if crouched and is_on_floor() and velocity.y <= 0.0:
		_guard_ledge(delta)
	move_and_slide()


func _break_target() -> void:
	if world != null and not world.gameplay_locked() and not controls_open:
		mining_held = true


func _place_target() -> void:
	if world == null:
		return
	var target := world.get_target(camera.global_position, -camera.global_transform.basis.z)
	if target.is_empty():
		action_feedback.emit("No block in reach")
		return
	world.place_from_inventory(target.place, selected_slot, inventory, global_position, BlockOrientation.from_hit(target.normal, rotation.y))


func _build_body() -> void:
	body_collision = CollisionShape3D.new()
	body_capsule = CapsuleShape3D.new()
	body_capsule.radius = 0.3
	body_capsule.height = STANDING_HEIGHT
	body_collision.shape = body_capsule
	body_collision.position.y = STANDING_HEIGHT * 0.5
	add_child(body_collision)
	standing_probe = CapsuleShape3D.new()
	standing_probe.radius = 0.299
	standing_probe.height = STANDING_HEIGHT - 0.02
	camera = Camera3D.new()
	camera.position.y = STANDING_EYE
	camera.current = true
	add_child(camera)


func capture_state() -> Dictionary:
	return {
		"position": [global_position.x, global_position.y, global_position.z],
		"yaw": rotation.y,
		"pitch": pitch,
		"selected_slot": selected_slot,
		"inventory": inventory.capture(),
		"total_mined": total_mined,
		"total_placed": total_placed,
		"crouched": crouched,
		"tools": mining_tools.capture(),
		"drops": world.drops.capture(),
	}


func restore_state(state: Dictionary) -> bool:
	if not SavedPlayerState.validate(state).is_empty():
		return false
	cancel_mining()
	mining_tools.restore(state.get("tools", MiningTools.new().capture()))
	var position_values = state.get("position", [])
	if not position_values is Array or position_values.size() != 3:
		return false
	global_position = Vector3(float(position_values[0]), float(position_values[1]), float(position_values[2]))
	rotation.y = float(state.get("yaw", rotation.y))
	pitch = clampf(float(state.get("pitch", pitch)), deg_to_rad(-89.0), deg_to_rad(89.0))
	camera.rotation.x = pitch
	velocity = Vector3.ZERO
	selected_slot = clampi(int(state.get("selected_slot", 0)), 0, BlockRegistry.HOTBAR_SLOT_COUNT - 1)
	total_mined = int(state.get("total_mined", 0))
	total_placed = int(state.get("total_placed", 0))
	_set_stance(bool(state.get("crouched", false)))
	inventory.restore(state.inventory, false)
	inventory.changed.emit()
	selection_changed.emit(selected_slot)
	challenge_changed.emit()
	return true


func challenge_complete() -> bool:
	return total_mined >= MINE_TARGET and total_placed >= PLACE_TARGET


func _reset_for_world(_summary: Dictionary) -> void:
	cancel_mining()
	mining_tools = MiningTools.new()
	mining_tools.inventory = inventory
	survival.reset()
	_set_stance(false)
	total_mined = 0
	total_placed = 0
	selected_slot = 0
	inventory.reset(8, false)
	global_position = world.spawn_position()
	velocity = Vector3.ZERO
	rotation.y = -PI / 2.0
	pitch = deg_to_rad(-12.0)
	camera.rotation.x = pitch
	inventory.changed.emit()
	selection_changed.emit(selected_slot)
	challenge_changed.emit()


func _on_block_mined(owner_inventory: BlockInventory) -> void:
	if owner_inventory != inventory: return
	total_mined = mini(2147483647, total_mined + 1)
	challenge_changed.emit()


func _on_block_placed(owner_inventory: BlockInventory) -> void:
	if owner_inventory != inventory: return
	total_placed = mini(2147483647, total_placed + 1)
	challenge_changed.emit()


func return_to_spawn() -> bool:
	if world == null or world.gameplay_locked(): return false
	var start: Vector3i = world.layout.spawn
	# Search nearby supported air using current edits, not the original heightmap.
	for radius in 3:
		for z in range(-radius, radius + 1):
			for x in range(-radius, radius + 1):
				if maxi(absi(x), absi(z)) != radius: continue
				for dy in [0, 1, -1, 2, -2, 3, -3, 4, -4]:
					var feet := start + Vector3i(x, dy, z)
					var floor_definition := BlockRegistry.by_material(world.get_cell_item(feet + Vector3i.DOWN))
					if floor_definition.is_empty() or not floor_definition.solid: continue
					if world.get_cell_item(feet) != -1 or world.get_cell_item(feet + Vector3i.UP) != -1: continue
					global_position = world.to_global(Vector3(feet) + Vector3(0.5, 0.05, 0.5))
					_set_stance(false)
					velocity = Vector3.ZERO
					rotation.y = -PI / 2.0
					pitch = deg_to_rad(-12.0)
					camera.rotation.x = pitch
					action_feedback.emit("Returned to a safe entrance cell")
					return true
	action_feedback.emit("Return rejected: entrance area has no safe space")
	return false


func _handle_development_key(event: InputEventKey) -> void:
	if not OS.is_debug_build() or event.meta_pressed or (event.ctrl_pressed and event.alt_pressed): return
	if event.ctrl_pressed:
		match event.keycode:
			KEY_0:
				cheat_hud_visible = not cheat_hud_visible
				debug_visibility_changed.emit()
			KEY_1:
				development_fill_selected()
			KEY_2:
				development_clear_selected()
			KEY_3:
				var problem := BlockRegistry.validate()
				if problem.is_empty(): problem = SavedPlayerState.validate(capture_state())
				action_feedback.emit("Diagnostics PASS: registry, inventory, player" if problem.is_empty() else "Diagnostics FAIL: " + problem)
	elif event.alt_pressed:
		match event.keycode:
			KEY_1:
				toggle_performance_hud()
			KEY_2:
				toggle_voxel_debug()
			KEY_3:
				write_profile_snapshot()


func development_fill_selected() -> void:
	var item := inventory.item_at(selected_slot)
	inventory.set_stack(selected_slot, selected_slot if item == -1 else item, inventory.max_for_slot(selected_slot))
	action_feedback.emit("Development: selected stack filled (challenge unchanged)")


func development_clear_selected() -> void:
	inventory.set_stack(selected_slot, -1, 0)
	action_feedback.emit("Development: selected stack cleared (challenge unchanged)")


func toggle_performance_hud() -> void:
	performance_hud_visible = not performance_hud_visible
	debug_visibility_changed.emit()


func toggle_voxel_debug() -> void:
	voxel_debug_visible = not voxel_debug_visible
	debug_visibility_changed.emit()
	action_feedback.emit("Voxel axes ON: X red, Y green (up), Z blue" if voxel_debug_visible else "Voxel axes OFF")


func write_profile_snapshot() -> bool:
	if not OS.is_debug_build() or world == null or world.gameplay_locked(): return false
	var directory := profile_directory
	if DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory)) != OK: return false
	var path := directory.path_join("voxel-%d-%d.json" % [OS.get_process_id(), Time.get_ticks_usec()])
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		action_feedback.emit("Profile snapshot could not be written")
		return false
	file.store_string(JSON.stringify({"engine": Engine.get_version_info().string,
		"seed": world.layout.seed, "size": world.layout.size, "signature": world.layout.signature,
		"generation_options": world.chunk_store.generation_options,
		"edits": world.chunk_store.edits.size(), "chunks": world.chunk_nodes.size(),
		"generation_stages": world.layout.timings, "build_stages": world.build_timings,
		"last_rebuild": world.last_rebuild, "fps": Engine.get_frames_per_second(),
		"engine_static_bytes": Performance.get_monitor(Performance.MEMORY_STATIC)}, "  "))
	file.close()
	last_profile_path = path
	action_feedback.emit("Profile saved: " + path)
	return true


func _set_stance(next_crouched: bool) -> void:
	if crouched == next_crouched: return
	crouched = next_crouched
	var height := CROUCH_HEIGHT if crouched else STANDING_HEIGHT
	body_capsule.height = height
	body_collision.position.y = height * 0.5
	camera.position.y = CROUCH_EYE if crouched else STANDING_EYE
	stance_changed.emit(crouched)


func can_stand() -> bool:
	var query := PhysicsShapeQueryParameters3D.new()
	query.shape = standing_probe
	query.transform = global_transform
	# Keep the probe above floor contact while retaining the exact standing top.
	query.transform.origin += Vector3.UP * (STANDING_HEIGHT * 0.5 + 0.01)
	query.exclude = [get_rid()]
	query.collision_mask = collision_mask
	return get_world_3d().direct_space_state.intersect_shape(query, 1).is_empty()


func _has_ledge_support(offset: Vector3) -> bool:
	var feet := global_position + offset
	var query := PhysicsRayQueryParameters3D.create(feet + Vector3.UP * 0.1, feet + Vector3.DOWN * 0.25, collision_mask, [get_rid()])
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	return not hit.is_empty() and hit.normal.dot(Vector3.UP) >= cos(floor_max_angle)


func _guard_ledge(delta: float) -> void:
	var displacement := Vector3(velocity.x * delta, 0.0, velocity.z * delta)
	if _has_ledge_support(displacement): return
	# Resolve axes separately so sneaking along an edge does not stick. Test
	# the combined move again: two supported axes can still cross a diagonal gap.
	if not _has_ledge_support(Vector3(displacement.x, 0.0, 0.0)): velocity.x = 0.0
	if not _has_ledge_support(Vector3(0.0, 0.0, displacement.z)): velocity.z = 0.0
	if not _has_ledge_support(Vector3(velocity.x * delta, 0.0, velocity.z * delta)):
		velocity.x = 0.0
		velocity.z = 0.0
