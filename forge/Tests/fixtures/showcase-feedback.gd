@tool
extends EditorPlugin

const Feedback := preload("showcase_feedback.gd")
const Gestures := preload("showcase_gestures.gd")
const Importer := preload("showcase_import.gd")
const Commands := preload("scene_commands.gd")
const IMPORT := {"action":"import", "order":2}
const EDIT := {"action":"set", "order":0}

var _feedback := Feedback.new()


func _enter_tree() -> void:
	_verify.call_deferred()


func _verify() -> void:
	var tree := get_tree()
	while EditorInterface.get_resource_filesystem().is_scanning() or EditorInterface.get_edited_scene_root() == null:
		await tree.process_frame
	_feedback.configure()
	var authored := EditorInterface.get_edited_scene_root()
	if _verify_settings() and _verify_scene(authored) and _verify_gesture() and await _verify_import(authored):
		print("PLAYFORGE_SHOWCASE_FEEDBACK_OK")
		tree.quit(0)


func _verify_settings() -> bool:
	var settings := EditorInterface.get_editor_settings()
	var previous := {}
	for key in ["duration_ms", "strength", "speed", "reduce_motion", "events"]:
		previous[key] = settings.get_setting(Feedback.PREFIX + key)
	var defaults := _feedback.style("search", "default")
	if defaults.durationMs != 200.0 or not is_equal_approx(defaults.strength, 0.65) or defaults.speed != 1.0 or defaults.reduceMotion or not defaults.pulse:
		return _fail("The isolated editor must expose the default effect settings: %s" % defaults)
	settings.set_setting(Feedback.PREFIX + "duration_ms", 125)
	settings.set_setting(Feedback.PREFIX + "strength", 0.3)
	settings.set_setting(Feedback.PREFIX + "speed", 2.0)
	settings.set_setting(Feedback.PREFIX + "reduce_motion", true)
	settings.set_setting(Feedback.PREFIX + "events", {"wire":{"icon":"target", "pulse":true, "durationMs":1700, "speed":0.1, "strength":2.0}})
	settings.settings_changed.emit()
	var changed := _feedback.style("execute", "settings")
	var wire := _feedback.style("wire", "wire-example", {"completed":false})
	for key: String in previous:
		settings.set_setting(Feedback.PREFIX + key, previous[key])
	settings.settings_changed.emit()
	if changed.durationMs != 125.0 or not is_equal_approx(changed.strength, 0.3) or changed.speed != 2.0 or not changed.reduceMotion or not changed.squash:
		return _fail("Global effect settings must reload at runtime: %s" % changed)
	if wire.icon != "target" or not wire.pulse or not wire.wire or wire.durationMs != 1000.0 or wire.speed != 0.25 or wire.strength != 1.0 or wire.completed or wire.eventId.ends_with("/done"):
		return _fail("Per-event settings must clamp presentation without fabricating completion: %s" % wire)
	if _feedback.style("search", "default") != defaults:
		return _fail("Restoring editor settings must also restore the effect and reduced motion defaults.")
	return true


func _verify_scene(authored: Node) -> bool:
	var label := authored.get_node("Title") as Label
	var playback := Commands.new()
	playback.configure([
		{"action":"set", "object":"Title", "role":"gui", "property":"text", "value":"After"},
		{"action":"revert", "object":"Title", "role":"gui"},
	])
	if not playback.claim(authored) or not playback.apply_snapshot({"revision":1}) or label.text != "After":
		return _fail("The fixture must apply a real scene property edit.")
	var actual: Dictionary = playback.role_results.gui
	var change := _feedback.describe("gui", EDIT, actual, {}, true, true, false, {})
	var stale := _feedback.describe("gui", {"action":"set", "order":1}, actual, {}, true, true, false, {})
	var target := _feedback.describe("gui", EDIT, actual, {}, true, true, true, {})
	var hidden := _feedback.describe("gui", EDIT, {}, {}, false, true, true, {})
	var search := _feedback.describe("gui", EDIT, {}, {}, false, false, true, {})
	if change.phase != "change" or change.before != "Before" or change.after != label.text or stale.phase != "target" or stale.has("before"):
		return _fail("Only the matching verified edit may display the actual before and after values: %s" % change)
	if target.phase != "target" or hidden.phase != "hidden" or search.phase != "search" or hidden.pulse:
		return _fail("Preview, hidden tracked controls and unresolved searches must remain distinct.")
	if not playback.apply_snapshot({"revision":2}) or label.text != "Before":
		return _fail("The fixture must execute a real replay revert.")
	var reverted := _feedback.describe("gui", {"action":"revert", "order":1}, playback.role_results.gui, {}, true, true, false, {})
	_feedback.history(false)
	var redo := _feedback.describe("gui", EDIT, actual, {}, true, true, false, {})
	_feedback.history(true)
	var undo := _feedback.describe("gui", EDIT, actual, {}, true, true, false, {})
	_feedback.restart()
	var restarted := _feedback.describe("gui", EDIT, actual, {}, true, true, false, {})
	if reverted.phase != "undo" or redo.phase != "redo" or undo.phase != "undo" or restarted.phase != "change" or restarted.eventId == change.eventId:
		return _fail("Verified revert, history direction and a fresh playback generation must emit distinct states.")
	return true


func _verify_gesture() -> bool:
	var gestures := Gestures.new()
	var base := Control.new()
	base.size = Vector2(380, 260)
	EditorInterface.get_base_control().add_child(base)
	var source := Control.new()
	var target := Control.new()
	for control in [source, target]:
		control.size = Vector2(20, 20)
		base.add_child(control)
	source.position = Vector2(10, 20)
	target.position = Vector2(110, 70)
	var destination := Vector2(150, 100)
	var verifier := func() -> bool: return target.position == destination
	if not gestures.track_drag("gui", source, target, verifier):
		base.free()
		return _fail("The fixture must track an actual Control drag.")
	var pending := _feedback.describe("gui", EDIT, {}, {}, false, true, false, gestures.sample("gui", base))
	target.position = destination
	var done := _feedback.describe("gui", EDIT, {}, {}, false, true, false, gestures.sample("gui", base))
	target.hide()
	var cancelled := _feedback.describe("gui", EDIT, {}, {}, false, true, false, gestures.sample("gui", base))
	base.free()
	if pending.phase != "drag" or pending.completed or done.phase != "drag" or not done.completed or pending.to == done.to or not done.eventId.ends_with("/done"):
		return _fail("Gesture feedback must forward real routes and the verifier's completion: %s · %s" % [pending, done])
	if cancelled.phase != "hidden" or cancelled.completed or cancelled.from != null or cancelled.to != null:
		return _fail("A hidden endpoint must remove the route even during its completed hold: %s" % cancelled)
	return true


func _verify_import(authored: Node) -> bool:
	var importer := Importer.new()
	add_child(importer)
	var updates: Array[Dictionary] = []
	importer.changed.connect(func() -> void:
		updates.append(_feedback.describe("assets", IMPORT, {}, importer.receipt, false, true, false, {}))
	)
	importer.request(["Assets/missing.svg"], [], true)
	if not await _wait_for_import(importer) or updates.back().phase != "failure" or not str(updates.back().reason).contains("missing.svg") or updates.back().has("progress"):
		return _fail("An actual missing source must produce failure without an invented percentage: %s" % [updates])
	updates.clear()
	importer.begin_run()
	importer.request(["Assets/first.svg", "Assets/second.svg"], [], true, true)
	if not await _wait_for_import(importer) or importer.receipt.state != "done" or not ResourceLoader.exists("res://Assets/second.svg", "Texture2D"):
		return _fail("Both synthetic textures must really finish importing: %s" % importer.receipt)
	if updates.map(func(effect: Dictionary) -> String: return effect.phase) != ["execute", "progress", "progress", "progress", "success"]:
		return _fail("Importer receipts must produce execute, verified progress, then success: %s" % [updates])
	if updates[0].has("progress") or updates[1].progress != 0.0 or updates[2].progress != 0.5 or updates[3].progress != 1.0 or updates[4].progress != 1.0:
		return _fail("Progress must come from the number of textures Godot actually verified: %s" % [updates])
	var no_fraction := _feedback.describe("assets", IMPORT, {}, {"state":"importing"}, true, true, false, {})
	var manager := get_undo_redo()
	var history := manager.get_history_undo_redo(manager.get_object_history_id(authored))
	history.undo()
	var removed: bool = not FileAccess.file_exists("res://Assets/first.svg") and updates.back().phase == "undo"
	history.redo()
	if no_fraction.phase != "progress" or no_fraction.has("progress") or not removed or not FileAccess.file_exists("res://Assets/first.svg") or updates.back().phase != "redo":
		return _fail("Unknown fractions stay indeterminate and real asset Undo/Redo emits the matching phases.")
	return true


func _wait_for_import(importer: Node) -> bool:
	for frame in range(600):
		if importer.receipt.get("state") in ["done", "error"]:
			return true
		await get_tree().process_frame
	return false


func _fail(message: String) -> bool:
	push_error(message)
	get_tree().quit(1)
	return false
