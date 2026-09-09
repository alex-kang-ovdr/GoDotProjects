class_name LaunchOptions
extends RefCounted


static func parse(arguments: PackedStringArray) -> Dictionary:
	var values := {}
	var legacy := false
	for argument in arguments:
		if not argument.begins_with("-"): continue
		var token := argument.trim_prefix("--").trim_prefix("-")
		var key := token.get_slice("=", 0).to_lower().replace("-", "")
		if key not in ["mode", "seed", "size", "roomattempts", "checks", "poi", "overworld", "dungeon", "dungeonseed", "worldsize", "dungeonsize", "nogenerationchecks", "dungeonpoi"]:
			continue # Test runners and engine integrations own their other arguments.
		legacy = legacy or not argument.begins_with("--") or key in ["overworld", "dungeon", "dungeonseed", "worldsize", "dungeonsize", "nogenerationchecks", "dungeonpoi"]
		var value := token.substr(token.find("=") + 1) if token.contains("=") else ""
		match key:
			"overworld", "dungeon":
				if token.contains("="): return _invalid("Mode flags do not accept a value")
				value = key
				key = "mode"
			"nogenerationchecks":
				if token.contains("="): return _invalid("NoGenerationChecks does not accept a value")
				key = "checks"
				value = "off"
			"dungeonpoi":
				if token.contains("="): return _invalid("DungeonPOI does not accept a value")
				key = "poi"
				value = "on"
			"dungeonseed": key = "seed"
		if values.has(key): return _invalid("Duplicate option: " + key)
		values[key] = value
	var requested := not values.is_empty()
	var mode: String = str(values.get("mode", "overworld" if values.has("worldsize") or not legacy else "dungeon")).to_lower()
	if mode not in ["overworld", "dungeon"]: return _invalid("Mode must be overworld or dungeon")
	if (values.has("worldsize") and mode != "overworld") or (values.has("dungeonsize") and mode != "dungeon"):
		return _invalid("WorldSize/DungeonSize contradicts selected mode")
	var size_keys := int(values.has("size")) + int(values.has("worldsize")) + int(values.has("dungeonsize"))
	if size_keys > 1: return _invalid("Only one size option may be supplied")
	var minimum := 11 if mode == "dungeon" else 41
	var size_text := str(values.get("size", values.get("worldsize", values.get("dungeonsize", "185" if requested and mode == "overworld" else "41"))))
	var seed_text := str(values.get("seed", "1337"))
	var attempts_text := str(values.get("roomattempts", "24"))
	for text in [seed_text, size_text, attempts_text]:
		if text.length() > 11 or not text.is_valid_int(): return _invalid("Seed, size and room attempts require decimal integers")
	var seed_value := seed_text.to_int()
	var size := size_text.to_int()
	var attempts := attempts_text.to_int()
	if seed_value < -2147483648 or seed_value > 2147483647: return _invalid("Seed outside signed int32")
	if size < minimum or size > 255: return _invalid("Size must be %d..255" % minimum)
	if size % 2 == 0: size += 1
	if attempts < 1 or attempts > 512: return _invalid("Room attempts must be 1..512")
	var checks := str(values.get("checks", "on" if requested else "off")).to_lower()
	var poi := str(values.get("poi", "off")).to_lower()
	if checks not in ["on", "off"] or poi not in ["on", "off"]: return _invalid("Checks and POI must be on or off")
	return {"ok": true, "error": "", "requested": requested, "mode": mode,
		"seed": seed_value, "size": size, "room_attempts": attempts, "checks": checks == "on", "poi": poi == "on"}


static func _invalid(message: String) -> Dictionary:
	return {"ok": false, "error": message}
