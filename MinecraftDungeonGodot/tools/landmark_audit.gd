extends SceneTree


func _init() -> void:
	for seed_value in [1337, -7, 42, -2147483648, 2147483647, -48, -47, -37, -34, -25, -5, -3, 17, 60]:
		var layout := DeterministicWorldGenerator.generate(seed_value, 41)
		var targets: Array = []
		for structure: Dictionary in layout.structures: targets.append(structure.door)
		var survey := VoxelTraversal.survey(layout.cells, layout.size, layout.spawn, targets)
		print("LANDMARK AUDIT seed=%d reached=%d/%d visited=%d cells=%d hash=%d errors=%s repairs=%d expanded=%d" % [seed_value, survey.reachable, targets.size(), survey.visited, layout.cells.size(), layout.signature, WorldLayoutValidator.validate(layout), layout.landmark_routes.repaired.size(), layout.landmark_routes.expanded])
		print(layout.landmark_routes.errors)
	quit()
