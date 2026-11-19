@tool
extends Node

signal delta_received(text: String)
signal completed(message: Dictionary)
signal failed(error: String)

const TIMEOUT_MS := 180000
const REQUEST_BYTES := 4 * 1024 * 1024
const RESPONSE_BYTES := 2 * 1024 * 1024
const LINE_BYTES := 512 * 1024
const URL_PATTERN := "^https?://(localhost|127[.]0[.]0[.]1|\\[::1\\])(?::([0-9]{1,5}))?(/[^\\s#]*)$"
const WEB_BRIDGE := """
Object.defineProperty(window, %s, {
	configurable: true,
	value: {
		start(endpoint, body, notify, maxBytes, timeout) {
			const controller = new AbortController();
			const timer = setTimeout(() => {
				controller.abort();
				notify('timeout');
			}, timeout);
			(async () => {
				let reader;
				try {
					const response = await fetch(endpoint, {
						method: 'POST', body, signal: controller.signal, redirect: 'error',
						cache: 'no-store', credentials: 'same-origin',
						headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
					});
					if (controller.signal.aborted) return;
					notify('headers', response.status, response.headers.get('Content-Type') || '');
					if (controller.signal.aborted) return;
					reader = response.body?.getReader();
					let bytes = 0;
					while (reader && !controller.signal.aborted) {
						const chunk = await reader.read();
						if (controller.signal.aborted || chunk.done) break;
						bytes += chunk.value.byteLength;
						if (bytes > maxBytes) {
							notify('size');
							break;
						}
						notify('chunk', chunk.value);
					}
					if (!controller.signal.aborted) notify('end');
				} catch (_) {
					if (!controller.signal.aborted) notify('connection');
				} finally {
					clearTimeout(timer);
					if (reader) reader.releaseLock();
				}
			})();
			return { abort() { clearTimeout(timer); controller.abort(); } };
		}
	}
});
"""

var _http: HTTPClient
var _web_request: JavaScriptObject
var _web_callback: JavaScriptObject
var _active := false
var _generation := 0
var _sent := false
var _status := 0
var _deadline := 0
var _received_bytes := 0
var _authority := ""
var _path := ""
var _request := PackedByteArray()
var _pending := PackedByteArray()


func _ready() -> void:
	set_process(_active)


func _exit_tree() -> void:
	cancel()


func start(endpoint: String, body: Dictionary) -> Error:
	if _active:
		return ERR_BUSY
	var matcher := RegEx.create_from_string(URL_PATTERN)
	var match_result := matcher.search(endpoint)
	if match_result == null or not is_inside_tree():
		return ERR_INVALID_PARAMETER
	var https := endpoint.begins_with("https://")
	var host := match_result.get_string(1)
	var port_text := match_result.get_string(2)
	var port := int(port_text) if not port_text.is_empty() else (443 if https else 80)
	if port <= 0 or port > 65535:
		return ERR_INVALID_PARAMETER
	var payload := body.duplicate()
	payload.stream = true
	var json := JSON.stringify(payload)
	var bytes := json.to_utf8_buffer()
	if bytes.size() > REQUEST_BYTES:
		return ERR_INVALID_DATA
	_generation += 1
	_active = true
	_deadline = Time.get_ticks_msec() + TIMEOUT_MS
	if OS.has_feature("web"):
		var err := _start_web(endpoint, json)
		if err != OK:
			cancel()
			return err
	else:
		_request = bytes
		_authority = host + (":" + port_text if not port_text.is_empty() else "")
		_path = match_result.get_string(3)
		_http = HTTPClient.new()
		_http.read_chunk_size = 16384
		var err := _http.connect_to_host(host.trim_prefix("[").trim_suffix("]"), port, TLSOptions.client() if https else null)
		if err != OK:
			cancel()
			return err
	set_process(true)
	return OK


func cancel() -> void:
	_generation += 1
	_active = false
	set_process(false)
	if _http != null:
		_http.close()
		_http = null
	if _web_request != null:
		_web_request.abort()
		_web_request = null
	_web_callback = null
	_request.clear()
	_pending.clear()
	_status = 0
	_sent = false
	_received_bytes = 0


func _process(_delta: float) -> void:
	if Time.get_ticks_msec() >= _deadline:
		_fail("응답 시간이 %d초를 넘었습니다." % int(TIMEOUT_MS / 1000))
		return
	if _http == null:
		return
	var request := _generation
	var state := _http.get_status()
	if state != HTTPClient.STATUS_DISCONNECTED and _http.poll() != OK:
		_fail("AI 응답에 연결하지 못했습니다.")
		return
	state = _http.get_status()
	if _sent and _status == 0 and _http.has_response():
		var headers := _http.get_response_headers_as_dictionary()
		var type := ""
		for name: String in headers:
			if name.to_lower() == "content-type":
				type = str(headers[name])
				break
		_accept_headers(_http.get_response_code(), type)
		if request != _generation:
			return
	match state:
		HTTPClient.STATUS_CONNECTED:
			if not _sent:
				_send_native()
			else:
				_finish_stream()
		HTTPClient.STATUS_BODY:
			_read_native()
		HTTPClient.STATUS_DISCONNECTED:
			_finish_stream()
		HTTPClient.STATUS_CANT_RESOLVE, HTTPClient.STATUS_CANT_CONNECT, HTTPClient.STATUS_CONNECTION_ERROR, HTTPClient.STATUS_TLS_HANDSHAKE_ERROR:
			_fail("AI 응답에 연결하지 못했습니다.")


func _send_native() -> void:
	var headers := ["Host: " + _authority, "Content-Type: application/json", "Accept: application/x-ndjson", "Accept-Encoding: identity"]
	var err := _http.request_raw(HTTPClient.METHOD_POST, _path, headers, _request)
	_request.clear()
	_sent = true
	if err != OK:
		_fail("AI 요청을 시작하지 못했습니다.")


func _read_native() -> void:
	var request := _generation
	for index in range(8):
		var chunk := _http.read_response_body_chunk()
		if chunk.is_empty():
			break
		_ingest(chunk)
		if request != _generation:
			return
	var state := _http.get_status()
	if state in [HTTPClient.STATUS_CONNECTED, HTTPClient.STATUS_DISCONNECTED]:
		_finish_stream()
	elif state != HTTPClient.STATUS_BODY:
		_fail("AI 응답이 중단되었습니다.")


func _start_web(endpoint: String, json: String) -> Error:
	var key := "__playforgeChatStream_" + Crypto.new().generate_random_bytes(12).hex_encode()
	var encoded_key := JSON.stringify(key)
	JavaScriptBridge.eval(WEB_BRIDGE % encoded_key, true)
	var bridge := JavaScriptBridge.get_interface(key)
	JavaScriptBridge.eval("delete window[" + encoded_key + "]", true)
	if bridge == null:
		return ERR_UNAVAILABLE
	_web_callback = JavaScriptBridge.create_callback(_on_web_event.bind(_generation))
	_web_request = bridge.start(endpoint, json, _web_callback, RESPONSE_BYTES, TIMEOUT_MS)
	return OK if _web_request != null else ERR_UNAVAILABLE


func _on_web_event(args: Array, generation: int) -> void:
	if not _active or generation != _generation or args.is_empty():
		return
	match args[0]:
		"headers":
			_accept_headers(int(args[1]), str(args[2]))
		"chunk":
			_ingest(JavaScriptBridge.js_buffer_to_packed_byte_array(args[1]))
		"end":
			_finish_stream()
		"size":
			_fail("AI 응답의 크기 제한을 넘었습니다.")
		"timeout":
			_fail("응답 시간이 %d초를 넘었습니다." % int(TIMEOUT_MS / 1000))
		"connection":
			_fail("AI 응답에 연결하지 못했습니다.")


func _accept_headers(status: int, content_type: String) -> void:
	_status = status
	if 300 <= status and status < 400:
		_fail("AI 응답 리디렉션을 사용할 수 없습니다.")
	elif _is_success() and content_type.get_slice(";", 0).strip_edges().to_lower() != "application/x-ndjson":
		_fail("AI 응답의 스트리밍 형식이 올바르지 않습니다.")


func _ingest(chunk: PackedByteArray) -> void:
	_received_bytes += chunk.size()
	if _received_bytes > RESPONSE_BYTES:
		_fail("AI 응답의 크기 제한을 넘었습니다.")
		return
	_pending.append_array(chunk)
	if not _is_success():
		return
	var request := _generation
	var offset := 0
	var newline := _pending.find(10)
	while newline >= 0:
		if newline - offset > LINE_BYTES:
			_fail("AI 응답의 한 줄이 너무 깁니다.")
			return
		_consume_line(_pending.slice(offset, newline))
		if request != _generation:
			return
		offset = newline + 1
		newline = _pending.find(10, offset)
	if offset > 0:
		_pending = _pending.slice(offset)
	if _pending.size() > LINE_BYTES:
		_fail("AI 응답의 한 줄이 너무 깁니다.")


func _consume_line(raw: PackedByteArray) -> void:
	var text := raw.get_string_from_utf8().strip_edges()
	if text.is_empty():
		return
	var event: Variant = _parse_json(text)
	if event is Dictionary:
		match event.get("type"):
			"delta":
				if event.get("text") is String:
					if not event.text.is_empty():
						delta_received.emit(event.text)
					return
			"final":
				if event.get("message") is Dictionary:
					var message: Dictionary = event.message
					cancel()
					completed.emit(message)
					return
			"error":
				_fail(_error_text(event, "AI 응답을 완료하지 못했습니다."))
				return
	_fail("AI 응답의 스트리밍 데이터가 올바르지 않습니다.")


func _finish_stream() -> void:
	if _status == 0:
		_fail("AI 응답에 연결하지 못했습니다.")
	elif not _is_success():
		var response: Variant = _parse_json(_pending.get_string_from_utf8())
		_fail(_error_text(response, "AI 요청에 실패했습니다. (HTTP %d)" % _status))
	else:
		var request := _generation
		if not _pending.is_empty():
			_consume_line(_pending)
		if request == _generation:
			_fail("AI 응답이 완료되기 전에 연결이 끊겼습니다.")


func _is_success() -> bool:
	return _status >= 200 and _status < 300


func _parse_json(text: String) -> Variant:
	var parser := JSON.new()
	return parser.data if parser.parse(text) == OK else null


func _error_text(response: Variant, fallback: String) -> String:
	if response is Dictionary and response.get("error") is String and not response.error.is_empty():
		return response.error.left(1024)
	return fallback


func _fail(error: String) -> void:
	cancel()
	failed.emit(error)
