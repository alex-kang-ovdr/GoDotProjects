extends Node3D


func _ready() -> void:
	var launch := LaunchOptions.parse(OS.get_cmdline_user_args())
	if not launch.ok:
		printerr("LAUNCH OPTIONS REJECTED: " + launch.error)
		get_tree().quit(2)
		return
	var registry_error := BlockRegistry.validate()
	if not registry_error.is_empty():
		push_error("Block registry invalid: %s" % registry_error)
		get_tree().quit(2)
		return
	_build_environment()
	var world := VoxelWorld.new()
	world.name = "VoxelWorld"
	world.world_seed = launch.seed
	world.world_size = launch.size
	world.startup_mode = launch.mode
	world.startup_room_attempts = launch.room_attempts
	world.startup_checks = launch.checks
	add_child(world)
	if world.layout.is_empty():
		printerr("LAUNCH GENERATION FAILED: " + world.generation_notice)
		get_tree().quit(2)
		return
	var player := VoxelPlayer.new()
	player.name = "Player"
	add_child(player)
	player.setup(world)
	var target := TargetIndicator.new()
	target.name = "TargetIndicator"
	world.add_child(target)
	target.setup(world, player)
	var cracks := MiningCracks.new()
	cracks.name = "MiningCracks"
	world.add_child(cracks)
	cracks.setup(world, player)
	var hud := GameHud.new()
	hud.name = "HUD"
	add_child(hud)
	hud.setup(player, world)
	var controls := GenerationControls.new()
	controls.name = "GenerationControls"
	add_child(controls)
	controls.setup(world, player)
	var inventory_panel := InventoryPanel.new()
	inventory_panel.name = "InventoryPanel"
	add_child(inventory_panel)
	inventory_panel.setup(player, world)
	var crafting_panel := CraftingPanel.new()
	crafting_panel.name = "CraftingPanel"
	add_child(crafting_panel)
	crafting_panel.setup(player, world)
	var station_panel := StationPanel.new()
	station_panel.name = "StationPanel"
	add_child(station_panel)
	station_panel.setup(player, world)
	if launch.requested:
		controls.draft_room_attempts = launch.room_attempts
		controls.draft_checks = launch.checks
		controls.draft_poi = launch.poi
		controls.active_poi = launch.poi
		controls._refresh_poi()
		controls._refresh()


func _build_environment() -> void:
	var world_environment := WorldEnvironment.new()
	world_environment.environment = WorldLighting.environment_resource()
	add_child(world_environment)
	add_child(WorldLighting.sun_node())
