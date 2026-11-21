class_name ShipBody
extends RigidBody2D

const ShipModelScript = preload("res://scripts/ship_model.gd")
const BalanceData = preload("res://scripts/balance.gd")
const VisualData = preload("res://scripts/visual_tuning.gd")
const PhysicsData = preload("res://scripts/physics_tuning.gd")
const VoxelShipRendererScript = preload("res://scripts/voxel_ship_renderer.gd")

var model: ShipModel = ShipModelScript.new()
var shield_layers := 0
var shield_recharge_left := 0.0
var break_shake := 0.0
var break_shake_time := 0.0
var laser_cooldown := 0.0
var missile_cooldown := 0.0
var mini_missile_cooldown := 0.0
var heat := 0.0
var weapon_damage_bonus := 0.0
var cooling_bonus := 0.0
var missile_guidance_bonus := 0.0
var missile_range_multiplier := 1.0
var shield_layer_bonus := 0
var shield_recharge_reduction := 0.0
var turret_target := Vector2.ZERO
var is_player := true
var active_exhausts: Dictionary = {}
var exhaust_particles: Dictionary = {}
var hull_bound_radius := 0.0
var is_destroying := false
var hull_collider: CollisionShape2D
var cell_colliders: Array[CollisionShape2D] = []
var voxel_texture: Texture2D
var voxel_renderer: Node2D
var overdrive_active := false

# Cosmoteer 물리·시각 피드백 상태
var weapon_recoil: Dictionary = {}
var shield_arc_flash: Dictionary = {}
var last_hit_shield_absorbed := false
var last_damage_leftover := 0.0
var last_volatile_blasts: Array[Dictionary] = []

func _ready() -> void:
	gravity_scale = 0.0
	linear_damp_mode = RigidBody2D.DAMP_MODE_REPLACE
	angular_damp_mode = RigidBody2D.DAMP_MODE_REPLACE
	linear_damp = PhysicsData.ENGINE_LINEAR_DAMP
	angular_damp = PhysicsData.ENGINE_ANGULAR_DAMP
	physics_material_override = PhysicsData.dynamic_material(PhysicsData.SHIP_ASTEROID_BOUNCE)
	contact_monitor = true
	max_contacts_reported = 12
	add_collision_shape()
	if not VisualData.VOXEL_PART_TEXTURE_ATLAS.is_empty() and ResourceLoader.exists(VisualData.VOXEL_PART_TEXTURE_ATLAS, "Texture2D"):
		voxel_texture = load(VisualData.VOXEL_PART_TEXTURE_ATLAS) as Texture2D
	refresh_mass()

func initialize_player() -> void:
	model.initialize_player()
	shield_layers = model.shield_capacity()
	refresh_mass()
	rebuild_exhaust_particles()
	rebuild_voxel_renderer()
	queue_redraw()

func add_collision_shape() -> void:
	hull_collider = CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = PhysicsData.SHIP_COLLIDER_SIZE
	hull_collider.shape = shape
	add_child(hull_collider)
	cell_colliders.append(hull_collider)

func refresh_mass() -> void:
	mass = model.total_mass()
	center_of_mass_mode = RigidBody2D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = model.center_of_mass()
	var moment := 0.0
	for part in model.parts:
		var cell_mass := float(part.spec().mass) / float(part.cells().size())
		for cell in part.cells():
			moment += cell_mass * (BalanceData.CELL * BalanceData.CELL / 6.0 + (Vector2(cell) * BalanceData.CELL - center_of_mass).length_squared())
	inertia = maxf(moment, 1.0)
	hull_bound_radius = model.bound_radius()
	shield_layers = mini(shield_layers, shield_max_layers())
	refresh_collision_box()

func refresh_collision_box() -> void:
	if hull_collider == null:
		return
	var cells: Array = model.occupied().keys()
	while cell_colliders.size() < cells.size():
		var collider := CollisionShape2D.new()
		collider.shape = RectangleShape2D.new()
		add_child(collider)
		cell_colliders.append(collider)
	for index in cell_colliders.size():
		var collider := cell_colliders[index]
		collider.disabled = index >= cells.size()
		if index < cells.size():
			(collider.shape as RectangleShape2D).size = Vector2.ONE * BalanceData.CELL
			collider.position = Vector2(cells[index]) * BalanceData.CELL

func collision_box_rect() -> Rect2:
	return model.collision_box_rect()

func projectile_hit(from_world: Vector2, to_world: Vector2) -> Dictionary:
	var from := to_local(from_world)
	var to := to_local(to_world)
	if segment_box_fraction(from, to, collision_box_rect().grow(4.0)) == INF:
		return {}
	var best := INF
	var hit_part: PartData
	for part in model.parts:
		for cell in part.cells():
			var rect := Rect2(Vector2(cell) * BalanceData.CELL - Vector2.ONE * (BalanceData.CELL * 0.5 + 3.0), Vector2.ONE * (BalanceData.CELL + 6.0))
			var fraction := segment_box_fraction(from, to, rect)
			if fraction < best:
				best = fraction
				hit_part = part
	return {"part": hit_part, "fraction": best} if hit_part != null else {}

static func segment_box_fraction(from: Vector2, to: Vector2, rect: Rect2) -> float:
	var direction := to - from
	var enter := 0.0
	var leave := 1.0
	for axis in 2:
		if absf(direction[axis]) < 0.00001:
			if from[axis] < rect.position[axis] or from[axis] > rect.end[axis]: return INF
		else:
			var a := (rect.position[axis] - from[axis]) / direction[axis]
			var b := (rect.end[axis] - from[axis]) / direction[axis]
			enter = maxf(enter, minf(a, b))
			leave = minf(leave, maxf(a, b))
			if enter > leave: return INF
	return enter

func contains_world_collision_point(world_point: Vector2, padding: float = 0.0) -> bool:
	return collision_box_rect().grow(maxf(0.0, padding)).has_point(to_local(world_point))

func distance_squared_to_collision_box(world_point: Vector2) -> float:
	var rect := collision_box_rect()
	var local_point := to_local(world_point)
	var nearest := Vector2(
		clampf(local_point.x, rect.position.x, rect.end.x),
		clampf(local_point.y, rect.position.y, rect.end.y)
	)
	return local_point.distance_squared_to(nearest)

func refresh_part_tuning() -> void:
	for part in model.parts:
		var updated_hp := float(part.spec().get("hp", part.max_hp))
		if is_player and part.kind == "core":
			updated_hp = maxf(updated_hp, float(BalanceData.PLAYER.core_hp))
		part.max_hp = updated_hp
		part.hp = updated_hp
	refresh_mass()
	shield_layers = mini(shield_layers, shield_max_layers())
	rebuild_exhaust_particles()
	rebuild_voxel_renderer()

func rebuild_voxel_renderer() -> void:
	if not VisualData.USE_VOXEL_MESH_RENDERER:
		return
	if voxel_renderer == null:
		voxel_renderer = VoxelShipRendererScript.new()
		voxel_renderer.name = "VoxelShipRenderer"
		add_child(voxel_renderer)
	voxel_renderer.rebuild(model)

func is_within_surface_range(other: ShipBody, surface_range: float) -> bool:
	if other == null:
		return false
	var expanded_range := maxf(0.0, surface_range) + hull_bound_radius + other.hull_bound_radius
	return global_position.distance_squared_to(other.global_position) <= expanded_range * expanded_range

func _physics_process(delta: float) -> void:
	var pwr_eff: float = model.power_efficiency()
	laser_cooldown = maxf(0.0, laser_cooldown - delta * pwr_eff)
	missile_cooldown = maxf(0.0, missile_cooldown - delta * pwr_eff)
	mini_missile_cooldown = maxf(0.0, mini_missile_cooldown - delta * pwr_eff)
	var battery_count := float(model.parts.filter(func(part): return part.kind == "battery").size())
	heat = maxf(0.0, heat - delta * pwr_eff * (18.0 + (22.0 if overdrive_active else 0.0) + cooling_bonus + battery_count * 9.0))
	break_shake_time = maxf(0.0, break_shake_time - delta)
	if break_shake_time <= 0.0:
		break_shake = 0.0
	if shield_layers < shield_max_layers():
		shield_recharge_left -= delta * pwr_eff
		if shield_recharge_left <= 0.0:
			shield_layers += 1
			shield_recharge_left = maxf(float(BalanceData.SHIELD.min_recharge), float(BalanceData.SHIELD.base_recharge) - shield_recharge_reduction)
	for uid in weapon_recoil.keys():
		var next_rec: float = maxf(0.0, float(weapon_recoil[uid]) - delta * 5.8)
		if next_rec <= 0.001:
			weapon_recoil.erase(uid)
		else:
			weapon_recoil[uid] = next_rec
	for uid in shield_arc_flash.keys():
		var next_flash: float = maxf(0.0, float(shield_arc_flash[uid]) - delta * 4.2)
		if next_flash <= 0.001:
			shield_arc_flash.erase(uid)
		else:
			shield_arc_flash[uid] = next_flash
	queue_redraw()

func _integrate_forces(state: PhysicsDirectBodyState2D) -> void:
	var angular_retain := PhysicsData.PLAYER_ANGULAR_RETAIN_PER_SECOND if is_player else PhysicsData.NPC_ANGULAR_RETAIN_PER_SECOND
	PhysicsData.apply_reference_damping(state, PhysicsData.PLAYER_LINEAR_RETAIN_PER_SECOND, angular_retain)
	var speed_limit := max_linear_speed()
	if state.linear_velocity.length_squared() > speed_limit * speed_limit:
		state.linear_velocity = state.linear_velocity.normalized() * speed_limit
	state.angular_velocity = clampf(state.angular_velocity, -PhysicsData.MAX_ANGULAR_SPEED, PhysicsData.MAX_ANGULAR_SPEED)

func effective_module_thrust(part: PartData) -> float:
	var base := maxf(float(part.spec().get("force", 0.0)), 0.0)
	if model.is_exhaust_blocked(part):
		return base * PhysicsData.EXHAUST_BLOCKED_MULTIPLIER
	return base

func module_push_vector(part: PartData) -> Vector2:
	var actuator := str(part.spec().get("actuator", ""))
	if actuator == "forward":
		return module_thrust_axis(part)
	if actuator == "reverse":
		return -module_thrust_axis(part)
	return Vector2.ZERO

func apply_player_thrusters(forward: float, reverse: float, turn: float, strafe: float = 0.0) -> void:
	if is_destroying:
		active_exhausts.clear()
		sync_exhaust_particles()
		return
	active_exhausts.clear()
	if absf(forward) < 0.01 and absf(reverse) < 0.01 and absf(turn) < 0.01 and absf(strafe) < 0.01:
		apply_neutral_braking()
		sync_exhaust_particles()
		return
	if absf(turn) < 0.01:
		apply_neutral_angular_braking()
	var boost := 1.45 if overdrive_active else 1.0

	# 1. 전후진 주/역추진기 (실제 장착 방향 기준 + 배기 간섭 반영 + CoM 토크 밸런싱)
	var fwd_drives: Array = []
	var rev_drives: Array = []
	var side_drives: Array = []
	for part in model.parts:
		if part.hp <= 0.0:
			continue
		var push := module_push_vector(part)
		if push.length_squared() < 0.01:
			continue
		if push.x > 0.5:
			fwd_drives.append(part)
		elif push.x < -0.5:
			rev_drives.append(part)
		elif absf(push.y) > 0.5:
			side_drives.append(part)

	if forward > 0.01 and not fwd_drives.is_empty():
		var forward_multipliers := balanced_linear_multipliers(fwd_drives)
		for part in fwd_drives:
			apply_module_force(part, module_push_vector(part) * effective_module_thrust(part) * forward * boost * float(forward_multipliers.get(part.uid, 1.0)))
	if reverse > 0.01 and not rev_drives.is_empty():
		var reverse_multipliers := balanced_linear_multipliers(rev_drives)
		for part in rev_drives:
			apply_module_force(part, module_push_vector(part) * effective_module_thrust(part) * reverse * boost * float(reverse_multipliers.get(part.uid, 1.0)))

	# 2. Q/E 수동 횡추진 (측면 장착 추진기 + 반대편 3노즐 RCS 협업 분사)
	if absf(strafe) > 0.01:
		var want_sign := signf(strafe)
		var mag := absf(strafe) * boost
		for part in side_drives:
			var push := module_push_vector(part)
			if push.y * want_sign > 0.25:
				apply_module_force(part, push * effective_module_thrust(part) * mag)
		for part in parts_with_actuator("turn"):
			var rcs_nom := effective_module_thrust(part)
			var best_dir := Vector2.ZERO
			var best_align := 0.15
			for jet_force in rcs_thrust_directions(part):
				var align: float = jet_force.y * want_sign
				if align > best_align:
					best_align = align
					best_dir = jet_force
			if best_dir.length_squared() > 0.01:
				apply_module_force_additive(part, best_dir * rcs_nom * mag)

	# 3. A/D 회전 RCS
	if absf(turn) > 0.01:
		for part in parts_with_actuator("turn"):
			var rcs_force := rcs_force_direction(part)
			if rcs_force.length() > 0.01:
				apply_module_force_additive(part, rcs_force * effective_module_thrust(part) * turn)

	sync_exhaust_particles()

func apply_tracking_thrusters(desired_world_velocity: Vector2, facing_direction: Vector2) -> void:
	active_exhausts.clear()
	if is_destroying or not desired_world_velocity.is_finite() or not facing_direction.is_finite():
		sync_exhaust_particles()
		return
	var desired_velocity := desired_world_velocity.limit_length(max_linear_speed())
	var damping_rate := -log(PhysicsData.PLAYER_LINEAR_RETAIN_PER_SECOND)
	var desired_force := mass * ((desired_velocity - linear_velocity) * PhysicsData.TRACKING_VELOCITY_GAIN + desired_velocity * damping_rate)
	desired_force = desired_force.rotated(-rotation)
	var facing_error := 0.0
	if facing_direction.length_squared() > 0.0001:
		facing_error = wrapf(facing_direction.angle() - rotation, -PI, PI)
	var desired_torque := inertia * (facing_error * PhysicsData.TRACKING_FACING_GAIN - angular_velocity * PhysicsData.TRACKING_ANGULAR_DAMP_GAIN)
	var torque_scale := PhysicsData.TRACKING_TORQUE_WEIGHT / maxf(hull_bound_radius, BalanceData.CELL)
	var residual := Vector3(desired_force.x, desired_force.y, desired_torque * torque_scale)
	var actuators: Array[Dictionary] = []
	var module_throttles := {}
	for part in model.parts:
		if part.hp <= 0.0:
			continue
		var actuator := str(part.spec().get("actuator", ""))
		var nominal := effective_module_thrust(part)
		var axes: Array[Vector2] = []
		match actuator:
			"forward": axes.append(module_thrust_axis(part))
			"reverse": axes.append(-module_thrust_axis(part))
			"turn": axes = rcs_thrust_directions(part)
		if nominal <= 0.0:
			continue
		module_throttles[part.uid] = 0.0
		for axis in axes:
			if axis.length_squared() < 0.0001:
				continue
			var force := axis * nominal
			var torque := (module_local_center(part) - center_of_mass).cross(force)
			actuators.append({"part": part, "force": force, "wrench": Vector3(force.x, force.y, torque * torque_scale), "throttle": 0.0})
	for iteration in PhysicsData.TRACKING_ALLOCATION_ITERATIONS:
		for step in actuators.size():
			var index := step if iteration % 2 == 0 else actuators.size() - 1 - step
			var actuator: Dictionary = actuators[index]
			var wrench: Vector3 = actuator.wrench
			var previous: float = actuator.throttle
			var norm := wrench.length_squared()
			var regularization := norm * PhysicsData.TRACKING_ALLOCATION_REGULARIZATION
			var uid: int = actuator.part.uid
			var available := clampf(1.0 - float(module_throttles[uid]) + previous, 0.0, 1.0)
			var throttle := clampf(previous + (wrench.dot(residual) - regularization * previous) / maxf(norm + regularization, 0.001), 0.0, available)
			residual -= wrench * (throttle - previous)
			module_throttles[uid] = float(module_throttles[uid]) + throttle - previous
			actuator.throttle = throttle
	var module_forces := {}
	var module_jets := {}
	for actuator in actuators:
		var uid: int = actuator.part.uid
		module_forces[uid] = Vector2(module_forces.get(uid, Vector2.ZERO)) + actuator.force * float(actuator.throttle)
		if not module_jets.has(uid):
			module_jets[uid] = []
		if float(actuator.throttle) > 0.00001:
			module_jets[uid].append({"direction": -Vector2(actuator.force).normalized(), "intensity": float(actuator.throttle)})
	for part in model.parts:
		if not module_forces.has(part.uid):
			continue
		apply_module_force(part, module_forces[part.uid])
		if active_exhausts.has(part.uid):
			active_exhausts[part.uid]["jets"] = module_jets[part.uid]
	sync_exhaust_particles()

func apply_neutral_braking() -> void:
	var local_velocity := linear_velocity.rotated(-rotation)
	var brake_speed := float(PhysicsData.NEUTRAL_BRAKE_SPEED)
	if local_velocity.x > 0.01:
		var reverse_input := clampf(local_velocity.x / brake_speed, 0.0, 1.0)
		var drives: Array = model.parts.filter(func(p): return p.hp > 0.0 and module_push_vector(p).x < -0.5)
		var multipliers := balanced_linear_multipliers(drives)
		for part in drives:
			apply_module_force(part, module_push_vector(part) * effective_module_thrust(part) * reverse_input * float(multipliers.get(part.uid, 1.0)))
	elif local_velocity.x < -0.01:
		var forward_input := clampf(-local_velocity.x / brake_speed, 0.0, 1.0)
		var drives: Array = model.parts.filter(func(p): return p.hp > 0.0 and module_push_vector(p).x > 0.5)
		var multipliers := balanced_linear_multipliers(drives)
		for part in drives:
			apply_module_force(part, module_push_vector(part) * effective_module_thrust(part) * forward_input * float(multipliers.get(part.uid, 1.0)))
	# 횡방향 드리프트 자동 감쇠 (실제 장착된 측면 RCS 노즐만 사용)
	if absf(local_velocity.y) > 2.5:
		var lat_brake := clampf(absf(local_velocity.y) / brake_speed, 0.0, 0.85)
		var oppose_sign := -signf(local_velocity.y)
		for part in parts_with_actuator("turn"):
			for jet_force in rcs_thrust_directions(part):
				if jet_force.y * oppose_sign > 0.25:
					apply_module_force_additive(part, jet_force * effective_module_thrust(part) * lat_brake * 0.65)
					break
	apply_neutral_angular_braking()

func apply_neutral_angular_braking() -> void:
	var drives := parts_with_actuator("turn")
	var desired_torque := -angular_velocity * inertia * PhysicsData.NEUTRAL_ANGULAR_DECAY_GAIN
	var torque_capacity := 0.0
	for part in drives:
		torque_capacity += absf((module_local_center(part) - center_of_mass).cross(rcs_force_direction(part) * effective_module_thrust(part)))
	var turn_input := clampf(desired_torque / maxf(torque_capacity, 0.001), -1.0, 1.0)
	if not is_player:
		turn_input = clampf(-angular_velocity / PhysicsData.NEUTRAL_ANGULAR_BRAKE_FULL_SPEED, -1.0, 1.0)
	for part in drives:
		var force := rcs_force_direction(part) * effective_module_thrust(part)
		var torque := (module_local_center(part) - center_of_mass).cross(force)
		apply_module_force_additive(part, force * turn_input * signf(torque))

func parts_with_actuator(actuator: String) -> Array:
	return model.parts.filter(func(part): return part.hp > 0.0 and part.spec().get("actuator", "") == actuator)

func module_local_center(part: PartData) -> Vector2:
	var sum := Vector2.ZERO
	var cells := part.cells()
	for cell in cells:
		sum += Vector2(cell) * BalanceData.CELL
	return sum / maxf(float(cells.size()), 1.0)

func module_thrust_axis(part: PartData) -> Vector2:
	return Vector2.RIGHT.rotated(float(part.quarter_turn) * PI * 0.5)

func rcs_force_direction(part: PartData) -> Vector2:
	var center := module_local_center(part)
	if center.length_squared() <= 0.0001:
		return Vector2.ZERO
	return Vector2(-center.y, center.x).normalized()

func rcs_thrust_directions(part: PartData) -> Array[Vector2]:
	var tangent := rcs_force_direction(part)
	if tangent.length_squared() < 0.0001:
		return []
	return [tangent, -tangent, -module_local_center(part).normalized()]

func balanced_linear_multipliers(drives: Array) -> Dictionary:
	var result := {}
	if drives.is_empty():
		return result
	var com := model.center_of_mass()
	var torque_coefficients: Array[float] = []
	for part in drives:
		var lever_arm := module_local_center(part) - com
		var push := module_push_vector(part)
		if push.length_squared() < 0.01:
			push = module_thrust_axis(part)
		torque_coefficients.append(lever_arm.cross(push) * effective_module_thrust(part))
	var denominator := 0.0
	var total := 0.0
	for coefficient in torque_coefficients:
		denominator += coefficient * coefficient
		total += coefficient
	if denominator < 0.001:
		for part in drives: result[part.uid] = 1.0
		return result
	var correction := total / denominator
	var raw: Array[float] = []
	for coefficient in torque_coefficients:
		raw.append(clampf(1.0 - correction * coefficient, PhysicsData.FORWARD_THROTTLE_MIN, PhysicsData.FORWARD_THROTTLE_MAX))
	var raw_total := 0.0
	for value in raw:
		raw_total += value
	var normalizer: float = float(raw.size()) / maxf(raw_total, 0.001)
	for index in drives.size():
		result[drives[index].uid] = raw[index] * normalizer
	return result

func apply_module_force(part: PartData, local_force: Vector2, emit_effect: bool = true) -> void:
	if local_force.length() <= 0.01:
		return
	var world_force := local_force.rotated(rotation)
	apply_force(world_force, module_force_offset(part).rotated(rotation))
	if not emit_effect:
		return
	var nominal_force := maxf(float(part.spec().get("force", 1.0)), 0.001)
	var intensity := clampf(local_force.length() / nominal_force, 0.0, 1.0)
	var exhaust_dir := -local_force.normalized()
	active_exhausts[part.uid] = {
		"direction": exhaust_dir,
		"intensity": intensity,
		"jets": [{"direction": exhaust_dir, "intensity": intensity}],
	}

func apply_module_force_additive(part: PartData, local_force: Vector2) -> void:
	if local_force.length() <= 0.01:
		return
	var world_force := local_force.rotated(rotation)
	apply_force(world_force, module_force_offset(part).rotated(rotation))
	var nominal_force := maxf(float(part.spec().get("force", 1.0)), 0.001)
	var jet_intensity := clampf(local_force.length() / nominal_force, 0.0, 1.0)
	var exhaust_dir := -local_force.normalized()
	var existing: Dictionary = active_exhausts.get(part.uid, {})
	var jets: Array = existing.get("jets", []).duplicate()
	jets.append({"direction": exhaust_dir, "intensity": jet_intensity})
	var best_intensity := maxf(float(existing.get("intensity", 0.0)), jet_intensity)
	active_exhausts[part.uid] = {
		"direction": exhaust_dir,
		"intensity": best_intensity,
		"jets": jets,
	}

func rebuild_exhaust_particles() -> void:
	for entry in exhaust_particles.values():
		for nozzle in entry.get("nozzles", [entry]):
			if is_instance_valid(nozzle.fire):
				nozzle.fire.queue_free()
			if is_instance_valid(nozzle.smoke):
				nozzle.smoke.queue_free()
	exhaust_particles.clear()
	for part in model.parts:
		if part.spec().get("actuator", "") == "":
			continue
		var nozzles: Array[Dictionary] = []
		var count := 3 if part.spec().get("actuator", "") == "turn" else 1
		for index in count:
			var fire := make_exhaust_particles(false)
			var smoke := make_exhaust_particles(true)
			fire.position = module_local_center(part)
			smoke.position = fire.position
			add_child(fire)
			add_child(smoke)
			nozzles.append({"fire": fire, "smoke": smoke, "base_position": fire.position, "effect_visible": false, "effect_tier": 0})
		var entry: Dictionary = nozzles[0].duplicate()
		entry["nozzles"] = nozzles
		exhaust_particles[part.uid] = entry

func make_exhaust_particles(smoke: bool) -> CPUParticles2D:
	var particles := CPUParticles2D.new()
	particles.name = "SmokeParticles" if smoke else "FlameParticles"
	particles.amount = VisualData.THRUSTER_SMOKE_AMOUNT if smoke else VisualData.THRUSTER_FLAME_AMOUNT
	particles.lifetime = 0.56 if smoke else 0.22
	particles.preprocess = particles.lifetime
	particles.local_coords = true
	particles.emitting = false
	particles.z_index = 0 if smoke else 1
	particles.texture = particle_texture(smoke)
	particles.direction = Vector2.LEFT
	particles.spread = 15.0 if smoke else 8.0
	particles.gravity = Vector2.ZERO
	particles.initial_velocity_min = 34.0 if smoke else 120.0
	particles.initial_velocity_max = 72.0 if smoke else 195.0
	particles.scale_amount_min = 0.16 if smoke else 0.22
	particles.scale_amount_max = 0.38 if smoke else 0.48
	particles.damping_min = 12.0 if smoke else 4.0
	particles.damping_max = 28.0 if smoke else 12.0
	return particles

func particle_texture(smoke: bool) -> Texture2D:
	var path := VisualData.THRUSTER_SMOKE_TEXTURE if smoke else VisualData.THRUSTER_FLAME_TEXTURE
	if ResourceLoader.exists(path, "Texture2D"):
		var imported := load(path) as Texture2D
		if imported != null:
			return imported
	var image := Image.create(32, 32, false, Image.FORMAT_RGBA8)
	var center := Vector2(15.5, 15.5)
	for y in range(32):
		for x in range(32):
			var distance := center.distance_to(Vector2(x, y)) / 16.0
			var alpha := clampf(1.0 - distance, 0.0, 1.0) * (0.40 if smoke else 0.88)
			var color := Color("8aa0b2", alpha) if smoke else Color("58eaff", alpha)
			image.set_pixel(x, y, color)
	return ImageTexture.create_from_image(image)

func sync_exhaust_particles() -> void:
	for uid in exhaust_particles:
		var entry: Dictionary = exhaust_particles[uid]
		var exhaust: Dictionary = active_exhausts.get(uid, {})
		var jets: Array = exhaust.get("jets", [exhaust] if not exhaust.is_empty() else [])
		var nozzles: Array = entry.get("nozzles", [entry])
		for index in nozzles.size():
			var jet: Dictionary = jets[index] if index < jets.size() else {}
			sync_exhaust_nozzle(nozzles[index], jet)
		entry.effect_visible = false
		entry.effect_tier = 0
		for nozzle in nozzles:
			entry.effect_visible = entry.effect_visible or nozzle.effect_visible
			entry.effect_tier = maxi(int(entry.effect_tier), int(nozzle.effect_tier))
		exhaust_particles[uid] = entry

func sync_exhaust_nozzle(entry: Dictionary, exhaust: Dictionary) -> void:
	var direction: Vector2 = exhaust.get("direction", Vector2.LEFT)
	var tier := exhaust_effect_tier(float(exhaust.get("intensity", 0.0)))
	var is_vis := tier > 0
	var was_visible := bool(entry.get("effect_visible", false))
	for particle in [entry.fire, entry.smoke]:
		if was_visible and not is_vis:
			particle.restart()
		particle.visible = is_vis
		particle.emitting = is_vis
		if is_vis:
			particle.direction = direction
			particle.position = entry.base_position + direction * VisualData.THRUSTER_NOZZLE_OFFSET
			configure_exhaust_particle(particle, particle == entry.smoke, tier)
		else:
			particle.position = entry.base_position
	entry.effect_visible = is_vis
	entry.effect_tier = tier

func exhaust_effect_tier(intensity: float) -> int:
	if intensity < float(VisualData.THRUSTER_EFFECT_MIN_INTENSITY):
		return 0
	for index in VisualData.THRUSTER_EFFECT_TIER_CUTOFFS.size():
		if intensity < float(VisualData.THRUSTER_EFFECT_TIER_CUTOFFS[index]):
			return index + 1
	return VisualData.THRUSTER_EFFECT_TIER_CUTOFFS.size() + 1

func configure_exhaust_particle(particle: CPUParticles2D, smoke: bool, tier: int) -> void:
	if int(particle.get_meta("effect_tier", -1)) == tier:
		return
	var amount := int(VisualData.THRUSTER_EFFECT_SMOKE_AMOUNT[tier] if smoke else VisualData.THRUSTER_EFFECT_FIRE_AMOUNT[tier])
	var speed_scale := float(VisualData.THRUSTER_EFFECT_SPEED_SCALE[tier])
	var size_scale := float(VisualData.THRUSTER_EFFECT_SIZE_SCALE[tier])
	particle.amount = maxi(amount, 1)
	particle.initial_velocity_min = (32.0 if smoke else 110.0) * speed_scale
	particle.initial_velocity_max = (68.0 if smoke else 180.0) * speed_scale
	particle.scale_amount_min = (0.18 if smoke else 0.22) * size_scale
	particle.scale_amount_max = (0.42 if smoke else 0.48) * size_scale
	particle.modulate = Color(1.0, 1.0, 1.0, float(VisualData.THRUSTER_EFFECT_ALPHA[tier]))
	particle.set_meta("effect_tier", tier)

func module_force_offset(part: PartData) -> Vector2:
	return module_local_center(part)

func actuator_force(kind: String) -> float:
	var force := 0.0
	for part in model.parts:
		if part.spec().get("actuator", "") == kind:
			force += effective_module_thrust(part)
	return force

func max_linear_speed() -> float:
	var thrust_to_mass := (actuator_force("forward") + actuator_force("reverse")) / maxf(mass, 0.1)
	return maxf(float(PhysicsData.MAX_LINEAR_SPEED_MIN), float(PhysicsData.MAX_LINEAR_SPEED_BASE) * thrust_to_mass / float(PhysicsData.MAX_SPEED_REFERENCE_THRUST_PER_MASS))

func _apply_weapon_recoil(part: PartData, shot_dir: Vector2, weapon_kind: String) -> void:
	weapon_recoil[part.uid] = 1.0
	var mag: float = float(PhysicsData.WEAPON_RECOIL_IMPULSE.get(weapon_kind, 14.0))
	var dir := shot_dir.normalized() if shot_dir.length_squared() > 0.0001 else Vector2.RIGHT.rotated(rotation)
	apply_impulse(-dir * mag, module_force_offset(part).rotated(rotation))

func fire_primary_weapons(target: Vector2) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if laser_cooldown > 0.0 or heat > 100.0:
		return result
	var lasers: Array = []
	var ballistics: Array = []
	for part in model.parts:
		if part.kind == "laser":
			lasers.append(part)
		elif part.kind == "machine_gun" or part.kind == "railgun":
			ballistics.append(part)
	if lasers.is_empty() and ballistics.is_empty():
		return result
	laser_cooldown = float(BalanceData.WEAPONS.laser.cooldown) * (0.58 if overdrive_active else 1.0)
	heat += (float(BalanceData.WEAPONS.laser.heat) + float(lasers.size()) * 3.0) * (0.65 if overdrive_active else 1.0)
	turret_target = target
	for part in lasers:
		var source := to_global(module_local_center(part))
		var shot_dir := source.direction_to(target) if source.distance_squared_to(target) > 1.0 else Vector2.RIGHT.rotated(rotation)
		_apply_weapon_recoil(part, shot_dir, "laser")
		result.append({"position": source, "velocity": linear_velocity + shot_dir * float(BalanceData.WEAPONS.laser.speed), "damage": float(BalanceData.WEAPONS.laser.damage), "color": Color("ff92e8"), "team": "player" if is_player else "enemy", "kind": "laser", "life": float(BalanceData.WEAPONS.laser.life)})
	for part in ballistics:
		var tuning: Dictionary = BalanceData.WEAPONS[part.kind]
		if not model.consume_ammo("bullet", int(tuning.ammo_cost)):
			continue
		var source := to_global(module_local_center(part))
		var shot_dir := source.direction_to(target) if source.distance_squared_to(target) > 1.0 else Vector2.RIGHT.rotated(rotation)
		_apply_weapon_recoil(part, shot_dir, part.kind)
		result.append({"position": source, "velocity": linear_velocity + shot_dir * float(tuning.speed), "damage": float(tuning.damage), "color": Color("d6b3ff") if part.kind == "railgun" else Color("b9d8ff"), "team": "player" if is_player else "enemy", "kind": part.kind, "life": float(tuning.life)})
	return result

func fire_missile(target: Vector2) -> Dictionary:
	if missile_cooldown > 0.0 or not has_part("missile_launcher") or not model.consume_ammo("missile", int(BalanceData.WEAPONS.missile.ammo_cost)):
		return {}
	missile_cooldown = float(BalanceData.WEAPONS.missile.cooldown)
	var launcher_part: PartData = null
	for p in model.parts:
		if p.kind == "missile_launcher":
			launcher_part = p
			break
	var source := to_global(module_local_center(launcher_part)) if launcher_part != null else global_position
	var shot_dir := source.direction_to(target) if source.distance_squared_to(target) > 1.0 else Vector2.RIGHT.rotated(rotation)
	if launcher_part != null:
		_apply_weapon_recoil(launcher_part, shot_dir, "missile")
	return {"position": source, "velocity": linear_velocity + shot_dir * float(BalanceData.WEAPONS.missile.speed), "damage": float(BalanceData.WEAPONS.missile.damage), "color": Color("ffbd78"), "guided": true, "target": target, "team": "player" if is_player else "enemy", "kind": "missile", "life": float(BalanceData.WEAPONS.missile.life)}

func fire_auto_mini_missiles(target: Vector2) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if mini_missile_cooldown > 0.0:
		return result
	for part in model.parts:
		if part.kind != "mini_missile_launcher" or not model.consume_ammo("missile", int(BalanceData.WEAPONS.mini_missile.ammo_cost)):
			continue
		var source := to_global(module_local_center(part))
		var shot_dir := source.direction_to(target) if source.distance_squared_to(target) > 1.0 else Vector2.RIGHT.rotated(rotation)
		_apply_weapon_recoil(part, shot_dir, "mini_missile")
		result.append({"position": source, "velocity": linear_velocity + shot_dir * float(BalanceData.WEAPONS.mini_missile.speed), "damage": float(BalanceData.WEAPONS.mini_missile.damage), "color": Color("d7ed8e"), "team": "player" if is_player else "enemy", "kind": "mini_missile", "guided": true, "target": target, "life": float(BalanceData.WEAPONS.mini_missile.lock_seconds) + float(BalanceData.WEAPONS.mini_missile.range) / float(BalanceData.WEAPONS.mini_missile.speed)})
	if not result.is_empty():
		mini_missile_cooldown = float(BalanceData.WEAPONS.mini_missile.cooldown)
	return result

func has_part(kind: String) -> bool:
	for part in model.parts:
		if part.kind == kind:
			return true
	return false

func shield_max_layers() -> int:
	var base := model.shield_capacity()
	return mini(int(BalanceData.SHIELD.max_layers), base + shield_layer_bonus) if base > 0 else 0

func repair_all() -> void:
	for part in model.parts:
		part.hp = part.max_hp
	shield_layers = shield_max_layers()
	shield_recharge_left = 0.0

func is_angle_shielded(local_angle: float) -> bool:
	if shield_layers <= 0:
		return false
	for part in model.parts:
		if part.kind != "shield_generator" or part.hp <= 0.0:
			continue
		var gen_angle: float = float(part.quarter_turn) * PI * 0.5
		if absf(wrapf(local_angle - gen_angle, -PI, PI)) <= PhysicsData.SHIELD_ARC_HALF_ANGLE:
			return true
	return false

func try_absorb_directional_shield(impact_world: Vector2, hit_velocity: Vector2 = Vector2.ZERO) -> bool:
	if shield_layers <= 0:
		return false
	var local_hit := to_local(impact_world)
	var hit_angle := 0.0
	if local_hit.length_squared() > 4.0:
		hit_angle = local_hit.angle()
	elif hit_velocity.length_squared() > 0.01:
		hit_angle = (-hit_velocity.rotated(-rotation)).angle()
	for part in model.parts:
		if part.kind != "shield_generator" or part.hp <= 0.0:
			continue
		var gen_angle: float = float(part.quarter_turn) * PI * 0.5
		if absf(wrapf(hit_angle - gen_angle, -PI, PI)) <= PhysicsData.SHIELD_ARC_HALF_ANGLE:
			shield_layers -= 1
			shield_recharge_left = maxf(float(BalanceData.SHIELD.min_recharge), float(BalanceData.SHIELD.base_recharge) - shield_recharge_reduction)
			shield_arc_flash[part.uid] = 1.0
			queue_redraw()
			return true
	return false

func pop_volatile_blasts() -> Array[Dictionary]:
	var out: Array[Dictionary] = last_volatile_blasts.duplicate(true)
	last_volatile_blasts.clear()
	return out

func damage_part(part: PartData, damage: float, hit_velocity: Vector2 = Vector2.ZERO, impact_world: Variant = null, bypass_shield: bool = false, impact_impulse_override: float = -1.0, _chain_depth: int = 0) -> Array[PartData]:
	last_hit_shield_absorbed = false
	last_damage_leftover = 0.0
	if part == null or model.part_by_uid(part.uid) == null:
		return []
	var world_pt: Vector2 = impact_world if impact_world is Vector2 else to_global(module_local_center(part))
	var impulse_mag: float = impact_impulse_override if impact_impulse_override >= 0.0 else clampf(damage * 2.8, 10.0, 150.0)

	if not bypass_shield and try_absorb_directional_shield(world_pt, hit_velocity):
		last_hit_shield_absorbed = true
		if hit_velocity.length_squared() > 0.01 and impulse_mag > 0.0:
			apply_impulse(hit_velocity.normalized() * impulse_mag * 0.45, (world_pt - global_position))
		return []

	if hit_velocity.length_squared() > 0.01 and impulse_mag > 0.0:
		apply_impulse(hit_velocity.normalized() * impulse_mag, (world_pt - global_position))

	var pre_hp: float = part.hp
	part.hp -= damage
	if part.hp > 0.0:
		queue_redraw()
		return []

	if part.kind != "core" and damage > pre_hp:
		last_damage_leftover = (damage - pre_hp) * 0.85

	if part.kind == "core":
		part.hp = 0.0
		break_shake = VisualData.STRUCTURE_BREAK_SHAKE
		break_shake_time = 0.16
		queue_redraw()
		return []

	var removed := model.remove(part.uid)
	if removed == null:
		return []
	break_shake = VisualData.WEAPON_BREAK_SHAKE if removed.kind in ["laser", "missile_launcher", "mini_missile_launcher", "machine_gun", "railgun"] else VisualData.STRUCTURE_BREAK_SHAKE
	break_shake_time = 0.18
	var all_detached: Array[PartData] = model.detach_disconnected()

	# Cosmoteer 스타일 휘발성 모듈(탄약고·배터리) 내부 유폭 연쇄 피해
	if _chain_depth < 2 and PhysicsData.VOLATILE_EXPLOSION_DAMAGE.has(removed.kind):
		var base_blast: float = float(PhysicsData.VOLATILE_EXPLOSION_DAMAGE[removed.kind])
		var fill_scale := 1.0
		if removed.capacity > 0:
			fill_scale = 0.5 + 0.5 * clampf(float(removed.ammo) / maxf(float(removed.capacity), 1.0), 0.0, 1.0)
		var blast_dmg: float = base_blast * fill_scale
		last_volatile_blasts.append({
			"world_pos": to_global(module_local_center(removed)),
			"kind": removed.kind,
			"damage": blast_dmg,
		})
		var neighbor_uids := {}
		for r_cell in removed.cells():
			for axis in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
				var adj := model.part_at(r_cell + axis)
				if adj != null and adj.uid != removed.uid:
					neighbor_uids[adj.uid] = adj
		for n_uid in neighbor_uids.keys():
			var n_part: PartData = model.part_by_uid(int(n_uid))
			if n_part != null:
				var extra_detached := damage_part(n_part, blast_dmg, Vector2.ZERO, to_global(module_local_center(n_part)), true, 0.0, _chain_depth + 1)
				for item in extra_detached:
					all_detached.append(item)

	refresh_mass()
	rebuild_exhaust_particles()
	rebuild_voxel_renderer()
	queue_redraw()
	return all_detached

func begin_destruction() -> void:
	if is_destroying:
		return
	is_destroying = true
	active_exhausts.clear()
	sync_exhaust_particles()
	collision_layer = 0
	collision_mask = 0

func local_cell_at(world_point: Vector2) -> Vector2i:
	var local := to_local(world_point)
	return Vector2i(roundi(local.x / BalanceData.CELL), roundi(local.y / BalanceData.CELL))

# ==============================================================================
# Cosmoteer Architectural Cutaway & Unified Starship Hull Renderer
# ==============================================================================

func _draw() -> void:
	var hull_cells: Dictionary = model.occupied()
	var shake := Vector2.ZERO
	if break_shake_time > 0.0:
		shake = Vector2(sin(Time.get_ticks_msec() * 0.11), cos(Time.get_ticks_msec() * 0.16)) * break_shake
	if is_instance_valid(voxel_renderer):
		voxel_renderer.position = shake
	if overdrive_active:
		var pulse := 0.5 + 0.5 * sin(Time.get_ticks_msec() * 0.014)
		draw_arc(shake, hull_bound_radius + 7.0, 0.0, TAU, 40, Color(1.0, 0.82, 0.32, 0.34 + 0.22 * pulse), 2.8, true)

	if not VisualData.USE_VOXEL_MESH_RENDERER:
		_draw_cosmoteer_ship(shake, hull_cells)

	if not VisualData.use_textured_design:
		for part in model.parts:
			var center := module_local_center(part) + shake
			draw_set_transform(center, VisualData.module_label_rotation(self))
			draw_rect(Rect2(Vector2(-21, -10), Vector2(42, 20)), Color("071221", 0.90), true)
			draw_string(ThemeDB.fallback_font, Vector2(-20, 4), VisualData.module_debug_label(part.kind), HORIZONTAL_ALIGNMENT_CENTER, 40, 10, Color.WHITE)
			var fraction := clampf(part.hp / maxf(part.max_hp, 0.001), 0.0, 1.0)
			draw_rect(Rect2(Vector2(-16, 12), Vector2(32 * fraction, 3)), Color("82e7c6") if fraction > 0.5 else Color("ff927d"), true)
			draw_set_transform(Vector2.ZERO)

	_draw_directional_shields(shake)

func _is_wedge_part(part: PartData) -> bool:
	var shape_id := str(part.spec().get("shape", ""))
	return shape_id == "triangle" or shape_id == "triangle-long"

func _wedge_polygon_for_cell(cell: Vector2i, part: PartData, shake: Vector2, hull_cells: Dictionary) -> PackedVector2Array:
	var half: float = BalanceData.CELL * 0.5
	var center: Vector2 = Vector2(cell) * BalanceData.CELL + shake
	var rot: float = float(part.quarter_turn) * PI * 0.5
	var has_up := hull_cells.has(cell + Vector2i.UP)
	var has_down := hull_cells.has(cell + Vector2i.DOWN)
	var local_pts: Array[Vector2] = []
	if has_up and not has_down:
		local_pts = [Vector2(-half, -half), Vector2(half, -half), Vector2(-half, half)]
	elif has_down and not has_up:
		local_pts = [Vector2(-half, -half), Vector2(half, half), Vector2(-half, half)]
	else:
		# 정면 충각 함수(Prow Wedge): 뒤쪽(-X) 면은 선체와 완전히 밀착되고 앞쪽(+X)으로 예리하게 수렴
		local_pts = [Vector2(-half, -half), Vector2(half, 0.0), Vector2(-half, half)]
	var out := PackedVector2Array()
	for pt in local_pts:
		out.append(center + pt.rotated(rot))
	return out

func _draw_cosmoteer_ship(shake: Vector2, hull_cells: Dictionary) -> void:
	var half: float = BalanceData.CELL * 0.5
	var full := Vector2.ONE * BalanceData.CELL
	var now_ms: float = float(Time.get_ticks_msec())

	# Pass 0: 선체 통합 외곽 그림자 (셀 간 분절 없이 일체형 함선 깊이감 형성)
	var shadow_offset := Vector2(3.0, 5.0)
	for part in model.parts:
		if _is_wedge_part(part):
			for cell in part.cells():
				var poly := _wedge_polygon_for_cell(cell, part, shake + shadow_offset, hull_cells)
				draw_colored_polygon(poly, Color(0.01, 0.02, 0.05, 0.52))
		else:
			for cell in part.cells():
				var rect := Rect2(Vector2(cell) * BalanceData.CELL + shake + shadow_offset - Vector2.ONE * half, full)
				draw_rect(rect, Color(0.01, 0.02, 0.05, 0.52), true)

	# Pass 1: 무봉제(Flush 42x42) 내부 데크 바닥 타일 + 격자 그레이팅
	var deck_base := Color("162231") if is_player else Color("241720")
	for part in model.parts:
		var spec := part.spec()
		var role_tint := Color(str(spec.fill))
		var hp_ratio := clampf(part.hp / maxf(part.max_hp, 1.0), 0.0, 1.0)
		var room_floor := deck_base.lerp(role_tint, 0.28)
		if hp_ratio < 0.6:
			room_floor = room_floor.lerp(Color("4a1812"), (0.6 - hp_ratio) * 0.72)
		if _is_wedge_part(part):
			for cell in part.cells():
				var poly := _wedge_polygon_for_cell(cell, part, shake, hull_cells)
				draw_colored_polygon(poly, role_tint.lightened(0.08) if is_player else role_tint.lerp(Color("662430"), 0.35))
				var closed := poly.duplicate()
				closed.append(poly[0])
				draw_polyline(closed, Color(str(spec.stroke)).lightened(0.18), 2.2, true)
		else:
			for cell in part.cells():
				var c_pos := Vector2(cell) * BalanceData.CELL + shake
				var rect := Rect2(c_pos - Vector2.ONE * half, full)
				draw_rect(rect, room_floor, true)
				# 내부 데크 그레이팅 십자 서브그리드
				draw_line(c_pos + Vector2(-half, 0), c_pos + Vector2(half, 0), Color(1, 1, 1, 0.045), 1.0)
				draw_line(c_pos + Vector2(0, -half), c_pos + Vector2(0, half), Color(1, 1, 1, 0.045), 1.0)
				# 서로 다른 모듈 사이에는 얇은 내부 격벽선만 그어 한 척의 함선으로 묶는다
				for axis in [Vector2i.RIGHT, Vector2i.DOWN]:
					var other_uid: int = int(hull_cells.get(cell + axis, -1))
					if other_uid != -1 and other_uid != part.uid:
						if axis == Vector2i.RIGHT:
							draw_line(rect.position + Vector2(rect.size.x, 0), rect.end, Color(0.03, 0.06, 0.10, 0.78), 1.2)
						else:
							draw_line(rect.position + Vector2(0, rect.size.y), rect.end, Color(0.03, 0.06, 0.10, 0.78), 1.2)

	# Pass 2: Cosmoteer 스타일 함내 전력 버스 도관(Power Conduit) 네트워크
	var pwr_eff: float = model.power_efficiency()
	var conduit_pulse: float = 0.55 + 0.45 * sin(now_ms * 0.007)
	var bus_col := (Color("48e5ff") if is_player else Color("ff6280"))
	if pwr_eff < 0.95:
		bus_col = Color("ffae52")
	var bus_alpha: float = clampf(0.18 + 0.22 * conduit_pulse * clampf(pwr_eff, 0.4, 1.2), 0.12, 0.48)
	for cell_var in hull_cells.keys():
		var cell: Vector2i = cell_var
		var p_here := model.part_at(cell)
		if p_here != null and _is_wedge_part(p_here):
			continue
		var a_pos := Vector2(cell) * BalanceData.CELL + shake
		for axis in [Vector2i.RIGHT, Vector2i.DOWN]:
			if hull_cells.has(cell + axis):
				var p_next := model.part_at(cell + axis)
				if p_next != null and _is_wedge_part(p_next):
					continue
				var b_pos := Vector2(cell + axis) * BalanceData.CELL + shake
				draw_line(a_pos, b_pos, Color(0.04, 0.08, 0.13, 0.65), 4.0)
				draw_line(a_pos, b_pos, Color(bus_col.r, bus_col.g, bus_col.b, bus_alpha), 1.5)

	# Pass 3: 외곽 노출면에만 두꺼운 이중 베벨 건메탈 장갑 외벽(Hull Armor Rim) 렌더링
	var armor_outer := Color("0a111a")
	var armor_bevel := Color("7fa6c9") if is_player else Color("c97b88")
	for part in model.parts:
		if _is_wedge_part(part):
			continue
		for cell in part.cells():
			var rect := Rect2(Vector2(cell) * BalanceData.CELL + shake - Vector2.ONE * half, full)
			for axis in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
				if not hull_cells.has(cell + axis):
					var a := rect.position
					var b := rect.position
					var inward := Vector2.ZERO
					if axis == Vector2i.LEFT:
						b += Vector2(0, rect.size.y); inward = Vector2(2.0, 0)
					elif axis == Vector2i.RIGHT:
						a += Vector2(rect.size.x, 0); b += rect.size; inward = Vector2(-2.0, 0)
					elif axis == Vector2i.UP:
						b += Vector2(rect.size.x, 0); inward = Vector2(0, 2.0)
					else:
						a += Vector2(0, rect.size.y); b += rect.size; inward = Vector2(0, -2.0)
					draw_line(a, b, armor_outer, 3.8, true)
					draw_line(a + inward, b + inward, armor_bevel, 1.8, true)

	# Pass 4: 모듈별 내부 컷어웨이 아키텍처 & 선체 외곽 돌출 하드웨어(벨 노즐/포탑/플룸)
	for part in model.parts:
		_draw_cosmoteer_module_detail(part, shake, hull_cells, now_ms)

	# Pass 5: 국소 전투 손상 균열(Fracture Cracks) · 용융 균열광 · 손상 HP 바
	for part in model.parts:
		var hp_ratio := clampf(part.hp / maxf(part.max_hp, 1.0), 0.0, 1.0)
		if hp_ratio >= 0.99:
			continue
		var center := module_local_center(part) + shake
		if hp_ratio < 0.78:
			var seed_ang := float((part.uid * 53) % 360) * PI / 180.0
			var c1 := Vector2.from_angle(seed_ang) * 12.0
			var c2 := Vector2.from_angle(seed_ang + 2.1) * 9.5
			var crack_col := Color("ff6e38", 0.88) if hp_ratio < 0.40 else Color("070b12", 0.85)
			draw_line(center - c1 * 0.6, center + Vector2(2.5, -1.5), crack_col, 1.8, true)
			draw_line(center + Vector2(2.5, -1.5), center + c2, crack_col, 1.5, true)
			if hp_ratio < 0.40:
				draw_circle(center + Vector2(1.5, -1.0), 2.6, Color("ffae42", 0.75))
		var bar_width := 28.0
		draw_rect(Rect2(center + Vector2(-bar_width * 0.5, 14.0), Vector2(bar_width, 3.4)), Color(0.02, 0.04, 0.09, 0.88), true)
		draw_rect(Rect2(center + Vector2(-bar_width * 0.5, 14.0), Vector2(bar_width * hp_ratio, 3.4)), Color("6ee7a4") if hp_ratio > 0.5 else Color("ff7866"), true)

func _draw_hazard_strip(rect: Rect2) -> void:
	draw_rect(rect, Color("d99b26", 0.88), true)
	var stripes := maxi(2, int(rect.size.x / 6.0))
	for i in stripes:
		if i % 2 == 0:
			var sx := rect.position.x + float(i) * 6.0
			draw_rect(Rect2(Vector2(sx, rect.position.y), Vector2(minf(3.0, rect.end.x - sx), rect.size.y)), Color("14181f", 0.90), true)

func _draw_cosmoteer_module_detail(part: PartData, shake: Vector2, _hull_cells: Dictionary, now_ms: float) -> void:
	var spec := part.spec()
	var center := module_local_center(part) + shake
	var pulse := 0.5 + 0.5 * sin(now_ms * 0.006 + float(part.uid))
	var aim_local := (to_local(turret_target) - center).angle() if turret_target != Vector2.ZERO else 0.0
	var rot_rad := float(part.quarter_turn) * PI * 0.5
	var recoil_amt: float = float(weapon_recoil.get(part.uid, 0.0))
	var grade_col := VisualData.grade_color(str(spec.get("grade_color", "gray")))

	match part.kind:
		"core":
			var core_col := Color("55f4ff") if is_player else Color("ff5c77")
			_draw_hazard_strip(Rect2(center + Vector2(-16, -18), Vector2(32, 3.0)))
			_draw_hazard_strip(Rect2(center + Vector2(-16, 15), Vector2(32, 3.0)))
			draw_circle(center, 14.5, Color("0b1522"))
			draw_circle(center, 13.0, Color(core_col, 0.22 + 0.14 * pulse))
			var spin := now_ms * 0.0032
			draw_arc(center, 11.5, spin, spin + PI * 1.35, 18, core_col, 2.4, true)
			draw_arc(center, 9.0, -spin * 1.3, -spin * 1.3 + PI * 1.2, 16, core_col.lightened(0.28), 1.6, true)
			for c_i in 4:
				var ca := float(c_i) * PI * 0.5 + PI * 0.25
				var cp := center + Vector2.from_angle(ca) * 12.0
				draw_circle(cp, 2.4, Color("293b52"))
			draw_circle(center, 5.8, core_col.lightened(0.35))
			draw_circle(center, 2.8, Color.WHITE)
		"battery":
			_draw_hazard_strip(Rect2(center + Vector2(-15, -16), Vector2(30, 2.6)))
			draw_rect(Rect2(center + Vector2(-14, -11), Vector2(28, 22)), Color("0d1826"), true)
			for b in 3:
				var bx := -10.5 + float(b) * 8.0
				var cell_glow := 0.65 + 0.35 * sin(now_ms * 0.008 + float(b) * 1.4)
				draw_rect(Rect2(center + Vector2(bx, -8.5), Vector2(5.2, 17.0)), Color("46f2c8", cell_glow), true)
				draw_rect(Rect2(center + Vector2(bx, -8.5), Vector2(5.2, 17.0)), Color("b8ffee", 0.55), false, 1.0)
		"armor", "block", "beam2", "beam3", "beam4", "plate4":
			var plate_col := Color(str(spec.fill)).lightened(0.14 if is_player else 0.04)
			if not is_player:
				plate_col = plate_col.lerp(Color("662834"), 0.28)
			for cell in part.cells():
				var cp := Vector2(cell) * BalanceData.CELL + shake
				var slab := Rect2(cp - Vector2.ONE * 16.5, Vector2.ONE * 33.0)
				draw_rect(slab, plate_col, true)
				draw_rect(slab, Color(1, 1, 1, 0.14), false, 1.2)
				if part.kind == "armor" or part.kind == "plate4":
					draw_line(slab.position + Vector2(4, 4), slab.end - Vector2(4, 4), plate_col.darkened(0.28), 1.6)
					for rx in [-12.0, 12.0]:
						for ry in [-12.0, 12.0]:
							draw_circle(cp + Vector2(float(rx), float(ry)), 1.6, grade_col.lightened(0.2))
				else:
					draw_line(slab.position + Vector2(3, 3), slab.end - Vector2(3, 3), Color(0.08, 0.13, 0.20, 0.65), 1.5)
					draw_line(slab.position + Vector2(slab.size.x - 3, 3), slab.position + Vector2(3, slab.size.y - 3), Color(0.08, 0.13, 0.20, 0.65), 1.5)
		"laser":
			var dir := Vector2.from_angle(aim_local)
			var perp := Vector2(-dir.y, dir.x)
			var kick := -dir * (4.5 * recoil_amt)
			draw_circle(center, 13.5, Color("171324"))
			draw_arc(center, 13.5, 0.0, TAU, 24, Color("ff92e8", 0.45), 1.4, true)
			draw_line(center + kick + perp * 4.0, center + kick + perp * 4.0 + dir * 16.5, Color("ff7ae0"), 3.0, true)
			draw_line(center + kick - perp * 4.0, center + kick - perp * 4.0 + dir * 16.5, Color("ff7ae0"), 3.0, true)
			draw_circle(center + kick, 7.2, Color("2e1936"))
			draw_circle(center + kick, 4.2, Color("ffd1f6"))
		"machine_gun":
			var dir := Vector2.from_angle(aim_local)
			var perp := Vector2(-dir.y, dir.x)
			var kick := -dir * (3.8 * recoil_amt)
			draw_circle(center, 13.0, Color("15202e"))
			draw_arc(center, 13.0, 0.0, TAU, 22, Color("9ebbe4", 0.45), 1.3, true)
			for s in [-4.2, 0.0, 4.2]:
				draw_line(center + kick + perp * float(s), center + kick + perp * float(s) + dir * 17.0, Color("c4deff"), 2.1, true)
			draw_rect(Rect2(center + kick - Vector2(6, 6), Vector2(12, 12)), Color("2c3e54"), true)
			draw_circle(center + kick, 3.8, Color("ffe09e"))
		"railgun":
			var dir := Vector2.from_angle(aim_local)
			var perp := Vector2(-dir.y, dir.x)
			var kick := -dir * (6.2 * recoil_amt)
			draw_circle(center, 14.5, Color("18122b"))
			draw_arc(center, 14.5, 0.0, TAU, 26, Color("c993ff", 0.58), 1.6, true)
			draw_line(center + kick, center + kick + dir * 20.0, Color("7ef9ff", 0.85), 2.2, true)
			for rung in [6.0, 11.5, 16.5]:
				var rp: Vector2 = center + kick + dir * float(rung)
				draw_line(rp - perp * 5.2, rp + perp * 5.2, Color("7ef9ff", 0.72), 1.6, true)
			draw_line(center + kick + perp * 4.6, center + kick + perp * 4.6 + dir * 21.5, Color("d6b3ff"), 3.2, true)
			draw_line(center + kick - perp * 4.6, center + kick - perp * 4.6 + dir * 21.5, Color("d6b3ff"), 3.2, true)
			draw_circle(center + kick, 5.2, Color("ebd9ff"))
		"missile_launcher", "mini_missile_launcher":
			var pod_col := Color("ffbd78") if part.kind == "missile_launcher" else Color("d7ed8e")
			var has_ammo := model.ammo_total("missile") > 0
			_draw_hazard_strip(Rect2(center + Vector2(-15, -16), Vector2(30, 2.5)))
			for ox in [-6.8, 6.8]:
				for oy in [-5.5, 6.5]:
					var tube: Vector2 = center + Vector2(float(ox), float(oy))
					draw_circle(tube, 4.5, Color("0d141f"))
					draw_arc(tube, 4.5, 0.0, TAU, 12, Color("5a6d85"), 1.0, true)
					if has_ammo:
						draw_circle(tube, 2.5, pod_col)
		"ammo_bay":
			var ratio := clampf(float(part.ammo) / maxf(float(part.capacity), 1.0), 0.0, 1.0)
			_draw_hazard_strip(Rect2(center + Vector2(-16, -17), Vector2(32, 2.6)))
			draw_rect(Rect2(center + Vector2(-15, -12), Vector2(30, 25)), Color("0e151f"), true)
			var total_slots := 6
			var active_slots := roundi(ratio * float(total_slots))
			for s_idx in total_slots:
				var sx := -11.5 + float(s_idx) * 4.6
				var col := Color("ffcb6b") if s_idx < active_slots else Color("232c38")
				draw_rect(Rect2(center + Vector2(sx, -7.0), Vector2(3.0, 15.0)), col, true)
				if s_idx < active_slots:
					draw_rect(Rect2(center + Vector2(sx, -9.0), Vector2(3.0, 2.5)), Color("ff6b57"), true)
		"bullet_bay":
			var ratio := clampf(float(part.ammo) / maxf(float(part.capacity), 1.0), 0.0, 1.0)
			draw_rect(Rect2(center + Vector2(-15, -13), Vector2(30, 26)), Color("0e1718"), true)
			var crates := 6
			var lit := roundi(ratio * float(crates))
			for c_idx in crates:
				var cx := -10.5 + float(c_idx % 3) * 8.0
				var cy := -8.5 + float(floori(float(c_idx) / 3.0)) * 9.5
				var c_col := Color("a8f0c0") if c_idx < lit else Color("223033")
				draw_rect(Rect2(center + Vector2(cx, cy), Vector2(6.0, 7.0)), c_col, true)
		"thruster", "reverse_thruster":
			var exhaust_dir := Vector2.LEFT.rotated(rot_rad)
			if part.kind == "reverse_thruster":
				exhaust_dir = Vector2.RIGHT.rotated(rot_rad)
			var perp := Vector2(-exhaust_dir.y, exhaust_dir.x)
			# 기관실 터보펌프 매니폴드 + 외부 리브 벨 노즐
			draw_rect(Rect2(center - Vector2(11, 11), Vector2(22, 22)), Color("102230") if part.kind == "thruster" else Color("24182c"), true)
			draw_circle(center - exhaust_dir * 3.0, 6.5, Color("2d4f68") if part.kind == "thruster" else Color("543866"))
			var nozzle := PackedVector2Array([
				center + exhaust_dir * 10.0 + perp * 6.8,
				center + exhaust_dir * 27.0 + perp * 12.6,
				center + exhaust_dir * 27.0 - perp * 12.6,
				center + exhaust_dir * 10.0 - perp * 6.8,
			])
			draw_colored_polygon(nozzle, Color("1a2838"))
			draw_polyline(PackedVector2Array([nozzle[0], nozzle[1], nozzle[2], nozzle[3]]), Color("6b8eb0", 0.85), 1.5, true)
			draw_line(center + exhaust_dir * 16.0 + perp * 9.0, center + exhaust_dir * 16.0 - perp * 9.0, Color("6688a8", 0.70), 1.4)
			draw_line(center + exhaust_dir * 22.0 + perp * 11.2, center + exhaust_dir * 22.0 - perp * 11.2, Color("94bfe2", 0.80), 1.6)
			var blocked := model.is_exhaust_blocked(part)
			if blocked:
				draw_line(center + exhaust_dir * 25.5 + perp * 11.0, center + exhaust_dir * 25.5 - perp * 11.0, Color("ff9e3d"), 3.2)
			var exhaust_entry: Variant = active_exhausts.get(part.uid, null)
			var intensity := float(exhaust_entry.get("intensity", 0.0)) if exhaust_entry is Dictionary else 0.0
			var plume_dir: Vector2 = exhaust_entry.get("direction", exhaust_dir) if exhaust_entry is Dictionary else exhaust_dir
			if intensity > 0.04 and plume_dir.length_squared() > 0.01:
				_draw_mach_plume(center + plume_dir * 24.5, plume_dir, intensity, part.kind == "reverse_thruster", blocked, now_ms + float(part.uid) * 19.0)
		"rcs_thruster":
			draw_circle(center, 8.2, Color("18302c"))
			draw_arc(center, 8.2, 0.0, TAU, 18, Color("8cf0cd", 0.65), 1.5, true)
			draw_circle(center, 3.6, Color("aefae0"))
			for jet_force in rcs_thrust_directions(part):
				var port_dir := -jet_force.normalized()
				draw_line(center + port_dir * 7.5, center + port_dir * 13.5, Color("486b66"), 3.6)
			var exhaust_entry: Variant = active_exhausts.get(part.uid, null)
			if exhaust_entry is Dictionary:
				var jets: Array = exhaust_entry.get("jets", [exhaust_entry])
				for jet in jets:
					if not (jet is Dictionary):
						continue
					var j_int: float = float(jet.get("intensity", 0.0))
					var j_dir: Vector2 = jet.get("direction", Vector2.ZERO)
					if j_int > 0.04 and j_dir.length_squared() > 0.01:
						var jp := Vector2(-j_dir.y, j_dir.x)
						var j_len := 10.0 + 18.0 * j_int
						var tri := PackedVector2Array([
							center + j_dir * 12.0 + jp * 3.8,
							center + j_dir * (12.0 + j_len),
							center + j_dir * 12.0 - jp * 3.8,
						])
						draw_colored_polygon(tri, Color("7ef9ff", 0.72))
						draw_circle(center + j_dir * 13.0, 2.8 * j_int + 1.2, Color.WHITE)
		"shield_generator":
			var gen_dir := Vector2.from_angle(rot_rad)
			var gen_perp := Vector2(-gen_dir.y, gen_dir.x)
			var hex := PackedVector2Array()
			for i in 7:
				var a := rot_rad + float(i) * TAU / 6.0
				hex.append(center + Vector2(cos(a), sin(a)) * 10.5)
			draw_colored_polygon(hex.slice(0, 6), Color("143b52"))
			draw_polyline(hex, Color("7ef9ff"), 1.9, true)
			draw_line(center + gen_perp * 6.0, center + gen_dir * 15.0 + gen_perp * 9.0, Color("66eeff"), 2.2, true)
			draw_line(center - gen_perp * 6.0, center + gen_dir * 15.0 - gen_perp * 9.0, Color("66eeff"), 2.2, true)
			draw_circle(center, 4.4, Color("d8fcff"))

func _draw_mach_plume(nozzle_tip: Vector2, plume_dir: Vector2, intensity: float, is_reverse: bool, is_blocked: bool, phase_ms: float) -> void:
	var perp := Vector2(-plume_dir.y, plume_dir.x)
	var flicker := 0.90 + 0.14 * sin(phase_ms * 0.045)
	var scale_mult := (1.38 if overdrive_active else 1.0) * (0.45 if is_blocked else 1.0) * flicker
	var total_len := (18.0 + 38.0 * intensity) * scale_mult
	var outer_col := Color("ff9b42") if is_blocked else (Color("ffb838") if overdrive_active else (Color("b56eff") if is_reverse else Color("2b8fff")))
	var mid_col := Color("ffd478") if is_blocked else (Color("ffe885") if overdrive_active else (Color("f0b8ff") if is_reverse else Color("58f6ff")))

	# 1단계: 외곽 초음속 팽창 플룸 콘
	var outer := PackedVector2Array([
		nozzle_tip + perp * 9.5,
		nozzle_tip + plume_dir * (total_len * 0.45) + perp * 6.5,
		nozzle_tip + plume_dir * total_len,
		nozzle_tip + plume_dir * (total_len * 0.45) - perp * 6.5,
		nozzle_tip - perp * 9.5,
	])
	draw_colored_polygon(outer, Color(outer_col.r, outer_col.g, outer_col.b, 0.56))

	# 2단계: 중간 고온 이온 제트
	var mid := PackedVector2Array([
		nozzle_tip + perp * 6.0,
		nozzle_tip + plume_dir * (total_len * 0.72),
		nozzle_tip - perp * 6.0,
	])
	draw_colored_polygon(mid, Color(mid_col.r, mid_col.g, mid_col.b, 0.85))

	# 3단계: 백색 노즐 코어 + 마하 충격파 다이아몬드(Mach Diamonds)
	draw_circle(nozzle_tip + plume_dir * 2.5, 4.8 * intensity + 2.2, Color.WHITE)
	if not is_blocked and intensity > 0.28:
		for d_idx in 2:
			var dist := total_len * (0.28 + float(d_idx) * 0.24)
			var dw := (3.8 - float(d_idx) * 1.1) * intensity
			var dc := nozzle_tip + plume_dir * dist
			var dia := PackedVector2Array([
				dc - plume_dir * (dw * 1.3),
				dc + perp * dw,
				dc + plume_dir * (dw * 1.3),
				dc - perp * dw,
			])
			draw_colored_polygon(dia, Color(1.0, 1.0, 1.0, 0.82 - float(d_idx) * 0.24))

func _draw_directional_shields(shake: Vector2) -> void:
	if shield_layers <= 0:
		return
	var base_alpha: float = VisualData.SHIELD_LAYER_OPACITY[clampi(shield_layers, 0, VisualData.SHIELD_LAYER_OPACITY.size() - 1)]
	var r: float = hull_bound_radius + PhysicsData.SHIELD_ARC_RADIUS_OFFSET
	var half_arc: float = PhysicsData.SHIELD_ARC_HALF_ANGLE
	for part in model.parts:
		if part.kind != "shield_generator" or part.hp <= 0.0:
			continue
		var flash: float = float(shield_arc_flash.get(part.uid, 0.0))
		var alpha: float = clampf(base_alpha + flash * 0.42, 0.0, 0.98)
		var col := Color(0.28, 0.93, 1.0, alpha) if is_player else Color(1.0, 0.42, 0.60, alpha)
		if flash > 0.05:
			col = col.lerp(Color.WHITE, flash * 0.55)
		var gen_angle: float = float(part.quarter_turn) * PI * 0.5
		var start_a: float = gen_angle - half_arc
		var end_a: float = gen_angle + half_arc
		var gen_pos: Vector2 = module_local_center(part) + shake

		# 방어막 투사기 팬 광선 (Emitter Fan Rays)
		var p_left := shake + Vector2.from_angle(start_a) * r
		var p_right := shake + Vector2.from_angle(end_a) * r
		draw_line(gen_pos, p_left, Color(col.r, col.g, col.b, alpha * 0.26), 1.2, true)
		draw_line(gen_pos, p_right, Color(col.r, col.g, col.b, alpha * 0.26), 1.2, true)

		# 136도 방향성 아크 에너지 장벽
		draw_arc(shake, r - 3.0, start_a, end_a, 28, Color(col.r, col.g, col.b, alpha * 0.22), 7.0, true)
		draw_arc(shake, r, start_a, end_a, 28, col, 2.8 + flash * 1.8, true)
		if shield_layers >= 2:
			draw_arc(shake, r + 5.0, start_a + 0.06, end_a - 0.06, 24, Color(col.r, col.g, col.b, alpha * 0.60), 1.6, true)
