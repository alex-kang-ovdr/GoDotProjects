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
var tracking_order = TrackingOrderScript.new()
var message := "WASD: 추력/회전 · SPACE: 주무기 · F: 미사일 · C: 빠른장착 · B: 오버드라이브 · G: 갈고리 · 레이더 클릭: 항법"
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
var developer_mode_active := false
var developer_overlay
var player_destroyed := false
var skip_automation_hook := false

func _install_ui_font() -> void:
	if FileAccess.file_exists("res://assets/fonts/captain-ui.txt"):
		var raw := FileAccess.get_file_as_string("res://assets/fonts/captain-ui.txt").strip_edges()
		if not raw.is_empty():
			var ff := FontFile.new()
			ff.data = Marshalls.base64_to_raw(raw)
			ThemeDB.fallback_font = ff


func _ready() -> void:
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
	player.rotation = -PI * 0.5
	world_layer.add_child(player)
	player.initialize_player()
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
	hud.announce(message)
	camera = Camera2D.new()
	camera.ignore_rotation = false
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 8.0
	camera.zoom = Vector2(1.0, 1.0)
	world_layer.add_child(camera)
	spawn_salvage("beam3", Vector2(240, -110))
	spawn_salvage("wedge", Vector2(180, 145))
	spawn_salvage("missile_launcher", Vector2(295, 165))
	spawn_salvage("ammo_bay", Vector2(-220, 95))
	spawn_salvage("shield_generator", Vector2(-260, -150))
	spawn_salvage("railgun", Vector2(780, -240))
	spawn_salvage("bullet_bay", Vector2(820, -180))
	spawn_asteroid_field()
	spawn_stations()
	spawn_enemy(1)
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
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and tracking_order.dragging:
		cancel_target_tracking()

func _input(event: InputEvent) -> void:
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
		var touch_release: bool = event is InputEventScreenTouch and event.index == touch_index and not event.pressed
		if mouse_release or touch_release:
			if left_dragged: update_tracking_drag(viewport_to_world(event.position))
			finish_tracking_drag()
			touch_index = -1
			get_viewport().set_input_as_handled()
			return
	if developer_mode_active or (dialogue != null and dialogue.is_showing()):
		return
	if event is InputEventKey and event.pressed and not event.echo:
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
			queue_dialogue({"id":"controls", "speaker":"PILOT MANUAL", "icon":"KEYS", "title":"조작 · 자동제동 · 조립 · 전술", "body":"W/S 추력 전후진 · A/D 회전 · 손을 떼면 자동 역추진 제동. SPACE 주무기 / F 미사일 / G 갈고리 / B 오버드라이브 부스트 / C 근처 부품 빠른장착. 적 클릭은 표적, 드래그하면 거리·각도 전술 추적. 우측 상단 전술 레이더 클릭으로 즉시 항법 이동. 중립 부품 클릭 회수·장착, SHIFT+클릭 재배치, Q 회전. E 정거장 수리·강화 / N 다음 관문 / P 일시정지.", "choices":[]})
		"station":
			if not gameplay_blocked() and not player_destroyed: use_station()
		"quick_attach":
			if not gameplay_blocked() and not player_destroyed: quick_attach_module()
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

func spawn_salvage(kind: String, at: Vector2, narrative_tag: String = "") -> void:
	var salvage = NeutralPartScript.new()
	salvage.name = "Salvage_%s" % kind
	salvage.position = at
	world_layer.add_child(salvage)
	salvage.setup(player.model.make_part(kind, Vector2i.ZERO), Vector2.ZERO, 0.0, narrative_tag)

func spawn_enemy(level: int, boss_name: String = "") -> void:
	var enemy = EnemyShipScript.new()
	enemy.name = "Enemy_%d" % level
	enemy.global_position = player.global_position + Vector2(620.0, 0.0).rotated(randf_range(0.0, TAU))
	enemy.rotation = randf_range(-PI, PI)
	enemy.is_player = false
	world_layer.add_child(enemy)
	enemy.setup(level, boss_name, random_npc_archetype() if boss_name.is_empty() else "boss")
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
	if overdrive_timer > 0.0:
		overdrive_timer = maxf(0.0, overdrive_timer - delta)
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
	var forward := Input.get_action_strength("thrust_forward")
	var reverse := Input.get_action_strength("thrust_reverse")
	# 기존 웹 버전과 같이 D=양수(우회전), A=음수(좌회전) RCS 접선 힘을 사용한다.
	var turn := Input.get_action_strength("turn_right") - Input.get_action_strength("turn_left")
	if forward > 0.01 or reverse > 0.01 or absf(turn) > 0.01:
		navigation_active = false
		cancel_target_tracking()
		player.apply_player_thrusters(forward, reverse, turn)
	elif tracking_order.active:
		apply_target_tracking()
	elif navigation_active:
		apply_auto_navigation()
	else:
		player.apply_player_thrusters(0.0, 0.0, 0.0)
	if Input.is_action_pressed("fire_primary") or hud.primary_held:
		fire_primary_at(weapon_aim_point())
	if Input.is_action_just_pressed("fire_missile"):
		fire_missile_at(weapon_aim_point())
	if Input.is_action_just_pressed("fire_grapple"):
		toggle_grapple()
	if Input.is_action_just_pressed("station"):
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
	hud.salvage = salvage_count
	hud.kills = kill_count
	hud.kill_streak = kill_streak
	hud.overdrive_charge = overdrive_charge
	hud.overdrive_active = player.overdrive_active
	hud.hostile_count = enemies.filter(func(enemy): return is_instance_valid(enemy) and enemy.is_attacking_player()).size()
	update_weapon_hud()
	update_mission_hud()
	_refresh_radar_blips()
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
	elif event is InputEventScreenTouch:
		if touch_index != -1 and touch_index != event.index: return
		var world_point := viewport_to_world(event.position)
		pointer_world = world_point
		if event.pressed:
			touch_index = event.index
			left_press_started_holding = held_part != null
			left_dragged = false
			left_press_position = event.position
			begin_left_action(world_point)
		elif left_press_started_holding or left_dragged:
			end_left_action(world_point)
		if not event.pressed: touch_index = -1
	elif event is InputEventScreenDrag:
		if event.index != touch_index: return
		pointer_world = viewport_to_world(event.position)
		if event.position.distance_squared_to(left_press_position) > 9.0:
			left_dragged = true

func viewport_to_world(viewport_point: Vector2) -> Vector2:
	return get_viewport().get_canvas_transform().affine_inverse() * viewport_point

func begin_left_action(world_point: Vector2) -> void:
	if held_part != null:
		return
	if Input.is_key_pressed(KEY_SHIFT):
		var part := player.model.part_at(player.local_cell_at(world_point))
		if part != null and part.kind != "core":
			held_original_cell = part.cell
			held_original_turn = part.quarter_turn
			held_from_ship = true
			held_part = player.model.remove(part.uid)
			for detached in player.model.detach_disconnected():
				spawn_salvage_data(detached, player.to_global(Vector2(detached.cell) * BalanceData.CELL), "", player.linear_velocity, 0.0, PhysicsData.DEBRIS_COLLISION_GRACE_SECONDS, player.rotation)
			refresh_player_assembly()
			announce("장착 부품 이동: 빈 연결 소켓에 놓으세요.")
		return
	var enemy := nearest_enemy_at(world_point, 0.0)
	if enemy != null:
		select_target(enemy)
		navigation_active = false
		tracking_order.begin(enemy, player.global_position, player.hull_bound_radius + PhysicsData.TRACKING_CLEARANCE)
		return
	var closest: NeutralPart = null
	var closest_distance_squared := float(BalanceData.PLAYER.pickup_click_radius) * float(BalanceData.PLAYER.pickup_click_radius)
	for node in world_layer.get_children():
		if node is NeutralPart and not node.is_queued_for_deletion():
			var distance_squared: float = node.global_position.distance_squared_to(world_point)
			if distance_squared < closest_distance_squared:
				closest = node
				closest_distance_squared = distance_squared
	if closest != null:
		var reach := float(BalanceData.PLAYER.salvage_range) + player.hull_bound_radius
		if closest.global_position.distance_squared_to(player.global_position) > reach * reach:
			announce("OUT OF REACH · 회수 범위 안으로 접근하세요.")
			return
		if closest.part.kind == "scrap":
			closest.queue_free()
			salvage_count += 1
			announce("SCRAP RECOVERED · 장착 불가 잔해를 회수했습니다.")
			return
		held_part = closest.part
		held_tag = closest.narrative_tag
		held_from_ship = false
		closest.queue_free()
		announce("회수 완료: 다음 클릭 또는 드래그 릴리스로 유효 소켓에 장착합니다.")
		if tutorial_stage == "salvage" and closest.narrative_tag == "tutorial_salvage":
			tutorial_stage = "place"
			queue_dialogue(NarrativeScript.entry("tutorial_place"))
		return
	set_navigation_destination(world_point)

func end_left_action(world_point: Vector2) -> void:
	if held_part == null:
		return
	# 같은 종류의 중립 탄약고는 웹 버전처럼 더 튼튼한 결과를 계속 들고 있게 병합한다.
	if held_part.spec().get("ammo_type", "") != "":
		for node in world_layer.get_children():
			if node is NeutralPart and not node.is_queued_for_deletion() and node.part.kind == held_part.kind and node.global_position.distance_squared_to(world_point) < (BalanceData.CELL * 0.9) * (BalanceData.CELL * 0.9) and node.global_position.distance_squared_to(player.global_position) <= pow(float(BalanceData.PLAYER.salvage_range) + player.hull_bound_radius, 2):
				var merged := player.model.merge_bays(held_part, node.part)
				if merged != null:
					node.queue_free()
					held_part = merged
					announce("AMMO STORAGE MERGED · %d/%d · 계속 장착할 수 있습니다." % [merged.ammo, merged.capacity])
					return
	var cell := player.local_cell_at(world_point)
	if player.model.attach(held_part, cell):
		var attached_tutorial_part := held_tag == "tutorial_salvage"
		var attached_quest_tag := held_tag
		refresh_player_assembly()
		announce("장착 완료: 질량 %.1f / 방어막 %d층" % [player.model.total_mass(), player.model.shield_capacity()])
		salvage_count += 1 if not held_from_ship else 0
		if tutorial_stage == "place" and attached_tutorial_part:
			tutorial_stage = "complete"
			queue_dialogue(NarrativeScript.entry("tutorial_complete"))
		if attached_quest_tag.begins_with("npc_quest_"):
			var quest_npc_id: int = int(narrative_events.get(attached_quest_tag, 0))
			var quest_npc = instance_from_id(quest_npc_id)
			narrative_events.erase(attached_quest_tag)
			queue_dialogue(NarrativeScript.npc_quest_complete(quest_npc.enemy_name if quest_npc is EnemyShip and is_instance_valid(quest_npc) else "SALVAGE LINK"))
			announce("NPC 회수 의뢰 완료 · 항로 신뢰도 갱신")
		held_part = null
		held_tag = ""
		return
	announce("장착 불가 · 계속 들고 있습니다. Q 회전 / ESC 취소")

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
	return target.global_position if target != null else get_global_mouse_position()

func fire_primary_at(target: Vector2) -> void:
	for shot in player.fire_primary_weapons(target):
		shot.damage += player.weapon_damage_bonus
		spawn_projectile(shot)
		if combat_fx != null:
			combat_fx.spawn_muzzle(shot.position, (shot.velocity as Vector2) - player.linear_velocity, shot.color, 1.0)

func fire_missile_at(target: Vector2) -> void:
	target_marker = target
	var shot := player.fire_missile(target)
	if shot.is_empty():
		announce("MISSILE · 발사대 / 탄약 %d발 / 재사용 시간을 확인하세요." % int(BalanceData.WEAPONS.missile.ammo_cost))
		return
	shot.target_ship = selected_enemy()
	shot.damage += player.weapon_damage_bonus
	shot.turn_speed = 2.5 + player.missile_guidance_bonus
	shot.life *= player.missile_range_multiplier
	spawn_projectile(shot)
	if combat_fx != null:
		combat_fx.spawn_muzzle(shot.position, (shot.velocity as Vector2) - player.linear_velocity, shot.color, 1.45)

func handle_hud_weapon(kind: String) -> void:
	if gameplay_blocked() or player_destroyed: return
	match kind:
		"primary": fire_primary_at(weapon_aim_point())
		"missile": fire_missile_at(weapon_aim_point())
		"grapple": toggle_grapple()
		"overdrive": activate_overdrive()

func handle_right_action(world_point: Vector2) -> void:
	var enemy := nearest_enemy_at(world_point, 0.0)
	if enemy != null:
		select_target(enemy)
		fire_missile_at(enemy.global_position)
		return
	set_navigation_destination(world_point)

func set_navigation_destination(world_point: Vector2) -> void:
	cancel_target_tracking()
	navigation_target = world_point
	navigation_active = true
	target_marker = world_point
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

func apply_auto_navigation() -> void:
	var offset := navigation_target - player.global_position
	var distance_squared := offset.length_squared()
	var arrival_radius := float(BalanceData.NAVIGATION.arrival_radius)
	if distance_squared <= arrival_radius * arrival_radius:
		navigation_active = false
		player.apply_player_thrusters(0.0, 0.0, 0.0)
		announce("AUTO NAV · 목적지 도착")
		return
	var desired_direction := offset.normalized()
	var facing := Vector2.RIGHT.rotated(player.global_rotation)
	var signed_turn := facing.angle_to(desired_direction)
	var turn := clampf(signed_turn * float(BalanceData.NAVIGATION.turn_gain) - player.angular_velocity * PhysicsData.NAVIGATION_ANGULAR_DAMP_GAIN, -1.0, 1.0)
	var slow_radius := float(BalanceData.NAVIGATION.slow_radius)
	var forward := float(BalanceData.NAVIGATION.cruise_throttle) if distance_squared > slow_radius * slow_radius else float(BalanceData.NAVIGATION.approach_throttle)
	# 목적지 반대 방향 가속을 막고, 접근 중에는 제동 거리만큼 미리 감속한다.
	if absf(signed_turn) > PhysicsData.NAVIGATION_THRUST_ALIGNMENT_RADIANS:
		forward = 0.0
	var closing_speed := maxf(0.0, player.linear_velocity.dot(desired_direction))
	var brake_accel := maxf(1.0, player.actuator_force("reverse") / player.mass + closing_speed * -log(PhysicsData.PLAYER_LINEAR_RETAIN_PER_SECOND))
	var stopping_distance := closing_speed * closing_speed / (2.0 * brake_accel)
	if distance_squared < pow(arrival_radius + stopping_distance, 2):
		forward = 0.0
	player.apply_player_thrusters(forward, 0.0, turn)

func update_weapon_hud() -> void:
	if hud == null or player == null:
		return
	hud.holding_part = held_part != null
	var target := selected_enemy()
	hud.target_label = "TARGET · %s" % target.enemy_name if target != null else "TARGET · NONE"
	hud.navigation_label = "AUTO NAV · %dm" % roundi(player.global_position.distance_to(navigation_target)) if navigation_active else "MANUAL FLIGHT"
	if tracking_order.active and tracking_order.valid():
		hud.navigation_label = "TRACK · %.0fpx / %+.0f°" % [tracking_order.geometry().radius, rad_to_deg(tracking_order.angle)]
	hud.laser_ready = player.laser_cooldown <= 0.0 and player.heat <= 100.0
	hud.heat = player.heat
	hud.missile_ammo = player.model.ammo_total("missile")
	hud.missile_status = "AMMO %d / -2" % hud.missile_ammo if player.has_part("missile_launcher") else "NO RACK"
	if player.missile_cooldown > 0.0: hud.missile_status = "CD %.1fs" % player.missile_cooldown
	if grapple != null and is_instance_valid(grapple):
		hud.grapple_label = "LINK %d%%" % roundi(grapple.hp / maxf(grapple.max_hp, 1.0) * 100.0)
	else:
		hud.grapple_label = "READY"

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
		if grapple != null and is_instance_valid(grapple) and grapple.can_be_hit_at(node.global_position):
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
		var had_shield: bool = target.shield_layers > 0
		var detached := target.damage_part(part, node.damage, node.velocity)
		if combat_fx != null:
			combat_fx.spawn_hit(node.global_position, node.velocity, node.tint, had_shield, node.damage)
		if target is EnemyShip and node.team == "player":
			target.notify_attacked_by_player()
		# 코어는 0 HP 상태로 남아 연쇄 붕괴를 보여 준다. 따라서 코어 파괴는
		# 일반 연결부 분리보다 먼저 처리해 전 파트가 한 프레임에 튀어나오지 않는다.
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

func spawn_salvage_data(data: PartData, at: Vector2, narrative_tag: String = "", initial_velocity: Vector2 = Vector2.ZERO, initial_angular_velocity: float = 0.0, collision_grace_seconds: float = 0.0, source_rotation: float = 0.0) -> void:
	var salvage = NeutralPartScript.new()
	salvage.name = "Salvage_%s" % data.kind
	salvage.position = at
	salvage.rotation = source_rotation
	world_layer.add_child(salvage)
	salvage.setup(data, initial_velocity, initial_angular_velocity, narrative_tag, collision_grace_seconds)

func change_zoom(direction: int) -> void:
	var next := clampf(camera.zoom.x + direction * 0.1, 1.0 / 3.0, 1.5)
	if is_equal_approx(next, camera.zoom.x):
		return
	camera.zoom = Vector2.ONE * next
	announce("ORTHOGRAPHIC ZOOM · %d%%" % roundi(next * 100.0))

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
		var color := VisualData.SOCKET_VALID_COLOR if valid else Color("ffb38a", 0.8)
		var preview := held_part.duplicate_part()
		preview.cell = target_cell
		for cell in preview.cells():
			var rect := Rect2(Vector2(cell) * BalanceData.CELL - Vector2.ONE * BalanceData.CELL * 0.36, Vector2.ONE * BalanceData.CELL * 0.72)
			draw_set_transform(player.global_position, player.global_rotation)
			draw_rect(rect, Color(str(held_part.spec().fill), 0.72), true)
			draw_rect(rect, color, false, 2.0)
		draw_set_transform(Vector2.ZERO, 0.0)
		draw_string(ThemeDB.fallback_font, world + Vector2(-34, -28), "ATTACH" if valid else "CLEARANCE", HORIZONTAL_ALIGNMENT_CENTER, 68, 12, color)

func draw_attachment_candidates(part: PartData) -> void:
	draw_set_transform(player.global_position, player.global_rotation)
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
	draw_arc(desired_end, 10.0, 0.0, TAU, 20, TrackingVisual.DESTINATION_COLOR, TrackingVisual.LINE_WIDTH, true)
	# 라벨은 카메라 회전을 상쇄해 항상 읽을 수 있게 유지한다.
	draw_set_transform(desired_end, camera.global_rotation)
	draw_string(ThemeDB.fallback_font, Vector2(14, -14), "%.0f px  %+.0f°" % [radius, rad_to_deg(angle)], HORIZONTAL_ALIGNMENT_LEFT, -1, TrackingVisual.FONT_SIZE, TrackingVisual.DESTINATION_COLOR)
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
	if player == null or player_destroyed:
		return
	var candidate: PartData = held_part
	var source_node: NeutralPart = null
	if candidate == null:
		var reach := float(BalanceData.PLAYER.salvage_range) + player.hull_bound_radius
		var best_dist_sq := reach * reach
		for node in world_layer.get_children():
			if node is NeutralPart and not node.is_queued_for_deletion() and node.part != null and node.part.kind != "scrap":
				var d2: float = (node as NeutralPart).global_position.distance_squared_to(player.global_position)
				if d2 <= best_dist_sq:
					best_dist_sq = d2
					source_node = node
		if source_node == null:
			announce("QUICK ATTACH · 회수 범위 내에 장착 가능한 중립 부품이 없습니다.")
			return
		candidate = source_node.part

	var best_anchor := Vector2i.ZERO
	var found := false
	var best_score := INF
	for turn in 4:
		var probe := candidate.duplicate_part()
		probe.quarter_turn = posmod(candidate.quarter_turn + turn, 4)
		var anchors := player.model.attachment_candidates(probe)
		for anchor in anchors:
			var score := Vector2(anchor).length_squared()
			if score < best_score:
				best_score = score
				best_anchor = anchor
				candidate.quarter_turn = probe.quarter_turn
				found = true
		if found:
			break

	if not found or not player.model.attach(candidate, best_anchor):
		announce("QUICK ATTACH · 장착할 수 있는 빈 소켓이 없습니다.")
		return

	if source_node != null:
		source_node.queue_free()
		salvage_count += 1
	elif not held_from_ship:
		salvage_count += 1
	held_part = null
	held_tag = ""
	overdrive_charge = minf(100.0, overdrive_charge + 18.0)
	refresh_player_assembly()
	var attach_world := player.to_global(Vector2(best_anchor) * BalanceData.CELL)
	if combat_fx != null:
		combat_fx.spawn_popup(attach_world, "+%s 장착" % VisualData.module_debug_label(candidate.kind), Color("62ffd2"))
		combat_fx.spawn_hit(attach_world, Vector2.UP, Color("62ffd2"), false, 0.0)
	announce("QUICK ATTACH · %s 자동 장착 완료 (총 %d파트)" % [VisualData.module_debug_label(candidate.kind), player.model.parts.size()])


func _update_salvage_tractor(delta: float) -> void:
	tractor_links.clear()
	if player == null or player_destroyed:
		return
	var pull_radius := 220.0 + player.hull_bound_radius
	var scrap_absorb_radius := 95.0 + player.hull_bound_radius
	for node in world_layer.get_children():
		if not node is NeutralPart or node.is_queued_for_deletion() or node.part == null or node.collision_grace_left > 0.0:
			continue
		var d2: float = node.global_position.distance_squared_to(player.global_position)
		if node.part.kind == "scrap" and d2 <= scrap_absorb_radius * scrap_absorb_radius:
			var pos: Vector2 = node.global_position
			node.queue_free()
			salvage_count += 1
			overdrive_charge = minf(100.0, overdrive_charge + 10.0)
			if combat_fx != null:
				combat_fx.spawn_popup(pos, "+SCRAP", Color("9ee6ff"))
			continue
		if d2 <= pull_radius * pull_radius and d2 > (player.hull_bound_radius + 36.0) * (player.hull_bound_radius + 36.0):
			var dir: Vector2 = (player.global_position - node.global_position).normalized()
			node.linear_velocity = node.linear_velocity.move_toward(dir * 165.0, 260.0 * delta)
			if tractor_links.size() < 4:
				tractor_links.append(node.global_position)


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
