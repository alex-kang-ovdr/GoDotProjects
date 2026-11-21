extends Control
## Play Hub iOS Single-Process Warm Bootstrap & 7-Step Clean Reset Controller (Godot 4.7.2)
## Zero starter games bundled — mounts verified On-Demand .pck files and cleanly resets between games.

const BRIDGE_SINGLETON := "PlayHubBridge"
const STANDBY_SCENE := "res://idle_standby.tscn"
const BOOTSTRAP_SCENE := "res://bootstrap.tscn"

var _initial_root_names: PackedStringArray = PackedStringArray()
var _initial_input_actions: PackedStringArray = PackedStringArray()
var _initial_audio_bus_count: int = 1
var _bridge: Object = null

func _ready() -> void:
	_capture_baseline_state()

	var label := Label.new()
	label.text = "Play Hub · Godot 4.7.2 iOS Runtime Ready"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(label)

	if Engine.has_singleton(BRIDGE_SINGLETON):
		_bridge = Engine.get_singleton(BRIDGE_SINGLETON)
		if _bridge != null and _bridge.has_signal("bridge_event"):
			_bridge.connect("bridge_event", Callable(self, "_on_bridge_event"))

	call_deferred("_mount_and_launch", label)

func _capture_baseline_state() -> void:
	if _initial_root_names.is_empty():
		for child in get_tree().root.get_children():
			_initial_root_names.append(String(child.name))
	if _initial_input_actions.is_empty():
		for action in InputMap.get_actions():
			_initial_input_actions.append(String(action))
	_initial_audio_bus_count = AudioServer.bus_count

func _on_bridge_event(event_type: String, payload_json: String) -> void:
	match event_type:
		"host_clean_reset":
			call_deferred("_perform_clean_reset")
		"host_mount_pck":
			var parsed: Variant = JSON.parse_string(payload_json)
			if parsed is Dictionary:
				var pck_path := str(parsed.get("pckPath", "")).strip_edges()
				if not pck_path.is_empty():
					call_deferred("_mount_path", pck_path, null)

func _mount_and_launch(label: Label) -> void:
	var pck_path := ""
	if _bridge != null and _bridge.has_method("get_launch_pck_path"):
		pck_path = str(_bridge.call("get_launch_pck_path")).strip_edges()

	if pck_path.is_empty() and FileAccess.file_exists("user://playhub_launch.txt"):
		var f := FileAccess.open("user://playhub_launch.txt", FileAccess.READ)
		if f != null:
			pck_path = f.get_as_text().strip_edges()
			f.close()

	if pck_path.is_empty():
		# Warm standby mode until Swift host dispatches host_mount_pck
		return

	_mount_path(pck_path, label)

func _mount_path(pck_path: String, label: Label) -> void:
	if not FileAccess.file_exists(pck_path):
		if label != null:
			label.text = "Play Hub: .pck not found (%s)" % pck_path
		push_error("PlayHubBootstrapIOS: missing pck_path=" + pck_path)
		return

	var ok := ProjectSettings.load_resource_pack(pck_path, true)
	if not ok:
		if label != null:
			label.text = "Play Hub: Failed to mount .pck"
		push_error("PlayHubBootstrapIOS: load_resource_pack failed for " + pck_path)
		return

	var main_scene := _resolve_main_scene_and_autoloads()
	if main_scene.is_empty() or main_scene == BOOTSTRAP_SCENE or main_scene == STANDBY_SCENE:
		if label != null:
			label.text = "Play Hub: No entry scene found in .pck"
		push_error("PlayHubBootstrapIOS: could not resolve game main_scene")
		return

	print("PlayHubBootstrapIOS: mounted=", pck_path, " main_scene=", main_scene)
	var packed: Resource = ResourceLoader.load(main_scene, "", ResourceLoader.CACHE_MODE_REPLACE)
	if packed is PackedScene:
		var err := get_tree().change_scene_to_packed(packed as PackedScene)
		if err != OK:
			push_error("PlayHubBootstrapIOS: change_scene_to_packed failed err=" + str(err))
		return

	var fallback_err := get_tree().change_scene_to_file(main_scene)
	if fallback_err != OK:
		push_error("PlayHubBootstrapIOS: change_scene_to_file failed err=" + str(fallback_err))

func _resolve_main_scene_and_autoloads() -> String:
	var cfg := ConfigFile.new()
	var main_scene := ""
	if cfg.load("res://project.godot") == OK:
		main_scene = str(cfg.get_value("application", "run/main_scene", ""))
		if cfg.has_section("autoload"):
			for key in cfg.get_section_keys("autoload"):
				var raw_val := str(cfg.get_value("autoload", key, ""))
				var script_path := raw_val.trim_prefix("*")
				if not script_path.is_empty() and ResourceLoader.exists(script_path) and get_tree().root.get_node_or_null(str(key)) == null:
					var res: Resource = ResourceLoader.load(script_path, "", ResourceLoader.CACHE_MODE_REPLACE)
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

	if main_scene.is_empty() or main_scene == BOOTSTRAP_SCENE or main_scene == STANDBY_SCENE:
		for candidate in ["res://scenes/main.tscn", "res://main.tscn", "res://Scenes/Main.tscn", "res://Scenes/main.tscn", "res://Main.tscn"]:
			if ResourceLoader.exists(candidate):
				main_scene = candidate
				break

	return main_scene

func _perform_clean_reset() -> void:
	# Step 2: Transition to lightweight idle standby scene
	get_tree().paused = false
	Engine.time_scale = 1.0
	if ResourceLoader.exists(STANDBY_SCENE):
		get_tree().change_scene_to_file(STANDBY_SCENE)

	# Step 3: Remove game-injected Autoload / root nodes outside baseline snapshot
	for child in get_tree().root.get_children():
		var child_name := String(child.name)
		if not _initial_root_names.has(child_name) and child != get_tree().current_scene:
			child.queue_free()

	# Step 4: Restore AudioServer buses and InputMap actions to baseline
	while AudioServer.bus_count > _initial_audio_bus_count:
		AudioServer.remove_bus(AudioServer.bus_count - 1)
	for action in InputMap.get_actions():
		var action_str := String(action)
		if not _initial_input_actions.has(action_str):
			InputMap.erase_action(action)

	if _bridge != null and _bridge.has_method("notify_clean_reset_done"):
		_bridge.call("notify_clean_reset_done")
