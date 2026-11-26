extends "res://tests/test_shipyard_ui.gd"

func test() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() == 2 and args[0] == "--snapshot-dir":
		screenshot_dir = args[1]
	if not screenshot_dir.is_empty():
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(screenshot_dir))
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var lab = scene.get_node("UI/Laboratory")
	await process_frame
	var yard = lab.shipyard
	var preset: Button
	for child in yard.editor.find_children("*","Button",true,false):
		if child.text == "특수 추진 실험선":
			preset = child
	verify(preset != null,"special preset is available")
	if preset == null:
		quit(1)
		return
	click_button(preset)
	verify(not yard.depart_button.disabled,"special preset remains launchable with engine room")
	click_button(yard.depart_button)
	await process_frame
	var duel = yard.duel
	if not duel.is_visible_in_tree() or duel.battle.result != "active":
		verify(false,"special preset launches into combat")
		quit(1)
		return
	duel.set_physics_process(false)
	var state: Dictionary = duel.battle.overclock_state()
	verify(state.installed > 0 and duel.overclock_button.visible,"engine room enables overclock controls")
	verify(duel.thermal_gauge.visible and duel.thermal_readout.visible,"installed engine has live heat telemetry")
	verify("열" in duel.thermal_readout.text and "전력" in duel.thermal_readout.text and "추력" in duel.thermal_readout.text,"engine readout shows force, power and heat")
	duel.pause_button.pressed.emit()
	key(KEY_O,true)
	key(KEY_O,false)
	verify(not duel.battle.overclock_state().active,"pause blocks overclock input")
	duel.pause_button.pressed.emit()
	key(KEY_O,true)
	key(KEY_O,false)
	state = duel.battle.overclock_state()
	verify(state.active,"O engages overclock during combat")
	verify("끄기" in duel.overclock_button.text,"button reflects engaged state")
	key(KEY_B,true)
	key(KEY_B,false)
	for i in 330:
		duel._physics_process(1.0/60.0)
	key(KEY_W,true)
	for i in 480:
		duel._physics_process(1.0/60.0)
		var live_propulsion: Dictionary = duel.battle.propulsion_state(duel.battle.player)
		if i >= 120 and live_propulsion.rocket_staffed == live_propulsion.rocket_required and live_propulsion.rocket_current_force > 1000:
			break
	key(KEY_W,false)
	duel._refresh()
	var engine_list: Array = duel.battle.overclock_state().engines
	var selected_rocket := false
	var found_boosted := false
	for i in engine_list.size():
		var engine: Dictionary = engine_list[i]
		if str(engine.get("id","")).contains("rocket_nozzle"):
			duel.engine_selector.select(i)
			duel.engine_selector.item_selected.emit(i)
			selected_rocket = true
			verify(float(engine.get("force",0.0)) > 0 and float(engine.get("power",0.0)) > 0,"rocket engine reports live force and power")
		if bool(engine.get("boosted",false)):
			found_boosted = true
			verify(float(engine.get("force",0.0)) > 0 and float(engine.get("power",0.0)) > 0,"boosted engine reports live force and power")
	verify(found_boosted,"boosted thruster appears in per-engine telemetry")
	verify(selected_rocket and "추력" in duel.thermal_readout.text,"installed rocket can be selected in thermal telemetry")
	var propulsion: Dictionary = duel.battle.propulsion_state(duel.battle.player)
	verify(propulsion.rocket_current_force > 0 and propulsion.rocket_current_rate > 0,"modular rocket HUD shows live thrust and energy rate")
	verify(duel.get_global_rect().end.y <= root.get_visible_rect().end.y+1,"overclock HUD fits viewport")
	await _capture("overclock_ui")
	click_button(duel.overclock_button)
	verify(not duel.battle.overclock_state().active,"button disengages overclock")
	duel.view_button.pressed.emit()
	verify(duel.cutaway.is_visible_in_tree() and duel.overclock_button.visible,"overclock controls remain available in cutaway")
	await _capture("overclock_cutaway")
	print("Overclock UI checks: %d; failures: %d" % [checks,failures])
	quit(int(failures>0))

func key(code: Key,down: bool) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = down
	Input.parse_input_event(event)
	Input.flush_buffered_events()

func click_button(button: Button) -> void:
	var pos := button.get_global_rect().get_center()
	var motion := InputEventMouseMotion.new()
	motion.position = pos
	root.push_input(motion,true)
	for down in [true,false]:
		var click := InputEventMouseButton.new()
		click.position = pos
		click.button_index = MOUSE_BUTTON_LEFT
		click.pressed = down
		root.push_input(click,true)

func _capture(caption: String) -> void:
	if screenshot_dir.is_empty():
		return
	await process_frame
	RenderingServer.force_draw(false,0.0)
	verify(root.get_texture().get_image().save_png(ProjectSettings.globalize_path(screenshot_dir.path_join(caption+".png")))==OK,"overclock UI screenshot saved: "+caption)
