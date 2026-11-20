extends CanvasLayer
## Responsive, native Godot menus and HUD. UI emits commands; the simulation owns state.

signal start_requested(options: Dictionary)
signal continue_requested
signal choice_selected(token: String)
signal reroll_requested
signal pause_requested
signal resume_requested
signal save_quit_requested
signal lobby_requested
signal restart_requested
signal build_requested
signal settings_changed(options: Dictionary)

const INK = Color("182d31")
const MUTED = Color("607774")
const PAPER = Color("f0f3e6")
const CREAM = Color("fbf7e9")
const MINT = Color("a6e5c8")
const CORAL = Color("e78069")
const GOLD = Color("e8c47c")
const LINE = Color("c8d4c9")
const SkillIcon = preload("res://scripts/skill_icon.gd")
const Radar = preload("res://scripts/arena_radar.gd")
const ABBR = {"kunai":"KN", "bat":"BT", "katana":"KT", "shotgun":"SG", "revolver":"RV", "guardian":"GD", "rocket":"RP", "lightning":"LT", "molotov":"FL", "drill":"DR", "droneA":"A", "droneB":"B", "destroyer":"AB", "soccer":"SC", "brick":"BK", "boomerang":"BM", "forcefield":"FD", "atk":"ATK", "speed":"SPD", "cooldown":"CD", "hp":"HP", "magnet":"MAG", "heal":"REG", "range":"RNG", "duration":"DUR", "projectile":"VEL", "xp":"XP", "gold":"G", "armor":"DEF"}

var catalog
var root: Control
var hud_root: Control
var menu_root: Control
var modal_root: Control
var error_root: PanelContainer
var error_label: Label
var hp_bar: ProgressBar
var xp_bar: ProgressBar
var hp_label: Label
var level_label: Label
var xp_label: Label
var time_label: Label
var kills_label: Label
var phase_label: Label
var boss_panel: PanelContainer
var boss_label: Label
var boss_bar: ProgressBar
var boss_pattern_label: Label
var radar_panel: PanelContainer
var radar
var loadout_panel: PanelContainer
var active_slots: HBoxContainer
var passive_slots: HBoxContainer
var notice_label: Label
var ammo_label: Label
var menu_panel: PanelContainer
var detail_panel: PanelContainer
var menu_options = {"weapon":"kunai", "duration":300, "chapter":0, "difficulty":"normal", "precision":false, "phase":false, "maintainer":false}
var _sim
var _profile: Dictionary = {}
var _has_save = false
var _state = ""
var _draft_signature = ""
var _slot_signature = ""
var _profile_signature = ""
var _small = false
var _built = false
var _build_open = false
var _guide_open = false
var _settings_open = false
var _history_open = false
var _options_restored = false
var _error_until = 0
var _menu_rebuild_pending = false
var _ui_clock = 0
var _hud_status: PanelContainer
var _hud_timer: PanelContainer
var _hud_commands: HBoxContainer
var _menu_stat_label: Label

func setup(data) -> void:
	catalog = data
	if _built:
		return
	_built = true
	layer = 10
	root = Control.new()
	root.name = "ArenaInterface"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	var theme = Theme.new()
	theme.default_font_size = 18
	if ResourceLoader.exists("res://assets/ArenaSans.ttf"):
		theme.default_font = load("res://assets/ArenaSans.ttf")
	theme.set_color("font_color", "Label", INK)
	theme.set_color("font_color", "CheckBox", INK)
	theme.set_color("font_hover_color", "CheckBox", INK)
	theme.set_color("font_pressed_color", "CheckBox", INK)
	root.theme = theme
	hud_root = _full_control(root, "CombatHUD")
	menu_root = _full_control(root, "Lobby")
	modal_root = _full_control(root, "Dialogs")
	modal_root.visible = false
	_make_hud()
	error_root = PanelContainer.new()
	error_root.name = "MessageToast"
	error_root.add_theme_stylebox_override("panel", _style(INK, CORAL, 14, 14))
	error_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(error_root)
	error_label = _label("", 16, CREAM)
	error_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	error_root.add_child(error_label)
	error_root.visible = false
	root.resized.connect(_on_resize)
	call_deferred("_on_resize")

func _full_control(parent: Node, title: String) -> Control:
	var c = Control.new()
	c.name = title
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(c)
	c.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	return c

func _style(fill: Color, border: Color = LINE, radius: int = 13, pad: int = 14) -> StyleBoxFlat:
	var s = StyleBoxFlat.new()
	s.bg_color = fill
	s.border_color = border
	s.set_border_width_all(1)
	s.set_corner_radius_all(radius)
	s.content_margin_left = pad
	s.content_margin_right = pad
	s.content_margin_top = pad
	s.content_margin_bottom = pad
	return s

func _label(text: String, size: int = 18, color: Color = INK) -> Label:
	var l = Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

func _copy(text: String, size: int = 16, color: Color = MUTED) -> Label:
	var l = _label(text, size, color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l

func _eyebrow(text: String, color: Color = MUTED) -> Label:
	var l = _label(text, 12, color)
	l.add_theme_constant_override("outline_size", 0)
	return l

func _button(text: String, callback: Callable, primary: bool = false) -> Button:
	var b = Button.new()
	b.text = text
	b.custom_minimum_size.y = 44
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.add_theme_font_size_override("font_size", 16)
	b.add_theme_color_override("font_color", MINT if primary else INK)
	b.add_theme_color_override("font_hover_color", CREAM if primary else INK)
	b.add_theme_color_override("font_pressed_color", CREAM if primary else INK)
	b.add_theme_color_override("font_disabled_color", Color("879891"))
	b.add_theme_stylebox_override("normal", _style(INK if primary else PAPER, INK if primary else LINE, 10, 12))
	b.add_theme_stylebox_override("hover", _style(Color("29474a") if primary else Color("d7eddb"), MINT if primary else MUTED, 10, 12))
	b.add_theme_stylebox_override("pressed", _style(Color("355756") if primary else MINT, MINT if primary else INK, 10, 12))
	b.add_theme_stylebox_override("disabled", _style(Color("e1e7dc"), LINE, 10, 12))
	b.add_theme_stylebox_override("focus", _focus_style())
	if callback.is_valid():
		b.pressed.connect(callback)
	return b

func _focus_style() -> StyleBoxFlat:
	var f = StyleBoxFlat.new()
	f.bg_color = Color.TRANSPARENT
	f.border_color = Color("437f6c")
	f.set_border_width_all(3)
	f.set_corner_radius_all(10)
	return f

func _panel(parent: Node, fill: Color = PAPER, padding: int = 18) -> PanelContainer:
	var p = PanelContainer.new()
	p.add_theme_stylebox_override("panel", _style(fill, LINE, 17, padding))
	parent.add_child(p)
	return p

func _vbox(parent: Node, spacing: int = 12) -> VBoxContainer:
	var v = VBoxContainer.new()
	v.add_theme_constant_override("separation", spacing)
	v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	parent.add_child(v)
	return v

func _hbox(parent: Node, spacing: int = 10) -> HBoxContainer:
	var h = HBoxContainer.new()
	h.add_theme_constant_override("separation", spacing)
	parent.add_child(h)
	return h

func _separator(parent: Node) -> void:
	var s = HSeparator.new()
	s.add_theme_color_override("color", LINE)
	parent.add_child(s)

func _bar(fill: Color, height: int = 7) -> ProgressBar:
	var p = ProgressBar.new()
	p.show_percentage = false
	p.custom_minimum_size.y = height
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_theme_stylebox_override("background", _style(Color("cedbd1"), Color("cedbd1"), 4, 0))
	p.add_theme_stylebox_override("fill", _style(fill, fill, 4, 0))
	return p

func _icon(id: String, extent: float = 28.0, evolved: bool = false):
	var icon = SkillIcon.new()
	icon.configure(id, Color("365f56"), evolved)
	icon.custom_minimum_size = Vector2.ONE * extent
	icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	return icon

func _make_hud() -> void:
	_hud_status = _panel(hud_root, Color(0.94, 0.96, 0.90, 0.94), 13)
	_hud_status.name = "Vitals"
	var status = _vbox(_hud_status, 5)
	var row = _hbox(status, 8)
	level_label = _label("LV. 1", 16)
	row.add_child(level_label)
	hp_label = _label("160 / 160", 14, MUTED)
	hp_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	hp_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(hp_label)
	hp_bar = _bar(Color("409c7c"), 9)
	status.add_child(hp_bar)
	var xp_row = _hbox(status, 6)
	xp_bar = _bar(GOLD, 6)
	xp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	xp_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	xp_row.add_child(xp_bar)
	xp_label = _label("XP 0 / 12", 10, MUTED)
	xp_label.name = "ExperienceLabel"
	xp_row.add_child(xp_label)
	_hud_timer = _panel(hud_root, Color(0.94, 0.96, 0.90, 0.94), 12)
	var timer_box = _vbox(_hud_timer, 0)
	time_label = _label("00:00", 29)
	time_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	timer_box.add_child(time_label)
	kills_label = _label("0 처치", 12, MUTED)
	kills_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	timer_box.add_child(kills_label)
	_hud_commands = _hbox(hud_root, 8)
	var build_button = _button("빌드 · B", func(): build_requested.emit())
	build_button.name = "BuildButton"
	_hud_commands.add_child(build_button)
	var pause_button = _button("정지 · P", func(): pause_requested.emit())
	pause_button.name = "PauseButton"
	_hud_commands.add_child(pause_button)
	phase_label = _label("다음 보스 02:30", 14, CREAM)
	phase_label.add_theme_color_override("font_shadow_color", INK)
	phase_label.add_theme_constant_override("shadow_offset_y", 1)
	phase_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud_root.add_child(phase_label)
	boss_panel = _panel(hud_root, Color(0.10, 0.18, 0.19, 0.94), 10)
	boss_panel.name = "BossHealth"
	var boss_box = _vbox(boss_panel, 5)
	boss_label = _label("BOSS", 14, CREAM)
	boss_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	boss_box.add_child(boss_label)
	boss_bar = _bar(CORAL, 7)
	boss_box.add_child(boss_bar)
	boss_pattern_label = _label("", 12, GOLD)
	boss_pattern_label.name = "BossPattern"
	boss_pattern_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	boss_box.add_child(boss_pattern_label)
	boss_panel.visible = false
	loadout_panel = _panel(hud_root, Color(0.94, 0.96, 0.90, 0.94), 11)
	loadout_panel.name = "LoadoutSlots"
	var loadout = _vbox(loadout_panel, 6)
	var active_header = _hbox(loadout, 8)
	active_header.add_child(_eyebrow("무기 6칸  /  보조 6칸"))
	ammo_label = _label("자동 공격", 12, MUTED)
	ammo_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	ammo_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	active_header.add_child(ammo_label)
	active_slots = _hbox(loadout, 5)
	passive_slots = _hbox(loadout, 5)
	notice_label = _copy("", 17, CREAM)
	notice_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	notice_label.add_theme_color_override("font_shadow_color", INK)
	notice_label.add_theme_constant_override("shadow_offset_x", 1)
	notice_label.add_theme_constant_override("shadow_offset_y", 1)
	hud_root.add_child(notice_label)
	radar_panel = _panel(hud_root, Color(0.10, 0.18, 0.19, 0.92), 8)
	radar_panel.name = "RadarPanel"
	radar_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var radar_column = _vbox(radar_panel, 4)
	var radar_title = _label("RADAR · N", 10, MINT)
	radar_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	radar_column.add_child(radar_title)
	radar = Radar.new()
	radar.name = "TacticalRadar"
	radar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	radar.size_flags_vertical = Control.SIZE_EXPAND_FILL
	radar_column.add_child(radar)

func _on_resize() -> void:
	if not is_instance_valid(root):
		return
	var next_small = root.size.x < 760.0
	var changed = next_small != _small
	_small = next_small
	_layout_hud()
	if changed and _sim != null:
		_state = ""
		_profile_signature = ""
		_draft_signature = ""
		_slot_signature = ""
		if _build_open:
			show_build(_sim)
		elif _guide_open:
			_show_guide()
		elif _settings_open:
			_show_settings()
		elif _history_open:
			_show_history()
	if is_instance_valid(menu_panel):
		_layout_menu()
	if modal_root.visible:
		_layout_modal()

func _layout_hud() -> void:
	var w = root.size.x
	var h = root.size.y
	if w < 10:
		return
	if _small:
		_place(_hud_status, Vector2(12, 12), Vector2(maxf(170, w - 140), 84))
		_place(_hud_timer, Vector2(w - 116, 12), Vector2(104, 84))
		_place(_hud_commands, Vector2(w - 198, 104), Vector2(186, 44))
		for b in _hud_commands.get_children():
			b.add_theme_font_size_override("font_size", 12)
		_place(phase_label, Vector2(12, 106), Vector2(maxf(100, w - 216), 38))
		phase_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		phase_label.add_theme_font_size_override("font_size", 12)
		_place(boss_panel, Vector2(12, 160), Vector2(w - 24, 77))
		_place(loadout_panel, Vector2(12, h - 144), Vector2(w - 24, 126))
		_place(notice_label, Vector2(20, 247), Vector2(w - 40, 76))
		_place(radar_panel, Vector2(w - 126, h - 283), Vector2(114, 129))
	else:
		_place(_hud_status, Vector2(24, 22), Vector2(278, 84))
		_place(_hud_timer, Vector2(w * 0.5 - 85, 22), Vector2(170, 84))
		_place(_hud_commands, Vector2(w - 238, 28), Vector2(214, 44))
		_place(phase_label, Vector2(w * 0.5 - 220, 109), Vector2(440, 29))
		phase_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		phase_label.add_theme_font_size_override("font_size", 14)
		_place(boss_panel, Vector2(w * 0.5 - 230, 145), Vector2(460, 77))
		_place(loadout_panel, Vector2(24, h - 150), Vector2(350, 126))
		_place(notice_label, Vector2(w * 0.5 - 280, h - 124), Vector2(560, 70))
		_place(radar_panel, Vector2(w - 178, h - 194), Vector2(154, 170))
	if is_instance_valid(error_root):
		_place(error_root, Vector2(20, maxf(12, h - 92)), Vector2(w - 40, 64))

func _place(c: Control, at: Vector2, extent: Vector2) -> void:
	c.position = at
	c.size = extent

func sync(sim, profile: Dictionary, has_save: bool) -> void:
	if not _built:
		setup(sim.catalog)
	_sim = sim
	_profile = profile
	_has_save = has_save
	if not _options_restored:
		_options_restored = true
		_restore_menu_options(profile.get("last_options", {}))
	var changed = _state != str(sim.state)
	var profile_sig = str([profile.get("runs", 0), profile.get("wins", 0), profile.get("best_kills", 0), profile.get("credits", 0), profile.get("settings", {}), profile.get("records", {}), profile.get("history", []).size(), has_save])
	if changed:
		_state = str(sim.state)
		_draft_signature = ""
		if _state != "paused":
			_build_open = false
		if not _state in ["menu", "paused"]:
			_guide_open = false
			_settings_open = false
			_history_open = false
	menu_root.visible = _state == "menu"
	hud_root.visible = _state != "menu"
	if _state == "menu" and (changed or profile_sig != _profile_signature or _menu_rebuild_pending):
		_make_menu()
		_profile_signature = profile_sig
		_menu_rebuild_pending = false
	var draft_sig = str([sim.state, sim.draft, sim.rerolls, sim.player.get("levels", {}), sim.player.get("evolved", {})])
	if _state in ["choice", "chest"] and draft_sig != _draft_signature:
		_draft_signature = draft_sig
		_show_choices(sim)
	elif changed:
		match _state:
			"paused":
				if not _build_open and not _settings_open and not _history_open and not _guide_open:
					_show_pause()
			"won", "lost":
				_show_results(sim)
			_:
				if not _build_open and not _guide_open and not _settings_open and not _history_open:
					modal_root.visible = false
	if _state != "menu":
		_update_hud(sim)
	else:
		_layout_menu()
	if modal_root.visible:
		_layout_modal()
	if _settings_open:
		_sync_settings_controls()
	if is_instance_valid(error_root):
		error_root.visible = Time.get_ticks_msec() < _error_until

func _restore_menu_options(saved: Dictionary) -> void:
	if str(saved.get("weapon", "")) in ["kunai", "bat", "katana", "shotgun", "revolver"]:
		menu_options.weapon = str(saved.weapon)
	menu_options.chapter = clampi(int(saved.get("chapter", 0)), 0, 2)
	menu_options.duration = 900 if int(saved.get("duration", 300)) == 900 else 300
	menu_options.difficulty = "hard" if saved.get("difficulty", "normal") == "hard" else "normal"
	for id in ["precision", "phase", "maintainer"]:
		menu_options[id] = saved.get(id, false) == true
	settings_changed.emit({"preview_chapter":int(menu_options.chapter), "preview_weapon":str(menu_options.weapon)})

func _make_menu() -> void:
	var old_scroll = 0
	if is_instance_valid(menu_panel):
		var previous = menu_panel.find_child("LobbyScroll", true, false)
		if previous != null:
			old_scroll = previous.scroll_vertical
	_clear(menu_root)
	menu_panel = _panel(menu_root, Color(0.95, 0.96, 0.91, 0.97), 0)
	menu_panel.name = "LobbyPanel"
	var menu_column = _vbox(menu_panel, 0)
	var scroll = ScrollContainer.new()
	scroll.name = "LobbyScroll"
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	menu_column.add_child(scroll)
	var margin = MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 22 if not _small else 18)
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(margin)
	var box = _vbox(margin, 13)
	var top = _hbox(box)
	var chip = _label("SA / G2", 13, Color("347d69"))
	chip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(chip)
	top.add_child(_eyebrow("GODOT EDITION", MUTED))
	var title = _label("SURVIVOR\nARENA", 48 if not _small else 40)
	title.add_theme_constant_override("line_spacing", -7)
	box.add_child(title)
	box.add_child(_copy("움직이고, 모으고, 진화하세요.", 18, INK))
	box.add_child(_copy("블록 3D 서바이벌 · 자동 공격 · 나만의 6+6 빌드", 13))
	_separator(box)
	_menu_stat_label = _label("%d 출전    %d 승리    최고 %d 처치" % [int(_profile.get("runs", 0)), int(_profile.get("wins", 0)), int(_profile.get("best_kills", 0))], 13, MUTED)
	box.add_child(_menu_stat_label)
	box.add_child(_eyebrow("01    전장 선택"))
	var maps = _hbox(box, 8)
	var names = ["도시", "사막", "빙결"]
	for i in range(3):
		var b = _select_button(names[i], int(menu_options.chapter) == i, func(): _set_option("chapter", i))
		b.name = "MapChoice%d" % i
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		maps.add_child(b)
	var record: Dictionary = _profile.get("records", {}).get(str(menu_options.chapter), {})
	var record_text = "전장 기록 · 첫 클리어에 도전하세요."
	if int(record.get("best_kills",0)) > 0:
		record_text = "전장 기록 · %d 클리어 / 최고 %d 처치" % [int(record.get("clears",0)),int(record.get("best_kills",0))]
		if float(record.get("best_time",0)) > 0:
			record_text += " / " + _clock(float(record.best_time))
	var map_record = _copy(record_text, 12)
	map_record.name = "SelectedMapRecord"
	box.add_child(map_record)
	box.add_child(_eyebrow("02    주무기 장착"))
	var weapons = GridContainer.new()
	weapons.columns = 3
	weapons.add_theme_constant_override("h_separation", 7)
	weapons.add_theme_constant_override("v_separation", 7)
	box.add_child(weapons)
	for id in ["kunai", "bat", "katana", "shotgun", "revolver"]:
		var b = _select_button("", str(menu_options.weapon) == id, func(): _set_option("weapon", id))
		b.name = "Weapon_" + id
		b.add_theme_font_size_override("font_size", 13)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.tooltip_text = catalog.description(id)
		weapons.add_child(b)
		var weapon_content = HBoxContainer.new()
		weapon_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
		weapon_content.alignment = BoxContainer.ALIGNMENT_CENTER
		weapon_content.add_theme_constant_override("separation", 5)
		b.add_child(weapon_content)
		weapon_content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		weapon_content.offset_left = 7
		weapon_content.offset_right = -7
		weapon_content.add_child(_icon(id, 23))
		var weapon_label = _label(catalog.label(id), 12)
		weapon_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		weapon_content.add_child(weapon_label)
	var aim_text = "가까운 적 자동 조준" if menu_options.weapon in ["kunai", "revolver"] else "마지막 이동 방향으로 공격"
	box.add_child(_copy(aim_text + "  /  " + catalog.description(str(menu_options.weapon)), 12))
	var settings_row = _hbox(box, 9)
	var modes = _vbox(settings_row, 6)
	modes.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	modes.add_child(_eyebrow("진행 시간"))
	var time_row = _hbox(modes, 6)
	for duration in [300, 900]:
		var b = _select_button("%d분" % (duration / 60), int(menu_options.duration) == duration, func(): _set_option("duration", duration))
		b.name = "Duration%d" % duration
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		time_row.add_child(b)
	var difficulty = _vbox(settings_row, 6)
	difficulty.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	difficulty.add_child(_eyebrow("난이도"))
	var diff_row = _hbox(difficulty, 6)
	for key in ["normal", "hard"]:
		var b = _select_button("일반" if key == "normal" else "도전", str(menu_options.difficulty) == key, func(): _set_option("difficulty", key))
		b.name = "Difficulty_" + key
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		diff_row.add_child(b)
	var tech = _hbox(box, 3) if not _small else _vbox(box, 0)
	for entry in [["precision", "드론 유도"], ["phase", "낙뢰 +2"], ["maintainer", "로켓 간격 −0.5초"]]:
		var check = CheckBox.new()
		check.text = entry[1]
		check.name = "Tech_" + entry[0]
		check.button_pressed = bool(menu_options[entry[0]])
		check.add_theme_font_size_override("font_size", 12)
		check.tooltip_text = "무료 부품 효과 시험 옵션"
		check.toggled.connect(func(value: bool): menu_options[entry[0]] = value)
		tech.add_child(check)
	var footer_margin = MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		footer_margin.add_theme_constant_override("margin_" + side, 18 if side != "top" else 10)
	menu_column.add_child(footer_margin)
	var footer = _vbox(footer_margin, 8)
	var play = _button("출전하기   →", func(): start_requested.emit(menu_options.duplicate(true)), true)
	play.name = "StartButton"
	play.custom_minimum_size.y = 54
	play.add_theme_font_size_override("font_size", 20)
	footer.add_child(play)
	if _has_save:
		var cont = _button("저장한 전투 계속하기", func(): continue_requested.emit())
		cont.name = "ContinueButton"
		footer.add_child(cont)
	var bottom = _hbox(footer, 8)
	var guide = _button("조작 / 진화 도감", _show_guide)
	guide.name = "GuideButton"
	guide.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bottom.add_child(guide)
	var settings = _button("설정", _show_settings)
	settings.name = "SettingsButton"
	settings.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bottom.add_child(settings)
	var utility_row = _hbox(footer, 8)
	var history = _button("전투 기록", _show_history)
	history.name = "HistoryButton"
	history.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	utility_row.add_child(history)
	var sound = _button("효과음 %s · M" % ("켬" if bool(_profile.get("settings", {}).get("sound", true)) else "끔"), func(): settings_changed.emit({"sound":not bool(_profile.get("settings", {}).get("sound", true))}))
	sound.name = "SoundButton"
	sound.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	utility_row.add_child(sound)
	footer.add_child(_copy("WASD / 방향키 / 터치 이동 · P 정지 · B 빌드 · N 레이더", 11))
	detail_panel = _panel(menu_root, Color(0.10, 0.18, 0.19, 0.86), 18)
	detail_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var d = _vbox(detail_panel, 8)
	d.add_child(_eyebrow("FIELD NOTES  /  " + ["URBAN", "DUNES", "FROST"][int(menu_options.chapter)], MINT))
	d.add_child(_label("버티는 동안, 강해진다.", 25, CREAM))
	d.add_child(_copy(str(catalog.chapters[int(menu_options.chapter)].subtitle) + "\n무기 Lv.5 + 대응 보조 → 진화 후보", 14, Color("c6d5ce")))
	d.add_child(_eyebrow("06 ACTIVE     +     06 PASSIVE     /     15 EVOLUTIONS", GOLD))
	_layout_menu()
	call_deferred("_layout_menu")
	scroll.set_deferred("scroll_vertical", old_scroll)

func _select_button(text: String, selected: bool, callback: Callable) -> Button:
	var b = _button(text, callback)
	if selected:
		b.add_theme_stylebox_override("normal", _style(MINT, Color("6eab90"), 10, 10))
		b.add_theme_color_override("font_color", INK)
	return b

func _set_option(key: String, value) -> void:
	menu_options[key] = value
	if key == "chapter":
		settings_changed.emit({"preview_chapter": value})
	elif key == "weapon":
		settings_changed.emit({"preview_weapon": value})
	_menu_rebuild_pending = true

func _layout_menu() -> void:
	if not is_instance_valid(menu_panel):
		return
	var w = root.size.x
	var h = root.size.y
	if _small:
		_place(menu_panel, Vector2(14, 14), Vector2(w - 28, h - 28))
		detail_panel.visible = false
	else:
		var width = minf(510, w * 0.46)
		_place(menu_panel, Vector2(28, 26), Vector2(width, h - 52))
		detail_panel.visible = w >= 1000
		_place(detail_panel, Vector2(width + 70, h - 205), Vector2(maxf(350, w - width - 110), 158))

func _update_hud(sim) -> void:
	var p: Dictionary = sim.player
	if p.is_empty():
		return
	hp_bar.max_value = maxf(1.0, float(p.get("max_hp", 160)))
	hp_bar.value = float(p.get("hp", 160))
	xp_bar.max_value = maxf(1.0, float(p.get("need", 12)))
	xp_bar.value = float(p.get("xp", 0))
	xp_label.text = "XP %d / %d" % [int(p.get("xp",0)),int(p.get("need",12))]
	hp_label.text = "%d / %d" % [int(ceil(p.get("hp", 160))), int(p.get("max_hp", 160))]
	level_label.text = "LV. %02d" % int(p.get("lv", 1))
	time_label.text = _clock(float(sim.elapsed))
	kills_label.text = "%d 처치 · %d 적" % [int(sim.stats.get("kills", 0)), sim.enemies.size()]
	var duration = int(sim.config.get("duration", 300))
	var checkpoints = [150, 300] if duration == 300 else [300, 600, 900]
	phase_label.text = "최종 보스를 처치하세요"
	for checkpoint in checkpoints:
		if float(sim.elapsed) < checkpoint:
			phase_label.text = "%s %s" % ["최종" if checkpoint == duration else "다음 보스", _clock(checkpoint)]
			break
	var boss: Dictionary = {}
	for e in sim.enemies:
		if str(e.get("type", "")) == "boss" and float(e.get("hp", 0)) > 0:
			boss = e
			break
	boss_panel.visible = not boss.is_empty()
	if not boss.is_empty():
		boss_bar.max_value = maxf(1.0, float(boss.get("max_hp", 1)))
		boss_bar.value = float(boss.hp)
		var names = ["철갑 돌격대장", "사막 포격사령관", "프로스트 센티널"]
		boss_label.text = ("FINAL  /  " if boss.get("role", "mid") == "final" else "BOSS  /  ") + names[clampi(int(sim.config.get("chapter", 0)), 0, 2)] + (" · PHASE 2" if float(boss.hp) <= float(boss.max_hp)*0.5 else "")
		boss_label.add_theme_font_size_override("font_size", 12 if _small else 14)
		var encounter = sim.get("encounter")
		if not encounter is Dictionary:
			encounter = {}
		var intro = float(encounter.get("intro_left",0.0))
		if intro > 0.0:
			boss_pattern_label.text = "교전 준비 %.1f초 · 이동해 자리를 잡으세요" % intro
			boss_pattern_label.add_theme_color_override("font_color",MINT)
		elif float(encounter.get("pattern_time",0.0)) > 0.0 and str(encounter.get("pattern","")).length() > 0:
			var pattern = str(encounter.pattern)
			var hints = {"돌진":"직선 예고 밖으로 이동", "충격파":"폭발 원 밖으로 이동", "박격 포격":"표시된 원에서 이탈", "지원 병력":"확장 고리와 증원 주의", "레이저":"광선 경로에서 이탈", "얼음 탄막":"탄막 사이로 이동"}
			boss_pattern_label.text = pattern + " · " + str(hints.get(pattern,"예고 범위를 확인하세요"))
			boss_pattern_label.add_theme_color_override("font_color",GOLD)
		else:
			boss_pattern_label.text = "격노 단계 · 패턴 간격 감소" if int(boss.get("phase",1)) >= 2 else "예고 표시를 확인하고 회피하세요"
			boss_pattern_label.add_theme_color_override("font_color",Color("c9d8cf"))
		phase_label.text = "보스 교전 중"
	var signature = str([p.get("levels", {}), p.get("evolved", {}), _small])
	if signature != _slot_signature:
		_slot_signature = signature
		_slots(active_slots, sim, "weapon")
		_slots(passive_slots, sim, "passive")
	if sim.config.get("weapon", "kunai") == "revolver":
		ammo_label.text = "재장전 %.1fs" % float(p.get("reload", 0)) if float(p.get("reload", 0)) > 0 else "탄창 %d" % int(p.get("ammo", 6))
	else:
		ammo_label.text = "자동 공격"
	notice_label.modulate.a = 1.0
	if float(sim.notice_time) > 0:
		notice_label.text = str(sim.notice)
	elif float(sim.elapsed) < 30.0 and str(sim.state) == "playing":
		if int(p.get("lv",1)) > 1:
			notice_label.text = "무기 Lv.5와 대응 보조를 모아 진화하세요.\nB로 내 빌드와 조합을 확인할 수 있습니다."
		elif int(sim.stats.get("kills",0)) > 0:
			notice_label.text = "적이 떨어뜨린 경험치를 모으세요.\n레벨이 오르면 3개 성장 카드 중 하나를 선택합니다."
		else:
			notice_label.text = "WASD / 방향키로 이동 · 공격은 자동입니다.\n적과 거리를 유지하며 경험치를 모으세요." if not _small else "화면 왼쪽을 드래그해 이동하세요.\n공격은 자동 · 적과 거리를 유지하세요."
		notice_label.modulate.a = clampf((30.0-float(sim.elapsed))/4.0,0,1)
	else:
		notice_label.text = ""
	radar_panel.visible = bool(_profile.get("settings",{}).get("radar",true)) and str(sim.state) in ["playing","paused"]
	if radar_panel.visible:
		radar.sync(sim)

func _slots(parent: HBoxContainer, sim, kind: String) -> void:
	_clear(parent)
	var ids = sim.owned(kind)
	for i in range(6):
		var p = PanelContainer.new()
		p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		p.custom_minimum_size = Vector2(38, 29 if kind == "passive" else 43)
		var has_item = i < ids.size()
		var id = str(ids[i]) if has_item else ""
		var evolved = has_item and bool(sim.player.evolved.get(id, false))
		p.add_theme_stylebox_override("panel", _style(GOLD if evolved else Color("dde8dc") if has_item else Color("e6ebe0"), LINE, 6, 2))
		var row = _hbox(p, 2)
		row.alignment = BoxContainer.ALIGNMENT_CENTER
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if has_item:
			row.add_child(_icon(id, 20 if kind == "passive" else 25,evolved))
		var l = _label("E" if evolved else str(sim.player.levels.get(id,0)) if has_item else "·", 10 if kind == "passive" else 11, INK if has_item else MUTED)
		l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(l)
		p.tooltip_text = (catalog.evo_names.get(id, catalog.label(id)) if evolved else catalog.label(id)) + " · Lv.%d\n" % int(sim.player.levels.get(id, 0)) + catalog.description(id) if has_item else "빈 슬롯"
		parent.add_child(p)

func _modal(title: String, subtitle: String, width: float = 800.0) -> VBoxContainer:
	_clear(modal_root)
	modal_root.visible = true
	var shade = ColorRect.new()
	shade.color = Color(0.05, 0.11, 0.12, 0.57)
	modal_root.add_child(shade)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	var shell = _panel(modal_root, PAPER, 0)
	shell.name = "ModalShell"
	shell.set_meta("preferred_width", width)
	var scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	shell.add_child(scroll)
	var margin = MarginContainer.new()
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 24 if not _small else 18)
	margin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(margin)
	var box = _vbox(margin, 15)
	box.add_child(_eyebrow(subtitle, Color("4c8d75")))
	box.add_child(_copy(title, 31 if not _small else 26, INK))
	_layout_modal()
	call_deferred("_layout_modal")
	return box

func _layout_modal() -> void:
	var shell = modal_root.get_node_or_null("ModalShell")
	if shell == null:
		return
	var w = root.size.x
	var h = root.size.y
	var width = minf(float(shell.get_meta("preferred_width", 800)), w - 28)
	var height = minf(700.0, h - 40.0)
	_place(shell, Vector2((w - width) * 0.5, (h - height) * 0.5), Vector2(width, height))

func _show_choices(sim) -> void:
	_build_open = false
	_guide_open = false
	_settings_open = false
	_history_open = false
	var chest = str(sim.state) == "chest"
	var box = _modal("보급품을 선택하세요." if chest else "어떤 힘을 더할까요?", "SUPPLY DROP" if chest else "LEVEL UP  /  LV.%02d" % int(sim.player.lv), 940)
	box.add_child(_copy("액티브 %d/6  ·  보조 %d/6  ·  전투가 일시정지되었습니다" % [sim.owned("weapon").size(), sim.owned("passive").size()], 14))
	var cards = GridContainer.new()
	cards.columns = 1 if _small else 3
	cards.add_theme_constant_override("h_separation", 12)
	cards.add_theme_constant_override("v_separation", 10)
	box.add_child(cards)
	for i in range(sim.draft.size()):
		var token = str(sim.draft[i])
		var id = token.substr(2) if token.begins_with("E:") else token
		var evolved = token.begins_with("E:")
		var card = Button.new()
		card.name = "Choice%d" % (i + 1)
		card.custom_minimum_size = Vector2(0, 228 if _small else 344)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		var fill = Color("f4e6bd") if evolved else CREAM
		card.add_theme_stylebox_override("normal", _style(fill, GOLD if evolved else LINE, 13, 14))
		card.add_theme_stylebox_override("hover", _style(Color("e0efda"), Color("4b9579"), 13, 14))
		card.add_theme_stylebox_override("pressed", _style(MINT, INK, 13, 14))
		card.add_theme_stylebox_override("focus", _focus_style())
		card.pressed.connect(func(): choice_selected.emit(token))
		cards.add_child(card)
		var margin = MarginContainer.new()
		margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(margin)
		margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		for side in ["left", "right", "top", "bottom"]:
			margin.add_theme_constant_override("margin_" + side, 15)
		var content = _vbox(margin, 8)
		content.mouse_filter = Control.MOUSE_FILTER_IGNORE
		content.add_child(_eyebrow("0%d  /  %s" % [i + 1, "EVOLVE" if evolved else "SUPPLY" if token == "GOLD" else "UPGRADE"]))
		var preview: Dictionary = catalog.preview_upgrade(sim,token)
		var heading = _hbox(content,9)
		heading.mouse_filter = Control.MOUSE_FILTER_IGNORE
		heading.add_child(_icon(id,33,evolved))
		var name = str(preview.get("title",catalog.label(token)))
		var title_label = _copy(name, 21 if not _small else 19, INK)
		title_label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		heading.add_child(title_label)
		var status = "진화 / 합체" if evolved else "기록용 크레딧 획득" if token == "GOLD" else "Lv.%d → Lv.%d" % [int(sim.player.levels.get(id, 0)), int(sim.player.levels.get(id, 0)) + 1]
		content.add_child(_label(status, 13, Color("a67436") if evolved else Color("4b836c")))
		var desc = "전투 골드와 체력을 보충합니다." if token == "GOLD" else str(catalog.evo_desc.get(id, "강화된 무기")) if evolved else catalog.description(id)
		content.add_child(_copy(desc, 12))
		var comparison = _copy("\n".join(preview.get("lines",[])), 13, INK)
		comparison.name = "Comparison%d" % (i+1)
		comparison.add_theme_constant_override("line_spacing", 3)
		content.add_child(comparison)
		var synergy = _copy(str(preview.get("synergy","")),12,Color("9a6730") if bool(preview.get("ready",false)) else Color("557b6c"))
		synergy.name = "Synergy%d" % (i+1)
		content.add_child(synergy)
		content.minimum_size_changed.connect(func(): _fit_card.call_deferred(card,content))
		_fit_card.call_deferred(card,content)
	var buttons = _vbox(box, 8) if _small else _hbox(box, 10)
	if not chest:
		var reroll_button = _button("다시 뽑기 · R  /  %d" % int(sim.rerolls), func(): reroll_requested.emit())
		reroll_button.name = "RerollButton"
		reroll_button.disabled = sim.rerolls <= 0
		reroll_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		buttons.add_child(reroll_button)
	var save = _button("선택 보류 · 저장 후 로비", func(): save_quit_requested.emit())
	save.name = "SaveChoiceButton"
	save.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	buttons.add_child(save)
	box.add_child(_copy("숫자 1 / 2 / 3으로 선택할 수 있습니다.", 12))

func _fit_card(card: Control, content: Control) -> void:
	if is_instance_valid(card) and is_instance_valid(content):
		card.custom_minimum_size.y = maxf(228.0 if _small else 344.0,content.get_combined_minimum_size().y+30.0)

func _show_pause() -> void:
	var box = _modal("잠시 숨을 고르세요.", "PAUSED  /  TACTICAL BREAK", 570)
	box.add_child(_copy("전투 시간, 적과 투사체, 회복 및 쿨다운이 멈췄습니다.", 17))
	_separator(box)
	var resume_button = _button("전투 계속하기 · P / Esc", func(): resume_requested.emit(), true)
	resume_button.name = "ResumeButton"
	box.add_child(resume_button)
	box.add_child(_button("빌드 살펴보기 · B", func(): build_requested.emit()))
	var settings = _button("설정", _show_settings)
	settings.name = "PauseSettingsButton"
	box.add_child(settings)
	var save_button = _button("저장 후 로비", func(): save_quit_requested.emit())
	save_button.name = "SaveQuitButton"
	box.add_child(save_button)
	box.add_child(_copy("WASD / 방향키 : 이동\n1·2·3 : 카드 선택    R : 다시 뽑기\nB : 빌드    M : 효과음    N : 레이더    F11 : 전체 화면", 14))

func show_build(sim) -> void:
	_build_open = true
	_guide_open = false
	_settings_open = false
	_history_open = false
	var box = _modal("선택이 만드는 빌드.", "LOADOUT  /  COMBAT ANALYSIS", 800)
	box.add_child(_copy("공격 ×%.2f   ·   간격 ×%.2f   ·   이동 ×%.2f\n흡수 반경 %.0f   ·   범위 ×%.2f   ·   피해 감소 %.0f%%" % [1.0 + sim.passive_value("atk"), 1.0 - sim.passive_value("cooldown"), 1.0 + sim.passive_value("speed"), 65.0 * (1.0 + sim.passive_value("magnet")), 1.0 + sim.passive_value("range"), sim.passive_value("armor") * 100], 15))
	for kind in ["weapon", "passive"]:
		_separator(box)
		box.add_child(_eyebrow(("ACTIVE" if kind == "weapon" else "PASSIVE") + "  /  %d OF 6" % sim.owned(kind).size()))
		for id in sim.owned(kind):
			var evolved = bool(sim.player.evolved.get(id, false))
			var name = catalog.evo_names.get(id, catalog.label(id)) if evolved else catalog.label(id)
			var tail = "진화 완료" if evolved else "Lv.%d" % int(sim.player.levels[id])
			var desc = ""
			if catalog.evo_pairs.has(id):
				var pair = catalog.evo_pairs[id]
				desc = "  /  " + catalog.label(pair) + (" 확보" if sim.player.levels.get(pair, 0) > 0 else " 필요")
			var build_row = _hbox(box,10)
			build_row.add_child(_icon(str(id),28,evolved))
			var item_column = _vbox(build_row,3)
			item_column.add_child(_copy(str(name) + "  " + tail, 15, INK))
			if not evolved and kind == "weapon":
				if id in ["droneA", "droneB"]:
					var other = "droneB" if id == "droneA" else "droneA"
					item_column.add_child(_copy("합체 · %d/5 + %s %d/5" % [int(sim.player.levels[id]),catalog.label(other),int(sim.player.levels.get(other,0))],12))
				elif catalog.evo_pairs.has(id):
					item_column.add_child(_copy("진화 · Lv.%d/5" % int(sim.player.levels[id])+desc,12))
	_separator(box)
	box.add_child(_eyebrow("DAMAGE REPORT  /  실제 적용 피해"))
	var damage: Dictionary = sim.stats.get("by_weapon", {})
	var ids = damage.keys()
	ids.sort_custom(func(a, b): return float(damage[a]) > float(damage[b]))
	for id in ids:
		var ratio = float(damage[id])/maxf(1.0,float(sim.stats.get("damage",0)))
		box.add_child(_label("%s    %s  /  %.1f%%" % [catalog.label(str(id)), _number(float(damage[id])),ratio*100], 15, MUTED))
		var damage_bar = _bar(Color("82bb9b"),4)
		damage_bar.value = ratio*100
		box.add_child(damage_bar)
	if ids.is_empty():
		box.add_child(_copy("아직 기록된 피해가 없습니다.", 14))
	var close = _button("전투 계속하기 · B", func(): hide_build(); resume_requested.emit(), true)
	close.name = "BuildCloseButton"
	box.add_child(close)
	box.add_child(_button("저장 후 로비", func(): save_quit_requested.emit()))

func hide_build() -> void:
	_build_open = false
	modal_root.visible = false

func close_overlay() -> bool:
	## Esc closes a UI-owned overlay without resuming the frozen combat below it.
	if not (_settings_open or _history_open or _guide_open):
		return false
	_settings_open = false
	_history_open = false
	_guide_open = false
	if _state == "paused":
		_show_pause()
	else:
		modal_root.visible = false
	return true

func _show_settings() -> void:
	_settings_open = true
	_history_open = false
	_guide_open = false
	_build_open = false
	var box = _modal("나에게 맞는 전장.", "SETTINGS  /  AUDIO & DISPLAY", 660)
	box.add_child(_copy("변경 사항은 즉시 적용되며 다음 실행에도 유지됩니다.",14))
	_setting_toggle(box,"sound","효과음","공격, 피격, 성장과 보스 등장 소리")
	var volume_top = _hbox(box,8)
	var volume_title = _label("효과음 크기",16)
	volume_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	volume_top.add_child(volume_title)
	var volume_label = _label("%d%%" % roundi(float(_profile.get("settings",{}).get("volume",0.7))*100),14,MUTED)
	volume_label.name = "VolumeValue"
	volume_top.add_child(volume_label)
	var volume = HSlider.new()
	volume.name = "VolumeSlider"
	volume.min_value = 0
	volume.max_value = 100
	volume.step = 1
	volume.value = float(_profile.get("settings",{}).get("volume",0.7))*100
	volume.custom_minimum_size.y = 34
	volume.add_theme_stylebox_override("slider",_volume_track(Color("c0cfc1")))
	volume.add_theme_stylebox_override("grabber_area",_volume_track(Color("548b70")))
	volume.add_theme_stylebox_override("grabber_area_highlight",_volume_track(Color("39745d")))
	volume.add_theme_icon_override("grabber",_volume_thumb(MINT))
	volume.add_theme_icon_override("grabber_highlight",_volume_thumb(Color("d7f2c8")))
	volume.add_theme_icon_override("grabber_disabled",_volume_thumb(LINE))
	volume.value_changed.connect(func(value:float):
		volume_label.text = "%d%%" % roundi(value)
		settings_changed.emit({"volume":value/100.0})
	)
	box.add_child(volume)
	_separator(box)
	_setting_toggle(box,"quality","고품질 그래픽","그림자와 가장자리 품질 · 끄면 렌더링 부하 감소")
	_setting_toggle(box,"screen_shake","타격 화면 흔들림","피격 시 카메라 반응")
	_setting_toggle(box,"damage_numbers","피해 숫자","적에게 적용한 피해를 전장에 표시")
	_setting_toggle(box,"radar","전술 레이더","적은 주황색, 보스는 금색 · N으로 빠르게 전환")
	_separator(box)
	box.add_child(_copy("F11 전체 화면 · 설정 창을 닫아도 일시정지 상태는 유지됩니다.",12))
	var back = _button("이전 화면으로 · Esc",func():close_overlay(),true)
	back.name = "SettingsCloseButton"
	box.add_child(back)

func _volume_track(fill: Color) -> StyleBoxFlat:
	var track = _style(fill,fill,3,0)
	# HSlider uses the style's minimum height, not the Control's 34 px hit area.
	track.content_margin_top = 3
	track.content_margin_bottom = 3
	return track

func _volume_thumb(fill: Color) -> ImageTexture:
	var bitmap = Image.create(22,22,false,Image.FORMAT_RGBA8)
	for y in range(22):
		for x in range(22):
			var distance = Vector2(x+0.5-11.0,y+0.5-11.0).length()
			var color = INK if distance>7.5 else fill
			color.a = clampf(10.5-distance,0.0,1.0)
			bitmap.set_pixel(x,y,color)
	return ImageTexture.create_from_image(bitmap)

func _sync_settings_controls() -> void:
	## M/N hotkeys can change the profile while this modal owns focus.
	## Update toggles in place; do not recreate the modal or disturb a dragged slider.
	for id in ["sound","quality","screen_shake","damage_numbers","radar"]:
		var button = modal_root.find_child("Setting_"+id,true,false) as Button
		if button == null:
			continue
		var enabled = bool(_profile.get("settings",{}).get(id,true))
		button.set_pressed_no_signal(enabled)
		button.text = "켬" if enabled else "끔"

func _setting_toggle(parent: Node, id: String, title: String, detail: String) -> void:
	var row = _hbox(parent,14)
	var copy = _vbox(row,4)
	copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	copy.add_child(_copy(title,16,INK))
	copy.add_child(_copy(detail,12))
	var value = bool(_profile.get("settings",{}).get(id,true))
	var button = _button("켬" if value else "끔",Callable())
	button.name = "Setting_"+id
	button.toggle_mode = true
	button.set_pressed_no_signal(value)
	button.custom_minimum_size.x = 64
	button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	button.add_theme_stylebox_override("pressed",_style(MINT,Color("6eab90"),10,12))
	button.toggled.connect(func(enabled:bool):
		button.text = "켬" if enabled else "끔"
		settings_changed.emit({id:enabled})
	)
	row.add_child(button)

func _show_history() -> void:
	_history_open = true
	_settings_open = false
	_guide_open = false
	_build_open = false
	var box = _modal("한 번의 전투가, 다음의 기준.", "COMBAT ARCHIVE  /  RECENT RUNS", 770)
	box.add_child(_copy("%d회 출전  ·  %d회 승리  ·  누적 크레딧 %s" % [int(_profile.get("runs",0)),int(_profile.get("wins",0)),_number(float(_profile.get("credits",0)))],15,INK))
	box.add_child(_eyebrow("FIELD RECORDS  /  전장별 최고 기록"))
	for chapter in range(3):
		var record: Dictionary = _profile.get("records",{}).get(str(chapter),{})
		var time = _clock(float(record.get("best_time",0))) if float(record.get("best_time",0))>0 else "—"
		box.add_child(_copy("%s  ·  %d승\n최고 %d 처치 / Lv.%d  ·  최단 클리어 %s" % [str(catalog.chapters[chapter].name),int(record.get("clears",0)),int(record.get("best_kills",0)),int(record.get("best_level",0)),time],14,INK))
	_separator(box)
	box.add_child(_eyebrow("LATEST 12  /  최근 완료한 전투"))
	var entries: Array = _profile.get("history",[])
	if entries.is_empty():
		var empty = _copy("아직 완료한 전투가 없습니다.\n전투를 마치면 승패, 빌드 성장과 마지막 피해 원인이 여기에 남습니다.",15)
		empty.name = "EmptyHistory"
		box.add_child(empty)
	for i in range(mini(12,entries.size())):
		var item: Dictionary = entries[i]
		var card = _panel(box,CREAM,14)
		card.name = "HistoryRecord%d" % i
		var content = _vbox(card,7)
		var chapter = clampi(int(item.get("chapter",0)),0,2)
		var won = bool(item.get("won",false))
		content.add_child(_eyebrow(("SUCCESS" if won else "DEFEAT")+"  /  %02d" % (i+1),Color("397c63") if won else Color("b06951")))
		content.add_child(_copy("%s · %s" % [str(catalog.chapters[chapter].name),catalog.label(str(item.get("weapon","kunai")))],17,INK))
		content.add_child(_copy("%s 생존  ·  %d 처치  ·  Lv.%d  ·  진화 %d" % [_clock(float(item.get("elapsed",0))),int(item.get("kills",0)),int(item.get("level",1)),int(item.get("evolutions",0))],13))
		content.add_child(_copy("적용 피해 %s  ·  보상 크레딧 %s" % [_number(float(item.get("damage",0))),_number(float(item.get("credits",0)))],12))
		var cause = str(item.get("cause",""))
		if not won and not cause.is_empty():
			content.add_child(_copy("마지막 피해 · "+cause,12,Color("a36851")))
	var back = _button("로비로 돌아가기 · Esc",func():close_overlay(),true)
	back.name = "HistoryCloseButton"
	box.add_child(back)

func _show_guide() -> void:
	_guide_open = true
	_build_open = false
	_settings_open = false
	_history_open = false
	var box = _modal("생존자를 위한 필드 가이드.", "FIELD GUIDE  /  HOW TO SURVIVE", 850)
	box.add_child(_copy("이동하며 자동 공격 → 경험치 획득 → 카드 선택 → 무기 진화 → 최종 보스 처치", 17, INK))
	box.add_child(_copy("WASD / 방향키 / 터치 드래그 : 이동\nW는 화면 위, S는 아래로 이동합니다.\nP / Esc : 일시정지  ·  B : 빌드  ·  M : 효과음  ·  N : 레이더\n1·2·3 : 카드 선택  ·  R : 후보 다시 뽑기 (전투당 3회)", 15))
	_separator(box)
	box.add_child(_eyebrow("EVOLUTION RECIPES  /  15 COMBINATIONS"))
	box.add_child(_copy("주무기를 포함해 액티브 6칸, 보조 6칸. 무기 Lv.5와 대응 보조 Lv.1 이상이면 진화 후보가 됩니다. 조건 달성만으로 즉시 진화하지 않습니다.", 15))
	for id in catalog.evo_pairs:
		box.add_child(_copy("%s Lv.5 + %s\n→ %s" % [catalog.label(id), catalog.label(catalog.evo_pairs[id]), str(catalog.evo_names.get(id, id))], 14, INK))
	box.add_child(_copy("A형 드론 Lv.5 + B형 드론 Lv.5\n→ 파괴자 · 액티브 슬롯 1칸 반환", 14, INK))
	_separator(box)
	box.add_child(_eyebrow("MISSION RULES"))
	box.add_child(_copy("5분 전투: 02:30 중간 보스 · 05:00 최종 보스\n15분 전투: 05:00 / 10:00 중간 보스 · 15:00 최종 보스\n시간이 끝난 뒤 최종 보스를 처치해야 승리합니다.\n배경 건물·차량·나무는 장식이며 충돌하지 않습니다.", 15))
	box.add_child(_copy("보스가 등장하면 일반 웨이브가 멈춥니다. 준비 시간에 위치를 잡고 예고된 공격 범위를 피하세요.\n레이더: 주황 점 = 적, 금색 마름모 = 보스, 금색 사각 = 보급, 초록 십자 = 회복.",14))
	box.add_child(_copy("독립 구현입니다. 공개 참조 조합과 v14 설계용 전투 수치를 사용합니다. 원작 클라이언트·공식 아트·과금·서버 기능은 포함하지 않습니다.", 13))
	var back = _button("로비로 돌아가기", func(): close_overlay(), true)
	back.name = "GuideCloseButton"
	box.add_child(back)

func _show_results(sim) -> void:
	var won = str(sim.state) == "won"
	var box = _modal("작전 성공." if won else "다음 출전은 더 강하게.", "MISSION COMPLETE" if won else "RUN COMPLETE", 690)
	box.add_child(_copy("최종 보스를 처치했습니다." if won else "이번 전투의 빌드와 기록을 확인하세요.", 18, INK))
	box.add_child(_copy("%s · %s · %d분" % [str(catalog.chapters[clampi(int(sim.config.get("chapter",0)),0,2)].name),catalog.label(str(sim.config.get("weapon","kunai"))),int(sim.config.get("duration",300))/60],13))
	var numbers = GridContainer.new()
	numbers.columns = 2
	numbers.add_theme_constant_override("h_separation", 14)
	numbers.add_theme_constant_override("v_separation", 14)
	box.add_child(numbers)
	for item in [["생존 시간", _clock(float(sim.elapsed))], ["처치", str(sim.stats.get("kills", 0))], ["최종 레벨", "LV.%d" % int(sim.player.get("lv", 1))], ["무기 진화", str(sim.stats.get("evolutions", 0))]]:
		var p = _panel(numbers, CREAM, 17)
		p.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var content = _vbox(p, 5)
		content.add_child(_eyebrow(item[0]))
		content.add_child(_label(item[1], 30))
	box.add_child(_copy("총 적용 피해 %s  ·  받은 피해 %s\n보급 상자 %d  ·  탄환 차단 %d" % [_number(float(sim.stats.get("damage", 0))), _number(float(sim.stats.get("taken", 0))), int(sim.stats.get("chests", 0)), int(sim.stats.get("blocked", 0))], 15))
	var last_damage = sim.get("last_damage")
	if not won and last_damage is Dictionary and not str(last_damage.get("cause","")).is_empty():
		var cause = _copy("마지막 피해 · %s (%d HP)" % [str(last_damage.cause),int(ceil(float(last_damage.get("amount",0))))],14,Color("a36851"))
		cause.name = "LastDamageCause"
		box.add_child(cause)
	var reward = _copy("이번 보상 크레딧 %s" % _number(float(sim.stats.get("reward",0))),14,Color("4b836c"))
	reward.name = "RunReward"
	box.add_child(reward)
	var retry = _button("같은 설정으로 다시 출전", func(): restart_requested.emit(), true)
	retry.name = "RestartButton"
	box.add_child(retry)
	var lobby = _button("로비로 돌아가기", func(): lobby_requested.emit())
	lobby.name = "ResultLobbyButton"
	box.add_child(lobby)
	box.add_child(_copy("완료한 전투는 로비의 전투 기록에서 다시 볼 수 있습니다.", 12))

func show_error(message: String) -> void:
	if not _built:
		return
	error_label.text = message
	_error_until = Time.get_ticks_msec() + 7000
	error_root.visible = true
	_layout_hud()

func _clear(node: Node) -> void:
	for child in node.get_children():
		node.remove_child(child)
		child.queue_free()

func _clock(seconds: float) -> String:
	var whole = maxi(0, int(seconds))
	return "%02d:%02d" % [whole / 60, whole % 60]

func _number(value: float) -> String:
	if value >= 1000000:
		return "%.2fM" % (value / 1000000.0)
	if value >= 10000:
		return "%.1fK" % (value / 1000.0)
	return str(int(round(value)))
