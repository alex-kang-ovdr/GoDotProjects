class_name Rotator3D
extends Node3D

## Port of Assets/Scripts/Rotator.cs
## Unity: transform.Rotate(new Vector3(15, 30, 45) * Time.deltaTime) (degrees)

func _process(delta: float) -> void:
	rotate_x(deg_to_rad(15.0 * delta))
	rotate_y(deg_to_rad(30.0 * delta))
	rotate_z(deg_to_rad(45.0 * delta))
