extends RefCounted
class_name OniWorld

const WIDTH := 48
const HEIGHT := 32
const TILE_SIZE := 32

var seed_value := 73
var sim_time := 0.0
var cycle := 1
var gas_tick_count := 0
var conduit_tick_count := 0
var _gas_accum := 0.0
var _conduit_accum := 0.0
var _heat_accum := 0.0
var _liquid_accum := 0.0

var solid_el: PackedStringArray = PackedStringArray()
var solid_mass: PackedFloat32Array = PackedFloat32Array()
var gas_el: PackedStringArray = PackedStringArray()
var gas_mass: PackedFloat32Array = PackedFloat32Array()
var gas_prev_mass: PackedFloat32Array = PackedFloat32Array()
var liquid_mass: PackedFloat32Array = PackedFloat32Array()
var temp_c: PackedFloat32Array = PackedFloat32Array()

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

var on_dig_completed: Callable
var on_build_completed: Callable

func _init(p_seed := 73) -> void:
	seed_value = p_seed
	generate(seed_value)

func idx(x: int, y: int) -> int:
	return y * WIDTH + x

func in_bounds(x: int, y: int) -> bool:
	return x >= 0 and x < WIDTH and y >= 0 and y < HEIGHT

func generate(p_seed := 73) -> void:
	OniElements.ensure_loaded()
	seed_value = p_seed
	var rng := RandomNumberGenerator.new()
	rng.seed = p_seed

	var total := WIDTH * HEIGHT
	solid_el.resize(total)
	solid_mass.resize(total)
	gas_el.resize(total)
	gas_mass.resize(total)
	gas_prev_mass.resize(total)
	liquid_mass.resize(total)
	temp_c.resize(total)
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
			liquid_mass[i] = 0.0
			gas_el[i] = "Vacuum"
			gas_mass[i] = 0.0
			gas_prev_mass[i] = 0.0

			if x == 0 or x == WIDTH - 1 or y == 0 or y == HEIGHT - 1:
				_set_solid(i, "Unobtanium" if OniElements.elements.has("Unobtanium") else "Granite", 21.0)
				continue

			# 서쪽: 원작 Frozen 바이옴 (Ice, Snow, DirtyIce, Wolframite, Granite)
			var dist_ice := Vector2(x - 7, y - 14).length()
			if dist_ice < 6.2 + rng.randf_range(-0.8, 0.8):
				var fr := rng.randf()
				var fel := "Ice" if fr < 0.48 else ("Snow" if fr < 0.68 else ("Wolframite" if fr < 0.84 else "Granite"))
				_set_solid(i, fel, -14.0 + rng.randf_range(-5.0, 4.0))
				continue

			# 남동쪽: 원작 Magma 심부 + Katairite 단열 경계
			var dist_hot := Vector2(x - 40, y - 26).length()
			if dist_hot < 4.2:
				_set_solid(i, "Obsidian" if rng.randf() < 0.45 else "IgneousRock", 132.0 + rng.randf_range(-4.0, 12.0))
				continue
			elif dist_hot < 5.6:
				_set_solid(i, "Katairite", 24.0)
				continue

			# 동쪽 상단: 원작 HotMarsh(늪) 바이옴 (SlimeMold, Clay, GoldAmalgam, SedimentaryRock)
			if x >= 35 and y <= 17:
				var mr := rng.randf()
				var mel := "SlimeMold" if mr < 0.36 else ("Clay" if mr < 0.62 else ("GoldAmalgam" if mr < 0.80 else "SedimentaryRock"))
				_set_solid(i, mel, 32.0 + rng.randf_range(-2.0, 3.0))
				continue

			# 북쪽: 원작 Jungle(부식) 바이옴 (IgneousRock, IronOre, BleachStone, Carbon)
			if y <= 7:
				var jr := rng.randf()
				var jel := "IgneousRock" if jr < 0.45 else ("IronOre" if jr < 0.70 else ("BleachStone" if jr < 0.82 else "Carbon"))
				_set_solid(i, jel, 35.0 + rng.randf_range(-2.0, 4.0))
				continue

			# 중앙: 원작 Sedimentary(사암) 바이옴
			var roll := rng.randf()
			var el := "SandStone"
			if roll < 0.14:
				el = "Algae"
			elif roll < 0.27:
				el = "Cuprite"
			elif roll < 0.48:
				el = "Dirt"
			elif roll < 0.56 and y > 18:
				el = "Carbon"
			elif roll < 0.60:
				el = "OxyRock"
			elif roll < 0.66 and y > 22:
				el = "IgneousRock"
			_set_solid(i, el, 21.5 + rng.randf_range(-1.5, 1.5))

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

	# 우측 물 웅덩이 (x: 31..35, y: 17..19)
	for y in range(17, 20):
		for x in range(31, 36):
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			if y == 17:
				gas_el[i] = "Oxygen"
				gas_mass[i] = 0.9
				gas_prev_mass[i] = 0.9
			else:
				liquid_mass[i] = 950.0
				gas_el[i] = "Vacuum"
				gas_mass[i] = 0.0
			temp_c[i] = 20.5

	# 북쪽 수소 포켓
	for y in range(8, 10):
		for x in range(22, 26):
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			gas_el[i] = "Hydrogen"
			gas_mass[i] = 0.65
			gas_prev_mass[i] = 0.65
			temp_c[i] = 23.0

	# 하단 이산화탄소 포켓
	for y in range(21, 23):
		for x in range(21, 27):
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			gas_el[i] = "CarbonDioxide"
			gas_mass[i] = 0.85
			gas_prev_mass[i] = 0.85
			temp_c[i] = 24.0

	# 남동쪽 증기 분출실 (x: 39..41, y: 25..26, 155°C 증기)
	for y in range(25, 27):
		for x in range(39, 42):
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			gas_el[i] = "Steam"
			gas_mass[i] = 2.0
			gas_prev_mass[i] = 2.0
			temp_c[i] = 155.0

	# 대원 3명 생성
	duplicants.clear()
	var names: Array[String] = ["민수", "서연", "지호"]
	var colors: Array[Color] = [
		Color(0.35, 0.72, 0.98, 1.0),
		Color(0.95, 0.56, 0.42, 1.0),
		Color(0.54, 0.86, 0.52, 1.0),
	]
	var spawn_xs: Array[int] = [21, 22, 25]
	for d_idx in range(3):
		var dupe := OniDuplicant.new(d_idx, names[d_idx], Vector2i(spawn_xs[d_idx], 16), colors[d_idx])
		duplicants.append(dupe)

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

func _step_liquids() -> void:
	for y in range(HEIGHT - 2, 0, -1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			var m := liquid_mass[i]
			if m < 1.0 or is_solid_cell(x, y):
				continue
			if not is_solid_cell(x, y + 1):
				var bi := idx(x, y + 1)
				var cap: float = maxf(0.0, 1000.0 - liquid_mass[bi])
				if cap > 1.0:
					var flow: float = minf(m, cap)
					liquid_mass[i] -= flow
					liquid_mass[bi] += flow
					if liquid_mass[bi] > 50.0:
						gas_el[bi] = "Vacuum"
						gas_mass[bi] = 0.0
					continue
			var dirs: Array[int] = [-1, 1]
			for dx: int in dirs:
				if not is_solid_cell(x + dx, y):
					var si := idx(x + dx, y)
					var diff := liquid_mass[i] - liquid_mass[si]
					if diff > 10.0:
						var flow := diff * 0.25
						liquid_mass[i] -= flow
						liquid_mass[si] += flow

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
			# 액체 물 -> 기화(>100.35°C) / 결빙(<-1.65°C)
			elif liquid_mass[i] > 5.0:
				var w_info := OniElements.get_element("Water")
				var wh: float = float(w_info.get("high_c", 99.35))
				var wl: float = float(w_info.get("low_c", -0.65))
				if t > wh + 1.0:
					var boil := minf(liquid_mass[i], 2.0)
					liquid_mass[i] -= boil
					if gas_el[i] == "Vacuum" or gas_el[i] == "Steam":
						gas_el[i] = "Steam"
						gas_mass[i] += boil
				elif liquid_mass[i] > 200.0 and t < wl - 1.0 and building[i].is_empty():
					solid_el[i] = "Ice"
					solid_mass[i] = liquid_mass[i]
					liquid_mass[i] = 0.0
			# 기체 -> 저온 응결 (Steam->Water 등)
			elif gas_el[i] != "Vacuum" and gas_mass[i] > 0.05:
				var g_info := OniElements.get_element(gas_el[i])
				var lc: Variant = g_info.get("low_c", null)
				var lt: Variant = g_info.get("low_target", null)
				if lc != null and lt != null and t < float(lc) - 1.0:
					if String(lt) == "Water":
						liquid_mass[i] += gas_mass[i]
						gas_mass[i] = 0.0
						gas_el[i] = "Vacuum"

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
				elif b in ["diffuser", "electrolyzer", "liquid_pump", "gas_pump", "research_station"]:
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
	return b in ["generator", "coal_gen", "hydrogen_gen", "steam_turbine", "battery", "diffuser", "electrolyzer", "liquid_pump", "gas_pump", "research_station"]

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
	return {
		"x": x,
		"y": y,
		"solid_el": solid_el[i],
		"solid_mass": solid_mass[i],
		"gas_el": gas_el[i],
		"gas_mass": gas_mass[i],
		"gas_delta": gas_mass[i] - gas_prev_mass[i],
		"liquid_mass": liquid_mass[i],
		"temp_c": temp_c[i],
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
