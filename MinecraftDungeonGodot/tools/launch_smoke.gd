extends SceneTree


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var scene := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(scene)
	var world := scene.get_node("VoxelWorld") as VoxelWorld
	var controls := scene.get_node("GenerationControls") as GenerationControls
	var player := scene.get_node("Player") as VoxelPlayer
	var legacy := "--case=legacy" in OS.get_cmdline_user_args()
	var expected_mode := "overworld" if legacy else "dungeon"
	var expected_size := 43 if legacy else 13
	var expected_seed := 42 if legacy else -7
	var passed: bool = world.layout.get("mode", "overworld") == expected_mode and world.world_size == expected_size and world.world_seed == expected_seed
	passed = passed and world.generation_count == 1 and world.generation_state == ("PASS" if legacy else "READY") and world.generation_checks == legacy
	passed = passed and controls.active_poi and controls.draft_poi and controls.draft_mode == expected_mode and controls.draft_checks == legacy
	passed = passed and controls.draft_room_attempts == 34
	passed = passed and controls.poi_root.get_child_count() == (6 if legacy else 2)
	passed = passed and world.chunk_store.generation_options == ({"mode": "overworld"} if legacy else {"mode": "dungeon", "room_attempts": 34})
	for unused in 45: await physics_frame
	passed = passed and player.is_on_floor()
	print("LAUNCH SMOKE: passed=%s mode=%s seed=%d size=%d runs=%d checks=%s poi=%d" % [passed, world.layout.get("mode", "overworld"), world.world_seed, world.world_size, world.generation_count, world.generation_checks, controls.poi_root.get_child_count()])
	if not passed: push_error("CLI did not configure the first world, controls, player or POI")
	quit(0 if passed else 1)
