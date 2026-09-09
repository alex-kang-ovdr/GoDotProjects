class_name VoxelSaveService
extends Node

signal completed(operation: String, result: Dictionary)

var worker: Thread
var operation := ""
var last_metrics: Dictionary = {}
var requested_at := 0
var snapshot_us := 0


func is_busy() -> bool:
	return worker != null


func start_save(store: VoxelChunkStore, state: Dictionary, path: String) -> bool:
	if is_busy():
		return false
	requested_at = Time.get_ticks_usec()
	var snapshot := _snapshot(store)
	var state_copy := state.duplicate(true)
	snapshot_us = Time.get_ticks_usec() - requested_at
	return _start("save", _save_job.bind(snapshot, state_copy, path))


func start_load(store: VoxelChunkStore, path: String) -> bool:
	if is_busy():
		return false
	requested_at = Time.get_ticks_usec()
	var snapshot := _snapshot(store)
	snapshot_us = Time.get_ticks_usec() - requested_at
	return _start("load", _load_job.bind(snapshot, path))


func _start(next_operation: String, job: Callable) -> bool:
	worker = Thread.new()
	operation = next_operation
	if worker.start(job) != OK:
		worker = null
		operation = ""
		return false
	return true


func _process(_delta: float) -> void:
	if worker == null or worker.is_alive():
		return
	var result: Dictionary = worker.wait_to_finish()
	worker = null
	var finished_operation := operation
	operation = ""
	last_metrics = {"operation": finished_operation, "snapshot_us": snapshot_us,
		"elapsed_us": Time.get_ticks_usec() - requested_at, "worker_us": result.get("worker_us", 0)}
	completed.emit(finished_operation, result)


func _exit_tree() -> void:
	# A running file operation owns its snapshot until it finishes, including on quit.
	if worker != null:
		worker.wait_to_finish()
		worker = null


static func _snapshot(store: VoxelChunkStore) -> VoxelChunkStore:
	var snapshot := VoxelChunkStore.new()
	snapshot.seed_value = store.seed_value
	snapshot.world_size = store.world_size
	snapshot.base_signature = store.base_signature
	snapshot.generation_options = store.generation_options.duplicate(true)
	# Generation replaces this immutable dictionary; runtime mutations use edits only.
	snapshot.base_cells = store.base_cells
	snapshot.edits = store.edits.duplicate()
	snapshot.block_states = store.block_states.duplicate()
	snapshot.stations = store.stations.duplicate(true)
	snapshot.depleted_ore = store.depleted_ore.duplicate()
	snapshot.station_tick_remainder = store.station_tick_remainder
	return snapshot


static func _save_job(snapshot: VoxelChunkStore, state: Dictionary, path: String) -> Dictionary:
	var started := Time.get_ticks_usec()
	var error := snapshot.save_to_file(path, state)
	return {"ok": error.is_empty(), "error": error, "edit_count": snapshot.edits.size(), "worker_us": Time.get_ticks_usec() - started}


static func _load_job(snapshot: VoxelChunkStore, path: String) -> Dictionary:
	var started := Time.get_ticks_usec()
	var result := VoxelChunkStore.read_encoded_file(path)
	if result.ok:
		result = snapshot.inspect_save(result.encoded)
	result.worker_us = Time.get_ticks_usec() - started
	return result
