extends Node3D

const FLOOR_Y := 0.25
const GRAVITY := Vector3(0.0, -9.81, 0.0)
const START_POSITION := Vector3(-3.0, 2.0, 2.0)
const START_VELOCITY := Vector3(4.5, 7.5, -1.5)
const TRAJECTORY_DURATION_S := 8.0
const TRAJECTORY_STEP_S := 1.0 / 60.0
const BOUNCE_RESTITUTION := 0.65
const TRAJECTORY_SIMULATOR_SCRIPT := preload("res://scripts/ball_trajectory_simulator.gd")

var ball: MeshInstance3D
var status_label: Label
var trajectory_player: Variant = TRAJECTORY_SIMULATOR_SCRIPT.new()

func _ready() -> void:
	_create_scene()
	trajectory_player.simulate(
		START_POSITION,
		START_VELOCITY,
		GRAVITY,
		FLOOR_Y,
		TRAJECTORY_DURATION_S,
		TRAJECTORY_STEP_S,
		BOUNCE_RESTITUTION,
	)
	trajectory_player.play()
	_apply_playback_snapshot()

func _process(delta: float) -> void:
	trajectory_player.advance_playback(delta)
	_apply_playback_snapshot()

func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey) or not event.pressed or event.echo:
		return
	match event.keycode:
		KEY_SPACE:
			trajectory_player.toggle_playback()
		KEY_S:
			trajectory_player.stop()
		KEY_R:
			trajectory_player.replay()

func _apply_playback_snapshot() -> void:
	var snapshot: Dictionary = trajectory_player.get_current_snapshot()
	if snapshot.is_empty():
		return
	var position: Vector3 = snapshot["position"]
	ball.position = position
	status_label.text = "Ball Simulator playback (precomputed)\n[Space] play/pause  [S] stop  [R] replay\nTime: %.2f / %.2fs  Velocity: %s" % [
		trajectory_player.playback_time_s,
		trajectory_player.get_duration_s(),
		snapshot["velocity"],
	]

func _create_scene() -> void:
	var camera := Camera3D.new()
	camera.position = Vector3(9.0, 6.0, 12.0)
	camera.look_at_from_position(camera.position, Vector3(0.0, 1.0, 0.0))
	add_child(camera)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55.0, -25.0, 0.0)
	light.light_energy = 1.5
	add_child(light)

	var floor := MeshInstance3D.new()
	var floor_mesh := BoxMesh.new()
	floor_mesh.size = Vector3(20.0, 0.2, 12.0)
	floor.mesh = floor_mesh
	floor.position.y = -0.1
	add_child(floor)

	ball = MeshInstance3D.new()
	var ball_mesh := SphereMesh.new()
	ball_mesh.radius = 0.25
	ball_mesh.height = 0.5
	ball.mesh = ball_mesh
	ball.position = START_POSITION
	add_child(ball)

	var canvas := CanvasLayer.new()
	status_label = Label.new()
	status_label.position = Vector2(24.0, 24.0)
	status_label.add_theme_font_size_override("font_size", 20)
	canvas.add_child(status_label)
	add_child(canvas)
