extends RefCounted

const Special := preload("res://sim/special_propulsion.gd")
const EngineRoom := preload("res://sim/engine_room.gd")

## One grid unit is one world unit, +X forward and +Y starboard. Angles follow
## Godot's clockwise-positive convention on a screen. Input never sets a velocity.

static func mount_point(part: Dictionary, unrotated: Vector2) -> Vector2:
	var s: Vector2 = part.original_size
	var offset := unrotated
	match int(part.rotation):
		1: offset = Vector2(s.y - unrotated.y, unrotated.x)
		2: offset = s - unrotated
		3: offset = Vector2(unrotated.y, s.x - unrotated.x)
	return Vector2(part.cell) + offset


static func prepare_part(part: Dictionary, row: Dictionary) -> void:
	part.original_size = Vector2(row.size[0], row.size[1])
	var r = row.get("physical_rect")
	var rect := Rect2(Vector2.ZERO, part.original_size)
	if r is Array:
		rect = Rect2(r[0], r[1], r[2], r[3])
	var corner := mount_point(part, rect.position)
	part.hit_rect = Rect2(corner, mount_point(part, rect.end) - corner).abs()
	var density := float(row.density) if row.get("density") != null else 1.0
	part.mass = float(row.mass) if row.get("mass") != null else density * rect.get_area()
	part.activation = 0.0
	part.actual_force = 0.0
	part.actual_fuel_rate = 0.0
	part.nozzles = []
	part.force_local = Vector2.ZERO
	part.fuel_fraction = 0.0
	part.fuel_online = false
	if part.stats.has("special_propulsion"):
		Special.prepare(part)
	for spec in part.stats.get("nozzles", []):
		var radians: float = deg_to_rad(float(spec.rotation_deg)) + part.rotation * PI / 2.0 + PI
		var direction := Vector2.from_angle(radians).snapped(Vector2(0.000001, 0.000001))
		var nozzle := {
			"location_local": mount_point(part, Vector2(spec.location[0], spec.location[1])),
			"direction_local": direction, "activation": 0.0, "requested": 0.0,
			"spec": spec, "recovery": 0.0, "wrench": Vector3.ZERO
		}
		part.nozzles.append(nozzle)
	if not part.nozzles.is_empty():
		part.force_local = part.nozzles[0].direction_local
	if part.stats.has("turret_rotation_deg"):
		part.aim_status = "offline"
		part.rest_angle = deg_to_rad(part.stats.turret_rotation_deg) + part.rotation * PI / 2.0
		part.turret_angle_local = part.rest_angle
		var p: Array = part.stats.turret_location
		part.mount_local = mount_point(part, Vector2(p[0], p[1]))


static func deploy(ship: Dictionary, pos: Vector2, facing: float, rules: Dictionary) -> void:
	ship.physics = rules
	ship.position = pos
	ship.previous_position = pos
	ship.heading = facing
	ship.previous_heading = facing
	ship.center_of_mass = Vector2.ZERO
	ship.velocity = Vector2.ZERO
	ship.angular_velocity = 0.0
	ship.mass = 0.0
	ship.misses = 0
	refresh_mass(ship)


static func refresh_mass(ship: Dictionary) -> void:
	var total := 0.0
	var center := Vector2.ZERO
	for p in ship.parts.values():
		if p.hp > 0:
			total += p.mass
			center += p.hit_rect.get_center() * p.mass
	if total <= 0:
		return
	center /= total
	var inertia := 0.0
	var radius := 0.1
	for p in ship.parts.values():
		if p.hp <= 0:
			continue
		var rect: Rect2 = p.hit_rect
		var lever := center.distance_squared_to(rect.get_center())
		inertia += p.mass * (rect.size.length_squared() / 12.0 + lever)
		radius = maxf(radius, sqrt(lever) + 0.5 * rect.size.length())
	if ship.mass > 0:
		var offset: Vector2 = center - Vector2(ship.center_of_mass)
		var delta := offset.rotated(ship.heading)
		ship.position += delta
		ship.previous_position += offset.rotated(ship.previous_heading)
		ship.velocity += Vector2(-delta.y, delta.x) * float(ship.angular_velocity)
	ship.mass = total
	ship.inertia = maxf(0.001, inertia * ship.physics.rotational_inertia_factor)
	ship.center_of_mass = center
	ship.radius = radius


static func grid_world(ship: Dictionary, point: Vector2) -> Vector2:
	return Vector2(ship.position) + (point - Vector2(ship.center_of_mass)).rotated(ship.heading)


static func point_velocity(ship: Dictionary, world_point: Vector2) -> Vector2:
	var radius := world_point - Vector2(ship.position)
	return Vector2(ship.velocity) + Vector2(-radius.y, radius.x) * float(ship.angular_velocity)


static func advance(ship: Dictionary, move: Vector2, turn: float, dt: float) -> void:
	ship.previous_position = ship.position
	ship.previous_heading = ship.heading
	var active: Array = []
	var limits := Vector3.ZERO
	var input := Vector3(move.x, move.y, turn)
	for uid in ship.engines:
		var engine: Dictionary = ship.parts[uid]
		engine.overclocked = ship.overclock and ship.command and EngineRoom.linked(ship, engine)
		engine.boost_power_rate = 0.0
		if engine.id == Special.BOOST:
			Special.tick_boost(ship, engine, dt)
			if engine.boost_active:
				var data: Dictionary = engine.stats.special_propulsion
				engine.boost_power_rate = -float(data.boost_drain_quantity) / float(data.boost_drain_interval)
		elif engine.id == Special.ROCKET:
			Special.update_rocket(ship, engine)
		if engine.hp > 0 and engine.stats.has("production_quantity"):
			engine.clock += dt
			if engine.clock + 1e-7 >= engine.stats.production_interval:
				engine.clock = 0.0
				engine.energy = mini(engine.capacity, engine.energy + int(engine.stats.production_quantity))
		var available: int = engine.rocket_usable if engine.id == Special.ROCKET else engine.energy
		if available <= engine.stats.get("battery_toggle_off", 0):
			engine.fuel_online = false
		elif available >= engine.stats.get("battery_toggle_on", 1):
			engine.fuel_online = true
		if engine.id == Special.ROCKET and engine.staffed < int(engine.stats.special_propulsion.crew_required):
			engine.fuel_online = false
		for n in engine.nozzles:
			n.requested = 0.0
			if engine.hp <= 0 or not engine.fuel_online or not ship.command or engine.thermal_trip:
				n.activation = 0.0
				if engine.has("raw_activation"):
					engine.raw_activation = 0.0
					engine.raw_recovery = 0.0
				continue
			active.append(n)
			var mount_force: Vector2 = n.direction_local * n.spec.thrust_force
			if engine.overclocked:
				mount_force *= EngineRoom.FORCE_MULTIPLIER
			var arm: Vector2 = n.location_local - ship.center_of_mass
			n.wrench = Vector3(mount_force.x, mount_force.y, arm.cross(mount_force) / ship.radius)
			var w: Vector3 = n.wrench * float(n.spec.max_activation)
			for axis in 3:
				if signf(w[axis]) == signf(input[axis]):
					limits[axis] += absf(w[axis])
	# Bounded coordinate descent allocates physical nozzle amplitudes. This keeps
	# paired nozzles balanced without inventing translation or rotation forces.
	var residual := limits * input
	for pass_index in 6:
		for n in active:
			var w: Vector3 = n.wrench
			var previous: float = n.requested
			n.requested = clampf(previous + residual.dot(w) / maxf(0.001, w.length_squared()), 0.0, n.spec.max_activation)
			residual -= w * (float(n.requested) - previous)
	var force := Vector2.ZERO
	var torque := 0.0
	for uid in ship.engines:
		var engine: Dictionary = ship.parts[uid]
		if engine.id == Special.ROCKET:
			# A previous nozzle may just have drawn from a physical side pod
			# shared by both. Check the remaining live stage strength again.
			Special.update_rocket(ship, engine)
		engine.activation = 0.0
		var spent := 0.0
		var applied := Vector2.ZERO
		var moment := 0.0
		for n in engine.nozzles:
			if engine.hp <= 0 or not engine.fuel_online or not ship.command or engine.thermal_trip:
				continue
			if engine.has("raw_activation"):
				n.activation = Special.actuate(engine, n, dt)
			else:
				var ramp: float = n.spec.ramp_up if n.requested >= n.activation else n.spec.ramp_down
				var previous: float = n.activation
				n.recovery = maxf(0, n.recovery - dt)
				var demand: float = 0.0 if n.recovery > 0.0 else n.requested
				n.activation = move_toward(previous, demand, dt / ramp) if ramp > 0.0 else demand
				if previous > 0 and n.activation == 0:
					n.recovery = n.spec.recovery_time
			var f: Vector2 = n.direction_local * (n.spec.thrust_force * n.activation)
			applied += f
			moment += (Vector2(n.location_local) - Vector2(ship.center_of_mass)).cross(f)
			spent += n.spec.fuel_per_second * n.activation * dt
		if engine.overclocked:
			applied *= EngineRoom.FORCE_MULTIPLIER
			moment *= EngineRoom.FORCE_MULTIPLIER
			spent *= EngineRoom.POWER_MULTIPLIER
		var fuel: int = engine.rocket_usable if engine.id == Special.ROCKET else engine.energy
		var fraction := clampf((float(fuel) - float(engine.fuel_fraction)) / spent, 0, 1) if spent > 0.0 else 1.0
		engine.actual_force = applied.length() * fraction
		engine.actual_fuel_rate = spent * fraction / dt
		for n in engine.nozzles:
			n.activation *= fraction
			engine.activation = maxf(engine.activation, n.activation)
		var overclock_load: float = engine.activation if engine.overclocked else 0.0
		EngineRoom.apply_heat(engine, engine.actual_fuel_rate + engine.boost_power_rate, overclock_load, dt)
		spent = spent * fraction + float(engine.fuel_fraction)
		var units := floori(spent + 1e-8)
		if engine.id == Special.ROCKET and units > 0:
			Special.draw_rocket(ship, engine, units)
		else:
			engine.energy -= units
		engine.fuel_fraction = maxf(0.0, spent - units)
		if engine.id == Special.BOOST and engine.boost_active and engine.energy == 0:
			Special.set_boost(ship, engine, false)
		force += applied * fraction
		torque += moment * fraction
	var physics: Dictionary = ship.physics
	var v: Vector2 = ship.velocity + force.rotated(ship.heading) / float(ship.mass) * dt
	var speed := v.length()
	var drag := maxf(physics.linear_min_damping * speed, physics.linear_drag_coefficient * pow(speed, physics.linear_drag_exponent))
	ship.velocity = v.move_toward(Vector2.ZERO, drag * dt)
	var omega: float = (ship.angular_velocity + torque / ship.inertia * dt) * exp(-physics.angular_drag_coefficient * dt)
	ship.angular_velocity = clampf(omega, -physics.max_abs_angular_velocity, physics.max_abs_angular_velocity)
	ship.position += Vector2(ship.velocity) * dt
	ship.heading = wrapf(ship.heading + ship.angular_velocity * dt, -PI, PI)


static func ai_orders(ship: Dictionary, other: Dictionary, time: float, behavior: String = "balanced") -> Vector3:
	var delta: Vector2 = other.position - ship.position
	var forward := delta.normalized()
	var lateral := Vector2(-forward.y, forward.x)
	var preferred_range := 105.0
	var lateral_speed := 3.0
	match behavior:
		"pursuit":
			preferred_range = 65.0
			lateral_speed = 5.0
		"standoff":
			preferred_range = 180.0
			lateral_speed = 1.0
	var station := clampf((delta.length() - preferred_range) * 0.25, -12.0, 17.0)
	var patrol := lateral_speed * sin(time * 0.22)
	var desired := forward * station + lateral * patrol
	var move := ((desired - Vector2(ship.velocity)).rotated(-ship.heading) / 8.0).limit_length(1.0)
	var turn := clampf(angle_difference(ship.heading, forward.angle()) * 2.0 - ship.angular_velocity * 1.15, -0.7, 0.7)
	return Vector3(move.x, move.y, turn)


## One deepest module contact is resolved per tick. Hulls cannot phase through
## one another. This lab uses normal impulses without friction or impact damage.
static func resolve_contact(a: Dictionary, b: Dictionary) -> bool:
	if Vector2(a.position).distance_squared_to(b.position) >= pow(a.radius + b.radius, 2):
		return false
	var ax := Vector2.from_angle(a.heading)
	var ay := Vector2(-ax.y, ax.x)
	var bx := Vector2.from_angle(b.heading)
	var by := Vector2(-bx.y, bx.x)
	var normal := Vector2.ZERO
	var point := Vector2.ZERO
	var depth := 0.0
	for p in a.parts.values():
		if p.hp <= 0:
			continue
		var ar: Rect2 = p.hit_rect
		var ac := grid_world(a, ar.get_center())
		for q in b.parts.values():
			if q.hp <= 0:
				continue
			var br: Rect2 = q.hit_rect
			var bc := grid_world(b, br.get_center())
			var delta := bc - ac
			if delta.length_squared() > pow((ar.size.length() + br.size.length()) * 0.5, 2):
				continue
			var overlap := INF
			var axis_normal := Vector2.ZERO
			for axis: Vector2 in [ax, ay, bx, by]:
				var span_a := (absf(axis.dot(ax)) * ar.size.x + absf(axis.dot(ay)) * ar.size.y) * 0.5
				var span_b := (absf(axis.dot(bx)) * br.size.x + absf(axis.dot(by)) * br.size.y) * 0.5
				var separation := delta.dot(axis)
				var distance := span_a + span_b - absf(separation)
				if distance < overlap:
					overlap = distance
					axis_normal = axis if separation >= 0 else -axis
				if overlap <= 0:
					break
			if overlap > depth:
				depth = overlap
				normal = axis_normal
				point = (ac + bc) * 0.5
	if depth <= 0:
		return false
	var inv_a := 1.0 / float(a.mass)
	var inv_b := 1.0 / float(b.mass)
	var lever_a := (point - Vector2(a.position)).cross(normal)
	var lever_b := (point - Vector2(b.position)).cross(normal)
	var closing := (point_velocity(b, point) - point_velocity(a, point)).dot(normal)
	if closing < 0:
		var effective: float = inv_a + inv_b + lever_a * lever_a / a.inertia + lever_b * lever_b / b.inertia
		var impulse: float = -(1.0 + a.physics.restitution) * closing / effective
		a.velocity -= normal * impulse * inv_a
		b.velocity += normal * impulse * inv_b
		a.angular_velocity -= lever_a * impulse / a.inertia
		b.angular_velocity += lever_b * impulse / b.inertia
	var correction := normal * (depth / (inv_a + inv_b))
	a.position -= correction * inv_a
	b.position += correction * inv_b
	return true


## Aim at the first constant-velocity intercept, then servo within the mounted arc.
static func aim(ship: Dictionary, target_ship: Dictionary, gun: Dictionary, uid: int, dt: float) -> bool:
	var here := grid_world(ship, gun.mount_local)
	var target := grid_world(target_ship, target_ship.parts[uid].hit_rect.get_center())
	var delta := target - here
	var relative := point_velocity(target_ship, target) - point_velocity(ship, here)
	var speed: float = gun.stats.projectile_speed
	var a := relative.length_squared() - speed * speed
	var b := 2.0 * delta.dot(relative)
	var c := delta.length_squared()
	var time := -1.0
	var discriminant := b * b - 4.0 * a * c
	if absf(a) < 1e-6:
		if b < 0:
			time = -c / b
	elif discriminant >= 0:
		var t1 := (-b - sqrt(discriminant)) / (2.0 * a)
		var t2 := (-b + sqrt(discriminant)) / (2.0 * a)
		if t1 > 0: time = t1
		if t2 > 0 and (time < 0 or t2 < time): time = t2
	var desired := (delta + relative * maxf(0.0, time)).angle() - float(ship.heading)
	var half_arc := deg_to_rad(float(gun.stats.firing_arc_deg)) * 0.5
	var offset := angle_difference(gun.rest_angle, desired)
	var goal: float = gun.rest_angle + clampf(offset, -half_arc, half_arc)
	var current_offset := angle_difference(gun.rest_angle, gun.turret_angle_local)
	var wanted_offset := angle_difference(gun.rest_angle, goal)
	gun.turret_angle_local = gun.rest_angle + move_toward(current_offset, wanted_offset, deg_to_rad(gun.stats.rotate_speed_deg) * dt)
	if time < 0.0 or time * speed > gun.stats.range:
		gun.aim_status = "out_of_range"
	elif absf(offset) > half_arc:
		gun.aim_status = "out_of_arc"
	elif absf(angle_difference(desired, gun.turret_angle_local)) > deg_to_rad(gun.stats.fire_threshold_deg):
		gun.aim_status = "tracking"
	else:
		gun.aim_status = "ready"
	return gun.aim_status == "ready"


## Swept segment against moving module rectangles. Transform endpoints at both
## body poses, linearly approximating rotation within a 1/60 s physics step.
static func trace(ship: Dictionary, start: Vector2, end: Vector2) -> Dictionary:
	var center: Vector2 = ship.center_of_mass
	var a := (start - Vector2(ship.previous_position)).rotated(-ship.previous_heading) + center
	var b := (end - Vector2(ship.position)).rotated(-ship.heading) + center
	if a != b and Geometry2D.get_closest_point_to_segment(center, a, b).distance_to(center) > ship.radius + 0.02:
		return {}
	var best := 2.0
	var hit := -1
	for p in ship.parts.values():
		if p.hp <= 0:
			continue
		var t := _entry(a, b - a, p.hit_rect)
		if t >= 0.0 and t < best:
			hit = p.uid
			best = t
	if hit < 0:
		return {}
	return {"uid": hit, "t": best, "pos": start.lerp(end, best)}


static func _entry(a: Vector2, d: Vector2, rect: Rect2) -> float:
	var enter := 0.0
	var leave := 1.0
	for axis in 2:
		if absf(d[axis]) < 1e-8:
			if a[axis] < rect.position[axis] or a[axis] > rect.end[axis]:
				return -1.0
			continue
		var t1 := (rect.position[axis] - a[axis]) / d[axis]
		var t2 := (rect.end[axis] - a[axis]) / d[axis]
		enter = maxf(enter, minf(t1, t2))
		leave = minf(leave, maxf(t1, t2))
		if enter > leave:
			return -1.0
	return enter
