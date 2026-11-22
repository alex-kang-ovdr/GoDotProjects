extends Control
## PlayHub Desktop Player Bootstrap Scene (Godot 4.7.2)
## Mounts --playhub-game=<pck>, installs universal overlay, reports first_frame over IPC.

const OverlayScript := preload("res://overlay.gd")

var _label: Label = null
var _mounted_pck: String = ""
var _target_scene: String = ""
var _frames_seen: int = 0
var _reported: bool = false

func _ready() -> void:
	_label = Label.new()
	_label.text = "Play Hub Desktop · Loading Game Pack..."
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_label.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_label)

	# Keep universal overlay alive across scene transitions
	if get_tree().root.get_node_or_null("PlayHubOverlay") == null:
		var overlay := CanvasLayer.new()
		overlay.name = "PlayHubOverlay"
		overlay.set_script(OverlayScript)
		get_tree().root.call_deferred("add_child", overlay)

	call_deferred("_mount_and_launch")

func _mount_and_launch() -> void:
	if PlayHubDesktopBridge.get_launch_mode() == "avatar-studio":
		_mount_and_launch_avatar_studio()
		return
	var pck_path := PlayHubDesktopBridge.get_launch_pck_path()
	if pck_path.is_empty():
		# No game pck passed: stay in bootstrap scene and report first_frame (used for runtime PoC / test modes)
		_label.text = "Play Hub Desktop Runtime Ready (No .pck specified)"
		_target_scene = "res://bootstrap.tscn"
		return

	if not FileAccess.file_exists(pck_path):
		_label.text = "Play Hub: .pck not found (%s)" % pck_path
		push_error("PlayHubDesktopBootstrap: missing pck_path=" + pck_path)
		if PlayHubDesktopBridge.test_mode != "normal":
			get_tree().quit(21)
		return

	var t_mount_start := Time.get_ticks_msec()
	var ok := ProjectSettings.load_resource_pack(pck_path, true)
	var mount_ms := int(Time.get_ticks_msec() - t_mount_start)
	if not ok:
		_label.text = "Play Hub: Failed to mount .pck"
		push_error("PlayHubDesktopBootstrap: load_resource_pack failed for " + pck_path)
		if PlayHubDesktopBridge.test_mode != "normal":
			get_tree().quit(22)
		return

	_mounted_pck = pck_path
	var main_scene := _resolve_main_scene()
	if main_scene.is_empty():
		_label.text = "Play Hub: No entry scene found in .pck"
		push_error("PlayHubDesktopBootstrap: could not resolve game main_scene")
		if PlayHubDesktopBridge.test_mode != "normal":
			get_tree().quit(23)
		return

	_target_scene = main_scene
	print("PlayHubDesktopBootstrap: mounted=", pck_path, " main_scene=", main_scene, " mount_ms=", mount_ms)

	var t_scene_start := Time.get_ticks_msec()
	var err := get_tree().change_scene_to_file(main_scene)
	var scene_ms := int(Time.get_ticks_msec() - t_scene_start)
	if err != OK:
		_label.text = "Play Hub: Failed to open scene %s (err=%d)" % [main_scene, err]
		push_error("PlayHubDesktopBootstrap: change_scene_to_file failed err=" + str(err))
		if PlayHubDesktopBridge.test_mode != "normal":
			get_tree().quit(24)
		return

	PlayHubDesktopBridge.notify_first_frame(_target_scene, _mounted_pck, mount_ms, scene_ms)
	_reported = true

func _mount_and_launch_avatar_studio() -> void:
	var core_pck := PlayHubDesktopBridge.get_core_pack_path()
	var mount_ms := 0
	if not core_pck.is_empty():
		if not FileAccess.file_exists(core_pck):
			_label.text = "Play Hub: Avatar Core Pack not found (%s)" % core_pck
			push_error("PlayHubDesktopBootstrap: missing core_pack=" + core_pck)
			if PlayHubDesktopBridge.test_mode != "normal":
				get_tree().quit(25)
			return
		var t_mount := Time.get_ticks_msec()
		var ok := ProjectSettings.load_resource_pack(core_pck, true)
		mount_ms = int(Time.get_ticks_msec() - t_mount)
		if not ok:
			_label.text = "Play Hub: Failed to mount Avatar Core Pack"
			push_error("PlayHubDesktopBootstrap: load_resource_pack failed for " + core_pck)
			if PlayHubDesktopBridge.test_mode != "normal":
				get_tree().quit(26)
			return
		_mounted_pck = core_pck

	var studio_scene := "res://addons/playforge_avatar/avatar_studio.tscn"
	if not ResourceLoader.exists(studio_scene):
		_label.text = "Play Hub: Avatar Studio scene unavailable"
		push_error("PlayHubDesktopBootstrap: missing " + studio_scene)
		if PlayHubDesktopBridge.test_mode != "normal":
			get_tree().quit(27)
		return

	_target_scene = studio_scene
	var t_scene := Time.get_ticks_msec()
	var err := get_tree().change_scene_to_file(studio_scene)
	var scene_ms := int(Time.get_ticks_msec() - t_scene)
	if err != OK:
		_label.text = "Play Hub: Failed to open Avatar Studio (err=%d)" % err
		push_error("PlayHubDesktopBootstrap: change_scene_to_file(avatar_studio) failed err=" + str(err))
		if PlayHubDesktopBridge.test_mode != "normal":
			get_tree().quit(28)
		return

	PlayHubDesktopBridge.notify_first_frame(_target_scene, _mounted_pck, mount_ms, scene_ms)
	_reported = true

func _process(_delta: float) -> void:
	if _reported:
		return
	_frames_seen += 1
	if _frames_seen >= 2 and not _target_scene.is_empty():
		PlayHubDesktopBridge.notify_first_frame(_target_scene, _mounted_pck)
		_reported = true

func _resolve_main_scene() -> String:
	var cfg := ConfigFile.new()
	var main_scene := ""
	if cfg.load("res://project.godot") == OK:
		main_scene = str(cfg.get_value("application", "run/main_scene", ""))
		if cfg.has_section("autoload"):
			for key in cfg.get_section_keys("autoload"):
				var raw_val := str(cfg.get_value("autoload", key, ""))
				var script_path := raw_val.trim_prefix("*")
				if not script_path.is_empty() and ResourceLoader.exists(script_path) and get_tree().root.get_node_or_null(str(key)) == null:
					var res: Resource = ResourceLoader.load(script_path)
					if res is PackedScene:
						var inst: Node = (res as PackedScene).instantiate()
						if inst != null:
							inst.name = str(key)
							get_tree().root.add_child(inst)
					elif res is Script:
						var inst_obj: Variant = (res as Script).new()
						if inst_obj is Node:
							var inst_node: Node = inst_obj
							inst_node.name = str(key)
							get_tree().root.add_child(inst_node)

	if main_scene.is_empty() or main_scene == "res://bootstrap.tscn":
		for candidate in [
			"res://scenes/main.tscn",
			"res://main.tscn",
			"res://Scenes/Main.tscn",
			"res://Scenes/main.tscn",
			"res://Main.tscn",
		]:
			if ResourceLoader.exists(candidate):
				main_scene = candidate
				break

	if main_scene == "res://bootstrap.tscn":
		return ""
	return main_scene
