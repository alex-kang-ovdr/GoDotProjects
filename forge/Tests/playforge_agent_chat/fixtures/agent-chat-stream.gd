extends SceneTree

const ChatStream := preload("chat_stream.gd")
var _stream := ChatStream.new()
var _base := ""
var _events := []


func _initialize() -> void:
	_verify.call_deferred()


func _verify() -> void:
	root.add_child(_stream)
	_stream.delta_received.connect(func(text: String) -> void: _events.append(["delta", text]))
	_stream.completed.connect(func(message: Dictionary) -> void: _events.append(["final", message]))
	_stream.failed.connect(func(error: String) -> void: _events.append(["error", error]))
	_base = OS.get_cmdline_user_args()[0]
	if _stream.start("http://example.invalid/api/agent-chat", {}) != ERR_INVALID_PARAMETER:
		_fail("The streaming client must restrict requests to loopback.")
		return
	if not _start("/complete") or not await _wait_for_events(1):
		return
	if _events != [["delta", "안녕"]] or _stream.start(_base + "/complete", {}) != ERR_BUSY:
		_fail("A split UTF-8 delta must arrive before the terminal response and keep the request busy.")
		return
	if not await _wait_for_events(3):
		return
	if _events != [["delta", "안녕"], ["delta", " world"], ["final", {"role": "assistant", "content": "안녕 world"}]]:
		_fail("The streaming client must emit deltas and the final message in order.")
		return
	if not _start("/normal-error") or not await _wait_for_events(1):
		return
	if _events != [["error", "Try later"]]:
		_fail("A regular non-success JSON response must surface the bridge error.")
		return
	if not _start("/redirect") or not await _wait_for_events(1):
		return
	if not _expect_error("리디렉션"):
		return
	if not _start("/truncated") or not await _wait_for_events(2):
		return
	if _events[0] != ["delta", "unfinished"] or not _expect_error("끊겼습니다"):
		return
	if not _start("/large-line") or not await _wait_for_events(1):
		return
	if not _expect_error("너무 깁니다"):
		return
	if not _start("/cancel") or not await _wait_for_events(1):
		return
	_stream.cancel()
	await create_timer(0.3).timeout
	if _events != [["delta", "canceled"]]:
		_fail("Cancellation must suppress old terminal callbacks.")
		return
	if not _start("/stream-error") or not await _wait_for_events(1):
		return
	if _events != [["error", "Provider connection ended"]]:
		_fail("An NDJSON error must be reported after restarting a canceled stream.")
		return
	print("PLAYFORGE_AGENT_CHAT_STREAM_OK")
	quit(0)


func _start(path: String) -> bool:
	_events.clear()
	if _stream.start(_base + path, {"stream": false, "provider": "chatgpt-connect"}) != OK:
		_fail("The local stream could not start: " + path)
		return false
	return true


func _wait_for_events(count: int) -> bool:
	var deadline := Time.get_ticks_msec() + 5000
	while _events.size() < count:
		if Time.get_ticks_msec() >= deadline:
			_fail("Timed out waiting for stream events: " + str(_events))
			return false
		await process_frame
	return true


func _expect_error(text: String) -> bool:
	var event: Array = _events.back()
	if event[0] == "error" and str(event[1]).contains(text):
		return true
	_fail("Expected stream error %s in %s." % [text, _events])
	return false


func _fail(message: String) -> void:
	push_error(message)
	quit(1)
