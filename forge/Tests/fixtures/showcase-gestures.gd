extends SceneTree

const Gestures := preload("showcase_gestures.gd")
var _gestures := Gestures.new()
var _base := Control.new()


func _initialize() -> void:
	_verify.call_deferred()


func _verify() -> void:
	root.add_child(_base)
	_base.position = Vector2(22, 14)
	_base.size = Vector2(860, 610)
	if await _verify_wires() and await _verify_drag():
		print("PLAYFORGE_SHOWCASE_GESTURES_OK")
		quit(0)


func _verify_wires() -> bool:
	var graph := GraphEdit.new()
	_base.add_child(graph)
	graph.position = Vector2(50, 28)
	graph.size = Vector2(620, 365)
	graph.scale = Vector2(1.15, 0.9)
	var source := _graph_node(graph, "Source", Vector2(126, 84), false)
	var target := _graph_node(graph, "Target", Vector2(405, 149), true)
	await process_frame
	await process_frame
	if _gestures.track_wire("wire", graph, source, 1, target, 0) or not _gestures.track_wire("wire", graph, source, 0, target, 0):
		return _fail("Only real, enabled graph ports can start a wire gesture.")
	var first := _gestures.sample("wire", _base)
	if not _matches_wire(first, source, target) or first.completed or not graph.get_connection_list().is_empty():
		return _fail("Wire preview must follow actual ports without connecting them: %s" % first)
	graph.zoom = 0.89
	graph.scroll_offset += Vector2(13, 19)
	await process_frame
	await process_frame
	var moved := _gestures.sample("wire", _base)
	if not _matches_wire(moved, source, target) or moved.eventId != first.eventId or moved.from == first.from:
		return _fail("Wire pin positions must refresh during graph zoom and scroll: %s" % moved)
	if graph.connect_node(source.name, 0, target.name, 0) != OK:
		return _fail("The fixture could not make a real GraphEdit connection.")
	var completed := _gestures.sample("wire", _base)
	if not completed.get("completed", false) or completed.eventId != first.eventId or not _gestures.sample("wire", _base).get("completed", false):
		return _fail("Only the real GraphEdit connection completes the gesture, with a visible terminal hold: %s" % completed)
	await create_timer(0.24).timeout
	if not _gestures.sample("wire", _base).is_empty() or _gestures.track_wire("wire", graph, source, 0, target, 0):
		return _fail("A completed gesture expires and an existing connection cannot start a new preview.")
	graph.disconnect_node(source.name, 0, target.name, 0)
	if not _gestures.track_wire("wire", graph, source, 0, target, 0):
		return _fail("An unconnected real pin can start a distinct gesture.")
	var pending := _gestures.sample("wire", _base)
	target.hide()
	if not _hidden_same_event(_gestures.sample("wire", _base), pending):
		return _fail("A hidden GraphNode must immediately cancel the route.")
	target.show()
	if not _gestures.sample("wire", _base).is_empty():
		return _fail("Showing a canceled GraphNode must not restore the route.")
	if not _gestures.track_wire("wire", graph, source, 0, target, 0):
		return _fail("The visible GraphNode should accept a new gesture.")
	pending = _gestures.sample("wire", _base)
	target.queue_free()
	if not _hidden_same_event(_gestures.sample("wire", _base), pending):
		return _fail("An endpoint scheduled for deletion must immediately cancel.")
	return true


func _verify_drag() -> bool:
	var clip := Control.new()
	_base.add_child(clip)
	clip.position = Vector2(38, 410)
	clip.size = Vector2(550, 140)
	clip.clip_contents = true
	var source := _control(clip, Vector2(14, 19))
	var target := _control(clip, Vector2(345, 20))
	var goal := Vector2(415, 31)
	var verify := func() -> bool: return target.position.is_equal_approx(goal)
	if not _gestures.track_drag("drag", source, target, verify):
		return _fail("Visible controls and a callable verifier must start a drag gesture.")
	var before := _gestures.sample("drag", _base)
	if before.get("phase") != "drag" or before.completed or not _matches_position(before.to, target.get_global_rect().get_center()):
		return _fail("The drag must preview the target center before the actual move: %s" % before)
	target.position = goal
	var moved := _gestures.sample("drag", _base)
	if not moved.get("completed", false) or moved.eventId != before.eventId or not _matches_position(moved.to, target.get_global_rect().get_center()) or moved.to == before.to:
		return _fail("The verifier and live target geometry must confirm the actual move: %s" % moved)
	if not _gestures.track_drag("clip", source, target, verify):
		return _fail("A second role must be able to have an independent gesture.")
	var still_visible := _gestures.sample("clip", _base)
	clip.size.x = 100
	if not _hidden_same_event(_gestures.sample("clip", _base), still_visible):
		return _fail("A real ancestor clipping boundary must cancel the drag.")
	var other_view := SubViewport.new()
	root.add_child(other_view)
	var other := _control(other_view, Vector2(10, 10))
	if _gestures.track_drag("cross-viewport", source, other, verify):
		return _fail("Controls in separate viewports cannot form a drag route.")
	return true


func _graph_node(graph: GraphEdit, node_name: String, offset: Vector2, input_port: bool) -> GraphNode:
	var node := GraphNode.new()
	node.name = node_name
	node.title = node_name
	node.position_offset = offset
	var row := Label.new()
	row.text = "Port"
	row.custom_minimum_size = Vector2(100, 26)
	node.add_child(row)
	graph.add_child(node)
	node.set_slot(0, input_port, 1, Color.WHITE, not input_port, 1, Color.WHITE)
	return node


func _control(parent: Node, position: Vector2) -> Control:
	var control := Control.new()
	parent.add_child(control)
	control.position = position
	control.size = Vector2(52, 30)
	return control


func _matches_wire(sample: Dictionary, source: GraphNode, target: GraphNode) -> bool:
	return sample.get("phase") == "wire" and \
		_matches_position(sample.from, source.get_global_transform_with_canvas() * source.get_output_port_position(0)) and \
		_matches_position(sample.to, target.get_global_transform_with_canvas() * target.get_input_port_position(0))


func _matches_position(sample: Dictionary, global_position: Vector2) -> bool:
	var expected := (global_position - _base.global_position) / _base.size
	return Vector2(sample.x, sample.y).distance_to(expected) < 0.0001


func _hidden_same_event(hidden: Dictionary, previous: Dictionary) -> bool:
	return hidden.get("phase") == "hidden" and hidden.eventId == previous.eventId and not hidden.completed and hidden.from == null and hidden.to == null


func _fail(message: String) -> bool:
	push_error(message)
	quit(1)
	return false
