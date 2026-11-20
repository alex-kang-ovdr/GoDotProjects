extends Node2D
## Main 2D renderer, touch/keyboard controller, and HUD for TangTang Commando (Survivor.io).

const Data := preload("res://Scripts/SurvivorData.gd")
const SimScript := preload("res://Scripts/SurvivorSim.gd")
const TEX_HERO: Texture2D = preload("res://Assets/hero.svg")
const TEX_ZOMBIE: Texture2D = preload("res://Assets/zombie.svg")
const TEX_BOSS: Texture2D = preload("res://Assets/boss.svg")
const TEX_KUNAI: Texture2D = preload("res://Assets/kunai.svg")
const TEX_GEM: Texture2D = preload("res://Assets/gem.svg")
const TEX_CHEST: Texture2D = preload("res://Assets/chest.svg")

const VIEW := Vector2(540.0, 960.0)
const TILE_SIZE := 96.0

@onready var hud_layer: CanvasLayer = $Hud

var sim: RefCounted
var ui_font: Font
var ui_theme: Theme

# Input state
var _joy_active := false
var _joy_touch_id := -1
var _joy_origin := Vector2.ZERO
var _joy_vec := Vector2.ZERO
var _banish_mode := false
var _last_state := ""

# UI nodes
var _root_ui: Control
var _menu_panel: PanelContainer
var _hud_bar: Control
var _xp_bar: ProgressBar
var _level_label: Label
var _timer_label: Label
var _kills_label: Label
var _gold_label: Label
var _loadout_label: Label
var _boss_box: PanelContainer
var _boss_name_label: Label
var _boss_hp_bar: ProgressBar
var _toast_label: Label
var _dash_btn: Button
var _skill_btn: Button
var _pause_btn: Button
var _level_panel: PanelContainer
var _level_cards_box: VBoxContainer
var _reroll_btn: Button
var _banish_btn: Button
var _pause_panel: PanelContainer
var _result_panel: PanelContainer
var _result_title: Label
var _result_body: Label

# Menu dynamic widgets
var _menu_stats_label: Label
var _hero_buttons: Dictionary = {}
var _chapter_buttons: Array[Button] = []
var _meta_buttons: Dictionary = {}


func _ready() -> void:
	sim = SimScript.new()
	sim.load_profile()
	_install_font()
	_build_ui()
	_sync_ui_visibility()
	_refresh_menu()
	queue_redraw()


func _install_font() -> void:
	if FileAccess.file_exists("res://fonts/survivor-ui.txt"):
		var raw := FileAccess.get_file_as_string("res://fonts/survivor-ui.txt").strip_edges()
		if not raw.is_empty():
			var ff := FontFile.new()
			ff.data = Marshalls.base64_to_raw(raw)
			ui_font = ff
	if ui_font == null:
		ui_font = ThemeDB.fallback_font
	ui_theme = Theme.new()
	ui_theme.default_font = ui_font
	ui_theme.default_font_size = 16


func _physics_process(delta: float) -> void:
	if sim.state == "playing":
		sim.update(delta, _read_move_input(), VIEW * 0.5)
	elif sim.toast_timer > 0.0:
		sim.toast_timer = maxf(0.0, sim.toast_timer - delta)
	if sim.state != _last_state:
		_last_state = sim.state
		_banish_mode = false
		_sync_ui_visibility()
		if sim.state == "levelup":
			_rebuild_level_cards()
		elif sim.state in ["win", "dead"]:
			_refresh_result()
		elif sim.state == "menu":
			_refresh_menu()
	if sim.state in ["playing", "levelup", "paused"]:
		_update_hud()
	queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_SPACE, KEY_SHIFT:
				if sim.state == "playing":
					sim.trigger_dash(_read_move_input())
					get_viewport().set_input_as_handled()
				elif sim.state == "menu":
					_start_run()
					get_viewport().set_input_as_handled()
			KEY_E:
				if sim.state == "playing":
					sim.trigger_hero_skill()
					get_viewport().set_input_as_handled()
			KEY_P, KEY_ESCAPE:
				if sim.state in ["playing", "paused"]:
					sim.toggle_pause()
					get_viewport().set_input_as_handled()
			KEY_R:
				if sim.state in ["win", "dead", "paused"]:
					_start_run()
					get_viewport().set_input_as_handled()
			KEY_1:
				if sim.state == "levelup":
					_on_pick_card(0)
					get_viewport().set_input_as_handled()
			KEY_2:
				if sim.state == "levelup":
					_on_pick_card(1)
					get_viewport().set_input_as_handled()
			KEY_3:
				if sim.state == "levelup":
					_on_pick_card(2)
					get_viewport().set_input_as_handled()
	elif event is InputEventScreenTouch:
		if sim.state != "playing":
			_joy_active = false
			_joy_vec = Vector2.ZERO
			return
		var pos := _canvas_point(event.position)
		if event.pressed and not _joy_active and pos.y > 110.0 and pos.y < VIEW.y - 120.0:
			_joy_active = true
			_joy_touch_id = event.index
			_joy_origin = pos
			_joy_vec = Vector2.ZERO
		elif not event.pressed and event.index == _joy_touch_id:
			_joy_active = false
			_joy_touch_id = -1
			_joy_vec = Vector2.ZERO
	elif event is InputEventScreenDrag:
		if _joy_active and event.index == _joy_touch_id and sim.state == "playing":
			var delta := _canvas_point(event.position) - _joy_origin
			_joy_vec = delta / 64.0
			if _joy_vec.length() > 1.0:
				_joy_vec = _joy_vec.normalized()
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if sim.state != "playing":
			_joy_active = false
			_joy_vec = Vector2.ZERO
			return
		var pos := _canvas_point(event.position)
		if event.pressed and pos.y > 110.0 and pos.y < VIEW.y - 120.0:
			_joy_active = true
			_joy_origin = pos
			_joy_vec = Vector2.ZERO
		elif not event.pressed:
			_joy_active = false
			_joy_vec = Vector2.ZERO
	elif event is InputEventMouseMotion and _joy_active and sim.state == "playing":
		var delta := _canvas_point(event.position) - _joy_origin
		_joy_vec = delta / 64.0
		if _joy_vec.length() > 1.0:
			_joy_vec = _joy_vec.normalized()


func _canvas_point(screen_pos: Vector2) -> Vector2:
	return get_canvas_transform().affine_inverse() * screen_pos


func _read_move_input() -> Vector2:
	var x := (1.0 if (Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT)) else 0.0) \
		- (1.0 if (Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT)) else 0.0)
	var y := (1.0 if (Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN)) else 0.0) \
		- (1.0 if (Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP)) else 0.0)
	var v := Vector2(x, y) + _joy_vec
	if v.length() > 1.0:
		v = v.normalized()
	return v


func _start_run() -> void:
	_joy_active = false
	_joy_vec = Vector2.ZERO
	sim.start_run(sim.selected_hero, sim.chapter, "kunai")
	_last_state = sim.state
	_sync_ui_visibility()
	_update_hud()


func _on_pick_card(index: int) -> void:
	if _banish_mode:
		_banish_mode = false
		sim.banish_level_choice(index)
		_rebuild_level_cards()
		return
	sim.pick_level_choice(index)
	if sim.state == "levelup":
		_rebuild_level_cards()


# --- 2D World Rendering ---

func _draw() -> void:
	var chap: Dictionary = Data.CHAPTERS[sim.chapter]
	var ground_colors: Array = chap["ground"]
	var accent: Color = chap["accent"]
	var cam_center: Vector2 = sim.player.get("pos", Vector2.ZERO) if not sim.player.is_empty() else Vector2.ZERO
	var shake_offset := Vector2.ZERO
	if sim.shake > 0.1:
		shake_offset = Vector2(randf_range(-sim.shake, sim.shake), randf_range(-sim.shake, sim.shake))
	var world_to_screen := (VIEW * 0.5) - cam_center + shake_offset

	# 1. Tiled scrolling chapter ground
	var start_tx := int(floorf((cam_center.x - VIEW.x * 0.5) / TILE_SIZE)) - 1
	var end_tx := int(ceilf((cam_center.x + VIEW.x * 0.5) / TILE_SIZE)) + 1
	var start_ty := int(floorf((cam_center.y - VIEW.y * 0.5) / TILE_SIZE)) - 1
	var end_ty := int(ceilf((cam_center.y + VIEW.y * 0.5) / TILE_SIZE)) + 1
	for tx in range(start_tx, end_tx + 1):
		for ty in range(start_ty, end_ty + 1):
			var idx := posmod(tx * 3 + ty * 7, ground_colors.size())
			var tl := Vector2(float(tx) * TILE_SIZE, float(ty) * TILE_SIZE) + world_to_screen
			draw_rect(Rect2(tl, Vector2(TILE_SIZE + 1.0, TILE_SIZE + 1.0)), ground_colors[idx])
			draw_rect(Rect2(tl, Vector2(TILE_SIZE, TILE_SIZE)), Color(accent.r, accent.g, accent.b, 0.16), false, 1.0)

	if sim.player.is_empty():
		return

	# 2. Ground Areas (Molotov fire, Heal field, Blasts, Lightning)
	for a in sim.areas:
		var spos: Vector2 = (a["pos"] as Vector2) + world_to_screen
		var kind := str(a["kind"])
		var ratio := clampf(float(a["life"]) / maxf(0.01, float(a["max"])), 0.0, 1.0)
		var col: Color = a.get("color", Color.WHITE)
		if kind == "fire":
			draw_circle(spos, float(a["r"]), Color(col.r, col.g, col.b, 0.34 * ratio + 0.12))
			draw_arc(spos, float(a["r"]), 0.0, TAU, 24, Color(1.0, 0.85, 0.45, 0.55 * ratio), 2.0)
		elif kind == "heal_field":
			draw_circle(spos, float(a["r"]), Color(col.r, col.g, col.b, 0.22))
			draw_arc(spos, float(a["r"]), 0.0, TAU, 28, Color(0.7, 0.96, 1.0, 0.7), 3.0)
		elif kind == "blast":
			var br := float(a["r"]) * (1.0 - ratio * 0.35)
			draw_circle(spos, br, Color(col.r, col.g, col.b, 0.35 * ratio))
			draw_arc(spos, br, 0.0, TAU, 24, Color(1.0, 0.95, 0.78, 0.8 * ratio), 3.0)
		elif kind == "lightning":
			draw_line(spos + Vector2(0, -140), spos, Color(0.85, 0.96, 1.0, ratio), 4.0)
			draw_circle(spos, float(a["r"]) * ratio, Color(0.7, 0.92, 1.0, 0.55 * ratio))
		elif kind == "link":
			var spos2: Vector2 = (a["pos2"] as Vector2) + world_to_screen
			draw_line(spos, spos2, Color(col.r, col.g, col.b, ratio), 3.0)
		elif kind == "heal_pulse":
			draw_arc(spos, float(a["r"]) * (1.0 - ratio), 0.0, TAU, 24, Color(col.r, col.g, col.b, ratio * 0.7), 3.0)

	# 3. Telegraphed Threats (Boss & Charger & Sniper warnings)
	for h in sim.threats:
		var spos: Vector2 = (h["pos"] as Vector2) + world_to_screen
		var col: Color = h["color"]
		var active := bool(h["active"])
		var warn_ratio := clampf(float(h["age"]) / maxf(0.01, float(h["warn"])), 0.0, 1.0)
		var shape := str(h["shape"])
		if shape == "circle":
			var r := float(h["r"])
			draw_circle(spos, r, Color(col.r, col.g, col.b, 0.48 if active else 0.14 + 0.16 * warn_ratio))
			draw_arc(spos, r * (1.0 if active else warn_ratio), 0.0, TAU, 24, Color(col.r, col.g, col.b, 0.9), 2.5)
		elif shape == "line":
			var spos2: Vector2 = (h["pos2"] as Vector2) + world_to_screen
			var w := float(h["width"])
			draw_line(spos, spos2, Color(col.r, col.g, col.b, 0.82 if active else 0.25 + 0.35 * warn_ratio), w if active else maxf(3.0, w * warn_ratio))
		elif shape == "ring":
			var r := float(h["r"])
			if active:
				var act_r := r * clampf((float(h["age"]) - float(h["warn"])) / maxf(0.01, float(h["duration"])), 0.0, 1.0)
				draw_arc(spos, act_r, 0.0, TAU, 32, Color(col.r, col.g, col.b, 0.9), float(h["width"]) * 0.6)
			else:
				draw_arc(spos, r * warn_ratio, 0.0, TAU, 28, Color(col.r, col.g, col.b, 0.45), 2.5)

	# 4. Pickups (Gems, Chests, Heal, Bomb, Shield, Magnet)
	for g in sim.gems:
		var spos: Vector2 = (g["pos"] as Vector2) + world_to_screen
		if spos.x < -30 or spos.x > VIEW.x + 30 or spos.y < -30 or spos.y > VIEW.y + 30:
			continue
		var kind := str(g["kind"])
		var r := float(g["r"])
		if kind == "chest":
			draw_texture_rect(TEX_CHEST, Rect2(spos - Vector2(18, 18), Vector2(36, 36)), false)
		elif kind == "xp":
			draw_texture_rect(TEX_GEM, Rect2(spos - Vector2(r, r), Vector2(r * 2.0, r * 2.0)), false)
		elif kind == "heal":
			draw_circle(spos, r, Color("66e39a"))
			draw_line(spos + Vector2(-4, 0), spos + Vector2(4, 0), Color.WHITE, 2.0)
			draw_line(spos + Vector2(0, -4), spos + Vector2(0, 4), Color.WHITE, 2.0)
		elif kind == "bomb":
			draw_circle(spos, r, Color("ff934f"))
			draw_arc(spos, r + 2.0, 0.0, TAU, 16, Color("ffe59c"), 2.0)
		elif kind == "shield":
			draw_circle(spos, r, Color("6ee7f5"))
			draw_arc(spos, r + 2.0, 0.0, TAU, 16, Color.WHITE, 2.0)
		elif kind == "magnet":
			draw_circle(spos, r, Color("c19bff"))
			draw_arc(spos, r + 2.0, 0.0, TAU, 16, Color.WHITE, 2.0)

	# 5. Engineer Turrets & Supply Beacons
	for b in sim.beacons:
		if str(b["status"]) == "expired":
			continue
		var spos: Vector2 = (b["pos"] as Vector2) + world_to_screen
		var bcol := Color("e7ce8e") if str(b["status"]) == "complete" else (Color("e99871") if bool(b["contested"]) else Color("52e7c4"))
		draw_arc(spos, float(b["r"]), 0.0, TAU, 32, bcol, 3.0)
		draw_rect(Rect2(spos - Vector2(10, 10), Vector2(20, 20)), bcol)
		var pct := int(floorf(float(b["progress"]) / maxf(0.1, float(b["goal"])) * 100.0))
		var blbl := "거점 확보" if str(b["status"]) == "complete" else ("적 접근 중" if bool(b["contested"]) else ("보급 거점 %d%%" % pct))
		draw_string(ui_font, spos + Vector2(-48, -18), blbl, HORIZONTAL_ALIGNMENT_CENTER, 96, 12, Color("e5ffed"))

	for t in sim.turrets:
		var spos: Vector2 = (t["pos"] as Vector2) + world_to_screen
		draw_circle(spos, 14.0, Color("f2b65e"))
		draw_circle(spos, 8.0, Color("3c2b17"))

	# 6. Enemies
	for e in sim.enemies:
		var spos: Vector2 = (e["pos"] as Vector2) + world_to_screen
		var r := float(e["r"])
		if spos.x < -r * 2.0 or spos.x > VIEW.x + r * 2.0 or spos.y < -r * 2.0 or spos.y > VIEW.y + r * 2.0:
			continue
		var col: Color = Color.WHITE if float(e["hit"]) > 0.0 else (e["color"] as Color)
		var tex := TEX_BOSS if str(e["type"]) in ["boss", "elite"] else TEX_ZOMBIE
		var sz := Vector2(r * 2.4, r * 2.4)
		draw_texture_rect(tex, Rect2(spos - sz * 0.5, sz), false, col)
		if float(e["hp"]) < float(e["max"]) and str(e["type"]) != "boss":
			var bw := r * 1.9
			var ratio := clampf(float(e["hp"]) / float(e["max"]), 0.0, 1.0)
			draw_rect(Rect2(spos + Vector2(-bw * 0.5, -r - 8.0), Vector2(bw, 4.0)), Color(0.1, 0.1, 0.14, 0.85))
			draw_rect(Rect2(spos + Vector2(-bw * 0.5, -r - 8.0), Vector2(bw * ratio, 4.0)), Color("ff6e7a"))

	# 7. Orbital Guardian Blades & Drones
	for bpos in sim.guardian_blade_positions():
		var spos: Vector2 = bpos + world_to_screen
		draw_circle(spos, 11.0, Color("b1f3ef"))
		draw_arc(spos, 13.0, 0.0, TAU, 14, Color.WHITE, 2.0)
	for d in sim.drone_positions():
		var spos: Vector2 = (d["pos"] as Vector2) + world_to_screen
		var dcol := Color("ffe89c") if str(d["kind"]) == "destroyer" else (Color("8deaf3") if str(d["kind"]) == "droneA" else Color("f5bc84"))
		draw_circle(spos, 10.0, dcol)
		draw_arc(spos, 12.0, 0.0, TAU, 14, Color("142030"), 2.0)

	# 8. Player
	var ppos: Vector2 = (sim.player["pos"] as Vector2) + world_to_screen
	var hero_col: Color = Data.HEROES[sim.selected_hero]["color"]
	if float(sim.player["inv"]) > 0.0:
		draw_arc(ppos, 26.0, 0.0, TAU, 24, Color(0.65, 0.98, 1.0, 0.75), 3.0)
	draw_circle(ppos + Vector2(0, 14), 14.0, Color(0, 0, 0, 0.35))
	var bob := sin(float(sim.player["anim"])) * 2.5 if bool(sim.player["moving"]) else 0.0
	draw_texture_rect(TEX_HERO, Rect2(ppos - Vector2(22, 22 + bob), Vector2(44, 44)), false, Color.WHITE if sim.dash_time <= 0.0 else Color("a5ffdb"))
	draw_arc(ppos, 20.0, 0.0, TAU, 24, Color(hero_col.r, hero_col.g, hero_col.b, 0.65), 2.0)

	# Player HP bar beneath feet
	var hp_ratio := clampf(float(sim.player["hp"]) / maxf(1.0, float(sim.player["max_hp"])), 0.0, 1.0)
	draw_rect(Rect2(ppos + Vector2(-24, 24), Vector2(48, 6)), Color(0.08, 0.1, 0.14, 0.9))
	draw_rect(Rect2(ppos + Vector2(-23, 25), Vector2(46.0 * hp_ratio, 4)), Color("5be38c") if hp_ratio > 0.35 else Color("ff6e6e"))

	# 9. Player & Enemy Projectiles
	for s in sim.shots:
		var spos: Vector2 = (s["pos"] as Vector2) + world_to_screen
		var vel: Vector2 = s["vel"]
		var col: Color = s["color"]
		if str(s["kind"]) == "kunai":
			draw_set_transform(spos, vel.angle(), Vector2.ONE)
			draw_texture_rect(TEX_KUNAI, Rect2(Vector2(-12, -6), Vector2(24, 12)), false, col)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		else:
			var r := float(s["r"])
			draw_circle(spos, r, col)
			draw_arc(spos, r, 0.0, TAU, 12, Color.WHITE, 1.5)

	for es in sim.enemy_shots:
		var spos: Vector2 = (es["pos"] as Vector2) + world_to_screen
		var r := float(es["r"])
		draw_circle(spos, r, es["color"])
		draw_arc(spos, r + 1.0, 0.0, TAU, 12, Color.WHITE, 1.5)

	# 10. Particles & Floating Damage Numbers
	for p in sim.particles:
		var spos: Vector2 = (p["pos"] as Vector2) + world_to_screen
		var col: Color = p["color"]
		var alpha := clampf(float(p["life"]) / maxf(0.01, float(p["max"])), 0.0, 1.0)
		draw_circle(spos, float(p["r"]) * alpha, Color(col.r, col.g, col.b, alpha))

	for t in sim.texts:
		var spos: Vector2 = (t["pos"] as Vector2) + world_to_screen
		var col: Color = t["color"]
		var alpha := clampf(float(t["life"]) / maxf(0.01, float(t["max"])), 0.0, 1.0)
		draw_string(ui_font, spos + Vector2(-14, 0), str(t["text"]), HORIZONTAL_ALIGNMENT_CENTER, 40, 14, Color(col.r, col.g, col.b, alpha))

	# 11. Hit flash & Virtual Touch Joystick
	if sim.flash > 0.0:
		draw_rect(Rect2(Vector2.ZERO, VIEW), Color(1.0, 0.2, 0.25, sim.flash * 0.55))
	if _joy_active and sim.state == "playing":
		draw_arc(_joy_origin, 52.0, 0.0, TAU, 28, Color(1, 1, 1, 0.35), 3.0)
		draw_circle(_joy_origin + _joy_vec * 44.0, 22.0, Color(1, 1, 1, 0.45))


# --- UI Construction ---

func _build_ui() -> void:
	_root_ui = Control.new()
	_root_ui.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root_ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root_ui.theme = ui_theme
	hud_layer.add_child(_root_ui)

	_build_hud()
	_build_menu_panel()
	_build_level_panel()
	_build_pause_panel()
	_build_result_panel()


func _make_card_style(bg: Color, border: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(12)
	sb.set_content_margin_all(14)
	return sb


func _build_hud() -> void:
	_hud_bar = Control.new()
	_hud_bar.set_anchors_preset(Control.PRESET_FULL_RECT)
	_hud_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root_ui.add_child(_hud_bar)

	# XP bar at very top
	_xp_bar = ProgressBar.new()
	_xp_bar.position = Vector2(12, 10)
	_xp_bar.size = Vector2(VIEW.x - 24, 18)
	_xp_bar.show_percentage = false
	_xp_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fill := StyleBoxFlat.new()
	fill.bg_color = Color("46e0b4")
	fill.set_corner_radius_all(6)
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0.08, 0.12, 0.18, 0.9)
	bg.set_corner_radius_all(6)
	_xp_bar.add_theme_stylebox_override("fill", fill)
	_xp_bar.add_theme_stylebox_override("background", bg)
	_hud_bar.add_child(_xp_bar)

	_level_label = _make_label("Lv.1", Vector2(16, 32), Vector2(110, 26), 16, Color("a9f7de"))
	_hud_bar.add_child(_level_label)

	_timer_label = _make_label("00:00", Vector2(200, 30), Vector2(140, 30), 22, Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER)
	_hud_bar.add_child(_timer_label)

	_kills_label = _make_label("처치 0", Vector2(345, 32), Vector2(115, 24), 15, Color("ffd88a"), HORIZONTAL_ALIGNMENT_RIGHT)
	_hud_bar.add_child(_kills_label)

	_gold_label = _make_label("0 G", Vector2(345, 54), Vector2(115, 22), 14, Color("ffe780"), HORIZONTAL_ALIGNMENT_RIGHT)
	_hud_bar.add_child(_gold_label)

	_pause_btn = Button.new()
	_pause_btn.text = "II"
	_pause_btn.position = Vector2(VIEW.x - 58, 32)
	_pause_btn.size = Vector2(46, 38)
	_pause_btn.pressed.connect(func(): sim.toggle_pause())
	_hud_bar.add_child(_pause_btn)

	_loadout_label = _make_label("", Vector2(16, 58), Vector2(320, 24), 13, Color("cfe2f7"))
	_hud_bar.add_child(_loadout_label)

	# Boss HP Bar
	_boss_box = PanelContainer.new()
	_boss_box.position = Vector2(30, 88)
	_boss_box.size = Vector2(VIEW.x - 60, 48)
	_boss_box.add_theme_stylebox_override("panel", _make_card_style(Color(0.16, 0.06, 0.1, 0.9), Color("e36b9c")))
	_boss_box.visible = false
	var bvbox := VBoxContainer.new()
	_boss_name_label = Label.new()
	_boss_name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_boss_name_label.add_theme_font_size_override("font_size", 14)
	_boss_hp_bar = ProgressBar.new()
	_boss_hp_bar.custom_minimum_size = Vector2(0, 12)
	_boss_hp_bar.show_percentage = false
	var bfill := StyleBoxFlat.new()
	bfill.bg_color = Color("e36b9c")
	_boss_hp_bar.add_theme_stylebox_override("fill", bfill)
	bvbox.add_child(_boss_name_label)
	bvbox.add_child(_boss_hp_bar)
	_boss_box.add_child(bvbox)
	_hud_bar.add_child(_boss_box)

	# Toast Banner
	_toast_label = _make_label("", Vector2(20, 146), Vector2(VIEW.x - 40, 34), 15, Color("fff0a6"), HORIZONTAL_ALIGNMENT_CENTER)
	_hud_bar.add_child(_toast_label)

	# Mobile / PC Action Buttons (Bottom Right)
	_dash_btn = Button.new()
	_dash_btn.text = "대시\n[Space]"
	_dash_btn.position = Vector2(VIEW.x - 196, VIEW.y - 104)
	_dash_btn.size = Vector2(86, 78)
	_dash_btn.pressed.connect(func(): sim.trigger_dash(_read_move_input()))
	_hud_bar.add_child(_dash_btn)

	_skill_btn = Button.new()
	_skill_btn.text = "특수기\n[E]"
	_skill_btn.position = Vector2(VIEW.x - 100, VIEW.y - 104)
	_skill_btn.size = Vector2(86, 78)
	_skill_btn.pressed.connect(func(): sim.trigger_hero_skill())
	_hud_bar.add_child(_skill_btn)


func _build_menu_panel() -> void:
	_menu_panel = PanelContainer.new()
	_menu_panel.position = Vector2(24, 52)
	_menu_panel.size = Vector2(VIEW.x - 48, VIEW.y - 104)
	_menu_panel.add_theme_stylebox_override("panel", _make_card_style(Color(0.08, 0.12, 0.18, 0.95), Color("456485")))
	_root_ui.add_child(_menu_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 12)
	_menu_panel.add_child(vbox)

	var title := Label.new()
	title.text = "탕탕특공대 · Godot 4.7"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 28)
	title.add_theme_color_override("font_color", Color("ffe38a"))
	vbox.add_child(title)

	var sub := Label.new()
	sub.text = "WASD / 드래그 이동 · 자동 공격 · 무기 진화 · 보스 격파"
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	sub.add_theme_font_size_override("font_size", 13)
	sub.add_theme_color_override("font_color", Color("adc2d9"))
	vbox.add_child(sub)

	_menu_stats_label = Label.new()
	_menu_stats_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_menu_stats_label.add_theme_font_size_override("font_size", 15)
	_menu_stats_label.add_theme_color_override("font_color", Color("8ef2d0"))
	vbox.add_child(_menu_stats_label)

	# Hero selector
	var h_lbl := Label.new()
	h_lbl.text = "영웅 선택"
	h_lbl.add_theme_font_size_override("font_size", 15)
	vbox.add_child(h_lbl)
	var h_row := HBoxContainer.new()
	h_row.add_theme_constant_override("separation", 8)
	for hid in Data.HERO_ORDER:
		var hero: Dictionary = Data.HEROES[hid]
		var btn := Button.new()
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.custom_minimum_size = Vector2(0, 68)
		btn.text = "%s\n(%s)" % [str(hero["name"]), str(hero["skill"])]
		btn.pressed.connect(func():
			sim.selected_hero = hid
			sim.profile["hero"] = hid
			sim.save_profile()
			_refresh_menu()
		)
		h_row.add_child(btn)
		_hero_buttons[hid] = btn
	vbox.add_child(h_row)

	# Chapter selector
	var c_lbl := Label.new()
	c_lbl.text = "챕터 선택"
	c_lbl.add_theme_font_size_override("font_size", 15)
	vbox.add_child(c_lbl)
	var c_row := HBoxContainer.new()
	c_row.add_theme_constant_override("separation", 8)
	for i in Data.CHAPTERS.size():
		var chap: Dictionary = Data.CHAPTERS[i]
		var btn := Button.new()
		btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		btn.custom_minimum_size = Vector2(0, 58)
		btn.text = "Ch.%d\n%s" % [i + 1, str(chap["name"])]
		var idx := i
		btn.pressed.connect(func():
			sim.chapter = idx
			_refresh_menu()
		)
		c_row.add_child(btn)
		_chapter_buttons.append(btn)
	vbox.add_child(c_row)

	# Permanent upgrades
	var m_lbl := Label.new()
	m_lbl.text = "영구 강화 (골드 사용)"
	m_lbl.add_theme_font_size_override("font_size", 15)
	vbox.add_child(m_lbl)
	for key in ["attack", "hp", "armor"]:
		var btn := Button.new()
		btn.custom_minimum_size = Vector2(0, 44)
		var k: String = str(key)
		btn.pressed.connect(func():
			if sim.buy_meta_upgrade(k):
				_refresh_menu()
		)
		vbox.add_child(btn)
		_meta_buttons[k] = btn

	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vbox.add_child(spacer)

	var start_btn := Button.new()
	start_btn.text = "출격하기 (PLAY)"
	start_btn.custom_minimum_size = Vector2(0, 62)
	start_btn.add_theme_font_size_override("font_size", 22)
	start_btn.pressed.connect(_start_run)
	vbox.add_child(start_btn)


func _build_level_panel() -> void:
	_level_panel = PanelContainer.new()
	_level_panel.position = Vector2(28, 130)
	_level_panel.size = Vector2(VIEW.x - 56, 560)
	_level_panel.add_theme_stylebox_override("panel", _make_card_style(Color(0.09, 0.13, 0.2, 0.96), Color("ffe38a")))
	_root_ui.add_child(_level_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 12)
	_level_panel.add_child(vbox)

	var title := Label.new()
	title.text = "레벨 업! 스킬을 선택하세요 (1 / 2 / 3)"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 20)
	title.add_theme_color_override("font_color", Color("ffe38a"))
	vbox.add_child(title)

	_level_cards_box = VBoxContainer.new()
	_level_cards_box.add_theme_constant_override("separation", 10)
	_level_cards_box.size_flags_vertical = Control.SIZE_EXPAND_FILL
	vbox.add_child(_level_cards_box)

	var action_row := HBoxContainer.new()
	action_row.add_theme_constant_override("separation", 10)
	_reroll_btn = Button.new()
	_reroll_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_reroll_btn.custom_minimum_size = Vector2(0, 44)
	_reroll_btn.pressed.connect(func():
		if sim.reroll_level_choices():
			_rebuild_level_cards()
	)
	_banish_btn = Button.new()
	_banish_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_banish_btn.custom_minimum_size = Vector2(0, 44)
	_banish_btn.pressed.connect(func():
		_banish_mode = not _banish_mode
		_rebuild_level_cards()
	)
	action_row.add_child(_reroll_btn)
	action_row.add_child(_banish_btn)
	vbox.add_child(action_row)


func _build_pause_panel() -> void:
	_pause_panel = PanelContainer.new()
	_pause_panel.position = Vector2(70, 320)
	_pause_panel.size = Vector2(VIEW.x - 140, 250)
	_pause_panel.add_theme_stylebox_override("panel", _make_card_style(Color(0.08, 0.11, 0.17, 0.96), Color("6788ad")))
	_root_ui.add_child(_pause_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 14)
	_pause_panel.add_child(vbox)

	var title := Label.new()
	title.text = "일시 정지"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 24)
	vbox.add_child(title)

	var resume_btn := Button.new()
	resume_btn.text = "계속하기"
	resume_btn.custom_minimum_size = Vector2(0, 48)
	resume_btn.pressed.connect(func(): sim.toggle_pause())
	vbox.add_child(resume_btn)

	var restart_btn := Button.new()
	restart_btn.text = "다시 시작"
	restart_btn.custom_minimum_size = Vector2(0, 44)
	restart_btn.pressed.connect(_start_run)
	vbox.add_child(restart_btn)

	var menu_btn := Button.new()
	menu_btn.text = "로비로 돌아가기"
	menu_btn.custom_minimum_size = Vector2(0, 44)
	menu_btn.pressed.connect(func(): sim.state = "menu")
	vbox.add_child(menu_btn)


func _build_result_panel() -> void:
	_result_panel = PanelContainer.new()
	_result_panel.position = Vector2(40, 210)
	_result_panel.size = Vector2(VIEW.x - 80, 430)
	_result_panel.add_theme_stylebox_override("panel", _make_card_style(Color(0.09, 0.12, 0.18, 0.97), Color("ffd36e")))
	_root_ui.add_child(_result_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 14)
	_result_panel.add_child(vbox)

	_result_title = Label.new()
	_result_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_result_title.add_theme_font_size_override("font_size", 28)
	vbox.add_child(_result_title)

	_result_body = Label.new()
	_result_body.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_result_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_result_body.add_theme_font_size_override("font_size", 16)
	vbox.add_child(_result_body)

	var retry_btn := Button.new()
	retry_btn.text = "다시 출격"
	retry_btn.custom_minimum_size = Vector2(0, 52)
	retry_btn.pressed.connect(_start_run)
	vbox.add_child(retry_btn)

	var lobby_btn := Button.new()
	lobby_btn.text = "로비 / 영구 강화"
	lobby_btn.custom_minimum_size = Vector2(0, 46)
	lobby_btn.pressed.connect(func(): sim.state = "menu")
	vbox.add_child(lobby_btn)


func _make_label(text: String, pos: Vector2, sz: Vector2, font_size: int, color: Color, align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var lbl := Label.new()
	lbl.text = text
	lbl.position = pos
	lbl.size = sz
	lbl.horizontal_alignment = align
	lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lbl.add_theme_font_size_override("font_size", font_size)
	lbl.add_theme_color_override("font_color", color)
	lbl.add_theme_color_override("font_outline_color", Color(0.06, 0.08, 0.12, 0.95))
	lbl.add_theme_constant_override("outline_size", 3)
	return lbl


func _sync_ui_visibility() -> void:
	_menu_panel.visible = sim.state == "menu"
	_hud_bar.visible = sim.state in ["playing", "levelup", "paused"]
	_level_panel.visible = sim.state == "levelup"
	_pause_panel.visible = sim.state == "paused"
	_result_panel.visible = sim.state in ["win", "dead"]


func _refresh_menu() -> void:
	_menu_stats_label.text = "보유 골드 %d G · 최고 처치 %d · 클리어 %d회" % [
		int(sim.profile["gold"]), int(sim.profile["best_kills"]), int(sim.profile["wins"])
	]
	for hid in _hero_buttons.keys():
		var btn: Button = _hero_buttons[hid]
		var selected: bool = str(hid) == str(sim.selected_hero)
		btn.modulate = Color("a6ffdf") if selected else Color(0.82, 0.86, 0.92, 1.0)
	for i in _chapter_buttons.size():
		var btn := _chapter_buttons[i]
		var unlocked := i < int(sim.profile["unlocked"])
		btn.disabled = not unlocked
		btn.modulate = Color("ffe38a") if i == sim.chapter else (Color.WHITE if unlocked else Color(0.55, 0.58, 0.65, 0.8))
	for key in _meta_buttons.keys():
		var btn: Button = _meta_buttons[key]
		var info: Dictionary = Data.META_UPGRADES[key]
		var lv := int(sim.profile.get(key, 0))
		var cost: int = int(sim.upgrade_cost(str(key)))
		btn.text = "%s Lv.%d (%s) · %d G" % [str(info["name"]), lv, str(info["desc"]), cost]
		btn.disabled = int(sim.profile["gold"]) < cost


func _rebuild_level_cards() -> void:
	for child in _level_cards_box.get_children():
		child.queue_free()
	for i in sim.level_choices.size():
		var c: Dictionary = sim.level_choices[i]
		var btn := Button.new()
		btn.custom_minimum_size = Vector2(0, 112)
		btn.alignment = HORIZONTAL_ALIGNMENT_LEFT
		var prefix := "[제외 선택] " if _banish_mode else ("[%d] " % (i + 1))
		btn.text = "%s%s  (%s)\n%s" % [prefix, str(c["title"]), str(c["badge"]), str(c["desc"])]
		if bool(c.get("is_evo", false)):
			btn.modulate = Color("ffe68a")
		elif _banish_mode:
			btn.modulate = Color("ff9e9e")
		var idx: int = int(i)
		btn.pressed.connect(func(): _on_pick_card(idx))
		_level_cards_box.add_child(btn)
	_reroll_btn.text = "새로고침 (%d)" % sim.rerolls
	_reroll_btn.disabled = sim.rerolls <= 0
	_banish_btn.text = ("제외 취소" if _banish_mode else "스킬 제외 (%d)" % sim.banishes)
	_banish_btn.disabled = sim.banishes <= 0 and not _banish_mode


func _update_hud() -> void:
	if sim.player.is_empty():
		return
	_xp_bar.max_value = maxf(1.0, float(sim.player["need"]))
	_xp_bar.value = float(sim.player["xp"])
	_level_label.text = "Lv.%d" % int(sim.player["lv"])
	_timer_label.text = Data.format_time(sim.elapsed)
	_kills_label.text = "처치 %d" % int(sim.player["kills"])
	_gold_label.text = "%d G" % int(sim.player["gold"])

	var chips: PackedStringArray = []
	for wk in sim.owned_keys("weapon"):
		var label := str(Data.DEFINITIONS[wk]["short"])
		var evo := "*" if bool(sim.player["evolved"].get(wk, false)) else str(int(sim.player["levels"][wk]))
		chips.append("%s%s" % [label, evo])
	_loadout_label.text = "무기: " + (" ".join(chips))

	var boss: Dictionary = sim.active_boss()
	_boss_box.visible = not boss.is_empty()
	if not boss.is_empty():
		_boss_name_label.text = "%s (HP %d / %d)" % [str(Data.CHAPTERS[sim.chapter]["boss"]), int(ceilf(float(boss["hp"]))), int(ceilf(float(boss["max"])))]
		_boss_hp_bar.max_value = maxf(1.0, float(boss["max"]))
		_boss_hp_bar.value = maxf(0.0, float(boss["hp"]))

	_toast_label.visible = sim.toast_timer > 0.0 and not sim.toast_text.is_empty()
	_toast_label.text = sim.toast_text

	_dash_btn.disabled = sim.dash_cooldown > 0.0
	_dash_btn.text = "대시\n%.1fs" % sim.dash_cooldown if sim.dash_cooldown > 0.0 else "대시\n[Space]"
	var skill_name := str(Data.HEROES[sim.selected_hero]["skill"])
	_skill_btn.disabled = sim.hero_skill_cd > 0.0
	_skill_btn.text = "%s\n%.0fs" % [skill_name, sim.hero_skill_cd] if sim.hero_skill_cd > 0.0 else "%s\n[E]" % skill_name


func _refresh_result() -> void:
	var r: Dictionary = sim.last_result
	var win := bool(r.get("win", false))
	_result_title.text = "챕터 클리어!" if win else "전투 불능"
	_result_title.add_theme_color_override("font_color", Color("8ef2be") if win else Color("ff8c94"))
	_result_body.text = (
		"챕터: %s\n"
		+ "생존 시간: %s\n"
		+ "처치 수: %d\n"
		+ "도달 레벨: Lv.%d\n"
		+ "누적 피해량: %d\n"
		+ "무기 진화: %d회\n"
		+ "획득 골드: +%d G (클리어 보너스 +%d G)"
	) % [
		str(Data.CHAPTERS[sim.chapter]["name"]),
		Data.format_time(float(r.get("elapsed", sim.elapsed))),
		int(r.get("kills", 0)),
		int(r.get("level", 1)),
		int(r.get("damage", 0)),
		int(r.get("evolutions", 0)),
		int(r.get("base_gold", 0)),
		int(r.get("clear_gold", 0)),
	]
