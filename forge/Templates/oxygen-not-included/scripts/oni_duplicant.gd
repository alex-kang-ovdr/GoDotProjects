extends RefCounted
class_name OniDuplicant

var id := 0
var dupe_name := "대원"
var cell := Vector2i.ZERO
var pos := Vector2.ZERO
var suit_color := Color(0.4, 0.75, 0.98, 1.0)

var state := "IDLE" # IDLE, MOVE, DIG, BUILD, DECONSTRUCT, MOP, REPAIR, OPERATE, RESEARCH, SLEEP, HEAL, TOILET, WASH, RELAX
var state_ko := "대기"
var target_cell := Vector2i(-1, -1)
var job_type := "" # dig, build, deconstruct, mop, repair, operate, research, sleep, heal, toilet, wash, relax
var path: Array[Vector2i] = []
var move_speed := 3.4 # cells/sec
var facing_left := false
var _repath_cooldown := 0.0
var _work_timer := 0.0

var hp := 100.0
var thermal_status := "" # "", "SCALDING", "CHILLY"
var breath := 100.0
var stamina := 100.0
var kcal := 4000.0
var bladder := 20.0
var needs_wash := false
var morale := 2
var avg_decor := 20.0
var decor_morale := 0
var shower_morale := 0
var shower_buff_timer := 0.0
var rec_morale := 0
var rec_buff_timer := 0.0
var warm_touch_timer := 0.0
var eardrums_popped := false
var wet_status := "" # "", "SOGGY", "SOPPING"
var stress := 0.0
var rad_dose := 0.0
var overjoyed := false
var stress_breakdowns := 0
var _trait_work_mult := 1.0
var disease := "" # "", "FoodPoisoning", "SlimeLung", "RadiationSickness"
var disease_timer := 0.0
var wearing_suit := false
var wearing_jetsuit := false
var suit_o2 := 100.0
var trait_ko := "조기 기상"
var skill_level := 0
var skill_name_ko := "신입 개척자"
var xp := 80.0
var prio_dig := true
var prio_build := true
var prio_operate := true
var prio_research := true
var prio_deconstruct := true
var prio_mop := true

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

func get_morale_expectation() -> int:
	return OniElements.get_morale_expectation(skill_level)

func can_dig_element(el: String) -> bool:
	if el.is_empty():
		return false
	var req := OniElements.get_required_mining_tier(el)
	if req >= 99:
		return false
	if req >= 2:
		return skill_level >= req
	return true

func _gain_xp(amount: float) -> void:
	var xm := float(OniElements.get_trait_effect(trait_ko).get("xp_mult", 1.0))
	xp = minf(400.0, xp + amount * xm)

func work_speed_mult() -> float:
	var sick_m := 0.75 if disease == "RadiationSickness" else (0.72 if not disease.is_empty() else 1.0)
	var stress_m := 0.85 if stress >= 60.0 else 1.0
	var suit_m := 1.45 if wearing_jetsuit else (1.30 if wearing_suit else 1.0)
	var joy_m := 1.35 if overjoyed else 1.0
	return (1.0 + float(skill_level) * 0.25 + clampf(float(morale) * 0.03, 0.0, 0.35)) * sick_m * stress_m * suit_m * joy_m * _trait_work_mult

func get_disease_ko() -> String:
	if disease == "SlimeLung":
		return "점액폐"
	if disease == "FoodPoisoning":
		return "식중독"
	if disease == "RadiationSickness":
		return "방사능 병"
	return "건강"

func step(world: OniWorld, dt: float) -> void:
	# 0) Assembly-CSharp.dll 특성(Trait) 시간대별 작업속도/스트레스 효과 갱신
	var teff := OniElements.get_trait_effect(trait_ko)
	var cfrac := fmod(world.sim_time, OniElements.CYCLE_SECONDS) / OniElements.CYCLE_SECONDS
	_trait_work_mult = 1.0
	if teff.has("morning_work_mult") and cfrac < 0.25:
		_trait_work_mult *= float(teff["morning_work_mult"])
	if teff.has("night_work_mult") and cfrac >= 0.75:
		_trait_work_mult *= float(teff["night_work_mult"])

	# 1) 호흡 시뮬레이션 (원작: O2 0.1 kg/s 소비, 잠수부의 폐 -25%, CO2 0.002 kg/s 배출)
	_step_breathing(world, dt)

	# 1.5) 특수복 착용 · 방사선 피폭(RadiationMonitor) · 질병 · 스트레스 · 열생리학
	var ci := world.idx(cell.x, cell.y)
	var b_here := world.building[ci]
	if b_here in ["jetsuit_dock", "jetsuit_checkpoint"]:
		if not wearing_jetsuit:
			wearing_jetsuit = true
			wearing_suit = true
			if world.on_suit_equipped.is_valid():
				world.on_suit_equipped.call(cell)
		if b_here == "jetsuit_dock" and world.dock_o2_kg[ci] > 0.5:
			var draw := minf(world.dock_o2_kg[ci], maxf(0.0, (100.0 - suit_o2) * 0.2))
			world.dock_o2_kg[ci] -= draw
			suit_o2 = minf(100.0, suit_o2 + draw * 5.0)
		else:
			suit_o2 = 100.0
	elif b_here in ["suit_dock", "suit_checkpoint", "oxygen_dock"]:
		if not wearing_suit:
			wearing_suit = true
			if world.on_suit_equipped.is_valid():
				world.on_suit_equipped.call(cell)
		if b_here == "suit_dock" and world.dock_o2_kg[ci] > 0.5:
			var draw := minf(world.dock_o2_kg[ci], maxf(0.0, (100.0 - suit_o2) * 0.2))
			world.dock_o2_kg[ci] -= draw
			suit_o2 = minf(100.0, suit_o2 + draw * 5.0)
		else:
			suit_o2 = 100.0
	if wearing_suit:
		if world.gas_el[ci] == "Oxygen" and world.gas_mass[ci] > 0.6:
			suit_o2 = minf(100.0, suit_o2 + 12.0 * dt)
		else:
			suit_o2 = maxf(0.0, suit_o2 - 1.2 * dt)
		breath = 100.0

	# Assembly-CSharp.dll RadiationMonitor: 피폭량 누적 (특수복 66% 차폐) -> 100rad 이상 방사능 병
	var rad_here := world.rads[ci]
	if rad_here > 1.0:
		var rad_shield := 0.34 if wearing_suit else 1.0
		rad_dose = minf(900.0, rad_dose + (rad_here * rad_shield * dt) / 60.0)
	else:
		rad_dose = maxf(0.0, rad_dose - 0.15 * dt)
	if rad_dose >= 100.0 and disease.is_empty():
		disease = "RadiationSickness"
		disease_timer = 180.0

	if not wearing_suit and world.germ_count[ci] > 28000.0 and disease.is_empty():
		var gt := world.germ_type[ci]
		if gt == "SlimeLung" or (gt == "FoodPoisoning" and not bool(teff.get("food_poison_immune", false))):
			disease = gt
			disease_timer = 45.0
	if not disease.is_empty():
		disease_timer = maxf(0.0, disease_timer - dt)
		if disease_timer <= 0.0 and (disease != "RadiationSickness" or rad_dose < 100.0):
			disease = ""

	# 기대 사기(TUNING.ROLES) · 장식 사기(DecorMonitor) · 샤워/휴게/WarmTouch 버프 · 환경 디버프
	if shower_buff_timer > 0.0:
		shower_buff_timer = maxf(0.0, shower_buff_timer - dt)
		if shower_buff_timer <= 0.0:
			shower_morale = 0
	if rec_buff_timer > 0.0:
		rec_buff_timer = maxf(0.0, rec_buff_timer - dt)
		if rec_buff_timer <= 0.0:
			rec_morale = 0
	if warm_touch_timer > 0.0:
		warm_touch_timer = maxf(0.0, warm_touch_timer - dt)
	var env_s := OniElements.get_env_spec()
	avg_decor = lerpf(avg_decor, clampf(world.decor_val[ci], -60.0, 140.0), clampf(dt * 0.25, 0.0, 1.0))
	decor_morale = OniElements.get_decor_morale_bonus(avg_decor)
	morale = 1 + world.colony_morale_bonus + decor_morale + shower_morale + rec_morale
	var exp_morale := get_morale_expectation()
	overjoyed = morale >= exp_morale + OniElements.get_overjoyed_surplus() and stress < 30.0
	var morale_diff := morale - exp_morale
	var stress_delta := (-0.35 * float(morale_diff)) if morale_diff >= 0 else (0.65 * float(-morale_diff))
	if teff.has("morning_stress_delta") and cfrac < 0.25:
		stress_delta += float(teff["morning_stress_delta"])
	if breath < 65.0 and not wearing_suit:
		stress_delta += 1.6
	if breath <= 0.5 and not wearing_suit:
		hp = maxf(1.0, hp - 5.0 * dt)
		stress_delta += 3.0
	if kcal <= 1.0:
		hp = maxf(1.0, hp - 4.0 * dt)
		stress_delta += 2.5
	if not disease.is_empty():
		stress_delta += 1.2 if disease == "RadiationSickness" else 0.9
	# Assembly-CSharp.dll PoppedEardrums(>4kg) & SoggyFeet(>15kg)/SoppingWet(>300kg)
	eardrums_popped = (not wearing_suit) and world.gas_mass[ci] > float(env_s.get("eardrums_pressure_kg", 4.0))
	if eardrums_popped:
		stress_delta += 2.2
	var lm_here := world.liquid_mass[ci]
	if not wearing_suit and lm_here > float(env_s.get("sopping_wet_kg", 300.0)):
		wet_status = "SOPPING"
		stress_delta += 1.8
	elif not wearing_suit and lm_here > float(env_s.get("soggy_feet_kg", 15.0)):
		wet_status = "SOGGY"
		stress_delta += 0.9
	else:
		wet_status = ""
	# Assembly-CSharp.dll ScaldingMonitor(>72°C) & HypothermiaMonitor(<0°C) 열생리학
	var t_here := world.temp_c[ci]
	if not wearing_suit and t_here > OniElements.get_scalding_c():
		thermal_status = "SCALDING"
		hp = maxf(1.0, hp - 3.5 * dt)
		stress_delta += 9.5
	elif not wearing_suit and warm_touch_timer <= 0.0 and t_here < OniElements.get_hypothermia_c():
		thermal_status = "CHILLY"
		stress_delta += 1.5
	else:
		thermal_status = ""
		hp = minf(100.0, hp + (6.0 if state == "HEAL" else 0.5) * dt)
	if state == "HEAL":
		stress_delta = -8.5
		# 제약기 제작 알약(MedicinePill / RadPill) 즉효 복용 치료
		if (disease == "FoodPoisoning" or disease == "SlimeLung") and float(world.inventory.get("MedicinePill", 0.0)) >= 1.0:
			world.inventory["MedicinePill"] = float(world.inventory["MedicinePill"]) - 1.0
			disease = ""
			disease_timer = 0.0
		elif (disease == "RadiationSickness" or rad_dose >= 60.0) and float(world.inventory.get("RadPill", 0.0)) >= 1.0:
			world.inventory["RadPill"] = float(world.inventory["RadPill"]) - 1.0
			rad_dose = maxf(0.0, rad_dose - 100.0)
			if disease == "RadiationSickness" and rad_dose < 100.0:
				disease = ""
				disease_timer = 0.0
		if not disease.is_empty():
			disease_timer = maxf(0.0, disease_timer - 9.0 * dt)
			if disease_timer <= 0.0 and (disease != "RadiationSickness" or rad_dose < 100.0):
				disease = ""
	elif state == "SLEEP":
		stress_delta = minf(stress_delta, -2.5)
	stress = clampf(stress + stress_delta * dt, 0.0, 100.0)

	# Assembly-CSharp.dll 스트레스 붕괴(100% -> 울음 발작: 오염수 3kg 배출 후 60% 복귀)
	var bd_thr := float(OniElements.csharp_traits.get("stress_breakdown_threshold", 100.0))
	if stress >= bd_thr:
		stress = float(OniElements.csharp_traits.get("stress_reset_after_breakdown", 60.0))
		stress_breakdowns += 1
		if not world.is_solid_cell(cell.x, cell.y) and (world.liquid_mass[ci] < 1.0 or world.liquid_el[ci] == "DirtyWater" or world.liquid_el[ci].is_empty()):
			world.liquid_el[ci] = "DirtyWater"
			world.liquid_mass[ci] = minf(1000.0, world.liquid_mass[ci] + 3.0)
		_clear_job()

	# 2) 칼로리/스태미나/방광 갱신 (원작 주기당 방광 +100%, 100% 도달 시 실수->오염수 6.7kg + 식중독균)
	kcal = maxf(0.0, kcal - (OniElements.DUPE_KCAL_PER_CYCLE / OniElements.CYCLE_SECONDS) * dt)
	if kcal < 2600.0 and world.food_kcal >= 600.0:
		var eat := minf(1200.0, minf(world.food_kcal, OniElements.DUPE_KCAL_MAX - kcal))
		world.food_kcal -= eat
		kcal += eat
	if state == "SLEEP":
		stamina = minf(100.0, stamina + 14.0 * dt)
	else:
		stamina = maxf(0.0, stamina - 0.55 * dt)
	if state != "TOILET":
		bladder = clampf(bladder + 0.17 * dt, 0.0, 100.0)
		if bladder >= 100.0:
			bladder = 0.0
			stress = clampf(stress + 18.0, 0.0, 100.0)
			if not world.is_solid_cell(cell.x, cell.y) and (world.liquid_mass[ci] < 1.0 or world.liquid_el[ci] == "DirtyWater" or world.liquid_el[ci].is_empty()):
				world.liquid_el[ci] = "DirtyWater"
				world.liquid_mass[ci] = minf(1000.0, world.liquid_mass[ci] + 6.7)
				world.germ_type[ci] = "FoodPoisoning"
				world.germ_count[ci] = minf(250000.0, world.germ_count[ci] + 35000.0)

	# 중력 낙하 처리 (바닥이 파였을 때 — 제트복 착용 중에는 공중 부유 가능!)
	if not wearing_jetsuit and not world.can_stand_at(cell.x, cell.y) and world.is_passable(cell.x, cell.y + 1):
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
		"DECONSTRUCT":
			_step_deconstruct(world, dt)
		"MOP":
			_step_mop(world, dt)
		"REPAIR":
			_step_repair(world, dt)
		"OPERATE":
			_step_operate(world, dt)
		"RESEARCH":
			_step_research(world, dt)
		"TOILET":
			_step_toilet(world, dt)
		"WASH":
			_step_wash(world, dt)
		"RELAX":
			_step_relax(world, dt)
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
	var o2_mult := float(OniElements.get_trait_effect(trait_ko).get("o2_mult", 1.0))
	var need_o2 := OniElements.DUPE_O2_KG_PER_S * o2_mult * dt
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
	var wet_m := 0.75 if wet_status == "SOPPING" else (0.85 if wet_status == "SOGGY" else 1.0)
	var spd := move_speed * (1.45 if wearing_jetsuit else 1.0) * (0.78 if thermal_status == "CHILLY" else 1.0) * wet_m
	# 수송 튜브(travel_tube) 이동: 입구 충전(10kJ/발사) 소비 시 5배 초고속 공압 이동!
	if world.in_bounds(cell.x, cell.y):
		var cur_i := world.idx(cell.x, cell.y)
		var cur_b := world.building[cur_i]
		if cur_b == "travel_tube_entrance":
			var j_launch := float(OniElements.get_utility_spec("travel_tube").get("joules_per_launch", 10000.0))
			if world.tube_charge_j[cur_i] >= j_launch:
				world.tube_charge_j[cur_i] -= j_launch
				spd = move_speed * 5.0
			else:
				spd = move_speed * 1.5
		elif cur_b == "travel_tube":
			spd = move_speed * 5.0
		elif world.in_bounds(cell.x, cell.y + 1) and world.building[world.idx(cell.x, cell.y + 1)] == "metal_tile":
			spd = move_speed * 1.4
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
	_work_timer = 0.0
	if job_type == "dig":
		state = "DIG"
		state_ko = "채굴"
	elif job_type == "build":
		state = "BUILD"
		state_ko = "건설"
	elif job_type == "deconstruct":
		state = "DECONSTRUCT"
		state_ko = "해체"
	elif job_type == "mop":
		state = "MOP"
		state_ko = "닦기"
	elif job_type == "repair":
		state = "REPAIR"
		state_ko = "수리"
	elif job_type == "operate":
		state = "OPERATE"
		state_ko = "발전"
	elif job_type == "research":
		state = "RESEARCH"
		state_ko = "연구"
	elif job_type == "toilet":
		state = "TOILET"
		state_ko = "화장실"
	elif job_type == "wash":
		state = "WASH"
		state_ko = "손 씻기"
	elif job_type == "relax":
		state = "RELAX"
		state_ko = "휴게·오락"
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
	if world.dig_order[ti] == 0 or world.solid_el[ti].is_empty() or not can_dig_element(world.solid_el[ti]):
		_clear_job()
		return
	if abs(target_cell.x - cell.x) + abs(target_cell.y - cell.y) > 2:
		_clear_job()
		return
	var el_info := OniElements.get_element(world.solid_el[ti])
	var dig_time := maxf(0.4, float(el_info.get("dig_time", 2.0)))
	var dig_m := float(OniElements.get_trait_effect(trait_ko).get("dig_mult", 1.0))
	var req_t := OniElements.get_required_mining_tier(world.solid_el[ti])
	var hard_m := 0.45 if (req_t == 1 and skill_level < 1) else 1.0
	world.dig_progress[ti] += (dt * work_speed_mult() * dig_m * hard_m) / dig_time
	_gain_xp(6.0 * dt)
	if world.dig_progress[ti] >= 1.0:
		world.complete_dig(target_cell.x, target_cell.y)
		_gain_xp(18.0)
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
	_gain_xp(6.0 * dt)
	if world.build_progress[ti] >= 1.0:
		world.complete_build(target_cell.x, target_cell.y)
		_gain_xp(18.0)
		_clear_job()

func _step_deconstruct(world: OniWorld, dt: float) -> void:
	if not world.in_bounds(target_cell.x, target_cell.y):
		_clear_job()
		return
	var ti := world.idx(target_cell.x, target_cell.y)
	if world.deconstruct_order[ti] == 0:
		_clear_job()
		return
	if abs(target_cell.x - cell.x) + abs(target_cell.y - cell.y) > 2:
		_clear_job()
		return
	world.deconstruct_progress[ti] += (dt * work_speed_mult()) / 1.4
	_gain_xp(6.0 * dt)
	if world.deconstruct_progress[ti] >= 1.0:
		world.complete_deconstruct(target_cell.x, target_cell.y)
		_gain_xp(14.0)
		_clear_job()

func _step_mop(world: OniWorld, dt: float) -> void:
	if not world.in_bounds(target_cell.x, target_cell.y):
		_clear_job()
		return
	var ti := world.idx(target_cell.x, target_cell.y)
	if world.mop_order[ti] == 0 or world.liquid_mass[ti] < 1.0:
		world.mop_order[ti] = 0
		world.mop_progress[ti] = 0.0
		_clear_job()
		return
	if abs(target_cell.x - cell.x) + abs(target_cell.y - cell.y) > 2:
		_clear_job()
		return
	world.mop_progress[ti] += (dt * work_speed_mult()) / 1.5
	_gain_xp(5.0 * dt)
	if world.mop_progress[ti] >= 1.0:
		world.complete_mop(target_cell.x, target_cell.y)
		_gain_xp(12.0)
		_clear_job()

func _step_repair(world: OniWorld, dt: float) -> void:
	if not world.in_bounds(target_cell.x, target_cell.y):
		_clear_job()
		return
	var ti := world.idx(target_cell.x, target_cell.y)
	var need_b := not world.building[ti].is_empty() and world.building_hp[ti] < 99.5
	var need_lp := world.has_liquid_pipe[ti] == 1 and world.lpipe_hp[ti] < 99.5
	var need_gp := world.has_gas_pipe[ti] == 1 and world.gpipe_hp[ti] < 99.5
	if not need_b and not need_lp and not need_gp:
		_clear_job()
		return
	if abs(target_cell.x - cell.x) + abs(target_cell.y - cell.y) > 2:
		_clear_job()
		return
	state_ko = "설비·배관 수리"
	world.repair_building(target_cell.x, target_cell.y, 28.0 * work_speed_mult() * dt)
	_gain_xp(6.0 * dt)
	var still_b := not world.building[ti].is_empty() and world.building_hp[ti] < 99.5
	var still_lp := world.has_liquid_pipe[ti] == 1 and world.lpipe_hp[ti] < 99.5
	var still_gp := world.has_gas_pipe[ti] == 1 and world.gpipe_hp[ti] < 99.5
	if not still_b and not still_lp and not still_gp:
		_gain_xp(12.0)
		_clear_job()

func _step_toilet(world: OniWorld, dt: float) -> void:
	if not world.in_bounds(target_cell.x, target_cell.y):
		_clear_job()
		return
	var ti := world.idx(target_cell.x, target_cell.y)
	var b := world.building[ti]
	if b != "flush_toilet" and b != "outhouse":
		_clear_job()
		return
	state_ko = "화장실"
	bladder = maxf(0.0, bladder - 38.0 * dt)
	if bladder <= 1.0:
		bladder = 0.0
		needs_wash = true
		# Assembly-CSharp.dll RadiationSickness: 화장실 이용 시 체내 방사선 -100 rad 배출!
		var flush_r := float(OniElements.get_disease_cs("RadiationSickness").get("toilet_rad_flush", 100.0))
		rad_dose = maxf(0.0, rad_dose - flush_r)
		if disease == "RadiationSickness" and rad_dose < 100.0:
			disease = ""
			disease_timer = 0.0
		if b == "flush_toilet" and world.has_liquid_pipe[ti] == 1:
			# Assembly-CSharp.dll FlushToiletConfig: 청수 5.0kg 소비 -> 오염수 11.7kg (+6.7kg 수분 증식!)
			var ft_sp := OniElements.get_utility_spec("flush_toilet")
			var w_use := float(ft_sp.get("water_usage_kg", 5.0))
			var dw_out := float(ft_sp.get("dirty_water_out_kg", 11.7))
			var out_kg := 6.7
			if world.lpipe_el[ti] == "Water" and world.lpipe_mass[ti] >= w_use:
				world.lpipe_mass[ti] = maxf(0.0, world.lpipe_mass[ti] - w_use)
				if world.lpipe_mass[ti] < 0.05:
					world.lpipe_mass[ti] = 0.0
					world.lpipe_el[ti] = ""
				out_kg = dw_out
			var rem := out_kg
			var out_targets: Array[int] = [ti]
			for d_p: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				var npx: int = target_cell.x + d_p.x
				var npy: int = target_cell.y + d_p.y
				if world.in_bounds(npx, npy) and world.has_liquid_pipe[world.idx(npx, npy)] == 1:
					out_targets.append(world.idx(npx, npy))
			for oti: int in out_targets:
				if rem <= 0.05:
					break
				if world.lpipe_mass[oti] < 0.05 or world.lpipe_el[oti].is_empty() or world.lpipe_el[oti] == "DirtyWater":
					var add_dw := minf(rem, OniElements.LIQUID_PIPE_MAX_KG - world.lpipe_mass[oti])
					if add_dw > 0.05:
						world.lpipe_el[oti] = "DirtyWater"
						world.lpipe_mass[oti] += add_dw
						world.lpipe_temp[oti] = 37.0
						rem -= add_dw
		else:
			world.germ_type[ti] = "FoodPoisoning"
			world.germ_count[ti] = minf(120000.0, world.germ_count[ti] + 15000.0)
		_clear_job()

func _step_wash(world: OniWorld, dt: float) -> void:
	if not world.in_bounds(target_cell.x, target_cell.y):
		_clear_job()
		return
	var ti := world.idx(target_cell.x, target_cell.y)
	var b := world.building[ti]
	if not (b in ["wash_sink", "wash_basin", "shower"]):
		_clear_job()
		return
	state_ko = "샤워" if b == "shower" else "손 씻기"
	_work_timer += dt
	world.germ_count[ti] = maxf(0.0, world.germ_count[ti] - 25000.0 * dt)
	if _work_timer >= 1.4:
		needs_wash = false
		stress = maxf(0.0, stress - (6.0 if b == "shower" else 3.0))
		if b == "shower":
			# Assembly-CSharp.dll ShowerConfig: 젖은 발/흠뻑 젖음 제거 + 샤워 사기 +3 버프
			wet_status = ""
			shower_morale = int(OniElements.get_utility_spec("shower").get("morale_bonus", 3))
			shower_buff_timer = 600.0
			if world.has_liquid_pipe[ti] == 1 and world.lpipe_el[ti] == "Water" and world.lpipe_mass[ti] >= 1.0:
				world.lpipe_el[ti] = "DirtyWater"
		_clear_job()

func _step_relax(world: OniWorld, dt: float) -> void:
	state_ko = "휴게·오락"
	_work_timer += dt
	stress = maxf(0.0, stress - 6.0 * dt)
	stamina = minf(100.0, stamina + 6.0 * dt)
	if _work_timer >= 4.0:
		if world.in_bounds(target_cell.x, target_cell.y):
			var b := world.building[world.idx(target_cell.x, target_cell.y)]
			var rspec := OniElements.get_recreation_spec(b)
			if not rspec.is_empty():
				var gain_m := int(rspec.get("morale", 2))
				if b == "beach_chair":
					var lit := world.get_cell_light_lux(target_cell.x, target_cell.y) >= 200.0
					gain_m = int(rspec.get("morale_lit", 8)) if lit else int(rspec.get("morale_unlit", 5))
				rec_morale = maxi(rec_morale, gain_m)
				rec_buff_timer = float(rspec.get("duration_s", 600.0))
				if bool(rspec.get("warm_touch", false)):
					warm_touch_timer = float(rspec.get("warm_touch_s", 1800.0))
		if world.get_schedule_phase() != "DOWNTIME" or stress <= 2.0:
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
	_gain_xp(4.0 * dt)
	state_ko = "발전(400W)"
	# 배터리가 95% 이상 차고 소비기도 없으면 대기 복귀
	if world.total_battery_cap_j > 0.0 and world.total_battery_j >= world.total_battery_cap_j * 0.96 and world.power_consumed_w <= 0.1:
		_clear_job()

func _step_research(world: OniWorld, dt: float) -> void:
	if not world.in_bounds(target_cell.x, target_cell.y):
		_clear_job()
		return
	var ti := world.idx(target_cell.x, target_cell.y)
	var b := world.building[ti]
	if not (b in ["research_station", "super_computer", "planetarium"]) or world.active_tech.is_empty():
		_clear_job()
		return
	if b == "planetarium" and world.data_banks <= 0:
		_clear_job()
		return
	world.research_active[ti] = 1
	_gain_xp((7.5 if b != "research_station" else 5.0) * dt)
	state_ko = "고급 연구" if b == "super_computer" else ("우주 연구" if b == "planetarium" else "연구 중")

func _assign_next_job(world: OniWorld) -> void:
	# BFS로 도달 가능한 모든 서 있을 수 있는 셀과 부모 맵 계산
	var reachable := _bfs_reachable(world)
	var parents: Dictionary = reachable["parents"]
	var dists: Dictionary = reachable["dists"]

	var best_score := 999999.0
	var best_stand := Vector2i(-1, -1)
	var best_target := Vector2i(-1, -1)
	var best_type := ""
	var sched := world.get_schedule_phase()

	# 0a) 화장실 사용 직후 손 씻기(세면대/싱크대/샤워실) 최우선
	if needs_wash:
		for y in range(OniWorld.HEIGHT):
			for x in range(OniWorld.WIDTH):
				var i := world.idx(x, y)
				if world.building[i] in ["wash_sink", "wash_basin", "shower"]:
					var c := Vector2i(x, y)
					if dists.has(c):
						var sc := float(dists[c]) - 200.0
						if sc < best_score:
							best_score = sc
							best_stand = c
							best_target = c
							best_type = "wash"
		if best_type.is_empty():
			needs_wash = false

	# 0b) 방광 긴급(>=80%) 또는 세면 스케줄(>=35%) 시 화장실(수세식 변기/재래식) 방문
	if best_type.is_empty() and (bladder >= 80.0 or (sched == "BATHTIME" and bladder >= 35.0)):
		for y in range(OniWorld.HEIGHT):
			for x in range(OniWorld.WIDTH):
				var i := world.idx(x, y)
				if world.building[i] in ["flush_toilet", "outhouse"]:
					var c := Vector2i(x, y)
					if dists.has(c):
						var sc := float(dists[c]) - 160.0
						if sc < best_score:
							best_score = sc
							best_stand = c
							best_target = c
							best_type = "toilet"

	# 0c) 질병 감염, 피폭(>=60rad), 화상/체력 저하(<75%), 또는 고스트레스(>=30%) 시 병원/휴게 설비 우선 방문
	if best_type.is_empty() and (not disease.is_empty() or rad_dose >= 60.0 or hp < 75.0 or stress >= 30.0):
		for y in range(OniWorld.HEIGHT):
			for x in range(OniWorld.WIDTH):
				var i := world.idx(x, y)
				var b := world.building[i]
				var match_med := ((not disease.is_empty() or rad_dose >= 60.0 or hp < 75.0) and b in ["medical_cot", "apothecary", "wash_sink"])
				var match_rel := (stress >= 30.0 and b in ["massage_table", "jukebot", "arcade_cabinet", "water_cooler", "sauna", "hottub", "beach_chair"])
				if match_med or match_rel:
					var c := Vector2i(x, y)
					if dists.has(c):
						var sc := float(dists[c]) - 120.0
						if sc < best_score:
							best_score = sc
							best_stand = c
							best_target = c
							best_type = "heal"

	# 0e) 과열·파손 설비(building_hp < 95) 및 상변화 파손 배관(lpipe_hp/gpipe_hp < 95) 자동 수리 작업
	if best_type.is_empty() and prio_build:
		var rdirs := [Vector2i(0, 0), Vector2i(-1, 0), Vector2i(1, 0), Vector2i(0, -1), Vector2i(0, 1)]
		for y in range(OniWorld.HEIGHT):
			for x in range(OniWorld.WIDTH):
				var i := world.idx(x, y)
				var dmg_b := not world.building[i].is_empty() and world.building_hp[i] < 95.0
				var dmg_p := (world.has_liquid_pipe[i] == 1 and world.lpipe_hp[i] < 95.0) or (world.has_gas_pipe[i] == 1 and world.gpipe_hp[i] < 95.0)
				if dmg_b or dmg_p:
					var tcell := Vector2i(x, y)
					for d: Vector2i in rdirs:
						var stand: Vector2i = tcell + d
						if dists.has(stand):
							var sc := float(dists[stand]) - 50.0
							if sc < best_score:
								best_score = sc
								best_stand = stand
								best_target = tcell
								best_type = "repair"

	# 0d) 휴게 시간(DOWNTIME) 스케줄 오락·휴게 시설 방문
	if best_type.is_empty() and sched == "DOWNTIME" and stress >= 5.0:
		for y in range(OniWorld.HEIGHT):
			for x in range(OniWorld.WIDTH):
				var i := world.idx(x, y)
				if world.building[i] in ["jukebot", "arcade_cabinet", "beach_chair", "sauna", "hottub", "water_cooler"]:
					var c := Vector2i(x, y)
					if dists.has(c):
						var sc := float(dists[c]) - 90.0
						if sc < best_score:
							best_score = sc
							best_stand = c
							best_target = c
							best_type = "relax"

	# 1) 야간 취침 스케줄 또는 스태미나 낮을 때 빈 침대 우선
	if best_type.is_empty() and (stamina < 28.0 or (sched == "SLEEP" and stamina < 82.0)):
		for y in range(OniWorld.HEIGHT):
			for x in range(OniWorld.WIDTH):
				var i := world.idx(x, y)
				if world.building[i] == "cot" or world.building[i] == "medical_cot":
					var c := Vector2i(x, y)
					if dists.has(c):
						var sc := float(dists[c]) - (100.0 if world.building[i] == "cot" else 85.0)
						if sc < best_score:
							best_score = sc
							best_stand = c
							best_target = c
							best_type = "sleep"

	# 2) 통합 타일 우선순위(1~9) 작업 탐색: 채굴 · 건설 · 해체 · 닦기
	if best_type.is_empty() and (prio_dig or prio_build or prio_deconstruct or prio_mop):
		var dirs := [Vector2i(0, 0), Vector2i(-1, 0), Vector2i(1, 0), Vector2i(0, -1), Vector2i(0, 1)]
		for y in range(OniWorld.HEIGHT):
			for x in range(OniWorld.WIDTH):
				var i := world.idx(x, y)
				var is_dig := prio_dig and world.dig_order[i] == 1 and not world.solid_el[i].is_empty() and can_dig_element(world.solid_el[i])
				var b_id := world.build_order[i]
				var is_build := prio_build and not b_id.is_empty() and world.has_materials_for(b_id)
				var is_dec := prio_deconstruct and world.deconstruct_order[i] == 1
				var is_mop := prio_mop and world.mop_order[i] == 1 and world.liquid_mass[i] >= 1.0
				if not is_dig and not is_build and not is_dec and not is_mop:
					continue
				var tcell := Vector2i(x, y)
				var tprio := clampi(int(world.tile_priority[i]), 1, 9)
				var prio_weight := float(10 - tprio) * 100.0
				var claimed_penalty := 0.0
				for other in world.duplicants:
					if other != self and other.target_cell == tcell:
						claimed_penalty = 40.0
						break

				var etype := "build" if is_build else ("deconstruct" if is_dec else ("mop" if is_mop else "dig"))
				for d: Vector2i in dirs:
					var stand: Vector2i = tcell + d
					if etype == "dig" and d == Vector2i.ZERO:
						continue
					if not dists.has(stand):
						continue
					var sc := prio_weight + float(dists[stand]) + claimed_penalty
					if sc < best_score:
						best_score = sc
						best_stand = stand
						best_target = tcell
						best_type = etype

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

	# 4) 연구 시설 작동 (가상 플라네타륨 > 슈퍼 컴퓨터 > 기본 연구 작업대 우선)
	if best_type.is_empty() and prio_research and not world.active_tech.is_empty():
		var has_dirt := float(world.inventory.get("Dirt", 0.0)) >= 5.0
		for y in range(OniWorld.HEIGHT):
			for x in range(OniWorld.WIDTH):
				var i := world.idx(x, y)
				var b := world.building[i]
				var valid_r := (b == "planetarium" and world.data_banks > 0) or (b == "super_computer" and has_dirt) or (b == "research_station" and has_dirt)
				if not valid_r:
					continue
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
				var tier_bonus := -20.0 if b == "planetarium" else (-10.0 if b == "super_computer" else 0.0)
				var sc := float(dists[c]) + tier_bonus
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
	# 제트복(Jet Suit) 착용 시 360도 공중 자유 비행 경로탐색!
	if wearing_jetsuit:
		for d: Vector2i in [Vector2i(-1, 0), Vector2i(1, 0), Vector2i(0, -1), Vector2i(0, 1)]:
			var nx: int = c.x + d.x
			var ny: int = c.y + d.y
			if world.is_passable(nx, ny):
				res.append(Vector2i(nx, ny))
		return res
	# 좌우 평지 이동 + 1칸 등반/하강
	for dx: int in [-1, 1]:
		var nx: int = c.x + dx
		if world.can_stand_at(nx, c.y):
			res.append(Vector2i(nx, c.y))
		elif world.is_passable(c.x, c.y - 1) and world.can_stand_at(nx, c.y - 1):
			res.append(Vector2i(nx, c.y - 1))
		elif world.is_passable(nx, c.y) and world.can_stand_at(nx, c.y + 1):
			res.append(Vector2i(nx, c.y + 1))
	# 사다리·소방봉·수송 튜브 상하 이동
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
