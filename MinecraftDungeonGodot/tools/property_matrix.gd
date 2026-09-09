extends SceneTree

const SEED_COUNT := 128


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var started := Time.get_ticks_msec()
	var failures: Array[String] = []
	var signatures := {}
	for seed_value in SEED_COUNT:
		var seed := seed_value - 64
		var layout := DeterministicWorldGenerator.generate(seed, 41)
		for error in WorldLayoutValidator.validate(layout):
			failures.append("seed %d: %s" % [seed, error])
		if signatures.has(layout.signature):
			failures.append("seed %d collided with seed %d" % [seed, signatures[layout.signature]])
		signatures[layout.signature] = seed
		for biome in layout.biome_counts.size():
			if layout.biome_counts[biome] <= 0:
				failures.append("seed %d lacks biome %d" % [seed, biome])
		if layout.structures.size() != DeterministicWorldGenerator.BIOME_NAMES.size():
			failures.append("seed %d does not have one landmark per biome" % seed)
		if layout.cheese_caves.is_empty() or layout.spaghetti_caves.is_empty() or layout.ravine_cells.is_empty():
			failures.append("seed %d lacks a required cave family" % seed)
		if layout.ore_cells.is_empty() or layout.spring_cells.is_empty():
			failures.append("seed %d lacks ore or spring features" % seed)
		var spawn: Vector3i = layout.spawn
		if layout.cells.has(spawn) or not layout.cells.has(spawn + Vector3i.DOWN):
			failures.append("seed %d has an unsafe spawn" % seed)
		var climate := DeterministicWorldGenerator.climate_at(layout, spawn)
		var deeper := DeterministicWorldGenerator.climate_at(layout, spawn + Vector3i.DOWN * 8)
		if climate.size() != 6 or climate != deeper:
			failures.append("seed %d independent horizontal climate fields are inconsistent" % seed)
		if not is_equal_approx(DeterministicWorldGenerator.density_depth_at(layout, spawn + Vector3i.DOWN * 8) - DeterministicWorldGenerator.density_depth_at(layout, spawn), 0.25):
			failures.append("seed %d density-relative depth query is inconsistent" % seed)
	var repeat_a := DeterministicWorldGenerator.generate(-64, 41)
	var repeat_b := DeterministicWorldGenerator.generate(63, 41)
	if repeat_a.signature != DeterministicWorldGenerator.generate(-64, 41).signature:
		failures.append("first matrix seed is not deterministic")
	if repeat_b.signature != DeterministicWorldGenerator.generate(63, 41).signature:
		failures.append("last matrix seed is not deterministic")
	if failures.is_empty():
		print("PROPERTY MATRIX PASS: %d seeds, final heights/features, all landmarks reachable, six-axis climate and supported cave path in %d ms" % [SEED_COUNT, Time.get_ticks_msec() - started])
		quit(0)
	else:
		for failure in failures.slice(0, 19):
			push_error(failure)
		print("PROPERTY MATRIX FAIL: %d invariant violations" % failures.size())
		quit(1)
