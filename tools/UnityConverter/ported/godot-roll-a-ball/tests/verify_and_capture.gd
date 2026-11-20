extends Node

const SCREENSHOT_DIR := "D:/Github/GoDotProjects-worktrees/Forge-UnityPort/tools/UnityConverter/reports/screenshots/roll-a-ball"
const REPORT_PATH := "D:/Github/GoDotProjects-worktrees/Forge-UnityPort/tools/UnityConverter/reports/roll-a-ball-verification.json"

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
	var scene: Node3D = (load("res://scenes/mini_game.tscn") as PackedScene).instantiate()
	add_child(scene)
	await get_tree().process_frame
	await get_tree().process_frame

	var player: RollPlayerController = scene.get_node("Player")
	var cam: CameraController3D = scene.get_node("MainCamera")
	var pickups: Array = scene.pickup_areas

	_assert("pickups_parsed_12", pickups.size() == 12, "count=%d" % pickups.size())
	_assert("walls_parsed_4", scene.get_node("Walls").get_child_count() == 4, "walls=%d" % scene.get_node("Walls").get_child_count())
	_assert("initial_count_zero", player.count == 0 and scene.count_label.text == "Count: 0", scene.count_label.text)

	# Let pickups rotate visibly
	await get_tree().create_timer(0.2).timeout
	var rot_before: Vector3 = pickups[0].rotation
	await get_tree().create_timer(0.15).timeout
	_assert("pickups_rotating", pickups[0].rotation != rot_before, "rot=%s" % pickups[0].rotation)
	await _save_shot("01_start.png")

	# Apply physics force towards +X (Right) and verify RigidBody3D rolls + Camera follows
	var start_x := player.global_position.x
	var cam_start_x := cam.global_position.x
	player.synthetic_input = Vector2(1.0, 0.0)
	await get_tree().create_timer(0.55).timeout
	player.synthetic_input = Vector2.ZERO
	_assert("rigidbody_rolls_with_force", player.global_position.x > start_x + 0.5, "dx=%.2f" % (player.global_position.x - start_x))
	_assert("camera_follows_player", abs((cam.global_position.x - cam_start_x) - (player.global_position.x - start_x)) < 0.25, "cam_dx=%.2f" % (cam.global_position.x - cam_start_x))

	# Collect first 6 pickups and capture mid-game
	for i in range(6):
		player.global_position = pickups[i].global_position
		player.linear_velocity = Vector3.ZERO
		await get_tree().physics_frame
		await get_tree().physics_frame
	_assert("mid_game_count_6", player.count == 6 and scene.count_label.text == "Count: 6", "count=%d" % player.count)
	await _save_shot("02_mid_play.png")

	# Collect remaining 6 pickups and verify YOU WIN!
	for i in range(6, 12):
		player.global_position = pickups[i].global_position
		player.linear_velocity = Vector3.ZERO
		await get_tree().physics_frame
		await get_tree().physics_frame
	_assert("all_12_collected_win", player.count == 12 and scene.win_label.text == "YOU WIN!", "text=%s" % scene.win_label.text)
	await _save_shot("03_you_win.png")

	var passed := checks.filter(func(c): return c.passed).size()
	var elapsed := Time.get_ticks_msec() - t0
	var f := FileAccess.open(REPORT_PATH, FileAccess.WRITE)
	f.store_string(JSON.stringify({
		"game": "Roll-a-Ball",
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
	scene.queue_free()
	await get_tree().process_frame
	get_tree().quit(0 if passed == checks.size() else 1)
