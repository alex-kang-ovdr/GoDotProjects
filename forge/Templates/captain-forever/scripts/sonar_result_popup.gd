class_name SonarResultPopup
extends CanvasLayer

const UiTheme = preload("res://scripts/ui_scale_theme.gd")

signal closed()

var _panel: PanelContainer
var _title_label: Label
var _summary_label: Label
var _body_label: RichTextLabel
var _close_btn: Button
var _visible_report: Dictionary = {}
var _ui_font: Font

func _ready() -> void:
	layer = 80
	_load_font()
	_build_ui()
	if get_viewport() != null:
		get_viewport().size_changed.connect(_sync_popup_bounds)
	_sync_popup_bounds()
	_panel.visible = false

func _sync_popup_bounds() -> void:
	if _panel == null or get_viewport() == null:
		return
	var vp := get_viewport().get_visible_rect().size
	var narrow := vp.x < 960.0 or ModeSwitcher.is_portrait_mode
	if narrow:
		var h := minf(520.0, maxf(240.0, vp.y - 240.0))
		_panel.anchor_left = 0.0
		_panel.anchor_right = 1.0
		_panel.anchor_top = 0.5
		_panel.anchor_bottom = 0.5
		_panel.offset_left = 12.0
		_panel.offset_right = -12.0
		_panel.offset_top = -h * 0.5
		_panel.offset_bottom = h * 0.5
	else:
		var w := minf(620.0, vp.x - 20.0)
		var h := minf(460.0, maxf(240.0, vp.y - 240.0))
		_panel.anchor_left = 1.0
		_panel.anchor_right = 1.0
		_panel.anchor_top = 0.0
		_panel.anchor_bottom = 0.0
		_panel.offset_left = -14.0 - w
		_panel.offset_right = -14.0
		_panel.offset_top = 86.0
		_panel.offset_bottom = 86.0 + h

func _load_font() -> void:
	_ui_font = UiTheme.load_ui_font()

func _build_ui() -> void:
	_panel = PanelContainer.new()
	_panel.theme = UiTheme.build_theme(false)
	_panel.add_theme_stylebox_override("panel", UiTheme.make_box(Color(0.03, 0.07, 0.14, 0.96), Color(0.36, 0.92, 1.0, 0.92), 12, 16, 14, 2))
	add_child(_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 10)
	_panel.add_child(vbox)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 8)
	vbox.add_child(header)
	_title_label = Label.new()
	_title_label.text = "SONAR · 소나 탐지 결과"
	_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title_label.clip_text = true
	_title_label.add_theme_color_override("font_color", Color("6ef2ff"))
	_title_label.add_theme_font_size_override("font_size", 26)
	header.add_child(_title_label)

	_close_btn = Button.new()
	_close_btn.text = "닫기 (ESC)"
	_close_btn.custom_minimum_size = Vector2(138, 48)
	_close_btn.add_theme_font_size_override("font_size", 21)
	_close_btn.pressed.connect(hide_popup)
	header.add_child(_close_btn)

	_summary_label = Label.new()
	_summary_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_summary_label.add_theme_color_override("font_color", Color("d8f3ff"))
	_summary_label.add_theme_font_size_override("font_size", 21)
	vbox.add_child(_summary_label)

	_body_label = RichTextLabel.new()
	_body_label.bbcode_enabled = true
	_body_label.scroll_active = true
	_body_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body_label.add_theme_font_size_override("normal_font_size", 21)
	if _ui_font != null:
		_body_label.add_theme_font_override("normal_font", _ui_font)
	vbox.add_child(_body_label)

func is_showing() -> bool:
	return _panel != null and _panel.visible

func show_report(report: Dictionary) -> void:
	_visible_report = report.duplicate(true)
	var ships: Array = report.get("ships", [])
	var stations: Array = report.get("stations", [])
	var mutual_pairs: Array = report.get("mutual_pairs", [])
	var hostile_count := int(report.get("hostile_count", 0))
	var neutral_count := int(report.get("neutral_count", 0))
	var salvage_count := int(report.get("salvage_count", 0))
	var scan_range := float(report.get("range", 2600.0))

	_summary_label.text = "반경 %.0fm | 함선 %d척 (적대 %d · 중립 %d) | 상호탐지 %d건 | 정거장 %d" % [
		scan_range, ships.size(), hostile_count, neutral_count, mutual_pairs.size(), stations.size()
	]

	var lines := PackedStringArray()
	if ships.is_empty():
		lines.append("[color=#9bb8d5]탐지 범위 내 다른 함선이 없습니다.[/color]")
	else:
		lines.append("[color=#7cecff]■ 탐지된 함선[/color]")
		for s in ships:
			var name_str := str(s.get("name", "UNKNOWN"))
			var cls_str := str(s.get("class_label", ""))
			var dist := float(s.get("distance", 0.0))
			var is_attack := bool(s.get("attack_mode", false))
			var is_boss := bool(s.get("boss", false))
			var badge := "[color=#ffd36e][보스 · 공격모드!][/color]" if is_boss else ("[color=#ff6b7a][적대 · 공격모드 전환!][/color]" if is_attack else "[color=#88e8ff][중립 함선][/color]")
			lines.append("• %s (%s) · %.0fm %s" % [name_str, cls_str, dist, badge])

	if not mutual_pairs.is_empty():
		lines.append("")
		lines.append("[color=#d5a6ff]■ 함선 간 상호 탐지 (%d건)[/color]" % mutual_pairs.size())
		var limit := mini(mutual_pairs.size(), 8)
		for i in range(limit):
			var p: Dictionary = mutual_pairs[i]
			lines.append("• %s <-> %s (%.0fm)" % [str(p.get("name_a", "")), str(p.get("name_b", "")), float(p.get("distance", 0.0))])
		if mutual_pairs.size() > limit:
			lines.append("  외 %d건 상호 탐지됨" % (mutual_pairs.size() - limit))

	if not stations.is_empty():
		lines.append("")
		lines.append("[color=#7ef5a8]■ 탐지된 정거장[/color]")
		for st in stations:
			lines.append("• %s · %.0fm" % [str(st.get("name", "STATION")), float(st.get("distance", 0.0))])

	_body_label.text = "\n".join(lines)
	_sync_popup_bounds()
	_panel.visible = true

func hide_popup() -> void:
	if _panel != null:
		_panel.visible = false
	closed.emit()

func _unhandled_input(event: InputEvent) -> void:
	if not is_showing():
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode in [KEY_ESCAPE, KEY_ENTER, KEY_KP_ENTER]:
			hide_popup()
			get_viewport().set_input_as_handled()
