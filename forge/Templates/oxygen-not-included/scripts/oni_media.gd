extends RefCounted
class_name OniMedia

# C:/Temp/Oxygen 역공학 추출 미디어 로더
# - textures_extracted.txt: 원작 지형 24종 + 건설 타일 3종 + FX 5종 (DXT1/DXT5 -> PNG -> ImageTexture)
# - kanim_meshes_extracted.txt: 원작 KAnim BILD v10 / ANIM v5 심볼·클립 메타
# - rendering_fx_extracted.txt: Unity 6 Texture2D/Sprite/Material/Shader/ParticleSystem 인벤토리
# - audio_extracted.txt: FMOD FSB5 8개 뱅크 카탈로그 + 실제 PCM16 원작 SFX 6종 (AudioStreamWAV)

static var _loaded := false
static var element_textures: Dictionary = {}
static var building_textures: Dictionary = {}
static var fx_textures: Dictionary = {}
static var sfx_streams: Dictionary = {}
static var kanim_builds: Dictionary = {}
static var kanim_anims: Dictionary = {}
static var rendering_inventory: Dictionary = {}
static var audio_summary: Dictionary = {}

static func ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true

	var tex_doc: Variant = _load_json("res://data/textures_extracted.txt")
	if tex_doc is Dictionary:
		_decode_tex_dict(tex_doc.get("element_textures", {}), element_textures)
		_decode_tex_dict(tex_doc.get("building_textures", {}), building_textures)
		_decode_tex_dict(tex_doc.get("fx_textures", {}), fx_textures)

	var kanim_doc: Variant = _load_json("res://data/kanim_meshes_extracted.txt")
	if kanim_doc is Dictionary:
		var b_v: Variant = kanim_doc.get("builds", {})
		if b_v is Dictionary:
			kanim_builds = b_v
		var a_v: Variant = kanim_doc.get("anims", {})
		if a_v is Dictionary:
			kanim_anims = a_v

	var ren_doc: Variant = _load_json("res://data/rendering_fx_extracted.txt")
	if ren_doc is Dictionary:
		var inv_v: Variant = ren_doc.get("inventory", {})
		if inv_v is Dictionary:
			rendering_inventory = inv_v

	var aud_doc: Variant = _load_json("res://data/audio_extracted.txt")
	if aud_doc is Dictionary:
		audio_summary = {
			"total_banks": int(aud_doc.get("total_banks", 0)),
			"total_samples": int(aud_doc.get("total_samples", 0)),
			"pcm16_samples": int(aud_doc.get("pcm16_samples", 0)),
		}
		var sfx_v: Variant = aud_doc.get("sfx_pcm16", {})
		if sfx_v is Dictionary:
			for sk_v in sfx_v.keys():
				var sk := String(sk_v)
				var sd: Dictionary = sfx_v[sk]
				var b64 := String(sd.get("pcm16_b64", ""))
				if b64.is_empty():
					continue
				var wav := AudioStreamWAV.new()
				wav.format = AudioStreamWAV.FORMAT_16_BITS
				wav.mix_rate = int(sd.get("mix_rate", 16000))
				wav.stereo = false
				wav.data = Marshalls.base64_to_raw(b64)
				sfx_streams[sk] = wav

static func _load_json(res_path: String) -> Variant:
	if not FileAccess.file_exists(res_path):
		return {}
	var txt := FileAccess.get_file_as_string(res_path)
	if txt.is_empty():
		return {}
	var parsed: Variant = JSON.parse_string(txt)
	if parsed == null:
		return {}
	return parsed

static func _decode_tex_dict(src_v: Variant, dst: Dictionary) -> void:
	if not (src_v is Dictionary):
		return
	var src: Dictionary = src_v
	for k_v in src.keys():
		var k := String(k_v)
		var entry: Dictionary = src[k]
		var b64 := String(entry.get("png_b64", ""))
		if b64.is_empty():
			continue
		var raw := Marshalls.base64_to_raw(b64)
		var img := Image.new()
		if img.load_png_from_buffer(raw) == OK:
			dst[k] = ImageTexture.create_from_image(img)

static func get_element_texture(el_id: String) -> Texture2D:
	ensure_loaded()
	var t: Variant = element_textures.get(el_id, null)
	if t is Texture2D:
		return t
	return null

static func get_building_texture(b_id: String) -> Texture2D:
	ensure_loaded()
	var t: Variant = building_textures.get(b_id, null)
	if t is Texture2D:
		return t
	return null

static func get_fx_texture(fx_name: String) -> Texture2D:
	ensure_loaded()
	var t: Variant = fx_textures.get(fx_name, null)
	if t is Texture2D:
		return t
	return null

static func get_sfx_stream(sfx_key: String) -> AudioStreamWAV:
	ensure_loaded()
	var s: Variant = sfx_streams.get(sfx_key, null)
	if s is AudioStreamWAV:
		return s
	return null

static func get_media_summary() -> String:
	ensure_loaded()
	var tex_n: int = element_textures.size() + building_textures.size() + fx_textures.size()
	var kanim_n: int = kanim_builds.size()
	var sfx_n: int = sfx_streams.size()
	var total_aud: int = int(audio_summary.get("total_samples", 0))
	return "미디어: 텍스처 %d · KAnim %d · 음원 %d/%d" % [tex_n, kanim_n, sfx_n, total_aud]
