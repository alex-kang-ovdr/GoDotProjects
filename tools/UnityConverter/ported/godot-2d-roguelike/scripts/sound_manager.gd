extends Node

## Port of Assets/Scripts/SoundManager.cs (DontDestroyOnLoad -> Autoload Singleton)

var low_pitch_range: float = 0.95
var high_pitch_range: float = 1.05

var efx_source: AudioStreamPlayer
var music_source: AudioStreamPlayer
var clips: Dictionary = {}

func _ready() -> void:
	efx_source = AudioStreamPlayer.new()
	efx_source.name = "EfxSource"
	add_child(efx_source)

	music_source = AudioStreamPlayer.new()
	music_source.name = "MusicSource"
	add_child(music_source)

	var clip_names := [
		"scavengers_chop1", "scavengers_chop2",
		"scavengers_die",
		"scavengers_enemy1", "scavengers_enemy2",
		"scavengers_footstep1", "scavengers_footstep2",
		"scavengers_fruit1", "scavengers_fruit2",
		"scavengers_music",
		"scavengers_soda1", "scavengers_soda2",
	]
	for clip_name in clip_names:
		var path := "res://assets/audio/%s.wav" % clip_name
		if ResourceLoader.exists(path):
			clips[clip_name] = load(path)

	if clips.has("scavengers_music"):
		music_source.stream = clips["scavengers_music"]
		music_source.volume_db = -10.0

func start_music() -> void:
	if music_source and music_source.stream and not music_source.playing:
		music_source.play()

func stop_music() -> void:
	if music_source:
		music_source.stop()

func play_single(clip_name: String) -> void:
	if not clips.has(clip_name) or efx_source == null:
		return
	efx_source.pitch_scale = 1.0
	efx_source.stream = clips[clip_name]
	efx_source.play()

func randomize_sfx(clip_names: Array[String]) -> void:
	if clip_names.is_empty() or efx_source == null:
		return
	var chosen := clip_names[randi() % clip_names.size()]
	if not clips.has(chosen):
		return
	efx_source.pitch_scale = randf_range(low_pitch_range, high_pitch_range)
	efx_source.stream = clips[chosen]
	efx_source.play()
