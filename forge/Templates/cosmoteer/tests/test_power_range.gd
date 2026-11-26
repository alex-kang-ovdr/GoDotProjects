extends SceneTree

const RangeSim := preload("res://sim/power_range.gd")
const TOLERANCE := RangeSim.DT + 1e-6
var failures: Array[String] = []
var checks := 0


func _initialize() -> void:
	var probe := RangeSim.new()
	if not probe.load_error.is_empty() or probe.armor_max_hp <= 0:
		printerr("Simulation catalog unavailable or incomplete")
		quit(1)
		return
	_test_full_volley(probe)
	_test_severed_route()
	_test_trigger_gates()
	_test_capacity_and_reactor()
	_test_empty_reactor()
	_test_short_charge()
	_test_frame_independence()
	_test_route_length()
	_test_catalog_validation()
	for failure in failures:
		printerr("FAIL ", failure)
	print("Firing range checks: %d; failures: %d" % [checks, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _check(result: bool, label: String) -> void:
	checks += 1
	if not result:
		failures.append(label)


func _times(sim: RangeSim, kind: String) -> Array[float]:
	var result: Array[float] = []
	for event in sim.events:
		if event.kind == kind:
			result.append(float(event.time))
	return result


func _test_full_volley(sim: RangeSim) -> void:
	_check(sim.status() == "starved" and sim.reactor_energy == 8000, "Cold weapon and full small reactor")
	sim.step(30.0)
	_check(sim.hits == 8 and sim.shots == 8 and sim.armor_hp == 0, "Eight 500-damage operational hits destroy armor")
	_check(sim.deliveries == 2 and sim.weapon_energy == 400, "Two 1000-unit cells supply eight 200-unit shots")
	_check(sim.status() == "finished", "Terminal state")
	var pickups := _times(sim, "pickup")
	var deliveries := _times(sim, "delivery")
	var shots := _times(sim, "shot")
	var hits := _times(sim, "hit")
	_check(shots.size() == 8 and hits.size() == 8 and deliveries.size() == 2, "Complete event ledger")
	if shots.size() == 8 and hits.size() == 8 and deliveries.size() == 2 and not pickups.is_empty():
		_check(absf(deliveries[0] - pickups[0] - 6.0 / 3.2) < TOLERANCE, "Crew crosses six corridor tiles")
		_check(absf(shots[0] - deliveries[0] - 0.4) < TOLERANCE, "Emitter waits .4 s after trigger")
		for i in range(1, shots.size()):
			_check(absf(shots[i] - shots[i - 1] - 0.75) < TOLERANCE, "Fire interval %d" % i)
		_check(absf(hits[0] - shots[0] - 120.0 / 408.0) < TOLERANCE, "Projectile flight time")
		print("Range telemetry: first delivery %.3fs, first shot %.3fs, first impact %.3fs, breach %.3fs" % [deliveries[0], shots[0], hits[0], hits[-1]])
	sim.reset()
	_check(sim.armor_hp == 4000 and sim.elapsed == 0 and sim.hits == 0 and sim.events.is_empty(), "Replay starts clean")


func _test_severed_route() -> void:
	var sim := RangeSim.new()
	sim.step(0.7)
	var position_before := sim.carrier_position
	sim.set_route_open(false)
	sim.step(12.0)
	_check(sim.cargo == 1000 and sim.carrier_position == position_before, "Blocked route preserves cargo and position")
	_check(sim.deliveries == 0 and sim.hits == 0, "Route failure starves weapon")
	sim.set_route_open(true)
	sim.step(2.5)
	_check(sim.hits > 0 and sim.deliveries == 1, "Supply resumes from interrupted position")
	sim.set_route_open(false)
	sim.step(8.0)
	_check(sim.shots == 5 and sim.weapon_energy == 0 and sim.armor_hp == 1500, "One cell powers exactly five hits")
	sim.set_route_open(true)
	sim.step(12)
	_check(sim.status() == "finished", "Second delivery recovers stalled fight")


func _test_trigger_gates() -> void:
	var sim := RangeSim.new()
	sim.set_gunner_active(false)
	sim.step(3.0)
	_check(sim.weapon_energy == 1000 and sim.shots == 0 and sim.status() == "no_gunner", "Carrier cannot substitute for gunner")
	sim.set_gunner_active(true)
	sim.set_target_distance(261.0)
	sim.step(2.0)
	_check(sim.shots == 0 and sim.status() == "out_of_range", "261 exceeds 260 range")
	sim.set_target_distance(260.0)
	sim.set_fire_enabled(false)
	sim.step(1.0)
	_check(sim.shots == 0 and sim.status() == "hold", "Holding trigger blocks discharge")
	sim.set_fire_enabled(true)
	sim.step(0.2)
	sim.set_gunner_active(false)
	sim.step(1.0)
	_check(sim.shots == 0, "Gunner leaving during charge cancels pending release")
	sim.set_gunner_active(true)
	sim.step(0.5)
	_check(sim.shots == 1 and sim.hits == 0, "260 boundary releases a projectile with finite travel")
	sim.set_fire_enabled(false)
	sim.step(0.7)
	_check(sim.hits == 1 and sim.armor_hp == 3500, "Released shot completes while fire is held")


func _test_capacity_and_reactor() -> void:
	var sim := RangeSim.new()
	sim.set_fire_enabled(false)
	sim.step(RangeSim.DT)
	_check(sim.reactor_energy == 7000 and sim.cargo == 1000, "Pickup debits reactor exactly once")
	sim.step(0.65)
	_check(sim.reactor_energy == 7000, "Reactor generation waits for converter interval")
	sim.step(0.025)
	_check(sim.reactor_energy == 8000, "Reactor replenishes 1000 after 2/3 s")
	sim.step(60)
	_check(sim.weapon_energy == 4000 and sim.deliveries == 4 and sim.cargo == 0, "Storage caps prevent redundant pickups")
	_check(sim.reactor_energy == 8000 and sim.shots == 0, "Idle generation stays within reactor capacity")


func _test_empty_reactor() -> void:
	var sim := RangeSim.new()
	sim.reactor_energy = 0
	sim.step(0.65)
	_check(sim.cargo == 0 and sim.shots == 0, "No pickup before empty reactor produces")
	sim.step(0.025)
	_check(sim.cargo == 1000 and sim.reactor_energy == 0, "Newly generated cell enters supply route")


func _test_short_charge() -> void:
	var sim := RangeSim.new()
	sim.set_route_open(false)
	sim.weapon_energy = 100
	sim.step(2.0)
	_check(sim.shots == 1 and sim.hits == 1 and sim.armor_hp == 3750 and sim.weapon_energy == 0, "Half charge scales one hit to 250")


func _test_frame_independence() -> void:
	var batch := RangeSim.new()
	var framed := RangeSim.new()
	batch.step(7.0)
	for i in 420:
		framed.step(1.0 / 60.0)
	_check(batch.events == framed.events and batch.projectiles == framed.projectiles, "Identical shot and transport traces at 60 FPS")
	_check(batch.carrier_position == framed.carrier_position and batch.armor_hp == framed.armor_hp and batch.weapon_energy == framed.weapon_energy, "Identical world state across chunk sizes")


func _test_route_length() -> void:
	var sim := RangeSim.new()
	sim.route_length = 12.0
	sim.step(3.5)
	_check(sim.deliveries == 0 and sim.shots == 0, "Doubling route delays first delivery")
	sim.step(1.0)
	_check(sim.deliveries == 1 and sim.hits == 1, "Longer supply route completes on measured schedule")


func _test_catalog_validation() -> void:
	var sim := RangeSim.new()
	sim._configure_catalog({"parts": "broken"})
	_check("parts array" in sim.load_error, "Catalog rejects missing parts array")
	sim._configure_catalog({"parts": []})
	_check(RangeSim.REACTOR_ID in sim.load_error, "Missing module names its source ID")
	var catalog: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(RangeSim.CATALOG_PATH))
	var parts: Array = catalog.parts
	parts.append(parts[0])
	sim._configure_catalog(catalog)
	_check("duplicate part ID" in sim.load_error, "Catalog rejects ambiguous IDs")
	parts.pop_back()
	var laser: Dictionary
	for part in parts:
		if part.id == RangeSim.LASER_ID:
			laser = part.stats
			break
	var original_speed: float = laser.projectile_speed
	for invalid_speed in [null, "408", 0, -1, INF]:
		laser.projectile_speed = invalid_speed
		sim._configure_catalog(catalog)
		_check("laser_blaster_small.stats.projectile_speed" in sim.load_error, "Invalid projectile speed identifies field")
	laser.projectile_speed = original_speed
	laser.erase("min_resources_used")
	sim._configure_catalog(catalog)
	_check("min_resources_used" in sim.load_error and RangeSim.CATALOG_PATH in sim.load_error, "Missing numeric field identifies catalog and key")
	laser.min_resources_used = 1.5
	sim._configure_catalog(catalog)
	_check("whole battery quantity" in sim.load_error, "Fractional storage units rejected")
	laser.min_resources_used = 201
	sim._configure_catalog(catalog)
	_check("min_resources_used exceeds" in sim.load_error, "Impossible minimum charge rejected")
	sim.step(30)
	_check(sim.status() == "catalog_error" and sim.elapsed == 0.0, "Failed configuration stays halted")
	laser.min_resources_used = 1
	laser.fire_delay = 0
	sim._configure_catalog(catalog)
	sim.step(2.0)
	_check(sim.load_error.is_empty() and _times(sim, "shot")[0] == _times(sim, "delivery")[0], "Valid zero fire delay releases on trigger tick")
