@tool
class_name PlayForgeAvatarSpawn
extends Marker3D

const AvatarController = preload("res://addons/playforge_avatar/avatar_controller.gd")
const AvatarPortraitUI = preload("res://addons/playforge_avatar/avatar_portrait_ui.gd")

## UEFN-style Player Spawner Device for PlayForge.
## Place this node in any 3D (or 2D via Portrait modes) scene to spawn the player's PlayHub Avatar
## as a 3D world character (TPS/FPS/TopDown + ragdoll), a live 3D RenderTarget UI Portrait
## (Upper-Body min 128x128 or Full-Body min 160x240), or both.
## Cosmetics (skin, attachments, emote wheel) come exclusively from the player's
## PlayHub Locker and cannot be overridden by Forge projects.

enum PresentationMode {
	WORLD_3D = 0,
	PORTRAIT_UPPER_BODY = 1,
	PORTRAIT_FULL_BODY = 2,
	WORLD_3D_WITH_PORTRAIT = 3,
}

signal avatar_spawned(controller: AvatarController)
signal portrait_spawned(portrait: AvatarPortraitUI)

@export var presentation_mode: PresentationMode = PresentationMode.WORLD_3D:
	set(value):
		presentation_mode = clampi(int(value), PresentationMode.WORLD_3D, PresentationMode.WORLD_3D_WITH_PORTRAIT) as PresentationMode
		portrait_size = _clamp_portrait_size(portrait_size)
@export var portrait_size: Vector2 = Vector2(192.0, 192.0):
	set(value):
		portrait_size = _clamp_portrait_size(value)
@export var portrait_corner: AvatarPortraitUI.PortraitCorner = AvatarPortraitUI.PortraitCorner.BOTTOM_LEFT
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
var _spawned_portrait: AvatarPortraitUI


func _clamp_portrait_size(requested: Vector2) -> Vector2:
	var framing := AvatarPortraitUI.PortraitFraming.FULL_BODY if presentation_mode == PresentationMode.PORTRAIT_FULL_BODY else AvatarPortraitUI.PortraitFraming.UPPER_BODY
	return AvatarPortraitUI.clamp_portrait_size(int(framing), requested)


func _ready() -> void:
	if Engine.is_editor_hint():
		return
	if auto_spawn_on_ready:
		call_deferred("spawn_avatar")


func spawn_avatar() -> AvatarController:
	if presentation_mode == PresentationMode.PORTRAIT_UPPER_BODY or presentation_mode == PresentationMode.PORTRAIT_FULL_BODY:
		spawn_portrait_ui()
		return null
	if presentation_mode == PresentationMode.WORLD_3D_WITH_PORTRAIT:
		spawn_portrait_ui()
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


func spawn_portrait_ui() -> AvatarPortraitUI:
	if _spawned_portrait != null and is_instance_valid(_spawned_portrait):
		return _spawned_portrait
	var framing := AvatarPortraitUI.PortraitFraming.FULL_BODY if presentation_mode == PresentationMode.PORTRAIT_FULL_BODY else AvatarPortraitUI.PortraitFraming.UPPER_BODY
	var clamped_size := AvatarPortraitUI.clamp_portrait_size(int(framing), portrait_size)
	if Engine.has_singleton("PlayForgePlatform"):
		var pf = Engine.get_singleton("PlayForgePlatform")
		var existing = pf.call("set_avatar_presentation_mode", int(presentation_mode), clamped_size, int(portrait_corner))
		if existing is AvatarPortraitUI:
			_spawned_portrait = existing
			portrait_spawned.emit(_spawned_portrait)
			return _spawned_portrait
	var layer := CanvasLayer.new()
	layer.name = "PlayForgePortraitLayer"
	layer.layer = 100
	var portrait := AvatarPortraitUI.new()
	portrait.name = "PlayForgeAvatarPortraitUI"
	layer.add_child(portrait)
	var parent_node := get_parent()
	if parent_node != null:
		parent_node.add_child(layer)
	else:
		add_child(layer)
	portrait.configure_portrait(int(framing), clamped_size, int(portrait_corner))
	_spawned_portrait = portrait
	portrait_spawned.emit(_spawned_portrait)
	return _spawned_portrait


func get_portrait_ui() -> AvatarPortraitUI:
	return _spawned_portrait


func request_temporary_avatar_hide(duration_sec: float = 30.0) -> bool:
	if Engine.has_singleton("PlayForgePlatform"):
		return bool(Engine.get_singleton("PlayForgePlatform").call("request_temporary_avatar_hide", duration_sec))
	var rt := get_tree().root.get_node_or_null("PlayForgeAvatarRuntime") if is_inside_tree() else null
	if rt != null and rt.has_method("request_temporary_avatar_hide"):
		return bool(rt.call("request_temporary_avatar_hide", duration_sec))
	return false


func end_temporary_avatar_hide() -> void:
	if Engine.has_singleton("PlayForgePlatform"):
		Engine.get_singleton("PlayForgePlatform").call("end_temporary_avatar_hide")
		return
	var rt := get_tree().root.get_node_or_null("PlayForgeAvatarRuntime") if is_inside_tree() else null
	if rt != null and rt.has_method("end_temporary_avatar_hide"):
		rt.call("end_temporary_avatar_hide")


func get_avatar_hide_state() -> Dictionary:
	if Engine.has_singleton("PlayForgePlatform"):
		return Engine.get_singleton("PlayForgePlatform").call("get_avatar_hide_state")
	var rt := get_tree().root.get_node_or_null("PlayForgeAvatarRuntime") if is_inside_tree() else null
	if rt != null and rt.has_method("get_avatar_hide_state"):
		return rt.call("get_avatar_hide_state")
	return {}


func request_temporary_hud_hide(duration_sec: float = 30.0) -> bool:
	if Engine.has_singleton("PlayForgePlatform"):
		return bool(Engine.get_singleton("PlayForgePlatform").call("request_temporary_hud_hide", duration_sec))
	var rt := get_tree().root.get_node_or_null("PlayForgeAvatarRuntime") if is_inside_tree() else null
	if rt != null and rt.has_method("request_temporary_hud_hide"):
		return bool(rt.call("request_temporary_hud_hide", duration_sec))
	return false


func end_temporary_hud_hide() -> void:
	if Engine.has_singleton("PlayForgePlatform"):
		Engine.get_singleton("PlayForgePlatform").call("end_temporary_hud_hide")
		return
	var rt := get_tree().root.get_node_or_null("PlayForgeAvatarRuntime") if is_inside_tree() else null
	if rt != null and rt.has_method("end_temporary_hud_hide"):
		rt.call("end_temporary_hud_hide")


func get_hud_hide_state() -> Dictionary:
	if Engine.has_singleton("PlayForgePlatform"):
		return Engine.get_singleton("PlayForgePlatform").call("get_hud_hide_state")
	var rt := get_tree().root.get_node_or_null("PlayForgeAvatarRuntime") if is_inside_tree() else null
	if rt != null and rt.has_method("get_hud_hide_state"):
		return rt.call("get_hud_hide_state")
	return {}
