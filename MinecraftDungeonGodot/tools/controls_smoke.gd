extends SceneTree

var failures: Array[String] = []
var assertions := 0
var output_directory := "res://Saved/Verification/controls"
var world: VoxelWorld
var player: VoxelPlayer
var controls: GenerationControls
var large := false


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
		if argument == "--large": large = true
	call_deferred("_run")


func _run() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	world = instance.get_node("VoxelWorld")
	world.generation_trace_enabled = true
	player = instance.get_node("Player")
	controls = instance.get_node("GenerationControls")
	player.set_physics_process(false)
	var signature_before: int = world.layout.signature
	var count_before := world.generation_count
	var initial_mouse_mode := Input.mouse_mode
	await _key(KEY_TAB)
	_expect(controls.opened and player.controls_open and Input.mouse_mode == Input.MOUSE_MODE_VISIBLE, "Tab opens panel and captures gameplay")
	await _key(KEY_DOWN)
	await _key(KEY_RIGHT)
	_expect(controls.draft_seed == 1338 and world.layout.signature == signature_before, "draft change does not regenerate world")
	await _key(KEY_N)
	await _key(KEY_MINUS)
	await _key(KEY_7)
	await _key(KEY_ENTER)
	_expect(controls.draft_seed == -7 and not controls.editing_number, "negative numeric seed entry")
	await _key(KEY_N)
	await _key(KEY_9)
	await _key(KEY_ESCAPE)
	_expect(controls.draft_seed == -7 and controls.opened, "Escape cancels number entry without closing panel")
	await _key(KEY_DOWN)
	await _key(KEY_RIGHT)
	_expect(controls.draft_size == 43, "size changes in odd steps")
	await _key(KEY_PAGEUP)
	_expect(controls.draft_size == 63, "size page step is 20")
	await _key(KEY_N)
	await _key(KEY_4)
	await _key(KEY_2)
	await _key(KEY_ENTER)
	_expect(controls.draft_size == 43, "even numeric size normalizes upward to odd")
	await _key(KEY_DOWN)
	await _key(KEY_DOWN)
	await _key(KEY_RIGHT)
	await _key(KEY_DOWN)
	await _key(KEY_RIGHT)
	_expect(not controls.draft_checks and controls.draft_poi and not controls.active_poi, "checks and POI have separate deferred drafts")
	var pose_before := player.capture_state()
	player.set_physics_process(true)
	await _key(KEY_W)
	await _key(KEY_3)
	_expect(player.capture_state() == pose_before, "panel keys do not move player or select hotbar")
	player.set_physics_process(false)
	await _key(KEY_G)
	_expect(world.generating, "G starts asynchronous generation")
	_expect(not controls.apply_draft(), "duplicate generation request rejected")
	_expect(not world.save_game(player) and not world.load_game(player), "generation locks checkpoint operations")
	_expect(not world.remove_cell_for_inventory(world.layout.spawn + Vector3i.DOWN, player.inventory), "generation locks gameplay edits")
	_expect(world.layout.signature == signature_before, "old world remains live while replacement computes")
	await _key(KEY_TAB)
	player.set_physics_process(true)
	var locked_position := player.global_position
	await _key(KEY_W)
	_expect(world.generating and player.global_position == locked_position, "closing panel during generation does not release movement lock")
	player.set_physics_process(false)
	await _key(KEY_TAB)
	await _capture("generating.png")
	await _wait_generation()
	_expect(world.world_seed == -7 and world.world_size == 43 and world.generation_count == count_before + 1, "one requested world commits")
	_expect(world.generation_state == "READY" and not world.generation_checks, "checks off yields READY, not PASS")
	_expect(controls.active_poi and controls.poi_root.get_child_count() == world.layout.structures.size(), "applied POI markers match landmarks")
	_expect(WorldLayoutValidator.validate(world.layout).is_empty(), "committed staged world remains valid")
	_expect(world.plane_geometry.size() == world.chunk_nodes.size(), "staged publication adopts each chunk geometry cache")
	await _capture("controls.png")
	await _key(KEY_TAB)
	_expect(not controls.opened and not player.controls_open and Input.mouse_mode == initial_mouse_mode, "Tab restores previous cursor mode and gameplay")
	player.set_physics_process(true)
	for unused in 30: await physics_frame
	_expect(player.is_on_floor(), "player lands on adopted chunk collision")
	player.set_physics_process(false)
	var previous_signature: int = world.layout.signature
	_expect(not world.request_generation(2147483648, 43, true) and not world.request_generation(42, 42, true), "invalid seed/size rejected before mutation")
	_expect(world.layout.signature == previous_signature, "invalid generation preserves active world")
	world.save_path = output_directory.path_join("checkpoint.json")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	_expect(world.save_game(player), "checkpoint starts before generation request")
	_expect(not world.request_generation(42, 41, true), "saving blocks generation")
	while world.save_service.is_busy(): await process_frame
	controls.draft_seed = 42
	controls.draft_size = 41
	controls.draft_checks = true
	controls.draft_poi = false
	_expect(controls.apply_draft(), "second generation can start after save finishes")
	await _wait_generation()
	_expect(world.generation_state == "PASS" and world.generation_checks and world.world_seed == 42, "checks on yields PASS after completion")
	_expect(not controls.active_poi and controls.poi_root.get_child_count() == 0, "POI can be disabled on application")
	_expect(world.plane_geometry.size() == world.chunk_nodes.size(), "second publication retires old world caches")
	var ray_cell: Vector3i = world.layout.spawn + Vector3i.DOWN
	var hit := world.get_target(Vector3(ray_cell) + Vector3(0.5, 5, 0.5), Vector3.DOWN)
	_expect(not hit.is_empty(), "adopted bodies remain addressable by world interaction ray")
	# Same configured seed is deterministic across worker and synchronous paths.
	_expect(world.layout.signature == DeterministicWorldGenerator.generate(42, 41).signature, "worker layout matches synchronous generator")
	# Inject a worker failure, not a fake PASS, and verify recovery preserves state.
	var before_failure := world.chunk_store.encode(player.capture_state())
	world.generating = true
	world.generation_worker = Thread.new()
	world.generation_worker.start(func() -> Dictionary: return {})
	for unused in 20:
		if not world.generating: break
		await process_frame
	_expect(not world.generating and world.generation_state == "FAIL", "invalid worker result fails without stuck generation lock")
	_expect(world.chunk_store.encode(player.capture_state()) == before_failure, "worker failure preserves world, journal and player")
	if large:
		controls.set_open(true)
		controls.draft_seed = 1337
		controls.draft_size = 255
		controls.draft_checks = true
		_expect(controls.apply_draft(), "maximum size starts after failed request")
		await _wait_generation()
		_expect(world.world_size == 255 and world.generation_state == "PASS", "maximum 255 world passes staged generation")
		_expect(WorldLayoutValidator.validate(world.layout).is_empty() and world.layout.structures.size() == 6, "maximum world final data and landmarks validated")
		await _capture("controls-large.png")
	for failure in failures: push_error(failure)
	print("CONTROLS SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _wait_generation() -> void:
	var deadline := Time.get_ticks_msec() + 45000
	var frames := 0
	var states := {}
	var intervals: Array[float] = []
	var previous := Time.get_ticks_usec()
	var frame_samples: Array[Dictionary] = []
	while world.generating and Time.get_ticks_msec() < deadline:
		states[world.generation_state] = true
		frames += 1
		await process_frame
		intervals.append((Time.get_ticks_usec() - previous) / 1000.0)
		frame_samples.append({"frame": Engine.get_process_frames(), "gap_ms": intervals[-1], "state": world.generation_state, "focus": root.has_focus()})
		previous = Time.get_ticks_usec()
	_expect(not world.generating, "generation completes within bounded wait")
	_expect(states.has("MESHING") and frames > 2, "generation yields across frames for staged meshing")
	intervals.sort()
	print("GENERATION LOOP frames=%d states=%s elapsed_ms=%.2f frame_p95_ms=%.3f max_ms=%.3f cells=%d" % [frames, states.keys(), world.generation_elapsed_ms, intervals[ceili(intervals.size() * 0.95) - 1], intervals[-1], world.layout.cells.size()])
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	var trace_prefix := "headless" if DisplayServer.get_name() == "headless" else "render"
	var trace_file := FileAccess.open(output_directory.path_join("%s-generation-trace-%d-%d.json" % [trace_prefix, world.generation_count, world.world_size]), FileAccess.WRITE)
	_expect(trace_file != null, "generation stage trace opens")
	if trace_file != null:
		trace_file.store_string(JSON.stringify({"seed": world.world_seed, "size": world.world_size, "hash": world.layout.signature, "elapsed_ms": world.generation_elapsed_ms, "frames": frame_samples, "process": world.generation_trace, "stages": world.generation_stage_samples, "worker": world.generation_worker_timings, "retirement_mode": world.generation_retirement_mode, "retirement_us": world.generation_retirement_us}, "  "))
		trace_file.close()


func _capture(name: String) -> void:
	if DisplayServer.get_name() == "headless": return
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	await RenderingServer.frame_post_draw
	_expect(root.get_texture().get_image().save_png(output_directory.path_join(name)) == OK, "panel screenshot saved")


func _key(code: Key) -> void:
	var event := InputEventKey.new()
	event.keycode = code
	event.pressed = true
	Input.parse_input_event(event)
	await process_frame
	event = event.duplicate()
	event.pressed = false
	Input.parse_input_event(event)
	await process_frame


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
