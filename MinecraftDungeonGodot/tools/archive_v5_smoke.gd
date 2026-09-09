extends SceneTree


# Run only with --path pointing at an extracted v5 runtime archive. This script
# never reads or writes the user's checkpoint; it verifies the archived engine
# content can still recreate the old base world and instantiate the game.
func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world: Node = instance.get_node("VoxelWorld")
	var player: Node = instance.get_node("Player")
	player.set_physics_process(false)
	for unused in 4: await physics_frame
	var valid: bool = world.layout.generation_version == 5 and world.layout.cells.size() == 48493 and world.layout.signature == 805642358
	valid = valid and world.chunk_store.edits.is_empty() and world.generation_count == 1
	print("ARCHIVE V5 SMOKE: passed=%s version=%d cells=%d hash=%d" % [valid, world.layout.generation_version, world.layout.cells.size(), world.layout.signature])
	quit(0 if valid else 1)
