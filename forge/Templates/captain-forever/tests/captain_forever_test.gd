extends SceneTree

const MainScene = preload("res://scenes/main.tscn")

func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	ShipModel.clear_saved_blueprint()
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

	# 5. No floating items, no in-combat build, 2x durability, Overdrive Boost (B)
	var neutral_count := 0
	for child in main.world_layer.get_children():
		if child is NeutralPart:
			neutral_count += 1
	assert(neutral_count == 0, "Main combat map must have 0 floating salvage items")

	# Regression test: target touch-drag release followed by empty-space tap with a new touch index must always activate Auto-Nav
	if not main.enemies.is_empty():
		var e_screen: Vector2 = main.get_viewport().get_canvas_transform() * main.enemies[0].global_position
		var t_down := InputEventScreenTouch.new()
		t_down.index = 0; t_down.pressed = true; t_down.position = e_screen
		main._unhandled_input(t_down)
		var t_drag := InputEventScreenDrag.new()
		t_drag.index = 0; t_drag.position = e_screen + Vector2(120.0, 40.0)
		main._input(t_drag)
		var t_up := InputEventScreenTouch.new()
		t_up.index = 0; t_up.pressed = false; t_up.position = e_screen + Vector2(120.0, 40.0)
		main._input(t_up)
		assert(main._pinch_touches.is_empty(), "Touch release handled in _input must clear _pinch_touches")
		var empty_tap := InputEventScreenTouch.new()
		empty_tap.index = 1; empty_tap.pressed = true; empty_tap.position = Vector2(640.0, 300.0)
		main._unhandled_input(empty_tap)
		assert(main.navigation_active, "Empty-space tap with next touch index must reliably activate Auto-Nav")
		var empty_up := InputEventScreenTouch.new()
		empty_up.index = 1; empty_up.pressed = false; empty_up.position = Vector2(640.0, 300.0)
		main._input(empty_up)
		main.navigation_active = false

	# Regression test: ship with ZERO rcs_thruster must still rotate AND fly toward Auto-Nav destination
	var saved_bp_nav: Array[Dictionary] = main.player.model.export_blueprint()
	for p_item in main.player.model.parts.duplicate():
		if str(p_item.spec().get("actuator", "")) == "turn":
			main.player.model.remove(p_item.uid)
	main.player.refresh_mass()
	assert(main.player.parts_with_actuator("turn").is_empty(), "Test setup must have 0 RCS thrusters")
	main.player.global_position = Vector2.ZERO
	main.player.rotation = -PI * 0.5
	main.player.linear_velocity = Vector2.ZERO
	main.player.angular_velocity = 0.0
	var nav_goal := Vector2(-460.0, 20.0)
	main.set_navigation_destination(nav_goal)
	var start_dist: float = main.player.global_position.distance_to(nav_goal)
	var start_rot: float = main.player.rotation
	for _n in 95:
		await physics_frame
	assert(absf(wrapf(main.player.rotation - start_rot, -PI, PI)) > 0.5, "Ship without RCS must still rotate toward Auto-Nav target")
	assert(main.player.global_position.distance_to(nav_goal) < start_dist - 80.0, "Ship without RCS must move toward Auto-Nav target")
	main.navigation_active = false
	main.player.model.restore_from_blueprint(saved_bp_nav)
	main.player.refresh_mass()
	main.player.global_position = Vector2.ZERO
	main.player.rotation = 0.0
	main.player.linear_velocity = Vector2.ZERO
	main.player.angular_velocity = 0.0

	# Regression test: Hull-touch arrival (point touching front nose at x=+135 > 54px center radius counts as arrived!)
	var nose_touch_pt := Vector2(135.0, 0.0) # ammo_bay at (3,0) -> x=126, half=21 -> hull edge at x=147!
	assert(main.player.touches_navigation_point(nose_touch_pt), "Point touching extended hull nose must count as arrived")
	assert(main.player.step_auto_navigation(nose_touch_pt, 1.0 / 60.0) == "arrived", "step_auto_navigation must return arrived on hull touch")

	# Regression test: Deadlock fail-stop when blocked by an immovable obstacle
	var blocker := StaticBody2D.new()
	blocker.position = Vector2(205.0, 0.0)
	var bcol := CollisionShape2D.new()
	var bshape := CircleShape2D.new()
	bshape.radius = 52.0
	bcol.shape = bshape
	blocker.add_child(bcol)
	main.world_layer.add_child(blocker)
	main.set_navigation_destination(Vector2(620.0, 0.0))
	assert(main.navigation_active, "Auto-Nav should start toward point behind obstacle")
	for _blk in 110:
		await physics_frame
		if not main.navigation_active:
			break
	assert(not main.navigation_active, "Deadlock against obstacle must mark Auto-Nav failed and cancel navigation_active")
	assert(main.nav_fail_banner_timer > 0.0, "Deadlock failure must set failure banner state")
	assert(main.player.linear_velocity.length() < 45.0, "Deadlock failure must stop ship movement")
	blocker.queue_free()
	main.nav_fail_banner_timer = 0.0
	main.player.global_position = Vector2.ZERO
	main.player.linear_velocity = Vector2.ZERO
	main.player.angular_velocity = 0.0

	# Regression test: Landscape <-> Portrait screen orientation toggle button
	assert(main.mode_switcher != null and main.mode_switcher.orientation_btn != null, "ModeSwitcher must expose orientation toggle button")
	assert(not ModeSwitcher.is_portrait_mode, "Default screen orientation must be Landscape")
	assert(main.mode_switcher.toggle_orientation(), "Toggling orientation must switch to Portrait")
	assert(ModeSwitcher.is_portrait_mode and root.content_scale_size == Vector2i(720, 1280), "Portrait mode must set 720x1280 content_scale_size")
	assert(not main.mode_switcher.toggle_orientation(), "Toggling again must switch back to Landscape")
	assert(not ModeSwitcher.is_portrait_mode and root.content_scale_size == Vector2i(1280, 720), "Landscape mode must restore 1280x720 content_scale_size")
	var before_parts: int = main.player.model.parts.size()
	main.quick_attach_module()
	assert(main.player.model.parts.size() == before_parts, "In-combat quick_attach must be disabled")
	assert(main.player.model.core_part().max_hp >= 400.0, "Player core durability must be doubled (>= 400)")
	var armor_spec: Dictionary = Balance.module_spec("armor")
	assert(float(armor_spec.hp) >= 36.0, "Module durability must be doubled (armor >= 36)")
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

	# 8. Sonar Pulse: circular map illumination, mutual ship detection, hostile -> attack mode, result popup
	lab.reset_arena()
	assert(not lab.targets[1].is_attacking_player(), "Hostile tug ship should start out of attack mode before sonar")
	assert(not lab.targets[0].is_attacking_player(), "Neutral light drone should start out of attack mode")
	lab.grapple_config["sonar_range"] = 900.0
	lab.trigger_sonar_pulse()
	assert(lab.active_sonar != null and lab.active_sonar.expanding, "Sonar pulse must start expanding")
	for _s in 60:
		await physics_frame
	assert(lab.active_sonar != null and lab.active_sonar.completed, "Sonar wave should complete expansion to max range")
	assert(lab.targets[1].is_attacking_player(), "Hostile tug ship must enter attack mode when detected by sonar")
	assert(lab.targets[3].is_attacking_player(), "Hostile shooter ship must enter attack mode when detected by sonar")
	assert(not lab.targets[0].is_attacking_player(), "Neutral light drone must remain non-hostile after sonar")
	assert(lab.targets[1].sonar_detected_peers.size() >= 2, "Ships inside sonar wave must mutually detect player and peer ships")
	assert(lab.active_sonar.mutual_detections.size() >= 4, "Sonar must record mutual detection pairs between ships")
	assert(lab.sonar_popup != null and lab.sonar_popup.is_showing(), "Sonar result message window must pop up upon scan completion")

	# 9. Mobile Touch: Tap-to-move, Target drag angle/distance tracking, Touch buttons
	lab.reset_arena()
	lab.navigation_target = Vector2(300.0, -300.0)
	lab.navigation_active = true
	var start_pos := lab.player.global_position
	for _n in 25:
		await physics_frame
	assert(lab.player.global_position.distance_to(lab.navigation_target) < start_pos.distance_to(lab.navigation_target) - 2.0, "Tap-to-move auto navigation must steer ship toward destination")

	var track_ship := lab.targets[0]
	lab.tracking_order.begin(track_ship, lab.player.global_position, lab.player.hull_bound_radius + 24.0)
	lab.tracking_order.update_pointer(track_ship.global_position + Vector2(0.0, -260.0))
	assert(lab.tracking_order.commit(), "Target angle/distance tracking must commit")
	lab.navigation_active = false
	for _t in 20:
		await physics_frame
	assert(lab.tracking_order.active and lab.tracking_order.valid(), "Target tracking must remain active maintaining angle and distance")
	assert(lab._touch_bar != null and lab._touch_bar.visible, "Mobile touch control bar must be visible")
	lab.cancel_navigation_and_tracking()
	assert(not lab.navigation_active and not lab.tracking_order.active, "Cancel button must stop auto-nav and target tracking")
	assert(lab.mode_switcher != null and lab.mode_switcher.active_mode_id == "grapple", "ModeSwitcher must be mounted on GrappleTestMap")

	# 10. SonarTestMap & BuildMode & Landscape Full-Bleed defaults
	assert(str(ProjectSettings.get_setting("display/window/stretch/aspect")) == "expand", "Landscape full-bleed stretch aspect must be expand")
	assert(int(ProjectSettings.get_setting("display/window/handheld/orientation")) in [0, 4], "Handheld orientation must be locked to landscape")

	lab.queue_free()
	await process_frame
	var SonarScene := load("res://scenes/sonar_test_map.tscn") as PackedScene
	assert(SonarScene != null, "SonarTestMap scene must load")
	var sonar_map := SonarScene.instantiate() as SonarTestMap
	root.add_child(sonar_map)
	for _sm in 4:
		await process_frame
	assert(sonar_map.ships.size() == 6, "SonarTestMap should spawn 6 ships")
	assert(sonar_map.mode_switcher != null and sonar_map.mode_switcher.active_mode_id == "sonar", "ModeSwitcher must be mounted on SonarTestMap")
	sonar_map.trigger_sonar_pulse()
	assert(sonar_map.active_sonar != null and sonar_map.active_sonar.expanding, "SonarTestMap must launch sonar pulse")

	sonar_map.queue_free()
	await process_frame
	var BuildScene := load("res://scenes/build_mode.tscn") as PackedScene
	assert(BuildScene != null, "BuildMode scene must load")
	var builder := BuildScene.instantiate() as BuildMode
	root.add_child(builder)
	for _bm in 4:
		await process_frame
	assert(builder.mode_switcher != null and builder.mode_switcher.active_mode_id == "build", "ModeSwitcher must be mounted on BuildMode")
	assert(CosmoteerAssets.ensure_loaded(), "Cosmoteer bundled atlas must load")
	assert(CosmoteerAssets.part_count() >= 19, "Cosmoteer atlas must expose weapon/part textures")
	assert(CosmoteerAssets.get_part_texture("cosmo_heavy_laser") != null, "Cosmoteer heavy laser sprite must resolve")
	assert(CosmoteerAssets.get_part_texture("cosmo_cannon_deck") != null, "Cosmoteer deck cannon sprite must resolve")
	assert(builder.part_preview != null, "BuildMode must render a live part preview widget")
	assert(builder.big_rotate_btn != null and builder.big_rotate_btn.custom_minimum_size.y >= 80.0, "BuildMode must provide a large rotate button")
	assert(builder.floating_rotate_btn != null and builder.floating_rotate_btn.custom_minimum_size.y >= 56.0, "BuildMode must provide a large floating rotate button")

	# Test Symmetry Mode OFF -> attach single Cosmoteer weapon
	builder.symmetry_enabled = false
	var before_build_parts := builder.player.model.parts.size()
	builder.select_part_kind("cosmo_disruptor")
	builder.rotate_part()
	assert(builder.quarter_turn == 1, "Rotate button must rotate selected part by 90 degrees")
	var probe_bm := builder.player.model.make_part("cosmo_disruptor", Vector2i.ZERO, builder.quarter_turn)
	var cand := builder.player.model.attachment_candidates(probe_bm)
	assert(not cand.is_empty(), "BuildMode must expose valid attachment sockets")
	var target_world := builder.player.to_global(Vector2(cand[0]) * Balance.CELL)
	assert(builder.try_interact_world(target_world, false, true), "BuildMode must attach Cosmoteer weapon at tapped socket")
	assert(builder.player.model.parts.size() == before_build_parts + 1, "Part count must increase by 1 with symmetry OFF")
	assert(ShipModel.saved_player_blueprint.size() == before_build_parts + 1, "BuildMode attach must persist ship blueprint")

	# Test Cosmoteer weapon firing
	builder.player.laser_cooldown = 0.0
	builder.player.heat = 0.0
	var cosmo_shots := builder.player.fire_primary_weapons(Vector2(0.0, -500.0))
	var has_disruptor_shot := false
	for sh in cosmo_shots:
		if str(sh.get("kind", "")) == "cosmo_disruptor":
			has_disruptor_shot = true
	assert(has_disruptor_shot, "Installed Cosmoteer weapon must fire via fire_primary_weapons")

	# Test Symmetry Mode ON -> attaches mirrored pair (+2 parts)
	builder.reset_ship()
	builder.symmetry_enabled = true
	var before_sym := builder.player.model.parts.size()
	builder.select_part_kind("cosmo_pd")
	var sym_world := builder.player.to_global(Vector2(1, 2) * Balance.CELL)
	assert(builder.try_interact_world(sym_world, false, true), "Symmetry attach at (1, 2) must succeed")
	assert(builder.player.model.parts.size() == before_sym + 2, "Symmetry ON must attach both primary and mirrored part (+2)")

	# Test 45-degree diagonal tilt toggle + Undo/Redo
	builder.toggle_diagonal_45()
	assert(builder.player.model.diagonal_45 and ShipModel.saved_diagonal_45, "45-degree tilt toggle must enable diagonal hull and persist")
	assert(is_equal_approx(builder.player.rotation, -PI * 0.25), "45-degree tilt must rotate hull +45 degrees in BuildMode")
	assert(builder.undo(), "Undo must revert 45-degree toggle")
	assert(not builder.player.model.diagonal_45, "Undo must restore 0-degree orientation")
	assert(builder.undo(), "Second Undo must revert symmetric attachment (+2 parts)")
	assert(builder.player.model.parts.size() == before_sym, "Undo must restore exact part count before symmetric attach")
	assert(builder.redo(), "Redo must re-apply symmetric attachment (+2 parts)")
	assert(builder.player.model.parts.size() == before_sym + 2, "Redo must restore +2 symmetric parts")
	assert(builder.redo(), "Second Redo must re-apply 45-degree tilt")
	assert(builder.player.model.diagonal_45, "Redo must restore 45-degree tilt")

	# Verify scrollbar-less FlickScrollContainer
	assert(builder.palette_scroll != null and builder.palette_scroll.vertical_scroll_mode == ScrollContainer.SCROLL_MODE_SHOW_NEVER, "Palette scroll must hide scrollbar for touch flick")

	# Verify Blueprint Presets (zero overlaps) + Save/Load Slots
	for preset in BlueprintLibrary.get_presets():
		var pid := str(preset.get("id", ""))
		assert(builder.load_preset(pid), "Preset must load cleanly: " + pid)
		var seen_cells := {}
		for part in builder.player.model.parts:
			for c in part.cells():
				assert(not seen_cells.has(c), "Preset %s has overlapping cell %s" % [pid, str(c)])
				seen_cells[c] = part.kind
	assert(builder.load_preset("diamond_45"), "diamond_45 preset must load")
	assert(builder.player.model.diagonal_45, "diamond_45 preset must activate 45-degree mode")
	var diamond_count := builder.player.model.parts.size()
	builder.save_blueprint_slot(1, "테스트45")
	builder.reset_ship()
	assert(not builder.player.model.diagonal_45 and builder.player.model.parts.size() == 15, "Reset ship must return to 15-part 0-deg ship")
	assert(builder.load_blueprint_slot(1), "Saved blueprint slot 1 must load")
	assert(builder.player.model.diagonal_45 and builder.player.model.parts.size() == diamond_count, "Loaded slot 1 must match saved 45-deg ship")
	BlueprintLibrary.delete_slot(1)

	# Verify Cosmoteer Part Catalog enable/disable editor persistence
	PartCatalog.reset_defaults()
	var base_enabled := PartCatalog.enabled_count()
	assert(PartCatalog.ENTRIES.size() >= 45, "PartCatalog must expose comprehensive Cosmoteer buildable parts")
	assert(not PartCatalog.toggle_enabled("cosmo_heavy_laser"), "Toggling cosmo_heavy_laser must disable it")
	assert(PartCatalog.enabled_count() == base_enabled - 1, "Disabling a part must decrement enabled_count")
	assert(PartCatalog.toggle_enabled("cosmo_heavy_laser"), "Toggling again must re-enable cosmo_heavy_laser")
	PartCatalog.reset_defaults()

	# Verify repair_all() restores destroyed modules back to BuildMode blueprint
	var expected_after_sym := builder.player.model.parts.size()
	var lost_part: PartData = builder.player.model.parts[builder.player.model.parts.size() - 1]
	builder.player.model.remove(lost_part.uid)
	assert(builder.player.model.parts.size() == expected_after_sym - 1, "Removing a module simulates battle loss")
	builder.player.repair_all()
	assert(builder.player.model.parts.size() == expected_after_sym, "repair_all() must restore missing modules from BuildMode blueprint")

	# 10. Exhaustive Zero-Clip UI Bounds Audit across Landscape (1280x720), Portrait (720x1280), and Ultra-Narrow Portrait (580x1280)
	for test_vp in [Vector2i(1280, 720), Vector2i(720, 1280), Vector2i(580, 1280)]:
		var is_port: bool = test_vp.x < test_vp.y
		builder.mode_switcher.apply_orientation(is_port, false)
		root.size = test_vp
		root.content_scale_size = test_vp
		builder.mode_switcher._sync_dock_placement()
		builder._sync_responsive_layout()
		for _w in 2:
			await process_frame
		var vp_rect := root.get_visible_rect()
		# Check BuildMode default + all 3 upward drawers + both modals + ModeSwitcher popup
		for d_id in ["", "parts", "tools", "manage"]:
			builder.set_open_drawer(d_id)
			await process_frame
			_assert_panels_inside_viewport(builder, vp_rect, "BuildMode(%s,%s)" % [str(test_vp), d_id])
		builder.set_open_drawer("")
		builder.open_blueprint_modal()
		await process_frame
		_assert_panels_inside_viewport(builder, vp_rect, "BuildMode.BlueprintModal(%s)" % str(test_vp))
		builder.open_catalog_modal()
		await process_frame
		_assert_panels_inside_viewport(builder, vp_rect, "BuildMode.CatalogModal(%s)" % str(test_vp))
		builder.close_modals()
		builder.mode_switcher.set_expanded(true)
		await process_frame
		_assert_panels_inside_viewport(builder, vp_rect, "BuildMode.ModePopup(%s)" % str(test_vp))
		builder.mode_switcher.set_expanded(false)

	# Also audit Main, GrappleTestMap, and SonarTestMap in Narrow Portrait (580x1280)
	builder.queue_free()
	await process_frame

	var main_audit := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(main_audit)
	main_audit.mode_switcher.apply_orientation(true, false)
	root.size = Vector2i(580, 1280)
	root.content_scale_size = Vector2i(580, 1280)
	main_audit.mode_switcher._sync_dock_placement()
	for _ma in 2: await process_frame
	var m_vp := root.get_visible_rect()
	for wr in main_audit.hud.weapon_button_rects():
		_assert_rect_inside(wr.rect, m_vp, "Main.WeaponBtn(580x1280)")
	_assert_rect_inside(main_audit.hud.flight_dpad_bounds(), m_vp, "Main.FlightDpad(580x1280)")
	for grp in ["tactical", "ship"]:
		main_audit.hud.open_group = grp
		for ir in main_audit.hud.expanded_group_item_rects():
			_assert_rect_inside(ir.rect, m_vp, "Main.HudDrawer(%s)" % grp)
	main_audit.hud.open_group = ""
	_assert_rect_inside(main_audit.dialogue.panel_rect(), m_vp, "Main.Dialogue(580x1280)")
	main_audit.sonar_popup.show_report({"ships": [], "stations": [], "mutual_pairs": [], "range": 2600.0})
	await process_frame
	_assert_panels_inside_viewport(main_audit, m_vp, "Main.SonarPopup(580x1280)")
	main_audit.queue_free()
	await process_frame

	var grapple_audit := (load("res://scenes/grapple_test_map.tscn") as PackedScene).instantiate()
	root.add_child(grapple_audit)
	grapple_audit.mode_switcher.apply_orientation(true, false)
	root.size = Vector2i(580, 1280)
	root.content_scale_size = Vector2i(580, 1280)
	grapple_audit.mode_switcher._sync_dock_placement()
	grapple_audit._sync_grapple_layout()
	for _ga in 2: await process_frame
	_assert_panels_inside_viewport(grapple_audit, root.get_visible_rect(), "GrappleTestMap(580x1280)")
	grapple_audit.queue_free()
	await process_frame

	var sonar_audit := (load("res://scenes/sonar_test_map.tscn") as PackedScene).instantiate()
	root.add_child(sonar_audit)
	sonar_audit.mode_switcher.apply_orientation(true, false)
	root.size = Vector2i(580, 1280)
	root.content_scale_size = Vector2i(580, 1280)
	sonar_audit.mode_switcher._sync_dock_placement()
	sonar_audit._sync_sonar_layout()
	sonar_audit.sonar_popup.show_report({"ships": [], "stations": [], "mutual_pairs": [], "range": 2400.0})
	for _sa in 2: await process_frame
	_assert_panels_inside_viewport(sonar_audit, root.get_visible_rect(), "SonarTestMap(580x1280)")
	sonar_audit.mode_switcher.apply_orientation(false, true)
	sonar_audit.queue_free()
	await process_frame

	# 11. Cosmoteer 실험 조종석 & 무기 일람표 모드 + 데이터/SFX/오버라이드 실전투 연동 검증
	assert(CosmoteerSfx.bundled_sfx_count() == 17, "Must load all 17 bundled Cosmoteer WAV SFX streams")
	var w_roster := CosmoteerWeaponData.get_roster()
	assert(w_roster.size() == 18, "Cosmoteer Weapon Roster must expose all 18 weapons")
	CosmoteerWeaponData.clear_weapon_override()

	var base_laser_dmg := float(Balance.weapon_spec("laser").get("damage", 7.0))
	var w_mode := (load("res://scenes/weapon_roster_mode.tscn") as PackedScene).instantiate()
	root.add_child(w_mode)
	for _wm in 2: await process_frame
	assert(w_mode.visible_roster.size() == 18, "WeaponRosterMode must render 18 roster items")
	w_mode.select_weapon_index(0) # 소형 레이저 -> cf_kind = "laser"
	w_mode.arena.step_demo(1.6)
	assert(w_mode.arena.shots_fired > 0, "WeaponDemoArena must fire live demo shots")
	var orig_demo_dmg := float(w_mode.selected_entry.defaults.damage)
	w_mode._on_slider_changed(orig_demo_dmg * 2.0, "damage", "%.0f")
	w_mode._apply_to_battle()
	var boosted_laser_dmg := float(Balance.weapon_spec("laser").get("damage", 7.0))
	assert(boosted_laser_dmg > base_laser_dmg * 1.8, "Applying weapon override in WeaponRosterMode must scale live Balance.weapon_spec damage")
	# Test beam & PD & tractor modes in WeaponDemoArena
	for test_idx in [3, 9, 15, 16]:
		w_mode.select_weapon_index(test_idx)
		w_mode.arena.step_demo(0.8)
	w_mode.select_weapon_index(0)
	w_mode._reset_current_params()
	assert(absf(float(Balance.weapon_spec("laser").get("damage", 7.0)) - base_laser_dmg) < 0.05, "Resetting weapon params must restore default Balance.weapon_spec")

	for test_vp in [Vector2i(1280, 720), Vector2i(720, 1280), Vector2i(580, 1280)]:
		var is_p: bool = test_vp.x < test_vp.y
		w_mode.mode_switcher.apply_orientation(is_p, false)
		root.size = test_vp
		root.content_scale_size = test_vp
		w_mode.mode_switcher._sync_dock_placement()
		w_mode._sync_responsive_layout()
		for _wrf in 2: await process_frame
		_assert_panels_inside_viewport(w_mode, root.get_visible_rect(), "WeaponRosterMode(%s)" % str(test_vp))
		w_mode.mode_switcher.set_expanded(true)
		await process_frame
		_assert_panels_inside_viewport(w_mode, root.get_visible_rect(), "WeaponRosterMode.Popup(%s)" % str(test_vp))
		w_mode.mode_switcher.set_expanded(false)
	w_mode.queue_free()
	await process_frame

	var c_mode := (load("res://scenes/cockpit_lab_mode.tscn") as PackedScene).instantiate()
	root.add_child(c_mode)
	for _cm in 2: await process_frame
	assert(c_mode.sim.load_error.is_empty(), "CockpitLabMode PowerRangeSim must load Cosmoteer catalog.json without errors")
	c_mode.sim.step(6.5)
	assert(c_mode.sim.deliveries > 0 and c_mode.sim.shots > 0 and c_mode.sim.hits > 0, "CockpitLabMode simulation must transport batteries, fire laser, and hit armor target")
	assert(c_mode.sim.armor_hp < c_mode.sim.armor_max_hp, "CockpitLabMode target armor must take damage")
	for test_vp in [Vector2i(1280, 720), Vector2i(720, 1280), Vector2i(580, 1280)]:
		var is_p: bool = test_vp.x < test_vp.y
		c_mode.mode_switcher.apply_orientation(is_p, false)
		root.size = test_vp
		root.content_scale_size = test_vp
		c_mode.mode_switcher._sync_dock_placement()
		c_mode._sync_responsive_layout()
		for _crf in 2: await process_frame
		_assert_panels_inside_viewport(c_mode, root.get_visible_rect(), "CockpitLabMode(%s)" % str(test_vp))
		c_mode.mode_switcher.set_expanded(true)
		await process_frame
		_assert_panels_inside_viewport(c_mode, root.get_visible_rect(), "CockpitLabMode.Popup(%s)" % str(test_vp))
		c_mode.mode_switcher.set_expanded(false)
	c_mode.mode_switcher.apply_orientation(false, true)
	c_mode.queue_free()
	await process_frame

	# 12. ONI 전력망 + FTL 승조원 에셋/백병전 + ONI 건설/수리 + 코스모티어 복도 전용 이동 통합 검증
	assert(FtlCrewAssets.loaded_sheet_count() >= 9, "Must load authentic FTL crew sprite sheets (human, engi, mantis, rock, zoltan, etc.)")

	var ic_mode := (load("res://scenes/interior_command_mode.tscn") as PackedScene).instantiate() as InteriorCommandMode
	root.add_child(ic_mode)
	for _ic in 2: await process_frame
	var isim: ShipInteriorSim = ic_mode.sim
	assert(isim != null and isim.crew.size() >= 4, "InteriorCommandMode must spawn starter FTL crew squad")
	assert(isim.power_produced_w > 1500.0 and not isim.circuit_overloaded, "Default 2kW flagship power grid must supply full load without overload")

	# 12a. Cosmoteer Corridor-Only Movement & Conveyor Directional Speed
	var path_ok := isim.find_corridor_path(Vector2i.ZERO, Vector2i(3, 0))
	assert(not path_ok.is_empty(), "Corridor spine (0,0)->(1,0)->(2,0)->(3,0) must connect core to bow shield")
	assert(isim.crew_cell_speed_mult(Vector2i(-1, 0), Vector2i.RIGHT) > 1.8, "Conveyor forward direction must boost crew speed 2x")
	assert(isim.crew_cell_speed_mult(Vector2i(-1, 0), Vector2i.LEFT) < 0.4, "Conveyor reverse direction must slow crew speed")
	# Sever corridor at (2,0) -> (3,0) shield has NO corridor path even if adjacent to laser (2,-1)!
	var cor_part := ic_mode.ship_model.part_at(Vector2i(2, 0))
	assert(cor_part != null and cor_part.kind == "cosmo_corridor", "Expected corridor at (2,0)")
	ic_mode.ship_model.remove(cor_part.uid)
	var path_blocked := isim.find_corridor_path(Vector2i.ZERO, Vector2i(3, 0))
	assert(path_blocked.is_empty(), "Without corridor at (2,0), crew MUST NOT cross through non-corridor weapon rooms to (3,0)")

	# 12b. ONI Crew Construction (rebuild corridor at (2,0) via ONI build ghost!)
	assert(isim.order_build_module("cosmo_corridor", Vector2i(2, 0), 0, 9), "Ordering ONI corridor construction ghost at (2,0) must succeed")
	for _bs in 45:
		isim.step(0.1)
	assert(ic_mode.ship_model.part_at(Vector2i(2, 0)) != null, "FTL Engi/crew must walk along corridor and complete ONI construction of (2,0)")
	assert(not isim.find_corridor_path(Vector2i.ZERO, Vector2i(3, 0)).is_empty(), "Rebuilt corridor must restore path to (3,0)")

	# 12c. 1-Way Directed Energy Pipeline (과부하 파괴 스펙아웃 검증 + 1방향 역류 차단 + 배관 철거/복구 검증)
	isim.set_wire(Vector2i(0, 0), 1)
	isim.set_wire(Vector2i(1, 0), 1)
	for _no_ov in 20:
		isim.step_power_grid(0.1)
	assert(not isim.circuit_overloaded and isim.wires_destroyed_count == 0 and float(isim.wire_hp.get(Vector2i(1, 0), 0.0)) == 100.0,
		"Overload damage/destruction is spec-out: small Tier-1 energy pipe under >1,200W load must NEVER take overload damage")
	var sh_part := ic_mode.ship_model.part_at(Vector2i(3, 0))
	# Reverse 1-way flow arrow at (2,0) to LEFT (pointing backward toward reactor) -> downstream bow shield (3,0) must lose power!
	assert(isim.set_energy_pipe_dir(Vector2i(2, 0), Vector2i.LEFT), "Must allow setting manual 1-way pipe direction")
	isim.step_power_grid(0.1)
	assert(sh_part != null and not isim.is_part_powered(sh_part.uid),
		"1-way energy pipe reversed to LEFT at (2,0) must block forward flow and put bow shield (3,0) in NO_POWER")
	# Sever pipe completely on shield (3,0),(4,0) -> verify NO_POWER, then restore 1-way pipes
	isim.set_wire(Vector2i(3, 0), 0)
	isim.set_wire(Vector2i(4, 0), 0)
	isim.step_power_grid(0.1)
	assert(not isim.is_part_powered(sh_part.uid), "Unpiped consumer module must enter NO_POWER state")
	isim.auto_wire_all_parts(2)
	isim.step_power_grid(0.1)
	assert(isim.is_part_powered(sh_part.uid), "Restoring forward 1-way energy pipes must restore power to shield")

	# 12d. FTL Boarding Hand-to-Hand Crew Combat & ONI Module Repair
	sh_part.hp = sh_part.max_hp * 0.5
	var boarder := isim.spawn_enemy_boarder("mantis", Vector2i.ZERO)
	assert(not boarder.is_empty(), "Enemy FTL Mantis boarder must spawn")
	for _cs in 90:
		isim.step(0.1)
	var any_hostile_left := false
	for cm in isim.crew:
		if not bool(cm.is_friendly) and float(cm.hp) > 0.0:
			any_hostile_left = true
	assert(not any_hostile_left, "Friendly FTL crew squad must defeat enemy boarder in hand-to-hand room combat")
	assert(sh_part.hp > sh_part.max_hp * 0.95, "Friendly crew must travel via corridors and complete ONI repair on damaged shield")

	# 12e. Zero-Clip UI Bounds Audit on InteriorCommandMode across Landscape, Portrait, and 580x1280
	for test_vp in [Vector2i(1280, 720), Vector2i(720, 1280), Vector2i(580, 1280)]:
		var is_p: bool = test_vp.x < test_vp.y
		ic_mode.mode_switcher.apply_orientation(is_p, false)
		root.size = test_vp
		root.content_scale_size = test_vp
		ic_mode.mode_switcher._sync_dock_placement()
		ic_mode._sync_responsive_layout()
		for _icf in 2: await process_frame
		_assert_panels_inside_viewport(ic_mode, root.get_visible_rect(), "InteriorCommandMode(%s)" % str(test_vp))
		ic_mode.mode_switcher.set_expanded(true)
		await process_frame
		_assert_panels_inside_viewport(ic_mode, root.get_visible_rect(), "InteriorCommandMode.Popup(%s)" % str(test_vp))
		ic_mode.mode_switcher.set_expanded(false)

	# 13. 초대형 드레드노트 프리셋 + ONI 다중 회로 굵기 효율화(재료비/설치시간 절감) + 서킷 과부하 파괴 검증
	ic_mode.load_ship_preset("colossal_dreadnought")
	for _cd in 2: await process_frame
	var csim: ShipInteriorSim = ic_mode.sim
	assert(ic_mode.ship_model.parts.size() >= 55, "Colossal Dreadnought preset must load >= 55 non-overlapping parts")
	assert(csim.circuits.size() == 4, "Colossal Dreadnought must run exactly 4 independent ONI circuits (20kW + 2kW + 2kW + 1kW)")
	assert(not csim.circuit_overloaded, "Optimized Colossal Dreadnought multi-gauge wiring must have zero overload")
	for cp in ic_mode.ship_model.parts:
		assert(csim.is_part_powered(cp.uid), "All Colossal Dreadnought modules must be powered (zero NO_POWER), failed on %s" % cp.kind)
	var cwstats := csim.get_wiring_efficiency_stats()
	assert(int(cwstats.tier1_cells) > 0 and int(cwstats.tier2_cells) > 0 and int(cwstats.tier3_cells) > 0,
		"Colossal Dreadnought must use all 3 ONI wire gauges (1kW / 2kW / 20kW) where appropriate")
	assert(float(cwstats.metal_saved_pct) >= 50.0 and float(cwstats.time_saved_pct) >= 50.0,
		"Optimized multi-gauge wiring must save >= 50% metal cost & build time vs all-20kW")
	# Corridor connectivity across all 4 colossal decks (bow shield, port wing, starboard wing, stern medbay)
	assert(not csim.find_corridor_path(Vector2i.ZERO, Vector2i(4, -2)).is_empty(), "Corridor must reach bow large shield")
	assert(not csim.find_corridor_path(Vector2i.ZERO, Vector2i(1, -4)).is_empty(), "Corridor must reach port wing heavy laser")
	assert(not csim.find_corridor_path(Vector2i.ZERO, Vector2i(1, 4)).is_empty(), "Corridor must reach starboard wing heavy laser")
	assert(not csim.find_corridor_path(Vector2i.ZERO, Vector2i(-6, -2)).is_empty(), "Corridor must reach stern crew quarters")
	# Attack Damage Energy Pipe Destruction (과부하 파괴 없음 + 공격 피격 데미지로 배관 파괴 가능 검증!)
	csim.set_wire(Vector2i(3, 0), 1)
	for _no_ov2 in 20:
		csim.step_power_grid(0.1)
	assert(csim.wires.has(Vector2i(3, 0)) and csim.wires_destroyed_count == 0,
		"Tier-1 energy pipe on 3560W spine must NEVER break from load overload")
	# Now inflict combat attack damage onto spine cell (3,0) -> pipe shatters!
	var destroyed_pipes := csim.damage_energy_pipe_at(Vector2i(3, 0), 95.0)
	csim.step_power_grid(0.1)
	assert(destroyed_pipes >= 1 and csim.wires_destroyed_count >= 1,
		"Attack damage must destroy energy pipe when pipe HP reaches 0")
	assert(not csim.wires.has(Vector2i(3, 0)) and csim.destroyed_wire_cells.has(Vector2i(3, 0)),
		"Attack-destroyed energy pipe must be removed from active pipes and leave scorch mark")
	var bow_sh: PartData = ic_mode.ship_model.part_at(Vector2i(4, -2))
	assert(bow_sh != null and not csim.is_part_powered(bow_sh.uid),
		"Severed 1-way spine after attack pipe destruction must cut power (NO_POWER) to downstream bow shield")
	# Reconnect & optimize pipe gauges
	csim.set_wire(Vector2i(3, 0), 3)
	var opt_stats := csim.optimize_wire_gauges()
	assert(csim.is_part_powered(bow_sh.uid) and float(opt_stats.metal_saved_pct) >= 50.0,
		"Repairing pipe & optimize_wire_gauges() must restore 1-way power with >= 50% material savings")

	# 14. ONI 냉각 파이프/냉매 흐름 + 승조원 탄약·미사일 수송 + 코스모티어 원자로 대폭발 + 격벽·방화벽 기체/침투 차단 검증
	ic_mode.load_ship_preset("colossal_dreadnought")
	for _s14 in 2: await process_frame
	csim = ic_mode.sim

	# 14a. ONI Cooling Pipes, Liquid Cooler & Animated Coolant Flow Heat Exchange
	assert(not csim.cooling_pipes.is_empty() and csim.active_cooler_count >= 1,
		"Colossal Dreadnought must initialize ONI cooling pipe loop with active cooler/radiator")
	var lrg_reactor: PartData = ic_mode.ship_model.part_at(Vector2i(-2, 0))
	assert(lrg_reactor != null and lrg_reactor.kind == "cosmo_reactor_large", "Expected Large Reactor at (-2,0)")
	csim.part_temp_c[lrg_reactor.uid] = 88.0
	for _ct in 25:
		csim.step(0.1)
	assert(csim.coolant_packets.size() > 0, "ONI cooling loop must spawn animated coolant flow packets")
	assert(float(csim.part_temp_c[lrg_reactor.uid]) < 78.0, "Flowing ONI coolant packets must absorb heat and cool down hot reactor")

	# 14b. Crew Physical Ammo & Missile Hauling (Electricity NEVER refills ballistic/missile weapons!)
	var drained_cnt := csim.drain_all_weapon_mags()
	assert(drained_cnt >= 2, "Colossal Dreadnought must have ballistic & missile weapons requiring physical resupply")
	var mg_part: PartData = ic_mode.ship_model.part_at(Vector2i(3, -1))
	assert(mg_part != null and not csim.consume_weapon_mag(mg_part.uid, 1), "Empty ballistic weapon magazine must block firing despite full 20kW power")
	for _ht in 75:
		csim.step(0.1)
	assert(csim.ammo_deliveries >= 1, "FTL crew must walk to ammo/bullet depot via corridors and physically deliver consumables to weapon")

	# 14c. Grid-Edge Bulkheads & Firewalls: Biochemical Gas Containment & Enemy Boarder Movement Control
	csim.set_all_doors_locked(true)
	# Port wing entrance has sealed Blast Doors at (0,-1):(0,-2) and (0,-2):(0,-3) + wing seam Firewalls
	csim.inject_biochemical_gas(Vector2i(0, -3), 98.0)
	for _gt in 20:
		csim.step(0.1)
	if float(csim.bio_gas.get(Vector2i(1, -3), 0.0)) <= 15.0:
		printerr("FAIL 14c gas(1,-3)=%f" % float(csim.bio_gas.get(Vector2i(1, -3), 0.0)))
		quit(1); return
	if float(csim.bio_gas.get(Vector2i(0, -2), 0.0)) > 0.01 or float(csim.bio_gas.get(Vector2i(0, 0), 0.0)) > 0.01:
		printerr("FAIL 14c leak gas(0,-2)=%f gas(0,0)=%f" % [float(csim.bio_gas.get(Vector2i(0, -2), 0.0)), float(csim.bio_gas.get(Vector2i(0, 0), 0.0))])
		quit(1); return
	var wing_boarder := csim.spawn_enemy_boarder("mantis", Vector2i(0, -3))
	var door_ekey := ShipInteriorSim.edge_key(Vector2i(0, -2), Vector2i(0, -3))
	var door_hp_before := float(csim.bulkheads[door_ekey].hp)
	for _bt in 12:
		csim.step(0.1)
	if (wing_boarder.cell as Vector2i).y > -3:
		printerr("FAIL 14c boarder crossed locked door cell=%s" % str(wing_boarder.cell))
		quit(1); return
	if not (float(csim.bulkheads[door_ekey].hp) < door_hp_before or float(wing_boarder.hp) < 100.0):
		printerr("FAIL 14c boarder doorhp=%f hp=%f" % [float(csim.bulkheads[door_ekey].hp), float(wing_boarder.hp)])
		quit(1); return

	# 14d. Cosmoteer Catastrophic Reactor Explosion & Firewall Blast Attenuation
	var port_reactor: PartData = ic_mode.ship_model.part_at(Vector2i(-3, -4))
	var parts_before_blast := ic_mode.ship_model.parts.size()
	var blast_res := csim.detonate_reactor(port_reactor.uid)
	if csim.reactor_explosions_count < 1 or int(blast_res.get("destroyed", 0)) < 2 or ic_mode.ship_model.parts.size() >= parts_before_blast - 2:
		printerr("FAIL 14d reactor blast=%s" % str(blast_res))
		quit(1); return
	if csim.edge_blast_mult(Vector2i(-2, 0), Vector2i(-2, 1)) >= 0.4:
		printerr("FAIL 14d firewall mult=%f" % csim.edge_blast_mult(Vector2i(-2, 0), Vector2i(-2, 1)))
		quit(1); return

	# 14e. Zero-Clip UI Bounds Audit with all new buttons & dashboard across Landscape, Portrait & 580x1280
	ic_mode.load_ship_preset("colossal_dreadnought")
	for test_vp in [Vector2i(1280, 720), Vector2i(720, 1280), Vector2i(580, 1280)]:
		var is_p: bool = test_vp.x < test_vp.y
		ic_mode.mode_switcher.apply_orientation(is_p, false)
		root.size = test_vp
		root.content_scale_size = test_vp
		ic_mode.mode_switcher._sync_dock_placement()
		ic_mode._sync_responsive_layout()
		for _s14f in 2: await process_frame
		_assert_panels_inside_viewport(ic_mode, root.get_visible_rect(), "InteriorCommandMode.V16(%s)" % str(test_vp))

	ic_mode.mode_switcher.apply_orientation(false, true)
	ic_mode.queue_free()
	await process_frame

	# 15. 빌드모드 줌 확장 + 초대형 4종 / 1.5배 초거대 2종 프리셋 + 무기일람 타겟거리 + 추진기 연료·전력·발열 실험실 검증
	var all_presets := BlueprintLibrary.get_presets()
	if all_presets.size() != 13:
		printerr("FAIL 15 preset count=%d" % all_presets.size()); quit(1); return

	var bm_zoom := (load("res://scenes/build_mode.tscn") as PackedScene).instantiate() as BuildMode
	root.add_child(bm_zoom)
	for _bz in 2: await process_frame
	for extra_pid in [
		"colossal_carrier_bastion",
		"colossal_ion_cathedral",
		"colossal_broadside_titan",
		"colossal_siege_ram",
		"super_leviathan_15x",
		"super_behemoth_15x",
	]:
		if not bm_zoom.load_preset(extra_pid):
			printerr("FAIL 15 load_preset %s" % extra_pid); quit(1); return
		var detached := bm_zoom.player.model.detach_disconnected()
		if not detached.is_empty():
			printerr("FAIL 15 %s detached=%d" % [extra_pid, detached.size()]); quit(1); return
		var pcnt := bm_zoom.player.model.parts.size()
		if extra_pid.begins_with("super_") and pcnt < 105:
			printerr("FAIL 15 super %s parts=%d (<105)" % [extra_pid, pcnt]); quit(1); return
		elif not extra_pid.begins_with("super_") and pcnt < 60:
			printerr("FAIL 15 colossal %s parts=%d (<60)" % [extra_pid, pcnt]); quit(1); return
	bm_zoom.set_camera_zoom(0.18)
	assert(absf(bm_zoom.camera.zoom.x - 0.18) < 0.01, "BuildMode zoom must support wide 0.18x zoom-out for 1.5x superships")
	bm_zoom.set_camera_zoom(2.10)
	assert(absf(bm_zoom.camera.zoom.x - 2.10) < 0.01, "BuildMode zoom must support 2.10x zoom-in")
	bm_zoom.fit_camera_to_ship()
	for test_vp in [Vector2i(1280, 720), Vector2i(720, 1280), Vector2i(580, 1280)]:
		var is_p: bool = test_vp.x < test_vp.y
		bm_zoom.mode_switcher.apply_orientation(is_p, false)
		root.size = test_vp
		root.content_scale_size = test_vp
		bm_zoom.mode_switcher._sync_dock_placement()
		bm_zoom._sync_responsive_layout()
		for _bzf in 2: await process_frame
		_assert_panels_inside_viewport(bm_zoom, root.get_visible_rect(), "BuildMode.Zoom(%s)" % str(test_vp))
	bm_zoom.mode_switcher.apply_orientation(false, true)
	bm_zoom.queue_free()
	await process_frame

	# 15b. WeaponRosterMode live Target Distance adjustment verification
	var wr_dist := (load("res://scenes/weapon_roster_mode.tscn") as PackedScene).instantiate() as WeaponRosterMode
	root.add_child(wr_dist)
	for _wd in 2: await process_frame
	wr_dist.select_weapon_index(0)
	wr_dist.set_target_distance(490.0)
	wr_dist.arena.step_demo(0.2)
	assert(wr_dist.arena.out_of_range, "Setting target_distance=490m beyond small laser range must mark out_of_range")
	wr_dist.set_target_distance(120.0)
	wr_dist.arena.step_demo(0.2)
	assert(not wr_dist.arena.out_of_range, "Setting target_distance=120m inside weapon range must clear out_of_range")
	wr_dist.queue_free()
	await process_frame

	# 15c. ThrusterLabMode fuel, ONI power, engine-room boost, exhaust obstruction & ONI liquid cooling verification
	var t_lab := (load("res://scenes/thruster_lab_mode.tscn") as PackedScene).instantiate() as ThrusterLabMode
	root.add_child(t_lab)
	for _tl in 2: await process_frame
	assert(t_lab.THRUSTER_ROSTER.size() == 8, "ThrusterLabMode must expose 8 thrusters")
	var initial_fuel := t_lab.fuel_kg
	t_lab.step_bench(1.0)
	var thrust_with_eroom := t_lab.effective_thrust_n
	assert(thrust_with_eroom > 10000.0 and t_lab.fuel_kg < initial_fuel, "ThrusterLabMode must generate thrust and consume fuel")
	t_lab.engine_room_boost = false
	t_lab.step_bench(0.05)
	assert(t_lab.effective_thrust_n < thrust_with_eroom * 0.75, "Disabling Engine Room boost must drop thrust from 1.5x to 1.0x")
	t_lab.exhaust_blocked = true
	t_lab.step_bench(0.05)
	assert(t_lab.effective_thrust_n < thrust_with_eroom * 0.25, "Rear exhaust obstruction must cut thrust by x0.25")
	t_lab.exhaust_blocked = false
	t_lab.power_on = false
	t_lab.step_bench(0.05)
	assert(t_lab.effective_thrust_n == 0.0, "Cutting ONI power must immediately stop thruster firing")
	t_lab.power_on = true
	t_lab.cooler_on = false
	t_lab.params["throttle_pct"] = 150.0
	for _th in 25:
		t_lab.step_bench(0.2)
	var hot_temp := t_lab.chamber_temp_c
	assert(hot_temp > 85.0, "150% afterburner without ONI cooler must heat nozzle > 85°C")
	t_lab.cooler_on = true
	t_lab.params["coolant_rate"] = 180.0
	for _tc in 25:
		t_lab.step_bench(0.2)
	assert(t_lab.chamber_temp_c < hot_temp - 10.0, "Activating ONI liquid cooler loop must suppress thruster chamber temperature")

	for test_vp in [Vector2i(1280, 720), Vector2i(720, 1280), Vector2i(580, 1280)]:
		var is_p: bool = test_vp.x < test_vp.y
		t_lab.mode_switcher.apply_orientation(is_p, false)
		root.size = test_vp
		root.content_scale_size = test_vp
		t_lab.mode_switcher._sync_dock_placement()
		t_lab._sync_responsive_layout()
		for _tlf in 2: await process_frame
		_assert_panels_inside_viewport(t_lab, root.get_visible_rect(), "ThrusterLabMode(%s)" % str(test_vp))
		t_lab.mode_switcher.set_expanded(true)
		await process_frame
		_assert_panels_inside_viewport(t_lab, root.get_visible_rect(), "ThrusterLabMode.Popup(%s)" % str(test_vp))
		t_lab.mode_switcher.set_expanded(false)
	t_lab.mode_switcher.apply_orientation(false, true)
	t_lab.queue_free()
	await process_frame

	# 16. 2x UI·폰트 확대 테마 및 전 모드 도크 비간섭(Non-Overlap) 검증
	var UiThemeScript := load("res://scripts/ui_scale_theme.gd")
	var ui_t: Theme = UiThemeScript.build_theme(true)
	assert(ui_t.default_font_size >= 22, "Global 2x UI theme must enforce >= 22px default_font_size")

	var main_2x := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(main_2x)
	for test_vp in [Vector2i(1280, 720), Vector2i(720, 1280), Vector2i(580, 1280)]:
		var is_p: bool = test_vp.x < test_vp.y
		main_2x.mode_switcher.apply_orientation(is_p, false)
		root.size = test_vp
		root.content_scale_size = test_vp
		main_2x.mode_switcher._sync_dock_placement()
		for _m2 in 2: await process_frame
		var ms_r: Rect2 = main_2x.mode_switcher._panel.get_global_rect().grow(-2.0)
		var dpad_r: Rect2 = main_2x.hud.flight_dpad_bounds()
		assert(not ms_r.intersects(dpad_r), "Main ModeSwitcher must not overlap Flight D-pad at %s" % str(test_vp))
		for wr in main_2x.hud.weapon_button_rects():
			assert(not ms_r.intersects(Rect2(wr.rect)), "Main ModeSwitcher must not overlap Weapon dock at %s" % str(test_vp))
	main_2x.mode_switcher.apply_orientation(false, true)
	main_2x.queue_free()
	await process_frame

	var ic_2x := (load("res://scenes/interior_command_mode.tscn") as PackedScene).instantiate() as InteriorCommandMode
	root.add_child(ic_2x)
	for sub_d in ["tools", "scenarios"]:
		ic_2x._toggle_sub_drawer(sub_d)
		for _id in 2: await process_frame
		_assert_panels_inside_viewport(ic_2x, root.get_visible_rect(), "InteriorCommand.2xDrawer(%s)" % sub_d)
	ic_2x.queue_free()
	await process_frame

	# 17. 모바일 세로 고정 캔버스(390x844) 모달 무잘림 회귀 검증 + 1.5x 초대형(265파트) 성능 벤치마크
	var bm_perf := (load("res://scenes/build_mode.tscn") as PackedScene).instantiate()
	root.add_child(bm_perf)
	await process_frame
	# 실제 모바일 웹 브라우저처럼 물리 창 크기는 390x844 세로로 고정된 상태에서 화면 세로 전환 후 모달 오픈
	bm_perf.mode_switcher.apply_orientation(false, false)
	root.size = Vector2i(390, 844)
	await process_frame
	bm_perf.mode_switcher.apply_orientation(true, false)
	bm_perf.open_catalog_modal()
	for _mp in 3: await process_frame
	var mp_vp: Rect2 = bm_perf.get_viewport_rect()
	var ms_mp_rect: Rect2 = bm_perf.mode_switcher._panel.get_global_rect().grow(-2.0)
	var cat_rect: Rect2 = bm_perf._catalog_modal.get_global_rect()
	assert(cat_rect.position.x >= 8.0 and cat_rect.end.x <= mp_vp.size.x - 8.0,
		"Mobile portrait catalog modal must fit horizontally without clipping: modal=%s vp=%s" % [str(cat_rect), str(mp_vp.size)])
	assert(not cat_rect.intersects(ms_mp_rect), "Mobile portrait catalog modal must not overlap bottom ModeSwitcher dock")
	_assert_panels_inside_viewport(bm_perf, mp_vp, "MobilePortrait390x844.CatalogModal")
	bm_perf.open_blueprint_modal()
	for _mp2 in 3: await process_frame
	var bp_rect: Rect2 = bm_perf._blueprint_modal.get_global_rect()
	assert(bp_rect.position.x >= 8.0 and bp_rect.end.x <= mp_vp.size.x - 8.0,
		"Mobile portrait blueprint modal must fit horizontally without clipping: modal=%s vp=%s" % [str(bp_rect), str(mp_vp.size)])
	assert(not bp_rect.intersects(ms_mp_rect), "Mobile portrait blueprint modal must not overlap bottom ModeSwitcher dock")
	_assert_panels_inside_viewport(bm_perf, mp_vp, "MobilePortrait390x844.BlueprintModal")
	bm_perf.close_modals()

	# 1.5x 초대형 함선(super_leviathan_15x, 265파트) 충돌체 병합 및 프레임 성능 벤치마크
	assert(bm_perf.load_preset("super_leviathan_15x"), "Must load 265-part super_leviathan_15x preset")
	var col_parts: int = bm_perf.player.model.parts.size()
	var col_cells: int = bm_perf.player.model.occupied().size()
	var merged_cols: int = bm_perf.player.active_collider_count()
	assert(col_parts >= 240 and col_cells >= 300, "Super-colossal preset must exceed 240 parts / 300 cells")
	assert(merged_cols > 0 and merged_cols <= 55,
		"Merged 2D rectangle colliders must compress %d cells into <=55 shapes (got %d)" % [col_cells, merged_cols])

	var probe_perf := PartData.new(0, "cosmo_heavy_laser", Vector2i.ZERO, 0)
	bm_perf._cached_cand_rev = -1
	var t0_us := Time.get_ticks_usec()
	var cands_first: Array[Vector2i] = bm_perf._get_cached_candidates(probe_perf)
	var uncached_ms := float(Time.get_ticks_usec() - t0_us) / 1000.0
	var t1_us := Time.get_ticks_usec()
	for _ci in 60:
		var _c_cached: Array[Vector2i] = bm_perf._get_cached_candidates(probe_perf)
	var cached_60_ms := float(Time.get_ticks_usec() - t1_us) / 1000.0
	assert(not cands_first.is_empty(), "Colossal ship must still produce valid attachment candidates")
	assert(uncached_ms < 35.0 and cached_60_ms < 2.0,
		"BuildMode candidate lookup too slow: uncached=%.2fms cached60=%.3fms" % [uncached_ms, cached_60_ms])

	# 실전 전투 물리 + 함내 시뮬레이션 120프레임 평균 스텝 시간 및 탄도 레이캐스트 무결성 검증
	bm_perf.player.freeze = false
	var hit_core: Dictionary = bm_perf.player.projectile_hit(
		bm_perf.player.to_global(Vector2(-900.0, 0.0)),
		bm_perf.player.to_global(Vector2(900.0, 0.0))
	)
	assert(not hit_core.is_empty(), "Grid-AABB projectile_hit must accurately hit super-colossal hull")
	var miss_far: Dictionary = bm_perf.player.projectile_hit(
		bm_perf.player.to_global(Vector2(-900.0, -950.0)),
		bm_perf.player.to_global(Vector2(900.0, -950.0))
	)
	assert(miss_far.is_empty(), "Grid-AABB projectile_hit must cleanly miss outside hull bounds")

	var t_sim_us := Time.get_ticks_usec()
	for f_idx in 120:
		bm_perf.player.apply_player_thrusters(1.0, 0.0, 0.25 if (f_idx % 2 == 0) else -0.25, 0.0)
		if bm_perf.player.interior != null:
			bm_perf.player.interior.step(1.0 / 60.0)
		var ry := float((f_idx % 9) - 4) * 32.0
		var _ray: Dictionary = bm_perf.player.projectile_hit(
			bm_perf.player.to_global(Vector2(220.0, ry)),
			bm_perf.player.to_global(Vector2(196.0, ry))
		)
	var avg_step_ms := float(Time.get_ticks_usec() - t_sim_us) / 1000.0 / 120.0
	print("COLOSSAL_PERF_BENCH parts=%d cells=%d merged_colliders=%d uncached_cand_ms=%.2f cached60_ms=%.3f avg_frame_step_ms=%.3f" % [
		col_parts, col_cells, merged_cols, uncached_ms, cached_60_ms, avg_step_ms
	])
	assert(avg_step_ms < 4.5, "Super-colossal 265-part step must average < 4.5ms/frame (got %.3fms)" % avg_step_ms)

	bm_perf.mode_switcher.apply_orientation(false, true)
	bm_perf.queue_free()
	await process_frame

	# 18. 전력선 에너지 입자 단입자(한 알씩) 수송 · 커패시터 방전 후 도착 재가동 · 단선 시 입자 소멸 검증
	var ic_pkt := (load("res://scenes/interior_command_mode.tscn") as PackedScene).instantiate() as InteriorCommandMode
	root.add_child(ic_pkt)
	for _ep in 2: await process_frame
	var psim: ShipInteriorSim = ic_pkt.sim
	assert(psim != null, "Expected InteriorCommandMode sim for energy packet test")
	var drained_mods := psim.drain_all_consumer_buffers()
	assert(drained_mods >= 4, "drain_all_consumer_buffers must drain consumer capacitors to 0J")
	var bow_shield_pkt: PartData = ic_pkt.ship_model.part_at(Vector2i(3, 0))
	assert(bow_shield_pkt != null and not psim.is_part_powered(bow_shield_pkt.uid),
		"Drained distant bow shield must immediately enter NO_POWER until energy particle arrives")
	var deliv_before := psim.energy_deliveries
	psim.step(0.25)
	assert(psim.energy_packets.size() >= 1, "Generators must emit discrete energy_packets onto ONI wires")
	assert(not psim.is_part_powered(bow_shield_pkt.uid),
		"Energy particle must travel cell-by-cell (cannot instantaneously power distant (3,0) at t=0.25s)")
	for _step_i in 18:
		psim.step(0.1)
	assert(psim.energy_deliveries > deliv_before, "Discrete energy particles must complete cell-by-cell delivery along wires")
	assert(psim.is_part_powered(bow_shield_pkt.uid),
		"Arriving energy particle must charge capacitor buffer and restore power to bow shield")

	# 전선 절단 시 이동 중인 에너지 입자 소멸 및 미도달 검증
	psim.drain_all_consumer_buffers()
	psim.step(0.25)
	assert(psim.energy_packets.size() >= 1, "Expected in-flight energy packets before cutting spine wire")
	psim.set_wire(Vector2i(2, 0), 0)
	for _cut_i in 15:
		psim.step(0.1)
	assert(not psim.is_part_powered(bow_shield_pkt.uid),
		"With wire severed at (2,0), energy particles must fizzle at the break and never power bow shield at (3,0)")
	ic_pkt.queue_free()
	await process_frame

	# 18b. ShipBody 실제 전투 피격(damage_part) 시 생존 구획 내부 에너지 배관 공격 손상·파괴 연동 검증
	ShipModel.clear_saved_blueprint()
	var combat_ship := ShipBody.new()
	root.add_child(combat_ship)
	combat_ship.initialize_player()
	combat_ship.shield_layers = 0
	var pipe_part: PartData = combat_ship.model.part_at(Vector2i(1, 0))
	assert(pipe_part != null and combat_ship.interior != null and combat_ship.interior.wires.has(Vector2i(1, 0)),
		"Expected initialized player ship with intact energy pipe at (1,0)")
	pipe_part.max_hp = 500.0
	pipe_part.hp = 500.0
	var hit_world := combat_ship.to_global(Vector2(1, 0) * Balance.CELL)
	combat_ship.damage_part(pipe_part, 20.0, Vector2.LEFT * 400.0, hit_world, true)
	assert(combat_ship.interior.wires.has(Vector2i(1, 0)) and float(combat_ship.interior.wire_hp.get(Vector2i(1, 0), 100.0)) < 99.0,
		"Light combat attack hit must reduce energy pipe HP")
	combat_ship.damage_part(pipe_part, 55.0, Vector2.LEFT * 400.0, hit_world, true)
	assert(pipe_part.hp > 400.0, "Underlying heavily-armored module should survive")
	assert(not combat_ship.interior.wires.has(Vector2i(1, 0)) and combat_ship.interior.destroyed_wire_cells.has(Vector2i(1, 0)),
		"Accumulated combat attack hits via ShipBody.damage_part() must destroy the energy pipe at the impact cell!")
	combat_ship.queue_free()
	await process_frame

	# 19. 승조원 전투 공격·방어 실험실 (CrewCombatLabMode) 전술·종족·장갑·의무실·격벽·무잘림 검증
	var cc_lab := (load("res://scenes/crew_combat_lab_mode.tscn") as PackedScene).instantiate() as CrewCombatLabMode
	root.add_child(cc_lab)
	for _ccl in 2: await process_frame
	assert(cc_lab.SPECIES_ROSTER.size() == 8, "CrewCombatLabMode must expose all 8 FTL crew species")

	# 19a. 공격 우세 검증: 맨티스 3명 vs 엔지 1명 (격벽 개방, 의무실 OFF, 방어장갑 0%) -> 공격조 돌파 승리!
	cc_lab.door_locked = false
	cc_lab.firewall_mode = false
	cc_lab.medbay_powered = false
	cc_lab.bio_gas_active = false
	cc_lab.defend_in_medbay = false
	cc_lab.params["atk_count"] = 3.0
	cc_lab.params["def_count"] = 1.0
	cc_lab.params["def_armor_pct"] = 0.0
	cc_lab.set_matchup("mantis", "engi")
	for _st1 in 80:
		cc_lab.step_combat(0.1)
	assert(cc_lab.outcome == "attacker_win" and cc_lab.alive_attacker_count() >= 1,
		"3 Mantis attackers vs 1 unarmored Engi without door/medbay must achieve attacker_win")

	# 19b. 방어 전술 승리 검증: 인간 2명 (방어장갑 50% + 의무실 농성 +18HP/s + 격벽 잠금 + 초크 독가스) vs 맨티스 2명 -> 방어 성공!
	cc_lab.door_locked = true
	cc_lab.firewall_mode = true
	cc_lab.medbay_powered = true
	cc_lab.bio_gas_active = true
	cc_lab.defend_in_medbay = true
	cc_lab.params["atk_count"] = 2.0
	cc_lab.params["def_count"] = 2.0
	cc_lab.params["def_armor_pct"] = 50.0
	cc_lab.params["medbay_heal_s"] = 18.0
	cc_lab.set_matchup("mantis", "human")
	for _st2 in 160:
		cc_lab.step_combat(0.1)
	assert(cc_lab.outcome == "defender_win" and cc_lab.alive_defender_count() >= 1,
		"Armored defenders holding powered Medbay behind Firewall + Biochemical Gas choke must defeat Mantis boarders")

	# 19c. 졸탄 사망 에너지 자폭(15 고정 피해) 및 락맨 화재 면역 검증
	cc_lab.door_locked = false
	cc_lab.firewall_mode = false
	cc_lab.medbay_powered = false
	cc_lab.bio_gas_active = false
	cc_lab.fire_active = true
	cc_lab.defend_in_medbay = false
	cc_lab.params["atk_count"] = 2.0
	cc_lab.params["def_count"] = 1.0
	cc_lab.params["def_armor_pct"] = 0.0
	cc_lab.set_matchup("zoltan", "rock")
	for _st3 in 90:
		cc_lab.step_combat(0.1)
	assert(cc_lab.zoltan_blasts_triggered >= 1, "Dying Zoltan crew in melee must trigger 15-damage energy death blast")
	assert(cc_lab.outcome == "defender_win", "Fire-immune 150HP Rockman must survive fire room and defeat 70HP Zoltans")

	# 19d. 가로(1280x720) · 세로(720x1280) · 초협소 모바일 세로(580x1280) 무잘림 전수 검증
	for test_vp in [Vector2i(1280, 720), Vector2i(720, 1280), Vector2i(580, 1280)]:
		var is_p: bool = test_vp.x < test_vp.y
		cc_lab.mode_switcher.apply_orientation(is_p, false)
		root.size = test_vp
		root.content_scale_size = test_vp
		cc_lab.mode_switcher._sync_dock_placement()
		cc_lab._sync_responsive_layout()
		for _ccf in 2: await process_frame
		_assert_panels_inside_viewport(cc_lab, root.get_visible_rect(), "CrewCombatLabMode(%s)" % str(test_vp))
		cc_lab.mode_switcher.set_expanded(true)
		await process_frame
		_assert_panels_inside_viewport(cc_lab, root.get_visible_rect(), "CrewCombatLabMode.Popup(%s)" % str(test_vp))
		cc_lab.mode_switcher.set_expanded(false)
	cc_lab.mode_switcher.apply_orientation(false, true)
	cc_lab.queue_free()
	await process_frame

	# 20. 승조원 4방향 1블럭 이동 · 같은팀 1칸 1명 배치 제한 · 이동 중 겹침 통과 허용 전수 검증
	# 20a. ShipInteriorSim (함내 통합 관제) 검증
	var ic_grid := (load("res://scenes/interior_command_mode.tscn") as PackedScene).instantiate() as InteriorCommandMode
	root.add_child(ic_grid)
	for _ig in 2: await process_frame
	var gsim: ShipInteriorSim = ic_grid.sim
	assert(gsim != null and gsim.crew.size() >= 4, "Expected InteriorCommandMode crew squad for 4-dir & 1-per-tile test")
	var seen_friendly_cells: Dictionary = {}
	for cm0 in gsim.crew:
		if bool(cm0.is_friendly) and float(cm0.hp) > 0.0:
			var cc0: Vector2i = cm0.cell
			assert(not seen_friendly_cells.has(cc0), "Initial friendly crew must never share the same block: duplicate at %s" % str(cc0))
			seen_friendly_cells[cc0] = true

	# 깔끔한 통제 환경을 위해 아군 2명을 (0,0)과 (1,0)에 각각 정지 배치한 뒤 테스트:
	# 1) (0,0) 승조원을 이미 아군이 서 있는 (1,0)에 배치 명령 -> false 반환(같은팀 1칸 1명 배치 제한)!
	# 2) (0,0) 승조원을 (1,0) 너머 ㄱ자 꺾임 복도 (2,0)->(1,-1)? (oni_ftl_flagship 복도: (0,0)-(1,0)-(2,0) 및 (0,-1))
	#    (0,-1) 승조원을 (0,0)->(1,0)->(2,0)으로 이동 명령! (중간에 (0,0) 및 (1,0)에 아군이 정지해 있어도 통과·겹침 허용!)
	gsim.crew.clear()
	var c_mover := gsim.add_crew_member("human", Vector2i(0, -1), true, "Mover")
	var c_blocker0 := gsim.add_crew_member("rock", Vector2i(0, 0), true, "Blocker0")
	var c_blocker1 := gsim.add_crew_member("engi", Vector2i(1, 0), true, "Blocker1")
	assert(c_mover.cell == Vector2i(0, -1) and c_blocker0.cell == Vector2i(0, 0) and c_blocker1.cell == Vector2i(1, 0),
		"Crew must spawn on exact distinct cells")
	assert(not gsim.command_crew_to_cell(int(c_mover.id), Vector2i(1, 0)),
		"Same-team crew MUST NOT be allowed to station on an already occupied teammate cell (1,0)")
	assert(gsim.command_crew_to_cell(int(c_mover.id), Vector2i(2, 0)),
		"Crew at (0,-1) MUST be allowed to route to empty (2,0) passing through teammates at (0,0) and (1,0)!")
	var mover_path: Array = (c_mover.path as Array).duplicate()
	var prev_step := Vector2i(0, -1)
	for wp_v in mover_path:
		var wp_c: Vector2i = wp_v
		assert(abs(wp_c.x - prev_step.x) + abs(wp_c.y - prev_step.y) == 1,
			"Every crew movement step must be strictly 1 block in 4 cardinal directions: %s -> %s" % [str(prev_step), str(wp_c)])
		prev_step = wp_c

	var observed_transit_overlap_sim := false
	for _mv_i in 45:
		gsim.step(0.05)
		var mpos_grid: Vector2 = Vector2(c_mover.pos) / Balance.CELL
		# ㄱ자 복도 (0,-1)->(0,0)->(1,0)->(2,0) 이동 중 대각선 좌표 이탈이 절대 없어야 함 (x==0 이거나 y==0 격자축 위만 이동!)
		var on_grid_axis := absf(mpos_grid.x - roundf(mpos_grid.x)) < 0.001 or absf(mpos_grid.y - roundf(mpos_grid.y)) < 0.001
		assert(on_grid_axis, "Crew world position must stay strictly on 4-directional grid axes (no diagonal movement): %s" % str(mpos_grid))
		var mf: Vector2 = c_mover.facing
		assert((absf(mf.x) > 0.99 and absf(mf.y) < 0.01) or (absf(mf.y) > 0.99 and absf(mf.x) < 0.01),
			"Crew facing must be strictly 4-directional cardinal vector: %s" % str(mf))
		if Vector2(c_mover.pos).distance_to(Vector2(c_blocker0.pos)) < Balance.CELL * 0.35 or Vector2(c_mover.pos).distance_to(Vector2(c_blocker1.pos)) < Balance.CELL * 0.35:
			observed_transit_overlap_sim = true
	assert(observed_transit_overlap_sim, "Moving crew MUST be allowed to overlap stationary teammates while passing through their block!")
	assert(c_mover.cell == Vector2i(2, 0) and (c_mover.path as Array).is_empty(),
		"Mover must finish stationed cleanly at destination block (2,0)")
	assert(c_blocker0.cell == Vector2i(0, 0) and c_blocker1.cell == Vector2i(1, 0),
		"Stationary teammates must remain on their own unique blocks (0,0) and (1,0)")
	ic_grid.queue_free()
	await process_frame

	# 20b. CrewCombatLabMode (10x3 전술 블럭 데크) 4방향 기동 · 같은팀 1칸 1명 제한 · 이동 중 겹침 검증
	var cc_grid := (load("res://scenes/crew_combat_lab_mode.tscn") as PackedScene).instantiate() as CrewCombatLabMode
	root.add_child(cc_grid)
	for _cg in 2: await process_frame
	cc_grid.door_locked = true
	cc_grid.params["atk_count"] = 3.0
	cc_grid.params["def_count"] = 3.0
	cc_grid.reset_round()
	# 방어조 101번(4,1), 102번(4,0), 103번(4,2): 102번을 이미 101번이 점유한 (4,1)로 이동 명령 시 거절되어야 함!
	assert(not cc_grid.command_unit_to_tile(102, Vector2i(4, 1)),
		"CrewCombatLabMode must block commanding a defender onto a tile already occupied by a teammate")
	# 102번(4,0)을 101번(4,1)과 103번(4,2) 위로 통과해 (5,2)로 이동 명령 시 허용 & 이동 중 겹침 발생 검증!
	# (4,0)->(4,1)->(4,2)->(5,2) 또는 (4,0)->(5,0)->(5,1)->(5,2); 확실히 (4,1)을 통과하도록 101번을 (4,1), 102번을 (3,1)에 두고 (5,1)로 이동!
	for u_setup in cc_grid.units:
		if int(u_setup.id) == 102:
			u_setup.cell = Vector2i(3, 1)
			u_setup.next_cell = Vector2i(3, 1)
			u_setup.goal_cell = Vector2i(3, 1)
			u_setup.anchor_cell = Vector2i(3, 1)
	assert(cc_grid.command_unit_to_tile(102, Vector2i(5, 1)),
		"Defender at (3,1) must be allowed to move to empty (5,1) right through teammate stationed at (4,1)")
	cc_grid.transit_overlaps_observed = 0
	for _cg_s in 30:
		cc_grid.step_combat(0.05)
		for u_chk in cc_grid.units:
			if float(u_chk.hp) <= 0.0:
				continue
			var gp := cc_grid.unit_grid_pos(u_chk)
			var axis_ok := absf(gp.x - roundf(gp.x)) < 0.001 or absf(gp.y - roundf(gp.y)) < 0.001
			assert(axis_ok, "CrewCombatLabMode unit must move strictly along 4-dir grid lines: %s" % str(gp))
	assert(cc_grid.transit_overlaps_observed > 0, "CrewCombatLabMode must allow and observe transit overlap when crossing teammate tile (4,1)")
	var def_final_tiles: Dictionary = {}
	for u_fin in cc_grid.units:
		if bool(u_fin.is_defender) and float(u_fin.hp) > 0.0 and (u_fin.path as Array).is_empty() and float(u_fin.move_t) <= 0.001:
			var fc: Vector2i = u_fin.cell
			assert(not def_final_tiles.has(fc), "Stationary defenders in CrewCombatLabMode must never share a tile: %s" % str(fc))
			def_final_tiles[fc] = true
	cc_grid.queue_free()
	await process_frame

	# 21. 승조원 전투모드 격실벽(wall) · 방화문(fire_door) 설치 · Lv.1->Lv.2->Lv.3 업그레이드 · 제거 · 우회 기동 · 기체 밀폐 검증
	var cc_bar := (load("res://scenes/crew_combat_lab_mode.tscn") as PackedScene).instantiate() as CrewCombatLabMode
	root.add_child(cc_bar)
	for _cb in 2: await process_frame
	cc_bar.barriers.clear()
	cc_bar._custom_barriers_dirty = true
	cc_bar.door_locked = true

	# 21a. 방화문(fire_door) 설치 -> Lv.2 업글 -> Lv.3 업글 -> 아군 통과 허용 & 적군 차단 -> 제거 검증
	assert(cc_bar.interact_edge_with_tool(Vector2i(4, 1), Vector2i(5, 1), "fire_door") == "installed_1",
		"First fire_door tool click on empty edge must install Lv.1 Fire Door")
	var fd1 := cc_bar.get_barrier(Vector2i(4, 1), Vector2i(5, 1))
	assert(int(fd1.level) == 1 and absf(float(fd1.max_hp) - 90.0) < 0.1, "Lv.1 Fire Door must have 90 HP")
	assert(cc_bar.interact_edge_with_tool(Vector2i(4, 1), Vector2i(5, 1), "fire_door") == "upgraded_2",
		"Second fire_door click on existing Fire Door must upgrade to Lv.2")
	assert(int(cc_bar.get_barrier(Vector2i(4, 1), Vector2i(5, 1)).level) == 2 and absf(float(cc_bar.get_barrier(Vector2i(4, 1), Vector2i(5, 1)).max_hp) - 180.0) < 0.1,
		"Lv.2 Reinforced Fire Door must have 180 HP")
	assert(cc_bar.upgrade_selected_or_all_barriers() == 3,
		"upgrade_selected_or_all_barriers must upgrade selected Fire Door to Lv.3")
	assert(int(cc_bar.get_barrier(Vector2i(4, 1), Vector2i(5, 1)).level) == 3 and absf(float(cc_bar.get_barrier(Vector2i(4, 1), Vector2i(5, 1)).max_hp) - 300.0) < 0.1,
		"Lv.3 Superalloy Fire Door must have 300 HP")
	assert(not cc_bar.is_edge_blocking_unit(Vector2i(4, 1), Vector2i(5, 1), true),
		"Friendly defenders must be able to auto-open and pass through locked Fire Doors")
	assert(cc_bar.is_edge_blocking_unit(Vector2i(4, 1), Vector2i(5, 1), false),
		"Enemy attackers must be blocked by locked Fire Doors")
	assert(cc_bar.interact_edge_with_tool(Vector2i(4, 1), Vector2i(5, 1), "remove") == "removed",
		"Remove tool must delete the Fire Door")
	assert(cc_bar.get_barrier(Vector2i(4, 1), Vector2i(5, 1)).is_empty(),
		"Removed Fire Door must no longer exist in barriers")

	# 21b. 격실벽(wall) 설치 -> Lv.2 -> Lv.3 업글 -> 4방향 우회 동선 유도 & 독가스 완전 밀폐 -> 제거 시 확산 검증
	assert(cc_bar.interact_edge_with_tool(Vector2i(4, 0), Vector2i(5, 0), "wall") == "installed_1",
		"Wall tool must install Lv.1 Compartment Wall (140 HP)")
	assert(cc_bar.interact_edge_with_tool(Vector2i(4, 1), Vector2i(5, 1), "wall") == "installed_1",
		"Wall tool must install Lv.1 Compartment Wall at (4,1):(5,1)")
	assert(cc_bar.upgrade_barrier(Vector2i(4, 1), Vector2i(5, 1)) == 2 and absf(float(cc_bar.get_barrier(Vector2i(4, 1), Vector2i(5, 1)).max_hp) - 260.0) < 0.1,
		"Upgrading Compartment Wall once must yield Lv.2 (260 HP)")
	assert(cc_bar.upgrade_barrier(Vector2i(4, 1), Vector2i(5, 1)) == 3 and absf(float(cc_bar.get_barrier(Vector2i(4, 1), Vector2i(5, 1)).max_hp) - 420.0) < 0.1,
		"Upgrading Compartment Wall twice must yield Lv.3 (420 HP)")
	# 상단(row 0)·중단(row 1)이 격실벽으로 막혔을 때 (4,1)->(5,1) 이동 경로는 반드시 하단 (4,2)->(5,2)로 우회해야 함!
	var detour_path := cc_bar.find_grid_path(Vector2i(4, 1), Vector2i(5, 1), true, false)
	assert(detour_path == [Vector2i(4, 2), Vector2i(5, 2), Vector2i(5, 1)],
		"Compartment Walls at row 0 & row 1 must force 4-dir detour via row 2: got %s" % str(detour_path))

	# 배기구 (4,1) 사방을 격실벽과 방화문으로 밀폐했을 때 독가스가 인접 칸으로 절대 새지 않아야 함!
	cc_bar.barriers.clear()
	cc_bar.install_barrier(Vector2i(3, 1), Vector2i(4, 1), "fire_door", 2, true)
	cc_bar.install_barrier(Vector2i(4, 1), Vector2i(5, 1), "wall", 3, true)
	cc_bar.install_barrier(Vector2i(4, 0), Vector2i(4, 1), "wall", 2, true)
	cc_bar.install_barrier(Vector2i(4, 1), Vector2i(4, 2), "wall", 2, true)
	cc_bar.bio_gas_active = true
	cc_bar.bio_gas_level = 95.0
	for _gs in 15:
		cc_bar._step_gas_diffusion(0.1)
	assert(float(cc_bar.cell_gas.get(Vector2i(4, 1), 0.0)) > 80.0, "Sealed vent tile (4,1) must accumulate Biochemical Gas")
	assert(float(cc_bar.cell_gas.get(Vector2i(5, 1), 0.0)) == 0.0 and float(cc_bar.cell_gas.get(Vector2i(3, 1), 0.0)) == 0.0,
		"Compartment Walls & locked Fire Doors must completely seal Biochemical Gas inside the pocket")
	# 이제 우측 격실벽 (4,1):(5,1)을 제거하면 독가스가 즉시 (5,1)로 확산되어야 함!
	assert(cc_bar.remove_barrier(Vector2i(4, 1), Vector2i(5, 1)), "remove_barrier must remove Lv.3 Compartment Wall")
	for _gs2 in 15:
		cc_bar._step_gas_diffusion(0.1)
	assert(float(cc_bar.cell_gas.get(Vector2i(5, 1), 0.0)) > 50.0,
		"Removing Compartment Wall at (4,1):(5,1) must allow Biochemical Gas to flood into (5,1)")
	cc_bar.queue_free()
	await process_frame

	root.size = Vector2i(1280, 720)
	root.content_scale_size = Vector2i(1280, 720)
	ShipModel.clear_saved_blueprint()
	CosmoteerWeaponData.clear_weapon_override()

	print("CAPTAIN_FOREVER_SP_OK parts=%d salvage=%d kills=%d radar=%d grapple_hp=%.0f sonar_mutual=%d cosmo_parts=%d catalog=%d presets=%d roster=%d sfx=%d zero_clip_audit=PASS" % [
		16, 2, 1, 11, 288.0, 10, CosmoteerAssets.part_count(), PartCatalog.ENTRIES.size(), BlueprintLibrary.get_presets().size(), w_roster.size(), CosmoteerSfx.bundled_sfx_count()
	])
	quit(0)

func _assert_rect_inside(gr: Rect2, vp_rect: Rect2, ctx: String) -> void:
	assert(gr.position.x >= -1.0 and gr.position.y >= -1.0 and gr.end.x <= vp_rect.size.x + 1.0 and gr.end.y <= vp_rect.size.y + 1.0,
		"%s clipped rect=%s vp=%s" % [ctx, str(gr), str(vp_rect.size)])

func _assert_panels_inside_viewport(node: Node, vp_rect: Rect2, ctx: String, scroll_bounds: Rect2 = Rect2()) -> void:
	var next_scroll := scroll_bounds
	if node is Control:
		var ctrl := node as Control
		if not ctrl.visible:
			return
		if ctrl is PanelContainer or ctrl is Button or ctrl is ScrollContainer:
			var gr := ctrl.get_global_rect()
			if scroll_bounds.size == Vector2.ZERO:
				_assert_rect_inside(gr, vp_rect, "%s[%s]" % [ctx, ctrl.name])
			else:
				assert(gr.position.x >= scroll_bounds.position.x - 1.5 and gr.end.x <= scroll_bounds.end.x + 1.5,
					"%s[%s] horizontal clip inside scroll rect=%s scroll=%s" % [ctx, ctrl.name, str(gr), str(scroll_bounds)])
		if ctrl is ScrollContainer:
			next_scroll = ctrl.get_global_rect()
	for ch in node.get_children():
		_assert_panels_inside_viewport(ch, vp_rect, ctx, next_scroll)
