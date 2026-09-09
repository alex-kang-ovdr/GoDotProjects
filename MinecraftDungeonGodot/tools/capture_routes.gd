extends SceneTree

var output_directory := "res://Saved/Verification/landmarks"


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_directory = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world := instance.get_node("VoxelWorld") as VoxelWorld
	var player := instance.get_node("Player") as VoxelPlayer
	player.set_physics_process(false)
	if world.layout.landmark_routes.repaired.is_empty():
		push_error("capture requires a repaired route")
		quit(1)
		return
	var path: Array = world.layout.landmark_routes.repaired[0].path
	var focus := Vector3(path[int(path.size() / 2)]) + Vector3(0.5, 0, 0.5)
	var overview := Camera3D.new()
	instance.add_child(overview)
	var highest := 0
	for height: int in world.layout.heights: highest = maxi(highest, height)
	overview.position = Vector3(focus.x + 18, highest + 25, focus.z + 22)
	overview.look_at(focus)
	overview.current = true
	world.get_node("TargetIndicator").hide()
	var result := await _capture("landmark-route-overview.png")
	var next: Vector3i = path[mini(int(path.size() / 2) + 1, path.size() - 1)]
	overview.position = focus + Vector3.UP * 1.5
	overview.look_at(Vector3(next) + Vector3(0.5, 1.5, 0.5))
	result |= await _capture("landmark-route-interior.png")
	print("ROUTE CAPTURE: error=%d hash=%d target=%s path_nodes=%d" % [result, world.layout.signature, world.layout.landmark_routes.repaired[0].target, path.size()])
	quit(0 if result == OK else 1)


func _capture(filename: String) -> int:
	for unused in 4: await process_frame
	await RenderingServer.frame_post_draw
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_directory))
	return root.get_texture().get_image().save_png(output_directory.path_join(filename))
