class_name VoxelChunkMesher
extends RefCounted

const DIRECTIONS := [Vector3i.RIGHT, Vector3i.LEFT, Vector3i.UP, Vector3i.DOWN, Vector3i.BACK, Vector3i.FORWARD]
const U_AXES := [Vector3(0, 1, 0), Vector3(0, -1, 0), Vector3(1, 0, 0), Vector3(-1, 0, 0), Vector3(1, 0, 0), Vector3(-1, 0, 0)]
const V_AXES := [Vector3(0, 0, 1), Vector3(0, 0, 1), Vector3(0, 0, -1), Vector3(0, 0, -1), Vector3(0, 1, 0), Vector3(0, 1, 0)]
const TRIANGLES := [0, 2, 1, 0, 3, 2]
const UVS := [Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0)]
const NORMAL_AXIS := [0, 0, 1, 1, 2, 2]
const U_AXIS := [1, 1, 0, 0, 0, 0]
const V_AXIS := [2, 2, 2, 2, 1, 1]
const HALO_OFFSETS := [1, -1, 18, -18, 324, -324]
static var face_keys: PackedInt32Array = _create_face_keys()

class PlaneMask:
	extends RefCounted
	var cells := PackedInt32Array()
	var revision := 0
	func _init() -> void:
		cells.resize(256)

class SurfaceBuffer:
	extends RefCounted
	var vertices: Array[Vector3] = []
	var normals: Array[Vector3] = []
	var uvs: Array[Vector2] = []
	var indices: Array[int] = []

class PackedSurfaceBuffer:
	extends RefCounted
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()

class PlaneGeometry:
	extends RefCounted
	var mask: PlaneMask
	var revision: int
	var surfaces: Dictionary
	var collision: PackedVector3Array
	var faces: int
	var quads: int
	func _init(source: PlaneMask, data: Dictionary) -> void:
		mask = source
		revision = source.revision
		surfaces = data.surfaces
		collision = data.collision
		faces = data.faces
		quads = data.quads


static func build_masks(store: VoxelChunkStore, chunk: Vector3i) -> Dictionary:
	# Measured crossover: a 64-cell chunk is cheaper without halo setup.
	if store.chunks.get(chunk, {}).size() <= 64:
		return build_masks_reference(store, chunk)
	return build_masks_packed(store, chunk)


static func build_masks_packed(store: VoxelChunkStore, chunk: Vector3i) -> Dictionary:
	var members: Dictionary = store.chunks.get(chunk, {})
	var masks := {}
	if members.is_empty(): return masks
	# One packed 18-cube neighborhood replaces six dictionary/API lookups per
	# solid cell. Only this temporary halo is dense; persistent world data stays sparse.
	var halo := PackedInt32Array()
	halo.resize(18 * 18 * 18)
	var origin := chunk * 16
	for cell: Vector3i in members:
		var local := cell - origin
		halo[(local.z + 1) * 324 + (local.y + 1) * 18 + local.x + 1] = int(members[cell]) + 1
	# Face-adjacent cells never read halo edges/corners. Fetch just six border
	# planes from the effective journal, not an entire padded volume.
	for v in 16:
		for u in 16:
			halo[(v + 1) * 324 + (u + 1) * 18] = store.get_block(origin + Vector3i(-1, u, v)) + 1
			halo[(v + 1) * 324 + (u + 1) * 18 + 17] = store.get_block(origin + Vector3i(16, u, v)) + 1
			halo[(v + 1) * 324 + u + 1] = store.get_block(origin + Vector3i(u, -1, v)) + 1
			halo[(v + 1) * 324 + 306 + u + 1] = store.get_block(origin + Vector3i(u, 16, v)) + 1
			halo[(v + 1) * 18 + u + 1] = store.get_block(origin + Vector3i(u, v, -1)) + 1
			halo[5508 + (v + 1) * 18 + u + 1] = store.get_block(origin + Vector3i(u, v, 16)) + 1
	for cell: Vector3i in members:
		var local := cell - origin
		var halo_index := (local.z + 1) * 324 + (local.y + 1) * 18 + local.x + 1
		var row_key: int = (int(members[cell]) + 1) * (BlockRegistry.MATERIAL_COUNT + 1)
		var orientation := store.get_state(cell) if int(members[cell]) == BlockRegistry.LOG else 0
		for face in 6:
			var key := face_keys[row_key + halo[halo_index + HALO_OFFSETS[face]]]
			if key == 0: continue
			key |= orientation << 8
			var plane_key: int = face * 16 + local[NORMAL_AXIS[face]]
			if not masks.has(plane_key): masks[plane_key] = PlaneMask.new()
			var mask: PlaneMask = masks[plane_key]
			mask.cells[local[V_AXIS[face]] * 16 + local[U_AXIS[face]]] = key
	return masks


static func _create_face_keys() -> PackedInt32Array:
	var keys := PackedInt32Array()
	keys.resize((BlockRegistry.MATERIAL_COUNT + 1) * (BlockRegistry.MATERIAL_COUNT + 1))
	for material_id in BlockRegistry.MATERIAL_COUNT:
		for neighbor in range(-1, BlockRegistry.MATERIAL_COUNT):
			var visible := face_visible(material_id, neighbor)
			var collidable: bool = BlockRegistry.DEFINITIONS[material_id].solid and (neighbor == -1 or not BlockRegistry.DEFINITIONS[neighbor].solid)
			if visible or collidable:
				keys[(material_id + 1) * (BlockRegistry.MATERIAL_COUNT + 1) + neighbor + 1] = ((material_id + 1) << 2) | int(visible) | (int(collidable) << 1)
	return keys


static func build_masks_reference(store: VoxelChunkStore, chunk: Vector3i) -> Dictionary:
	var masks := {}
	var members: Dictionary = store.chunks.get(chunk, {})
	for cell: Vector3i in members:
		update_cell_mask(store, cell, masks)
	return masks


static func update_cell_mask(store: VoxelChunkStore, cell: Vector3i, masks: Dictionary) -> void:
	var material_id := store.get_block(cell)
	var local := DeterministicWorldGenerator.world_to_local(cell)
	for face in 6:
		var key := 0
		if material_id != -1:
			var definition: Dictionary = BlockRegistry.DEFINITIONS[material_id]
			var neighbor := store.get_block(cell + DIRECTIONS[face])
			var visible := face_visible(material_id, neighbor)
			var collidable: bool = definition.solid and (neighbor == -1 or not BlockRegistry.DEFINITIONS[neighbor].solid)
			if visible or collidable:
				key = ((material_id + 1) << 2) | int(visible) | (int(collidable) << 1)
				if material_id == BlockRegistry.LOG: key |= store.get_state(cell) << 8
		var plane_key: int = face * 16 + local[NORMAL_AXIS[face]]
		if not masks.has(plane_key):
			if key == 0:
				continue
			else:
				masks[plane_key] = PlaneMask.new()
		var mask: PlaneMask = masks[plane_key]
		var mask_index: int = local[V_AXIS[face]] * 16 + local[U_AXIS[face]]
		if mask.cells[mask_index] != key:
			mask.cells[mask_index] = key
			mask.revision += 1


static func build_cached(store: VoxelChunkStore, chunk: Vector3i, masks: Dictionary, cache: Dictionary) -> Dictionary:
	# Cache immutable geometry, not the mutable greedy-merge scratch mask.
	# Identity also guards callers replacing a mask with the same revision.
	var surfaces := {}
	var collision := PackedVector3Array()
	var faces := 0
	var quads := 0
	var built := 0
	var reused := 0
	for stale_key: int in cache.keys():
		if not masks.has(stale_key): cache.erase(stale_key)
	for plane_key: int in masks:
		var mask: PlaneMask = masks[plane_key]
		var entry: PlaneGeometry = cache.get(plane_key)
		if entry == null or entry.mask != mask or entry.revision != mask.revision:
			entry = PlaneGeometry.new(mask, build(store, chunk, {plane_key: mask}))
			cache[plane_key] = entry
			built += 1
		else:
			reused += 1
		faces += entry.faces
		quads += entry.quads
		collision.append_array(entry.collision)
		for material_id: int in entry.surfaces:
			if not surfaces.has(material_id): surfaces[material_id] = PackedSurfaceBuffer.new()
			var buffer: PackedSurfaceBuffer = surfaces[material_id]
			var arrays: Array = entry.surfaces[material_id]
			var offset := buffer.vertices.size()
			buffer.vertices.append_array(arrays[Mesh.ARRAY_VERTEX])
			buffer.normals.append_array(arrays[Mesh.ARRAY_NORMAL])
			buffer.uvs.append_array(arrays[Mesh.ARRAY_TEX_UV])
			for index: int in arrays[Mesh.ARRAY_INDEX]: buffer.indices.append(offset + index)
	var arrays_by_material := {}
	for material_id: int in surfaces:
		var buffer: PackedSurfaceBuffer = surfaces[material_id]
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = buffer.vertices
		arrays[Mesh.ARRAY_NORMAL] = buffer.normals
		arrays[Mesh.ARRAY_TEX_UV] = buffer.uvs
		arrays[Mesh.ARRAY_INDEX] = buffer.indices
		arrays_by_material[material_id] = arrays
	return {"surfaces": arrays_by_material, "collision": collision, "faces": faces, "quads": quads, "planes_built": built, "planes_reused": reused}


static func build(store: VoxelChunkStore, chunk: Vector3i, cached_masks: Variant = null) -> Dictionary:
	var surfaces := {}
	var collision: Array[Vector3] = []
	var face_count := 0
	var quad_count := 0
	var masks: Dictionary = build_masks(store, chunk) if cached_masks == null else cached_masks
	# Merge rectangles only when material, visual and collision rules all match.
	for plane_key: int in masks:
		var mask := PlaneMask.new()
		mask.cells = masks[plane_key].cells.duplicate()
		var face := int(plane_key / 16)
		var slice := plane_key % 16
		for row in 16:
			var column := 0
			while column < 16:
				var key := mask.cells[row * 16 + column]
				if key == 0:
					column += 1
					continue
				var width := 1
				while column + width < 16 and mask.cells[row * 16 + column + width] == key:
					width += 1
				var height := 1
				var matches := true
				while row + height < 16 and matches:
					for offset in width:
						if mask.cells[(row + height) * 16 + column + offset] != key:
							matches = false
							break
					if matches: height += 1
				for dy in height:
					for dx in width:
						mask.cells[(row + dy) * 16 + column + dx] = 0
				var normal := Vector3(DIRECTIONS[face])
				var center := Vector3.ZERO
				center[NORMAL_AXIS[face]] = slice + 0.5 + normal[NORMAL_AXIS[face]] * 0.5
				center[U_AXIS[face]] = column + width * 0.5
				center[V_AXIS[face]] = row + height * 0.5
				var u: Vector3 = U_AXES[face] * width * 0.5
				var v: Vector3 = V_AXES[face] * height * 0.5
				var corners := [center - u - v, center + u - v, center + u + v, center - u + v]
				var material_id := ((key & 255) >> 2) - 1
				if (key & 1) != 0:
					face_count += width * height
					if not surfaces.has(material_id):
						surfaces[material_id] = SurfaceBuffer.new()
					var buffer: SurfaceBuffer = surfaces[material_id]
					var first := buffer.vertices.size()
					for index in 4:
						buffer.vertices.append(corners[index])
						buffer.normals.append(normal)
						buffer.uvs.append(BlockOrientation.log_uv(corners[index], normal, key >> 8) if material_id == BlockRegistry.LOG else UVS[index] * Vector2(width, height))
					for index in TRIANGLES:
						buffer.indices.append(first + index)
					quad_count += 1
				if (key & 2) != 0:
					for index in TRIANGLES:
						collision.append(corners[index])
				column += width
	var arrays_by_material := {}
	for material_id: int in surfaces:
		var buffer: SurfaceBuffer = surfaces[material_id]
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = PackedVector3Array(buffer.vertices)
		arrays[Mesh.ARRAY_NORMAL] = PackedVector3Array(buffer.normals)
		arrays[Mesh.ARRAY_TEX_UV] = PackedVector2Array(buffer.uvs)
		arrays[Mesh.ARRAY_INDEX] = PackedInt32Array(buffer.indices)
		arrays_by_material[material_id] = arrays
	return {"surfaces": arrays_by_material, "collision": PackedVector3Array(collision), "faces": face_count, "quads": quad_count}


static func face_visible(material_id: int, neighbor: int) -> bool:
	if neighbor == -1:
		return true
	if not BlockRegistry.DEFINITIONS[neighbor].transparent:
		return false
	return material_id != neighbor


static func unit_log_mesh(material: Material) -> ArrayMesh:
	# GridMap baseline and physical loot use the same identity-oriented log.
	var store := VoxelChunkStore.new()
	store.initialize(0, 1, {Vector3i.ZERO: BlockRegistry.LOG}, 0)
	var arrays: Array = build(store, Vector3i.ZERO).surfaces[BlockRegistry.LOG]
	var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	for index in vertices.size(): vertices[index] -= Vector3.ONE * 0.5
	arrays[Mesh.ARRAY_VERTEX] = vertices
	var result := ArrayMesh.new()
	result.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	result.surface_set_material(0, material)
	return result
