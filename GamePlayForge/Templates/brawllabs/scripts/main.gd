@tool
extends Node2D
## A compact native arena brawler: move, aim, fight local bots, and secure gems.

const PIN_ART: Texture2D = preload("res://assets/pin.svg")
const BRICK_ART: Texture2D = preload("res://assets/brick.svg")
const COMET_ART: Texture2D = preload("res://assets/comet.svg")
const GEM_ART: Texture2D = preload("res://assets/gem.svg")
const WORLD := Vector2(1280.0, 800.0)
const PLAYER_SPEED := 255.0
const GEM_GOAL := 5
const SECURE_SECONDS := 8.0

var actors: Array[Dictionary] = []
var actor_by_id: Dictionary = {}
var gems: Array[Dictionary] = []
var walls: Array[StaticBody2D] = []
var shots: Array[Area2D] = []
var hero := "pin"
var elapsed := 0.0
var spawn_clock := 0.0
var secure_team := -1
var secure_clock := 0.0
var match_result := ""
var is_paused := false
var fire_clock := 0.0
var gadget_clock := 0.0
var super_charge := 0.0
var notice := ""
var notice_clock := 0.0
var mouse_target := Vector2(900, 400)
var _rng := RandomNumberGenerator.new()
var multiplayer_mode := false
var network_actor := -1
var network_sequence := 0
var network_clock := 0.0
var network_shots: Array = []
var network_callback: JavaScriptObject


func _ready() -> void:
	if Engine.is_editor_hint():
		return
	process_mode = Node.PROCESS_MODE_ALWAYS
	$Preview.hide()
	_rng.seed = 1404
	start_match()
	if OS.has_feature("web"):
		multiplayer_mode = bool(JavaScriptBridge.eval("new URLSearchParams(location.search).get('multiplayer') === '1'", true))
		if multiplayer_mode:
			_install_network_bridge()

func _process(_delta: float) -> void:
	if Engine.is_editor_hint():
		return
	if multiplayer_mode:
		queue_redraw()
		return
	if Input.is_action_just_pressed("restart"):
		start_match()
	if Input.is_action_just_pressed("pause") and not match_result:
		is_paused = not is_paused
		get_tree().paused = is_paused
	queue_redraw()

func _tick_match(delta: float) -> void:
	if is_paused or match_result:
		queue_redraw()
		return
	elapsed += delta
	fire_clock = maxf(0.0, fire_clock - delta)
	gadget_clock = maxf(0.0, gadget_clock - delta)
	notice_clock = maxf(0.0, notice_clock - delta)
	spawn_clock += delta
	if spawn_clock >= 4.0 and gems.size() < 7:
		spawn_clock = 0.0
		_spawn_gem(Vector2(640 + _rng.randf_range(-50.0, 50.0), 400 + _rng.randf_range(-60.0, 60.0)))
	_update_player(delta)
	_update_bots(delta)
	_update_combat(delta)
	_update_gems()
	_update_objective(delta)
	queue_redraw()

func _input(event: InputEvent) -> void:
	if Engine.is_editor_hint():
		return
	if event is InputEventMouseMotion or event is InputEventMouseButton:
		mouse_target = event.position

func _unhandled_input(event: InputEvent) -> void:
	if Engine.is_editor_hint() or multiplayer_mode or match_result or is_paused or actors.is_empty() or not actors[0]["alive"]:
		return
	if event.is_action_pressed("super") and not event.is_echo():
		_use_super()
	elif event.is_action_pressed("gadget") and not event.is_echo():
		_use_gadget()

func start_match() -> void:
	get_tree().paused = false
	is_paused = false
	match_result = ""
	secure_team = -1
	secure_clock = 0.0
	elapsed = 0.0
	spawn_clock = 0.0
	fire_clock = 0.0
	gadget_clock = 0.0
	super_charge = 0.0
	notice = ""
	for child in get_children():
		if child is CharacterBody2D or child is StaticBody2D or child is Area2D:
			remove_child(child)
			child.queue_free()
	actors.clear()
	actor_by_id.clear()
	gems.clear()
	walls.clear()
	shots.clear()
	_build_arena()
	_spawn_actor("You", 0, hero, Vector2(260, 400), true)
	_spawn_actor("Ally 1", 0, "brick", Vector2(380, 300))
	_spawn_actor("Ally 2", 0, "comet", Vector2(380, 500))
	_spawn_actor("Bot 1", 1, "pin", Vector2(930, 300))
	_spawn_actor("Bot 2", 1, "brick", Vector2(970, 400))
	_spawn_actor("Bot 3", 1, "comet", Vector2(930, 500))
	_spawn_gem(Vector2(640, 400))
	show_notice("Move · aim · hold click to fire · secure 5 gems", 5.0)

func choose_hero(hero_id: String) -> void:
	if hero_id in ["pin", "brick", "comet"]:
		hero = hero_id
		if not Engine.is_editor_hint() and not actors.is_empty():
			start_match()

func _build_arena() -> void:
	_add_wall(Rect2(0, 0, WORLD.x, 24), Color("263b5f"))
	_add_wall(Rect2(0, WORLD.y - 24, WORLD.x, 24), Color("263b5f"))
	_add_wall(Rect2(0, 0, 24, WORLD.y), Color("263b5f"))
	_add_wall(Rect2(WORLD.x - 24, 0, 24, WORLD.y), Color("263b5f"))
	_add_wall(Rect2(516, 270, 90, 66), Color("384c6b"))
	_add_wall(Rect2(516, 464, 90, 66), Color("384c6b"))
	_add_wall(Rect2(674, 270, 90, 66), Color("384c6b"))
	_add_wall(Rect2(674, 464, 90, 66), Color("384c6b"))
	_add_wall(Rect2(310, 180, 54, 54), Color("49604f"))
	_add_wall(Rect2(916, 566, 54, 54), Color("49604f"))

func _add_wall(rect: Rect2, color: Color) -> void:
	var body := StaticBody2D.new()
	body.collision_layer = 1
	body.collision_mask = 0
	var shape := CollisionShape2D.new()
	var box := RectangleShape2D.new()
	box.size = rect.size
	shape.shape = box
	shape.position = rect.position + rect.size * 0.5
	body.add_child(shape)
	add_child(body)
	walls.append(body)
	body.set_meta("draw_rect", rect)
	body.set_meta("draw_color", color)

func _spawn_actor(actor_name: String, team: int, hero_id: String, at: Vector2, player := false) -> void:
	var body := CharacterBody2D.new()
	body.name = actor_name.replace(" ", "")
	body.position = at
	body.collision_layer = 2
	body.collision_mask = 1
	body.floor_snap_length = 0.0
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = 22.0
	shape.shape = circle
	body.add_child(shape)
	add_child(body)
	var hp := 140.0
	var speed := PLAYER_SPEED
	var damage := 30.0
	var cooldown := 0.58
	var range_px := 495.0
	if hero_id == "brick":
		hp = 205.0
		speed = 218.0
		damage = 42.0
		cooldown = 0.92
		range_px = 300.0
	elif hero_id == "comet":
		hp = 128.0
		speed = 232.0
		damage = 36.0
		cooldown = 0.76
		range_px = 455.0
	var actor := {
		"name": actor_name, "team": team, "hero": hero_id, "body": body,
		"player": player, "hp": hp, "max_hp": hp, "speed": speed,
		"damage": damage, "cooldown": cooldown, "fire_clock": 0.2,
		"range": range_px, "ammo": 3, "reload": 0.0, "gems": 0,
		"respawn": 0.0, "kills": 0, "damage_taken": 0.0, "alive": true, "aim": Vector2.RIGHT
	}
	actors.append(actor)
	actor_by_id[body.get_instance_id()] = actors.size() - 1
	body.set_meta("team", team)
	body.set_meta("actor_index", actors.size() - 1)

func _spawn_gem(at: Vector2) -> void:
	gems.append({"position": at, "bob": _rng.randf_range(0.0, TAU)})

func _update_player(delta: float) -> void:
	var player: Dictionary = actors[0]
	if not player["alive"]:
		player["respawn"] = float(player["respawn"]) - delta
		if player["respawn"] <= 0.0:
			_respawn(0)
		return
	var body: CharacterBody2D = player["body"]
	var movement := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	body.velocity = movement * float(player["speed"])
	body.move_and_slide()
	var aim := mouse_target - body.global_position
	if aim.length_squared() > 1.0:
		player["aim"] = aim.normalized()
	if Input.is_action_pressed("attack") and fire_clock <= 0.0 and player["ammo"] > 0:
		_fire(actor_index_for_body(body), player["aim"])
		fire_clock = float(player["cooldown"])
		player["ammo"] = int(player["ammo"]) - 1
		if player["ammo"] == 0:
			player["reload"] = 0.75
	if int(player["ammo"]) < 3:
		player["reload"] -= delta
		if player["reload"] <= 0.0:
			player["ammo"] = int(player["ammo"]) + 1
			player["reload"] = 0.75

func _update_bots(delta: float) -> void:
	for i in range(1, actors.size()):
		var actor: Dictionary = actors[i]
		if not actor["alive"]:
			actor["respawn"] = float(actor["respawn"]) - delta
			if actor["respawn"] <= 0.0:
				_respawn(i)
			continue
		actor["fire_clock"] = maxf(0.0, float(actor["fire_clock"]) - delta)
		var body: CharacterBody2D = actor["body"]
		var target_index := _closest_enemy(i)
		if target_index < 0:
			continue
		var target: Dictionary = actors[target_index]
		var target_body: CharacterBody2D = target["body"]
		var offset := target_body.global_position - body.global_position
		var direction := offset.normalized()
		var desired := Vector2.ZERO
		var preferred := minf(float(actor["range"]) * 0.7, 310.0)
		if offset.length() > preferred:
			desired = direction
		elif offset.length() < preferred * 0.52:
			desired = -direction * 0.65
		var center_pull := Vector2(640, 400) - body.position
		if body.position.distance_to(Vector2(640, 400)) > 420:
			desired += center_pull.normalized() * 0.35
		body.velocity = desired.normalized() * float(actor["speed"]) * 0.76
		body.move_and_slide()
		if offset.length() <= float(actor["range"]) and float(actor["fire_clock"]) <= 0.0:
			actor["aim"] = direction
			_fire(i, direction)
			actor["fire_clock"] = float(actor["cooldown"]) * 1.75

func _update_combat(delta: float) -> void:
	for index in range(shots.size() - 1, -1, -1):
		var shot := shots[index]
		if not is_instance_valid(shot):
			shots.remove_at(index)
			continue
		shot.set_meta("life", float(shot.get_meta("life")) - delta)
		if float(shot.get_meta("life")) <= 0.0:
			shots.remove_at(index)
			shot.queue_free()
	for i in range(actors.size()):
		var actor: Dictionary = actors[i]
		if actor["alive"] and not actor["player"]:
			actor["ammo"] = mini(3, int(actor["ammo"]) + (1 if _rng.randf() < delta * 0.9 else 0))

func _fire(shooter_index: int, direction: Vector2) -> void:
	if shooter_index < 0 or shooter_index >= actors.size():
		return
	var shooter: Dictionary = actors[shooter_index]
	if not shooter["alive"]:
		return
	var body: CharacterBody2D = shooter["body"]
	var projectile := Area2D.new()
	projectile.name = "Projectile"
	projectile.collision_layer = 0
	projectile.collision_mask = 3
	projectile.monitoring = false
	var shape := CollisionShape2D.new()
	var circle := CircleShape2D.new()
	circle.radius = 7.0
	shape.shape = circle
	projectile.add_child(shape)
	projectile.position = body.position + direction * 28.0
	projectile.set_meta("team", int(shooter["team"]))
	projectile.set_meta("owner", shooter_index)
	projectile.set_meta("damage", float(shooter["damage"]))
	projectile.set_meta("direction", direction.normalized())
	projectile.set_meta("life", 0.8)
	projectile.body_entered.connect(_on_projectile_hit.bind(projectile))
	add_child(projectile)
	shots.append(projectile)

func _physics_process(delta: float) -> void:
	if multiplayer_mode:
		_send_network_input(delta)
		return
	if Engine.is_editor_hint() or is_paused or match_result:
		return
	_tick_match(delta)
	if match_result:
		return
	for index in range(shots.size() - 1, -1, -1):
		var shot := shots[index]
		if not is_instance_valid(shot):
			shots.remove_at(index)
			continue
		var from: Vector2 = shot.position
		var shot_direction: Vector2 = shot.get_meta("direction")
		var to: Vector2 = from + shot_direction * 720.0 * delta
		var owner_index := int(shot.get_meta("owner"))
		var owner_body: CharacterBody2D = actors[owner_index]["body"]
		var query := PhysicsRayQueryParameters2D.create(from, to)
		query.collision_mask = 3
		query.exclude = [owner_body.get_rid()]
		var hit := get_world_2d().direct_space_state.intersect_ray(query)
		if not hit.is_empty():
			var hit_body: Object = hit["collider"]
			if hit_body is Node2D and hit_body.has_meta("actor_index"):
				var target_index := int(hit_body.get_meta("actor_index"))
				if target_index < actors.size() and int(actors[target_index]["team"]) != int(shot.get_meta("team")):
					_damage_actor(target_index, float(shot.get_meta("damage")), owner_index)
			shots.remove_at(index)
			shot.queue_free()
		else:
			shot.position = to

func _on_projectile_hit(body: Node2D, projectile: Area2D) -> void:
	if not is_instance_valid(projectile):
		return
	if body.has_meta("actor_index"):
		var target_index := int(body.get_meta("actor_index"))
		var team := int(projectile.get_meta("team"))
		if target_index < actors.size() and int(actors[target_index]["team"]) != team:
			_damage_actor(target_index, float(projectile.get_meta("damage")), int(projectile.get_meta("owner")))
	if shots.has(projectile):
		shots.erase(projectile)
	projectile.queue_free()

func _damage_actor(target_index: int, amount: float, attacker_index: int) -> void:
	var target: Dictionary = actors[target_index]
	if not target["alive"]:
		return
	target["hp"] = float(target["hp"]) - amount
	target["damage_taken"] = float(target["damage_taken"]) + amount
	if attacker_index == 0:
		super_charge = minf(1.0, super_charge + 0.19)
	if float(target["hp"]) <= 0.0:
		target["alive"] = false
		var body: CharacterBody2D = target["body"]
		for _drop in range(int(target["gems"])):
			_spawn_gem(body.position + Vector2(_rng.randf_range(-24, 24), _rng.randf_range(-24, 24)))
		target["gems"] = 0
		body.visible = false
		body.collision_layer = 0
		target["respawn"] = 2.8
		if attacker_index >= 0 and attacker_index < actors.size():
			actors[attacker_index]["kills"] = int(actors[attacker_index]["kills"]) + 1

func _closest_enemy(actor_index: int) -> int:
	var best := -1
	var best_distance := INF
	var actor: Dictionary = actors[actor_index]
	var body: CharacterBody2D = actor["body"]
	for i in actors.size():
		if int(actors[i]["team"]) == int(actor["team"]) or not actors[i]["alive"]:
			continue
		var candidate: CharacterBody2D = actors[i]["body"]
		var distance := body.global_position.distance_squared_to(candidate.global_position)
		if distance < best_distance:
			best = i
			best_distance = distance
	return best

func _update_gems() -> void:
	for i in range(gems.size() - 1, -1, -1):
		for actor in actors:
			if not actor["alive"]:
				continue
			var body: CharacterBody2D = actor["body"]
			if body.position.distance_to(gems[i]["position"]) < 34.0:
				actor["gems"] = int(actor["gems"]) + 1
				if actor["player"]:
					show_notice("Gem secured · your team is holding %d" % _team_gems(int(actor["team"])), 2.2)
				gems.remove_at(i)
				break

func _update_objective(delta: float) -> void:
	var team0 := _team_gems(0)
	var team1 := _team_gems(1)
	var next_team := -1
	if team0 >= GEM_GOAL and team0 > team1:
		next_team = 0
	elif team1 >= GEM_GOAL and team1 > team0:
		next_team = 1
	if next_team == -1:
		secure_team = -1
		secure_clock = 0.0
		return
	if secure_team != next_team:
		secure_team = next_team
		secure_clock = SECURE_SECONDS
	else:
		secure_clock -= delta
	if secure_clock <= 0.0:
		match_result = "VICTORY" if secure_team == 0 else "DEFEAT"
		show_notice("%s · press R to replay" % match_result, 20.0)

func _team_gems(team: int) -> int:
	var total := 0
	for actor in actors:
		if actor["alive"] and int(actor["team"]) == team:
			total += int(actor["gems"])
	return total

func _respawn(index: int) -> void:
	var actor: Dictionary = actors[index]
	var body: CharacterBody2D = actor["body"]
	var home := Vector2(285, 400) if int(actor["team"]) == 0 else Vector2(995, 400)
	var lane: float = [-130.0, 0.0, 130.0][index % 3]
	body.position = home + Vector2(0, lane)
	body.visible = true
	body.collision_layer = 2
	actor["hp"] = actor["max_hp"]
	actor["alive"] = true
	actor["respawn"] = 0.0
	actor["ammo"] = 3

func _use_super() -> void:
	if super_charge < 1.0 or actors.is_empty():
		return
	var player: Dictionary = actors[0]
	var body: CharacterBody2D = player["body"]
	var aim: Vector2 = player["aim"]
	var hit := 0
	for i in actors.size():
		if int(actors[i]["team"]) == 0 or not actors[i]["alive"]:
			continue
		var target: CharacterBody2D = actors[i]["body"]
		var offset := target.position - body.position
		if offset.length() <= 390.0 and aim.dot(offset.normalized()) > 0.58:
			_damage_actor(i, 75.0, 0)
			hit += 1
	super_charge = 0.0
	show_notice("Super fired · %d target(s) hit" % hit, 1.8)

func _use_gadget() -> void:
	if gadget_clock > 0.0 or actors.is_empty():
		return
	var player: Dictionary = actors[0]
	var body: CharacterBody2D = player["body"]
	var movement := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	var direction: Vector2 = movement if movement.length_squared() > 0.0 else player["aim"]
	body.position += direction.normalized() * 110.0
	body.position.x = clampf(body.position.x, 45.0, 1235.0)
	body.position.y = clampf(body.position.y, 45.0, 755.0)
	player["ammo"] = mini(3, int(player["ammo"]) + 1)
	gadget_clock = 8.0
	show_notice("Quick Step · evade and reload", 1.8)

func show_notice(message: String, seconds: float = 2.0) -> void:
	notice = message
	notice_clock = seconds

func actor_index_for_body(body: CharacterBody2D) -> int:
	return int(body.get_meta("actor_index", -1))

func _draw() -> void:
	if Engine.is_editor_hint():
		return
	_draw_arena()
	for gem in gems:
		var pos: Vector2 = gem["position"] + Vector2(0, sin(elapsed * 3.0 + float(gem["bob"])) * 4.0)
		draw_texture_rect(GEM_ART, Rect2(pos - Vector2(12, 14), Vector2(24, 28)), false)
	for shot in shots:
		if is_instance_valid(shot):
			draw_circle(shot.position, 6.0, Color("fff1ab"))
	if multiplayer_mode:
		for shot in network_shots:
			draw_circle(Vector2(float(shot.x), float(shot.y)), 6.0, Color("fff1ab"))
	for actor in actors:
		if actor["alive"]:
			_draw_actor(actor)
	_draw_hud()
	if is_paused:
		_draw_overlay("PAUSED", "Press P / Esc to return")
	elif match_result:
		_draw_overlay(match_result, "Open a new lobby to play again" if multiplayer_mode else "Press R to play again")

func _draw_arena() -> void:
	draw_rect(Rect2(Vector2.ZERO, WORLD), Color("101a2b"))
	for x in range(40, 1280, 40):
		draw_line(Vector2(x, 25), Vector2(x, 775), Color(0.21, 0.29, 0.39, 0.28), 1.0)
	for y in range(40, 800, 40):
		draw_line(Vector2(25, y), Vector2(1255, y), Color(0.21, 0.29, 0.39, 0.28), 1.0)
	draw_rect(Rect2(44, 52, 1192, 696), Color("16243a"), false, 3.0)
	# Midline, gem well, and lanes make the objective and approach routes legible.
	draw_line(Vector2(640, 82), Vector2(640, 718), Color("495a75"), 2.0)
	draw_circle(Vector2(640, 400), 94, Color(0.13, 0.42, 0.46, 0.15))
	draw_arc(Vector2(640, 400), 94, 0, TAU, 64, Color("31c8c1"), 3.0)
	draw_arc(Vector2(640, 400), 52, 0, TAU, 48, Color("278f91"), 1.5)
	draw_string(ThemeDB.fallback_font, Vector2(594, 282), "GEM WELL", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color("84deda"))
	if walls.is_empty():
		for rect in [Rect2(0, 0, WORLD.x, 24), Rect2(0, WORLD.y - 24, WORLD.x, 24), Rect2(0, 0, 24, WORLD.y), Rect2(WORLD.x - 24, 0, 24, WORLD.y), Rect2(516, 270, 90, 66), Rect2(516, 464, 90, 66), Rect2(674, 270, 90, 66), Rect2(674, 464, 90, 66), Rect2(310, 180, 54, 54), Rect2(916, 566, 54, 54)]:
			var color := Color("263b5f") if rect.size.x >= WORLD.x - 5 or rect.size.y >= WORLD.y - 5 else Color("384c6b")
			draw_rect(rect, color)
			if rect.size.x < WORLD.x - 5 and rect.size.y < WORLD.y - 5:
				draw_rect(Rect2(rect.position + Vector2(8, 7), rect.size - Vector2(16, 14)), color.lightened(0.13), false, 2.0)
	for body in walls:
		if is_instance_valid(body) and body.has_meta("draw_rect"):
			var rect: Rect2 = body.get_meta("draw_rect")
			var color: Color = body.get_meta("draw_color")
			if rect.size.x >= WORLD.x - 5 or rect.size.y >= WORLD.y - 5:
				draw_rect(rect, color)
			else:
				draw_rect(rect, color)
				draw_rect(Rect2(rect.position + Vector2(8, 7), rect.size - Vector2(16, 14)), color.lightened(0.13), false, 2.0)

func _draw_preview() -> void:
	_draw_preview_actor(Vector2(260, 400), "pin", "YOU", Color("27b7c8"))
	_draw_preview_actor(Vector2(380, 300), "brick", "ALLY", Color("27b7c8"))
	_draw_preview_actor(Vector2(380, 500), "comet", "ALLY", Color("27b7c8"))
	_draw_preview_actor(Vector2(930, 300), "pin", "BOT", Color("ed6679"))
	_draw_preview_actor(Vector2(970, 400), "brick", "BOT", Color("ed6679"))
	_draw_preview_actor(Vector2(930, 500), "comet", "BOT", Color("ed6679"))
	draw_texture_rect(GEM_ART, Rect2(628, 386, 24, 28), false)
	draw_rect(Rect2(48, 48, 394, 84), Color(0.045, 0.075, 0.12, 0.95), true)
	draw_string(ThemeDB.fallback_font, Vector2(72, 85), "BRAWLLABS · GEM GRAB", HORIZONTAL_ALIGNMENT_LEFT, -1, 25, Color("f2f6ff"))
	draw_string(ThemeDB.fallback_font, Vector2(72, 112), "WASD move  ·  mouse aim / fire  ·  E super  ·  Q gadget", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("b5c3d8"))

func _draw_preview_actor(pos: Vector2, hero_id: String, caption: String, team_color: Color) -> void:
	draw_circle(pos + Vector2(0, 22), 28, Color(0, 0, 0, 0.3))
	draw_arc(pos, 27, 0, TAU, 48, team_color, 4.0)
	draw_texture_rect(_hero_texture(hero_id), Rect2(pos - Vector2(24, 24), Vector2(48, 48)), false)
	draw_string(ThemeDB.fallback_font, pos + Vector2(-22, 42), caption, HORIZONTAL_ALIGNMENT_CENTER, 48, 10, Color("e4ecf8"))

func _draw_actor(actor: Dictionary) -> void:
	var body: CharacterBody2D = actor["body"]
	var pos := body.position
	var team_color := Color("39d1d3") if int(actor["team"]) == 0 else Color("f07183")
	draw_circle(pos + Vector2(0, 20), 25, Color(0, 0, 0, 0.32))
	draw_arc(pos, 25, 0, TAU, 48, team_color, 3.0)
	draw_texture_rect(_hero_texture(str(actor["hero"])), Rect2(pos - Vector2(22, 22), Vector2(44, 44)), false)
	var health_ratio := clampf(float(actor["hp"]) / float(actor["max_hp"]), 0.0, 1.0)
	draw_rect(Rect2(pos + Vector2(-23, -32), Vector2(46, 5)), Color("1d2633"))
	draw_rect(Rect2(pos + Vector2(-23, -32), Vector2(46 * health_ratio, 5)), Color("70e28b") if health_ratio > 0.35 else Color("ff8a78"))
	if int(actor["gems"]) > 0:
		draw_texture_rect(GEM_ART, Rect2(pos + Vector2(13, -30), Vector2(14, 16)), false)
		draw_string(ThemeDB.fallback_font, pos + Vector2(30, -17), str(actor["gems"]), HORIZONTAL_ALIGNMENT_LEFT, 24, 13, Color("e9fffa"))
	if actor["player"]:
		var aim: Vector2 = actor["aim"]
		draw_line(pos + aim * 25.0, pos + aim * 42.0, Color("fff2c2"), 3.0)

func _draw_hud() -> void:
	var team0 := _team_gems(0)
	var team1 := _team_gems(1)
	draw_rect(Rect2(32, 22, 1216, 84), Color(0.045, 0.07, 0.115, 0.94), true)
	draw_string(ThemeDB.fallback_font, Vector2(54, 56), "BRAWL", HORIZONTAL_ALIGNMENT_LEFT, -1, 17, Color("f2f5fd"))
	draw_string(ThemeDB.fallback_font, Vector2(54, 80), "LABS", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("42d7d2"))
	draw_string(ThemeDB.fallback_font, Vector2(184, 70), "BLUE TEAM" if multiplayer_mode else "YOUR TEAM", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("a6bacf"))
	draw_string(ThemeDB.fallback_font, Vector2(184, 94), "%02d" % team0, HORIZONTAL_ALIGNMENT_LEFT, -1, 25, Color("46e0dc"))
	draw_string(ThemeDB.fallback_font, Vector2(1098, 70), "RED TEAM" if multiplayer_mode else "RIVAL TEAM", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("a6bacf"))
	draw_string(ThemeDB.fallback_font, Vector2(1098, 94), "%02d" % team1, HORIZONTAL_ALIGNMENT_LEFT, -1, 25, Color("ff8390"))
	var timer_text := "%02d:%02d" % [int(elapsed) / 60, int(elapsed) % 60]
	draw_string(ThemeDB.fallback_font, Vector2(603, 74), timer_text, HORIZONTAL_ALIGNMENT_CENTER, 76, 24, Color("f4f7ff"))
	if secure_team >= 0:
		var remaining := maxf(0.0, secure_clock)
		var msg := ("YOUR TEAM SECURING · %0.1fs" % remaining) if secure_team == 0 else ("RIVALS SECURING · %0.1fs" % remaining)
		draw_string(ThemeDB.fallback_font, Vector2(640, 139), msg, HORIZONTAL_ALIGNMENT_CENTER, 340, 14, Color("f5e99a"))
	if notice_clock > 0.0 and not notice.is_empty():
		draw_rect(Rect2(352, 713, 576, 42), Color(0.04, 0.07, 0.12, 0.9), true)
		draw_string(ThemeDB.fallback_font, Vector2(640, 740), notice, HORIZONTAL_ALIGNMENT_CENTER, 550, 15, Color("e5eef9"))
	if multiplayer_mode and network_actor < 0:
		draw_string(ThemeDB.fallback_font, Vector2(44, 765), "SPECTATOR  /  LIVE SERVER STATE", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("98e8df"))
		draw_string(ThemeDB.fallback_font, Vector2(800, 765), "Watching only - no player controls", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("b5c3d8"))
		return
	var p: Dictionary = actors[network_actor] if multiplayer_mode else actors[0]
	draw_string(ThemeDB.fallback_font, Vector2(44, 765), "HP %03d / %03d" % [int(maxf(0, p["hp"])), int(p["max_hp"])], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("e5eef9"))
	draw_string(ThemeDB.fallback_font, Vector2(266, 765), "AMMO  %d / 3" % int(p["ammo"]), HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("f6d986"))
	draw_string(ThemeDB.fallback_font, Vector2(494, 765), "SUPER  %d%%  [E]" % int(super_charge * 100), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("cba8ff"))
	draw_string(ThemeDB.fallback_font, Vector2(760, 765), "GADGET  %s  [Q]" % ("READY" if gadget_clock <= 0 else "%ds" % ceili(gadget_clock)), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("abd9ff"))
	draw_string(ThemeDB.fallback_font, Vector2(1086, 765), "5 gems + 8 sec", HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color("98e8df"))

func _draw_overlay(title: String, subtitle: String) -> void:
	draw_rect(Rect2(Vector2.ZERO, WORLD), Color(0.02, 0.04, 0.08, 0.72))
	draw_string(ThemeDB.fallback_font, Vector2(640, 372), title, HORIZONTAL_ALIGNMENT_CENTER, 600, 50, Color("f3f7ff"))
	draw_string(ThemeDB.fallback_font, Vector2(640, 422), subtitle, HORIZONTAL_ALIGNMENT_CENTER, 600, 18, Color("b8c7db"))

func _hero_texture(hero_id: String) -> Texture2D:
	match hero_id:
		"brick": return BRICK_ART
		"comet": return COMET_ART
		_: return PIN_ART


func _install_network_bridge() -> void:
	network_callback = JavaScriptBridge.create_callback(_on_network_state)
	JavaScriptBridge.get_interface("window")["__playforgeBrawlCallback"] = network_callback
	JavaScriptBridge.eval("""
		window.__playforgeBrawlListener = event => {
			if (event.source !== window.parent || event.origin !== location.origin || event.data?.source !== 'playforge-brawl-lobby' || event.data.type !== 'state') return;
			window.__playforgeBrawlCallback(JSON.stringify(event.data));
		};
		window.addEventListener('message', window.__playforgeBrawlListener);
		window.parent.postMessage({source:'playforge-brawl-game',type:'ready'},location.origin);
	""", true)

func _exit_tree() -> void:
	if multiplayer_mode and OS.has_feature("web"):
		JavaScriptBridge.eval("window.removeEventListener('message',window.__playforgeBrawlListener); window.__playforgeBrawlCallback=null;", true)
		network_callback = null

func _on_network_state(arguments: Array) -> void:
	if arguments.is_empty() or not arguments[0] is String:
		return
	var message = JSON.parse_string(arguments[0])
	if not message is Dictionary or not message.get("state") is Dictionary:
		return
	var state: Dictionary = message.state
	if not state.get("game") is Dictionary:
		return
	var game: Dictionary = state.game
	var remote_actors = game.get("actors", [])
	if not remote_actors is Array or remote_actors.size() != 6:
		return
	network_actor = -1
	for entry in remote_actors:
		if not entry is Dictionary:
			return
		var index := int(entry.get("slot", -1))
		if index < 0 or index >= actors.size():
			return
		var actor: Dictionary = actors[index]
		var body: CharacterBody2D = actor.body
		body.position = Vector2(float(entry.x), float(entry.y))
		body.visible = bool(entry.alive)
		actor["name"] = str(entry.name)
		actor["team"] = int(entry.team)
		actor["hero"] = str(entry.hero)
		actor["hp"] = float(entry.hp)
		actor["max_hp"] = float(entry.maxHp)
		actor["alive"] = bool(entry.alive)
		actor["gems"] = int(entry.gems)
		actor["ammo"] = int(entry.ammo)
		actor["aim"] = Vector2(float(entry.aimX), float(entry.aimY))
		actor["player"] = message.get("playerId") is String and not str(message.get("playerId")).is_empty() and entry.get("controllerId") == message.get("playerId")
		if actor["player"]:
			network_actor = index
			super_charge = float(entry.get("superCharge", 0.0))
			gadget_clock = float(entry.get("gadgetCooldown", 0.0))
	elapsed = float(game.elapsed)
	secure_team = int(game.secureTeam)
	secure_clock = float(game.secureRemaining)
	match_result = str(game.result)
	network_shots = game.shots
	gems.clear()
	for gem in game.gems:
		gems.append({"position": Vector2(float(gem.x), float(gem.y)), "bob": 0.0})
	notice = "SPECTATOR" if network_actor < 0 else "LIVE 3 vs 3 · disconnected players are replaced by bots"
	notice_clock = 1.0
	queue_redraw()

func _send_network_input(delta: float) -> void:
	if network_actor < 0 or not match_result.is_empty():
		return
	network_clock += delta
	if network_clock < 0.05:
		return
	network_clock = 0.0
	network_sequence += 1
	var movement := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	var payload := {"source": "playforge-brawl-game", "type": "input", "input": {
		"seq": network_sequence, "moveX": movement.x, "moveY": movement.y,
		"aimX": mouse_target.x, "aimY": mouse_target.y, "fire": Input.is_action_pressed("attack"),
		"super": Input.is_action_pressed("super"), "gadget": Input.is_action_pressed("gadget")}}
	JavaScriptBridge.eval("window.parent.postMessage(JSON.parse(%s),location.origin);" % JSON.stringify(JSON.stringify(payload)), true)
