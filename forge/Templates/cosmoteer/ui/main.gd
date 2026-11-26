extends Control

const Simulation = preload("res://sim/power_range.gd")
const AssetLoader = preload("res://sim/asset_loader.gd")
const RangeView = preload("res://ui/range_view.gd")
const CatalogView = preload("res://ui/catalog.gd")
const ShipyardView = preload("res://ui/shipyard.gd")
const SURFACE := Color("#13232f")
const EDGE := Color("#324751")
const WHITE := Color("#e1eae7")
const SOFT := Color("#a6bdc3")
const GREEN := Color("#81e3c1")
const GOLD := Color("#ffc489")
const STATUS := {"finished":"표적 파괴", "hold":"사격 대기", "no_gunner":"포수 대기",
	"out_of_range":"사거리 밖", "starved":"전력 보급 대기", "firing":"사격 중"}
const EVENT_NAMES := {"pickup":"반응로에서 전력 수령", "delivery":"레이저에 전력 전달",
	"shot":"레이저 발사", "hit":"표적 명중", "destroyed":"장갑 파괴"}

var sim = Simulation.new()
var asset_loader
var running := false
var speed := 1
var stage: VBoxContainer
var library: VBoxContainer
var shipyard: VBoxContainer
var shipyard_tab: Button
var board: Control
var run_button: Button
var range_tab: Button
var catalog_tab: Button
var state_label: Label
var time_label: Label
var tallies: Label
var event_label: Label
var distance_label: Label
var slider: HSlider
var switches: Array[CheckButton] = []
var meters: Array[Dictionary] = []

func _load_ui_font() -> Font:
	var sys := SystemFont.new()
	sys.font_names = PackedStringArray(["Malgun Gothic", "Noto Sans CJK KR", "Apple SD Gothic Neo", "Segoe UI", "DejaVu Sans", "sans-serif"])
	var bundled: FontFile = null
	if FileAccess.file_exists("res://assets/fonts/cosmoteer-ui.txt"):
		var raw := FileAccess.get_file_as_string("res://assets/fonts/cosmoteer-ui.txt").strip_edges()
		if not raw.is_empty():
			bundled = FontFile.new()
			bundled.data = Marshalls.base64_to_raw(raw)
			if not OS.has_feature("web"):
				bundled.fallbacks = [sys]
	var chosen: Font = sys
	if bundled != null:
		var tuned := FontVariation.new()
		tuned.base_font = bundled
		tuned.spacing_top = -1
		tuned.spacing_bottom = -1
		chosen = tuned
	ThemeDB.fallback_font = chosen
	return chosen

func _ready() -> void:
	asset_loader = AssetLoader.new()
	add_child(asset_loader)
	asset_loader.assets_ready.connect(_on_assets_ready)
	var face := _load_ui_font()
	theme = Theme.new()
	theme.default_font = face
	theme.default_font_size = 16
	theme.set_color("font_color","Label",WHITE)
	for kind in ["Button","OptionButton","LineEdit","ItemList"]:
		theme.set_stylebox("normal",kind,box(SURFACE,EDGE,10))
		theme.set_stylebox("hover",kind,box(Color("#213947"),SOFT,10))
		theme.set_stylebox("pressed",kind,box(Color("#20483e"),GREEN,10))
		theme.set_color("font_color",kind,WHITE)
	var margin := MarginContainer.new()
	add_child(margin)
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left","right","top","bottom"]:
		margin.add_theme_constant_override("margin_"+side,28 if side in ["left","right"] else 20)
	var root := VBoxContainer.new()
	margin.add_child(root)
	root.add_theme_constant_override("separation",14)
	var header := HBoxContainer.new()
	root.add_child(header)
	header.add_child(label("COSMOTEER   /   함선 실험실",23,WHITE))
	header.add_spacer(false)
	shipyard_tab = button("조선소 · 전투",func(): _show_tab(shipyard))
	range_tab = button("실험 조종석",func(): _show_tab(stage))
	catalog_tab = button("추출 데이터",func(): _show_tab(library))
	header.add_child(shipyard_tab)
	header.add_child(range_tab)
	header.add_child(catalog_tab)
	root.add_child(HSeparator.new())
	stage = VBoxContainer.new()
	stage.size_flags_vertical = Control.SIZE_EXPAND_FILL
	stage.add_theme_constant_override("separation",12)
	root.add_child(stage)
	if sim.load_error.is_empty():
		_build_range(face)
	else:
		var failure := label("사격장 데이터를 읽을 수 없습니다.\n" + sim.load_error,18,GOLD)
		failure.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		stage.add_child(failure)
	library = CatalogView.new()
	root.add_child(library)
	library.build(self)
	shipyard = ShipyardView.new()
	root.add_child(shipyard)
	shipyard.build(self)
	_show_tab(shipyard)
	if sim.load_error.is_empty():
		_refresh()


func _on_assets_ready(_count: int) -> void:
	if shipyard != null:
		if shipyard.grid != null:
			shipyard.grid.queue_redraw()
		if shipyard.duel != null and shipyard.duel.flight_view != null:
			shipyard.duel.flight_view.queue_redraw()

func _build_range(face: Font) -> void:
	var heading := HBoxContainer.new()
	stage.add_child(heading)
	heading.add_child(label("전력 보급 사격장",29,WHITE))
	heading.add_spacer(false)
	time_label = label("",18,SOFT)
	heading.add_child(time_label)
	stage.add_child(label("반응로의 전력을 운반해 레이저로 장갑 표적을 파괴하세요.",16,SOFT))
	var middle := HBoxContainer.new()
	middle.size_flags_vertical = Control.SIZE_EXPAND_FILL
	middle.add_theme_constant_override("separation",14)
	stage.add_child(middle)
	var left := panel_column(middle)
	var map_heading := HBoxContainer.new()
	left.add_child(map_heading)
	map_heading.add_child(label("함선 단면도",18,WHITE))
	map_heading.add_spacer(false)
	state_label = label("",16,GREEN)
	map_heading.add_child(state_label)
	board = RangeView.new()
	board.sim = sim
	board.font = face
	board.size_flags_vertical = Control.SIZE_EXPAND_FILL
	left.add_child(board)
	tallies = label("",16,SOFT)
	left.add_child(tallies)
	var side := panel_column(middle)
	side.get_parent().size_flags_horizontal = Control.SIZE_SHRINK_END
	side.get_parent().custom_minimum_size.x = 305
	side.add_child(label("계통 상태",20,WHITE))
	_add_meter(side,"반응로 전력",GREEN)
	_add_meter(side,"레이저 전력",GOLD)
	_add_meter(side,"표적 장갑",Color("#ff9284"))
	side.add_child(HSeparator.new())
	for item in [["보급 통로 개방",sim.set_route_open],["포수 배치",sim.set_gunner_active],["사격 허가",sim.set_fire_enabled]]:
		var toggle := CheckButton.new()
		toggle.text = item[0]
		toggle.toggled.connect(item[1])
		switches.append(toggle)
		side.add_child(toggle)
	distance_label = label("",15,SOFT)
	side.add_child(distance_label)
	slider = HSlider.new()
	slider.min_value = 20
	slider.max_value = 320
	slider.step = 1
	slider.value_changed.connect(sim.set_target_distance)
	side.add_child(slider)
	var bottom := HBoxContainer.new()
	bottom.add_theme_constant_override("separation",12)
	stage.add_child(bottom)
	run_button = button("",_toggle_run)
	run_button.custom_minimum_size.x = 106
	bottom.add_child(run_button)
	bottom.add_child(button("한 단계  +0.25초",_step_once))
	var speed_select := OptionButton.new()
	for value in [1,2,4]:
		speed_select.add_item("%d× 속도" % value,value)
	speed_select.item_selected.connect(func(index: int): speed = speed_select.get_item_id(index))
	bottom.add_child(speed_select)
	bottom.add_child(button("처음부터",_reset))
	bottom.add_spacer(false)
	bottom.add_child(label("Space   실행 / 정지",14,SOFT))
	var history := panel_column(stage)
	history.add_child(label("최근 이벤트",15,GREEN))
	event_label = label("",15,WHITE)
	history.add_child(event_label)
	_sync_inputs()

func _add_meter(parent: Control, caption: String, color: Color) -> void:
	var row := HBoxContainer.new()
	parent.add_child(row)
	row.add_child(label(caption,15,SOFT))
	row.add_spacer(false)
	var value := label("",15,WHITE)
	row.add_child(value)
	var bar := ProgressBar.new()
	bar.custom_minimum_size.y = 6
	bar.show_percentage = false
	bar.add_theme_stylebox_override("background",box(EDGE,EDGE,0))
	bar.add_theme_stylebox_override("fill",box(color,color,0))
	parent.add_child(bar)
	meters.append({"text":value,"bar":bar})

func _show_tab(page: Control) -> void:
	for pair in [[shipyard,shipyard_tab],[stage,range_tab],[library,catalog_tab]]:
		pair[0].visible = pair[0] == page
		pair[1].modulate = GREEN if pair[0] == page else SOFT

func _physics_process(delta: float) -> void:
	if not sim.load_error.is_empty():
		return
	if running and stage.visible:
		sim.step(delta*speed)
		if sim.armor_hp <= 0:
			running = false
	if stage.visible:
		_refresh()

func _input(event: InputEvent) -> void:
	if stage != null and sim.load_error.is_empty() and stage.visible and event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_SPACE:
		_toggle_run()
		get_viewport().set_input_as_handled()

func _toggle_run() -> void:
	if sim.armor_hp <= 0:
		_reset()
	running = not running
	_refresh()

func _step_once() -> void:
	running = false
	if sim.armor_hp > 0:
		sim.step(0.25)
	_refresh()

func _reset() -> void:
	running = false
	sim.reset()
	_sync_inputs()
	_refresh()

func _sync_inputs() -> void:
	var states := [sim.route_open,sim.gunner_active,sim.fire_enabled]
	for i in switches.size():
		switches[i].set_pressed_no_signal(states[i])
	slider.set_value_no_signal(sim.target_distance)

func _refresh() -> void:
	state_label.text = STATUS.get(sim.status(), sim.status())
	time_label.text = "T + %06.2f s" % sim.elapsed
	tallies.text = "보급  %d회       발사  %d회       명중  %d회" % [sim.deliveries,sim.shots,sim.hits]
	run_button.text = "다시 실행" if sim.armor_hp <= 0 else ("일시 정지" if running else "실행")
	distance_label.text = "표적 거리     %d m" % sim.target_distance
	var values := [[sim.reactor_energy,sim.reactor_capacity],[sim.weapon_energy,sim.weapon_capacity],[sim.armor_hp,sim.armor_max_hp]]
	for i in meters.size():
		meters[i].text.text = "%d / %d" % values[i]
		meters[i].bar.max_value = maxf(values[i][1],1)
		meters[i].bar.value = values[i][0]
	var lines := PackedStringArray()
	for i in range(maxi(0,sim.events.size()-3), sim.events.size()):
		var item: Dictionary = sim.events[i]
		lines.append("%05.2f s   %s" % [item.time,EVENT_NAMES.get(item.kind,item.kind)])
	event_label.text = "실행하면 운반과 사격 기록이 표시됩니다." if lines.is_empty() else "     /     ".join(lines)
	board.queue_redraw()

func label(caption: String, point_size: int, color: Color) -> Label:
	var node := Label.new()
	node.text = caption
	node.add_theme_font_size_override("font_size",point_size)
	node.add_theme_color_override("font_color",color)
	return node

func button(caption: String, action: Callable) -> Button:
	var node := Button.new()
	node.text = caption
	node.pressed.connect(action)
	return node

func panel_column(parent: Control) -> VBoxContainer:
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.add_theme_stylebox_override("panel",box(SURFACE,EDGE,14))
	parent.add_child(panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation",7)
	panel.add_child(column)
	return column

func box(fill: Color, edge: Color, padding: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = edge
	style.set_border_width_all(1)
	style.set_corner_radius_all(5)
	for side in [SIDE_LEFT,SIDE_TOP,SIDE_RIGHT,SIDE_BOTTOM]:
		style.set_content_margin(side,padding)
	return style
