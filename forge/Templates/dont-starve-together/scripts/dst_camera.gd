class_name DSTCamera
extends Camera3D

## Don't Starve Together 2.5D 사선 투영 카메라 (scripts/cameras/followcamera.lua 복원).
## FOV=35°, 기본 heading=45°(Q/E ±45° 회전), 줌(15..50) 연동 pitch(30°..60°), targetoffset=(0, 1.5, 0).

var heading_deg: float = 45.0
var heading_target: float = 45.0
var distance: float = 30.0
var distance_target: float = 30.0
var min_dist: float = 15.0
var max_dist: float = 50.0
var min_pitch: float = 30.0
var max_pitch: float = 60.0
var zoom_step: float = 4.0
var target_offset: Vector3 = Vector3(0.0, 1.5, 0.0)
var current_pos: Vector3 = Vector3.ZERO


func configure_from_db(cam_cfg: Dictionary) -> void:
	fov = float(cam_cfg.get("fov", 35.0))
	heading_deg = float(cam_cfg.get("heading_default", 45.0))
	heading_target = heading_deg
	distance = float(cam_cfg.get("dist_default", 30.0))
	distance_target = distance
	min_dist = float(cam_cfg.get("min_dist", 15.0))
	max_dist = float(cam_cfg.get("max_dist", 50.0))
	min_pitch = float(cam_cfg.get("min_pitch", 30.0))
	max_pitch = float(cam_cfg.get("max_pitch", 60.0))
	zoom_step = float(cam_cfg.get("zoom_step", 4.0))
	target_offset = Vector3(0.0, float(cam_cfg.get("target_offset_y", 1.5)), 0.0)
	near = 0.2
	far = 260.0


func rotate_step(delta_deg: float) -> void:
	heading_target += delta_deg


func zoom_in() -> void:
	distance_target = clamp(distance_target - zoom_step, min_dist, max_dist)


func zoom_out() -> void:
	distance_target = clamp(distance_target + zoom_step, min_dist, max_dist)


func get_planar_basis() -> Dictionary:
	var h: float = deg_to_rad(heading_deg)
	var forward: Vector2 = Vector2(-cos(h), -sin(h)).normalized()
	var right: Vector2 = Vector2(-sin(h), cos(h)).normalized()
	return {"forward": forward, "right": right}


func update_camera(dt: float, target_xz: Vector2) -> void:
	var desired: Vector3 = Vector3(target_xz.x, 0.0, target_xz.y) + target_offset
	current_pos = current_pos.lerp(desired, clamp(dt * 8.0, 0.0, 1.0))
	heading_deg = lerp(heading_deg, heading_target, clamp(dt * 12.0, 0.0, 1.0))
	distance = lerp(distance, distance_target, clamp(dt * 8.0, 0.0, 1.0))

	var t_zoom: float = clamp((distance - min_dist) / max(0.001, max_dist - min_dist), 0.0, 1.0)
	var pitch_deg: float = lerp(min_pitch, max_pitch, t_zoom)
	var pitch: float = deg_to_rad(pitch_deg)
	var heading: float = deg_to_rad(heading_deg)

	# followcamera.lua:233-264 투영 벡터 공식
	var dx: float = -cos(pitch) * cos(heading)
	var dy: float = -sin(pitch)
	var dz: float = -cos(pitch) * sin(heading)
	var cam_pos: Vector3 = current_pos - Vector3(dx, dy, dz) * distance
	look_at_from_position(cam_pos, current_pos, Vector3.UP)
