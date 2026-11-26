extends SceneTree

var problems := PackedStringArray()
var snapshot_dir := ""

func _initialize() -> void:
	test.call_deferred()

func check(ok: bool, description: String) -> void:
	if not ok:
		problems.append(description)
		printerr("FAIL ", description)

func test() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() == 2 and args[0] == "--snapshot-dir":
		snapshot_dir = args[1]
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var lab = scene.get_node("UI/Laboratory")
	await process_frame
	check(lab.shipyard.visible, "initial shipyard")
	lab.range_tab.pressed.emit()
	check(lab.stage.visible and not lab.running, "initial range")
	check(lab.sim.load_error.is_empty(), "valid simulation catalog")
	check(lab.stage.get_global_rect().end.y <= root.get_visible_rect().end.y + 1, "range fits viewport")
	await screenshot("range")
	lab.switches[0].button_pressed = false
	lab._step_once()
	check(not lab.sim.route_open and lab.sim.cargo == 0 and lab.sim.elapsed == 0.25, "closed route step")
	lab.switches[0].button_pressed = true
	lab.slider.value = 300
	check(lab.sim.status() == "out_of_range", "range slider")
	lab._reset()
	check(lab.slider.value == lab.sim.target_distance and lab.switches[0].button_pressed, "reset synchronizes controls")
	lab.run_button.pressed.emit()
	lab._physics_process(0.5)
	check(lab.running and lab.sim.elapsed >= 0.5, "start advances simulation")
	lab.catalog_tab.pressed.emit()
	check(lab.library.listing.item_count == 96, "unfiltered part catalog")
	var old_time: float = lab.sim.elapsed
	lab._physics_process(1.0)
	check(lab.library.visible and lab.sim.elapsed == old_time, "catalog pauses simulation")
	lab.library.finder.text_changed.emit("laser_blaster_small")
	check(lab.library.listing.item_count == 1 and lab.library.title.text == "cosmoteer.laser_blaster_small", "part search")
	check("stats.damage" in lab.library.detail.get_parsed_text(), "part field provenance")
	await screenshot("catalog")
	lab.library.kind.item_selected.emit(1)
	lab.library.finder.text_changed.emit("battery")
	check(lab.library.title.text == "battery", "resource search")
	lab.library.finder.text_changed.emit("no_such_resource")
	check(lab.library.listing.item_count == 0 and lab.library.detail.text.is_empty(), "empty search state")
	lab.library.kind.item_selected.emit(2)
	lab.library.finder.text_changed.emit("cosmoteer.rules")
	check("builtin_ships/builtins.rules" in lab.library.detail.get_parsed_text(), "missing dependency visible")
	lab.library.kind.item_selected.emit(3)
	lab.library.finder.text_changed.emit("Emitter.OnFireTriggered")
	check("AddFireDelayedEmitter" in lab.library.detail.get_parsed_text(), "binary call sites")
	lab.range_tab.pressed.emit()
	lab._physics_process(10)
	check(lab.sim.armor_hp == 0 and not lab.running, "range completion")
	lab.run_button.pressed.emit()
	check(lab.sim.armor_hp == lab.sim.armor_max_hp and lab.running, "restart")
	if problems.is_empty():
		print("PASS main scene: range controls, catalog search, navigation, restart")
	quit(0 if problems.is_empty() else 1)

func screenshot(caption: String) -> void:
	if snapshot_dir.is_empty():
		return
	await process_frame
	await RenderingServer.frame_post_draw
	check(root.get_texture().get_image().save_png(snapshot_dir.path_join(caption + ".png")) == OK,"save " + caption)
