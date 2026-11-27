class_name ColonyRuntime
extends Node

signal snapshot_received(snapshot: Dictionary)
signal failed(message: String)
signal command_finished(action: String, result: Dictionary)

const DEFAULT_SAVE_PATH := "user://frontier_colony_save.json"
const ACTIONS := ["start", "tick", "command", "save", "load"]
const ENGINE_FILES := [
	"runtime.mjs", "package.json", "engine.js", "colony-systems.js", "hazards.js",
	"colonist-life.js", "economy-data.js", "industry.js", "trade.js",
]
const RESPONSE_TIMEOUT_MS := 120000
const PIPE_READ_SIZE := 65536
const PIPE_READS_PER_FRAME := 32
const PIPE_REQUEST_LIMIT := 3072
const MAX_RESPONSE_BYTES := 16 * 1024 * 1024

var _stage_path := ""
var _pid := -1
var _sequence := 0
var _deadline := 0
var _active: Dictionary = {}
var _queue: Array[Dictionary] = []
var _stdio: FileAccess
var _stderr: FileAccess
var _response_bytes := PackedByteArray()


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS


func request(action: String, payload: Dictionary = {}) -> void:
	if action not in ACTIONS:
		command_finished.emit(action, {"ok": false, "message": "지원하지 않는 동작입니다."})
		return
	var data := payload.duplicate(true)
	if action == "save" or action == "load":
		var path := str(data.get("path", DEFAULT_SAVE_PATH))
		if not path.is_absolute_path():
			path = "user://".path_join(path)
		data["path"] = ProjectSettings.globalize_path(path)
	_sequence += 1
	_queue.push_back({"id": _sequence, "action": action, "payload": data})


func _process(_delta: float) -> void:
	if _pid == -1:
		if _queue.is_empty():
			return
		if not _start_worker():
			return
	if not _active.is_empty():
		_read_response()
	if _pid == -1:
		return
	if not OS.is_process_running(_pid):
		var diagnostics := _stderr.get_buffer(PIPE_READ_SIZE).get_string_from_utf8().strip_edges()
		var message := "시뮬레이션 런타임이 종료되었습니다. Node.js 설치를 확인하세요."
		if not diagnostics.is_empty():
			message += "\n" + diagnostics
		_abort(message)
		return
	if _active.is_empty() and not _queue.is_empty():
		_send_next_request()


func _start_worker() -> bool:
	_stage_path = ProjectSettings.globalize_path("user://").path_join(
		"runtime-%d-%d" % [OS.get_process_id(), Time.get_ticks_usec()]
	)
	if DirAccess.make_dir_recursive_absolute(_stage_path) != OK:
		_abort("시뮬레이션 런타임 폴더를 만들 수 없습니다.")
		return false
	for engine_file in ENGINE_FILES:
		var source := FileAccess.open("res://engine/".path_join(engine_file), FileAccess.READ)
		if source == null:
			_abort("시뮬레이션 모듈을 준비할 수 없습니다. %s" % engine_file)
			return false
		var contents := source.get_buffer(source.get_length())
		source.close()
		var target := FileAccess.open(_stage_path.path_join(engine_file), FileAccess.WRITE)
		if target == null:
			_abort("시뮬레이션 모듈을 복사할 수 없습니다. %s" % engine_file)
			return false
		target.store_buffer(contents)
		var write_error := target.get_error()
		target.close()
		if contents.is_empty() or write_error != OK:
			_abort("시뮬레이션 모듈을 복사할 수 없습니다. %s" % engine_file)
			return false
	var args := PackedStringArray([_stage_path.path_join("runtime.mjs")])
	var configured := OS.get_environment("FRONTIER_COLONY_NODE")
	var candidates := PackedStringArray()
	if not configured.is_empty():
		candidates.append(configured)
	if OS.get_name() == "Windows":
		var installed := OS.get_environment("ProgramFiles").path_join("nodejs/node.exe")
		if FileAccess.file_exists(installed):
			candidates.append(installed)
		candidates.append("node.exe")
	else:
		candidates.append("node")
	for executable in candidates:
		var pipes := OS.execute_with_pipe(executable, args, false)
		if not pipes.is_empty():
			_pid = pipes["pid"]
			_stdio = pipes["stdio"]
			_stderr = pipes["stderr"]
			return true
	_abort("Node.js를 실행할 수 없습니다. 설치 경로나 FRONTIER_COLONY_NODE를 확인하세요.")
	return false


func _send_next_request() -> void:
	_active = _queue.pop_front()
	var bytes := (JSON.stringify(_active, "", false, true) + "\n").to_utf8_buffer()
	# Non-blocking pipes can only accept part of a write larger than their capacity.
	if bytes.size() > PIPE_REQUEST_LIMIT:
		var file := FileAccess.open(_stage_path.path_join("request.json"), FileAccess.WRITE)
		if file == null:
			_abort("시뮬레이션 요청을 기록할 수 없습니다.")
			return
		var stored := file.store_buffer(bytes)
		file.close()
		if not stored:
			_abort("시뮬레이션 요청을 기록할 수 없습니다.")
			return
		bytes = (JSON.stringify({"id": _active["id"], "requestFile": true}) + "\n").to_utf8_buffer()
	if not _stdio.store_buffer(bytes):
		_abort("시뮬레이션 요청을 전달할 수 없습니다.")
		return
	_deadline = Time.get_ticks_msec() + RESPONSE_TIMEOUT_MS


func _read_response() -> void:
	# Read a complete UTF-8 JSON line before decoding. A chunk can end mid-character.
	for index in PIPE_READS_PER_FRAME:
		var chunk := _stdio.get_buffer(PIPE_READ_SIZE)
		if chunk.is_empty():
			break
		_response_bytes.append_array(chunk)
		if chunk[-1] == 10:
			_handle_response(_response_bytes.get_string_from_utf8())
			return
	if Time.get_ticks_msec() >= _deadline:
		_abort("시뮬레이션 응답 시간이 초과되었습니다.")


func _handle_response(line: String) -> void:
	_response_bytes.clear()
	if line.begins_with("~"):
		var compressed := Marshalls.base64_to_raw(line.substr(1).strip_edges())
		var unpacked := compressed.decompress_dynamic(MAX_RESPONSE_BYTES, FileAccess.COMPRESSION_GZIP)
		line = unpacked.get_string_from_utf8()
	var parser := JSON.new()
	var parse_error := parser.parse(line)
	if parse_error != OK or not parser.data is Dictionary:
		_abort("시뮬레이션 응답 형식이 올바르지 않습니다.")
		return
	var reply: Dictionary = parser.data
	if reply.get("id") != _active["id"] or not reply.get("result") is Dictionary:
		_abort("시뮬레이션 요청과 응답이 일치하지 않습니다.")
		return
	var action: String = _active["action"]
	_active = {}
	var state: Variant = reply.get("snapshot")
	if state is Dictionary:
		snapshot_received.emit(state)
	command_finished.emit(action, reply["result"])


func _abort(message: String) -> void:
	_stop_worker()
	failed.emit(message)


func _stop_worker() -> void:
	if _pid > 0 and OS.is_process_running(_pid):
		OS.kill(_pid)
	_pid = -1
	_stdio = null
	_stderr = null
	_response_bytes.clear()
	_active = {}
	_queue.clear()
	if _stage_path.is_empty():
		return
	for filename in DirAccess.get_files_at(_stage_path):
		DirAccess.remove_absolute(_stage_path.path_join(filename))
	DirAccess.remove_absolute(_stage_path)
	_stage_path = ""


func _exit_tree() -> void:
	_stop_worker()
