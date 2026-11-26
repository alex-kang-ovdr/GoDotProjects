extends "res://tests/test_shipyard_ui.gd"

func test() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() == 2 and args[0] == "--snapshot-dir":
		screenshot_dir = args[1]
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var lab = scene.get_node("UI/Laboratory")
	await process_frame
	var yard = lab.shipyard
	var progress_path := "user://test_operations_%d.json" % OS.get_process_id()
	var absolute_progress_path := ProjectSettings.globalize_path(progress_path)
	if FileAccess.file_exists(progress_path):
		DirAccess.remove_absolute(absolute_progress_path)
	yard.configure_operations(progress_path)
	verify(yard.mission_picker.item_count == 6 and yard.mission_picker.get_item_metadata(0) == "","free flight remains the default alongside five missions")
	verify(yard.operations.missions.size() == 5,"five operation briefs are available")
	verify(yard.operations.is_unlocked("skirmish") and not yard.operations.is_unlocked("disarm") and not yard.operations.is_unlocked("escort"),"mission chain locks later operations")
	verify(yard.mission_record.get_global_rect().end.y <= root.get_visible_rect().end.y+1 and yard.depart_button.get_global_rect().end.y <= root.get_visible_rect().end.y+1,"mission selector and launch controls fit the 1240×800 yard")
	await screenshot("operations_yard")
	_select_mission(yard,"skirmish")
	verify("목표:" in yard.mission_brief.text and yard.mission_record.text == "최고 기록 없음","selected mission shows objective and empty record")
	var skirmish: Dictionary = yard._mission("skirmish")
	verify(not skirmish.is_empty() and not str(skirmish.objective).is_empty(),"skirmish has a mission brief")
	yard._launch()
	await process_frame
	var duel = yard.duel
	verify(duel.is_visible_in_tree() and duel.battle.result == "active","selected mission launches a real battle")
	if not duel.is_visible_in_tree():
		quit(1)
		return
	duel.set_physics_process(false)
	verify(duel.battle.mission.get("id","") == "skirmish","battle receives selected mission id")
	duel._choose_type("cosmoteer.laser_blaster_small")
	for i in 240:
		if duel.battle.result != "active":
			break
		duel._physics_process(0.5)
	verify(duel.battle.result == "win","skirmish can complete through normal combat simulation")
	verify(yard.debrief_layer.visible and "목표:" in yard.debrief_text.text and "전투" in yard.debrief_text.text and "손상 부품" in yard.debrief_text.text,"mission debrief shows objective, battle statistics and refit status")
	verify(yard.operations.completed.has("skirmish") and FileAccess.file_exists(progress_path),"win is persisted before returning to the yard")
	var record: Dictionary = yard.operations.completed.get("skirmish",{})
	verify(record.has("elapsed") and record.has("shots") and record.has("hits"),"saved record contains elapsed time, shots and hits")
	verify(yard.operations.is_unlocked("disarm") and not yard.operations.is_unlocked("escort"),"skirmish win unlocks disarm only")
	var reloaded = load("res://sim/operations.gd").new(progress_path)
	verify(reloaded.completed.has("skirmish") and reloaded.is_unlocked("disarm"),"progress survives reload")
	await screenshot("operations_debrief")
	yard._leave_debrief()
	verify(yard.editor.visible and not duel.is_visible_in_tree() and yard.mission_record.text.contains("최고"),"return enables refit and displays the best record")
	_select_mission(yard,"disarm")
	var disarm: Dictionary = yard._mission("disarm")
	verify(disarm.get("objective","") != "" and yard.mission_brief.text.contains("목표:"),"disarm mission objective is selectable after unlock")
	yard._launch()
	await process_frame
	verify(yard.duel.is_visible_in_tree() and yard.duel.battle.mission.get("id","") == "disarm","disarm launches as a distinct mission")
	yard.duel.set_physics_process(false)
	yard.duel._choose_type("cosmoteer.laser_blaster_small")
	for i in 240:
		if yard.duel.battle.result != "active":
			break
		yard.duel._physics_process(0.5)
	verify(yard.duel.battle.result == "win" and yard.operations.is_unlocked("escort"),"disarm completion unlocks the escort operation")
	_select_mission(yard,"escort")
	verify(yard.mission_brief.text.contains("목표:"),"escort summary appears in Korean")
	yard._launch()
	await process_frame
	verify(yard.duel.is_visible_in_tree() and yard.duel.battle.mission.get("id","") == "escort","escort launches as a distinct mission")
	yard.duel._leave()
	verify(yard.editor.visible,"active escort can return for refit")
	print("Operations UI checks: %d; failures: %d" % [checks,failures])
	DirAccess.remove_absolute(absolute_progress_path)
	quit(int(failures>0))

func _select_mission(yard, mission_id: String) -> void:
	for i in yard.mission_picker.item_count:
		if yard.mission_picker.get_item_metadata(i) == mission_id:
			yard.mission_picker.select(i)
			yard.mission_picker.item_selected.emit(i)
			return
	verify(false,"mission picker contains "+mission_id)
