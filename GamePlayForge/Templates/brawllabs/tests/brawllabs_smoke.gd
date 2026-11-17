extends SceneTree

const MAIN := preload("res://scenes/main.tscn")

func _initialize() -> void:
	root.size = Vector2i(1280, 800)
	root.content_scale_size = Vector2i(1280, 800)
	_run.call_deferred()

func _run() -> void:
	var game: Node2D = MAIN.instantiate()
	root.add_child(game)
	await process_frame
	var player: CharacterBody2D = game.actors[0]["body"]
	var start_position: Vector2 = player.position
	Input.action_press("move_right")
	for _frame in range(90):
		await physics_frame
	Input.action_release("move_right")
	assert(player.position.x > start_position.x + 180.0, "real movement input must move the CharacterBody2D")
	assert(game._team_gems(0) >= 1, "walking through the center gem must contribute to the team's objective")

	var target_index := 3
	var target: Dictionary = game.actors[target_index]
	var target_body: CharacterBody2D = target["body"]
	target_body.position = player.position + Vector2(190, 0)
	print("BRAWLLABS_INPUT_VIEWPORT window=%s viewport=%s screen=%s" % [root.size, game.get_viewport_rect(), root.get_final_transform()])
	var damage_before := float(target["damage_taken"])
	var aim_event := InputEventMouseMotion.new()
	# parse_input_event expects window coordinates, including headless stretch/letterboxing.
	var mouse_position: Vector2 = root.get_final_transform() * game.get_global_transform_with_canvas() * game.to_local(target_body.global_position)
	aim_event.position = mouse_position
	Input.parse_input_event(aim_event)
	var fire_event := InputEventMouseButton.new()
	fire_event.button_index = MOUSE_BUTTON_LEFT
	fire_event.position = mouse_position
	fire_event.pressed = true
	Input.parse_input_event(fire_event)
	for _frame in range(75):
		await physics_frame
	fire_event.pressed = false
	Input.parse_input_event(fire_event)
	if float(target["damage_taken"]) <= damage_before:
		push_error("aim and held fire input did not cause projectile damage; player=%s target=%s mouse=%s aim=%s ammo=%d shots=%d" % [player.position, target_body.position, game.mouse_target, game.actors[0]["aim"], game.actors[0]["ammo"], game.shots.size()])
		quit(1)
		return
	print("BRAWLLABS_SMOKE_OK moved=%.1f held_gems=%d target_damage=%.1f" % [player.position.x - start_position.x, game._team_gems(0), float(target["damage_taken"]) - damage_before])
	Input.action_press("pause")
	await process_frame
	await process_frame
	Input.action_release("pause")
	assert(game.is_paused and paused, "pause input must pause the match")
	var paused_elapsed: float = game.elapsed
	for _frame in range(10):
		await process_frame
	assert(game.elapsed == paused_elapsed, "paused match must not advance")
	Input.action_press("pause")
	await process_frame
	await process_frame
	Input.action_release("pause")
	assert(not game.is_paused and not paused, "pause input must also resume the match")
	# Isolate lifecycle rules after testing real mouse input and projectile damage above.
	game.start_match()
	for index in range(1, game.actors.size()):
		game.actors[index]["alive"] = false
		game.actors[index]["respawn"] = 999.0
	game._damage_actor(0, 999.0, 3)
	assert(not game.actors[0]["alive"], "death fixture must enter respawn state")
	for _frame in range(190):
		await physics_frame
	assert(game.actors[0]["alive"] and game.actors[0]["hp"] == game.actors[0]["max_hp"], "player must respawn after death")
	game.actors[0]["gems"] = 5
	for _frame in range(490):
		await physics_frame
	assert(game.match_result == "VICTORY", "holding the gem lead must complete the match")
	Input.action_press("restart")
	await process_frame
	await process_frame
	Input.action_release("restart")
	assert(game.match_result.is_empty() and game._team_gems(0) == 0 and game.actors.size() == 6, "restart must restore a fresh 3v3 match")
	print("BRAWLLABS_LIFECYCLE_OK pause=resume respawn=alive objective=victory restart=3v3")
	quit(0)
