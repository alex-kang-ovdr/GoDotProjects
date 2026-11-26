extends SceneTree

const ShipDesign := preload("res://sim/ship_design.gd")
const ShipBattle := preload("res://sim/ship_battle.gd")
const CombatSystems := preload("res://sim/combat_systems.gd")
const Operations := preload("res://sim/operations.gd")

var checks := 0
var failed := 0


func _initialize() -> void:
	_test_extracted_v4_rules()
	_test_statuses_foam_scorch_and_disruptor()
	_test_autopilot_commands_and_salvage()
	_test_career_economy_and_paint_persistence()
	_test_ui_command_button_and_paint_picker.call_deferred()


func _check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", label)


func _test_extracted_v4_rules() -> void:
	var rules := CombatSystems.extracted_rules()
	_check(rules.get("statuses", []).size() >= 6, "v4 extracted_rules contains >=6 statuses")
	_check(rules.get("commands", []).size() >= 6, "v4 extracted_rules contains >=6 commands")
	_check(rules.get("formations", []).size() >= 3, "v4 extracted_rules contains >=3 formations")
	_check(rules.get("mission_categories", []).size() >= 6, "v4 extracted_rules contains >=6 mission categories")


func _test_statuses_foam_scorch_and_disruptor() -> void:
	var design := ShipDesign.new()
	design.dreadnought_battleship()
	var battle := ShipBattle.new()
	battle.start(design, null, {"id": "skirmish", "objective": "duel", "opponent": "flight", "distance": 120, "ai": "balanced"})
	var target_uid: int = battle.player.ids[CombatSystems.REACTOR_LARGE][0]
	var part: Dictionary = battle.player.parts[target_uid]
	# Ignite -> scorched + fire
	_check(CombatSystems.ignite_part(part, 0.25), "ignite_part ignites unprotected module")
	_check(float(part.get("scorched", 0.0)) > 0.0 and CombatSystems.damage_multiplier(part) > 1.1, "burning/thermal hit applies scorched (+15% dmg multiplier)")
	# Extinguisher suppresses fire and applies fire_foam immunity
	for _i in 25:
		CombatSystems.tick_fires(battle.player, 0.1)
	_check(float(part.get("fire", 0.0)) <= 0.0 and float(part.get("fire_foam", 0.0)) > 0.0, "fire_extinguisher extinguishes fire and coats module with fire_foam")
	_check(not CombatSystems.ignite_part(part, 0.8), "fire_foam protects module from re-ignition")
	# Disruptor drain leaks energy during tick_statuses
	part.energy = 2000
	CombatSystems.apply_status_hit(part, "disruptor")
	_check(float(part.get("disruptor_drain", 0.0)) > 0.0, "disruptor hit applies disruptor_drain status")
	CombatSystems.tick_statuses(battle.player, 1.0)
	_check(int(part.energy) < 2000, "disruptor_drain continuously drains module energy")


func _test_autopilot_commands_and_salvage() -> void:
	var design := ShipDesign.new()
	design.flight_starter()
	var battle := ShipBattle.new()
	battle.start(design, null, {"id": "skirmish", "objective": "duel", "opponent": "flight", "distance": 140, "ai": "balanced"})
	var start_pos := Vector2(battle.player.position)
	_check(battle.set_player_command("orbit") and battle.player_command == "orbit", "battle accepts orbit tactical command")
	for _i in 60:
		battle.step(0.1)
	_check(Vector2(battle.player.position).distance_to(start_pos) > 3.0, "orbit autopilot autonomously maneuvers player ship without WASD input")
	# Destroy an enemy part and confirm salvage_credits awarded
	var e_uid: int = int(battle.enemy.parts.keys()[0])
	battle.enemy.parts[e_uid].hp = 0.0
	battle._on_part_destroyed(battle.enemy, e_uid, "player", e_uid, ShipBattle.part_world(battle.enemy, e_uid))
	_check(battle.salvage_credits > 0, "destroying enemy module awards salvage_credits")


func _test_career_economy_and_paint_persistence() -> void:
	var design := ShipDesign.new()
	design.flight_starter()
	design.paint = "imperium"
	var snap := design.serialize()
	var copy := ShipDesign.new()
	_check(copy.restore(snap) and copy.paint == "imperium", "ship paint livery round-trips through serialize/restore")

	var path := "user://test_career_%d.json" % OS.get_process_id()
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	var ops := Operations.new(path)
	_check(ops.record_win("skirmish", 42.0, 12, 9), "skirmish win records cleanly")
	var rw := ops.record_career_reward("skirmish", 350, 200)
	_check(int(rw.get("total", 0)) >= 2050 and int(ops.career.get("credits", 0)) >= 2050 and int(ops.career.get("fame", 0)) >= 10, "career reward adds bounty + salvage + mined credits and fame")
	var reloaded := Operations.new(path)
	_check(int(reloaded.career.get("credits", 0)) == int(ops.career.get("credits", 0)) and int(reloaded.career.get("faction_rep", {}).get("fringe", 0)) == 15, "career credits and faction reputation persist across reload")
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))


func _test_ui_command_button_and_paint_picker() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var lab = scene.get_node("UI/Laboratory")
	await process_frame
	var yard = lab.shipyard
	_check(yard.paint_picker.item_count == 6, "shipyard paint picker exposes all 6 liveries")
	yard.paint_picker.select(5)
	yard.paint_picker.item_selected.emit(5)
	_check(yard.design.paint == "imperium", "selecting imperium livery updates active ship design paint")
	yard.depart_button.pressed.emit()
	await process_frame
	var duel = yard.duel
	_check(duel.command_button.text == "명령: 수동", "default tactical command button is manual")
	duel.command_button.pressed.emit()
	_check(duel.battle.player_command == "attack" and duel.command_button.text == "명령: 공격", "command button cycles to attack")
	duel.command_button.pressed.emit()
	_check(duel.battle.player_command == "standoff", "command button cycles to standoff")
	duel.command_button.pressed.emit()
	_check(duel.battle.player_command == "orbit", "command button cycles to orbit")
	duel.command_button.pressed.emit()
	_check(duel.battle.player_command == "salvage", "command button cycles to salvage")
	duel.command_button.pressed.emit()
	_check(duel.battle.player_command == "manual", "command button wraps back to manual")
	print("Statuses, commands & career checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)
