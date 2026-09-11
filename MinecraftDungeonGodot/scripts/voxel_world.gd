class_name VoxelWorld
extends VoxelChunkRenderer

const StreamingLoader = preload("res://scripts/streaming_chunk_loader.gd")

signal generation_completed(summary: Dictionary)
signal action_feedback(message: String)
signal block_mined(inventory: BlockInventory)
signal block_placed(inventory: BlockInventory)
signal generation_status_changed

var world_seed := 1337
var world_size := 41
var startup_mode := "overworld"
var startup_room_attempts := 24
var startup_checks := false
var streaming_enabled := false
var layout: Dictionary = {}
const SAVE_PATH := "user://voxel_frontier_save.json"
var save_path := SAVE_PATH
var save_service: VoxelSaveService
var loading := false
var persistence_player: WeakRef
var generating := false
var generation_state := "READY"
var generation_notice := ""
var generation_count := 0
var generation_progress := 0.0
var generation_elapsed_ms := 0.0
var generation_checks := false
var generation_worker: Thread
var staged_world: VoxelChunkRenderer
var pending_generation: Dictionary = {}
var pending_chunks: Array = []
var pending_chunk_index := 0
var generation_started := 0
var settle_until_frame := 0
var generation_trace_enabled := false
var generation_trace: Array[Dictionary] = []
var generation_stage_samples: Array[Dictionary] = []
var generation_worker_timings: Dictionary = {}
var retirement_worker: Thread
var generation_retirement_us := 0
var generation_retirement_mode := "none"
var retired_bodies: Array[StaticBody3D] = []
var drops: WorldDrops
var log_mesh: Mesh
var stations: WorldStations
var streaming_loader


func _ready() -> void:
	save_service = VoxelSaveService.new()
	add_child(save_service)
	save_service.completed.connect(_on_persistence_completed)
	var library := _create_mesh_library()
	log_mesh = library.get_item_mesh(BlockRegistry.LOG)
	for material_id in BlockRegistry.MATERIAL_COUNT:
		materials.append(library.get_item_mesh(material_id).surface_get_material(0))
	drops = WorldDrops.new()
	drops.name = "DroppedItems"
	drops.world = self
	add_child(drops)
	stations = WorldStations.new()
	stations.name = "Stations"
	stations.world = self
	add_child(stations)
	if streaming_enabled:
		generate_streaming_world(world_seed)
	else:
		generate_world(world_seed, world_size, startup_mode, startup_room_attempts, startup_checks)


func generate_streaming_world(seed_value: int) -> void:
	if generating or (save_service != null and save_service.is_busy()):
		action_feedback.emit("Streaming world unavailable during save/load")
		return
	if streaming_loader != null:
		streaming_loader.shutdown()
		streaming_loader = null
	var started := Time.get_ticks_usec()
	clear()
	world_seed = seed_value
	world_size = 0 # Unbounded: this is not a finite square-world dimension.
	var spawn := DeterministicWorldGenerator.streaming_spawn(seed_value)
	var stream_signature := int((seed_value ^ 0x51a9c3) & 0x7fffffff)
	layout = {
		"mode": "streaming", "seed": seed_value, "size": 0, "cells": {},
		"signature": stream_signature, "spawn": spawn, "biome_counts": PackedInt32Array([0, 0, 0, 0, 0, 0]),
		"structures": [], "protected_cave": {}, "cave_network": {"rooms": []}, "timings": {},
	}
	chunk_store.initialize(seed_value, 0, {}, stream_signature)
	chunk_store.generation_options = {"mode": "streaming", "stream_radius": StreamingLoader.LOAD_RADIUS}
	streaming_loader = StreamingLoader.new()
	streaming_loader.setup(chunk_store, seed_value)
	var initial: Dictionary = streaming_loader.bootstrap(Vector3(spawn) + Vector3(0.5, 0, 0.5))
	rebuild_all()
	generation_state = "READY"
	generation_checks = false
	generation_progress = 1.0
	generation_elapsed_ms = (Time.get_ticks_usec() - started) / 1000.0
	generation_notice = "Streaming queued: center column generates first; %d initial columns pending" % (int(initial.queued) + 1)
	generation_count += 1
	_emit_generation_completed()


func generate_world(seed_value: int, size_value: int, mode: String = "overworld", room_attempts: int = 24, checks: bool = false) -> void:
	if generating or (save_service != null and save_service.is_busy()):
		action_feedback.emit("Generation unavailable during save/load")
		return
	if streaming_loader != null:
		streaming_loader.shutdown()
		streaming_loader = null
	var started := Time.get_ticks_usec()
	var generated := DungeonGenerator.generate(seed_value, size_value, room_attempts) if mode == "dungeon" else DeterministicWorldGenerator.generate(seed_value, size_value)
	if generated.is_empty() or mode not in ["overworld", "dungeon"]:
		action_feedback.emit("Invalid generation options")
		return
	if checks:
		var errors := DungeonGenerator.validate(generated) if mode == "dungeon" else WorldLayoutValidator.validate(generated)
		if not errors.is_empty():
			_fail_generation("Generation checks failed: " + "; ".join(errors))
			return
	clear()
	world_seed = seed_value
	world_size = size_value
	layout = generated
	world_seed = layout.seed
	world_size = layout.size
	chunk_store.initialize(layout.seed, layout.size, layout.cells, layout.signature)
	chunk_store.generation_options = _save_options(layout)
	rebuild_all()
	generation_state = "PASS" if checks else "READY"
	generation_checks = checks
	generation_progress = 1.0
	generation_elapsed_ms = (Time.get_ticks_usec() - started) / 1000.0
	generation_notice = "Generated synchronously; checks passed" if checks else "Generated synchronously; optional checks not run"
	generation_count += 1
	_emit_generation_completed()


func _emit_generation_completed() -> void:
	drops.clear_items()
	stations.refresh_visuals()
	var resident_cells: int = chunk_store.base_cells.size() if layout.get("mode") == "streaming" else layout.cells.size()
	generation_completed.emit({
		"seed": layout.seed,
		"size": layout.size,
		"blocks": resident_cells,
		"signature": layout.signature,
		"biome_counts": layout.biome_counts,
		"mode": layout.get("mode", "overworld"),
	})


func spawn_position() -> Vector3:
	var cell: Vector3i = layout.get("spawn", Vector3i(0, 8, 0))
	return map_to_local(cell) + Vector3(-0.5, 0.05, -0.5)


func get_target(origin: Vector3, direction: Vector3, distance: float = 6.0) -> Dictionary:
	var query := PhysicsRayQueryParameters3D.create(origin, origin + direction.normalized() * distance)
	query.collide_with_areas = false
	query.collision_mask = 1 # Drops use layer 2 and must not intercept block targeting.
	var hit := get_world_3d().direct_space_state.intersect_ray(query)
	if hit.is_empty() or not hit.collider is StaticBody3D or hit.collider.get_parent() != self:
		return {}
	var hit_cell := local_to_map(to_local(hit.position - hit.normal * 0.01))
	var place_cell := local_to_map(to_local(hit.position + hit.normal * 0.01))
	return {"hit": hit_cell, "place": place_cell, "normal": hit.normal}


func remove_cell_for_inventory(cell: Vector3i, inventory: BlockInventory) -> bool:
	if chunk_store.stations.has(cell): return false
	if gameplay_locked():
		return false
	var material_id := get_cell_item(cell)
	var definition := BlockRegistry.by_material(material_id)
	if definition.is_empty() or not definition.recoverable:
		action_feedback.emit("This block cannot be collected")
		return false
	var drop_slot := int(definition.drop_slot)
	if not inventory.can_add(drop_slot):
		action_feedback.emit("%s stack is full" % BlockRegistry.by_slot(drop_slot).name)
		return false
	set_cell_item(cell, -1)
	inventory.add(drop_slot)
	block_mined.emit(inventory)
	action_feedback.emit("Collected %s" % BlockRegistry.by_slot(drop_slot).name)
	return true


# Production timed mining commits block, drop and tool wear before emitting events.
# The immediate inventory helper above remains a low-level transaction fixture.
func finish_mining(cell: Vector3i, expected_material: int, player: VoxelPlayer) -> bool:
	if player == null or player.world != self or drops.player != player: return false
	if gameplay_locked() or get_cell_item(cell) != expected_material: return false
	var block := BlockRegistry.by_material(expected_material)
	if block.is_empty() or not block.recoverable: return false
	var station: Dictionary = chunk_store.stations.get(cell, {})
	if not station.is_empty() and not StationState.empty(station):
		action_feedback.emit("Empty this station before mining it")
		return false
	var harvest := player.mining_tools.can_harvest(expected_material)
	if not station.is_empty(): harvest = true
	var drop_item := int(station.kind) if not station.is_empty() else mining_drop(cell, int(block.drop_slot))
	if harvest and drops.bodies.size() >= WorldDrops.MAX_DROPS:
		action_feedback.emit("Mining paused: collect some dropped items first")
		return false
	set_cell_item(cell, -1)
	rebuild_dirty()
	if harvest: drops.spawn_item(drop_item, 1, Vector3(cell) + Vector3.ONE * 0.5)
	player.mining_tools.wear(false)
	block_mined.emit(player.inventory)
	player.inventory.changed.emit()
	action_feedback.emit("Broke %s%s" % [block.name, " — dropped item" if harvest else " — wrong tool, no drop"])
	return true


func place_from_inventory(cell: Vector3i, slot: int, inventory: BlockInventory, player_position: Vector3, orientation: int = 0) -> bool:
	if orientation < 0 or orientation >= BlockOrientation.COUNT: return false
	if gameplay_locked():
		return false
	if get_cell_item(cell) != -1:
		action_feedback.emit("Target space is occupied")
		return false
	var cell_center := to_global(map_to_local(cell))
	var horizontal_delta := Vector2(cell_center.x - player_position.x, cell_center.z - player_position.z)
	if horizontal_delta.length() < 0.72 and absf(cell_center.y - (player_position.y + 0.9)) < 1.35:
		action_feedback.emit("Cannot place a block inside the player")
		return false
	var item := inventory.item_at(slot)
	var is_station := item in [ItemRegistry.CHEST, ItemRegistry.FURNACE]
	if is_station and chunk_store.stations.size() >= StationState.MAX_STATIONS:
		action_feedback.emit("Station limit reached (128)")
		return false
	var definition := BlockRegistry.by_material(StationState.material(item)) if is_station else BlockRegistry.by_slot(item)
	if definition.is_empty():
		action_feedback.emit("Selected slot has no placeable block")
		return false
	# Commit inventory, voxel, orientation and player progress before observers
	# can capture a checkpoint from inventory.changed.
	if not inventory.consume(slot, 1, false):
		action_feedback.emit("Selected slot is empty")
		return false
	set_cell_item(cell, int(definition.material))
	if is_station: chunk_store.stations[cell] = StationState.create(item)
	chunk_store.set_state(cell, orientation)
	block_placed.emit(inventory)
	inventory.changed.emit()
	action_feedback.emit("Placed %s" % definition.name)
	return true


func mining_drop(cell: Vector3i, fallback: int) -> int:
	if not layout.get("ore_cells", {}).has(cell) or chunk_store.depleted_ore.has(cell): return fallback
	var base := int(chunk_store.base_cells.get(cell, -1))
	if get_cell_item(cell) != base: return fallback
	if base == BlockRegistry.COBBLESTONE: return ItemRegistry.COAL
	if base == BlockRegistry.MOSS: return ItemRegistry.RAW_IRON
	return fallback


func save_game(player: VoxelPlayer) -> bool:
	if streaming_enabled:
		action_feedback.emit("Streaming checkpoint is not implemented; edited columns remain pinned this session")
		return false
	if generating: return false
	player.cancel_mining()
	if not save_service.start_save(chunk_store, player.capture_state(), save_path):
		action_feedback.emit("Save/load is busy or could not start")
		return false
	persistence_player = weakref(player)
	action_feedback.emit("Saving checkpoint...")
	return true


func load_game(player: VoxelPlayer) -> bool:
	if streaming_enabled:
		action_feedback.emit("Streaming checkpoint is not implemented in this milestone")
		return false
	if generating: return false
	player.cancel_mining()
	if not save_service.start_load(chunk_store, save_path):
		action_feedback.emit("Save/load is busy or could not start")
		return false
	persistence_player = weakref(player)
	loading = true
	action_feedback.emit("Loading checkpoint...")
	return true


func _on_persistence_completed(operation: String, result: Dictionary) -> void:
	if operation == "load":
		var player := persistence_player.get_ref() as VoxelPlayer
		if result.ok and is_instance_valid(player):
			result = _apply_validated_save(result, player)
		elif result.ok:
			result = {"ok": false, "error": "player no longer exists"}
		loading = false
	if not result.ok:
		action_feedback.emit("%s rejected: %s" % [operation.capitalize(), result.error])
	elif operation == "save":
		action_feedback.emit("World saved (%d checkpoint edits)" % result.edit_count)
	else:
		action_feedback.emit("World loaded (%d changed cells)" % int(result.get("changed_cells", 0)))


func apply_saved_game(encoded: String, player: VoxelPlayer) -> Dictionary:
	if generating: return {"ok": false, "error": "generation is busy"}
	var result := chunk_store.inspect_save(encoded)
	if not result.ok:
		return result
	return _apply_validated_save(result, player)


func _apply_validated_save(result: Dictionary, player: VoxelPlayer) -> Dictionary:
	var player_error := SavedPlayerState.validate(result.player)
	if not player_error.is_empty():
		return {"ok": false, "error": player_error}
	# No signals, yields or state writes until the complete transaction is valid.
	# Save validation has already completed. Detach old station ownership before
	# applying the incoming journal, otherwise an old nonempty station could
	# correctly reject mining-like block removal but incorrectly block loading.
	chunk_store.stations.clear()
	var changed := chunk_store.apply_edits(result.edits, result.block_states)
	chunk_store.apply_station_state(result)
	rebuild_dirty()
	stations.refresh_visuals()
	drops.restore(result.player.get("drops", []))
	player.restore_state(result.player)
	return {"ok": true, "error": "", "changed_cells": changed.size()}


func gameplay_locked() -> bool:
	return loading or generating


func request_generation(seed_value: int, size_value: int, checks: bool, mode: String = "overworld", room_attempts: int = 24) -> bool:
	if gameplay_locked() or save_service.is_busy():
		generation_notice = "Rejected: generation/save/load is busy"
		generation_status_changed.emit()
		return false
	if mode not in ["overworld", "dungeon"] or room_attempts < 1 or room_attempts > 512 or seed_value < -2147483648 or seed_value > 2147483647 or size_value < (11 if mode == "dungeon" else 41) or size_value > 255 or size_value % 2 == 0:
		generation_notice = "Rejected: mode/seed/odd size/room attempts invalid"
		generation_status_changed.emit()
		return false
	generating = true
	generation_checks = checks
	generation_started = Time.get_ticks_usec()
	generation_trace.clear()
	generation_stage_samples.clear()
	generation_worker_timings.clear()
	generation_retirement_us = 0
	generation_retirement_mode = "none"
	generation_state = "COMPUTING"
	generation_notice = "Building isolated layout; current world retained"
	generation_progress = 0.0
	generation_worker = Thread.new()
	if generation_worker.start(_generate_job.bind(seed_value, size_value, checks, mode, room_attempts)) != OK:
		generation_worker = null
		_fail_generation("Worker could not start; current world retained")
		return false
	generation_status_changed.emit()
	return true


static func _generate_job(seed_value: int, size_value: int, checks: bool, mode: String = "overworld", room_attempts: int = 24) -> Dictionary:
	# Only private data and a worker-local noise resource; no scene/render/physics API.
	var started := Time.get_ticks_usec()
	var generated := DungeonGenerator.generate(seed_value, size_value, room_attempts) if mode == "dungeon" else DeterministicWorldGenerator.generate(seed_value, size_value)
	var generated_at := Time.get_ticks_usec()
	var errors: Array[String] = []
	if generated.is_empty(): errors.append("generator returned no layout")
	elif checks: errors = DungeonGenerator.validate(generated) if mode == "dungeon" else WorldLayoutValidator.validate(generated)
	var checked_at := Time.get_ticks_usec()
	var store := VoxelChunkStore.new()
	if errors.is_empty():
		store.initialize(generated.seed, generated.size, generated.cells, generated.signature)
		store.generation_options = _save_options(generated)
	return {"layout": generated, "store": store, "errors": errors, "timings": {"generate_us": generated_at - started, "validate_us": checked_at - generated_at, "index_us": Time.get_ticks_usec() - checked_at}}


static func _save_options(generated: Dictionary) -> Dictionary:
	return {"mode": "dungeon", "room_attempts": generated.room_attempts} if generated.get("mode", "overworld") == "dungeon" else {"mode": "overworld"}


func _process(delta: float) -> void:
	if not generating:
		super._process(delta)
		if streaming_loader != null and drops != null and drops.player != null:
			streaming_loader.tick(drops.player.global_position)
		return
	if not generation_trace_enabled:
		_advance_generation()
		return
	var started := Time.get_ticks_usec()
	var state_before := generation_state
	_advance_generation()
	generation_trace.append({"frame": Engine.get_process_frames(), "state_in": state_before, "state_out": generation_state, "elapsed_us": Time.get_ticks_usec() - started, "chunk_index": pending_chunk_index})


func _trace_generation_stage(stage: String, started: int, details: Dictionary = {}) -> void:
	if not generation_trace_enabled: return
	details.stage = stage
	details.frame = Engine.get_process_frames()
	details.elapsed_us = Time.get_ticks_usec() - started
	generation_stage_samples.append(details)


func _advance_generation() -> void:
	generation_elapsed_ms = (Time.get_ticks_usec() - generation_started) / 1000.0
	if generation_worker != null:
		if generation_worker.is_alive(): return
		var receive_started := Time.get_ticks_usec()
		var completed: Variant = generation_worker.wait_to_finish()
		generation_worker = null
		if not completed is Dictionary or not completed.has_all(["errors", "layout", "store"]):
			_fail_generation("Worker returned invalid data; current world retained")
			return
		if not completed.errors is Array or not completed.layout is Dictionary or not completed.store is VoxelChunkStore:
			_fail_generation("Worker returned invalid field types; current world retained")
			return
		pending_generation = completed
		generation_worker_timings = completed.get("timings", {})
		if not pending_generation.errors.is_empty():
			_fail_generation("Checks failed: " + "; ".join(pending_generation.errors))
			return
		staged_world = VoxelChunkRenderer.new()
		staged_world.use_plane_cache = use_plane_cache
		staged_world.set_process(false)
		staged_world.visible = false
		staged_world.materials = materials
		staged_world.chunk_store = pending_generation.store
		add_child(staged_world)
		staged_world.set_process(false)
		pending_chunks = staged_world.chunk_store.chunks.keys()
		pending_chunk_index = 0
		generation_state = "MESHING"
		generation_notice = "Building hidden chunks on main thread"
		_trace_generation_stage("receive_worker", receive_started)
	if generation_state == "MESHING":
		var slice_started := Time.get_ticks_usec()
		while pending_chunk_index < pending_chunks.size():
			var chunk_started := Time.get_ticks_usec()
			var before: Dictionary = staged_world.build_timings.duplicate() if generation_trace_enabled else {}
			staged_world._rebuild_chunk(pending_chunks[pending_chunk_index])
			if generation_trace_enabled:
				var stages := {}
				for key: String in staged_world.build_timings: stages[key] = int(staged_world.build_timings[key]) - int(before.get(key, 0))
				_trace_generation_stage("chunk", chunk_started, {"chunk": str(pending_chunks[pending_chunk_index]), "build_stages": stages})
			pending_chunk_index += 1
			if Time.get_ticks_usec() - slice_started >= 4000: break
		generation_progress = float(pending_chunk_index) / maxi(1, pending_chunks.size())
		var status_started := Time.get_ticks_usec()
		generation_status_changed.emit()
		_trace_generation_stage("progress_listeners", status_started)
		if pending_chunk_index < pending_chunks.size(): return
		_commit_generation()
	elif generation_state == "SETTLING":
		_retire_body_batch()
		if not retired_bodies.is_empty() or Engine.get_physics_frames() < settle_until_frame: return
		if retirement_worker != null:
			if retirement_worker.is_alive(): return
			var join_started := Time.get_ticks_usec()
			generation_retirement_us = retirement_worker.wait_to_finish()
			retirement_worker = null
			_trace_generation_stage("retirement_join", join_started, {"worker_release_us": generation_retirement_us})
		generating = false
		generation_state = "PASS" if generation_checks else "READY"
		generation_notice = "Applied; previous unsaved edits replaced"
		generation_count += 1
		var notify_started := Time.get_ticks_usec()
		_emit_generation_completed()
		generation_status_changed.emit()
		_trace_generation_stage("completion_listeners", notify_started)


func _commit_generation() -> void:
	# Publish only after every staged chunk is ready. No live player can move
	# against half-built geometry; wait two physics ticks before releasing input.
	var stage_started := Time.get_ticks_usec()
	# Transfer only private plain-data references. Nodes, meshes, materials and
	# physics resources remain on the main thread. Do not clear shared containers:
	# outside readers of an old immutable layout must keep seeing that snapshot.
	var retired := {"layout": layout, "store": chunk_store, "masks": face_masks, "geometry": plane_geometry}
	retired_bodies.assign(chunk_nodes.values())
	for body: StaticBody3D in retired_bodies: body.visible = false
	chunk_nodes = {}
	face_masks = {}
	plane_geometry = {}
	rebuild_history.clear()
	_trace_generation_stage("clear_old", stage_started)
	stage_started = Time.get_ticks_usec()
	layout = pending_generation.layout
	world_seed = layout.seed
	world_size = layout.size
	chunk_store = staged_world.chunk_store
	face_masks = staged_world.face_masks
	plane_geometry = staged_world.plane_geometry
	build_timings = staged_world.build_timings
	rebuild_serial = staged_world.rebuild_serial
	_trace_generation_stage("adopt_data", stage_started)
	stage_started = Time.get_ticks_usec()
	for chunk: Vector3i in staged_world.chunk_nodes:
		var body: StaticBody3D = staged_world.chunk_nodes[chunk]
		staged_world.remove_child(body)
		add_child(body)
		chunk_nodes[chunk] = body
	_trace_generation_stage("reparent_bodies", stage_started)
	stage_started = Time.get_ticks_usec()
	staged_world.chunk_nodes = {}
	staged_world.queue_free()
	staged_world = null
	pending_generation = {}
	pending_chunks = []
	last_rebuild = {"count": chunk_nodes.size(), "elapsed_us": 0}
	generation_state = "SETTLING"
	settle_until_frame = Engine.get_physics_frames() + 2
	_trace_generation_stage("release_staging", stage_started)
	stage_started = Time.get_ticks_usec()
	retirement_worker = Thread.new()
	if _start_retirement_job(retired) == OK:
		generation_retirement_mode = "worker"
	else:
		# Resource exhaustion must not leak an old world or strand gameplay locks.
		# This exceptional fallback is correct but can stall; it is reported.
		retirement_worker = null
		generation_retirement_mode = "inline_fallback"
		generation_retirement_us = _release_retired_data(retired)
	_trace_generation_stage("retirement_dispatch", stage_started)


func _retire_body_batch() -> void:
	if retired_bodies.is_empty(): return
	var started := Time.get_ticks_usec()
	var removed := 0
	while not retired_bodies.is_empty():
		var body: StaticBody3D = retired_bodies.pop_back()
		remove_child(body)
		# Immediate node destruction accounts for resource-release work in this
		# budget instead of accumulating every old body in one end-frame queue.
		body.free()
		removed += 1
		if Time.get_ticks_usec() - started >= 2000: break
	if retired_bodies.is_empty(): settle_until_frame = Engine.get_physics_frames() + 2
	_trace_generation_stage("retire_bodies", started, {"removed": removed, "remaining": retired_bodies.size()})


func _start_retirement_job(retired: Dictionary) -> Error:
	return retirement_worker.start(_release_retired_data.bind(retired))


static func _release_retired_data(retired: Dictionary) -> int:
	var started := Time.get_ticks_usec()
	# Drop references, never mutate any nested old layout/store/plane data.
	retired.clear()
	return Time.get_ticks_usec() - started


func _fail_generation(message: String) -> void:
	generating = false
	generation_state = "FAIL"
	generation_notice = message
	pending_generation = {}
	generation_status_changed.emit()


func _exit_tree() -> void:
	if streaming_loader != null:
		streaming_loader.shutdown()
		streaming_loader = null
	if generation_worker != null:
		generation_worker.wait_to_finish()
		generation_worker = null
	if retirement_worker != null:
		retirement_worker.wait_to_finish()
		retirement_worker = null


func _create_mesh_library() -> MeshLibrary:
	var library := MeshLibrary.new()
	for definition: Dictionary in BlockRegistry.DEFINITIONS:
		var item_id: int = definition.material
		library.create_item(item_id)
		library.set_item_name(item_id, definition.name)
		var mesh := BoxMesh.new()
		mesh.size = Vector3.ONE
		var material := StandardMaterial3D.new()
		material.albedo_color = Color.WHITE
		material.albedo_texture = _create_block_texture(item_id, definition.color, definition.transparent)
		material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		material.roughness = 0.95
		if definition.transparent:
			material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			material.albedo_color.a = 0.72
			material.cull_mode = BaseMaterial3D.CULL_DISABLED
		mesh.material = material
		library.set_item_mesh(item_id, mesh)
		if item_id == BlockRegistry.LOG:
			var log_material := ShaderMaterial.new()
			log_material.shader = load("res://scripts/log_material.gdshader")
			log_material.set_shader_parameter("bark", material.albedo_texture)
			log_material.set_shader_parameter("end_grain", _create_log_end_texture())
			library.set_item_mesh(item_id, VoxelChunkMesher.unit_log_mesh(log_material))
		if definition.solid:
			var shape := BoxShape3D.new()
			shape.size = Vector3.ONE
			library.set_item_shapes(item_id, [shape, Transform3D.IDENTITY])
	return library


func _create_block_texture(item_id: int, base_color: Color, transparent: bool) -> ImageTexture:
	var image := Image.create(16, 16, false, Image.FORMAT_RGBA8)
	for y in 16:
		for x in 16:
			var hash_value := (x * 37 + y * 67 + item_id * 101 + (x * y) * 7) % 23
			var variation := (float(hash_value) / 22.0 - 0.5) * 0.22
			var color := base_color.lightened(maxf(variation, 0.0)).darkened(maxf(-variation, 0.0))
			if item_id == BlockRegistry.BRICK and (y % 5 == 0 or (x + int(y / 5) * 3) % 8 == 0):
				color = base_color.darkened(0.32)
			elif item_id == BlockRegistry.PLANK and (y % 4 == 0 or (x + y * 2) % 13 == 0):
				color = base_color.darkened(0.22)
			elif item_id == BlockRegistry.LOG and (x % 5 == 0):
				color = base_color.darkened(0.24)
			elif item_id == BlockRegistry.SNOW and hash_value < 3:
				color = Color("#b8d3df")
			elif item_id == BlockRegistry.SAND and hash_value < 4:
				color = base_color.darkened(0.16)
			if transparent:
				color.a = 0.78
			image.set_pixel(x, y, color)
	return ImageTexture.create_from_image(image)


func _create_log_end_texture() -> ImageTexture:
	var image := Image.create(16, 16, false, Image.FORMAT_RGB8)
	for y in 16:
		for x in 16:
			var radius := Vector2(x - 6.5, y - 8.5).length()
			var color := Color("#bb955f") if int(radius / 1.8) % 2 == 0 else Color("#9b713f")
			if x == 0 or y == 0 or x == 15 or y == 15: color = Color("#68472e")
			if y == 8 and x < 7: color = Color("#765137")
			image.set_pixel(x, y, color)
	return ImageTexture.create_from_image(image)
