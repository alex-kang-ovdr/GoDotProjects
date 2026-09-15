extends Node3D

const FLOOR_Y := 0.25
const GRAVITY := Vector3(0.0, -9.81, 0.0)

var ball: MeshInstance3D
var status_label: Label
var velocity := Vector3(4.5, 7.5, -1.5)
var elapsed_s := 0.0

func _ready() -> void:
	_create_scene()

func _physics_process(delta: float) -> void:
	elapsed_s += delta
	velocity += GRAVITY * delta
	var next_position := ball.position + velocity * delta
	if next_position.y < FLOOR_Y:
		next_position.y = FLOOR_Y
		velocity.y = absf(velocity.y) * 0.65
		velocity.x *= 0.96
		velocity.z *= 0.96
	ball.position = next_position
	status_label.text = "Bootstrap RHI lab\nThis is a rendering/manual-launch smoke scene.\nBallSimulationCore is not bound to Godot yet.\nTime: %.2fs  Velocity: %s" % [elapsed_s, velocity]

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
	ball.position = Vector3(-3.0, 2.0, 2.0)
	add_child(ball)

	var canvas := CanvasLayer.new()
	status_label = Label.new()
	status_label.position = Vector2(24.0, 24.0)
	status_label.add_theme_font_size_override("font_size", 20)
	canvas.add_child(status_label)
	add_child(canvas)
