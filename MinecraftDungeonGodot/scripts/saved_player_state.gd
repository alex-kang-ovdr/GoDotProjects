class_name SavedPlayerState
extends RefCounted


static func finite_number(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value))


static func integer_in_range(value: Variant, minimum: int, maximum: int) -> bool:
	return finite_number(value) and float(value) == floorf(float(value)) and float(value) >= minimum and float(value) <= maximum


static func validate(state: Variant) -> String:
	if not state is Dictionary:
		return "player state is not an object"
	var position_values: Variant = state.get("position")
	var inventory_values: Variant = state.get("inventory")
	if not position_values is Array or position_values.size() != 3:
		return "player position must have three numbers"
	for coordinate: Variant in position_values:
		if not finite_number(coordinate) or absf(float(coordinate)) > 30000.0:
			return "player coordinate is invalid"
	var inventory_problem := BlockInventory.validate(inventory_values)
	if not inventory_problem.is_empty(): return inventory_problem
	if not integer_in_range(state.get("selected_slot"), 0, BlockRegistry.HOTBAR_SLOT_COUNT - 1):
		return "selected slot is invalid"
	if not finite_number(state.get("yaw")):
		return "player yaw is invalid"
	if not finite_number(state.get("pitch")) or absf(float(state.pitch)) > deg_to_rad(89.0) + 0.000001:
		return "player pitch is invalid"
	# Format-2 checkpoints from before the challenge default missing counters to zero.
	for counter in ["total_mined", "total_placed"]:
		if not integer_in_range(state.get(counter, 0), 0, 2147483647):
			return "challenge counter is invalid"
	if not state.get("crouched", false) is bool:
		return "crouch state is invalid"
	if state.has("tools"):
		var problem := MiningTools.validate(state.tools)
		if not problem.is_empty(): return problem
	if state.has("drops"):
		var problem := WorldDrops.validate(state.drops)
		if not problem.is_empty(): return problem
	return ""
