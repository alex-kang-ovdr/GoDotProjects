class_name TanksCameraRig
extends Node3D

## Port of Assets/_Completed-Assets/Scripts/Camera/CameraControl.cs
## Smoothly tracks average position of all active tanks and adjusts Camera3D orthographic size.

@export var damp_time: float = 0.2
@export var screen_edge_buffer: float = 4.5
@export var min_size: float = 11.5

@onready var cam: Camera3D = $Camera3D
var targets: Array = []
var desired_position: Vector3 = Vector3.ZERO

func _physics_process(delta: float) -> void:
	if targets.is_empty():
		return
	_find_average_position()
	var t := 1.0 - exp(-delta / max(damp_time, 0.01))
	global_position = global_position.lerp(desired_position, t)
	var req := _find_required_size()
	cam.size = lerpf(cam.size, req, t)

func set_start_position_and_size() -> void:
	_find_average_position()
	global_position = desired_position
	cam.size = _find_required_size()

func _find_average_position() -> void:
	var avg := Vector3.ZERO
	var count := 0
	for target in targets:
		if not is_instance_valid(target) or target.is_dead:
			continue
		avg += target.global_position
		count += 1
	if count > 0:
		avg /= float(count)
	avg.y = global_position.y
	desired_position = avg

func _find_required_size() -> float:
	var desired_local := to_local(desired_position)
	var half_size := 0.0
	var aspect := 16.0 / 9.0
	for target in targets:
		if not is_instance_valid(target) or target.is_dead:
			continue
		var target_local := to_local(target.global_position)
		var diff := target_local - desired_local
		half_size = max(half_size, abs(diff.y))
		half_size = max(half_size, abs(diff.x) / aspect)
	half_size += screen_edge_buffer
	# Godot Camera3D.size is FULL height (2x Unity orthographicSize)
	return max(half_size * 2.0, min_size * 2.0)
