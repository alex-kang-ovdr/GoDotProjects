class_name SpaceMover
extends Area3D

## Port of Assets/Scripts/Mover.cs + DestroyByBoundary.cs

@export var speed: float = -18.0 # Godot -Z is forward (top of screen)
@export var tumble: Vector3 = Vector3.ZERO
@export var bound_z_min: float = -14.0
@export var bound_z_max: float = 14.0

func _process(delta: float) -> void:
	position.z += speed * delta
	if tumble != Vector3.ZERO:
		rotation += tumble * delta
	if position.z < bound_z_min or position.z > bound_z_max:
		queue_free()
