extends SceneTree


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var results := []
	for count in [1, 16, 64, 128, 256, 512, 1024, 4096]:
		var cells := {}
		for index in count:
			cells[Vector3i(index % 16, int(index / 16) % 16, int(index / 256))] = BlockRegistry.STONE
		var store := VoxelChunkStore.new()
		store.initialize(0, 41, cells)
		var row := {"members": count}
		for method in ["build_masks", "build_masks_packed", "build_masks_reference"]:
			var started := Time.get_ticks_usec()
			for unused in 20:
				if method == "build_masks":
					VoxelChunkMesher.build_masks(store, Vector3i.ZERO)
				elif method == "build_masks_packed":
					VoxelChunkMesher.build_masks_packed(store, Vector3i.ZERO)
				else:
					VoxelChunkMesher.build_masks_reference(store, Vector3i.ZERO)
			row[method + "_mean_us"] = (Time.get_ticks_usec() - started) / 20.0
		results.append(row)
	print("MASK MICROBENCHMARK: %s" % JSON.stringify(results))
	quit(0)
