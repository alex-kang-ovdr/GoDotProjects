extends SceneTree

const CombatSystems := preload("res://sim/combat_systems.gd")
const ShipDesign := preload("res://sim/ship_design.gd")
const ShipBattle := preload("res://sim/ship_battle.gd")

var checks := 0
var failed := 0


func _initialize() -> void:
	test.call_deferred()


func _check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", label)


func test() -> void:
	# 1. Verify reverse-engineered logic_trace.json & dll_mechanics.json load cleanly
	var trace = JSON.parse_string(FileAccess.get_file_as_string("res://data/logic_trace.json"))
	_check(trace is Dictionary and trace.get("methods", []).size() >= 42, "expanded logic_trace.json traces >= 42 Cosmoteer.dll methods")
	var mech := CombatSystems.get_dll_mechanics()
	_check(not mech.is_empty() and int(mech.get("traced_methods", 0)) >= 42, "dll_mechanics.json v2 loads reverse-engineered constants")

	# 2. BulletPenetratingHit: exact projectile penetration & part resistance
	_check(is_equal_approx(CombatSystems.projectile_penetration("cannon"), 5.0), "medium cannon penetration == 5.0")
	_check(is_equal_approx(CombatSystems.projectile_penetration("cannon_large"), 7.0), "large cannon penetration == 7.0")
	_check(is_equal_approx(CombatSystems.projectile_penetration("cannon_deck"), 9.0), "deck cannon penetration == 9.0")
	_check(is_equal_approx(CombatSystems.projectile_penetration("railgun", 1.5), 22.5), "railgun penetration scales with accelerator multiplier")
	_check(is_equal_approx(CombatSystems.part_penetration_resistance("cosmoteer.armor"), 7.0), "armor penetration resistance == 7.0")
	_check(is_equal_approx(CombatSystems.part_penetration_resistance("cosmoteer.ion_beam_prism"), 100.0), "ion prism penetration resistance == 100.0")
	_check(CombatSystems.projectile_penetration("cannon") < CombatSystems.part_penetration_resistance("cosmoteer.armor"), "armor stops medium cannon penetration")
	_check(CombatSystems.projectile_penetration("railgun") > CombatSystems.part_penetration_resistance("cosmoteer.armor"), "railgun penetrates armor")

	# 3. IonEnergyStorage / ion_beam_prism: exact 0.75^k combining curve
	var c2 := CombatSystems.combine_ion_beams([1.0, 1.0])
	var c3 := CombatSystems.combine_ion_beams([1.0, 1.0, 1.0])
	_check(absf(c2 - 1.75) < 0.001, "2 combined ion beams equal 1.75 (0.75^k): %.4f" % c2)
	_check(absf(c3 - 2.3125) < 0.001, "3 combined ion beams equal 2.3125 (0.75^k): %.4f" % c3)

	# 4. Reactor Meltdown blast & ShipPhysics impulse & AIValueTargeterModule
	var design := ShipDesign.new()
	design.starter()
	var battle := ShipBattle.new()
	_check(battle.start(design), "starter duel starts for DLL mechanics test")

	# AIValueTargeterModule ranks bridge/reactor above corridor
	var best_uid := CombatSystems.choose_value_target(battle.enemy, Vector2(battle.player.position))
	_check(best_uid >= 0 and battle.enemy.parts.has(best_uid), "AIValueTargeterModule selects valid target part")
	var best_id := str(battle.enemy.parts[best_uid].id)
	_check(CombatSystems.is_bridge(best_id) or CombatSystems.is_reactor(best_id) or CombatSystems.is_weapon(best_id), "AIValueTargeterModule prioritizes high-value module: " + best_id)

	# ShipPhysics impulse transfer
	var v_before := Vector2(battle.enemy.velocity)
	CombatSystems.apply_hit_impulse(battle.enemy, Vector2.RIGHT, 4000.0, "railgun_scale")
	_check(Vector2(battle.enemy.velocity).x > v_before.x + 0.05, "ShipPhysics hit impulse pushes enemy hull")

	# Reactor Meltdown blast triggers when reactor is destroyed
	var reactor_uids: Array = battle.enemy.ids.get(CombatSystems.REACTOR_SMALL, [])
	_check(not reactor_uids.is_empty(), "enemy ship has reactor_small for meltdown test")
	if not reactor_uids.is_empty():
		var ruid: int = int(reactor_uids[0])
		var rpos := ShipBattle.part_world(battle.enemy, ruid)
		battle.enemy.parts[ruid].hp = 0.0
		battle._on_part_destroyed(battle.enemy, ruid, "player", ruid, rpos)
		var saw_meltdown := false
		for ev in battle.events:
			if str(ev.get("kind", "")) == "blast" and str(ev.get("blast_kind", "")) == "meltdown":
				saw_meltdown = true
				break
		_check(saw_meltdown, "destroying reactor triggers Cosmoteer reactor meltdown blast event")

	# 5. DirectionalCrewSpeeds: conveyor Up=2.0, Side=0.75, Down=0.25 + fire slowdown
	var conv_up := {"id": CombatSystems.CONVEYOR, "rotation": 0, "walk_factor": 2.0, "fire": 0.0}
	_check(is_equal_approx(CombatSystems.crew_step_speed_factor(conv_up, Vector2i.UP), 2.0), "conveyor forward speed == 2.0")
	_check(is_equal_approx(CombatSystems.crew_step_speed_factor(conv_up, Vector2i.RIGHT), 0.75), "conveyor sideways speed == 0.75")
	_check(is_equal_approx(CombatSystems.crew_step_speed_factor(conv_up, Vector2i.DOWN), 0.25), "conveyor backward speed == 0.25")
	var conv_right := {"id": CombatSystems.CONVEYOR, "rotation": 1, "walk_factor": 2.0, "fire": 0.0}
	_check(is_equal_approx(CombatSystems.crew_step_speed_factor(conv_right, Vector2i.RIGHT), 2.0), "rotated conveyor forward speed == 2.0")
	var burning_room := {"id": "cosmoteer.corridor", "rotation": 0, "walk_factor": 1.0, "fire": 1.0}
	_check(CombatSystems.crew_step_speed_factor(burning_room, Vector2i.RIGHT) < 0.3, "active fire slows crew movement to 0.2x")

	# 6. StructureContiguityManager: destroying connecting part severs isolated wing
	var d_sev := ShipDesign.new()
	d_sev.starter()
	var b_sev := ShipBattle.new()
	_check(b_sev.start(d_sev), "severing test duel starts")
	var mass_before := float(b_sev.player.mass)
	# Kill every cell adjacent to the nose laser (leaving laser alive but isolated)
	var laser_uids: Array = b_sev.player.ids.get(CombatSystems.LASER_SMALL, [])
	if not laser_uids.is_empty():
		var luid: int = int(laser_uids[0])
		var lpart: Dictionary = b_sev.player.parts[luid]
		var lc: Vector2i = lpart.cell
		var ls: Vector2i = lpart.size
		for x in range(lc.x - 1, lc.x + ls.x + 1):
			for y in range(lc.y - 1, lc.y + ls.y + 1):
				var nuid := int(b_sev.player.cells.get(Vector2i(x, y), -1))
				if nuid >= 0 and nuid != luid and b_sev.player.parts.has(nuid):
					var np: Dictionary = b_sev.player.parts[nuid]
					if not CombatSystems.is_bridge(np.id):
						np.hp = 0.0
		var sev_list := CombatSystems.refresh_structural_contiguity(b_sev.player)
		_check(luid in sev_list and bool(lpart.get("severed", false)), "StructureContiguityManager severs isolated laser disconnected from bridge")
		b_sev.player.parts[luid].hp = 100.0
		# Refreshing mass excludes severed parts
		var Flight := preload("res://sim/flight_dynamics.gd")
		Flight.refresh_mass(b_sev.player)
		_check(float(b_sev.player.mass) < mass_before, "Flight.refresh_mass excludes severed hull mass")

	# 7. FireSpread: burning room spreads fire to adjacent interior room, blocked by fire_foam
	var d_fire := ShipDesign.new()
	d_fire.starter()
	var b_fire := ShipBattle.new()
	b_fire.start(d_fire)
	var corr_uids: Array = b_fire.player.ids.get("cosmoteer.corridor", [])
	if corr_uids.size() >= 2:
		var src_uid: int = int(corr_uids[0])
		b_fire.player.parts[src_uid].fire = 1.0
		var spread_happened := false
		for _t in 80:
			var rep := CombatSystems.tick_fires(b_fire.player, 0.1)
			b_fire.player.parts[src_uid].fire = 1.0
			if not rep.get("ignited", []).is_empty():
				spread_happened = true
				break
		_check(spread_happened, "FireSpread propagates fire from burning room to adjacent interior cell")

	# 8. BuffManager: real cosmoteer.engine_room adjacent to thruster grants +50% (1.5x) thrust buff
	var mock_ship := {
		"ids": {CombatSystems.ENGINE_ROOM_REAL: [10]},
		"parts": {
			10: {"id": CombatSystems.ENGINE_ROOM_REAL, "hp": 1000.0, "energy": 500, "cell": Vector2i(2, 2), "size": Vector2i(3, 3), "severed": false},
			20: {"id": "cosmoteer.thruster_small", "hp": 500.0, "cell": Vector2i(5, 2), "size": Vector2i(1, 1), "severed": false},
			21: {"id": "cosmoteer.thruster_small", "hp": 500.0, "cell": Vector2i(8, 2), "size": Vector2i(1, 1), "severed": false},
		},
		"cells": {},
	}
	for dx in 3:
		for dy in 3:
			mock_ship.cells[Vector2i(2 + dx, 2 + dy)] = 10
	mock_ship.cells[Vector2i(5, 2)] = 20
	mock_ship.cells[Vector2i(8, 2)] = 21
	_check(is_equal_approx(CombatSystems.thruster_engine_room_buff(mock_ship, mock_ship.parts[20]), 1.5), "adjacent powered engine_room grants +50% (1.5x) thruster buff")
	_check(is_equal_approx(CombatSystems.thruster_engine_room_buff(mock_ship, mock_ship.parts[21]), 1.0), "non-adjacent thruster receives 1.0x unbuffed thrust")

	print("DLL mechanics checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)
