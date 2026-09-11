class_name StreamingChunkLoader
extends RefCounted

## Deterministic horizontal chunk streaming. Terrain sampling runs on one worker
## thread; store mutation, mesh and physics work remain on the main thread.
## A loaded column contains all 16-cube vertical chunks needed by current terrain.
const LOAD_RADIUS := 1
const MAX_COLUMNS_PER_TICK := 1
const INVALID_COLUMN := Vector2i(2147483647, 2147483647)

var store: VoxelChunkStore
var seed_value := 0
var load_radius := LOAD_RADIUS
var active_columns: Dictionary = {}
var wanted_columns: Dictionary = {}
var queued_columns: Array[Vector2i] = []
var queued_unloads: Array[Vector2i] = []
var center_column := INVALID_COLUMN
var loaded_columns := 0
var unloaded_columns := 0
var last_tick_us := 0
var last_generated_cells := 0
# M08 instrumentation. Worker calculation and main-thread commit are separate;
# mesh/collision budgeting is intentionally deferred to M09.
var generation_worker: Thread
var worker_column := INVALID_COLUMN
var worker_starts := 0
var worker_completions := 0
var worker_discards := 0
var worker_failures := 0
var last_worker_us := 0
var last_commit_us := 0


func setup(target_store: VoxelChunkStore, seed_input: int, radius: int = LOAD_RADIUS) -> void:
	shutdown()
	store = target_store
	seed_value = seed_input
	load_radius = clampi(radius, 1, 4)
	active_columns.clear()
	wanted_columns.clear()
	queued_columns.clear()
	queued_unloads.clear()
	center_column = INVALID_COLUMN
	loaded_columns = 0
	unloaded_columns = 0
	last_tick_us = 0
	last_generated_cells = 0
	worker_starts = 0
	worker_completions = 0
	worker_discards = 0
	worker_failures = 0
	last_worker_us = 0
	last_commit_us = 0


func bootstrap(position: Vector3) -> Dictionary:
	_update_target(_world_to_column(position))
	_start_next_worker()
	return status()


func tick(position: Vector3) -> Dictionary:
	var started := Time.get_ticks_usec()
	_update_target(_world_to_column(position))
	var generated := _collect_completed_worker()
	for _index in MAX_COLUMNS_PER_TICK:
		if not queued_unloads.is_empty():
			_unload_next()
		elif generation_worker == null:
			_start_next_worker()
		else:
			break
	last_tick_us = Time.get_ticks_usec() - started
	last_generated_cells = generated
	return status()


func status() -> Dictionary:
	return {"columns": active_columns.size(), "queued": queued_columns.size(), "unloads": queued_unloads.size(), "cells": last_generated_cells, "elapsed_us": last_tick_us, "worker_active": generation_worker != null, "worker_us": last_worker_us, "commit_us": last_commit_us}


func resident_column_count() -> int:
	return active_columns.size()


func is_worker_active() -> bool:
	return generation_worker != null


func shutdown() -> void:
	if generation_worker != null:
		generation_worker.wait_to_finish()
		generation_worker = null
	worker_column = INVALID_COLUMN


func _world_to_column(position: Vector3) -> Vector2i:
	return Vector2i(floori(position.x / VoxelChunkStore.CHUNK_SIZE), floori(position.z / VoxelChunkStore.CHUNK_SIZE))


func _update_target(next_center: Vector2i) -> void:
	if next_center == center_column: return
	center_column = next_center
	wanted_columns.clear()
	for dz in range(-load_radius, load_radius + 1):
		for dx in range(-load_radius, load_radius + 1):
			wanted_columns[center_column + Vector2i(dx, dz)] = true
	var next_unloads: Array[Vector2i] = []
	for column: Vector2i in active_columns.keys():
		if wanted_columns.has(column) or _column_has_persistent_edit(column): continue
		next_unloads.append(column)
	next_unloads.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		var a_distance := absi(a.x - center_column.x) + absi(a.y - center_column.y)
		var b_distance := absi(b.x - center_column.x) + absi(b.y - center_column.y)
		if a_distance != b_distance: return a_distance > b_distance
		if a.x != b.x: return a.x < b.x
		return a.y < b.y)
	queued_unloads = next_unloads
	var next_queue: Array[Vector2i] = []
	for column: Vector2i in wanted_columns:
		if not active_columns.has(column) and column != worker_column: next_queue.append(column)
	next_queue.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		var a_distance := absi(a.x - center_column.x) + absi(a.y - center_column.y)
		var b_distance := absi(b.x - center_column.x) + absi(b.y - center_column.y)
		if a_distance != b_distance: return a_distance < b_distance
		if a.x != b.x: return a.x < b.x
		return a.y < b.y)
	queued_columns = next_queue


func _start_next_worker() -> void:
	if generation_worker != null or queued_columns.is_empty(): return
	worker_column = queued_columns.pop_front()
	generation_worker = Thread.new()
	if generation_worker.start(_generate_column_job.bind(seed_value, worker_column)) != OK:
		worker_failures += 1
		generation_worker = null
		queued_columns.push_front(worker_column)
		worker_column = INVALID_COLUMN
		return
	worker_starts += 1


static func _generate_column_job(seed_input: int, column: Vector2i) -> Dictionary:
	# This job uses only worker-local generator data. It never accesses scene,
	# renderer, physics or the live chunk store.
	var started := Time.get_ticks_usec()
	var cells := DeterministicWorldGenerator.generate_stream_column(seed_input, column.x, column.y)
	return {"column": column, "cells": cells, "worker_us": Time.get_ticks_usec() - started}


func _collect_completed_worker() -> int:
	if generation_worker == null or generation_worker.is_alive(): return 0
	var result: Variant = generation_worker.wait_to_finish()
	generation_worker = null
	var completed_column := worker_column
	worker_column = INVALID_COLUMN
	if not result is Dictionary or result.get("column", INVALID_COLUMN) != completed_column or not result.get("cells") is Dictionary:
		worker_failures += 1
		return 0
	worker_completions += 1
	last_worker_us = int(result.get("worker_us", 0))
	# A fast traveller may have changed targets while the worker was calculating.
	# Discard stale private data rather than committing an unwanted resident column.
	if not wanted_columns.has(completed_column):
		worker_discards += 1
		return 0
	var commit_started := Time.get_ticks_usec()
	var cells: Dictionary = result.cells
	store.add_stream_cells(cells)
	active_columns[completed_column] = true
	loaded_columns += 1
	last_commit_us = Time.get_ticks_usec() - commit_started
	return cells.size()


func _unload_next() -> void:
	var column: Vector2i = queued_unloads.pop_front()
	if not active_columns.has(column) or _column_has_persistent_edit(column): return
	store.remove_stream_column(column.x, column.y)
	active_columns.erase(column)
	unloaded_columns += 1


func _column_has_persistent_edit(column: Vector2i) -> bool:
	for cell: Vector3i in store.edits:
		if (cell.x >> 4) == column.x and (cell.z >> 4) == column.y: return true
	for cell: Vector3i in store.stations:
		if (cell.x >> 4) == column.x and (cell.z >> 4) == column.y: return true
	return false
