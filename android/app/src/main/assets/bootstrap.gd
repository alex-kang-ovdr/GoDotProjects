extends Control

func _ready() -> void:
	var label := Label.new()
	label.text = "Play Hub · Loading Godot 4.7.2 Game Pack..."
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(label)

	call_deferred("_mount_and_launch", label)

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

	var cfg := ConfigFile.new()
	var main_scene := ""
	if cfg.load("res://project.godot") == OK:
		main_scene = str(cfg.get_value("application", "run/main_scene", ""))
		# Load any autoload singletons declared by the game pack before changing scene
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
		# Exported Godot .pck files ship res://project.binary rather than plain-text project.godot.
		# Probe standard main scene candidates inside the newly mounted pack.
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
