extends SceneTree

func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var packed := load("res://scenes/main.tscn") as PackedScene
	assert(packed != null, "Failed to load main.tscn")
	var main := packed.instantiate() as Node3D
	root.add_child(main)

	for _i in 6:
		await process_frame

	var world := main.get_node("VoxelWorld") as VoxelWorld
	var player := main.get_node("Player") as VoxelPlayer
	var mobs := main.get_node("MobDirector") as MobDirector
	var hud := main.get_node("HUD") as GameHud
	assert(world != null and player != null and mobs != null and hud != null, "Core scene nodes missing")
	assert(world.chunk_nodes.size() > 0, "Expected greedy-meshed chunks")
	assert(world.visible_face_count() > 500, "Expected visible terrain faces")
	assert(mobs.population_complete, "Expected procedural voxel creature population complete")
	assert(mobs.active_count() >= 24, "Expected at least 24 procedural creatures")
	assert(mobs.variant_counts.size() == 6, "Expected all 6 procedural creature variants")

	# Verify dirty chunk edit + rebuild
	var edit_cell := Vector3i(0, 28, 0)
	var before_serial := world.rebuild_serial
	world.set_cell_item(edit_cell, BlockRegistry.PLANK)
	world.rebuild_dirty()
	assert(world.get_cell_item(edit_cell) == BlockRegistry.PLANK, "Block edit should persist")
	assert(world.rebuild_serial > before_serial, "Dirty chunk should rebuild")

	# Verify save & load roundtrip via VoxelWorld + VoxelSaveService
	var save_path := "user://voxel_frontier_test_save.json"
	world.save_path = save_path
	var done := {"flag": false, "op": "", "res": {}}
	var on_done := func(op: String, res: Dictionary) -> void:
		done.flag = true
		done.op = op
		done.res = res
	world.save_service.completed.connect(on_done)
	assert(world.save_game(player), "Save start failed")
	for _i in 120:
		if done.flag: break
		await process_frame
	assert(done.flag and done.op == "save" and done.res.get("ok", false), "Save failed: %s" % str(done.res))

	done.flag = false
	assert(world.load_game(player), "Load start failed")
	for _i in 120:
		if done.flag: break
		await process_frame
	assert(done.flag and done.op == "load" and done.res.get("ok", false), "Load failed: %s" % str(done.res))
	world.save_service.completed.disconnect(on_done)

	# Verify async/inline regeneration into Dungeon mode
	assert(world.request_generation(2026, 15, true, "dungeon", 16), "Dungeon generation request rejected")
	for _i in 240:
		if not world.generating: break
		await process_frame
	assert(not world.generating, "Dungeon generation timed out")
	assert(world.generation_state == "PASS", "Expected PASS generation state, got: " + world.generation_state)
	assert(world.layout.get("mode") == "dungeon", "Expected dungeon mode after regeneration")
	assert(world.chunk_nodes.size() > 0, "Expected dungeon chunks")

	# Clean up save file and exit
	if FileAccess.file_exists(save_path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(save_path))
	print("VOXEL_FRONTIER_OK chunks=%d faces=%d mobs=%d" % [world.chunk_nodes.size(), world.visible_face_count(), mobs.active_count()])
	quit(0)
