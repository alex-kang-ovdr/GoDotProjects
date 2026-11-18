@tool
extends RefCounted

const MANIFEST_PATH := "res://.playforge-showcase.json"
const KINDS := ["rect", "text", "button", "platform", "sprite", "line", "background"]
const PREVIEW_ACTIONS := ["show", "hide", "move", "label"]
const REPLAY_ACTIONS := ["add", "set", "finish"]
const EDITOR_REGIONS := ["scene", "viewport", "inspector", "filesystem", "script"]
const MAX_MANIFEST_BYTES := 262144
const MAX_CUES := 512
const MAX_ROLE_OBJECTS := 64
const MAX_COORDINATE := 16384.0

var schema_version := 0
var title := ""
var duration := 0.0
var viewport_size := Vector2(960, 540)
var roles: Array[Dictionary] = []
var objects: Array[Dictionary] = []
var error_message := ""

var _cues: Array[Dictionary] = []
var _cue_times := PackedFloat64Array()
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
	if not data is Dictionary or not _is_number(data.get("schemaVersion")):
		return _fail("Unsupported showcase format.")
	if data.schemaVersion != 1 and data.schemaVersion != 3:
		return _fail("Unsupported showcase format.")
	schema_version = int(data.schemaVersion)
	if not _has_text(data.get("title")) or not _is_number(data.get("duration")):
		return _fail("The showcase title or duration is invalid.")
	var run_duration := float(data.duration)
	if run_duration <= 0.0 or run_duration > 600.0:
		return _fail("The showcase duration is out of range.")
	if not data.get("roles") is Array or not data.get("cues") is Array:
		return _fail("The showcase must define roles and cues.")
	if data.roles.is_empty() or data.roles.size() > 8 or data.cues.size() > MAX_CUES:
		return _fail("The showcase exceeds its role or cue limit.")
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
	if schema_version == 1:
		if not data.get("objects") is Array or data.objects.size() > 128:
			return _fail("The showcase objects are invalid.")
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
		elif schema_version == 3:
			if not REPLAY_ACTIONS.has(action) or (action != "finish" and not _valid_path(cue.get("object"))):
				return _fail("A replay cue has an invalid action or node path.")
			if action == "set" and (not _has_text(cue.get("property")) or cue.has("value")):
				return _fail("Replay properties must come from the original scene.")
		elif not PREVIEW_ACTIONS.has(action) or object_roles.get(cue.get("object")) != cue.role:
			return _fail("A showcase cue has an invalid action or object owner.")
		elif action == "move" and not _has_position(cue):
			return _fail("A showcase move cue has an invalid position.")
		elif action == "label" and not cue.get("text") is String:
			return _fail("A showcase label cue is missing its text.")
		var step: Dictionary = cue.duplicate(true)
		step.order = _cues.size()
		_cues.append(step)
	_cues.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a.order < b.order if a.at == b.at else a.at < b.at)
	for cue in _cues:
		_cue_times.append(float(cue.at))
	if schema_version == 3 and not _check_replay_order():
		return _fail("Replay cues must add parents first, honor node ownership, and finish once.")
	_initial_state = {"roles": role_states}
	if schema_version == 1:
		_initial_state.objects = object_states
	title = data.title
	duration = run_duration
	viewport_size = view
	return true


func original_steps() -> Array[Dictionary]:
	return _cues if schema_version == 3 else []


func cue_count_at(seconds: float) -> int:
	return _cue_times.bsearch(seconds, false)


func cue_at(index: int) -> Dictionary:
	return _cues[index]


func has_caption(cue: Dictionary) -> bool:
	return cue.action != "label" and _has_text(cue.get("text"))


func evaluate(seconds: float) -> Dictionary:
	var time := clampf(seconds, 0.0, duration) if is_finite(seconds) else 0.0
	var snapshot := _initial_state.duplicate(true)
	snapshot.time = time
	if schema_version >= 3:
		snapshot.createdOrder = []
		snapshot.revision = 0
		snapshot.finished = false
	for cue in _cues:
		if cue.at > time:
			break
		var role: Dictionary = snapshot.roles[cue.role]
		if has_caption(cue):
			role.text = cue.text
		if cue.action == "point":
			role.position = _position(cue)
		elif schema_version == 1:
			var object: Dictionary = snapshot.objects[cue.object]
			match cue.action:
				"show": object.visible = true
				"hide": object.visible = false
				"move": object.position = _position(cue)
				"label": object.label = cue.text
		if schema_version >= 3:
			snapshot.revision += 1
			match cue.action:
				"add": snapshot.createdOrder.append(cue.object)
				"finish": snapshot.finished = true
	return snapshot


func _check_replay_order() -> bool:
	var owners := {}
	var role_counts := {}
	var finished := false
	for cue in _cues:
		if cue.action == "point":
			continue
		if finished:
			return false
		match cue.action:
			"add":
				var path: String = cue.object
				var parent := path.get_base_dir()
				var role_count := int(role_counts.get(cue.role, 0)) + 1
				if owners.has(path) or (not parent.is_empty() and not owners.has(parent)) or role_count > MAX_ROLE_OBJECTS:
					return false
				owners[path] = cue.role
				role_counts[cue.role] = role_count
			"set":
				if owners.get(cue.object) != cue.role:
					return false
			"finish":
				if owners.is_empty():
					return false
				finished = true
	return finished


func _valid_path(value: Variant) -> bool:
	if not _has_text(value) or value.length() > 256:
		return false
	for part in value.split("/"):
		if part.is_empty() or part.validate_node_name() != part:
			return false
	return true


func _clear() -> void:
	schema_version = 0
	title = ""
	duration = 0.0
	viewport_size = Vector2(960, 540)
	roles.clear()
	objects.clear()
	_cues.clear()
	_cue_times.clear()
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


func _is_coordinate(value: Variant) -> bool:
	return _is_number(value) and absf(float(value)) <= MAX_COORDINATE


func _has_position(value: Dictionary) -> bool:
	return _is_coordinate(value.get("x")) and _is_coordinate(value.get("y"))


func _position(value: Dictionary) -> Vector2:
	return Vector2(float(value.x), float(value.y))


func _has_line_points(points: Variant) -> bool:
	if not points is Array or points.size() < 2 or points.size() > 64:
		return false
	for point: Variant in points:
		if not point is Array or point.size() != 2 or not _is_coordinate(point[0]) or not _is_coordinate(point[1]):
			return false
	return true
