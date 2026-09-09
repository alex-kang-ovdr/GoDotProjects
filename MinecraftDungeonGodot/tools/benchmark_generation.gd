extends SceneTree


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var results := []
	for seed_value in [1337, 42, -7]:
		var started := Time.get_ticks_usec()
		var layout := DeterministicWorldGenerator.generate(seed_value, 185)
		results.append({
			"seed": seed_value,
			"size": layout.size,
			"blocks": layout.cells.size(),
			"signature": layout.signature,
			"biome_counts": Array(layout.biome_counts),
			"cheese": layout.cheese_caves.size(),
			"spaghetti": layout.spaghetti_caves.size(),
			"ravine": layout.ravine_cells.size(),
			"ore": layout.ore_cells.size(),
			"springs": layout.spring_cells.size(),
			"structures": layout.structures.size(),
			"elapsed_ms": snappedf((Time.get_ticks_usec() - started) / 1000.0, 0.001),
		})
	print("BENCHMARK: %s" % JSON.stringify(results))
	quit(0)
