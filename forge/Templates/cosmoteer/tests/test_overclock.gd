extends SceneTree

const Battle := preload("res://sim/ship_battle.gd")
const Design := preload("res://sim/ship_design.gd")
const Flight := preload("res://sim/flight_dynamics.gd")
const Room := preload("res://sim/engine_room.gd")
const Special := preload("res://sim/special_propulsion.gd")

var checks := 0
var failed := 0


func _initialize() -> void:
	var design := Design.new()
	design.special_starter()
	var b := _battle(design)
	_check(b.result == "active", "custom-tuned engine room design launches")
	if b.result == "active":
		_test_request_and_edges(b)
		_test_boost(design)
		_test_rocket(design)
		_test_trip_and_recovery(design)
		_test_damage(design)
	print("Overclock checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)


func _check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", label)


func _battle(design: Design) -> Battle:
	var b := Battle.new()
	b.start(design)
	b.enemy.position.x = 4000
	return b


func _first(ship: Dictionary, id: String) -> Dictionary:
	return ship.parts[ship.ids[id][0]]


func _solo(ship: Dictionary, keep: int) -> void:
	for uid in ship.engines:
		if uid != keep:
			ship.parts[uid].hp = 0
	Flight.refresh_mass(ship)


func _fire(ship: Dictionary, p: Dictionary, ticks: int) -> void:
	var n: Dictionary = p.nozzles[0]
	var arm: Vector2 = n.location_local - ship.center_of_mass
	var turn := signf(arm.cross(n.direction_local))
	for i in ticks:
		Flight.advance(ship, n.direction_local, turn, Battle.DT)


func _fire_cold(ship: Dictionary, p: Dictionary, ticks: int) -> void:
	var n: Dictionary = p.nozzles[0]
	var arm: Vector2 = n.location_local - ship.center_of_mass
	var turn := signf(arm.cross(n.direction_local))
	for i in ticks:
		# Isolate force and draw multipliers from the separate thermal trip test.
		p.heat = 0.0
		p.thermal_trip = false
		Flight.advance(ship, n.direction_local, turn, Battle.DT)


func _test_request_and_edges(b: Battle) -> void:
	var ship := b.player
	var room := _first(ship, Room.ID)
	var boost := _first(ship, Special.BOOST)
	var rocket := _first(ship, Special.ROCKET)
	var state: Dictionary = b.overclock_state()
	_check(state.installed == 1 and state.linked == 2 and state.ready, "room installs, reaches both engines by edge, and reports ready")
	_check(not b.request_overclock(false) and b.request_overclock(true), "request rejects redundant off and enables ready overclock")
	_check(not b.request_overclock(true) and b.overclock_state().active, "repeated on request does not toggle or apply a second bonus")
	_check(boost.engine_rooms.has(room.uid) and rocket.engine_rooms.has(room.uid), "boost and rocket retain one engine-room link each")
	room.hp = 0
	_check(not b.overclock_state().ready and not b.request_overclock(true), "destroyed room removes readiness while active state remains until explicitly switched off")
	_check(b.request_overclock(false), "active overclock can be switched off after room loss")
	room.hp = room.max_hp
	_check(b.overclock_state().ready and b.request_overclock(true), "repaired linked room restores readiness")
	_check(Room.adjacent({"cell": Vector2i(0, 0), "size": Vector2i(2, 2)}, {"cell": Vector2i(2, 1), "size": Vector2i(1, 1)}), "shared side edge counts as adjacency")
	_check(not Room.adjacent({"cell": Vector2i(0, 0), "size": Vector2i(2, 2)}, {"cell": Vector2i(2, 2), "size": Vector2i(1, 1)}), "corner-only contact is not adjacency")
	_check(not Room.adjacent({"cell": Vector2i(0, 0), "size": Vector2i(2, 2)}, {"cell": Vector2i(3, 0), "size": Vector2i(1, 1)}), "one-cell gap is not adjacency")


func _test_boost(design: Design) -> void:
	var normal := _battle(design)
	var p := _first(normal.player, Special.BOOST)
	_solo(normal.player, p.uid)
	normal.request_boost(true)
	_fire(normal.player, p, 120)
	var base_force: float = p.actual_force
	var base_draw: float = p.actual_fuel_rate
	var base_heat: float = p.heat_rate
	var boosted := _battle(design)
	p = _first(boosted.player, Special.BOOST)
	_solo(boosted.player, p.uid)
	normal.request_boost(false)
	_check(boosted.request_boost(true), "boost reserve accepts boost activation")
	_check(boosted.request_overclock(true), "linked boost accepts overclock request")
	_fire_cold(boosted.player, p, 120)
	_check(absf(base_force - 9600) < 3 and absf(p.actual_force - base_force * 1.3) < 3, "boost force baseline and 1.30 overclock multiplier measured")
	_check(absf(base_draw - 450) < 0.2 and absf(p.actual_fuel_rate - base_draw * 1.45) < 0.2, "boost reserve draw scales by 1.45 under overclock")
	_check(absf(base_heat - 13.75) < 0.01 and absf(p.heat_rate - 40.0) < 0.1, "boost gross heat reports measured draw plus one overclock load")
	_check(p.energy < 6000 and p.overclocked, "boost reserve debits thrust and background demand")
	print("Boost overclock: force %.0f/%.0f draw %.1f/%.1f heat %.1f/%.1f" % [base_force,p.actual_force,base_draw,p.actual_fuel_rate,base_heat,p.heat_rate])


func _test_rocket(design: Design) -> void:
	var b := _battle(design)
	b.step(16)
	var ship := b.player
	var p := _first(ship, Special.ROCKET)
	var ext := _first(ship, Special.EXTENDER)
	var pod := _first(ship, Special.BATTERY)
	_check(p.staffed >= int(p.stats.special_propulsion.crew_required), "crew reaches both rocket stations before force measurement")
	p.energy = 2000
	ext.energy = 2000
	pod.energy = 4000
	Special.update_rocket(ship, p)
	_solo(ship, p.uid)
	_fire_cold(ship, p, 340)
	var baseline_force: float = p.actual_force
	var baseline_draw: float = p.actual_fuel_rate
	var baseline_heat: float = p.heat_rate
	var bo := _battle(design)
	bo.step(16)
	ship = bo.player
	p = _first(ship, Special.ROCKET)
	ext = _first(ship, Special.EXTENDER)
	pod = _first(ship, Special.BATTERY)
	_check(p.staffed >= int(p.stats.special_propulsion.crew_required), "crew reaches both overclocked rocket stations")
	p.energy = 2000
	ext.energy = 2000
	pod.energy = 4000
	Special.update_rocket(ship, p)
	_solo(ship, p.uid)
	bo.request_overclock(true)
	_fire_cold(ship, p, 340)
	_check(absf(baseline_force - 20000) < 30 and absf(p.actual_force - baseline_force * 1.3) < 30, "two-stage rocket baseline and overclock thrust measured")
	_check(absf(baseline_draw - 600) < 1 and absf(p.actual_fuel_rate - baseline_draw * 1.45) < 1, "two-stage rocket physical reserve draw scales by 1.45")
	_check(absf(baseline_heat - 14.0) < 0.1 and absf(p.heat_rate - (14.0 + Room.OVERCLOCK_HEAT)) < 0.2, "rocket gross heat matches capped stock draw plus overclock load")
	var stores_before := int(p.energy + ext.energy + pod.energy)
	_fire_cold(ship, p, 60)
	_check(stores_before - int(p.energy + ext.energy + pod.energy) == 870, "two-stage overclock consumes measured 870 reserve units in one second")
	print("Rocket overclock: force %.0f/%.0f draw %.1f/%.1f heat %.1f/%.1f" % [baseline_force,p.actual_force,baseline_draw,p.actual_fuel_rate,baseline_heat,p.heat_rate])


func _test_trip_and_recovery(design: Design) -> void:
	var b := _battle(design)
	var ship := b.player
	var p := _first(ship, Special.BOOST)
	_solo(ship, p.uid)
	b.request_overclock(true)
	b.request_boost(true)
	for i in 500:
		_fire(ship, p, 1)
		if p.thermal_trip:
			break
	_check(p.thermal_trip and b.overclock_state().tripped == 1, "sustained overclock gross heat triggers thermal trip")
	var prior: float = p.heat
	_fire(ship, p, 60)
	_check(p.actual_force == 0, "tripped engine cuts thrust")
	_check(p.heat < prior, "tripped engine cools")
	for i in 250:
		Flight.advance(ship, Vector2.ZERO, 0, Battle.DT)
	_check(not p.thermal_trip and p.heat <= Room.RESET_HEAT and b.overclock_state().ready, "idle cooling below reset threshold recovers trip and readiness")
	_check(b.request_overclock(false), "recovered overclock can be disabled")

	var unlinked := _battle(design)
	ship = unlinked.player
	p = _first(ship, Special.BOOST)
	var room := _first(ship, Room.ID)
	_solo(ship, p.uid)
	room.hp = 0
	_check(not unlinked.overclock_state().ready and not unlinked.request_overclock(true), "unlinked engine refuses overclock enable")
	ship.overclock = true
	_fire(ship, p, 120)
	_check(not p.overclocked and absf(p.actual_force - 3600) < 3, "stale global request gives unlinked engine no overclock bonus")

	var depleted := _battle(design)
	ship = depleted.player
	p = _first(ship, Special.BOOST)
	_solo(ship, p.uid)
	depleted.request_boost(true)
	p.energy = 20
	_fire(ship, p, 20)
	_check(p.energy == 0 and not p.boost_active and p.actual_force == 0, "empty boost reserve disables the engine and stops thrust")


func _test_damage(design: Design) -> void:
	var b := _battle(design)
	var room := _first(b.player, Room.ID)
	var p := _first(b.player, Special.BOOST)
	_check(b.request_overclock(true), "damage case starts linked and active")
	room.hp = 0
	Flight.advance(b.player, p.nozzles[0].direction_local, 0, Battle.DT)
	_check(b.overclock_state().active and not b.overclock_state().ready and not p.overclocked, "destroyed room immediately drops active engine link and bonus")
