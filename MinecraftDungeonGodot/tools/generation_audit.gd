extends SceneTree


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var violations := 0
	for fixture in [[1337, 41], [42, 41], [-7, 41], [0, 41], [-64, 41], [63, 41], [-2147483648, 41], [2147483647, 41], [1337, 185]]:
		var layout := DeterministicWorldGenerator.generate(fixture[0], fixture[1])
		var errors := WorldLayoutValidator.validate(layout)
		if layout.structures.size() != 6 or layout.spring_cells.is_empty():
			errors.append("missing landmark or spring")
		violations += errors.size()
		print("GENERATION AUDIT seed=%d size=%d: %s" % [fixture[0], fixture[1], errors])
	# Mutation checks prove the validator catches actual final-data faults.
	var original := DeterministicWorldGenerator.generate(1337, 41)
	for fault in ["height", "cave", "door", "spring", "overlap"]:
		var broken := original.duplicate(true)
		match fault:
			"height": broken.heights[0] += 1
			"cave": broken.cells[broken.cave_destination] = BlockRegistry.STONE
			"door": broken.cells[broken.structures[0].door] = BlockRegistry.WATER
			"spring": broken.cells.erase(broken.spring_cells.keys()[0])
			"overlap": broken.structures.append(broken.structures[0].duplicate())
		if WorldLayoutValidator.validate(broken).is_empty():
			violations += 1
			push_error("validator missed injected %s fault" % fault)
	print("GENERATION AUDIT mutation checks: 5")
	print("GENERATION AUDIT: %d violations" % violations)
	quit(0 if violations == 0 else 1)
