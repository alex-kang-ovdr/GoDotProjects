extends SceneTree

const OUT_DIR := "C:/Users/taru0/.gemini/antigravity/brain/ba6b3544-8fca-4b06-93f7-ca2a6a07168d/scratch/grapple-lab-web/evidence"

func _initialize() -> void:
	call_deferred("_run_captures")

func _save_shot(filename: String) -> void:
	RenderingServer.force_draw(false)
	var img := root.get_texture().get_image()
	img.save_png(OUT_DIR + "/" + filename)
	print("CAPTURED " + filename + " " + str(img.get_size()))

func _run_captures() -> void:
	DirAccess.make_dir_recursive_absolute(OUT_DIR)
	root.size = Vector2i(1280, 720)
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	root.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_EXPAND

	var cc := (load("res://scenes/crew_combat_lab_mode.tscn") as PackedScene).instantiate()
	root.add_child(cc)
	for _i in 3: await process_frame

	# 1) Landscape 1280x720: 10x3 Tactical Block Grid — 3 Mantis lined 1-per-tile at col=2 breaching Firewall vs 3 Armored Rockmen with 4-dir orthogonal path line!
	cc.door_locked = true
	cc.firewall_mode = true
	cc.door_max_hp = 220.0
	cc.door_hp = 220.0
	cc.medbay_powered = true
	cc.bio_gas_active = false
	cc.fire_active = false
	cc.defend_in_medbay = false
	cc.params["atk_count"] = 3.0
	cc.params["def_count"] = 3.0
	cc.params["def_armor_pct"] = 35.0
	cc._sync_sliders()
	cc._sync_switch_labels()
	cc.set_matchup("mantis", "rock")
	for _s in 12:
		cc.step_combat(0.08)
	# Command selected defender 101 from (4,1) along 4-dir L-path to (7,2) to showcase crisp orthogonal 4-dir path & 1-per-tile!
	cc.command_unit_to_tile(101, Vector2i(7, 2))
	cc.step_combat(0.10)
	cc._update_telemetry_labels()
	cc.arena.queue_redraw()
	for _i in 4: await process_frame
	_save_shot("v23_grid_4dir_breach.png")

	# 2) Landscape 1280x720: Transit Overlap in Action + Same-Team 1-Per-Tile Rejection Badge + Medbay/Gas Combat!
	cc.door_locked = false
	cc.firewall_mode = false
	cc.medbay_powered = true
	cc.bio_gas_active = true
	cc.fire_active = true
	cc.defend_in_medbay = true
	cc.params["atk_count"] = 4.0
	cc.params["def_count"] = 3.0
	cc.params["def_armor_pct"] = 45.0
	cc.params["medbay_heal_s"] = 18.0
	cc._sync_sliders()
	cc._sync_switch_labels()
	cc.set_matchup("mantis", "crystal")
	for _s2 in 22:
		cc.step_combat(0.08)
	# Trigger same-team 1-per-tile rejection badge on an occupied defender tile so visual rule feedback appears!
	for u_d in cc.units:
		if bool(u_d.is_defender) and float(u_d.hp) > 0.0 and int(u_d.id) != 101:
			cc.command_unit_to_tile(101, u_d.cell as Vector2i)
			break
	cc._update_telemetry_labels()
	cc.arena.queue_redraw()
	for _i in 4: await process_frame
	_save_shot("v23_transit_overlap_and_limit.png")

	# 3) Mobile Portrait 540x1170: 10x3 Tactical Block Grid in Portrait with Zero Clipping
	root.size = Vector2i(540, 1170)
	cc.mode_switcher.apply_orientation(true, false)
	for _i in 4: await process_frame
	_save_shot("v23_portrait_grid_combat.png")

	cc.mode_switcher.apply_orientation(false, false)
	cc.queue_free()
	await process_frame
	print("ALL_V23_SCREENSHOTS_OK")
	quit(0)
