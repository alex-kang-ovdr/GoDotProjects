extends RefCounted
class_name OniDuplicant

var id := 0
var dupe_name := "대원"
var cell := Vector2i.ZERO
var pos := Vector2.ZERO
var suit_color := Color(0.4, 0.75, 0.98, 1.0)

var state := "IDLE" # IDLE, MOVE, DIG, BUILD, OPERATE, SLEEP
var state_ko := "대기"
var target_cell := Vector2i(-1, -1)
var job_type := "" # dig, build, operate, sleep
var path: Array[Vector2i] = []
var move_speed := 3.4 # cells/sec
var facing_left := false
var _repath_cooldown := 0.0

var breath := 100.0
var stamina := 100.0
var kcal := 4000.0
var morale := 2
var stress := 0.0
var disease := "" # "", "FoodPoisoning", "SlimeLung"
var disease_timer := 0.0
var trait_ko := "조기 기상"
var skill_level := 0
var skill_name_ko := "신입 개척자"
var xp := 80.0
var prio_dig := true
var prio_build := true
var prio_operate := true
var prio_research := true

func _init(p_id: int, p_name: String, p_cell: Vector2i, p_color: Color, p_trait := "조기 기상") -> void:
	id = p_id
	dupe_name = p_name
	cell = p_cell
	pos = Vector2(p_cell.x, p_cell.y)
	suit_color = p_color
	trait_ko = p_trait

func upgrade_skill() -> bool:
	if xp < 100.0 or skill_level >= 4:
		return false
	xp -= 100.0
	skill_level += 1
	var titles: Array[String] = ["신입 개척자", "숙련 채굴가", "수석 건설가", "천재 연구원", "우주 비행사"]
	skill_name_ko = titles[mini(skill_level, titles.size() - 1)]
	return true

func work_speed_mult() -> float:
	var sick_m := 0.72 if not disease.is_empty() else 1.0
	var stress_m := 0.85 if stress >= 60.0 else 1.0
	return (1.0 + float(skill_level) * 0.25 + clampf(float(morale) * 0.03, 0.0, 0.35)) * sick_m * stress_m

func get_disease_ko() -> String:
	if disease == "SlimeLung":
		return "점액폐"
	if disease == "FoodPoisoning":
		return "식중독"
	return "건강"

func step(world: OniWorld, dt: float) -> void:
	# 1) 호흡 시뮬레이션 (원작: O2 0.1 kg/s 소비, CO2 0.002 kg/s 배출)
	_step_breathing(world, dt)

	# 1.5) 스트레스·질병 시뮬레이션 (세균 감염·저산소·사기 부족 -> 스트레스/질병 / 의료실·마사지·휴게실 해소)
	var ci := world.idx(cell.x, cell.y)
	if world.germ_count[ci] > 28000.0 and disease.is_empty():
		var gt := world.germ_type[ci]
		if gt == "SlimeLung" or gt == "FoodPoisoning":
			disease = gt
			disease_timer = 45.0
	if not disease.is_empty():
		disease_timer = maxf(0.0, disease_timer - dt)
		if disease_timer <= 0.0:
			disease = ""
	var stress_delta := -0.35 * float(maxi(0, morale - skill_level * 2))
	if breath < 65.0:
		stress_delta += 1.6
	if not disease.is_empty():
		stress_delta += 0.9
	if world.liquid_mass[ci] > 80.0:
		stress_delta += 0.7
	if state == "HEAL":
		stress_delta = -8.5
		if not disease.is_empty():
			disease_timer = maxf(0.0, disease_timer - 9.0 * dt)
			if disease_timer <= 0.0:
				disease = ""
	elif state == "SLEEP":
		stress_delta = minf(stress_delta, -2.5)
	stress = clampf(stress + stress_delta * dt, 0.0, 100.0)

	# 2) 칼로리/스태미나 갱신 (배고프면 저장 식량에서 자동 섭취)
	kcal = maxf(0.0, kcal - (OniElements.DUPE_KCAL_PER_CYCLE / OniElements.CYCLE_SECONDS) * dt)
	if kcal < 2600.0 and world.food_kcal >= 600.0:
		var eat := minf(1200.0, minf(world.food_kcal, OniElements.DUPE_KCAL_MAX - kcal))
		world.food_kcal -= eat
		kcal += eat
	if state == "SLEEP":
		stamina = minf(100.0, stamina + 14.0 * dt)
	else:
		stamina = maxf(0.0, stamina - 0.55 * dt)

	# 중력 낙하 처리 (바닥이 파였을 때)
	if not world.can_stand_at(cell.x, cell.y) and world.is_passable(cell.x, cell.y + 1):
		cell.y += 1
		pos = Vector2(cell.x, cell.y)
		path.clear()
		state = "IDLE"
		state_ko = "낙하"
		return

	_repath_cooldown = max(0.0, _repath_cooldown - dt)

	match state:
		"IDLE":
			state_ko = "대기"
			if _repath_cooldown <= 0.0:
				_assign_next_job(world)
				_repath_cooldown = 0.35
		"MOVE":
			_step_move(world, dt)
		"DIG":
			_step_dig(world, dt)
		"BUILD":
			_step_build(world, dt)
		"OPERATE":
			_step_operate(world, dt)
		"RESEARCH":
			_step_research(world, dt)
		"SLEEP":
			state_ko = "휴식"
			if stamina >= 96.0:
				_clear_job()
		"HEAL":
			state_ko = "치료·휴게"
			stamina = minf(100.0, stamina + 8.0 * dt)
			if stress <= 5.0 and disease.is_empty():
				_clear_job()

func _step_breathing(world: OniWorld, dt: float) -> void:
	var ci := world.idx(cell.x, cell.y)
	var need_o2 := OniElements.DUPE_O2_KG_PER_S * dt
	if world.gas_el[ci] == "Oxygen" and world.gas_mass[ci] >= need_o2 * 0.25:
		var taken: float = min(world.gas_mass[ci], need_o2)
		world.gas_mass[ci] -= taken
		if world.gas_mass[ci] < 0.001:
			world.gas_mass[ci] = 0.0
			world.gas_el[ci] = "Vacuum"
		breath = min(100.0, breath + 28.0 * dt)
		# 발밑 또는 인접 빈 칸에 CO2 미량 배출
		_exhale_co2(world, OniElements.DUPE_CO2_KG_PER_S * dt)
	else:
		breath = max(0.0, breath - 12.0 * dt)

func _exhale_co2(world: OniWorld, amount: float) -> void:
	var candidates := [cell, Vector2i(cell.x, cell.y + 1), Vector2i(cell.x - 1, cell.y), Vector2i(cell.x + 1, cell.y)]
	for c in candidates:
		if not world.is_passable(c.x, c.y):
			continue
		var ci := world.idx(c.x, c.y)
		if world.liquid_mass[ci] > 10.0:
			continue
		if world.gas_el[ci] == "Vacuum" or world.gas_el[ci] == "CarbonDioxide":
			world.gas_el[ci] = "CarbonDioxide"
			world.gas_mass[ci] += amount
			return

func _clear_job() -> void:
	state = "IDLE"
	state_ko = "대기"
	job_type = ""
	target_cell = Vector2i(-1, -1)
	path.clear()

func _step_move(world: OniWorld, dt: float) -> void:
	if path.is_empty():
		_enter_job_work(world)
		return
	var next_c: Vector2i = path[0]
	if not world.is_passable(next_c.x, next_c.y):
		_clear_job()
		return
	var target_v := Vector2(next_c.x, next_c.y)
	var diff := target_v - pos
	if absf(diff.x) > 0.01:
		facing_left = diff.x < 0.0
	var dist := diff.length()
	var spd := move_speed
	# 소방봉(fire_pole) 하강 시 3배 초고속 슬라이드!
	if diff.y > 0.1 and world.in_bounds(cell.x, cell.y) and world.building[world.idx(cell.x, cell.y)] == "fire_pole":
		spd = move_speed * 3.0
	var step_d := spd * dt
	if dist <= step_d:
		pos = target_v
		cell = next_c
		path.remove_at(0)
		if path.is_empty():
			_enter_job_work(world)
	else:
		pos += diff.normalized() * step_d

func _enter_job_work(world: OniWorld) -> void:
	if job_type == "dig":
		state = "DIG"
		state_ko = "채굴"
	elif job_type == "build":
		state = "BUILD"
		state_ko = "건설"
	elif job_type == "operate":
		state = "OPERATE"
		state_ko = "발전"
	elif job_type == "research":
		state = "RESEARCH"
		state_ko = "연구"
	elif job_type == "sleep":
		state = "SLEEP"
		state_ko = "휴식"
	elif job_type == "heal":
		state = "HEAL"
		state_ko = "치료·휴게"
	else:
		_clear_job()

func _step_dig(world: OniWorld, dt: float) -> void:
	if not world.in_bounds(target_cell.x, target_cell.y):
		_clear_job()
		return
	var ti := world.idx(target_cell.x, target_cell.y)
	if world.dig_order[ti] == 0 or world.solid_el[ti].is_empty():
		_clear_job()
		return
	if abs(target_cell.x - cell.x) + abs(target_cell.y - cell.y) > 2:
		_clear_job()
		return
	var el_info := OniElements.get_element(world.solid_el[ti])
	var dig_time := maxf(0.4, float(el_info.get("dig_time", 2.0)))
	world.dig_progress[ti] += (dt * work_speed_mult()) / dig_time
	xp = minf(400.0, xp + 6.0 * dt)
	if world.dig_progress[ti] >= 1.0:
		world.complete_dig(target_cell.x, target_cell.y)
		xp = minf(400.0, xp + 18.0)
		_clear_job()

func _step_build(world: OniWorld, dt: float) -> void:
	if not world.in_bounds(target_cell.x, target_cell.y):
		_clear_job()
		return
	var ti := world.idx(target_cell.x, target_cell.y)
	var b_id := world.build_order[ti]
	if b_id.is_empty() or not world.has_materials_for(b_id):
		_clear_job()
		return
	if abs(target_cell.x - cell.x) + abs(target_cell.y - cell.y) > 2:
		_clear_job()
		return
	var bdef := OniElements.get_building(b_id)
	var build_time := maxf(0.4, float(bdef.get("build_time", 1.8)))
	world.build_progress[ti] += (dt * work_speed_mult()) / build_time
	xp = minf(400.0, xp + 6.0 * dt)
	if world.build_progress[ti] >= 1.0:
		world.complete_build(target_cell.x, target_cell.y)
		xp = minf(400.0, xp + 18.0)
		_clear_job()

func _step_operate(world: OniWorld, dt: float) -> void:
	if not world.in_bounds(target_cell.x, target_cell.y):
		_clear_job()
		return
	var ti := world.idx(target_cell.x, target_cell.y)
	if world.building[ti] != "generator":
		_clear_job()
		return
	world.gen_active[ti] = 1
	xp = minf(400.0, xp + 4.0 * dt)
	state_ko = "발전(400W)"
	# 배터리가 95% 이상 차고 소비기도 없으면 대기 복귀
	if world.total_battery_cap_j > 0.0 and world.total_battery_j >= world.total_battery_cap_j * 0.96 and world.power_consumed_w <= 0.1:
		_clear_job()

func _step_research(world: OniWorld, dt: float) -> void:
	if not world.in_bounds(target_cell.x, target_cell.y):
		_clear_job()
		return
	var ti := world.idx(target_cell.x, target_cell.y)
	if world.building[ti] != "research_station" or world.active_tech.is_empty():
		_clear_job()
		return
	world.research_active[ti] = 1
	xp = minf(400.0, xp + 5.0 * dt)
	state_ko = "연구 중"

func _assign_next_job(world: OniWorld) -> void:
	# BFS로 도달 가능한 모든 서 있을 수 있는 셀과 부모 맵 계산
	var reachable := _bfs_reachable(world)
	var parents: Dictionary = reachable["parents"]
	var dists: Dictionary = reachable["dists"]

	var best_score := 999999.0
	var best_stand := Vector2i(-1, -1)
	var best_target := Vector2i(-1, -1)
	var best_type := ""

	# 0.5) 질병 감염 또는 고스트레스(>=30%) 시 병원(환자용 침대)/마사지 테이블/주크봇 우선 방문
	if not disease.is_empty() or stress >= 30.0:
		for y in range(OniWorld.HEIGHT):
			for x in range(OniWorld.WIDTH):
				var i := world.idx(x, y)
				var b := world.building[i]
				var match_med := (not disease.is_empty() and b in ["medical_cot", "apothecary", "wash_sink"])
				var match_rel := (stress >= 30.0 and b in ["massage_table", "jukebot", "arcade_cabinet", "water_cooler"])
				if match_med or match_rel:
					var c := Vector2i(x, y)
					if dists.has(c):
						var sc := float(dists[c]) - 120.0
						if sc < best_score:
							best_score = sc
							best_stand = c
							best_target = c
							best_type = "heal"

	# 1) 야간 취침 스케줄 또는 스태미나 낮을 때 빈 침대 우선
	if best_type.is_empty() and (stamina < 28.0 or (world.is_night() and stamina < 82.0)):
		for y in range(OniWorld.HEIGHT):
			for x in range(OniWorld.WIDTH):
				var i := world.idx(x, y)
				if world.building[i] == "cot":
					var c := Vector2i(x, y)
					if dists.has(c):
						var sc := float(dists[c]) - 100.0
						if sc < best_score:
							best_score = sc
							best_stand = c
							best_target = c
							best_type = "sleep"

	# 2) 채굴·건설 지시 탐색 (대원별 우선순위 토글 반영)
	if best_type.is_empty() and (prio_dig or prio_build):
		var dirs := [Vector2i(0, 0), Vector2i(-1, 0), Vector2i(1, 0), Vector2i(0, -1), Vector2i(0, 1)]
		for y in range(OniWorld.HEIGHT):
			for x in range(OniWorld.WIDTH):
				var i := world.idx(x, y)
				var is_dig := prio_dig and world.dig_order[i] == 1 and not world.solid_el[i].is_empty()
				var b_id := world.build_order[i]
				var is_build := prio_build and not b_id.is_empty() and world.has_materials_for(b_id)
				if not is_dig and not is_build:
					continue
				var tcell := Vector2i(x, y)
				# 다른 대원이 이미 같은 타일을 작업 중이면 약간 페널티
				var claimed_penalty := 0.0
				for other in world.duplicants:
					if other != self and other.target_cell == tcell:
						claimed_penalty = 40.0
						break

				for d: Vector2i in dirs:
					var stand: Vector2i = tcell + d
					if is_dig and d == Vector2i.ZERO:
						continue
					if not dists.has(stand):
						continue
					var sc := float(dists[stand]) + claimed_penalty + (0.0 if is_build else 1.5)
					if sc < best_score:
						best_score = sc
						best_stand = stand
						best_target = tcell
						best_type = "build" if is_build else "dig"

	# 3) 수동 발전기 작동 (전력 필요하거나 배터리 70% 미만일 때)
	if best_type.is_empty() and prio_operate:
		var need_power := (world.total_battery_cap_j > 0.0 and world.total_battery_j < world.total_battery_cap_j * 0.72) or (world.total_battery_cap_j <= 0.0)
		if need_power:
			for y in range(OniWorld.HEIGHT):
				for x in range(OniWorld.WIDTH):
					var i := world.idx(x, y)
					if world.building[i] == "generator":
						var c := Vector2i(x, y)
						if not dists.has(c):
							continue
						var busy := false
						for other in world.duplicants:
							if other != self and other.target_cell == c and other.job_type == "operate":
								busy = true
								break
						if busy:
							continue
						var sc := float(dists[c])
						if sc < best_score:
							best_score = sc
							best_stand = c
							best_target = c
							best_type = "operate"

	# 4) 연구 작업대 작동 (활성 연구가 있고 흙이 있을 때)
	if best_type.is_empty() and prio_research and not world.active_tech.is_empty() and float(world.inventory.get("Dirt", 0.0)) >= 5.0:
		for y in range(OniWorld.HEIGHT):
			for x in range(OniWorld.WIDTH):
				var i := world.idx(x, y)
				if world.building[i] == "research_station":
					var c := Vector2i(x, y)
					if not dists.has(c):
						continue
					var busy := false
					for other in world.duplicants:
						if other != self and other.target_cell == c and other.job_type == "research":
							busy = true
							break
					if busy:
						continue
					var sc := float(dists[c])
					if sc < best_score:
						best_score = sc
						best_stand = c
						best_target = c
						best_type = "research"

	if best_type.is_empty():
		return

	job_type = best_type
	target_cell = best_target
	path = _reconstruct_path(parents, best_stand)
	if path.is_empty():
		_enter_job_work(world)
	else:
		state = "MOVE"
		state_ko = "이동"

func _bfs_reachable(world: OniWorld) -> Dictionary:
	var dists: Dictionary = {}
	var parents: Dictionary = {}
	var queue: Array[Vector2i] = [cell]
	dists[cell] = 0

	while not queue.is_empty():
		var cur: Vector2i = queue.pop_front()
		var cur_d: int = dists[cur]
		if cur_d > 48:
			continue
		var nexts := _get_move_neighbors(world, cur)
		for n in nexts:
			if not dists.has(n):
				dists[n] = cur_d + 1
				parents[n] = cur
				queue.append(n)
	return {"dists": dists, "parents": parents}

func _get_move_neighbors(world: OniWorld, c: Vector2i) -> Array[Vector2i]:
	var res: Array[Vector2i] = []
	# 좌우 평지 이동 + 1칸 등반/하강
	for dx: int in [-1, 1]:
		var nx: int = c.x + dx
		if world.can_stand_at(nx, c.y):
			res.append(Vector2i(nx, c.y))
		elif world.is_passable(c.x, c.y - 1) and world.can_stand_at(nx, c.y - 1):
			res.append(Vector2i(nx, c.y - 1))
		elif world.is_passable(nx, c.y) and world.can_stand_at(nx, c.y + 1):
			res.append(Vector2i(nx, c.y + 1))
	# 사다리 상하 이동
	if world.is_climbable(c.x, c.y) and world.can_stand_at(c.x, c.y - 1):
		res.append(Vector2i(c.x, c.y - 1))
	if world.can_stand_at(c.x, c.y + 1) and (world.is_climbable(c.x, c.y) or world.is_climbable(c.x, c.y + 1)):
		res.append(Vector2i(c.x, c.y + 1))
	return res

func _reconstruct_path(parents: Dictionary, goal: Vector2i) -> Array[Vector2i]:
	var rev: Array[Vector2i] = []
	var cur := goal
	while cur != cell and parents.has(cur):
		rev.append(cur)
		cur = parents[cur]
	rev.reverse()
	return rev
