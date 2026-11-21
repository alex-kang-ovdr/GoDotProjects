class_name PlayForgeAvatarController
extends CharacterBody3D

const AvatarCatalog = preload("res://addons/playforge_avatar/avatar_catalog.gd")
const AvatarBridge = preload("res://addons/playforge_avatar/avatar_bridge.gd")
const AvatarRig = preload("res://addons/playforge_avatar/avatar_rig.gd")
const AvatarRagdoll = preload("res://addons/playforge_avatar/avatar_ragdoll.gd")

## UEFN-style sealed PlayForge Avatar Controller.
## Creators may ONLY adjust safe gameplay settings (camera mode, locomotion multipliers,
## ragdoll/emote toggles) and invoke safe public methods. Skins, attachments, emotes,
## and internal skeleton/rig assets are strictly owned by PlayHub and immutable in Forge.

enum CameraMode {
	TPS = 0,
	FPS = 1,
	TOP_DOWN = 2,
}

signal loadout_applied(summary: Dictionary)
signal camera_mode_changed(mode: int)
signal locomotion_state_changed(state_name: String)
signal emote_started(emote_id: String, emoji: String)
signal emote_finished(emote_id: String)
signal ragdoll_entered(hit_bone: String)
signal ragdoll_recovered()

const BASE_WALK_SPEED := 4.8
const BASE_SPRINT_SPEED := 8.2
const BASE_CROUCH_SPEED := 2.4
const BASE_JUMP_VELOCITY := 6.4
const BASE_ACCELERATION := 24.0
const BASE_AIR_ACCELERATION := 10.0
const BASE_TURN_SPEED := 12.0
const COYOTE_TIME := 0.12
const JUMP_BUFFER_TIME := 0.12

@export var camera_mode: CameraMode = CameraMode.TPS:
	set(value):
		var clamped := clampi(int(value), CameraMode.TPS, CameraMode.TOP_DOWN) as CameraMode
		if camera_mode != clamped:
			camera_mode = clamped
			if is_inside_tree():
				_apply_camera_mode()
				camera_mode_changed.emit(int(camera_mode))

@export_range(0.5, 2.0, 0.05) var walk_speed_multiplier := 1.0:
	set(value):
		walk_speed_multiplier = clampf(value, 0.5, 2.0)

@export_range(0.5, 2.5, 0.05) var sprint_speed_multiplier := 1.0:
	set(value):
		sprint_speed_multiplier = clampf(value, 0.5, 2.5)

@export_range(0.5, 2.0, 0.05) var jump_height_multiplier := 1.0:
	set(value):
		jump_height_multiplier = clampf(value, 0.5, 2.0)

@export var allow_crouch := true
@export var allow_emotes := true
@export var allow_ragdoll := true
@export var allow_camera_toggle_hotkey := true
@export var capture_mouse_on_click := false
@export_range(0.05, 0.6, 0.01) var mouse_sensitivity := 0.22
@export_range(2.2, 8.0, 0.1) var tps_distance := 4.4
@export_range(0.0, 1.2, 0.05) var tps_shoulder_offset := 0.45
@export_range(6.0, 20.0, 0.5) var topdown_distance := 11.5
@export_range(-80.0, -35.0, 1.0) var topdown_pitch_degrees := -56.0
@export var topdown_face_cursor := false

var _catalog: AvatarCatalog
var _bridge: AvatarBridge
var _rig: AvatarRig
var _ragdoll: AvatarRagdoll
var _collision_shape: CollisionShape3D
var _camera_pivot: Node3D
var _spring_arm: SpringArm3D
var _camera: Camera3D

var _yaw := 0.0
var _pitch := -14.0
var _is_crouching := false
var _was_on_floor := true
var _coyote_timer := 0.0
var _jump_buffer_timer := 0.0
var _locomotion_state := "idle"
var _gravity: float = 18.0
var _virtual_move_input := Vector2.ZERO
var _virtual_sprint := false
var _virtual_crouch := false
var _virtual_jump := false
var _orbit_dragging := false


func _ready() -> void:
	set_meta("_playforge_avatar_sealed", true)
	_gravity = maxf(float(ProjectSettings.get_setting("physics/3d/default_gravity", 9.8)) * 1.65, 16.0)
	floor_snap_length = 0.25
	floor_max_angle = deg_to_rad(46.0)

	_ensure_collision()
	_ensure_camera_rig()

	_catalog = AvatarCatalog.new()
	_catalog.load_catalog()

	_rig = AvatarRig.new()
	_rig.name = "SealedAvatarRig"
	_rig.set_catalog(_catalog)
	_rig.emote_started.connect(func(eid: String, em: String): emote_started.emit(eid, em))
	_rig.emote_finished.connect(func(eid: String): emote_finished.emit(eid))
	add_child(_rig)

	_ragdoll = AvatarRagdoll.new()
	_ragdoll.name = "SealedAvatarRagdoll"
	_ragdoll.ragdoll_started.connect(func(bone: String): ragdoll_entered.emit(bone))
	_ragdoll.ragdoll_stopped.connect(func(_pos: Vector3): ragdoll_recovered.emit())
	add_child(_ragdoll)

	_bridge = AvatarBridge.new()
	_bridge.name = "SealedAvatarBridge"
	_bridge.initialize(_catalog)
	_bridge.loadout_resolved.connect(_on_loadout_resolved)
	add_child(_bridge)

	_apply_camera_mode()
	_bridge.request_player_loadout()


# --- Public Creator-Safe API (UEFN fort_character style) ---

func set_camera_mode(mode: CameraMode) -> void:
	camera_mode = mode


func cycle_camera_mode() -> CameraMode:
	camera_mode = ((int(camera_mode) + 1) % 3) as CameraMode
	return camera_mode


func get_camera_mode_name() -> String:
	match camera_mode:
		CameraMode.TPS:
			return "TPS"
		CameraMode.FPS:
			return "FPS"
		CameraMode.TOP_DOWN:
			return "TopDown"
	return "TPS"


func get_active_camera() -> Camera3D:
	return _camera


func trigger_ragdoll(impulse := Vector3(0.0, 2.5, -5.0), hit_bone := "chest") -> bool:
	if not allow_ragdoll or _ragdoll == null or _rig == null:
		return false
	if _ragdoll.is_ragdoll_active():
		return _ragdoll.enter_ragdoll(impulse, hit_bone)
	_rig.pause_animations_for_ragdoll()
	if _collision_shape != null:
		_collision_shape.disabled = true
	velocity = Vector3.ZERO
	_set_locomotion_state("ragdoll")
	return _ragdoll.enter_ragdoll(impulse, hit_bone)


func recover_from_ragdoll() -> bool:
	if _ragdoll == null or not _ragdoll.is_ragdoll_active():
		return false
	var hips_pos := _ragdoll.recover_from_ragdoll()
	global_position = Vector3(hips_pos.x, maxf(hips_pos.y - 0.85, global_position.y), hips_pos.z)
	if _collision_shape != null:
		_collision_shape.disabled = false
	velocity = Vector3.ZERO
	_set_locomotion_state("idle")
	if _rig != null:
		_rig.play_locomotion_state("stand_up", 0.08)
	return true


func is_ragdoll_active() -> bool:
	return _ragdoll != null and _ragdoll.is_ragdoll_active()


func play_emote_slot(slot_index: int) -> bool:
	if not allow_emotes or _rig == null or is_ragdoll_active():
		return false
	var loadout := _rig.get_active_loadout()
	var wheel: Variant = loadout.get("emoteWheel", [])
	if not wheel is Array or slot_index < 0 or slot_index >= wheel.size():
		return false
	var emote_id: Variant = wheel[slot_index]
	if not emote_id is String or emote_id.is_empty():
		return false
	return _rig.play_emote(emote_id)


func stop_emote() -> void:
	if _rig != null:
		_rig.stop_emote()


func teleport_to(world_position: Vector3, yaw_radians := NAN) -> void:
	if is_ragdoll_active():
		recover_from_ragdoll()
	global_position = world_position
	velocity = Vector3.ZERO
	if not is_nan(yaw_radians):
		_yaw = yaw_radians
		if _rig != null:
			_rig.rotation.y = yaw_radians


func set_virtual_input(move_vec: Vector2, sprint := false, crouch := false, jump := false) -> void:
	# Allows automated tests and mobile touch controls to drive standard locomotion.
	_virtual_move_input = move_vec.limit_length(1.0)
	_virtual_sprint = sprint
	_virtual_crouch = crouch
	if jump:
		_virtual_jump = true


func get_public_state() -> Dictionary:
	return {
		"cameraMode": get_camera_mode_name(),
		"locomotionState": _locomotion_state,
		"isOnFloor": is_on_floor(),
		"isCrouching": _is_crouching,
		"isRagdoll": is_ragdoll_active(),
		"activeEmote": _rig.get_active_emote_id() if _rig != null else "",
		"position": [global_position.x, global_position.y, global_position.z],
		"velocity": [velocity.x, velocity.y, velocity.z],
		"rig": _rig.get_rig_summary() if _rig != null else {},
		"ragdoll": _ragdoll.get_ragdoll_state() if _ragdoll != null else {},
		"sealed": true,
	}


# --- Input & Physics Locomotion ---

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_RIGHT:
			_orbit_dragging = mb.pressed
		elif mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed and capture_mouse_on_click and camera_mode != CameraMode.TOP_DOWN:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			if camera_mode == CameraMode.TPS:
				tps_distance = clampf(tps_distance - 0.35, 2.2, 8.0)
				_apply_camera_mode()
			elif camera_mode == CameraMode.TOP_DOWN:
				topdown_distance = clampf(topdown_distance - 0.75, 6.0, 20.0)
				_apply_camera_mode()
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			if camera_mode == CameraMode.TPS:
				tps_distance = clampf(tps_distance + 0.35, 2.2, 8.0)
				_apply_camera_mode()
			elif camera_mode == CameraMode.TOP_DOWN:
				topdown_distance = clampf(topdown_distance + 0.75, 6.0, 20.0)
				_apply_camera_mode()
	elif event is InputEventMouseMotion:
		var captured := Input.mouse_mode == Input.MOUSE_MODE_CAPTURED
		if (captured or _orbit_dragging) and camera_mode != CameraMode.TOP_DOWN:
			var mm := event as InputEventMouseMotion
			_yaw -= deg_to_rad(mm.relative.x * mouse_sensitivity)
			var min_pitch := -80.0 if camera_mode == CameraMode.FPS else -65.0
			var max_pitch := 80.0 if camera_mode == CameraMode.FPS else 55.0
			_pitch = clampf(_pitch - mm.relative.y * mouse_sensitivity, min_pitch, max_pitch)
	elif event is InputEventKey and event.pressed and not event.echo:
		var key := (event as InputEventKey).keycode
		if key == KEY_ESCAPE and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		elif key == KEY_V and allow_camera_toggle_hotkey:
			cycle_camera_mode()
		elif key == KEY_R and allow_ragdoll:
			if is_ragdoll_active():
				recover_from_ragdoll()
			else:
				var forward := -global_transform.basis.z
				if _rig != null:
					forward = -_rig.global_transform.basis.z
				trigger_ragdoll(forward * 4.5 + Vector3.UP * 2.5, "chest")
		elif allow_emotes and key >= KEY_1 and key <= KEY_4:
			play_emote_slot(key - KEY_1)


func _physics_process(delta: float) -> void:
	_update_camera_transform(delta)
	if is_ragdoll_active():
		return

	var input_vec := _read_move_input()
	var wants_sprint := _virtual_sprint or Input.is_key_pressed(KEY_SHIFT)
	var wants_crouch := allow_crouch and (_virtual_crouch or Input.is_key_pressed(KEY_C) or Input.is_key_pressed(KEY_CTRL))
	var wants_jump := _virtual_jump or Input.is_key_pressed(KEY_SPACE) or Input.is_action_just_pressed("ui_accept")
	_virtual_jump = false

	_is_crouching = wants_crouch and is_on_floor()

	if is_on_floor():
		_coyote_timer = COYOTE_TIME
	else:
		_coyote_timer = maxf(_coyote_timer - delta, 0.0)

	if wants_jump:
		_jump_buffer_timer = JUMP_BUFFER_TIME
	else:
		_jump_buffer_timer = maxf(_jump_buffer_timer - delta, 0.0)

	# Compute world-space wish direction based on active camera mode
	var wish_dir := Vector3.ZERO
	if input_vec.length_squared() > 0.001:
		if _rig != null and _rig.is_emote_playing():
			_rig.stop_emote()
		match camera_mode:
			CameraMode.TPS, CameraMode.FPS:
				var basis_yaw := Basis(Vector3.UP, _yaw)
				wish_dir = (basis_yaw * Vector3(input_vec.x, 0.0, input_vec.y)).normalized()
			CameraMode.TOP_DOWN:
				wish_dir = Vector3(input_vec.x, 0.0, input_vec.y).normalized()

	var target_speed := BASE_WALK_SPEED * walk_speed_multiplier
	if _is_crouching:
		target_speed = BASE_CROUCH_SPEED * walk_speed_multiplier
	elif wants_sprint and wish_dir.length_squared() > 0.001:
		target_speed = BASE_SPRINT_SPEED * sprint_speed_multiplier

	var accel := BASE_ACCELERATION if is_on_floor() else BASE_AIR_ACCELERATION
	var target_vel := wish_dir * target_speed
	velocity.x = move_toward(velocity.x, target_vel.x, accel * delta)
	velocity.z = move_toward(velocity.z, target_vel.z, accel * delta)

	if not is_on_floor():
		velocity.y -= _gravity * delta
	elif _jump_buffer_timer > 0.0 and _coyote_timer > 0.0:
		velocity.y = BASE_JUMP_VELOCITY * sqrt(jump_height_multiplier)
		_coyote_timer = 0.0
		_jump_buffer_timer = 0.0
		_is_crouching = false
		if _rig != null and _rig.is_emote_playing():
			_rig.stop_emote()

	move_and_slide()
	_update_avatar_facing(wish_dir, delta)
	_update_locomotion_animation(input_vec, wants_sprint)
	_was_on_floor = is_on_floor()


# --- Internal Sealed Setup ---

func _on_loadout_resolved(loadout: Dictionary) -> void:
	if _rig == null:
		return
	var summary := _rig.apply_sealed_loadout(loadout)
	if _ragdoll != null and _rig.get_skeleton() != null:
		_ragdoll.setup_for_skeleton(_rig.get_skeleton(), _rig.get_rig_profile())
	_apply_camera_mode()
	loadout_applied.emit(summary)


func _ensure_collision() -> void:
	_collision_shape = get_node_or_null("SealedCapsule") as CollisionShape3D
	if _collision_shape == null:
		_collision_shape = CollisionShape3D.new()
		_collision_shape.name = "SealedCapsule"
		var capsule := CapsuleShape3D.new()
		capsule.radius = 0.38
		capsule.height = 1.85
		_collision_shape.shape = capsule
		_collision_shape.position = Vector3(0.0, 0.925, 0.0)
		_collision_shape.set_meta("_playforge_avatar_sealed", true)
		add_child(_collision_shape)


func _ensure_camera_rig() -> void:
	_camera_pivot = Node3D.new()
	_camera_pivot.name = "SealedCameraPivot"
	_camera_pivot.set_meta("_playforge_avatar_sealed", true)
	add_child(_camera_pivot)

	_spring_arm = SpringArm3D.new()
	_spring_arm.name = "SealedSpringArm"
	_spring_arm.collision_mask = 1
	_spring_arm.spring_length = tps_distance
	_spring_arm.margin = 0.25
	_spring_arm.set_meta("_playforge_avatar_sealed", true)
	_camera_pivot.add_child(_spring_arm)

	_camera = Camera3D.new()
	_camera.name = "SealedCamera"
	_camera.current = true
	_camera.fov = 72.0
	_camera.near = 0.08
	_camera.far = 350.0
	_camera.set_meta("_playforge_avatar_sealed", true)
	_spring_arm.add_child(_camera)


func _apply_camera_mode() -> void:
	if _camera_pivot == null or _spring_arm == null or _camera == null:
		return
	var eye_y := _rig.get_eye_height() if _rig != null else 1.62
	match camera_mode:
		CameraMode.TPS:
			_camera_pivot.position = Vector3(tps_shoulder_offset, eye_y - 0.12, 0.0)
			_spring_arm.spring_length = tps_distance
			_camera.fov = 70.0
			if _rig != null:
				_rig.set_first_person_head_hidden(false)
		CameraMode.FPS:
			_camera_pivot.position = Vector3(0.0, eye_y, 0.0)
			_spring_arm.spring_length = 0.0
			_camera.position = Vector3(0.0, 0.0, -0.05)
			_camera.fov = 82.0
			if _rig != null:
				_rig.set_first_person_head_hidden(true)
		CameraMode.TOP_DOWN:
			_camera_pivot.position = Vector3(0.0, 1.0, 0.0)
			_spring_arm.spring_length = topdown_distance
			_camera.fov = 52.0
			if _rig != null:
				_rig.set_first_person_head_hidden(false)
	_update_camera_transform(0.0)


func _update_camera_transform(_delta: float) -> void:
	if _camera_pivot == null:
		return
	var target_y := _rig.get_eye_height() if _rig != null else 1.62
	if is_ragdoll_active() and _ragdoll != null:
		var hips := _ragdoll.get_hips_world_position()
		_camera_pivot.global_position = hips + Vector3(0.0, 0.35, 0.0)
	else:
		match camera_mode:
			CameraMode.TPS:
				_camera_pivot.position = Vector3(tps_shoulder_offset, target_y - (0.45 if _is_crouching else 0.12), 0.0)
			CameraMode.FPS:
				_camera_pivot.position = Vector3(0.0, target_y - (0.45 if _is_crouching else 0.0), 0.0)
			CameraMode.TOP_DOWN:
				_camera_pivot.position = Vector3(0.0, 1.0, 0.0)

	match camera_mode:
		CameraMode.TPS, CameraMode.FPS:
			_camera_pivot.rotation = Vector3(deg_to_rad(_pitch), _yaw, 0.0)
		CameraMode.TOP_DOWN:
			_camera_pivot.rotation = Vector3(deg_to_rad(topdown_pitch_degrees), 0.0, 0.0)


func _update_avatar_facing(wish_dir: Vector3, delta: float) -> void:
	if _rig == null:
		return
	match camera_mode:
		CameraMode.FPS:
			_rig.rotation.y = _yaw
		CameraMode.TPS:
			if wish_dir.length_squared() > 0.001:
				var desired := atan2(-wish_dir.x, -wish_dir.z)
				_rig.rotation.y = lerp_angle(_rig.rotation.y, desired, clampf(BASE_TURN_SPEED * delta, 0.0, 1.0))
		CameraMode.TOP_DOWN:
			if topdown_face_cursor and _camera != null and get_viewport() != null:
				var mouse_pos := get_viewport().get_mouse_position()
				var ray_origin := _camera.project_ray_origin(mouse_pos)
				var ray_dir := _camera.project_ray_normal(mouse_pos)
				if absf(ray_dir.y) > 0.001:
					var t := (global_position.y - ray_origin.y) / ray_dir.y
					if t > 0.0:
						var hit := ray_origin + ray_dir * t
						var to_mouse := hit - global_position
						to_mouse.y = 0.0
						if to_mouse.length_squared() > 0.02:
							var desired := atan2(-to_mouse.x, -to_mouse.z)
							_rig.rotation.y = lerp_angle(_rig.rotation.y, desired, clampf(BASE_TURN_SPEED * delta, 0.0, 1.0))
							return
			if wish_dir.length_squared() > 0.001:
				var desired := atan2(-wish_dir.x, -wish_dir.z)
				_rig.rotation.y = lerp_angle(_rig.rotation.y, desired, clampf(BASE_TURN_SPEED * delta, 0.0, 1.0))


func _update_locomotion_animation(input_vec: Vector2, wants_sprint: bool) -> void:
	if _rig == null or _rig.is_emote_playing():
		return
	var horiz_speed := Vector2(velocity.x, velocity.z).length()
	var next_state := "idle"
	if not is_on_floor():
		next_state = "jump_start" if velocity.y > 1.5 else "jump_air"
	elif not _was_on_floor:
		next_state = "jump_land"
	elif _is_crouching:
		next_state = "crouch"
	elif horiz_speed > 0.35:
		if camera_mode == CameraMode.FPS and absf(input_vec.x) > absf(input_vec.y) * 1.2:
			next_state = "strafe_right" if input_vec.x > 0.0 else "strafe_left"
		elif camera_mode == CameraMode.FPS and input_vec.y > 0.35:
			next_state = "walk_back"
		elif wants_sprint and horiz_speed > BASE_WALK_SPEED * walk_speed_multiplier * 1.15:
			next_state = "run"
		else:
			next_state = "walk"
	_set_locomotion_state(next_state)
	_rig.play_locomotion_state(next_state)


func _set_locomotion_state(next_state: String) -> void:
	if _locomotion_state != next_state:
		_locomotion_state = next_state
		locomotion_state_changed.emit(next_state)


func _read_move_input() -> Vector2:
	if _virtual_move_input.length_squared() > 0.0001:
		return _virtual_move_input
	var x := 0.0
	var y := 0.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		x -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		x += 1.0
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		y -= 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		y += 1.0
	var v := Vector2(x, y)
	return v.normalized() if v.length_squared() > 1.0 else v
