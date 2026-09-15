extends Node2D

const ShipBodyScript = preload("res://scripts/ship_body.gd")
const NeutralPartScript = preload("res://scripts/neutral_part.gd")
const ProjectileScript = preload("res://scripts/projectile.gd")
const BackgroundScript = preload("res://scripts/background.gd")
const HudOverlayScript = preload("res://scripts/hud_overlay.gd")
const BalanceData = preload("res://scripts/balance.gd")

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

func _ready() -> void:
	world_layer = Node2D.new()
	world_layer.name = "World"
	add_child(world_layer)
	var background = BackgroundScript.new()
	world_layer.add_child(background)
	player = ShipBodyScript.new()
	player.name = "PlayerShip"
	player.position = Vector2.ZERO
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
	player.add_child(camera)
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
	var forward := Input.get_action_strength("thrust_forward")
	var reverse := Input.get_action_strength("thrust_reverse")
	var turn := Input.get_action_strength("turn_right") - Input.get_action_strength("turn_left")
	player.apply_player_thrusters(forward, reverse, turn)
	if Input.is_action_pressed("fire_primary"):
		spawn_projectile(player.fire_laser(get_global_mouse_position()))
	queue_redraw()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
			camera.zoom = (camera.zoom * 1.10).clamp(Vector2(0.70, 0.70), Vector2(1.50, 1.50))
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
			camera.zoom = (camera.zoom / 1.10).clamp(Vector2(0.70, 0.70), Vector2(1.50, 1.50))
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
		closest.queue_free()
		announce("회수 완료: 녹색 소켓에 놓으면 장착됩니다.")

func end_left_action(world_point: Vector2) -> void:
	if held_part == null:
		return
	var cell := player.local_cell_at(world_point)
	if player.model.attach(held_part, cell):
		player.refresh_mass()
		player.queue_redraw()
		announce("장착 완료: 질량 %.1f / 방어막 %d층" % [player.model.total_mass(), player.model.shield_capacity()])
		held_part = null
		held_source = null
		return
	if held_source != null:
		spawn_salvage(held_part.kind, world_point)
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

func announce(text: String) -> void:
	message = text
	message_time = 4.0
	hud.announce(text)

func _draw() -> void:
	if held_part != null:
		var world := get_global_mouse_position()
		var local := to_local(world)
		draw_circle(local, 22, Color("7cffb0", 0.35))
		draw_string(ThemeDB.fallback_font, local + Vector2(-22, -28), "CARRY", HORIZONTAL_ALIGNMENT_CENTER, 44, 12, Color("9effc3"))
