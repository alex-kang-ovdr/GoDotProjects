extends SceneTree

var failures: Array[String] = []


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var scene := load("res://scenes/main.tscn") as PackedScene
	var instance := scene.instantiate()
	root.add_child(instance)
	for unused in 4:
		await physics_frame
	var world := instance.get_node("VoxelWorld") as VoxelWorld
	var player := instance.get_node("Player") as VoxelPlayer
	_expect(world != null and player != null, "main scene must create the world and player")
	_expect(instance.get_node_or_null("HUD") != null, "main scene must create the HUD")
	var target_cell := Vector3i.ZERO
	for cell: Vector3i in world.layout.cells:
		if int(world.layout.cells[cell]) == BlockRegistry.STONE:
			target_cell = cell
			break
	var initial_count := player.inventory.count(0)
	_expect(world.remove_cell_for_inventory(target_cell, player.inventory), "runtime mining must succeed")
	_expect(world.get_cell_item(target_cell) == -1, "mined voxel cell must be empty")
	_expect(player.inventory.count(0) == initial_count + 1, "mining stone must award cobblestone")
	_expect(world.place_from_inventory(target_cell, 0, player.inventory, Vector3(999, 999, 999)), "runtime placement must succeed")
	_expect(world.get_cell_item(target_cell) == BlockRegistry.COBBLESTONE, "placed material must match the selected slot")
	_expect(player.inventory.count(0) == initial_count, "placement must consume one item")
	_expect(world.chunk_store.edits.get(target_cell) == BlockRegistry.COBBLESTONE, "runtime edit must reach the sparse journal")
	var ray_x := 10
	var ray_z := 10
	var ray_index: int = (ray_z + int(world.layout.size / 2)) * int(world.layout.size) + ray_x + int(world.layout.size / 2)
	var ray_height: int = world.layout.heights[ray_index]
	# Trace through the interior of the column, not the shared corner of four
	# potentially different-height columns/triangles.
	var ray_hit := world.get_target(Vector3(ray_x + 0.5, ray_height + 6.0, ray_z + 0.5), Vector3.DOWN, 10.0)
	_expect(not ray_hit.is_empty() and ray_hit.hit == Vector3i(ray_x, ray_height, ray_z), "physics ray must hit the exact final column top")
	if DisplayServer.get_name() != "headless":
		await _test_viewport_input(world, player)
	if failures.is_empty():
		print("GAMEPLAY SMOKE PASS: scene, collision, mining, inventory, placement, and journal integration")
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		quit(1)


func _test_viewport_input(world: VoxelWorld, player: VoxelPlayer) -> void:
	# Deliver actual viewport events: direct gameplay calls cannot detect HUD interception.
	player.set_physics_process(false)
	var fixture_y: int = Array(world.layout.heights).max() + 6
	player.global_position = Vector3(12.5, fixture_y + 2.0, 12.5)
	player.rotation = Vector3.ZERO
	player.pitch = deg_to_rad(-89.0)
	player.camera.rotation.x = player.pitch
	var input_target := Vector3i(12, fixture_y, 12)
	world.set_cell_item(input_target, BlockRegistry.STONE)
	world.chunk_store.set_block(input_target, BlockRegistry.STONE)
	world.rebuild_dirty()
	for unused in 4:
		await physics_frame
	var target := world.get_target(player.camera.global_position, -player.camera.global_basis.z)
	_expect(not target.is_empty() and target.hit == input_target, "input fixture is in crosshair reach")
	var count_before_click := player.inventory.count(0)
	var click := InputEventMouseButton.new()
	click.button_index = MOUSE_BUTTON_LEFT
	click.position = root.get_visible_rect().size * 0.5
	click.pressed = true
	Input.parse_input_event(click)
	var mining_deadline := Time.get_ticks_msec() + 5000
	while world.get_cell_item(input_target) != -1 and Time.get_ticks_msec() < mining_deadline: await process_frame
	click = click.duplicate()
	click.pressed = false
	Input.parse_input_event(click)
	await process_frame
	_expect(world.get_cell_item(input_target) == -1, "viewport LMB reaches mining through HUD")
	_expect(player.inventory.count(0) == count_before_click and world.drops.bodies.size() == 1, "viewport held LMB creates a delayed physical drop")
	var key := InputEventKey.new()
	key.keycode = KEY_3
	key.pressed = true
	Input.parse_input_event(key)
	await process_frame
	key = key.duplicate()
	key.pressed = false
	Input.parse_input_event(key)
	_expect(player.selected_slot == 2, "viewport number key selects slot")
	# Keep a support block for the placement ray and put the target outside the body.
	world.set_cell_item(input_target + Vector3i.DOWN, BlockRegistry.STONE)
	world.rebuild_dirty()
	for unused in 4:
		await physics_frame
	var right_click := InputEventMouseButton.new()
	right_click.button_index = MOUSE_BUTTON_RIGHT
	right_click.position = root.get_visible_rect().size * 0.5
	right_click.pressed = true
	var bricks_before := player.inventory.count(2)
	Input.parse_input_event(right_click)
	await process_frame
	right_click = right_click.duplicate()
	right_click.pressed = false
	Input.parse_input_event(right_click)
	await process_frame
	_expect(world.get_cell_item(input_target) == BlockRegistry.BRICK, "viewport RMB places selected block")
	_expect(player.inventory.count(2) == bricks_before - 1, "viewport RMB consumes selected inventory")
	if failures.is_empty():
		print("INPUT SMOKE PASS: viewport LMB, number key, RMB with rendered HUD")


func _expect(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
