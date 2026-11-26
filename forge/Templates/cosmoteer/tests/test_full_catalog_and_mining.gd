extends SceneTree

const ShipDesign := preload("res://sim/ship_design.gd")
const ShipBattle := preload("res://sim/ship_battle.gd")
const CombatSystems := preload("res://sim/combat_systems.gd")
const Shipyard := preload("res://ui/shipyard.gd")

var checks := 0
var failed := 0


func _initialize() -> void:
	_test_100_percent_terran_catalog_coverage()
	_test_asteroid_mining_and_refining()
	_test_ui_miner_preset_and_mining_hud.call_deferred()


func _check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", label)


func _test_100_percent_terran_catalog_coverage() -> void:
	var design := ShipDesign.new()
	var missing: Array[String] = []
	for id in design.by_id.keys():
		if not Shipyard.CORE.has(id):
			missing.append(str(id))
	_check(missing.is_empty(), "100% of all 97 modules (96 Terran + lab engine room) are restored in Shipyard.CORE; missing=" + str(missing))
	var rules := CombatSystems.extracted_rules()
	_check(rules.get("resources", {}).size() >= 20, "extracted_rules contains >=20 Cosmoteer resources")
	_check(rules.get("asteroids", []).size() >= 8, "extracted_rules contains >=8 Cosmoteer asteroid resource classes")


func _test_asteroid_mining_and_refining() -> void:
	var design := ShipDesign.new()
	design.deep_space_miner()
	var issue := ShipBattle.validate_design(design)
	_check(issue.is_empty(), "deep_space_miner passes launch validation: " + issue)
	var battle := ShipBattle.new()
	var started := battle.start(design, null, {
		"id": "asteroid_belt_rush", "objective": "mine", "opponent": "miner",
		"distance": 180, "ai": "standoff", "faction": "fringe",
		"background": "bg_tan_teal_blue", "planet": "planet_rocky", "nebula": "cloudy",
		"asteroids": 12, "mining_goal": 1500,
	})
	_check(started and battle.result == "active", "asteroid_belt_rush mining battle starts cleanly")
	_check(battle.asteroids.size() == 12, "twelve asteroids spawn in the mining sector")
	_check(battle.cargo_capacity >= 120, "storage_3x2 + storage_2x2 expand cargo capacity (>=120)")
	_check(CombatSystems.mining_value_mult(battle.player, "iron") > 1.5, "factory_steel increases iron refining value")
	_check(CombatSystems.mining_value_mult(battle.player, "carbon") > 2.0, "factory_diamond increases carbon refining value")
	_check(CombatSystems.sensor_range_mult(battle.player) > 1.0, "roof_headlight improves effective sensor visibility")
	var saw_asteroid_beam := false
	for _i in 300:
		if battle.result != "active":
			break
		battle.step(0.1)
		for b in battle.ion_beams:
			if str(b.get("hit_kind", "")) == "asteroid":
				saw_asteroid_beam = true
	_check(saw_asteroid_beam, "mining lasers lock onto and mine asteroids in the sector")
	_check(battle.cargo_total > 0 and battle.mined_credits > 0, "ore fills cargo hold and earns credits")
	_check(battle.result == "win" and battle.outcome_reason == "mined", "reaching mining_goal completes mine objective with win/mined (got %s/%s, cr=%d)" % [battle.result, battle.outcome_reason, battle.mined_credits])


func _test_ui_miner_preset_and_mining_hud() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var lab = scene.get_node("UI/Laboratory")
	await process_frame
	var yard = lab.shipyard
	yard._miner_preset()
	_check(not yard.depart_button.disabled, "deep_space_miner preset is launch-ready in shipyard")
	yard.depart_button.pressed.emit()
	await process_frame
	var duel = yard.duel
	_check(duel.is_visible_in_tree() and duel.flight_view != null, "miner launches cleanly into tactical flight view")
	print("Full catalog & mining checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)
