class_name BuildMode
extends Node2D

const BalanceData = preload("res://scripts/balance.gd")
const BackgroundScript = preload("res://scripts/background.gd")
const ShipBodyScript = preload("res://scripts/ship_body.gd")
const ModeSwitcherScript = preload("res://scripts/mode_switcher.gd")
const CosmoteerAssetsScript = preload("res://scripts/cosmoteer_assets.gd")
const PartCatalogScript = preload("res://scripts/part_catalog.gd")
const BlueprintLibraryScript = preload("res://scripts/blueprint_library.gd")
const FlickScrollScript = preload("res://scripts/flick_scroll_container.gd")
const UiTheme = preload("res://scripts/ui_scale_theme.gd")

const MAX_UNDO_HISTORY := 60

class PartPreviewCanvas extends Control:
	var kind := "cosmo_heavy_laser"
	var quarter_turn := 0
	var diagonal_45 := false
	var preview_font: Font

	func set_part(next_kind: String, next_turn: int, next_diag: bool = false) -> void:
		kind = next_kind
		quarter_turn = posmod(next_turn, 4)
		diagonal_45 = next_diag
		queue_redraw()

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.03, 0.06, 0.11, 0.96), true)
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.32, 0.80, 0.98, 0.78), false, 1.5)
		var spec := BalanceData.module_spec(kind)
		var probe := PartData.new(0, kind, Vector2i.ZERO, quarter_turn)
		var cells := probe.cells()
		var min_c := Vector2(INF, INF)
		var max_c := Vector2(-INF, -INF)
		for c in cells:
			min_c.x = minf(min_c.x, float(c.x))
			min_c.y = minf(min_c.y, float(c.y))
			max_c.x = maxf(max_c.x, float(c.x))
			max_c.y = maxf(max_c.y, float(c.y))
		var span := Vector2(maxf(1.0, max_c.x - min_c.x + 1.0), maxf(1.0, max_c.y - min_c.y + 1.0))
		var cell_px := clampf(minf((size.x - 32.0) / span.x, (size.y - 34.0) / span.y), 12.0, 28.0)
		var center := Vector2(size.x * 0.5, size.y * 0.50)
		var mid_c := (min_c + max_c) * 0.5
		var fill_col := Color(str(spec.get("fill", "334661")))
		var stroke_col := Color(str(spec.get("stroke", "a9bed9")))
		var shape_name := str(spec.get("shape", ""))
		var diag_rot := PI * 0.25 if diagonal_45 else 0.0

		var cosmo_tex := CosmoteerAssetsScript.get_part_texture(kind, "cutaway")
		if cosmo_tex != null:
			var draw_w := span.y * cell_px * 1.15
			var draw_h := span.x * cell_px * 1.15
			if quarter_turn % 2 == 1:
				draw_w = span.x * cell_px * 1.15
				draw_h = span.y * cell_px * 1.15
			var draw_sz := Vector2(draw_w, draw_h).clamp(Vector2(24.0, 24.0), Vector2(maxf(26.0, size.x - 20.0), maxf(26.0, size.y - 28.0)))
			var tex_rot := float(quarter_turn) * PI * 0.5 + diag_rot
			draw_set_transform(center, tex_rot)
			draw_texture_rect(cosmo_tex, Rect2(-draw_sz * 0.5, draw_sz), false)
			var turret_tex := CosmoteerAssetsScript.get_turret_texture(kind)
			if turret_tex != null:
				draw_texture_rect(turret_tex, Rect2(-draw_sz * 0.5, draw_sz), false)
			draw_set_transform(Vector2.ZERO, 0.0)
		else:
			for c in cells:
				var local := (Vector2(c) - mid_c) * cell_px
				var draw_pos := center + Vector2(-local.y, -local.x).rotated(diag_rot)
				var rect := Rect2(-Vector2.ONE * (cell_px * 0.46), Vector2.ONE * (cell_px * 0.92))
				draw_set_transform(draw_pos, diag_rot)
				if shape_name == "triangle":
					var rot := float(quarter_turn) * PI * 0.5 - PI * 0.5
					var r := cell_px * 0.46
					var pts := PackedVector2Array([
						Vector2(r, 0).rotated(rot),
						Vector2(-r, -r).rotated(rot),
						Vector2(-r, r).rotated(rot),
					])
					draw_colored_polygon(pts, fill_col)
					draw_polyline(PackedVector2Array([pts[0], pts[1], pts[2], pts[0]]), stroke_col, 2.0)
				else:
					draw_rect(rect, fill_col, true)
					draw_rect(rect, stroke_col, false, 2.0)
				draw_set_transform(Vector2.ZERO, 0.0)

		var fwd_screen := Vector2.RIGHT.rotated(float(quarter_turn) * PI * 0.5 - PI * 0.5 + diag_rot)
		var actuator := str(spec.get("actuator", ""))
		if actuator == "forward" or actuator == "reverse" or actuator == "turn":
			var nozzle_dir := -fwd_screen if actuator == "forward" else fwd_screen
			draw_line(center + nozzle_dir * (cell_px * 0.35), center + nozzle_dir * (cell_px * 0.88), Color("ff9e55"), 2.6)
			draw_circle(center + nozzle_dir * (cell_px * 0.88), 2.8, Color("ffd36e"))
		else:
			var end_p := center + fwd_screen * (cell_px * 0.76)
			draw_line(center, end_p, Color("6ef2ff"), 2.0)
			draw_circle(end_p, 2.5, Color("91f6ff"))

		var font := preview_font if preview_font != null else ThemeDB.fallback_font
		if font != null:
			var top_txt := "%s · %d°" % [str(spec.get("label", kind)), quarter_turn * 90]
			var bot_txt := PartCatalogScript.stat_summary(kind)
			draw_string(font, Vector2(6, 21), top_txt, HORIZONTAL_ALIGNMENT_LEFT, maxf(40.0, size.x - 12.0), 17, Color("91f2ff"))
			draw_string(font, Vector2(6, size.y - 7), bot_txt, HORIZONTAL_ALIGNMENT_LEFT, maxf(40.0, size.x - 12.0), 15, Color("ffd36e"))

class PartThumbCanvas extends Control:
	var kind := "armor"

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.04, 0.08, 0.14, 0.95), true)
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.28, 0.62, 0.82, 0.65), false, 1.0)
		var tex := CosmoteerAssetsScript.get_part_texture(kind, "cutaway")
		if tex != null:
			var pad := 4.0
			var rect := Rect2(Vector2(pad, pad), size - Vector2(pad * 2.0, pad * 2.0))
			draw_texture_rect(tex, rect, false)
			var turret := CosmoteerAssetsScript.get_turret_texture(kind)
			if turret != null:
				draw_texture_rect(turret, rect, false)
		else:
			var spec := BalanceData.module_spec(kind)
			var fill_col := Color(str(spec.get("fill", "334661")))
			var stroke_col := Color(str(spec.get("stroke", "a9bed9")))
			var r := Rect2(Vector2(8, 8), size - Vector2(16, 16))
			draw_rect(r, fill_col, true)
			draw_rect(r, stroke_col, false, 1.5)

var world_layer: Node2D
var player: ShipBody
var camera: Camera2D
var mode_switcher: ModeSwitcher

var selected_kind := "cosmo_heavy_laser"
var quarter_turn := 0
var symmetry_enabled := true
var remove_mode := false
var test_flight_active := false
var _hover_cell := Vector2i(999, 999)
var _status_msg := "하단 [파트 목록 ▲]에서 부품 선택 -> 회전 -> 초록 소켓 터치 설치"

var _undo_stack: Array[Dictionary] = []
var _redo_stack: Array[Dictionary] = []
var _catalog_filter := "all"
var _palette_filter := "all"
var open_drawer := "" # "", "parts", "tools", "manage"

var _ui_layer: CanvasLayer
var _top_info_panel: PanelContainer
var part_preview: PartPreviewCanvas
var _stats_label: Label
var _status_label: Label
var _selected_title_label: Label

var _left_bottom_panel: PanelContainer
var _bottom_action_panel: PanelContainer
var _grp_parts_btn: Button
var _grp_tools_btn: Button
var _grp_manage_btn: Button

var _drawer_parts: PanelContainer
var _drawer_tools: PanelContainer
var _drawer_manage: PanelContainer
var palette_scroll: FlickScrollContainer
var _palette_grid: GridContainer
var _palette_filter_buttons: Dictionary = {}

var _symmetry_btn: Button
var _diagonal_btn: Button
var _remove_btn: Button
var _flight_btn: Button
var _catalog_btn: Button
var big_rotate_btn: Button
var floating_rotate_btn: Button
var _bottom_sym_btn: Button
var _bottom_diag_btn: Button
var _bottom_undo_btn: Button
var _bottom_redo_btn: Button
var _zoom_panel: PanelContainer
var _zoom_slider: HSlider
var _zoom_fit_btn: Button
var _touch_points: Dictionary = {}
var _pinch_prev_dist := 0.0
var _pan_dragging := false
var _pan_last_pos := Vector2.ZERO
var _part_buttons: Dictionary = {}
var _ui_font: Font
var _ui_theme: Theme

# 반응형 모달 오버레이
var _blueprint_backdrop: ColorRect
var _blueprint_modal: PanelContainer
var _blueprint_scroll: FlickScrollContainer
var _blueprint_content: VBoxContainer
var _blueprint_name_input: LineEdit

var _catalog_backdrop: ColorRect
var _catalog_modal: PanelContainer
var _catalog_filter_grid: GridContainer
var _catalog_col_hdr: PanelContainer
var _catalog_scroll: FlickScrollContainer
var _catalog_rows: VBoxContainer
var _catalog_summary_label: Label
var _catalog_title_label: Label
var _catalog_filter_buttons: Dictionary = {}

# 초대형 함선 조립 소켓 O(1) 캐시
var _cached_cand_rev: int = -1
var _cached_cand_kind: String = ""
var _cached_cand_turn: int = -1
var _cached_candidates: Array[Vector2i] = []
var _cached_candidate_set: Dictionary = {}
var _last_hover_cell := Vector2i(99999, 99999)

func _ready() -> void:
	CosmoteerAssetsScript.ensure_loaded()
	PartCatalogScript.ensure_loaded()
	_install_ui_font()
	world_layer = Node2D.new()
	world_layer.name = "World"
	add_child(world_layer)

	var bg := BackgroundScript.new()
	world_layer.add_child(bg)

	player = ShipBodyScript.new()
	player.name = "BuilderShip"
	player.position = Vector2.ZERO
	world_layer.add_child(player)
	player.initialize_player()
	player.freeze = true
	_apply_ship_build_rotation()
	ShipModel.save_player_blueprint(player.model)

	camera = Camera2D.new()
	camera.ignore_rotation = true
	camera.zoom = Vector2(1.06, 1.06)
	camera.offset = Vector2(0.0, 6.0)
	world_layer.add_child(camera)

	_ui_layer = CanvasLayer.new()
	_ui_layer.layer = 50
	add_child(_ui_layer)

	_build_top_readonly_info()
	_build_bottom_left_group_dock()
	_build_bottom_right_action_dock()
	_build_zoom_dock()
	_build_upward_drawers()
	_build_blueprint_modal()
	_build_catalog_modal()

	mode_switcher = ModeSwitcherScript.new()
	mode_switcher.setup("build")
	mode_switcher.orientation_changed.connect(func(_p: bool) -> void: _sync_responsive_layout())
	add_child(mode_switcher)
	if get_viewport() != null:
		get_viewport().size_changed.connect(_sync_responsive_layout)

	_rebuild_palette_buttons()
	_sync_toggle_buttons()
	_sync_history_buttons()
	_sync_drawer_visibility()
	_sync_responsive_layout()
	if player != null and player.hull_bound_radius > 190.0:
		fit_camera_to_ship()
	_update_preview_and_stats()

func _sync_responsive_layout() -> void:
	var vp := get_viewport_rect().size
	var narrow := vp.x < 960.0 or ModeSwitcherScript.is_portrait_mode
	var ultra_narrow := vp.x < 640.0

	# 1. 상단 좌측 읽기 전용 정보 패널 (2배 확대 · 우측 상단 줌 도크와 비간섭 정렬)
	if _top_info_panel != null:
		var top_w := (vp.x - 20.0) if narrow else minf(760.0, vp.x - 392.0)
		_top_info_panel.anchor_left = 0.0
		_top_info_panel.anchor_right = 0.0
		_top_info_panel.offset_left = 10.0
		_top_info_panel.offset_right = 10.0 + top_w
		_top_info_panel.offset_top = 10.0
		_top_info_panel.custom_minimum_size = Vector2.ZERO
		if part_preview != null:
			part_preview.custom_minimum_size = Vector2(138.0, 96.0) if ultra_narrow else Vector2(184.0, 114.0)

	# 2. 상단 우측(가로) / 상단 정보카드 아래(세로) 2배 확대/축소 도크 (하단 조립 공간 완전 확보!)
	if _zoom_panel != null:
		_zoom_panel.visible = open_drawer.is_empty() and not is_modal_open()
		if narrow:
			_zoom_panel.anchor_left = 0.0
			_zoom_panel.anchor_right = 1.0
			_zoom_panel.anchor_top = 0.0
			_zoom_panel.anchor_bottom = 0.0
			_zoom_panel.offset_left = 10.0
			_zoom_panel.offset_right = -10.0
			_zoom_panel.offset_top = 164.0
			_zoom_panel.offset_bottom = 228.0
		else:
			var zw := minf(364.0, vp.x - 20.0)
			_zoom_panel.anchor_left = 1.0
			_zoom_panel.anchor_right = 1.0
			_zoom_panel.anchor_top = 0.0
			_zoom_panel.anchor_bottom = 0.0
			_zoom_panel.offset_left = -10.0 - zw
			_zoom_panel.offset_right = -10.0
			_zoom_panel.offset_top = 10.0
			_zoom_panel.offset_bottom = 76.0

	# 3. 하단 우측 직접조작 도크 (UNDO/REDO/대칭/45°/회전)
	if _bottom_action_panel != null:
		if narrow:
			_bottom_action_panel.anchor_left = 0.0
			_bottom_action_panel.anchor_right = 1.0
			_bottom_action_panel.offset_left = 10.0
			_bottom_action_panel.offset_right = -10.0
			_bottom_action_panel.offset_top = -98.0
			_bottom_action_panel.offset_bottom = -10.0
		else:
			var act_w := minf(494.0, vp.x - 786.0)
			_bottom_action_panel.anchor_left = 1.0
			_bottom_action_panel.anchor_right = 1.0
			_bottom_action_panel.offset_left = -10.0 - act_w
			_bottom_action_panel.offset_right = -10.0
			_bottom_action_panel.offset_top = -98.0
			_bottom_action_panel.offset_bottom = -10.0
		if floating_rotate_btn != null:
			var rot_w := 118.0 if ultra_narrow else 138.0
			floating_rotate_btn.custom_minimum_size = Vector2(rot_w, 80.0)
			floating_rotate_btn.add_theme_font_size_override("font_size", 18 if ultra_narrow else 21)
		for b in [_bottom_undo_btn, _bottom_redo_btn, _bottom_sym_btn, _bottom_diag_btn]:
			if b != null:
				b.add_theme_font_size_override("font_size", 17 if ultra_narrow else 20)

	# 4. 하단 좌측 그룹 도크 (파트 목록 / 도구 / 도안·편집)
	if _left_bottom_panel != null:
		if narrow:
			var ms_reserved := 266.0 if ultra_narrow else 306.0
			var left_r := maxf(240.0, vp.x - ms_reserved - 8.0)
			_left_bottom_panel.offset_left = 10.0
			_left_bottom_panel.offset_right = left_r
			_left_bottom_panel.offset_top = -190.0
			_left_bottom_panel.offset_bottom = -106.0
		else:
			_left_bottom_panel.offset_left = 10.0
			_left_bottom_panel.offset_right = 468.0
			_left_bottom_panel.offset_top = -94.0
			_left_bottom_panel.offset_bottom = -10.0
		for gb in [_grp_parts_btn, _grp_tools_btn, _grp_manage_btn]:
			if gb != null:
				gb.add_theme_font_size_override("font_size", 18 if ultra_narrow else 21)
		_sync_drawer_visibility()

	# 5. 그룹별 상단 펼치기 2배 확대 드로어 (화면 경계 100% 클램핑)
	var btm := -198.0 if narrow else -104.0
	var max_drawer_h := maxf(180.0, vp.y + btm - 16.0)
	if _drawer_parts != null:
		var pw := minf(760.0, vp.x - 20.0)
		_drawer_parts.offset_left = 10.0
		_drawer_parts.offset_right = 10.0 + pw
		_drawer_parts.offset_bottom = btm
		_drawer_parts.offset_top = btm - minf(480.0, max_drawer_h)
	if _palette_grid != null:
		_palette_grid.columns = 2 if vp.x < 760.0 else 3
	if _drawer_tools != null:
		var tw := minf(430.0, vp.x - 20.0)
		var tl := clampf(60.0 if narrow else 120.0, 10.0, vp.x - tw - 10.0)
		_drawer_tools.offset_left = tl
		_drawer_tools.offset_right = tl + tw
		_drawer_tools.offset_bottom = btm
		_drawer_tools.offset_top = btm - minf(420.0, max_drawer_h)
	if _drawer_manage != null:
		var mw := minf(410.0, vp.x - 20.0)
		var ml := clampf(100.0 if narrow else 230.0, 10.0, vp.x - mw - 10.0)
		_drawer_manage.offset_left = ml
		_drawer_manage.offset_right = ml + mw
		_drawer_manage.offset_bottom = btm
		_drawer_manage.offset_top = btm - minf(290.0, max_drawer_h)

	# 6. 도안·프리셋 모달 및 코스모티어 파트 목록표 모달 (세로 Full-Rect 안전 마진 · 가로 중앙 정렬 · 100% 무잘림)
	if _blueprint_modal != null:
		if narrow:
			_blueprint_modal.anchor_left = 0.0
			_blueprint_modal.anchor_right = 1.0
			_blueprint_modal.anchor_top = 0.0
			_blueprint_modal.anchor_bottom = 1.0
			_blueprint_modal.offset_left = 10.0
			_blueprint_modal.offset_right = -10.0
			_blueprint_modal.offset_top = 12.0
			_blueprint_modal.offset_bottom = -198.0
		else:
			var bw := minf(980.0, vp.x - 24.0)
			var bh := minf(660.0, vp.y - 24.0)
			_blueprint_modal.anchor_left = 0.5
			_blueprint_modal.anchor_right = 0.5
			_blueprint_modal.anchor_top = 0.5
			_blueprint_modal.anchor_bottom = 0.5
			_blueprint_modal.offset_left = -bw * 0.5
			_blueprint_modal.offset_right = bw * 0.5
			_blueprint_modal.offset_top = -bh * 0.5
			_blueprint_modal.offset_bottom = bh * 0.5

	if _catalog_modal != null:
		var cw := (vp.x - 20.0) if narrow else minf(1080.0, vp.x - 24.0)
		if narrow:
			_catalog_modal.anchor_left = 0.0
			_catalog_modal.anchor_right = 1.0
			_catalog_modal.anchor_top = 0.0
			_catalog_modal.anchor_bottom = 1.0
			_catalog_modal.offset_left = 10.0
			_catalog_modal.offset_right = -10.0
			_catalog_modal.offset_top = 12.0
			_catalog_modal.offset_bottom = -198.0
		else:
			var ch := minf(676.0, vp.y - 24.0)
			_catalog_modal.anchor_left = 0.5
			_catalog_modal.anchor_right = 0.5
			_catalog_modal.anchor_top = 0.5
			_catalog_modal.anchor_bottom = 0.5
			_catalog_modal.offset_left = -cw * 0.5
			_catalog_modal.offset_right = cw * 0.5
			_catalog_modal.offset_top = -ch * 0.5
			_catalog_modal.offset_bottom = ch * 0.5
		if _catalog_filter_grid != null:
			_catalog_filter_grid.columns = 3 if (narrow or cw < 860.0) else 6
		if _catalog_title_label != null:
			var cnt_str := "%d/%d" % [PartCatalogScript.enabled_count(), PartCatalogScript.ENTRIES.size()]
			_catalog_title_label.text = ("파트 목록 편집 (%s)" % cnt_str) if (narrow or cw < 820.0) else ("코스모티어 조립 파트 목록표 · 사용 편집 (%s)" % cnt_str)
		if _catalog_summary_label != null:
			_catalog_summary_label.visible = false
		if _catalog_col_hdr != null:
			_catalog_col_hdr.visible = (not narrow and cw >= 880.0)
		if _catalog_backdrop != null and _catalog_backdrop.visible:
			_rebuild_catalog_table()

func _apply_ship_build_rotation() -> void:
	if player == null or player.model == null:
		return
	player.rotation = -PI * 0.5 + (PI * 0.25 if player.model.diagonal_45 else 0.0)

func _install_ui_font() -> void:
	_ui_font = UiTheme.load_ui_font()
	_ui_theme = UiTheme.build_theme(true)

func _make_panel_style(bg: Color, border: Color, radius: int = 10, margin: int = 9) -> StyleBoxFlat:
	return UiTheme.make_box(bg, border, radius, margin, margin, 2)

func _make_ctrl_btn(w: float, h: float, cb: Callable, font_sz: int = 21) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(w, h)
	b.focus_mode = Control.FOCUS_NONE
	b.clip_text = true
	b.add_theme_font_size_override("font_size", font_sz)
	b.pressed.connect(cb)
	return b

# ==============================================================================
# 상단: 읽기 전용 함선·선택 파트 정보 표시 (2배 확대 · 버튼 없음)
# ==============================================================================

func _build_top_readonly_info() -> void:
	_top_info_panel = PanelContainer.new()
	_top_info_panel.position = Vector2(10, 10)
	_top_info_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if _ui_theme != null:
		_top_info_panel.theme = _ui_theme
	_top_info_panel.add_theme_stylebox_override("panel", _make_panel_style(Color(0.03, 0.07, 0.13, 0.90), Color(0.32, 0.78, 0.96, 0.76), 11, 10))
	_ui_layer.add_child(_top_info_panel)

	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 12)
	hbox.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_top_info_panel.add_child(hbox)

	part_preview = PartPreviewCanvas.new()
	part_preview.preview_font = _ui_font
	part_preview.custom_minimum_size = Vector2(184, 114)
	part_preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hbox.add_child(part_preview)

	var info_col := VBoxContainer.new()
	info_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info_col.add_theme_constant_override("separation", 4)
	info_col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hbox.add_child(info_col)

	_selected_title_label = Label.new()
	_selected_title_label.text = "COSMOTEER BUILD · 함선 조립"
	_selected_title_label.clip_text = true
	_selected_title_label.add_theme_font_size_override("font_size", 24)
	_selected_title_label.add_theme_color_override("font_color", Color("8ef8ff"))
	_selected_title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	info_col.add_child(_selected_title_label)

	_stats_label = Label.new()
	_stats_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_stats_label.add_theme_font_size_override("font_size", 20)
	_stats_label.add_theme_color_override("font_color", Color("e0f2ff"))
	_stats_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	info_col.add_child(_stats_label)

	_status_label = Label.new()
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status_label.add_theme_font_size_override("font_size", 19)
	_status_label.add_theme_color_override("font_color", Color("ffd36e"))
	_status_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	info_col.add_child(_status_label)

# ==============================================================================
# 하단: 대형 2배 터치 버튼 도크 (가변 폭으로 절대 잘림 방지)
# ==============================================================================

func _build_bottom_left_group_dock() -> void:
	_left_bottom_panel = PanelContainer.new()
	_left_bottom_panel.anchor_left = 0.0
	_left_bottom_panel.anchor_right = 0.0
	_left_bottom_panel.anchor_top = 1.0
	_left_bottom_panel.anchor_bottom = 1.0
	if _ui_theme != null:
		_left_bottom_panel.theme = _ui_theme
	_left_bottom_panel.add_theme_stylebox_override("panel", _make_panel_style(Color(0.03, 0.07, 0.14, 0.95), Color(0.36, 0.84, 1.0, 0.88), 11, 6))
	_ui_layer.add_child(_left_bottom_panel)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	_left_bottom_panel.add_child(row)

	_grp_parts_btn = _make_ctrl_btn(0, 68, func() -> void: toggle_drawer("parts"), 21)
	_grp_parts_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_grp_tools_btn = _make_ctrl_btn(0, 68, func() -> void: toggle_drawer("tools"), 21)
	_grp_tools_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_grp_manage_btn = _make_ctrl_btn(0, 68, func() -> void: toggle_drawer("manage"), 21)
	_grp_manage_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	row.add_child(_grp_parts_btn)
	row.add_child(_grp_tools_btn)
	row.add_child(_grp_manage_btn)

func _build_bottom_right_action_dock() -> void:
	_bottom_action_panel = PanelContainer.new()
	_bottom_action_panel.anchor_left = 1.0
	_bottom_action_panel.anchor_right = 1.0
	_bottom_action_panel.anchor_top = 1.0
	_bottom_action_panel.anchor_bottom = 1.0
	if _ui_theme != null:
		_bottom_action_panel.theme = _ui_theme
	_bottom_action_panel.add_theme_stylebox_override("panel", _make_panel_style(Color(0.03, 0.07, 0.14, 0.95), Color(0.38, 0.86, 1.0, 0.90), 11, 6))
	_ui_layer.add_child(_bottom_action_panel)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	_bottom_action_panel.add_child(row)

	_bottom_undo_btn = _make_ctrl_btn(0, 74, func() -> void: undo(), 20)
	_bottom_undo_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_bottom_redo_btn = _make_ctrl_btn(0, 74, func() -> void: redo(), 20)
	_bottom_redo_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_bottom_sym_btn = _make_ctrl_btn(0, 74, toggle_symmetry, 20)
	_bottom_sym_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_bottom_diag_btn = _make_ctrl_btn(0, 74, toggle_diagonal_45, 20)
	_bottom_diag_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	floating_rotate_btn = Button.new()
	floating_rotate_btn.text = "회전\n0° (Q)"
	floating_rotate_btn.custom_minimum_size = Vector2(138, 80)
	floating_rotate_btn.focus_mode = Control.FOCUS_NONE
	floating_rotate_btn.clip_text = true
	floating_rotate_btn.add_theme_font_size_override("font_size", 21)
	floating_rotate_btn.add_theme_stylebox_override("normal", _make_panel_style(Color(0.11, 0.42, 0.64, 0.96), Color(0.55, 0.98, 1.0, 1.0), 9, 5))
	floating_rotate_btn.add_theme_color_override("font_color", Color.WHITE)
	floating_rotate_btn.pressed.connect(rotate_part)
	big_rotate_btn = floating_rotate_btn

	for b in [_bottom_undo_btn, _bottom_redo_btn, _bottom_sym_btn, _bottom_diag_btn, floating_rotate_btn]:
		row.add_child(b)

func _build_zoom_dock() -> void:
	_zoom_panel = PanelContainer.new()
	if _ui_theme != null:
		_zoom_panel.theme = _ui_theme
	_zoom_panel.add_theme_stylebox_override("panel", _make_panel_style(Color(0.03, 0.08, 0.15, 0.95), Color(0.42, 0.88, 1.0, 0.90), 10, 6))
	_ui_layer.add_child(_zoom_panel)

	var zbox := HBoxContainer.new()
	zbox.add_theme_constant_override("separation", 6)
	_zoom_panel.add_child(zbox)

	var z_out := _make_ctrl_btn(48, 46, func() -> void: set_camera_zoom(camera.zoom.x / 1.18), 24)
	z_out.text = "-"
	zbox.add_child(z_out)

	_zoom_slider = HSlider.new()
	_zoom_slider.min_value = 0.14
	_zoom_slider.max_value = 2.40
	_zoom_slider.step = 0.02
	_zoom_slider.value = 1.06
	_zoom_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_zoom_slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_zoom_slider.value_changed.connect(func(v: float) -> void: set_camera_zoom(v, false))
	zbox.add_child(_zoom_slider)

	var z_in := _make_ctrl_btn(48, 46, func() -> void: set_camera_zoom(camera.zoom.x * 1.18), 24)
	z_in.text = "+"
	zbox.add_child(z_in)

	_zoom_fit_btn = _make_ctrl_btn(118, 46, fit_camera_to_ship, 20)
	_zoom_fit_btn.text = "맞춤 106%"
	zbox.add_child(_zoom_fit_btn)

func set_camera_zoom(z_val: float, sync_slider: bool = true) -> void:
	if camera == null:
		return
	var clamped := clampf(z_val, 0.14, 2.40)
	camera.zoom = Vector2(clamped, clamped)
	if sync_slider and _zoom_slider != null:
		_zoom_slider.set_value_no_signal(clamped)
	if _zoom_fit_btn != null:
		_zoom_fit_btn.text = "맞춤 %d%%" % roundi(clamped * 100.0)
	queue_redraw()

func fit_camera_to_ship() -> void:
	if camera == null or player == null:
		return
	var vp := get_viewport_rect().size
	var usable_w := maxf(260.0, vp.x - 80.0)
	var usable_h := maxf(240.0, vp.y - 260.0)
	var ship_diam := maxf(220.0, (player.hull_bound_radius + 72.0) * 2.0)
	var target_z := clampf(minf(usable_w / ship_diam, usable_h / ship_diam), 0.16, 1.15)
	camera.offset = Vector2(0.0, 6.0)
	set_camera_zoom(target_z)

# ==============================================================================
# 그룹별 상단 펼치기 드로어
# ==============================================================================

func _build_upward_drawers() -> void:
	# 1. 파트 목록 드로어 (2배 확대)
	_drawer_parts = PanelContainer.new()
	_drawer_parts.anchor_left = 0.0
	_drawer_parts.anchor_right = 0.0
	_drawer_parts.anchor_top = 1.0
	_drawer_parts.anchor_bottom = 1.0
	_drawer_parts.visible = false
	if _ui_theme != null:
		_drawer_parts.theme = _ui_theme
	_drawer_parts.add_theme_stylebox_override("panel", _make_panel_style(Color(0.03, 0.07, 0.14, 0.97), Color(0.42, 0.90, 1.0, 0.94), 12, 10))
	_ui_layer.add_child(_drawer_parts)

	var pvbox := VBoxContainer.new()
	pvbox.add_theme_constant_override("separation", 8)
	_drawer_parts.add_child(pvbox)

	var phdr := HBoxContainer.new()
	pvbox.add_child(phdr)
	var ptitle := Label.new()
	ptitle.text = "조립 파트 목록 · 터치/드래그 스크롤"
	ptitle.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	ptitle.clip_text = true
	ptitle.add_theme_font_size_override("font_size", 24)
	ptitle.add_theme_color_override("font_color", Color("8ef8ff"))
	phdr.add_child(ptitle)
	var pclose := _make_ctrl_btn(96, 46, func() -> void: set_open_drawer(""), 21)
	pclose.text = "접기"
	phdr.add_child(pclose)

	var pfilters := HFlowContainer.new()
	pfilters.add_theme_constant_override("h_separation", 6)
	pfilters.add_theme_constant_override("v_separation", 6)
	pvbox.add_child(pfilters)
	for cat in PartCatalogScript.CATEGORIES:
		var cid := str(cat.id)
		var fb := _make_ctrl_btn(92, 46, func() -> void:
			_palette_filter = cid
			_rebuild_palette_buttons(), 20)
		fb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		fb.text = str(cat.label)
		pfilters.add_child(fb)
		_palette_filter_buttons[cid] = fb

	palette_scroll = FlickScrollScript.new()
	palette_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	palette_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	pvbox.add_child(palette_scroll)

	_palette_grid = GridContainer.new()
	_palette_grid.columns = 3
	_palette_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_palette_grid.add_theme_constant_override("h_separation", 7)
	_palette_grid.add_theme_constant_override("v_separation", 7)
	palette_scroll.add_child(_palette_grid)

	# 2. 조립 도구 드로어 (2배 확대 · FlickScroll 내장)
	_drawer_tools = PanelContainer.new()
	_drawer_tools.anchor_left = 0.0
	_drawer_tools.anchor_right = 0.0
	_drawer_tools.anchor_top = 1.0
	_drawer_tools.anchor_bottom = 1.0
	_drawer_tools.visible = false
	if _ui_theme != null:
		_drawer_tools.theme = _ui_theme
	_drawer_tools.add_theme_stylebox_override("panel", _make_panel_style(Color(0.03, 0.07, 0.14, 0.97), Color(1.0, 0.82, 0.38, 0.92), 12, 10))
	_ui_layer.add_child(_drawer_tools)

	var tscroll := FlickScrollScript.new()
	tscroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tscroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_drawer_tools.add_child(tscroll)

	var tvbox := VBoxContainer.new()
	tvbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tvbox.add_theme_constant_override("separation", 7)
	tscroll.add_child(tvbox)

	var thdr := Label.new()
	thdr.text = "조립 도구"
	thdr.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	thdr.add_theme_font_size_override("font_size", 24)
	thdr.add_theme_color_override("font_color", Color("ffd36e"))
	tvbox.add_child(thdr)

	_symmetry_btn = _make_ctrl_btn(0, 52, toggle_symmetry, 21)
	_symmetry_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_diagonal_btn = _make_ctrl_btn(0, 52, toggle_diagonal_45, 21)
	_diagonal_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_remove_btn = _make_ctrl_btn(0, 52, func() -> void:
		toggle_remove_mode()
		set_open_drawer(""), 21)
	_remove_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_flight_btn = _make_ctrl_btn(0, 52, func() -> void:
		toggle_test_flight()
		set_open_drawer(""), 21)
	_flight_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tvbox.add_child(_symmetry_btn)
	tvbox.add_child(_diagonal_btn)
	tvbox.add_child(_remove_btn)
	tvbox.add_child(_flight_btn)

	var zrow := HBoxContainer.new()
	zrow.add_theme_constant_override("separation", 6)
	tvbox.add_child(zrow)
	var zout := _make_ctrl_btn(0, 50, func() -> void: set_camera_zoom(camera.zoom.x / 1.18), 20)
	zout.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	zout.text = "축소 -"
	var zin := _make_ctrl_btn(0, 50, func() -> void: set_camera_zoom(camera.zoom.x * 1.18), 20)
	zin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	zin.text = "확대 +"
	var zfit := _make_ctrl_btn(0, 50, fit_camera_to_ship, 20)
	zfit.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	zfit.text = "전체 맞춤"
	zrow.add_child(zout)
	zrow.add_child(zfit)
	zrow.add_child(zin)

	var prow := HBoxContainer.new()
	prow.add_theme_constant_override("separation", 6)
	tvbox.add_child(prow)
	var pgrid_btn := _make_ctrl_btn(0, 50, func() -> void:
		player.show_power_overlay = not player.show_power_overlay
		player.queue_redraw(), 20)
	pgrid_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	pgrid_btn.text = "ONI 전력망"
	var awire_btn := _make_ctrl_btn(0, 50, func() -> void:
		if player.interior != null:
			var st := player.interior.optimize_wire_gauges()
			ShipModel.save_player_blueprint(player.model)
			player.show_power_overlay = true
			_status_msg = "ONI 전력망 효율화: 재료 %.0fkg (-%.0f%%) · 설치 %.1fs (-%.0f%%)" % [
				float(st.get("total_metal_kg", 0.0)), float(st.get("metal_saved_pct", 0.0)),
				float(st.get("total_build_time_s", 0.0)), float(st.get("time_saved_pct", 0.0))
			]
			_update_preview_and_stats()
			player.queue_redraw(), 20)
	awire_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	awire_btn.text = "전력 효율화"
	prow.add_child(pgrid_btn)
	prow.add_child(awire_btn)

	# 3. 도안·목록 편집 드로어 (2배 확대 · FlickScroll 내장)
	_drawer_manage = PanelContainer.new()
	_drawer_manage.anchor_left = 0.0
	_drawer_manage.anchor_right = 0.0
	_drawer_manage.anchor_top = 1.0
	_drawer_manage.anchor_bottom = 1.0
	_drawer_manage.visible = false
	if _ui_theme != null:
		_drawer_manage.theme = _ui_theme
	_drawer_manage.add_theme_stylebox_override("panel", _make_panel_style(Color(0.03, 0.07, 0.14, 0.97), Color(0.45, 0.94, 1.0, 0.94), 12, 10))
	_ui_layer.add_child(_drawer_manage)

	var mscroll := FlickScrollScript.new()
	mscroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mscroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_drawer_manage.add_child(mscroll)

	var mvbox := VBoxContainer.new()
	mvbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mvbox.add_theme_constant_override("separation", 8)
	mscroll.add_child(mvbox)

	var mhdr := Label.new()
	mhdr.text = "도안 · 파트 목록 관리"
	mhdr.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mhdr.add_theme_font_size_override("font_size", 24)
	mhdr.add_theme_color_override("font_color", Color("8ef8ff"))
	mvbox.add_child(mhdr)

	var bp_btn := _make_ctrl_btn(0, 56, func() -> void:
		set_open_drawer("")
		open_blueprint_modal(), 22)
	bp_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bp_btn.text = "도안 저장/로드 · 프리셋"
	bp_btn.add_theme_stylebox_override("normal", _make_panel_style(Color(0.11, 0.28, 0.46, 0.96), Color(0.45, 0.88, 1.0, 0.92), 9, 6))
	bp_btn.add_theme_color_override("font_color", Color("b8f8ff"))
	mvbox.add_child(bp_btn)

	_catalog_btn = _make_ctrl_btn(0, 56, func() -> void:
		set_open_drawer("")
		open_catalog_modal(), 22)
	_catalog_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_catalog_btn.add_theme_stylebox_override("normal", _make_panel_style(Color(0.26, 0.21, 0.08, 0.96), Color(1.0, 0.82, 0.36, 0.92), 9, 6))
	_catalog_btn.add_theme_color_override("font_color", Color("ffe08c"))
	mvbox.add_child(_catalog_btn)

	var reset_btn := _make_ctrl_btn(0, 52, func() -> void:
		reset_ship()
		set_open_drawer(""), 21)
	reset_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	reset_btn.text = "초기함선 복원"
	mvbox.add_child(reset_btn)

func toggle_drawer(name_id: String) -> void:
	set_open_drawer("" if open_drawer == name_id else name_id)

func set_open_drawer(name_id: String) -> void:
	open_drawer = name_id
	_sync_responsive_layout()
	_sync_drawer_visibility()

func _sync_drawer_visibility() -> void:
	var ultra_narrow := get_viewport_rect().size.x < 640.0
	if _zoom_panel != null:
		_zoom_panel.visible = open_drawer.is_empty() and not is_modal_open()
	if _drawer_parts != null:
		_drawer_parts.visible = (open_drawer == "parts")
	if _drawer_tools != null:
		_drawer_tools.visible = (open_drawer == "tools")
	if _drawer_manage != null:
		_drawer_manage.visible = (open_drawer == "manage")
	if _grp_parts_btn != null:
		var on := (open_drawer == "parts")
		_grp_parts_btn.text = ("파트 %s" if ultra_narrow else "파트 목록 %s") % ("▼" if on else "▲")
		_grp_parts_btn.add_theme_stylebox_override("normal", _make_panel_style(
			Color(0.12, 0.38, 0.56, 0.96) if on else Color(0.06, 0.14, 0.24, 0.92),
			Color(0.55, 0.98, 1.0, 1.0) if on else Color(0.32, 0.72, 0.92, 0.72), 8, 5))
		_grp_parts_btn.add_theme_color_override("font_color", Color.WHITE if on else Color("9ef8ff"))
	if _grp_tools_btn != null:
		var on := (open_drawer == "tools")
		_grp_tools_btn.text = "도구 %s" % ("▼" if on else "▲")
		_grp_tools_btn.add_theme_stylebox_override("normal", _make_panel_style(
			Color(0.34, 0.24, 0.08, 0.96) if on else Color(0.06, 0.14, 0.24, 0.92),
			Color(1.0, 0.84, 0.38, 1.0) if on else Color(0.68, 0.58, 0.32, 0.72), 8, 5))
		_grp_tools_btn.add_theme_color_override("font_color", Color.WHITE if on else Color("ffd36e"))
	if _grp_manage_btn != null:
		var on := (open_drawer == "manage")
		_grp_manage_btn.text = ("도안 %s" if ultra_narrow else "도안·편집 %s") % ("▼" if on else "▲")
		_grp_manage_btn.add_theme_stylebox_override("normal", _make_panel_style(
			Color(0.14, 0.34, 0.44, 0.96) if on else Color(0.06, 0.14, 0.24, 0.92),
			Color(0.50, 0.94, 1.0, 1.0) if on else Color(0.32, 0.72, 0.92, 0.72), 8, 5))
		_grp_manage_btn.add_theme_color_override("font_color", Color.WHITE if on else Color("c8f2ff"))

func _rebuild_palette_buttons() -> void:
	if _palette_grid == null:
		return
	for child in _palette_grid.get_children():
		child.queue_free()
	_part_buttons.clear()

	for cid in _palette_filter_buttons:
		var fb: Button = _palette_filter_buttons[cid]
		var active: bool = (cid == _palette_filter)
		fb.add_theme_stylebox_override("normal", _make_panel_style(
			Color(0.12, 0.38, 0.56, 0.96) if active else Color(0.06, 0.11, 0.18, 0.90),
			Color(0.50, 0.96, 1.0, 1.0) if active else Color(0.30, 0.48, 0.65, 0.55), 7, 4))
		fb.add_theme_color_override("font_color", Color.WHITE if active else Color("b4cee0"))

	var enabled := PartCatalogScript.enabled_entries()
	var selected_still_valid := false
	for item in enabled:
		var kind := str(item.kind)
		if kind == selected_kind:
			selected_still_valid = true
		if _palette_filter != "all" and str(item.category) != _palette_filter:
			continue
		var b := Button.new()
		b.text = str(item.label)
		b.custom_minimum_size = Vector2(0, 56)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.clip_text = true
		b.focus_mode = Control.FOCUS_NONE
		b.mouse_filter = Control.MOUSE_FILTER_PASS
		b.add_theme_font_size_override("font_size", 20)
		b.pressed.connect(func() -> void:
			select_part_kind(kind)
			set_open_drawer(""))
		_palette_grid.add_child(b)
		_part_buttons[kind] = b

	if not selected_still_valid and not enabled.is_empty():
		selected_kind = str(enabled[0].kind)
	if _catalog_btn != null:
		_catalog_btn.text = "목록 편집 (%d/%d)" % [PartCatalogScript.enabled_count(), PartCatalogScript.ENTRIES.size()]
	_refresh_palette_highlights()
	_update_preview_and_stats()

# ==============================================================================
# 모달 1: 도안 저장 / 로드 · 프리셋 함선 (2배 확대 · 100% 가변 반응형)
# ==============================================================================

func _build_blueprint_modal() -> void:
	_blueprint_backdrop = ColorRect.new()
	_blueprint_backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	_blueprint_backdrop.color = Color(0.01, 0.03, 0.07, 0.78)
	_blueprint_backdrop.visible = false
	_ui_layer.add_child(_blueprint_backdrop)

	_blueprint_modal = PanelContainer.new()
	_blueprint_modal.anchor_left = 0.5
	_blueprint_modal.anchor_right = 0.5
	_blueprint_modal.anchor_top = 0.5
	_blueprint_modal.anchor_bottom = 0.5
	if _ui_theme != null:
		_blueprint_modal.theme = _ui_theme
	_blueprint_modal.add_theme_stylebox_override("panel", _make_panel_style(Color(0.04, 0.08, 0.15, 0.98), Color(0.38, 0.86, 1.0, 0.94), 14, 14))
	_blueprint_backdrop.add_child(_blueprint_modal)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 10)
	_blueprint_modal.add_child(root)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 8)
	root.add_child(header)
	var title := Label.new()
	title.text = "도안 저장/로드 · 프리셋"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.clip_text = true
	title.add_theme_font_size_override("font_size", 26)
	title.add_theme_color_override("font_color", Color("8ef8ff"))
	header.add_child(title)

	var reset_btn := _make_ctrl_btn(108, 46, func() -> void:
		reset_ship()
		close_modals(), 20)
	reset_btn.text = "초기함선"
	header.add_child(reset_btn)

	var close_btn := _make_ctrl_btn(80, 46, close_modals, 20)
	close_btn.text = "닫기"
	header.add_child(close_btn)

	var name_row := HBoxContainer.new()
	name_row.add_theme_constant_override("separation", 8)
	root.add_child(name_row)
	var name_lbl := Label.new()
	name_lbl.text = "이름:"
	name_lbl.add_theme_font_size_override("font_size", 22)
	name_lbl.add_theme_color_override("font_color", Color("c8e8ff"))
	name_row.add_child(name_lbl)

	_blueprint_name_input = LineEdit.new()
	_blueprint_name_input.placeholder_text = "저장할 도안 이름 (선택)"
	_blueprint_name_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_blueprint_name_input.custom_minimum_size = Vector2(0, 48)
	_blueprint_name_input.add_theme_font_size_override("font_size", 21)
	name_row.add_child(_blueprint_name_input)

	_blueprint_scroll = FlickScrollScript.new()
	_blueprint_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_blueprint_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(_blueprint_scroll)

	_blueprint_content = VBoxContainer.new()
	_blueprint_content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_blueprint_content.add_theme_constant_override("separation", 9)
	_blueprint_scroll.add_child(_blueprint_content)

func open_blueprint_modal() -> void:
	set_open_drawer("")
	if _catalog_backdrop != null:
		_catalog_backdrop.visible = false
	_rebuild_blueprint_modal_list()
	if _blueprint_backdrop != null:
		_blueprint_backdrop.visible = true
	_sync_responsive_layout()
	call_deferred("_sync_responsive_layout")

func _rebuild_blueprint_modal_list() -> void:
	if _blueprint_content == null:
		return
	for c in _blueprint_content.get_children():
		c.queue_free()

	var sec_presets := Label.new()
	sec_presets.text = "■ 코스모티어 프리셋 함선 (13종)"
	sec_presets.add_theme_font_size_override("font_size", 24)
	sec_presets.add_theme_color_override("font_color", Color("ffd36e"))
	_blueprint_content.add_child(sec_presets)

	for preset in BlueprintLibraryScript.get_presets():
		var pid := str(preset.get("id", ""))
		var pname := str(preset.get("name", pid))
		var pdesc := str(preset.get("desc", ""))
		var pdiag := bool(preset.get("diagonal_45", false))
		var pcount := (preset.get("parts", []) as Array).size()

		var card := PanelContainer.new()
		card.mouse_filter = Control.MOUSE_FILTER_PASS
		card.add_theme_stylebox_override("panel", _make_panel_style(Color(0.06, 0.12, 0.21, 0.94), Color(0.28, 0.65, 0.88, 0.72), 9, 10))
		_blueprint_content.add_child(card)

		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		card.add_child(row)

		var info := VBoxContainer.new()
		info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(info)

		var l1 := Label.new()
		l1.text = "%s · %d파트%s" % [pname, pcount, " · 45°" if pdiag else ""]
		l1.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l1.add_theme_font_size_override("font_size", 22)
		l1.add_theme_color_override("font_color", Color("9ef8ff") if pdiag else Color.WHITE)
		info.add_child(l1)

		var l2 := Label.new()
		l2.text = pdesc
		l2.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l2.add_theme_font_size_override("font_size", 19)
		l2.add_theme_color_override("font_color", Color("a8cce2"))
		info.add_child(l2)

		var load_btn := _make_ctrl_btn(126, 56, func() -> void:
			load_preset(pid)
			close_modals(), 22)
		load_btn.text = "불러오기"
		load_btn.mouse_filter = Control.MOUSE_FILTER_PASS
		load_btn.add_theme_stylebox_override("normal", _make_panel_style(Color(0.10, 0.34, 0.50, 0.96), Color(0.45, 0.94, 1.0, 0.96), 8, 6))
		load_btn.add_theme_color_override("font_color", Color.WHITE)
		row.add_child(load_btn)

	var sec_slots := Label.new()
	sec_slots.text = "■ 내 도안 저장 슬롯 (6칸)"
	sec_slots.add_theme_font_size_override("font_size", 24)
	sec_slots.add_theme_color_override("font_color", Color("8ef8ff"))
	_blueprint_content.add_child(sec_slots)

	for slot in BlueprintLibraryScript.list_slots():
		var idx := int(slot.get("index", 1))
		var filled := bool(slot.get("filled", false))
		var sname := str(slot.get("name", "슬롯 %d" % idx))
		var scount := int(slot.get("part_count", 0))
		var sdiag := bool(slot.get("diagonal_45", false))

		var card := PanelContainer.new()
		card.mouse_filter = Control.MOUSE_FILTER_PASS
		card.add_theme_stylebox_override("panel", _make_panel_style(Color(0.05, 0.10, 0.17, 0.94), Color(0.32, 0.58, 0.78, 0.62), 9, 9))
		_blueprint_content.add_child(card)

		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 6)
		card.add_child(row)

		var lbl := Label.new()
		lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		if filled:
			lbl.text = "[슬롯 %d] %s · %d파트%s" % [idx, sname, scount, " · 45°" if sdiag else ""]
			lbl.add_theme_color_override("font_color", Color("eaf8ff"))
		else:
			lbl.text = "[슬롯 %d] 비어 있음" % idx
			lbl.add_theme_color_override("font_color", Color("7a9ab2"))
		lbl.add_theme_font_size_override("font_size", 21)
		row.add_child(lbl)

		var save_b := _make_ctrl_btn(74, 48, func() -> void:
			var custom := _blueprint_name_input.text if _blueprint_name_input != null else ""
			save_blueprint_slot(idx, custom)
			_rebuild_blueprint_modal_list(), 19)
		save_b.text = "저장"
		save_b.mouse_filter = Control.MOUSE_FILTER_PASS
		save_b.add_theme_stylebox_override("normal", _make_panel_style(Color(0.12, 0.36, 0.24, 0.96), Color(0.45, 0.95, 0.65, 0.92), 7, 5))
		save_b.add_theme_color_override("font_color", Color("c8ffe0"))
		row.add_child(save_b)

		var load_b := _make_ctrl_btn(74, 48, func() -> void:
			if load_blueprint_slot(idx):
				close_modals(), 19)
		load_b.text = "로드"
		load_b.disabled = not filled
		load_b.mouse_filter = Control.MOUSE_FILTER_PASS
		row.add_child(load_b)

		var del_b := _make_ctrl_btn(70, 48, func() -> void:
			BlueprintLibraryScript.delete_slot(idx)
			_status_msg = "도안 슬롯 %d 삭제 완료" % idx
			_update_preview_and_stats()
			_rebuild_blueprint_modal_list(), 19)
		del_b.text = "삭제"
		del_b.disabled = not filled
		del_b.mouse_filter = Control.MOUSE_FILTER_PASS
		row.add_child(del_b)

# ==============================================================================
# 모달 2: 코스모티어 조립 파트 목록표 · 사용 유무 편집모드 (2배 확대 · 가로·세로 무잘림)
# ==============================================================================

func _build_catalog_modal() -> void:
	_catalog_backdrop = ColorRect.new()
	_catalog_backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	_catalog_backdrop.color = Color(0.01, 0.03, 0.07, 0.80)
	_catalog_backdrop.visible = false
	_ui_layer.add_child(_catalog_backdrop)

	_catalog_modal = PanelContainer.new()
	_catalog_modal.anchor_left = 0.5
	_catalog_modal.anchor_right = 0.5
	_catalog_modal.anchor_top = 0.5
	_catalog_modal.anchor_bottom = 0.5
	if _ui_theme != null:
		_catalog_modal.theme = _ui_theme
	_catalog_modal.add_theme_stylebox_override("panel", _make_panel_style(Color(0.04, 0.08, 0.14, 0.98), Color(1.0, 0.82, 0.36, 0.94), 14, 14))
	_catalog_backdrop.add_child(_catalog_modal)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 8)
	_catalog_modal.add_child(root)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 6)
	root.add_child(header)

	_catalog_title_label = Label.new()
	_catalog_title_label.text = "코스모티어 조립 파트 목록표 · 사용 편집"
	_catalog_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_catalog_title_label.clip_text = true
	_catalog_title_label.add_theme_font_size_override("font_size", 25)
	_catalog_title_label.add_theme_color_override("font_color", Color("ffe08c"))
	header.add_child(_catalog_title_label)

	_catalog_summary_label = Label.new()
	_catalog_summary_label.visible = false
	_catalog_summary_label.add_theme_font_size_override("font_size", 20)
	_catalog_summary_label.add_theme_color_override("font_color", Color("8ef8ff"))
	header.add_child(_catalog_summary_label)

	var all_on_btn := _make_ctrl_btn(92, 46, func() -> void:
		PartCatalogScript.set_all_enabled(true)
		_rebuild_palette_buttons()
		_rebuild_catalog_table(), 19)
	all_on_btn.text = "전체사용"
	header.add_child(all_on_btn)

	var def_btn := _make_ctrl_btn(80, 46, func() -> void:
		PartCatalogScript.reset_defaults()
		_rebuild_palette_buttons()
		_rebuild_catalog_table(), 19)
	def_btn.text = "기본값"
	header.add_child(def_btn)

	var close_btn := _make_ctrl_btn(74, 46, close_modals, 19)
	close_btn.text = "닫기"
	header.add_child(close_btn)

	_catalog_filter_grid = GridContainer.new()
	_catalog_filter_grid.columns = 6
	_catalog_filter_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_catalog_filter_grid.add_theme_constant_override("h_separation", 6)
	_catalog_filter_grid.add_theme_constant_override("v_separation", 6)
	root.add_child(_catalog_filter_grid)
	for cat in PartCatalogScript.CATEGORIES:
		var cid := str(cat.id)
		var fb := _make_ctrl_btn(0, 46, func() -> void:
			_catalog_filter = cid
			_rebuild_catalog_table(), 19)
		fb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		fb.text = str(cat.label)
		_catalog_filter_grid.add_child(fb)
		_catalog_filter_buttons[cid] = fb

	_catalog_col_hdr = PanelContainer.new()
	_catalog_col_hdr.add_theme_stylebox_override("panel", _make_panel_style(Color(0.08, 0.14, 0.24, 0.95), Color(0.32, 0.66, 0.88, 0.50), 6, 7))
	root.add_child(_catalog_col_hdr)
	var hrow := HBoxContainer.new()
	hrow.add_theme_constant_override("separation", 10)
	_catalog_col_hdr.add_child(hrow)

	var h_icon := Label.new(); h_icon.text = "외형"; h_icon.custom_minimum_size = Vector2(56, 0); h_icon.add_theme_font_size_override("font_size", 19); h_icon.add_theme_color_override("font_color", Color("8ef8ff")); hrow.add_child(h_icon)
	var h_name := Label.new(); h_name.text = "파트 이름 / 출처"; h_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL; h_name.size_flags_stretch_ratio = 1.4; h_name.add_theme_font_size_override("font_size", 19); h_name.add_theme_color_override("font_color", Color("8ef8ff")); hrow.add_child(h_name)
	var h_cat := Label.new(); h_cat.text = "분류·크기"; h_cat.custom_minimum_size = Vector2(138, 0); h_cat.add_theme_font_size_override("font_size", 19); h_cat.add_theme_color_override("font_color", Color("8ef8ff")); hrow.add_child(h_cat)
	var h_stat := Label.new(); h_stat.text = "주요 성능"; h_stat.size_flags_horizontal = Control.SIZE_EXPAND_FILL; h_stat.size_flags_stretch_ratio = 1.3; h_stat.add_theme_font_size_override("font_size", 19); h_stat.add_theme_color_override("font_color", Color("8ef8ff")); hrow.add_child(h_stat)
	var h_use := Label.new(); h_use.text = "사용 유무"; h_use.custom_minimum_size = Vector2(136, 0); h_use.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; h_use.add_theme_font_size_override("font_size", 19); h_use.add_theme_color_override("font_color", Color("8ef8ff")); hrow.add_child(h_use)

	_catalog_scroll = FlickScrollScript.new()
	_catalog_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_catalog_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(_catalog_scroll)

	_catalog_rows = VBoxContainer.new()
	_catalog_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_catalog_rows.add_theme_constant_override("separation", 7)
	_catalog_scroll.add_child(_catalog_rows)

func open_catalog_modal() -> void:
	set_open_drawer("")
	if _blueprint_backdrop != null:
		_blueprint_backdrop.visible = false
	_rebuild_catalog_table()
	if _catalog_backdrop != null:
		_catalog_backdrop.visible = true
	_sync_responsive_layout()
	call_deferred("_sync_responsive_layout")

func close_modals() -> void:
	if _blueprint_backdrop != null:
		_blueprint_backdrop.visible = false
	if _catalog_backdrop != null:
		_catalog_backdrop.visible = false
	_sync_drawer_visibility()

func _rebuild_catalog_table() -> void:
	if _catalog_rows == null:
		return
	for c in _catalog_rows.get_children():
		c.queue_free()

	if _catalog_summary_label != null:
		_catalog_summary_label.text = "%d/%d" % [PartCatalogScript.enabled_count(), PartCatalogScript.ENTRIES.size()]

	for cid in _catalog_filter_buttons:
		var fb: Button = _catalog_filter_buttons[cid]
		var active: bool = (cid == _catalog_filter)
		fb.add_theme_stylebox_override("normal", _make_panel_style(
			Color(0.12, 0.36, 0.54, 0.96) if active else Color(0.07, 0.11, 0.18, 0.90),
			Color(0.50, 0.96, 1.0, 1.0) if active else Color(0.30, 0.45, 0.62, 0.55), 7, 5))
		fb.add_theme_color_override("font_color", Color.WHITE if active else Color("b4cee0"))

	var vp := get_viewport_rect().size
	var narrow_tbl := vp.x < 960.0 or ModeSwitcherScript.is_portrait_mode
	var eff_w := (vp.x - 20.0) if narrow_tbl else minf(1080.0, vp.x - 24.0)
	var is_wide_table := (not narrow_tbl and eff_w >= 880.0)
	if _catalog_title_label != null:
		var cnt_str := "%d/%d" % [PartCatalogScript.enabled_count(), PartCatalogScript.ENTRIES.size()]
		_catalog_title_label.text = ("파트 목록 편집 (%s)" % cnt_str) if (narrow_tbl or eff_w < 820.0) else ("코스모티어 조립 파트 목록표 · 사용 편집 (%s)" % cnt_str)

	for entry in PartCatalogScript.filtered_entries(_catalog_filter):
		var kind := str(entry.kind)
		var is_on := PartCatalogScript.is_enabled(kind)

		var row_panel := PanelContainer.new()
		row_panel.mouse_filter = Control.MOUSE_FILTER_PASS
		row_panel.add_theme_stylebox_override("panel", _make_panel_style(
			Color(0.06, 0.12, 0.20, 0.95) if is_on else Color(0.05, 0.07, 0.11, 0.80),
			Color(0.30, 0.74, 0.90, 0.62) if is_on else Color(0.28, 0.34, 0.42, 0.44), 8, 7))
		_catalog_rows.add_child(row_panel)

		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		row_panel.add_child(row)

		var thumb := PartThumbCanvas.new()
		thumb.kind = kind
		thumb.custom_minimum_size = Vector2(54, 54)
		thumb.mouse_filter = Control.MOUSE_FILTER_PASS
		row.add_child(thumb)

		var cat_txt := PartCatalogScript.category_label(str(entry.category))
		var sz_txt := PartCatalogScript.footprint_label(kind)
		var stat_txt := PartCatalogScript.stat_summary(kind)

		if is_wide_table:
			var name_box := VBoxContainer.new()
			name_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			name_box.size_flags_stretch_ratio = 1.4
			row.add_child(name_box)
			var l_name := Label.new()
			l_name.text = str(entry.label)
			l_name.clip_text = true
			l_name.add_theme_font_size_override("font_size", 21)
			l_name.add_theme_color_override("font_color", Color.WHITE if is_on else Color("7d8d9e"))
			name_box.add_child(l_name)
			var l_src := Label.new()
			l_src.text = "%s · %s" % [str(entry.source), kind]
			l_src.clip_text = true
			l_src.add_theme_font_size_override("font_size", 17)
			l_src.add_theme_color_override("font_color", Color("7fc8e8") if str(entry.source) == "Cosmoteer" else Color("8fa2b8"))
			name_box.add_child(l_src)

			var l_cat := Label.new()
			l_cat.text = "%s · %s" % [cat_txt, sz_txt]
			l_cat.custom_minimum_size = Vector2(138, 0)
			l_cat.add_theme_font_size_override("font_size", 19)
			l_cat.add_theme_color_override("font_color", Color("ffd36e"))
			row.add_child(l_cat)

			var l_stat := Label.new()
			l_stat.text = stat_txt
			l_stat.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			l_stat.size_flags_stretch_ratio = 1.3
			l_stat.clip_text = true
			l_stat.add_theme_font_size_override("font_size", 19)
			l_stat.add_theme_color_override("font_color", Color("d8ecff") if is_on else Color("7d8d9e"))
			row.add_child(l_stat)
		else:
			var compact_box := VBoxContainer.new()
			compact_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			compact_box.add_theme_constant_override("separation", 3)
			row.add_child(compact_box)

			var l_top := Label.new()
			l_top.text = "%s  [%s · %s]" % [str(entry.label), cat_txt, sz_txt]
			l_top.clip_text = true
			l_top.add_theme_font_size_override("font_size", 21)
			l_top.add_theme_color_override("font_color", Color.WHITE if is_on else Color("8a9aab"))
			compact_box.add_child(l_top)

			var l_bot := Label.new()
			l_bot.text = "%s · %s" % [stat_txt, str(entry.source)]
			l_bot.clip_text = true
			l_bot.add_theme_font_size_override("font_size", 18)
			l_bot.add_theme_color_override("font_color", Color("9ad8f5") if is_on else Color("728294"))
			compact_box.add_child(l_bot)

		var toggle_b := _make_ctrl_btn(132 if is_wide_table else 108, 48, func() -> void:
			var next_state := PartCatalogScript.toggle_enabled(kind)
			_status_msg = "%s: %s" % [str(entry.label), "조립 목록에 표시" if next_state else "조립 목록에서 숨김"]
			_rebuild_palette_buttons()
			_rebuild_catalog_table(), 20 if is_wide_table else 19)
		toggle_b.text = ("사용 (ON)" if is_wide_table else "사용 ON") if is_on else "미사용"
		toggle_b.mouse_filter = Control.MOUSE_FILTER_PASS
		toggle_b.add_theme_stylebox_override("normal", _make_panel_style(
			Color(0.09, 0.38, 0.30, 0.96) if is_on else Color(0.16, 0.18, 0.22, 0.85),
			Color(0.42, 1.0, 0.78, 0.95) if is_on else Color(0.45, 0.50, 0.58, 0.65), 8, 5))
		toggle_b.add_theme_color_override("font_color", Color("b8ffe8") if is_on else Color("98a4b2"))
		row.add_child(toggle_b)

# ==============================================================================
# Undo / Redo · 도안 로드/저장 · 프리셋
# ==============================================================================

func _capture_snapshot() -> Dictionary:
	return {
		"diagonal_45": player.model.diagonal_45,
		"parts": player.model.export_blueprint(),
		"wires": player.model.wires.duplicate(true),
		"cooling_pipes": player.model.cooling_pipes.duplicate(true),
		"bulkheads": player.model.bulkheads.duplicate(true),
	}

func _push_undo_snapshot(snap: Dictionary) -> void:
	_undo_stack.append(snap)
	if _undo_stack.size() > MAX_UNDO_HISTORY:
		_undo_stack.pop_front()
	_redo_stack.clear()
	_sync_history_buttons()

func _apply_snapshot(snap: Dictionary) -> void:
	var raw_parts: Array = snap.get("parts", [])
	var typed := BlueprintLibraryScript.to_typed_blueprint(raw_parts)
	if typed.is_empty():
		return
	player.model.diagonal_45 = bool(snap.get("diagonal_45", false))
	player.model.restore_from_blueprint(typed)
	var snap_wires := BlueprintLibraryScript.to_wires_dict(snap.get("wires", []))
	if not snap_wires.is_empty():
		player.model.wires = snap_wires
	else:
		player.model.wires.clear()
	var snap_pipes := BlueprintLibraryScript.to_cooling_pipes_dict(snap.get("cooling_pipes", []))
	player.model.cooling_pipes = snap_pipes
	var snap_bh := BlueprintLibraryScript.to_bulkheads_dict(snap.get("bulkheads", []))
	player.model.bulkheads = snap_bh
	_apply_ship_build_rotation()
	_refresh_ship()
	if player.interior != null:
		player.interior.attach_model(player.model, true)
		if not snap_wires.is_empty():
			player.show_power_overlay = true
	if camera != null:
		fit_camera_to_ship()
	ShipModel.save_player_blueprint(player.model)
	_sync_toggle_buttons()
	_sync_history_buttons()
	_update_preview_and_stats()

func undo() -> bool:
	if _undo_stack.is_empty():
		_status_msg = "되돌릴 기록이 없습니다"
		_update_preview_and_stats()
		return false
	_redo_stack.append(_capture_snapshot())
	var prev: Dictionary = _undo_stack.pop_back()
	_apply_snapshot(prev)
	_status_msg = "되돌리기 완료 (남은 UNDO: %d)" % _undo_stack.size()
	_update_preview_and_stats()
	return true

func redo() -> bool:
	if _redo_stack.is_empty():
		_status_msg = "다시실행할 기록이 없습니다"
		_update_preview_and_stats()
		return false
	_undo_stack.append(_capture_snapshot())
	var nxt: Dictionary = _redo_stack.pop_back()
	_apply_snapshot(nxt)
	_status_msg = "다시실행 완료 (남은 REDO: %d)" % _redo_stack.size()
	_update_preview_and_stats()
	return true

func save_blueprint_slot(slot_index: int, display_name: String = "") -> Dictionary:
	var saved := BlueprintLibraryScript.save_slot(slot_index, display_name, player.model)
	ShipModel.save_player_blueprint(player.model)
	_status_msg = "도안 저장 완료: [슬롯 %d] %s (%d파트)" % [slot_index, str(saved.get("name", "")), player.model.parts.size()]
	_update_preview_and_stats()
	return saved

func load_blueprint_slot(slot_index: int) -> bool:
	var data := BlueprintLibraryScript.load_slot(slot_index)
	if data.is_empty():
		return false
	_push_undo_snapshot(_capture_snapshot())
	_apply_snapshot(data)
	_status_msg = "도안 로드 완료: [슬롯 %d] %s" % [slot_index, str(data.get("name", ""))]
	_update_preview_and_stats()
	return true

func load_preset(preset_id: String) -> bool:
	var preset := BlueprintLibraryScript.get_preset_by_id(preset_id)
	if preset.is_empty():
		return false
	_push_undo_snapshot(_capture_snapshot())
	_apply_snapshot(preset)
	_status_msg = "프리셋 로드 완료: %s" % str(preset.get("name", preset_id))
	_update_preview_and_stats()
	return true

func _sync_history_buttons() -> void:
	var can_undo := not _undo_stack.is_empty()
	var can_redo := not _redo_stack.is_empty()
	if _bottom_undo_btn != null:
		_bottom_undo_btn.text = "UNDO\n(%d)" % _undo_stack.size()
		_bottom_undo_btn.disabled = not can_undo
	if _bottom_redo_btn != null:
		_bottom_redo_btn.text = "REDO\n(%d)" % _redo_stack.size()
		_bottom_redo_btn.disabled = not can_redo

# ==============================================================================
# 조립 제어 동작
# ==============================================================================

func _sync_toggle_buttons() -> void:
	var is_diag := player != null and player.model != null and player.model.diagonal_45
	var sym_style := _make_panel_style(
		Color(0.08, 0.32, 0.44, 0.95) if symmetry_enabled else Color(0.14, 0.17, 0.22, 0.85),
		Color(0.45, 0.96, 1.0, 0.95) if symmetry_enabled else Color(0.45, 0.52, 0.62, 0.65), 7, 4)
	if _symmetry_btn != null:
		_symmetry_btn.text = "대칭 모드: ON (M)" if symmetry_enabled else "대칭 모드: OFF (M)"
		_symmetry_btn.add_theme_stylebox_override("normal", sym_style)
		_symmetry_btn.add_theme_color_override("font_color", Color("8ef8ff") if symmetry_enabled else Color("b4c2d0"))
	if _bottom_sym_btn != null:
		_bottom_sym_btn.text = "대칭\nON" if symmetry_enabled else "대칭\nOFF"
		_bottom_sym_btn.add_theme_stylebox_override("normal", sym_style)
		_bottom_sym_btn.add_theme_color_override("font_color", Color("8ef8ff") if symmetry_enabled else Color("b4c2d0"))

	var diag_style := _make_panel_style(
		Color(0.32, 0.22, 0.08, 0.95) if is_diag else Color(0.14, 0.17, 0.22, 0.85),
		Color(1.0, 0.80, 0.35, 0.95) if is_diag else Color(0.45, 0.52, 0.62, 0.65), 7, 4)
	if _diagonal_btn != null:
		_diagonal_btn.text = "45° 기울기: ON" if is_diag else "45° 기울기: OFF"
		_diagonal_btn.add_theme_stylebox_override("normal", diag_style)
		_diagonal_btn.add_theme_color_override("font_color", Color("ffd36e") if is_diag else Color("b4c2d0"))
	if _bottom_diag_btn != null:
		_bottom_diag_btn.text = "45°\nON" if is_diag else "45°\nOFF"
		_bottom_diag_btn.add_theme_stylebox_override("normal", diag_style)
		_bottom_diag_btn.add_theme_color_override("font_color", Color("ffd36e") if is_diag else Color("b4c2d0"))

	if _remove_btn != null:
		_remove_btn.text = "제거 모드: ON (클릭 제거)" if remove_mode else "제거 모드: OFF"
		_remove_btn.modulate = Color("ff9a9a") if remove_mode else Color.WHITE
	if _flight_btn != null:
		_flight_btn.text = "시험비행 종료" if test_flight_active else "시험비행: OFF"
		_flight_btn.modulate = Color("8effb8") if test_flight_active else Color.WHITE

func select_part_kind(kind: String) -> void:
	selected_kind = kind
	remove_mode = false
	_sync_toggle_buttons()
	_refresh_palette_highlights()
	_status_msg = "선택: %s · 회전 후 초록 소켓을 터치하여 설치" % kind
	_update_preview_and_stats()

func rotate_part() -> void:
	quarter_turn = posmod(quarter_turn + 1, 4)
	var deg := quarter_turn * 90
	if floating_rotate_btn != null:
		floating_rotate_btn.text = "회전\n%d° (Q)" % deg
	_status_msg = "회전: %d°" % deg
	_update_preview_and_stats()
	queue_redraw()

func toggle_symmetry() -> void:
	symmetry_enabled = not symmetry_enabled
	_sync_toggle_buttons()
	_status_msg = "대칭 모드 ON · 양쪽 동시 설치/제거" if symmetry_enabled else "대칭 모드 OFF · 단일 파트 설치"
	_update_preview_and_stats()
	queue_redraw()

func toggle_diagonal_45() -> void:
	if player == null or player.model == null:
		return
	_push_undo_snapshot(_capture_snapshot())
	player.model.diagonal_45 = not player.model.diagonal_45
	_apply_ship_build_rotation()
	ShipModel.save_player_blueprint(player.model)
	_sync_toggle_buttons()
	_status_msg = "45° 대각선 함체 모드 ON (도안 저장)" if player.model.diagonal_45 else "0° 정면 함체 모드 복귀 (도안 저장)"
	_update_preview_and_stats()
	queue_redraw()

func toggle_remove_mode() -> void:
	remove_mode = not remove_mode
	_sync_toggle_buttons()
	_refresh_palette_highlights()
	_status_msg = "제거 모드 · 제거할 파트를 터치하세요 (대칭 연동)" if remove_mode else "설치 모드 · 초록 소켓을 터치하세요"
	_update_preview_and_stats()
	queue_redraw()

func toggle_test_flight() -> void:
	test_flight_active = not test_flight_active
	player.freeze = not test_flight_active
	if not test_flight_active:
		player.linear_velocity = Vector2.ZERO
		player.angular_velocity = 0.0
		player.position = Vector2.ZERO
		_apply_ship_build_rotation()
		camera.offset = Vector2(0.0, 6.0)
	else:
		camera.offset = Vector2.ZERO
	_sync_toggle_buttons()
	_status_msg = "시험비행 중 · WASD/QE로 추력 테스트" if test_flight_active else "조립 모드 복귀 · 도안 자동 저장"
	_update_preview_and_stats()

func reset_ship() -> void:
	_push_undo_snapshot(_capture_snapshot())
	player.model.diagonal_45 = false
	player.model.initialize_default_player()
	_apply_ship_build_rotation()
	_refresh_ship()
	ShipModel.save_player_blueprint(player.model)
	_sync_toggle_buttons()
	_status_msg = "초기 함선 도안 복원 완료 (15파트)"
	_update_preview_and_stats()

func _refresh_palette_highlights() -> void:
	for k in _part_buttons:
		var b: Button = _part_buttons[k]
		var active: bool = (not remove_mode and k == selected_kind)
		b.modulate = Color("8ef8ff") if active else Color.WHITE

func _update_preview_and_stats() -> void:
	var is_diag := player != null and player.model != null and player.model.diagonal_45
	if part_preview != null:
		part_preview.set_part(selected_kind, quarter_turn, is_diag)
	if _stats_label == null or player == null:
		return
	var fwd_thrust := 0.0
	var sum_hp := 0.0
	for p in player.model.parts:
		sum_hp += p.max_hp
		if str(p.spec().get("actuator", "")) == "forward":
			fwd_thrust += player.effective_module_thrust(p)
	if _selected_title_label != null:
		var mode_tag := "제거 모드" if remove_mode else ("시험비행" if test_flight_active else "조립 모드")
		_selected_title_label.text = "COSMOTEER BUILD · %s%s" % [mode_tag, " · 45°" if is_diag else ""]
	_stats_label.text = "파츠 %d개 | 질량 %.1f | 추력 %.0f | 전력 %.0f%% | 방어막 %d층 | HP %.0f" % [
		player.model.parts.size(),
		player.model.total_mass(),
		fwd_thrust,
		player.model.power_efficiency() * 100.0,
		player.model.shield_capacity(),
		sum_hp
	]
	_status_label.text = _status_msg

func _get_cached_candidates(probe: PartData) -> Array[Vector2i]:
	if player == null or player.model == null:
		return []
	player.model._ensure_index()
	if _cached_cand_rev == player.model.revision and _cached_cand_kind == probe.kind and _cached_cand_turn == probe.quarter_turn:
		return _cached_candidates
	_cached_cand_rev = player.model.revision
	_cached_cand_kind = probe.kind
	_cached_cand_turn = probe.quarter_turn
	_cached_candidates = player.model.attachment_candidates(probe)
	_cached_candidate_set.clear()
	for cc in _cached_candidates:
		_cached_candidate_set[cc] = true
	return _cached_candidates

func _nearest_valid_socket(world_pos: Vector2, probe: PartData, snap_radius_px: float) -> Vector2i:
	var direct := player.local_cell_at(world_pos)
	if player.model.can_place(probe, direct):
		return direct
	var best_cell := direct
	var best_sq := snap_radius_px * snap_radius_px
	for cand in _get_cached_candidates(probe):
		var cand_world := player.to_global(Vector2(cand) * BalanceData.CELL)
		var d_sq := cand_world.distance_squared_to(world_pos)
		if d_sq <= best_sq:
			best_sq = d_sq
			best_cell = cand
	return best_cell

func try_interact_world(world_pos: Vector2, is_right_click: bool = false, is_touch: bool = false) -> bool:
	if test_flight_active or is_modal_open():
		return false
	var is_diag := player.model.diagonal_45
	var cell := player.local_cell_at(world_pos)
	if remove_mode or is_right_click:
		var existing := player.model.part_at(cell)
		if existing != null and existing.kind != "core":
			var before_snap := _capture_snapshot()
			var mirror_c := ShipModel.mirror_cell(cell, is_diag)
			player.model.remove(existing.uid)
			if symmetry_enabled and mirror_c != cell:
				var twin := player.model.part_at(mirror_c)
				if twin != null and twin.kind != "core":
					player.model.remove(twin.uid)
			player.model.detach_disconnected()
			_push_undo_snapshot(before_snap)
			_refresh_ship()
			ShipModel.save_player_blueprint(player.model)
			_status_msg = "파츠 제거 완료 (%s) · 도안 저장" % existing.kind
			_update_preview_and_stats()
			return true
		_status_msg = "코어는 제거할 수 없거나 빈 칸입니다"
		_update_preview_and_stats()
		return false

	var probe := player.model.make_part(selected_kind, Vector2i.ZERO, quarter_turn)
	var snap_cell := _nearest_valid_socket(world_pos, probe, BalanceData.CELL * (0.95 if is_touch else 0.55))
	var before_attach := _capture_snapshot()
	if player.model.attach(probe, snap_cell):
		var mirrored_ok := false
		if symmetry_enabled:
			var m_info := ShipModel.mirrored_placement(probe, snap_cell, is_diag)
			var m_cell: Vector2i = m_info.cell
			var m_turn: int = int(m_info.turn)
			var m_probe := player.model.make_part(selected_kind, Vector2i.ZERO, m_turn)
			if player.model.can_place(m_probe, m_cell):
				mirrored_ok = player.model.attach(m_probe, m_cell)
		_push_undo_snapshot(before_attach)
		_refresh_ship()
		ShipModel.save_player_blueprint(player.model)
		_status_msg = "대칭 설치 완료: %s · 도안 저장" % selected_kind if mirrored_ok else "설치 완료: %s (%d, %d) · 도안 저장" % [selected_kind, snap_cell.x, snap_cell.y]
		_update_preview_and_stats()
		return true
	if player.model.would_block_exhaust(probe, snap_cell):
		_status_msg = "설치 불가 · 추진기 배기 간섭! 회전 버튼으로 방향을 바꾸세요"
	else:
		_status_msg = "설치 불가 · 초록색 설치 가능 위치를 터치하세요"
	_update_preview_and_stats()
	return false

func _refresh_ship() -> void:
	player.refresh_mass()
	player.shield_layers = player.model.shield_capacity()
	player.rebuild_exhaust_particles()
	player.rebuild_voxel_renderer()
	player.queue_redraw()
	queue_redraw()

func is_modal_open() -> bool:
	return (_blueprint_backdrop != null and _blueprint_backdrop.visible) or (_catalog_backdrop != null and _catalog_backdrop.visible)

func _is_on_ui(screen_pos: Vector2) -> bool:
	if is_modal_open():
		return true
	for ctrl in [_left_bottom_panel, _bottom_action_panel, _zoom_panel, _drawer_parts, _drawer_tools, _drawer_manage]:
		if ctrl != null and ctrl.visible and ctrl.get_global_rect().has_point(screen_pos):
			return true
	if mode_switcher != null and mode_switcher.is_point_inside(screen_pos):
		return true
	return false

func _viewport_to_world(screen_pos: Vector2) -> Vector2:
	return get_viewport().get_canvas_transform().affine_inverse() * screen_pos

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouse and event.device == -1:
		return
	if event is InputEventKey and event.pressed and not event.echo:
		var ke := event as InputEventKey
		if ke.keycode == KEY_ESCAPE:
			if is_modal_open():
				close_modals()
				return
			if not open_drawer.is_empty():
				set_open_drawer("")
				return
		if is_modal_open():
			return
		if ke.keycode == KEY_Z and (ke.ctrl_pressed or not ke.shift_pressed):
			if ke.ctrl_pressed and ke.shift_pressed:
				redo()
			else:
				undo()
			return
		if ke.keycode == KEY_Y:
			redo()
			return
		if ke.keycode == KEY_Q:
			rotate_part()
		elif ke.keycode == KEY_M:
			toggle_symmetry()
		elif ke.keycode == KEY_X:
			toggle_remove_mode()
		elif ke.keycode == KEY_F:
			fit_camera_to_ship()
		elif ke.is_action_pressed("zoom_in") or ke.keycode == KEY_EQUAL:
			set_camera_zoom(camera.zoom.x * 1.15)
		elif ke.is_action_pressed("zoom_out") or ke.keycode == KEY_MINUS:
			set_camera_zoom(camera.zoom.x / 1.15)
	elif event is InputEventMagnifyGesture and not is_modal_open():
		set_camera_zoom(camera.zoom.x * (event as InputEventMagnifyGesture).factor)
	elif event is InputEventMouseMotion and not test_flight_active and not is_modal_open():
		var need_redraw := false
		if _pan_dragging:
			camera.offset -= (event as InputEventMouseMotion).relative / maxf(0.14, camera.zoom.x)
			need_redraw = true
		var next_hover := player.local_cell_at(_viewport_to_world(event.position))
		if next_hover != _hover_cell:
			_hover_cell = next_hover
			need_redraw = true
		if need_redraw:
			queue_redraw()
	elif event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_MIDDLE:
			_pan_dragging = mb.pressed
			return
		if not mb.pressed:
			return
		if _is_on_ui(mb.position):
			return
		if not open_drawer.is_empty():
			set_open_drawer("")
			return
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			set_camera_zoom(camera.zoom.x * 1.14)
			return
		if mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			set_camera_zoom(camera.zoom.x / 1.14)
			return
		if mb.button_index == MOUSE_BUTTON_LEFT:
			try_interact_world(_viewport_to_world(mb.position), false, false)
		elif mb.button_index == MOUSE_BUTTON_RIGHT:
			try_interact_world(_viewport_to_world(mb.position), true, false)
	elif event is InputEventScreenTouch:
		var st := event as InputEventScreenTouch
		if st.pressed:
			if _is_on_ui(st.position):
				return
			_touch_points[st.index] = st.position
			if _touch_points.size() == 2:
				var pts := _touch_points.values()
				_pinch_prev_dist = (pts[0] as Vector2).distance_to(pts[1] as Vector2)
				return
			if not open_drawer.is_empty():
				set_open_drawer("")
				return
			var world_pos := _viewport_to_world(st.position)
			_hover_cell = player.local_cell_at(world_pos)
			try_interact_world(world_pos, false, true)
		else:
			_touch_points.erase(st.index)
			if _touch_points.size() < 2:
				_pinch_prev_dist = 0.0
	elif event is InputEventScreenDrag and _touch_points.size() >= 2 and not is_modal_open():
		var sd := event as InputEventScreenDrag
		if _touch_points.has(sd.index):
			_touch_points[sd.index] = sd.position
			var pts := _touch_points.values()
			var dist := (pts[0] as Vector2).distance_to(pts[1] as Vector2)
			if _pinch_prev_dist > 8.0 and dist > 8.0:
				set_camera_zoom(camera.zoom.x * (dist / _pinch_prev_dist))
			_pinch_prev_dist = dist
			camera.offset -= sd.relative * 0.5 / maxf(0.14, camera.zoom.x)

func _physics_process(_delta: float) -> void:
	if test_flight_active:
		var fwd := Input.get_axis("thrust_reverse", "thrust_forward")
		var turn := Input.get_axis("turn_left", "turn_right")
		var strafe := Input.get_axis("strafe_left", "strafe_right")
		player.apply_player_thrusters(maxf(fwd, 0.0), maxf(-fwd, 0.0), turn, strafe)
		camera.global_position = player.global_position
		queue_redraw()
	elif camera.global_position != player.global_position:
		camera.global_position = player.global_position
		queue_redraw()

func _draw_ghost_part(probe: PartData, at_cell: Vector2i, tint_alpha: float) -> void:
	var half := BalanceData.CELL * 0.5
	var spec := probe.spec()
	var fill_col := Color(str(spec.get("fill", "334661")), 0.65 * tint_alpha)
	var stroke_col := Color(str(spec.get("stroke", "a9bed9")), 0.95 * tint_alpha)
	var ghost := probe.duplicate_part()
	ghost.cell = at_cell
	for pc in ghost.cells():
		var prect := Rect2(Vector2(pc) * BalanceData.CELL - Vector2.ONE * (half * 0.92), Vector2.ONE * (BalanceData.CELL * 0.92))
		draw_rect(prect, fill_col, true)
		draw_rect(prect, stroke_col, false, 2.2)

func _draw() -> void:
	if player == null or test_flight_active:
		return
	var origin := player.global_position
	var span_r := maxf(player.hull_bound_radius + 54.0, 172.0)

	# 1) 전방 표시
	var nose_tip := origin + Vector2(0.0, -span_r - 22.0)
	draw_dashed_line(origin + Vector2(0.0, -span_r + 18.0), nose_tip, Color(0.45, 0.96, 1.0, 0.85), 2.0, 8.0)
	for offset_y in [0.0, 16.0]:
		var tip := nose_tip + Vector2(0.0, offset_y)
		var chevron := PackedVector2Array([
			tip + Vector2(-20.0, 15.0),
			tip,
			tip + Vector2(20.0, 15.0),
		])
		draw_polyline(chevron, Color("6ef2ff") if offset_y == 0.0 else Color("ffd36e"), 3.2)
	var font := _ui_font if _ui_font != null else ThemeDB.fallback_font
	if font != null:
		var fwd_label := "전방 (FORWARD · 45°)" if player.model.diagonal_45 else "전방 (FORWARD)"
		var badge_pos := nose_tip + Vector2(28.0, -4.0)
		var badge_rect := Rect2(badge_pos, Vector2(252.0, 38.0))
		draw_rect(badge_rect, Color(0.03, 0.10, 0.18, 0.92), true)
		draw_rect(badge_rect, Color(0.42, 0.92, 1.0, 0.88), false, 1.8)
		draw_string(font, badge_pos + Vector2(12.0, 26.0), fwd_label, HORIZONTAL_ALIGNMENT_LEFT, 230.0, 21, Color("9ef8ff"))

	# 2) 대칭선 표시
	if symmetry_enabled:
		draw_dashed_line(origin + Vector2(0.0, -span_r + 14.0), origin + Vector2(0.0, span_r + 16.0), Color(1.0, 0.82, 0.35, 0.72), 2.0, 10.0)

	# 3) 설치 가능 소켓 및 호버/대칭 고스트 미리보기
	var half := BalanceData.CELL * 0.5
	draw_set_transform(player.global_position, player.global_rotation)
	if not remove_mode:
		var probe := PartData.new(0, selected_kind, Vector2i.ZERO, quarter_turn)
		var candidates := _get_cached_candidates(probe)
		for cell in candidates:
			var rect := Rect2(Vector2(cell) * BalanceData.CELL - Vector2.ONE * half, Vector2.ONE * BalanceData.CELL)
			var is_hover := (cell == _hover_cell)
			draw_rect(rect, Color(0.24, 0.92, 0.62, 0.30 if is_hover else 0.14), true)
			draw_rect(rect, Color(0.45, 1.0, 0.78, 0.95 if is_hover else 0.58), false, 2.2 if is_hover else 1.2)
		if _cached_candidate_set.has(_hover_cell):
			_draw_ghost_part(probe, _hover_cell, 1.0)
			if symmetry_enabled:
				var m_info := ShipModel.mirrored_placement(probe, _hover_cell, player.model.diagonal_45)
				var m_probe := PartData.new(0, selected_kind, Vector2i.ZERO, int(m_info.turn))
				if player.model.can_place(m_probe, m_info.cell):
					_draw_ghost_part(m_probe, m_info.cell, 0.75)
	else:
		for p in player.model.parts:
			if p.kind == "core":
				continue
			for cell in p.cells():
				var rect := Rect2(Vector2(cell) * BalanceData.CELL - Vector2.ONE * half, Vector2.ONE * BalanceData.CELL)
				draw_rect(rect, Color(1.0, 0.35, 0.35, 0.18), true)
				draw_rect(rect, Color(1.0, 0.45, 0.45, 0.75), false, 1.4)
	draw_set_transform(Vector2.ZERO, 0.0)
