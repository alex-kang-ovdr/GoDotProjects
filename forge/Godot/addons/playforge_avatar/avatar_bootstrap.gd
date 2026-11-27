extends Node

const AvatarCatalog = preload("res://addons/playforge_avatar/avatar_catalog.gd")
const AvatarBridge = preload("res://addons/playforge_avatar/avatar_bridge.gd")
const AvatarRig = preload("res://addons/playforge_avatar/avatar_rig.gd")
const AvatarController = preload("res://addons/playforge_avatar/avatar_controller.gd")
const AvatarPortraitUI = preload("res://addons/playforge_avatar/avatar_portrait_ui.gd")

## Sealed runtime bootstrap autoload (PlayForgeAvatarRuntime).
## Injected ONLY into PlayHub Publish Builds and PlayForge Editor Play —
## NEVER included in Standard Godot exports.
## Ensures every PlayHub template/game visibly displays the player's sealed
## PlayHub Avatar in the game-appropriate mode and screen/world position.

const AVATAR_HIDE_MAX_BUDGET_SEC := 30.0
const AVATAR_HIDE_RECHARGE_RATE := 0.2
const AVATAR_HIDE_MIN_START_BUDGET_SEC := 0.1
const PIE_PREF_PATH := "user://playforge_pie_avatar.cfg"

var _handled_scene_id: int = 0
var _active_config: Dictionary = {}
var _pie_disabled := false
var _hud_layer: CanvasLayer
var _hud_bar: PanelContainer
var _hud_menu_panel: PanelContainer
var _hud_menu_open := false
var _hud_embedded_host := false
var _portrait_layer: CanvasLayer
var _portrait_ui: AvatarPortraitUI
var _world_avatar: Node
var _attached_character: Node3D
var _attached_rig: AvatarRig
var _pending_attach_elapsed := 0.0
var _pending_attach := false
var _temp_hidden := false
var _hide_budget_sec := AVATAR_HIDE_MAX_BUDGET_SEC
var _hide_remaining_sec := 0.0
var _hud_temp_hidden := false
var _hud_hide_budget_sec := AVATAR_HIDE_MAX_BUDGET_SEC
var _hud_hide_remaining_sec := 0.0
var _hide_last_tick_usec: int = 0


func _ready() -> void:
	if Engine.is_editor_hint() or Engine.has_singleton("PlayForgePlatform"):
		set_process(false)
		return
	_pie_disabled = _is_pie_preview_disabled()
	if _pie_disabled:
		set_process(false)
		return
	process_mode = Node.PROCESS_MODE_ALWAYS
	set_meta("_playforge_avatar_sealed", true)
	_hide_last_tick_usec = Time.get_ticks_usec()
	_hud_embedded_host = _is_embedded_in_playhub_host()
	call_deferred("_sync_with_current_scene")


func _is_pie_preview_disabled() -> bool:
	# Release PlayHub builds where PlayForgeAvatarRuntime was explicitly injected always run it.
	if not OS.is_debug_build():
		return false
	# Experimental feature default: OFF in debug PIE runs unless explicitly enabled via flag or pref.
	for arg in OS.get_cmdline_user_args():
		var cleaned := arg.strip_edges().to_lower()
		if cleaned == "--playforge-pie-avatar=off" or cleaned == "--playforge-pie-avatar=0":
			return true
		if cleaned == "--playforge-pie-avatar=on" or cleaned == "--playforge-pie-avatar=1":
			return false
	var cfg := ConfigFile.new()
	if cfg.load(PIE_PREF_PATH) == OK:
		return not bool(cfg.get_value("pie", "avatar_and_hud_enabled", false))
	return true


func _is_embedded_in_playhub_host() -> bool:
	if not OS.has_feature("web") or not Engine.has_singleton("JavaScriptBridge"):
		return false
	return bool(JavaScriptBridge.eval("typeof window !== 'undefined' && Boolean(window.PlayHubBridge && window.PlayHubBridge.embedded)", true))


func _process(delta: float) -> void:
	if Engine.is_editor_hint() or Engine.has_singleton("PlayForgePlatform") or _pie_disabled:
		return
	var scene := get_tree().current_scene
	if scene != null and scene.get_instance_id() != _handled_scene_id:
		_sync_with_current_scene()

	if _pending_attach and scene != null and is_instance_valid(scene):
		_pending_attach_elapsed += delta
		if _try_attach_to_player_character(scene):
			_pending_attach = false
		elif _pending_attach_elapsed >= 4.0:
			_pending_attach = false

	_tick_temporary_hide()

	if _attached_character != null and is_instance_valid(_attached_character) and _attached_rig != null and is_instance_valid(_attached_rig):
		_update_attached_rig_motion()


func request_temporary_avatar_hide(duration_sec: float = AVATAR_HIDE_MAX_BUDGET_SEC) -> bool:
	if Engine.is_editor_hint() or _pie_disabled:
		return false
	if Engine.has_singleton("PlayForgePlatform"):
		return bool(Engine.get_singleton("PlayForgePlatform").call("request_temporary_avatar_hide", duration_sec))
	_tick_temporary_hide()
	if is_nan(duration_sec) or is_inf(duration_sec) or duration_sec <= 0.0:
		return false
	var clamped_req := clampf(duration_sec, 0.0, AVATAR_HIDE_MAX_BUDGET_SEC)
	if not _temp_hidden:
		if _hide_budget_sec < AVATAR_HIDE_MIN_START_BUDGET_SEC:
			_apply_avatar_visibility(true)
			return false
		var granted := minf(clamped_req, _hide_budget_sec)
		if granted <= 0.0:
			_apply_avatar_visibility(true)
			return false
		_temp_hidden = true
		_hide_remaining_sec = granted
		_apply_avatar_visibility(false)
		return true
	var next_rem := minf(clamped_req, _hide_budget_sec)
	if next_rem <= 0.0:
		_temp_hidden = false
		_hide_remaining_sec = 0.0
		_apply_avatar_visibility(true)
		return false
	_hide_remaining_sec = next_rem
	_apply_avatar_visibility(false)
	return true


func end_temporary_avatar_hide() -> void:
	if Engine.has_singleton("PlayForgePlatform"):
		Engine.get_singleton("PlayForgePlatform").call("end_temporary_avatar_hide")
		return
	if _pie_disabled:
		return
	_tick_temporary_hide()
	_temp_hidden = false
	_hide_remaining_sec = 0.0
	_apply_avatar_visibility(true)


func is_avatar_temporarily_hidden() -> bool:
	if Engine.has_singleton("PlayForgePlatform"):
		return bool(Engine.get_singleton("PlayForgePlatform").call("is_avatar_temporarily_hidden"))
	_tick_temporary_hide()
	return _temp_hidden


func get_avatar_hide_budget_seconds() -> float:
	if Engine.has_singleton("PlayForgePlatform"):
		return float(Engine.get_singleton("PlayForgePlatform").call("get_avatar_hide_budget_seconds"))
	_tick_temporary_hide()
	return _hide_budget_sec


func get_avatar_hide_remaining_seconds() -> float:
	if Engine.has_singleton("PlayForgePlatform"):
		return float(Engine.get_singleton("PlayForgePlatform").call("get_avatar_hide_remaining_seconds"))
	_tick_temporary_hide()
	return _hide_remaining_sec


func get_avatar_hide_state() -> Dictionary:
	if Engine.has_singleton("PlayForgePlatform"):
		return Engine.get_singleton("PlayForgePlatform").call("get_avatar_hide_state")
	_tick_temporary_hide()
	return {
		"hidden": _temp_hidden,
		"remainingSeconds": _hide_remaining_sec,
		"budgetSeconds": _hide_budget_sec,
		"maxBudgetSeconds": AVATAR_HIDE_MAX_BUDGET_SEC,
		"rechargeRatePerSecond": AVATAR_HIDE_RECHARGE_RATE,
		"minStartBudgetSeconds": AVATAR_HIDE_MIN_START_BUDGET_SEC,
	}


func request_temporary_hud_hide(duration_sec: float = AVATAR_HIDE_MAX_BUDGET_SEC) -> bool:
	if Engine.is_editor_hint() or _pie_disabled:
		return false
	if Engine.has_singleton("PlayForgePlatform"):
		return bool(Engine.get_singleton("PlayForgePlatform").call("request_temporary_hud_hide", duration_sec))
	_tick_temporary_hide()
	if is_nan(duration_sec) or is_inf(duration_sec) or duration_sec <= 0.0:
		return false
	var clamped_req := clampf(duration_sec, 0.0, AVATAR_HIDE_MAX_BUDGET_SEC)
	if not _hud_temp_hidden:
		if _hud_hide_budget_sec < AVATAR_HIDE_MIN_START_BUDGET_SEC:
			_apply_hud_visibility(true)
			return false
		var granted := minf(clamped_req, _hud_hide_budget_sec)
		if granted <= 0.0:
			_apply_hud_visibility(true)
			return false
		_hud_temp_hidden = true
		_hud_hide_remaining_sec = granted
		_apply_hud_visibility(false)
		_notify_host_hud_hide(true, granted)
		return true
	var next_rem := minf(clamped_req, _hud_hide_budget_sec)
	if next_rem <= 0.0:
		_hud_temp_hidden = false
		_hud_hide_remaining_sec = 0.0
		_apply_hud_visibility(true)
		_notify_host_hud_hide(false, 0.0)
		return false
	_hud_hide_remaining_sec = next_rem
	_apply_hud_visibility(false)
	_notify_host_hud_hide(true, next_rem)
	return true


func end_temporary_hud_hide() -> void:
	if Engine.has_singleton("PlayForgePlatform"):
		Engine.get_singleton("PlayForgePlatform").call("end_temporary_hud_hide")
		return
	if _pie_disabled:
		return
	_tick_temporary_hide()
	_hud_temp_hidden = false
	_hud_hide_remaining_sec = 0.0
	_apply_hud_visibility(true)
	_notify_host_hud_hide(false, 0.0)


func is_hud_temporarily_hidden() -> bool:
	if Engine.has_singleton("PlayForgePlatform"):
		return bool(Engine.get_singleton("PlayForgePlatform").call("is_hud_temporarily_hidden"))
	_tick_temporary_hide()
	return _hud_temp_hidden


func get_hud_hide_budget_seconds() -> float:
	if Engine.has_singleton("PlayForgePlatform"):
		return float(Engine.get_singleton("PlayForgePlatform").call("get_hud_hide_budget_seconds"))
	_tick_temporary_hide()
	return _hud_hide_budget_sec


func get_hud_hide_remaining_seconds() -> float:
	if Engine.has_singleton("PlayForgePlatform"):
		return float(Engine.get_singleton("PlayForgePlatform").call("get_hud_hide_remaining_seconds"))
	_tick_temporary_hide()
	return _hud_hide_remaining_sec


func get_hud_hide_state() -> Dictionary:
	if Engine.has_singleton("PlayForgePlatform"):
		return Engine.get_singleton("PlayForgePlatform").call("get_hud_hide_state")
	_tick_temporary_hide()
	return {
		"hidden": _hud_temp_hidden,
		"remainingSeconds": _hud_hide_remaining_sec,
		"budgetSeconds": _hud_hide_budget_sec,
		"maxBudgetSeconds": AVATAR_HIDE_MAX_BUDGET_SEC,
		"rechargeRatePerSecond": AVATAR_HIDE_RECHARGE_RATE,
		"minStartBudgetSeconds": AVATAR_HIDE_MIN_START_BUDGET_SEC,
	}


func request_temporary_platform_ui_hide(duration_sec: float = AVATAR_HIDE_MAX_BUDGET_SEC) -> bool:
	var av_ok := request_temporary_avatar_hide(duration_sec)
	var hud_ok := request_temporary_hud_hide(duration_sec)
	return av_ok or hud_ok


func end_temporary_platform_ui_hide() -> void:
	end_temporary_avatar_hide()
	end_temporary_hud_hide()


func get_active_avatar_state() -> Dictionary:
	return {
		"engineSingleton": Engine.has_singleton("PlayForgePlatform"),
		"pieDisabled": _pie_disabled,
		"config": _active_config.duplicate(true),
		"hasCoreHud": _hud_layer != null and is_instance_valid(_hud_layer),
		"coreHudVisible": _hud_layer != null and is_instance_valid(_hud_layer) and _hud_layer.visible,
		"hasPortrait": _portrait_ui != null and is_instance_valid(_portrait_ui),
		"portraitState": _portrait_ui.get_public_state() if (_portrait_ui != null and is_instance_valid(_portrait_ui)) else {},
		"hasWorldAvatar": _world_avatar != null and is_instance_valid(_world_avatar),
		"worldAvatarName": _world_avatar.name if (_world_avatar != null and is_instance_valid(_world_avatar)) else "",
		"attachedToCharacter": _attached_character != null and is_instance_valid(_attached_character),
		"hideState": get_avatar_hide_state(),
		"hudHideState": get_hud_hide_state(),
	}


func _tick_temporary_hide() -> void:
	var now_usec := Time.get_ticks_usec()
	if _hide_last_tick_usec == 0:
		_hide_last_tick_usec = now_usec
	var dt := float(maxi(0, now_usec - _hide_last_tick_usec)) / 1000000.0
	_hide_last_tick_usec = now_usec

	if _temp_hidden:
		_hide_budget_sec = maxf(0.0, _hide_budget_sec - dt)
		_hide_remaining_sec = maxf(0.0, _hide_remaining_sec - dt)
		if _hide_remaining_sec <= 0.0 or _hide_budget_sec <= 0.0:
			_temp_hidden = false
			_hide_remaining_sec = 0.0
			_apply_avatar_visibility(true)
		else:
			_apply_avatar_visibility(false)
	else:
		_hide_budget_sec = minf(AVATAR_HIDE_MAX_BUDGET_SEC, _hide_budget_sec + dt * AVATAR_HIDE_RECHARGE_RATE)
		_hide_remaining_sec = 0.0
		_apply_avatar_visibility(true)

	if _hud_temp_hidden:
		_hud_hide_budget_sec = maxf(0.0, _hud_hide_budget_sec - dt)
		_hud_hide_remaining_sec = maxf(0.0, _hud_hide_remaining_sec - dt)
		if _hud_hide_remaining_sec <= 0.0 or _hud_hide_budget_sec <= 0.0:
			_hud_temp_hidden = false
			_hud_hide_remaining_sec = 0.0
			_apply_hud_visibility(true)
			_notify_host_hud_hide(false, 0.0)
		else:
			_apply_hud_visibility(false)
	else:
		_hud_hide_budget_sec = minf(AVATAR_HIDE_MAX_BUDGET_SEC, _hud_hide_budget_sec + dt * AVATAR_HIDE_RECHARGE_RATE)
		_hud_hide_remaining_sec = 0.0
		_apply_hud_visibility(true)


func _apply_avatar_visibility(show_avatar: bool) -> void:
	if _world_avatar != null and is_instance_valid(_world_avatar):
		if _world_avatar.has_method("set_authorized_hidden"):
			_world_avatar.call("set_authorized_hidden", not show_avatar)
		if _world_avatar is Node3D and (_world_avatar as Node3D).visible != show_avatar:
			(_world_avatar as Node3D).visible = show_avatar
	if _portrait_layer != null and is_instance_valid(_portrait_layer) and _portrait_layer.visible != show_avatar:
		_portrait_layer.visible = show_avatar
	if _portrait_ui != null and is_instance_valid(_portrait_ui):
		if _portrait_ui.has_method("set_authorized_hidden"):
			_portrait_ui.call("set_authorized_hidden", not show_avatar)
		if _portrait_ui.visible != show_avatar:
			_portrait_ui.visible = show_avatar


func _apply_hud_visibility(show_hud: bool) -> void:
	if _hud_embedded_host or _pie_disabled:
		return
	if _hud_layer == null or not is_instance_valid(_hud_layer) or _hud_bar == null or not is_instance_valid(_hud_bar):
		_ensure_core_hud()
	if _hud_layer != null and is_instance_valid(_hud_layer):
		if _hud_layer.layer != 120:
			_hud_layer.layer = 120
		if _hud_layer.visible != show_hud:
			_hud_layer.visible = show_hud
	if _hud_bar != null and is_instance_valid(_hud_bar):
		if _hud_bar.visible != show_hud:
			_hud_bar.visible = show_hud
		if _hud_bar.position != Vector2(10.0, 10.0):
			_hud_bar.position = Vector2(10.0, 10.0)
		if _hud_bar.modulate != Color.WHITE:
			_hud_bar.modulate = Color.WHITE
		if _hud_bar.self_modulate != Color.WHITE:
			_hud_bar.self_modulate = Color.WHITE
		if _hud_bar.scale != Vector2.ONE:
			_hud_bar.scale = Vector2.ONE
	if not show_hud and _hud_menu_panel != null and is_instance_valid(_hud_menu_panel):
		_hud_menu_open = false
		_hud_menu_panel.visible = false


func _notify_host_hud_hide(hidden: bool, duration_sec: float) -> void:
	if not _hud_embedded_host or not OS.has_feature("web") or not Engine.has_singleton("JavaScriptBridge"):
		return
	if hidden:
		JavaScriptBridge.eval("window.PlayHubBridge && window.PlayHubBridge.requestTemporaryHudHide && window.PlayHubBridge.requestTemporaryHudHide(%f);" % duration_sec, true)
	else:
		JavaScriptBridge.eval("window.PlayHubBridge && window.PlayHubBridge.endTemporaryHudHide && window.PlayHubBridge.endTemporaryHudHide();", true)


func _ensure_core_hud() -> void:
	if _hud_embedded_host or _pie_disabled:
		return
	if _hud_layer != null and is_instance_valid(_hud_layer) and _hud_bar != null and is_instance_valid(_hud_bar):
		return
	if _hud_layer != null and is_instance_valid(_hud_layer):
		_hud_layer.queue_free()
	var root := get_tree().root
	if root == null:
		return
	_hud_layer = CanvasLayer.new()
	_hud_layer.name = "PlayForgeCoreHUD"
	_hud_layer.layer = 120
	_hud_layer.process_mode = Node.PROCESS_MODE_ALWAYS
	_hud_layer.set_meta("_playforge_avatar_sealed", true)
	root.add_child(_hud_layer)

	var bar := PanelContainer.new()
	bar.name = "PlayHubPlatformBar"
	bar.position = Vector2(10.0, 10.0)
	bar.focus_mode = Control.FOCUS_NONE
	_hud_bar = bar
	var bar_style := StyleBoxFlat.new()
	bar_style.bg_color = Color(0.067, 0.149, 0.125, 0.92)
	bar_style.border_color = Color(0.871, 0.925, 0.651, 0.65)
	bar_style.set_border_width_all(1)
	bar_style.set_corner_radius_all(10)
	bar_style.content_margin_left = 8.0
	bar_style.content_margin_right = 8.0
	bar_style.content_margin_top = 4.0
	bar_style.content_margin_bottom = 4.0
	bar.add_theme_stylebox_override("panel", bar_style)
	_hud_layer.add_child(bar)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	bar.add_child(row)

	var brand_btn := Button.new()
	brand_btn.text = "PLAY HUB"
	brand_btn.focus_mode = Control.FOCUS_NONE
	brand_btn.add_theme_font_size_override("font_size", 12)
	var brand_style := StyleBoxFlat.new()
	brand_style.bg_color = Color(0.871, 0.925, 0.651, 1.0)
	brand_style.set_corner_radius_all(6)
	brand_style.content_margin_left = 8.0
	brand_style.content_margin_right = 8.0
	brand_style.content_margin_top = 3.0
	brand_style.content_margin_bottom = 3.0
	brand_btn.add_theme_stylebox_override("normal", brand_style)
	brand_btn.add_theme_stylebox_override("hover", brand_style)
	brand_btn.add_theme_stylebox_override("pressed", brand_style)
	brand_btn.add_theme_color_override("font_color", Color(0.063, 0.141, 0.118, 1.0))
	brand_btn.add_theme_color_override("font_hover_color", Color(0.063, 0.141, 0.118, 1.0))
	brand_btn.pressed.connect(func() -> void:
		_hud_menu_open = not _hud_menu_open
		if _hud_menu_panel != null and is_instance_valid(_hud_menu_panel):
			_hud_menu_panel.visible = _hud_menu_open
	)
	row.add_child(brand_btn)

	var emote_btn := Button.new()
	emote_btn.text = "EMOTE"
	emote_btn.focus_mode = Control.FOCUS_NONE
	emote_btn.add_theme_font_size_override("font_size", 11)
	emote_btn.pressed.connect(func() -> void:
		if _world_avatar != null and is_instance_valid(_world_avatar) and _world_avatar.has_method("play_emote_slot"):
			_world_avatar.call("play_emote_slot", 0)
		if _portrait_ui != null and is_instance_valid(_portrait_ui):
			_portrait_ui.play_emote_slot(0)
	)
	row.add_child(emote_btn)

	_hud_menu_panel = PanelContainer.new()
	_hud_menu_panel.name = "PlayHubPlatformMenu"
	_hud_menu_panel.position = Vector2(10.0, 48.0)
	_hud_menu_panel.visible = false
	_hud_menu_panel.add_theme_stylebox_override("panel", bar_style)
	_hud_layer.add_child(_hud_menu_panel)

	var menu_col := VBoxContainer.new()
	menu_col.add_theme_constant_override("separation", 4)
	_hud_menu_panel.add_child(menu_col)

	var header := Label.new()
	header.text = "PLAY HUB OVERLAY"
	header.add_theme_font_size_override("font_size", 11)
	header.add_theme_color_override("font_color", Color(0.871, 0.925, 0.651, 1.0))
	menu_col.add_child(header)

	var close_btn := Button.new()
	close_btn.text = "CLOSE"
	close_btn.focus_mode = Control.FOCUS_NONE
	close_btn.add_theme_font_size_override("font_size", 11)
	close_btn.pressed.connect(func() -> void:
		_hud_menu_open = false
		_hud_menu_panel.visible = false
	)
	menu_col.add_child(close_btn)


func _sync_with_current_scene() -> void:
	if _pie_disabled:
		return
	var scene := get_tree().current_scene
	if scene == null or not is_instance_valid(scene):
		return
	_ensure_core_hud()
	_handled_scene_id = scene.get_instance_id()
	_world_avatar = null
	_attached_character = null
	_attached_rig = null
	_pending_attach = false
	_pending_attach_elapsed = 0.0

	var cfg := _resolve_config(scene)
	_active_config = cfg
	var mode: int = int(cfg.get("presentation_mode", 0))
	var portrait_size: Vector2 = cfg.get("portrait_size", Vector2.ZERO)
	var portrait_corner: int = int(cfg.get("portrait_corner", 0))
	var portrait_custom_pos: Vector2 = cfg.get("portrait_custom_position", Vector2(-1.0, -1.0))

	if mode == 1 or mode == 2:
		var framing := AvatarPortraitUI.PortraitFraming.FULL_BODY if mode == 2 else AvatarPortraitUI.PortraitFraming.UPPER_BODY
		_ensure_portrait_ui(int(framing), portrait_size, portrait_corner, portrait_custom_pos)
		return

	if mode == 3:
		_ensure_portrait_ui(int(AvatarPortraitUI.PortraitFraming.UPPER_BODY), portrait_size, portrait_corner, portrait_custom_pos)
	else:
		_remove_portrait_ui()

	if _is_3d_scene(scene):
		_ensure_world_avatar(scene, cfg)
	elif _portrait_ui == null or not is_instance_valid(_portrait_ui):
		# Mandatory PlayHub Avatar fallback for 2D scenes if mode=0 was left unset
		_ensure_portrait_ui(int(AvatarPortraitUI.PortraitFraming.UPPER_BODY), portrait_size, portrait_corner, portrait_custom_pos)


func _resolve_config(scene: Node) -> Dictionary:
	var is_3d := _is_3d_scene(scene)
	var mode := 0 if is_3d else 1
	var camera_mode := 0
	var spawn_position := Vector3(0.0, 0.2, 0.0)
	var world_binding := "standalone"
	var portrait_size := Vector2(144.0, 144.0) if not is_3d else Vector2(192.0, 192.0)
	var portrait_corner := 0
	var portrait_custom_pos := Vector2(-1.0, -1.0)

	# 1. ProjectSettings defaults ([playforge] section in project.godot)
	if ProjectSettings.has_setting("playforge/avatar/presentation_mode"):
		mode = clampi(int(ProjectSettings.get_setting("playforge/avatar/presentation_mode")), 0, 3)
	if ProjectSettings.has_setting("playforge/avatar/camera_mode"):
		camera_mode = clampi(int(ProjectSettings.get_setting("playforge/avatar/camera_mode")), 0, 2)
	if ProjectSettings.has_setting("playforge/avatar/spawn_position"):
		var sp: Variant = ProjectSettings.get_setting("playforge/avatar/spawn_position")
		if sp is Vector3:
			spawn_position = sp
	if ProjectSettings.has_setting("playforge/avatar/world_binding"):
		world_binding = str(ProjectSettings.get_setting("playforge/avatar/world_binding")).strip_edges().to_lower()
	if ProjectSettings.has_setting("playforge/avatar/portrait_size"):
		var ps: Variant = ProjectSettings.get_setting("playforge/avatar/portrait_size")
		if ps is Vector2:
			portrait_size = ps
	if ProjectSettings.has_setting("playforge/avatar/portrait_corner"):
		portrait_corner = clampi(int(ProjectSettings.get_setting("playforge/avatar/portrait_corner")), 0, 4)
	if ProjectSettings.has_setting("playforge/avatar/portrait_custom_position"):
		var cp: Variant = ProjectSettings.get_setting("playforge/avatar/portrait_custom_position")
		if cp is Vector2:
			portrait_custom_pos = cp

	# 2. Scene PlayForgeAvatarSpawn override
	var spawn_node := _find_script_node(scene, "addons/playforge_avatar/avatar_spawn.gd")
	if spawn_node != null:
		var pm: Variant = spawn_node.get("presentation_mode")
		if pm is int:
			mode = clampi(pm, 0, 3)
		var cm: Variant = spawn_node.get("camera_mode")
		if cm is int:
			camera_mode = clampi(cm, 0, 2)
		var sps: Variant = spawn_node.get("portrait_size")
		if sps is Vector2:
			portrait_size = sps
		var spc: Variant = spawn_node.get("portrait_corner")
		if spc is int:
			portrait_corner = clampi(spc, 0, 4)
		if spawn_node is Node3D:
			spawn_position = (spawn_node as Node3D).global_position

	# 3. CLI preview overrides
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--avatar-presentation-mode="):
			var val := arg.substr("--avatar-presentation-mode=".length()).strip_edges().to_lower()
			match val:
				"world_3d", "0": mode = 0
				"upper_body", "portrait_upper_body", "1": mode = 1
				"full_body", "portrait_full_body", "2": mode = 2
				"hybrid", "world_3d_with_portrait", "3": mode = 3
		elif arg.begins_with("--avatar-portrait-size="):
			var parts := arg.substr("--avatar-portrait-size=".length()).strip_edges().to_lower().split("x")
			if parts.size() == 2:
				portrait_size = Vector2(float(parts[0]), float(parts[1]))
		elif arg.begins_with("--avatar-portrait-corner="):
			var cval := arg.substr("--avatar-portrait-corner=".length()).strip_edges().to_lower()
			match cval:
				"bottom_left", "0": portrait_corner = 0
				"top_right", "1": portrait_corner = 1
				"bottom_right", "2": portrait_corner = 2
				"top_left", "top_left_below_hud", "3": portrait_corner = 3
				"custom", "4": portrait_corner = 4

	return {
		"presentation_mode": mode,
		"camera_mode": camera_mode,
		"spawn_position": spawn_position,
		"world_binding": world_binding,
		"portrait_size": portrait_size,
		"portrait_corner": portrait_corner,
		"portrait_custom_position": portrait_custom_pos,
	}


func _ensure_portrait_ui(framing: int, portrait_size: Vector2, corner: int, custom_pos: Vector2) -> void:
	var root := get_tree().root
	if root == null:
		return
	var existing_portrait := _find_script_node(root, "addons/playforge_avatar/avatar_portrait_ui.gd")
	if existing_portrait is AvatarPortraitUI and existing_portrait != _portrait_ui:
		_portrait_ui = existing_portrait as AvatarPortraitUI
		_portrait_ui.configure_portrait(framing, portrait_size, corner, custom_pos)
		return
	if _portrait_layer == null or not is_instance_valid(_portrait_layer):
		_portrait_layer = CanvasLayer.new()
		_portrait_layer.name = "PlayForgePortraitLayer"
		_portrait_layer.layer = 100
		_portrait_layer.process_mode = Node.PROCESS_MODE_ALWAYS
		_portrait_layer.set_meta("_playforge_avatar_sealed", true)
		root.add_child(_portrait_layer)
	if _portrait_ui == null or not is_instance_valid(_portrait_ui):
		_portrait_ui = AvatarPortraitUI.new()
		_portrait_ui.name = "PlayForgeAvatarPortraitUI"
		_portrait_layer.add_child(_portrait_ui)
	_portrait_ui.configure_portrait(framing, portrait_size, corner, custom_pos)


func _remove_portrait_ui() -> void:
	if _portrait_layer != null and is_instance_valid(_portrait_layer):
		_portrait_layer.queue_free()
	_portrait_layer = null
	_portrait_ui = null


func _ensure_world_avatar(scene: Node, cfg: Dictionary) -> void:
	var binding := str(cfg.get("world_binding", "standalone"))
	if binding == "attach_player_character":
		if not _try_attach_to_player_character(scene):
			_pending_attach = true
			_pending_attach_elapsed = 0.0
		return

	var existing_ctrl := _find_script_node(scene, "addons/playforge_avatar/avatar_controller.gd")
	if existing_ctrl != null:
		_world_avatar = existing_ctrl
		return

	var spawn_node := _find_script_node(scene, "addons/playforge_avatar/avatar_spawn.gd")
	if spawn_node != null and spawn_node.has_method("spawn_avatar"):
		_world_avatar = spawn_node.call("spawn_avatar")
		return

	# Ensure floor collision + lighting for blank/minimal 3D templates
	if not _has_type_recursive(scene, CollisionObject3D):
		var floor_body := StaticBody3D.new()
		floor_body.name = "PlayForgeBaseplateFloor"
		var col := CollisionShape3D.new()
		var box_shape := BoxShape3D.new()
		box_shape.size = Vector3(48.0, 1.0, 48.0)
		col.shape = box_shape
		col.position = Vector3(0.0, -0.5, 0.0)
		floor_body.add_child(col)
		if not _has_type_recursive(scene, MeshInstance3D):
			var mi := MeshInstance3D.new()
			var box_mesh := BoxMesh.new()
			box_mesh.size = Vector3(48.0, 1.0, 48.0)
			var mat := StandardMaterial3D.new()
			mat.albedo_color = Color(0.24, 0.30, 0.34)
			mat.roughness = 0.85
			box_mesh.material = mat
			mi.mesh = box_mesh
			mi.position = Vector3(0.0, -0.5, 0.0)
			floor_body.add_child(mi)
		scene.add_child(floor_body)

	if not _has_type_recursive(scene, Light3D):
		var sun := DirectionalLight3D.new()
		sun.name = "PlayForgeDefaultLight"
		sun.rotation_degrees = Vector3(-48.0, -32.0, 0.0)
		scene.add_child(sun)

	var ctrl := AvatarController.new()
	ctrl.name = "PlayForgePlayerAvatar"
	ctrl.camera_mode = clampi(int(cfg.get("camera_mode", 0)), 0, 2) as AvatarController.CameraMode
	ctrl.position = cfg.get("spawn_position", Vector3(0.0, 0.2, 0.0))
	scene.add_child(ctrl)
	_world_avatar = ctrl


func _try_attach_to_player_character(scene: Node) -> bool:
	var target := _find_node_by_name(scene, "PlayerCharacter")
	if not target is Node3D:
		return false
	var char_node := target as Node3D
	var existing := char_node.get_node_or_null("PlayForgePlayerAvatar")
	if existing != null:
		_attached_character = char_node
		_world_avatar = existing
		return true

	var rig := AvatarRig.new()
	rig.name = "PlayForgePlayerAvatar"
	rig.position = Vector3(0.0, -0.75, 0.0)
	rig.set_meta("_playforge_avatar_sealed", true)
	char_node.add_child(rig)

	var catalog := AvatarCatalog.new()
	catalog.load_catalog()
	var bridge := AvatarBridge.new()
	bridge.name = "SealedAttachBridge"
	bridge.set_meta("_playforge_avatar_sealed", true)
	bridge.initialize(catalog)
	bridge.loadout_resolved.connect(func(loadout: Dictionary) -> void:
		if not is_instance_valid(rig) or not is_instance_valid(char_node):
			return
		var summary := rig.apply_sealed_loadout(loadout)
		if bool(summary.get("ok", false)):
			for child in char_node.get_children():
				if child is MeshInstance3D and not bool(child.get_meta("_playforge_avatar_sealed", false)):
					if (child as MeshInstance3D).mesh is CapsuleMesh:
						(child as MeshInstance3D).visible = false
	)
	rig.add_child(bridge)
	bridge.request_player_loadout()

	_attached_character = char_node
	_attached_rig = rig
	_world_avatar = rig
	return true


func _update_attached_rig_motion() -> void:
	if not _attached_character is CharacterBody3D:
		return
	var body := _attached_character as CharacterBody3D
	var horiz := Vector2(body.velocity.x, body.velocity.z)
	var speed := horiz.length()
	if not body.is_on_floor() and absf(body.velocity.y) > 0.6:
		_attached_rig.play_locomotion_state("jump")
	elif speed > 4.5:
		_attached_rig.play_locomotion_state("run")
	elif speed > 0.25:
		_attached_rig.play_locomotion_state("walk")
	else:
		_attached_rig.play_locomotion_state("idle")
	if speed > 0.25:
		_attached_rig.rotation.y = atan2(-body.velocity.x, -body.velocity.z)


static func _is_3d_scene(scene: Node) -> bool:
	if scene is Node3D:
		return true
	for child in scene.get_children():
		if child is Node3D:
			return true
	return false


static func _find_script_node(root: Node, suffix: String) -> Node:
	if root == null:
		return null
	var scr: Variant = root.get_script()
	if scr is Script and str((scr as Script).resource_path).ends_with(suffix):
		return root
	for child in root.get_children():
		var found := _find_script_node(child, suffix)
		if found != null:
			return found
	return null


static func _find_node_by_name(root: Node, target_name: String) -> Node:
	if root == null:
		return null
	if root.name == target_name:
		return root
	for child in root.get_children():
		var found := _find_node_by_name(child, target_name)
		if found != null:
			return found
	return null


static func _has_type_recursive(root: Node, type_class: Variant) -> bool:
	if root == null:
		return false
	if is_instance_of(root, type_class):
		return true
	for child in root.get_children():
		if _has_type_recursive(child, type_class):
			return true
	return false
