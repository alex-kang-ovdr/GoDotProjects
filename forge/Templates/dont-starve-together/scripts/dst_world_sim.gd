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
var player_hit_flash: float = 0.0
var freeze_timer: float = 0.0

# 보스 특수 패턴 텔레그래프 & 협동 AI 동료 (M2/M3)
var boss_telegraphs: Array = [] # { id, kind, boss_kind, pos: Vector2, radius: float, timer: float, max_timer: float, color: Color }
var coop_ally_active: bool = false
var coop_ally_char: String = "wathgrithr"
var coop_ally_pos: Vector2 = Vector2(-2.5, 1.5)
var _coop_ally_cd: float = 0.0
var _coop_ally_revive_timer: float = 0.0

# 보트 & 바다 항해 (M4 + QA-09)
var boat_active: bool = false
var boat_pos: Vector2 = Vector2(18.0, -14.0)
var boat_hp: float = 200.0
var boat_masts: int = 0 # 0..3 (0.7^k 체감 속도)
var on_boat: bool = false

# 웬디 동반 영혼 아비게일 & WX-78 감전 타이머
var abigail_pos: Vector2 = Vector2(2.0, 2.0)
var _abigail_pulse_timer: float = 0.0
var _wx_shock_timer: float = 0.0

# 인사이트 스킬트리 (M5)
var insight_points: int = 3
var unlocked_skills: Dictionary = {}

# 지상(master) ↔ 동굴/유적(caves) 2-Shard 및 악몽 주기 (M4)
var shard: String = "master" # "master" | "caves"
var nightmare_phase: String = "calm" # calm -> warn -> wild -> dawn
var nightmare_timer: float = 120.0
var _master_state: Dictionary = {}
var _caves_state: Dictionary = {}

# 시각 피드백 큐 (렌더러가 소비)
var floating_events: Array = [] # { pos: Vector2, text: String, color: Color }

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
	health_penalty = 0.0
	is_ghost = false
	world_reset_countdown = -1.0

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
	player_hit_flash = 0.0
	freeze_timer = 0.0
	boss_telegraphs.clear()
	coop_ally_active = false
	coop_ally_pos = Vector2(-2.5, 1.5)
	_coop_ally_cd = 0.0
	_coop_ally_revive_timer = 0.0
	boat_active = false
	boat_pos = Vector2(18.0, -14.0)
	boat_hp = float(db.data["boat"]["health"])
	boat_masts = 0
	on_boat = false
	abigail_pos = Vector2(2.0, 2.0)
	_abigail_pulse_timer = 0.0
	_wx_shock_timer = 0.0
	insight_points = 3
	unlocked_skills.clear()
	floating_events.clear()
	shard = "master"
	nightmare_phase = "calm"
	nightmare_timer = 120.0
	_master_state.clear()
	_caves_state.clear()

	inventory = {
		"twigs": 4,
		"flint": 4,
		"cutgrass": 6,
		"log": 4,
		"berries": 4,
		"carrot": 2,
		"meat": 2,
		"egg": 2,
		"honey": 2,
		"dragonfruit": 1,
		"fish": 1,
		"rocks": 4,
		"goldnugget": 2,
		"pigskin": 1,
		"purebrilliance": 2,
		"thulecite": 2,
		"nightmarefuel": 2,
	}
	food_freshness = {
		"berries": 1.0,
		"carrot": 1.0,
		"meat": 1.0,
		"egg": 1.0,
		"honey": 1.0,
		"dragonfruit": 1.0,
		"fish": 1.0,
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
	if shard == "caves":
		return "ruins" if pos.x > 6.0 else "cave"
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


func toggle_shard() -> String:
	if is_ghost:
		return shard
	if on_boat:
		on_boat = false
	if shard == "master":
		_master_state = {
			"pos": player_pos,
			"resources": resources.duplicate(true),
			"structures": structures.duplicate(true),
			"creatures": creatures.duplicate(true),
			"farm_plots": farm_plots.duplicate(true),
		}
		shard = "caves"
		if _caves_state.is_empty():
			_populate_caves_shard()
			player_pos = Vector2(0.0, 2.0)
		else:
			player_pos = _caves_state["pos"]
			resources = _caves_state["resources"].duplicate(true)
			structures = _caves_state["structures"].duplicate(true)
			creatures = _caves_state["creatures"].duplicate(true)
			farm_plots = _caves_state["farm_plots"].duplicate(true)
		push_log("동굴/고대 유적(Caves Shard)으로 하강했습니다! (악몽 주기: %s)" % nightmare_phase.to_upper())
		push_floating(player_pos, "CAVES SHARD", Color(0.68, 0.52, 0.96))
	else:
		_caves_state = {
			"pos": player_pos,
			"resources": resources.duplicate(true),
			"structures": structures.duplicate(true),
			"creatures": creatures.duplicate(true),
			"farm_plots": farm_plots.duplicate(true),
		}
		shard = "master"
		player_pos = _master_state.get("pos", Vector2.ZERO)
		resources = _master_state.get("resources", []).duplicate(true)
		structures = _master_state.get("structures", []).duplicate(true)
		creatures = _master_state.get("creatures", []).duplicate(true)
		farm_plots = _master_state.get("farm_plots", []).duplicate(true)
		push_log("지상(Master Shard)으로 복귀했습니다!")
		push_floating(player_pos, "OVERWORLD", Color(0.78, 0.92, 0.55))
	return shard


func _populate_caves_shard() -> void:
	resources.clear()
	structures.clear()
	creatures.clear()
	farm_plots.clear()
	# 동굴 출구(싱크홀) & 고대 의사과학 기지(Tech Lv 3)
	structures.append({"id": _next_uid, "kind": "cave_entrance", "pos": Vector2(0.0, -4.0), "fuel": 0.0, "max_fuel": 0.0, "cook_timer": 0.0, "cook_result": ""}); _next_uid += 1
	structures.append({"id": _next_uid, "kind": "ancient_altar", "pos": Vector2(12.0, 0.0), "fuel": 0.0, "max_fuel": 0.0, "cook_timer": 0.0, "cook_result": ""}); _next_uid += 1
	# 동굴/유적 자원
	for i in range(14):
		var ang: float = float(i) * (TAU / 14.0) + 0.2
		var rad: float = 8.0 + float(i % 3) * 6.0
		resources.append({"id": _next_uid, "kind": "mushtree", "pos": Vector2(cos(ang), sin(ang)) * rad, "hp": 3, "max_hp": 3, "respawn_timer": 0.0}); _next_uid += 1
	for i in range(10):
		var ang: float = float(i) * (TAU / 10.0)
		resources.append({"id": _next_uid, "kind": "lightflower", "pos": Vector2(cos(ang), sin(ang)) * 7.5, "hp": 1, "max_hp": 1, "respawn_timer": 0.0}); _next_uid += 1
	for i in range(6):
		resources.append({"id": _next_uid, "kind": "boulder", "pos": Vector2(14.0 + float(i % 3) * 4.5, -6.0 + float(i / 3) * 11.0), "hp": 3, "max_hp": 3, "respawn_timer": 0.0}); _next_uid += 1
	spawn_creature("crawlinghorror", Vector2(15.0, 5.0))


func push_log(msg: String) -> void:
	event_log.append("[D%d %s] %s" % [day, phase.to_upper(), msg])
	if event_log.size() > 14:
		event_log.pop_front()


func push_floating(pos: Vector2, text: String, col: Color = Color(1.0, 0.95, 0.7)) -> void:
	floating_events.append({"pos": pos, "text": text, "color": col})
	if floating_events.size() > 32:
		floating_events.pop_front()


func get_wolfgang_form() -> String:
	if character_id != "wolfgang":
		return ""
	if hunger >= 150.0:
		return "MIGHTY"
	elif hunger < 70.0:
		return "WIMPY"
	return "NORMAL"


func get_effective_damage_mult() -> float:
	var base_mult: float = float(db.data["characters"][character_id]["damage_mult"])
	if character_id == "wolfgang":
		var f: String = get_wolfgang_form()
		base_mult = 2.0 if f == "MIGHTY" else (0.75 if f == "WIMPY" else 1.0)
	if unlocked_skills.has("combat_mastery"):
		base_mult *= 1.20
	return base_mult


func get_boat_speed() -> float:
	if boat_masts <= 0:
		return 4.2 # 노 젓기 기본 속도
	var mvels: Array = []
	for _i in range(boat_masts):
		mvels.append(2.0)
	var b: Dictionary = db.data["boat"]
	var raw_v: float = DSTDatabase.calc_boat_max_velocity(mvels, float(b["max_velocity"]), float(b["max_allowed_velocity"]))
	return 4.2 + raw_v * 1.45


func toggle_boat() -> bool:
	if is_ghost or not boat_active:
		return false
	if on_boat:
		if player_pos.length() > 53.5:
			push_log("바다 한가운데서는 하선할 수 없습니다! 해안으로 접근하세요.")
			return false
		on_boat = false
		push_log("보트에서 하선했습니다.")
		return true
	if player_pos.distance_to(boat_pos) <= 5.5:
		on_boat = true
		player_pos = boat_pos
		push_log("보트 승선! (돛 %d개 · 항해 속도 %.1f)" % [boat_masts, get_boat_speed()])
		push_floating(player_pos, "SAIL!", Color(0.55, 0.88, 1.0))
		return true
	push_log("보트가 너무 멀리 있습니다 (거리 %.1fm)." % player_pos.distance_to(boat_pos))
	return false


func unlock_skill(skill_id: String) -> bool:
	if unlocked_skills.has(skill_id):
		return false
	for sk in db.data.get("skills", []):
		if str(sk["id"]) == skill_id:
			var cost: int = int(sk.get("cost", 1))
			if insight_points < cost:
				push_log("인사이트 포인트가 부족합니다 (필요 %d / 보유 %d)." % [cost, insight_points])
				return false
			insight_points -= cost
			unlocked_skills[skill_id] = true
			push_log("스킬 해금: %s (%s)" % [str(sk["name"]), str(sk["desc"])])
			push_floating(player_pos, "+SKILL: %s" % str(sk["name"]), Color(0.98, 0.85, 0.35))
			return true
	return false


func transmute_rocks_to_gold() -> bool:
	if not (unlocked_skills.has("alchemy_transmute") or character_id == "wilson"):
		push_log("연금술 변환 스킬 또는 윌슨 캐릭터가 필요합니다.")
		return false
	if not consume_item("rocks", 3):
		push_log("돌이 3개 이상 필요합니다.")
		return false
	add_item("goldnugget", 1)
	push_log("연금술 변환 성공: 돌 ×3 → 금덩이 ×1")
	push_floating(player_pos, "+1 GOLD", Color(1.0, 0.86, 0.24))
	return true


func get_active_boss() -> Dictionary:
	for c in creatures:
		if bool(c.get("boss", false)):
			return c
	return {}


func toggle_coop_ally() -> bool:
	coop_ally_active = not coop_ally_active
	if coop_ally_active:
		coop_ally_pos = player_pos + Vector2(-2.6, 1.4)
		push_log("협동 동료 참전: 위그프리드 (공동 전투 · 유령 시 고백 심장 자동 부활)")
		push_floating(coop_ally_pos, "CO-OP JOIN!", Color(0.50, 0.96, 0.55))
	else:
		push_log("협동 동료가 캠프로 복귀했습니다.")
	return coop_ally_active


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

	# 지상 동굴 입구(싱크홀) 배치
	structures.append({
		"id": _next_uid, "kind": "cave_entrance", "pos": Vector2(-9.0, -7.0),
		"fuel": 0.0, "max_fuel": 0.0, "cook_timer": 0.0, "cook_result": "",
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
		"hit_flash": 0.0,
		"special_cd": 3.5 if bool(d.get("boss", false)) else 999.0,
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
	player_hit_flash = max(0.0, player_hit_flash - dt)
	freeze_timer = max(0.0, freeze_timer - sim_dt)

	# 1. 시계 / 달 / 계절 / 동굴 악몽 주기 진행
	var total_day: float = float(db.data["clock"]["total_day_time"])
	time_in_day += sim_dt
	while time_in_day >= total_day:
		time_in_day -= total_day
		_advance_day()
	_update_clock_and_moon()
	_update_nightmare_cycle(sim_dt)

	# 2. 이동 및 경계 (보트 승선 시 바다 항해 허용, WX-78 바이오 회로 이속 +15%)
	var move_speed: float = 6.0 # WILSON_RUN_SPEED = 6
	if on_boat:
		move_speed = get_boat_speed()
	else:
		if character_id == "wx78":
			move_speed *= 1.15
		if not equip_body.is_empty():
			var adef: Dictionary = db.data["armors"].get(str(equip_body.get("id", "")), {})
			move_speed *= float(adef.get("speed_mult", 1.0))
	if is_ghost:
		move_speed = 7.5
	var max_radius: float = 68.0 if on_boat else 53.0
	if freeze_timer > 0.0 and not is_ghost:
		player_vel = Vector2.ZERO
	elif move_input.length_squared() > 0.001:
		var dir: Vector2 = move_input.normalized()
		player_facing = dir
		var next_pos: Vector2 = player_pos + dir * move_speed * sim_dt
		if next_pos.length() <= max_radius:
			player_pos = next_pos
		if on_boat:
			boat_pos = player_pos
		player_vel = dir * move_speed
	else:
		player_vel = Vector2.ZERO

	# 2b. 웬디 아비게일 동반 궤도 및 주변 광역 공격
	if character_id == "wendy" and not is_ghost:
		var orbit_ang: float = _total_elapsed * 1.4
		var target_ab: Vector2 = player_pos + Vector2(cos(orbit_ang), sin(orbit_ang)) * 2.4
		abigail_pos = abigail_pos.lerp(target_ab, clamp(dt * 4.0, 0.0, 1.0))
		_abigail_pulse_timer += sim_dt
		if _abigail_pulse_timer >= 1.5:
			_abigail_pulse_timer = 0.0
			for ci in range(creatures.size() - 1, -1, -1):
				var cr: Dictionary = creatures[ci]
				if abigail_pos.distance_to(cr["pos"]) <= 5.5:
					var ab_dmg: float = 20.0 if phase != "day" else 12.0
					cr["hp"] = float(cr["hp"]) - ab_dmg
					cr["hit_flash"] = 0.2
					push_floating(cr["pos"], "아비게일 -%.0f" % ab_dmg, Color(0.95, 0.62, 0.85))
					if float(cr["hp"]) <= 0.0:
						_handle_creature_death(ci)

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

	# 6. 자원 재생, 부패, 농사, 생물 AI, 보스 특수 텔레그래프, 협동 동료 AI
	_update_resources_and_farms(sim_dt)
	_update_perishables(sim_dt)
	_update_creatures(sim_dt)
	_update_boss_telegraphs(sim_dt)
	_update_coop_ally(sim_dt)


func _advance_day() -> void:
	day += 1
	day_in_season += 1
	if day % 3 == 0 and insight_points < 15:
		insight_points += 1
		push_log("생존 인사이트 포인트 +1 획득! (보유 %d)" % insight_points)
	var sname: String = get_season_name()
	var slen: int = int(db.data["seasons"]["lengths"][sname])
	if day_in_season > slen:
		day_in_season = 1
		season_index = (season_index + 1) % 4
		push_log("계절 전환: %s 시작! (Day %d)" % [get_season_name().to_upper(), day])
	# 겨울 10일차 밤: 외눈사슴 자연 출현 (활성 보스 없을 때)
	if get_season_name() == "winter" and day_in_season == 10 and get_active_boss().is_empty() and not is_ghost:
		spawn_creature("deerclops", player_pos + Vector2(18.0, 0.0))


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


func _update_nightmare_cycle(dt: float) -> void:
	var nc: Dictionary = db.data.get("nightmare_cycle", {})
	var order: Array = nc.get("order", ["calm", "warn", "wild", "dawn"])
	var durs: Dictionary = nc.get("durations", {"calm": 120.0, "warn": 30.0, "wild": 90.0, "dawn": 30.0})
	nightmare_timer -= dt
	if nightmare_timer <= 0.0:
		var idx: int = (order.find(nightmare_phase) + 1) % order.size()
		nightmare_phase = str(order[idx])
		nightmare_timer = float(durs.get(nightmare_phase, 60.0))
		if shard == "caves":
			push_log("동굴 악몽 주기 전환: %s" % nightmare_phase.to_upper())
			if nightmare_phase == "wild" and creatures.size() < 4 and not is_ghost:
				var tb: Dictionary = spawn_creature("terrorbeak", player_pos + Vector2(11.0, 0.0))
				tb["aggro"] = true
				push_log("악몽 절정(WILD): 공포부리(Terrorbeak)가 균열에서 출현했습니다!")


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

	# 체온 업데이트 (temperature.lua 수렴 모델 + 윌슨 수염 단열 + 극한 단열 스킬)
	var moist_penalty: float = -(moisture / 100.0) * float(surv["moisture_temp_penalty"])
	var target_temp: float = world_temperature + moist_penalty + fire_power * 48.0
	if character_id == "wilson" and target_temp < 15.0:
		target_temp += 15.0 # 수염 겨울 단열 보너스
	if unlocked_skills.has("survival_insulation"):
		if target_temp < 20.0:
			target_temp += 12.0
		elif target_temp > 55.0:
			target_temp -= 12.0
	var diff: float = target_temp - temperature
	temperature = clamp(temperature + clamp(diff, -1.0, 1.0) * dt * 1.2, float(surv["min_entity_temp"]), float(surv["max_entity_temp"]))

	if temperature < float(surv["freezing_temp"]):
		apply_health_delta(-(max_health / float(surv["freezing_kill_time"])) * dt, "cold")
	elif temperature > float(surv["overheat_temp"]):
		apply_health_delta(-(max_health / float(surv["freezing_kill_time"])) * dt, "hot")

	# WX-78 습기 감전 취약
	if character_id == "wx78" and is_wet:
		_wx_shock_timer += dt
		if _wx_shock_timer >= 3.0:
			_wx_shock_timer = 0.0
			apply_health_delta(-2.5, "wet_shock")
			push_floating(player_pos, "감전 -2.5", Color(0.45, 0.88, 1.0))

	# 허기 1초 주기 갱신 (hunger.lua:4 UPDATE_PERIOD = 1)
	_hunger_accum += dt
	while _hunger_accum >= 1.0:
		_hunger_accum -= 1.0
		var rate: float = (float(surv["calories_per_day"]) / float(db.data["clock"]["total_day_time"])) * float(cdef["hunger_rate_mult"])
		hunger = max(0.0, hunger - rate)
		if hunger <= 0.0:
			apply_health_delta(-(max_health / float(surv["starve_kill_time"])), "hunger")

	# 빛 & 어둠(찰리) & 정신력 (윌로우 라이터, 동굴 빛꽃/고대제단 광원 포함)
	var near_cave_light: bool = false
	if shard == "caves":
		for r in resources:
			if str(r["kind"]) == "lightflower" and int(r["hp"]) > 0 and player_pos.distance_to(r["pos"]) < 11.0:
				near_cave_light = true
				break
	var has_light: bool = (phase != "night" and shard != "caves") or near_cave_light or (moon_phase == "full" and shard != "caves") or (fire_power > 0.05) or (character_id == "willow") or (int(inventory.get("torch", 0)) > 0 and equip_hands == "torch")
	var san_delta: float = 0.0
	if sanity_mode == 0:
		if phase == "dusk" or (phase == "night" and has_light):
			san_delta -= 0.083 * float(cdef["sanity_drain_mult"])
		elif phase == "night" and not has_light:
			san_delta -= 0.833 * float(cdef["sanity_drain_mult"])
		if character_id == "willow" and fire_power > 0.1:
			san_delta += 0.25
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
	player_hit_flash = 0.25
	push_floating(player_pos, "-%.0f HP" % float(res["total_damage"]), Color(1.0, 0.32, 0.28))
	return res


func _handle_creature_death(idx: int) -> void:
	if idx < 0 or idx >= creatures.size():
		return
	var target: Dictionary = creatures[idx]
	var loot: Dictionary = target.get("loot", {})
	for lk in loot.keys():
		add_item(str(lk), int(loot[lk]))
	if bool(target.get("boss", false)):
		insight_points = min(15, insight_points + 2)
		push_log("거대 보스 %s 처치! 전리품 + 인사이트 포인트 +2!" % str(target["name"]))
		push_floating(target["pos"], "BOSS SLAIN! +2 INSIGHT", Color(1.0, 0.88, 0.30))
	else:
		push_log("%s 처치 완료! 전리품 획득." % str(target["name"]))
	creatures.remove_at(idx)


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
	var char_mult: float = get_effective_damage_mult()
	var phys_dmg: float = float(w["damage"]) * char_mult
	var planar_dmg: float = float(w.get("planar_damage", 0.0))
	if unlocked_skills.has("affinity_lunar"):
		planar_dmg += 12.0
	if unlocked_skills.has("affinity_shadow") and (bool(target.get("boss", false)) or bool(target.get("planar_entity", false))):
		phys_dmg *= 1.25

	if bool(target.get("planar_entity", false)):
		phys_dmg = DSTDatabase.planar_entity_absorb(phys_dmg)

	var total_dmg: float = phys_dmg + planar_dmg
	target["hp"] = float(target["hp"]) - total_dmg
	target["aggro"] = true
	target["hit_flash"] = 0.22
	if planar_dmg > 0.0:
		push_floating(target["pos"], "-%.0f (+%.0f⚡)" % [phys_dmg, planar_dmg], Color(0.50, 0.94, 1.0))
	else:
		push_floating(target["pos"], "-%.0f" % total_dmg, Color(1.0, 0.90, 0.45))

	# 위그프리드 전투 흡혈 패시브
	if character_id == "wathgrithr":
		apply_health_delta(2.0, "lifesteal")
		delta_sanity(1.5)

	push_log("%s 타격: 물리 %.1f + 평면 %.1f = %.1f (잔여 HP %.0f)" % [str(target["name"]), phys_dmg, planar_dmg, total_dmg, max(0.0, float(target["hp"]))])

	if float(target["hp"]) <= 0.0:
		_handle_creature_death(best_idx)
	return {"hit": true, "phys": phys_dmg, "planar": planar_dmg, "total": total_dmg}


func interact_nearest() -> bool:
	if is_ghost:
		revive_player(true)
		return true

	# 1. 동굴 입구(싱크홀) 이동, 모닥불 연료 보충 또는 농장 돌보기/수확
	for s in structures:
		if str(s["kind"]) == "cave_entrance" and player_pos.distance_to(s["pos"]) < 3.6:
			toggle_shard()
			return true
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
	var bonus: int = 1 if unlocked_skills.has("harvest_bounty") else 0
	if int(res["hp"]) <= 0:
		res["respawn_timer"] = 180.0
		match str(res["kind"]):
			"evergreen":
				add_item("log", 3 + bonus)
				push_log("상록수 벌목: 통나무 ×%d" % (3 + bonus))
				push_floating(res["pos"], "+%d 통나무" % (3 + bonus), Color(0.85, 0.72, 0.45))
			"boulder":
				add_item("rocks", 3 + bonus)
				add_item("flint", 1)
				add_item("goldnugget", 1)
				push_log("바위 채광: 돌 ×%d, 부싯돌 ×1, 금 ×1" % (3 + bonus))
				push_floating(res["pos"], "+%d 돌 +1 금" % (3 + bonus), Color(0.92, 0.85, 0.42))
			"sapling":
				add_item("twigs", 2 + bonus)
				push_log("묘목 채집: 잔가지 ×%d" % (2 + bonus))
				push_floating(res["pos"], "+%d 잔가지" % (2 + bonus), Color(0.82, 0.74, 0.50))
			"grass_tuft":
				add_item("cutgrass", 2 + bonus)
				push_log("풀 채집: 풀 ×%d" % (2 + bonus))
				push_floating(res["pos"], "+%d 풀" % (2 + bonus), Color(0.75, 0.90, 0.42))
			"berrybush":
				add_item("berries", 2 + bonus)
				food_freshness["berries"] = 1.0
				push_log("베리 수확: 베리 ×%d" % (2 + bonus))
				push_floating(res["pos"], "+%d 베리" % (2 + bonus), Color(0.96, 0.40, 0.42))
			"lunar_crystal":
				add_item("purebrilliance", 2 + bonus)
				push_log("순수한 광채 결정 채광: ×%d" % (2 + bonus))
				push_floating(res["pos"], "+%d 광채" % (2 + bonus), Color(0.55, 0.95, 1.0))
			"mushtree":
				add_item("log", 2 + bonus)
				push_log("버섯나무 벌목: 통나무 ×%d" % (2 + bonus))
				push_floating(res["pos"], "+%d 통나무" % (2 + bonus), Color(0.55, 0.85, 0.95))
			"lightflower":
				add_item("lightbulb", 2 + bonus)
				push_log("빛꽃 채집: 빛구근 ×%d" % (2 + bonus))
				push_floating(res["pos"], "+%d 빛구근" % (2 + bonus), Color(1.0, 0.96, 0.55))
	else:
		push_floating(res["pos"], "채집 (%d/%d)" % [int(res["max_hp"]) - int(res["hp"]), int(res["max_hp"])], Color(0.9, 0.9, 0.85))
	return true


func get_nearby_tech_level() -> int:
	var lvl: int = 0
	for s in structures:
		if str(s["kind"]) == "researchlab" and player_pos.distance_to(s["pos"]) < 7.0:
			lvl = max(lvl, 1)
		elif str(s["kind"]) == "lunar_forge" and player_pos.distance_to(s["pos"]) < 7.0:
			lvl = max(lvl, 2)
		elif str(s["kind"]) == "ancient_altar" and player_pos.distance_to(s["pos"]) < 8.5:
			lvl = max(lvl, 3)
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
	elif rtype == "boat":
		boat_active = true
		boat_pos = player_pos + player_facing.normalized() * 3.0
		boat_hp = float(db.data["boat"]["health"])
		push_log("보트 진수 완료! B 키로 승선/하선 및 바다 항해 가능.")
		push_floating(boat_pos, "BOAT READY!", Color(0.55, 0.88, 1.0))
	elif rtype == "mast":
		if not boat_active:
			boat_active = true
			boat_pos = player_pos + player_facing.normalized() * 3.0
		boat_masts = min(3, boat_masts + 1)
		push_log("보트에 돛 장착! (현재 돛 %d/3 · 항해 속도 %.1f)" % [boat_masts, get_boat_speed()])
		push_floating(boat_pos, "MAST %d/3" % boat_masts, Color(0.95, 0.92, 0.72))
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
	# 위그프리드 육식 전용 규칙 (채소·과일 거부)
	if character_id == "wathgrithr" and (food_id == "berries" or food_id == "carrot"):
		push_log("위그프리드는 육식만 섭취할 수 있습니다! (%s 거부)" % food_id)
		push_floating(player_pos, "육식 전용!", Color(0.95, 0.45, 0.40))
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
		c["hit_flash"] = max(0.0, float(c.get("hit_flash", 0.0)) - dt)
		var dist: float = player_pos.distance_to(c["pos"])
		if not is_ghost and dist < (14.0 if bool(c["boss"]) else 8.5):
			c["aggro"] = true
		if is_ghost or dist > 28.0:
			if not bool(c["boss"]):
				c["aggro"] = false

		if bool(c["aggro"]) and not is_ghost:
			# 보스 특수 패턴 텔레그래프 발동
			if bool(c.get("boss", false)):
				c["special_cd"] = max(0.0, float(c.get("special_cd", 4.0)) - dt)
				if float(c["special_cd"]) <= 0.0 and dist < 11.0:
					c["special_cd"] = 6.0
					_trigger_boss_telegraph(c)

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


func _trigger_boss_telegraph(boss: Dictionary) -> void:
	var bk: String = str(boss["kind"])
	var t_kind: String = "ice_slam"
	var rad: float = 5.5
	var windup: float = 1.15
	var col: Color = Color(0.45, 0.88, 1.0, 0.55)
	var center: Vector2 = player_pos
	match bk:
		"deerclops", "mutated_deerclops":
			t_kind = "ice_slam"; rad = 5.5; windup = 1.15; col = Color(0.45, 0.88, 1.0, 0.55); center = player_pos
		"bearger":
			t_kind = "ground_pound"; rad = 6.8; windup = 1.25; col = Color(0.95, 0.58, 0.18, 0.55); center = boss["pos"]
		"dragonfly":
			t_kind = "lava_ring"; rad = 6.2; windup = 1.15; col = Color(1.0, 0.28, 0.12, 0.58); center = boss["pos"]
		"moose":
			t_kind = "honk_gust"; rad = 6.5; windup = 1.10; col = Color(0.55, 0.96, 0.85, 0.52); center = boss["pos"]
	boss_telegraphs.append({
		"id": _next_uid, "kind": t_kind, "boss_kind": bk,
		"pos": center, "radius": rad, "timer": windup, "max_timer": windup, "color": col,
	})
	_next_uid += 1
	push_log("보스 특수 패턴 예고: %s (%s)" % [str(boss["name"]), t_kind.to_upper()])


func _update_boss_telegraphs(dt: float) -> void:
	for i in range(boss_telegraphs.size() - 1, -1, -1):
		var tg: Dictionary = boss_telegraphs[i]
		tg["timer"] = float(tg["timer"]) - dt
		if float(tg["timer"]) <= 0.0:
			var tpos: Vector2 = tg["pos"]
			var rad: float = float(tg["radius"])
			var tkind: String = str(tg["kind"])
			var in_zone: bool = (not is_ghost) and (player_pos.distance_to(tpos) <= rad)
			match tkind:
				"ice_slam":
					if in_zone:
						var p_dmg: float = 25.0 if str(tg["boss_kind"]) == "mutated_deerclops" else 0.0
						receive_attack(45.0, p_dmg, "ice_slam")
						freeze_timer = 1.8
						temperature = max(-10.0, temperature - 14.0)
						push_floating(player_pos, "❄ 빙결!", Color(0.50, 0.92, 1.0))
						push_log("외눈사슴 빙결 브레스 피격! 1.8초 빙결!")
				"ground_pound":
					# 원작 곰소리 충격파: 반경 내 나무/바위 자동 파괴 + 자원 드랍!
					var felled: int = 0
					for r in resources:
						if int(r["hp"]) > 0 and r["pos"].distance_to(tpos) <= rad + 2.0:
							r["hp"] = 0
							r["respawn_timer"] = 180.0
							if str(r["kind"]) == "evergreen":
								add_item("log", 2)
							elif str(r["kind"]) == "boulder":
								add_item("rocks", 2)
							felled += 1
					if felled > 0:
						push_floating(tpos, "충격파 파괴 ×%d!" % felled, Color(1.0, 0.72, 0.30))
					if in_zone:
						receive_attack(60.0, 0.0, "ground_pound")
						var kb: Vector2 = (player_pos - tpos).normalized() * 4.5
						if (player_pos + kb).length() <= 53.0:
							player_pos += kb
				"lava_ring":
					if in_zone:
						if character_id == "willow":
							push_floating(player_pos, "화염 면역!", Color(1.0, 0.70, 0.30))
							push_log("윌로우 화염 면역으로 용파리 용암 링을 무효화했습니다!")
						else:
							receive_attack(55.0, 0.0, "lava_ring")
							temperature = min(90.0, temperature + 24.0)
							push_floating(player_pos, "🔥 용암 화상!", Color(1.0, 0.38, 0.16))
				"honk_gust":
					if in_zone:
						receive_attack(35.0, 0.0, "honk_gust")
						var kb: Vector2 = (player_pos - tpos).normalized() * 6.0
						if (player_pos + kb).length() <= 53.0:
							player_pos += kb
						push_floating(player_pos, "강풍 넉백!", Color(0.65, 0.98, 0.90))
			boss_telegraphs.remove_at(i)


func _update_coop_ally(dt: float) -> void:
	if not coop_ally_active:
		return
	_coop_ally_cd = max(0.0, _coop_ally_cd - dt)
	# 플레이어가 유령화되면 협동 동료가 달려와 고백 심장으로 자동 부활!
	if is_ghost:
		var d_p: float = coop_ally_pos.distance_to(player_pos)
		if d_p > 1.8:
			coop_ally_pos += (player_pos - coop_ally_pos).normalized() * 6.8 * dt
		else:
			_coop_ally_revive_timer += dt
			if _coop_ally_revive_timer >= 1.5:
				_coop_ally_revive_timer = 0.0
				revive_player(true)
				push_floating(player_pos, "동료 부활!", Color(0.55, 1.0, 0.65))
				push_log("협동 동료 위그프리드가 고백 심장으로 부활시켰습니다!")
		return
	_coop_ally_revive_timer = 0.0

	# 반경 14m 내 가장 가까운 적 추적 및 공동 타격
	var best_idx: int = -1
	var best_d: float = 14.0
	for i in range(creatures.size()):
		var d: float = coop_ally_pos.distance_to(creatures[i]["pos"])
		if d < best_d:
			best_d = d
			best_idx = i
	if best_idx != -1:
		var t: Dictionary = creatures[best_idx]
		if best_d > 2.4:
			coop_ally_pos += (t["pos"] - coop_ally_pos).normalized() * 6.4 * dt
		elif _coop_ally_cd <= 0.0:
			_coop_ally_cd = 0.85
			var dmg: float = 42.5
			if bool(t.get("planar_entity", false)):
				dmg = DSTDatabase.planar_entity_absorb(dmg)
			t["hp"] = float(t["hp"]) - dmg
			t["hit_flash"] = 0.18
			push_floating(t["pos"], "동료 -%.0f" % dmg, Color(0.52, 0.96, 0.58))
			if float(t["hp"]) <= 0.0:
				_handle_creature_death(best_idx)
	else:
		var follow_target: Vector2 = player_pos + Vector2(-2.4, 1.6)
		if coop_ally_pos.distance_to(follow_target) > 0.6:
			coop_ally_pos = coop_ally_pos.lerp(follow_target, clamp(dt * 3.8, 0.0, 1.0))
