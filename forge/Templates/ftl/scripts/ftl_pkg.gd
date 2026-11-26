class_name FTLPkg
extends RefCounted

## Native GDScript reader for FTL 1.6+ Big-Endian PKG\n archive (ftl.dat / ftl.dat.vanilla)
## Supports 3 modes seamlessly:
##  1. Desktop direct file read (C:\Temp\FTL\ftl.dat.vanilla) — zero extraction, O(1) seek
##  2. Godot Web HTTP bridge (<origin>/ftl-pkg/xml-bundle.json + lazy PNG/OGG/WAV streaming)
##  3. Godot Web in-memory PKG buffer (from browser file picker via JavaScriptBridge)

signal data_pack_ready(ok: bool)
signal texture_loaded(rel_path: String)
signal audio_loaded(rel_path: String)

const DEFAULT_CANDIDATES := [
	"C:/Temp/FTL/ftl.dat.vanilla",
	"C:/Temp/FTL/ftl.dat",
	"res://ftl.dat.vanilla",
	"res://ftl.dat",
	"C:/Program Files (x86)/Steam/steamapps/common/FTL Faster Than Light/ftl.dat",
	"C:/Program Files/Steam/steamapps/common/FTL Faster Than Light/ftl.dat",
]

var archive_path: String = ""
var is_loaded: bool = false
var web_http_mode: bool = false
var web_base_url: String = ""
var entry_count: int = 0

var _entries: Dictionary = {} # path -> { "offset": int, "size": int, "uncomp": int, "flags": int }
var _web_files: Dictionary = {} # path -> true
var _file: FileAccess = null
var _mem_buf: PackedByteArray = PackedByteArray()
var _texture_cache: Dictionary = {}
var _audio_cache: Dictionary = {}
var _text_cache: Dictionary = {}

# Web HTTP request queue (pooled for smooth non-blocking WASM streaming)
var _http_host: Node = null
var _pending_requests: Dictionary = {} # key -> true
var _req_queue: Array = [] # { "kind": "tex"|"aud", "key": String }
var _active_reqs: int = 0
const MAX_CONCURRENT_HTTP := 8


static func _read_be16(buf: PackedByteArray, pos: int) -> int:
	return (buf[pos] << 8) | buf[pos + 1]


static func _read_be32(buf: PackedByteArray, pos: int) -> int:
	return (buf[pos] << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3]


func auto_open() -> bool:
	if OS.has_feature("web"):
		return false
	var candidates: Array[String] = []
	var env_path := OS.get_environment("FTL_DAT_PATH").strip_edges()
	if not env_path.is_empty():
		candidates.append(env_path.replace("\\", "/"))
	if FileAccess.file_exists("user://ftl_dat_path.txt"):
		var saved := FileAccess.get_file_as_string("user://ftl_dat_path.txt").strip_edges()
		if not saved.is_empty():
			candidates.append(saved.replace("\\", "/"))
	for p in DEFAULT_CANDIDATES:
		candidates.append(p)
	for path in candidates:
		if FileAccess.file_exists(path):
			if open_archive(path):
				return true
	return false


func open_archive(path: String) -> bool:
	close()
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return false
	var header := f.get_buffer(16)
	if not _parse_pkg_header_from_file(f, header):
		f.close()
		return false
	_file = f
	archive_path = path
	entry_count = _entries.size()
	is_loaded = true
	return true


func open_archive_buffer(buf: PackedByteArray, label: String = "browser:ftl.dat") -> bool:
	close()
	if buf.size() < 16:
		return false
	if buf[0] != 0x50 or buf[1] != 0x4B or buf[2] != 0x47 or buf[3] != 0x0A:
		return false
	var hdr_size := _read_be16(buf, 4)
	var entry_size := _read_be16(buf, 6)
	var count := _read_be32(buf, 8)
	var name_size := _read_be32(buf, 12)
	var names_base := hdr_size + count * entry_size
	if entry_size < 20 or count <= 0 or count > 100000 or names_base + name_size > buf.size():
		return false
	_entries.clear()
	for i in range(count):
		var base := hdr_size + i * entry_size
		var name_off_raw := _read_be32(buf, base + 4)
		var data_off := _read_be32(buf, base + 8)
		var data_size := _read_be32(buf, base + 12)
		var uncomp_size := _read_be32(buf, base + 16)
		var flags := (name_off_raw >> 24) & 0xFF
		var name_off := name_off_raw & 0x00FFFFFF
		if name_off >= name_size:
			continue
		var end := name_off
		while end < name_size and buf[names_base + end] != 0:
			end += 1
		var name_str := buf.slice(names_base + name_off, names_base + end).get_string_from_utf8()
		_entries[name_str] = {"offset": data_off, "size": data_size, "uncomp": uncomp_size, "flags": flags}
	_mem_buf = buf
	archive_path = label
	entry_count = _entries.size()
	is_loaded = true
	return true


func _parse_pkg_header_from_file(f: FileAccess, header: PackedByteArray) -> bool:
	if header.size() < 16:
		return false
	if header[0] != 0x50 or header[1] != 0x4B or header[2] != 0x47 or header[3] != 0x0A:
		return false
	var hdr_size := _read_be16(header, 4)
	var entry_size := _read_be16(header, 6)
	var count := _read_be32(header, 8)
	var name_size := _read_be32(header, 12)
	if entry_size < 20 or count <= 0 or count > 100000 or name_size <= 0:
		return false
	f.seek(hdr_size)
	var table_buf := f.get_buffer(count * entry_size)
	if table_buf.size() < count * entry_size:
		return false
	f.seek(hdr_size + count * entry_size)
	var names_buf := f.get_buffer(name_size)
	if names_buf.size() < name_size:
		return false
	_entries.clear()
	for i in range(count):
		var base := i * entry_size
		var name_off_raw := _read_be32(table_buf, base + 4)
		var data_off := _read_be32(table_buf, base + 8)
		var data_size := _read_be32(table_buf, base + 12)
		var uncomp_size := _read_be32(table_buf, base + 16)
		var flags := (name_off_raw >> 24) & 0xFF
		var name_off := name_off_raw & 0x00FFFFFF
		if name_off >= name_size:
			continue
		var end := name_off
		while end < name_size and names_buf[end] != 0:
			end += 1
		var name_str := names_buf.slice(name_off, end).get_string_from_utf8()
		_entries[name_str] = {"offset": data_off, "size": data_size, "uncomp": uncomp_size, "flags": flags}
	return true


# ==================== WEB HTTP STREAMING BRIDGE ====================
func start_web_bootstrap(host_node: Node, explicit_base_url: String = "") -> bool:
	_http_host = host_node
	if _http_host == null:
		return false
	var base := explicit_base_url.strip_edges()
	if base.is_empty():
		var env_url := OS.get_environment("FTL_WEB_BASE_URL").strip_edges()
		if not env_url.is_empty():
			base = env_url
		elif OS.has_feature("web"):
			var href := str(JavaScriptBridge.eval("window.location.href.split('?')[0].split('#')[0].replace(/\\/[^\\/]*$/, '/')", true))
			if href.begins_with("http://") or href.begins_with("https://"):
				base = href
	if base.is_empty():
		return false
	if not base.ends_with("/"):
		base += "/"
	web_base_url = base

	var req := HTTPRequest.new()
	req.accept_gzip = false
	req.timeout = 15.0
	_http_host.add_child(req)
	req.request_completed.connect(func(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray):
		req.queue_free()
		if result != HTTPRequest.RESULT_SUCCESS or code != 200 or body.is_empty():
			data_pack_ready.emit(false)
			return
		var parsed = JSON.parse_string(body.get_string_from_utf8())
		if not (parsed is Dictionary):
			data_pack_ready.emit(false)
			return
		close()
		web_base_url = base
		_http_host = host_node
		var files_dict: Dictionary = parsed.get("files", {})
		for k in files_dict.keys():
			var ks := str(k)
			_text_cache[ks] = str(files_dict[k])
			_web_files[ks] = true
		for item in parsed.get("index", []):
			_web_files[str(item)] = true
		archive_path = "web:" + str(parsed.get("archive", "ftl.dat.vanilla"))
		entry_count = maxi(_web_files.size(), int(parsed.get("entry_count", 0)))
		web_http_mode = true
		is_loaded = true
		data_pack_ready.emit(true)
	)
	var err := req.request(web_base_url + "ftl-pkg/xml-bundle.json")
	if err != OK:
		req.queue_free()
		return false
	return true


func _enqueue_web_asset(kind: String, key: String) -> void:
	if not web_http_mode or _http_host == null or _pending_requests.has(key):
		return
	if not _web_files.has(key):
		if kind == "tex":
			_texture_cache[key] = null
		else:
			_audio_cache[key] = null
		return
	_pending_requests[key] = true
	_req_queue.append({"kind": kind, "key": key})
	_pump_web_queue()


func _pump_web_queue() -> void:
	while _active_reqs < MAX_CONCURRENT_HTTP and not _req_queue.is_empty():
		if _http_host == null or not is_instance_valid(_http_host):
			_req_queue.clear()
			return
		var item: Dictionary = _req_queue.pop_front()
		var kind := str(item.kind)
		var key := str(item.key)
		_active_reqs += 1
		var req := HTTPRequest.new()
		req.accept_gzip = false
		req.timeout = 12.0
		_http_host.add_child(req)
		req.request_completed.connect(func(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray):
			req.queue_free()
			_active_reqs = maxi(0, _active_reqs - 1)
			_pending_requests.erase(key)
			if result == HTTPRequest.RESULT_SUCCESS and code == 200 and not body.is_empty():
				if kind == "tex":
					var img := Image.new()
					if img.load_png_from_buffer(body) == OK:
						_texture_cache[key] = ImageTexture.create_from_image(img)
						texture_loaded.emit(key)
					else:
						_texture_cache[key] = null
				else:
					var stream := _decode_audio_buffer(key, body)
					_audio_cache[key] = stream
					if stream != null:
						audio_loaded.emit(key)
			else:
				if kind == "tex":
					_texture_cache[key] = null
				else:
					_audio_cache[key] = null
			_pump_web_queue()
		)
		var url := web_base_url + "ftl-pkg/raw/" + key
		if req.request(url) != OK:
			req.queue_free()
			_active_reqs = maxi(0, _active_reqs - 1)
			_pending_requests.erase(key)


func close() -> void:
	if _file != null:
		_file.close()
		_file = null
	_mem_buf = PackedByteArray()
	_entries.clear()
	_web_files.clear()
	_texture_cache.clear()
	_audio_cache.clear()
	_text_cache.clear()
	_pending_requests.clear()
	_req_queue.clear()
	_active_reqs = 0
	is_loaded = false
	web_http_mode = false
	entry_count = 0
	archive_path = ""


func has_file(rel_path: String) -> bool:
	if web_http_mode:
		return _web_files.has(rel_path) or _text_cache.has(rel_path)
	return _entries.has(rel_path)


func list_prefix(prefix: String) -> Array[String]:
	var out: Array[String] = []
	var src := _web_files if web_http_mode else _entries
	for k in src.keys():
		if str(k).begins_with(prefix):
			out.append(str(k))
	out.sort()
	return out


func read_bytes(rel_path: String) -> PackedByteArray:
	if not is_loaded or web_http_mode or not _entries.has(rel_path):
		return PackedByteArray()
	var info: Dictionary = _entries[rel_path]
	var off := int(info.offset)
	var sz := int(info.size)
	if _file != null:
		_file.seek(off)
		return _file.get_buffer(sz)
	if not _mem_buf.is_empty() and off + sz <= _mem_buf.size():
		return _mem_buf.slice(off, off + sz)
	return PackedByteArray()


func read_text(rel_path: String) -> String:
	if _text_cache.has(rel_path):
		return _text_cache[rel_path]
	var bytes := read_bytes(rel_path)
	if bytes.is_empty():
		return ""
	var text := bytes.get_string_from_utf8()
	if text.begins_with("\uFEFF"):
		text = text.substr(1)
	_text_cache[rel_path] = text
	return text


func load_texture(rel_path: String) -> Texture2D:
	var key := rel_path
	if not key.begins_with("img/"):
		key = "img/" + key
	if _texture_cache.has(key):
		return _texture_cache[key]
	if web_http_mode:
		_enqueue_web_asset("tex", key)
		return null
	if not has_file(key):
		_texture_cache[key] = null
		return null
	var bytes := read_bytes(key)
	if bytes.is_empty():
		_texture_cache[key] = null
		return null
	var img := Image.new()
	if img.load_png_from_buffer(bytes) != OK:
		_texture_cache[key] = null
		return null
	var tex := ImageTexture.create_from_image(img)
	_texture_cache[key] = tex
	return tex


func load_audio(rel_path: String) -> AudioStream:
	var key := rel_path
	if _audio_cache.has(key):
		return _audio_cache[key]
	if web_http_mode:
		_enqueue_web_asset("aud", key)
		return null
	if not has_file(key):
		_audio_cache[key] = null
		return null
	var bytes := read_bytes(key)
	if bytes.is_empty():
		_audio_cache[key] = null
		return null
	var stream := _decode_audio_buffer(key, bytes)
	_audio_cache[key] = stream
	return stream


static func _decode_audio_buffer(key: String, bytes: PackedByteArray) -> AudioStream:
	if key.to_lower().ends_with(".ogg"):
		return AudioStreamOggVorbis.load_from_buffer(bytes)
	if key.to_lower().ends_with(".wav"):
		return _parse_wav_buffer(bytes)
	return null


static func _parse_wav_buffer(buf: PackedByteArray) -> AudioStreamWAV:
	if buf.size() < 44:
		return null
	if buf.slice(0, 4).get_string_from_ascii() != "RIFF" or buf.slice(8, 12).get_string_from_ascii() != "WAVE":
		return null
	var pos := 12
	var channels := 1
	var sample_rate := 44100
	var bits_per_sample := 16
	var pcm_data := PackedByteArray()
	while pos + 8 <= buf.size():
		var chunk_id := buf.slice(pos, pos + 4).get_string_from_ascii()
		var chunk_size := buf.decode_u32(pos + 4)
		pos += 8
		if chunk_id == "fmt " and pos + 16 <= buf.size():
			channels = buf.decode_u16(pos + 2)
			sample_rate = buf.decode_u32(pos + 4)
			bits_per_sample = buf.decode_u16(pos + 14)
		elif chunk_id == "data" and pos + chunk_size <= buf.size():
			pcm_data = buf.slice(pos, pos + chunk_size)
			break
		pos += chunk_size
		if chunk_size % 2 == 1:
			pos += 1
	if pcm_data.is_empty():
		return null
	var wav := AudioStreamWAV.new()
	wav.mix_rate = sample_rate
	wav.stereo = (channels >= 2)
	wav.format = AudioStreamWAV.FORMAT_16_BITS if bits_per_sample == 16 else AudioStreamWAV.FORMAT_8_BITS
	wav.data = pcm_data
	return wav


func load_settings_ini() -> Dictionary:
	var result := {"music": 100, "sound": 100, "difficulty": 0, "dlcEnabled": 1}
	if OS.has_feature("web"):
		return result
	var ini_path := ""
	if not archive_path.is_empty() and not web_http_mode:
		var dir := archive_path.get_base_dir()
		var cand := dir.path_join("settings.ini")
		if FileAccess.file_exists(cand):
			ini_path = cand
	if ini_path.is_empty() and FileAccess.file_exists("C:/Temp/FTL/settings.ini"):
		ini_path = "C:/Temp/FTL/settings.ini"
	if ini_path.is_empty():
		return result
	var txt := FileAccess.get_file_as_string(ini_path)
	for raw_line in txt.split("\n"):
		var line := raw_line.strip_edges()
		if line.is_empty() or line.begins_with("#") or not line.contains("="):
			continue
		var parts := line.split("=", true, 1)
		var k := parts[0].strip_edges()
		var v := parts[1].strip_edges()
		if v.is_valid_int():
			result[k] = int(v)
		else:
			result[k] = v
	return result
