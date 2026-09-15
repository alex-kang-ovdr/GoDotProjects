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
const NarrativeData = preload("res://scripts/narrative_data.gd")
const GrappleTetherScript = preload("res://scripts/grapple_tether.gd")

var player: ShipBody
var camera: Camera2D
var held_part: PartData
var held_source: NeutralPart
var left_press_started_holding := false
var left_dragged := false
var left_press_position := Vector2.ZERO
var right_drag_start := Vector2.ZERO
var rotating_view := false
var target_marker := Vector2.ZERO
var message := "WASD: 2D 추력 · 좌클릭: 회수/장착 · Shift+클릭: 이동 · 우클릭: 표적 미사일 · G: 물리 갈고리 · 휠: 줌"
var message_time := 8.0
var world_layer: Node2D
var hud
var dialogue
var salvage_count := 0
var enemies: Array[EnemyShip] = []
var enemy_spawn_timer := 3.0
var stations: Array[Dictionary] = []
var upgrades := {"hull":0, "weapon":0, "cooling":0, "missile_guidance":0, "missile_range":0, "shield_layers":0, "shield_recharge":0}
var tutorial_stage := "inactive"
var narrative_events := {}
var grapple

func _ready() -> void:
	world_layer = Node2D.new()
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
	var canvas_layer := CanvasLayer.new()
	add_child(canvas_layer)
	hud = HudOverlayScript.new()
	hud.ship = player
	canvas_layer.add_child(hud)
	dialogue = DialogueOverlayScript.new()
	canvas_layer.add_child(dialogue)
	dialogue.choice_selected.connect(handle_dialogue_choice)
	hud.announce(message)
	camera = Camera2D.new()
	camera.position_smoothing_enabled = true
	camera.position_smoothing_speed = 8.0
	camera.zoom = Vector2(1.0, 1.0)
	world_layer.add_child(camera)
	spawn_salvage("beam3", Vector2(270, -110))
	spawn_salvage("wedge", Vector2(190, 155))
	spawn_salvage("ammo_bay", Vector2(-230, 100))
	spawn_salvage("missile_launcher", Vector2(310, 180))
	spawn_asteroid_field()
	spawn_stations()
	queue_dialogue(NarrativeData.entry("tutorial_intro"))
	queue_redraw()

func spawn_salvage(kind: String, at: Vector2, narrative_tag: String = "") -> void:
	var salvage = NeutralPartScript.new()
	salvage.name = "Salvage_%s" % kind
	salvage.position = at
	world_layer.add_child(salvage)
	salvage.setup(player.model.make_part(kind, Vector2i.ZERO), Vector2.ZERO, narrative_tag)

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
			queue_dialogue(NarrativeData.boss_encounter(boss_name, boss_name.to_lower().contains("final")))

func random_npc_archetype() -> String:
	var weights: Dictionary = BalanceData.NPC_AI.spawn_weights
	var roll := randi_range(1, 100)
	if roll <= int(weights.aggressive):
		return "aggressive"
	if roll <= int(weights.aggressive) + int(weights.contact):
		return "contact_quest" if randi() % 2 == 0 else "contact_warning"
	return "roamer"

func spawn_asteroid_field() -> void:
	for i in 12:
		var rock := StaticBody2D.new()
		rock.position = Vector2(500 + (i % 4) * 85, -210 + (i / 4) * 95)
		world_layer.add_child(rock)
		var visual := Polygon2D.new()
		visual.polygon = PackedVector2Array([Vector2(-18,-12), Vector2(12,-20), Vector2(24,5), Vector2(5,20), Vector2(-22,12)])
		visual.color = Color("5f6272") if i % 3 else Color("8c755f")
		rock.add_child(visual)
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
			"perseus":
				upgrades.cooling += 12; upgrades.shield_layers += 1; upgrades.shield_recharge += 1
				player.shield_layer_bonus += 1; player.shield_recharge_reduction += 1.0; player.repair_all()
		announce("%s UPGRADE · %s · 전면 수리 완료" % [station.name, station.upgrade])
	else:
		announce("%s REPAIRED · 이미 업그레이드를 받았습니다." % station.name)
	queue_dialogue(NarrativeData.station_serviced(station, first_visit))

func _physics_process(delta: float) -> void:
	camera.global_position = player.global_position
	enemy_spawn_timer -= delta
	if enemy_spawn_timer <= 0.0 and enemies.size() < 3:
		spawn_enemy(1 + mini(7, salvage_count / 3))
		enemy_spawn_timer = 8.0
	update_narrative()
	var forward := Input.get_action_strength("thrust_forward")
	var reverse := Input.get_action_strength("thrust_reverse")
	# apply_player_thrusters의 양수 RCS 토크는 화면 기준 반시계 방향이다.
	# 따라서 A=양수(좌회전), D=음수(우회전)로 변환한다.
	var turn := Input.get_action_strength("turn_left") - Input.get_action_strength("turn_right")
	player.apply_player_thrusters(forward, reverse, turn)
	if Input.is_action_pressed("fire_primary"):
		for shot in player.fire_primary_weapons(get_global_mouse_position()):
			spawn_projectile(shot)
	if Input.is_action_just_pressed("fire_missile"):
		spawn_projectile(player.fire_missile(get_global_mouse_position()))
	if Input.is_action_just_pressed("fire_grapple"):
		toggle_grapple()
	if Input.is_action_just_pressed("station"):
		use_station()
	if Input.is_action_just_pressed("restart"):
		get_tree().reload_current_scene()
	if Input.is_action_just_pressed("zoom_in"):
		change_zoom(1)
	if Input.is_action_just_pressed("zoom_out"):
		change_zoom(-1)
	update_enemy_combat()
	resolve_projectile_hits()
	hud.salvage = salvage_count
	hud.hostile_count = enemies.filter(func(enemy): return is_instance_valid(enemy) and enemy.is_attacking_player()).size()
	update_mission_hud()
	queue_redraw()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			change_zoom(1)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			change_zoom(-1)
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			if event.pressed:
				right_drag_start = event.position
				rotating_view = false
			else:
				if not rotating_view:
					target_marker = get_global_mouse_position()
					spawn_projectile(player.fire_missile(target_marker))
				rotating_view = false
		elif event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				left_press_started_holding = held_part != null
				left_dragged = false
				left_press_position = event.position
				begin_left_action(get_global_mouse_position())
			elif left_press_started_holding or left_dragged:
				end_left_action(get_global_mouse_position())
	elif event is InputEventMouseMotion:
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) and event.position.distance_squared_to(left_press_position) > 9.0:
			left_dragged = true
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
			var drag: Vector2 = event.position - right_drag_start
			if drag.length() > 3.0:
				rotating_view = true
				camera.global_rotation += event.relative.x * 0.006

func begin_left_action(world_point: Vector2) -> void:
	if held_part != null:
		return
	if Input.is_key_pressed(KEY_SHIFT):
		var part := player.model.part_at(player.local_cell_at(world_point))
		if part != null and part.kind != "core":
			held_part = player.model.remove(part.uid)
			player.refresh_mass()
			player.queue_redraw()
			announce("장착 부품 이동: 빈 연결 소켓에 놓으세요.")
		return
	var closest: NeutralPart = null
	var closest_distance_squared := float(BalanceData.PLAYER.salvage_range) * float(BalanceData.PLAYER.salvage_range)
	for node in world_layer.get_children():
		if node is NeutralPart:
			var distance_squared: float = node.global_position.distance_squared_to(world_point)
			if distance_squared < closest_distance_squared:
				closest = node
				closest_distance_squared = distance_squared
	if closest != null:
		held_part = closest.part
		held_source = closest
		closest.get_parent().remove_child(closest)
		announce("회수 완료: 다음 클릭 또는 드래그 릴리스로 유효 소켓에 장착합니다.")
		if tutorial_stage == "salvage" and closest.narrative_tag == "tutorial_salvage":
			tutorial_stage = "place"
			queue_dialogue(NarrativeData.entry("tutorial_place"))

func end_left_action(world_point: Vector2) -> void:
	if held_part == null:
		return
	# 같은 종류의 중립 탄약고는 웹 버전처럼 더 튼튼한 결과를 계속 들고 있게 병합한다.
	if held_source != null and held_part.spec().get("ammo_type", "") != "":
		for node in world_layer.get_children():
			if node is NeutralPart and node != held_source and node.part.kind == held_part.kind and node.global_position.distance_squared_to(world_point) < (BalanceData.CELL * 0.9) * (BalanceData.CELL * 0.9):
				var merged := player.model.merge_bays(held_part, node.part)
				if merged != null:
					node.queue_free()
					held_source.queue_free()
					held_part = merged
					held_source = null
					announce("AMMO STORAGE MERGED · %d/%d · 계속 장착할 수 있습니다." % [merged.ammo, merged.capacity])
					return
	var cell := player.local_cell_at(world_point)
	if player.model.attach(held_part, cell):
		var attached_tutorial_part := held_source != null and held_source.narrative_tag == "tutorial_salvage"
		var attached_quest_tag := "" if held_source == null else held_source.narrative_tag
		player.refresh_mass()
		player.queue_redraw()
		announce("장착 완료: 질량 %.1f / 방어막 %d층" % [player.model.total_mass(), player.model.shield_capacity()])
		salvage_count += 1 if held_source != null else 0
		if held_source != null:
			held_source.queue_free()
		if tutorial_stage == "place" and attached_tutorial_part:
			tutorial_stage = "complete"
			queue_dialogue(NarrativeData.entry("tutorial_complete"))
		if attached_quest_tag.begins_with("npc_quest_"):
			var quest_npc_id: int = int(narrative_events.get(attached_quest_tag, 0))
			var quest_npc = instance_from_id(quest_npc_id)
			narrative_events.erase(attached_quest_tag)
			queue_dialogue(NarrativeData.npc_quest_complete(quest_npc.enemy_name if quest_npc is EnemyShip and is_instance_valid(quest_npc) else "SALVAGE LINK"))
			announce("NPC 회수 의뢰 완료 · 항로 신뢰도 갱신")
		held_part = null
		held_source = null
		return
	if held_source != null:
		spawn_salvage_data(held_part, world_point)
		announce("유효한 연결 소켓이 아닙니다. 부품을 필드에 되돌렸습니다.")
	else:
		player.model.parts.append(held_part)
		player.refresh_mass()
		player.queue_redraw()
		announce("유효한 연결 소켓이 아닙니다. 기존 위치에 복귀했습니다.")
	held_part = null
	held_source = null

func spawn_projectile(info: Dictionary) -> void:
	if info.is_empty():
		return
	var projectile = ProjectileScript.new()
	world_layer.add_child(projectile)
	projectile.setup(info)

func toggle_grapple() -> void:
	if grapple != null and is_instance_valid(grapple):
		grapple.detach()
		return
	var target := nearest_enemy_at(get_global_mouse_position(), 160.0)
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
		if enemy.is_attacking_player() and not narrative_events.has("first_hostile"):
			narrative_events["first_hostile"] = true
			queue_dialogue(NarrativeData.entry("first_hostile"))
		if enemy.can_fire_at_player() and enemy.ready_to_fire():
			for shot in enemy.fire_primary_weapons(player.global_position):
				spawn_projectile(shot)
	var nearest := nearest_enemy_in_range(620.0)
	if nearest != null:
		for missile in player.fire_auto_mini_missiles(nearest.global_position):
			spawn_projectile(missile)

func nearest_enemy_in_range(max_range: float) -> EnemyShip:
	var nearest: EnemyShip = null
	var best_squared := INF
	for enemy in enemies:
		if is_instance_valid(enemy) and enemy.alive() and player.is_within_surface_range(enemy, max_range):
			var center_distance_squared := enemy.global_position.distance_squared_to(player.global_position)
			if center_distance_squared >= best_squared:
				continue
			nearest = enemy
			best_squared = center_distance_squared
	return nearest

func resolve_projectile_hits() -> void:
	for node in world_layer.get_children():
		if not node is Projectile or node.is_queued_for_deletion():
			continue
		if grapple != null and is_instance_valid(grapple) and grapple.can_be_hit_at(node.global_position):
			grapple.apply_damage(node.damage)
			node.queue_free()
			continue
		var target: ShipBody = player if node.team == "enemy" else nearest_enemy_at(node.global_position, 130.0)
		var hit_radius := 130.0 if target == null else maxf(130.0, target.hull_bound_radius)
		if target == null or node.global_position.distance_squared_to(target.global_position) > hit_radius * hit_radius:
			continue
		var part := target.model.part_at(target.local_cell_at(node.global_position))
		if part == null:
			part = target.model.core_part()
		var detached := target.damage_part(part, node.damage, node.velocity)
		if target is EnemyShip and node.team == "player":
			target.notify_attacked_by_player()
		for loose in detached:
			spawn_salvage_data(loose, target.to_global(Vector2(loose.cell) * BalanceData.CELL))
		node.queue_free()
		if target == player and not player.model.core_part().hp > 0.0:
			announce("CORE LOST · R 키로 새 항해를 시작하세요.")

func nearest_enemy_at(point: Vector2, max_range: float) -> EnemyShip:
	var candidate: EnemyShip = null
	var best_squared := INF
	for enemy in enemies:
		if not is_instance_valid(enemy) or not enemy.alive():
			continue
		var distance_squared := enemy.global_position.distance_squared_to(point)
		var hit_radius := maxf(max_range, enemy.hull_bound_radius)
		if distance_squared <= hit_radius * hit_radius and distance_squared < best_squared:
			candidate = enemy
			best_squared = distance_squared
	return candidate

func destroy_enemy(enemy: EnemyShip) -> void:
	for part in enemy.model.parts:
		if part.kind != "core":
			spawn_salvage_data(part.duplicate_part(), enemy.to_global(Vector2(part.cell) * BalanceData.CELL))
	enemy.queue_free()
	salvage_count += 1
	announce("RAIDER CORE BROKEN · 중립 파트를 회수하세요.")
	if not narrative_events.has("first_victory"):
		narrative_events["first_victory"] = true
		queue_dialogue(NarrativeData.entry("first_victory"))

func spawn_salvage_data(data: PartData, at: Vector2, narrative_tag: String = "") -> void:
	var salvage = NeutralPartScript.new()
	salvage.name = "Salvage_%s" % data.kind
	salvage.position = at
	world_layer.add_child(salvage)
	salvage.setup(data, Vector2.ZERO, narrative_tag)

func change_zoom(direction: int) -> void:
	var next := clampf(roundf((camera.zoom.x + direction * 0.1) * 10.0) / 10.0, 0.7, 1.5)
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

func queue_npc_dialogue(npc_id: int, contact_type: String) -> void:
	var npc = instance_from_id(npc_id)
	if npc is EnemyShip and is_instance_valid(npc):
		queue_dialogue(NarrativeData.npc_contact(npc.enemy_name, npc_id, contact_type))

func npc_from_action(action: String, prefix: String):
	var id_text := action.trim_prefix(prefix)
	if not id_text.is_valid_int():
		return null
	var npc = instance_from_id(id_text.to_int())
	return npc if npc is EnemyShip and is_instance_valid(npc) else null

func handle_dialogue_choice(action: String) -> void:
	match action:
		"begin_tutorial":
			tutorial_stage = "move"
			announce("튜토리얼 시작 · W로 실제 추력을 만들어 보세요.")
			queue_dialogue(NarrativeData.entry("tutorial_move"))
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
	if tutorial_stage == "move" and player.linear_velocity.length() >= NarrativeData.TUTORIAL_MOVE_SPEED:
		tutorial_stage = "salvage"
		var direction := player.linear_velocity.normalized()
		spawn_salvage("block", player.global_position + direction * 190.0, "tutorial_salvage")
		announce("표시된 중립 부품을 회수하십시오.")
		queue_dialogue(NarrativeData.entry("tutorial_salvage"))
	for station in stations:
		var event_id := "station_approach_%s" % station.id
		var approach_range := NarrativeData.STATION_EVENT_RANGE + player.hull_bound_radius
		if not narrative_events.has(event_id) and player.global_position.distance_squared_to(station.position) <= approach_range * approach_range:
			narrative_events[event_id] = true
			queue_dialogue(NarrativeData.station_approach(station))

func update_mission_hud() -> void:
	match tutorial_stage:
		"move":
			hud.mission_title = "TUTORIAL · 1 / 3"
			hud.mission_copy = "W: 실제 추력으로 속도 %d 이상 만들기" % NarrativeData.TUTORIAL_MOVE_SPEED
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
	hud.mission_title = "ROUTE ETA · ~30 MIN"
	hud.mission_copy = "다음 관문: RIFT BREAKER · 중립 파트를 회수해 강화하세요."

func _draw() -> void:
	draw_world_markers()
	if held_part != null:
		draw_attachment_candidates(held_part)
	if held_part != null:
		var world := get_global_mouse_position()
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
	for anchor in player.model.attachment_candidates(part):
		var preview := part.duplicate_part()
		preview.cell = anchor
		for cell in preview.cells():
			var center := player.to_global(Vector2(cell) * BalanceData.CELL)
			var size := BalanceData.CELL * 0.78
			var points := PackedVector2Array()
			for corner in [Vector2(-1,-1), Vector2(1,-1), Vector2(1,1), Vector2(-1,1), Vector2(-1,-1)]:
				points.append(center + (corner * size * 0.5).rotated(player.global_rotation))
			draw_polyline(points, VisualData.SOCKET_VALID_COLOR, 2.0, true)

func draw_world_markers() -> void:
	for station in stations:
		var point: Vector2 = station.position
		draw_circle(point, 32.0, Color("70ddff", 0.16))
		draw_arc(point, 32.0, 0.0, TAU, 24, Color("70ddff"), 1.5, true)
		draw_string(ThemeDB.fallback_font, point + Vector2(-85, -43), station.name, HORIZONTAL_ALIGNMENT_CENTER, 170, 12, Color("a8edff"))
