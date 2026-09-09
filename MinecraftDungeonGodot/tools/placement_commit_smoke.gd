extends SceneTree


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world: VoxelWorld = instance.get_node("VoxelWorld")
	var player: VoxelPlayer = instance.get_node("Player")
	player.set_physics_process(false)
	var cell := Vector3i(3, 100, 3)
	var observed := {"calls": 0}
	var audit := func() -> void:
		observed.calls += 1
		observed.material = world.get_cell_item(cell)
		observed.orientation = world.chunk_store.get_state(cell)
		observed.stock = player.inventory.count(8)
		observed.placed = player.total_placed
		observed.checkpoint = world.chunk_store.encode(player.capture_state())
	player.inventory.changed.connect(audit)
	var placed := world.place_from_inventory(cell, 8, player.inventory, player.position, 23)
	player.inventory.changed.disconnect(audit)
	var expected := {"material": BlockRegistry.LOG, "orientation": 23, "stock": 7, "placed": 1}
	var valid := placed
	for key in expected: valid = valid and observed.get(key) == expected[key]
	var snapshot := world.chunk_store.inspect_save(observed.get("checkpoint", ""))
	valid = valid and snapshot.ok and snapshot.edits.get(cell, -1) == BlockRegistry.LOG and snapshot.block_states.get(cell, 0) == 23 and snapshot.player.total_placed == 1
	# Failed transactions neither notify observers nor consume another item.
	player.inventory.changed.connect(audit)
	valid = valid and not world.place_from_inventory(cell, 8, player.inventory, player.position, 2)
	valid = valid and not world.place_from_inventory(cell + Vector3i.RIGHT, 8, player.inventory, player.position, 24)
	valid = valid and not world.place_from_inventory(cell + Vector3i.RIGHT, 8, player.inventory, Vector3(cell + Vector3i.RIGHT), 1)
	player.inventory.changed.disconnect(audit)
	valid = valid and observed.calls == 1 and player.inventory.count(8) == 7 and player.total_placed == 1
	var checkpoint: String = observed.checkpoint
	world.set_cell_item(cell, -1)
	player.inventory.consume(8, 7)
	player.inventory.changed.connect(audit)
	valid = valid and not world.place_from_inventory(cell, 8, player.inventory, player.position, 1) and observed.calls == 1
	player.inventory.changed.disconnect(audit)
	var restored := world.apply_saved_game(checkpoint, player)
	valid = valid and restored.ok and world.get_cell_item(cell) == BlockRegistry.LOG and world.chunk_store.get_state(cell) == 23 and player.inventory.count(8) == 7 and player.total_placed == 1
	observed.erase("checkpoint")
	print("PLACEMENT COMMIT: passed=%s observed=%s" % [valid, observed])
	instance.queue_free()
	await process_frame
	quit(0 if valid else 1)
