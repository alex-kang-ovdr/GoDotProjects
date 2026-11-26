extends Node
class_name OniAudio

var muted := false
var _player: AudioStreamPlayer
var _playback: AudioStreamGeneratorPlayback
var _sample_rate := 22050.0

func _ready() -> void:
	_player = AudioStreamPlayer.new()
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = _sample_rate
	gen.buffer_length = 0.25
	_player.stream = gen
	_player.volume_db = -14.0
	add_child(_player)
	_player.play()
	_playback = _player.get_stream_playback() as AudioStreamGeneratorPlayback

func play_tone(freq: float, duration := 0.07, gain := 0.22) -> void:
	if muted or _playback == null:
		return
	var frames := int(min(float(_playback.get_frames_available()), _sample_rate * duration))
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
	play_tone(520.0, 0.04, 0.16)

func play_dig_done() -> void:
	play_tone(290.0, 0.07, 0.22)

func play_build_done() -> void:
	play_tone(640.0, 0.09, 0.20)
