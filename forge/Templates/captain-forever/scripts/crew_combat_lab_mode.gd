class_name CrewCombatLabMode
extends Node2D

## 승조원 전투 공격·방어 실험실 모드:
## - 10×3 사각 전술 블럭 데크 위 상·하·좌·우 4방향 1칸 이동 · 같은팀 1칸 1명 배치 · 이동중 겹침 허용
## - 사각 블럭 경계선마다 [방화문(Lv.1~Lv.3)] 및 [격실벽(Lv.1~Lv.3)] 자유 설치 · 단계별 업그레이드 · 제거 지원
##   * 방화문(Fire Door): 아군(방어조) 자동 개폐 통과 가능, 적군(공격조) 이동 차단 및 파괴 강제, 밀폐 시 독가스·화재 차단
##   * 격실벽(Compartment Wall): 고정 장갑 칸막이벽, 아군·적군 모두 우회 통로 유도(봉쇄 시 적군이 타격 돌파), 독가스·화재·자폭 충격파 차단
## - FTL 8종족 공방 조합 · 방어 장갑 감쇠 · 전투 숙련도 · 의무실 1방향 에너지 배관 회복 시뮬레이션

const ModeSwitcherScript = preload("res://scripts/mode_switcher.gd")
const FlickScrollScript = preload("res://scripts/flick_scroll_container.gd")
const FtlCrew = preload("res://scripts/ftl_crew_assets.gd")
const CosmoteerAssets = preload("res://scripts/cosmoteer_assets.gd")
const CosmoteerSfx = preload("res://scripts/cosmoteer_sfx.gd")
const UiTheme = preload("res://scripts/ui_scale_theme.gd")
const BulkheadVis = preload("res://scripts/bulkhead_visual.gd")

const BG_DARK := Color("#050d17")
const SURFACE := Color(0.05, 0.11, 0.18, 0.96)
const EDGE := Color(0.24, 0.62, 0.84, 0.88)
const WHITE := Color("#e4f4ff")
const SOFT := Color("#9ec4da")
const GREEN := Color("#74f2ce")
const GOLD := Color("#ffd175")
const RED := Color("#ff6e66")
const CYAN := Color("#6ef2ff")

const GRID_COLS := 10 # 0..2: 침투 에어록 | 3..5: 중앙 초크 복도 | 6..9: 의무실·코어
const GRID_ROWS := 3
const CARDINAL_DIRS := [Vector2i.RIGHT, Vector2i.LEFT, Vector2i.DOWN, Vector2i.UP]
const MAX_BARRIER_LEVEL := 3

const BARRIER_SPECS := {
	"fire_door": {
		1: {"label": "방화문 Lv.1", "hp": 90.0, "color": Color("#ff5c74"), "open_color": Color("#6ef2ff"), "width": 4.4},
		2: {"label": "강화 방화문 Lv.2", "hp": 180.0, "color": Color("#ff9638"), "open_color": Color("#7ef7d4"), "width": 5.6},
		3: {"label": "초합금 방화문 Lv.3", "hp": 300.0, "color": Color("#ffd84d"), "open_color": Color("#aefcff"), "width": 6.8},
	},
	"wall": {
		1: {"label": "격실벽 Lv.1", "hp": 140.0, "color": Color("#7ea8cc"), "accent": Color("#bddcff"), "width": 6.2},
		2: {"label": "보강 격실벽 Lv.2", "hp": 260.0, "color": Color("#4ce6c2"), "accent": Color("#c8fff0"), "width": 7.6},
		3: {"label": "중장갑 격실벽 Lv.3", "hp": 420.0, "color": Color("#ffbe42"), "accent": Color("#fff2a6"), "width": 9.0},
	},
}

const SPECIES_ROSTER := [
	{"id": "human", "name": "인간 (HUMAN)", "badge": "HP 100 · 공 1.0× · 균형"},
	{"id": "mantis", "name": "맨티스 (MANTIS)", "badge": "HP 100 · 공 1.5× · 이속 1.2×"},
	{"id": "rock", "name": "락맨 (ROCK)", "badge": "HP 150 · 화재면역 · 가스저항"},
	{"id": "engi", "name": "엔지 (ENGI)", "badge": "HP 100 · 수리 2.0× · 공 0.5×"},
	{"id": "zoltan", "name": "졸탄 (ZOLTAN)", "badge": "HP 70 · +300W · 사망자폭 15"},
	{"id": "crystal", "name": "크리스탈 (CRYSTAL)", "badge": "HP 125 · 중장갑 · 가스저항"},
	{"id": "lanius", "name": "라니우스 (LANIUS)", "badge": "HP 100 · 무산소·독가스 면역"},
	{"id": "slug", "name": "슬러그 (SLUG)", "badge": "HP 100 · 공 1.0× · 기습탐지"},
]

const SLIDER_SPECS := [
	["atk_count", "공격 인원", 1.0, 4.0, 1.0, "%.0f명"],
	["def_count", "방어 인원", 1.0, 4.0, 1.0, "%.0f명"],
	["atk_mult_pct", "공격 배율", 50.0, 250.0, 10.0, "%.0f%%"],
	["def_armor_pct", "방어 감쇠", 0.0, 70.0, 5.0, "%.0f%%"],
	["mastery_lv", "전투 숙련", 0.0, 2.0, 1.0, "%.0f성"],
	["medbay_heal_s", "의무 회복", 0.0, 30.0, 2.0, "%.0f/s"],
]

const MASTERY_MULTS := [1.0, 1.10, 1.20]

class CombatArenaCanvas extends Control:
	var host: CrewCombatLabMode = null
	var hovered_tile := Vector2i(-1, -1)
	var hovered_edge_a := Vector2i(-1, -1)
	var hovered_edge_b := Vector2i(-1, -1)

	func _ready() -> void:
		clip_contents = true
		mouse_filter = Control.MOUSE_FILTER_STOP
		custom_minimum_size = Vector2(0, 165)

	func grid_metrics() -> Dictionary:
		var cell_px := clampf(minf((size.x - 24.0) / float(GRID_COLS), (size.y - 48.0) / float(GRID_ROWS)), 26.0, 66.0)
		var total_w := cell_px * float(GRID_COLS)
		var total_h := cell_px * float(GRID_ROWS)
		var ox := (size.x - total_w) * 0.5
		var oy := clampf((size.y - total_h) * 0.48, 20.0, 36.0)
		return {"origin": Vector2(ox, oy), "cell_px": cell_px, "total_w": total_w, "total_h": total_h}

	func tile_center_px(grid_pos: Vector2, m: Dictionary) -> Vector2:
		return (m.origin as Vector2) + (grid_pos + Vector2(0.5, 0.5)) * float(m.cell_px)

	func screen_to_tile(local_pos: Vector2) -> Vector2i:
		var m := grid_metrics()
		var orig: Vector2 = m.origin
		var cpx := float(m.cell_px)
		var col := floori((local_pos.x - orig.x) / maxf(1.0, cpx))
		var row := floori((local_pos.y - orig.y) / maxf(1.0, cpx))
		return Vector2i(col, row)

	## 마우스/터치 좌표에서 가장 가까운 유효 내부 블럭 경계선(edge) 반환
	func screen_to_edge(local_pos: Vector2) -> Array[Vector2i]:
		var m := grid_metrics()
		var orig: Vector2 = m.origin
		var cpx := maxf(1.0, float(m.cell_px))
		var gx := (local_pos.x - orig.x) / cpx
		var gy := (local_pos.y - orig.y) / cpx
		if gx < -0.35 or gx > float(GRID_COLS) + 0.35 or gy < -0.35 or gy > float(GRID_ROWS) + 0.35:
			return []
		var col := clampi(floori(gx), 0, GRID_COLS - 1)
		var row := clampi(floori(gy), 0, GRID_ROWS - 1)
		var base := Vector2i(col, row)
		var best_nb := Vector2i(-1, -1)
		var best_dist := 999.0
		for d in CARDINAL_DIRS:
			var nb: Vector2i = base + d
			if nb.x < 0 or nb.x >= GRID_COLS or nb.y < 0 or nb.y >= GRID_ROWS:
				continue
			var mid_g := (Vector2(base) + Vector2(nb) + Vector2.ONE) * 0.5
			var dist := Vector2(gx, gy).distance_to(mid_g)
			if dist < best_dist:
				best_dist = dist
				best_nb = nb
		if best_nb.x < 0:
			return []
		return [base, best_nb]

	func _gui_input(event: InputEvent) -> void:
		if host == null:
			return
		if event is InputEventMouseMotion:
			hovered_tile = screen_to_tile(event.position)
			var ed := screen_to_edge(event.position)
			if ed.size() == 2:
				hovered_edge_a = ed[0]
				hovered_edge_b = ed[1]
			else:
				hovered_edge_a = Vector2i(-1, -1)
				hovered_edge_b = Vector2i(-1, -1)
			queue_redraw()
		elif event is InputEventMouseButton and event.pressed:
			var tile := screen_to_tile(event.position)
			var ed2 := screen_to_edge(event.position)
			if event.button_index == MOUSE_BUTTON_RIGHT:
				if ed2.size() == 2:
					host.remove_barrier(ed2[0], ed2[1])
					accept_event()
			elif event.button_index == MOUSE_BUTTON_LEFT:
				host.on_arena_pointer_action(tile, ed2)
				accept_event()
		elif event is InputEventScreenTouch and event.pressed:
			var tile_t := screen_to_tile(event.position)
			var ed_t := screen_to_edge(event.position)
			hovered_tile = tile_t
			if ed_t.size() == 2:
				hovered_edge_a = ed_t[0]
				hovered_edge_b = ed_t[1]
			host.on_arena_pointer_action(tile_t, ed_t)
			accept_event()

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color("#050c15"), true)
		if host == null or size.x < 40.0 or size.y < 40.0:
			return
		var font: Font = host._ui_font if host._ui_font != null else ThemeDB.fallback_font
		var m := grid_metrics()
		var orig: Vector2 = m.origin
		var cpx := float(m.cell_px)
		var deck_h := float(m.total_h)

		var r_air := Rect2(orig, Vector2(cpx * 3.0 - 2.0, deck_h))
		var r_chk := Rect2(orig + Vector2(cpx * 3.0 + 2.0, 0.0), Vector2(cpx * 3.0 - 4.0, deck_h))
		var r_med := Rect2(orig + Vector2(cpx * 6.0 + 2.0, 0.0), Vector2(cpx * 4.0 - 2.0, deck_h))

		# 1) 10x3 개별 사각 전술 블럭 타일 & 격실별 생화학 독가스 농도 렌더링
		for row in GRID_ROWS:
			for col in GRID_COLS:
				var cell_v := Vector2i(col, row)
				var tl := orig + Vector2(float(col) * cpx, float(row) * cpx)
				var cell_r := Rect2(tl + Vector2(1.5, 1.5), Vector2(cpx - 3.0, cpx - 3.0))
				var base_col := Color("#1a1622") if col <= 2 else (Color("#132535") if col <= 5 else (Color("#112f29") if host.medbay_powered else Color("#18212a")))
				draw_rect(cell_r, base_col, true)
				var g_conc := float(host.cell_gas.get(cell_v, 0.0))
				if g_conc > 1.0:
					var ga := clampf(g_conc / 100.0, 0.08, 1.0)
					draw_rect(cell_r.grow(-2.0), Color(0.22, 0.90, 0.34, 0.34 * ga), true)
					var g_center := cell_r.get_center() + Vector2(cos(host.sim_time * 3.0 + float(col)), sin(host.sim_time * 2.7 + float(row))) * 3.5
					draw_circle(g_center, 6.5 * ga + 2.0, Color(0.56, 1.0, 0.40, 0.38 * ga))
				draw_rect(cell_r, Color(0.28, 0.56, 0.74, 0.30), false, 1.1)

		draw_rect(r_air, Color("#ff6e66", 0.72), false, 1.8)
		draw_rect(r_chk, CYAN if not host.defend_in_medbay else Color("#4a7a9b"), false, 2.0)
		draw_rect(r_med, GREEN if host.medbay_powered else Color("#526474"), false, 2.2)

		if font != null:
			draw_string(font, Vector2(r_air.position.x + 2.0, orig.y - 5.0), "침투 에어록 (3×3)", HORIZONTAL_ALIGNMENT_LEFT, r_air.size.x, 15, Color("#ff9e98"))
			draw_string(font, Vector2(r_chk.position.x + 2.0, orig.y - 5.0), "초크 복도 (3×3)" + (" [방어]" if not host.defend_in_medbay else ""), HORIZONTAL_ALIGNMENT_LEFT, r_chk.size.x + 16.0, 15, CYAN)
			draw_string(font, Vector2(r_med.position.x + 2.0, orig.y - 5.0), "의무실·코어 (4×3)" + (" [방어]" if host.defend_in_medbay else ""), HORIZONTAL_ALIGNMENT_LEFT, r_med.size.x, 15, GREEN if host.medbay_powered else SOFT)

		# 2) 구획 화재 오버레이
		if host.fire_active:
			var f_rect := r_med if host.defend_in_medbay else r_chk
			for fi in 3:
				var fx := f_rect.position.x + f_rect.size.x * (0.24 + float(fi) * 0.26)
				var fy := f_rect.end.y - 15.0
				var fr := 8.0 + 3.0 * sin(host.sim_time * 11.0 + float(fi) * 2.0)
				draw_circle(Vector2(fx, fy), fr, Color(1.0, 0.36, 0.12, 0.62))
				draw_circle(Vector2(fx, fy - 2.5), fr * 0.55, Color(1.0, 0.88, 0.34, 0.88))

		# 3) 의무실 회복 오라 & 하단 1방향 에너지 배관 단입자 수송 시각화
		var pipe_y := orig.y + deck_h + clampf((size.y - (orig.y + deck_h)) * 0.55, 10.0, 20.0)
		var p_start := Vector2(r_med.end.x - 16.0, pipe_y)
		var p_end := Vector2(r_med.get_center().x, r_med.end.y - 4.0)
		var p_mid := Vector2(r_med.get_center().x, pipe_y)
		var p_col := Color("#ffd466") if host.medbay_powered else Color("#4a3535")
		draw_line(p_start, p_mid, p_col, 3.4)
		draw_line(p_mid, p_end, p_col, 3.4)
		var chev := (p_start + p_mid) * 0.5
		draw_line(chev + Vector2(6.0, -4.0), chev, Color(1.0, 0.98, 0.82, 0.88), 1.8)
		draw_line(chev + Vector2(6.0, 4.0), chev, Color(1.0, 0.98, 0.82, 0.88), 1.8)
		if host.medbay_powered:
			var pulse_r := 15.0 + 5.5 * (0.5 + 0.5 * sin(host.sim_time * 4.5))
			draw_arc(r_med.get_center(), pulse_r, 0.0, TAU, 24, Color(0.32, 1.0, 0.68, 0.42), 2.0)
			for ei in 3:
				var et := fmod(host.sim_time * 1.45 + float(ei) * 0.33, 1.0)
				var ep := p_start.lerp(p_mid, et * 1.4) if et < 0.7 else p_mid.lerp(p_end, (et - 0.7) / 0.3)
				draw_circle(ep, 4.0, Color("#66f6ff"))
				draw_circle(ep, 1.9, Color.WHITE)

		# 4) 산업용 리벳·주름철판 외곽 선체 격벽 프레임 + 경계선별 격실벽(Lv.1~3) & 방화문(Lv.1~3) 오토타일 렌더링
		BulkheadVis.draw_deck_outer_frame(self, orig, GRID_COLS, GRID_ROWS, cpx)
		BulkheadVis.draw_edge_barriers(
			self,
			host.barriers,
			cpx,
			orig,
			false,
			host.door_locked,
			host.selected_edge_key,
			font,
			true
		)

		# 호버 프리뷰 (이동 모드: 타일 하이라이트 / 설치·업글·제거 모드: 경계선 프리뷰)
		if host.active_tool == "move":
			if host.is_valid_tile(hovered_tile):
				var hrect := Rect2(orig + Vector2(float(hovered_tile.x) * cpx + 2.0, float(hovered_tile.y) * cpx + 2.0), Vector2(cpx - 4.0, cpx - 4.0))
				var occupied_same := host.is_tile_claimed_by_team(hovered_tile, true, host.selected_unit_id)
				draw_rect(hrect, RED if occupied_same else GOLD, false, 2.2)
		elif host.is_valid_tile(hovered_edge_a) and host.is_valid_tile(hovered_edge_b):
			var hmid := orig + ((Vector2(hovered_edge_a) + Vector2(hovered_edge_b) + Vector2.ONE) * 0.5) * cpx
			var hdiff := hovered_edge_b - hovered_edge_a
			var htan := Vector2(-float(hdiff.y), float(hdiff.x)) * (cpx * 0.48)
			var hcol := RED if host.active_tool == "remove" else (GOLD if host.active_tool == "wall" else CYAN)
			draw_line(hmid - htan, hmid + htan, hcol, 5.0)

		# 5) 4방향 직각 이동 경로선 & 승조원 스프라이트 렌더링
		var spr_sz := clampf(cpx * 0.72, 26.0, 38.0)
		for unit in host.units:
			if float(unit.hp) <= 0.0:
				continue
			var gpos := host.unit_grid_pos(unit)
			var screen_pos := tile_center_px(gpos, m)
			var upath: Array = unit.path
			if not upath.is_empty():
				var prev_pt := screen_pos
				var pcol := Color(0.45, 1.0, 0.76, 0.55) if bool(unit.is_defender) else Color(1.0, 0.52, 0.48, 0.50)
				if float(unit.move_t) > 0.001:
					var hop_pt := tile_center_px(Vector2(unit.next_cell as Vector2i), m)
					draw_line(prev_pt, hop_pt, pcol, 2.0)
					prev_pt = hop_pt
				for wp in upath:
					var wpt := tile_center_px(Vector2(wp as Vector2i), m)
					draw_line(prev_pt, wpt, pcol, 2.0)
					prev_pt = wpt
				draw_rect(Rect2(prev_pt - Vector2(5.0, 5.0), Vector2(10.0, 10.0)), pcol, false, 1.6)

		for unit in host.units:
			if float(unit.hp) <= 0.0:
				continue
			var gpos2 := host.unit_grid_pos(unit)
			var screen_pos2 := tile_center_px(gpos2, m)
			var is_def := bool(unit.is_defender)
			if (unit.path as Array).is_empty() and float(unit.move_t) <= 0.001:
				for opp in host.units:
					if float(opp.hp) > 0.0 and bool(opp.is_defender) != is_def and (opp.path as Array).is_empty() and float(opp.move_t) <= 0.001 and (opp.cell as Vector2i) == (unit.cell as Vector2i):
						screen_pos2.x += (7.0 if is_def else -7.0)
						break
			if int(unit.id) == host.selected_unit_id and host.active_tool == "move":
				var sel_tl := orig + Vector2(float(unit.cell.x) * cpx + 3.0, float(unit.cell.y) * cpx + 3.0)
				draw_rect(Rect2(sel_tl, Vector2(cpx - 6.0, cpx - 6.0)), Color(1.0, 0.86, 0.36, 0.85), false, 2.0)
			if is_def and float(host.params.def_armor_pct) > 0.5:
				var arm_a := clampf(float(host.params.def_armor_pct) / 100.0, 0.14, 0.74)
				draw_arc(screen_pos2, spr_sz * 0.54, 0.0, TAU, 18, Color(0.42, 0.88, 1.0, arm_a), 2.2)
			FtlCrew.draw_crew_sprite(
				self,
				screen_pos2,
				str(unit.species),
				str(unit.state),
				unit.facing as Vector2,
				float(unit.anim_t),
				is_def,
				float(unit.hp) / maxf(1.0, float(unit.max_hp)),
				int(unit.id) == host.selected_unit_id,
				spr_sz
			)

		# 6) 백병전 타격 섬광 · 졸탄 자폭 충격파 · 플로팅 데미지/설치/업글 배지
		for fx in host.fx_events:
			var ratio := clampf(float(fx.t) / maxf(0.08, float(fx.dur)), 0.0, 1.0)
			var fpos := tile_center_px(Vector2(float(fx.gx), float(fx.gy)), m)
			if str(fx.kind) == "blast":
				var br := 14.0 + cpx * 1.35 * ratio
				draw_arc(fpos, br, 0.0, TAU, 24, Color(0.62, 1.0, 0.45, 1.0 - ratio), 3.4)
			elif str(fx.kind) == "slash":
				var tpos := tile_center_px(Vector2(float(fx.tx), float(fx.ty)), m)
				draw_line(fpos, fpos.lerp(tpos, 1.0 - ratio * 0.4), fx.color as Color, 2.8 * (1.0 - ratio) + 1.0)
			elif str(fx.kind) == "pop" and font != null:
				draw_string(font, fpos + Vector2(-54.0, -16.0 - ratio * 18.0), str(fx.text), HORIZONTAL_ALIGNMENT_CENTER, 108.0, 15, Color(fx.color.r, fx.color.g, fx.color.b, 1.0 - ratio))

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
var _tool_grid: GridContainer
var _controls_grid: GridContainer
var _sliders_scroll: ScrollContainer
var _sliders_grid: GridContainer
var _quick_dock: PanelContainer
var _q_interior_btn: Button
var arena: CombatArenaCanvas

var _header_title: Label
var _telemetry_label: Label
var _summary_label: Label
var _species_info_label: Label
var _tab_def_btn: Button
var _tab_atk_btn: Button
var _species_buttons: Dictionary = {}
var _tool_buttons: Dictionary = {}
var sliders: Dictionary = {}
var slider_labels: Dictionary = {}
var _syncing_sliders := false

var upgrade_sel_btn: Button
var run_btn: Button
var door_btn: Button
var med_btn: Button
var gas_btn: Button
var fire_btn: Button
var stance_btn: Button

var editing_side := "defender" # "defender" | "attacker"
var active_tool := "move"      # "move" | "fire_door" | "wall" | "remove"
var defender_species := "rock"
var attacker_species := "mantis"
var selected_unit_id: int = -1
var selected_edge_key := ""

var params: Dictionary = {
	"atk_count": 2.0,
	"def_count": 2.0,
	"atk_mult_pct": 100.0,
	"def_armor_pct": 25.0,
	"mastery_lv": 1.0,
	"medbay_heal_s": 12.0,
}

var battle_running := true
var door_locked := true
var firewall_mode := false
var medbay_powered := true
var bio_gas_active := false
var fire_active := false
var defend_in_medbay := false
var _custom_barriers_dirty := false

var barriers: Dictionary = {} # edge_key -> {a:Vector2i, b:Vector2i, kind:String, level:int, hp:float, max_hp:float, open:bool, auto_close_t:float}
var cell_gas: Dictionary = {} # Vector2i -> float (0..100, 격실벽·밀폐 방화문으로 확산 차단!)

var sim_time := 0.0
var round_elapsed := 0.0
var bio_gas_level := 0.0
var door_hp := 270.0
var door_max_hp := 270.0
var outcome := "ongoing" # "ongoing" | "defender_win" | "attacker_win" | "draw"
var total_atk_dmg_dealt := 0.0
var total_def_dmg_dealt := 0.0
var zoltan_blasts_triggered := 0
var transit_overlaps_observed := 0

var units: Array[Dictionary] = []
var fx_events: Array[Dictionary] = []

func _ready() -> void:
	CosmoteerAssets.ensure_loaded()
	FtlCrew.ensure_loaded()
	_load_font()
	sfx = CosmoteerSfx.new()
	add_child(sfx)

	mode_switcher = ModeSwitcherScript.new()
	add_child(mode_switcher)
	mode_switcher.setup("crew_combat_lab")
	mode_switcher.orientation_changed.connect(func(_p: bool) -> void: _sync_responsive_layout())
	if get_viewport() != null:
		get_viewport().size_changed.connect(_sync_responsive_layout)

	_build_ui()
	reset_default_barriers()
	reset_round()
	_sync_responsive_layout()

func _load_font() -> void:
	_ui_font = UiTheme.load_ui_font()
	_ui_theme = UiTheme.build_theme(true)

func _make_style(bg: Color, border: Color, radius: int = 10, pad: int = 8) -> StyleBoxFlat:
	return UiTheme.make_box(bg, border, radius, pad, pad - 2, 2)

func _make_btn(txt: String, cb: Callable, accent: bool = false, min_h: float = 42.0) -> Button:
	var b := Button.new()
	b.text = txt
	b.focus_mode = Control.FOCUS_NONE
	b.clip_text = true
	b.custom_minimum_size = Vector2(0, min_h)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.add_theme_font_size_override("font_size", 18)
	b.add_theme_stylebox_override("normal", _make_style(
		Color(0.09, 0.28, 0.26, 0.95) if accent else Color(0.07, 0.13, 0.22, 0.94),
		GREEN if accent else EDGE, 8, 5))
	b.add_theme_color_override("font_color", WHITE)
	b.pressed.connect(cb)
	return b

func _build_ui() -> void:
	_ui_layer = CanvasLayer.new()
	_ui_layer.layer = 20
	add_child(_ui_layer)

	_main_panel = PanelContainer.new()
	if _ui_theme != null:
		_main_panel.theme = _ui_theme
	_main_panel.add_theme_stylebox_override("panel", _make_style(Color(0.03, 0.07, 0.13, 0.96), EDGE, 12, 10))
	_ui_layer.add_child(_main_panel)

	var root_vbox := VBoxContainer.new()
	root_vbox.add_theme_constant_override("separation", 7)
	_main_panel.add_child(root_vbox)

	_header_box = BoxContainer.new()
	_header_box.add_theme_constant_override("separation", 8)
	root_vbox.add_child(_header_box)

	_header_title = Label.new()
	_header_title.text = "승조원 전투 실험실 · 격실벽/방화문 설치·업글·제거 & 4방향 기동"
	_header_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_header_title.clip_text = true
	_header_title.add_theme_font_size_override("font_size", 23)
	_header_title.add_theme_color_override("font_color", GOLD)
	_header_box.add_child(_header_title)

	_telemetry_label = Label.new()
	_telemetry_label.clip_text = true
	_telemetry_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_telemetry_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_telemetry_label.add_theme_font_size_override("font_size", 19)
	_telemetry_label.add_theme_color_override("font_color", GREEN)
	_header_box.add_child(_telemetry_label)

	_body_split = BoxContainer.new()
	_body_split.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body_split.add_theme_constant_override("separation", 10)
	root_vbox.add_child(_body_split)

	# 좌측: 방어조 / 공격조 종족 선택 패널
	_left_panel = PanelContainer.new()
	_left_panel.add_theme_stylebox_override("panel", _make_style(SURFACE, EDGE, 10, 8))
	_body_split.add_child(_left_panel)

	var left_vbox := VBoxContainer.new()
	left_vbox.add_theme_constant_override("separation", 6)
	left_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left_vbox.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_left_panel.add_child(left_vbox)

	var side_tabs := GridContainer.new()
	side_tabs.columns = 2
	side_tabs.add_theme_constant_override("h_separation", 6)
	left_vbox.add_child(side_tabs)

	_tab_def_btn = _make_btn("방어조 종족", func() -> void:
		editing_side = "defender"
		_refresh_species_buttons(), true, 44.0)
	side_tabs.add_child(_tab_def_btn)

	_tab_atk_btn = _make_btn("공격조 종족", func() -> void:
		editing_side = "attacker"
		_refresh_species_buttons(), false, 44.0)
	side_tabs.add_child(_tab_atk_btn)

	_roster_scroll = FlickScrollScript.new()
	_roster_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_roster_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left_vbox.add_child(_roster_scroll)

	_roster_grid = GridContainer.new()
	_roster_grid.columns = 1
	_roster_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_roster_grid.add_theme_constant_override("h_separation", 6)
	_roster_grid.add_theme_constant_override("v_separation", 6)
	_roster_scroll.add_child(_roster_grid)

	for sp in SPECIES_ROSTER:
		var sid := str(sp.id)
		var b := _make_btn("%s" % str(sp.name), func() -> void: select_species_for_active_side(sid), false, 44.0)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		var icon := FtlCrew.get_icon_atlas(sid)
		if icon != null:
			b.icon = icon
			b.expand_icon = true
		_roster_grid.add_child(b)
		_species_buttons[sid] = b

	_species_info_label = Label.new()
	_species_info_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_species_info_label.add_theme_font_size_override("font_size", 17)
	_species_info_label.add_theme_color_override("font_color", SOFT)
	left_vbox.add_child(_species_info_label)

	# 우측: 격실벽·방화문 편집 도구바 + 10×3 전술 블럭 데크 + 공방 토글 + 슬라이더
	_right_panel = PanelContainer.new()
	_right_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_right_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_right_panel.add_theme_stylebox_override("panel", _make_style(SURFACE, EDGE, 10, 8))
	_body_split.add_child(_right_panel)

	var right_col := VBoxContainer.new()
	right_col.add_theme_constant_override("separation", 6)
	right_col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_col.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_right_panel.add_child(right_col)

	_summary_label = Label.new()
	_summary_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_summary_label.add_theme_font_size_override("font_size", 18)
	_summary_label.add_theme_color_override("font_color", CYAN)
	right_col.add_child(_summary_label)

	# 격실벽 · 방화문 설치 / 업글 / 제거 전용 도구바
	_tool_grid = GridContainer.new()
	_tool_grid.columns = 5
	_tool_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_tool_grid.add_theme_constant_override("h_separation", 6)
	_tool_grid.add_theme_constant_override("v_separation", 5)
	right_col.add_child(_tool_grid)

	var tool_defs := [
		["move", "승조원 이동"],
		["fire_door", "방화문 설치·업"],
		["wall", "격실벽 설치·업"],
		["remove", "벽·문 제거"],
	]
	for td in tool_defs:
		var tid := str(td[0])
		var tb := _make_btn(str(td[1]), func() -> void: set_active_tool(tid), false, 40.0)
		_tool_grid.add_child(tb)
		_tool_buttons[tid] = tb

	upgrade_sel_btn = _make_btn("선택 업글 ▲", func() -> void: upgrade_selected_or_all_barriers(), true, 40.0)
	_tool_grid.add_child(upgrade_sel_btn)

	arena = CombatArenaCanvas.new()
	arena.host = self
	arena.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	arena.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right_col.add_child(arena)

	_controls_grid = GridContainer.new()
	_controls_grid.columns = 4
	_controls_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_controls_grid.add_theme_constant_override("h_separation", 6)
	_controls_grid.add_theme_constant_override("v_separation", 5)
	right_col.add_child(_controls_grid)

	run_btn = _make_btn("교전: 진행중", func() -> void:
		battle_running = not battle_running
		_sync_switch_labels(), true, 40.0)
	_controls_grid.add_child(run_btn)

	door_btn = _make_btn("방화문: 잠금", func() -> void:
		door_locked = not door_locked
		_apply_door_lock_state()
		_sync_switch_labels(), false, 40.0)
	_controls_grid.add_child(door_btn)

	med_btn = _make_btn("의무실: ON", func() -> void:
		medbay_powered = not medbay_powered
		_sync_switch_labels(), false, 40.0)
	_controls_grid.add_child(med_btn)

	gas_btn = _make_btn("독가스: OFF", func() -> void:
		bio_gas_active = not bio_gas_active
		if bio_gas_active:
			bio_gas_level = maxf(bio_gas_level, 88.0)
		_sync_switch_labels(), false, 40.0)
	_controls_grid.add_child(gas_btn)

	fire_btn = _make_btn("화재: OFF", func() -> void:
		fire_active = not fire_active
		_sync_switch_labels(), false, 40.0)
	_controls_grid.add_child(fire_btn)

	stance_btn = _make_btn("진형: 전방사수", func() -> void:
		defend_in_medbay = not defend_in_medbay
		_reassign_defender_formation()
		_sync_switch_labels(), false, 40.0)
	_controls_grid.add_child(stance_btn)

	_controls_grid.add_child(_make_btn("기본벽 복원", func() -> void:
		firewall_mode = false
		door_locked = true
		reset_default_barriers()
		_sync_switch_labels(), false, 40.0))

	_controls_grid.add_child(_make_btn("라운드 재시작", func() -> void:
		battle_running = true
		reset_round(), true, 40.0))

	_sliders_scroll = FlickScrollScript.new()
	_sliders_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right_col.add_child(_sliders_scroll)

	_sliders_grid = GridContainer.new()
	_sliders_grid.columns = 2
	_sliders_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sliders_grid.add_theme_constant_override("h_separation", 14)
	_sliders_grid.add_theme_constant_override("v_separation", 6)
	_sliders_scroll.add_child(_sliders_grid)

	for sp: Array in SLIDER_SPECS:
		var key := str(sp[0])
		var row := HBoxContainer.new()
		row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_theme_constant_override("separation", 8)
		var nm := Label.new()
		nm.text = str(sp[1])
		nm.custom_minimum_size = Vector2(94, 0)
		nm.clip_text = true
		nm.add_theme_font_size_override("font_size", 18)
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
		vl.custom_minimum_size = Vector2(72, 0)
		vl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		vl.clip_text = true
		vl.add_theme_font_size_override("font_size", 18)
		vl.add_theme_color_override("font_color", GREEN)
		row.add_child(vl)
		_sliders_grid.add_child(row)
		sliders[key] = sl
		slider_labels[key] = vl

	# 하단 좌측 바로가기 독 (ModeSwitcher와 수평 정렬)
	_quick_dock = PanelContainer.new()
	if _ui_theme != null:
		_quick_dock.theme = _ui_theme
	_quick_dock.add_theme_stylebox_override("panel", _make_style(Color(0.03, 0.08, 0.16, 0.96), Color(0.36, 0.84, 1.0, 0.88), 12, 6))
	_ui_layer.add_child(_quick_dock)

	var qrow := HBoxContainer.new()
	qrow.add_theme_constant_override("separation", 6)
	_quick_dock.add_child(qrow)
	var b_ic := _make_btn("◀ 함내 관제", func() -> void: get_tree().change_scene_to_file("res://scenes/interior_command_mode.tscn"), true, 68.0)
	qrow.add_child(b_ic)
	_q_interior_btn = _make_btn("추진 실험실", func() -> void: get_tree().change_scene_to_file("res://scenes/thruster_lab_mode.tscn"), false, 68.0)
	qrow.add_child(_q_interior_btn)
	var b_main := _make_btn("정식 맵", func() -> void: get_tree().change_scene_to_file("res://scenes/main.tscn"), false, 68.0)
	qrow.add_child(b_main)

	_sync_sliders()
	_refresh_species_buttons()
	_refresh_tool_buttons()
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
		_roster_scroll.custom_minimum_size = Vector2(0, clampf(vp.y * 0.13, 118.0, 170.0))
		_roster_grid.columns = 2
		_tool_grid.columns = 3 if not ultra_narrow else 2
		_controls_grid.columns = 3 if ultra_narrow else 4
		_sliders_grid.columns = 1 if vp.x < 700.0 else 2
		_sliders_scroll.custom_minimum_size = Vector2(0, clampf(vp.y * 0.12, 108.0, 156.0))
		arena.custom_minimum_size = Vector2(0, clampf(vp.y * 0.19, 148.0, 220.0))
	else:
		_header_box.vertical = false
		_telemetry_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		_body_split.vertical = false
		_left_panel.custom_minimum_size = Vector2(clampf(vp.x * 0.26, 300.0, 356.0), 0)
		_left_panel.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		_left_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
		_roster_scroll.custom_minimum_size = Vector2.ZERO
		_roster_grid.columns = 1
		_tool_grid.columns = 5
		_controls_grid.columns = 4
		_sliders_grid.columns = 2
		_sliders_scroll.custom_minimum_size = Vector2(0, 108.0)
		arena.custom_minimum_size = Vector2(0, 152.0)

	if _quick_dock != null:
		var ms_reserved := 266.0 if ultra_narrow else 318.0
		var dock_w := minf(480.0, maxf(236.0, vp.x - ms_reserved - 18.0))
		_quick_dock.anchor_left = 0.0
		_quick_dock.anchor_right = 0.0
		_quick_dock.anchor_top = 1.0
		_quick_dock.anchor_bottom = 1.0
		_quick_dock.offset_left = 10.0
		_quick_dock.offset_right = 10.0 + dock_w
		_quick_dock.offset_top = -94.0
		_quick_dock.offset_bottom = -10.0

# ==================== COMPARTMENT WALL & FIRE DOOR INSTALL / UPGRADE / REMOVE ====================

static func edge_key(a: Vector2i, b: Vector2i) -> String:
	if a.x < b.x or (a.x == b.x and a.y <= b.y):
		return "%d,%d:%d,%d" % [a.x, a.y, b.x, b.y]
	return "%d,%d:%d,%d" % [b.x, b.y, a.x, a.y]

func is_valid_interior_edge(a: Vector2i, b: Vector2i) -> bool:
	return is_valid_tile(a) and is_valid_tile(b) and (absi(a.x - b.x) + absi(a.y - b.y) == 1)

func get_barrier(a: Vector2i, b: Vector2i) -> Dictionary:
	var k := edge_key(a, b)
	if barriers.has(k) and float(barriers[k].hp) > 0.0:
		return barriers[k] as Dictionary
	return {}

## 격실벽("wall") 또는 방화문("fire_door") 설치 (Lv.1~Lv.3 지정 가능)
func install_barrier(a: Vector2i, b: Vector2i, kind: String, level: int = 1, mark_custom: bool = true) -> bool:
	if not is_valid_interior_edge(a, b) or not BARRIER_SPECS.has(kind):
		return false
	var lv := clampi(level, 1, MAX_BARRIER_LEVEL)
	var ca := a if (a.x < b.x or (a.x == b.x and a.y <= b.y)) else b
	var cb := b if ca == a else a
	var k := edge_key(ca, cb)
	var mhp := float(BARRIER_SPECS[kind][lv].hp)
	barriers[k] = {
		"a": ca,
		"b": cb,
		"kind": kind,
		"level": lv,
		"hp": mhp,
		"max_hp": mhp,
		"open": (not door_locked) if kind == "fire_door" else false,
		"auto_close_t": 0.0,
	}
	selected_edge_key = k
	if mark_custom:
		_custom_barriers_dirty = true
	_sync_barrier_summary_hp()
	_refresh_tool_buttons()
	if arena != null:
		arena.queue_redraw()
	return true

## 설치된 격실벽 또는 방화문 단계 업그레이드 (Lv.1 -> Lv.2 -> Lv.3, 최대 단계면 내구도 100% 보강)
func upgrade_barrier(a: Vector2i, b: Vector2i) -> int:
	if not is_valid_interior_edge(a, b):
		return 0
	var k := edge_key(a, b)
	if not barriers.has(k) or float(barriers[k].hp) <= 0.0:
		return 0
	var bh: Dictionary = barriers[k]
	var kind := str(bh.kind)
	var cur_lv := clampi(int(bh.level), 1, MAX_BARRIER_LEVEL)
	var next_lv := mini(MAX_BARRIER_LEVEL, cur_lv + 1)
	var new_max := float(BARRIER_SPECS[kind][next_lv].hp)
	bh.level = next_lv
	bh.max_hp = new_max
	bh.hp = new_max
	selected_edge_key = k
	_custom_barriers_dirty = true
	_sync_barrier_summary_hp()
	_refresh_tool_buttons()
	var mid := (Vector2(bh.a as Vector2i) + Vector2(bh.b as Vector2i)) * 0.5
	fx_events.append({
		"kind": "pop", "gx": mid.x, "gy": mid.y,
		"text": "%s!" % str(BARRIER_SPECS[kind][next_lv].label),
		"color": GOLD, "t": 0.0, "dur": 0.80,
	})
	if arena != null:
		arena.queue_redraw()
	return next_lv

## 설치된 격실벽 또는 방화문 제거
func remove_barrier(a: Vector2i, b: Vector2i) -> bool:
	if not is_valid_interior_edge(a, b):
		return false
	var k := edge_key(a, b)
	if not barriers.has(k):
		return false
	var bh: Dictionary = barriers[k]
	var mid := (Vector2(bh.a as Vector2i) + Vector2(bh.b as Vector2i)) * 0.5
	barriers.erase(k)
	if selected_edge_key == k:
		selected_edge_key = ""
	_custom_barriers_dirty = true
	_sync_barrier_summary_hp()
	_refresh_tool_buttons()
	fx_events.append({"kind": "pop", "gx": mid.x, "gy": mid.y, "text": "벽·문 제거!", "color": RED, "t": 0.0, "dur": 0.65})
	if arena != null:
		arena.queue_redraw()
	return true

func upgrade_selected_or_all_barriers() -> int:
	if not selected_edge_key.is_empty() and barriers.has(selected_edge_key):
		var sbh: Dictionary = barriers[selected_edge_key]
		return upgrade_barrier(sbh.a as Vector2i, sbh.b as Vector2i)
	var upgraded := 0
	for k in barriers.keys():
		var bh: Dictionary = barriers[k]
		if float(bh.hp) > 0.0 and int(bh.level) < MAX_BARRIER_LEVEL:
			upgrade_barrier(bh.a as Vector2i, bh.b as Vector2i)
			upgraded += 1
	return upgraded

## 기본 에어록 경계(상·하단 격실벽 Lv.1 + 중앙 방화문 Lv.1) 초기화
func reset_default_barriers() -> void:
	barriers.clear()
	selected_edge_key = ""
	_custom_barriers_dirty = false
	var base_lv := 2 if firewall_mode else 1
	if door_locked or firewall_mode:
		install_barrier(Vector2i(2, 0), Vector2i(3, 0), "wall" if not firewall_mode else "fire_door", base_lv, false)
		install_barrier(Vector2i(2, 1), Vector2i(3, 1), "fire_door", base_lv + (1 if firewall_mode else 0), false)
		install_barrier(Vector2i(2, 2), Vector2i(3, 2), "wall" if not firewall_mode else "fire_door", base_lv, false)
	else:
		install_barrier(Vector2i(2, 0), Vector2i(3, 0), "fire_door", 1, false)
		install_barrier(Vector2i(2, 1), Vector2i(3, 1), "fire_door", 1, false)
		install_barrier(Vector2i(2, 2), Vector2i(3, 2), "fire_door", 1, false)
		_apply_door_lock_state()
	_sync_barrier_summary_hp()
	_refresh_tool_buttons()

func _apply_door_lock_state() -> void:
	for k in barriers.keys():
		var bh: Dictionary = barriers[k]
		if str(bh.kind) == "fire_door" and float(bh.hp) > 0.0:
			bh.open = not door_locked
			bh.auto_close_t = 0.0
	_sync_barrier_summary_hp()

func _sync_barrier_summary_hp() -> void:
	var sum_hp := 0.0
	var sum_max := 0.0
	for k in barriers.keys():
		var bh: Dictionary = barriers[k]
		if float(bh.hp) > 0.0:
			sum_hp += float(bh.hp)
			sum_max += float(bh.max_hp)
	door_hp = sum_hp
	door_max_hp = maxf(1.0, sum_max)

func set_active_tool(tool_id: String) -> void:
	active_tool = tool_id
	_refresh_tool_buttons()
	if arena != null:
		arena.queue_redraw()

func _refresh_tool_buttons() -> void:
	for tid_v in _tool_buttons.keys():
		var tid := str(tid_v)
		var b: Button = _tool_buttons[tid]
		var sel: bool = (tid == active_tool)
		var bcol := RED if tid == "remove" else (GOLD if tid == "wall" else (CYAN if tid == "fire_door" else GREEN))
		b.add_theme_stylebox_override("normal", _make_style(
			Color(0.14, 0.28, 0.36, 0.96) if sel else Color(0.06, 0.11, 0.19, 0.92),
			bcol if sel else EDGE, 8, 5))
		b.add_theme_color_override("font_color", WHITE if sel else SOFT)
	if upgrade_sel_btn != null:
		if not selected_edge_key.is_empty() and barriers.has(selected_edge_key):
			var bh: Dictionary = barriers[selected_edge_key]
			var lv := int(bh.level)
			var kko := "격실벽" if str(bh.kind) == "wall" else "방화문"
			upgrade_sel_btn.text = ("%s Lv.%d->%d ▲" % [kko, lv, lv + 1]) if lv < MAX_BARRIER_LEVEL else ("%s Lv.3 보수" % kko)
		else:
			upgrade_sel_btn.text = "전체벽 업글 ▲"

func interact_edge_with_tool(a: Vector2i, b: Vector2i, tool_id: String) -> String:
	if not is_valid_interior_edge(a, b):
		return ""
	var cur := get_barrier(a, b)
	var mid := (Vector2(a) + Vector2(b)) * 0.5
	if tool_id == "remove":
		return "removed" if remove_barrier(a, b) else ""
	if tool_id in ["fire_door", "wall"]:
		if cur.is_empty() or str(cur.kind) != tool_id:
			install_barrier(a, b, tool_id, 1, true)
			var lbl := str(BARRIER_SPECS[tool_id][1].label)
			fx_events.append({"kind": "pop", "gx": mid.x, "gy": mid.y, "text": "%s 설치!" % lbl, "color": CYAN if tool_id == "fire_door" else GOLD, "t": 0.0, "dur": 0.75})
			return "installed_1"
		else:
			var nlv := upgrade_barrier(a, b)
			return "upgraded_%d" % nlv
	return ""

func on_arena_pointer_action(tile: Vector2i, edge_pair: Array[Vector2i]) -> void:
	if active_tool != "move":
		if edge_pair.size() == 2:
			interact_edge_with_tool(edge_pair[0], edge_pair[1], active_tool)
		return
	on_arena_tile_tapped(tile)

# ==================== 10x3 GRID PATHFINDING & 1-PER-TILE PLACEMENT ====================

static func _cardinal_facing(vec: Vector2) -> Vector2:
	if absf(vec.x) >= absf(vec.y):
		return Vector2.RIGHT if vec.x >= 0.0 else Vector2.LEFT
	return Vector2.DOWN if vec.y >= 0.0 else Vector2.UP

func is_valid_tile(tile: Vector2i) -> bool:
	return tile.x >= 0 and tile.x < GRID_COLS and tile.y >= 0 and tile.y < GRID_ROWS

func is_edge_gas_sealed(a: Vector2i, b: Vector2i) -> bool:
	var bh := get_barrier(a, b)
	if bh.is_empty():
		return false
	if str(bh.kind) == "wall":
		return true
	return (not bool(bh.open)) and door_locked

## 아군/적군별 경계선 통과 차단 판정:
## - 격실벽("wall"): 아군·적군 모두 이동 차단 (아군은 우회, 적군은 우회로 없을 시 타격 돌파!)
## - 방화문("fire_door"): 아군(방어조)은 자동 개폐하며 통과 가능! 적군(공격조)은 잠금 시 통과 불가(타격 돌파)!
func is_edge_blocking_unit(a: Vector2i, b: Vector2i, is_defender: bool) -> bool:
	if absi(a.x - b.x) + absi(a.y - b.y) != 1:
		return true
	var bh := get_barrier(a, b)
	if bh.is_empty():
		return false
	if str(bh.kind) == "wall":
		return true
	# fire_door
	if is_defender:
		return false
	return door_locked and not bool(bh.open)

func is_edge_blocking_melee(a: Vector2i, b: Vector2i) -> bool:
	if absi(a.x - b.x) + absi(a.y - b.y) != 1:
		return true
	var bh := get_barrier(a, b)
	if bh.is_empty():
		return false
	if str(bh.kind) == "wall":
		return true
	return door_locked and not bool(bh.open)

## 4방향 1블럭 최단 경로 탐색 (방어조: 격실벽 우회 & 방화문 통과 / 공격조: 열린 통로 우선, 막혔으면 최소 내구도 방화문·격실벽 돌파 경로 산출!)
func find_grid_path(origin: Vector2i, goal: Vector2i, for_defender: bool = true, allow_breach: bool = false) -> Array[Vector2i]:
	if not is_valid_tile(origin) or not is_valid_tile(goal) or origin == goal:
		return []
	if not allow_breach:
		var q: Array[Vector2i] = [origin]
		var prev: Dictionary = {origin: origin}
		var head := 0
		while head < q.size():
			var cur: Vector2i = q[head]
			head += 1
			for dir in CARDINAL_DIRS:
				var nxt: Vector2i = cur + dir
				if not is_valid_tile(nxt) or prev.has(nxt):
					continue
				if is_edge_blocking_unit(cur, nxt, for_defender):
					continue
				prev[nxt] = cur
				if nxt == goal:
					var route: Array[Vector2i] = []
					var step_c := nxt
					while step_c != origin:
						route.append(step_c)
						step_c = prev[step_c]
					route.reverse()
					return route
				q.append(nxt)
		return []

	# 가중치 Dijkstra (30칸 초소형 격자): 열린 통로(비용 1.0) 우선 우회, 완전 밀폐 시 가장 약한 방화문/격실벽 돌파 선택!
	var dist_map: Dictionary = {origin: 0.0}
	var prev_w: Dictionary = {origin: origin}
	var open_set: Array[Vector2i] = [origin]
	while not open_set.is_empty():
		var best_idx := 0
		var best_d := float(dist_map[open_set[0]])
		for i in range(1, open_set.size()):
			var cd := float(dist_map[open_set[i]])
			if cd < best_d:
				best_d = cd
				best_idx = i
		var cur_w: Vector2i = open_set[best_idx]
		open_set.remove_at(best_idx)
		if cur_w == goal:
			break
		for dir2 in CARDINAL_DIRS:
			var nxt_w: Vector2i = cur_w + dir2
			if not is_valid_tile(nxt_w):
				continue
			var step_cost := 1.0
			if is_edge_blocking_unit(cur_w, nxt_w, for_defender):
				var bh := get_barrier(cur_w, nxt_w)
				var bhp := float(bh.get("hp", 100.0))
				step_cost += (bhp / 22.0) if str(bh.get("kind", "")) == "fire_door" else (bhp / 16.0 + 2.0)
			var nd := best_d + step_cost
			if not dist_map.has(nxt_w) or nd < float(dist_map[nxt_w]) - 0.001:
				dist_map[nxt_w] = nd
				prev_w[nxt_w] = cur_w
				if not (nxt_w in open_set):
					open_set.append(nxt_w)
	if not prev_w.has(goal):
		return []
	var route_w: Array[Vector2i] = []
	var sc := goal
	while sc != origin:
		route_w.append(sc)
		sc = prev_w[sc]
	route_w.reverse()
	return route_w

func unit_grid_pos(u: Dictionary) -> Vector2:
	return Vector2(u.cell as Vector2i).lerp(Vector2(u.next_cell as Vector2i), clampf(float(u.move_t), 0.0, 1.0))

func is_tile_stationary_occupied_by_team(tile: Vector2i, is_def: bool, ignore_id: int = -1) -> bool:
	for u in units:
		if int(u.id) == ignore_id or bool(u.is_defender) != is_def or float(u.hp) <= 0.0:
			continue
		if (u.path as Array).is_empty() and float(u.move_t) <= 0.001 and (u.cell as Vector2i) == tile:
			return true
	return false

## 같은 팀은 한 칸에 1명만 정지 배치(또는 최종 목적지 예약) 가능! (이동 중 경유 통과는 허용)
func is_tile_claimed_by_team(tile: Vector2i, is_def: bool, ignore_id: int = -1) -> bool:
	for u in units:
		if int(u.id) == ignore_id or bool(u.is_defender) != is_def or float(u.hp) <= 0.0:
			continue
		if (u.path as Array).is_empty() and float(u.move_t) <= 0.001:
			if (u.cell as Vector2i) == tile:
				return true
		else:
			if (u.goal_cell as Vector2i) == tile:
				return true
	return false

func find_nearest_free_team_tile(origin: Vector2i, is_def: bool, ignore_id: int = -1, min_col: int = 0, max_col: int = GRID_COLS - 1) -> Vector2i:
	if is_valid_tile(origin) and origin.x >= min_col and origin.x <= max_col and not is_tile_claimed_by_team(origin, is_def, ignore_id):
		return origin
	var best := Vector2i(-1, -1)
	var best_len := 9999
	for col in range(min_col, max_col + 1):
		for row in GRID_ROWS:
			var cand := Vector2i(col, row)
			if is_tile_claimed_by_team(cand, is_def, ignore_id):
				continue
			var r := find_grid_path(origin, cand, is_def, not is_def)
			if not r.is_empty() and r.size() < best_len:
				best_len = r.size()
				best = cand
	return best

## 특정 승조원에게 목표 블럭 4방향 1칸 이동 명령 하달 (같은 팀 점유 블럭이거나 격실벽으로 막힌 곳이면 false 반환)
func command_unit_to_tile(unit_id: int, target_tile: Vector2i) -> bool:
	if not is_valid_tile(target_tile):
		return false
	for u in units:
		if int(u.id) == unit_id and float(u.hp) > 0.0:
			var is_def := bool(u.is_defender)
			if is_tile_claimed_by_team(target_tile, is_def, unit_id):
				fx_events.append({"kind": "pop", "gx": float(target_tile.x), "gy": float(target_tile.y), "text": "같은팀 1칸1명!", "color": GOLD, "t": 0.0, "dur": 0.75})
				return false
			var in_hop := float(u.move_t) > 0.001 and (u.next_cell as Vector2i) != (u.cell as Vector2i)
			var start_t: Vector2i = (u.next_cell as Vector2i) if in_hop else (u.cell as Vector2i)
			if start_t == target_tile:
				u.path = [] as Array[Vector2i]
				u.goal_cell = target_tile
				u.manual_order = true
				return true
			var route := find_grid_path(start_t, target_tile, is_def, not is_def)
			if route.is_empty():
				fx_events.append({"kind": "pop", "gx": float(target_tile.x), "gy": float(target_tile.y), "text": "격실벽 차단!", "color": RED, "t": 0.0, "dur": 0.70})
				return false
			u.path = route
			u.goal_cell = target_tile
			u.manual_order = true
			u.state = "walk"
			return true
	return false

func on_arena_tile_tapped(tile: Vector2i) -> void:
	if not is_valid_tile(tile):
		return
	for u in units:
		if bool(u.is_defender) and float(u.hp) > 0.0 and (u.path as Array).is_empty() and float(u.move_t) <= 0.001 and (u.cell as Vector2i) == tile:
			if int(u.id) != selected_unit_id:
				selected_unit_id = int(u.id)
				if arena != null:
					arena.queue_redraw()
				return
			break
	if selected_unit_id > 0:
		if command_unit_to_tile(selected_unit_id, tile):
			defend_in_medbay = (tile.x >= 6)
			_sync_switch_labels()
	if arena != null:
		arena.queue_redraw()

func _reassign_defender_formation() -> void:
	var slots: Array[Vector2i] = [Vector2i(4, 1), Vector2i(4, 0), Vector2i(4, 2), Vector2i(5, 1)]
	if defend_in_medbay:
		slots = [Vector2i(6, 1), Vector2i(6, 0), Vector2i(6, 2), Vector2i(7, 1)]
	var s_idx := 0
	for u in units:
		if bool(u.is_defender) and float(u.hp) > 0.0:
			u.manual_order = false
			var tgt: Vector2i = slots[mini(s_idx, slots.size() - 1)]
			s_idx += 1
			u.anchor_cell = tgt
			var in_hop := float(u.move_t) > 0.001 and (u.next_cell as Vector2i) != (u.cell as Vector2i)
			var start_t: Vector2i = (u.next_cell as Vector2i) if in_hop else (u.cell as Vector2i)
			var r := find_grid_path(start_t, tgt, true, false)
			if not r.is_empty():
				u.goal_cell = tgt
				u.path = r

func select_species_for_active_side(species_id: String) -> void:
	if editing_side == "defender":
		defender_species = species_id
	else:
		attacker_species = species_id
	_refresh_species_buttons()
	reset_round()

func set_matchup(atk_sp: String, def_sp: String) -> void:
	attacker_species = atk_sp
	defender_species = def_sp
	_refresh_species_buttons()
	reset_round()

func _refresh_species_buttons() -> void:
	if _tab_def_btn != null:
		var def_sel := (editing_side == "defender")
		_tab_def_btn.text = "방어: %s" % defender_species.to_upper()
		_tab_def_btn.add_theme_stylebox_override("normal", _make_style(
			Color(0.09, 0.32, 0.28, 0.96) if def_sel else Color(0.06, 0.11, 0.18, 0.90),
			GREEN if def_sel else EDGE, 8, 5))
	if _tab_atk_btn != null:
		var atk_sel := (editing_side == "attacker")
		_tab_atk_btn.text = "공격: %s" % attacker_species.to_upper()
		_tab_atk_btn.add_theme_stylebox_override("normal", _make_style(
			Color(0.32, 0.11, 0.14, 0.96) if atk_sel else Color(0.06, 0.11, 0.18, 0.90),
			RED if atk_sel else EDGE, 8, 5))

	var cur_target := defender_species if editing_side == "defender" else attacker_species
	for sp in SPECIES_ROSTER:
		var sid := str(sp.id)
		if not _species_buttons.has(sid):
			continue
		var b: Button = _species_buttons[sid]
		var is_cur := (sid == cur_target)
		var accent_c := GREEN if editing_side == "defender" else RED
		b.add_theme_stylebox_override("normal", _make_style(
			Color(0.11, 0.28, 0.38, 0.96) if is_cur else Color(0.06, 0.10, 0.17, 0.90),
			accent_c if is_cur else EDGE, 8, 5))
		b.add_theme_color_override("font_color", WHITE if is_cur else SOFT)

	if _species_info_label != null:
		var asp := FtlCrew.species_spec(attacker_species)
		var dsp := FtlCrew.species_spec(defender_species)
		_species_info_label.text = "[공격] %s: HP %.0f · 전투 %.1f×\n[방어] %s: HP %.0f · 전투 %.1f× · 수리 %.1f×" % [
			str(asp.label), float(asp.max_hp), float(asp.combat),
			str(dsp.label), float(dsp.max_hp), float(dsp.combat), float(dsp.repair),
		]

func _sync_sliders() -> void:
	_syncing_sliders = true
	for sp: Array in SLIDER_SPECS:
		var key := str(sp[0])
		if sliders.has(key):
			(sliders[key] as HSlider).value = float(params[key])
		if slider_labels.has(key):
			(slider_labels[key] as Label).text = str(sp[5]) % float(params[key])
	_syncing_sliders = false

func _on_slider_changed(val: float, key: String, fmt: String) -> void:
	params[key] = val
	if slider_labels.has(key):
		(slider_labels[key] as Label).text = fmt % val
	if not _syncing_sliders and key in ["atk_count", "def_count"]:
		reset_round()

func _sync_switch_labels() -> void:
	if run_btn != null:
		run_btn.text = "교전: 진행중" if battle_running else "교전: 일시정지"
	if door_btn != null:
		door_btn.text = "방화문: 잠금" if door_locked else "방화문: 개방"
	if med_btn != null:
		med_btn.text = "의무실: ON" if medbay_powered else "의무실: OFF"
	if gas_btn != null:
		gas_btn.text = "독가스: ON" if bio_gas_active else "독가스: OFF"
	if fire_btn != null:
		fire_btn.text = "화재: ON" if fire_active else "화재: OFF"
	if stance_btn != null:
		stance_btn.text = "진형: 의무실농성" if defend_in_medbay else "진형: 전방사수"

func reset_round() -> void:
	units.clear()
	fx_events.clear()
	cell_gas.clear()
	round_elapsed = 0.0
	outcome = "ongoing"
	total_atk_dmg_dealt = 0.0
	total_def_dmg_dealt = 0.0
	zoltan_blasts_triggered = 0
	transit_overlaps_observed = 0
	bio_gas_level = 92.0 if bio_gas_active else 0.0

	if not _custom_barriers_dirty:
		reset_default_barriers()
	else:
		# 사용자가 직접 설치·업그레이드·제거한 격실벽·방화문 배치는 유지하면서 내구도를 완충 복원!
		for k in barriers.keys():
			var bh: Dictionary = barriers[k]
			bh.hp = float(bh.max_hp)
			if str(bh.kind) == "fire_door":
				bh.open = not door_locked
				bh.auto_close_t = 0.0
		_sync_barrier_summary_hp()

	if bio_gas_active:
		_step_gas_diffusion(0.5)

	var n_atk := clampi(roundi(float(params.atk_count)), 1, 4)
	var n_def := clampi(roundi(float(params.def_count)), 1, 4)
	var asp := FtlCrew.species_spec(attacker_species)
	var dsp := FtlCrew.species_spec(defender_species)

	var atk_spawns: Array[Vector2i] = [Vector2i(1, 1), Vector2i(1, 0), Vector2i(1, 2), Vector2i(0, 1)]
	for i in n_atk:
		var acell := atk_spawns[i]
		units.append({
			"id": i + 1,
			"is_defender": false,
			"species": attacker_species,
			"hp": float(asp.max_hp),
			"max_hp": float(asp.max_hp),
			"combat_mult": float(asp.combat),
			"move_mult": float(asp.move),
			"fire_immune": bool(asp.fire_immune),
			"no_o2": bool(asp.no_o2),
			"cell": acell,
			"next_cell": acell,
			"move_t": 0.0,
			"path": [] as Array[Vector2i],
			"goal_cell": acell,
			"anchor_cell": acell,
			"manual_order": false,
			"facing": Vector2.RIGHT,
			"state": "walk",
			"anim_t": float(i) * 0.23,
			"slash_cd": 0.15 + float(i) * 0.08,
		})

	var def_spawns: Array[Vector2i] = [Vector2i(4, 1), Vector2i(4, 0), Vector2i(4, 2), Vector2i(5, 1)]
	if defend_in_medbay:
		def_spawns = [Vector2i(6, 1), Vector2i(6, 0), Vector2i(6, 2), Vector2i(7, 1)]
	selected_unit_id = -1
	for j in n_def:
		var dcell := def_spawns[j]
		var uid := 101 + j
		if selected_unit_id < 0:
			selected_unit_id = uid
		units.append({
			"id": uid,
			"is_defender": true,
			"species": defender_species,
			"hp": float(dsp.max_hp),
			"max_hp": float(dsp.max_hp),
			"combat_mult": float(dsp.combat),
			"move_mult": float(dsp.move),
			"fire_immune": bool(dsp.fire_immune),
			"no_o2": bool(dsp.no_o2),
			"cell": dcell,
			"next_cell": dcell,
			"move_t": 0.0,
			"path": [] as Array[Vector2i],
			"goal_cell": dcell,
			"anchor_cell": dcell,
			"manual_order": false,
			"facing": Vector2.LEFT,
			"state": "idle",
			"anim_t": float(j) * 0.19,
			"slash_cd": 0.12 + float(j) * 0.08,
		})
	_update_telemetry_labels()
	if arena != null:
		arena.queue_redraw()

func _physics_process(delta: float) -> void:
	sim_time += delta
	if battle_running and outcome == "ongoing":
		step_combat(delta)
	else:
		_step_fx_only(delta)
	_update_telemetry_labels()
	if arena != null:
		arena.queue_redraw()

func _step_fx_only(dt: float) -> void:
	var keep: Array[Dictionary] = []
	for fx in fx_events:
		fx.t = float(fx.t) + dt
		if float(fx.t) < float(fx.dur):
			keep.append(fx)
	fx_events = keep

## 중앙 초크 복도 배기구(4,1) 기준 생화학 독가스 확산 (격실벽·잠긴 방화문 경계는 기체 완벽 차단!)
func _step_gas_diffusion(dt: float) -> void:
	for k in barriers.keys():
		var bh: Dictionary = barriers[k]
		if str(bh.kind) == "fire_door" and float(bh.auto_close_t) > 0.0:
			bh.auto_close_t = maxf(0.0, float(bh.auto_close_t) - dt)
			if float(bh.auto_close_t) <= 0.0 and door_locked:
				bh.open = false

	if not bio_gas_active:
		bio_gas_level = maxf(0.0, bio_gas_level - 26.0 * dt)
		for gc in cell_gas.keys():
			var nv := maxf(0.0, float(cell_gas[gc]) - 28.0 * dt)
			if nv <= 0.5:
				cell_gas.erase(gc)
			else:
				cell_gas[gc] = nv
		return

	bio_gas_level = minf(100.0, bio_gas_level + 22.0 * dt)
	var vent := Vector2i(4, 1)
	var q: Array[Vector2i] = [vent]
	var visited: Dictionary = {vent: 0}
	var head := 0
	while head < q.size():
		var cur: Vector2i = q[head]
		head += 1
		var dist_steps := int(visited[cur])
		if dist_steps >= 4:
			continue
		for d in CARDINAL_DIRS:
			var nxt: Vector2i = cur + d
			if not is_valid_tile(nxt) or visited.has(nxt):
				continue
			if is_edge_gas_sealed(cur, nxt):
				continue
			# 의무실 내부(col >= 6)는 양압 환기로 기본 보호(방화문/격실벽 개방 시 입구까지만 유입)
			if nxt.x >= 7:
				continue
			visited[nxt] = dist_steps + 1
			q.append(nxt)

	for r in GRID_ROWS:
		for c in GRID_COLS:
			var tv := Vector2i(c, r)
			if visited.has(tv):
				var target_g := clampf(bio_gas_level * (1.0 - float(visited[tv]) * 0.08), 25.0, 100.0)
				cell_gas[tv] = move_toward(float(cell_gas.get(tv, 0.0)), target_g, 85.0 * dt)
			else:
				var decayed := maxf(0.0, float(cell_gas.get(tv, 0.0)) - 34.0 * dt)
				if decayed <= 0.5:
					cell_gas.erase(tv)
				else:
					cell_gas[tv] = decayed

func _find_engageable_opponent(u: Dictionary, opponents: Array[Dictionary]) -> Dictionary:
	var my_cell: Vector2i = u.cell
	var best: Dictionary = {}
	var best_d := 999
	for op in opponents:
		if float(op.hp) <= 0.0:
			continue
		var op_cell: Vector2i = op.cell
		var md: int = absi(op_cell.x - my_cell.x) + absi(op_cell.y - my_cell.y)
		if md <= 1:
			if md == 1 and is_edge_blocking_melee(my_cell, op_cell):
				continue
			if md < best_d:
				best_d = md
				best = op
	return best

func _pick_combat_tile_near_opponents(u: Dictionary, opponents: Array[Dictionary], min_col: int = 0, max_col: int = GRID_COLS - 1) -> Vector2i:
	var is_def := bool(u.is_defender)
	var uid := int(u.id)
	var start_c: Vector2i = (u.next_cell as Vector2i) if float(u.move_t) > 0.001 else (u.cell as Vector2i)
	var best_tile := Vector2i(-1, -1)
	var best_cost := 999999.0
	var adj_offsets: Array[Vector2i] = [Vector2i.LEFT, Vector2i.UP, Vector2i.DOWN, Vector2i.ZERO, Vector2i.RIGHT]
	if is_def:
		adj_offsets = [Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN, Vector2i.ZERO, Vector2i.LEFT]
	for op in opponents:
		if float(op.hp) <= 0.0:
			continue
		var oc: Vector2i = op.cell
		for off in adj_offsets:
			var cand: Vector2i = oc + off
			if not is_valid_tile(cand) or cand.x < min_col or cand.x > max_col:
				continue
			if off != Vector2i.ZERO and not is_def and str(get_barrier(cand, oc).get("kind", "")) == "wall":
				continue
			if off != Vector2i.ZERO and is_def and is_edge_blocking_melee(cand, oc):
				continue
			if is_tile_claimed_by_team(cand, is_def, uid):
				continue
			if cand == start_c:
				return cand
			var pth := find_grid_path(start_c, cand, is_def, not is_def)
			if not pth.is_empty():
				var route_cost := float(pth.size())
				var prev_step := start_c
				for st in pth:
					if is_edge_blocking_unit(prev_step, st, is_def):
						var bh := get_barrier(prev_step, st)
						route_cost += float(bh.get("hp", 90.0)) / 20.0
					prev_step = st
				if route_cost < best_cost:
					best_cost = route_cost
					best_tile = cand
	return best_tile

## 4방향 1블럭 전진 및 방화문 자동 개폐 / 적군 격실벽·방화문 타격 돌파 처리
func _advance_unit_grid_step(u: Dictionary, dt: float, atk_scale: float = 1.0) -> bool:
	var is_def := bool(u.is_defender)
	var uid := int(u.id)
	var upath: Array = u.path
	while not upath.is_empty() and (upath[0] as Vector2i) == (u.cell as Vector2i) and float(u.move_t) <= 0.001:
		upath.pop_front()
	if float(u.move_t) <= 0.001 and upath.is_empty():
		if is_tile_stationary_occupied_by_team(u.cell as Vector2i, is_def, uid):
			var free_t := find_nearest_free_team_tile(u.cell as Vector2i, is_def, uid, 3 if is_def else 0, GRID_COLS - 1)
			if is_valid_tile(free_t) and free_t != (u.cell as Vector2i):
				u.path = find_grid_path(u.cell as Vector2i, free_t, is_def, not is_def)
				u.goal_cell = free_t
				upath = u.path
		if upath.is_empty():
			u.next_cell = u.cell
			u.move_t = 0.0
			return false

	if float(u.move_t) <= 0.001:
		var nxt0: Vector2i = upath[0]
		var cur_c: Vector2i = u.cell
		if is_edge_blocking_unit(cur_c, nxt0, is_def):
			if not is_def:
				# 공격조: 현재 블럭에 다른 공격조가 정지해 있지 않으면 앞의 방화문/격실벽을 타격해 파괴 돌파!
				var bkey := edge_key(cur_c, nxt0)
				if barriers.has(bkey) and float(barriers[bkey].hp) > 0.0:
					if is_tile_stationary_occupied_by_team(cur_c, false, uid):
						# 같은 칸 정지 중복 방지를 위해 인접 빈 타격 칸 탐색
						var alt_b := find_nearest_free_team_tile(cur_c, false, uid, 0, GRID_COLS - 1)
						if is_valid_tile(alt_b) and alt_b != cur_c:
							u.path = find_grid_path(cur_c, alt_b, false, false)
							u.goal_cell = alt_b
							return false
					var bh: Dictionary = barriers[bkey]
					u.next_cell = cur_c
					u.move_t = 0.0
					u.facing = Vector2(nxt0 - cur_c)
					u.state = "sabotage"
					var bash_dps := 22.0 * float(u.combat_mult) * atk_scale
					bh.hp = maxf(0.0, float(bh.hp) - bash_dps * dt)
					if float(bh.hp) <= 0.0:
						var kname := "격실벽" if str(bh.kind) == "wall" else "방화문"
						var mid := (Vector2(cur_c) + Vector2(nxt0)) * 0.5
						barriers.erase(bkey)
						fx_events.append({"kind": "pop", "gx": mid.x, "gy": mid.y, "text": "%s 돌파!" % kname, "color": RED, "t": 0.0, "dur": 0.80})
					_sync_barrier_summary_hp()
					return true
			u.path = [] as Array[Vector2i]
			u.next_cell = cur_c
			u.goal_cell = cur_c
			u.move_t = 0.0
			return false
		# 방어조가 잠긴 방화문을 통과할 때 0.40초 동안 자동 개폐!
		if is_def:
			var fkey := edge_key(cur_c, nxt0)
			if barriers.has(fkey) and str(barriers[fkey].kind) == "fire_door" and float(barriers[fkey].hp) > 0.0:
				barriers[fkey].open = true
				barriers[fkey].auto_close_t = 0.40
		u.next_cell = nxt0
		u.facing = Vector2(nxt0 - cur_c)

	var spd_tiles := 2.85 * float(u.move_mult)
	var new_t := float(u.move_t) + spd_tiles * dt
	for other in units:
		if int(other.id) != uid and float(other.hp) > 0.0:
			if unit_grid_pos(other).distance_to(unit_grid_pos(u)) < 0.45:
				transit_overlaps_observed += 1

	while new_t >= 1.0:
		new_t -= 1.0
		u.cell = u.next_cell
		if not upath.is_empty() and (upath[0] as Vector2i) == (u.cell as Vector2i):
			upath.pop_front()
		if upath.is_empty():
			if is_tile_stationary_occupied_by_team(u.cell as Vector2i, is_def, uid):
				var alt := find_nearest_free_team_tile(u.cell as Vector2i, is_def, uid, 3 if is_def else 0, GRID_COLS - 1)
				if is_valid_tile(alt) and alt != (u.cell as Vector2i):
					u.path = find_grid_path(u.cell as Vector2i, alt, is_def, not is_def)
					u.goal_cell = alt
					upath = u.path
			if upath.is_empty():
				new_t = 0.0
				u.next_cell = u.cell
				u.goal_cell = u.cell
				u.manual_order = false
				break
		var cand_nxt: Vector2i = upath[0]
		if is_edge_blocking_unit(u.cell as Vector2i, cand_nxt, is_def):
			new_t = 0.0
			u.next_cell = u.cell
			break
		if is_def:
			var fkey2 := edge_key(u.cell as Vector2i, cand_nxt)
			if barriers.has(fkey2) and str(barriers[fkey2].kind) == "fire_door" and float(barriers[fkey2].hp) > 0.0:
				barriers[fkey2].open = true
				barriers[fkey2].auto_close_t = 0.40
		u.next_cell = cand_nxt
		u.facing = Vector2(cand_nxt - (u.cell as Vector2i))

	u.move_t = new_t
	var still_moving := (float(u.move_t) > 0.001 or not (u.path as Array).is_empty())
	if still_moving and str(u.state) != "sabotage":
		u.state = "walk"
	return still_moving

func step_combat(dt: float) -> void:
	if dt <= 0.0 or outcome != "ongoing":
		return
	round_elapsed += dt
	_step_fx_only(dt)
	_step_gas_diffusion(dt)

	var m_idx := clampi(roundi(float(params.mastery_lv)), 0, 2)
	var mastery_mult: float = float(MASTERY_MULTS[m_idx])
	var atk_scale := clampf(float(params.atk_mult_pct) / 100.0, 0.2, 4.0)
	var def_armor_mult := 1.0 - clampf(float(params.def_armor_pct) / 100.0, 0.0, 0.85)
	var med_heal := float(params.medbay_heal_s) if medbay_powered else 0.0

	var alive_atk: Array[Dictionary] = []
	var alive_def: Array[Dictionary] = []
	for u in units:
		if float(u.hp) > 0.0:
			if bool(u.is_defender):
				alive_def.append(u)
			else:
				alive_atk.append(u)

	if alive_atk.is_empty() and alive_def.is_empty():
		outcome = "draw"
		return
	if alive_atk.is_empty():
		outcome = "defender_win"
		return
	if alive_def.is_empty():
		outcome = "attacker_win"
		return

	var died_this_step: Array[Dictionary] = []

	for u in units:
		if float(u.hp) <= 0.0:
			continue
		u.anim_t = float(u.anim_t) + dt
		u.slash_cd = maxf(0.0, float(u.slash_cd) - dt)
		var is_def := bool(u.is_defender)
		var ucell: Vector2i = u.cell
		var gpos := unit_grid_pos(u)
		var sp_id := str(u.species)

		# 1) 격실별 생화학 독가스(격실벽·방화문 밀폐 연동) & 화재 및 의무실(col 6..9) 회복
		var tile_g := float(cell_gas.get(ucell, 0.0))
		if tile_g > 5.0:
			var g_mult := 0.0 if sp_id == "lanius" else (0.25 if sp_id in ["rock", "crystal"] else 1.0)
			if g_mult > 0.0:
				u.hp = maxf(0.0, float(u.hp) - 10.8 * (tile_g / 100.0) * g_mult * dt)
		var in_choke := (gpos.x >= 2.6 and gpos.x <= 5.5)
		var in_med := (gpos.x >= 5.6)
		if fire_active and not bool(u.fire_immune):
			var fire_zone := in_med if defend_in_medbay else in_choke
			if fire_zone:
				u.hp = maxf(0.0, float(u.hp) - 5.2 * dt)
		if is_def and in_med and med_heal > 0.0 and float(u.hp) > 0.0:
			u.hp = minf(float(u.max_hp), float(u.hp) + med_heal * dt)

		if float(u.hp) <= 0.0:
			died_this_step.append(u)
			continue

		if bool(u.manual_order) and (float(u.move_t) > 0.001 or not (u.path as Array).is_empty()):
			_advance_unit_grid_step(u, dt, atk_scale)
			continue

		var in_mid_hop := float(u.move_t) > 0.001
		var stacked_same_team := is_tile_stationary_occupied_by_team(ucell, is_def, int(u.id))

		if not is_def:
			if not in_mid_hop and not stacked_same_team:
				var eng_d := _find_engageable_opponent(u, alive_def)
				if not eng_d.is_empty():
					u.path = [] as Array[Vector2i]
					u.next_cell = u.cell
					u.move_t = 0.0
					u.goal_cell = u.cell
					var d_gpos := unit_grid_pos(eng_d)
					u.facing = _cardinal_facing(d_gpos - gpos) if d_gpos.distance_to(gpos) > 0.05 else Vector2.RIGHT
					u.state = "fight"
					var raw_dps := 11.5 * float(u.combat_mult) * atk_scale
					var eff_dps := raw_dps * def_armor_mult
					var dmg := eff_dps * dt
					eng_d.hp = maxf(0.0, float(eng_d.hp) - dmg)
					total_atk_dmg_dealt += dmg
					if float(u.slash_cd) <= 0.0:
						u.slash_cd = 0.42
						fx_events.append({"kind": "slash", "gx": gpos.x, "gy": gpos.y, "tx": d_gpos.x, "ty": d_gpos.y, "color": RED, "t": 0.0, "dur": 0.20})
						fx_events.append({"kind": "pop", "gx": d_gpos.x, "gy": d_gpos.y, "text": "-%.0f" % (eff_dps * 0.42), "color": Color("#ff9a8a"), "t": 0.0, "dur": 0.55})
					if float(eng_d.hp) <= 0.0 and not (eng_d in died_this_step):
						died_this_step.append(eng_d)
					continue

			if not in_mid_hop and ((u.path as Array).is_empty() or is_tile_claimed_by_team(u.goal_cell as Vector2i, false, int(u.id))):
				var atk_tgt := _pick_combat_tile_near_opponents(u, alive_def, 0, GRID_COLS - 1)
				if is_valid_tile(atk_tgt) and atk_tgt != ucell:
					u.path = find_grid_path(ucell, atk_tgt, false, true)
					u.goal_cell = atk_tgt
			if not _advance_unit_grid_step(u, dt, atk_scale):
				u.state = "idle"
		else:
			if not in_mid_hop and not stacked_same_team:
				var eng_a := _find_engageable_opponent(u, alive_atk)
				if not eng_a.is_empty():
					u.path = [] as Array[Vector2i]
					u.next_cell = u.cell
					u.move_t = 0.0
					u.goal_cell = u.cell
					var a_gpos := unit_grid_pos(eng_a)
					u.facing = _cardinal_facing(a_gpos - gpos) if a_gpos.distance_to(gpos) > 0.05 else Vector2.LEFT
					u.state = "fight"
					var def_dps := 11.5 * float(u.combat_mult) * mastery_mult
					var ddmg := def_dps * dt
					eng_a.hp = maxf(0.0, float(eng_a.hp) - ddmg)
					total_def_dmg_dealt += ddmg
					if float(u.slash_cd) <= 0.0:
						u.slash_cd = 0.40
						fx_events.append({"kind": "slash", "gx": gpos.x, "gy": gpos.y, "tx": a_gpos.x, "ty": a_gpos.y, "color": CYAN, "t": 0.0, "dur": 0.20})
						fx_events.append({"kind": "pop", "gx": a_gpos.x, "gy": a_gpos.y, "text": "-%.0f" % (def_dps * 0.40), "color": GREEN, "t": 0.0, "dur": 0.55})
					if float(eng_a.hp) <= 0.0 and not (eng_a in died_this_step):
						died_this_step.append(eng_a)
					continue

			var min_engage_col := 5 if defend_in_medbay else 3
			var has_breacher_in_zone := false
			for a_chk in alive_atk:
				if int(a_chk.cell.x) >= min_engage_col:
					has_breacher_in_zone = true
					break

			if not in_mid_hop and (u.path as Array).is_empty():
				if has_breacher_in_zone:
					var def_tgt := _pick_combat_tile_near_opponents(u, alive_atk, 6 if defend_in_medbay else 3, GRID_COLS - 1)
					if is_valid_tile(def_tgt) and def_tgt != ucell:
						u.path = find_grid_path(ucell, def_tgt, true, false)
						u.goal_cell = def_tgt
				else:
					var anc: Vector2i = u.anchor_cell
					if ucell != anc and not is_tile_claimed_by_team(anc, true, int(u.id)):
						u.path = find_grid_path(ucell, anc, true, false)
						u.goal_cell = anc
			if not _advance_unit_grid_step(u, dt, atk_scale):
				u.facing = Vector2.LEFT
				u.state = "man" if (in_med and medbay_powered) else "idle"

	# 4) FTL 졸탄(Zoltan) 사망 시 에너지 폭발 (주변 2칸 이내 적군에게 즉시 15 고정 피해, 격실벽 너머는 폭발 차단!)
	for dead_u in died_this_step:
		if str(dead_u.species) == "zoltan":
			zoltan_blasts_triggered += 1
			var dpos_z := unit_grid_pos(dead_u)
			var dcell_z: Vector2i = dead_u.cell
			fx_events.append({"kind": "blast", "gx": dpos_z.x, "gy": dpos_z.y, "t": 0.0, "dur": 0.55, "color": GREEN})
			fx_events.append({"kind": "pop", "gx": dpos_z.x, "gy": dpos_z.y, "text": "졸탄 자폭 -15!", "color": GOLD, "t": 0.0, "dur": 0.85})
			for other in units:
				if float(other.hp) > 0.0 and bool(other.is_defender) != bool(dead_u.is_defender):
					if unit_grid_pos(other).distance_to(dpos_z) <= 2.1:
						var ocell: Vector2i = other.cell
						if absi(ocell.x - dcell_z.x) + absi(ocell.y - dcell_z.y) == 1 and str(get_barrier(dcell_z, ocell).get("kind", "")) == "wall":
							continue
						other.hp = maxf(0.0, float(other.hp) - 15.0)

	# 5) 승패 판정 갱신
	var rem_atk := alive_attacker_count()
	var rem_def := alive_defender_count()
	if rem_atk == 0 and rem_def == 0:
		outcome = "draw"
	elif rem_atk == 0:
		outcome = "defender_win"
	elif rem_def == 0:
		outcome = "attacker_win"

func alive_attacker_count() -> int:
	var c := 0
	for u in units:
		if not bool(u.is_defender) and float(u.hp) > 0.0:
			c += 1
	return c

func alive_defender_count() -> int:
	var c := 0
	for u in units:
		if bool(u.is_defender) and float(u.hp) > 0.0:
			c += 1
	return c

func count_barriers_by_kind(kind: String) -> int:
	var cnt := 0
	for k in barriers.keys():
		var bh: Dictionary = barriers[k]
		if float(bh.hp) > 0.0 and str(bh.kind) == kind:
			cnt += 1
	return cnt

func _update_telemetry_labels() -> void:
	var rem_a := alive_attacker_count()
	var rem_d := alive_defender_count()
	var status_ko := "교전 중"
	if outcome == "defender_win":
		status_ko = "방어 성공!"
	elif outcome == "attacker_win":
		status_ko = "침투 돌파!"
	elif outcome == "draw":
		status_ko = "상호 전멸"

	var m_idx := clampi(roundi(float(params.mastery_lv)), 0, 2)
	var def_unit_dps := 11.5 * float(FtlCrew.species_spec(defender_species).combat) * float(MASTERY_MULTS[m_idx])
	var atk_eff_dps := 11.5 * float(FtlCrew.species_spec(attacker_species).combat) * (float(params.atk_mult_pct) / 100.0) * (1.0 - float(params.def_armor_pct) / 100.0)

	var n_walls := count_barriers_by_kind("wall")
	var n_doors := count_barriers_by_kind("fire_door")

	if _telemetry_label != null:
		_telemetry_label.text = "%.1fs | 공%d vs 방%d | 격실벽 %d·방화문 %d | %s" % [round_elapsed, rem_a, rem_d, n_walls, n_doors, status_ko]
		_telemetry_label.add_theme_color_override("font_color", GREEN if outcome == "defender_win" else (RED if outcome == "attacker_win" else GOLD))

	if _summary_label != null:
		var tool_hint := "타일 클릭: 4방향 이동 (우클릭: 경계 제거)"
		if active_tool == "fire_door":
			tool_hint = "블럭 경계선 클릭: 방화문 Lv.1 설치 -> 재클릭 Lv.2/Lv.3 업글!"
		elif active_tool == "wall":
			tool_hint = "블럭 경계선 클릭: 격실벽 Lv.1 설치 -> 재클릭 Lv.2/Lv.3 업글!"
		elif active_tool == "remove":
			tool_hint = "블럭 경계선 클릭: 설치된 격실벽·방화문 즉시 제거!"
		_summary_label.text = "공격DPS %.1f (장갑 -%.0f%%) vs 방어DPS %.1f | 의무 +%.0f/s | %s" % [
			atk_eff_dps, float(params.def_armor_pct), def_unit_dps,
			(float(params.medbay_heal_s) if medbay_powered else 0.0), tool_hint,
		]
