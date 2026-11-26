extends SceneTree

const ShipDesign := preload("res://sim/ship_design.gd")
const ShipBattle := preload("res://sim/ship_battle.gd")
const CombatSystems := preload("res://sim/combat_systems.gd")

var checks := 0
var failed := 0


func _initialize() -> void:
	_test_extracted_rules_loaded()
	_test_deck_cannon_brawler_and_aoe_splash()
	print("Restored rules checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)


func _check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", label)


func _test_extracted_rules_loaded() -> void:
	var rules := CombatSystems.extracted_rules()
	_check(not rules.is_empty(), "data/extracted_rules.json loads in Godot runtime")
	_check(rules.get("shots", {}).size() == 20, "all 20 Cosmoteer shot definitions loaded")
	_check(rules.get("factions", []).size() == 5, "all 5 Cosmoteer factions loaded")
	_check(rules.get("backgrounds", []).size() >= 8, "all Cosmoteer space backgrounds loaded")
	_check(rules.get("part_specs", {}).size() == 96, "all 96 Terran part specs loaded")
	var imp := CombatSystems.get_faction("imperium")
	_check(str(imp.get("color", "")) == "#ff0031", "Imperium faction authentic border color restored")
	var bg := CombatSystems.get_background("bg_red_blue")
	_check(not bg.is_empty() and bg.get("palette", []).size() >= 1, "space sector background palette restored")


func _test_deck_cannon_brawler_and_aoe_splash() -> void:
	var design := ShipDesign.new()
	design.deck_cannon_brawler()
	var deck_stats: Dictionary = design.by_id[CombatSystems.CANNON_DECK].stats
	_check(float(deck_stats.firing_arc_deg) == 270.0, "cannon_deck restores authentic 270-degree firing arc from .rules")
	_check(float(deck_stats.range) == 190.0, "cannon_deck restores authentic 190m range from bullet_deck.rules")
	var issue := ShipBattle.validate_design(design)
	_check(issue.is_empty(), "deck_cannon_brawler passes launch validation: " + issue)
	var battle := ShipBattle.new()
	var started := battle.start(design, null, {
		"id": "imperium_flagship", "objective": "duel", "opponent": "imperium",
		"distance": 165, "ai": "balanced", "faction": "imperium", "background": "bg_red_blue",
	})
	_check(started and battle.result == "active", "imperium flagship battle starts cleanly")
	var saw_deck := false
	var saw_large := false
	var saw_blast := false
	for _i in 240:
		if battle.result != "active":
			break
		battle.step(0.1)
		for p in battle.projectiles:
			var k := str(p.get("kind", ""))
			if k == "cannon_deck":
				saw_deck = true
			elif k == "cannon_large":
				saw_large = true
		for ev in battle.events:
			if ev.kind == "blast":
				saw_blast = true
	_check(saw_deck, "deck cannon fires heavy cannon_deck shells")
	_check(saw_large, "large cannon fires cannon_large shells")
	_check(saw_blast, "deck cannon triggers AoE blast shockwave and splash damage")
