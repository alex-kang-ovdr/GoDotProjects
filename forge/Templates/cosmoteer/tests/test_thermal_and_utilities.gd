extends SceneTree

const ShipDesign := preload("res://sim/ship_design.gd")
const ShipBattle := preload("res://sim/ship_battle.gd")
const CombatSystems := preload("res://sim/combat_systems.gd")
const EngineRoom := preload("res://sim/engine_room.gd")

var checks := 0
var failed := 0


func _initialize() -> void:
	_test_extracted_world_data()
	_test_thermal_titan_and_resonance()
	_test_tractor_and_mining_ship()
	_test_missile_warheads_emp_and_nuke()
	_test_conveyor_capacitor_sensor_radiator()
	_test_ui_missile_mode_and_titan_preset.call_deferred()


func _check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", label)


func _test_extracted_world_data() -> void:
	var rules := CombatSystems.extracted_rules()
	_check(rules.get("nebulas", []).size() >= 1, "extracted_rules contains Cosmoteer nebulas")
	_check(rules.get("planets", []).size() >= 1, "extracted_rules contains Cosmoteer planets")
	_check(rules.get("sectors", []).size() >= 1, "extracted_rules contains Cosmoteer sectors")
	_check(rules.get("ai_profiles", []).size() >= 1, "extracted_rules contains Cosmoteer AI profiles")


func _test_thermal_titan_and_resonance() -> void:
	var design := ShipDesign.new()
	design.thermal_lance_titan()
	var issue := ShipBattle.validate_design(design)
	_check(issue.is_empty(), "thermal_lance_titan passes launch validation: " + issue)
	var battle := ShipBattle.new()
	var started := battle.start(design, null, {
		"id": "thermal_titan", "objective": "duel", "opponent": "titan",
		"distance": 190, "ai": "balanced", "faction": "io", "background": "bg_yellow_orange",
	})
	_check(started and battle.result == "active", "thermal titan battle starts cleanly")
	_check(CombatSystems.sensor_range_mult(battle.player) > 1.0, "sensor_array grants >1.0 range multiplier")
	_check(EngineRoom.radiator_cooling(battle.player) > 0.0, "radiator grants bonus heat cooling")
	var saw_resonance := false
	for _i in 240:
		if battle.result != "active":
			break
		battle.step(0.1)
		for b in battle.ion_beams:
			if str(b.get("beam_kind", "")) == "resonance":
				saw_resonance = true
	_check(saw_resonance, "resonance_beam_turret fires thermal resonance lance")


func _test_tractor_and_mining_ship() -> void:
	var tug := ShipDesign.new()
	tug._clear_layout()
	tug.place(CombatSystems.BUNK_MED, Vector2i(0, 2))
	tug.place(CombatSystems.REACTOR_MED, Vector2i(3, 2))
	tug.place("cosmoteer.control_room_small", Vector2i(6, 2))
	tug.place(CombatSystems.TRACTOR_BEAM, Vector2i(9, 1))
	tug.place(CombatSystems.MINING_LASER, Vector2i(11, 6), 1)
	for x in range(2, 11):
		tug.place("cosmoteer.corridor", Vector2i(x, 6))
	for y in range(2, 6):
		tug.place("cosmoteer.corridor", Vector2i(2, y))
		tug.place("cosmoteer.corridor", Vector2i(8, y))
	var issue := ShipBattle.validate_design(tug)
	_check(issue.is_empty(), "tractor + mining vessel passes launch validation: " + issue)
	var battle := ShipBattle.new()
	var started := battle.start(tug, null, {"id": "skirmish", "objective": "duel", "opponent": "flight", "distance": 115, "ai": "balanced"})
	_check(started and battle.result == "active", "tractor + mining battle starts cleanly")
	var saw_tractor := false
	var saw_mining := false
	for _i in 240:
		if battle.result != "active":
			break
		battle.step(0.1)
		for b in battle.ion_beams:
			var bk := str(b.get("beam_kind", ""))
			if bk == "tractor":
				saw_tractor = true
			elif bk == "mining":
				saw_mining = true
	_check(saw_tractor, "tractor_beam_emitter engages and renders tractor beam")
	_check(saw_mining, "mining_laser_small fires mining beam")


func _test_missile_warheads_emp_and_nuke() -> void:
	var emp_prof := CombatSystems.missile_warhead_profile("emp")
	var nuke_prof := CombatSystems.missile_warhead_profile("nuke")
	_check(int(emp_prof.get("shield_energy_drain", 0)) > 0 and bool(emp_prof.get("emp_aoe", false)), "EMP warhead profile carries shield drain & EMP AoE")
	_check(float(nuke_prof.get("aoe_radius", 0.0)) >= 4.0 and float(nuke_prof.get("damage", 0.0)) >= 4000.0, "Nuke warhead profile carries massive blast radius & damage")

	# EMP missile firing test
	var design := ShipDesign.new()
	design.thermal_lance_titan()
	var b_emp := ShipBattle.new()
	b_emp.start(design, null, {"id": "vanguard", "objective": "duel", "opponent": "vanguard", "distance": 150, "ai": "balanced"})
	_check(b_emp.set_missile_mode("emp") and b_emp.missile_mode == "emp", "battle switches to EMP missile warhead mode")
	var saw_emp := false
	for _i in 180:
		if b_emp.result != "active":
			break
		b_emp.step(0.1)
		for p in b_emp.projectiles:
			if str(p.get("kind", "")) == "missile_emp":
				saw_emp = true
	_check(saw_emp, "missile launcher fires EMP missiles in EMP mode")

	# Nuke missile firing test
	var b_nuke := ShipBattle.new()
	b_nuke.start(design, null, {"id": "vanguard", "objective": "duel", "opponent": "vanguard", "distance": 150, "ai": "balanced"})
	_check(b_nuke.set_missile_mode("nuke") and b_nuke.missile_mode == "nuke", "battle switches to Nuke missile warhead mode")
	var saw_nuke := false
	var saw_nuke_blast := false
	for _i in 220:
		if b_nuke.result != "active":
			break
		b_nuke.step(0.1)
		for p in b_nuke.projectiles:
			if str(p.get("kind", "")) == "missile_nuke":
				saw_nuke = true
		for ev in b_nuke.events:
			if ev.kind == "blast":
				saw_nuke_blast = true
	_check(saw_nuke, "missile launcher fires Nuke missiles in Nuke mode")
	_check(saw_nuke_blast, "Nuke missile triggers AoE nuclear blast")


func _test_conveyor_capacitor_sensor_radiator() -> void:
	var design := ShipDesign.new()
	design.thermal_lance_titan()
	var battle := ShipBattle.new()
	battle.start(design, null, {"id": "skirmish", "objective": "duel", "opponent": "flight", "distance": 120, "ai": "balanced"})
	var has_conveyor: bool = not (battle.player.ids.get(CombatSystems.CONVEYOR, []) as Array).is_empty()
	var has_cap: bool = not (battle.player.ids.get(CombatSystems.CAPACITOR, []) as Array).is_empty()
	var has_med_bridge: bool = not (battle.player.ids.get(CombatSystems.BRIDGE_MED, []) as Array).is_empty()
	var has_engine_real: bool = not (battle.player.ids.get(CombatSystems.ENGINE_ROOM_REAL, []) as Array).is_empty()
	_check(has_conveyor and has_cap and has_med_bridge and has_engine_real, "titan contains conveyor, power_storage, control_room_med, and real 3x3 engine_room")
	var conv_uid: int = battle.player.ids[CombatSystems.CONVEYOR][0]
	_check(float(battle.player.parts[conv_uid].walk_factor) >= 2.0, "conveyor tile provides 2.0x crew walk speed factor")


func _test_ui_missile_mode_and_titan_preset() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var lab = scene.get_node("UI/Laboratory")
	await process_frame
	var yard = lab.shipyard
	yard._titan_preset()
	_check(not yard.depart_button.disabled, "titan preset is launch-ready in shipyard")
	yard.depart_button.pressed.emit()
	await process_frame
	var duel = yard.duel
	_check(duel.is_visible_in_tree() and duel.missile_mode_button.visible, "missile_mode_button visible for ships with missile launchers")
	_check(duel.missile_mode_button.text == "탄두: HE", "default missile warhead mode is HE")
	duel.missile_mode_button.pressed.emit()
	_check(duel.battle.missile_mode == "emp" and duel.missile_mode_button.text == "탄두: EMP", "clicking missile_mode_button cycles to EMP")
	duel.missile_mode_button.pressed.emit()
	_check(duel.battle.missile_mode == "nuke" and duel.missile_mode_button.text == "탄두: NUKE", "clicking missile_mode_button cycles to NUKE")
	duel.missile_mode_button.pressed.emit()
	_check(duel.battle.missile_mode == "thermal" and duel.missile_mode_button.text == "탄두: THERMAL", "clicking missile_mode_button cycles to THERMAL")
	duel.missile_mode_button.pressed.emit()
	_check(duel.battle.missile_mode == "mine" and duel.missile_mode_button.text == "탄두: MINE", "clicking missile_mode_button cycles to MINE")
	duel.missile_mode_button.pressed.emit()
	_check(duel.battle.missile_mode == "he" and duel.missile_mode_button.text == "탄두: HE", "clicking missile_mode_button wraps back to HE")
	print("Thermal & utilities checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)
