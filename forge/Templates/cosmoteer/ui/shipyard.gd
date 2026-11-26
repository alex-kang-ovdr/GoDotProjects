extends VBoxContainer

const Design = preload("res://sim/ship_design.gd")
const Battle = preload("res://sim/ship_battle.gd")
const Grid = preload("res://ui/ship_grid.gd")
const Duel = preload("res://ui/engagement.gd")
const RocketNetwork = preload("res://sim/rocket_network.gd")
const EngineRoom = preload("res://sim/engine_room.gd")
const Operations = preload("res://sim/operations.gd")
const RESULTS := {"win":"승리", "loss":"패배", "draw":"무승부"}
const OUTCOMES := {"own_bridge":"아군 함교 파괴", "enemy_bridge":"적 함교 제압", "protected_bridge":"보호 대상 함교 파괴",
	"own_weapons":"아군 무장 상실", "disarmed":"적 무장 제거", "survived":"대피 시간 확보",
	"mutual_bridge":"양쪽 함교 파괴", "mutual_weapons":"양쪽 무장 상실", "stalemate":"교전 교착"}
const CORE := {
	"cosmoteer.corridor":"통로", "cosmoteer.reactor_small":"소형 반응로",
	"cosmoteer.reactor_med":"중형 반응로", "cosmoteer.reactor_large":"대형 반응로",
	"cosmoteer.crew_quarters_small":"소형 선실", "cosmoteer.crew_quarters_med":"중형 선실",
	"cosmoteer.control_room_small":"소형 함교", "cosmoteer.fire_extinguisher":"소화기",
	"cosmoteer.laser_blaster_small":"소형 레이저", "cosmoteer.laser_blaster_large":"대형 레이저",
	"cosmoteer.cannon_med":"중형 캐논", "cosmoteer.cannon_large":"대형 캐논",
	"cosmoteer.cannon_deck":"갑판포", "cosmoteer.missile_launcher":"미사일 발사기",
	"cosmoteer.disruptor":"디스럽터", "cosmoteer.ion_beam_emitter":"이온 빔 방출기",
	"cosmoteer.ion_beam_prism":"이온 빔 프리즘",
	"cosmoteer.flak_cannon_large":"플랙 대공포",
	"cosmoteer.chaingun":"체인건", "cosmoteer.chaingun_magazine":"체인건 탄창",
	"cosmoteer.railgun_launcher":"레일건 발사부", "cosmoteer.railgun_accelerator":"레일건 가속기",
	"cosmoteer.railgun_loader":"레일건 장전기",
	"cosmoteer.shield_gen_small":"소형 방어막", "cosmoteer.shield_gen_large":"대형 방어막",
	"cosmoteer.point_defense":"근접 방어 포탑",
	"cosmoteer.armor":"장갑", "cosmoteer.armor_2x1":"2×1 장갑",
	"cosmoteer.thruster_small":"소형 추진기", "cosmoteer.thruster_small_2way":"2방향 소형 추진기",
	"cosmoteer.thruster_small_3way":"3방향 소형 추진기", "cosmoteer.thruster_med":"중형 추진기",
	"cosmoteer.thruster_large":"대형 추진기", "cosmoteer.thruster_huge":"초대형 추진기",
	"cosmoteer.thruster_boost":"부스트 추진기", "cosmoteer.thruster_rocket_nozzle":"로켓 노즐",
	"cosmoteer.thruster_rocket_extender":"로켓 연장기", "cosmoteer.thruster_rocket_battery":"로켓 배터리",
	EngineRoom.ID:"엔진룸",
}

var lab
var design = Design.new()
var editor := VBoxContainer.new()
var duel
var grid
var depart_button: Button
var load_button: Button
var undo_button: Button
var erase_button: Button
var mirror_button: Button
var preset_picker := OptionButton.new()
var selection := OptionButton.new()
var parts_list := ItemList.new()
var search := LineEdit.new()
var selected_id := "cosmoteer.corridor"
var turn := 0
var erasing := false
var mirror_mode := false
var history: Array[Dictionary] = []
var save_path := "user://ship_design.json"
var part_info: Label
var note: Label
var readiness: Label
var rocket_preview: Label
var resources: Label
var hover_info: Label
var operations
var operations_path := "user://lab_operations.json"
var mission_picker := OptionButton.new()
var mission_brief: Label
var mission_record: Label
var debrief_layer: CanvasLayer
var debrief_text: Label
var selected_mission_id := ""
var last_mission_result := ""
var _recorded_battle := false

static func display_name(id: String) -> String:
	return CORE.get(id,id.trim_prefix("cosmoteer."))

func build(host) -> void:
	lab = host
	operations = Operations.new(operations_path)
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	if not design.load_error.is_empty():
		add_child(lab.label(design.load_error,18,lab.GOLD))
		return
	design.flight_starter()
	add_child(editor)
	editor.size_flags_vertical = Control.SIZE_EXPAND_FILL
	editor.add_theme_constant_override("separation",10)
	var heading := HBoxContainer.new()
	editor.add_child(heading)
	heading.add_child(lab.label("함선 조립",28,lab.WHITE))
	heading.add_spacer(false)
	heading.add_child(lab.button("설계 저장",_save_design))
	load_button = lab.button("불러오기",_load_design)
	heading.add_child(load_button)
	depart_button = lab.button("전투 출격  →",_launch)
	depart_button.modulate = lab.GREEN
	heading.add_child(depart_button)
	_build_missions()
	var body := HBoxContainer.new()
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation",14)
	editor.add_child(body)
	var deck: VBoxContainer = lab.panel_column(body)
	var toolbar := HBoxContainer.new()
	deck.add_child(toolbar)
	toolbar.add_child(lab.button("회전  R",_rotate))
	mirror_button = lab.button("대칭  M",_toggle_mirror)
	toolbar.add_child(mirror_button)
	erase_button = lab.button("철거",_toggle_erase)
	toolbar.add_child(erase_button)
	undo_button = lab.button("되돌리기",_undo)
	toolbar.add_child(undo_button)
	toolbar.add_spacer(false)
	toolbar.add_child(lab.button("기본 함선",_preset))
	toolbar.add_child(lab.button("특수 추진 실험선",_special_preset))
	preset_picker.add_item("고급 함선 선택")
	preset_picker.add_item("방어막·미사일 함선")
	preset_picker.add_item("이온·레일건 전함")
	preset_picker.add_item("프리즘·플랙 구축함")
	preset_picker.add_item("갑판포 중전함")
	preset_picker.item_selected.connect(_on_advanced_preset)
	toolbar.add_child(preset_picker)
	toolbar.add_child(lab.button("비우기",_clear))
	grid = Grid.new()
	grid.design = design
	grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	grid.cell_action.connect(_edit_cell)
	grid.hover_cell.connect(_hover)
	grid.hover_exited.connect(_hover.bind(Vector2i(-1,-1)))
	deck.add_child(grid)
	hover_info = lab.label("좌클릭 배치   ·   우클릭 철거   ·   R 회전",15,lab.SOFT)
	deck.add_child(hover_info)
	var palette: VBoxContainer = lab.panel_column(body)
	palette.get_parent().size_flags_horizontal = Control.SIZE_SHRINK_END
	palette.get_parent().custom_minimum_size.x = 285
	palette.add_child(lab.label("부품 목록",20,lab.WHITE))
	selection.add_item("전투용 기본 부품")
	selection.add_item("전체 부품  ·  %d종" % design.by_id.size())
	selection.item_selected.connect(func(_i): _populate())
	palette.add_child(selection)
	search.placeholder_text = "부품명 또는 ID 검색"
	search.clear_button_enabled = true
	search.text_changed.connect(func(_s): _populate())
	palette.add_child(search)
	parts_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	parts_list.fixed_column_width = 235
	parts_list.add_theme_constant_override("v_separation",6)
	parts_list.item_selected.connect(_pick_part)
	palette.add_child(parts_list)
	part_info = _wrap("",14,lab.SOFT)
	part_info.custom_minimum_size.y = 63
	palette.add_child(part_info)
	var foot: VBoxContainer = lab.panel_column(editor)
	readiness = _wrap("",16,lab.GREEN)
	resources = _wrap("",14,lab.SOFT)
	note = _wrap("기본 함선은 조종 준비가 되어 있습니다. 추진기를 회전하면 힘을 내는 방향이 바뀝니다.",15,lab.WHITE)
	foot.add_child(readiness)
	rocket_preview = _wrap("",15,lab.GOLD)
	foot.add_child(rocket_preview)
	foot.add_child(resources)
	foot.add_child(note)
	duel = Duel.new()
	add_child(duel)
	duel.build(lab)
	duel.return_requested.connect(_return_to_yard)
	duel.finished.connect(_on_battle_finished)
	duel.hide()
	_populate()
	_design_changed()
	_refresh_mission_card()
	_build_debrief()

func configure_operations(path: String) -> void:
	operations_path = path
	operations = Operations.new(path)
	_refresh_mission_picker()
	_refresh_mission_card()

func _build_missions() -> void:
	var panel: VBoxContainer = lab.panel_column(editor)
	panel.add_theme_constant_override("separation",4)
	var row := HBoxContainer.new()
	panel.add_child(row)
	row.add_child(lab.label("임무 선택",15,lab.WHITE))
	mission_picker.custom_minimum_size.x = 220
	mission_picker.item_selected.connect(_on_mission_selected)
	row.add_child(mission_picker)
	mission_brief = lab.label("자유 교전 · 작전 목표와 진행 기록 없이 출격합니다.",14,lab.SOFT)
	mission_brief.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mission_brief.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.add_child(mission_brief)
	mission_record = lab.label("기록 없음",13,lab.GOLD)
	mission_record.custom_minimum_size.x = 185
	mission_record.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(mission_record)
	_refresh_mission_picker()

func _refresh_mission_picker() -> void:
	if mission_picker == null:
		return
	mission_picker.clear()
	mission_picker.add_item("자유 교전")
	mission_picker.set_item_metadata(0,"")
	var selected_index := 0
	for mission in operations.missions:
		var mission_id: String = mission.id
		var unlocked: bool = operations.is_unlocked(mission_id)
		var caption: String = str(mission.title) if unlocked else "잠금 · " + str(mission.title)
		var index := mission_picker.item_count
		mission_picker.add_item(caption)
		mission_picker.set_item_metadata(index,mission_id)
		mission_picker.set_item_disabled(index,not unlocked)
		if mission_id == selected_mission_id:
			selected_index = index
	mission_picker.select(selected_index)
	selected_mission_id = str(mission_picker.get_item_metadata(selected_index))

func _on_mission_selected(index: int) -> void:
	selected_mission_id = str(mission_picker.get_item_metadata(index))
	_refresh_mission_card()

func _mission(id: String) -> Dictionary:
	for mission in operations.missions:
		if mission.id == id:
			return mission
	return {}

func _refresh_mission_card() -> void:
	if mission_brief == null or operations == null:
		return
	if not operations.load_error.is_empty():
		mission_brief.text = "작전 데이터 오류 · " + operations.load_error
		mission_record.text = "임무 진행 기록 사용 불가"
		return
	if selected_mission_id.is_empty():
		mission_brief.text = "자유 교전 · 작전 목표와 진행 기록 없이 출격합니다."
		mission_record.text = "진행 데이터 오류" if not operations.progress_error.is_empty() else "기록 없음"
		return
	var mission := _mission(selected_mission_id)
	if mission.is_empty():
		return
	mission_brief.text = "목표: " + str(mission.summary)
	var completed: Dictionary = operations.completed.get(selected_mission_id,{})
	if not operations.progress_error.is_empty():
		mission_record.text = "진행 데이터 오류"
	elif completed.is_empty():
		mission_record.text = "최고 기록 없음"
	else:
		mission_record.text = "최고 %.1f초  ·  발사 %d  ·  명중 %d" % [float(completed.get("elapsed",0.0)),int(completed.get("shots",0)),int(completed.get("hits",0))]

func _build_debrief() -> void:
	debrief_layer = CanvasLayer.new()
	debrief_layer.layer = 10
	duel.add_child(debrief_layer)
	var backdrop := ColorRect.new()
	backdrop.color = Color(0.02,0.04,0.06,0.72)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	debrief_layer.add_child(backdrop)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	debrief_layer.add_child(center)
	var card: VBoxContainer = lab.panel_column(center)
	card.custom_minimum_size = Vector2(560,0)
	card.add_child(lab.label("임무 브리핑 · 결과",23,lab.WHITE))
	debrief_text = lab.label("",16,lab.SOFT)
	debrief_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	card.add_child(debrief_text)
	card.add_child(lab.button("조선소로 돌아가 재정비",_leave_debrief))
	debrief_layer.hide()

func _on_battle_finished(result: String) -> void:
	if _recorded_battle:
		return
	_recorded_battle = true
	if selected_mission_id.is_empty():
		return
	var saved := true
	if result == "win":
		saved = operations.record_win(selected_mission_id,duel.battle.elapsed,duel.battle.player.shots,duel.battle.player.hits)
	var mission := _mission(selected_mission_id)
	var completed: Dictionary = operations.completed.get(selected_mission_id,{})
	var record: String = "최고 기록 %.1f초 · 발사 %d · 명중 %d" % [float(completed.get("elapsed",0.0)),int(completed.get("shots",0)),int(completed.get("hits",0))] if not completed.is_empty() else "승리하면 첫 기록이 저장됩니다."
	if not saved:
		record = "기록 저장 실패: " + operations.progress_error + "\n" + record
	var next_mission := _next_unlocked_mission()
	var next_line := "다음 임무: %s" % next_mission.title if not next_mission.is_empty() else "모든 임무가 열렸습니다. 함선을 정비하고 다시 출격하세요."
	var damaged := 0
	for part in duel.battle.player.parts.values():
		damaged += int(part.hp < part.max_hp)
	var crew_alive := 0
	for crew in duel.battle.player.crew:
		crew_alive += int(crew.alive)
	var refit := "전투 종료: %s · 손상 부품 %d · 생존 승무원 %d/%d" % [OUTCOMES.get(duel.battle.outcome_reason,"교전 종료"),damaged,crew_alive,duel.battle.player.crew.size()]
	debrief_text.text = "%s · %s\n목표: %s\n전투 %.1f초 · 발사 %d · 명중 %d\n%s\n%s\n%s" % [mission.title,RESULTS.get(result,result),mission.summary,duel.battle.elapsed,duel.battle.player.shots,duel.battle.player.hits,refit,record,next_line]
	debrief_layer.show()
	_refresh_mission_picker()
	_refresh_mission_card()

func _next_unlocked_mission() -> Dictionary:
	for mission in operations.missions:
		if not operations.is_unlocked(mission.id):
			continue
		if not operations.completed.has(mission.id):
			return mission
	return {}

func _leave_debrief() -> void:
	debrief_layer.hide()
	_return_to_yard()

func _wrap(caption: String, points: int, color: Color) -> Label:
	var line: Label = lab.label(caption,points,color)
	line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return line

func _populate() -> void:
	parts_list.clear()
	var ids: Array = CORE.keys() if selection.selected == 0 else design.by_id.keys()
	if selection.selected != 0:
		ids.sort()
	var query := search.text.strip_edges().to_lower()
	for id in ids:
		if not design.by_id.has(id) or (not query.is_empty() and not (id+" "+display_name(id)).to_lower().contains(query)):
			continue
		var idx := parts_list.add_item(display_name(id))
		parts_list.set_item_metadata(idx,id)
		if id == selected_id:
			parts_list.select(idx)
	if parts_list.item_count > 0 and not parts_list.is_anything_selected():
		parts_list.select(0)
		_pick_part(0)
	elif parts_list.item_count == 0:
		selected_id = ""
	_sync_tool()

func _pick_part(index: int) -> void:
	selected_id = parts_list.get_item_metadata(index)
	turn = 0
	erasing = false
	_sync_tool()

func _sync_tool() -> void:
	grid.selected_id = selected_id
	grid.rotation_quarters = turn
	grid.erase_mode = erasing
	grid.mirror_mode = mirror_mode
	grid.queue_redraw()
	erase_button.modulate = lab.GOLD if erasing else Color.WHITE
	if mirror_button != null:
		mirror_button.modulate = lab.GREEN if mirror_mode else Color.WHITE
	if selected_id.is_empty():
		part_info.text = "일치하는 부품이 없습니다."
		return
	var row: Dictionary = design.by_id[selected_id]
	var shape := Vector2i(int(row.size[0]),int(row.size[1]))
	if turn % 2:
		shape = Vector2i(shape.y,shape.x)
	var role := "선체로 배치 · 고유 장치 동작 미구현" if not CORE.has(selected_id) else "전투용 부품"
	var details := "체력 %d   ·   %s" % [row.max_health,role]
	if selected_id == EngineRoom.ID:
		details = "변을 맞댄 추진기에 오버클럭 제공\n추력 +%d%% · 추진 전력 소모 +%d%%" % [
			roundi((EngineRoom.FORCE_MULTIPLIER-1)*100), roundi((EngineRoom.POWER_MULTIPLIER-1)*100)
		]
	elif row.stats.has("special_propulsion"):
		var spec: Dictionary = row.stats.special_propulsion
		var force_dir: String = ["↑","→","↓","←"][turn]
		match selected_id:
			"cosmoteer.thruster_boost":
				details = "힘 %s   일반 %d → 부스트 %d\n전력 %d 이상에서 B로 전환" % [force_dir,spec.normal_force,spec.boost_force,spec.battery_toggle_on]
			"cosmoteer.thruster_rocket_nozzle":
				details = "힘 %s   기본 %d · 담당 승무원 %d명\n연장기는 힘 방향으로 같은 회전각에 연결" % [force_dir,spec.base_force,spec.crew_required]
			"cosmoteer.thruster_rocket_extender":
				details = "노즐과 방향을 맞춰 일렬로 연결\n전력을 공급하면 추력과 최대 소모 증가"
			"cosmoteer.thruster_rocket_battery":
				details = "저장 전력 %d · 같은 방향으로 배치\n노즐이나 연장기 측면의 연결부에 장착" % spec.local_battery_capacity
	elif row.stats.has("nozzles"):
		var arrows := PackedStringArray()
		for nozzle in row.stats.nozzles:
			# Source angle points down the exhaust. Acceleration points back into the hull.
			var axis := posmod(roundi(float(nozzle.rotation_deg)/90.0)+turn+2,4)
			arrows.append(["→","↓","←","↑"][axis])
		details = "추력 %d / 노즐    힘 방향 %s\n최대 출력까지 %.1f초" % [row.stats.thrust_force," ".join(arrows),row.stats.ramp_up]
	part_info.text = "%s   ·   %d × %d   ·   %d°\n%s\n%s" % [display_name(selected_id),shape.x,shape.y,turn*90,details,_cost_text(row.resources)]

func _rotate() -> void:
	turn = (turn + 1) % 4
	_sync_tool()

func _toggle_erase() -> void:
	erasing = not erasing
	_sync_tool()

func _toggle_mirror() -> void:
	mirror_mode = not mirror_mode
	note.text = "상하 대칭 편집 켜짐 · 중심선(y=5) 기준으로 좌우 현에 동시 배치/철거합니다." if mirror_mode else "상하 대칭 편집 꺼짐."
	_sync_tool()

func _unhandled_key_input(event: InputEvent) -> void:
	if not is_visible_in_tree() or not editor.visible or search.has_focus():
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_R:
			_rotate()
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_M:
			_toggle_mirror()
			get_viewport().set_input_as_handled()

func _edit_cell(cell: Vector2i, erase: bool) -> void:
	if not editor.visible:
		return
	var previous: Dictionary = design.serialize()
	if erase or erasing:
		var removed: bool = design.remove_at(cell)
		if mirror_mode:
			var mcell := Vector2i(cell.x, Design.GRID_SIZE.y - 1 - cell.y)
			if mcell != cell:
				removed = design.remove_at(mcell) or removed
		if not removed:
			note.text = "철거할 부품이 없는 칸입니다."
			return
	else:
		if selected_id.is_empty() or not design.place(selected_id,cell,turn):
			note.text = "빈칸과 부품 크기를 확인하세요. 부품끼리 겹치거나 격자를 벗어날 수 없습니다."
			return
		if mirror_mode:
			var row: Dictionary = design.by_id[selected_id]
			var dims := Vector2i(int(row.size[0]), int(row.size[1]))
			if turn % 2 == 1:
				dims = Vector2i(dims.y, dims.x)
			var mirrored := Design.mirror_vertical(cell, dims, turn)
			if mirrored.cell != cell:
				design.place(selected_id, mirrored.cell, int(mirrored.rotation))
	_remember(previous)
	note.text = "대칭 설계를 변경했습니다." if mirror_mode else "설계를 변경했습니다."
	_design_changed()
	_hover(cell)

func _hover(cell: Vector2i) -> void:
	var part: Dictionary = design.part_at(cell)
	hover_info.text = "좌클릭 배치   ·   우클릭 철거   ·   R 회전"
	if not part.is_empty():
		hover_info.text = "%s    %d × %d    ·    우클릭으로 철거" % [display_name(part.id),part.size.x,part.size.y]

func _remember(previous: Dictionary) -> void:
	history.append(previous)
	if history.size() > 64:
		history.pop_front()

func _undo() -> void:
	if history.is_empty() or not design.restore(history.back()):
		return
	history.pop_back()
	note.text = "이전 설계로 되돌렸습니다."
	_design_changed()

func _clear() -> void:
	if design.parts.is_empty():
		return
	_remember(design.serialize())
	for part in design.parts.duplicate():
		design.remove_at(part.cell)
	note.text = "빈 격자에서 새 함선을 조립하세요."
	_design_changed()

func _preset() -> void:
	_remember(design.serialize())
	design.flight_starter()
	note.text = "기본 함선을 배치했습니다."
	_design_changed()

func _special_preset() -> void:
	_remember(design.serialize())
	design.special_starter()
	note.text = "출격 후 O로 오버클럭, B로 부스트를 켭니다. 엔진룸에 맞닿은 추진기에 오버클럭이 적용됩니다."
	_design_changed()

func _cruiser_preset() -> void:
	_remember(design.serialize())
	design.shield_missile_cruiser()
	note.text = "방어막 생성기·유도 미사일·근접 방어 포탑·중형 캐논을 탑재한 순양함 설계입니다."
	_design_changed()

func _on_advanced_preset(index: int) -> void:
	match index:
		1: _cruiser_preset()
		2: _dreadnought_preset()
		3: _prism_preset()
		4: _deck_brawler_preset()
	preset_picker.select(0)

func _dreadnought_preset() -> void:
	_remember(design.serialize())
	design.dreadnought_battleship()
	note.text = "이온 빔·모듈식 레일건·디스럽터·대형 방어막·소화기를 탑재한 전함 설계입니다."
	_design_changed()

func _prism_preset() -> void:
	_remember(design.serialize())
	design.prism_flak_destroyer()
	note.text = "이온 빔 프리즘·플랙 대공포·체인건과 탄창을 탑재한 구축함 설계입니다."
	_design_changed()

func _deck_brawler_preset() -> void:
	_remember(design.serialize())
	design.deck_cannon_brawler()
	note.text = "270° 갑판포·대형 캐논·소형 방어막·소화기를 탑재한 임페리움 중전함 설계입니다."
	_design_changed()

func _design_changed() -> void:
	var reason: String = Battle.validate_design(design)
	var route: Array[Vector2i] = []
	var engines: Array[Dictionary] = []
	var engine_rooms: Array[Dictionary] = []
	var rocket_modules := 0
	for source in design.parts:
		if design.by_id[source.id].stats.has("nozzles") or source.id in ["cosmoteer.thruster_boost","cosmoteer.thruster_rocket_nozzle"]:
			engines.append(source)
		elif source.id == EngineRoom.ID:
			engine_rooms.append(source)
		if source.id.begins_with("cosmoteer.thruster_rocket_"):
			rocket_modules += 1
		if source.id != "cosmoteer.reactor_small":
			continue
		for gun in design.parts:
			if gun.id == "cosmoteer.laser_blaster_small":
				var candidate: Array[Vector2i] = design.path_between(source.uid,gun.uid)
				if not candidate.is_empty() and (route.is_empty() or candidate.size() < route.size()):
					route = candidate
	grid.preview_path = route
	grid.queue_redraw()
	var route_text := "반응로 → 레이저 연결 없음" if route.is_empty() else "최단 반응로 → 레이저 통로 %d칸" % route.size()
	var flight_state := "추진기 %d기" % engines.size() if not engines.is_empty() else "추진기 없음 · 자력 기동 불가"
	if not engine_rooms.is_empty():
		var connected_engines := 0
		for engine in engines:
			for room in engine_rooms:
				if EngineRoom.adjacent(engine, room):
					connected_engines += 1
					break
		flight_state += "   ·   엔진룸 연결 %d기" % connected_engines
	readiness.text = "%s   ·   %s   ·   %s" % ["출격 준비 완료" if reason.is_empty() else reason,route_text,flight_state]
	readiness.add_theme_color_override("font_color",lab.GREEN if reason.is_empty() else lab.GOLD)
	rocket_preview.visible = rocket_modules > 0
	if rocket_preview.visible:
		var network: Dictionary = RocketNetwork.analyze(design)
		var force := 0.0
		var rate := 0.0
		var connected := 0
		var stores := {}
		var capacity := 0
		for nozzle in network.nozzles.values():
			force += nozzle.thrust_force
			rate += nozzle.fuel_per_second
			for uid in nozzle.storage_uids:
				if not stores.has(uid):
					stores[uid] = true
					capacity += int(network.part_storage[uid].capacity)
		for part in design.parts:
			if part.id.begins_with("cosmoteer.thruster_rocket_") and network.connected_uids.has(part.uid):
				connected += 1
		rocket_preview.text = "로켓 연결 %d / %d   ·   최대 추력 %d   ·   최대 전력 소모 %d/초   ·   연결 저장 용량 %d" % [connected,rocket_modules,roundi(force),roundi(rate),capacity]
	depart_button.disabled = not reason.is_empty()
	depart_button.tooltip_text = reason
	undo_button.disabled = history.is_empty()
	load_button.disabled = not FileAccess.file_exists(save_path)
	resources.text = "부품 %d개     건조 재료   %s" % [design.parts.size(),_cost_text(design.total_cost())]

func _cost_text(cost: Dictionary) -> String:
	var items := PackedStringArray()
	for name_key in cost:
		items.append("%s %d" % [name_key,cost[name_key]])
	return " · ".join(items) if not items.is_empty() else "—"

func _save_design() -> void:
	var temp := save_path+".tmp"
	var file := FileAccess.open(temp,FileAccess.WRITE)
	if file == null:
		note.text = "설계 파일을 열 수 없습니다."
		return
	file.store_string(JSON.stringify(design.serialize(),"\t"))
	file.flush()
	var error := file.get_error()
	file.close()
	if error == OK:
		error = DirAccess.rename_absolute(ProjectSettings.globalize_path(temp),ProjectSettings.globalize_path(save_path))
	if error != OK:
		note.text = "설계 저장 실패 · " + error_string(error)
		return
	load_button.disabled = false
	note.text = "현재 설계를 저장했습니다."

func _load_design() -> void:
	var previous: Dictionary = design.serialize()
	var file := FileAccess.open(save_path,FileAccess.READ)
	if file == null or not design.restore(JSON.parse_string(file.get_as_text())):
		note.text = "설계 파일을 불러올 수 없습니다. 현재 설계를 유지합니다."
		return
	_remember(previous)
	_design_changed()
	note.text = "저장한 설계를 불러왔습니다."

func _launch() -> void:
	var mission := _mission(selected_mission_id)
	_recorded_battle = false
	debrief_layer.hide()
	var launched: bool = duel.launch(design,mission) if not mission.is_empty() else duel.launch(design)
	if launched:
		editor.hide()
		duel.show()
	else:
		note.text = duel.battle.launch_error

func _return_to_yard() -> void:
	debrief_layer.hide()
	duel.hide()
	editor.show()
	_design_changed()
	note.text = "출격 전 설계로 돌아왔습니다."
