class_name FTLStandaloneAssets
extends RefCounted

## Pure-GDScript procedural icon, sprite, and WAV SFX generator for 100% standalone
## operation without ftl.dat.vanilla. Generates crisp geometric system icons (16 systems x 5 states),
## top-bar resource icons (fuel/missiles/drones/scrap), and synthesized 16-bit PCM WAV SFX.

static var _tex_cache: Dictionary = {}
static var _sfx_cache: Dictionary = {}
static var _bgm_cache: Dictionary = {}


static func get_texture(rel_path: String) -> Texture2D:
	var key := rel_path.replace("\\", "/")
	if key.begins_with("img/"):
		key = key.substr(4)
	if _tex_cache.has(key):
		return _tex_cache[key]

	var tex: Texture2D = null
	if key.begins_with("icons/s_"):
		tex = _build_system_icon(key)
	elif key.begins_with("ui_icons/icon_"):
		tex = _build_resource_icon(key)

	if tex != null:
		_tex_cache[key] = tex
	return tex


static func _state_color(suffix: String) -> Color:
	if suffix.begins_with("blue"):
		return Color("5ce1ff")
	if suffix.begins_with("red"):
		return Color("ff5252")
	if suffix.begins_with("orange"):
		return Color("ffaa33")
	if suffix.begins_with("grey"):
		return Color("8c9aa8")
	if suffix.begins_with("overlay"):
		return Color("e8f4ff")
	return Color("66ff88")


static func _build_system_icon(key: String) -> Texture2D:
	# Pattern: icons/s_<sys>_<state>.png
	var base := key.get_file().get_basename() # s_shields_green1
	var parts := base.split("_")
	if parts.size() < 3:
		return null
	var sys := parts[1]
	var state := parts[2]
	var col := _state_color(state)
	var bg := Color(0.06, 0.09, 0.13, 0.0)
	var img := Image.create(28, 28, false, Image.FORMAT_RGBA8)
	img.fill(bg)

	# Crisp outer badge ring
	_draw_circle_outline(img, 14, 14, 12, Color(col.r, col.g, col.b, 0.35))
	match sys:
		"shields":
			_draw_circle_outline(img, 14, 14, 9, col)
			_draw_circle_outline(img, 14, 14, 6, col)
		"engines":
			_fill_rect(img, 10, 7, 10, 14, col)
			_fill_rect(img, 5, 9, 4, 3, Color("ffd54f"))
			_fill_rect(img, 4, 13, 5, 2, Color("ff8040"))
			_fill_rect(img, 5, 16, 4, 3, Color("ffd54f"))
		"oxygen":
			_draw_circle_outline(img, 11, 13, 5, col)
			_draw_circle_outline(img, 18, 16, 4, col)
		"weapons":
			_draw_circle_outline(img, 14, 14, 8, col)
			_fill_rect(img, 13, 4, 2, 20, col)
			_fill_rect(img, 4, 13, 20, 2, col)
		"drones":
			_fill_rect(img, 9, 11, 10, 6, col)
			_fill_rect(img, 5, 8, 5, 3, col)
			_fill_rect(img, 18, 8, 5, 3, col)
			_fill_rect(img, 12, 17, 4, 4, col)
		"medbay":
			_fill_rect(img, 11, 6, 6, 16, col)
			_fill_rect(img, 6, 11, 16, 6, col)
		"clonebay":
			_draw_line_px(img, 8, 6, 20, 22, col)
			_draw_line_px(img, 20, 6, 8, 22, col)
			_fill_rect(img, 10, 9, 8, 2, col)
			_fill_rect(img, 10, 17, 8, 2, col)
		"teleporter":
			_fill_rect(img, 7, 19, 14, 3, col)
			_fill_rect(img, 10, 6, 2, 12, col)
			_fill_rect(img, 16, 6, 2, 12, col)
			_fill_rect(img, 13, 8, 2, 10, Color.WHITE)
		"cloaking":
			_draw_circle_outline(img, 14, 14, 8, col)
			_fill_rect(img, 11, 11, 6, 6, col)
			_draw_line_px(img, 6, 22, 22, 6, col)
		"artillery":
			_fill_rect(img, 5, 11, 16, 6, col)
			_fill_rect(img, 20, 12, 5, 4, Color("ffd54f"))
		"hacking":
			_fill_rect(img, 8, 8, 12, 12, col)
			_fill_rect(img, 11, 11, 6, 6, Color(0.08, 0.1, 0.14, 1.0))
			_fill_rect(img, 13, 4, 2, 4, col)
			_fill_rect(img, 13, 20, 2, 4, col)
		"mind":
			_draw_circle_outline(img, 14, 14, 9, col)
			_draw_circle_outline(img, 14, 14, 5, col)
			_fill_rect(img, 13, 13, 3, 3, Color.WHITE)
		"pilot":
			_draw_circle_outline(img, 14, 14, 7, col)
			_draw_line_px(img, 14, 5, 14, 23, col)
			_draw_line_px(img, 5, 14, 23, 14, col)
		"sensors":
			_draw_circle_outline(img, 10, 18, 9, col)
			_draw_circle_outline(img, 10, 18, 5, col)
			_fill_rect(img, 9, 17, 3, 3, Color.WHITE)
		"doors":
			_fill_rect(img, 6, 6, 7, 16, col)
			_fill_rect(img, 15, 6, 7, 16, col)
			_fill_rect(img, 13, 6, 2, 16, Color(0.08, 0.1, 0.14, 1.0))
		"battery":
			_fill_rect(img, 13, 5, 4, 8, col)
			_fill_rect(img, 10, 12, 8, 3, col)
			_fill_rect(img, 11, 15, 4, 8, col)
		_:
			_fill_rect(img, 9, 9, 10, 10, col)
	return ImageTexture.create_from_image(img)


static func _build_resource_icon(key: String) -> Texture2D:
	var img := Image.create(20, 20, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	if key.contains("fuel"):
		_fill_rect(img, 5, 4, 10, 13, Color("5ce1ff"))
		_fill_rect(img, 7, 2, 6, 2, Color("c8f0ff"))
		_fill_rect(img, 7, 8, 6, 5, Color(0.08, 0.18, 0.28, 1.0))
	elif key.contains("missiles"):
		_fill_rect(img, 8, 3, 4, 12, Color("ff9e42"))
		_fill_rect(img, 9, 1, 2, 3, Color("ffd54f"))
		_fill_rect(img, 5, 13, 3, 4, Color("ff5c5c"))
		_fill_rect(img, 12, 13, 3, 4, Color("ff5c5c"))
	elif key.contains("drones"):
		_fill_rect(img, 6, 6, 8, 8, Color("7eff8b"))
		_fill_rect(img, 3, 8, 3, 4, Color("5ce1ff"))
		_fill_rect(img, 14, 8, 3, 4, Color("5ce1ff"))
		_fill_rect(img, 9, 9, 2, 2, Color.WHITE)
	else: # scrap
		_draw_circle_outline(img, 10, 10, 6, Color("ffd54f"))
		_fill_rect(img, 8, 8, 4, 4, Color("ffd54f"))
		_fill_rect(img, 9, 2, 2, 3, Color("ffd54f"))
		_fill_rect(img, 9, 15, 2, 3, Color("ffd54f"))
		_fill_rect(img, 2, 9, 3, 2, Color("ffd54f"))
		_fill_rect(img, 15, 9, 3, 2, Color("ffd54f"))
	return ImageTexture.create_from_image(img)


static func get_procedural_sfx(sound_id: String) -> AudioStreamWAV:
	var sid := sound_id.to_lower()
	var bucket := "click"
	if sid.contains("laser") or sid.contains("shoot"):
		bucket = "laser"
	elif sid.contains("missile") or sid.contains("flak"):
		bucket = "missile"
	elif sid.contains("beam"):
		bucket = "beam"
	elif sid.contains("explosion") or sid.contains("hull"):
		bucket = "explosion"
	elif sid.contains("shield"):
		bucket = "shield"
	elif sid.contains("ion"):
		bucket = "ion"
	elif sid.contains("door"):
		bucket = "door"
	elif sid.contains("powerup") or sid.contains("upgrade") or sid.contains("victory"):
		bucket = "powerup"
	elif sid.contains("powerdown") or sid.contains("fail"):
		bucket = "powerdown"
	elif sid.contains("jump") or sid.contains("cloak"):
		bucket = "jump"

	if _sfx_cache.has(bucket):
		return _sfx_cache[bucket]

	var rate := 22050
	var dur := 0.14
	match bucket:
		"explosion": dur = 0.34
		"beam": dur = 0.28
		"jump": dur = 0.32
		"missile": dur = 0.22
		"powerup": dur = 0.18
	var samples := int(float(rate) * dur)
	var data := PackedByteArray()
	data.resize(samples * 2)
	var phase := 0.0
	var rng := RandomNumberGenerator.new()
	rng.seed = bucket.hash()

	for i in range(samples):
		var t := float(i) / float(rate)
		var u := float(i) / float(samples)
		var env := (1.0 - u) * (1.0 - u)
		var val := 0.0
		match bucket:
			"laser":
				var f := lerpf(980.0, 240.0, u)
				phase += TAU * f / float(rate)
				val = sin(phase) * env * 0.45
			"missile":
				var f := lerpf(320.0, 110.0, u)
				phase += TAU * f / float(rate)
				val = (sin(phase) * 0.4 + rng.randf_range(-0.6, 0.6)) * env * 0.38
			"beam":
				phase += TAU * 185.0 / float(rate)
				val = (sin(phase) + 0.45 * sin(phase * 2.02)) * (1.0 - u * 0.7) * 0.3
			"explosion":
				val = rng.randf_range(-1.0, 1.0) * env * 0.52
			"shield":
				var f := lerpf(540.0, 860.0, u)
				phase += TAU * f / float(rate)
				val = sin(phase) * env * 0.38
			"ion":
				var f := 640.0 + sin(t * 75.0) * 180.0
				phase += TAU * f / float(rate)
				val = sin(phase) * env * 0.36
			"door":
				val = rng.randf_range(-0.4, 0.4) * env * 0.25
			"powerup":
				var f := 440.0 if u < 0.45 else 660.0
				phase += TAU * f / float(rate)
				val = sin(phase) * env * 0.32
			"powerdown":
				var f := 380.0 if u < 0.45 else 240.0
				phase += TAU * f / float(rate)
				val = sin(phase) * env * 0.30
			"jump":
				var f := lerpf(210.0, 1120.0, u * u)
				phase += TAU * f / float(rate)
				val = sin(phase) * (1.0 - u * 0.5) * 0.34
			_:
				phase += TAU * 520.0 / float(rate)
				val = sin(phase) * env * 0.24
		var s16 := clampi(int(val * 32767.0), -32768, 32767)
		data[i * 2] = s16 & 0xFF
		data[i * 2 + 1] = (s16 >> 8) & 0xFF

	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = rate
	wav.stereo = false
	wav.data = data
	_sfx_cache[bucket] = wav
	return wav


static func get_procedural_bgm(combat: bool) -> AudioStreamWAV:
	var key := "battle" if combat else "explore"
	if _bgm_cache.has(key):
		return _bgm_cache[key]
	var rate := 16000
	var dur := 8.0 # Seamless 8-second loop (4 bars at 120 BPM)
	var samples := int(float(rate) * dur)
	var data := PackedByteArray()
	data.resize(samples * 2)
	# C-minor sci-fi arpeggio (C3, Eb3, G3, Bb3, C4, G3, F3, Eb3)
	var arp := [130.81, 155.56, 196.00, 233.08, 261.63, 196.00, 174.61, 155.56]
	var bass_notes := [65.41, 65.41, 58.27, 77.78]
	var p1 := 0.0
	var p2 := 0.0
	var p3 := 0.0
	for i in range(samples):
		var t := float(i) / float(rate)
		var bar := int(t / 2.0) % 4
		var step := int(t * (4.0 if combat else 2.0)) % arp.size()
		var step_u := fmod(t * (4.0 if combat else 2.0), 1.0)
		var env := exp(-step_u * (4.5 if combat else 3.2))
		var bf: float = bass_notes[bar]
		var af: float = arp[step] * (2.0 if combat else 1.0)
		p1 += TAU * bf / float(rate)
		p2 += TAU * (bf * 1.5) / float(rate)
		p3 += TAU * af / float(rate)
		var pad := (sin(p1) * 0.22 + sin(p2) * 0.12) * (0.75 + 0.25 * sin(t * 1.5))
		var lead := sin(p3) * env * (0.18 if combat else 0.12)
		var pulse := 0.0
		if combat:
			var beat_u := fmod(t * 2.0, 1.0)
			pulse = sin(p1 * 2.0) * exp(-beat_u * 8.0) * 0.20
		var val := clampf(pad + lead + pulse, -0.85, 0.85)
		var s16 := clampi(int(val * 32767.0), -32768, 32767)
		data[i * 2] = s16 & 0xFF
		data[i * 2 + 1] = (s16 >> 8) & 0xFF
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = rate
	wav.stereo = false
	wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
	wav.loop_begin = 0
	wav.loop_end = samples
	wav.data = data
	_bgm_cache[key] = wav
	return wav


static func get_ship_preview_texture(hull_style: String) -> Texture2D:
	var key := "preview_" + hull_style
	if _tex_cache.has(key):
		return _tex_cache[key]
	var img := Image.create(160, 96, false, Image.FORMAT_RGBA8)
	img.fill(Color(0.05, 0.08, 0.12, 1.0))
	var base := Color("4c5b6e")
	var accent := Color("c84638")
	match hull_style:
		"engi": base = Color("425e68"); accent = Color("46b8a0")
		"fed": base = Color("5a6270"); accent = Color("d89b38")
		"zoltan": base = Color("526438"); accent = Color("78e05a")
		"mantis": base = Color("5c3234"); accent = Color("d6453a")
		"stealth": base = Color("28303d"); accent = Color("5294d8")
		"lanius": base = Color("444a56"); accent = Color("72c8e8")
		"boss": base = Color("4d2f2b"); accent = Color("e85038")
	_fill_rect(img, 24, 30, 92, 36, base)
	_fill_rect(img, 114, 38, 26, 20, base.lightened(0.15))
	_fill_rect(img, 40, 18, 52, 12, base.darkened(0.1))
	_fill_rect(img, 40, 66, 52, 12, base.darkened(0.1))
	_fill_rect(img, 36, 34, 72, 6, accent)
	_fill_rect(img, 36, 56, 72, 6, accent)
	_fill_rect(img, 122, 42, 12, 12, Color("66e0ff"))
	_fill_rect(img, 14, 34, 10, 10, Color("ff9e42"))
	_fill_rect(img, 14, 52, 10, 10, Color("ff9e42"))
	var tex := ImageTexture.create_from_image(img)
	_tex_cache[key] = tex
	return tex


static func _fill_rect(img: Image, x0: int, y0: int, w: int, h: int, col: Color) -> void:
	for y in range(maxi(0, y0), mini(img.get_height(), y0 + h)):
		for x in range(maxi(0, x0), mini(img.get_width(), x0 + w)):
			img.set_pixel(x, y, col)


static func _draw_circle_outline(img: Image, cx: int, cy: int, r: int, col: Color) -> void:
	for y in range(maxi(0, cy - r - 1), mini(img.get_height(), cy + r + 2)):
		for x in range(maxi(0, cx - r - 1), mini(img.get_width(), cx + r + 2)):
			var d := Vector2(float(x - cx), float(y - cy)).length()
			if absf(d - float(r)) <= 0.85:
				img.set_pixel(x, y, col)


static func _draw_line_px(img: Image, x0: int, y0: int, x1: int, y1: int, col: Color) -> void:
	var steps := maxi(absi(x1 - x0), absi(y1 - y0))
	if steps <= 0:
		return
	for i in range(steps + 1):
		var t := float(i) / float(steps)
		var x := int(round(lerpf(float(x0), float(x1), t)))
		var y := int(round(lerpf(float(y0), float(y1), t)))
		if x >= 0 and x < img.get_width() and y >= 0 and y < img.get_height():
			img.set_pixel(x, y, col)
