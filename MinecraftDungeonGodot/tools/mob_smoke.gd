extends SceneTree

var assertions := 0
var failures: Array[String] = []


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var main := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	for unused in 8:
		await process_frame
	var director := main.get_node_or_null("MobDirector") as MobDirector
	_expect(director != null, "main scene creates the monster director")
	if director == null:
		_finish()
		return
	_expect(director.active_count() == MobDirector.MAX_MONSTERS and director.population_complete, "13 authored cuboid variants spawn exactly ten monsters each, capped at 130")
	for variant: String in MobDirector.VARIANT_IDS:
		_expect(int(director.variant_counts.get(variant, 0)) == MobDirector.PER_VARIANT, "variant %s has exactly ten monsters" % variant)
	var start_positions: Dictionary = {}
	for monster in director.monsters:
		start_positions[monster.get_instance_id()] = monster.global_position
	for unused in 240:
		await physics_frame
	var moved := 0
	for monster in director.monsters:
		if monster.global_position.distance_to(start_positions[monster.get_instance_id()]) > 0.25: moved += 1
	_expect(moved > 0, "wandering monsters move away from their spawn positions")
	_expect(director.total_jump_events > 0, "wandering monsters use the jump behavior")
	_expect(director.active_count() <= MobDirector.MAX_MONSTERS, "monster population never exceeds the configured cap")
	_finish()


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)


func _finish() -> void:
	for failure in failures: push_error(failure)
	print("MOB SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)
