extends SceneTree

const MainScene = preload("res://scenes/main.tscn")

func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var main := MainScene.instantiate() as Node2D
	root.add_child(main)
	for _i in 6:
		await process_frame

	assert(not paused, "Single-player showcase should start immediately in live flight without modal freeze")
	assert(main.player != null, "PlayerShip missing")
	assert(main.player.model.parts.size() == 15, "Expected 15 starter parts")
	assert(main.combat_fx != null, "CombatFxLayer missing")
	assert(ThemeDB.fallback_font != null, "Fallback Korean font missing")
	assert(main.hud.radar_blips.size() >= 4, "Tactical radar should populate stations, enemies, and salvage")

	# 1. Test Quick-Attach (C): snaps nearest salvage part onto hull
	var before_parts: int = main.player.model.parts.size()
	main.quick_attach_module()
	assert(main.player.model.parts.size() > before_parts, "Quick-attach should attach a salvage module")
	assert(main.salvage_count >= 1, "Quick-attach should increment salvage_count")

	# 2. Test Overdrive Boost (B)
	main.activate_overdrive()
	assert(main.player.overdrive_active, "Overdrive should engage when charge >= 40")

	# 3. Test Primary Weapon Fire + Muzzle Flash
	main.fire_primary_at(main.player.global_position + Vector2(300.0, 0.0))
	assert(main.combat_fx.flashes.size() >= 1, "Weapon fire should spawn muzzle flash")

	# 4. Test Raider Victory + Kill Streak + Guaranteed Bonus Drop
	assert(main.enemies.size() >= 1, "Initial scout raider should be present")
	var raider: EnemyShip = main.enemies[0]
	main.destroy_enemy(raider)
	assert(main.kill_count == 1 and main.kill_streak == 1, "Destroying raider should track kills and streak")

	print("CAPTAIN_FOREVER_SP_OK parts=%d salvage=%d kills=%d radar=%d" % [
		main.player.model.parts.size(), main.salvage_count, main.kill_count, main.hud.radar_blips.size()
	])
	quit(0)
