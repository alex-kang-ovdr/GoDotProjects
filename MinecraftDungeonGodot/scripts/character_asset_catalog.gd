class_name CharacterAssetCatalog

## Runtime loader for the 13 Authored Cuboids characters copied from
## MinecraftCharacterGenerator.  GLB files are imported by Godot as PackedScene.
const MANIFEST_PATH := "res://assets/minecraft_character_generator/manifest-authored13.json"

static func manifest() -> Dictionary:
	var file := FileAccess.open(MANIFEST_PATH, FileAccess.READ)
	if file == null:
		push_error("Character manifest not found: %s" % MANIFEST_PATH)
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	return parsed if parsed is Dictionary else {}

static func assets() -> Array:
	return manifest().get("assets", [])

static func scene_for(character_name: String) -> PackedScene:
	var path := "res://assets/minecraft_character_generator/authored13/%s.glb" % character_name
	var packed := load(path)
	return packed as PackedScene

static func instantiate(character_name: String) -> Node3D:
	var packed := scene_for(character_name)
	if packed == null:
		push_error("Authored Cuboids GLB is unavailable: %s" % character_name)
		return null
	return packed.instantiate() as Node3D
