extends Node
class_name OniAudio

# 원작 FMOD FSB5에서 추출한 실제 PCM16 AudioStreamWAV 우선 재생 + 절차형 합성음 폴백

var muted := false
var _wav_players: Array[AudioStreamPlayer] = []
var _wav_cursor := 0
var _synth_player: AudioStreamPlayer
var _playback: AudioStreamGeneratorPlayback
var _sample_rate := 22050.0

func _ready() -> void:
	OniMedia.ensure_loaded()
	for _i in range(4):
		var p := AudioStreamPlayer.new()
		p.volume_db = -8.0
		add_child(p)
		_wav_players.append(p)

	_synth_player = AudioStreamPlayer.new()
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = _sample_rate
	gen.buffer_length = 0.25
	_synth_player.stream = gen
	_synth_player.volume_db = -14.0
	add_child(_synth_player)
	_synth_player.play()
	_playback = _synth_player.get_stream_playback() as AudioStreamGeneratorPlayback

func _play_extracted(key: String, fallback_freq: float, fallback_dur := 0.07) -> void:
	if muted:
		return
	var stream := OniMedia.get_sfx_stream(key)
	if stream != null and not _wav_players.is_empty():
		var p: AudioStreamPlayer = _wav_players[_wav_cursor]
		_wav_cursor = (_wav_cursor + 1) % _wav_players.size()
		p.stream = stream
		p.play()
		return
	play_tone(fallback_freq, fallback_dur, 0.20)

func play_tone(freq: float, duration := 0.07, gain := 0.22) -> void:
	if muted or _playback == null:
		return
	var frames := int(minf(float(_playback.get_frames_available()), _sample_rate * duration))
	if frames <= 0:
		return
	var phase := 0.0
	var step := TAU * freq / _sample_rate
	for i in range(frames):
		var env := 1.0 - float(i) / float(frames)
		var s := sin(phase) * env * gain
		_playback.push_frame(Vector2(s, s))
		phase += step

func play_click() -> void:
	_play_extracted("click", 520.0, 0.04)

func play_drag() -> void:
	_play_extracted("drag", 460.0, 0.03)

func play_place() -> void:
	_play_extracted("place", 580.0, 0.06)

func play_toggle() -> void:
	_play_extracted("toggle", 600.0, 0.05)

func play_dig_done() -> void:
	_play_extracted("dig_done", 290.0, 0.07)

func play_build_done() -> void:
	_play_extracted("build_done", 640.0, 0.09)

func play_cancel() -> void:
	_play_extracted("cancel", 340.0, 0.05)

func play_door() -> void:
	_play_extracted("door", 420.0, 0.08)

func play_print_ok() -> void:
	_play_extracted("print_ok", 720.0, 0.12)

func play_research_done() -> void:
	_play_extracted("research_done", 820.0, 0.14)

func play_level_up() -> void:
	_play_extracted("level_up", 760.0, 0.14)

func play_plant_grow() -> void:
	_play_extracted("plant_grow", 540.0, 0.08)

func play_warp() -> void:
	_play_extracted("warp", 480.0, 0.12)

func play_circuit_toggle() -> void:
	_play_extracted("circuit_toggle", 620.0, 0.06)
