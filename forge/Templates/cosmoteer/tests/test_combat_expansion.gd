extends SceneTree

const ShipDesign := preload("res://sim/ship_design.gd")
const ShipBattle := preload("res://sim/ship_battle.gd")
const CombatSystems := preload("res://sim/combat_systems.gd")

var checks := 0
var failed := 0


func _initialize() -> void:
	_test_cruiser_preset_and_shield_missile_battle()
	_test_shield_intercept_collapse_and_reboot()
	_test_point_defense_intercepts_homing_missile()
	_test_heavy_laser_and_cannon_firing()
	print("Combat expansion checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)


func _check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", label)


func _test_cruiser_preset_and_shield_missile_battle() -> void:
	var design := ShipDesign.new()
	_check(design.load_error.is_empty(), "catalog loads with combat expansion")
	design.shield_missile_cruiser()
	var issue := ShipBattle.validate_design(design)
	_check(issue.is_empty(), "shield_missile_cruiser passes launch validation: " + issue)
	var battle := ShipBattle.new()
	var started := battle.start(design, null, {"id": "vanguard", "objective": "duel", "opponent": "vanguard", "distance": 150, "ai": "balanced"})
	_check(started and battle.result == "active", "cruiser vs vanguard battle launches")
	var p_def := ShipBattle.defense_state(battle.player)
	var e_def := ShipBattle.defense_state(battle.enemy)
	_check(p_def.shield_count == 1 and p_def.shield_active == 1 and p_def.shield_hp > 0.0, "player shield deploys active")
	_check(e_def.shield_count == 1 and e_def.shield_active == 1 and e_def.shield_hp > 0.0, "enemy vanguard shield deploys active")
	_check(p_def.pd_count == 1 and e_def.pd_count == 1, "both cruisers have point defense")

	var saw_missile := false
	var saw_cannon := false
	var saw_shield_hit := false
	var saw_intercept := false
	for _step in 240:
		if battle.result != "active":
			break
		battle.step(0.1)
		for p in battle.projectiles:
			if p.get("kind") == "missile":
				saw_missile = true
			elif p.get("kind") == "cannon":
				saw_cannon = true
		for ev in battle.events:
			if ev.kind == "shield_hit":
				saw_shield_hit = true
			elif ev.kind == "intercept":
				saw_intercept = true
	_check(saw_missile, "missile launcher fires homing missiles in battle")
	_check(saw_cannon, "medium cannon fires kinetic shells in battle")
	_check(saw_shield_hit, "directional shield intercepts incoming fire")
	_check(saw_intercept or ShipBattle.defense_state(battle.player).pd_intercepts + ShipBattle.defense_state(battle.enemy).pd_intercepts > 0, "point defense engages enemy missiles")


func _test_shield_intercept_collapse_and_reboot() -> void:
	var design := ShipDesign.new()
	design.shield_missile_cruiser()
	var battle := ShipBattle.new()
	battle.start(design, design)
	var shield_uid: int = battle.enemy.ids[CombatSystems.SHIELD_SMALL][0]
	var shield: Dictionary = battle.enemy.parts[shield_uid]
	var center := CombatSystems.shield_world_center(battle.enemy, shield)
	var facing := CombatSystems.shield_world_facing(battle.enemy, shield)
	var r: float = float(shield.shield_radius)
	var front: Vector2 = center + Vector2.from_angle(facing) * (r + 3.0)
	var inside: Vector2 = center + Vector2.from_angle(facing) * (r - 3.0)
	var hit := CombatSystems.intercept_shield(battle.enemy, front, inside)
	_check(not hit.is_empty() and hit.uid == shield_uid, "front projectile intersects active shield arc")
	var rear: Vector2 = center - Vector2.from_angle(facing) * (r + 3.0)
	var rear_inside: Vector2 = center - Vector2.from_angle(facing) * (r - 3.0)
	var rear_hit := CombatSystems.intercept_shield(battle.enemy, rear, rear_inside)
	_check(rear_hit.is_empty(), "rear projectile bypasses directional shield arc")
	var collapsed := CombatSystems.apply_shield_damage(shield, shield.shield_hp + 500.0)
	_check(collapsed and not shield.shield_active and shield.shield_reboot > 0.0, "overwhelming damage collapses shield into reboot")
	var after_collapse := CombatSystems.intercept_shield(battle.enemy, front, inside)
	_check(after_collapse.is_empty(), "collapsed shield does not intercept projectiles")


func _test_point_defense_intercepts_homing_missile() -> void:
	var design := ShipDesign.new()
	design.shield_missile_cruiser()
	var battle := ShipBattle.new()
	battle.start(design)
	var pd_uid: int = battle.player.ids[CombatSystems.POINT_DEFENSE][0]
	var pd: Dictionary = battle.player.parts[pd_uid]
	pd.energy = 2000
	var pd_origin := CombatSystems.shield_world_center(battle.player, pd)
	var facing := CombatSystems.shield_world_facing(battle.player, pd)
	var missile_pos := pd_origin + Vector2.from_angle(facing) * 25.0
	battle.projectiles.append({
		"side": "enemy", "source_uid": 1, "target_uid": battle.player.ids[ShipBattle.BRIDGE][0],
		"aim_uid": battle.player.ids[ShipBattle.BRIDGE][0], "progress": 0.1,
		"kind": "missile", "homing": true, "turn_rate": 2.0, "hp": 120.0,
		"pos": missile_pos, "previous_pos": missile_pos,
		"velocity": -Vector2.from_angle(facing) * 185.0,
		"travelled": 10.0, "range": 380.0, "speed": 185.0,
		"power": 1.0, "damage": 1800.0, "structural_damage": 1400.0,
	})
	var shots := CombatSystems.tick_point_defense(battle.player, "player", battle.projectiles, 1.0 / 60.0)
	_check(shots.size() == 1 and shots[0].killed, "point defense intercepts and destroys incoming missile")
	_check(pd.pd_intercepts == 1, "point defense records intercept count")


func _test_heavy_laser_and_cannon_firing() -> void:
	var design := ShipDesign.new()
	design.flight_starter()
	design.remove_at(Vector2i(11, 4))
	design.remove_at(Vector2i(11, 5))
	design.remove_at(Vector2i(12, 5))
	design.remove_at(Vector2i(13, 5))
	var placed := design.place(CombatSystems.LASER_LARGE, Vector2i(11, 4), 1)
	_check(placed, "heavy laser places on shipyard grid")
	var battle := ShipBattle.new()
	var ok := battle.start(design)
	_check(ok, "ship with heavy laser launches: " + battle.launch_error)
	var saw_heavy := false
	for _i in 120:
		if battle.result != "active":
			break
		battle.step(0.1)
		for p in battle.projectiles:
			if p.get("kind") == "heavy_laser":
				saw_heavy = true
				break
		if saw_heavy:
			break
	_check(saw_heavy, "heavy laser fires heavy_laser projectile")
