class_name ShipBody
extends RigidBody2D

const ShipModelScript = preload("res://scripts/ship_model.gd")
const BalanceData = preload("res://scripts/balance.gd")
const VisualData = preload("res://scripts/visual_tuning.gd")
const PhysicsData = preload("res://scripts/physics_tuning.gd")
const VoxelShipRendererScript = preload("res://scripts/voxel_ship_renderer.gd")

var model = ShipModelScript.new()
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
	return {"part":hit_part, "fraction":best} if hit_part != null else {}

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

# 프레임별 AI 범위 판정용. sqrt 없이 중심 간 제곱 거리와 확장 임계값 제곱만 비교한다.
# range는 두 함선 외곽 사이에 허용하는 간격이며, 조립체가 커지면 각 바운드 스피어가 자동으로 더해진다.
func is_within_surface_range(other: ShipBody, surface_range: float) -> bool:
	if other == null:
		return false
	var expanded_range := maxf(0.0, surface_range) + hull_bound_radius + other.hull_bound_radius
	return global_position.distance_squared_to(other.global_position) <= expanded_range * expanded_range

func _physics_process(delta: float) -> void:
	laser_cooldown = maxf(0.0, laser_cooldown - delta)
	missile_cooldown = maxf(0.0, missile_cooldown - delta)
	mini_missile_cooldown = maxf(0.0, mini_missile_cooldown - delta)
	heat = maxf(0.0, heat - delta * (18.0 + cooling_bonus + float(model.parts.filter(func(part): return part.kind == "battery").size()) * 9.0))
	break_shake_time = maxf(0.0, break_shake_time - delta)
	if break_shake_time <= 0.0:
		break_shake = 0.0
	if shield_layers < shield_max_layers():
		shield_recharge_left -= delta
		if shield_recharge_left <= 0.0:
			shield_layers += 1
			shield_recharge_left = maxf(float(BalanceData.SHIELD.min_recharge), float(BalanceData.SHIELD.base_recharge) - shield_recharge_reduction)
	queue_redraw()

func _integrate_forces(state: PhysicsDirectBodyState2D) -> void:
	var angular_retain := PhysicsData.PLAYER_ANGULAR_RETAIN_PER_SECOND if is_player else PhysicsData.NPC_ANGULAR_RETAIN_PER_SECOND
	PhysicsData.apply_reference_damping(state, PhysicsData.PLAYER_LINEAR_RETAIN_PER_SECOND, angular_retain)
	var speed_limit := max_linear_speed()
	if state.linear_velocity.length_squared() > speed_limit * speed_limit:
		state.linear_velocity = state.linear_velocity.normalized() * speed_limit
	state.angular_velocity = clampf(state.angular_velocity, -PhysicsData.MAX_ANGULAR_SPEED, PhysicsData.MAX_ANGULAR_SPEED)

func apply_player_thrusters(forward: float, reverse: float, turn: float) -> void:
	if is_destroying:
		active_exhausts.clear()
		sync_exhaust_particles()
		return
	active_exhausts.clear()
	if absf(forward) < 0.01 and absf(reverse) < 0.01 and absf(turn) < 0.01:
		apply_neutral_braking()
		sync_exhaust_particles()
		return
	if absf(turn) < 0.01:
		apply_neutral_angular_braking()
	var forward_drives := parts_with_actuator("forward")
	var forward_multipliers := balanced_linear_multipliers(forward_drives)
	for part in forward_drives:
		apply_module_force(part, module_thrust_axis(part) * float(part.spec().force) * forward * float(forward_multipliers.get(part.uid, 1.0)))
	var reverse_drives := parts_with_actuator("reverse")
	var reverse_multipliers := balanced_linear_multipliers(reverse_drives)
	for part in reverse_drives:
		apply_module_force(part, -module_thrust_axis(part) * float(part.spec().force) * reverse * float(reverse_multipliers.get(part.uid, 1.0)))
	for part in parts_with_actuator("turn"):
		var rcs_force := rcs_force_direction(part)
		if rcs_force.length() > 0.01 and absf(turn) > 0.01:
			apply_module_force(part, rcs_force * float(part.spec().force) * turn)
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
	# 토크를 선체 반경으로 나눠 힘과 비교 가능한 단위로 만든다. 높은 자세 가중치로
	# 부족한 추진 자유도를 가상의 횡추력으로 보완하지 않고 정면 유지에 우선 배분한다.
	var torque_scale := PhysicsData.TRACKING_TORQUE_WEIGHT / maxf(hull_bound_radius, BalanceData.CELL)
	var residual := Vector3(desired_force.x, desired_force.y, desired_torque * torque_scale)
	var actuators: Array[Dictionary] = []
	var module_throttles := {}
	for part in model.parts:
		if part.hp <= 0.0:
			continue
		var actuator := str(part.spec().get("actuator", ""))
		var nominal := maxf(float(part.spec().get("force", 0.0)), 0.0)
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
			actuators.append({"part":part, "force":force, "wrench":Vector3(force.x, force.y, torque * torque_scale), "throttle":0.0})
	# 세 노즐은 독립 단방향이지만 동일 모듈의 정격 출력을 공유한다.
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
		var drives := parts_with_actuator("reverse")
		var multipliers := balanced_linear_multipliers(drives)
		for part in drives:
			apply_module_force(part, -module_thrust_axis(part) * float(part.spec().force) * reverse_input * float(multipliers.get(part.uid, 1.0)))
	elif local_velocity.x < -0.01:
		var forward_input := clampf(-local_velocity.x / brake_speed, 0.0, 1.0)
		var drives := parts_with_actuator("forward")
		var multipliers := balanced_linear_multipliers(drives)
		for part in drives:
			apply_module_force(part, module_thrust_axis(part) * float(part.spec().force) * forward_input * float(multipliers.get(part.uid, 1.0)))
	apply_neutral_angular_braking()

func apply_neutral_angular_braking() -> void:
	# 수동 A/D는 즉시 최대 출력이지만, 자동 자세 보정은 각속도에 비례한 역토크를 쓴다.
	# 따라서 정지에 가까울수록 RCS 힘과 이펙트 강도가 함께 부드럽게 줄어든다.
	var drives := parts_with_actuator("turn")
	var desired_torque := -angular_velocity * inertia * PhysicsData.NEUTRAL_ANGULAR_DECAY_GAIN
	var torque_capacity := 0.0
	for part in drives:
		torque_capacity += absf((module_local_center(part) - center_of_mass).cross(rcs_force_direction(part) * float(part.spec().force)))
	var turn_input := clampf(desired_torque / maxf(torque_capacity, 0.001), -1.0, 1.0)
	if not is_player:
		turn_input = clampf(-angular_velocity / PhysicsData.NEUTRAL_ANGULAR_BRAKE_FULL_SPEED, -1.0, 1.0)
	for part in drives:
		var force := rcs_force_direction(part) * float(part.spec().force)
		var torque := (module_local_center(part) - center_of_mass).cross(force)
		apply_module_force(part, force * turn_input * signf(torque))

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

# 기존 웹의 turn()과 동일한 격자 원점 기준 접선 힘이다.
func rcs_force_direction(part: PartData) -> Vector2:
	var center := module_local_center(part)
	if center.length_squared() <= 0.0001:
		return Vector2.ZERO
	return Vector2(-center.y, center.x).normalized()

# 기존 양방향 접선 노즐 + 선체 안쪽으로 힘을 가하는 외향 배기 노즐.
# 장착 위치를 기준으로 계산하여 반대편 RCS끼리 좌/우 횡추진을 담당한다.
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
		torque_coefficients.append(lever_arm.cross(module_thrust_axis(part)) * float(part.spec().force))
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
	active_exhausts[part.uid] = {
		"direction": -local_force.normalized(),
		"intensity": clampf(local_force.length() / nominal_force, 0.0, 1.0),
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
	particles.lifetime = 0.62 if smoke else 0.24
	particles.preprocess = particles.lifetime
	particles.local_coords = true
	particles.emitting = false
	# 배경보다 앞에 렌더링한다. 음수 z는 World의 우주 배경 뒤로 밀려 효과가 보이지 않는다.
	particles.z_index = 0 if smoke else 1
	particles.texture = particle_texture(smoke)
	particles.direction = Vector2.LEFT
	particles.spread = 18.0 if smoke else 10.0
	particles.gravity = Vector2.ZERO
	particles.initial_velocity_min = 32.0 if smoke else 110.0
	particles.initial_velocity_max = 68.0 if smoke else 180.0
	particles.scale_amount_min = 0.18 if smoke else 0.22
	particles.scale_amount_max = 0.42 if smoke else 0.48
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
			var alpha := clampf(1.0 - distance, 0.0, 1.0) * (0.42 if smoke else 0.86)
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
	var visible := tier > 0
	var was_visible := bool(entry.get("effect_visible", false))
	for particle in [entry.fire, entry.smoke]:
		if was_visible and not visible:
			particle.restart()
		particle.visible = visible
		particle.emitting = visible
		if visible:
			particle.direction = direction
			particle.position = entry.base_position + direction * VisualData.THRUSTER_NOZZLE_OFFSET
			configure_exhaust_particle(particle, particle == entry.smoke, tier)
		else:
			particle.position = entry.base_position
	entry.effect_visible = visible
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
	# Godot가 토크 계산에서 CoM을 빼므로 호출자가 중복 차감하지 않는다.
	return module_local_center(part)

func actuator_force(kind: String) -> float:
	var force := 0.0
	for part in model.parts:
		if part.spec().get("actuator", "") == kind:
			force += float(part.spec().get("force", 0.0))
	return force

func max_linear_speed() -> float:
	var thrust_to_mass := (actuator_force("forward") + actuator_force("reverse")) / maxf(mass, 0.1)
	return maxf(float(PhysicsData.MAX_LINEAR_SPEED_MIN), float(PhysicsData.MAX_LINEAR_SPEED_BASE) * thrust_to_mass / float(PhysicsData.MAX_SPEED_REFERENCE_THRUST_PER_MASS))

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
	laser_cooldown = float(BalanceData.WEAPONS.laser.cooldown)
	heat += float(BalanceData.WEAPONS.laser.heat) + float(lasers.size()) * 3.0
	turret_target = target
	for part in lasers:
		var source := to_global(Vector2(part.cell) * BalanceData.CELL)
		result.append({"position": source, "velocity": linear_velocity + source.direction_to(target) * float(BalanceData.WEAPONS.laser.speed), "damage": float(BalanceData.WEAPONS.laser.damage), "color": Color("ff92e8"), "team": "player" if is_player else "enemy", "kind":"laser", "life":float(BalanceData.WEAPONS.laser.life)})
	for part in ballistics:
		var tuning: Dictionary = BalanceData.WEAPONS[part.kind]
		if not model.consume_ammo("bullet", int(tuning.ammo_cost)):
			continue
		var source := to_global(Vector2(part.cell) * BalanceData.CELL)
		result.append({"position": source, "velocity": linear_velocity + source.direction_to(target) * float(tuning.speed), "damage": float(tuning.damage), "color": Color("d6b3ff") if part.kind == "railgun" else Color("b9d8ff"), "team": "player" if is_player else "enemy", "kind":part.kind, "life":float(tuning.life)})
	return result

func fire_missile(target: Vector2) -> Dictionary:
	if missile_cooldown > 0.0 or not has_part("missile_launcher") or not model.consume_ammo("missile", int(BalanceData.WEAPONS.missile.ammo_cost)):
		return {}
	missile_cooldown = float(BalanceData.WEAPONS.missile.cooldown)
	return {"position": global_position, "velocity": linear_velocity + global_position.direction_to(target) * float(BalanceData.WEAPONS.missile.speed), "damage": float(BalanceData.WEAPONS.missile.damage), "color": Color("ffbd78"), "guided": true, "target": target, "team": "player" if is_player else "enemy", "kind":"missile", "life":float(BalanceData.WEAPONS.missile.life)}

func fire_auto_mini_missiles(target: Vector2) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if mini_missile_cooldown > 0.0:
		return result
	for part in model.parts:
		if part.kind != "mini_missile_launcher" or not model.consume_ammo("missile", int(BalanceData.WEAPONS.mini_missile.ammo_cost)):
			continue
		var source := to_global(Vector2(part.cell) * BalanceData.CELL)
		result.append({"position":source, "velocity":linear_velocity + source.direction_to(target) * float(BalanceData.WEAPONS.mini_missile.speed), "damage":float(BalanceData.WEAPONS.mini_missile.damage), "color":Color("d7ed8e"), "team":"player" if is_player else "enemy", "kind":"mini_missile", "guided":true, "target":target, "life":float(BalanceData.WEAPONS.mini_missile.lock_seconds) + float(BalanceData.WEAPONS.mini_missile.range) / float(BalanceData.WEAPONS.mini_missile.speed)})
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

func damage_part(part: PartData, damage: float, _impulse: Vector2 = Vector2.ZERO) -> Array[PartData]:
	if shield_layers > 0:
		shield_layers -= 1
		shield_recharge_left = maxf(float(BalanceData.SHIELD.min_recharge), float(BalanceData.SHIELD.base_recharge) - shield_recharge_reduction)
		return []
	part.hp -= damage
	if part.hp > 0.0:
		return []
	# 코어는 격침 연출이 끝날 때까지 모델에 남겨 둔다. 여기서 즉시 제거하면
	# 연결된 모든 파트가 같은 물리 프레임에 중립 잔해로 바뀌어 순간 이동처럼 보인다.
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
	break_shake_time = 0.16
	var detached := model.detach_disconnected()
	refresh_mass()
	rebuild_exhaust_particles()
	rebuild_voxel_renderer()
	queue_redraw()
	return detached

func begin_destruction() -> void:
	if is_destroying:
		return
	is_destroying = true
	active_exhausts.clear()
	sync_exhaust_particles()
	# 시각 선체는 남기되 충돌 세계에서는 즉시 고스트가 된다. 이후 같은 위치에서
	# 생성되는 잔해가 이 큰 선체 콜라이더에 밀려 나가지 않게 한다.
	collision_layer = 0
	collision_mask = 0

func local_cell_at(world_point: Vector2) -> Vector2i:
	var local := to_local(world_point)
	return Vector2i(roundi(local.x / BalanceData.CELL), roundi(local.y / BalanceData.CELL))

func _draw() -> void:
	var hull_cells := model.occupied()
	var shake := Vector2.ZERO
	if break_shake_time > 0.0:
		shake = Vector2(sin(Time.get_ticks_msec() * 0.11), cos(Time.get_ticks_msec() * 0.16)) * break_shake
	if is_instance_valid(voxel_renderer):
		voxel_renderer.position = shake
	if not VisualData.USE_VOXEL_MESH_RENDERER:
		for part in model.parts:
			draw_part(part, shake, hull_cells)
	elif not VisualData.use_textured_design:
		for part in model.parts:
			var center := module_local_center(part) + shake
			for cell in part.cells():
				draw_rect(Rect2(Vector2(cell) * BalanceData.CELL - Vector2.ONE * 20.0 + shake, Vector2.ONE * 40.0), Color("a8d5e5", 0.5), false, 1.0)
			# 물리/카메라 회전과 반대로 돌려 화면에서 글자가 항상 수평이다.
			draw_set_transform(center, VisualData.module_label_rotation(self))
			draw_rect(Rect2(Vector2(-21, -10), Vector2(42, 20)), Color("071221", 0.94), true)
			draw_string(ThemeDB.fallback_font, Vector2(-20, 4), VisualData.module_debug_label(part.kind), HORIZONTAL_ALIGNMENT_CENTER, 40, 10, Color.WHITE)
			var fraction := clampf(part.hp / maxf(part.max_hp, 0.001), 0.0, 1.0)
			draw_rect(Rect2(Vector2(-16, 12), Vector2(32 * fraction, 3)), Color("82e7c6") if fraction > 0.5 else Color("ff927d"), true)
			draw_set_transform(Vector2.ZERO)
	if shield_layers > 0:
		var alpha: float = VisualData.SHIELD_LAYER_OPACITY[shield_layers]
		draw_arc(shake, hull_bound_radius + 12.0, 0.0, TAU, 40, Color(0.22, 0.88, 1.0, alpha), 2.0, true)

func draw_part(part: PartData, shake: Vector2, hull_cells: Dictionary) -> void:
	var spec := part.spec()
	var fill := Color(str(spec.fill))
	var stroke := Color(str(spec.stroke))
	for cell in part.cells():
		var rect := Rect2(Vector2(cell) * BalanceData.CELL + shake - Vector2.ONE * (BalanceData.CELL * 0.46), Vector2.ONE * BalanceData.CELL * 0.92)
		if str(spec.get("shape", "")) == "triangle" or str(spec.get("shape", "")) == "triangle-long":
			var triangle := PackedVector2Array([rect.position, rect.position + Vector2(rect.size.x, 0), rect.end, rect.position])
			var pivot := rect.get_center()
			for index in triangle.size():
				triangle[index] = pivot + (triangle[index] - pivot).rotated(part.quarter_turn * PI * 0.5)
			draw_colored_polygon(triangle.slice(0, 3), fill)
			draw_polyline(triangle, stroke, VisualData.HULL_OUTLINE_WIDTH, true)
		else:
			draw_voxel_box(rect, part, fill)
			# 연결 면에는 선을 생략해 9-slice 외곽만 남긴다.
			for axis in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
				if not hull_cells.has(cell + axis):
					var a := rect.position
					var b := rect.position
					if axis == Vector2i.LEFT: b += Vector2(0, rect.size.y)
					elif axis == Vector2i.RIGHT: a += Vector2(rect.size.x, 0); b += rect.size
					elif axis == Vector2i.UP: b += Vector2(rect.size.x, 0)
					else: a += Vector2(0, rect.size.y); b += rect.size
					draw_line(a, b, stroke, VisualData.HULL_OUTLINE_WIDTH, true)
			draw_rect(Rect2(rect.position + Vector2(5, 5), Vector2(5, 5)), Color(1, 1, 1, 0.18), true)
	var center := Vector2(part.cell) * BalanceData.CELL + shake
	if part.spec().get("ammo_type", "") != "":
		draw_string(ThemeDB.fallback_font, center + Vector2(-18, 4), "%d/%d" % [part.ammo, part.capacity], HORIZONTAL_ALIGNMENT_CENTER, 36, 10, Color("fff0c2"))
	else:
		draw_string(ThemeDB.fallback_font, center + Vector2(-15, 4), str(spec.get("display_name", spec.label)).left(5), HORIZONTAL_ALIGNMENT_CENTER, 35, 9, Color("e8f7ff"))
	var bar_width := 28.0
	draw_rect(Rect2(center + Vector2(-bar_width * 0.5, 15), Vector2(bar_width, 3)), Color(0.02, 0.04, 0.09, 0.78), true)
	draw_rect(Rect2(center + Vector2(-bar_width * 0.5, 15), Vector2(bar_width * clampf(part.hp / maxf(part.max_hp, 1.0), 0.0, 1.0), 3)), stroke, true)

func draw_voxel_box(rect: Rect2, part: PartData, fill: Color) -> void:
	# 정사각 격자 단위의 상단/우측 측면으로 복셀 박스 깊이를 표현한다.
	# 노드 회전은 함선 RigidBody2D가 담당하므로 시각 박스와 2D 물리 박스가 함께 회전한다.
	var depth := Vector2(0.0, VisualData.VOXEL_PART_SIDE_DEPTH)
	var right_side := PackedVector2Array([rect.position + Vector2(rect.size.x, 0), rect.end, rect.end + depth, rect.position + Vector2(rect.size.x, depth.y)])
	var bottom_side := PackedVector2Array([rect.position + Vector2(0, rect.size.y), rect.end, rect.end + depth, rect.position + Vector2(depth.x, rect.size.y + depth.y)])
	draw_colored_polygon(right_side, fill.darkened(0.38))
	draw_colored_polygon(bottom_side, fill.darkened(0.24))
	if voxel_texture != null:
		draw_texture_rect_region(voxel_texture, rect, voxel_texture_region(part))
	else:
		draw_rect(rect, fill, true)

func voxel_texture_region(part: PartData) -> Rect2:
	var atlas_size := voxel_texture.get_size()
	var tile := VisualData.VOXEL_PART_TEXTURE_TILES.get(part.kind, Vector2i.ZERO) as Vector2i
	var tile_size := Vector2(atlas_size.x / VisualData.VOXEL_PART_TEXTURE_GRID.x, atlas_size.y / VisualData.VOXEL_PART_TEXTURE_GRID.y)
	return Rect2(Vector2(tile) * tile_size, tile_size)
