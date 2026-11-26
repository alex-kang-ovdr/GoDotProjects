extends SceneTree

const ShipDesign := preload("res://sim/ship_design.gd")
const ShipBattle := preload("res://sim/ship_battle.gd")
const CombatSystems := preload("res://sim/combat_systems.gd")

var checks := 0
var failed := 0


func _initialize() -> void:
	_test_dreadnought_preset_and_railgun_chain()
	_test_disruptor_bonus_and_large_shield()
	_test_fire_ignition_and_extinguisher()
	_test_live_dreadnought_ion_and_railgun_battle()
	print("Dreadnought systems checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)


func _check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", label)


func _test_dreadnought_preset_and_railgun_chain() -> void:
	var design := ShipDesign.new()
	design.dreadnought_battleship()
	var issue := ShipBattle.validate_design(design)
	_check(issue.is_empty(), "dreadnought_battleship passes launch validation: " + issue)
	var battle := ShipBattle.new()
	var started := battle.start(design, null, {"id": "dreadnought", "objective": "duel", "opponent": "dreadnought", "distance": 180, "ai": "balanced"})
	_check(started and battle.result == "active", "dreadnought vs dreadnought battle starts")
	var launcher_uid: int = battle.player.ids[CombatSystems.RAILGUN_LAUNCHER][0]
	var launcher: Dictionary = battle.player.parts[launcher_uid]
	_check(launcher.rail_accel_count == 1, "aligned railgun_accelerator links to railgun_launcher")
	_check(absf(float(launcher.rail_damage_mult) - 1.25) < 0.001, "1 accelerator grants +25% railgun damage")
	_check(absf(float(launcher.rail_range_mult) - 1.20) < 0.001, "1 accelerator grants +20% railgun range")
	var def := ShipBattle.defense_state(battle.player)
	_check(def.shield_count == 1 and def.shield_max_hp == 18000.0 and def.shield_hp > 0.0, "large shield generator deploys with 18,000 max HP")


func _test_disruptor_bonus_and_large_shield() -> void:
	var design := ShipDesign.new()
	design.dreadnought_battleship()
	var battle := ShipBattle.new()
	battle.start(design, design)
	var suid: int = battle.enemy.ids[CombatSystems.SHIELD_LARGE][0]
	var shield: Dictionary = battle.enemy.parts[suid]
	var before_hp: float = float(shield.shield_hp)
	var before_energy: int = int(shield.energy)
	var center := CombatSystems.shield_world_center(battle.enemy, shield)
	var facing := CombatSystems.shield_world_facing(battle.enemy, shield)
	var r: float = float(shield.shield_radius)
	var start_pos: Vector2 = center + Vector2.from_angle(facing) * (r + 4.0)
	battle.projectiles.append({
		"side": "player", "source_uid": 1, "target_uid": suid, "aim_uid": suid, "progress": 0.0,
		"kind": "disruptor", "homing": false, "turn_rate": 0.0, "hp": 0.0,
		"shield_damage_mult": 3.0, "shield_energy_drain": 450, "pierce": 0, "hit_uids": {}, "ignite": 0.0,
		"pos": start_pos, "previous_pos": start_pos,
		"velocity": -Vector2.from_angle(facing) * 360.0,
		"travelled": 0.0, "range": 270.0, "speed": 360.0, "power": 1.0,
		"damage": 450.0, "structural_damage": 200.0,
	})
	battle.step(0.05)
	_check(float(shield.shield_hp) <= before_hp - 1200.0, "disruptor deals 3x anti-shield damage (1350 minus brief recharge)")
	_check(int(shield.energy) < before_energy, "disruptor drains shield energy reserve on hit")


func _test_fire_ignition_and_extinguisher() -> void:
	var design := ShipDesign.new()
	design.dreadnought_battleship()
	var battle := ShipBattle.new()
	battle.start(design, design)
	var bridge_uid: int = battle.player.ids[ShipBattle.BRIDGE][0]
	var bridge: Dictionary = battle.player.parts[bridge_uid]
	var ignited := CombatSystems.ignite_part(bridge, 0.8)
	_check(ignited and float(bridge.fire) >= 0.79, "operational part ignites cleanly")
	_check(ShipBattle.defense_state(battle.player).active_fires == 1, "defense_state counts active fires")
	var hp_before: float = float(bridge.hp)
	for _i in 180:
		CombatSystems.tick_fires(battle.player, 1.0 / 60.0)
	_check(float(bridge.hp) < hp_before, "active fire deals burn damage before suppression")
	_check(float(bridge.fire) == 0.0, "fire_extinguisher quenches active fire")


func _test_live_dreadnought_ion_and_railgun_battle() -> void:
	var design := ShipDesign.new()
	design.dreadnought_battleship()
	var battle := ShipBattle.new()
	battle.start(design, null, {"id": "dreadnought", "objective": "duel", "opponent": "dreadnought", "distance": 180, "ai": "balanced"})
	var saw_ion := false
	var saw_railgun := false
	var saw_disruptor := false
	for _i in 260:
		if battle.result != "active":
			break
		battle.step(0.1)
		if not battle.ion_beams.is_empty():
			saw_ion = true
		for p in battle.projectiles:
			var k := str(p.get("kind", ""))
			if k == "railgun":
				saw_railgun = true
			elif k == "disruptor":
				saw_disruptor = true
	_check(saw_ion, "ion beam emitter projects live continuous beam in battle")
	_check(saw_railgun, "modular railgun fires hypersonic rail slug in battle")
	_check(saw_disruptor, "disruptor fires EMP bolts in battle")
