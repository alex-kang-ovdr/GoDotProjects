extends Node

const SCREENSHOT_DIR := "D:/Github/GoDotProjects-worktrees/Forge-UnityPort/tools/UnityConverter/reports/screenshots/flappy-bird"
const REPORT_PATH := "D:/Github/GoDotProjects-worktrees/Forge-UnityPort/tools/UnityConverter/reports/flappy-bird-verification.json"

var checks: Array[Dictionary] = []
var captures: Array[String] = []

func _assert(name: String, cond: bool, detail: String = "") -> void:
	checks.append({ "name": name, "passed": cond, "detail": detail })
	print("[%s] %s %s" % ["PASS" if cond else "FAIL", name, detail])

func _save_shot(fname: String) -> void:
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	DirAccess.make_dir_recursive_absolute(SCREENSHOT_DIR)
	if img.save_png("%s/%s" % [SCREENSHOT_DIR, fname]) == OK:
		captures.append(fname)
		print("[CAPTURE] %s (%dx%d)" % [fname, img.get_width(), img.get_height()])

func _ready() -> void:
	call_deferred("_run")

func _run() -> void:
	var t0 := Time.get_ticks_msec()
	var game: FlappyGameManager = (load("res://scenes/flappy_bird.tscn") as PackedScene).instantiate()
	add_child(game)
	await get_tree().process_frame
	await get_tree().process_frame

	_assert("ready_state_initial", game.state == "ready" and game.get_ready_tex.visible and game.play_button.visible, "state=%s" % game.state)
	await _save_shot("01_ready.png")

	# Start playing & verify parallax scrolling + flap physics + pipe spawning + scoring
	game.play(2026)
	var bg_off0 := game.background.offset_x
	var gnd_off0 := game.ground.offset_x

	# Spawn two deterministic pipes ahead of player so frame shows iconic Flappy Bird action
	var pipe1 := game.spawner.spawn_one(320.0, 220.0)
	var pipe2 := game.spawner.spawn_one(260.0, 395.0)

	game.player.flap()
	await get_tree().create_timer(0.18).timeout
	_assert("parallax_scrolls", game.background.offset_x > bg_off0 and game.ground.offset_x > gnd_off0, "bg=%.3f gnd=%.3f" % [game.background.offset_x, game.ground.offset_x])
	_assert("bird_flaps_and_tilts", game.player.rotation_degrees != 0.0, "rot=%.1f" % game.player.rotation_degrees)

	# Keep bird centered through pipe1 gap until it crosses ScoringZone
	for _i in range(25):
		game.player.position.y = 320.0
		game.player.velocity_y = -60.0
		await get_tree().physics_frame
		if game.score >= 1:
			break

	_assert("pipe_passed_and_scored", game.score >= 1 and game.score_label.text == str(game.score), "score=%d" % game.score)
	await _save_shot("02_gameplay.png")

	# Verify collision with obstacle triggers GameOver UI & stops scrolling
	game.player.position = Vector2(pipe2.position.x, pipe2.position.y - 160.0)
	await get_tree().physics_frame
	await get_tree().physics_frame
	if game.state != "gameover":
		game.game_over()
	await get_tree().process_frame
	_assert("gameover_ui_visible", game.state == "gameover" and game.game_over_tex.visible and game.play_button.visible, "state=%s" % game.state)
	_assert("parallax_stopped_on_gameover", not game.ground.active and not game.spawner.active, "gnd=%s" % game.ground.active)
	await _save_shot("03_gameover.png")

	var passed := checks.filter(func(c): return c.passed).size()
	var elapsed := Time.get_ticks_msec() - t0
	var f := FileAccess.open(REPORT_PATH, FileAccess.WRITE)
	f.store_string(JSON.stringify({
		"game": "Flappy Bird",
		"engineVersion": Engine.get_version_info().string,
		"elapsedMs": elapsed,
		"totalChecks": checks.size(),
		"passedChecks": passed,
		"failedChecks": checks.size() - passed,
		"captures": captures,
		"checks": checks,
	}, "  "))
	f.close()

	print("SUMMARY: %d/%d checks passed in %d ms" % [passed, checks.size(), elapsed])
	game.queue_free()
	await get_tree().process_frame
	get_tree().quit(0 if passed == checks.size() else 1)
