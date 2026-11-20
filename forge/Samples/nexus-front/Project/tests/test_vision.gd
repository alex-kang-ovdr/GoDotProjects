extends RefCounted

const Vision = preload("res://scripts/vision_system.gd")

class FakeAbilities:
	extends RefCounted
	var effects: Array = []

class FakeWorld:
	extends RefCounted
	var size: float = 1600.0
	var time: float = 0.0
	var tick: int = 0
	var map: Dictionary = {}
	var bases: Array = [Vector2(50, 1550), Vector2(1550, 50)]
	var entities: Array = []
	var abilities = FakeAbilities.new()
	func _init(scale: float = 1.0):
		size *= scale
		bases = [Vector2(50,1550) * scale, Vector2(1550,50) * scale]
		map = {"width":size,"height":size,"obstacles":[{"x":800*scale,"y":800*scale,"r":60*scale}],"highGrounds":[{"x":1000*scale,"y":500*scale,"r":100*scale,"tier":1}],"brushes":[{"x":1100*scale,"y":1100*scale,"r":90*scale}]}

var _passed: int = 0
var _failures: Array[String] = []

func _check(condition: bool, message: String) -> void:
	if condition:
		_passed += 1
	else:
		_failures.append(message)

func _unit(id: int, team: int, pos: Vector2, kind: String = "hero") -> Dictionary:
	return {"id":id,"team":team,"pos":pos,"kind":kind,"alive":true,"hp":1000.0,"max_hp":1000.0,"r":18.0,"name":"unit","protected":false}

func _snapshot(vision, id: int) -> Dictionary:
	for item in vision.structure_observations(0):
		if item.id == id:
			return item
	return {}

func run() -> Dictionary:
	_passed = 0
	_failures.clear()
	_test_geometry()
	_test_brush_and_scout()
	_test_building_memory()
	_test_attack_clues()
	_test_objectives()
	_test_state_and_cadence()
	_test_mask_parity()
	return {"passed":_passed,"failed":_failures.size(),"failures":_failures.duplicate()}

func _test_geometry() -> void:
	var w = FakeWorld.new()
	var v = Vision.new(w)
	_check(v.cols == 40 and v.rows == 40, "1x map uses 40x40 visibility cells")
	_check(not v.has_line_of_sight(Vector2(700,800),Vector2(900,800)), "wall blocks LOS")
	_check(v.has_line_of_sight(Vector2(700,860),Vector2(900,860)), "exact wall tangent does not block LOS")
	_check(v.ground_height(Vector2(1000,500)) == 1, "plateau height sampled")
	_check(not v.has_line_of_sight(Vector2(850,500),Vector2(1000,500)), "uphill sight blocked")
	_check(v.has_line_of_sight(Vector2(1000,500),Vector2(850,500)), "downhill sight allowed")
	_check(not v.has_line_of_sight(Vector2(850,500),Vector2(1150,500)), "low ground cannot see through plateau")
	_check(not v.has_line_of_sight(Vector2.INF,Vector2.ZERO), "invalid LOS rejected")
	var stopped: Vector2 = v.safe_move(Vector2(700,800),Vector2(900,800),12)
	_check(stopped.x < 729 and v.is_walkable(stopped,12), "swept movement cannot tunnel through wall")
	var slide: Vector2 = v.safe_move(Vector2(700,750),Vector2(900,850),12)
	_check(v.is_walkable(slide,12), "sliding stays outside wall")
	var clamped: Vector2 = v.safe_move(Vector2(100,100),Vector2(-100,1700),12)
	_check(clamped.x >= 12 and clamped.y <= 1588, "movement remains in map")
	var waypoint: Vector2 = v.navigation_target(Vector2(700,800),Vector2(900,800),12)
	_check(waypoint.distance_to(Vector2(700,800)) > 1 and v.is_walkable(waypoint,12), "obstacle detour yields safe waypoint")
	var double_world = FakeWorld.new(2.0)
	var double_vision = Vision.new(double_world)
	_check(double_vision.cols == 80 and double_vision.rows == 80, "2x map uses 80x80 cells")
	_check(not double_vision.has_line_of_sight(Vector2(1400,1600),Vector2(1800,1600)), "scaled walls preserve sight blocking")
	_check(double_vision.ground_height(Vector2(2000,1000)) == 1, "scaled plateau preserves tier")

func _test_brush_and_scout() -> void:
	var w = FakeWorld.new()
	var ally = _unit(1,0,Vector2(800,1100))
	var enemy = _unit(2,1,Vector2(1100,1100))
	w.entities = [ally,enemy]
	var v = Vision.new(w)
	v.force_refresh()
	_check(v.is_point_visible(enemy.pos,0) and not v.is_entity_visible(enemy,0), "visible ground does not expose enemy in brush")
	ally.pos = Vector2(1100,1150)
	_check(v.is_entity_visible(enemy,0), "same brush observer sees enemy")
	ally.pos = Vector2(800,1100)
	w.map.obstacles.append({"x":1100,"y":1060,"r":12})
	var blocked_ally = _unit(3,0,Vector2(1100,1020))
	w.entities.append(blocked_ally)
	v = Vision.new(w)
	v.force_refresh()
	_check(not v.is_entity_visible(enemy,0), "blocked brush observer cannot lend detection to another emitter")
	enemy.revealed_until = 5.0
	_check(v.is_entity_visible(enemy,0), "explicit reveal bypasses brush but keeps normal LOS")
	enemy.erase("revealed_until")
	w.abilities.effects.append({"kind":"scout","pos":Vector2(1000,1100),"radius":220.0,"team":0,"until":2.0})
	v.force_refresh()
	_check(v.is_entity_visible(enemy,0), "flying scout reveals brush")
	w.abilities.effects[0].pos = Vector2(900,500)
	_check(v.is_point_visible(Vector2(1000,500),0), "flying scout sees high ground")
	w.time = 2.1
	v.step(2.1)
	_check(not v.is_entity_visible(enemy,0), "expired scout no longer reveals brush")

func _test_building_memory() -> void:
	var w = FakeWorld.new()
	var ally = _unit(1,0,Vector2(900,700))
	var tower = _unit(2,1,Vector2(1100,700),"tower")
	var unseen = _unit(3,1,Vector2(1500,1000),"tower")
	w.entities = [ally,tower,unseen]
	var v = Vision.new(w)
	v.force_refresh()
	_check(_snapshot(v,2).hp == 1000 and _snapshot(v,2).visible, "first observation records building")
	_check(_snapshot(v,3).is_empty(), "never observed building has no remembered silhouette")
	ally.pos = Vector2(200,1200)
	w.time = 1.0
	tower.hp = 0.0
	tower.alive = false
	v.force_refresh()
	var remembered: Dictionary = _snapshot(v,2)
	_check(remembered.hp == 1000 and remembered.alive and remembered.remembered, "hidden destruction does not update observed state")
	remembered.hp = 7
	_check(_snapshot(v,2).hp == 1000, "observation getter returns detached snapshot")
	w.entities.erase(tower)
	w.time = 2.0
	v.force_refresh()
	_check(_snapshot(v,2).alive, "hidden actor removal does not erase building memory")
	ally.pos = Vector2(900,700)
	w.time = 3.0
	v.force_refresh()
	_check(not _snapshot(v,2).alive and _snapshot(v,2).hp == 0, "reobservation updates removed structure to destroyed")
	tower.hp = 750.0
	tower.alive = true
	w.entities.append(tower)
	w.time = 4.0
	v.force_refresh()
	_check(_snapshot(v,2).alive and _snapshot(v,2).hp == 750, "visible rebuilt structure refreshes snapshot")
	ally.pos = Vector2(200,1200)
	w.time = 5.0
	tower.protected = true
	v.force_refresh()
	_check(not _snapshot(v,2).protected, "hidden protection changes are not leaked")

func _test_attack_clues() -> void:
	var w = FakeWorld.new()
	var ally = _unit(1,0,Vector2(200,1200))
	var enemy = _unit(2,1,Vector2(1000,700))
	w.entities = [ally,enemy]
	var v = Vision.new(w)
	v.force_refresh()
	var original: Vector2 = enemy.pos
	_check(not v.is_explored(original,0), "test attack origin initially unexplored")
	v.reveal_attack(1,original,0)
	var clues: Array = v.attack_reveals(0)
	_check(clues.size() == 1 and clues[0].pos == original and not clues[0].has("source_id"), "attack clue contains fixed position without actor id")
	_check(not v.is_point_visible(original,0) and not v.is_entity_visible(enemy,0), "attack clue grants no visibility or targeting")
	_check(not v.is_explored(original,0), "attack clue does not change explored grid")
	enemy.pos = Vector2(1200,900)
	_check(v.attack_reveals(0)[0].pos == original, "attack clue does not track source movement")
	v.reveal_attack(1,original,0)
	_check(v.attack_reveals(0).size() == 1, "repeated origin merges clue")
	v.reveal_attack(0,Vector2(800,800),0)
	_check(v.attack_reveals(0).size() == 1, "allied source does not create enemy clue")
	v.reveal_attack(2,enemy.pos,0)
	_check(v.attack_reveals(0).size() == 2, "hidden neutral attacker also creates fixed origin clue")
	v.reveal_attack(3,Vector2(1300,1000),0)
	_check(v.attack_reveals(0).size() == 2, "invalid source team rejected")
	w.time = 1.51
	v.step(1.51)
	_check(v.attack_reveals(0).is_empty(), "origin clue expires at 1.5 seconds")

func _test_objectives() -> void:
	var w = FakeWorld.new()
	var ally = _unit(1,0,Vector2(900,700))
	var dragon = _unit(2,2,Vector2(1100,700),"dragon")
	dragon.home_pos = dragon.pos
	w.entities = [ally,dragon]
	var v = Vision.new(w)
	v.force_refresh()
	_check(v.objective_observation(2,0).presence == "present" and v.objective_observation(2,0).hp == 1000, "visible objective observed alive with actual health")
	ally.pos = Vector2(200,1200)
	w.time = 1.0
	dragon.alive = false
	dragon.hp = 0
	dragon.respawn_at = 121.0
	v.record_objective_death(dragon,1)
	v.force_refresh()
	_check(v.objective_observation(2,0).presence == "present" and v.objective_observation(2,0).respawn_at == 0, "hidden objective death never leaks timer")
	_check(v.objective_observation(2,1).presence == "dead", "killer team receives witnessed objective death")
	ally.pos = Vector2(900,700)
	w.time = 2.0
	v.force_refresh()
	_check(v.objective_observation(2,0).presence == "absent" and not v.objective_observation(2,0).has("respawn_at") and not v.objective_observation(2,0).alive, "empty camp is absence, not a hidden death timer")

func _test_state_and_cadence() -> void:
	var w = FakeWorld.new()
	var ally = _unit(1,0,Vector2(900,700))
	var tower = _unit(2,1,Vector2(1100,700),"tower")
	w.entities = [ally,tower]
	var v = Vision.new(w)
	v.force_refresh()
	var old_revision: int = v.revision
	w.time = 0.05
	v.step(0.05)
	_check(v.revision == old_revision, "raster throttled before 0.1 seconds")
	w.time = 0.1
	v.step(0.05)
	_check(v.revision == old_revision + 1, "raster refreshes at 10 Hz")
	ally.pos = Vector2(200,1200)
	w.time = 1.0
	v.force_refresh()
	tower.hp = 0
	tower.alive = false
	v.reveal_attack(1,Vector2(1000,700),0)
	var state: Dictionary = v.export_state()
	var restored = Vision.new(w)
	_check(restored.import_state(state), "valid native vision state imports")
	_check(_snapshot(restored,2).hp == 1000 and _snapshot(restored,2).alive, "save/load preserves hidden building memory")
	_check(restored.is_explored(Vector2(1100,700),0), "save/load preserves explored terrain")
	_check(restored.attack_reveals(0).size() == 1, "save/load preserves attack clue expiry")
	var invalid: Dictionary = state.duplicate(true)
	invalid.explored[0] = PackedByteArray([1,0])
	_check(not restored.import_state(invalid), "invalid exploration dimensions rejected")
	_check(_snapshot(restored,2).hp == 1000, "failed import does not mutate existing knowledge")
	invalid = state.duplicate(true)
	invalid.map_size = 3200.0
	_check(not restored.import_state(invalid), "cross-map vision state rejected")
	var returned: Dictionary = restored.mask(0)
	returned.explored.fill(0)
	_check(restored.is_explored(Vector2(1100,700),0), "mask arrays use copy-on-write and cannot mutate stored exploration")

func _test_mask_parity() -> void:
	for scale in [1.0,2.0]:
		var w=FakeWorld.new(scale)
		w.entities=[_unit(1,0,Vector2(700,800)*scale),_unit(2,0,Vector2(1000,500)*scale),_unit(3,1,Vector2(1000,1000)*scale)]
		var v=Vision.new(w)
		v.force_refresh()
		var consistent=true
		for team in [0,1]:
			var m=v.mask(team)
			for y in range(m.rows):
				for x in range(m.cols):
					var p=Vector2((x+0.5)*m.cell_size,(y+0.5)*m.cell_size)
					if bool(m.visible[y*m.cols+x]) != v.is_point_visible(p,team):
						consistent=false
		_check(consistent,"optimized raster matches exact LOS at all cell centers, scale %s" % scale)
