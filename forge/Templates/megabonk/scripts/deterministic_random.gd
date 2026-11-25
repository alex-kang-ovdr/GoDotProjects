extends RefCounted
class_name DeterministicRandom
var state: int = 0
static func imul(a: int, b: int) -> int:
	return (a * b) & 0xffffffff
static func seedNumber(value) -> int:
	if (value is int or value is float) and is_finite(float(value)):
		return int(value) & 0xffffffff
	var hash_value: int = 2166136261
	var text_value = "wildrun" if value == null else str(value)
	# JS iterates code points but charCodeAt(0) returns a UTF-16 high surrogate.
	for character in text_value:
		var code = character.unicode_at(0)
		if code > 0xffff: code = 0xd800 + ((code - 0x10000) >> 10)
		hash_value = imul(hash_value ^ code, 16777619)
	return hash_value
func _init(value = 20261123): state = seedNumber(value)
func next() -> float:
	state = (state + 0x6D2B79F5) & 0xffffffff
	var t = state
	t = imul(t ^ (t >> 15), t | 1)
	t = (t ^ ((t + imul(t ^ (t >> 7), t | 61)) & 0xffffffff)) & 0xffffffff
	return float((t ^ (t >> 14)) & 0xffffffff) / 4294967296.0
func range(a, b): return a + (b - a) * next()
func pick(array): return array[min(array.size() - 1, int(floor(next() * array.size())))] if not array.is_empty() else null
