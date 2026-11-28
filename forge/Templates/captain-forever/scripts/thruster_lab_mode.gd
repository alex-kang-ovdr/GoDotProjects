class_name ThrusterLabMode
extends Node2D

## 추진기 연료 · 전력 · 발열 실험실 모드 (2배 확대 UI·폰트 및 가로·세로 무클리핑 배치).

const ModeSwitcherScript = preload("res://scripts/mode_switcher.gd")
const FlickScrollScript = preload("res://scripts/flick_scroll_container.gd")
const FtlCrew = preload("res://scripts/ftl_crew_assets.gd")
const UiTheme = preload("res://scripts/ui_scale_theme.gd")

const SURFACE := Color(0.05, 0.11, 0.18, 0.96)
const EDGE := Color(0.24, 0.62, 0.84, 0.88)
const WHITE := Color("#e4f4ff")
const SOFT := Color("#9ec4da")
const GREEN := Color("#74f2ce")
const GOLD := Color("#ffd175")
const RED := Color("#ff6e66")
const CYAN := Color("#5ce1ff")

const THRUSTER_ROSTER := [
	{
		"id": "cosmo_thruster_small",
		"name": "소형 추진기 (COSMO S)",
		"role": "경량 기동 · 저전력 · 저발열",
		"base_thrust_n": 4400.0,
		"power_w": 110.0,
		"fuel_rate": 1.4,
		"heat_rate": 6.5,
		"size_cells": Vector2(1, 1),
	},
	{
		"id": "cosmo_thruster_med",
		"name": "중형 추진기 (COSMO M)",
		"role": "표준 주력 순항 · 균형 연비",
		"base_thrust_n": 7400.0,
		"power_w": 200.0,
		"fuel_rate": 2.4,
		"heat_rate": 10.5,
		"size_cells": Vector2(2, 1),
	},
	{
		"id": "cosmo_thruster_large",
		"name": "대형 추진기 (COSMO L)",
		"role": "초대형 주추진 · 고출력 · 고발열",
		"base_thrust_n": 12400.0,
		"power_w": 340.0,
		"fuel_rate": 4.2,
		"heat_rate": 16.5,
		"size_cells": Vector2(2, 2),
	},
	{
		"id": "cosmo_thruster_boost",
		"name": "부스트 추진기 (AFTERBURN)",
		"role": "급가속 애프터버너 · 과열 주의",
		"base_thrust_n": 10200.0,
		"power_w": 340.0,
		"fuel_rate": 5.8,
		"heat_rate": 21.0,
		"size_cells": Vector2(2, 1),
	},
	{
		"id": "cosmo_thruster_2way",
		"name": "2방향 자세제어 (2-WAY)",
		"role": "양방향 벡터 기동 · 정밀 회전",
		"base_thrust_n": 6400.0,
		"power_w": 140.0,
		"fuel_rate": 1.8,
		"heat_rate": 7.8,
		"size_cells": Vector2(1, 1),
	},
	{
		"id": "cosmo_engine_room",
		"name": "엔진룸 통합 추진단 (2x2)",
		"role": "인접 추진기 +50% 증폭 · 보조 발전",
		"base_thrust_n": 8800.0,
		"power_w": 160.0,
		"fuel_rate": 2.9,
		"heat_rate": 13.0,
		"size_cells": Vector2(2, 2),
	},
	{
		"id": "thruster",
		"name": "기본 주 추진기 (MAIN)",
		"role": "범용 플라즈마 노즐 · 안정 추력",
		"base_thrust_n": 4750.0,
		"power_w": 110.0,
		"fuel_rate": 1.6,
		"heat_rate": 7.2,
		"size_cells": Vector2(1, 1),
	},
	{
		"id": "reverse_thruster",
		"name": "역추진 제동기 (REV)",
		"role": "전방 급제동 노즐 · 저연료 소모",
		"base_thrust_n": 4750.0,
		"power_w": 95.0,
		"fuel_rate": 1.3,
		"heat_rate": 6.0,
		"size_cells": Vector2(1, 1),
	},
]

const SLIDER_SPECS := [
	["throttle_pct", "스로틀 출력", 0.0, 150.0, 5.0, "%.0f%%"],
	["fuel_mix", "연료 분사율", 0.5, 2.5, 0.1, "%.1f×"],
	["power_volt", "전력 인가율", 50.0, 150.0, 5.0, "%.0f%%"],
	["coolant_rate", "냉각 유량", 0.0, 200.0, 10.0, "%.0f%%"],
	["fuel_cap_kg", "연료통 용량", 60.0, 600.0, 20.0, "%.0fkg"],
	["ambient_c", "외부 온도", -40.0, 80.0, 5.0, "%.0f°C"],
]

class ThrusterBenchCanvas extends Control:
	var host: ThrusterLabMode = null

	func _ready() -> void:
		clip_contents = true
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		custom_minimum_size = Vector2(0, 175)

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color("#050d17"), true)
		if host == null or size.x < 20.0 or size.y < 20.0:
			return
		var font: Font = host._ui_font if host._ui_font != null else ThemeDB.fallback_font
		var cy := size.y * 0.56
		var gx := 0.0
		while gx < size.x:
			draw_line(Vector2(gx, 0.0), Vector2(gx, size.y), Color("#112638"), 1.0)
			gx += 40.0
		for gy_off in [-72.0, -36.0, 0.0, 36.0, 72.0]:
			var y := cy + float(gy_off)
			if y > 4.0 and y < size.y - 4.0:
				draw_line(Vector2(0.0, y), Vector2(size.x, y), Color("#1c3d56") if absf(float(gy_off)) < 1.0 else Color("#112638"), 1.0)

		var rig_x := clampf(size.x * 0.13, 52.0, 118.0)
		var noz_x := clampf(size.x * 0.47, 205.0, 390.0)
		var mid_x := (rig_x + noz_x) * 0.5

		# 1. Fuel Tank + Fuel Feed Pipe & Droplets
		var tank_r := Rect2(Vector2(rig_x - 34.0, cy - 66.0), Vector2(68.0, 52.0))
		draw_rect(tank_r, Color("#18293a"), true)
		var fill_r := clampf(host.fuel_kg / maxf(1.0, float(host.params.fuel_cap_kg)), 0.0, 1.0)
		draw_rect(Rect2(Vector2(tank_r.position.x + 4.0, tank_r.end.y - 4.0 - 44.0 * fill_r), Vector2(60.0, 44.0 * fill_r)), Color("#ff9d3b", 0.85), true)
		draw_rect(tank_r, Color("#ffbd66"), false, 2.0)
		var fuel_p0 := Vector2(tank_r.end.x, cy - 40.0)
		var fuel_p1 := Vector2(noz_x - 30.0, cy - 18.0)
		draw_line(fuel_p0, Vector2(mid_x, cy - 40.0), Color("#ff9d3b", 0.80), 3.4)
		draw_line(Vector2(mid_x, cy - 40.0), fuel_p1, Color("#ff9d3b", 0.80), 3.4)
		if host.firing and host.fuel_kg > 0.1 and float(host.params.throttle_pct) > 1.0:
			for fi in 4:
				var ft := fmod(host.sim_time * 1.8 + float(fi) * 0.25, 1.0)
				var fp := fuel_p0.lerp(Vector2(mid_x, cy - 40.0), ft * 2.0) if ft < 0.5 else Vector2(mid_x, cy - 40.0).lerp(fuel_p1, (ft - 0.5) * 2.0)
				draw_circle(fp, 4.2, Color("#ffd466"))

		# 2. ONI Reactor Power Bus + Engine Room Module
		var rct_r := Rect2(Vector2(rig_x - 34.0, cy + 12.0), Vector2(68.0, 52.0))
		draw_rect(rct_r, Color("#15323c"), true)
		var rtex := CosmoteerAssets.get_part_texture("cosmo_reactor_small", "cutaway")
		if rtex != null:
			draw_texture_rect(rtex, rct_r.grow(-3.0), false, Color.WHITE if host.power_on else Color(0.4, 0.4, 0.4))
		draw_rect(rct_r, GREEN if host.power_on else RED, false, 2.0)
		var wire_col := Color("#ffd466") if host.power_on else Color("#5c3232")
		var wp0 := Vector2(rct_r.end.x, cy + 38.0)
		var wp1 := Vector2(mid_x, cy + 38.0)
		var wp2 := Vector2(noz_x - 30.0, cy + 16.0)
		draw_line(wp0, wp1, wire_col, 3.8)
		draw_line(wp1, wp2, wire_col, 3.8)
		if host.power_on:
			var pwr_spd := 0.9 + float(host.params.power_volt) / 135.0
			for ei in 4:
				var et := fmod(host.sim_time * pwr_spd + float(ei) * 0.25, 1.0)
				var ep := wp0.lerp(wp1, et * 2.0) if et < 0.5 else wp1.lerp(wp2, (et - 0.5) * 2.0)
				var edir := (wp1 - wp0).normalized() if et < 0.5 else (wp2 - wp1).normalized()
				draw_line(ep - edir * 8.0, ep, Color(0.40, 0.96, 1.0, 0.55), 3.0)
				draw_circle(ep, 4.8, Color("#66f6ff"))
				draw_circle(ep, 3.0, Color("#ffe86e"))
				draw_circle(ep, 1.8, Color.WHITE)

		var er_r := Rect2(Vector2(mid_x - 28.0, cy - 28.0), Vector2(56.0, 56.0))
		draw_rect(er_r, Color("#1b3a4b") if host.engine_room_boost else Color("#12202c"), true)
		var ertex := CosmoteerAssets.get_part_texture("cosmo_engine_room", "cutaway")
		if ertex != null:
			draw_texture_rect(ertex, er_r.grow(-2.0), false, Color.WHITE if host.engine_room_boost else Color(0.45, 0.5, 0.55))
		draw_rect(er_r, CYAN if host.engine_room_boost else Color("#3c5a70"), false, 2.2 if host.engine_room_boost else 1.4)
		FtlCrew.draw_crew_sprite(self, er_r.get_center(), "engi", "man" if host.engine_room_boost else "idle", Vector2.RIGHT, host.sim_time, true, 1.0, false, 30.0)

		# 3. ONI Liquid Cooling Loop & Flowing Coolant Droplets
		var cool_r := Rect2(Vector2(noz_x - 28.0, cy - 80.0), Vector2(56.0, 36.0))
		draw_rect(cool_r, Color("#10384f") if host.cooler_on else Color("#18222c"), true)
		draw_rect(cool_r, Color("#42f5ff") if host.cooler_on else Color("#465a6b"), false, 2.0)
		var loop_pts: Array[Vector2] = [
			cool_r.get_center(),
			Vector2(noz_x + 30.0, cy - 62.0),
			Vector2(noz_x + 30.0, cy - 22.0),
			Vector2(noz_x - 30.0, cy - 22.0),
			Vector2(noz_x - 30.0, cy - 62.0),
		]
		for li in loop_pts.size():
			var lp_a := loop_pts[li]
			var lp_b := loop_pts[(li + 1) % loop_pts.size()]
			draw_line(lp_a, lp_b, Color(0.24, 0.88, 1.0, 0.82 if host.cooler_on else 0.25), 3.0)
		if host.cooler_on and float(host.params.coolant_rate) > 1.0:
			for ci in 5:
				var ct := fmod(host.sim_time * (0.8 + float(host.params.coolant_rate) / 140.0) + float(ci) * 0.2, 1.0) * float(loop_pts.size())
				var seg := int(floorf(ct)) % loop_pts.size()
				var frac: float = ct - floorf(ct)
				var cp := loop_pts[seg].lerp(loop_pts[(seg + 1) % loop_pts.size()], frac)
				var warm := clampf((host.chamber_temp_c - 20.0) / 85.0, 0.0, 1.0) if seg >= 2 else 0.08
				draw_circle(cp, 4.4, Color("#3cf6ff").lerp(Color("#ff8438"), warm))

		# 4. Thruster Module & Dynamic Multi-Stage Mach Plume
		var th_r := Rect2(Vector2(noz_x - 32.0, cy - 32.0), Vector2(64.0, 64.0))
		var heat_glow := clampf((host.chamber_temp_c - 65.0) / 55.0, 0.0, 1.0)
		draw_rect(th_r, Color("#172b3a").lerp(Color("#5c1e18"), heat_glow), true)
		var ttex := CosmoteerAssets.get_part_texture(str(host.selected_thruster.id), "cutaway")
		if ttex != null:
			draw_set_transform(th_r.get_center(), -PI * 0.5, Vector2.ONE)
			draw_texture_rect(ttex, Rect2(-29, -29, 58, 58), false, Color.WHITE.lerp(Color(1.0, 0.62, 0.52), heat_glow))
			draw_set_transform(Vector2.ZERO)
		draw_rect(th_r, RED if host.overheated else CYAN, false, 2.4)

		var thrust_ratio := clampf(host.effective_thrust_n / 14000.0, 0.0, 1.45)
		if thrust_ratio > 0.01:
			var max_plume := maxf(65.0, size.x - noz_x - 50.0)
			if host.exhaust_blocked:
				max_plume = minf(max_plume, 54.0)
			var plen := clampf(max_plume * (0.28 + 0.68 * thrust_ratio), 32.0, max_plume)
			var pwid := 15.0 + 19.0 * thrust_ratio + 2.5 * sin(host.sim_time * 28.0)
			var noz_tip := Vector2(th_r.end.x, cy)
			var outer_col := Color("#ff7b38", 0.78) if (host.overheated or float(host.params.throttle_pct) > 105.0) else Color("#38b6ff", 0.76)
			var inner_col := Color("#fff4c2", 0.96) if float(host.params.throttle_pct) > 105.0 else Color("#c8fbff", 0.95)
			draw_colored_polygon(PackedVector2Array([
				noz_tip + Vector2(0, -pwid),
				noz_tip + Vector2(plen, 0),
				noz_tip + Vector2(0, pwid),
			]), outer_col)
			draw_colored_polygon(PackedVector2Array([
				noz_tip + Vector2(0, -pwid * 0.48),
				noz_tip + Vector2(plen * 0.66, 0),
				noz_tip + Vector2(0, pwid * 0.48),
			]), inner_col)
			for di in 3:
				var dx := noz_tip.x + plen * (0.18 + float(di) * 0.20)
				var dw := pwid * (0.36 - float(di) * 0.08)
				draw_colored_polygon(PackedVector2Array([
					Vector2(dx - 8.0, cy), Vector2(dx, cy - dw), Vector2(dx + 8.0, cy), Vector2(dx, cy + dw)
				]), Color(1.0, 1.0, 1.0, 0.68))

		if host.exhaust_blocked:
			var blk_r := Rect2(Vector2(th_r.end.x + 56.0, cy - 44.0), Vector2(20.0, 88.0))
			draw_rect(blk_r, Color("#4a2626"), true)
			draw_rect(blk_r, Color("#ff8e3c"), false, 2.6)

		if font != null:
			var st_txt := "정상 분사"
			var st_col := GREEN
			if not host.power_on:
				st_txt = "NO_POWER (전력 차단)"
				st_col = RED
			elif host.fuel_kg <= 0.05:
				st_txt = "NO_FUEL (연료 고갈)"
				st_col = RED
			elif host.exhaust_blocked:
				st_txt = "배기 간섭! (추력 ×0.25)"
				st_col = GOLD
			elif host.overheated:
				st_txt = "OVERHEAT 과열 감쇠!"
				st_col = RED
			var hud_line := "추력 %.0f N · 연료 %.1f/%.0f kg (%.2f/s) · 전력 %.0f W · %.1f °C · %s" % [
				host.effective_thrust_n, host.fuel_kg, float(host.params.fuel_cap_kg),
				host.current_fuel_burn, host.current_power_w, host.chamber_temp_c, st_txt
			]
			draw_string(font, Vector2(14, 28), hud_line, HORIZONTAL_ALIGNMENT_LEFT, size.x - 28.0, 20, st_col)

var mode_switcher: ModeSwitcher
var sfx: CosmoteerSfx
var _ui_layer: CanvasLayer
var _ui_font: Font
var _ui_theme: Theme

var _main_panel: PanelContainer
var _header_box: BoxContainer
var _body_split: BoxContainer
var _left_panel: PanelContainer
var _right_panel: PanelContainer
var _roster_scroll: ScrollContainer
var _roster_grid: GridContainer
var _controls_grid: GridContainer
var _sliders_scroll: ScrollContainer
var _sliders_grid: GridContainer
var _quick_dock: PanelContainer
var _q_interior_btn: Button
var bench: ThrusterBenchCanvas

var _header_title: Label
var _telemetry_label: Label
var _summary_label: Label
var _thruster_buttons: Array[Button] = []
var sliders: Dictionary = {}
var slider_labels: Dictionary = {}
var _syncing_sliders := false

var fire_btn: Button
var power_btn: Button
var eroom_btn: Button
var cooler_btn: Button
var block_btn: Button

var selected_thruster: Dictionary = THRUSTER_ROSTER[0]
var params: Dictionary = {
	"throttle_pct": 100.0,
	"fuel_mix": 1.0,
	"power_volt": 100.0,
	"coolant_rate": 100.0,
	"fuel_cap_kg": 240.0,
	"ambient_c": 24.0,
}

var firing := true
var power_on := true
var engine_room_boost := true
var cooler_on := true
var exhaust_blocked := false

var sim_time := 0.0
var fuel_kg := 240.0
var chamber_temp_c := 32.0
var nozzle_hp := 100.0
var effective_thrust_n := 0.0
var current_fuel_burn := 0.0
var current_power_w := 0.0
var overheated := false

func _ready() -> void:
	CosmoteerAssets.ensure_loaded()
	FtlCrew.ensure_loaded()
	_load_font()
	sfx = CosmoteerSfx.new()
	add_child(sfx)

	mode_switcher = ModeSwitcherScript.new()
	add_child(mode_switcher)
	mode_switcher.setup("thruster_lab")
	mode_switcher.orientation_changed.connect(func(_p: bool) -> void: _sync_responsive_layout())
	if get_viewport() != null:
		get_viewport().size_changed.connect(_sync_responsive_layout)

	_build_ui()
	select_thruster_index(2)
	_sync_responsive_layout()

func _load_font() -> void:
	_ui_font = UiTheme.load_ui_font()
	_ui_theme = UiTheme.build_theme(true)

func _make_style(bg: Color, border: Color, radius: int = 10, margin: int = 8) -> StyleBoxFlat:
	return UiTheme.make_box(bg, border, radius, margin, margin, 2)

func _make_btn(caption: String, cb: Callable, accent := false, clip := true) -> Button:
	var b := Button.new()
	b.text = caption
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(0, 48)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.clip_text = clip
	b.add_theme_font_size_override("font_size", 20)
	b.add_theme_color_override("font_color", GREEN if accent else WHITE)
	b.add_theme_stylebox_override("normal", _make_style(Color(0.08, 0.24, 0.22, 0.96) if accent else Color(0.07, 0.14, 0.24, 0.94), GREEN if accent else EDGE, 8, 6))
	b.pressed.connect(cb)
	return b

func _build_ui() -> void:
	_ui_layer = CanvasLayer.new()
	_ui_layer.layer = 10
	add_child(_ui_layer)

	var bg := ColorRect.new()
	bg.color = Color("#040912")
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ui_layer.add_child(bg)

	_main_panel = PanelContainer.new()
	if _ui_theme != null:
		_main_panel.theme = _ui_theme
	_main_panel.add_theme_stylebox_override("panel", _make_style(Color(0.03, 0.07, 0.13, 0.96), Color(0.32, 0.78, 0.98, 0.88), 12, 10))
	_ui_layer.add_child(_main_panel)

	var root := VBoxContainer.new()
	root.add_theme_constant_override("separation", 7)
	root.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	root.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_main_panel.add_child(root)

	_header_box = BoxContainer.new()
	_header_box.vertical = false
	_header_box.add_theme_constant_override("separation", 6)
	root.add_child(_header_box)

	_header_title = Label.new()
	_header_title.text = "추진기 실험실 · 연료 / ONI 전력 / 액체냉각"
	_header_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_title.clip_text = true
	_header_title.add_theme_font_size_override("font_size", 26)
	_header_title.add_theme_color_override("font_color", GOLD)
	_header_box.add_child(_header_title)

	_telemetry_label = Label.new()
	_telemetry_label.text = "추력 0 N · 노즐 24°C"
	_telemetry_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_telemetry_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_telemetry_label.clip_text = true
	_telemetry_label.add_theme_font_size_override("font_size", 20)
	_telemetry_label.add_theme_color_override("font_color", GREEN)
	_header_box.add_child(_telemetry_label)

	_body_split = BoxContainer.new()
	_body_split.vertical = false
	_body_split.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_body_split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body_split.add_theme_constant_override("separation", 8)
	root.add_child(_body_split)

	_left_panel = PanelContainer.new()
	_left_panel.add_theme_stylebox_override("panel", _make_style(SURFACE, EDGE, 10, 8))
	_body_split.add_child(_left_panel)

	var left_col := VBoxContainer.new()
	left_col.add_theme_constant_override("separation", 6)
	left_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_left_panel.add_child(left_col)

	var list_hdr := Label.new()
	list_hdr.text = "추진기 목록 (8종)"
	list_hdr.add_theme_font_size_override("font_size", 22)
	list_hdr.add_theme_color_override("font_color", GOLD)
	left_col.add_child(list_hdr)

	_roster_scroll = FlickScrollScript.new()
	_roster_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_roster_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left_col.add_child(_roster_scroll)

	_roster_grid = GridContainer.new()
	_roster_grid.columns = 1
	_roster_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_roster_grid.add_theme_constant_override("h_separation", 6)
	_roster_grid.add_theme_constant_override("v_separation", 6)
	_roster_scroll.add_child(_roster_grid)

	for i in THRUSTER_ROSTER.size():
		var entry: Dictionary = THRUSTER_ROSTER[i]
		var btn := Button.new()
		btn.text = "%s (%.0fN)" % [str(entry.name), float(entry.base_thrust_n)]
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		btn.focus_mode = Control.FOCUS_NONE
		btn.clip_text = true
		btn.custom_minimum_size = Vector2(0, 50)
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.add_theme_font_size_override("font_size", 19)
		var tex := CosmoteerAssets.get_part_texture(str(entry.id), "cutaway")
		if tex != null:
			btn.icon = tex
			btn.expand_icon = true
		var idx := i
		btn.pressed.connect(func() -> void: select_thruster_index(idx))
		_roster_grid.add_child(btn)
		_thruster_buttons.append(btn)

	_summary_label = Label.new()
	_summary_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_summary_label.add_theme_font_size_override("font_size", 18)
	_summary_label.add_theme_color_override("font_color", SOFT)
	left_col.add_child(_summary_label)

	# 우측: 실시간 벤치 + 제어 버튼 + 6종 슬라이더
	_right_panel = PanelContainer.new()
	_right_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_right_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_right_panel.add_theme_stylebox_override("panel", _make_style(SURFACE, EDGE, 10, 8))
	_body_split.add_child(_right_panel)

	var right_col := VBoxContainer.new()
	right_col.add_theme_constant_override("separation", 7)
	right_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_right_panel.add_child(right_col)

	bench = ThrusterBenchCanvas.new()
	bench.host = self
	bench.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bench.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right_col.add_child(bench)

	var controls := GridContainer.new()
	controls.columns = 4
	controls.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	controls.add_theme_constant_override("h_separation", 6)
	controls.add_theme_constant_override("v_separation", 6)
	right_col.add_child(controls)
	_controls_grid = controls

	fire_btn = _make_btn("분사: 가동", func() -> void:
		firing = not firing
		_sync_switch_labels(), true)
	controls.add_child(fire_btn)

	controls.add_child(_make_btn("연료 완충", func() -> void:
		fuel_kg = float(params.fuel_cap_kg)
		if sfx != null:
			sfx.play("shield_hit"), true))

	power_btn = _make_btn("전력: ON", func() -> void:
		power_on = not power_on
		_sync_switch_labels())
	controls.add_child(power_btn)

	eroom_btn = _make_btn("엔진룸: ON", func() -> void:
		engine_room_boost = not engine_room_boost
		_sync_switch_labels())
	controls.add_child(eroom_btn)

	cooler_btn = _make_btn("냉각기: ON", func() -> void:
		cooler_on = not cooler_on
		_sync_switch_labels())
	controls.add_child(cooler_btn)

	block_btn = _make_btn("배기간섭: OFF", func() -> void:
		exhaust_blocked = not exhaust_blocked
		_sync_switch_labels())
	controls.add_child(block_btn)

	controls.add_child(_make_btn("초기화", reset_bench_defaults))

	_sliders_scroll = FlickScrollScript.new()
	_sliders_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_col.add_child(_sliders_scroll)

	_sliders_grid = GridContainer.new()
	_sliders_grid.columns = 2
	_sliders_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sliders_grid.add_theme_constant_override("h_separation", 14)
	_sliders_grid.add_theme_constant_override("v_separation", 8)
	_sliders_scroll.add_child(_sliders_grid)

	for sp: Array in SLIDER_SPECS:
		var key := str(sp[0])
		var row := HBoxContainer.new()
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_theme_constant_override("separation", 8)
		var nm := Label.new()
		nm.text = str(sp[1])
		nm.custom_minimum_size = Vector2(104, 0)
		nm.clip_text = true
		nm.add_theme_font_size_override("font_size", 19)
		nm.add_theme_color_override("font_color", WHITE)
		row.add_child(nm)
		var sl := HSlider.new()
		sl.min_value = float(sp[2])
		sl.max_value = float(sp[3])
		sl.step = float(sp[4])
		sl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		sl.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		sl.value_changed.connect(_on_slider_changed.bind(key, str(sp[5])))
		row.add_child(sl)
		var vl := Label.new()
		vl.custom_minimum_size = Vector2(84, 0)
		vl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		vl.clip_text = true
		vl.add_theme_font_size_override("font_size", 19)
		vl.add_theme_color_override("font_color", GREEN)
		row.add_child(vl)
		_sliders_grid.add_child(row)
		sliders[key] = sl
		slider_labels[key] = vl

	# 하단 좌측 바로가기 독 (ModeSwitcher와 84px 높이 수평 정렬)
	_quick_dock = PanelContainer.new()
	if _ui_theme != null:
		_quick_dock.theme = _ui_theme
	_quick_dock.add_theme_stylebox_override("panel", _make_style(Color(0.03, 0.08, 0.16, 0.96), Color(0.36, 0.84, 1.0, 0.88), 12, 6))
	_ui_layer.add_child(_quick_dock)

	var qrow := HBoxContainer.new()
	qrow.add_theme_constant_override("separation", 6)
	_quick_dock.add_child(qrow)
	var b_wr := _make_btn("◀ 무기 일람표", func() -> void: get_tree().change_scene_to_file("res://scenes/weapon_roster_mode.tscn"), true)
	b_wr.custom_minimum_size = Vector2(0, 68)
	qrow.add_child(b_wr)
	_q_interior_btn = _make_btn("함내 관제", func() -> void: get_tree().change_scene_to_file("res://scenes/interior_command_mode.tscn"))
	_q_interior_btn.custom_minimum_size = Vector2(0, 68)
	qrow.add_child(_q_interior_btn)
	var b_main := _make_btn("정식 맵", func() -> void: get_tree().change_scene_to_file("res://scenes/main.tscn"))
	b_main.custom_minimum_size = Vector2(0, 68)
	qrow.add_child(b_main)

	_sync_sliders()
	_sync_switch_labels()

func _sync_responsive_layout() -> void:
	if _main_panel == null or get_viewport() == null:
		return
	var vp := get_viewport().get_visible_rect().size
	var narrow := vp.x < 960.0 or ModeSwitcherScript.is_portrait_mode
	var ultra_narrow := vp.x < 640.0
	_main_panel.anchor_left = 0.0
	_main_panel.anchor_right = 1.0
	_main_panel.anchor_top = 0.0
	_main_panel.anchor_bottom = 1.0
	_main_panel.offset_left = 10.0
	_main_panel.offset_right = -10.0
	_main_panel.offset_top = 10.0
	_main_panel.offset_bottom = -102.0

	if _q_interior_btn != null:
		_q_interior_btn.visible = not narrow

	if narrow:
		_header_box.vertical = true
		_telemetry_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		_body_split.vertical = true
		_left_panel.custom_minimum_size = Vector2.ZERO
		_left_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_left_panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		_roster_scroll.custom_minimum_size = Vector2(0, clampf(vp.y * 0.15, 132.0, 190.0))
		_roster_grid.columns = 1
		if _controls_grid != null:
			_controls_grid.columns = 3 if ultra_narrow else 4
		_sliders_grid.columns = 1 if vp.x < 700.0 else 2
		_sliders_scroll.custom_minimum_size = Vector2(0, clampf(vp.y * 0.15, 128.0, 195.0))
		bench.custom_minimum_size = Vector2(0, clampf(vp.y * 0.20, 158.0, 260.0))

		var ms_w := 256.0 if ultra_narrow else 296.0
		var qw := maxf(200.0, vp.x - ms_w - 28.0)
		_quick_dock.anchor_left = 0.0
		_quick_dock.anchor_right = 0.0
		_quick_dock.anchor_top = 1.0
		_quick_dock.anchor_bottom = 1.0
		_quick_dock.offset_left = 10.0
		_quick_dock.offset_right = 10.0 + qw
		_quick_dock.offset_top = -94.0
		_quick_dock.offset_bottom = -10.0
	else:
		_header_box.vertical = false
		_telemetry_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		_body_split.vertical = false
		_left_panel.custom_minimum_size = Vector2(clampf(vp.x * 0.29, 340.0, 395.0), 0)
		_left_panel.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		_left_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
		_roster_scroll.custom_minimum_size = Vector2(0, 160)
		_roster_grid.columns = 1
		if _controls_grid != null:
			_controls_grid.columns = 4
		_sliders_grid.columns = 2
		_sliders_scroll.custom_minimum_size = Vector2(0, clampf(vp.y * 0.17, 108.0, 136.0))
		bench.custom_minimum_size = Vector2(0, 162)

		var qw := minf(520.0, vp.x - 340.0)
		_quick_dock.anchor_left = 0.0
		_quick_dock.anchor_right = 0.0
		_quick_dock.anchor_top = 1.0
		_quick_dock.anchor_bottom = 1.0
		_quick_dock.offset_left = 10.0
		_quick_dock.offset_right = 10.0 + qw
		_quick_dock.offset_top = -94.0
		_quick_dock.offset_bottom = -10.0

func select_thruster_index(index: int) -> void:
	if index < 0 or index >= THRUSTER_ROSTER.size():
		return
	selected_thruster = THRUSTER_ROSTER[index]
	chamber_temp_c = maxf(24.0, float(params.ambient_c))
	nozzle_hp = 100.0
	for i in _thruster_buttons.size():
		var b := _thruster_buttons[i]
		var sel := (i == index)
		b.add_theme_stylebox_override("normal", _make_style(
			Color(0.11, 0.34, 0.44, 0.96) if sel else Color(0.05, 0.10, 0.17, 0.90),
			GREEN if sel else EDGE, 8, 5))
		b.add_theme_color_override("font_color", Color.WHITE if sel else SOFT)
	_summary_label.text = "%s\n추력 %.0fN · 전력 %.0fW · 연비 %.1fkg/s · 발열 %.1f°C/s" % [
		str(selected_thruster.role), float(selected_thruster.base_thrust_n),
		float(selected_thruster.power_w), float(selected_thruster.fuel_rate), float(selected_thruster.heat_rate)
	]
	step_bench(0.016)

func reset_bench_defaults() -> void:
	params = {
		"throttle_pct": 100.0,
		"fuel_mix": 1.0,
		"power_volt": 100.0,
		"coolant_rate": 100.0,
		"fuel_cap_kg": 240.0,
		"ambient_c": 24.0,
	}
	firing = true
	power_on = true
	engine_room_boost = true
	cooler_on = true
	exhaust_blocked = false
	fuel_kg = 240.0
	chamber_temp_c = 28.0
	nozzle_hp = 100.0
	_sync_sliders()
	_sync_switch_labels()
	step_bench(0.016)

func _sync_sliders() -> void:
	_syncing_sliders = true
	for sp: Array in SLIDER_SPECS:
		var k := str(sp[0])
		var fmt := str(sp[5])
		var sl: HSlider = sliders[k]
		var val := clampf(float(params.get(k, sl.min_value)), sl.min_value, sl.max_value)
		sl.set_value_no_signal(val)
		slider_labels[k].text = fmt % val
	_syncing_sliders = false

func _on_slider_changed(value: float, key: String, fmt: String) -> void:
	if _syncing_sliders:
		return
	params[key] = value
	slider_labels[key].text = fmt % value
	if key == "fuel_cap_kg":
		fuel_kg = minf(fuel_kg, value)
	step_bench(0.0)

func _sync_switch_labels() -> void:
	if fire_btn != null:
		fire_btn.text = "분사: 가동" if firing else "분사: 정지"
	if power_btn != null:
		power_btn.text = "전력: ON" if power_on else "전력: OFF"
	if eroom_btn != null:
		eroom_btn.text = "엔진룸: ON" if engine_room_boost else "엔진룸: OFF"
	if cooler_btn != null:
		cooler_btn.text = "냉각기: ON" if cooler_on else "냉각기: OFF"
	if block_btn != null:
		block_btn.text = "배기간섭: ON" if exhaust_blocked else "배기간섭: OFF"

func step_bench(dt: float) -> void:
	sim_time += maxf(0.0, dt)
	var thr_pct := float(params.throttle_pct) / 100.0
	var f_mix := float(params.fuel_mix)
	var v_mult := float(params.power_volt) / 100.0
	var c_rate := float(params.coolant_rate) / 100.0
	var amb := float(params.ambient_c)

	var base_n := float(selected_thruster.base_thrust_n)
	var base_w := float(selected_thruster.power_w)
	var base_f := float(selected_thruster.fuel_rate)
	var base_h := float(selected_thruster.heat_rate)

	var can_fire := firing and thr_pct > 0.001 and power_on and fuel_kg > 0.01
	if can_fire:
		current_fuel_burn = base_f * thr_pct * f_mix
		if dt > 0.0:
			fuel_kg = maxf(0.0, fuel_kg - current_fuel_burn * dt)
		current_power_w = base_w * thr_pct * v_mult + (180.0 * c_rate if cooler_on else 0.0)
		var er_mult := 1.50 if engine_room_boost else 1.0
		var blk_mult := 0.25 if exhaust_blocked else 1.0
		var heat_throttle_mult := clampf(1.0 - maxf(0.0, chamber_temp_c - 92.0) * 0.009, 0.35, 1.0)
		effective_thrust_n = base_n * thr_pct * pow(f_mix, 0.72) * pow(v_mult, 0.55) * er_mult * blk_mult * heat_throttle_mult
		var backfire_mult := 1.75 if exhaust_blocked else 1.0
		if dt > 0.0:
			chamber_temp_c += base_h * thr_pct * f_mix * v_mult * backfire_mult * dt
	else:
		current_fuel_burn = 0.0
		current_power_w = (180.0 * c_rate) if (power_on and cooler_on) else 0.0
		effective_thrust_n = 0.0

	if dt > 0.0:
		chamber_temp_c = move_toward(chamber_temp_c, amb, 4.2 * dt)
		if cooler_on and power_on and c_rate > 0.01:
			chamber_temp_c = move_toward(chamber_temp_c, minf(amb + 12.0, 26.0), 22.0 * c_rate * dt)
		overheated = chamber_temp_c > 92.0
		if overheated:
			nozzle_hp = maxf(10.0, nozzle_hp - (chamber_temp_c - 92.0) * 0.12 * dt)
	else:
		overheated = chamber_temp_c > 92.0

	if _telemetry_label != null:
		_telemetry_label.text = "추력 %.0f N · 연료 %.0f/%.0f kg · %.0f W · %.1f °C · 내구 %.0f%%" % [
			effective_thrust_n, fuel_kg, float(params.fuel_cap_kg), current_power_w, chamber_temp_c, nozzle_hp
		]
		_telemetry_label.add_theme_color_override("font_color", RED if (overheated or not power_on or fuel_kg <= 0.05) else GREEN)
	if bench != null:
		bench.queue_redraw()

func _physics_process(delta: float) -> void:
	step_bench(delta)
