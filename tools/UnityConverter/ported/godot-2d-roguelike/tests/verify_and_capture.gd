extends Node

## Automated runtime verification & visual capture harness for ported Godot 4.7.2 2D Roguelike.

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

var SCREENSHOT_DIR: String = _reports_dir().path_join("screenshots")
var REPORT_PATH: String = _reports_dir().path_join("godot-runtime-verification.json")

var checks: Array[Dictionary] = []
var captures: Array[String] = []

func _assert(name: String, condition: bool, detail: String = "") -> void:
	checks.append({
		"name": name,
		"passed": condition,
		"detail": detail,
	})
	var tag := "PASS" if condition else "FAIL"
	print("[%s] %s %s" % [tag, name, detail])

func _save_screenshot(filename: String) -> void:
	await RenderingServer.frame_post_draw
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	DirAccess.make_dir_recursive_absolute(SCREENSHOT_DIR)
	var full_path := "%s/%s" % [SCREENSHOT_DIR, filename]
	var err := img.save_png(full_path)
	if err == OK:
		captures.append(filename)
		print("[CAPTURE] Saved %s (%dx%d)" % [filename, img.get_width(), img.get_height()])
	else:
		print("[CAPTURE_ERR] Failed to save %s err=%d" % [filename, err])

func _ready() -> void:
	call_deferred("_run_suite")

func _run_suite() -> void:
	var t0 := Time.get_ticks_msec()

	# Configure fast deterministic timing for automated E2E verification
	GameManager.deterministic_seed = 20261120
	GameManager.level_start_delay = 0.25
	GameManager.turn_delay = 0.05

	var main_scene: Node = (load("res://scenes/main.tscn") as PackedScene).instantiate()
	add_child(main_scene)
	await get_tree().process_frame
	await get_tree().process_frame

	# 1. Verify Day 1 Intro Overlay
	_assert("sound_clips_loaded_12", SoundManager.clips.size() == 12, "loaded=%d" % SoundManager.clips.size())
	_assert("day1_intro_visible", GameManager.level == 1 and main_scene.level_image.visible and main_scene.level_text.text == "Day 1", "text=%s" % main_scene.level_text.text)
	await _save_screenshot("01_day1_intro.png")

	# Wait for level intro overlay to hide
	await get_tree().create_timer(0.35).timeout
	await get_tree().process_frame

	var board: BoardManager = GameManager.board_script
	var player: PlayerUnit = GameManager.player
	player.move_time = 0.02
	player.restart_level_delay = 0.05

	# 2. Verify Day 1 Board Structure & Coordinates
	var board_holder: Node = main_scene.board_root.get_node("Board")
	_assert("board_tiles_10x10", board_holder.get_child_count() == 100, "tiles=%d" % board_holder.get_child_count())
	_assert("wall_count_in_range", board.walls_spawned.size() >= 5 and board.walls_spawned.size() <= 9, "walls=%d" % board.walls_spawned.size())
	_assert("pickup_count_in_range", board.pickups_spawned.size() >= 1 and board.pickups_spawned.size() <= 5, "pickups=%d" % board.pickups_spawned.size())
	_assert("day1_enemy_count_zero", board.enemies_spawned.size() == 0, "enemies=%d" % board.enemies_spawned.size())
	_assert("player_start_bottom_left", player.grid_pos == Vector2i(0, 0) and player.position == Vector2(0, 224), "grid=%s pos=%s" % [player.grid_pos, player.position])
	var exit_node = board.get_trigger_at(Vector2i(7, 7))
	_assert("exit_top_right", exit_node != null and exit_node.position == Vector2(224, 0), "exit_pos=%s" % (exit_node.position if exit_node else "null"))
	_assert("day1_overlay_hidden", not main_scene.level_image.visible and not GameManager.doing_setup, "visible=%s" % main_scene.level_image.visible)
	await _save_screenshot("02_day1_board.png")

	# 3. Verify Player Movement & OuterWall Blocking
	var food_before := player.food
	var blocked_outer := player.execute_player_turn(-1, 0)
	_assert("outer_wall_blocks_move", not blocked_outer.moved and player.grid_pos == Vector2i(0, 0), "pos=%s" % player.grid_pos)
	_assert("move_attempt_consumes_food", player.food == food_before - 1, "food=%d" % player.food)
	GameManager.players_turn = true

	var step_right := player.execute_player_turn(1, 0)
	await get_tree().create_timer(0.06).timeout
	_assert("player_moved_right", step_right.moved and player.grid_pos == Vector2i(1, 0), "grid=%s" % player.grid_pos)
	GameManager.players_turn = true

	# 4. Verify Wall Damage (damaged sprite + 4 hits destruction) & Pickup Consumption
	var target_wall: WallTile = board.walls_spawned[0]
	var wall_pos := target_wall.grid_pos
	var adjacent_pos := wall_pos + Vector2i(-1, 0)
	if board.get_blocking_at(adjacent_pos) != null:
		adjacent_pos = wall_pos + Vector2i(0, -1)
	var dir_to_wall := wall_pos - adjacent_pos

	board.move_blocking_unit(player, player.grid_pos, adjacent_pos)
	player.set_grid_position_immediate(adjacent_pos)

	var base_tex := target_wall.sprite.texture
	player.execute_player_turn(dir_to_wall.x, dir_to_wall.y)
	await get_tree().process_frame
	_assert("wall_damaged_on_chop", target_wall.hp == 3 and target_wall.sprite.texture == target_wall.dmg_sprite and target_wall.sprite.texture != base_tex, "hp=%d" % target_wall.hp)
	_assert("player_chop_anim_triggered", player.anim_sprite.animation == "chop", "anim=%s" % player.anim_sprite.animation)
	await _save_screenshot("03_day1_wall_chop.png")

	# Finish destroying the wall (3 more hits)
	for _i in range(3):
		GameManager.players_turn = true
		player.execute_player_turn(dir_to_wall.x, dir_to_wall.y)
	await get_tree().process_frame
	_assert("wall_destroyed_at_hp0", board.get_blocking_at(wall_pos) == null, "cleared=%s" % (board.get_blocking_at(wall_pos) == null))

	# Test Food / Soda Pickup
	var pickup_node: Node2D = board.pickups_spawned[0]
	var pickup_pos: Vector2i = pickup_node.get_meta("grid_pos")
	var pickup_tag: String = pickup_node.get_meta("unity_tag")
	var expected_bonus := 20 if pickup_tag == "Soda" else 10
	var pre_pickup_pos := pickup_pos + Vector2i(-1, 0)
	if board.get_blocking_at(pre_pickup_pos) != null:
		pre_pickup_pos = pickup_pos + Vector2i(0, -1)
	if board.get_blocking_at(pre_pickup_pos) != null:
		board.clear_blocking(pre_pickup_pos, board.get_blocking_at(pre_pickup_pos))
	var dir_to_pickup := pickup_pos - pre_pickup_pos
	board.move_blocking_unit(player, player.grid_pos, pre_pickup_pos)
	player.set_grid_position_immediate(pre_pickup_pos)
	var food_pre_pickup := player.food
	GameManager.players_turn = true
	player.execute_player_turn(dir_to_pickup.x, dir_to_pickup.y)
	await get_tree().create_timer(0.06).timeout
	_assert("pickup_increases_food", player.food == food_pre_pickup - 1 + expected_bonus and board.get_trigger_at(pickup_pos) == null, "tag=%s before=%d after=%d" % [pickup_tag, food_pre_pickup, player.food])

	# 5. Verify Exit -> Day 2 Progression & Enemy Spawn (floor(log2(2)) == 1)
	board.move_blocking_unit(player, player.grid_pos, Vector2i(6, 7))
	player.set_grid_position_immediate(Vector2i(6, 7))
	GameManager.players_turn = true
	player.execute_player_turn(1, 0) # Step onto Exit (7,7)
	await get_tree().create_timer(0.45).timeout
	await get_tree().process_frame

	board = GameManager.board_script
	player = GameManager.player
	player.move_time = 0.02
	_assert("day2_level_advanced", GameManager.level == 2 and not main_scene.level_image.visible, "level=%d" % GameManager.level)
	_assert("day2_enemy_spawned_1", board.enemies_spawned.size() == 1, "enemies=%d" % board.enemies_spawned.size())

	# Verify Enemy Movement (skip_move alternating) & Attack
	var enemy: EnemyUnit = board.enemies_spawned[0]
	enemy.move_time = 0.02
	var enemy_start := enemy.grid_pos
	var m1 := enemy.move_enemy()
	var m2 := enemy.move_enemy()
	_assert("enemy_skip_move_alternates", (not m1.skipped) and m2.skipped, "m1=%s m2=%s" % [m1, m2])
	await get_tree().create_timer(0.06).timeout

	# Place player adjacent to enemy so enemy attacks player
	var adj_enemy := enemy.grid_pos + Vector2i(-1, 0)
	if adj_enemy.x < 0 or board.get_blocking_at(adj_enemy) != null:
		adj_enemy = enemy.grid_pos + Vector2i(1, 0)
	if board.get_blocking_at(adj_enemy) != null:
		board.clear_blocking(adj_enemy, board.get_blocking_at(adj_enemy))
	board.move_blocking_unit(player, player.grid_pos, adj_enemy)
	player.set_grid_position_immediate(adj_enemy)
	var food_before_hit := player.food
	enemy.skip_move = false
	enemy.move_enemy()
	await get_tree().process_frame
	_assert("enemy_attacks_player_and_reduces_food", player.food == food_before_hit - enemy.player_damage, "dmg=%d before=%d after=%d" % [enemy.player_damage, food_before_hit, player.food])
	await _save_screenshot("04_day2_enemy_combat.png")

	# 6. Verify Game Over Flow
	player.lose_food(player.food)
	await get_tree().process_frame
	_assert("game_over_triggered", GameManager.is_game_over and main_scene.level_image.visible and main_scene.level_text.text == "After 2 days, you starved.", "text=%s" % main_scene.level_text.text)
	await _save_screenshot("05_game_over.png")

	# Write JSON report
	var passed_count := 0
	for c in checks:
		if c.passed:
			passed_count += 1
	var elapsed_ms := Time.get_ticks_msec() - t0
	var summary := {
		"verifiedAt": Time.get_datetime_string_from_system(true),
		"engineVersion": Engine.get_version_info().string,
		"elapsedMs": elapsed_ms,
		"totalChecks": checks.size(),
		"passedChecks": passed_count,
		"failedChecks": checks.size() - passed_count,
		"captures": captures,
		"checks": checks,
	}
	var f := FileAccess.open(REPORT_PATH, FileAccess.WRITE)
	f.store_string(JSON.stringify(summary, "  "))
	f.close()

	print("SUMMARY: %d/%d checks passed in %d ms" % [passed_count, checks.size(), elapsed_ms])
	main_scene.queue_free()
	await get_tree().process_frame
	get_tree().quit(0 if passed_count == checks.size() else 1)
