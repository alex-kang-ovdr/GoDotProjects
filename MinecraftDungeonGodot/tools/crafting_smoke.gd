extends SceneTree

var assertions := 0
var failures: Array[String] = []
var output := "res://Saved/Verification/crafting-dev"


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	_data()
	await _runtime()
	for failure in failures: push_error(failure)
	print("CRAFTING SMOKE: %d assertions, %d failures; rendered=%s" % [assertions, failures.size(), DisplayServer.get_name() != "headless"])
	quit(0 if failures.is_empty() else 1)


func _data() -> void:
	var entries := CraftingRecipes.recipes()
	_expect(entries.size() == 14, "fourteen recipes including all nine tools")
	for recipe: Dictionary in entries:
		var grid := CraftingRecipes.canonical(recipe)
		_expect(CraftingRecipes.match_grid(grid, int(recipe.size)).get("id") == recipe.id, "canonical matcher " + recipe.id)
		var mirror := grid.duplicate()
		for y in int(recipe.size):
			for x in int(recipe.size): mirror[y * int(recipe.size) + x] = grid[y * int(recipe.size) + int(recipe.size) - 1 - x]
		_expect(CraftingRecipes.match_grid(mirror, int(recipe.size)).get("id") == recipe.id, "mirrored matcher " + recipe.id)
		var bad := grid.duplicate()
		for index in bad.size():
			if int(bad[index]) >= 0:
				bad[index] = ItemRegistry.COAL
				break
		_expect(CraftingRecipes.match_grid(bad, int(recipe.size)).is_empty(), "wrong ingredient cannot match " + recipe.id)
		var inventory := BlockInventory.new(0)
		inventory.add(ItemRegistry.WORKBENCH)
		for item: int in CraftingRecipes.ingredients(recipe): inventory.add(item, int(CraftingRecipes.ingredients(recipe)[item]))
		var before := inventory.capture()
		_expect(CraftingRecipes.craft(inventory, recipe.id, false).ok and inventory.capture() == before, "dry run does not mutate " + recipe.id)
		var callback := {"count": 0, "valid": true}
		inventory.changed.connect(func() -> void:
			callback.count += 1
			callback.valid = callback.valid and BlockInventory.validate(inventory.capture()).is_empty() and inventory.total(int(recipe.output[0])) >= int(recipe.output[1])
		)
		_expect(CraftingRecipes.craft(inventory, recipe.id).ok and callback.count == 1 and callback.valid, "single committed recipe event " + recipe.id)
		_expect(inventory.total(int(recipe.output[0])) >= int(recipe.output[1]), "output acquired " + recipe.id)
		for connection: Dictionary in inventory.changed.get_connections(): inventory.changed.disconnect(connection.callable)
	_expect(CraftingRecipes.match_grid([-1, -1, -1, 8], 2).get("id") == "planks", "shapeless accepts shifted log")
	_expect(CraftingRecipes.match_grid([-1, 3, -1, 3], 2).get("id") == "sticks", "shaped accepts translated vertical planks")
	_expect(CraftingRecipes.match_grid([3, 3, -1, -1], 2).is_empty(), "horizontal planks are not vertical stick recipe")
	for invalid in [[3], [3, 3, 3, true], [3, 3, 3, null], [3, 3, 3, 1.5]]:
		_expect(CraftingRecipes.match_grid(invalid, 2).is_empty(), "malformed grid rejected")
	var inventory := BlockInventory.new(0)
	inventory.add(3, 8)
	inventory.add(ItemRegistry.STICK, 2)
	var before := inventory.capture()
	_expect(not CraftingRecipes.craft(inventory, "tool_16").ok and inventory.capture() == before, "3x3 cannot bypass workbench requirement")
	_expect(not CraftingRecipes.craft(inventory, "missing").ok and inventory.capture() == before, "unknown recipe rejects")
	inventory.reset(0)
	inventory.add(0, 2304)
	inventory.set_stack(0, 8, 64)
	before = inventory.capture()
	_expect(not CraftingRecipes.craft(inventory, "planks").ok and inventory.capture() == before, "full output capacity rejects without consuming log")
	inventory.set_stack(0, 8, 1)
	_expect(CraftingRecipes.craft(inventory, "planks").ok and inventory.count(0) == 4 and inventory.item_at(0) == 3, "consumption can free output slot")
	inventory.reset(0)
	inventory.add(ItemRegistry.TOOL_BASE, 2)
	_expect(inventory.count(0) == 1 and inventory.count(1) == 1, "tools occupy distinct non-stackable slots")
	inventory.durability[0] = 17
	inventory.click(0)
	inventory.click(1)
	_expect(inventory.durability[1] == 17 and Array(inventory.cursor) == [16, 1, 59], "same-kind tools swap without merging or repairing")
	inventory.click(0)
	_expect(inventory.equip_from_slot(1, 0) and inventory.equipment[0] == [16, 1, 17] and inventory.item_at(1) == -1, "equipment preserves per-instance wear")
	var gear := MiningTools.new()
	gear.inventory = inventory
	_expect(gear.effective().kind == "pickaxe" and gear.effective().tier == 1, "equipped tool provides mining stats")
	for unused in 17: gear.wear()
	_expect(inventory.equipment[0] == [16, 1, 0] and gear.effective().kind == "hand", "equipped exhausted tool becomes hand without fallback repair")
	_expect(inventory.click_equipment(0) and Array(inventory.cursor) == [16, 1, 0], "unequip preserves exhausted tool on cursor")
	inventory.click(2)
	inventory.set_stack(3, 8, 1)
	inventory.click(3)
	before = inventory.capture()
	_expect(not inventory.click_equipment(0) and inventory.capture() == before, "equipment rejects ordinary blocks atomically")
	for item in range(ItemRegistry.TOOL_BASE, ItemRegistry.COUNT):
		for bad in [[item, 1], [item, 2, 1], [item, 1, -1], [item, 1, 251], [item, 1, 0.5]]:
			_expect(not BlockInventory.valid_stack(bad), "malformed tool stack rejected")
	var legacy := BlockInventory.new(8).capture()
	legacy.erase("equipment")
	_expect(not BlockInventory.validate(legacy).is_empty() and BlockInventory.validate(BlockInventory.migrate_v5(legacy)).is_empty(), "format5 migrates explicitly; current schema requires gear")
	legacy.slots[0] = [ItemRegistry.STICK, 1]
	_expect(BlockInventory.migrate_v5(legacy).is_empty(), "legacy cannot smuggle future item IDs")
	inventory.reset(0)
	inventory.add(ItemRegistry.WORKBENCH)
	inventory.click(0)
	inventory.add(3, 3)
	inventory.add(ItemRegistry.STICK, 2)
	before = inventory.capture()
	_expect(not CraftingRecipes.craft(inventory, "tool_16").ok and inventory.capture() == before, "held workbench does not bypass carried workbench gate")
	inventory.reset(0)
	for item in range(ItemRegistry.TOOL_BASE, ItemRegistry.COUNT):
		inventory.add(item, 2)
	for slot in 18: inventory.durability[slot] = slot # Distinct wear signatures for same-kind pairs.
	inventory.add(8, 64)
	inventory.add(3, 63)
	var owned := _ownership(inventory)
	var random := RandomNumberGenerator.new()
	random.seed = 619223
	for operation in 2500:
		match random.randi_range(0, 3):
			0: inventory.click(random.randi_range(0, 35))
			1: inventory.click(random.randi_range(0, 35), true)
			2: inventory.click_equipment(random.randi_range(0, 3))
			3: inventory.equip_from_slot(random.randi_range(0, 35), random.randi_range(0, 3))
		_expect(BlockInventory.validate(inventory.capture()).is_empty() and _ownership(inventory) == owned, "mixed tool/gear/cursor ownership and wear conservation %d" % operation)


func _runtime() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world: VoxelWorld = instance.get_node("VoxelWorld")
	var player: VoxelPlayer = instance.get_node("Player")
	var panel: CraftingPanel = instance.get_node("CraftingPanel")
	var inventory_panel: InventoryPanel = instance.get_node("InventoryPanel")
	player.set_physics_process(false)
	world.drops.set_physics_process(false)
	await process_frame
	await _key(KEY_C)
	_expect(panel.opened and player.controls_open, "C opens actual crafting modal")
	await _key(KEY_ENTER)
	_expect(player.inventory.total(8) == 7 and player.inventory.total(3) == 12, "actual Enter consumes log and creates four planks")
	await _key(KEY_DOWN)
	await _key(KEY_ENTER)
	_expect(player.inventory.total(ItemRegistry.STICK) == 4 and player.inventory.total(3) == 10, "actual stick recipe")
	await _key(KEY_DOWN)
	await _key(KEY_ENTER)
	_expect(player.inventory.total(ItemRegistry.WORKBENCH) == 1 and player.inventory.total(3) == 6, "actual workbench recipe unlocks 3x3")
	for unused in 3: await _key(KEY_DOWN)
	await _key(KEY_ENTER)
	_expect(player.inventory.total(16) == 1 and player.inventory.total(3) == 3 and player.inventory.total(9) == 2, "actual wood pickaxe recipe consumes exact materials")
	await _key(KEY_ESCAPE)
	await _key(KEY_E)
	var tool_slot := -1
	for slot in 36:
		if player.inventory.item_at(slot) == 16: tool_slot = slot
	for unused in tool_slot: await _key(KEY_RIGHT)
	await _key(KEY_Q)
	_expect(player.inventory.equipment[0] == [16, 1, 59] and player.inventory.item_at(tool_slot) == -1, "actual Q equips crafted instance")
	await _key(KEY_F)
	_expect(inventory_panel.equipment_grid.visible and not inventory_panel.grid.visible, "actual F displays equipment view")
	await _key(KEY_ESCAPE)
	var cell := Vector3i(0, 100, 0)
	world.set_cell_item(cell, BlockRegistry.STONE)
	player.mining_tools.selected = 9 # Preview iron shovel must not override equipped wood pick.
	var expected_duration := 1.125
	_expect(is_equal_approx(player.mining_tools.duration(BlockRegistry.STONE), expected_duration), "equipped wood speed overrides preview selection")
	if DisplayServer.get_name() != "headless":
		world.rebuild_dirty()
		player.position = Vector3(0.5, 98.8, 3.5)
		var delta := Vector3(cell) + Vector3.ONE * 0.5 - player.camera.global_position
		player.rotation.y = atan2(-delta.x, -delta.z)
		player.pitch = atan2(delta.y, Vector2(delta.x, delta.z).length())
		player.camera.rotation.x = player.pitch
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		for unused in 6: await physics_frame
		_expect(world.get_target(player.camera.global_position, -player.camera.global_basis.z).get("hit") == cell, "crafted tool fixture has actual collision ray hit")
		await _left(true)
		var progress_deadline := Time.get_ticks_msec() + 1000
		while player.mining_elapsed <= 0.0 and world.get_cell_item(cell) == BlockRegistry.STONE and Time.get_ticks_msec() < progress_deadline:
			await process_frame
		_expect(world.get_cell_item(cell) == BlockRegistry.STONE and player.mining_elapsed > 0 and player.inventory.equipment[0][2] == 59, "held LMB accumulates crafted tool progress without early wear")
		var deadline := Time.get_ticks_msec() + 3000
		while world.get_cell_item(cell) != -1 and Time.get_ticks_msec() < deadline: await process_frame
		await _left(false)
	else:
		_expect(world.finish_mining(cell, BlockRegistry.STONE, player), "headless production mining completion")
	_expect(world.get_cell_item(cell) == -1 and player.inventory.equipment[0][2] == 58 and world.drops.bodies.size() == 1, "production mining wears crafted instance once and creates loot")
	var encoded := world.chunk_store.encode(player.capture_state())
	player.inventory.reset(0)
	_expect(world.apply_saved_game(encoded, player).ok and player.inventory.equipment[0] == [16, 1, 58] and player.inventory.total(13) == 1, "runtime save restores crafted equipment and ingredients")
	var payload: Dictionary = JSON.parse_string(JSON.parse_string(encoded).payload)
	var stable := player.capture_state()
	for container: String in ["cursor", "slots"]:
		for bad in [[16, 1], [16, 2, 59], [16, 1, -1], [16, 1, 60], [19, 1, 132], [24, 1, 251], [16, 1, true], [16, 1, 0.25]]:
			var malformed: Dictionary = JSON.parse_string(JSON.parse_string(encoded).payload)
			if container == "cursor": malformed.player.inventory.cursor = bad
			else: malformed.player.inventory.slots[35] = bad
			var malformed_raw := JSON.stringify(malformed, "", true, true)
			_expect(not world.apply_saved_game(JSON.stringify({"payload": malformed_raw, "sha256": malformed_raw.sha256_text()}), player).ok and player.capture_state() == stable, "bad tool metadata rejected atomically in " + container)
	for bad in [[], [[0, 1], [-1, 0], [-1, 0], [-1, 0]], [[16, 1, 60], [-1, 0], [-1, 0], [-1, 0]]]:
		payload.player.inventory.equipment = bad
		var raw := JSON.stringify(payload, "", true, true)
		_expect(not world.apply_saved_game(JSON.stringify({"payload": raw, "sha256": raw.sha256_text()}), player).ok and player.capture_state() == stable, "bad gear save leaves world and player unchanged")
	# Full envelope migration, not only the inventory helper.
	payload = JSON.parse_string(JSON.parse_string(encoded).payload)
	payload.format_version = 5
	payload.player.inventory = BlockInventory.new(8).capture()
	payload.player.inventory.erase("equipment")
	var legacy_raw := JSON.stringify(payload, "", true, true)
	_expect(world.apply_saved_game(JSON.stringify({"payload": legacy_raw, "sha256": legacy_raw.sha256_text()}), player).ok and player.inventory.equipment == [[-1, 0], [-1, 0], [-1, 0], [-1, 0]], "complete format5 checkpoint migrates empty gear")
	_expect(world.apply_saved_game(encoded, player).ok, "restore current checkpoint after legacy test")
	if DisplayServer.get_name() != "headless":
		await _key(KEY_C)
		for size_value in [Vector2i(1280, 720), Vector2i(640, 480)]:
			root.size = size_value
			await create_timer(0.15).timeout
			await RenderingServer.frame_post_draw
			_expect(root.get_visible_rect().encloses(panel.panel.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, panel.panel.size)), "crafting panel fits %s" % size_value)
			DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output))
			_expect(root.get_texture().get_image().save_png(output.path_join("crafting-%dx%d.png" % [size_value.x, size_value.y])) == OK, "native crafting capture")
			panel.scroll.ensure_control_visible(panel.recipe_buttons[0])
			await process_frame
			await _click(panel.recipe_buttons[0])
			if panel.selected != 0:
				await RenderingServer.frame_post_draw
				await _click(panel.recipe_buttons[0])
			var before_logs := player.inventory.total(8)
			var before_planks := player.inventory.total(3)
			await _click(panel.craft_button)
			_expect(panel.selected == 0 and player.inventory.total(8) == before_logs - 1 and player.inventory.total(3) == before_planks + 4, "actual mouse selects and crafts at %s selected=%d logs=%d>%d planks=%d>%d disabled=%s opened=%s mouse=%d" % [size_value, panel.selected, before_logs, player.inventory.total(8), before_planks, player.inventory.total(3), panel.craft_button.disabled, panel.opened, Input.mouse_mode])
		await _key(KEY_ESCAPE)
		await _key(KEY_E)
		await _key(KEY_F)
		await RenderingServer.frame_post_draw
		_expect(root.get_visible_rect().encloses(inventory_panel.panel.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, inventory_panel.panel.size)), "equipment panel fits small viewport")
		_expect(root.get_texture().get_image().save_png(output.path_join("equipment-small.png")) == OK, "native equipment capture")
		await _click(inventory_panel.gear_buttons[0])
		_expect(Array(player.inventory.cursor) == [16, 1, 58] and player.inventory.equipment[0] == [-1, 0], "small-window mouse unequips worn instance")
		await _key(KEY_DOWN)
		await _key(KEY_ENTER)
		_expect(inventory_panel.selected_gear == 1 and player.inventory.equipment[1] == [16, 1, 58] and player.inventory.cursor[0] == -1, "gear keyboard selection transfers cursor to spare")
		await _click(inventory_panel.gear_buttons[1])
		await _click(inventory_panel.gear_buttons[0])
		_expect(player.inventory.equipment[0] == [16, 1, 58] and player.inventory.equipment[1] == [-1, 0], "mouse reequips without durability reset")
		await _key(KEY_ESCAPE)
	instance.queue_free()
	await process_frame


func _key(code: Key) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.physical_keycode = code
	event.pressed = true
	Input.parse_input_event(event)
	await process_frame
	event = event.duplicate()
	event.pressed = false
	Input.parse_input_event(event)
	await process_frame


func _click(control: Control) -> void:
	var point := root.get_screen_transform() * (control.get_global_transform_with_canvas() * (control.size * 0.5))
	Input.warp_mouse(point)
	var motion := InputEventMouseMotion.new()
	motion.position = point
	motion.global_position = point
	Input.parse_input_event(motion)
	await process_frame
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


func _left(pressed: bool) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.position = root.get_visible_rect().size * 0.5
	event.pressed = pressed
	root.push_input(event)
	await process_frame


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition:
		failures.append(message)
		print("CRAFTING FAIL: " + message)


func _ownership(inventory: BlockInventory) -> Dictionary:
	var state := inventory.capture()
	var result := {}
	for stack: Array in state.slots + state.equipment + [state.cursor]:
		if int(stack[0]) < 0: continue
		var signature := "%d:%d" % [stack[0], stack[2] if stack.size() == 3 else -1]
		result[signature] = int(result.get(signature, 0)) + int(stack[1])
	return result
