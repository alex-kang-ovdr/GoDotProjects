extends SceneTree

const Operations := preload("res://sim/operations.gd")
const Design := preload("res://sim/ship_design.gd")
const Battle := preload("res://sim/ship_battle.gd")
const Flight := preload("res://sim/flight_dynamics.gd")

var checks := 0
var failures := 0


func _initialize() -> void:
	var data := Operations.new("user://unused_operation_combat_%d.json" % OS.get_process_id())
	_check(data.load_error.is_empty() and data.missions.size() >= 3, "operation catalog loads")
	if failures == 0:
		var design := Design.new()
		design.flight_starter()
		_test_skirmish(design, data.missions[0])
		_test_disarm(design, data.missions[1])
		_test_survive(design, data.missions[2])
	print("Operation combat checks: %d; failures: %d" % [checks,failures])
	quit(int(failures > 0))


func _check(condition: bool, context: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		printerr("FAIL ",context)


func _test_skirmish(design: Design, rules: Dictionary) -> void:
	var duel := Battle.new()
	if not _started(duel, design, rules):
		return
	duel.select_target(duel.enemy.ids[Battle.GUN][0])
	duel.step(100.0)
	_check(duel.result == "win" and duel.outcome_reason == "enemy_bridge", "skirmish can be won with standard combat")
	_check(duel.player.shots > 0 and duel.enemy.hits > 0, "skirmish simulates both sides' combat")
	print("Skirmish %.2fs, %s, player hits %d" % [duel.elapsed,duel.result,duel.player.hits])


func _test_disarm(design: Design, rules: Dictionary) -> void:
	var duel := Battle.new()
	if not _started(duel, design, rules):
		return
	_check(duel.enemy.ids.has("cosmoteer.thruster_med"), "pursuer carries an additional forward engine")
	_check(duel.target_uid == duel.enemy.ids[Battle.GUN][0], "disarm defaults to enemy weapon")
	var contact := duel.player.duplicate()
	contact.position = duel.enemy.position - Vector2(115, 0)
	var pursuit := Flight.ai_orders(duel.enemy, contact, 0.0, rules.ai)
	var balanced := Flight.ai_orders(duel.enemy, contact, 0.0)
	_check(pursuit.x > balanced.x, "pursuit orders close distance more aggressively")
	duel.step(100.0)
	_check(duel.result == "win" and duel.outcome_reason == "disarmed", "normal focused fire can disarm the pursuer")
	_check(duel.enemy.parts[duel.enemy.ids[Battle.BRIDGE][0]].hp > 0 and duel.player.hits > 0, "precision win preserves enemy bridge after actual fire")
	print("Disarm %.2fs, %s, player hits %d" % [duel.elapsed,duel.result,duel.player.hits])
	if not _started(duel, design, rules):
		return
	duel.enemy.parts[duel.enemy.ids[Battle.GUN][0]].hp = 0
	duel.enemy.parts[duel.enemy.ids[Battle.BRIDGE][0]].hp = 0
	duel.step(Battle.DT)
	_check(duel.result == "loss" and duel.outcome_reason == "protected_bridge", "simultaneous weapon and protected bridge loss fails the mission")


func _test_survive(design: Design, rules: Dictionary) -> void:
	var duel := Battle.new()
	if not _started(duel, design, rules):
		return
	_check(duel.enemy.ids[Battle.GUN].size() == 2, "siege ship fields two weapons")
	_check(Flight.ai_orders(duel.enemy, duel.player, 0, rules.ai).x < 0, "siege opponent initially backs out toward standoff range")
	while duel.elapsed < 12.0 and duel.enemy.shots == 0 and duel.result == "active":
		duel.step(Battle.DT)
	_check(duel.enemy.shots > 0, "siege enemy opens fire during the evacuation")
	duel.set_flight_input(Vector2.LEFT, 0.0)
	duel.step(float(rules.seconds) - duel.elapsed - Battle.DT)
	_check(duel.result == "active", "survival does not award victory before the last tick")
	duel.step(Battle.DT)
	_check(duel.result == "win" and duel.outcome_reason == "survived", "retreat keeps the player alive until the exact deadline")
	print("Evacuation %.2fs, %s, enemy shots %d" % [duel.elapsed,duel.result,duel.enemy.shots])
	if not _started(duel, design, rules):
		return
	duel.player.parts[duel.player.ids[Battle.BRIDGE][0]].hp = 0
	duel.step(Battle.DT)
	_check(duel.result == "loss" and duel.outcome_reason == "own_bridge", "own bridge loss ends survival early")


func _started(duel: Battle, design: Design, rules: Dictionary) -> bool:
	var started := duel.start(design, null, rules)
	_check(started, "operation launches using catalog opponent: " + duel.launch_error)
	if started:
		var distance: float = duel.player.position.distance_to(duel.enemy.position)
		_check(is_equal_approx(distance, rules.distance), "catalog deployment distance is exact")
	return started
