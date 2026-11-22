extends Node3D
class_name EnemyUnit
## Enemy unit for Boss Room: Imp Minions & the giant Imp Boss.
## Implements Unity Boss Room's TrampleAction (Windup -> Charging -> Stunned by Tank ChargedShield!),
## Melee Smash, and AOE Stomp + Imp Summon with clear ground telegraphs.

signal died(enemy: EnemyUnit)
signal stunned_by_shield(boss: EnemyUnit, blocker: HeroUnit)
signal telegraph_triggered(boss: EnemyUnit, pattern: String)

enum BossPattern { IDLE, MELEE_WINDUP, TRAMPLE_WINDUP, TRAMPLE_CHARGE, AOE_WINDUP, STUNNED }

var is_boss: bool = false
var enemy_name: String = "Imp"
var max_hp: float = 110.0
var hp: float = 110.0
var move_speed: float = 4.6
var is_dead: bool = false

var pattern: BossPattern = BossPattern.IDLE
var pattern_timer: float = 0.0
var pattern_cooldown: float = 1.6
var pattern_cycle: int = 0
var charge_direction: Vector3 = Vector3.FORWARD
var hit_during_charge: Dictionary = {}
var stun_count: int = 0

var visual: CharacterVisual = null
var telegraph_mesh: MeshInstance3D = null
var telegraph_mat: StandardMaterial3D = null
var stun_stars: Node3D = null
var hp_bar_fill: MeshInstance3D = null


func setup(p_is_boss: bool, start_pos: Vector3, idx: int = 0) -> void:
	is_boss = p_is_boss
	position = start_pos
	if is_boss:
		enemy_name = "Imp Boss"
		name = "ImpBoss"
		max_hp = 1200.0
		hp = max_hp
		move_speed = 4.4
	else:
		enemy_name = "Imp_" + str(idx)
		name = enemy_name
		max_hp = 115.0
		hp = max_hp
		move_speed = 5.1

	visual = CharacterVisual.new()
	visual.name = "Visual"
	add_child(visual)
	visual.setup("boss" if is_boss else "imp", 2.05 if is_boss else 0.92)

	# Ground telegraph decal mesh (red line for Trample, red ring for AOE/Melee)
	telegraph_mesh = MeshInstance3D.new()
	telegraph_mesh.name = "TelegraphDecal"
	telegraph_mesh.position = Vector3(0.0, 0.14, 0.0)
	telegraph_mat = StandardMaterial3D.new()
	telegraph_mat.albedo_color = Color(1.0, 0.18, 0.12, 0.52)
	telegraph_mat.emission_enabled = true
	telegraph_mat.emission = Color(1.0, 0.22, 0.1)
	telegraph_mat.emission_energy_multiplier = 3.0
	telegraph_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	telegraph_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	telegraph_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	telegraph_mesh.material_override = telegraph_mat
	telegraph_mesh.visible = false
	add_child(telegraph_mesh)

	# Stunned golden spinning stars above Boss head
	stun_stars = Node3D.new()
	stun_stars.position = Vector3(0.0, 5.1 if is_boss else 2.2, 0.0)
	stun_stars.visible = false
	add_child(stun_stars)
	var star_mat := StandardMaterial3D.new()
	star_mat.albedo_color = Color(1.0, 0.92, 0.2)
	star_mat.emission_enabled = true
	star_mat.emission = Color(1.0, 0.85, 0.15)
	star_mat.emission_energy_multiplier = 3.5
	star_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for i in 4:
		var ang: float = float(i) * PI * 0.5
		var orb := MeshInstance3D.new()
		var sp := SphereMesh.new()
		sp.radius = 0.24
		sp.height = 0.48
		orb.mesh = sp
		orb.position = Vector3(cos(ang) * 1.1, 0.0, sin(ang) * 1.1)
		orb.material_override = star_mat
		stun_stars.add_child(orb)

	# World HP bar for Imp minions only (Boss uses the big top HUD HP bar)
	if not is_boss:
		hp_bar_fill = MeshInstance3D.new()
		var fquad := QuadMesh.new()
		fquad.size = Vector2(1.25, 0.12)
		hp_bar_fill.mesh = fquad
		hp_bar_fill.position = Vector3(0.0, 2.35, 0.0)
		var hmat := StandardMaterial3D.new()
		hmat.albedo_color = Color(0.95, 0.2, 0.18)
		hmat.emission_enabled = true
		hmat.emission = Color(0.95, 0.18, 0.15)
		hmat.emission_energy_multiplier = 1.1
		hmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		hmat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		hp_bar_fill.material_override = hmat
		add_child(hp_bar_fill)


func get_pattern_label() -> String:
	match pattern:
		BossPattern.MELEE_WINDUP:
			return "HAMMER SMASH (Telegraph)"
		BossPattern.TRAMPLE_WINDUP:
			return "TRAMPLE CHARGE (Raise Tank Shield!)"
		BossPattern.TRAMPLE_CHARGE:
			return "TRAMPLE CHARGING!"
		BossPattern.AOE_WINDUP:
			return "IMP STOMP AOE (Spread Out!)"
		BossPattern.STUNNED:
			return "STUNNED! (2x Vulnerability)"
		_:
			return "PURSUING PARTY"


func take_damage(amount: float) -> float:
	if is_dead:
		return 0.0
	var mult: float = 1.75 if pattern == BossPattern.STUNNED else 1.0
	var actual: float = amount * mult
	hp = maxf(0.0, hp - actual)
	if visual != null:
		visual.trigger_hit_flash()
	if hp_bar_fill != null:
		var ratio := clampf(hp / max_hp, 0.0, 1.0)
		hp_bar_fill.scale.x = maxf(0.01, ratio)
	if hp <= 0.0:
		is_dead = true
		telegraph_mesh.visible = false
		stun_stars.visible = false
		visible = false
		died.emit(self)
	return actual


func start_trample_toward(target_pos: Vector3) -> void:
	if is_dead:
		return
	var dir := Vector3(target_pos.x - position.x, 0.0, target_pos.z - position.z).normalized()
	if dir.length_squared() < 0.01:
		dir = Vector3(0.0, 0.0, 1.0)
	charge_direction = dir
	rotation.y = atan2(dir.x, dir.z)
	pattern = BossPattern.TRAMPLE_WINDUP
	pattern_timer = 1.05
	hit_during_charge.clear()
	_show_line_telegraph(15.0, 3.2)
	ActionBus.broadcast_telegraph(name, "trample", position, dir, 15.0, 1.05)
	telegraph_triggered.emit(self, "trample")


func start_aoe_stomp() -> void:
	if is_dead:
		return
	pattern = BossPattern.AOE_WINDUP
	pattern_timer = 1.1
	_show_circle_telegraph(6.4)
	ActionBus.broadcast_telegraph(name, "aoe", position, Vector3.ZERO, 6.4, 1.1)
	telegraph_triggered.emit(self, "aoe")


func start_melee_smash(target_pos: Vector3) -> void:
	if is_dead:
		return
	look_at_flat(target_pos)
	pattern = BossPattern.MELEE_WINDUP
	pattern_timer = 0.65
	_show_circle_telegraph(4.2)
	ActionBus.broadcast_telegraph(name, "melee", position, Vector3.ZERO, 4.2, 0.65)
	telegraph_triggered.emit(self, "melee")


func apply_stun(duration: float, blocker: HeroUnit) -> void:
	pattern = BossPattern.STUNNED
	pattern_timer = duration
	stun_count += 1
	telegraph_mesh.visible = false
	stun_stars.visible = true
	if visual != null:
		visual.is_stunned = true
		visual.trigger_hit_flash(0.08)
	stunned_by_shield.emit(self, blocker)


func look_at_flat(target_pos: Vector3) -> void:
	var dir := Vector3(target_pos.x - position.x, 0.0, target_pos.z - position.z)
	if dir.length_squared() > 0.001:
		rotation.y = atan2(dir.x, dir.z)


func _show_line_telegraph(length: float, width: float) -> void:
	var box := BoxMesh.new()
	box.size = Vector3(width, 0.06, length)
	telegraph_mesh.mesh = box
	telegraph_mesh.position = Vector3(0.0, 0.14, length * 0.5)
	telegraph_mat.albedo_color = Color(1.0, 0.18, 0.1, 0.55)
	telegraph_mat.emission = Color(1.0, 0.2, 0.08)
	telegraph_mesh.visible = true


func _show_circle_telegraph(radius: float) -> void:
	var cyl := CylinderMesh.new()
	cyl.top_radius = radius
	cyl.bottom_radius = radius
	cyl.height = 0.06
	cyl.radial_segments = 32
	telegraph_mesh.mesh = cyl
	telegraph_mesh.position = Vector3(0.0, 0.14, 0.0)
	telegraph_mat.albedo_color = Color(1.0, 0.3, 0.12, 0.45)
	telegraph_mat.emission = Color(1.0, 0.35, 0.1)
	telegraph_mesh.visible = true


func step_enemy(delta: float, heroes: Array[HeroUnit], arena_bounds: Rect2, on_aoe_burst: Callable) -> void:
	if is_dead:
		return

	var target: HeroUnit = _pick_nearest_living_hero(heroes)
	var moved_speed: float = 0.0

	if pattern == BossPattern.STUNNED:
		stun_stars.rotate_y(delta * 4.5)
		pattern_timer -= delta
		if pattern_timer <= 0.0:
			pattern = BossPattern.IDLE
			pattern_cooldown = 1.4
			stun_stars.visible = false
			if visual != null:
				visual.is_stunned = false
		if visual != null:
			visual.animate(delta, 0.0, false)
		return

	if not is_boss:
		# Imp minion simple chase + melee poke
		pattern_cooldown = maxf(0.0, pattern_cooldown - delta)
		if target != null:
			var dist := position.distance_to(target.position)
			look_at_flat(target.position)
			if dist > 2.2:
				var step := (target.position - position).normalized() * move_speed * delta
				position += Vector3(step.x, 0.0, step.z)
				moved_speed = move_speed
			elif pattern_cooldown <= 0.0:
				pattern_cooldown = 1.45
				if visual != null:
					visual.trigger_attack(0.3)
				target.take_damage(14.0)
		_clamp_bounds(arena_bounds)
		if visual != null:
			visual.animate(delta, moved_speed, false)
		return

	# Imp Boss state machine
	match pattern:
		BossPattern.IDLE:
			pattern_cooldown = maxf(0.0, pattern_cooldown - delta)
			if target != null:
				var dist := position.distance_to(target.position)
				look_at_flat(target.position)
				if dist > 3.6:
					var dir := (target.position - position).normalized()
					position += Vector3(dir.x, 0.0, dir.z) * move_speed * delta
					moved_speed = move_speed
				if pattern_cooldown <= 0.0:
					pattern_cycle += 1
					if pattern_cycle % 3 == 1:
						start_trample_toward(target.position)
					elif pattern_cycle % 3 == 2:
						start_aoe_stomp()
					else:
						start_melee_smash(target.position)

		BossPattern.MELEE_WINDUP:
			pattern_timer -= delta
			if pattern_timer <= 0.0:
				telegraph_mesh.visible = false
				if visual != null:
					visual.trigger_attack(0.4)
				for h in heroes:
					if not h.is_downed and position.distance_to(h.position) <= 4.5:
						h.take_damage(32.0)
				pattern = BossPattern.IDLE
				pattern_cooldown = 1.5

		BossPattern.TRAMPLE_WINDUP:
			pattern_timer -= delta
			if pattern_timer <= 0.0:
				pattern = BossPattern.TRAMPLE_CHARGE
				pattern_timer = 0.85
				telegraph_mesh.visible = false

		BossPattern.TRAMPLE_CHARGE:
			pattern_timer -= delta
			var charge_spd: float = 19.5
			position += charge_direction * charge_spd * delta
			moved_speed = charge_spd
			# Check hero collisions during Trample
			for h in heroes:
				if h.is_downed or hit_during_charge.has(h.name):
					continue
				if position.distance_to(h.position) <= 2.9:
					hit_during_charge[h.name] = true
					if h.hero_class == "tank" and h.shield_active and h.shield_fully_charged:
						# Authentic Unity Boss Room counter-mechanic: Tank ChargedShield STUNS the trampling Boss!
						apply_stun(3.2, h)
						return
					else:
						h.take_damage(44.0)
			if pattern_timer <= 0.0:
				pattern = BossPattern.IDLE
				pattern_cooldown = 1.65

		BossPattern.AOE_WINDUP:
			pattern_timer -= delta
			if pattern_timer <= 0.0:
				telegraph_mesh.visible = false
				if visual != null:
					visual.trigger_attack(0.45)
				for h in heroes:
					if not h.is_downed and position.distance_to(h.position) <= 6.6:
						h.take_damage(36.0)
				if on_aoe_burst.is_valid():
					on_aoe_burst.call(position)
				pattern = BossPattern.IDLE
				pattern_cooldown = 2.0

	_clamp_bounds(arena_bounds)
	if visual != null:
		visual.animate(delta, moved_speed, pattern == BossPattern.TRAMPLE_CHARGE)


func _clamp_bounds(b: Rect2) -> void:
	position.x = clampf(position.x, b.position.x, b.position.x + b.size.x)
	position.z = clampf(position.z, b.position.y, b.position.y + b.size.y)


func _pick_nearest_living_hero(heroes: Array[HeroUnit]) -> HeroUnit:
	var best: HeroUnit = null
	var best_d := 9999.0
	for h in heroes:
		if h.is_downed:
			continue
		var d := position.distance_to(h.position)
		if d < best_d:
			best_d = d
			best = h
	return best
