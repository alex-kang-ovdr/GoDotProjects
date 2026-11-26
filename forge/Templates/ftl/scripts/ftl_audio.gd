class_name FTLAudio
extends Node

## Authentic FTL dual-stream synchronized Explore <-> Battle music crossfader + SFX pool.
## Plays real OGG music and OGG/WAV SFX from ftl.dat.vanilla via FTLPkg.

var pkg: FTLPkg
var db: FTLDatabase

var music_volume: float = 0.65
var sfx_volume: float = 0.75
var muted: bool = false

var _explore_player: AudioStreamPlayer
var _combat_player: AudioStreamPlayer
var _sfx_pool: Array[AudioStreamPlayer] = []
var _sfx_cursor: int = 0
var _current_track: String = ""
var _desired_explore_key: String = ""
var _desired_combat_key: String = ""
var _in_combat: bool = false
var _combat_blend: float = 0.0
var _headless: bool = false

const SFX_POOL_SIZE := 14


func _ready() -> void:
	_headless = (DisplayServer.get_name() == "headless")
	_explore_player = AudioStreamPlayer.new()
	_explore_player.name = "MusicExplore"
	add_child(_explore_player)

	_combat_player = AudioStreamPlayer.new()
	_combat_player.name = "MusicCombat"
	add_child(_combat_player)

	for i in range(SFX_POOL_SIZE):
		var p := AudioStreamPlayer.new()
		p.name = "SFX_%d" % i
		add_child(p)
		_sfx_pool.append(p)


func setup(p_pkg: FTLPkg, p_db: FTLDatabase) -> void:
	pkg = p_pkg
	db = p_db
	if pkg != null and not pkg.audio_loaded.is_connected(_on_web_audio_loaded):
		pkg.audio_loaded.connect(_on_web_audio_loaded)
	var ini := pkg.load_settings_ini() if pkg != null else {}
	music_volume = clampf(float(ini.get("music", 75)) / 100.0 * 0.75, 0.0, 1.0)
	sfx_volume = clampf(float(ini.get("sound", 80)) / 100.0 * 0.85, 0.0, 1.0)


func _on_web_audio_loaded(rel_path: String) -> void:
	if _headless or pkg == null:
		return
	if rel_path == _desired_explore_key:
		var s := pkg.load_audio(rel_path)
		if s is AudioStreamOggVorbis:
			(s as AudioStreamOggVorbis).loop = true
		if s != null:
			_explore_player.stream = s
			_explore_player.play()
			_apply_music_volumes()
	elif rel_path == _desired_combat_key:
		var sc := pkg.load_audio(rel_path)
		if sc is AudioStreamOggVorbis:
			(sc as AudioStreamOggVorbis).loop = true
		if sc != null:
			_combat_player.stream = sc
			var pos := _explore_player.get_playback_position() if _explore_player.playing else 0.0
			_combat_player.play(pos)
			_apply_music_volumes()


func play_track(track_name: String, combat: bool = false) -> void:
	_in_combat = combat
	if _headless or pkg == null or db == null or not pkg.is_loaded:
		return
	if track_name == _current_track and _explore_player.playing:
		return
	var track: Dictionary = db.music_tracks.get(track_name, {})
	if track.is_empty():
		track = db.music_tracks.get("civilian", {})
	if track.is_empty():
		return
	_current_track = track_name
	_explore_player.stop()
	_combat_player.stop()

	var exp_file: String = str(track.get("explore", ""))
	var cmb_file: String = str(track.get("combat", ""))
	_desired_explore_key = ("audio/music/" + exp_file) if not exp_file.is_empty() else ""
	_desired_combat_key = ("audio/music/" + cmb_file) if not cmb_file.is_empty() else ""
	if not _desired_explore_key.is_empty():
		var s := pkg.load_audio(_desired_explore_key)
		if s is AudioStreamOggVorbis:
			(s as AudioStreamOggVorbis).loop = true
		if s != null:
			_explore_player.stream = s
			_explore_player.play()
	if not _desired_combat_key.is_empty():
		var sc := pkg.load_audio(_desired_combat_key)
		if sc is AudioStreamOggVorbis:
			(sc as AudioStreamOggVorbis).loop = true
		if sc != null:
			_combat_player.stream = sc
			_combat_player.play()
	_combat_blend = 1.0 if combat else 0.0
	_apply_music_volumes()


func set_combat(combat: bool) -> void:
	_in_combat = combat


func play_sfx(sound_id: String, pitch_jitter: float = 0.04) -> void:
	if _headless or muted or sound_id.is_empty():
		return
	var stream: AudioStream = null
	var vol_scale := sfx_volume
	if pkg != null and db != null and pkg.is_loaded and db.sound_effects.has(sound_id):
		var info: Dictionary = db.sound_effects[sound_id]
		var rel: String = "audio/waves/" + str(info.get("file", ""))
		stream = pkg.load_audio(rel)
		vol_scale = clampf(float(info.get("volume", 7)) / 10.0, 0.1, 1.0) * sfx_volume
	if stream == null:
		stream = FTLStandaloneAssets.get_procedural_sfx(sound_id)
		vol_scale = 0.65 * sfx_volume
	if stream == null:
		return
	var p := _sfx_pool[_sfx_cursor % _sfx_pool.size()]
	_sfx_cursor += 1
	p.stream = stream
	p.volume_db = linear_to_db(maxf(0.001, vol_scale))
	p.pitch_scale = randf_range(1.0 - pitch_jitter, 1.0 + pitch_jitter) if pitch_jitter > 0.0 else 1.0
	p.play()


func play_random_sfx(sound_ids: Array, pitch_jitter: float = 0.05) -> void:
	if sound_ids.is_empty():
		return
	var chosen := str(sound_ids[randi() % sound_ids.size()])
	play_sfx(chosen, pitch_jitter)


func _process(delta: float) -> void:
	if _headless:
		return
	var target := 1.0 if _in_combat else 0.0
	if not is_equal_approx(_combat_blend, target):
		_combat_blend = move_toward(_combat_blend, target, delta * 0.85)
		_apply_music_volumes()


func _apply_music_volumes() -> void:
	if muted or music_volume <= 0.001:
		_explore_player.volume_db = -80.0
		_combat_player.volume_db = -80.0
		return
	var has_combat := _combat_player.stream != null
	if not has_combat:
		_explore_player.volume_db = linear_to_db(music_volume)
		_combat_player.volume_db = -80.0
		return
	var exp_lin := maxf(0.0001, (1.0 - _combat_blend) * music_volume)
	var cmb_lin := maxf(0.0001, _combat_blend * music_volume)
	_explore_player.volume_db = linear_to_db(exp_lin)
	_combat_player.volume_db = linear_to_db(cmb_lin)
