@tool
extends Node

signal changed

const ImportHistory := preload("showcase_import_history.gd")
const Repository := preload("showcase_repository.gd")
var repository := Repository.new()
var _archive_sources := {}
const BOOTSTRAP_FILES := ["Scripts/Game.gd", "Scripts/Main.gd", "playforge_replay_source.tscn"]
var _history := ImportHistory.new()
var _record_undo := false
var _undo_scene: WeakRef
var _new_directories := PackedStringArray()

var receipt: Dictionary = {}
var _run := 0
var _scheduled := false
var _from_store := false
var _scan_deadline := 0
var _next_scan := 0
var _processing := false
var _files := PackedStringArray()
var _staged := PackedStringArray()


func _ready() -> void:
	add_child(repository)
	set_process(false)
	_history.restored.connect(_on_history_restored)


func _on_history_restored(result: Dictionary) -> void:
	if _scheduled or _processing:
		return
	receipt = result
	changed.emit()


static func staging_root() -> String:
	if OS.has_feature("web"):
		var project := ProjectSettings.globalize_path("res://").trim_suffix("/").get_file()
		return "/tmp/playforge-import/%s/" % project
	return "res://.playforge-import/"


static func store_source(file: String) -> String:
	if not is_asset_path(file):
		return ""
	if OS.has_feature("web"):
		var project := ProjectSettings.globalize_path("res://").trim_suffix("/").get_file()
		return "/tmp/playforge-store/%s/%s" % [project, file]
	return "res://.playforge-store/" + file


static func is_asset_path(file: Variant) -> bool:
	if not file is String:
		return false
	var leaf: String = file.get_file()
	if not leaf.is_valid_filename() or leaf.begins_with("."):
		return false
	return (file == "Assets/" + leaf and leaf.get_extension() == "svg") \
		or (file == "Assets/Audio/" + leaf and leaf.get_extension() == "tres")


func materialize_bootstrap(files: Array) -> bool:
	var staging := staging_root()
	var seen := {}
	var pending := PackedStringArray()
	for file: Variant in files:
		if file not in BOOTSTRAP_FILES or seen.has(file):
			return false
		seen[file] = true
		if FileAccess.file_exists("res://" + file):
			continue
		if DirAccess.dir_exists_absolute("res://" + file) or not FileAccess.file_exists(staging + file):
			return false
		pending.append(file)
	var created := {}
	for file in pending:
		var path := "res://" + file
		if FileAccess.file_exists(path):
			continue
		if DirAccess.make_dir_recursive_absolute(path.get_base_dir()) != OK or DirAccess.copy_absolute(staging + file, path) != OK:
			for copied: String in created:
				if FileAccess.get_sha256(copied) == created[copied]:
					DirAccess.remove_absolute(copied)
			return false
		created[path] = FileAccess.get_sha256(path)
	if not created.is_empty():
		EditorInterface.get_resource_filesystem().scan()
	for file: String in files:
		var source := staging + file
		if FileAccess.file_exists(source) and DirAccess.remove_absolute(source) != OK:
			return false
	return true


func reject(message: String) -> void:
	if _processing or _scheduled:
		return
	receipt = {"state": "error", "count": 0, "first": 0, "files": [], "message": message}
	changed.emit()


func begin_run() -> void:
	if _processing or _scheduled:
		return
	_run += 1
	_scheduled = false
	receipt = {}
	set_process(false)


func request(files: Array, staged: Array, from_store := false, record_undo := false, pack_id := "") -> void:
	# Seeking back or Undo must not delete or re-import a user's working files.
	if not receipt.is_empty():
		return
	_record_undo = record_undo
	var root := EditorInterface.get_edited_scene_root()
	_undo_scene = weakref(root) if record_undo and root != null else null
	_new_directories.clear()
	for file: String in files:
		for dir: String in ["res://Assets/Audio", "res://Assets"]:
			if ("res://" + file).begins_with(dir + "/") and dir not in _new_directories and not DirAccess.dir_exists_absolute(dir):
				_new_directories.append(dir)
	_new_directories.sort()
	_new_directories.reverse()
	_from_store = from_store
	_scan_deadline = 0
	_next_scan = 0
	_files = PackedStringArray(files)
	_staged = PackedStringArray(staged)
	receipt = {"state": "queued", "count": 0, "first": 0, "files": _files, "message": "에셋 임포트 준비 중"}
	_scheduled = true
	changed.emit()
	_archive_sources.clear()
	if from_store and not repository.url.is_empty():
		var run := _run
		var sources := await repository.download_pack(pack_id, _files)
		if run != _run:
			return
		if sources.is_empty():
			_scheduled = false
			reject("%s 팩 다운로드 실패 · %s" % [pack_id, repository.error_message])
			return
		_archive_sources = sources
	set_process(true)


func _process(_delta: float) -> void:
	var filesystem := EditorInterface.get_resource_filesystem()
	if not _scheduled or _processing or filesystem.is_scanning() or filesystem.is_importing():
		return
	# A brand new Assets directory must be indexed before update_file can register its children.
	if filesystem.get_filesystem_path("res://Assets") == null:
		var now := Time.get_ticks_msec()
		if _scan_deadline == 0:
			_scan_deadline = now + 12000
		if now < _scan_deadline and DirAccess.make_dir_recursive_absolute("res://Assets") == OK:
			# scan() may be ignored while Godot finalizes an earlier directory scan.
			if now >= _next_scan:
				_next_scan = now + 500
				filesystem.scan()
			return
		_scheduled = false
		set_process(false)
		reject("Assets 폴더를 Godot 파일시스템에 등록하지 못했습니다.")
		return
	_scheduled = false
	set_process(false)
	_processing = true
	var run := _run
	var files := _files.duplicate()
	var staged := _staged.duplicate()
	var result := await _import(filesystem, files, staged, _from_store)
	_processing = false
	if run == _run:
		if result.get("state") == "done" and _record_undo:
			var scene: Node = _undo_scene.get_ref() if _undo_scene != null else null
			_history.record(scene, result.created, files, _new_directories.duplicate())
		if not _archive_sources.is_empty():
			result.repository = repository.url
		_archive_sources.clear()
		receipt = result
		changed.emit()


func _import(filesystem: EditorFileSystem, files: PackedStringArray, staged: PackedStringArray, from_store: bool) -> Dictionary:
	var staging := staging_root()
	var paths := PackedStringArray()
	var created := PackedStringArray()
	var observed := {}
	var sources := {}
	var fingerprints := {}
	for file in files:
		var product := store_source(file)
		if product.is_empty() or (from_store and not FileAccess.file_exists(product)):
			return _error(file, "에셋 원본 경로를 확인할 수 없습니다.")
		if from_store and file not in staged and FileAccess.file_exists(staging + file):
			staged.append(file)
		if FileAccess.file_exists("res://" + file):
			continue
		if file in staged:
			var pending := staging + file
			if not FileAccess.file_exists(pending):
				return _error(file, "준비한 원본 파일을 찾을 수 없습니다.")
			# A collaborator can edit a waiting source before the store import starts.
			sources[file] = product if from_store and FileAccess.get_sha256(product) == FileAccess.get_sha256(pending) else pending
		elif from_store:
			sources[file] = product
		else:
			return _error(file, "준비한 원본 파일을 찾을 수 없습니다.")

	for file in files:
		var path := "res://" + file
		if not FileAccess.file_exists(path):
			if FileAccess.file_exists(path + ".import") or DirAccess.dir_exists_absolute(path):
				return _rollback(filesystem, fingerprints, file, "프로젝트에 같은 경로가 이미 있습니다.")
			if DirAccess.make_dir_recursive_absolute(path.get_base_dir()) != OK or not _copy_source(file, sources[file], path):
				return _rollback(filesystem, fingerprints, file, "프로젝트 Assets 폴더로 가져올 수 없습니다.")
			fingerprints[path] = FileAccess.get_sha256(path)
			created.append(file)
		filesystem.update_file(path)
		paths.append(path)

	var first := created.size()
	receipt = {"state":"importing", "progress":0.0, "count":0, "first":first, "files":files, "message":"Godot 에셋 임포트 중"}
	changed.emit()
	var on_imported := func(batch: PackedStringArray) -> void:
		for imported in batch:
			observed[imported] = true
	filesystem.resources_reimported.connect(on_imported)
	# Verify each completed file before reporting progress. Godot may redraw between imports.
	var problem := ""
	var failed_path := ""
	for path in paths:
		if path.get_extension() == "svg":
			filesystem.reimport_files(PackedStringArray([path]))
			var remap := ConfigFile.new()
			if not observed.has(path) or remap.load(path + ".import") != OK:
				failed_path = path
				problem = "Godot 임포트 완료를 확인하지 못했습니다."
				break
			var output := str(remap.get_value("remap", "path", ""))
			if output.is_empty() or not remap.get_value("remap", "valid", true) or not FileAccess.file_exists(output) or not ResourceLoader.load(path, "Texture2D", ResourceLoader.CACHE_MODE_IGNORE) is Texture2D:
				failed_path = path
				problem = "변환된 텍스처가 없습니다."
				break
		elif not ResourceLoader.load(path, "AudioStreamWAV", ResourceLoader.CACHE_MODE_IGNORE) is AudioStreamWAV:
			failed_path = path
			problem = "AudioStreamWAV 리소스를 읽을 수 없습니다."
			break
		receipt.count += 1
		receipt.progress = float(receipt.count) / paths.size()
		receipt.message = "에셋 임포트 %d/%d" % [receipt.count, paths.size()]
		changed.emit()
		# Present the verified count and let the editor service input between files.
		if receipt.count < paths.size():
			await get_tree().process_frame
	filesystem.resources_reimported.disconnect(on_imported)
	if not problem.is_empty():
		return _rollback(filesystem, fingerprints, failed_path, problem)
	var cleanup_errors := PackedStringArray()
	for file in staged:
		if FileAccess.file_exists(staging + file) and DirAccess.remove_absolute(staging + file) != OK:
			cleanup_errors.append(file)
	var message := "에셋 %d개 임포트 완료" % files.size()
	if first > 0:
		message += " · 처음 가져온 파일 %d개" % first
	else:
		message += " · 기존 파일 확인"
	if not cleanup_errors.is_empty():
		message += " · 임시 사본 유지: " + ", ".join(cleanup_errors)
	filesystem.scan()
	return {"state":"done", "count":files.size(), "first":first, "created":created, "files":files, "message":message}


func _rollback(filesystem: EditorFileSystem, fingerprints: Dictionary, file: String, reason: String) -> Dictionary:
	for path: String in fingerprints:
		# Preserve content modified by a collaborator during an editor redraw.
		if FileAccess.file_exists(path) and FileAccess.get_sha256(path) == fingerprints[path]:
			if DirAccess.remove_absolute(path) == OK:
				if FileAccess.file_exists(path + ".import"):
					DirAccess.remove_absolute(path + ".import")
				filesystem.update_file(path)
	return _error(file, reason)


func _error(file: String, reason: String) -> Dictionary:
	return {"state":"error", "count":0, "first":0, "files":_files, "message":"%s · %s" % [file, reason]}


func _copy_source(file: String, source: String, path: String) -> bool:
	if source != store_source(file) or not _archive_sources.has(file):
		return DirAccess.copy_absolute(source, path) == OK
	var bytes: PackedByteArray = _archive_sources[file]
	var hash := HashingContext.new()
	hash.start(HashingContext.HASH_SHA256)
	hash.update(bytes)
	if hash.finish().hex_encode() != FileAccess.get_sha256(source):
		return false
	var writer := FileAccess.open(path, FileAccess.WRITE)
	return writer != null and writer.store_buffer(bytes)
