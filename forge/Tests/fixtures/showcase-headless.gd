extends SceneTree

const Timeline = preload("res://addons/playforge_showcase/showcase_timeline.gd")
const ShowcasePanel = preload("res://addons/playforge_showcase/showcase_panel.gd")
const MANIFEST := "res://.playforge-showcase.json"

func _initialize() -> void:
	_verify.call_deferred()


func _verify() -> void:
	var player = Timeline.new()
	if not player.load_manifest(MANIFEST):
		_fail("The native player could not load the prepared manifest: " + player.error_message)
		return
	var manifest: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST))
	var duration: float = manifest.duration
	var initial: Dictionary = player.evaluate(0.0)
	var end: Dictionary = player.evaluate(duration)

	if not initial.createdOrder.is_empty() or initial.finished or end.createdOrder.is_empty() or not end.finished:
		_fail("The timeline must begin empty and end with a reconstructed original scene.")
		return
	if not _verify_overlap(player, manifest, duration):
		return

	# A cue can only name original nodes beneath the managed replay scene.
	var invalid: Dictionary = manifest.duplicate(true)
	invalid.cues.push_front({"at": 0.0, "role": "level", "action": "add", "object": "../Outside"})
	var rejected = Timeline.new()
	if rejected.load_data(invalid):
		_fail("A cue was allowed to reference a node outside the replay scene.")
		return

	var panel = ShowcasePanel.new()
	panel.configure(player)
	root.add_child(panel)
	var progress := duration * 0.45
	panel.play_from_start()
	if not _verify_action_log(panel, manifest, progress):
		return
	panel.advance(progress)
	if not is_equal_approx(panel.current_time, progress):
		_fail("Playback must advance without waiting for editor input.")
		return
	var middle: Dictionary = player.evaluate(panel.current_time)
	panel.hide()
	for _frame in range(3):
		await process_frame
	if panel.current_time <= progress:
		_fail("The real Godot process loop should keep a hidden showcase moving.")
		return
	panel.advance(duration)
	if panel.is_playing() or not is_equal_approx(panel.current_time, duration):
		_fail("One large clock advance must apply the remaining cues and end the run.")
		return
	panel.play_from_start()
	if not is_zero_approx(panel.current_time):
		_fail("Restart must rewind on the same prepared timeline.")
		return
	panel.advance(progress)
	if var_to_str(player.evaluate(panel.current_time)) != var_to_str(middle):
		_fail("The same playback time must reproduce object state and role captions after restart.")
		return
	panel.advance(duration)
	if var_to_str(player.evaluate(panel.current_time)) != var_to_str(end):
		_fail("The completed state must match a deterministic seek directly to the end.")
		return
	panel.speed = 4.0
	panel.play_from_start()
	panel.advance(duration / 4.0)
	if panel.is_playing() or not is_equal_approx(panel.current_time, duration):
		_fail("Accelerated playback should apply all cues and finish on the same timeline.")
		return
	panel.free()
	print("PLAYFORGE_SHOWCASE_HEADLESS_OK")
	quit(0)


func _verify_overlap(player, manifest: Dictionary, duration: float) -> bool:
	var first_cue: Dictionary = {}
	var last_cue: Dictionary = {}
	for cue in manifest.cues:
		var role: String = cue.role
		if not first_cue.has(role):
			first_cue[role] = float(cue.at)
		last_cue[role] = float(cue.at)
	if first_cue.size() != 4:
		_fail("All four lanes must have their own authored actions.")
		return false
	var overlap_start := 0.0
	var overlap_end := duration
	for role in first_cue:
		overlap_start = maxf(overlap_start, first_cue[role])
		overlap_end = minf(overlap_end, last_cue[role])
	if overlap_start >= overlap_end:
		_fail("The four authored work intervals should overlap.")
		return false
	var frame: Dictionary = player.evaluate(overlap_start + (overlap_end - overlap_start) / 2.0)
	var locations: Array[Vector2] = []
	for role in frame.roles:
		var cue_state: Dictionary = frame.roles[role]
		if not cue_state.position is Vector2 or str(cue_state.text).is_empty():
			_fail("Each simultaneous role must have a cursor position and a caption.")
			return false
		if locations.has(cue_state.position):
			_fail("Role cursors unexpectedly share a single cursor position.")
			return false
		locations.append(cue_state.position)
	return locations.size() == 4


func _verify_action_log(panel: Control, manifest: Dictionary, cutoff: float) -> bool:
	if panel.get("active_role") != "":
		_fail("Replay should start in free camera mode.")
		return false
	panel.call("seek", cutoff)
	var expected := []
	var latest := {}
	for index in manifest.cues.size():
		var cue: Dictionary = manifest.cues[index]
		if float(cue.at) <= cutoff and cue.action != "label" and cue.get("text", "") is String and not str(cue.get("text", "")).strip_edges().is_empty():
			expected.append({"at": cue.at, "role": cue.role, "action": cue.action, "text": cue.text, "order": index})
	expected.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a.order < b.order if a.at == b.at else a.at < b.at
	)
	var all_entries: Array = panel.call("visible_log_entries")
	if all_entries.size() != expected.size() or all_entries.is_empty():
		_fail("The action log should contain exactly the caption-bearing actions due at this time.")
		return false
	for index in expected.size():
		var entry: Dictionary = all_entries[index]
		for field in expected[index]:
			if entry.get(field) != expected[index][field]:
				_fail("The action log changed authored text or chronology at entry %d." % index)
				return false
		latest[entry.role] = entry.text
	var roles: Dictionary = panel.call("role_states")
	var log_control := panel.find_child("ActionLog", true, false) as RichTextLabel
	if log_control == null:
		_fail("The native replay panel needs an action log control.")
		return false
	var rendered_text := log_control.get_parsed_text()
	for role: Dictionary in manifest.roles:
		if roles[role.id].text != latest.get(role.id) or not rendered_text.contains(role.label) or not rendered_text.contains(latest.get(role.id, "")):
			_fail("Role %s must show the identical cursor caption and log entry with a role label." % role.id)
			return false
	panel.call("set_active_role", "script")
	panel.call("set_log_filter", "level")
	var only_level := all_entries.filter(func(entry: Dictionary) -> bool: return entry.role == "level")
	if panel.get("active_role") != "script" or panel.call("visible_log_entries") != only_level:
		_fail("Selecting one role must leave the log independently filterable by a different role.")
		return false
	panel.call("set_active_role", "gui")
	if panel.call("visible_log_entries") != only_level:
		_fail("Following a different role must not change the action log filter.")
		return false
	panel.call("set_log_filter", "")
	if panel.call("visible_log_entries") != all_entries:
		_fail("Showing all log entries should restore the same chronological view.")
		return false
	panel.call("set_active_role", "")
	panel.call("seek", 0.0)
	return true


func _fail(message: String) -> void:
	push_error(message)
	quit(1)
