extends SceneTree

var assertions := 0
var failures: Array[String] = []
var output_directory := "res://Saved/Verification/mining-dev"
var world: VoxelWorld
var player: VoxelPlayer
var hud: GameHud
var target: Vector3i


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	var gear := MiningTools.new()
	for id in MiningTools.COUNT:
		gear.selected = id
		for material in BlockRegistry.MATERIAL_COUNT:
			var block := BlockRegistry.by_material(material)
			var expected_harvest: bool = block.recoverable and (block.tool != "pickaxe" or id in [1, 4, 7])
			_expect(gear.can_harvest(material) == expected_harvest, "harvest matrix %d/%d" % [id, material])
			var speed := float([1, 2, 4, 6][MiningTools.definition(id).tier]) if MiningTools.definition(id).kind == block.tool else 1.0
			var expected: float = block.hardness * (1.5 if expected_harvest else 5.0) / speed if block.recoverable else INF
			_expect(is_equal_approx(gear.duration(material), expected) if is_finite(expected) else not is_finite(gear.duration(material)), "duration matrix %d/%d" % [id, material])
	_validate_payload_fields()
	for level in range(1, MiningCracks.STAGES + 1):
		var crack_mesh := MiningCracks.build_stage(level)
		_expect(crack_mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX].size() == level * 36, "crack stage adds six face segments")
		_expect(not (crack_mesh.surface_get_material(0) as StandardMaterial3D).no_depth_test, "cracks respect occluding terrain")
	if DisplayServer.get_name() == "headless":
		print("MINING DATA: %d assertions, %d failures; captured-pointer runtime requires actual renderer" % [assertions, failures.size()])
		quit(0 if failures.is_empty() else 1)
		return
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	world = instance.get_node("VoxelWorld")
	player = instance.get_node("Player")
	hud = instance.get_node("HUD")
	var cracks: MiningCracks = world.get_node("MiningCracks")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	var y: int = Array(world.layout.heights).max() + 8
	for x in range(-4, 5):
		for z in range(-4, 7): world.set_cell_item(Vector3i(x, y, z), BlockRegistry.STONE)
	target = Vector3i(0, y + 2, 0)
	player.position = Vector3(0.5, y + 1.05, 3.5)
	player.velocity = Vector3.ZERO
	await _set_target(BlockRegistry.STONE)
	print("MINING FIXTURE mouse=%d player=%s hit=%s" % [Input.mouse_mode, player.position, world.get_target(player.camera.global_position, -player.camera.global_basis.z)])
	_expect(player.is_on_floor(), "fixture has actual character collision")
	var durability := int(player.mining_tools.remaining[1])
	_left(true)
	await create_timer(0.3).timeout
	_expect(world.get_cell_item(target) == BlockRegistry.STONE and player.mining_elapsed > 0, "hold accumulates progress without instant break")
	_expect(hud.mining_panel.visible and hud.mining_bar.value > 0, "production mining HUD shows progress")
	_expect(cracks.visible and cracks.stage > 0 and cracks.position == world.map_to_local(target), "cracks attach to actual mined voxel")
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		_expect(root.get_texture().get_image().save_png(output_directory.path_join("mining-progress.png")) == OK, "mining progress PNG")
	_left(false)
	await process_frame
	_expect(player.mining_elapsed == 0 and not player.mining_held and player.mining_tools.remaining[1] == durability, "release cancels without tool wear")
	await process_frame
	_expect(not cracks.visible and cracks.stage == 0, "release clears crack overlay")
	_left(true)
	await _until(func() -> bool: return player.mining_elapsed >= player.mining_duration * 0.75 and player.mining_material >= 0, 3, "hold reaches late crack stage")
	await process_frame
	_expect(cracks.visible and cracks.stage >= 8, "late progress grows 3D crack stage")
	await RenderingServer.frame_post_draw
	_expect(root.get_texture().get_image().save_png(output_directory.path_join("mining-cracks.png")) == OK, "late crack PNG")
	await _until(func() -> bool: return world.get_cell_item(target) == -1, 3.0, "held LMB breaks target")
	_left(false)
	_expect(player.total_mined == 1 and player.mining_tools.remaining[1] == durability - 1, "completion counts and wears once")
	await process_frame
	_expect(not cracks.visible, "completion removes crack overlay")
	_expect(player.inventory.count(0) == 8 and world.drops.bodies.size() == 1, "completion creates drop instead of awarding distant inventory")
	if world.drops.bodies.is_empty():
		print("MINING SMOKE: early failure held=%s elapsed=%s mouse=%d material=%d failures=%s" % [player.mining_held, player.mining_elapsed, Input.mouse_mode, world.get_cell_item(target), failures])
		quit(1)
		return
	var body: RigidBody3D = world.drops.bodies[0]
	_expect(float(body.get_meta("delay")) > 0, "fresh drop has pickup delay")
	await create_timer(0.8).timeout
	_expect(absf(body.position.y - (y + 1.125)) < 0.15, "physical drop settles on voxel collision")
	player.rotation.y = 0
	_key(KEY_W, true)
	await _until(func() -> bool: return player.inventory.count(0) == 9, 2.0, "actual walking collects delayed drop")
	_key(KEY_W, false)
	_expect(world.drops.bodies.is_empty(), "collected drop removed once")
	for unused in 6: await physics_frame
	_expect(player.inventory.count(0) == 9, "pickup cannot repeat")
	# Fixed poses isolate cancellation/persistence; the pickup above used real W.
	player.set_physics_process(false)
	player.velocity = Vector3.ZERO
	player.position = Vector3(0.5, y + 1, 3.5)
	await _set_target(BlockRegistry.STONE)
	_left(true)
	await create_timer(0.25).timeout
	var other := target + Vector3i.RIGHT
	world.set_cell_item(other, BlockRegistry.STONE)
	world.rebuild_dirty()
	_aim(other)
	for unused in 3: await process_frame
	_expect(player.mining_cell == other and player.mining_elapsed < 0.15, "target/edit change restarts progress")
	_key(KEY_T, true)
	_key(KEY_T, false)
	await process_frame
	_expect(player.mining_tools.selected == 2 and not player.mining_held, "actual T changes tool and cancels partial mining")
	_key(KEY_T, true, true)
	_key(KEY_T, false, true)
	await process_frame
	_expect(player.mining_tools.selected == 1, "actual Shift+T cycles backwards")
	_left(true)
	await process_frame
	player.controls_open = true
	for unused in 2: await process_frame
	_expect(not player.mining_held and player.mining_elapsed == 0, "UI opening cancels held action")
	player.controls_open = false
	_left(false)
	var before_full := player.inventory.capture()
	for slot in BlockInventory.SLOT_COUNT: player.inventory.set_stack(slot, 0, 64)
	await _set_target(BlockRegistry.STONE)
	_left(true)
	await _until(func() -> bool: return world.get_cell_item(target) == -1, 3, "full inventory still allows timed break")
	_left(false)
	_expect(player.inventory.count(0) == 64 and world.drops.bodies.size() == 1, "full inventory retains physical loot")
	await create_timer(0.8).timeout
	if DisplayServer.get_name() != "headless":
		_aim(Vector3i(world.drops.bodies[0].position.floor()))
		for unused in 3: await process_frame
		await RenderingServer.frame_post_draw
		_expect(root.get_texture().get_image().save_png(output_directory.path_join("mining-drop.png")) == OK, "physical dropped block PNG")
	player.position = world.drops.bodies[0].position + Vector3(0, -0.575, 0.3)
	for unused in 5: await physics_frame
	_expect(world.drops.bodies.size() == 1 and player.inventory.count(0) == 64, "nearby full inventory does not erase loot")
	player.inventory.consume(0)
	await _until(func() -> bool: return world.drops.bodies.is_empty(), 1, "freeing capacity collects retained loot")
	_expect(player.inventory.count(0) == 64, "retained loot restores exact item count")
	player.inventory.restore(before_full)
	player.position = Vector3(0.5, y + 1, 3.5)
	player.mining_tools.selected = 3
	player.mining_tools.remaining[3] = 1
	await _set_target(BlockRegistry.DIRT)
	_left(true)
	await _until(func() -> bool: return world.get_cell_item(target) == -1, 2, "last durability break completes")
	_left(false)
	_expect(player.mining_tools.remaining[3] == 0 and player.mining_tools.effective().kind == "hand", "exhausted tool becomes hand without negative durability")
	# Wrong-tool destruction is slower and yields no stone drop.
	world.drops.clear_items()
	await _set_target(BlockRegistry.STONE)
	_left(true)
	await _until(func() -> bool: return world.get_cell_item(target) == -1, 9, "wrong tool can finish slow destruction")
	_left(false)
	_expect(world.drops.bodies.is_empty(), "wrong tool does not harvest stone")
	await _set_target(BlockRegistry.LEAVES)
	_left(true)
	await create_timer(0.4).timeout
	_left(false)
	_expect(world.get_cell_item(target) == BlockRegistry.LEAVES, "nonrecoverable leaf contract preserved")
	world.drops.spawn_item(0, 1, player.position + Vector3(0, 1.5, -1), Vector3.ZERO)
	_expect(world.get_target(player.camera.global_position, -player.camera.global_basis.z).get("hit") == target, "drop collision layer does not block mining ray")
	world.loading = true
	for unused in 3: await physics_frame
	var paused := world.drops.capture()
	for unused in 10: await physics_frame
	_expect(paused == world.drops.capture(), "world load lock freezes drop state")
	world.loading = false
	world.drops.clear_items()
	# A nearby item behind terrain must not be pulled through the wall.
	player.position = Vector3(0.5, y + 1, 3.05)
	var wall := Vector3i(0, y + 1, 2)
	world.set_cell_item(wall, BlockRegistry.STONE)
	world.rebuild_dirty()
	for unused in 3: await physics_frame
	var stock := player.inventory.count(2)
	world.drops.spawn_item(2, 1, Vector3(0.5, y + 1.7, 1.85), Vector3.ZERO, 0)
	for unused in 5: await physics_frame
	_expect(world.drops.bodies.size() == 1 and player.inventory.count(2) == stock, "nearby drop cannot pass through voxel wall")
	world.set_cell_item(wall, -1)
	world.rebuild_dirty()
	await _until(func() -> bool: return world.drops.bodies.is_empty(), 1, "removing obstruction permits pickup")
	_expect(player.inventory.count(2) == stock + 1, "unobstructed pickup transfers exactly one item")
	world.drops.spawn_item(0, 1, Vector3(0, -65, 0), Vector3.ZERO)
	for unused in 3: await physics_frame
	_expect(world.drops.bodies.size() == 1 and world.drops.bodies[0].position.distance_to(world.spawn_position() + Vector3.UP) < 1.0, "fallen loot returns to spawn instead of being deleted")
	_expect(WorldDrops.validate(world.drops.capture()).is_empty(), "rescued drop remains saveable")
	world.drops.clear_items()
	player.position = Vector3(0.5, y + 1, 3.5)
	world.drops.spawn_item(2, 1, Vector3(2.5, y + 2, 0.5), Vector3.ZERO)
	var checkpoint := world.chunk_store.encode(player.capture_state())
	var saved := player.capture_state()
	world.drops.clear_items()
	player.mining_tools.remaining[1] = 0
	_expect(world.apply_saved_game(checkpoint, player).ok, "current checkpoint restores")
	var restored_state := player.capture_state()
	# This engine's decimal parser differs by one double ULP for the atan2 pitch.
	# Check camera precision separately; all discrete/tool/drop fixture state stays exact.
	_expect(absf(restored_state.pitch - saved.pitch) <= 1e-12, "camera angle survives JSON within 1e-12 radians")
	restored_state.pitch = saved.pitch
	_expect(restored_state == saved, "tools and uncollected drop pose/velocity/delay restore exactly")
	var payload: Dictionary = JSON.parse_string(JSON.parse_string(checkpoint).payload)
	payload.format_version = 2
	payload.player.inventory = [8, 8, 8, 8, 8, 8, 8, 8, 8]
	payload.player.erase("tools")
	payload.player.erase("drops")
	_expect(world.apply_saved_game(_envelope(payload), player).ok and world.drops.bodies.is_empty(), "format-2 same-generation save migrates without stale drops")
	_expect(player.mining_tools.capture() == MiningTools.new().capture(), "legacy tools initialize explicitly")
	for field in ["tools", "drops"]:
		payload = JSON.parse_string(JSON.parse_string(checkpoint).payload)
		payload.player.erase(field)
		_expect(not world.apply_saved_game(_envelope(payload), player).ok, "current format missing " + field + " rejected")
	for bad in [-1, 1.5, 60, "59", null]:
		var invalid := player.capture_state()
		invalid.tools.remaining[1] = bad
		_expect(not world.apply_saved_game(world.chunk_store.encode(invalid), player).ok, "invalid durability rejected")
	for bad in [-1, 1.5, 65, "1", null]:
		var invalid := saved.duplicate(true)
		invalid.drops[0].amount = bad
		var before := player.capture_state()
		_expect(not world.apply_saved_game(world.chunk_store.encode(invalid), player).ok and before == player.capture_state(), "invalid drop rejected atomically")
	world.save_path = output_directory.path_join("mining-checkpoint.json")
	world.apply_saved_game(checkpoint, player)
	_expect(world.save_game(player), "async mining checkpoint save starts")
	await _until(func() -> bool: return not world.save_service.is_busy(), 5, "async mining save completes")
	var disk := VoxelChunkStore.read_encoded_file(world.save_path)
	_expect(disk.ok and world.chunk_store.inspect_save(disk.encoded).ok, "disk mining payload validates")
	world.drops.clear_items()
	_expect(world.load_game(player), "async mining load starts")
	await _until(func() -> bool: return not world.save_service.is_busy(), 5, "async mining load completes")
	_expect(world.drops.bodies.size() == 1 and player.mining_tools.remaining[3] == 0, "async load restores drop and exhausted tool")
	await _set_target(BlockRegistry.STONE)
	_left(true)
	await create_timer(0.2).timeout
	world.generate_world(42, 41, "dungeon")
	_expect(world.drops.bodies.is_empty() and not player.mining_held, "regeneration removes prior drops and cancels mining")
	_expect(player.mining_tools.capture() == MiningTools.new().capture(), "new world resets preview toolkit")
	_left(false)
	for failure in failures: push_error(failure)
	print("MINING SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _set_target(material: int) -> void:
	world.set_cell_item(target, material)
	world.rebuild_dirty()
	_aim(target)
	for unused in 6: await physics_frame


func _validate_payload_fields() -> void:
	for bad in [-1, 10, 1.5, "1", null, true]:
		var state := MiningTools.new().capture()
		state.selected = bad
		_expect(not MiningTools.validate(state).is_empty(), "invalid selected tool rejected")
	var row := {"slot": 0, "amount": 1, "position": [0.0, 0.0, 0.0], "velocity": [0.0, 0.0, 0.0], "delay": 0.35}
	_expect(WorldDrops.validate([row]).is_empty(), "valid physical drop payload")
	for field in ["slot", "amount", "position", "velocity", "delay"]:
		var missing := row.duplicate(true)
		missing.erase(field)
		_expect(not WorldDrops.validate([missing]).is_empty(), "missing drop " + field + " rejected")
	for field in ["position", "velocity"]:
		for bad in [NAN, INF, -INF, "0", null, true, 30001.0 if field == "position" else 201.0]:
			var invalid := row.duplicate(true)
			invalid[field][0] = bad
			_expect(not WorldDrops.validate([invalid]).is_empty(), "invalid drop vector rejected")
	for bad in [-0.1, 0.36, NAN, INF, "0", null, true]:
		var invalid := row.duplicate(true)
		invalid.delay = bad
		_expect(not WorldDrops.validate([invalid]).is_empty(), "invalid pickup delay rejected")
	var excessive: Array = []
	excessive.resize(WorldDrops.MAX_DROPS + 1)
	excessive.fill(row)
	_expect(not WorldDrops.validate(excessive).is_empty(), "drop count limit enforced without creating physics bodies")


func _aim(cell: Vector3i) -> void:
	var delta := Vector3(cell) + Vector3.ONE * 0.5 - player.camera.global_position
	player.rotation.y = atan2(-delta.x, -delta.z)
	player.pitch = atan2(delta.y, Vector2(delta.x, delta.z).length())
	player.camera.rotation.x = player.pitch


func _left(pressed: bool) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.position = root.get_visible_rect().size * 0.5
	event.pressed = pressed
	Input.parse_input_event(event)


func _key(key: Key, pressed: bool, shift := false) -> void:
	var event := InputEventKey.new()
	event.keycode = key
	event.pressed = pressed
	event.shift_pressed = shift
	Input.parse_input_event(event)


func _until(condition: Callable, seconds: float, label: String) -> void:
	var deadline := Time.get_ticks_msec() + int(seconds * 1000)
	while not condition.call() and Time.get_ticks_msec() < deadline: await process_frame
	_expect(condition.call(), label)


func _envelope(payload: Dictionary) -> String:
	var encoded := JSON.stringify(payload)
	return JSON.stringify({"payload": encoded, "sha256": encoded.sha256_text()})


func _expect(condition: bool, label: String) -> void:
	assertions += 1
	if not condition:
		failures.append(label)
		print("MINING FAIL: " + label)
