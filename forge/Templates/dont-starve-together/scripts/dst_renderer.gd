class_name DSTRenderer
extends Node3D

## Don't Starve Together 2.5D 빌보드 팝업북 스타일 3D 지면 + 원작 KTEX/KAnim 렌더러.
## 접지 그림자, 걷기/공격/피격 애니메이션, 보트+돛 3D 모델, 아비게일 영혼,
## 날씨(비/눈) 3D 파티클, 월드 플로팅 대미지·채집 팝업, 모닥불 플리커링 지원.

var sim: DSTWorldSim
var env_node: WorldEnvironment
var sun_light: DirectionalLight3D
var fire_light: OmniLight3D

var player_root: Node3D
var player_sprite: Sprite3D
var player_ring: MeshInstance3D
var player_shadow: MeshInstance3D

var boat_root: Node3D
var boat_mast_nodes: Array = []

var abigail_root: Node3D
var abigail_sprite: Sprite3D

var resource_nodes: Dictionary = {} # uid -> Node3D { root, sprite }
var structure_nodes: Dictionary = {}
var creature_nodes: Dictionary = {} # uid -> { root, sprite, hp_label }
var farm_nodes: Dictionary = {}
var tex_cache: Dictionary = {}

var _shadow_mesh: CylinderMesh
var _shadow_mat: StandardMaterial3D
var _ground_mat: ShaderMaterial
var _weather_drops: Array = [] # Array of Dictionary { node, vel }
var _floating_popups: Array = [] # Array of Dictionary { node, age, max_age }
var _anim_time: float = 0.0
var _weather_rng: RandomNumberGenerator = RandomNumberGenerator.new()


func setup(world_sim: DSTWorldSim) -> void:
	sim = world_sim
	_weather_rng.seed = 777123
	DSTMedia.ensure_loaded()
	_init_shared_shadow()
	_build_environment()
	_build_ground()
	_build_player_visual()
	_build_boat_visual()
	_build_abigail_visual()
	_build_weather_pool()
	sync_visuals(0.0)


func _init_shared_shadow() -> void:
	_shadow_mesh = CylinderMesh.new()
	_shadow_mesh.top_radius = 0.72
	_shadow_mesh.bottom_radius = 0.72
	_shadow_mesh.height = 0.02
	_shadow_mat = StandardMaterial3D.new()
	_shadow_mat.albedo_color = Color(0.04, 0.05, 0.06, 0.38)
	_shadow_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_shadow_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED


func _make_shadow(scale_xz: float) -> MeshInstance3D:
	var sh: MeshInstance3D = MeshInstance3D.new()
	sh.mesh = _shadow_mesh
	sh.material_override = _shadow_mat
	sh.scale = Vector3(scale_xz, 1.0, scale_xz)
	sh.position = Vector3(0.0, 0.02, 0.0)
	return sh


func _build_environment() -> void:
	env_node = WorldEnvironment.new()
	var env: Environment = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.05, 0.09, 0.14, 1.0)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.85, 0.82, 0.72, 1.0)
	env.ambient_light_energy = 0.85
	env_node.environment = env
	add_child(env_node)

	sun_light = DirectionalLight3D.new()
	sun_light.rotation_degrees = Vector3(-52.0, 35.0, 0.0)
	sun_light.light_energy = 1.15
	sun_light.light_color = Color(1.0, 0.96, 0.86, 1.0)
	add_child(sun_light)

	fire_light = OmniLight3D.new()
	fire_light.light_color = Color(1.0, 0.62, 0.24, 1.0)
	fire_light.omni_range = 15.0
	fire_light.light_energy = 0.0
	add_child(fire_light)


func _build_ground() -> void:
	# 원작 KTEX 512×512 지형 타일 텍스처를 바이옴 스플랫 셰이더로 28× 타일링 (고선명·초고속)
	var map_sz: int = 256
	var bmap_img: Image = Image.create(map_sz, map_sz, false, Image.FORMAT_RGBA8)
	for py in range(map_sz):
		for px in range(map_sz):
			var wx: float = ((float(px) / float(map_sz)) - 0.5) * 150.0
			var wz: float = ((float(py) / float(map_sz)) - 0.5) * 150.0
			var b: String = sim.get_biome_at(Vector2(wx, wz))
			var bid: float = 0.0 # grass
			match b:
				"forest": bid = 1.0 / 5.0
				"savanna": bid = 2.0 / 5.0
				"rocky": bid = 3.0 / 5.0
				"moon_island": bid = 4.0 / 5.0
				"ocean": bid = 5.0 / 5.0
			var rad: float = Vector2(wx, wz).length()
			var foam: float = 1.0 if (rad > 53.4 and rad < 55.2) else 0.0
			bmap_img.set_pixel(px, py, Color(bid, foam, 0.0, 1.0))

	var bmap_tex: ImageTexture = ImageTexture.create_from_image(bmap_img)
	var plane: PlaneMesh = PlaneMesh.new()
	plane.size = Vector2(150.0, 150.0)
	var ground: MeshInstance3D = MeshInstance3D.new()
	ground.mesh = plane

	var t_grass: Texture2D = DSTMedia.terrain_tiles.get("grass", null)
	if t_grass != null:
		var sh: Shader = Shader.new()
		sh.code = """
shader_type spatial;
uniform float is_caves = 0.0;
uniform sampler2D biome_map : filter_nearest;
uniform sampler2D tex_grass : repeat_enable, filter_linear_mipmap;
uniform sampler2D tex_forest : repeat_enable, filter_linear_mipmap;
uniform sampler2D tex_savanna : repeat_enable, filter_linear_mipmap;
uniform sampler2D tex_rocky : repeat_enable, filter_linear_mipmap;
uniform sampler2D tex_moon : repeat_enable, filter_linear_mipmap;
uniform sampler2D tex_ocean : repeat_enable, filter_linear_mipmap;
uniform sampler2D tex_cave : repeat_enable, filter_linear_mipmap;
uniform sampler2D tex_ruins : repeat_enable, filter_linear_mipmap;
void fragment() {
	vec2 tuv = UV * 26.0;
	if (is_caves > 0.5) {
		float wx = (UV.x - 0.5) * 150.0;
		vec3 ccol = (wx > 6.0) ? (texture(tex_ruins, tuv).rgb * vec3(0.68, 0.56, 0.42)) : (texture(tex_cave, tuv).rgb * vec3(0.42, 0.44, 0.48));
		ALBEDO = ccol;
		ROUGHNESS = 0.96;
	} else {
		vec4 bm = texture(biome_map, UV);
		int bid = int(round(bm.r * 5.0));
		vec3 col = texture(tex_grass, tuv).rgb * vec3(0.46, 0.54, 0.34);
		if (bid == 1) col = texture(tex_forest, tuv).rgb * vec3(0.36, 0.44, 0.30);
		else if (bid == 2) col = texture(tex_savanna, tuv).rgb * vec3(0.68, 0.56, 0.32);
		else if (bid == 3) col = texture(tex_rocky, tuv).rgb * vec3(0.56, 0.54, 0.50);
		else if (bid == 4) col = texture(tex_moon, tuv).rgb * vec3(0.66, 0.76, 0.82);
		else if (bid == 5) col = mix(texture(tex_ocean, tuv * 0.6 + vec2(TIME * 0.02, TIME * 0.015)).rgb, vec3(0.08, 0.24, 0.37), 0.72);
		col = mix(col, vec3(0.76, 0.86, 0.90), bm.g * 0.40);
		ALBEDO = col;
		ROUGHNESS = 0.96;
	}
}
"""
		var smat: ShaderMaterial = ShaderMaterial.new()
		smat.shader = sh
		smat.set_shader_parameter("is_caves", 0.0)
		smat.set_shader_parameter("biome_map", bmap_tex)
		smat.set_shader_parameter("tex_grass", t_grass)
		smat.set_shader_parameter("tex_forest", DSTMedia.terrain_tiles.get("forest", t_grass))
		smat.set_shader_parameter("tex_savanna", DSTMedia.terrain_tiles.get("yellowgrass", t_grass))
		smat.set_shader_parameter("tex_rocky", DSTMedia.terrain_tiles.get("rocky", t_grass))
		smat.set_shader_parameter("tex_moon", DSTMedia.terrain_tiles.get("meteor", t_grass))
		smat.set_shader_parameter("tex_ocean", DSTMedia.terrain_tiles.get("ocean_ice", t_grass))
		smat.set_shader_parameter("tex_cave", DSTMedia.terrain_tiles.get("cave", t_grass))
		smat.set_shader_parameter("tex_ruins", DSTMedia.terrain_tiles.get("ruins", t_grass))
		_ground_mat = smat
		ground.material_override = smat
	else:
		var mat: StandardMaterial3D = StandardMaterial3D.new()
		mat.albedo_color = Color(0.30, 0.42, 0.20, 1.0)
		mat.roughness = 0.96
		ground.material_override = mat
	add_child(ground)


func _build_player_visual() -> void:
	player_root = Node3D.new()
	add_child(player_root)

	player_shadow = _make_shadow(1.1)
	player_root.add_child(player_shadow)

	player_sprite = _make_billboard(_get_sprite_tex("player", Color(0.84, 0.27, 0.23)), 2.6)
	player_root.add_child(player_sprite)

	var cyl: CylinderMesh = CylinderMesh.new()
	cyl.top_radius = 0.78
	cyl.bottom_radius = 0.78
	cyl.height = 0.04
	var rmat: StandardMaterial3D = StandardMaterial3D.new()
	rmat.albedo_color = Color(0.95, 0.82, 0.35, 0.48)
	rmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	rmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	player_ring = MeshInstance3D.new()
	player_ring.mesh = cyl
	player_ring.material_override = rmat
	player_ring.position = Vector3(0.0, 0.03, 0.0)
	player_root.add_child(player_ring)


func _build_boat_visual() -> void:
	boat_root = Node3D.new()
	boat_root.visible = false
	add_child(boat_root)

	var deck_mesh: CylinderMesh = CylinderMesh.new()
	deck_mesh.top_radius = 2.2
	deck_mesh.bottom_radius = 2.0
	deck_mesh.height = 0.24
	var deck_mat: StandardMaterial3D = StandardMaterial3D.new()
	deck_mat.albedo_color = Color(0.36, 0.24, 0.14, 1.0)
	deck_mat.roughness = 0.96
	var deck: MeshInstance3D = MeshInstance3D.new()
	deck.mesh = deck_mesh
	deck.material_override = deck_mat
	deck.position = Vector3(0.0, 0.12, 0.0)
	boat_root.add_child(deck)

	# 돛 3개 슬롯 (boat_masts 1..3에 따라 순차 표시)
	var mast_offsets: Array = [Vector3(0.0, 0.2, 0.0), Vector3(-0.9, 0.2, 0.5), Vector3(0.9, 0.2, 0.5)]
	var pole_mesh: CylinderMesh = CylinderMesh.new()
	pole_mesh.top_radius = 0.07
	pole_mesh.bottom_radius = 0.09
	pole_mesh.height = 3.2
	var pole_mat: StandardMaterial3D = StandardMaterial3D.new()
	pole_mat.albedo_color = Color(0.38, 0.24, 0.13)
	var sail_mesh: BoxMesh = BoxMesh.new()
	sail_mesh.size = Vector3(1.5, 1.8, 0.08)
	var sail_mat: StandardMaterial3D = StandardMaterial3D.new()
	sail_mat.albedo_color = Color(0.96, 0.93, 0.84)

	for off in mast_offsets:
		var mroot: Node3D = Node3D.new()
		mroot.position = off
		mroot.visible = false
		var pole: MeshInstance3D = MeshInstance3D.new()
		pole.mesh = pole_mesh
		pole.material_override = pole_mat
		pole.position = Vector3(0.0, 1.6, 0.0)
		mroot.add_child(pole)
		var sail: MeshInstance3D = MeshInstance3D.new()
		sail.mesh = sail_mesh
		sail.material_override = sail_mat
		sail.position = Vector3(0.0, 2.0, 0.15)
		mroot.add_child(sail)
		boat_root.add_child(mroot)
		boat_mast_nodes.append(mroot)


func _build_abigail_visual() -> void:
	abigail_root = Node3D.new()
	abigail_root.visible = false
	add_child(abigail_root)
	abigail_sprite = _make_billboard(_get_sprite_tex("ghost", Color(0.96, 0.64, 0.88)), 1.9)
	abigail_sprite.modulate = Color(1.0, 0.78, 0.94, 0.82)
	abigail_root.add_child(abigail_sprite)


func _build_weather_pool() -> void:
	var drop_mesh: BoxMesh = BoxMesh.new()
	drop_mesh.size = Vector3(0.06, 0.55, 0.06)
	var drop_mat: StandardMaterial3D = StandardMaterial3D.new()
	drop_mat.albedo_color = Color(0.70, 0.85, 1.0, 0.62)
	drop_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	drop_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for _i in range(42):
		var mi: MeshInstance3D = MeshInstance3D.new()
		mi.mesh = drop_mesh
		mi.material_override = drop_mat
		mi.visible = false
		add_child(mi)
		_weather_drops.append({
			"node": mi,
			"offset": Vector3(_weather_rng.randf_range(-16.0, 16.0), _weather_rng.randf_range(0.5, 13.0), _weather_rng.randf_range(-16.0, 16.0)),
			"speed": _weather_rng.randf_range(9.0, 14.0),
		})


func _make_billboard(tex: Texture2D, height_m: float) -> Sprite3D:
	var sp: Sprite3D = Sprite3D.new()
	sp.texture = tex
	sp.billboard = BaseMaterial3D.BILLBOARD_FIXED_Y
	sp.pixel_size = height_m / float(max(1, tex.get_height()))
	sp.centered = true
	sp.offset = Vector2(0.0, float(tex.get_height()) * 0.48)
	sp.alpha_cut = SpriteBase3D.ALPHA_CUT_DISCARD
	return sp


func _get_sprite_tex(kind: String, primary: Color) -> Texture2D:
	var kanim_tex: Texture2D = DSTMedia.get_kanim_texture(kind)
	if kanim_tex != null:
		return kanim_tex
	var key: String = "%s_%s" % [kind, primary.to_html(false)]
	if tex_cache.has(key):
		return tex_cache[key]
	var s: int = 64
	var img: Image = Image.create(s, s, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	var ink: Color = Color(0.09, 0.08, 0.07, 1.0)

	for y in range(s):
		for x in range(s):
			var nx: float = (float(x) - 32.0) / 30.0
			var ny: float = (float(y) - 32.0) / 30.0
			var draw_col: Color = Color(0, 0, 0, 0)
			if kind == "player" or kind == "ghost":
				var head_d: float = Vector2(nx, (ny + 0.42) * 1.15).length()
				var body_in: bool = abs(nx) < 0.34 and ny > -0.15 and ny < 0.85
				if head_d < 0.38:
					draw_col = Color(0.95, 0.88, 0.78, 0.85 if kind == "ghost" else 1.0) if head_d < 0.31 else ink
				elif body_in:
					draw_col = primary if (abs(nx) < 0.27 and ny < 0.78) else ink
			elif kind == "evergreen":
				var cone1: bool = ny > -0.85 and ny < 0.45 and abs(nx) < (ny + 0.95) * 0.52
				var trunk: bool = ny >= 0.45 and ny < 0.92 and abs(nx) < 0.14
				if cone1:
					draw_col = primary if abs(nx) < (ny + 0.85) * 0.44 else ink
				elif trunk:
					draw_col = Color(0.36, 0.23, 0.13)
			elif kind == "campfire":
				var flame_d: float = Vector2(nx * 1.3, (ny - 0.1) * 0.85).length()
				var logs: bool = ny > 0.55 and ny < 0.85 and abs(nx) < 0.55
				if flame_d < 0.45 and ny < 0.65:
					draw_col = Color(1.0, 0.85, 0.25) if flame_d < 0.22 else Color(0.96, 0.42, 0.12)
				elif logs:
					draw_col = Color(0.35, 0.22, 0.12) if ny < 0.78 else ink
			elif kind == "deerclops" or kind == "mutated_deerclops":
				var body_d: float = Vector2(nx * 0.9, ny * 0.75).length()
				var eye_d: float = Vector2(nx, ny + 0.32).length()
				if eye_d < 0.17:
					draw_col = Color(0.35, 0.92, 1.0) if kind == "mutated_deerclops" else Color(1.0, 0.95, 0.85)
				elif body_d < 0.75:
					draw_col = primary if body_d < 0.66 else ink
			else:
				var d: float = Vector2(nx, ny).length()
				if d < 0.65:
					draw_col = primary if d < 0.55 else ink
			if draw_col.a > 0.0:
				img.set_pixel(x, y, draw_col)

	var tex: ImageTexture = ImageTexture.create_from_image(img)
	tex_cache[key] = tex
	return tex


func _spawn_floating_popup(pos: Vector2, text: String, col: Color) -> void:
	var lbl: Label3D = Label3D.new()
	lbl.text = text
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.font_size = 38
	lbl.pixel_size = 0.012
	lbl.modulate = col
	lbl.outline_size = 8
	lbl.outline_modulate = Color(0.05, 0.04, 0.03, 0.95)
	lbl.no_depth_test = true
	lbl.position = Vector3(pos.x, 2.55, pos.y)
	add_child(lbl)
	_floating_popups.append({"node": lbl, "age": 0.0, "max_age": 1.15})


func sync_visuals(dt: float) -> void:
	_anim_time += dt

	# 1. 시간대/계절/정신력/동굴 악몽 주기에 따른 조명(ColourCube 유사 컬러 그레이딩)
	if _ground_mat != null:
		_ground_mat.set_shader_parameter("is_caves", 1.0 if sim.shard == "caves" else 0.0)
	var amb_col: Color = Color(0.88, 0.85, 0.76)
	var sun_e: float = 1.15
	if sim.shard == "caves":
		amb_col = Color(0.46, 0.50, 0.62)
		sun_e = 0.62
		if sim.nightmare_phase == "warn":
			amb_col = amb_col.lerp(Color(0.72, 0.35, 0.42), 0.40)
		elif sim.nightmare_phase == "wild":
			amb_col = amb_col.lerp(Color(0.82, 0.20, 0.28), 0.58)
	elif sim.phase == "dusk":
		amb_col = Color(0.82, 0.50, 0.36)
		sun_e = 0.65
	elif sim.phase == "night":
		amb_col = Color(0.32, 0.42, 0.62) if sim.moon_phase == "full" else Color(0.08, 0.10, 0.16)
		sun_e = 0.45 if sim.moon_phase == "full" else 0.12
	if sim.shard != "caves":
		if sim.get_season_name() == "winter":
			amb_col = amb_col.lerp(Color(0.68, 0.82, 0.98), 0.30)
		elif sim.get_season_name() == "summer":
			amb_col = amb_col.lerp(Color(1.0, 0.76, 0.48), 0.25)
	if sim.is_enlightened():
		amb_col = amb_col.lerp(Color(0.75, 0.95, 1.0), 0.45)
	elif sim.is_insane():
		amb_col = amb_col.lerp(Color(0.42, 0.18, 0.28), 0.35)

	env_node.environment.ambient_light_color = amb_col
	sun_light.light_energy = sun_e

	# 2. 플레이어 위치·걷기 바운스·공격 런지·피격 적색 플래시
	var ccol: Color = Color.from_string(str(sim.db.data["characters"][sim.character_id]["color"]), Color(0.84, 0.27, 0.23))
	var pkey: String = "ghost" if sim.is_ghost else sim.character_id
	var ptex: Texture2D = _get_sprite_tex(pkey, Color(0.75, 0.92, 0.98) if sim.is_ghost else ccol)
	if player_sprite.texture != ptex:
		player_sprite.texture = ptex
		player_sprite.pixel_size = 2.6 / float(max(1, ptex.get_height()))
		player_sprite.offset = Vector2(0.0, float(ptex.get_height()) * 0.48)

	var moving: bool = sim.player_vel.length_squared() > 0.25
	var walk_bob: float = abs(sin(_anim_time * 11.0)) * 0.18 if (moving and not sim.on_boat) else 0.0
	var ghost_bob: float = (0.35 + sin(_anim_time * 3.0) * 0.18) if sim.is_ghost else 0.0
	var boat_elev: float = 0.26 if sim.on_boat else 0.0
	var atk_bump: float = 0.28 if sim.attack_anim_timer > 0.0 else 0.0
	var lunge_off: Vector2 = sim.player_facing.normalized() * (0.45 if sim.attack_anim_timer > 0.0 else 0.0)

	player_root.position = Vector3(sim.player_pos.x, 0.0, sim.player_pos.y)
	player_sprite.position = Vector3(lunge_off.x, walk_bob + ghost_bob + boat_elev + atk_bump, lunge_off.y)
	player_sprite.flip_h = sim.player_facing.x < -0.15
	if sim.player_hit_flash > 0.0:
		player_sprite.modulate = Color(1.0, 0.35, 0.35, 1.0)
	elif sim.is_ghost:
		player_sprite.modulate = Color(0.72, 0.94, 1.0, 0.82)
	else:
		player_sprite.modulate = Color(1.0, 1.0, 1.0, 1.0)

	# 3. 보트 & 돛 3D 동기화
	boat_root.visible = sim.boat_active
	if sim.boat_active:
		var rock_y: float = sin(_anim_time * 2.6) * 0.05
		boat_root.position = Vector3(sim.boat_pos.x, rock_y, sim.boat_pos.y)
		boat_root.rotation.z = sin(_anim_time * 1.9) * 0.035
		for mi in range(boat_mast_nodes.size()):
			boat_mast_nodes[mi].visible = mi < sim.boat_masts

	# 4. 웬디 아비게일 영혼 동기화
	abigail_root.visible = (sim.character_id == "wendy" and not sim.is_ghost)
	if abigail_root.visible:
		abigail_root.position = Vector3(sim.abigail_pos.x, 0.35 + sin(_anim_time * 3.6) * 0.2, sim.abigail_pos.y)

	# 5. 모닥불/라이터 동적 광원 + 불꽃 플리커링
	var best_fire_energy: float = 0.0
	var fire_pos: Vector3 = Vector3(sim.player_pos.x, 1.6, sim.player_pos.y)
	if sim.character_id == "willow":
		best_fire_energy = 2.0
	if sim.equip_hands == "torch" and int(sim.inventory.get("torch", 0)) > 0:
		best_fire_energy = max(best_fire_energy, 3.0)
	for s in sim.structures:
		if str(s["kind"]) == "campfire" and float(s["fuel"]) > 0.0:
			best_fire_energy = 5.6
			fire_pos = Vector3(s["pos"].x, 1.6, s["pos"].y)
			break
	var flicker: float = 1.0 + sin(_anim_time * 14.0) * 0.09 + cos(_anim_time * 23.0) * 0.05
	fire_light.position = fire_pos
	fire_light.light_energy = best_fire_energy * flicker

	# 6. 날씨(비/겨울 눈) 3D 파티클 업데이트
	var show_snow: bool = sim.get_season_name() == "winter"
	var show_weather: bool = sim.is_raining or show_snow
	for wd in _weather_drops:
		var mi: MeshInstance3D = wd["node"]
		mi.visible = show_weather
		if not show_weather:
			continue
		var off: Vector3 = wd["offset"]
		var spd: float = float(wd["speed"]) * (0.35 if show_snow else 1.0)
		off.y -= spd * dt
		if show_snow:
			off.x += sin(_anim_time * 2.5 + off.z) * 0.8 * dt
		if off.y < 0.1:
			off.y = 13.0
			off.x = _weather_rng.randf_range(-16.0, 16.0)
			off.z = _weather_rng.randf_range(-16.0, 16.0)
		wd["offset"] = off
		mi.scale = Vector3(1.8, 0.25, 1.8) if show_snow else Vector3(1.0, 1.0, 1.0)
		mi.position = Vector3(sim.player_pos.x + off.x, off.y, sim.player_pos.y + off.z)

	# 7. 플로팅 텍스트 이벤트 소비 및 애니메이션
	while sim.floating_events.size() > 0:
		var ev: Dictionary = sim.floating_events.pop_front()
		_spawn_floating_popup(ev["pos"], str(ev["text"]), ev["color"])
	for pi in range(_floating_popups.size() - 1, -1, -1):
		var fp: Dictionary = _floating_popups[pi]
		fp["age"] = float(fp["age"]) + dt
		var lbl: Label3D = fp["node"]
		lbl.position.y += 1.35 * dt
		var alpha: float = clamp(1.0 - float(fp["age"]) / float(fp["max_age"]), 0.0, 1.0)
		lbl.modulate.a = alpha
		lbl.outline_modulate.a = alpha * 0.9
		if float(fp["age"]) >= float(fp["max_age"]):
			lbl.queue_free()
			_floating_popups.remove_at(pi)

	# 8. 자원/구조물/농장/생물 동기화 (접지 그림자 + 생물 HP바 + 피격 플래시)
	_sync_entities(sim.resources, resource_nodes, func(r: Dictionary) -> Dictionary:
		var k: String = str(r["kind"])
		var col: Color = Color(0.18, 0.42, 0.20)
		var h: float = 3.6
		var sh_s: float = 1.2
		match k:
			"boulder": col = Color(0.55, 0.54, 0.50); h = 2.0; sh_s = 1.1
			"sapling": col = Color(0.54, 0.40, 0.22); h = 1.6; sh_s = 0.65
			"grass_tuft": col = Color(0.72, 0.66, 0.24); h = 1.3; sh_s = 0.65
			"berrybush": col = Color(0.24, 0.50, 0.24); h = 1.8; sh_s = 0.95
			"lunar_crystal": col = Color(0.55, 0.92, 0.96); h = 2.6; sh_s = 1.0
			"mushtree": col = Color(0.28, 0.62, 0.78); h = 3.5; sh_s = 1.2
			"lightflower": col = Color(0.95, 0.92, 0.42); h = 1.8; sh_s = 0.7
		return _make_entity_bundle(_get_sprite_tex(k, col), h, sh_s, false)
	, true, false)

	_sync_entities(sim.structures, structure_nodes, func(s: Dictionary) -> Dictionary:
		var k: String = str(s["kind"])
		var col: Color = Color(0.85, 0.55, 0.25)
		var h: float = 2.6
		var sh_s: float = 1.25
		match k:
			"campfire": col = Color(1.0, 0.52, 0.15); h = 2.1; sh_s = 1.15
			"researchlab": col = Color(0.72, 0.58, 0.34); h = 3.4; sh_s = 1.35
			"cookpot": col = Color(0.28, 0.28, 0.32); h = 2.6; sh_s = 1.15
			"cave_entrance": col = Color(0.32, 0.30, 0.28); h = 2.9; sh_s = 1.8
			"ancient_altar": col = Color(0.86, 0.72, 0.30); h = 3.6; sh_s = 1.6
		return _make_entity_bundle(_get_sprite_tex(k, col), h, sh_s, false)
	, false, false)

	_sync_entities(sim.farm_plots, farm_nodes, func(_fp: Dictionary) -> Dictionary:
		return _make_entity_bundle(_get_sprite_tex("farm_plot", Color(0.48, 0.34, 0.18)), 1.9, 1.3, false)
	, false, false)

	_sync_entities(sim.creatures, creature_nodes, func(c: Dictionary) -> Dictionary:
		var k: String = str(c["kind"])
		var col: Color = Color(0.16, 0.15, 0.18)
		var h: float = 1.8
		var sh_s: float = 0.9
		match k:
			"hound": col = Color(0.38, 0.26, 0.22); h = 1.9; sh_s = 0.95
			"crawlinghorror": col = Color(0.12, 0.08, 0.16); h = 2.4; sh_s = 1.0
			"terrorbeak": col = Color(0.20, 0.06, 0.14); h = 2.8; sh_s = 1.1
			"deerclops": col = Color(0.76, 0.80, 0.86); h = 5.4; sh_s = 2.1
			"mutated_deerclops": col = Color(0.52, 0.84, 0.94); h = 5.8; sh_s = 2.2
			"bearger": col = Color(0.45, 0.42, 0.38); h = 5.6; sh_s = 2.3
			"dragonfly": col = Color(0.88, 0.42, 0.22); h = 5.5; sh_s = 2.1
			"moose": col = Color(0.68, 0.66, 0.62); h = 5.4; sh_s = 2.1
		return _make_entity_bundle(_get_sprite_tex(k, col), h, sh_s, true)
	, false, true)


func _make_entity_bundle(tex: Texture2D, height_m: float, shadow_scale: float, with_hp_label: bool) -> Dictionary:
	var root: Node3D = Node3D.new()
	var sh: MeshInstance3D = _make_shadow(shadow_scale)
	root.add_child(sh)
	var sp: Sprite3D = _make_billboard(tex, height_m)
	root.add_child(sp)
	var hp_lbl: Label3D = null
	if with_hp_label:
		hp_lbl = Label3D.new()
		hp_lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		hp_lbl.font_size = 28
		hp_lbl.pixel_size = 0.011
		hp_lbl.outline_size = 6
		hp_lbl.position = Vector3(0.0, height_m + 0.45, 0.0)
		hp_lbl.visible = false
		root.add_child(hp_lbl)
	return {"root": root, "sprite": sp, "hp_label": hp_lbl}


func _sync_entities(items: Array, cache: Dictionary, factory: Callable, hide_when_zero_hp: bool, is_creature: bool) -> void:
	var seen: Dictionary = {}
	for it in items:
		var uid: int = int(it["id"])
		seen[uid] = true
		var bundle: Dictionary
		if cache.has(uid):
			bundle = cache[uid]
		else:
			bundle = factory.call(it)
			add_child(bundle["root"])
			cache[uid] = bundle
		var root: Node3D = bundle["root"]
		var sp: Sprite3D = bundle["sprite"]
		var p: Vector2 = it["pos"]
		root.position = Vector3(p.x, 0.0, p.y)
		if hide_when_zero_hp:
			root.visible = int(it.get("hp", 1)) > 0
		else:
			root.visible = true

		if is_creature:
			var aggro: bool = bool(it.get("aggro", false))
			var bob: float = abs(sin(_anim_time * 8.5 + float(uid))) * 0.14 if aggro else 0.0
			sp.position.y = bob
			sp.flip_h = (sim.player_pos.x < p.x)
			sp.modulate = Color(1.0, 0.35, 0.35, 1.0) if float(it.get("hit_flash", 0.0)) > 0.0 else Color(1.0, 1.0, 1.0, 1.0)
			var hp_lbl: Label3D = bundle.get("hp_label", null)
			if hp_lbl != null:
				var cur_hp: float = float(it["hp"])
				var max_hp: float = float(it["max_hp"])
				if cur_hp < max_hp or bool(it.get("boss", false)):
					hp_lbl.visible = true
					hp_lbl.text = "%s %.0f/%.0f" % [str(it["name"]), max(0.0, cur_hp), max_hp]
					hp_lbl.modulate = Color(0.55, 0.94, 1.0) if bool(it.get("planar_entity", false)) else Color(1.0, 0.78, 0.45)
				else:
					hp_lbl.visible = false

	var existing: Array = cache.keys()
	for uid in existing:
		if not seen.has(uid):
			var node: Node = cache[uid]["root"]
			node.queue_free()
			cache.erase(uid)
