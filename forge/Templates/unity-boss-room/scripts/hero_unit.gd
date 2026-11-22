extends Node3D
const CharacterVisual = preload("res://scripts/character_visual.gd")
## Playable & AI-cooperative Hero unit implementing Boss Room's 4 classes:
##   1. Tank   - Melee Hammer, Q: ChargedShieldAction (blocks Boss Trample -> Stuns Boss!), E: Taunt Smash
##   2. Archer - 3D Arrow Shot (fx_arrrow), Q: Piercing PowerShot, E: Multi-Arrow Volley
##   3. Mage   - Arcane Bolt, Q: Healing Ring AOEAction (heals party), E: Arcane Nova AOE
##   4. Rogue  - Twin Blade Strike, Q: DashAttackAction, E: Smoke Evasion Strike

signal damaged(hero, amount: float)
signal downed(hero)
signal revived(hero)

const CLASS_STATS := {
	"tank": {
		"title": "Tank",
		"max_hp": 220.0,
		"speed": 6.4,
		"attack_range": 3.4,
		"attack_damage": 26.0,
		"attack_cd": 0.65,
		"q_name": "Charged Shield",
		"q_cd": 4.5,
		"e_name": "Hammer Smash",
		"e_cd": 5.5,
		"accent": Color(0.28, 0.72, 1.0),
	},
	"archer": {
		"title": "Archer",
		"max_hp": 140.0,
		"speed": 7.6,
		"attack_range": 13.5,
		"attack_damage": 24.0,
		"attack_cd": 0.55,
		"q_name": "Power Shot",
		"q_cd": 4.0,
		"e_name": "Arrow Volley",
		"e_cd": 6.0,
		"accent": Color(0.38, 0.95, 0.32),
	},
	"mage": {
		"title": "Mage",
		"max_hp": 130.0,
		"speed": 6.9,
		"attack_range": 12.0,
		"attack_damage": 22.0,
		"attack_cd": 0.65,
		"q_name": "Heal Ring AOE",
		"q_cd": 5.0,
		"e_name": "Arcane Nova",
		"e_cd": 6.5,
		"accent": Color(1.0, 0.45, 0.85),
	},
	"rogue": {
		"title": "Rogue",
		"max_hp": 150.0,
		"speed": 8.4,
		"attack_range": 3.0,
		"attack_damage": 32.0,
		"attack_cd": 0.42,
		"q_name": "Dash Attack",
		"q_cd": 3.5,
		"e_name": "Shadow Strike",
		"e_cd": 5.0,
		"accent": Color(0.85, 0.55, 1.0),
	},
}

var hero_class: String = "tank"
var display_name: String = "Tank"
var max_hp: float = 200.0
var hp: float = 200.0
var move_speed: float = 6.5
var attack_range: float = 3.2
var attack_damage: float = 24.0
var accent_color: Color = Color(0.3, 0.75, 1.0)

var is_player_controlled: bool = false
var is_downed: bool = false
var shield_active: bool = false
var shield_fully_charged: bool = false
var shield_timer: float = 0.0
var dash_timer: float = 0.0
var dash_velocity: Vector3 = Vector3.ZERO
var revive_progress: float = 0.0
var total_damage_dealt: float = 0.0
var total_healing_done: float = 0.0
var ai_think_timer: float = 0.0

var visual: CharacterVisual = null
var ring_mesh: MeshInstance3D = null
var ring_mat: StandardMaterial3D = null
var shield_aura: MeshInstance3D = null
var hp_bar_fill: MeshInstance3D = null


func setup(p_class: String, start_pos: Vector3) -> void:
	hero_class = p_class.to_lower()
	var cfg: Dictionary = CLASS_STATS.get(hero_class, CLASS_STATS["tank"])
	display_name = str(cfg["title"])
	max_hp = float(cfg["max_hp"])
	hp = max_hp
	move_speed = float(cfg["speed"])
	attack_range = float(cfg["attack_range"])
	attack_damage = float(cfg["attack_damage"])
	accent_color = cfg["accent"] as Color
	position = start_pos
	name = "Hero_" + display_name

	visual = CharacterVisual.new()
	visual.name = "Visual"
	add_child(visual)
	visual.setup(hero_class, 1.05)

	# Ground class selection ring
	ring_mesh = MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.92
	torus.outer_radius = 1.16
	ring_mesh.mesh = torus
	ring_mesh.position = Vector3(0.0, 0.09, 0.0)
	ring_mat = StandardMaterial3D.new()
	ring_mat.albedo_color = Color(accent_color.r, accent_color.g, accent_color.b, 0.85)
	ring_mat.emission_enabled = true
	ring_mat.emission = accent_color
	ring_mat.emission_energy_multiplier = 2.4
	ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring_mesh.material_override = ring_mat
	add_child(ring_mesh)

	# Tank ChargedShield sleek front glowing magic barrier ring (keeps Tank fully visible!)
	shield_aura = MeshInstance3D.new()
	var sh_torus := TorusMesh.new()
	sh_torus.inner_radius = 0.95
	sh_torus.outer_radius = 1.22
	shield_aura.mesh = sh_torus
	shield_aura.position = Vector3(0.0, 1.25, 1.15)
	shield_aura.rotation_degrees = Vector3(90.0, 0.0, 0.0)
	var smat := StandardMaterial3D.new()
	smat.albedo_color = Color(0.32, 0.85, 1.0, 0.58)
	smat.emission_enabled = true
	smat.emission = Color(0.28, 0.82, 1.0)
	smat.emission_energy_multiplier = 1.5
	smat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	smat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	smat.cull_mode = BaseMaterial3D.CULL_DISABLED
	shield_aura.material_override = smat
	shield_aura.visible = false
	add_child(shield_aura)

	# Compact floating world HP bar (billboarded with render_priority so green fill never Z-fights)
	var bar_bg := MeshInstance3D.new()
	var bg_quad := QuadMesh.new()
	bg_quad.size = Vector2(1.45, 0.14)
	bar_bg.mesh = bg_quad
	bar_bg.position = Vector3(0.0, 2.75, 0.0)
	var bg_mat := StandardMaterial3D.new()
	bg_mat.albedo_color = Color(0.06, 0.06, 0.1, 0.88)
	bg_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bg_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	bg_mat.render_priority = 1
	bar_bg.material_override = bg_mat
	add_child(bar_bg)

	hp_bar_fill = MeshInstance3D.new()
	var fill_quad := QuadMesh.new()
	fill_quad.size = Vector2(1.38, 0.1)
	hp_bar_fill.mesh = fill_quad
	hp_bar_fill.position = Vector3(0.0, 2.75, 0.0)
	var fmat := StandardMaterial3D.new()
	fmat.albedo_color = Color(0.24, 0.92, 0.38)
	fmat.emission_enabled = true
	fmat.emission = Color(0.2, 0.88, 0.35)
	fmat.emission_energy_multiplier = 1.1
	fmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fmat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	fmat.no_depth_test = true
	fmat.render_priority = 2
	hp_bar_fill.material_override = fmat
	add_child(hp_bar_fill)


func set_controlled(controlled: bool) -> void:
	is_player_controlled = controlled
	if ring_mat != null:
		ring_mat.emission_energy_multiplier = 3.8 if controlled else 1.4
		ring_mesh.scale = Vector3.ONE * (1.18 if controlled else 0.88)


func activate_charged_shield(duration: float = 3.4) -> void:
	if is_downed:
		return
	shield_active = true
	shield_fully_charged = true
	shield_timer = duration
	if shield_aura != null:
		shield_aura.visible = true
	if visual != null:
		visual.shield_raised = true


func trigger_dash(direction: Vector3, speed: float = 22.0, duration: float = 0.28) -> void:
	if is_downed:
		return
	var dir := Vector3(direction.x, 0.0, direction.z).normalized()
	if dir.length_squared() < 0.01:
		dir = -global_transform.basis.z
	dash_velocity = dir * speed
	dash_timer = duration
	look_at_flat(position + dir)
	if visual != null:
		visual.trigger_attack(0.32)


func take_damage(amount: float) -> float:
	if is_downed:
		return 0.0
	var actual: float = amount
	if shield_active:
		# ChargedShieldAction reduces damage 80% when fully charged
		actual = amount * (0.2 if shield_fully_charged else 0.5)
	hp = maxf(0.0, hp - actual)
	if visual != null:
		visual.trigger_hit_flash()
	_update_hp_bar()
	damaged.emit(self, actual)
	if hp <= 0.0:
		is_downed = true
		shield_active = false
		shield_fully_charged = false
		if shield_aura != null:
			shield_aura.visible = false
		if visual != null:
			visual.is_downed = true
			visual.shield_raised = false
		downed.emit(self)
	return actual


func heal(amount: float) -> float:
	if is_downed:
		return 0.0
	var before: float = hp
	hp = minf(max_hp, hp + amount)
	_update_hp_bar()
	return hp - before


func revive(hp_ratio: float = 0.65) -> void:
	if not is_downed:
		return
	is_downed = false
	revive_progress = 0.0
	hp = max_hp * hp_ratio
	if visual != null:
		visual.is_downed = false
	_update_hp_bar()
	revived.emit(self)


func look_at_flat(target_pos: Vector3) -> void:
	var dir := Vector3(target_pos.x - position.x, 0.0, target_pos.z - position.z)
	if dir.length_squared() > 0.001:
		rotation.y = atan2(dir.x, dir.z)


func step_hero(delta: float, move_vec: Vector3, arena_bounds: Rect2) -> void:
	if shield_timer > 0.0:
		shield_timer = maxf(0.0, shield_timer - delta)
		if shield_timer <= 0.0:
			shield_active = false
			shield_fully_charged = false
			if shield_aura != null:
				shield_aura.visible = false
			if visual != null:
				visual.shield_raised = false

	var speed_used: float = 0.0
	if not is_downed:
		if dash_timer > 0.0:
			dash_timer = maxf(0.0, dash_timer - delta)
			position += dash_velocity * delta
			speed_used = dash_velocity.length()
		elif move_vec.length_squared() > 0.001:
			var flat := Vector3(move_vec.x, 0.0, move_vec.z).normalized()
			var spd := move_speed * (0.55 if shield_active else 1.0)
			position += flat * spd * delta
			look_at_flat(position + flat)
			speed_used = spd

	position.x = clampf(position.x, arena_bounds.position.x, arena_bounds.position.x + arena_bounds.size.x)
	position.z = clampf(position.z, arena_bounds.position.y, arena_bounds.position.y + arena_bounds.size.y)

	if visual != null:
		visual.animate(delta, speed_used, dash_timer > 0.0)


func _update_hp_bar() -> void:
	if hp_bar_fill == null:
		return
	var ratio: float = clampf(hp / max_hp, 0.0, 1.0)
	hp_bar_fill.scale.x = maxf(0.01, ratio)
	hp_bar_fill.position.x = -0.71 * (1.0 - ratio)
	var mat: StandardMaterial3D = hp_bar_fill.material_override as StandardMaterial3D
	if mat != null:
		var col := Color(0.24, 0.92, 0.38) if ratio > 0.45 else (Color(0.98, 0.78, 0.2) if ratio > 0.2 else Color(0.95, 0.25, 0.22))
		mat.albedo_color = col
		mat.emission = col
