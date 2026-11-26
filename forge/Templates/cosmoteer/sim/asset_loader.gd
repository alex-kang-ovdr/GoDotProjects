extends Node

## Runtime asset & resource loader for extracted C:\Temp\Cosmoteer\ assets.
## - Desktop / Headless: loads directly from res://extracted_assets/ (or COSMOTEER_DATA / C:/Temp/Cosmoteer/Data).
## - Web Godot (WASM): asynchronously fetches /cosmoteer-assets/web_atlas.json + web_atlas.png from host origin.
## Gracefully falls back to procedural vector rendering & synthesized SFX if external assets are unavailable.

signal assets_ready(part_count: int)

const INDEX_PATH := "res://data/asset_index.json"

static var instance: Node = null

var index: Dictionary = {}
var data_root := ""
var extracted_root := ""
var atlas_texture: Texture2D = null
var atlas_parts: Dictionary = {}   # id -> {"cutaway": AtlasTexture, "roof": AtlasTexture, "turret": AtlasTexture}
var atlas_sprites: Dictionary = {} # key -> AtlasTexture (clouds, asteroids, crew, shots, explosions)
var direct_cache: Dictionary = {}  # "id|variant" -> Texture2D
var wav_cache: Dictionary = {}    # sfx_kind -> AudioStreamWAV
var use_original_sprites := true
var loaded_count := 0
var _http_json: HTTPRequest = null
var _http_png: HTTPRequest = null
var _pending_meta: Dictionary = {}


func _ready() -> void:
	instance = self
	load_index()
	if OS.has_feature("web"):
		_start_web_atlas_fetch()
	else:
		_discover_local_roots()
		_load_local_atlas()


func load_index() -> void:
	if not index.is_empty():
		return
	if not FileAccess.file_exists(INDEX_PATH):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(INDEX_PATH))
	if parsed is Dictionary:
		index = parsed


func _discover_local_roots() -> void:
	var local_extracted := ProjectSettings.globalize_path("res://extracted_assets")
	if DirAccess.dir_exists_absolute(local_extracted):
		extracted_root = local_extracted
		var data_cand := local_extracted.path_join("Data")
		if DirAccess.dir_exists_absolute(data_cand):
			data_root = data_cand
	if data_root.is_empty():
		var env_data := OS.get_environment("COSMOTEER_DATA")
		if not env_data.is_empty() and DirAccess.dir_exists_absolute(env_data):
			data_root = env_data
	if data_root.is_empty() and DirAccess.dir_exists_absolute("C:/Temp/Cosmoteer/Data"):
		data_root = "C:/Temp/Cosmoteer/Data"


func _load_local_atlas() -> void:
	if extracted_root.is_empty():
		return
	var json_path := extracted_root.path_join("web_atlas.json")
	var png_path := extracted_root.path_join("web_atlas.png")
	if not FileAccess.file_exists(json_path) or not FileAccess.file_exists(png_path):
		return
	var meta: Variant = JSON.parse_string(FileAccess.get_file_as_string(json_path))
	if not meta is Dictionary or not meta.has("parts"):
		return
	var img := Image.new()
	if img.load(png_path) != OK:
		return
	_apply_atlas(img, meta)


func _start_web_atlas_fetch() -> void:
	var origin := ""
	if ClassDB.class_exists("JavaScriptBridge"):
		var raw: Variant = JavaScriptBridge.eval("window.location.origin", true)
		if raw is String:
			origin = raw
	if origin.is_empty():
		return
	_http_json = HTTPRequest.new()
	add_child(_http_json)
	_http_json.request_completed.connect(_on_web_json_done)
	_http_json.request(origin + "/cosmoteer-assets/web_atlas.json")


func _on_web_json_done(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		return
	var meta: Variant = JSON.parse_string(body.get_string_from_utf8())
	if not meta is Dictionary or not meta.has("parts"):
		return
	_pending_meta = meta
	var origin := ""
	if ClassDB.class_exists("JavaScriptBridge"):
		var raw: Variant = JavaScriptBridge.eval("window.location.origin", true)
		if raw is String:
			origin = raw
	_http_png = HTTPRequest.new()
	add_child(_http_png)
	_http_png.request_completed.connect(_on_web_png_done)
	_http_png.request(origin + "/cosmoteer-assets/web_atlas.png")


func _on_web_png_done(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		return
	var img := Image.new()
	if img.load_png_from_buffer(body) != OK:
		return
	_apply_atlas(img, _pending_meta)


func _apply_atlas(img: Image, meta: Dictionary) -> void:
	atlas_texture = ImageTexture.create_from_image(img)
	atlas_parts.clear()
	atlas_sprites.clear()
	var parts_dict: Dictionary = meta.get("parts", {})
	for pid in parts_dict:
		var variants: Dictionary = parts_dict[pid]
		var entry := {}
		for vname in variants:
			var r: Array = variants[vname]
			if r.size() == 4:
				var at := AtlasTexture.new()
				at.atlas = atlas_texture
				at.region = Rect2(float(r[0]), float(r[1]), float(r[2]), float(r[3]))
				entry[vname] = at
		if not entry.is_empty():
			atlas_parts[pid] = entry
	var sprites_dict: Dictionary = meta.get("sprites", {})
	for skey in sprites_dict:
		var sr: Array = sprites_dict[skey]
		if sr.size() == 4:
			var sat := AtlasTexture.new()
			sat.atlas = atlas_texture
			sat.region = Rect2(float(sr[0]), float(sr[1]), float(sr[2]), float(sr[3]))
			atlas_sprites[skey] = sat
	loaded_count = atlas_parts.size()
	assets_ready.emit(loaded_count)


static func get_part_texture(part_id: String, variant: String = "cutaway") -> Texture2D:
	if instance == null or not instance.use_original_sprites:
		return null
	return instance.resolve_part_texture(part_id, variant)


static func get_sprite(key: String) -> Texture2D:
	if instance == null or not instance.use_original_sprites:
		return null
	return instance.atlas_sprites.get(key, null)


func resolve_part_texture(part_id: String, variant: String = "cutaway") -> Texture2D:
	if atlas_parts.has(part_id):
		var variants: Dictionary = atlas_parts[part_id]
		if variant == "turret":
			return variants.get("turret", null)
		if variants.has(variant):
			return variants[variant]
		if variants.has("cutaway"):
			return variants["cutaway"]
		if variants.has("roof"):
			return variants["roof"]
	if variant == "turret":
		return null
	if data_root.is_empty() or index.is_empty():
		return null
	var cache_key := part_id + "|" + variant
	if direct_cache.has(cache_key):
		return direct_cache[cache_key]
	var rec: Dictionary = index.get("part_sprites", {}).get(part_id, {})
	if rec.is_empty():
		direct_cache[cache_key] = null
		return null
	var rel := ""
	if variant == "roof" and rec.has("roof"):
		rel = str(rec.roof)
	elif rec.has("floor"):
		rel = str(rec.floor)
	elif rec.has("blueprint"):
		rel = str(rec.blueprint)
	elif rec.has("roof"):
		rel = str(rec.roof)
	if rel.is_empty():
		direct_cache[cache_key] = null
		return null
	var abs_path := data_root.path_join(rel)
	if not FileAccess.file_exists(abs_path):
		direct_cache[cache_key] = null
		return null
	var img := Image.new()
	if img.load(abs_path) != OK:
		direct_cache[cache_key] = null
		return null
	var tex := ImageTexture.create_from_image(img)
	direct_cache[cache_key] = tex
	return tex


func load_sfx_wav(kind: String) -> AudioStreamWAV:
	if wav_cache.has(kind):
		return wav_cache[kind]
	if data_root.is_empty() or index.is_empty():
		return null
	var rel: String = str(index.get("audio_sfx", {}).get(kind, ""))
	if rel.is_empty():
		return null
	var abs_path := data_root.path_join(rel)
	if not FileAccess.file_exists(abs_path):
		return null
	var wav := _parse_wav_file(abs_path)
	if wav != null:
		wav_cache[kind] = wav
	return wav


static func _parse_wav_file(abs_path: String) -> AudioStreamWAV:
	var bytes := FileAccess.get_file_as_bytes(abs_path)
	if bytes.size() < 44:
		return null
	if bytes.slice(0, 4).get_string_from_ascii() != "RIFF" or bytes.slice(8, 12).get_string_from_ascii() != "WAVE":
		return null
	var offset := 12
	var audio_format := 1
	var channels := 1
	var sample_rate := 44100
	var bits_per_sample := 16
	var pcm := PackedByteArray()
	while offset + 8 <= bytes.size():
		var chunk_id := bytes.slice(offset, offset + 4).get_string_from_ascii()
		var chunk_size := int(bytes.decode_u32(offset + 4))
		offset += 8
		if offset + chunk_size > bytes.size():
			break
		if chunk_id == "fmt " and chunk_size >= 16:
			audio_format = int(bytes.decode_u16(offset))
			channels = int(bytes.decode_u16(offset + 2))
			sample_rate = int(bytes.decode_u32(offset + 4))
			bits_per_sample = int(bytes.decode_u16(offset + 14))
		elif chunk_id == "data":
			pcm = bytes.slice(offset, offset + chunk_size)
		offset += chunk_size + (chunk_size & 1)
	if audio_format != 1 or pcm.is_empty() or not (bits_per_sample in [8, 16]):
		return null
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS if bits_per_sample == 16 else AudioStreamWAV.FORMAT_8_BITS
	wav.mix_rate = sample_rate
	wav.stereo = channels >= 2
	wav.data = pcm
	return wav
