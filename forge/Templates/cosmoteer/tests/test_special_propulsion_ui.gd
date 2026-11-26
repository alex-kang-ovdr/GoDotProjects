extends "res://tests/test_shipyard_ui.gd"

const EXTENDER := "cosmoteer.thruster_rocket_extender"

func test() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() == 2 and args[0] == "--snapshot-dir":
		screenshot_dir = args[1]
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var lab = scene.get_node("UI/Laboratory")
	await process_frame
	var yard = lab.shipyard
	var preset: Button
	for child in yard.editor.find_children("*","Button",true,false):
		if child.text == "특수 추진 실험선":
			preset = child
	verify(preset != null,"player can find special preset")
	if preset == null:
		quit(1)
		return
	click_button(preset)
	await process_frame
	verify(not yard.depart_button.disabled,"special preset is spaceworthy: "+yard.readiness.text)
	var original: String = yard.rocket_preview.text
	verify("3 / 3" in original and "20000" in original and "600/초" in original and "8000" in original,"two powered stages and battery: "+original)
	click_cell(yard.grid,Vector2i(6,8),MOUSE_BUTTON_RIGHT)
	verify("4000" in yard.rocket_preview.text and "20000" in yard.rocket_preview.text,"removing battery changes storage only")
	click_button(yard.undo_button)
	click_cell(yard.grid,Vector2i(6,5),MOUSE_BUTTON_RIGHT)
	verify("1 / 2" in yard.rocket_preview.text and "10000" in yard.rocket_preview.text and "300/초" in yard.rocket_preview.text,"removing extender disconnects battery and reduces rated burn")
	click_button(yard.undo_button)
	choose(yard,EXTENDER)
	yard._rotate()
	click_cell(yard.grid,Vector2i(8,5))
	verify("4 / 4" in yard.rocket_preview.text and "30000" in yard.rocket_preview.text and "900/초" in yard.rocket_preview.text,"player-built third stage changes maximum thrust and burn")
	click_button(yard.undo_button)
	verify(yard.rocket_preview.text==original,"undo rebuilds original network")
	await screenshot("special_shipyard")
	click_button(yard.depart_button)
	await process_frame
	var duel = yard.duel
	verify(duel.is_visible_in_tree() and duel.battle.result=="active","launch special preset through actual button")
	if not duel.is_visible_in_tree():
		quit(1)
		return
	duel.set_physics_process(false)
	var ship: Dictionary = duel.battle.player
	var initial: Dictionary = duel.battle.propulsion_state(ship)
	verify(initial.boost_ready == 1 and not duel.boost_button.disabled,"real reactor reserve charges booster at launch")
	click_button(duel.pause_button)
	send_key(KEY_B,true)
	send_key(KEY_B,false)
	verify(duel.battle.propulsion_state(ship).boost_active==0,"pause blocks boost input")
	click_button(duel.pause_button)
	send_key(KEY_B,true)
	send_key(KEY_B,false)
	verify(duel.battle.propulsion_state(ship).boost_active == 1 and "끄기" in duel.boost_button.text,"B engages boost through native input")
	send_key(KEY_W,true)
	for i in 480:
		duel._physics_process(1.0/60.0)
		if i >= 120 and i % 6 == 0 and duel.battle.propulsion_state(ship).rocket_current_force > 1000:
			break
	send_key(KEY_W,false)
	duel._refresh()
	var firing: Dictionary = duel.battle.propulsion_state(ship)
	verify(firing.boost_energy < initial.boost_energy and ship.velocity.length()>1.0,"powered forward flight drains boost tank")
	verify(firing.rocket_staffed==2 and "2/2명" in duel.propulsion_readout.text,"two crew reached live rocket stations")
	verify(firing.rocket_current_force > 0 and firing.rocket_current_rate > 0,"live HUD samples actual powered rocket burn")
	verify(duel.get_global_rect().end.y <= root.get_visible_rect().end.y+1,"special flight HUD fits viewport")
	await screenshot("special_propulsion")
	click_button(duel.boost_button)
	var stopped: Dictionary = duel.battle.propulsion_state(ship)
	verify(stopped.boost_active==0 and stopped.boost_energy==0 and duel.boost_button.disabled,"button disengages, discharges reserve and shows refill state")
	send_key(KEY_B,true)
	send_key(KEY_B,false)
	verify(duel.battle.propulsion_state(ship).boost_active==0,"empty booster cannot be restarted")
	print("Installed rocket: ",original)
	print("Boost reserves ",initial.boost_energy," -> ",firing.boost_energy," -> ",stopped.boost_energy,"; flight speed ",ship.velocity.length())
	print("Special propulsion UI checks: %d; failures: %d" % [checks,failures])
	quit(int(failures>0))

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

func send_key(code: Key,down: bool) -> void:
	var key := InputEventKey.new()
	key.keycode = code
	key.physical_keycode = code
	key.pressed = down
	Input.parse_input_event(key)
	Input.flush_buffered_events()
