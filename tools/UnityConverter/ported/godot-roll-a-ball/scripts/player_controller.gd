class_name RollPlayerController
extends RigidBody3D

## Port of Assets/Scripts/PlayerController.cs
## Unity 3D LH (+X right, +Z forward) -> Godot 3D RH (+X right, -Z forward)
## Unity legacy rigidbody.AddForce(movement * speed * delta) -> RigidBody3D.apply_central_force

@export var speed: float = 14.0
var count: int = 0
var total_pickups: int = 12
var count_label: Label
var win_label: Label
var synthetic_input: Vector2 = Vector2.ZERO

func setup_ui(c_label: Label, w_label: Label, pickup_total: int) -> void:
	count_label = c_label
	win_label = w_label
	total_pickups = pickup_total
	count = 0
	_set_count_text()
	if win_label:
		win_label.text = ""

func _physics_process(_delta: float) -> void:
	var move_h := Input.get_axis("ui_left", "ui_right")
	var move_v := Input.get_axis("ui_down", "ui_up")
	if synthetic_input != Vector2.ZERO:
		move_h = synthetic_input.x
		move_v = synthetic_input.y

	# Unity +Z forward == Godot -Z forward
	var movement := Vector3(move_h, 0.0, -move_v)
	apply_central_force(movement * speed)

func collect_pickup(pickup_node: Node3D) -> void:
	if not pickup_node.visible:
		return
	pickup_node.visible = false
	pickup_node.set_deferred("monitoring", false)
	count += 1
	_set_count_text()

func _set_count_text() -> void:
	if count_label:
		count_label.text = "Count: %d" % count
	if win_label and count >= total_pickups:
		win_label.text = "YOU WIN!"
