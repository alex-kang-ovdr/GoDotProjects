extends SceneTree

var output_path := "res://StatusReport/milestones/assets/M07-streaming.png"


func _init() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="): output_path = argument.trim_prefix("--output=")
	call_deferred("_run")


func _run() -> void:
	if DisplayServer.get_name() == "headless":
		push_error("STREAMING CAPTURE requires a renderer")
		quit(2)
		return
	var environment := WorldEnvironment.new()
	environment.environment = WorldLighting.environment_resource()
	root.add_child(environment)
	root.add_child(WorldLighting.sun_node())
	var world := VoxelWorld.new()
	world.streaming_enabled = true
	world.world_seed = 1337
	root.add_child(world)
	var player := VoxelPlayer.new()
	root.add_child(player)
	player.setup(world)
	player.performance_hud_visible = true
	var hud := GameHud.new()
	root.add_child(hud)
	hud.setup(player, world)
	for _frame in 4:
		await RenderingServer.frame_post_draw
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_path.get_base_dir()))
	var result := root.get_texture().get_image().save_png(output_path)
	print("STREAMING CAPTURE: path=%s result=%d" % [output_path, result])
	quit(0 if result == OK else 1)
