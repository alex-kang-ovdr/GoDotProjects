class_name GameData
extends RefCounted

## Lossless JSON export of every named export in the preserved web v2 data.js.
static var _catalog: Dictionary = {}
static var _aliases: Dictionary = {}

static func get_data() -> Dictionary:
	if _catalog.is_empty():
		var parsed = JSON.parse_string(FileAccess.get_file_as_string("res://data/catalog.json"))
		assert(parsed is Dictionary, "Missing or invalid original v2 data/catalog.json")
		_catalog = parsed
	return _catalog

static func record(collection: String, id: String) -> Dictionary:
	var records = get_data().get(collection, {})
	if records is Dictionary:
		return records.get(id, {})
	for entry in records:
		if entry.id == id:
			return entry
	return records[0] if records.size() else {}

static func icon_path(key: String) -> String:
	if _aliases.is_empty():
		_aliases = JSON.parse_string(FileAccess.get_file_as_string("res://data/icon_aliases.json"))
	key = key.to_lower()
	key = _aliases.get(key, key)
	var path = "res://assets/icons/%s.svg" % key
	return path if ResourceLoader.exists(path) else "res://assets/icons/star.svg"
