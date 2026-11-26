extends RefCounted
class_name OniWorld

const WIDTH := 48
const HEIGHT := 32
const TILE_SIZE := 32

var seed_value := 73
var sim_time := 0.0
var cycle := 1
var gas_tick_count := 0
var _gas_accum := 0.0
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
var battery_j: PackedFloat32Array = PackedFloat32Array()
var gen_active: PackedByteArray = PackedByteArray()
var diffuser_running: PackedByteArray = PackedByteArray()

var dig_order: PackedByteArray = PackedByteArray()
var dig_progress: PackedFloat32Array = PackedFloat32Array()
var build_order: PackedStringArray = PackedStringArray()
var build_progress: PackedFloat32Array = PackedFloat32Array()

var inventory: Dictionary = {
	"SandStone": 800.0,
	"Cuprite": 600.0,
	"Algae": 400.0,
	"Dirt": 400.0,
	"Carbon": 200.0,
	"IgneousRock": 0.0,
	"Ice": 0.0,
}

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
	battery_j.resize(total)
	gen_active.resize(total)
	diffuser_running.resize(total)
	dig_order.resize(total)
	dig_progress.resize(total)
	build_order.resize(total)
	build_progress.resize(total)

	sim_time = 0.0
	cycle = 1
	gas_tick_count = 0
	_gas_accum = 0.0
	_heat_accum = 0.0
	_liquid_accum = 0.0

	inventory = {
		"SandStone": 800.0,
		"Cuprite": 600.0,
		"Algae": 400.0,
		"Dirt": 400.0,
		"Carbon": 200.0,
		"IgneousRock": 0.0,
		"Ice": 0.0,
	}

	for y in range(HEIGHT):
		for x in range(WIDTH):
			var i := idx(x, y)
			building[i] = ""
			has_wire[i] = 0
			battery_j[i] = 0.0
			gen_active[i] = 0
			diffuser_running[i] = 0
			dig_order[i] = 0
			dig_progress[i] = 0.0
			build_order[i] = ""
			build_progress[i] = 0.0
			liquid_mass[i] = 0.0
			gas_el[i] = "Vacuum"
			gas_mass[i] = 0.0
			gas_prev_mass[i] = 0.0

			# 외곽 기반암
			if x == 0 or x == WIDTH - 1 or y == 0 or y == HEIGHT - 1:
				_set_solid(i, "Granite", 21.0)
				continue

			# 서쪽 얼음 지대
			var dist_ice := Vector2(x - 7, y - 14).length()
			if dist_ice < 5.5 + rng.randf_range(-0.8, 0.8):
				_set_solid(i, "Ice", -12.0 + rng.randf_range(-3.0, 2.0))
				continue

			# 남동쪽 고온 심부 + 심연석 단열 경계
			var dist_hot := Vector2(x - 40, y - 26).length()
			if dist_hot < 4.2:
				_set_solid(i, "IgneousRock", 118.0 + rng.randf_range(-5.0, 12.0))
				continue
			elif dist_hot < 5.6:
				_set_solid(i, "Katairite", 24.0)
				continue

			# 기본 사암/토양 + 광맥 분포
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
			elif roll < 0.62 and y > 22:
				el = "IgneousRock"
			_set_solid(i, el, 21.5 + rng.randf_range(-1.5, 1.5))

	# 중앙 시작 공실 파내기 (x: 19..28, y: 13..16)
	for y in range(13, 17):
		for x in range(19, 29):
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			gas_el[i] = "Oxygen"
			gas_mass[i] = 1.25
			gas_prev_mass[i] = 1.25
			temp_c[i] = 22.0

	# 시작 바닥 타일 (y = 17, x: 20..27)
	for x in range(20, 28):
		var i := idx(x, 17)
		solid_el[i] = ""
		solid_mass[i] = 0.0
		building[i] = "tile"
		temp_c[i] = 22.0

	# 인쇄기 (Printing Pod) (23, 16) 기준 2x2
	building[idx(23, 16)] = "pod"
	building[idx(24, 16)] = "pod"
	building[idx(23, 15)] = "pod"
	building[idx(24, 15)] = "pod"

	# 우측 소형 물 웅덩이 (x: 31..35, y: 17..19)
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

	# 북쪽 소형 수소 포켓 (x: 22..25, y: 8..9)
	for y in range(8, 10):
		for x in range(22, 26):
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			gas_el[i] = "Hydrogen"
			gas_mass[i] = 0.65
			gas_prev_mass[i] = 0.65
			temp_c[i] = 23.0

	# 하단 이산화탄소 포켓 (x: 21..26, y: 21..22)
	for y in range(21, 23):
		for x in range(21, 27):
			var i := idx(x, y)
			solid_el[i] = ""
			solid_mass[i] = 0.0
			gas_el[i] = "CarbonDioxide"
			gas_mass[i] = 0.85
			gas_prev_mass[i] = 0.85
			temp_c[i] = 24.0

	# 대원 3명 생성
	duplicants.clear()
	var names := ["민수", "서연", "지호"]
	var colors := [
		Color(0.35, 0.72, 0.98, 1.0),
		Color(0.95, 0.56, 0.42, 1.0),
		Color(0.54, 0.86, 0.52, 1.0),
	]
	var spawn_xs := [21, 22, 25]
	for d_idx in range(3):
		var dupe := OniDuplicant.new(d_idx, names[d_idx], Vector2i(spawn_xs[d_idx], 16), colors[d_idx])
		duplicants.append(dupe)

	_recompute_stats()

func _set_solid(i: int, el: String, p_temp: float) -> void:
	var info := OniElements.get_element(el)
	solid_el[i] = el
	solid_mass[i] = float(info.get("default_mass", 1000.0))
	temp_c[i] = p_temp

func is_solid_cell(x: int, y: int) -> bool:
	if not in_bounds(x, y):
		return true
	var i := idx(x, y)
	if not solid_el[i].is_empty():
		return true
	if building[i] == "tile":
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
	var bdef := OniElements.get_building(b_id)
	if bdef.is_empty():
		return false
	var i := idx(x, y)

	if String(bdef.get("layer", "")) == "wire":
		if has_wire[i] == 1 or build_order[i] == "wire":
			return false
		if building[i] == "pod":
			return false
		build_order[i] = "wire"
		build_progress[i] = 0.0
		return true

	# 일반 건물: 빈 공간이어야 함
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
	inventory[el] = max(0.0, float(inventory.get(el, 0.0)) - cost)

	if String(bdef.get("layer", "")) == "wire":
		has_wire[i] = 1
	else:
		if b_id == "tile":
			# 타일 건설 시 기존 기체를 인접 빈 칸으로 원자적 밀어내기
			_displace_gas_out(x, y)
		building[i] = b_id
		if b_id == "battery":
			battery_j[i] = 1500.0
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
	var dirs := [Vector2i(0, -1), Vector2i(-1, 0), Vector2i(1, 0), Vector2i(0, 1)]
	for d in dirs:
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

	# 수동 발전기 작동 플래그 초기화 후 대원 업데이트
	for i in range(WIDTH * HEIGHT):
		gen_active[i] = 0

	for dupe in duplicants:
		dupe.step(self, dt)

	_step_power_and_machines(dt)

	_gas_accum += dt
	while _gas_accum >= OniElements.GAS_TICK_DT:
		_gas_accum -= OniElements.GAS_TICK_DT
		step_gas_tick()

	_liquid_accum += dt
	if _liquid_accum >= 0.25:
		_liquid_accum = 0.0
		_step_liquids()

	_heat_accum += dt
	if _heat_accum >= 0.5:
		_heat_accum = 0.0
		_step_heat(0.5)

	_recompute_stats()

func step_gas_tick() -> void:
	gas_tick_count += 1
	var total := WIDTH * HEIGHT
	for i in range(total):
		gas_prev_mass[i] = gas_mass[i]

	var delta_mass := PackedFloat32Array()
	delta_mass.resize(total)

	# 1) 같은 기체 확산 및 진공 유입
	for y in range(1, HEIGHT - 1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			if is_solid_cell(x, y) or liquid_mass[i] > 10.0:
				continue
			var el := gas_el[i]
			var m := gas_mass[i]
			if el == "Vacuum" or m < 0.002:
				continue

			var neighbors := [idx(x + 1, y), idx(x - 1, y), idx(x, y - 1), idx(x, y + 1)]
			var ncoords := [Vector2i(x + 1, y), Vector2i(x - 1, y), Vector2i(x, y - 1), Vector2i(x, y + 1)]
			for k in range(4):
				var nc: Vector2i = ncoords[k]
				if is_solid_cell(nc.x, nc.y):
					continue
				var ni: int = neighbors[k]
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
			gas_mass[i] = max(0.0, gas_mass[i] + delta_mass[i])
			if gas_mass[i] < 0.001:
				gas_mass[i] = 0.0
				gas_el[i] = "Vacuum"

	# 2) 몰질량 기반 수직 밀도 분리 (가벼운 기체 상승, 무거운 기체 하강)
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
				# 위쪽이 더 무거우면 아래쪽 가벼운 기체와 위치 교환
				gas_el[top_i] = bot_el
				gas_el[bot_i] = top_el
				var tm := gas_mass[top_i]
				gas_mass[top_i] = gas_mass[bot_i]
				gas_mass[bot_i] = tm

	_recompute_stats()

func _step_liquids() -> void:
	for y in range(HEIGHT - 2, 0, -1):
		for x in range(1, WIDTH - 1):
			var i := idx(x, y)
			var m := liquid_mass[i]
			if m < 1.0 or is_solid_cell(x, y):
				continue
			# 아래로 낙하
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
			# 좌우 평탄화
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
			for nc: Vector2i in [Vector2i(x + 1, y), Vector2i(x, y + 1)]:
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

func _cell_conductivity(i: int) -> float:
	if not solid_el[i].is_empty():
		return float(OniElements.get_element(solid_el[i]).get("tc", 1.0))
	if building[i] == "tile":
		return 2.9
	if liquid_mass[i] > 1.0:
		return 0.609
	if gas_mass[i] > 0.005:
		return float(OniElements.get_element(gas_el[i]).get("tc", 0.024))
	return 0.0

func _step_power_and_machines(dt: float) -> void:
	var total := WIDTH * HEIGHT
	for i in range(total):
		diffuser_running[i] = 0

	power_produced_w = 0.0
	power_consumed_w = 0.0
	total_battery_j = 0.0
	total_battery_cap_j = 0.0

	var visited := PackedByteArray()
	visited.resize(total)

	for y in range(HEIGHT):
		for x in range(WIDTH):
			var start_i := idx(x, y)
			if visited[start_i] == 1 or not _is_power_node(start_i):
				continue

			# 연결된 전력망 BFS
			var net: Array[int] = []
			var queue: Array[Vector2i] = [Vector2i(x, y)]
			visited[start_i] = 1
			while not queue.is_empty():
				var cur: Vector2i = queue.pop_front()
				var ci := idx(cur.x, cur.y)
				net.append(ci)
				for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
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
			var diffusers: Array[int] = []

			for ci in net:
				var b := building[ci]
				if b == "generator" and gen_active[ci] == 1:
					net_gen_w += OniElements.MANUAL_GEN_POWER_W
				elif b == "battery":
					battery_j[ci] = max(0.0, battery_j[ci] - OniElements.BATTERY_LEAK_J_PER_S * dt)
					bats.append(ci)
					net_bat_j += battery_j[ci]
					total_battery_cap_j += OniElements.BATTERY_CAPACITY_J
				elif b == "diffuser":
					diffusers.append(ci)

			power_produced_w += net_gen_w
			var available_j := net_gen_w * dt + net_bat_j
			var used_j := 0.0

			for ci in diffusers:
				var need_j := OniElements.DIFFUSER_POWER_W * dt
				var need_algae := OniElements.DIFFUSER_ALGAE_KG_PER_S * dt
				var cur_mass := gas_mass[ci]
				var can_emit := (gas_el[ci] == "Vacuum" or gas_el[ci] == "Oxygen") and cur_mass < OniElements.DIFFUSER_MAX_PRESSURE_KG
				if can_emit and available_j - used_j >= need_j and float(inventory.get("Algae", 0.0)) >= need_algae:
					used_j += need_j
					power_consumed_w += OniElements.DIFFUSER_POWER_W
					inventory["Algae"] = max(0.0, float(inventory["Algae"]) - need_algae)
					gas_el[ci] = "Oxygen"
					gas_mass[ci] += OniElements.DIFFUSER_O2_KG_PER_S * dt
					temp_c[ci] = lerpf(temp_c[ci], OniElements.DIFFUSER_OUT_TEMP_C, 0.12)
					diffuser_running[ci] = 1

			var net_delta_j := net_gen_w * dt - used_j
			if not bats.is_empty():
				var per_bat := net_delta_j / float(bats.size())
				for bi in bats:
					battery_j[bi] = clampf(battery_j[bi] + per_bat, 0.0, OniElements.BATTERY_CAPACITY_J)
					total_battery_j += battery_j[bi]

func _is_power_node(i: int) -> bool:
	if has_wire[i] == 1:
		return true
	var b := building[i]
	return b == "generator" or b == "battery" or b == "diffuser"

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
	avg_oxygen_kg = sum_o2 / float(max(1, open_cells))

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
		"battery_j": battery_j[i],
		"diffuser_running": diffuser_running[i] == 1,
		"dig_order": dig_order[i] == 1,
		"build_order": build_order[i],
	}
