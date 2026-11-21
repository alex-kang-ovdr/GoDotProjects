extends Node
## PlayHub Desktop IPC Client (Godot 4.7.2 <-> Rust Bootstrapper)
## Protocol: contracts/desktop/bridge.v1.schema.json (loopback WebSocket + 1-time 256-bit token)

signal auth_completed(ok: bool, error_msg: String)
signal bridge_response(req_id: String, ok: bool, payload: Dictionary)
signal bridge_event(event_type: String, payload: Dictionary)

const HEARTBEAT_INTERVAL_SEC := 0.5

var ipc_port: int = 0
var ipc_token: String = ""
var launch_pck_path: String = ""
var test_mode: String = "normal"

var _ws := WebSocketPeer.new()
var _connected: bool = false
var _auth_sent: bool = false
var _authenticated: bool = false
var _req_seq: int = 0
var _heartbeat_accum: float = 0.0
var _hang_active: bool = false
var _first_frame_sent: bool = false
var _first_frame_acked: bool = false
var _first_frame_req_id: String = ""
var _shader_telemetry_req_id: String = ""
var _pending_requests: Array[Dictionary] = []

# Shader compile & frame-hitch telemetry (HUB_DESKTOP_PLAN §6.2)
var pck_mount_ms: int = 0
var scene_change_ms: int = 0
var _probe_active: bool = false
var _probe_elapsed_sec: float = 0.0
var _probe_frame_deltas_ms: Array[float] = []
const HITCH_PROBE_DURATION_SEC := 1.5
const HITCH_PROBE_MAX_FRAMES := 90

func _ready() -> void:
	_parse_cmdline_args()
	if ipc_port > 0 and not ipc_token.is_empty():
		var url := "ws://127.0.0.1:%d/" % ipc_port
		var err := _ws.connect_to_url(url)
		if err != OK:
			push_error("PlayHubDesktopBridge: connect_to_url failed err=%d url=%s" % [err, url])

func _parse_cmdline_args() -> void:
	var args := OS.get_cmdline_user_args()
	for arg in args:
		if arg.begins_with("--playhub-ipc="):
			ipc_port = int(arg.substr("--playhub-ipc=".length()))
		elif arg.begins_with("--playhub-token="):
			ipc_token = arg.substr("--playhub-token=".length()).strip_edges()
		elif arg.begins_with("--playhub-game="):
			launch_pck_path = arg.substr("--playhub-game=".length()).strip_edges()
		elif arg.begins_with("--playhub-test-mode="):
			test_mode = arg.substr("--playhub-test-mode=".length()).strip_edges()

func is_desktop_host() -> bool:
	return ipc_port > 0 and not ipc_token.is_empty()

func is_authenticated() -> bool:
	return _authenticated

func get_launch_pck_path() -> String:
	return launch_pck_path

func send_request(method: String, args: Dictionary = {}) -> String:
	_req_seq += 1
	var req_id := "r_%d_%d" % [OS.get_process_id(), _req_seq]
	var frame := {
		"v": 1,
		"type": "request",
		"reqId": req_id,
		"method": method,
		"args": args,
	}
	if _authenticated and _ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		_ws.send_text(JSON.stringify(frame))
	else:
		_pending_requests.append(frame)
	return req_id

func notify_first_frame(game_scene: String, mounted_pck: String, mount_ms: int = 0, scene_ms: int = 0) -> void:
	if _first_frame_sent:
		return
	_first_frame_sent = true
	pck_mount_ms = mount_ms
	scene_change_ms = scene_ms
	_first_frame_req_id = send_request("first_frame", {
		"scene": game_scene,
		"pck": mounted_pck,
		"pckMountMs": pck_mount_ms,
		"sceneChangeMs": scene_change_ms,
		"headless": DisplayServer.get_name() == "headless",
		"renderer": RenderingServer.get_current_rendering_method(),
		"gpuVendor": RenderingServer.get_video_adapter_vendor(),
		"gpuName": RenderingServer.get_video_adapter_name(),
		"driverInfo": OS.get_video_adapter_driver_info(),
	})

func _collect_shader_telemetry() -> Dictionary:
	var samples: Array[float] = _probe_frame_deltas_ms.duplicate()
	samples.sort()
	var n: int = samples.size()
	var p50: float = samples[int(n * 0.50)] if n > 0 else 0.0
	var p95: float = samples[mini(n - 1, int(n * 0.95))] if n > 0 else 0.0
	var p99: float = samples[mini(n - 1, int(n * 0.99))] if n > 0 else 0.0
	var max_ms: float = samples[n - 1] if n > 0 else 0.0
	var hitch_50: int = 0
	var hitch_100: int = 0
	for ms: float in samples:
		if ms >= 50.0:
			hitch_50 += 1
		if ms >= 100.0:
			hitch_100 += 1
	return {
		"pckMountMs": pck_mount_ms,
		"sceneChangeMs": scene_change_ms,
		"sampledFrames": n,
		"frameP50Ms": snappedf(p50, 0.01),
		"frameP95Ms": snappedf(p95, 0.01),
		"frameP99Ms": snappedf(p99, 0.01),
		"maxFrameMs": snappedf(max_ms, 0.01),
		"hitchCountOver50ms": hitch_50,
		"hitchCountOver100ms": hitch_100,
		"shaderCacheEnabled": bool(ProjectSettings.get_setting("rendering/shader_compiler/shader_cache/enabled", false)),
		"gpuVendor": RenderingServer.get_video_adapter_vendor(),
		"gpuName": RenderingServer.get_video_adapter_name(),
		"driverInfo": OS.get_video_adapter_driver_info(),
		"renderer": RenderingServer.get_current_rendering_method(),
		"pipelineCompilations": {
			"canvas": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_PIPELINE_COMPILATIONS_CANVAS),
			"mesh": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_PIPELINE_COMPILATIONS_MESH),
			"surface": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_PIPELINE_COMPILATIONS_SURFACE),
			"draw": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_PIPELINE_COMPILATIONS_DRAW),
			"specialization": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_PIPELINE_COMPILATIONS_SPECIALIZATION),
		},
	}

func request_leave() -> void:
	if is_desktop_host():
		send_request("overlay_leave", {"reason": "user_leave"})
	get_tree().quit(0)

func _process(delta: float) -> void:
	if not is_desktop_host():
		return

	_ws.poll()
	var state := _ws.get_ready_state()

	if state == WebSocketPeer.STATE_OPEN:
		if not _connected:
			_connected = true
		if not _auth_sent:
			_auth_sent = true
			var ver_info := Engine.get_version_info()
			var ver_str := "%d.%d.%d" % [ver_info.major, ver_info.minor, ver_info.patch]
			var auth_frame := {
				"v": 1,
				"type": "auth",
				"token": ipc_token,
				"pid": OS.get_process_id(),
				"engineVersion": ver_str,
			}
			_ws.send_text(JSON.stringify(auth_frame))

		while _ws.get_available_packet_count() > 0:
			var raw := _ws.get_packet().get_string_from_utf8()
			_handle_message(raw)

		if _authenticated and not _hang_active:
			_heartbeat_accum += delta
			if _heartbeat_accum >= HEARTBEAT_INTERVAL_SEC:
				_heartbeat_accum = 0.0
				send_request("heartbeat", {"uptimeMs": Time.get_ticks_msec()})

		if _probe_active:
			_probe_elapsed_sec += delta
			_probe_frame_deltas_ms.append(delta * 1000.0)
			if _probe_elapsed_sec >= HITCH_PROBE_DURATION_SEC or _probe_frame_deltas_ms.size() >= HITCH_PROBE_MAX_FRAMES:
				_probe_active = false
				_shader_telemetry_req_id = send_request("shader_telemetry", _collect_shader_telemetry())

	elif state == WebSocketPeer.STATE_CLOSED and _connected:
		# Host closed IPC channel
		_connected = false

func _handle_message(raw: String) -> void:
	var parsed: Variant = JSON.parse_string(raw)
	if not (parsed is Dictionary):
		return
	var msg: Dictionary = parsed
	var msg_type := str(msg.get("type", ""))
	match msg_type:
		"auth_ack":
			var ok := bool(msg.get("ok", false))
			var err_msg := str(msg.get("error", ""))
			_authenticated = ok
			emit_signal("auth_completed", ok, err_msg)
			if ok:
				for pending in _pending_requests:
					_ws.send_text(JSON.stringify(pending))
				_pending_requests.clear()
			else:
				push_error("PlayHubDesktopBridge: auth failed: " + err_msg)
				get_tree().quit(11)
		"response":
			var req_id := str(msg.get("reqId", ""))
			var ok := bool(msg.get("ok", false))
			var payload: Dictionary = msg.get("payload", {}) if msg.get("payload") is Dictionary else {}
			emit_signal("bridge_response", req_id, ok, payload)
			if req_id == _first_frame_req_id and not _first_frame_acked:
				_first_frame_acked = true
				_on_first_frame_acked()
			elif not _shader_telemetry_req_id.is_empty() and req_id == _shader_telemetry_req_id:
				if test_mode == "hitch_probe":
					get_tree().quit(0)
		"event":
			var ev := str(msg.get("event", ""))
			var payload: Dictionary = msg.get("payload", {}) if msg.get("payload") is Dictionary else {}
			emit_signal("bridge_event", ev, payload)
			if ev == "host_shutdown":
				get_tree().quit(0)

func _on_first_frame_acked() -> void:
	match test_mode:
		"exit_ok":
			get_tree().quit(0)
		"hitch_probe":
			_probe_active = true
			_probe_elapsed_sec = 0.0
			_probe_frame_deltas_ms.clear()
		"crash":
			push_error("PlayHubDesktopBridge: simulated crash (test_mode=crash)")
			get_tree().quit(42)
		"hang":
			_hang_active = true
			print("PlayHubDesktopBridge: entering simulated hang (heartbeat suppressed)")
