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
