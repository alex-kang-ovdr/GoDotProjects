extends SceneTree

var assertions := 0
var failures: Array[String] = []


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var world := VoxelWorld.new()
	world.streaming_enabled = true
	world.world_seed = 1337
	root.add_child(world)
	await process_frame
	_expect(world.layout.get("mode") == "streaming" and world.streaming_loader != null, "streaming launch creates a dedicated world loader")
	_expect(world.streaming_loader.resident_column_count() == 9 and world.chunk_store.base_cells.size() > 30000, "initial resident ring is playable without generating a large finite field")
	var before_loaded: int = world.streaming_loader.loaded_columns
	var before_unloaded: int = world.streaming_loader.unloaded_columns
	world.streaming_loader.tick(Vector3(16.1, 0, 0))
	while not world.streaming_loader.queued_columns.is_empty() or not world.streaming_loader.queued_unloads.is_empty():
		world.streaming_loader.tick(Vector3(16.1, 0, 0))
	await process_frame
	_expect(world.streaming_loader.loaded_columns > before_loaded and world.streaming_loader.unloaded_columns >= before_unloaded + 3, "crossing a chunk streams new terrain and releases distant columns")
	_expect(world.chunk_nodes.size() > 0 and world.chunk_store.chunks.size() > 0, "streamed terrain reaches the normal mesh and collision renderer")
	for failure in failures:
		push_error(failure)
	print("STREAMING SMOKE: %d assertions, %d failures; resident_columns=%d loaded=%d unloaded=%d last_tick_us=%d" % [assertions, failures.size(), world.streaming_loader.resident_column_count(), world.streaming_loader.loaded_columns, world.streaming_loader.unloaded_columns, world.streaming_loader.last_tick_us])
	quit(0 if failures.is_empty() else 1)


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
