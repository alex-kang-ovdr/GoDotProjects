extends SceneTree

const EngineScript = preload("res://scripts/fort_engine.gd")

var _failures: Array[String] = []


func _initialize() -> void:
	_catalog_maps_and_controls()
	_seeded_volley()
	_one_pixel_wall()
	_status_and_teleport()
	_blue3_rounds()
	_frame_independent_ai()
	if _failures.is_empty():
		print("FORTRESS_WAR_ENGINE_OK")
		quit(0)
	else:
		for failure in _failures:
			printerr(failure)
		quit(1)


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)


func _new_game(options: Dictionary = {}):
	var settings = {"control": "hotseat", "teamSize": 1, "seed": 123}
	settings.merge(options, true)
	return EngineScript.new(settings)


func _wait_for(game, condition: Callable, limit: int = 400, dt: float = 0.1) -> bool:
	for i in limit:
		if condition.call():
			return true
		game.tick(dt)
	return condition.call()


func _flat_fixture(game) -> void:
	var width: int = game.terrain.width
	var mask := PackedByteArray()
	mask.resize(width * game.terrain.height)
	for i in range(500 * width, 651 * width):
		mask[i] = 1
	game.terrain.mask = mask
	game.terrain.solidCount = width * 151
	game.terrain.version += 1
	game.state.wind = 0
	for i in game.state.tanks.size():
		var tank = game.state.tanks[i]
		tank.x = 300 if i == 0 else 1500
		tank.y = 486
		tank.vx = 0
		tank.vy = 0
		tank.tilt = 0


func _catalog_maps_and_controls() -> void:
	var game = _new_game()
	_check(game.data.catalogs.classic.size() == 13 and game.data.catalogs.blue3.size() == 4, "Incomplete catalog")
	_check(game.state.tanks.size() == 2 and game.active().typeId == "catapult", "Classic roster")
	_check(game.terrain.mask.size() == 1800 * 820 and game.terrain.solidCount > 0, "Terrain dimensions")
	_check(game.get_aiming_state().angleProfileId == "jp2003", "Default classic angle profile")
	_check(game.get_charge_power(0) == 0 and game.get_charge_power(100.0 / 72) == 100, "Power charge range")
	var islands = _new_game({"map": "islands"})
	var foundry = _new_game({"map": "foundry"})
	_check(islands.surface_at(400) == null and foundry.surface_at(820) == null, "Map gaps")
	_check(game.surface_at(400) != null and foundry.surface_at(400) != null, "Map solid columns")
	_check(not game.set_angle(NAN) and not game.set_power(INF) and not game.set_weapon(99), "Malformed input guard")
	_check(not game.set_facing(0) and game.set_aim_at_world(50, 400) and game.active().face == -1, "Pointer and facing")
	var tank = game.active()
	var start_x: float = tank.x
	var start_budget: float = tank.moveLeft
	_check(game.move(1, 0.1) and tank.x > start_x and tank.moveLeft < start_budget, "Movement and movement budget")
	game.set_paused(true)
	var before = game.get_snapshot()
	game.tick(1.0)
	_check(not game.fire() and not game.skip() and not game.move(-1, 0.1), "Paused controls")
	_check(before == game.get_snapshot(), "Paused simulation")


func _seeded_volley() -> void:
	var events: Array = []
	var a = _new_game({"playerTank": "multi_missile", "opponentTank": "multi_missile",
		"onEvent": func(e): events.append(e)})
	var b = _new_game({"playerTank": "multi_missile", "opponentTank": "multi_missile"})
	for game in [a, b]:
		_check(game.set_angle(48) and game.set_power(59), "Aim and power input")
		_check(game.use_item("double") and not game.use_item("shield"), "One item per turn")
		_check(game.get_action_preview().shots == 6, "Three-shot double preview")
	_check(a.get_trajectory() == b.get_trajectory(), "Seeded trajectory")
	var timer: float = a.state.timeLeft
	for game in [a, b]:
		_check(game.fire() and not game.fire(), "One volley per turn")
	for i in 220:
		a.tick(0.1)
		b.tick(0.1)
		if a.state.phase == "projectile":
			_check(a.state.turnNumber == 1 and a.state.timeLeft == timer, "Volley blocks turn advancement")
	_check(a.get_snapshot() == b.get_snapshot(), "Deterministic simulation state")
	_check(a.terrain.mask == b.terrain.mask, "Deterministic excavation")
	var shots = events.filter(func(e): return e.type == "shot")
	var endings = events.filter(func(e): return e.type == "actionEnd")
	_check(shots.size() == 6 and endings.size() == 1, "Action emits six shots and one completion")
	if shots.size() == 6 and endings.size() == 1:
		_check(shots.all(func(e): return e.volleyId == endings[0].volleyId) and endings[0].shots == 6, "Action event IDs")


func _one_pixel_wall() -> void:
	var events = []
	var game = _new_game({"onEvent": func(e): events.append(e)})
	_flat_fixture(game)
	var mask: PackedByteArray = game.terrain.mask
	for y in range(100, 500):
		mask[y * game.terrain.width + 600] = 1
	game.terrain.mask = mask
	game.terrain.solidCount += 400
	var tank = game.active()
	tank.def = tank.def.duplicate(true)
	tank.def.weapons[0].behavior.aimMin = 0
	tank.def.weapons[0].behavior.aimMax = 90
	game.set_angle(0)
	game.set_power(100)
	var trajectory = game.get_trajectory()
	var version: int = game.terrain.version
	game.fire()
	var landed = _wait_for(game, func(): return events.any(func(e): return e.type == "explosion"))
	_check(landed, "One-pixel wall impact occurred")
	if landed:
		var blast = events.filter(func(e): return e.type == "explosion")[0]
		_check(blast.x >= 600 and blast.x < 601, "Collision swept the one-pixel wall")
		_check(game.terrain.version > version and not game.solid(blast.x, blast.y), "Impact excavates terrain")
		_check(is_equal_approx(trajectory.back().x, blast.x) and is_equal_approx(trajectory.back().y, blast.y), "Guide endpoint matches live collision")


func _status_and_teleport() -> void:
	var game = _new_game({"playerTank": "laser", "opponentTank": "multi_missile"})
	_flat_fixture(game)
	var shooter = game.active()
	shooter.hp -= 100
	_check(game.use_item("repair") and shooter.hp == shooter.maxHp, "Repair caps at max HP")
	var target = game.state.tanks.filter(func(t): return t.team != shooter.team)[0]
	target.status.shield = 1
	var hp = target.hp
	_check(game._damage(target, 100, "laser", false) and target.hp == hp and target.status.shield == 0, "Shield blocks direct damage once")
	_check(not game._damage(target, 30, "fire", true) and target.hp == hp - 30, "Periodic damage bypasses shields")
	var mecha = game.data.catalogs.blue3.filter(func(t): return t.id == "mecha_punch")[0]
	var laser = game._new_projectile(shooter, mecha.weapons[2], 0, 100)
	var vx = laser.vx
	var vy = laser.vy
	game.state.wind = 7
	game._advance_projectile(laser, EngineScript.FIXED_DT, true)
	_check(laser.vx == vx and laser.vy == vy, "Linear weapon ignores wind and gravity")
	game.state.itemUsed = false
	_check(game.use_item("teleport"), "Teleport arms")
	var preview = game.get_action_preview()
	_check(preview.isSupport and preview.kind == "teleport" and preview.shots == 1, "Teleport is a single support projectile")
	game.set_angle(45)
	game.set_power(40)
	game.state.wind = 0
	var start_x = shooter.x
	game.fire()
	_check(_wait_for(game, func(): return game.state.lastAction != null), "Teleport resolves")
	_check(game.state.lastAction != null and game.state.lastAction.reason == "teleport" and absf(shooter.x - start_x) > 30, "Teleport moves only its owner")


func _blue3_rounds() -> void:
	var game = _new_game({"profile": "blue3", "teamSize": 1, "tuning": {"turnTime": 5}})
	_check(game.state.tanks.size() == 8 and game.config.teamSize == 4, "BLUE3 forces 4v4")
	_check(game.get_aiming_state().angleProfileId == "blue3_catalog", "Independent BLUE3 aim profile")
	var locked = game.active().def.weapons.find_custom(func(w): return w.unlockRound > 1)
	_check(locked >= 0 and not game.set_weapon(locked), "BLUE3 action unlock gates")
	for i in 140:
		if game.state.phase == "gameover" or game.state.suddenDeath:
			break
		game.skip()
		game.tick(0.25)
		game.tick(0.25)
	_check(game.state.round == 8 and game.state.suddenDeath, "BLUE3 first sudden death round")
	_check(game.state.tanks.all(func(t): return t.hp == t.maxHp - ceilf(t.maxHp * 0.08)), "Sudden death deals periodic damage")
	_check(not game.can_use_item("double") and game.get_action_preview().repeat == 3, "Sudden death triples attacks")
	for i in 100:
		if game.state.phase == "gameover":
			break
		game.skip()
		game.tick(0.25)
		game.tick(0.25)
	_check(game.state.phase == "gameover" and game.state.endReason == "round_limit", "BLUE3 stops at round ten")


func _frame_independent_ai() -> void:
	var events_a: Array = []
	var events_b: Array = []
	var a = _new_game({"control": "ai", "opponentTank": "secwind", "onEvent": func(e): events_a.append(e)})
	var b = _new_game({"control": "ai", "opponentTank": "secwind", "onEvent": func(e): events_b.append(e)})
	_check(a.active().team == 1 and not a.is_human_turn() and not a.fire(), "Computer turn rejects human input")
	for i in 90:
		a.tick(1.0 / 15.0)
	for i in 360:
		b.tick(1.0 / 60.0)
	var shots_a = events_a.filter(func(e): return e.type == "shot")
	var shots_b = events_b.filter(func(e): return e.type == "shot")
	_check(not shots_a.is_empty() and shots_a == shots_b, "Computer volley is frame independent")
	var snap_a = a.get_snapshot()
	var snap_b = b.get_snapshot()
	_check(snap_a.stats == snap_b.stats and snap_a.tanks == snap_b.tanks and a.terrain.mask == b.terrain.mask, "Computer outcome is frame independent")
