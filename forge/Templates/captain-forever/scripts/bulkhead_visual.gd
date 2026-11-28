class_name BulkheadVisual
extends RefCounted

## 컨셉 레퍼런스 기반 산업용 금속 격실벽 · 방화문 오토타일 렌더러:
## - Lv.1 일반 격실벽: 웨더링 그레이 강철 플레이트 + 양측 리벳 플랜지 + 용접 이음판
## - Lv.2 보강 격실벽: 슬레이트 블루 주름(골판) 철판 + 가로 볼트 리벳 보강띠
## - Lv.3 중장갑 격실벽: 이중 장갑 플랜지 + 건메탈 주름 코어 + 텅스텐 골드 중볼트 & 용접 클램프
## - L / T / + 교차점: 45° 사선 이음매(miter seam) 및 코너 리벳 허브 자동 결합!
## - 방화문(Fire Door): 동일 산업용 리벳 문틀(jamb) + 슬라이딩 방화 셔터(개방 시 문틀 내부 수납) + 잠금 볼트 LED

const DIR_N := 1 # -Y
const DIR_E := 2 # +X
const DIR_S := 4 # +Y
const DIR_W := 8 # -X

static func _draw_rivet(canvas: CanvasItem, pos: Vector2, r: float, base_col: Color, hi_col: Color) -> void:
	canvas.draw_circle(pos + Vector2(r * 0.28, r * 0.32), r * 1.12, Color(0.05, 0.07, 0.10, 0.85))
	canvas.draw_circle(pos, r, base_col)
	canvas.draw_circle(pos - Vector2(r * 0.28, r * 0.28), r * 0.45, hi_col)

static func _wall_palette(level: int) -> Dictionary:
	if level >= 3:
		# Lv.3: 건메탈 주름 코어 + 텅스텐 골드 중볼트 플랜지
		return {
			"style": "hybrid_heavy",
			"plate": Color("#5c6670"),
			"plate_hi": Color("#8b96a3"),
			"flange": Color("#464f59"),
			"flange_hi": Color("#b4bfd0"),
			"rib_dark": Color("#28323d"),
			"rib_light": Color("#66778a"),
			"strap": Color("#7c8794"),
			"rivet": Color("#d9a94e"),
			"rivet_hi": Color("#fff2b2"),
			"seam": Color("#1d232b"),
			"trim": Color("#e8b954"),
		}
	elif level == 2:
		# Lv.2: 컨셉 하단 — 슬레이트 블루 주름(골판) 철판 + 가로 볼트 보강띠
		return {
			"style": "corrugated",
			"plate": Color("#485f76"),
			"plate_hi": Color("#6c88a3"),
			"flange": Color("#54697d"),
			"flange_hi": Color("#8ea8c2"),
			"rib_dark": Color("#263545"),
			"rib_light": Color("#65809c"),
			"strap": Color("#6c7e90"),
			"rivet": Color("#9cb0c4"),
			"rivet_hi": Color("#e2effa"),
			"seam": Color("#1b2633"),
			"trim": Color("#7aa0c4"),
		}
	# Lv.1: 컨셉 상단 — 웨더링 그레이 리벳 강철 플레이트
	return {
		"style": "riveted_steel",
		"plate": Color("#7c828a"),
		"plate_hi": Color("#a2a9b2"),
		"flange": Color("#636970"),
		"flange_hi": Color("#b9c0c8"),
		"rib_dark": Color("#4b5057"),
		"rib_light": Color("#9198a1"),
		"strap": Color("#8d949d"),
		"rivet": Color("#adb4bd"),
		"rivet_hi": Color("#eef3f8"),
		"seam": Color("#2a2e33"),
		"trim": Color("#9ca3ac"),
	}

static func _draw_rect_oriented(canvas: CanvasItem, center: Vector2, axis: Vector2, perp: Vector2, half_len: float, half_w: float, col: Color) -> void:
	var a := axis * half_len
	var p := perp * half_w
	var pts := PackedVector2Array([
		center - a - p,
		center + a - p,
		center + a + p,
		center - a + p,
	])
	canvas.draw_colored_polygon(pts, col)

static func _draw_wall_segment(
	canvas: CanvasItem,
	v0: Vector2,
	v1: Vector2,
	thick: float,
	level: int,
	is_selected: bool
) -> void:
	var seg := v1 - v0
	var slen := seg.length()
	if slen < 4.0:
		return
	var axis := seg / slen
	var perp := Vector2(-axis.y, axis.x)
	var mid := (v0 + v1) * 0.5
	var hw := thick * 0.5
	var hl := slen * 0.5
	var pal := _wall_palette(level)
	var style := str(pal.style)

	# 1) 외곽 드롭 섀도우 & 선택 하이라이트
	if is_selected:
		_draw_rect_oriented(canvas, mid, axis, perp, hl + 2.5, hw + 3.6, Color(1.0, 0.90, 0.38, 0.52))
	_draw_rect_oriented(canvas, mid + Vector2(1.2, 1.5), axis, perp, hl + 0.5, hw + 1.4, Color(0.03, 0.05, 0.08, 0.78))

	# 2) 다크 외곽선 베벨 + 베이스 금속 본체
	_draw_rect_oriented(canvas, mid, axis, perp, hl, hw + 1.0, pal.seam as Color)
	_draw_rect_oriented(canvas, mid, axis, perp, hl, hw, pal.plate as Color)

	# 3) 스타일별 내부 텍스처 (Lv.1 리벳 강판 vs Lv.2 블루 주름철판 vs Lv.3 중장갑 하이브리드)
	var flange_w := maxf(2.0, thick * 0.22)
	if style == "riveted_steel":
		# 상단/하단 외곽 베벨 플랜지 + 중앙 리세스 강판 + 중앙 이음선
		_draw_rect_oriented(canvas, mid - perp * (hw - flange_w * 0.5), axis, perp, hl, flange_w * 0.5, pal.flange as Color)
		_draw_rect_oriented(canvas, mid + perp * (hw - flange_w * 0.5), axis, perp, hl, flange_w * 0.5, pal.flange as Color)
		# 중앙 리세스 어두운 테두리 라인
		var inner_off := hw - flange_w
		canvas.draw_line(v0 - perp * inner_off, v1 - perp * inner_off, pal.seam as Color, 1.1)
		canvas.draw_line(v0 + perp * inner_off, v1 + perp * inner_off, pal.seam as Color, 1.1)
		# 하이라이트 에지 (좌상단 빛 반사)
		canvas.draw_line(v0 - perp * (hw - 0.8), v1 - perp * (hw - 0.8), Color(pal.flange_hi.r, pal.flange_hi.g, pal.flange_hi.b, 0.72), 1.0)
		# 중앙 미세 금속 패널 분할 이음선
		canvas.draw_line(mid - perp * inner_off, mid + perp * inner_off, Color(0.18, 0.21, 0.25, 0.65), 1.0)
		# 양쪽 플랜지 위 3D 리벳 열
		var r_rad := clampf(thick * 0.11, 1.0, 2.0)
		var r_off := hw - flange_w * 0.5
		var n_rivets := maxi(3, int(round(slen / maxf(9.0, thick * 0.85))))
		for i in range(1, n_rivets):
			var t := float(i) / float(n_rivets)
			var rp := v0.lerp(v1, t)
			_draw_rivet(canvas, rp - perp * r_off, r_rad, pal.rivet as Color, pal.rivet_hi as Color)
			_draw_rivet(canvas, rp + perp * r_off, r_rad, pal.rivet as Color, pal.rivet_hi as Color)
	elif style == "corrugated":
		# 블루 주름(골판) 철판 세로/가로 평행 홈 (컨셉 하단)
		var n_flutes := 5
		var flute_step := (thick - 2.4) / float(n_flutes)
		for fi in n_flutes:
			var f_off := -hw + 1.2 + (float(fi) + 0.5) * flute_step
			var f_col: Color = (pal.rib_dark as Color) if (fi % 2 == 0) else (pal.rib_light as Color)
			canvas.draw_line(v0 + perp * f_off, v1 + perp * f_off, f_col, maxf(1.2, flute_step * 0.78))
		# 외곽 얇은 메탈 림
		canvas.draw_line(v0 - perp * (hw - 0.7), v1 - perp * (hw - 0.7), pal.flange_hi as Color, 1.1)
		canvas.draw_line(v0 + perp * (hw - 0.7), v1 + perp * (hw - 0.7), pal.seam as Color, 1.1)
		# 가로 볼트 리벳 보강띠 (cross-straps) 2~3줄
		var strap_w := clampf(thick * 0.24, 2.4, 4.2)
		var r_rad2 := clampf(thick * 0.13, 1.2, 2.3)
		var strap_ts := [0.22, 0.50, 0.78] if slen >= 34.0 else [0.28, 0.72]
		for st in strap_ts:
			var sc := v0.lerp(v1, float(st))
			_draw_rect_oriented(canvas, sc, axis, perp, strap_w * 0.5 + 0.6, hw + 0.3, pal.seam as Color)
			_draw_rect_oriented(canvas, sc, axis, perp, strap_w * 0.5, hw - 0.2, pal.strap as Color)
			canvas.draw_line(sc - axis * (strap_w * 0.35) - perp * (hw - 0.5), sc - axis * (strap_w * 0.35) + perp * (hw - 0.5), pal.flange_hi as Color, 0.9)
			_draw_rivet(canvas, sc - perp * (hw * 0.64), r_rad2, pal.rivet as Color, pal.rivet_hi as Color)
			_draw_rivet(canvas, sc + perp * (hw * 0.64), r_rad2, pal.rivet as Color, pal.rivet_hi as Color)
	else:
		# Lv.3 중장갑 방화격실벽: 중앙 주름 코어 + 두꺼운 리벳 장갑 플랜지 + 텅스텐 골드 중볼트 보강띠
		var inner_hw := hw - flange_w
		for fi3 in 3:
			var f_off3 := -inner_hw + (float(fi3) + 0.5) * (inner_hw * 2.0 / 3.0)
			canvas.draw_line(v0 + perp * f_off3, v1 + perp * f_off3, (pal.rib_dark as Color) if (fi3 % 2 == 0) else (pal.rib_light as Color), maxf(1.4, inner_hw * 0.55))
		_draw_rect_oriented(canvas, mid - perp * (hw - flange_w * 0.5), axis, perp, hl, flange_w * 0.5, pal.flange as Color)
		_draw_rect_oriented(canvas, mid + perp * (hw - flange_w * 0.5), axis, perp, hl, flange_w * 0.5, pal.flange as Color)
		canvas.draw_line(v0 - perp * (hw - 0.7), v1 - perp * (hw - 0.7), pal.trim as Color, 1.3)
		canvas.draw_line(v0 + perp * (hw - 0.7), v1 + perp * (hw - 0.7), pal.trim as Color, 1.3)
		var strap_w3 := clampf(thick * 0.26, 2.8, 4.6)
		var r_rad3 := clampf(thick * 0.14, 1.3, 2.5)
		for st3 in [0.22, 0.50, 0.78]:
			var sc3 := v0.lerp(v1, float(st3))
			_draw_rect_oriented(canvas, sc3, axis, perp, strap_w3 * 0.5 + 0.6, hw + 0.4, pal.seam as Color)
			_draw_rect_oriented(canvas, sc3, axis, perp, strap_w3 * 0.5, hw, pal.strap as Color)
			_draw_rivet(canvas, sc3 - perp * (hw * 0.68), r_rad3, pal.rivet as Color, pal.rivet_hi as Color)
			_draw_rivet(canvas, sc3 + perp * (hw * 0.68), r_rad3, pal.rivet as Color, pal.rivet_hi as Color)

static func _draw_fire_door_segment(
	canvas: CanvasItem,
	v0: Vector2,
	v1: Vector2,
	thick: float,
	level: int,
	is_open: bool,
	is_locked: bool,
	is_selected: bool
) -> void:
	var seg := v1 - v0
	var slen := seg.length()
	if slen < 4.0:
		return
	var axis := seg / slen
	var perp := Vector2(-axis.y, axis.x)
	var mid := (v0 + v1) * 0.5
	var hw := thick * 0.5
	var hl := slen * 0.5
	var jamb_len := clampf(slen * 0.18, 5.0, 10.0)

	if is_selected:
		_draw_rect_oriented(canvas, mid, axis, perp, hl + 2.2, hw + 3.4, Color(1.0, 0.90, 0.38, 0.52))

	# 양끝 산업용 리벳 강철 문틀(Door Jambs)
	var jamb_col := Color("#5d6672") if level == 1 else (Color("#697685") if level == 2 else Color("#7a725e"))
	var jamb_hi := Color("#aeb9c7") if level < 3 else Color("#f2cf72")
	for end_pt in [v0 + axis * (jamb_len * 0.5), v1 - axis * (jamb_len * 0.5)]:
		_draw_rect_oriented(canvas, end_pt, axis, perp, jamb_len * 0.5 + 0.6, hw + 1.0, Color("#1b222c"))
		_draw_rect_oriented(canvas, end_pt, axis, perp, jamb_len * 0.5, hw + 0.2, jamb_col)
		_draw_rivet(canvas, end_pt - perp * (hw * 0.52), clampf(thick * 0.12, 1.1, 2.0), jamb_hi, Color.WHITE)
		_draw_rivet(canvas, end_pt + perp * (hw * 0.52), clampf(thick * 0.12, 1.1, 2.0), jamb_hi, Color.WHITE)

	var leaf_accent := Color("#ff5c74") if level == 1 else (Color("#ff9638") if level == 2 else Color("#ffd84d"))
	var led_col := Color("#6ef2ff") if is_open else (leaf_accent if is_locked else Color("#74f2ce"))

	if is_open:
		# 개방 상태: 문틀 내부로 슬라이딩 수납된 양측 셔터 끝단 + 레일 가이드
		canvas.draw_line(v0 + axis * jamb_len, v1 - axis * jamb_len, Color(0.18, 0.36, 0.48, 0.45), 1.6)
		var stub := jamb_len * 0.45
		_draw_rect_oriented(canvas, v0 + axis * (jamb_len + stub * 0.5), axis, perp, stub * 0.5, hw * 0.62, led_col)
		_draw_rect_oriented(canvas, v1 - axis * (jamb_len + stub * 0.5), axis, perp, stub * 0.5, hw * 0.62, led_col)
	else:
		# 밀폐 상태: 양쪽에서 맞물린 슬라이딩 방화 셔터 2짝 + 중앙 유압 잠금장치 + 등급 스트라이프
		var leaf_span := hl - jamb_len
		var door_hw := hw * (0.78 if level == 1 else (0.86 if level == 2 else 0.94))
		var leaf_fill := Color("#3b4450") if level == 1 else (Color("#445466") if level == 2 else Color("#524d40"))
		_draw_rect_oriented(canvas, mid, axis, perp, leaf_span + 0.5, door_hw + 0.9, Color("#141921"))
		_draw_rect_oriented(canvas, mid, axis, perp, leaf_span, door_hw, leaf_fill)
		# 방화문 등급 컬러 테두리 띠
		canvas.draw_line(v0 + axis * jamb_len - perp * (door_hw - 1.1), v1 - axis * jamb_len - perp * (door_hw - 1.1), leaf_accent, 1.6)
		canvas.draw_line(v0 + axis * jamb_len + perp * (door_hw - 1.1), v1 - axis * jamb_len + perp * (door_hw - 1.1), leaf_accent, 1.6)
		# Lv.2/Lv.3 중장갑 가로 잠금 바
		if level >= 2:
			canvas.draw_line(v0 + axis * (jamb_len + 2.0), v1 - axis * (jamb_len + 2.0), jamb_hi, 1.8 if level == 2 else 2.6)
		# 중앙 맞물림 틈 + 유압 잠금 볼트
		canvas.draw_line(mid - perp * door_hw, mid + perp * door_hw, Color("#11161e"), 1.6)
		canvas.draw_circle(mid, clampf(thick * 0.24, 2.2, 4.0), Color("#151c24"))
		canvas.draw_circle(mid, clampf(thick * 0.16, 1.5, 2.8), led_col)
		if level >= 3:
			_draw_rivet(canvas, mid - axis * (leaf_span * 0.48), 1.8, Color("#ffd84d"), Color("#fff8cc"))
			_draw_rivet(canvas, mid + axis * (leaf_span * 0.48), 1.8, Color("#ffd84d"), Color("#fff8cc"))

## 격자 꼭짓점(L / T / + / 끝단 캡) 오토타일 금속 접합 허브 렌더링 (45° 사선 이음매 & 4코너 리벳)
static func _draw_junction_hub(
	canvas: CanvasItem,
	vpos: Vector2,
	mask: int,
	max_level: int,
	thick: float
) -> void:
	if mask == 0:
		return
	var hw := thick * 0.5
	var pal := _wall_palette(max_level)
	var deg := (1 if (mask & DIR_N) != 0 else 0) + (1 if (mask & DIR_E) != 0 else 0) + (1 if (mask & DIR_S) != 0 else 0) + (1 if (mask & DIR_W) != 0 else 0)
	var is_straight := (mask == (DIR_N | DIR_S)) or (mask == (DIR_E | DIR_W))

	if is_straight:
		# 일직선 연결 이음부: 깔끔한 용접 이음판(weld seam plate)
		var is_vert := (mask == (DIR_N | DIR_S))
		var axis := Vector2.DOWN if is_vert else Vector2.RIGHT
		var perp := Vector2(-axis.y, axis.x)
		_draw_rect_oriented(canvas, vpos, axis, perp, 2.0, hw + 0.6, pal.seam as Color)
		_draw_rect_oriented(canvas, vpos, axis, perp, 1.3, hw + 0.1, pal.strap as Color)
		return

	# 끝단 캡(deg == 1), L-코너(deg == 2), T-분기(deg == 3), +교차(deg == 4) 금속 정사각 허브!
	var box_r := Rect2(vpos - Vector2(hw, hw), Vector2(thick, thick))
	canvas.draw_rect(box_r.grow(1.1), pal.seam as Color, true)
	canvas.draw_rect(box_r, pal.flange as Color, true)
	canvas.draw_rect(box_r.grow(-maxf(1.6, thick * 0.18)), pal.plate as Color, true)
	canvas.draw_rect(box_r, Color(pal.flange_hi.r, pal.flange_hi.g, pal.flange_hi.b, 0.65), false, 1.0)

	# L / T / + 교차점의 45° 사선 이음매(miter seam — 컨셉 레퍼런스의 핵심 디테일!)
	if deg >= 2:
		if ((mask & DIR_N) != 0 and (mask & DIR_E) != 0) or ((mask & DIR_S) != 0 and (mask & DIR_W) != 0):
			canvas.draw_line(vpos + Vector2(-hw + 1.5, hw - 1.5), vpos + Vector2(hw - 1.5, -hw + 1.5), pal.seam as Color, 1.3)
		if ((mask & DIR_N) != 0 and (mask & DIR_W) != 0) or ((mask & DIR_S) != 0 and (mask & DIR_E) != 0):
			canvas.draw_line(vpos + Vector2(-hw + 1.5, -hw + 1.5), vpos + Vector2(hw - 1.5, hw - 1.5), pal.seam as Color, 1.3)

	# 허브 4코너 리벳 (또는 끝단 용접 핀)
	var roff := hw * 0.64
	var rrad := clampf(thick * 0.12, 1.1, 2.1)
	for c_off in [Vector2(-roff, -roff), Vector2(roff, -roff), Vector2(-roff, roff), Vector2(roff, roff)]:
		_draw_rivet(canvas, vpos + (c_off as Vector2), rrad, pal.rivet as Color, pal.rivet_hi as Color)

## 통합 진입점: 격자 경계 딕셔너리(barriers / bulkheads)를 L/T/+ 오토타일 리벳·주름철판으로 일괄 렌더링
## grid_origin: 셀 (0,0)의 좌상단 픽셀(mode="corner") 또는 셀 (0,0)의 중심 픽셀(mode="center")
static func draw_edge_barriers(
	canvas: CanvasItem,
	barriers_dict: Dictionary,
	cell_px: float,
	grid_origin: Vector2,
	origin_is_cell_center: bool = false,
	door_master_locked: bool = true,
	selected_key: String = "",
	font: Font = null,
	show_badges: bool = true
) -> void:
	if barriers_dict.is_empty():
		return
	var base_thick := clampf(cell_px * 0.21, 7.2, 13.5)
	var v_masks: Dictionary = {}  # Vector2i -> int (N/E/S/W bitmask)
	var v_levels: Dictionary = {} # Vector2i -> int (max wall/door level touching vertex)
	var v_thick: Dictionary = {}  # Vector2i -> float

	var segs_to_draw: Array[Dictionary] = []

	for bkey_v in barriers_dict.keys():
		var bkey := str(bkey_v)
		var bh: Dictionary = barriers_dict[bkey_v]
		if float(bh.get("hp", 0.0)) <= 0.0:
			continue
		var ca: Vector2i = bh.a
		var cb: Vector2i = bh.b
		var diff := cb - ca
		if absi(diff.x) + absi(diff.y) != 1:
			continue
		# 정규화: ca -> cb가 RIGHT(+1,0) 또는 DOWN(0,+1) 방향이 되도록 정렬
		if diff.x < 0 or diff.y < 0:
			var tmp := ca
			ca = cb
			cb = tmp
			diff = cb - ca

		# 두 셀 사이 경계선의 양 끝 격자 꼭짓점(v0_grid, v1_grid) 계산
		var v0_g := Vector2i.ZERO
		var v1_g := Vector2i.ZERO
		if diff.x == 1:
			# 수직 경계선: (ca.x + 1, ca.y) -> (ca.x + 1, ca.y + 1)
			v0_g = Vector2i(ca.x + 1, ca.y)
			v1_g = Vector2i(ca.x + 1, ca.y + 1)
			v_masks[v0_g] = int(v_masks.get(v0_g, 0)) | DIR_S
			v_masks[v1_g] = int(v_masks.get(v1_g, 0)) | DIR_N
		else:
			# 수평 경계선: (ca.x, ca.y + 1) -> (ca.x + 1, ca.y + 1)
			v0_g = Vector2i(ca.x, ca.y + 1)
			v1_g = Vector2i(ca.x + 1, ca.y + 1)
			v_masks[v0_g] = int(v_masks.get(v0_g, 0)) | DIR_E
			v_masks[v1_g] = int(v_masks.get(v1_g, 0)) | DIR_W

		var raw_kind := str(bh.get("kind", "wall"))
		var is_wall := (raw_kind == "wall" or raw_kind == "firewall")
		var lv := int(bh.get("level", 2 if raw_kind == "firewall" else 1))
		var seg_thick := base_thick * (0.94 if lv == 1 else (1.06 if lv == 2 else 1.18))
		v_levels[v0_g] = maxi(int(v_levels.get(v0_g, 1)), lv)
		v_levels[v1_g] = maxi(int(v_levels.get(v1_g, 1)), lv)
		v_thick[v0_g] = maxf(float(v_thick.get(v0_g, 0.0)), seg_thick)
		v_thick[v1_g] = maxf(float(v_thick.get(v1_g, 0.0)), seg_thick)

		var off_shift := Vector2(-0.5, -0.5) if origin_is_cell_center else Vector2.ZERO
		var p0 := grid_origin + (Vector2(v0_g) + off_shift) * cell_px
		var p1 := grid_origin + (Vector2(v1_g) + off_shift) * cell_px
		segs_to_draw.append({
			"key": bkey,
			"bh": bh,
			"is_wall": is_wall,
			"level": lv,
			"thick": seg_thick,
			"p0": p0,
			"p1": p1,
			"diff": diff,
		})

	# 1단계: 모든 벽/방화문 세그먼트 렌더링
	for item in segs_to_draw:
		var bh: Dictionary = item.bh
		var is_sel: bool = (str(item.key) == selected_key)
		if bool(item.is_wall):
			_draw_wall_segment(canvas, item.p0 as Vector2, item.p1 as Vector2, float(item.thick), int(item.level), is_sel)
		else:
			var locked_flag: bool = bool(bh.get("locked", door_master_locked)) and door_master_locked
			var open_flag: bool = bool(bh.get("open", false)) or (not locked_flag and not bool(bh.get("locked", false)) and not door_master_locked)
			_draw_fire_door_segment(canvas, item.p0 as Vector2, item.p1 as Vector2, float(item.thick), int(item.level), open_flag, locked_flag, is_sel)

	# 2단계: 꼭짓점 L / T / + 리벳 금속 접합 허브 렌더링 (세그먼트 이음매를 완벽하게 덮어 산업용 프레임 완성!)
	var off_shift2 := Vector2(-0.5, -0.5) if origin_is_cell_center else Vector2.ZERO
	for vg_v in v_masks.keys():
		var vg: Vector2i = vg_v
		var vpos := grid_origin + (Vector2(vg) + off_shift2) * cell_px
		_draw_junction_hub(canvas, vpos, int(v_masks[vg]), int(v_levels.get(vg, 1)), float(v_thick.get(vg, base_thick)))

	# 3단계: 내구도 게이지 및 등급 배지(벽1~3 / 문1~3) 최상단 표시
	for item2 in segs_to_draw:
		var bh2: Dictionary = item2.bh
		var mid2 := ((item2.p0 as Vector2) + (item2.p1 as Vector2)) * 0.5
		var hpr := clampf(float(bh2.get("hp", 1.0)) / maxf(1.0, float(bh2.get("max_hp", 1.0))), 0.0, 1.0)
		var is_sel2: bool = (str(item2.key) == selected_key)
		if hpr < 0.995 or is_sel2:
			var bar_p := mid2 + Vector2(-13.0, -10.0)
			canvas.draw_rect(Rect2(bar_p, Vector2(26.0, 4.0)), Color(0.04, 0.07, 0.12, 0.94), true)
			canvas.draw_rect(Rect2(bar_p, Vector2(26.0 * hpr, 4.0)), Color("#74f2ce") if bool(item2.is_wall) else Color("#ff9638"), true)
		if show_badges and font != null and cell_px >= 36.0:
			var lv2 := int(item2.level)
			var tag := ("벽%d" if bool(item2.is_wall) else "문%d") % lv2
			var badge_r := Rect2(mid2 + Vector2(-12.0, -7.0), Vector2(24.0, 14.0))
			canvas.draw_rect(badge_r, Color(0.05, 0.08, 0.13, 0.80), true)
			canvas.draw_string(font, mid2 + Vector2(-12.0, 4.0), tag, HORIZONTAL_ALIGNMENT_CENTER, 24.0, 11, Color("#f2f7ff"))

## 10x3 전술 데크 외곽 선체 격벽 테두리 (컨셉 상단 리벳 강판 프레임 + 4코너 45° 이음매 허브)
static func draw_deck_outer_frame(canvas: CanvasItem, grid_origin: Vector2, cols: int, rows: int, cell_px: float) -> void:
	var thick := clampf(cell_px * 0.15, 5.5, 9.0)
	var tl := grid_origin
	var tr := grid_origin + Vector2(float(cols) * cell_px, 0.0)
	var bl := grid_origin + Vector2(0.0, float(rows) * cell_px)
	var br := grid_origin + Vector2(float(cols) * cell_px, float(rows) * cell_px)
	_draw_wall_segment(canvas, tl, tr, thick, 1, false)
	_draw_wall_segment(canvas, bl, br, thick, 1, false)
	_draw_wall_segment(canvas, tl, bl, thick, 1, false)
	_draw_wall_segment(canvas, tr, br, thick, 1, false)
	_draw_junction_hub(canvas, tl, DIR_E | DIR_S, 1, thick)
	_draw_junction_hub(canvas, tr, DIR_W | DIR_S, 1, thick)
	_draw_junction_hub(canvas, bl, DIR_E | DIR_N, 1, thick)
	_draw_junction_hub(canvas, br, DIR_W | DIR_N, 1, thick)
