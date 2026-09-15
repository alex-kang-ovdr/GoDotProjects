extends Node3D

const BallKinematicsClass := preload("res://scripts/ball_kinematics.gd")
const INITIAL_POSITION := Vector3(-4.0, 1.5, 0.0)
const INITIAL_VELOCITY := Vector3(3.8, 5.8, -0.8)
const PREVIEW_DURATION_S := 1.35
const FIXED_DT_S := 1.0 / 60.0

var _snapshots: Array[Dictionary] = []
var _playback_time_s := 0.0
var _ball: MeshInstance3D
var _status: Label

func _ready() -> void:
	_snapshots = BallKinematicsClass.simulate(INITIAL_POSITION, INITIAL_VELOCITY, PREVIEW_DURATION_S, FIXED_DT_S)
	_create_environment()
	_create_trajectory_line()

func _physics_process(delta: float) -> void:
	_playback_time_s = fmod(_playback_time_s + delta, PREVIEW_DURATION_S)
	_ball.position = _position_at_time(_playback_time_s)
	_status.text = "Ball Simulator M1 Demo\nIndependent fixed-step trajectory (no Godot collision bodies)\n%.3fs  |  snapshot %d / %d\nM2 will add observer-only sphere sweep / ray queries." % [
		_playback_time_s,
		int(_playback_time_s / FIXED_DT_S),
		_snapshots.size() - 1,
	]

func _position_at_time(time_s: float) -> Vector3:
	var index := mini(int(time_s / FIXED_DT_S), _snapshots.size() - 1)
	return _snapshots[index]["position_m"] as Vector3

func _create_environment() -> void:
	var camera := Camera3D.new()
	camera.position = Vector3(9.5, 6.0, 12.0)
	camera.look_at_from_position(camera.position, Vector3(0.0, 1.0, 0.0))
	add_child(camera)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-50.0, -25.0, 0.0)
	light.light_energy = 1.5
	add_child(light)

	var floor := MeshInstance3D.new()
	var floor_mesh := BoxMesh.new()
	floor_mesh.size = Vector3(20.0, 0.1, 12.0)
	floor.mesh = floor_mesh
	floor.position.y = -0.05
	add_child(floor)

	_ball = MeshInstance3D.new()
	var ball_mesh := SphereMesh.new()
	ball_mesh.radius = 0.11
	ball_mesh.height = 0.22
	_ball.mesh = ball_mesh
	_ball.position = INITIAL_POSITION
	add_child(_ball)

	var overlay := CanvasLayer.new()
	_status = Label.new()
	_status.position = Vector2(24.0, 24.0)
	_status.add_theme_font_size_override("font_size", 20)
	overlay.add_child(_status)
	add_child(overlay)

func _create_trajectory_line() -> void:
	var line_mesh := ImmediateMesh.new()
	line_mesh.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	for snapshot in _snapshots:
		line_mesh.surface_add_vertex(snapshot["position_m"] as Vector3)
	line_mesh.surface_end()
	var line := MeshInstance3D.new()
	line.mesh = line_mesh
	add_child(line)
