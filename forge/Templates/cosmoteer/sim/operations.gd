extends RefCounted

const CATALOG_PATH := "res://data/operations.json"
const SAVE_VERSION := 1
const REQUIRED_FIELDS := ["id", "title", "summary", "objective", "opponent", "distance", "seconds", "ai", "requires"]

var missions: Array[Dictionary] = []
var completed: Dictionary = {}
var load_error := ""
var progress_error := ""
var save_path := "user://lab_operations.json"


func _init(path: String = "user://lab_operations.json") -> void:
	save_path = path
	_load_catalog()
	if load_error.is_empty():
		_load_progress()


func is_unlocked(id: String) -> bool:
	var mission := _mission(id)
	if mission.is_empty():
		return false
	var required := String(mission.requires)
	return required.is_empty() or completed.has(required)


func record_win(id: String, elapsed: float, shots: int, hits: int) -> bool:
	progress_error = ""
	if not load_error.is_empty():
		progress_error = "작전 데이터가 올바르지 않습니다."
		return false
	if not is_unlocked(id):
		progress_error = "작전이 잠겨 있거나 존재하지 않습니다."
		return false
	if not is_finite(elapsed) or elapsed <= 0.0 or shots < 0 or hits < 0 or hits > shots:
		progress_error = "작전 결과 값이 올바르지 않습니다."
		return false
	var previous: Variant = completed.get(id)
	if previous is Dictionary and float(previous.elapsed) <= elapsed:
		return true
	var entry := {"elapsed": elapsed, "shots": shots, "hits": hits}
	completed[id] = entry
	if not _save_progress():
		if previous == null:
			completed.erase(id)
		else:
			completed[id] = previous
		return false
	return true


func _load_catalog() -> void:
	var file := FileAccess.open(CATALOG_PATH, FileAccess.READ)
	if file == null:
		load_error = "%s: %s" % [CATALOG_PATH, error_string(FileAccess.get_open_error())]
		return
	var json := JSON.new()
	var error := json.parse(file.get_as_text())
	file.close()
	if error != OK:
		load_error = "%s line %d: %s" % [CATALOG_PATH, json.get_error_line(), json.get_error_message()]
		return
	if not json.data is Dictionary or not _is_integer(json.data.get("version")) or json.data.version != 1 or not json.data.get("missions") is Array:
		load_error = "%s: expected version 1 and missions array" % CATALOG_PATH
		return
	var rows: Array = json.data.missions
	var ids := {}
	for index in rows.size():
		var row: Variant = rows[index]
		if not row is Dictionary:
			load_error = "%s: mission %d must be an object" % [CATALOG_PATH, index]
			return
		for key in REQUIRED_FIELDS:
			if not row.has(key):
				load_error = "%s: mission %d missing %s" % [CATALOG_PATH, index, key]
				return
		if not row.id is String or row.id.is_empty() or ids.has(row.id):
			load_error = "%s: mission IDs must be nonempty and unique" % CATALOG_PATH
			return
		for key in ["title", "summary"]:
			if not row[key] is String or row[key].strip_edges().is_empty():
				load_error = "%s: mission %s has an invalid %s" % [CATALOG_PATH, row.id, key]
				return
		if row.objective not in ["duel", "disarm", "survive", "mine"] or row.opponent not in ["flight", "fast", "siege", "vanguard", "dreadnought", "prism", "imperium", "titan", "carrier", "miner"] or row.ai not in ["balanced", "pursuit", "standoff"]:
			load_error = "%s: mission %s has an unsupported objective, opponent, or AI" % [CATALOG_PATH, row.id]
			return
		if not (row.distance is int or row.distance is float) or not is_finite(float(row.distance)) or float(row.distance) <= 0:
			load_error = "%s: mission %s has invalid distance" % [CATALOG_PATH, row.id]
			return
		if not (row.seconds is int or row.seconds is float) or not is_finite(float(row.seconds)) or float(row.seconds) < 0:
			load_error = "%s: mission %s has invalid duration" % [CATALOG_PATH, row.id]
			return
		if (row.objective == "survive" and float(row.seconds) <= 0.0) or (row.objective != "survive" and float(row.seconds) != 0.0):
			load_error = "%s: mission %s has duration inconsistent with its objective" % [CATALOG_PATH, row.id]
			return
		if not (row.requires is String):
			load_error = "%s: mission %s has invalid prerequisite" % [CATALOG_PATH, row.id]
			return
		ids[row.id] = true
		missions.append(row.duplicate(true))
	var positions := {}
	for index in missions.size():
		positions[missions[index].id] = index
	for index in missions.size():
		var row: Dictionary = missions[index]
		if not String(row.requires).is_empty() and (not ids.has(row.requires) or int(positions.get(row.requires, index)) >= index):
			load_error = "%s: mission %s requires an earlier known mission" % [CATALOG_PATH, row.id]
			missions.clear()
			return


func _mission(id: String) -> Dictionary:
	for row in missions:
		if row.id == id:
			return row
	return {}


func _load_progress() -> void:
	completed.clear()
	progress_error = ""
	if not FileAccess.file_exists(save_path):
		return
	var file := FileAccess.open(save_path, FileAccess.READ)
	if file == null:
		progress_error = "작전 진행 파일을 읽을 수 없습니다."
		return
	var json := JSON.new()
	var error := json.parse(file.get_as_text())
	file.close()
	if error != OK or not json.data is Dictionary:
		progress_error = "작전 진행 파일 형식이 올바르지 않습니다."
		return
	if not _is_integer(json.data.get("version")) or json.data.version != SAVE_VERSION or not json.data.get("completed") is Dictionary:
		progress_error = "작전 진행 파일 버전 또는 구조가 올바르지 않습니다."
		return
	var raw: Dictionary = json.data.completed
	var restored := {}
	for id in raw:
		if _mission(String(id)).is_empty() or not raw[id] is Dictionary:
			progress_error = "알 수 없는 작전 또는 잘못된 결과가 저장되어 있습니다."
			return
		var result: Dictionary = raw[id]
		if not result.has_all(["elapsed", "shots", "hits"]):
			progress_error = "저장된 작전 결과가 불완전합니다."
			return
		if not _is_number(result.elapsed) or not _is_integer(result.shots) or not _is_integer(result.hits):
			progress_error = "저장된 작전 결과의 값 형식이 올바르지 않습니다."
			return
		var elapsed: float = float(result.elapsed)
		if not is_finite(elapsed) or elapsed <= 0 or result.shots < 0 or result.shots > 9007199254740991 or result.hits < 0 or result.hits > result.shots:
			progress_error = "저장된 작전 결과 값이 범위를 벗어났습니다."
			return
		restored[id] = {"elapsed": elapsed, "shots": int(result.shots), "hits": int(result.hits)}
	for mission in missions:
		if restored.has(mission.id) and not String(mission.requires).is_empty() and not restored.has(mission.requires):
			progress_error = "작전 완료 기록에 선행 작전이 누락되었습니다."
			return
	completed = restored


func _is_number(value: Variant) -> bool:
	return value is int or value is float


func _is_integer(value: Variant) -> bool:
	return value is int or (value is float and is_finite(value) and floorf(value) == value)


func _save_progress() -> bool:
	var directory := save_path.get_base_dir()
	if not directory.is_empty() and not DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(directory)):
		var make_error := DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(directory))
		if make_error != OK:
			progress_error = "작전 진행 폴더를 만들 수 없습니다."
			return false
	var temp_path := "%s.%d.%d.tmp" % [save_path, OS.get_process_id(), get_instance_id()]
	var file := FileAccess.open(temp_path, FileAccess.WRITE)
	if file == null:
		progress_error = "작전 진행 파일을 저장할 수 없습니다."
		return false
	file.store_string(JSON.stringify({"version": SAVE_VERSION, "completed": completed}, "\t"))
	file.flush()
	var write_error := file.get_error()
	file.close()
	if write_error != OK:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(temp_path))
		progress_error = "작전 진행 기록 쓰기에 실패했습니다."
		return false
	var target := ProjectSettings.globalize_path(save_path)
	var temp := ProjectSettings.globalize_path(temp_path)
	var rename_error := DirAccess.rename_absolute(temp, target)
	if rename_error != OK:
		DirAccess.remove_absolute(temp)
		progress_error = "작전 진행 기록 저장을 완료할 수 없습니다."
		return false
	return true
