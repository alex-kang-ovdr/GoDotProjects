extends Node2D

## FTL: Faster Than Light — Godot 4.7.2 Data-Driven Restoration
## Loads real blueprints, ship layouts, sprites, events, and OGG/WAV audio directly from C:\Temp\FTL\ftl.dat.vanilla.

const SAVE_PATH := "user://ftl_godot_run_v1.json"

var pkg: FTLPkg
var db: FTLDatabase
var profile: FTLProfile
var audio: FTLAudio
var battle_view: FTLBattleView
var sector_map: FTLSectorMap
var player_ship: FTLShip
var enemy_ship: FTLShip

# Run state
var mode: String = "hangar" # hangar, play, victory, defeat
var difficulty: int = 0     # 0=Easy, 1=Normal, 2=Hard
var selected_hangar_idx: int = 0
var selected_crew_id: int = -1
var selected_boarder_id: int = -1
var targeting_weapon_idx: int = -1
var special_target_mode: String = "" # "", "tp_send", "tp_back", "hack", "mind"
var paused: bool = false
var in_combat: bool = false
var active_event: Dictionary = {}
var current_store_inventory: Dictionary = {}
var ships_defeated: int = 0
var scrap_collected: int = 0
var hazard_timer: float = 11.0
var status_banner_text: String = ""
var status_banner_time: float = 0.0

# UI nodes
var ui_layer: CanvasLayer
var ui_root: Control
var hangar_panel: PanelContainer
var hud_root: Control
var modal_overlay: ColorRect
var modal_card: PanelContainer
var modal_box: VBoxContainer
var modal_kind: String = ""
var ui_font: Font
var hud_refs: Dictionary = {}
var hangar_refs: Dictionary = {}
var _hud_accum: float = 0.0


func _ready() -> void:
	if get_tree() != null and get_tree().root != null:
		get_tree().root.set_meta("playhub_native_touch_controls", true)
	_install_ui_font()

	pkg = FTLPkg.new()
	pkg.auto_open()
	pkg.data_pack_ready.connect(_on_web_data_pack_ready)
	pkg.profile_ready.connect(_on_web_profile_ready)
	pkg.texture_loaded.connect(_on_web_texture_loaded)
	db = FTLDatabase.new()
	db.load_all(pkg)

	profile = FTLProfile.new()
	profile.auto_load()

	audio = FTLAudio.new()
	audio.name = "FTLAudio"
	add_child(audio)
	audio.setup(pkg, db)

	battle_view = FTLBattleView.new()
	battle_view.name = "BattleView"
	add_child(battle_view)
	battle_view.setup(pkg, db)
	battle_view.enemy_room_clicked.connect(_on_enemy_room_clicked)
	battle_view.enemy_room_right_clicked.connect(_on_enemy_room_right_clicked)
	battle_view.enemy_beam_aimed.connect(_on_enemy_beam_aimed)
	battle_view.player_room_clicked.connect(_on_player_room_clicked)
	battle_view.player_door_clicked.connect(_on_player_door_clicked)
	battle_view.crew_clicked.connect(_on_crew_clicked)
	battle_view.boarder_clicked.connect(_on_boarder_clicked)

	sector_map = FTLSectorMap.new()

	ui_layer = CanvasLayer.new()
	ui_layer.name = "HUDLayer"
	add_child(ui_layer)
	ui_root = Control.new()
	ui_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui_root.theme = _build_theme()
	ui_layer.add_child(ui_root)

	_build_hangar_ui()
	_build_hud_ui()
	_build_modal_ui()

	_show_hangar()
	if not pkg.is_loaded and (OS.has_feature("web") or not OS.get_environment("FTL_WEB_BASE_URL").is_empty()):
		if pkg.start_web_bootstrap(self):
			hangar_refs["src_badge"].text = "Web FTL 데이터 스트리밍 중 (/ftl-pkg/xml-bundle.json)..."
	print("FTL_GODOT_READY | archive=%s | entries=%d | ships=%d | weapons=%d | events=%d" % [
		pkg.archive_path if pkg.is_loaded else "fallback",
		pkg.entry_count, db.ships.size(), db.weapons.size(), db.events.size()
	])


func _on_web_data_pack_ready(ok: bool) -> void:
	if ok:
		db.load_all(pkg)
		if mode == "hangar":
			_show_hangar()
		print("FTL_WEB_DATA_READY | entries=%d | ships=%d | weapons=%d | events=%d" % [
			pkg.entry_count, db.ships.size(), db.weapons.size(), db.events.size()
		])
	else:
		hangar_refs["src_badge"].text = "Web 독립 실행 모드 (내장 FTL 폴백 데이터)"


func _on_web_profile_ready(profile_data: Dictionary) -> void:
	if not profile_data.is_empty():
		profile.load_from_dict(profile_data)
		if mode == "hangar":
			_show_hangar()
		print("FTL_WEB_PROFILE_READY | games=%d | victories=%d | achievements=%d" % [
			int(profile.stats.get("total_games", 0)),
			int(profile.stats.get("total_victories", 0)),
			profile.achievements.size()
		])


func _on_web_texture_loaded(_rel_path: String) -> void:
	if mode == "hangar" and not db.player_ship_ids.is_empty():
		var sid := db.player_ship_ids[clampi(selected_hangar_idx, 0, db.player_ship_ids.size() - 1)]
		var bp: Dictionary = db.ships.get(sid, {})
		var img_n := str(bp.get("img", "kestral"))
		var tex := pkg.load_texture("ship/%s_base.png" % img_n)
		if tex != null:
			hangar_refs["preview_tex"].texture = tex
	if battle_view != null:
		battle_view.queue_redraw()


func _exit_tree() -> void:
	if pkg != null:
		pkg.close()
	if ThemeDB.fallback_font == ui_font:
		ThemeDB.fallback_font = null


func _install_ui_font() -> void:
	var sys := SystemFont.new()
	sys.font_names = PackedStringArray(["Malgun Gothic", "Noto Sans CJK KR", "Segoe UI", "DejaVu Sans", "sans-serif"])
	var bundled: FontFile = null
	if FileAccess.file_exists("res://assets/fonts/ftl-ui.txt"):
		var raw := FileAccess.get_file_as_string("res://assets/fonts/ftl-ui.txt").strip_edges()
		if not raw.is_empty():
			bundled = FontFile.new()
			bundled.data = Marshalls.base64_to_raw(raw)
			if not OS.has_feature("web"):
				bundled.fallbacks = [sys]
	ui_font = bundled if bundled != null else sys
	ThemeDB.fallback_font = ui_font


func _build_theme() -> Theme:
	var t := Theme.new()
	t.default_font = ui_font
	t.default_font_size = 14
	for cls in ["Label", "Button", "LineEdit", "RichTextLabel"]:
		t.set_color("font_color", cls, Color("e6f0f7"))
		t.set_color("font_hover_color", cls, Color("7eff8b"))
		t.set_color("font_pressed_color", cls, Color("ffd54f"))
		t.set_color("font_disabled_color", cls, Color("687785"))
	t.set_stylebox("normal", "Button", _box(Color("182532"), Color("496882"), 6, 8))
	t.set_stylebox("hover", "Button", _box(Color("223648"), Color("7eff8b"), 6, 8))
	t.set_stylebox("pressed", "Button", _box(Color("2d475c"), Color("ffd54f"), 6, 8))
	t.set_stylebox("disabled", "Button", _box(Color("111922"), Color("2a3947"), 6, 8))
	t.set_stylebox("panel", "PanelContainer", _box(Color(0.07, 0.11, 0.16, 0.94), Color("4e708e"), 8, 12))
	t.set_stylebox("normal", "LineEdit", _box(Color("0e1620"), Color("496882"), 5, 6))
	return t


func _box(bg: Color, border: Color, radius: int = 6, pad: int = 8) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(1 if border.a > 0.0 else 0)
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = pad
	sb.content_margin_right = pad
	sb.content_margin_top = pad
	sb.content_margin_bottom = pad
	return sb


func _mk_label(txt: String, sz: int = 14, col: Color = Color("e6f0f7"), wrap: bool = false) -> Label:
	var l := Label.new()
	l.text = txt
	l.add_theme_font_size_override("font_size", sz)
	l.add_theme_color_override("font_color", col)
	if wrap:
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l


func _mk_btn(txt: String, cb: Callable, primary: bool = false) -> Button:
	var b := Button.new()
	b.text = txt
	b.pressed.connect(cb)
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	if primary:
		b.add_theme_stylebox_override("normal", _box(Color("23563a"), Color("7eff8b"), 6, 10))
		b.add_theme_stylebox_override("hover", _box(Color("2d724c"), Color("b7ffbf"), 6, 10))
		b.add_theme_color_override("font_color", Color("eaffef"))
	return b


# ==================== HANGAR UI ====================
func _build_hangar_ui() -> void:
	hangar_panel = PanelContainer.new()
	hangar_panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	hangar_panel.offset_left = -520
	hangar_panel.offset_right = 520
	hangar_panel.offset_top = -315
	hangar_panel.offset_bottom = 315
	ui_root.add_child(hangar_panel)

	var root_v := VBoxContainer.new()
	root_v.add_theme_constant_override("separation", 10)
	hangar_panel.add_child(root_v)

	var head := HBoxContainer.new()
	root_v.add_child(head)
	var title_l := _mk_label("FTL: FASTER THAN LIGHT · GODOT 4 RESTORATION", 24, Color("7eff8b"))
	title_l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title_l)
	var src_badge := _mk_label("", 12, Color("93b9d8"))
	head.add_child(src_badge)
	hangar_refs["src_badge"] = src_badge

	var split := HBoxContainer.new()
	split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	split.add_theme_constant_override("separation", 14)
	root_v.add_child(split)

	# Left: Ship list scroll
	var left_v := VBoxContainer.new()
	left_v.custom_minimum_size.x = 270
	split.add_child(left_v)
	left_v.add_child(_mk_label("함선 격납고 (SHIP HANGAR)", 14, Color("ffd54f")))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_v.add_child(scroll)
	var list_box := VBoxContainer.new()
	list_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list_box.add_theme_constant_override("separation", 4)
	scroll.add_child(list_box)
	hangar_refs["ship_list"] = list_box

	# Right: Ship preview + details
	var right_v := VBoxContainer.new()
	right_v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_v.add_theme_constant_override("separation", 8)
	split.add_child(right_v)

	var preview_frame := PanelContainer.new()
	preview_frame.custom_minimum_size = Vector2(680, 250)
	preview_frame.add_theme_stylebox_override("panel", _box(Color(0.03, 0.05, 0.08, 0.95), Color("3c5973"), 6, 8))
	right_v.add_child(preview_frame)
	var preview_tex := TextureRect.new()
	preview_tex.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	preview_tex.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	preview_frame.add_child(preview_tex)
	hangar_refs["preview_tex"] = preview_tex

	var ship_title := _mk_label("The Kestrel", 20, Color("ffffff"))
	right_v.add_child(ship_title)
	hangar_refs["ship_title"] = ship_title

	var ship_desc := _mk_label("", 13, Color("b8cde0"), true)
	right_v.add_child(ship_desc)
	hangar_refs["ship_desc"] = ship_desc

	var ship_stats := _mk_label("", 13, Color("9ce8b2"), true)
	right_v.add_child(ship_stats)
	hangar_refs["ship_stats"] = ship_stats

	var name_row := HBoxContainer.new()
	right_v.add_child(name_row)
	name_row.add_child(_mk_label("함선 이름: ", 14, Color("c4d8ea")))
	var name_edit := LineEdit.new()
	name_edit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_row.add_child(name_edit)
	hangar_refs["name_edit"] = name_edit

	var diff_row := HBoxContainer.new()
	diff_row.add_theme_constant_override("separation", 8)
	right_v.add_child(diff_row)
	diff_row.add_child(_mk_label("난이도: ", 14, Color("c4d8ea")))
	var diff_btns: Array = []
	var diff_names: Array[String] = ["쉬움 (EASY)", "보통 (NORMAL)", "어려움 (HARD)"]
	for d_i in range(3):
		var dname: String = diff_names[d_i]
		var db_btn := _mk_btn(dname, func(): _set_difficulty(d_i))
		diff_row.add_child(db_btn)
		diff_btns.append(db_btn)
	hangar_refs["diff_btns"] = diff_btns

	var foot := HBoxContainer.new()
	foot.add_theme_constant_override("separation", 10)
	root_v.add_child(foot)
	var hint := _mk_label("Space 정지 · 1-4 무기(빔 드래그) · T/Y 보딩 · H 해킹 · N 마인드 · Z/X 문 · J 지도", 12, Color("8da8c2"))
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	foot.add_child(hint)
	var prof_btn := _mk_btn("프로필 · 기록 (PROFILE)", _open_profile_modal)
	foot.add_child(prof_btn)
	hangar_refs["prof_btn"] = prof_btn
	var cont_btn := _mk_btn("이어하기 (CONTINUE)", _continue_saved_run)
	foot.add_child(cont_btn)
	hangar_refs["cont_btn"] = cont_btn
	var start_btn := _mk_btn("출항 시작 (START RUN)", _start_new_run, true)
	start_btn.custom_minimum_size.x = 185
	foot.add_child(start_btn)
	hangar_refs["start_btn"] = start_btn


func _show_hangar() -> void:
	mode = "hangar"
	in_combat = false
	paused = false
	special_target_mode = ""
	_close_modal()
	hangar_panel.visible = true
	hud_root.visible = false
	enemy_ship = null
	battle_view.set_ships(null, null)
	battle_view.set_backdrop(0, false, "")
	audio.play_track("title", false)

	var prof_txt := " · 프로필: %d승/%d전" % [int(profile.stats.get("total_victories", 0)), int(profile.stats.get("total_games", 0))] if (profile != null and profile.loaded) else ""
	hangar_refs["src_badge"].text = (("FTL 데이터 연결됨: %s (%d개 에셋)%s" % [pkg.archive_path.get_file(), pkg.entry_count, prof_txt]) if pkg.is_loaded else ("내장 폴백 데이터 모드%s" % prof_txt))
	hangar_refs["cont_btn"].visible = FileAccess.file_exists(SAVE_PATH)

	var list_box: VBoxContainer = hangar_refs["ship_list"]
	for c in list_box.get_children():
		c.queue_free()
	for i in range(db.player_ship_ids.size()):
		var sid := db.player_ship_ids[i]
		var bp: Dictionary = db.ships.get(sid, {})
		var unlocked := profile == null or profile.is_ship_unlocked(sid)
		var badge := profile.get_ship_victory_badge(sid) if profile != null else ""
		var prefix := ("[LOCK] " if not unlocked else (badge + " " if not badge.is_empty() else ""))
		var label_txt := "%s%s — %s" % [prefix, str(bp.get("class_name", sid)), str(bp.get("name", sid))]
		var btn := _mk_btn(label_txt, func(): _select_hangar_ship(i))
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		if not unlocked:
			btn.add_theme_color_override("font_color", Color("6d7e8d"))
		list_box.add_child(btn)
	_select_hangar_ship(clampi(selected_hangar_idx, 0, maxi(0, db.player_ship_ids.size() - 1)))
	_set_difficulty(difficulty)


func _select_hangar_ship(idx: int) -> void:
	if db.player_ship_ids.is_empty():
		return
	selected_hangar_idx = clampi(idx, 0, db.player_ship_ids.size() - 1)
	var sid := db.player_ship_ids[selected_hangar_idx]
	var bp: Dictionary = db.ships.get(sid, {})
	var unlocked := profile == null or profile.is_ship_unlocked(sid)
	var badge := profile.get_ship_victory_badge(sid) if profile != null else ""
	var best_sc := profile.get_ship_best_score(sid) if profile != null else 0
	var badge_str := ("  [" + badge + "]") if not badge.is_empty() else ("  [미해금 - 프로필에서 전체 언락 가능]" if not unlocked else "")
	hangar_refs["ship_title"].text = "%s (%s)%s" % [str(bp.get("name", sid)), str(bp.get("class_name", "")), badge_str]
	hangar_refs["ship_desc"].text = str(bp.get("desc", ""))
	hangar_refs["name_edit"].text = str(bp.get("name", "The Kestrel"))
	if hangar_refs.has("start_btn"):
		hangar_refs["start_btn"].disabled = not unlocked

	var wp_names: Array[String] = []
	for w in bp.get("weapons", []):
		wp_names.append(str(db.weapons.get(str(w), {}).get("short", str(w))))
	var aug_names: Array[String] = []
	for a in bp.get("augments", []):
		aug_names.append(str(db.augments.get(str(a), {}).get("title", str(a))))
	var best_line := ("  |  최고 기록: %d점" % best_sc) if best_sc > 0 else ""
	hangar_refs["ship_stats"].text = "선체: %d  |  원자로: %d  |  승무원: %d (%s)%s\n무기: %s  |  보조장치: %s" % [
		int(bp.get("health", 30)),
		int(bp.get("maxPower", 8)),
		(bp.get("crew", []) as Array).size(),
		", ".join(PackedStringArray(bp.get("crew", []))),
		best_line,
		", ".join(PackedStringArray(wp_names)) if not wp_names.is_empty() else "없음",
		", ".join(PackedStringArray(aug_names)) if not aug_names.is_empty() else "없음",
	]

	var tex: Texture2D = null
	if pkg.is_loaded:
		var img_n := str(bp.get("img", "kestral"))
		tex = pkg.load_texture("ship/%s_base.png" % img_n)
		if tex == null:
			tex = pkg.load_texture("customizeUI/miniship_%s.png" % img_n)
	hangar_refs["preview_tex"].texture = tex


func _set_difficulty(d: int) -> void:
	difficulty = clampi(d, 0, 2)
	var btns: Array = hangar_refs.get("diff_btns", [])
	for i in range(btns.size()):
		var b: Button = btns[i]
		b.add_theme_stylebox_override("normal", _box(Color("28523d") if i == difficulty else Color("182532"), Color("7eff8b") if i == difficulty else Color("496882"), 6, 8))


# ==================== HUD UI ====================
func _build_hud_ui() -> void:
	hud_root = Control.new()
	hud_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui_root.add_child(hud_root)

	# TOP BAR
	var top_panel := PanelContainer.new()
	top_panel.position = Vector2(10, 8)
	top_panel.size = Vector2(1260, 62)
	top_panel.add_theme_stylebox_override("panel", _box(Color(0.06, 0.09, 0.13, 0.9), Color("45627d"), 6, 8))
	hud_root.add_child(top_panel)

	var top_h := HBoxContainer.new()
	top_h.add_theme_constant_override("separation", 14)
	top_panel.add_child(top_h)

	var hull_lbl := _mk_label("HULL 30/30", 15, Color("7eff8b"))
	top_h.add_child(hull_lbl)
	hud_refs["hull_lbl"] = hull_lbl

	var sh_lbl := _mk_label("SHIELD ●●", 15, Color("5cd6ff"))
	top_h.add_child(sh_lbl)
	hud_refs["sh_lbl"] = sh_lbl

	var res_lbl := _mk_label("FUEL 16  MSL 8  DRN 2  SCRAP 30", 14, Color("ffd54f"))
	top_h.add_child(res_lbl)
	hud_refs["res_lbl"] = res_lbl

	var stat_lbl := _mk_label("EVADE 15%  O2 100%", 14, Color("b8d8ee"))
	top_h.add_child(stat_lbl)
	hud_refs["stat_lbl"] = stat_lbl

	var sec_lbl := _mk_label("SECTOR 1", 13, Color("d8e6f2"))
	sec_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_h.add_child(sec_lbl)
	hud_refs["sec_lbl"] = sec_lbl

	var btn_jump := _mk_btn("JUMP (J)", _open_star_map, true)
	top_h.add_child(btn_jump)
	hud_refs["btn_jump"] = btn_jump
	var btn_ship := _mk_btn("SHIP (U)", _open_upgrades)
	top_h.add_child(btn_ship)
	var btn_store := _mk_btn("STORE", _open_store)
	btn_store.visible = false
	top_h.add_child(btn_store)
	hud_refs["btn_store"] = btn_store
	var btn_pause := _mk_btn("PAUSE", _toggle_pause)
	top_h.add_child(btn_pause)
	hud_refs["btn_pause"] = btn_pause
	top_h.add_child(_mk_btn("HANGAR", _show_hangar))

	# LEFT CREW PANEL
	var crew_panel := PanelContainer.new()
	crew_panel.position = Vector2(10, 80)
	crew_panel.size = Vector2(150, 310)
	crew_panel.add_theme_stylebox_override("panel", _box(Color(0.06, 0.09, 0.13, 0.85), Color("3c566e"), 6, 8))
	hud_root.add_child(crew_panel)
	var crew_v := VBoxContainer.new()
	crew_v.add_theme_constant_override("separation", 5)
	crew_panel.add_child(crew_v)
	crew_v.add_child(_mk_label("CREW (F1-F8)", 12, Color("93b9d8")))
	var crew_list := VBoxContainer.new()
	crew_list.add_theme_constant_override("separation", 4)
	crew_v.add_child(crew_list)
	hud_refs["crew_list"] = crew_list

	# BOTTOM BAR: Reactor + Systems + Weapons + Drones/Doors
	var bot_panel := PanelContainer.new()
	bot_panel.position = Vector2(10, 578)
	bot_panel.size = Vector2(1260, 134)
	bot_panel.add_theme_stylebox_override("panel", _box(Color(0.05, 0.08, 0.12, 0.92), Color("45627d"), 6, 8))
	hud_root.add_child(bot_panel)

	var bot_h := HBoxContainer.new()
	bot_h.add_theme_constant_override("separation", 12)
	bot_panel.add_child(bot_h)

	# Reactor summary
	var react_v := VBoxContainer.new()
	react_v.custom_minimum_size.x = 96
	bot_h.add_child(react_v)
	react_v.add_child(_mk_label("REACTOR", 12, Color("7eff8b")))
	var react_lbl := _mk_label("8 / 8", 20, Color("7eff8b"))
	react_v.add_child(react_lbl)
	hud_refs["react_lbl"] = react_lbl
	react_v.add_child(_mk_label("L-Click +\nR-Click -", 11, Color("8da8c2")))

	# Systems bar container
	var sys_h := HBoxContainer.new()
	sys_h.add_theme_constant_override("separation", 6)
	bot_h.add_child(sys_h)
	hud_refs["sys_h"] = sys_h

	# Weapons rack
	var wpn_v := VBoxContainer.new()
	wpn_v.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bot_h.add_child(wpn_v)
	var wpn_head := HBoxContainer.new()
	wpn_v.add_child(wpn_head)
	wpn_head.add_child(_mk_label("WEAPONS (1-4)", 12, Color("ffcf5c")))
	var auto_btn := _mk_btn("AUTOFIRE: OFF (V)", _toggle_autofire_all)
	auto_btn.custom_minimum_size.y = 24
	wpn_head.add_child(auto_btn)
	hud_refs["auto_btn"] = auto_btn
	var wpn_h := HBoxContainer.new()
	wpn_h.add_theme_constant_override("separation", 6)
	wpn_v.add_child(wpn_h)
	hud_refs["wpn_h"] = wpn_h

	# Drones & Utilities (Cloak, Teleporter, Hacking, Mind Control, Doors)
	var util_v := VBoxContainer.new()
	util_v.custom_minimum_size.x = 270
	util_v.add_theme_constant_override("separation", 4)
	bot_h.add_child(util_v)
	var drone_h := HBoxContainer.new()
	drone_h.add_theme_constant_override("separation", 4)
	util_v.add_child(drone_h)
	hud_refs["drone_h"] = drone_h

	var spec_h := HBoxContainer.new()
	spec_h.add_theme_constant_override("separation", 4)
	util_v.add_child(spec_h)
	var tp_send_btn := _mk_btn("TP SEND (T)", _on_tp_send_pressed)
	tp_send_btn.custom_minimum_size.y = 26
	spec_h.add_child(tp_send_btn)
	hud_refs["tp_send_btn"] = tp_send_btn
	var tp_back_btn := _mk_btn("TP BACK (Y)", _on_tp_back_pressed)
	tp_back_btn.custom_minimum_size.y = 26
	spec_h.add_child(tp_back_btn)
	hud_refs["tp_back_btn"] = tp_back_btn
	var hack_btn := _mk_btn("HACK (H)", _on_hack_pressed)
	hack_btn.custom_minimum_size.y = 26
	spec_h.add_child(hack_btn)
	hud_refs["hack_btn"] = hack_btn
	var mind_btn := _mk_btn("MIND (N)", _on_mind_pressed)
	mind_btn.custom_minimum_size.y = 26
	spec_h.add_child(mind_btn)
	hud_refs["mind_btn"] = mind_btn

	var door_h := HBoxContainer.new()
	door_h.add_theme_constant_override("separation", 5)
	util_v.add_child(door_h)
	door_h.add_child(_mk_btn("OPEN (Z)", func(): if player_ship: player_ship.open_all_doors_smart()))
	door_h.add_child(_mk_btn("CLOSE (X)", func(): if player_ship: player_ship.set_all_doors_open(false, true)))
	var cloak_btn := _mk_btn("CLOAK (C)", _on_cloak_pressed)
	door_h.add_child(cloak_btn)
	hud_refs["cloak_btn"] = cloak_btn
	var battery_btn := _mk_btn("BAT (B)", _on_battery_pressed)
	door_h.add_child(battery_btn)
	hud_refs["battery_btn"] = battery_btn

	# Pause / Status Banner
	var banner := _mk_label("", 22, Color("ffd54f"))
	banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	banner.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	banner.offset_top = 82
	banner.offset_bottom = 114
	hud_root.add_child(banner)
	hud_refs["banner"] = banner


func _build_modal_ui() -> void:
	modal_overlay = ColorRect.new()
	modal_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	modal_overlay.color = Color(0.02, 0.03, 0.06, 0.68)
	modal_overlay.visible = false
	ui_root.add_child(modal_overlay)

	modal_card = PanelContainer.new()
	modal_card.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	modal_card.offset_left = -380
	modal_card.offset_right = 380
	modal_card.offset_top = -255
	modal_card.offset_bottom = 255
	modal_overlay.add_child(modal_card)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	modal_card.add_child(scroll)

	modal_box = VBoxContainer.new()
	modal_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	modal_box.add_theme_constant_override("separation", 10)
	scroll.add_child(modal_box)


func _open_modal(kind: String, w: float = 740.0, h: float = 490.0) -> void:
	modal_kind = kind
	modal_overlay.visible = true
	modal_card.offset_left = -w * 0.5
	modal_card.offset_right = w * 0.5
	modal_card.offset_top = -h * 0.5
	modal_card.offset_bottom = h * 0.5
	for c in modal_box.get_children():
		c.queue_free()


func _close_modal() -> void:
	modal_kind = ""
	modal_overlay.visible = false


# ==================== RUN LIFECYCLE ====================
func _start_new_run() -> void:
	var sid := db.player_ship_ids[selected_hangar_idx] if not db.player_ship_ids.is_empty() else "PLAYER_SHIP_HARD"
	player_ship = FTLShip.new()
	player_ship.init_from_blueprint(db, sid, true, 0)
	var custom_n := str(hangar_refs["name_edit"].text).strip_edges()
	if not custom_n.is_empty():
		player_ship.ship_name = custom_n
	player_ship.scrap = 30 if difficulty == 0 else (15 if difficulty == 1 else 10)
	player_ship.fuel = 16
	enemy_ship = null
	ships_defeated = 0
	scrap_collected = 0
	selected_crew_id = int(player_ship.crew[0].id) if not player_ship.crew.is_empty() else -1
	selected_boarder_id = -1
	if selected_crew_id >= 0:
		player_ship.crew[0].selected = true
	targeting_weapon_idx = -1
	special_target_mode = ""
	battle_view.special_target_mode = ""
	in_combat = false
	paused = false

	sector_map.init_campaign(db)
	mode = "play"
	hangar_panel.visible = false
	hud_root.visible = true
	battle_view.clear_combat_fx()
	battle_view.set_ships(player_ship, null)
	battle_view.set_backdrop(0, false, "")
	audio.play_track(sector_map.current_sector_track, false)
	_save_run()
	_rebuild_hud_controls()
	_show_event_modal({
		"text": "Welcome aboard %s! Your mission: carry vital intelligence across 8 sectors to the Federation Base in Sector 8 and defeat the Rebel Flagship.\n\nPress JUMP (J) to open the Star Map and begin your journey." % player_ship.ship_name,
		"choices": [{"text": "Begin Mission (임무 시작)", "event": {}}],
	})


func _continue_saved_run() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	if not (parsed is Dictionary):
		return
	var sid := str(parsed.get("ship_id", "PLAYER_SHIP_HARD"))
	player_ship = FTLShip.new()
	player_ship.init_from_blueprint(db, sid, true, 0)
	if parsed.has("ship_state") and parsed.ship_state is Dictionary:
		player_ship.deserialize_state(parsed.ship_state)
	else:
		player_ship.ship_name = str(parsed.get("ship_name", player_ship.ship_name))
		player_ship.hull = clampi(int(parsed.get("hull", player_ship.max_hull)), 1, player_ship.max_hull)
		player_ship.scrap = int(parsed.get("scrap", 30))
		player_ship.fuel = int(parsed.get("fuel", 16))
		player_ship.missiles = int(parsed.get("missiles", 8))
		player_ship.drone_parts = int(parsed.get("drone_parts", 2))
		player_ship.reactor_max = int(parsed.get("reactor_max", player_ship.reactor_max))
	ships_defeated = int(parsed.get("ships_defeated", 0))
	scrap_collected = int(parsed.get("scrap_collected", 0))
	difficulty = int(parsed.get("difficulty", 0))

	sector_map.init_campaign(db)
	sector_map.enter_sector(clampi(int(parsed.get("sector_index", 0)), 0, 7), 0)
	enemy_ship = null
	selected_boarder_id = -1
	targeting_weapon_idx = -1
	special_target_mode = ""
	battle_view.special_target_mode = ""
	in_combat = false
	paused = false
	mode = "play"
	hangar_panel.visible = false
	hud_root.visible = true
	battle_view.clear_combat_fx()
	battle_view.set_ships(player_ship, null)
	audio.play_track(sector_map.current_sector_track, false)
	_rebuild_hud_controls()
	_banner("이전 항해 기록을 불러왔습니다 (Sector %d)" % (sector_map.current_sector_index + 1))


func _save_run() -> void:
	if player_ship == null or mode != "play":
		return
	var data := {
		"ship_id": player_ship.blueprint_id,
		"ship_name": player_ship.ship_name,
		"hull": player_ship.hull,
		"scrap": player_ship.scrap,
		"fuel": player_ship.fuel,
		"missiles": player_ship.missiles,
		"drone_parts": player_ship.drone_parts,
		"reactor_max": player_ship.reactor_max,
		"ship_state": player_ship.serialize_state(),
		"sector_index": sector_map.current_sector_index,
		"ships_defeated": ships_defeated,
		"scrap_collected": scrap_collected,
		"difficulty": difficulty,
	}
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(data, "\t"))
		f.close()


# ==================== SIMULATION LOOP & INPUT ====================
func _process(delta: float) -> void:
	if status_banner_time > 0.0:
		status_banner_time = maxf(0.0, status_banner_time - delta)
	if mode != "play" or player_ship == null:
		return

	var modal_blocking := not modal_kind.is_empty()
	var sim_paused := paused or modal_blocking
	battle_view.paused = sim_paused
	battle_view.targeting_weapon_idx = targeting_weapon_idx
	battle_view.special_target_mode = special_target_mode
	battle_view.hover_pos = get_viewport().get_mouse_position()

	if not sim_paused:
		player_ship.step(delta, enemy_ship, in_combat)
		if enemy_ship != null and in_combat:
			enemy_ship.step(delta, player_ship, in_combat)
		_process_ship_outputs(player_ship)
		if enemy_ship != null:
			_process_ship_outputs(enemy_ship)
		_step_hazard(delta)
		_check_combat_outcome()

	battle_view.step_fx(delta)

	_hud_accum += delta
	if _hud_accum >= 0.1:
		_hud_accum = 0.0
		_update_hud_labels()


func _process_ship_outputs(sh: FTLShip) -> void:
	for shot in sh.pending_shots:
		battle_view.spawn_shot(shot)
	sh.pending_shots.clear()
	for snd in sh.pending_sfx:
		audio.play_sfx(snd)
	sh.pending_sfx.clear()


func _step_hazard(delta: float) -> void:
	if not in_combat or battle_view.hazard_kind.is_empty():
		return
	hazard_timer -= delta
	if hazard_timer > 0.0:
		return
	hazard_timer = 11.5
	if battle_view.hazard_kind == "asteroid":
		var rock_bp := {"type": "LASER", "damage": 1, "shots": 1, "sp": 0, "fireChance": 0, "breachChance": 1, "speed": 42.0, "color": Color("c8a070")}
		for sh in [player_ship, enemy_ship]:
			if sh != null and sh.hull > 0 and not sh.rooms.is_empty():
				var rid := int(sh.rooms[randi() % sh.rooms.size()].id)
				sh.apply_projectile_impact(rock_bp, rid)
		_banner("소행성대 충돌 주의!")
	elif battle_view.hazard_kind == "sun":
		for sh in [player_ship, enemy_ship]:
			if sh != null and sh.hull > 0 and not sh.rooms.is_empty():
				var r: Dictionary = sh.rooms[randi() % sh.rooms.size()]
				if float(r.oxygen) > 10.0:
					r.fires = mini(int(r.w) * int(r.h), int(r.fires) + 1)
					r.fire_hp = 100.0
		_banner("태양 플레어 발생! 선내 화재 주의!")
	elif battle_view.hazard_kind == "pulsar":
		for sh in [player_ship, enemy_ship]:
			if sh != null and sh.hull > 0:
				sh.apply_ion_damage("shields", 2)
		_banner("펄사 전자기파! 방어막 이온화!")


func _check_combat_outcome() -> void:
	if player_ship.hull <= 0 or not player_ship.has_living_crew():
		mode = "defeat"
		in_combat = false
		audio.set_combat(false)
		_show_end_modal(false)
		return
	# Enemy FTL Escape!
	if in_combat and enemy_ship != null and enemy_ship.fleeing and enemy_ship.flee_ftl_charge >= 1.0:
		player_ship.clear_hacking(enemy_ship)
		in_combat = false
		targeting_weapon_idx = -1
		special_target_mode = ""
		selected_boarder_id = -1
		audio.set_combat(false)
		audio.play_sfx("jump")
		enemy_ship = null
		battle_view.set_ships(player_ship, null)
		_rebuild_crew_list()
		_save_run()
		_show_event_modal({
			"text": "The enemy ship's FTL drive finishes charging and they jump away into hyperspace!\nYou were unable to stop their escape.",
			"choices": [{"text": "Continue", "event": {}}],
		})
		return
	# Enemy Surrender Offer!
	if in_combat and enemy_ship != null and not enemy_ship.pending_surrender_offer.is_empty() and modal_kind.is_empty():
		var offer: Dictionary = enemy_ship.pending_surrender_offer.duplicate()
		enemy_ship.pending_surrender_offer.clear()
		_show_surrender_modal(offer)
		return
	if in_combat and enemy_ship != null and (enemy_ship.hull <= 0 or not enemy_ship.has_living_crew()):
		var dead_crew := not enemy_ship.has_living_crew() and enemy_ship.hull > 0
		var was_boss := enemy_ship.is_boss
		var prev_phase := enemy_ship.boss_phase
		# Auto-recall surviving friendly boarders & detach hacking pod before clearing enemy_ship
		var recalled := player_ship.retrieve_all_boarders(enemy_ship)
		player_ship.clear_hacking(enemy_ship)
		if recalled > 0:
			_rebuild_crew_list()
		in_combat = false
		targeting_weapon_idx = -1
		special_target_mode = ""
		selected_boarder_id = -1
		ships_defeated += 1
		audio.set_combat(false)
		audio.play_sfx("explosion")

		if was_boss and prev_phase < 3:
			sector_map.flagship_phase = prev_phase + 1
			var reward := 45 + prev_phase * 20
			player_ship.scrap += reward
			scrap_collected += reward
			player_ship.hull = mini(player_ship.max_hull, player_ship.hull + 8)
			enemy_ship = null
			battle_view.set_ships(player_ship, null)
			_show_event_modal({
				"text": "Rebel Flagship Phase %d defeated! The Flagship jumps away to regroup.\nYou recover +%d Scrap and +8 Hull repairs before pursuing Phase %d!" % [prev_phase, reward, prev_phase + 1],
				"choices": [
					{"text": "Engage Rebel Flagship Phase %d!" % (prev_phase + 1), "action": "next_boss_phase"},
					{"text": "Catch your breath (Open Upgrades / Map)", "event": {}},
				],
			})
			return
		elif was_boss and prev_phase >= 3:
			mode = "victory"
			audio.play_sfx("victory")
			_show_end_modal(true)
			return

		var scrap_gain := (18 + sector_map.current_sector_index * 9 + randi_range(0, 12)) * (1.25 if dead_crew else 1.0)
		if difficulty == 0:
			scrap_gain *= 1.15
		if player_ship.has_augment("SCRAP_COLLECTOR"):
			scrap_gain *= 1.10
		var sg := int(round(scrap_gain))
		var fuel_gain := randi_range(1, 3)
		var msl_gain := randi_range(0, 2)
		player_ship.scrap += sg
		player_ship.fuel += fuel_gain
		player_ship.missiles += msl_gain
		scrap_collected += sg
		var drop_msg := ""
		if randf() < 0.22:
			var drops := db.pick_store_weapons(1)
			if not drops.is_empty() and player_ship.add_weapon(drops[0]):
				drop_msg = "\n+ Weapon Salvaged: %s" % str(db.weapons[drops[0]].title)
				_rebuild_hud_controls()
		enemy_ship = null
		battle_view.set_ships(player_ship, null)
		_save_run()
		_show_event_modal({
			"text": "%s\n\nSalvage Recovered: +%d Scrap, +%d Fuel, +%d Missiles%s" % [
				"Enemy crew neutralized — intact salvage bonus!" if dead_crew else "The enemy ship breaks apart in a fiery explosion!",
				sg, fuel_gain, msl_gain, drop_msg
			],
			"choices": [{"text": "Continue", "event": {}}],
		})


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
		if not modal_kind.is_empty() and modal_kind != "event":
			_close_modal()
			return
	if mode != "play" or player_ship == null:
		return
	if event is InputEventKey and event.pressed and not event.echo:
		var kc: Key = event.keycode
		if kc == KEY_SPACE:
			if modal_kind.is_empty():
				_toggle_pause()
			return
		if kc == KEY_ESCAPE:
			if not modal_kind.is_empty() and modal_kind != "event":
				_close_modal()
			elif targeting_weapon_idx >= 0 or not special_target_mode.is_empty():
				targeting_weapon_idx = -1
				special_target_mode = ""
				battle_view.beam_drag_active = false
				battle_view.beam_drag_rooms.clear()
			return
		if not modal_kind.is_empty():
			if modal_kind == "event" and kc >= KEY_1 and kc <= KEY_9:
				var idx := int(kc - KEY_1)
				var choices: Array = active_event.get("choices", [])
				if idx < choices.size():
					_choose_event_option(choices[idx])
			return
		if kc == KEY_J or kc == KEY_M:
			_open_star_map()
		elif kc == KEY_U:
			_open_upgrades()
		elif kc == KEY_Z:
			player_ship.open_all_doors_smart()
		elif kc == KEY_X:
			player_ship.set_all_doors_open(false, true)
		elif kc == KEY_C:
			_on_cloak_pressed()
		elif kc == KEY_B:
			_on_battery_pressed()
		elif kc == KEY_K:
			_on_crystal_lockdown_pressed()
		elif kc == KEY_T:
			_on_tp_send_pressed()
		elif kc == KEY_Y:
			_on_tp_back_pressed()
		elif kc == KEY_H:
			_on_hack_pressed()
		elif kc == KEY_N:
			_on_mind_pressed()
		elif kc == KEY_V:
			_toggle_autofire_all()
		elif kc >= KEY_1 and kc <= KEY_4:
			_on_weapon_slot_clicked(int(kc - KEY_1), MOUSE_BUTTON_LEFT)
		elif kc >= KEY_F1 and kc <= KEY_F8:
			var ci := int(kc - KEY_F1)
			var friendly := _get_friendly_crew()
			if ci < friendly.size():
				_on_crew_clicked(int(friendly[ci].id))

	elif event is InputEventMouseMotion and modal_kind.is_empty():
		battle_view.handle_mouse_motion(event.position)
	elif event is InputEventMouseButton and modal_kind.is_empty():
		if event.pressed:
			if battle_view.handle_mouse_click(event.position, event.button_index):
				get_viewport().set_input_as_handled()
		else:
			if battle_view.handle_mouse_release(event.position, event.button_index):
				get_viewport().set_input_as_handled()


func _on_enemy_room_clicked(room_id: int) -> void:
	if enemy_ship == null or not in_combat:
		return
	if not special_target_mode.is_empty():
		var m := special_target_mode
		special_target_mode = ""
		if m == "tp_send":
			var moved := player_ship.teleport_send(enemy_ship, room_id)
			if moved > 0:
				_banner("보딩 팀 %d명 적 선실로 전송 완료! (적 선실 우클릭으로 이동)" % moved)
				_rebuild_crew_list()
			else:
				_banner("텔레포터실에 아군 승무원이 없거나 졸탄 쉴드에 막혔습니다.")
		elif m == "tp_back":
			var ret := player_ship.teleport_retrieve(enemy_ship, room_id)
			if ret > 0:
				_banner("보딩 팀 %d명 아군 함선으로 귀환 완료!" % ret)
				selected_boarder_id = -1
				_rebuild_crew_list()
			else:
				_banner("해당 적 선실에 귀환할 아군 보더가 없습니다.")
		elif m == "hack":
			if player_ship.launch_hacking(enemy_ship, room_id):
				_banner("해킹 드론 포드 부착! H 키로 해킹 펄스를 발동하세요.")
			else:
				_banner("해킹 발사 실패 (드론 부품·전력·졸탄 쉴드 확인)")
		elif m == "mind":
			if player_ship.activate_mind_control(enemy_ship, room_id):
				_banner("마인드 컨트롤 발동! 적 승무원이 아군으로 전향했습니다!")
			else:
				_banner("해당 선실에 마인드 컨트롤 가능한 적 승무원이 없습니다.")
		_update_hud_labels()
		return

	if targeting_weapon_idx >= 0 and targeting_weapon_idx < player_ship.weapons.size():
		var w: Dictionary = player_ship.weapons[targeting_weapon_idx]
		if not bool(w.powered):
			player_ship.toggle_weapon_power(targeting_weapon_idx)
		if bool(w.powered):
			w.target_room = room_id
			w.beam_rooms = []
			audio.play_sfx("select_up1")
		targeting_weapon_idx = -1
	else:
		# Convenience: clicking an enemy room directly targets all powered untargeted non-beam weapons
		var targeted := false
		for w in player_ship.weapons:
			if bool(w.powered) and int(w.target_room) < 0:
				w.target_room = room_id
				targeted = true
		if not targeted:
			for w in player_ship.weapons:
				if bool(w.powered):
					w.target_room = room_id


func _on_enemy_room_right_clicked(room_id: int) -> void:
	if enemy_ship == null or not in_combat:
		return
	if selected_boarder_id < 0:
		# Auto-pick first friendly boarder aboard enemy ship
		for c in enemy_ship.crew:
			if bool(c.is_player) and c.hp > 0.0:
				selected_boarder_id = int(c.id)
				c.selected = true
				break
	if selected_boarder_id >= 0:
		for c in enemy_ship.crew:
			if int(c.id) == selected_boarder_id and bool(c.is_player) and c.hp > 0.0:
				enemy_ship.command_crew_to_room(c, room_id)
				audio.play_sfx("powerUpSystem")
				break


func _on_enemy_beam_aimed(b_start: Vector2, b_end: Vector2, b_rooms: Array) -> void:
	if enemy_ship == null or not in_combat:
		return
	if targeting_weapon_idx < 0 or targeting_weapon_idx >= player_ship.weapons.size():
		return
	var w: Dictionary = player_ship.weapons[targeting_weapon_idx]
	if not bool(w.powered):
		player_ship.toggle_weapon_power(targeting_weapon_idx)
	if bool(w.powered) and not b_rooms.is_empty():
		var rooms_typed: Array[int] = []
		for rid in b_rooms:
			rooms_typed.append(int(rid))
		w.beam_start = b_start
		w.beam_end = b_end
		w.beam_rooms = rooms_typed
		w.target_room = rooms_typed[0]
		audio.play_sfx("select_up1")
		_banner("빔 경로 지정 완료 (%d개 선실 관통)" % rooms_typed.size())
	targeting_weapon_idx = -1
	_update_hud_labels()


func _on_boarder_clicked(crew_id: int) -> void:
	selected_boarder_id = crew_id
	selected_crew_id = -1
	if player_ship != null:
		for c in player_ship.crew:
			c.selected = false
	if enemy_ship != null:
		for c in enemy_ship.crew:
			c.selected = (int(c.id) == crew_id and bool(c.is_player))
	_rebuild_crew_list()


func _on_player_room_clicked(room_id: int, button_index: int) -> void:
	if special_target_mode == "mind" and button_index == MOUSE_BUTTON_LEFT:
		special_target_mode = ""
		if player_ship.activate_mind_control(player_ship, room_id):
			_banner("아군 승무원의 마인드 컨트롤을 해제했습니다!")
		else:
			_banner("해당 선실에 세뇌된 아군 승무원이 없습니다.")
		_update_hud_labels()
		return
	if button_index == MOUSE_BUTTON_RIGHT and selected_crew_id >= 0:
		for c in player_ship.crew:
			if int(c.id) == selected_crew_id and bool(c.is_player):
				player_ship.command_crew_to_room(c, room_id)
				audio.play_sfx("powerUpSystem")
				break
	elif button_index == MOUSE_BUTTON_LEFT:
		# Select first friendly crew inside clicked room
		for c in player_ship.crew:
			if int(c.room_id) == room_id and bool(c.is_player) and c.hp > 0.0:
				_on_crew_clicked(int(c.id))
				break


func _on_player_door_clicked(door_idx: int) -> void:
	player_ship.toggle_door(door_idx)


func _on_crew_clicked(crew_id: int) -> void:
	selected_crew_id = crew_id
	selected_boarder_id = -1
	for c in player_ship.crew:
		c.selected = (int(c.id) == crew_id)
	if enemy_ship != null:
		for c in enemy_ship.crew:
			c.selected = false
	_rebuild_crew_list()


func _on_weapon_slot_clicked(idx: int, button_index: int) -> void:
	if player_ship == null or idx < 0 or idx >= player_ship.weapons.size():
		return
	if button_index == MOUSE_BUTTON_RIGHT:
		if bool(player_ship.weapons[idx].powered):
			player_ship.toggle_weapon_power(idx)
		if targeting_weapon_idx == idx:
			targeting_weapon_idx = -1
		return
	if not bool(player_ship.weapons[idx].powered):
		player_ship.toggle_weapon_power(idx)
	if bool(player_ship.weapons[idx].powered) and in_combat:
		special_target_mode = ""
		targeting_weapon_idx = idx
		if str(player_ship.weapons[idx].bp.get("type", "")) == "BEAM":
			_banner("빔 무기 조준: 적 함선 위를 좌클릭 드래그해 관통 직선을 지정하세요!")


func _on_cloak_pressed() -> void:
	if player_ship != null and in_combat:
		if player_ship.activate_cloaking():
			_banner("은폐 장치 가동! (회피 +60%)")


func _on_battery_pressed() -> void:
	if player_ship == null or not player_ship.systems.has("battery"):
		return
	if player_ship.activate_battery():
		_banner("예비 배터리 가동! (30초간 원자로 전력 +%d)" % player_ship.battery_bonus)
		_update_hud_labels()
	else:
		_banner("예비 배터리를 가동할 수 없습니다 (재충전 중 또는 손상).")


func _on_crystal_lockdown_pressed() -> void:
	if player_ship == null:
		return
	# Try selected boarder on enemy ship first, then selected player crew
	if enemy_ship != null and in_combat and selected_boarder_id >= 0:
		if enemy_ship.activate_crystal_lockdown(selected_boarder_id):
			_banner("크리스탈 봉쇄 발동! (적 선실 12초간 출입 차단)")
			return
	for c in player_ship.crew:
		if bool(c.is_player) and bool(c.selected) and str(c.species) == "crystal":
			if player_ship.activate_crystal_lockdown(int(c.id)):
				_banner("크리스탈 봉쇄 발동! (아군 선실 12초간 출입 차단)")
				return
			_banner("크리스탈 봉쇄 재충전 중 (%.0fs)" % float(c.get("lockdown_cooldown", 0.0)))
			return
	_banner("크리스탈 종족 승무원을 선택한 뒤 K 키를 누르세요.")


func _show_out_of_fuel_modal() -> void:
	_open_modal("out_of_fuel", 620, 320)
	modal_box.add_child(_mk_label("OUT OF FUEL — EMERGENCY DISTRESS BEACON", 17, Color("ff8066")))
	var body := _mk_label(
		"FTL 연료가 모두 소진되어 점프할 수 없습니다!\n비상 구조 신호를 발신해 지나가는 함선에 도움을 요청하거나 조용히 대기할 수 있습니다.\n(대기 1턴마다 반란군 함대가 1회 전진합니다.)",
		14, Color("e6eef5")
	)
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	modal_box.add_child(body)
	modal_box.add_child(_mk_btn("1. 비상 구조 신호 발신 (Distress Beacon ON — 연료 구조선/해적 조우)", func():
		sector_map.rebel_fleet_x += 58.0
		_close_modal()
		if randf() < 0.65:
			var f_gain := randi_range(3, 5)
			player_ship.fuel += f_gain
			audio.play_sfx("upgradeSystem")
			_show_event_modal({
				"text": "A friendly Federation supply tanker responds to your distress call and transfers +%d Fuel free of charge!" % f_gain,
				"choices": [{"text": "Thank them and continue", "event": {}}],
			})
		else:
			player_ship.fuel += 2
			var eid := db.pick_enemy_ship_id(sector_map.current_sector_index, sector_map.current_sector_id)
			_start_combat(eid, "A pirate ship intercepts your distress signal! You siphon +2 emergency Fuel as they open fire!")
	, true))
	modal_box.add_child(_mk_btn("2. 조용히 대기 (Wait Quietly — 표류 연료 +2 회수)", func():
		sector_map.rebel_fleet_x += 58.0
		player_ship.fuel += 2
		_close_modal()
		_banner("표류 잔해에서 비상 연료 +2를 회수했습니다. (반란군 함대 접근!)")
	))


func _show_surrender_modal(offer: Dictionary) -> void:
	_open_modal("surrender", 620, 320)
	modal_box.add_child(_mk_label("INCOMING TRANSMISSION — ENEMY SURRENDER", 17, Color("ffd54f")))
	var w_id := str(offer.get("weapon", ""))
	var w_line := ("\n  + Weapon: %s" % str(db.weapons.get(w_id, {}).get("title", w_id))) if not w_id.is_empty() else ""
	var body := _mk_label(
		"\"Please, hold your fire! Our hull is failing — take our cargo and spare our lives!\"\n\n" +
		"Surrender Offer:\n  +%d Scrap, +%d Fuel, +%d Missiles, +%d Drone Parts%s" % [
			int(offer.get("scrap", 15)), int(offer.get("fuel", 2)),
			int(offer.get("missiles", 1)), int(offer.get("drone_parts", 0)), w_line
		],
		14, Color("e6eef5")
	)
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	modal_box.add_child(body)
	var btn_accept := _mk_btn("1. 항복 수락 (Accept Surrender & Take Tribute)", func():
		var sg := int(offer.get("scrap", 15))
		player_ship.scrap += sg
		scrap_collected += sg
		player_ship.fuel += int(offer.get("fuel", 2))
		player_ship.missiles += int(offer.get("missiles", 1))
		player_ship.drone_parts += int(offer.get("drone_parts", 0))
		if not w_id.is_empty():
			player_ship.add_weapon(w_id)
		if enemy_ship != null:
			player_ship.retrieve_all_boarders(enemy_ship)
			player_ship.clear_hacking(enemy_ship)
		in_combat = false
		targeting_weapon_idx = -1
		special_target_mode = ""
		selected_boarder_id = -1
		enemy_ship = null
		battle_view.set_ships(player_ship, null)
		audio.set_combat(false)
		audio.play_sfx("upgradeSystem")
		_close_modal()
		_rebuild_hud_controls()
		_save_run()
		_banner("적의 항복을 수락했습니다! (+%d Scrap)" % sg)
	, true)
	modal_box.add_child(btn_accept)
	var btn_refuse := _mk_btn("2. 거절하고 계속 공격 (We will not accept surrender!)", func():
		if enemy_ship != null:
			enemy_ship.surrender_declined = true
		_close_modal()
		_banner("항복 제안을 거절했습니다 — 전투 계속!")
	)
	modal_box.add_child(btn_refuse)


func _on_tp_send_pressed() -> void:
	if player_ship == null or not in_combat or not player_ship.systems.has("teleporter"):
		return
	if not player_ship.can_teleport_send():
		if player_ship.teleporter_cooldown > 0.0:
			_banner("텔레포터 재충전 중 (%.0fs)" % player_ship.teleporter_cooldown)
		elif player_ship.get_effective_system_power("teleporter") <= 0:
			_banner("텔레포터에 전력을 배분하세요.")
		else:
			_banner("먼저 아군 승무원을 텔레포터실로 이동시키세요!")
		return
	targeting_weapon_idx = -1
	special_target_mode = "" if special_target_mode == "tp_send" else "tp_send"
	if special_target_mode == "tp_send":
		_banner("보딩 전송 대상 적 선실을 클릭하세요! (ESC 취소)")


func _on_tp_back_pressed() -> void:
	if player_ship == null or not in_combat or enemy_ship == null or not player_ship.systems.has("teleporter"):
		return
	if player_ship.get_effective_system_power("teleporter") <= 0 or player_ship.teleporter_cooldown > 0.0:
		_banner("텔레포터가 준비되지 않았습니다.")
		return
	# Collect distinct rooms containing friendly boarders on enemy ship
	var boarder_rooms: Array[int] = []
	for c in enemy_ship.crew:
		if bool(c.is_player) and c.hp > 0.0:
			var rid := int(c.room_id)
			if not boarder_rooms.has(rid):
				boarder_rooms.append(rid)
	if boarder_rooms.is_empty():
		_banner("적 함선에 파견된 아군 보딩 팀이 없습니다.")
		return
	if boarder_rooms.size() == 1:
		var ret := player_ship.teleport_retrieve(enemy_ship, boarder_rooms[0])
		if ret > 0:
			_banner("보딩 팀 %d명 귀환 완료!" % ret)
			selected_boarder_id = -1
			_rebuild_crew_list()
			_update_hud_labels()
		return
	targeting_weapon_idx = -1
	special_target_mode = "" if special_target_mode == "tp_back" else "tp_back"
	if special_target_mode == "tp_back":
		_banner("귀환시킬 아군 보더가 있는 적 선실을 클릭하세요!")


func _on_hack_pressed() -> void:
	if player_ship == null or not in_combat or enemy_ship == null or not player_ship.systems.has("hacking"):
		return
	if player_ship.get_effective_system_power("hacking") <= 0:
		_banner("해킹 시스템에 전력을 배분하세요.")
		return
	if player_ship.hacking_target_room >= 0:
		if player_ship.activate_hacking(enemy_ship):
			var r: Dictionary = enemy_ship.room_by_id.get(player_ship.hacking_target_room, {})
			var sname := str(r.get("system", "room")).to_upper()
			_banner("해킹 펄스 발동! 적 %s 무력화 (%.0fs)" % [sname, player_ship.hacking_active_timer])
		elif player_ship.hacking_cooldown > 0.0:
			_banner("해킹 펄스 재충전 중 (%.0fs)" % player_ship.hacking_cooldown)
		_update_hud_labels()
		return
	if player_ship.drone_parts <= 0:
		_banner("해킹 포드 발사에 드론 부품 1개가 필요합니다.")
		return
	targeting_weapon_idx = -1
	special_target_mode = "" if special_target_mode == "hack" else "hack"
	if special_target_mode == "hack":
		_banner("해킹 드론 포드를 부착할 적 선실을 클릭하세요! (드론 부품 1 소모)")


func _on_mind_pressed() -> void:
	if player_ship == null or not in_combat or enemy_ship == null or not player_ship.systems.has("mind"):
		return
	if player_ship.get_effective_system_power("mind") <= 0:
		_banner("마인드 컨트롤에 전력을 배분하세요.")
		return
	if player_ship.mind_cooldown > 0.0:
		_banner("마인드 컨트롤 재충전 중 (%.0fs)" % player_ship.mind_cooldown)
		return
	targeting_weapon_idx = -1
	special_target_mode = "" if special_target_mode == "mind" else "mind"
	if special_target_mode == "mind":
		_banner("마인드 컨트롤 대상 선실을 클릭하세요! (적 승무원 세뇌 / 아군 세뇌 해제)")


func _toggle_autofire_all() -> void:
	if player_ship == null:
		return
	var any_off := false
	for w in player_ship.weapons:
		if not bool(w.autofire):
			any_off = true
			break
	for w in player_ship.weapons:
		w.autofire = any_off
	hud_refs["auto_btn"].text = "AUTOFIRE: %s (V)" % ("ON" if any_off else "OFF")
	audio.play_sfx("autofireOn" if any_off else "autofireOff")


func _toggle_pause() -> void:
	paused = not paused
	hud_refs["btn_pause"].text = "RESUME" if paused else "PAUSE"
	_update_hud_labels()


func _banner(txt: String) -> void:
	status_banner_text = txt
	status_banner_time = 2.8


func _get_friendly_crew() -> Array:
	var out: Array = []
	if player_ship == null:
		return out
	for c in player_ship.crew:
		if bool(c.is_player) and c.hp > 0.0:
			out.append(c)
	return out


# ==================== HUD REFRESH ====================
func _rebuild_hud_controls() -> void:
	if player_ship == null:
		return
	_rebuild_crew_list()

	var sys_h: HBoxContainer = hud_refs["sys_h"]
	for c in sys_h.get_children():
		c.queue_free()
	for sname in FTLShip.SYSTEM_ORDER:
		if not player_ship.systems.has(sname):
			continue
		var btn := Button.new()
		btn.custom_minimum_size = Vector2(56, 98)
		btn.name = "SysBtn_" + sname
		btn.gui_input.connect(func(ev):
			if ev is InputEventMouseButton and ev.pressed:
				if ev.button_index == MOUSE_BUTTON_LEFT:
					player_ship.add_system_power(sname)
				elif ev.button_index == MOUSE_BUTTON_RIGHT:
					player_ship.remove_system_power(sname)
				_update_hud_labels()
		)
		sys_h.add_child(btn)

	var wpn_h: HBoxContainer = hud_refs["wpn_h"]
	for c in wpn_h.get_children():
		c.queue_free()
	for i in range(player_ship.weapons.size()):
		var wb := Button.new()
		wb.custom_minimum_size = Vector2(118, 72)
		wb.name = "WpnBtn_%d" % i
		wb.gui_input.connect(func(ev):
			if ev is InputEventMouseButton and ev.pressed:
				_on_weapon_slot_clicked(i, ev.button_index)
				_update_hud_labels()
		)
		wpn_h.add_child(wb)

	var drone_h: HBoxContainer = hud_refs["drone_h"]
	for c in drone_h.get_children():
		c.queue_free()
	for i in range(player_ship.drones.size()):
		var db_btn := Button.new()
		db_btn.custom_minimum_size = Vector2(104, 48)
		db_btn.name = "DrnBtn_%d" % i
		db_btn.pressed.connect(func():
			player_ship.toggle_drone_power(i)
			_update_hud_labels()
		)
		drone_h.add_child(db_btn)

	hud_refs["cloak_btn"].visible = player_ship.systems.has("cloaking")
	hud_refs["battery_btn"].visible = player_ship.systems.has("battery")
	hud_refs["tp_send_btn"].visible = player_ship.systems.has("teleporter")
	hud_refs["tp_back_btn"].visible = player_ship.systems.has("teleporter")
	hud_refs["hack_btn"].visible = player_ship.systems.has("hacking")
	hud_refs["mind_btn"].visible = player_ship.systems.has("mind")
	_update_hud_labels()


func _rebuild_crew_list() -> void:
	var box: VBoxContainer = hud_refs["crew_list"]
	for c in box.get_children():
		c.queue_free()
	var friendly := _get_friendly_crew()
	for i in range(friendly.size()):
		var m: Dictionary = friendly[i]
		var stars := player_ship.get_crew_mastery_stars(m)
		var star_tag := (" ★%d" % stars) if stars > 0 else ""
		var cr_tag := " [K]" if str(m.species) == "crystal" else ""
		var btn := _mk_btn("%s (%d)%s%s" % [str(m.name), int(round(float(m.hp))), star_tag, cr_tag], func(): _on_crew_clicked(int(m.id)), bool(m.selected))
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		btn.custom_minimum_size.y = 28
		box.add_child(btn)
	# Show Clonebay queue entries if any
	for q in player_ship.clone_queue:
		var pct := int(round((1.0 - float(q.timer) / maxf(0.1, float(q.max_time))) * 100.0))
		var clbl := _mk_label("[CLONE] %s %d%%" % [str(q.crew.name), pct], 12, Color("65e8ff"))
		box.add_child(clbl)
	# Also show friendly boarders deployed on the enemy ship
	if enemy_ship != null and in_combat:
		for c in enemy_ship.crew:
			if bool(c.is_player) and c.hp > 0.0:
				var cid := int(c.id)
				var bbtn := _mk_btn("[BD] %s (%d)" % [str(c.name), int(round(float(c.hp)))], func(): _on_boarder_clicked(cid), cid == selected_boarder_id)
				bbtn.alignment = HORIZONTAL_ALIGNMENT_LEFT
				bbtn.custom_minimum_size.y = 28
				box.add_child(bbtn)


func _update_hud_labels() -> void:
	if player_ship == null:
		return
	hud_refs["hull_lbl"].text = "HULL %d/%d" % [player_ship.hull, player_ship.max_hull]
	hud_refs["hull_lbl"].add_theme_color_override("font_color", Color("7eff8b") if player_ship.hull > 15 else (Color("ffd54f") if player_ship.hull > 8 else Color("ff5252")))
	var sh_dots := ""
	for i in range(player_ship.shield_max_layers):
		sh_dots += "●" if i < player_ship.shield_layers else "○"
	if player_ship.zoltan_shield > 0:
		sh_dots += " +Z%d" % player_ship.zoltan_shield
	hud_refs["sh_lbl"].text = "SHIELD %s" % (sh_dots if not sh_dots.is_empty() else "—")
	hud_refs["res_lbl"].text = "FUEL %d  MSL %d  DRN %d  SCRAP %d" % [player_ship.fuel, player_ship.missiles, player_ship.drone_parts, player_ship.scrap]
	hud_refs["stat_lbl"].text = "EVADE %d%%  O2 %d%%" % [player_ship.get_evasion(), int(round(player_ship.get_average_oxygen()))]
	var haz_tag := ""
	match battle_view.hazard_kind:
		"ion_storm": haz_tag = " · ⚡ION STORM (50%)"
		"asteroid": haz_tag = " · ASTEROID"
		"sun": haz_tag = " · SOLAR FLARE"
		"pulsar": haz_tag = " · PULSAR"
	hud_refs["sec_lbl"].text = "SEC %d · %s%s" % [sector_map.current_sector_index + 1, sector_map.current_sector_name, haz_tag]
	var bat_tag := (" +%dB" % player_ship.battery_bonus) if player_ship.battery_bonus > 0 else ""
	hud_refs["react_lbl"].text = "%d / %d%s" % [player_ship.get_available_reactor_power(), player_ship.get_total_reactor_max(), bat_tag]
	hud_refs["btn_jump"].text = "JUMP (J)" if (not in_combat or player_ship.ftl_charge >= 1.0) else "FTL %d%%" % int(player_ship.ftl_charge * 100.0)

	var cur_b: Dictionary = sector_map.beacons[sector_map.current_beacon_id] if not sector_map.beacons.is_empty() else {}
	hud_refs["btn_store"].visible = (not in_combat and str(cur_b.get("type", "")) == "store")

	# Update system buttons
	var sys_h: HBoxContainer = hud_refs["sys_h"]
	for btn in sys_h.get_children():
		var sname := str(btn.name).replace("SysBtn_", "")
		if not player_ship.systems.has(sname):
			continue
		var s: Dictionary = player_ship.systems[sname]
		var eff := player_ship.get_effective_system_power(sname)
		var bars := ""
		for lv in range(int(s.level)):
			if lv >= int(s.level) - int(s.damage):
				bars += "X"
			elif int(s.ion_level) > 0:
				bars += "◇"
			elif lv < eff:
				bars += "■"
			else:
				bars += "□"
		if sname == "artillery" and eff > 0 and in_combat:
			var apct := int(round(clampf(player_ship.artillery_charge / maxf(1.0, player_ship.artillery_cooldown), 0.0, 1.0) * 100.0))
			btn.text = "ARTI\n%s\n%d%%" % [bars, apct]
		else:
			btn.text = "%s\n%s\n%d/%d" % [sname.left(4).to_upper(), bars, eff, int(s.level)]

	# Update weapon buttons
	var wpn_h: HBoxContainer = hud_refs["wpn_h"]
	for i in range(wpn_h.get_child_count()):
		if i >= player_ship.weapons.size():
			break
		var wb: Button = wpn_h.get_child(i)
		var w: Dictionary = player_ship.weapons[i]
		var is_beam := str(w.bp.get("type", "")) == "BEAM"
		var eff_cd := player_ship.get_weapon_effective_cooldown(w)
		var max_chg := maxi(1, int(w.bp.get("chargeLevels", 1)))
		var cur_chg := int(w.get("charge_level", 0))
		var pct := int(round(clampf(float(w.charge) / maxf(0.1, eff_cd), 0.0, 1.0) * 100.0))
		var st := ("CHG %d/%d" % [cur_chg, max_chg]) if (max_chg > 1 and cur_chg > 0) else ("READY" if pct >= 100 else ("%d%%" % pct))
		if not bool(w.powered):
			st = "OFF"
		elif targeting_weapon_idx == i:
			st = "DRAG BEAM" if is_beam else "AIMING..."
		elif is_beam and not (w.get("beam_rooms", []) as Array).is_empty():
			st += " x%d" % (w.get("beam_rooms", []) as Array).size()
		elif int(w.target_room) >= 0:
			st += " ◎"
		var chain_cnt := int(w.get("chain_count", 0))
		if chain_cnt > 0 and bool(w.powered):
			st += " C%d" % chain_cnt
		wb.text = "[%d] %s\nPWR:%d  %s" % [i + 1, str(w.bp.get("short", w.id)).left(13), int(w.bp.get("power", 1)), st]
		var border := Color("7eff8b") if targeting_weapon_idx == i else (Color("ffcf5c") if bool(w.powered) else Color("3b4c5e"))
		wb.add_theme_stylebox_override("normal", _box(Color("1c2d3d") if bool(w.powered) else Color("111820"), border, 5, 6))

	# Update drone buttons
	var drone_h: HBoxContainer = hud_refs["drone_h"]
	for i in range(drone_h.get_child_count()):
		if i >= player_ship.drones.size():
			break
		var db_btn: Button = drone_h.get_child(i)
		var d: Dictionary = player_ship.drones[i]
		db_btn.text = "%s\n%s" % [str(d.bp.get("short", d.id)).left(10), "ON" if bool(d.powered) else "OFF"]

	# Update special system buttons (Teleporter, Hacking, Mind Control, Cloaking)
	if player_ship.systems.has("teleporter"):
		var tp_cd := player_ship.teleporter_cooldown
		hud_refs["tp_send_btn"].text = "TP %.0fs" % tp_cd if tp_cd > 0.0 else ("TARGET..." if special_target_mode == "tp_send" else "TP SEND (T)")
		hud_refs["tp_back_btn"].text = "TP %.0fs" % tp_cd if tp_cd > 0.0 else ("PICK..." if special_target_mode == "tp_back" else "TP BACK (Y)")
	if player_ship.systems.has("hacking"):
		if player_ship.hacking_active_timer > 0.0:
			hud_refs["hack_btn"].text = "HACKING %.0fs" % player_ship.hacking_active_timer
		elif player_ship.hacking_cooldown > 0.0:
			hud_refs["hack_btn"].text = "HACK %.0fs" % player_ship.hacking_cooldown
		elif player_ship.hacking_target_room >= 0:
			hud_refs["hack_btn"].text = "PULSE (H)"
		else:
			hud_refs["hack_btn"].text = "TARGET..." if special_target_mode == "hack" else "HACK (H)"
	if player_ship.systems.has("mind"):
		if player_ship.mind_cooldown > 0.0:
			hud_refs["mind_btn"].text = "MC %.0fs" % player_ship.mind_cooldown
		else:
			hud_refs["mind_btn"].text = "TARGET..." if special_target_mode == "mind" else "MIND (N)"
	if player_ship.systems.has("cloaking"):
		if player_ship.cloak_timer > 0.0:
			hud_refs["cloak_btn"].text = "CLOAK %.0fs" % player_ship.cloak_timer
		elif player_ship.cloak_cooldown > 0.0:
			hud_refs["cloak_btn"].text = "CD %.0fs" % player_ship.cloak_cooldown
		else:
			hud_refs["cloak_btn"].text = "CLOAK (C)"
	if player_ship.systems.has("battery"):
		if player_ship.battery_timer > 0.0:
			hud_refs["battery_btn"].text = "BAT %.0fs" % player_ship.battery_timer
		elif player_ship.battery_cooldown > 0.0:
			hud_refs["battery_btn"].text = "BAT CD %.0fs" % player_ship.battery_cooldown
		else:
			hud_refs["battery_btn"].text = "BAT (B)"

	# Banner
	var b_lbl: Label = hud_refs["banner"]
	if paused:
		b_lbl.text = "— PAUSED (Space 재개 · 전력/무기/승무원 명령 가능) —"
	elif in_combat and enemy_ship != null and enemy_ship.fleeing:
		b_lbl.text = "⚠ 적 함선 FTL 도주 충전 중 (%d%%) — 조종실/엔진을 파괴하세요!" % int(enemy_ship.flee_ftl_charge * 100.0)
	elif status_banner_time > 0.0:
		b_lbl.text = status_banner_text
	else:
		b_lbl.text = ""


# ==================== STAR MAP & BEACON JUMPS ====================
func _open_star_map() -> void:
	if in_combat and player_ship.ftl_charge < 1.0:
		_banner("FTL 드라이브 충전 중입니다 (%d%%)" % int(player_ship.ftl_charge * 100.0))
		return
	_open_modal("map", 740, 520)
	var head := HBoxContainer.new()
	modal_box.add_child(head)
	var tl := _mk_label("STAR MAP — Sector %d: %s (Fuel: %d)" % [sector_map.current_sector_index + 1, sector_map.current_sector_name, player_ship.fuel], 17, Color("7eff8b"))
	tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(tl)
	head.add_child(_mk_btn("닫기 (ESC)", _close_modal))

	var mc := FTLMapCanvas.new()
	mc.sector_map = sector_map
	mc.beacon_clicked.connect(_on_beacon_jump_requested)
	modal_box.add_child(mc)

	var cur_b: Dictionary = sector_map.beacons[sector_map.current_beacon_id]
	if str(cur_b.type) == "exit" and sector_map.current_sector_index < 7:
		var next_row := HBoxContainer.new()
		next_row.add_theme_constant_override("separation", 10)
		modal_box.add_child(next_row)
		next_row.add_child(_mk_label("다음 섹터로 이동:", 14, Color("ffd54f")))
		for opt in sector_map.get_next_sector_options():
			var ob := _mk_btn("Sector %d: %s (%s)" % [int(opt.sector_index) + 1, str(opt.name), str(opt.kind)], func(): _jump_next_sector(int(opt.sector_index), int(opt.node_index)), true)
			next_row.add_child(ob)


func _on_beacon_jump_requested(bid: int) -> void:
	if not sector_map.can_jump_to(bid):
		return
	if player_ship.fuel <= 0:
		_close_modal()
		_show_out_of_fuel_modal()
		return
	player_ship.fuel = maxi(0, player_ship.fuel - 1)
	if in_combat:
		player_ship.clear_hacking(enemy_ship)
		selected_boarder_id = -1
		special_target_mode = ""
		in_combat = false
		enemy_ship = null
		battle_view.set_ships(player_ship, null)
		audio.set_combat(false)

	var b := sector_map.jump_to(bid)
	if b.is_empty():
		return
	player_ship.on_ftl_jump()
	player_ship.ion_storm_active = (str(b.hazard) == "ion_storm")
	player_ship._clamp_reactor_power()
	audio.play_sfx("jump")
	battle_view.clear_combat_fx()
	battle_view.set_backdrop(bid + sector_map.current_sector_index * 31, bool(b.nebula), str(b.hazard))
	_close_modal()
	_save_run()
	_trigger_beacon_encounter(b)


func _jump_next_sector(sector_idx: int, node_idx: int) -> void:
	sector_map.enter_sector(sector_idx, node_idx)
	audio.play_sfx("jump")
	audio.play_track(sector_map.current_sector_track, false)
	battle_view.clear_combat_fx()
	battle_view.set_backdrop(sector_idx * 17, sector_map.current_sector_kind == "NEBULA", "")
	_close_modal()
	_save_run()
	_show_event_modal({
		"text": "You arrive in Sector %d: %s.\n%s" % [
			sector_idx + 1,
			sector_map.current_sector_name,
			"The Rebel Flagship has been spotted near the Federation Base! Intercept and destroy it!" if sector_idx == 7 else "Navigate to the EXIT beacon ahead of the advancing Rebel Fleet."
		],
		"choices": [{"text": "Proceed", "event": {}}],
	})


func _trigger_beacon_encounter(b: Dictionary) -> void:
	var btype := str(b.type)
	if btype == "boss_base":
		_start_boss_fight(sector_map.flagship_phase)
		return
	if btype == "store":
		current_store_inventory = _generate_store_inventory()
		_show_event_modal({
			"text": "You arrive at a friendly Federation trading post. Merchants hail your ship and offer supplies, weapons, and repairs.",
			"choices": [
				{"text": "Open Store (상점 열기)", "action": "open_store"},
				{"text": "Continue on your way", "event": {}},
			],
		})
		return
	if bool(b.rebel):
		_start_combat("REBEL_SKINNY_ELITE" if db.ships.has("REBEL_SKINNY_ELITE") else "REBEL_SKINNY", "Warning! The Rebel Fleet has overtaken this beacon! An elite cruiser intercepts you!")
		return
	if btype == "exit":
		_show_event_modal({
			"text": "You have reached the long-range Sector Exit Beacon. Open the Star Map (J) to choose your next sector.",
			"choices": [
				{"text": "Choose Next Sector (다음 섹터 선택)", "action": "open_map"},
				{"text": "Stay and prepare", "event": {}},
			],
		})
		return
	if btype == "hostile":
		var eid := db.pick_enemy_ship_id(sector_map.current_sector_index, sector_map.current_sector_id)
		_start_combat(eid, "Hostile vessel detected on approach vectors! Weapons hot — battle stations!")
		return

	# Resolve real FTL XML event from ftl.dat.vanilla!
	var ev := db.resolve_event(str(b.get("event_id", "")))
	if not ev.is_empty() and not str(ev.get("text", "")).is_empty():
		if bool(ev.get("hostile", false)) or not str(ev.get("ship", "")).is_empty():
			var se: Dictionary = db.ship_events.get(str(ev.get("ship", "")), {})
			var bp_id := str(se.get("auto_blueprint", db.pick_enemy_ship_id(sector_map.current_sector_index, sector_map.current_sector_id)))
			if not db.ships.has(bp_id):
				bp_id = db.pick_enemy_ship_id(sector_map.current_sector_index, sector_map.current_sector_id)
			_start_combat(bp_id, str(ev.text))
			return
		_show_event_modal(ev)
		return

	# Clean fallback encounter
	if randf() < 0.55:
		var eid := db.pick_enemy_ship_id(sector_map.current_sector_index, sector_map.current_sector_id)
		_start_combat(eid, "A pirate raider drops out of cloak and locks weapons onto your hull!")
	else:
		var bonus := 14 + sector_map.current_sector_index * 7
		player_ship.scrap += bonus
		scrap_collected += bonus
		_show_event_modal({
			"text": "You discover an abandoned derelict drifting near the beacon. Your crew salvages +%d Scrap from the hull." % bonus,
			"choices": [{"text": "Continue", "event": {}}],
		})


func _start_combat(enemy_bp_id: String, intro_text: String) -> void:
	enemy_ship = FTLShip.new()
	enemy_ship.init_from_blueprint(db, enemy_bp_id, false, sector_map.current_sector_index)
	enemy_ship.ion_storm_active = (battle_view.hazard_kind == "ion_storm")
	enemy_ship._clamp_reactor_power()
	in_combat = true
	player_ship.ftl_charge = 0.0
	hazard_timer = 11.0
	battle_view.set_ships(player_ship, enemy_ship)
	audio.set_combat(true)
	_show_event_modal({
		"text": intro_text + "\n\nEnemy Vessel: %s (Hull %d, Shields %d)" % [enemy_ship.ship_name, enemy_ship.hull, enemy_ship.shield_max_layers],
		"choices": [{"text": "Battle Stations! (전투 개시)", "event": {}}],
	})


func _start_boss_fight(phase: int) -> void:
	var bp_id := "BOSS_%d" % clampi(phase, 1, 3)
	if not db.ships.has(bp_id):
		bp_id = "BOSS_1"
	enemy_ship = FTLShip.new()
	enemy_ship.init_from_blueprint(db, bp_id, false, 7)
	enemy_ship.is_boss = true
	enemy_ship.boss_phase = phase
	in_combat = true
	player_ship.ftl_charge = 0.0
	battle_view.set_ships(player_ship, enemy_ship)
	audio.play_track("laststand", true)
	_show_event_modal({
		"text": "THE REBEL FLAGSHIP (PHASE %d / 3)\nThe massive Rebel flagship looms ahead of the Federation Base. Destroy it to save the Federation!" % phase,
		"choices": [{"text": "Engage Flagship! (기함 교전 개시)", "event": {}}],
	})


# ==================== EVENT MODAL ====================
func _show_event_modal(ev: Dictionary) -> void:
	active_event = ev
	_open_modal("event", 640, 380)
	modal_box.add_child(_mk_label("BEACON TRANSMISSION", 15, Color("ffd54f")))
	modal_box.add_child(_mk_label(str(ev.get("text", "Nothing unusual at this beacon.")), 15, Color("e8f2fa"), true))

	var choices: Array = ev.get("choices", [])
	if choices.is_empty():
		choices = [{"text": "Continue", "event": {}}]
		active_event["choices"] = choices

	for i in range(choices.size()):
		var ch: Dictionary = choices[i]
		var req := str(ch.get("req", ""))
		var req_lvl := int(ch.get("lvl", 1))
		var blue := false
		if not req.is_empty():
			blue = _check_blue_requirement(req, req_lvl)
			if not blue:
				continue
		var prefix := "[BLUE %s] " % req.to_upper() if blue else ""
		var btn := _mk_btn("%d. %s%s" % [i + 1, prefix, str(ch.get("text", "Continue"))], func(): _choose_event_option(ch), blue)
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		modal_box.add_child(btn)


func _check_blue_requirement(req: String, lvl: int) -> bool:
	if player_ship == null:
		return false
	if player_ship.systems.has(req) and int(player_ship.systems[req].level) >= lvl:
		return true
	if player_ship.has_augment(req):
		return true
	for c in player_ship.crew:
		if bool(c.is_player) and str(c.species) == req:
			return true
	return false


func _choose_event_option(ch: Dictionary) -> void:
	var action := str(ch.get("action", ""))
	if action == "open_store":
		_open_store()
		return
	elif action == "open_map":
		_open_star_map()
		return
	elif action == "next_boss_phase":
		_start_boss_fight(sector_map.flagship_phase)
		return

	var nxt := db.resolve_event(ch.get("event", {}))
	if nxt.is_empty():
		_close_modal()
		return

	# Apply immediate rewards/effects
	var summary_lines: Array[String] = []
	var ar := str(nxt.get("autoReward", ""))
	if not ar.is_empty():
		var mult := 0.7 if str(nxt.get("autoRewardLevel", "MED")) == "LOW" else (1.35 if str(nxt.get("autoRewardLevel", "MED")) == "HIGH" else 1.0)
		var sc := int(round((15 + sector_map.current_sector_index * 8) * mult))
		player_ship.scrap += sc
		scrap_collected += sc
		summary_lines.append("+%d Scrap" % sc)
		if ar in ["standard", "stuff", "fuel", "fuel_only"]:
			player_ship.fuel += 2
			summary_lines.append("+2 Fuel")
		if ar in ["standard", "missiles", "missiles_only"]:
			player_ship.missiles += 2
			summary_lines.append("+2 Missiles")
	var dmg := int(nxt.get("damage", 0))
	if dmg != 0:
		player_ship.hull = clampi(player_ship.hull - dmg, 1, player_ship.max_hull)
		summary_lines.append("%+d Hull" % (-dmg))
	var wpn := str(nxt.get("weapon", ""))
	if not wpn.is_empty():
		var wid := wpn if db.weapons.has(wpn) else (db.pick_store_weapons(1)[0] if not db.pick_store_weapons(1).is_empty() else "")
		if not wid.is_empty() and player_ship.add_weapon(wid):
			summary_lines.append("+Weapon: %s" % str(db.weapons[wid].title))
			_rebuild_hud_controls()
	var cm := str(nxt.get("crew", ""))
	if not cm.is_empty() and _get_friendly_crew().size() < 8:
		var sp := cm if db.crew_species.has(cm) else "human"
		player_ship.add_crew(sp, player_ship.rooms[0].id, true)
		summary_lines.append("+Crew: %s" % sp.capitalize())
		_rebuild_hud_controls()

	if bool(nxt.get("store", false)):
		current_store_inventory = _generate_store_inventory()
		_open_store()
		return
	if bool(nxt.get("hostile", false)) or not str(nxt.get("ship", "")).is_empty():
		var se: Dictionary = db.ship_events.get(str(nxt.get("ship", "")), {})
		var bp_id := str(se.get("auto_blueprint", db.pick_enemy_ship_id(sector_map.current_sector_index, sector_map.current_sector_id)))
		if not db.ships.has(bp_id):
			bp_id = db.pick_enemy_ship_id(sector_map.current_sector_index, sector_map.current_sector_id)
		_start_combat(bp_id, str(nxt.get("text", "Enemy engages!")))
		return

	var txt := str(nxt.get("text", ""))
	if not summary_lines.is_empty():
		txt += "\n\n[" + ", ".join(PackedStringArray(summary_lines)) + "]"
	if not txt.is_empty():
		nxt["text"] = txt
		_show_event_modal(nxt)
	else:
		_close_modal()


# ==================== UPGRADES & STORE MODALS ====================
func _open_upgrades() -> void:
	if in_combat:
		_banner("전투 중에는 함선 업그레이드를 할 수 없습니다.")
		return
	_open_modal("upgrades", 760, 500)
	var head := HBoxContainer.new()
	modal_box.add_child(head)
	var tl := _mk_label("SHIP UPGRADES & EQUIPMENT  (Scrap: %d)" % player_ship.scrap, 18, Color("ffd54f"))
	tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(tl)
	head.add_child(_mk_btn("닫기 (ESC)", _close_modal))

	var r_cost := player_ship.get_reactor_upgrade_cost()
	var r_btn := _mk_btn(
		"REACTOR (%d / 25) — Upgrade (%d Scrap)" % [player_ship.reactor_max, r_cost] if r_cost >= 0 else "REACTOR MAXED (25/25)",
		func():
			if player_ship.upgrade_reactor():
				_rebuild_hud_controls()
				_open_upgrades()
	, r_cost >= 0 and player_ship.scrap >= r_cost)
	modal_box.add_child(r_btn)

	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 10)
	grid.add_theme_constant_override("v_separation", 8)
	modal_box.add_child(grid)
	for sname in FTLShip.SYSTEM_ORDER:
		if not player_ship.systems.has(sname):
			continue
		var s: Dictionary = player_ship.systems[sname]
		var cost := player_ship.get_system_upgrade_cost(sname)
		var label := "%s  Lv.%d/%d  —  %s" % [sname.to_upper(), int(s.level), int(s.max_level), ("%d Scrap" % cost) if cost >= 0 else "MAX"]
		var sb := _mk_btn(label, func():
			if player_ship.upgrade_system(sname):
				_rebuild_hud_controls()
				_open_upgrades()
		, cost >= 0 and player_ship.scrap >= cost)
		sb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(sb)

	if not player_ship.cargo_weapons.is_empty():
		modal_box.add_child(_mk_label("CARGO WEAPONS (클릭해 마지막 슬롯과 교체)", 14, Color("93b9d8")))
		for i in range(player_ship.cargo_weapons.size()):
			var wid := player_ship.cargo_weapons[i]
			var wb := _mk_btn("Equip %s" % str(db.weapons.get(wid, {}).get("title", wid)), func():
				var swapped := player_ship.cargo_weapons[i]
				if player_ship.weapons.size() < player_ship.weapon_slots:
					player_ship.cargo_weapons.remove_at(i)
					player_ship.add_weapon(swapped)
				else:
					var old_id: String = player_ship.weapons[-1].id
					player_ship.weapons.pop_back()
					player_ship.cargo_weapons[i] = old_id
					player_ship.add_weapon(swapped)
				_rebuild_hud_controls()
				_open_upgrades()
			)
			modal_box.add_child(wb)

	if not player_ship.cargo_drones.is_empty():
		modal_box.add_child(_mk_label("CARGO DRONES (클릭해 장착/교체)", 14, Color("5ce1ff")))
		for i in range(player_ship.cargo_drones.size()):
			var did := player_ship.cargo_drones[i]
			var db_btn := _mk_btn("Equip Drone: %s" % str(db.drones.get(did, {}).get("title", did)), func():
				var swapped := player_ship.cargo_drones[i]
				if player_ship.drones.size() < player_ship.drone_slots:
					player_ship.cargo_drones.remove_at(i)
					player_ship.add_drone(swapped)
				elif not player_ship.drones.is_empty():
					var old_id: String = player_ship.drones[-1].id
					player_ship.drones.pop_back()
					player_ship.cargo_drones[i] = old_id
					player_ship.add_drone(swapped)
				_rebuild_hud_controls()
				_open_upgrades()
			)
			modal_box.add_child(db_btn)

	if not player_ship.augments.is_empty():
		modal_box.add_child(_mk_label("AUGMENTS (%d/3)" % player_ship.augments.size(), 14, Color("c8f0a0")))
		for aid in player_ship.augments:
			var abp: Dictionary = db.augments.get(aid, {})
			var albl := _mk_label("• %s — %s" % [str(abp.get("title", aid)), str(abp.get("desc", "")).left(84)], 12, Color("d8e8f5"))
			modal_box.add_child(albl)


func _generate_store_inventory() -> Dictionary:
	return {
		"weapons": db.pick_store_weapons(3),
		"drones": db.pick_store_drones(2),
		"crew": ["human", "engi", "mantis", "rock", "energy", "slug"][randi() % 6],
		"augments": db.pick_store_augments(2),
	}


func _open_store() -> void:
	if current_store_inventory.is_empty():
		current_store_inventory = _generate_store_inventory()
	_open_modal("store", 760, 510)
	var head := HBoxContainer.new()
	modal_box.add_child(head)
	var tl := _mk_label("FEDERATION STORE  (Scrap: %d · Hull: %d/%d)" % [player_ship.scrap, player_ship.hull, player_ship.max_hull], 18, Color("7eff8b"))
	tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(tl)
	head.add_child(_mk_btn("닫기 (ESC)", _close_modal))

	var sup := HBoxContainer.new()
	sup.add_theme_constant_override("separation", 8)
	modal_box.add_child(sup)
	sup.add_child(_mk_btn("+1 Fuel (3 Scrap)", func():
		if player_ship.scrap >= 3:
			player_ship.scrap -= 3; player_ship.fuel += 1; audio.play_sfx("upgradeSystem"); _open_store()
	))
	sup.add_child(_mk_btn("+1 Missile (6 Scrap)", func():
		if player_ship.scrap >= 6:
			player_ship.scrap -= 6; player_ship.missiles += 1; audio.play_sfx("upgradeSystem"); _open_store()
	))
	sup.add_child(_mk_btn("+1 Drone Part (8 Scrap)", func():
		if player_ship.scrap >= 8:
			player_ship.scrap -= 8; player_ship.drone_parts += 1; audio.play_sfx("upgradeSystem"); _open_store()
	))
	var rep_cost := 2 + int(sector_map.current_sector_index / 3)
	sup.add_child(_mk_btn("Repair +1 Hull (%d Scrap)" % rep_cost, func():
		if player_ship.scrap >= rep_cost and player_ship.hull < player_ship.max_hull:
			player_ship.scrap -= rep_cost; player_ship.hull += 1; audio.play_sfx("upgradeSystem"); _open_store()
	, player_ship.hull < player_ship.max_hull and player_ship.scrap >= rep_cost))

	modal_box.add_child(_mk_label("WEAPONS & DRONES", 14, Color("ffd54f")))
	for wid in current_store_inventory.get("weapons", []):
		var w: Dictionary = db.weapons.get(str(wid), {})
		var cost := int(w.get("cost", 50))
		modal_box.add_child(_mk_btn("%s (%d PWR · %d DMG · %d Scrap)" % [str(w.get("title", wid)), int(w.get("power", 1)), int(w.get("damage", 1)), cost], func():
			if player_ship.scrap >= cost and player_ship.add_weapon(str(wid)):
				player_ship.scrap -= cost
				current_store_inventory.weapons.erase(wid)
				audio.play_sfx("upgradeSystem")
				_rebuild_hud_controls()
				_open_store()
		, player_ship.scrap >= cost))
	for did in current_store_inventory.get("drones", []):
		var dr: Dictionary = db.drones.get(str(did), {})
		var dcost := int(dr.get("cost", 50))
		modal_box.add_child(_mk_btn("Drone: %s (%d PWR · %s · %d Scrap)" % [str(dr.get("title", did)), int(dr.get("power", 2)), str(dr.get("type", "COMBAT")), dcost], func():
			if player_ship.scrap >= dcost and player_ship.add_drone(str(did)):
				player_ship.scrap -= dcost
				current_store_inventory.drones.erase(did)
				audio.play_sfx("upgradeSystem")
				_rebuild_hud_controls()
				_open_store()
		, player_ship.scrap >= dcost))

	modal_box.add_child(_mk_label("CREW & AUGMENTS", 14, Color("93b9d8")))
	var crew_sp := str(current_store_inventory.get("crew", ""))
	if not crew_sp.is_empty():
		var cbp: Dictionary = db.crew_species.get(crew_sp, {})
		var ccost := int(cbp.get("cost", 45))
		modal_box.add_child(_mk_btn("Hire %s Crew (%d Scrap)" % [str(cbp.get("title", crew_sp)), ccost], func():
			if player_ship.scrap >= ccost and _get_friendly_crew().size() < 8:
				player_ship.scrap -= ccost
				player_ship.add_crew(crew_sp, player_ship.rooms[0].id, true)
				current_store_inventory.crew = ""
				audio.play_sfx("upgradeSystem")
				_rebuild_hud_controls()
				_open_store()
		, player_ship.scrap >= ccost))

	for aid in current_store_inventory.get("augments", []):
		var a: Dictionary = db.augments.get(str(aid), {})
		var acost := int(a.get("cost", 50))
		modal_box.add_child(_mk_btn("Augment: %s (%d Scrap)" % [str(a.get("title", aid)), acost], func():
			if player_ship.scrap >= acost and player_ship.augments.size() < 3:
				player_ship.scrap -= acost
				player_ship.augments.append(str(aid))
				current_store_inventory.augments.erase(aid)
				audio.play_sfx("upgradeSystem")
				_open_store()
		, player_ship.scrap >= acost))

	# Installable Systems (Teleporter, Hacking, Mind Control, Cloaking, Battery, Drones, Clonebay)
	var sys_catalog := [
		{"id": "teleporter", "name": "Crew Teleporter (텔레포터 보딩)", "cost": 90},
		{"id": "hacking", "name": "Hacking System (해킹 +2 드론부품)", "cost": 80},
		{"id": "mind", "name": "Mind Control (마인드 컨트롤)", "cost": 75},
		{"id": "cloaking", "name": "Cloaking (은폐 장치)", "cost": 150},
		{"id": "battery", "name": "Backup Battery (예비 배터리 +2/+4 전력)", "cost": 35},
		{"id": "drones", "name": "Drone Control (드론 관제 +2 드론부품)", "cost": 85},
		{"id": "clonebay", "name": "Clone Bay (클론베이 · 의료실 대체)", "cost": 50},
	]
	var avail_sys: Array = []
	for item in sys_catalog:
		if not player_ship.systems.has(str(item.id)):
			avail_sys.append(item)
	if not avail_sys.is_empty():
		modal_box.add_child(_mk_label("INSTALLABLE SYSTEMS (시스템 증설)", 14, Color("7eff8b")))
		var sgrid := GridContainer.new()
		sgrid.columns = 2
		sgrid.add_theme_constant_override("h_separation", 8)
		sgrid.add_theme_constant_override("v_separation", 6)
		modal_box.add_child(sgrid)
		for item in avail_sys:
			var sid := str(item.id)
			var scost := int(item.cost)
			var sbtn := _mk_btn("%s (%d Scrap)" % [str(item.name), scost], func():
				if player_ship.scrap >= scost and player_ship.install_system(sid):
					player_ship.scrap -= scost
					if sid == "hacking" or sid == "drones":
						player_ship.drone_parts += 2
					audio.play_sfx("upgradeSystem")
					_rebuild_hud_controls()
					_open_store()
			, player_ship.scrap >= scost)
			sbtn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			sgrid.add_child(sbtn)

	# Sell Equipment (50% Scrap refund)
	var has_sellable := not player_ship.cargo_weapons.is_empty() or not player_ship.cargo_drones.is_empty() or player_ship.weapons.size() > 1 or not player_ship.drones.is_empty() or not player_ship.augments.is_empty()
	if has_sellable:
		modal_box.add_child(_mk_label("SELL EQUIPMENT (장비 판매 · 50% 환급)", 14, Color("ff9e80")))
		var sell_grid := GridContainer.new()
		sell_grid.columns = 2
		sell_grid.add_theme_constant_override("h_separation", 8)
		sell_grid.add_theme_constant_override("v_separation", 5)
		modal_box.add_child(sell_grid)
		for i in range(player_ship.cargo_weapons.size()):
			var cwid := player_ship.cargo_weapons[i]
			var wbp: Dictionary = db.weapons.get(cwid, {})
			var refund := maxi(10, int(wbp.get("cost", 40)) / 2)
			sell_grid.add_child(_mk_btn("Sell [Cargo] %s (+%d)" % [str(wbp.get("short", cwid)), refund], func():
				player_ship.cargo_weapons.remove_at(i)
				player_ship.scrap += refund
				audio.play_sfx("upgradeSystem")
				_open_store()
			))
		for i in range(player_ship.cargo_drones.size()):
			var cdid := player_ship.cargo_drones[i]
			var dbp: Dictionary = db.drones.get(cdid, {})
			var refund := maxi(10, int(dbp.get("cost", 50)) / 2)
			sell_grid.add_child(_mk_btn("Sell [Cargo] %s (+%d)" % [str(dbp.get("short", cdid)), refund], func():
				player_ship.cargo_drones.remove_at(i)
				player_ship.scrap += refund
				audio.play_sfx("upgradeSystem")
				_open_store()
			))
		for i in range(player_ship.augments.size()):
			var aid := player_ship.augments[i]
			var abp: Dictionary = db.augments.get(aid, {})
			var refund := maxi(10, int(abp.get("cost", 50)) / 2)
			sell_grid.add_child(_mk_btn("Sell Aug: %s (+%d)" % [str(abp.get("title", aid)).left(18), refund], func():
				player_ship.augments.remove_at(i)
				player_ship.scrap += refund
				audio.play_sfx("upgradeSystem")
				_open_store()
			))


func _open_profile_modal() -> void:
	_open_modal("profile", 780, 560)
	var head := HBoxContainer.new()
	modal_box.add_child(head)
	var src_lbl := profile.source_label if (profile != null and profile.loaded) else "미연동"
	var tl := _mk_label("FTL PROFILE & HALL OF FAME (%s)" % src_lbl, 18, Color("ffd54f"))
	tl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(tl)
	head.add_child(_mk_btn("닫기 (ESC)", _close_modal))

	if profile == null:
		modal_box.add_child(_mk_label("프로필이 초기화되지 않았습니다.", 14, Color("ff7878")))
		return

	var st: Dictionary = profile.stats
	var summary_txt := "총 플레이: %d회  |  총 승리: %d회  |  격파 함선: %d척 (단일 최고 %d)\n탐사 비콘: %d회 (단일 최고 %d)  |  누적 스크랩: %d (단일 최고 %d)\n고용 승무원: %d명  |  달성 도전과제: %d개" % [
		int(st.get("total_games", 0)), int(st.get("total_victories", 0)),
		int(st.get("total_ships_defeated", 0)), int(st.get("most_ships_defeated", 0)),
		int(st.get("total_beacons", 0)), int(st.get("most_beacons", 0)),
		int(st.get("total_scrap", 0)), int(st.get("most_scrap", 0)),
		int(st.get("total_crew_hired", 0)), profile.achievements.size(),
	]
	modal_box.add_child(_mk_label(summary_txt, 13, Color("d8ecff"), true))

	# Sandbox Unlock-All Toggle
	var toggle_row := HBoxContainer.new()
	toggle_row.add_theme_constant_override("separation", 10)
	modal_box.add_child(toggle_row)
	var sb_btn := _mk_btn(
		"전체 함선 언락 (SANDBOX: %s)" % ("ON - 모든 29종 사용 가능" if profile.unlock_all_sandbox else "OFF - ae_prof.sav 언락 반영"),
		func():
			profile.unlock_all_sandbox = not profile.unlock_all_sandbox
			_show_hangar()
			_open_profile_modal()
	, profile.unlock_all_sandbox)
	toggle_row.add_child(sb_btn)
	toggle_row.add_child(_mk_label("※ 원본 ae_prof.sav는 읽기 전용으로 보호됩니다.", 12, Color("8da8c2")))

	# Top 5 High Scores
	modal_box.add_child(_mk_label("TOP 5 HIGH SCORES (명예의 전당)", 15, Color("7eff8b")))
	if profile.top_scores.is_empty():
		modal_box.add_child(_mk_label("기록된 점수가 없습니다.", 13, Color("93b9d8")))
	else:
		var diff_names := ["EASY", "NORMAL", "HARD"]
		for i in range(profile.top_scores.size()):
			var sc: Dictionary = profile.top_scores[i]
			var d_idx := clampi(int(sc.get("diff", 0)), 0, 2)
			var vic_tag := "★ VICTORY" if bool(sc.get("victory", false)) else ("Sector %d" % int(sc.get("sector", 1)))
			var line := "#%d  %s  —  %d pts  [%s · %s]" % [
				i + 1, str(sc.get("ship_name", sc.get("ship_id", "Ship"))),
				int(sc.get("score", 0)), vic_tag, diff_names[d_idx]
			]
			modal_box.add_child(_mk_label(line, 13, Color("ffd54f") if i == 0 else Color("e6f2ff")))

	# Crew Hall of Fame Records
	modal_box.add_child(_mk_label("CREW LEGENDS (전설의 승무원 기록)", 15, Color("5cd6ff")))
	if profile.crew_records.is_empty():
		modal_box.add_child(_mk_label("승무원 기록이 없습니다.", 13, Color("93b9d8")))
	else:
		for cr in profile.crew_records:
			var cline := "• %s: %s (%s) — %d" % [
				str(cr.get("label", "Record")),
				str(cr.get("name", "Crew")),
				str(cr.get("species", "human")).capitalize(),
				int(cr.get("value", 0)),
			]
			modal_box.add_child(_mk_label(cline, 13, Color("cde6f8")))


func _show_end_modal(won: bool) -> void:
	var diff_mult := 1.0 + float(difficulty) * 0.25
	var final_score := int(round((float(scrap_collected) + float(ships_defeated) * 20.0 + float(sector_map.total_jumps) * 10.0) * diff_mult)) + (500 if won else 0)
	if profile != null and player_ship != null:
		profile.record_godot_run(
			player_ship.blueprint_id, player_ship.ship_name, final_score,
			sector_map.current_sector_index + 1, won, difficulty,
			ships_defeated, sector_map.total_jumps, scrap_collected
		)
	_open_modal("end", 560, 370)
	modal_box.add_child(_mk_label("VICTORY — FEDERATION SAVED!" if won else "SHIP DESTROYED — GAME OVER", 24, Color("7eff8b") if won else Color("ff5c5c")))
	modal_box.add_child(_mk_label(
		"The Rebel Flagship has been shattered! The Federation fleet rallies and pushes the Rebellion back." if won
		else "Your vessel was lost in deep space. The Rebel Fleet continues its advance.",
		15, Color("e6f0f7"), true
	))
	modal_box.add_child(_mk_label(
		"Ship: %s\nFinal Score: %d pts (프로필 오버레이에 기록됨)\nSector Reached: %d / 8\nBeacons Explored: %d\nShips Defeated: %d\nTotal Scrap Collected: %d" % [
			player_ship.ship_name, final_score, sector_map.current_sector_index + 1, sector_map.total_jumps, ships_defeated, scrap_collected
		],
		14, Color("ffd54f")
	))
	modal_box.add_child(_mk_btn("Return to Hangar (격납고로 돌아가기)", _show_hangar, true))
