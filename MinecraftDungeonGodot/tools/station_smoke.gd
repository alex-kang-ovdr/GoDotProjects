extends SceneTree

var assertions := 0
var failures: Array[String] = []
var output := "res://Saved/Verification/stations-dev"
var world: VoxelWorld
var player: VoxelPlayer
var panel: StationPanel


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	_data()
	await _runtime()
	for failure in failures: push_error(failure)
	print("STATION SMOKE: %d assertions, %d failures; rendered=%s" % [assertions, failures.size(), DisplayServer.get_name() != "headless"])
	quit(0 if failures.is_empty() else 1)


func _data() -> void:
	var furnace := StationState.create(ItemRegistry.FURNACE)
	furnace.slots[0] = [ItemRegistry.RAW_IRON, 9]
	furnace.slots[1] = [ItemRegistry.COAL, 1]
	for unused in 199: StationState.tick(furnace)
	_expect(furnace.cook == 199 and furnace.burn == 1401 and furnace.slots[2] == [-1, 0], "199 ticks do not complete smelt")
	StationState.tick(furnace)
	_expect(furnace.cook == 0 and furnace.burn == 1400 and furnace.slots[0] == [11, 8] and furnace.slots[2] == [12, 1], "tick 200 consumes exactly one ore")
	for unused in 1400: StationState.tick(furnace)
	_expect(furnace.burn == 0 and furnace.slots[2] == [12, 8] and furnace.slots[0] == [11, 1], "one coal provides exactly eight complete ingots")
	StationState.tick(furnace)
	_expect(furnace.cook == 0 and furnace.slots[2] == [12, 8], "no fuel means no ninth ingot")
	furnace.slots[2] = [12, 64]
	furnace.slots[1] = [10, 1]
	StationState.tick(furnace)
	_expect(furnace.burn == 0 and furnace.slots[1] == [10, 1], "full output does not ignite coal")
	furnace.burn = 100
	StationState.tick(furnace)
	_expect(furnace.burn == 99 and furnace.cook == 0, "existing burn continues while output is full")
	var inventory := BlockInventory.new(0)
	inventory.cursor = PackedInt32Array([12, 63])
	_expect(StationState.click(furnace, inventory, 2) and Array(inventory.cursor) == [12, 64] and furnace.slots[2] == [12, 63], "output merges into held ingots without overflow")
	var stable := furnace.duplicate(true)
	_expect(not StationState.click(furnace, inventory, 2) and furnace == stable, "full held output cannot consume more")
	inventory.cursor = PackedInt32Array([8, 1])
	for slot in 3: _expect(not StationState.click(furnace, inventory, slot) and furnace == stable, "invalid furnace ingredient/output insertion rejects")
	inventory.cursor = PackedInt32Array([-1, 0])
	var chest := StationState.create(ItemRegistry.CHEST)
	chest.slots[0] = [16, 1, 17]
	chest.slots[1] = [8, 64]
	chest.slots[26] = [24, 1, 0]
	inventory.add(3, 63)
	var ownership := _owned(chest, inventory)
	var random := RandomNumberGenerator.new()
	random.seed = 78164
	for operation in 2500:
		if random.randi_range(0, 1) == 0: StationState.click(chest, inventory, random.randi_range(0, 26), random.randi_range(0, 1) == 0)
		else: inventory.click(random.randi_range(0, 35), random.randi_range(0, 1) == 0)
		_expect(StationState.validate(chest).is_empty() and BlockInventory.validate(inventory.capture()).is_empty() and _owned(chest, inventory) == ownership, "chest/bag/cursor preserves ownership and wear %d" % operation)
	for bad in [-1, 1601, 1.5, true, "1", null]:
		var invalid := StationState.create(15)
		invalid.burn = bad
		_expect(not StationState.validate(invalid).is_empty(), "invalid burn timer rejected")
	for bad in [-1, 200, 0.5, true]:
		var invalid := StationState.create(15)
		invalid.cook = bad
		_expect(not StationState.validate(invalid).is_empty(), "invalid cook timer rejected")
	var invalid := StationState.create(14)
	invalid.burn = 1
	_expect(not StationState.validate(invalid).is_empty(), "chest cannot burn")


func _runtime() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	world = instance.get_node("VoxelWorld")
	player = instance.get_node("Player")
	panel = instance.get_node("StationPanel")
	player.set_physics_process(false)
	world.drops.set_physics_process(false)
	world.stations.set_physics_process(false)
	await process_frame
	var chest_cell := Vector3i(0, 100, 0)
	var furnace_cell := Vector3i(2, 100, 0)
	player.inventory.set_stack(0, ItemRegistry.CHEST, 2)
	player.inventory.set_stack(1, ItemRegistry.FURNACE, 2)
	# Four independent placed instances, not one global chest/furnace.
	for pair: Array in [[chest_cell, 0], [chest_cell + Vector3i(0, 0, -2), 0], [furnace_cell, 1], [furnace_cell + Vector3i(0, 0, -2), 1]]:
		_expect(world.place_from_inventory(pair[0], pair[1], player.inventory, Vector3(999, 999, 999)), "place independent station")
	world.rebuild_dirty()
	world.stations.refresh_visuals()
	_expect(world.chunk_store.stations.size() == 4 and world.stations.visuals.size() == 4, "four bound stations have world visuals")
	player.position = Vector3(0.5, 98.8, 3.5)
	_aim(chest_cell)
	for unused in 6: await physics_frame
	await _key(KEY_X)
	_expect(panel.opened and player.controls_open and panel.cell == chest_cell, "actual X opens only aimed chest")
	player.inventory.cursor = PackedInt32Array([16, 1, 17])
	await _key(KEY_ENTER)
	_expect(world.chunk_store.stations[chest_cell].slots[0] == [16, 1, 17] and player.inventory.cursor[0] == -1, "actual Enter deposits worn tool")
	var before := world.chunk_store.encode(player.capture_state())
	_expect(not world.finish_mining(chest_cell, BlockRegistry.PLANK, player) and world.chunk_store.encode(player.capture_state()) == before, "nonempty station refuses mining without wear/loot/state change")
	world.set_cell_item(chest_cell, -1)
	_expect(world.get_cell_item(chest_cell) == BlockRegistry.PLANK, "low-level edit cannot erase occupied station")
	await _key(KEY_ENTER)
	await _key(KEY_B)
	await _key(KEY_ENTER)
	_expect(player.inventory.stack_at(0) == [16, 1, 17] and StationState.empty(world.chunk_store.stations[chest_cell]), "B switches to actual bag and transfers tool")
	await _key(KEY_ESCAPE)
	# Deterministic station tick accumulation, with split render/physics deltas.
	var furnace: Dictionary = world.chunk_store.stations[furnace_cell]
	furnace.slots[0] = [11, 3]
	furnace.slots[1] = [10, 1]
	for unused in 597: world.stations.advance(1.0 / 60.0)
	_expect(furnace.cook == 199 and furnace.burn == 1401, "60Hz subdivisions produce exactly 199 furnace ticks")
	world.loading = true
	var paused := furnace.duplicate(true)
	world.stations.advance(10)
	_expect(furnace == paused, "load lock pauses furnace without catchup")
	world.loading = false
	world.stations.advance(0.0125)
	var saved := world.chunk_store.encode(player.capture_state())
	_expect(world.chunk_store.inspect_save(saved).ok, "mid-smelt save with sub-tick remainder validates")
	world.stations.advance(0.0375)
	_expect(furnace.slots[2] == [12, 1] and furnace.cook == 0, "partial delta completes exact tick boundary")
	_expect(world.apply_saved_game(saved, player).ok, "restore mid-smelt checkpoint")
	world.stations.advance(0.0375)
	furnace = world.chunk_store.stations[furnace_cell]
	_expect(furnace.slots[2] == [12, 1] and furnace.cook == 0 and world.chunk_store.stations.size() == 4, "restored sub-tick state resumes deterministically across four stations")
	# A valid checkpoint may intentionally remove a formerly nonempty station.
	var without_chest: Dictionary = JSON.parse_string(JSON.parse_string(saved).payload)
	world.chunk_store.stations[chest_cell].slots[0] = [8, 1]
	var next_stations := []
	for row: Dictionary in without_chest.stations:
		if int(row.cell[0]) != chest_cell.x or int(row.cell[1]) != chest_cell.y or int(row.cell[2]) != chest_cell.z: next_stations.append(row)
	without_chest.stations = next_stations
	var next_edits := []
	for row: Array in without_chest.edits:
		var normalized := row.duplicate()
		if int(normalized[0]) == chest_cell.x and int(normalized[1]) == chest_cell.y and int(normalized[2]) == chest_cell.z: normalized[3] = -1
		next_edits.append(normalized)
	without_chest.edits = next_edits
	var removed_result := world.apply_saved_game(_envelope(without_chest), player)
	_expect(removed_result.ok and not world.chunk_store.stations.has(chest_cell) and world.get_cell_item(chest_cell) == -1, "checkpoint can atomically remove former nonempty station result=%s cell=%d stations=%d" % [removed_result, world.get_cell_item(chest_cell), world.chunk_store.stations.size()])
	_expect(world.apply_saved_game(saved, player).ok, "restore station checkpoint after removal transaction")
	# Actual generated ore mapping, not arbitrary blocks painted into a fixture.
	var ores := {}
	for ore: Vector3i in world.layout.ore_cells:
		var material := world.get_cell_item(ore)
		if material in [BlockRegistry.COBBLESTONE, BlockRegistry.MOSS] and not ores.has(material): ores[material] = ore
	_expect(ores.size() == 2, "generated seed contains coal and raw iron provenance")
	for material: int in ores:
		var ore: Vector3i = ores[material]
		var item := ItemRegistry.COAL if material == BlockRegistry.COBBLESTONE else ItemRegistry.RAW_IRON
		_expect(world.mining_drop(ore, material) == item and world.finish_mining(ore, material, player), "generated ore produces material drop")
		_expect(world.drops.bodies.back().get_meta("slot") == item, "actual new material physical drop created")
		world.set_cell_item(ore, material)
		_expect(world.mining_drop(ore, material) == material, "replacing identical generated block cannot regrow ore")
	var with_provenance := world.chunk_store.encode(player.capture_state())
	_expect(world.apply_saved_game(with_provenance, player).ok, "new material drops and exhausted ore restore")
	for material: int in ores: _expect(world.mining_drop(ores[material], material) == material, "ore provenance survives normalized edit reload")
	for body: RigidBody3D in world.drops.bodies.duplicate():
		var item := int(body.get_meta("slot"))
		var before_count := player.inventory.total(item)
		body.position = player.position + Vector3.UP * 0.7
		body.set_meta("delay", 0.0)
		world.drops._physics_process(0)
		_expect(player.inventory.total(item) == before_count + 1, "actual physics pickup acquires new material item")
	_validate_corruption(with_provenance)
	# Empty furnace with remaining heat is recoverable as the furnace item.
	var empty_cell := furnace_cell + Vector3i(0, 0, -2)
	world.chunk_store.stations[empty_cell].burn = 100
	_expect(world.finish_mining(empty_cell, BlockRegistry.BRICK, player) and not world.chunk_store.stations.has(empty_cell) and world.drops.bodies.back().get_meta("slot") == ItemRegistry.FURNACE, "empty burning furnace recovers exactly its item")
	if DisplayServer.get_name() != "headless": await _render(chest_cell, furnace_cell)
	instance.queue_free()
	await process_frame


func _validate_corruption(encoded: String) -> void:
	var payload: Dictionary = JSON.parse_string(JSON.parse_string(encoded).payload)
	var baseline := world.chunk_store.encode(player.capture_state())
	for field: String in ["stations", "depleted_ore", "station_tick_remainder"]:
		var missing := payload.duplicate(true)
		missing.erase(field)
		_expect(not world.apply_saved_game(_envelope(missing), player).ok and world.chunk_store.encode(player.capture_state()) == baseline, "missing station schema rejects atomically: " + field)
	var duplicate := payload.duplicate(true)
	duplicate.stations.append(duplicate.stations[0].duplicate(true))
	_expect(not world.apply_saved_game(_envelope(duplicate), player).ok, "duplicate station coordinate rejects")
	var wrong := payload.duplicate(true)
	wrong.stations[0].cell = [31000, 31000, 31000]
	_expect(not world.apply_saved_game(_envelope(wrong), player).ok, "air station binding rejects")
	for remainder: Variant in [-0.1, 0.05, true, "0"]:
		wrong = payload.duplicate(true)
		wrong.station_tick_remainder = remainder
		_expect(not world.apply_saved_game(_envelope(wrong), player).ok, "invalid sub-tick remainder rejects")
	wrong = payload.duplicate(true)
	wrong.format_version = 6
	wrong.erase("stations")
	wrong.erase("depleted_ore")
	wrong.erase("station_tick_remainder")
	# v6 never supported material drops above block ID 8.
	_expect(not world.apply_saved_game(_envelope(wrong), player).ok, "legacy6 rejects future material drop IDs")
	wrong.player.drops = []
	_expect(world.apply_saved_game(_envelope(wrong), player).ok and world.chunk_store.stations.is_empty(), "legacy6 explicitly clears live stations")
	_expect(world.apply_saved_game(encoded, player).ok, "restore current stations after legacy test")


func _render(chest_cell: Vector3i, furnace_cell: Vector3i) -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
	for size_value in [Vector2i(1280, 720), Vector2i(640, 480)]:
		root.size = size_value
		await create_timer(0.15).timeout
		for aimed: Vector3i in [chest_cell, furnace_cell]:
			player.position = Vector3(aimed) + Vector3(0.5, -1.2, 3.5)
			_aim(aimed)
			for unused in 3: await physics_frame
			await _key(KEY_X)
			await RenderingServer.frame_post_draw
			_expect(panel.opened and root.get_visible_rect().encloses(panel.panel.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, panel.panel.size)), "station UI fits actual viewport %s" % size_value)
			_expect(root.get_texture().get_image().save_png(output.path_join("station-%d-%dx%d.png" % [aimed.x, size_value.x, size_value.y])) == OK, "station PNG")
			if aimed == chest_cell:
				player.inventory.cursor = PackedInt32Array([8, 3])
				await _click(panel.buttons[26])
				_expect(world.chunk_store.stations[aimed].slots[26] == [8, 3], "mouse deposits in last chest slot")
				await _click(panel.buttons[26])
				_expect(Array(player.inventory.cursor) == [8, 3], "mouse retrieves last chest slot")
				player.inventory.click(35)
			await _key(KEY_B)
			await RenderingServer.frame_post_draw
			_expect(root.get_visible_rect().encloses(panel.panel.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, panel.panel.size)), "station bag view fits actual viewport")
			await _key(KEY_ESCAPE)
	# Native world view proves the station is not merely a menu.
	root.size = Vector2i(1280, 720)
	await create_timer(0.15).timeout
	player.position = Vector3(1, 102, 5)
	_aim(Vector3i(1, 100, 0))
	await RenderingServer.frame_post_draw
	_expect(root.get_texture().get_image().save_png(output.path_join("stations-world.png")) == OK, "world station detail capture")
	player.position = Vector3(0.5, 98.8, 3.5)
	_aim(chest_cell)
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	for unused in 3: await physics_frame
	var target := world.get_target(player.camera.global_position, -player.camera.global_basis.z)
	player.inventory.set_stack(2, ItemRegistry.CHEST, 1)
	player.selected_slot = 2
	_mouse(MOUSE_BUTTON_RIGHT, true)
	await process_frame
	_mouse(MOUSE_BUTTON_RIGHT, false)
	_expect(target.has("place") and world.chunk_store.stations.has(target.place) and player.inventory.count(2) == 0, "actual RMB places station item from hotbar target=%s stations=%d count=%d selected=%d mouse=%d controls=%s place_material=%d" % [target, world.chunk_store.stations.size(), player.inventory.count(2), player.selected_slot, Input.mouse_mode, player.controls_open, world.get_cell_item(target.place)])
	world.rebuild_dirty()
	player.mining_tools.selected = 2 # Wood axe on empty wooden chest.
	for unused in 4: await physics_frame
	_mouse(MOUSE_BUTTON_LEFT, true)
	var deadline := Time.get_ticks_msec() + 4000
	while target.has("place") and world.chunk_store.stations.has(target.place) and Time.get_ticks_msec() < deadline: await process_frame
	_mouse(MOUSE_BUTTON_LEFT, false)
	_expect(target.has("place") and not world.chunk_store.stations.has(target.place) and world.drops.bodies.back().get_meta("slot") == ItemRegistry.CHEST, "actual held LMB recovers empty placed chest")


func _aim(target: Vector3i) -> void:
	var delta := Vector3(target) + Vector3.ONE * 0.5 - player.camera.global_position
	player.rotation.y = atan2(-delta.x, -delta.z)
	player.pitch = atan2(delta.y, Vector2(delta.x, delta.z).length())
	player.camera.rotation.x = player.pitch


func _key(code: Key) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = true
	root.push_input(event, true)
	await process_frame
	event = event.duplicate()
	event.pressed = false
	Input.parse_input_event(event)
	await process_frame


func _click(control: Control) -> void:
	var point := root.get_screen_transform() * (control.get_global_transform_with_canvas() * (control.size * 0.5))
	Input.warp_mouse(point)
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.position = point
	event.global_position = point
	event.pressed = true
	Input.parse_input_event(event)
	await process_frame
	event = event.duplicate()
	event.pressed = false
	Input.parse_input_event(event)
	await process_frame


func _mouse(button: MouseButton, pressed: bool) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = button
	event.position = root.get_visible_rect().size * 0.5
	event.global_position = event.position
	event.pressed = pressed
	root.push_input(event, true)


func _owned(state: Dictionary, inventory: BlockInventory) -> Dictionary:
	var snapshot := inventory.capture()
	var result := {}
	for stack: Array in state.slots + snapshot.slots + snapshot.equipment + [snapshot.cursor]:
		if int(stack[0]) < 0: continue
		var key := "%d:%d" % [stack[0], stack[2] if stack.size() == 3 else -1]
		result[key] = int(result.get(key, 0)) + int(stack[1])
	return result


func _envelope(payload: Dictionary) -> String:
	var raw := JSON.stringify(payload, "", true, true)
	return JSON.stringify({"payload": raw, "sha256": raw.sha256_text()})


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition:
		failures.append(message)
		print("STATION FAIL: " + message)
