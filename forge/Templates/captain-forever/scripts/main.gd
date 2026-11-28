extends Node2D

const ShipBodyScript = preload("res://scripts/ship_body.gd")
const NeutralPartScript = preload("res://scripts/neutral_part.gd")
const ProjectileScript = preload("res://scripts/projectile.gd")
const BackgroundScript = preload("res://scripts/background.gd")
const HudOverlayScript = preload("res://scripts/hud_overlay.gd")
const EnemyShipScript = preload("res://scripts/enemy_ship.gd")
const BalanceData = preload("res://scripts/balance.gd")
const VisualData = preload("res://scripts/visual_tuning.gd")
const PhysicsData = preload("res://scripts/physics_tuning.gd")
const DialogueOverlayScript = preload("res://scripts/dialogue_overlay.gd")
const NarrativeScript = preload("res://scripts/narrative_data.gd")
const GrappleTetherScript = preload("res://scripts/grapple_tether.gd")
const DeveloperModeScript = preload("res://scripts/developer_mode.gd")
const ShipDestructionEffectScript = preload("res://scripts/ship_destruction_effect.gd")
const TrackingOrderScript = preload("res://scripts/target_tracking_order.gd")
const TrackingVisual = preload("res://scripts/target_tracking_visual.gd")
const CombatFxScript = preload("res://scripts/combat_fx.gd")
const SonarPulseScript = preload("res://scripts/sonar_pulse.gd")
const SonarResultPopupScript = preload("res://scripts/sonar_result_popup.gd")
const ModeSwitcherScript = preload("res://scripts/mode_switcher.gd")

var player: ShipBody
var camera: Camera2D
var held_part: PartData
var held_tag := ""
var held_from_ship := false
var held_original_cell := Vector2i.ZERO
var held_original_turn := 0
var pointer_world := Vector2.ZERO
var touch_index := -1
var user_paused := false
var route_step := 0
var active_boss: EnemyShip
var campaign_complete := false
var victory_ship: ShipBody
var left_press_started_holding := false
var left_dragged := false
var left_press_position := Vector2.ZERO
var right_drag_start := Vector2.ZERO
var rotating_view := false
var target_marker := Vector2.ZERO
var selected_target: EnemyShip
var navigation_target := Vector2.ZERO
var navigation_active := false
var nav_fail_banner_timer := 0.0
var tracking_order = TrackingOrderScript.new()
var message := "WASD: 추력/회전 · Q/E: 횡추진 · SPACE: 주무기 · F: 미사일 · G: 그래플 · V: 감기 · X: 소나 · B: 부스트 · 상단 바: 빌드 모드"
var message_time := 8.0
var world_layer: Node2D
var combat_fx: CombatFxLayer
var hud
var dialogue
var salvage_count := 0
var kill_count := 0
var kill_streak := 0
var streak_timer := 0.0
var overdrive_charge := 100.0
var overdrive_timer := 0.0
var tractor_links: Array[Vector2] = []
var enemies: Array[EnemyShip] = []
var enemy_spawn_timer := 3.0
var stations: Array[Dictionary] = []
var upgrades := {"hull":0, "weapon":0, "cooling":0, "missile_guidance":0, "missile_range":0, "shield_layers":0, "shield_recharge":0}
var tutorial_stage := "inactive"
var narrative_events := {}
var grapple
var grapple_reel_toggle := false
var active_sonar: SonarPulse
var sonar_popup: SonarResultPopup
var mode_switcher: ModeSwitcher
var cosmo_sfx: CosmoteerSfx
var sonar_cooldown := 0.0
var developer_mode_active := false
var developer_overlay
var player_destroyed := false
var skip_automation_hook := false
var ram_cooldowns: Dictionary = {}
var _hud_sync_accum := 0.0
var _main_draw_accum := 0.0
var _pinch_touches: Dictionary = {}
var _pinch_active := false
var _pinch_prev_dist := 0.0

func _install_ui_font() -> void:
	if FileAccess.file_exists("res://assets/fonts/captain-ui.txt"):
		var raw := FileAccess.get_file_as_string("res://assets/fonts/captain-ui.txt").strip_edges()
		if not raw.is_empty():
			var ff := FontFile.new()
			ff.data = Marshalls.base64_to_raw(raw)
			ThemeDB.fallback_font = ff


func _ready() -> void:
	if get_tree() != null and get_tree().root != null:
		get_tree().root.set_meta("playhub_native_touch_controls", true)
	_install_ui_font()
	process_mode = Node.PROCESS_MODE_ALWAYS
	developer_mode_active = developer_mode_requested()
	world_layer = Node2D.new()
	world_layer.process_mode = Node.PROCESS_MODE_PAUSABLE
	world_layer.name = "World"
	add_child(world_layer)
	var background = BackgroundScript.new()
	world_layer.add_child(background)
	player = ShipBodyScript.new()
	player.name = "PlayerShip"
	player.position = Vector2.ZERO
	world_layer.add_child(player)
	player.initialize_player()
	player.rotation = -PI * 0.5 - player.forward_angle_offset()
	combat_fx = CombatFxScript.new()
	combat_fx.name = "CombatFx"
	combat_fx.z_index = 20
	world_layer.add_child(combat_fx)
	var canvas_layer := CanvasLayer.new()
	add_child(canvas_layer)
	hud = HudOverlayScript.new()
	hud.ship = player
	canvas_layer.add_child(hud)
	hud.weapon_requested.connect(handle_hud_weapon)
	hud.utility_requested.connect(handle_utility)
	hud.radar_navigation_requested.connect(set_navigation_destination)
	dialogue = DialogueOverlayScript.new()
	canvas_layer.add_child(dialogue)
	dialogue.choice_selected.connect(handle_dialogue_choice)
	dialogue.dialogue_closed.connect(func(_id: String): sync_pause_state())
	sonar_popup = SonarResultPopupScript.new()
	add_child(sonar_popup)
	cosmo_sfx = CosmoteerSfx.new()
	add_child(cosmo_sfx)
	mode_switcher = ModeSwitcherScript.new()
	mode_switcher.setup("main")
	add_child(mode_switcher)
	hud.announce(message)
	camera = Camera2D.new()
	camera.ignore_rotation = false
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 8.0
	camera.zoom = Vector2.ONE * clampf(290.0 / maxf(player.hull_bound_radius, 140.0), 0.34, 1.0)
	world_layer.add_child(camera)
	spawn_asteroid_field()
	spawn_stations()
	narrative_events["first_hostile"] = true
	spawn_enemy(1, "", "roamer")
	if developer_mode_active:
		developer_overlay = DeveloperModeScript.new()
		add_child(developer_overlay)
		developer_overlay.mode_selected.connect(_on_developer_mode_selected)
	queue_redraw()
	update_weapon_hud()
	update_mission_hud()
	_refresh_radar_blips()
	sync_pause_state()

func gameplay_blocked() -> bool:
	return developer_mode_active or user_paused or campaign_complete or (dialogue != null and dialogue.is_showing())

func sync_pause_state() -> void:
	if gameplay_blocked() and tracking_order.dragging:
		cancel_target_tracking()
	get_tree().paused = gameplay_blocked()
	if hud != null:
		hud.input_enabled = not gameplay_blocked() and not player_destroyed
		hud.clock_running = hud.input_enabled
		hud.pause_label = "PAUSED · P / ESC / 일시정지 버튼으로 계속" if user_paused else ("COMMS · 선택 / ENTER로 계속" if dialogue.is_showing() else "")
	if dialogue != null:
		dialogue.visible = not developer_mode_active
		dialogue.set_process_input(not developer_mode_active)

func _exit_tree() -> void:
	get_tree().paused = false

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		_pinch_touches.clear()
		_pinch_active = false
		_pinch_prev_dist = 0.0
		touch_index = -1
		if tracking_order.dragging:
			cancel_target_tracking()

func _input(event: InputEvent) -> void:
	# 터치 릴리스/취소는 UI나 추적이 소비하더라도 핀치·터치 상태를 항상 정리한다.
	if event is InputEventScreenTouch and (not event.pressed or event.canceled):
		_pinch_touches.erase(event.index)
		if _pinch_touches.size() < 2:
			_pinch_prev_dist = 0.0
		if _pinch_touches.is_empty():
			_pinch_active = false
		if event.index == touch_index and not tracking_order.dragging:
			touch_index = -1
	# GUI가 릴리스를 소비해도 월드에서 시작한 제스처는 항상 종료한다.
	if tracking_order.dragging:
		if event is InputEventMouse and event.device == -1: return
		if event is InputEventMouseMotion:
			if event.position.distance_squared_to(left_press_position) >= 36.0:
				left_dragged = true
			if left_dragged: update_tracking_drag(viewport_to_world(event.position))
			get_viewport().set_input_as_handled()
			return
		if event is InputEventScreenDrag and event.index == touch_index:
			if event.position.distance_squared_to(left_press_position) >= 36.0:
				left_dragged = true
			if left_dragged: update_tracking_drag(viewport_to_world(event.position))
			get_viewport().set_input_as_handled()
			return
		var mouse_release: bool = event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed
		var touch_release: bool = event is InputEventScreenTouch and event.index == touch_index and (not event.pressed or event.canceled)
		if mouse_release or touch_release:
			if left_dragged: update_tracking_drag(viewport_to_world(event.position))
			finish_tracking_drag()
			touch_index = -1
			get_viewport().set_input_as_handled()
			return
	if developer_mode_active or (dialogue != null and dialogue.is_showing()):
		return
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F9:
			get_tree().change_scene_to_file("res://scenes/grapple_test_map.tscn")
			get_viewport().set_input_as_handled()
			return
		if event.keycode in [KEY_P, KEY_ESCAPE] and not campaign_complete:
			if event.keycode == KEY_ESCAPE and (tracking_order.active or tracking_order.dragging):
				cancel_target_tracking()
			elif held_part != null:
				cancel_held_part()
			else:
				user_paused = not user_paused
			sync_pause_state()
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_H:
			handle_utility("help")
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_X:
			handle_utility("sonar")
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_T:
			handle_utility("repair")
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_Q and held_part != null:
			held_part.quarter_turn = posmod(held_part.quarter_turn + 1, 4)
			get_viewport().set_input_as_handled()

func handle_utility(action: String) -> void:
	if action == "display_mode" and not developer_mode_active:
		toggle_module_display()
		return
	if developer_mode_active or dialogue.is_showing():
		return
	match action:
		"restart":
			if player_destroyed:
				get_tree().paused = false
				get_tree().reload_current_scene()
		"pause":
			user_paused = not user_paused
			sync_pause_state()
		"help":
			queue_dialogue({"id":"controls", "speaker":"PILOT MANUAL", "icon":"KEYS", "title":"코스모티어 6-DOF 조종 · 전술 · 물리", "body":"W/S 전후진 · A/D 회전 · Q/E 횡추진(스트레이프) · 손을 떼면 자동 역추진 제동. 방어막 생성기는 바라보는 방향으로 136° 아크만 방호하므로 적의 후방 엔진부를 우회 타격할 수 있습니다. 추진기 배기구 앞이나 노즐이 선체에 막히는 방향은 배기 간섭으로 설치가 불가하며, 레일건은 경장갑을 관통하고 탄약고·배터리 파괴 시 내부 유폭이 발생합니다. 적 드래그로 궤도·사선 고정 추적(함선 고스트 미리보기). 부품 회수 중 Q 회전 / 정거장 인접 시 E 도킹 수리.", "choices":[]})
		"station":
			if not gameplay_blocked() and not player_destroyed: use_station()
		"repair":
			if not gameplay_blocked() and not player_destroyed:
				player.repair_all()
				if camera != null and player.hull_bound_radius > 190.0:
					set_zoom_level(clampf(290.0 / player.hull_bound_radius, 0.34, 1.0), false)
				announce("REPAIR COMPLETE · 빌드모드 도안으로 함선 복구 완료 (%d파트)" % player.model.parts.size())
		"power_grid":
			if player != null:
				player.show_power_overlay = not player.show_power_overlay
				player.queue_redraw()
				if player.interior != null:
					announce("ONI 전력망 %s · 발전 %.0fW / 소비 %.0fW · 배터리 %.0fJ" % [
						"표시 ON" if player.show_power_overlay else "표시 OFF",
						player.interior.power_produced_w, player.interior.power_consumed_w, player.interior.total_battery_j
					])
		"interior_mode":
			get_tree().paused = false
			get_tree().change_scene_to_file("res://scenes/interior_command_mode.tscn")
		"ftl_subtarget":
			if player != null and player.interior != null:
				var order := ["core", "weapons", "shields", "flight"]
				var labels := {"core": "코어 (중추)", "weapons": "무장 구획", "shields": "방어막 구획", "flight": "추진 구획"}
				var cur_i := order.find(player.interior.enemy_target_subsystem)
				var nxt_sub: String = order[(cur_i + 1) % order.size()]
				player.interior.enemy_target_subsystem = nxt_sub
				announce("FTL 정밀 조준 전환 · 적함 [%s] 집중 타격" % str(labels.get(nxt_sub, nxt_sub)))
		"quick_attach":
			if not gameplay_blocked() and not player_destroyed: quick_attach_module()
		"sonar":
			if not gameplay_blocked() and not player_destroyed: trigger_sonar_pulse()
		"rotate_part":
			if held_part != null and not gameplay_blocked(): held_part.quarter_turn = posmod(held_part.quarter_turn + 1, 4)
		"cancel_part":
			if held_part != null and not gameplay_blocked(): cancel_held_part()
		"route":
			if not gameplay_blocked() and not player_destroyed and route_step < 6:
				set_navigation_destination(current_waypoint().position)

func toggle_module_display() -> void:
	VisualData.use_textured_design = not VisualData.use_textured_design
	for node in world_layer.get_children():
		if node is ShipBody:
			if is_instance_valid(node.voxel_renderer): node.voxel_renderer.refresh_display_mode()
			node.queue_redraw()
		elif node is NeutralPart:
			node.queue_redraw()
	hud.queue_redraw()
	announce("DESIGN · 텍스처 디자인 모드" if VisualData.use_textured_design else "MODULE CHEAT · 무텍스처 모듈·내구도 보기")

func _process(_delta: float) -> void:
	if hud == null or player == null or developer_mode_active: return
	if (tracking_order.active or tracking_order.dragging) and not tracking_order.valid():
		cancel_target_tracking()
	if not gameplay_blocked() and not player_destroyed:
		player.turret_target = weapon_aim_point()
	update_module_inspector(get_global_mouse_position() if touch_index == -1 else pointer_world)

func update_module_inspector(point: Vector2) -> void:
	hud.module_title = ""
	hud.module_detail = ""
	var inspected_ship: ShipBody = player
	var inspected: PartData = held_part
	var owner_label := "배치 중" if inspected != null else "내 함선"
	if inspected == null:
		inspected = player.model.part_at(player.local_cell_at(point))
	if inspected == null:
		inspected_ship = nearest_enemy_at(point, 0.0)
		if inspected_ship != null: inspected = inspected_ship.model.part_at(inspected_ship.local_cell_at(point))
		owner_label = "NPC"
	if inspected == null:
		for node in world_layer.get_children():
			if node is NeutralPart and not node.is_queued_for_deletion() and node.contains_world_point(point):
				inspected = node.part
				owner_label = "중립 부품"
				break
	if inspected == null: return
	var spec := inspected.spec()
	hud.module_title = "%s · %s [%s]" % [owner_label, spec.get("display_name", spec.label), inspected.kind]
	hud.module_detail = "Hull %.0f/%.0f · 질량 %.2f · 추력 %.0f · Power %+.0f" % [inspected.hp, inspected.max_hp, float(spec.mass), float(spec.get("force", 0)), float(spec.get("power", 0))]

func current_waypoint() -> Dictionary:
	var index := floori(float(route_step) / 2.0)
	return BalanceData.WORLD.stations[index] if route_step % 2 == 0 else BalanceData.WORLD.bosses[index]

func developer_mode_requested() -> bool:
	for argument in OS.get_cmdline_args() + OS.get_cmdline_user_args():
		if str(argument) == "--edit-mode":
			return true
	return false

func _on_developer_mode_selected(mode: String) -> void:
	if mode != DeveloperModeScript.MODE_TEST_PILOT:
		return
	developer_mode_active = false
	player.refresh_part_tuning()
	if developer_overlay != null:
		developer_overlay.queue_free()
		developer_overlay = null
	sync_pause_state()

func spawn_salvage(_kind: String, _at: Vector2, _narrative_tag: String = "") -> void:
	# 전투 중 떠다니는 아이템(잔해) 생성 비활성화
	return

func spawn_enemy(level: int, boss_name: String = "", forced_archetype: String = "") -> void:
	var enemy = EnemyShipScript.new()
	enemy.name = "Enemy_%d" % level
	enemy.global_position = player.global_position + Vector2(620.0, 0.0).rotated(randf_range(0.0, TAU))
	enemy.rotation = randf_range(-PI, PI)
	enemy.is_player = false
	world_layer.add_child(enemy)
	var chosen_arch := "boss" if not boss_name.is_empty() else (forced_archetype if not forced_archetype.is_empty() else random_npc_archetype())
	enemy.setup(level, boss_name, chosen_arch)
	enemy.target_ship = player
	enemy.npc_dialogue_requested.connect(queue_npc_dialogue)
	enemies.append(enemy)
	announce("NPC CONTACT · %s · %s" % [enemy.enemy_name, enemy.archetype.to_upper()])
	if not boss_name.is_empty():
		var boss_event_id := "boss_%s" % boss_name.to_snake_case()
		if not narrative_events.has(boss_event_id):
			narrative_events[boss_event_id] = true
			queue_dialogue(NarrativeScript.boss_encounter(boss_name, boss_name == "VOID WARDEN"))

func random_npc_archetype() -> String:
	var weights: Dictionary = BalanceData.NPC_AI.spawn_weights
	var roll := randi_range(1, 100)
	if roll <= int(weights.aggressive):
		return "aggressive"
	if roll <= int(weights.aggressive) + int(weights.contact):
		return "contact_quest" if randi() % 2 == 0 else "contact_warning"
	return "roamer"

func spawn_asteroid_field() -> void:
	var clusters := [Vector2(520, -210), Vector2(1650, -420), Vector2(3100, 520), Vector2(4750, 920), Vector2(6400, -480)]
	for c_idx in clusters.size():
		var origin: Vector2 = clusters[c_idx]
		for i in 8:
			var rock := StaticBody2D.new()
			rock.position = origin + Vector2((i % 4) * 95 - 140, floori(float(i) / 4.0) * 105 - 50)
			world_layer.add_child(rock)
			var pts := PackedVector2Array()
			var sides := 7
			for s in sides:
				var a := float(s) * TAU / float(sides) + float(i) * 0.4
				var r := 20.0 + float((s * 13 + i * 7 + c_idx * 5) % 10)
				pts.append(Vector2(cos(a), sin(a)) * r)
			var visual := Polygon2D.new()
			visual.polygon = pts
			visual.color = Color("3e485c") if (i + c_idx) % 2 == 0 else Color("5c4d44")
			rock.add_child(visual)
			var rim := Line2D.new()
			var closed := pts.duplicate()
			closed.append(pts[0])
			rim.points = closed
			rim.width = 2.0
			rim.default_color = Color("7b8fa8", 0.55) if (i + c_idx) % 2 == 0 else Color("a88d78", 0.55)
			rock.add_child(rim)
			var collision := CollisionShape2D.new()
			var shape := CircleShape2D.new()
			shape.radius = PhysicsData.ASTEROID_COLLIDER_RADIUS
			collision.shape = shape
			rock.add_child(collision)
			rock.physics_material_override = PhysicsData.dynamic_material(PhysicsData.SHIP_ASTEROID_BOUNCE)

func spawn_stations() -> void:
	for definition in BalanceData.WORLD.stations:
		var station: Dictionary = definition.duplicate(true)
		station.used = false
		stations.append(station)

func nearby_station() -> Dictionary:
	for station in stations:
		var station_range := 220.0 + player.hull_bound_radius
		if player.global_position.distance_squared_to(station.position) < station_range * station_range:
			return station
	return {}

func use_station() -> void:
	var station := nearby_station()
	if station.is_empty():
		announce("NO STATION IN RANGE · 정거장 표식 220px 안에서 E를 누르세요.")
		return
	player.repair_all()
	for part in player.model.parts:
		part.ammo = part.capacity
	var first_visit: bool = not station.used
	if first_visit:
		station.used = true
		match station.id:
			"kepler":
				upgrades.hull += 1
				var core := player.model.core_part()
				core.max_hp += 30.0; core.hp = core.max_hp
			"lyra":
				upgrades.weapon += 1; upgrades.missile_guidance += 1; upgrades.missile_range += 1
				player.weapon_damage_bonus += 2.0
				player.missile_guidance_bonus += 1.0
				player.missile_range_multiplier = 1.25
			"perseus":
				upgrades.cooling += 12; upgrades.shield_layers += 1; upgrades.shield_recharge += 1
				player.cooling_bonus += 12.0
				player.shield_layer_bonus += 1; player.shield_recharge_reduction += 1.0; player.repair_all()
		announce("%s UPGRADE · %s · 전면 수리 완료" % [station.name, station.upgrade])
	else:
		announce("%s REPAIRED · 이미 업그레이드를 받았습니다." % station.name)
	queue_dialogue(NarrativeScript.station_serviced(station, first_visit))
	if route_step < 6 and route_step % 2 == 0 and station.id == current_waypoint().id:
		route_step += 1

func _physics_process(delta: float) -> void:
	sync_pause_state()
	if gameplay_blocked():
		return
	if player_destroyed:
		hud.pause_label = "CORE LOST · R 키로 새 항해"
		if Input.is_action_just_pressed("restart"):
			get_tree().reload_current_scene()
		return
	camera.global_position = player.global_position
	enemy_spawn_timer -= delta
	if enemy_spawn_timer <= 0.0 and enemies.size() < 4:
		spawn_enemy(1 + mini(7, floori(float(salvage_count + kill_count) / 3.0)))
		enemy_spawn_timer = 6.5
	if streak_timer > 0.0:
		streak_timer = maxf(0.0, streak_timer - delta)
		if streak_timer <= 0.0:
			kill_streak = 0
	if nav_fail_banner_timer > 0.0:
		nav_fail_banner_timer = maxf(0.0, nav_fail_banner_timer - delta)
	if overdrive_timer > 0.0:
		overdrive_timer = maxf(0.0, overdrive_timer - delta)
	if sonar_cooldown > 0.0:
		sonar_cooldown = maxf(0.0, sonar_cooldown - delta)
		overdrive_charge = maxf(0.0, overdrive_charge - delta * 22.0)
		if overdrive_timer <= 0.0 or overdrive_charge <= 0.5:
			overdrive_timer = 0.0
			player.overdrive_active = false
	else:
		overdrive_charge = minf(100.0, overdrive_charge + delta * 4.5)
	_update_salvage_tractor(delta)
	update_narrative()
	update_route()
	if gameplay_blocked():
		return
	var forward := maxf(Input.get_action_strength("thrust_forward"), hud.flight_forward_strength())
	var reverse := maxf(Input.get_action_strength("thrust_reverse"), hud.flight_reverse_strength())
	# 기존 웹 버전과 같이 D=양수(우회전), A=음수(좌회전) RCS 접선 힘을 사용한다.
	var turn_r := maxf(Input.get_action_strength("turn_right"), 1.0 if hud.flight_action_held("turn_right") else 0.0)
	var turn_l := maxf(Input.get_action_strength("turn_left"), 1.0 if hud.flight_action_held("turn_left") else 0.0)
	var turn := turn_r - turn_l
	var has_dock := not nearby_station().is_empty()
	var strafe_l := Input.get_action_strength("strafe_left") if held_part == null else 0.0
	var strafe_r := Input.get_action_strength("strafe_right") if not has_dock else 0.0
	var strafe := strafe_r - strafe_l
	if forward > 0.01 or reverse > 0.01 or absf(turn) > 0.01 or absf(strafe) > 0.01:
		navigation_active = false
		cancel_target_tracking()
		player.apply_player_thrusters(forward, reverse, turn, strafe)
	elif tracking_order.active:
		apply_target_tracking()
	elif navigation_active:
		apply_auto_navigation(delta)
	else:
		player.apply_player_thrusters(0.0, 0.0, 0.0, 0.0)
	if Input.is_action_pressed("fire_primary") or hud.primary_held:
		fire_primary_at(weapon_aim_point())
	if Input.is_action_just_pressed("fire_missile"):
		fire_missile_at(weapon_aim_point())
	if Input.is_action_just_pressed("fire_grapple"):
		toggle_grapple()
	if has_dock and Input.is_action_just_pressed("station"):
		use_station()
	if Input.is_action_just_pressed("overdrive"):
		activate_overdrive()
	if Input.is_action_just_pressed("quick_attach"):
		quick_attach_module()
	if Input.is_action_just_pressed("restart"):
		queue_dialogue({"id":"restart_confirm", "speaker":"FLIGHT CONTROL", "icon":"RESET", "title":"새 항해를 시작할까요?", "body":"현재 함선과 항해 진행 상황은 초기화됩니다.", "choices":[{"label":"취소", "action":"cancel_restart"}, {"label":"새 항해", "action":"confirm_restart"}]})
	if Input.is_physical_key_pressed(KEY_N) and not navigation_active:
		handle_utility("route")
	if Input.is_action_just_pressed("zoom_in"):
		change_zoom(1)
	if Input.is_action_just_pressed("zoom_out"):
		change_zoom(-1)
	update_enemy_combat()
	resolve_projectile_hits(delta)
	_resolve_ship_ramming(delta)
	hud.salvage = salvage_count
	hud.kills = kill_count
	hud.kill_streak = kill_streak
	hud.overdrive_charge = overdrive_charge
	hud.overdrive_active = player.overdrive_active
	_hud_sync_accum += delta
	if _hud_sync_accum >= 0.066:
		_hud_sync_accum = 0.0
		var hostile := 0
		for enemy in enemies:
			if is_instance_valid(enemy) and enemy.is_attacking_player():
				hostile += 1
		hud.hostile_count = hostile
		update_weapon_hud()
		update_mission_hud()
		_refresh_radar_blips()
	_main_draw_accum += delta
	if held_part != null or _main_draw_accum >= 0.033:
		_main_draw_accum = 0.0
		queue_redraw()

func _unhandled_input(event: InputEvent) -> void:
	if gameplay_blocked() or player_destroyed:
		return
	if event is InputEventMouse and event.device == -1: return
	if event is InputEventMouseButton:
		pointer_world = viewport_to_world(event.position)
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			change_zoom(1)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			change_zoom(-1)
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			if held_part != null:
				if event.pressed: held_part.quarter_turn = posmod(held_part.quarter_turn + 1, 4)
				return
			if event.pressed:
				right_drag_start = event.position
				rotating_view = false
			else:
				if not rotating_view:
						handle_right_action(pointer_world)
				rotating_view = false
		elif event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				left_press_started_holding = held_part != null
				left_dragged = false
				left_press_position = event.position
				begin_left_action(pointer_world)
			elif left_press_started_holding or left_dragged:
				end_left_action(pointer_world)
	elif event is InputEventMouseMotion:
		pointer_world = viewport_to_world(event.position)
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) and event.position.distance_squared_to(left_press_position) > 9.0:
			left_dragged = true
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
			var drag: Vector2 = event.position - right_drag_start
			if drag.length_squared() > 9.0:
				rotating_view = true
				camera.global_rotation += event.relative.x * 0.006
	elif event is InputEventMagnifyGesture:
		set_zoom_level(camera.zoom.x * float(event.factor), false)
	elif event is InputEventScreenTouch:
		if event.pressed and not event.canceled:
			_pinch_touches[event.index] = event.position
			if _pinch_touches.size() >= 2:
				_pinch_active = true
				touch_index = -1
				left_dragged = false
				if tracking_order.dragging:
					cancel_target_tracking()
				var pts := _pinch_touches.values()
				_pinch_prev_dist = (pts[0] as Vector2).distance_to(pts[1] as Vector2)
				return
			_pinch_active = false
			if touch_index != -1 and not _pinch_touches.has(touch_index):
				touch_index = -1
			var world_point := viewport_to_world(event.position)
			pointer_world = world_point
			touch_index = event.index
			left_press_started_holding = held_part != null
			left_dragged = false
			left_press_position = event.position
			begin_left_action(world_point)
		else:
			_pinch_touches.erase(event.index)
			if _pinch_touches.size() < 2:
				_pinch_prev_dist = 0.0
			if _pinch_active:
				if _pinch_touches.is_empty():
					_pinch_active = false
				return
			if touch_index != event.index:
				return
			var world_point := viewport_to_world(event.position)
			pointer_world = world_point
			if left_press_started_holding or left_dragged:
				end_left_action(world_point)
			touch_index = -1
	elif event is InputEventScreenDrag:
		if _pinch_touches.has(event.index):
			_pinch_touches[event.index] = event.position
		if _pinch_touches.size() >= 2:
			_pinch_active = true
			var pts := _pinch_touches.values()
			var dist := (pts[0] as Vector2).distance_to(pts[1] as Vector2)
			if _pinch_prev_dist > 12.0 and dist > 12.0:
				set_zoom_level(camera.zoom.x * (dist / _pinch_prev_dist), false)
			_pinch_prev_dist = dist
			return
		if _pinch_active or event.index != touch_index:
			return
		pointer_world = viewport_to_world(event.position)
		if event.position.distance_squared_to(left_press_position) > 9.0:
			left_dragged = true

func viewport_to_world(viewport_point: Vector2) -> Vector2:
	return get_viewport().get_canvas_transform().affine_inverse() * viewport_point

func begin_left_action(world_point: Vector2) -> void:
	# 전투 중 빌드·아이템 회수 비활성화: 적 드래그 각도/거리 유지 또는 빈 공간 터치 이동만 수행
	var pick_pad := 34.0 if touch_index != -1 else 12.0
	var enemy := nearest_enemy_at(world_point, pick_pad)
	if enemy != null:
		select_target(enemy)
		navigation_active = false
		tracking_order.begin(enemy, player.global_position, player.hull_bound_radius + PhysicsData.TRACKING_CLEARANCE)
		return
	set_navigation_destination(world_point)

func end_left_action(_world_point: Vector2) -> void:
	return

func refresh_player_assembly() -> void:
	player.refresh_mass()
	player.rebuild_exhaust_particles()
	player.rebuild_voxel_renderer()
	player.queue_redraw()

func cancel_held_part() -> void:
	if held_part == null: return
	if held_from_ship:
		held_part.quarter_turn = held_original_turn
	if held_from_ship and player.model.attach(held_part, held_original_cell):
		refresh_player_assembly()
	else:
		spawn_salvage_data(held_part, player.global_position + Vector2(player.hull_bound_radius + 100.0, 0), held_tag, player.linear_velocity, 0.0, PhysicsData.DEBRIS_COLLISION_GRACE_SECONDS, player.rotation)
	held_part = null
	held_tag = ""
	announce("회수 취소 · 복귀하거나 함선 옆에 내려놓았습니다.")

func spawn_projectile(info: Dictionary) -> void:
	if info.is_empty():
		return
	var projectile = ProjectileScript.new()
	world_layer.add_child(projectile)
	projectile.setup(info)

func selected_enemy() -> EnemyShip:
	if selected_target != null and is_instance_valid(selected_target) and selected_target.alive():
		return selected_target
	selected_target = null
	return null

func select_target(enemy: EnemyShip) -> void:
	if enemy == null or not is_instance_valid(enemy) or not enemy.alive():
		return
	if selected_target != enemy:
		cancel_target_tracking()
	selected_target = enemy
	target_marker = enemy.global_position
	announce("TARGET LOCK · %s · 무기는 표적을 자동 조준합니다." % enemy.enemy_name)

func weapon_aim_point() -> Vector2:
	var target := selected_enemy()
	if target == null:
		return get_global_mouse_position()
	if player != null and player.interior != null:
		var sub := player.interior.enemy_target_subsystem
		for ep in target.model.parts:
			if ep.hp <= 0.0:
				continue
			if sub == "weapons" and (BalanceData.WEAPONS.has(ep.kind) or ep.kind == "missile_launcher"):
				return target.to_global(target.module_local_center(ep))
			if sub == "shields" and "shield" in ep.kind:
				return target.to_global(target.module_local_center(ep))
			if sub == "flight" and not str(ep.spec().get("actuator", "")).is_empty():
				return target.to_global(target.module_local_center(ep))
	return target.global_position

func fire_primary_at(target: Vector2) -> void:
	var fired_sfx := ""
	var shots := player.fire_primary_weapons(target)
	var fx_budget := 8
	var fx_stride := maxi(1, int(ceili(float(shots.size()) / float(fx_budget))))
	for s_idx in shots.size():
		var shot: Dictionary = shots[s_idx]
		shot.damage += player.weapon_damage_bonus
		spawn_projectile(shot)
		if fired_sfx.is_empty():
			fired_sfx = CosmoteerSfx.sfx_for_weapon_kind(str(shot.get("kind", "laser")))
		if combat_fx != null and (s_idx % fx_stride == 0):
			combat_fx.spawn_muzzle(shot.position, (shot.velocity as Vector2) - player.linear_velocity, shot.color, 1.0)
	if not fired_sfx.is_empty() and cosmo_sfx != null:
		cosmo_sfx.play(fired_sfx)

func fire_missile_at(target: Vector2) -> void:
	target_marker = target
	var mspec := BalanceData.weapon_spec("missile")
	var shot := player.fire_missile(target)
	if shot.is_empty():
		announce("MISSILE · 발사대 / 탄약 %d발 / 재사용 시간을 확인하세요." % int(mspec.get("ammo_cost", 2)))
		return
	shot.target_ship = selected_enemy()
	shot.damage += player.weapon_damage_bonus
	shot.turn_speed = 2.5 + player.missile_guidance_bonus
	shot.life *= player.missile_range_multiplier
	spawn_projectile(shot)
	if cosmo_sfx != null:
		cosmo_sfx.play("shot_missile")
	if combat_fx != null:
		combat_fx.spawn_muzzle(shot.position, (shot.velocity as Vector2) - player.linear_velocity, shot.color, 1.45)

func handle_hud_weapon(kind: String) -> void:
	if gameplay_blocked() or player_destroyed: return
	match kind:
		"primary": fire_primary_at(weapon_aim_point())
		"missile": fire_missile_at(weapon_aim_point())
		"grapple": toggle_grapple()
		"reel":
			if grapple != null and is_instance_valid(grapple) and grapple.connected:
				grapple_reel_toggle = not grapple_reel_toggle
				grapple.set_reeling(grapple_reel_toggle)
				announce("GRAPPLE REEL · %s" % ("감기 ON" if grapple_reel_toggle else "감기 OFF"))
			else:
				grapple_reel_toggle = false
		"sonar": trigger_sonar_pulse()
		"overdrive": activate_overdrive()

func handle_right_action(world_point: Vector2) -> void:
	var pick_pad := 34.0 if touch_index != -1 else 12.0
	var enemy := nearest_enemy_at(world_point, pick_pad)
	if enemy != null:
		select_target(enemy)
		fire_missile_at(enemy.global_position)
		return
	set_navigation_destination(world_point)

func set_navigation_destination(world_point: Vector2) -> void:
	cancel_target_tracking()
	navigation_target = world_point
	target_marker = world_point
	nav_fail_banner_timer = 0.0
	if player != null and player.touches_navigation_point(world_point):
		navigation_active = false
		player.apply_player_thrusters(0.0, 0.0, 0.0, 0.0)
		announce("AUTO NAV · 이미 목표 지점에 닿아 있습니다.")
		return
	navigation_active = true
	if player != null:
		player.reset_auto_nav_monitor(world_point)
	announce("AUTO NAV · 지정 지점으로 회전·추력 항법을 시작합니다.")

func update_tracking_drag(world_point: Vector2) -> void:
	if gameplay_blocked() or player_destroyed or not tracking_order.valid():
		cancel_target_tracking()
		return
	pointer_world = world_point
	tracking_order.update_pointer(world_point)
	queue_redraw()

func finish_tracking_drag() -> void:
	if not tracking_order.dragging: return
	if gameplay_blocked() or player_destroyed or not left_dragged:
		cancel_target_tracking()
		return
	if tracking_order.commit():
		navigation_active = false
		announce("TARGET TRACK · 거리 %.0f / 각도 %+.0f° · 정면 표적 유지 · WASD/ESC 취소" % [tracking_order.distance, rad_to_deg(tracking_order.angle)])
	else:
		cancel_target_tracking()
	left_dragged = false
	queue_redraw()

func cancel_target_tracking() -> void:
	if tracking_order.dragging:
		touch_index = -1
		left_dragged = false
	tracking_order.cancel()
	queue_redraw()

func apply_target_tracking() -> void:
	if not tracking_order.valid():
		cancel_target_tracking()
		player.apply_player_thrusters(0.0, 0.0, 0.0)
		return
	tracking_order.minimum_range = player.hull_bound_radius + PhysicsData.TRACKING_CLEARANCE
	var destination: Vector2 = tracking_order.destination()
	var target: ShipBody = tracking_order.target
	var velocity: Vector2 = target.linear_velocity + (destination - player.global_position) * PhysicsData.TRACKING_POSITION_GAIN
	player.apply_tracking_thrusters(velocity.limit_length(player.max_linear_speed()), target.global_position - player.global_position)

func apply_auto_navigation(delta: float = 1.0 / 60.0) -> void:
	var state := player.step_auto_navigation(navigation_target, delta)
	if state == "arrived":
		navigation_active = false
		announce("AUTO NAV · 목표 지점 도착")
	elif state == "failed":
		navigation_active = false
		nav_fail_banner_timer = 3.0
		announce("이동 실패 · 교착 상태 감지로 이동을 멈춥니다.")

func update_weapon_hud() -> void:
	if hud == null or player == null:
		return
	hud.holding_part = held_part != null
	var target := selected_enemy()
	hud.target_label = "TARGET · %s" % target.enemy_name if target != null else "TARGET · NONE"
	if navigation_active:
		hud.navigation_label = "AUTO NAV · %dm" % roundi(player.hull_distance_to_world_point(navigation_target))
	elif nav_fail_banner_timer > 0.0:
		hud.navigation_label = "이동 실패 · 정지"
	else:
		hud.navigation_label = "MANUAL FLIGHT"
	if tracking_order.active and tracking_order.valid():
		hud.navigation_label = "TRACK · %.0fpx / %+.0f°" % [tracking_order.geometry().radius, rad_to_deg(tracking_order.angle)]
	hud.laser_ready = player.laser_cooldown <= 0.0 and player.heat <= 100.0
	hud.heat = player.heat
	hud.missile_ammo = player.model.ammo_total("missile")
	hud.missile_status = "AMMO %d / -2" % hud.missile_ammo if player.has_part("missile_launcher") else "NO RACK"
	if player.missile_cooldown > 0.0: hud.missile_status = "CD %.1fs" % player.missile_cooldown
	if grapple != null and is_instance_valid(grapple):
		grapple.set_reeling(grapple.connected and (grapple_reel_toggle or Input.is_key_pressed(KEY_V)))
		if grapple.reeling_in:
			hud.grapple_label = "REEL %d%%" % roundi(grapple.hp / maxf(grapple.max_hp, 1.0) * 100.0)
		else:
			hud.grapple_label = "LINK %d%%" % roundi(grapple.hp / maxf(grapple.max_hp, 1.0) * 100.0)
	else:
		grapple_reel_toggle = false
		hud.grapple_label = "READY"

func trigger_sonar_pulse() -> void:
	if sonar_cooldown > 0.0:
		announce("SONAR · 재충전 중 (%.1fs)" % sonar_cooldown)
		return
	sonar_cooldown = float(BalanceData.SONAR.cooldown)
	if active_sonar != null and is_instance_valid(active_sonar):
		active_sonar.queue_free()
	var salvage_nodes: Array = []
	for child in world_layer.get_children():
		if child is NeutralPart and is_instance_valid(child):
			salvage_nodes.append(child)
	active_sonar = SonarPulseScript.new()
	world_layer.add_child(active_sonar)
	active_sonar.ship_detected.connect(func(ship: EnemyShip, entered_attack: bool) -> void:
		if entered_attack:
			announce("SONAR ALERT · %s 적대 함선 공격모드 전환!" % ship.enemy_name)
		_refresh_radar_blips())
	active_sonar.scan_completed.connect(func(report: Dictionary) -> void:
		if sonar_popup != null and is_instance_valid(sonar_popup):
			sonar_popup.show_report(report)
		_refresh_radar_blips())
	active_sonar.launch(player, enemies, stations, salvage_nodes)
	announce("SONAR PULSE · 원형 소나 파동 발신 (반경 %.0fm)" % float(BalanceData.SONAR.max_range))

func toggle_grapple() -> void:
	if grapple != null and is_instance_valid(grapple):
		grapple.detach()
		return
	var target := selected_enemy()
	if target == null:
		target = nearest_enemy_at(get_global_mouse_position(), 160.0)
	if target == null:
		announce("GRAPPLE TARGET · 다른 우주선을 조준한 뒤 G를 누르세요.")
		return
	if not player.is_within_surface_range(target, float(BalanceData.GRAPPLE.max_range)):
		announce("GRAPPLE OUT OF RANGE · 최대 %dpx" % BalanceData.GRAPPLE.max_range)
		return
	if not GrappleTetherScript.can_tow(player, target):
		announce("GRAPPLE 불가 · 더 큰 함선은 견인할 수 없습니다 (내 질량 %.1f / 대상 %.1f)" % [player.mass, target.mass])
		return
	grapple = GrappleTetherScript.new()
	world_layer.add_child(grapple)
	grapple.detached.connect(func(reason: String):
		announce("GRAPPLE RELEASED · %s" % reason)
		grapple = null)
	grapple.launch(player, target)
	announce("GRAPPLE LAUNCHED · 체인 연결 중")

func update_enemy_combat() -> void:
	for enemy in enemies.duplicate():
		if not is_instance_valid(enemy) or not enemy.alive():
			if is_instance_valid(enemy):
				destroy_enemy(enemy)
			enemies.erase(enemy)
			continue
		if not enemy.boss and enemy.global_position.distance_squared_to(player.global_position) > 5000.0 * 5000.0 and enemy != selected_enemy():
			enemies.erase(enemy)
			enemy.queue_free()
			continue
		if enemy.is_attacking_player() and not narrative_events.has("first_hostile"):
			narrative_events["first_hostile"] = true
			queue_dialogue(NarrativeScript.entry("first_hostile"))
		if enemy.can_fire_at_player() and enemy.ready_to_fire():
			for shot in enemy.fire_primary_weapons(player.global_position):
				spawn_projectile(shot)
	var nearest := selected_enemy()
	if nearest != null and not nearest.is_attacking_player(): nearest = null
	if nearest != null and not player.is_within_surface_range(nearest, 620.0):
		nearest = null
	if nearest == null:
		nearest = nearest_enemy_in_range(620.0, true)
	if nearest != null:
		for missile in player.fire_auto_mini_missiles(nearest.global_position):
			missile.target_ship = nearest
			missile.damage += player.weapon_damage_bonus
			missile.turn_speed = 2.5 + player.missile_guidance_bonus
			missile.max_range = float(BalanceData.WEAPONS.mini_missile.range) * player.missile_range_multiplier
			spawn_projectile(missile)

func nearest_enemy_in_range(max_range: float, hostile_only: bool = false) -> EnemyShip:
	var nearest: EnemyShip = null
	var best_squared := INF
	for enemy in enemies:
		if is_instance_valid(enemy) and hostile_only and not enemy.is_attacking_player(): continue
		if is_instance_valid(enemy) and enemy.alive() and player.is_within_surface_range(enemy, max_range):
			var center_distance_squared := enemy.global_position.distance_squared_to(player.global_position)
			if center_distance_squared >= best_squared:
				continue
			nearest = enemy
			best_squared = center_distance_squared
	return nearest

func resolve_projectile_hits(delta: float = 0.0) -> void:
	for node in world_layer.get_children():
		if not node is Projectile or node.is_queued_for_deletion():
			continue
		node.advance(delta)
		if node.team == "enemy" and grapple != null and is_instance_valid(grapple) and grapple.can_be_hit_at(node.global_position):
			grapple.apply_damage(node.damage)
			node.queue_free()
			continue
		var targets: Array = [player] if node.team == "enemy" else enemies
		var target: ShipBody = null
		var part: PartData = null
		var nearest_hit := INF
		for candidate in targets:
			if not is_instance_valid(candidate) or candidate.is_destroying: continue
			var hit: Dictionary = candidate.projectile_hit(node.previous_position, node.global_position)
			if not hit.is_empty() and float(hit.fraction) < nearest_hit:
				nearest_hit = hit.fraction
				target = candidate
				part = hit.part
		if part == null or target == null:
			if node.life <= 0.0: node.queue_free()
			continue
		var impact_world: Vector2 = node.previous_position.lerp(node.global_position, clampf(nearest_hit, 0.0, 1.0))
		var impulse_mag: float = float(PhysicsData.PROJECTILE_IMPACT_IMPULSE.get(node.kind, clampf(node.damage * 2.8, 12.0, 150.0)))
		var eff_dmg: float = node.damage * (node.shield_mult if target.shield_layers > 0 else 1.0)
		var detached: Array[PartData] = target.damage_part(part, eff_dmg, node.velocity, impact_world, false, impulse_mag)
		var shield_blocked: bool = target.last_hit_shield_absorbed
		if cosmo_sfx != null and shield_blocked:
			cosmo_sfx.play("shield_hit")
		if combat_fx != null:
			combat_fx.spawn_hit(impact_world, node.velocity, node.tint, shield_blocked, eff_dmg)

		# Cosmoteer 레일건/고돌파 탄종 장갑 관통(Over-Penetration): 잔여 운동에너지로 내부 모듈 연속 타격
		if (node.kind == "railgun" or node.penetration > 7.0) and not shield_blocked and target.last_damage_leftover >= 2.0:
			var step_vec: Vector2 = node.velocity.normalized() * (BalanceData.CELL * 0.88)
			var pen_damage: float = target.last_damage_leftover
			var prev_pt: Vector2 = impact_world
			for pen_idx in range(1, PhysicsData.RAILGUN_MAX_PENETRATIONS):
				var probe_world: Vector2 = impact_world + step_vec * float(pen_idx)
				var inner_part: PartData = target.model.part_at(target.local_cell_at(probe_world))
				if inner_part == null:
					continue
				var pen_detached: Array[PartData] = target.damage_part(inner_part, pen_damage, node.velocity, probe_world, true, impulse_mag * 0.35)
				for item in pen_detached:
					detached.append(item)
				if combat_fx != null:
					combat_fx.spawn_railgun_pierce(prev_pt, probe_world)
					combat_fx.spawn_hit(probe_world, node.velocity, node.tint, false, pen_damage)
				prev_pt = probe_world
				pen_damage = target.last_damage_leftover
				if pen_damage < 2.0:
					break

		# 휘발성 모듈(탄약고·배터리) 유폭 이펙트 방출
		for blast in target.pop_volatile_blasts():
			if combat_fx != null:
				combat_fx.spawn_volatile_blast(blast.world_pos, str(blast.kind), float(blast.damage))

		if target is EnemyShip and node.team == "player":
			target.notify_attacked_by_player()
		var core := target.model.core_part()
		if core != null and core.hp <= 0.0:
			node.queue_free()
			if target == player:
				destroy_player_ship()
			elif target is EnemyShip:
				destroy_enemy(target)
			continue
		for loose in detached:
			var loose_position := target.to_global(Vector2(loose.cell) * BalanceData.CELL)
			spawn_salvage_data(loose, loose_position, "", debris_velocity_from_ship(target, loose_position, node.velocity), target.angular_velocity * PhysicsData.DEBRIS_ANGULAR_VELOCITY_TRANSFER, PhysicsData.DEBRIS_COLLISION_GRACE_SECONDS, target.rotation)
		node.queue_free()

func _closest_hull_part(ship: ShipBody, world_target: Vector2) -> PartData:
	var best_part: PartData = null
	var best_d2 := INF
	for p in ship.model.parts:
		var wp := ship.to_global(ship.module_local_center(p))
		var d2 := wp.distance_squared_to(world_target)
		if d2 < best_d2:
			best_d2 = d2
			best_part = p
	return best_part

func _resolve_ship_ramming(delta: float) -> void:
	for k in ram_cooldowns.keys():
		var left: float = float(ram_cooldowns[k]) - delta
		if left <= 0.0:
			ram_cooldowns.erase(k)
		else:
			ram_cooldowns[k] = left
	if player == null or player_destroyed or player.is_destroying:
		return
	for enemy_var in enemies.duplicate():
		if not (enemy_var is EnemyShip):
			continue
		var enemy: EnemyShip = enemy_var
		if not is_instance_valid(enemy) or enemy.is_destroying or not enemy.alive():
			continue
		var key: int = enemy.get_instance_id()
		if ram_cooldowns.has(key):
			continue
		if not player.is_within_surface_range(enemy, 6.0):
			continue
		var p_part: PartData = _closest_hull_part(player, enemy.global_position)
		var e_part: PartData = _closest_hull_part(enemy, player.global_position)
		if p_part == null or e_part == null:
			continue
		var p_pos: Vector2 = player.to_global(player.module_local_center(p_part))
		var e_pos: Vector2 = enemy.to_global(enemy.module_local_center(e_part))
		if p_pos.distance_squared_to(e_pos) > (BalanceData.CELL * 1.18) * (BalanceData.CELL * 1.18):
			continue
		var axis: Vector2 = (enemy.global_position - player.global_position).normalized()
		var closing: float = (player.linear_velocity - enemy.linear_velocity).dot(axis)
		if closing < PhysicsData.RAM_MIN_SPEED:
			continue
		ram_cooldowns[key] = 0.42
		var mass_factor: float = clampf(sqrt(player.mass * enemy.mass) * 0.22, 0.65, 2.4)
		var base_dmg: float = (closing - PhysicsData.RAM_MIN_SPEED) * PhysicsData.RAM_DAMAGE_PER_SPEED * mass_factor
		var p_wedge: bool = p_part.kind in ["wedge", "wedge_long"]
		var e_wedge: bool = e_part.kind in ["wedge", "wedge_long"]
		var dmg_to_enemy: float = base_dmg * (PhysicsData.WEDGE_RAM_DAMAGE_MULT if p_wedge else 1.0) * (PhysicsData.WEDGE_SELF_DAMAGE_MULT if e_wedge else 1.0)
		var dmg_to_player: float = base_dmg * (PhysicsData.WEDGE_SELF_DAMAGE_MULT if p_wedge else 1.0) * (PhysicsData.WEDGE_RAM_DAMAGE_MULT if e_wedge else 1.0)
		var contact_pt: Vector2 = p_pos.lerp(e_pos, 0.5)
		var e_detached: Array[PartData] = enemy.damage_part(e_part, dmg_to_enemy, axis * closing, contact_pt, true, closing * 0.35)
		var p_detached: Array[PartData] = player.damage_part(p_part, dmg_to_player, -axis * closing, contact_pt, true, closing * 0.35)
		enemy.notify_attacked_by_player()
		if combat_fx != null:
			combat_fx.spawn_hit(contact_pt, axis * closing, Color("ffd36e") if p_wedge else Color("ff9e7d"), false, dmg_to_enemy)
			if p_wedge:
				combat_fx.spawn_popup(contact_pt + Vector2(0, -22), "쐐기 충각!", Color("ffd36e"))
		for blast in enemy.pop_volatile_blasts():
			if combat_fx != null: combat_fx.spawn_volatile_blast(blast.world_pos, str(blast.kind), float(blast.damage))
		for blast in player.pop_volatile_blasts():
			if combat_fx != null: combat_fx.spawn_volatile_blast(blast.world_pos, str(blast.kind), float(blast.damage))
		for loose in e_detached:
			var lp: Vector2 = enemy.to_global(Vector2(loose.cell) * BalanceData.CELL)
			spawn_salvage_data(loose, lp, "", debris_velocity_from_ship(enemy, lp, axis * closing), enemy.angular_velocity * PhysicsData.DEBRIS_ANGULAR_VELOCITY_TRANSFER, PhysicsData.DEBRIS_COLLISION_GRACE_SECONDS, enemy.rotation)
		for loose in p_detached:
			var lp2: Vector2 = player.to_global(Vector2(loose.cell) * BalanceData.CELL)
			spawn_salvage_data(loose, lp2, "", debris_velocity_from_ship(player, lp2, -axis * closing), player.angular_velocity * PhysicsData.DEBRIS_ANGULAR_VELOCITY_TRANSFER, PhysicsData.DEBRIS_COLLISION_GRACE_SECONDS, player.rotation)
		var e_core: PartData = enemy.model.core_part()
		if e_core != null and e_core.hp <= 0.0:
			destroy_enemy(enemy)
		var p_core: PartData = player.model.core_part()
		if p_core != null and p_core.hp <= 0.0:
			destroy_player_ship()

func nearest_enemy_at(point: Vector2, max_range: float) -> EnemyShip:
	var candidate: EnemyShip = null
	var best_squared := INF
	for enemy in enemies:
		if not is_instance_valid(enemy) or not enemy.alive():
			continue
		var distance_squared := enemy.distance_squared_to_collision_box(point)
		if distance_squared <= max_range * max_range and distance_squared < best_squared:
			candidate = enemy
			best_squared = distance_squared
	return candidate

func destroy_enemy(enemy: EnemyShip) -> void:
	if enemy == null or not is_instance_valid(enemy) or enemy.is_destroying:
		return
	if tracking_order.target == enemy:
		cancel_target_tracking()
	if enemy == selected_target:
		selected_target = null
	enemies.erase(enemy)
	if enemy == active_boss:
		active_boss = null
		route_step += 1
		if route_step >= 6:
			victory_ship = enemy
	begin_ship_destruction(enemy)
	salvage_count += 1
	kill_count += 1
	kill_streak += 1
	streak_timer = 14.0
	overdrive_charge = minf(100.0, overdrive_charge + 28.0)
	var reward_pool := ["laser", "shield_generator", "missile_launcher", "machine_gun", "railgun", "ammo_bay", "battery"]
	var bonus_kind: String = "railgun" if enemy.boss else str(reward_pool[posmod(kill_count + enemy.level, reward_pool.size())])
	spawn_salvage(bonus_kind, enemy.global_position + Vector2(36.0, -28.0))
	if combat_fx != null:
		combat_fx.spawn_popup(enemy.global_position, "격침! +%s" % VisualData.module_debug_label(bonus_kind), Color("ffd36e"))
	announce("RAIDER DESTROYED · %s 격침! 연속격파 ×%d · 보상 모듈 드롭" % [enemy.enemy_name, kill_streak])
	if not narrative_events.has("first_victory"):
		narrative_events["first_victory"] = true

func destroy_player_ship() -> void:
	if player_destroyed:
		return
	player_destroyed = true
	cancel_target_tracking()
	hud.defeated = true
	navigation_active = false
	begin_ship_destruction(player)
	announce("CORE LOST · 선체가 연쇄 붕괴 중입니다. R 키로 새 항해를 시작하세요.")

func begin_ship_destruction(ship: ShipBody) -> void:
	if ship == null or not is_instance_valid(ship) or ship.is_destroying:
		return
	ship.begin_destruction()
	var explosion_points: Array[Vector2] = []
	var part_uids: Array[int] = []
	for part in ship.model.parts:
		if part.kind == "core":
			continue
		explosion_points.append(ship.to_global(Vector2(part.cell) * BalanceData.CELL))
		part_uids.append(part.uid)
	var core := ship.model.core_part()
	if core != null:
		explosion_points.append(ship.to_global(Vector2(core.cell) * BalanceData.CELL))
		part_uids.append(core.uid)
	var effect: Variant = spawn_ship_destruction_effect(ship.global_position, explosion_points, part_uids, ship)
	effect.fragment_requested.connect(func(part_uid: int): release_destroyed_ship_part(ship, part_uid))
	effect.collapse_finished.connect(func(): finish_ship_destruction(ship))

func release_destroyed_ship_part(ship: ShipBody, part_uid: int) -> void:
	if ship == null or not is_instance_valid(ship) or not ship.is_destroying:
		return
	var part := ship.model.part_by_uid(part_uid)
	if part == null:
		return
	var part_position := ship.to_global(Vector2(part.cell) * BalanceData.CELL)
	var removed := ship.model.remove(part_uid)
	if removed == null:
		return
	var wreckage := destroyed_wreckage_from_part(removed)
	spawn_salvage_data(wreckage, part_position, "", debris_velocity_from_ship(ship, part_position), ship.angular_velocity * PhysicsData.DEBRIS_ANGULAR_VELOCITY_TRANSFER, PhysicsData.DEBRIS_COLLISION_GRACE_SECONDS, ship.rotation)
	ship.rebuild_voxel_renderer()
	ship.queue_redraw()

func finish_ship_destruction(ship: ShipBody) -> void:
	if ship == null or not is_instance_valid(ship) or not ship.is_destroying:
		return
	# 파트 수가 긴 플레이어 함선도 마지막 폭발 뒤에는 누락 없이 모두 잔해가 된다.
	for part in ship.model.parts.duplicate():
		release_destroyed_ship_part(ship, part.uid)
	ship.freeze = true
	ship.visible = false
	ship.collision_layer = 0
	ship.collision_mask = 0
	if ship == victory_ship:
		victory_ship = null
		campaign_complete = true
		queue_dialogue({"id":"victory", "speaker":"FLIGHT CONTROL", "icon":"WIN", "title":"VOID WARDEN 격파 · 항로 개척 완료", "body":"정거장 3곳과 보스 관문 3곳을 통과했습니다. 새 함선으로 다시 도전할 수 있습니다.", "choices":[{"label":"새 항해", "action":"confirm_restart"}]})
	if ship != player:
		ship.queue_free()

func destroyed_wreckage_from_part(part: PartData) -> PartData:
	# UID와 원래 셀 좌표를 사용해 결과를 고정한다. 적 파괴를 다시 재현해도
	# 같은 파트가 스크랩/손상 장비가 되어, 물리 결과가 프레임 RNG에 흔들리지 않는다.
	var wreckage := part.duplicate_part()
	var roll := posmod(part.uid * 37 + part.cell.x * 17 + part.cell.y * 29, 100)
	if roll < 72:
		wreckage.kind = "scrap"
		wreckage.hp = 1.0
		wreckage.max_hp = 1.0
		wreckage.ammo = 0
		wreckage.capacity = 0
	else:
		# 장착 가능한 생존 파트도 격침 충격으로 내구도의 58%를 잃는다.
		wreckage.hp = clampf(wreckage.hp * 0.42, 0.5, wreckage.max_hp)
	return wreckage

func spawn_ship_destruction_effect(at: Vector2, points: Array[Vector2], part_uids: Array[int] = [], source_ship: Node2D = null):
	var effect = ShipDestructionEffectScript.new()
	effect.name = "ShipDestructionEffect"
	effect.global_position = at
	world_layer.add_child(effect)
	effect.setup(points, part_uids, source_ship)
	return effect

func debris_velocity_from_ship(ship: ShipBody, part_position: Vector2, impact_velocity: Vector2 = Vector2.ZERO) -> Vector2:
	var radius := part_position - ship.global_position
	var tangent_velocity := Vector2(-radius.y, radius.x) * ship.angular_velocity
	var separation_direction := radius.normalized()
	if separation_direction.is_zero_approx():
		separation_direction = impact_velocity.normalized()
	if separation_direction.is_zero_approx():
		separation_direction = Vector2.RIGHT.rotated(ship.rotation)
	var relative_velocity := separation_direction * PhysicsData.DEBRIS_SEPARATION_SPEED
	if not impact_velocity.is_zero_approx():
		relative_velocity += impact_velocity.normalized() * PhysicsData.DEBRIS_IMPACT_TRANSFER_SPEED
	return ship.linear_velocity + tangent_velocity + relative_velocity.limit_length(PhysicsData.DEBRIS_MAX_RELATIVE_SPEED)

func spawn_salvage_data(_data: PartData, _at: Vector2, _narrative_tag: String = "", _initial_velocity: Vector2 = Vector2.ZERO, _initial_angular_velocity: float = 0.0, _collision_grace_seconds: float = 0.0, _source_rotation: float = 0.0) -> void:
	# 전투 중 떠다니는 아이템(잔해) 생성 비활성화
	return

func set_zoom_level(next_zoom: float, show_toast: bool = true) -> void:
	if camera == null:
		return
	var next := clampf(next_zoom, 1.0 / 4.5, 1.8)
	if is_equal_approx(next, camera.zoom.x):
		return
	camera.zoom = Vector2.ONE * next
	if show_toast:
		announce("ORTHOGRAPHIC ZOOM · %d%%" % roundi(next * 100.0))

func change_zoom(direction: int) -> void:
	set_zoom_level(camera.zoom.x + direction * 0.1, true)

func announce(text: String) -> void:
	message = text
	message_time = 4.0
	hud.announce(text)

func queue_dialogue(entry: Dictionary) -> void:
	if dialogue != null:
		dialogue.enqueue(entry)
		sync_pause_state()

func queue_npc_dialogue(npc_id: int, contact_type: String) -> void:
	var npc = instance_from_id(npc_id)
	if npc is EnemyShip and is_instance_valid(npc):
		queue_dialogue(NarrativeScript.npc_contact(npc.enemy_name, npc_id, contact_type))

func npc_from_action(action: String, prefix: String):
	var id_text := action.trim_prefix(prefix)
	if not id_text.is_valid_int():
		return null
	var npc = instance_from_id(id_text.to_int())
	return npc if npc is EnemyShip and is_instance_valid(npc) else null

func handle_dialogue_choice(action: String) -> void:
	match action:
		"confirm_restart":
			get_tree().paused = false
			get_tree().reload_current_scene()
		"begin_tutorial":
			tutorial_stage = "move"
			announce("튜토리얼 시작 · W로 실제 추력을 만들어 보세요.")
			queue_dialogue(NarrativeScript.entry("tutorial_move"))
		"skip_tutorial":
			tutorial_stage = "skipped"
			announce("튜토리얼을 건너뛰었습니다. 필요하면 중립 부품을 회수해 장착하세요.")
		_:
			if action.begins_with("accept_npc_quest_"):
				var quest_npc = npc_from_action(action, "accept_npc_quest_")
				if quest_npc != null:
					quest_npc.accept_contact()
					var quest_tag := "npc_quest_%d" % quest_npc.get_instance_id()
					spawn_salvage("block", quest_npc.global_position + Vector2(95, 0).rotated(quest_npc.rotation), quest_tag)
					narrative_events[quest_tag] = quest_npc.get_instance_id()
					announce("NPC 의뢰 수락 · 표식 BLOCK을 회수해 유효 소켓에 장착하십시오.")
			elif action.begins_with("decline_npc_quest_"):
				var declined_npc = npc_from_action(action, "decline_npc_quest_")
				if declined_npc != null:
					declined_npc.decline_quest()
				announce("NPC 의뢰를 거절했습니다.")
			elif action.begins_with("acknowledge_npc_warning_"):
				var warning_npc = npc_from_action(action, "acknowledge_npc_warning_")
				if warning_npc != null:
					warning_npc.accept_contact()
				announce("사격 통제 구역 · 5초 안에 무기 사거리 밖으로 이동하십시오.")

func update_narrative() -> void:
	if tutorial_stage == "move" and player.linear_velocity.length() >= NarrativeScript.TUTORIAL_MOVE_SPEED:
		tutorial_stage = "salvage"
		var direction := player.linear_velocity.normalized()
		spawn_salvage("block", player.global_position + direction * 190.0, "tutorial_salvage")
		announce("표시된 중립 부품을 회수하십시오.")
		queue_dialogue(NarrativeScript.entry("tutorial_salvage"))
	for station in stations:
		var event_id := "station_approach_%s" % station.id
		var approach_range := NarrativeScript.STATION_EVENT_RANGE + player.hull_bound_radius
		if not narrative_events.has(event_id) and player.global_position.distance_squared_to(station.position) <= approach_range * approach_range:
			narrative_events[event_id] = true
			queue_dialogue(NarrativeScript.station_approach(station))

func update_mission_hud() -> void:
	match tutorial_stage:
		"move":
			hud.mission_title = "TUTORIAL · 1 / 3"
			hud.mission_copy = "W: 실제 추력으로 속도 %d 이상 만들기" % NarrativeScript.TUTORIAL_MOVE_SPEED
			return
		"salvage":
			hud.mission_title = "TUTORIAL · 2 / 3"
			hud.mission_copy = "표시된 중립 부품을 좌클릭해 회수"
			return
		"place":
			hud.mission_title = "TUTORIAL · 3 / 3"
			hud.mission_copy = "빈 녹색 연결 소켓에 좌클릭 릴리스"
			return
	var station := nearby_station()
	if not station.is_empty():
		hud.mission_title = station.name
		hud.mission_copy = "E: %s" % ("전면 수리" if station.used else "%s 업그레이드 및 전면 수리" % station.upgrade)
		return
	if route_step >= 6:
		hud.mission_title = "ROUTE COMPLETE"
		hud.mission_copy = "항로 개척 완료"
		return
	var waypoint := current_waypoint()
	hud.sector = route_step + 1
	hud.mission_title = "ROUTE %d / 6 · %s" % [route_step + 1, waypoint.name]
	hud.mission_copy = "%d px · N / 다음 관문 버튼: 항법" % roundi(player.global_position.distance_to(waypoint.position))

func update_route() -> void:
	if route_step >= 6 or route_step % 2 == 0 or is_instance_valid(active_boss): return
	var waypoint := current_waypoint()
	if player.global_position.distance_squared_to(waypoint.position) <= 1800.0 * 1800.0:
		spawn_enemy(int(waypoint.tier), str(waypoint.name))
		active_boss = enemies.back()

func _draw() -> void:
	draw_world_markers()
	if held_part != null:
		draw_attachment_candidates(held_part)
	if held_part != null:
		var world := pointer_world
		var target_cell := player.local_cell_at(world)
		var valid := player.model.can_place(held_part, target_cell)
		var preview := held_part.duplicate_part()
		preview.cell = target_cell
		var blocks_exhaust := (not valid) and player.model.would_block_exhaust(held_part, target_cell)
		var color := Color("ff5c47", 0.96) if blocks_exhaust else (VisualData.SOCKET_VALID_COLOR if valid else Color("ffb38a", 0.8))
		for cell in preview.cells():
			var rect := Rect2(Vector2(cell) * BalanceData.CELL - Vector2.ONE * BalanceData.CELL * 0.42, Vector2.ONE * BalanceData.CELL * 0.84)
			draw_set_transform(player.global_position, player.global_rotation)
			draw_rect(rect, Color(str(held_part.spec().fill), 0.72), true)
			draw_rect(rect, color, false, 2.2)
			if blocks_exhaust:
				draw_line(rect.position + Vector2(5, 5), rect.end - Vector2(5, 5), color, 2.0, true)
				draw_line(rect.position + Vector2(rect.size.x - 5, 5), rect.position + Vector2(5, rect.size.y - 5), color, 2.0, true)
		draw_set_transform(Vector2.ZERO, 0.0)
		var tag_text := "설치불가 · 배기간섭" if blocks_exhaust else ("ATTACH" if valid else "CLEARANCE")
		draw_string(ThemeDB.fallback_font, world + Vector2(-64, -28), tag_text, HORIZONTAL_ALIGNMENT_CENTER, 128, 12, color)

func draw_attachment_candidates(part: PartData) -> void:
	draw_set_transform(player.global_position, player.global_rotation)
	var occ := player.model.occupied()
	var exhaust_seen := {}
	for existing in player.model.parts:
		for ex_cell in player.model.exhaust_cells_for(existing):
			if not occ.has(ex_cell) and not exhaust_seen.has(ex_cell):
				exhaust_seen[ex_cell] = true
				var ex_center := Vector2(ex_cell) * BalanceData.CELL
				var ex_half := BalanceData.CELL * 0.25
				var warn_col := Color("ff6b57", 0.62)
				draw_rect(Rect2(ex_center - Vector2.ONE * ex_half, Vector2.ONE * ex_half * 2.0), warn_col, false, 1.3)
				draw_line(ex_center + Vector2(-ex_half, -ex_half), ex_center + Vector2(ex_half, ex_half), warn_col, 1.3)
				draw_line(ex_center + Vector2(ex_half, -ex_half), ex_center + Vector2(-ex_half, ex_half), warn_col, 1.3)
	for anchor in player.model.attachment_candidates(part):
		# 전체 footprint를 후보처럼 칠하면 보조 셀을 클릭할 때 장착이 실패한다.
		# 앵커만 표기하고 실제 크기는 커서의 전체 ghost로 보여 준다.
		var center := Vector2(anchor) * BalanceData.CELL
		var size := BalanceData.CELL * 0.54
		draw_rect(Rect2(center - Vector2.ONE * size * 0.5, Vector2.ONE * size), VisualData.SOCKET_VALID_COLOR, false, 1.5)
		draw_circle(center, 2.0, VisualData.SOCKET_VALID_COLOR)
	draw_set_transform(Vector2.ZERO, 0.0)

func draw_world_markers() -> void:
	for target_pos in tractor_links:
		draw_line(player.global_position, target_pos, Color(0.35, 0.96, 0.86, 0.36), 2.2, true)
		draw_circle(target_pos, 5.0, Color(0.45, 1.0, 0.90, 0.55))
	draw_target_tracking()
	var locked_target := selected_enemy()
	if locked_target != null:
		var radius := locked_target.hull_bound_radius + 16.0
		draw_arc(locked_target.global_position, radius, 0.0, TAU, 32, Color("ff927d"), 2.0, true)
		draw_string(ThemeDB.fallback_font, locked_target.global_position + Vector2(-70, -radius - 12.0), "TARGET LOCK", HORIZONTAL_ALIGNMENT_CENTER, 140, 12, Color("ffcf98"))
	if navigation_active:
		draw_circle(navigation_target, 9.0, Color("82e7c6", 0.24))
		draw_arc(navigation_target, 18.0, 0.0, TAU, 20, Color("82e7c6"), 1.5, true)
		draw_line(navigation_target + Vector2(-26, 0), navigation_target + Vector2(26, 0), Color("82e7c6"), 1.0, true)
		draw_line(navigation_target + Vector2(0, -26), navigation_target + Vector2(0, 26), Color("82e7c6"), 1.0, true)
	for station in stations:
		var point: Vector2 = station.position
		draw_circle(point, 32.0, Color("70ddff", 0.16))
		draw_arc(point, 32.0, 0.0, TAU, 24, Color("70ddff"), 1.5, true)
		draw_string(ThemeDB.fallback_font, point + Vector2(-85, -43), station.name, HORIZONTAL_ALIGNMENT_CENTER, 170, 12, Color("a8edff"))

func draw_target_tracking() -> void:
	if not (tracking_order.active or (tracking_order.dragging and left_dragged)) or not tracking_order.valid(): return
	var geometry: Dictionary = tracking_order.geometry()
	if geometry.is_empty(): return
	var center: Vector2 = geometry.center
	var base_end: Vector2 = geometry.base_end
	var desired_end: Vector2 = geometry.desired_end
	var start := (base_end - center).angle()
	var angle: float = geometry.angle
	var radius: float = geometry.radius
	var polygon := PackedVector2Array([center])
	for step in TrackingVisual.SECTOR_SEGMENTS + 1:
		polygon.append(center + Vector2.from_angle(start + angle * float(step) / float(TrackingVisual.SECTOR_SEGMENTS)) * radius)
	if absf(angle) > 0.001: draw_colored_polygon(polygon, TrackingVisual.SECTOR_COLOR)
	draw_line(center, base_end, TrackingVisual.BASELINE_COLOR, TrackingVisual.LINE_WIDTH, true)
	draw_line(center, desired_end, TrackingVisual.DESTINATION_COLOR, TrackingVisual.LINE_WIDTH, true)
	for step in TrackingVisual.SECTOR_SEGMENTS:
		draw_line(polygon[step + 1], polygon[step + 2], TrackingVisual.DESTINATION_COLOR, TrackingVisual.LINE_WIDTH, true)

	# Cosmoteer 표적 상대 위치 함선 홀로그램 고스트 프리뷰 (실제 모듈 실루엣 + 전방 사선/방어막 아크)
	if player != null:
		var ghost_rot := (center - desired_end).angle()
		var occ := player.model.occupied()
		var half := BalanceData.CELL * 0.5
		draw_set_transform(desired_end, ghost_rot)
		for cell_var in occ.keys():
			var cell: Vector2i = cell_var
			var rect := Rect2(Vector2(cell) * BalanceData.CELL - Vector2.ONE * half, Vector2.ONE * BalanceData.CELL)
			draw_rect(rect, Color(0.28, 0.94, 1.0, 0.14), true)
			for axis in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
				if not occ.has(cell + axis):
					var a := rect.position
					var b := rect.position
					if axis == Vector2i.LEFT: b += Vector2(0, rect.size.y)
					elif axis == Vector2i.RIGHT: a += Vector2(rect.size.x, 0); b += rect.size
					elif axis == Vector2i.UP: b += Vector2(rect.size.x, 0)
					else: a += Vector2(0, rect.size.y); b += rect.size
					draw_line(a, b, Color(0.45, 0.98, 1.0, 0.72), 1.8, true)
		if player.shield_max_layers() > 0:
			var sr := player.hull_bound_radius + PhysicsData.SHIELD_ARC_RADIUS_OFFSET
			for sg in player.model.parts:
				if sg.kind == "shield_generator":
					var ga := float(sg.quarter_turn) * PI * 0.5
					draw_arc(Vector2.ZERO, sr, ga - PhysicsData.SHIELD_ARC_HALF_ANGLE, ga + PhysicsData.SHIELD_ARC_HALF_ANGLE, 20, Color(0.35, 0.95, 1.0, 0.42), 1.8, true)
		draw_line(Vector2(player.hull_bound_radius * 0.6, 0.0), Vector2(maxf(radius - 18.0, player.hull_bound_radius), 0.0), Color(1.0, 0.55, 0.72, 0.45), 1.4, true)
		draw_set_transform(Vector2.ZERO, 0.0)

	draw_arc(desired_end, 8.0, 0.0, TAU, 20, TrackingVisual.DESTINATION_COLOR, TrackingVisual.LINE_WIDTH, true)
	# 라벨은 카메라 회전을 상쇄해 항상 읽을 수 있게 유지한다.
	draw_set_transform(desired_end, camera.global_rotation)
	draw_string(ThemeDB.fallback_font, Vector2(16, -16), "%.0f px  %+.0f°" % [radius, rad_to_deg(angle)], HORIZONTAL_ALIGNMENT_LEFT, -1, TrackingVisual.FONT_SIZE, TrackingVisual.DESTINATION_COLOR)
	draw_set_transform(Vector2.ZERO, 0.0)


# --- Single-Player Tactical & Salvage Enhancements ---

func activate_overdrive() -> void:
	if player == null or player_destroyed:
		return
	if player.overdrive_active:
		return
	if overdrive_charge < 40.0:
		announce("OVERDRIVE · 부스트 게이지 40%% 이상 필요 (현재 %d%%)" % roundi(overdrive_charge))
		return
	player.overdrive_active = true
	overdrive_timer = 4.5
	if combat_fx != null:
		combat_fx.spawn_popup(player.global_position + Vector2(0, -34), "OVERDRIVE!", Color("ffd36e"))
		combat_fx.spawn_hit(player.global_position, Vector2.UP, Color("ffd36e"), false, 0.0)
	announce("OVERDRIVE ENGAGED · 추력 +45% · 연사속도 상승 · 냉각 가속!")


func quick_attach_module() -> void:
	# 전투 중 빌드 비활성화 (상단 빌드 모드에서만 조립)
	announce("전투 중 빌드는 비활성화되었습니다 · 상단 [빌드 모드]에서 조립하세요.")


func _update_salvage_tractor(_delta: float) -> void:
	tractor_links.clear()


func _refresh_radar_blips() -> void:
	if hud == null or player == null:
		return
	var blips: Array[Dictionary] = []
	for st in stations:
		blips.append({"pos": st.position, "kind": "station"})
	for enemy in enemies:
		if is_instance_valid(enemy) and enemy.alive():
			blips.append({"pos": enemy.global_position, "kind": "boss" if enemy.boss else "enemy"})
	var salvage_added := 0
	for node in world_layer.get_children():
		if salvage_added >= 24:
			break
		if node is NeutralPart and not node.is_queued_for_deletion() and node.part != null and node.part.kind != "scrap":
			blips.append({"pos": node.global_position, "kind": "salvage"})
			salvage_added += 1
	hud.radar_blips = blips
	hud.waypoint_world = current_waypoint().position if route_step < 6 else Vector2.ZERO
