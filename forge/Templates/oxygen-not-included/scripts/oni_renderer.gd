extends Node2D
class_name OniRenderer

var world: OniWorld
var overlay_mode := "normal" # normal, gas, temp, pipe
var hover_cell := Vector2i(-1, -1)
var selected_cell := Vector2i(-1, -1)
var drag_active := false
var drag_start := Vector2i.ZERO
var drag_end := Vector2i.ZERO
var active_tool := "select"

var _anim_time := 0.0
var _fx_particles: Array[Dictionary] = []

func tick_fx(delta: float) -> void:
	_anim_time += delta
	# 기존 파티클 수명/이동 갱신
	var alive: Array[Dictionary] = []
	for p: Dictionary in _fx_particles:
		var life: float = float(p["life"]) - delta
		if life <= 0.0:
			continue
		p["life"] = life
		var pos: Vector2 = p["pos"]
		var vel: Vector2 = p["vel"]
		p["pos"] = pos + vel * delta
		alive.append(p)
	_fx_particles = alive

	if world == null or _fx_particles.size() > 72:
		return

	var ts := float(OniWorld.TILE_SIZE)
	# 대원 채굴/건설 작업 중 파편/스파크 파티클 방출
	for dupe in world.duplicants:
		if (dupe.state == "DIG" or dupe.state == "BUILD") and world.in_bounds(dupe.target_cell.x, dupe.target_cell.y):
			if randf() < delta * 9.0:
				var tx := (float(dupe.target_cell.x) + 0.5) * ts
				var ty := (float(dupe.target_cell.y) + 0.5) * ts
				spawn_fx(
					Vector2(tx + randf_range(-6, 6), ty + randf_range(-6, 6)),
					Vector2(randf_range(-28, 28), randf_range(-38, -8)),
					0.55,
					"dust" if dupe.state == "DIG" else "spark",
					Color(1.0, 0.78, 0.32, 0.9) if dupe.state == "DIG" else Color(0.45, 0.94, 1.0, 0.9)
				)

	# 가동 중 산소 확산기 / 전해조 기포 이펙트
	if randf() < delta * 6.0:
		for y in range(1, OniWorld.HEIGHT - 1):
			for x in range(1, OniWorld.WIDTH - 1):
				var i := world.idx(x, y)
				if world.machine_running[i] == 1 and (world.building[i] == "diffuser" or world.building[i] == "electrolyzer"):
					if randf() < 0.35:
						spawn_fx(
							Vector2((float(x) + 0.5) * ts + randf_range(-8, 8), (float(y) + 0.3) * ts),
							Vector2(randf_range(-8, 8), randf_range(-26, -12)),
							0.9,
							"bubble",
							Color(0.55, 0.94, 1.0, 0.85)
						)

func spawn_fx(pos: Vector2, vel: Vector2, life: float, kind: String, col: Color) -> void:
	if _fx_particles.size() > 90:
		return
	_fx_particles.append({
		"pos": pos,
		"vel": vel,
		"life": life,
		"max_life": life,
		"kind": kind,
		"color": col,
	})

func spawn_burst(cell: Vector2i, kind: String, col: Color) -> void:
	var ts := float(OniWorld.TILE_SIZE)
	var center := Vector2((float(cell.x) + 0.5) * ts, (float(cell.y) + 0.5) * ts)
	for _k in range(7):
		var ang := randf() * TAU
		var spd := randf_range(18.0, 52.0)
		spawn_fx(center, Vector2(cos(ang), sin(ang)) * spd, randf_range(0.35, 0.65), kind, col)

func _draw() -> void:
	if world == null:
		return

	var ts := OniWorld.TILE_SIZE
	var total_w := OniWorld.WIDTH * ts
	var total_h := OniWorld.HEIGHT * ts
	draw_rect(Rect2(0, 0, total_w, total_h), Color(0.06, 0.08, 0.11, 1.0), true)

	var dim_world := overlay_mode == "gas" or overlay_mode == "pipe"

	# 1) 지형(원작 추출 Texture2D), 액체, 기체 배경
	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			var rect := Rect2(x * ts, y * ts, ts, ts)
			var sol := world.solid_el[i]

			if overlay_mode == "temp":
				var tc := _temp_color(world.temp_c[i])
				if not sol.is_empty():
					var ttex := OniMedia.get_element_texture(sol)
					if ttex != null:
						draw_texture_rect(ttex, rect, false, tc.lerp(Color(1, 1, 1, 1), 0.15))
					else:
						draw_rect(rect, tc, true)
					draw_rect(rect, Color(0, 0, 0, 0.22), false, 1.0)
				else:
					draw_rect(rect, tc, true)
				continue

			if not sol.is_empty():
				var tex := OniMedia.get_element_texture(sol)
				if tex != null:
					var mod := Color(0.36, 0.40, 0.46, 1.0) if dim_world else Color(1.0, 1.0, 1.0, 1.0)
					draw_texture_rect(tex, rect, false, mod)
				else:
					var base_c: Color = OniElements.get_element_color(sol)
					if dim_world:
						base_c = base_c.darkened(0.65)
					draw_rect(rect, base_c, true)
				draw_rect(rect, Color(0.04, 0.05, 0.07, 0.35), false, 1.0)
			else:
				var gel := world.gas_el[i]
				var gm := world.gas_mass[i]
				if overlay_mode == "gas":
					var gc := _gas_overlay_color(gel, gm)
					draw_rect(rect, gc, true)
					draw_rect(rect, Color(0.08, 0.12, 0.16, 0.4), false, 1.0)
				else:
					var bg := Color(0.08, 0.10, 0.14, 1.0) if overlay_mode == "pipe" else Color(0.10, 0.13, 0.17, 1.0)
					if gel != "Vacuum" and gm > 0.01 and overlay_mode != "pipe":
						var ec: Color = OniElements.get_element_color(gel)
						var alpha := clampf(gm / 2.2, 0.04, 0.36)
						bg = bg.lerp(ec, alpha)
					draw_rect(rect, bg, true)
					draw_rect(rect, Color(0.16, 0.20, 0.25, 0.25), false, 1.0)

				var lm := world.liquid_mass[i]
				if lm > 5.0:
					var h_ratio := clampf(lm / 1000.0, 0.15, 1.0)
					var lh := ts * h_ratio
					var lrect := Rect2(x * ts, (y + 1) * ts - lh, ts, lh)
					var lalpha := 0.38 if overlay_mode == "pipe" else 0.78
					draw_rect(lrect, Color(0.16, 0.56, 0.88, lalpha), true)
					var wave := sin(_anim_time * 3.0 + float(x) * 0.9) * 1.2
					draw_line(Vector2(x * ts, lrect.position.y + wave), Vector2((x + 1) * ts, lrect.position.y - wave), Color(0.62, 0.90, 1.0, lalpha), 1.6)

	# 2) 건물 레이어 (원작 추출 타일 텍스처 + KAnim 기반 애니메이션 모션)
	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			var b := world.building[i]
			if not b.is_empty():
				_draw_building(x, y, i, b, ts)

	# 3) 전선 / 액체관 / 기체관 레이어
	_draw_conduit_layers(ts)

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

	# 5) 대원 및 생물(해치·푸프·빛벌레)
	for cr: Dictionary in world.critters:
		_draw_critter(cr, ts)
	for dupe in world.duplicants:
		_draw_duplicant(dupe, ts)

	# 6) 실시간 이펙트 파티클 (원작 FX 텍스처 + 발광 입자)
	_draw_fx_particles()

	# 7) 호버 / 선택 / 드래그 프리뷰
	if world.in_bounds(selected_cell.x, selected_cell.y):
		var srect := Rect2(selected_cell.x * ts, selected_cell.y * ts, ts, ts)
		draw_rect(srect, Color(1.0, 0.95, 0.45, 0.95), false, 2.5)

	if world.in_bounds(hover_cell.x, hover_cell.y):
		var hrect := Rect2(hover_cell.x * ts, hover_cell.y * ts, ts, ts)
		draw_rect(hrect, Color(0.75, 0.92, 1.0, 0.65), false, 1.5)

	if drag_active:
		var x0: int = mini(drag_start.x, drag_end.x)
		var x1: int = maxi(drag_start.x, drag_end.x)
		var y0: int = mini(drag_start.y, drag_end.y)
		var y1: int = maxi(drag_start.y, drag_end.y)
		var drect := Rect2(x0 * ts, y0 * ts, (x1 - x0 + 1) * ts, (y1 - y0 + 1) * ts)
		var col := Color(1.0, 0.65, 0.20, 0.25) if active_tool == "dig" else (Color(0.95, 0.30, 0.30, 0.25) if active_tool == "cancel" else Color(0.35, 0.85, 1.0, 0.25))
		draw_rect(drect, col, true)
		draw_rect(drect, Color(col.r, col.g, col.b, 0.95), false, 2.0)

func _draw_fx_particles() -> void:
	var bubble_tex := OniMedia.get_fx_texture("liquid_surface_bubble_fx_0")
	for p: Dictionary in _fx_particles:
		var pos: Vector2 = p["pos"]
		var ratio := clampf(float(p["life"]) / maxf(0.01, float(p["max_life"])), 0.0, 1.0)
		var col: Color = p["color"]
		var c := Color(col.r, col.g, col.b, col.a * ratio)
		var kind := String(p["kind"])
		if kind == "bubble" and bubble_tex != null:
			var r := 6.0 + (1.0 - ratio) * 4.0
			draw_circle(pos, r * 0.45, Color(c.r, c.g, c.b, c.a * 0.45))
			draw_arc(pos, r * 0.45, 0.0, TAU, 10, c, 1.2)
		elif kind == "burst":
			var r := 4.0 + (1.0 - ratio) * 7.0
			draw_arc(pos, r, 0.0, TAU, 12, c, 1.8)
		else:
			draw_circle(pos, 2.2 + ratio * 1.8, c)

func _draw_conduit_layers(ts: int) -> void:
	var dirs: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]
	var pipe_alpha := 1.0 if overlay_mode == "pipe" else 0.55
	var pipe_w := 5.0 if overlay_mode == "pipe" else 3.0

	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			var cx := x * ts + ts * 0.5
			var cy := y * ts + ts * 0.5

			if world.has_wire[i] == 1:
				var wc := Color(0.96, 0.58, 0.22, 0.95 if overlay_mode == "pipe" else 0.80)
				draw_circle(Vector2(cx, cy), 3.0, wc)
				for d: Vector2i in dirs:
					var nx: int = x + d.x
					var ny: int = y + d.y
					if world.in_bounds(nx, ny):
						var ni := world.idx(nx, ny)
						if world.has_wire[ni] == 1 or world.building[ni] in ["generator", "coal_gen", "hydrogen_gen", "steam_turbine", "battery", "diffuser", "electrolyzer", "liquid_pump", "gas_pump", "research_station"]:
							draw_line(Vector2(cx, cy), Vector2(cx + d.x * ts * 0.5, cy + d.y * ts * 0.5), wc, 3.0)

			if world.has_liquid_pipe[i] == 1:
				var lpc := Color(0.24, 0.64, 0.98, pipe_alpha)
				var offset := Vector2(-4, -4)
				draw_circle(Vector2(cx, cy) + offset, pipe_w * 0.65, lpc)
				for d: Vector2i in dirs:
					var nx: int = x + d.x
					var ny: int = y + d.y
					if world.in_bounds(nx, ny) and world.has_liquid_pipe[world.idx(nx, ny)] == 1:
						draw_line(Vector2(cx, cy) + offset, Vector2(cx + d.x * ts * 0.5, cy + d.y * ts * 0.5) + offset, lpc, pipe_w)
				if world.lpipe_mass[i] > 0.1:
					draw_circle(Vector2(cx, cy) + offset, 4.5, Color(0.55, 0.88, 1.0, 0.95))

			if world.has_gas_pipe[i] == 1:
				var gpc := Color(0.36, 0.90, 0.78, pipe_alpha)
				var offset := Vector2(4, 4)
				draw_circle(Vector2(cx, cy) + offset, pipe_w * 0.65, gpc)
				for d: Vector2i in dirs:
					var nx: int = x + d.x
					var ny: int = y + d.y
					if world.in_bounds(nx, ny) and world.has_gas_pipe[world.idx(nx, ny)] == 1:
						draw_line(Vector2(cx, cy) + offset, Vector2(cx + d.x * ts * 0.5, cy + d.y * ts * 0.5) + offset, gpc, pipe_w)
				if world.gpipe_mass[i] > 0.01 and world.gpipe_el[i] != "Vacuum":
					var pec: Color = OniElements.get_element_color(world.gpipe_el[i])
					draw_circle(Vector2(cx, cy) + offset, 4.5, pec)

func _draw_building(x: int, y: int, i: int, b: String, ts: int) -> void:
	var rect := Rect2(x * ts, y * ts, ts, ts)
	var p := rect.position
	var running := world.machine_running[i] == 1
	var dim := overlay_mode == "gas" or overlay_mode == "pipe"
	var mod := Color(0.52, 0.56, 0.62, 1.0) if dim else Color(1.0, 1.0, 1.0, 1.0)

	# 1) 바닥 타일류 (추출 autotile 텍스처)
	if b == "tile":
		var btex := OniMedia.get_building_texture("tile")
		if btex != null:
			draw_texture_rect(btex, rect, false, mod)
		else:
			draw_rect(rect, Color(0.56, 0.60, 0.66, 1.0), true)
		draw_rect(rect, Color(0.18, 0.22, 0.28, 0.45), false, 1.0)
		return
	elif b == "insulated_tile":
		var itex := OniMedia.get_building_texture("insulated_tile")
		if itex != null:
			draw_texture_rect(itex, rect, false, mod)
		else:
			draw_rect(rect, Color(0.72, 0.62, 0.48, 1.0), true)
		draw_rect(rect, Color(0.32, 0.24, 0.38, 0.55), false, 1.0)
		return

	# 2) 인쇄기 (2x2 멀티타일: 좌상단 (23, 15)에서만 한 번에 원작 hqbase KAnim 스프라이트 렌더링)
	if b == "pod":
		if x == 23 and y == 15:
			var pod_rect := Rect2(x * ts - 10, y * ts - 14, ts * 2 + 20, ts * 2 + 16)
			var pulse := 0.35 + 0.20 * sin(_anim_time * 2.6)
			draw_circle(Vector2((x + 1) * ts, (y + 1) * ts - 4), 22.0, Color(0.40, 0.88, 1.0, pulse * 0.45))
			var pod_tex := OniMedia.get_building_sprite("pod", int(floor(_anim_time * 2.0)) % 2 == 1)
			if pod_tex != null:
				draw_texture_rect(pod_tex, pod_rect, false, mod)
			else:
				draw_rect(Rect2(x * ts, y * ts, ts * 2, ts * 2), Color(0.24, 0.34, 0.48, 0.92), true)
		return

	# 3) KAnim 조립 스프라이트 건물 공통 렌더링
	var use_work := running and (int(floor(_anim_time * 4.5)) % 2 == 1)
	var ktex := OniMedia.get_building_sprite(b, use_work)
	if ktex != null:
		var draw_r := rect
		if b in ["rocket_steam_engine", "rocket_research_module", "rocket_command_module"]:
			var dw := float(ts) * 2.15
			var dh := float(ts) * 2.05
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5, p.y + float(ts) - dh + 2.0, dw, dh)
		elif b in ["geyser_steam", "geyser_water", "geyser_hydrogen"]:
			var dw := float(ts) * 1.65
			var dh := float(ts) * 1.65
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5, p.y + float(ts) - dh + 2.0, dw, dh)
		elif b in ["diffuser", "electrolyzer", "generator", "coal_gen", "hydrogen_gen", "steam_turbine", "research_station", "cot"]:
			# 설비는 타일 바닥에 맞춰 살짝 크고 선명하게 표시
			var scale_w := 1.45 if b in ["steam_turbine", "research_station", "cot", "generator"] else 1.28
			var scale_h := 1.38 if b in ["diffuser", "electrolyzer", "generator", "steam_turbine"] else 1.25
			var dw := float(ts) * scale_w
			var dh := float(ts) * scale_h
			var jitter := sin(_anim_time * 20.0) * 0.8 if running else 0.0
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5 + jitter, p.y + float(ts) - dh + 1.0, dw, dh)
		elif b in ["battery", "storage", "liquid_pump", "gas_pump"]:
			var dw := float(ts) * 1.12
			var dh := float(ts) * 1.18
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5, p.y + float(ts) - dh + 1.0, dw, dh)
		draw_texture_rect(ktex, draw_r, false, mod)

		# 가동 상태 표시 글로우 & 배터리 게이지 / 화분 위 끼니나무 KAnim 스프라이트
		if running and b in ["diffuser", "electrolyzer", "generator", "coal_gen", "hydrogen_gen", "steam_turbine", "liquid_pump", "gas_pump", "research_station"]:
			draw_circle(p + Vector2(ts * 0.5, 4), 3.0, Color(0.38, 0.96, 0.65, 0.9))
		if b == "battery":
			var ratio := clampf(world.battery_j[i] / OniElements.BATTERY_CAPACITY_J, 0.0, 1.0)
			var bh := (ts - 8) * ratio
			draw_rect(Rect2(p.x + ts - 6, p.y + 4, 4, ts - 8), Color(0.10, 0.14, 0.18, 0.85), true)
			draw_rect(Rect2(p.x + ts - 5, p.y + ts - 4 - bh, 2, bh), Color(0.32, 0.94, 0.46, 1.0), true)
		elif b == "farm_tile":
			var plant_tex := OniMedia.get_building_sprite("mealwood", false)
			var g := clampf(world.farm_growth[i], 0.25, 1.0)
			if plant_tex != null:
				var pw := float(ts) * (0.65 + 0.45 * g)
				var ph := float(ts) * (0.65 + 0.55 * g)
				var sway := sin(_anim_time * 2.2 + float(x)) * 1.5
				draw_texture_rect(plant_tex, Rect2(p.x + (float(ts) - pw) * 0.5 + sway, p.y - ph + 4.0, pw, ph), false, mod)
		return

	# 폴백 도형 렌더링 (스프라이트 미로드 시)
	draw_rect(rect.grow(-4), Color(0.48, 0.56, 0.66, 0.9), true)

func _draw_critter(cr: Dictionary, ts: int) -> void:
	var cid := String(cr["id"])
	var pos: Vector2 = cr["pos"]
	var dir: float = float(cr["dir"])
	var px := pos.x * float(ts) + float(ts) * 0.5
	var py := pos.y * float(ts) + float(ts) * 0.5
	if cid == "critter_lightbug":
		var glow := 0.25 + 0.12 * sin(_anim_time * 4.5)
		draw_circle(Vector2(px, py - 4), 26.0, Color(1.0, 0.94, 0.55, glow))
	var ctex := OniMedia.get_building_sprite(cid, int(floor(_anim_time * 3.5)) % 2 == 1)
	if ctex != null:
		var sz := 30.0
		var top_y := pos.y * float(ts) + float(ts) - sz + 2.0
		if dir < 0.0:
			draw_texture_rect(ctex, Rect2(px + sz * 0.5, top_y, -sz, sz), false)
		else:
			draw_texture_rect(ctex, Rect2(px - sz * 0.5, top_y, sz, sz), false)

func _draw_duplicant(dupe: OniDuplicant, ts: int) -> void:
	var moving := dupe.state == "MOVE"
	var bob := sin(_anim_time * 9.0 + float(dupe.id) * 2.1) * (1.8 if moving else 0.4)
	var px := dupe.pos.x * ts + ts * 0.5
	var py := dupe.pos.y * ts + ts * 0.5 + bob

	var dtex := OniMedia.get_duplicant_sprite(dupe.id, moving, _anim_time + float(dupe.id) * 0.3)
	if dtex != null:
		var dw := 40.0
		var dh := 44.0
		var top_y := dupe.pos.y * ts + float(ts) - dh + 2.0 + bob
		if dupe.facing_left:
			draw_texture_rect(dtex, Rect2(px + dw * 0.5, top_y, -dw, dh), false)
		else:
			draw_texture_rect(dtex, Rect2(px - dw * 0.5, top_y, dw, dh), false)
	else:
		draw_rect(Rect2(px - 6, py - 2, 12, 13), dupe.suit_color, true)
		draw_circle(Vector2(px, py - 8), 7.5, Color(0.96, 0.88, 0.78, 1.0))

	if (dupe.state == "DIG" or dupe.state == "BUILD") and world.in_bounds(dupe.target_cell.x, dupe.target_cell.y):
		var tx := dupe.target_cell.x * ts + ts * 0.5
		var ty := dupe.target_cell.y * ts + ts * 0.5
		var pulse := 0.65 + 0.35 * sin(_anim_time * 24.0)
		var beam_c := Color(1.0, 0.72, 0.25, pulse) if dupe.state == "DIG" else Color(0.35, 0.92, 1.0, pulse)
		draw_line(Vector2(px, py - 4), Vector2(tx, ty), beam_c, 2.8)
		draw_circle(Vector2(tx, ty), 4.0 * pulse, beam_c)

	if dupe.breath < 85.0:
		var bw := 18.0 * clampf(dupe.breath / 100.0, 0.0, 1.0)
		draw_rect(Rect2(px - 9, py - 27, 18, 3), Color(0.15, 0.15, 0.18, 0.9), true)
		draw_rect(Rect2(px - 9, py - 27, bw, 3), Color(0.35, 0.88, 1.0, 1.0), true)

	var font := ThemeDB.fallback_font
	if font != null:
		draw_string(font, Vector2(px - 14, py - 29), dupe.dupe_name, HORIZONTAL_ALIGNMENT_CENTER, 28, 11, Color(0.95, 0.98, 1.0, 0.94))

func _gas_overlay_color(el: String, mass: float) -> Color:
	if el == "Vacuum" or mass < 0.005:
		return Color(0.05, 0.06, 0.08, 1.0)
	var base: Color = OniElements.get_element_color(el)
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
