extends Node

@export var capture_dir: String = ""

var _results: Array[Dictionary] = []
var _done := false

func _ready() -> void:
	call_deferred("_run_all")

func _record(name: String, passed: bool, detail: String) -> void:
	_results.append({"name": name, "passed": passed, "detail": detail})
	print("[BEHAVIOR] %s | %s | %s" % ["PASS" if passed else "FAIL", name, detail])

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

func _run_all() -> void:
	if _done:
		return
	_done = true
	# Speed up task.wait for deterministic test execution
	RobloxCompat.time_scale = 20.0

	var root := get_tree().current_scene
	if root == null:
		_record("scene_instantiation", false, "current_scene is null")
		_finish()
		return

	# Wait a couple frames for bootstrap & physics
	await get_tree().physics_frame
	await get_tree().physics_frame

	var ws := RobloxCompat.get_workspace()
	var pl := RobloxCompat.get_local_player()
	var ch: Node3D = pl.character if pl != null else null
	var hrp := RobloxCompat.find_first_child(ch, "HumanoidRootPart") if ch != null else null
	var hum := RobloxCompat.find_first_child_of_class(ch, "Humanoid") if ch != null else null

	# 1. Scene & Hierarchy Parity
	var mesh_count := _count_class(root, "MeshInstance3D")
	var col_count := _count_class(root, "CollisionShape3D")
	var area_count := _count_class(root, "Area3D")
	_record(
		"scene_hierarchy_parity",
		ws != null and mesh_count >= 18 and col_count >= 18 and area_count >= 18 and ch != null,
		"meshes=%d collisions=%d areas=%d player=%s" % [mesh_count, col_count, area_count, ch != null]
	)

	# 2. Coordinate & Unit Conversion Parity (0.28 m/stud)
	var checkpoints := RobloxCompat.find_first_child(ws, "Checkpoints")
	var red0 := RobloxCompat.find_first_child(checkpoints, "Red 0") as Node3D
	var enter_pad := RobloxCompat.find_first_child(RobloxCompat.find_first_child(RobloxCompat.find_first_child(ws, "Teleports"), "Lobby"), "EnterRedPad") as Node3D
	var red0_err := red0.global_position.distance_to(Vector3(0.0, 1.5 * 0.28, 0.0)) if red0 != null else 999.0
	var pad_err := enter_pad.global_position.distance_to(Vector3(-15.0 * 0.28, 1.5 * 0.28, 0.0)) if enter_pad != null else 999.0
	_record(
		"unit_coordinate_parity",
		red0_err < 0.01 and pad_err < 0.01,
		"Red0_err=%.4fm EnterRedPad_err=%.4fm (policy=0.28m/stud)" % [red0_err, pad_err]
	)

	# 3. Motion.legacy.luau — Spinning platforms via RunService.Heartbeat (exact 1x, 8x, 0.5x ratios)
	RobloxCompat.time_scale = 1.0
	var rot_folder := RobloxCompat.find_first_child(ws, "Rotation")
	var r60_beam := RobloxCompat.find_first_child(RobloxCompat.find_first_child(RobloxCompat.find_first_child(rot_folder, "Right"), "Right60"), "Right60_Beam1") as Node3D
	var l60_beam := RobloxCompat.find_first_child(RobloxCompat.find_first_child(RobloxCompat.find_first_child(rot_folder, "Left"), "Left60"), "Left60_Beam1") as Node3D
	var r480_blade := RobloxCompat.find_first_child(RobloxCompat.find_first_child(RobloxCompat.find_first_child(rot_folder, "Right"), "Right480"), "Right480_Blade1") as Node3D
	var cyl_log := RobloxCompat.find_first_child(RobloxCompat.find_first_child(RobloxCompat.find_first_child(rot_folder, "CylRight"), "CylRight30"), "CylRight30_Log1") as Node3D
	var b_r60_0 := r60_beam.global_transform.basis
	var b_l60_0 := l60_beam.global_transform.basis
	var b_r480_0 := r480_blade.global_transform.basis
	var b_cyl_0 := cyl_log.global_transform.basis
	for _i in range(6):
		await get_tree().physics_frame
	var d_r60 := b_r60_0.get_rotation_quaternion().angle_to(r60_beam.global_transform.basis.get_rotation_quaternion())
	var d_l60 := b_l60_0.get_rotation_quaternion().angle_to(l60_beam.global_transform.basis.get_rotation_quaternion())
	var d_r480 := b_r480_0.get_rotation_quaternion().angle_to(r480_blade.global_transform.basis.get_rotation_quaternion())
	var d_cyl := b_cyl_0.get_rotation_quaternion().angle_to(cyl_log.global_transform.basis.get_rotation_quaternion())
	var ratio_480 := d_r480 / maxf(0.0001, d_r60)
	var ratio_cyl := d_cyl / maxf(0.0001, d_r60)
	RobloxCompat.time_scale = 20.0
	_record(
		"motion_heartbeat_spin",
		d_r60 > 0.05 and d_l60 > 0.05 and absf(ratio_480 - 8.0) < 0.05 and absf(ratio_cyl - 0.5) < 0.05,
		"dRight60=%.3frad dLeft60=%.3frad dRight480=%.3frad(%.2fx) dCyl30=%.3frad(%.2fx)" % [d_r60, d_l60, d_r480, ratio_480, d_cyl, ratio_cyl]
	)

	# 4. Checkpoints.legacy.luau — Stage StringValue + Model Checkpoint + DataStore stub
	var stage_val := RobloxCompat.find_first_child(pl, "Stage")
	var initial_stage := str(stage_val.value) if stage_val != null else "<missing>"
	var red1 := RobloxCompat.find_first_child(checkpoints, "Red 1")
	var red1_pad := RobloxCompat.find_first_child_of_class(red1, "SpawnLocation", true)
	RobloxCompat.simulate_touch(red1_pad, hrp)
	var after_stage := str(stage_val.value) if stage_val != null else "<missing>"
	var ds := RobloxCompat.get_datastore_stub("ProgressPoints")
	var saved_ds := str(ds.get_async("Player_1001"))
	_record(
		"checkpoints_and_datastore_stub",
		initial_stage == "Red 0" and after_stage == "Red 1" and pl.respawn_location == red1_pad and saved_ds == "Red 1",
		"initial=%s after=%s respawn=%s ds_stub=%s" % [initial_stage, after_stage, RobloxCompat.get_roblox_name(pl.respawn_location), saved_ds]
	)

	# 5. Teleport.legacy.luau — EnterRedPad -> PivotTo saved checkpoint + LevelRed attribute
	RobloxCompat.simulate_touch(enter_pad, hrp)
	await get_tree().create_timer(0.05).timeout
	var level_red: bool = RobloxCompat.get_attribute(pl, "LevelRed") == true
	var expected_x := 48.0 * 0.28
	var teleport_dx := absf(ch.global_position.x - expected_x)
	_record(
		"teleport_to_saved_checkpoint",
		level_red and teleport_dx < 0.25 and ch.last_state == "GettingUp",
		"LevelRed=%s char_x=%.2fm (expected %.2fm) state=%s" % [level_red, ch.global_position.x, expected_x, ch.last_state]
	)

	# 6. Timer.local.luau — HUD visible & formatted countdown via GetAttributeChangedSignal
	var starter_gui: Node = RobloxCompat.get_service("StarterGui")
	var hud := RobloxCompat.find_first_child(starter_gui, "ChaosHUD")
	var timer_label := RobloxCompat.find_first_child(hud, "TimerLabel") as Label
	await get_tree().create_timer(0.08).timeout
	var hud_visible := timer_label != null and timer_label.visible
	var hud_text := timer_label.text if timer_label != null else ""
	_record(
		"timer_hud_attribute_signal",
		hud_visible and hud_text.begins_with("Next Chaos Event In:") and hud_text.contains(":"),
		"visible=%s text='%s'" % [hud_visible, hud_text]
	)

	# Capture AFTER Normal Gameplay screenshot (with HUD visible, spinning platforms, checkpoints, lava, player)
	await _save_shot("after_chaos_obby_normal.png")

	# 7. Disapearing.legacy.luau — Fade transparency -> CanCollide=false -> Restore
	var dis_folder := RobloxCompat.find_first_child(ws, "Disappearing")
	var fade_tile := RobloxCompat.find_first_child(dis_folder, "FadeTile_1")
	RobloxCompat.simulate_touch(fade_tile, hrp)
	var faded_trans := 0.0
	var faded_collide := true
	for _step in range(80):
		await get_tree().process_frame
		faded_trans = float(fade_tile.get_meta("roblox_transparency", 0.0))
		faded_collide = bool(fade_tile.get_meta("roblox_can_collide", true))
		if not faded_collide and faded_trans >= 0.99:
			break
	var restored_trans := 1.0
	var restored_collide := false
	for _step in range(120):
		await get_tree().process_frame
		restored_trans = float(fade_tile.get_meta("roblox_transparency", 1.0))
		restored_collide = bool(fade_tile.get_meta("roblox_can_collide", false))
		if restored_collide and restored_trans <= 0.01:
			break
	_record(
		"disappearing_platform_lifecycle",
		faded_trans >= 0.99 and not faded_collide and restored_trans <= 0.01 and restored_collide,
		"mid(trans=%.2f collide=%s) -> restored(trans=%.2f collide=%s)" % [faded_trans, faded_collide, restored_trans, restored_collide]
	)

	# 8. Lava Obstacles.legacy.luau — Touch lava -> Health=0 -> Respawn at Red 1
	var lava_folder := RobloxCompat.find_first_child(ws, "Lava")
	var lava_floor := RobloxCompat.find_first_child(lava_folder, "LavaFloor_1")
	ch.global_position = Vector3(0.0, 2.0, 0.0)
	var deaths_before: int = ch.death_count
	RobloxCompat.simulate_touch(lava_floor, hrp)
	var respawn_dx := absf(ch.global_position.x - expected_x)
	_record(
		"lava_kill_and_respawn",
		ch.death_count == deaths_before + 1 and respawn_dx < 0.25,
		"deaths=%d->%d respawned_x=%.2fm (expected %.2fm)" % [deaths_before, ch.death_count, ch.global_position.x, expected_x]
	)

	# 9. Chaos Features.legacy.luau — low_speed / high_speed / darkness / normal
	var sss: Node = RobloxCompat.get_service("ServerScriptService")
	var chaos_node := RobloxCompat.find_first_child(sss, "ChaosFeatures")
	chaos_node.call("low_speed", ch)
	var ws_low: float = ch.walk_speed
	chaos_node.call("high_speed", ch)
	var ws_high: float = ch.walk_speed
	chaos_node.call("darkness", ch)
	var fog_dark := RobloxCompat.get_lighting_state()
	var rs: Node = RobloxCompat.get_service("ReplicatedStorage")
	RobloxCompat.set_attribute(rs, "ChaosText", "Darkness Event Ends In:")
	RobloxCompat.set_attribute(rs, "TimeLeft", 42)
	await _save_shot("after_chaos_obby_darkness.png")
	chaos_node.call("normal", ch)
	var ws_norm: float = ch.walk_speed
	var fog_norm := RobloxCompat.get_lighting_state()
	_record(
		"chaos_features_speed_and_darkness",
		ws_low == 8.0 and ws_high == 64.0 and ws_norm == 16.0 and fog_dark["fog_end"] == 20.0 and fog_norm["fog_end"] == 500.0,
		"WalkSpeed(low=%.0f high=%.0f norm=%.0f) FogEnd(dark=%.0f norm=%.0f)" % [ws_low, ws_high, ws_norm, fog_dark["fog_end"], fog_norm["fog_end"]]
	)

	_finish()

func _count_class(n: Node, cls: String) -> int:
	var c := 1 if n.is_class(cls) else 0
	for ch in n.get_children():
		c += _count_class(ch, cls)
	return c

func _finish() -> void:
	var passed := 0
	for r in _results:
		if r["passed"]:
			passed += 1
	var summary := {
		"passed": passed,
		"total": _results.size(),
		"pass_rate": float(passed) / maxf(1.0, float(_results.size())),
		"assertions": _results
	}
	print("BEHAVIOR_SUMMARY_JSON=" + JSON.stringify(summary))
	get_tree().quit(0 if passed == _results.size() else 1)
