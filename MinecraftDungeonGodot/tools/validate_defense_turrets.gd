extends SceneTree

const REQUIRED := ["Install", "Aim", "Fire", "Destroy"]
const MANIFEST := "res://assets/minecraft_character_generator/turrets/manifest.json"

func _init() -> void:
	var file := FileAccess.open(MANIFEST, FileAccess.READ)
	if file == null:
		printerr("DEFENSE_TURRET_VALIDATION FAIL manifest")
		quit(1)
		return
	var manifest = JSON.parse_string(file.get_as_text())
	var passed := true
	var rows: Array = []
	for asset in manifest.get("assets", []):
		var doc := GLTFDocument.new()
		var state := GLTFState.new()
		var error := doc.append_from_file("res://assets/" + asset.file, state)
		var scene = doc.generate_scene(state) if error == OK else null
		var players := _descendants(scene, "AnimationPlayer") if scene else []
		var skeletons := _descendants(scene, "Skeleton3D") if scene else []
		var clips: Array = []
		for player in players:
			for clip in player.get_animation_list():
				if clip != "RESET" and clip not in clips:
					clips.append(clip)
		var ok := error == OK and scene != null and skeletons.is_empty()
		for required in REQUIRED:
			ok = ok and required in clips
		passed = passed and ok
		rows.append({"name": asset.name, "passed": ok, "animation_players": players.size(), "skeletons": skeletons.size(), "clips": clips})
	var out := ProjectSettings.globalize_path("res://StatusReport/defense-turrets")
	DirAccess.make_dir_recursive_absolute(out)
	FileAccess.open(out + "/validation.json", FileAccess.WRITE).store_string(JSON.stringify({"passed": passed, "count": rows.size(), "required_clips": REQUIRED, "assets": rows}, "\t"))
	print("DEFENSE_TURRET_VALIDATION " + JSON.stringify({"passed": passed, "count": rows.size()}))
	quit(0 if passed else 1)

func _descendants(node: Node, type_name: String) -> Array:
	var found: Array = []
	if node.is_class(type_name):
		found.append(node)
	for child in node.get_children():
		found.append_array(_descendants(child, type_name))
	return found
