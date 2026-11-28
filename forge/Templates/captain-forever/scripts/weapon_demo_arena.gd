class_name WeaponDemoArena
extends Control

signal target_distance_dragged(new_distance_m: float)

## 코스모티어 무기 일람표 실시간 GPU 셰이더 사격 시연장.
## 복원된 Cosmoteer 스프라이트(단면/포탑/투사체/폭발/소행성) + GPU 셰이더 5종(방어막·이온빔·트랙터빔·화재·충격파)
## + 탄도/레일건 돌파/체인건 가속/유도 미사일/기뢰/PD·플랙 대공 요격을 실시간 시뮬레이션한다.

const SPACE := Color("#060e18")
const GRID := Color("#142b3d")
const AXIS := Color("#234963")
const MINT := Color("#70edc6")
const GOLD := Color("#ffd166")
const RED := Color("#ff7b72")
const CYAN := Color("#5ce1ff")
const TEXT := Color("#c9dde6")

var weapon_id := "cosmoteer.laser_blaster_small"
var weapon_name := "소형 레이저"
var demo_kind := "laser"
var params: Dictionary = {}
var playing := true
var target_shield_enabled := true
var target_moving := false
var sfx: CosmoteerSfx = null
var ui_font: Font = null

var elapsed := 0.0
var fire_timer := 0.0
var recoil_offset := 0.0
var chaingun_spin := 0.0
var muzzle_flash := 0.0
var target_hp := 12000.0
var target_max_hp := 12000.0
var target_shield_hp := 6000.0
var target_shield_max := 6000.0
var target_shield_flash := 0.0
var target_shield_reboot := 0.0
var target_fire := 0.0
var target_y_offset := 0.0
var target_pull_offset := 0.0
var turret_angle := 0.0
var out_of_range := false

var shots_fired := 0
var hits_landed := 0
var penetrations := 0
var intercepts := 0
var total_damage_dealt := 0.0
var damage_window: Array[Dictionary] = []

var projectiles: Array[Dictionary] = []
var incoming_missiles: Array[Dictionary] = []
var incoming_timer := 0.0
var bursts: Array[Dictionary] = []
var floaters: Array[Dictionary] = []
var beam_active := false
var beam_hit_pos := Vector2.ZERO
var beam_hit_kind := "miss"
var pd_beams: Array[Dictionary] = []

var _shield_rect: ColorRect = null
var _beam_rect: ColorRect = null
var _tractor_rect: ColorRect = null
var _fire_rect: ColorRect = null
var _shock_rect: ColorRect = null

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	clip_contents = true
	custom_minimum_size = Vector2(0, 180)
	CosmoteerAssets.ensure_loaded()
	_setup_shaders()

func _setup_shaders() -> void:
	_shield_rect = _make_shader_rect("res://assets/shaders/shield_arc.gdshader")
	_beam_rect = _make_shader_rect("res://assets/shaders/ion_beam.gdshader")
	_tractor_rect = _make_shader_rect("res://assets/shaders/tractor_beam.gdshader")
	_fire_rect = _make_shader_rect("res://assets/shaders/fire_effect.gdshader")
	_shock_rect = _make_shader_rect("res://assets/shaders/shockwave.gdshader")

func _make_shader_rect(path: String) -> ColorRect:
	var r := ColorRect.new()
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.color = Color.WHITE
	r.visible = false
	if ResourceLoader.exists(path):
		var sh: Shader = load(path) as Shader
		if sh != null:
			var mat := ShaderMaterial.new()
			mat.shader = sh
			r.material = mat
	add_child(r)
	return r

func configure(entry: Dictionary, tuned: Dictionary) -> void:
	weapon_id = str(entry.get("id", "cosmoteer.laser_blaster_small"))
	weapon_name = str(entry.get("name", weapon_id))
	demo_kind = str(entry.get("demo_kind", "laser"))
	params = tuned.duplicate(true)
	reset_demo()

func update_params(tuned: Dictionary) -> void:
	params = tuned.duplicate(true)
	queue_redraw()

func reset_demo() -> void:
	elapsed = 0.0
	fire_timer = 0.12
	recoil_offset = 0.0
	chaingun_spin = 0.0
	muzzle_flash = 0.0
	target_max_hp = 12000.0
	target_hp = target_max_hp
	target_shield_max = 6000.0
	target_shield_hp = target_shield_max if target_shield_enabled else 0.0
	target_shield_flash = 0.0
	target_shield_reboot = 0.0
	target_fire = 0.0
	target_y_offset = 0.0
	target_pull_offset = 0.0
	turret_angle = 0.0
	out_of_range = false
	shots_fired = 0
	hits_landed = 0
	penetrations = 0
	intercepts = 0
	total_damage_dealt = 0.0
	damage_window.clear()
	projectiles.clear()
	incoming_missiles.clear()
	incoming_timer = 0.25
	bursts.clear()
	floaters.clear()
	pd_beams.clear()
	beam_active = false
	_sync_shader_overlays()
	queue_redraw()

func fire_once() -> void:
	if demo_kind in ["ion", "resonance", "mining", "tractor"]:
		_tick_beam_weapon(0.25)
	elif demo_kind == "pd":
		_spawn_incoming_missile()
	else:
		_fire_projectile()
	queue_redraw()

func measured_dps() -> float:
	var sum := 0.0
	var cutoff := elapsed - 3.0
	for item in damage_window:
		if float(item.t) >= cutoff:
			sum += float(item.d)
	var span := clampf(elapsed, 0.5, 3.0)
	return sum / span

func _weapon_screen_pos() -> Vector2:
	return Vector2(clampf(size.x * 0.13, 52.0, 92.0), size.y * 0.55)

func _px_per_meter() -> float:
	var max_m := maxf(360.0, maxf(float(params.get("range", 250.0)), float(params.get("target_distance", 160.0))) * 1.10)
	return clampf((size.x - 130.0) / max_m, 0.52, 4.2)

func _target_screen_pos() -> Vector2:
	var dist_m := maxf(35.0, float(params.get("target_distance", 160.0)) - target_pull_offset)
	var wpos := _weapon_screen_pos()
	var x := clampf(wpos.x + dist_m * _px_per_meter(), wpos.x + 36.0, maxf(wpos.x + 40.0, size.x - 42.0))
	return Vector2(x, wpos.y + target_y_offset)

func _gui_input(event: InputEvent) -> void:
	if (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT) or (event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT)) or (event is InputEventScreenTouch and event.pressed) or (event is InputEventScreenDrag):
		var p_pos := Vector2.ZERO
		if event is InputEventMouse:
			p_pos = (event as InputEventMouse).position
		elif event is InputEventScreenTouch:
			p_pos = (event as InputEventScreenTouch).position
		elif event is InputEventScreenDrag:
			p_pos = (event as InputEventScreenDrag).position
		var wpos := _weapon_screen_pos()
		if p_pos.x > wpos.x + 28.0:
			var dist_m := clampf((p_pos.x - wpos.x) / maxf(0.1, _px_per_meter()), 35.0, 520.0)
			target_distance_dragged.emit(roundf(dist_m / 5.0) * 5.0)
			accept_event()

func step_demo(dt: float) -> void:
	if dt <= 0.0:
		return
	elapsed += dt
	recoil_offset = move_toward(recoil_offset, 0.0, dt * 36.0)
	muzzle_flash = maxf(0.0, muzzle_flash - dt * 6.5)
	target_shield_flash = maxf(0.0, target_shield_flash - dt * 3.2)
	if target_moving:
		target_y_offset = sin(elapsed * 1.65) * minf(58.0, size.y * 0.22)
	else:
		target_y_offset = move_toward(target_y_offset, 0.0, dt * 120.0)
	if demo_kind != "tractor":
		target_pull_offset = move_toward(target_pull_offset, 0.0, dt * 45.0)

	if target_shield_enabled and demo_kind != "mining":
		if target_shield_reboot > 0.0:
			target_shield_reboot = maxf(0.0, target_shield_reboot - dt)
			if target_shield_reboot <= 0.0:
				target_shield_hp = target_shield_max * 0.55
		elif target_shield_hp < target_shield_max:
			target_shield_hp = minf(target_shield_max, target_shield_hp + 520.0 * dt)
	else:
		target_shield_hp = 0.0

	if target_fire > 0.0:
		var fdmg := 160.0 * target_fire * dt
		_apply_hull_damage(fdmg, false)
		target_fire = maxf(0.0, target_fire - 0.09 * dt)

	if target_hp <= 0.0:
		_add_burst(_target_screen_pos(), 46.0, "meltdown")
		_add_floater(_target_screen_pos() + Vector2(0, -34), "표적 격파! 재생성", GOLD)
		target_hp = target_max_hp
		target_fire = 0.0
		target_pull_offset = 0.0
		if target_shield_enabled:
			target_shield_hp = target_shield_max
			target_shield_reboot = 0.0

	var wpos := _weapon_screen_pos()
	var tpos := _target_screen_pos()
	var dist_m := maxf(1.0, float(params.get("target_distance", 160.0)) - target_pull_offset)
	var max_range := float(params.get("range", 250.0))
	out_of_range = dist_m > max_range
	turret_angle = (tpos - wpos).angle()

	while not damage_window.is_empty() and float(damage_window[0].t) < elapsed - 3.2:
		damage_window.pop_front()

	beam_active = false
	if playing:
		if demo_kind in ["ion", "resonance", "mining", "tractor"]:
			_tick_beam_weapon(dt)
		else:
			if demo_kind in ["pd", "flak"]:
				incoming_timer -= dt
				if incoming_timer <= 0.0:
					_spawn_incoming_missile()
					incoming_timer = 0.85 if demo_kind == "pd" else 1.15
			if demo_kind == "pd":
				_tick_pd_intercept(dt)
			else:
				if demo_kind == "chaingun":
					if not out_of_range:
						chaingun_spin = minf(1.0, chaingun_spin + 0.45 * dt)
					else:
						chaingun_spin = maxf(0.0, chaingun_spin - 0.35 * dt)
				fire_timer -= dt
				if fire_timer <= 0.0:
					if not out_of_range:
						_fire_projectile()
					var base_int := maxf(0.06, float(params.get("fire_interval", 0.9)))
					if demo_kind == "chaingun":
						base_int = lerpf(base_int, maxf(0.06, base_int * 0.28), chaingun_spin)
					fire_timer = base_int
				if demo_kind == "flak":
					_tick_flak_intercept()

	_tick_projectiles(dt)
	_tick_incoming_missiles(dt)
	for i in range(pd_beams.size() - 1, -1, -1):
		pd_beams[i].ttl = float(pd_beams[i].ttl) - dt
		if float(pd_beams[i].ttl) <= 0.0:
			pd_beams.remove_at(i)
	for i in range(bursts.size() - 1, -1, -1):
		bursts[i].age = float(bursts[i].age) + dt
		if float(bursts[i].age) >= float(bursts[i].dur):
			bursts.remove_at(i)
	for i in range(floaters.size() - 1, -1, -1):
		floaters[i].age = float(floaters[i].age) + dt
		floaters[i].pos = Vector2(floaters[i].pos) + Vector2(0.0, -24.0 * dt)
		if float(floaters[i].age) >= 1.15:
			floaters.remove_at(i)
	_sync_shader_overlays()
	queue_redraw()

func _fire_projectile() -> void:
	var wpos := _weapon_screen_pos()
	var tpos := _target_screen_pos()
	var dir := (tpos - wpos).normalized()
	var speed_m := float(params.get("projectile_speed", 320.0))
	var is_homing := demo_kind in ["missile", "missile_emp", "missile_nuke"]
	var accel := CosmoteerWeaponData.missile_acceleration(demo_kind) if is_homing else 0.0
	var init_speed := speed_m * CosmoteerWeaponData.missile_launch_speed_factor() if (is_homing and accel > 0.0) else speed_m
	var launch_dir := dir.rotated(-0.38 if (shots_fired % 2 == 0) else 0.38) if is_homing else dir
	var muzzle := wpos + dir * 24.0
	projectiles.append({
		"pos": muzzle,
		"vel": launch_dir * init_speed,
		"speed": init_speed,
		"max_speed": speed_m,
		"accel": accel,
		"homing": is_homing,
		"travel_m": 0.0,
		"range_m": float(params.get("range", 250.0)),
		"kind": demo_kind,
		"damage": float(params.get("damage", 500.0)),
		"aoe": float(params.get("aoe_radius", 0.0)),
		"penetration": float(params.get("penetration", 0.0)),
		"shield_mult": float(params.get("shield_damage_mult", 1.0)),
		"ignite": float(params.get("ignite_intensity", 0.0)),
		"pierced": false,
	})
	shots_fired += 1
	muzzle_flash = 1.0
	recoil_offset = clampf(float(params.get("recoil", 12.0)) * 0.07, 1.5, 11.0)
	if sfx != null:
		sfx.play(CosmoteerSfx.sfx_for_weapon_kind(demo_kind))

func _tick_beam_weapon(dt: float) -> void:
	var tpos := _target_screen_pos()
	if out_of_range:
		beam_active = false
		return
	beam_active = true
	var shield_up := target_shield_enabled and target_shield_hp > 0.0 and demo_kind != "mining" and demo_kind != "tractor"
	var hit_x := tpos.x - (34.0 if shield_up else 18.0)
	beam_hit_pos = Vector2(hit_x, tpos.y)
	var dps := float(params.get("damage", 2000.0))
	if demo_kind == "tractor":
		beam_hit_kind = "tractor"
		var max_pull := maxf(0.0, float(params.get("target_distance", 160.0)) - 62.0)
		target_pull_offset = fmod(target_pull_offset + 28.0 * dt, maxf(10.0, max_pull + 18.0))
		if target_pull_offset > max_pull:
			target_pull_offset = 0.0
		return
	if shield_up:
		beam_hit_kind = "shield"
		_apply_shield_hit(dps * float(params.get("shield_damage_mult", 1.0)) * dt)
	else:
		beam_hit_kind = "hull"
		_apply_hull_damage(dps * dt, true)
		var ign := float(params.get("ignite_intensity", 0.0))
		if ign > 0.0 and demo_kind != "mining":
			target_fire = minf(1.0, target_fire + ign * dt * 0.45)
	if int(elapsed * 60.0) % 18 == 0:
		shots_fired += 1
		hits_landed += 1

func _spawn_incoming_missile() -> void:
	var tpos := _target_screen_pos()
	var y_off := sin(elapsed * 3.7 + float(incoming_missiles.size())) * 48.0
	incoming_missiles.append({
		"pos": Vector2(tpos.x, tpos.y + y_off),
		"speed": 95.0,
		"hp": 140.0,
	})

func _tick_pd_intercept(dt: float) -> void:
	fire_timer -= dt
	if fire_timer > 0.0 or incoming_missiles.is_empty():
		return
	var wpos := _weapon_screen_pos()
	var pd_range_px := float(params.get("range", 140.0)) * _px_per_meter()
	var best_idx := -1
	var best_d := pd_range_px
	for i in incoming_missiles.size():
		var d := wpos.distance_to(Vector2(incoming_missiles[i].pos))
		if d <= best_d:
			best_d = d
			best_idx = i
	if best_idx < 0:
		return
	var m: Dictionary = incoming_missiles[best_idx]
	turret_angle = (Vector2(m.pos) - wpos).angle()
	shots_fired += 1
	hits_landed += 1
	m.hp = float(m.hp) - float(params.get("damage", 140.0))
	pd_beams.append({"from": wpos + Vector2.from_angle(turret_angle) * 18.0, "to": Vector2(m.pos), "ttl": 0.16})
	fire_timer = maxf(0.06, float(params.get("fire_interval", 0.18)))
	if float(m.hp) <= 0.0:
		intercepts += 1
		_add_burst(Vector2(m.pos), 22.0, "he")
		_add_floater(Vector2(m.pos) + Vector2(0, -14), "미사일 요격!", MINT)
		incoming_missiles.remove_at(best_idx)
		if sfx != null:
			sfx.play("intercept")

func _tick_flak_intercept() -> void:
	var wpos := _weapon_screen_pos()
	var f_range := minf(float(params.get("range", 220.0)), 140.0) * _px_per_meter()
	for i in range(incoming_missiles.size() - 1, -1, -1):
		var m: Dictionary = incoming_missiles[i]
		if wpos.distance_to(Vector2(m.pos)) <= f_range * 0.72:
			intercepts += 1
			pd_beams.append({"from": wpos + Vector2(20, 0), "to": Vector2(m.pos), "ttl": 0.14})
			_add_burst(Vector2(m.pos), 24.0, "he")
			_add_floater(Vector2(m.pos) + Vector2(0, -14), "플랙 요격!", GOLD)
			incoming_missiles.remove_at(i)
			break

func _tick_incoming_missiles(dt: float) -> void:
	var wpos := _weapon_screen_pos()
	var ppm := _px_per_meter()
	for i in range(incoming_missiles.size() - 1, -1, -1):
		var m: Dictionary = incoming_missiles[i]
		var to_w := wpos - Vector2(m.pos)
		if to_w.length() < 24.0:
			incoming_missiles.remove_at(i)
			continue
		m.pos = Vector2(m.pos) + to_w.normalized() * float(m.speed) * ppm * dt

func _tick_projectiles(dt: float) -> void:
	var tpos := _target_screen_pos()
	var ppm := _px_per_meter()
	var shield_up := target_shield_enabled and target_shield_hp > 0.0 and demo_kind != "mining"
	for i in range(projectiles.size() - 1, -1, -1):
		var p: Dictionary = projectiles[i]
		if bool(p.homing):
			var acc := float(p.accel)
			if acc > 0.0:
				p.speed = minf(float(p.max_speed), float(p.speed) + acc * dt)
			var cur_dir := Vector2(p.vel).normalized()
			var des_dir := (tpos - Vector2(p.pos)).normalized()
			var ang := cur_dir.angle()
			var step_ang := clampf(wrapf(des_dir.angle() - ang, -PI, PI), -3.2 * dt, 3.2 * dt)
			p.vel = Vector2.from_angle(ang + step_ang) * float(p.speed)
		var step_m := float(p.speed) * dt
		p.pos = Vector2(p.pos) + Vector2(p.vel).normalized() * step_m * ppm
		p.travel_m = float(p.travel_m) + step_m
		if float(p.travel_m) > float(p.range_m):
			projectiles.remove_at(i)
			continue
		var hit_r := 36.0 if shield_up else 26.0
		if Vector2(p.pos).distance_to(tpos) <= hit_r and not bool(p.pierced):
			hits_landed += 1
			var dmg := float(p.damage)
			var aoe := float(p.aoe)
			var bkind := str(p.kind)
			if shield_up:
				var sdmg := dmg * float(p.shield_mult)
				_apply_shield_hit(sdmg)
				_add_floater(Vector2(p.pos) + Vector2(0, -16), "방어막 -%d" % roundi(sdmg), CYAN)
				if bkind == "missile_emp":
					_add_burst(Vector2(p.pos), maxf(34.0, aoe * 5.0), "emp")
				elif aoe > 0.1:
					_add_burst(Vector2(p.pos), maxf(26.0, aoe * 4.5), "nuke" if bkind == "missile_nuke" else "he")
				projectiles.remove_at(i)
				continue
			_apply_hull_damage(dmg, true)
			_add_floater(Vector2(p.pos) + Vector2(0, -16), "-%d" % roundi(dmg), GOLD)
			var ign := float(p.ignite)
			if ign > 0.0:
				target_fire = clampf(target_fire + ign * 0.45, 0.0, 1.0)
			if aoe > 0.1:
				var bk := "emp" if bkind == "missile_emp" else ("nuke" if bkind == "missile_nuke" else "he")
				_add_burst(Vector2(p.pos), maxf(26.0, aoe * 5.2), bk)
				if sfx != null:
					sfx.play("destroyed" if bk == "nuke" else "shield_hit")
			else:
				_add_burst(Vector2(p.pos), 14.0, "spark")
			var pen := float(p.penetration)
			if pen > 7.0:
				p.pierced = true
				penetrations += 1
				_add_floater(Vector2(p.pos) + Vector2(18, -32), "장갑 돌파! (%.0f)" % pen, MINT)
				p.range_m = float(p.travel_m) + 42.0
			else:
				projectiles.remove_at(i)

func _apply_shield_hit(dmg: float) -> void:
	target_shield_hp = maxf(0.0, target_shield_hp - dmg)
	target_shield_flash = 1.0
	total_damage_dealt += dmg
	damage_window.append({"t": elapsed, "d": dmg})
	if target_shield_hp <= 0.0:
		target_shield_reboot = 2.6
		_add_floater(_target_screen_pos() + Vector2(0, -34), "방어막 붕괴!", RED)
		if sfx != null:
			sfx.play("shield_down")

func _apply_hull_damage(dmg: float, record_dps: bool) -> void:
	target_hp = maxf(0.0, target_hp - dmg)
	if record_dps:
		total_damage_dealt += dmg
		damage_window.append({"t": elapsed, "d": dmg})

func _add_burst(pos: Vector2, radius: float, kind: String) -> void:
	bursts.append({
		"pos": pos, "radius": radius, "kind": kind,
		"age": 0.0, "dur": 0.85 if kind in ["nuke", "meltdown", "emp"] else 0.42,
	})

func _add_floater(pos: Vector2, text: String, col: Color) -> void:
	floaters.append({"pos": pos, "text": text, "color": col, "age": 0.0})
	if floaters.size() > 12:
		floaters.pop_front()

func _sync_shader_overlays() -> void:
	var tpos := _target_screen_pos()
	var wpos := _weapon_screen_pos()
	if _shield_rect != null:
		var show_sh := target_shield_enabled and target_shield_hp > 0.0 and demo_kind != "mining"
		_shield_rect.visible = show_sh
		if show_sh:
			var r := 44.0
			_shield_rect.position = tpos - Vector2(r, r)
			_shield_rect.size = Vector2(r * 2.0, r * 2.0)
			var mat: ShaderMaterial = _shield_rect.material as ShaderMaterial
			if mat != null:
				mat.set_shader_parameter("full_power_color1", Color("#5ce1ff"))
				mat.set_shader_parameter("full_power_color2", Color("#e3fbff"))
				mat.set_shader_parameter("power_level", clampf(target_shield_hp / maxf(1.0, target_shield_max), 0.0, 1.0))
				mat.set_shader_parameter("facing_angle", PI)
				mat.set_shader_parameter("half_arc_rad", deg_to_rad(85.0))
				mat.set_shader_parameter("hit_flash", target_shield_flash)
				mat.set_shader_parameter("disrupted", 1.0 if demo_kind in ["disruptor", "missile_emp"] and target_shield_flash > 0.1 else 0.0)

	if _beam_rect != null and _tractor_rect != null:
		var show_ion := beam_active and demo_kind in ["ion", "resonance", "mining"]
		var show_trac := beam_active and demo_kind == "tractor"
		_beam_rect.visible = show_ion
		_tractor_rect.visible = show_trac
		if show_ion or show_trac:
			var from_pt := wpos + Vector2.from_angle(turret_angle) * 24.0
			var delta := beam_hit_pos - from_pt
			var dist := maxf(4.0, delta.length())
			var rect := _tractor_rect if show_trac else _beam_rect
			var thick := 24.0 if show_trac else 26.0
			rect.size = Vector2(dist, thick)
			rect.pivot_offset = Vector2(0.0, thick * 0.5)
			rect.position = from_pt - rect.pivot_offset
			rect.rotation = delta.angle()
			var mat: ShaderMaterial = rect.material as ShaderMaterial
			if mat != null:
				mat.set_shader_parameter("beam_length", maxf(10.0, dist * 0.6))
				if show_ion:
					mat.set_shader_parameter("intensity", clampf(float(params.get("damage", 2400.0)) / 2200.0, 0.5, 2.5))
					if demo_kind == "resonance":
						mat.set_shader_parameter("base_color", Color("#ff7c24"))
						mat.set_shader_parameter("highlight_color", Color("#fff5c0"))
					elif demo_kind == "mining":
						mat.set_shader_parameter("base_color", Color("#ffd53d"))
						mat.set_shader_parameter("highlight_color", Color("#fffbe0"))
					else:
						mat.set_shader_parameter("base_color", Color("#ff2e84"))
						mat.set_shader_parameter("highlight_color", Color("#ffe3f5"))

	if _fire_rect != null:
		var show_fire := target_fire > 0.05
		_fire_rect.visible = show_fire
		if show_fire:
			var fr := 28.0 + 18.0 * target_fire
			_fire_rect.position = tpos - Vector2(fr, fr)
			_fire_rect.size = Vector2(fr * 2.0, fr * 2.0)
			var mat: ShaderMaterial = _fire_rect.material as ShaderMaterial
			if mat != null:
				mat.set_shader_parameter("fire_size", target_fire)

	if _shock_rect != null:
		var latest := {}
		for b in bursts:
			if str(b.kind) in ["he", "emp", "nuke", "meltdown"]:
				latest = b
		if latest.is_empty():
			_shock_rect.visible = false
		else:
			var t := clampf(float(latest.age) / maxf(0.1, float(latest.dur)), 0.0, 1.0)
			var sr := float(latest.radius) * (0.45 + 1.15 * t)
			_shock_rect.position = Vector2(latest.pos) - Vector2(sr, sr)
			_shock_rect.size = Vector2(sr * 2.0, sr * 2.0)
			var mat: ShaderMaterial = _shock_rect.material as ShaderMaterial
			if mat != null:
				var bk := str(latest.kind)
				var mode_i := 1 if bk == "emp" else (2 if bk == "nuke" else (3 if bk == "meltdown" else 0))
				var col := Color("#b580ff") if bk == "emp" else (Color("#ffae42") if bk == "nuke" else (Color("#6bffcc") if bk == "meltdown" else Color("#ffd166")))
				mat.set_shader_parameter("blast_mode", mode_i)
				mat.set_shader_parameter("ring_color", col)
				mat.set_shader_parameter("progress", t)
			_shock_rect.visible = true

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), SPACE, true)
	if size.x < 10.0 or size.y < 10.0:
		return
	var font: Font = ui_font if ui_font != null else ThemeDB.fallback_font
	var wpos := _weapon_screen_pos()
	var tpos := _target_screen_pos()
	var ppm := _px_per_meter()

	var step_px := maxf(24.0, 40.0 * ppm)
	var gx := wpos.x
	var m_val := 0
	while gx < size.x - 8.0:
		var col := AXIS if m_val == 0 else GRID
		draw_line(Vector2(gx, 0.0), Vector2(gx, size.y), col, 1.0)
		if m_val > 0 and m_val % 80 == 0 and font != null:
			draw_string(font, Vector2(gx + 4.0, size.y - 10.0), "%dm" % m_val, HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color(TEXT, 0.72))
		gx += step_px
		m_val += 40
	for gy_off: float in [-80.0, -40.0, 0.0, 40.0, 80.0]:
		var y := wpos.y + gy_off
		if y > 4.0 and y < size.y - 4.0:
			draw_line(Vector2(0.0, y), Vector2(size.x, y), AXIS if absf(gy_off) < 1.0 else GRID, 1.0)

	var range_px := float(params.get("range", 250.0)) * ppm
	var half_arc := deg_to_rad(minf(140.0, float(params.get("firing_arc_deg", 120.0)))) * 0.5
	draw_arc(wpos, range_px, -half_arc, half_arc, 40, Color(MINT if not out_of_range else RED, 0.42), 1.6, true)
	draw_line(wpos, wpos + Vector2.from_angle(-half_arc) * minf(range_px, size.x), Color(MINT, 0.16), 1.0, true)
	draw_line(wpos, wpos + Vector2.from_angle(half_arc) * minf(range_px, size.x), Color(MINT, 0.16), 1.0, true)

	var draw_wpos := wpos - Vector2.from_angle(turret_angle) * recoil_offset
	draw_rect(Rect2(wpos - Vector2(28, 28), Vector2(56, 56)), Color("#152836"), true)
	draw_rect(Rect2(wpos - Vector2(28, 28), Vector2(56, 56)), Color("#34586e"), false, 1.5)
	var wtex: Texture2D = CosmoteerAssets.get_part_texture(weapon_id, "cutaway")
	if wtex != null:
		draw_set_transform(draw_wpos, PI * 0.5, Vector2.ONE)
		draw_texture_rect(wtex, Rect2(-26, -26, 52, 52), false, Color.WHITE)
		draw_set_transform(Vector2.ZERO)
	var ttex: Texture2D = CosmoteerAssets.get_turret_texture(weapon_id)
	if ttex != null:
		draw_set_transform(draw_wpos, turret_angle + PI * 0.5, Vector2.ONE)
		draw_texture_rect(ttex, Rect2(-26, -26, 52, 52), false, Color.WHITE)
		draw_set_transform(Vector2.ZERO)
	if muzzle_flash > 0.05:
		var mpt := draw_wpos + Vector2.from_angle(turret_angle) * 26.0
		var mtex: Texture2D = CosmoteerAssets.get_sprite_texture("spark")
		if mtex != null:
			var ms := 18.0 * muzzle_flash
			draw_texture_rect(mtex, Rect2(mpt - Vector2(ms, ms), Vector2(ms * 2.0, ms * 2.0)), false, Color(1.0, 0.95, 0.72, muzzle_flash))
		else:
			draw_circle(mpt, 8.0 * muzzle_flash, Color(GOLD, muzzle_flash))

	if demo_kind == "mining":
		var atex: Texture2D = CosmoteerAssets.get_sprite_texture("ast_gold")
		if atex != null:
			draw_texture_rect(atex, Rect2(tpos - Vector2(30, 30), Vector2(60, 60)), false, Color.WHITE)
		else:
			draw_circle(tpos, 26.0, Color("#8b7c54"))
	else:
		var arm_tex: Texture2D = CosmoteerAssets.get_part_texture("cosmoteer.armor", "cutaway")
		var rct_tex: Texture2D = CosmoteerAssets.get_part_texture("cosmoteer.reactor_small", "cutaway")
		for dy: float in [-18.0, 0.0, 18.0]:
			var ar := Rect2(tpos + Vector2(-24.0, dy - 9.0), Vector2(18.0, 18.0))
			if arm_tex != null:
				draw_texture_rect(arm_tex, ar, false, Color.WHITE)
			else:
				draw_rect(ar, Color("#6e808d"), true)
		var core_r := Rect2(tpos + Vector2(-6.0, -18.0), Vector2(36.0, 36.0))
		if rct_tex != null:
			draw_texture_rect(rct_tex, core_r, false, Color.WHITE)
		else:
			draw_rect(core_r, Color("#53c99c"), true)

	var hp_ratio := clampf(target_hp / maxf(1.0, target_max_hp), 0.0, 1.0)
	draw_rect(Rect2(tpos + Vector2(-26, 30), Vector2(52, 5)), Color("#1d2b36"), true)
	draw_rect(Rect2(tpos + Vector2(-26, 30), Vector2(52.0 * hp_ratio, 5)), Color("#ff8f70") if hp_ratio < 0.4 else MINT, true)
	if target_shield_enabled and demo_kind != "mining":
		var sh_ratio := clampf(target_shield_hp / maxf(1.0, target_shield_max), 0.0, 1.0)
		draw_rect(Rect2(tpos + Vector2(-26, 37), Vector2(52, 4)), Color("#162938"), true)
		draw_rect(Rect2(tpos + Vector2(-26, 37), Vector2(52.0 * sh_ratio, 4)), CYAN, true)

	var m_spr: Texture2D = CosmoteerAssets.get_sprite_texture("shot_missile_he")
	for m in incoming_missiles:
		var mp := Vector2(m.pos)
		if m_spr != null:
			draw_set_transform(mp, PI, Vector2.ONE)
			draw_texture_rect(m_spr, Rect2(-10, -5, 20, 10), false, Color("#ff9880"))
			draw_set_transform(Vector2.ZERO)
		else:
			draw_circle(mp, 4.5, RED)

	for pb in pd_beams:
		var a := clampf(float(pb.ttl) / 0.16, 0.0, 1.0)
		draw_line(Vector2(pb.from), Vector2(pb.to), Color("#6ef2d6", a), 2.4, true)

	for p in projectiles:
		var pos := Vector2(p.pos)
		var ang := Vector2(p.vel).angle()
		var pk := str(p.kind)
		var skey := "shot_laser_small"
		var psize := Vector2(22, 8)
		var ptint := Color.WHITE
		match pk:
			"heavy_laser":
				skey = "shot_laser_large"
				psize = Vector2(30, 11)
			"cannon", "cannon_large", "cannon_deck", "flak":
				skey = "shot_bullet_large"
				psize = Vector2(22, 11) if pk == "cannon_deck" else Vector2(16, 8)
			"railgun":
				skey = "shot_railgun"
				psize = Vector2(36, 9)
			"chaingun":
				skey = "shot_chaingun"
				psize = Vector2(18, 6)
			"disruptor":
				skey = "shot_disruptor"
				psize = Vector2(20, 10)
			"missile", "missile_emp", "missile_nuke":
				skey = "shot_missile_he"
				psize = Vector2(22, 9)
				ptint = Color("#b885ff") if pk == "missile_emp" else (Color("#ff9d5c") if pk == "missile_nuke" else Color.WHITE)
			"mine":
				skey = "shot_mine"
				psize = Vector2(18, 18)
		var stex: Texture2D = CosmoteerAssets.get_sprite_texture(skey)
		if stex != null:
			draw_set_transform(pos, ang, Vector2.ONE)
			draw_texture_rect(stex, Rect2(-psize * 0.5, psize), false, ptint)
			draw_set_transform(Vector2.ZERO)
		else:
			draw_line(pos - Vector2.from_angle(ang) * 10.0, pos + Vector2.from_angle(ang) * 6.0, GOLD, 3.0, true)

	for b in bursts:
		var t := clampf(float(b.age) / maxf(0.1, float(b.dur)), 0.0, 1.0)
		var fidx := clampi(int(t * 4.0), 0, 3)
		var bk := str(b.kind)
		var etex: Texture2D = CosmoteerAssets.get_sprite_texture(("exp_big_%d" if bk in ["nuke", "meltdown"] else "exp_med_%d") % fidx)
		if etex != null:
			var r := float(b.radius) * (0.45 + 0.65 * t)
			draw_texture_rect(etex, Rect2(Vector2(b.pos) - Vector2(r, r), Vector2(r * 2.0, r * 2.0)), false, Color(1.0, 1.0, 1.0, 1.0 - t))

	if font != null:
		for fl in floaters:
			var a := clampf(1.0 - float(fl.age) / 1.15, 0.0, 1.0)
			draw_string(font, Vector2(fl.pos) - Vector2(36, 0), str(fl.text), HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color(fl.color, a))
		var dist_txt := "표적 거리 %dm / 사거리 %dm" % [roundi(float(params.get("target_distance", 160.0)) - target_pull_offset), roundi(float(params.get("range", 250.0)))]
		if out_of_range:
			dist_txt += " · 사거리 밖"
		elif demo_kind == "chaingun":
			dist_txt += " · 가속 %d%%" % roundi(chaingun_spin * 100.0)
		draw_string(font, Vector2(14, 28), dist_txt, HORIZONTAL_ALIGNMENT_LEFT, size.x - 28.0, 21, RED if out_of_range else MINT)
