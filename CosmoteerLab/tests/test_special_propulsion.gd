extends SceneTree

const Battle := preload("res://sim/ship_battle.gd")
const Design := preload("res://sim/ship_design.gd")
const Flight := preload("res://sim/flight_dynamics.gd")
const Special := preload("res://sim/special_propulsion.gd")
var checks := 0
var failed := 0


func _initialize() -> void:
	var design := Design.new()
	design.special_starter()
	var b := Battle.new()
	_check(b.start(design), "Special ship launches: " + b.launch_error)
	if b.result == "active":
		_test_boost_switch(b)
		_test_boost_thrust(design)
		_test_rocket(design)
		_test_recovery(design)
		_test_delivery_race(design)
		_test_rocket_damage(design)
	print("Special propulsion checks: %d; failures: %d" % [checks, failed])
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


func _fire_engine(ship: Dictionary, p: Dictionary, ticks: int) -> void:
	var nozzle: Dictionary = p.nozzles[0]
	var arm: Vector2 = nozzle.location_local - ship.center_of_mass
	var direction: Vector2 = nozzle.direction_local
	var turn := signf(arm.cross(direction))
	for i in ticks:
		Flight.advance(ship, direction, turn, Battle.DT)


func _test_boost_switch(b: Battle) -> void:
	b.enemy.position.x = 4000
	var ship := b.player
	var p := _first(ship, Special.BOOST)
	var total := 0
	for room in ship.parts.values():
		total += int(room.energy)
	_check(total == 16000 and p.energy == 6000, "Two reactor reserves fund deployment without creating energy")
	_check(b.request_boost(true) and p.boost_active, "Charged boost enters its active profile")
	_check(b.request_boost(false) and p.energy == 6000, "Immediate switch-off at full charge preserves storage")
	b.request_boost(true)
	b.step(0.09)
	_check(p.energy == 6000, "Switching on has no immediate drain pulse")
	b.step(0.02)
	_check(p.energy == 5990 and Special.outlets(ship, p.uid).is_empty(), "Active boost burns 10 per 0.1s even at idle and blocks crew filling")
	b.request_boost(false)
	_check(p.energy == 0 and not b.request_boost(true), "Leaving boost below full drains the remainder")
	p.energy = 5000
	_check(not b.request_boost(true), "Empty latch stays off at 5000")
	p.energy = 5001
	Special.update_boost_ready(ship, p)
	p.energy = 2000
	_check(b.request_boost(true), "Already latched tank can engage below its initial 5001 threshold")
	p.energy = 10
	b.step(0.1)
	_check(not p.boost_active and p.energy == 0 and not p.boost_ready, "Last timer pulse automatically disables depleted boost")
	b.step(40)
	_check(p.energy == 6000 and p.deliveries >= 6 and b.propulsion_state(ship).boost_ready == 1, "Couriers refill emptied tank and rearm boost")


func _test_boost_thrust(d: Design) -> void:
	var normal := _battle(d)
	var p := _first(normal.player, Special.BOOST)
	_solo(normal.player, p.uid)
	_fire_engine(normal.player, p, 60)
	_check(absf(p.actual_force - 1800.0) < 2.0, "Normal profile ramps halfway to 3600 in one second")
	_fire_engine(normal.player, p, 60)
	_check(absf(p.actual_force - 3600) < 2 and absf(p.actual_fuel_rate - 200) < 0.1, "Normal maximum force costs 200 per second")
	var boost := _battle(d)
	p = _first(boost.player, Special.BOOST)
	_solo(boost.player, p.uid)
	boost.request_boost(true)
	_fire_engine(boost.player, p, 60)
	_check(absf(p.actual_force - 9600) < 2 and absf(p.actual_fuel_rate - 450) < 0.1, "Boost gives instant 9600 thrust at 450 fuel/s")
	_check(p.energy == 5450, "One second of boosted full thrust debits 450 thrust fuel plus 100 background drain")
	print("Boost telemetry: full force %.0f, fuel after one second %d / 6000" % [p.actual_force, p.energy])


func _test_rocket(d: Design) -> void:
	var b := _battle(d)
	var ship := b.player
	var p := _first(ship, Special.ROCKET)
	var ext := _first(ship, Special.EXTENDER)
	var pod := _first(ship, Special.BATTERY)
	_check(p.staffed == 0 and p.rocket_capacity == 8000 and p.rocket_usable_capacity == 4000, "Connected stages expose capped proxy capacity and unique physical stores")
	_fire_engine(ship, p, 1)
	_check(p.actual_force == 0 and p.activation == 0, "A charged rocket still requires operators")
	b.step(16)
	var positions := []
	for crew in ship.crew:
		if crew.station == p.uid:
			positions.append(crew.pos)
	_check(p.staffed == 2 and positions.size() == 2 and positions[0] != positions[1], "Two crew physically reach distinct catalog stations")
	_check(p.deliveries + ext.deliveries + pod.deliveries > 0, "Couriers deliver to connected rocket consumers")
	_solo(ship, p.uid)
	p.energy = 2000
	ext.energy = 2000
	pod.energy = 4000
	p.fuel_fraction = 0
	Special.update_rocket(ship, p)
	_check(p.rocket_force == 20000 and p.nozzles[0].spec.fuel_per_second == 600, "Two powered stages double peak force and peak fuel")
	_fire_engine(ship, p, 170)
	_check(absf(p.actual_force - 10000) < 100, "Two-stage normalized actuator reaches half thrust after 2.83s")
	_fire_engine(ship, p, 170)
	var state := b.propulsion_state(ship)
	_check(absf(state.rocket_current_force - 20000.0) < 10 and absf(state.rocket_current_rate - 600) < 1, "Cold full ramp finishes at about 5.657s")
	var before := int(p.energy + ext.energy + pod.energy)
	var before_nozzle := int(p.energy)
	_fire_engine(ship, p, 60)
	var used := before - int(p.energy + ext.energy + pod.energy)
	_check(used == 600 and before_nozzle - p.energy == 300, "Full output draws 600 from physical storage, evenly across two stage groups")
	p.energy = 0
	ext.energy = 0
	pod.energy = 1400
	var start := int(pod.energy)
	_fire_engine(ship, p, 60)
	_check(p.energy == 0 and ext.energy == 0 and pod.energy < start and p.actual_force > 0, "A linked pod physically powers the nozzle through the extender")
	print("Rocket telemetry: two-stage peak %.0f force / %.0f fuel per second, measured drain %d" % [state.rocket_current_force, state.rocket_current_rate, used])


func _test_rocket_damage(d: Design) -> void:
	var b := _battle(d)
	var ship := b.player
	var p := _first(ship, Special.ROCKET)
	var ext := _first(ship, Special.EXTENDER)
	var pod := _first(ship, Special.BATTERY)
	p.energy = 1000
	ext.energy = 1000
	pod.energy = 3000
	var center := Flight.grid_world(ship, ext.hit_rect.get_center())
	b.projectiles.append({
		"side":"enemy", "source_uid":b.enemy.ids[Battle.GUN][0], "target_uid":ext.uid,
		"pos":center, "velocity":Vector2.RIGHT * 408, "speed":408, "range":260,
		"travelled":0.0, "damage":ext.max_hp, "structural_damage":ext.max_hp, "power":1.0
	})
	b._fly()
	var state := b.propulsion_state(ship)
	_check(ext.hp == 0 and ext.energy == 0 and pod.energy == 3000, "Destroying an extender removes its own fuel and preserves the isolated pod")
	_check(state.rocket_capacity == 2000 and state.rocket_energy == 1000 and state.rocket_force == 10000, "Combat damage immediately rebuilds nozzle access and effective force")
	_check(Special.outlets(ship, pod.uid).is_empty(), "Disconnected pods stop accepting resupply jobs")


func _test_recovery(d: Design) -> void:
	var b := _battle(d)
	b.step(15)
	var ship := b.player
	var p := _first(ship, Special.ROCKET)
	var ext := _first(ship, Special.EXTENDER)
	var pod := _first(ship, Special.BATTERY)
	_solo(ship, p.uid)
	for room in [p, ext, pod]:
		room.energy = room.capacity
	_fire_engine(ship, p, 341)
	for i in 60:
		Flight.advance(ship, Vector2.ZERO, 0, Battle.DT)
	var released: float = p.raw_activation
	var recover: float = p.raw_recovery
	_fire_engine(ship, p, 1)
	_check(absf(released - 1.0) < 0.02 and recover > released + 0.2, "Full release decays thrust and retained recovery level at different rates")
	_check(p.raw_activation >= recover and p.raw_activation < recover + 0.02, "Quick throttle reapplication resumes at retained level")
	p.raw_activation = 0.5
	p.raw_recovery = 1.5
	var nozzle: Dictionary = p.nozzles[0]
	nozzle.requested = 0.5
	Special.actuate(p, nozzle, Battle.DT)
	_check(is_equal_approx(p.raw_activation, 1.0) and absf(p.raw_recovery - (1.5 - Battle.DT / sqrt(8.0))) < 0.00001, "Demand between actual and recovery is reached immediately while recovery moves at rise rate")
	p.raw_activation = 0.5
	p.raw_recovery = 0.5
	ext.energy = 0
	pod.energy = 0
	_fire_engine(ship, p, 1)
	_check(p.raw_maximum == 1 and p.raw_activation > 0.5 and p.raw_activation < 0.51, "Charge-dependent stage loss preserves feasible raw activation")


func _test_delivery_race(d: Design) -> void:
	var b := _battle(d)
	var ship := b.player
	var pod := _first(ship, Special.BATTERY)
	var ext := _first(ship, Special.EXTENDER)
	for room in ship.parts.values():
		room.energy = room.capacity
	pod.energy -= 123
	var carrier: Dictionary = {}
	for member in ship.crew:
		if member.role == "carrier":
			carrier = member
			break
	carrier.path.clear()
	carrier.at = ext.cell
	carrier.pos = Vector2(ext.cell)
	carrier.cargo = 1000
	carrier.goal = ext.uid
	carrier.delivery = ext.uid
	carrier.retry = 9999
	b._crew_tick(ship, carrier, "player")
	_check(carrier.cargo == 877 and pod.energy == pod.capacity and ship.deliveries == 1, "Partial shared-store delivery accepts only 123 and retains the remaining 877 units")
	carrier.goal = ext.uid
	carrier.delivery = ext.uid
	b._crew_tick(ship, carrier, "player")
	_check(carrier.cargo == 877 and ship.deliveries == 1, "Full shared storage retains cargo without counting an empty delivery")
	var gun := _first(ship, Battle.GUN)
	gun.energy = 0
	carrier.retry = 0
	for i in 1200:
		b._crew_tick(ship, carrier, "player")
		if carrier.cargo == 0:
			break
	_check(carrier.cargo == 0 and gun.energy == 877 and ship.deliveries == 2, "Courier redirects the remaining 877 units and delivers them to an available gun")
	var totals: Array = []
	for room in ship.parts.values():
		totals.append(room.energy)
	for i in 10:
		b.propulsion_state(ship)
	var after: Array = []
	for room in ship.parts.values():
		after.append(room.energy)
	_check(totals == after, "HUD reads preserve every component's energy")
