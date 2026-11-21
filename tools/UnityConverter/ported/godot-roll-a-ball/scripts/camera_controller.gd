class_name CameraController3D
extends Camera3D

## Port of Assets/Scripts/CameraController.cs (LateUpdate -> _process)

@export var player_path: NodePath
var player: Node3D
var offset: Vector3

func _ready() -> void:
	player = get_node_or_null(player_path) as Node3D
	if player:
		offset = global_position - player.global_position
	else:
		offset = global_position

func _process(_delta: float) -> void:
	if player:
		global_position = player.global_position + offset
