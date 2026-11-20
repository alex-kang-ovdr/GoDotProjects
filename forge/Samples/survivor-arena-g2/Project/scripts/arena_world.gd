extends Node3D
## Render-only 3D view of the deterministic arena simulation.
## A logical coordinate (x, y) is rendered at (x / 40, 0, y / 40).
## The camera never rotates around Y, so negative logical Y always goes up-screen.

const UNIT: float = 40.0
const ENEMY_COLORS: Dictionary = {
	"grunt": Color("91c980"), "runner": Color("efa966"),
	"tank": Color("958ac8"), "ranged": Color("69bfd2"),
	"elite": Color("f5bd65"), "splitter": Color("b896dc"),
	"sniper": Color("ed8fb1"), "mini": Color("c4a7e6"),
	"boss": Color("e66686")
}

var camera: Camera3D
var sunlight: DirectionalLight3D
var environment: Environment
var _ready_world: bool = false
var _high_quality: bool = true
var _chapter: int = -1
var _clock: float = 0.0
var _camera_focus: Vector3 = Vector3.ZERO
var _scene_origin: Vector3 = Vector3(999999, 0, 999999)
var _ground: MeshInstance3D
var _ground_material: ShaderMaterial
var _scenery: Node3D
var _lobby: Node3D
var _hero: Dictionary = {}
var _batches: Dictionary = {}
var _counts: Dictionary = {}
var _materials: Dictionary = {}
var _mesh_box: BoxMesh
var _mesh_sphere: SphereMesh
var _mesh_ring: TorusMesh
var _mesh_disc: CylinderMesh
var _last_state: String = ""
var _last_weapon: String = ""
var _hero_weapon: Node3D
var _floating_labels: Array[Label3D] = []
var _preview_weapon: String = "kunai"
var _last_evolved: bool = false
var _screen_shake: bool = true
var _damage_numbers: bool = true
var _run_id: String = ""
var _last_damage_total: float = 0.0
var _last_shot_id: int = 0
var _last_area_id: int = 0
var _recoil: float = 0.0
var _shot_flash: float = 0.0
var _shot_angle: float = 0.0
var _aim_left: float = 0.0
var _hit_feedback: float = 0.0
var _shake_offset: Vector3 = Vector3.ZERO
var _scenery_signature: String = ""

func setup() -> void:
	if _ready_world:
		return
	_ready_world = true
	_mesh_box = BoxMesh.new()
	_mesh_box.size = Vector3.ONE
	_mesh_sphere = SphereMesh.new()
	_mesh_sphere.radius = 0.5
	_mesh_sphere.height = 1.0
	_mesh_sphere.radial_segments = 10
	_mesh_sphere.rings = 5
	_mesh_ring = TorusMesh.new()
	_mesh_ring.inner_radius = 0.94
	_mesh_ring.outer_radius = 1.0
	_mesh_ring.rings = 32
	_mesh_ring.ring_segments = 6
	_mesh_disc = CylinderMesh.new()
	_mesh_disc.top_radius = 1.0
	_mesh_disc.bottom_radius = 1.0
	_mesh_disc.height = 0.02
	_mesh_disc.radial_segments = 32

	var env_node = WorldEnvironment.new()
	environment = Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("102c34")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("c5dedc")
	environment.ambient_light_energy = 0.35
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.fog_enabled = true
	environment.fog_light_color = Color("284a51")
	environment.fog_density = 0.004
	env_node.environment = environment
	add_child(env_node)

	sunlight = DirectionalLight3D.new()
	sunlight.rotation_degrees = Vector3(-58, -34, 0)
	sunlight.light_color = Color("ffe5bb")
	sunlight.light_energy = 1.05
	sunlight.shadow_enabled = true
	sunlight.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sunlight.directional_shadow_max_distance = 65.0
	# Preserve color on block tops; default-scale depth offsets avoid shadow acne
	# on the many flat faces under Compatibility / software OpenGL.
	sunlight.shadow_bias = 0.12
	sunlight.shadow_normal_bias = 2.0
	sunlight.directional_shadow_blend_splits = true
	add_child(sunlight)

	var fill = DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-30, 145, 0)
	fill.light_color = Color("8bd8eb")
	fill.light_energy = 0.16
	add_child(fill)

	camera = Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	camera.size = 22.0
	camera.near = 0.1
	camera.far = 180.0
	camera.current = true
	add_child(camera)

	_ground_material = _make_ground_material()
	_ground = MeshInstance3D.new()
	var ground_mesh = PlaneMesh.new()
	ground_mesh.size = Vector2(180, 180)
	_ground.mesh = ground_mesh
	_ground.material_override = _ground_material
	_ground.position.y = -0.04
	_ground.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_ground)
	_scenery = Node3D.new()
	add_child(_scenery)

	_make_batch("actors", _mesh_box, 4096, _vertex_material(false, false), true)
	_make_batch("glow", _mesh_box, 3072, _vertex_material(true, false), false)
	_make_batch("orbs", _mesh_sphere, 1536, _vertex_material(true, false), false)
	_make_batch("crystals", _diamond_mesh(), 720, _vertex_material(false, false), false)
	_make_batch("rings", _mesh_ring, 420, _vertex_material(true, true), false)
	_make_batch("telegraphs", _mesh_box, 768, _vertex_material(true, true), false)
	_make_batch("discs", _mesh_disc, 640, _vertex_material(true, true), false)
	_make_batch("shadows", _mesh_disc, 400, _vertex_material(true, true), false)
	_make_batch("trails", _mesh_box, 2048, _vertex_material(true, true), false)
	_make_batch("debris", _mesh_box, 768, _vertex_material(false, false), false)
	_hero = _make_hero()
	add_child(_hero.root)
	_make_lobby()
	set_chapter(0)
	var floating_font: Font = load("res://assets/ArenaSans.ttf") if ResourceLoader.exists("res://assets/ArenaSans.ttf") else null
	for i in range(28):
		var label = Label3D.new()
		if floating_font != null:
			label.font = floating_font
		label.no_depth_test = true
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.font_size = 36
		label.pixel_size = 0.008
		label.outline_size = 9
		label.outline_modulate = Color(0.04, 0.09, 0.11, 0.85)
		label.visible = false
		add_child(label)
		_floating_labels.append(label)

func set_quality(high: bool) -> void:
	_high_quality = high
	if is_instance_valid(sunlight):
		sunlight.shadow_enabled = high
	if is_instance_valid(camera):
		get_viewport().msaa_3d = Viewport.MSAA_2X if high else Viewport.MSAA_DISABLED

func apply_settings(options: Dictionary) -> void:
	if options.has("quality"):
		set_quality(bool(options.quality))
	if options.has("screen_shake"):
		_screen_shake = bool(options.screen_shake)
		if not _screen_shake:
			_shake_offset = Vector3.ZERO
	if options.has("damage_numbers"):
		_damage_numbers = bool(options.damage_numbers)

func set_preview(chapter: int, weapon: String) -> void:
	set_chapter(chapter)
	_preview_weapon = weapon if weapon in ["kunai", "bat", "katana", "shotgun", "revolver"] else "kunai"

func set_chapter(chapter: int) -> void:
	if not _ready_world:
		setup()
	chapter = clampi(chapter, 0, 2)
	if _chapter == chapter:
		return
	_chapter = chapter
	var palettes = [
		["42655b", "3c5e55", "263c43", "7a9584", "a7c6a8"],
		["aa8c61", "9f8058", "695d4a", "c5ac7e", "e3c795"],
		["688e9a", "628592", "3c5e70", "b0d4d2", "d5ece7"]
	]
	var p: Array = palettes[chapter]
	_ground_material.set_shader_parameter("tile_a", Color(p[0]))
	_ground_material.set_shader_parameter("tile_b", Color(p[1]))
	_ground_material.set_shader_parameter("road_color", Color(p[2]))
	_ground_material.set_shader_parameter("curb_color", Color(p[3]))
	_ground_material.set_shader_parameter("line_color", Color(p[4]))
	_ground_material.set_shader_parameter("biome", chapter)
	environment.fog_light_color = [Color("284a51"), Color("9d886e"), Color("607f94")][chapter]
	environment.background_color = [Color("102c34"), Color("554b3d"), Color("2b4a60")][chapter]
	sunlight.light_color = [Color("ffe5bb"), Color("ffe0b2"), Color("dcecff")][chapter]
	sunlight.light_energy = [1.05, 1.0, 0.98][chapter]
	_rebuild_scenery()

func sync(sim, dt: float) -> void:
	if not _ready_world:
		setup()
	var visual_dt: float = maxf(dt, 0.0) if sim.state in ["menu", "playing"] else 0.0
	_clock += visual_dt
	var menu: bool = sim.state == "menu"
	var chapter: int = int(sim.config.get("chapter", 0))
	# A menu preview is independent of the last completed / active run config.
	if not menu and chapter != _chapter:
		set_chapter(chapter)
	var p: Dictionary = sim.player
	var weapon: String = _preview_weapon if menu else str(sim.config.get("weapon", "kunai"))
	_update_feedback(sim, visual_dt, weapon, menu)
	var logical: Vector2 = p.get("pos", Vector2.ZERO)
	var center = _world(logical)
	var target_focus = center
	if menu:
		target_focus = Vector3(-3.7, 0, 0)
	if _last_state == "" or (menu != (_last_state == "menu")):
		_camera_focus = target_focus
	else:
		_camera_focus = _camera_focus.lerp(target_focus, 1.0 - exp(-visual_dt * 9.0))
	var screen_size: Vector2 = get_viewport().get_visible_rect().size
	var aspect: float = screen_size.x / maxf(1.0, screen_size.y)
	var target_size: float = 17.5 if menu else 22.0
	if aspect < 0.9:
		target_size = 24.0 if menu else 27.0
	camera.size = lerpf(camera.size, target_size, minf(1.0, visual_dt * 7.0))
	camera.position = _camera_focus + _shake_offset + Vector3(0, 24, 19)
	camera.look_at(_camera_focus + _shake_offset, Vector3.UP)
	_ground.position.x = _camera_focus.x
	_ground.position.z = _camera_focus.z
	var snapped = Vector3(floorf(center.x / 32.0 + 0.5) * 32, 0, floorf(center.z / 32.0 + 0.5) * 32)
	if menu:
		snapped = Vector3.ZERO
	if snapped != _scene_origin:
		_scene_origin = snapped
		_scenery.position = snapped
	_lobby.visible = menu
	for key in _batches:
		_counts[key] = 0
	for label in _floating_labels:
		label.visible = false
	var hero_position = Vector3(2.3, 0, 1.0) if menu else center
	var hero_facing: float = 1.15 if menu else float(p.get("facing", PI * 0.5))
	if not menu and weapon == "revolver" and _aim_left > 0.0:
		hero_facing = _shot_angle
	var moving: bool = false if menu else bool(p.get("moving", false))
	var hero_scale: float = 1.55 if menu else 1.0
	var hero_root: Node3D = _hero.root
	hero_root.position = hero_position
	hero_root.rotation.y = -hero_facing + PI * 0.5
	hero_root.scale = Vector3.ONE * hero_scale
	var stride: float = sin(_clock * 12.0) * 0.64 if moving else sin(_clock * 1.8) * 0.025
	_hero.left_arm.rotation.x = stride
	_hero.right_arm.rotation.x = -stride * 0.65 - 0.15 - _recoil * 0.27
	_hero.left_leg.rotation.x = -stride
	_hero.right_leg.rotation.x = stride
	_hero.body.position.y = 0.06 * absf(sin(_clock * 12.0)) if moving else sin(_clock * 2.1) * 0.025
	hero_root.visible = menu or float(p.get("invuln", 0.0)) < 0.05 or int(_clock * 18) % 3 != 0
	var evolved: bool = not menu and bool(p.get("evolved", {}).get(weapon, false))
	if _last_weapon != weapon or _last_evolved != evolved:
		_update_hero_weapon(weapon, evolved)
	_hero_weapon.position.z = 0.13 - _recoil * 0.075
	_inst("shadows", _transform(hero_position + Vector3(0, 0.005, 0), Vector3(0.65, 1, 0.48) * hero_scale), Color(0.03, 0.08, 0.09, 0.28))
	_inst("rings", _transform(hero_position + Vector3(0, 0.025, 0), Vector3(0.69, 0.09, 0.69) * hero_scale), Color("86f4cf"))
	if menu:
		_draw_lobby_actors()
	else:
		# Reserve warning geometry before optional crowded combat effects.
		_draw_threats(sim.threats)
		_draw_enemies(sim.enemies, logical)
		_draw_projectiles(sim.shots, false, p.get("evolved", {}))
		_draw_projectiles(sim.enemy_shots, true)
		_draw_gems(sim.gems)
		_draw_areas(sim.areas)
		_draw_effects(sim.effects)
		_draw_companions(sim)
		_draw_attack_feedback(hero_position, weapon, evolved)
		_draw_encounter(sim)
	for key in _batches:
		var batch: MultiMesh = _batches[key].multimesh
		batch.visible_instance_count = int(_counts[key])
	_last_state = sim.state

func _update_feedback(sim, dt: float, weapon: String, menu: bool) -> void:
	var current_run: String = str(sim.get("run_id"))
	if current_run != _run_id or menu:
		_run_id = current_run
		_last_damage_total = float(sim.stats.get("taken", 0.0))
		_last_shot_id = 0
		_last_area_id = 0
		_recoil = 0.0
		_shot_flash = 0.0
		_aim_left = 0.0
		_hit_feedback = 0.0
		_shake_offset = Vector3.ZERO
	if menu:
		return
	# Cosmetic clocks use playing time only. Pausing never drains an impact,
	# changes a particle trajectory, or consumes the simulation's random state.
	_recoil = maxf(0.0, _recoil - dt * 8.0)
	_shot_flash = maxf(0.0, _shot_flash - dt)
	_aim_left = maxf(0.0, _aim_left - dt)
	_hit_feedback = maxf(0.0, _hit_feedback - dt * 3.6)
	if sim.state == "playing":
		var damage_total: float = float(sim.stats.get("taken", 0.0))
		if damage_total > _last_damage_total:
			_hit_feedback = minf(1.0, 0.45 + (damage_total - _last_damage_total) / 55.0)
		_last_damage_total = damage_total
		var latest: int = _last_shot_id
		for shot in sim.shots:
			var shot_id: int = int(shot.get("id", 0))
			latest = maxi(latest, shot_id)
			if shot_id <= _last_shot_id or str(shot.get("source", shot.get("kind", ""))) != weapon:
				continue
			if (shot.get("pos", Vector2.ZERO) as Vector2).distance_squared_to(sim.player.pos) > 10000.0:
				continue
			_recoil = 1.0
			_shot_flash = 0.085 if weapon == "shotgun" else 0.065
			_aim_left = 0.28
			_shot_angle = (shot.get("velocity", Vector2.RIGHT) as Vector2).angle()
		_last_shot_id = latest
		var newest_area: int = _last_area_id
		for area in sim.areas:
			var area_id: int = int(area.get("id", 0))
			newest_area = maxi(newest_area, area_id)
			if area_id > _last_area_id and area.get("kind", "") == "slash" and weapon == "bat":
				_recoil = 1.0
		_last_area_id = newest_area
	if _screen_shake and _hit_feedback > 0.0:
		var amplitude: float = _hit_feedback * _hit_feedback * 0.14
		_shake_offset = Vector3(sin(_clock * 83.0), 0, cos(_clock * 71.0)) * amplitude
	else:
		_shake_offset = Vector3.ZERO

func _draw_attack_feedback(hero_position: Vector3, weapon: String, evolved: bool) -> void:
	if _shot_flash > 0.0 and weapon in ["shotgun", "revolver"]:
		var muzzle: Vector3 = _hero_weapon.to_global(Vector3(0, 0.12, 0.67))
		var forward: Vector3 = _world(Vector2.from_angle(_shot_angle) * UNIT)
		var side: Vector3 = Vector3(forward.z, 0, -forward.x)
		var strength: float = _shot_flash / (0.085 if weapon == "shotgun" else 0.065)
		var color: Color = Color("bffff0") if evolved else Color("ffd18e")
		_line(muzzle, muzzle + forward * (0.3 + strength * 0.32), 0.11 * strength, color)
		_line(muzzle + side * 0.16 * strength, muzzle - side * 0.16 * strength, 0.08, Color("fff6da"))
		_inst("orbs", _transform(muzzle, Vector3.ONE * 0.22 * strength), Color("fff9e0"))
	if _hit_feedback > 0.0:
		# Impact outlines are distinct from enemy ground warnings and remain
		# visible with camera shake disabled.
		_inst("rings", _transform(hero_position + Vector3(0, 0.04, 0), Vector3(0.65 + (1.0 - _hit_feedback) * 0.6, 0.1, 0.65 + (1.0 - _hit_feedback) * 0.6)), Color(1.0, 0.46, 0.56, _hit_feedback * 0.65))

func _draw_encounter(sim) -> void:
	var value = sim.get("encounter")
	if not value is Dictionary or not value.get("active", false):
		return
	var intro: float = float(value.get("intro_left", 0.0))
	if intro <= 0.0:
		return
	var boss: Dictionary = {}
	for enemy in sim.enemies:
		if int(enemy.get("id", 0)) == int(value.get("boss_id", -1)):
			boss = enemy
			break
	if boss.is_empty():
		return
	var p: Vector3 = _world(boss.pos)
	var radius: float = maxf(1.0, float(boss.get("r", 30.0)) / UNIT * 1.8)
	var fade: float = clampf(intro / 0.4, 0, 1)
	for i in range(4):
		var a: float = i * TAU / 4.0 + PI * 0.25
		var q: Vector3 = p + Vector3(cos(a), 0, sin(a)) * radius
		_inst("glow", _transform(q + Vector3(0, 1.0 + (1.6 - intro) * 0.5, 0), Vector3(0.055, 2.0 * fade, 0.055)), Color("e4ceff"))
	_inst("rings", _transform(p + Vector3(0, 0.035, 0), Vector3(radius, 0.1, radius)), Color(0.75, 0.66, 1.0, fade * 0.8))

func _world(pos: Vector2, elevation: float = 0.0) -> Vector3:
	return Vector3(pos.x / UNIT, elevation, pos.y / UNIT)

func _transform(pos: Vector3, size: Vector3, yaw: float = 0.0) -> Transform3D:
	# Dimensions describe the mesh's local axes. Global nonuniform scaling
	# after rotation shears diagonals and changes a warning's endpoints/width.
	return Transform3D(Basis(Vector3.UP, yaw).scaled_local(size), pos)

func _vertex_material(unlit: bool, transparent: bool) -> StandardMaterial3D:
	var material = StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	material.roughness = 0.9
	if unlit:
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	if transparent:
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.cull_mode = BaseMaterial3D.CULL_DISABLED
		material.no_depth_test = false
	return material

func _mat(color: Color, unlit: bool = false) -> StandardMaterial3D:
	var key: String = color.to_html() + str(unlit)
	if _materials.has(key):
		return _materials[key]
	var material = StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.82
	if unlit:
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	if color.a < 0.99:
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_materials[key] = material
	return material

func _make_batch(key: String, mesh: Mesh, capacity: int, material: Material, shadows: bool) -> void:
	var multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.mesh = mesh
	multimesh.instance_count = capacity
	multimesh.visible_instance_count = 0
	var instance = MultiMeshInstance3D.new()
	instance.multimesh = multimesh
	instance.material_override = material
	instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	instance.custom_aabb = AABB(Vector3(-20000, -10, -20000), Vector3(40000, 50, 40000))
	add_child(instance)
	_batches[key] = instance
	_counts[key] = 0

func _inst(key: String, transform: Transform3D, color: Color) -> void:
	var index: int = int(_counts.get(key, 0))
	var mesh: MultiMesh = _batches[key].multimesh
	if index >= mesh.instance_count:
		return
	mesh.set_instance_transform(index, transform)
	mesh.set_instance_color(index, color)
	_counts[key] = index + 1

func _box(parent: Node3D, pos: Vector3, size: Vector3, color: Color, unlit: bool = false) -> MeshInstance3D:
	var node = MeshInstance3D.new()
	node.mesh = _mesh_box
	node.material_override = _mat(color, unlit)
	node.position = pos
	node.scale = size
	parent.add_child(node)
	return node

func _make_hero() -> Dictionary:
	var root = Node3D.new()
	var body = Node3D.new()
	root.add_child(body)
	var skin = Color("f1cc9a")
	var suit = Color("438c83")
	var armor = Color("73c6ac")
	var dark = Color("193b48")
	_box(body, Vector3(0, 0.98, 0), Vector3(0.73, 0.68, 0.4), suit)
	_box(body, Vector3(0, 1.05, 0.23), Vector3(0.56, 0.44, 0.13), armor)
	_box(body, Vector3(-0.17, 1.13, 0.31), Vector3(0.16, 0.2, 0.06), Color("f4cc77"))
	_box(body, Vector3(0.18, 1.14, 0.315), Vector3(0.16, 0.045, 0.045), Color("d0ffda"), true)
	_box(body, Vector3(0, 0.64, 0.01), Vector3(0.78, 0.12, 0.48), dark)
	_box(body, Vector3(0, 0.66, 0.28), Vector3(0.17, 0.1, 0.07), Color("efc56b"))
	_box(body, Vector3(0, 1.04, -0.33), Vector3(0.53, 0.57, 0.3), dark)
	_box(body, Vector3(0, 1.09, -0.495), Vector3(0.32, 0.1, 0.06), Color("76d8bc"), true)
	_box(body, Vector3(0, 1.59, 0), Vector3(0.65, 0.61, 0.59), skin)
	_box(body, Vector3(0, 1.85, -0.03), Vector3(0.75, 0.2, 0.69), dark)
	_box(body, Vector3(0, 1.72, -0.27), Vector3(0.73, 0.35, 0.2), dark)
	_box(body, Vector3(0, 1.76, 0.31), Vector3(0.8, 0.11, 0.27), armor)
	_box(body, Vector3(0, 1.58, 0.305), Vector3(0.53, 0.2, 0.08), Color("183740"))
	_box(body, Vector3(0, 1.61, 0.355), Vector3(0.43, 0.08, 0.025), Color("b5ffe0"), true)
	_box(body, Vector3(0.38, 1.58, 0), Vector3(0.13, 0.22, 0.25), dark)
	_box(body, Vector3(-0.38, 1.58, 0), Vector3(0.13, 0.22, 0.25), dark)
	_box(body, Vector3(-0.41, 1.9, -0.12), Vector3(0.045, 0.45, 0.045), dark)
	_box(body, Vector3(-0.41, 2.12, -0.12), Vector3(0.075, 0.08, 0.075), Color("fdc57b"), true)
	var limbs: Dictionary = {}
	for side in [-1, 1]:
		var arm = Node3D.new()
		arm.position = Vector3(side * 0.5, 1.23, 0)
		body.add_child(arm)
		_box(arm, Vector3(0, -0.22, 0), Vector3(0.3, 0.47, 0.34), suit)
		_box(arm, Vector3(0, -0.04, 0), Vector3(0.34, 0.22, 0.4), armor)
		_box(arm, Vector3(0, -0.52, 0.02), Vector3(0.28, 0.21, 0.29), skin)
		_box(arm, Vector3(0, -0.43, 0.02), Vector3(0.32, 0.12, 0.33), dark)
		var leg = Node3D.new()
		leg.position = Vector3(side * 0.22, 0.63, 0)
		root.add_child(leg)
		_box(leg, Vector3(0, -0.21, 0), Vector3(0.31, 0.41, 0.36), Color("274d58"))
		_box(leg, Vector3(0, -0.46, 0.06), Vector3(0.36, 0.22, 0.48), dark)
		limbs["left_arm" if side == -1 else "right_arm"] = arm
		limbs["left_leg" if side == -1 else "right_leg"] = leg
	limbs.root = root
	limbs.body = body
	return limbs

func _update_hero_weapon(kind: String, evolved: bool = false) -> void:
	_last_weapon = kind
	_last_evolved = evolved
	if is_instance_valid(_hero_weapon):
		_hero_weapon.get_parent().remove_child(_hero_weapon)
		_hero_weapon.queue_free()
	_hero_weapon = Node3D.new()
	var arm: Node3D = _hero.right_arm
	arm.add_child(_hero_weapon)
	_hero_weapon.position = Vector3(0, -0.5, 0.13)
	var dark = Color("233b46")
	var metal = Color("f1d794") if evolved else Color("c9dfd8")
	if kind == "bat":
		_box(_hero_weapon, Vector3(0, 0.22, 0.25), Vector3(0.12, 0.12, 0.95), Color("c7a26e"))
		_box(_hero_weapon, Vector3(0, 0.22, 0.7), Vector3(0.21, 0.21, 0.56), Color("e2c698"))
	elif kind == "katana":
		_box(_hero_weapon, Vector3(0, 0.06, 0.46), Vector3(0.065, 0.17, 1.2), metal)
		_box(_hero_weapon, Vector3(0, 0.06, -0.1), Vector3(0.28, 0.25, 0.055), Color("e3bd6c"))
	elif kind == "shotgun" or kind == "revolver":
		_box(_hero_weapon, Vector3(0, 0.06, 0.26), Vector3(0.19, 0.21, 0.67 if kind == "shotgun" else 0.4), dark)
		_box(_hero_weapon, Vector3(0, 0.12, 0.54), Vector3(0.14, 0.11, 0.27), metal)
		_box(_hero_weapon, Vector3(0, -0.05, 0.05), Vector3(0.14, 0.24, 0.18), Color("b47d55"))
	else:
		var blade = _box(_hero_weapon, Vector3(0, 0.03, 0.3), Vector3(0.13, 0.055, 0.59), metal)
		blade.rotation.y = 0.12
		_box(_hero_weapon, Vector3(0, 0.03, 0), Vector3(0.18, 0.1, 0.16), dark)
	if evolved:
		var accent = Color("b3ffe5")
		_box(_hero_weapon, Vector3(0, 0.21, 0.3), Vector3(0.065, 0.055, 0.48), accent, true)
		if kind in ["shotgun", "revolver"]:
			for side in [-1, 1]:
				_box(_hero_weapon, Vector3(side * 0.15, 0.12, 0.28), Vector3(0.055, 0.09, 0.37), metal)
		elif kind == "kunai":
			for side in [-1, 1]:
				var wing = _box(_hero_weapon, Vector3(side * 0.11, 0.035, 0.31), Vector3(0.09, 0.045, 0.35), accent, true)
				wing.rotation.y = side * 0.4

func _draw_enemies(enemies: Array, player_pos: Vector2) -> void:
	for enemy in enemies:
		if float(enemy.get("hp", 0)) <= 0:
			continue
		var pos: Vector2 = enemy.get("pos", Vector2.ZERO)
		if pos.distance_squared_to(player_pos) > 1500.0 * 1500.0:
			continue
		var kind: String = str(enemy.get("type", "grunt"))
		var angle: float = (player_pos - pos).angle()
		var id: int = int(enemy.get("id", 0))
		var color: Color = ENEMY_COLORS.get(kind, Color("91c980"))
		if kind == "boss" and int(enemy.get("phase", 1)) == 2:
			color = color.lerp(Color("f7a457"), 0.25 + 0.15 * sin(_clock * 4.0))
		if float(enemy.get("hit", 0.0)) > 0:
			color = color.lerp(Color("fff7ce"), 0.65)
		var scale_factor: float = maxf(0.64, float(enemy.get("r", 12.0)) / 12.0)
		_draw_block_enemy(_world(pos), angle, kind, scale_factor, color, _clock * (9.5 if kind == "runner" else 6.0) + id * 1.7)
		if kind == "boss":
			var marker: Color = Color("ffbf74") if int(enemy.get("phase", 1)) == 2 else Color("e0b2ff")
			var r: float = float(enemy.get("r", 30.0)) / UNIT * 1.05
			_inst("rings", _transform(_world(pos, 0.018), Vector3(r, 0.1, r)), Color(marker, 0.65))
			for i in range(3 if int(enemy.get("phase", 1)) == 2 else 1):
				var h: float = scale_factor * 1.92 + i * 0.16
				_inst("glow", _transform(_world(pos, h), Vector3(0.23, 0.055, 0.23), PI * 0.25), marker)
		if kind == "elite" or kind == "boss":
			var ratio: float = clampf(float(enemy.hp) / maxf(float(enemy.get("max_hp", enemy.hp)), 1), 0, 1)
			var height: float = scale_factor * 1.65 + 0.35
			_inst("glow", _transform(_world(pos, height), Vector3(scale_factor * 1.3, 0.08, 0.08)), Color("18343c"))
			_inst("glow", _transform(_world(pos, height) + Vector3(-(1.0 - ratio) * scale_factor * 0.65, 0.012, 0), Vector3(scale_factor * 1.3 * ratio, 0.09, 0.1)), Color("ffbd8a") if kind == "elite" else Color("ff8d9d"))

func _draw_block_enemy(pos: Vector3, angle: float, kind: String, size: float, color: Color, animation: float) -> void:
	var yaw: float = -angle + PI * 0.5
	var basis = Basis(Vector3.UP, yaw)
	var dark: Color = color.darkened(0.48)
	var head: Color = color.lightened(0.18)
	var stride: float = sin(animation) * 0.17
	var bounce: float = absf(sin(animation)) * 0.035
	var broad: float = 1.25 if kind == "tank" or kind == "boss" else 1.0
	_enemy_part(pos, basis, Vector3(0, 0.83 + bounce, 0), Vector3(0.64 * broad, 0.6, 0.4), color, size)
	_enemy_part(pos, basis, Vector3(0, 1.38 + bounce, 0), Vector3(0.58, 0.53, 0.53), head, size)
	_enemy_part(pos, basis, Vector3(0, 1.61 + bounce, -0.05), Vector3(0.62, 0.12, 0.55), dark, size)
	for side in [-1, 1]:
		_enemy_part(pos, basis, Vector3(side * 0.43 * broad, 0.81 + bounce, 0.07 + side * stride), Vector3(0.25, 0.55, 0.29), color.darkened(0.07), size)
		_enemy_part(pos, basis, Vector3(side * 0.19, 0.27, side * stride), Vector3(0.27, 0.51, 0.32), dark, size)
		_enemy_part(pos, basis, Vector3(side * 0.19, 0.09, side * stride + 0.06), Vector3(0.29, 0.17, 0.4), dark.darkened(0.12), size)
		var eye_pos = pos + basis * (Vector3(side * 0.16, 1.4 + bounce, 0.277) * size)
		_inst("glow", _transform(eye_pos, Vector3(0.11, 0.075, 0.035) * size, yaw), Color("ffe7a6") if kind != "boss" else Color("ffffe1"))
	if kind == "ranged" or kind == "sniper":
		_enemy_part(pos, basis, Vector3(0.4, 0.92, 0.47), Vector3(0.16, 0.19, 0.7), Color("203a49"), size)
		_enemy_part(pos, basis, Vector3(0, 1.65, 0), Vector3(0.71, 0.12, 0.67), dark, size)
	if kind == "elite" or kind == "boss" or kind == "tank":
		_enemy_part(pos, basis, Vector3(0, 0.95, 0.245), Vector3(0.5 * broad, 0.43, 0.14), dark, size)
		_enemy_part(pos, basis, Vector3(0, 1.01, 0.327), Vector3(0.2, 0.12, 0.035), Color("ffc87d"), size)
		for side in [-1, 1]:
			_enemy_part(pos, basis, Vector3(side * 0.48 * broad, 1.13, 0), Vector3(0.34, 0.24, 0.53), dark, size)
	if kind == "boss":
		for side in [-1, 1]:
			_enemy_part(pos, basis, Vector3(side * 0.28, 1.78, 0), Vector3(0.16, 0.27, 0.18), Color("e2b16a"), size)
	_inst("shadows", _transform(pos + Vector3(0, 0.006, 0), Vector3(0.49, 1, 0.33) * size), Color(0.025, 0.07, 0.08, 0.25))

func _enemy_part(origin: Vector3, basis: Basis, local_pos: Vector3, dimensions: Vector3, color: Color, size: float) -> void:
	_inst("actors", Transform3D(basis.scaled_local(dimensions * size), origin + basis * (local_pos * size)), color)

func _draw_projectiles(shots: Array, hostile: bool, evolved: Dictionary = {}) -> void:
	for shot in shots:
		var pos: Vector2 = shot.get("pos", Vector2.ZERO)
		var vel: Vector2 = shot.get("velocity", Vector2.RIGHT)
		var kind: String = str(shot.get("kind", "bullet"))
		var radius: float = clampf(float(shot.get("r", 5.0)) / UNIT, 0.06, 0.55)
		var color = Color(str(shot.get("color", "ff887e" if hostile else "ffe7a0")))
		var is_evolved: bool = not hostile and bool(evolved.get(str(shot.get("source", kind)), false))
		if is_evolved:
			color = color.lerp(Color("ddffe9"), 0.4)
		var p = _world(pos, 0.65 if hostile else 0.85)
		var angle: float = -vel.angle() + PI * 0.5
		if vel.length_squared() > 0.01 and (_high_quality or hostile):
			var direction: Vector3 = _world(vel.normalized() * UNIT)
			var length: float = clampf(vel.length() / UNIT * 0.055, 0.18, 0.85)
			if kind in ["rocket", "droneB", "destroyer"]:
				length *= 1.6
			var trail_color = Color("ff8b87") if hostile else Color("b7ffe2") if is_evolved else color
			trail_color.a = 0.3 if hostile else 0.24
			_inst("trails", _transform(p - direction * length * 0.6, Vector3(radius * 1.3, radius * 0.9, length), angle), trail_color)
			if _high_quality and kind in ["rocket", "droneB", "destroyer"]:
				_inst("trails", _transform(p - direction * length * 1.3, Vector3(radius, radius, length * 0.6), angle), Color(0.82, 0.88, 0.79, 0.18))
		if hostile:
			_inst("orbs", _transform(p, Vector3.ONE * (radius * 2.2)), Color("ff8b87"))
			_inst("orbs", _transform(p, Vector3.ONE * radius), Color("fff1b1"))
		elif kind == "soccer":
			_inst("orbs", _transform(p, Vector3.ONE * radius * 2.0), color)
			_inst("actors", _transform(p, Vector3(radius * 1.2, radius * 2.1, radius * 0.25), _clock * 9.0), Color("315565"))
		elif kind == "brick":
			_inst("actors", _transform(p + Vector3(0, 0.3, 0), Vector3(radius * 2.4, radius, radius * 1.3), _clock * 6.0), color)
		elif kind == "rocket" or kind == "droneB" or kind == "destroyer":
			_inst("actors", _transform(p, Vector3(radius, radius, radius * 3.4), angle), color)
			var trail: Vector3 = _world(vel.normalized() * -18, 0)
			_inst("glow", _transform(p + trail, Vector3(radius * 0.7, radius * 0.7, radius * 2.5), angle), Color("ffbf79"))
		elif kind == "boomerang":
			_inst("glow", _transform(p, Vector3(radius * 3.3, radius * 0.35, radius * 0.6), _clock * 11.0), color)
			_inst("glow", _transform(p, Vector3(radius * 0.6, radius * 0.35, radius * 3.3), _clock * 11.0), color)
		elif kind == "katana":
			_inst("glow", _transform(p, Vector3(radius * 4.0, radius * 0.2, radius * 0.5), angle), Color("cef9ed"))
		else:
			_inst("glow", _transform(p, Vector3(radius * 0.6, radius * 0.55, maxf(radius * 3.0, 0.3)), angle), color)
			_inst("glow", _transform(p - _world(vel.normalized() * 11), Vector3(radius * 0.3, radius * 0.3, radius * 1.5), angle), color.darkened(0.35))

func _draw_gems(gems: Array) -> void:
	for gem in gems:
		var pos: Vector2 = gem.get("pos", Vector2.ZERO)
		var kind: String = str(gem.get("type", "xp"))
		var id: int = int(gem.get("id", 0))
		var p = _world(pos, 0.23 + sin(_clock * 3 + id) * 0.055)
		if kind == "xp":
			var scale_factor: float = 0.19 if float(gem.get("value", 3)) < 10 else 0.28
			_inst("crystals", _transform(p, Vector3.ONE * scale_factor, _clock + id), Color("89ebc1") if scale_factor < 0.2 else Color("78c4ed"))
		elif kind == "chest":
			_inst("actors", _transform(p + Vector3(0, 0.16, 0), Vector3(0.65, 0.48, 0.47)), Color("c08e54"))
			_inst("actors", _transform(p + Vector3(0, 0.42, 0), Vector3(0.69, 0.12, 0.5)), Color("f3c77e"))
			_inst("glow", _transform(p + Vector3(0, 0.23, 0.25), Vector3(0.13, 0.18, 0.04)), Color("fff0b0"))
			_inst("rings", _transform(_world(pos, 0.02), Vector3(0.67, 0.1, 0.67)), Color("f8ca75"))
			_inst("glow", _transform(p + Vector3(0, 1.2, 0), Vector3(0.035, 0.8, 0.035)), Color("ffe1a1"))
		elif kind == "heal":
			_inst("actors", _transform(p, Vector3(0.4, 0.4, 0.35)), Color("f5eee0"))
			_inst("glow", _transform(p + Vector3(0, 0, 0.19), Vector3(0.27, 0.08, 0.04)), Color("ef8a7a"))
			_inst("glow", _transform(p + Vector3(0, 0, 0.19), Vector3(0.08, 0.27, 0.04)), Color("ef8a7a"))
		elif kind == "magnet":
			_inst("rings", _transform(p, Vector3(0.27, 0.6, 0.27)), Color("92d8fa"))
		elif kind == "bomb":
			_inst("orbs", _transform(p, Vector3.ONE * 0.42), Color("384956"))
			_inst("glow", _transform(p + Vector3(0, 0.24, 0), Vector3(0.08, 0.12, 0.08)), Color("ffc47c"))
		else:
			_inst("crystals", _transform(p, Vector3(0.22, 0.22, 0.12), _clock), Color("f1ce77"))

func _draw_areas(areas: Array) -> void:
	for area in areas:
		var kind: String = str(area.get("kind", "explosion"))
		var p = _world(area.get("pos", Vector2.ZERO), 0.035)
		var r: float = maxf(0.08, float(area.get("r", 25)) / UNIT)
		var remaining: float = clampf(float(area.get("life", 0.1)) / maxf(float(area.get("max", 0.5)), 0.01), 0, 1)
		if kind == "fire":
			_inst("discs", _transform(p, Vector3(r, 1, r)), Color(1.0, 0.32, 0.12, 0.20))
			_inst("rings", _transform(p + Vector3(0, 0.025, 0), Vector3(r, 0.12, r)), Color(1.0, 0.55, 0.26, 0.6))
			var count: int = 7 if _high_quality else 4
			for i in range(count):
				var phase: float = _clock * 4.0 + i * 2.4 + p.x
				var offset = Vector3(cos(i * 2.4) * r * 0.55, 0.15, sin(i * 2.4) * r * 0.55)
				var h: float = 0.2 + absf(sin(phase)) * 0.75
				_inst("glow", _transform(p + offset + Vector3(0, h * 0.5, 0), Vector3(0.18, h, 0.18), phase), Color("ffc070") if i % 2 == 0 else Color("ed794a"))
		elif kind == "lightning":
			_inst("rings", _transform(p, Vector3(0.55, 0.12, 0.55)), Color("d7fbff"))
			var a: Vector3 = p
			for i in range(4):
				var b = p + Vector3(sin(i * 5.4) * 0.3, (i + 1) * 1.3, cos(i * 3.1) * 0.18)
				_line(a, b, 0.055 + remaining * 0.08, Color("d9faff"))
				a = b
		elif kind == "link":
			_line(p + Vector3(0, 0.8, 0), _world(area.get("pos2", Vector2.ZERO), 0.8), 0.075, Color("cbf6ff"))
		elif kind == "slash":
			var angle: float = float(area.get("angle", 0))
			var spread: float = float(area.get("spread", PI))
			for i in range(14):
				var a: float = angle - spread * 0.5 + spread * i / 13.0
				var q = p + Vector3(cos(a) * r, 0.7, sin(a) * r)
				_inst("glow", _transform(q, Vector3(0.15, 0.08, 0.28), -a), Color("fff1c4"))
		else:
			var radius: float = r * (1.0 - remaining * 0.45)
			_inst("rings", _transform(p, Vector3(radius, 0.2, radius)), Color(1.0, 0.72, 0.35, remaining * 0.9))
			_inst("discs", _transform(p + Vector3(0, 0.02, 0), Vector3(radius, 1, radius)), Color(1.0, 0.58, 0.25, remaining * 0.22))

func _draw_threats(threats: Array) -> void:
	for threat in threats:
		var p = _world(threat.get("pos", Vector2.ZERO), 0.07)
		var r: float = maxf(0.2, float(threat.get("r", 70)) / UNIT)
		var delay: float = float(threat.get("delay", 0))
		var active: bool = bool(threat.get("active", delay <= 0))
		var shape: String = str(threat.get("shape", threat.get("kind", "circle")))
		var pattern: String = str(threat.get("pattern", "mortar"))
		var pulse: float = 0.65 + 0.25 * sin(_clock * 13.0)
		var color = Color("85e8ff") if pattern in ["laser", "ice"] else Color("ff8b76")
		color.a = 1.0 if active else pulse
		if shape == "line":
			var end = _world(threat.get("pos2", threat.get("pos", Vector2.ZERO) + Vector2.RIGHT * 200), 0.07)
			var direction: Vector3 = end - p
			if direction.length_squared() < 0.001:
				continue
			var width: float = maxf(0.06, float(threat.get("width", 28.0)) / UNIT)
			var yaw: float = atan2(direction.x, direction.z)
			var side: Vector3 = Vector3(direction.z, 0, -direction.x).normalized() * width * 0.5
			_inst("telegraphs", _transform((p + end) * 0.5, Vector3(width, 0.035, direction.length()), yaw), Color(color, 0.35 if active else 0.16))
			_line(p + side, end + side, 0.035, color)
			_line(p - side, end - side, 0.035, color)
			_line(end + side, end - side, 0.035, color)
			if active and pattern == "laser":
				_line(p + Vector3(0, 0.65, 0), end + Vector3(0, 0.65, 0), width, Color("85e8ff"))
				_line(p + Vector3(0, 0.67, 0), end + Vector3(0, 0.67, 0), width * 0.3, Color("f4ffff"))
			else:
				var tip = end - direction.normalized() * 0.4
				_line(tip + side * 0.7, end, 0.06, color)
				_line(tip - side * 0.7, end, 0.06, color)
		elif shape == "ring":
			# The active ring follows the same age/duration radius as collision.
			# A filled disc would incorrectly imply that the entire interior hurts.
			if active:
				var progress: float = clampf((float(threat.get("age", 0)) - float(threat.get("warn", 1))) / maxf(0.01, float(threat.get("duration", 1))), 0, 1)
				var current_radius: float = maxf(0.06, r * progress)
				_inst("rings", _transform(p, Vector3(current_radius, 1.3, current_radius)), color)
				_inst("rings", _transform(p + Vector3(0, 0.07, 0), Vector3(maxf(0.04, current_radius - 0.16), 0.5, maxf(0.04, current_radius - 0.16))), Color("ffe9b3"))
			else:
				_inst("rings", _transform(p, Vector3(r, 0.1, r)), Color(color, 0.45))
				var progress: float = 1.0 - delay / maxf(0.01, float(threat.get("warn", 1)))
				var inner: float = 0.3 + progress * 0.4
				_inst("rings", _transform(p, Vector3(inner, 0.8, inner)), color)
		else:
			_inst("rings", _transform(p, Vector3(r, 0.14, r)), color)
			_inst("discs", _transform(p - Vector3(0, 0.01, 0), Vector3(r, 1, r)), Color(color, 0.14 if not active else 0.4))
			var inner: float = r * clampf(1.0 - delay / maxf(0.01, float(threat.get("warn", 1.5))), 0.1, 1.0)
			_inst("rings", _transform(p + Vector3(0, 0.01, 0), Vector3(inner, 0.07, inner)), color)

func _draw_effects(effects: Array) -> void:
	var text_index: int = 0
	for effect in effects:
		var p = _world(effect.get("pos", Vector2.ZERO), 0.6)
		var color = Color(str(effect.get("color", "ffe8ac")))
		var remain: float = clampf(float(effect.get("life", 0.1)) / maxf(0.01, float(effect.get("max", 0.5))), 0, 1)
		var kind: String = str(effect.get("kind", "hit"))
		var id: int = int(effect.get("id", 0))
		var count: int = 8 if kind == "kill" or kind == "evolve" else 3
		for i in range(count if _high_quality else mini(count, 3)):
			var a: float = i * TAU / count + id * 0.7
			var dist: float = (1.0 - remain) * (1.0 if kind == "kill" else 0.55)
			var q = p + Vector3(cos(a) * dist, sin(remain * PI) * 0.5, sin(a) * dist)
			_inst("glow", _transform(q, Vector3.ONE * maxf(0.025, remain * 0.12), a + _clock), color)
			if kind == "kill":
				var flight: float = 1.0 - remain
				var ground: Vector3 = p - Vector3(0, 0.58, 0)
				var chunk = ground + Vector3(cos(a) * flight * 0.95, 0.09 + sin(flight * PI) * (0.28 + (i % 3) * 0.14), sin(a) * flight * 0.95)
				var dimensions: Vector3 = Vector3(0.16, 0.13, 0.19) * maxf(0.2, remain)
				var basis = Basis.from_euler(Vector3(flight * (i + 2), a + flight * 4.0, flight * 2.0)).scaled_local(dimensions)
				_inst("debris", Transform3D(basis, chunk), color.darkened(0.05 if i % 2 == 0 else 0.32))
		if kind == "hit" and _high_quality:
			var flash: float = pow(remain, 3.0)
			_inst("orbs", _transform(p + Vector3(0, 0.18, 0), Vector3.ONE * 0.18 * flash), Color("fff4cf"))
		if kind == "evolve":
			_inst("rings", _transform(p - Vector3(0, 0.55, 0), Vector3.ONE * (3.0 - remain * 2.0)), Color(0.94, 0.86, 0.5, remain))
		var show_text: bool = _damage_numbers or kind not in ["hit", "hurt"]
		if show_text and not str(effect.get("text", "")).is_empty() and text_index < _floating_labels.size():
			var label: Label3D = _floating_labels[text_index]
			label.text = str(effect.text)
			label.modulate = Color(color, remain)
			label.position = p + Vector3(0, 1.2 + (1.0 - remain) * 0.8, 0)
			label.visible = true
			text_index += 1

func _draw_companions(sim) -> void:
	for pos in sim.guardian_nodes():
		var p = _world(pos, 0.85)
		_inst("glow", _transform(p, Vector3(0.2, 0.12, 0.65), _clock * 10), Color("adf3dc"))
		_inst("glow", _transform(p, Vector3(0.65, 0.12, 0.2), _clock * 10), Color("adf3dc"))
	for drone in sim.drone_positions():
		var p = _world(drone.get("pos", Vector2.ZERO), 2.0 + sin(_clock * 3.0) * 0.1)
		var color = Color("78d5df") if drone.get("kind", "droneA") == "droneA" else Color("efb770")
		if drone.get("kind", "") == "destroyer":
			color = Color("f2d987")
		_draw_drone(p, color, 1.2 if drone.get("kind", "") == "destroyer" else 0.85)
	if int(sim.player.levels.get("forcefield", 0)) > 0:
		var r: float = sim.forcefield_radius() / UNIT
		var p = _world(sim.player.pos, 0.04)
		_inst("rings", _transform(p, Vector3(r, 0.1, r)), Color(0.45, 0.91, 0.78, 0.7))
		_inst("discs", _transform(p, Vector3(r, 1, r)), Color(0.35, 0.9, 0.72, 0.08))

func _draw_drone(p: Vector3, color: Color, size: float) -> void:
	_inst("actors", _transform(p, Vector3(0.5, 0.23, 0.45) * size, _clock * 0.4), Color("254656"))
	_inst("glow", _transform(p + Vector3(0, -0.13, 0.23) * size, Vector3(0.24, 0.08, 0.04) * size), color)
	for side in [-1, 1]:
		var hub = p + Vector3(side * 0.42, 0, 0) * size
		_inst("actors", _transform(hub, Vector3(0.3, 0.12, 0.27) * size), color)
		_inst("glow", _transform(hub + Vector3(0, 0.1, 0), Vector3(0.67, 0.025, 0.07) * size, _clock * 23.0), Color("c1e9df"))

func _line(a: Vector3, b: Vector3, width: float, color: Color) -> void:
	var delta: Vector3 = b - a
	if delta.length_squared() < 0.0001:
		return
	var basis = Basis.looking_at(delta.normalized(), Vector3.RIGHT if absf(delta.normalized().dot(Vector3.UP)) > 0.95 else Vector3.UP)
	_inst("glow", Transform3D(basis.scaled_local(Vector3(width, width, delta.length())), (a + b) * 0.5), color)

func _make_lobby() -> void:
	_lobby = Node3D.new()
	add_child(_lobby)
	var center = Vector3(2.3, 0, 1)
	_box(_lobby, center + Vector3(0, -0.01, 0), Vector3(5, 0.12, 4.8), Color("26434a"))
	_box(_lobby, center + Vector3(0, 0.05, 0), Vector3(4.6, 0.05, 4.4), Color("36585b"))
	for x in [-1, 1]:
		for z in [-1, 1]:
			_box(_lobby, center + Vector3(x * 2.25, 0.12, z * 2.15), Vector3(0.65, 0.08, 0.12), Color("8bdfbd"), true)
	_box(_lobby, Vector3(5.4, 0.4, -1.5), Vector3(1.1, 0.8, 0.9), Color("9e875b"))
	_box(_lobby, Vector3(5.4, 0.86, -1.5), Vector3(1.17, 0.14, 0.98), Color("d4b47b"))
	_box(_lobby, Vector3(5.4, 0.42, -1.03), Vector3(0.18, 0.4, 0.04), Color("efd39a"))
	_box(_lobby, Vector3(6.4, 0.3, -0.7), Vector3(0.8, 0.6, 0.7), Color("4c6d65"))
	_box(_lobby, Vector3(-0.7, 0.7, -1.5), Vector3(0.12, 1.4, 0.12), Color("2c4650"))
	_box(_lobby, Vector3(-0.7, 1.5, -1.5), Vector3(1.1, 0.7, 0.12), Color("1c3f4c"))
	_box(_lobby, Vector3(-0.7, 1.5, -1.425), Vector3(0.9, 0.5, 0.03), Color("70c3b0"), true)
	for i in range(3):
		_box(_lobby, Vector3(-0.85, 1.58 - i * 0.12, -1.4), Vector3(0.45 - i * 0.08, 0.035, 0.02), Color("cdf8d5"), true)

func _draw_lobby_actors() -> void:
	_draw_drone(Vector3(4.8, 3.4 + sin(_clock * 2) * 0.1, 0.5), Color("efd29a"), 1.15)
	_draw_block_enemy(Vector3(8.0, 0, -6.0), 2.1, "grunt", 1.05, Color("91c980"), _clock * 3)
	_draw_block_enemy(Vector3(5.7, 0, -8.0), 2.0, "tank", 1.45, Color("948ac4"), _clock * 2)
	_draw_block_enemy(Vector3(9.3, 0, -3.0), 2.7, "runner", 0.85, Color("edaf75"), _clock * 4)
	_inst("rings", _transform(Vector3(2.3, 0.13, 1), Vector3(1.9, 0.13, 1.9)), Color(0.55, 0.91, 0.76, 0.6))
	for i in range(8):
		var a: float = i * TAU / 8 + _clock * 0.1
		_inst("glow", _transform(Vector3(2.3 + cos(a) * 2.05, 0.16, 1 + sin(a) * 2.05), Vector3(0.15, 0.04, 0.08), -a), Color("c5e9ad"))

func _make_ground_material() -> ShaderMaterial:
	var shader = Shader.new()
	shader.code = """shader_type spatial;
render_mode diffuse_burley, specular_disabled;
uniform vec4 tile_a: source_color = vec4(0.25,0.4,0.35,1.0);
uniform vec4 tile_b: source_color = vec4(0.23,0.37,0.33,1.0);
uniform vec4 road_color: source_color = vec4(0.15,0.24,0.27,1.0);
uniform vec4 curb_color: source_color = vec4(0.48,0.59,0.52,1.0);
uniform vec4 line_color: source_color = vec4(0.65,0.77,0.66,1.0);
uniform int biome = 0;
varying vec3 world_pos;
void vertex(){world_pos = (MODEL_MATRIX * vec4(VERTEX,1.0)).xyz;}
void fragment(){
 vec2 p = world_pos.xz;
 float checker = mod(floor(p.x/3.0) + floor(p.y/3.0),2.0);
 vec3 c = mix(tile_a.rgb,tile_b.rgb,checker);
 vec2 q = abs(mod(p+16.0,32.0)-16.0);
 float road = min(q.x,q.y);
 if(road < 3.6){c=road_color.rgb;}
 else if(road < 4.0){c=curb_color.rgb;}
 float dash_x = (1.0-step(0.045,q.x)) * step(1.4,mod(p.y,6.0)) * (1.0-step(3.4,mod(p.y,6.0)));
 float dash_y = (1.0-step(0.045,q.y)) * step(1.4,mod(p.x,6.0)) * (1.0-step(3.4,mod(p.x,6.0)));
 if(max(q.x,q.y)>4.0){c=mix(c,line_color.rgb,max(dash_x,dash_y)*0.7);}
 vec2 fine = abs(fract(p/3.0+0.5)-0.5);
 if(road>4.05){c *= 1.0 - 0.08 * step(0.493,max(fine.x,fine.y));}
 if(biome == 1){
   float dune = sin(p.x*0.8+p.y*0.27)*sin(p.y*1.5-p.x*0.1);
   if(road>4.0){c=mix(tile_a.rgb,tile_b.rgb,0.5+dune*0.27);}
   else{c=mix(c,tile_a.rgb,0.14+0.06*sin(p.y*0.7));}
 }
 if(biome == 2){
   float frost = abs(fract((p.x+p.y*0.4)/7.0)-0.5);
   if(road>4.0){c=mix(c,line_color.rgb,step(0.485,frost)*0.35);}
   float edge_frost = smoothstep(2.7,3.65,road)*(1.0-step(4.0,road));
   c=mix(c,tile_a.rgb,edge_frost*0.6);
 }
 ALBEDO=c; ROUGHNESS=0.97;
}"""
	var material = ShaderMaterial.new()
	material.shader = shader
	return material

func _rebuild_scenery() -> void:
	for child in _scenery.get_children():
		_scenery.remove_child(child)
		child.queue_free()
	var objects: Array = []
	var rng = RandomNumberGenerator.new()
	rng.seed = 7919 + _chapter * 413
	_scenery_signature = ["city_shops_planters_cars", "desert_mesas_solar_outposts", "ice_crystals_research_masts"][_chapter]
	for tx in range(-1, 2):
		for tz in range(-1, 2):
			var tile = Vector3(tx * 32, 0, tz * 32)
			for sx in [-1, 1]:
				for sz in [-1, 1]:
					var center = tile + Vector3(sx * 10.3, 0, sz * 10.3)
					var variant: int = absi(tx + tz + sx + sz) % 3
					match _chapter:
						0: _city_prop(objects, center, variant, rng)
						1: _desert_prop(objects, center, variant, rng)
						2: _ice_prop(objects, center, variant, rng)
					for i in range(2):
						var p = tile + Vector3(sx * rng.randf_range(5.2,7.4),0,sz * rng.randf_range(5.2,7.5))
						if _chapter == 1:
							_scenery_piece(objects,p+Vector3(0,0.65,0),Vector3(0.38,1.3,0.38),Color("698b6c"))
							_scenery_piece(objects,p+Vector3(0.32,0.72,0),Vector3(0.5,0.22,0.3),Color("7a9876"))
							_scenery_piece(objects,p+Vector3(0.53,0.92,0),Vector3(0.23,0.5,0.29),Color("698b6c"))
						elif _chapter == 2:
							for j in range(3):
								var h: float = 0.8 + j * 0.45
								_scenery_piece(objects,p+Vector3((j-1)*0.3,h*0.5,0),Vector3(0.37,h,0.4),Color("97d6df") if j != 1 else Color("d8f4ef"),Vector3(0.1*j,0.25,j*0.2-0.2))
						else:
							_scenery_piece(objects,p+Vector3(0,0.2,0),Vector3(1.35,0.4,1.3),Color("48665c"))
							_scenery_piece(objects,p+Vector3(0,0.95,0),Vector3(0.22,1.3,0.22),Color("847256"))
							_scenery_piece(objects,p+Vector3(0,1.8,0),Vector3(1.2,1.4,1.2),Color("548b68"))
							_scenery_piece(objects,p+Vector3(0,2.5,0),Vector3(0.8,0.6,0.8),Color("75a77b"))
					var lamp = tile + Vector3(sx * 4.3,0,sz * 6.0)
					_scenery_piece(objects,lamp+Vector3(0,1.3,0),Vector3(0.12,2.6,0.12),Color("354e54"))
					_scenery_piece(objects,lamp+Vector3(0,2.65,0),Vector3(0.52,0.15,0.44),Color("d9d6a6") if _chapter != 2 else Color("aeeef0"))
			var car = tile + Vector3(1.6,0,7.3)
			_scenery_piece(objects,car+Vector3(0,0.4,0),Vector3(1.4,0.55,2.7),[Color("bd8262"),Color("a1916c"),Color("b2bccc")][_chapter])
			_scenery_piece(objects,car+Vector3(0,0.9,-0.2),Vector3(1.2,0.5,1.4),Color("658a91"))
			_scenery_piece(objects,car+Vector3(0,0.9,0.52),Vector3(1.05,0.32,0.06),Color("b6d8d4"))
			for side in [-1,1]:
				for end in [-1,1]:
					_scenery_piece(objects,car+Vector3(side*0.72,0.25,end*0.8),Vector3(0.16,0.4,0.46),Color("31434b"))
	var multimesh = MultiMesh.new()
	multimesh.transform_format = MultiMesh.TRANSFORM_3D
	multimesh.use_colors = true
	multimesh.mesh = _mesh_box
	multimesh.instance_count = objects.size()
	for i in range(objects.size()):
		var object: Array = objects[i]
		multimesh.set_instance_transform(i, Transform3D(Basis.from_euler(object[3]).scaled_local(object[1]), object[0]))
		multimesh.set_instance_color(i, object[2])
	var batch = MultiMeshInstance3D.new()
	batch.multimesh = multimesh
	batch.material_override = _vertex_material(false, false)
	_scenery.add_child(batch)

func _scenery_piece(objects: Array, position: Vector3, size: Vector3, color: Color, rotation: Vector3 = Vector3.ZERO) -> void:
	objects.append([position,size,color,rotation])

func _city_prop(objects: Array, p: Vector3, variant: int, rng: RandomNumberGenerator) -> void:
	if variant == 0:
		_scenery_piece(objects,p+Vector3(0,0.22,0),Vector3(4.5,0.44,3.5),Color("294b45"))
		for i in [-1,1]:
			_scenery_piece(objects,p+Vector3(i*1.2,0.7,0),Vector3(1.6,0.28,0.48),Color("9d9471"))
			_scenery_piece(objects,p+Vector3(i*1.2,1.05,-0.22),Vector3(1.6,0.5,0.12),Color("b7a47b"))
		return
	var h: float = rng.randf_range(2.2,3.8)
	var wall = Color("52716c") if variant == 1 else Color("7a8072")
	_scenery_piece(objects,p+Vector3(0,h*0.5,0),Vector3(4.3,h,4.1),wall)
	_scenery_piece(objects,p+Vector3(0,h+0.12,0),Vector3(4.65,0.24,4.45),wall.darkened(0.22))
	_scenery_piece(objects,p+Vector3(0,h+0.42,0),Vector3(1.3,0.48,1.2),wall.lightened(0.1))
	for i in [-1,0,1]:
		_scenery_piece(objects,p+Vector3(i*1.08,1.3,2.07),Vector3(0.66,0.8,0.07),Color("d4d3a5"))
		_scenery_piece(objects,p+Vector3(2.17,1.3,i),Vector3(0.07,0.8,0.66),Color("a4c0b1"))
	_scenery_piece(objects,p+Vector3(0,1.88,2.3),Vector3(3.6,0.14,0.7),Color("c9906d") if variant == 1 else Color("7eb5aa"))
	for i in [-1,0,1]:
		_scenery_piece(objects,p+Vector3(i*1.05,1.88,2.31),Vector3(0.48,0.15,0.72),Color("e4cf9e"))
	_scenery_piece(objects,p+Vector3(0,h+0.65,-1.0),Vector3(1.8,0.65,0.15),Color("244652"))
	_scenery_piece(objects,p+Vector3(0,h+0.65,-0.91),Vector3(1.3,0.16,0.04),Color("b7ddbc"))

func _desert_prop(objects: Array, p: Vector3, variant: int, rng: RandomNumberGenerator) -> void:
	if variant != 1:
		var h: float = rng.randf_range(1.8,3.5)
		_scenery_piece(objects,p+Vector3(0,h*0.32,0),Vector3(4.8,h*0.64,4.0),Color("97734f"),Vector3(0,0.12,0))
		_scenery_piece(objects,p+Vector3(0.2,h*0.72,0.1),Vector3(3.8,h*0.3,3.3),Color("bf9a69"),Vector3(0,-0.08,0))
		_scenery_piece(objects,p+Vector3(0.1,h*0.94,0),Vector3(3.2,h*0.14,2.8),Color("dac092"))
		_scenery_piece(objects,p+Vector3(2.1,0.32,-1.8),Vector3(0.85,0.64,1.1),Color("a98e65"),Vector3(0.1,0.4,0.2))
		return
	_scenery_piece(objects,p+Vector3(0,0.95,0),Vector3(3.7,1.9,3.2),Color("b8a17a"))
	_scenery_piece(objects,p+Vector3(0,1.99,0),Vector3(4.0,0.18,3.5),Color("ddc69d"))
	_scenery_piece(objects,p+Vector3(0,0.75,1.62),Vector3(0.85,1.45,0.07),Color("525b59"))
	_scenery_piece(objects,p+Vector3(1.12,1.25,1.65),Vector3(0.75,0.5,0.08),Color("93c4c5"))
	_scenery_piece(objects,p+Vector3(-0.2,2.14,-0.1),Vector3(2.4,0.1,1.5),Color("365d77"),Vector3(0.2,0,0))
	for i in [-1,0,1]:
		_scenery_piece(objects,p+Vector3(i*0.7,2.22,-0.1),Vector3(0.035,0.035,1.45),Color("a8bccc"),Vector3(0.2,0,0))
	_scenery_piece(objects,p+Vector3(1.4,3.05,-1),Vector3(0.08,2.0,0.08),Color("534c44"))
	_scenery_piece(objects,p+Vector3(1.4,3.8,-1),Vector3(0.75,0.08,0.08),Color("e3c295"))
	_scenery_piece(objects,p+Vector3(-2.3,0.4,0.9),Vector3(0.75,0.8,0.75),Color("728b74"))

func _ice_prop(objects: Array, p: Vector3, variant: int, rng: RandomNumberGenerator) -> void:
	if variant == 0:
		_scenery_piece(objects,p+Vector3(0,0.2,0),Vector3(4.5,0.4,3.7),Color("b7d8d9"))
		for i in range(5):
			var h: float = rng.randf_range(1.5,3.8)
			var angle: float = i * TAU / 5.0
			_scenery_piece(objects,p+Vector3(cos(angle)*0.9,h*0.5,sin(angle)*0.7),Vector3(0.75,h,0.8),Color("85bdcf") if i%2 == 0 else Color("b8e8e8"),Vector3(sin(angle)*0.22,angle,cos(angle)*0.2))
		return
	_scenery_piece(objects,p+Vector3(0,0.35,0),Vector3(4.4,0.7,3.8),Color("425c6b"))
	_scenery_piece(objects,p+Vector3(0,1.32,0),Vector3(3.9,1.5,3.3),Color("7198a5"))
	_scenery_piece(objects,p+Vector3(0,2.15,0),Vector3(4.3,0.22,3.7),Color("d0e7e4"))
	_scenery_piece(objects,p+Vector3(0,2.35,-0.5),Vector3(2.6,0.2,1.9),Color("ddefe7"))
	for i in [-1,1]:
		_scenery_piece(objects,p+Vector3(i*1.1,1.4,1.67),Vector3(0.95,0.55,0.08),Color("adedef"))
		_scenery_piece(objects,p+Vector3(i*1.75,1.38,0),Vector3(0.18,1.45,3.4),Color("41586a"))
	_scenery_piece(objects,p+Vector3(0,1.1,1.67),Vector3(0.65,1.45,0.08),Color("3d5668"))
	_scenery_piece(objects,p+Vector3(1.1,3.25,-1.1),Vector3(0.13,2.1,0.13),Color("526475"))
	_scenery_piece(objects,p+Vector3(1.1,4.25,-1.1),Vector3(0.22,0.23,0.22),Color("eea48c"))
	_scenery_piece(objects,p+Vector3(1.1,3.8,-1.1),Vector3(1.3,0.08,0.12),Color("cededf"))
	_scenery_piece(objects,p+Vector3(-1.4,2.55,0),Vector3(0.6,0.58,0.6),Color("4e6b7b"))

func _diamond_mesh() -> ArrayMesh:
	var vertices: Array[Vector3] = [Vector3(0,1,0),Vector3(1,0,0),Vector3(0,0,1),Vector3(-1,0,0),Vector3(0,0,-1),Vector3(0,-0.6,0)]
	var faces: Array = [[0,2,1],[0,3,2],[0,4,3],[0,1,4],[5,1,2],[5,2,3],[5,3,4],[5,4,1]]
	var builder = SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	for face in faces:
		for index in face:
			builder.add_vertex(vertices[index])
	builder.generate_normals()
	return builder.commit()
