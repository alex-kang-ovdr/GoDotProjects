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

const GRID_COLS := 10 # 기본(<=4v4) 10×3 | 대규모(>4명, 20v20) 자동 16×6 전술 데크 확장
const GRID_ROWS := 3
const LARGE_GRID_COLS := 16 # 0..4: 침투 에어록(30칸) | 5..10: 중앙 초크(36칸) | 11..15: 의무실·코어(30칸)
const LARGE_GRID_ROWS := 6
const MAX_TEAM_UNITS := 20
const MAX_FX_EVENTS := 48
const CARDINAL_DIRS := [Vector2i.RIGHT, Vector2i.LEFT, Vector2i.DOWN, Vector2i.UP]
const MAX_BARRIER_LEVEL := 3
const DIR_DX := [1, -1, 0, 0]
const DIR_DY := [0, 0, 1, -1]
const DIR_OPP := [1, 0, 3, 2]
const LARGE_SQUAD_ATK_MIX := [
	"mantis", "mantis", "mantis", "mantis", "mantis", "mantis",
	"rock", "rock", "rock", "rock",
	"zoltan", "zoltan", "zoltan",
	"lanius", "lanius", "lanius",
	"crystal", "crystal", "human", "slug",
]
const LARGE_SQUAD_DEF_MIX := [
	"rock", "rock", "rock", "rock", "rock",
	"crystal", "crystal", "crystal", "crystal",
	"mantis", "mantis", "mantis", "mantis",
	"human", "human", "human",
	"zoltan", "zoltan", "engi", "slug",
]

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
	["atk_count", "공격 인원", 1.0, 20.0, 1.0, "%.0f명"],
	["def_count", "방어 인원", 1.0, 20.0, 1.0, "%.0f명"],
	["atk_mult_pct", "공격 배율", 50.0, 250.0, 10.0, "%.0f%%"],
	["def_armor_pct", "방어 감쇠", 0.0, 70.0, 5.0, "%.0f%%"],
	["mastery_lv", "전투 숙련", 0.0, 2.0, 1.0, "%.0f성"],
	["medbay_heal_s", "의무 회복", 0.0, 30.0, 2.0, "%.0f/s"],
]

const MASTERY_MULTS := [1.0, 1.10, 1.20]

class StaticDeckLayer extends Control:
	var arena_ref: CombatArenaCanvas = null

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		set_anchors_preset(Control.PRESET_FULL_RECT)

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color("#050c15"), true)
		if arena_ref == null or arena_ref.host == null or size.x < 40.0 or size.y < 40.0:
			return
		var host: CrewCombatLabMode = arena_ref.host
		var font: Font = host._ui_font if host._ui_font != null else ThemeDB.fallback_font
		var m := arena_ref.grid_metrics()
		var orig: Vector2 = m.origin
		var cpx := float(m.cell_px)
		var deck_h := float(m.total_h)
		var gcols: int = host.grid_cols
		var grows: int = host.grid_rows
		var air_end: int = host.airlock_max_col()
		var chk_end: int = host.choke_max_col()
		var med_start: int = chk_end + 1
		var air_cols := float(air_end + 1)
		var chk_cols := float(chk_end - air_end)
		var med_cols := float(gcols - med_start)

		var r_air := Rect2(orig, Vector2(cpx * air_cols - 2.0, deck_h))
		var r_chk := Rect2(orig + Vector2(cpx * air_cols + 2.0, 0.0), Vector2(cpx * chk_cols - 4.0, deck_h))
		var r_med := Rect2(orig + Vector2(cpx * float(med_start) + 2.0, 0.0), Vector2(cpx * med_cols - 2.0, deck_h))

		# 1) 정적 사각 전술 블럭 타일 (배경 + 격자선 — 장벽/모드 변경 시에만 재렌더!)
		var col_air := Color("#1a1622")
		var col_chk := Color("#132535")
		var col_med := Color("#112f29") if host.medbay_powered else Color("#18212a")
		var col_grid := Color(0.28, 0.56, 0.74, 0.28)
		var pad := 1.2 if cpx < 30.0 else 1.5
		var inner_sz := Vector2(cpx - pad * 2.0, cpx - pad * 2.0)
		for row in grows:
			var py := orig.y + float(row) * cpx + pad
			for col in gcols:
				var cell_r := Rect2(Vector2(orig.x + float(col) * cpx + pad, py), inner_sz)
				var base_col := col_air if col <= air_end else (col_chk if col <= chk_end else col_med)
				draw_rect(cell_r, base_col, true)
				draw_rect(cell_r, col_grid, false, 1.0)

		draw_rect(r_air, Color("#ff6e66", 0.72), false, 1.8)
		draw_rect(r_chk, CYAN if not host.defend_in_medbay else Color("#4a7a9b"), false, 2.0)
		draw_rect(r_med, GREEN if host.medbay_powered else Color("#526474"), false, 2.2)

		if font != null:
			var lbl_sz := 13 if gcols > 10 else 15
			draw_string(font, Vector2(r_air.position.x + 2.0, orig.y - 5.0), "침투 에어록 (%d×%d)" % [int(air_cols), grows], HORIZONTAL_ALIGNMENT_LEFT, r_air.size.x, lbl_sz, Color("#ff9e98"))
			draw_string(font, Vector2(r_chk.position.x + 2.0, orig.y - 5.0), "초크 복도 (%d×%d)%s" % [int(chk_cols), grows, " [방어]" if not host.defend_in_medbay else ""], HORIZONTAL_ALIGNMENT_LEFT, r_chk.size.x + 16.0, lbl_sz, CYAN)
			draw_string(font, Vector2(r_med.position.x + 2.0, orig.y - 5.0), "의무실·코어 (%d×%d)%s" % [int(med_cols), grows, " [방어]" if host.defend_in_medbay else ""], HORIZONTAL_ALIGNMENT_LEFT, r_med.size.x, lbl_sz, GREEN if host.medbay_powered else SOFT)

		# 2) 산업용 리벳·주름철판 외곽 선체 격벽 프레임 + 경계선별 격실벽/방화문 (정적 레이어 캐싱!)
		BulkheadVis.draw_deck_outer_frame(self, orig, gcols, grows, cpx)
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

class DynamicArenaLayer extends Control:
	var arena_ref: CombatArenaCanvas = null

	func _ready() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		set_anchors_preset(Control.PRESET_FULL_RECT)

	func _draw() -> void:
		if arena_ref == null or arena_ref.host == null or size.x < 40.0 or size.y < 40.0:
			return
		var host: CrewCombatLabMode = arena_ref.host
		var font: Font = host._ui_font if host._ui_font != null else ThemeDB.fallback_font
		var m := arena_ref.grid_metrics()
		var orig: Vector2 = m.origin
		var cpx := float(m.cell_px)
		var deck_h := float(m.total_h)
		var gcols: int = host.grid_cols
		var air_end: int = host.airlock_max_col()
		var chk_end: int = host.choke_max_col()
		var med_start: int = chk_end + 1
		var air_cols := float(air_end + 1)
		var chk_cols := float(chk_end - air_end)
		var med_cols := float(gcols - med_start)

		var r_chk := Rect2(orig + Vector2(cpx * air_cols + 2.0, 0.0), Vector2(cpx * chk_cols - 4.0, deck_h))
		var r_med := Rect2(orig + Vector2(cpx * float(med_start) + 2.0, 0.0), Vector2(cpx * med_cols - 2.0, deck_h))

		# 1) 생화학 독가스 오버레이 (활성 셀만 O(gas_cells) 순회!)
		if not host.cell_gas.is_empty():
			var pad := 3.2 if cpx < 30.0 else 3.5
			var g_sz := Vector2(maxf(4.0, cpx - pad * 2.0), maxf(4.0, cpx - pad * 2.0))
			for cv_v in host.cell_gas.keys():
				var g_conc := float(host.cell_gas[cv_v])
				if g_conc <= 1.0:
					continue
				var cv: Vector2i = cv_v
				var tl := orig + Vector2(float(cv.x) * cpx + pad, float(cv.y) * cpx + pad)
				var cell_r := Rect2(tl, g_sz)
				var ga := clampf(g_conc / 100.0, 0.08, 1.0)
				draw_rect(cell_r, Color(0.22, 0.90, 0.34, 0.34 * ga), true)
				var g_center := cell_r.get_center() + Vector2(cos(host.sim_time * 3.0 + float(cv.x)), sin(host.sim_time * 2.7 + float(cv.y))) * 3.0
				draw_circle(g_center, clampf(cpx * 0.16, 3.0, 6.5) * ga + 1.5, Color(0.56, 1.0, 0.40, 0.36 * ga))

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
		var pipe_y := orig.y + deck_h + clampf((size.y - (orig.y + deck_h)) * 0.55, 8.0, 18.0)
		var p_start := Vector2(r_med.end.x - 16.0, pipe_y)
		var p_end := Vector2(r_med.get_center().x, r_med.end.y - 4.0)
		var p_mid := Vector2(r_med.get_center().x, pipe_y)
		var p_col := Color("#ffd466") if host.medbay_powered else Color("#4a3535")
		draw_line(p_start, p_mid, p_col, 3.2)
		draw_line(p_mid, p_end, p_col, 3.2)
		var chev := (p_start + p_mid) * 0.5
		draw_line(chev + Vector2(6.0, -4.0), chev, Color(1.0, 0.98, 0.82, 0.88), 1.8)
		draw_line(chev + Vector2(6.0, 4.0), chev, Color(1.0, 0.98, 0.82, 0.88), 1.8)
		if host.medbay_powered:
			var pulse_r := 14.0 + 5.0 * (0.5 + 0.5 * sin(host.sim_time * 4.5))
			draw_arc(r_med.get_center(), pulse_r, 0.0, TAU, 20, Color(0.32, 1.0, 0.68, 0.42), 2.0)
			for ei in 3:
				var et := fmod(host.sim_time * 1.45 + float(ei) * 0.33, 1.0)
				var ep := p_start.lerp(p_mid, et * 1.4) if et < 0.7 else p_mid.lerp(p_end, (et - 0.7) / 0.3)
				draw_circle(ep, 3.8, Color("#66f6ff"))
				draw_circle(ep, 1.8, Color.WHITE)

		# 4) 호버 프리뷰
		if host.active_tool == "move":
			if host.is_valid_tile(arena_ref.hovered_tile):
				var hrect := Rect2(orig + Vector2(float(arena_ref.hovered_tile.x) * cpx + 2.0, float(arena_ref.hovered_tile.y) * cpx + 2.0), Vector2(cpx - 4.0, cpx - 4.0))
				var occupied_same := host.is_tile_claimed_by_team(arena_ref.hovered_tile, true, host.selected_unit_id)
				draw_rect(hrect, RED if occupied_same else GOLD, false, 2.2)
		elif host.is_valid_tile(arena_ref.hovered_edge_a) and host.is_valid_tile(arena_ref.hovered_edge_b):
			var hmid := orig + ((Vector2(arena_ref.hovered_edge_a) + Vector2(arena_ref.hovered_edge_b) + Vector2.ONE) * 0.5) * cpx
			var hdiff := arena_ref.hovered_edge_b - arena_ref.hovered_edge_a
			var htan := Vector2(-float(hdiff.y), float(hdiff.x)) * (cpx * 0.48)
			var hcol := RED if host.active_tool == "remove" else (GOLD if host.active_tool == "wall" else CYAN)
			draw_line(hmid - htan, hmid + htan, hcol, 4.6)

		# 5) 4방향 직각 이동 경로선 (대규모 20v20 시에는 선택 유닛 + 간결한 다음 한칸 표시로 시인성·성능 동시 확보!)
		var dense_mode := host.units.size() > 10
		var spr_sz := clampf(cpx * 0.78, 20.0, 38.0)
		var def_armor_pct := float(host.params.def_armor_pct)
		var draw_armor_ring := def_armor_pct > 0.5
		var arm_col := Color(0.42, 0.88, 1.0, clampf(def_armor_pct / 100.0, 0.14, 0.74))
		var arm_segs := 12 if dense_mode else 18

		for unit in host.units:
			if float(unit.hp) <= 0.0:
				continue
			var upath: Array = unit.path
			if upath.is_empty():
				continue
			var is_sel_u := int(unit.id) == host.selected_unit_id
			if dense_mode and not is_sel_u:
				continue
			var gpos := host.unit_grid_pos(unit)
			var prev_pt := arena_ref.tile_center_px(gpos, m)
			var pcol := Color(0.45, 1.0, 0.76, 0.55) if bool(unit.is_defender) else Color(1.0, 0.52, 0.48, 0.50)
			if float(unit.move_t) > 0.001:
				var hop_pt := arena_ref.tile_center_px(Vector2(unit.next_cell as Vector2i), m)
				draw_line(prev_pt, hop_pt, pcol, 2.0)
				prev_pt = hop_pt
			for wp in upath:
				var wpt := arena_ref.tile_center_px(Vector2(wp as Vector2i), m)
				draw_line(prev_pt, wpt, pcol, 2.0)
				prev_pt = wpt
			draw_rect(Rect2(prev_pt - Vector2(5.0, 5.0), Vector2(10.0, 10.0)), pcol, false, 1.6)

		# 6) 승조원 스프라이트 렌더링 (O(1) 같은 칸 교전 대치 오프셋!)
		var split_dx := clampf(cpx * 0.16, 4.0, 7.0)
		for unit in host.units:
			if float(unit.hp) <= 0.0:
				continue
			var gpos2 := host.unit_grid_pos(unit)
			var screen_pos2 := arena_ref.tile_center_px(gpos2, m)
			var is_def := bool(unit.is_defender)
			if (unit.path as Array).is_empty() and float(unit.move_t) <= 0.001:
				if host.has_stationary_opponent_at_cell(unit.cell as Vector2i, is_def):
					screen_pos2.x += (split_dx if is_def else -split_dx)
			if int(unit.id) == host.selected_unit_id and host.active_tool == "move":
				var sel_tl := orig + Vector2(float(unit.cell.x) * cpx + 2.5, float(unit.cell.y) * cpx + 2.5)
				draw_rect(Rect2(sel_tl, Vector2(cpx - 5.0, cpx - 5.0)), Color(1.0, 0.86, 0.36, 0.85), false, 2.0)
			if is_def and draw_armor_ring:
				draw_arc(screen_pos2, spr_sz * 0.52, 0.0, TAU, arm_segs, arm_col, 2.0)
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

		# 7) 백병전 타격 섬광 · 졸탄 자폭 충격파 · 플로팅 데미지/설치/업글 배지
		var pop_font_sz := 13 if dense_mode else 15
		for fx in host.fx_events:
			var ratio := clampf(float(fx.t) / maxf(0.08, float(fx.dur)), 0.0, 1.0)
			var fpos := arena_ref.tile_center_px(Vector2(float(fx.gx), float(fx.gy)), m)
			var fkind := str(fx.kind)
			if fkind == "blast":
				var br := 12.0 + cpx * 1.25 * ratio
				draw_arc(fpos, br, 0.0, TAU, 20, Color(0.62, 1.0, 0.45, 1.0 - ratio), 3.2)
			elif fkind == "slash":
				var tpos := arena_ref.tile_center_px(Vector2(float(fx.tx), float(fx.ty)), m)
				draw_line(fpos, fpos.lerp(tpos, 1.0 - ratio * 0.4), fx.color as Color, 2.6 * (1.0 - ratio) + 1.0)
			elif fkind == "pop" and font != null:
				var fc: Color = fx.color
				draw_string(font, fpos + Vector2(-50.0, -14.0 - ratio * 16.0), str(fx.text), HORIZONTAL_ALIGNMENT_CENTER, 100.0, pop_font_sz, Color(fc.r, fc.g, fc.b, 1.0 - ratio))

class CombatArenaCanvas extends Control:
	var host: CrewCombatLabMode = null
	var hovered_tile := Vector2i(-1, -1)
	var hovered_edge_a := Vector2i(-1, -1)
	var hovered_edge_b := Vector2i(-1, -1)
	var _static_layer: StaticDeckLayer = null
	var _dynamic_layer: DynamicArenaLayer = null
	var _last_static_sig := ""

	func _ready() -> void:
		clip_contents = true
		mouse_filter = Control.MOUSE_FILTER_STOP
		custom_minimum_size = Vector2(0, 165)
		_static_layer = StaticDeckLayer.new()
		_static_layer.arena_ref = self
		add_child(_static_layer)
		_dynamic_layer = DynamicArenaLayer.new()
		_dynamic_layer.arena_ref = self
		add_child(_dynamic_layer)

	func mark_static_dirty() -> void:
		_last_static_sig = ""
		if _static_layer != null:
			_static_layer.queue_redraw()
		if _dynamic_layer != null:
			_dynamic_layer.queue_redraw()

	func refresh_layers(force_static: bool = false) -> void:
		if host == null:
			return
		var sig := "%d:%d:%d:%d:%d:%d:%d:%s:%d:%.0f" % [
			int(size.x), int(size.y), host.grid_cols, host.grid_rows,
			1 if host.medbay_powered else 0,
			1 if host.defend_in_medbay else 0,
			1 if host.door_locked else 0,
			host.selected_edge_key,
			host._barrier_version,
			floorf(host.door_hp * 0.5),
		]
		if force_static or sig != _last_static_sig:
			_last_static_sig = sig
			if _static_layer != null:
				_static_layer.queue_redraw()
		if _dynamic_layer != null:
			_dynamic_layer.queue_redraw()

	func grid_metrics() -> Dictionary:
		var gcols := host.grid_cols if host != null else GRID_COLS
		var grows := host.grid_rows if host != null else GRID_ROWS
		var top_pad := 42.0 if grows > 3 else 48.0
		var cell_px := clampf(minf((size.x - 20.0) / float(gcols), (size.y - top_pad) / float(grows)), 18.0, 66.0)
		var total_w := cell_px * float(gcols)
		var total_h := cell_px * float(grows)
		var ox := (size.x - total_w) * 0.5
		var oy := clampf((size.y - total_h) * 0.46, 18.0, 36.0)
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
		var gcols := host.grid_cols if host != null else GRID_COLS
		var grows := host.grid_rows if host != null else GRID_ROWS
		var m := grid_metrics()
		var orig: Vector2 = m.origin
		var cpx := maxf(1.0, float(m.cell_px))
		var gx := (local_pos.x - orig.x) / cpx
		var gy := (local_pos.y - orig.y) / cpx
		if gx < -0.35 or gx > float(gcols) + 0.35 or gy < -0.35 or gy > float(grows) + 0.35:
			return []
		var col := clampi(floori(gx), 0, gcols - 1)
		var row := clampi(floori(gy), 0, grows - 1)
		var base := Vector2i(col, row)
		var best_nb := Vector2i(-1, -1)
		var best_dist := 999.0
		for d in CARDINAL_DIRS:
			var nb: Vector2i = base + d
			if nb.x < 0 or nb.x >= gcols or nb.y < 0 or nb.y >= grows:
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
			refresh_layers(false)
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
var battle_20v20_btn: Button
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
var mixed_squad_mode := false

var grid_cols: int = GRID_COLS
var grid_rows: int = GRID_ROWS
var _grid_size: int = GRID_COLS * GRID_ROWS

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

# 성능 계측 및 고속 평탄화(Flat) 공간·경로 캐시
var last_step_ms := 0.0
var avg_step_ms := 0.0
var perf_pathfinds_last_step := 0
var _barrier_version: int = 1
var _edge_table_dirty := true
var _cached_barrier_count: int = -1
var _edge_barrier: Array = []
var _edge_barrier_key: PackedStringArray = PackedStringArray()

var _occ_valid := false
var _stat_def_cnt: PackedInt32Array = PackedInt32Array()
var _stat_def_first: PackedInt32Array = PackedInt32Array()
var _stat_atk_cnt: PackedInt32Array = PackedInt32Array()
var _stat_atk_first: PackedInt32Array = PackedInt32Array()
var _claim_def_cnt: PackedInt32Array = PackedInt32Array()
var _claim_def_first: PackedInt32Array = PackedInt32Array()
var _claim_atk_cnt: PackedInt32Array = PackedInt32Array()
var _claim_atk_first: PackedInt32Array = PackedInt32Array()
var _cell_def_idx: PackedInt32Array = PackedInt32Array()
var _cell_atk_idx: PackedInt32Array = PackedInt32Array()
var _cell_all_cnt: PackedInt32Array = PackedInt32Array()

var _pf_dist: PackedFloat32Array = PackedFloat32Array()
var _pf_prev: PackedInt32Array = PackedInt32Array()
var _pf_queue: PackedInt32Array = PackedInt32Array()
var _pf_heap_node: PackedInt32Array = PackedInt32Array()
var _pf_heap_dist: PackedFloat32Array = PackedFloat32Array()
var _pf_visited: PackedByteArray = PackedByteArray()
var _cand_mask: PackedByteArray = PackedByteArray()
var _gas_dist: PackedInt32Array = PackedInt32Array()
var _gas_reach_cells: PackedInt32Array = PackedInt32Array()
var _last_gas_barrier_ver: int = -1
var _last_gas_grid_size: int = -1
var _telemetry_accum := 0.0
var _last_telemetry_color := Color.TRANSPARENT

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

	# 격실벽 · 방화문 설치 / 업글 / 제거 & 20v20 대규모 전투 프리셋 도구바
	_tool_grid = GridContainer.new()
	_tool_grid.columns = 6
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

	battle_20v20_btn = _make_btn("⚔ 20v20 시뮬", func() -> void: setup_20v20_battle(true), true, 40.0)
	battle_20v20_btn.add_theme_stylebox_override("normal", _make_style(Color(0.30, 0.17, 0.07, 0.96), GOLD, 8, 5))
	battle_20v20_btn.add_theme_color_override("font_color", GOLD)
	_tool_grid.add_child(battle_20v20_btn)

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
		_tool_grid.columns = 6
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

func airlock_max_col() -> int:
	return 2 if grid_cols <= GRID_COLS else 4

func choke_max_col() -> int:
	return 5 if grid_cols <= GRID_COLS else 10

func medbay_min_col() -> int:
	return choke_max_col() + 1

func vent_cell() -> Vector2i:
	return Vector2i(4, 1) if grid_cols <= GRID_COLS else Vector2i(7, 2)

func _cell_idx(c: Vector2i) -> int:
	return c.y * grid_cols + c.x

func _ensure_grid_buffers() -> void:
	var sz := grid_cols * grid_rows
	if _grid_size == sz and _pf_dist.size() == sz and _edge_barrier.size() == sz * 4:
		return
	_grid_size = sz
	_edge_barrier.resize(sz * 4)
	_edge_barrier.fill(null)
	_edge_barrier_key.resize(sz * 4)
	_edge_barrier_key.fill("")
	_stat_def_cnt.resize(sz)
	_stat_def_first.resize(sz)
	_stat_atk_cnt.resize(sz)
	_stat_atk_first.resize(sz)
	_claim_def_cnt.resize(sz)
	_claim_def_first.resize(sz)
	_claim_atk_cnt.resize(sz)
	_claim_atk_first.resize(sz)
	_cell_def_idx.resize(sz)
	_cell_atk_idx.resize(sz)
	_cell_all_cnt.resize(sz)
	_pf_dist.resize(sz)
	_pf_prev.resize(sz)
	_pf_queue.resize(sz)
	_pf_heap_node.resize(sz * 4 + 8)
	_pf_heap_dist.resize(sz * 4 + 8)
	_pf_visited.resize(sz)
	_cand_mask.resize(sz)
	_gas_dist.resize(sz)
	_edge_table_dirty = true
	_occ_valid = false

func _mark_barriers_dirty() -> void:
	_barrier_version += 1
	_edge_table_dirty = true

func _ensure_edge_table() -> void:
	_ensure_grid_buffers()
	if not _edge_table_dirty and _cached_barrier_count == barriers.size():
		return
	_edge_barrier.fill(null)
	_edge_barrier_key.fill("")
	for k_v in barriers.keys():
		var bh: Dictionary = barriers[k_v]
		if float(bh.hp) <= 0.0:
			continue
		var ca: Vector2i = bh.a
		var cb: Vector2i = bh.b
		if not is_valid_tile(ca) or not is_valid_tile(cb):
			continue
		var dx := cb.x - ca.x
		var dy := cb.y - ca.y
		var d_idx := -1
		if dx == 1 and dy == 0:
			d_idx = 0
		elif dx == -1 and dy == 0:
			d_idx = 1
		elif dx == 0 and dy == 1:
			d_idx = 2
		elif dx == 0 and dy == -1:
			d_idx = 3
		if d_idx < 0:
			continue
		var ia := ca.y * grid_cols + ca.x
		var ib := cb.y * grid_cols + cb.x
		var k_str := str(k_v)
		_edge_barrier[ia * 4 + d_idx] = bh
		_edge_barrier_key[ia * 4 + d_idx] = k_str
		var opp: int = DIR_OPP[d_idx]
		_edge_barrier[ib * 4 + opp] = bh
		_edge_barrier_key[ib * 4 + opp] = k_str
	_cached_barrier_count = barriers.size()
	_edge_table_dirty = false

func _push_fx(item: Dictionary) -> void:
	if fx_events.size() >= MAX_FX_EVENTS:
		if str(item.get("kind", "")) != "blast":
			# 오래된 일반 슬래시/팝은 덮어쓰고 자폭·핵심 알림 우선 유지
			for i in fx_events.size():
				if str(fx_events[i].get("kind", "")) != "blast":
					fx_events[i] = item
					return
			return
	fx_events.append(item)

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
	_mark_barriers_dirty()
	_sync_barrier_summary_hp()
	_refresh_tool_buttons()
	if arena != null:
		arena.refresh_layers(true)
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
	_mark_barriers_dirty()
	_sync_barrier_summary_hp()
	_refresh_tool_buttons()
	var mid := (Vector2(bh.a as Vector2i) + Vector2(bh.b as Vector2i)) * 0.5
	_push_fx({
		"kind": "pop", "gx": mid.x, "gy": mid.y,
		"text": "%s!" % str(BARRIER_SPECS[kind][next_lv].label),
		"color": GOLD, "t": 0.0, "dur": 0.80,
	})
	if arena != null:
		arena.refresh_layers(true)
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
	_mark_barriers_dirty()
	_sync_barrier_summary_hp()
	_refresh_tool_buttons()
	_push_fx({"kind": "pop", "gx": mid.x, "gy": mid.y, "text": "벽·문 제거!", "color": RED, "t": 0.0, "dur": 0.65})
	if arena != null:
		arena.refresh_layers(true)
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

## 기본 에어록 경계 초기화 (10x3: 상·하 격실벽+중앙 방화문 / 16x6 대규모: 쌍둥이 방화문 초크라인!)
func reset_default_barriers() -> void:
	barriers.clear()
	selected_edge_key = ""
	_custom_barriers_dirty = false
	var base_lv := 2 if firewall_mode else 1
	var wall_x := airlock_max_col()
	if grid_cols <= GRID_COLS:
		if door_locked or firewall_mode:
			install_barrier(Vector2i(wall_x, 0), Vector2i(wall_x + 1, 0), "wall" if not firewall_mode else "fire_door", base_lv, false)
			install_barrier(Vector2i(wall_x, 1), Vector2i(wall_x + 1, 1), "fire_door", base_lv + (1 if firewall_mode else 0), false)
			install_barrier(Vector2i(wall_x, 2), Vector2i(wall_x + 1, 2), "wall" if not firewall_mode else "fire_door", base_lv, false)
		else:
			for r in grid_rows:
				install_barrier(Vector2i(wall_x, r), Vector2i(wall_x + 1, r), "fire_door", 1, false)
			_apply_door_lock_state()
	else:
		# 16×6 대규모 20 vs 20 전술 초크라인: 행 1·4 쌍둥이 방화문 + 나머지 격실벽!
		for r in grid_rows:
			var is_door_lane := (r == 1 or r == 4)
			if door_locked or firewall_mode:
				var kind := "fire_door" if (is_door_lane or firewall_mode) else "wall"
				var lv := (base_lv + (1 if firewall_mode else 0)) if is_door_lane else base_lv
				install_barrier(Vector2i(wall_x, r), Vector2i(wall_x + 1, r), kind, lv, false)
			else:
				install_barrier(Vector2i(wall_x, r), Vector2i(wall_x + 1, r), "fire_door" if is_door_lane else "wall", 1, false)
		if not door_locked:
			_apply_door_lock_state()
	_mark_barriers_dirty()
	_sync_barrier_summary_hp()
	_refresh_tool_buttons()

func _apply_door_lock_state() -> void:
	for k in barriers.keys():
		var bh: Dictionary = barriers[k]
		if str(bh.kind) == "fire_door" and float(bh.hp) > 0.0:
			bh.open = not door_locked
			bh.auto_close_t = 0.0
	_mark_barriers_dirty()
	_sync_barrier_summary_hp()
	if arena != null:
		arena.refresh_layers(true)

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
		arena.refresh_layers(false)

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
			_push_fx({"kind": "pop", "gx": mid.x, "gy": mid.y, "text": "%s 설치!" % lbl, "color": CYAN if tool_id == "fire_door" else GOLD, "t": 0.0, "dur": 0.75})
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

# ==================== FAST FLAT-GRID PATHFINDING & 1-PER-TILE PLACEMENT ====================

static func _cardinal_facing(vec: Vector2) -> Vector2:
	if absf(vec.x) >= absf(vec.y):
		return Vector2.RIGHT if vec.x >= 0.0 else Vector2.LEFT
	return Vector2.DOWN if vec.y >= 0.0 else Vector2.UP

func is_valid_tile(tile: Vector2i) -> bool:
	return tile.x >= 0 and tile.x < grid_cols and tile.y >= 0 and tile.y < grid_rows

func _edge_dir_index(a: Vector2i, b: Vector2i) -> int:
	var dx := b.x - a.x
	var dy := b.y - a.y
	if dx == 1 and dy == 0:
		return 0
	if dx == -1 and dy == 0:
		return 1
	if dx == 0 and dy == 1:
		return 2
	if dx == 0 and dy == -1:
		return 3
	return -1

func _is_edge_gas_sealed_idx(cell_i: int, d_idx: int) -> bool:
	var bh_v: Variant = _edge_barrier[cell_i * 4 + d_idx]
	if bh_v == null:
		return false
	var bh: Dictionary = bh_v
	if float(bh.hp) <= 0.0:
		return false
	if str(bh.kind) == "wall":
		return true
	return (not bool(bh.open)) and door_locked

func _is_edge_blocking_unit_idx(cell_i: int, d_idx: int, is_defender: bool) -> bool:
	var bh_v: Variant = _edge_barrier[cell_i * 4 + d_idx]
	if bh_v == null:
		return false
	var bh: Dictionary = bh_v
	if float(bh.hp) <= 0.0:
		return false
	if str(bh.kind) == "wall":
		return true
	if is_defender:
		return false
	return door_locked and not bool(bh.open)

func _is_edge_blocking_melee_idx(cell_i: int, d_idx: int) -> bool:
	var bh_v: Variant = _edge_barrier[cell_i * 4 + d_idx]
	if bh_v == null:
		return false
	var bh: Dictionary = bh_v
	if float(bh.hp) <= 0.0:
		return false
	if str(bh.kind) == "wall":
		return true
	return door_locked and not bool(bh.open)

func is_edge_gas_sealed(a: Vector2i, b: Vector2i) -> bool:
	_ensure_edge_table()
	var d_idx := _edge_dir_index(a, b)
	if d_idx < 0 or not is_valid_tile(a) or not is_valid_tile(b):
		return false
	return _is_edge_gas_sealed_idx(a.y * grid_cols + a.x, d_idx)

## 아군/적군별 경계선 통과 차단 판정:
## - 격실벽("wall"): 아군·적군 모두 이동 차단 (아군은 우회, 적군은 우회로 없을 시 타격 돌파!)
## - 방화문("fire_door"): 아군(방어조)은 자동 개폐하며 통과 가능! 적군(공격조)은 잠금 시 통과 불가(타격 돌파)!
func is_edge_blocking_unit(a: Vector2i, b: Vector2i, is_defender: bool) -> bool:
	_ensure_edge_table()
	var d_idx := _edge_dir_index(a, b)
	if d_idx < 0 or not is_valid_tile(a) or not is_valid_tile(b):
		return true
	return _is_edge_blocking_unit_idx(a.y * grid_cols + a.x, d_idx, is_defender)

func is_edge_blocking_melee(a: Vector2i, b: Vector2i) -> bool:
	_ensure_edge_table()
	var d_idx := _edge_dir_index(a, b)
	if d_idx < 0 or not is_valid_tile(a) or not is_valid_tile(b):
		return true
	return _is_edge_blocking_melee_idx(a.y * grid_cols + a.x, d_idx)

func _reconstruct_path_idx(origin_i: int, goal_i: int) -> Array[Vector2i]:
	var route: Array[Vector2i] = []
	var sc := goal_i
	var gcols := grid_cols
	while sc != origin_i and sc >= 0:
		@warning_ignore("integer_division")
		route.append(Vector2i(sc % gcols, sc / gcols))
		sc = _pf_prev[sc]
	route.reverse()
	return route

## O(V log V) 제로-할당 평탄화 격자 최단경로 탐색 (방어조: BFS / 공격조: 바이너리 힙 가중치 Dijkstra)
func find_grid_path(origin: Vector2i, goal: Vector2i, for_defender: bool = true, allow_breach: bool = false) -> Array[Vector2i]:
	if not is_valid_tile(origin) or not is_valid_tile(goal) or origin == goal:
		return []
	_ensure_edge_table()
	perf_pathfinds_last_step += 1
	var gcols := grid_cols
	var grows := grid_rows
	var origin_i := origin.y * gcols + origin.x
	var goal_i := goal.y * gcols + goal.x

	if not allow_breach:
		_pf_visited.fill(0)
		_pf_visited[origin_i] = 1
		_pf_prev[origin_i] = origin_i
		var head := 0
		var tail := 0
		_pf_queue[tail] = origin_i
		tail += 1
		while head < tail:
			var cur_i := _pf_queue[head]
			head += 1
			var cx := cur_i % gcols
			@warning_ignore("integer_division")
			var cy := cur_i / gcols
			for d in 4:
				var nx: int = cx + DIR_DX[d]
				var ny: int = cy + DIR_DY[d]
				if nx < 0 or nx >= gcols or ny < 0 or ny >= grows:
					continue
				var nxt_i := ny * gcols + nx
				if _pf_visited[nxt_i] != 0:
					continue
				if _is_edge_blocking_unit_idx(cur_i, d, for_defender):
					continue
				_pf_visited[nxt_i] = 1
				_pf_prev[nxt_i] = cur_i
				if nxt_i == goal_i:
					return _reconstruct_path_idx(origin_i, goal_i)
				_pf_queue[tail] = nxt_i
				tail += 1
		return []

	# 바이너리 최소 힙 가중치 Dijkstra (Zero Dictionary / Zero String Key!)
	_pf_dist.fill(1e12)
	_pf_prev.fill(-1)
	_pf_dist[origin_i] = 0.0
	_pf_prev[origin_i] = origin_i
	var heap_sz := 1
	_pf_heap_node[0] = origin_i
	_pf_heap_dist[0] = 0.0

	while heap_sz > 0:
		var cur_i := _pf_heap_node[0]
		var cur_d := _pf_heap_dist[0]
		heap_sz -= 1
		if heap_sz > 0:
			var last_n := _pf_heap_node[heap_sz]
			var last_d := _pf_heap_dist[heap_sz]
			var pos := 0
			while true:
				var left := pos * 2 + 1
				if left >= heap_sz:
					break
				var right := left + 1
				var smallest := right if (right < heap_sz and _pf_heap_dist[right] < _pf_heap_dist[left]) else left
				if _pf_heap_dist[smallest] >= last_d:
					break
				_pf_heap_node[pos] = _pf_heap_node[smallest]
				_pf_heap_dist[pos] = _pf_heap_dist[smallest]
				pos = smallest
			_pf_heap_node[pos] = last_n
			_pf_heap_dist[pos] = last_d
		if cur_d > _pf_dist[cur_i] + 0.0005:
			continue
		if cur_i == goal_i:
			return _reconstruct_path_idx(origin_i, goal_i)
		var cx := cur_i % gcols
		@warning_ignore("integer_division")
		var cy := cur_i / gcols
		for d in 4:
			var nx: int = cx + DIR_DX[d]
			var ny: int = cy + DIR_DY[d]
			if nx < 0 or nx >= gcols or ny < 0 or ny >= grows:
				continue
			var step_cost := 1.0
			var bh_v: Variant = _edge_barrier[cur_i * 4 + d]
			if bh_v != null:
				var bh: Dictionary = bh_v
				var bhp := float(bh.hp)
				if bhp > 0.0:
					var bkind := str(bh.kind)
					if bkind == "wall":
						step_cost += bhp / 16.0 + 2.0
					elif not for_defender and door_locked and not bool(bh.open):
						step_cost += bhp / 22.0
			var nxt_i := ny * gcols + nx
			var nd := cur_d + step_cost
			if nd < _pf_dist[nxt_i] - 0.0005:
				_pf_dist[nxt_i] = nd
				_pf_prev[nxt_i] = cur_i
				var idx_h := heap_sz
				heap_sz += 1
				while idx_h > 0:
					@warning_ignore("integer_division")
					var parent := (idx_h - 1) >> 1
					if _pf_heap_dist[parent] <= nd:
						break
					_pf_heap_node[idx_h] = _pf_heap_node[parent]
					_pf_heap_dist[idx_h] = _pf_heap_dist[parent]
					idx_h = parent
				_pf_heap_node[idx_h] = nxt_i
				_pf_heap_dist[idx_h] = nd
	return []

func unit_grid_pos(u: Dictionary) -> Vector2:
	return Vector2(u.cell as Vector2i).lerp(Vector2(u.next_cell as Vector2i), clampf(float(u.move_t), 0.0, 1.0))

func _rebuild_occ_tables() -> void:
	_ensure_grid_buffers()
	_stat_def_cnt.fill(0)
	_stat_def_first.fill(-1)
	_stat_atk_cnt.fill(0)
	_stat_atk_first.fill(-1)
	_claim_def_cnt.fill(0)
	_claim_def_first.fill(-1)
	_claim_atk_cnt.fill(0)
	_claim_atk_first.fill(-1)
	_cell_def_idx.fill(-1)
	_cell_atk_idx.fill(-1)
	_cell_all_cnt.fill(0)
	var gcols := grid_cols
	for i in units.size():
		var u: Dictionary = units[i]
		if float(u.hp) <= 0.0:
			continue
		var uid := int(u.id)
		var is_def := bool(u.is_defender)
		var c: Vector2i = u.cell
		if not is_valid_tile(c):
			continue
		var ci := c.y * gcols + c.x
		_cell_all_cnt[ci] += 1
		if is_def:
			if _cell_def_idx[ci] < 0:
				_cell_def_idx[ci] = i
		else:
			if _cell_atk_idx[ci] < 0:
				_cell_atk_idx[ci] = i
		var is_stat := (u.path as Array).is_empty() and float(u.move_t) <= 0.001
		if is_stat:
			if is_def:
				_stat_def_cnt[ci] += 1
				if _stat_def_first[ci] < 0:
					_stat_def_first[ci] = uid
				_claim_def_cnt[ci] += 1
				if _claim_def_first[ci] < 0:
					_claim_def_first[ci] = uid
			else:
				_stat_atk_cnt[ci] += 1
				if _stat_atk_first[ci] < 0:
					_stat_atk_first[ci] = uid
				_claim_atk_cnt[ci] += 1
				if _claim_atk_first[ci] < 0:
					_claim_atk_first[ci] = uid
		else:
			var nc: Vector2i = u.next_cell
			if is_valid_tile(nc) and nc != c:
				_cell_all_cnt[nc.y * gcols + nc.x] += 1
			var gc: Vector2i = u.goal_cell
			if is_valid_tile(gc):
				var gi := gc.y * gcols + gc.x
				if is_def:
					_claim_def_cnt[gi] += 1
					if _claim_def_first[gi] < 0:
						_claim_def_first[gi] = uid
				else:
					_claim_atk_cnt[gi] += 1
					if _claim_atk_first[gi] < 0:
						_claim_atk_first[gi] = uid
	_occ_valid = true

func _claim_shift(old_cell: Vector2i, new_cell: Vector2i, is_def: bool, uid: int) -> void:
	if not _occ_valid or old_cell == new_cell:
		return
	var gcols := grid_cols
	if is_valid_tile(old_cell):
		var oi := old_cell.y * gcols + old_cell.x
		if is_def:
			_claim_def_cnt[oi] = maxi(0, _claim_def_cnt[oi] - 1)
			if _claim_def_first[oi] == uid:
				_claim_def_first[oi] = -1
		else:
			_claim_atk_cnt[oi] = maxi(0, _claim_atk_cnt[oi] - 1)
			if _claim_atk_first[oi] == uid:
				_claim_atk_first[oi] = -1
	if is_valid_tile(new_cell):
		var ni := new_cell.y * gcols + new_cell.x
		if is_def:
			_claim_def_cnt[ni] += 1
			if _claim_def_first[ni] < 0:
				_claim_def_first[ni] = uid
		else:
			_claim_atk_cnt[ni] += 1
			if _claim_atk_first[ni] < 0:
				_claim_atk_first[ni] = uid

func has_stationary_opponent_at_cell(tile: Vector2i, my_is_def: bool) -> bool:
	if not is_valid_tile(tile):
		return false
	if not _occ_valid:
		_rebuild_occ_tables()
	var idx := tile.y * grid_cols + tile.x
	return (_stat_atk_cnt[idx] > 0) if my_is_def else (_stat_def_cnt[idx] > 0)

func _is_idx_stationary_occupied_by_team(idx: int, is_def: bool, ignore_id: int) -> bool:
	var cnt := _stat_def_cnt[idx] if is_def else _stat_atk_cnt[idx]
	if cnt <= 0:
		return false
	if cnt > 1:
		return true
	var first := _stat_def_first[idx] if is_def else _stat_atk_first[idx]
	return first != ignore_id

func _is_idx_claimed_by_team(idx: int, is_def: bool, ignore_id: int) -> bool:
	var cnt := _claim_def_cnt[idx] if is_def else _claim_atk_cnt[idx]
	if cnt <= 0:
		return false
	if cnt > 1:
		return true
	var first := _claim_def_first[idx] if is_def else _claim_atk_first[idx]
	return first != ignore_id

func is_tile_stationary_occupied_by_team(tile: Vector2i, is_def: bool, ignore_id: int = -1) -> bool:
	if not is_valid_tile(tile):
		return false
	if _occ_valid:
		return _is_idx_stationary_occupied_by_team(tile.y * grid_cols + tile.x, is_def, ignore_id)
	for u in units:
		if int(u.id) == ignore_id or bool(u.is_defender) != is_def or float(u.hp) <= 0.0:
			continue
		if (u.path as Array).is_empty() and float(u.move_t) <= 0.001 and (u.cell as Vector2i) == tile:
			return true
	return false

## 같은 팀은 한 칸에 1명만 정지 배치(또는 최종 목적지 예약) 가능! (이동 중 경유 통과는 허용)
func is_tile_claimed_by_team(tile: Vector2i, is_def: bool, ignore_id: int = -1) -> bool:
	if not is_valid_tile(tile):
		return false
	if _occ_valid:
		return _is_idx_claimed_by_team(tile.y * grid_cols + tile.x, is_def, ignore_id)
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

## 단일 패스 조기 종료(Early-Exit) BFS/Dijkstra로 가장 가까운 같은 팀 미점유 타일 탐색!
func find_nearest_free_team_tile(origin: Vector2i, is_def: bool, ignore_id: int = -1, min_col: int = 0, max_col: int = -1) -> Vector2i:
	if max_col < 0:
		max_col = grid_cols - 1
	if is_valid_tile(origin) and origin.x >= min_col and origin.x <= max_col and not is_tile_claimed_by_team(origin, is_def, ignore_id):
		return origin
	if not is_valid_tile(origin):
		return Vector2i(-1, -1)
	_ensure_edge_table()
	if not _occ_valid:
		_rebuild_occ_tables()
	var gcols := grid_cols
	var grows := grid_rows
	var origin_i := origin.y * gcols + origin.x
	_pf_visited.fill(0)
	_pf_visited[origin_i] = 1
	var head := 0
	var tail := 0
	_pf_queue[tail] = origin_i
	tail += 1
	while head < tail:
		var cur_i := _pf_queue[head]
		head += 1
		var cx := cur_i % gcols
		@warning_ignore("integer_division")
		var cy := cur_i / gcols
		if cur_i != origin_i and cx >= min_col and cx <= max_col:
			if not _is_idx_claimed_by_team(cur_i, is_def, ignore_id):
				return Vector2i(cx, cy)
		for d in 4:
			var nx: int = cx + DIR_DX[d]
			var ny: int = cy + DIR_DY[d]
			if nx < 0 or nx >= gcols or ny < 0 or ny >= grows:
				continue
			var nxt_i := ny * gcols + nx
			if _pf_visited[nxt_i] != 0:
				continue
			if _is_edge_blocking_unit_idx(cur_i, d, is_def):
				continue
			_pf_visited[nxt_i] = 1
			_pf_queue[tail] = nxt_i
			tail += 1
	return Vector2i(-1, -1)

## 특정 승조원에게 목표 블럭 4방향 1칸 이동 명령 하달 (같은 팀 점유 블럭이거나 격실벽으로 막힌 곳이면 false 반환)
func command_unit_to_tile(unit_id: int, target_tile: Vector2i) -> bool:
	if not is_valid_tile(target_tile):
		return false
	_occ_valid = false
	for u in units:
		if int(u.id) == unit_id and float(u.hp) > 0.0:
			var is_def := bool(u.is_defender)
			if is_tile_claimed_by_team(target_tile, is_def, unit_id):
				_push_fx({"kind": "pop", "gx": float(target_tile.x), "gy": float(target_tile.y), "text": "같은팀 1칸1명!", "color": GOLD, "t": 0.0, "dur": 0.75})
				return false
			var in_hop := float(u.move_t) > 0.001 and (u.next_cell as Vector2i) != (u.cell as Vector2i)
			var start_t: Vector2i = (u.next_cell as Vector2i) if in_hop else (u.cell as Vector2i)
			if start_t == target_tile:
				u.path = [] as Array[Vector2i]
				u.goal_cell = target_tile
				u.manual_order = true
				_occ_valid = false
				return true
			var route := find_grid_path(start_t, target_tile, is_def, not is_def)
			if route.is_empty():
				_push_fx({"kind": "pop", "gx": float(target_tile.x), "gy": float(target_tile.y), "text": "격실벽 차단!", "color": RED, "t": 0.0, "dur": 0.70})
				return false
			u.path = route
			u.goal_cell = target_tile
			u.manual_order = true
			u.state = "walk"
			_occ_valid = false
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
					arena.refresh_layers(false)
				return
			break
	if selected_unit_id > 0:
		if command_unit_to_tile(selected_unit_id, tile):
			defend_in_medbay = (tile.x >= medbay_min_col())
			_sync_switch_labels()
	if arena != null:
		arena.refresh_layers(true)

func _build_spawn_slots(is_defender: bool) -> Array[Vector2i]:
	if grid_cols <= GRID_COLS:
		if not is_defender:
			return [Vector2i(1, 1), Vector2i(1, 0), Vector2i(1, 2), Vector2i(0, 1)]
		if defend_in_medbay:
			return [Vector2i(6, 1), Vector2i(6, 0), Vector2i(6, 2), Vector2i(7, 1)]
		return [Vector2i(4, 1), Vector2i(4, 0), Vector2i(4, 2), Vector2i(5, 1)]
	# 16×6 대규모 20 vs 20 전용 고유 스폰 슬롯 (팀별 24~30칸 확보 -> 같은팀 1칸1명 100% 보장!)
	var row_order := [1, 4, 2, 3, 0, 5]
	var slots: Array[Vector2i] = []
	if not is_defender:
		for col in [3, 2, 1, 0, 4]:
			for r in row_order:
				slots.append(Vector2i(col, r))
	elif defend_in_medbay:
		for col in [11, 12, 13, 14, 15]:
			for r in row_order:
				slots.append(Vector2i(col, r))
	else:
		for col in [6, 7, 8, 9, 10, 5]:
			for r in row_order:
				slots.append(Vector2i(col, r))
	return slots

func _reassign_defender_formation() -> void:
	var slots := _build_spawn_slots(true)
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
	_occ_valid = false
	if arena != null:
		arena.refresh_layers(true)

## 1클릭 20 vs 20 대규모 전술 전투 시뮬레이션 진입 (16×6 데크 + 쌍둥이 방화문 + 최적화 계측 활성!)
func setup_20v20_battle(use_mixed_squads: bool = true) -> void:
	mixed_squad_mode = use_mixed_squads
	params["atk_count"] = 20.0
	params["def_count"] = 20.0
	_custom_barriers_dirty = false
	battle_running = true
	_sync_sliders()
	_sync_switch_labels()
	reset_round()

func select_species_for_active_side(species_id: String) -> void:
	mixed_squad_mode = false
	if editing_side == "defender":
		defender_species = species_id
	else:
		attacker_species = species_id
	_refresh_species_buttons()
	reset_round()

func set_matchup(atk_sp: String, def_sp: String) -> void:
	mixed_squad_mode = false
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
	_occ_valid = false

	var n_atk := clampi(roundi(float(params.atk_count)), 1, MAX_TEAM_UNITS)
	var n_def := clampi(roundi(float(params.def_count)), 1, MAX_TEAM_UNITS)
	var want_large := (n_atk > 4 or n_def > 4)
	var next_cols := LARGE_GRID_COLS if want_large else GRID_COLS
	var next_rows := LARGE_GRID_ROWS if want_large else GRID_ROWS
	var grid_changed := (next_cols != grid_cols or next_rows != grid_rows)
	grid_cols = next_cols
	grid_rows = next_rows
	_ensure_grid_buffers()

	if not _custom_barriers_dirty or grid_changed:
		reset_default_barriers()
	else:
		# 사용자가 직접 설치·업그레이드·제거한 격실벽·방화문 배치는 유지하면서 내구도를 완충 복원!
		for k in barriers.keys():
			var bh: Dictionary = barriers[k]
			bh.hp = float(bh.max_hp)
			if str(bh.kind) == "fire_door":
				bh.open = not door_locked
				bh.auto_close_t = 0.0
		_mark_barriers_dirty()
		_sync_barrier_summary_hp()

	if bio_gas_active:
		_step_gas_diffusion(0.5)

	var atk_spawns := _build_spawn_slots(false)
	for i in n_atk:
		var acell := atk_spawns[i]
		var sp_a := str(LARGE_SQUAD_ATK_MIX[i % LARGE_SQUAD_ATK_MIX.size()]) if (mixed_squad_mode and want_large) else attacker_species
		var asp := FtlCrew.species_spec(sp_a)
		units.append({
			"id": i + 1,
			"is_defender": false,
			"species": sp_a,
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
			"slash_cd": 0.15 + float(i % 5) * 0.06,
			"repath_cd": 0.0,
		})

	var def_spawns := _build_spawn_slots(true)
	selected_unit_id = -1
	for j in n_def:
		var dcell := def_spawns[j]
		var uid := 101 + j
		if selected_unit_id < 0:
			selected_unit_id = uid
		var sp_d := str(LARGE_SQUAD_DEF_MIX[j % LARGE_SQUAD_DEF_MIX.size()]) if (mixed_squad_mode and want_large) else defender_species
		var dsp := FtlCrew.species_spec(sp_d)
		units.append({
			"id": uid,
			"is_defender": true,
			"species": sp_d,
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
			"slash_cd": 0.12 + float(j % 5) * 0.06,
			"repath_cd": 0.0,
		})
	_rebuild_occ_tables()
	_update_telemetry_labels(true)
	if arena != null:
		arena.refresh_layers(true)

func _physics_process(delta: float) -> void:
	sim_time += delta
	if battle_running and outcome == "ongoing":
		step_combat(delta)
	else:
		_step_fx_only(delta)
	_telemetry_accum += delta
	if _telemetry_accum >= 0.10:
		_telemetry_accum = 0.0
		_update_telemetry_labels(false)
	if arena != null:
		arena.refresh_layers(false)

func _step_fx_only(dt: float) -> void:
	# 제자리 압축(In-place compaction)으로 프레임당 신규 Array 할당 제거!
	var write_i := 0
	for i in fx_events.size():
		var fx: Dictionary = fx_events[i]
		var nt := float(fx.t) + dt
		fx.t = nt
		if nt < float(fx.dur):
			if write_i != i:
				fx_events[write_i] = fx
			write_i += 1
	if write_i != fx_events.size():
		fx_events.resize(write_i)

## 중앙 초크 복도 배기구 기준 생화학 독가스 확산 (제로-할당 평탄화 BFS + 격실벽/방화문 완벽 밀폐!)
func _step_gas_diffusion(dt: float) -> void:
	var door_state_changed := false
	for k in barriers.keys():
		var bh: Dictionary = barriers[k]
		if str(bh.kind) == "fire_door" and float(bh.auto_close_t) > 0.0:
			bh.auto_close_t = maxf(0.0, float(bh.auto_close_t) - dt)
			if float(bh.auto_close_t) <= 0.0 and door_locked:
				if bool(bh.open):
					bh.open = false
					door_state_changed = true
	if door_state_changed:
		_mark_barriers_dirty()

	if not bio_gas_active:
		if bio_gas_level <= 0.0 and cell_gas.is_empty():
			return
		bio_gas_level = maxf(0.0, bio_gas_level - 26.0 * dt)
		var to_erase: Array[Vector2i] = []
		for gc in cell_gas.keys():
			var nv := maxf(0.0, float(cell_gas[gc]) - 28.0 * dt)
			if nv <= 0.5:
				to_erase.append(gc as Vector2i)
			else:
				cell_gas[gc] = nv
		for ec in to_erase:
			cell_gas.erase(ec)
		return

	_ensure_edge_table()
	bio_gas_level = minf(100.0, bio_gas_level + 22.0 * dt)
	var gcols := grid_cols
	var grows := grid_rows

	# 장벽/격자 변동이 없으면 독가스 도달 BFS 캐시 재사용! (프레임당 BFS 제거)
	if _last_gas_barrier_ver != _barrier_version or _last_gas_grid_size != _grid_size:
		var vent := vent_cell()
		var vent_i := vent.y * gcols + vent.x
		var max_dist := 4 if gcols <= GRID_COLS else 5
		var pos_press_col := 7 if gcols <= GRID_COLS else (medbay_min_col() + 1)

		_gas_dist.fill(-1)
		_gas_dist[vent_i] = 0
		var head := 0
		var tail := 0
		_pf_queue[tail] = vent_i
		tail += 1
		while head < tail:
			var cur_i := _pf_queue[head]
			head += 1
			var dist_steps := _gas_dist[cur_i]
			if dist_steps >= max_dist:
				continue
			var cx := cur_i % gcols
			@warning_ignore("integer_division")
			var cy := cur_i / gcols
			for d in 4:
				var nx: int = cx + DIR_DX[d]
				var ny: int = cy + DIR_DY[d]
				if nx < 0 or nx >= gcols or ny < 0 or ny >= grows:
					continue
				if nx >= pos_press_col:
					continue
				var nxt_i := ny * gcols + nx
				if _gas_dist[nxt_i] >= 0:
					continue
				if _is_edge_gas_sealed_idx(cur_i, d):
					continue
				_gas_dist[nxt_i] = dist_steps + 1
				_pf_queue[tail] = nxt_i
				tail += 1
		_gas_reach_cells.resize(tail)
		for ri in tail:
			_gas_reach_cells[ri] = _pf_queue[ri]
		_last_gas_barrier_ver = _barrier_version
		_last_gas_grid_size = _grid_size

	for ri2 in _gas_reach_cells.size():
		var idx_r := _gas_reach_cells[ri2]
		var gd := _gas_dist[idx_r]
		@warning_ignore("integer_division")
		var tv := Vector2i(idx_r % gcols, idx_r / gcols)
		var target_g := clampf(bio_gas_level * (1.0 - float(gd) * 0.08), 25.0, 100.0)
		cell_gas[tv] = move_toward(float(cell_gas.get(tv, 0.0)), target_g, 85.0 * dt)

	if cell_gas.size() > _gas_reach_cells.size():
		var erase_list: Array[Vector2i] = []
		for gc_v in cell_gas.keys():
			var gv: Vector2i = gc_v
			if not is_valid_tile(gv) or _gas_dist[gv.y * gcols + gv.x] < 0:
				var decayed := maxf(0.0, float(cell_gas[gv]) - 34.0 * dt)
				if decayed <= 0.5:
					erase_list.append(gv)
				else:
					cell_gas[gv] = decayed
		for ev in erase_list:
			cell_gas.erase(ev)

## O(1) 공간 테이블 기반 백병전 교전 상대 탐색 (최대 5칸 배열 조회, 기존 O(N) 스캔 제거!)
func _find_engageable_opponent_fast(u_cell: Vector2i, my_is_def: bool) -> Dictionary:
	var gcols := grid_cols
	var grows := grid_rows
	var opp_arr := _cell_atk_idx if my_is_def else _cell_def_idx
	var ci := u_cell.y * gcols + u_cell.x
	var same_idx := opp_arr[ci]
	if same_idx >= 0 and float(units[same_idx].hp) > 0.0:
		return units[same_idx]
	for d in 4:
		var nx: int = u_cell.x + DIR_DX[d]
		var ny: int = u_cell.y + DIR_DY[d]
		if nx < 0 or nx >= gcols or ny < 0 or ny >= grows:
			continue
		var nidx := opp_arr[ny * gcols + nx]
		if nidx < 0:
			continue
		if _is_edge_blocking_melee_idx(ci, d):
			continue
		var cand: Dictionary = units[nidx]
		if float(cand.hp) > 0.0:
			return cand
	return {}

## 단일 패스 조기 종료(Single-Pass Early-Exit) 교전 위치+경로 동시 산출!
## 기존: 적 20명 × 5방향 = 최대 100회 Dijkstra 호출 -> 개선: 단 1회 평탄화 BFS/Dijkstra로 최소비용 칸+경로 즉시 반환!
func _pick_combat_tile_and_path(u: Dictionary, opponents: Array[Dictionary], min_col: int = 0, max_col: int = -1) -> Dictionary:
	if max_col < 0:
		max_col = grid_cols - 1
	var is_def := bool(u.is_defender)
	var uid := int(u.id)
	var start_c: Vector2i = (u.next_cell as Vector2i) if float(u.move_t) > 0.001 else (u.cell as Vector2i)
	if not is_valid_tile(start_c):
		return {}
	_ensure_edge_table()
	var gcols := grid_cols
	var grows := grid_rows
	var start_i := start_c.y * gcols + start_c.x

	_cand_mask.fill(0)
	var any_cand := false
	for op in opponents:
		if float(op.hp) <= 0.0:
			continue
		var oc: Vector2i = op.cell
		var oi := oc.y * gcols + oc.x
		# 0) 적과 같은 칸
		if oc.x >= min_col and oc.x <= max_col and not _is_idx_claimed_by_team(oi, is_def, uid):
			if oi == start_i:
				return {"cell": start_c, "path": [] as Array[Vector2i]}
			_cand_mask[oi] = 1
			any_cand = true
		# 1..4) 적 상·하·좌·우 인접 칸
		for d in 4:
			var cx: int = oc.x + DIR_DX[d]
			var cy: int = oc.y + DIR_DY[d]
			if cx < min_col or cx > max_col or cy < 0 or cy >= grows:
				continue
			var ci := cy * gcols + cx
			if _cand_mask[ci] != 0:
				continue
			var opp_d: int = DIR_OPP[d]
			if is_def:
				if _is_edge_blocking_melee_idx(ci, opp_d):
					continue
			else:
				var bh_v: Variant = _edge_barrier[ci * 4 + opp_d]
				if bh_v != null and float((bh_v as Dictionary).hp) > 0.0 and str((bh_v as Dictionary).kind) == "wall":
					continue
			if _is_idx_claimed_by_team(ci, is_def, uid):
				continue
			if ci == start_i:
				return {"cell": start_c, "path": [] as Array[Vector2i]}
			_cand_mask[ci] = 1
			any_cand = true

	if not any_cand:
		return {}

	perf_pathfinds_last_step += 1
	if is_def:
		# 방어조: 비가중치 평탄화 BFS (첫 매칭 = 최단 거리 보장!)
		_pf_visited.fill(0)
		_pf_visited[start_i] = 1
		_pf_prev[start_i] = start_i
		var head := 0
		var tail := 0
		_pf_queue[tail] = start_i
		tail += 1
		while head < tail:
			var cur_i := _pf_queue[head]
			head += 1
			if _cand_mask[cur_i] != 0:
				@warning_ignore("integer_division")
				return {"cell": Vector2i(cur_i % gcols, cur_i / gcols), "path": _reconstruct_path_idx(start_i, cur_i)}
			var cx := cur_i % gcols
			@warning_ignore("integer_division")
			var cy := cur_i / gcols
			for d in 4:
				var nx: int = cx + DIR_DX[d]
				var ny: int = cy + DIR_DY[d]
				if nx < 0 or nx >= gcols or ny < 0 or ny >= grows:
					continue
				var nxt_i := ny * gcols + nx
				if _pf_visited[nxt_i] != 0:
					continue
				if _is_edge_blocking_unit_idx(cur_i, d, true):
					continue
				_pf_visited[nxt_i] = 1
				_pf_prev[nxt_i] = cur_i
				_pf_queue[tail] = nxt_i
				tail += 1
		return {}

	# 공격조: 바이너리 힙 가중치 Dijkstra (첫 매칭 = 최소 돌파/우회 비용 보장!)
	_pf_dist.fill(1e12)
	_pf_prev.fill(-1)
	_pf_dist[start_i] = 0.0
	_pf_prev[start_i] = start_i
	var heap_sz := 1
	_pf_heap_node[0] = start_i
	_pf_heap_dist[0] = 0.0

	while heap_sz > 0:
		var cur_i := _pf_heap_node[0]
		var cur_d := _pf_heap_dist[0]
		heap_sz -= 1
		if heap_sz > 0:
			var last_n := _pf_heap_node[heap_sz]
			var last_d := _pf_heap_dist[heap_sz]
			var pos := 0
			while true:
				var left := pos * 2 + 1
				if left >= heap_sz:
					break
				var right := left + 1
				var smallest := right if (right < heap_sz and _pf_heap_dist[right] < _pf_heap_dist[left]) else left
				if _pf_heap_dist[smallest] >= last_d:
					break
				_pf_heap_node[pos] = _pf_heap_node[smallest]
				_pf_heap_dist[pos] = _pf_heap_dist[smallest]
				pos = smallest
			_pf_heap_node[pos] = last_n
			_pf_heap_dist[pos] = last_d
		if cur_d > _pf_dist[cur_i] + 0.0005:
			continue
		if _cand_mask[cur_i] != 0:
			@warning_ignore("integer_division")
			return {"cell": Vector2i(cur_i % gcols, cur_i / gcols), "path": _reconstruct_path_idx(start_i, cur_i)}
		var cx := cur_i % gcols
		@warning_ignore("integer_division")
		var cy := cur_i / gcols
		for d in 4:
			var nx: int = cx + DIR_DX[d]
			var ny: int = cy + DIR_DY[d]
			if nx < 0 or nx >= gcols or ny < 0 or ny >= grows:
				continue
			var step_cost := 1.0
			var bh_v: Variant = _edge_barrier[cur_i * 4 + d]
			if bh_v != null:
				var bh: Dictionary = bh_v
				var bhp := float(bh.hp)
				if bhp > 0.0:
					var bkind := str(bh.kind)
					if bkind == "wall":
						step_cost += bhp / 16.0 + 2.0
					elif door_locked and not bool(bh.open):
						step_cost += bhp / 22.0
			var nxt_i := ny * gcols + nx
			var nd := cur_d + step_cost
			if nd < _pf_dist[nxt_i] - 0.0005:
				_pf_dist[nxt_i] = nd
				_pf_prev[nxt_i] = cur_i
				var idx_h := heap_sz
				heap_sz += 1
				while idx_h > 0:
					@warning_ignore("integer_division")
					var parent := (idx_h - 1) >> 1
					if _pf_heap_dist[parent] <= nd:
						break
					_pf_heap_node[idx_h] = _pf_heap_node[parent]
					_pf_heap_dist[idx_h] = _pf_heap_dist[parent]
					idx_h = parent
				_pf_heap_node[idx_h] = nxt_i
				_pf_heap_dist[idx_h] = nd
	return {}

## 4방향 1블럭 전진 및 방화문 자동 개폐 / 적군 격실벽·방화문 타격 돌파 처리
func _advance_unit_grid_step(u: Dictionary, dt: float, atk_scale: float = 1.0) -> bool:
	var is_def := bool(u.is_defender)
	var uid := int(u.id)
	var upath: Array = u.path
	var gcols := grid_cols
	var cur_c: Vector2i = u.cell
	while not upath.is_empty() and (upath[0] as Vector2i) == cur_c and float(u.move_t) <= 0.001:
		upath.pop_front()
	if float(u.move_t) <= 0.001 and upath.is_empty():
		if _is_idx_stationary_occupied_by_team(cur_c.y * gcols + cur_c.x, is_def, uid):
			var free_t := find_nearest_free_team_tile(cur_c, is_def, uid, (airlock_max_col() + 1) if is_def else 0, gcols - 1)
			if is_valid_tile(free_t) and free_t != cur_c:
				var old_g: Vector2i = u.goal_cell
				u.path = find_grid_path(cur_c, free_t, is_def, not is_def)
				u.goal_cell = free_t
				_claim_shift(old_g, free_t, is_def, uid)
				upath = u.path
		if upath.is_empty():
			u.next_cell = cur_c
			u.move_t = 0.0
			return false

	if float(u.move_t) <= 0.001:
		var nxt0: Vector2i = upath[0]
		var d0 := _edge_dir_index(cur_c, nxt0)
		var ci0 := cur_c.y * gcols + cur_c.x
		if d0 < 0 or _is_edge_blocking_unit_idx(ci0, d0, is_def):
			if not is_def and d0 >= 0:
				var bh_v: Variant = _edge_barrier[ci0 * 4 + d0]
				if bh_v != null and float((bh_v as Dictionary).hp) > 0.0:
					if _is_idx_stationary_occupied_by_team(ci0, false, uid):
						var alt_b := find_nearest_free_team_tile(cur_c, false, uid, 0, gcols - 1)
						if is_valid_tile(alt_b) and alt_b != cur_c:
							var old_gb: Vector2i = u.goal_cell
							u.path = find_grid_path(cur_c, alt_b, false, false)
							u.goal_cell = alt_b
							_claim_shift(old_gb, alt_b, false, uid)
							return false
					var bh: Dictionary = bh_v
					u.next_cell = cur_c
					u.move_t = 0.0
					u.facing = Vector2(nxt0 - cur_c)
					u.state = "sabotage"
					var bash_dps := 22.0 * float(u.combat_mult) * atk_scale
					bh.hp = maxf(0.0, float(bh.hp) - bash_dps * dt)
					if float(bh.hp) <= 0.0:
						var kname := "격실벽" if str(bh.kind) == "wall" else "방화문"
						var mid := (Vector2(cur_c) + Vector2(nxt0)) * 0.5
						var bkey: String = _edge_barrier_key[ci0 * 4 + d0]
						barriers.erase(bkey)
						_mark_barriers_dirty()
						_ensure_edge_table()
						_push_fx({"kind": "pop", "gx": mid.x, "gy": mid.y, "text": "%s 돌파!" % kname, "color": RED, "t": 0.0, "dur": 0.80})
					_sync_barrier_summary_hp()
					return true
			var old_g0: Vector2i = u.goal_cell
			u.path = [] as Array[Vector2i]
			u.next_cell = cur_c
			u.goal_cell = cur_c
			_claim_shift(old_g0, cur_c, is_def, uid)
			u.move_t = 0.0
			return false
		# 방어조가 잠긴 방화문을 통과할 때 0.40초 동안 자동 개폐!
		if is_def:
			var fbh_v: Variant = _edge_barrier[ci0 * 4 + d0]
			if fbh_v != null:
				var fbh: Dictionary = fbh_v
				if str(fbh.kind) == "fire_door" and float(fbh.hp) > 0.0:
					if not bool(fbh.open):
						fbh.open = true
						_barrier_version += 1
					fbh.auto_close_t = 0.40
		u.next_cell = nxt0
		u.facing = Vector2(nxt0 - cur_c)

	var spd_tiles := 2.85 * float(u.move_mult)
	var new_t := float(u.move_t) + spd_tiles * dt
	# O(1) 공간 카운트 기반 경유 겹침 감지 (기존 O(N^2) 유닛 전수 거리 비교 제거!)
	var next_c: Vector2i = u.next_cell
	var cur_cnt := _cell_all_cnt[cur_c.y * gcols + cur_c.x]
	var nxt_cnt := _cell_all_cnt[next_c.y * gcols + next_c.x]
	if cur_cnt > 1 or nxt_cnt > 1:
		transit_overlaps_observed += 1

	while new_t >= 1.0:
		new_t -= 1.0
		u.cell = u.next_cell
		cur_c = u.cell
		if not upath.is_empty() and (upath[0] as Vector2i) == cur_c:
			upath.pop_front()
		if upath.is_empty():
			if _is_idx_stationary_occupied_by_team(cur_c.y * gcols + cur_c.x, is_def, uid):
				var alt := find_nearest_free_team_tile(cur_c, is_def, uid, (airlock_max_col() + 1) if is_def else 0, gcols - 1)
				if is_valid_tile(alt) and alt != cur_c:
					var old_ga: Vector2i = u.goal_cell
					u.path = find_grid_path(cur_c, alt, is_def, not is_def)
					u.goal_cell = alt
					_claim_shift(old_ga, alt, is_def, uid)
					upath = u.path
			if upath.is_empty():
				new_t = 0.0
				u.next_cell = cur_c
				var old_gf: Vector2i = u.goal_cell
				u.goal_cell = cur_c
				_claim_shift(old_gf, cur_c, is_def, uid)
				u.manual_order = false
				break
		var cand_nxt: Vector2i = upath[0]
		var d2 := _edge_dir_index(cur_c, cand_nxt)
		var ci2 := cur_c.y * gcols + cur_c.x
		if d2 < 0 or _is_edge_blocking_unit_idx(ci2, d2, is_def):
			new_t = 0.0
			u.next_cell = cur_c
			break
		if is_def:
			var fbh2_v: Variant = _edge_barrier[ci2 * 4 + d2]
			if fbh2_v != null:
				var fbh2: Dictionary = fbh2_v
				if str(fbh2.kind) == "fire_door" and float(fbh2.hp) > 0.0:
					if not bool(fbh2.open):
						fbh2.open = true
						_barrier_version += 1
					fbh2.auto_close_t = 0.40
		u.next_cell = cand_nxt
		u.facing = Vector2(cand_nxt - cur_c)

	u.move_t = new_t
	var still_moving := (float(u.move_t) > 0.001 or not (u.path as Array).is_empty())
	if still_moving and str(u.state) != "sabotage":
		u.state = "walk"
	return still_moving

func step_combat(dt: float) -> void:
	if dt <= 0.0 or outcome != "ongoing":
		return
	var step_t0 := Time.get_ticks_usec()
	perf_pathfinds_last_step = 0
	round_elapsed += dt
	_ensure_edge_table()
	_step_fx_only(dt)
	_step_gas_diffusion(dt)
	_rebuild_occ_tables()

	var m_idx := clampi(roundi(float(params.mastery_lv)), 0, 2)
	var mastery_mult: float = float(MASTERY_MULTS[m_idx])
	var atk_scale := clampf(float(params.atk_mult_pct) / 100.0, 0.2, 4.0)
	var def_armor_mult := 1.0 - clampf(float(params.def_armor_pct) / 100.0, 0.0, 0.85)
	var med_heal := float(params.medbay_heal_s) if medbay_powered else 0.0
	var air_end := airlock_max_col()
	var chk_end := choke_max_col()
	var med_start := chk_end + 1
	var choke_x_min := float(air_end) + 0.6
	var choke_x_max := float(chk_end) + 0.5
	var med_x_min := float(med_start) - 0.4
	var min_engage_col := (chk_end) if defend_in_medbay else (air_end + 1)

	var alive_atk: Array[Dictionary] = []
	var alive_def: Array[Dictionary] = []
	var has_breacher_in_zone := false
	for u in units:
		if float(u.hp) > 0.0:
			if bool(u.is_defender):
				alive_def.append(u)
			else:
				alive_atk.append(u)
				if int(u.cell.x) >= min_engage_col:
					has_breacher_in_zone = true

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
	var gcols := grid_cols
	var dense_repath_cd := 0.16 if units.size() > 10 else 0.0

	for u in units:
		if float(u.hp) <= 0.0:
			continue
		u.anim_t = float(u.anim_t) + dt
		u.slash_cd = maxf(0.0, float(u.slash_cd) - dt)
		var rcd := maxf(0.0, float(u.get("repath_cd", 0.0)) - dt)
		u.repath_cd = rcd
		var is_def := bool(u.is_defender)
		var uid := int(u.id)
		var ucell: Vector2i = u.cell
		var gpos := unit_grid_pos(u)
		var sp_id := str(u.species)

		# 1) 격실별 생화학 독가스(격실벽·방화문 밀폐 연동) & 화재 및 의무실 회복
		if not cell_gas.is_empty():
			var tile_g := float(cell_gas.get(ucell, 0.0))
			if tile_g > 5.0:
				var g_mult := 0.0 if sp_id == "lanius" else (0.25 if (sp_id == "rock" or sp_id == "crystal") else 1.0)
				if g_mult > 0.0:
					u.hp = maxf(0.0, float(u.hp) - 10.8 * (tile_g / 100.0) * g_mult * dt)
		var in_choke := (gpos.x >= choke_x_min and gpos.x <= choke_x_max)
		var in_med := (gpos.x >= med_x_min)
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
		var u_idx := ucell.y * gcols + ucell.x
		var stacked_same_team := _is_idx_stationary_occupied_by_team(u_idx, is_def, uid)

		if not is_def:
			if not in_mid_hop and not stacked_same_team:
				var eng_d := _find_engageable_opponent_fast(ucell, false)
				if not eng_d.is_empty():
					var old_gd: Vector2i = u.goal_cell
					u.path = [] as Array[Vector2i]
					u.next_cell = ucell
					u.move_t = 0.0
					u.goal_cell = ucell
					_claim_shift(old_gd, ucell, false, uid)
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
						_push_fx({"kind": "slash", "gx": gpos.x, "gy": gpos.y, "tx": d_gpos.x, "ty": d_gpos.y, "color": RED, "t": 0.0, "dur": 0.20})
						_push_fx({"kind": "pop", "gx": d_gpos.x, "gy": d_gpos.y, "text": "-%.0f" % (eff_dps * 0.42), "color": Color("#ff9a8a"), "t": 0.0, "dur": 0.55})
					if float(eng_d.hp) <= 0.0 and not (eng_d in died_this_step):
						died_this_step.append(eng_d)
					continue

			var goal_c: Vector2i = u.goal_cell
			var need_repath := (u.path as Array).is_empty() or _is_idx_claimed_by_team(goal_c.y * gcols + goal_c.x, false, uid)
			if not in_mid_hop and need_repath and rcd <= 0.0:
				var pick := _pick_combat_tile_and_path(u, alive_def, 0, gcols - 1)
				if not pick.is_empty():
					var atk_tgt: Vector2i = pick.cell
					var atk_route: Array[Vector2i] = pick.path
					if atk_tgt != ucell and not atk_route.is_empty():
						u.path = atk_route
						u.goal_cell = atk_tgt
						_claim_shift(goal_c, atk_tgt, false, uid)
					elif dense_repath_cd > 0.0:
						u.repath_cd = dense_repath_cd + float(uid % 5) * 0.03
				elif dense_repath_cd > 0.0:
					u.repath_cd = dense_repath_cd + float(uid % 5) * 0.03
			if not _advance_unit_grid_step(u, dt, atk_scale):
				u.state = "idle"
		else:
			if not in_mid_hop and not stacked_same_team:
				var eng_a := _find_engageable_opponent_fast(ucell, true)
				if not eng_a.is_empty():
					var old_ga: Vector2i = u.goal_cell
					u.path = [] as Array[Vector2i]
					u.next_cell = ucell
					u.move_t = 0.0
					u.goal_cell = ucell
					_claim_shift(old_ga, ucell, true, uid)
					var a_gpos := unit_grid_pos(eng_a)
					u.facing = _cardinal_facing(a_gpos - gpos) if a_gpos.distance_to(gpos) > 0.05 else Vector2.LEFT
					u.state = "fight"
					var def_dps := 11.5 * float(u.combat_mult) * mastery_mult
					var ddmg := def_dps * dt
					eng_a.hp = maxf(0.0, float(eng_a.hp) - ddmg)
					total_def_dmg_dealt += ddmg
					if float(u.slash_cd) <= 0.0:
						u.slash_cd = 0.40
						_push_fx({"kind": "slash", "gx": gpos.x, "gy": gpos.y, "tx": a_gpos.x, "ty": a_gpos.y, "color": CYAN, "t": 0.0, "dur": 0.20})
						_push_fx({"kind": "pop", "gx": a_gpos.x, "gy": a_gpos.y, "text": "-%.0f" % (def_dps * 0.40), "color": GREEN, "t": 0.0, "dur": 0.55})
					if float(eng_a.hp) <= 0.0 and not (eng_a in died_this_step):
						died_this_step.append(eng_a)
					continue

			if not in_mid_hop and (u.path as Array).is_empty() and rcd <= 0.0:
				var old_gd2: Vector2i = u.goal_cell
				if has_breacher_in_zone:
					var pick_d := _pick_combat_tile_and_path(u, alive_atk, med_start if defend_in_medbay else (air_end + 1), gcols - 1)
					if not pick_d.is_empty():
						var def_tgt: Vector2i = pick_d.cell
						var def_route: Array[Vector2i] = pick_d.path
						if def_tgt != ucell and not def_route.is_empty():
							u.path = def_route
							u.goal_cell = def_tgt
							_claim_shift(old_gd2, def_tgt, true, uid)
						elif dense_repath_cd > 0.0:
							u.repath_cd = dense_repath_cd + float(uid % 5) * 0.03
					elif dense_repath_cd > 0.0:
						u.repath_cd = dense_repath_cd + float(uid % 5) * 0.03
				else:
					var anc: Vector2i = u.anchor_cell
					if ucell != anc and is_valid_tile(anc) and not _is_idx_claimed_by_team(anc.y * gcols + anc.x, true, uid):
						var ar := find_grid_path(ucell, anc, true, false)
						if not ar.is_empty():
							u.path = ar
							u.goal_cell = anc
							_claim_shift(old_gd2, anc, true, uid)
						elif dense_repath_cd > 0.0:
							u.repath_cd = dense_repath_cd + float(uid % 5) * 0.03
			if not _advance_unit_grid_step(u, dt, atk_scale):
				u.facing = Vector2.LEFT
				u.state = "man" if (in_med and medbay_powered) else "idle"

	# 4) FTL 졸탄(Zoltan) 사망 시 에너지 폭발 (주변 2칸 이내 적군에게 즉시 15 고정 피해, 격실벽 너머는 폭발 차단!)
	for dead_u in died_this_step:
		if str(dead_u.species) == "zoltan":
			zoltan_blasts_triggered += 1
			var dpos_z := unit_grid_pos(dead_u)
			var dcell_z: Vector2i = dead_u.cell
			var dci_z := dcell_z.y * gcols + dcell_z.x
			_push_fx({"kind": "blast", "gx": dpos_z.x, "gy": dpos_z.y, "t": 0.0, "dur": 0.55, "color": GREEN})
			_push_fx({"kind": "pop", "gx": dpos_z.x, "gy": dpos_z.y, "text": "졸탄 자폭 -15!", "color": GOLD, "t": 0.0, "dur": 0.85})
			var targets_z := alive_atk if bool(dead_u.is_defender) else alive_def
			for other in targets_z:
				if float(other.hp) > 0.0:
					if unit_grid_pos(other).distance_to(dpos_z) <= 2.1:
						var ocell: Vector2i = other.cell
						var dz := _edge_dir_index(dcell_z, ocell)
						if dz >= 0:
							var zbh_v: Variant = _edge_barrier[dci_z * 4 + dz]
							if zbh_v != null and float((zbh_v as Dictionary).hp) > 0.0 and str((zbh_v as Dictionary).kind) == "wall":
								continue
						other.hp = maxf(0.0, float(other.hp) - 15.0)

	# 5) 승패 판정 갱신
	var rem_atk := 0
	var rem_def := 0
	for u_end in units:
		if float(u_end.hp) > 0.0:
			if bool(u_end.is_defender):
				rem_def += 1
			else:
				rem_atk += 1
	if rem_atk == 0 and rem_def == 0:
		outcome = "draw"
	elif rem_atk == 0:
		outcome = "defender_win"
	elif rem_def == 0:
		outcome = "attacker_win"

	last_step_ms = float(Time.get_ticks_usec() - step_t0) / 1000.0
	avg_step_ms = last_step_ms if avg_step_ms <= 0.0001 else lerpf(avg_step_ms, last_step_ms, 0.15)

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

func _update_telemetry_labels(force: bool = false) -> void:
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
	var fps_val := Engine.get_frames_per_second()

	if _telemetry_label != null:
		var new_txt := "%.1fs | 공%d vs 방%d | 벽%d·문%d | %.2fms · %dFPS | %s" % [
			round_elapsed, rem_a, rem_d, n_walls, n_doors, avg_step_ms, fps_val, status_ko
		]
		if force or _telemetry_label.text != new_txt:
			_telemetry_label.text = new_txt
		var t_col := GREEN if outcome == "defender_win" else (RED if outcome == "attacker_win" else GOLD)
		if force or t_col != _last_telemetry_color:
			_last_telemetry_color = t_col
			_telemetry_label.add_theme_color_override("font_color", t_col)

	if _summary_label != null:
		var tool_hint := "타일 클릭: 4방향 이동 (우클릭: 경계 제거)"
		if active_tool == "fire_door":
			tool_hint = "블럭 경계선 클릭: 방화문 Lv.1 설치 -> 재클릭 Lv.2/Lv.3 업글!"
		elif active_tool == "wall":
			tool_hint = "블럭 경계선 클릭: 격실벽 Lv.1 설치 -> 재클릭 Lv.2/Lv.3 업글!"
		elif active_tool == "remove":
			tool_hint = "블럭 경계선 클릭: 설치된 격실벽·방화문 즉시 제거!"
		var deck_tag := "16×6 대규모" if grid_cols > GRID_COLS else "10×3 전술"
		var new_sum := "[%s] 공DPS %.1f(장갑-%.0f%%) vs 방DPS %.1f | 의무 +%.0f/s | %s" % [
			deck_tag, atk_eff_dps, float(params.def_armor_pct), def_unit_dps,
			(float(params.medbay_heal_s) if medbay_powered else 0.0), tool_hint,
		]
		if force or _summary_label.text != new_sum:
			_summary_label.text = new_sum
