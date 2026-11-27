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
	_check(trace is Dictionary and trace.get("methods", []).size() >= 100, "expanded logic_trace.json traces >= 100 Cosmoteer.dll methods")
	var mech := CombatSystems.get_dll_mechanics()
	_check(not mech.is_empty() and int(mech.get("traced_methods", 0)) >= 100, "dll_mechanics.json v6 loads reverse-engineered constants")

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

	# 9. BulletEmitter.Recoil: deck cannon imparts Newtonian linear recoil & off-center torque
	var rec_ship := {"position": Vector2.ZERO, "velocity": Vector2.ZERO, "angular_velocity": 0.0, "mass": 60.0, "inertia": 200.0}
	CombatSystems.apply_weapon_recoil(rec_ship, Vector2(0.0, 4.0), Vector2.RIGHT, "cannon_deck", 1.0)
	_check(Vector2(rec_ship.velocity).x < -0.1, "BulletEmitter.Recoil pushes ship opposite fire direction")
	_check(absf(float(rec_ship.angular_velocity)) > 0.05, "Off-center deck cannon recoil applies rotational torque")

	# 10. ArcShield.RecalculateArcRadius: overclock extends active shield arc radius by 1.5x
	var sh_ship := {
		"command": true, "overclock": false,
		"ids": {CombatSystems.SHIELD_SMALL: [1]},
		"parts": {
			1: {"id": CombatSystems.SHIELD_SMALL, "hp": 2000.0, "energy": 3000, "capacity": 6000, "clock": 0, "shield_hp": 5000.0, "shield_max_hp": 6000.0, "shield_active": true, "shield_reboot": 0.0, "shield_flash": 0.0, "shield_radius": 7.5, "stats": {"shield_radius": 7.5, "drain_interval": 1.0, "drain_quantity": 100, "recharge_rate": 600.0, "power_per_hp": 0.5}},
		},
	}
	CombatSystems.tick_shields(sh_ship, 0.05)
	var base_r := float(sh_ship.parts[1].shield_radius)
	sh_ship.overclock = true
	CombatSystems.tick_shields(sh_ship, 0.05)
	_check(absf(float(sh_ship.parts[1].shield_radius) - base_r * 1.5) < 0.01, "Overclock extends ArcShield radius by 1.5x (150%)")

	# 11. ResourceDistributor: capacitor shares power to orthogonally adjacent depleted weapon
	var cap_ship := {
		"ids": {CombatSystems.CAPACITOR: [30]},
		"parts": {
			30: {"id": CombatSystems.CAPACITOR, "hp": 1000.0, "energy": 4000, "capacity": 6000, "cell": Vector2i(2, 2), "size": Vector2i(2, 2), "severed": false},
			31: {"id": CombatSystems.LASER_SMALL, "hp": 1000.0, "energy": 0, "capacity": 2000, "cell": Vector2i(4, 2), "size": Vector2i(2, 1), "severed": false},
		},
		"cells": {},
	}
	for dx in 2:
		for dy in 2:
			cap_ship.cells[Vector2i(2 + dx, 2 + dy)] = 30
	cap_ship.cells[Vector2i(4, 2)] = 31
	cap_ship.cells[Vector2i(5, 2)] = 31
	var moved := CombatSystems.tick_capacitor_distribution(cap_ship, 0.5)
	_check(moved > 0 and int(cap_ship.parts[31].energy) == moved and int(cap_ship.parts[30].energy) == 4000 - moved, "ResourceDistributor transfers power from capacitor to adjacent weapon")

	# 12. Weapon.GetAIFirepowerRating: computes positive ship combat rating
	var fp_full := CombatSystems.ship_firepower_rating(battle.player)
	_check(fp_full > 100.0, "ship_firepower_rating computes positive combat firepower: %.1f" % fp_full)

	# 13. PartSubnetwork`2: connected thermal heat-pipe + radiator + pump subnetwork
	var th_ship := {
		"parts": {
			40: {"id": CombatSystems.HEAT_PIPE, "hp": 500.0, "cell": Vector2i(2, 2), "size": Vector2i(1, 1), "severed": false},
			41: {"id": CombatSystems.RADIATOR, "hp": 800.0, "cell": Vector2i(3, 2), "size": Vector2i(2, 1), "severed": false},
			42: {"id": CombatSystems.THERMAL_AMP_PUMP, "hp": 800.0, "cell": Vector2i(1, 2), "size": Vector2i(1, 1), "severed": false},
		},
		"cells": {Vector2i(2, 2): 40, Vector2i(3, 2): 41, Vector2i(4, 2): 41, Vector2i(1, 2): 42},
	}
	var tnet := CombatSystems.thermal_subnetwork_summary(th_ship)
	_check(int(tnet.subnetworks) == 1 and int(tnet.connected_pipes) == 1 and float(tnet.cooling_mult) > 1.2 and float(tnet.amp_mult) > 1.2, "thermal_subnetwork_summary groups connected pipes, radiators, and amp pumps")

	# 14. AIFleeFromEnemiesModule: disarmed ship triggers evasive flee
	var flee_ship := {"parts": {1: {"id": CombatSystems.BRIDGE_SMALL, "hp": 4000.0, "max_hp": 4000.0, "severed": false}}}
	_check(CombatSystems.should_ai_flee(flee_ship), "AIFleeFromEnemiesModule flees when disarmed")
	_check(not CombatSystems.should_ai_flee(battle.player), "armed healthy ship does not flee")

	# 15. AISelfRepairModule + SpaceCrew: airlock-equipped ship repairs damaged module
	var rep_ship := {
		"command": true,
		"ids": {CombatSystems.AIRLOCK: [50]},
		"crew": [{"alive": true}],
		"parts": {
			50: {"id": CombatSystems.AIRLOCK, "hp": 1000.0, "max_hp": 1000.0, "fire": 0.0, "severed": false},
			51: {"id": "cosmoteer.corridor", "hp": 500.0, "max_hp": 1000.0, "fire": 0.0, "severed": false},
		},
	}
	var healed := CombatSystems.tick_crew_self_repair(rep_ship, 1.0)
	_check(healed > 40.0 and float(rep_ship.parts[51].hp) > 540.0, "Airlock crew self-repair patches damaged hull module")

	# 16. KillCrewEffect: bridge crew protected vs corridor crew exposed
	_check(CombatSystems.is_crew_protected_in_part({"id": CombatSystems.BRIDGE_SMALL}), "KillCrewEffect protects bridge crew")
	_check(not CombatSystems.is_crew_protected_in_part({"id": "cosmoteer.corridor"}), "KillCrewEffect exposes corridor crew")

	# 17. StatusDiffuser & scorched crew slowdown
	var sc_room := {"id": "cosmoteer.corridor", "rotation": 0, "walk_factor": 1.0, "fire": 0.0, "scorched": 6.0}
	_check(absf(CombatSystems.crew_step_speed_factor(sc_room, Vector2i.RIGHT) - 0.5) < 0.02, "scorched status slows crew speed to 0.5x")
	var h_ship := {
		"parts": {
			60: {"id": "cosmoteer.corridor", "hp": 1000.0, "heat": 100.0, "cell": Vector2i(2, 2), "size": Vector2i(1, 1), "severed": false},
			61: {"id": "cosmoteer.corridor", "hp": 1000.0, "heat": 0.0, "cell": Vector2i(3, 2), "size": Vector2i(1, 1), "severed": false},
		},
		"cells": {Vector2i(2, 2): 60, Vector2i(3, 2): 61},
	}
	var h_moved := CombatSystems.diffuse_cell_heat(h_ship, 0.5)
	_check(h_moved > 0.0 and float(h_ship.parts[61].heat) > 0.0 and float(h_ship.parts[60].heat) < 100.0, "StatusDiffuser diffuses heat between adjacent cells")

	# 18. AttackCommand.EstimateFirepowerTowards & SetBestAttackRotation
	var gun_uid: int = int(battle.player.ids[CombatSystems.LASER_SMALL][0])
	var gun_rest: float = float(battle.player.parts[gun_uid].rest_angle)
	var fp_front := CombatSystems.estimate_firepower_towards(battle.player, gun_rest)
	var fp_back := CombatSystems.estimate_firepower_towards(battle.player, gun_rest + PI)
	_check(fp_front > fp_back and fp_back == 0.0, "AttackCommand.EstimateFirepowerTowards scores weapon arc front higher than blind rear")
	_check(absf(wrapf(CombatSystems.best_attack_rotation(battle.player) - gun_rest, -PI, PI)) < 0.05, "AttackCommand.SetBestAttackRotation aligns with primary weapon rest_angle")

	# 19. CareerSimModeManager economy tiers, fame scaling, and surrender tribute
	var rep_hostile := CombatSystems.reputation_economy_factors(-50000)
	var rep_ally := CombatSystems.reputation_economy_factors(3000)
	_check(is_equal_approx(float(rep_hostile.reward_factor), 0.6) and is_equal_approx(float(rep_hostile.buy_factor), 2.0), "Hostile reputation tier applies 60% reward / 200% buy cost")
	_check(is_equal_approx(float(rep_ally.reward_factor), 1.3) and is_equal_approx(float(rep_ally.buy_factor), 0.7), "Allied reputation tier applies 130% reward / 70% buy cost")
	_check(CombatSystems.fame_reward_multiplier(200) > CombatSystems.fame_reward_multiplier(0), "Fame level multiplier scales upward with fame")
	var bribe_weak := CombatSystems.surrender_bribe_cost(1000.0, 500.0, 20000.0)
	var bribe_strong := CombatSystems.surrender_bribe_cost(500.0, 2000.0, 80000.0)
	_check(bribe_strong > bribe_weak and bribe_weak >= 1000, "CareerSimModeManager.GetSurrenderForPrice scales with enemy firepower & ship cost")

	# 20. CommandProvider/CommandConsumer: Command Points budget & overload detection
	var cp_starter := CombatSystems.command_points_summary(design.parts)
	_check(int(cp_starter.provided) == 50 and int(cp_starter.consumed) > 0 and not bool(cp_starter.overloaded), "Starter ship has 50 Command Points and is not overloaded")
	var cp_over := CombatSystems.command_points_summary([
		{"id": CombatSystems.BRIDGE_SMALL},
		{"id": CombatSystems.CANNON_DECK}, {"id": CombatSystems.CANNON_DECK},
		{"id": CombatSystems.CANNON_DECK}, {"id": CombatSystems.CANNON_DECK},
		{"id": CombatSystems.CANNON_DECK},
	])
	_check(bool(cp_over.overloaded) and float(cp_over.efficiency) < 1.0, "Exceeding 50 Command Points flags command overload and degrades efficiency")
	var cp_cap := CombatSystems.command_points_summary([{"id": CombatSystems.BRIDGE_LARGE}])
	_check(int(cp_cap.provided) == 1000, "Large control room provides 1000 Command Points")

	# 21. BulletAcceleration: missile launch speed factor & acceleration
	_check(is_equal_approx(CombatSystems.missile_acceleration("missile"), 65.0), "HE missile acceleration == 65.0")
	_check(is_equal_approx(CombatSystems.missile_acceleration("missile_emp"), 75.0), "EMP missile acceleration == 75.0")
	_check(CombatSystems.missile_launch_speed_factor() > 0.2 and CombatSystems.missile_launch_speed_factor() < 0.8, "Missile launches below cruise speed and accelerates")

	# 22. Live AttackCommand heading_offset in Flight.ai_orders
	var Flight2 := preload("res://sim/flight_dynamics.gd")
	var ord_bow := Flight2.ai_orders(battle.player, battle.enemy, 0.0, "attack", 0.0)
	var ord_broad := Flight2.ai_orders(battle.player, battle.enemy, 0.0, "attack", PI * 0.5)
	_check(absf(ord_bow.z - ord_broad.z) > 0.1, "Flight.ai_orders steers toward AttackCommand heading_offset")

	print("DLL mechanics checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)
