extends SceneTree
## G2 encounter contracts: fairness, scheduled progression, replay, and G1 migration.
## Controlled fixtures isolate combat rules; these are not natural difficulty runs.

const Sim = preload("res://scripts/arena_sim.gd")
var passed = 0
var failed = 0
var checks: Array = []

func check(value: bool, label: String) -> void:
	checks.append({"name": label, "passed": value})
	if value:
		passed += 1
	else:
		failed += 1
		print("FAIL ", label)

func fresh(chapter: int = 0, duration: int = 300):
	var sim = Sim.new()
	sim.start({"chapter": chapter, "duration": duration}, 3210 + chapter)
	# Prevent incidental auto-fire from ending an encounter during timing assertions.
	sim.player.cool.kunai = 99.0
	return sim

func advance(sim, seconds: float, movement: Vector2 = Vector2.ZERO) -> void:
	for frame in ceili(seconds * 60.0):
		sim.step(1.0 / 60.0, movement)

func living(sim, type: String = "") -> Array:
	return sim.enemies.filter(func(enemy): return float(enemy.hp) > 0.0 and (type.is_empty() or enemy.type == type))

func clone_sim(sim, label: String):
	var other = Sim.new()
	check(other.restore(JSON.parse_string(JSON.stringify(sim.snapshot(), "", true, true))), label + " JSON restore")
	return other

func same_data(a: Variant, b: Variant) -> bool:
	# Godot JSON decodes integral numbers as floats. Normalize both JSON trees
	# and allow 1e-8 absolute scalar round-off from its decimal parser. IDs,
	# array order, strings (including 64-bit RNG state), and booleans stay exact.
	return equivalent_tree(Sim._encode(a), Sim._encode(b))

func equivalent_tree(a: Variant, b: Variant) -> bool:
	if (a is int or a is float) and (b is int or b is float):
		return absf(float(a) - float(b)) <= 1.0e-8
	if a is Dictionary and b is Dictionary:
		if a.size() != b.size(): return false
		for key in a:
			if not b.has(key) or not equivalent_tree(a[key], b[key]): return false
		return true
	if a is Array and b is Array:
		if a.size() != b.size(): return false
		for i in a.size():
			if not equivalent_tree(a[i], b[i]): return false
		return true
	return a == b

func first_difference(a: Variant, b: Variant, path: String = "root") -> String:
	if same_data(a, b): return ""
	if a is Dictionary and b is Dictionary:
		for key in a:
			if not b.has(key): return path + "." + str(key) + " missing"
			var difference = first_difference(a[key], b[key], path + "." + str(key))
			if not difference.is_empty(): return difference
	elif a is Array and b is Array:
		if a.size() != b.size(): return path + " length " + str(a.size()) + " != " + str(b.size())
		for i in a.size():
			var difference = first_difference(a[i], b[i], path + "[" + str(i) + "]")
			if not difference.is_empty(): return difference
	return path + " " + JSON.stringify(Sim._encode(a), "", true, true) + " != " + JSON.stringify(Sim._encode(b), "", true, true)

func reject_atomic(sim, invalid: Dictionary, label: String) -> void:
	var before = JSON.stringify(sim.snapshot())
	check(not sim.restore(invalid), label + " rejected")
	check(JSON.stringify(sim.snapshot()) == before, label + " leaves run unchanged")

func real_g1_overlap() -> void:
	var path = "res://tests/fixtures/g1_900s_two_midbosses.json"
	check(FileAccess.file_exists(path), "real G1 two-boss fixture is bundled")
	if not FileAccess.file_exists(path): return
	var fixture_text = FileAccess.get_file_as_string(path)
	var raw: Dictionary = JSON.parse_string(fixture_text)
	var provenance: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://tests/fixtures/g1_900s_two_midbosses_provenance.json"))
	check(fixture_text.sha256_text() == provenance.fixture_sha256 and provenance.source_project == "SurvivorArena_Godot (G1)", "real G1 fixture checksum and provenance")
	check(not raw.has("encounter") and not raw.has("last_damage") and int(raw.config.duration) == 900, "real fixture came from legacy snapshot schema")
	var imported = Sim.new()
	check(imported.restore(raw), "real G1 overlapping midboss save restores")
	check(living(imported, "boss").size() == 2 and imported.stage_events.has("mid1") and imported.stage_events.has("mid2"), "migration retains both completed spawn events and live bosses")
	var imported_snapshot: Dictionary = imported.snapshot()
	for field in ["config", "player", "enemies", "shots", "enemy_shots", "gems", "areas", "threats", "effects", "stats", "stage_events", "mission_claims", "elapsed", "rng_state", "rng_seed", "next_id"]:
		check(same_data(imported_snapshot[field], raw[field]), "real G1 migration preserves " + field)
	var first_save = clone_sim(imported, "real G1 immediate G2 resave")
	check(same_data(first_save.snapshot(), imported.snapshot()), "real G1 immediate resave preserves all carried state")

	for tracked_first in [true, false]:
		var sim = Sim.new()
		check(sim.restore(raw), "real G1 replay setup " + str(tracked_first))
		var bosses = living(sim, "boss")
		var victim: Dictionary = bosses[0 if tracked_first else 1]
		var survivor: Dictionary = bosses[1 if tracked_first else 0]
		var survivor_hp = float(survivor.hp)
		var initial_kills = int(sim.stats.kills)
		var initial_damage = float(sim.stats.damage)
		var victim_hp = float(victim.hp)
		var ordinary_before = living(sim).filter(func(enemy): return enemy.type != "boss").duplicate(true)
		var survivor_threats = sim.threats.filter(func(threat): return int(threat.owner_id) == int(survivor.id)).duplicate(true)
		var carried_shots = sim.enemy_shots.duplicate(true)
		sim.elapsed = 900.01
		sim._director(1.0 / 60.0)
		check(not sim.stage_events.has("final") and living(sim, "boss").size() == 2, "final waits for both carried bosses " + str(tracked_first))
		sim.damage(victim, 1.0e9, "fixture")
		check(sim.encounter.active and int(sim.encounter.boss_id) == int(survivor.id) and sim.encounter.recover_left == 0 and sim.encounter.intro_left == 0, "encounter ownership transfers immediately without replayed grace " + str(tracked_first))
		check(int(sim.stats.kills) == initial_kills + 1 and is_equal_approx(float(sim.stats.damage), initial_damage + victim_hp), "only the actually defeated carried boss awards damage and a kill " + str(tracked_first))
		check(survivor.hp == survivor_hp and same_data(ordinary_before, living(sim).filter(func(enemy): return enemy.type != "boss")), "remaining boss and ordinary entities retain HP and state " + str(tracked_first))
		check(same_data(survivor_threats, sim.threats.filter(func(threat): return int(threat.owner_id) == int(survivor.id))) and same_data(carried_shots, sim.enemy_shots), "remaining telegraphs and legacy projectiles survive ownership transfer " + str(tracked_first))
		sim = clone_sim(sim, "real G1 save immediately after first carried death " + str(tracked_first))
		sim._director(1.0 / 60.0)
		check(not sim.stage_events.has("final") and living(sim, "boss").size() == 1, "final still waits for last carried boss " + str(tracked_first))
		sim.damage(sim.active_boss(), 1.0e9, "fixture")
		check(not sim.encounter.active and sim.encounter.recover_left == 2.0 and living(sim, "boss").is_empty(), "recovery begins only after last carried boss dies " + str(tracked_first))
		check(int(sim.stats.kills) == initial_kills + 2 and sim.enemy_shots.is_empty() and sim.threats.is_empty(), "last carried defeat awards once and clears hostile attacks " + str(tracked_first))
		sim = clone_sim(sim, "real G1 save immediately after all carried deaths " + str(tracked_first))
		sim.player.invuln = 99.0
		advance(sim, 1.9)
		check(not sim.stage_events.has("final"), "queued final respects carried encounter recovery " + str(tracked_first))
		advance(sim, .3)
		check(sim.stage_events.has("final") and not sim.active_boss().is_empty() and sim.active_boss().role == "final", "queued final starts after migrated encounter clears " + str(tracked_first))
		sim.damage(sim.active_boss(), 1.0e9, "fixture")
		check(sim.state == "won", "migrated overlapping-boss run can finish safely " + str(tracked_first))
		clone_sim(sim, "real G1 migrated victory resave " + str(tracked_first))

func _init() -> void:
	var entry = fresh()
	entry.director_enabled = false
	var grunt = entry.spawn_enemy("grunt", Vector2(30, 0))
	var ranged = entry.spawn_enemy("ranged", Vector2(90, 0))
	entry._enemy_projectile(ranged, PI)
	entry._threat("line", ranged, ranged.pos, entry.player.pos, 0, 1, .2, 0, "sniper", 4)
	entry._add_gem("xp", Vector2(-160, 0), 3)
	var boss = entry.spawn_boss(false)
	check(living(entry).size() == 1 and living(entry)[0].type == "boss", "midboss entry clears ordinary crowd")
	check(grunt.hp == 0 and ranged.hp == 0, "despawn invalidates old combat references")
	check(entry.enemy_shots.is_empty() and entry.threats.is_empty(), "entry clears stale hostile attacks")
	check(entry.stats.kills == 0 and entry.stats.damage == 0 and entry.player.xp == 0 and entry.player.gold == 0, "entry despawn grants no rewards")
	check(entry.gems.size() == 1 and entry.gems[0].type == "xp", "entry preserves existing pickups")
	check(entry.encounter.active and entry.encounter.boss_id == boss.id and is_equal_approx(entry.encounter.intro_left, 1.6), "entry exposes boss identity and 1.6 second grace")
	var random_before = entry.rng.state
	check(entry.spawn_boss(true).id == boss.id and living(entry, "boss").size() == 1, "duplicate direct boss request is idempotent")
	check(entry.rng.state == random_before and boss.role == "mid", "duplicate request neither rerolls nor replaces current boss")
	entry.player.invuln = 0.0
	check(not entry.hurt(50, "boss") and entry.player.hp == 160, "intro protects player even when general invulnerability expires")
	var boss_position: Vector2 = boss.pos
	var boss_cooldown: float = boss.skill_timer
	advance(entry, 1.5, Vector2.UP)
	check(boss.pos.is_equal_approx(boss_position) and boss.skill_timer == boss_cooldown, "intro freezes hostile movement and pattern cooldown")
	check(entry.player.pos.y < -280, "player can reposition during intro with W direction intact")
	check(entry.encounter.intro_left > 0 and entry.encounter.intro_left < .11, "intro counts simulation time")
	entry.pause()
	var paused_snapshot = JSON.stringify(entry.snapshot())
	advance(entry, 2.0)
	check(JSON.stringify(entry.snapshot()) == paused_snapshot, "pause freezes encounter intro and all metadata")
	entry.resume()
	advance(entry, .2)
	check(entry.encounter.intro_left == 0 and boss.skill_timer < boss_cooldown and not boss.pos.is_equal_approx(boss_position), "boss begins moving only after grace")

	var crowd = fresh()
	crowd.elapsed = 149.99
	crowd.step(1.0 / 60.0, Vector2.ZERO)
	check(crowd.stage_events.has("mid1") and living(crowd).size() == 1, "scheduled midboss begins with a clean battlefield")
	crowd.gems.clear()
	for frame in 600:
		crowd.player.invuln = 99.0
		crowd.step(1.0 / 60.0, Vector2.RIGHT)
	check(living(crowd).size() == 1 and crowd.active_boss().role == "mid", "normal director cannot add crowd during ten second encounter")
	check(crowd.stats.boss_patterns > 0, "boss pattern AI continues while normal director is held")

	var summons = fresh(1)
	var owner = summons.spawn_boss(false)
	summons.encounter.intro_left = 0.0
	summons.player.invuln = 99.0
	summons.boss_pattern(owner, "summon")
	check(summons.encounter.pattern == "지원 병력" and summons.encounter.pattern_time > 2, "pattern metadata names summon with complete telegraph duration")
	advance(summons, 1.15, Vector2.RIGHT)
	check(living(summons).size() == 5, "boss summons work while ordinary spawns are stopped")
	check(living(summons).filter(func(enemy): return int(enemy.get("summoned_by", 0)) == int(owner.id)).size() == 4, "summons remember their owning boss")
	summons._enemy_projectile(owner, 0)
	var kills_before = summons.stats.kills
	var summoned_ids = living(summons).filter(func(enemy): return enemy.type != "boss").map(func(enemy): return enemy.id)
	summons.damage(owner, 1.0e9, "fixture")
	check(not summons.encounter.active and summons.encounter.boss_id == 0 and is_equal_approx(summons.encounter.recover_left, 2.0), "boss defeat enters two second recovery")
	check(summons.enemy_shots.is_empty() and summons.threats.is_empty(), "defeat clears all remaining hostile attacks")
	check(living(summons).is_empty() and summons.stats.kills == kills_before + 1, "defeat removes summons without extra kills")
	check(summons.enemies.filter(func(enemy): return summoned_ids.has(enemy.id) and enemy.hp > 0).is_empty(), "summon references cannot be damaged after owner death")
	advance(summons, 1.9, Vector2.RIGHT)
	check(living(summons).is_empty() and summons.encounter.recover_left > 0, "director remains quiet during recovery")
	advance(summons, .6, Vector2.RIGHT)
	check(summons.encounter.recover_left == 0 and living(summons).size() > 0, "ordinary waves resume after recovery")

	for duration in [300, 900]:
		var timeline = fresh(0, duration)
		var first_at = 150.0 if duration == 300 else 300.0
		timeline.elapsed = first_at - 7.9
		timeline.step(1.0 / 60.0, Vector2.ZERO)
		check(timeline.stage_events.has("warn_mid1") and "보스 접근" in timeline.notice, "boss approach notice %d" % duration)
		check(not timeline.stage_events.has("mid1"), "notice does not prematurely spawn boss %d" % duration)
		timeline.elapsed = first_at - .01
		timeline.step(1.0 / 60.0, Vector2.ZERO)
		var first_id = timeline.active_boss().id
		timeline.gems.clear()
		timeline.elapsed = float(duration) - .01
		timeline.step(1.0 / 60.0, Vector2.ZERO)
		check(timeline.state == "playing" and timeline.active_boss().id == first_id, "elapsed deadline does not replace live boss %d" % duration)
		check(not timeline.stage_events.has("final") and living(timeline, "boss").size() == 1, "final event stays pending without stacking %d" % duration)
		if duration == 900:
			check(not timeline.stage_events.has("mid2"), "second 900 second mode midboss also defers")
		timeline.damage(timeline.active_boss(), 1.0e9, "fixture")
		advance(timeline, 1.9)
		check(timeline.active_boss().is_empty(), "deferred boss respects recovery %d" % duration)
		advance(timeline, .3)
		if duration == 900:
			check(timeline.stage_events.has("mid2") and not timeline.stage_events.has("final") and timeline.active_boss().role == "mid", "queued midboss retains order ahead of final")
			timeline.damage(timeline.active_boss(), 1.0e9, "fixture")
			advance(timeline, 2.2)
		check(timeline.stage_events.has("final") and timeline.active_boss().role == "final" and living(timeline, "boss").size() == 1, "deferred final eventually starts %d" % duration)
		check(timeline.state == "playing", "clock alone cannot settle victory %d" % duration)
		timeline.damage(timeline.active_boss(), 1.0e9, "fixture")
		check(timeline.state == "won", "defeating final boss settles victory %d" % duration)
		var completed = JSON.stringify(timeline.snapshot())
		timeline.finish(true)
		check(JSON.stringify(timeline.snapshot()) == completed, "completed encounter remains idempotent %d" % duration)

	var wounds = fresh()
	wounds.director_enabled = false
	wounds.elapsed = 4.25
	wounds.player.invuln = 0.0
	wounds.apply_upgrade("armor")
	check(wounds.hurt(20, "laser"), "valid incoming hit records a wound")
	check(is_equal_approx(wounds.last_damage.amount, 20 * (1 - wounds.passive_value("armor"))) and wounds.last_damage.cause == "laser" and wounds.last_damage.at == 4.25, "wound stores actual mitigated damage, cause and time")
	var recorded = wounds.last_damage.duplicate()
	check(not wounds.hurt(100, "charge") and wounds.last_damage == recorded, "invulnerability does not overwrite last actual wound")
	wounds.player.invuln = 0.0
	check(not wounds.hurt(-3, "invalid") and not wounds.hurt(NAN, "invalid") and wounds.last_damage == recorded, "invalid damage cannot overwrite wound metadata")
	wounds.player.hp = 7.0
	check(wounds.hurt(999, "mortar") and wounds.state == "lost" and wounds.last_damage.amount == 7.0 and wounds.last_damage.cause == "mortar", "lethal wound records actual remaining HP and final cause")
	clone_sim(wounds, "lost run with wound")
	wounds.start({}, 77)
	check(wounds.last_damage.amount == 0 and wounds.last_damage.cause.is_empty() and not wounds.encounter.active, "new run resets wound and encounter state")

	for mode in ["intro", "pattern", "recovery"]:
		var replay = fresh(2)
		replay.director_enabled = false
		var replay_boss = replay.spawn_boss(false)
		if mode == "intro":
			advance(replay, .45, Vector2.UP)
		elif mode == "pattern":
			replay.encounter.intro_left = 0.0
			replay.boss_pattern(replay_boss, "laser")
			advance(replay, .3, Vector2.UP)
		else:
			replay.damage(replay_boss, 1.0e9, "fixture")
			advance(replay, .25, Vector2.UP)
		var resumed = clone_sim(replay, mode)
		check(same_data(resumed.encounter, replay.encounter) and same_data(resumed.last_damage, replay.last_damage), mode + " preserves encounter clocks")
		for frame in 120:
			replay.step(1.0 / 60.0, Vector2.RIGHT)
			resumed.step(1.0 / 60.0, Vector2.RIGHT)
		check(same_data(replay.snapshot(), resumed.snapshot()), mode + " resumes deterministically")
		if not same_data(replay.snapshot(), resumed.snapshot()):
			print(first_difference(replay.snapshot(), resumed.snapshot()))

	var legacy = fresh(2)
	legacy.director_enabled = false
	var legacy_boss = legacy.spawn_boss(false)
	legacy.encounter.intro_left = 0.0
	legacy.boss_pattern(legacy_boss, "laser")
	advance(legacy, .25, Vector2.UP)
	var legacy_snapshot = legacy.snapshot()
	legacy_snapshot.erase("encounter")
	legacy_snapshot.erase("last_damage")
	var migrated = Sim.new()
	check(migrated.restore(JSON.parse_string(JSON.stringify(legacy_snapshot, "", true, true))), "G1 metadata-free snapshot migrates")
	check(migrated.encounter.active and migrated.encounter.boss_id == legacy_boss.id and migrated.encounter.intro_left == 0, "G1 live boss adopted without replaying intro")
	check(migrated.last_damage.amount == 0 and migrated.last_damage.cause.is_empty(), "G1 migration supplies neutral wound metadata")
	check(same_data(migrated.threats, legacy.threats) and migrated.rng.state == legacy.rng.state, "G1 migration preserves active telegraphs and RNG")
	legacy_snapshot.enemies.clear()
	legacy_snapshot.threats.clear()
	check(migrated.restore(legacy_snapshot) and not migrated.encounter.active, "G1 snapshot without boss migrates to ordinary encounter state")
	real_g1_overlap()

	var intact = fresh()
	intact.spawn_boss(false)
	var original = intact.snapshot()
	var untracked = original.duplicate(true)
	untracked.encounter = {"active": false, "boss_id": 0, "intro_left": 0.0, "recover_left": 0.0, "role": "", "name": "", "pattern": "", "pattern_time": 0.0}
	reject_atomic(intact, untracked, "G2 metadata cannot silently orphan a live boss")
	for mutation in [
		{"path": "encounter", "value": []},
		{"path": "encounter", "value": {"active": true}},
		{"path": "encounter.boss_id", "value": 999999},
		{"path": "encounter.boss_id", "value": 1.5},
		{"path": "encounter.intro_left", "value": -1.0},
		{"path": "encounter.intro_left", "value": 999.0},
		{"path": "encounter.recover_left", "value": 2.0},
		{"path": "encounter.active", "value": false},
		{"path": "encounter.pattern_time", "value": NAN},
		{"path": "last_damage", "value": "corrupt"},
		{"path": "last_damage.amount", "value": -1.0},
		{"path": "last_damage.amount", "value": 99.0},
		{"path": "last_damage.at", "value": 20.0},
		{"path": "last_damage.cause", "value": ["wrong type"]}
	]:
		var invalid = original.duplicate(true)
		var path = str(mutation.path).split(".")
		if path.size() == 1:
			invalid[path[0]] = mutation.value
		else:
			invalid[path[0]][path[1]] = mutation.value
		reject_atomic(intact, invalid, "malformed " + str(mutation.path) + " " + str(mutation.value))

	var report = {"engine": Engine.get_version_info().string, "suite": "G2 encounter quality and migration regression", "passed": passed, "failed": failed, "checks": checks, "notes": ["Timing fixtures can skip clocks and grant invulnerability to isolate rules; they are not natural difficulty evidence.", "Real fixture tests/fixtures/g1_900s_two_midbosses.json was generated by unchanged sibling G1 arena_sim.gd under the G1 project path; its provenance sidecar records source and fixture hashes.", "G1 migration preserves every existing entity and awarded stat. Carried concurrent bosses stay concurrent; tracked ownership transfers immediately on death, and recovery/future boss spawns wait until all carried bosses die. Both kill orders and immediate G2 resaves are checked.", "Replay comparison permits 1e-8 absolute numeric round-off from Godot JSON parsing; RNG state strings and collection order remain exact.", "G2 intentionally defers newly scheduled boss deadlines until prior boss defeat and recovery. Base weapon/enemy damage arrays are unchanged."]}
	var file = FileAccess.open("res://tests/g2_combat_regression_report.json", FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(report, "  "))
	print("G2 COMBAT CHECKS ", passed, " passed ", failed, " failed")
	quit(1 if failed else 0)
