extends Control
## Native Godot presentation, inputs and local save controls.
const World = preload("res://scripts/sim_world.gd")
const BattleView = preload("res://scripts/battle_view.gd")
const Minimap = preload("res://scripts/minimap.gd")
const VERSION = "v11 · GODOT PORT"
const SAVE_PATH = "user://nexus_front_v11.nfs"
const GOLD = Color("d9bd86")
const CYAN = Color("65dce4")
const MUTED = Color("8fa6b5")
const TEXT = Color("ecf1ed")
const BG = Color("08131e")
const PANEL = Color("0e2030")
var data = {}
var defs = {}
var world
var selected_hero = "lol_ahri"
var selected_scale = 1.0
var speed = 1.0
var difficulty = "training"
var paused = false
var game_screen: Control
var lobby: Control
var modal: Control
var battle
var minimap
var selected_portrait: TextureRect
var hero_title: Label
var hero_subtitle: Label
var hero_description: Label
var hero_passive: Label
var detail_skills: VBoxContainer
var hero_cards = {}
var map_buttons = []
var speed_buttons = []
var mode_buttons = []
var hud_title: Label
var hud_stats: Label
var hud_health: ProgressBar
var hud_mana: ProgressBar
var hud_health_text: Label
var hud_mana_text: Label
var hud_gold: Label
var hud_score: Label
var hud_clock: Label
var hud_event: Label
var hud_hint: Label
var hud_target: Label
var hud_skills = {}
var hud_upgrades = {}
var inventory_buttons = []
var action_buttons = {}
var pause_button: Button
var speed_selector: OptionButton
var toast_label: Label
var toast_timer = 0.0
var hud_timer = 0.0
var result_shown = false
var font: Font
var shop_detail: Label
var shop_gold: Label
var shop_items = {}
var shop_selected = ""
var _autosave_at = 0.0
var _modal_was_paused = false

func _ready():
	font = load("res://assets/NexusSansKR.otf")
	var ui_theme = Theme.new()
	ui_theme.default_font = font
	ui_theme.default_font_size = 15
	theme = ui_theme
	data = JSON.parse_string(FileAccess.get_file_as_string("res://data/restored_data.json"))
	for h in data.playableHeroes:
		defs[h.id] = h
	_load_settings()
	_build_lobby()
	_build_toast()
	set_physics_process(true)
	# Testable native launch for local QA; no network or browser runtime.
	for arg in OS.get_cmdline_user_args():
		if arg == "--smoke-match":
			_start_match()

func _draw():
	draw_rect(Rect2(Vector2.ZERO, size), BG)
	for x in range(0, 1700, 80):
		draw_line(Vector2(x, 0), Vector2(x - 540, 1000), Color("122638"), 1.0, true)
	for i in range(8):
		var radius = 160 + i * 58
		draw_arc(Vector2(1180, 370), radius, -2.5, 2.5, 60, Color(0.23, 0.42, 0.48, 0.07), 1.0, true)

func _build_lobby():
	lobby = Control.new()
	lobby.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(lobby)
	_label(lobby, "N / F", Rect2(40, 28, 140, 30), 24, GOLD)
	_label(lobby, "NEXUS FRONT", Rect2(40, 66, 800, 74), 55, TEXT)
	_label(lobby, "영웅을 선택하고, 전장의 흐름을 바꾸세요.", Rect2(42, 139, 850, 30), 18, MUTED)
	_label(lobby, VERSION, Rect2(1140, 34, 260, 26), 13, CYAN).horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_label(lobby, "01   CHAMPION SELECT", Rect2(42, 197, 400, 25), 13, GOLD)
	var index = 0
	for h in data.playableHeroes:
		var x = 40 + (index % 5) * 178
		var y = 238 + (index / 5) * 174
		var card = _button(lobby, "", Rect2(x, y, 162, 158), func(): _select_hero(h.id))
		var texture = TextureRect.new()
		texture.texture = load("res://" + h.portrait)
		texture.position = Vector2(8, 8)
		texture.size = Vector2(146, 106)
		texture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		texture.stretch_mode = TextureRect.STRETCH_SCALE
		texture.size = Vector2(128, 128)
		texture.scale = Vector2(146.0 / 128.0, 106.0 / 128.0)
		texture.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(texture)
		_label(card, h.name, Rect2(12, 119, 124, 24), 17, TEXT)
		_label(card, "%02d" % (index + 1), Rect2(129, 123, 23, 20), 11, MUTED)
		card.tooltip_text = h.name + " · " + h.role + "\n" + h.description
		hero_cards[h.id] = card
		index += 1
	var settings = _panel(lobby, Rect2(40, 618, 874, 212), Color("0d2030"), Color("234153"))
	_label(settings, "02   MATCH SETUP", Rect2(20, 13, 300, 25), 13, GOLD)
	_label(settings, "맵 크기", Rect2(20, 51, 120, 28), 15, MUTED)
	for i in 3:
		var value = [1.0, 1.5, 2.0][i]
		var b = _button(settings, "%s×" % _number(value), Rect2(137 + i * 78, 47, 68, 35), func(): _select_map(value))
		map_buttons.append(b)
	_label(settings, "게임 속도", Rect2(20, 100, 120, 28), 15, MUTED)
	for i in 4:
		var value = [0.5, 0.75, 1.0, 1.5][i]
		var b = _button(settings, "%s×" % _number(value), Rect2(137 + i * 78, 96, 68, 35), func(): _select_speed(value))
		speed_buttons.append(b)
	_label(settings, "모드", Rect2(495, 51, 72, 28), 15, MUTED)
	mode_buttons.append(_button(settings, "연습", Rect2(568, 47, 115, 35), func(): _select_mode("training")))
	mode_buttons.append(_button(settings, "일반", Rect2(696, 47, 115, 35), func(): _select_mode("standard")))
	_label(settings, "연습: 6레벨 · 2,500G로 시작\n일반: 1레벨 · 600G로 성장", Rect2(497, 97, 330, 55), 13, MUTED)
	_label(settings, "5 vs 5   /   3 LANES   /   SINGLE PLAYER + AI", Rect2(20, 168, 770, 25), 12, Color("75909f"))
	var detail = _panel(lobby, Rect2(950, 101, 450, 729), Color("102333"), Color("3c5663"))
	selected_portrait = TextureRect.new()
	selected_portrait.position = Vector2(24, 24)
	selected_portrait.size = Vector2(102, 102)
	selected_portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	selected_portrait.stretch_mode = TextureRect.STRETCH_SCALE
	selected_portrait.size = Vector2(128, 128)
	selected_portrait.scale = Vector2.ONE * (102.0 / 128.0)
	detail.add_child(selected_portrait)
	hero_title = _label(detail, "", Rect2(145, 25, 278, 48), 35, TEXT)
	hero_subtitle = _label(detail, "", Rect2(146, 77, 275, 45), 14, GOLD)
	hero_description = _label(detail, "", Rect2(25, 148, 399, 68), 16, MUTED)
	hero_description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hero_passive = _label(detail, "", Rect2(25, 225, 399, 53), 13, CYAN)
	hero_passive.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_skills = VBoxContainer.new()
	detail_skills.position = Vector2(25, 298)
	detail_skills.size = Vector2(398, 257)
	detail_skills.add_theme_constant_override("separation", 8)
	detail.add_child(detail_skills)
	_button(detail, "전장 진입   →", Rect2(25, 585, 399, 58), _start_match, true)
	var continue_button = _button(detail, "저장한 전투 계속", Rect2(25, 656, 250, 44), _load_match)
	continue_button.disabled = not FileAccess.file_exists(SAVE_PATH)
	_button(detail, "데이터 도감", Rect2(287, 656, 137, 44), _open_catalog)
	_label(lobby, "NATIVE GODOT EDITION", Rect2(42, 855, 380, 24), 12, CYAN)
	_label(lobby, "데이터 16.22.1  ·  영웅 10종 / 스킬 40개  ·  팬 프로젝트", Rect2(698, 855, 700, 24), 12, MUTED).horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_select_hero(selected_hero)
	_select_map(selected_scale)
	_select_speed(speed)
	_select_mode(difficulty)

func _select_hero(id):
	selected_hero = id
	var h = defs[id]
	for key in hero_cards:
		_set_button_active(hero_cards[key], key == id)
	selected_portrait.texture = load("res://" + h.portrait)
	hero_title.text = h.name
	hero_subtitle.text = h.title + "\n" + h.role
	hero_description.text = h.description
	hero_passive.text = "패시브 · " + h.passive.name + "\n" + h.passive.description
	for child in detail_skills.get_children():
		child.queue_free()
	for slot in ["q", "w", "e", "r"]:
		var skill = h.skills[slot]
		var row = HBoxContainer.new()
		row.custom_minimum_size = Vector2(395, 51)
		row.add_theme_constant_override("separation", 12)
		detail_skills.add_child(row)
		var key = Label.new()
		key.text = slot.to_upper()
		key.custom_minimum_size = Vector2(31, 48)
		key.add_theme_font_size_override("font_size", 23)
		key.add_theme_color_override("font_color", GOLD)
		row.add_child(key)
		var description = Label.new()
		description.text = skill.name + "\n" + skill.description
		description.add_theme_font_size_override("font_size", 12)
		description.add_theme_color_override("font_color", TEXT)
		description.custom_minimum_size = Vector2(348, 48)
		description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		row.add_child(description)
	_save_settings()

func _select_map(value):
	selected_scale = value
	for i in map_buttons.size():
		_set_button_active(map_buttons[i], [1.0, 1.5, 2.0][i] == value)
	_save_settings()
func _select_speed(value):
	speed = value
	for i in speed_buttons.size():
		_set_button_active(speed_buttons[i], [0.5, 0.75, 1.0, 1.5][i] == value)
	_save_settings()
func _select_mode(value):
	difficulty = value
	for i in mode_buttons.size():
		_set_button_active(mode_buttons[i], ["training", "standard"][i] == value)
	_save_settings()

func _start_match():
	_close_modal()
	_discard_world()
	world = World.new()
	world.setup({"hero_id": selected_hero, "map_scale": selected_scale, "difficulty": difficulty, "seed": 2601120})
	_enter_match()

func _enter_match():
	lobby.hide()
	if game_screen:
		game_screen.queue_free()
	_build_game_screen()
	paused = false
	result_shown = false
	_autosave_at = world.time
	_update_hud()
	_toast("전장에 진입했습니다. 우클릭 이동 · QWER 빠른 시전 · P 상점", 6)

func _build_game_screen():
	game_screen = Control.new()
	game_screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(game_screen)
	move_child(toast_label, -1)
	battle = BattleView.new()
	battle.position = Vector2(0, 70)
	battle.size = Vector2(1440, 650)
	game_screen.add_child(battle)
	battle.set_world(world)
	battle.ground_order.connect(func(p, attack):
		if not paused: world.command_move(p, attack))
	battle.target_order.connect(func(id):
		if not paused: world.command_attack(id))
	battle.cast_order.connect(_cast)
	battle.selection_changed.connect(func(_id): _update_hud())
	var top = _panel(game_screen, Rect2(0, 0, 1440, 70), BG, Color("264250"), 0)
	_label(top, "N / F", Rect2(22, 18, 86, 37), 26, GOLD)
	hud_score = _label(top, "0   :   0", Rect2(410, 15, 275, 38), 29, TEXT)
	hud_score.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud_clock = _label(top, "00:00", Rect2(708, 22, 100, 30), 20, GOLD)
	_label(top, "%s× MAP" % _number(world.map_scale), Rect2(129, 25, 140, 28), 13, MUTED)
	speed_selector = OptionButton.new()
	speed_selector.position = Vector2(940, 17)
	speed_selector.size = Vector2(111, 36)
	for value in [0.5, 0.75, 1.0, 1.5]:
		speed_selector.add_item("%s× 속도" % _number(value))
	speed_selector.select([0.5, 0.75, 1.0, 1.5].find(speed))
	speed_selector.item_selected.connect(func(i): _select_speed([0.5, 0.75, 1.0, 1.5][i]))
	top.add_child(speed_selector)
	pause_button = _button(top, "Ⅱ 일시 정지", Rect2(1062, 17, 132, 36), _toggle_pause)
	_button(top, "저장", Rect2(1206, 17, 76, 36), _save_match)
	_button(top, "메뉴", Rect2(1294, 17, 124, 36), _open_pause_menu)
	var bottom = _panel(game_screen, Rect2(0, 720, 1440, 180), BG, Color("33505b"), 0)
	var h = world.hero()
	var portrait = TextureRect.new()
	portrait.texture = load("res://" + defs[h.hero_id].portrait)
	portrait.position = Vector2(20, 20)
	portrait.size = Vector2(76, 76)
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.size = Vector2(128, 128)
	portrait.scale = Vector2.ONE * (76.0 / 128.0)
	bottom.add_child(portrait)
	hud_title = _label(bottom, "", Rect2(111, 15, 243, 32), 22, TEXT)
	hud_gold = _label(bottom, "", Rect2(21, 106, 285, 26), 17, GOLD)
	hud_health = _bar(bottom, Rect2(111, 53, 242, 18), Color("5aaf8d"))
	hud_mana = _bar(bottom, Rect2(111, 77, 242, 12), Color("578ab4"))
	hud_health_text = _label(bottom, "", Rect2(111, 50, 242, 22), 12, TEXT)
	hud_health_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud_mana_text = _label(bottom, "", Rect2(111, 75, 242, 18), 10, TEXT)
	hud_mana_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud_stats = _label(bottom, "", Rect2(20, 141, 337, 24), 12, MUTED)
	hud_skills.clear()
	hud_upgrades.clear()
	var i = 0
	for slot in ["q", "w", "e", "r"]:
		var button = _button(bottom, slot.to_upper(), Rect2(392 + i * 106, 20, 95, 89), func():
			if not paused:
				battle.aim_slot = slot if battle.aim_slot != slot else "")
		button.add_theme_font_size_override("font_size", 15)
		hud_skills[slot] = button
		var upgrade = _button(bottom, "+", Rect2(420 + i * 106, 117, 40, 25), func():
			if not paused and world.upgrade_skill(slot): _update_hud())
		hud_upgrades[slot] = upgrade
		i += 1
	_label(bottom, "Ctrl + Q / W / E / R  스킬 학습", Rect2(391, 149, 422, 21), 11, MUTED)
	_button(bottom, "B  귀환", Rect2(842, 21, 99, 41), func():
		if not paused:
			world.recall())
	_button(bottom, "4  와드", Rect2(842, 71, 99, 41), _place_ward)
	_button(bottom, "P  상점", Rect2(842, 121, 99, 41), _open_shop, true)
	inventory_buttons.clear()
	for j in 6:
		var b = _button(bottom, "·", Rect2(966 + (j % 3) * 58, 20 + (j / 3) * 57, 51, 50), func(): _open_shop())
		b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		b.expand_icon = true
		inventory_buttons.append(b)
	_label(bottom, "보유 아이템 · 6칸", Rect2(965, 141, 180, 24), 11, MUTED)
	_button(bottom, "Space  카메라", Rect2(1191, 121, 225, 40), func(): battle.follow = true)
	action_buttons.clear()
	action_buttons["d"] = _button(bottom, "D  점멸", Rect2(1191, 20, 107, 43), func():
		if not paused: battle.aim_slot = "d")
	action_buttons["f"] = _button(bottom, "F  회복", Rect2(1309, 20, 107, 43), func():
		if not paused: _cast("f", world.hero().pos))
	hud_hint = _label(bottom, "우클릭 이동·공격 · QWER 시전\nA 공격 이동 · S 정지", Rect2(1195, 77, 231, 39), 12, MUTED)
	var mini_panel = _panel(game_screen, Rect2(1188, 81, 238, 263), Color("081822ee"), Color("365460"))
	_label(mini_panel, "TACTICAL MAP", Rect2(10, 6, 220, 20), 11, GOLD)
	minimap = Minimap.new()
	minimap.position = Vector2(9, 34)
	minimap.size = Vector2(220, 220)
	minimap.world = world
	minimap.camera_view = battle
	minimap.camera_requested.connect(func(p): battle.focus_camera(p))
	mini_panel.add_child(minimap)
	hud_event = _label(game_screen, "", Rect2(20, 667, 1115, 37), 14, Color("e8c78f"))
	var target_panel = _panel(game_screen, Rect2(1188, 354, 238, 170), Color("081822e8"), Color("264250"))
	hud_target = _label(target_panel, "", Rect2(10, 10, 220, 149), 13, MUTED)
	hud_target.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

func _physics_process(dt):
	if world == null or game_screen == null or not game_screen.visible:
		return
	if not paused and world.winner < 0:
		world.step(dt * speed)
		if world.time - _autosave_at > 60:
			world.save_game(SAVE_PATH)
			_autosave_at = world.time
	hud_timer += dt
	if hud_timer >= 0.1:
		hud_timer = 0.0
		_update_hud()
	if world.winner >= 0 and not result_shown:
		result_shown = true
		_show_result()

func _process(dt):
	if toast_timer > 0:
		toast_timer -= dt
		toast_label.visible = toast_timer > 0

func _update_hud():
	if world == null or hud_title == null:
		return
	var h = world.hero()
	hud_title.text = "%s   Lv.%d" % [h.name, h.level]
	hud_health.max_value = h.max_hp
	hud_health.value = h.hp
	hud_mana.max_value = maxf(1, h.max_mp)
	hud_mana.value = h.mp
	hud_health_text.text = "%d / %d" % [h.hp, h.max_hp]
	hud_mana_text.text = "%d / %d" % [h.mp, h.max_mp] if h.max_mp > 0 else "자원 없음"
	hud_gold.text = "%s G    %d / %d / %d    CS %d" % [_commas(h.gold), h.kills, h.deaths, h.assists, h.cs]
	hud_stats.text = "AD %d   AP %d   방어 %d   마저 %d   이동 %d" % [h.damage, h.ap, h.armor, h.mr, h.speed]
	hud_score.text = "%d   :   %d" % [world.team_kills[0], world.team_kills[1]]
	hud_clock.text = "%02d:%02d" % [int(world.time) / 60, int(world.time) % 60]
	for slot in hud_skills:
		var desc = world.abilities.describe(h, slot)
		var cooldown = float(desc.get("remaining", 0))
		var state_text = ("재시전 %d · %.1fs" % [desc.get("charges", 0), cooldown]) if desc.get("phase", "") == "recast" else (("충전 %d" % desc.charges) if desc.get("charges", -1) >= 0 else (("%.1fs" % cooldown) if cooldown > 0 else ("%d MP" % desc.get("cost", 0))))
		if h.skills[slot] == 0: state_text = "미학습"
		var text = "%s  %s\n%s\n%s" % [slot.to_upper(), "●".repeat(int(h.skills[slot])), desc.get("name", ""), state_text]
		hud_skills[slot].text = text
		hud_skills[slot].tooltip_text = desc.get("description", "") + "\n" + desc.get("disabled_reason", "") + "\n재사용 %.1fs · 거리 %d" % [desc.get("cooldown", 0), desc.get("range", 0)]
		hud_skills[slot].modulate = Color(0.65, 0.7, 0.78) if not desc.get("ready", false) else Color.WHITE
		_set_button_active(hud_skills[slot], battle.aim_slot == slot)
		hud_upgrades[slot].visible = h.skill_points > 0
		hud_upgrades[slot].tooltip_text = "%s 학습 · 남은 포인트 %d" % [slot.to_upper(), h.skill_points]
	for action in action_buttons:
		var cd = float(h.cds.get(action, 0))
		action_buttons[action].text = ("D  점멸" if action == "d" else "F  회복") + (" %.0fs" % cd if cd > 0 else "")
		action_buttons[action].modulate = Color(0.6, 0.7, 0.75) if cd > 0 else Color.WHITE
	for i in 6:
		var b = inventory_buttons[i]
		if i < h.inventory.size():
			var item = world.item_defs.get(h.inventory[i], {})
			b.icon = load("res://" + item.portrait) if item.has("portrait") else null
			b.text = ""
			b.tooltip_text = item.get("name", "") + "\n" + item.get("description", "")
		else:
			b.icon = null
			b.text = "·"
			b.tooltip_text = "빈 아이템 슬롯"
	if not world.events.is_empty():
		var event = world.events.back()
		hud_event.text = str(event.get("message", event.get("text", "")))
	else:
		hud_event.text = "미니언과 함께 전진하고 적 넥서스를 파괴하세요."
	if not h.alive:
		hud_event.text = "전사했습니다.  %.1f초 후 부활" % maxf(0, h.respawn_at - world.time)
	elif h.get("recall_until", 0) > world.time:
		hud_event.text = "귀환 중  %.1f초  ·  이동 또는 피해를 받으면 취소됩니다." % (h.recall_until - world.time)
	var target = world.unit(battle.selected_id)
	if not target.is_empty() and world.visible_to(target, 0):
		hud_target.text = "선택한 대상\n%s\n체력 %d / %d\n방어 %d · 마저 %d" % [target.get("name", target.kind), target.hp, target.max_hp, target.armor, target.mr]
	else:
		hud_target.text = "시야 규칙\n벽과 언덕이 시야를 가립니다.\n\n흐린 건물은 마지막 관측 상태입니다. 다시 확인하면 갱신됩니다."
	pause_button.text = "▶ 계속" if paused else "Ⅱ 일시 정지"
	if shop_gold != null and is_instance_valid(shop_gold) and modal != null:
		shop_gold.text = "보유 %s G   ·   %s" % [_commas(h.gold), "구매 가능" if world.can_shop() else "아군 기지에서 구매 가능"]

func _cast(slot: String, position_value: Vector2, target: int = -1):
	if paused or world == null:
		return
	if not world.cast(slot, position_value, target):
		_toast("시전 조건을 확인하세요: 학습, 자원, 재사용 대기, 사거리 또는 대상", 2.2)
	_update_hud()

func _unhandled_key_input(event):
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	if event.keycode == KEY_ESCAPE:
		if modal != null:
			_close_modal()
		elif world != null and game_screen != null and game_screen.visible:
			if not battle.aim_slot.is_empty():
				battle.aim_slot = ""
			else:
				_open_pause_menu()
		get_viewport().set_input_as_handled()
		return
	if world == null or game_screen == null or not game_screen.visible:
		return
	if event.keycode == KEY_P:
		if modal != null: _close_modal()
		else: _open_shop()
	elif event.keycode == KEY_F5:
		_save_match()
	elif event.keycode == KEY_F9:
		_load_match()
	elif event.keycode == KEY_SPACE:
		battle.follow = true
	elif event.keycode == KEY_F10:
		_toggle_pause()
	elif modal == null and not paused:
		var keys = {KEY_Q: "q", KEY_W: "w", KEY_E: "e", KEY_R: "r"}
		if keys.has(event.keycode):
			var slot = keys[event.keycode]
			if event.ctrl_pressed:
				world.upgrade_skill(slot)
			elif event.shift_pressed:
				battle.aim_slot = slot
			else:
				var pos = battle.screen_to_world(battle.get_local_mouse_position())
				var ally = world.abilities.describe(world.hero(), slot).get("target", "") == "ally"
				_cast(slot, pos, battle.pick_target(pos, ally))
		elif event.keycode == KEY_D:
			_cast("d", battle.screen_to_world(battle.get_local_mouse_position()))
		elif event.keycode == KEY_F:
			_cast("f", world.hero().pos)
		elif event.keycode == KEY_A:
			battle.attack_move_mode = true
			_toast("공격 이동: 목적지를 좌클릭하세요.", 2)
		elif event.keycode == KEY_S:
			world.stop_player()
		elif event.keycode == KEY_B:
			world.recall()
		elif event.keycode == KEY_4:
			_place_ward()
		elif event.keycode == KEY_V:
			battle.show_ranges = not battle.show_ranges
	get_viewport().set_input_as_handled()

func _place_ward():
	if world == null or paused:
		return
	var target = battle.screen_to_world(battle.get_local_mouse_position())
	if not world.place_ward(target):
		_toast("와드 설치 조건 또는 사거리를 확인하세요.")

func _toggle_pause():
	paused = not paused
	_update_hud()

func _save_match():
	if world == null:
		return
	var result = world.save_game(SAVE_PATH)
	_toast("전투를 저장했습니다. F9로 이어서 진행할 수 있습니다." if result == OK else "저장 실패: %s" % error_string(result))

func _load_match():
	var candidate = World.new()
	var result = candidate.load_game(SAVE_PATH)
	if result != OK:
		candidate.dispose()
		_toast("저장 파일을 불러오지 못했습니다: " + error_string(result))
		return
	_close_modal()
	_discard_world()
	world = candidate
	selected_hero = world.hero().hero_id
	_enter_match()
	_toast("전투를 불러왔습니다. 스킬·시야·건물 관측 상태가 복원되었습니다.", 4)

func _open_pause_menu():
	var box = _modal_box("전투 메뉴", Vector2(540, 490))
	_label(box, "현재 전투가 일시 정지되었습니다.", Rect2(28, 72, 480, 32), 16, MUTED)
	_button(box, "전투 계속", Rect2(28, 127, 484, 51), func():
		_close_modal()
		paused = false, true)
	_button(box, "현재 전투 저장  ·  F5", Rect2(28, 191, 484, 44), _save_match)
	_button(box, "저장한 전투 불러오기  ·  F9", Rect2(28, 248, 484, 44), _load_match)
	_button(box, "영웅 / 아이템 데이터 도감", Rect2(28, 305, 484, 44), _open_catalog)
	_button(box, "전투 저장 후 영웅 선택으로", Rect2(28, 388, 484, 48), _return_lobby)

func _return_lobby():
	if world != null:
		world.save_game(SAVE_PATH)
	_close_modal()
	paused = true
	if game_screen:
		game_screen.queue_free()
		game_screen = null
	_discard_world()
	world = null
	lobby.queue_free()
	_build_lobby()
	move_child(toast_label, -1)

func _open_shop():
	if world == null:
		return
	var box = _modal_box("아이템 상점", Vector2(1040, 680))
	shop_gold = _label(box, "", Rect2(28, 66, 984, 29), 17, GOLD)
	_label(box, "부품을 보유하면 조합 비용만 지불합니다. 구매·판매는 아군 기지에서 가능합니다.", Rect2(28, 104, 975, 30), 13, MUTED)
	shop_items.clear()
	for i in data.shopItems.size():
		var item = data.shopItems[i]
		var b = _button(box, item.name + "\n" + str(item.cost) + " G", Rect2(28 + (i % 5) * 140, 151 + (i / 5) * 79, 130, 70), func(): _shop_select(item.id))
		b.add_theme_font_size_override("font_size", 12)
		shop_items[item.id] = b
	shop_detail = _label(box, "아이템을 선택하세요.", Rect2(756, 150, 254, 265), 16, TEXT)
	shop_detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_button(box, "구매 / 조합", Rect2(756, 436, 254, 48), _shop_buy, true)
	_label(box, "판매할 보유 아이템", Rect2(28, 566, 650, 26), 13, GOLD)
	for j in world.hero().inventory.size():
		var item_id = world.hero().inventory[j]
		var item = world.item_defs[item_id]
		_button(box, "%s\n+%d G" % [item.name, item.sell], Rect2(28 + j * 160, 604, 149, 52), func():
			if world.sell_item(j):
				_open_shop()
			else:
				_toast("아이템 판매는 아군 기지에서 가능합니다."))
	_update_hud()

func _shop_select(id):
	shop_selected = id
	for key in shop_items:
		_set_button_active(shop_items[key], key == id)
	var item = world.item_defs[id]
	var quote = world.shop_quote(id)
	shop_detail.text = "%s\n\n%s\n\n총 가격: %d G\n현재 필요: %d G\n판매: %d G" % [item.name, item.description, item.cost, quote.get("cost", quote.get("price", item.cost)), item.sell]

func _shop_buy():
	if shop_selected.is_empty():
		return
	if world.buy_item(shop_selected):
		_toast("아이템을 구매했습니다.")
		_open_shop()
		_shop_select(shop_selected)
	else:
		_toast("구매 조건을 확인하세요: 기지, 골드, 인벤토리 또는 고유 아이템 제한")

func _open_catalog():
	var box = _modal_box("복원 데이터 도감", Vector2(1070, 705))
	_label(box, "16.22.1  ·  영웅 173종 / QWER 692개 / 아이템 863개  ·  플레이 가능 영웅 10종", Rect2(25, 68, 1020, 30), 14, GOLD)
	var search = LineEdit.new()
	search.placeholder_text = "이름 또는 영문명 검색"
	search.position = Vector2(25, 117)
	search.size = Vector2(350, 43)
	box.add_child(search)
	var types = OptionButton.new()
	types.position = Vector2(389, 117)
	types.size = Vector2(180, 43)
	types.add_item("영웅")
	types.add_item("아이템")
	box.add_child(types)
	var list = ItemList.new()
	list.position = Vector2(25, 178)
	list.size = Vector2(350, 494)
	box.add_child(list)
	var detail = RichTextLabel.new()
	detail.position = Vector2(402, 178)
	detail.size = Vector2(641, 494)
	detail.bbcode_enabled = true
	detail.add_theme_font_size_override("normal_font_size", 15)
	box.add_child(detail)
	var rows = []
	var fill = func():
		list.clear()
		rows.clear()
		var entries = data.champions if types.selected == 0 else data.items
		var needle = search.text.to_lower()
		for entry in entries:
			var hay = str(entry.get("name", "")) + " " + str(entry.get("nameEn", "")) + " " + str(entry.get("key", entry.get("id", "")))
			if needle.is_empty() or needle in hay.to_lower():
				rows.append(entry)
				list.add_item(str(entry.get("name", "")) + ("  • 구현" if entry.get("playableId", null) != null else ""))
		if not rows.is_empty():
			list.select(0)
			list.item_selected.emit(0)
	list.item_selected.connect(func(i):
		if i >= rows.size(): return
		var row = rows[i]
		var text = "[color=#d9bd86][font_size=27]%s[/font_size][/color]\n%s\n\n" % [row.get("name", ""), row.get("nameEn", row.get("key", ""))]
		if types.selected == 0:
			text += "패시브: %s\n\n" % row.get("passiveName", "")
			for skill in row.get("spells", []):
				text += "[color=#65dce4]%s · %s[/color]\n재사용: %s\n소모: %s\n원작 거리: %s\n\n" % [str(skill.slot).to_upper(), skill.name, str(skill.cooldownByRank), str(skill.costByRank), str(skill.rangeByRank)]
			text += "기본 능력치\n" + JSON.stringify(row.get("stats", {}), "  ")
		else:
			text += str(row.get("description", "")) + "\n\n" + JSON.stringify(row.get("gold", {}), "  ")
		text += "\n\n[color=#8fa6b5]출처: " + str(row.get("source", "Riot Data Dragon 16.22.1")) + "\n공식 정적 데이터와 프로젝트 재구성 전투 로직은 구분됩니다.[/color]"
		detail.text = text)
	search.text_changed.connect(func(_text): fill.call())
	types.item_selected.connect(func(_index): fill.call())
	fill.call()

func _show_result():
	paused = true
	var h = world.hero()
	var box = _modal_box("VICTORY" if world.winner == 0 else "DEFEAT", Vector2(640, 472))
	_label(box, "넥서스가 파괴되어 전투가 종료되었습니다.", Rect2(30, 84, 580, 40), 19, TEXT)
	_label(box, "%s   %d / %d / %d\nCS %d  ·  %02d:%02d  ·  %s× 맵" % [h.name, h.kills, h.deaths, h.assists, h.cs, int(world.time) / 60, int(world.time) % 60, _number(world.map_scale)], Rect2(30, 153, 580, 100), 23, GOLD)
	_button(box, "다시 플레이", Rect2(30, 309, 580, 54), _start_match, true)
	_button(box, "영웅 선택으로", Rect2(30, 382, 580, 48), _return_lobby)

func _modal_box(title: String, box_size: Vector2):
	_close_modal()
	_modal_was_paused = paused
	if world != null:
		paused = true
	modal = Control.new()
	modal.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(modal)
	var shade = ColorRect.new()
	shade.color = Color(0.015, 0.035, 0.055, 0.9)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	modal.add_child(shade)
	var box = _panel(modal, Rect2((Vector2(1440, 900) - box_size) * 0.5, box_size), PANEL, Color("567078"), 12)
	_label(box, title, Rect2(26, 20, box_size.x - 100, 40), 27, TEXT)
	_button(box, "×", Rect2(box_size.x - 58, 19, 35, 34), _close_modal)
	move_child(toast_label, -1)
	return box

func _close_modal():
	if modal != null:
		modal.queue_free()
		modal = null
		paused = _modal_was_paused
	shop_gold = null
	shop_detail = null

func _build_toast():
	toast_label = Label.new()
	toast_label.position = Vector2(160, 665)
	toast_label.size = Vector2(1030, 42)
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	toast_label.add_theme_stylebox_override("normal", _style(Color("163241"), Color("55737e"), 8))
	toast_label.add_theme_color_override("font_color", TEXT)
	toast_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toast_label.visible = false
	add_child(toast_label)
func _toast(message: String, duration: float = 3.0):
	if toast_label == null: return
	toast_label.text = message
	toast_label.visible = true
	toast_timer = duration
	move_child(toast_label, -1)

func _load_settings():
	var cfg = ConfigFile.new()
	if cfg.load("user://nexus_front_settings.cfg") == OK:
		var id = str(cfg.get_value("setup", "hero", "lol_ahri"))
		if defs.has(id): selected_hero = id
		var scale_value = float(cfg.get_value("setup", "scale", 1.0))
		if scale_value in [1.0, 1.5, 2.0]: selected_scale = scale_value
		var speed_value = float(cfg.get_value("setup", "speed", 1.0))
		if speed_value in [0.5, 0.75, 1.0, 1.5]: speed = speed_value
		var mode = str(cfg.get_value("setup", "mode", "training"))
		if mode in ["training", "standard"]: difficulty = mode
func _save_settings():
	var cfg = ConfigFile.new()
	cfg.set_value("setup", "hero", selected_hero)
	cfg.set_value("setup", "scale", selected_scale)
	cfg.set_value("setup", "speed", speed)
	cfg.set_value("setup", "mode", difficulty)
	cfg.save("user://nexus_front_settings.cfg")

func _style(color: Color, border: Color, radius: int = 7):
	var s = StyleBoxFlat.new()
	s.bg_color = color
	s.border_color = border
	s.set_border_width_all(1)
	s.set_corner_radius_all(radius)
	s.content_margin_left = 10
	s.content_margin_right = 10
	return s
func _panel(parent, rect: Rect2, color: Color, border: Color, radius: int = 8):
	var p = Panel.new()
	p.position = rect.position
	p.size = rect.size
	p.add_theme_stylebox_override("panel", _style(color, border, radius))
	parent.add_child(p)
	return p
func _label(parent, text: String, rect: Rect2, font_size: int = 15, color: Color = TEXT):
	var l = Label.new()
	l.position = rect.position
	l.size = rect.size
	l.text = text
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(l)
	return l
func _button(parent, text: String, rect: Rect2, action: Callable, primary: bool = false):
	var b = Button.new()
	b.position = rect.position
	b.size = rect.size
	b.text = text
	b.add_theme_font_size_override("font_size", 15)
	b.add_theme_color_override("font_color", Color("10212b") if primary else TEXT)
	b.add_theme_stylebox_override("normal", _style(GOLD if primary else Color("142b3b"), Color("d9bd86") if primary else Color("365366")))
	b.add_theme_stylebox_override("hover", _style(Color("edcf91") if primary else Color("254451"), GOLD))
	b.add_theme_stylebox_override("pressed", _style(Color("bc9f6a") if primary else Color("1c3d49"), GOLD))
	b.add_theme_stylebox_override("focus", _style(Color(0,0,0,0), CYAN))
	b.add_theme_stylebox_override("disabled", _style(Color("13202d"), Color("243542")))
	b.focus_mode = Control.FOCUS_NONE
	b.pressed.connect(action)
	parent.add_child(b)
	return b
func _set_button_active(button, active: bool):
	button.add_theme_stylebox_override("normal", _style(Color("28434c") if active else Color("142b3b"), GOLD if active else Color("365366")))
	button.add_theme_color_override("font_color", GOLD if active else TEXT)
func _bar(parent, rect: Rect2, color: Color):
	var bar = ProgressBar.new()
	bar.position = rect.position
	bar.size = rect.size
	bar.show_percentage = false
	bar.add_theme_stylebox_override("background", _style(Color("20313c"), Color("20313c"), 2))
	bar.add_theme_stylebox_override("fill", _style(color, color, 2))
	parent.add_child(bar)
	return bar
func _number(value) -> String:
	return str(value) if float(value) != int(value) else str(int(value))
func _commas(value) -> String:
	var s = str(int(value))
	var out = ""
	for i in s.length():
		if i > 0 and (s.length() - i) % 3 == 0: out += ","
		out += s[i]
	return out

func _exit_tree():
	_discard_world()

func _discard_world():
	if battle != null and is_instance_valid(battle):
		battle.detach_world()
	if minimap != null and is_instance_valid(minimap):
		minimap.world = null
	if game_screen != null and is_instance_valid(game_screen):
		game_screen.process_mode = Node.PROCESS_MODE_DISABLED
		game_screen.hide()
	if world != null:
		world.dispose()
		world = null
