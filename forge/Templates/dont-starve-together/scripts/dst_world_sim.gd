class_name DSTWorldSim
extends RefCounted

## Don't Starve Together 순수 시뮬레이션 코어 (Headless 테스트 및 런타임 공용).
## 16세그 하루 · 20일 달 주기 · 4계절 · 기온/체온/습기 · 이중 정신력(광기/계몽) ·
## 유령/부활 페널티 · 인벤토리/제작/부패 · 요리냄비 · 7스트레스 농사 · 전투/평면 보스 AI.

var db: DSTDatabase
var rng: RandomNumberGenerator = RandomNumberGenerator.new()

# 시계 / 달 / 계절 상태
var day: int = 1
var season_index: int = 0 # 0=autumn, 1=winter, 2=spring, 3=summer
var day_in_season: int = 1
var time_in_day: float = 0.0 # 0..480
var phase: String = "day" # day / dusk / night
var moon_phase: String = "new"
var world_temperature: float = 28.0
var is_raining: bool = false
var rain_timer: float = 0.0
var time_scale: float = 1.0

# 플레이어 생존 상태
var character_id: String = "wilson"
var player_pos: Vector2 = Vector2.ZERO
var player_vel: Vector2 = Vector2.ZERO
var player_facing: Vector2 = Vector2(1.0, 0.0)

var max_health: float = 150.0
var health: float = 150.0
var health_penalty: float = 0.0 # 0.0 .. 0.75
var max_hunger: float = 150.0
var hunger: float = 150.0
var max_sanity: float = 200.0
var sanity: float = 200.0
var sanity_mode: int = 0 # 0 = INSANITY, 1 = LUNACY
var is_sane: bool = true # INSANITY에서는 정상, LUNACY에서도 비계몽 정상

var temperature: float = 35.0
var moisture: float = 0.0
var is_wet: bool = false
var is_ghost: bool = false
var world_reset_countdown: float = -1.0
var dark_exposure_timer: float = 0.0
var attack_cooldown: float = 0.0
var attack_anim_timer: float = 0.0

# 인벤토리 & 장비 (4슬롯: hands, head, body, beard) & 프로토타입
var inventory: Dictionary = {} # item_id -> count (단순화하되 15종 슬롯 한도 검사)
var food_freshness: Dictionary = {} # item_id -> 0.0..1.0
var equip_hands: String = ""
var equip_head: Dictionary = {} # { id, absorption, durability, max_durability, planar_defense }
var equip_body: Dictionary = {}
var learned_recipes: Dictionary = {}

# 월드 엔티티 (자원, 구조물, 생물, 농작물)
var resources: Array = [] # { id, kind, pos: Vector2, hp, max_hp, respawn_timer }
var structures: Array = [] # { id, kind, pos: Vector2, fuel, max_fuel, cook_timer, cook_result }
var creatures: Array = [] # { id, kind, pos: Vector2, hp, max_hp, damage, planar_damage, player_dmg_pct, attack_period, cd, speed, range, planar_entity, boss, aggro }
var farm_plots: Array = [] # { id, pos: Vector2, crop, stage, timer, stress_points, hydrated, fertilized, tended, oversized, harvestable }
var event_log: Array = []

var _next_uid: int = 1
var _hunger_accum: float = 0.0
var _perish_accum: float = 0.0
var _hound_timer: float = 240.0
var _total_elapsed: float = 0.0


func init_world(database: DSTDatabase, seed_value: int = 20261126, char_id: String = "wilson") -> void:
	db = database
	rng.seed = seed_value
	_next_uid = 1
	day = 1
	season_index = 0
	day_in_season = 1
	time_in_day = 25.0
	phase = "day"
	is_raining = false
	rain_timer = 140.0
	time_scale = 1.0
	_total_elapsed = 0.0
	_hunger_accum = 0.0
	_perish_accum = 0.0
	_hound_timer = 320.0
	event_log.clear()

	select_character(char_id)
	player_pos = Vector2.ZERO
	player_vel = Vector2.ZERO
	temperature = float(db.data["survival"]["starting_temp"])
	moisture = 0.0
	is_wet = false
	is_ghost = false
	world_reset_countdown = -1.0
	dark_exposure_timer = 0.0
	sanity_mode = 0
	is_sane = true

	inventory = {
		"twigs": 4,
		"flint": 4,
		"cutgrass": 6,
		"log": 4,
		"berries": 4,
		"carrot": 2,
		"meat": 2,
		"egg": 2,
		"rocks": 4,
		"goldnugget": 2,
		"pigskin": 1,
		"purebrilliance": 2,
	}
	food_freshness = {
		"berries": 1.0,
		"carrot": 1.0,
		"meat": 1.0,
		"egg": 1.0,
	}
	equip_hands = ""
	equip_head = {}
	equip_body = {}
	learned_recipes.clear()

	resources.clear()
	structures.clear()
	creatures.clear()
	farm_plots.clear()

	_populate_world()
	_update_clock_and_moon()
	push_log("콘스탄트 세계에 도착했습니다. (Day 1, Autumn)")


func select_character(char_id: String) -> void:
	var chars: Dictionary = db.data.get("characters", {})
	if not chars.has(char_id):
		char_id = "wilson"
	character_id = char_id
	var c: Dictionary = chars[char_id]
	max_health = float(c["health"])
	health = min(health, get_max_health_with_penalty()) if health > 0.0 and not is_ghost else max_health
	if health <= 0.0 or not is_ghost:
		health = get_max_health_with_penalty()
	max_hunger = float(c["hunger"])
	hunger = max_hunger
	max_sanity = float(c["sanity"])
	sanity = max_sanity
	push_log("캐릭터 선택: %s (HP %.0f / HU %.0f / SA %.0f)" % [str(c["name"]), max_health, max_hunger, max_sanity])


func get_season_name() -> String:
	var order: Array = db.data["seasons"]["order"]
	return str(order[season_index % order.size()])


func get_season_segs() -> Dictionary:
	return db.data["seasons"]["clock_segs"][get_season_name()]


func get_max_health_with_penalty() -> float:
	return max_health * (1.0 - health_penalty)


func is_insane() -> bool:
	return sanity_mode == 0 and not is_sane


func is_enlightened() -> bool:
	return sanity_mode == 1 and not is_sane


func get_biome_at(pos: Vector2) -> String:
	if pos.length() > 54.0:
		return "ocean"
	if pos.x > 26.0 and pos.y < -18.0:
		return "moon_island"
	if pos.x < -16.0 and pos.y < -10.0:
		return "rocky"
	if pos.x < -12.0 and pos.y > 12.0:
		return "forest"
	if pos.x > 14.0 and pos.y > 10.0:
		return "savanna"
	return "grass"


func push_log(msg: String) -> void:
	event_log.append("[D%d %s] %s" % [day, phase.to_upper(), msg])
	if event_log.size() > 14:
		event_log.pop_front()


func _populate_world() -> void:
	# 초기 모닥불 자리 근처의 자원 배치
	var kinds: Array = [
		{"kind": "evergreen", "count": 26, "hp": 3, "min_r": 7.0, "max_r": 46.0},
		{"kind": "boulder", "count": 18, "hp": 3, "min_r": 8.0, "max_r": 46.0},
		{"kind": "sapling", "count": 20, "hp": 1, "min_r": 5.0, "max_r": 42.0},
		{"kind": "grass_tuft", "count": 22, "hp": 1, "min_r": 5.0, "max_r": 42.0},
		{"kind": "berrybush", "count": 14, "hp": 1, "min_r": 6.0, "max_r": 40.0},
		{"kind": "lunar_crystal", "count": 6, "hp": 4, "min_r": 32.0, "max_r": 48.0},
	]
	for spec in kinds:
		for i in range(int(spec["count"])):
			var pos: Vector2
			if str(spec["kind"]) == "lunar_crystal":
				pos = Vector2(rng.randf_range(28.0, 44.0), rng.randf_range(-38.0, -20.0))
			else:
				var ang: float = rng.randf_range(0.0, TAU)
				var rad: float = rng.randf_range(float(spec["min_r"]), float(spec["max_r"]))
				pos = Vector2(cos(ang), sin(ang)) * rad
			resources.append({
				"id": _next_uid,
				"kind": str(spec["kind"]),
				"pos": pos,
				"hp": int(spec["hp"]),
				"max_hp": int(spec["hp"]),
				"respawn_timer": 0.0,
			})
			_next_uid += 1

	# 초기 거미 4마리 배치 (외곽)
	for i in range(4):
		var ang: float = float(i) * (TAU / 4.0) + 0.5
		spawn_creature("spider", Vector2(cos(ang), sin(ang)) * 22.0)


func spawn_creature(kind: String, pos: Vector2) -> Dictionary:
	var cdefs: Dictionary = db.data.get("creatures", {})
	if not cdefs.has(kind):
		return {}
	var d: Dictionary = cdefs[kind]
	var ent: Dictionary = {
		"id": _next_uid,
		"kind": kind,
		"name": str(d["name"]),
		"pos": pos,
		"hp": float(d["health"]),
		"max_hp": float(d["health"]),
		"damage": float(d["damage"]),
		"planar_damage": float(d.get("planar_damage", 0.0)),
		"player_dmg_pct": float(d.get("player_dmg_pct", 1.0)),
		"attack_period": float(d["attack_period"]),
		"cd": 0.6,
		"speed": float(d["speed"]),
		"range": float(d["range"]),
		"planar_entity": bool(d.get("planar_entity", false)),
		"boss": bool(d.get("boss", false)),
		"loot": d.get("loot", {}),
		"aggro": bool(d.get("boss", false)),
	}
	_next_uid += 1
	creatures.append(ent)
	if ent["boss"]:
		push_log("거대 보스 출현: %s (HP %.0f)" % [str(ent["name"]), float(ent["max_hp"])])
	return ent


func step(dt: float, move_input: Vector2 = Vector2.ZERO) -> void:
	var sim_dt: float = dt * time_scale
	_total_elapsed += sim_dt
	attack_cooldown = max(0.0, attack_cooldown - sim_dt)
	attack_anim_timer = max(0.0, attack_anim_timer - dt)

	# 1. 시계 / 달 / 계절 진행
	var total_day: float = float(db.data["clock"]["total_day_time"])
	time_in_day += sim_dt
	while time_in_day >= total_day:
		time_in_day -= total_day
		_advance_day()
	_update_clock_and_moon()

	# 2. 이동 및 경계 (바다 진입 제한)
	var move_speed: float = 6.0 # WILSON_RUN_SPEED = 6
	if not equip_body.is_empty():
		var adef: Dictionary = db.data["armors"].get(str(equip_body.get("id", "")), {})
		move_speed *= float(adef.get("speed_mult", 1.0))
	if is_ghost:
		move_speed = 7.5
	if move_input.length_squared() > 0.001:
		var dir: Vector2 = move_input.normalized()
		player_facing = dir
		var next_pos: Vector2 = player_pos + dir * move_speed * sim_dt
		if next_pos.length() <= 53.0:
			player_pos = next_pos
		player_vel = dir * move_speed
	else:
		player_vel = Vector2.ZERO

	# 3. 달섬 진입 시 달 계몽(LUNACY) 모드 자동 전환
	var biome: String = get_biome_at(player_pos)
	set_sanity_mode(1 if biome == "moon_island" else 0)

	# 4. 구조물 연료 / 조리 업데이트
	var near_fire_power: float = _update_structures(sim_dt)

	# 5. 유령 상태 vs 생존 상태 업데이트
	if is_ghost:
		if world_reset_countdown > 0.0:
			world_reset_countdown -= sim_dt
			if world_reset_countdown <= 0.0:
				push_log("전원 사망 120초 경과 — 세계가 초기화됩니다!")
				world_reset_countdown = 0.0
	else:
		_update_environment_and_stats(sim_dt, near_fire_power)

	# 6. 자원 재생, 부패, 농사, 생물 AI
	_update_resources_and_farms(sim_dt)
	_update_perishables(sim_dt)
	_update_creatures(sim_dt)


func _advance_day() -> void:
	day += 1
	day_in_season += 1
	var sname: String = get_season_name()
	var slen: int = int(db.data["seasons"]["lengths"][sname])
	if day_in_season > slen:
		day_in_season = 1
		season_index = (season_index + 1) % 4
		push_log("계절 전환: %s 시작! (Day %d)" % [get_season_name().to_upper(), day])


func _update_clock_and_moon() -> void:
	var seg_time: float = float(db.data["clock"]["seg_time"])
	var segs: Dictionary = get_season_segs()
	var day_end: float = float(segs["day"]) * seg_time
	var dusk_end: float = day_end + float(segs["dusk"]) * seg_time
	var old_phase: String = phase
	if time_in_day < day_end:
		phase = "day"
	elif time_in_day < dusk_end:
		phase = "dusk"
	else:
		phase = "night"
	if old_phase != phase:
		push_log("시간대 전환: %s" % phase.to_upper())

	var mcycle: Array = db.data["clock"]["moon_phase_cycle"]
	moon_phase = str(mcycle[(day - 1) % mcycle.size()])

	var sname: String = get_season_name()
	var base_t: float = float(db.data["seasons"]["base_temp"][sname])
	var phase_t: float = float(db.data["seasons"]["phase_temp"][phase])
	world_temperature = clamp(base_t + phase_t + sin(_total_elapsed * 0.025) * 4.0, -25.0, 95.0)


func set_sanity_mode(mode: int) -> void:
	if sanity_mode == mode:
		return
	sanity_mode = mode
	_evaluate_sanity_thresholds()
	push_log("정신력 모드 전환: %s" % ("달 계몽(LUNACY)" if mode == 1 else "광기(INSANITY)"))


func delta_sanity(amount: float) -> void:
	sanity = clamp(sanity + amount, 0.0, max_sanity)
	_evaluate_sanity_thresholds()


func _evaluate_sanity_thresholds() -> void:
	var pct: float = sanity / max(1.0, max_sanity)
	var surv: Dictionary = db.data["survival"]
	if sanity_mode == 0: # SANITY_MODE_INSANITY
		if is_sane and pct <= float(surv["sanity_insane_enter"]):
			is_sane = false
			push_log("정신력 15% 이하 — 광기(Insane) 상태 진입!")
		elif not is_sane and pct >= float(surv["sanity_insane_exit"]):
			is_sane = true
			push_log("정신력 17.5% 이상 — 이성 회복!")
	else: # SANITY_MODE_LUNACY
		if is_sane and pct >= float(surv["sanity_lunacy_enter"]):
			is_sane = false
			push_log("계몽치 85% 이상 — 계몽(Enlightened) 상태 진입!")
		elif not is_sane and pct <= float(surv["sanity_lunacy_exit"]):
			is_sane = true
			push_log("계몽치 82.5% 이하 — 계몽 해제!")


func update_moisture(dt: float, rain_rate: float, heater_power: float) -> void:
	var surv: Dictionary = db.data["survival"]
	if rain_rate > 0.0:
		# moisture.lua:289 — 강우 중에는 건조율 0
		moisture = min(float(surv["moisture_max"]), moisture + rain_rate * 2.5 * dt)
	else:
		var dry_rate: float = 0.6 + heater_power * 2.2 + max(0.0, world_temperature / 35.0) * 0.5
		moisture = max(0.0, moisture - dry_rate * dt)

	if not is_wet and moisture >= float(surv["moisture_wet_threshold"]):
		is_wet = true
	elif is_wet and moisture <= float(surv["moisture_dry_threshold"]):
		is_wet = false


func _update_structures(dt: float) -> float:
	var heater_power: float = 0.0
	for s in structures:
		if str(s["kind"]) == "campfire":
			if float(s["fuel"]) > 0.0:
				s["fuel"] = max(0.0, float(s["fuel"]) - dt)
				var dist: float = player_pos.distance_to(s["pos"])
				if dist < 9.0:
					heater_power = max(heater_power, 1.0 - dist / 9.0)
		elif str(s["kind"]) == "cookpot" and float(s.get("cook_timer", 0.0)) > 0.0:
			s["cook_timer"] = max(0.0, float(s["cook_timer"]) - dt)
			if float(s["cook_timer"]) <= 0.0 and str(s.get("cook_result", "")) != "":
				var fid: String = str(s["cook_result"])
				add_item(fid, 1)
				food_freshness[fid] = 1.0
				push_log("요리 완성: %s" % fid)
				s["cook_result"] = ""
	return heater_power


func _update_environment_and_stats(dt: float, fire_power: float) -> void:
	var surv: Dictionary = db.data["survival"]
	var cdef: Dictionary = db.data["characters"][character_id]

	# 비 전환
	rain_timer -= dt
	if rain_timer <= 0.0:
		var sname: String = get_season_name()
		is_raining = (sname == "spring" and rng.randf() < 0.55) or (rng.randf() < 0.15)
		rain_timer = rng.randf_range(60.0, 140.0)

	# 습기 업데이트
	update_moisture(dt, 1.0 if is_raining else 0.0, fire_power)

	# 체온 업데이트 (temperature.lua 수렴 모델)
	var moist_penalty: float = -(moisture / 100.0) * float(surv["moisture_temp_penalty"])
	var target_temp: float = world_temperature + moist_penalty + fire_power * 48.0
	var diff: float = target_temp - temperature
	temperature = clamp(temperature + clamp(diff, -1.0, 1.0) * dt * 1.2, float(surv["min_entity_temp"]), float(surv["max_entity_temp"]))

	if temperature < float(surv["freezing_temp"]):
		apply_health_delta(-(max_health / float(surv["freezing_kill_time"])) * dt, "cold")
	elif temperature > float(surv["overheat_temp"]):
		apply_health_delta(-(max_health / float(surv["freezing_kill_time"])) * dt, "hot")

	# 허기 1초 주기 갱신 (hunger.lua:4 UPDATE_PERIOD = 1)
	_hunger_accum += dt
	while _hunger_accum >= 1.0:
		_hunger_accum -= 1.0
		var rate: float = (float(surv["calories_per_day"]) / float(db.data["clock"]["total_day_time"])) * float(cdef["hunger_rate_mult"])
		hunger = max(0.0, hunger - rate)
		if hunger <= 0.0:
			apply_health_delta(-(max_health / float(surv["starve_kill_time"])), "hunger")

	# 빛 & 어둠(찰리) & 정신력
	var has_light: bool = (phase != "night") or (moon_phase == "full") or (fire_power > 0.05) or (int(inventory.get("torch", 0)) > 0 and equip_hands == "torch")
	var san_delta: float = 0.0
	if sanity_mode == 0:
		if phase == "dusk" or (phase == "night" and has_light):
			san_delta -= 0.083 * float(cdef["sanity_drain_mult"])
		elif phase == "night" and not has_light:
			san_delta -= 0.833 * float(cdef["sanity_drain_mult"])
	else:
		if phase == "day":
			san_delta += 0.025
		elif phase == "night" and not has_light:
			san_delta -= 0.16

	if is_wet:
		san_delta -= 0.055 * (moisture / 100.0)
	if equip_hands == "nightsword":
		san_delta -= 0.33
	delta_sanity(san_delta * dt)

	# 어둠(찰리) 공격
	if not has_light and phase == "night":
		dark_exposure_timer += dt
		if dark_exposure_timer >= 4.0:
			dark_exposure_timer = 0.0
			push_log("어둠 속 찰리에게 습격당했습니다! (-50 HP, -20 정신력)")
			receive_attack(50.0, 0.0, "charlie")
			delta_sanity(-20.0)
	else:
		dark_exposure_timer = 0.0


func apply_health_delta(amount: float, cause: String = "") -> void:
	if is_ghost:
		return
	health = clamp(health + amount, 0.0, get_max_health_with_penalty())
	if health <= 0.0:
		_become_ghost(cause)


func _become_ghost(cause: String) -> void:
	is_ghost = true
	health = 0.0
	world_reset_countdown = float(db.data["survival"]["world_reset_time"])
	push_log("사망(%s) → 유령화! 120초 내 부활하지 않으면 세계가 초기화됩니다." % cause)


func revive_player(apply_penalty: bool = true) -> void:
	if not is_ghost:
		return
	is_ghost = false
	world_reset_countdown = -1.0
	if apply_penalty:
		var max_pen: float = float(db.data["survival"]["max_health_penalty"])
		var rev_pen: float = float(db.data["survival"]["revive_health_penalty"])
		health_penalty = clamp(health_penalty + rev_pen, 0.0, max_pen)
	health = get_max_health_with_penalty()
	hunger = max(hunger, max_hunger * 0.5)
	sanity = max(sanity, max_sanity * 0.5)
	push_log("부활 완료! (최대 체력 페널티 %.0f%%, 현재 최대체력 %.0f)" % [health_penalty * 100.0, get_max_health_with_penalty()])


func receive_attack(raw_damage: float, raw_planar: float = 0.0, source_name: String = "enemy") -> Dictionary:
	var armors: Array = []
	if not equip_head.is_empty():
		armors.append(equip_head)
	if not equip_body.is_empty():
		armors.append(equip_body)

	var res: Dictionary = DSTDatabase.apply_armor_and_planar(raw_damage, raw_planar, armors, 1.0)
	var wear: Dictionary = res["armor_wear"]
	for slot_armor in [equip_head, equip_body]:
		if not slot_armor.is_empty():
			var aid: String = str(slot_armor["id"])
			if wear.has(aid):
				slot_armor["durability"] = max(0.0, float(slot_armor["durability"]) - float(wear[aid]))
	if not equip_head.is_empty() and float(equip_head["durability"]) <= 0.0:
		push_log("투구 파손: %s" % str(equip_head["id"]))
		equip_head = {}
	if not equip_body.is_empty() and float(equip_body["durability"]) <= 0.0:
		push_log("갑옷 파손: %s" % str(equip_body["id"]))
		equip_body = {}

	apply_health_delta(-float(res["total_damage"]), source_name)
	return res


func player_attack_nearest() -> Dictionary:
	if is_ghost or attack_cooldown > 0.0:
		return {"hit": false}
	var w_id: String = equip_hands if db.data["weapons"].has(equip_hands) else "unarmed"
	var w: Dictionary = db.data["weapons"][w_id]
	var atk_range: float = float(w.get("range", 2.2))

	var best_idx: int = -1
	var best_dist: float = atk_range + 1.5
	for i in range(creatures.size()):
		var c: Dictionary = creatures[i]
		var d: float = player_pos.distance_to(c["pos"])
		if d < best_dist:
			best_dist = d
			best_idx = i
	if best_idx == -1:
		attack_anim_timer = 0.22
		return {"hit": false}

	attack_cooldown = float(db.data["survival"]["wilson_attack_period"])
	attack_anim_timer = 0.25
	var target: Dictionary = creatures[best_idx]
	var char_mult: float = float(db.data["characters"][character_id]["damage_mult"])
	var phys_dmg: float = float(w["damage"]) * char_mult
	var planar_dmg: float = float(w.get("planar_damage", 0.0))

	if bool(target.get("planar_entity", false)):
		phys_dmg = DSTDatabase.planar_entity_absorb(phys_dmg)

	var total_dmg: float = phys_dmg + planar_dmg
	target["hp"] = float(target["hp"]) - total_dmg
	target["aggro"] = true
	push_log("%s 타격: 물리 %.1f + 평면 %.1f = %.1f (잔여 HP %.0f)" % [str(target["name"]), phys_dmg, planar_dmg, total_dmg, max(0.0, float(target["hp"]))])

	if float(target["hp"]) <= 0.0:
		var loot: Dictionary = target.get("loot", {})
		for lk in loot.keys():
			add_item(str(lk), int(loot[lk]))
		push_log("%s 처치 완료! 전리품 획득." % str(target["name"]))
		creatures.remove_at(best_idx)
	return {"hit": true, "phys": phys_dmg, "planar": planar_dmg, "total": total_dmg}


func interact_nearest() -> bool:
	if is_ghost:
		revive_player(true)
		return true

	# 1. 모닥불 연료 보충 또는 농장 돌보기/수확
	for s in structures:
		if str(s["kind"]) == "campfire" and player_pos.distance_to(s["pos"]) < 3.2:
			if consume_item("log", 1):
				s["fuel"] = min(float(s["max_fuel"]), float(s["fuel"]) + 90.0)
				push_log("모닥불에 통나무 투입 (+90초)")
				return true

	for fp in farm_plots:
		if player_pos.distance_to(fp["pos"]) < 3.2:
			if bool(fp["harvestable"]):
				var is_big: bool = bool(fp["oversized"])
				add_item("carrot", 3 if is_big else 1)
				food_freshness["carrot"] = 1.0
				fp["stage"] = 0
				fp["timer"] = 0.0
				fp["stress_points"] = 0
				fp["harvestable"] = false
				fp["oversized"] = false
				push_log("작물 수확: %s" % ("거대 당근(×3)!" if is_big else "일반 당근(×1)"))
				return true
			else:
				fp["hydrated"] = true
				fp["fertilized"] = true
				fp["tended"] = true
				push_log("농경지 돌봄 완료 (수분·영양·행복 충족)")
				return true

	# 2. 가장 가까운 자원 채집
	var best_idx: int = -1
	var best_dist: float = 3.5
	for i in range(resources.size()):
		var r: Dictionary = resources[i]
		if int(r["hp"]) <= 0:
			continue
		var d: float = player_pos.distance_to(r["pos"])
		if d < best_dist:
			best_dist = d
			best_idx = i
	if best_idx == -1:
		return false

	var res: Dictionary = resources[best_idx]
	res["hp"] = int(res["hp"]) - 1
	if int(res["hp"]) <= 0:
		res["respawn_timer"] = 180.0
		match str(res["kind"]):
			"evergreen":
				add_item("log", 3)
				push_log("상록수 벌목: 통나무 ×3")
			"boulder":
				add_item("rocks", 3)
				add_item("flint", 1)
				add_item("goldnugget", 1)
				push_log("바위 채광: 돌 ×3, 부싯돌 ×1, 금 ×1")
			"sapling":
				add_item("twigs", 2)
				push_log("묘목 채집: 잔가지 ×2")
			"grass_tuft":
				add_item("cutgrass", 2)
				push_log("풀 채집: 풀 ×2")
			"berrybush":
				add_item("berries", 2)
				food_freshness["berries"] = 1.0
				push_log("베리 수확: 베리 ×2")
			"lunar_crystal":
				add_item("purebrilliance", 2)
				push_log("순수한 광채 결정 채광: ×2")
	return true


func get_nearby_tech_level() -> int:
	var lvl: int = 0
	for s in structures:
		if str(s["kind"]) == "researchlab" and player_pos.distance_to(s["pos"]) < 7.0:
			lvl = max(lvl, 1)
		elif str(s["kind"]) == "lunar_forge" and player_pos.distance_to(s["pos"]) < 7.0:
			lvl = max(lvl, 2)
	if get_biome_at(player_pos) == "moon_island":
		lvl = max(lvl, 2)
	return lvl


func can_craft(recipe_id: String) -> bool:
	if is_ghost or not db.recipes_by_id.has(recipe_id):
		return false
	var r: Dictionary = db.recipes_by_id[recipe_id]
	var req_tech: int = int(r.get("tech", 0))
	if req_tech > 0 and not learned_recipes.has(recipe_id) and get_nearby_tech_level() < req_tech:
		return false
	var ings: Dictionary = r.get("ingredients", {})
	for k in ings.keys():
		if int(inventory.get(str(k), 0)) < int(ings[k]):
			return false
	if r.has("hp_cost") and health <= float(r["hp_cost"]):
		return false
	return true


func craft_recipe(recipe_id: String) -> bool:
	if not can_craft(recipe_id):
		return false
	var r: Dictionary = db.recipes_by_id[recipe_id]
	var ings: Dictionary = r.get("ingredients", {})
	for k in ings.keys():
		consume_item(str(k), int(ings[k]))
	if r.has("hp_cost"):
		apply_health_delta(-float(r["hp_cost"]), "craft")
	if int(r.get("tech", 0)) > 0 and not learned_recipes.has(recipe_id):
		learned_recipes[recipe_id] = true
		delta_sanity(15.0) # 최초 프로토타입 정신력 +15 보너스

	var rtype: String = str(r.get("result_type", "item"))
	if rtype == "structure":
		var pos: Vector2 = player_pos + player_facing.normalized() * 2.4
		if recipe_id == "farm_plot":
			farm_plots.append({
				"id": _next_uid, "pos": pos, "crop": "carrot", "stage": 0, "timer": 0.0,
				"stress_points": 0, "hydrated": true, "fertilized": true, "tended": true,
				"oversized": false, "harvestable": false,
			})
			_next_uid += 1
		else:
			structures.append({
				"id": _next_uid, "kind": recipe_id, "pos": pos,
				"fuel": 180.0 if recipe_id == "campfire" else 0.0,
				"max_fuel": 240.0 if recipe_id == "campfire" else 0.0,
				"cook_timer": 0.0, "cook_result": "",
			})
			_next_uid += 1
		push_log("건설 완료: %s" % str(r["name"]))
	elif rtype == "weapon":
		add_item(recipe_id, 1)
		equip_hands = recipe_id
		push_log("제작 및 장착: %s" % str(r["name"]))
	elif rtype == "armor":
		equip_armor(recipe_id)
		push_log("방어구 제작 및 착용: %s" % str(r["name"]))
	else:
		add_item(recipe_id, 1)
		if recipe_id == "torch":
			equip_hands = "torch"
		push_log("제작 완료: %s" % str(r["name"]))
	return true


func equip_armor(armor_id: String) -> bool:
	var armors_def: Dictionary = db.data.get("armors", {})
	if not armors_def.has(armor_id):
		return false
	var d: Dictionary = armors_def[armor_id]
	var inst: Dictionary = {
		"id": armor_id,
		"name": str(d["name"]),
		"slot": str(d["slot"]),
		"absorption": float(d["absorption"]),
		"durability": float(d["durability"]),
		"max_durability": float(d["durability"]),
		"planar_defense": float(d.get("planar_defense", 0.0)),
	}
	if str(d["slot"]) == "head":
		equip_head = inst
	else:
		equip_body = inst
	return true


func cook_in_pot(ingredients: Array) -> Dictionary:
	if ingredients.size() != 4:
		return {}
	for it in ingredients:
		if int(inventory.get(str(it), 0)) <= 0:
			return {}
	for it in ingredients:
		consume_item(str(it), 1)
	var result: Dictionary = db.calculate_crockpot_recipe(ingredients, rng.randf())
	var fid: String = str(result.get("id", "wetgoop"))
	# 근처 요리 냄비가 있으면 타이머 조리, 없으면 즉시 완성(시뮬 테스트 편의)
	for s in structures:
		if str(s["kind"]) == "cookpot" and player_pos.distance_to(s["pos"]) < 6.0:
			s["cook_timer"] = float(result.get("cooktime", 1.0)) * 10.0
			s["cook_result"] = fid
			push_log("냄비 조리 시작 → 예상 결과: %s" % fid)
			return result
	add_item(fid, 1)
	food_freshness[fid] = 1.0
	push_log("요리 완성: %s" % fid)
	return result


func eat_food(food_id: String) -> bool:
	if is_ghost or int(inventory.get(food_id, 0)) <= 0 or not db.foods_by_id.has(food_id):
		return false
	consume_item(food_id, 1)
	var f: Dictionary = db.foods_by_id[food_id]
	var fresh: float = float(food_freshness.get(food_id, 1.0))
	var hu_mult: float = 1.0 if fresh > 0.5 else (0.667 if fresh > 0.2 else 0.5)
	var hp_mult: float = 1.0 if fresh > 0.5 else (0.333 if fresh > 0.2 else 0.0)
	var sa_val: float = float(f.get("sanity", 0.0)) if fresh > 0.5 else (0.0 if fresh > 0.2 else -10.0)

	apply_health_delta(float(f.get("health", 0.0)) * hp_mult, "food")
	hunger = clamp(hunger + float(f.get("hunger", 0.0)) * hu_mult, 0.0, max_hunger)
	delta_sanity(sa_val)
	push_log("섭취: %s (HP%+.0f HU%+.0f SA%+.0f)" % [str(f.get("name", food_id)), float(f.get("health", 0.0)) * hp_mult, float(f.get("hunger", 0.0)) * hu_mult, sa_val])
	return true


func add_item(item_id: String, count: int) -> void:
	inventory[item_id] = int(inventory.get(item_id, 0)) + count


func consume_item(item_id: String, count: int) -> bool:
	var cur: int = int(inventory.get(item_id, 0))
	if cur < count:
		return false
	if cur == count:
		inventory.erase(item_id)
	else:
		inventory[item_id] = cur - count
	return true


func _update_resources_and_farms(dt: float) -> void:
	for r in resources:
		if int(r["hp"]) <= 0:
			r["respawn_timer"] = float(r["respawn_timer"]) - dt
			if float(r["respawn_timer"]) <= 0.0:
				r["hp"] = int(r["max_hp"])

	for fp in farm_plots:
		if bool(fp["harvestable"]):
			continue
		fp["timer"] = float(fp["timer"]) + dt
		if float(fp["timer"]) >= 45.0:
			fp["timer"] = 0.0
			var add_stress: int = 0
			if not bool(fp["hydrated"]):
				add_stress += 1
			if not bool(fp["fertilized"]):
				add_stress += 1
			if not bool(fp["tended"]):
				add_stress += 1
			fp["stress_points"] = int(fp["stress_points"]) + add_stress
			fp["hydrated"] = is_raining
			fp["tended"] = false
			fp["stage"] = int(fp["stage"]) + 1
			if int(fp["stage"]) >= 4:
				var state: String = DSTDatabase.calc_farm_stress_state(int(fp["stress_points"]))
				fp["harvestable"] = true
				fp["oversized"] = (state == "NONE")
				push_log("농작물 성숙 완료! 등급: %s" % ("거대 작물(Oversized)!" if bool(fp["oversized"]) else state))


func _update_perishables(dt: float) -> void:
	_perish_accum += dt
	if _perish_accum < 5.0:
		return
	var step_dt: float = _perish_accum
	_perish_accum = 0.0
	var pm: Dictionary = db.data["perish_mults"]
	var mult: float = 1.0
	if is_wet:
		mult *= float(pm["wet"])
	if world_temperature < 0.0:
		mult *= float(pm["winter"])
	elif world_temperature > 70.0:
		mult *= float(pm["summer"])
	var total_day: float = float(db.data["clock"]["total_day_time"])
	for fid in food_freshness.keys():
		if not inventory.has(fid) or not db.foods_by_id.has(fid):
			continue
		var pdays: float = float(db.foods_by_id[fid].get("perish_days", 10.0))
		food_freshness[fid] = max(0.0, float(food_freshness[fid]) - (step_dt * mult) / (pdays * total_day))


func _update_creatures(dt: float) -> void:
	# 주기적 하운드 습격
	_hound_timer -= dt
	if _hound_timer <= 0.0 and not is_ghost:
		_hound_timer = 420.0
		var ang: float = rng.randf_range(0.0, TAU)
		var h: Dictionary = spawn_creature("hound", player_pos + Vector2(cos(ang), sin(ang)) * 18.0)
		h["aggro"] = true
		push_log("하운드 습격 경보! 하운드가 접근 중입니다.")

	for c in creatures:
		c["cd"] = max(0.0, float(c["cd"]) - dt)
		var dist: float = player_pos.distance_to(c["pos"])
		if not is_ghost and dist < (14.0 if bool(c["boss"]) else 8.5):
			c["aggro"] = true
		if is_ghost or dist > 28.0:
			if not bool(c["boss"]):
				c["aggro"] = false

		if bool(c["aggro"]) and not is_ghost:
			var r_atk: float = float(c["range"])
			if dist > r_atk * 0.85:
				var dir: Vector2 = (player_pos - c["pos"]).normalized()
				c["pos"] = c["pos"] + dir * float(c["speed"]) * dt
			elif float(c["cd"]) <= 0.0:
				c["cd"] = float(c["attack_period"])
				var eff_dmg: float = float(c["damage"]) * float(c["player_dmg_pct"])
				var p_dmg: float = float(c["planar_damage"])
				var res: Dictionary = receive_attack(eff_dmg, p_dmg, str(c["name"]))
				push_log("%s의 공격! 피해 %.1f (흡수 %.0f%%)" % [str(c["name"]), float(res["total_damage"]), float(res["absorbed_percent"]) * 100.0])
