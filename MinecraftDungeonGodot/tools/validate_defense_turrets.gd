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
		var geometry_ok := false
		var base_bottom := 999.0
		var muzzle_forward := false
		var aim_pitch_up := false
		if scene:
			root.add_child(scene)
			var base := scene.find_child("base", true, false) as MeshInstance3D
			var muzzle := scene.find_child("muzzle", true, false) as Node3D
			var pitch := scene.find_child("PitchJoint", true, false) as Node3D
			if base and muzzle:
				base_bottom = base.position.y + base.get_aabb().position.y
				muzzle_forward = muzzle.position.z < -1.0
			var scene_players := _descendants(scene, "AnimationPlayer")
			if pitch and not scene_players.is_empty():
				scene_players[0].play("Aim")
				scene_players[0].advance(0.4)
				aim_pitch_up = pitch.rotation.x > 0.0
		geometry_ok = abs(base_bottom) < 0.05 and muzzle_forward and aim_pitch_up
		var players := _descendants(scene, "AnimationPlayer") if scene else []
		var skeletons := _descendants(scene, "Skeleton3D") if scene else []
		var clips: Array = []
		for player in players:
			for clip in player.get_animation_list():
				if clip != "RESET" and clip not in clips:
					clips.append(clip)
		var ok := error == OK and scene != null and skeletons.is_empty() and geometry_ok
		for required in REQUIRED:
			ok = ok and required in clips
		passed = passed and ok
		rows.append({"name": asset.name, "passed": ok, "animation_players": players.size(), "skeletons": skeletons.size(), "clips": clips, "base_bottom": base_bottom, "muzzle_forward": muzzle_forward, "aim_pitch_up": aim_pitch_up})
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
