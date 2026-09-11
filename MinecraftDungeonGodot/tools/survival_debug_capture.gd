extends SceneTree
var output_path := "res://StatusReport/milestones/assets/M06-survival-debug.png"
func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_path = argument.trim_prefix("--output=")
	call_deferred("_run")
func _run() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("SURVIVAL DEBUG CAPTURE requires a renderer")
		quit(2)
		return
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var workbench := instance.get_node("DebugWorkbench") as DebugWorkbench
	if not workbench.open():
		push_error("SURVIVAL DEBUG CAPTURE could not open the workbench")
		quit(1)
		return
	await RenderingServer.frame_post_draw
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_path.get_base_dir()))
	var result := root.get_texture().get_image().save_png(output_path)
	print("SURVIVAL DEBUG CAPTURE: path=%s result=%d" % [output_path, result])
	quit(0 if result == OK else 1)
