class_name CosmoteerSfx
extends Node

## 코스모티어 내재화 WAV 효과음(17종 base64 PCM) 로더 및 절차적 폴백 사운드 뱅크.
## WebAssembly 및 --headless 실행 환경 모두 100% 안전하게 동작한다.

const SFX_DIR := "res://assets/cosmoteer/sfx"
const SAMPLE_RATE := 22050
const POOL_SIZE := 6
const KINDS := [
	"shot_laser",
	"shot_heavy_laser",
	"shot_cannon",
	"shot_cannon_large",
	"shot_cannon_deck",
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
	"reactor_meltdown",
]

static var _wav_cache: Dictionary = {}

var enabled := true
var streams: Dictionary = {}
var _players: Array[AudioStreamPlayer] = []
var _cursor := 0
var _last_played: Dictionary = {}

func _ready() -> void:
	build_streams()
	for _i in POOL_SIZE:
		var player := AudioStreamPlayer.new()
		player.volume_db = -9.5
		add_child(player)
		_players.append(player)

func build_streams() -> void:
	if not streams.is_empty():
		return
	streams["shot_laser"] = _make_sweep(0.08, 1280.0, 420.0, 0.28, false)
	streams["shot_heavy_laser"] = _make_sweep(0.14, 720.0, 190.0, 0.36, false)
	streams["shot_cannon"] = _make_sweep(0.13, 210.0, 58.0, 0.42, true)
	streams["shot_cannon_large"] = _make_sweep(0.18, 175.0, 48.0, 0.46, true)
	streams["shot_cannon_deck"] = _make_sweep(0.24, 145.0, 36.0, 0.50, true)
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
	streams["reactor_meltdown"] = _make_sweep(0.55, 190.0, 28.0, 0.58, true)
	for k in KINDS:
		var bundled := load_bundled_wav(k)
		if bundled != null:
			streams[k] = bundled

static func bundled_sfx_count() -> int:
	var c := 0
	for k in KINDS:
		if load_bundled_wav(k) != null:
			c += 1
	return c

static func load_bundled_wav(kind: String) -> AudioStreamWAV:
	if _wav_cache.has(kind):
		return _wav_cache[kind]
	var path := SFX_DIR.path_join(kind + ".txt")
	if not FileAccess.file_exists(path):
		return null
	var raw_b64 := FileAccess.get_file_as_string(path).strip_edges()
	if raw_b64.is_empty():
		return null
	var wav := _parse_wav_bytes(Marshalls.base64_to_raw(raw_b64))
	if wav != null:
		_wav_cache[kind] = wav
	return wav

static func sfx_for_weapon_kind(kind: String) -> String:
	match kind:
		"laser", "cosmo_pd", "cosmo_mining_laser", "mining", "pd":
			return "shot_laser"
		"cosmo_heavy_laser", "heavy_laser":
			return "shot_heavy_laser"
		"cosmo_disruptor", "disruptor":
			return "shot_disruptor"
		"cosmo_ion_beam", "cosmo_resonance_turret", "cosmo_tractor_beam", "ion", "resonance", "tractor":
			return "shot_ion"
		"cosmo_cannon_med", "machine_gun", "cannon":
			return "shot_cannon"
		"cosmo_cannon_large", "cannon_large":
			return "shot_cannon_large"
		"cosmo_cannon_deck", "cannon_deck":
			return "shot_cannon_deck"
		"cosmo_chaingun", "chaingun":
			return "shot_chaingun"
		"cosmo_flak", "flak":
			return "shot_flak"
		"railgun":
			return "shot_railgun"
		"missile", "mini_missile", "missile_launcher", "missile_emp", "missile_nuke", "mine":
			return "shot_missile"
	return "shot_laser"

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

static func _parse_wav_bytes(bytes: PackedByteArray) -> AudioStreamWAV:
	if bytes.size() < 44:
		return null
	if bytes.slice(0, 4).get_string_from_ascii() != "RIFF" or bytes.slice(8, 12).get_string_from_ascii() != "WAVE":
		return null
	var offset := 12
	var audio_format := 1
	var channels := 1
	var sample_rate := 44100
	var bits_per_sample := 16
	var pcm := PackedByteArray()
	while offset + 8 <= bytes.size():
		var chunk_id := bytes.slice(offset, offset + 4).get_string_from_ascii()
		var chunk_size := int(bytes.decode_u32(offset + 4))
		offset += 8
		if offset + chunk_size > bytes.size():
			break
		if chunk_id == "fmt " and chunk_size >= 16:
			audio_format = int(bytes.decode_u16(offset))
			channels = int(bytes.decode_u16(offset + 2))
			sample_rate = int(bytes.decode_u32(offset + 4))
			bits_per_sample = int(bytes.decode_u16(offset + 14))
		elif chunk_id == "data":
			pcm = bytes.slice(offset, offset + chunk_size)
		offset += chunk_size + (chunk_size & 1)
	if audio_format != 1 or pcm.is_empty() or not (bits_per_sample in [8, 16]):
		return null
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS if bits_per_sample == 16 else AudioStreamWAV.FORMAT_8_BITS
	wav.mix_rate = sample_rate
	wav.stereo = channels >= 2
	wav.data = pcm
	return wav

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
