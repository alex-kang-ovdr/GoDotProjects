class_name GameAudio
extends Node

## Native oscillator port of the original dist/audio.js. No audio asset files.
var enabled = true
var volume = 0.35
var last = {}
var voices: Array = []
var sample_clock = 0.0
var player: AudioStreamPlayer
var playback: AudioStreamGeneratorPlayback
const RATE = 22050.0

func _ready():
	if DisplayServer.get_name() == "headless":
		set_process(false)
		return
	player = AudioStreamPlayer.new()
	var stream = AudioStreamGenerator.new()
	stream.mix_rate = RATE
	stream.buffer_length = 0.15
	player.stream = stream
	add_child(player)
	player.play()
	playback = player.get_stream_playback()

func tone(frequency, duration = 0.12, wave = "sine", gain = 0.1, slide = 0.0, delay = 0.0):
	if not enabled or playback == null:
		return
	voices.append({"frequency":float(frequency),"duration":float(duration),"wave":wave,"gain":gain*volume,"slide":float(slide),"start":sample_clock+delay,"phase":0.0})

func play(kind: String):
	var now = Time.get_ticks_msec()
	var gap = {"hit":100,"kill":90,"shoot":110,"pickup":70}.get(kind,0)
	if now-last.get(kind,-1000)<gap:
		return
	last[kind] = now
	match kind:
		"shoot": tone(230,0.065,"triangle",0.045,90)
		"hit": tone(90,0.13,"sawtooth",0.12,35)
		"kill": tone(230,0.07,"triangle",0.06,460)
		"pickup": tone(820,0.055,"sine",0.045,1250)
		"dash": tone(260,0.16,"triangle",0.1,70)
		"jump": tone(160,0.16,"sine",0.08,360)
		"levelup","loot":
			var frequencies = [523,659,784,1047]
			for i in frequencies.size(): tone(frequencies[i],0.26,"sine",0.13,0,i*0.085)
		"choice":
			tone(660,0.11,"sine",0.1)
			tone(990,0.16,"sine",0.1,0,0.05)
		"boss":
			var frequencies = [100,95,85]
			for i in frequencies.size(): tone(frequencies[i],0.6,"triangle",0.17,70,i*0.2)
		"victory":
			var frequencies = [392,523,659,784,1047]
			for i in frequencies.size(): tone(frequencies[i],0.5,"triangle",0.12,0,i*0.14)
		"death": tone(220,0.7,"triangle",0.17,50)
		"heal":
			tone(523,0.16,"sine",0.11)
			tone(784,0.26,"sine",0.1,0,0.1)
		_: tone(440,0.065,"sine",0.07,550)

func _process(_delta):
	if playback == null:
		return
	var frames = mini(playback.get_frames_available(),4096)
	var buffer = PackedVector2Array()
	buffer.resize(frames)
	for i in frames:
		var sample = 0.0
		for voice in voices:
			var t = sample_clock-voice.start
			if t<0 or t>voice.duration:
				continue
			var frequency = voice.frequency
			if voice.slide>0:
				frequency *= pow(maxf(20.0,voice.slide)/voice.frequency,t/voice.duration)
			voice.phase += TAU*frequency/RATE
			var wave = sin(voice.phase)
			if voice.wave == "triangle": wave = 2.0/PI*asin(sin(voice.phase))
			elif voice.wave == "sawtooth": wave = 2.0*fposmod(voice.phase/TAU,1.0)-1.0
			var envelope = voice.gain*t/0.008 if t<0.008 else voice.gain*pow(0.0001/maxf(0.0001,voice.gain),(t-0.008)/maxf(0.001,voice.duration-0.008))
			sample += wave*envelope if enabled else 0.0
		buffer[i] = Vector2.ONE*clampf(sample,-1.0,1.0)
		sample_clock += 1.0/RATE
	playback.push_buffer(buffer)
	voices = voices.filter(func(v): return sample_clock<v.start+v.duration+0.01)
