extends RefCounted
## Pure GDScript simulation core for TangTang Commando (Survivor.io).
## Handles player movement, dash, hero active skills, 9 weapons + evolutions,
## 11 enemy types, spatial hash grid, telegraphed bosses, pickups, and meta saves.

const Data := preload("res://Scripts/SurvivorData.gd")
const GRID_SIZE := 64.0
const MAX_ENEMIES := 260
const MAX_SHOTS := 650
const MAX_ENEMY_SHOTS := 350
const MAX_GEMS := 580
const MAX_PARTICLES := 360
const MAX_TEXTS := 55
const SAVE_PATH := "user://survivor_io_save.cfg"

var rng := RandomNumberGenerator.new()

# Meta profile
var profile: Dictionary = {
	"hero": "assault",
	"gold": 0,
	"attack": 0,
	"hp": 0,
	"armor": 0,
	"best_kills": 0,
	"wins": 0,
	"runs": 0,
	"unlocked": 1,
}

# Run configuration
var selected_hero := "assault"
var chapter := 0
var difficulty := "normal"
var starting_weapon := "kunai"

# Live run state
var state := "menu" # menu, playing, levelup, paused, win, dead
var elapsed := 0.0
var spawn_timer := 0.0
var next_hazard := 120.0
var shake := 0.0
var flash := 0.0
var enemy_seq := 0
var pending_levels := 0
var rerolls := 3
var banishes := 2
var banished: Dictionary = {}
var stage_events: Dictionary = {}
var mission_claims: Dictionary = {}
var dash_cooldown := 0.0
var dash_time := 0.0
var dash_dir := Vector2(0.0, 1.0)
var hero_skill_cd := 0.0

var player: Dictionary = {}
var enemies: Array[Dictionary] = []
var shots: Array[Dictionary] = []
var enemy_shots: Array[Dictionary] = []
var gems: Array[Dictionary] = []
var areas: Array[Dictionary] = []
var threats: Array[Dictionary] = []
var particles: Array[Dictionary] = []
var texts: Array[Dictionary] = []
var turrets: Array[Dictionary] = []
var beacons: Array[Dictionary] = []
var level_choices: Array[Dictionary] = []
var run_stats: Dictionary = {}
var last_result: Dictionary = {}
var toast_text := ""
var toast_timer := 0.0
var sfx_events: Array[String] = []

var _enemy_grid: Dictionary = {}


func _init(seed_value: int = 0) -> void:
	if seed_value > 0:
		rng.seed = seed_value
	else:
		rng.randomize()


func load_profile(path: String = SAVE_PATH) -> void:
	var cfg := ConfigFile.new()
	if not FileAccess.file_exists(path) or cfg.load(path) != OK:
		return
	var hero := str(cfg.get_value("profile", "hero", "assault"))
	profile["hero"] = hero if Data.HEROES.has(hero) else "assault"
	profile["gold"] = maxi(0, int(cfg.get_value("profile", "gold", 0)))
	profile["attack"] = clampi(int(cfg.get_value("profile", "attack", 0)), 0, 50)
	profile["hp"] = clampi(int(cfg.get_value("profile", "hp", 0)), 0, 50)
	profile["armor"] = clampi(int(cfg.get_value("profile", "armor", 0)), 0, 13)
	profile["best_kills"] = maxi(0, int(cfg.get_value("profile", "best_kills", 0)))
	profile["wins"] = maxi(0, int(cfg.get_value("profile", "wins", 0)))
	profile["runs"] = maxi(0, int(cfg.get_value("profile", "runs", 0)))
	profile["unlocked"] = clampi(int(cfg.get_value("profile", "unlocked", 1)), 1, Data.CHAPTERS.size())
	selected_hero = str(profile["hero"])


func save_profile(path: String = SAVE_PATH) -> void:
	var cfg := ConfigFile.new()
	for key in profile.keys():
		cfg.set_value("profile", key, profile[key])
	cfg.save(path)


func upgrade_cost(stat_key: String) -> int:
	if not Data.META_UPGRADES.has(stat_key):
		return 999999
	var meta: Dictionary = Data.META_UPGRADES[stat_key]
	return int(meta["base_cost"]) + int(profile.get(stat_key, 0)) * int(meta["step_cost"])


func buy_meta_upgrade(stat_key: String) -> bool:
	if not Data.META_UPGRADES.has(stat_key):
		return false
	var cost := upgrade_cost(stat_key)
	if int(profile["gold"]) < cost:
		return false
	profile["gold"] = int(profile["gold"]) - cost
	profile[stat_key] = int(profile.get(stat_key, 0)) + 1
	save_profile()
	_push_sfx("upgrade")
	return true


func base_hp() -> float:
	return 100.0 + float(profile.get("hp", 0)) * 15.0


func attack_power() -> float:
	var lv_atk := int(player.get("levels", {}).get("atk", 0))
	return (1.0 + 0.12 * float(lv_atk)) * (1.0 + 0.08 * float(profile.get("attack", 0)))


func move_speed() -> float:
	var lv_spd := int(player.get("levels", {}).get("speed", 0))
	return 190.0 * (1.0 + 0.09 * float(lv_spd))


func range_power() -> float:
	var lv_rng := int(player.get("levels", {}).get("range", 0))
	return 1.0 + 0.08 * float(lv_rng)


func weapon_level(kind: String) -> int:
	return clampi(int(player.get("levels", {}).get(kind, 1)), 1, 5)


func weapon_damage(kind: String) -> float:
	var spec: Dictionary = Data.WEAPON_DATA[kind]
	var damages: Array = spec["damage"]
	var dmg := float(damages[weapon_level(kind) - 1]) * attack_power()
	if bool(player.get("evolved", {}).get(kind, false)) and kind != "destroyer":
		dmg *= 1.8
	return dmg


func weapon_interval(kind: String) -> float:
	var spec: Dictionary = Data.WEAPON_DATA[kind]
	var lv_cd := int(player.get("levels", {}).get("cooldown", 0))
	var base := float(spec["cooldown"]) * maxf(0.35, 1.0 - 0.07 * float(lv_cd))
	var interval := base / (1.0 + 0.1 * float(weapon_level(kind) - 1))
	if bool(player.get("evolved", {}).get(kind, false)) and kind != "destroyer":
		interval /= 1.4
	return maxf(0.08, interval)


func owned_keys(kind_filter: String) -> Array[String]:
	var out: Array[String] = []
	var levels: Dictionary = player.get("levels", {})
	for key in levels.keys():
		if int(levels[key]) > 0 and Data.DEFINITIONS.has(key) and str(Data.DEFINITIONS[key]["kind"]) == kind_filter:
			out.append(str(key))
	return out


func evolution_eligible() -> Array[String]:
	var out: Array[String] = []
	var levels: Dictionary = player.get("levels", {})
	var evolved: Dictionary = player.get("evolved", {})
	for w in Data.EVO_PAIRS.keys():
		var p: String = Data.EVO_PAIRS[w]
		if int(levels.get(w, 0)) >= 5 and int(levels.get(p, 0)) > 0 and not bool(evolved.get(w, false)):
			out.append(str(w))
	if int(levels.get("droneA", 0)) >= 5 and int(levels.get("droneB", 0)) >= 5 and not bool(evolved.get("destroyer", false)):
		out.append("destroyer")
	return out


func start_run(hero_id: String = "", chapter_index: int = -1, start_weapon: String = "kunai") -> void:
	if Data.HEROES.has(hero_id):
		selected_hero = hero_id
		profile["hero"] = hero_id
	if chapter_index >= 0 and chapter_index < Data.CHAPTERS.size():
		chapter = chapter_index
	starting_weapon = start_weapon if Data.WEAPON_DATA.has(start_weapon) else "kunai"

	enemies.clear()
	shots.clear()
	enemy_shots.clear()
	gems.clear()
	areas.clear()
	threats.clear()
	particles.clear()
	texts.clear()
	turrets.clear()
	beacons.clear()
	level_choices.clear()
	banished.clear()
	stage_events.clear()
	mission_claims.clear()
	sfx_events.clear()

	elapsed = 0.0
	spawn_timer = 0.2
	next_hazard = 120.0
	shake = 0.0
	flash = 0.0
	enemy_seq = 0
	pending_levels = 0
	rerolls = 3
	banishes = 2
	dash_cooldown = 0.0
	dash_time = 0.0
	dash_dir = Vector2(0.0, 1.0)
	hero_skill_cd = 0.0
	last_result = {}

	var max_hp := base_hp()
	player = {
		"pos": Vector2.ZERO,
		"r": 16.0,
		"hp": max_hp,
		"max_hp": max_hp,
		"xp": 0.0,
		"need": Data.next_xp(1),
		"lv": 1,
		"kills": 0,
		"gold": 0,
		"inv": 1.0,
		"levels": {starting_weapon: 1},
		"evolved": {},
		"cool": {},
		"facing": PI * 0.5,
		"anim": 0.0,
		"moving": false,
		"rot": 0.0,
	}
	run_stats = {
		"damage": 0.0,
		"taken": 0.0,
		"chests": 0,
		"evolutions": 0,
		"elites": 0,
		"by_weapon": {},
		"mission_gold": 0,
	}
	profile["runs"] = int(profile.get("runs", 0)) + 1
	state = "playing"
	var hero_info: Dictionary = Data.HEROES[selected_hero]
	var chap_info: Dictionary = Data.CHAPTERS[chapter]
	show_toast("%s 출격 · E키로 %s 발동" % [str(chap_info["name"]), str(hero_info["skill"])])


func toggle_pause() -> void:
	if state == "playing":
		state = "paused"
	elif state == "paused":
		state = "playing"


func show_toast(msg: String, duration: float = 3.0) -> void:
	toast_text = msg
	toast_timer = duration


func consume_sfx() -> Array[String]:
	var out := sfx_events.duplicate()
	sfx_events.clear()
	return out


func _push_sfx(name: String) -> void:
	if sfx_events.size() < 12:
		sfx_events.append(name)


func trigger_dash(move_vec: Vector2) -> bool:
	if state != "playing" or dash_cooldown > 0.0:
		return false
	if move_vec.length() > 0.12:
		dash_dir = move_vec.normalized()
	dash_cooldown = 4.5
	dash_time = 0.23
	player["inv"] = maxf(float(player["inv"]), 0.32)
	_spawn_particles(player["pos"], Color("a5ffdb"), 10, 1.0)
	_push_sfx("dash")
	return true


func trigger_hero_skill() -> bool:
	if state != "playing" or hero_skill_cd > 0.0:
		return false
	var hero: Dictionary = Data.HEROES[selected_hero]
	hero_skill_cd = float(hero["cooldown"])
	var ppos: Vector2 = player["pos"]
	if selected_hero == "assault":
		var radius := 180.0 * range_power()
		var dmg := 85.0 * attack_power()
		for e in enemies:
			if float(e["hp"]) > 0.0 and ppos.distance_to(e["pos"]) <= radius + float(e["r"]):
				damage_enemy(e, dmg, "hero_skill")
				var push: Vector2 = ((e["pos"] as Vector2) - ppos).normalized()
				e["pos"] = (e["pos"] as Vector2) + push * 45.0
		enemy_shots.clear()
		player["inv"] = maxf(float(player["inv"]), 0.8)
		areas.append({"kind": "blast", "pos": ppos, "r": radius, "life": 0.35, "max": 0.35, "color": Color("37bea1")})
		shake = maxf(shake, 6.0)
		show_toast("충격파 발동 · 탄막 제거!")
	elif selected_hero == "engineer":
		turrets.append({"pos": ppos, "life": 10.0, "max": 10.0, "cool": 0.0})
		_spawn_particles(ppos, Color("f2b65e"), 14, 1.0)
		show_toast("자동 포탑 설치 (10초)")
	else:
		areas.append({"kind": "heal_field", "pos": ppos, "r": 135.0 * range_power(), "life": 6.0, "max": 6.0, "tick": 0.0, "color": Color("69c3e1")})
		show_toast("회복장 전개 (6초)")
	_push_sfx("skill")
	return true


func update(dt: float, move_input: Vector2, view_half: Vector2 = Vector2(270.0, 480.0)) -> void:
	var step := clampf(dt, 0.0, 0.05)
	toast_timer = maxf(0.0, toast_timer - step)
	if state != "playing" or step <= 0.0:
		return

	elapsed += step
	dash_cooldown = maxf(0.0, dash_cooldown - step)
	hero_skill_cd = maxf(0.0, hero_skill_cd - step)
	player["inv"] = maxf(0.0, float(player["inv"]) - step)
	player["rot"] = float(player["rot"]) + step * 2.9
	shake = maxf(0.0, shake - step * 18.0)
	flash = maxf(0.0, flash - step)

	var len := move_input.length()
	player["moving"] = len > 0.1 or dash_time > 0.0
	if bool(player["moving"]):
		player["anim"] = float(player["anim"]) + step * (23.0 if dash_time > 0.0 else 13.0)

	var ppos: Vector2 = player["pos"]
	if dash_time > 0.0:
		var active := minf(step, dash_time)
		ppos += dash_dir * move_speed() * 3.6 * active
		dash_time = maxf(0.0, dash_time - step)
		player["facing"] = dash_dir.angle()
	elif len > 0.1:
		var dir := move_input / maxf(1.0, len)
		ppos += dir * move_speed() * step
		player["facing"] = dir.angle()
		dash_dir = dir.normalized()
	player["pos"] = ppos

	var heal_lv := int(player["levels"].get("heal", 0))
	if heal_lv > 0:
		player["hp"] = minf(float(player["max_hp"]), float(player["hp"]) + float(player["max_hp"]) * 0.004 * float(heal_lv) * step)

	_director(step, view_half)
	_update_turrets(step)
	_update_beacons(step)
	if state != "playing":
		return
	_update_threats(step)
	if state != "playing":
		return
	_update_enemies(step)
	if state != "playing":
		return
	_rebuild_grid()
	_separate_enemies()
	_rebuild_grid()
	_update_weapons(step)
	if state != "playing":
		return
	_update_projectiles(step)
	if state != "playing":
		return
	_update_areas(step)
	if state != "playing":
		return
	_update_pickups(step)
	_update_vfx(step)
	_prune_enemies(maxf(view_half.x, view_half.y) * 2.5)
	_check_missions()


func spawn_enemy(enemy_type: String, pos: Vector2, options: Dictionary = {}) -> Dictionary:
	if not Data.ENEMY_DATA.has(enemy_type):
		return {}
	var t: Dictionary = Data.ENEMY_DATA[enemy_type]
	var chap_mult := float(Data.CHAPTERS[chapter]["mult"])
	var diff_mult := 1.5 if difficulty == "hard" else 1.0
	var scale := (1.0 + elapsed / 150.0) * diff_mult * chap_mult
	var hp := float(t["hp"]) * scale * float(options.get("hp_scale", 1.0))
	enemy_seq += 1
	var e := {
		"id": enemy_seq,
		"type": enemy_type,
		"pos": pos,
		"r": float(t["r"]),
		"hp": hp,
		"max": hp,
		"speed": float(t["speed"]),
		"dmg": float(t["dmg"]) * diff_mult * chap_mult,
		"color": t["color"],
		"xp": int(t["xp"]),
		"attack": rng.randf_range(0.8, 2.0),
		"hit": 0.0,
		"phase": 1,
		"charging": 0.0,
		"charge_from": pos,
		"charge_to": pos,
		"charge_total": 0.5,
		"busy": 0.0,
		"skill_timer": 3.0,
		"attack_mode": 0,
		"age": 0.0,
		"seed": rng.randf_range(0.0, TAU),
		"guard_hit": -10.0,
		"text_at": -10.0,
		"role": str(options.get("role", "")),
	}
	enemies.append(e)
	return e


func spawn_ring(enemy_type: String, view_half: Vector2) -> Dictionary:
	var a := rng.randf_range(0.0, TAU)
	var rx := view_half.x + 56.0
	var ry := view_half.y + 68.0
	var c := cos(a)
	var s := sin(a)
	var d := minf(rx / maxf(0.001, absf(c)), ry / maxf(0.001, absf(s)))
	var ppos: Vector2 = player["pos"]
	return spawn_enemy(enemy_type, ppos + Vector2(c * d, s * d))


func spawn_boss(is_final: bool) -> Dictionary:
	var a := rng.randf_range(0.0, TAU)
	var ppos: Vector2 = player["pos"]
	var e := spawn_enemy("boss", ppos + Vector2(cos(a), sin(a)) * 220.0, {
		"role": "final" if is_final else "mid",
		"hp_scale": 6.0 if is_final else 0.38,
	})
	if is_final:
		enemy_shots.clear()
		threats.clear()
		for i in range(enemies.size() - 1, -1, -1):
			var other := enemies[i]
			if other["id"] != e["id"] and other["type"] not in ["boss", "elite"]:
				enemies.remove_at(i)
	show_toast("%s 보스 출현 · %s" % ["최종" if is_final else "중간", str(Data.CHAPTERS[chapter]["boss"])], 4.0)
	_push_sfx("warn")
	return e


func damage_enemy(e: Dictionary, amount: float, source: String = "other") -> float:
	if e.is_empty() or float(e["hp"]) <= 0.0 or amount <= 0.0 or state in ["win", "dead"]:
		return 0.0
	var dealt := minf(float(e["hp"]), amount)
	run_stats["damage"] = float(run_stats["damage"]) + dealt
	var by_w: Dictionary = run_stats["by_weapon"]
	by_w[source] = float(by_w.get(source, 0.0)) + dealt
	e["hp"] = float(e["hp"]) - amount
	e["hit"] = 0.1
	if elapsed - float(e["text_at"]) > 0.22:
		_float_text(e["pos"], str(int(roundf(dealt))), Color("fff3b1"))
		e["text_at"] = elapsed
	if e["type"] == "boss" and float(e["hp"]) > 0.0 and float(e["hp"]) / float(e["max"]) <= 0.5 and int(e["phase"]) != 2:
		e["phase"] = 2
		show_toast("보스 2페이즈 · 패턴 강화!", 3.5)
		_push_sfx("warn")
		_spawn_particles(e["pos"], Color("f19ab0"), 24, 1.2)
	if float(e["hp"]) > 0.0:
		return dealt

	player["kills"] = int(player["kills"]) + 1
	_push_sfx("kill")
	_spawn_particles(e["pos"], e["color"], 30 if e["type"] == "boss" else 6, 1.0)
	_add_xp_gem(e["pos"], int(e["xp"]))

	if e["type"] == "splitter" and enemies.size() < MAX_ENEMIES - 5:
		for j in 3:
			var a := float(j) * TAU / 3.0
			spawn_enemy("mini", e["pos"] + Vector2(cos(a), sin(a)) * 18.0)
	if e["type"] in ["elite", "boss"]:
		run_stats["elites"] = int(run_stats["elites"]) + 1
		gems.append({"pos": e["pos"] + Vector2(20, 0), "r": 13.0, "val": 0, "kind": "chest", "attract": false})
		player["gold"] = int(player["gold"]) + (70 if e["type"] == "boss" else 25)
		if e["type"] == "boss" and str(e["role"]) != "final":
			show_toast("중간 보스 격파! 금빛 보급 상자를 획득하세요", 3.5)
			for _k in 8:
				_add_xp_gem(e["pos"] + Vector2(rng.randf_range(-65, 65), rng.randf_range(-65, 65)), 8)

	var roll := rng.randf()
	if roll < 0.07:
		gems.append({"pos": e["pos"] + Vector2(10, 0), "r": 8.0, "val": 0, "kind": "heal", "attract": false})
	elif roll < 0.078:
		gems.append({"pos": e["pos"] + Vector2(0, 12), "r": 11.0, "val": 0, "kind": "bomb", "attract": false})
	elif roll < 0.084:
		gems.append({"pos": e["pos"] + Vector2(-10, 0), "r": 11.0, "val": 0, "kind": "shield", "attract": false})
	elif roll < 0.088:
		gems.append({"pos": e["pos"] + Vector2(0, -12), "r": 10.0, "val": 0, "kind": "magnet", "attract": false})
	if rng.randf() < 0.18:
		player["gold"] = int(player["gold"]) + 1
	if e["type"] == "boss" and str(e["role"]) == "final":
		_finish_run(true)
	return dealt


func hurt_player(raw_amount: float) -> bool:
	if state != "playing" or float(player["inv"]) > 0.0 or dash_time > 0.0 or raw_amount <= 0.0:
		return false
	var meta_red := minf(0.6, float(profile.get("armor", 0)) * 0.045)
	var pass_red := 0.08 * float(player["levels"].get("armor", 0))
	var amount := maxf(1.0, raw_amount * (1.0 - meta_red) * (1.0 - pass_red))
	var actual := minf(float(player["hp"]), amount)
	player["hp"] = float(player["hp"]) - actual
	run_stats["taken"] = float(run_stats["taken"]) + actual
	player["inv"] = 0.65
	shake = 8.0
	flash = 0.3
	_spawn_particles(player["pos"], Color("ff7a83"), 12, 1.0)
	_push_sfx("hurt")
	if float(player["hp"]) <= 0.0:
		player["hp"] = 0.0
		_finish_run(false)
	return true


func gain_xp(amount: float) -> void:
	if amount <= 0.0 or state in ["win", "dead"]:
		return
	var mult := 1.0 + 0.08 * float(player["levels"].get("magnet", 0))
	player["xp"] = float(player["xp"]) + amount * mult
	while float(player["xp"]) >= float(player["need"]) and int(player["lv"]) < 99:
		player["xp"] = float(player["xp"]) - float(player["need"])
		player["lv"] = int(player["lv"]) + 1
		player["need"] = Data.next_xp(int(player["lv"]))
		pending_levels += 1
	if pending_levels > 0 and state == "playing":
		pending_levels -= 1
		_open_levelup()


func apply_upgrade(key: String) -> bool:
	if key == "gold_bonus":
		player["gold"] = int(player["gold"]) + 35
		player["hp"] = minf(float(player["max_hp"]), float(player["hp"]) + 20.0)
		_push_sfx("upgrade")
		return true
	if not Data.DEFINITIONS.has(key):
		return false
	var levels: Dictionary = player["levels"]
	var cur := int(levels.get(key, 0))
	if cur >= 5:
		return false
	var kind: String = str(Data.DEFINITIONS[key]["kind"])
	if cur == 0 and owned_keys(kind).size() >= 6:
		return false
	var old_max := float(player["max_hp"])
	levels[key] = cur + 1
	if key == "hp":
		player["max_hp"] = base_hp() * (1.0 + 0.15 * float(levels["hp"]))
		player["hp"] = minf(float(player["max_hp"]), float(player["hp"]) + (float(player["max_hp"]) - old_max))
	_push_sfx("upgrade")
	return true


func evolve_weapon(key: String) -> bool:
	if key not in evolution_eligible():
		return false
	var levels: Dictionary = player["levels"]
	if key == "destroyer":
		levels.erase("droneA")
		levels.erase("droneB")
		(player["cool"] as Dictionary).erase("droneA")
		(player["cool"] as Dictionary).erase("droneB")
		levels["destroyer"] = 5
	player["evolved"][key] = true
	run_stats["evolutions"] = int(run_stats["evolutions"]) + 1
	_push_sfx("evolve")
	_spawn_particles(player["pos"], Color("ffe7a6"), 36, 1.3)
	show_toast("무기 진화! %s" % str(Data.EVOLUTION_NAMES.get(key, key)), 3.8)
	_check_missions()
	return true


func pick_level_choice(index: int) -> bool:
	if state != "levelup" or index < 0 or index >= level_choices.size():
		return false
	var choice: Dictionary = level_choices[index]
	if bool(choice.get("is_evo", false)):
		evolve_weapon(str(choice["key"]))
	else:
		apply_upgrade(str(choice["key"]))
	level_choices.clear()
	if pending_levels > 0:
		pending_levels -= 1
		_open_levelup()
	else:
		state = "playing"
	return true


func reroll_level_choices() -> bool:
	if state != "levelup" or rerolls <= 0:
		return false
	rerolls -= 1
	level_choices = _build_upgrade_choices()
	return true


func banish_level_choice(index: int) -> bool:
	if state != "levelup" or banishes <= 0 or index < 0 or index >= level_choices.size():
		return false
	var choice: Dictionary = level_choices[index]
	if bool(choice.get("is_evo", false)) or str(choice["key"]) == "gold_bonus":
		return false
	banishes -= 1
	banished[str(choice["key"])] = true
	level_choices = _build_upgrade_choices()
	return true


func _open_levelup() -> void:
	level_choices = _build_upgrade_choices()
	state = "levelup"
	_push_sfx("level")


func _build_upgrade_choices() -> Array[Dictionary]:
	var choices: Array[Dictionary] = []
	var evos := evolution_eligible()
	if not evos.is_empty():
		var evo_key := evos[0]
		choices.append({
			"key": evo_key,
			"is_evo": true,
			"title": str(Data.EVOLUTION_NAMES[evo_key]),
			"badge": "★ 진화",
			"desc": str(Data.EVOLUTION_DESCS[evo_key]),
			"kind": "weapon",
		})

	var w_count := owned_keys("weapon").size()
	var p_count := owned_keys("passive").size()
	var levels: Dictionary = player["levels"]
	var pool: Array[String] = []
	for key in Data.DEFINITIONS.keys():
		var def: Dictionary = Data.DEFINITIONS[key]
		if bool(def["hidden"]) or banished.has(key):
			continue
		if int(levels.get("destroyer", 0)) > 0 and key in ["droneA", "droneB"]:
			continue
		var cur := int(levels.get(key, 0))
		if cur >= 5:
			continue
		if cur == 0:
			var kind := str(def["kind"])
			if (kind == "weapon" and w_count >= 6) or (kind == "passive" and p_count >= 6):
				continue
		pool.append(str(key))

	while not pool.is_empty() and choices.size() < 3:
		var total_w := 0.0
		var weights: Array[float] = []
		for k in pool:
			var w := 2.1 if int(levels.get(k, 0)) > 0 else 1.0
			for wk in Data.EVO_PAIRS.keys():
				if Data.EVO_PAIRS[wk] == k and int(levels.get(wk, 0)) >= 3:
					w += 1.5
			if (k == "droneA" and int(levels.get("droneB", 0)) > 0) or (k == "droneB" and int(levels.get("droneA", 0)) > 0):
				w += 1.5
			weights.append(w)
			total_w += w
		var r := rng.randf() * total_w
		var pick_idx := 0
		for i in pool.size():
			r -= weights[i]
			if r <= 0.0:
				pick_idx = i
				break
		var k := pool[pick_idx]
		pool.remove_at(pick_idx)
		var def: Dictionary = Data.DEFINITIONS[k]
		var cur := int(levels.get(k, 0))
		choices.append({
			"key": k,
			"is_evo": false,
			"title": str(def["name"]),
			"badge": "NEW" if cur == 0 else ("Lv.%d → %d" % [cur, cur + 1]),
			"desc": str(def["desc"]),
			"kind": str(def["kind"]),
		})

	if choices.is_empty():
		choices.append({
			"key": "gold_bonus",
			"is_evo": false,
			"title": "전술 보급팩",
			"badge": "보너스",
			"desc": "골드 +35 · 체력 +20 회복",
			"kind": "bonus",
		})
	return choices


func _open_supply_chest() -> void:
	run_stats["chests"] = int(run_stats["chests"]) + 1
	player["gold"] = int(player["gold"]) + 30
	var evos := evolution_eligible()
	if not evos.is_empty():
		evolve_weapon(evos[0])
		return
	var upgradable: Array[String] = []
	for key in (player["levels"] as Dictionary).keys():
		if int(player["levels"][key]) < 5 and Data.DEFINITIONS.has(key) and not bool(Data.DEFINITIONS[key]["hidden"]):
			upgradable.append(str(key))
	if not upgradable.is_empty():
		var chosen := upgradable[rng.randi_range(0, upgradable.size() - 1)]
		apply_upgrade(chosen)
		show_toast("보급 상자! %s 강화 +30 G" % str(Data.DEFINITIONS[chosen]["name"]), 3.2)
	else:
		player["hp"] = minf(float(player["max_hp"]), float(player["hp"]) + 35.0)
		show_toast("보급 상자! 체력 회복 +30 G", 3.0)
	_check_missions()


func _director(dt: float, view_half: Vector2) -> void:
	spawn_timer = maxf(-1.0, spawn_timer - dt)
	if elapsed < 300.0 and spawn_timer <= 0.0 and enemies.size() < MAX_ENEMIES:
		var count := mini(8, 1 + int(elapsed / 35.0))
		for _i in count:
			if enemies.size() >= MAX_ENEMIES:
				break
			var r := rng.randf()
			var etype := "grunt"
			if elapsed > 210.0 and r < 0.045:
				etype = "medic"
			elif elapsed > 175.0 and r < 0.09:
				etype = "sniper"
			elif elapsed > 110.0 and r < 0.17:
				etype = "splitter"
			elif elapsed > 85.0 and r < 0.23:
				etype = "charger"
			elif elapsed > 95.0 and r < 0.30:
				etype = "ranged"
			elif elapsed > 50.0 and r < 0.43:
				etype = "tank"
			elif r < 0.58:
				etype = "runner"
			spawn_ring(etype, view_half)
		spawn_timer = maxf(0.24, 0.85 - elapsed * 0.0018)

	var milestones := [
		[45.0, "beacon1"],
		[60.0, "elite1"],
		[95.0, "supply1"],
		[150.0, "mid"],
		[190.0, "beacon2"],
		[200.0, "supply2"],
		[240.0, "elite2"],
		[275.0, "supply3"],
		[300.0, "final"],
	]
	for item in milestones:
		var t := float(item[0])
		var id := str(item[1])
		if elapsed >= t and not stage_events.has(id):
			stage_events[id] = true
			if id in ["beacon1", "beacon2"]:
				_spawn_beacon(id)
			elif id in ["elite1", "elite2"]:
				var elite := spawn_ring("elite", view_half)
				_decorate_elite(elite)
				show_toast("속성 정예 출현!", 2.5)
			elif id in ["supply1", "supply2", "supply3"]:
				var a := rng.randf_range(0.0, TAU)
				gems.append({"pos": player["pos"] + Vector2(cos(a), sin(a)) * 135.0, "r": 13.0, "val": 0, "kind": "chest", "attract": false})
				show_toast("보급 도착 · 금빛 상자를 획득하세요", 3.0)
			elif id == "mid":
				spawn_boss(false)
			elif id == "final":
				spawn_boss(true)

	if elapsed >= next_hazard and elapsed < 290.0:
		next_hazard += 50.0
		var offset := Vector2(rng.randf_range(-160, 160), rng.randf_range(-130, 130))
		_add_threat("circle", {"kind": "zone", "pos": player["pos"] + offset, "r": 60.0, "warn": 1.5, "duration": 3.0, "damage": 9.0, "color": Color("f196b1")})


func _boss_pattern(e: Dictionary) -> void:
	if float(e["hp"]) <= 0.0:
		return
	var p2 := int(e["phase"]) == 2
	var step := int(e["attack_mode"])
	e["attack_mode"] = step + 1
	var pattern_set := ["charge", "shockwave", "charge"] if chapter == 0 else (["mortar", "summon", "mortar"] if chapter == 1 else ["laser", "ice", "laser"])
	var kind: String = pattern_set[step % pattern_set.size()]
	e["busy"] = 1.2
	e["skill_timer"] = 3.3 if p2 else 4.7
	var epos: Vector2 = e["pos"]
	var ppos: Vector2 = player["pos"]

	if kind == "charge":
		var dir := (ppos - epos).normalized()
		var dist := minf(410.0, epos.distance_to(ppos) + 100.0)
		var warn := 0.8 if p2 else 1.15
		_add_threat("line", {"kind": "charge", "owner": e, "pos": epos, "pos2": epos + dir * dist, "width": float(e["r"]) * 1.7, "warn": warn, "duration": 0.6, "damage": float(e["dmg"]), "color": Color("ff947b")})
		e["busy"] = warn + 0.65
	elif kind == "shockwave":
		_add_threat("ring", {"kind": "shock", "owner": e, "pos": epos, "r": 270.0 if p2 else 225.0, "width": 16.0, "warn": 0.95, "duration": 1.3, "damage": float(e["dmg"]) * 0.85, "color": Color("ffb477")})
	elif kind == "mortar":
		var cnt := 5 if p2 else 3
		for i in cnt:
			var a := float(i) * 2.399
			var d := 0.0 if i == 0 else 70.0 + float(i) * 30.0
			_add_threat("circle", {"kind": "mortar", "owner": e, "pos": ppos + Vector2(cos(a), sin(a)) * d, "r": 65.0 if p2 else 58.0, "warn": 1.25 + float(i) * 0.17, "duration": 0.4, "damage": float(e["dmg"]) * 0.8, "color": Color("ffc278")})
	elif kind == "summon":
		_add_threat("ring", {"kind": "summon", "owner": e, "pos": epos, "r": 200.0, "width": 12.0, "warn": 1.0, "duration": 1.15, "damage": float(e["dmg"]) * 0.65, "color": Color("e5b7ff")})
	elif kind == "laser":
		var base_a := (ppos - epos).angle()
		var length := clampf(epos.distance_to(ppos) + 220.0, 420.0, 850.0)
		var beams := 2 if p2 else 1
		for i in beams:
			var a := base_a + float(i) * 0.48
			_add_threat("line", {"kind": "laser", "owner": e, "pos": epos, "pos2": epos + Vector2(cos(a), sin(a)) * length, "width": 36.0 if p2 else 30.0, "warn": 1.3 + float(i) * 0.3, "duration": 0.65, "damage": float(e["dmg"]) * 0.85, "color": Color("82ecff")})
		e["busy"] = 2.3 if p2 else 2.0
	elif kind == "ice":
		_add_threat("circle", {"kind": "ice", "owner": e, "pos": epos, "r": 100.0, "warn": 1.0, "duration": 0.3, "damage": 0.0, "color": Color("8bdffc")})
	_push_sfx("warn")


func _add_threat(shape: String, opts: Dictionary) -> void:
	var h := {
		"shape": shape,
		"kind": str(opts.get("kind", "zone")),
		"owner": opts.get("owner", null),
		"pos": opts.get("pos", Vector2.ZERO),
		"pos2": opts.get("pos2", Vector2.ZERO),
		"r": float(opts.get("r", 70.0)),
		"width": float(opts.get("width", 28.0)),
		"warn": float(opts.get("warn", 1.0)),
		"duration": float(opts.get("duration", 0.3)),
		"age": 0.0,
		"damage": float(opts.get("damage", 20.0)),
		"active": false,
		"hit": false,
		"tick": 0.0,
		"color": opts.get("color", Color("ff9879")),
	}
	threats.append(h)


func _update_threats(dt: float) -> void:
	var ppos: Vector2 = player["pos"]
	var pr := float(player["r"])
	for i in range(threats.size() - 1, -1, -1):
		var h := threats[i]
		var owner = h["owner"]
		if owner is Dictionary and float(owner["hp"]) <= 0.0:
			threats.remove_at(i)
			continue
		h["age"] = float(h["age"]) + dt
		var warn := float(h["warn"])
		var duration := float(h["duration"])
		if float(h["age"]) >= warn and not bool(h["active"]):
			h["active"] = true
			var k := str(h["kind"])
			if k == "charge" and owner is Dictionary:
				owner["charging"] = duration
				owner["charge_from"] = h["pos"]
				owner["charge_to"] = h["pos2"]
				owner["charge_total"] = maxf(0.05, duration)
			elif k == "sniper" and owner is Dictionary:
				_fire_enemy_shot(owner, (h["pos2"] - h["pos"]).angle(), 450.0, 1, Color("f59bb8"))
			elif k == "ice" and owner is Dictionary:
				var n := 20 if int(owner["phase"]) == 2 else 14
				for j in n:
					if j % 5 == 0:
						continue
					var a := float(j) * TAU / float(n) + float(owner["attack_mode"]) * 0.2
					enemy_shots.append({"pos": h["pos"], "vel": Vector2(cos(a), sin(a)) * 210.0, "r": 7.0, "dmg": float(owner["dmg"]) * 0.65, "life": 3.5, "color": Color("85e8ff")})
			elif k == "summon" and owner is Dictionary:
				var sc := 7 if int(owner["phase"]) == 2 else 4
				for j in sc:
					if enemies.size() >= MAX_ENEMIES:
						break
					var a := float(j) * TAU / 7.0
					spawn_enemy("runner" if j % 3 == 0 else "grunt", h["pos"] + Vector2(cos(a), sin(a)) * 85.0)
			elif k == "mortar":
				_spawn_particles(h["pos"], h["color"], 16, 1.0)
		var active_t := float(h["age"]) - warn
		if bool(h["active"]) and active_t <= duration and not (str(h["kind"]) in ["charge", "sniper", "ice"]):
			var hit := false
			var shape := str(h["shape"])
			if shape == "circle":
				hit = ppos.distance_to(h["pos"]) < float(h["r"]) + pr
			elif shape == "line":
				hit = _segment_distance(ppos, h["pos"], h["pos2"]) < float(h["width"]) * 0.5 + pr
			elif shape == "ring":
				var r := float(h["r"]) * clampf(active_t / maxf(0.01, duration), 0.0, 1.0)
				var prev_r := float(h["r"]) * clampf((active_t - dt) / maxf(0.01, duration), 0.0, 1.0)
				var d := ppos.distance_to(h["pos"])
				hit = d >= prev_r - float(h["width"]) - pr and d <= r + float(h["width"]) + pr
			if str(h["kind"]) == "zone":
				h["tick"] = float(h["tick"]) - dt
				if hit and float(h["tick"]) <= 0.0:
					h["tick"] = 0.7
					hurt_player(float(h["damage"]))
			elif hit and not bool(h["hit"]):
				h["hit"] = true
				hurt_player(float(h["damage"]))
		if float(h["age"]) > warn + duration:
			threats.remove_at(i)
		if state != "playing":
			return


func _update_enemies(dt: float) -> void:
	var ppos: Vector2 = player["pos"]
	var pr := float(player["r"])
	var initial := enemies.size()
	for idx in initial:
		if idx >= enemies.size() or state != "playing":
			return
		var e := enemies[idx]
		if float(e["hp"]) <= 0.0:
			continue
		e["age"] = float(e["age"]) + dt
		e["hit"] = maxf(0.0, float(e["hit"]) - dt)
		e["busy"] = maxf(0.0, float(e["busy"]) - dt)
		e["attack"] = float(e["attack"]) - dt
		e["skill_timer"] = float(e["skill_timer"]) - dt

		var epos: Vector2 = e["pos"]
		if float(e["charging"]) > 0.0:
			var prev := epos
			e["charging"] = maxf(0.0, float(e["charging"]) - dt)
			var t := 1.0 - float(e["charging"]) / maxf(0.01, float(e["charge_total"]))
			epos = (e["charge_from"] as Vector2).lerp(e["charge_to"] as Vector2, t)
			e["pos"] = epos
			if _segment_distance(ppos, prev, epos) < float(e["r"]) + pr:
				hurt_player(float(e["dmg"]))
			continue

		var to_player := ppos - epos
		var dist := maxf(1.0, to_player.length())
		var dir := to_player / dist
		var etype := str(e["type"])

		if etype == "boss" and float(e["skill_timer"]) <= 0.0 and float(e["busy"]) <= 0.0:
			_boss_pattern(e)
		elif etype == "charger" and float(e["skill_timer"]) <= 0.0 and float(e["busy"]) <= 0.0 and dist < 440.0:
			var clen := minf(330.0, dist + 60.0)
			_add_threat("line", {"kind": "charge", "owner": e, "pos": epos, "pos2": epos + dir * clen, "width": 28.0, "warn": 0.9, "duration": 0.5, "damage": float(e["dmg"]), "color": Color("ffb081")})
			e["busy"] = 1.45
			e["skill_timer"] = 5.0
		elif etype == "sniper" and float(e["attack"]) <= 0.0 and dist < 730.0 and float(e["busy"]) <= 0.0:
			_add_threat("line", {"kind": "sniper", "owner": e, "pos": epos, "pos2": ppos, "width": 4.0, "warn": 0.85, "duration": 0.12, "damage": 0.0, "color": Color("f59bb8")})
			e["busy"] = 1.0
			e["attack"] = 3.5
		elif etype == "medic" and float(e["attack"]) <= 0.0:
			for ally in enemies:
				if ally["id"] != e["id"] and float(ally["hp"]) > 0.0 and ally["type"] != "boss" and epos.distance_to(ally["pos"]) < 150.0:
					ally["hp"] = minf(float(ally["max"]), float(ally["hp"]) + float(ally["max"]) * 0.07)
			areas.append({"kind": "heal_pulse", "pos": epos, "r": 150.0, "life": 0.65, "max": 0.65, "color": Color("a0e7bd")})
			e["attack"] = 3.0

		if float(e["busy"]) <= 0.0:
			var retreat := (etype == "ranged" and dist < 230.0) or (etype == "sniper" and dist < 370.0) or (etype == "medic" and dist < 210.0)
			var spd := float(e["speed"]) * dt * (-0.5 if retreat else 1.0)
			epos += dir * spd
			if etype == "runner":
				var sway := sin(float(e["age"]) * 5.0 + float(e["seed"])) * float(e["speed"]) * 0.32 * dt
				epos += Vector2(-dir.y, dir.x) * sway
			e["pos"] = epos

		if etype == "ranged" and float(e["attack"]) <= 0.0 and dist < 650.0:
			_fire_enemy_shot(e, dir.angle(), 185.0, 1, Color("f3849b"))
			e["attack"] = 2.8

		if ppos.distance_to(e["pos"]) < float(e["r"]) + pr:
			hurt_player(float(e["dmg"]))


func _fire_enemy_shot(e: Dictionary, angle: float, speed: float, spread: int, color: Color) -> void:
	for i in spread:
		var a := angle + (float(i) - float(spread - 1) * 0.5) * 0.19
		enemy_shots.append({"pos": e["pos"], "vel": Vector2(cos(a), sin(a)) * speed, "r": 6.0, "dmg": float(e["dmg"]) * 0.8, "life": 4.0, "color": color})


func _rebuild_grid() -> void:
	_enemy_grid.clear()
	for e in enemies:
		if float(e["hp"]) <= 0.0:
			continue
		var p: Vector2 = e["pos"]
		var key := Vector2i(int(floorf(p.x / GRID_SIZE)), int(floorf(p.y / GRID_SIZE)))
		if not _enemy_grid.has(key):
			_enemy_grid[key] = []
		(_enemy_grid[key] as Array).append(e)


func _query_enemies(a: Vector2, b: Vector2, pad: float = 55.0) -> Array:
	var min_x := int(floorf((minf(a.x, b.x) - pad) / GRID_SIZE))
	var max_x := int(floorf((maxf(a.x, b.x) + pad) / GRID_SIZE))
	var min_y := int(floorf((minf(a.y, b.y) - pad) / GRID_SIZE))
	var max_y := int(floorf((maxf(a.y, b.y) + pad) / GRID_SIZE))
	var out: Array = []
	for gx in range(min_x, max_x + 1):
		for gy in range(min_y, max_y + 1):
			var bucket = _enemy_grid.get(Vector2i(gx, gy))
			if bucket is Array:
				out.append_array(bucket)
	return out


func _separate_enemies() -> void:
	for a in enemies:
		if float(a["hp"]) <= 0.0 or float(a["charging"]) > 0.0:
			continue
		var apos: Vector2 = a["pos"]
		for b in _query_enemies(apos, apos, 55.0):
			if int(b["id"]) <= int(a["id"]) or float(b["hp"]) <= 0.0 or float(b["charging"]) > 0.0:
				continue
			var delta: Vector2 = b["pos"] - apos
			var dd := delta.length_squared()
			var min_d := (float(a["r"]) + float(b["r"])) * 0.74
			if dd > 0.01 and dd < min_d * min_d:
				var d := sqrt(dd)
				var push := delta / d * ((min_d - d) * 0.17)
				a["pos"] = apos - push
				b["pos"] = b["pos"] + push
				apos = a["pos"]


func nearest_enemy(origin: Vector2, max_range: float = 999999.0, exclude: Dictionary = {}) -> Dictionary:
	var best: Dictionary = {}
	var best_d2 := max_range * max_range
	for e in enemies:
		if float(e["hp"]) <= 0.0 or exclude.has(e["id"]):
			continue
		var d2 := origin.distance_squared_to(e["pos"])
		if d2 < best_d2:
			best_d2 = d2
			best = e
	return best


func drone_positions() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var t := float(player["rot"]) * 0.65
	var ppos: Vector2 = player["pos"]
	var list := [["droneA", 0], ["droneB", 1], ["destroyer", 2]]
	for entry in list:
		var k := str(entry[0])
		var idx := int(entry[1])
		if int(player["levels"].get(k, 0)) > 0:
			var a := t + (PI if idx == 1 else (PI * 0.5 if idx == 2 else 0.0))
			var rad := 62.0 if k == "destroyer" else 49.0
			out.append({"kind": k, "pos": ppos + Vector2(cos(a), sin(a)) * rad})
	return out


func guardian_blade_positions() -> Array[Vector2]:
	var out: Array[Vector2] = []
	var lv := int(player["levels"].get("guardian", 0))
	if lv <= 0:
		return out
	var ev := bool(player["evolved"].get("guardian", false))
	var n := 2 + lv / 2 + (3 if ev else 0)
	var rad := (55.0 + float(lv) * 7.0) * range_power()
	var ppos: Vector2 = player["pos"]
	for i in n:
		var a := float(player["rot"]) + float(i) * TAU / float(n)
		out.append(ppos + Vector2(cos(a), sin(a)) * rad)
	return out


func _decorate_elite(e: Dictionary) -> void:
	if e.is_empty():
		return
	var affixes := ["ward", "frenzy", "pulse"]
	var affix: String = affixes[(chapter + int(elapsed / 120.0)) % affixes.size()]
	e["affix"] = affix
	e["affix_clock"] = 3.0
	e["xp"] = int(roundf(float(e["xp"]) * 1.5))
	if affix == "ward":
		e["hp"] = float(e["hp"]) * 1.3
		e["max"] = float(e["hp"])
	elif affix == "frenzy":
		e["speed"] = float(e["speed"]) * 1.22
		e["dmg"] = float(e["dmg"]) * 1.18


func _spawn_beacon(id: String) -> void:
	var a := rng.randf_range(0.0, TAU)
	var bpos: Vector2 = (player["pos"] as Vector2) + Vector2(cos(a), sin(a)) * 235.0
	beacons.append({
		"id": id,
		"pos": bpos,
		"r": 105.0,
		"progress": 0.0,
		"goal": 8.0,
		"expires": elapsed + 75.0,
		"status": "active",
		"engaged": false,
		"contested": false,
	})
	show_toast("보급 거점 발견 · 8초 확보 시 상자 +70 G", 3.5)
	_push_sfx("warn")


func _update_beacons(dt: float) -> void:
	var ppos: Vector2 = player["pos"]
	for b in beacons:
		if str(b["status"]) != "active":
			continue
		if elapsed >= float(b["expires"]) or elapsed >= 300.0:
			b["status"] = "expired"
			show_toast("거점 신호 종료 · 전투를 계속하세요", 2.5)
			continue
		var bpos: Vector2 = b["pos"]
		var inside := ppos.distance_to(bpos) <= float(b["r"])
		if inside and not bool(b["engaged"]):
			b["engaged"] = true
			for i in 7:
				if enemies.size() >= MAX_ENEMIES:
					break
				var a := float(i) * TAU / 7.0
				var etype := "tank" if i == 0 else ("runner" if i % 3 == 0 else "grunt")
				spawn_enemy(etype, bpos + Vector2(cos(a), sin(a)) * 210.0)
			show_toast("거점 방어 시작 · 적을 정리하며 확보하세요", 3.0)
		var contested := false
		for e in enemies:
			if float(e["hp"]) > 0.0 and (e["pos"] as Vector2).distance_to(bpos) < float(b["r"]) + float(e["r"]):
				contested = true
				break
		b["contested"] = contested
		if inside and not contested:
			b["progress"] = minf(float(b["goal"]), float(b["progress"]) + dt)
		if float(b["progress"]) >= float(b["goal"]):
			b["status"] = "complete"
			player["gold"] = int(player["gold"]) + 70
			gems.append({"pos": bpos, "r": 13.0, "val": 0, "kind": "chest", "attract": false})
			for i in 8:
				var a := float(i) * TAU / 8.0
				_add_xp_gem(bpos + Vector2(cos(a), sin(a)) * 50.0, 5)
			_spawn_particles(bpos, Color("8ff4da"), 28, 1.2)
			_push_sfx("evolve")
			show_toast("거점 확보 완료! 보급 상자 +70 G", 3.5)


func _update_turrets(dt: float) -> void:
	for i in range(turrets.size() - 1, -1, -1):
		var t := turrets[i]
		t["life"] = float(t["life"]) - dt
		if float(t["life"]) <= 0.0:
			turrets.remove_at(i)
			continue
		t["cool"] = float(t["cool"]) - dt
		if float(t["cool"]) <= 0.0:
			var target := nearest_enemy(t["pos"], 420.0 * range_power())
			if not target.is_empty():
				var a: float = ((target["pos"] as Vector2) - (t["pos"] as Vector2)).angle()
				_spawn_shot("kunai", t["pos"], a, 520.0, 28.0 * attack_power(), {"r": 5.0, "life": 1.2, "color": Color("f2b65e"), "source": "turret"})
				t["cool"] = 0.32
			else:
				t["cool"] = 0.1


func _update_weapons(dt: float) -> void:
	var cool: Dictionary = player["cool"]
	for k in owned_keys("weapon"):
		if k == "guardian":
			continue
		cool[k] = float(cool.get(k, 0.0)) - dt
		if float(cool[k]) <= 0.0:
			if _fire_weapon(k):
				cool[k] = weapon_interval(k)
			else:
				cool[k] = 0.08
		if state != "playing":
			return

	var lv := int(player["levels"].get("guardian", 0))
	if lv > 0:
		var ev := bool(player["evolved"].get("guardian", false))
		var blades := guardian_blade_positions()
		var dmg := weapon_damage("guardian")
		for bpos in blades:
			if ev:
				for b in enemy_shots:
					if float(b["life"]) > 0.0 and bpos.distance_to(b["pos"]) < float(b["r"]) + 18.0:
						b["life"] = 0.0
						_spawn_particles(b["pos"], Color("a6eeec"), 3, 0.6)
			for e in _query_enemies(bpos, bpos, 65.0):
				if float(e["hp"]) > 0.0 and bpos.distance_to(e["pos"]) < float(e["r"]) + 14.0 and elapsed - float(e["guard_hit"]) > 0.3:
					damage_enemy(e, dmg, "guardian")
					e["guard_hit"] = elapsed


func _fire_weapon(kind: String) -> bool:
	var ppos: Vector2 = player["pos"]
	var rng_p := range_power()
	var target := nearest_enemy(ppos, 700.0 * rng_p)
	if target.is_empty():
		return false
	var lv := weapon_level(kind)
	var dmg := weapon_damage(kind)
	var ev := bool(player["evolved"].get(kind, false))
	var a: float = ((target["pos"] as Vector2) - ppos).angle()

	if kind == "kunai":
		var n := 4 if ev else (2 if lv >= 4 else 1)
		for i in n:
			var ang: float = a + (float(i) - float(n - 1) * 0.5) * 0.14
			_spawn_shot(kind, ppos, ang, 470.0, dmg, {"homing": true, "pierce": 6 if ev else (2 if lv >= 5 else 0), "chain": 2 if ev else 0})
	elif kind == "rocket":
		_spawn_shot(kind, ppos, a, 315.0, dmg, {"r": 9.0, "life": 2.8, "aoe": (65.0 + float(lv) * 13.0 + (65.0 if ev else 0.0)) * rng_p, "burn": ev})
	elif kind == "drill":
		var n := mini(3, 1 + lv / 2)
		for i in n:
			var ang: float = a + (float(i) - float(n - 1) * 0.5) * 0.25
			_spawn_shot(kind, ppos, ang, 580.0, dmg, {"r": 7.0, "life": 1.8, "pierce": 99, "returning": ev})
	elif kind == "lightning":
		var candidates: Array[Dictionary] = []
		var max_d2 := (700.0 * rng_p) * (700.0 * rng_p)
		for e in enemies:
			if float(e["hp"]) > 0.0 and ppos.distance_squared_to(e["pos"]) < max_d2:
				candidates.append(e)
		candidates.sort_custom(func(u, v): return ppos.distance_squared_to(u["pos"]) < ppos.distance_squared_to(v["pos"]))
		var hits := mini(candidates.size(), 1 + lv / 2 + (3 if ev else 0))
		for i in hits:
			if state != "playing":
				break
			var e := candidates[i]
			damage_enemy(e, dmg, kind)
			areas.append({"kind": "lightning", "pos": e["pos"], "r": 18.0, "life": 0.25, "max": 0.25, "color": Color("ace8ff")})
			if ev:
				var nb := nearest_enemy(e["pos"], 160.0 * rng_p, {e["id"]: true})
				if not nb.is_empty():
					damage_enemy(nb, dmg * 0.45, kind)
					areas.append({"kind": "link", "pos": e["pos"], "pos2": nb["pos"], "life": 0.18, "max": 0.18, "color": Color("ace8ff")})
	elif kind == "molotov":
		var life := 3.0 + float(lv) * 0.4
		areas.append({"kind": "fire", "pos": target["pos"], "r": (50.0 + float(lv) * 12.0 + (35.0 if ev else 0.0)) * rng_p, "life": life, "max": life, "tick": 0.0, "dmg": dmg, "source": kind, "color": Color("ffb169")})
		if ev:
			for i in 3:
				var an := float(i) * TAU / 3.0
				areas.append({"kind": "fire", "pos": target["pos"] + Vector2(cos(an), sin(an)) * 95.0, "r": (45.0 + float(lv) * 5.0) * rng_p, "life": 4.0, "max": 4.0, "tick": 0.0, "dmg": dmg * 0.75, "source": kind, "color": Color("ff7847")})
	elif kind in ["droneA", "droneB", "destroyer"]:
		var origin := ppos
		for d in drone_positions():
			if d["kind"] == kind:
				origin = d["pos"]
				break
		var an: float = ((target["pos"] as Vector2) - origin).angle()
		var n := 2 if kind == "destroyer" else (3 if kind == "droneB" else 1 + lv / 3)
		var spread := 0.27 if kind == "droneB" else 0.1
		var spd := 340.0 if kind == "droneB" else 480.0
		var aoe := (40.0 * rng_p) if kind == "destroyer" else (((22.0 + float(lv) * 3.0) * rng_p) if kind == "droneB" else 0.0)
		for i in n:
			var ang: float = an + (float(i) - float(n - 1) * 0.5) * spread
			_spawn_shot(kind, origin, ang, spd, dmg, {"life": 2.4, "homing": kind in ["destroyer", "droneA"], "aoe": aoe, "drone": true})
	_push_sfx("rocket" if kind == "rocket" else ("zap" if kind == "lightning" else "shot"))
	return true


func _spawn_shot(kind: String, pos: Vector2, angle: float, speed: float, dmg: float, opts: Dictionary = {}) -> void:
	var color: Color = opts.get("color", Data.WEAPON_DATA[kind]["color"])
	shots.append({
		"kind": kind,
		"source": str(opts.get("source", kind)),
		"pos": pos,
		"vel": Vector2(cos(angle), sin(angle)) * speed,
		"r": float(opts.get("r", 6.0)),
		"life": float(opts.get("life", 2.0)),
		"dmg": dmg,
		"hit": {},
		"pierce": int(opts.get("pierce", 0)),
		"homing": bool(opts.get("homing", false)),
		"returning": bool(opts.get("returning", false)),
		"aoe": float(opts.get("aoe", 0.0)),
		"burn": bool(opts.get("burn", false)),
		"chain": int(opts.get("chain", 0)),
		"drone": bool(opts.get("drone", false)),
		"color": color,
	})


func _explosion(pos: Vector2, radius: float, dmg: float, source: String) -> void:
	areas.append({"kind": "blast", "pos": pos, "r": radius, "life": 0.3, "max": 0.3, "color": Color("ffb56e")})
	_spawn_particles(pos, Color("ffb56e"), 14, 1.0)
	shake = maxf(shake, 3.0)
	for e in enemies:
		if float(e["hp"]) > 0.0 and pos.distance_to(e["pos"]) < radius + float(e["r"]):
			damage_enemy(e, dmg, source)


func _update_projectiles(dt: float) -> void:
	var ppos: Vector2 = player["pos"]
	var pr := float(player["r"])
	for i in range(shots.size() - 1, -1, -1):
		if state != "playing":
			return
		var s := shots[i]
		s["life"] = float(s["life"]) - dt
		if float(s["life"]) <= 0.0:
			shots.remove_at(i)
			continue
		var vel: Vector2 = s["vel"]
		if bool(s["returning"]) and float(s["life"]) < 0.9:
			var to_p: Vector2 = (ppos - (s["pos"] as Vector2)).normalized() * 600.0
			vel = vel.lerp(to_p, minf(1.0, dt * 6.0))
		if bool(s["homing"]):
			var t := nearest_enemy(s["pos"], 430.0, s["hit"])
			if not t.is_empty():
				var desired: Vector2 = ((t["pos"] as Vector2) - (s["pos"] as Vector2)).normalized() * (480.0 if bool(s["drone"]) else 470.0)
				vel = vel.lerp(desired, minf(1.0, dt * 7.0))
		s["vel"] = vel
		var old_pos: Vector2 = s["pos"]
		var new_pos := old_pos + vel * dt
		s["pos"] = new_pos

		var candidates := _query_enemies(old_pos, new_pos, 48.0)
		var hit_list: Array = []
		var hit_map: Dictionary = s["hit"]
		for e in candidates:
			if float(e["hp"]) > 0.0 and not hit_map.has(e["id"]) and _segment_distance(e["pos"], old_pos, new_pos) < float(s["r"]) + float(e["r"]):
				hit_list.append(e)
		hit_list.sort_custom(func(u, v): return old_pos.distance_squared_to(u["pos"]) < old_pos.distance_squared_to(v["pos"]))

		var remove := false
		for e in hit_list:
			if float(e["hp"]) <= 0.0:
				continue
			hit_map[e["id"]] = true
			if float(s["aoe"]) > 0.0:
				_explosion(e["pos"], float(s["aoe"]), float(s["dmg"]), str(s["source"]))
				if bool(s["burn"]):
					areas.append({"kind": "fire", "pos": e["pos"], "r": float(s["aoe"]) * 0.65, "life": 2.5, "max": 2.5, "tick": 0.0, "dmg": float(s["dmg"]) * 0.12, "source": str(s["source"]), "color": Color("ff8e53")})
			else:
				damage_enemy(e, float(s["dmg"]), str(s["source"]))
				var chain_cnt := int(s["chain"])
				if chain_cnt > 0:
					var visited := {e["id"]: true}
					var from_pos: Vector2 = e["pos"]
					for _c in chain_cnt:
						var nxt := nearest_enemy(from_pos, 140.0, visited)
						if nxt.is_empty():
							break
						visited[nxt["id"]] = true
						damage_enemy(nxt, float(s["dmg"]) * 0.45, str(s["source"]))
						areas.append({"kind": "link", "pos": from_pos, "pos2": nxt["pos"], "life": 0.13, "max": 0.13, "color": Color("ffe19a")})
						from_pos = nxt["pos"]
			var rem_pierce := int(s["pierce"])
			s["pierce"] = rem_pierce - 1
			if rem_pierce <= 0:
				remove = true
				break
		if remove:
			shots.remove_at(i)

	for i in range(enemy_shots.size() - 1, -1, -1):
		var es := enemy_shots[i]
		es["life"] = float(es["life"]) - dt
		if float(es["life"]) <= 0.0:
			enemy_shots.remove_at(i)
			continue
		var old_p: Vector2 = es["pos"]
		var new_p: Vector2 = old_p + (es["vel"] as Vector2) * dt
		es["pos"] = new_p
		if _segment_distance(ppos, old_p, new_p) < float(es["r"]) + pr:
			hurt_player(float(es["dmg"]))
			enemy_shots.remove_at(i)
		if state != "playing":
			return

	if shots.size() > MAX_SHOTS:
		shots = shots.slice(shots.size() - MAX_SHOTS)
	if enemy_shots.size() > MAX_ENEMY_SHOTS:
		enemy_shots = enemy_shots.slice(enemy_shots.size() - MAX_ENEMY_SHOTS)


func _update_areas(dt: float) -> void:
	var ppos: Vector2 = player["pos"]
	for i in range(areas.size() - 1, -1, -1):
		var a := areas[i]
		a["life"] = float(a["life"]) - dt
		var kind := str(a["kind"])
		if kind == "fire":
			a["tick"] = float(a["tick"]) - dt
			if float(a["tick"]) <= 0.0:
				a["tick"] = 0.3
				for e in enemies:
					if float(e["hp"]) > 0.0 and (a["pos"] as Vector2).distance_to(e["pos"]) < float(a["r"]) + float(e["r"]):
						damage_enemy(e, float(a["dmg"]), str(a["source"]))
		elif kind == "heal_field":
			if ppos.distance_to(a["pos"]) <= float(a["r"]):
				player["hp"] = minf(float(player["max_hp"]), float(player["hp"]) + float(player["max_hp"]) * 0.05 * dt)
		if float(a["life"]) <= 0.0:
			areas.remove_at(i)
		if state != "playing":
			return


func _update_pickups(dt: float) -> void:
	var ppos: Vector2 = player["pos"]
	var pr := float(player["r"])
	var magnet_r := 85.0 + 35.0 * float(player["levels"].get("magnet", 0))
	for i in range(gems.size() - 1, -1, -1):
		var g := gems[i]
		var gpos: Vector2 = g["pos"]
		var d := ppos.distance_to(gpos)
		if d < magnet_r or bool(g["attract"]):
			var factor := minf(1.0, dt * (15.0 if bool(g["attract"]) else 11.0))
			gpos = gpos.lerp(ppos, factor)
			g["pos"] = gpos
			d = ppos.distance_to(gpos)
		if d < pr + float(g["r"]) + 5.0:
			gems.remove_at(i)
			var kind := str(g["kind"])
			if kind == "chest":
				_open_supply_chest()
			elif kind == "bomb":
				for e in enemies:
					if float(e["hp"]) > 0.0:
						damage_enemy(e, maxf(80.0, float(e["max"]) * 0.3), "bomb")
				_spawn_particles(ppos, Color("ffbb63"), 32, 1.3)
				shake = 7.0
				_push_sfx("rocket")
				show_toast("폭탄 발동 · 주변 적 대폭발!", 2.2)
			elif kind == "shield":
				player["inv"] = maxf(float(player["inv"]), 5.0)
				_spawn_particles(ppos, Color("89f6e7"), 18, 1.0)
				_push_sfx("upgrade")
				show_toast("방어막 활성화 (5초 무적)", 2.2)
			elif kind == "magnet":
				for other in gems:
					if str(other["kind"]) == "xp":
						other["attract"] = true
				_spawn_particles(ppos, Color("c1a3ff"), 18, 1.0)
				_push_sfx("upgrade")
				show_toast("전체 자석 발동!", 2.0)
			elif kind == "heal":
				player["hp"] = minf(float(player["max_hp"]), float(player["hp"]) + 15.0)
				_float_text(ppos, "+15", Color("b3ffd1"))
			else:
				gain_xp(float(g["val"]))
			if state != "playing":
				return


func _add_xp_gem(pos: Vector2, val: int) -> void:
	if gems.size() < MAX_GEMS:
		gems.append({"pos": pos, "r": 5.0 + minf(3.0, float(val) / 20.0), "val": val, "kind": "xp", "attract": false})
		return
	for g in gems:
		if str(g["kind"]) == "xp":
			g["val"] = int(g["val"]) + val
			return
	gems.append({"pos": pos, "r": 7.0, "val": val, "kind": "xp", "attract": false})


func _spawn_particles(pos: Vector2, color: Color, count: int, force: float) -> void:
	for _i in count:
		if particles.size() >= MAX_PARTICLES:
			break
		var a := rng.randf_range(0.0, TAU)
		var spd := rng.randf_range(30.0, 160.0) * force
		var life := rng.randf_range(0.2, 0.6)
		particles.append({"pos": pos, "vel": Vector2(cos(a), sin(a)) * spd, "life": life, "max": life, "color": color, "r": rng.randf_range(2.0, 4.5)})


func _float_text(pos: Vector2, text: String, color: Color) -> void:
	if texts.size() < MAX_TEXTS:
		texts.append({"pos": pos, "text": text, "color": color, "life": 0.75, "max": 0.75})


func _update_vfx(dt: float) -> void:
	for i in range(particles.size() - 1, -1, -1):
		var p := particles[i]
		p["life"] = float(p["life"]) - dt
		if float(p["life"]) <= 0.0:
			particles.remove_at(i)
		else:
			p["pos"] = (p["pos"] as Vector2) + (p["vel"] as Vector2) * dt
	for i in range(texts.size() - 1, -1, -1):
		var t := texts[i]
		t["life"] = float(t["life"]) - dt
		if float(t["life"]) <= 0.0:
			texts.remove_at(i)
		else:
			t["pos"] = (t["pos"] as Vector2) + Vector2(0.0, -34.0 * dt)


func _prune_enemies(max_dist: float) -> void:
	var ppos: Vector2 = player["pos"]
	var max_d2 := max_dist * max_dist
	for i in range(enemies.size() - 1, -1, -1):
		var e := enemies[i]
		if float(e["hp"]) <= 0.0 or (not (str(e["type"]) in ["boss", "elite"]) and ppos.distance_squared_to(e["pos"]) > max_d2):
			enemies.remove_at(i)


func _check_missions() -> void:
	for m in Data.MISSIONS:
		var mid := str(m["id"])
		if mission_claims.has(mid):
			continue
		var val := 0
		if mid == "kills":
			val = int(player["kills"])
		elif mid == "chest":
			val = int(run_stats["chests"])
		elif mid == "evolve":
			val = int(run_stats["evolutions"])
		if val >= int(m["goal"]):
			mission_claims[mid] = true
			var reward := int(m["reward"])
			player["gold"] = int(player["gold"]) + reward
			run_stats["mission_gold"] = int(run_stats["mission_gold"]) + reward
			show_toast("임무 완료 · %s +%d G" % [str(m["name"]), reward], 3.0)
			_push_sfx("level")


func _finish_run(win: bool) -> void:
	if state in ["win", "dead"]:
		return
	_check_missions()
	state = "win" if win else "dead"
	var base_gold := int(player["gold"])
	var clear_gold := 100 * (chapter + 1) if win else 0
	profile["gold"] = int(profile["gold"]) + base_gold + clear_gold
	profile["best_kills"] = maxi(int(profile["best_kills"]), int(player["kills"]))
	if win:
		profile["wins"] = int(profile["wins"]) + 1
		profile["unlocked"] = clampi(maxi(int(profile["unlocked"]), chapter + 2), 1, Data.CHAPTERS.size())
	save_profile()
	last_result = {
		"win": win,
		"elapsed": elapsed,
		"kills": int(player["kills"]),
		"level": int(player["lv"]),
		"base_gold": base_gold,
		"clear_gold": clear_gold,
		"damage": int(roundf(float(run_stats["damage"]))),
		"evolutions": int(run_stats["evolutions"]),
	}
	_push_sfx("win" if win else "hurt")


func active_boss() -> Dictionary:
	for e in enemies:
		if e["type"] == "boss" and float(e["hp"]) > 0.0:
			return e
	return {}


static func _segment_distance(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var d2 := ab.length_squared()
	var t := clampf((p - a).dot(ab) / d2, 0.0, 1.0) if d2 > 0.0 else 0.0
	return p.distance_to(a + ab * t)
