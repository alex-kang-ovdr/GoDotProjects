class_name VoxelChunkRenderer
extends Node3D

var chunk_store := VoxelChunkStore.new()
var chunk_nodes: Dictionary = {}
var materials: Array[Material] = []
var rebuild_serial := 0
var rebuild_history: Array[Dictionary] = []
var last_rebuild: Dictionary = {}
var face_masks: Dictionary = {}
var plane_geometry: Dictionary = {}
# Reference path retained for controlled A/B benchmarks; gameplay uses the cache.
var use_plane_cache := true
var build_timings: Dictionary = {}


func _process(_delta: float) -> void:
	if not chunk_store.dirty_chunks.is_empty():
		rebuild_dirty()


func clear() -> void:
	for node: StaticBody3D in chunk_nodes.values():
		remove_child(node)
		node.queue_free()
	chunk_nodes.clear()
	face_masks.clear()
	plane_geometry.clear()
	chunk_store.dirty_chunks.clear()
	rebuild_history.clear()


func rebuild_all() -> void:
	build_timings = {"masks_us": 0, "geometry_us": 0, "upload_us": 0}
	face_masks.clear()
	plane_geometry.clear()
	for chunk: Vector3i in chunk_store.chunks:
		chunk_store.dirty_chunks[chunk] = true
	rebuild_dirty()


func rebuild_dirty() -> Dictionary:
	var started := Time.get_ticks_usec()
	var dirty := chunk_store.consume_dirty_chunks()
	var affected_cells := {}
	for cell: Vector3i in chunk_store.mesh_dirty_cells:
		affected_cells[cell] = true
		for direction: Vector3i in VoxelChunkMesher.DIRECTIONS:
			affected_cells[cell + direction] = true
	for cell: Vector3i in affected_cells:
		var chunk := DeterministicWorldGenerator.world_to_chunk(cell)
		if face_masks.has(chunk):
			VoxelChunkMesher.update_cell_mask(chunk_store, cell, face_masks[chunk])
	chunk_store.mesh_dirty_cells.clear()
	var rebuilt: Array[Vector3i] = []
	for chunk in dirty:
		if not chunk_store.chunks.has(chunk) and not chunk_nodes.has(chunk):
			continue
		_rebuild_chunk(chunk)
		rebuilt.append(chunk)
	last_rebuild = {"chunks": rebuilt, "count": rebuilt.size(), "elapsed_us": Time.get_ticks_usec() - started}
	if not rebuilt.is_empty():
		rebuild_history.append(last_rebuild)
		if rebuild_history.size() > 256:
			rebuild_history.pop_front()
	return last_rebuild


func _rebuild_chunk(chunk: Vector3i) -> void:
	rebuild_serial += 1
	var stage_started := Time.get_ticks_usec()
	if not face_masks.has(chunk):
		face_masks[chunk] = VoxelChunkMesher.build_masks(chunk_store, chunk)
	build_timings.masks_us = int(build_timings.get("masks_us", 0)) + Time.get_ticks_usec() - stage_started
	stage_started = Time.get_ticks_usec()
	var data: Dictionary
	if use_plane_cache:
		if not plane_geometry.has(chunk): plane_geometry[chunk] = {}
		data = VoxelChunkMesher.build_cached(chunk_store, chunk, face_masks[chunk], plane_geometry[chunk])
	else:
		data = VoxelChunkMesher.build(chunk_store, chunk, face_masks[chunk])
	build_timings.planes_built = int(build_timings.get("planes_built", 0)) + int(data.get("planes_built", face_masks[chunk].size()))
	build_timings.planes_reused = int(build_timings.get("planes_reused", 0)) + int(data.get("planes_reused", 0))
	build_timings.geometry_us = int(build_timings.get("geometry_us", 0)) + Time.get_ticks_usec() - stage_started
	stage_started = Time.get_ticks_usec()
	if data.surfaces.is_empty():
		if chunk_nodes.has(chunk):
			var old: StaticBody3D = chunk_nodes[chunk]
			remove_child(old)
			old.queue_free()
			chunk_nodes.erase(chunk)
		face_masks.erase(chunk)
		plane_geometry.erase(chunk)
		return
	var body: StaticBody3D
	if chunk_nodes.has(chunk):
		body = chunk_nodes[chunk]
	else:
		body = StaticBody3D.new()
		body.position = Vector3(chunk * VoxelChunkStore.CHUNK_SIZE)
		body.name = "Chunk_%d_%d_%d" % [chunk.x, chunk.y, chunk.z]
		var mesh_instance := MeshInstance3D.new()
		mesh_instance.name = "Mesh"
		body.add_child(mesh_instance)
		var collision := CollisionShape3D.new()
		collision.name = "Collision"
		body.add_child(collision)
		add_child(body)
		chunk_nodes[chunk] = body
	var mesh := ArrayMesh.new()
	var surface_ids: Array = data.surfaces.keys()
	surface_ids.sort()
	for material_id: int in surface_ids:
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, data.surfaces[material_id])
		mesh.surface_set_material(mesh.get_surface_count() - 1, materials[material_id])
	(body.get_node("Mesh") as MeshInstance3D).mesh = mesh
	var collision := body.get_node("Collision") as CollisionShape3D
	if data.collision.is_empty():
		collision.shape = null
	else:
		var shape := ConcavePolygonShape3D.new()
		shape.set_faces(data.collision)
		collision.shape = shape
	body.set_meta("faces", int(data.faces))
	body.set_meta("quads", int(data.quads))
	body.set_meta("revision", rebuild_serial)
	build_timings.upload_us = int(build_timings.get("upload_us", 0)) + Time.get_ticks_usec() - stage_started


# Preserve the integer-cell world API used by gameplay and persistence.
func set_cell_item(cell: Vector3i, material_id: int) -> void:
	chunk_store.set_block(cell, material_id)


func get_cell_item(cell: Vector3i) -> int:
	return chunk_store.get_block(cell)


func map_to_local(cell: Vector3i) -> Vector3:
	return Vector3(cell) + Vector3.ONE * 0.5


func local_to_map(point: Vector3) -> Vector3i:
	return Vector3i(floori(point.x), floori(point.y), floori(point.z))


func visible_face_count() -> int:
	var count := 0
	for body: StaticBody3D in chunk_nodes.values():
		count += int(body.get_meta("faces", 0))
	return count
