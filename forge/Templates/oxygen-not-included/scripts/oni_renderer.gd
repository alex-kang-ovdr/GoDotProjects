extends Node2D
class_name OniRenderer

var world: OniWorld
var overlay_mode := "normal" # normal, gas, temp
var hover_cell := Vector2i(-1, -1)
var selected_cell := Vector2i(-1, -1)
var drag_active := false
var drag_start := Vector2i.ZERO
var drag_end := Vector2i.ZERO
var active_tool := "select"

func _draw() -> void:
	if world == null:
		return

	var ts := OniWorld.TILE_SIZE
	var total_w := OniWorld.WIDTH * ts
	var total_h := OniWorld.HEIGHT * ts
	draw_rect(Rect2(0, 0, total_w, total_h), Color(0.06, 0.08, 0.11, 1.0), true)

	# 1) 지형, 액체, 기체 배경
	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			var rect := Rect2(x * ts, y * ts, ts, ts)

			if overlay_mode == "temp":
				draw_rect(rect, _temp_color(world.temp_c[i]), true)
				if not world.solid_el[i].is_empty():
					draw_rect(rect, Color(0, 0, 0, 0.18), false, 1.0)
				continue

			var sol := world.solid_el[i]
			if not sol.is_empty():
				var base_c: Color = OniElements.get_element(sol).get("color", Color(0.5, 0.5, 0.5, 1.0))
				if overlay_mode == "gas":
					base_c = base_c.darkened(0.65)
				draw_rect(rect, base_c, true)
				_draw_solid_pattern(rect, sol, x, y, overlay_mode == "gas")
				draw_rect(rect, Color(0.04, 0.05, 0.07, 0.35), false, 1.0)
			else:
				# 빈 공간: 기체 색상
				var gel := world.gas_el[i]
				var gm := world.gas_mass[i]
				if overlay_mode == "gas":
					var gc := _gas_overlay_color(gel, gm)
					draw_rect(rect, gc, true)
					draw_rect(rect, Color(0.08, 0.12, 0.16, 0.4), false, 1.0)
				else:
					var bg := Color(0.10, 0.13, 0.17, 1.0)
					if gel != "Vacuum" and gm > 0.01:
						var ec: Color = OniElements.get_element(gel).get("color", Color(0.3, 0.7, 0.9))
						var alpha := clampf(gm / 2.2, 0.04, 0.36)
						bg = bg.lerp(ec, alpha)
					draw_rect(rect, bg, true)
					draw_rect(rect, Color(0.16, 0.20, 0.25, 0.25), false, 1.0)

				# 액체 물
				var lm := world.liquid_mass[i]
				if lm > 5.0:
					var h_ratio := clampf(lm / 1000.0, 0.15, 1.0)
					var lh := ts * h_ratio
					var lrect := Rect2(x * ts, (y + 1) * ts - lh, ts, lh)
					draw_rect(lrect, Color(0.16, 0.56, 0.88, 0.78), true)
					draw_line(Vector2(x * ts, lrect.position.y), Vector2((x + 1) * ts, lrect.position.y), Color(0.55, 0.85, 1.0, 0.7), 1.5)

	# 2) 전선 레이어
	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			if world.has_wire[i] == 1:
				var cx := x * ts + ts * 0.5
				var cy := y * ts + ts * 0.5
				var wc := Color(0.96, 0.58, 0.22, 0.92)
				draw_circle(Vector2(cx, cy), 3.0, wc)
				for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
					var nx: int = x + d.x
					var ny: int = y + d.y
					if world.in_bounds(nx, ny):
						var ni := world.idx(nx, ny)
						if world.has_wire[ni] == 1 or world.building[ni] in ["generator", "battery", "diffuser"]:
							draw_line(Vector2(cx, cy), Vector2(cx + d.x * ts * 0.5, cy + d.y * ts * 0.5), wc, 3.0)

	# 3) 건물 레이어
	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			var b := world.building[i]
			if not b.is_empty():
				_draw_building(x, y, i, b, ts)

	# 4) 채굴 / 건설 지시 오버레이
	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			var rect := Rect2(x * ts, y * ts, ts, ts)
			if world.dig_order[i] == 1:
				draw_rect(rect.grow(-2), Color(0.98, 0.62, 0.20, 0.25), true)
				draw_rect(rect.grow(-2), Color(1.0, 0.70, 0.24, 0.95), false, 2.0)
				draw_line(rect.position + Vector2(6, 6), rect.end - Vector2(6, 6), Color(1.0, 0.75, 0.30, 0.85), 2.0)
				draw_line(Vector2(rect.end.x - 6, rect.position.y + 6), Vector2(rect.position.x + 6, rect.end.y - 6), Color(1.0, 0.75, 0.30, 0.85), 2.0)
				if world.dig_progress[i] > 0.01:
					draw_rect(Rect2(rect.position.x + 3, rect.end.y - 6, (ts - 6) * clampf(world.dig_progress[i], 0.0, 1.0), 4), Color(1.0, 0.85, 0.25, 1.0), true)

			var bo := world.build_order[i]
			if not bo.is_empty():
				var bc: Color = OniElements.get_building(bo).get("color", Color(0.4, 0.8, 1.0))
				draw_rect(rect.grow(-2), Color(bc.r, bc.g, bc.b, 0.28), true)
				draw_rect(rect.grow(-2), Color(0.45, 0.88, 1.0, 0.95), false, 2.0)
				if world.build_progress[i] > 0.01:
					draw_rect(Rect2(rect.position.x + 3, rect.end.y - 6, (ts - 6) * clampf(world.build_progress[i], 0.0, 1.0), 4), Color(0.35, 0.95, 0.55, 1.0), true)

	# 5) 대원(Duplicants)
	for dupe in world.duplicants:
		_draw_duplicant(dupe, ts)

	# 6) 호버 / 선택 / 드래그 프리뷰
	if world.in_bounds(selected_cell.x, selected_cell.y):
		var srect := Rect2(selected_cell.x * ts, selected_cell.y * ts, ts, ts)
		draw_rect(srect, Color(1.0, 0.95, 0.45, 0.95), false, 2.5)

	if world.in_bounds(hover_cell.x, hover_cell.y):
		var hrect := Rect2(hover_cell.x * ts, hover_cell.y * ts, ts, ts)
		draw_rect(hrect, Color(0.75, 0.92, 1.0, 0.65), false, 1.5)

	if drag_active:
		var x0: int = min(drag_start.x, drag_end.x)
		var x1: int = max(drag_start.x, drag_end.x)
		var y0: int = min(drag_start.y, drag_end.y)
		var y1: int = max(drag_start.y, drag_end.y)
		var drect := Rect2(x0 * ts, y0 * ts, (x1 - x0 + 1) * ts, (y1 - y0 + 1) * ts)
		var col := Color(1.0, 0.65, 0.20, 0.25) if active_tool == "dig" else (Color(0.95, 0.30, 0.30, 0.25) if active_tool == "cancel" else Color(0.35, 0.85, 1.0, 0.25))
		draw_rect(drect, col, true)
		draw_rect(drect, Color(col.r, col.g, col.b, 0.95), false, 2.0)

func _draw_solid_pattern(rect: Rect2, sol: String, x: int, y: int, dim: bool) -> void:
	var a := 0.14 if dim else 0.34
	var p := rect.position
	if sol == "Algae":
		draw_circle(p + Vector2(10, 12), 4.0, Color(0.44, 0.84, 0.42, a))
		draw_circle(p + Vector2(22, 20), 5.0, Color(0.16, 0.38, 0.20, a))
	elif sol == "Cuprite":
		draw_rect(Rect2(p + Vector2(6, 7), Vector2(8, 5)), Color(0.98, 0.66, 0.34, a), true)
		draw_rect(Rect2(p + Vector2(18, 18), Vector2(7, 6)), Color(0.42, 0.22, 0.12, a), true)
	elif sol == "Ice":
		draw_line(p + Vector2(5, 22), p + Vector2(22, 5), Color(0.92, 0.98, 1.0, a + 0.12), 2.0)
	elif sol == "Katairite":
		draw_rect(rect.grow(-5), Color(0.62, 0.40, 0.82, a), false, 1.5)
	elif sol == "Carbon":
		draw_circle(p + Vector2(15, 16), 6.0, Color(0.08, 0.08, 0.10, a + 0.15))
	elif (x + y) % 2 == 0:
		draw_rect(Rect2(p + Vector2(6, 10), Vector2(12, 3)), Color(0, 0, 0, a * 0.6), true)

func _draw_building(x: int, y: int, i: int, b: String, ts: int) -> void:
	var rect := Rect2(x * ts, y * ts, ts, ts)
	var p := rect.position
	match b:
		"tile":
			draw_rect(rect, Color(0.56, 0.60, 0.66, 1.0), true)
			draw_rect(rect.grow(-2), Color(0.68, 0.72, 0.78, 1.0), false, 1.5)
			draw_line(p + Vector2(3, ts * 0.5), p + Vector2(ts - 3, ts * 0.5), Color(0.42, 0.46, 0.52, 0.8), 1.5)
		"ladder":
			var lc := Color(0.78, 0.60, 0.34, 1.0)
			draw_line(p + Vector2(7, 0), p + Vector2(7, ts), lc, 3.0)
			draw_line(p + Vector2(ts - 7, 0), p + Vector2(ts - 7, ts), lc, 3.0)
			for ry in [6, 14, 22, 29]:
				draw_line(p + Vector2(7, ry), p + Vector2(ts - 7, ry), lc, 2.0)
		"pod":
			draw_rect(rect.grow(-1), Color(0.24, 0.34, 0.48, 0.92), true)
			draw_rect(rect.grow(-3), Color(0.44, 0.86, 1.0, 0.75), false, 2.0)
			draw_circle(p + Vector2(ts * 0.5, ts * 0.5), 5.0, Color(0.55, 0.94, 1.0, 0.85))
		"diffuser":
			var active := world.diffuser_running[i] == 1
			draw_rect(Rect2(p + Vector2(4, 6), Vector2(ts - 8, ts - 6)), Color(0.24, 0.58, 0.48, 1.0), true)
			draw_rect(Rect2(p + Vector2(4, 6), Vector2(ts - 8, ts - 6)), Color(0.50, 0.92, 0.78, 1.0), false, 1.5)
			var glow := Color(0.42, 0.95, 1.0, 1.0) if active else Color(0.25, 0.34, 0.36, 1.0)
			draw_circle(p + Vector2(ts * 0.5, 16), 6.0, glow)
		"generator":
			var active := world.gen_active[i] == 1
			var c := Color(0.95, 0.78, 0.28, 1.0) if active else Color(0.68, 0.54, 0.26, 1.0)
			draw_arc(p + Vector2(ts * 0.5, ts * 0.5), 11.0, 0.0, TAU, 18, c, 3.0)
			draw_circle(p + Vector2(ts * 0.5, ts * 0.5), 3.0, c)
		"battery":
			draw_rect(Rect2(p + Vector2(5, 4), Vector2(ts - 10, ts - 4)), Color(0.24, 0.30, 0.34, 1.0), true)
			var ratio := clampf(world.battery_j[i] / OniElements.BATTERY_CAPACITY_J, 0.0, 1.0)
			var bh := (ts - 10) * ratio
			draw_rect(Rect2(p + Vector2(8, ts - 3 - bh), Vector2(ts - 16, bh)), Color(0.32, 0.88, 0.44, 1.0), true)
			draw_rect(Rect2(p + Vector2(5, 4), Vector2(ts - 10, ts - 4)), Color(0.60, 0.72, 0.78, 0.9), false, 1.5)
		"cot":
			draw_rect(Rect2(p + Vector2(2, 18), Vector2(ts - 4, 10)), Color(0.40, 0.58, 0.86, 1.0), true)
			draw_rect(Rect2(p + Vector2(4, 14), Vector2(9, 5)), Color(0.88, 0.92, 0.98, 1.0), true)
		"storage":
			draw_rect(Rect2(p + Vector2(5, 6), Vector2(ts - 10, ts - 6)), Color(0.48, 0.52, 0.58, 1.0), true)
			draw_line(p + Vector2(5, 14), p + Vector2(ts - 5, 14), Color(0.74, 0.78, 0.84, 1.0), 2.0)

func _draw_duplicant(dupe: OniDuplicant, ts: int) -> void:
	var px := dupe.pos.x * ts + ts * 0.5
	var py := dupe.pos.y * ts + ts * 0.5

	# 몸통
	draw_rect(Rect2(px - 6, py - 2, 12, 13), dupe.suit_color, true)
	# 머리(헬멧)
	draw_circle(Vector2(px, py - 8), 7.5, Color(0.96, 0.88, 0.78, 1.0))
	draw_arc(Vector2(px, py - 8), 8.0, 0.0, TAU, 16, Color(0.75, 0.92, 1.0, 0.75), 1.5)
	# 눈
	draw_circle(Vector2(px - 2.5, py - 8.5), 1.3, Color(0.10, 0.12, 0.16, 1.0))
	draw_circle(Vector2(px + 2.5, py - 8.5), 1.3, Color(0.10, 0.12, 0.16, 1.0))

	# 작업 광선
	if (dupe.state == "DIG" or dupe.state == "BUILD") and world.in_bounds(dupe.target_cell.x, dupe.target_cell.y):
		var tx := dupe.target_cell.x * ts + ts * 0.5
		var ty := dupe.target_cell.y * ts + ts * 0.5
		var beam_c := Color(1.0, 0.72, 0.25, 0.85) if dupe.state == "DIG" else Color(0.35, 0.92, 1.0, 0.85)
		draw_line(Vector2(px, py - 2), Vector2(tx, ty), beam_c, 2.2)

	# 산소 부족 시 경고 바
	if dupe.breath < 85.0:
		var bw := 18.0 * clampf(dupe.breath / 100.0, 0.0, 1.0)
		draw_rect(Rect2(px - 9, py - 21, 18, 3), Color(0.15, 0.15, 0.18, 0.9), true)
		draw_rect(Rect2(px - 9, py - 21, bw, 3), Color(0.35, 0.88, 1.0, 1.0), true)

	# 이름표
	var font := ThemeDB.fallback_font
	if font != null:
		draw_string(font, Vector2(px - 14, py - 23), dupe.dupe_name, HORIZONTAL_ALIGNMENT_CENTER, 28, 11, Color(0.95, 0.98, 1.0, 0.92))

func _gas_overlay_color(el: String, mass: float) -> Color:
	if el == "Vacuum" or mass < 0.005:
		return Color(0.05, 0.06, 0.08, 1.0)
	var base: Color = OniElements.get_element(el).get("color", Color(0.4, 0.8, 1.0))
	var k := clampf(mass / 1.8, 0.22, 1.0)
	return Color(base.r * k, base.g * k, base.b * k, 1.0)

func _temp_color(t_c: float) -> Color:
	if t_c <= 0.0:
		var k := clampf((t_c + 25.0) / 25.0, 0.0, 1.0)
		return Color(0.12, 0.35, 0.95).lerp(Color(0.20, 0.78, 0.96), k)
	elif t_c <= 30.0:
		var k := clampf(t_c / 30.0, 0.0, 1.0)
		return Color(0.20, 0.78, 0.96).lerp(Color(0.28, 0.82, 0.42), k)
	elif t_c <= 70.0:
		var k := clampf((t_c - 30.0) / 40.0, 0.0, 1.0)
		return Color(0.28, 0.82, 0.42).lerp(Color(0.96, 0.78, 0.22), k)
	else:
		var k := clampf((t_c - 70.0) / 60.0, 0.0, 1.0)
		return Color(0.96, 0.78, 0.22).lerp(Color(0.96, 0.24, 0.22), k)
