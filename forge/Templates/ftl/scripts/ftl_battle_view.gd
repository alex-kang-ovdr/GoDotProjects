class_name FTLBattleView
extends Node2D

## Authentic FTL: Faster Than Light 2D Ship & Combat Renderer.
## Draws real PNG hulls, floors, cloaks, shields, room interiors, weapon mount strips,
## animated crew sprites, fires, breaches, drones, projectiles, beams, and popups from FTLPkg.

const CELL := 35.0
const PLAYER_ORIGIN := Vector2(165.0, 210.0)
const ENEMY_BOX := Rect2(815.0, 120.0, 425.0, 445.0)
const BG_LIST := [
	"stars/bg_blueStarcluster.png",
	"stars/bg_dullstars.png",
	"stars/bg_dullstars2.png",
	"stars/bg_lonelystar.png",
	"stars/bg_lonelyRedStar.png",
	"stars/bg_darknebula.png",
]

var pkg: FTLPkg
var db: FTLDatabase
var player_ship: FTLShip
var enemy_ship: FTLShip

var bg_index: int = 0
var hazard_kind: String = ""
var is_nebula: bool = false
var paused: bool = false
var targeting_weapon_idx: int = -1
var hover_pos: Vector2 = Vector2.ZERO
var anim_clock: float = 0.0

# Active projectiles, beams, ripples, explosions, popups
var projectiles: Array = [] # {from_ship, to_ship, bp, target_room, pos, start_pos, end_pos, t, dur}
var beams: Array = []       # {to_ship, start_world, end_world, color, life, max_life}
var explosions: Array = []  # {pos, life, max_life, radius}
var shield_hits: Array = [] # {ship, pos, life, max_life}
var popups: Array = []      # {pos, text, color, life, max_life}

# Computed transforms for hit-testing
var _player_offset: Vector2 = PLAYER_ORIGIN
var _player_scale: float = 1.0
var _enemy_offset: Vector2 = Vector2(960.0, 290.0)
var _enemy_scale: float = 0.88

signal enemy_room_clicked(room_id: int)
signal player_room_clicked(room_id: int, button_index: int)
signal player_door_clicked(door_idx: int)
signal crew_clicked(crew_id: int)


func setup(p_pkg: FTLPkg, p_db: FTLDatabase) -> void:
	pkg = p_pkg
	db = p_db


func set_ships(p_player: FTLShip, p_enemy: FTLShip) -> void:
	player_ship = p_player
	enemy_ship = p_enemy
	_recompute_transforms()
	queue_redraw()


func set_backdrop(seed_val: int, nebula: bool, hazard: String) -> void:
	bg_index = abs(seed_val) % BG_LIST.size()
	is_nebula = nebula
	hazard_kind = hazard
	queue_redraw()


func clear_combat_fx() -> void:
	projectiles.clear()
	beams.clear()
	explosions.clear()
	shield_hits.clear()
	popups.clear()


func spawn_shot(shot: Dictionary) -> void:
	var from_ship: FTLShip = shot.from_ship
	var to_ship: FTLShip = shot.to_ship
	var w: Dictionary = shot.weapon
	var bp: Dictionary = w.bp
	var target_room: int = int(shot.target_room)
	var wtype := str(bp.get("type", "LASER"))
	var shots := maxi(1, int(bp.get("shots", 1)))
	var mount_idx := int(w.get("mount_idx", 0))
	var origin_world := _weapon_mount_world(from_ship, mount_idx)
	var target_world := ship_local_to_world(to_ship, to_ship.get_room_center_local(target_room))

	if wtype == "BEAM":
		# Sweep beam across up to 3 nearby rooms!
		var hit_rooms: Array[int] = [target_room]
		var base_c := to_ship.get_room_center_local(target_room)
		for r in to_ship.rooms:
			if int(r.id) != target_room and hit_rooms.size() < 3:
				if to_ship.get_room_center_local(int(r.id)).distance_to(base_c) <= CELL * 2.4:
					hit_rooms.append(int(r.id))
		var end_world := ship_local_to_world(to_ship, to_ship.get_room_center_local(hit_rooms[-1]))
		beams.append({
			"start_world": origin_world,
			"end_world": end_world,
			"color": bp.get("color", Color(1.0, 0.25, 0.15)),
			"life": 0.65,
			"max_life": 0.65,
		})
		for rid in hit_rooms:
			var res := to_ship.apply_projectile_impact(bp, rid)
			if res == "shield":
				shield_hits.append({"pos": ship_local_to_world(to_ship, to_ship.get_room_center_local(rid)), "life": 0.35, "max_life": 0.35})
		return

	if wtype == "BOMB":
		# Teleport bomb directly into target room with short fuse
		projectiles.append({
			"from_ship": from_ship,
			"to_ship": to_ship,
			"bp": bp,
			"target_room": target_room,
			"start_pos": target_world + Vector2(0, -14),
			"end_pos": target_world,
			"pos": target_world,
			"t": -0.05,
			"dur": 0.55,
			"is_bomb": true,
		})
		return

	var speed := maxf(25.0, float(bp.get("speed", 60.0)))
	var dist := maxf(180.0, origin_world.distance_to(target_world))
	var dur := clampf(dist / (speed * 11.0), 0.32, 1.35)
	for s_i in range(shots):
		var jitter := Vector2(randf_range(-10.0, 10.0), randf_range(-10.0, 10.0)) if shots > 1 else Vector2.ZERO
		projectiles.append({
			"from_ship": from_ship,
			"to_ship": to_ship,
			"bp": bp,
			"target_room": target_room,
			"start_pos": origin_world,
			"end_pos": target_world + jitter,
			"pos": origin_world,
			"t": -float(s_i) * 0.16,
			"dur": dur,
			"is_bomb": false,
		})


func step_fx(delta: float) -> void:
	anim_clock += delta
	_recompute_transforms()

	# Drain ship-emitted popups & explosions
	for sh in [player_ship, enemy_ship]:
		if sh == null:
			continue
		for pop in sh.pending_popups:
			popups.append({
				"pos": ship_local_to_world(sh, pop.pos_local),
				"text": str(pop.text),
				"color": pop.color,
				"life": 1.05,
				"max_life": 1.05,
			})
		sh.pending_popups.clear()
		for ex in sh.pending_explosions:
			explosions.append({
				"pos": ship_local_to_world(sh, ex.pos_local),
				"life": 0.45 if bool(ex.big) else 0.3,
				"max_life": 0.45 if bool(ex.big) else 0.3,
				"radius": 34.0 if bool(ex.big) else 22.0,
			})
		sh.pending_explosions.clear()

	if not paused:
		# Advance projectiles
		var alive_proj: Array = []
		for p in projectiles:
			p.t = float(p.t) + delta
			if float(p.t) < 0.0:
				alive_proj.append(p)
				continue
			var u := clampf(float(p.t) / maxf(0.05, float(p.dur)), 0.0, 1.0)
			p.pos = (p.start_pos as Vector2).lerp(p.end_pos as Vector2, u)
			# Defense drone interception for enemy missiles
			if u >= 0.62 and u <= 0.78 and str(p.bp.get("type", "")) == "MISSILES" and _try_defense_drone_intercept(p.to_ship, p.pos):
				explosions.append({"pos": p.pos, "life": 0.25, "max_life": 0.25, "radius": 18.0})
				popups.append({"pos": p.pos, "text": "INTERCEPT!", "color": Color("65e8ff"), "life": 0.85, "max_life": 0.85})
				continue
			if u >= 1.0:
				var to_ship: FTLShip = p.to_ship
				if to_ship != null and to_ship.hull > 0:
					var res := to_ship.apply_projectile_impact(p.bp, int(p.target_room))
					if res in ["shield", "shield_ion", "zoltan_shield"]:
						shield_hits.append({"pos": p.pos, "life": 0.35, "max_life": 0.35})
			else:
				alive_proj.append(p)
		projectiles = alive_proj

		# Beams / Explosions / Shield ripples / Popups
		var alive_beams: Array = []
		for b in beams:
			b.life = float(b.life) - delta
			if float(b.life) > 0.0:
				alive_beams.append(b)
		beams = alive_beams

		var alive_ex: Array = []
		for ex in explosions:
			ex.life = float(ex.life) - delta
			if float(ex.life) > 0.0:
				alive_ex.append(ex)
		explosions = alive_ex

		var alive_sh: Array = []
		for sh in shield_hits:
			sh.life = float(sh.life) - delta
			if float(sh.life) > 0.0:
				alive_sh.append(sh)
		shield_hits = alive_sh

		var alive_pop: Array = []
		for pop in popups:
			pop.life = float(pop.life) - delta
			pop.pos = (pop.pos as Vector2) + Vector2(0, -24.0 * delta)
			if float(pop.life) > 0.0:
				alive_pop.append(pop)
		popups = alive_pop

	queue_redraw()


func _try_defense_drone_intercept(target_ship: FTLShip, world_pos: Vector2) -> bool:
	if target_ship == null:
		return false
	for d in target_ship.drones:
		if bool(d.powered) and str(d.bp.get("type", "")) == "DEFENSE" and float(d.cooldown) <= 0.0:
			d.cooldown = 3.2
			return true
	return false


func _recompute_transforms() -> void:
	if player_ship != null:
		var pb := player_ship.get_ship_bounds_local()
		var target_center := Vector2(440.0, 340.0)
		var fit := minf(1.0, minf(560.0 / maxf(240.0, pb.size.x + 80.0), 340.0 / maxf(180.0, pb.size.y + 80.0)))
		_player_scale = clampf(fit, 0.72, 1.0)
		_player_offset = target_center - pb.get_center() * _player_scale

	if enemy_ship != null:
		var eb := enemy_ship.get_ship_bounds_local()
		var e_center := ENEMY_BOX.get_center() + Vector2(0.0, 12.0)
		var efit := minf(0.95, minf((ENEMY_BOX.size.x - 95.0) / maxf(180.0, eb.size.x + 70.0), (ENEMY_BOX.size.y - 125.0) / maxf(160.0, eb.size.y + 70.0)))
		_enemy_scale = clampf(efit, 0.56, 0.95)
		_enemy_offset = e_center - eb.get_center() * _enemy_scale


func ship_local_to_world(ship: FTLShip, local_pt: Vector2) -> Vector2:
	if ship == player_ship:
		return _player_offset + local_pt * _player_scale
	return _enemy_offset + local_pt * _enemy_scale


func world_to_ship_local(ship: FTLShip, world_pt: Vector2) -> Vector2:
	if ship == player_ship:
		return (world_pt - _player_offset) / maxf(0.01, _player_scale)
	return (world_pt - _enemy_offset) / maxf(0.01, _enemy_scale)


func _weapon_mount_world(ship: FTLShip, mount_idx: int) -> Vector2:
	if ship == null:
		return Vector2.ZERO
	var mounts: Array = ship.layout.get("weapon_mounts", [])
	var img_rect: Rect2 = ship.layout.get("img_rect", Rect2(-50, -90, 500, 340))
	if mount_idx >= 0 and mount_idx < mounts.size():
		var m: Dictionary = mounts[mount_idx]
		var local_pt := img_rect.position + Vector2(float(m.x), float(m.y))
		return ship_local_to_world(ship, local_pt)
	return ship_local_to_world(ship, ship.get_ship_bounds_local().get_center())


func handle_mouse_click(screen_pos: Vector2, button_index: int) -> bool:
	# 1. Enemy room click when targeting a weapon
	if enemy_ship != null and enemy_ship.hull > 0 and button_index == MOUSE_BUTTON_LEFT:
		var elocal := world_to_ship_local(enemy_ship, screen_pos)
		var eroom := enemy_ship.find_room_at_local(elocal)
		if eroom >= 0:
			enemy_room_clicked.emit(eroom)
			return true

	# 2. Player ship interactions (doors, crew, rooms)
	if player_ship != null:
		var plocal := world_to_ship_local(player_ship, screen_pos)
		if button_index == MOUSE_BUTTON_LEFT:
			var didx := player_ship.find_door_at_local(plocal, 11.5)
			if didx >= 0:
				player_door_clicked.emit(didx)
				return true
			# Check clicking directly on a player crew member
			for c in player_ship.crew:
				if c.is_player and c.hp > 0.0 and (c.pos as Vector2).distance_to(plocal) <= 17.0:
					crew_clicked.emit(int(c.id))
					return true
		var proom := player_ship.find_room_at_local(plocal)
		if proom >= 0:
			player_room_clicked.emit(proom, button_index)
			return true
	return false


# ==================== RENDERING ====================
func _draw() -> void:
	var vp := get_viewport_rect().size
	# 1. Deep space backdrop
	_draw_backdrop(vp)

	# 2. Player ship
	if player_ship != null:
		_draw_ship(player_ship, _player_offset, _player_scale, true)

	# 3. Enemy target box & enemy ship
	if enemy_ship != null and enemy_ship.hull > 0:
		_draw_enemy_panel()
		_draw_ship(enemy_ship, _enemy_offset, _enemy_scale, false)

	# 4. Weapon targeting lines & reticles
	_draw_targeting_overlays()

	# 5. Beams, projectiles, explosions, shield impacts, popups
	_draw_combat_fx()


func _draw_backdrop(vp: Vector2) -> void:
	draw_rect(Rect2(Vector2.ZERO, vp), Color(0.03, 0.04, 0.07, 1.0))
	var bg_tex: Texture2D = null
	if pkg != null and pkg.is_loaded:
		var bg_name: String = "stars/bg_darknebula.png" if is_nebula else str(BG_LIST[bg_index])
		bg_tex = pkg.load_texture(bg_name)
	if bg_tex != null:
		draw_texture_rect(bg_tex, Rect2(Vector2.ZERO, vp), false, Color(0.95, 0.96, 1.0, 1.0))
	else:
		# Clean starfield fallback
		for i in range(90):
			var sx := fmod(float(i * 197 + 41), vp.x)
			var sy := fmod(float(i * 313 + 79), vp.y)
			var b: float = 0.35 + 0.55 * absf(sin(anim_clock * 1.1 + float(i)))
			draw_circle(Vector2(sx, sy), 1.0 + float(i % 2) * 0.6, Color(0.85, 0.92, 1.0, b))

	if is_nebula:
		draw_rect(Rect2(Vector2.ZERO, vp), Color(0.32, 0.14, 0.42, 0.22))
	if hazard_kind == "sun":
		draw_circle(Vector2(180.0, 110.0), 95.0, Color(1.0, 0.48, 0.12, 0.25))
		draw_circle(Vector2(180.0, 110.0), 46.0, Color(1.0, 0.85, 0.42, 0.82))
	elif hazard_kind == "asteroid":
		for i in range(9):
			var ax := fmod(anim_clock * (22.0 + float(i) * 4.0) + float(i * 173), vp.x + 80.0) - 40.0
			var ay := fmod(float(i * 97 + 60), vp.y - 120.0) + 60.0
			draw_circle(Vector2(ax, ay), 7.0 + float(i % 3) * 4.0, Color(0.46, 0.42, 0.38, 0.72))
	elif hazard_kind == "pulsar":
		var pulse := 0.4 + 0.4 * sin(anim_clock * 3.5)
		draw_circle(Vector2(690.0, 140.0), 34.0 + pulse * 18.0, Color(0.35, 0.85, 1.0, 0.22))
		draw_circle(Vector2(690.0, 140.0), 14.0, Color(0.75, 0.96, 1.0, 0.9))


func _draw_enemy_panel() -> void:
	draw_rect(ENEMY_BOX, Color(0.06, 0.08, 0.11, 0.78), true)
	draw_rect(ENEMY_BOX, Color(0.72, 0.32, 0.28, 0.85), false, 2.0)
	var font := ThemeDB.fallback_font
	if font != null:
		var title := "%s  [HULL %d/%d]" % [enemy_ship.ship_name, enemy_ship.hull, enemy_ship.max_hull]
		if enemy_ship.is_boss:
			title = "REBEL FLAGSHIP · PHASE %d  [HULL %d/%d]" % [enemy_ship.boss_phase, enemy_ship.hull, enemy_ship.max_hull]
		draw_string(font, ENEMY_BOX.position + Vector2(12, 22), title, HORIZONTAL_ALIGNMENT_LEFT, ENEMY_BOX.size.x - 24, 15, Color("ffd4c8"))
		# Enemy hull bar
		var bar_r := Rect2(ENEMY_BOX.position + Vector2(12, 30), Vector2(ENEMY_BOX.size.x - 24, 10))
		draw_rect(bar_r, Color(0.18, 0.08, 0.08, 0.95), true)
		var fill_w := bar_r.size.x * clampf(float(enemy_ship.hull) / maxf(1.0, float(enemy_ship.max_hull)), 0.0, 1.0)
		draw_rect(Rect2(bar_r.position, Vector2(fill_w, bar_r.size.y)), Color("e85046"), true)
		# Enemy shield bubbles
		for s in range(enemy_ship.shield_max_layers):
			var c := Color("5cd6ff") if s < enemy_ship.shield_layers else Color(0.25, 0.32, 0.38, 0.65)
			draw_circle(ENEMY_BOX.position + Vector2(22 + s * 22, 54), 7.5, c)
		if enemy_ship.zoltan_shield > 0:
			draw_string(font, ENEMY_BOX.position + Vector2(130, 59), "ZOLTAN %d" % enemy_ship.zoltan_shield, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color("7eff8b"))


func _draw_ship(ship: FTLShip, origin: Vector2, sc: float, is_player_side: bool) -> void:
	draw_set_transform(origin, 0.0, Vector2(sc, sc))
	var bounds := ship.get_ship_bounds_local()
	var img_rect: Rect2 = ship.layout.get("img_rect", Rect2(-59, -103, 652, 418))
	var floor_off: Vector2 = ship.layout.get("floor_offset", Vector2.ZERO)

	# 1. Shield bubble
	if ship.shield_layers > 0 or ship.zoltan_shield > 0:
		var sh_color := Color(0.38, 0.98, 0.52, 0.24) if ship.zoltan_shield > 0 else Color(0.32, 0.78, 1.0, 0.14 + float(ship.shield_layers) * 0.04)
		var ell: Dictionary = ship.layout.get("ellipse", {"rx": 320, "ry": 210, "ox": 0, "oy": 0})
		var ec := bounds.get_center() + Vector2(float(ell.ox) * 0.25, float(ell.oy) * 0.25)
		var rx := maxf(bounds.size.x * 0.64, float(ell.rx) * 0.85)
		var ry := maxf(bounds.size.y * 0.74, float(ell.ry) * 0.85)
		_draw_ellipse_glow(ec, rx, ry, sh_color)

	# 2. Mounted weapon sprites behind hull edge
	_draw_ship_weapons(ship, img_rect)

	# 3. Ship hull sprite (from ftl.dat.vanilla!)
	var hull_tex: Texture2D = _load_ship_tex(ship.img_name, "base")
	var hull_tint := Color(0.55, 0.85, 1.0, 0.42) if ship.cloak_timer > 0.0 else Color.WHITE
	if hull_tex != null:
		draw_texture_rect(hull_tex, img_rect, false, hull_tint)
	else:
		# Crisp procedural hull silhouette fallback
		var hull_box := bounds.grow(28.0)
		draw_rect(hull_box, Color(0.24, 0.29, 0.35, 0.95) * hull_tint, true)
		draw_rect(hull_box, Color(0.56, 0.66, 0.76, 0.95) * hull_tint, false, 3.0)

	# 4. Floor graphic overlay
	var floor_tex: Texture2D = _load_ship_tex(ship.img_name, "floor")
	if floor_tex != null:
		var fl_pos := img_rect.position + floor_off
		draw_texture(floor_tex, fl_pos, Color(1, 1, 1, 0.92))

	# 5. Rooms (deck grid, oxygen tint, room interior PNG, system icons, fire & breach)
	var show_interior := is_player_side or (player_ship != null and player_ship.get_effective_system_power("sensors") >= 2) or true
	for r in ship.rooms:
		var rr := ship.get_room_rect_local(r)
		var o2 := float(r.oxygen)
		var bg := Color(0.84, 0.82, 0.76, 0.94)
		if o2 < 50.0:
			var t := clampf((50.0 - o2) / 50.0, 0.0, 1.0)
			bg = bg.lerp(Color(0.92, 0.42, 0.48, 0.94), t)
		draw_rect(rr, bg, true)

		# Tile grid lines inside room
		for gx in range(1, int(r.w)):
			var lx := rr.position.x + float(gx) * CELL
			draw_line(Vector2(lx, rr.position.y), Vector2(lx, rr.end.y), Color(0.58, 0.56, 0.52, 0.45), 1.0)
		for gy in range(1, int(r.h)):
			var ly := rr.position.y + float(gy) * CELL
			draw_line(Vector2(rr.position.x, ly), Vector2(rr.end.x, ly), Color(0.58, 0.56, 0.52, 0.45), 1.0)

		# Low-O2 diagonal hazard stripes
		if o2 < 25.0:
			for s_i in range(0, int(rr.size.x + rr.size.y), 14):
				var p1 := Vector2(rr.position.x + float(s_i), rr.position.y)
				var p2 := Vector2(rr.position.x, rr.position.y + float(s_i))
				draw_line(p1.clamp(rr.position, rr.end), p2.clamp(rr.position, rr.end), Color(0.85, 0.15, 0.25, 0.35), 2.0)

		# Real room interior PNG overlay from ftl.dat.vanilla!
		var sname := str(r.system)
		if not sname.is_empty() and ship.systems.has(sname) and pkg != null and pkg.is_loaded:
			var simg := str(ship.systems[sname].get("img", ""))
			if not simg.is_empty():
				var itex := pkg.load_texture("ship/interior/%s.png" % simg)
				if itex != null:
					draw_texture_rect(itex, rr, false, Color(1, 1, 1, 0.88))

		# Room outer walls
		draw_rect(rr, Color(0.14, 0.15, 0.18, 1.0), false, 2.5)

		# System icon & damage/ion status
		if not sname.is_empty() and ship.systems.has(sname):
			_draw_room_system_icon(ship, ship.systems[sname], rr)

		# Fires & breaches
		if int(r.fires) > 0:
			_draw_fire_in_room(rr, int(r.fires))
		if int(r.breach) > 0:
			_draw_breach_in_room(rr)

	# 6. Doors & airlocks
	for d in ship.doors:
		_draw_door(d, ship.get_effective_system_power("doors"))

	# 7. Crew sprites
	if show_interior:
		for c in ship.crew:
			if c.hp > 0.0:
				_draw_crew_member(c)

	# 8. Cloak shimmer
	if ship.cloak_timer > 0.0:
		var cloak_tex := _load_ship_tex(ship.img_name, "cloak")
		if cloak_tex != null:
			draw_texture_rect(cloak_tex, img_rect, false, Color(0.65, 0.9, 1.0, 0.55))

	# 9. Orbiting drones
	for d in ship.drones:
		if bool(d.powered):
			var ang := float(d.angle)
			var orbit_r := maxf(bounds.size.x, bounds.size.y) * 0.62
			var dp := bounds.get_center() + Vector2(cos(ang) * orbit_r, sin(ang) * orbit_r * 0.72)
			draw_circle(dp, 8.0, Color("66e0ff") if str(d.bp.get("type", "")) == "DEFENSE" else Color("ff9f43"))
			draw_circle(dp, 4.0, Color.WHITE)

	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _load_ship_tex(img_name: String, suffix: String) -> Texture2D:
	if pkg == null or not pkg.is_loaded:
		return null
	var candidates := [
		"ship/%s_%s.png" % [img_name, suffix],
		"ships_glow/%s_%s.png" % [img_name, suffix],
		"ships_noglow/%s_%s.png" % [img_name, suffix],
	]
	for c in candidates:
		var t := pkg.load_texture(c)
		if t != null:
			return t
	return null


func _draw_ship_weapons(ship: FTLShip, img_rect: Rect2) -> void:
	var mounts: Array = ship.layout.get("weapon_mounts", [])
	for i in range(ship.weapons.size()):
		if i >= mounts.size():
			break
		var w: Dictionary = ship.weapons[i]
		var m: Dictionary = mounts[i]
		var mpos := img_rect.position + Vector2(float(m.x), float(m.y))
		var slide_px := 6.0 if bool(w.powered) else 0.0
		var slide_vec := Vector2.ZERO
		match str(m.slide):
			"up": slide_vec = Vector2(0, -slide_px)
			"down": slide_vec = Vector2(0, slide_px)
			"left": slide_vec = Vector2(-slide_px, 0)
			"right": slide_vec = Vector2(slide_px, 0)
		var pos := mpos + slide_vec
		var drew := false
		if pkg != null and pkg.is_loaded and db != null:
			var wart := str(w.bp.get("weaponArt", ""))
			var wanim: Dictionary = db.weapon_anims.get(wart, {})
			var sheet_name := str(wanim.get("sheet", ""))
			var sheet: Dictionary = db.anim_sheets.get(sheet_name, {})
			if not sheet.is_empty():
				var tex := pkg.load_texture(str(sheet.path))
				if tex != null:
					var fw := float(sheet.fw)
					var fh := float(sheet.fh)
					var total_f := maxi(1, int(wanim.get("length", 1)))
					var frame := 0
					if float(w.fire_anim) > 0.2:
						frame = clampi(int(wanim.get("fireFrame", 2)), 0, total_f - 1)
					elif bool(w.powered):
						var ratio := clampf(float(w.charge) / maxf(0.1, float(w.cooldown)), 0.0, 1.0)
						frame = clampi(int(round(ratio * float(wanim.get("chargedFrame", 1)))), 0, total_f - 1)
					var src := Rect2(float(frame) * fw, 0.0, fw, fh)
					var dst := Rect2(pos - Vector2(fw * 0.5, fh * 0.5), Vector2(fw, fh))
					draw_texture_rect_region(tex, dst, src, Color.WHITE if bool(w.powered) else Color(0.6, 0.6, 0.65, 0.85))
					drew = true
		if not drew:
			var col := Color("ff9f43") if bool(w.powered) else Color(0.45, 0.48, 0.52)
			draw_rect(Rect2(pos - Vector2(10, 5), Vector2(20, 10)), col, true)


func _draw_room_system_icon(ship: FTLShip, sys: Dictionary, rr: Rect2) -> void:
	var sname := str(sys.id)
	var col := Color(0.92, 0.96, 1.0, 0.88)
	if int(sys.ion_level) > 0:
		col = Color("4ce0ff")
	elif int(sys.damage) >= int(sys.level):
		col = Color("ff4444")
	elif int(sys.damage) > 0:
		col = Color("ffaa33")
	elif int(sys.power) <= 0 and not (sname in FTLShip.SUBSYSTEMS):
		col = Color(0.58, 0.62, 0.66, 0.72)

	var icon_tex: Texture2D = null
	if pkg != null and pkg.is_loaded:
		icon_tex = pkg.load_texture("icons/s_%s_overlay.png" % sname)
		if icon_tex == null:
			icon_tex = pkg.load_texture("icons/s_%s_green1.png" % sname)
	var center := rr.get_center()
	if icon_tex != null:
		var sz := Vector2(28, 28)
		draw_texture_rect(icon_tex, Rect2(center - sz * 0.5, sz), false, col)
	else:
		var font := ThemeDB.fallback_font
		if font != null:
			draw_string(font, center + Vector2(-12, 5), sname.left(3).to_upper(), HORIZONTAL_ALIGNMENT_CENTER, 24, 12, col)


func _draw_fire_in_room(rr: Rect2, count: int) -> void:
	var fire_tex: Texture2D = pkg.load_texture("effects/fire_L1_strip8.png") if (pkg != null and pkg.is_loaded) else null
	var frame := int(anim_clock * 9.0) % 8
	for i in range(mini(count, 4)):
		var off := Vector2(float(i % 2) * 28.0 + 14.0, float(i / 2) * 26.0 + 16.0)
		var pos := (rr.position + off).clamp(rr.position + Vector2(12, 12), rr.end - Vector2(12, 12))
		if fire_tex != null:
			draw_texture_rect_region(fire_tex, Rect2(pos - Vector2(16, 16), Vector2(32, 32)), Rect2(float(frame) * 32.0, 0.0, 32.0, 32.0))
		else:
			draw_circle(pos, 10.0, Color(1.0, 0.45, 0.1, 0.85))
			draw_circle(pos + Vector2(0, -3), 5.0, Color(1.0, 0.9, 0.3, 0.9))


func _draw_breach_in_room(rr: Rect2) -> void:
	var btex: Texture2D = pkg.load_texture("effects/breach.png") if (pkg != null and pkg.is_loaded) else null
	var pos := rr.get_center() + Vector2(8, 6)
	if btex != null:
		draw_texture_rect_region(btex, Rect2(pos - Vector2(11, 9.5), Vector2(22, 19)), Rect2(0, 0, 22, 19))
	else:
		draw_circle(pos, 9.0, Color(0.05, 0.05, 0.08, 0.95))
		draw_arc(pos, 9.0, 0, TAU, 10, Color(0.75, 0.8, 0.9), 1.5)


func _draw_door(d: Dictionary, door_lvl: int) -> void:
	var center := Vector2(float(d.x) * CELL, (float(d.y) + 0.5) * CELL) if bool(d.vertical) else Vector2((float(d.x) + 0.5) * CELL, float(d.y) * CELL)
	var sz := Vector2(7.0, 22.0) if bool(d.vertical) else Vector2(22.0, 7.0)
	var col := Color(0.95, 0.65, 0.25) if bool(d.airlock) else Color(0.72, 0.78, 0.84)
	if door_lvl >= 2:
		col = Color(0.95, 0.82, 0.45)
	if bool(d.open):
		draw_rect(Rect2(center - sz * 0.5, sz), Color(0.15, 0.18, 0.22, 0.45), true)
		draw_rect(Rect2(center - sz * 0.5, sz), col, false, 1.5)
	else:
		draw_rect(Rect2(center - sz * 0.5, sz), col, true)
		draw_rect(Rect2(center - sz * 0.5, sz), Color(0.1, 0.12, 0.15), false, 1.2)


func _draw_crew_member(c: Dictionary) -> void:
	var pos: Vector2 = c.pos
	if bool(c.selected):
		draw_circle(pos, 15.0, Color(0.28, 1.0, 0.42, 0.28))
		draw_arc(pos, 15.0, 0, TAU, 18, Color(0.35, 1.0, 0.48, 0.95), 2.0)

	var species := str(c.species)
	var drew := false
	if pkg != null and pkg.is_loaded:
		var tex := pkg.load_texture("people/%s_base.png" % species)
		if tex == null:
			tex = pkg.load_texture("people/human_base.png")
		if tex != null:
			var fw := 35.0
			var fh := 35.0
			var frame := int(float(c.anim_t) * 6.0) % 4 if c.state == "walk" else 0
			# Row 0 (top of image in Godot) in human_base.png = walking down; safely clamp inside texture
			var sx := fmod(float(frame) * fw, maxf(fw, tex.get_width()))
			var src := Rect2(sx, 0.0, minf(fw, tex.get_width()), minf(fh, tex.get_height()))
			var tint := Color.WHITE if bool(c.is_player) else Color(1.0, 0.55, 0.55)
			draw_texture_rect_region(tex, Rect2(pos - Vector2(16, 16), Vector2(32, 32)), src, tint)
			drew = true
	if not drew:
		var col: Color = c.color if bool(c.is_player) else Color("ff5c5c")
		draw_circle(pos, 10.0, col)
		draw_circle(pos, 10.0, Color(0.1, 0.12, 0.15), false, 1.5)

	# Crew HP bar (when injured or selected)
	var ratio := clampf(float(c.hp) / maxf(1.0, float(c.max_hp)), 0.0, 1.0)
	if ratio < 0.99 or bool(c.selected):
		var br := Rect2(pos + Vector2(-12, -19), Vector2(24, 4))
		draw_rect(br, Color(0.12, 0.12, 0.14, 0.9), true)
		var hp_col := Color("4de86e") if ratio > 0.5 else (Color("f0c441") if ratio > 0.25 else Color("ff4444"))
		draw_rect(Rect2(br.position, Vector2(br.size.x * ratio, br.size.y)), hp_col, true)


func _draw_targeting_overlays() -> void:
	if player_ship == null or enemy_ship == null or enemy_ship.hull <= 0:
		return
	for i in range(player_ship.weapons.size()):
		var w: Dictionary = player_ship.weapons[i]
		if not bool(w.powered) or int(w.target_room) < 0:
			continue
		var tgt := ship_local_to_world(enemy_ship, enemy_ship.get_room_center_local(int(w.target_room)))
		var col := Color("ff4444") if not bool(w.autofire) else Color("ffbb33")
		draw_arc(tgt, 17.0, 0, TAU, 24, col, 2.2)
		draw_line(tgt + Vector2(-22, 0), tgt + Vector2(-11, 0), col, 2.0)
		draw_line(tgt + Vector2(11, 0), tgt + Vector2(22, 0), col, 2.0)
		draw_line(tgt + Vector2(0, -22), tgt + Vector2(0, -11), col, 2.0)
		draw_line(tgt + Vector2(0, 11), tgt + Vector2(0, 22), col, 2.0)
		var font := ThemeDB.fallback_font
		if font != null:
			draw_string(font, tgt + Vector2(14, -12), str(i + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, col)

	# Hover crosshair when selecting a target for targeting_weapon_idx
	if targeting_weapon_idx >= 0:
		var elocal := world_to_ship_local(enemy_ship, hover_pos)
		var eroom := enemy_ship.find_room_at_local(elocal)
		if eroom >= 0:
			var c := ship_local_to_world(enemy_ship, enemy_ship.get_room_center_local(eroom))
			draw_arc(c, 22.0 + sin(anim_clock * 10.0) * 2.5, 0, TAU, 24, Color("7eff8b"), 2.4)


func _draw_combat_fx() -> void:
	# Beams
	for b in beams:
		var a := clampf(float(b.life) / maxf(0.01, float(b.max_life)), 0.0, 1.0)
		var col: Color = b.color
		draw_line(b.start_world, b.end_world, Color(col.r, col.g, col.b, a * 0.45), 11.0)
		draw_line(b.start_world, b.end_world, Color(1.0, 0.92, 0.85, a), 3.5)

	# Projectiles
	for p in projectiles:
		if float(p.t) < 0.0:
			continue
		var dir: Vector2 = ((p.end_pos as Vector2) - (p.start_pos as Vector2)).normalized()
		var wtype := str(p.bp.get("type", "LASER"))
		var ion := int(p.bp.get("ion", 0))
		if bool(p.is_bomb):
			var pulse := 0.5 + 0.5 * sin(anim_clock * 24.0)
			draw_circle(p.pos, 9.0 + pulse * 4.0, Color(1.0, 0.45, 0.15, 0.85))
			draw_circle(p.pos, 5.0, Color.WHITE)
		elif ion > 0:
			draw_circle(p.pos, 9.0, Color(0.25, 0.82, 1.0, 0.45))
			draw_circle(p.pos, 5.0, Color(0.85, 0.98, 1.0, 1.0))
		elif wtype == "MISSILES":
			var tip: Vector2 = p.pos + dir * 11.0
			var tail: Vector2 = p.pos - dir * 10.0
			draw_line(tail, tip, Color("ffcf5c"), 4.5)
			draw_circle(tail, 4.0, Color(1.0, 0.45, 0.1, 0.85))
		else:
			var col: Color = p.bp.get("color", Color(1.0, 0.25, 0.2))
			draw_line(p.pos - dir * 16.0, p.pos + dir * 12.0, Color(col.r, col.g, col.b, 0.65), 6.0)
			draw_line(p.pos - dir * 12.0, p.pos + dir * 10.0, Color(1.0, 0.92, 0.92, 1.0), 2.5)

	# Shield ripples
	for sh in shield_hits:
		var a := clampf(float(sh.life) / maxf(0.01, float(sh.max_life)), 0.0, 1.0)
		var r := 14.0 + (1.0 - a) * 32.0
		draw_arc(sh.pos, r, 0, TAU, 24, Color(0.45, 0.88, 1.0, a * 0.9), 3.0)

	# Explosions
	for ex in explosions:
		var a := clampf(float(ex.life) / maxf(0.01, float(ex.max_life)), 0.0, 1.0)
		var r := float(ex.radius) * (0.4 + (1.0 - a) * 0.9)
		draw_circle(ex.pos, r, Color(1.0, 0.45, 0.12, a * 0.65))
		draw_circle(ex.pos, r * 0.55, Color(1.0, 0.92, 0.55, a * 0.9))

	# Floating combat popups
	var font := ThemeDB.fallback_font
	if font != null:
		for pop in popups:
			var a := clampf(float(pop.life) / maxf(0.01, float(pop.max_life)), 0.0, 1.0)
			var c: Color = pop.color
			draw_string(font, (pop.pos as Vector2) + Vector2(-28, 1), str(pop.text), HORIZONTAL_ALIGNMENT_CENTER, 72, 15, Color(0, 0, 0, a * 0.85))
			draw_string(font, (pop.pos as Vector2) + Vector2(-29, 0), str(pop.text), HORIZONTAL_ALIGNMENT_CENTER, 72, 15, Color(c.r, c.g, c.b, a))


func _draw_ellipse_glow(center: Vector2, rx: float, ry: float, col: Color) -> void:
	var pts := PackedVector2Array()
	var segs := 44
	for i in range(segs + 1):
		var a := float(i) / float(segs) * TAU
		pts.append(center + Vector2(cos(a) * rx, sin(a) * ry))
	draw_colored_polygon(pts, col)
	draw_polyline(pts, Color(col.r, col.g, col.b, minf(0.9, col.a * 3.2)), 2.5)
