extends Node3D
class_name PlayForgeAvatarStudio

## PlayHub Desktop Avatar Studio & Offscreen Godot Preview Runtime (Godot 4.7.2)
## Uses the exact same sealed PlayForgeAvatarRig + AvatarCatalog + avatar-render-profile.v1
## as in-game runtime so Desktop App avatar preview matches in-game 1:1.
##
## Modes:
##   1. Interactive Desktop Studio Window:
##        --playhub-mode=avatar-studio (or direct scene run)
##        Mouse drag orbit, scroll zoom, camera preset buttons, emote triggers,
##        and live PlayHubDesktopBridge IPC sync.
##   2. Warm Loopback Desktop Preview Worker:
##        --avatar-studio-worker-port=<port> --avatar-studio-worker-token=<hex>
##        Offscreen no-focus GPU viewport serving POST /render -> PNG frames over 127.0.0.1.

const AvatarCatalog = preload("res://addons/playforge_avatar/avatar_catalog.gd")
const AvatarRig = preload("res://addons/playforge_avatar/avatar_rig.gd")

const RENDER_PROFILE_ID := "playhub_studio_v1"

var _catalog: AvatarCatalog
var _rig: AvatarRig
var _camera: Camera3D
var _world_env: WorldEnvironment
var _pedestal: MeshInstance3D

var _yaw := 0.42
var _pitch := 0.14
var _distance := 4.45
var _target_y := 1.15
var _fov_deg := 42.0
var _camera_preset := "TPS"
var _auto_spin := true
var _dragging := false
var _last_mouse := Vector2.ZERO

var _current_loadout: Dictionary = {}
var _loaded_signature := ""
var _active_emote_id := ""

# Loopback HTTP worker mode (used by Desktop App inline preview)
var _worker_port := 0
var _worker_token := ""
var _tcp_server: TCPServer
var _worker_busy := false
var _worker_queue: Array[Dictionary] = []
var _capture_dir := ""
var _interactive_hud: CanvasLayer
var _status_label: Label


func _ready() -> void:
	_parse_args()
	# Override host project.godot stretch/aspect (e.g. portrait 480x720) so the studio renders
	# exact 1:1 pixel dimensions with zero letterboxing in both worker and standalone window modes.
	var root_win := get_tree().root
	if root_win != null:
		root_win.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
		root_win.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_IGNORE
	if _worker_port > 0:
		DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_BORDERLESS, true)
		DisplayServer.window_set_flag(DisplayServer.WINDOW_FLAG_NO_FOCUS, true)
		DisplayServer.window_set_position(Vector2i(-32000, -32000))
		DisplayServer.window_set_size(Vector2i(480, 528))
		_auto_spin = false
	else:
		DisplayServer.window_set_title("PlayHub Desktop — Godot Avatar Studio")
		DisplayServer.window_set_size(Vector2i(820, 720))

	_catalog = AvatarCatalog.new()
	_catalog.load_catalog()

	_setup_studio_environment()
	_setup_studio_lights()
	_setup_pedestal()
	_setup_camera()
	_setup_avatar_rig()

	if _worker_port <= 0:
		_setup_interactive_hud()
		_connect_desktop_ipc()

	_apply_camera_preset(_camera_preset)
	_apply_loadout(_resolve_initial_loadout())

	if _worker_port > 0:
		_start_worker_server()
	elif not _capture_dir.is_empty():
		call_deferred("_run_studio_capture")


func _parse_args() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--avatar-studio-worker-port="):
			_worker_port = int(arg.substr("--avatar-studio-worker-port=".length()))
		elif arg.begins_with("--avatar-studio-worker-token="):
			_worker_token = arg.substr("--avatar-studio-worker-token=".length()).strip_edges()
		elif arg.begins_with("--avatar-camera=") or arg.begins_with("--playhub-avatar-camera="):
			var idx := arg.find("=")
			_camera_preset = arg.substr(idx + 1).strip_edges()
		elif arg.begins_with("--playhub-capture-dir="):
			_capture_dir = arg.substr("--playhub-capture-dir=".length()).strip_edges()


func _setup_studio_environment() -> void:
	_world_env = WorldEnvironment.new()
	_world_env.name = "StudioEnvironment"
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.063, 0.137, 0.118, 1.0) # #10231e (avatar-render-profile.v1)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.75, 0.84, 0.88, 1.0)
	env.ambient_light_energy = 0.55
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.05
	_world_env.environment = env
	add_child(_world_env)


func _setup_studio_lights() -> void:
	# Canonical 3-point studio lighting matching avatar-render-profile.v1
	_add_dir_light("StudioKeyLight", Vector3(-0.55, -0.82, -0.62), Color(1.0, 0.973, 0.925), 1.25)
	_add_dir_light("StudioFillLight", Vector3(0.65, -0.25, -0.55), Color(0.749, 0.890, 1.0), 0.55)
	_add_dir_light("StudioRimLight", Vector3(0.45, -0.35, 0.82), Color(0.871, 0.925, 0.651), 0.85)


func _add_dir_light(light_name: String, dir_vec: Vector3, col: Color, energy: float) -> void:
	var light := DirectionalLight3D.new()
	light.name = light_name
	light.light_color = col
	light.light_energy = energy
	light.shadow_enabled = false
	add_child(light)
	var d := dir_vec.normalized()
	light.look_at_from_position(-d * 4.0, Vector3.ZERO, Vector3.UP)


func _setup_pedestal() -> void:
	_pedestal = MeshInstance3D.new()
	_pedestal.name = "StudioPedestal"
	var cyl := CylinderMesh.new()
	cyl.top_radius = 1.12
	cyl.bottom_radius = 1.22
	cyl.height = 0.10
	cyl.radial_segments = 40
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.11, 0.25, 0.21, 1.0)
	mat.emission_enabled = true
	mat.emission = Color(0.04, 0.11, 0.09)
	mat.roughness = 0.62
	mat.metallic = 0.15
	cyl.material = mat
	_pedestal.mesh = cyl
	_pedestal.position = Vector3(0.0, -0.05, 0.0)
	add_child(_pedestal)


func _setup_camera() -> void:
	_camera = Camera3D.new()
	_camera.name = "StudioCamera"
	_camera.current = true
	_camera.near = 0.05
	_camera.far = 60.0
	add_child(_camera)


func _setup_avatar_rig() -> void:
	_rig = AvatarRig.new()
	_rig.name = "StudioAvatarRig"
	# PlayForgeAvatarRig aligns all skins to face -Z (Godot gameplay forward).
	# Rotate the rig 180 deg around Y so every skin faces +Z toward the studio camera,
	# matching avatar-glb-viewer.js (Web JS 3D) orientation 1:1.
	_rig.rotation_degrees = Vector3(0.0, 180.0, 0.0)
	add_child(_rig)
	_rig.set_catalog(_catalog)


func _resolve_initial_loadout() -> Dictionary:
	var raw_json := OS.get_environment("PLAYHUB_AVATAR_LOADOUT_JSON").strip_edges()
	var skin_override := ""
	var att_overrides: Dictionary = {}
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--avatar-loadout-json=") or arg.begins_with("--playhub-avatar-loadout="):
			raw_json = arg.substr(arg.find("=") + 1).strip_edges()
		elif arg.begins_with("--avatar-skin="):
			skin_override = arg.substr("--avatar-skin=".length()).strip_edges()
		elif arg.begins_with("--avatar-head="):
			att_overrides["head"] = arg.substr("--avatar-head=".length()).strip_edges()
		elif arg.begins_with("--avatar-back="):
			att_overrides["back"] = arg.substr("--avatar-back=".length()).strip_edges()
		elif arg.begins_with("--avatar-hand-r="):
			att_overrides["hand_r"] = arg.substr("--avatar-hand-r=".length()).strip_edges()
		elif arg.begins_with("--avatar-hand-l="):
			att_overrides["hand_l"] = arg.substr("--avatar-hand-l=".length()).strip_edges()
	var loadout := _catalog.get_default_loadout()
	if not raw_json.is_empty():
		var parsed: Variant = JSON.parse_string(raw_json)
		if parsed is Dictionary:
			loadout = _catalog.normalize_loadout(parsed as Dictionary)
	if not skin_override.is_empty():
		loadout["skinId"] = skin_override
	if not att_overrides.is_empty():
		var merged_att: Dictionary = (loadout.get("attachments", {}) as Dictionary).duplicate(true)
		for k in att_overrides.keys():
			merged_att[k] = att_overrides[k]
		loadout["attachments"] = merged_att
	return _catalog.normalize_loadout(loadout)


func _loadout_signature(loadout: Dictionary) -> String:
	var att: Dictionary = loadout.get("attachments", {}) if loadout.get("attachments") is Dictionary else {}
	return "%s|%s|%s|%s|%s" % [
		str(loadout.get("skinId", "")),
		str(att.get("head", "")),
		str(att.get("back", "")),
		str(att.get("hand_r", "")),
		str(att.get("hand_l", "")),
	]


func _apply_loadout(loadout: Dictionary) -> Dictionary:
	var normalized := _catalog.normalize_loadout(loadout)
	var sig := _loadout_signature(normalized)
	_current_loadout = normalized
	if sig == _loaded_signature and _rig != null and _rig.get_skeleton() != null:
		return _rig.get_rig_summary()
	var summary := _rig.apply_sealed_loadout(normalized)
	if bool(summary.get("ok", false)):
		_loaded_signature = sig
		_rig.play_locomotion_state("idle", 0.0)
	_update_hud_status()
	return summary


func _apply_camera_preset(preset: String) -> void:
	_camera_preset = preset if not preset.is_empty() else "TPS"
	match _camera_preset:
		"FPS", "face":
			_yaw = 0.08
			_pitch = 0.04
			_distance = 1.65
			_target_y = 1.60
			_fov_deg = 42.0
			_auto_spin = false
		"TopDown":
			_yaw = 0.35
			_pitch = 0.88
			_distance = 5.6
			_target_y = 1.00
			_fov_deg = 42.0
			_auto_spin = true
		"PortraitUpper", "bust":
			_yaw = 0.22
			_pitch = 0.06
			_distance = 2.05
			_target_y = 1.48
			_fov_deg = 36.0
			_auto_spin = false
		"PortraitFull", "full_body":
			_yaw = 0.26
			_pitch = 0.10
			_distance = 4.25
			_target_y = 1.05
			_fov_deg = 38.0
			_auto_spin = false
		_:
			_yaw = 0.42
			_pitch = 0.14
			_distance = 4.45
			_target_y = 1.15
			_fov_deg = 42.0
			_auto_spin = _worker_port <= 0
	_update_camera_transform()


func _update_camera_transform() -> void:
	if _camera == null:
		return
	_camera.fov = _fov_deg
	var clamped_pitch := clampf(_pitch, -0.45, 1.25)
	var eye := Vector3(
		sin(_yaw) * cos(clamped_pitch) * _distance,
		_target_y + sin(clamped_pitch) * _distance,
		cos(_yaw) * cos(clamped_pitch) * _distance
	)
	_camera.look_at_from_position(eye, Vector3(0.0, _target_y, 0.0), Vector3.UP)


func _setup_interactive_hud() -> void:
	_interactive_hud = CanvasLayer.new()
	_interactive_hud.name = "StudioHUD"
	_interactive_hud.layer = 50
	add_child(_interactive_hud)

	var top_bar := PanelContainer.new()
	top_bar.position = Vector2(14.0, 14.0)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.067, 0.149, 0.125, 0.90)
	style.border_color = Color(0.871, 0.925, 0.651, 0.65)
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.content_margin_left = 10.0
	style.content_margin_right = 10.0
	style.content_margin_top = 6.0
	style.content_margin_bottom = 6.0
	top_bar.add_theme_stylebox_override("panel", style)
	_interactive_hud.add_child(top_bar)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	top_bar.add_child(col)

	_status_label = Label.new()
	_status_label.text = "PLAY HUB DESKTOP · GODOT RUNTIME AVATAR STUDIO"
	_status_label.add_theme_font_size_override("font_size", 12)
	_status_label.add_theme_color_override("font_color", Color(0.871, 0.925, 0.651))
	col.add_child(_status_label)

	var cam_row := HBoxContainer.new()
	cam_row.add_theme_constant_override("separation", 6)
	col.add_child(cam_row)
	for preset in ["TPS", "FPS", "TopDown", "PortraitUpper", "PortraitFull"]:
		var btn := Button.new()
		btn.text = preset
		btn.focus_mode = Control.FOCUS_NONE
		btn.add_theme_font_size_override("font_size", 11)
		btn.pressed.connect(func() -> void:
			_apply_camera_preset(preset)
		)
		cam_row.add_child(btn)

	var emote_row := HBoxContainer.new()
	emote_row.add_theme_constant_override("separation", 6)
	col.add_child(emote_row)
	for emote_pair in [["Cheer", "emote_cheer"], ["Wave", "emote_wave"], ["Dance", "emote_dance"], ["Punch", "emote_punch"]]:
		var ebtn := Button.new()
		ebtn.text = emote_pair[0]
		ebtn.focus_mode = Control.FOCUS_NONE
		ebtn.add_theme_font_size_override("font_size", 11)
		var em_id: String = emote_pair[1]
		ebtn.pressed.connect(func() -> void:
			_rig.play_emote(em_id)
		)
		emote_row.add_child(ebtn)


func _update_hud_status() -> void:
	if _status_label == null:
		return
	var skin_id := str(_current_loadout.get("skinId", "skin_knight"))
	_status_label.text = "PLAY HUB DESKTOP · GODOT 4.7.2 STUDIO · %s · %s" % [skin_id, _camera_preset]


func _connect_desktop_ipc() -> void:
	var bridge := get_tree().root.get_node_or_null("PlayHubDesktopBridge")
	if bridge == null:
		return
	if bridge.has_signal("bridge_event"):
		bridge.connect("bridge_event", _on_desktop_ipc_event)


func _on_desktop_ipc_event(event_name: String, payload: Dictionary) -> void:
	match event_name:
		"avatar_set_loadout":
			_apply_loadout(payload)
		"avatar_set_camera":
			if payload.has("preset"):
				_apply_camera_preset(str(payload.get("preset", "TPS")))
			if payload.has("yaw"):
				_yaw = float(payload.get("yaw", _yaw))
				_auto_spin = false
			if payload.has("pitch"):
				_pitch = float(payload.get("pitch", _pitch))
			if payload.has("distance"):
				_distance = clampf(float(payload.get("distance", _distance)), 1.2, 8.0)
			_update_camera_transform()
		"avatar_play_emote":
			var eid := str(payload.get("emoteId", ""))
			if not eid.is_empty() and _rig != null:
				_rig.play_emote(eid)


func _unhandled_input(event: InputEvent) -> void:
	if _worker_port > 0:
		return
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			_dragging = mb.pressed
			if _dragging:
				_auto_spin = false
				_last_mouse = mb.position
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			_distance = maxf(1.25, _distance - 0.35)
			_update_camera_transform()
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			_distance = minf(8.0, _distance + 0.35)
			_update_camera_transform()
	elif event is InputEventMouseMotion and _dragging:
		var mm := event as InputEventMouseMotion
		var delta_pos := mm.position - _last_mouse
		_last_mouse = mm.position
		_yaw -= delta_pos.x * 0.012
		_pitch = clampf(_pitch + delta_pos.y * 0.008, -0.40, 1.20)
		_update_camera_transform()


func _process(delta: float) -> void:
	if _worker_port > 0:
		_poll_worker_server()
		return
	if _auto_spin and not _dragging:
		_yaw += delta * 0.42
		_update_camera_transform()


func _run_studio_capture() -> void:
	for _i in range(8):
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	if img != null:
		var out_path := _capture_dir.path_join("desktop-godot-avatar-studio.png")
		var err := img.save_png(out_path)
		print("AVATAR_STUDIO_CAPTURE=" + JSON.stringify({"path": out_path, "err": err, "w": img.get_width(), "h": img.get_height(), "skinId": str(_current_loadout.get("skinId", "")), "camera": _camera_preset}))


# ==============================================================================
# Warm Loopback Desktop Preview Worker (127.0.0.1 HTTP/1.1 + 256-bit token)
# ==============================================================================

func _start_worker_server() -> void:
	_tcp_server = TCPServer.new()
	var err := _tcp_server.listen(_worker_port, "127.0.0.1")
	if err != OK:
		push_error("PlayForgeAvatarStudio: failed to listen on 127.0.0.1:%d err=%d" % [_worker_port, err])
		get_tree().quit(31)
		return
	var ver := Engine.get_version_info()
	print("AVATAR_STUDIO_WORKER_READY=" + JSON.stringify({
		"port": _worker_port,
		"renderer": "godot-runtime",
		"renderMethod": RenderingServer.get_current_rendering_method(),
		"gpu": RenderingServer.get_video_adapter_name(),
		"engineVersion": "%d.%d.%d" % [ver.major, ver.minor, ver.patch],
		"renderProfileId": RENDER_PROFILE_ID,
	}))


func _poll_worker_server() -> void:
	if _tcp_server == null or not _tcp_server.is_listening():
		return
	while _tcp_server.is_connection_available():
		var peer := _tcp_server.take_connection()
		if peer == null:
			break
		_worker_queue.append({"peer": peer, "buf": PackedByteArray(), "startedMs": Time.get_ticks_msec()})

	if _worker_busy or _worker_queue.is_empty():
		return

	var job: Dictionary = _worker_queue[0]
	var peer: StreamPeerTCP = job["peer"]
	peer.poll()
	var st := peer.get_status()
	if st == StreamPeerTCP.STATUS_ERROR or st == StreamPeerTCP.STATUS_NONE:
		_worker_queue.pop_front()
		return
	if st == StreamPeerTCP.STATUS_CONNECTED:
		var avail := peer.get_available_bytes()
		if avail > 0:
			var res := peer.get_data(avail)
			if res[0] == OK:
				var buf: PackedByteArray = job["buf"]
				buf.append_array(res[1])
				job["buf"] = buf
		var req := _try_parse_http_request(job["buf"])
		if not req.is_empty():
			_worker_queue.pop_front()
			_worker_busy = true
			_handle_worker_request(peer, req)
			return
	if Time.get_ticks_msec() - int(job["startedMs"]) > 5000:
		peer.disconnect_from_host()
		_worker_queue.pop_front()


func _try_parse_http_request(buf: PackedByteArray) -> Dictionary:
	if buf.size() < 16:
		return {}
	var text := buf.get_string_from_utf8()
	var sep := text.find("\r\n\r\n")
	if sep < 0:
		return {}
	var header_block := text.substr(0, sep)
	var lines := header_block.split("\r\n")
	if lines.is_empty():
		return {}
	var parts := lines[0].split(" ")
	if parts.size() < 2:
		return {}
	var method := parts[0].strip_edges().to_upper()
	var req_path := parts[1].strip_edges()
	var headers: Dictionary = {}
	for i in range(1, lines.size()):
		var colon := lines[i].find(":")
		if colon > 0:
			headers[lines[i].substr(0, colon).strip_edges().to_lower()] = lines[i].substr(colon + 1).strip_edges()
	var content_len := int(headers.get("content-length", "0"))
	var header_bytes_len := (header_block + "\r\n\r\n").to_utf8_buffer().size()
	if buf.size() < header_bytes_len + content_len:
		return {}
	var body_bytes := buf.slice(header_bytes_len, header_bytes_len + content_len)
	return {
		"method": method,
		"path": req_path,
		"headers": headers,
		"body": body_bytes.get_string_from_utf8(),
	}


func _send_http_response(peer: StreamPeerTCP, status_code: int, content_type: String, body: PackedByteArray, extra_headers: Dictionary = {}) -> void:
	var reason := "OK" if status_code == 200 else ("Forbidden" if status_code == 403 else ("Bad Request" if status_code == 400 else "Not Found"))
	var hdr := "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %d\r\nConnection: close\r\n" % [status_code, reason, content_type, body.size()]
	for k in extra_headers.keys():
		hdr += "%s: %s\r\n" % [str(k), str(extra_headers[k])]
	hdr += "\r\n"
	peer.put_data(hdr.to_utf8_buffer())
	if body.size() > 0:
		peer.put_data(body)
	peer.disconnect_from_host()


func _handle_worker_request(peer: StreamPeerTCP, req: Dictionary) -> void:
	var headers: Dictionary = req["headers"]
	var provided_token := str(headers.get("x-playhub-worker-token", ""))
	if _worker_token.is_empty() or provided_token != _worker_token:
		_send_http_response(peer, 403, "application/json", "{\"error\":\"FORBIDDEN\"}".to_utf8_buffer())
		_worker_busy = false
		return

	var req_path: String = req["path"]
	var method: String = req["method"]

	if req_path == "/health" and method == "GET":
		var ver := Engine.get_version_info()
		var payload := JSON.stringify({
			"ok": true,
			"renderer": "godot-runtime",
			"engineVersion": "%d.%d.%d" % [ver.major, ver.minor, ver.patch],
			"gpu": RenderingServer.get_video_adapter_name(),
			"renderProfileId": RENDER_PROFILE_ID,
		})
		_send_http_response(peer, 200, "application/json", payload.to_utf8_buffer())
		_worker_busy = false
		return

	if req_path == "/shutdown" and method == "POST":
		_send_http_response(peer, 200, "application/json", "{\"ok\":true}".to_utf8_buffer())
		_worker_busy = false
		get_tree().quit(0)
		return

	if req_path == "/render" and method == "POST":
		var parsed: Variant = JSON.parse_string(str(req["body"]))
		if not (parsed is Dictionary):
			_send_http_response(peer, 400, "application/json", "{\"error\":\"INVALID_JSON\"}".to_utf8_buffer())
			_worker_busy = false
			return
		call_deferred("_render_worker_frame", peer, parsed as Dictionary)
		return

	_send_http_response(peer, 404, "application/json", "{\"error\":\"NOT_FOUND\"}".to_utf8_buffer())
	_worker_busy = false


func _render_worker_frame(peer: StreamPeerTCP, params: Dictionary) -> void:
	var t0 := Time.get_ticks_msec()
	var width := clampi(int(params.get("width", 480)), 200, 960)
	var height := clampi(int(params.get("height", 540)), 200, 960)
	var cur_size := DisplayServer.window_get_size()
	if cur_size.x != width or cur_size.y != height:
		DisplayServer.window_set_size(Vector2i(width, height))

	var loadout_in: Dictionary = params.get("loadout", {}) if params.get("loadout") is Dictionary else {}
	if loadout_in.is_empty():
		loadout_in = {
			"skinId": str(params.get("skinId", _current_loadout.get("skinId", "skin_knight"))),
			"attachments": params.get("attachments", {}) if params.get("attachments") is Dictionary else {},
		}
	var rig_summary := _apply_loadout(loadout_in)

	var preset := str(params.get("camera", _camera_preset))
	_apply_camera_preset(preset)
	if params.has("yaw") and params["yaw"] != null:
		_yaw = float(params["yaw"])
	if params.has("pitch") and params["pitch"] != null:
		_pitch = float(params["pitch"])
	if params.has("distance") and params["distance"] != null:
		_distance = clampf(float(params["distance"]), 1.2, 8.0)
	_update_camera_transform()

	var emote_id := str(params.get("emoteId", ""))
	var anim_time := maxf(0.0, float(params.get("animTimeSec", 0.0)))
	if not emote_id.is_empty():
		if emote_id != _active_emote_id:
			_rig.play_emote(emote_id)
			_active_emote_id = emote_id
	else:
		if not _active_emote_id.is_empty():
			_rig.stop_emote()
			_active_emote_id = ""
		_rig.play_locomotion_state("idle", 0.0)

	var ap := _rig.get_animation_player()
	if ap != null and not ap.current_animation.is_empty():
		var anim := ap.get_animation(ap.current_animation)
		if anim != null and anim.length > 0.01:
			ap.seek(fmod(anim_time, anim.length), true)

	await get_tree().process_frame
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var png_bytes := img.save_png_to_buffer() if img != null else PackedByteArray()
	var elapsed := Time.get_ticks_msec() - t0
	var ver := Engine.get_version_info()
	var extra := {
		"X-PlayHub-Avatar-Renderer": "godot-runtime",
		"X-PlayHub-Engine-Version": "%d.%d.%d" % [ver.major, ver.minor, ver.patch],
		"X-PlayHub-Render-Profile": RENDER_PROFILE_ID,
		"X-PlayHub-Render-Ms": str(elapsed),
		"X-PlayHub-Skin-Id": str(rig_summary.get("skinId", "")),
		"X-PlayHub-Bone-Count": str(rig_summary.get("boneCount", 0)),
		"X-PlayHub-Animation-Count": str(rig_summary.get("animationCount", 0)),
	}
	_send_http_response(peer, 200, "image/png", png_bytes, extra)
	_worker_busy = false
