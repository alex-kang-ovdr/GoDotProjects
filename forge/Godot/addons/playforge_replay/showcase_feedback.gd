@tool
extends RefCounted

const PREFIX := "playforge/showcase/"
const EVENTS := {
	"search": {"icon": "search", "pulse": true}, "target": {"icon": "target", "pulse": true},
	"execute": {"icon": "click", "squash": true}, "change": {"icon": "change", "pulse": true},
	"progress": {"icon": "import", "pulse": true}, "success": {"icon": "success", "pulse": true},
	"failure": {"icon": "error", "shake": true}, "hidden": {"icon": "wait"},
	"drag": {"icon": "drag", "drag": true, "squash": true}, "wire": {"icon": "wire", "wire": true, "pulse": true},
	"undo": {"icon": "undo", "pulse": true}, "redo": {"icon": "redo", "pulse": true},
}
var _settings: EditorSettings
var _style := {}
var _generation := 0
var _scene_routes := {}
var _history := ""
var _history_until := 0


func configure() -> void:
	_settings = EditorInterface.get_editor_settings()
	_register("reduce_motion", false)
	_register("duration_ms", 200, "50,1000,1")
	_register("strength", 0.65, "0,1,0.05")
	_register("speed", 1.0, "0.25,4,0.05")
	_register("events", EVENTS)
	_reload()
	_settings.settings_changed.connect(_reload)


func _register(key: String, initial: Variant, limits := "") -> void:
	var setting := PREFIX + key
	if not _settings.has_setting(setting):
		_settings.set_setting(setting, initial)
	_settings.set_initial_value(setting, initial, false)
	var info := {"name": setting, "type": typeof(initial)}
	if not limits.is_empty():
		info.hint = PROPERTY_HINT_RANGE
		info.hint_string = limits
	_settings.add_property_info(info)


func _reload() -> void:
	_style = {"durationMs": _settings.get_setting(PREFIX + "duration_ms"),
		"strength": _settings.get_setting(PREFIX + "strength"), "speed": _settings.get_setting(PREFIX + "speed"),
		"reduceMotion": _settings.get_setting(PREFIX + "reduce_motion"), "events": _settings.get_setting(PREFIX + "events")}


func restart() -> void:
	_generation += 1
	_history = ""
	_scene_routes.clear()


func history(backwards: bool) -> void:
	_generation += 1
	_history = "undo" if backwards else "redo"
	_history_until = Time.get_ticks_msec() + 650


func describe(role: String, cue: Dictionary, applied: Dictionary, receipt: Dictionary, resolved: bool, tracked: bool, preview: bool, gesture: Dictionary) -> Dictionary:
	var phase := "search"
	var detail := {}
	var action: String = cue.get("action", "")
	if not gesture.is_empty():
		phase = gesture.phase
		detail = gesture.duplicate()
	elif action == "import" and not receipt.is_empty():
		match receipt.get("state"):
			"queued": phase = "execute"
			"importing":
				phase = "progress"
				if receipt.has("progress"):
					detail.progress = receipt.progress
			"done":
				phase = "success"
				detail.progress = 1.0
			"error":
				phase = "failure"
				detail.reason = receipt.message
			"undone": phase = "undo"
			"redone": phase = "redo"
	elif tracked and not resolved:
		phase = "hidden"
	elif preview:
		phase = "target" if resolved else "search"
	elif not _history.is_empty() and Time.get_ticks_msec() < _history_until:
		phase = _history
	elif not applied.is_empty() and applied.get("order", -2) == cue.get("order", -1):
		phase = applied.phase
		detail = applied.duplicate()
	elif resolved:
		phase = "target"
	return style(phase, "%s/%s/%s/%s" % [_generation, role, cue.get("order", -1), detail.get("eventId", "")], detail)


func style(phase: String, id: String, detail := {}) -> Dictionary:
	var result: Dictionary = EVENTS.get(phase, EVENTS.search).duplicate()
	var settings: Variant = _style.get("events", {})
	var options: Variant = settings.get(phase, {}) if settings is Dictionary else {}
	if not options is Dictionary:
		options = {}
	for key in ["pulse", "squash", "shake", "drag", "wire"]:
		result[key] = options.get(key, result.get(key, false)) == true
	if options.get("icon") is String:
		result.icon = options.icon
	result.durationMs = clampf(float(options.get("durationMs", _style.durationMs)), 50, 1000)
	result.speed = clampf(float(options.get("speed", _style.speed)), 0.25, 4)
	result.strength = clampf(float(options.get("strength", _style.strength)), 0, 1)
	result.reduceMotion = _style.reduceMotion
	result.phase = phase
	result.eventId = id + "/" + phase + ("/done" if detail.get("completed") == true else "")
	for key in ["before", "after"]:
		if detail.has(key):
			result[key] = value_text(detail[key])
	for key in ["progress", "reason", "from", "to", "completed", "replayPath"]:
		if detail.has(key):
			result[key] = detail[key]
	return result


func scene_drag(cue: Dictionary, applied: Dictionary, root: Node, base: Control, screen: String) -> Dictionary:
	var id: String = "%s/%s" % [cue.role, cue.order]
	var hidden := {"phase": "hidden", "eventId": id}
	if _scene_routes.get(id) == "cancelled" or not is_instance_valid(root):
		return hidden
	var node := root.get_node_or_null(NodePath(cue.object)) as Node2D
	var view := EditorInterface.get_editor_viewport_2d()
	if screen not in ["", "2D"] or node == null or node.get_viewport() != view or not node.is_visible_in_tree():
		if _scene_routes.has(id):
			_scene_routes[id] = "cancelled"
		return hidden
	var parent := node.get_parent() as CanvasItem
	if parent == null or not applied.get("before") is Vector2 or node.position != applied.get("after"):
		return hidden
	var transform := base.get_viewport().get_screen_transform().affine_inverse() * view.get_screen_transform() * parent.get_global_transform_with_canvas()
	var bounds := base.get_global_rect()
	var clip := EditorInterface.get_editor_main_screen().get_global_rect().intersection(bounds)
	var origin: Vector2 = transform * Vector2(applied.before)
	var destination: Vector2 = transform * node.position
	if not clip.has_point(origin) or not clip.has_point(destination) or not bounds.has_area():
		if _scene_routes.has(id):
			_scene_routes[id] = "cancelled"
		return hidden
	_scene_routes[id] = "visible"
	origin = (origin - bounds.position) / bounds.size
	destination = (destination - bounds.position) / bounds.size
	return {"phase": "drag", "eventId": id, "completed": true, "replayPath": true,
		"from": {"x": origin.x, "y": origin.y}, "to": {"x": destination.x, "y": destination.y}}


static func value_text(value: Variant) -> String:
	if value is Resource:
		return value.resource_path.get_file() if not value.resource_path.is_empty() else value.get_class()
	if value is PackedVector2Array or value is Array:
		return "%d개" % value.size()
	if value is Color:
		return "#" + value.to_html()
	return str(value).left(70)
