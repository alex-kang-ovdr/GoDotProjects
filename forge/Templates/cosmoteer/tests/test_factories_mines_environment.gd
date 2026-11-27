extends SceneTree

const ShipDesign := preload("res://sim/ship_design.gd")
const ShipBattle := preload("res://sim/ship_battle.gd")
const CombatSystems := preload("res://sim/combat_systems.gd")
const EngineRoom := preload("res://sim/engine_room.gd")

var checks := 0
var failed := 0


func _initialize() -> void:
	_test_carrier_validation_and_bonuses()
	_test_mines_thermal_manipulator_and_ion_storm()
	_test_explosive_charge_chain_blast()
	_test_ui_carrier_preset_and_nebula_render.call_deferred()


func _check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", label)


func _test_carrier_validation_and_bonuses() -> void:
	var design := ShipDesign.new()
	design.mine_factory_carrier()
	var issue := ShipBattle.validate_design(design)
	_check(issue.is_empty(), "mine_factory_carrier passes launch validation: " + issue)
	var battle := ShipBattle.new()
	var started := battle.start(design, null, {
		"id": "ion_storm_armada", "objective": "duel", "opponent": "carrier",
		"distance": 185, "ai": "balanced", "faction": "cabal",
		"background": "bg_galaxy", "planet": "planet_gas_ringed", "nebula": "ion_storm",
	})
	_check(started and battle.result == "active", "ion_storm_armada battle starts cleanly")
	_check(EngineRoom.heat_limit(battle.player) > EngineRoom.HEAT_LIMIT, "thermal_battery raises engine heat limit")
	_check(EngineRoom.radiator_cooling(battle.player) > 0.0, "heat_exchanger grants extra thermal cooling")
	_check(CombatSystems.factory_reload_mult(battle.player, CombatSystems.CANNON_MED) < 1.0, "factory_ammo accelerates cannon reload")
	_check(CombatSystems.factory_reload_mult(battle.player, CombatSystems.MISSILE_LAUNCHER, "mine") < 1.0, "factory_mine accelerates mine launch")
	var env := CombatSystems.nebula_environment(battle.mission)
	_check(float(env.range_mult) < 1.0 and float(env.shield_drain_dps) > 0.0 and bool(env.lightning), "ion_storm nebula reduces range, drains shields, and enables lightning")
	var p_data := CombatSystems.get_planet("planet_gas_ringed")
	_check(not p_data.is_empty(), "get_planet resolves planet_gas_ringed from extracted_rules.json")
	var n_data := CombatSystems.get_nebula("ion_storm")
	_check(not n_data.is_empty() and bool(n_data.get("has_lightning", false)), "get_nebula resolves ion_storm lightning flag")


func _test_mines_thermal_manipulator_and_ion_storm() -> void:
	var design := ShipDesign.new()
	design.mine_factory_carrier()
	var battle := ShipBattle.new()
	battle.start(design, null, {
		"id": "ion_storm_armada", "objective": "duel", "opponent": "carrier",
		"distance": 140, "ai": "balanced", "faction": "cabal",
		"background": "bg_galaxy", "planet": "planet_gas_ringed", "nebula": "ion_storm",
	})
	_check(battle.set_missile_mode("mine") and battle.missile_mode == "mine", "battle switches to mine mode")
	# Damage a player module slightly so manipulator_beam_emitter repairs it
	var armor_uid: int = battle.player.ids[CombatSystems.ARMOR_HYBRID_1X1][0]
	battle.player.parts[armor_uid].hp = 500.0
	var mb_uid: int = battle.player.ids[CombatSystems.MANIPULATOR_BEAM][0]
	battle.player.parts[mb_uid].energy = 2000
	var hd_uid: int = battle.player.ids[CombatSystems.HYPERDRIVE_SMALL][0]
	battle.player.parts[hd_uid].energy = 2000
	_check(CombatSystems.hyperdrive_thrust_mult(battle.player) > 1.0, "powered hyperdrive boosts ship thrust multiplier")
	var saw_mine := false
	var saw_manipulator := false
	var peak_armor_hp := 500.0
	for _i in 180:
		if battle.result != "active":
			break
		battle.step(0.1)
		peak_armor_hp = maxf(peak_armor_hp, float(battle.player.parts[armor_uid].hp))
		for p in battle.projectiles:
			if str(p.get("kind", "")) == "mine":
				saw_mine = true
		for b in battle.ion_beams:
			if str(b.get("beam_kind", "")) == "manipulator":
				saw_manipulator = true
	_check(saw_mine, "missile launcher deploys proximity space mines in mine mode")
	_check(saw_manipulator, "manipulator_beam_emitter fires green repair beam on damaged modules")
	_check(peak_armor_hp > 500.0, "manipulator beam repairs damaged armor")

	# Thermal missile warhead check
	var b_th := ShipBattle.new()
	b_th.start(design, null, {"id": "vanguard", "objective": "duel", "opponent": "vanguard", "distance": 150, "ai": "balanced"})
	_check(b_th.set_missile_mode("thermal") and b_th.missile_mode == "thermal", "battle switches to thermal missile mode")
	var saw_thermal := false
	for _i in 180:
		if b_th.result != "active":
			break
		b_th.step(0.1)
		for p in b_th.projectiles:
			if str(p.get("kind", "")) == "missile_thermal":
				saw_thermal = true
	_check(saw_thermal, "missile launcher fires thermal missiles in thermal mode")


func _test_explosive_charge_chain_blast() -> void:
	var design := ShipDesign.new()
	design.mine_factory_carrier()
	var battle := ShipBattle.new()
	battle.start(design, null, {"id": "skirmish", "objective": "duel", "opponent": "flight", "distance": 120, "ai": "balanced"})
	var charge_uid: int = battle.player.ids[CombatSystems.EXPLOSIVE_CHARGE][0]
	var adj_uid: int = battle.player.ids[CombatSystems.ARMOR_HYBRID_1X1][0]
	var before_hp: float = float(battle.player.parts[adj_uid].hp)
	battle.player.parts[charge_uid].hp = 0.0
	battle._on_part_destroyed(battle.player, charge_uid, "enemy", charge_uid, ShipBattle.part_world(battle.player, charge_uid))
	var after_hp: float = float(battle.player.parts[adj_uid].hp)
	_check(after_hp < before_hp, "destroying explosive_charge triggers AoE blast damaging adjacent parts")


func _test_ui_carrier_preset_and_nebula_render() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var lab = scene.get_node("UI/Laboratory")
	await process_frame
	var yard = lab.shipyard
	yard._carrier_preset()
	_check(not yard.depart_button.disabled, "mine_factory_carrier preset is launch-ready in shipyard")
	yard.depart_button.pressed.emit()
	await process_frame
	var duel = yard.duel
	_check(duel.is_visible_in_tree() and duel.flight_view != null, "carrier launches cleanly into tactical flight view")
	print("Factories, mines & environment checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)
