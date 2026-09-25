class_name GameHud
extends CanvasLayer

var player: VoxelPlayer
var hotbar: HBoxContainer
var title_label: Label
var feedback_label: Label
var generation_label: Label
var slot_panels: Array[PanelContainer] = []
var feedback_timer := 0.0
var challenge_label: Label
var development_label: Label
var performance_label: Label
var development_backdrop: ColorRect
var world: VoxelWorld
var wayfinding := CaveWayfinding.new()
var navigation_panel: ColorRect
var navigation_title: Label
var navigation_detail: Label
var navigation_status := ""
var tool_label: Label
var mining_panel: ColorRect
var mining_label: Label
var mining_bar: ProgressBar
var survival: ForestSurvival
var survival_backdrop: ColorRect
var survival_label: Label


func setup(target_player: VoxelPlayer, target_world: VoxelWorld, target_survival: ForestSurvival = null) -> void:
	player = target_player
	world = target_world
	survival = target_survival
	_build_ui()
	player.inventory.changed.connect(_refresh_hotbar)
	player.selection_changed.connect(func(_slot: int) -> void: _refresh_hotbar())
	player.action_feedback.connect(_show_feedback)
	player.challenge_changed.connect(_refresh_challenge)
	player.debug_visibility_changed.connect(_refresh_development)
	player.stance_changed.connect(func(_crouched: bool) -> void: _refresh_challenge())
	target_world.generation_completed.connect(_show_generation)
	_refresh_hotbar()
	_refresh_challenge()
	_refresh_development()
	_show_generation({"seed": target_world.layout.seed, "size": target_world.layout.size, "blocks": target_world.layout.cells.size(), "signature": target_world.layout.signature})
	if survival != null:
		survival.status_changed.connect(_refresh_survival)
		_refresh_survival(survival.day, survival._phase(), survival.fuel_seconds, survival.rescued, ForestSurvival.RESCUE_COUNT)


func _process(delta: float) -> void:
	_refresh_navigation()
	_refresh_mining()
	if player != null and player.performance_hud_visible:
		performance_label.text = "FPS %d  |  engine %.1f MiB  |  chunks %d\nEdits %d  |  last rebuild %.2f ms" % [Engine.get_frames_per_second(), Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0, world.chunk_nodes.size(), world.chunk_store.edits.size(), float(world.last_rebuild.get("elapsed_us", 0)) / 1000.0]
	if feedback_timer > 0.0:
		feedback_timer -= delta
		if feedback_timer <= 0.0:
			feedback_label.text = "Hold LMB mine  •  RMB place  •  Shift crouch  •  Ctrl sprint  •  R return  •  Esc cursor"


func _build_ui() -> void:
	var root := Control.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)
	var status_backdrop := ColorRect.new()
	status_backdrop.position = Vector2(10, 8)
	status_backdrop.size = Vector2(620, 86)
	status_backdrop.color = Color(0.055, 0.08, 0.11, 0.88)
	status_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(status_backdrop)
	title_label = Label.new()
	title_label.position = Vector2(18, 14)
	title_label.text = "FOREST SURVIVAL  •  PROTOTYPE" if survival != null else "VOXEL FRONTIER  •  GODOT M01–M05 PREVIEW"
	title_label.add_theme_font_size_override("font_size", 18)
	root.add_child(title_label)
	generation_label = Label.new()
	generation_label.position = Vector2(18, 40)
	generation_label.add_theme_color_override("font_color", Color("#c4d5b9"))
	root.add_child(generation_label)
	challenge_label = Label.new()
	challenge_label.position = Vector2(18, 66)
	root.add_child(challenge_label)
	survival_backdrop = ColorRect.new()
	survival_backdrop.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	survival_backdrop.offset_left = -370
	survival_backdrop.offset_top = 10
	survival_backdrop.offset_right = -12
	survival_backdrop.offset_bottom = 86
	survival_backdrop.color = Color(0.035, 0.06, 0.085, 0.9)
	survival_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(survival_backdrop)
	survival_label = Label.new()
	survival_label.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	survival_label.offset_left = -356
	survival_label.offset_top = 18
	survival_label.offset_right = -20
	survival_label.offset_bottom = 80
	survival_label.add_theme_font_size_override("font_size", 18)
	survival_label.add_theme_color_override("font_color", Color("#e8f0d0"))
	root.add_child(survival_label)
	development_backdrop = ColorRect.new()
	development_backdrop.position = Vector2(10, 102)
	development_backdrop.color = Color(0.055, 0.08, 0.11, 0.92)
	development_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(development_backdrop)
	development_label = Label.new()
	development_label.position = Vector2(18, 108)
	development_label.text = "DEVELOPMENT  Ctrl+0 hide\nCtrl+1 fill  |  Ctrl+2 clear  |  Ctrl+3 diagnose\nCtrl+8 save  |  Ctrl+9 load  |  R return\nAlt+1 performance  |  Alt+2 voxel axes  |  Alt+3 profile"
	development_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	development_label.add_theme_constant_override("shadow_offset_x", 2)
	development_label.add_theme_constant_override("shadow_offset_y", 2)
	root.add_child(development_label)
	performance_label = Label.new()
	performance_label.position = Vector2(18, 214)
	performance_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	performance_label.add_theme_constant_override("shadow_offset_x", 2)
	performance_label.add_theme_constant_override("shadow_offset_y", 2)
	root.add_child(performance_label)
	var crosshair := Label.new()
	crosshair.text = "+"
	crosshair.add_theme_font_size_override("font_size", 24)
	crosshair.set_anchors_preset(Control.PRESET_CENTER)
	crosshair.position = Vector2(-7, -17)
	root.add_child(crosshair)
	tool_label = Label.new()
	tool_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	tool_label.position = Vector2(-340, -240)
	tool_label.size.x = 680
	tool_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tool_label.add_theme_color_override("font_shadow_color", Color.BLACK)
	tool_label.add_theme_constant_override("shadow_offset_x", 2)
	tool_label.add_theme_constant_override("shadow_offset_y", 2)
	root.add_child(tool_label)
	mining_panel = ColorRect.new()
	mining_panel.set_anchors_preset(Control.PRESET_CENTER)
	mining_panel.position = Vector2(-220, 34)
	mining_panel.size = Vector2(440, 60)
	mining_panel.color = Color(0.035, 0.06, 0.085, 0.93)
	mining_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mining_panel.visible = false
	root.add_child(mining_panel)
	mining_label = Label.new()
	mining_label.position = Vector2(12, 4)
	mining_panel.add_child(mining_label)
	mining_bar = ProgressBar.new()
	mining_bar.position = Vector2(12, 33)
	mining_bar.size = Vector2(416, 16)
	mining_bar.max_value = 1.0
	mining_bar.show_percentage = false
	mining_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mining_panel.add_child(mining_bar)
	navigation_panel = ColorRect.new()
	navigation_panel.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	navigation_panel.position = Vector2(-340, -208)
	navigation_panel.size = Vector2(680, 68)
	navigation_panel.color = Color(0.035, 0.085, 0.11, 0.94)
	navigation_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	navigation_panel.visible = false
	root.add_child(navigation_panel)
	navigation_title = Label.new()
	navigation_title.position = Vector2(16, 7)
	navigation_title.add_theme_font_size_override("font_size", 18)
	navigation_title.add_theme_color_override("font_color", Color("#91e0df"))
	navigation_panel.add_child(navigation_title)
	navigation_detail = Label.new()
	navigation_detail.position = Vector2(16, 36)
	navigation_detail.add_theme_font_size_override("font_size", 16)
	navigation_panel.add_child(navigation_detail)
	var feedback_backdrop := ColorRect.new()
	feedback_backdrop.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	feedback_backdrop.position = Vector2(-450, -128)
	feedback_backdrop.size = Vector2(900, 32)
	feedback_backdrop.color = Color(0.055, 0.08, 0.11, 0.92)
	feedback_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(feedback_backdrop)
	feedback_label = Label.new()
	feedback_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	feedback_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	feedback_label.position = Vector2(-450, -126)
	feedback_label.size = Vector2(900, 28)
	feedback_label.text = "Hold LMB mine  •  RMB place  •  F interact  •  1–9 select  •  Shift crouch"
	root.add_child(feedback_label)
	hotbar = HBoxContainer.new()
	hotbar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hotbar.alignment = BoxContainer.ALIGNMENT_CENTER
	hotbar.add_theme_constant_override("separation", 5)
	hotbar.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	hotbar.position = Vector2(-382, -86)
	hotbar.size = Vector2(764, 58)
	root.add_child(hotbar)
	for slot in BlockRegistry.HOTBAR_SLOT_COUNT:
		var panel := PanelContainer.new()
		panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
		panel.custom_minimum_size = Vector2(80, 56)
		var label := Label.new()
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		panel.add_child(label)
		hotbar.add_child(panel)
		slot_panels.append(panel)


func _refresh_hotbar() -> void:
	for slot in slot_panels.size():
		var definition := ItemRegistry.definition(player.inventory.item_at(slot))
		var panel := slot_panels[slot]
		var label := panel.get_child(0) as Label
		label.text = "%d · %s\n×%d" % [slot + 1, _short_name(definition.get("name", "Empty")), player.inventory.count(slot)]
		label.add_theme_font_size_override("font_size", 14)
		label.add_theme_color_override("font_color", Color("#141c22") if slot == player.selected_slot else Color.WHITE)
		var style := StyleBoxFlat.new()
		style.bg_color = Color("#d7bd65") if slot == player.selected_slot else Color("#252b32cc")
		style.border_width_left = 3
		style.border_width_top = 3
		style.border_width_right = 3
		style.border_width_bottom = 3
		style.border_color = Color.WHITE if slot == player.selected_slot else Color("#76808a")
		panel.add_theme_stylebox_override("panel", style)


func _show_feedback(message: String) -> void:
	feedback_label.text = message
	feedback_timer = 2.5


func _refresh_survival(day: int, phase: String, fuel: float, rescued: int, total: int) -> void:
	if not is_instance_valid(survival_label): return
	survival_label.text = "DAY %02d  ·  %s\nCAMPFIRE %s  ·  RESCUES %d/%d" % [day, phase, _format_fuel(fuel), rescued, total]
	var low_fuel := fuel <= 12.0
	survival_label.add_theme_color_override("font_color", Color("#ff8c6e") if low_fuel and phase == "NIGHT" else Color("#e8f0d0"))
	survival_backdrop.color = Color(0.14, 0.035, 0.025, 0.94) if low_fuel and phase == "NIGHT" else Color(0.035, 0.06, 0.085, 0.9)


func _format_fuel(seconds: float) -> String:
	var whole_seconds := maxi(0, roundi(seconds))
	return "%02d:%02d" % [int(whole_seconds / 60), whole_seconds % 60]


func _show_generation(summary: Dictionary) -> void:
	wayfinding.configure(world.layout)
	generation_label.text = "Seed %d  •  %d×%d  •  %d blocks  •  hash %d" % [summary.seed, summary.size, summary.size, summary.blocks, summary.signature]


func _refresh_navigation() -> void:
	if player == null or world.gameplay_locked() or player.controls_open:
		navigation_panel.visible = false
		return
	var reading := wayfinding.sample(world.chunk_store, player.global_position, player.rotation.y)
	navigation_panel.visible = reading.visible
	if not reading.visible: return
	var title := "CAVE ATLAS  /  %s  |  Facing %s" % [str(reading.area).to_upper(), reading.heading]
	if navigation_title.text != title: navigation_title.text = title
	if navigation_detail.text != reading.text: navigation_detail.text = reading.text
	if navigation_status != reading.status:
		navigation_status = reading.status
		navigation_detail.add_theme_color_override("font_color", Color("#ffc58c") if reading.status == "blocked" else Color("#e0edee"))


func _refresh_mining() -> void:
	var gear := player.mining_tools
	var selected := MiningTools.definition(gear.selected)
	var text := "TOOL: %s %s | T next / Shift+T previous" % [selected.name, "" if gear.selected == 0 else "%d/%d" % [gear.remaining[gear.selected], MiningTools.DURABILITY[gear.selected]]]
	if int(player.inventory.equipment[0][0]) >= 0:
		var stack: Array = player.inventory.equipment[0]
		text = "EQUIPPED: %s  %d/%d | E inventory / F equipment" % [ItemRegistry.definition(int(stack[0])).name, stack[2], ItemRegistry.definition(int(stack[0])).durability]
	if tool_label.text != text: tool_label.text = text
	tool_label.visible = not player.controls_open and not world.gameplay_locked()
	mining_panel.visible = tool_label.visible and player.mining_material >= 0 and player.mining_held
	if not mining_panel.visible: return
	var progress := clampf(player.mining_elapsed / player.mining_duration, 0, 1)
	mining_label.text = "%s  %d%%  | %s" % [BlockRegistry.by_material(player.mining_material).name, roundi(progress * 100), "Harvest" if gear.can_harvest(player.mining_material) else "Wrong tool: NO DROP"]
	mining_bar.value = progress


func _short_name(value: String) -> String:
	return value.replace("Cobblestone", "Cobble").replace("Mossy cobblestone", "Moss").replace("Stone bricks", "Brick").replace("Oak planks", "Plank").replace("Grass block", "Grass").replace("Snow block", "Snow").replace("Oak log", "Log")


func _refresh_challenge() -> void:
	if survival != null:
		challenge_label.text = "Mine %d  |  Place %d%s" % [player.total_mined, player.total_placed, "  |  CROUCH" if player.crouched else ""]
	else:
		challenge_label.text = "BUILDER %s  |  Mine %d/8  |  Place %d/4%s" % ["COMPLETE" if player.challenge_complete() else "CHALLENGE", mini(player.total_mined, 8), mini(player.total_placed, 4), "  |  CROUCH" if player.crouched else ""]
	challenge_label.add_theme_color_override("font_color", Color("#a4e895") if survival == null and player.challenge_complete() else Color("#efd58d"))


func _refresh_development() -> void:
	development_label.visible = player.cheat_hud_visible
	performance_label.visible = player.performance_hud_visible
	performance_label.position.y = 214 if player.cheat_hud_visible else 108
	development_backdrop.visible = player.cheat_hud_visible or player.performance_hud_visible
	development_backdrop.size = Vector2(620, (166 if player.performance_hud_visible else 106) if player.cheat_hud_visible else 60)
