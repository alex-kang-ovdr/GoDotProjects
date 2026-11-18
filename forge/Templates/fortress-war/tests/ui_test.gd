extends SceneTree

var failures: Array[String] = []

func check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
		push_error(message)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var game = load("res://scenes/main.tscn").instantiate()
	root.add_child(game)
	await process_frame
	game.set_process(false)
	check(game.interface_font.has_char("대".unicode_at(0)) and game.interface_font.has_char("전".unicode_at(0)), "Bundled font must cover Korean setup labels without a system font")
	check(game.battlefield.terrain_sprite.z_index == 0 and game.battlefield.terrain_sprite.show_behind_parent, "Terrain must draw after the backdrop and before tanks")
	check(game.setup_panel.visible, "Template must open battle setup")
	game.start_match({"control": "hotseat", "teamSize": 1, "seed": 123, "playerTank": "catapult", "opponentTank": "cannon"})
	check(game.engine.state.tanks.size() == 2, "Classic 1 vs 1 must create exactly two tanks")
	for i in range(240):
		if game.engine.is_human_turn(): break
		game.engine.tick(1.0 / 120)
	check(not game.setup_panel.visible and game.battle_controls.visible, "Starting must show battle controls")
	check(game.engine.is_human_turn(), "Hotseat match must reach human aim phase")
	game._refresh_ui()
	var actor = game.engine.active()
	var initial_angle: float = actor.angle
	game.angle_slider.value = initial_angle + 3
	check(absf(float(actor.angle) - initial_angle - 3) < 0.01, "Angle slider must drive the engine")
	game.power_slider.value = 40
	check(game.engine.state.power == 40, "Power slider must drive the engine")
	var down := InputEventKey.new()
	down.keycode = KEY_SPACE
	down.physical_keycode = KEY_SPACE
	down.pressed = true
	game._input(down)
	check(game.charging, "Space must start charge")
	for i in range(60): game._process(1.0 / 120)
	check(game.engine.state.power > 30 and game.engine.state.power < 45, "Charge must follow engine time and quantization")
	var up := InputEventKey.new()
	up.keycode = KEY_SPACE
	up.physical_keycode = KEY_SPACE
	up.pressed = false
	game._input(up)
	check(not game.charging, "Releasing Space must end charge")
	check(game.engine.state.phase == "projectile", "Releasing Space must fire a real projectile")
	var turn: int = game.engine.state.turnNumber
	for i in range(3600):
		game.engine.tick(1.0 / 120)
		if game.engine.state.turnNumber > turn or game.engine.state.phase == "gameover": break
	check(game.engine.state.turnNumber > turn or game.engine.state.phase == "gameover", "Shot must resolve and advance the match")
	game._toggle_pause()
	var before: float = game.engine.state.simTime
	game._process(0.2)
	check(game.engine.state.paused and game.engine.state.simTime == before, "Pause must freeze simulation")
	game._toggle_pause()
	game._begin_charge()
	game.show_setup()
	check(not game.charging and game.engine.state.paused, "Leaving battle must cancel charge and pause")
	game._release_charge()
	check(game.engine.state.paused, "A release after leaving battle must not fire")
	game.start_match({"control": "hotseat", "profile": "blue3", "seed": 456})
	check(game.engine.state.tanks.size() == 8, "BLUE3 setup must create 4 vs 4")
	game.engine.state.winner = 0
	game.engine.state.phase = "gameover"
	game._process(1.0 / 120)
	check(game.result_panel.visible and game.recorded_result, "Finished match must show results and save once")
	var count: int = game.history.size()
	game._process(1.0 / 120)
	check(game.history.size() == count, "Result must not be recorded every frame")
	game.start_match({"control": "hotseat", "teamSize": 1, "seed": 123})
	check(not game.result_panel.visible and not game.recorded_result and game.last_power.is_empty(), "Restart must reset result and power history")
	game.battlefield.refresh(0)
	check(game.battlefield.terrain_texture != null, "Destructible terrain must have a render texture")
	# Exercise the native UI receiver without a browser so room switching is reproducible.
	var fixture = game.engine
	var commands: Array = []
	game.engine = load("res://scripts/fort_remote.gd").new(func(command): commands.append(command))
	game.multiplayer_mode = true
	game.battle_controls.hide()
	game._accept_fire()
	game._process(0.1)
	check(commands.is_empty(), "Waiting network client must reject fire without an authoritative board")
	var room := {"roomId": "room-a", "phase": "playing", "players": [{"id": "alice", "team": 0, "spectator": false}], "config": fixture.config, "game": fixture.state.duplicate(true), "terrain": {"width": 1800, "height": 820, "version": 7, "runs": [[0, 1]]}}
	game._receive_network_message([JSON.stringify({"type": "state", "playerId": "alice", "state": room})])
	check(game.network_has_board and game.battle_controls.visible, "Usable network snapshot must reveal battle controls")
	game.recorded_result = true
	game.result_panel.show()
	room.roomId = "room-b"
	room.terrain.runs = [[1, 1]]
	game._receive_network_message([JSON.stringify({"type": "state", "playerId": "alice", "state": room})])
	check(not game.recorded_result and not game.result_panel.visible, "Switching rooms must clear the previous result")
	var image: Image = game.battlefield.terrain_texture.get_image()
	check(image.get_pixel(0, 0).r == 0 and image.get_pixel(1, 0).r > 0, "Equal terrain versions in different rooms must still refresh the renderer")
	game._receive_network_message([JSON.stringify({"type": "disconnect"})])
	check(not game.engine.connected and not game.engine.is_human_turn(), "Disconnect must revoke UI input")
	game.multiplayer_mode = false # Native test never installed a JavaScript callback.
	game.queue_free()
	await process_frame
	if failures.is_empty():
		print("FORTRESS_WAR_UI_OK: setup, aim, charge/release, turn resolution, pause, result and restart")
	quit(0 if failures.is_empty() else 1)
