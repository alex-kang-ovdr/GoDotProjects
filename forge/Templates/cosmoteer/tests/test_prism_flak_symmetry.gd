extends SceneTree

const ShipDesign := preload("res://sim/ship_design.gd")
const ShipBattle := preload("res://sim/ship_battle.gd")
const CombatSystems := preload("res://sim/combat_systems.gd")

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
	_test_prism_flak_destroyer_and_live_combat()
	_test_flak_intercepts_missile_and_cannon()
	await _test_shipyard_mirror_symmetry_ui()
	print("Prism/Flak/Symmetry checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)


func _test_prism_flak_destroyer_and_live_combat() -> void:
	var design := ShipDesign.new()
	design.prism_flak_destroyer()
	var issue := ShipBattle.validate_design(design)
	_check(issue.is_empty(), "prism_flak_destroyer passes launch validation: " + issue)
	var battle := ShipBattle.new()
	var started := battle.start(design, null, {"id": "prism_fortress", "objective": "duel", "opponent": "prism", "distance": 170, "ai": "balanced"})
	_check(started and battle.result == "active", "prism vs prism battle starts cleanly")
	var cg_uid: int = battle.player.ids[CombatSystems.CHAINGUN][0]
	var cg: Dictionary = battle.player.parts[cg_uid]
	_check(int(cg.chaingun_mag_count) == 1 and int(cg.capacity) == 10000, "adjacent chaingun_magazine expands chaingun capacity")

	var saw_prism_feed := false
	var saw_prism_output := false
	var saw_flak := false
	var saw_chaingun := false
	var max_spin := 0.0
	for _i in 260:
		if battle.result != "active":
			break
		battle.step(0.1)
		max_spin = maxf(max_spin, float(cg.get("chaingun_spin", 0.0)))
		for b in battle.ion_beams:
			if b.hit_kind == "prism":
				saw_prism_feed = true
			elif b.source_uid in battle.player.ids.get(CombatSystems.ION_PRISM, []) or b.source_uid in battle.enemy.ids.get(CombatSystems.ION_PRISM, []):
				saw_prism_output = true
		for p in battle.projectiles:
			var k := str(p.get("kind", ""))
			if k == "flak":
				saw_flak = true
			elif k == "chaingun":
				saw_chaingun = true
	_check(saw_prism_feed and saw_prism_output, "ion emitter feeds ion prism which redirects beam at target")
	_check(saw_flak, "large flak cannon fires flak bursts in battle")
	_check(saw_chaingun and max_spin > 0.3, "chaingun spins up and fires rapid tracer rounds")


func _test_flak_intercepts_missile_and_cannon() -> void:
	var design := ShipDesign.new()
	design.prism_flak_destroyer()
	var battle := ShipBattle.new()
	battle.start(design, design)
	var flak_uid: int = battle.player.ids[CombatSystems.FLAK_CANNON][0]
	var flak: Dictionary = battle.player.parts[flak_uid]
	flak.staffed = 2
	flak.energy = 2000
	var origin := CombatSystems.shield_world_center(battle.player, flak)
	var facing := CombatSystems.shield_world_facing(battle.player, flak)
	var shell_pos := origin + Vector2.from_angle(facing) * 40.0
	battle.projectiles.append({
		"side": "enemy", "source_uid": 1, "target_uid": battle.player.ids[ShipBattle.BRIDGE][0],
		"aim_uid": battle.player.ids[ShipBattle.BRIDGE][0], "progress": 0.2,
		"kind": "cannon", "homing": false, "turn_rate": 0.0, "hp": 0.0,
		"pos": shell_pos, "previous_pos": shell_pos,
		"velocity": -Vector2.from_angle(facing) * 290.0,
		"travelled": 20.0, "range": 230.0, "speed": 290.0,
		"power": 1.0, "damage": 1100.0, "structural_damage": 900.0,
	})
	var shots := CombatSystems.tick_flak_defense(battle.player, "player", battle.projectiles, 1.0 / 60.0)
	_check(shots.size() == 1 and shots[0].killed and int(flak.flak_intercepts) == 1, "flak cannon defensively intercepts incoming enemy cannon shell")


func _test_shipyard_mirror_symmetry_ui() -> void:
	var scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(scene)
	var lab = scene.get_node("UI/Laboratory")
	await process_frame
	var yard = lab.shipyard
	yard._clear()
	yard._toggle_mirror()
	_check(yard.mirror_mode and yard.grid.mirror_mode, "mirror mode toggle activates on shipyard & grid")
	yard.selected_id = "cosmoteer.thruster_small"
	yard.turn = 0
	yard._edit_cell(Vector2i(5, 1), false)
	var top_part: Dictionary = yard.design.part_at(Vector2i(5, 1))
	var bot_part: Dictionary = yard.design.part_at(Vector2i(5, 8))
	_check(not top_part.is_empty() and not bot_part.is_empty(), "mirror mode places symmetric pair across horizontal centerline")
	_check(int(top_part.rotation) == 0 and int(bot_part.rotation) == 2, "vertical mirror flips thruster rotation 0 <-> 2")
	yard._edit_cell(Vector2i(5, 1), true)
	_check(yard.design.parts.is_empty(), "mirror mode erase removes both symmetric parts together")
	yard._undo()
	_check(yard.design.parts.size() == 2, "single undo restores both symmetric parts")
	yard._prism_preset()
	await process_frame
	_check(not yard.depart_button.disabled and yard.editor.get_global_rect().end.y <= root.get_visible_rect().end.y + 1, "prism preset is launch-ready and fits viewport")
