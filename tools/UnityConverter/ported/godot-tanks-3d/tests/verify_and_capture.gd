extends Node

const SCREENSHOT_DIR := "D:/Github/GoDotProjects-worktrees/Forge-UnityPort/tools/UnityConverter/reports/screenshots/tanks-3d"
const REPORT_PATH := "D:/Github/GoDotProjects-worktrees/Forge-UnityPort/tools/UnityConverter/reports/tanks-3d-verification.json"

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
	var game: TanksGameManager = (load("res://scenes/tanks_arena.tscn") as PackedScene).instantiate()
	game.auto_loop = false
	add_child(game)
	await get_tree().process_frame
	await get_tree().process_frame

	_assert("binary_levelart_103_meshes_loaded", game.level_loader.loaded_mesh_count == 103, "meshes=%d" % game.level_loader.loaded_mesh_count)
	_assert("binary_levelart_colliders_loaded", game.level_loader.loaded_collider_count >= 10, "cols=%d" % game.level_loader.loaded_collider_count)
	_assert("two_tanks_spawned", game.tanks.size() == 2, "tanks=%d" % game.tanks.size())
	_assert("aiff_engine_clips_loaded", game.tanks[0].clip_idle != null and game.tanks[0].clip_driving != null, "idle/drive OK")

	# 1. Start Round 1
	game.start_round()
	await get_tree().create_timer(0.15).timeout
	_assert("round1_banner_visible", game.round_number == 1 and "ROUND 1" in game.message_label.text, game.message_label.text)
	await _save_shot("01_round1_start.png")

	# 2. Begin Playing — Drive P1 & P2, charge Aim Arrow, fire ballistic shell
	game.begin_playing()
	var p1: TanksUnit = game.tanks[0]
	var p2: TanksUnit = game.tanks[1]
	var p1_start := p1.global_position
	p1.synthetic_move = 1.0
	p2.synthetic_move = 0.6
	await get_tree().create_timer(0.35).timeout
	p1.synthetic_move = 0.0
	p2.synthetic_move = 0.0
	_assert("tank_moves_with_physics", p1.global_position.distance_to(p1_start) > 1.2, "dist=%.2f" % p1.global_position.distance_to(p1_start))

	# Aim P1 toward P2, show charging Aim Arrow + fire mid-air shell
	p1.look_at(Vector3(p2.global_position.x, p1.global_position.y, p2.global_position.z), Vector3.UP)
	p1.set_charge_visual(0.75)
	var shell := p1.fire_shell(24.0)
	_assert("ballistic_shell_spawned", shell != null, "vel=%s" % (shell.linear_velocity if shell else Vector3.ZERO))
	p1.set_charge_visual(0.65)
	await get_tree().create_timer(0.18).timeout
	await _save_shot("02_playing_action.png")
	p1.set_charge_visual(0.0)

	# 3. Direct shell explosion next to P2 -> verify OverlapSphere falloff damage + knockback + VFX
	var hp_before := p2.current_health
	var hit_shell := TanksShell.new()
	game.world_root.add_child(hit_shell)
	hit_shell.setup(p2.global_position + Vector3(1.5, 0.5, 0.0), Vector3.ZERO, p1, game.tanks)
	hit_shell.explode()
	await get_tree().create_timer(0.08).timeout
	_assert("shell_overlap_damage_falloff", p2.current_health < hp_before and p2.current_health > 0.0, "hp=%.1f -> %.1f" % [hp_before, p2.current_health])
	await _save_shot("03_shell_explosion_damage.png")

	# 4. Finish P2 -> verify tank destruction, dynamic camera zoom onto P1, and Winner Announcement UI
	p2.take_damage(p2.current_health + 10.0)
	_assert("p2_destroyed_and_one_tank_left", p2.is_dead and game.one_tank_left(), "p2_dead=%s" % p2.is_dead)
	var end_msg := game.finish_round()
	# Let dynamic CameraRig smoothly zoom in onto winner P1 (matches Unity winner_annoucement.jpg!)
	await get_tree().create_timer(0.65).timeout
	_assert("camera_zooms_to_winner", game.camera_rig.cam.size <= 25.0 and game.camera_rig.global_position.distance_to(Vector3(p1.global_position.x, 0, p1.global_position.z)) < 3.0, "cam_size=%.1f" % game.camera_rig.cam.size)
	_assert("winner_announcement_shown", game.wins[0] == 1 and "WINS THE ROUND!" in end_msg, "wins=%s" % [game.wins])
	await _save_shot("04_round_winner.png")

	var passed := checks.filter(func(c): return c.passed).size()
	var elapsed := Time.get_ticks_msec() - t0
	var f := FileAccess.open(REPORT_PATH, FileAccess.WRITE)
	f.store_string(JSON.stringify({
		"game": "Tanks! 3D",
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
