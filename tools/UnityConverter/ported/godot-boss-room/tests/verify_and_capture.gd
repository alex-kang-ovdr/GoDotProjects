extends Node
## Automated E2E verification & HD screenshot capture harness for Boss Room (Godot 4.7.2).

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

var SCREENSHOT_DIR: String = _reports_dir().path_join("screenshots/boss-room")
var REPORT_PATH: String = _reports_dir().path_join("boss-room-verification.json")

const BOSS_ROOM_SCENE := preload("res://scenes/boss_room.tscn")

var checks: Array[Dictionary] = []
var captures: Array[String] = []


func _record(check_name: String, passed: bool, detail: String = "") -> void:
	checks.append({"name": check_name, "passed": passed, "detail": detail})
	print(("[PASS] " if passed else "[FAIL] ") + check_name + ("" if detail == "" else " -- " + detail))


func _wait_frames(count: int) -> void:
	for _i in count:
		await get_tree().process_frame


func _capture(filename: String) -> void:
	DirAccess.make_dir_recursive_absolute(SCREENSHOT_DIR)
	await RenderingServer.frame_post_draw
	var img: Image = get_viewport().get_texture().get_image()
	var full_path: String = SCREENSHOT_DIR.path_join(filename)
	var err: Error = img.save_png(full_path)
	if err == OK:
		captures.append(filename)
		print("[CAPTURE] ", filename, " (", img.get_width(), "x", img.get_height(), ")")
	else:
		push_error("Failed to save screenshot: " + full_path)


func _ready() -> void:
	var game: BossRoomGame = BOSS_ROOM_SCENE.instantiate() as BossRoomGame
	add_child(game)
	await _wait_frames(8)

	# 1. Verify all 4 hero classes + Boss + Imps + Dungeon assets instantiated
	_record("party_4_classes_spawned", game.heroes.size() == 4, "heroes=" + str(game.heroes.size()))
	_record("boss_and_imps_spawned", game.boss != null and game.enemies.size() >= 3, "enemies=" + str(game.enemies.size()))
	_record("dungeon_fbx_assets_built", game.dungeon != null and game.dungeon.door_node != null and game.dungeon.switch_node != null and game.dungeon.chest_node != null, "door/switch/chest ready")

	# 2. Scene 1 Capture: Entrance Corridor + Floor Switch puzzle -> activate switch & open Boss Door
	game.heroes[0].position = Vector3(0.0, 0.0, 25.2)
	game.heroes[1].position = Vector3(2.8, 0.0, 26.8)
	game.heroes[2].position = Vector3(-2.8, 0.0, 26.5)
	game.heroes[3].position = Vector3(3.6, 0.0, 24.4)
	game.activate_floor_switch()
	game.camera_override = true
	game.camera.position = Vector3(0.0, 12.5, 36.5)
	game.camera.look_at(Vector3(0.0, 2.2, 20.0), Vector3.UP)
	await _wait_frames(12)
	_record("floor_switch_opens_boss_door", game.switch_activated and game.boss_door_open, "door_open=" + str(game.boss_door_open))
	await _capture("01_entrance_switch_door.png")

	# 3. Enter Boss Arena & verify dramatic Boss Fight framing (matches Unity Boss.png angle!)
	game.enter_boss_arena()
	game.boss.position = Vector3(-2.6, 0.0, -1.5)
	game.boss.look_at_flat(Vector3(3.0, 0.0, 4.5))
	game.enemies[1].position = Vector3(-9.2, 0.0, -6.5)
	game.enemies[2].position = Vector3(-7.0, 0.0, -7.2)
	# Position 4 heroes in dramatic Boss Room co-op formation
	game.heroes[0].position = Vector3(2.8, 0.0, 2.5)   # Tank facing Boss with shield
	game.heroes[0].look_at_flat(game.boss.position)
	game.heroes[1].position = Vector3(8.2, 0.0, 2.2)   # Archer firing arrow
	game.heroes[1].look_at_flat(game.boss.position)
	game.heroes[2].position = Vector3(5.0, 0.0, -4.2)  # Mage casting green heal aura near chest
	game.heroes[2].look_at_flat(game.boss.position)
	game.heroes[3].position = Vector3(0.8, 0.0, 6.2)   # Rogue flanking
	game.heroes[3].look_at_flat(game.boss.position)

	# Fire authentic class skills for active combat frame
	var boss_hp_before: float = game.boss.hp
	game.trigger_hero_skill_e(game.heroes[0])  # Tank Hammer Smash hit
	game.trigger_hero_skill_q(game.heroes[0])  # Tank Charged Shield
	game.trigger_hero_skill_q(game.heroes[1])  # Archer Power Shot
	game.trigger_hero_skill_q(game.heroes[2])  # Mage Heal Ring AOE
	game.trigger_hero_basic_attack(game.heroes[3])
	game.camera.position = Vector3(-3.8, 7.6, 12.6)
	game.camera.look_at(Vector3(1.2, 2.1, -4.2), Vector3.UP)
	await _wait_frames(8)
	_record("boss_arena_combat_active", game.phase == BossRoomGame.GamePhase.BOSS_FIGHT and ActionBus.total_rpc_dispatches >= 5, "rpcs=" + str(ActionBus.total_rpc_dispatches))
	await _capture("02_boss_arena_combat.png")

	# Let projectiles land & verify damage + cheat-range validation on ActionBus
	await _wait_frames(18)
	_record("heroes_damage_boss", game.boss.hp < boss_hp_before, "hp=" + str(int(game.boss.hp)) + "/" + str(int(boss_hp_before)))
	var cheat_rejected: bool = not ActionBus.request_action("CheatClient", "aoe_test", {"origin": Vector3.ZERO, "target_pos": Vector3(99.0, 0.0, 0.0)}, 0.0, 5.0)
	_record("server_authority_range_check", cheat_rejected and ActionBus.rejected_out_of_range >= 1, "rejected=" + str(ActionBus.rejected_out_of_range))

	# 4. Scene 3 Capture: Boss Trample Telegraph -> collides with Tank's Charged Shield -> BOSS STUNNED!
	game.boss.position = Vector3(-5.5, 0.0, -2.0)
	game.heroes[0].position = Vector3(2.2, 0.0, -2.0)
	game.heroes[0].look_at_flat(game.boss.position)
	game.heroes[0].activate_charged_shield(5.0)
	game.boss.start_trample_toward(game.heroes[0].position)
	game.camera.position = Vector3(0.0, 14.5, 13.5)
	game.camera.look_at(Vector3(-1.0, 1.2, -2.0), Vector3.UP)
	await _wait_frames(6)
	await _capture("03_boss_trample_telegraph.png")

	# Advance Boss Trample until Tank ChargedShield stuns the Boss
	for _step in 120:
		if game.boss.pattern == EnemyUnit.BossPattern.STUNNED:
			break
		game.boss.step_enemy(0.03, game.heroes, Rect2(-14.2, -14.0, 28.4, 28.5), game._on_boss_aoe_burst)
		await get_tree().process_frame
	_record("tank_charged_shield_stuns_trample_boss", game.boss.pattern == EnemyUnit.BossPattern.STUNNED and game.boss.stun_count >= 1, "stun_count=" + str(game.boss.stun_count))

	# 5. Verify Mage Heal AOE + Downed Hero ReviveAction + Rogue DashAttack
	game.heroes[3].take_damage(500.0)
	var was_downed: bool = game.heroes[3].is_downed
	game.heroes[2].position = game.heroes[3].position + Vector3(1.8, 0.0, 0.0)
	game.trigger_revive_nearest(game.heroes[2])
	_record("downed_hero_revived_by_ally", was_downed and not game.heroes[3].is_downed, "rogue_hp=" + str(int(game.heroes[3].hp)))

	game.heroes[1].take_damage(70.0)
	var archer_hp_low: float = game.heroes[1].hp
	ActionBus.active_cooldowns.clear()
	game.heroes[2].position = game.heroes[1].position + Vector3(-2.0, 0.0, 0.0)
	game.trigger_hero_skill_q(game.heroes[2])
	_record("mage_heal_aoe_restores_party", game.heroes[1].hp > archer_hp_low, "archer_hp=" + str(int(archer_hp_low)) + "->" + str(int(game.heroes[1].hp)))

	# Scene 4 Capture: Stunned Boss with golden stars + Rogue Dash + Mage Heal Ring
	game.trigger_hero_skill_q(game.heroes[3])
	game.camera.position = Vector3(1.5, 11.5, 11.8)
	game.camera.look_at(game.boss.position + Vector3(0.0, 1.8, 0.0), Vector3.UP)
	await _wait_frames(8)
	await _capture("04_boss_stunned_and_coop_skills.png")

	# 6. Scene 5 Capture: Defeat Imp Boss -> Treasure Chest Opens -> Victory PostGame Summary
	game.boss.take_damage(9999.0)
	await _wait_frames(10)
	_record("boss_defeat_opens_chest_and_victory", game.phase == BossRoomGame.GamePhase.VICTORY and game.chest_opened and game.victory_panel.visible, "chest_open=" + str(game.chest_opened))

	game.heroes[0].position = Vector3(-3.2, 0.0, -8.8)
	game.heroes[1].position = Vector3(-1.1, 0.0, -8.2)
	game.heroes[2].position = Vector3(1.1, 0.0, -8.2)
	game.heroes[3].position = Vector3(3.2, 0.0, -8.8)
	for h in game.heroes:
		h.look_at_flat(Vector3(0.0, 0.0, -13.2))
	game.camera.position = Vector3(0.0, 9.5, -0.5)
	game.camera.look_at(Vector3(0.0, 2.2, -13.2), Vector3.UP)
	await _wait_frames(10)
	await _capture("05_victory_treasure_chest.png")

	# 7. Write verification report JSON
	var passed_count: int = 0
	var failed_count: int = 0
	for c in checks:
		if bool(c["passed"]):
			passed_count += 1
		else:
			failed_count += 1

	var report := {
		"game": "Unity Boss Room (com.unity.multiplayer.samples.coop)",
		"godotVersion": Engine.get_version_info().get("string", "4.7.2"),
		"totalChecks": checks.size(),
		"passedChecks": passed_count,
		"failedChecks": failed_count,
		"captures": captures,
		"rpcDispatches": ActionBus.total_rpc_dispatches,
		"bossStuns": game.boss.stun_count,
		"checks": checks,
	}
	var out_dir := REPORT_PATH.get_base_dir()
	DirAccess.make_dir_recursive_absolute(out_dir)
	var f := FileAccess.open(REPORT_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(report, "  "))
		f.close()
	print("[SUMMARY] Boss Room E2E: ", passed_count, "/", checks.size(), " passed, ", failed_count, " failed")
	CharacterVisual._cached_scene = null
	CharacterVisual._tex_cache.clear()
	game.queue_free()
	await _wait_frames(2)
	get_tree().quit(0 if failed_count == 0 else 1)
