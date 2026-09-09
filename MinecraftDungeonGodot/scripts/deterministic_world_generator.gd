class_name DeterministicWorldGenerator
extends RefCounted

const CHUNK_SIZE := 16
const BIOME_NAMES := ["Plains", "Forest", "Desert", "Snow", "Coast", "Highlands"]
const GENERATION_VERSION := 6
const MAX_HEIGHT := 64
const CLIMATE_AXES := ["temperature", "humidity", "continentalness", "erosion", "weirdness", "depth"]


static func generate(seed_value: int, world_size: int) -> Dictionary:
	var stage_started := Time.get_ticks_usec()
	var timings := {}
	var size := clampi(world_size, 41, 255)
	if size % 2 == 0:
		size += 1
	var cells := {}
	var heights := PackedInt32Array()
	var biomes := PackedInt32Array()
	heights.resize(size * size)
	biomes.resize(size * size)
	var biome_counts := PackedInt32Array()
	biome_counts.resize(BIOME_NAMES.size())
	var half := size / 2
	var climate := PackedFloat32Array()
	climate.resize(size * size * 6)
	for z_index in size:
		for x_index in size:
			var world_x := x_index - half
			var world_z := z_index - half
			var sample := sample_climate(seed_value, world_x, world_z)
			var biome := choose_biome(sample)
			var height := terrain_height(sample, biome)
			var index := z_index * size + x_index
			for axis in 6:
				climate[index * 6 + axis] = sample[axis]
			heights[index] = height
			biomes[index] = biome
			biome_counts[biome] += 1
			for y in range(0, height + 1):
				var material := _material_for_layer(biome, y, height)
				cells[Vector3i(world_x, y, world_z)] = material
	timings.terrain_us = Time.get_ticks_usec() - stage_started
	stage_started = Time.get_ticks_usec()
	_ensure_biome_cores(seed_value, size, half, heights, biomes, biome_counts, cells)
	var underground := _decorate_underground(seed_value, size, half, heights, cells)
	timings.underground_us = Time.get_ticks_usec() - stage_started
	stage_started = Time.get_ticks_usec()
	# Keep the spawn plateau stable and unobstructed for every seed.
	var spawn_height := heights[half * size + half]
	for z in range(-2, 3):
		for x in range(-2, 3):
			for y in range(spawn_height + 1, MAX_HEIGHT):
				cells.erase(Vector3i(x, y, z))
			for y in range(0, spawn_height + 1):
				cells[Vector3i(x, y, z)] = _material_for_layer(0, y, spawn_height)
	var protected := _carve_protected_cave(spawn_height, cells)
	var cave_network := CaveNetwork.build(size, protected.path[-1], cells, protected.air)
	var cave_ceiling_by_column := {}
	for cell: Vector3i in protected.air:
		var column := Vector2i(cell.x, cell.z)
		cave_ceiling_by_column[column] = maxi(int(cave_ceiling_by_column.get(column, -1)), cell.y)
	# Sparse deterministic trees, after spawn protection.
	for z_index in range(2, size - 2):
		for x_index in range(2, size - 2):
			var index := z_index * size + x_index
			if biomes[index] != 1 or _hash01(seed_value + 919, x_index, z_index) < 0.965:
				continue
			var world_x := x_index - half
			var world_z := z_index - half
			if absi(world_x) <= 3 and absi(world_z) <= 3:
				continue
			if world_x >= -3 and world_x <= 19 and absi(world_z) <= 5:
				continue
			var base_y := heights[index] + 1
			var cave_overlap := false
			for dz in range(-1, 2):
				for dx in range(-1, 2):
					if int(cave_ceiling_by_column.get(Vector2i(world_x + dx, world_z + dz), -1)) >= base_y - 1: cave_overlap = true
			if cave_overlap: continue
			for y in range(base_y, base_y + 3):
				cells[Vector3i(world_x, y, world_z)] = BlockRegistry.LOG
			for y in range(base_y + 2, base_y + 4):
				for dz in range(-1, 2):
					for dx in range(-1, 2):
						if absi(dx) + absi(dz) <= 2:
							cells[Vector3i(world_x + dx, y, world_z + dz)] = BlockRegistry.LEAVES
	var structures := _place_biome_landmarks(seed_value, size, half, heights, biomes, cells, cave_ceiling_by_column)
	var springs := _place_springs(seed_value, size, half, heights, biomes, cells, protected.air, structures)
	var route_started := Time.get_ticks_usec()
	var routes := LandmarkRoutes.build(cells, size, heights, Vector3i(0, spawn_height + 1, 0), structures, protected.air, springs)
	timings.routes_us = Time.get_ticks_usec() - route_started
	# Feature metadata describes the final world, including deliberate structure replacement.
	for group in [underground.cheese, underground.spaghetti, underground.ravine]:
		for cell: Vector3i in group.keys():
			if cells.has(cell):
				group.erase(cell)
	for cell: Vector3i in underground.ore.keys():
		if int(cells.get(cell, -1)) not in [BlockRegistry.MOSS, BlockRegistry.COBBLESTONE]:
			underground.ore.erase(cell)
	timings.decoration_us = Time.get_ticks_usec() - stage_started - timings.routes_us
	stage_started = Time.get_ticks_usec()
	var heightmaps := final_heightmaps(size, cells)
	timings.heightmap_us = Time.get_ticks_usec() - stage_started
	stage_started = Time.get_ticks_usec()
	var cell_signature := signature(cells)
	timings.signature_us = Time.get_ticks_usec() - stage_started
	return {
		"timings": timings,
		"generation_version": GENERATION_VERSION,
		"seed": seed_value,
		"size": size,
		"cells": cells,
		"heights": heightmaps.collision,
		"surface_heights": heightmaps.surface,
		"ocean_floor_heights": heightmaps.ocean_floor,
		"terrain_heights": heights,
		"climate": climate,
		"biomes": biomes,
		"biome_counts": biome_counts,
		"cheese_caves": underground.cheese,
		"spaghetti_caves": underground.spaghetti,
		"ravine_cells": underground.ravine,
		"ore_cells": underground.ore,
		"spring_cells": springs,
		"structures": structures,
		"landmark_routes": routes,
		"protected_cave": protected.air,
		"cave_path": protected.path,
		"cave_entrance": protected.path[3],
		"cave_destination": protected.path[-1],
		"cave_network": cave_network,
		"spawn": Vector3i(0, spawn_height + 1, 0),
		"signature": cell_signature,
	}


static func _ensure_biome_cores(seed_value: int, size: int, half: int, heights: PackedInt32Array, biomes: PackedInt32Array, biome_counts: PackedInt32Array, cells: Dictionary) -> void:
	var ring_radius := maxf(7.0, size * 0.37)
	var core_radius := maxi(4, roundi(size * 0.035))
	# Keep guaranteed biome anchors away from the eastward protected cave corridor.
	var phase := PI / 6.0 + (_hash01(seed_value + 811, 0, 0) - 0.5) * 0.12
	for biome in BIOME_NAMES.size():
		var angle := phase + TAU * float(biome) / BIOME_NAMES.size()
		var center_x := clampi(roundi(cos(angle) * ring_radius), -half + core_radius + 1, half - core_radius - 1)
		var center_z := clampi(roundi(sin(angle) * ring_radius), -half + core_radius + 1, half - core_radius - 1)
		for dz in range(-core_radius, core_radius + 1):
			for dx in range(-core_radius, core_radius + 1):
				if dx * dx + dz * dz > core_radius * core_radius:
					continue
				var x_index := center_x + dx + half
				var z_index := center_z + dz + half
				var index := z_index * size + x_index
				var previous := biomes[index]
				if previous == biome:
					continue
				biome_counts[previous] -= 1
				biome_counts[biome] += 1
				biomes[index] = biome
				var surface_y := heights[index]
				cells[Vector3i(center_x + dx, surface_y, center_z + dz)] = _material_for_layer(biome, surface_y, surface_y)


static func _decorate_underground(seed_value: int, size: int, half: int, heights: PackedInt32Array, cells: Dictionary) -> Dictionary:
	var cheese := {}
	var spaghetti := {}
	var ravine := {}
	var ore := {}
	var density := FastNoiseLite.new()
	density.seed = int(seed_value & 0x7fffffff)
	density.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	density.fractal_type = FastNoiseLite.FRACTAL_FBM
	density.fractal_octaves = 2
	density.frequency = 0.08
	for z_index in size:
		var world_z := z_index - half
		var tunnel_x := roundi(sin((world_z + (seed_value % 31)) * 0.19) * size * 0.22)
		var tunnel_y := 14 + roundi(sin((world_z - seed_value % 17) * 0.17) * 3.0)
		var ravine_x := roundi(sin((world_z + seed_value % 43) * 0.075) * size * 0.28) + int(size * 0.14)
		for x_index in size:
			var world_x := x_index - half
			var height := heights[z_index * size + x_index]
			if absi(world_x) <= 4 and absi(world_z) <= 4:
				continue
			for y in range(2, height + 1):
				var cell := Vector3i(world_x, y, world_z)
				if not cells.has(cell):
					continue
				var carved := false
				if absi(world_x - tunnel_x) <= 1 and absi(y - tunnel_y) <= 1:
					cells.erase(cell)
					spaghetti[cell] = true
					carved = true
				elif absi(world_x - ravine_x) <= 1 and y >= 10:
					cells.erase(cell)
					ravine[cell] = true
					carved = true
				elif y < height - 3 and density.get_noise_3d(world_x, y, world_z) > 0.48:
					cells.erase(cell)
					cheese[cell] = true
					carved = true
				if not carved and int(cells.get(cell, -1)) == BlockRegistry.STONE and _hash3(seed_value + 2017, world_x, y, world_z) > 0.987:
					cells[cell] = BlockRegistry.MOSS if _hash3(seed_value + 2027, world_x, y, world_z) > 0.5 else BlockRegistry.COBBLESTONE
					ore[cell] = true
	# Rare noise seeds still receive a spatially continuous chamber, not isolated pinholes.
	if cheese.is_empty():
		for dx in range(-2, 3):
			for dy in range(-2, 3):
				for dz in range(-2, 3):
					if dx * dx + dy * dy + dz * dz > 6: continue
					var cell := Vector3i(-half + 5 + dx, 12 + dy, -half + 5 + dz)
					cells.erase(cell)
					cheese[cell] = true
	return {"cheese": cheese, "spaghetti": spaghetti, "ravine": ravine, "ore": ore}


static func _place_biome_landmarks(seed_value: int, size: int, half: int, heights: PackedInt32Array, biomes: PackedInt32Array, cells: Dictionary, cave_ceiling_by_column: Dictionary = {}) -> Array[Dictionary]:
	var structures: Array[Dictionary] = []
	var palettes := [BlockRegistry.PLANK, BlockRegistry.MOSS, BlockRegistry.SAND, BlockRegistry.SNOW, BlockRegistry.COBBLESTONE, BlockRegistry.BRICK]
	var order := [0, 1, 2, 3, 4, 5]
	order.sort_custom(func(a: int, b: int) -> bool: return biomes.count(a) < biomes.count(b))
	for biome: int in order:
		var best_index := -1
		var best_score := 2.0
		for z_index in range(4, size - 4):
			for x_index in range(4, size - 4):
				var index := z_index * size + x_index
				if biomes[index] != biome:
					continue
				var world_x := x_index - half
				var world_z := z_index - half
				if absi(world_x) <= 6 and absi(world_z) <= 6:
					continue
				if world_x >= -4 and world_x <= 20 and world_z >= -6 and world_z <= 8:
					continue
				var overlaps := false
				for existing: Dictionary in structures:
					if absi(world_x - existing.anchor.x) <= 6 and absi(world_z - existing.anchor.z) <= 6:
						overlaps = true
						break
				if overlaps: continue
				var score := _hash01(seed_value + biome * 131 + 3001, world_x, world_z)
				if score < best_score:
					var intersects_cave := false
					for dz in range(-2, 3):
						for dx in range(-2, 3):
							if int(cave_ceiling_by_column.get(Vector2i(world_x + dx, world_z + dz), -1)) >= heights[index] - 3: intersects_cave = true
					for distance in [3, 4]:
						if int(cave_ceiling_by_column.get(Vector2i(world_x, world_z - distance), -1)) >= heights[index] - 3: intersects_cave = true
					if intersects_cave: continue
					best_score = score
					best_index = index
		if best_index < 0:
			continue
		var anchor_x := best_index % size
		var anchor_z := int(best_index / size)
		var world_anchor := Vector3i(anchor_x - half, heights[best_index] + 1, anchor_z - half)
		var floor_y := world_anchor.y - 1
		var material_id: int = palettes[biome]
		for dz in range(-2, 3):
			for dx in range(-2, 3):
				var column_x := world_anchor.x + dx
				var column_z := world_anchor.z + dz
				for y in range(maxi(0, floor_y - 3), floor_y + 1):
					if not cells.has(Vector3i(column_x, y, column_z)):
						cells[Vector3i(column_x, y, column_z)] = material_id
				for y in range(floor_y + 1, MAX_HEIGHT):
					cells.erase(Vector3i(column_x, y, column_z))
				cells[Vector3i(column_x, floor_y, column_z)] = material_id
				var is_wall := absi(dx) == 2 or absi(dz) == 2
				var is_door := dz == -2 and dx == 0
				if is_wall and not is_door:
					cells[Vector3i(column_x, floor_y + 1, column_z)] = material_id
					cells[Vector3i(column_x, floor_y + 2, column_z)] = material_id
				cells[Vector3i(column_x, floor_y + 3, column_z)] = material_id
		var door := world_anchor + Vector3i(0, 0, -2)
		# A short level approach prevents surface ridges from sealing the doorway.
		for distance in range(3, 5):
			var approach := world_anchor + Vector3i(0, 0, -distance)
			cells[approach + Vector3i.DOWN] = material_id
			for y in range(approach.y, MAX_HEIGHT):
				cells.erase(Vector3i(approach.x, y, approach.z))
		structures.append({"biome": biome, "anchor": world_anchor, "material": material_id, "door": door})
	return structures


static func _place_springs(seed_value: int, size: int, half: int, heights: PackedInt32Array, biomes: PackedInt32Array, cells: Dictionary, protected: Dictionary, structures: Array[Dictionary]) -> Dictionary:
	var springs := {}
	for z_index in range(1, size - 1):
		for x_index in range(1, size - 1):
			var index := z_index * size + x_index
			if biomes[index] != 4 or _hash01(seed_value + 4001, x_index, z_index) < 0.996:
				continue
			var cell := Vector3i(x_index - half, heights[index] + 1, z_index - half)
			if cells.has(cell) or protected.has(cell) or not cells.has(cell + Vector3i.DOWN): continue
			if _near_structure(cell, structures): continue
			cells[cell] = BlockRegistry.WATER
			springs[cell] = true
	if springs.is_empty():
		for index in biomes.size():
			if biomes[index] == 4:
				var cell := Vector3i(index % size - half, heights[index] + 1, int(index / size) - half)
				if cells.has(cell) or protected.has(cell) or not cells.has(cell + Vector3i.DOWN): continue
				if _near_structure(cell, structures): continue
				cells[cell] = BlockRegistry.WATER
				springs[cell] = true
				break
	return springs


static func _near_structure(cell: Vector3i, structures: Array[Dictionary]) -> bool:
	for structure in structures:
		var anchor: Vector3i = structure.anchor
		if absi(cell.x - anchor.x) <= 3 and cell.z >= anchor.z - 5 and cell.z <= anchor.z + 3:
			return true
	return false


static func _carve_protected_cave(spawn_height: int, cells: Dictionary) -> Dictionary:
	var air := {}
	var path: Array[Vector3i] = []
	for x in range(0, 17):
		var feet := Vector3i(x, spawn_height + 1 - clampi(x - 3, 0, 8), 0)
		path.append(feet)
		for z in range(-1, 2):
			cells[Vector3i(x, feet.y - 1, z)] = BlockRegistry.STONE
			var ceiling := MAX_HEIGHT if x <= 3 else feet.y + 3
			for y in range(feet.y, ceiling):
				var cell := Vector3i(x, y, z)
				cells.erase(cell)
				air[cell] = true
	var chamber_y := spawn_height - 7
	for x in range(12, 18):
		for z in range(-3, 4):
			cells[Vector3i(x, chamber_y - 1, z)] = BlockRegistry.STONE
			for y in range(chamber_y, chamber_y + 4):
				var cell := Vector3i(x, y, z)
				cells.erase(cell)
				air[cell] = true
	return {"air": air, "path": path}


static func _motion_heights(size: int, half: int, cells: Dictionary) -> PackedInt32Array:
	var heights := PackedInt32Array()
	heights.resize(size * size)
	heights.fill(-1)
	for cell: Vector3i in cells:
		if not BlockRegistry.DEFINITIONS[int(cells[cell])].solid: continue
		var index := (cell.z + half) * size + cell.x + half
		heights[index] = maxi(heights[index], cell.y)
	return heights


# Six independent horizontal fields. Depth is a shaping signal, not elevation.
static func sample_climate(seed_value: int, x: int, z: int) -> PackedFloat32Array:
	return PackedFloat32Array([
		_fractal(seed_value + 307, x, z, 0.035), _fractal(seed_value + 401, x, z, 0.04),
		_fractal(seed_value + 101, x, z, 0.045), _fractal(seed_value + 211, x, z, 0.085),
		_fractal(seed_value + 503, x, z, 0.065), _fractal(seed_value + 607, x, z, 0.025)])


static func climate_at(layout: Dictionary, cell: Vector3i) -> PackedFloat32Array:
	var half := int(layout.size / 2)
	if absi(cell.x) > half or absi(cell.z) > half:
		return PackedFloat32Array()
	var index: int = (cell.z + half) * layout.size + cell.x + half
	return layout.climate.slice(index * 6, index * 6 + 6)


static func density_depth_at(layout: Dictionary, cell: Vector3i) -> float:
	var half := int(layout.size / 2)
	if absi(cell.x) > half or absi(cell.z) > half: return NAN
	var index: int = (cell.z + half) * layout.size + cell.x + half
	return float(layout.terrain_heights[index] - cell.y) / 32.0


# Heights are inclusive voxel y values, -1 for an empty column. Ocean floor
# means highest fluid-excluding solid (including roofs/leaves), not geology.
# It matches collision height with today's registry; keep distinct maps so a
# future block predicate change cannot silently redefine the public contract.
static func final_heightmaps(size: int, cells: Dictionary) -> Dictionary:
	var surface := PackedInt32Array()
	var ocean_floor := PackedInt32Array()
	var collision := PackedInt32Array()
	surface.resize(size * size)
	surface.fill(-1)
	ocean_floor = surface.duplicate()
	collision = surface.duplicate()
	var half := int(size / 2)
	for cell: Vector3i in cells:
		var index := (cell.z + half) * size + cell.x + half
		var material_id: int = cells[cell]
		surface[index] = maxi(surface[index], cell.y)
		if material_id != BlockRegistry.WATER and BlockRegistry.DEFINITIONS[material_id].solid:
			ocean_floor[index] = maxi(ocean_floor[index], cell.y)
		if BlockRegistry.DEFINITIONS[material_id].solid:
			collision[index] = maxi(collision[index], cell.y)
	return {"surface": surface, "ocean_floor": ocean_floor, "collision": collision}


static func signature(cells: Dictionary) -> int:
	# Native integer sorting preserves x/y/z lexicographic order without millions
	# of GDScript comparator callbacks. Keep full Vector3i-domain compatibility.
	var packed := PackedInt64Array()
	packed.resize(cells.size())
	var index := 0
	for cell: Vector3i in cells:
		if cell.x < -32768 or cell.x > 32767 or cell.y < -32768 or cell.y > 32767 or cell.z < -32768 or cell.z > 32767:
			return _signature_reference(cells)
		packed[index] = ((cell.x + 32768) << 32) | ((cell.y + 32768) << 16) | (cell.z + 32768)
		index += 1
	packed.sort()
	var value := 2166136261
	for code in packed:
		var cell := Vector3i((code >> 32) - 32768, ((code >> 16) & 65535) - 32768, (code & 65535) - 32768)
		value = int((value ^ cell.x) * 16777619) & 0x7fffffff
		value = int((value ^ cell.y) * 16777619) & 0x7fffffff
		value = int((value ^ cell.z) * 16777619) & 0x7fffffff
		value = int((value ^ int(cells[cell])) * 16777619) & 0x7fffffff
	return value


static func _signature_reference(cells: Dictionary) -> int:
	var keys: Array = cells.keys()
	keys.sort_custom(func(a: Vector3i, b: Vector3i) -> bool:
		if a.x != b.x: return a.x < b.x
		if a.y != b.y: return a.y < b.y
		return a.z < b.z
	)
	var value := 2166136261
	for cell: Vector3i in keys:
		value = int((value ^ cell.x) * 16777619) & 0x7fffffff
		value = int((value ^ cell.y) * 16777619) & 0x7fffffff
		value = int((value ^ cell.z) * 16777619) & 0x7fffffff
		value = int((value ^ int(cells[cell])) * 16777619) & 0x7fffffff
	return value


static func world_to_chunk(cell: Vector3i) -> Vector3i:
	# Arithmetic right shift is floor division by 16, including negative cells.
	return Vector3i(cell.x >> 4, cell.y >> 4, cell.z >> 4)


static func world_to_local(cell: Vector3i) -> Vector3i:
	var chunk := world_to_chunk(cell)
	return cell - chunk * CHUNK_SIZE


static func choose_biome(sample: PackedFloat32Array) -> int:
	var temperature := sample[0]
	var humidity := sample[1]
	var continental := sample[2]
	var erosion := sample[3]
	var weirdness := sample[4]
	if continental < -0.42:
		return 4
	if (continental > 0.55 and erosion < 0.1) or (continental > 0.2 and weirdness > 0.42):
		return 5
	if temperature < -0.28:
		return 3
	if temperature > 0.28 and humidity < -0.05:
		return 2
	if humidity > 0.12:
		return 1
	return 0


static func terrain_height(sample: PackedFloat32Array, biome: int) -> int:
	var height := clampi(32 + roundi(sample[2] * 10.0 - sample[3] * 4.0 + sample[4] * 5.0 + sample[5] * 4.0), 22, 48)
	if biome == 4: return mini(height, 28)
	if biome == 5: return mini(52, height + 5)
	return height


static func _material_for_layer(biome: int, y: int, surface_y: int) -> int:
	if y < surface_y - 2:
		return BlockRegistry.STONE
	if y < surface_y:
		return BlockRegistry.DIRT if biome != 2 and biome != 4 else BlockRegistry.SAND
	match biome:
		2, 4:
			return BlockRegistry.SAND
		3:
			return BlockRegistry.SNOW
		5:
			return BlockRegistry.STONE
		_:
			return BlockRegistry.GRASS


static func _fractal(seed_value: int, x: int, z: int, frequency: float) -> float:
	var total := 0.0
	var amplitude := 1.0
	var normalizer := 0.0
	var current_frequency := frequency
	for octave in 3:
		total += _value_noise(seed_value + octave * 977, x * current_frequency, z * current_frequency) * amplitude
		normalizer += amplitude
		amplitude *= 0.5
		current_frequency *= 2.0
	return total / normalizer


static func _value_noise(seed_value: int, x: float, z: float) -> float:
	var x0 := floori(x)
	var z0 := floori(z)
	var tx := smoothstep(0.0, 1.0, x - x0)
	var tz := smoothstep(0.0, 1.0, z - z0)
	var a := lerpf(_hash01(seed_value, x0, z0), _hash01(seed_value, x0 + 1, z0), tx)
	var b := lerpf(_hash01(seed_value, x0, z0 + 1), _hash01(seed_value, x0 + 1, z0 + 1), tx)
	return lerpf(a, b, tz) * 2.0 - 1.0


static func _hash01(seed_value: int, x: int, z: int) -> float:
	var n := int(seed_value) ^ (x * 374761393) ^ (z * 668265263)
	n = (n ^ (n >> 13)) * 1274126177
	n = n ^ (n >> 16)
	return float(n & 0x7fffffff) / 2147483647.0


static func _hash3(seed_value: int, x: int, y: int, z: int) -> float:
	var n := int(seed_value) ^ (x * 374761393) ^ (y * 1442695041) ^ (z * 668265263)
	n = (n ^ (n >> 13)) * 1274126177
	n = n ^ (n >> 16)
	return float(n & 0x7fffffff) / 2147483647.0
