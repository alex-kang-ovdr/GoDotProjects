extends SceneTree

var errors := 0
var checks := 0
var snapshot_path := ""

func _initialize() -> void:
	test.call_deferred()

func verify(condition: bool, caption: String) -> void:
	checks += 1
	if not condition:
		errors += 1
		printerr("FAIL ",caption)

func key(code: Key,down: bool) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = down
	Input.parse_input_event(event)
	Input.flush_buffered_events()

func run_ticks(duel, ticks: int) -> void:
	for tick in ticks:
		duel._physics_process(1.0/60.0)

func test() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() == 2 and args[0] == "--snapshot-dir":
		snapshot_path = args[1].path_join("flight.png")
	var lab = load("res://main.tscn").instantiate()
	root.add_child(lab)
	await process_frame
	var yard = lab.shipyard
	yard.depart_button.pressed.emit()
	var duel = yard.duel
	await process_frame
	verify(duel.flight_page.is_visible_in_tree() and duel.battle.result=="active","default launch opens spatial combat")
	verify(duel.battle.player.engines.size()==4,"starter has four live installed maneuvering modules")
	for entry in [[KEY_W,"flight_forward",Vector2.RIGHT],[KEY_S,"flight_reverse",Vector2.LEFT],
			[KEY_A,"flight_port",Vector2.UP],[KEY_D,"flight_starboard",Vector2.DOWN],
			[KEY_Q,"flight_turn_left",-1],[KEY_E,"flight_turn_right",1]]:
		duel.launch(yard.design)
		key(entry[0],true)
		verify(Input.is_action_pressed(entry[1]),"physical action mapped: "+entry[1])
		run_ticks(duel,30)
		var ship: Dictionary = duel.battle.player
		if entry[2] is Vector2:
			verify(Vector2(ship.velocity).dot(entry[2]) > 0.5,"correct translation: "+entry[1])
		else:
			verify(ship.angular_velocity*entry[2] > 0.05,"correct yaw: "+entry[1])
		key(entry[0],false)
	duel.launch(yard.design)
	await process_frame
	var enemy: Dictionary = duel.battle.enemy
	var target_uid: int = enemy.ids["cosmoteer.control_room_small"][0]
	var view = duel.flight_view
	var point: Vector2 = view.get_global_transform()*view.part_screen_position(enemy,target_uid)
	for down in [true,false]:
		var click := InputEventMouseButton.new()
		click.button_index = MOUSE_BUTTON_LEFT
		click.position = point
		click.pressed = down
		root.push_input(click,true)
	verify(duel.battle.target_uid==target_uid,"screen picking selects enemy bridge in world space")
	var origin: Vector2 = duel.battle.player.position
	var initial_distance := origin.distance_to(enemy.position)
	key(KEY_W,true)
	run_ticks(duel,100)
	key(KEY_W,false)
	var delta_x: float = duel.battle.player.position.x-origin.x
	var current: float = duel.battle.player.position.distance_to(enemy.position)
	verify(delta_x > 2 and current < initial_distance-2,"native input closes range")
	duel.pause_button.pressed.emit()
	var stopped: Vector2 = duel.battle.player.position
	run_ticks(duel,30)
	verify(stopped==duel.battle.player.position,"pause freezes navigation")
	duel.pause_button.pressed.emit()
	var side_button: Button = find_button(duel,"D  우현")
	side_button.button_down.emit()
	run_ticks(duel,45)
	side_button.button_up.emit()
	verify(duel.battle.player.velocity.y>0.5,"held on-screen thruster button")
	var before: float = duel.battle.player.heading
	key(KEY_E,true)
	run_ticks(duel,20)
	key(KEY_E,false)
	verify(absf(angle_difference(before,duel.battle.player.heading))>0.015,"native yaw changes bearing")
	duel.view_button.pressed.emit()
	verify(duel.cutaway.is_visible_in_tree(),"crew cutaway accessible during flight")
	duel.view_button.pressed.emit()
	run_ticks(duel,90)
	key(KEY_A,true)
	run_ticks(duel,10)
	duel._refresh()
	if not snapshot_path.is_empty():
		await process_frame
		await RenderingServer.frame_post_draw
		verify(root.get_texture().get_image().save_png(snapshot_path)==OK,"flight render saved")
	key(KEY_A,false)
	verify(duel.flight_page.get_global_rect().end.y<root.get_visible_rect().end.y,"flight view fits viewport")
	print("Manual flight: start %.1f m, after 100 forward ticks %.1f m, player +X %.2f m." % [initial_distance,current,delta_x])
	print("Flight UI checks: %d; failures: %d" % [checks,errors])
	quit(int(errors>0))

func find_button(node: Node,caption: String) -> Button:
	if node is Button and node.text==caption:
		return node
	for child in node.get_children():
		var found := find_button(child,caption)
		if found != null:
			return found
	return null
