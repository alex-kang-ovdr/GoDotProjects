extends SceneTree

var output_path := "res://StatusReport/milestones/assets/M18-authored-monsters.png"


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("MOB CAPTURE requires a renderer")
		quit(2)
		return
	var main := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	for unused in 90:
		await RenderingServer.frame_post_draw
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_path.get_base_dir()))
	var result := root.get_texture().get_image().save_png(output_path)
	print("MOB CAPTURE: path=%s result=%d" % [output_path, result])
	quit(0 if result == OK else 1)
