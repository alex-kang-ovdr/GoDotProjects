extends SceneTree

var assertions := 0
var failures: Array[String] = []


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var player := instance.get_node("Player") as VoxelPlayer
	var world := instance.get_node("VoxelWorld") as VoxelWorld
	var hud := instance.get_node("HUD") as GameHud
	var workbench := instance.get_node("DebugWorkbench") as DebugWorkbench
	player.set_physics_process(false)
	world.drops.set_physics_process(false)
	await process_frame
	_expect(workbench != null and not workbench.opened, "debug workbench is created closed")
	_expect(workbench.open() and workbench.opened and player.controls_open, "workbench opens and locks player controls")
	_expect(workbench.execute_command("set hunger 37").ok and is_equal_approx(player.survival.hunger, 37.0), "console edits hunger property")
	_expect(workbench.execute_command("night").ok and player.survival.is_night(), "console directly sets night phase")
	var warmth_before := player.survival.warmth
	_expect(workbench.execute_command("advance 20").ok and player.survival.warmth < warmth_before, "console advances survival simulation")
	_expect(workbench.execute_command("give 10 3").ok and player.inventory.total(ItemRegistry.COAL) == 3, "console gives a bounded item stack")
	_expect(not workbench.execute_command("give 999 1").ok, "console rejects unknown item IDs")
	_expect(workbench.execute_command("fill").ok and player.inventory.count(player.selected_slot) == player.inventory.max_for_slot(player.selected_slot), "console invokes selected stack fill")
	_expect(workbench.execute_command("clear").ok and player.inventory.count(player.selected_slot) == 0, "console invokes selected stack clear")
	_expect(workbench.execute_command("perf").ok and player.performance_hud_visible and hud.performance_label.visible, "console controls performance visualization")
	_expect(workbench.execute_command("axes").ok and player.voxel_debug_visible, "console controls voxel visualization")
	_expect(workbench.execute_command("nonsense").ok == false, "console rejects unknown commands")
	workbench.close()
	_expect(not workbench.opened and not player.controls_open, "workbench closes and restores controls")
	var toggle_event := InputEventKey.new()
	toggle_event.keycode = KEY_F4
	toggle_event.pressed = true
	Input.parse_input_event(toggle_event)
	await process_frame
	_expect(workbench.opened and player.controls_open, "F4 opens workbench through the player debug input path")
	workbench.close()
	for failure in failures:
		push_error(failure)
	print("SURVIVAL DEBUG SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition:
		failures.append(message)
