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
	assert(main.player.model.power_efficiency() >= 1.0, "Starter ship reactor + battery supply should cover demand")

	# 1. Cosmoteer Directional Shield Arc (136° forward block vs rear flank bypass)
	main.player.repair_all()
	assert(main.player.shield_layers == 1, "Starter ship should have 1 active shield layer")
	var front_part: PartData = main.player.model.part_at(Vector2i(3, 0))
	assert(front_part != null, "Expected front ammo_bay at (3, 0)")
	main.player.damage_part(front_part, 5.0, Vector2(-600.0, 0.0))
	assert(main.player.last_hit_shield_absorbed, "Forward hit inside 136° shield arc must be absorbed")
	assert(is_equal_approx(front_part.hp, front_part.max_hp), "Shielded forward module should take 0 hull damage")

	main.player.repair_all()
	var rear_thruster: PartData = main.player.model.part_at(Vector2i(-1, -1))
	assert(rear_thruster != null, "Expected rear thruster at (-1, -1)")
	main.player.damage_part(rear_thruster, 4.0, Vector2(600.0, 0.0))
	assert(not main.player.last_hit_shield_absorbed, "Rear flank hit outside 136° forward shield arc must bypass shield")
	assert(main.player.shield_layers == 1, "Bypassed forward shield must retain its layer")
	assert(rear_thruster.hp < rear_thruster.max_hp, "Rear thruster should take direct hull damage on flank")
	main.player.repair_all()

	# 2. Cosmoteer Exhaust Interference Placement Block (배기간섭 설치 불가)
	var probe_block: PartData = main.player.model.make_part("block", Vector2i.ZERO)
	assert(main.player.model.would_block_exhaust(probe_block, Vector2i(-2, -1)), "Cell (-2, -1) behind main thruster must be flagged as exhaust interference")
	assert(not main.player.model.can_place(probe_block, Vector2i(-2, -1)), "can_place must block placing module in main thruster exhaust")
	assert(not main.player.model.attach(probe_block, Vector2i(-2, -1)), "attach must reject placement in main thruster exhaust")
	assert(not (Vector2i(-2, -1) in main.player.model.attachment_candidates(probe_block)), "attachment_candidates must omit exhaust-blocked cells")
	assert(not main.player.model.can_place(probe_block, Vector2i(3, -1)), "can_place must also block placing module in reverse_thruster exhaust")

	var probe_thruster: PartData = main.player.model.make_part("thruster", Vector2i.ZERO, 3)
	assert(not main.player.model.can_place(probe_thruster, Vector2i(0, -3)), "Thruster whose own exhaust faces into hull cell (0, -2) must be rejected")
	probe_thruster.quarter_turn = 0
	assert(main.player.model.can_place(probe_thruster, Vector2i(0, -3)), "Rotating thruster so exhaust clears hull must allow placement")

	# 3. Cosmoteer 6-DOF Lateral Strafe (RCS opposing vernier allocation)
	main.player.rotation = 0.0
	main.player.linear_velocity = Vector2.ZERO
	main.player.angular_velocity = 0.0
	for _step in 5:
		main.player.apply_player_thrusters(0.0, 0.0, 0.0, 1.0)
		await physics_frame
	assert(main.player.linear_velocity.y > 0.4, "Starboard strafe should accelerate ship along +Y via RCS verniers")

	# 4. Cosmoteer Weapon Recoil Impulse + Muzzle Flash
	main.player.rotation = 0.0
	main.player.linear_velocity = Vector2.ZERO
	main.player.laser_cooldown = 0.0
	main.player.heat = 0.0
	main.fire_primary_at(main.player.global_position + Vector2(400.0, 0.0))
	assert(main.combat_fx.flashes.size() >= 1, "Weapon fire should spawn muzzle flash")
	assert(main.player.weapon_recoil.size() >= 1, "Weapon fire should populate barrel recoil slide")
	await physics_frame
	assert(main.player.linear_velocity.x < -0.05, "Forward weapon volley must apply Newton's 3rd law backward recoil impulse")

	# 5. Quick-Attach (C) + Overdrive Boost (B)
	var before_parts: int = main.player.model.parts.size()
	main.quick_attach_module()
	assert(main.player.model.parts.size() > before_parts, "Quick-attach should attach a salvage module")
	assert(main.salvage_count >= 1, "Quick-attach should increment salvage_count")
	main.activate_overdrive()
	assert(main.player.overdrive_active, "Overdrive should engage when charge >= 40")

	# 6. Volatile Module Sub-Explosion + Raider Victory
	assert(main.enemies.size() >= 1, "Initial scout raider should be present")
	var raider: EnemyShip = main.enemies[0]
	var max_y: int = 0
	for part in raider.model.parts:
		for cell in part.cells():
			if cell.x == 0 and cell.y > max_y:
				max_y = cell.y
	var test_armor: PartData = raider.model.add("armor", Vector2i(0, max_y + 1))
	var test_ammo: PartData = raider.model.add("ammo_bay", Vector2i(0, max_y + 2))
	raider.refresh_mass()
	raider.damage_part(test_ammo, 999.0, Vector2.ZERO, null, true)
	var blasts: Array[Dictionary] = raider.pop_volatile_blasts()
	assert(blasts.size() >= 1, "Destroying ammo_bay must trigger internal volatile blast")
	assert(test_armor.hp < test_armor.max_hp, "Adjacent module must take internal volatile splash damage")

	main.destroy_enemy(raider)
	assert(main.kill_count == 1 and main.kill_streak == 1, "Destroying raider should track kills and streak")

	print("CAPTAIN_FOREVER_SP_OK parts=%d salvage=%d kills=%d radar=%d pwr=%.2f" % [
		main.player.model.parts.size(), main.salvage_count, main.kill_count, main.hud.radar_blips.size(), main.player.model.power_efficiency()
	])
	quit(0)
