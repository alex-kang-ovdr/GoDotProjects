@tool
extends RefCounted

const MANIFEST_PATH := "res://.playforge-showcase.json"
const KINDS := ["rect", "text", "button", "platform", "sprite", "line", "background"]
const OBJECT_ACTIONS := ["show", "hide", "move", "label"]
const EDITOR_REGIONS := ["scene", "viewport", "inspector", "filesystem", "script"]
const MAX_MANIFEST_BYTES := 262144
const MAX_CUES := 512

var title := ""
var duration := 0.0
var viewport_size := Vector2(960, 540)
var roles: Array[Dictionary] = []
var objects: Array[Dictionary] = []
var error_message := ""

var _cues: Array[Dictionary] = []
var _initial_state: Dictionary = {}


func load_manifest(path: String = MANIFEST_PATH) -> bool:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return _fail("The template showcase file is unavailable.")
	if file.get_length() > MAX_MANIFEST_BYTES:
		return _fail("The template showcase file is too large.")
	var parser := JSON.new()
	if parser.parse(file.get_as_text()) != OK:
		return _fail("The template showcase file contains invalid JSON.")
	return load_data(parser.data)


func load_data(data: Variant) -> bool:
	_clear()
	if not data is Dictionary or data.get("schemaVersion") != 1:
		return _fail("Unsupported showcase format.")
	if not _has_text(data.get("title")) or not _is_number(data.get("duration")):
		return _fail("The showcase title or duration is invalid.")
	var run_duration := float(data.duration)
	if run_duration <= 0.0 or run_duration > 600.0:
		return _fail("The showcase duration is out of range.")
	if not data.get("roles") is Array or not data.get("objects") is Array or not data.get("cues") is Array:
		return _fail("The showcase must define roles, objects, and cues.")
	if data.roles.is_empty() or data.roles.size() > 8 or data.objects.size() > 128 or data.cues.size() > MAX_CUES:
		return _fail("The showcase exceeds the roles, objects, or cues limit.")
	var dimensions: Variant = data.get("viewport", {"width": 960, "height": 540})
	if not dimensions is Dictionary or not _is_number(dimensions.get("width")) or not _is_number(dimensions.get("height")):
		return _fail("The showcase viewport is invalid.")
	var view := Vector2(float(dimensions.width), float(dimensions.height))
	if view.x < 64 or view.y < 64 or view.x > 4096 or view.y > 4096:
		return _fail("The showcase viewport is out of range.")

	var role_states := {}
	for item: Variant in data.roles:
		if not item is Dictionary or not _has_text(item.get("id")) or not _has_text(item.get("label")) or not _has_text(item.get("description")):
			return _fail("A showcase role is invalid.")
		var role: Dictionary = item
		if role_states.has(role.id):
			return _fail("The showcase repeats role '%s'." % role.id)
		if not EDITOR_REGIONS.has(role.get("editorRegion", "viewport")):
			return _fail("The showcase role '%s' has an invalid editor region." % role.id)
		roles.append(role.duplicate(true))
		role_states[role.id] = {"position": null, "text": role.description}

	var object_states := {}
	var object_roles := {}
	for item: Variant in data.objects:
		if not item is Dictionary or not _has_text(item.get("id")) or not KINDS.has(item.get("kind")) or not role_states.has(item.get("role")):
			return _fail("A showcase object is invalid.")
		var definition: Dictionary = item
		if object_states.has(definition.id) or not _has_position(definition):
			return _fail("The showcase object '%s' has a duplicate ID or invalid position." % definition.id)
		if not _is_number(definition.get("w")) or not _is_number(definition.get("h")) or float(definition.w) < 0.0 or float(definition.h) < 0.0:
			return _fail("The showcase object '%s' has invalid dimensions." % definition.id)
		if definition.kind == "line" and not _has_line_points(definition.get("points")):
			return _fail("The showcase line '%s' must have at least two points." % definition.id)
		objects.append(definition.duplicate(true))
		object_roles[definition.id] = definition.role
		object_states[definition.id] = {
			"visible": definition.get("visible", false) == true,
			"position": _position(definition),
			"label": str(definition.get("label", "")),
		}

	for item: Variant in data.cues:
		if not item is Dictionary or not _is_number(item.get("at")) or not role_states.has(item.get("role")):
			return _fail("A showcase cue has an invalid time or role.")
		var cue: Dictionary = item
		var time := float(cue.at)
		if time < 0.0 or time > run_duration:
			return _fail("A showcase cue falls outside the timeline.")
		var action: Variant = cue.get("action")
		if action == "point":
			if not _has_position(cue):
				return _fail("A showcase cursor cue has an invalid position.")
		elif not OBJECT_ACTIONS.has(action) or object_roles.get(cue.get("object")) != cue.role:
			return _fail("A showcase cue has an invalid action or object owner.")
		elif action == "move" and not _has_position(cue):
			return _fail("A showcase move cue has an invalid position.")
		elif action == "label" and not cue.get("text") is String:
			return _fail("A showcase label cue is missing its text.")
		var normalized: Dictionary = cue.duplicate(true)
		normalized.order = _cues.size()
		_cues.append(normalized)
	# Preserve manifest order when two edits share a timestamp.
	_cues.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a.order < b.order if a.at == b.at else a.at < b.at)
	_initial_state = {"roles": role_states, "objects": object_states}
	title = data.title
	duration = run_duration
	viewport_size = view
	return true


func evaluate(seconds: float) -> Dictionary:
	var time := clampf(seconds, 0.0, duration) if is_finite(seconds) else 0.0
	var snapshot := _initial_state.duplicate(true)
	snapshot.time = time
	for cue in _cues:
		if cue.at > time:
			break
		var role: Dictionary = snapshot.roles[cue.role]
		if cue.get("text") is String and cue.action != "label":
			role.text = cue.text
		if cue.action == "point":
			role.position = _position(cue)
			continue
		var object: Dictionary = snapshot.objects[cue.object]
		match cue.action:
			"show": object.visible = true
			"hide": object.visible = false
			"move": object.position = _position(cue)
			"label": object.label = cue.text
	return snapshot


func _clear() -> void:
	title = ""
	duration = 0.0
	viewport_size = Vector2(960, 540)
	roles.clear()
	objects.clear()
	_cues.clear()
	_initial_state = {"roles": {}, "objects": {}}
	error_message = ""


func _fail(message: String) -> bool:
	_clear()
	error_message = message
	return false


func _has_text(value: Variant) -> bool:
	return value is String and not value.strip_edges().is_empty()


func _is_number(value: Variant) -> bool:
	return (value is float or value is int) and is_finite(float(value))


func _has_position(value: Dictionary) -> bool:
	return _is_number(value.get("x")) and _is_number(value.get("y"))


func _position(value: Dictionary) -> Vector2:
	return Vector2(float(value.x), float(value.y))


func _has_line_points(points: Variant) -> bool:
	if not points is Array or points.size() < 2 or points.size() > 64:
		return false
	for point: Variant in points:
		if not point is Array or point.size() != 2 or not _is_number(point[0]) or not _is_number(point[1]):
			return false
	return true
