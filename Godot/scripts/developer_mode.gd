class_name DeveloperModeOverlay
extends CanvasLayer

signal mode_selected(mode: String)

const BalanceData = preload("res://scripts/balance.gd")
const MODE_PART_EDITOR := "part_editor"
const MODE_SHIP_ASSEMBLY := "ship_assembly"
const MODE_NARRATIVE_EDITOR := "narrative_editor"
const MODE_TEST_PILOT := "test_pilot"

var menu_root: Control
var content_root: Control
var selected_mode := ""
var part_list: Tree
var part_table: Tree
var part_search: LineEdit
var part_filter: OptionButton
var part_sort_column := 0
var part_sort_ascending := true
var part_fields: Dictionary = {}
var part_status: Label
var editing_part_id := ""
var part_preview: Control
var preview_status: Label

class PartPreview extends Control:
	var spec: Dictionary = {}
	var preview_mode := "idle"
	var elapsed := 0.0

	func set_spec(value: Dictionary) -> void:
		spec = value.duplicate(true)
		queue_redraw()

	func set_preview_mode(value: String) -> void:
		preview_mode = value
		queue_redraw()

	func _process(delta: float) -> void:
		if preview_mode != "idle":
			elapsed += delta
			queue_redraw()

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color("081421"), true)
		var center := size * 0.5
		var hull := maxf(float(spec.get("hull", 20.0)), 1.0)
		var mass := maxf(float(spec.get("mass", 1.0)), 0.1)
		var scale := clampf(34.0 + hull * 0.18 + mass * 1.5, 36.0, 96.0)
		var body := Rect2(center - Vector2(scale, scale) * 0.5, Vector2(scale, scale))
		var fill := Color("2b526d")
		if str(spec.get("material", "standard")) == "advanced_metal":
			fill = Color("665a88")
		draw_rect(body, fill, true)
		draw_rect(body, Color("9ee8ff"), false, 2.0)
		draw_line(center - Vector2(scale * 0.35, 0), center + Vector2(scale * 0.35, 0), Color("b8d9ef"), 2.0)
		draw_line(center - Vector2(0, scale * 0.35), center + Vector2(0, scale * 0.35), Color("b8d9ef"), 2.0)
		var thrust := float(spec.get("thrust", 0.0))
		var reverse := float(spec.get("reverse_thrust", 0.0))
		var rcs := float(spec.get("rcs_thrust", 0.0))
		var pulse := 0.55 + 0.45 * sin(elapsed * 7.0)
		if preview_mode == "thrust" and thrust > 0.0:
			var length := 36.0 + minf(thrust / 120.0, 90.0)
			draw_line(center + Vector2(0, scale * 0.5), center + Vector2(0, scale * 0.5 + length), Color(0.3, 0.85, 1.0, pulse), 5.0)
			draw_colored_polygon(PackedVector2Array([center + Vector2(-8, scale * 0.5 + length - 12), center + Vector2(8, scale * 0.5 + length - 12), center + Vector2(0, scale * 0.5 + length)]), Color(0.45, 0.95, 1.0, pulse))
		if reverse > 0.0:
			draw_line(center - Vector2(0, scale * 0.5), center - Vector2(0, scale * 0.5 + minf(reverse / 35.0, 48.0)), Color("e3a8ff"), 3.0)
		if rcs > 0.0:
			draw_line(center - Vector2(scale * 0.5, 0), center - Vector2(scale * 0.5 + minf(rcs / 120.0, 44.0), 0), Color("8cf0cd"), 3.0)
			draw_line(center + Vector2(scale * 0.5, 0), center + Vector2(scale * 0.5 + minf(rcs / 120.0, 44.0), 0), Color("8cf0cd"), 3.0)
		if preview_mode == "attack":
			var beam_alpha := 0.45 + 0.4 * sin(elapsed * 10.0)
			draw_line(center + Vector2(scale * 0.5, 0), Vector2(size.x - 18.0, center.y), Color(1.0, 0.35, 0.55, beam_alpha), 4.0)
			draw_circle(Vector2(size.x - 18.0, center.y), 7.0 + 3.0 * pulse, Color(1.0, 0.55, 0.3, beam_alpha), false, 2.0)
		draw_string(ThemeDB.fallback_font, Vector2(16, 24), "SIMULATION · " + preview_mode.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("9bb8d5"))
		draw_string(ThemeDB.fallback_font, Vector2(16, size.y - 18), "Hull %.1f  Mass %.2f  Thrust %.0f  RCS %.0f" % [hull, mass, thrust, rcs], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("c8d7e5"))

func _ready() -> void:
	layer = 100
	build_menu()

func build_menu() -> void:
	menu_root = ColorRect.new()
	menu_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	menu_root.color = Color("071321f2")
	add_child(menu_root)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 100)
	margin.add_theme_constant_override("margin_right", 100)
	margin.add_theme_constant_override("margin_top", 60)
	margin.add_theme_constant_override("margin_bottom", 60)
	menu_root.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	margin.add_child(column)
	var title := Label.new()
	title.text = "CAPTAIN SALVAGE · DEVELOPER MODE"
	title.add_theme_font_size_override("font_size", 28)
	column.add_child(title)
	var hint := Label.new()
	hint.text = "편집 대상을 선택하세요. 테스트 파일럿은 현재 플레이 씬으로 진입합니다."
	hint.add_theme_color_override("font_color", Color("9bb8d5"))
	column.add_child(hint)
	for definition in _mode_definitions():
		var button := Button.new()
		button.text = "%s\n%s" % [definition.title, definition.description]
		button.custom_minimum_size = Vector2(0, 70)
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.pressed.connect(select_mode.bind(definition.id))
		column.add_child(button)

func _mode_definitions() -> Array[Dictionary]:
	return [
		{"id": MODE_PART_EDITOR, "title": "파트 편집 모드", "description": "CSV 질량·Hull·재질·무기 스펙을 확인하고 튜닝합니다."},
		{"id": MODE_SHIP_ASSEMBLY, "title": "우주선 조립 모드", "description": "파트 배치·CoM·추력·clearance 검증을 위한 조립 실험 화면입니다."},
		{"id": MODE_NARRATIVE_EDITOR, "title": "이벤트 및 퀘스트 편집 모드", "description": "튜토리얼·대화·이벤트·퀘스트 흐름을 점검합니다."},
		{"id": MODE_TEST_PILOT, "title": "테스트 파일럿 실행 모드", "description": "실제 게임 조작·물리·전투 테스트로 진입합니다."},
	]

func select_mode(mode: String) -> void:
	selected_mode = mode
	if mode == MODE_TEST_PILOT:
		mode_selected.emit(mode)
		return
	show_editor_panel(mode)

func show_editor_panel(mode: String) -> void:
	if content_root != null:
		content_root.queue_free()
	content_root = ColorRect.new()
	content_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	content_root.color = Color("071321f2")
	add_child(content_root)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 100)
	margin.add_theme_constant_override("margin_right", 100)
	margin.add_theme_constant_override("margin_top", 60)
	margin.add_theme_constant_override("margin_bottom", 60)
	content_root.add_child(margin)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	margin.add_child(column)
	var title := Label.new()
	title.text = _mode_title(mode)
	title.add_theme_font_size_override("font_size", 26)
	column.add_child(title)
	var status := Label.new()
	status.text = _mode_status(mode)
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(status)
	if mode == MODE_PART_EDITOR:
		build_part_editor(column)
	else:
		var list := ItemList.new()
		list.custom_minimum_size = Vector2(0, 300)
		for entry in _mode_entries(mode):
			list.add_item(entry)
		column.add_child(list)
	var back := Button.new()
	back.text = "메인 메뉴로 돌아가기"
	back.pressed.connect(_return_to_menu)
	column.add_child(back)
	var pilot := Button.new()
	pilot.text = "테스트 파일럿으로 실행"
	pilot.pressed.connect(select_mode.bind(MODE_TEST_PILOT))
	column.add_child(pilot)

func build_part_editor(column: VBoxContainer) -> void:
	var toolbar := HBoxContainer.new()
	toolbar.add_theme_constant_override("separation", 8)
	column.add_child(toolbar)
	part_search = LineEdit.new()
	part_search.placeholder_text = "검색: ID, 이름, 설명, 재질, 무기 타입"
	part_search.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	part_search.text_changed.connect(_on_part_search_changed)
	toolbar.add_child(part_search)
	part_filter = OptionButton.new()
	for filter_name in ["전체", "무기", "추진", "방어", "탄약/기타"]:
		part_filter.add_item(filter_name)
	part_filter.item_selected.connect(_on_part_filter_changed)
	toolbar.add_child(part_filter)
	var split := HSplitContainer.new()
	split.custom_minimum_size = Vector2(0, 480)
	column.add_child(split)
	var table_column := VBoxContainer.new()
	table_column.custom_minimum_size = Vector2(520, 0)
	split.add_child(table_column)
	var sort_bar := HBoxContainer.new()
	table_column.add_child(sort_bar)
	for sort_def in [["ID", 0], ["Hull", 3], ["Mass", 4], ["Type", 6]]:
		var sort_button := Button.new()
		sort_button.text = "정렬: " + sort_def[0]
		sort_button.pressed.connect(_set_part_sort.bind(int(sort_def[1])))
		sort_bar.add_child(sort_button)
	part_table = Tree.new()
	part_table.custom_minimum_size = Vector2(520, 430)
	part_table.size_flags_vertical = Control.SIZE_EXPAND_FILL
	part_table.columns = 7
	part_table.hide_root = true
	part_table.column_titles_visible = true
	for index in range(part_table.columns):
		part_table.set_column_title(index, ["ID", "이름", "무기/기능", "Hull", "Mass", "재질", "설명"][index])
		part_table.set_column_expand(index, index == 1 or index == 6)
	part_table.item_selected.connect(_on_part_table_selected)
	table_column.add_child(part_table)
	part_list = part_table
	var preview_column := VBoxContainer.new()
	preview_column.custom_minimum_size = Vector2(420, 0)
	split.add_child(preview_column)
	var preview_title := Label.new()
	preview_title.text = "테스트 파일럿 미리보기"
	preview_title.add_theme_font_size_override("font_size", 18)
	preview_column.add_child(preview_title)
	part_preview = PartPreview.new()
	part_preview.custom_minimum_size = Vector2(420, 250)
	part_preview.size_flags_vertical = Control.SIZE_EXPAND_FILL
	preview_column.add_child(part_preview)
	var preview_buttons := HBoxContainer.new()
	for preview_def in [["정지", "idle"], ["추진 반복", "thrust"], ["공격 반복", "attack"]]:
		var preview_button := Button.new()
		preview_button.text = preview_def[0]
		preview_button.pressed.connect(_set_preview_mode.bind(preview_def[1]))
		preview_buttons.add_child(preview_button)
	preview_column.add_child(preview_buttons)
	preview_status = Label.new()
	preview_status.text = "행을 선택하면 시뮬레이션이 시작됩니다."
	preview_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	preview_column.add_child(preview_status)
	var editor_scroll := ScrollContainer.new()
	editor_scroll.custom_minimum_size = Vector2(420, 190)
	editor_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	preview_column.add_child(editor_scroll)
	var editor_column := VBoxContainer.new()
	editor_column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	editor_column.add_theme_constant_override("separation", 6)
	editor_scroll.add_child(editor_column)
	for field in ["display_name", "description", "hull", "mass", "material", "power", "thrust", "reverse_thrust", "rcs_thrust", "weapon_type"]:
		var label := Label.new()
		label.text = field
		editor_column.add_child(label)
		var input := LineEdit.new()
		input.placeholder_text = field
		input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		editor_column.add_child(input)
		part_fields[field] = input
	var save := Button.new()
	save.text = "오버라이드 CSV 저장 · 테스트 파일럿에 즉시 반영"
	save.pressed.connect(save_part_changes)
	editor_column.add_child(save)
	part_status = Label.new()
	part_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	part_status.add_theme_color_override("font_color", Color("9bb8d5"))
	editor_column.add_child(part_status)
	_refresh_part_table()
	if part_table.get_root().get_child_count() > 0:
		var first := part_table.get_root().get_first_child()
		part_table.set_selected(first, 0)
		_on_part_table_selected()

func select_part_by_index(index: int) -> void:
	if part_table == null:
		return
	var item := part_table.get_root().get_child(index)
	if item != null:
		part_table.set_selected(item, 0)
		_on_part_table_selected()

func _refresh_part_table() -> void:
	if part_table == null:
		return
	part_table.clear()
	var root := part_table.create_item()
	var rows: Array[Dictionary] = []
	var query := "" if part_search == null else part_search.text.strip_edges().to_lower()
	var filter_index := 0 if part_filter == null else part_filter.selected
	for id in BalanceData.MODULES.keys():
		var part_id := str(id)
		var row := BalanceData.part_tuning_row(part_id)
		var spec := BalanceData.module_spec(part_id)
		var haystack := (part_id + " " + str(row.get("display_name", "")) + " " + str(row.get("description", "")) + " " + str(row.get("material", "")) + " " + str(row.get("weapon_type", ""))).to_lower()
		if not query.is_empty() and haystack.find(query) < 0:
			continue
		if not _part_matches_filter(spec, filter_index):
			continue
		rows.append({"id": part_id, "name": str(row.get("display_name", part_id)), "type": str(row.get("weapon_type", "none")), "hull": float(spec.get("hp", 0.0)), "mass": float(spec.get("mass", 0.0)), "material": str(row.get("material", "standard")), "desc": str(row.get("description", "")), "spec": spec})
	rows.sort_custom(func(a: Dictionary, b: Dictionary): return _part_row_less(a, b))
	for row in rows:
		var item := part_table.create_item(root)
		item.set_metadata(0, row.id)
		item.set_text(0, row.id)
		item.set_text(1, row.name)
		item.set_text(2, row.type)
		item.set_text(3, "%.1f" % row.hull)
		item.set_text(4, "%.2f" % row.mass)
		item.set_text(5, row.material)
		item.set_text(6, row.desc)

func _part_row_less(a: Dictionary, b: Dictionary) -> bool:
	var keys := ["id", "name", "type"]
	var left: Variant = a[keys[part_sort_column]] if part_sort_column < 3 else [a.hull, a.mass, a.material, a.type][part_sort_column - 3]
	var right: Variant = b[keys[part_sort_column]] if part_sort_column < 3 else [b.hull, b.mass, b.material, b.type][part_sort_column - 3]
	if typeof(left) == TYPE_STRING:
		return (str(left).to_lower() < str(right).to_lower()) == part_sort_ascending
	return (float(left) < float(right)) == part_sort_ascending

func _part_matches_filter(spec: Dictionary, filter_index: int) -> bool:
	if filter_index == 0:
		return true
	if filter_index == 1:
		return not str(spec.get("weapon_type", "none")) in ["", "none"]
	if filter_index == 2:
		return float(spec.get("force", 0.0)) > 0.0 or float(spec.get("thrust", 0.0)) > 0.0
	if filter_index == 3:
		return float(spec.get("shield", 0.0)) > 0.0 or float(spec.get("hp", 0.0)) >= 50.0
	return not str(spec.get("ammo_type", "")).is_empty() or str(spec.get("weapon_type", "none")) == "none"

func _set_part_sort(column: int) -> void:
	if part_sort_column == column:
		part_sort_ascending = not part_sort_ascending
	else:
		part_sort_column = column
		part_sort_ascending = true
	_refresh_part_table()

func _on_part_search_changed(_text: String) -> void:
	_refresh_part_table()

func _on_part_filter_changed(_index: int) -> void:
	_refresh_part_table()

func _on_part_table_selected() -> void:
	var item := part_table.get_selected()
	if item == null:
		return
	var part_id := str(item.get_metadata(0))
	load_part_into_fields(part_id)

func _set_preview_mode(mode: String) -> void:
	if part_preview != null:
		part_preview.set_preview_mode(mode)
	if preview_status != null:
		preview_status.text = "시뮬레이션: %s · debug string/추력·무기 방향 화살표 표시" % mode

func load_part_into_fields(part_id: String) -> void:
	editing_part_id = part_id
	var row := BalanceData.part_tuning_row(part_id)
	for field in part_fields:
		part_fields[field].text = str(row.get(field, ""))
	part_status.text = "%s · 기본 CSV 또는 저장된 user:// 오버라이드를 편집 중" % part_id
	if part_preview != null:
		part_preview.set_spec(BalanceData.module_spec(part_id))
	if preview_status != null:
		preview_status.text = "%s 선택 · 정지/추진 반복/공격 반복을 선택하세요." % part_id

static func validate_part_changes(changes: Dictionary) -> String:
	for field in ["hull", "mass", "power", "thrust", "reverse_thrust", "rcs_thrust"]:
		if not str(changes.get(field, "")).is_valid_float():
			return "%s 값은 숫자여야 합니다." % field
	for field in ["hull", "mass"]:
		if float(changes[field]) <= 0.0:
			return "%s 값은 0보다 커야 합니다." % field
	for field in ["thrust", "reverse_thrust", "rcs_thrust"]:
		if float(changes[field]) < 0.0:
			return "%s 값은 음수가 될 수 없습니다." % field
	if str(changes.get("display_name", "")).strip_edges().is_empty() or str(changes.get("material", "")).strip_edges().is_empty():
		return "display_name과 material은 비워둘 수 없습니다."
	return ""

func save_part_changes() -> void:
	if editing_part_id.is_empty():
		return
	var changes := {}
	for field in part_fields:
		changes[field] = part_fields[field].text.strip_edges()
	var validation_error := validate_part_changes(changes)
	if not validation_error.is_empty():
		part_status.text = "저장 거부 · " + validation_error
		part_status.add_theme_color_override("font_color", Color("ff8f8f"))
		return
	if BalanceData.save_part_tuning_override(editing_part_id, changes):
		part_status.text = "%s 저장 완료 · user://part_tuning_overrides.csv" % editing_part_id
		part_status.add_theme_color_override("font_color", Color("9ff0bd"))
	else:
		part_status.text = "저장 실패 · user:// 쓰기 권한을 확인하세요."
		part_status.add_theme_color_override("font_color", Color("ff8f8f"))

func _mode_title(mode: String) -> String:
	for definition in _mode_definitions():
		if definition.id == mode:
			return definition.title
	return mode

func _mode_status(mode: String) -> String:
	match mode:
		MODE_PART_EDITOR:
			return "CSV SSOT를 기준으로 파트별 표시 이름, 질량, Hull, 재질, 추진력, 무기 타입을 편집·검증하는 화면입니다."
		MODE_SHIP_ASSEMBLY:
			return "조립체 변경 뒤 총 질량, CoM, bound sphere, clearance, 추력 작용점을 검증하는 화면입니다."
		MODE_NARRATIVE_EDITOR:
			return "대화 선택지와 이벤트·퀘스트 연결을 테스트 파일럿 진입 전에 확인하는 화면입니다."
	return "개발자 모드"

func _mode_entries(mode: String) -> Array[String]:
	var result: Array[String] = []
	match mode:
		MODE_PART_EDITOR:
			for id in BalanceData.MODULES.keys():
				var spec := BalanceData.module_spec(str(id))
				result.append("%-22s mass %5.2f · Hull %5.1f · %s" % [str(id), float(spec.mass), float(spec.hp), str(spec.get("material", "standard"))])
		MODE_SHIP_ASSEMBLY:
			result = ["기본 함선 15파트 조립체", "CoM / 질량 / bound sphere 실시간 검증", "파트 연결·clearance·추력 레버암 검사", "분리 파트 중립화 시나리오"]
		MODE_NARRATIVE_EDITOR:
			result = ["tutorial_intro · 튜토리얼 시작", "station_serviced · 정거장 업그레이드", "boss_encounter · 보스 이벤트", "NPC contact · 퀘스트/경고 대화"]
	return result

func _return_to_menu() -> void:
	if content_root != null:
		content_root.queue_free()
		content_root = null
	selected_mode = ""
