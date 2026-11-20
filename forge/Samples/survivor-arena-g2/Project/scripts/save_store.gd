extends RefCounted
## Separate native save namespace. JSON only; no serialized objects are loaded.

var directory: String = "user://"
var last_error: String = ""
const LIMIT_BYTES: int = 8 * 1024 * 1024

func _init(base_directory: String = "user://") -> void:
	directory = base_directory
	if not directory.ends_with("/"):
		directory += "/"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))

func default_profile() -> Dictionary:
	return {"schema":2, "runs":0, "wins":0, "best_kills":0, "credits":0, "settled":[],
		"settings":{"sound":true,"volume":0.70,"quality":true,"screen_shake":true,"damage_numbers":true,"radar":true},
		"last_options":{}, "history":[], "records":{}}

func load_profile() -> Dictionary:
	var raw: Dictionary = read_envelope("profile.json")
	var result: Dictionary = default_profile()
	for key in ["runs","wins","best_kills","credits"]:
		var value = raw.get(key, 0)
		if (value is float or value is int) and is_finite(float(value)):
			result[key] = clampi(int(value), 0, 1000000000)
	if raw.get("settled") is Array:
		for value in raw.settled:
			if value is String and value.length() <= 128 and not result.settled.has(value):
				result.settled.append(value)
		while result.settled.size() > 128:
			result.settled.pop_front()
	if raw.get("settings") is Dictionary:
		for key in ["sound","quality","screen_shake","damage_numbers","radar"]:
			if raw.settings.get(key) is bool:
				result.settings[key] = raw.settings[key]
		result.settings.volume = _number(raw.settings.get("volume",0.70),0.70,0.0,1.0)
	if raw.get("last_options") is Dictionary:
		result.last_options = _options(raw.last_options)
	if raw.get("history") is Array:
		var seen: Dictionary = {}
		for entry in raw.history:
			if not entry is Dictionary or not entry.get("run_id") is String or entry.run_id.is_empty() or entry.run_id.length() > 128 or seen.has(entry.run_id):
				continue
			result.history.append(_record(entry.run_id,entry))
			seen[entry.run_id] = true
			if result.history.size() >= 12:
				break
	if raw.get("records") is Dictionary:
		for chapter in ["0","1","2"]:
			var entry = raw.records.get(chapter,{})
			if not entry is Dictionary or entry.is_empty():
				continue
			result.records[chapter] = {
				"clears":int(_number(entry.get("clears",0),0,0,1000000000)),
				"best_kills":int(_number(entry.get("best_kills",0),0,0,1000000000)),
				"best_level":int(_number(entry.get("best_level",0),0,0,99)),
				"best_time":_number(entry.get("best_time",0.0),0.0,0.0,86400.0)}
	return result

func _number(value: Variant, fallback: float, minimum: float, maximum: float) -> float:
	if (value is float or value is int) and is_finite(float(value)):
		return clampf(float(value),minimum,maximum)
	return fallback

func _options(raw: Dictionary) -> Dictionary:
	var weapon: String = str(raw.get("weapon","kunai"))
	var result: Dictionary = {
		"weapon":weapon if weapon in ["kunai","bat","katana","shotgun","revolver"] else "kunai",
		"chapter":int(_number(raw.get("chapter",0),0,0,2)),
		"duration":900 if raw.get("duration") == 900 else 300,
		"difficulty":"hard" if raw.get("difficulty") == "hard" else "normal"}
	for key in ["precision","phase","maintainer"]:
		result[key] = raw.get(key,false) == true
	return result

func _record(run_id: String, raw: Dictionary) -> Dictionary:
	var options: Dictionary = _options(raw)
	return {"run_id":run_id,"won":raw.get("won",false) == true,
		"chapter":options.chapter,"weapon":options.weapon,"duration":options.duration,
		"elapsed":_number(raw.get("elapsed",0.0),0.0,0.0,86400.0),
		"kills":int(_number(raw.get("kills",0),0,0,1000000000)),
		"level":int(_number(raw.get("level",1),1,1,99)),
		"evolutions":int(_number(raw.get("evolutions",0),0,0,16)),
		"damage":_number(raw.get("damage",0.0),0.0,0.0,1e15),
		"credits":int(_number(raw.get("credits",0),0,0,1000000000)),
		"cause":str(raw.get("cause","")).left(120)}

func save_profile(profile: Dictionary) -> bool:
	return write_envelope("profile.json", profile)

func save_run(snapshot: Dictionary) -> bool:
	return write_envelope("run.json", snapshot)

func load_run() -> Dictionary:
	return read_envelope("run.json")

func has_run() -> bool:
	return FileAccess.file_exists(directory + "run.json") or FileAccess.file_exists(directory + "run.json.bak")

func clear_run() -> void:
	for suffix in ["", ".bak", ".tmp"]:
		var path: String = ProjectSettings.globalize_path(directory + "run.json" + suffix)
		if FileAccess.file_exists(path):
			DirAccess.remove_absolute(path)

func settle(profile: Dictionary, run_id: String, result: Dictionary) -> bool:
	if run_id.is_empty() or run_id.length() > 128:
		last_error = "전투 기록 ID가 없습니다."
		return false
	if profile.settled.has(run_id):
		clear_run()
		return true
	var next: Dictionary = profile.duplicate(true)
	var entry: Dictionary = _record(run_id,result)
	next.schema = 2
	next.best_kills = maxi(int(next.best_kills), int(entry.kills))
	next.credits = mini(1000000000,int(next.credits) + int(entry.credits))
	if entry.won:
		next.wins += 1
	if not next.get("history") is Array:
		next.history = []
	next.history.push_front(entry)
	while next.history.size() > 12:
		next.history.pop_back()
	if not next.get("records") is Dictionary:
		next.records = {}
	var chapter: String = str(entry.chapter)
	var best: Dictionary = next.records.get(chapter,{"clears":0,"best_kills":0,"best_level":0,"best_time":0.0})
	best.best_kills = maxi(int(best.best_kills),int(entry.kills))
	best.best_level = maxi(int(best.best_level),int(entry.level))
	if entry.won:
		best.clears += 1
		if float(entry.elapsed) > 0.0 and (float(best.best_time) <= 0.0 or float(entry.elapsed) < float(best.best_time)):
			best.best_time = entry.elapsed
	next.records[chapter] = best
	next.settled.append(run_id)
	while next.settled.size() > 128:
		next.settled.pop_front()
	if not save_profile(next):
		return false
	profile.clear()
	profile.merge(next)
	clear_run()
	return true

func write_envelope(name: String, payload: Dictionary) -> bool:
	last_error = ""
	var text: String = JSON.stringify(payload, "", true, true)
	var envelope: Dictionary = {"schema":1, "payload_json":text, "sha256":text.sha256_text()}
	var path: String = ProjectSettings.globalize_path(directory + name)
	var file = FileAccess.open(path + ".tmp", FileAccess.WRITE)
	if file == null:
		last_error = "저장 파일을 만들 수 없습니다: " + error_string(FileAccess.get_open_error())
		return false
	file.store_string(JSON.stringify(envelope))
	file.flush()
	var error: Error = file.get_error()
	file.close()
	if error != OK:
		last_error = "저장 쓰기에 실패했습니다: " + error_string(error)
		return false
	if FileAccess.file_exists(path):
		if FileAccess.file_exists(path + ".bak"):
			DirAccess.remove_absolute(path + ".bak")
		error = DirAccess.rename_absolute(path, path + ".bak")
		if error != OK:
			last_error = "이전 저장 보존에 실패했습니다."
			return false
	error = DirAccess.rename_absolute(path + ".tmp", path)
	if error != OK:
		if FileAccess.file_exists(path + ".bak"):
			DirAccess.rename_absolute(path + ".bak", path)
		last_error = "저장 파일 확정에 실패했습니다."
		return false
	return true

func read_envelope(name: String) -> Dictionary:
	last_error = ""
	for suffix in ["", ".bak"]:
		var path: String = directory + name + suffix
		if not FileAccess.file_exists(path):
			continue
		var file = FileAccess.open(path, FileAccess.READ)
		if file == null:
			continue
		if file.get_length() > LIMIT_BYTES:
			file.close()
			last_error = "저장 파일 크기가 제한을 초과했습니다."
			continue
		var parser = JSON.new()
		var parse_error: Error = parser.parse(file.get_as_text())
		file.close()
		if parse_error != OK:
			last_error = "저장 JSON이 손상되었습니다."
			continue
		var value = parser.data
		if not value is Dictionary or value.get("schema") != 1 or not value.get("payload_json") is String:
			last_error = "저장 파일 형식이 맞지 않습니다."
			continue
		if value.payload_json.sha256_text() != value.get("sha256", ""):
			last_error = "저장 파일 무결성 확인에 실패했습니다."
			continue
		var payload_parser = JSON.new()
		if payload_parser.parse(value.payload_json) != OK:
			last_error = "저장 데이터 형식이 맞지 않습니다."
			continue
		var payload = payload_parser.data
		if payload is Dictionary:
			last_error = ""
			return payload
	return {}
