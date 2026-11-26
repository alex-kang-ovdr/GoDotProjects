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
static var kanim_building_idle: Dictionary = {}
static var kanim_building_work: Dictionary = {}
static var kanim_dupes: Array = []
static var sfx_streams: Dictionary = {}
static var kanim_builds: Dictionary = {}
static var kanim_anims: Dictionary = {}
static var rendering_inventory: Dictionary = {}
static var audio_summary: Dictionary = {}
static var shaders_summary: Dictionary = {}
static var world_codex_summary: Dictionary = {}
static var fmod_events_summary: Dictionary = {}
static var klei_shader_names: Array = []

static func ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true

	var tex_doc: Variant = _load_json("res://data/textures_extracted.txt")
	if tex_doc is Dictionary:
		_decode_tex_dict(tex_doc.get("element_textures", {}), element_textures)
		_decode_tex_dict(tex_doc.get("building_textures", {}), building_textures)
		_decode_tex_dict(tex_doc.get("fx_textures", {}), fx_textures)

	var ksp_doc: Variant = _load_json("res://data/kanim_sprites_extracted.txt")
	if ksp_doc is Dictionary:
		var bs_v: Variant = ksp_doc.get("building_sprites", {})
		if bs_v is Dictionary:
			var bs: Dictionary = bs_v
			for bk_v in bs.keys():
				var bk := String(bk_v)
				var bd: Dictionary = bs[bk]
				var t_idle := _decode_png_b64(String(bd.get("idle_b64", "")))
				var t_work := _decode_png_b64(String(bd.get("work_b64", "")))
				if t_idle != null:
					kanim_building_idle[bk] = t_idle
					kanim_building_work[bk] = t_work if t_work != null else t_idle
		var ds_v: Variant = ksp_doc.get("duplicant_sprites", [])
		if ds_v is Array:
			for d_v in ds_v:
				if d_v is Dictionary:
					var dd: Dictionary = d_v
					var ti := _decode_png_b64(String(dd.get("idle_b64", "")))
					var tw0 := _decode_png_b64(String(dd.get("walk0_b64", "")))
					var tw1 := _decode_png_b64(String(dd.get("walk1_b64", "")))
					if ti != null:
						kanim_dupes.append({
							"idle": ti,
							"walk0": tw0 if tw0 != null else ti,
							"walk1": tw1 if tw1 != null else ti,
						})

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

	var sh_doc: Variant = _load_json("res://data/shaders_materials_extracted.txt")
	if sh_doc is Dictionary:
		shaders_summary = {
			"shaders": int(sh_doc.get("shader_count", 0)),
			"materials": int(sh_doc.get("material_count", 0)),
		}
		var ks_v: Variant = sh_doc.get("klei_shaders", [])
		if ks_v is Array:
			klei_shader_names = ks_v

	var wc_doc: Variant = _load_json("res://data/world_codex_extracted.txt")
	if wc_doc is Dictionary:
		var po_v: Variant = wc_doc.get("po_catalogs_counts", {})
		var codex_v: Variant = wc_doc.get("codex", {})
		world_codex_summary = {
			"mobs": (wc_doc.get("mobs", {}) as Dictionary).size(),
			"worlds": (wc_doc.get("worlds", {}) as Dictionary).size(),
			"traits": (wc_doc.get("traits", {}) as Dictionary).size(),
			"subworlds": (wc_doc.get("subworlds", {}) as Dictionary).size(),
			"geysers": (wc_doc.get("geysers", {}) as Dictionary).size(),
			"codex_files": int((codex_v as Dictionary).get("total_files", 0)) if codex_v is Dictionary else 0,
			"buildings_ko": int((po_v as Dictionary).get("buildings_ko", 0)) if po_v is Dictionary else 0,
			"creatures_ko": int((po_v as Dictionary).get("creatures_ko", 0)) if po_v is Dictionary else 0,
			"foods_ko": int((po_v as Dictionary).get("foods_ko", 0)) if po_v is Dictionary else 0,
		}

	var fe_doc: Variant = _load_json("res://data/fmod_events_extracted.txt")
	if fe_doc is Dictionary:
		fmod_events_summary = {
			"tokens": int(fe_doc.get("total_tokens", 0)),
			"radix_nodes": int(fe_doc.get("radix_nodes_est", 0)),
		}

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

static func _decode_png_b64(b64: String) -> Texture2D:
	if b64.is_empty():
		return null
	var raw := Marshalls.base64_to_raw(b64)
	var img := Image.new()
	if img.load_png_from_buffer(raw) == OK:
		return ImageTexture.create_from_image(img)
	return null

static func _decode_tex_dict(src_v: Variant, dst: Dictionary) -> void:
	if not (src_v is Dictionary):
		return
	var src: Dictionary = src_v
	for k_v in src.keys():
		var k := String(k_v)
		var entry: Dictionary = src[k]
		var tex := _decode_png_b64(String(entry.get("png_b64", "")))
		if tex != null:
			dst[k] = tex

static func get_building_sprite(b_id: String, working := false) -> Texture2D:
	ensure_loaded()
	var dict := kanim_building_work if working else kanim_building_idle
	var t: Variant = dict.get(b_id, null)
	if t is Texture2D:
		return t
	return null

static func get_duplicant_sprite(dupe_id: int, moving := false, phase := 0.0) -> Texture2D:
	ensure_loaded()
	if kanim_dupes.is_empty():
		return null
	var entry: Dictionary = kanim_dupes[dupe_id % kanim_dupes.size()]
	var key := "idle"
	if moving:
		key = "walk0" if int(floor(phase * 6.0)) % 2 == 0 else "walk1"
	var t: Variant = entry.get(key, null)
	if t is Texture2D:
		return t
	return null

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
	var spr_n: int = kanim_building_idle.size() + kanim_dupes.size()
	var sfx_n: int = sfx_streams.size()
	var sh_n: int = int(shaders_summary.get("shaders", 0))
	return "에셋: 텍스처 %d · KAnim %d · 셰이더 %d · SFX %d" % [tex_n, spr_n, sh_n, sfx_n]

static func get_complete_audit_lines() -> Array[String]:
	ensure_loaded()
	OniElements.ensure_loaded()
	var lines: Array[String] = []
	lines.append("=== C:/Temp/Oxygen 역공학 추출 완결 현황 ===")
	lines.append("[데이터] 원소 %d종 · 바이옴 %d종 · 연구트리 %d노드 · 생물/식물스폰 %d종" % [
		OniElements.elements.size(),
		(OniElements.worldgen.get("biomes", {}) as Dictionary).size(),
		OniElements.techs.size(),
		int(world_codex_summary.get("mobs", 0)),
	])
	lines.append("[월드/백과] 행성 %d · 특성 %d · 서브월드 %d · 간헐천 %d · 백과 %d파일" % [
		int(world_codex_summary.get("worlds", 0)),
		int(world_codex_summary.get("traits", 0)),
		int(world_codex_summary.get("subworlds", 0)),
		int(world_codex_summary.get("geysers", 0)),
		int(world_codex_summary.get("codex_files", 0)),
	])
	lines.append("[공식 한국어] 건물 %d · 생물 %d · 음식 %d (21,114 PO 항목)" % [
		int(world_codex_summary.get("buildings_ko", 0)),
		int(world_codex_summary.get("creatures_ko", 0)),
		int(world_codex_summary.get("foods_ko", 0)),
	])
	lines.append("[텍스처/메시] 임베딩 타일·FX %d종 (전체 %d) · 조립 KAnim %d종 (전체 %d)" % [
		element_textures.size() + building_textures.size() + fx_textures.size(),
		int(rendering_inventory.get("textures_total", 0)),
		kanim_building_idle.size() + kanim_dupes.size(),
		int(rendering_inventory.get("kanim_textassets_total", 0)),
	])
	lines.append("[셰이더/머티리얼] Unity 셰이더 %d종 (Klei 전용 %d) · 머티리얼 %d종 · Godot 포팅 3종" % [
		int(shaders_summary.get("shaders", 0)),
		klei_shader_names.size(),
		int(shaders_summary.get("materials", 0)),
	])
	lines.append("[FMOD 사운드] %d뱅크 %d샘플 · STDT 토큰 %d · 실제 PCM16 SFX %d종 재생" % [
		int(audio_summary.get("total_banks", 0)),
		int(audio_summary.get("total_samples", 0)),
		int(fmod_events_summary.get("tokens", 0)),
		sfx_streams.size(),
	])
	if not klei_shader_names.is_empty():
		var sample_sh: Array[String] = []
		for si in range(mini(6, klei_shader_names.size())):
			sample_sh.append(String(klei_shader_names[si]))
		lines.append("주요 Klei 셰이더: " + ", ".join(sample_sh))
	return lines
