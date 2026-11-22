extends Node3D
class_name DungeonBuilder
## Builds the Boss Room dungeon directly from Unity's DungeonPieces.FBX, door_boss_ani.FBX,
## floor_switch_ani.FBX, and chest_ani.FBX with unpacked PBR MetalSmoothEmissive materials.

const DUNGEON_PIECES_PATH := "res://assets/models/DungeonPieces.FBX"
const DOOR_BOSS_PATH := "res://assets/models/door_boss_ani.FBX"
const FLOOR_SWITCH_PATH := "res://assets/models/floor_switch_ani.FBX"
const CHEST_PATH := "res://assets/models/chest_ani.FBX"
const TEX_DIR := "res://assets/textures/"

var boss_arena_mat: StandardMaterial3D = null
var env_deco_mat: StandardMaterial3D = null
var portal_mat: StandardMaterial3D = null
var switch_glow_mat: StandardMaterial3D = null
var chest_glow_mat: StandardMaterial3D = null

var door_node: Node3D = null
var door_anim: AnimationPlayer = null
var door_portal_mesh: MeshInstance3D = null
var switch_node: Node3D = null
var switch_anim: AnimationPlayer = null
var chest_node: Node3D = null
var chest_anim: AnimationPlayer = null
var chest_light: OmniLight3D = null
var torch_lights: Array[OmniLight3D] = []
var torch_flames: Array[MeshInstance3D] = []
var arrow_mesh_template: Mesh = null
var flicker_time: float = 0.0


func build_dungeon() -> void:
	_create_materials()

	var mesh_map: Dictionary = {}
	for k in ["boss_floor", "boss_floor_2", "wall1_base_straight_1", "wall1_top_straight_1", "Pillar_LOD0", "banner_LOD0", "torch2", "pot2_LOD0", "door_crystral_base", "fx_arrrow"]:
		var mp := "res://assets/models/prop_" + str(k) + ".tres"
		if ResourceLoader.exists(mp):
			mesh_map[k] = load(mp)

	if mesh_map.has("fx_arrrow"):
		arrow_mesh_template = mesh_map["fx_arrrow"] as Mesh

	# 1. Boss Arena Floor (boss_floor: AABB P=(-36,-0.05,0) S=(36,0.1,44) -> center at (0, 0, 0))
	if mesh_map.has("boss_floor"):
		var floor_mi := MeshInstance3D.new()
		floor_mi.name = "BossArenaFloor"
		floor_mi.mesh = mesh_map["boss_floor"] as Mesh
		floor_mi.position = Vector3(18.0, 0.0, -22.0)
		floor_mi.material_override = boss_arena_mat
		floor_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(floor_mi)

	# 2. Entrance Corridor Floor (boss_floor_2: AABB P=(-16,-0.02,-12) S=(16,0.76,28) -> placed at Z=+22..+44)
	if mesh_map.has("boss_floor_2"):
		var entry_mi := MeshInstance3D.new()
		entry_mi.name = "EntranceFloor"
		entry_mi.mesh = mesh_map["boss_floor_2"] as Mesh
		entry_mi.position = Vector3(8.0, -0.32, 26.0)
		entry_mi.material_override = boss_arena_mat
		entry_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(entry_mi)

	# Subtle safety stone base beneath corridors so no void shows at outer corners
	var under_floor := MeshInstance3D.new()
	under_floor.name = "DungeonSubFloor"
	var uf_box := BoxMesh.new()
	uf_box.size = Vector3(68.0, 0.4, 84.0)
	under_floor.mesh = uf_box
	under_floor.position = Vector3(0.0, -0.35, 8.0)
	var uf_mat := StandardMaterial3D.new()
	uf_mat.albedo_color = Color(0.08, 0.09, 0.13)
	uf_mat.roughness = 0.92
	under_floor.material_override = uf_mat
	add_child(under_floor)

	# 3. Dungeon Perimeter Stone Walls (wall1_base_straight_1 spans 4m along local Z -> rot 90 for X-lines, 0 for Z-lines)
	_build_wall_line(mesh_map, Vector3(-16.0, 0.0, -17.5), Vector3(1.0, 0.0, 0.0), 9, 90.0)
	_build_wall_line(mesh_map, Vector3(-17.5, 0.0, -16.0), Vector3(0.0, 0.0, 1.0), 9, 0.0)
	_build_wall_line(mesh_map, Vector3(17.5, 0.0, -16.0), Vector3(0.0, 0.0, 1.0), 9, 180.0)
	# South wall flanking Boss Door (leave central doorway at X=-5..+5, Z=+17.5)
	_build_wall_line(mesh_map, Vector3(-16.0, 0.0, 17.5), Vector3(1.0, 0.0, 0.0), 3, -90.0)
	_build_wall_line(mesh_map, Vector3(8.0, 0.0, 17.5), Vector3(1.0, 0.0, 0.0), 3, -90.0)
	# Entrance corridor side walls
	_build_wall_line(mesh_map, Vector3(-8.5, 0.0, 19.0), Vector3(0.0, 0.0, 1.0), 5, 0.0)
	_build_wall_line(mesh_map, Vector3(8.5, 0.0, 19.0), Vector3(0.0, 0.0, 1.0), 5, 180.0)

	# 4. Pillars framing the Boss Arena (Pillar_LOD0 / Pillar2_LOD0)
	var pillar_mesh: Mesh = mesh_map.get("Pillar_LOD0", null) as Mesh
	if pillar_mesh != null:
		var pillar_positions: Array[Vector3] = [
			Vector3(-12.5, 0.0, -12.5), Vector3(12.5, 0.0, -12.5),
			Vector3(-13.5, 0.0, 0.0), Vector3(13.5, 0.0, 0.0),
			Vector3(-12.5, 0.0, 12.5), Vector3(12.5, 0.0, 12.5),
		]
		for p_pos in pillar_positions:
			var p_mi := MeshInstance3D.new()
			p_mi.mesh = pillar_mesh
			p_mi.position = p_pos + Vector3(1.9, 0.0, 1.4)
			p_mi.material_override = env_deco_mat
			p_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			add_child(p_mi)

	# 5. Giant Red Boss Banners (banner_LOD0) on North wall behind Treasure Chest & side walls
	var banner_mesh: Mesh = mesh_map.get("banner_LOD0", null) as Mesh
	if banner_mesh != null:
		var b_center := MeshInstance3D.new()
		b_center.name = "BossBannerCenter"
		b_center.mesh = banner_mesh
		b_center.position = Vector3(0.0, 1.8, -16.2)
		b_center.scale = Vector3(1.05, 1.05, 1.05)
		b_center.material_override = env_deco_mat
		add_child(b_center)

		for side_x in [-11.0, 11.0]:
			var b_side := MeshInstance3D.new()
			b_side.mesh = banner_mesh
			b_side.position = Vector3(float(side_x), 2.1, -16.1)
			b_side.scale = Vector3(0.68, 0.68, 0.68)
			b_side.material_override = env_deco_mat
			add_child(b_side)

	# 6. Braziers / Torches (torch2) with warm flickering fire flames & OmniLight3D
	var torch_mesh: Mesh = mesh_map.get("torch2", mesh_map.get("torch", null)) as Mesh
	var torch_positions: Array[Vector3] = [
		Vector3(-5.8, 0.0, -14.2),
		Vector3(5.8, 0.0, -14.2),
		Vector3(-13.8, 0.0, -6.0),
		Vector3(13.8, 0.0, -6.0),
		Vector3(-13.8, 0.0, 7.5),
		Vector3(13.8, 0.0, 7.5),
		Vector3(-6.2, 0.0, 23.5),
		Vector3(6.2, 0.0, 23.5),
	]
	for t_pos in torch_positions:
		_spawn_torch(torch_mesh, t_pos)

	# 7. Dungeon Clay Pots (pot2_LOD0)
	var pot_mesh: Mesh = mesh_map.get("pot2_LOD0", null) as Mesh
	if pot_mesh != null:
		for pot_pos in [
			Vector3(-9.5, 0.0, -14.5), Vector3(-8.0, 0.0, -15.0),
			Vector3(9.2, 0.0, -14.6), Vector3(-6.8, 0.0, 26.2), Vector3(6.6, 0.0, 26.5),
		]:
			var pot := MeshInstance3D.new()
			pot.mesh = pot_mesh
			pot.position = pot_pos
			pot.scale = Vector3.ONE * 0.72
			pot.material_override = env_deco_mat
			add_child(pot)

	# 8. Crystal Pedestals flanking the Boss Door (door_crystral_base + glowing magenta crystal)
	var crystal_base: Mesh = mesh_map.get("door_crystral_base", null) as Mesh
	for cx in [-6.0, 6.0]:
		_spawn_crystal_pedestal(crystal_base, Vector3(float(cx), 0.0, 15.6))

	# 9. Animated Boss Door (door_boss_ani.FBX) at Z = +17.5
	_spawn_boss_door()

	# 10. Animated Floor Switch (floor_switch_ani.FBX) in Entrance Corridor at Z = +25.5
	_spawn_floor_switch()

	# 11. Animated Treasure Chest (chest_ani.FBX) on North Dais at Z = -13.4
	_spawn_treasure_chest()



func _create_materials() -> void:
	boss_arena_mat = StandardMaterial3D.new()
	boss_arena_mat.albedo_texture = load(TEX_DIR + "env_deco_boss_arena_BaseColor.tres") as Texture2D
	boss_arena_mat.albedo_color = Color(0.86, 0.88, 0.96)
	boss_arena_mat.roughness = 0.88
	boss_arena_mat.roughness = 0.88
	boss_arena_mat.emission_enabled = true
	boss_arena_mat.emission_operator = BaseMaterial3D.EMISSION_OP_MULTIPLY
	boss_arena_mat.emission = Color(1.0, 0.25, 0.08)
	boss_arena_mat.emission_texture = load(TEX_DIR + "env_deco_boss_arena_MetalSmoothEmissive_emissive.tres") as Texture2D
	boss_arena_mat.emission_energy_multiplier = 3.6

	env_deco_mat = StandardMaterial3D.new()
	env_deco_mat.albedo_texture = load(TEX_DIR + "env_deco_BaseColor.tres") as Texture2D
	env_deco_mat.albedo_color = Color(0.9, 0.88, 0.92)
	env_deco_mat.metallic = 0.25
	env_deco_mat.roughness = 0.82

	portal_mat = StandardMaterial3D.new()
	portal_mat.albedo_color = Color(0.95, 0.28, 0.92, 0.88)
	portal_mat.emission_enabled = true
	portal_mat.emission = Color(1.0, 0.25, 0.95)
	portal_mat.emission_energy_multiplier = 4.2
	portal_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	portal_mat.cull_mode = BaseMaterial3D.CULL_DISABLED

	switch_glow_mat = StandardMaterial3D.new()
	switch_glow_mat.albedo_color = Color(0.25, 0.75, 1.0, 0.7)
	switch_glow_mat.emission_enabled = true
	switch_glow_mat.emission = Color(0.25, 0.8, 1.0)
	switch_glow_mat.emission_energy_multiplier = 2.4
	switch_glow_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA

	chest_glow_mat = StandardMaterial3D.new()
	chest_glow_mat.albedo_color = Color(1.0, 0.88, 0.35, 0.85)
	chest_glow_mat.emission_enabled = true
	chest_glow_mat.emission = Color(1.0, 0.82, 0.25)
	chest_glow_mat.emission_energy_multiplier = 3.5
	chest_glow_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA


func _extract_meshes(node: Node, out: Dictionary) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node
		if mi.mesh != null and not out.has(mi.name):
			out[mi.name] = mi.mesh
	for c in node.get_children():
		_extract_meshes(c, out)


func _build_wall_line(mesh_map: Dictionary, start: Vector3, step_dir: Vector3, count: int, rot_y_deg: float) -> void:
	var base_mesh: Mesh = mesh_map.get("wall1_base_straight_1", null) as Mesh
	var top_mesh: Mesh = mesh_map.get("wall1_top_straight_1", null) as Mesh
	if base_mesh == null:
		return
	for i in count:
		var pos := start + step_dir * (float(i) * 4.0)
		var base_mi := MeshInstance3D.new()
		base_mi.mesh = base_mesh
		base_mi.position = pos
		base_mi.rotation_degrees = Vector3(0.0, rot_y_deg, 0.0)
		base_mi.material_override = env_deco_mat
		add_child(base_mi)
		if top_mesh != null:
			var top_mi := MeshInstance3D.new()
			top_mi.mesh = top_mesh
			top_mi.position = pos + Vector3(0.0, 4.0, 0.0)
			top_mi.rotation_degrees = Vector3(0.0, rot_y_deg, 0.0)
			top_mi.material_override = env_deco_mat
			add_child(top_mi)


func _spawn_torch(torch_mesh: Mesh, pos: Vector3) -> void:
	var holder := Node3D.new()
	holder.position = pos
	add_child(holder)

	if torch_mesh != null:
		var mi := MeshInstance3D.new()
		mi.mesh = torch_mesh
		mi.material_override = env_deco_mat
		holder.add_child(mi)

	var flame := MeshInstance3D.new()
	var cone := CylinderMesh.new()
	cone.top_radius = 0.04
	cone.bottom_radius = 0.56
	cone.height = 1.55
	cone.radial_segments = 12
	flame.mesh = cone
	flame.position = Vector3(0.0, 3.3, 0.0)
	var fmat := StandardMaterial3D.new()
	fmat.albedo_color = Color(1.0, 0.65, 0.14)
	fmat.emission_enabled = true
	fmat.emission = Color(1.0, 0.48, 0.08)
	fmat.emission_energy_multiplier = 3.2
	fmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flame.material_override = fmat
	holder.add_child(flame)
	torch_flames.append(flame)

	var light := OmniLight3D.new()
	light.position = Vector3(0.0, 3.8, 0.0)
	light.light_color = Color(1.0, 0.52, 0.16)
	light.light_energy = 2.3
	light.omni_range = 14.0
	light.omni_attenuation = 1.45
	light.shadow_enabled = false
	holder.add_child(light)
	torch_lights.append(light)


func _spawn_crystal_pedestal(base_mesh: Mesh, pos: Vector3) -> void:
	var root := Node3D.new()
	root.position = pos
	add_child(root)
	if base_mesh != null:
		var mi := MeshInstance3D.new()
		mi.mesh = base_mesh
		mi.material_override = env_deco_mat
		root.add_child(mi)
	var crystal := MeshInstance3D.new()
	var prism := CylinderMesh.new()
	prism.top_radius = 0.02
	prism.bottom_radius = 0.45
	prism.height = 1.35
	prism.radial_segments = 6
	crystal.mesh = prism
	crystal.position = Vector3(0.0, 2.35, 0.0)
	crystal.material_override = portal_mat
	root.add_child(crystal)
	var cl := OmniLight3D.new()
	cl.position = Vector3(0.0, 2.6, 0.0)
	cl.light_color = Color(0.95, 0.3, 1.0)
	cl.light_energy = 3.0
	cl.omni_range = 10.0
	root.add_child(cl)


func _spawn_boss_door() -> void:
	door_node = Node3D.new()
	door_node.name = "BossDoor"
	door_node.position = Vector3(0.0, 0.0, 17.4)
	door_node.scale = Vector3(0.85, 0.85, 0.85)
	add_child(door_node)
	var d_mi := MeshInstance3D.new()
	d_mi.mesh = load("res://assets/models/prop_door_boss.tres") as Mesh
	d_mi.material_override = env_deco_mat
	door_node.add_child(d_mi)

	# Glowing magenta energy portal veil inside the Boss Door archway
	door_portal_mesh = MeshInstance3D.new()
	var plane := BoxMesh.new()
	plane.size = Vector3(5.6, 6.2, 0.45)
	door_portal_mesh.mesh = plane
	door_portal_mesh.position = Vector3(0.0, 3.1, 0.0)
	door_portal_mesh.material_override = portal_mat
	door_node.add_child(door_portal_mesh)

	var portal_light := OmniLight3D.new()
	portal_light.position = Vector3(0.0, 3.5, -1.5)
	portal_light.light_color = Color(0.95, 0.25, 0.95)
	portal_light.light_energy = 5.0
	portal_light.omni_range = 14.0
	door_node.add_child(portal_light)


func _spawn_floor_switch() -> void:
	switch_node = Node3D.new()
	switch_node.name = "FloorSwitch"
	switch_node.position = Vector3(0.0, 0.08, 25.0)
	add_child(switch_node)
	var sw_mi := MeshInstance3D.new()
	sw_mi.mesh = load("res://assets/models/prop_floor_switch.tres") as Mesh
	sw_mi.material_override = env_deco_mat
	switch_node.add_child(sw_mi)

	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 1.9
	torus.outer_radius = 2.25
	ring.mesh = torus
	ring.position = Vector3(0.0, 0.2, 0.0)
	ring.material_override = switch_glow_mat
	switch_node.add_child(ring)


func _spawn_treasure_chest() -> void:
	chest_node = Node3D.new()
	chest_node.name = "TreasureChest"
	chest_node.position = Vector3(0.0, 0.0, -13.2)
	chest_node.scale = Vector3(0.95, 0.95, 0.95)
	add_child(chest_node)
	var ch_mi := MeshInstance3D.new()
	ch_mi.mesh = load("res://assets/models/prop_treasure_chest.tres") as Mesh
	ch_mi.material_override = env_deco_mat
	chest_node.add_child(ch_mi)

	var glow_orb := MeshInstance3D.new()
	glow_orb.name = "VictoryGlowOrb"
	var sp := SphereMesh.new()
	sp.radius = 0.85
	sp.height = 1.7
	glow_orb.mesh = sp
	glow_orb.position = Vector3(0.0, 2.2, 0.0)
	glow_orb.material_override = chest_glow_mat
	glow_orb.visible = false
	chest_node.add_child(glow_orb)

	chest_light = OmniLight3D.new()
	chest_light.position = Vector3(0.0, 2.8, 1.0)
	chest_light.light_color = Color(1.0, 0.85, 0.35)
	chest_light.light_energy = 1.8
	chest_light.omni_range = 10.0
	chest_node.add_child(chest_light)


func set_switch_pressed(pressed: bool) -> void:
	if switch_glow_mat != null:
		if pressed:
			switch_glow_mat.albedo_color = Color(0.25, 1.0, 0.45, 0.85)
			switch_glow_mat.emission = Color(0.2, 1.0, 0.45)
			switch_glow_mat.emission_energy_multiplier = 4.2
		else:
			switch_glow_mat.albedo_color = Color(0.25, 0.75, 1.0, 0.7)
			switch_glow_mat.emission = Color(0.25, 0.8, 1.0)
			switch_glow_mat.emission_energy_multiplier = 2.4
	if switch_anim != null and pressed and switch_anim.has_animation("Take 001"):
		switch_anim.play("Take 001")


func open_boss_door() -> void:
	if door_anim != null and door_anim.has_animation("Take 001"):
		door_anim.play("Take 001")
	if door_portal_mesh != null:
		door_portal_mesh.visible = false


func open_treasure_chest() -> void:
	if chest_anim != null and chest_anim.has_animation("Take 001"):
		chest_anim.play("Take 001")
	if chest_node != null:
		var orb: Node3D = chest_node.get_node_or_null("VictoryGlowOrb") as Node3D
		if orb != null:
			orb.visible = true
	if chest_light != null:
		chest_light.light_energy = 7.5
		chest_light.omni_range = 18.0


func _process(delta: float) -> void:
	flicker_time += delta
	for i in torch_lights.size():
		var wave: float = sin(flicker_time * 7.5 + float(i) * 1.7) * 0.3 + cos(flicker_time * 13.0 + float(i)) * 0.16
		torch_lights[i].light_energy = 2.3 + wave
		var sc: float = 1.0 + wave * 0.09
		torch_flames[i].scale = Vector3(sc, 1.0 + wave * 0.14, sc)


func _apply_mat_recursive(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node
		mi.material_override = mat
	for c in node.get_children():
		_apply_mat_recursive(c, mat)


func _find_anim_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for c in node.get_children():
		var found := _find_anim_player(c)
		if found != null:
			return found
	return null
