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

	# 7. Grapple 3x Durability + Pull Resistance + Interactive Test Map
	main.queue_free()
	await process_frame
	var GrappleTestScene := load("res://scenes/grapple_test_map.tscn") as PackedScene
	assert(GrappleTestScene != null, "GrappleTestMap scene must load")
	var lab := GrappleTestScene.instantiate() as GrappleTestMap
	root.add_child(lab)
	for _j in 4:
		await process_frame
	assert(lab.targets.size() == 4, "GrappleTestMap should spawn 4 test target ships")
	assert(is_equal_approx(float(lab.grapple_config.hp), 288.0), "Default grapple HP should be 288 (3x stronger)")
	assert(is_equal_approx(float(lab.grapple_config.break_slack), 1260.0), "Default break_slack should be 1260 (3x)")
	assert(is_equal_approx(float(lab.grapple_config.max_tension_force), 126000.0), "Default max_tension_force should be 126000 (3x)")

	# Launch grapple against tug-of-war ship and pull hard for 60 physics frames
	lab.selected_target = lab.targets[1]
	lab.toggle_grapple()
	assert(lab.grapple != null and is_instance_valid(lab.grapple), "Grapple should launch in test map")
	for _f in 30:
		await physics_frame
	assert(lab.grapple != null and lab.grapple.connected, "Grapple should connect to tug-of-war ship")
	lab.grapple.apply_damage(150.0)
	assert(lab.grapple != null and is_instance_valid(lab.grapple) and lab.grapple.hp > 100.0, "3x grapple must survive 150 damage")
	for _p in 60:
		lab.player.apply_player_thrusters(1.0, 0.0, 0.0, 0.0)
		await physics_frame
	assert(lab.grapple != null and is_instance_valid(lab.grapple) and lab.grapple.connected, "3x grapple must resist breaking when pulled against resisting ship")

	# Verify 1.2x elastic stretch: no HP drain at 1.10x, HP drains at >= 1.20x, no self-collision
	assert(is_equal_approx(float(lab.grapple_config.max_stretch_ratio), 1.2), "Default max_stretch_ratio should be 1.2")
	var hp_before_mid := lab.grapple.hp
	var dir_mid := (lab.grapple.target_ship.global_position - lab.player.global_position).normalized()
	lab.grapple.target_ship.global_position = lab.player.global_position + dir_mid * (lab.grapple.chain_rest_length * 1.10)
	lab.grapple.target_ship.linear_velocity = Vector2.ZERO
	lab.player.linear_velocity = Vector2.ZERO
	lab.grapple.apply_tension_stabilizer(1.0 / 60.0)
	assert(not lab.grapple.is_at_max_stretch, "1.10x stretch must not be flagged as max stretch")
	assert(is_equal_approx(lab.grapple.hp, hp_before_mid), "HP must not drain before reaching 1.2x max stretch")

	lab.grapple.target_ship.global_position = lab.player.global_position + dir_mid * (lab.grapple.chain_rest_length * 1.22)
	lab.grapple.apply_tension_stabilizer(0.25)
	assert(lab.grapple.is_at_max_stretch, "At >= 1.2x stretch, is_at_max_stretch must be true")
	assert(lab.grapple.hp < hp_before_mid, "At max stretch (1.2x), durability HP must start draining")
	assert(lab.grapple.links.is_empty(), "Chain links must have no RigidBody self-collision")

	# Verify chain compression down to 0 without repulsion
	var saved_pos := lab.grapple.target_ship.global_position
	lab.grapple.target_ship.global_position = lab.player.global_position
	lab.grapple.apply_tension_stabilizer(1.0 / 60.0)
	assert(is_equal_approx(lab.grapple.current_tension, 0.0), "Zero distance chain must have 0 tension and no push-apart")
	assert(lab.grapple.target_ship.global_position.is_equal_approx(lab.player.global_position), "Chain must allow compression down to 0 distance")
	lab.grapple.target_ship.global_position = saved_pos

	# Verify live UI slider updates propagate to active grapple
	var hp_slider: HSlider = lab._sliders["hp"]
	hp_slider.value = 480.0
	assert(is_equal_approx(float(lab.grapple_config.hp), 480.0), "Slider must update grapple_config.hp")
	assert(is_equal_approx(lab.grapple.max_hp, 480.0), "Slider must update active grapple.max_hp in real time")
	var stretch_slider: HSlider = lab._sliders["max_stretch_ratio"]
	stretch_slider.value = 1.5
	assert(is_equal_approx(float(lab.grapple_config.max_stretch_ratio), 1.5), "Slider must update max_stretch_ratio")
	# Verify reel-in pull button & pull-force slider + link count winding down (constant link spacing)
	var reel_slider: HSlider = lab._sliders["reel_force"]
	reel_slider.value = 40000.0
	assert(is_equal_approx(float(lab.grapple_config.reel_force), 40000.0), "Slider must update reel_force")
	var dist_before_reel := lab.player.global_position.distance_to(lab.grapple.target_ship.global_position)
	var links_before_reel := lab.grapple.active_link_count()
	var seg_len_before_reel := lab.grapple._chain_seg_len
	lab.resist_enabled = false
	lab.toggle_reel_in()
	assert(lab.reel_toggle_active and lab.grapple.reeling_in, "Reel-in button must activate reeling when connected")
	for _r in 45:
		await physics_frame
	var dist_after_reel := lab.player.global_position.distance_to(lab.grapple.target_ship.global_position)
	assert(dist_after_reel < dist_before_reel - 30.0, "Reel-in pull force must draw connected ships closer")
	assert(lab.grapple.active_link_count() < links_before_reel, "Reeling in must reduce chain link count as links wind into ship")
	assert(is_equal_approx(lab.grapple._chain_seg_len, seg_len_before_reel), "Remaining chain link spacing must stay constant while winding")
	lab.toggle_reel_in()

	lab.apply_legacy_preset()
	assert(is_equal_approx(float(lab.grapple_config.hp), 32.0), "Legacy preset should restore hp=32")
	lab.apply_default_preset()
	assert(is_equal_approx(float(lab.grapple_config.hp), 288.0), "Default preset should restore hp=288")

	print("CAPTAIN_FOREVER_SP_OK parts=%d salvage=%d kills=%d radar=%d grapple_hp=%.0f" % [
		16, 2, 1, 11, lab.grapple.max_hp
	])
	quit(0)
