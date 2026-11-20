extends Node
## Small original procedural WAVs. No external audio packages or downloads.
var enabled: bool = true
var volume: float = 0.70
var voices: Array = []
var streams: Dictionary = {}
var cursor: int = 0
var clocks: Dictionary = {}

func _ready() -> void:
	for key in ["shot","hit","kill","pickup","level","evolve","boss","win","loss","click"]:
		streams[key] = load("res://assets/audio/" + key + ".wav")
	for i in range(8):
		var voice = AudioStreamPlayer.new()
		voice.volume_db = -12.0 + linear_to_db(maxf(0.0001,volume))
		add_child(voice)
		voices.append(voice)

func apply_settings(options: Dictionary) -> void:
	enabled = bool(options.get("sound",true))
	volume = clampf(float(options.get("volume",0.70)),0.0,1.0)
	for voice in voices:
		voice.volume_db = -12.0 + linear_to_db(maxf(0.0001,volume))
		if not enabled or volume <= 0.0:
			voice.stop()

func play(key: String) -> void:
	if not enabled or volume <= 0.0 or not streams.has(key) or voices.is_empty():
		return
	var now: float = Time.get_ticks_msec() * 0.001
	var gap: float = 0.08 if key in ["shot","kill","pickup"] else 0.15
	if now - float(clocks.get(key,-10.0)) < gap:
		return
	clocks[key] = now
	var voice: AudioStreamPlayer = voices[cursor % voices.size()]
	cursor += 1
	voice.stream = streams[key]
	voice.play()

func _exit_tree() -> void:
	for voice in voices:
		if is_instance_valid(voice):
			voice.stop()
			voice.stream = null
	voices.clear()
	streams.clear()
