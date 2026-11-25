extends RefCounted
# Small native semantic adapters used by the direct JavaScript-to-GDScript port.
# This file does not evaluate or execute JavaScript.
static func num(value):
	if value == null: return 0.0
	if value is bool: return 1.0 if value else 0.0
	if value is int or value is float: return float(value)
	if value is String: return float(value) if value.is_valid_float() else NAN
	return NAN
static func is_finite_value(value):
	return (value is int or value is float) and is_finite(float(value))
static func is_integer(value):
	return is_finite_value(value) and floor(float(value)) == float(value)
static func truthy(value):
	if value == null: return false
	if value is bool: return value
	if value is int or value is float: return value != 0 and not is_nan(float(value))
	if value is String: return not value.is_empty()
	return true
static func typeof(value):
	if value == null: return "undefined"
	if value is bool: return "boolean"
	if value is int or value is float: return "number"
	if value is String: return "string"
	return "object"
static func string(value):
	if value == null: return "undefined"
	if value is bool: return "true" if value else "false"
	if value is float and is_finite(value) and floor(value) == value: return str(int(value))
	return str(value)
static func getv(object, key):
	if object == null: return null
	if object is Dictionary: return object.get(key, null)
	if object is Array:
		var i = int(num(key))
		return object[i] if i >= 0 and i < object.size() else null
	if object is Object: return object.get(str(key))
	return null
static func setv(object, key, value):
	if object is Dictionary: object[key] = value
	elif object is Array: object[int(key)] = value
	elif object is Object: object.set(str(key), value)
	return value
static func inc(object, key, amount, prefix = false):
	var old = num(getv(object, key))
	setv(object, key, old + amount)
	return old + amount if prefix else old
static func eq(a, b):
	if a is Dictionary or a is Array: return is_same(a, b)
	if (a is int or a is float) and (b is int or b is float): return a == b
	if typeof(a) != typeof(b): return false
	return a == b
static func compare(a, b, op):
	# JavaScript undefined relational comparisons are always false.
	if a == null or b == null: return false
	var left = a if a is String and b is String else num(a)
	var right = b if a is String and b is String else num(b)
	match op:
		">": return left > right
		"<": return left < right
		">=": return left >= right
		"<=": return left <= right
	return false
static func add(a, b):
	if a is String or b is String: return string(a) + string(b)
	return num(a) + num(b)
static func or_value(a, b): return a if truthy(a) else b.call()
static func and_value(a, b): return b.call() if truthy(a) else a
static func coalesce(a, b): return b.call() if a == null else a
static func length(value):
	if value is Array or value is Dictionary or value is String: return value.size() if not value is String else value.length()
	return 0
static func merge(objects):
	var out = {}
	for object in objects:
		if object is Dictionary: out.merge(object, true)
	return out
static func assign(target, values):
	target.merge(values, true)
	return target
static func entries(object):
	var out = []
	if object is Dictionary:
		for key in object: out.append([key, object[key]])
	return out
static func has(object, key): return object.has(key) if object != null else false
static func push(array, value):
	array.append(value)
	return array.size()
static func shift(array): return array.pop_front() if not array.is_empty() else null
static func splice(array, start = 0, count = null):
	var s = int(start)
	if s < 0: s = max(0, array.size() + s)
	var n = array.size() - s if count == null else min(int(count), array.size() - s)
	var removed = []
	for i in range(max(0, n)): removed.append(array.pop_at(s))
	return removed
static func invoke(callback, arguments):
	return callback.callv(arguments.slice(0, callback.get_argument_count()))
static func filterv(array, callback):
	var out = []
	for i in range(array.size()):
		if truthy(invoke(callback, [array[i], i])): out.append(array[i])
	return out
static func mapv(array, callback):
	var out = []
	for i in range(array.size()): out.append(invoke(callback, [array[i], i]))
	return out
static func reducev(array, callback, initial = null):
	var result = initial
	var start = 0
	if initial == null and not array.is_empty(): result = array[0]; start = 1
	for i in range(start, array.size()): result = invoke(callback, [result, array[i], i])
	return result
static func find(array, callback):
	for i in range(array.size()):
		if truthy(invoke(callback, [array[i], i])): return array[i]
	return null
static func some(array, callback): return find(array, callback) != null
static func every(array, callback):
	for i in range(array.size()):
		if not truthy(invoke(callback, [array[i], i])): return false
	return true
static func includes(array, value):
	for e in array:
		if eq(e, value): return true
	return false
static func slicev(array, begin = 0, end = null):
	return array.slice(int(begin), array.size() if end == null else int(end))
static func at(array, index): return array[int(index)]
static func sortv(array, callback):
	# JavaScript Array.sort is stable; preserve insertion order for equal-distance
	# targets because their on-hit proc order can consume the seeded RNG.
	var decorated = []
	for i in range(array.size()): decorated.append({"index":i,"value":array[i]})
	decorated.sort_custom(func(a, b):
		var difference = callback.call(a.value, b.value)
		return difference < 0 or (difference == 0 and a.index < b.index))
	for i in range(array.size()): array[i] = decorated[i].value
	return array
static func set_new(values = []):
	var out = {}
	for value in values: out[value] = true
	return out
static func map_new(values = []):
	var out = {}
	for pair in values: out[pair[0]] = pair[1]
	return out
static func set_add(object, value):
	if object != null: object[value] = true
	return object
static func clearv(object):
	if object != null: object.clear()
static func deletev(object, key): return object.erase(key)
static func to_fixed(value, digits):
	return String.num(num(value), int(digits))
static func round_js(value): return floor(num(value) + 0.5)
static func hypot(values):
	var sum_value = 0.0
	for v in values: sum_value += num(v) * num(v)
	return sqrt(sum_value)
static func imul(a, b):
	var value = (int(a) * int(b)) & 0xffffffff
	return value - 0x100000000 if value > 0x7fffffff else value
static func char_code(value, index): return str(value).unicode_at(int(index))
static func replacev(value, regex_pattern, replacement):
	var regex = RegEx.new()
	regex.compile(regex_pattern)
	return regex.sub(value, replacement)
