extends Node

func _ready() -> void:
	_run.call_deferred()

func _run() -> void:
	var packed := load("res://scenes/main.tscn") as PackedScene
	assert(packed != null, "main scene should load")
	var game := packed.instantiate()
	add_child(game)
	await get_tree().process_frame
	assert(game.build_mode, "project should open in build mode")
	assert(game.target_remaining == 9, "nine targets should be present")
	game.add_block()
	assert(game.added_blocks.size() == 1, "build mode should add a block")
	game.toggle_simulation()
	assert(not game.build_mode, "test button should enter simulation")
	for _frame in range(90):
		game.set_drive_input(1.0, 0.0)
		await get_tree().physics_frame
	assert(game.cart.linear_velocity.length() > 0.2, "drive input should accelerate the cart")
	var shell: RigidBody3D = game.fire_cannon()
	assert(shell != null and shell.linear_velocity.length() > 10.0, "Firing should create a moving cannonball")
	for target in game.get_tree().get_nodes_in_group("targets"):
		var impact := RigidBody3D.new()
		game.add_child(impact)
		game._on_shell_hit(target, impact)
	assert(game.target_remaining == 0 and game.victory_label.visible, "destroying every target should show the clear state")
	game.toggle_simulation()
	await get_tree().physics_frame
	assert(game.build_mode and absf(game.cart.position.z - 4.0) < 0.01 and game.cart.position.y > 0.8, "returning to build should reset cart pose")
	assert(game.added_blocks.size() == 1, "returning to build should keep the design")
	assert(game.target_remaining == 9 and not game.victory_label.visible, "returning to build should reset the target field")
	game.reset_build()
	assert(game.added_blocks.is_empty(), "reset should restore the starter design")
	print("Iron Wood smoke passed: build, drive, fire, return, reset")
	get_tree().quit(0)
