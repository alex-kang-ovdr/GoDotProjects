extends SceneTree

const Battle := preload("res://sim/ship_battle.gd")
const Design := preload("res://sim/ship_design.gd")
var checks := 0
var failed := 0


func _initialize() -> void:
	var design := Design.new()
	design.starter()
	var battle := Battle.new()
	_check(battle.start(design, design), "Starter launches: " + battle.launch_error)
	if battle.result != "active":
		quit(1)
		return
	var bridge: int = battle.enemy.ids[Battle.BRIDGE][0]
	var gun: int = battle.enemy.ids[Battle.GUN][0]
	var armor: int = battle.enemy.ids[Battle.ARMOR][0]
	_check(battle.select_target(bridge) and not battle.select_target(-99), "Aim switches only to live modules")
	_check(battle.enemy.parts[armor].hit_rect.size == Vector2.ONE and battle.enemy.parts[gun].hit_rect.size == Vector2(1,2), "Original armor and gun collision footprints are imported")
	_check(battle.player.crew.size() == 4 and battle.player.parts[gun].staffed == 0, "Four crew start in their berths")
	var last_positions: Array[Vector2] = []
	for crew in battle.player.crew:
		last_positions.append(crew.pos)
	var continuous := true
	var carried := false
	var underway := false
	for i in 1800:
		battle.step(Battle.DT)
		for c in battle.player.crew.size():
			var member: Dictionary = battle.player.crew[c]
			if last_positions[c].distance_to(member.pos) > battle.player.speed * Battle.DT + 1e-5:
				continuous = false
			if not last_positions[c].is_equal_approx(member.pos):
				underway = true
			last_positions[c] = member.pos
			carried = carried or member.cargo > 0
		if battle.result != "active":
			break
	_check(continuous and underway and carried, "Crew walk from berths with continuous cell-scale motion")
	_check(battle.player.deliveries > 0 and battle.enemy.deliveries > 0, "Both independent crews carry power")
	_check(battle.player.hits > 0 and battle.enemy.hits > 0, "AI and player deal damage")
	battle.step(120)
	_check(battle.result == "win" and battle.enemy.parts[bridge].hp == 0, "Bridge focus wins starter duel")
	_check(battle.enemy.parts[armor].hp == 0, "Forward plate destroyed before bridge")
	print("Starter duel: %s %.3fs, hits %d:%d, deliveries %d:%d" % [battle.result, battle.elapsed, battle.player.hits, battle.enemy.hits, battle.player.deliveries, battle.enemy.deliveries])
	_test_loss(design)
	_test_weapon_kill(design)
	_test_routing(design)
	_test_more_modules()
	_test_replay(design)
	_test_catalog(design)
	_test_draws(design)
	print("Ship battle checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed > 0 else 0)


func _check(ok: bool, description: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", description)


func _test_loss(design: Design) -> void:
	var battle := Battle.new()
	battle.start(design, design)
	# The older hull cannot turn its blind side toward the opponent.
	battle.player.heading = -PI / 2.0
	battle.step(100)
	_check(battle.result == "loss" and battle.player.shots == 0, "Blind-side deployment loses the stationary broadside duel")

func _test_weapon_kill(design: Design) -> void:
	var battle := Battle.new()
	battle.start(design, design)
	var uid: int = battle.enemy.ids[Battle.GUN][0]
	battle.select_target(uid)
	for i in 3000:
		battle.step(Battle.DT)
		if battle.enemy.parts[uid].hp <= 0:
			break
	var fired: int = battle.enemy.shots
	battle.step(5.0)
	_check(fired > 0 and battle.enemy.shots == fired, "Destroyed staffed gun stops returning fire")
	_check(not battle.select_target(uid), "Destroyed gun cannot be reacquired")
	_check(design.parts.size() == 16 and design.part_at(Vector2i(11, 2)).uid == uid, "Damage leaves player's editable design intact")


func _test_routing(design: Design) -> void:
	var broken := Design.new()
	broken.starter()
	broken.remove_at(Vector2i(10, 5))
	var battle := Battle.new()
	_check(not battle.start(broken) and not battle.launch_error.is_empty(), "Disconnected guns prevent launch")
	broken.place(Battle.BUNK, Vector2i(10, 5))
	_check(not battle.start(broken), "A bunk between corridors cannot be used as a through passage")
	battle.start(design, design)
	var cut: int = battle.enemy.cells[Vector2i(10, 5)]
	var gun: int = battle.enemy.ids[Battle.GUN][0]
	battle.select_target(cut)
	for i in 3000:
		battle.step(Battle.DT)
		if battle.enemy.parts[cut].hp <= 0:
			break
	_check(battle.enemy.parts[cut].hp == 0, "Targeted corridor can be breached")
	_check(Battle._path(battle.enemy, Vector2i(4, 5), gun).is_empty(), "Destroyed corridor invalidates supply path")
	var reserve: int = battle.enemy.parts[gun].energy
	var shots: int = battle.enemy.shots
	battle.step(60)
	_check(battle.enemy.shots - shots <= ceili(reserve / 200.0) + 5, "Cut gun drains finite stored power and stranded cargo")


func _test_more_modules() -> void:
	var design := Design.new()
	design.starter()
	design.place(Battle.BUNK, Vector2i(9, 6))
	design.place(Battle.GUN, Vector2i(3, 6))
	design.place(Battle.REACTOR, Vector2i(5, 6))
	var battle := Battle.new()
	_check(battle.start(design, design), "Additional rooms linked to same corridor network")
	if battle.result != "active":
		return
	battle.select_target(battle.enemy.ids[Battle.GUN][0])
	battle.step(18)
	var both := true
	for uid in battle.player.ids[Battle.GUN]:
		both = both and battle.player.parts[uid].shots > 0
	_check(both and battle.player.ids[Battle.REACTOR].size() == 2, "Both guns are independently supplied and staffed")
	var extra_reactor: int = design.part_at(Vector2i(5, 6)).uid
	_check(battle.player.parts[extra_reactor].pickups > 0, "Carriers can choose the newly placed closer reactor")


func _test_replay(design: Design) -> void:
	var batch := Battle.new()
	var framed := Battle.new()
	batch.start(design, design)
	framed.start(design, design)
	batch.step(15)
	for i in 1800:
		framed.step(1.0 / 120.0)
	_check(batch.events == framed.events and batch.player.crew == framed.player.crew and batch.projectiles == framed.projectiles, "State and trace match at different frame sizes")
	_check(batch.start(design, design) and batch.elapsed == 0 and batch.events.is_empty() and batch.projectiles.is_empty(), "Restart clears both ship states")


func _test_catalog(template: Design) -> void:
	var fitted := Design.new()
	fitted.starter()
	var floating := Vector2i(15, 4)
	fitted.place(Battle.ARMOR, floating)
	_check("떨어진 부품" in Battle.validate_design(fitted), "Unattached forward armor prevents battle")
	fitted.remove_at(floating)
	var diagonal := Vector2i(13, 6)
	fitted.place(Battle.ARMOR, diagonal)
	_check("떨어진 부품" in Battle.validate_design(fitted), "Corner contact cannot attach a plate")
	fitted.remove_at(diagonal)
	# Lift the hull by two rows to leave a six-cell-deep bay for large mounts.
	fitted = Design.new()
	for part in template.parts:
		fitted.place(part.id, part.cell + Vector2i.UP * 2, part.rotation)
	var total := 0
	for id in template.by_id:
		var placed := false
		for y in Design.GRID_SIZE.y:
			for x in Design.GRID_SIZE.x:
				var tile := Vector2i(x, y)
				if not fitted.place(id, tile):
					continue
				var issue := Battle.validate_design(fitted)
				fitted.remove_at(tile)
				if issue.is_empty():
					total += 1
					placed = true
					break
			if placed:
				break
		_check(placed, "Launch validation accepts edge-mounted " + id)
	_check(total == template.by_id.size(), "Every catalog module was placed and validated")


func _test_draws(design: Design) -> void:
	var battle := Battle.new()
	battle.start(design, design)
	for ship in [battle.player, battle.enemy]:
		ship.parts[ship.ids[Battle.GUN][0]].hp = 0
	battle.step(1)
	_check(battle.result == "draw" and battle.elapsed <= Battle.DT, "No surviving weapons produces immediate draw")
	battle.start(design, design)
	for ship in [battle.player, battle.enemy]:
		for crew in ship.crew:
			crew.alive = false
	battle.step(130)
	_check(battle.result == "draw" and is_equal_approx(battle.elapsed, 120.0), "Stranded guns end in bounded draw")
