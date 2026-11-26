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
var special_target_mode: String = "" # "", "tp_send", "tp_back", "hack", "mind"
var hover_pos: Vector2 = Vector2.ZERO
var anim_clock: float = 0.0
var screen_shake: float = 0.0
var player_hit_flash: float = 0.0
var enemy_hit_flash: float = 0.0

# Beam drag-line aiming state (in enemy ship local coordinates)
var beam_drag_active: bool = false
var beam_drag_start: Vector2 = Vector2.ZERO
var beam_drag_end: Vector2 = Vector2.ZERO
var beam_drag_rooms: Array[int] = []

# Active projectiles, beams, ripples, explosions, teleports, popups
var projectiles: Array = [] # {from_ship, to_ship, bp, target_room, pos, start_pos, end_pos, t, dur}
var beams: Array = []       # {origin_world, sweep_start_world, sweep_end_world, color, life, max_life}
var explosions: Array = []  # {pos, life, max_life, radius}
var shield_hits: Array = [] # {ship, pos, life, max_life}
var teleport_fx: Array = [] # {pos, incoming, life, max_life}
var popups: Array = []      # {pos, text, color, life, max_life}

# Computed transforms for hit-testing
var _player_offset: Vector2 = PLAYER_ORIGIN
var _player_scale: float = 1.0
var _enemy_offset: Vector2 = Vector2(960.0, 290.0)
var _enemy_scale: float = 0.88

signal enemy_room_clicked(room_id: int)
signal enemy_room_right_clicked(room_id: int)
signal enemy_beam_aimed(beam_start: Vector2, beam_end: Vector2, beam_rooms: Array)
signal player_room_clicked(room_id: int, button_index: int)
signal player_door_clicked(door_idx: int)
signal crew_clicked(crew_id: int)
signal boarder_clicked(crew_id: int)


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
	teleport_fx.clear()
	popups.clear()
	beam_drag_active = false
	beam_drag_rooms.clear()


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
		var hit_rooms: Array[int] = []
		var b_start_local: Vector2 = shot.get("beam_start", Vector2.ZERO)
		var b_end_local: Vector2 = shot.get("beam_end", Vector2.ZERO)
		var raw_rooms: Array = shot.get("beam_rooms", [])
		for rr_id in raw_rooms:
			hit_rooms.append(int(rr_id))
		if hit_rooms.is_empty():
			# Fallback auto-sweep if AI or single-click fired without drag
			hit_rooms.append(target_room)
			var base_c := to_ship.get_room_center_local(target_room)
			var blen := clampf(float(bp.get("length", 80.0)), 45.0, 175.0)
			for r in to_ship.rooms:
				if int(r.id) != target_room and hit_rooms.size() < 3:
					if to_ship.get_room_center_local(int(r.id)).distance_to(base_c) <= blen:
						hit_rooms.append(int(r.id))
			b_start_local = base_c
			b_end_local = to_ship.get_room_center_local(hit_rooms[-1])
		var sweep_start_w := ship_local_to_world(to_ship, b_start_local)
		var sweep_end_w := ship_local_to_world(to_ship, b_end_local)
		beams.append({
			"origin_world": origin_world,
			"sweep_start_world": sweep_start_w,
			"sweep_end_world": sweep_end_w,
			"color": bp.get("color", Color(1.0, 0.25, 0.15)),
			"life": 0.75,
			"max_life": 0.75,
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
	var is_flak := (wtype == "BURST" or float(bp.get("radius", 0.0)) > 0.0)
	var flak_rad := maxf(28.0, float(bp.get("radius", 42.0)))
	var target_local := to_ship.get_room_center_local(target_room)
	for s_i in range(shots):
		var impact_room := target_room
		var end_w := target_world
		var stagger := -float(s_i) * (0.04 if is_flak else 0.16)
		if is_flak:
			var ang := randf() * TAU
			var r_off := sqrt(randf()) * flak_rad
			var land_local := target_local + Vector2(cos(ang), sin(ang)) * r_off
			var found_r := to_ship.find_room_at_local(land_local)
			if found_r >= 0:
				impact_room = found_r
			end_w = ship_local_to_world(to_ship, land_local)
		elif shots > 1:
			end_w = target_world + Vector2(randf_range(-10.0, 10.0), randf_range(-10.0, 10.0))
		projectiles.append({
			"from_ship": from_ship,
			"to_ship": to_ship,
			"bp": bp,
			"target_room": impact_room,
			"start_pos": origin_world,
			"end_pos": end_w,
			"pos": origin_world,
			"t": stagger,
			"dur": dur + (randf_range(-0.04, 0.06) if is_flak else 0.0),
			"is_bomb": false,
		})


func step_fx(delta: float) -> void:
	anim_clock += delta
	screen_shake = maxf(0.0, screen_shake - delta * 22.0)
	player_hit_flash = maxf(0.0, player_hit_flash - delta * 3.5)
	enemy_hit_flash = maxf(0.0, enemy_hit_flash - delta * 3.5)
	_recompute_transforms()

	# Drain ship-emitted popups & explosions
	for sh in [player_ship, enemy_ship]:
		if sh == null:
			continue
		for pop in sh.pending_popups:
			var pop_ship: FTLShip = pop.get("ship", sh)
			popups.append({
				"pos": ship_local_to_world(pop_ship, pop.pos_local),
				"text": str(pop.text),
				"color": pop.color,
				"life": 1.05,
				"max_life": 1.05,
			})
		sh.pending_popups.clear()
		for ex in sh.pending_explosions:
			var is_big := bool(ex.big)
			explosions.append({
				"pos": ship_local_to_world(sh, ex.pos_local),
				"life": 0.45 if is_big else 0.3,
				"max_life": 0.45 if is_big else 0.3,
				"radius": 34.0 if is_big else 22.0,
			})
			screen_shake = minf(12.0, screen_shake + (7.5 if is_big else 4.0))
			if sh == player_ship:
				player_hit_flash = 1.0
			else:
				enemy_hit_flash = 1.0
		sh.pending_explosions.clear()
		for tp in sh.pending_teleports:
			teleport_fx.append({
				"pos": ship_local_to_world(tp.ship, tp.pos_local),
				"incoming": bool(tp.incoming),
				"life": 0.65,
				"max_life": 0.65,
			})
		sh.pending_teleports.clear()

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
			# Defense Drone I (missiles/asteroids) & Defense Drone II (lasers/flak/ion/missiles) interception!
			var ptype := str(p.bp.get("type", ""))
			if u >= 0.60 and u <= 0.78 and not bool(p.get("is_bomb", false)) and _try_defense_drone_intercept(p.to_ship, p.pos, ptype):
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

		var alive_tp: Array = []
		for tp in teleport_fx:
			tp.life = float(tp.life) - delta
			if float(tp.life) > 0.0:
				alive_tp.append(tp)
		teleport_fx = alive_tp

		var alive_pop: Array = []
		for pop in popups:
			pop.life = float(pop.life) - delta
			pop.pos = (pop.pos as Vector2) + Vector2(0, -24.0 * delta)
			if float(pop.life) > 0.0:
				alive_pop.append(pop)
		popups = alive_pop

	queue_redraw()


func _try_defense_drone_intercept(target_ship: FTLShip, world_pos: Vector2, proj_type: String = "MISSILES") -> bool:
	if target_ship == null:
		return false
	for d in target_ship.drones:
		if not bool(d.powered) or str(d.bp.get("type", "")) != "DEFENSE" or float(d.cooldown) > 0.0:
			continue
		var is_mk2 := str(d.id).to_upper().contains("2") or int(d.bp.get("power", 2)) >= 3
		var can_hit := (proj_type == "MISSILES") or (is_mk2 and proj_type in ["LASER", "BURST", "ION"])
		if not can_hit:
			continue
		d.cooldown = 1.6 if is_mk2 else 3.2
		var b := target_ship.get_ship_bounds_local()
		var ang := float(d.angle)
		var orbit_r := maxf(b.size.x, b.size.y) * 0.62
		var drone_w := ship_local_to_world(target_ship, b.get_center() + Vector2(cos(ang) * orbit_r, sin(ang) * orbit_r * 0.72))
		beams.append({
			"origin_world": drone_w,
			"sweep_start_world": world_pos,
			"sweep_end_world": world_pos,
			"color": Color("65e8ff"),
			"life": 0.18,
			"max_life": 0.18,
		})
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


func _is_targeting_beam() -> bool:
	if player_ship == null or targeting_weapon_idx < 0 or targeting_weapon_idx >= player_ship.weapons.size():
		return false
	return str(player_ship.weapons[targeting_weapon_idx].bp.get("type", "")) == "BEAM"


func _get_targeting_beam_length() -> float:
	if not _is_targeting_beam():
		return 80.0
	return clampf(float(player_ship.weapons[targeting_weapon_idx].bp.get("length", 80.0)), 40.0, 180.0)


func handle_mouse_motion(screen_pos: Vector2) -> void:
	hover_pos = screen_pos
	if beam_drag_active and enemy_ship != null:
		var elocal := world_to_ship_local(enemy_ship, screen_pos)
		var dv := elocal - beam_drag_start
		var max_len := _get_targeting_beam_length()
		if dv.length() > max_len:
			dv = dv.normalized() * max_len
		elif dv.length() < 6.0:
			dv = Vector2(minf(45.0, max_len), 0.0)
		beam_drag_end = beam_drag_start + dv
		beam_drag_rooms = enemy_ship.compute_beam_rooms(beam_drag_start, beam_drag_end)
		queue_redraw()


func handle_mouse_release(screen_pos: Vector2, button_index: int) -> bool:
	if beam_drag_active and button_index == MOUSE_BUTTON_LEFT:
		handle_mouse_motion(screen_pos)
		beam_drag_active = false
		if not beam_drag_rooms.is_empty():
			enemy_beam_aimed.emit(beam_drag_start, beam_drag_end, beam_drag_rooms.duplicate())
		beam_drag_rooms.clear()
		queue_redraw()
		return true
	return false


func handle_mouse_click(screen_pos: Vector2, button_index: int) -> bool:
	# 1. Beam drag-line aiming start on enemy ship
	if enemy_ship != null and enemy_ship.hull > 0 and button_index == MOUSE_BUTTON_LEFT and _is_targeting_beam() and special_target_mode.is_empty():
		if ENEMY_BOX.has_point(screen_pos):
			var elocal := world_to_ship_local(enemy_ship, screen_pos)
			beam_drag_active = true
			beam_drag_start = elocal
			beam_drag_end = elocal + Vector2(minf(45.0, _get_targeting_beam_length()), 0.0)
			beam_drag_rooms = enemy_ship.compute_beam_rooms(beam_drag_start, beam_drag_end)
			queue_redraw()
			return true

	# 2. Enemy ship interactions (boarder selection, right-click boarder move, room targeting / TP / Hack / Mind)
	if enemy_ship != null and enemy_ship.hull > 0:
		var elocal := world_to_ship_local(enemy_ship, screen_pos)
		if button_index == MOUSE_BUTTON_LEFT and targeting_weapon_idx < 0 and special_target_mode.is_empty():
			for c in enemy_ship.crew:
				if bool(c.is_player) and c.hp > 0.0 and (c.pos as Vector2).distance_to(elocal) <= 18.0:
					boarder_clicked.emit(int(c.id))
					return true
		var eroom := enemy_ship.find_room_at_local(elocal)
		if eroom >= 0:
			if button_index == MOUSE_BUTTON_RIGHT:
				enemy_room_right_clicked.emit(eroom)
				return true
			if button_index == MOUSE_BUTTON_LEFT:
				enemy_room_clicked.emit(eroom)
				return true

	# 3. Player ship interactions (doors, crew, rooms)
	if player_ship != null:
		var plocal := world_to_ship_local(player_ship, screen_pos)
		if button_index == MOUSE_BUTTON_LEFT and special_target_mode.is_empty():
			var didx := player_ship.find_door_at_local(plocal, 11.5)
			if didx >= 0:
				player_door_clicked.emit(didx)
				return true
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
	var shake_off := Vector2(sin(anim_clock * 57.0), cos(anim_clock * 63.0)) * screen_shake if screen_shake > 0.1 else Vector2.ZERO
	# 1. Deep space backdrop
	_draw_backdrop(vp)

	# 2. Player ship
	if player_ship != null:
		_draw_ship(player_ship, _player_offset + shake_off * 0.65, _player_scale, true)

	# 3. Enemy target box & enemy ship
	if enemy_ship != null and enemy_ship.hull > 0:
		_draw_enemy_panel()
		_draw_ship(enemy_ship, _enemy_offset + shake_off * 0.45, _enemy_scale, false)

	# 4. Weapon targeting lines & reticles
	_draw_targeting_overlays()

	# 5. Beams, projectiles, explosions, shield impacts, popups
	_draw_combat_fx()

	# 6. Authentic FTL Tactical Pause border frame
	if paused:
		draw_rect(Rect2(Vector2(3, 3), vp - Vector2(6, 6)), Color(0.45, 0.85, 1.0, 0.48), false, 4.0)


func _draw_backdrop(vp: Vector2) -> void:
	draw_rect(Rect2(Vector2.ZERO, vp), Color(0.03, 0.04, 0.07, 1.0))
	var bg_tex: Texture2D = null
	if pkg != null and pkg.is_loaded:
		var bg_name: String = "stars/bg_darknebula.png" if is_nebula else str(BG_LIST[bg_index])
		bg_tex = pkg.load_texture(bg_name)
	if bg_tex != null:
		draw_texture_rect(bg_tex, Rect2(Vector2.ZERO, vp), false, Color(0.95, 0.96, 1.0, 1.0))
	# Subtle drifting space dust parallax (authentic FTL motion feel)
	for i in range(42):
		var spd := 4.5 + float(i % 4) * 3.2
		var sx := fmod(float(i * 197 + 41) - anim_clock * spd + vp.x * 10.0, vp.x)
		var sy := fmod(float(i * 313 + 79), vp.y)
		var b: float = 0.22 + 0.38 * absf(sin(anim_clock * 1.4 + float(i)))
		draw_circle(Vector2(sx, sy), 0.9 + float(i % 2) * 0.5, Color(0.85, 0.92, 1.0, b))

	if is_nebula:
		draw_rect(Rect2(Vector2.ZERO, vp), Color(0.32, 0.14, 0.42, 0.22))
	if hazard_kind == "sun":
		var sun_tex := pkg.load_texture("effects/glowing_star.png") if (pkg != null and pkg.is_loaded) else null
		var pulse := 1.0 + 0.08 * sin(anim_clock * 2.8)
		if sun_tex != null:
			var ssz := Vector2(180.0, 180.0) * pulse
			draw_texture_rect(sun_tex, Rect2(Vector2(180.0, 125.0) - ssz * 0.5, ssz), false, Color(1.0, 0.92, 0.78, 0.95))
		else:
			draw_circle(Vector2(180.0, 110.0), 95.0 * pulse, Color(1.0, 0.48, 0.12, 0.25))
			draw_circle(Vector2(180.0, 110.0), 46.0, Color(1.0, 0.85, 0.42, 0.82))
	elif hazard_kind == "asteroid":
		for i in range(9):
			var ax := fmod(anim_clock * (22.0 + float(i) * 4.0) + float(i * 173), vp.x + 80.0) - 40.0
			var ay := fmod(float(i * 97 + 60), vp.y - 120.0) + 60.0
			var atex := pkg.load_texture("asteroids/asteroid%d.png" % (i % 10)) if (pkg != null and pkg.is_loaded) else null
			if atex != null:
				var asz := 24.0 + float(i % 3) * 10.0
				draw_texture_rect(atex, Rect2(Vector2(ax - asz * 0.5, ay - asz * 0.5), Vector2(asz, asz)), false, Color(1, 1, 1, 0.88))
			else:
				draw_circle(Vector2(ax, ay), 7.0 + float(i % 3) * 4.0, Color(0.46, 0.42, 0.38, 0.72))
	elif hazard_kind == "pulsar":
		var pulse := 0.4 + 0.4 * sin(anim_clock * 3.5)
		var pb_tex := pkg.load_texture("effects/pulsar_backL.png") if (pkg != null and pkg.is_loaded) else null
		var pf_tex := pkg.load_texture("effects/pulsar_frontL.png") if (pkg != null and pkg.is_loaded) else null
		if pb_tex != null and pf_tex != null:
			var psz := Vector2(130.0, 130.0) * (0.95 + pulse * 0.25)
			draw_texture_rect(pb_tex, Rect2(Vector2(690.0, 145.0) - psz * 0.5, psz), false, Color(0.55, 0.92, 1.0, 0.65))
			draw_texture_rect(pf_tex, Rect2(Vector2(690.0, 145.0) - psz * 0.42, psz * 0.84), false, Color(0.9, 0.98, 1.0, 0.92))
		else:
			draw_circle(Vector2(690.0, 140.0), 34.0 + pulse * 18.0, Color(0.35, 0.85, 1.0, 0.22))
			draw_circle(Vector2(690.0, 140.0), 14.0, Color(0.75, 0.96, 1.0, 0.9))
	elif hazard_kind == "ion_storm":
		var flash := 0.08 + 0.10 * absf(sin(anim_clock * 5.2))
		draw_rect(Rect2(Vector2.ZERO, vp), Color(0.22, 0.55, 1.0, flash))
		for i in range(4):
			var lx := fmod(float(i * 317 + 120) + anim_clock * 24.0, vp.x)
			draw_line(Vector2(lx, 70.0), Vector2(lx + sin(anim_clock * 9.0 + i) * 35.0, 220.0), Color(0.55, 0.88, 1.0, 0.35), 2.0)


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
		# Sensor Lv3 (outside Nebula): display enemy weapon charge bars!
		var sens_lvl := 0 if (is_nebula or player_ship == null) else player_ship.get_effective_system_power("sensors")
		if sens_lvl >= 3 and not enemy_ship.weapons.is_empty():
			var wx := ENEMY_BOX.position.x + 12.0
			var wy := ENEMY_BOX.position.y + 68.0
			for wi in range(mini(4, enemy_ship.weapons.size())):
				var ew: Dictionary = enemy_ship.weapons[wi]
				var wr := Rect2(wx + float(wi) * 98.0, wy, 92.0, 8.0)
				draw_rect(wr, Color(0.15, 0.18, 0.24, 0.9), true)
				if bool(ew.powered):
					var ecd := enemy_ship.get_weapon_effective_cooldown(ew)
					var eratio := clampf(float(ew.charge) / maxf(0.1, ecd), 0.0, 1.0)
					draw_rect(Rect2(wr.position, Vector2(wr.size.x * eratio, wr.size.y)), Color("ff9e42") if eratio < 1.0 else Color("ff4444"), true)
		if enemy_ship.fleeing:
			draw_string(font, ENEMY_BOX.position + Vector2(220, 59), "FTL ESCAPE %d%%" % int(enemy_ship.flee_ftl_charge * 100.0), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color("ffd54f"))


func _draw_ship(ship: FTLShip, origin: Vector2, sc: float, is_player_side: bool) -> void:
	draw_set_transform(origin, 0.0, Vector2(sc, sc))
	var bounds := ship.get_ship_bounds_local()
	var img_rect: Rect2 = ship.layout.get("img_rect", Rect2(-59, -103, 652, 418))
	var floor_off: Vector2 = ship.layout.get("floor_offset", Vector2.ZERO)

	# 1. Shield dome (authentic FTL shield PNG texture + breathing glow!)
	if ship.shield_layers > 0 or ship.zoltan_shield > 0:
		var breath := 0.88 + 0.12 * sin(anim_clock * 2.8)
		var sh_color := Color(0.38, 0.98, 0.52, 0.58 * breath) if ship.zoltan_shield > 0 else Color(0.38, 0.82, 1.0, (0.38 + float(ship.shield_layers) * 0.11) * breath)
		var ell: Dictionary = ship.layout.get("ellipse", {"rx": 320, "ry": 210, "ox": 0, "oy": 0})
		var ec := bounds.get_center() + Vector2(float(ell.ox) * 0.25, float(ell.oy) * 0.25)
		var rx := maxf(bounds.size.x * 0.64, float(ell.rx) * 0.85)
		var ry := maxf(bounds.size.y * 0.74, float(ell.ry) * 0.85)
		var sh_tex: Texture2D = null
		if pkg != null and pkg.is_loaded:
			sh_tex = pkg.load_texture("ship/%s_shields1.png" % ship.img_name)
			if sh_tex == null:
				sh_tex = pkg.load_texture("ship/enemy_shields.png")
		if sh_tex != null:
			draw_texture_rect(sh_tex, Rect2(ec - Vector2(rx, ry), Vector2(rx * 2.0, ry * 2.0)), false, sh_color)
		else:
			_draw_ellipse_glow(ec, rx, ry, Color(sh_color.r, sh_color.g, sh_color.b, sh_color.a * 0.45))

	# 1b. Engine Thruster Exhaust Glow when engines powered
	if ship.get_effective_system_power("engines") > 0 and ship.cloak_timer <= 0.0:
		var t_pulse := 0.75 + 0.25 * sin(anim_clock * 16.0)
		var eng_y := bounds.get_center().y
		var eng_x := img_rect.position.x + 14.0
		var thr_tex := pkg.load_texture("effects/thrusters_on.png") if (pkg != null and pkg.is_loaded) else null
		if thr_tex != null:
			draw_texture_rect(thr_tex, Rect2(Vector2(eng_x - 36.0, eng_y - 22.0), Vector2(44.0 * t_pulse, 44.0)), false, Color(0.65, 0.88, 1.0, 0.75 * t_pulse))
		else:
			draw_circle(Vector2(eng_x - 8.0, eng_y), 14.0 * t_pulse, Color(0.35, 0.75, 1.0, 0.45))

	# 2. Mounted weapon sprites behind hull edge
	_draw_ship_weapons(ship, img_rect)

	# 3. Ship hull sprite (from ftl.dat.vanilla, with red impact flash!)
	var hull_tex: Texture2D = _load_ship_tex(ship.img_name, "base")
	var flash := player_hit_flash if is_player_side else enemy_hit_flash
	var hull_tint := Color(0.55, 0.85, 1.0, 0.42) if ship.cloak_timer > 0.0 else Color.WHITE.lerp(Color(1.0, 0.48, 0.42, 1.0), flash * 0.7)
	if hull_tex != null:
		draw_texture_rect(hull_tex, img_rect, false, hull_tint)
	else:
		# Sleek procedural multi-layered sci-fi hull silhouette (zero external asset dependency!)
		_draw_procedural_hull(ship, bounds, hull_tint)

	# 4. Floor graphic overlay
	var floor_tex: Texture2D = _load_ship_tex(ship.img_name, "floor")
	if floor_tex != null:
		var fl_pos := img_rect.position + floor_off
		draw_texture(floor_tex, fl_pos, Color(1, 1, 1, 0.92))

	# 5. Rooms (deck grid, oxygen tint, room interior PNG, system icons, fire & breach, Sensor Fog-of-War)
	var sens_lvl := 0 if (is_nebula or player_ship == null) else player_ship.get_effective_system_power("sensors")
	var has_slug := (player_ship != null and player_ship.has_slug_crew())
	var show_interior := is_player_side or (sens_lvl >= 2)
	for r in ship.rooms:
		var rr := ship.get_room_rect_local(r)
		var room_has_friendly := false
		if not is_player_side:
			for bc in ship.crew:
				if bool(bc.is_player) and float(bc.hp) > 0.0 and int(bc.room_id) == int(r.id):
					room_has_friendly = true
					break
		var room_visible := show_interior or room_has_friendly
		var o2 := float(r.oxygen)
		var bg := Color(0.84, 0.82, 0.76, 0.94) if room_visible else Color(0.28, 0.30, 0.34, 0.92)
		if room_visible and o2 < 50.0:
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
		if room_visible and o2 < 25.0:
			for s_i in range(0, int(rr.size.x + rr.size.y), 14):
				var p1 := Vector2(rr.position.x + float(s_i), rr.position.y)
				var p2 := Vector2(rr.position.x, rr.position.y + float(s_i))
				draw_line(p1.clamp(rr.position, rr.end), p2.clamp(rr.position, rr.end), Color(0.85, 0.15, 0.25, 0.35), 2.0)

		# Real room interior PNG overlay from ftl.dat.vanilla!
		var sname := str(r.system)
		if room_visible and not sname.is_empty() and ship.systems.has(sname) and pkg != null and pkg.is_loaded:
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

		# Fires & breaches & Repair/Sabotage progress bar
		if room_visible and int(r.fires) > 0:
			_draw_fire_in_room(rr, int(r.fires))
		if room_visible and int(r.breach) > 0:
			_draw_breach_in_room(rr)
		if room_visible:
			var rp := float(r.get("repair_progress", 0.0))
			var sp := float(r.get("sabotage_progress", 0.0))
			if rp > 0.02:
				var br := Rect2(rr.position + Vector2(4, rr.size.y - 8), Vector2(rr.size.x - 8, 4))
				draw_rect(br, Color(0.1, 0.12, 0.15, 0.85), true)
				draw_rect(Rect2(br.position, Vector2(br.size.x * clampf(rp, 0.0, 1.0), br.size.y)), Color("7eff8b"), true)
			elif sp > 0.02:
				var br := Rect2(rr.position + Vector2(4, rr.size.y - 8), Vector2(rr.size.x - 8, 4))
				draw_rect(br, Color(0.1, 0.12, 0.15, 0.85), true)
				draw_rect(Rect2(br.position, Vector2(br.size.x * clampf(sp, 0.0, 1.0), br.size.y)), Color("ff6b4a"), true)

		# Crystal Lockdown crystalline barrier!
		if float(r.get("lockdown_timer", 0.0)) > 0.0:
			var lock_a := 0.24 + 0.14 * absf(sin(anim_clock * 7.0))
			draw_rect(rr, Color(0.35, 0.88, 1.0, lock_a), true)
			draw_rect(rr, Color("8cf2ff"), false, 4.0)

		# Hacking drone pod & purple pulse overlay
		if ship.hacked_room == int(r.id):
			var pulse_a := (0.34 + 0.24 * absf(sin(anim_clock * 11.0))) if ship.hacked_active else 0.14
			draw_rect(rr, Color(0.75, 0.25, 1.0, pulse_a), true)
			draw_rect(rr, Color(0.88, 0.45, 1.0, 0.95), false, 3.0)
			var pod_p := rr.position + Vector2(rr.size.x * 0.5, -8.0)
			var htex := pkg.load_texture("ship/drones/drone_hack_base.png") if (pkg != null and pkg.is_loaded) else null
			if htex != null:
				draw_texture_rect(htex, Rect2(pod_p - Vector2(14, 14), Vector2(28, 28)), false)
			else:
				draw_circle(pod_p, 7.0, Color("c85aff"))
				draw_circle(pod_p, 3.5, Color.WHITE)

	# 6. Doors & airlocks
	for d in ship.doors:
		_draw_door(d, ship.get_effective_system_power("doors"))

	# 7. Crew sprites (respects Sensor Fog-of-War, Boarder room vision, and Slug Telepathy!)
	for c in ship.crew:
		if float(c.hp) <= 0.0:
			continue
		var c_vis := show_interior or bool(c.is_player)
		if not c_vis and not is_player_side:
			for bc in ship.crew:
				if bool(bc.is_player) and float(bc.hp) > 0.0 and int(bc.room_id) == int(c.room_id):
					c_vis = true
					break
		if c_vis:
			_draw_crew_member(c)
		elif has_slug and not is_player_side:
			# Authentic Slug Telepathy: purple silhouette pulse even in Nebula / Lv1 Sensors!
			draw_circle(c.pos as Vector2, 9.0, Color(0.85, 0.42, 1.0, 0.65))
			draw_arc(c.pos as Vector2, 11.0 + sin(anim_clock * 6.0) * 1.5, 0, TAU, 16, Color("e070ff"), 1.8)

	# 8. Cloak shimmer
	if ship.cloak_timer > 0.0:
		var cloak_tex := _load_ship_tex(ship.img_name, "cloak")
		if cloak_tex != null:
			draw_texture_rect(cloak_tex, img_rect, false, Color(0.65, 0.9, 1.0, 0.55))

	# 9. Orbiting drones (real original FTL drone PNG sprites!)
	for d in ship.drones:
		if bool(d.powered):
			var ang := float(d.angle)
			var orbit_r := maxf(bounds.size.x, bounds.size.y) * 0.62
			var dp := bounds.get_center() + Vector2(cos(ang) * orbit_r, sin(ang) * orbit_r * 0.72)
			var dtex: Texture2D = null
			if pkg != null and pkg.is_loaded:
				var dimg := str(d.bp.get("droneImage", ""))
				if not dimg.is_empty():
					dtex = pkg.load_texture("ship/drones/%s_base.png" % dimg)
				if dtex == null:
					var dtype := str(d.bp.get("type", "COMBAT"))
					var fallback_img := "drone_defense_base.png" if dtype == "DEFENSE" else ("drone_shield_base.png" if dtype == "SHIELD" else ("drone_shiprepair_base.png" if dtype == "SHIP_REPAIR" else "drone_combat_base.png"))
					dtex = pkg.load_texture("ship/drones/%s" % fallback_img)
			if dtex != null:
				draw_texture_rect(dtex, Rect2(dp - Vector2(18, 18), Vector2(36, 36)), false)
			else:
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
	var state_suffix := "green1"
	var col := Color(0.92, 0.96, 1.0, 0.95)
	if int(sys.ion_level) > 0:
		state_suffix = "blue1"
		col = Color("4ce0ff")
	elif int(sys.damage) >= int(sys.level):
		state_suffix = "red1"
		col = Color("ff4444")
	elif int(sys.damage) > 0:
		state_suffix = "orange1"
		col = Color("ffaa33")
	elif int(sys.power) <= 0 and not (sname in FTLShip.SUBSYSTEMS):
		state_suffix = "grey1"
		col = Color(0.65, 0.7, 0.74, 0.85)

	var icon_tex: Texture2D = null
	if pkg != null and pkg.is_loaded:
		icon_tex = pkg.load_texture("icons/s_%s_%s.png" % [sname, state_suffix])
		if icon_tex == null:
			icon_tex = pkg.load_texture("icons/s_%s_overlay.png" % sname)
	if icon_tex == null:
		icon_tex = FTLStandaloneAssets.get_texture("icons/s_%s_%s.png" % [sname, state_suffix])
	var center := rr.get_center()
	if icon_tex != null:
		var sz := Vector2(30, 30)
		draw_texture_rect(icon_tex, Rect2(center - sz * 0.5, sz), false, Color.WHITE)
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
		# Show Blast Door HP bar if intruder is breaking this door down
		var dhp := float(d.get("hp", 100.0))
		if dhp > 0.0 and dhp < 99.0 and not bool(d.airlock):
			var dbr := Rect2(center + Vector2(-10, -14), Vector2(20, 3))
			draw_rect(dbr, Color(0.08, 0.08, 0.1, 0.9), true)
			draw_rect(Rect2(dbr.position, Vector2(dbr.size.x * clampf(dhp / 100.0, 0.0, 1.0), dbr.size.y)), Color("ffaa33"), true)


func _draw_crew_member(c: Dictionary) -> void:
	var pos: Vector2 = c.pos
	if float(c.get("mind_timer", 0.0)) > 0.0:
		var mc_tex := pkg.load_texture("people/mindcontrol_strip8.png") if (pkg != null and pkg.is_loaded) else null
		if mc_tex != null:
			var fw := float(mc_tex.get_width()) / 8.0
			var fh := float(mc_tex.get_height())
			var fr := int(anim_clock * 10.0) % 8
			draw_texture_rect_region(mc_tex, Rect2(pos + Vector2(-14, -28), Vector2(28, 22)), Rect2(float(fr) * fw, 0.0, fw, fh))
		else:
			var pulse_r := 16.0 + sin(anim_clock * 9.0) * 2.0
			draw_circle(pos, pulse_r, Color(0.82, 0.28, 1.0, 0.3))
			draw_arc(pos, pulse_r, 0, TAU, 20, Color("e070ff"), 2.2)
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
			var st := str(c.get("state", "idle"))
			var fvec: Vector2 = c.get("facing", Vector2.DOWN)
			# Authentic FTL crew spritesheet rows: 0=Down, 1=Right, 2=Up, 3=Left, 4=Repair/Fire, 5=Fight
			var row := 0
			var frame := 0
			if st == "walk":
				if absf(fvec.x) > absf(fvec.y):
					row = 1 if fvec.x >= 0.0 else 3
				else:
					row = 0 if fvec.y >= 0.0 else 2
				frame = int(float(c.anim_t) * 8.0) % 4
			elif st == "repair" or st == "fire":
				row = 4
				frame = int(float(c.anim_t) * 6.0) % 4
			elif st == "fight" or st == "sabotage":
				row = 5
				frame = int(float(c.anim_t) * 7.0) % 4
			var max_rows := maxi(1, int(tex.get_height() / fh))
			var sy := float(mini(row, max_rows - 1)) * fh
			var sx := fmod(float(frame) * fw, maxf(fw, tex.get_width()))
			var src := Rect2(sx, sy, minf(fw, tex.get_width()), minf(fh, tex.get_height()))
			var tint := Color.WHITE if bool(c.is_player) else Color(1.0, 0.55, 0.55)
			draw_texture_rect_region(tex, Rect2(pos - Vector2(16, 16), Vector2(32, 32)), src, tint)
			drew = true
	if not drew:
		var col: Color = c.color if bool(c.is_player) else Color("ff5c5c")
		draw_circle(pos, 10.0, col)
	# Crew HP bar right above head
	var hp_ratio := clampf(float(c.hp) / maxf(1.0, float(c.max_hp)), 0.0, 1.0)
	if hp_ratio < 0.995 or bool(c.selected) or not bool(c.is_player):
		var hbr := Rect2(pos + Vector2(-12, -19), Vector2(24, 3.5))
		draw_rect(hbr, Color(0.08, 0.1, 0.12, 0.9), true)
		var hcol := Color("e070ff") if float(c.get("mind_timer", 0.0)) > 0.0 else (Color("65ff88") if bool(c.is_player) else Color("ff5c5c"))
		draw_rect(Rect2(hbr.position, Vector2(hbr.size.x * hp_ratio, hbr.size.y)), hcol, true)
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
	var font := ThemeDB.fallback_font
	for i in range(player_ship.weapons.size()):
		var w: Dictionary = player_ship.weapons[i]
		if not bool(w.powered) or int(w.target_room) < 0:
			continue
		var col := Color("ff4444") if not bool(w.autofire) else Color("ffbb33")
		var b_rooms: Array = w.get("beam_rooms", [])
		if str(w.bp.get("type", "")) == "BEAM" and not b_rooms.is_empty():
			for rid in b_rooms:
				if enemy_ship.room_by_id.has(int(rid)):
					var rrect := enemy_ship.get_room_rect_local(enemy_ship.room_by_id[int(rid)])
					var wrect := Rect2(ship_local_to_world(enemy_ship, rrect.position), rrect.size * _enemy_scale)
					draw_rect(wrect, Color(1.0, 0.3, 0.15, 0.22), true)
			var ws := ship_local_to_world(enemy_ship, w.beam_start)
			var we := ship_local_to_world(enemy_ship, w.beam_end)
			draw_line(ws, we, col, 3.0)
			draw_circle(ws, 5.0, col)
			draw_circle(we, 5.0, col)
			if font != null:
				draw_string(font, we + Vector2(8, -6), "%d (%dR)" % [i + 1, b_rooms.size()], HORIZONTAL_ALIGNMENT_LEFT, -1, 12, col)
			continue
		var tgt := ship_local_to_world(enemy_ship, enemy_ship.get_room_center_local(int(w.target_room)))
		var w_rad := float(w.bp.get("radius", 0.0))
		if str(w.bp.get("type", "")) == "BURST" or w_rad > 0.0:
			var disp_r := maxf(24.0, w_rad) * _enemy_scale
			draw_circle(tgt, disp_r, Color(1.0, 0.58, 0.18, 0.14))
			draw_arc(tgt, disp_r, 0, TAU, 32, Color("ff9e42"), 2.2)
		else:
			draw_arc(tgt, 17.0, 0, TAU, 24, col, 2.2)
			draw_line(tgt + Vector2(-22, 0), tgt + Vector2(-11, 0), col, 2.0)
			draw_line(tgt + Vector2(11, 0), tgt + Vector2(22, 0), col, 2.0)
			draw_line(tgt + Vector2(0, -22), tgt + Vector2(0, -11), col, 2.0)
			draw_line(tgt + Vector2(0, 11), tgt + Vector2(0, 22), col, 2.0)
		if font != null:
			draw_string(font, tgt + Vector2(14, -12), str(i + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, col)

	# Active Beam drag-line preview
	if beam_drag_active:
		for rid in beam_drag_rooms:
			if enemy_ship.room_by_id.has(int(rid)):
				var rrect := enemy_ship.get_room_rect_local(enemy_ship.room_by_id[int(rid)])
				var wrect := Rect2(ship_local_to_world(enemy_ship, rrect.position), rrect.size * _enemy_scale)
				draw_rect(wrect, Color(1.0, 0.65, 0.15, 0.34), true)
				draw_rect(wrect, Color("ffd54f"), false, 2.0)
		var ds := ship_local_to_world(enemy_ship, beam_drag_start)
		var de := ship_local_to_world(enemy_ship, beam_drag_end)
		draw_line(ds, de, Color("ffd54f"), 4.0)
		draw_circle(ds, 6.0, Color("7eff8b"))
		draw_circle(de, 6.0, Color("ff5c5c"))
		if font != null:
			draw_string(font, de + Vector2(10, -8), "BEAM: %d ROOMS" % beam_drag_rooms.size(), HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("ffd54f"))

	# Special targeting cursor (Teleporter / Hacking / Mind Control)
	if not special_target_mode.is_empty():
		var elocal := world_to_ship_local(enemy_ship, hover_pos)
		var eroom := enemy_ship.find_room_at_local(elocal)
		if eroom >= 0:
			var c := ship_local_to_world(enemy_ship, enemy_ship.get_room_center_local(eroom))
			var scol := Color("5ce1ff") if special_target_mode == "tp_send" else (Color("7eff8b") if special_target_mode == "tp_back" else Color("e070ff"))
			draw_arc(c, 22.0 + sin(anim_clock * 10.0) * 2.5, 0, TAU, 24, scol, 2.6)
			if font != null:
				draw_string(font, c + Vector2(-34, -26), special_target_mode.to_upper(), HORIZONTAL_ALIGNMENT_CENTER, 72, 12, scol)
	elif targeting_weapon_idx >= 0 and not beam_drag_active:
		var elocal := world_to_ship_local(enemy_ship, hover_pos)
		var eroom := enemy_ship.find_room_at_local(elocal)
		if eroom >= 0:
			var c := ship_local_to_world(enemy_ship, enemy_ship.get_room_center_local(eroom))
			var tw: Dictionary = player_ship.weapons[targeting_weapon_idx] if targeting_weapon_idx < player_ship.weapons.size() else {}
			var t_rad := float(tw.get("bp", {}).get("radius", 0.0))
			if str(tw.get("bp", {}).get("type", "")) == "BURST" or t_rad > 0.0:
				var dr := maxf(24.0, t_rad) * _enemy_scale
				draw_circle(c, dr, Color(1.0, 0.62, 0.2, 0.16))
				draw_arc(c, dr, 0, TAU, 32, Color("ffd54f"), 2.4)
				if font != null:
					draw_string(font, c + Vector2(-42, -dr - 8), "FLAK SCATTER", HORIZONTAL_ALIGNMENT_CENTER, 88, 12, Color("ffd54f"))
			else:
				draw_arc(c, 22.0 + sin(anim_clock * 10.0) * 2.5, 0, TAU, 24, Color("7eff8b"), 2.4)
				if _is_targeting_beam() and font != null:
					draw_string(font, c + Vector2(-46, -26), "DRAG BEAM LINE", HORIZONTAL_ALIGNMENT_CENTER, 96, 12, Color("ffd54f"))


func _draw_combat_fx() -> void:
	# Sweeping Beams (origin -> linearly moving contact point from sweep_start to sweep_end)
	for b in beams:
		var max_l := maxf(0.01, float(b.max_life))
		var u := clampf(1.0 - float(b.life) / max_l, 0.0, 1.0)
		var a := clampf(float(b.life) / max_l * 1.4, 0.0, 1.0)
		var col: Color = b.color
		var contact: Vector2 = (b.sweep_start_world as Vector2).lerp(b.sweep_end_world as Vector2, u)
		draw_line(b.origin_world, contact, Color(col.r, col.g, col.b, a * 0.45), 11.0)
		draw_line(b.origin_world, contact, Color(1.0, 0.94, 0.85, a), 3.5)
		draw_line(b.sweep_start_world, contact, Color(1.0, 0.55, 0.15, a * 0.8), 4.0)
		draw_circle(contact, 10.0 * a, Color(1.0, 0.88, 0.55, a))

	# Teleporter beam columns
	for tp in teleport_fx:
		var a := clampf(float(tp.life) / maxf(0.01, float(tp.max_life)), 0.0, 1.0)
		var p: Vector2 = tp.pos
		var col := Color(0.35, 0.95, 1.0, a * 0.55) if bool(tp.incoming) else Color(0.55, 1.0, 0.8, a * 0.55)
		draw_rect(Rect2(p + Vector2(-18, -52), Vector2(36, 76)), col, true)
		draw_rect(Rect2(p + Vector2(-8, -58), Vector2(16, 86)), Color(0.9, 1.0, 1.0, a * 0.85), true)

	# Projectiles (rotated real FTL missile/flak/crystal/laser sprites + glowing core!)
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
			draw_circle(p.pos, 10.0, Color(0.25, 0.82, 1.0, 0.42))
			draw_circle(p.pos, 5.5, Color(0.88, 0.98, 1.0, 1.0))
		elif wtype == "MISSILES":
			var mtex := pkg.load_texture("weapons/missile_1.png") if (pkg != null and pkg.is_loaded) else null
			if mtex != null:
				draw_set_transform(p.pos as Vector2, dir.angle(), Vector2.ONE)
				draw_texture_rect(mtex, Rect2(Vector2(-16, -8), Vector2(32, 16)), false)
				draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			else:
				var tip: Vector2 = p.pos + dir * 11.0
				var tail: Vector2 = p.pos - dir * 10.0
				draw_line(tail, tip, Color("ffcf5c"), 4.5)
				draw_circle(tail, 4.0, Color(1.0, 0.45, 0.1, 0.85))
		elif wtype == "BURST":
			var ftex := pkg.load_texture("weapons/crystal_shot1.png") if (pkg != null and pkg.is_loaded) else null
			if ftex != null:
				draw_set_transform(p.pos as Vector2, dir.angle() + anim_clock * 6.0, Vector2.ONE)
				draw_texture_rect(ftex, Rect2(Vector2(-9, -9), Vector2(18, 18)), false, Color("ffb86c"))
				draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			else:
				draw_circle(p.pos, 5.5, Color("ff9e42"))
		else:
			var col: Color = p.bp.get("color", Color(1.0, 0.25, 0.2))
			draw_line(p.pos - dir * 18.0, p.pos + dir * 12.0, Color(col.r, col.g, col.b, 0.45), 9.0)
			draw_line(p.pos - dir * 14.0, p.pos + dir * 11.0, Color(col.r, col.g, col.b, 0.85), 5.0)
			draw_line(p.pos - dir * 10.0, p.pos + dir * 9.0, Color(1.0, 0.95, 0.92, 1.0), 2.2)

	# Shield ripples
	for sh in shield_hits:
		var a := clampf(float(sh.life) / maxf(0.01, float(sh.max_life)), 0.0, 1.0)
		var r := 14.0 + (1.0 - a) * 32.0
		draw_arc(sh.pos, r, 0, TAU, 24, Color(0.45, 0.88, 1.0, a * 0.9), 3.0)

	# Explosions (real FTL animated explosion strips!)
	for ex in explosions:
		var max_l := maxf(0.01, float(ex.max_life))
		var u := clampf(1.0 - float(ex.life) / max_l, 0.0, 1.0)
		var is_big := float(ex.radius) >= 30.0
		var ex_tex := pkg.load_texture("effects/explosion_big1_strip10.png" if is_big else "effects/explosion_small1_strip9.png") if (pkg != null and pkg.is_loaded) else null
		if ex_tex != null:
			var frames := 10 if is_big else 9
			var fw := float(ex_tex.get_width()) / float(frames)
			var fh := float(ex_tex.get_height())
			var fr := clampi(int(u * float(frames)), 0, frames - 1)
			var sz := Vector2(72.0, 72.0) if is_big else Vector2(46.0, 46.0)
			draw_texture_rect_region(ex_tex, Rect2((ex.pos as Vector2) - sz * 0.5, sz), Rect2(float(fr) * fw, 0.0, fw, fh))
		else:
			var a := clampf(float(ex.life) / max_l, 0.0, 1.0)
			var r := float(ex.radius) * (0.4 + u * 0.9)
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


func _draw_procedural_hull(ship: FTLShip, bounds: Rect2, tint: Color) -> void:
	var style := str(ship.layout.get("hull_style", "kestrel"))
	var base_col := Color("4c5b6e")
	var accent_col := Color("c84638")
	var trim_col := Color("8ea4bc")
	match style:
		"engi": base_col = Color("425e68"); accent_col = Color("46b8a0"); trim_col = Color("86d4c8")
		"fed": base_col = Color("5a6270"); accent_col = Color("d89b38"); trim_col = Color("b2c0d2")
		"zoltan": base_col = Color("526438"); accent_col = Color("78e05a"); trim_col = Color("b4dc88")
		"mantis": base_col = Color("5c3234"); accent_col = Color("d6453a"); trim_col = Color("e08a72")
		"stealth": base_col = Color("28303d"); accent_col = Color("5294d8"); trim_col = Color("6b829e")
		"lanius": base_col = Color("444a56"); accent_col = Color("72c8e8"); trim_col = Color("96a8be")
		"boss": base_col = Color("4d2f2b"); accent_col = Color("e85038"); trim_col = Color("f0a064")
		"rebel", "auto": base_col = Color("4e4338"); accent_col = Color("e07b38"); trim_col = Color("b49a7e")

	var b := bounds.grow(24.0)
	var cy := b.get_center().y
	var nose_x := b.end.x + 36.0
	var tail_x := b.position.x - 16.0
	# Main armored hull polygon (tapered prow + engine wings)
	var poly := PackedVector2Array([
		Vector2(tail_x, b.position.y + 18.0),
		Vector2(b.position.x + b.size.x * 0.35, b.position.y - 16.0),
		Vector2(b.end.x - 18.0, b.position.y + 6.0),
		Vector2(nose_x, cy - 14.0),
		Vector2(nose_x, cy + 14.0),
		Vector2(b.end.x - 18.0, b.end.y - 6.0),
		Vector2(b.position.x + b.size.x * 0.35, b.end.y + 16.0),
		Vector2(tail_x, b.end.y - 18.0),
	])
	draw_colored_polygon(poly, base_col * tint)
	draw_polyline(poly + PackedVector2Array([poly[0]]), trim_col * tint, 2.5)
	# Faction racing stripes & cockpit canopy
	draw_rect(Rect2(Vector2(b.position.x + 12.0, b.position.y - 6.0), Vector2(b.size.x * 0.55, 8.0)), accent_col * tint, true)
	draw_rect(Rect2(Vector2(b.position.x + 12.0, b.end.y - 2.0), Vector2(b.size.x * 0.55, 8.0)), accent_col * tint, true)
	draw_rect(Rect2(Vector2(b.end.x - 2.0, cy - 12.0), Vector2(22.0, 24.0)), Color(0.55, 0.85, 1.0, 0.72) * tint, true)
	# Aft engine nacelles
	draw_rect(Rect2(Vector2(tail_x - 10.0, b.position.y + 22.0), Vector2(16.0, 24.0)), Color("2c3644") * tint, true)
	draw_rect(Rect2(Vector2(tail_x - 10.0, b.end.y - 46.0), Vector2(16.0, 24.0)), Color("2c3644") * tint, true)


func _draw_ellipse_glow(center: Vector2, rx: float, ry: float, col: Color) -> void:
	var pts := PackedVector2Array()
	var segs := 44
	for i in range(segs + 1):
		var a := float(i) / float(segs) * TAU
		pts.append(center + Vector2(cos(a) * rx, sin(a) * ry))
	draw_colored_polygon(pts, col)
	draw_polyline(pts, Color(col.r, col.g, col.b, minf(0.9, col.a * 3.2)), 2.5)
