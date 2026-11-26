class_name FTLPkg
extends RefCounted

## Native GDScript reader for FTL 1.6+ Big-Endian PKG\n archive (ftl.dat / ftl.dat.vanilla)
## Directly loads XML data, ship layouts, PNG textures, and OGG/WAV audio with zero extraction.

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
var entry_count: int = 0
var _entries: Dictionary = {} # path -> { "offset": int, "size": int, "uncomp": int, "flags": int }
var _file: FileAccess = null
var _texture_cache: Dictionary = {}
var _audio_cache: Dictionary = {}
var _text_cache: Dictionary = {}


static func _read_be16(buf: PackedByteArray, pos: int) -> int:
	return (buf[pos] << 8) | buf[pos + 1]


static func _read_be32(buf: PackedByteArray, pos: int) -> int:
	return (buf[pos] << 24) | (buf[pos + 1] << 16) | (buf[pos + 2] << 8) | buf[pos + 3]


func auto_open() -> bool:
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
	if header.size() < 16:
		f.close()
		return false
	if header[0] != 0x50 or header[1] != 0x4B or header[2] != 0x47 or header[3] != 0x0A:
		# Not PKG\n format
		f.close()
		return false

	var hdr_size := _read_be16(header, 4)
	var entry_size := _read_be16(header, 6)
	var count := _read_be32(header, 8)
	var name_size := _read_be32(header, 12)
	if entry_size < 20 or count <= 0 or count > 100000 or name_size <= 0:
		f.close()
		return false

	f.seek(hdr_size)
	var table_buf := f.get_buffer(count * entry_size)
	if table_buf.size() < count * entry_size:
		f.close()
		return false

	f.seek(hdr_size + count * entry_size)
	var names_buf := f.get_buffer(name_size)
	if names_buf.size() < name_size:
		f.close()
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
		_entries[name_str] = {
			"offset": data_off,
			"size": data_size,
			"uncomp": uncomp_size,
			"flags": flags,
		}

	_file = f
	archive_path = path
	entry_count = _entries.size()
	is_loaded = true
	return true


func close() -> void:
	if _file != null:
		_file.close()
		_file = null
	_entries.clear()
	_texture_cache.clear()
	_audio_cache.clear()
	_text_cache.clear()
	is_loaded = false
	entry_count = 0
	archive_path = ""


func has_file(rel_path: String) -> bool:
	return _entries.has(rel_path)


func list_prefix(prefix: String) -> Array[String]:
	var out: Array[String] = []
	for k in _entries.keys():
		if str(k).begins_with(prefix):
			out.append(str(k))
	out.sort()
	return out


func read_bytes(rel_path: String) -> PackedByteArray:
	if not is_loaded or _file == null or not _entries.has(rel_path):
		return PackedByteArray()
	var info: Dictionary = _entries[rel_path]
	_file.seek(int(info.offset))
	return _file.get_buffer(int(info.size))


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
	if not has_file(key):
		_texture_cache[key] = null
		return null
	var bytes := read_bytes(key)
	if bytes.is_empty():
		_texture_cache[key] = null
		return null
	var img := Image.new()
	var err := img.load_png_from_buffer(bytes)
	if err != OK:
		_texture_cache[key] = null
		return null
	var tex := ImageTexture.create_from_image(img)
	_texture_cache[key] = tex
	return tex


func load_audio(rel_path: String) -> AudioStream:
	var key := rel_path
	if _audio_cache.has(key):
		return _audio_cache[key]
	if not has_file(key):
		_audio_cache[key] = null
		return null
	var bytes := read_bytes(key)
	if bytes.is_empty():
		_audio_cache[key] = null
		return null
	var stream: AudioStream = null
	if key.to_lower().ends_with(".ogg"):
		stream = AudioStreamOggVorbis.load_from_buffer(bytes)
	elif key.to_lower().ends_with(".wav"):
		stream = _parse_wav_buffer(bytes)
	_audio_cache[key] = stream
	return stream


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
	var ini_path := ""
	if not archive_path.is_empty():
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
