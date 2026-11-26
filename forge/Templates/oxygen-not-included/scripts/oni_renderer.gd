extends Node2D
class_name OniRenderer

# 원작 ONI 6-레이어 렌더링 파이프라인 1:1 복원:
#   Layer 0 (self): 바이옴 천연 배경벽 + 수중 커스틱/파동 액체
#   Layer 1 (_gas_sprite, 온도모드 시 z=3): 48x32 GPU 바이리니어 기체 볼륨 구름 (1셀 엣지 팽창 -> 벽면 번짐 0%)
#   Layer 2 (_terrain_fg_node): 4x4 월드-연속 심리스 암반 + 유기적 동굴 잉크 크러스트/AO + Klei 16상태 오토타일 바닥
#   Layer 4 (_fg_node): 접촉 그림자 + 원작 KAnim 건물/로켓/간헐천/생물/대원 + 실시간 FX 파티클
#   Layer 6 (_light_sprite): 48x32 GPU 실시간 2D 라이트맵 합성 셰이더 (oni_light_compositor.gdshader, blend_mul)
#   Layer 7 (_conduit_fg_node): 상단 발광 블룸 + 배관(P) 발광 배관·전선·패킷 + 채굴/건설/선택 UI

var world: OniWorld
var overlay_mode := "normal" # normal, gas, temp, pipe
var hover_cell := Vector2i(-1, -1)
var selected_cell := Vector2i(-1, -1)
var drag_active := false
var drag_start := Vector2i.ZERO
var drag_end := Vector2i.ZERO
var active_tool := "select"

var _anim_time := 0.0
var _gpu_accum := 0.0
var _fx_particles: Array[Dictionary] = []

var _gas_img: Image
var _gas_tex: ImageTexture
var _gas_mat: ShaderMaterial
var _gas_sprite: Sprite2D

var _light_img: Image
var _light_tex: ImageTexture
var _light_mat: ShaderMaterial
var _light_sprite: Sprite2D

var _terrain_fg_node: Node2D
var _fg_node: Node2D
var _conduit_fg_node: Node2D
var _cavity_dist: PackedByteArray = PackedByteArray()

func _ready() -> void:
	_setup_render_layers()

func _setup_render_layers() -> void:
	var ts_f := float(OniWorld.TILE_SIZE)

	# Layer 1: GPU 바이리니어 기체 볼륨 / 열화상 셰이더 (고체 암반 뒤 z=1, 온도 오버레이 시 z=3 승격)
	_gas_img = Image.create_empty(OniWorld.WIDTH, OniWorld.HEIGHT, false, Image.FORMAT_RGBA8)
	_gas_img.fill(Color(0.0, 0.0, 0.0, 0.0))
	_gas_tex = ImageTexture.create_from_image(_gas_img)
	_gas_sprite = Sprite2D.new()
	_gas_sprite.centered = false
	_gas_sprite.position = Vector2.ZERO
	_gas_sprite.scale = Vector2(ts_f, ts_f)
	_gas_sprite.texture = _gas_tex
	_gas_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_gas_sprite.texture_repeat = CanvasItem.TEXTURE_REPEAT_DISABLED
	_gas_sprite.z_index = 1
	if ResourceLoader.exists("res://shaders/oni_gas_volume.gdshader"):
		var gsh: Variant = load("res://shaders/oni_gas_volume.gdshader")
		if gsh is Shader:
			_gas_mat = ShaderMaterial.new()
			_gas_mat.shader = gsh
			_gas_sprite.material = _gas_mat
	add_child(_gas_sprite)

	# Layer 2: 고체 심리스 암반 + 동굴 잉크 크러스트·AO + Klei 16상태 오토타일 바닥 (기체 구름을 암반 경계로 완벽 마스킹)
	_terrain_fg_node = Node2D.new()
	_terrain_fg_node.z_index = 2
	_terrain_fg_node.draw.connect(_draw_terrain_foreground)
	add_child(_terrain_fg_node)

	# Layer 4: 전경 오브젝트 (건물·생물·대원·파티클)
	_fg_node = Node2D.new()
	_fg_node.z_index = 4
	_fg_node.draw.connect(_draw_foreground)
	add_child(_fg_node)

	# Layer 6: GPU 실시간 2D 라이트맵 합성 (blend_mul, Sprite2D TEXTURE 네이티브 바인딩)
	_light_img = Image.create_empty(OniWorld.WIDTH, OniWorld.HEIGHT, false, Image.FORMAT_RGBA8)
	_light_img.fill(Color(1, 1, 1, 1))
	_light_tex = ImageTexture.create_from_image(_light_img)
	_light_sprite = Sprite2D.new()
	_light_sprite.centered = false
	_light_sprite.position = Vector2.ZERO
	_light_sprite.scale = Vector2(ts_f, ts_f)
	_light_sprite.texture = _light_tex
	_light_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	_light_sprite.texture_repeat = CanvasItem.TEXTURE_REPEAT_DISABLED
	_light_sprite.z_index = 6
	if ResourceLoader.exists("res://shaders/oni_light_compositor.gdshader"):
		var lsh: Variant = load("res://shaders/oni_light_compositor.gdshader")
		if lsh is Shader:
			_light_mat = ShaderMaterial.new()
			_light_mat.shader = lsh
			_light_sprite.material = _light_mat
	add_child(_light_sprite)

	# Layer 7: 상단 발광 블룸 + 배관(P) 오버레이 + 채굴/건설/선택 UI
	_conduit_fg_node = Node2D.new()
	_conduit_fg_node.z_index = 7
	_conduit_fg_node.draw.connect(_draw_overlay_front)
	add_child(_conduit_fg_node)

func request_redraw() -> void:
	queue_redraw()
	if _terrain_fg_node != null:
		_terrain_fg_node.queue_redraw()
	if _fg_node != null:
		_fg_node.queue_redraw()
	if _conduit_fg_node != null:
		_conduit_fg_node.queue_redraw()

func tick_fx(delta: float) -> void:
	_anim_time += delta
	_gpu_accum += delta
	if _gpu_accum >= 0.08 or _cavity_dist.is_empty():
		_gpu_accum = 0.0
		_update_gpu_textures()

	if _gas_mat != null:
		_gas_mat.set_shader_parameter("time_sec", _anim_time)
		var m := 0
		if overlay_mode == "gas":
			m = 1
		elif overlay_mode == "temp":
			m = 2
		elif overlay_mode in ["pipe", "room", "germ", "logic", "decor", "power"]:
			m = 3
		_gas_mat.set_shader_parameter("mode", m)
	if _gas_sprite != null:
		# 온도 오버레이는 암반 위(z=3), 나머지 모드는 암반 뒤(z=1)에 배치해 동굴 벽면 밖 번짐을 0%로 차단
		_gas_sprite.z_index = 3 if overlay_mode == "temp" else 1

	if _light_mat != null:
		_light_mat.set_shader_parameter("overlay_bypass", 0.0 if overlay_mode == "normal" else 0.88)

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
	for dupe in world.duplicants:
		if (dupe.state == "DIG" or dupe.state == "BUILD") and world.in_bounds(dupe.target_cell.x, dupe.target_cell.y):
			if randf() < delta * 10.0:
				var tx := (float(dupe.target_cell.x) + 0.5) * ts
				var ty := (float(dupe.target_cell.y) + 0.5) * ts
				spawn_fx(
					Vector2(tx + randf_range(-6, 6), ty + randf_range(-6, 6)),
					Vector2(randf_range(-28, 28), randf_range(-38, -8)),
					0.55,
					"dust" if dupe.state == "DIG" else "spark",
					Color(1.0, 0.78, 0.32, 0.9) if dupe.state == "DIG" else Color(0.45, 0.94, 1.0, 0.9)
				)

	if randf() < delta * 6.5:
		for y in range(1, OniWorld.HEIGHT - 1):
			for x in range(1, OniWorld.WIDTH - 1):
				var i := world.idx(x, y)
				if world.machine_running[i] == 1 and world.building[i] in ["diffuser", "electrolyzer", "geyser_steam", "geyser_hydrogen"]:
					if randf() < 0.35:
						var bcol := Color(0.92, 0.58, 0.98, 0.85) if world.building[i] == "geyser_hydrogen" else (Color(0.90, 0.94, 0.98, 0.85) if world.building[i] == "geyser_steam" else Color(0.55, 0.94, 1.0, 0.85))
						spawn_fx(
							Vector2((float(x) + 0.5) * ts + randf_range(-8, 8), (float(y) + 0.2) * ts),
							Vector2(randf_range(-8, 8), randf_range(-28, -14)),
							0.95,
							"bubble",
							bcol
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

func _update_gpu_textures() -> void:
	if world == null or _gas_img == null or _light_img == null:
		return

	var w := OniWorld.WIDTH
	var h := OniWorld.HEIGHT
	var total := w * h

	# 1) 동굴(열린 공간)로부터의 암반 깊이 거리 계산 (BFS 최대 6칸 -> 자연스러운 지하 암흑 감쇠)
	_cavity_dist.resize(total)
	_cavity_dist.fill(7)
	var q: Array[Vector2i] = []
	for y in range(h):
		for x in range(w):
			var i := world.idx(x, y)
			if not world.is_solid_cell(x, y):
				_cavity_dist[i] = 0
				q.append(Vector2i(x, y))
	var head := 0
	var dirs: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]
	while head < q.size():
		var cur: Vector2i = q[head]
		head += 1
		var cd: int = _cavity_dist[world.idx(cur.x, cur.y)]
		if cd >= 6:
			continue
		for d: Vector2i in dirs:
			var nx: int = cur.x + d.x
			var ny: int = cur.y + d.y
			if not world.in_bounds(nx, ny):
				continue
			var ni := world.idx(nx, ny)
			if _cavity_dist[ni] > cd + 1:
				_cavity_dist[ni] = cd + 1
				q.append(Vector2i(nx, ny))

	# 동적 광원 수집 (인쇄기, 빛벌레, 가동 설비, 간헐천)
	var lights: Array[Dictionary] = [
		{"pos": Vector2(24.0, 16.0), "radius": 9.8, "color": Color(0.28, 0.36, 0.42)},
	]
	for cr: Dictionary in world.critters:
		if String(cr["id"]) == "critter_lightbug":
			var cp: Vector2 = cr["pos"]
			lights.append({"pos": cp + Vector2(0.5, 0.5), "radius": 6.4, "color": Color(0.46, 0.38, 0.14)})
	for y in range(1, h - 1):
		for x in range(1, w - 1):
			var i := world.idx(x, y)
			if world.liquid_mass[i] > 50.0 and world.liquid_el[i] == "Magma":
				lights.append({"pos": Vector2(x + 0.5, y + 0.5), "radius": 4.4, "color": Color(0.42, 0.16, 0.04)})
			if world.machine_running[i] == 1:
				var b := world.building[i]
				if b == "ceiling_light":
					lights.append({"pos": Vector2(x + 0.5, y + 0.8), "radius": 6.4, "color": Color(0.46, 0.42, 0.26)})
				elif b == "research_station" or b == "diffuser" or b == "electrolyzer" or b == "water_sieve":
					lights.append({"pos": Vector2(x + 0.5, y + 0.5), "radius": 4.6, "color": Color(0.18, 0.30, 0.36)})
				elif b == "coal_gen" or b == "electric_grill":
					lights.append({"pos": Vector2(x + 0.5, y + 0.5), "radius": 5.4, "color": Color(0.38, 0.20, 0.06)})
				elif b == "aetn":
					lights.append({"pos": Vector2(x + 0.5, y + 0.5), "radius": 5.8, "color": Color(0.18, 0.34, 0.44)})
				elif b == "geyser_steam" or b == "geyser_water" or b == "geyser_hydrogen":
					lights.append({"pos": Vector2(x + 0.5, y + 0.5), "radius": 5.0, "color": Color(0.26, 0.22, 0.30)})

	# 2) 기체/온도 GPU 텍스처 + 라이트맵 GPU 텍스처 픽셀 채우기
	for y in range(h):
		for x in range(w):
			var i := world.idx(x, y)
			# 기체 / 온도 데이터 픽셀 (고체 경계 1셀 엣지 팽창 -> 바이리니어 보간 시 동굴 내부 벽면 끝까지 균일하게 채움)
			if overlay_mode == "temp":
				var tc := _temp_color(world.temp_c[i])
				_gas_img.set_pixel(x, y, Color(tc.r, tc.g, tc.b, 0.85))
			else:
				if world.is_solid_cell(x, y) or world.liquid_mass[i] > 50.0:
					var sum_r := 0.0
					var sum_g := 0.0
					var sum_b := 0.0
					var sum_a := 0.0
					var cnt := 0
					for d: Vector2i in dirs:
						var nx: int = x + d.x
						var ny: int = y + d.y
						if world.in_bounds(nx, ny):
							var ni := world.idx(nx, ny)
							if not world.is_solid_cell(nx, ny) and world.liquid_mass[ni] <= 50.0 and world.gas_el[ni] != "Vacuum" and world.gas_mass[ni] >= 0.005:
								var nec := OniElements.get_element_color(world.gas_el[ni])
								sum_r += nec.r
								sum_g += nec.g
								sum_b += nec.b
								sum_a += clampf(world.gas_mass[ni] / 1.65, 0.22, 1.0)
								cnt += 1
					if cnt > 0:
						var inv := 1.0 / float(cnt)
						_gas_img.set_pixel(x, y, Color(sum_r * inv, sum_g * inv, sum_b * inv, sum_a * inv))
					else:
						_gas_img.set_pixel(x, y, Color(0.0, 0.0, 0.0, 0.0))
				else:
					var gel := world.gas_el[i]
					var gm := world.gas_mass[i]
					if gel == "Vacuum" or gm < 0.005:
						_gas_img.set_pixel(x, y, Color(0.04, 0.05, 0.08, 0.12 if overlay_mode == "gas" else 0.0))
					else:
						var ec := OniElements.get_element_color(gel)
						var dens := clampf(gm / 1.65, 0.22, 1.0)
						_gas_img.set_pixel(x, y, Color(ec.r, ec.g, ec.b, dens))

			# 라이트맵 픽셀: 동굴 깊이 기본 조도 + 야간 분위기 감쇠 + 포인트 라이트 가산
			var cd: int = _cavity_dist[i]
			var night_m := 0.84 if world.is_night() else 1.0
			var base_l := (0.86 if world.is_space_cell(x, y) else (0.80 * night_m)) if cd == 0 else clampf(0.79 - float(cd - 1) * 0.088, 0.42, 0.79)
			var lr := base_l * (0.92 if world.is_night() else 0.98)
			var lg := base_l * (0.96 if world.is_night() else 1.00)
			var lb := base_l * (1.10 if world.is_night() else 1.05)
			var cell_v := Vector2(float(x) + 0.5, float(y) + 0.5)
			for lt: Dictionary in lights:
				var lp: Vector2 = lt["pos"]
				var rad: float = float(lt["radius"])
				var dist := cell_v.distance_to(lp)
				if dist < rad:
					var att := 1.0 - (dist / rad)
					att = att * att
					var lc: Color = lt["color"]
					lr += lc.r * att
					lg += lc.g * att
					lb += lc.b * att
			_light_img.set_pixel(x, y, Color(clampf(lr, 0.0, 1.0), clampf(lg, 0.0, 1.0), clampf(lb, 0.0, 1.0), 1.0))

	_gas_tex.update(_gas_img)
	_light_tex.update(_light_img)

func _biome_backwall_element(x: int, y: int) -> String:
	if Vector2(x - 7, y - 14).length() < 6.8:
		return "Ice"
	if Vector2(x - 40, y - 26).length() < 6.2:
		return "Obsidian"
	if x >= 35 and y <= 17:
		return "SlimeMold"
	if y <= 7:
		return "IgneousRock"
	return "SandStone"

func _draw() -> void:
	if world == null:
		return

	var ts := OniWorld.TILE_SIZE
	var total_w := OniWorld.WIDTH * ts
	var total_h := OniWorld.HEIGHT * ts
	# 행성 외곽 및 상단 개방 우주 하늘(y < 0) 심우주 별빛 배경
	draw_rect(Rect2(-480.0, -520.0, float(total_w) + 960.0, 524.0), Color(0.025, 0.035, 0.085, 1.0), true)
	for si in range(95):
		var sh1 := absf(fmod(sin(float(si * 47 + 13)) * 43758.5453, 1.0))
		var sh2 := absf(fmod(sin(float(si * 83 + 29)) * 24634.6345, 1.0))
		var sx := -240.0 + sh1 * (float(total_w) + 480.0)
		var sy := -440.0 + sh2 * 436.0
		var tw := 0.42 + 0.58 * sin(_anim_time * (1.4 + float(si % 4) * 0.5) + float(si))
		var sc := Color(0.86, 0.94, 1.0, tw) if (si % 3 != 0) else Color(1.0, 0.90, 0.72, tw * 0.85)
		draw_circle(Vector2(sx, sy), 1.6 if (si % 5 == 0) else 1.0, sc)
	draw_rect(Rect2(0, 0, total_w, total_h), Color(0.05, 0.06, 0.09, 1.0), true)

	var dim_world := overlay_mode in ["gas", "pipe", "room", "germ", "logic", "decor", "power", "rad"]

	# Layer 0: 우주 표면 별빛 배경(y<=3) + 열린 동굴의 바이옴 천연 배경벽 + 다중 액체(물·오염수·원유·마그마)
	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			if not world.solid_el[i].is_empty():
				continue
			var rect := Rect2(x * ts, y * ts, ts, ts)
			if world.is_space_cell(x, y):
				# 원작 Klei/Stars 스타일 심우주 진공 배경 + 반짝이는 다중 별빛
				draw_rect(rect, Color(0.025, 0.035, 0.085, 1.0), true)
				for sk in range(3):
					var h1 := fmod(sin(float(x * 37 + y * 91 + sk * 53)) * 43758.5453, 1.0)
					var h2 := fmod(sin(float(x * 73 + y * 19 + sk * 29)) * 24634.6345, 1.0)
					var sx := rect.position.x + absf(h1) * float(ts - 4) + 2.0
					var sy := rect.position.y + absf(h2) * float(ts - 4) + 2.0
					var tw := 0.45 + 0.55 * sin(_anim_time * (1.8 + float(sk)) + float(x + y * 5 + sk * 7))
					var sr := 1.4 if sk == 0 else 0.9
					var sc := Color(0.86, 0.93, 1.0, tw) if sk != 2 else Color(1.0, 0.90, 0.72, tw * 0.85)
					draw_circle(Vector2(sx, sy), sr, sc)
				continue
			var bw_el := _biome_backwall_element(x, y)
			var bw_tex := OniMedia.get_element_texture(bw_el)
			var bw_mod := Color(0.14, 0.16, 0.20, 1.0) if dim_world else Color(0.24, 0.28, 0.34, 1.0)
			if bw_tex != null:
				_draw_seamless_tile_on(self, bw_tex, rect, x, y, bw_mod)
			else:
				draw_rect(rect, Color(0.11, 0.14, 0.18, 1.0), true)

			# 다중 액체 (Water / DirtyWater / CrudeOil / Magma) + 커스틱 리플 + 수면 파동
			var lm := world.liquid_mass[i]
			if lm > 5.0:
				var lel := world.liquid_el[i] if not world.liquid_el[i].is_empty() else "Water"
				var h_ratio := clampf(lm / 1000.0, 0.18, 1.0)
				var lh := float(ts) * h_ratio
				var top_y := float((y + 1) * ts) - lh
				var has_liq_above := world.in_bounds(x, y - 1) and world.liquid_mass[world.idx(x, y - 1)] > 200.0
				var alpha_m := 0.35 if overlay_mode == "pipe" else 0.88
				var w_col := Color(0.08, 0.36, 0.66, alpha_m) if has_liq_above else Color(0.16, 0.56, 0.86, alpha_m)
				var foam_c := Color(0.76, 0.96, 1.0, alpha_m)
				var rip_c := Color(0.62, 0.92, 1.0, alpha_m * 0.24)
				if lel == "DirtyWater":
					w_col = Color(0.32, 0.40, 0.12, alpha_m) if has_liq_above else Color(0.46, 0.58, 0.18, alpha_m)
					foam_c = Color(0.78, 0.88, 0.42, alpha_m)
					rip_c = Color(0.72, 0.84, 0.36, alpha_m * 0.24)
				elif lel == "CrudeOil":
					w_col = Color(0.09, 0.08, 0.10, 0.94) if has_liq_above else Color(0.15, 0.12, 0.15, 0.92)
					foam_c = Color(0.42, 0.34, 0.46, alpha_m)
					rip_c = Color(0.38, 0.28, 0.42, alpha_m * 0.22)
				elif lel == "Magma":
					var mp := 0.85 + 0.15 * sin(_anim_time * 3.8 + float(x))
					w_col = Color(0.95 * mp, 0.28, 0.05, 0.96) if has_liq_above else Color(1.0 * mp, 0.48, 0.08, 0.96)
					foam_c = Color(1.0, 0.88, 0.36, 0.96)
					rip_c = Color(1.0, 0.78, 0.25, 0.45)
				draw_rect(Rect2(float(x * ts), top_y, float(ts), lh), w_col, true)
				var cx_w := float(x * ts) + 5.0 + sin(_anim_time * 2.1 + float(x) * 1.7 + float(y) * 0.9) * 3.5
				var cy_w := top_y + lh * 0.55
				draw_line(Vector2(cx_w, cy_w), Vector2(cx_w + 13.0, cy_w - 2.0), rip_c, 1.8)
				if not has_liq_above:
					var w1 := sin(_anim_time * 3.2 + float(x) * 1.1) * 1.4
					var w2 := sin(_anim_time * 3.2 + float(x + 1) * 1.1) * 1.4
					draw_line(Vector2(float(x * ts), top_y + w1), Vector2(float((x + 1) * ts), top_y + w2), foam_c, 2.4)
					draw_line(Vector2(float(x * ts), top_y + 3.0 + w1 * 0.5), Vector2(float((x + 1) * ts), top_y + 3.0 + w2 * 0.5), Color(foam_c.r, foam_c.g, foam_c.b, alpha_m * 0.45), 1.6)

func _draw_terrain_foreground() -> void:
	if world == null or _terrain_fg_node == null:
		return
	var c := _terrain_fg_node
	var ts := OniWorld.TILE_SIZE
	var dim_world := overlay_mode in ["gas", "pipe", "room", "germ", "logic", "decor", "power", "rad"]

	# 1) 4x4 월드-연속 심리스 고체 암반 (기체 볼륨 Layer 1 위에서 암반 경계로 완벽 마스킹)
	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			var sol := world.solid_el[i]
			if sol.is_empty():
				continue
			var rect := Rect2(x * ts, y * ts, ts, ts)
			var tex := OniMedia.get_element_texture(sol)
			if tex != null:
				var mod := Color(0.32, 0.36, 0.42, 1.0) if dim_world else Color(1.0, 1.0, 1.0, 1.0)
				if overlay_mode == "temp":
					mod = Color(0.55, 0.58, 0.62, 1.0)
				_draw_seamless_tile_on(c, tex, rect, x, y, mod)
			else:
				var base_c: Color = OniElements.get_element_color(sol)
				if dim_world:
					base_c = base_c.darkened(0.65)
				c.draw_rect(rect, base_c, true)

	# 2) 동굴 유기적 잉크 외곽선, 모서리 챔퍼/라운드 크러스트, 상단 림 하이라이트, 접촉 그림자(AO)
	var ink_c := Color(0.05, 0.07, 0.10, 0.94)
	var seam_c := Color(0.04, 0.06, 0.09, 0.38)
	var ao_c := Color(0.02, 0.03, 0.06, 0.36)
	var rim_c := Color(1.0, 0.97, 0.90, 0.24)
	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			var sol := world.solid_el[i]
			var x0 := float(x * ts)
			var y0 := float(y * ts)
			var x1 := x0 + float(ts)
			var y1 := y0 + float(ts)
			if sol.is_empty():
				var s_up := world.in_bounds(x, y - 1) and not world.solid_el[world.idx(x, y - 1)].is_empty()
				var s_dn := world.in_bounds(x, y + 1) and not world.solid_el[world.idx(x, y + 1)].is_empty()
				var s_lf := world.in_bounds(x - 1, y) and not world.solid_el[world.idx(x - 1, y)].is_empty()
				var s_rt := world.in_bounds(x + 1, y) and not world.solid_el[world.idx(x + 1, y)].is_empty()
				var fillet := 7.0
				if s_up and s_lf:
					c.draw_colored_polygon(PackedVector2Array([Vector2(x0, y0), Vector2(x0 + fillet, y0), Vector2(x0, y0 + fillet)]), ink_c)
				if s_up and s_rt:
					c.draw_colored_polygon(PackedVector2Array([Vector2(x1, y0), Vector2(x1 - fillet, y0), Vector2(x1, y0 + fillet)]), ink_c)
				if s_dn and s_lf:
					c.draw_colored_polygon(PackedVector2Array([Vector2(x0, y1), Vector2(x0 + fillet, y1), Vector2(x0, y1 - fillet)]), ink_c)
				if s_dn and s_rt:
					c.draw_colored_polygon(PackedVector2Array([Vector2(x1, y1), Vector2(x1 - fillet, y1), Vector2(x1, y1 - fillet)]), ink_c)
				continue

			var open_up := world.in_bounds(x, y - 1) and world.solid_el[world.idx(x, y - 1)].is_empty() and world.building[world.idx(x, y - 1)] != "tile" and world.building[world.idx(x, y - 1)] != "insulated_tile"
			var open_dn := world.in_bounds(x, y + 1) and world.solid_el[world.idx(x, y + 1)].is_empty() and world.building[world.idx(x, y + 1)] != "tile" and world.building[world.idx(x, y + 1)] != "insulated_tile"
			var open_lf := world.in_bounds(x - 1, y) and world.solid_el[world.idx(x - 1, y)].is_empty() and world.building[world.idx(x - 1, y)] != "tile" and world.building[world.idx(x - 1, y)] != "insulated_tile"
			var open_rt := world.in_bounds(x + 1, y) and world.solid_el[world.idx(x + 1, y)].is_empty() and world.building[world.idx(x + 1, y)] != "tile" and world.building[world.idx(x + 1, y)] != "insulated_tile"

			if open_up:
				c.draw_line(Vector2(x0, y0 + 1.0), Vector2(x1, y0 + 1.0), ink_c, 2.6)
				c.draw_line(Vector2(x0 + 2.0, y0 + 3.2), Vector2(x1 - 2.0, y0 + 3.2), rim_c, 1.5)
				c.draw_rect(Rect2(x0, y0 - 5.0, float(ts), 5.0), ao_c, true)
			elif world.in_bounds(x, y - 1):
				var up_sol := world.solid_el[world.idx(x, y - 1)]
				if up_sol != sol and not up_sol.is_empty():
					c.draw_line(Vector2(x0, y0), Vector2(x1, y0), seam_c, 1.2)
			if open_dn:
				c.draw_line(Vector2(x0, y1 - 1.0), Vector2(x1, y1 - 1.0), ink_c, 2.8)
				c.draw_rect(Rect2(x0, y1, float(ts), 8.0), Color(0.02, 0.03, 0.06, 0.46), true)
			if open_lf:
				c.draw_line(Vector2(x0 + 1.0, y0), Vector2(x0 + 1.0, y1), ink_c, 2.6)
				c.draw_rect(Rect2(x0 - 5.0, y0, 5.0, float(ts)), ao_c, true)
			elif world.in_bounds(x - 1, y):
				var lf_sol := world.solid_el[world.idx(x - 1, y)]
				if lf_sol != sol and not lf_sol.is_empty():
					c.draw_line(Vector2(x0, y0), Vector2(x0, y1), seam_c, 1.2)
			if open_rt:
				c.draw_line(Vector2(x1 - 1.0, y0), Vector2(x1 - 1.0, y1), ink_c, 2.6)
				c.draw_rect(Rect2(x1, y0, 5.0, float(ts)), ao_c, true)

			var c_bevel := 5.0
			if open_up and open_lf:
				c.draw_colored_polygon(PackedVector2Array([Vector2(x0, y0), Vector2(x0 + c_bevel, y0), Vector2(x0, y0 + c_bevel)]), ink_c)
			if open_up and open_rt:
				c.draw_colored_polygon(PackedVector2Array([Vector2(x1, y0), Vector2(x1 - c_bevel, y0), Vector2(x1, y0 + c_bevel)]), ink_c)
			if open_dn and open_lf:
				c.draw_colored_polygon(PackedVector2Array([Vector2(x0, y1), Vector2(x0 + c_bevel, y1), Vector2(x0, y1 - c_bevel)]), ink_c)
			if open_dn and open_rt:
				c.draw_colored_polygon(PackedVector2Array([Vector2(x1, y1), Vector2(x1 - c_bevel, y1), Vector2(x1, y1 - c_bevel)]), ink_c)

	# 3) Klei 16상태 비트마스크 오토타일 (Down=1, Right=2, Left=4, Up=8 -> col=mask%4, row=mask/4)
	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			var b := world.building[i]
			if b != "tile" and b != "insulated_tile" and b != "bunker_tile" and b != "metal_tile" and b != "glass_tile":
				continue
			var rect := Rect2(x * ts, y * ts, ts, ts)
			var mod := Color(0.46, 0.50, 0.56, 1.0) if dim_world else Color(1.0, 1.0, 1.0, 1.0)
			var btex := OniMedia.get_building_texture(b)
			if btex != null and btex.get_width() >= 128 and btex.get_height() >= 128:
				var dn_same := world.in_bounds(x, y + 1) and world.building[world.idx(x, y + 1)] == b
				var rt_same := world.in_bounds(x + 1, y) and world.building[world.idx(x + 1, y)] == b
				var lf_same := world.in_bounds(x - 1, y) and world.building[world.idx(x - 1, y)] == b
				var up_same := world.in_bounds(x, y - 1) and world.building[world.idx(x, y - 1)] == b
				var mask := (1 if dn_same else 0) | (2 if rt_same else 0) | (4 if lf_same else 0) | (8 if up_same else 0)
				var cell_w := float(btex.get_width()) / 4.0
				var cell_h := float(btex.get_height()) / 4.0
				var col_i: int = mask & 3
				var row_i: int = mask >> 2
				var src := Rect2(float(col_i) * cell_w, float(row_i) * cell_h, cell_w, cell_h)
				# Klei BlockTileRenderer 208/140 오버행 비율에 맞춰 인접 타일이 빈틈없이 하나로 융합
				var dst := rect.grow(float(ts) * 0.235)
				c.draw_texture_rect_region(btex, dst, src, mod)
			elif btex != null:
				c.draw_texture_rect(btex, rect, false, mod)
			else:
				c.draw_rect(rect, Color(0.56, 0.60, 0.66, 1.0) if b == "tile" else Color(0.72, 0.62, 0.48, 1.0), true)

func _draw_seamless_tile_on(c: Node2D, tex: Texture2D, rect: Rect2, gx: int, gy: int, mod: Color) -> void:
	var tw := tex.get_width()
	var th := tex.get_height()
	if tw >= 128 and th >= 128:
		var sub_w := float(tw) / 4.0
		var sub_h := float(th) / 4.0
		var src := Rect2(float(gx % 4) * sub_w, float(gy % 4) * sub_h, sub_w, sub_h)
		c.draw_texture_rect_region(tex, rect, src, mod)
	else:
		c.draw_texture_rect(tex, rect, false, mod)

func _draw_foreground() -> void:
	if world == null or _fg_node == null:
		return
	var ts := OniWorld.TILE_SIZE

	# 기본 모드에서는 배경 전선/배관을 건물 뒤에 아주 은은하게 표시 (시야 방해 제거)
	if overlay_mode != "pipe":
		_draw_conduit_layers_on(_fg_node, ts, false)

	# 건물 (접촉 그림자 + 원작 KAnim 스프라이트)
	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			var b := world.building[i]
			if not b.is_empty() and b != "tile" and b != "insulated_tile" and b != "bunker_tile" and b != "metal_tile" and b != "glass_tile":
				_draw_building_on(_fg_node, x, y, i, b, ts)

	# 컨베이어 광물 패킷 & 우주 낙하 운석우
	_draw_conveyor_packets_on(_fg_node, ts)
	_draw_meteors_on(_fg_node, ts)

	# 생물(해치·푸프·빛벌레·가스 무 등 8종) & 대원
	for cr: Dictionary in world.critters:
		_draw_critter_on(_fg_node, cr, ts)
	for dupe in world.duplicants:
		_draw_duplicant_on(_fg_node, dupe, ts)

	# 실시간 FX 파티클
	_draw_fx_particles_on(_fg_node)

func _draw_overlay_front() -> void:
	if world == null or _conduit_fg_node == null:
		return
	var ts := OniWorld.TILE_SIZE

	# 기본 모드: 라이트맵 위에서 인쇄기·빛벌레·천장조명 발광 블룸(Bloom)을 은은하게 가산 표현
	if overlay_mode == "normal":
		var pod_pulse := 0.80 + 0.20 * sin(_anim_time * 2.4)
		var pod_center := Vector2(24.0 * float(ts), 15.8 * float(ts))
		_conduit_fg_node.draw_circle(pod_center, 82.0, Color(0.36, 0.84, 1.0, 0.055 * pod_pulse))
		_conduit_fg_node.draw_circle(pod_center, 44.0, Color(0.58, 0.94, 1.0, 0.095 * pod_pulse))
		for cr: Dictionary in world.critters:
			if String(cr["id"]) == "critter_lightbug":
				var cp: Vector2 = cr["pos"]
				var lx := cp.x * float(ts) + float(ts) * 0.5
				var ly := cp.y * float(ts) + float(ts) * 0.5 - 4.0
				var lglow := 0.78 + 0.22 * sin(_anim_time * 4.5)
				_conduit_fg_node.draw_circle(Vector2(lx, ly), 54.0, Color(1.0, 0.92, 0.45, 0.08 * lglow))
				_conduit_fg_node.draw_circle(Vector2(lx, ly), 24.0, Color(1.0, 0.97, 0.68, 0.14 * lglow))
		for y in range(1, OniWorld.HEIGHT - 1):
			for x in range(1, OniWorld.WIDTH - 1):
				var i := world.idx(x, y)
				if world.building[i] == "ceiling_light" and world.machine_running[i] == 1:
					var lcx := (float(x) + 0.5) * float(ts)
					var lcy := (float(y) + 0.4) * float(ts)
					_conduit_fg_node.draw_colored_polygon(
						PackedVector2Array([Vector2(lcx - 10, lcy), Vector2(lcx + 10, lcy), Vector2(lcx + 48, lcy + 88), Vector2(lcx - 48, lcy + 88)]),
						Color(1.0, 0.96, 0.68, 0.075)
					)
					_conduit_fg_node.draw_circle(Vector2(lcx, lcy + 4), 16.0, Color(1.0, 0.97, 0.72, 0.16))

	# 방(M) 오버레이: 구획된 원작 방(막사/식당/화장실/연구실/발전실) 색상 채움 + 중앙 배지
	if overlay_mode == "room":
		for y in range(1, OniWorld.HEIGHT - 1):
			for x in range(1, OniWorld.WIDTH - 1):
				var rid: int = world.room_id[world.idx(x, y)]
				if rid >= 0 and rid < world.rooms_list.size():
					var rc: Color = world.rooms_list[rid]["color"]
					var rrect := Rect2(x * ts, y * ts, ts, ts)
					_conduit_fg_node.draw_rect(rrect, Color(rc.r, rc.g, rc.b, 0.34), true)
					_conduit_fg_node.draw_rect(rrect, Color(rc.r, rc.g, rc.b, 0.65), false, 1.0)
		var rfont := ThemeDB.fallback_font
		if rfont != null:
			for rm: Dictionary in world.rooms_list:
				var cpos: Vector2 = rm["center"]
				var bx := cpos.x * float(ts)
				var by := cpos.y * float(ts)
				var mor: int = int(rm["morale"])
				var lbl := "%s (%d칸%s)" % [String(rm["name_ko"]), int(rm["size"]), (" · 사기+%d" % mor) if mor > 0 else ""]
				var bw := maxf(108.0, float(lbl.length()) * 8.5 + 16.0)
				var bcol: Color = rm["color"]
				_conduit_fg_node.draw_rect(Rect2(bx - bw * 0.5, by - 11.0, bw, 22.0), Color(0.05, 0.08, 0.13, 0.88), true)
				_conduit_fg_node.draw_rect(Rect2(bx - bw * 0.5, by - 11.0, bw, 22.0), Color(bcol.r, bcol.g, bcol.b, 0.95), false, 1.5)
				_conduit_fg_node.draw_string(rfont, Vector2(bx - bw * 0.5 + 6.0, by + 4.0), lbl, HORIZONTAL_ALIGNMENT_CENTER, int(bw - 12.0), 11, Color(0.98, 0.99, 1.0, 1.0))

	# 세균(J) 오버레이: 식중독균(라임녹색) · 점액폐균(청록황색) 부유 포자 + 밀도 글로우
	if overlay_mode == "germ":
		for y in range(1, OniWorld.HEIGHT - 1):
			for x in range(1, OniWorld.WIDTH - 1):
				var i := world.idx(x, y)
				var gc := world.germ_count[i]
				if gc < 20.0:
					continue
				var gt := world.germ_type[i]
				var dens := clampf(gc / 90000.0, 0.20, 0.95)
				var gcol := Color(0.76, 0.96, 0.22, dens) if gt == "SlimeLung" else Color(0.28, 0.94, 0.42, dens)
				var rect := Rect2(x * ts, y * ts, ts, ts)
				_conduit_fg_node.draw_rect(rect, Color(gcol.r, gcol.g, gcol.b, dens * 0.36), true)
				for k in range(3):
					var ang := _anim_time * (1.8 + float(k) * 0.5) + float(x * 7 + y * 13 + k * 5)
					var gx := rect.position.x + 16.0 + cos(ang) * (6.0 + float(k) * 2.5)
					var gy := rect.position.y + 16.0 + sin(ang * 1.2) * (6.0 + float(k) * 2.0)
					_conduit_fg_node.draw_circle(Vector2(gx, gy), 2.5 + dens * 1.5, Color(gcol.r, gcol.g, gcol.b, 0.85))
					_conduit_fg_node.draw_arc(Vector2(gx, gy), 4.0 + dens * 2.0, 0.0, TAU, 8, Color(gcol.r, gcol.g, gcol.b, 0.55), 1.0)

	# 배관(P) 오버레이: 라이트맵 위에서 선명하게 전선·액체관·기체관·패킷 표시
	if overlay_mode == "pipe":
		_draw_conduit_layers_on(_conduit_fg_node, ts, true)

	# 전력망(E) 오버레이: 황금 발광 전력선 + 발전기(초록)/소비기(하늘)/배터리 노드 + 실시간 부하(W) 배지
	if overlay_mode == "power":
		var pdirs: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]
		for y in range(1, OniWorld.HEIGHT - 1):
			for x in range(1, OniWorld.WIDTH - 1):
				var i := world.idx(x, y)
				var b := world.building[i]
				var is_pw := world.has_wire[i] == 1
				var is_gen := b in ["generator", "coal_gen", "hydrogen_gen", "steam_turbine", "solar_panel", "petrol_gen"]
				var is_con := b in ["diffuser", "electrolyzer", "co2_skimmer", "water_sieve", "ceiling_light", "microbe_musher", "electric_grill", "thermo_aquatuner", "metal_refinery", "oil_refinery", "rock_crusher", "liquid_pump", "gas_pump", "research_station", "telescope", "auto_sweeper", "sweep_station", "incubator", "space_scanner", "bunker_door", "massage_table", "jukebot", "arcade_cabinet", "gas_filter", "liquid_filter", "suit_maker", "suit_dock"]
				var is_bat := b == "battery" or b == "smart_battery"
				if not is_pw and not is_gen and not is_con and not is_bat:
					continue
				var cx := float(x * ts) + float(ts) * 0.5
				var cy := float(y * ts) + float(ts) * 0.5
				var wc := Color(1.0, 0.84, 0.22, 0.96)
				if is_pw:
					_conduit_fg_node.draw_circle(Vector2(cx, cy), 3.6, wc)
					for d: Vector2i in pdirs:
						var nx: int = x + d.x
						var ny: int = y + d.y
						if world.in_bounds(nx, ny):
							var ni := world.idx(nx, ny)
							if world.has_wire[ni] == 1 or world.building[ni] in ["generator", "coal_gen", "hydrogen_gen", "steam_turbine", "solar_panel", "battery", "smart_battery", "diffuser", "electrolyzer", "co2_skimmer", "water_sieve", "ceiling_light", "microbe_musher", "electric_grill", "thermo_aquatuner", "metal_refinery", "oil_refinery", "liquid_pump", "gas_pump", "research_station", "telescope", "auto_sweeper"]:
								_conduit_fg_node.draw_line(Vector2(cx, cy), Vector2(cx + float(d.x) * float(ts) * 0.5, cy + float(d.y) * float(ts) * 0.5), wc, 4.2)
				if is_gen or is_con or is_bat:
					var nc := Color(0.28, 0.96, 0.48, 0.96) if is_gen else (Color(0.36, 0.86, 1.0, 0.96) if is_con else Color(1.0, 0.92, 0.34, 0.96))
					_conduit_fg_node.draw_circle(Vector2(cx, cy), 7.0, Color(0.05, 0.08, 0.12, 0.92))
					_conduit_fg_node.draw_circle(Vector2(cx, cy), 4.6, nc)
					_conduit_fg_node.draw_arc(Vector2(cx, cy), 7.0, 0.0, TAU, 14, nc, 1.4)
		var pfont := ThemeDB.fallback_font
		if pfont != null:
			var plbl := "전력망 부하: %.0f / 1000 W (발전 %.0fW · 축전 %.1fkJ)" % [world.power_consumed_w, world.power_produced_w, world.total_battery_j / 1000.0]
			var bx := 24.0 * float(ts)
			var by := 13.4 * float(ts)
			_conduit_fg_node.draw_rect(Rect2(bx - 150.0, by - 12.0, 300.0, 24.0), Color(0.06, 0.09, 0.14, 0.92), true)
			_conduit_fg_node.draw_rect(Rect2(bx - 150.0, by - 12.0, 300.0, 24.0), Color(1.0, 0.84, 0.22, 0.92), false, 1.5)
			_conduit_fg_node.draw_string(pfont, Vector2(bx - 144.0, by + 4.0), plbl, HORIZONTAL_ALIGNMENT_CENTER, 288, 11, Color(1.0, 0.96, 0.78, 1.0))

	# 자동화(L) 오버레이: ONI 네온 초록(활성)/크림슨 빨강(대기) 논리 회로 리본 + 원형 I/O 포트
	if overlay_mode == "logic":
		var ldirs: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]
		for y in range(1, OniWorld.HEIGHT - 1):
			for x in range(1, OniWorld.WIDTH - 1):
				var i := world.idx(x, y)
				var is_lw := world.has_logic_wire[i] == 1
				var b := world.building[i]
				var is_lb := b in ["smart_battery", "atmo_sensor", "thermo_sensor", "mech_door", "space_scanner", "bunker_door", "logic_switch", "logic_and", "logic_or", "logic_not", "logic_buffer", "logic_alarm"]
				if not is_lw and not is_lb:
					continue
				var sig := world.logic_signal[i] == 1
				var lc := Color(0.22, 0.98, 0.44, 0.96) if sig else Color(0.98, 0.24, 0.30, 0.96)
				var cx := float(x * ts) + float(ts) * 0.5
				var cy := float(y * ts) + float(ts) * 0.5
				if is_lw:
					_conduit_fg_node.draw_circle(Vector2(cx, cy), 4.0, lc)
					for d: Vector2i in ldirs:
						var nx: int = x + d.x
						var ny: int = y + d.y
						if world.in_bounds(nx, ny):
							var ni := world.idx(nx, ny)
							if world.has_logic_wire[ni] == 1 or world.building[ni] in ["smart_battery", "atmo_sensor", "thermo_sensor", "mech_door", "generator", "coal_gen", "hydrogen_gen", "diffuser", "electrolyzer", "co2_skimmer", "thermo_aquatuner"]:
								_conduit_fg_node.draw_line(Vector2(cx, cy), Vector2(cx + float(d.x) * float(ts) * 0.5, cy + float(d.y) * float(ts) * 0.5), lc, 4.2)
				if is_lb:
					_conduit_fg_node.draw_circle(Vector2(cx, cy), 7.5, Color(0.05, 0.08, 0.12, 0.92))
					_conduit_fg_node.draw_circle(Vector2(cx, cy), 5.0, lc)
					_conduit_fg_node.draw_arc(Vector2(cx, cy), 7.5, 0.0, TAU, 14, Color(0.95, 0.98, 1.0, 0.9), 1.5)

	# 장식(K) 오버레이: ONI 에메랄드 녹색(고장식) ↔ 크림슨 적색(저해 장식) 히트맵
	if overlay_mode == "decor":
		for y in range(1, OniWorld.HEIGHT - 1):
			for x in range(1, OniWorld.WIDTH - 1):
				if world.is_solid_cell(x, y):
					continue
				var dv := world.decor_val[world.idx(x, y)]
				if absf(dv) < 1.5:
					continue
				var rect := Rect2(x * ts, y * ts, ts, ts)
				if dv > 0.0:
					var k := clampf(dv / 55.0, 0.16, 0.72)
					_conduit_fg_node.draw_rect(rect, Color(0.20, 0.92, 0.52, k * 0.68), true)
				else:
					var k := clampf(-dv / 40.0, 0.16, 0.72)
					_conduit_fg_node.draw_rect(rect, Color(0.96, 0.24, 0.28, k * 0.68), true)

	# 방사선(X) 오버레이: 우주 태양 방사선 + 씨근풀·가상 플라네타륨 방사장 네온 그린/라임 히트맵
	if overlay_mode == "rad":
		for y in range(0, OniWorld.HEIGHT - 1):
			for x in range(1, OniWorld.WIDTH - 1):
				var rv := world.rads[world.idx(x, y)]
				if rv < 6.0:
					continue
				var k := clampf(rv / 250.0, 0.14, 0.95)
				var rcol := Color(0.32 + k * 0.50, 0.98, 0.22 + (1.0 - k) * 0.45, k * 0.56)
				var rect := Rect2(x * ts, y * ts, ts, ts)
				_conduit_fg_node.draw_rect(rect, rcol, true)
				if rv > 80.0 and ((x + y) % 2 == 0):
					var pulse := 0.55 + 0.45 * sin(_anim_time * 4.2 + float(x + y))
					_conduit_fg_node.draw_circle(rect.get_center(), 3.2 * pulse, Color(0.75, 1.0, 0.35, 0.65 * k))
		for y in range(1, OniWorld.HEIGHT - 1):
			for x in range(1, OniWorld.WIDTH - 1):
				var b := world.building[world.idx(x, y)]
				if b == "wheezewort" or b == "planetarium":
					var wc := Vector2((float(x) + 0.5) * float(ts), (float(y) + 0.5) * float(ts))
					var rad_r := 18.0 + fmod(_anim_time * 36.0, 62.0)
					var a := clampf(1.0 - rad_r / 82.0, 0.0, 0.75)
					_conduit_fg_node.draw_arc(wc, rad_r, 0.0, TAU, 24, Color(0.55, 1.0, 0.36, a), 2.0)
		var rfont2 := ThemeDB.fallback_font
		if rfont2 != null:
			var bx := 24.0 * float(ts)
			var by := 12.6 * float(ts)
			_conduit_fg_node.draw_rect(Rect2(bx - 160.0, by - 12.0, 320.0, 24.0), Color(0.04, 0.10, 0.08, 0.92), true)
			_conduit_fg_node.draw_rect(Rect2(bx - 160.0, by - 12.0, 320.0, 24.0), Color(0.45, 1.0, 0.35, 0.92), false, 1.5)
			_conduit_fg_node.draw_string(rfont2, Vector2(bx - 154.0, by + 4.0), "방사선(X): 우주 260rad(벙커 차폐) · 씨근풀 185rad · 플라네타륨 110rad", HORIZONTAL_ALIGNMENT_CENTER, 308, 10, Color(0.84, 1.0, 0.72, 1.0))

	# 채굴 / 건설 지시 오버레이
	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			var rect := Rect2(x * ts, y * ts, ts, ts)
			if world.dig_order[i] == 1:
				_conduit_fg_node.draw_rect(rect.grow(-2), Color(0.98, 0.62, 0.20, 0.25), true)
				_conduit_fg_node.draw_rect(rect.grow(-2), Color(1.0, 0.70, 0.24, 0.95), false, 2.0)
				_conduit_fg_node.draw_line(rect.position + Vector2(6, 6), rect.end - Vector2(6, 6), Color(1.0, 0.75, 0.30, 0.85), 2.0)
				_conduit_fg_node.draw_line(Vector2(rect.end.x - 6, rect.position.y + 6), Vector2(rect.position.x + 6, rect.end.y - 6), Color(1.0, 0.75, 0.30, 0.85), 2.0)
				if world.dig_progress[i] > 0.01:
					_conduit_fg_node.draw_rect(Rect2(rect.position.x + 3, rect.end.y - 6, (ts - 6) * clampf(world.dig_progress[i], 0.0, 1.0), 4), Color(1.0, 0.85, 0.25, 1.0), true)

			var bo := world.build_order[i]
			if not bo.is_empty():
				var bc: Color = OniElements.get_building(bo).get("color", Color(0.4, 0.8, 1.0))
				_conduit_fg_node.draw_rect(rect.grow(-2), Color(bc.r, bc.g, bc.b, 0.28), true)
				_conduit_fg_node.draw_rect(rect.grow(-2), Color(0.45, 0.88, 1.0, 0.95), false, 2.0)
				if world.build_progress[i] > 0.01:
					_conduit_fg_node.draw_rect(Rect2(rect.position.x + 3, rect.end.y - 6, (ts - 6) * clampf(world.build_progress[i], 0.0, 1.0), 4), Color(0.35, 0.95, 0.55, 1.0), true)

	# 호버 / 선택 / 드래그 프리뷰
	if world.in_bounds(selected_cell.x, selected_cell.y):
		var srect := Rect2(selected_cell.x * ts, selected_cell.y * ts, ts, ts)
		_conduit_fg_node.draw_rect(srect, Color(1.0, 0.95, 0.45, 0.95), false, 2.5)

	if world.in_bounds(hover_cell.x, hover_cell.y):
		var hrect := Rect2(hover_cell.x * ts, hover_cell.y * ts, ts, ts)
		_conduit_fg_node.draw_rect(hrect, Color(0.75, 0.92, 1.0, 0.65), false, 1.5)

	if drag_active:
		var x0: int = mini(drag_start.x, drag_end.x)
		var x1: int = maxi(drag_start.x, drag_end.x)
		var y0: int = mini(drag_start.y, drag_end.y)
		var y1: int = maxi(drag_start.y, drag_end.y)
		var drect := Rect2(x0 * ts, y0 * ts, (x1 - x0 + 1) * ts, (y1 - y0 + 1) * ts)
		var col := Color(1.0, 0.65, 0.20, 0.25) if active_tool == "dig" else (Color(0.95, 0.30, 0.30, 0.25) if active_tool == "cancel" else Color(0.35, 0.85, 1.0, 0.25))
		_conduit_fg_node.draw_rect(drect, col, true)
		_conduit_fg_node.draw_rect(drect, Color(col.r, col.g, col.b, 0.95), false, 2.0)

func _draw_conduit_layers_on(c: Node2D, ts: int, bright: bool) -> void:
	var dirs: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]
	var wire_a := 0.95 if bright else 0.30
	var pipe_a := 1.0 if bright else 0.26
	var pipe_w := 5.0 if bright else 2.2

	for y in range(OniWorld.HEIGHT):
		for x in range(OniWorld.WIDTH):
			var i := world.idx(x, y)
			var cx := x * ts + ts * 0.5
			var cy := y * ts + ts * 0.5

			if world.has_wire[i] == 1:
				var wc := Color(0.96, 0.58, 0.22, wire_a)
				var wy := cy + (0.0 if bright else 10.0)
				c.draw_circle(Vector2(cx, wy), 2.5 if bright else 1.6, wc)
				for d: Vector2i in dirs:
					var nx: int = x + d.x
					var ny: int = y + d.y
					if world.in_bounds(nx, ny):
						var ni := world.idx(nx, ny)
						if world.has_wire[ni] == 1 or world.building[ni] in ["generator", "coal_gen", "hydrogen_gen", "steam_turbine", "battery", "diffuser", "electrolyzer", "liquid_pump", "gas_pump", "research_station"]:
							c.draw_line(Vector2(cx, wy), Vector2(cx + d.x * ts * 0.5, wy + d.y * ts * 0.5), wc, 3.0 if bright else 1.8)

			if world.has_liquid_pipe[i] == 1:
				var lpc := Color(0.24, 0.64, 0.98, pipe_a)
				var offset := Vector2(-4, -4)
				c.draw_circle(Vector2(cx, cy) + offset, pipe_w * 0.6, lpc)
				for d: Vector2i in dirs:
					var nx: int = x + d.x
					var ny: int = y + d.y
					if world.in_bounds(nx, ny) and world.has_liquid_pipe[world.idx(nx, ny)] == 1:
						c.draw_line(Vector2(cx, cy) + offset, Vector2(cx + d.x * ts * 0.5, cy + d.y * ts * 0.5) + offset, lpc, pipe_w)
				if bright and world.lpipe_mass[i] > 0.1:
					c.draw_circle(Vector2(cx, cy) + offset, 4.5, Color(0.55, 0.88, 1.0, 0.95))

			if world.has_gas_pipe[i] == 1:
				var gpc := Color(0.36, 0.90, 0.78, pipe_a)
				var offset := Vector2(4, 4)
				c.draw_circle(Vector2(cx, cy) + offset, pipe_w * 0.6, gpc)
				for d: Vector2i in dirs:
					var nx: int = x + d.x
					var ny: int = y + d.y
					if world.in_bounds(nx, ny) and world.has_gas_pipe[world.idx(nx, ny)] == 1:
						c.draw_line(Vector2(cx, cy) + offset, Vector2(cx + d.x * ts * 0.5, cy + d.y * ts * 0.5) + offset, gpc, pipe_w)
				if bright and world.gpipe_mass[i] > 0.01 and world.gpipe_el[i] != "Vacuum":
					var pec: Color = OniElements.get_element_color(world.gpipe_el[i])
					c.draw_circle(Vector2(cx, cy) + offset, 4.5, pec)

func _draw_building_on(c: Node2D, x: int, y: int, i: int, b: String, ts: int) -> void:
	var rect := Rect2(x * ts, y * ts, ts, ts)
	var p := rect.position
	var running := world.machine_running[i] == 1
	var dim := overlay_mode in ["gas", "pipe", "room", "germ", "logic", "decor", "power", "rad"]
	var mod := Color(0.55, 0.58, 0.65, 1.0) if dim else Color(1.0, 1.0, 1.0, 1.0)

	# 인쇄기 (2x2 멀티타일 + 다층 방사형 발광 후광)
	if b == "pod":
		if x == 23 and y == 15:
			var pod_rect := Rect2(x * ts - 12, y * ts - 16, ts * 2 + 24, ts * 2 + 18)
			var pulse := 0.75 + 0.25 * sin(_anim_time * 2.4)
			var center := Vector2((x + 1) * ts, (y + 1) * ts - 8)
			if not dim:
				c.draw_circle(center, 66.0, Color(0.32, 0.78, 1.0, 0.07 * pulse))
				c.draw_circle(center, 40.0, Color(0.45, 0.88, 1.0, 0.14 * pulse))
				c.draw_circle(center, 22.0, Color(0.70, 0.96, 1.0, 0.24 * pulse))
			# 발밑 접지 그림자
			c.draw_rect(Rect2(x * ts - 4, (y + 2) * ts - 4, ts * 2 + 8, 5), Color(0.02, 0.03, 0.05, 0.45), true)
			var pod_tex := OniMedia.get_building_sprite("pod", int(floor(_anim_time * 2.0)) % 2 == 1)
			if pod_tex != null:
				c.draw_texture_rect(pod_tex, pod_rect, false, mod)
		return

	# 수송 튜브(travel_tube): 반투명 청록 공압 튜브 벽면 + 상승 공압 펄스 링
	if b == "travel_tube":
		var tube_r := Rect2(p.x + 6.0, p.y, float(ts) - 12.0, float(ts))
		c.draw_rect(tube_r, Color(0.26, 0.78, 0.96, 0.28), true)
		c.draw_line(Vector2(tube_r.position.x, p.y), Vector2(tube_r.position.x, p.y + float(ts)), Color(0.56, 0.94, 1.0, 0.85), 2.2)
		c.draw_line(Vector2(tube_r.end.x, p.y), Vector2(tube_r.end.x, p.y + float(ts)), Color(0.56, 0.94, 1.0, 0.85), 2.2)
		var ring_y := p.y + float(ts) - fmod(_anim_time * 42.0 + float(y) * 9.0, float(ts))
		c.draw_line(Vector2(tube_r.position.x + 2.0, ring_y), Vector2(tube_r.end.x - 2.0, ring_y), Color(0.72, 0.98, 1.0, 0.68), 1.8)
		return

	var use_work := running and (int(floor(_anim_time * 4.5)) % 2 == 1)
	var ktex := OniMedia.get_building_sprite(b, use_work)
	if ktex != null:
		var draw_r := rect
		if b in ["rocket_steam_engine", "rocket_petroleum_engine", "rocket_fuel_tank", "rocket_oxidizer_tank", "rocket_research_module", "rocket_command_module", "rocket_cargo_bay"]:
			if world.rocket_state == "IN_SPACE":
				return
			var dw := float(ts) * 2.15
			var dh := float(ts) * 1.45 if b in ["rocket_steam_engine", "rocket_petroleum_engine"] else (float(ts) * 1.35 if b in ["rocket_research_module", "rocket_cargo_bay", "rocket_fuel_tank", "rocket_oxidizer_tank"] else float(ts) * 1.65)
			var lift := world.rocket_y_offset
			var shake := sin(_anim_time * 50.0) * 1.8 if world.rocket_state in ["LAUNCHING", "LANDING"] else 0.0
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5 + shake, p.y + float(ts) - dh + 2.0 + lift, dw, dh)
			if b in ["rocket_steam_engine", "rocket_petroleum_engine"] and world.rocket_state in ["LAUNCHING", "LANDING"]:
				var fx_c := Vector2(draw_r.position.x + dw * 0.5, draw_r.end.y)
				var fl := 32.0 + 18.0 * sin(_anim_time * 36.0)
				c.draw_colored_polygon(PackedVector2Array([fx_c + Vector2(-18, 0), fx_c + Vector2(18, 0), fx_c + Vector2(0, fl + 24)]), Color(1.0, 0.45, 0.08, 0.82))
				c.draw_colored_polygon(PackedVector2Array([fx_c + Vector2(-11, 0), fx_c + Vector2(11, 0), fx_c + Vector2(0, fl + 8)]), Color(1.0, 0.88, 0.28, 0.92))
				c.draw_circle(fx_c + Vector2(0, fl * 0.5), 14.0, Color(0.92, 0.95, 1.0, 0.42))
		elif b in ["aetn"]:
			var dw := float(ts) * 2.1
			var dh := float(ts) * 2.1
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5, p.y + float(ts) - dh + 2.0, dw, dh)
		elif b in ["geyser_steam", "geyser_water", "geyser_hydrogen"]:
			var dw := float(ts) * 1.7
			var dh := float(ts) * 1.7
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5, p.y + float(ts) - dh + 2.0, dw, dh)
		elif b in ["diffuser", "electrolyzer", "co2_skimmer", "water_sieve", "generator", "coal_gen", "hydrogen_gen", "steam_turbine", "solar_panel", "petrol_gen", "research_station", "super_computer", "planetarium", "cot", "outhouse", "microbe_musher", "electric_grill", "liquid_reservoir", "gas_reservoir", "thermo_aquatuner", "metal_refinery", "oil_refinery", "rock_crusher", "kiln", "poi_vending", "poi_desk", "telescope", "ranch_station", "incubator", "oxygen_dock", "suit_dock", "suit_checkpoint", "jetsuit_dock", "jetsuit_checkpoint", "travel_tube_entrance", "sweep_station", "space_scanner", "medical_cot", "apothecary", "massage_table", "shower", "jukebot", "arcade_cabinet", "sauna", "hottub", "beach_chair", "wheezewort", "suit_maker"]:
			var scale_w := 1.56 if b in ["planetarium", "super_computer", "sauna", "hottub", "beach_chair"] else (1.48 if b in ["steam_turbine", "solar_panel", "petrol_gen", "research_station", "cot", "generator", "water_sieve", "liquid_reservoir", "gas_reservoir", "thermo_aquatuner", "metal_refinery", "oil_refinery", "rock_crusher", "kiln", "poi_desk", "telescope", "ranch_station", "space_scanner", "medical_cot", "massage_table", "suit_maker"] else (1.15 if b in ["suit_dock", "suit_checkpoint", "jetsuit_dock", "jetsuit_checkpoint", "wheezewort"] else 1.30))
			var scale_h := 1.54 if b in ["planetarium", "super_computer", "travel_tube_entrance", "sauna", "beach_chair"] else (1.42 if b in ["diffuser", "electrolyzer", "generator", "steam_turbine", "petrol_gen", "outhouse", "water_sieve", "poi_vending", "oil_refinery", "rock_crusher", "telescope", "incubator", "oxygen_dock", "suit_dock", "suit_checkpoint", "jetsuit_dock", "jetsuit_checkpoint", "space_scanner", "apothecary", "shower", "wheezewort", "suit_maker"] else 1.26)
			var dw := float(ts) * scale_w
			var dh := float(ts) * scale_h
			var jitter := sin(_anim_time * 20.0) * 0.7 if running else 0.0
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5 + jitter, p.y + float(ts) - dh + 1.0, dw, dh)
		elif b == "door" or b == "mech_door" or b == "bunker_door":
			var dw := float(ts) * (1.45 if b == "bunker_door" else 0.95)
			var dh := float(ts) * (0.95 if b == "bunker_door" else 1.32)
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5, p.y + float(ts) - dh + 1.0, dw, dh)
		elif b == "fire_pole":
			draw_r = Rect2(p.x + 2.0, p.y, float(ts) - 4.0, float(ts))
		elif b == "auto_sweeper":
			var dw := float(ts) * 1.25
			var dh := float(ts) * 1.05
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5, p.y + (float(ts) - dh) * 0.5, dw, dh)
		elif b == "ceiling_light":
			var dw := float(ts) * 0.92
			var dh := float(ts) * 0.92
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5, p.y - 2.0, dw, dh)
		elif b == "decor_painting":
			var dw := float(ts) * 1.08
			var dh := float(ts) * 1.08
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5, p.y + (float(ts) - dh) * 0.5, dw, dh)
		elif b in ["atmo_sensor", "thermo_sensor", "logic_switch", "logic_and", "logic_or", "logic_not", "logic_buffer", "logic_alarm", "gas_filter", "liquid_filter", "conveyor_chute"]:
			var dw := float(ts) * (0.86 if b in ["atmo_sensor", "thermo_sensor", "logic_switch", "logic_and", "logic_or", "logic_not", "logic_buffer", "logic_alarm"] else 1.08)
			var dh := float(ts) * (0.86 if b in ["atmo_sensor", "thermo_sensor", "logic_switch", "logic_and", "logic_or", "logic_not", "logic_buffer", "logic_alarm"] else 1.08)
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5, p.y + (float(ts) - dh) * 0.5, dw, dh)
		elif b in ["battery", "smart_battery", "storage", "liquid_pump", "gas_pump", "wash_basin", "wash_sink", "water_cooler", "flush_toilet", "mess_table", "ration_box", "flower_pot", "sculpture", "conveyor_loader"]:
			var dw := float(ts) * 1.15
			var dh := float(ts) * 1.18
			draw_r = Rect2(p.x + (float(ts) - dw) * 0.5, p.y + float(ts) - dh + 1.0, dw, dh)

		# 접지 그림자
		if b != "ladder" and b != "fire_pole" and b != "liquid_vent" and b != "gas_vent" and b != "ceiling_light" and b != "decor_painting" and b != "atmo_sensor" and b != "thermo_sensor" and b != "auto_sweeper" and not b.begins_with("rocket_"):
			c.draw_rect(Rect2(draw_r.position.x + 4.0, p.y + float(ts) - 3.0, draw_r.size.x - 8.0, 4.0), Color(0.02, 0.03, 0.05, 0.42), true)
		c.draw_texture_rect(ktex, draw_r, false, mod)

		# 우주 스캐너 레이더 스캔 콘 & 벙커 문 자동 장갑 셔터
		if b == "space_scanner":
			var sc := Vector2(p.x + float(ts) * 0.5, p.y - 4.0)
			var ang := -PI * 0.5 + sin(_anim_time * (4.5 if world.meteor_shower_active else 1.4)) * 0.55
			var ray := Vector2(cos(ang), sin(ang)) * 78.0
			var ray_l := Vector2(cos(ang - 0.18), sin(ang - 0.18)) * 78.0
			var ray_r := Vector2(cos(ang + 0.18), sin(ang + 0.18)) * 78.0
			var rcol := Color(1.0, 0.34, 0.24, 0.24) if world.meteor_shower_active else Color(0.28, 0.94, 0.88, 0.16)
			c.draw_colored_polygon(PackedVector2Array([sc, sc + ray_l, sc + ray, sc + ray_r]), rcol)
			c.draw_circle(sc, 3.2, Color(1.0, 0.28, 0.22, 0.95) if world.meteor_shower_active else Color(0.28, 0.96, 0.65, 0.90))
		elif b == "bunker_door" and world.bunker_closed:
			var shield_r := Rect2(p.x - float(ts) * 0.55, p.y - 3.0, float(ts) * 2.1, 8.0)
			c.draw_rect(shield_r, Color(0.32, 0.38, 0.46, 0.95), true)
			c.draw_rect(shield_r, Color(1.0, 0.72, 0.22, 0.95), false, 1.5)
			c.draw_circle(Vector2(p.x + float(ts) * 0.5, p.y + 1.0), 3.0, Color(1.0, 0.76, 0.22, 1.0))
		elif b == "jukebot" and not dim:
			var jp := 0.65 + 0.35 * sin(_anim_time * 5.2)
			c.draw_circle(p + Vector2(float(ts) * 0.5, float(ts) * 0.4), 20.0, Color(0.76, 0.38, 1.0, 0.10 * jp))
		elif b == "logic_switch":
			var sw_on := bool(world.logic_switch_state.get(i, true))
			c.draw_circle(p + Vector2(float(ts) * 0.5, 6.0), 3.2, Color(0.22, 0.98, 0.44, 1.0) if sw_on else Color(0.98, 0.24, 0.30, 1.0))
		elif b == "logic_alarm" and world.meteor_shower_active:
			var ap := 0.5 + 0.5 * sin(_anim_time * 12.0)
			c.draw_circle(p + Vector2(float(ts) * 0.5, 6.0), 10.0, Color(1.0, 0.22, 0.18, 0.35 * ap))
			c.draw_circle(p + Vector2(float(ts) * 0.5, 6.0), 3.5, Color(1.0, 0.35, 0.25, 0.98))

		if running and b in ["diffuser", "electrolyzer", "co2_skimmer", "water_sieve", "generator", "coal_gen", "hydrogen_gen", "steam_turbine", "solar_panel", "liquid_pump", "gas_pump", "research_station", "microbe_musher", "electric_grill", "thermo_aquatuner", "metal_refinery", "oil_refinery", "aetn"]:
			c.draw_circle(p + Vector2(ts * 0.5, 4), 2.8, Color(0.38, 0.96, 0.65, 0.92))
		if b == "battery" or b == "smart_battery":
			var ratio := clampf(world.battery_j[i] / OniElements.BATTERY_CAPACITY_J, 0.0, 1.0)
			var bh := (ts - 8) * ratio
			c.draw_rect(Rect2(p.x + ts - 6, p.y + 4, 4, ts - 8), Color(0.10, 0.14, 0.18, 0.85), true)
			c.draw_rect(Rect2(p.x + ts - 5, p.y + ts - 4 - bh, 2, bh), Color(0.32, 0.94, 0.46, 1.0), true)
			if b == "smart_battery":
				var led := Color(0.22, 0.98, 0.44, 1.0) if world.logic_signal[i] == 1 else Color(0.98, 0.24, 0.30, 1.0)
				c.draw_circle(p + Vector2(6, 6), 3.0, led)
		elif b == "farm_tile" or b == "hydroponic_tile" or b == "planter_box":
			var crop_key := "mealwood" if b == "farm_tile" else ("bristle_blossom" if (x % 2 == 1) else "sleet_wheat")
			var plant_tex := OniMedia.get_building_sprite(crop_key, false)
			var g := clampf(world.farm_growth[i], 0.35, 1.0)
			if plant_tex != null:
				var pw := float(ts) * (0.72 + 0.45 * g)
				var ph := float(ts) * (0.72 + 0.55 * g)
				var sway := sin(_anim_time * 2.2 + float(x)) * 1.5
				c.draw_texture_rect(plant_tex, Rect2(p.x + (float(ts) - pw) * 0.5 + sway, p.y - ph + 4.0, pw, ph), false, mod)
		elif b == "wheezewort" and not dim:
			var cp := 0.5 + 0.5 * sin(_anim_time * 3.0 + float(x))
			c.draw_circle(p + Vector2(float(ts) * 0.5, float(ts) * 0.35), 22.0, Color(0.38, 0.90, 1.0, 0.12 * cp))
		elif b == "planetarium" and not dim:
			var pp := 0.65 + 0.35 * sin(_anim_time * 2.6)
			c.draw_circle(p + Vector2(float(ts) * 0.5, float(ts) * 0.3), 26.0, Color(0.72, 0.42, 1.0, 0.14 * pp))

func _draw_critter_on(c: Node2D, cr: Dictionary, ts: int) -> void:
	var cid := String(cr["id"])
	var pos: Vector2 = cr["pos"]
	var dir: float = float(cr["dir"])
	var px := pos.x * float(ts) + float(ts) * 0.5
	var py := pos.y * float(ts) + float(ts) * 0.5
	if cid == "critter_lightbug":
		var glow := 0.78 + 0.22 * sin(_anim_time * 4.5)
		c.draw_circle(Vector2(px, py - 4), 42.0, Color(1.0, 0.92, 0.48, 0.10 * glow))
		c.draw_circle(Vector2(px, py - 4), 20.0, Color(1.0, 0.96, 0.65, 0.22 * glow))
	else:
		c.draw_rect(Rect2(px - 10, pos.y * float(ts) + float(ts) - 3, 20, 4), Color(0.02, 0.03, 0.05, 0.36), true)
	var ctex := OniMedia.get_building_sprite(cid, int(floor(_anim_time * 3.5)) % 2 == 1)
	if ctex != null:
		var sz := 32.0
		var top_y := pos.y * float(ts) + float(ts) - sz + 2.0
		if dir < 0.0:
			c.draw_texture_rect(ctex, Rect2(px + sz * 0.5, top_y, -sz, sz), false)
		else:
			c.draw_texture_rect(ctex, Rect2(px - sz * 0.5, top_y, sz, sz), false)

func _draw_duplicant_on(c: Node2D, dupe: OniDuplicant, ts: int) -> void:
	var moving := dupe.state == "MOVE"
	var bob := sin(_anim_time * 9.0 + float(dupe.id) * 2.1) * (1.8 if moving else 0.4)
	var px := dupe.pos.x * ts + ts * 0.5
	var py := dupe.pos.y * ts + ts * 0.5 + bob

	# 접지 그림자
	c.draw_rect(Rect2(px - 11, dupe.pos.y * ts + float(ts) - 3, 22, 4), Color(0.02, 0.03, 0.05, 0.48), true)

	var dtex := OniMedia.get_duplicant_sprite(dupe.id, moving, _anim_time + float(dupe.id) * 0.3, dupe.wearing_suit, dupe.wearing_jetsuit)
	if dtex != null:
		var dw := 42.0
		var dh := 46.0
		var top_y := dupe.pos.y * ts + float(ts) - dh + 2.0 + bob
		if dupe.wearing_jetsuit:
			# 제트복(Jet Suit) 듀얼 추진 화염 이펙트
			var fl := 7.0 + 4.0 * sin(_anim_time * 28.0 + float(dupe.id))
			var jx := px + (7.0 if dupe.facing_left else -7.0)
			var jy := top_y + 30.0
			c.draw_colored_polygon(PackedVector2Array([Vector2(jx - 3.5, jy), Vector2(jx + 3.5, jy), Vector2(jx, jy + fl + 5.0)]), Color(1.0, 0.52, 0.12, 0.85))
			c.draw_colored_polygon(PackedVector2Array([Vector2(jx - 2.0, jy), Vector2(jx + 2.0, jy), Vector2(jx, jy + fl)]), Color(0.55, 0.94, 1.0, 0.92))
		if dupe.facing_left:
			c.draw_texture_rect(dtex, Rect2(px + dw * 0.5, top_y, -dw, dh), false)
		else:
			c.draw_texture_rect(dtex, Rect2(px - dw * 0.5, top_y, dw, dh), false)
		if dupe.wearing_jetsuit:
			# 제트복 주황·금색 가압 헬멧 바이저
			var hc := Vector2(px, top_y + 14.5)
			c.draw_circle(hc, 12.0, Color(1.0, 0.68, 0.22, 0.22))
			c.draw_arc(hc, 12.0, 0.0, TAU, 20, Color(1.0, 0.78, 0.32, 0.92), 1.7)
			c.draw_arc(hc, 9.2, -2.5, -1.1, 10, Color(1.0, 1.0, 1.0, 0.78), 1.5)
		elif dupe.wearing_suit:
			# 원작 환경 특수복(Atmo Suit) 투명 가압 유리 헬멧 돔 + 청록 하이라이트 림
			var hc := Vector2(px, top_y + 14.5)
			c.draw_circle(hc, 11.8, Color(0.36, 0.86, 1.0, 0.18))
			c.draw_arc(hc, 11.8, 0.0, TAU, 20, Color(0.56, 0.94, 1.0, 0.85), 1.6)
			c.draw_arc(hc, 9.2, -2.5, -1.1, 10, Color(1.0, 1.0, 1.0, 0.72), 1.5)

	if (dupe.state == "DIG" or dupe.state == "BUILD") and world.in_bounds(dupe.target_cell.x, dupe.target_cell.y):
		var tx := dupe.target_cell.x * ts + ts * 0.5
		var ty := dupe.target_cell.y * ts + ts * 0.5
		var pulse := 0.65 + 0.35 * sin(_anim_time * 24.0)
		var beam_c := Color(1.0, 0.72, 0.25, pulse) if dupe.state == "DIG" else Color(0.35, 0.92, 1.0, pulse)
		c.draw_line(Vector2(px, py - 4), Vector2(tx, ty), beam_c, 3.0)
		c.draw_circle(Vector2(tx, ty), 5.0 * pulse, beam_c)

	if dupe.breath < 85.0:
		var bw := 20.0 * clampf(dupe.breath / 100.0, 0.0, 1.0)
		c.draw_rect(Rect2(px - 10, py - 30, 20, 3), Color(0.12, 0.14, 0.18, 0.9), true)
		c.draw_rect(Rect2(px - 10, py - 30, bw, 3), Color(0.35, 0.88, 1.0, 1.0), true)

	# 깔끔한 다크 필 배경 + 대원 이름표 (대원 머리 바로 위 밀착)
	var font := ThemeDB.fallback_font
	if font != null:
		var pill := Rect2(px - 17, py - 38, 34, 13)
		c.draw_rect(pill, Color(0.05, 0.08, 0.12, 0.78), true)
		c.draw_rect(pill, Color(0.38, 0.56, 0.72, 0.58), false, 1.0)
		c.draw_string(font, Vector2(px - 15, py - 28), dupe.dupe_name, HORIZONTAL_ALIGNMENT_CENTER, 30, 10, Color(0.96, 0.98, 1.0, 0.96))
		if not dupe.disease.is_empty():
			var dpill := Rect2(px - 22, py - 52, 44, 12)
			c.draw_rect(dpill, Color(0.28, 0.45, 0.08, 0.92), true)
			c.draw_string(font, Vector2(px - 20, py - 43), dupe.get_disease_ko(), HORIZONTAL_ALIGNMENT_CENTER, 40, 9, Color(0.92, 1.0, 0.55, 1.0))
		elif dupe.stress >= 30.0:
			var spill := Rect2(px - 22, py - 52, 44, 12)
			c.draw_rect(spill, Color(0.55, 0.14, 0.18, 0.92), true)
			c.draw_string(font, Vector2(px - 20, py - 43), "스트%.0f%%" % dupe.stress, HORIZONTAL_ALIGNMENT_CENTER, 40, 9, Color(1.0, 0.88, 0.88, 1.0))
		elif dupe.state == "HEAL":
			c.draw_circle(Vector2(px, py - 44), 4.0, Color(0.35, 0.98, 0.62, 0.92))

func _draw_meteors_on(c: Node2D, ts: int) -> void:
	if world.meteors.is_empty():
		return
	for m: Dictionary in world.meteors:
		var pos: Vector2 = m["pos"]
		var vel: Vector2 = m["vel"]
		var kind := String(m.get("kind", "meteor_rock"))
		var mp := Vector2(pos.x * float(ts), pos.y * float(ts))
		var back := -vel.normalized()
		var perp := Vector2(-back.y, back.x)
		# 원작 스타일 테이퍼 화염 꼬리 (외곽 오렌지 -> 중심 백열)
		c.draw_colored_polygon(PackedVector2Array([mp + perp * 10.0, mp - perp * 10.0, mp + back * 86.0]), Color(1.0, 0.36, 0.06, 0.48))
		c.draw_colored_polygon(PackedVector2Array([mp + perp * 5.5, mp - perp * 5.5, mp + back * 56.0]), Color(1.0, 0.76, 0.22, 0.80))
		c.draw_colored_polygon(PackedVector2Array([mp + perp * 2.5, mp - perp * 2.5, mp + back * 28.0]), Color(1.0, 0.96, 0.82, 0.95))
		c.draw_circle(mp, 16.0, Color(1.0, 0.52, 0.14, 0.28))
		var mtex := OniMedia.get_building_sprite(kind, int(floor(_anim_time * 8.0)) % 2 == 1)
		if mtex != null:
			var msz := 38.0
			c.draw_texture_rect(mtex, Rect2(mp.x - msz * 0.5, mp.y - msz * 0.5, msz, msz), false)
		else:
			c.draw_circle(mp, 9.0, Color(1.0, 0.65, 0.22, 1.0))

func _draw_conveyor_packets_on(c: Node2D, ts: int) -> void:
	for p: Dictionary in world.conveyor_packets:
		var pos: Vector2 = p["pos"]
		var px := (pos.x + 0.5) * float(ts)
		var py := (pos.y + 0.5) * float(ts)
		c.draw_rect(Rect2(px - 6.0, py - 6.0, 12.0, 12.0), Color(0.22, 0.24, 0.28, 0.92), true)
		c.draw_rect(Rect2(px - 6.0, py - 6.0, 12.0, 12.0), Color(0.95, 0.72, 0.30, 0.95), false, 1.5)
		c.draw_circle(Vector2(px, py), 3.0, Color(0.92, 0.78, 0.36, 1.0))

func _draw_fx_particles_on(c: Node2D) -> void:
	for p: Dictionary in _fx_particles:
		var pos: Vector2 = p["pos"]
		var ratio := clampf(float(p["life"]) / maxf(0.01, float(p["max_life"])), 0.0, 1.0)
		var col: Color = p["color"]
		var pc := Color(col.r, col.g, col.b, col.a * ratio)
		var kind := String(p["kind"])
		if kind == "bubble":
			var r := 2.5 + (1.0 - ratio) * 2.5
			c.draw_circle(pos, r, Color(pc.r, pc.g, pc.b, pc.a * 0.40))
			c.draw_arc(pos, r, 0.0, TAU, 10, pc, 1.2)
		elif kind == "burst":
			var r := 4.0 + (1.0 - ratio) * 8.0
			c.draw_arc(pos, r, 0.0, TAU, 12, pc, 1.8)
		else:
			c.draw_circle(pos, 2.2 + ratio * 1.8, pc)

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
