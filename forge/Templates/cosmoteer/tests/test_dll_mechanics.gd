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
	_check(trace is Dictionary and trace.get("methods", []).size() >= 24, "expanded logic_trace.json traces >= 24 Cosmoteer.dll methods")
	var mech := CombatSystems.get_dll_mechanics()
	_check(not mech.is_empty() and int(mech.get("traced_methods", 0)) >= 24, "dll_mechanics.json loads reverse-engineered constants")

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

	print("DLL mechanics checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)
