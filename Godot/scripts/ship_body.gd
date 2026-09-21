class_name ShipBody
extends RigidBody2D

const ShipModelScript = preload("res://scripts/ship_model.gd")
const BalanceData = preload("res://scripts/balance.gd")
const VisualData = preload("res://scripts/visual_tuning.gd")
const PhysicsData = preload("res://scripts/physics_tuning.gd")

var model = ShipModelScript.new()
var shield_layers := 0
var shield_recharge_left := 0.0
var break_shake := 0.0
var break_shake_time := 0.0
var laser_cooldown := 0.0
var missile_cooldown := 0.0
var mini_missile_cooldown := 0.0
var heat := 0.0
var shield_layer_bonus := 0
var shield_recharge_reduction := 0.0
var turret_target := Vector2.ZERO
var is_player := true
var active_exhausts: Dictionary = {}
var exhaust_particles: Dictionary = {}
var hull_bound_radius := 0.0

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
	refresh_mass()

func initialize_player() -> void:
	model.initialize_player()
	shield_layers = model.shield_capacity()
	refresh_mass()
	rebuild_exhaust_particles()
	queue_redraw()

func add_collision_shape() -> void:
	var collider := CollisionShape2D.new()
	var shape := RectangleShape2D.new()
	shape.size = PhysicsData.SHIP_COLLIDER_SIZE
	collider.shape = shape
	add_child(collider)

func refresh_mass() -> void:
	mass = model.total_mass()
	center_of_mass_mode = RigidBody2D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = model.center_of_mass()
	hull_bound_radius = model.bound_radius()

func refresh_part_tuning() -> void:
	for part in model.parts:
		var updated_hp := float(part.spec().get("hp", part.max_hp))
		part.max_hp = updated_hp
		part.hp = updated_hp
	refresh_mass()
	shield_layers = mini(shield_layers, shield_max_layers())
	rebuild_exhaust_particles()

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
	heat = maxf(0.0, heat - delta * (18.0 + float(model.parts.filter(func(part): return part.kind == "battery").size()) * 9.0))
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
	PhysicsData.apply_reference_damping(state, PhysicsData.PLAYER_LINEAR_RETAIN_PER_SECOND, PhysicsData.PLAYER_ANGULAR_RETAIN_PER_SECOND)
	var speed_limit := max_linear_speed()
	if state.linear_velocity.length_squared() > speed_limit * speed_limit:
		state.linear_velocity = state.linear_velocity.normalized() * speed_limit
	state.angular_velocity = clampf(state.angular_velocity, -PhysicsData.MAX_ANGULAR_SPEED, PhysicsData.MAX_ANGULAR_SPEED)

func apply_player_thrusters(forward: float, reverse: float, turn: float) -> void:
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
	for part in reverse_drives:
		apply_module_force(part, -module_thrust_axis(part) * float(part.spec().force) * reverse)
	for part in parts_with_actuator("turn"):
		var rcs_force := rcs_force_direction(part)
		if rcs_force.length() > 0.01 and absf(turn) > 0.01:
			apply_module_force(part, rcs_force * float(part.spec().force) * turn)
	sync_exhaust_particles()

func apply_neutral_braking() -> void:
	var local_velocity := linear_velocity.rotated(-rotation)
	var brake_speed := float(PhysicsData.NEUTRAL_BRAKE_SPEED)
	if local_velocity.x > 0.01:
		var reverse_input := clampf(local_velocity.x / brake_speed, 0.0, 1.0)
		var drives := parts_with_actuator("reverse")
		for part in drives:
			apply_module_force(part, -module_thrust_axis(part) * float(part.spec().force) * reverse_input)
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
	var full_speed := maxf(float(PhysicsData.NEUTRAL_ANGULAR_BRAKE_FULL_SPEED), 0.001)
	var turn_input := clampf(-angular_velocity / full_speed, -1.0, 1.0)
	if absf(turn_input) > 0.01:
		for part in parts_with_actuator("turn"):
			var rcs_force := rcs_force_direction(part)
			if rcs_force.length() > 0.01:
				apply_module_force(part, rcs_force * float(part.spec().force) * turn_input)

func parts_with_actuator(actuator: String) -> Array:
	return model.parts.filter(func(part): return part.spec().get("actuator", "") == actuator)

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

func balanced_linear_multipliers(drives: Array) -> Dictionary:
	var result := {}
	if drives.is_empty():
		return result
	var com := model.center_of_mass()
	var torque_coefficients: Array[float] = []
	for part in drives:
		var lever_arm := module_local_center(part) - com
		torque_coefficients.append(lever_arm.cross(module_thrust_axis(part)))
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
		var fire: CPUParticles2D = entry.fire
		var smoke: CPUParticles2D = entry.smoke
		if is_instance_valid(fire):
			fire.queue_free()
		if is_instance_valid(smoke):
			smoke.queue_free()
	exhaust_particles.clear()
	for part in model.parts:
		if part.spec().get("actuator", "") == "":
			continue
		var fire := make_exhaust_particles(false)
		var smoke := make_exhaust_particles(true)
		fire.position = module_local_center(part)
		smoke.position = fire.position
		add_child(fire)
		add_child(smoke)
		exhaust_particles[part.uid] = {"fire": fire, "smoke": smoke, "base_position": fire.position, "effect_visible": false, "effect_tier": 0}

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
		var active := not exhaust.is_empty()
		var direction: Vector2 = exhaust.get("direction", Vector2.LEFT)
		var tier := exhaust_effect_tier(float(exhaust.get("intensity", 0.0))) if active else 0
		var visible := tier > 0
		var was_visible := bool(entry.get("effect_visible", false))
		for particle in [entry.fire, entry.smoke]:
			if was_visible and not visible:
				particle.restart()
			particle.visible = visible
			particle.emitting = visible
			if visible:
				# direction은 함선 로컬 좌표 기준 배출 방향이다. 노드까지 회전하면
				# 같은 방향 변환이 두 번 적용되어 전진/RCS 화염이 반대로 보인다.
				particle.direction = direction
				particle.position = entry.base_position + direction * VisualData.THRUSTER_NOZZLE_OFFSET
				configure_exhaust_particle(particle, particle == entry.smoke, tier)
			else:
				particle.position = entry.base_position
		entry.effect_visible = visible
		entry.effect_tier = tier
		exhaust_particles[uid] = entry

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
	return module_local_center(part) - model.center_of_mass()

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
	return mini(int(BalanceData.SHIELD.max_layers), model.shield_capacity() + shield_layer_bonus)

func repair_all() -> void:
	for part in model.parts:
		part.hp = part.max_hp
	shield_layers = shield_max_layers()
	shield_recharge_left = 0.0

func damage_part(part: PartData, damage: float, _impulse: Vector2 = Vector2.ZERO) -> Array[PartData]:
	if shield_layers > 0:
		shield_layers -= 1
		shield_recharge_left = float(BalanceData.SHIELD.base_recharge)
		return []
	part.hp -= damage
	if part.hp > 0.0:
		return []
	var removed := model.remove(part.uid)
	if removed == null:
		return []
	break_shake = VisualData.WEAPON_BREAK_SHAKE if removed.kind in ["laser", "missile_launcher", "mini_missile_launcher", "machine_gun", "railgun"] else VisualData.STRUCTURE_BREAK_SHAKE
	break_shake_time = 0.16
	var detached := model.detach_disconnected()
	refresh_mass()
	rebuild_exhaust_particles()
	queue_redraw()
	return detached

func local_cell_at(world_point: Vector2) -> Vector2i:
	var local := to_local(world_point)
	return Vector2i(roundi(local.x / BalanceData.CELL), roundi(local.y / BalanceData.CELL))

func _draw() -> void:
	var hull_cells := model.occupied()
	var shake := Vector2.ZERO
	if break_shake_time > 0.0:
		shake = Vector2(sin(Time.get_ticks_msec() * 0.11), cos(Time.get_ticks_msec() * 0.16)) * break_shake
	for part in model.parts:
		draw_part(part, shake, hull_cells)
	if shield_layers > 0:
		var alpha: float = VisualData.SHIELD_LAYER_OPACITY[shield_layers]
		draw_arc(shake, 132.0, 0.0, TAU, 40, Color(0.22, 0.88, 1.0, alpha), 2.0, true)

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
			draw_rect(rect, fill, true)
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
