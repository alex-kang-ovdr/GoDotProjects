extends RefCounted
class_name OniWorld

const WIDTH := 48
const HEIGHT := 32
const TILE_SIZE := 32

var seed_value := 73
var world_preset := "terra" # terra, rime, oceana, badlands
var sim_time := 0.0
var cycle := 1
var gas_tick_count := 0
var conduit_tick_count := 0
var _gas_accum := 0.0
var _conduit_accum := 0.0
var _heat_accum := 0.0
var _liquid_accum := 0.0
var _germ_accum := 0.0
var _room_accum := 0.0

var solid_el: PackedStringArray = PackedStringArray()
var solid_mass: PackedFloat32Array = PackedFloat32Array()
var gas_el: PackedStringArray = PackedStringArray()
var gas_mass: PackedFloat32Array = PackedFloat32Array()
var gas_prev_mass: PackedFloat32Array = PackedFloat32Array()
var liquid_el: PackedStringArray = PackedStringArray()
var liquid_mass: PackedFloat32Array = PackedFloat32Array()
var temp_c: PackedFloat32Array = PackedFloat32Array()
var germ_type: PackedStringArray = PackedStringArray()
var germ_count: PackedFloat32Array = PackedFloat32Array()
var room_id: PackedInt32Array = PackedInt32Array()
var rooms_list: Array[Dictionary] = []
var colony_morale_bonus := 0

var building: PackedStringArray = PackedStringArray()
var has_wire: PackedByteArray = PackedByteArray()
var has_liquid_pipe: PackedByteArray = PackedByteArray()
var has_gas_pipe: PackedByteArray = PackedByteArray()

var lpipe_mass: PackedFloat32Array = PackedFloat32Array()
var lpipe_temp: PackedFloat32Array = PackedFloat32Array()
var gpipe_el: PackedStringArray = PackedStringArray()
var gpipe_mass: PackedFloat32Array = PackedFloat32Array()
var gpipe_temp: PackedFloat32Array = PackedFloat32Array()

var battery_j: PackedFloat32Array = PackedFloat32Array()
var h2_buffer_kg: PackedFloat32Array = PackedFloat32Array()
var farm_growth: PackedFloat32Array = PackedFloat32Array()
var gen_active: PackedByteArray = PackedByteArray()
var research_active: PackedByteArray = PackedByteArray()
var machine_running: PackedByteArray = PackedByteArray()

var dig_order: PackedByteArray = PackedByteArray()
var dig_progress: PackedFloat32Array = PackedFloat32Array()
var build_order: PackedStringArray = PackedStringArray()
var build_progress: PackedFloat32Array = PackedFloat32Array()

var inventory: Dictionary = {}
var food_kcal := 6000.0

# 연구 상태
var unlocked_techs: Dictionary = {}
var tech_progress: Dictionary = {}
var active_tech := "FarmingTech"
var sandbox_unlock_all := false

var power_produced_w := 0.0
var power_consumed_w := 0.0
var total_battery_j := 0.0
var total_battery_cap_j := 0.0
var avg_oxygen_kg := 0.0

var pod_origin := Vector2i(23, 15)
var duplicants: Array = []
var critters: Array[Dictionary] = []

var on_dig_completed: Callable
var on_build_completed: Callable

func _init(p_seed := 73) -> void:
	seed_value = p_seed
	generate(seed_value)

func idx(x: int, y: int) -> int:
	return y * WIDTH + x

func in_bounds(x: int, y: int) -> bool:
	return x >= 0 and x < WIDTH and y >= 0 and y < HEIGHT

func _hash2(ix: int, iy: int, s: int) -> float:
	var h := sin(float(ix) * 127.1 + float(iy) * 311.7 + float(s) * 74.7) * 43758.5453123
	return h - floor(h)

func _geo_noise(x: float, y: float, scale: float, s: int) -> float:
	var gx := x / scale
	var gy := y / scale
	var ix := int(floor(gx))
	var iy := int(floor(gy))
	var fx := gx - float(ix)
	var fy := gy - float(iy)
	fx = fx * fx * (3.0 - 2.0 * fx)
	fy = fy * fy * (3.0 - 2.0 * fy)
	var a := _hash2(ix, iy, s)
	var b := _hash2(ix + 1, iy, s)
	var c := _hash2(ix, iy + 1, s)
	var d := _hash2(ix + 1, iy + 1, s)
	return lerpf(lerpf(a, b, fx), lerpf(c, d, fx), fy)

func get_world_preset_label() -> String:
	match world_preset:
		"rime":
			return "라임(빙하)"
		"oceana":
			return "오세아나"
		"badlands":
			return "황무지"
		_:
			return "테라"

func generate(p_seed := 73, p_preset := "") -> void:
	OniElements.ensure_loaded()
	seed_value = p_seed
	if not p_preset.is_empty():
		world_preset = p_preset
	var rng := RandomNumberGenerator.new()
	rng.seed = p_seed

	var total := WIDTH * HEIGHT
	solid_el.resize(total)
	solid_mass.resize(total)
	gas_el.resize(total)
	gas_mass.resize(total)
	gas_prev_mass.resize(total)
	liquid_el.resize(total)
	liquid_mass.resize(total)
	temp_c.resize(total)
	germ_type.resize(total)
	germ_count.resize(total)
	room_id.resize(total)
	room_id.fill(-1)
	rooms_list.clear()
	colony_morale_bonus = 0
	building.resize(total)
	has_wire.resize(total)
	has_liquid_pipe.resize(total)
	has_gas_pipe.resize(total)
	lpipe_mass.resize(total)
	lpipe_temp.resize(total)
	gpipe_el.resize(total)
	gpipe_mass.resize(total)
	gpipe_temp.resize(total)
	battery_j.resize(total)
	h2_buffer_kg.resize(total)
	farm_growth.resize(total)
	gen_active.resize(total)
	research_active.resize(total)
	machine_running.resize(total)
	dig_order.resize(total)
	dig_progress.resize(total)
	build_order.resize(total)
	build_progress.resize(total)

	sim_time = 0.0
	cycle = 1
	gas_tick_count = 0
	conduit_tick_count = 0
	_gas_accum = 0.0
	_conduit_accum = 0.0
	_heat_accum = 0.0
	_liquid_accum = 0.0
	_germ_accum = 0.0
	_room_accum = 0.0
	food_kcal = 6000.0

	unlocked_techs.clear()
	tech_progress.clear()
	for tid_v in OniElements.techs.keys():
		var tid := String(tid_v)
		tech_progress[tid] = 0.0
	active_tech = "FarmingTech" if OniElements.techs.has("FarmingTech") else ""

	inventory = {
		"SandStone": 1200.0,
		"Cuprite": 1000.0,
		"Algae": 500.0,
		"Dirt": 800.0,
		"Carbon": 400.0,
		"IgneousRock": 0.0,
		"Ice": 0.0,
		"SlimeMold": 0.0,
		"GoldAmalgam": 0.0,
		"IronOre": 0.0,
		"Wolframite": 0.0,
	}

	for y in range(HEIGHT):
		for x in range(WIDTH):
			var i := idx(x, y)
			building[i] = ""
			has_wire[i] = 0
			has_liquid_pipe[i] = 0
			has_gas_pipe[i] = 0
			lpipe_mass[i] = 0.0
			lpipe_temp[i] = 22.0
			gpipe_el[i] = "Vacuum"
			gpipe_mass[i] = 0.0
			gpipe_temp[i] = 22.0
			battery_j[i] = 0.0
			h2_buffer_kg[i] = 0.0
			farm_growth[i] = 0.0
			gen_active[i] = 0
			research_active[i] = 0
			machine_running[i] = 0
			dig_order[i] = 0
			dig_progress[i] = 0.0
			build_order[i] = ""
			build_progress[i] = 0.0
			liquid_el[i] = ""
			liquid_mass[i] = 0.0
			gas_el[i] = "Vacuum"
			gas_mass[i] = 0.0
			gas_prev_mass[i] = 0.0
			germ_type[i] = ""
			germ_count[i] = 0.0
			room_id[i] = -1

			if x == 0 or x == WIDTH - 1 or y == 0 or y == HEIGHT - 1:
				_set_solid(i, "Unobtanium" if OniElements.elements.has("Unobtanium") else "Granite", 21.0)
				continue

			# 원작 스타일 유기적 지질 노이즈 (점 단위 체커보드 제거 -> 실제 광맥·지층 형성)
			var n_biome := _geo_noise(float(x), float(y), 6.5, p_seed + 11)
			var n_vein_a := _geo_noise(float(x), float(y), 3.4, p_seed + 37)
			var n_vein_b := _geo_noise(float(x), float(y), 2.9, p_seed + 79)
			var n_vein_c := _geo_noise(float(x), float(y), 3.8, p_seed + 131)

			# 서쪽: 원작 Frozen 바이옴 (Ice, Snow, Wolframite, Granite)
			var dist_ice := Vector2(float(x) - 7.0, float(y) - 14.0).length() + (n_biome - 0.5) * 3.2
			if dist_ice < 6.8:
				var fel := "Ice"
				if n_vein_a > 0.66:
					fel = "Snow"
				elif n_vein_b > 0.72:
					fel = "Wolframite"
				elif n_vein_c < 0.28:
					fel = "Granite"
				_set_solid(i, fel, -14.0 + (n_vein_a - 0.5) * 6.0)
				continue

			# 남동쪽: 원작 Magma 심부 + Katairite 단열 경계
			var dist_hot := Vector2(float(x) - 40.0, float(y) - 26.0).length() + (n_biome - 0.5) * 1.8
			if dist_hot < 4.2:
				_set_solid(i, "Obsidian" if n_vein_a > 0.52 else "IgneousRock", 132.0 + n_vein_b * 12.0)
				continue
			elif dist_hot < 5.6:
				_set_solid(i, "Katairite", 24.0)
				continue

			# 동쪽 상단: 원작 HotMarsh(늪) 바이옴 (SlimeMold, Clay, GoldAmalgam, SedimentaryRock)
			if float(x) + (n_biome - 0.5) * 4.5 >= 35.5 and float(y) + (n_biome - 0.5) * 3.5 <= 17.5:
				var mel := "SlimeMold"
				if n_vein_a > 0.62:
					mel = "Clay"
				elif n_vein_b > 0.68:
					mel = "GoldAmalgam"
				elif n_vein_c < 0.30:
					mel = "SedimentaryRock"
				_set_solid(i, mel, 32.0 + (n_vein_a - 0.5) * 4.0)
				continue

			# 북쪽: 원작 Jungle(부식) 바이옴 (IgneousRock, IronOre, BleachStone, Carbon)
			if float(y) + (n_biome - 0.5) * 3.2 <= 6.8:
				var jel := "IgneousRock"
				if n_vein_a > 0.64:
					jel = "IronOre"
				elif n_vein_b > 0.76:
					jel = "BleachStone"
				elif n_vein_c < 0.26:
					jel = "Carbon"
				_set_solid(i, jel, 35.0 + (n_vein_a - 0.5) * 5.0)
				continue

			# 중앙: 행성 프리셋별 기저 암반 + 유기적 광맥
			var base_temp := 21.5
			var el := "SandStone"
			if world_preset == "rime":
				base_temp = -8.0
				el = "Ice" if n_vein_a > 0.56 else ("Granite" if n_vein_b > 0.62 else "SandStone")
				if n_vein_c > 0.72:
					el = "Wolframite"
				elif n_vein_b < 0.24:
					el = "Algae"
				elif n_vein_a < 0.26:
					el = "Dirt"
			elif world_preset == "oceana":
				base_temp = 23.0
				el = "SedimentaryRock" if n_vein_a > 0.54 else "SandStone"
				if n_vein_b > 0.66:
					el = "Sand"
				elif n_vein_c > 0.70:
					el = "Algae"
				elif n_vein_a < 0.28:
					el = "Cuprite"
			elif world_preset == "badlands":
				base_temp = 29.0
				el = "Granite" if n_vein_a > 0.48 else "IgneousRock"
				if n_vein_b > 0.66:
					el = "IronOre"
				elif n_vein_c > 0.70:
					el = "Obsidian"
				elif n_vein_a < 0.24:
					el = "Carbon"
				elif n_vein_b < 0.22:
					el = "Algae"
			else:
				if n_vein_a > 0.65:
					el = "Dirt"
				elif n_vein_b > 0.70:
					el = "Algae"
				elif n_vein_c > 0.71:
					el = "Cuprite"
				elif y > 18 and n_vein_a < 0.25:
					el = "Carbon"
				elif y > 22 and n_vein_c < 0.26:
					el = "IgneousRock"
				elif n_vein_b < 0.16 and Vector2(float(x) - 24.0, float(y) - 15.0).length() < 9.5:
					el = "OxyRock"
			_set_solid(i, el, base_temp + (n_vein_a - 0.5) * 2.5)

	# 중앙 시작 공실: 원작 sandstoneBase.yaml 추출 셀 스탬프 적용
	var sb_data: Dictionary = OniElements.worldgen.get("sandstone_base", {})
	var sb_cells: Array = sb_data.get("cells", [])
	var cx_base := 23
	var cy_base := 16
	if not sb_cells.is_empty():
		for cell_v in sb_cells:
			var c: Dictionary = cell_v
			var wx: int = cx_base + int(c.get("x", 0))
			var wy: int = cy_base - int(c.get("y", 0)) # Unity Y-up -> Godot Y-down
			if not in_bounds(wx, wy):
				continue
			var ci := idx(wx, wy)
			var cel := String(c.get("element", "Oxygen"))
			var cmass := float(c.get("mass", 1.0))
			var ctemp := float(c.get("temp_c", 22.0))
			var cstate := String(OniElements.get_element(cel).get("state", "solid"))
			temp_c[ci] = ctemp
			if cstate == "gas":
				solid_el[ci] = ""
				solid_mass[ci] = 0.0
				gas_el[ci] = cel
				gas_mass[ci] = clampf(cmass, 0.5, 2.0)
				gas_prev_mass[ci] = gas_mass[ci]
			elif cstate == "liquid":
				solid_el[ci] = ""
				solid_mass[ci] = 0.0
				liquid_el[ci] = cel
				liquid_mass[ci] = clampf(cmass, 100.0, 1000.0)
			else:
				solid_el[ci] = cel
				solid_mass[ci] = maxf(100.0, cmass)
				gas_el[ci] = "Vacuum"
				gas_mass[ci] = 0.0

	# 인쇄기 주변 최소 활동 공간 보장 + 바닥 타일 (y = 17, x: 20..27)
	for y in range(14, 17):
		for x in range(20, 28):
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			if gas_el[i] == "Vacuum":
				gas_el[i] = "Oxygen"
				gas_mass[i] = 1.25
				gas_prev_mass[i] = 1.25
	for x in range(20, 28):
		var i := idx(x, 17)
		solid_el[i] = ""
		solid_mass[i] = 0.0
		building[i] = "tile"
		temp_c[i] = 22.0

	# 인쇄기 (Printing Pod) 2x2
	building[idx(23, 16)] = "pod"
	building[idx(24, 16)] = "pod"
	building[idx(23, 15)] = "pod"
	building[idx(24, 15)] = "pod"

	# 시작 핵심 설비 (수동 발전기 + 배터리 + 식량 상자 + 인쇄기 + 식탁 + 산소 확산기 + 연구 작업대 + 천장 조명)
	building[idx(20, 16)] = "generator"
	building[idx(21, 16)] = "battery"
	battery_j[idx(21, 16)] = 4500.0
	building[idx(22, 16)] = "ration_box"
	building[idx(25, 16)] = "mess_table"
	building[idx(26, 16)] = "diffuser"
	building[idx(27, 16)] = "research_station"
	building[idx(27, 14)] = "ceiling_light"
	for wx in range(20, 28):
		has_wire[idx(wx, 16)] = 1
	has_wire[idx(27, 15)] = 1
	has_wire[idx(27, 14)] = 1

	# 우측 깨끗한 물 웅덩이 (자연 동굴형 윤곽, x: 31..35, y: 17..19)
	for y in range(17, 20):
		for x in range(31, 36):
			if y == 19 and (x == 31 or x == 35):
				continue
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			if y == 17:
				gas_el[i] = "Oxygen"
				gas_mass[i] = 0.9
				gas_prev_mass[i] = 0.9
			else:
				liquid_el[i] = "Water"
				liquid_mass[i] = 950.0
				gas_el[i] = "Vacuum"
				gas_mass[i] = 0.0
			temp_c[i] = 18.0 if world_preset != "rime" else 4.0

	# 동쪽 늪지 오염된 물(DirtyWater) 웅덩이 + 식중독/점액폐균 (x: 38..42, y: 12..14)
	for y in range(12, 15):
		for x in range(38, 43):
			if y == 14 and (x == 38 or x == 42):
				continue
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			if y == 12:
				gas_el[i] = "ContaminatedOxygen"
				gas_mass[i] = 0.85
				gas_prev_mass[i] = 0.85
				germ_type[i] = "SlimeLung"
				germ_count[i] = 45000.0
			else:
				liquid_el[i] = "DirtyWater"
				liquid_mass[i] = 920.0
				gas_el[i] = "Vacuum"
				gas_mass[i] = 0.0
				germ_type[i] = "FoodPoisoning"
				germ_count[i] = 85000.0
			temp_c[i] = 31.0

	# 남서쪽 원유(CrudeOil) 웅덩이 (x: 10..15, y: 24..26)
	for y in range(24, 27):
		for x in range(10, 16):
			if y == 26 and (x == 10 or x == 15):
				continue
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			if y == 24:
				gas_el[i] = "CarbonDioxide"
				gas_mass[i] = 1.1
				gas_prev_mass[i] = 1.1
			else:
				liquid_el[i] = "CrudeOil"
				liquid_mass[i] = 870.0
				gas_el[i] = "Vacuum"
				gas_mass[i] = 0.0
			temp_c[i] = 68.0

	# 북쪽 수소 포켓 (자연 동굴 아치형)
	for y in range(8, 10):
		for x in range(22, 26):
			if y == 8 and (x == 22 or x == 25):
				continue
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			gas_el[i] = "Hydrogen"
			gas_mass[i] = 0.65
			gas_prev_mass[i] = 0.65
			temp_c[i] = 23.0

	# 하단 이산화탄소 포켓 (자연 동굴 아치형)
	for y in range(21, 23):
		for x in range(21, 27):
			if (y == 21 and x == 21) or (y == 22 and x == 26):
				continue
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			gas_el[i] = "CarbonDioxide"
			gas_mass[i] = 0.85
			gas_prev_mass[i] = 0.85
			temp_c[i] = 24.0

	# 남동쪽 증기 분출실 + 심부 마그마(Magma) 웅덩이
	for y in range(25, 27):
		for x in range(39, 42):
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			gas_el[i] = "Steam"
			gas_mass[i] = 2.0
			gas_prev_mass[i] = 2.0
			temp_c[i] = 155.0
	for x in range(38, 43):
		var mi := idx(x, 28)
		solid_el[mi] = ""
		solid_mass[mi] = 0.0
		liquid_el[mi] = "Magma"
		liquid_mass[mi] = 980.0
		gas_el[mi] = "Vacuum"
		gas_mass[mi] = 0.0
		temp_c[mi] = 1450.0
	building[idx(40, 26)] = "geyser_steam"
	building[idx(33, 17)] = "geyser_water"
	building[idx(23, 9)] = "geyser_hydrogen"

	# 원작 생물 6종 스폰 (해치, 푸프, 빛벌레, 파쿠, 드레코, 슬릭스터)
	critters.clear()
	critters.append({"id": "critter_hatch", "name_ko": "해치", "pos": Vector2(22.0, 16.0), "dir": 1.0, "fly": false, "swim": false, "timer": 1.2})
	critters.append({"id": "critter_puft", "name_ko": "푸프", "pos": Vector2(25.5, 14.3), "dir": -1.0, "fly": true, "swim": false, "timer": 0.8})
	critters.append({"id": "critter_lightbug", "name_ko": "빛벌레", "pos": Vector2(21.5, 14.5), "dir": 1.0, "fly": true, "swim": false, "timer": 1.5})
	critters.append({"id": "critter_pacu", "name_ko": "파쿠", "pos": Vector2(33.0, 18.1), "dir": 1.0, "fly": false, "swim": true, "timer": 1.0})
	critters.append({"id": "critter_drecko", "name_ko": "드레코", "pos": Vector2(39.5, 12.0), "dir": -1.0, "fly": false, "swim": false, "timer": 1.4})
	critters.append({"id": "critter_slickster", "name_ko": "슬릭스터", "pos": Vector2(23.5, 22.0), "dir": 1.0, "fly": true, "swim": false, "timer": 1.1})

	# 원작 공식 복제체 인격 3명 (미프, 에이다, 버블스)
	duplicants.clear()
	var names: Array[String] = ["미프", "에이다", "버블스"]
	var dupe_traits: Array[String] = ["조기 기상", "빠른 학습자", "잠수부의 폐"]
	var colors: Array[Color] = [
		Color(0.35, 0.72, 0.98, 1.0),
		Color(0.95, 0.56, 0.42, 1.0),
		Color(0.54, 0.86, 0.52, 1.0),
	]
	var spawn_xs: Array[int] = [21, 22, 25]
	for d_idx in range(3):
		var dupe := OniDuplicant.new(d_idx, names[d_idx], Vector2i(spawn_xs[d_idx], 16), colors[d_idx], dupe_traits[d_idx])
		duplicants.append(dupe)

	_recompute_rooms()
	_recompute_stats()

func _set_solid(i: int, el: String, p_temp: float) -> void:
	var info := OniElements.get_element(el)
	solid_el[i] = el
	solid_mass[i] = float(info.get("default_mass", 1000.0))
	temp_c[i] = p_temp

func is_building_unlocked(b_id: String) -> bool:
	if sandbox_unlock_all:
		return true
	var bdef := OniElements.get_building(b_id)
	var req := String(bdef.get("req_tech", ""))
	if req.is_empty():
		return true
	return unlocked_techs.has(req)

func is_tech_done(tid: String) -> bool:
	return unlocked_techs.has(tid)

func can_research_tech(tid: String) -> bool:
	if unlocked_techs.has(tid):
		return false
	var tdef := OniElements.get_tech(tid)
	if tdef.is_empty():
		return false
	var prereqs: Array = tdef.get("prereqs", [])
	for p_v in prereqs:
		if not unlocked_techs.has(String(p_v)):
			return false
	return true

func add_research_points(pts: float) -> void:
	if active_tech.is_empty() or unlocked_techs.has(active_tech):
		return
	var tdef := OniElements.get_tech(active_tech)
	if tdef.is_empty():
		return
	var cost: float = float(tdef.get("cost_basic", 10.0))
	var cur: float = float(tech_progress.get(active_tech, 0.0)) + pts
	tech_progress[active_tech] = minf(cur, cost)
	if tech_progress[active_tech] >= cost:
		unlocked_techs[active_tech] = true
		active_tech = ""
		for tid_v in OniElements.techs.keys():
			var tid := String(tid_v)
			if can_research_tech(tid):
				active_tech = tid
				break

func is_solid_cell(x: int, y: int) -> bool:
	if not in_bounds(x, y):
		return true
	var i := idx(x, y)
	if not solid_el[i].is_empty():
		return true
	var b := building[i]
	if b == "tile" or b == "insulated_tile" or b == "farm_tile":
		return true
	return false

func is_passable(x: int, y: int) -> bool:
	return not is_solid_cell(x, y)

func is_climbable(x: int, y: int) -> bool:
	if not in_bounds(x, y):
		return false
	return building[idx(x, y)] == "ladder"

func can_stand_at(x: int, y: int) -> bool:
	if not is_passable(x, y):
		return false
	if is_climbable(x, y):
		return true
	if is_solid_cell(x, y + 1):
		return true
	if is_climbable(x, y + 1):
		return true
	return false

func order_dig(x: int, y: int) -> bool:
	if not in_bounds(x, y):
		return false
	var i := idx(x, y)
	if solid_el[i].is_empty() or not OniElements.is_diggable(solid_el[i]):
		return false
	if dig_order[i] == 1:
		return false
	dig_order[i] = 1
	dig_progress[i] = 0.0
	return true

func order_build(x: int, y: int, b_id: String) -> bool:
	if not in_bounds(x, y):
		return false
	if not is_building_unlocked(b_id):
		return false
	var bdef := OniElements.get_building(b_id)
	if bdef.is_empty():
		return false
	var i := idx(x, y)
	var layer := String(bdef.get("layer", ""))

	if layer == "wire":
		if has_wire[i] == 1 or build_order[i] == "wire" or building[i] == "pod":
			return false
		build_order[i] = "wire"
		build_progress[i] = 0.0
		return true
	elif layer == "liquid_pipe":
		if has_liquid_pipe[i] == 1 or build_order[i] == "liquid_pipe" or building[i] == "pod":
			return false
		build_order[i] = "liquid_pipe"
		build_progress[i] = 0.0
		return true
	elif layer == "gas_pipe":
		if has_gas_pipe[i] == 1 or build_order[i] == "gas_pipe" or building[i] == "pod":
			return false
		build_order[i] = "gas_pipe"
		build_progress[i] = 0.0
		return true

	if not solid_el[i].is_empty():
		return false
	if not building[i].is_empty():
		return false
	if bool(bdef.get("needs_floor", false)) and not is_solid_cell(x, y + 1):
		return false
	if build_order[i] == b_id:
		return false

	build_order[i] = b_id
	build_progress[i] = 0.0
	return true

func cancel_order(x: int, y: int) -> bool:
	if not in_bounds(x, y):
		return false
	var i := idx(x, y)
	var changed := false
	if dig_order[i] == 1:
		dig_order[i] = 0
		dig_progress[i] = 0.0
		changed = true
	if not build_order[i].is_empty():
		build_order[i] = ""
		build_progress[i] = 0.0
		changed = true
	return changed

func has_materials_for(b_id: String) -> bool:
	var bdef := OniElements.get_building(b_id)
	if bdef.is_empty():
		return false
	var el := String(bdef.get("cost_element", "SandStone"))
	var cost := float(bdef.get("cost_kg", 100.0))
	return float(inventory.get(el, 0.0)) >= cost

func complete_dig(x: int, y: int) -> void:
	if not in_bounds(x, y):
		return
	var i := idx(x, y)
	var el := solid_el[i]
	if el.is_empty():
		dig_order[i] = 0
		return
	var gained := solid_mass[i] * OniElements.DIG_RETURN_RATIO
	inventory[el] = float(inventory.get(el, 0.0)) + gained
	solid_el[i] = ""
	solid_mass[i] = 0.0
	dig_order[i] = 0
	dig_progress[i] = 0.0
	gas_el[i] = "Vacuum"
	gas_mass[i] = 0.0
	gas_prev_mass[i] = 0.0
	if on_dig_completed.is_valid():
		on_dig_completed.call(Vector2i(x, y), el, gained)

func complete_build(x: int, y: int) -> void:
	if not in_bounds(x, y):
		return
	var i := idx(x, y)
	var b_id := build_order[i]
	if b_id.is_empty():
		return
	var bdef := OniElements.get_building(b_id)
	if bdef.is_empty():
		build_order[i] = ""
		return
	var el := String(bdef.get("cost_element", "SandStone"))
	var cost := float(bdef.get("cost_kg", 100.0))
	if float(inventory.get(el, 0.0)) < cost:
		return
	inventory[el] = maxf(0.0, float(inventory.get(el, 0.0)) - cost)

	var layer := String(bdef.get("layer", ""))
	if layer == "wire":
		has_wire[i] = 1
	elif layer == "liquid_pipe":
		has_liquid_pipe[i] = 1
	elif layer == "gas_pipe":
		has_gas_pipe[i] = 1
	else:
		if bool(bdef.get("solid", false)):
			_displace_gas_out(x, y)
		building[i] = b_id
		if b_id == "battery":
			battery_j[i] = 1500.0
		elif b_id == "farm_tile":
			farm_growth[i] = 0.0
	build_order[i] = ""
	build_progress[i] = 0.0
	if on_build_completed.is_valid():
		on_build_completed.call(Vector2i(x, y), b_id)

func _displace_gas_out(x: int, y: int) -> void:
	var i := idx(x, y)
	if gas_mass[i] <= 0.0001 or gas_el[i] == "Vacuum":
		gas_el[i] = "Vacuum"
		gas_mass[i] = 0.0
		return
	var dirs: Array[Vector2i] = [Vector2i(0, -1), Vector2i(-1, 0), Vector2i(1, 0), Vector2i(0, 1)]
	for d: Vector2i in dirs:
		var nx: int = x + d.x
		var ny: int = y + d.y
		if not is_passable(nx, ny):
			continue
		var ni := idx(nx, ny)
		if liquid_mass[ni] > 1.0:
			continue
		if gas_el[ni] == "Vacuum" or gas_el[ni] == gas_el[i]:
			gas_el[ni] = gas_el[i]
			gas_mass[ni] += gas_mass[i]
			break
	gas_el[i] = "Vacuum"
	gas_mass[i] = 0.0

func step(dt: float) -> void:
	sim_time += dt
	cycle = int(floor(sim_time / OniElements.CYCLE_SECONDS)) + 1

	var total := WIDTH * HEIGHT
	for i in range(total):
		gen_active[i] = 0
		research_active[i] = 0

	for dupe in duplicants:
		dupe.step(self, dt)

	_step_power_and_machines(dt)
	_step_farms(dt)
	_step_geysers_and_critters(dt)

	_gas_accum += dt
	while _gas_accum >= OniElements.GAS_TICK_DT:
		_gas_accum -= OniElements.GAS_TICK_DT
		step_gas_tick()

	_conduit_accum += dt
	while _conduit_accum >= OniElements.CONDUIT_TICK_DT:
		_conduit_accum -= OniElements.CONDUIT_TICK_DT
		step_conduit_tick()

	_liquid_accum += dt
	if _liquid_accum >= 0.25:
		_liquid_accum = 0.0
		_step_liquids()

	_heat_accum += dt
	if _heat_accum >= 0.5:
		_heat_accum = 0.0
		_step_heat(0.5)
		_step_phase_change()

	_germ_accum += dt
	if _germ_accum >= 0.6:
		_germ_accum = 0.0
		_step_offgassing_and_germs(0.6)

	_room_accum += dt
	if _room_accum >= 1.2:
		_room_accum = 0.0
		_recompute_rooms()

	_recompute_stats()

func step_gas_tick() -> void:
	gas_tick_count += 1
	var total := WIDTH * HEIGHT
	for i in range(total):
		gas_prev_mass[i] = gas_mass[i]

	var delta_mass := PackedFloat32Array()
	delta_mass.resize(total)

	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			if is_solid_cell(x, y) or liquid_mass[i] > 10.0:
				continue
			var el := gas_el[i]
			var m := gas_mass[i]
			if el == "Vacuum" or m < 0.002:
				continue

			var ncoords: Array[Vector2i] = [Vector2i(x + 1, y), Vector2i(x - 1, y), Vector2i(x, y - 1), Vector2i(x, y + 1)]
			for nc: Vector2i in ncoords:
				if is_solid_cell(nc.x, nc.y):
					continue
				var ni := idx(nc.x, nc.y)
				if liquid_mass[ni] > 10.0:
					continue
				var nel := gas_el[ni]
				if nel == el:
					var diff := m - gas_mass[ni]
					if diff > 0.005:
						var flow := diff * 0.14
						delta_mass[i] -= flow
						delta_mass[ni] += flow
				elif nel == "Vacuum" and m > 0.02:
					var flow := m * 0.12
					delta_mass[i] -= flow
					gas_el[ni] = el
					delta_mass[ni] += flow

	for i in range(total):
		if delta_mass[i] != 0.0:
			gas_mass[i] = maxf(0.0, gas_mass[i] + delta_mass[i])
			if gas_mass[i] < 0.001:
				gas_mass[i] = 0.0
				gas_el[i] = "Vacuum"

	var parity := gas_tick_count % 2
	for y in range(1 + parity, HEIGHT - 2, 2):
		for x in range(1, WIDTH - 1):
			if is_solid_cell(x, y) or is_solid_cell(x, y + 1):
				continue
			var top_i := idx(x, y)
			var bot_i := idx(x, y + 1)
			if liquid_mass[top_i] > 10.0 or liquid_mass[bot_i] > 10.0:
				continue
			var top_el := gas_el[top_i]
			var bot_el := gas_el[bot_i]
			if top_el == bot_el or top_el == "Vacuum" or bot_el == "Vacuum":
				continue
			var top_mm := float(OniElements.get_element(top_el).get("molar_mass", 16.0))
			var bot_mm := float(OniElements.get_element(bot_el).get("molar_mass", 16.0))
			if top_mm > bot_mm + 1.0:
				gas_el[top_i] = bot_el
				gas_el[bot_i] = top_el
				var tm := gas_mass[top_i]
				gas_mass[top_i] = gas_mass[bot_i]
				gas_mass[bot_i] = tm

	_recompute_stats()

func step_conduit_tick() -> void:
	conduit_tick_count += 1
	var total := WIDTH * HEIGHT
	var dirs: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, -1), Vector2i(0, 1)]

	# 1) 액체관 패킷 이동 (10kg/s) 및 배출구 방출
	var next_lm := lpipe_mass.duplicate()
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			if has_liquid_pipe[i] == 0 or lpipe_mass[i] <= 0.01:
				continue
			# 배출구가 있으면 공간에 방출
			if building[i] == "liquid_vent" and not is_solid_cell(x, y):
				var space := maxf(0.0, 1000.0 - liquid_mass[i])
				var out_m := minf(lpipe_mass[i], space)
				if out_m > 0.01:
					if liquid_mass[i] < 1.0 or liquid_el[i].is_empty():
						liquid_el[i] = "Water"
					liquid_mass[i] += out_m
					next_lm[i] -= out_m
					continue
			# 인접 액체관 중 질량이 적은 쪽으로 흐름
			var best_ni := -1
			var lowest := lpipe_mass[i] - 0.1
			for d: Vector2i in dirs:
				var nx: int = x + d.x
				var ny: int = y + d.y
				if not in_bounds(nx, ny):
					continue
				var ni := idx(nx, ny)
				if has_liquid_pipe[ni] == 1 and next_lm[ni] < lowest:
					lowest = next_lm[ni]
					best_ni = ni
			if best_ni >= 0:
				var space_n := maxf(0.0, OniElements.LIQUID_PIPE_MAX_KG - next_lm[best_ni])
				var move_m := minf(minf(lpipe_mass[i] * 0.5, space_n), OniElements.LIQUID_PIPE_MAX_KG)
				if move_m > 0.05:
					next_lm[i] -= move_m
					next_lm[best_ni] += move_m
					lpipe_temp[best_ni] = lerpf(lpipe_temp[best_ni], lpipe_temp[i], 0.5)
	lpipe_mass = next_lm

	# 2) 기체관 패킷 이동 (1kg/s) 및 배출구 방출
	var next_gm := gpipe_mass.duplicate()
	var next_ge := gpipe_el.duplicate()
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			if has_gas_pipe[i] == 0 or gpipe_mass[i] <= 0.005 or gpipe_el[i] == "Vacuum":
				continue
			if building[i] == "gas_vent" and not is_solid_cell(x, y):
				if (gas_el[i] == "Vacuum" or gas_el[i] == gpipe_el[i]) and gas_mass[i] < 2.0:
					var out_m := minf(gpipe_mass[i], 2.0 - gas_mass[i])
					gas_el[i] = gpipe_el[i]
					gas_mass[i] += out_m
					next_gm[i] -= out_m
					if next_gm[i] < 0.005:
						next_gm[i] = 0.0
						next_ge[i] = "Vacuum"
					continue
			var best_ni := -1
			var lowest := gpipe_mass[i] - 0.02
			for d: Vector2i in dirs:
				var nx: int = x + d.x
				var ny: int = y + d.y
				if not in_bounds(nx, ny):
					continue
				var ni := idx(nx, ny)
				if has_gas_pipe[ni] == 1 and (next_ge[ni] == "Vacuum" or next_ge[ni] == gpipe_el[i]) and next_gm[ni] < lowest:
					lowest = next_gm[ni]
					best_ni = ni
			if best_ni >= 0:
				var space_n := maxf(0.0, OniElements.GAS_PIPE_MAX_KG - next_gm[best_ni])
				var move_m := minf(gpipe_mass[i] * 0.5, space_n)
				if move_m > 0.01:
					next_gm[i] -= move_m
					next_gm[best_ni] += move_m
					next_ge[best_ni] = gpipe_el[i]
					gpipe_temp[best_ni] = lerpf(gpipe_temp[best_ni], gpipe_temp[i], 0.5)
					if next_gm[i] < 0.005:
						next_gm[i] = 0.0
						next_ge[i] = "Vacuum"
	gpipe_mass = next_gm
	gpipe_el = next_ge

func _liquid_density(el: String) -> float:
	match el:
		"Magma":
			return 1840.0
		"Water":
			return 1000.0
		"DirtyWater":
			return 990.0
		"CrudeOil":
			return 870.0
		_:
			return 950.0

func _step_liquids() -> void:
	for y in range(HEIGHT - 2, 0, -1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			var m := liquid_mass[i]
			if m < 1.0 or is_solid_cell(x, y):
				if m < 1.0:
					liquid_el[i] = ""
				continue
			var lel := liquid_el[i]
			if lel.is_empty():
				lel = "Water"
				liquid_el[i] = lel
			if not is_solid_cell(x, y + 1):
				var bi := idx(x, y + 1)
				var bel := liquid_el[bi]
				if liquid_mass[bi] < 1.0 or bel == lel or bel.is_empty():
					var cap: float = maxf(0.0, 1000.0 - liquid_mass[bi])
					if cap > 1.0:
						var flow: float = minf(m, cap)
						liquid_mass[i] -= flow
						liquid_mass[bi] += flow
						liquid_el[bi] = lel
						if liquid_mass[i] < 1.0:
							liquid_mass[i] = 0.0
							liquid_el[i] = ""
						if liquid_mass[bi] > 50.0:
							gas_el[bi] = "Vacuum"
							gas_mass[bi] = 0.0
						continue
				elif _liquid_density(lel) > _liquid_density(bel) + 1.0:
					# 무거운 액체(마그마>물>오염수>원유)가 아래로 침강하는 원작 다중 액체 층화
					liquid_el[i] = bel
					liquid_el[bi] = lel
					var tm := liquid_mass[i]
					liquid_mass[i] = liquid_mass[bi]
					liquid_mass[bi] = tm
					continue
			var dirs: Array[int] = [-1, 1]
			for dx: int in dirs:
				if not is_solid_cell(x + dx, y):
					var si := idx(x + dx, y)
					if liquid_mass[si] < 1.0 or liquid_el[si] == lel or liquid_el[si].is_empty():
						var diff := liquid_mass[i] - liquid_mass[si]
						if diff > 10.0:
							var flow := diff * 0.25
							liquid_mass[i] -= flow
							liquid_mass[si] += flow
							liquid_el[si] = lel

func _step_heat(dt: float) -> void:
	var total := WIDTH * HEIGHT
	var delta_t := PackedFloat32Array()
	delta_t.resize(total)

	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			var tc1 := _cell_conductivity(i)
			if tc1 <= 0.0:
				continue
			var nlist: Array[Vector2i] = [Vector2i(x + 1, y), Vector2i(x, y + 1)]
			for nc: Vector2i in nlist:
				var ni := idx(nc.x, nc.y)
				var tc2 := _cell_conductivity(ni)
				if tc2 <= 0.0:
					continue
				var k: float = minf(tc1, tc2) * 0.015 * dt
				var d: float = (temp_c[ni] - temp_c[i]) * minf(k, 0.2)
				delta_t[i] += d
				delta_t[ni] -= d

	for i in range(total):
		temp_c[i] += delta_t[i]

func _step_phase_change() -> void:
	# 원작 elements_extracted.json 기반 전 원소 상변화 (±1°C 히스테리시스)
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			var t := temp_c[i]
			# 고체 -> 고온 전이 (융해/열분해: Ice->Water, Snow->Water, Algae->Dirt 등)
			if not solid_el[i].is_empty():
				var info := OniElements.get_element(solid_el[i])
				var hc: Variant = info.get("high_c", null)
				var ht: Variant = info.get("high_target", null)
				if hc != null and ht != null and t > float(hc) + 1.0:
					var target_id := String(ht)
					var tstate := String(OniElements.get_element(target_id).get("state", "solid"))
					if tstate == "liquid":
						liquid_el[i] = target_id
						liquid_mass[i] += minf(solid_mass[i], 1000.0)
						solid_el[i] = ""
						solid_mass[i] = 0.0
					elif tstate == "solid":
						solid_el[i] = target_id
					elif tstate == "gas":
						gas_el[i] = target_id
						gas_mass[i] += minf(solid_mass[i], 5.0)
						solid_el[i] = ""
						solid_mass[i] = 0.0
			# 액체 상변화 (Water/DirtyWater/Magma)
			elif liquid_mass[i] > 5.0:
				var lel := liquid_el[i] if not liquid_el[i].is_empty() else "Water"
				var w_info := OniElements.get_element(lel)
				var wh: float = float(w_info.get("high_c", 99.35))
				var wl: float = float(w_info.get("low_c", -0.65))
				if t > wh + 1.0 and lel in ["Water", "DirtyWater"]:
					var boil := minf(liquid_mass[i], 2.0)
					liquid_mass[i] -= boil
					if liquid_mass[i] < 1.0:
						liquid_mass[i] = 0.0
						liquid_el[i] = ""
					if gas_el[i] == "Vacuum" or gas_el[i] == "Steam":
						gas_el[i] = "Steam"
						gas_mass[i] += boil
				elif liquid_mass[i] > 200.0 and t < wl - 1.0 and building[i].is_empty():
					var freeze_el := "IgneousRock" if lel == "Magma" else ("DirtyIce" if lel == "DirtyWater" else "Ice")
					solid_el[i] = freeze_el
					solid_mass[i] = liquid_mass[i]
					liquid_mass[i] = 0.0
					liquid_el[i] = ""
			# 기체 -> 저온 응결 (Steam->Water 등)
			elif gas_el[i] != "Vacuum" and gas_mass[i] > 0.05:
				var g_info := OniElements.get_element(gas_el[i])
				var lc: Variant = g_info.get("low_c", null)
				var lt: Variant = g_info.get("low_target", null)
				if lc != null and lt != null and t < float(lc) - 1.0:
					if String(lt) == "Water":
						liquid_el[i] = "Water"
						liquid_mass[i] += gas_mass[i]
						gas_mass[i] = 0.0
						gas_el[i] = "Vacuum"

func _step_offgassing_and_germs(dt: float) -> void:
	# 원작 승화/오프개싱(OxyRock->O2, SlimeMold/DirtyWater->PO2, BleachStone->Cl2) + 세균(식중독/점액폐균) 증식·소독
	var dirs: Array[Vector2i] = [Vector2i(0, -1), Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1)]
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			var sol := solid_el[i]
			if sol == "OxyRock" or sol == "SlimeMold" or sol == "BleachStone":
				var emit_el := "Oxygen" if sol == "OxyRock" else ("ContaminatedOxygen" if sol == "SlimeMold" else "ChlorineGas")
				for d: Vector2i in dirs:
					var nx: int = x + d.x
					var ny: int = y + d.y
					if not is_solid_cell(nx, ny):
						var ni := idx(nx, ny)
						if liquid_mass[ni] < 10.0 and gas_mass[ni] < 1.6 and (gas_el[ni] == "Vacuum" or gas_el[ni] == emit_el):
							gas_el[ni] = emit_el
							gas_mass[ni] += 0.025 * dt
							solid_mass[i] = maxf(50.0, solid_mass[i] - 0.025 * dt)
							if sol == "SlimeMold":
								germ_type[ni] = "SlimeLung"
								germ_count[ni] = minf(200000.0, germ_count[ni] + 1800.0 * dt)
							break
			elif liquid_mass[i] > 50.0 and liquid_el[i] == "DirtyWater":
				germ_type[i] = "FoodPoisoning"
				germ_count[i] = minf(250000.0, germ_count[i] + 1200.0 * dt)
				if not is_solid_cell(x, y - 1):
					var ui := idx(x, y - 1)
					if liquid_mass[ui] < 10.0 and gas_mass[ui] < 1.5 and (gas_el[ui] == "Vacuum" or gas_el[ui] == "ContaminatedOxygen"):
						gas_el[ui] = "ContaminatedOxygen"
						gas_mass[ui] += 0.015 * dt

			if building[i] == "outhouse":
				germ_type[i] = "FoodPoisoning"
				germ_count[i] = minf(120000.0, germ_count[i] + 900.0 * dt)
			elif building[i] == "wash_basin" and germ_count[i] > 0.0:
				germ_count[i] = maxf(0.0, germ_count[i] - 12000.0 * dt)

			# 세균 자연 감쇠 / 염소·고온 살균 / 인접 기체 확산
			var gc := germ_count[i]
			if gc > 10.0:
				var gt := germ_type[i]
				if gas_el[i] == "ChlorineGas" or temp_c[i] > 65.0 or temp_c[i] < -15.0:
					gc *= maxf(0.0, 1.0 - 0.38 * dt)
				elif gt == "SlimeLung" and gas_el[i] == "Oxygen":
					gc *= maxf(0.0, 1.0 - 0.04 * dt)
				else:
					gc *= maxf(0.0, 1.0 - 0.01 * dt)
				germ_count[i] = gc
				if gc < 20.0:
					germ_count[i] = 0.0
					germ_type[i] = ""
				elif not is_solid_cell(x, y):
					for d: Vector2i in dirs:
						var nx: int = x + d.x
						var ny: int = y + d.y
						if not is_solid_cell(nx, ny):
							var ni := idx(nx, ny)
							if germ_count[ni] < gc * 0.6 and (germ_type[ni].is_empty() or germ_type[ni] == gt):
								var share := (gc - germ_count[ni]) * 0.04 * dt
								germ_count[i] -= share
								germ_count[ni] += share
								germ_type[ni] = gt

func _is_room_boundary(x: int, y: int) -> bool:
	if is_solid_cell(x, y):
		return true
	return building[idx(x, y)] == "door"

func _recompute_rooms() -> void:
	# 원작 방(Room) 구획 자동 탐지 (고체 암반·타일·수동 에어록으로 둘러싸인 6~96칸 실내)
	var total := WIDTH * HEIGHT
	room_id.fill(-1)
	rooms_list.clear()
	colony_morale_bonus = 0

	var visited := PackedByteArray()
	visited.resize(total)
	var dirs: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]
	var next_rid := 0

	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var si := idx(x, y)
			if visited[si] == 1 or _is_room_boundary(x, y):
				continue
			var cells: Array[Vector2i] = []
			var q: Array[Vector2i] = [Vector2i(x, y)]
			visited[si] = 1
			var head := 0
			var touches_edge := false
			var bcounts: Dictionary = {}
			var sum_x := 0.0
			var sum_y := 0.0
			while head < q.size():
				var cur: Vector2i = q[head]
				head += 1
				cells.append(cur)
				sum_x += float(cur.x)
				sum_y += float(cur.y)
				if cur.x <= 1 or cur.x >= WIDTH - 2 or cur.y <= 1 or cur.y >= HEIGHT - 2:
					touches_edge = true
				var ci := idx(cur.x, cur.y)
				var b := building[ci]
				if not b.is_empty():
					bcounts[b] = int(bcounts.get(b, 0)) + 1
				for d: Vector2i in dirs:
					var nx: int = cur.x + d.x
					var ny: int = cur.y + d.y
					if not in_bounds(nx, ny):
						continue
					var ni := idx(nx, ny)
					if visited[ni] == 0 and not _is_room_boundary(nx, ny):
						visited[ni] = 1
						q.append(Vector2i(nx, ny))
			var sz := cells.size()
			if touches_edge or sz < 6 or sz > 96:
				continue

			var r_type := ""
			var r_name := ""
			var r_morale := 0
			var r_col := Color(0.45, 0.72, 0.92, 0.24)
			if int(bcounts.get("outhouse", 0)) > 0 and int(bcounts.get("wash_basin", 0)) > 0:
				r_type = "latrine"
				r_name = "화장실"
				r_morale = 1
				r_col = Color(0.32, 0.86, 0.72, 0.26)
			elif int(bcounts.get("mess_table", 0)) > 0:
				r_type = "mess_hall"
				r_name = "식당"
				r_morale = 3
				r_col = Color(0.95, 0.76, 0.28, 0.26)
			elif int(bcounts.get("cot", 0)) > 0:
				r_type = "barracks"
				r_name = "막사"
				r_morale = 1
				r_col = Color(0.42, 0.68, 0.96, 0.26)
			elif int(bcounts.get("research_station", 0)) > 0 and (int(bcounts.get("ceiling_light", 0)) > 0 or int(bcounts.get("pod", 0)) > 0):
				r_type = "laboratory"
				r_name = "연구실"
				r_morale = 1
				r_col = Color(0.68, 0.52, 0.98, 0.26)
			elif int(bcounts.get("battery", 0)) > 0 and (int(bcounts.get("generator", 0)) > 0 or int(bcounts.get("coal_gen", 0)) > 0 or int(bcounts.get("hydrogen_gen", 0)) > 0):
				r_type = "power_plant"
				r_name = "발전실"
				r_morale = 0
				r_col = Color(0.96, 0.54, 0.24, 0.24)
			else:
				continue

			for cpos: Vector2i in cells:
				room_id[idx(cpos.x, cpos.y)] = next_rid
			rooms_list.append({
				"id": next_rid,
				"type": r_type,
				"name_ko": r_name,
				"morale": r_morale,
				"color": r_col,
				"size": sz,
				"center": Vector2(sum_x / float(sz) + 0.5, sum_y / float(sz) + 0.5),
			})
			colony_morale_bonus += r_morale
			next_rid += 1

	for d in duplicants:
		d.morale = 1 + colony_morale_bonus

func _cell_conductivity(i: int) -> float:
	if not solid_el[i].is_empty():
		return float(OniElements.get_element(solid_el[i]).get("tc", 1.0))
	var b := building[i]
	if b == "insulated_tile":
		return 0.029 # SandStone 2.9 * 0.01
	if b == "tile" or b == "farm_tile":
		return 2.9
	if liquid_mass[i] > 1.0:
		return 0.609
	if gas_mass[i] > 0.005:
		return float(OniElements.get_element(gas_el[i]).get("tc", 0.024))
	return 0.0

func _step_farms(dt: float) -> void:
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			if building[i] != "farm_tile":
				continue
			var above_i := idx(x, y - 1)
			if is_solid_cell(x, y - 1):
				continue
			var t := temp_c[above_i]
			var ok_temp := t >= OniElements.MEALWOOD_MIN_C and t <= OniElements.MEALWOOD_MAX_C
			var ok_gas := gas_mass[above_i] >= OniElements.MEALWOOD_MIN_GAS_KG
			var need_dirt := OniElements.MEALWOOD_DIRT_KG_PER_S * dt
			var ok_dirt := float(inventory.get("Dirt", 0.0)) >= need_dirt
			if ok_temp and ok_gas and ok_dirt:
				inventory["Dirt"] = maxf(0.0, float(inventory["Dirt"]) - need_dirt)
				farm_growth[i] += dt / OniElements.MEALWOOD_GROWTH_S
				machine_running[i] = 1
				if farm_growth[i] >= 1.0:
					farm_growth[i] = 0.0
					food_kcal += OniElements.MEALWOOD_HARVEST_KCAL
			else:
				machine_running[i] = 0

func _step_geysers_and_critters(dt: float) -> void:
	# 간헐천 주기 분출 (매 사이클 초 60% 활성)
	var erupting := fmod(sim_time, 60.0) < 36.0
	for gy_pos: Vector2i in [Vector2i(40, 26), Vector2i(33, 17), Vector2i(23, 9)]:
		var gi := idx(gy_pos.x, gy_pos.y)
		var gb := building[gi]
		if not erupting:
			machine_running[gi] = 0
			continue
		if gb == "geyser_steam" and gas_mass[gi] < 2.5:
			gas_el[gi] = "Steam"
			gas_mass[gi] += 0.45 * dt
			temp_c[gi] = lerpf(temp_c[gi], 160.0, 0.1)
			machine_running[gi] = 1
		elif gb == "geyser_water" and liquid_mass[gi] < 850.0:
			liquid_el[gi] = "Water"
			liquid_mass[gi] += 18.0 * dt
			temp_c[gi] = lerpf(temp_c[gi], 35.0, 0.05)
			machine_running[gi] = 1
		elif gb == "geyser_hydrogen" and gas_mass[gi] < 2.2:
			gas_el[gi] = "Hydrogen"
			gas_mass[gi] += 0.25 * dt
			machine_running[gi] = 1

	# 원작 생물 6종 자율 AI (육상 해치·드레코 / 비행 푸프·빛벌레·슬릭스터 / 수중 유영 파쿠)
	for c: Dictionary in critters:
		var pos: Vector2 = c["pos"]
		var dir: float = float(c["dir"])
		var fly: bool = bool(c["fly"])
		var swim: bool = bool(c.get("swim", false))
		var spd: float = 1.15 if (fly or swim) else 0.72
		var nx := pos.x + dir * spd * dt
		var ny := pos.y + (sin(sim_time * 2.4 + pos.x) * 0.30 * dt if (fly or swim) else 0.0)
		var cx := int(floor(nx))
		var cy := int(floor(ny))
		var ok := false
		if swim:
			ok = in_bounds(cx, cy) and not is_solid_cell(cx, cy) and liquid_mass[idx(cx, cy)] > 200.0
		else:
			ok = is_passable(cx, cy) and (fly or is_solid_cell(cx, cy + 1)) and (not in_bounds(cx, cy) or liquid_mass[idx(cx, cy)] < 200.0)
		if ok:
			c["pos"] = Vector2(nx, ny)
		else:
			c["dir"] = -dir

func _step_power_and_machines(dt: float) -> void:
	var total := WIDTH * HEIGHT
	for i in range(total):
		if building[i] != "farm_tile":
			machine_running[i] = 0

	power_produced_w = 0.0
	power_consumed_w = 0.0
	total_battery_j = 0.0
	total_battery_cap_j = 0.0

	var visited := PackedByteArray()
	visited.resize(total)
	var dirs: Array[Vector2i] = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]

	for y in range(HEIGHT):
		for x in range(WIDTH):
			var start_i := idx(x, y)
			if visited[start_i] == 1 or not _is_power_node(start_i):
				continue

			var net: Array[int] = []
			var queue: Array[Vector2i] = [Vector2i(x, y)]
			visited[start_i] = 1
			while not queue.is_empty():
				var cur: Vector2i = queue.pop_front()
				var ci := idx(cur.x, cur.y)
				net.append(ci)
				for d: Vector2i in dirs:
					var nx: int = cur.x + d.x
					var ny: int = cur.y + d.y
					if not in_bounds(nx, ny):
						continue
					var ni := idx(nx, ny)
					if visited[ni] == 0 and _is_power_node(ni):
						visited[ni] = 1
						queue.append(Vector2i(nx, ny))

			var net_gen_w := 0.0
			var net_bat_j := 0.0
			var bats: Array[int] = []
			var consumers: Array[int] = []

			for ci: int in net:
				var b := building[ci]
				if b == "generator" and gen_active[ci] == 1:
					net_gen_w += OniElements.MANUAL_GEN_POWER_W
					machine_running[ci] = 1
				elif b == "coal_gen":
					var need_c := OniElements.COAL_GEN_CARBON_KG_PER_S * dt
					if float(inventory.get("Carbon", 0.0)) >= need_c:
						inventory["Carbon"] = maxf(0.0, float(inventory["Carbon"]) - need_c)
						net_gen_w += OniElements.COAL_GEN_POWER_W
						machine_running[ci] = 1
						if gas_el[ci] == "Vacuum" or gas_el[ci] == "CarbonDioxide":
							gas_el[ci] = "CarbonDioxide"
							gas_mass[ci] += OniElements.COAL_GEN_CO2_KG_PER_S * dt
						temp_c[ci] = lerpf(temp_c[ci], OniElements.COAL_GEN_OUT_TEMP_C, 0.03)
				elif b == "hydrogen_gen":
					# 기체관에서 수소 보충
					if has_gas_pipe[ci] == 1 and gpipe_el[ci] == "Hydrogen" and gpipe_mass[ci] > 0.01:
						var take := minf(gpipe_mass[ci], OniElements.H2_GEN_BUFFER_KG - h2_buffer_kg[ci])
						if take > 0.0:
							gpipe_mass[ci] -= take
							h2_buffer_kg[ci] += take
							if gpipe_mass[ci] < 0.005:
								gpipe_mass[ci] = 0.0
								gpipe_el[ci] = "Vacuum"
					var need_h2 := OniElements.H2_GEN_H2_KG_PER_S * dt
					if h2_buffer_kg[ci] >= need_h2:
						h2_buffer_kg[ci] -= need_h2
						net_gen_w += OniElements.H2_GEN_POWER_W
						machine_running[ci] = 1
				elif b == "steam_turbine":
					var cx := ci % WIDTH
					var cy := ci / WIDTH
					var below_i := idx(cx, mini(HEIGHT - 1, cy + 1))
					if temp_c[ci] < OniElements.TURBINE_MAX_BODY_C and gas_el[below_i] == "Steam" and temp_c[below_i] >= OniElements.TURBINE_MIN_STEAM_C and gas_mass[below_i] > 0.05:
						var used_s := minf(gas_mass[below_i], OniElements.TURBINE_STEAM_KG_PER_S * dt)
						gas_mass[below_i] -= used_s
						if gas_mass[below_i] < 0.005:
							gas_mass[below_i] = 0.0
							gas_el[below_i] = "Vacuum"
						if has_liquid_pipe[ci] == 1:
							lpipe_mass[ci] = minf(OniElements.LIQUID_PIPE_MAX_KG, lpipe_mass[ci] + used_s)
						net_gen_w += OniElements.TURBINE_POWER_W
						temp_c[ci] += 0.25 * dt
						machine_running[ci] = 1
				elif b == "battery":
					battery_j[ci] = maxf(0.0, battery_j[ci] - OniElements.BATTERY_LEAK_J_PER_S * dt)
					bats.append(ci)
					net_bat_j += battery_j[ci]
					total_battery_cap_j += OniElements.BATTERY_CAPACITY_J
				elif b in ["diffuser", "electrolyzer", "co2_skimmer", "water_sieve", "ceiling_light", "microbe_musher", "electric_grill", "liquid_pump", "gas_pump", "research_station"]:
					consumers.append(ci)

			power_produced_w += net_gen_w
			var available_j := net_gen_w * dt + net_bat_j
			var used_j := 0.0

			for ci: int in consumers:
				var b := building[ci]
				if b == "diffuser":
					var need_j := OniElements.DIFFUSER_POWER_W * dt
					var need_algae := OniElements.DIFFUSER_ALGAE_KG_PER_S * dt
					var can_emit := (gas_el[ci] == "Vacuum" or gas_el[ci] == "Oxygen") and gas_mass[ci] < OniElements.DIFFUSER_MAX_PRESSURE_KG
					if can_emit and available_j - used_j >= need_j and float(inventory.get("Algae", 0.0)) >= need_algae:
						used_j += need_j
						power_consumed_w += OniElements.DIFFUSER_POWER_W
						inventory["Algae"] = maxf(0.0, float(inventory["Algae"]) - need_algae)
						gas_el[ci] = "Oxygen"
						gas_mass[ci] += OniElements.DIFFUSER_O2_KG_PER_S * dt
						temp_c[ci] = lerpf(temp_c[ci], OniElements.DIFFUSER_OUT_TEMP_C, 0.12)
						machine_running[ci] = 1
				elif b == "electrolyzer":
					var need_j := OniElements.ELECTROLYZER_POWER_W * dt
					var need_w := OniElements.ELECTROLYZER_WATER_KG_PER_S * dt
					var can_emit := gas_mass[ci] < OniElements.ELECTROLYZER_MAX_PRESSURE_KG
					if can_emit and available_j - used_j >= need_j and has_liquid_pipe[ci] == 1 and lpipe_mass[ci] >= need_w:
						used_j += need_j
						power_consumed_w += OniElements.ELECTROLYZER_POWER_W
						lpipe_mass[ci] -= need_w
						gas_el[ci] = "Oxygen"
						gas_mass[ci] += OniElements.ELECTROLYZER_O2_KG_PER_S * dt
						temp_c[ci] = lerpf(temp_c[ci], OniElements.ELECTROLYZER_OUT_TEMP_C, 0.12)
						# 수소는 위쪽 빈 칸으로 방출
						var cx := ci % WIDTH
						var cy := ci / WIDTH
						if cy > 1 and is_passable(cx, cy - 1):
							var up_i := idx(cx, cy - 1)
							if gas_el[up_i] == "Vacuum" or gas_el[up_i] == "Hydrogen":
								gas_el[up_i] = "Hydrogen"
								gas_mass[up_i] += OniElements.ELECTROLYZER_H2_KG_PER_S * dt
						machine_running[ci] = 1
				elif b == "liquid_pump":
					var need_j := OniElements.LIQUID_PUMP_POWER_W * dt
					if available_j - used_j >= need_j and has_liquid_pipe[ci] == 1 and liquid_mass[ci] > 1.0 and lpipe_mass[ci] < OniElements.LIQUID_PIPE_MAX_KG:
						var take := minf(minf(liquid_mass[ci], OniElements.LIQUID_PUMP_KG_PER_S * dt), OniElements.LIQUID_PIPE_MAX_KG - lpipe_mass[ci])
						if take > 0.01:
							used_j += need_j
							power_consumed_w += OniElements.LIQUID_PUMP_POWER_W
							liquid_mass[ci] -= take
							lpipe_mass[ci] += take
							lpipe_temp[ci] = temp_c[ci]
							machine_running[ci] = 1
				elif b == "gas_pump":
					var need_j := OniElements.GAS_PUMP_POWER_W * dt
					if available_j - used_j >= need_j and has_gas_pipe[ci] == 1 and gas_el[ci] != "Vacuum" and gas_mass[ci] > 0.02 and gpipe_mass[ci] < OniElements.GAS_PIPE_MAX_KG:
						if gpipe_el[ci] == "Vacuum" or gpipe_el[ci] == gas_el[ci]:
							var take := minf(minf(gas_mass[ci], OniElements.GAS_PUMP_KG_PER_S * dt), OniElements.GAS_PIPE_MAX_KG - gpipe_mass[ci])
							if take > 0.005:
								used_j += need_j
								power_consumed_w += OniElements.GAS_PUMP_POWER_W
								gas_mass[ci] -= take
								gpipe_el[ci] = gas_el[ci]
								gpipe_mass[ci] += take
								gpipe_temp[ci] = temp_c[ci]
								if gas_mass[ci] < 0.001:
									gas_mass[ci] = 0.0
									gas_el[ci] = "Vacuum"
								machine_running[ci] = 1
				elif b == "research_station":
					var need_j := OniElements.RESEARCH_POWER_W * dt
					if research_active[ci] == 1 and not active_tech.is_empty() and available_j - used_j >= need_j:
						var pts := 0.5 * dt
						var need_dirt := pts * OniElements.RESEARCH_DIRT_PER_PT
						if float(inventory.get("Dirt", 0.0)) >= need_dirt:
							used_j += need_j
							power_consumed_w += OniElements.RESEARCH_POWER_W
							inventory["Dirt"] = maxf(0.0, float(inventory["Dirt"]) - need_dirt)
							add_research_points(pts)
							machine_running[ci] = 1
				elif b == "ceiling_light":
					var need_j := 10.0 * dt
					if available_j - used_j >= need_j:
						used_j += need_j
						power_consumed_w += 10.0
						machine_running[ci] = 1
				elif b == "co2_skimmer":
					var need_j := 120.0 * dt
					if available_j - used_j >= need_j:
						var cx := ci % WIDTH
						var cy := ci / WIDTH
						var scrubbed := false
						for d: Vector2i in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, -1)]:
							var nx: int = cx + d.x
							var ny: int = cy + d.y
							if in_bounds(nx, ny):
								var ni := idx(nx, ny)
								if gas_el[ni] == "CarbonDioxide" and gas_mass[ni] > 0.02:
									gas_mass[ni] = maxf(0.0, gas_mass[ni] - 0.30 * dt)
									if gas_mass[ni] < 0.002:
										gas_mass[ni] = 0.0
										gas_el[ni] = "Vacuum"
									scrubbed = true
									break
						if scrubbed:
							used_j += need_j
							power_consumed_w += 120.0
							machine_running[ci] = 1
				elif b == "water_sieve":
					var need_j := 120.0 * dt
					if available_j - used_j >= need_j:
						var cx := ci % WIDTH
						var cy := ci / WIDTH
						for d: Vector2i in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1)]:
							var nx: int = cx + d.x
							var ny: int = cy + d.y
							if in_bounds(nx, ny):
								var ni := idx(nx, ny)
								if liquid_mass[ni] > 10.0 and liquid_el[ni] == "DirtyWater":
									liquid_el[ni] = "Water"
									germ_count[ni] = 0.0
									germ_type[ni] = ""
									used_j += need_j
									power_consumed_w += 120.0
									machine_running[ci] = 1
									break
				elif b == "microbe_musher" or b == "electric_grill":
					var pw := 240.0 if b == "microbe_musher" else 60.0
					var need_j := pw * dt
					var need_dirt := 1.2 * dt
					if available_j - used_j >= need_j and food_kcal < 12000.0 and float(inventory.get("Dirt", 0.0)) >= need_dirt:
						used_j += need_j
						power_consumed_w += pw
						inventory["Dirt"] = maxf(0.0, float(inventory["Dirt"]) - need_dirt)
						food_kcal += (28.0 if b == "microbe_musher" else 42.0) * dt
						machine_running[ci] = 1

			var net_delta_j := net_gen_w * dt - used_j
			if not bats.is_empty():
				var per_bat := net_delta_j / float(bats.size())
				for bi: int in bats:
					battery_j[bi] = clampf(battery_j[bi] + per_bat, 0.0, OniElements.BATTERY_CAPACITY_J)
					total_battery_j += battery_j[bi]

func _is_power_node(i: int) -> bool:
	if has_wire[i] == 1:
		return true
	var b := building[i]
	return b in ["generator", "coal_gen", "hydrogen_gen", "steam_turbine", "battery", "diffuser", "electrolyzer", "co2_skimmer", "water_sieve", "ceiling_light", "microbe_musher", "electric_grill", "liquid_pump", "gas_pump", "research_station"]

func _recompute_stats() -> void:
	var sum_o2 := 0.0
	var open_cells := 0
	for y in range(HEIGHT):
		for x in range(WIDTH):
			var i := idx(x, y)
			if not is_solid_cell(x, y) and liquid_mass[i] < 10.0:
				open_cells += 1
				if gas_el[i] == "Oxygen":
					sum_o2 += gas_mass[i]
	avg_oxygen_kg = sum_o2 / float(maxi(1, open_cells))

func get_cell_summary(x: int, y: int) -> Dictionary:
	if not in_bounds(x, y):
		return {}
	var i := idx(x, y)
	var rid: int = room_id[i]
	var r_name := ""
	var r_morale := 0
	if rid >= 0 and rid < rooms_list.size():
		r_name = String(rooms_list[rid]["name_ko"])
		r_morale = int(rooms_list[rid]["morale"])
	return {
		"x": x,
		"y": y,
		"solid_el": solid_el[i],
		"solid_mass": solid_mass[i],
		"gas_el": gas_el[i],
		"gas_mass": gas_mass[i],
		"gas_delta": gas_mass[i] - gas_prev_mass[i],
		"liquid_el": liquid_el[i] if not liquid_el[i].is_empty() else "Water",
		"liquid_mass": liquid_mass[i],
		"temp_c": temp_c[i],
		"germ_type": germ_type[i],
		"germ_count": germ_count[i],
		"room_name": r_name,
		"room_morale": r_morale,
		"building": building[i],
		"has_wire": has_wire[i] == 1,
		"has_liquid_pipe": has_liquid_pipe[i] == 1,
		"lpipe_mass": lpipe_mass[i],
		"has_gas_pipe": has_gas_pipe[i] == 1,
		"gpipe_el": gpipe_el[i],
		"gpipe_mass": gpipe_mass[i],
		"battery_j": battery_j[i],
		"h2_buffer_kg": h2_buffer_kg[i],
		"farm_growth": farm_growth[i],
		"machine_running": machine_running[i] == 1,
		"dig_order": dig_order[i] == 1,
		"build_order": build_order[i],
	}
