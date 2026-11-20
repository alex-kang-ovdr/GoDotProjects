extends Node

## Reports dir: --reports-dir=<path> (user args) > CONVERTER_ROOT env > res://../../reports
static func _reports_dir() -> String:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--reports-dir="):
			var dir := arg.trim_prefix("--reports-dir=")
			if dir != "":
				return dir
	var root := OS.get_environment("CONVERTER_ROOT")
	if root != "":
		return root.path_join("reports")
	return ProjectSettings.globalize_path("res://").path_join("../../reports").simplify_path()

var SCREENSHOT_DIR: String = _reports_dir().path_join("screenshots/space-shooter")
var REPORT_PATH: String = _reports_dir().path_join("space-shooter-verification.json")

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
	var game: SpaceGameController = (load("res://scenes/space_shooter.tscn") as PackedScene).instantiate()
	game.auto_waves = false
	add_child(game)
	await get_tree().process_frame
	await get_tree().process_frame

	_assert("fbx_asteroids_loaded_3", game.asteroid_scenes.size() == 3, "count=%d" % game.asteroid_scenes.size())
	_assert("fbx_player_ship_loaded", game.player != null and game.player.ship_visual != null, "loaded=%s" % (game.player.ship_visual != null))
	_assert("tiff_to_png_nebula_applied", game.bg_mat != null and game.bg_mat.albedo_texture != null, "tex=%s" % (game.bg_mat.albedo_texture != null))

	# Spawn a rich asteroid wave + fire a bolt for crisp gameplay screenshot
	var target_ast := game.spawn_asteroid(Vector3(0.0, 0.0, -3.5), 0, 2.2)
	game.spawn_asteroid(Vector3(-3.6, 0.0, -6.2), 1, 2.0)
	game.spawn_asteroid(Vector3(3.4, 0.0, -5.0), 2, 2.4)
	game.spawn_asteroid(Vector3(-2.1, 0.0, -1.2), 0, 1.8)
	game.spawn_asteroid(Vector3(2.8, 0.0, 0.5), 1, 1.6)

	# Tilt player slightly while firing
	game.player.synthetic_input = Vector2(0.4, 0.0)
	await get_tree().create_timer(0.12).timeout
	_assert("player_tilts_on_horizontal_move", abs(game.player.rotation_degrees.z) > 1.0, "rot_z=%.1f" % game.player.rotation_degrees.z)
	game.player.synthetic_input = Vector2.ZERO
	game.player.position.x = 0.0
	game.player.rotation_degrees = Vector3.ZERO
	game.player.fire_bolt()
	await get_tree().create_timer(0.08).timeout
	_assert("laser_bolt_spawned", game.bolts_spawned >= 1, "bolts=%d" % game.bolts_spawned)
	await _save_shot("01_gameplay_wave.png")

	# Wait for bolt to hit target_ast -> verify explosion + score +10
	await get_tree().create_timer(0.45).timeout
	_assert("asteroid_destroyed_and_scored", game.asteroids_destroyed >= 1 and game.score >= 10, "destroyed=%d score=%d" % [game.asteroids_destroyed, game.score])
	await _save_shot("02_laser_hit_explosion.png")

	# Verify player-asteroid collision triggers Game Over & Restart prompt
	game.spawn_asteroid(game.player.position, 2, 0.0)
	await get_tree().physics_frame
	await get_tree().physics_frame
	await get_tree().create_timer(0.08).timeout
	_assert("player_collision_gameover", game.is_game_over and game.game_over_label.text == "Game Over" and game.restart_label.text == "Press 'R' for restart", "go=%s" % game.game_over_label.text)
	await _save_shot("03_gameover.png")

	var passed := checks.filter(func(c): return c.passed).size()
	var elapsed := Time.get_ticks_msec() - t0
	var f := FileAccess.open(REPORT_PATH, FileAccess.WRITE)
	f.store_string(JSON.stringify({
		"game": "Space Shooter",
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
