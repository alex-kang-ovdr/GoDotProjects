class_name StreamingChunkLoader
extends RefCounted

## Main-thread budgeted, deterministic horizontal chunk streaming. A loaded
## column contains all 16-cube vertical chunks needed by the current terrain.
const LOAD_RADIUS := 1
const MAX_COLUMNS_PER_TICK := 1

var store: VoxelChunkStore
var seed_value := 0
var load_radius := LOAD_RADIUS
var active_columns: Dictionary = {}
var queued_columns: Array[Vector2i] = []
var queued_unloads: Array[Vector2i] = []
var center_column := Vector2i(2147483647, 2147483647)
var loaded_columns := 0
var unloaded_columns := 0
var last_tick_us := 0
var last_generated_cells := 0


func setup(target_store: VoxelChunkStore, seed_input: int, radius: int = LOAD_RADIUS) -> void:
	store = target_store
	seed_value = seed_input
	load_radius = clampi(radius, 1, 4)
	active_columns.clear()
	queued_columns.clear()
	queued_unloads.clear()
	center_column = Vector2i(2147483647, 2147483647)
	loaded_columns = 0
	unloaded_columns = 0
	last_tick_us = 0
	last_generated_cells = 0


func bootstrap(position: Vector3) -> Dictionary:
	_update_target(_world_to_column(position))
	var generated := 0
	while not queued_unloads.is_empty() or not queued_columns.is_empty():
		if not queued_unloads.is_empty(): _unload_next()
		else: generated += _load_next()
	return {"columns": active_columns.size(), "cells": generated, "elapsed_us": last_tick_us}


func tick(position: Vector3) -> Dictionary:
	var started := Time.get_ticks_usec()
	_update_target(_world_to_column(position))
	var generated := 0
	for _index in MAX_COLUMNS_PER_TICK:
		if not queued_unloads.is_empty():
			_unload_next()
		elif not queued_columns.is_empty():
			generated += _load_next()
		else:
			break
	last_tick_us = Time.get_ticks_usec() - started
	last_generated_cells = generated
	return {"columns": active_columns.size(), "queued": queued_columns.size(), "unloads": queued_unloads.size(), "cells": generated, "elapsed_us": last_tick_us}


func resident_column_count() -> int:
	return active_columns.size()


func _world_to_column(position: Vector3) -> Vector2i:
	return Vector2i(floori(position.x / VoxelChunkStore.CHUNK_SIZE), floori(position.z / VoxelChunkStore.CHUNK_SIZE))


func _update_target(next_center: Vector2i) -> void:
	if next_center == center_column: return
	center_column = next_center
	var wanted := {}
	for dz in range(-load_radius, load_radius + 1):
		for dx in range(-load_radius, load_radius + 1):
			wanted[center_column + Vector2i(dx, dz)] = true
	var next_unloads: Array[Vector2i] = []
	for column: Vector2i in active_columns.keys():
		if wanted.has(column) or _column_has_persistent_edit(column): continue
		next_unloads.append(column)
	next_unloads.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		var a_distance := absi(a.x - center_column.x) + absi(a.y - center_column.y)
		var b_distance := absi(b.x - center_column.x) + absi(b.y - center_column.y)
		if a_distance != b_distance: return a_distance > b_distance
		if a.x != b.x: return a.x < b.x
		return a.y < b.y)
	queued_unloads = next_unloads
	var next_queue: Array[Vector2i] = []
	for column: Vector2i in wanted:
		if not active_columns.has(column): next_queue.append(column)
	next_queue.sort_custom(func(a: Vector2i, b: Vector2i) -> bool:
		var a_distance := absi(a.x - center_column.x) + absi(a.y - center_column.y)
		var b_distance := absi(b.x - center_column.x) + absi(b.y - center_column.y)
		if a_distance != b_distance: return a_distance < b_distance
		if a.x != b.x: return a.x < b.x
		return a.y < b.y)
	queued_columns = next_queue


func _load_next() -> int:
	var column: Vector2i = queued_columns.pop_front()
	if active_columns.has(column): return 0
	var cells := DeterministicWorldGenerator.generate_stream_column(seed_value, column.x, column.y)
	store.add_stream_cells(cells)
	active_columns[column] = true
	loaded_columns += 1
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
