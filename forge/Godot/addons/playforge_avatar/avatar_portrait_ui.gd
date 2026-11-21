class_name PlayForgeAvatarPortraitUI
extends PanelContainer

const AvatarCatalog = preload("res://addons/playforge_avatar/avatar_catalog.gd")
const AvatarBridge = preload("res://addons/playforge_avatar/avatar_bridge.gd")
const AvatarRig = preload("res://addons/playforge_avatar/avatar_rig.gd")

## Sealed 3D RenderTarget Portrait UI for PlayForge game modes.
## Renders the player's verified PlayHub Avatar inside an isolated World3D SubViewport
## as either an Upper-Body (bust) or Full-Body live 3D portrait, with strict minimum UI
## size limits enforced both here and in C++ (Forge-GodotEngine Control::platform_min_size).

enum PortraitFraming {
	UPPER_BODY = 0,
	FULL_BODY = 1,
}

enum PortraitCorner {
	BOTTOM_LEFT = 0,
	TOP_RIGHT = 1,
	BOTTOM_RIGHT = 2,
	TOP_LEFT_BELOW_HUD = 3,
	CUSTOM = 4,
}

signal loadout_applied(summary: Dictionary)
signal framing_changed(framing: int)
signal emote_started(emote_id: String, emoji: String)
signal emote_finished(emote_id: String)

const MIN_SIZE_UPPER_BODY := Vector2(128.0, 128.0)
const MIN_SIZE_FULL_BODY := Vector2(160.0, 240.0)
const DEFAULT_SIZE_UPPER_BODY := Vector2(192.0, 192.0)
const DEFAULT_SIZE_FULL_BODY := Vector2(220.0, 320.0)
const SAFE_MARGIN := 16.0
const TOP_HUD_CLEARANCE_Y := 68.0
const MIN_VISIBLE_ALPHA := 0.85

@export var framing: PortraitFraming = PortraitFraming.UPPER_BODY:
	set(value):
		var next_framing := clampi(int(value), PortraitFraming.UPPER_BODY, PortraitFraming.FULL_BODY) as PortraitFraming
		if framing != next_framing:
			framing = next_framing
			_apply_size_constraints(_requested_size)
			_apply_camera_framing()
			_update_badge_text()
			framing_changed.emit(int(framing))

@export var corner: PortraitCorner = PortraitCorner.BOTTOM_LEFT:
	set(value):
		corner = clampi(int(value), PortraitCorner.BOTTOM_LEFT, PortraitCorner.CUSTOM) as PortraitCorner
		if is_inside_tree():
			_reposition_in_viewport()

@export var turntable_sway_degrees := 7.0
@export var show_framing_badge := true

var _requested_size: Vector2 = DEFAULT_SIZE_UPPER_BODY
var _custom_pos: Vector2 = Vector2(SAFE_MARGIN, TOP_HUD_CLEARANCE_Y)
var _catalog: AvatarCatalog
var _bridge: AvatarBridge
var _rig: AvatarRig

var _viewport_container: SubViewportContainer
var _sub_viewport: SubViewport
var _studio_root: Node3D
var _portrait_camera: Camera3D
var _badge_label: Label
var _sway_time := 0.0
var _display_name := "Player"


static func get_min_size_for_framing(target_framing: int) -> Vector2:
	return MIN_SIZE_FULL_BODY if target_framing == PortraitFraming.FULL_BODY else MIN_SIZE_UPPER_BODY


static func clamp_portrait_size(target_framing: int, requested: Vector2) -> Vector2:
	var min_sz := get_min_size_for_framing(target_framing)
	var fallback := DEFAULT_SIZE_FULL_BODY if target_framing == PortraitFraming.FULL_BODY else DEFAULT_SIZE_UPPER_BODY
	var src := requested if (requested.x > 0.0 and requested.y > 0.0) else fallback
	# Only minimum size (>= min_sz) is mandatory; creators may freely size larger (e.g. full-screen lobby/dialogue).
	return Vector2(
		maxf(src.x, min_sz.x),
		maxf(src.y, min_sz.y)
	)


func _ready() -> void:
	set_meta("_playforge_avatar_sealed", true)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_apply_frame_style()
	_build_render_target_stage()

	_catalog = AvatarCatalog.new()
	_catalog.load_catalog()

	_bridge = AvatarBridge.new()
	_bridge.name = "SealedPortraitBridge"
	_bridge.set_meta("_playforge_avatar_sealed", true)
	_bridge.initialize(_catalog)
	_bridge.loadout_resolved.connect(_on_loadout_resolved)
	add_child(_bridge)

	_apply_size_constraints(_requested_size)
	_apply_camera_framing()
	_reposition_in_viewport()
	if get_viewport() != null:
		get_viewport().size_changed.connect(_reposition_in_viewport)
	_bridge.request_player_loadout()


func _process(delta: float) -> void:
	_sway_time += delta
	if _rig != null and is_instance_valid(_rig):
		var base_yaw := deg_to_rad(14.0 if framing == PortraitFraming.UPPER_BODY else 16.0)
		var sway := deg_to_rad(sin(_sway_time * 1.15) * clampf(turntable_sway_degrees, 0.0, 20.0))
		_rig.rotation.y = base_yaw + sway
	_enforce_runtime_guard()


func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and is_inside_tree():
		_enforce_runtime_guard()
		_sync_subviewport_size()


# --- Public Creator-Safe API ---

func configure_portrait(target_framing: int, target_size := Vector2.ZERO, target_corner := PortraitCorner.BOTTOM_LEFT) -> void:
	framing = clampi(target_framing, PortraitFraming.UPPER_BODY, PortraitFraming.FULL_BODY) as PortraitFraming
	corner = clampi(target_corner, PortraitCorner.BOTTOM_LEFT, PortraitCorner.CUSTOM) as PortraitCorner
	_requested_size = clamp_portrait_size(int(framing), target_size)
	_apply_size_constraints(_requested_size)
	_apply_camera_framing()
	_update_badge_text()
	if is_inside_tree():
		_reposition_in_viewport()


func set_framing(target_framing: int, target_size := Vector2.ZERO) -> void:
	var next_framing := clampi(target_framing, PortraitFraming.UPPER_BODY, PortraitFraming.FULL_BODY)
	if Engine.has_singleton("PlayForgePlatform"):
		var pf = Engine.get_singleton("PlayForgePlatform")
		if pf.has_method("set_portrait_framing") and pf.call("get_avatar_portrait_ui") == self:
			pf.call("set_portrait_framing", next_framing, target_size)
			return
	configure_portrait(next_framing, target_size, int(corner))


func set_portrait_size(requested_size: Vector2) -> Vector2:
	var clamped := clamp_portrait_size(int(framing), requested_size)
	_requested_size = clamped
	# Assign directly so C++ Control::set_size / set_custom_minimum_size also validates & records violations if caller went below floor.
	custom_minimum_size = requested_size
	size = requested_size
	_enforce_runtime_guard()
	_sync_subviewport_size()
	if is_inside_tree():
		_reposition_in_viewport()
	return size


func set_corner(target_corner: PortraitCorner) -> void:
	corner = target_corner


func set_custom_position(pos: Vector2) -> void:
	corner = PortraitCorner.CUSTOM
	_custom_pos = pos
	if is_inside_tree():
		_reposition_in_viewport()


func play_emote_slot(slot_index: int) -> bool:
	if _rig == null:
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


func get_min_portrait_size() -> Vector2:
	return get_min_size_for_framing(int(framing))


func get_framing_name() -> String:
	return "FULL_BODY" if framing == PortraitFraming.FULL_BODY else "UPPER_BODY"


func get_render_texture() -> ViewportTexture:
	return _sub_viewport.get_texture() if _sub_viewport != null else null


func get_public_state() -> Dictionary:
	var platform_min := Vector2.ZERO
	if has_method("get_platform_min_size"):
		platform_min = call("get_platform_min_size")
	return {
		"framing": int(framing),
		"framingName": get_framing_name(),
		"corner": int(corner),
		"size": [size.x, size.y],
		"minSize": [get_min_portrait_size().x, get_min_portrait_size().y],
		"platformMinSize": [platform_min.x, platform_min.y],
		"viewportSize": [_sub_viewport.size.x, _sub_viewport.size.y] if _sub_viewport != null else [0, 0],
		"position": [position.x, position.y],
		"visible": visible,
		"activeEmote": _rig.get_active_emote_id() if _rig != null else "",
		"rig": _rig.get_rig_summary() if _rig != null else {},
		"sealed": true,
	}


# --- Internal Sealed RenderTarget Construction ---

func _apply_frame_style() -> void:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.067, 0.149, 0.125, 0.92) # PlayHub dark evergreen #112620
	style.border_color = Color(0.871, 0.925, 0.651, 0.58) # PlayHub lime #deeca6
	style.set_border_width_all(2)
	style.set_corner_radius_all(14)
	style.set_content_margin_all(4.0)
	add_theme_stylebox_override("panel", style)


func _build_render_target_stage() -> void:
	var holder := Control.new()
	holder.name = "SealedPortraitStage"
	holder.set_anchors_preset(Control.PRESET_FULL_RECT)
	holder.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	holder.size_flags_vertical = Control.SIZE_EXPAND_FILL
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.clip_contents = true
	holder.set_meta("_playforge_avatar_sealed", true)
	add_child(holder)

	_viewport_container = SubViewportContainer.new()
	_viewport_container.name = "SealedPortraitViewportContainer"
	_viewport_container.set_anchors_preset(Control.PRESET_FULL_RECT)
	_viewport_container.stretch = true
	_viewport_container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_viewport_container.set_meta("_playforge_avatar_sealed", true)
	holder.add_child(_viewport_container)

	_sub_viewport = SubViewport.new()
	_sub_viewport.name = "SealedPortraitViewport"
	_sub_viewport.own_world_3d = true
	_sub_viewport.transparent_bg = true
	_sub_viewport.handle_input_locally = false
	_sub_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_sub_viewport.msaa_3d = Viewport.MSAA_2X
	_sub_viewport.size = Vector2i(int(DEFAULT_SIZE_UPPER_BODY.x), int(DEFAULT_SIZE_UPPER_BODY.y))
	_sub_viewport.set_meta("_playforge_avatar_sealed", true)
	_viewport_container.add_child(_sub_viewport)

	_studio_root = Node3D.new()
	_studio_root.name = "PortraitStudio3D"
	_sub_viewport.add_child(_studio_root)

	# Isolated studio lighting so portrait never turns black in 2D scenes or dark 3D caves
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.08, 0.18, 0.15, 0.0)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.86, 0.93, 0.90)
	env.ambient_light_energy = 0.95
	var world_env := WorldEnvironment.new()
	world_env.name = "StudioEnvironment"
	world_env.environment = env
	_studio_root.add_child(world_env)

	var key_light := DirectionalLight3D.new()
	key_light.name = "KeyLight"
	key_light.light_energy = 1.45
	key_light.light_color = Color(1.0, 0.98, 0.94)
	key_light.rotation_degrees = Vector3(-28.0, 150.0, 0.0)
	_studio_root.add_child(key_light)

	var rim_light := DirectionalLight3D.new()
	rim_light.name = "RimLight"
	rim_light.light_energy = 0.72
	rim_light.light_color = Color(0.75, 0.95, 0.85)
	rim_light.rotation_degrees = Vector3(-18.0, -35.0, 0.0)
	_studio_root.add_child(rim_light)

	var pedestal := MeshInstance3D.new()
	pedestal.name = "StudioPedestal"
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.72
	cyl.bottom_radius = 0.80
	cyl.height = 0.08
	var ped_mat := StandardMaterial3D.new()
	ped_mat.albedo_color = Color(0.16, 0.34, 0.28)
	ped_mat.roughness = 0.75
	cyl.material = ped_mat
	pedestal.mesh = cyl
	pedestal.position = Vector3(0.0, -0.04, 0.0)
	_studio_root.add_child(pedestal)

	_rig = AvatarRig.new()
	_rig.name = "SealedPortraitRig"
	_rig.emote_started.connect(func(eid: String, em: String): emote_started.emit(eid, em))
	_rig.emote_finished.connect(func(eid: String): emote_finished.emit(eid))
	_studio_root.add_child(_rig)

	_portrait_camera = Camera3D.new()
	_portrait_camera.name = "PortraitCamera"
	_portrait_camera.current = true
	_portrait_camera.near = 0.05
	_portrait_camera.far = 40.0
	_studio_root.add_child(_portrait_camera)

	_badge_label = Label.new()
	_badge_label.name = "SealedPortraitBadge"
	_badge_label.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	_badge_label.offset_top = -24.0
	_badge_label.offset_left = 6.0
	_badge_label.offset_right = -6.0
	_badge_label.offset_bottom = -2.0
	_badge_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_badge_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_badge_label.add_theme_font_size_override("font_size", 11)
	_badge_label.add_theme_color_override("font_color", Color(0.871, 0.925, 0.651, 0.95))
	_badge_label.add_theme_color_override("font_outline_color", Color(0.04, 0.09, 0.08, 0.9))
	_badge_label.add_theme_constant_override("outline_size", 3)
	_badge_label.visible = show_framing_badge
	holder.add_child(_badge_label)
	_update_badge_text()


func _on_loadout_resolved(loadout: Dictionary) -> void:
	if _rig == null:
		return
	_display_name = str(loadout.get("displayName", "Player"))
	var summary := _rig.apply_sealed_loadout(loadout)
	_apply_camera_framing()
	_update_badge_text()
	loadout_applied.emit(summary)


func _apply_camera_framing() -> void:
	if _portrait_camera == null:
		return
	var eye_y := _rig.get_eye_height() if _rig != null else 1.62
	# AvatarRig faces -Z in local space (model_pivot yaw = 180 deg).
	# Placing camera on -Z side looks straight at the front face of the avatar!
	var target: Vector3
	var cam_pos: Vector3
	if framing == PortraitFraming.UPPER_BODY:
		_portrait_camera.fov = 34.0
		target = Vector3(0.0, eye_y - 0.30, 0.0)
		cam_pos = Vector3(0.0, eye_y - 0.20, -2.65)
	else:
		_portrait_camera.fov = 38.0
		target = Vector3(0.0, eye_y * 0.62, 0.0)
		cam_pos = Vector3(0.0, eye_y * 0.68, -4.45)
	_portrait_camera.transform = Transform3D(Basis.looking_at((target - cam_pos).normalized(), Vector3.UP), cam_pos)


func _apply_size_constraints(requested: Vector2) -> void:
	var clamped := clamp_portrait_size(int(framing), requested)
	_requested_size = clamped
	custom_minimum_size = clamped
	size = clamped
	_sync_subviewport_size()


func _sync_subviewport_size() -> void:
	if _sub_viewport == null:
		return
	# When SubViewportContainer.stretch is enabled, Godot automatically syncs SubViewport size.
	if _viewport_container != null and _viewport_container.stretch:
		return
	var min_sz := get_min_portrait_size()
	var w := maxi(int(round(size.x)) - 8, int(min_sz.x) - 8)
	var h := maxi(int(round(size.y)) - 8, int(min_sz.y) - 8)
	var next_vp := Vector2i(maxi(w, 64), maxi(h, 64))
	if _sub_viewport.size != next_vp:
		_sub_viewport.size = next_vp


func _enforce_runtime_guard() -> void:
	var min_sz := get_min_portrait_size()
	if custom_minimum_size.x < min_sz.x or custom_minimum_size.y < min_sz.y:
		custom_minimum_size = Vector2(maxf(custom_minimum_size.x, min_sz.x), maxf(custom_minimum_size.y, min_sz.y))
	if size.x < min_sz.x or size.y < min_sz.y:
		size = Vector2(maxf(size.x, min_sz.x), maxf(size.y, min_sz.y))
	if scale.x < 1.0 or scale.y < 1.0:
		scale = Vector2(maxf(scale.x, 1.0), maxf(scale.y, 1.0))
	if modulate.a < MIN_VISIBLE_ALPHA:
		modulate = Color(modulate.r, modulate.g, modulate.b, MIN_VISIBLE_ALPHA)
	if self_modulate.a < MIN_VISIBLE_ALPHA:
		self_modulate = Color(self_modulate.r, self_modulate.g, self_modulate.b, MIN_VISIBLE_ALPHA)


func _reposition_in_viewport() -> void:
	var vp := get_viewport()
	var vp_size := vp.get_visible_rect().size if vp != null else Vector2(1280.0, 720.0)
	if vp_size.x <= 1.0 or vp_size.y <= 1.0:
		vp_size = Vector2(1280.0, 720.0)
	var cur_size := Vector2(maxf(size.x, get_min_portrait_size().x), maxf(size.y, get_min_portrait_size().y))
	var top_clearance := TOP_HUD_CLEARANCE_Y
	if Engine.has_singleton("PlayForgePlatform"):
		var inset: Rect2 = Engine.get_singleton("PlayForgePlatform").call("get_topbar_safe_inset")
		top_clearance = maxf(top_clearance, inset.position.y + inset.size.y + 12.0)

	match corner:
		PortraitCorner.BOTTOM_LEFT:
			position = Vector2(SAFE_MARGIN, maxf(top_clearance, vp_size.y - cur_size.y - SAFE_MARGIN))
		PortraitCorner.TOP_RIGHT:
			position = Vector2(maxf(SAFE_MARGIN, vp_size.x - cur_size.x - SAFE_MARGIN), SAFE_MARGIN)
		PortraitCorner.BOTTOM_RIGHT:
			position = Vector2(maxf(SAFE_MARGIN, vp_size.x - cur_size.x - SAFE_MARGIN), maxf(top_clearance, vp_size.y - cur_size.y - SAFE_MARGIN))
		PortraitCorner.TOP_LEFT_BELOW_HUD:
			position = Vector2(SAFE_MARGIN, top_clearance)
		PortraitCorner.CUSTOM:
			var clamped_x := clampf(_custom_pos.x, SAFE_MARGIN, maxf(SAFE_MARGIN, vp_size.x - cur_size.x - SAFE_MARGIN))
			var clamped_y := clampf(_custom_pos.y, SAFE_MARGIN, maxf(SAFE_MARGIN, vp_size.y - cur_size.y - SAFE_MARGIN))
			# Prevent overlapping the top-left CoreHUD bar
			if clamped_x < 248.0 and clamped_y < top_clearance:
				clamped_y = top_clearance
			position = Vector2(clamped_x, clamped_y)


func _update_badge_text() -> void:
	if _badge_label == null:
		return
	var tag := "전신 초상" if framing == PortraitFraming.FULL_BODY else "상반신 초상"
	_badge_label.text = "%s · %s" % [_display_name, tag]
	_badge_label.visible = show_framing_badge
