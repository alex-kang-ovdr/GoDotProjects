extends SceneTree
## Headless Godot 4.7 verification for TangTang Commando (Survivor.io) port.

const MainScene := preload("res://scenes/main.tscn")
const SimScript := preload("res://Scripts/SurvivorSim.gd")


func _initialize() -> void:
	call_deferred("_run")


func _check(cond: bool, msg: String) -> void:
	if not cond:
		printerr("ASSERTION FAILED: " + msg)
		quit(1)


func _run() -> void:
	# 1. Verify full scene instantiates cleanly with Korean FontFile loaded.
	var main := MainScene.instantiate()
	root.add_child(main)
	await process_frame
	_check(main.sim != null, "Main must initialize SurvivorSim")
	_check(main.ui_font is FontFile, "Subsetted Korean FontFile must load from res://fonts/survivor-ui.txt")
	_check(main.sim.state == "menu", "Initial state must be menu")

	# 2. Deterministic simulation tests on SurvivorSim.
	var sim := SimScript.new(1337)
	sim.start_run("assault", 0, "kunai")
	_check(sim.state == "playing", "start_run must enter playing state")

	# Movement & Dash
	var start_pos: Vector2 = sim.player["pos"]
	for _i in 4:
		sim.update(0.05, Vector2(1.0, 0.0))
	_check((sim.player["pos"] as Vector2).x > start_pos.x + 20.0, "Player should move right")
	_check(sim.trigger_dash(Vector2(0.0, 1.0)), "Dash should trigger")
	_check(sim.dash_time > 0.0 and float(sim.player["inv"]) > 0.0, "Dash grants burst and invulnerability")
	sim.update(0.1, Vector2.ZERO)

	# Hero skills (assault / engineer / medic)
	var grunt: Dictionary = sim.spawn_enemy("grunt", (sim.player["pos"] as Vector2) + Vector2(60, 0))
	_check(sim.trigger_hero_skill(), "Assault shockwave should trigger")
	_check(float(grunt["hp"]) <= 0.0, "Assault shockwave should kill nearby grunt")

	sim.selected_hero = "engineer"
	sim.hero_skill_cd = 0.0
	_check(sim.trigger_hero_skill(), "Engineer turret should deploy")
	_check(sim.turrets.size() == 1, "Engineer should have 1 active turret")

	sim.selected_hero = "medic"
	sim.hero_skill_cd = 0.0
	sim.player["hp"] = 50.0
	_check(sim.trigger_hero_skill(), "Medic heal field should deploy")
	sim.update(1.0, Vector2.ZERO)
	_check(float(sim.player["hp"]) > 50.0, "Medic heal field should restore HP")

	# Auto-fire kunai kills spawned enemy & XP pickup levels up
	sim.spawn_enemy("grunt", (sim.player["pos"] as Vector2) + Vector2(120, 0))
	for _i in 90:
		if sim.state == "playing":
			sim.update(1.0 / 30.0, Vector2.ZERO)
	_check(int(sim.player["kills"]) >= 2, "Auto-fire weapons should kill enemies")

	# Level-up draft, reroll, pick
	sim.gain_xp(100.0)
	_check(sim.state == "levelup", "Gaining enough XP must trigger levelup state")
	_check(sim.level_choices.size() >= 1, "Level-up must provide upgrade cards")
	_check(sim.reroll_level_choices(), "Reroll should succeed")
	_check(sim.pick_level_choice(0), "Picking card 0 should succeed")
	while sim.state == "levelup":
		sim.pick_level_choice(0)
	_check(sim.state == "playing", "Completing levelup must return to playing")

	# Weapon evolution: Kunai Lv5 + ATK Lv1 -> Ghost Shuriken
	sim.player["levels"]["kunai"] = 5
	sim.player["levels"]["atk"] = 1
	_check("kunai" in sim.evolution_eligible(), "Kunai should be eligible for evolution")
	_check(sim.evolve_weapon("kunai"), "Kunai evolution must succeed")
	_check(bool(sim.player["evolved"].get("kunai", false)), "Kunai evolved flag must be set")

	# Destroyer Drone fusion: DroneA Lv5 + DroneB Lv5 -> Destroyer (frees slot)
	sim.player["levels"]["droneA"] = 5
	sim.player["levels"]["droneB"] = 5
	_check("destroyer" in sim.evolution_eligible(), "Destroyer drone fusion should be eligible")
	_check(sim.evolve_weapon("destroyer"), "Destroyer fusion must succeed")
	_check(not sim.player["levels"].has("droneA") and not sim.player["levels"].has("droneB"), "DroneA/B must be consumed on fusion")
	_check(int(sim.player["levels"].get("destroyer", 0)) == 5, "Destroyer must be equipped at Lv5")

	# Final boss spawn, Phase 2, and chapter victory
	var boss: Dictionary = sim.spawn_boss(true)
	_check(not sim.active_boss().is_empty(), "Final boss should be active")
	sim.damage_enemy(boss, float(boss["max"]) * 0.55, "kunai")
	_check(int(boss["phase"]) == 2, "Boss must enter Phase 2 at <= 50% HP")
	sim.damage_enemy(boss, float(boss["max"]), "kunai")
	_check(sim.state == "win", "Defeating final boss must win the chapter")
	_check(int(sim.profile["unlocked"]) >= 2, "Winning chapter 1 must unlock chapter 2")

	main.free()
	print("SURVIVOR_IO_OK")
	quit(0)
