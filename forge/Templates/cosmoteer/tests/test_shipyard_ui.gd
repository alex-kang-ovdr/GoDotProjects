extends SceneTree

var checks := 0
var failures := 0
var screenshot_dir := ""

func _initialize() -> void:
	test.call_deferred()

func verify(condition: bool, explanation: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		printerr("FAIL ",explanation)

func test() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() == 2 and args[0] == "--snapshot-dir":
		screenshot_dir = args[1]
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var lab = scene.get_node("UI/Laboratory")
	await process_frame
	var yard = lab.shipyard
	verify(yard.is_visible_in_tree() and not yard.depart_button.disabled,"shipyard is the launch scene")
	verify(yard.parts_list.item_count==37,"operational palette includes propulsion, combat expansion, dreadnought, prism/flak/chaingun, and the lab engine room")
	yard.selection.select(1)
	yard.selection.item_selected.emit(1)
	verify(yard.parts_list.item_count==97,"all 96 catalog modules and the lab engine room are offered")
	yard.search.text="sensor_array"
	yard.search.text_changed.emit(yard.search.text)
	verify(yard.parts_list.item_count>=1 and "고유 장치 동작 미구현" in yard.part_info.text,"passive catalog part marked")
	yard.search.clear()
	yard.selection.select(0)
	yard.selection.item_selected.emit(0)
	choose(yard,"cosmoteer.corridor")
	verify(yard.editor.get_global_rect().end.y <= root.get_visible_rect().end.y+1, "editor fits the viewport")
	await screenshot("shipyard")
	# Assemble a ship from empty tiles using actual viewport mouse events.
	# Run the former stationary blueprint through the new battle entry point.
	var stationary = preload("res://sim/ship_design.gd").new()
	stationary.starter()
	var preset: Array = stationary.serialize().parts
	yard._clear()
	verify(yard.depart_button.disabled and yard.design.parts.is_empty(),"empty design grounded")
	for part in preset:
		choose(yard,part.id)
		for i in int(part.rotation):
			yard._rotate()
		click_cell(yard.grid,Vector2i(int(part.cell[0]),int(part.cell[1])))
	verify(not yard.depart_button.disabled and yard.design.parts.size()==preset.size(),"manual fresh build valid")
	var before: int = yard.design.parts.size()
	click_cell(yard.grid,Vector2i(3,3))
	verify(yard.design.parts.size()==before,"overlapping click rejected")
	click_cell(yard.grid,Vector2i(5,5),MOUSE_BUTTON_RIGHT)
	verify(yard.depart_button.disabled and yard.grid.preview_path.is_empty(),"removed corridor breaks launch")
	choose(yard,"cosmoteer.corridor")
	for x in [4,5,6]:
		click_cell(yard.grid,Vector2i(x,6))
	verify(not yard.depart_button.disabled and Vector2i(5,6) in yard.grid.preview_path,"placed detour reconnects rooms")
	var custom: Dictionary = yard.design.serialize()
	yard.save_path = "user://test_shipyard_%d.json" % OS.get_process_id()
	yard._save_design()
	yard._save_design()
	verify(FileAccess.file_exists(yard.save_path) and not yard.load_button.disabled, "save and replace blueprint")
	yard._clear()
	yard.load_button.pressed.emit()
	verify(yard.design.serialize()==custom,"round-trip through save UI")
	yard._clear()
	yard.undo_button.pressed.emit()
	verify(yard.design.serialize()==custom,"undo a bulk edit")
	yard.depart_button.pressed.emit()
	await process_frame
	var duel = yard.duel
	verify(duel.is_visible_in_tree() and duel.battle.result=="active","launch with custom ship")
	if not duel.is_visible_in_tree():
		quit(1)
		return
	duel.view_button.pressed.emit()
	await process_frame
	var target: Dictionary = {}
	for part in duel.battle.enemy.parts.values():
		if part.id == "cosmoteer.laser_blaster_small":
			target = part
	click_cell(duel.grids[1],target.cell)
	verify(duel.battle.target_uid==target.uid,"enemy grid click issues focus-fire order")
	duel.pause_button.pressed.emit()
	var stamp: float = duel.battle.elapsed
	duel._physics_process(0.5)
	verify(duel.battle.elapsed==stamp,"pause freezes battle")
	duel.pause_button.pressed.emit()
	var used_detour := false
	for i in 900:
		duel._physics_process(1.0/60.0)
		for crew in duel.battle.player.crew:
			if crew.cargo>0 and Vector2(crew.pos).distance_to(Vector2(5,6)) < 0.15:
				used_detour = true
	verify(used_detour and duel.battle.player.deliveries>0,"loaded carrier physically crosses hand-built detour")
	verify(duel.battle.player.shots>0 and duel.battle.enemy.shots>0,"both designs fire and sustain hits")
	verify(duel.get_global_rect().end.y <= root.get_visible_rect().end.y+1,"battle fits the viewport")
	await screenshot("battle")
	lab.catalog_tab.pressed.emit()
	stamp = duel.battle.elapsed
	duel._physics_process(1.0)
	verify(duel.battle.elapsed==stamp,"switch tab suspends battle")
	lab.shipyard_tab.pressed.emit()
	duel._choose_type("cosmoteer.control_room_small")
	for i in 300:
		if duel.battle.result != "active":
			break
		duel._physics_process(0.5)
	verify(duel.battle.result in ["win","loss","draw"],"combat reaches a result")
	print("UI battle result=%s t=%.2f player shots=%d enemy shots=%d" % [duel.battle.result,duel.battle.elapsed,duel.battle.player.shots,duel.battle.enemy.shots])
	duel._leave()
	verify(yard.editor.visible and yard.design.serialize()==custom,"return preserves blueprint")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(yard.save_path))
	print("Shipyard UI checks: %d; failures: %d" % [checks,failures])
	quit(int(failures>0))

func choose(yard, id: String) -> void:
	for i in yard.parts_list.item_count:
		if yard.parts_list.get_item_metadata(i)==id:
			yard.parts_list.select(i)
			yard.parts_list.item_selected.emit(i)
			return
	verify(false,"palette missing "+id)

func click_cell(grid: Control,cell: Vector2i,button := MOUSE_BUTTON_LEFT) -> void:
	var pos: Vector2 = grid.get_global_transform() * grid.cell_center(cell)
	var motion := InputEventMouseMotion.new()
	motion.position = pos
	root.push_input(motion,true)
	for state in [true,false]:
		var event := InputEventMouseButton.new()
		event.position = pos
		event.button_index = button
		event.pressed = state
		root.push_input(event,true)

func screenshot(caption: String) -> void:
	if screenshot_dir.is_empty():
		return
	await process_frame
	await RenderingServer.frame_post_draw
	verify(root.get_texture().get_image().save_png(screenshot_dir.path_join(caption+".png"))==OK,"save screenshot "+caption)
