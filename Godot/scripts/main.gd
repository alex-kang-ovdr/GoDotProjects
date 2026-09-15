extends Node2D

const ShipBodyScript = preload("res://scripts/ship_body.gd")
const NeutralPartScript = preload("res://scripts/neutral_part.gd")
const ProjectileScript = preload("res://scripts/projectile.gd")
const BackgroundScript = preload("res://scripts/background.gd")
const HudOverlayScript = preload("res://scripts/hud_overlay.gd")
const EnemyShipScript = preload("res://scripts/enemy_ship.gd")
const BalanceData = preload("res://scripts/balance.gd")
const VisualData = preload("res://scripts/visual_tuning.gd")

var player: ShipBody
var camera: Camera2D
var held_part: PartData
var held_source: NeutralPart
var right_drag_start := Vector2.ZERO
var rotating_view := false
var target_marker := Vector2.ZERO
var message := "WASD: 2D 추력 · 좌클릭: 회수/장착 · Shift+클릭: 이동 · 우클릭: 표적 미사일 · 휠: 줌"
var message_time := 8.0
var world_layer: Node2D
var hud
var salvage_count := 0
var enemies: Array[EnemyShip] = []
var enemy_spawn_timer := 3.0

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
	queue_redraw()

func spawn_salvage(kind: String, at: Vector2) -> void:
	var salvage = NeutralPartScript.new()
	salvage.name = "Salvage_%s" % kind
	salvage.position = at
	world_layer.add_child(salvage)
	salvage.setup(player.model.make_part(kind, Vector2i.ZERO), Vector2.ZERO)

func spawn_enemy(level: int, boss_name: String = "") -> void:
	var enemy = EnemyShipScript.new()
	enemy.name = "Enemy_%d" % level
	enemy.global_position = player.global_position + Vector2(620.0, 0.0).rotated(randf_range(0.0, TAU))
	enemy.rotation = randf_range(-PI, PI)
	enemy.is_player = false
	world_layer.add_child(enemy)
	enemy.setup(level, boss_name)
	enemy.target_ship = player
	enemies.append(enemy)
	announce("HOSTILE CONTACT · %s" % enemy.enemy_name)

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
		shape.radius = 23.0
		collision.shape = shape
		rock.add_child(collision)

func _physics_process(delta: float) -> void:
	camera.global_position = player.global_position
	enemy_spawn_timer -= delta
	if enemy_spawn_timer <= 0.0 and enemies.size() < 3:
		spawn_enemy(1 + mini(7, salvage_count / 3))
		enemy_spawn_timer = 8.0
	var forward := Input.get_action_strength("thrust_forward")
	var reverse := Input.get_action_strength("thrust_reverse")
	var turn := Input.get_action_strength("turn_right") - Input.get_action_strength("turn_left")
	player.apply_player_thrusters(forward, reverse, turn)
	if Input.is_action_pressed("fire_primary"):
		for shot in player.fire_primary_weapons(get_global_mouse_position()):
			spawn_projectile(shot)
	if Input.is_action_just_pressed("fire_missile"):
		spawn_projectile(player.fire_missile(get_global_mouse_position()))
	if Input.is_action_just_pressed("station"):
		announce("NO STATION IN RANGE · M23에서 정거장·업그레이드 호환을 추가합니다.")
	if Input.is_action_just_pressed("restart"):
		get_tree().reload_current_scene()
	if Input.is_action_just_pressed("zoom_in"):
		change_zoom(1)
	if Input.is_action_just_pressed("zoom_out"):
		change_zoom(-1)
	update_enemy_combat()
	resolve_projectile_hits()
	hud.salvage = salvage_count
	hud.hostile_count = enemies.size()
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
				begin_left_action(get_global_mouse_position())
			else:
				end_left_action(get_global_mouse_position())
	elif event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
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
	var closest_distance := float(BalanceData.PLAYER.salvage_range)
	for node in world_layer.get_children():
		if node is NeutralPart:
			var distance: float = node.global_position.distance_to(world_point)
			if distance < closest_distance:
				closest = node
				closest_distance = distance
	if closest != null:
		held_part = closest.part
		held_source = closest
		closest.get_parent().remove_child(closest)
		announce("회수 완료: 녹색 소켓에 놓으면 장착됩니다.")

func end_left_action(world_point: Vector2) -> void:
	if held_part == null:
		return
	# 같은 종류의 중립 탄약고는 웹 버전처럼 더 튼튼한 결과를 계속 들고 있게 병합한다.
	if held_source != null and held_part.spec().get("ammo_type", "") != "":
		for node in world_layer.get_children():
			if node is NeutralPart and node != held_source and node.part.kind == held_part.kind and node.global_position.distance_to(world_point) < BalanceData.CELL * 0.9:
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
		player.refresh_mass()
		player.queue_redraw()
		announce("장착 완료: 질량 %.1f / 방어막 %d층" % [player.model.total_mass(), player.model.shield_capacity()])
		salvage_count += 1 if held_source != null else 0
		if held_source != null:
			held_source.queue_free()
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

func update_enemy_combat() -> void:
	for enemy in enemies.duplicate():
		if not is_instance_valid(enemy) or not enemy.alive():
			if is_instance_valid(enemy):
				destroy_enemy(enemy)
			enemies.erase(enemy)
			continue
		if enemy.ready_to_fire() and enemy.global_position.distance_to(player.global_position) < 820.0:
			for shot in enemy.fire_primary_weapons(player.global_position):
				spawn_projectile(shot)
	var nearest := nearest_enemy_in_range(620.0)
	if nearest != null:
		for missile in player.fire_auto_mini_missiles(nearest.global_position):
			spawn_projectile(missile)

func nearest_enemy_in_range(max_range: float) -> EnemyShip:
	var nearest: EnemyShip = null
	var best := max_range
	for enemy in enemies:
		if is_instance_valid(enemy) and enemy.alive() and enemy.global_position.distance_to(player.global_position) < best:
			nearest = enemy
			best = enemy.global_position.distance_to(player.global_position)
	return nearest

func resolve_projectile_hits() -> void:
	for node in world_layer.get_children():
		if not node is Projectile or node.is_queued_for_deletion():
			continue
		var target: ShipBody = player if node.team == "enemy" else nearest_enemy_at(node.global_position, 130.0)
		if target == null or node.global_position.distance_to(target.global_position) > 130.0:
			continue
		var part := target.model.part_at(target.local_cell_at(node.global_position))
		if part == null:
			part = target.model.core_part()
		var detached := target.damage_part(part, node.damage, node.velocity)
		for loose in detached:
			spawn_salvage_data(loose, target.to_global(Vector2(loose.cell) * BalanceData.CELL))
		node.queue_free()
		if target == player and not player.model.core_part().hp > 0.0:
			announce("CORE LOST · R 키로 새 항해를 시작하세요.")

func nearest_enemy_at(point: Vector2, max_range: float) -> EnemyShip:
	var candidate: EnemyShip = null
	var best := max_range
	for enemy in enemies:
		if is_instance_valid(enemy) and enemy.alive() and enemy.global_position.distance_to(point) < best:
			candidate = enemy
			best = enemy.global_position.distance_to(point)
	return candidate

func destroy_enemy(enemy: EnemyShip) -> void:
	for part in enemy.model.parts:
		if part.kind != "core":
			spawn_salvage_data(part.duplicate_part(), enemy.to_global(Vector2(part.cell) * BalanceData.CELL))
	enemy.queue_free()
	salvage_count += 1
	announce("RAIDER CORE BROKEN · 중립 파트를 회수하세요.")

func spawn_salvage_data(data: PartData, at: Vector2) -> void:
	var salvage = NeutralPartScript.new()
	salvage.name = "Salvage_%s" % data.kind
	salvage.position = at
	world_layer.add_child(salvage)
	salvage.setup(data, Vector2.ZERO)

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

func _draw() -> void:
	if held_part != null:
		draw_open_sockets()
	if held_part != null:
		var world := get_global_mouse_position()
		var local := to_local(world)
		var target_cell := player.local_cell_at(world)
		var valid := player.model.can_place(held_part, target_cell)
		var color := VisualData.SOCKET_VALID_COLOR if valid else Color("ffb38a", 0.8)
		draw_circle(local, 22, Color(color, 0.25))
		draw_set_transform(local, player.global_rotation)
		draw_rect(Rect2(-BalanceData.CELL * 0.36, -BalanceData.CELL * 0.36, BalanceData.CELL * 0.72, BalanceData.CELL * 0.72), Color(str(held_part.spec().fill), 0.72), true)
		draw_rect(Rect2(-BalanceData.CELL * 0.36, -BalanceData.CELL * 0.36, BalanceData.CELL * 0.72, BalanceData.CELL * 0.72), color, false, 2.0)
		draw_set_transform(Vector2.ZERO, 0.0)
		draw_string(ThemeDB.fallback_font, local + Vector2(-22, -28), "DROP" if valid else "CARRY", HORIZONTAL_ALIGNMENT_CENTER, 44, 12, color)

func draw_open_sockets() -> void:
	var occupied := player.model.occupied()
	var open := {}
	for part in player.model.parts:
		for cell in part.cells():
			for axis in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
				if not occupied.has(cell + axis):
					open[cell + axis] = true
	for cell in open:
		var center := player.to_global(Vector2(cell) * BalanceData.CELL)
		var size := BalanceData.CELL * 0.78
		var points := PackedVector2Array()
		for corner in [Vector2(-1,-1), Vector2(1,-1), Vector2(1,1), Vector2(-1,1), Vector2(-1,-1)]:
			points.append(center + (corner * size * 0.5).rotated(player.global_rotation))
		draw_polyline(points, VisualData.SOCKET_COLOR, 2.0, true)
