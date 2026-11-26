extends VBoxContainer

signal return_requested
signal finished(result: String)
const Battle = preload("res://sim/ship_battle.gd")
const CombatSystems = preload("res://sim/combat_systems.gd")
const SfxBank = preload("res://sim/sfx.gd")
const Grid = preload("res://ui/ship_grid.gd")
const FlightView = preload("res://ui/flight_view.gd")
const RESULTS := {"win":"승리", "loss":"패배", "draw":"무승부"}
const OUTCOMES := {
	"own_bridge":"아군 함교 파괴", "enemy_bridge":"적 함교 제압", "protected_bridge":"보호할 적 함교 파괴",
	"own_weapons":"아군 무장 상실", "disarmed":"적 무장 모두 제거", "survived":"대피 시간 확보", "mined":"목표 자원 채굴 완료",
	"mutual_bridge":"양쪽 함교 파괴", "mutual_weapons":"양쪽 무장 상실", "stalemate":"교전 교착",
}
const ACTIONS := {
	"shot":"발사", "hit":"명중", "destroyed":"부품 파괴", "delivery":"전력 전달",
	"shield_hit":"방어막 요격", "shield_down":"방어막 붕괴", "intercept":"미사일 요격",
	"fire_start":"화재 발생", "fire_out":"화재 진압", "blast":"광역 폭발", "mine":"자원 채굴",
}
const AIM := {"offline":"동력·인원 대기","out_of_range":"사거리 밖","out_of_arc":"포탑 사각","tracking":"조준 중","ready":"사격 가능"}

var lab
var battle
var paused := false
var speed := 1
var grids: Array[Control] = []
var health: Array[ProgressBar] = []
var metrics: Array[Label] = []
var supply_metrics: Array[Label] = []
var title: Label
var clock_label: Label
var target_label: Label
var log_label: Label
var pause_button: Button
var speed_button := OptionButton.new()
var cutaway: Control
var flight_page := HBoxContainer.new()
var flight_view
var view_button: Button
var cutaway_toggle_button: Button
var flight_readout: Label
var boost_button: Button
var propulsion_readout: Label
var overclock_button: Button
var thermal_readout: Label
var thermal_gauge: ProgressBar
var thermal_row: HBoxContainer
var engine_selector := OptionButton.new()
var thermal_engines: Array[Dictionary] = []
var engine_selector_uids: Array[int] = []
var selected_engine_uid := -1
var readiness: Label
var fleet_readout: Label
var shield_target_button: Button
var missile_mode_button: Button
var command_button: Button
var sfx_button: Button
var sfx
var _sfx_event_time := -1.0
var held := {}
var telemetry_age := 0.0

func build(host) -> void:
	lab = host
	sfx = SfxBank.new()
	add_child(sfx)
	visibility_changed.connect(func(): held.clear())
	get_window().focus_exited.connect(func(): held.clear())
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation",12)
	var header := HBoxContainer.new()
	add_child(header)
	title = lab.label("함대 교전",28,lab.WHITE)
	header.add_child(title)
	header.add_spacer(false)
	clock_label = lab.label("",16,lab.SOFT)
	header.add_child(clock_label)
	sfx_button = lab.button("음향 켬",_toggle_sfx)
	header.add_child(sfx_button)
	command_button = lab.button("명령: 수동",_cycle_command)
	command_button.focus_mode = Control.FOCUS_NONE
	header.add_child(command_button)
	cutaway_toggle_button = lab.button("내부 투시",_toggle_space_cutaway)
	cutaway_toggle_button.focus_mode = Control.FOCUS_NONE
	header.add_child(cutaway_toggle_button)
	view_button = lab.button("함선 내부",_switch_view)
	header.add_child(view_button)
	pause_button = lab.button("일시 정지",_pause)
	header.add_child(pause_button)
	for value in [1,2,4]:
		speed_button.add_item("%d×" % value,value)
	speed_button.item_selected.connect(func(i): speed = speed_button.get_item_id(i))
	header.add_child(speed_button)
	header.add_child(lab.button("조선소로",_leave))
	var arena := Control.new()
	cutaway = arena
	arena.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(arena)
	var ships := HBoxContainer.new()
	arena.add_child(ships)
	ships.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ships.add_theme_constant_override("separation",16)
	for is_enemy in [false,true]:
		var panel: VBoxContainer = lab.panel_column(ships)
		var color: Color = lab.GOLD if is_enemy else lab.GREEN
		var caption := HBoxContainer.new()
		panel.add_child(caption)
		caption.add_child(lab.label("적함" if is_enemy else "내 함선",21,color))
		caption.add_spacer(false)
		var logistics: Label = lab.label("",14,lab.SOFT)
		caption.add_child(logistics)
		supply_metrics.append(logistics)
		var bar := ProgressBar.new()
		bar.show_percentage = false
		bar.custom_minimum_size.y = 7
		bar.add_theme_stylebox_override("fill",lab.box(color,color,0))
		bar.add_theme_stylebox_override("background",lab.box(lab.EDGE,lab.EDGE,0))
		panel.add_child(bar)
		health.append(bar)
		var grid = Grid.new()
		grid.enemy_side = is_enemy
		grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
		if is_enemy:
			grid.cell_action.connect(_choose_cell)
		panel.add_child(grid)
		grids.append(grid)
		var line: Label = lab.label("",15,lab.SOFT)
		panel.add_child(line)
		metrics.append(line)
	_build_flight_page()
	var orders: VBoxContainer = lab.panel_column(self)
	var row := HBoxContainer.new()
	orders.add_child(row)
	row.add_child(lab.label("집중 사격",17,lab.WHITE))
	row.add_child(lab.button("적 함교",_choose_any.bind(CombatSystems.BRIDGE_IDS)))
	row.add_child(lab.button("적 무장",_choose_any.bind(CombatSystems.WEAPON_IDS)))
	shield_target_button = lab.button("적 방어막",_choose_any.bind(CombatSystems.SHIELD_IDS))
	row.add_child(shield_target_button)
	row.add_child(lab.button("적 반응로",_choose_any.bind(CombatSystems.REACTOR_IDS)))
	row.add_spacer(false)
	missile_mode_button = lab.button("탄두: HE",_cycle_missile_mode)
	missile_mode_button.focus_mode = Control.FOCUS_NONE
	row.add_child(missile_mode_button)
	boost_button = lab.button("B  부스트 켜기",_toggle_boost)
	boost_button.focus_mode = Control.FOCUS_NONE
	row.add_child(boost_button)
	overclock_button = lab.button("O  오버클럭 켜기",_toggle_overclock)
	overclock_button.focus_mode = Control.FOCUS_NONE
	row.add_child(overclock_button)
	var crew_legend: Label = lab.label("▲ 조종사   ◆ 포수   ■ 로켓 담당   ● 운반원   ▪ 배터리",14,lab.SOFT)
	row.add_child(crew_legend)
	cutaway.visibility_changed.connect(func(): crew_legend.visible = cutaway.visible)
	crew_legend.visible = cutaway.visible
	target_label = lab.label("",15,lab.GOLD)
	orders.add_child(target_label)
	propulsion_readout = lab.label("",15,lab.GREEN)
	propulsion_readout.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	orders.add_child(propulsion_readout)
	thermal_row = HBoxContainer.new()
	thermal_row.add_child(lab.label("엔진 열",14,lab.SOFT))
	engine_selector.item_selected.connect(_select_engine)
	thermal_row.add_child(engine_selector)
	thermal_gauge = ProgressBar.new()
	thermal_gauge.show_percentage = false
	thermal_gauge.custom_minimum_size = Vector2(120,12)
	thermal_gauge.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	thermal_gauge.add_theme_stylebox_override("fill",lab.box(lab.GOLD,lab.GOLD,0))
	thermal_gauge.add_theme_stylebox_override("background",lab.box(lab.EDGE,lab.EDGE,0))
	thermal_row.add_child(thermal_gauge)
	thermal_readout = lab.label("",14,lab.SOFT)
	thermal_readout.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	thermal_readout.clip_text = true
	thermal_row.add_child(thermal_readout)
	orders.add_child(thermal_row)
	log_label = lab.label("",15,lab.SOFT)
	log_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	orders.add_child(log_label)

func _build_flight_page() -> void:
	flight_page.size_flags_vertical = Control.SIZE_EXPAND_FILL
	flight_page.add_theme_constant_override("separation",12)
	add_child(flight_page)
	var radar: VBoxContainer = lab.panel_column(flight_page)
	flight_view = FlightView.new()
	flight_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	flight_view.target_selected.connect(_select_uid)
	radar.add_child(flight_view)
	var console: VBoxContainer = lab.panel_column(flight_page)
	console.get_parent().custom_minimum_size.x = 255
	console.get_parent().size_flags_horizontal = Control.SIZE_SHRINK_END
	console.add_child(lab.label("비행 계기",21,lab.WHITE))
	flight_readout = lab.label("",16,lab.SOFT)
	console.add_child(flight_readout)
	readiness = lab.label("",15,lab.GREEN)
	readiness.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	console.add_child(readiness)
	console.add_child(HSeparator.new())
	console.add_child(lab.label("직접 조종",17,lab.WHITE))
	var pad := GridContainer.new()
	pad.columns = 3
	console.add_child(pad)
	for entry in [["Q  좌회전","flight_turn_left"],["W  전진","flight_forward"],["E  우회전","flight_turn_right"],
		["A  좌현","flight_port"],["S  후진","flight_reverse"],["D  우현","flight_starboard"]]:
		var key := Button.new()
		key.text = entry[0]
		key.focus_mode = Control.FOCUS_NONE
		key.add_theme_font_size_override("font_size",13)
		key.button_down.connect(_set_held.bind(entry[1],true))
		key.button_up.connect(_set_held.bind(entry[1],false))
		pad.add_child(key)
	console.add_child(lab.label("키 또는 버튼을 길게 누르세요.",14,lab.SOFT))
	console.add_child(HSeparator.new())
	fleet_readout = lab.label("",15,lab.WHITE)
	console.add_child(fleet_readout)

func _set_held(action: String,pressed: bool) -> void:
	held[action] = pressed

func _unhandled_input(event: InputEvent) -> void:
	if not is_visible_in_tree():
		return
	if event.is_action_pressed("flight_boost") and boost_button.visible:
		_toggle_boost()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("flight_overclock") and overclock_button.visible:
		_toggle_overclock()
		get_viewport().set_input_as_handled()

func _toggle_sfx() -> void:
	if sfx == null:
		return
	sfx.enabled = not sfx.enabled
	sfx_button.text = "음향 켬" if sfx.enabled else "음향 끔"

func _cycle_missile_mode() -> void:
	if battle == null or battle.result != "active":
		return
	var order := ["he", "emp", "nuke", "thermal", "mine"]
	var idx := (order.find(battle.missile_mode) + 1) % order.size()
	battle.set_missile_mode(order[idx])
	_refresh()

func _cycle_command() -> void:
	if battle == null or battle.result != "active":
		return
	var order := ["manual", "attack", "standoff", "orbit", "salvage"]
	var idx := (order.find(battle.player_command) + 1) % order.size()
	battle.set_player_command(order[idx])
	_refresh()

func _toggle_space_cutaway() -> void:
	if flight_view == null:
		return
	flight_view.show_cutaway = not flight_view.show_cutaway
	cutaway_toggle_button.text = "외장 보기" if flight_view.show_cutaway else "내부 투시"
	flight_view.queue_redraw()

func _play_new_sfx() -> void:
	if sfx == null or battle == null:
		return
	var newest := _sfx_event_time
	for ev in battle.events:
		var t := float(ev.get("time", 0.0))
		if t <= _sfx_event_time:
			continue
		if t > newest:
			newest = t
		var kind := str(ev.get("kind", ""))
		if kind == "shot":
			var side_ship: Dictionary = battle.player if ev.get("side") == "player" else battle.enemy
			var part: Dictionary = side_ship.parts.get(int(ev.get("uid", -1)), {})
			var wkind := str(part.get("stats", {}).get("weapon_kind", "laser"))
			sfx.play("shot_" + wkind)
		elif kind == "fire_start":
			sfx.play("fire_ignite")
		elif kind in ["shield_hit", "shield_down", "intercept", "destroyed"]:
			sfx.play(kind)
	_sfx_event_time = newest

func _toggle_overclock() -> void:
	if battle == null or paused or battle.result != "active":
		return
	var state: Dictionary = battle.overclock_state()
	battle.request_overclock(not bool(state.get("active",false)))
	_refresh()

func _select_engine(index: int) -> void:
	if index >= 0 and index < thermal_engines.size():
		selected_engine_uid = int(thermal_engines[index].get("uid",-1))
		_update_overclock_readout()

func _toggle_boost() -> void:
	if battle == null or paused or battle.result != "active":
		return
	var state: Dictionary = battle.propulsion_state(battle.player)
	battle.request_boost(state.boost_active == 0)
	_refresh()

func _axis(negative: String,positive: String) -> float:
	var a := maxf(Input.get_action_strength(negative),float(held.get(negative,false)))
	var b := maxf(Input.get_action_strength(positive),float(held.get(positive,false)))
	return b-a

func _switch_view() -> void:
	flight_page.visible = not flight_page.visible
	cutaway.visible = not flight_page.visible
	view_button.text = "함선 내부" if flight_page.visible else "비행 화면"
	held.clear()
	_refresh()

func _select_uid(uid: int) -> void:
	if battle != null and battle.select_target(uid):
		_refresh()

func launch(design, mission: Dictionary = {}) -> bool:
	battle = Battle.new()
	if not battle.start(design, null, mission):
		return false
	for i in grids.size():
		grids[i].design = battle.player_design if i == 0 else battle.enemy_design
		grids[i].battle = battle
	flight_view.battle = battle
	flight_page.show()
	cutaway.hide()
	view_button.text = "함선 내부"
	held.clear()
	telemetry_age = 0
	_sfx_event_time = -1.0
	paused = false
	speed = 1
	speed_button.select(0)
	_refresh()
	return true

func _physics_process(delta: float) -> void:
	if not is_visible_in_tree() or battle == null:
		return
	if not paused and battle.result == "active":
		battle.set_flight_input(Vector2(_axis("flight_reverse","flight_forward"),_axis("flight_port","flight_starboard")),_axis("flight_turn_left","flight_turn_right"))
		battle.step(delta*speed)
		_play_new_sfx()
		if flight_page.visible:
			flight_view.queue_redraw()
		else:
			for grid in grids:
				grid.queue_redraw()
		telemetry_age += delta
		if telemetry_age >= 0.1 or battle.result != "active":
			telemetry_age = 0.0
			_refresh()
		if battle.result != "active":
			finished.emit(battle.result)

func _choose_cell(cell: Vector2i, erase: bool) -> void:
	if erase or battle == null or battle.result != "active":
		return
	var hit: Dictionary = battle.enemy_design.part_at(cell)
	if not hit.is_empty() and battle.select_target(hit.uid):
		_refresh()

func _choose_type(id: String) -> void:
	_choose_any([id])

func _choose_any(ids: Array) -> void:
	if battle == null or battle.result != "active":
		return
	for id in ids:
		for part in battle.enemy.parts.values():
			if part.id == id and part.hp > 0 and battle.select_target(part.uid):
				_refresh()
				return

func _pause() -> void:
	if battle.result == "active":
		paused = not paused
		_refresh()

func _leave() -> void:
	paused = true
	held.clear()
	return_requested.emit()

func _refresh() -> void:
	var active: bool = battle.result == "active"
	var mission: Dictionary = battle.mission
	title.text = str(mission.get("title","함선 교전")) if active else "교전 종료   ·   " + RESULTS.get(battle.result,battle.result)
	pause_button.text = "계속" if paused else "일시 정지"
	pause_button.disabled = not active
	clock_label.text = "T + %05.1f s    " % battle.elapsed
	if active and mission.get("objective") == "survive":
		clock_label.text = "대피까지 %.1f초  " % maxf(0.0, float(mission.seconds) - battle.elapsed)
	elif active and mission.get("objective") == "mine":
		clock_label.text = "채굴 %d / %d CR  " % [int(battle.mined_credits), int(battle.mining_goal)]
	var sides := [battle.player,battle.enemy]
	var hull_report := PackedStringArray()
	for i in sides.size():
		var team: Dictionary = sides[i]
		var bridge_hp := 0.0
		var bridge_max := 0.0
		var weapon_energy := 0
		var carrying := 0
		for part in team.parts.values():
			if CombatSystems.is_bridge(part.id):
				bridge_hp += part.hp
				bridge_max += part.max_hp
			elif CombatSystems.is_weapon(part.id):
				weapon_energy += int(part.energy)
		for crew in team.crew:
			if crew.alive and crew.cargo > 0:
				carrying += 1
		var def: Dictionary = Battle.defense_state(team)
		supply_metrics[i].text = ("무장 전력 %d · 방어막 %d · 운반 %d명" % [weapon_energy, roundi(def.shield_hp), carrying]) if def.shield_count > 0 else ("무장 전력 %d   ·   배터리 운반 %d명" % [weapon_energy,carrying])
		health[i].max_value = maxf(bridge_max,1)
		health[i].value = bridge_hp
		var line_txt := "%s 함교   %d / %d" % ["아군" if i == 0 else "적",bridge_hp,bridge_max]
		if def.shield_count > 0:
			line_txt += "  (방어막 %d)" % roundi(def.shield_hp)
		hull_report.append(line_txt)
		metrics[i].text = "함교 %d / %d     보급 %d    발사 %d    명중 %d" % [bridge_hp,bridge_max,team.deliveries,team.shots,team.hits]
		grids[i].queue_redraw()
	shield_target_button.visible = Battle.defense_state(battle.enemy).shield_count > 0
	var has_missiles: bool = not battle.player.ids.get(CombatSystems.MISSILE_LAUNCHER, []).is_empty()
	missile_mode_button.visible = has_missiles
	missile_mode_button.text = "탄두: " + battle.missile_mode.to_upper()
	var cmd_labels := {"manual":"수동", "attack":"공격", "standoff":"원거리", "orbit":"선회", "salvage":"채굴·인양"}
	command_button.text = "명령: " + str(cmd_labels.get(battle.player_command, "수동"))
	var target: Dictionary = battle.enemy.parts.get(battle.target_uid,{})
	var focus := "없음" if target.is_empty() else "%s  ·  HP %d / %d" % [lab.shipyard.display_name(target.id),target.hp,target.max_hp]
	var goal := "적 함교 제압"
	match mission.get("objective"):
		"disarm":
			goal = "적 무장 제거 · 적 함교 보호"
		"survive":
			goal = "대피 완료까지 아군 함교 유지"
		"mine":
			goal = "소행성 자원 채굴 (%d / %d CR)" % [int(battle.mined_credits), int(battle.mining_goal)]
	target_label.text = "현재 표적  %s      ·      %s" % [focus,goal]
	if not active:
		target_label.text = "%s     ·     %.1f초     ·     발사 %d회     ·     명중 %d회" % [
			OUTCOMES.get(battle.outcome_reason,"교전 종료"), battle.elapsed, battle.player.shots, battle.player.hits
		]
	var recent := PackedStringArray()
	for i in range(battle.events.size()-1,-1,-1):
		var event: Dictionary = battle.events[i]
		if ACTIONS.has(event.kind):
			recent.append("%04.1f초  %s %s" % [event.time,"아군" if event.side == "player" else "적",ACTIONS[event.kind]])
		if recent.size() >= 3:
			break
	recent.reverse()
	log_label.text = "승무원이 전투 위치로 이동 중입니다." if recent.is_empty() else "     /     ".join(recent)
	fleet_readout.text = "\n".join(hull_report)
	_update_flight_readout()
	flight_view.queue_redraw()

func _update_flight_readout() -> void:
	var ship: Dictionary = battle.player
	var range_m: float = ship.position.distance_to(battle.enemy.position)
	var installed := 0
	var firing := 0
	var aim_states := PackedStringArray()
	for part in ship.parts.values():
		if not part.nozzles.is_empty():
			installed += 1
			if part.activation > 0.01:
				firing += 1
		elif CombatSystems.is_weapon(part.id) and part.hp > 0:
			var caption: String = AIM.get(part.get("aim_status","offline"),"조준 대기")
			if not aim_states.has(caption):
				aim_states.append(caption)
	var heading := fposmod(rad_to_deg(ship.heading),360.0)
	flight_readout.text = "적함 거리    %.1f m\n속력           %.1f m/s\n선수 방위    %03d°\n추력 발생    %d / %d기" % [range_m,ship.velocity.length(),roundi(heading)%360,firing,installed]
	if installed == 0:
		readiness.text = "추진기 미장착 · 정지 포대"
	elif not ship.command:
		readiness.text = "함교 전력 및 조종사 대기"
	else:
		var bearing: float = wrapf((battle.enemy.position-ship.position).angle()-ship.heading,-PI,PI)
		readiness.text = "상대 방위   %s %.0f°" % ["우현" if bearing >= 0 else "좌현",absf(rad_to_deg(bearing))]
	readiness.text += "\n무장   " + ("파괴됨" if aim_states.is_empty() else " / ".join(aim_states))
	var pdef: Dictionary = Battle.defense_state(ship)
	if pdef.shield_count > 0 or pdef.pd_count > 0 or pdef.active_fires > 0:
		var def_parts := PackedStringArray()
		if pdef.shield_count > 0:
			def_parts.append("방어막 %d/%d" % [roundi(pdef.shield_hp), roundi(pdef.shield_max_hp)])
		if pdef.pd_count > 0:
			def_parts.append("PD 요격 %d" % int(pdef.pd_intercepts))
		if pdef.active_fires > 0:
			def_parts.append("화재 %d" % int(pdef.active_fires))
		readiness.text += "\n" + " · ".join(def_parts)
	var state: Dictionary = battle.propulsion_state(ship)
	boost_button.visible = state.boost_count > 0
	boost_button.disabled = paused or battle.result != "active" or (state.boost_active == 0 and state.boost_ready == 0)
	boost_button.text = "B  부스트 끄기" if state.boost_active > 0 else ("B  부스트 켜기" if state.boost_ready > 0 else "부스트 충전 중")
	if state.boost_active == 0 and not ship.command:
		boost_button.text = "부스트 · 함교 대기"
	boost_button.tooltip_text = "B로 전환합니다. 작동 중 보급이 중단되며, 사용 후 끄면 남은 전력이 방전됩니다."
	var lines := PackedStringArray()
	if state.boost_count > 0:
		lines.append("부스트 %s   전력 %d / %d" % ["작동 %d기" % state.boost_active if state.boost_active > 0 else "대기",state.boost_energy,state.boost_capacity])
	if state.rocket_count > 0:
		lines.append("로켓 담당 %d/%d명   전력 %d/%d   추력 %d   소모 %.0f/초" % [state.rocket_staffed,state.rocket_required,state.rocket_energy,state.rocket_capacity,state.rocket_current_force,state.rocket_current_rate])
	propulsion_readout.visible = not lines.is_empty()
	propulsion_readout.text = "     |     ".join(lines)
	_update_overclock_readout()

func _update_overclock_readout() -> void:
	var state: Dictionary = battle.overclock_state()
	thermal_engines.clear()
	for engine in state.get("engines",[]):
		thermal_engines.append(engine)
	var selected_index := -1
	var current_uids: Array[int] = []
	for i in thermal_engines.size():
		current_uids.append(int(thermal_engines[i].get("uid",-1)))
		if int(thermal_engines[i].get("uid",-1)) == selected_engine_uid:
			selected_index = i
	if current_uids != engine_selector_uids:
		engine_selector.clear()
		engine_selector_uids = current_uids.duplicate()
		var names := {}
		for engine in thermal_engines:
			var name: String = lab.shipyard.display_name(engine.id)
			names[name] = int(names.get(name,0)) + 1
		var duplicate_index := {}
		for engine in thermal_engines:
			var name: String = lab.shipyard.display_name(engine.id)
			var caption := name
			if int(names[name]) > 1:
				duplicate_index[name] = int(duplicate_index.get(name,0)) + 1
				caption += " %d" % duplicate_index[name]
			engine_selector.add_item(caption)
	if selected_index < 0 and not thermal_engines.is_empty():
		selected_index = 0
		selected_engine_uid = int(thermal_engines[0].get("uid",-1))
	if selected_index >= 0:
		engine_selector.select(selected_index)
	var installed := int(state.get("installed",0))
	overclock_button.visible = installed > 0
	thermal_row.visible = installed > 0
	engine_selector.visible = thermal_engines.size() > 1
	thermal_gauge.visible = installed > 0
	thermal_readout.visible = installed > 0
	if installed == 0:
		return
	var engine: Dictionary = thermal_engines[selected_index] if selected_index >= 0 and selected_index < thermal_engines.size() else {}
	var limit := maxf(float(engine.get("limit",1.0)),0.001)
	var heat := float(engine.get("heat",0.0))
	thermal_gauge.max_value = limit
	thermal_gauge.value = clampf(heat,0.0,limit)
	var condition := "과열 차단" if bool(engine.get("tripped",false)) else ("연결됨" if bool(engine.get("linked",false)) else "연결 대기")
	var engine_linked := bool(engine.get("linked",false))
	var boosted := bool(engine.get("boosted",false))
	var tripped_engine := bool(engine.get("tripped",false))
	var overclocked := bool(state.get("active",false)) and int(state.get("online",0)) > 0 and engine_linked and not tripped_engine
	var mode := "과열 잠금" if tripped_engine else ("부스트 + 오버클럭" if boosted and overclocked else ("부스트" if boosted else ("오버클럭" if overclocked else "일반")))
	thermal_readout.text = "%s  ·  추력 %.0f  ·  전력 %.1f/초  ·  열 %.0f/%.0f (%+.1f/초)  ·  %s" % [mode,float(engine.get("force",0.0)),float(engine.get("power",0.0)),heat,limit,float(engine.get("heat_rate",0.0)),condition]
	var active := bool(state.get("active",false))
	var usable := bool(state.get("ready",false))
	var online := int(state.get("online",0))
	var linked := int(state.get("linked",0))
	var tripped := int(state.get("tripped",0))
	overclock_button.disabled = paused or battle.result != "active" or (not active and not usable)
	overclock_button.text = "O  오버클럭 끄기" if active else ("오버클럭 · 과열 잠금" if tripped > 0 else ("오버클럭 · 엔진/함교 대기" if online == 0 or linked == 0 else "O  오버클럭 켜기"))
	overclock_button.tooltip_text = "%d기 장착 · %d기 가동 · %d기 연결 · %d기 과열 차단" % [installed,online,linked,tripped]
