extends RefCounted
## v14 rules port. Combat magnitudes and encounters are authored simulator data.
## Vector2 +X/right +Y/down maps directly to world X/Z. No Node/physics dependencies.

const Catalog = preload("res://scripts/catalog.gd")
const SAVE_SCHEMA = 1
const ENEMY_LIMIT = 260
const SHOT_LIMIT = 650
const GEM_LIMIT = 580
const GRID_SIZE = 64.0
const BOSS_INTRO_SECONDS = 1.6
const BOSS_RECOVERY_SECONDS = 2.0
const BOSS_WARNING_SECONDS = 8.0
const ENEMY_DATA = {
	"grunt": [30.0, 60.0, 10.0, 12.0, "#9bdb83", 3],
	"runner": [24.0, 102.0, 9.0, 10.0, "#ffb86e", 3],
	"tank": [145.0, 34.0, 17.0, 18.0, "#a99bea", 8],
	"ranged": [46.0, 48.0, 11.0, 12.0, "#70c5e6", 5],
	"elite": [650.0, 53.0, 24.0, 24.0, "#f6c24f", 40],
	"splitter": [98.0, 43.0, 13.0, 17.0, "#c9a0ff", 7],
	"sniper": [58.0, 40.0, 16.0, 12.0, "#f48fb1", 6],
	"mini": [16.0, 115.0, 7.0, 8.0, "#d5baff", 1],
	"boss": [3600.0, 43.0, 32.0, 35.0, "#e36b9c", 90]
}

var catalog = Catalog.new()
var state = "menu"
var config: Dictionary = {}
var player: Dictionary = {}
var elapsed = 0.0
var enemies: Array = []
var shots: Array = []
var enemy_shots: Array = []
var gems: Array = []
var areas: Array = []
var threats: Array = []
var effects: Array = []
var draft: Array = []
var rerolls = 3
var pending_levels = 0
var stats: Dictionary = {}
var notice = ""
var notice_time = 0.0
var run_id = ""
var rng = RandomNumberGenerator.new()
var director_enabled = true
var stage_events: Dictionary = {}
var mission_claims: Dictionary = {}
var encounter: Dictionary = {"active": false, "boss_id": 0, "intro_left": 0.0, "recover_left": 0.0, "role": "", "name": "", "pattern": "", "pattern_time": 0.0}
var last_damage: Dictionary = {"amount": 0.0, "cause": "", "at": 0.0}
var _grid: Dictionary = {}
var _next_id = 1
var _spawn_timer = 0.0
var _regen_clock = 0.0
var _guard_left = 0.0
var _guard_rest = 0.0
var _field_clock = 0.0
var _gold_fraction = 0.0
var _chest_reward = 0
var _rewarded = false
var _resume_state = "playing"
var last_restore_error = ""

func _init() -> void:
	start({}, 14920)
	state = "menu"

func start(options: Dictionary = {}, seed_value: int = 0) -> void:
	config = {
		"weapon": "kunai", "duration": 300, "chapter": 0, "difficulty": "normal",
		"precision": false, "phase": false, "maintainer": false
	}
	for key in config:
		if options.has(key):
			config[key] = options[key]
	if not catalog.balance.mainWeapons.has(str(config.weapon)):
		config.weapon = "kunai"
	config.duration = 900 if int(config.duration) == 900 else 300
	config.chapter = clampi(int(config.chapter), 0, 2)
	config.difficulty = "hard" if config.difficulty == "hard" else "normal"
	for key in ["precision", "phase", "maintainer"]:
		config[key] = config[key] == true
	if seed_value == 0:
		rng.randomize()
	else:
		rng.seed = seed_value
	run_id = "godot_%d_%d" % [Time.get_ticks_usec(), rng.randi()]
	player = {
		"pos": Vector2.ZERO, "facing": PI / 2.0, "hp": float(catalog.balance.baseHP),
		"max_hp": float(catalog.balance.baseHP), "lv": 1, "xp": 0.0, "need": 12.0,
		"gold": 0.0, "levels": {str(config.weapon): 1}, "evolved": {}, "cool": {},
		"invuln": 1.0, "rot": 0.0, "ammo": 6, "reload": 0.0, "moving": false, "r": 16.0
	}
	enemies.clear()
	shots.clear()
	enemy_shots.clear()
	gems.clear()
	areas.clear()
	threats.clear()
	effects.clear()
	draft.clear()
	stage_events.clear()
	mission_claims.clear()
	encounter = _empty_encounter()
	last_damage = {"amount": 0.0, "cause": "", "at": 0.0}
	_grid.clear()
	stats = {"kills": 0, "damage": 0.0, "by_weapon": {}, "taken": 0.0,
		"evolutions": 0, "chests": 0, "blocked": 0, "boss_patterns": 0, "reward": 0}
	elapsed = 0.0
	_spawn_timer = 0.0
	_regen_clock = 0.0
	_guard_left = 0.0
	_guard_rest = 0.0
	_field_clock = 0.0
	_gold_fraction = 0.0
	_chest_reward = 0
	_next_id = 1
	pending_levels = 0
	rerolls = 3
	_rewarded = false
	_resume_state = "playing"
	director_enabled = true
	state = "playing"
	_notify("자동 공격 · 경험치를 모아 빌드를 완성하세요")

func _id() -> int:
	var value = _next_id
	_next_id += 1
	return value

func _notify(message: String, seconds: float = 3.5) -> void:
	notice = message
	notice_time = seconds

func passive_value(key: String) -> float:
	var level = int(player.levels.get(key, 0))
	if level <= 0 or not catalog.definitions.has(key):
		return 0.0
	var values: Array = catalog.definitions[key].get("values", [])
	return float(values[level - 1]) if level <= values.size() else 0.0

func owned(kind: String) -> Array:
	var result: Array = []
	for key in player.levels:
		if int(player.levels[key]) > 0 and catalog.definitions.has(key) and catalog.definitions[key].kind == kind:
			result.append(key)
	return result

func range_power() -> float:
	return 1.0 + passive_value("range")

func duration_power() -> float:
	return 1.0 + passive_value("duration")

func weapon_damage(key: String) -> float:
	if not catalog.balance.weapons.has(key):
		return 0.0
	var level = clampi(int(player.levels.get(key, 1)), 1, 5)
	return float(catalog.balance.weapons[key].damage[level - 1]) * (1.0 + passive_value("atk")) * (1.65 if player.evolved.get(key, false) and key != "destroyer" else 1.0)

func weapon_interval(key: String) -> float:
	var base = float(catalog.balance.weapons[key].cooldown)
	if key == "rocket" and config.maintainer:
		base = maxf(0.1, base - 0.5)
	if player.evolved.get(key, false):
		base *= float({"kunai": 0.24, "shotgun": 0.16, "revolver": 0.8, "drill": 0.78, "guardian": 1.0, "forcefield": 0.8}.get(key, 0.78))
	return base * (1.0 - passive_value("cooldown"))

func forcefield_radius() -> float:
	return (48.0 + 9.0 * int(player.levels.get("forcefield", 0)) + (24.0 if player.evolved.get("forcefield", false) else 0.0)) * range_power()

func guardian_nodes() -> Array:
	var level = int(player.levels.get("guardian", 0))
	var evolved = bool(player.evolved.get("guardian", false))
	if level == 0 or (not evolved and _guard_left <= 0.0):
		return []
	var count = 2 + int(level / 2) + (3 if evolved else 0)
	var radius = (55.0 + level * 7.0) * range_power()
	var result: Array = []
	for i in count:
		result.append(player.pos + Vector2.from_angle(float(player.rot) + i * TAU / count) * radius)
	return result

func drone_positions() -> Array:
	var result: Array = []
	var keys = ["droneA", "droneB", "destroyer"]
	for i in keys.size():
		var key: String = keys[i]
		if player.levels.has(key):
			var angle = float(player.rot) * 0.65 + (PI if i == 1 else PI / 2.0 if i == 2 else 0.0)
			result.append({"kind": key, "pos": player.pos + Vector2.from_angle(angle) * (62.0 if i == 2 else 49.0)})
	return result

func eligible_evolutions() -> Array:
	var result: Array = []
	for key in catalog.evo_pairs:
		if int(player.levels.get(key, 0)) == 5 and int(player.levels.get(catalog.evo_pairs[key], 0)) >= 1 and not player.evolved.get(key, false):
			result.append(key)
	if int(player.levels.get("droneA", 0)) == 5 and int(player.levels.get("droneB", 0)) == 5 and not player.levels.has("destroyer"):
		result.append("destroyer")
	return result

func apply_upgrade(token: String) -> bool:
	if token.begins_with("E:"):
		var key = token.substr(2)
		if not eligible_evolutions().has(key):
			return false
		if key == "destroyer":
			for input_key in ["droneA", "droneB"]:
				player.levels.erase(input_key)
				player.cool.erase(input_key)
			player.levels.destroyer = 5
		player.evolved[key] = true
		player.cool[key] = 0.0
		stats.evolutions += 1
		_check_missions()
		if key == "revolver":
			player.ammo = 10
			player.reload = 0.0
		_effect("evolve", player.pos, "#ffe7a6", 1.2, str(catalog.evo_names.get(key, key)))
		_notify("진화 완료 · " + str(catalog.evo_names.get(key, key)))
		return true
	if not catalog.definitions.has(token):
		return false
	var definition: Dictionary = catalog.definitions[token]
	if definition.get("hidden", false) or int(player.levels.get(token, 0)) >= 5:
		return false
	if definition.get("main", false) and token != config.weapon:
		return false
	if player.levels.has("destroyer") and token in ["droneA", "droneB"]:
		return false
	if not player.levels.has(token) and owned(definition.kind).size() >= 6:
		return false
	var old_max = float(player.max_hp)
	player.levels[token] = int(player.levels.get(token, 0)) + 1
	if token == "hp":
		player.max_hp = float(catalog.balance.baseHP) * (1.0 + passive_value("hp"))
		player.hp = minf(float(player.max_hp), float(player.hp) + float(player.max_hp) - old_max)
	if token == "guardian" and int(player.levels[token]) == 1:
		_guard_left = (float(catalog.balance.guardian.activeBase) + float(catalog.balance.guardian.activePerLevel)) * duration_power()
		_guard_rest = 0.0
	if token == "heal" and int(player.levels[token]) == 1:
		_regen_clock = 0.0
	return true

func _upgrade_options() -> Array:
	var pool: Array = []
	for key in catalog.definitions:
		var definition: Dictionary = catalog.definitions[key]
		if definition.get("hidden", false) or (definition.get("main", false) and key != config.weapon):
			continue
		if int(player.levels.get(key, 0)) >= 5 or (player.levels.has("destroyer") and key in ["droneA", "droneB"]):
			continue
		if player.levels.has(key) or owned(definition.kind).size() < 6:
			pool.append(key)
	var result: Array = []
	var eligible = eligible_evolutions()
	if not eligible.is_empty() and rng.randf() < 0.45:
		result.append("E:" + str(eligible[rng.randi_range(0, eligible.size() - 1)]))
	while result.size() < 3 and not pool.is_empty():
		var weights: Array = []
		var total = 0.0
		for key in pool:
			var weight = 2.1 if player.levels.has(key) else 1.0
			for weapon in catalog.evo_pairs:
				if catalog.evo_pairs[weapon] == key and int(player.levels.get(weapon, 0)) >= 3:
					weight += 1.4
					break
			weights.append(weight)
			total += weight
		var roll = rng.randf() * total
		var selected = pool.size() - 1
		for i in weights.size():
			roll -= float(weights[i])
			if roll < 0.0:
				selected = i
				break
		result.append(pool[selected])
		pool.remove_at(selected)
	if result.is_empty() and not eligible.is_empty():
		result.append("E:" + str(eligible[0]))
	return result

func choose(token: String) -> bool:
	if state not in ["choice", "chest"] or not draft.has(token):
		return false
	var chest = state == "chest"
	if token != "GOLD" and not apply_upgrade(token):
		return false
	if chest:
		if not token.begins_with("E:"):
			player.gold += _chest_reward
			player.hp = minf(float(player.max_hp), float(player.hp) + 25.0)
		stats.chests += 1
		_check_missions()
		_chest_reward = 0
		_effect("heal", player.pos, "#b3ffd1", 0.8, "+보급")
	draft.clear()
	state = "playing"
	_offer_pending()
	return true

func reroll() -> bool:
	if state != "choice" or rerolls <= 0:
		return false
	rerolls -= 1
	draft = _upgrade_options()
	if draft.is_empty():
		state = "playing"
		_offer_pending()
	return true

func _offer_pending() -> void:
	while pending_levels > 0 and state == "playing":
		pending_levels -= 1
		draft = _upgrade_options()
		if not draft.is_empty():
			state = "choice"
			return
		player.hp = minf(float(player.max_hp), float(player.hp) + 15.0)
		player.gold += 5

func gain_xp(amount: float) -> void:
	if not is_finite(amount) or amount <= 0.0 or _rewarded:
		return
	player.xp += amount * (1.0 + passive_value("xp"))
	while player.xp >= player.need and int(player.lv) < 99:
		player.xp -= player.need
		player.lv += 1
		var n = int(player.lv) - 1
		player.need = float(round(12.0 + 7.0 * n + 0.65 * n * n))
		pending_levels += 1
	if int(player.lv) == 99:
		player.xp = minf(float(player.xp), float(player.need) - 1.0)
	if state == "playing":
		_offer_pending()

func pause() -> void:
	if state == "playing":
		_resume_state = state
		state = "paused"

func resume() -> void:
	if state == "paused":
		state = _resume_state
		_offer_pending()

func finish(win: bool) -> void:
	if _rewarded:
		return
	_check_missions()
	_rewarded = true
	state = "won" if win else "lost"
	player.moving = false
	draft.clear()
	stats.reward = int(player.gold) + (100 * (int(config.chapter) + 1) if win else 0)
	_notify("전장 확보 · 생존 성공" if win else "전투 종료 · 다시 도전하세요", 20.0)

func _check_missions() -> void:
	for item in [["kills", 150, 45], ["chests", 2, 50], ["evolutions", 1, 90]]:
		var key = str(item[0])
		if not mission_claims.has(key) and int(stats[key]) >= int(item[1]):
			mission_claims[key] = true
			player.gold += int(item[2])

func spawn_enemy(type: String, pos: Vector2, opts: Dictionary = {}) -> Dictionary:
	if not ENEMY_DATA.has(type) or enemies.size() >= ENEMY_LIMIT:
		return {}
	var data: Array = ENEMY_DATA[type]
	var chapter_multiplier = [1.0, 1.18, 1.35][int(config.chapter)]
	var hard = 1.5 if config.difficulty == "hard" else 1.0
	var scale = (1.0 + minf(elapsed / float(config.duration), 1.0) * 2.0) * hard * chapter_multiplier
	var hp_scale = float(opts.get("hpScale", opts.get("hp_scale", 1.0)))
	var enemy: Dictionary = {
		"id": _id(), "type": type, "pos": pos, "velocity": Vector2.ZERO,
		"hp": float(data[0]) * scale * hp_scale, "max_hp": float(data[0]) * scale * hp_scale,
		"speed": float(data[1]), "damage": float(data[2]) * hard * chapter_multiplier,
		"r": float(data[3]), "color": data[4], "xp": data[5], "hit": 0.0, "phase": 1,
		"facing": 0.0, "attack": rng.randf_range(0.8, 2.0), "busy": 0.0,
		"skill_timer": 3.0, "attack_mode": 0, "age": 0.0, "seed": rng.randf() * TAU,
		"slow": 0.0, "guard_hit": -10.0, "charging": 0.0, "charge_total": 1.0,
		"charge_from": pos, "charge_to": pos, "role": str(opts.get("role", ""))
	}
	if opts.has("summoned_by"):
		enemy.summoned_by = int(opts.summoned_by)
	enemies.append(enemy)
	if type == "boss" and not bool(encounter.active):
		_begin_encounter(enemy, 0.0)
	return enemy

func _spawn_ring(type: String) -> Dictionary:
	var angle = rng.randf() * TAU
	var direction = Vector2.from_angle(angle)
	var distance = minf(700.0 / maxf(0.001, absf(direction.x)), 560.0 / maxf(0.001, absf(direction.y)))
	return spawn_enemy(type, player.pos + direction * distance)

static func _empty_encounter() -> Dictionary:
	return {"active": false, "boss_id": 0, "intro_left": 0.0, "recover_left": 0.0, "role": "", "name": "", "pattern": "", "pattern_time": 0.0}

func active_boss() -> Dictionary:
	# Prefer the tracked encounter; also support direct test/authoring spawns and G1 saves.
	if int(encounter.boss_id) > 0:
		var tracked = _enemy_by_id(int(encounter.boss_id))
		if not tracked.is_empty() and tracked.type == "boss":
			return tracked
	for enemy in enemies:
		if enemy.type == "boss" and float(enemy.hp) > 0.0:
			return enemy
	return {}

func _begin_encounter(boss: Dictionary, intro: float) -> void:
	encounter = _empty_encounter()
	encounter.active = true
	encounter.boss_id = int(boss.id)
	encounter.intro_left = intro
	encounter.role = str(boss.role)
	encounter.name = str(catalog.chapters[int(config.chapter)].get("boss", "보스"))
	if intro > 0.0:
		player.invuln = maxf(float(player.invuln), intro)

func _end_encounter(boss_id: int) -> void:
	if not bool(encounter.active):
		return
	# G1 could save two midbosses at once. Migration preserves those entities
	# and their ongoing attacks; the carried encounter ends only when all die.
	# Transfer the HUD/save owner immediately, including before the next tick.
	for enemy in enemies:
		if int(enemy.get("summoned_by", 0)) == boss_id:
			enemy.hp = 0.0
	var remaining = active_boss()
	if not remaining.is_empty():
		for i in range(threats.size() - 1, -1, -1):
			if int(threats[i].owner_id) == boss_id:
				threats.remove_at(i)
		if int(encounter.boss_id) == boss_id:
			_begin_encounter(remaining, 0.0)
		return
	encounter.active = false
	encounter.boss_id = 0
	encounter.intro_left = 0.0
	encounter.recover_left = BOSS_RECOVERY_SECONDS
	encounter.pattern = ""
	encounter.pattern_time = 0.0
	enemy_shots.clear()
	threats.clear()
	_spawn_timer = 0.35

func _tick_encounter(dt: float) -> void:
	encounter.recover_left = maxf(0.0, float(encounter.recover_left) - dt)
	encounter.pattern_time = maxf(0.0, float(encounter.pattern_time) - dt)
	if float(encounter.pattern_time) <= 0.0:
		encounter.pattern = ""
	if bool(encounter.active):
		if _enemy_by_id(int(encounter.boss_id)).is_empty():
			_end_encounter(int(encounter.boss_id))
		else:
			encounter.intro_left = maxf(0.0, float(encounter.intro_left) - dt)
	else:
		var existing = active_boss()
		if not existing.is_empty():
			_begin_encounter(existing, 0.0)

func spawn_boss(final: bool) -> Dictionary:
	# Direct repeated requests are idempotent. The director keeps due events
	# unclaimed until the active boss and its recovery have finished.
	var existing = active_boss()
	if not existing.is_empty():
		return existing
	for enemy in enemies:
		enemy.hp = 0.0
	enemies.clear()
	enemy_shots.clear()
	threats.clear()
	_grid.clear()
	var boss = spawn_enemy("boss", player.pos + Vector2.from_angle(rng.randf() * TAU) * 260.0, {"role": "final" if final else "mid", "hpScale": 2.5 if final else 0.6})
	_begin_encounter(boss, BOSS_INTRO_SECONDS)
	_notify(("최종" if final else "중간") + " 보스 · " + str(encounter.name) + " · 교전 준비", 5.0)
	_effect("boss_entry", boss.pos, str(boss.color), BOSS_INTRO_SECONDS)
	return boss

func _director(dt: float) -> void:
	if not director_enabled:
		return
	var schedule: Array = [[0.2, "elite1"], [0.32, "supply1"], [0.65, "supply2"], [0.8, "elite2"], [0.91, "supply3"], [1.0, "final"]]
	if int(config.duration) == 900:
		schedule.append([1.0 / 3.0, "mid1"])
		schedule.append([2.0 / 3.0, "mid2"])
	else:
		schedule.append([0.5, "mid1"])
	schedule.sort_custom(func(a, b): return float(a[0]) < float(b[0]))
	var blocked = not active_boss().is_empty() or float(encounter.recover_left) > 0.0
	for item in schedule:
		var key = str(item[1])
		var at = float(item[0]) * float(config.duration)
		var is_boss_event = key.begins_with("mid") or key == "final"
		if is_boss_event and not stage_events.has(key) and not stage_events.has("warn_" + key) and at > elapsed and at - elapsed <= BOSS_WARNING_SECONDS and not blocked:
			stage_events["warn_" + key] = true
			_notify(("최종" if key == "final" else "중간") + " 보스 접근 · " + str(ceili(at - elapsed)) + "초 후 교전", at - elapsed)
		if elapsed < at or stage_events.has(key) or blocked:
			continue
		stage_events[key] = true
		if key.begins_with("elite"):
			_spawn_ring("elite")
			_notify("엘리트 출현 · 처치하고 보급을 확보하세요")
		elif key.begins_with("supply"):
			_add_gem("chest", player.pos + Vector2.from_angle(rng.randf() * TAU) * 135.0, 0)
			_notify("보급 도착 · 금빛 상자를 획득하세요")
		else:
			spawn_boss(key == "final")
			blocked = true
	if blocked:
		return
	var timeline = elapsed / float(config.duration) * 300.0
	_spawn_timer = maxf(-1.0, _spawn_timer - dt)
	if elapsed < float(config.duration) and _spawn_timer <= 0.0 and enemies.size() < ENEMY_LIMIT:
		var count = mini(8, 1 + int(timeline / 38.0))
		for i in count:
			var roll = rng.randf()
			var type = "grunt"
			if timeline > 180.0 and roll < 0.06: type = "sniper"
			elif timeline > 120.0 and roll < 0.13: type = "splitter"
			elif timeline > 95.0 and roll < 0.22: type = "ranged"
			elif timeline > 55.0 and roll < 0.4: type = "tank"
			elif roll < 0.56: type = "runner"
			_spawn_ring(type)
		_spawn_timer = maxf(0.28, 0.8 - timeline * 0.0015)

func _effect(kind: String, pos: Vector2, color: String, life: float = 0.45, text: String = "") -> void:
	if effects.size() >= 120:
		effects.pop_front()
	effects.append({"id": _id(), "kind": kind, "pos": pos, "color": color, "life": life, "max": life, "text": text})

func damage(enemy: Dictionary, amount: float, source: String = "test") -> float:
	if enemy.is_empty() or float(enemy.hp) <= 0.0 or not is_finite(amount) or amount <= 0.0 or _rewarded:
		return 0.0
	var dealt = minf(float(enemy.hp), amount)
	stats.damage += dealt
	stats.by_weapon[source] = float(stats.by_weapon.get(source, 0.0)) + dealt
	enemy.hp = maxf(0.0, float(enemy.hp) - amount)
	enemy.hit = 0.12
	if elapsed - float(enemy.get("text_at", -1.0)) > 0.24:
		_effect("hit", enemy.pos, "#ffe7ad", 0.55, str(roundi(dealt)))
		enemy.text_at = elapsed
	if enemy.type == "boss" and float(enemy.hp) > 0.0 and float(enemy.hp) / float(enemy.max_hp) <= 0.5 and int(enemy.phase) != 2:
		enemy.phase = 2
		_notify("보스 2페이즈 · 공격 패턴 강화")
	if float(enemy.hp) > 0.0:
		return dealt
	if enemy.type == "boss":
		_end_encounter(int(enemy.id))
	stats.kills += 1
	_check_missions()
	_effect("kill", enemy.pos, str(enemy.color), 0.6)
	_add_gem("xp", enemy.pos, float(enemy.xp))
	if enemy.type == "splitter":
		for j in 3:
			spawn_enemy("mini", enemy.pos + Vector2.from_angle(j * TAU / 3.0) * 18.0)
	if enemy.type in ["elite", "boss"]:
		_add_gem("chest", enemy.pos + Vector2(20, 0), 0)
		player.gold += 70 if enemy.type == "boss" else 25
		if enemy.type == "boss" and enemy.role != "final":
			_notify("보스 격파 · 남은 보스와 교전 계속" if not active_boss().is_empty() else "중간 보스 격파 · 보급 상자를 획득하세요")
			for i in 8:
				_add_gem("xp", enemy.pos + Vector2(rng.randf_range(-65, 65), rng.randf_range(-65, 65)), 8)
	if rng.randf() < 0.07:
		_add_gem("heal", enemy.pos + Vector2(10, 0), 15)
	if rng.randf() < 0.18:
		_gold_fraction += 1.0 + passive_value("gold")
		var whole = floori(_gold_fraction + 0.00000001)
		player.gold += whole
		_gold_fraction -= whole
	if rng.randf() < 0.008:
		_add_gem("bomb", enemy.pos + Vector2(0, 15), 0)
	if rng.randf() < 0.004:
		_add_gem("magnet", enemy.pos - Vector2(0, 15), 0)
	if enemy.type == "boss" and enemy.role == "final":
		finish(true)
	return dealt

func hurt(amount: float, cause: String = "contact") -> bool:
	if state != "playing" or float(player.invuln) > 0.0 or float(encounter.intro_left) > 0.0 or not is_finite(amount) or amount <= 0.0:
		return false
	amount = maxf(1.0, amount * (1.0 - passive_value("armor")))
	var actual = minf(float(player.hp), amount)
	if actual <= 0.0:
		return false
	player.hp -= actual
	stats.taken += actual
	last_damage = {"amount": actual, "cause": cause.left(80), "at": elapsed}
	player.invuln = 0.65
	_effect("hurt", player.pos, "#ff657d", 0.4, "−" + str(roundi(actual)))
	if player.hp <= 0.0:
		player.hp = 0.0
		finish(false)
	return true

func _add_gem(type: String, pos: Vector2, value: float) -> void:
	if gems.size() >= GEM_LIMIT:
		if type == "xp":
			for gem in gems:
				if gem.type == "xp":
					gem.value += value
					return
		# Prefer replacing a visual XP pickup over discarding a chest/consumable.
		for i in gems.size():
			if gems[i].type == "xp":
				gems.remove_at(i)
				break
		if gems.size() >= GEM_LIMIT:
			return
	gems.append({"id": _id(), "type": type, "pos": pos, "value": value, "r": 7.0 if type == "xp" else 13.0, "attract": false})

func open_chest() -> void:
	if state != "playing":
		return
	draft.clear()
	var eligible = eligible_evolutions()
	for key in eligible:
		draft.append("E:" + str(key))
	if draft.size() > 3:
		draft.resize(3)
	if draft.is_empty():
		var best = ""
		var best_level = -1
		for key in owned("weapon"):
			var level = int(player.levels[key])
			if key != "destroyer" and level < 5 and level > best_level:
				best = key
				best_level = level
		if not best.is_empty():
			draft.append(best)
	if draft.is_empty():
		draft.append("GOLD")
	_chest_reward = 20 + int(elapsed / 15.0)
	state = "chest"

func _area(kind: String, pos: Vector2, radius: float, life: float, extra: Dictionary = {}) -> Dictionary:
	var value = {"id": _id(), "kind": kind, "pos": pos, "r": radius, "life": life, "max": life}
	value.merge(extra, true)
	areas.append(value)
	if areas.size() > 170:
		areas.pop_front()
	return value

func _projectile(kind: String, pos: Vector2, angle: float, speed: float, amount: float, extra: Dictionary = {}) -> void:
	var velocity = speed * (1.0 + passive_value("projectile"))
	var shot = {"id": _id(), "kind": kind, "source": kind, "pos": pos, "velocity": Vector2.from_angle(angle) * velocity,
		"speed": velocity, "r": 6.0, "life": 2.0 * duration_power(), "damage": amount, "pierce": 0,
		"hit": {}, "color": str(catalog.balance.weapons[kind].color)}
	shot.merge(extra, true)
	shots.append(shot)
	if shots.size() > SHOT_LIMIT:
		shots.pop_front()

func _nearest(pos: Vector2, radius: float = 100000.0, exclude: Dictionary = {}) -> Dictionary:
	var best: Dictionary = {}
	var distance = radius * radius
	for enemy in enemies:
		if float(enemy.hp) <= 0.0 or exclude.has(int(enemy.id)) or exclude.has(str(int(enemy.id))):
			continue
		var square = pos.distance_squared_to(enemy.pos)
		if square < distance:
			distance = square
			best = enemy
	return best

func fire(kind: String) -> bool:
	if not player.levels.has(kind):
		return false
	var level = int(player.levels[kind])
	var target = _nearest(player.pos, 720.0 * range_power())
	var evolved = bool(player.evolved.get(kind, false))
	var amount = weapon_damage(kind)
	var radius_scale = range_power()
	var duration = duration_power()
	var face = float(player.facing)
	var aim = (Vector2(target.pos) - Vector2(player.pos)).angle() if not target.is_empty() else face
	if kind in ["kunai", "rocket", "lightning", "revolver"] and target.is_empty():
		return false
	match kind:
		"kunai":
			var count = 3 if evolved else 2 if level >= 4 else 1
			for i in count:
				_projectile(kind, player.pos, aim + (i - (count - 1) / 2.0) * 0.12, 470, amount, {"homing": true, "pierce": 1 if evolved else 0})
		"bat":
			var radius = (85.0 + level * 10 + (35 if evolved else 0)) * radius_scale
			var spread = PI * (1.6 if evolved else 1.15)
			_area("slash", player.pos, radius, 0.24, {"angle": face, "spread": spread, "color": "#ffcf88"})
			for enemy in enemies.duplicate():
				var delta: Vector2 = enemy.pos - player.pos
				if float(enemy.hp) > 0.0 and delta.length() <= radius + float(enemy.r) and absf(angle_difference(face, delta.angle())) <= spread / 2.0:
					damage(enemy, amount, kind)
					if enemy.type not in ["boss", "elite"]:
						enemy.pos += delta.normalized() * 30.0
		"katana":
			for angle in [face, face + PI]:
				_projectile(kind, player.pos, angle, 420, amount, {"r": 19.0 if evolved else 13.0, "pierce": 99, "life": (0.85 + level * 0.08) * duration})
		"shotgun":
			var count = 3 if evolved else 5 + int(level / 2)
			for i in count:
				_projectile(kind, player.pos, face + (i - (count - 1) / 2.0) * (0.055 if evolved else 0.15), 650, amount, {"r": 4.0, "life": 0.75 * duration, "pierce": 1 if evolved else 0})
		"revolver":
			if float(player.reload) > 0.0:
				return false
			if int(player.ammo) <= 0:
				player.ammo = 10 if evolved else 6
			for i in (2 if evolved else 1):
				_projectile(kind, player.pos, aim + i * 0.1, 720, amount, {"r": 7.0, "pierce": 2 if evolved else 0})
			player.ammo -= 1
			if int(player.ammo) == 0:
				player.reload = float(catalog.balance.revolver.reloadSeconds) * (1.0 - passive_value("cooldown"))
		"rocket":
			_projectile(kind, player.pos, aim, 315, amount, {"r": 9.0, "life": 3.0 * duration, "aoe": (65 + level * 13 + (75 if evolved else 0)) * radius_scale})
		"drill":
			var count = 1 if evolved else mini(3, 1 + int(level / 2))
			for i in count:
				_projectile(kind, player.pos, aim + (i - (count - 1) / 2.0) * 0.25, 580, amount, {"r": 7.0, "life": (3.2 if evolved else 1.8) * duration, "pierce": 99, "homing": evolved})
		"lightning":
			var count = 1 + int(level / 2) + (3 if evolved else 0) + (2 if config.phase else 0)
			var candidates: Array = []
			for enemy in enemies:
				if float(enemy.hp) > 0.0 and Vector2(enemy.pos).distance_to(player.pos) < 700.0 * radius_scale:
					candidates.append(enemy)
			candidates.sort_custom(func(a, b): return Vector2(a.pos).distance_squared_to(player.pos) < Vector2(b.pos).distance_squared_to(player.pos))
			for i in mini(count, candidates.size()):
				var enemy: Dictionary = candidates[i]
				damage(enemy, amount, kind)
				_area("lightning", enemy.pos, 18, 0.25, {"color": "#ace8ff"})
				if evolved:
					var second = _nearest(enemy.pos, 150.0 * radius_scale, {int(enemy.id): true})
					if not second.is_empty():
						damage(second, amount * 0.4, kind)
						_area("link", enemy.pos, 8, 0.18, {"pos2": second.pos, "color": "#ace8ff"})
		"molotov":
			var center: Vector2 = target.pos if not target.is_empty() else player.pos + Vector2.from_angle(face) * 130.0
			var count = 4 if evolved else 1 + int(level / 3)
			for i in count:
				var pos = center + Vector2.from_angle(i * TAU / count) * (70.0 if i > 0 else 0.0)
				_area("fire", pos, (45 + level * 11 + (20 if evolved else 0)) * radius_scale, (3.0 + level * 0.4) * duration, {"tick": 0.0, "damage": amount, "source": kind, "color": "#ff9663"})
		"droneA", "droneB", "destroyer":
			var pos: Vector2 = player.pos
			for drone in drone_positions():
				if drone.kind == kind:
					pos = drone.pos
			var count = 5 if kind == "destroyer" else 2 + int(level / 2)
			var homing = bool(config.precision)
			var phase = float(player.rot) * (-1.0 if kind == "droneB" else 1.0) + (PI if kind == "droneB" else 0.0)
			for i in count:
				var angle = aim + (i - (count - 1) / 2.0) * 0.16 if homing else phase + i * TAU / count
				_projectile(kind, pos, angle, 335 if kind == "droneB" else 440, amount, {"life": 1.5 * duration, "homing": homing, "aoe": (35.0 if kind == "destroyer" else 26.0 if kind == "droneB" else 0.0) * radius_scale})
		"soccer":
			var count = 1 + int(level / 2) + (2 if evolved else 0)
			for i in count:
				_projectile(kind, player.pos, aim + i * TAU / count, 480 if evolved else 360, amount, {"r": 10.0, "life": (2.5 + level * 0.22) * duration, "pierce": 99, "bounce": 14 if evolved else 7, "repeat_timer": 0.22, "origin": player.pos, "bound": 260.0 * radius_scale})
		"brick":
			var count = 8 if evolved else 1 + int(level / 2)
			for i in count:
				var angle = i * TAU / count if evolved else -PI / 2.0 + (i - (count - 1) / 2.0) * 0.2
				_projectile(kind, player.pos, angle, 370 if evolved else 300, amount, {"r": 11.0, "life": 1.25 * duration, "pierce": 99 if level >= 4 or evolved else 1})
		"boomerang":
			for i in (2 if evolved else 1):
				var angle = i * PI
				var pos: Vector2 = player.pos + Vector2.from_angle(angle) * 125.0 * radius_scale if evolved else player.pos
				_projectile(kind, pos, face, 360, amount, {"r": 12.0, "life": 2.5 * duration, "pierce": 99, "returning": not evolved, "return_at": 1.5 * duration, "orbit": evolved, "orbit_angle": angle, "repeat_timer": 0.35})
		_:
			return false
	return true

func _explosion(pos: Vector2, radius: float, amount: float, source: String) -> void:
	_area("explosion", pos, radius, 0.35, {"color": "#ffb36e"})
	for enemy in enemies.duplicate():
		if float(enemy.hp) > 0.0 and Vector2(enemy.pos).distance_to(pos) < radius + float(enemy.r):
			damage(enemy, amount, source)

func _rebuild_grid() -> void:
	_grid.clear()
	for enemy in enemies:
		if float(enemy.hp) <= 0.0:
			continue
		var pos: Vector2 = enemy.pos
		var cell = Vector2i(floori(pos.x / GRID_SIZE), floori(pos.y / GRID_SIZE))
		if not _grid.has(cell):
			_grid[cell] = []
		_grid[cell].append(enemy)

func _query(a: Vector2, b: Vector2, padding: float = 65.0) -> Array:
	var result: Array = []
	for x in range(floori((minf(a.x, b.x) - padding) / GRID_SIZE), floori((maxf(a.x, b.x) + padding) / GRID_SIZE) + 1):
		for y in range(floori((minf(a.y, b.y) - padding) / GRID_SIZE), floori((maxf(a.y, b.y) + padding) / GRID_SIZE) + 1):
			var cell = Vector2i(x, y)
			if _grid.has(cell):
				result.append_array(_grid[cell])
	return result

static func segment_distance(point: Vector2, a: Vector2, b: Vector2) -> float:
	var delta = b - a
	var length_squared = delta.length_squared()
	var fraction = clampf((point - a).dot(delta) / length_squared, 0.0, 1.0) if length_squared > 0.0 else 0.0
	return point.distance_to(a + delta * fraction)

func _update_weapons(dt: float) -> void:
	for key in owned("weapon"):
		if key in ["guardian", "forcefield"]:
			continue
		player.cool[key] = maxf(-1.0, float(player.cool.get(key, 0.0)) - dt)
		if player.cool[key] <= 0.0:
			player.cool[key] = weapon_interval(key) if fire(key) else 0.08
		if state != "playing": return
	if player.levels.has("guardian"):
		if not player.evolved.get("guardian", false):
			if _guard_left > 0.0:
				_guard_left = maxf(0.0, _guard_left - dt)
				if _guard_left == 0.0:
					_guard_rest = float(catalog.balance.guardian.rest) * (1.0 - passive_value("cooldown"))
			else:
				_guard_rest = maxf(0.0, _guard_rest - dt)
				if _guard_rest == 0.0:
					_guard_left = (float(catalog.balance.guardian.activeBase) + int(player.levels.guardian) * float(catalog.balance.guardian.activePerLevel)) * duration_power()
		for pos in guardian_nodes():
			for enemy in _query(pos, pos):
				if float(enemy.hp) > 0.0 and Vector2(enemy.pos).distance_to(pos) < float(enemy.r) + 14.0 and elapsed - float(enemy.guard_hit) >= float(catalog.balance.guardian.retargetInterval):
					damage(enemy, weapon_damage("guardian"), "guardian")
					enemy.guard_hit = elapsed
					if state != "playing": return
	if player.levels.has("forcefield"):
		_field_clock -= dt
		if _field_clock <= 0.0:
			_field_clock = weapon_interval("forcefield")
			for enemy in enemies.duplicate():
				if float(enemy.hp) > 0.0 and Vector2(enemy.pos).distance_to(player.pos) < forcefield_radius() + float(enemy.r):
					damage(enemy, weapon_damage("forcefield"), "forcefield")
					if player.evolved.get("forcefield", false) and float(enemy.hp) > 0.0:
						enemy.slow = 0.55
					if state != "playing": return

func _update_projectiles(dt: float) -> void:
	for i in range(shots.size() - 1, -1, -1):
		if state != "playing": return
		var shot: Dictionary = shots[i]
		shot.life -= dt
		if float(shot.life) <= 0.0:
			shots.remove_at(i)
			continue
		if shot.has("repeat_timer"):
			shot.repeat_timer -= dt
			if float(shot.repeat_timer) <= 0.0:
				shot.hit.clear()
				shot.repeat_timer = 0.22 if shot.kind == "soccer" else 0.35
		var old_pos: Vector2 = shot.pos
		if shot.get("orbit", false):
			shot.orbit_angle += dt * 3.2
			shot.pos = player.pos + Vector2.from_angle(float(shot.orbit_angle)) * 125.0 * range_power()
			shot.velocity = (Vector2(shot.pos) - old_pos) / dt
		else:
			if shot.get("returning", false) and float(shot.life) < float(shot.return_at):
				var direction = (Vector2(player.pos) - Vector2(shot.pos)).normalized()
				shot.velocity = Vector2(shot.velocity).lerp(direction * float(shot.speed), minf(1.0, dt * 9.0))
				if Vector2(shot.pos).distance_to(player.pos) < 22.0:
					shots.remove_at(i)
					continue
			if shot.get("homing", false):
				var target = _nearest(shot.pos, 600.0, shot.hit)
				if not target.is_empty():
					var desired = (Vector2(target.pos) - Vector2(shot.pos)).normalized() * float(shot.speed)
					shot.velocity = Vector2(shot.velocity).lerp(desired, minf(1.0, dt * 8.0))
			shot.pos += shot.velocity * dt
			if shot.has("bound"):
				var relative: Vector2 = shot.pos - shot.origin
				var velocity: Vector2 = shot.velocity
				if absf(relative.x) > float(shot.bound):
					relative.x = clampf(relative.x, -float(shot.bound), float(shot.bound))
					velocity.x *= -1
				if absf(relative.y) > float(shot.bound):
					relative.y = clampf(relative.y, -float(shot.bound), float(shot.bound))
					velocity.y *= -1
				shot.pos = shot.origin + relative
				shot.velocity = velocity
		var candidates: Array = []
		for enemy in _query(old_pos, shot.pos):
			if float(enemy.hp) > 0.0 and not shot.hit.has(int(enemy.id)) and not shot.hit.has(str(int(enemy.id))) and segment_distance(enemy.pos, old_pos, shot.pos) < float(shot.r) + float(enemy.r):
				candidates.append(enemy)
		candidates.sort_custom(func(a, b): return Vector2(a.pos).distance_squared_to(old_pos) < Vector2(b.pos).distance_squared_to(old_pos))
		var remove = false
		for enemy in candidates:
			if float(enemy.hp) <= 0.0: continue
			shot.hit[int(enemy.id)] = true
			if float(shot.get("aoe", 0.0)) > 0.0:
				_explosion(enemy.pos, float(shot.aoe), float(shot.damage), str(shot.source))
			else:
				damage(enemy, float(shot.damage), str(shot.source))
			if int(shot.get("bounce", 0)) > 0:
				var angle = (Vector2(shot.pos) - Vector2(enemy.pos)).angle() + rng.randf_range(-0.5, 0.5)
				shot.velocity = Vector2.from_angle(angle) * float(shot.speed)
				shot.bounce -= 1
				remove = int(shot.bounce) == 0
				break
			var remaining = int(shot.pierce)
			shot.pierce = remaining - 1
			if remaining <= 0:
				remove = true
				break
			if state != "playing": break
		if remove:
			shots.remove_at(i)
	var nodes = guardian_nodes()
	for i in range(enemy_shots.size() - 1, -1, -1):
		if state != "playing": return
		var shot: Dictionary = enemy_shots[i]
		var old_pos: Vector2 = shot.pos
		shot.pos += shot.velocity * dt
		shot.life -= dt
		for node_pos in nodes:
			if segment_distance(node_pos, old_pos, shot.pos) < float(shot.r) + 18.0:
				shot.life = 0.0
				stats.blocked += 1
				_effect("hit", shot.pos, "#aaf5db", 0.25)
				break
		if float(shot.life) > 0.0 and segment_distance(player.pos, old_pos, shot.pos) < float(shot.r) + float(player.r):
			hurt(float(shot.damage), str(shot.kind))
			shot.life = 0.0
		if float(shot.life) <= 0.0:
			enemy_shots.remove_at(i)

func _enemy_projectile(enemy: Dictionary, angle: float, speed: float = 185.0, color: String = "#fa819e", amount_scale: float = 0.8) -> void:
	enemy_shots.append({"id": _id(), "kind": str(enemy.type), "pos": enemy.pos, "velocity": Vector2.from_angle(angle) * speed,
		"r": 6.0, "damage": float(enemy.damage) * amount_scale, "life": 4.0, "color": color})
	if enemy_shots.size() > 350: enemy_shots.pop_front()

func _threat(shape: String, enemy: Dictionary, pos: Vector2, pos2: Vector2, radius: float, warn: float, duration: float, damage_amount: float, pattern: String, width: float = 28.0) -> Dictionary:
	var threat = {"id": _id(), "kind": "line" if shape == "line" else "circle", "shape": shape, "pattern": pattern,
		"owner_id": int(enemy.id), "pos": pos, "pos2": pos2, "r": radius, "width": width, "life": warn + duration,
		"max": warn + duration, "delay": warn, "warn": warn, "duration": duration, "age": 0.0,
		"active": false, "hit": false, "damage": damage_amount, "color": "#7fe5ff" if pattern in ["laser", "ice"] else "#ff927a"}
	threats.append(threat)
	return threat

func boss_pattern(enemy: Dictionary, forced: String = "") -> String:
	if enemy.is_empty() or float(enemy.hp) <= 0.0: return ""
	var phase = int(enemy.phase) == 2
	var patterns: Array = [["charge", "shockwave", "charge"], ["mortar", "summon", "mortar"], ["laser", "ice", "laser"]][int(config.chapter)]
	var type = forced if not forced.is_empty() else str(patterns[int(enemy.attack_mode) % 3])
	enemy.attack_mode += 1
	enemy.busy = 1.2
	enemy.skill_timer = 3.3 if phase else 4.7
	stats.boss_patterns += 1
	var angle = (Vector2(player.pos) - Vector2(enemy.pos)).angle()
	var distance = Vector2(player.pos).distance_to(enemy.pos)
	match type:
		"charge":
			var warn = 0.8 if phase else 1.15
			var end = enemy.pos + Vector2.from_angle(angle) * minf(410.0, distance + 100.0)
			_threat("line", enemy, enemy.pos, end, 0, warn, 0.6, float(enemy.damage), "charge", float(enemy.r) * 1.7)
			enemy.busy = warn + 0.65
		"shockwave":
			_threat("ring", enemy, enemy.pos, enemy.pos, 270.0 if phase else 225.0, 0.95, 1.3, float(enemy.damage) * 0.85, "shock", 16.0)
		"mortar":
			for i in (5 if phase else 3):
				var pos = player.pos + Vector2.from_angle(i * 2.399) * (0.0 if i == 0 else 70.0 + i * 30.0)
				_threat("circle", enemy, pos, pos, 65.0 if phase else 58.0, 1.25 + i * 0.17, 0.4, float(enemy.damage) * 0.8, "mortar")
		"summon":
			_threat("ring", enemy, enemy.pos, enemy.pos, 200, 1.0, 1.15, float(enemy.damage) * 0.65, "summon", 12)
		"laser":
			for i in (2 if phase else 1):
				var end = enemy.pos + Vector2.from_angle(angle + i * 0.48) * minf(850.0, maxf(420.0, distance + 220.0))
				_threat("line", enemy, enemy.pos, end, 0, 1.3 + i * 0.3, 0.65, float(enemy.damage) * 0.85, "laser", 36.0 if phase else 30.0)
			enemy.busy = 2.3 if phase else 2.0
		"ice":
			_threat("circle", enemy, enemy.pos, enemy.pos, 100, 1.0, 0.3, 0.0, "ice")
	if int(encounter.boss_id) == int(enemy.id):
		encounter.pattern = str({"charge": "돌진", "shockwave": "충격파", "mortar": "박격 포격", "summon": "지원 병력", "laser": "레이저", "ice": "얼음 탄막"}.get(type, type))
		encounter.pattern_time = maxf(1.2, float(enemy.busy))
		for threat in threats:
			if int(threat.owner_id) == int(enemy.id):
				encounter.pattern_time = maxf(float(encounter.pattern_time), float(threat.life))
	return type

func _enemy_by_id(value: int) -> Dictionary:
	for enemy in enemies:
		if int(enemy.id) == value and float(enemy.hp) > 0.0:
			return enemy
	return {}

func _update_threats(dt: float) -> void:
	for i in range(threats.size() - 1, -1, -1):
		var threat: Dictionary = threats[i]
		var owner = _enemy_by_id(int(threat.owner_id))
		if owner.is_empty():
			threats.remove_at(i)
			continue
		if int(owner.id) == int(encounter.boss_id) and float(encounter.intro_left) > 0.0:
			continue
		threat.age += dt
		threat.life -= dt
		threat.delay = maxf(0.0, float(threat.warn) - float(threat.age))
		if float(threat.age) >= float(threat.warn) and not threat.active:
			threat.active = true
			match str(threat.pattern):
				"charge":
					owner.charging = float(threat.duration)
					owner.charge_total = float(threat.duration)
					owner.charge_from = threat.pos
					owner.charge_to = threat.pos2
				"sniper":
					_enemy_projectile(owner, (Vector2(threat.pos2) - Vector2(threat.pos)).angle(), 450)
				"ice":
					var count = 20 if int(owner.phase) == 2 else 14
					for j in count:
						if j % 5 != 0:
							_enemy_projectile(owner, j * TAU / count + int(owner.attack_mode) * 0.2, 210, "#85e8ff", 0.65)
				"summon":
					for j in (7 if int(owner.phase) == 2 else 4):
						spawn_enemy("runner" if j % 3 == 0 else "grunt", threat.pos + Vector2.from_angle(j * TAU / 7.0) * 85.0, {"summoned_by": int(owner.id)})
				"mortar":
					_area("explosion", threat.pos, float(threat.r), 0.4, {"color": "#ffc278"})
		var active = float(threat.age) - float(threat.warn)
		if threat.active and active <= float(threat.duration) and threat.pattern not in ["charge", "sniper", "ice"] and not threat.hit:
			var contact = false
			if threat.shape == "circle":
				contact = Vector2(player.pos).distance_to(threat.pos) < float(threat.r) + float(player.r)
			elif threat.shape == "line":
				contact = segment_distance(player.pos, threat.pos, threat.pos2) < float(threat.width) / 2.0 + float(player.r)
			else:
				var radius = float(threat.r) * clampf(active / float(threat.duration), 0.0, 1.0)
				var previous = float(threat.r) * clampf((active - dt) / float(threat.duration), 0.0, 1.0)
				var distance = Vector2(player.pos).distance_to(threat.pos)
				contact = distance >= previous - float(threat.width) - float(player.r) and distance <= radius + float(threat.width) + float(player.r)
			if contact:
				threat.hit = true
				hurt(float(threat.damage), str(threat.pattern))
		if float(threat.life) <= 0.0:
			threats.remove_at(i)
		if state != "playing": return

func _update_enemies(dt: float) -> void:
	for enemy in enemies.duplicate():
		if float(enemy.hp) <= 0.0: continue
		if int(enemy.id) == int(encounter.boss_id) and float(encounter.intro_left) > 0.0:
			enemy.facing = (Vector2(player.pos) - Vector2(enemy.pos)).angle()
			enemy.hit = maxf(0.0, float(enemy.hit) - dt)
			enemy.velocity = Vector2.ZERO
			continue
		enemy.age += dt
		enemy.hit = maxf(0.0, float(enemy.hit) - dt)
		enemy.busy = maxf(0.0, float(enemy.busy) - dt)
		enemy.slow = maxf(0.0, float(enemy.slow) - dt)
		enemy.attack -= dt
		enemy.skill_timer -= dt
		var delta: Vector2 = player.pos - enemy.pos
		var distance = maxf(1.0, delta.length())
		enemy.facing = delta.angle()
		if float(enemy.charging) > 0.0:
			var old_pos: Vector2 = enemy.pos
			enemy.charging = maxf(0.0, float(enemy.charging) - dt)
			enemy.pos = Vector2(enemy.charge_from).lerp(enemy.charge_to, 1.0 - float(enemy.charging) / float(enemy.charge_total))
			if segment_distance(player.pos, old_pos, enemy.pos) < float(enemy.r) + float(player.r):
				hurt(float(enemy.damage), "charge")
			continue
		if enemy.type == "boss" and float(enemy.skill_timer) <= 0.0 and float(enemy.busy) <= 0.0:
			boss_pattern(enemy)
		if enemy.type == "sniper" and float(enemy.attack) <= 0.0 and distance < 730.0 and float(enemy.busy) <= 0.0:
			_threat("line", enemy, enemy.pos, player.pos, 0, 0.85, 0.12, 0, "sniper", 4)
			enemy.busy = 1.0
			enemy.attack = 3.5
		if float(enemy.busy) <= 0.0:
			var retreat = (enemy.type == "ranged" and distance < 230.0) or (enemy.type == "sniper" and distance < 370.0)
			var speed = float(enemy.speed) * (0.8 if float(enemy.slow) > 0.0 else 1.0)
			enemy.velocity = delta / distance * speed * (-0.5 if retreat else 1.0)
			enemy.pos += enemy.velocity * dt
			if enemy.type == "runner":
				enemy.pos += Vector2(-delta.y, delta.x) / distance * sin(float(enemy.age) * 5.0 + float(enemy.seed)) * speed * 0.32 * dt
		if enemy.type == "ranged" and float(enemy.attack) <= 0.0 and distance < 650.0:
			_enemy_projectile(enemy, delta.angle())
			enemy.attack = 2.8
		if Vector2(player.pos).distance_to(enemy.pos) < float(enemy.r) + float(player.r):
			hurt(float(enemy.damage), str(enemy.type))
		if state != "playing": return

func _separate_enemies() -> void:
	for a in enemies:
		if float(a.hp) <= 0.0 or float(a.charging) > 0.0: continue
		for b in _query(a.pos, a.pos, 55):
			if int(b.id) <= int(a.id) or float(b.hp) <= 0.0 or float(b.charging) > 0.0: continue
			var delta: Vector2 = b.pos - a.pos
			var square = delta.length_squared()
			var minimum = (float(a.r) + float(b.r)) * 0.74
			if square > 0.01 and square < minimum * minimum:
				var distance = sqrt(square)
				var shift = delta / distance * (minimum - distance) * 0.17
				a.pos -= shift
				b.pos += shift

func _update_areas(dt: float) -> void:
	for i in range(areas.size() - 1, -1, -1):
		var area: Dictionary = areas[i]
		area.life -= dt
		if area.kind == "fire":
			area.tick -= dt
			if float(area.tick) <= 0.0:
				area.tick = 0.3
				for enemy in enemies.duplicate():
					if float(enemy.hp) > 0.0 and Vector2(enemy.pos).distance_to(area.pos) < float(area.r) + float(enemy.r):
						damage(enemy, float(area.damage), str(area.source))
		if float(area.life) <= 0.0:
			areas.remove_at(i)
		if state != "playing": return

func _update_pickups(dt: float) -> void:
	var pickup_radius = float(catalog.balance.pickupRadius) * (1.0 + passive_value("magnet"))
	for i in range(gems.size() - 1, -1, -1):
		var gem: Dictionary = gems[i]
		var distance = Vector2(player.pos).distance_to(gem.pos)
		if distance < pickup_radius or gem.attract:
			gem.pos = Vector2(gem.pos).lerp(player.pos, minf(1.0, dt * (15.0 if gem.attract else 11.0)))
		if distance < float(player.r) + float(gem.r) + 5.0:
			gems.remove_at(i)
			match str(gem.type):
				"chest": open_chest()
				"bomb":
					for enemy in enemies.duplicate():
						if float(enemy.hp) > 0.0:
							damage(enemy, maxf(80.0, float(enemy.max_hp) * 0.3), "bomb")
					_area("explosion", player.pos, 350.0, 0.5, {"color": "#ffbb63"})
				"magnet":
					for other in gems:
						if other.type == "xp": other.attract = true
					_effect("heal", player.pos, "#c1a3ff", 0.8, "MAGNET")
				"heal":
					player.hp = minf(float(player.max_hp), float(player.hp) + float(gem.value))
					_effect("heal", player.pos, "#b3ffd1", 0.7, "+" + str(int(gem.value)))
				"gold": player.gold += float(gem.value) * (1.0 + passive_value("gold"))
				_: gain_xp(float(gem.value))
			if state != "playing": return

func step(dt: float, movement: Vector2) -> void:
	if state != "playing" or not is_finite(dt) or dt <= 0.0:
		return
	# Root uses 60 Hz. Bound exceptional test/caller deltas so swept movement remains tractable.
	dt = minf(dt, 0.1)
	elapsed += dt
	_tick_encounter(dt)
	notice_time = maxf(0.0, notice_time - dt)
	player.invuln = maxf(0.0, float(player.invuln) - dt)
	player.reload = maxf(0.0, float(player.reload) - dt)
	player.rot = fmod(float(player.rot) + dt * 2.9, TAU)
	if not movement.is_finite(): movement = Vector2.ZERO
	movement = movement.limit_length(1.0)
	player.moving = movement.length() > 0.1
	if player.moving:
		player.pos += movement * float(catalog.balance.baseMoveSpeed) * (1.0 + passive_value("speed")) * dt
		player.facing = movement.angle()
	if player.levels.has("heal"):
		_regen_clock += dt
		while _regen_clock >= 5.0:
			_regen_clock -= 5.0
			var healed = minf(float(player.max_hp) - float(player.hp), float(player.max_hp) * passive_value("heal"))
			player.hp += healed
			if healed > 0.0:
				_effect("heal", player.pos, "#b3ffd1", 0.7, "+%.1f" % healed)
	else:
		_regen_clock = 0.0
	_director(dt)
	_update_threats(dt)
	if state != "playing": return
	_update_enemies(dt)
	if state != "playing": return
	_rebuild_grid()
	_separate_enemies()
	_rebuild_grid()
	_update_weapons(dt)
	if state != "playing": return
	_update_projectiles(dt)
	if state != "playing": return
	_update_areas(dt)
	if state != "playing": return
	_update_pickups(dt)
	for i in range(effects.size() - 1, -1, -1):
		effects[i].life -= dt
		if float(effects[i].life) <= 0.0:
			effects.remove_at(i)
	for i in range(enemies.size() - 1, -1, -1):
		var enemy: Dictionary = enemies[i]
		if float(enemy.hp) <= 0.0 or (enemy.type not in ["boss", "elite"] and Vector2(enemy.pos).distance_to(player.pos) > 2800.0):
			enemies.remove_at(i)

static func _encode(value: Variant) -> Variant:
	if value is Vector2:
		return {"__vec2": [value.x, value.y]}
	if value is Dictionary:
		var result: Dictionary = {}
		for key in value:
			result[str(key)] = _encode(value[key])
		return result
	if value is Array:
		var result: Array = []
		for item in value:
			result.append(_encode(item))
		return result
	return value

static func _decode(value: Variant) -> Variant:
	if value is Dictionary:
		if value.has("__vec2"):
			var v: Array = value.__vec2
			return Vector2(float(v[0]), float(v[1]))
		var result: Dictionary = {}
		for key in value:
			result[key] = _decode(value[key])
		return result
	if value is Array:
		var result: Array = []
		for item in value:
			result.append(_decode(item))
		return result
	return value

func snapshot() -> Dictionary:
	return _encode({"schema": SAVE_SCHEMA, "ruleset": "v14-godot", "state": state, "config": config,
		"player": player, "level_order": player.levels.keys(), "elapsed": elapsed, "enemies": enemies, "shots": shots, "enemy_shots": enemy_shots,
		"gems": gems, "areas": areas, "threats": threats, "effects": effects, "draft": draft,
		"rerolls": rerolls, "pending_levels": pending_levels, "stats": stats, "notice": notice,
		"notice_time": notice_time, "run_id": run_id, "rng_state": str(rng.state), "rng_seed": str(rng.seed),
		"stage_events": stage_events, "mission_claims": mission_claims, "encounter": encounter, "last_damage": last_damage, "next_id": _next_id, "spawn_timer": _spawn_timer,
		"regen_clock": _regen_clock, "guard_left": _guard_left, "guard_rest": _guard_rest,
		"field_clock": _field_clock, "gold_fraction": _gold_fraction, "chest_reward": _chest_reward,
		"rewarded": _rewarded, "resume_state": _resume_state, "director_enabled": director_enabled})

static func _safe_tree(value: Variant, depth: int = 0) -> bool:
	if depth > 16: return false
	if value is float: return is_finite(value) and absf(value) < 1.0e12
	if value is int: return absi(value) < 1000000000000
	if value is String: return value.length() <= 512
	if value is bool or value == null: return true
	if value is Array:
		if value.size() > 1200: return false
		for item in value:
			if not _safe_tree(item, depth + 1): return false
		return true
	if value is Dictionary:
		if value.size() > 1200: return false
		if value.has("__vec2"):
			var vec = value.__vec2
			if not vec is Array or vec.size() != 2: return false
			for coordinate in vec:
				if not (coordinate is int or coordinate is float) or not is_finite(float(coordinate)) or absf(float(coordinate)) > 1000000.0: return false
			return value.size() == 1
		for key in value:
			if not key is String or not _safe_tree(value[key], depth + 1): return false
		return true
	return false

static func _numbers(dict: Dictionary, fields: Array) -> bool:
	for key in fields:
		if not dict.has(key) or not (dict[key] is int or dict[key] is float): return false
	return true

func _invalid(line: int) -> bool:
	last_restore_error = "Invalid snapshot at validation line %d" % line
	return false

func restore(raw: Dictionary) -> bool:
	last_restore_error = ""
	# Validate before touching this instance; malformed imports cannot half-restore a run.
	if not _safe_tree(raw) or int(raw.get("schema", -1)) != SAVE_SCHEMA or raw.get("ruleset") != "v14-godot": return _invalid(4)
	var required = ["config", "player", "stats", "stage_events", "mission_claims"]
	for key in required:
		if not raw.get(key) is Dictionary: return _invalid(7)
	for key in ["enemies", "shots", "enemy_shots", "gems", "areas", "threats", "effects", "draft", "level_order"]:
		if not raw.get(key) is Array: return _invalid(9)
	if not _numbers(raw, ["elapsed", "rerolls", "pending_levels", "next_id", "spawn_timer", "regen_clock", "guard_left", "guard_rest", "field_clock", "gold_fraction", "chest_reward", "notice_time"]): return _invalid(10)
	if raw.get("state") not in ["playing", "paused", "choice", "chest", "won", "lost"]: return _invalid(11)
	if raw.get("resume_state") != "playing" or not raw.get("rewarded") is bool or not raw.get("director_enabled") is bool: return _invalid(12)
	if not raw.get("run_id") is String or str(raw.run_id).is_empty(): return _invalid(13)
	if not raw.get("rng_state") is String or not str(raw.rng_state).is_valid_int() or not raw.get("rng_seed") is String or not str(raw.rng_seed).is_valid_int(): return _invalid(14)
	var data: Dictionary = _decode(raw)
	var c: Dictionary = data.config
	if not catalog.balance.mainWeapons.has(c.get("weapon")) or not _numbers(c, ["duration", "chapter"]) or int(c.get("duration")) not in [300, 900] or int(c.get("chapter")) not in [0, 1, 2] or c.duration != int(c.duration) or c.chapter != int(c.chapter) or c.get("difficulty") not in ["normal", "hard"]: return _invalid(17)
	for key in ["precision", "phase", "maintainer"]:
		if not c.get(key) is bool: return _invalid(19)
	var p: Dictionary = data.player
	if not p.get("pos") is Vector2 or not p.get("levels") is Dictionary or not p.get("evolved") is Dictionary or not p.get("cool") is Dictionary: return _invalid(21)
	if not _numbers(p, ["facing", "hp", "max_hp", "lv", "xp", "need", "gold", "invuln", "rot", "ammo", "reload", "r"]): return _invalid(22)
	if not p.get("moving") is bool or p.hp < 0 or p.hp > p.max_hp or p.max_hp < 1 or p.max_hp > 100000 or p.lv < 1 or p.lv > 99 or p.xp < 0 or p.need < 1 or p.r != 16 or p.gold < 0: return _invalid(23)
	if p.ammo < 0 or p.ammo > 10 or p.ammo != int(p.ammo) or p.reload < 0 or p.reload > 4: return _invalid(24)
	if not p.levels.has(c.weapon): return _invalid(25)
	var counts = {"weapon": 0, "passive": 0}
	for key in p.levels:
		if not catalog.definitions.has(key) or not _numbers(p.levels, [key]): return _invalid(28)
		var level = float(p.levels[key])
		if level < 1 or level > 5 or level != int(level): return _invalid(30)
		if catalog.definitions[key].get("main", false) and key != c.weapon: return _invalid(31)
		counts[catalog.definitions[key].kind] += 1
	if counts.weapon > 6 or counts.passive > 6: return _invalid(33)
	if data.level_order.size() != p.levels.size(): return _invalid(140)
	var ordered_levels: Dictionary = {}
	for key in data.level_order:
		if not key is String or not p.levels.has(key) or ordered_levels.has(key): return _invalid(141)
		ordered_levels[key] = p.levels[key]
	p.levels = ordered_levels
	if p.levels.has("destroyer") and (p.levels.has("droneA") or p.levels.has("droneB")): return _invalid(34)
	for key in p.evolved:
		if not p.levels.has(key) or int(p.levels[key]) != 5 or p.evolved[key] != true or not catalog.evo_names.has(key): return _invalid(36)
		if key != "destroyer" and not p.levels.has(catalog.evo_pairs.get(key, "")): return _invalid(37)
	if p.levels.has("destroyer") and not p.evolved.get("destroyer", false): return _invalid(38)
	for key in p.cool:
		if not p.levels.has(key) or not _numbers(p.cool, [key]) or float(p.cool[key]) < -1 or float(p.cool[key]) > 100: return _invalid(40)
	var hp_level = int(p.levels.get("hp", 0))
	var hp_value = float(catalog.definitions.hp.values[hp_level - 1]) if hp_level > 0 else 0.0
	if not is_equal_approx(float(p.max_hp), float(catalog.balance.baseHP) * (1 + hp_value)): return _invalid(43)
	if data.elapsed < 0 or data.elapsed > 86400 or data.rerolls < 0 or data.rerolls > 3 or data.pending_levels < 0 or data.pending_levels > 98: return _invalid(44)
	if data.regen_clock < 0 or data.regen_clock >= 5.001 or data.guard_left < 0 or data.guard_left > 30 or data.guard_rest < 0 or data.guard_rest > 5 or data.gold_fraction < 0 or data.gold_fraction > 1.001: return _invalid(45)
	if data.enemies.size() > ENEMY_LIMIT or data.shots.size() > SHOT_LIMIT or data.enemy_shots.size() > 350 or data.gems.size() > GEM_LIMIT or data.areas.size() > 170 or data.effects.size() > 120 or data.threats.size() > 350 or data.draft.size() > 3: return _invalid(46)
	if not _numbers(data.stats, ["kills", "damage", "taken", "evolutions", "chests", "blocked", "boss_patterns", "reward"]) or not data.stats.get("by_weapon") is Dictionary: return _invalid(47)
	for key in data.stats.by_weapon:
		if not _numbers(data.stats.by_weapon, [key]) or float(data.stats.by_weapon[key]) < 0: return _invalid(49)
	var ids: Dictionary = {}
	for collection in ["enemies", "shots", "enemy_shots", "gems", "areas", "threats", "effects"]:
		for entity in data[collection]:
			if not entity is Dictionary or not entity.get("pos") is Vector2 or not _numbers(entity, ["id"]) or entity.id < 1 or entity.id >= data.next_id or ids.has(int(entity.id)): return _invalid(53)
			ids[int(entity.id)] = true
			if collection == "enemies":
				if not ENEMY_DATA.has(entity.get("type")) or not _numbers(entity, ["hp", "max_hp", "r", "speed", "damage", "xp", "hit", "phase", "facing", "attack", "busy", "skill_timer", "attack_mode", "age", "seed", "slow", "guard_hit", "charging", "charge_total"]): return _invalid(56)
				if entity.hp < 0 or entity.max_hp <= 0 or entity.hp > entity.max_hp or entity.r <= 0 or entity.r > 100 or entity.charge_total <= 0: return _invalid(57)
				if not entity.get("charge_from") is Vector2 or not entity.get("charge_to") is Vector2 or not entity.get("velocity") is Vector2: return _invalid(58)
				if entity.get("role") not in ["", "mid", "final"] or not entity.get("color") is String: return _invalid(59)
				if entity.has("summoned_by") and (not _numbers(entity, ["summoned_by"]) or entity.summoned_by < 1 or entity.summoned_by != int(entity.summoned_by) or entity.summoned_by >= data.next_id): return _invalid(142)
			elif collection in ["shots", "enemy_shots"]:
				if not _numbers(entity, ["r", "life", "damage"]) or not entity.get("velocity") is Vector2 or not entity.get("kind") is String or not entity.get("color") is String: return _invalid(61)
				if entity.r < 0 or entity.r > 100 or entity.life < -1 or entity.life > 30 or entity.damage < 0 or entity.damage > 1.0e8: return _invalid(62)
				if collection == "shots":
					if not catalog.balance.weapons.has(entity.kind) or not _numbers(entity, ["speed", "pierce"]) or not entity.get("hit") is Dictionary or not entity.get("source") is String: return _invalid(64)
					for optional in ["repeat_timer", "orbit_angle", "return_at", "bound", "aoe", "bounce"]:
						if entity.has(optional) and not _numbers(entity, [optional]): return _invalid(66)
					if entity.get("orbit", false) and not entity.has("orbit_angle"): return _invalid(67)
					if entity.get("returning", false) and not entity.has("return_at"): return _invalid(68)
					if entity.has("bound") and (not entity.get("origin") is Vector2 or float(entity.bound) <= 0): return _invalid(69)
			elif collection == "gems":
				if entity.get("type") not in ["xp", "chest", "heal", "magnet", "bomb", "gold"] or not _numbers(entity, ["value", "r"]) or not entity.get("attract") is bool: return _invalid(71)
			elif collection == "areas":
				if not _numbers(entity, ["r", "life", "max"]) or entity.get("kind") not in ["fire", "slash", "lightning", "explosion", "field", "link"]: return _invalid(73)
				if entity.kind == "fire" and (not _numbers(entity, ["tick", "damage"]) or not entity.get("source") is String): return _invalid(74)
				if entity.kind == "slash" and not _numbers(entity, ["angle", "spread"]): return _invalid(75)
				if entity.kind == "link" and not entity.get("pos2") is Vector2: return _invalid(76)
			elif collection == "threats":
				if not _numbers(entity, ["owner_id", "r", "width", "life", "max", "delay", "warn", "duration", "age", "damage"]) or not entity.get("pos2") is Vector2: return _invalid(78)
				if entity.get("kind") not in ["line", "circle"] or entity.get("shape") not in ["line", "circle", "ring"] or entity.get("pattern") not in ["charge", "shock", "mortar", "summon", "laser", "ice", "sniper"]: return _invalid(79)
				if not entity.get("active") is bool or not entity.get("hit") is bool or entity.duration <= 0: return _invalid(80)
			else:
				if not _numbers(entity, ["life", "max"]) or not entity.get("color") is String or not entity.get("text") is String or not entity.get("kind") is String: return _invalid(82)
	# G1 does not contain encounter/damage metadata. Adopt its live boss without
	# replaying entry effects or resetting in-flight pattern clocks.
	var saved_encounter: Dictionary = _empty_encounter()
	if data.has("encounter"):
		if not data.encounter is Dictionary: return _invalid(143)
		saved_encounter = data.encounter
		if not saved_encounter.get("active") is bool or not _numbers(saved_encounter, ["boss_id", "intro_left", "recover_left", "pattern_time"]): return _invalid(144)
		if saved_encounter.boss_id < 0 or saved_encounter.boss_id != int(saved_encounter.boss_id) or saved_encounter.intro_left < 0 or saved_encounter.intro_left > BOSS_INTRO_SECONDS or saved_encounter.recover_left < 0 or saved_encounter.recover_left > BOSS_RECOVERY_SECONDS or saved_encounter.pattern_time < 0 or saved_encounter.pattern_time > 30: return _invalid(145)
		if saved_encounter.get("role") not in ["", "mid", "final"] or not saved_encounter.get("name") is String or not saved_encounter.get("pattern") is String: return _invalid(146)
		if saved_encounter.active:
			var valid_boss = false
			for enemy in data.enemies:
				if enemy.type == "boss" and enemy.hp > 0 and int(enemy.id) == int(saved_encounter.boss_id) and enemy.role == saved_encounter.role:
					valid_boss = true
					break
			if not valid_boss or saved_encounter.recover_left > 0: return _invalid(147)
		elif saved_encounter.boss_id != 0 or saved_encounter.intro_left != 0 or saved_encounter.pattern_time != 0 or saved_encounter.pattern != "":
			return _invalid(148)
		else:
			for enemy in data.enemies:
				if enemy.type == "boss" and enemy.hp > 0: return _invalid(151)
	else:
		for enemy in data.enemies:
			if enemy.type == "boss" and enemy.hp > 0:
				saved_encounter.active = true
				saved_encounter.boss_id = int(enemy.id)
				saved_encounter.role = str(enemy.role)
				saved_encounter.name = str(catalog.chapters[int(c.chapter)].get("boss", "보스"))
				break
	var saved_damage: Dictionary = {"amount": 0.0, "cause": "", "at": 0.0}
	if data.has("last_damage"):
		if not data.last_damage is Dictionary or not _numbers(data.last_damage, ["amount", "at"]) or not data.last_damage.get("cause") is String: return _invalid(149)
		saved_damage = data.last_damage
		if saved_damage.amount < 0 or saved_damage.amount > data.stats.taken or saved_damage.at < 0 or saved_damage.at > data.elapsed or saved_damage.cause.length() > 80: return _invalid(150)
	var seen_tokens: Dictionary = {}
	for token in data.draft:
		if not token is String or seen_tokens.has(token): return _invalid(85)
		seen_tokens[token] = true
		if token == "GOLD":
			if data.state != "chest": return _invalid(88)
		elif token.begins_with("E:"):
			var key = token.substr(2)
			if key == "destroyer":
				if p.levels.get("droneA", 0) != 5 or p.levels.get("droneB", 0) != 5: return _invalid(92)
			elif not catalog.evo_pairs.has(key) or p.levels.get(key, 0) != 5 or p.levels.get(catalog.evo_pairs[key], 0) < 1 or p.evolved.get(key, false): return _invalid(93)
		else:
			if not catalog.definitions.has(token) or catalog.definitions[token].get("hidden", false) or p.levels.get(token, 0) >= 5: return _invalid(95)
			if catalog.definitions[token].get("main", false) and token != c.weapon: return _invalid(96)
			if not p.levels.has(token) and counts[catalog.definitions[token].kind] >= 6: return _invalid(97)
			if p.levels.has("destroyer") and token in ["droneA", "droneB"]: return _invalid(98)
	if data.state in ["choice", "chest"] and data.draft.is_empty(): return _invalid(99)
	if data.state not in ["choice", "chest"] and not data.draft.is_empty(): return _invalid(100)
	if bool(data.rewarded) != (data.state in ["won", "lost"]): return _invalid(101)
	config = c
	player = p
	state = data.state
	elapsed = float(data.elapsed)
	enemies = data.enemies
	shots = data.shots
	enemy_shots = data.enemy_shots
	gems = data.gems
	areas = data.areas
	threats = data.threats
	effects = data.effects
	draft = data.draft
	rerolls = int(data.rerolls)
	pending_levels = int(data.pending_levels)
	stats = data.stats
	notice = str(data.get("notice", ""))
	notice_time = float(data.notice_time)
	run_id = str(data.run_id)
	rng.seed = str(data.rng_seed).to_int()
	rng.state = str(data.rng_state).to_int()
	stage_events = data.stage_events
	mission_claims = data.mission_claims
	encounter = saved_encounter
	last_damage = saved_damage
	_next_id = int(data.next_id)
	_spawn_timer = float(data.spawn_timer)
	_regen_clock = float(data.regen_clock)
	_guard_left = float(data.guard_left)
	_guard_rest = float(data.guard_rest)
	_field_clock = float(data.field_clock)
	_gold_fraction = float(data.gold_fraction)
	_chest_reward = int(data.chest_reward)
	_rewarded = bool(data.rewarded)
	_resume_state = str(data.resume_state)
	director_enabled = bool(data.director_enabled)
	_rebuild_grid()
	return true
