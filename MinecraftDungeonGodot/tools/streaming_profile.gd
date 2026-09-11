extends SceneTree

const FRAME_BUDGET_US := 16_700
var output_path := "res://Saved/Verification/streaming-m08-profile.json"
var assertions := 0
var failures: Array[String] = []


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_path = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	var world := VoxelWorld.new()
	world.streaming_enabled = true
	world.world_seed = 1337
	root.add_child(world)
	var main_tick_us: Array[int] = []
	var worker_us: Array[int] = []
	var commit_us: Array[int] = []
	var last_completions := 0
	for unused in 900:
		world.streaming_loader.tick(Vector3.ZERO)
		_collect(world.streaming_loader, main_tick_us, worker_us, commit_us, last_completions)
		last_completions = world.streaming_loader.worker_completions
		if world.streaming_loader.resident_column_count() == 9: break
		await process_frame
	_expect(world.streaming_loader.resident_column_count() == 9, "initial 3x3 streaming ring becomes resident")
	for target_x in [16.1, 32.1, 48.1, 64.1]:
		for unused in 900:
			world.streaming_loader.tick(Vector3(target_x, 0, 0))
			_collect(world.streaming_loader, main_tick_us, worker_us, commit_us, last_completions)
			last_completions = world.streaming_loader.worker_completions
			if world.streaming_loader.queued_columns.is_empty() and world.streaming_loader.queued_unloads.is_empty() and not world.streaming_loader.is_worker_active(): break
			await process_frame
	_expect(world.streaming_loader.resident_column_count() == 9, "crossings keep exactly the requested resident ring")
	_expect(world.streaming_loader.worker_failures == 0 and world.streaming_loader.worker_discards == 0, "worker results are valid and no stale column was committed")
	_expect(worker_us.size() >= 21 and commit_us.size() >= 21, "profile records every generated column separately")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_path.get_base_dir()))
	var output := FileAccess.open(output_path, FileAccess.WRITE)
	_expect(output != null, "profile output opens")
	var metrics := {
		"milestone": "M08",
		"scenario": "seed 1337; initial 3x3 then four +X chunk crossings; headless CPU proxy",
		"frame_budget_us": FRAME_BUDGET_US,
		"resident_columns": world.streaming_loader.resident_column_count(),
		"loaded_columns": world.streaming_loader.loaded_columns,
		"unloaded_columns": world.streaming_loader.unloaded_columns,
		"worker_starts": world.streaming_loader.worker_starts,
		"worker_completions": world.streaming_loader.worker_completions,
		"worker_discards": world.streaming_loader.worker_discards,
		"main_tick_us": _summary(main_tick_us),
		"worker_us": _summary(worker_us),
		"commit_us": _summary(commit_us),
		"assertions": assertions,
		"failures": failures,
	}
	if output != null:
		output.store_string(JSON.stringify(metrics, "  "))
		output.close()
	for failure in failures: push_error(failure)
	print("STREAMING M08 PROFILE: main_p95=%.3fms worker_p95=%.3fms commit_p95=%.3fms; %d assertions, %d failures" % [float(metrics.main_tick_us.p95_us) / 1000.0, float(metrics.worker_us.p95_us) / 1000.0, float(metrics.commit_us.p95_us) / 1000.0, assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _collect(loader: StreamingChunkLoader, main_tick_us: Array[int], worker_us: Array[int], commit_us: Array[int], previous_completions: int) -> void:
	main_tick_us.append(loader.last_tick_us)
	if loader.worker_completions <= previous_completions: return
	worker_us.append(loader.last_worker_us)
	commit_us.append(loader.last_commit_us)


func _summary(samples: Array[int]) -> Dictionary:
	var sorted := samples.duplicate()
	sorted.sort()
	if sorted.is_empty(): return {"count": 0, "min_us": 0, "p95_us": 0, "max_us": 0}
	return {"count": sorted.size(), "min_us": sorted[0], "p95_us": sorted[ceili(float(sorted.size()) * 0.95) - 1], "max_us": sorted[-1]}


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
