class_name UECharacterMovement
extends CharacterBody3D
## Unreal Engine UCharacterMovementComponent compatibility layer for Godot 4.x CharacterBody3D.
## Preserves UE cm-based tuning parameters (converted to meters), slope limit, air control,
## acceleration/braking, third-person spring-arm controller yaw/pitch, and animation state transitions.

@export_group("UE CharacterMovement (cm units)")
@export var max_walk_speed_cm: float = 500.0
@export var jump_z_velocity_cm: float = 700.0
@export var gravity_cm_s2: float = 980.0
@export var gravity_scale: float = 1.75
@export var max_acceleration_cm: float = 2048.0
@export var braking_deceleration_walking_cm: float = 2000.0
@export var air_control: float = 0.35
@export var max_walk_angle_deg: float = 44.7
@export var max_step_height_cm: float = 45.0
@export var orient_rotation_to_movement: bool = true
@export var rotation_rate_yaw_deg: float = 500.0

@export_group("Controller Camera")
@export var camera_boom_path: NodePath = NodePath("CameraBoom")
@export var mesh_root_path: NodePath = NodePath("CharacterMesh")
@export var min_pitch_deg: float = -70.0
@export var max_pitch_deg: float = 45.0

var controller_yaw_deg: float = 0.0
var controller_pitch_deg: float = -18.0
var pending_move_input: Vector3 = Vector3.ZERO
var _jump_requested: bool = false
var _was_on_floor: bool = true
var anim_state: String = "Idle"
var anim_transitions: Array[Dictionary] = []
var max_jump_apex_m: float = 0.0
var _jump_start_y_m: float = 0.0
var _in_jump: bool = false

var _camera_boom: Node3D = null
var _mesh_root: Node3D = null


func _ready() -> void:
	floor_max_angle = deg_to_rad(max_walk_angle_deg)
	floor_snap_length = max_step_height_cm * 0.01 * 0.5
	if has_node(camera_boom_path):
		_camera_boom = get_node(camera_boom_path) as Node3D
	if has_node(mesh_root_path):
		_mesh_root = get_node(mesh_root_path) as Node3D
	_apply_camera_rotation()


func ue_add_movement_input(world_direction: Vector3, scale_value: float = 1.0) -> void:
	if is_zero_approx(scale_value) or world_direction.length_squared() < 1e-8:
		return
	pending_move_input += world_direction.normalized() * scale_value


func ue_add_controller_yaw_input(delta_deg: float) -> void:
	# UE +Yaw is clockwise from above; Godot +Y is CCW, so negate into Godot Y yaw
	controller_yaw_deg = wrapf(controller_yaw_deg - delta_deg, -180.0, 180.0)
	_apply_camera_rotation()


func ue_add_controller_pitch_input(delta_deg: float) -> void:
	controller_pitch_deg = clampf(controller_pitch_deg + delta_deg, min_pitch_deg, max_pitch_deg)
	_apply_camera_rotation()


func ue_get_control_forward_vector() -> Vector3:
	var yaw_rad := deg_to_rad(controller_yaw_deg)
	return Vector3(-sin(yaw_rad), 0.0, -cos(yaw_rad)).normalized()


func ue_get_control_right_vector() -> Vector3:
	var yaw_rad := deg_to_rad(controller_yaw_deg)
	return Vector3(cos(yaw_rad), 0.0, -sin(yaw_rad)).normalized()


func ue_jump() -> void:
	_jump_requested = true


func ue_stop_jumping() -> void:
	_jump_requested = false


func step_ue_movement(delta: float) -> void:
	var max_speed_m := max_walk_speed_cm * 0.01
	var accel_m := max_acceleration_cm * 0.01
	var brake_m := braking_deceleration_walking_cm * 0.01
	var gravity_m := (gravity_cm_s2 * 0.01) * gravity_scale
	var jump_vel_m := jump_z_velocity_cm * 0.01

	var on_floor_now := is_on_floor()

	var wish_dir := Vector3(pending_move_input.x, 0.0, pending_move_input.z)
	if wish_dir.length() > 1.0:
		wish_dir = wish_dir.normalized()
	pending_move_input = Vector3.ZERO

	var horiz_vel := Vector3(velocity.x, 0.0, velocity.z)
	if wish_dir.length_squared() > 1e-6:
		var target_vel := wish_dir * max_speed_m
		var eff_accel := accel_m if on_floor_now else accel_m * air_control
		horiz_vel = horiz_vel.move_toward(target_vel, eff_accel * delta)
	else:
		var eff_brake := brake_m if on_floor_now else brake_m * 0.1
		horiz_vel = horiz_vel.move_toward(Vector3.ZERO, eff_brake * delta)

	velocity.x = horiz_vel.x
	velocity.z = horiz_vel.z

	if on_floor_now:
		if _jump_requested:
			velocity.y = jump_vel_m
			_jump_requested = false
			_in_jump = true
			_jump_start_y_m = global_position.y
			max_jump_apex_m = 0.0
			_emit_compat_event("Jump", {"y_m": snappedf(global_position.y, 0.001)})
			_set_anim_state("JumpStart")
		elif velocity.y < 0.0:
			velocity.y = 0.0
	else:
		velocity.y -= gravity_m * delta
		_jump_requested = false

	move_and_slide()

	var on_floor_after := is_on_floor()
	if _in_jump:
		var rel_height := global_position.y - _jump_start_y_m
		if rel_height > max_jump_apex_m:
			max_jump_apex_m = rel_height
		if on_floor_after and velocity.y <= 0.0 and not on_floor_now:
			_in_jump = false
			_emit_compat_event("Land", {
				"y_m": snappedf(global_position.y, 0.001),
				"apex_m": snappedf(max_jump_apex_m, 0.001)
			})
			_set_anim_state("Land")

	if orient_rotation_to_movement and horiz_vel.length() > 0.15 and _mesh_root != null:
		var target_yaw := atan2(-horiz_vel.x, -horiz_vel.z)
		var max_step := deg_to_rad(rotation_rate_yaw_deg) * delta
		_mesh_root.rotation.y = _move_angle_toward(_mesh_root.rotation.y, target_yaw, max_step)

	_update_anim_state(on_floor_after, horiz_vel.length())
	_was_on_floor = on_floor_after


func _update_anim_state(on_floor_after: bool, horiz_speed: float) -> void:
	if not on_floor_after:
		if velocity.y > 0.5 and anim_state == "JumpStart":
			return
		_set_anim_state("FallLoop")
	else:
		if horiz_speed > 0.2:
			_set_anim_state("Run")
		else:
			_set_anim_state("Idle")


func _set_anim_state(next_state: String) -> void:
	if next_state == anim_state:
		return
	var prev := anim_state
	anim_state = next_state
	var t_ms := 0.0
	var compat := get_node_or_null("/root/UnrealCompat")
	if compat != null:
		t_ms = float(compat.get("elapsed_time_ms"))
	var rec := {
		"time_ms": snappedf(t_ms, 0.1),
		"from": prev,
		"to": next_state
	}
	anim_transitions.append(rec)
	_emit_compat_event("AnimTransition", rec)


func _emit_compat_event(event_name: String, payload: Dictionary) -> void:
	var compat := get_node_or_null("/root/UnrealCompat")
	if compat != null and compat.has_method("record_event"):
		compat.call("record_event", event_name, payload)


func _apply_camera_rotation() -> void:
	if _camera_boom != null:
		_camera_boom.rotation_degrees = Vector3(controller_pitch_deg, controller_yaw_deg, 0.0)


func _move_angle_toward(from_angle: float, to_angle: float, max_delta: float) -> float:
	var diff := wrapf(to_angle - from_angle, -PI, PI)
	if absf(diff) <= max_delta:
		return to_angle
	return from_angle + signf(diff) * max_delta
