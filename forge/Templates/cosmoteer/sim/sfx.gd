extends Node

## Pure-GDScript procedural Web-safe SFX bank using pre-baked 16-bit PCM AudioStreamWAV.
## Zero external audio assets; safe under both WebAssembly and --headless test runners.

const SAMPLE_RATE := 22050
const POOL_SIZE := 6
const KINDS := [
	"shot_laser",
	"shot_heavy_laser",
	"shot_cannon",
	"shot_missile",
	"shot_disruptor",
	"shot_ion",
	"shot_railgun",
	"shot_flak",
	"shot_chaingun",
	"shield_hit",
	"shield_down",
	"intercept",
	"fire_ignite",
	"destroyed",
]

var enabled := true
var streams: Dictionary = {}
var _players: Array[AudioStreamPlayer] = []
var _cursor := 0
var _last_played: Dictionary = {}


func _ready() -> void:
	build_streams()
	for _i in POOL_SIZE:
		var player := AudioStreamPlayer.new()
		player.volume_db = -10.0
		add_child(player)
		_players.append(player)


func build_streams() -> void:
	if not streams.is_empty():
		return
	streams["shot_laser"] = _make_sweep(0.08, 1280.0, 420.0, 0.28, false)
	streams["shot_heavy_laser"] = _make_sweep(0.14, 720.0, 190.0, 0.36, false)
	streams["shot_cannon"] = _make_sweep(0.13, 210.0, 58.0, 0.42, true)
	streams["shot_missile"] = _make_sweep(0.18, 340.0, 620.0, 0.30, true)
	streams["shot_disruptor"] = _make_chime(0.10, 1320.0, 660.0, 0.28)
	streams["shot_ion"] = _make_chime(0.12, 480.0, 960.0, 0.22)
	streams["shot_railgun"] = _make_sweep(0.22, 1950.0, 140.0, 0.44, true)
	streams["shot_flak"] = _make_sweep(0.14, 280.0, 85.0, 0.40, true)
	streams["shot_chaingun"] = _make_sweep(0.05, 520.0, 180.0, 0.24, true)
	streams["shield_hit"] = _make_chime(0.11, 980.0, 1480.0, 0.28)
	streams["shield_down"] = _make_sweep(0.28, 660.0, 110.0, 0.38, false)
	streams["intercept"] = _make_sweep(0.06, 1760.0, 920.0, 0.24, false)
	streams["fire_ignite"] = _make_sweep(0.16, 420.0, 260.0, 0.26, true)
	streams["destroyed"] = _make_sweep(0.32, 160.0, 38.0, 0.48, true)


func play(kind: String) -> void:
	if not enabled or _players.is_empty():
		return
	if DisplayServer.get_name() == "headless":
		return
	if not streams.has(kind):
		return
	var now := Time.get_ticks_msec()
	if now - int(_last_played.get(kind, 0)) < 45:
		return
	_last_played[kind] = now
	var player: AudioStreamPlayer = _players[_cursor]
	_cursor = (_cursor + 1) % _players.size()
	player.stream = streams[kind]
	player.play()


static func _make_sweep(duration: float, f0: float, f1: float, amp: float, noisy: bool) -> AudioStreamWAV:
	var count := maxi(1, int(SAMPLE_RATE * duration))
	var pcm := PackedByteArray()
	pcm.resize(count * 2)
	var phase := 0.0
	var rng := RandomNumberGenerator.new()
	rng.seed = int(f0 * 17.0 + f1 * 31.0)
	for i in count:
		var t := float(i) / float(count)
		var env := (1.0 - t) * (1.0 - t)
		var freq := lerpf(f0, f1, t)
		phase += TAU * freq / float(SAMPLE_RATE)
		var sample := sin(phase)
		if noisy:
			sample = sample * 0.55 + rng.randf_range(-1.0, 1.0) * 0.45
		var s16 := clampi(roundi(sample * env * amp * 32767.0), -32768, 32767)
		pcm.encode_s16(i * 2, s16)
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = SAMPLE_RATE
	wav.stereo = false
	wav.data = pcm
	return wav


static func _make_chime(duration: float, f0: float, f1: float, amp: float) -> AudioStreamWAV:
	var count := maxi(1, int(SAMPLE_RATE * duration))
	var pcm := PackedByteArray()
	pcm.resize(count * 2)
	for i in count:
		var t := float(i) / float(count)
		var env := (1.0 - t)
		var time_s := float(i) / float(SAMPLE_RATE)
		var sample := 0.6 * sin(TAU * f0 * time_s) + 0.4 * sin(TAU * f1 * time_s)
		var s16 := clampi(roundi(sample * env * amp * 32767.0), -32768, 32767)
		pcm.encode_s16(i * 2, s16)
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = SAMPLE_RATE
	wav.stereo = false
	wav.data = pcm
	return wav
