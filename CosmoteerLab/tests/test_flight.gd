extends SceneTree

const Battle := preload("res://sim/ship_battle.gd")
const Design := preload("res://sim/ship_design.gd")
const Flight := preload("res://sim/flight_dynamics.gd")
var checks := 0
var failed := 0


func _initialize() -> void:
	var d := Design.new()
	d.flight_starter()
	var battle := Battle.new()
	_check(battle.start(d), "Powered starter launches")
	if battle.result != "active":
		quit(1)
		return
	_test_motion(battle)
	_test_nozzles(d)
	_test_spool_times()
	_test_gunnery(d)
	_test_geometry(d)
	_test_dodge(d)
	_test_collision(d)
	_test_supplies(d)
	_test_encounter(d)
	print("Flight checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)


func _check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", label)


func _test_motion(b: Battle) -> void:
	var initial: Vector2 = b.player.position
	var stores := 0
	for p in b.player.parts.values():
		stores += int(p.energy)
	_check(stores == 8000 and b.player.engines.size() == 4, "Deployment redistributes exactly one reactor reserve")
	b.set_flight_input(Vector2.RIGHT, 0)
	b.step(Battle.DT)
	_check(b.player.velocity.x > 0 and b.player.position.x > initial.x, "Forward input accelerates on first tick")
	b.step(1)
	_check(b.player.velocity.x > 5 and absf(b.player.angular_velocity) < 0.1, "Symmetric nozzles give forward thrust without appreciable torque")
	_check(b.enemy.position.distance_to(Vector2(60, 0)) > 0.5, "Opponent maneuvers under its own engine forces")
	var fuel := 0
	for uid in b.player.engines:
		fuel += b.player.parts[uid].energy
	_check(fuel < 4000, "Applied thrust consumes stored engine power")
	var speed: float = b.player.velocity.length()
	b.set_flight_input(Vector2.ZERO, 0)
	b.step(0.25)
	_check(b.player.velocity.length() < speed and b.player.velocity.length() > 0, "Neutral input coasts under original drag")
	b.set_flight_input(Vector2.ZERO, 1)
	var angle: float = b.player.heading
	b.step(0.5)
	_check(angle_difference(angle, b.player.heading) > 0.1, "Clockwise command changes heading through thrust torque")
	print("Flight telemetry: mass %.2f, inertia %.2f, forward speed %.2f, turn %.3f rad" % [b.player.mass, b.player.inertia, speed, angle_difference(angle, b.player.heading)])


func _test_nozzles(d: Design) -> void:
	var p: Dictionary = d.by_id["cosmoteer.thruster_small"]
	for rotation in 4:
		var part := {"cell":Vector2i(2, 1), "rotation":rotation, "stats":p.stats}
		Flight.prepare_part(part, p)
		var expected := Vector2.UP.rotated(rotation * PI / 2.0)
		_check(expected.is_equal_approx(part.force_local), "Placement rotation redirects physical thrust %d" % rotation)
	var b := Battle.new()
	b.start(d, d)
	var ship := b.player
	for uid in ship.engines:
		ship.parts[uid].hp = 0
	var selected: Dictionary = ship.parts[ship.engines[0]]
	selected.hp = selected.max_hp
	Flight.refresh_mass(ship)
	var arm: Vector2 = selected.nozzles[0].location_local - Vector2(ship.center_of_mass)
	var f: Vector2 = selected.nozzles[0].direction_local
	Flight.advance(ship, f, 0, Battle.DT)
	_check(absf(ship.angular_velocity) > 0.001 and signf(ship.angular_velocity) == signf(arm.cross(f)), "A single off-axis mount produces torque of the expected sign")
	selected.hp = 0
	ship.velocity = Vector2.ZERO
	ship.angular_velocity = 0.0
	Flight.advance(ship, f, 1, Battle.DT)
	_check(ship.velocity == Vector2.ZERO and ship.angular_velocity == 0, "Destroyed thrusters cannot translate or turn")
	selected.hp = selected.max_hp
	selected.energy = 0
	Flight.advance(ship, f, 1, Battle.DT)
	_check(selected.activation == 0 and ship.velocity == Vector2.ZERO, "Unpowered thruster produces no force")
	selected.energy = 1000
	ship.command = false
	Flight.advance(ship, f, 1, Battle.DT)
	_check(selected.activation == 0 and ship.velocity == Vector2.ZERO, "Loss of bridge command stops thrust")


func _test_spool_times() -> void:
	for fixture in [["thruster_med",1.0],["thruster_large",2.0],["thruster_huge",4.0]]:
		var d := Design.new()
		d.place("cosmoteer."+fixture[0],Vector2i(2,2))
		var ship := Battle._build_ship(d)
		Flight.deploy(ship,Vector2.ZERO,0.0,d.ship_physics)
		ship.command = true
		var engine: Dictionary = ship.parts[ship.engines[0]]
		engine.energy = engine.capacity
		for i in 30:
			Flight.advance(ship,Vector2.UP,0.0,Battle.DT)
		_check(absf(engine.activation - 0.5/float(fixture[1])) < 0.001,"Half-second original thrust ramp "+fixture[0])
		Flight.advance(ship,Vector2.ZERO,0.0,Battle.DT)
		_check(engine.activation==0.0,"Immediate throttle release "+fixture[0])
		for i in 110:
			Flight.advance(ship,Vector2.UP,0.0,Battle.DT)
		_check(engine.activation==0.0,"Recovery prevents immediate restart "+fixture[0])
		for i in 18:
			Flight.advance(ship,Vector2.UP,0.0,Battle.DT)
		_check(engine.activation>0.0,"Engine recovers after two seconds "+fixture[0])


func _test_gunnery(d: Design) -> void:
	var b := Battle.new()
	b.start(d, d)
	var gun: Dictionary = b.player.parts[b.player.ids[Battle.GUN][0]]
	var uid: int = b.enemy.ids[Battle.BRIDGE][0]
	b.enemy.position = Vector2(400, 0)
	_check(not Flight.aim(b.player, b.enemy, gun, uid, 1) and gun.aim_status == "out_of_range", "Live intercept beyond bolt range blocks release")
	b.enemy.position = Vector2(-180, 0)
	_check(not Flight.aim(b.player, b.enemy, gun, uid, 1) and gun.aim_status == "out_of_arc", "Aft target outside 200 degree turret arc")
	b.player.heading = PI
	for i in 100:
		Flight.aim(b.player, b.enemy, gun, uid, Battle.DT)
	_check(gun.aim_status == "ready", "Rotating the hull brings the aft target into arc")
	b.player.heading = 0
	b.enemy.position = Vector2(-60, 122)
	gun.turret_angle_local = 0
	_check(not Flight.aim(b.player, b.enemy, gun, uid, Battle.DT) and gun.aim_status == "tracking", "Turret tracks at finite slew rate")
	_check(absf(gun.turret_angle_local) <= deg_to_rad(90.0) * Battle.DT + 0.00001, "One tick respects 90 degree/s servo speed")
	b.enemy.position = Vector2(60, 0)
	b.enemy.velocity = Vector2(0, 20)
	Flight.aim(b.player, b.enemy, gun, uid, 1)
	var direct := (Flight.grid_world(b.enemy, b.enemy.parts[uid].hit_rect.get_center()) - Flight.grid_world(b.player, gun.mount_local)).angle()
	_check(gun.turret_angle_local > direct + 0.02, "Target velocity produces positive lead")


func _test_geometry(d: Design) -> void:
	var b := Battle.new()
	b.start(d, d)
	var enemy := b.enemy
	var uid: int = enemy.ids[Battle.ARMOR][-1]
	var rect: Rect2 = enemy.parts[uid].hit_rect
	var goal := Battle.grid_world(enemy, rect.get_center())
	var front := Vector2.RIGHT.rotated(enemy.heading)
	var hit := Flight.trace(enemy, goal + front * 30, goal - front * 2)
	_check(not hit.is_empty() and hit.uid == uid, "First swept contact is exposed forward armor")
	enemy.heading += PI / 2
	enemy.previous_heading = enemy.heading
	goal = Battle.grid_world(enemy, rect.get_center())
	front = Vector2.RIGHT.rotated(enemy.heading)
	hit = Flight.trace(enemy, goal + front * 30, goal - front * 2)
	_check(not hit.is_empty() and hit.uid == uid, "Swept projectile collision rotates with armored hull")
	var aimed: int = enemy.ids[Battle.BRIDGE][0]
	b.projectiles.append({
		"side":"player", "source_uid":b.player.ids[Battle.GUN][0], "target_uid":aimed,
		"pos":enemy.position + Vector2(0,40), "velocity":Vector2.RIGHT * 408,
		"speed":408.0, "range":260.0, "travelled":0.0, "damage":500, "structural_damage":250, "power":1.0
	})
	for i in 50:
		b._fly()
	_check(b.player.misses == 1 and b.player.hits == 0 and b.projectiles.is_empty(), "A bolt which misses its aimed module expires at range")
	var before: float = enemy.parts[uid].hp
	b.projectiles.append({
		"side":"player", "source_uid":b.player.ids[Battle.GUN][0], "target_uid":aimed,
		"pos":goal + front * 4.0, "velocity":-front * 408.0,
		"speed":408.0, "range":260.0, "travelled":0.0, "damage":500, "structural_damage":250, "power":1.0
	})
	b._fly()
	_check(enemy.parts[uid].hp == before - 500 and b.events[-1].uid == uid and b.events[-1].target_uid == aimed, "Intervening armor takes damage instead of selected bridge")


func _test_supplies(d: Design) -> void:
	var b := Battle.new()
	b.start(d, d)
	var uid: int = b.player.engines[0]
	var engine: Dictionary = b.player.parts[uid]
	engine.energy = 0
	engine.fuel_online = false
	b.step(20)
	_check(engine.deliveries > 0 and engine.energy > 30, "Crew deliver a cell to a drained mounted engine")
	b.start(d, d)
	engine = b.player.parts[uid]
	engine.energy = 0
	for i in 360:
		Flight.advance(b.player, Vector2.ZERO, 0, Battle.DT)
	_check(engine.energy == 30, "Small engine self-recharges 30 units every six seconds")


func _test_collision(d: Design) -> void:
	var b := Battle.new()
	b.start(d, d)
	var a := b.player
	var other := b.enemy
	a.position = Vector2(-16, 0)
	other.position = Vector2(16, 0)
	a.velocity = Vector2(25, 0)
	other.velocity = Vector2(-25, 0)
	var touched := false
	_check(not Flight.resolve_contact(a, other) and a.velocity.x == 25, "Separated hulls receive no artificial braking")
	for i in 120:
		Flight.advance(a, Vector2.ZERO, 0, Battle.DT)
		Flight.advance(other, Vector2.ZERO, 0, Battle.DT)
		if Flight.resolve_contact(a, other):
			touched = true
	_check(touched and a.position.x < other.position.x, "Head-on ships make physical contact without passing through")
	_check(a.velocity.x - other.velocity.x < 2, "Non-bouncing hull contact dissipates closing velocity")


func _test_dodge(d: Design) -> void:
	var fort := Design.new()
	fort.starter()
	var b := Battle.new()
	b.start(d, fort)
	b.player.position = Vector2(-122, 0)
	b.enemy.position = Vector2(122, 0)
	b.enemy_target_uid = b.player.engines[-1]
	for i in 900:
		b.step(Battle.DT)
		if b.enemy.shots > 0:
			break
	var release: float = b.elapsed
	_check(b.enemy.shots == 1 and b.enemy.hits == 0, "Actual enemy projectile released at long range")
	var before: Vector2 = b.player.position
	b.set_flight_input(Vector2.UP, 0)
	b.step(0.7)
	var shift: float = before.y - b.player.position.y
	_check(shift > 2.0 and b.enemy.misses == 1 and b.enemy.hits == 0, "Post-release strafe evades a non-homing laser")
	print("Evasion: shot %.3fs, strafe %.2fm, enemy misses %d" % [release, shift, b.enemy.misses])


func _test_encounter(d: Design) -> void:
	var b := Battle.new()
	b.start(d)
	b.select_target(b.enemy.ids[Battle.GUN][0])
	for i in 6000:
		b.step(Battle.DT)
		if b.result != "active":
			break
	_check(b.result == "win" and b.enemy.shots > 0, "Focused fire can win the powered maneuvering encounter")
	print("Powered encounter: %s %.2fs, hits %d:%d, misses %d:%d" % [b.result, b.elapsed, b.player.hits, b.enemy.hits, b.player.misses, b.enemy.misses])
	b.start(d)
	for i in 6000:
		var away: Vector2 = b.player.position - b.enemy.position
		var turn := clampf(angle_difference(b.player.heading, away.angle()) * 0.8 - b.player.angular_velocity * 0.45, -1, 1)
		b.set_flight_input(Vector2.ZERO, turn)
		b.step(Battle.DT)
		if b.result != "active":
			break
	_check(b.result == "loss" and b.enemy.hits > 0, "Presenting the blind stern loses the same powered encounter")
	print("Stern-first encounter: %s %.2fs, hits %d:%d" % [b.result, b.elapsed, b.player.hits, b.enemy.hits])
	var a := Battle.new()
	b.start(d, d)
	a.start(d, d)
	b.set_flight_input(Vector2(0.3,0.4), -0.5)
	a.set_flight_input(Vector2(0.3,0.4), -0.5)
	b.step(4)
	for i in 480:
		a.step(1.0/120.0)
	_check(a.player.position == b.player.position and a.enemy.heading == b.enemy.heading and a.events == b.events, "Fixed tick flight and combat replay identically")
