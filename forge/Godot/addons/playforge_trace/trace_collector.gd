extends Node
## PlayForge TraceSample v1 수집기 (docs/profiling/TRACE_SAMPLE.md).
## 오토로드(PlayForgeTrace)로 등록하거나 trace_main.gd 로 헤드리스 실행한다.
## 사용자 인자(-- 뒤):
##   --trace-out=<절대경로.jsonl>   (필수: 없으면 수집하지 않음)
##   --trace-frames=<N>            측정 프레임 수 (기본 300)
##   --trace-warmup=<N>            버리는 워밍업 프레임 수 (기본 30)
##   --trace-build-id=<id>         없으면 env PLAYFORGE_BUILD_ID, 그래도 없으면 "unknown-local"
##   --trace-quit                  수집 후 엔진 종료(종료 코드 0=성공, 1=쓰기 실패)
## 헤드리스(DisplayServer "headless")에서는 렌더러가 더미라 render 계열 값은 측정이 아니다 →
## exact=false, tags.renderer="dummy" 로 표시한다.

signal finished(path: String, sample_count: int)

const SCHEMA_VERSION := 1
const SOURCE := "godot-runtime"

var out_path := ""
var frames_target := 300
var warmup_frames := 30
var build_id := ""
var quit_when_done := false

var _device := {}
var _headless := false
var _file: FileAccess
var _abs_path := ""
var _count := 0
var _frame := 0
var _measured := 0
var _last_us := 0
var _start_unix := 0.0
var _start_us := 0
var _done := false
var _tags := {}
var _marker: _FrameStartMarker
var _last_cpu_window_ms := -1.0
var _last_phys_window_ms := -1.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	process_priority = 1000000 # 같은 프레임의 다른 노드 처리 뒤에 샘플링
	process_physics_priority = 1000000
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--trace-out="):
			out_path = arg.get_slice("=", 1)
		elif arg.begins_with("--trace-frames="):
			frames_target = maxi(1, int(arg.get_slice("=", 1)))
		elif arg.begins_with("--trace-warmup="):
			warmup_frames = maxi(0, int(arg.get_slice("=", 1)))
		elif arg.begins_with("--trace-build-id="):
			build_id = arg.get_slice("=", 1)
		elif arg == "--trace-quit":
			quit_when_done = true
	if build_id.is_empty():
		build_id = OS.get_environment("PLAYFORGE_BUILD_ID")
	if build_id.is_empty():
		build_id = "unknown-local"
	_headless = DisplayServer.get_name() == "headless"
	var gpu := RenderingServer.get_video_adapter_name()
	var driver := RenderingServer.get_video_adapter_api_version()
	_device = {
		"os": "%s %s" % [OS.get_name(), OS.get_version()],
		"cpu": _non_empty(OS.get_processor_name()),
		"gpu": "none (headless)" if _headless or gpu.is_empty() else gpu,
		"driver": "none (headless)" if _headless or driver.is_empty() else driver,
	}
	var renderer := str(ProjectSettings.get_setting("rendering/renderer/rendering_method", "unknown"))
	_tags = {
		"renderer": "dummy" if _headless else renderer,
		"engine": Engine.get_version_info().get("string", "unknown"),
		"warmup": warmup_frames,
	}
	_start_unix = Time.get_unix_time_from_system()
	_start_us = Time.get_ticks_usec()
	_last_us = _start_us
	# 같은 프레임에서 가장 먼저 도는 마커 → 수집기(가장 나중)까지의 간격 = 노드 _process 콜백 구간의 실측 CPU 시간
	_marker = _FrameStartMarker.new()
	_marker.name = "PlayForgeTraceFrameStart"
	add_child(_marker)
	if not out_path.is_empty():
		# 줄 단위로 바로 기록한다(메모리에 쌓아 두면 mem.static_bytes 측정에 수집기 자신이 섞인다)
		_abs_path = out_path if out_path.is_absolute_path() else ProjectSettings.globalize_path(out_path)
		DirAccess.make_dir_recursive_absolute(_abs_path.get_base_dir())
		_file = FileAccess.open(_abs_path, FileAccess.WRITE)
		if _file == null:
			push_error("PlayForgeTrace: 쓰기 실패 %s (%s)" % [_abs_path, error_string(FileAccess.get_open_error())])
	var active := _file != null
	set_process(active)
	set_physics_process(active)
	if out_path.is_empty():
		push_warning("PlayForgeTrace: --trace-out 이 없어 수집하지 않습니다.")
	elif not active and quit_when_done:
		get_tree().quit.call_deferred(1)


func _process(_delta: float) -> void:
	if _done:
		return
	var now := Time.get_ticks_usec()
	var wall_ms := (now - _last_us) / 1000.0
	_last_us = now
	_frame += 1
	if _frame <= warmup_frames:
		return
	var f := Engine.get_process_frames()
	var ts := _iso(now)
	_emit("frame.wall_ms", wall_ms, "ms", true, "engine_frame", f, -1, ts)
	if _marker.frame == Engine.get_process_frames() and _marker.start_us > 0:
		_emit("frame.process_ms", (now - _marker.start_us) / 1000.0, "ms", true, "engine_frame", f, -1, ts)
	# TIME_PROCESS 는 매 프레임 값이 아니라 엔진이 1초마다 갱신하는 "직전 1초 구간의 최대 process 시간"이다.
	# → 원시 샘플로 위장하지 않고 사전 집계 지표(.max)로, 값이 갱신될 때만 기록한다.
	var cpu_ms := Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
	if cpu_ms > 0.0 and cpu_ms != _last_cpu_window_ms:
		_last_cpu_window_ms = cpu_ms
		_emit("frame.cpu_ms.max", cpu_ms, "ms", true, "engine_frame", f, -1, ts, {"window": "1s"})
	_emit("mem.static_bytes", Performance.get_monitor(Performance.MEMORY_STATIC), "bytes", true, "engine_frame", f, -1, ts)
	_emit("mem.static_max_bytes", Performance.get_monitor(Performance.MEMORY_STATIC_MAX), "bytes", true, "engine_frame", f, -1, ts)
	_emit("obj.count", Performance.get_monitor(Performance.OBJECT_COUNT), "count", true, "engine_frame", f, -1, ts)
	_emit("obj.resource_count", Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT), "count", true, "engine_frame", f, -1, ts)
	_emit("obj.node_count", Performance.get_monitor(Performance.OBJECT_NODE_COUNT), "count", true, "engine_frame", f, -1, ts)
	_emit("obj.orphan_node_count", Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT), "count", true, "engine_frame", f, -1, ts)
	var render_exact := not _headless
	_emit("draw.calls", Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME), "count", render_exact, "engine_frame", f, -1, ts)
	_emit("draw.primitives", Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME), "count", render_exact, "engine_frame", f, -1, ts)
	_emit("draw.objects", Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME), "count", render_exact, "engine_frame", f, -1, ts)
	_emit("mem.video_bytes", Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED), "bytes", render_exact, "engine_frame", f, -1, ts)
	_measured += 1
	if _measured >= frames_target:
		_finish()


func _physics_process(_delta: float) -> void:
	if _done or _frame <= warmup_frames:
		return
	# TIME_PHYSICS_PROCESS 도 1초 구간 최대값으로 갱신된다 (TIME_PROCESS 와 동일) → 갱신 시에만 .max 로 기록.
	var phys_ms := Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0
	if phys_ms > 0.0 and phys_ms != _last_phys_window_ms:
		_last_phys_window_ms = phys_ms
		_emit("physics.step_ms.max", phys_ms, "ms", true, "physics_tick", -1, Engine.get_physics_frames(),
			_iso(Time.get_ticks_usec()), {"window": "1s"})


func _emit(metric: String, value: float, unit: String, exact: bool, clock: String, frame: int, tick: int, ts: String, extra_tags: Dictionary = {}) -> void:
	var s := {
		"schemaVersion": SCHEMA_VERSION,
		"build_id": build_id,
		"source": SOURCE,
		"device": _device,
		"clock_domain": clock,
	}
	if frame >= 0:
		s["frame"] = frame
	if tick >= 0:
		s["tick"] = tick
	s["metric"] = metric
	s["value"] = value
	s["unit"] = unit
	s["exact"] = exact
	s["ts"] = ts
	if extra_tags.is_empty():
		s["tags"] = _tags
	else:
		var t := _tags.duplicate()
		t.merge(extra_tags, true)
		s["tags"] = t
	_file.store_line(JSON.stringify(s, "", false))
	_count += 1


func _finish() -> void:
	_done = true
	set_process(false)
	set_physics_process(false)
	var ok := _file.get_error() == OK
	_file.close()
	if ok:
		print("PLAYFORGE_TRACE_COMPLETE samples=%d frames=%d out=%s" % [_count, _measured, _abs_path])
	else:
		push_error("PlayForgeTrace: 기록 중 오류 %s" % _abs_path)
	finished.emit(_abs_path, _count if ok else 0)
	if quit_when_done:
		get_tree().quit(0 if ok else 1)


func _iso(ticks_us: int) -> String:
	var t := _start_unix + float(ticks_us - _start_us) / 1000000.0
	var secs := int(floor(t))
	var ms := int((t - secs) * 1000.0)
	return "%s.%03dZ" % [Time.get_datetime_string_from_unix_time(secs, false), ms]


class _FrameStartMarker extends Node:
	var start_us := 0
	var frame := -1

	func _ready() -> void:
		process_mode = Node.PROCESS_MODE_ALWAYS
		process_priority = -1000000

	func _process(_delta: float) -> void:
		start_us = Time.get_ticks_usec()
		frame = Engine.get_process_frames()


static func _non_empty(v: String) -> String:
	return v if not v.strip_edges().is_empty() else "unknown"
