extends Node3D

## Native scene controller. All gameplay stays in the ported GameSimulation.
const Simulation = preload("res://scripts/simulation.gd")
const Renderer = preload("res://scripts/world_renderer.gd")
const Data = preload("res://scripts/data.gd")
const Meta = preload("res://scripts/meta.gd")
const Audio = preload("res://scripts/audio.gd")
const MapView = preload("res://scripts/map_view.gd")
const PROFILE_PATH = "user://megabonk-wildrun-profile-v1.json"
const ACCENT = Color("e4f875")
const INK = Color("ecf1df")
const MUTED = Color("a9bdab")
const DARK = Color("142b22")
const RARITY = {"Common":Color("bbcea3"),"Uncommon":Color("9ee49c"),"Rare":Color("8fcfea"),"Epic":Color("c2a2f2"),"Legendary":Color("f7cf77")}
var catalog: Dictionary
var profile: Dictionary
var sim
var world
var sound
var ui: Control
var menu: Control
var hud: Control
var modal: Control
var modal_kind = ""
var modal_box: VBoxContainer
var refs = {}
var character_buttons = {}
var map_buttons = {}
var tier_buttons = []
var mode_buttons = []
var duration_buttons = []
var character_id = "SirOofie"
var map_id = "Forest"
var mode = "expedition"
var tier = 3
var duration = 360
var phase_seen = ""
var result_saved = false
var map_was_playing = false
var result_reward = 0
var result_record = false
var ui_clock = 0.0
var banner_time = 0.0
var toast_time = 0.0
var touch = {"x":0.0,"z":0.0,"jump":false,"dash":false,"slide":false,"interact":false}
var touch_index = -1
var look_index = -1
var right_drag = false
var touch_center = Vector2.ZERO
var touch_point = Vector2.ZERO
var textures = {}
var codex_kind = "weapons"
var codex_query = ""
var modal_previous = ""
var save_error = ""
var last_viewport_size = Vector2.ZERO
var damage_flash_time = 0.0
var inventory_signature = ""
var ui_font: Font
var ui_bold_font: Font

func _install_ui_font() -> void:
	var sys_font = SystemFont.new()
	sys_font.font_names = PackedStringArray(["Noto Sans CJK KR","Malgun Gothic","Apple SD Gothic Neo","Noto Sans","sans-serif"])
	var bundled: FontFile = null
	if FileAccess.file_exists("res://assets/fonts/megabonk-ui.txt"):
		var raw = FileAccess.get_file_as_string("res://assets/fonts/megabonk-ui.txt").strip_edges()
		if not raw.is_empty():
			bundled = FontFile.new()
			bundled.data = Marshalls.base64_to_raw(raw)
			if not OS.has_feature("web"):
				bundled.fallbacks = [sys_font]
	ui_font = bundled if bundled != null else sys_font
	ThemeDB.fallback_font = ui_font
	if bundled != null:
		var bold_var = FontVariation.new()
		bold_var.base_font = bundled
		bold_var.variation_embolden = 0.65
		ui_bold_font = bold_var
	else:
		var bold_sys = SystemFont.new()
		bold_sys.font_names = sys_font.font_names
		bold_sys.font_weight = 800
		ui_bold_font = bold_sys

func _ready():
	if get_tree() != null and get_tree().root != null:
		get_tree().root.set_meta("playhub_native_touch_controls", true)
	_install_ui_font()
	catalog = Data.get_data()
	profile = _load_profile()
	_setup_inputs()
	sound = Audio.new()
	add_child(sound)
	sound.enabled = profile.settings.sound
	sound.volume = profile.settings.volume
	world = Renderer.new()
	add_child(world)
	var layer = CanvasLayer.new()
	add_child(layer)
	ui = Control.new()
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.theme = _make_theme()
	layer.add_child(ui)
	_build_menu()
	_build_hud()
	get_window().focus_exited.connect(_focus_lost)
	get_viewport().size_changed.connect(func(): _layout.call_deferred())
	_show_menu()
	_layout()
	print("MEGABONK_NATIVE_READY | source=8dc09d21ece0aad9e7b0f8965a0655ae6dc6d58f | runtime=GDScript")

func _load_profile():
	var value = {"bestTime":0.0,"bestKills":0,"wins":0,"runs":0,"settings":{"sound":true,"volume":0.35,"quality":"high","touch":false}}
	if FileAccess.file_exists(PROFILE_PATH):
		var saved = JSON.parse_string(FileAccess.get_file_as_string(PROFILE_PATH))
		if saved is Dictionary:
			var settings = value.settings.duplicate()
			if saved.get("settings") is Dictionary:
				settings.merge(saved.settings,true)
			value.merge(saved,true)
			value.settings = settings
	for key in ["bestTime","bestKills","wins","runs"]:
		value[key] = maxf(0,float(value.get(key,0))) if (value.get(key) is float or value.get(key) is int) else 0
	value.settings.volume = clampf(float(value.settings.get("volume",0.35)),0.0,1.0)
	return Meta.normalizeMeta(value)

func _save_profile():
	var file = FileAccess.open(PROFILE_PATH,FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(profile,"\t"))
		save_error = ""
	else:
		save_error = "기록을 저장하지 못했습니다. 저장 폴더 권한을 확인하세요."
		_toast(save_error)

func _setup_inputs():
	var actions = {"move_left":[KEY_A,KEY_LEFT],"move_right":[KEY_D,KEY_RIGHT],"move_forward":[KEY_W,KEY_UP],"move_back":[KEY_S,KEY_DOWN],"jump":[KEY_SPACE],"slide":[KEY_C,KEY_CTRL],"dash":[KEY_SHIFT],"interact":[KEY_E]}
	for action in actions:
		if not InputMap.has_action(action): InputMap.add_action(action)
		for key in actions[action]:
			var event = InputEventKey.new()
			event.physical_keycode = key
			InputMap.action_add_event(action,event)

func _make_theme():
	var theme = Theme.new()
	if ui_font == null:
		_install_ui_font()
	theme.default_font = ui_font
	theme.default_font_size = 16
	theme.set_color("font_shadow_color","Label",Color(0.025,0.07,0.04,0.85))
	theme.set_constant("shadow_offset_x","Label",1)
	theme.set_constant("shadow_offset_y","Label",2)
	theme.set_constant("shadow_outline_size","Label",2)
	for node_type in ["Label","Button","CheckButton","OptionButton","LineEdit","RichTextLabel"]:
		theme.set_color("font_color",node_type,INK)
		theme.set_color("font_hover_color",node_type,ACCENT)
		theme.set_color("font_pressed_color",node_type,ACCENT)
		theme.set_color("font_disabled_color",node_type,Color("758878"))
	for node_type in ["Button","OptionButton"]:
		theme.set_stylebox("normal",node_type,_style(Color("213c2e"),Color("3b5742"),10,10))
		theme.set_stylebox("hover",node_type,_style(Color("2c4935"),Color("c1d76d"),10,10))
		theme.set_stylebox("pressed",node_type,_style(Color("344c2c"),ACCENT,10,10))
		theme.set_stylebox("disabled",node_type,_style(Color("1c2f25"),Color("304538"),10,10))
		theme.set_stylebox("focus",node_type,_style(Color(0,0,0,0),ACCENT,10,0))
	theme.set_stylebox("normal","LineEdit",_style(Color("11251d"),Color("49614b"),8,10))
	theme.set_stylebox("focus","LineEdit",_style(Color("11251d"),ACCENT,8,10))
	theme.set_color("font_placeholder_color","LineEdit",MUTED)
	theme.set_stylebox("background","ProgressBar",_style(Color("2b3d2b"),Color.TRANSPARENT,4,0))
	theme.set_stylebox("fill","ProgressBar",_style(ACCENT,Color.TRANSPARENT,4,0))
	theme.set_stylebox("panel","PanelContainer",_style(Color(0.055,0.12,0.09,0.96),Color("36523c"),18,20))
	return theme

func _style(bg: Color,border: Color=Color.TRANSPARENT,radius=10,margin=0):
	var style = StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.set_border_width_all(1 if border.a>0 else 0)
	style.set_corner_radius_all(radius)
	style.content_margin_left = margin
	style.content_margin_right = margin
	style.content_margin_top = margin
	style.content_margin_bottom = margin
	return style

func _label(text="",font_size=16,color=INK,wrap=false):
	var label = Label.new()
	label.text = str(text)
	label.add_theme_font_size_override("font_size",font_size)
	label.add_theme_color_override("font_color",color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if font_size>=24 and ui_bold_font != null:
		label.add_theme_font_override("font",ui_bold_font)
	if wrap: label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return label

func _button(text,callback,primary=false):
	var button = Button.new()
	button.text = text
	button.custom_minimum_size.y = 40
	button.pressed.connect(callback)
	button.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	if primary:
		button.add_theme_stylebox_override("normal",_style(ACCENT,ACCENT,10,12))
		button.add_theme_stylebox_override("hover",_style(Color("f0ff9c"),INK,10,12))
		button.add_theme_stylebox_override("pressed",_style(Color("bbd35d"),ACCENT,10,12))
		button.add_theme_color_override("font_color",DARK)
		button.add_theme_color_override("font_hover_color",DARK)
		button.add_theme_color_override("font_pressed_color",DARK)
	return button

func _hbox(parent,separation=10):
	var box = HBoxContainer.new()
	box.add_theme_constant_override("separation",separation)
	parent.add_child(box)
	return box

func _vbox(parent,separation=10):
	var box = VBoxContainer.new()
	box.add_theme_constant_override("separation",separation)
	parent.add_child(box)
	return box

func _texture(path):
	if not textures.has(path): textures[path] = load(path)
	return textures[path]

func _icon(key):
	return _texture(Data.icon_path(str(key)))

func _build_menu():
	menu = Control.new()
	menu.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	menu.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(menu)
	refs.logo = _label("MEGABONK",49,ACCENT)
	menu.add_child(refs.logo)
	refs.edition = _label("WILDRUN EXPEDITION  /  NATIVE GDSCRIPT",13,INK)
	menu.add_child(refs.edition)
	refs.best = _label("첫 모험을 시작하세요",14,MUTED)
	menu.add_child(refs.best)
	var top_actions = _hbox(menu,8)
	refs.top_actions = top_actions
	refs.silver = _button("은화 0  ·  강화",_open_shop)
	top_actions.add_child(refs.silver)
	top_actions.add_child(_button("설정",func(): _open_settings("menu")))
	var panel = PanelContainer.new()
	refs.menu_panel = panel
	menu.add_child(panel)
	var body = _vbox(panel,12)
	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(scroll)
	var inner = _vbox(scroll,10)
	inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var section = _hbox(inner)
	var section_label = _label("모험가 선택",15,INK)
	section_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	section.add_child(section_label)
	section.add_child(_label("15명의 모험가",12,MUTED))
	var grid = GridContainer.new()
	grid.columns = 5
	grid.add_theme_constant_override("h_separation",7)
	grid.add_theme_constant_override("v_separation",7)
	inner.add_child(grid)
	for character in catalog.CHARACTERS:
		var id = character.id
		var button = _button("",func(): _select_character(id))
		button.custom_minimum_size = Vector2(82,80)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.tooltip_text = character.name+" · "+character.title
		var box = VBoxContainer.new()
		box.mouse_filter = Control.MOUSE_FILTER_IGNORE
		box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		box.offset_top = 4
		box.add_theme_constant_override("separation",0)
		button.add_child(box)
		var portrait = TextureRect.new()
		portrait.texture = _texture("res://assets/portraits/%s.svg" % id)
		portrait.custom_minimum_size = Vector2(52,52)
		portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
		box.add_child(portrait)
		var name_label = _label(character.name,11)
		name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		box.add_child(name_label)
		grid.add_child(button)
		character_buttons[id] = button
	refs.character_name = _label("",24,ACCENT)
	inner.add_child(refs.character_name)
	refs.character_description = _label("",13,MUTED,true)
	inner.add_child(refs.character_description)
	refs.starting_weapon = _label("",14)
	inner.add_child(refs.starting_weapon)
	inner.add_child(_label("탐험 지역",14,MUTED))
	var maps = _hbox(inner,7)
	for map_record in catalog.MAPS:
		var id = map_record.id
		var b = _button(map_record.name,func(): _select_map(id))
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		maps.add_child(b)
		map_buttons[id] = b
	var modes = _hbox(inner,7)
	for config in [["expedition","원작 흐름"],["quick","빠른 모험"]]:
		var id = config[0]
		var b = _button(config[1],func(): mode=id; _preview_selection())
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		modes.add_child(b)
		mode_buttons.append(b)
	var tiers = _hbox(inner,7)
	for n in [1,2,3]:
		var b = _button("%d단계" % n,func(): tier=n; _preview_selection())
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tiers.add_child(b)
		tier_buttons.append(b)
	refs.duration_row = _hbox(inner,7)
	for n in [360,600]:
		var b = _button("%d분 압축" % (n/60),func(): duration=n; _preview_selection())
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		refs.duration_row.add_child(b)
		duration_buttons.append(b)
	refs.mode_description = _label("",12,MUTED,true)
	inner.add_child(refs.mode_description)
	var seed_row = _hbox(inner)
	seed_row.add_child(_label("맵 시드",13,MUTED))
	refs.seed = LineEdit.new()
	refs.seed.placeholder_text = "비워 두면 무작위"
	refs.seed.max_length = 24
	refs.seed.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	seed_row.add_child(refs.seed)
	refs.start = _button("모험 시작                         ENTER",_start_run,true)
	refs.start.custom_minimum_size.y = 48
	body.add_child(refs.start)
	body.add_child(_label("WASD 이동   ·   SPACE 점프   ·   C 슬라이드   ·   자동 공격",11,MUTED,true))
	refs.caption = _label("THE WILDS\n위험할수록, 더 강해집니다.",25,INK,true)
	menu.add_child(refs.caption)
	refs.footer = _hbox(menu,12)
	refs.footer.add_child(_button("콘텐츠 도감",_open_codex))
	refs.footer.add_child(_button("게임 안내",_open_about))
	refs.footer.add_child(_button("종료",func(): get_tree().quit()))

func _build_hud():
	hud = Control.new()
	hud.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(hud)
	hud.hide()
	refs.damage_flash = ColorRect.new()
	refs.damage_flash.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	refs.damage_flash.color = Color(0.8,0.1,0.05,0.0)
	refs.damage_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(refs.damage_flash)
	refs.xp = ProgressBar.new()
	refs.xp.show_percentage = false
	refs.xp.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	refs.xp.offset_bottom = 5
	hud.add_child(refs.xp)
	refs.vitals = PanelContainer.new()
	hud.add_child(refs.vitals)
	var vitals = _vbox(refs.vitals,4)
	refs.hud_name = _label("",16)
	vitals.add_child(refs.hud_name)
	refs.hp = ProgressBar.new()
	refs.hp.custom_minimum_size = Vector2(230,24)
	refs.hp.show_percentage = false
	refs.hp.add_theme_stylebox_override("fill",_style(Color("9dce67"),Color.TRANSPARENT,4,0))
	vitals.add_child(refs.hp)
	refs.hp_label = _label("",13)
	refs.hp_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	refs.hp_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	refs.hp.add_child(refs.hp_label)
	refs.shield = ProgressBar.new()
	refs.shield.custom_minimum_size.y = 5
	refs.shield.show_percentage = false
	refs.shield.add_theme_stylebox_override("fill",_style(Color("8acbe0"),Color.TRANSPARENT,3,0))
	vitals.add_child(refs.shield)
	refs.clock_box = VBoxContainer.new()
	refs.clock_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(refs.clock_box)
	refs.stage = _label("STAGE 1 / 3",12,ACCENT)
	refs.timer = _label("10:00",36,INK)
	refs.objective = _label("붉은 포털을 찾아 탐험하세요",13,INK,true)
	for item in [refs.stage,refs.timer,refs.objective]:
		item.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		refs.clock_box.add_child(item)
	refs.threat = _hbox(refs.clock_box,5)
	refs.threat.alignment = BoxContainer.ALIGNMENT_CENTER
	for i in 5:
		var mark = ColorRect.new()
		mark.custom_minimum_size = Vector2(30,4)
		mark.color = Color("526344")
		mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
		refs.threat.add_child(mark)
	refs.resources = _hbox(hud,8)
	refs.resource_text = _label("처치 0    금화 0",16,ACCENT)
	refs.resources.add_child(refs.resource_text)
	refs.resources.add_child(_button("M 지도",_open_map))
	refs.resources.add_child(_button("Ⅱ",_pause_run))
	refs.boss_box = VBoxContainer.new()
	hud.add_child(refs.boss_box)
	refs.boss_name = _label("",14,Color("f3d3ab"))
	refs.boss_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	refs.boss_box.add_child(refs.boss_name)
	refs.boss_hp = ProgressBar.new()
	refs.boss_hp.show_percentage = false
	refs.boss_hp.custom_minimum_size.y = 9
	refs.boss_hp.add_theme_stylebox_override("fill",_style(Color("e89472"),Color.TRANSPARENT,3,0))
	refs.boss_box.add_child(refs.boss_hp)
	refs.minimap = MapView.new()
	hud.add_child(refs.minimap)
	refs.loadout_icons = _hbox(hud,5)
	refs.loadout_icons.alignment = BoxContainer.ALIGNMENT_CENTER
	refs.loadout_icons.mouse_filter = Control.MOUSE_FILTER_IGNORE
	refs.loadout = _label("",12,INK,true)
	refs.loadout.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(refs.loadout)
	refs.help = _label("WASD 이동 · SPACE 점프 · C 슬라이드\n우클릭 드래그 시점 · 휠 줌 · M 지도 · Shift 대시",12,INK)
	hud.add_child(refs.help)
	refs.movement = _label("",14,ACCENT)
	hud.add_child(refs.movement)
	refs.portal = _label("",14,Color("bfe9da"))
	refs.portal.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(refs.portal)
	refs.dash = _label("대시 준비",13,INK)
	hud.add_child(refs.dash)
	refs.interact = _button("E · 상호작용",func(): touch.interact=true)
	hud.add_child(refs.interact)
	refs.shrine = _label("",14,Color("a3dbe5"))
	refs.shrine.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(refs.shrine)
	refs.banner = _label("",28,ACCENT,true)
	refs.banner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(refs.banner)
	refs.toast = _label("",16,INK,true)
	refs.toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(refs.toast)
	refs.touch_stick = Label.new()
	refs.touch_stick.text = "이동\n＋"
	refs.touch_stick.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	refs.touch_stick.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	refs.touch_stick.add_theme_font_size_override("font_size",21)
	refs.touch_stick.add_theme_stylebox_override("normal",_style(Color(0.07,0.15,0.1,0.65),Color("779a6b"),60,10))
	refs.touch_stick.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(refs.touch_stick)
	refs.touch_buttons = _hbox(hud,8)
	for action in [["slide","슬라이드"],["jump","점프"],["dash","대시"]]:
		var key = action[0]
		var b = _button(action[1],func(): pass)
		b.custom_minimum_size = Vector2(76,62)
		b.button_down.connect(func(): touch[key]=true)
		b.button_up.connect(func(): touch[key]=false)
		refs.touch_buttons.add_child(b)

func _layout():
	if ui == null or refs.is_empty(): return
	var size = get_viewport().get_visible_rect().size
	var compact = size.x<900
	refs.logo.position = Vector2(30,12)
	refs.logo.add_theme_font_size_override("font_size",37 if compact else 49)
	refs.edition.position = Vector2(32,64 if compact else 77)
	refs.best.position = Vector2(32,86 if compact else 102)
	refs.top_actions.position = Vector2(maxf(360,size.x-260),20)
	refs.top_actions.visible = not compact
	var panel_width = minf(555,size.x-40)
	refs.menu_panel.position = Vector2(20 if compact else 30,115 if compact else 137)
	refs.menu_panel.size = Vector2(panel_width,maxf(200,size.y-195 if compact else size.y-215))
	refs.caption.position = Vector2(640,size.y-155)
	refs.caption.size = Vector2(maxf(200,size.x-700),80)
	refs.caption.visible = not compact
	refs.footer.position = Vector2(30,size.y-59)
	refs.vitals.position = Vector2(18,20)
	refs.vitals.size = Vector2(275,95)
	refs.clock_box.position = Vector2(size.x*0.5-170,20)
	refs.clock_box.size = Vector2(340,110)
	refs.resources.position = Vector2(size.x-350,26)
	if compact:
		refs.vitals.size.x = 230
		refs.clock_box.position = Vector2(size.x-248,16)
		refs.clock_box.size.x = 235
		refs.resources.position = Vector2(size.x-350,132)
	refs.boss_box.position = Vector2(size.x*0.5-210,167 if compact else 138)
	refs.boss_box.size = Vector2(420,40)
	refs.minimap.position = Vector2(size.x-178,size.y-184)
	refs.minimap.size = Vector2(160,160)
	refs.minimap.visible = not compact
	refs.loadout_icons.position = Vector2(size.x*0.5-245,size.y-112)
	refs.loadout_icons.size = Vector2(490,36)
	refs.loadout.position = Vector2(size.x*0.5-245,size.y-72)
	refs.loadout.size = Vector2(490,85)
	refs.help.position = Vector2(22,size.y-67)
	refs.help.visible = not compact
	refs.movement.position = Vector2(24,133)
	refs.dash.position = Vector2(24,160)
	refs.portal.position = Vector2(size.x*0.5-170,214 if compact else 192)
	refs.portal.size = Vector2(340,30)
	refs.interact.position = Vector2(size.x*0.5-170,size.y-159)
	refs.interact.size = Vector2(340,44)
	refs.shrine.position = Vector2(size.x*0.5-170,size.y-191)
	refs.shrine.size = Vector2(340,28)
	refs.banner.position = Vector2(size.x*0.5-320,size.y*0.31)
	refs.banner.size = Vector2(640,92)
	refs.toast.position = Vector2(size.x*0.5-260,size.y*0.48)
	refs.toast.size = Vector2(520,74)
	refs.touch_stick.position = Vector2(25,size.y-230)
	refs.touch_stick.size = Vector2(120,120)
	refs.touch_buttons.position = Vector2(size.x-280,size.y-240)
	var show_touch = profile.settings.get("touch",false) or DisplayServer.is_touchscreen_available()
	refs.touch_stick.visible = show_touch
	refs.touch_buttons.visible = show_touch
	if compact:
		# Keep shop/settings accessible in narrow native windows.
		refs.top_actions.visible = true
		refs.top_actions.position = Vector2(maxf(320,size.x-270),60)

func _select_character(id):
	character_id = id
	_preview_selection()
	sound.play("click")

func _select_map(id):
	map_id = id
	_preview_selection()
	sound.play("click")

func _selected(button,active):
	button.add_theme_stylebox_override("normal",_style(Color("34472d") if active else Color("213c2e"),ACCENT if active else Color("3b5742"),9,8))

func _preview_selection():
	sim = Simulation.new({"characterId":character_id,"mapId":map_id,"mode":mode,"tier":tier,"duration":duration,"meta":Meta.runMeta(profile,mode),"seed":205112})
	sim.phase = "menu"
	world.setup(sim)
	_apply_quality()
	var character = Data.record("CHARACTERS",character_id)
	refs.character_name.text = character.name
	refs.character_description.text = character.description
	refs.starting_weapon.text = "시작 무기  ·  "+Data.record("WEAPONS",character.weaponId).name
	refs.caption.text = str(Data.record("MAPS",map_id).get("nameEn",map_id)).to_upper()+"\n위험할수록, 더 강해집니다."
	for id in character_buttons: _selected(character_buttons[id],id==character_id)
	for id in map_buttons: _selected(map_buttons[id],id==map_id)
	for i in mode_buttons.size(): _selected(mode_buttons[i],mode==("expedition" if i==0 else "quick"))
	for i in tier_buttons.size():
		tier_buttons[i].disabled = map_id=="Graveyard"
		_selected(tier_buttons[i],i==0 if map_id=="Graveyard" else i+1==tier)
	for i in duration_buttons.size(): _selected(duration_buttons[i],duration==([360,600][i]))
	refs.duration_row.visible = mode=="quick"
	var run = Meta.runMeta(profile,mode)
	var durations = "16분 단일 전투" if map_id=="Graveyard" else " · ".join(PackedStringArray(["10","9","8"].slice(0,tier)))+"분"
	refs.mode_description.text = "%s · 포털에서 직접 보스 소환 · 무기 %d / 서적 %d슬롯" % [durations,run.weaponSlots,run.tomeSlots] if mode=="expedition" else "%d분 압축 · %d단계 · 무기·서적 4슬롯 · 다시 뽑기 3회" % [duration/60,1 if map_id=="Graveyard" else tier]

func _sync_best():
	refs.silver.text = "은화 %d  ·  강화" % profile.silver
	refs.best.text = "탈출 %d회 · 최고 %d 처치" % [profile.wins,profile.bestKills] if profile.wins else ("최고 기록 %s · %d 처치" % [_fmt(profile.bestTime),profile.bestKills] if profile.runs else "첫 모험을 시작하세요")

func _show_menu():
	_close_modal()
	_clear_input()
	menu.show()
	hud.hide()
	phase_seen = "menu"
	_preview_selection()
	_sync_best()

func _start_run():
	_close_modal()
	_clear_input()
	var seed_text = refs.seed.text.strip_edges()
	var seed = seed_text if not seed_text.is_empty() else (int(Time.get_unix_time_from_system()*1000)^randi())&0xffffffff
	sim = Simulation.new({"characterId":character_id,"mapId":map_id,"mode":mode,"tier":tier,"duration":duration,"meta":Meta.runMeta(profile,mode),"seed":seed})
	world.setup(sim)
	world.reset_camera()
	menu.hide()
	hud.show()
	phase_seen = "playing"
	result_saved = false
	inventory_signature = ""
	sound.play("choice")
	_banner("STAGE 1",Data.record("MAPS",map_id).name+" · 보스 포털을 찾으세요",2.2)
	_update_hud()
	print("NATIVE_RUN_START ",JSON.stringify({"seed":sim.seed,"character":character_id,"map":map_id,"mode":mode,"tier":tier}))

func _physics_process(_delta):
	if sim == null or sim.phase=="menu": return
	var x = Input.get_action_strength("move_right")-Input.get_action_strength("move_left")+touch.x
	var z = Input.get_action_strength("move_back")-Input.get_action_strength("move_forward")+touch.z
	var vector = Vector2(x,z).limit_length(1.0)
	var yaw = world.cameraYaw
	var direction = Vector2(vector.x*cos(yaw)+vector.y*sin(yaw),-vector.x*sin(yaw)+vector.y*cos(yaw))
	sim.step(1.0/60.0,{"x":direction.x,"z":direction.y,"jump":Input.is_action_pressed("jump") or touch.jump,"dash":Input.is_action_pressed("dash") or touch.dash,"slide":Input.is_action_pressed("slide") or touch.slide,"interact":Input.is_action_pressed("interact") or touch.interact})
	touch.interact = false
	_process_events()
	_update_phase()

func _process(delta):
	if sim == null: return
	world.sync(sim,delta)
	var view_size = get_viewport().get_visible_rect().size
	if view_size != last_viewport_size:
		last_viewport_size = view_size
		_layout.call_deferred()
	damage_flash_time = maxf(0,damage_flash_time-delta)
	refs.damage_flash.color.a = 0.16 if damage_flash_time>0 else 0.0
	ui_clock += delta
	if ui_clock>0.09:
		ui_clock = 0
		if sim.phase!="menu": _update_hud()
	banner_time = maxf(0,banner_time-delta)
	toast_time = maxf(0,toast_time-delta)
	refs.banner.visible = banner_time>0
	refs.toast.visible = toast_time>0

func _clear_input():
	for key in ["move_left","move_right","move_forward","move_back","jump","slide","dash","interact"]:
		Input.action_release(key)
	touch = {"x":0.0,"z":0.0,"jump":false,"dash":false,"slide":false,"interact":false}
	touch_index = -1
	look_index = -1
	right_drag = false

func _focus_lost():
	_clear_input()
	if sim != null and sim.phase=="playing": _pause_run()

func _input(event):
	if sim == null: return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode==KEY_ESCAPE:
			if modal_kind=="map": _close_map()
			elif modal_kind=="settings": _close_settings()
			elif modal_kind in ["shop","codex","about"]: _close_modal(); _sync_best(); _preview_selection()
			elif sim.phase=="playing": _pause_run()
			elif sim.phase=="paused": _resume_run()
			get_viewport().set_input_as_handled()
			return
		if get_viewport().gui_get_focus_owner() is LineEdit: return
		if event.keycode==KEY_M and sim.phase!="menu":
			if modal_kind=="map": _close_map()
			else: _open_map()
			get_viewport().set_input_as_handled()
		elif event.keycode==KEY_ENTER and sim.phase=="menu" and modal_kind.is_empty():
			_start_run()
			get_viewport().set_input_as_handled()
		elif event.keycode in [KEY_1,KEY_2,KEY_3] and sim.phase in ["levelup","loot"]:
			_choose(event.keycode-KEY_1)
			get_viewport().set_input_as_handled()
	if event is InputEventScreenTouch and sim.phase=="playing":
		var screen = get_viewport().get_visible_rect().size
		if event.pressed:
			if event.position.x<screen.x*0.45 and event.position.y>screen.y*0.5 and touch_index<0:
				touch_index = event.index
				touch_center = refs.touch_stick.position+refs.touch_stick.size*0.5
				_move_touch(event.position)
			elif event.position.x>screen.x*0.48 and event.position.y<screen.y-250:
				look_index = event.index
		else:
			if event.index==touch_index: touch_index=-1;touch.x=0;touch.z=0
			if event.index==look_index: look_index=-1
	if event is InputEventScreenDrag and sim.phase=="playing":
		if event.index==touch_index: _move_touch(event.position)
		elif event.index==look_index: world.rotate_camera(event.relative.x*0.006,event.relative.y*0.004)

func _unhandled_input(event):
	if not modal_kind.is_empty(): return
	if event is InputEventMouseButton:
		if event.button_index==MOUSE_BUTTON_RIGHT: right_drag=event.pressed
		if event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP,MOUSE_BUTTON_WHEEL_DOWN]:
			world.zoom_camera(-0.4 if event.button_index==MOUSE_BUTTON_WHEEL_UP else 0.4)
	if event is InputEventMouseMotion and right_drag:
		world.rotate_camera(event.relative.x*0.006,event.relative.y*0.004)

func _move_touch(position):
	var offset = ((position-touch_center)/36.0).limit_length(1.0)
	touch.x = offset.x
	touch.z = offset.y

func _process_events():
	for event in sim.drainEvents():
		var kind = event.get("type","")
		if kind=="toast": _toast(event.get("message",""))
		elif kind=="hit" and (event.get("target")=="player" or event.get("isPlayer",false) or event.get("player",false) or event.get("targetId")=="player"): damage_flash_time=0.1
		elif kind=="boss": _banner("DANGER",event.get("message","수호자가 깨어났습니다"),3.6)
		elif kind=="portal": _banner("PORTAL READY","수호자 격파 · 포털이 열렸습니다",2.6)
		elif kind=="stage" and event.get("state")=="entered":
			_clear_input()
			world.setup(sim)
			_banner("STAGE %d / %d" % [sim.stageNumber,sim.stageCount],"다음 지역 · 빌드가 유지됩니다",2.3)
		elif (kind=="stage" and event.get("state")=="swarm") or kind=="swarm": _banner("FINAL SWARM","최후의 군세가 시작됩니다",2.6)
		if event.get("message","") and kind in ["loot","heal"]: _toast(event.message)
		if kind not in ["victory","death"]: sound.play(kind)

func _update_phase():
	if sim.phase==phase_seen: return
	phase_seen = sim.phase
	if sim.phase in ["levelup","loot"]:
		_clear_input()
		_show_choices()
	elif sim.phase=="paused" and modal_kind not in ["map","settings"]: _show_pause()
	elif sim.phase in ["dead","won"]: _show_result()
	elif sim.phase=="playing" and modal_kind in ["choices","pause"]: _close_modal()

func _fmt(seconds):
	var value = maxi(0,int(seconds))
	return "%02d:%02d" % [value/60,value%60]

func _banner(tag,message,seconds):
	refs.banner.text = tag+"\n"+message
	banner_time = seconds

func _toast(message):
	if str(message).is_empty(): return
	refs.toast.text = str(message)
	toast_time = 3.3

func _update_hud():
	var p = sim.player
	refs.hud_name.text = "%s     LV. %d" % [Data.record("CHARACTERS",character_id).name,p.level]
	refs.hp.value = clampf(p.hp/maxf(1,p.maxHp)*100,0,100)
	refs.hp.add_theme_stylebox_override("fill",_style(Color("e68b72") if p.hp/maxf(1,p.maxHp)<0.3 else Color("9dce67"),Color.TRANSPARENT,4,0))
	refs.hp_label.text = "%d / %d" % [ceil(maxf(0,p.hp)),ceil(p.maxHp)]
	refs.xp.value = clampf(p.xp/maxf(1,p.xpNext)*100,0,100)
	refs.shield.visible = p.maxShield>0
	refs.shield.value = clampf(p.shield/maxf(1,p.maxShield)*100,0,100)
	refs.resource_text.text = "처치 %d    금화 %d" % [sim.kills,p.gold]
	refs.timer.text = ("+" if sim.finalSwarm else "")+_fmt(maxf(0,sim.stageTime-sim.stageDuration) if sim.finalSwarm else maxf(0,sim.stageDuration-sim.stageTime))
	refs.stage.text = "STAGE %d / %d · %s" % [sim.stageNumber,sim.stageCount,"원정" if mode=="expedition" else "빠른 모험"]
	var boss = null
	for e in sim.enemies:
		if e.get("boss",false) and e.hp>0: boss=e;break
	refs.boss_box.visible = boss!=null
	if boss:
		refs.boss_name.text = "%s  ·  %d / %d" % [Data.record("ENEMY_TYPES",boss.type).get("name","지역의 수호자"),boss.hp,boss.maxHp]
		refs.boss_hp.value = boss.hp/boss.maxHp*100
	refs.objective.text = ("포털에서 E · 다음 단계로" if sim.stageNumber<sim.stageCount else "포털에서 E · 원정 완료") if sim.portal and sim.portal.get("active",false) else ("수호자를 쓰러뜨리세요" if boss else ("최후의 군세 · 포털을 서두르세요" if sim.finalSwarm else ("붉은 포털에서 E · 보스 소환" if sim.portal and sim.portal.get("discovered",false) else "붉은 포털을 찾아 탐험하세요")))
	for i in 5:
		refs.threat.get_child(i).color = (Color("e89472") if boss or sim.finalSwarm else ACCENT) if sim.stageTime/sim.stageDuration>i*0.2 else Color("526344")
	refs.dash.text = "대시 %.1f초" % p.dashCooldown if p.dashCooldown>0.1 else "Shift · 대시 준비"
	refs.movement.text = "%.1f m/s  ·  %s" % [Vector2(p.vx,p.vz).length(),"슬라이딩" if p.sliding else ("공중" if not p.grounded else "지상")]
	refs.interact.visible = sim.interaction!=null and sim.phase=="playing"
	if sim.interaction:
		refs.interact.text = str(sim.interaction.get("label","E · 상호작용"))
		refs.interact.disabled = not sim.interaction.get("enabled",true)
	refs.portal.text = ""
	if sim.portal and (sim.portal.get("discovered",false) or sim.portal.get("active",false)):
		var d = Vector2(sim.portal.x-p.x,sim.portal.z-p.z)
		var yaw = world.cameraYaw
		var relative = Vector2(d.x*cos(yaw)-d.y*sin(yaw),d.x*sin(yaw)+d.y*cos(yaw))
		var angle = atan2(relative.x,-relative.y)
		var arrows = ["↑","↗","→","↘","↓","↙","←","↖"]
		var arrow = arrows[posmod(int(round(angle/(PI/4.0))),8)]
		refs.portal.text = "%s  %s · %d m" % [arrow,"열린 포털" if sim.portal.active else "보스 포털",round(d.length())]
	refs.shrine.text = ""
	for shrine in sim.shrines:
		if not shrine.used and shrine.get("progress",0)>0 and Vector2(shrine.x-p.x,shrine.z-p.z).length()<7:
			refs.shrine.text = "제단 범위 안에서 충전 중 · %d%%" % round(shrine.progress*100)
	var weapons = []
	for w in sim.weapons: weapons.append("%s Lv.%d" % [Data.record("WEAPONS",w.id).name,w.level])
	var tomes = []
	for id in sim.tomes: tomes.append("%s ×%d" % [Data.record("TOMES",id).name,sim.tomes[id]])
	refs.loadout.text = " · ".join(weapons)+"\n"+" · ".join(tomes)+"\n무기 %d/%d · 서적 %d/%d · 자동 공격" % [sim.weapons.size(),sim.maxWeaponSlots,sim.tomes.size(),sim.maxTomeSlots]
	_update_loadout_icons()
	refs.minimap.refresh(sim,false,world.cameraYaw)

func _close_modal():
	if is_instance_valid(modal):
		modal.hide()
		modal.queue_free()
	modal = null
	modal_kind = ""

func _dialog(kind,title,kicker="",width=740,closable=true):
	_close_modal()
	modal_kind = kind
	modal = ColorRect.new()
	modal.color = Color(0.02,0.06,0.04,0.76)
	modal.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui.add_child(modal)
	var screen = get_viewport().get_visible_rect().size
	var panel = PanelContainer.new()
	var w = minf(width,screen.x-36)
	var h = minf(690,screen.y-76)
	panel.position = Vector2((screen.x-w)*0.5,(screen.y-h)*0.5)
	panel.size = Vector2(w,h)
	modal.add_child(panel)
	var body = _vbox(panel,14)
	var head = _hbox(body)
	var headings = _vbox(head,2)
	headings.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if not kicker.is_empty(): headings.add_child(_label(kicker,12,ACCENT))
	headings.add_child(_label(title,29,INK,true))
	if closable:
		var close = _button("닫기",func():
			if modal_kind=="map": _close_map()
			elif modal_kind=="settings": _close_settings()
			else: _close_modal();_sync_best();_preview_selection())
		head.add_child(close)
	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	body.add_child(scroll)
	modal_box = _vbox(scroll,14)
	modal_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return modal_box

func _offer(raw):
	var source = {}
	match raw.kind:
		"weapon": source=Data.record("WEAPONS",raw.targetId).duplicate(true)
		"tome": source=Data.record("TOMES",raw.targetId).duplicate(true)
		"item": source=Data.record("ITEMS",raw.targetId).duplicate(true)
	source.merge(raw,true)
	return source

func _signed(value):
	return ("+" if value>=0 else "")+str(snappedf(value,0.01))

func _offer_description(offer):
	if offer.kind=="weapon" and not offer.get("upgradeLines",[]).is_empty():
		var names = {"DamageMultiplier":"피해","Projectiles":"투사체","SizeMultiplier":"공격 범위","CritChance":"치명타 확률","CritDamage":"치명타 피해","KnockbackMultiplier":"밀쳐내기","ProjectileBounces":"튕김","DurationMultiplier":"지속시간","ProjectileSpeedMultiplier":"투사체 속도"}
		var lines = []
		for line in offer.upgradeLines:
			var value = line.get("value",line.get("modification",0))*offer.get("factor",1)
			var operation = line.get("modifyType",line.get("modify_type",""))
			var percent = line.stat in ["CritChance","CritDamage"] or operation!="Flat"
			lines.append(str(names.get(line.stat,line.stat))+" "+_signed(value*(100 if percent else 1))+("%" if percent else ""))
		return " · ".join(lines)
	if offer.kind=="tome":
		var tome = Data.record("TOMES",offer.targetId)
		var value = tome.get("amount",0)*offer.get("factor",1)
		var unit = " HP/분" if tome.stat=="regen" else ("" if tome.stat in ["maxHp","projectiles","shield"] else "%")
		return tome.name+" "+_signed(value*(100 if unit=="%" else 1))+unit+". 선택 즉시 능력치에 반영됩니다."
	return offer.get("description","능력이 강화됩니다.")

func _show_choices():
	var loot = sim.phase=="loot"
	var blessing = false
	for o in sim.offers:
		if o.kind=="stat": blessing=true
	var title = "제단의 축복" if blessing else ("상자 속의 새로운 힘" if loot else "다음 힘을 선택하세요")
	var kicker = "SHRINE BLESSING" if blessing else ("TREASURE FOUND" if loot else "LEVEL %d" % sim.player.level)
	var box = _dialog("choices",title,kicker,940,false)
	box.add_child(_label("이번 모험 동안 유지되는 능력치 하나를 선택하세요. 슬롯을 사용하지 않습니다." if blessing else ("아이템 하나를 선택하면 즉시 적용됩니다." if loot else "전투가 잠시 멈췄습니다. 원하는 능력을 선택하세요."),14,MUTED,true))
	var cards = GridContainer.new()
	cards.columns = 3 if get_viewport().get_visible_rect().size.x>=800 else 1
	cards.add_theme_constant_override("h_separation",14)
	cards.add_theme_constant_override("v_separation",12)
	box.add_child(cards)
	for i in sim.offers.size():
		var offer = _offer(sim.offers[i])
		var col = RARITY.get(offer.get("rarity","Common"),INK)
		var card = _button("",func(): _choose(i))
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.custom_minimum_size = Vector2(200,294 if cards.columns==3 else 220)
		card.add_theme_stylebox_override("normal",_style(Color("1d3528"),col,14,0))
		cards.add_child(card)
		var margin = MarginContainer.new()
		margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		for side in ["left","top","right","bottom"]: margin.add_theme_constant_override("margin_"+side,16)
		margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(margin)
		var content = _vbox(margin,11)
		content.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var kind_name = {"weapon":"무기","tome":"TOME","stat":"능력치","item":"아이템"}.get(offer.kind,offer.kind)
		content.add_child(_label("%s · %s" % [offer.get("rarityName",offer.get("rarity","일반")),kind_name],12,col))
		var icon = TextureRect.new()
		icon.texture = _icon(offer.get("icon","star"))
		icon.modulate = col
		icon.custom_minimum_size = Vector2(44,44)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		content.add_child(icon)
		content.add_child(_label(offer.get("label",offer.get("name",offer.targetId)),22,INK,true))
		var desc = _label(_offer_description(offer),14,MUTED,true)
		desc.size_flags_vertical = Control.SIZE_EXPAND_FILL
		content.add_child(desc)
		content.add_child(_label("선택  %d     %s" % [i+1,"LEVEL %d" % offer.level if offer.get("level",0)>0 else "획득 즉시 적용"],12,col))
	box.add_child(_label("숫자 1 · 2 · 3 또는 카드 클릭으로 선택",13,MUTED,true))
	if not loot:
		var reroll = _button("다시 뽑기 · %d" % sim.rerolls,func(): sim.reroll(); _show_choices(); sound.play("click"))
		reroll.disabled = sim.rerolls<=0
		box.add_child(reroll)

func _choose(index):
	if sim.phase not in ["levelup","loot"] or index<0 or index>=sim.offers.size(): return
	sim.choose(index)
	sound.play("choice")
	phase_seen = ""
	if sim.phase in ["levelup","loot"]: _show_choices();phase_seen=sim.phase
	else: _close_modal();_update_phase()
	_update_hud()

func _pause_run():
	if sim.phase!="playing": return
	sim.pause()
	_clear_input()
	phase_seen = "paused"
	_show_pause()

func _show_pause():
	var box = _dialog("pause","잠시 쉬어가기","TAKE A BREATH",700,false)
	box.add_child(_label("전투와 시간은 멈춰 있습니다.",14,MUTED))
	box.add_child(_label("생존 %s   ·   처치 %d   ·   레벨 %d   ·   %d / %d단계" % [_fmt(sim.time),sim.kills,sim.player.level,sim.stageNumber,sim.stageCount],17,ACCENT,true))
	box.add_child(_label("현재 조합 능력치",19))
	var p = sim.player
	var armor = 0.999*maxf(0,p.armor)/(maxf(0,p.armor)+0.75)
	var evasion = 0.999*maxf(0,p.evasion)/(maxf(0,p.evasion)+1)
	var stats = [["피해 배율","%.2f×" % (p.damage*p.damageTome*p.get("conditionalDamage",1))],["공격 속도","%.2f×" % p.attackSpeed],["치명타 확률","%.1f%%" % (p.crit*100)],["피해 감소","%.1f%%" % (armor*100)],["회피 확률","%.1f%%" % (evasion*100)],["추가 투사체","+%d" % p.quantity],["이동 속도","%.1f" % p.get("effectiveSpeed",p.speed)],["행운","%.1f%%" % (p.luck*100)],["수집 반경","%.1f m" % p.pickupRadius],["체력 재생","%.1f /분" % p.regen]]
	var grid = GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation",35)
	grid.add_theme_constant_override("v_separation",5)
	box.add_child(grid)
	for stat in stats:
		grid.add_child(_label(stat[0],14,MUTED))
		grid.add_child(_label(stat[1],14,INK))
	box.add_child(_label("획득한 아이템",19))
	var items = []
	for id in sim.items: items.append("%s ×%d" % [Data.record("ITEMS",id).name,sim.items[id]])
	box.add_child(_label(" · ".join(items) if items.size() else "상자를 열어 아이템을 모아보세요.",14,MUTED,true))
	box.add_child(_button("계속 플레이",_resume_run,true))
	box.add_child(_button("소리 · 화면 설정",func(): _open_settings("pause")))
	box.add_child(_button("모험 종료",_end_run))

func _resume_run():
	_close_modal()
	_clear_input()
	sim.resume()
	phase_seen = "playing"

func _end_run():
	if sim.phase not in ["playing","paused"]: return
	sim.phase = "dead"
	sim.result = {"won":false,"time":sim.time,"kills":sim.kills,"level":sim.player.level,"damageDealt":sim.damageDealt,"reason":"quit"}
	_show_result()
	phase_seen = "dead"

func _show_result():
	_clear_input()
	var won = sim.phase=="won"
	if not result_saved:
		result_record = sim.kills>profile.bestKills or sim.time>profile.bestTime
		profile.runs += 1
		if won: profile.wins+=1
		profile.bestTime = maxf(profile.bestTime,sim.time)
		profile.bestKills = maxi(profile.bestKills,sim.kills)
		result_reward = Meta.calculateSilver(sim,profile)
		profile.silver += result_reward
		profile.highestStage = maxi(profile.highestStage,sim.stageNumber)
		_save_profile()
		result_saved = true
		sound.play("victory" if won else "death")
		print("NATIVE_RUN_RESULT ",JSON.stringify({"won":won,"time":sim.time,"kills":sim.kills,"level":sim.player.level,"silver":result_reward,"reason":sim.result.get("reason","")}))
	var box = _dialog("result","살아남았습니다!" if won else "다시, 더 강하게.","YOU MADE IT" if won else "ONE MORE RUN",720,false)
	box.add_child(_label("%d개 단계를 돌파하고 원정을 마쳤습니다." % sim.stageCount if won else ("모험을 마쳤습니다. 다음 조합을 준비하세요." if sim.result.get("reason")=="quit" else "이번 조합이 다음 모험의 밑거름이 됩니다."),16,MUTED,true))
	var grid = GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation",38)
	grid.add_theme_constant_override("v_separation",18)
	box.add_child(grid)
	for entry in [["생존 시간",_fmt(sim.time)],["몬스터 처치",str(sim.kills)],["도달 레벨",str(sim.player.level)],["누적 피해",str(int(sim.damageDealt))]]:
		grid.add_child(_label(entry[0],16,MUTED))
		grid.add_child(_label(entry[1],26,ACCENT))
	var weapons = []
	for w in sim.weapons: weapons.append("%s Lv.%d" % [Data.record("WEAPONS",w.id).name,w.level])
	box.add_child(_label(" · ".join(weapons),17,INK,true))
	box.add_child(_label("은화 +%d · 보유 %d · 시드 %s" % [result_reward,profile.silver,sim.seed],17,ACCENT,true))
	if result_record: box.add_child(_label("새로운 최고 기록",18,ACCENT))
	if not save_error.is_empty(): box.add_child(_label(save_error,14,Color("ed8e80"),true))
	box.add_child(_button("같은 모험가로 다시 도전",_start_run,true))
	box.add_child(_button("모험가 선택으로",_show_menu))

func _open_settings(previous):
	if sim.phase=="playing": _pause_run()
	modal_previous = previous
	var box = _dialog("settings","설정","SOUND & DISPLAY",720,true)
	var sound_button = CheckButton.new()
	sound_button.text = "효과음"
	sound_button.button_pressed = profile.settings.sound
	sound_button.toggled.connect(func(value): profile.settings.sound=value;sound.enabled=value;_save_profile();sound.play("choice"))
	box.add_child(sound_button)
	box.add_child(_label("음량",15,MUTED))
	var slider = HSlider.new()
	slider.max_value = 100
	slider.value = profile.settings.volume*100
	slider.custom_minimum_size.y = 30
	slider.value_changed.connect(func(value): profile.settings.volume=value/100.0;sound.volume=value/100.0;_save_profile())
	box.add_child(slider)
	box.add_child(_label("네이티브 3D 렌더링 · Godot Compatibility",14,MUTED,true))
	var quality = OptionButton.new()
	quality.add_item("높음")
	quality.add_item("성능 우선")
	quality.selected = 1 if profile.settings.quality=="low" else 0
	quality.item_selected.connect(func(index): profile.settings.quality="low" if index==1 else "high";_save_profile();_apply_quality())
	box.add_child(quality)
	var touch_button = CheckButton.new()
	touch_button.text = "터치 조작 표시"
	touch_button.button_pressed = profile.settings.get("touch",false)
	touch_button.toggled.connect(func(value): profile.settings.touch=value;_save_profile();_layout())
	box.add_child(touch_button)
	box.add_child(_button("전체 화면 전환",func(): DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if DisplayServer.window_get_mode()==DisplayServer.WINDOW_MODE_FULLSCREEN else DisplayServer.WINDOW_MODE_FULLSCREEN)))
	box.add_child(_label("조작 방법",21))
	box.add_child(_label("이동  WASD / 방향키 / 터치 스틱\n점프  Space / 점프 버튼\n슬라이드  C 또는 Ctrl을 누른 채 이동\n대시  Shift / 대시 버튼 · 웹 v2 편의 기능 유지\n상자 · 제단 · 포털  E / 화면 상호작용 버튼\n시점  우클릭 드래그 / 오른쪽 화면 터치 / 휠\n전체 지도  M · 지도 열람 중 일시 정지\n선택 · 정지  숫자 1·2·3 / Esc",15,MUTED,true))

func _apply_quality():
	if world.has_method("set_quality"): world.set_quality(profile.settings.quality)

func _close_settings():
	_close_modal()
	if modal_previous=="pause": _show_pause()

func _open_shop():
	if sim.phase!="menu": return
	var box = _dialog("shop","다음 모험을 준비하세요","PERMANENT UPGRADES",820)
	box.add_child(_label("슬롯·다시 뽑기 강화는 원작 흐름 모드에, 은화 보너스는 두 모드 모두에 적용됩니다.",14,MUTED,true))
	box.add_child(_label("보유 은화  %d" % profile.silver,26,ACCENT))
	for entry in catalog.META_UPGRADES:
		if not entry.runtimeSupported: continue
		var card = PanelContainer.new()
		card.add_theme_stylebox_override("panel",_style(Color("20372a"),Color("3b5742"),12,16))
		box.add_child(card)
		var content = _vbox(card,8)
		var level = int(profile.upgrades.get(entry.id,0))
		content.add_child(_label("%s     %d / %d" % [entry.name,level,entry.maxLevel],20))
		content.add_child(_label(entry.description,14,MUTED,true))
		var maximum = level>=entry.maxLevel
		var cost = 0 if maximum else entry.costs[level]
		var id = entry.id
		var button = _button("최대 강화" if maximum else "%d 은화 · 강화" % cost,func(): _buy_upgrade(id))
		button.disabled = maximum or profile.silver<cost
		content.add_child(button)
	box.add_child(_label("상점 가격·증가량과 은화 지급량은 웹 v2의 규칙을 유지합니다.",12,MUTED,true))

func _buy_upgrade(id):
	var result = Meta.purchaseUpgrade(profile,id)
	if result.ok:
		_save_profile()
		sound.play("choice")
		_sync_best()
		_open_shop()

func _open_codex():
	var box = _dialog("codex","조합을 미리 살펴보세요","FIELD GUIDE",850)
	var tabs = _hbox(box)
	for config in [["weapons","무기"],["tomes","서적"],["items","아이템"]]:
		var id = config[0]
		var b = _button(config[1],func(): codex_kind=id;_open_codex())
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_selected(b,codex_kind==id)
		tabs.add_child(b)
	var search = LineEdit.new()
	search.placeholder_text = "이름으로 찾기"
	search.text = codex_query
	box.add_child(search)
	var list = _vbox(box,10)
	search.text_changed.connect(func(value): codex_query=value;_fill_codex(list))
	_fill_codex(list)

func _fill_codex(list):
	for child in list.get_children(): child.queue_free()
	var records = catalog.WEAPONS if codex_kind=="weapons" else (catalog.TOMES if codex_kind=="tomes" else catalog.ITEMS)
	var found = 0
	for id in records:
		var data = records[id]
		if not codex_query.strip_edges().to_lower() in (data.name+" "+data.get("nameEn","")+" "+data.id).to_lower(): continue
		found += 1
		var card = PanelContainer.new()
		card.add_theme_stylebox_override("panel",_style(Color("1c3427"),Color("38523d"),10,14))
		list.add_child(card)
		var row = _hbox(card,16)
		var icon = TextureRect.new()
		icon.texture = _icon(data.get("icon","star"))
		icon.modulate = Color(data.get("color","#d7eb93"))
		icon.custom_minimum_size = Vector2(38,38)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		row.add_child(icon)
		var content = _vbox(row,4)
		content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		content.add_child(_label(data.name,20))
		content.add_child(_label(data.get("nameEn",data.id),12,ACCENT))
		content.add_child(_label(data.get("description","성장 선택에서 획득할 수 있습니다."),14,MUTED,true))
		if codex_kind=="weapons": content.add_child(_label("기본 피해 %s · 발동 계수 %s" % [data.damage,data.get("procCoefficient",data.get("proc","—"))],12,MUTED,true))
	if found==0: list.add_child(_label("일치하는 항목이 없습니다.",16,MUTED))

func _open_about():
	var box = _dialog("about","모험의 규칙","WILDRUN EXPEDITION",780)
	for entry in [["움직이고, 피하세요.","공격은 자동입니다. 공중에서 방향을 바꾸고, 착지할 때 C로 슬라이딩해 관성을 이어 가세요."],["경험치를 모아 조합하세요.","보석을 모으면 레벨이 오릅니다. 원작 흐름은 무기·서적 2슬롯에서 시작하며 은화 상점으로 4슬롯까지 확장합니다. 빠른 모험은 4슬롯을 바로 사용합니다."],["상자를 찾아 더 강해지세요.","금화로 상자를 열고 제단에서 보상을 얻으세요. 붉은 포털을 발견하면 지도에 위치가 남습니다."],["보스를 부르고 다음 단계로 향하세요.","원작 흐름에서는 포털의 E로 보스를 소환합니다. 처치 후 E로 빌드를 유지한 채 다음 단계로 이동하세요. 제한 시간이 지나면 최후의 군세가 시작됩니다."]]:
		box.add_child(_label(entry[0],21,ACCENT))
		box.add_child(_label(entry[1],15,MUTED,true))
	box.add_child(_label("웹 v2 기반 네이티브 포트",21))
	box.add_child(_label("이 프로젝트는 이 대화의 최신 웹 v2를 Godot GDScript로 옮긴 버전입니다. 숲·사막 10/9/8분, 묘지 16분 타이머와 웹판의 이동·지형·적 밀도·은화 보상·외형을 유지합니다. Megabonk 원본 프로그램의 완전 복제는 아닙니다.",15,MUTED,true))
	box.add_child(_label("캐릭터 15명 · 무기 16종 · Tome 18종 · 아이템 24종 · 지역 3곳",15,INK,true))

func _open_map():
	if sim.phase not in ["playing","paused"]: return
	map_was_playing = sim.phase=="playing"
	if map_was_playing: sim.pause();_clear_input()
	phase_seen = "paused"
	var box = _dialog("map",Data.record("MAPS",map_id).name+" · %d단계" % sim.stageNumber,"EXPEDITION MAP",740)
	var map_view = MapView.new()
	var size = minf(480,get_viewport().get_visible_rect().size.y-270)
	map_view.custom_minimum_size = Vector2(size,size)
	map_view.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	box.add_child(map_view)
	map_view.refresh(sim,true,0)
	box.add_child(_label("내 위치 · 상자 · 제단 · 발견한 포털",14,ACCENT,true))
	box.add_child(_label("시드 %s · 지도 열람 중 일시 정지\n%s" % [sim.seed,"포털 위치를 발견했습니다." if sim.portal and sim.portal.get("discovered",false) else "포털에 가까이 가면 위치가 기록됩니다."],13,MUTED,true))
	box.add_child(_button("모험 계속하기 · M",_close_map,true))

func _close_map():
	_close_modal()
	if map_was_playing: _resume_run()
	else: _show_pause()

## Read-only diagnostics for native QA. No gameplay mutation commands.
func get_game_state():
	if sim==null: return {}
	return {"phase":sim.phase,"time":sim.time,"seed":sim.seed,"characterId":character_id,"mapId":map_id,"mode":mode,"player":sim.player.duplicate(true),"weapons":sim.weapons.duplicate(true),"tomes":sim.tomes.duplicate(true),"items":sim.items.duplicate(true),"kills":sim.kills,"enemyCount":sim.enemies.size(),"projectileCount":sim.projectiles.size(),"stageNumber":sim.stageNumber,"stageCount":sim.stageCount,"portal":sim.portal.duplicate(true) if sim.portal else null,"offers":sim.offers.duplicate(true)}


func _update_loadout_icons():
	var signature = JSON.stringify([sim.weapons.map(func(w): return [w.id,w.level]),sim.tomes,sim.maxWeaponSlots])
	if signature==inventory_signature: return
	inventory_signature = signature
	for child in refs.loadout_icons.get_children(): child.queue_free()
	for i in sim.maxWeaponSlots:
		var panel = PanelContainer.new()
		panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
		panel.add_theme_stylebox_override("panel",_style(Color(0.06,0.14,0.09,0.85),Color("81955c"),5,5))
		refs.loadout_icons.add_child(panel)
		var row = _hbox(panel,3)
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var texture = TextureRect.new()
		texture.custom_minimum_size = Vector2(24,24)
		texture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		texture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		texture.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if i<sim.weapons.size():
			var weapon = sim.weapons[i]
			var definition = Data.record("WEAPONS",weapon.id)
			texture.texture = _icon(definition.get("icon","star"))
			texture.modulate = Color(definition.get("color","#e4f875"))
			row.add_child(texture)
			row.add_child(_label(str(weapon.level),12,ACCENT))
			panel.tooltip_text = definition.name+" Lv."+str(weapon.level)
		else:
			texture.texture = _icon("plus")
			texture.modulate = MUTED
			row.add_child(texture)
	for id in sim.tomes:
		var texture = TextureRect.new()
		texture.texture = _icon(Data.record("TOMES",id).get("icon","book"))
		texture.custom_minimum_size = Vector2(21,24)
		texture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		texture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		texture.modulate = Color("b9d7bb")
		texture.tooltip_text = Data.record("TOMES",id).name+" ×"+str(sim.tomes[id])
		refs.loadout_icons.add_child(texture)
