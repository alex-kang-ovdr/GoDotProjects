class_name DSTRenderer
extends Node3D

## Don't Starve Together 2.5D 빌보드 팝업북 스타일 3D 지면 + 절차적 스프라이트 렌더러.
## Klei 원본 텍스처를 복사하지 않고 고대비 잉크 외곽선 스타일 절차적 ImageTexture를 생성한다.

var sim: DSTWorldSim
var env_node: WorldEnvironment
var sun_light: DirectionalLight3D
var fire_light: OmniLight3D

var player_sprite: Sprite3D
var player_ring: MeshInstance3D
var resource_nodes: Dictionary = {} # uid -> Sprite3D
var structure_nodes: Dictionary = {}
var creature_nodes: Dictionary = {}
var farm_nodes: Dictionary = {}
var tex_cache: Dictionary = {}


func setup(world_sim: DSTWorldSim) -> void:
	sim = world_sim
	DSTMedia.ensure_loaded()
	_build_environment()
	_build_ground()
	_build_player_visual()
	sync_visuals(0.0)


func _build_environment() -> void:
	env_node = WorldEnvironment.new()
	var env: Environment = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.05, 0.08, 0.11, 1.0)
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
	fire_light.omni_range = 14.0
	fire_light.light_energy = 0.0
	add_child(fire_light)


func _build_ground() -> void:
	# 원작 KTEX 추출 지형 타일 텍스처를 바이옴별로 타일링 합성 (미존재 시 절차적 색상 폴백)
	var img_size: int = 256
	var img: Image = Image.create(img_size, img_size, false, Image.FORMAT_RGBA8)
	var biome_tile_map: Dictionary = {
		"grass": DSTMedia.terrain_images.get("grass", null),
		"forest": DSTMedia.terrain_images.get("forest", null),
		"savanna": DSTMedia.terrain_images.get("yellowgrass", null),
		"rocky": DSTMedia.terrain_images.get("rocky", null),
		"moon_island": DSTMedia.terrain_images.get("meteor", null),
		"ocean": DSTMedia.terrain_images.get("ocean_ice", null),
	}
	for py in range(img_size):
		for px in range(img_size):
			var wx: float = ((float(px) / float(img_size)) - 0.5) * 140.0
			var wz: float = ((float(py) / float(img_size)) - 0.5) * 140.0
			var b: String = sim.get_biome_at(Vector2(wx, wz))
			var tile_im: Image = biome_tile_map.get(b, null)
			var col: Color
			if tile_im != null:
				var tw: int = tile_im.get_width()
				var th: int = tile_im.get_height()
				col = tile_im.get_pixel((px * 4) % tw, (py * 4) % th)
				if b == "ocean":
					col = col.lerp(Color(0.09, 0.24, 0.36, 1.0), 0.72)
			else:
				var n: float = sin(wx * 0.45) * cos(wz * 0.45) * 0.04
				match b:
					"ocean": col = Color(0.11, 0.25, 0.34, 1.0)
					"moon_island": col = Color(0.62, 0.70, 0.72, 1.0)
					"rocky": col = Color(0.45, 0.43, 0.39, 1.0)
					"forest": col = Color(0.18, 0.28, 0.16, 1.0)
					"savanna": col = Color(0.60, 0.49, 0.25, 1.0)
					_: col = Color(0.32, 0.44, 0.21, 1.0)
				col = Color(clamp(col.r + n, 0.0, 1.0), clamp(col.g + n, 0.0, 1.0), clamp(col.b + n, 0.0, 1.0), 1.0)
			img.set_pixel(px, py, col)

	var tex: ImageTexture = ImageTexture.create_from_image(img)
	var plane: PlaneMesh = PlaneMesh.new()
	plane.size = Vector2(140.0, 140.0)
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.albedo_texture = tex
	mat.roughness = 0.95
	var ground: MeshInstance3D = MeshInstance3D.new()
	ground.mesh = plane
	ground.material_override = mat
	add_child(ground)


func _build_player_visual() -> void:
	player_sprite = _make_billboard(_get_sprite_tex("player", Color(0.84, 0.27, 0.23)), 2.5)
	add_child(player_sprite)

	var cyl: CylinderMesh = CylinderMesh.new()
	cyl.top_radius = 0.7
	cyl.bottom_radius = 0.7
	cyl.height = 0.05
	var rmat: StandardMaterial3D = StandardMaterial3D.new()
	rmat.albedo_color = Color(0.95, 0.82, 0.35, 0.55)
	rmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	player_ring = MeshInstance3D.new()
	player_ring.mesh = cyl
	player_ring.material_override = rmat
	add_child(player_ring)


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


func sync_visuals(_dt: float) -> void:
	# 1. 시간대/계절/정신력에 따른 조명(ColourCube 유사 컬러 그레이딩)
	var amb_col: Color = Color(0.88, 0.85, 0.76)
	var sun_e: float = 1.15
	if sim.phase == "dusk":
		amb_col = Color(0.82, 0.50, 0.36)
		sun_e = 0.65
	elif sim.phase == "night":
		amb_col = Color(0.32, 0.42, 0.62) if sim.moon_phase == "full" else Color(0.08, 0.10, 0.16)
		sun_e = 0.45 if sim.moon_phase == "full" else 0.12
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

	# 2. 플레이어 위치 및 외형 (원작 KAnim 캐릭터 6인 + 유령 스프라이트 우선)
	var ccol: Color = Color.from_string(str(sim.db.data["characters"][sim.character_id]["color"]), Color(0.84, 0.27, 0.23))
	var pkey: String = "ghost" if sim.is_ghost else sim.character_id
	var ptex: Texture2D = _get_sprite_tex(pkey, Color(0.75, 0.92, 0.98) if sim.is_ghost else ccol)
	if player_sprite.texture != ptex:
		player_sprite.texture = ptex
		player_sprite.pixel_size = 2.6 / float(max(1, ptex.get_height()))
		player_sprite.offset = Vector2(0.0, float(ptex.get_height()) * 0.48)
	var atk_bump: float = 0.25 if sim.attack_anim_timer > 0.0 else 0.0
	player_sprite.position = Vector3(sim.player_pos.x, atk_bump, sim.player_pos.y)
	player_ring.position = Vector3(sim.player_pos.x, 0.04, sim.player_pos.y)

	# 3. 모닥불 동적 광원
	var best_fire_energy: float = 0.0
	var fire_pos: Vector3 = Vector3(sim.player_pos.x, 1.6, sim.player_pos.y)
	if sim.equip_hands == "torch" and int(sim.inventory.get("torch", 0)) > 0:
		best_fire_energy = 2.8
	for s in sim.structures:
		if str(s["kind"]) == "campfire" and float(s["fuel"]) > 0.0:
			best_fire_energy = 5.5
			fire_pos = Vector3(s["pos"].x, 1.6, s["pos"].y)
			break
	fire_light.position = fire_pos
	fire_light.light_energy = best_fire_energy

	# 4. 자원/구조물/농장/생물 동기화
	_sync_array(sim.resources, resource_nodes, func(r: Dictionary) -> Sprite3D:
		var k: String = str(r["kind"])
		var col: Color = Color(0.18, 0.42, 0.20)
		var h: float = 3.6
		match k:
			"boulder": col = Color(0.55, 0.54, 0.50); h = 2.0
			"sapling": col = Color(0.54, 0.40, 0.22); h = 1.6
			"grass_tuft": col = Color(0.72, 0.66, 0.24); h = 1.3
			"berrybush": col = Color(0.24, 0.50, 0.24); h = 1.8
			"lunar_crystal": col = Color(0.55, 0.92, 0.96); h = 2.6
		return _make_billboard(_get_sprite_tex(k, col), h)
	, true)

	_sync_array(sim.structures, structure_nodes, func(s: Dictionary) -> Sprite3D:
		var k: String = str(s["kind"])
		var col: Color = Color(0.85, 0.55, 0.25)
		var h: float = 2.6
		match k:
			"campfire": col = Color(1.0, 0.52, 0.15); h = 2.1
			"researchlab": col = Color(0.72, 0.58, 0.34); h = 3.4
			"cookpot": col = Color(0.28, 0.28, 0.32); h = 2.6
		return _make_billboard(_get_sprite_tex(k, col), h)
	, false)

	_sync_array(sim.farm_plots, farm_nodes, func(_fp: Dictionary) -> Sprite3D:
		return _make_billboard(_get_sprite_tex("farm_plot", Color(0.48, 0.34, 0.18)), 1.9)
	, false)

	_sync_array(sim.creatures, creature_nodes, func(c: Dictionary) -> Sprite3D:
		var k: String = str(c["kind"])
		var col: Color = Color(0.16, 0.15, 0.18)
		var h: float = 1.8
		if k == "hound":
			col = Color(0.38, 0.26, 0.22); h = 1.9
		elif k == "deerclops":
			col = Color(0.76, 0.80, 0.86); h = 5.4
		elif k == "mutated_deerclops":
			col = Color(0.52, 0.84, 0.94); h = 5.8
		return _make_billboard(_get_sprite_tex(k, col), h)
	, false)


func _sync_array(items: Array, cache: Dictionary, factory: Callable, hide_when_zero_hp: bool) -> void:
	var seen: Dictionary = {}
	for it in items:
		var uid: int = int(it["id"])
		seen[uid] = true
		var sp: Sprite3D
		if cache.has(uid):
			sp = cache[uid]
		else:
			sp = factory.call(it)
			add_child(sp)
			cache[uid] = sp
		var p: Vector2 = it["pos"]
		sp.position = Vector3(p.x, 0.0, p.y)
		if hide_when_zero_hp:
			sp.visible = int(it.get("hp", 1)) > 0
		else:
			sp.visible = true

	var existing: Array = cache.keys()
	for uid in existing:
		if not seen.has(uid):
			var node: Node = cache[uid]
			node.queue_free()
			cache.erase(uid)
