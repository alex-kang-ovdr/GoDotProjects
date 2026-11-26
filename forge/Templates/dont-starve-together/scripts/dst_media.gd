class_name DSTMedia
extends RefCounted

## Don't Starve Together 원작 추출 에셋 런타임 로더.
## - data/dst_textures_extracted.txt: 지형 타일 8종, 캐릭터 초상화 6종, 인벤토리/제작/요리 아이콘 31~32종
## - data/dst_kanim_sprites_extracted.txt: BILD v6 + ANIM v4 아핀 조립 스프라이트 21종
## - data/dst_audio_extracted.txt: FMOD FSB5 155뱅크(20,891샘플) 카탈로그 + 실제 PCM16 SFX 10종
## - data/dst_shaders_extracted.txt: 70종 .ksh GLSL 셰이더 인벤토리

static var _loaded: bool = false
static var terrain_tiles: Dictionary = {} # name -> ImageTexture
static var terrain_images: Dictionary = {} # name -> Image (지면 합성용)
static var portraits: Dictionary = {} # char_id -> ImageTexture
static var icons: Dictionary = {} # item_id -> ImageTexture
static var kanim_sprites: Dictionary = {} # key -> ImageTexture
static var sfx_streams: Dictionary = {} # sfx_key -> AudioStreamWAV
static var audio_summary: Dictionary = {}
static var shader_count: int = 0
static var total_inventory_atlas_elements: int = 0


static func ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true

	var tex_doc: Variant = _load_json("res://data/dst_textures_extracted.txt")
	if tex_doc is Dictionary:
		total_inventory_atlas_elements = int(tex_doc.get("total_inventory_atlas_elements", 0))
		_decode_tex_dict(tex_doc.get("terrain_tiles", {}), terrain_tiles, terrain_images)
		_decode_tex_dict(tex_doc.get("portraits", {}), portraits, {})
		_decode_tex_dict(tex_doc.get("icons", {}), icons, {})

	var kanim_doc: Variant = _load_json("res://data/dst_kanim_sprites_extracted.txt")
	if kanim_doc is Dictionary:
		_decode_tex_dict(kanim_doc.get("sprites", {}), kanim_sprites, {})

	var aud_doc: Variant = _load_json("res://data/dst_audio_extracted.txt")
	if aud_doc is Dictionary:
		audio_summary = {
			"total_banks": int(aud_doc.get("total_banks", 0)),
			"total_samples": int(aud_doc.get("total_samples", 0)),
			"pcm16_samples": int(aud_doc.get("pcm16_samples", 0)),
		}
		var sfx_v: Variant = aud_doc.get("sfx_pcm16", {})
		if sfx_v is Dictionary:
			for sk_v in sfx_v.keys():
				var sk: String = str(sk_v)
				var sd: Dictionary = sfx_v[sk]
				var b64: String = str(sd.get("pcm16_b64", ""))
				if b64.is_empty():
					continue
				var wav: AudioStreamWAV = AudioStreamWAV.new()
				wav.format = AudioStreamWAV.FORMAT_16_BITS
				wav.mix_rate = int(sd.get("rate", 11025))
				wav.stereo = int(sd.get("channels", 1)) == 2
				wav.data = Marshalls.base64_to_raw(b64)
				sfx_streams[sk] = wav

	var sh_doc: Variant = _load_json("res://data/dst_shaders_extracted.txt")
	if sh_doc is Dictionary:
		shader_count = int(sh_doc.get("shader_count", 0))


static func _load_json(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		return null
	return JSON.parse_string(FileAccess.get_file_as_string(path))


static func _decode_tex_dict(src: Variant, tex_out: Dictionary, img_out: Dictionary) -> void:
	if not (src is Dictionary):
		return
	for k_v in src.keys():
		var k: String = str(k_v)
		var entry: Variant = src[k]
		if not (entry is Dictionary):
			continue
		var b64: String = str(entry.get("png_b64", ""))
		if b64.is_empty():
			continue
		var raw: PackedByteArray = Marshalls.base64_to_raw(b64)
		var img: Image = Image.new()
		if img.load_png_from_buffer(raw) == OK:
			tex_out[k] = ImageTexture.create_from_image(img)
			if img_out != null:
				img_out[k] = img


static func get_kanim_texture(key: String) -> Texture2D:
	ensure_loaded()
	return kanim_sprites.get(key, null)


static func get_icon_texture(key: String) -> Texture2D:
	ensure_loaded()
	return icons.get(key, null)


static func get_portrait_texture(char_id: String) -> Texture2D:
	ensure_loaded()
	return portraits.get(char_id, null)


static func get_sfx(key: String) -> AudioStreamWAV:
	ensure_loaded()
	return sfx_streams.get(key, null)
