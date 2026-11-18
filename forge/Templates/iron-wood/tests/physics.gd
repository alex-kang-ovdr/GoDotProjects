extends Node

const SETTLE_FRAMES := 180
const DRIVE_FRAMES := 48
const STEER_FRAMES := 36
const BRAKE_FRAMES := 36

func _ready() -> void:
	_run.call_deferred()

func _run() -> void:
	var packed := load("res://scenes/main.tscn") as PackedScene
	if not _require(packed != null, "main scene should load"):
		return
	var game := packed.instantiate()
	add_child(game)
	await get_tree().process_frame
	for _frame in range(SETTLE_FRAMES):
		await get_tree().physics_frame
	var settled_height: float = game.cart.global_position.y
	if not _require(settled_height >= 0.18 and settled_height <= 0.25, "cart should settle on the floor, got y=%f" % settled_height):
		return
	if not _require(absf(game.cart.linear_velocity.y) < 0.12, "cart should stop falling after landing"):
		return
	for wheel in game.wheel_nodes:
		if not _require(absf(wheel.global_position.y - 0.38) < 0.04, "cart tires should meet the floor rather than sink below it"):
			return
	var settled_again := settled_height
	for _frame in range(60):
		await get_tree().physics_frame
	settled_again = game.cart.global_position.y
	if not _require(absf(settled_again - settled_height) < 0.03, "cart must not fall through the floor"):
		return

	game.mode_button.pressed.emit()
	if not _require(not game.build_mode, "test-cart UI button should enter simulation mode"):
		return
	var start_position: Vector3 = game.cart.global_position
	var wheel_axle_before: Vector3 = game.cart.global_basis.inverse() * game.wheel_nodes[0].global_basis.y
	_press_key(KEY_W)
	for _frame in range(DRIVE_FRAMES):
		await get_tree().physics_frame
	_release_key(KEY_W)
	var forward_speed: float = game.cart.linear_velocity.dot(-game.cart.global_basis.z)
	if not _require(forward_speed > 0.5, "W should move forward, signed forward speed=%f" % forward_speed):
		return
	if not _require(game.cart.global_position.z < start_position.z - 0.1, "W should move toward the track"):
		return
	var wheel_axle_after: Vector3 = game.cart.global_basis.inverse() * game.wheel_nodes[0].global_basis.y
	if not _require(absf(wheel_axle_after.dot(wheel_axle_before)) > 0.99, "wheel visual spin should stay around the axle without tilting the wheel"):
		return

	var yaw_before: float = game.cart.global_rotation.y
	_press_key(KEY_A)
	for _frame in range(STEER_FRAMES):
		await get_tree().physics_frame
	_release_key(KEY_A)
	var yaw_delta: float = wrapf(game.cart.global_rotation.y - yaw_before, -PI, PI)
	if not _require(yaw_delta > 0.03, "A should steer left, yaw delta=%f" % yaw_delta):
		return

	var speed_before_brake: float = game.cart.linear_velocity.length()
	_press_key(KEY_B)
	for _frame in range(BRAKE_FRAMES):
		await get_tree().physics_frame
	_release_key(KEY_B)
	var speed_after_brake: float = game.cart.linear_velocity.length()
	if not _require(speed_after_brake < speed_before_brake, "B should brake, speed %f -> %f" % [speed_before_brake, speed_after_brake]):
		return
	print("Iron Wood physics passed: settled y=%.3f, forward speed=%.3f, yaw delta=%.3f, brake %.3f -> %.3f" % [settled_again, forward_speed, yaw_delta, speed_before_brake, speed_after_brake])
	get_tree().quit(0)

func _press_key(key: Key) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = key
	event.keycode = key
	event.pressed = true
	Input.parse_input_event(event)

func _release_key(key: Key) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = key
	event.keycode = key
	event.pressed = false
	Input.parse_input_event(event)

func _require(condition: bool, message: String) -> bool:
	if condition:
		return true
	push_error("IRONWOOD_PHYSICS_FAIL: " + message)
	get_tree().quit(1)
	return false
