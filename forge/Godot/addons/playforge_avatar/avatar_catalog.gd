class_name PlayForgeAvatarCatalog
extends RefCounted

const ADDON_ROOT := "res://addons/playforge_avatar"
const CATALOG_PATH := "res://addons/playforge_avatar/catalog.json"
const MANIFEST_PATH := "res://addons/playforge_avatar/seal_manifest.json"
const ATTACHMENT_SLOTS := ["head", "back", "hand_r", "hand_l"]
const EMOTE_WHEEL_SIZE := 4

var _data: Dictionary = {}
var _items_by_id: Dictionary = {}
var _loaded := false
var _seal_verified := false
var _seal_report: Dictionary = {}


func _parse_catalog_file() -> bool:
	if not _data.is_empty() and not _items_by_id.is_empty():
		return true
	var file := FileAccess.open(CATALOG_PATH, FileAccess.READ)
	if file == null:
		push_error("PlayForgeAvatarCatalog: missing canonical catalog at %s" % CATALOG_PATH)
		return false
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	if not parsed is Dictionary:
		push_error("PlayForgeAvatarCatalog: catalog JSON is malformed")
		return false
	_data = parsed
	_items_by_id.clear()
	for entry in _data.get("items", []):
		if entry is Dictionary and entry.has("id"):
			_items_by_id[str(entry.get("id"))] = entry
	return not _items_by_id.is_empty()


func load_catalog() -> bool:
	if _loaded:
		return _seal_verified and not _data.is_empty()
	_loaded = true
	if not _parse_catalog_file():
		_seal_verified = false
		return false
	_seal_report = verify_seal_manifest()
	_seal_verified = bool(_seal_report.get("ok", false))
	if not _seal_verified:
		push_error("PlayForgeAvatarCatalog: seal integrity verification failed: %s" % JSON.stringify(_seal_report))
		_data.clear()
		_items_by_id.clear()
		return false
	return true


func is_seal_verified() -> bool:
	load_catalog()
	return _seal_verified


func get_seal_report() -> Dictionary:
	load_catalog()
	return _seal_report.duplicate(true)


func get_catalog_version() -> String:
	load_catalog()
	return str(_data.get("catalogVersion", "unknown"))


func get_item(item_id: String) -> Dictionary:
	load_catalog()
	if item_id.is_empty() or not _items_by_id.has(item_id):
		return {}
	return (_items_by_id[item_id] as Dictionary).duplicate(true)


func list_items(category := "") -> Array[Dictionary]:
	load_catalog()
	var out: Array[Dictionary] = []
	for entry in _data.get("items", []):
		if not entry is Dictionary:
			continue
		if category.is_empty() or str(entry.get("category", "")) == category:
			out.append((entry as Dictionary).duplicate(true))
	return out


func get_rig_profile(profile_id: String) -> Dictionary:
	load_catalog()
	var profiles: Variant = _data.get("rigProfiles", {})
	if profiles is Dictionary and profiles.has(profile_id):
		return (profiles[profile_id] as Dictionary).duplicate(true)
	return {}


func get_default_loadout() -> Dictionary:
	load_catalog()
	var raw: Variant = _data.get("defaultLoadout", {})
	if raw is Dictionary:
		return normalize_loadout(raw)
	return {
		"skinId": "skin_knight",
		"attachments": {"head": null, "back": "acc_quiver", "hand_r": null, "hand_l": null},
		"emoteWheel": ["emote_cheer", "emote_wave", null, null],
	}


func normalize_loadout(raw: Dictionary) -> Dictionary:
	load_catalog()
	var fallback: Dictionary = _data.get("defaultLoadout", {})
	var skin_id := str(raw.get("skinId", fallback.get("skinId", "skin_knight")))
	var skin_item := get_item(skin_id)
	if skin_item.is_empty() or str(skin_item.get("category", "")) != "skin":
		skin_id = str(fallback.get("skinId", "skin_knight"))

	var raw_att: Variant = raw.get("attachments", {})
	var attachments: Dictionary = {}
	for slot in ATTACHMENT_SLOTS:
		var chosen: Variant = raw_att.get(slot, null) if raw_att is Dictionary else null
		if chosen is String and not chosen.is_empty():
			var item := get_item(chosen)
			if not item.is_empty() and str(item.get("category", "")) == "attachment" and str(item.get("slot", "")) == slot:
				attachments[slot] = chosen
			else:
				attachments[slot] = null
		else:
			attachments[slot] = null

	var raw_emotes: Variant = raw.get("emoteWheel", [])
	var emote_wheel: Array = []
	for i in range(EMOTE_WHEEL_SIZE):
		var chosen_emote: Variant = raw_emotes[i] if (raw_emotes is Array and i < raw_emotes.size()) else null
		if chosen_emote is String and not chosen_emote.is_empty():
			var emote_item := get_item(chosen_emote)
			if not emote_item.is_empty() and str(emote_item.get("category", "")) == "emote":
				emote_wheel.append(chosen_emote)
			else:
				emote_wheel.append(null)
		else:
			emote_wheel.append(null)

	return {
		"skinId": skin_id,
		"attachments": attachments,
		"emoteWheel": emote_wheel,
		"catalogVersion": get_catalog_version(),
		"displayName": str(raw.get("displayName", "Player")),
		"verified": bool(raw.get("verified", false)),
		"signature": str(raw.get("signature", "")),
	}


func resolve_asset_res_path(item_id: String) -> String:
	var item := get_item(item_id)
	var rel := str(item.get("assetPath", ""))
	if rel.is_empty():
		return ""
	return ADDON_ROOT + "/" + rel


func verify_asset_checksum(item_id: String) -> bool:
	var item := get_item(item_id)
	if item.is_empty():
		return false
	var expected := str(item.get("sha256", ""))
	var res_path := resolve_asset_res_path(item_id)
	if expected.is_empty() or res_path.is_empty() or not FileAccess.file_exists(res_path):
		return false
	var bytes := FileAccess.get_file_as_bytes(res_path)
	if bytes.is_empty():
		return false
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(bytes)
	var actual := ctx.finish().hex_encode()
	return actual == expected


func _verify_item_entry_checksum(entry: Dictionary) -> bool:
	var expected := str(entry.get("sha256", ""))
	var rel := str(entry.get("assetPath", ""))
	if expected.is_empty() or rel.is_empty():
		return false
	var res_path := ADDON_ROOT + "/" + rel
	if not FileAccess.file_exists(res_path):
		return false
	var bytes := FileAccess.get_file_as_bytes(res_path)
	if bytes.is_empty():
		return false
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(bytes)
	return ctx.finish().hex_encode() == expected


func verify_seal_manifest() -> Dictionary:
	var report := {"ok": true, "checked": 0, "mismatches": [], "missing": []}
	if not FileAccess.file_exists(MANIFEST_PATH):
		if not OS.is_debug_build():
			report.ok = false
			report.missing.append(MANIFEST_PATH)
			return report
		# Manifest is generated by Forge seal bundler; allow debug/dev mode check against catalog assets.
		if not _parse_catalog_file():
			report.ok = false
			report.missing.append(CATALOG_PATH)
			return report
		for entry in _data.get("items", []):
			if entry is Dictionary and entry.has("assetPath"):
				report.checked += 1
				if not _verify_item_entry_checksum(entry):
					report.ok = false
					report.mismatches.append(str(entry.get("assetPath", "")))
		return report
	var file := FileAccess.open(MANIFEST_PATH, FileAccess.READ)
	if file == null:
		report.ok = false
		report.missing.append(MANIFEST_PATH)
		return report
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	if not parsed is Dictionary or not parsed.get("files") is Dictionary:
		report.ok = false
		report.mismatches.append(MANIFEST_PATH)
		return report
	var files_map: Dictionary = parsed.get("files")
	if files_map.is_empty() or not files_map.has("catalog.json"):
		report.ok = false
		report.mismatches.append(MANIFEST_PATH)
		return report
	for rel_path in files_map.keys():
		var full := ADDON_ROOT + "/" + str(rel_path)
		if not FileAccess.file_exists(full):
			report.ok = false
			report.missing.append(str(rel_path))
			continue
		report.checked += 1
		var bytes := FileAccess.get_file_as_bytes(full)
		var ctx := HashingContext.new()
		ctx.start(HashingContext.HASH_SHA256)
		ctx.update(bytes)
		if ctx.finish().hex_encode() != str(files_map[rel_path]):
			report.ok = false
			report.mismatches.append(str(rel_path))
	return report
