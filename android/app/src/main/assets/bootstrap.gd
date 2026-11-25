extends Control

func _ready() -> void:
	var launch_mode := "game"
	if FileAccess.file_exists("user://playhub_launch_mode.txt"):
		var mf := FileAccess.open("user://playhub_launch_mode.txt", FileAccess.READ)
		if mf != null:
			launch_mode = mf.get_as_text().strip_edges()
			mf.close()
	if launch_mode.is_empty() and Engine.has_singleton("PlayHubBridge"):
		var bridge := Engine.get_singleton("PlayHubBridge")
		if bridge != null:
			launch_mode = str(bridge.call("get_launch_mode")).strip_edges()

	print("PlayHubBootstrap: launch_mode=", launch_mode)
	if launch_mode == "avatar_studio":
		call_deferred("_launch_avatar_studio")
		return

	var label := Label.new()
	label.text = "Play Hub · Loading Godot 4.7.2 Game Pack..."
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(label)

	call_deferred("_mount_and_launch", label)

func _launch_avatar_studio() -> void:
	var script_res: Resource = ResourceLoader.load("res://avatar_studio.gd")
	if script_res == null or not (script_res is Script):
		push_error("PlayHubBootstrap: failed to load res://avatar_studio.gd")
		return
	var studio_node: Node = (script_res as Script).new()
	studio_node.name = "AvatarStudioRoot"
	get_tree().root.add_child(studio_node)
	queue_free()

func _read_project_binary(path: String) -> Dictionary:
	var result := {}
	if not FileAccess.file_exists(path):
		return result
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return result
	var hdr := f.get_buffer(4)
	if hdr.size() < 4 or hdr.get_string_from_ascii() != "ECFG":
		f.close()
		return result
	var count := f.get_32()
	for _i in range(count):
		if f.eof_reached():
			break
		var slen := f.get_32()
		var key_bytes := f.get_buffer(slen)
		var key := key_bytes.get_string_from_utf8()
		var vlen := f.get_32()
		var val_bytes := f.get_buffer(vlen)
		var val: Variant = bytes_to_var(val_bytes)
		result[key] = val
	f.close()
	return result

func _read_project_text(path: String) -> Dictionary:
	var result := {}
	var cfg := ConfigFile.new()
	if cfg.load(path) != OK:
		return result
	for section in cfg.get_sections():
		for k in cfg.get_section_keys(section):
			result["%s/%s" % [section, k]] = cfg.get_value(section, k)
	return result

func _apply_game_display_settings(settings: Dictionary) -> void:
	var vp_w := int(settings.get("display/window/size/viewport_width", 1280))
	var vp_h := int(settings.get("display/window/size/viewport_height", 720))
	if vp_w <= 0:
		vp_w = 1280
	if vp_h <= 0:
		vp_h = 720

	var mode_str := str(settings.get("display/window/stretch/mode", "canvas_items")).strip_edges().to_lower()
	var scale_mode := Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	if mode_str == "viewport":
		scale_mode = Window.CONTENT_SCALE_MODE_VIEWPORT
	elif mode_str == "disabled":
		scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS

	var aspect_str := str(settings.get("display/window/stretch/aspect", "keep")).strip_edges().to_lower()
	var scale_aspect := Window.CONTENT_SCALE_ASPECT_KEEP
	match aspect_str:
		"keep_width":
			scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP_WIDTH
		"keep_height":
			scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP_HEIGHT
		"expand":
			scale_aspect = Window.CONTENT_SCALE_ASPECT_EXPAND
		"ignore":
			scale_aspect = Window.CONTENT_SCALE_ASPECT_IGNORE
		_:
			scale_aspect = Window.CONTENT_SCALE_ASPECT_KEEP

	var root_win := get_tree().root
	if root_win != null:
		root_win.content_scale_size = Vector2i(vp_w, vp_h)
		root_win.content_scale_mode = scale_mode
		root_win.content_scale_aspect = scale_aspect
		print("PlayHubBootstrap: applied viewport=", vp_w, "x", vp_h, " mode=", mode_str, " aspect=", aspect_str)

	var clear_col: Variant = settings.get("rendering/environment/defaults/default_clear_color", null)
	if clear_col is Color:
		RenderingServer.set_default_clear_color(clear_col)

	if vp_h > vp_w:
		DisplayServer.screen_set_orientation(DisplayServer.SCREEN_PORTRAIT)
	else:
		DisplayServer.screen_set_orientation(DisplayServer.SCREEN_SENSOR_LANDSCAPE)

func _register_autoloads(settings: Dictionary) -> void:
	for full_key in settings.keys():
		var key_str := str(full_key)
		if not key_str.begins_with("autoload/"):
			continue
		var node_name := key_str.trim_prefix("autoload/")
		if node_name.is_empty() or get_tree().root.get_node_or_null(node_name) != null:
			continue
		var script_path := str(settings[full_key]).trim_prefix("*")
		if script_path.is_empty() or not ResourceLoader.exists(script_path):
			continue
		var res: Resource = ResourceLoader.load(script_path)
		if res is PackedScene:
			var inst: Node = (res as PackedScene).instantiate()
			if inst != null:
				inst.name = node_name
				get_tree().root.add_child(inst)
		elif res is Script:
			var inst_obj: Variant = (res as Script).new()
			if inst_obj is Node:
				var inst_node: Node = inst_obj
				inst_node.name = node_name
				get_tree().root.add_child(inst_node)

func _mount_and_launch(label: Label) -> void:
	var pck_path := ""
	if Engine.has_singleton("PlayHubBridge"):
		var bridge := Engine.get_singleton("PlayHubBridge")
		if bridge != null and bridge.has_method("get_launch_pck_path"):
			pck_path = str(bridge.call("get_launch_pck_path")).strip_edges()

	if pck_path.is_empty() and FileAccess.file_exists("user://playhub_launch.txt"):
		var f := FileAccess.open("user://playhub_launch.txt", FileAccess.READ)
		if f != null:
			pck_path = f.get_as_text().strip_edges()
			f.close()

	if pck_path.is_empty() or not FileAccess.file_exists(pck_path):
		label.text = "Play Hub: .pck not found (%s)" % pck_path
		push_error("PlayHubBootstrap: missing pck_path=" + pck_path)
		return

	var ok := ProjectSettings.load_resource_pack(pck_path, true)
	if not ok:
		label.text = "Play Hub: Failed to mount .pck"
		push_error("PlayHubBootstrap: load_resource_pack failed for " + pck_path)
		return

	# Exported .pck ships res://project.binary (ECFG); fallback to plain-text res://project.godot.
	var game_settings := _read_project_binary("res://project.binary")
	if game_settings.is_empty():
		game_settings = _read_project_text("res://project.godot")

	_apply_game_display_settings(game_settings)
	_register_autoloads(game_settings)

	var main_scene := str(game_settings.get("application/run/main_scene", ""))
	if main_scene.is_empty() or main_scene == "res://bootstrap.tscn":
		for candidate in ["res://scenes/main.tscn", "res://main.tscn", "res://Scenes/Main.tscn", "res://Scenes/main.tscn", "res://Main.tscn"]:
			if ResourceLoader.exists(candidate):
				main_scene = candidate
				break

	if main_scene.is_empty() or main_scene == "res://bootstrap.tscn":
		label.text = "Play Hub: No entry scene found in .pck"
		push_error("PlayHubBootstrap: could not resolve game main_scene")
		return

	print("PlayHubBootstrap: mounted=", pck_path, " main_scene=", main_scene)
	var err := get_tree().change_scene_to_file(main_scene)
	if err != OK:
		label.text = "Play Hub: Failed to open scene %s (err=%d)" % [main_scene, err]
		push_error("PlayHubBootstrap: change_scene_to_file failed err=" + str(err))
