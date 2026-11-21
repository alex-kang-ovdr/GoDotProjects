extends Node3D

# PlayHub Single-Runtime Godot 4.7.2 3D Avatar Studio (reuses libgodot_android.so with +0 MB extra 3D engine)
# Frames a real 3D modular Voxel Avatar in the sticky top 46% viewport above the Native Stitch Wardrobe Sheet.

var _bridge: Object = null
var _avatar_rig: Node3D = null
var _camera: Camera3D = null
var _floor_ring: MeshInstance3D = null
var _part_nodes: Dictionary = {}
var _top_materials: Array[StandardMaterial3D] = []
var _emblem_node: Node3D = null

var _equipped: Dictionary = {
	"i1": true,
	"i2": true
}
var _accent_color: Color = Color.html("#00B06F")
var _use_unshaded: bool = false
var _inline_mode: bool = false
var _host_udp_port: int = 0
var _udp_peer: PacketPeerUDP = null
var _godot_udp_port: int = 0

var _yaw: float = 0.28
var _target_yaw: float = 0.28
var _dragging: bool = false
var _last_touch_x: float = 0.0
var _idle_time: float = 0.0
var _last_interaction_msec: int = 0
var _fps_accum_time: float = 0.0
var _fps_frames: int = 0
var _ready_notified: bool = false
var _pending_equip_seq: int = -1

func _ready() -> void:
	_last_interaction_msec = Time.get_ticks_msec()
	var adapter := RenderingServer.get_video_adapter_name().to_lower()
	_use_unshaded = adapter.find("swiftshader") != -1 or adapter.find("llvmpipe") != -1
	print("PlayHubAvatarStudio: adapter=", adapter, " unshaded_fallback=", _use_unshaded)

	if FileAccess.file_exists("user://playhub_avatar_init.json"):
		var f := FileAccess.open("user://playhub_avatar_init.json", FileAccess.READ)
		if f != null:
			_apply_state_json(f.get_as_text())
			f.close()

	if Engine.has_singleton("PlayHubBridge"):
		_bridge = Engine.get_singleton("PlayHubBridge")
		if _bridge != null:
			var from_bridge := str(_bridge.call("get_avatar_init_json")).strip_edges()
			if not from_bridge.is_empty() and from_bridge != "{}":
				_apply_state_json(from_bridge)
			_bridge.connect("bridge_event", Callable(self, "_on_bridge_event"))

	_build_environment()
	_build_camera()
	_build_stage()
	_build_avatar_rig()
	_apply_equipped_visuals()
	_setup_udp_ipc()

	# Notify Kotlin host on the very first rendered 3D frame (real TTFD measurement)
	RenderingServer.frame_post_draw.connect(_on_frame_post_draw)

func _setup_udp_ipc() -> void:
	if _host_udp_port <= 0:
		return
	var peer := PacketPeerUDP.new()
	if peer.bind(0, "127.0.0.1") == OK:
		_udp_peer = peer
		_godot_udp_port = peer.get_local_port()
		print("PlayHubAvatarStudio: UDP IPC bound port=", _godot_udp_port, " host_port=", _host_udp_port)

func _send_udp(payload: Dictionary) -> void:
	if _udp_peer == null or _host_udp_port <= 0:
		return
	_udp_peer.set_dest_address("127.0.0.1", _host_udp_port)
	_udp_peer.put_packet(JSON.stringify(payload).to_utf8_buffer())

func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color.html("#111315")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.82, 0.88, 0.92, 1.0)
	env.ambient_light_energy = 0.85

	var world_env := WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

	if not _use_unshaded:
		var key_light := DirectionalLight3D.new()
		key_light.light_energy = 1.25
		key_light.light_color = Color(1.0, 0.98, 0.95, 1.0)
		key_light.rotation_degrees = Vector3(-32.0, 28.0, 0.0)
		add_child(key_light)

		var rim_light := OmniLight3D.new()
		rim_light.light_energy = 1.6
		rim_light.light_color = Color.html("#00E290")
		rim_light.omni_range = 7.0
		rim_light.position = Vector3(-1.8, 2.2, -1.6)
		add_child(rim_light)

func _build_camera() -> void:
	_camera = Camera3D.new()
	_camera.fov = 38.0
	_camera.near = 0.1
	_camera.far = 30.0
	if _inline_mode:
		# Centered 4:3 inline preview stage inside MainActivity Avatar tab
		_camera.position = Vector3(0.0, 1.15, 3.65)
		_camera.look_at(Vector3(0.0, 1.02, 0.0), Vector3.UP)
	else:
		# Shift camera target downward so the 3D avatar sits cleanly in the sticky top 46% viewport
		_camera.position = Vector3(0.0, 0.35, 5.2)
		_camera.look_at(Vector3(0.0, -0.35, 0.0), Vector3.UP)
	add_child(_camera)

func _build_stage() -> void:
	# Subtle 3D turntable plinth disc beneath avatar feet (positioned in top half of screen)
	var disc_mesh := CylinderMesh.new()
	disc_mesh.top_radius = 0.98
	disc_mesh.bottom_radius = 1.08
	disc_mesh.height = 0.08
	disc_mesh.radial_segments = 32

	var disc_mat := _make_mat(Color.html("#192823"), 0.15, 0.7)
	var disc := MeshInstance3D.new()
	disc.mesh = disc_mesh
	disc.material_override = disc_mat
	disc.position = Vector3(0.0, 0.08, 0.0)
	add_child(disc)

	# Glowing accent rim ring
	var ring_mesh := TorusMesh.new()
	ring_mesh.inner_radius = 0.96
	ring_mesh.outer_radius = 1.05
	ring_mesh.rings = 32
	ring_mesh.ring_segments = 12
	_floor_ring = MeshInstance3D.new()
	_floor_ring.mesh = ring_mesh
	_floor_ring.material_override = _make_mat(_accent_color, 0.2, 0.3, true)
	_floor_ring.position = Vector3(0.0, 0.12, 0.0)
	add_child(_floor_ring)

func _build_avatar_rig() -> void:
	_avatar_rig = Node3D.new()
	_avatar_rig.position = Vector3(0.0, 0.14, 0.0)
	_avatar_rig.rotation.y = _yaw
	add_child(_avatar_rig)

	var skin_mat := _make_mat(Color.html("#E3AE88"), 0.0, 0.75)
	var hair_mat := _make_mat(Color.html("#1B1E23"), 0.0, 0.85)
	var pants_mat := _make_mat(Color.html("#191D23"), 0.0, 0.85)
	var shoe_mat := _make_mat(Color.html("#22272F"), 0.1, 0.6)
	var sole_mat := _make_mat(Color.html("#65E844"), 0.0, 0.4, true)
	var eye_mat := _make_mat(Color.html("#111315"), 0.0, 0.5)

	# Legs & Shoes
	_add_box(_avatar_rig, "LegL", Vector3(0.24, 0.62, 0.24), Vector3(-0.14, 0.40, 0.0), pants_mat)
	_add_box(_avatar_rig, "LegR", Vector3(0.24, 0.62, 0.24), Vector3(0.14, 0.40, 0.0), pants_mat)
	_add_box(_avatar_rig, "ShoeL", Vector3(0.26, 0.11, 0.30), Vector3(-0.14, 0.08, 0.02), shoe_mat)
	_add_box(_avatar_rig, "ShoeR", Vector3(0.26, 0.11, 0.30), Vector3(0.14, 0.08, 0.02), shoe_mat)
	_add_box(_avatar_rig, "SoleL", Vector3(0.27, 0.03, 0.31), Vector3(-0.14, 0.02, 0.02), sole_mat)
	_add_box(_avatar_rig, "SoleR", Vector3(0.27, 0.03, 0.31), Vector3(0.14, 0.02, 0.02), sole_mat)

	# Torso & Arms (dynamic top material swapped by hoodie / midnight jacket / accent)
	var torso_mat := _make_mat(Color.html("#65E844"), 0.08, 0.55)
	var arm_mat := _make_mat(Color.html("#3BBF36"), 0.08, 0.60)
	_top_materials.append(torso_mat)
	_top_materials.append(arm_mat)

	_add_box(_avatar_rig, "Torso", Vector3(0.58, 0.66, 0.32), Vector3(0.0, 1.04, 0.0), torso_mat)
	_add_box(_avatar_rig, "Zipper", Vector3(0.04, 0.65, 0.335), Vector3(0.0, 1.04, 0.0), pants_mat)
	_add_box(_avatar_rig, "ArmL", Vector3(0.20, 0.58, 0.22), Vector3(-0.41, 1.03, 0.0), arm_mat)
	_add_box(_avatar_rig, "ArmR", Vector3(0.20, 0.58, 0.22), Vector3(0.41, 1.03, 0.0), arm_mat)
	_add_box(_avatar_rig, "HandL", Vector3(0.17, 0.14, 0.17), Vector3(-0.41, 0.69, 0.0), skin_mat)
	_add_box(_avatar_rig, "HandR", Vector3(0.17, 0.14, 0.17), Vector3(0.41, 0.69, 0.0), skin_mat)

	# PlayHub Evergreen/Lime Chest Badge
	_emblem_node = Node3D.new()
	_emblem_node.position = Vector3(0.14, 1.15, 0.17)
	_avatar_rig.add_child(_emblem_node)
	_add_box(_emblem_node, "BadgeBg", Vector3(0.15, 0.15, 0.02), Vector3.ZERO, _make_mat(Color.html("#142C25"), 0.0, 0.5))
	_add_box(_emblem_node, "BadgeDot", Vector3(0.06, 0.07, 0.03), Vector3(0.005, 0.0, 0.005), _make_mat(Color.html("#DEECA6"), 0.0, 0.3, true))

	# Head, Neck & Hair
	_add_box(_avatar_rig, "Neck", Vector3(0.18, 0.10, 0.18), Vector3(0.0, 1.40, 0.0), skin_mat)
	_add_box(_avatar_rig, "Head", Vector3(0.48, 0.48, 0.48), Vector3(0.0, 1.66, 0.0), skin_mat)
	_add_box(_avatar_rig, "HairTop", Vector3(0.51, 0.14, 0.51), Vector3(0.0, 1.88, -0.01), hair_mat)
	_add_box(_avatar_rig, "HairBack", Vector3(0.51, 0.34, 0.16), Vector3(0.0, 1.72, -0.20), hair_mat)
	_add_box(_avatar_rig, "EyeL", Vector3(0.06, 0.07, 0.02), Vector3(-0.10, 1.66, 0.245), eye_mat)
	_add_box(_avatar_rig, "EyeR", Vector3(0.06, 0.07, 0.02), Vector3(0.10, 1.66, 0.245), eye_mat)
	_add_box(_avatar_rig, "Mouth", Vector3(0.12, 0.028, 0.02), Vector3(0.0, 1.52, 0.245), _make_mat(Color.html("#6A4024"), 0.0, 0.8))

	# Cosmetic i1: Hoodie Collar & Hood (Back)
	var hoodie_node := Node3D.new()
	_avatar_rig.add_child(hoodie_node)
	_add_box(hoodie_node, "HoodBack", Vector3(0.50, 0.22, 0.22), Vector3(0.0, 1.36, -0.22), _make_mat(Color.html("#2EA826"), 0.05, 0.6))
	_add_box(hoodie_node, "HoodPocket", Vector3(0.42, 0.20, 0.05), Vector3(0.0, 0.88, 0.175), _make_mat(Color.html("#2EA826"), 0.05, 0.6))
	_part_nodes["i1"] = hoodie_node

	# Cosmetic i5: Midnight Street Jacket Collar & Stripes
	var jacket_node := Node3D.new()
	_avatar_rig.add_child(jacket_node)
	_add_box(jacket_node, "Collar", Vector3(0.54, 0.13, 0.36), Vector3(0.0, 1.38, -0.01), _make_mat(Color.html("#1E3A8A"), 0.2, 0.5))
	_add_box(jacket_node, "StripeL", Vector3(0.06, 0.52, 0.24), Vector3(-0.50, 1.03, 0.0), _make_mat(Color.html("#60A5FA"), 0.1, 0.3, true))
	_add_box(jacket_node, "StripeR", Vector3(0.06, 0.52, 0.24), Vector3(0.50, 1.03, 0.0), _make_mat(Color.html("#60A5FA"), 0.1, 0.3, true))
	_part_nodes["i5"] = jacket_node

	# Cosmetic i2: Cyber Cyan Visor
	var visor_node := Node3D.new()
	_avatar_rig.add_child(visor_node)
	_add_box(visor_node, "VisorFrame", Vector3(0.54, 0.15, 0.10), Vector3(0.0, 1.67, 0.23), _make_mat(Color.html("#0D3B4C"), 0.4, 0.3))
	_add_box(visor_node, "VisorGlow", Vector3(0.46, 0.10, 0.05), Vector3(0.0, 1.67, 0.275), _make_mat(Color.html("#5EEAFF"), 0.2, 0.15, true))
	_part_nodes["i2"] = visor_node

	# Cosmetic i3: Neon Street Cap
	var cap_node := Node3D.new()
	_avatar_rig.add_child(cap_node)
	_add_box(cap_node, "CapCrown", Vector3(0.54, 0.20, 0.54), Vector3(0.0, 1.98, -0.01), _make_mat(Color.html("#1F242A"), 0.1, 0.6))
	_add_box(cap_node, "CapBrim", Vector3(0.56, 0.06, 0.32), Vector3(0.0, 1.89, 0.28), _make_mat(Color.html("#00E290"), 0.1, 0.3, true))
	_add_box(cap_node, "CapBand", Vector3(0.55, 0.05, 0.55), Vector3(0.0, 1.90, -0.01), _make_mat(Color.html("#00B06F"), 0.1, 0.3, true))
	_part_nodes["i3"] = cap_node

	# Cosmetic i6: Gold Champion Crown
	var crown_node := Node3D.new()
	_avatar_rig.add_child(crown_node)
	var gold_mat := _make_mat(Color.html("#FFC83D"), 0.8, 0.22, _use_unshaded)
	_add_box(crown_node, "CrownBase", Vector3(0.46, 0.10, 0.46), Vector3(0.0, 1.97, 0.0), gold_mat)
	_add_box(crown_node, "SpikeC", Vector3(0.11, 0.16, 0.11), Vector3(0.0, 2.09, 0.16), gold_mat)
	_add_box(crown_node, "SpikeL", Vector3(0.10, 0.13, 0.10), Vector3(-0.17, 2.07, 0.16), gold_mat)
	_add_box(crown_node, "SpikeR", Vector3(0.10, 0.13, 0.10), Vector3(0.17, 2.07, 0.16), gold_mat)
	_add_box(crown_node, "Gem", Vector3(0.07, 0.07, 0.04), Vector3(0.0, 1.98, 0.24), _make_mat(Color.html("#00E290"), 0.2, 0.2, true))
	_part_nodes["i6"] = crown_node

	# Cosmetic i4: Hologram Cyber Wings
	var wings_node := Node3D.new()
	_avatar_rig.add_child(wings_node)
	var wing_mat := _make_mat(Color.html("#38BDF8"), 0.2, 0.2, true)
	var wing_inner := _make_mat(Color.html("#00E290"), 0.2, 0.2, true)
	var wl := _add_box(wings_node, "WingLOuter", Vector3(0.66, 0.42, 0.04), Vector3(-0.56, 1.24, -0.26), wing_mat)
	wl.rotation_degrees = Vector3(0.0, 22.0, 18.0)
	var wr := _add_box(wings_node, "WingROuter", Vector3(0.66, 0.42, 0.04), Vector3(0.56, 1.24, -0.26), wing_mat)
	wr.rotation_degrees = Vector3(0.0, -22.0, -18.0)
	var wli := _add_box(wings_node, "WingLInner", Vector3(0.46, 0.24, 0.05), Vector3(-0.46, 0.96, -0.24), wing_inner)
	wli.rotation_degrees = Vector3(0.0, 16.0, -12.0)
	var wri := _add_box(wings_node, "WingRInner", Vector3(0.46, 0.24, 0.05), Vector3(0.46, 0.96, -0.24), wing_inner)
	wri.rotation_degrees = Vector3(0.0, -16.0, 12.0)
	_part_nodes["i4"] = wings_node

func _add_box(parent: Node3D, node_name: String, size: Vector3, pos: Vector3, mat: StandardMaterial3D) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	var inst := MeshInstance3D.new()
	inst.name = node_name
	inst.mesh = mesh
	inst.material_override = mat
	inst.position = pos
	parent.add_child(inst)
	return inst

func _make_mat(color: Color, metallic: float, roughness: float, emissive: bool = false) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.metallic = metallic
	m.roughness = roughness
	if _use_unshaded:
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	elif emissive:
		m.emission_enabled = true
		m.emission = color
		m.emission_energy_multiplier = 0.85
	return m

func _apply_equipped_visuals() -> void:
	var has_hoodie: bool = _equipped.get("i1", false)
	var has_jacket: bool = _equipped.get("i5", false) and not has_hoodie
	var has_visor: bool = _equipped.get("i2", false)
	var has_cap: bool = _equipped.get("i3", false)
	var has_crown: bool = _equipped.get("i6", false) and not has_cap
	var has_wings: bool = _equipped.get("i4", false)

	if _part_nodes.has("i1"): _part_nodes["i1"].visible = has_hoodie
	if _part_nodes.has("i5"): _part_nodes["i5"].visible = has_jacket
	if _part_nodes.has("i2"): _part_nodes["i2"].visible = has_visor
	if _part_nodes.has("i3"): _part_nodes["i3"].visible = has_cap
	if _part_nodes.has("i6"): _part_nodes["i6"].visible = has_crown
	if _part_nodes.has("i4"): _part_nodes["i4"].visible = has_wings

	var main_col: Color = _accent_color
	var side_col: Color = _accent_color.darkened(0.28)
	if has_hoodie:
		main_col = Color.html("#65E844")
		side_col = Color.html("#2EA826")
	elif has_jacket:
		main_col = Color.html("#2563EB")
		side_col = Color.html("#1D4ED8")

	if _top_materials.size() >= 2:
		_top_materials[0].albedo_color = main_col
		_top_materials[1].albedo_color = side_col

	if _floor_ring != null and _floor_ring.material_override is StandardMaterial3D:
		var rm: StandardMaterial3D = _floor_ring.material_override
		rm.albedo_color = _accent_color
		if not _use_unshaded:
			rm.emission = _accent_color

func _apply_state_json(raw: String) -> void:
	if raw.is_empty():
		return
	var parsed: Variant = JSON.parse_string(raw)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var dict: Dictionary = parsed
	if dict.has("equipped"):
		_equipped.clear()
		var csv := str(dict["equipped"])
		for token in csv.split(","):
			var id := token.strip_edges()
			if not id.is_empty():
				_equipped[id] = true
	if dict.has("accent"):
		var hx := str(dict["accent"]).strip_edges()
		if hx.begins_with("#") and hx.length() == 7:
			_accent_color = Color.html(hx)
	if dict.has("inlineMode"):
		_inline_mode = bool(dict["inlineMode"])
	if dict.has("udpPort"):
		var p := int(dict["udpPort"])
		if p > 0:
			_host_udp_port = p

func _on_bridge_event(event_type: String, payload_json: String) -> void:
	_last_interaction_msec = Time.get_ticks_msec()
	Engine.max_fps = 60
	if event_type == "avatar_equip":
		_apply_state_json(payload_json)
		_apply_equipped_visuals()
		var parsed: Variant = JSON.parse_string(payload_json)
		if typeof(parsed) == TYPE_DICTIONARY and parsed.has("seq"):
			_pending_equip_seq = int(parsed["seq"])
	elif event_type == "avatar_rotate":
		var parsed: Variant = JSON.parse_string(payload_json)
		if typeof(parsed) == TYPE_DICTIONARY and parsed.has("deltaYaw"):
			_target_yaw += float(parsed["deltaYaw"])

func _on_frame_post_draw() -> void:
	if not _ready_notified:
		_ready_notified = true
		if _bridge != null:
			_bridge.call("notify_studio_ready", _use_unshaded)
		_send_udp({"type": "ready", "swFallback": _use_unshaded, "godotPort": _godot_udp_port})
	if _pending_equip_seq >= 0:
		var seq := _pending_equip_seq
		_pending_equip_seq = -1
		if _bridge != null:
			_bridge.call("notify_equip_applied", seq)
		_send_udp({"type": "equip_ack", "seq": seq})

func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var touch: InputEventScreenTouch = event
		var h := get_viewport().get_visible_rect().size.y
		var in_stage := _inline_mode or (touch.position.y < h * 0.48)
		if touch.pressed and in_stage:
			_dragging = true
			_last_touch_x = touch.position.x
			_last_interaction_msec = Time.get_ticks_msec()
			Engine.max_fps = 60
		elif not touch.pressed:
			_dragging = false
	elif event is InputEventScreenDrag and _dragging:
		var drag: InputEventScreenDrag = event
		var dx := drag.position.x - _last_touch_x
		_last_touch_x = drag.position.x
		_target_yaw += dx * 0.011
		_last_interaction_msec = Time.get_ticks_msec()
		Engine.max_fps = 60

func _poll_udp_ipc() -> void:
	if _udp_peer == null:
		return
	while _udp_peer.get_available_packet_count() > 0:
		var raw := _udp_peer.get_packet().get_string_from_utf8()
		var parsed: Variant = JSON.parse_string(raw)
		if typeof(parsed) != TYPE_DICTIONARY:
			continue
		var dict: Dictionary = parsed
		var t := str(dict.get("type", ""))
		if t == "equip":
			_last_interaction_msec = Time.get_ticks_msec()
			Engine.max_fps = 60
			_apply_state_json(raw)
			_apply_equipped_visuals()
			if dict.has("seq"):
				_pending_equip_seq = int(dict["seq"])

func _process(delta: float) -> void:
	_poll_udp_ipc()
	_idle_time += delta
	_yaw = lerpf(_yaw, _target_yaw, clampf(delta * 12.0, 0.0, 1.0))
	if _avatar_rig != null:
		_avatar_rig.rotation.y = _yaw
		# Subtle alive breathing float
		_avatar_rig.position.y = 0.14 + sin(_idle_time * 2.4) * 0.025

	# Thermal & battery throttling: drop to 30fps after 2.5s idle
	if not _dragging and (Time.get_ticks_msec() - _last_interaction_msec) > 2500:
		Engine.max_fps = 30

	# Report live FPS telemetry every 1.0s
	_fps_accum_time += delta
	_fps_frames += 1
	if _fps_accum_time >= 1.0:
		var fps := float(_fps_frames) / _fps_accum_time
		var frame_ms := (_fps_accum_time / float(max(_fps_frames, 1))) * 1000.0
		_fps_accum_time = 0.0
		_fps_frames = 0
		if _bridge != null:
			_bridge.call("notify_studio_metrics", fps, frame_ms)
		_send_udp({"type": "fps", "fps": fps, "frameMs": frame_ms})
