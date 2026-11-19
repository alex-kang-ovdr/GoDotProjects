extends SceneTree

const STEP := 1.0 / 60
const WING_FRAMES := ["chicken.svg", "chicken-wing-up.svg", "chicken-wing-down.svg"]
var game: Node2D
var failed := false


func _initialize() -> void:
	call_deferred("run")


func check(ok: bool, message: String) -> void:
	if not ok:
		printerr("Tappy Chicken regression: ", message)
		failed = true


func press_key(key: Key) -> void:
	var input := InputEventKey.new()
	input.keycode = key
	input.pressed = true
	root.push_input(input, true)


func tap(point: Vector2) -> void:
	var input := InputEventScreenTouch.new()
	input.position = point
	input.pressed = true
	root.push_input(input, true)


func run() -> void:
	var packed: PackedScene = load(ProjectSettings.get_setting("application/run/main_scene"))
	game = packed.instantiate()
	root.add_child(game)
	game.set_physics_process(false)
	game._render_state(game.game.reset({"seed": 12345}), 0.0)
	check(game.get_node("Hud/Logo").visible, "missing title sign")
	tap(Vector2(240, 320))
	check(game.game.snapshot().state == "menu", "tap outside Play started a game")
	tap(game.get_node("Hud/Play").position)
	check(game.game.snapshot().state == "ready" and game.get_node("Hud/Ready").visible, "Play did not open ready screen")
	press_key(KEY_SPACE)
	check(game.game.snapshot().state == "playing", "first flap did not start flight")
	check(game._wing_audio.stream.resource_path.begins_with("res://Assets/Audio/SFX_FlapWing_"), "missing original flap sound")

	var frames := {}
	var score := 0
	for tick in 600:
		var state: Dictionary = game.game.snapshot()
		if state.state != "playing" or score >= 3:
			break
		var target_y := 300.0
		for gate in state.pipes:
			if gate.x + state.settings.pipeWidth > state.bird.x - 15:
				target_y = (gate.top + gate.bottom) / 2
				break
		if state.bird.y > target_y + 37 and state.bird.vy >= 0:
			press_key(KEY_SPACE)
		game._physics_process(STEP)
		frames[game.get_node("Bird").texture.resource_path.get_file()] = true
		var new_score: int = game.game.snapshot().score
		if new_score != score:
			check(new_score == score + 1 and game.get_node("Hud/Score").text == str(new_score), "gate must award one displayed point")
			check(game._result_audio.stream.resource_path.ends_with("/SFX_Score_01.tres"), "missing original score sound")
			score = new_score
	check(score == 3 and frames.has_all(WING_FRAMES), "expected three gate crossings and three original wing frames")

	# With no further flap the real rules hit the ground and show the result board.
	for tick in 300:
		if game.game.snapshot().state == "over":
			break
		game._physics_process(STEP)
	check(game.game.snapshot().state == "over" and game.get_node("Hud/Board").visible, "missing game over board")
	check(game.get_node("Bird").texture.resource_path.ends_with("/chicken-hit.svg"), "missing collision pose")
	check(game._result_audio.stream.resource_path.ends_with("/SFX_HitGround_01.tres"), "missing ground sound")
	check(game.get_node("Hud/RoundScore").text == "3" and game.get_node("Hud/Best").text == "3", "incorrect result board totals")
	tap(game.get_node("Hud/Play").position)
	var retry: Dictionary = game.game.snapshot()
	check(retry.state == "ready" and retry.score == 0 and retry.best == 3, "retry did not clear the round and retain the best")
	game.queue_free()
	await process_frame
	game = packed.instantiate()
	root.add_child(game)
	check(game.game.snapshot().best == 3, "a new game did not reload the saved best")
	game.queue_free()
	await process_frame
	await create_timer(0.4).timeout
	if not failed:
		print("TAPPY_GAME_OK 3 gates, 3 wing frames, score and ground sounds, saved best, retry")
	quit(1 if failed else 0)
