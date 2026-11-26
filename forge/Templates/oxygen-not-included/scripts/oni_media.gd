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
static var kanim_atmosuit_dupe: Dictionary = {}
static var kanim_jetsuit_dupe: Dictionary = {}
static var sfx_streams: Dictionary = {}
static var bgm_streams: Dictionary = {}
static var music_bank_tracks: Array = []
static var ambience_bank_tracks: Array = []
static var kanim_builds: Dictionary = {}
static var kanim_anims: Dictionary = {}
static var rendering_inventory: Dictionary = {}
static var audio_summary: Dictionary = {}
static var shaders_summary: Dictionary = {}
static var world_codex_summary: Dictionary = {}
static var world_codex_doc: Dictionary = {}
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

	for kpath: String in ["res://data/kanim_sprites_extracted.txt", "res://data/kanim_sprites_ext_extracted.txt", "res://data/kanim_sprites_ext2_extracted.txt", "res://data/kanim_sprites_ext3_extracted.txt", "res://data/kanim_sprites_ext4_extracted.txt", "res://data/kanim_sprites_ext5_extracted.txt", "res://data/kanim_sprites_ext6_extracted.txt"]:
		var ksp_doc: Variant = _load_json(kpath)
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
			var as_v: Variant = ksp_doc.get("atmosuit_duplicant", {})
			if as_v is Dictionary and not (as_v as Dictionary).is_empty():
				var ad: Dictionary = as_v
				var si := _decode_png_b64(String(ad.get("idle_b64", "")))
				var sw0 := _decode_png_b64(String(ad.get("walk0_b64", "")))
				var sw1 := _decode_png_b64(String(ad.get("walk1_b64", "")))
				if si != null:
					kanim_atmosuit_dupe = {
						"idle": si,
						"walk0": sw0 if sw0 != null else si,
						"walk1": sw1 if sw1 != null else si,
					}
			var js_v: Variant = ksp_doc.get("jetsuit_duplicant", {})
			if js_v is Dictionary and not (js_v as Dictionary).is_empty():
				var jd: Dictionary = js_v
				var ji := _decode_png_b64(String(jd.get("idle_b64", "")))
				var jw0 := _decode_png_b64(String(jd.get("walk0_b64", "")))
				var jw1 := _decode_png_b64(String(jd.get("walk1_b64", "")))
				if ji != null:
					kanim_jetsuit_dupe = {
						"idle": ji,
						"walk0": jw0 if jw0 != null else ji,
						"walk1": jw1 if jw1 != null else ji,
					}

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
		world_codex_doc = wc_doc
		var po_v: Variant = wc_doc.get("po_catalogs_counts", {})
		var codex_v: Variant = wc_doc.get("codex", {})
		world_codex_summary = {
			"mobs": (wc_doc.get("mobs", {}) as Dictionary).size(),
			"worlds": (wc_doc.get("worlds", {}) as Dictionary).size(),
			"clusters": (wc_doc.get("clusters", {}) as Dictionary).size(),
			"traits": (wc_doc.get("traits", {}) as Dictionary).size(),
			"subworlds": (wc_doc.get("subworlds", {}) as Dictionary).size(),
			"geysers": (wc_doc.get("geysers", {}) as Dictionary).size(),
			"pois": (wc_doc.get("pois", {}) as Dictionary).size(),
			"story_traits": (wc_doc.get("story_traits_templates", []) as Array).size(),
			"codex_files": int((codex_v as Dictionary).get("total_files", 0)) if codex_v is Dictionary else 0,
			"buildings_ko": int((po_v as Dictionary).get("buildings_ko", 0)) if po_v is Dictionary else 0,
			"creatures_ko": int((po_v as Dictionary).get("creatures_ko", 0)) if po_v is Dictionary else 0,
			"foods_ko": int((po_v as Dictionary).get("foods_ko", 0)) if po_v is Dictionary else 0,
			"diseases_ko": int((po_v as Dictionary).get("diseases_ko", 0)) if po_v is Dictionary else 0,
			"rooms_ko": int((po_v as Dictionary).get("rooms_ko", 0)) if po_v is Dictionary else 0,
			"personalities_ko": int((po_v as Dictionary).get("personalities_ko", 0)) if po_v is Dictionary else 0,
			"duplicant_traits_ko": int((po_v as Dictionary).get("duplicant_traits_ko", 0)) if po_v is Dictionary else 0,
			"roles_ko": int((po_v as Dictionary).get("roles_ko", 0)) if po_v is Dictionary else 0,
			"chores_ko": int((po_v as Dictionary).get("chores_ko", 0)) if po_v is Dictionary else 0,
			"space_destinations": (wc_doc.get("space_destinations", {}) as Dictionary).size(),
		}

	var fe_doc: Variant = _load_json("res://data/fmod_events_extracted.txt")
	if fe_doc is Dictionary:
		fmod_events_summary = {
			"tokens": int(fe_doc.get("total_tokens", 0)),
			"radix_nodes": int(fe_doc.get("radix_nodes_est", 0)),
			"music_tracks": int(fe_doc.get("music_bank_tracks_count", 0)),
			"ambience_tracks": int(fe_doc.get("ambience_bank_tracks_count", 0)),
		}
		var mt_v: Variant = fe_doc.get("music_bank_tracks", [])
		if mt_v is Array:
			music_bank_tracks = mt_v
		var at_v: Variant = fe_doc.get("ambience_bank_tracks", [])
		if at_v is Array:
			ambience_bank_tracks = at_v

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

	var bgm_doc: Variant = _load_json("res://data/bgm_extracted.txt")
	if bgm_doc is Dictionary:
		var tr_v: Variant = bgm_doc.get("tracks", {})
		if tr_v is Dictionary:
			for bk_v in tr_v.keys():
				var bk := String(bk_v)
				var bd: Dictionary = tr_v[bk]
				var b64 := String(bd.get("pcm16_b64", ""))
				if b64.is_empty():
					continue
				var wav := AudioStreamWAV.new()
				wav.format = AudioStreamWAV.FORMAT_16_BITS
				wav.mix_rate = int(bd.get("mix_rate", 11025))
				wav.stereo = false
				var raw_pcm := Marshalls.base64_to_raw(b64)
				wav.data = raw_pcm
				if bool(bd.get("loop", false)):
					wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
					wav.loop_begin = 0
					wav.loop_end = raw_pcm.size() / 2
				bgm_streams[bk] = wav

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
	if raw.size() < 4:
		return null
	var img := Image.new()
	var err := ERR_INVALID_DATA
	if raw[0] == 0xFF and raw[1] == 0xD8:
		err = img.load_jpg_from_buffer(raw)
	elif raw[0] == 0x52 and raw[1] == 0x49 and raw[2] == 0x46 and raw[3] == 0x46:
		err = img.load_webp_from_buffer(raw)
	else:
		err = img.load_png_from_buffer(raw)
	if err == OK:
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

static func get_duplicant_sprite(dupe_id: int, moving := false, phase := 0.0, wearing_suit := false, wearing_jetsuit := false) -> Texture2D:
	ensure_loaded()
	var key := "idle"
	if moving:
		key = "walk0" if int(floor(phase * 6.0)) % 2 == 0 else "walk1"
	if wearing_jetsuit and not kanim_jetsuit_dupe.is_empty():
		var jt: Variant = kanim_jetsuit_dupe.get(key, null)
		if jt is Texture2D:
			return jt
	if wearing_suit and not kanim_atmosuit_dupe.is_empty():
		var st: Variant = kanim_atmosuit_dupe.get(key, null)
		if st is Texture2D:
			return st
	if kanim_dupes.is_empty():
		return null
	var entry: Dictionary = kanim_dupes[dupe_id % kanim_dupes.size()]
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

static func get_bgm_stream(bgm_key: String) -> AudioStreamWAV:
	ensure_loaded()
	var s: Variant = bgm_streams.get(bgm_key, null)
	if s is AudioStreamWAV:
		return s
	return null

static func get_media_summary() -> String:
	ensure_loaded()
	var tex_n: int = element_textures.size() + building_textures.size() + fx_textures.size()
	var spr_n: int = kanim_building_idle.size() + kanim_dupes.size() + (0 if kanim_atmosuit_dupe.is_empty() else 1) + (0 if kanim_jetsuit_dupe.is_empty() else 1)
	var sfx_n: int = sfx_streams.size()
	var bgm_n: int = bgm_streams.size()
	return "텍%d·KAnim%d·SFX%d·BGM%d" % [tex_n, spr_n, sfx_n, bgm_n]

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
	lines.append("[월드/POI] 행성 %d · 클러스터 %d · 특성 %d · 서브월드 %d · 간헐천 %d · POI %d · 백과 %d파일" % [
		int(world_codex_summary.get("worlds", 0)),
		int(world_codex_summary.get("clusters", 0)),
		int(world_codex_summary.get("traits", 0)),
		int(world_codex_summary.get("subworlds", 0)),
		int(world_codex_summary.get("geysers", 0)),
		int(world_codex_summary.get("pois", 0)),
		int(world_codex_summary.get("codex_files", 0)),
	])
	lines.append("[공식 한국어] 건물 %d · 생물 %d · 음식 %d · 방 %d · 질병 %d · 복제체 %d · 특성 %d · 스킬 %d · 우주 %d" % [
		int(world_codex_summary.get("buildings_ko", 0)),
		int(world_codex_summary.get("creatures_ko", 0)),
		int(world_codex_summary.get("foods_ko", 0)),
		int(world_codex_summary.get("rooms_ko", 0)),
		int(world_codex_summary.get("diseases_ko", 0)),
		int(world_codex_summary.get("personalities_ko", 0)),
		int(world_codex_summary.get("duplicant_traits_ko", 0)),
		int(world_codex_summary.get("roles_ko", 0)),
		int(world_codex_summary.get("space_destinations", 0)),
	])
	lines.append("[텍스처/메시] 임베딩 타일·FX %d종 (전체 %d) · 조립 KAnim %d종 (전체 %d)" % [
		element_textures.size() + building_textures.size() + fx_textures.size(),
		int(rendering_inventory.get("textures_total", 0)),
		kanim_building_idle.size() + kanim_dupes.size() + (0 if kanim_atmosuit_dupe.is_empty() else 1) + (0 if kanim_jetsuit_dupe.is_empty() else 1),
		int(rendering_inventory.get("kanim_textassets_total", 0)),
	])
	lines.append("[셰이더/머티리얼] Unity 셰이더 %d종 (Klei 전용 %d) · 머티리얼 %d종 · Godot 포팅 5종" % [
		int(shaders_summary.get("shaders", 0)),
		klei_shader_names.size(),
		int(shaders_summary.get("materials", 0)),
	])
	lines.append("[FMOD 사운드] 전체 %d뱅크 %d샘플 · STDT 토큰 %d · 실제 PCM16 SFX %d종 재생" % [
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

static func get_codex_tab_lines(tab_id: String) -> Array[String]:
	ensure_loaded()
	OniElements.ensure_loaded()
	if tab_id == "summary":
		return get_complete_audit_lines()
	var lines: Array[String] = []
	var po: Dictionary = world_codex_doc.get("po_catalogs", {}) as Dictionary
	if tab_id == "elements":
		lines.append("=== 원작 원소 데이터베이스 (%d종 · 물성/상전이/승화) ===" % OniElements.elements.size())
		var keys: Array = OniElements.elements.keys()
		keys.sort()
		for k_v in keys:
			var k := String(k_v)
			var e: Dictionary = OniElements.elements[k]
			var sub_s := "" if e.get("sublimate_id", null) == null else (" · 승화→" + String(e.get("sublimate_id")))
			lines.append("• %s (%s) [%s] 비열 %.3f · 전도 %.3f · 몰 %.1f%s" % [
				String(e.get("name_ko", k)), k, String(e.get("state", "")),
				float(e.get("shc", 0.0)), float(e.get("tc", 0.0)), float(e.get("molar_mass", 0.0)), sub_s
			])
	elif tab_id == "rooms":
		var rdet: Dictionary = world_codex_doc.get("rooms_detail", {}) as Dictionary
		lines.append("=== 원작 방(Room) 보너스 카탈로그 (%d종) ===" % rdet.size())
		for rk_v in rdet.keys():
			var rk := String(rk_v)
			var rd: Dictionary = rdet[rk]
			lines.append("• %s (%s): %s" % [String(rd.get("name_ko", rk)), rk, String(rd.get("desc", ""))])
	elif tab_id == "diseases":
		var ddet: Dictionary = world_codex_doc.get("diseases_detail", {}) as Dictionary
		lines.append("=== 원작 질병·세균 카탈로그 (%d종) ===" % ddet.size())
		for dk_v in ddet.keys():
			var dk := String(dk_v)
			var dd: Dictionary = ddet[dk]
			lines.append("• %s (%s): %s" % [String(dd.get("name_ko", dk)), dk, String(dd.get("desc", ""))])
	elif tab_id == "personalities":
		var pdet: Dictionary = world_codex_doc.get("personalities_detail", {}) as Dictionary
		lines.append("=== 원작 복제체(Duplicant) 인격 카탈로그 (%d명) ===" % pdet.size())
		for pk_v in pdet.keys():
			var pk := String(pk_v)
			var pd: Dictionary = pdet[pk]
			lines.append("• %s (%s) — %s" % [String(pd.get("name_ko", pk)), pk, String(pd.get("desc", ""))])
	elif tab_id == "worlds":
		var ws: Dictionary = world_codex_doc.get("worlds", {}) as Dictionary
		var cls: Dictionary = world_codex_doc.get("clusters", {}) as Dictionary
		var pois_d: Dictionary = world_codex_doc.get("pois", {}) as Dictionary
		lines.append("=== 원작 행성(%d) · 클러스터(%d) · POI 유적(%d) ===" % [ws.size(), cls.size(), pois_d.size()])
		for wk_v in ws.keys():
			var wk := String(wk_v)
			var wd: Dictionary = ws[wk]
			lines.append("• [행성] %s (%s) · 서브월드 %d개 · 시작 %s" % [String(wd.get("name_ko", wk)), wk, int(wd.get("subworld_count", 0)), String(wd.get("start_subworld", ""))])
		for pk_v in pois_d.keys():
			var pk := String(pk_v)
			var pd: Dictionary = pois_d[pk]
			lines.append("• [POI] %s · 셀 %d · 건물 %d" % [pk, int(pd.get("cells", 0)), int(pd.get("buildings", 0))])
	elif tab_id == "buildings":
		var bd: Dictionary = po.get("buildings_ko", {}) as Dictionary
		lines.append("=== 원작 건물 공식 한국어 도감 (%d종 · 플레이 가능 %d종) ===" % [bd.size(), OniElements.buildings.size()])
		var bkeys: Array = bd.keys()
		bkeys.sort()
		for bk_v in bkeys:
			var bk := String(bk_v)
			lines.append("• %s (%s)" % [String(bd[bk]), bk])
	elif tab_id == "music":
		lines.append("=== 원작 FMOD 사운드트랙·앰비언스 카탈로그 (Music.bank %d곡 · Ambiences.bank %d트랙 · 재생 SFX %d · BGM %d) ===" % [
			int(fmod_events_summary.get("music_tracks", music_bank_tracks.size())),
			int(fmod_events_summary.get("ambience_tracks", ambience_bank_tracks.size())),
			sfx_streams.size(), bgm_streams.size()
		])
		for mt_v in music_bank_tracks:
			lines.append("• [Music.bank] " + String(mt_v))
		for at_v in ambience_bank_tracks:
			lines.append("• [Ambiences.bank] " + String(at_v))
	elif tab_id == "creatures":
		var cd: Dictionary = po.get("creatures_ko", {}) as Dictionary
		var fd: Dictionary = po.get("foods_ko", {}) as Dictionary
		lines.append("=== 원작 생물(%d종) · 음식(%d종) 도감 ===" % [cd.size(), fd.size()])
		for ck_v in cd.keys():
			var ck := String(ck_v)
			lines.append("• [생물] %s (%s)" % [String(cd[ck]), ck])
		for fk_v in fd.keys():
			var fk := String(fk_v)
			lines.append("• [음식] %s (%s)" % [String(fd[fk]), fk])
	elif tab_id == "shaders":
		lines.append("=== 원작 Unity 6 Klei 셰이더 (%d종 / 전체 %d종 · Godot 포팅 5종) ===" % [klei_shader_names.size(), int(shaders_summary.get("shaders", 0))])
		for sh_v in klei_shader_names:
			lines.append("• " + String(sh_v))
	return lines
