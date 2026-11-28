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

	# 1) Landscape 1280x720: Custom Maze of Lv.1/Lv.2/Lv.3 Compartment Walls & Fire Doors + Biochemical Gas Pocket Containment!
	cc.door_locked = true
	cc.medbay_powered = true
	cc.bio_gas_active = true
	cc.fire_active = false
	cc.defend_in_medbay = true
	cc.params["atk_count"] = 4.0
	cc.params["def_count"] = 3.0
	cc.params["def_armor_pct"] = 40.0
	cc._sync_sliders()
	cc._sync_switch_labels()
	cc.barriers.clear()
	cc._custom_barriers_dirty = true
	# 에어록 경계: 상·하단 중장갑 격실벽 Lv.3 (벽3), 중앙 강화 방화문 Lv.2 (문2) -> 적 4명을 중앙 초크로 유도!
	cc.install_barrier(Vector2i(2, 0), Vector2i(3, 0), "wall", 3, true)
	cc.install_barrier(Vector2i(2, 1), Vector2i(3, 1), "fire_door", 2, true)
	cc.install_barrier(Vector2i(2, 2), Vector2i(3, 2), "wall", 3, true)
	# 초크 복도 내부 지그재그 격실벽 Lv.2 & 의무실 입구 초합금 방화문 Lv.3 / 기본 방화문 Lv.1!
	cc.install_barrier(Vector2i(4, 0), Vector2i(4, 1), "wall", 2, true)
	cc.install_barrier(Vector2i(5, 0), Vector2i(6, 0), "wall", 2, true)
	cc.install_barrier(Vector2i(5, 2), Vector2i(6, 2), "wall", 1, true)
	cc.install_barrier(Vector2i(5, 1), Vector2i(6, 1), "fire_door", 3, true)
	cc.set_active_tool("wall")
	cc.set_matchup("mantis", "rock")
	for _s in 14:
		cc.step_combat(0.08)
	cc.upgrade_barrier(Vector2i(5, 2), Vector2i(6, 2))
	cc._update_telemetry_labels()
	cc.arena.queue_redraw()
	for _i in 4: await process_frame
	_save_shot("v24_wall_door_upgrade_maze.png")

	# 2) Landscape 1280x720: Removing a Barrier & Active Breach Combat through Choke!
	cc.set_active_tool("remove")
	cc.remove_barrier(Vector2i(2, 1), Vector2i(3, 1))
	for _s2 in 16:
		cc.step_combat(0.08)
	cc.set_active_tool("fire_door")
	cc.interact_edge_with_tool(Vector2i(7, 1), Vector2i(8, 1), "fire_door")
	cc._update_telemetry_labels()
	cc.arena.queue_redraw()
	for _i in 4: await process_frame
	_save_shot("v24_wall_remove_and_choke_fight.png")

	# 3) Mobile Portrait 540x1170: Full Wall/Door Tool Bar & 10x3 Tactical Grid with Zero Clipping
	root.size = Vector2i(540, 1170)
	cc.mode_switcher.apply_orientation(true, false)
	for _i in 4: await process_frame
	_save_shot("v24_portrait_wall_door_tools.png")

	cc.mode_switcher.apply_orientation(false, false)
	cc.queue_free()
	await process_frame
	print("ALL_V24_SCREENSHOTS_OK")
	quit(0)
