extends SceneTree

var failures: Array[String] = []
var assertions := 0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var baseline := PackedFloat32Array([0, 0, 0, 0, 0, 0])
	var base_biome := DeterministicWorldGenerator.choose_biome(baseline)
	var base_height := DeterministicWorldGenerator.terrain_height(baseline, base_biome)
	for axis in 6:
		var changed := baseline.duplicate()
		changed[axis] = -0.8 if axis == 0 else 0.8
		var biome := DeterministicWorldGenerator.choose_biome(changed)
		var height := DeterministicWorldGenerator.terrain_height(changed, biome)
		_expect(biome != base_biome or height != base_height, "axis %s causally affects biome or height" % DeterministicWorldGenerator.CLIMATE_AXES[axis])
	var low := PackedFloat32Array([0, 0, 0, 0, 0, -0.75])
	var high := PackedFloat32Array([0, 0, 0, 0, 0, 0.75])
	_expect(DeterministicWorldGenerator.terrain_height(high, 0) - DeterministicWorldGenerator.terrain_height(low, 0) == 6, "Depth alone changes non-clamped terrain by six blocks")
	_expect(DeterministicWorldGenerator.choose_biome(PackedFloat32Array([0, 0, 0.3, 0.3, 0.8, 0])) == 5, "Weirdness creates highland biome")
	_expect(DeterministicWorldGenerator._material_for_layer(5, 32, 32) == BlockRegistry.STONE, "Highlands use stone, not snow")
	_expect(DeterministicWorldGenerator._material_for_layer(4, 28, 28) == BlockRegistry.SAND, "Coast uses sand")
	var depths := {}
	for fixture in [[1337, 41], [-7, 41], [42, 41], [-2147483648, 41], [2147483647, 41], [1337, 185]]:
		var layout := DeterministicWorldGenerator.generate(fixture[0], fixture[1])
		var errors := WorldLayoutValidator.validate(layout)
		_expect(errors.is_empty(), "final world valid %s: %s" % [fixture, errors])
		_expect(layout.generation_version == 6 and layout.climate.size() == fixture[1] * fixture[1] * 6, "versioned six-field data")
		var half := int(layout.size / 2)
		var correct := true
		var minima := PackedFloat32Array([1, 1, 1, 1, 1, 1])
		var maxima := PackedFloat32Array([-1, -1, -1, -1, -1, -1])
		for z in range(-half, half + 1):
			for x in range(-half, half + 1):
				var index: int = (z + half) * layout.size + x + half
				# Scan top-down independently rather than calling the map builder.
				var surface := -1
				var solid := -1
				for y in range(DeterministicWorldGenerator.MAX_HEIGHT - 1, -1, -1):
					var material_id: int = layout.cells.get(Vector3i(x, y, z), -1)
					if material_id < 0: continue
					if surface < 0: surface = y
					if BlockRegistry.by_material(material_id).solid:
						solid = y
						break
				correct = correct and layout.surface_heights[index] == surface and layout.ocean_floor_heights[index] == solid and layout.heights[index] == solid
				for axis in 6:
					var value: float = layout.climate[index * 6 + axis]
					minima[axis] = minf(minima[axis], value)
					maxima[axis] = maxf(maxima[axis], value)
		_expect(correct, "independent final column oracle %s" % [fixture])
		for axis in 6: _expect(maxima[axis] - minima[axis] > 0.05, "field %s varies spatially" % DeterministicWorldGenerator.CLIMATE_AXES[axis])
		var sample := DeterministicWorldGenerator.climate_at(layout, Vector3i.ZERO)
		_expect(sample == DeterministicWorldGenerator.climate_at(layout, Vector3i(0, 50, 0)), "Depth climate is not derived from elevation")
		_expect(sample == DeterministicWorldGenerator.sample_climate(fixture[0], 0, 0), "stored fields equal deterministic seed sampling")
		depths[fixture[0]] = sample[5]
		var water_difference := false
		for cell: Vector3i in layout.spring_cells:
			var index: int = (cell.z + half) * layout.size + cell.x + half
			if layout.surface_heights[index] == cell.y and layout.ocean_floor_heights[index] == cell.y - 1:
				water_difference = true
		_expect(water_difference, "water surface and solid floor are distinct")
		_expect(layout.signature == DeterministicWorldGenerator._signature_reference(layout.cells), "independent ordered signature matches version 6 world")
		print("CLIMATE WORLD seed=%d size=%d cells=%d hash=%d range_min=%s range_max=%s" % [fixture[0], fixture[1], layout.cells.size(), layout.signature, minima, maxima])
	_expect(depths.values().size() == 5 and depths[1337] != depths[-7] and depths[-7] != depths[42], "Depth responds to seed")
	var cells := {Vector3i(0, 2, 0): BlockRegistry.STONE, Vector3i(0, 3, 0): BlockRegistry.WATER, Vector3i(1, 7, 0): BlockRegistry.LEAVES}
	var maps := DeterministicWorldGenerator.final_heightmaps(3, cells)
	_expect(maps.surface[4] == 3 and maps.ocean_floor[4] == 2 and maps.collision[4] == 2, "water-over-solid heightmap fixture")
	_expect(maps.ocean_floor[5] == 7 and maps.collision[5] == 7 and maps.surface[0] == -1, "leaves block motion; empty column stays -1")
	maps.surface[4] = 99
	_expect(maps.ocean_floor[4] == 2, "heightmap arrays do not alias after mutation")
	var original := DeterministicWorldGenerator.generate(1337, 41)
	_expect(original.signature == 2029358965, "version 6 golden hash after independent oracle review")
	for fault in ["surface", "ocean", "climate_missing", "climate_nan", "climate_range"]:
		var broken := original.duplicate(true)
		match fault:
			"surface": broken.surface_heights[0] += 1
			"ocean": broken.ocean_floor_heights[0] += 1
			"climate_missing": broken.climate.resize(5)
			"climate_nan": broken.climate[5] = NAN
			"climate_range": broken.climate[5] = 1.2
		_expect(not WorldLayoutValidator.validate(broken).is_empty(), "validator detects %s" % fault)
	var store := VoxelChunkStore.new()
	store.initialize(original.seed, original.size, original.cells, original.signature)
	var envelope: Dictionary = JSON.parse_string(store.encode())
	var payload: Dictionary = JSON.parse_string(envelope.payload)
	payload.generation_version = 4
	var encoded := JSON.stringify(payload)
	var legacy := JSON.stringify({"payload": encoded, "sha256": encoded.sha256_text()})
	var before := store.encode()
	_expect(not store.decode(legacy).ok and store.encode() == before, "generation 4 save rejected without mutation even with matching base hash")
	for failure in failures: push_error(failure)
	print("CLIMATE SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
