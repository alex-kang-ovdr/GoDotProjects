extends SceneTree

var assertions := 0
var failures: Array[String] = []
var output := "res://Saved/Verification/inventory-dev"


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	_data()
	await _runtime()
	for failure in failures: push_error(failure)
	print("INVENTORY SMOKE: %d assertions, %d failures; 10000 cursor operations; rendered=%s" % [assertions, failures.size(), DisplayServer.get_name() != "headless"])
	quit(0 if failures.is_empty() else 1)


func _data() -> void:
	var inventory := BlockInventory.new(8)
	_expect(inventory.counts.size() == 36 and inventory.items.size() == 36, "36 real slots")
	_expect(inventory.click(8, true) and inventory.count(8) == 4 and Array(inventory.cursor) == [8, 4], "right pickup takes half")
	_expect(inventory.click(35, true) and inventory.item_at(35) == 8 and inventory.count(35) == 1 and inventory.cursor[1] == 3, "right places one into last backpack slot")
	_expect(inventory.click(0) and inventory.item_at(0) == 8 and inventory.count(0) == 3 and Array(inventory.cursor) == [0, 8], "left swaps different items")
	var saved := inventory.capture()
	_expect(not inventory.click(-1) and not inventory.click(36) and inventory.capture() == saved, "out-of-panel indices are no-ops")
	_expect(not inventory.click(0, true) and inventory.capture() == saved, "right cannot swap a different item")
	_expect(inventory.click(9) and inventory.count(9) == 8 and inventory.cursor[0] == -1, "left empties cursor")
	inventory.set_stack(10, 2, 63)
	inventory.set_stack(11, 2, 5)
	inventory.click(11)
	inventory.click(10)
	_expect(inventory.count(10) == 64 and Array(inventory.cursor) == [2, 4], "merge keeps overflow on cursor")
	inventory.click(11)
	inventory.click(11, true)
	_expect(inventory.cursor[1] == 2 and inventory.count(11) == 2, "even half split")
	inventory.click(11, true)
	inventory.click(11)
	inventory.click(11, true)
	_expect(inventory.cursor[1] == 2 and inventory.count(11) == 2, "whole merge then half remains exact")
	inventory.reset(0)
	_expect(inventory.add(8, 65) and inventory.item_at(0) == 8 and inventory.count(0) == 64 and inventory.item_at(1) == 8 and inventory.count(1) == 1, "pickup spans stacks in lowest free slots")
	inventory.consume(0, 64)
	_expect(inventory.add(8, 1) and inventory.count(0) == 0 and inventory.count(1) == 2, "existing matching stack wins over earlier empty slot")
	inventory.reset(0)
	_expect(inventory.add(0, 2304) and not inventory.can_add(0) and not inventory.add(0), "all 36 stacks bound capacity at 2304")
	var full := inventory.capture()
	_expect(not inventory.add(-1) and not inventory.add(ItemRegistry.COUNT) and not inventory.add(0, -1) and inventory.capture() == full, "invalid pickups preserve state")
	inventory.consume(35, 1)
	_expect(not inventory.add(0, 2) and inventory.count(35) == 63, "whole pickup rejects insufficient capacity without partial mutation")
	_expect(inventory.add(0) and inventory.count(35) == 64, "last available cell fills exactly")
	for bad in [null, {}, [], {"slots": [], "cursor": [-1, 0]}]:
		_expect(not inventory.restore(bad) and inventory.capture() == full, "malformed restore rejected atomically")
	for bad in [[-1, 1], [0, 0], [ItemRegistry.COUNT, 1], [0, 65], [0.5, 1], [0, 1.5], [true, 1], [0, null], [0, 1, 2]]:
		for field in ["slots", "cursor"]:
			var invalid := full.duplicate(true)
			if field == "slots": invalid.slots[35] = bad
			else: invalid.cursor = bad
			_expect(not inventory.restore(invalid) and inventory.capture() == full, "invalid item/count/empty/cursor form rejected atomically")
	var legacy := BlockInventory.migrate_legacy([0, 1, 2, 3, 4, 5, 6, 7, 64])
	_expect(legacy.slots[0] == [-1, 0] and legacy.slots[8] == [8, 64] and legacy.slots[35] == [-1, 0] and legacy.cursor == [-1, 0], "legacy IDs and counts migrate with empty backpack/cursor")
	_expect(BlockInventory.migrate_legacy([0, 1, 2, 3, 4, 5, 6, 7, 65]).is_empty(), "corrupt legacy cannot migrate")
	# Independent reference manipulates [item,count] pairs without production APIs.
	inventory.reset(8)
	var reference := inventory.capture()
	var baseline := _totals(reference)
	var audit := {"calls": 0, "errors": 0}
	inventory.changed.connect(func() -> void:
		audit.calls += 1
		if _totals(inventory.capture()) != baseline or not BlockInventory.validate(inventory.capture()).is_empty(): audit.errors += 1
	)
	var rng := RandomNumberGenerator.new()
	rng.seed = 73051
	for step in 10000:
		var slot := rng.randi_range(0, 35)
		var half := rng.randi_range(0, 1) == 1
		_reference_click(reference, slot, half)
		inventory.click(slot, half)
		_expect(inventory.capture() == reference and _totals(reference) == baseline, "reference cursor operation %d" % step)
	_expect(audit.calls > 1000 and audit.errors == 0, "change observers only see conserved valid committed state")
	var detached := inventory.capture()
	var clone := BlockInventory.new(0)
	clone.restore(detached)
	detached.slots[0] = [0, 64]
	detached.cursor = [0, 64]
	_expect(clone.capture() == inventory.capture(), "capture/restore do not alias input arrays")


func _reference_click(state: Dictionary, slot: int, half: bool) -> void:
	var held: Array = state.cursor
	var target: Array = state.slots[slot]
	if held[1] == 0:
		if target[1] == 0: return
		var amount := int((target[1] + 1) / 2) if half else int(target[1])
		state.cursor = [target[0], amount]
		state.slots[slot] = [target[0], target[1] - amount] if target[1] > amount else [-1, 0]
	elif target[1] == 0 or target[0] == held[0]:
		var amount := mini(64 - int(target[1]), 1 if half else int(held[1]))
		state.slots[slot] = [held[0], target[1] + amount]
		state.cursor = [held[0], held[1] - amount] if held[1] > amount else [-1, 0]
	elif not half:
		state.cursor = target.duplicate()
		state.slots[slot] = held.duplicate()


func _totals(state: Dictionary) -> Array:
	var result := [0, 0, 0, 0, 0, 0, 0, 0, 0]
	for stack: Array in state.slots + [state.cursor]:
		if int(stack[0]) >= 0: result[int(stack[0])] += int(stack[1])
	return result


func _runtime() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world: VoxelWorld = instance.get_node("VoxelWorld")
	var player: VoxelPlayer = instance.get_node("Player")
	var panel: InventoryPanel = instance.get_node("InventoryPanel")
	var controls: GenerationControls = instance.get_node("GenerationControls")
	player.set_physics_process(false)
	world.drops.set_physics_process(false)
	await process_frame
	var hidden_style := panel.buttons[0].get_theme_stylebox("normal")
	player.inventory.add(0)
	_expect(panel.buttons[0].get_theme_stylebox("normal") == hidden_style, "hidden modal does not rebuild slot visuals on pickup")
	player.inventory.consume(0)
	await _key(KEY_E)
	_expect(panel.opened and player.controls_open and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE, "E opens real inventory modal")
	await _key(KEY_TAB)
	_expect(not controls.opened and panel.opened, "generation panel cannot overlap inventory")
	for unused in 8: await _key(KEY_RIGHT)
	await _key(KEY_ENTER, true)
	_expect(Array(player.inventory.cursor) == [8, 4] and player.inventory.count(8) == 4, "keyboard selects independently and half-picks log")
	await _key(KEY_HOME) # No binding: no transfer.
	for unused in 3: await _key(KEY_DOWN)
	await _key(KEY_ENTER, true)
	_expect(panel.selected == 35 and player.inventory.item_at(35) == 8 and player.inventory.count(35) == 1, "keyboard reaches last backpack slot and deposits one")
	await _key(KEY_ESCAPE)
	_expect(not panel.opened and not player.controls_open and Array(player.inventory.cursor) == [8, 3], "closing retains owned cursor and restores gameplay")
	var encoded := world.chunk_store.encode(player.capture_state())
	player.inventory.reset(0)
	_expect(world.apply_saved_game(encoded, player).ok and player.inventory.count(35) == 1 and Array(player.inventory.cursor) == [8, 3], "real save restore preserves backpack and held cursor")
	var payload: Dictionary = JSON.parse_string(JSON.parse_string(encoded).payload)
	for legacy in [2, 3, 4]:
		var old := payload.duplicate(true)
		old.format_version = legacy
		old.player.inventory = [8, 7, 6, 5, 4, 3, 2, 1, 0]
		_expect(world.apply_saved_game(_envelope(old), player).ok and player.inventory.item_at(8) == -1 and player.inventory.count(1) == 7 and player.inventory.count(35) == 0 and player.inventory.cursor[1] == 0, "format %d migrates and erases stale backpack/cursor" % legacy)
	world.apply_saved_game(encoded, player)
	var before := player.capture_state()
	for bad in [null, {}, [8, 8, 8, 8, 8, 8, 8, 8, 8]]:
		var invalid := payload.duplicate(true)
		invalid.player.inventory = bad
		_expect(not world.apply_saved_game(_envelope(invalid), player).ok and player.capture_state() == before, "format5 requires full inventory and rejects without mutation")
	# Move a log into slot 0 then place it: the old fixed-slot mapping would place cobble.
	player.inventory.click(0)
	player.inventory.click(9)
	var cell := Vector3i(3, 100, 3)
	_expect(player.inventory.item_at(0) == 8 and world.place_from_inventory(cell, 0, player.inventory, player.position, 23) and world.get_cell_item(cell) == BlockRegistry.LOG, "placement uses moved item identity, not selected slot ID")
	_expect(player.total_placed == 1 and player.inventory.count(0) == 2, "transfer does not count as placement; one placed item consumed")
	var hud: GameHud = instance.get_node("HUD")
	_expect((hud.slot_panels[0].get_child(0) as Label).text.contains("Log"), "hotbar displays moved identity")
	if DisplayServer.get_name() != "headless":
		player.position = Vector3(cell) + Vector3(0.5, 0, 4)
		var aim := world.map_to_local(cell) - player.camera.global_position
		player.rotation.y = atan2(-aim.x, -aim.z)
		player.pitch = atan2(aim.y, Vector2(aim.x, aim.z).length())
		player.camera.rotation.x = player.pitch
		for unused in 3: await physics_frame
		var target := world.get_target(player.camera.global_position, -player.camera.global_basis.z)
		_expect(not target.is_empty(), "moved-stack placement has actual ray target")
		if not target.is_empty():
			await _click(root.get_visible_rect().size * 0.5, MOUSE_BUTTON_RIGHT)
			_expect(world.get_cell_item(target.place) == BlockRegistry.LOG and player.inventory.count(0) == 1, "actual RMB places moved log from slot0 and consumes one")
		await _key(KEY_E)
		await _click(panel.buttons[35].get_global_rect().get_center(), MOUSE_BUTTON_LEFT)
		_expect(panel.selected == 35 and Array(player.inventory.cursor) == [8, 1], "actual mouse picks last slot")
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
		world.save_path = output.path_join("inventory-checkpoint.json")
		await _key(KEY_8, false, true)
		var deadline := Time.get_ticks_msec() + 5000
		while world.save_service.is_busy() and Time.get_ticks_msec() < deadline: await process_frame
		_expect(not world.save_service.is_busy() and FileAccess.file_exists(world.save_path), "Ctrl+8 saves held cursor from open inventory")
		player.inventory.click(35)
		await _key(KEY_9, false, true)
		deadline = Time.get_ticks_msec() + 5000
		while world.save_service.is_busy() and Time.get_ticks_msec() < deadline: await process_frame
		_expect(not world.save_service.is_busy() and panel.opened and Array(player.inventory.cursor) == [8, 1] and player.inventory.count(35) == 0, "Ctrl+9 restores held cursor while modal stays open")
		var stationary := player.position
		player.set_physics_process(true)
		var walking := InputEventKey.new()
		walking.keycode = KEY_W
		walking.physical_keycode = KEY_W
		walking.pressed = true
		Input.parse_input_event(walking)
		for unused in 4: await physics_frame
		walking = walking.duplicate()
		walking.pressed = false
		Input.parse_input_event(walking)
		_expect(player.position == stationary and player.velocity == Vector3.ZERO, "open inventory blocks held movement and gravity without drift")
		player.set_physics_process(false)
		var snapshot := player.inventory.capture()
		await _click(Vector2(3, 3), MOUSE_BUTTON_LEFT)
		_expect(player.inventory.capture() == snapshot and not player.mining_held, "background click does not transfer or mine world")
		await _key(KEY_LEFT)
		await _key(KEY_ENTER)
		_expect(player.inventory.item_at(34) == 8 and player.inventory.cursor[1] == 0, "keyboard after mouse targets keyboard selection")
		for size_value in [Vector2i(1280, 900), Vector2i(1280, 720), Vector2i(640, 480)]:
			root.size = size_value
			await create_timer(0.15).timeout
			for unused in 4: await process_frame
			await RenderingServer.frame_post_draw
			print("INVENTORY LAYOUT: requested=%s window=%s visible=%s stretch=%s panel=%s image=%s" % [size_value, root.size, root.get_visible_rect(), root.get_stretch_transform(), panel.panel.get_global_rect(), root.get_texture().get_image().get_size()])
			var bounds := root.get_visible_rect()
			_expect(bounds.encloses(panel.panel.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, panel.panel.size)), "panel fits rendered viewport %s" % size_value)
			for button in panel.buttons: _expect(bounds.encloses(button.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, button.size)), "slot visible at %s" % size_value)
			panel.selected = 0
			player.inventory.set_stack(33, 2, 5)
			await _click(panel.buttons[33].get_global_transform_with_canvas() * (panel.buttons[33].size * 0.5), MOUSE_BUTTON_RIGHT)
			_expect(panel.selected == 33 and Array(player.inventory.cursor) == [2, 3] and player.inventory.count(33) == 2, "actual mouse half-picks scaled odd stack at %s" % size_value)
			await _click(panel.buttons[32].get_global_transform_with_canvas() * (panel.buttons[32].size * 0.5), MOUSE_BUTTON_LEFT)
			_expect(player.inventory.cursor[1] == 0 and player.inventory.item_at(32) == 2, "actual mouse deposits scaled held stack at %s" % size_value)
			DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
			_expect(root.get_texture().get_image().save_png(output.path_join("inventory-%dx%d.png" % [size_value.x, size_value.y])) == OK, "native inventory capture")
		await _key(KEY_ESCAPE)
		await _key(KEY_TAB)
		await _key(KEY_E)
		_expect(controls.opened and not panel.opened and player.controls_open, "inventory cannot steal generation modal")
		controls.set_open(false)
	world.generate_world(1337, 41, "dungeon", 34)
	_expect(player.inventory.count(0) == 8 and player.inventory.item_at(0) == 0 and player.inventory.count(35) == 0 and player.inventory.cursor[1] == 0, "new world resets every dynamic slot and cursor")
	instance.queue_free()
	await process_frame


func _key(code: Key, shift: bool = false, ctrl: bool = false) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.physical_keycode = code
	event.shift_pressed = shift
	event.ctrl_pressed = ctrl
	event.pressed = true
	Input.parse_input_event(event)
	await process_frame
	event = event.duplicate()
	event.pressed = false
	Input.parse_input_event(event)
	await process_frame


func _click(at: Vector2, button: MouseButton) -> void:
	# Input.parse_input_event expects window-client coordinates, including
	# stretch and letterbox offset; get_screen_transform here excludes OS origin.
	at = root.get_screen_transform() * at
	Input.warp_mouse(at)
	var event := InputEventMouseButton.new()
	event.position = at
	event.global_position = at
	event.button_index = button
	event.pressed = true
	Input.parse_input_event(event)
	await process_frame
	event = event.duplicate()
	event.pressed = false
	Input.parse_input_event(event)
	await process_frame


func _envelope(payload: Dictionary) -> String:
	var raw := JSON.stringify(payload, "", true, true)
	return JSON.stringify({"payload": raw, "sha256": raw.sha256_text()})


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition:
		failures.append(message)
		print("INVENTORY FAIL: " + message)
