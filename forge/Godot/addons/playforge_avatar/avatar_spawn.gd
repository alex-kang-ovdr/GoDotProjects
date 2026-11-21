@tool
class_name PlayForgeAvatarSpawn
extends Marker3D

const AvatarController = preload("res://addons/playforge_avatar/avatar_controller.gd")

## UEFN-style Player Spawner Device for PlayForge.
## Place this node in any 3D scene to spawn the player's PlayHub Avatar with built-in
## TPS / FPS / TopDown locomotion, emotes, and ragdoll physics.
## Cosmetics (skin, attachments, emote wheel) come exclusively from the player's
## PlayHub Locker and cannot be overridden by Forge projects.

signal avatar_spawned(controller: AvatarController)

@export var camera_mode: AvatarController.CameraMode = AvatarController.CameraMode.TPS
@export_range(0.5, 2.0, 0.05) var walk_speed_multiplier := 1.0
@export_range(0.5, 2.5, 0.05) var sprint_speed_multiplier := 1.0
@export_range(0.5, 2.0, 0.05) var jump_height_multiplier := 1.0
@export var allow_crouch := true
@export var allow_emotes := true
@export var allow_ragdoll := true
@export var allow_camera_toggle_hotkey := true
@export var topdown_distance := 11.5
@export var topdown_pitch_degrees := -56.0
@export var topdown_face_cursor := false
@export var auto_spawn_on_ready := true

var _spawned_avatar: AvatarController


func _ready() -> void:
	if Engine.is_editor_hint():
		return
	if auto_spawn_on_ready:
		call_deferred("spawn_avatar")


func spawn_avatar() -> AvatarController:
	if _spawned_avatar != null and is_instance_valid(_spawned_avatar):
		return _spawned_avatar
	var controller: AvatarController = AvatarController.new()
	controller.name = "PlayForgePlayerAvatar"
	controller.camera_mode = camera_mode
	controller.walk_speed_multiplier = walk_speed_multiplier
	controller.sprint_speed_multiplier = sprint_speed_multiplier
	controller.jump_height_multiplier = jump_height_multiplier
	controller.allow_crouch = allow_crouch
	controller.allow_emotes = allow_emotes
	controller.allow_ragdoll = allow_ragdoll
	controller.allow_camera_toggle_hotkey = allow_camera_toggle_hotkey
	controller.topdown_distance = topdown_distance
	controller.topdown_pitch_degrees = topdown_pitch_degrees
	controller.topdown_face_cursor = topdown_face_cursor
	var parent_node := get_parent()
	if parent_node != null:
		parent_node.add_child(controller)
	else:
		add_child(controller)
	if is_inside_tree():
		controller.global_transform = global_transform
	else:
		controller.transform = transform
	_spawned_avatar = controller
	avatar_spawned.emit(controller)
	return controller


func get_avatar() -> AvatarController:
	return _spawned_avatar
