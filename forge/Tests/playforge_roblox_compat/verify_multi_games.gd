extends Node

@export var game_id: String = ""
@export var capture_dir: String = ""

var _results: Array[Dictionary] = []

func _ready() -> void:
	call_deferred("_run")

func _record(name: String, passed: bool, detail: String) -> void:
	_results.append({"name": name, "passed": passed, "detail": detail})
	print("[BEHAVIOR:%s] %s | %s | %s" % [game_id, "PASS" if passed else "FAIL", name, detail])

func _save_shot(filename: String) -> void:
	if capture_dir == "" or DisplayServer.get_name() == "headless":
		return
	await get_tree().process_frame
	await get_tree().process_frame
	var img := get_viewport().get_texture().get_image()
	if img != null:
		var full_path := capture_dir.path_join(filename)
		var err := img.save_png(full_path)
		print("[SCREENSHOT] %s (err=%d, %dx%d)" % [full_path, err, img.get_width(), img.get_height()])

func _run() -> void:
	await get_tree().physics_frame
	await get_tree().physics_frame
	var main := get_tree().current_scene.get_node_or_null("Main")
	if main == null:
		main = get_tree().current_scene
	if game_id == "war_tycoon":
		await _verify_war_tycoon(main)
	elif game_id == "power_punch_sim":
		await _verify_power_punch(main)
	elif game_id == "lantai_runtuh":
		await _verify_lantai_runtuh(main)
	else:
		_record("unknown_game", false, "Unknown game_id=" + game_id)
	_finish()

func _verify_war_tycoon(main: Node) -> void:
	var cfg := main.get_node("Modules/Config")
	var econ := main.get_node("Modules/Economy")
	var combat := main.get_node("Modules/Combat")
	var pl := RobloxCompat.get_local_player()

	# 1. Config module transpilation parity
	_record(
		"config_parity",
		int(cfg.StartCash) == 300 and int(cfg.KillReward) == 150 and int(cfg.PlotCount) == 4 and cfg.Items.size() == 11,
		"StartCash=%s KillReward=%s Plots=%s Items=%d" % [cfg.StartCash, cfg.KillReward, cfg.PlotCount, cfg.Items.size()]
	)

	# 2. Economy.setup & leaderstats IntValue parity
	var initial_cash: int = int(econ.rbx_get(pl))
	_record("economy_leaderstats_setup", initial_cash == 300, "initial Argent=%d (expected 300)" % initial_cash)

	# 3. Economy.spend & Tycoon Dropper purchase
	var bought: bool = bool(main.call("buy_item", pl, "dropper1"))
	var after_buy: int = int(econ.rbx_get(pl))
	var over_spend: bool = bool(econ.spend(pl, 9999))
	_record(
		"tycoon_dropper_purchase",
		bought and after_buy == 150 and not over_spend,
		"bought_dropper1=%s cash=300->%d over_spend=%s" % [bought, after_buy, over_spend]
	)

	# 4. Combat.damage + Humanoid.Died -> KillReward +$150 + Kills=1 + RemoteEvent Notify
	var victim := RobloxCompat.create_mock_player("EnemyPlayer", 2002)
	var enemy_char: Node3D = main.get("enemy_character")
	victim.character = enemy_char
	combat.watch(victim, enemy_char)
	var enemy_hum := RobloxCompat.find_first_child_of_class(enemy_char, "Humanoid")
	combat.damage(enemy_hum, 120, pl)
	var post_kill_cash: int = int(econ.rbx_get(pl))
	var stats := RobloxCompat.find_first_child(pl, "leaderstats")
	var kills_val := RobloxCompat.find_first_child(stats, "Kills")
	var rs: Node = RobloxCompat.get_service("ReplicatedStorage")
	var notify_ev := RobloxCompat.find_first_child(rs, "Notify")
	var notified: bool = notify_ev != null and notify_ev.event_log.size() > 0
	_record(
		"combat_kill_reward_and_remote_notify",
		post_kill_cash == 300 and int(kills_val.value) == 1 and notified,
		"cash=150->%d kills=%s remote_notify=%s" % [post_kill_cash, kills_val.value, notified]
	)

	# 5. 3D 4-plot Tycoon World parity
	var plots: int = int(main.get("plot_count_built"))
	main.call("_update_hud", "Dropper1 Owned · Kill +$150")
	await _save_shot("after_war_tycoon.png")
	_record("scene_4plot_world", plots == 4, "plots_built=%d" % plots)

func _verify_power_punch(main: Node) -> void:
	var cfg := main.get_node("Modules/Config")
	var formulas := main.get_node("Modules/Formulas")

	# 1. Config & Zones parity
	_record(
		"config_zones_and_gear",
		cfg.Gear.size() == 6 and cfg.Zones.size() == 4 and int(cfg.Rebirth["BaseCost"]) == 10000,
		"Gear=%d Zones=%d RebirthBase=%s" % [cfg.Gear.size(), cfg.Zones.size(), cfg.Rebirth["BaseCost"]]
	)

	# 2. Formulas.abbreviate exact formatting (1234567 -> "1.23M", 950 -> "950", 12500 -> "12.5K")
	var ab1: String = str(formulas.abbreviate(1234567))
	var ab2: String = str(formulas.abbreviate(950))
	var ab3: String = str(formulas.abbreviate(12500))
	_record(
		"formulas_abbreviate_parity",
		ab1 == "1.23M" and ab2 == "950" and ab3 == "12.5K",
		"1234567->'%s' 950->'%s' 12500->'%s'" % [ab1, ab2, ab3]
	)

	# 3. Formulas.powerPerPunch & coinsForPower multiplier accuracy
	# gearLevel=2 (Leather Gloves x5), rebirths=2 (1 + 2*0.5 = x2), zoneMultiplier=8 (Volcano), hasDoublePower=true (x2) => 1*5*2*8*2 = 160
	var test_state := { "gearLevel": 2, "rebirths": 2, "zoneMultiplier": 8, "hasDoublePower": true }
	var ppp: int = int(formulas.powerPerPunch(test_state))
	var coins: int = int(formulas.coinsForPower(ppp, true)) # 160 * 0.5 * 2 = 160
	_record(
		"formulas_punch_and_coins_math",
		ppp == 160 and coins == 160,
		"powerPerPunch=%d (expected 160) coinsForPower=%d (expected 160)" % [ppp, coins]
	)

	# 4. Formulas.rebirthCost exponential progression (10000 * 3^r)
	var rc0: int = int(formulas.rebirthCost(0))
	var rc1: int = int(formulas.rebirthCost(1))
	var rc2: int = int(formulas.rebirthCost(2))
	_record(
		"formulas_rebirth_exponential",
		rc0 == 10000 and rc1 == 30000 and rc2 == 90000,
		"r0=%d r1=%d r2=%d" % [rc0, rc1, rc2]
	)

	# 5. MarketplaceService X-grade stub + live punch state + 5-zone 3D world
	var mp := RobloxCompat.get_marketplace_stub()
	var owns_before: bool = mp.user_owns_game_pass_async(1001, 999)
	mp.grant_test_pass(1001, 999)
	var owns_after: bool = mp.user_owns_game_pass_async(1001, 999)
	main.player_state["gearLevel"] = 3
	main.player_state["zoneMultiplier"] = 8
	main.call("perform_punch")
	main.call("perform_punch")
	var zones_built: int = int(main.get("zone_count_built"))
	await _save_shot("after_power_punch_sim.png")
	_record(
		"marketplace_stub_and_5zone_world",
		not owns_before and owns_after and zones_built == 5 and int(main.player_state["power"]) > 0,
		"mp_stub(%s->%s) zones=%d power=%s" % [owns_before, owns_after, zones_built, main.player_state["power"]]
	)

func _verify_lantai_runtuh(main: Node) -> void:
	var cfg := main.get_node("Modules/Config")
	var pattern := main.get_node("Modules/Pattern")
	var rewards := main.get_node("Modules/Rewards")

	# 1. Config._data parity (12x12 arena, 6 accessible colors)
	var grid_size: int = int(cfg._data["Arena"]["GridSize"])
	var color_count: int = cfg._data["Colors"].size()
	_record(
		"config_arena_and_palette",
		grid_size == 12 and color_count == 6,
		"GridSize=%d Colors=%d" % [grid_size, color_count]
	)

	# 2. Pattern.generate parity (144 tiles, safe share strictly clamped within [0.12, 0.50])
	var layout: Dictionary = main.get("current_layout")
	var cells: Array = layout["cells"]
	var target: int = int(layout["target"])
	var safe_n: int = int(pattern.count(cells, target))
	var share := float(safe_n) / float(cells.size())
	_record(
		"pattern_generate_safe_share",
		cells.size() == 144 and share >= 0.12 and share <= 0.50 and safe_n > 0,
		"tiles=%d target=%d safe=%d (%.1f%% in [12%%, 50%%])" % [cells.size(), target, safe_n, share * 100.0]
	)

	# 3. Pattern.isSafe consistency across all 144 tiles
	var mismatch := 0
	for i in range(cells.size()):
		var expected: bool = int(cells[i]) == target
		var actual: bool = bool(pattern.isSafe(layout, i + 1))
		if expected != actual:
			mismatch += 1
	_record("pattern_is_safe_exact_144", mismatch == 0, "checked=144 mismatches=%d" % mismatch)

	# 4. Rewards.compute exact payout math (Participation=5, PerWave=2, WinBonus=50)
	var payouts: Dictionary = rewards.compute(cfg._data["Rewards"], [101, 102], { 101: 5, 102: 3 }, [101])
	var p101: Dictionary = payouts[101] # 5 + 5*2 + 50 = 65, won=true
	var p102: Dictionary = payouts[102] # 5 + 3*2 + 0 = 11, won=false
	_record(
		"rewards_compute_payouts",
		int(p101["coins"]) == 65 and bool(p101["won"]) and int(p102["coins"]) == 11 and not bool(p102["won"]),
		"winner_101=%s loser_102=%s" % [p101["coins"], p102["coins"]]
	)

	# 5. Live screenshot before drop + drop_unsafe_tiles collision/drop verification
	await _save_shot("after_lantai_runtuh_wave.png")
	main.call("drop_unsafe_tiles")
	var dropped: int = int(main.get("dropped_count"))
	await _save_shot("after_lantai_runtuh_drop.png")
	_record(
		"arena_drop_unsafe_tiles",
		dropped == 144 - safe_n and dropped > 0,
		"dropped=%d remaining_safe=%d" % [dropped, safe_n]
	)

func _finish() -> void:
	var passed := 0
	for r in _results:
		if r["passed"]:
			passed += 1
	var summary := {
		"game_id": game_id,
		"passed": passed,
		"total": _results.size(),
		"pass_rate": float(passed) / maxf(1.0, float(_results.size())),
		"assertions": _results
	}
	print("BEHAVIOR_SUMMARY_JSON=" + JSON.stringify(summary))
	get_tree().quit(0 if passed == _results.size() else 1)
