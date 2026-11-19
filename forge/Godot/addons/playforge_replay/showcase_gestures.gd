@tool
extends RefCounted

const COMPLETION_MS := 200
var _routes := {}
var _next_event := 0


func track_wire(role: String, graph: GraphEdit, from_node: GraphNode, from_port: int, to_node: GraphNode, to_port: int) -> bool:
	if role.is_empty() or not is_instance_valid(graph) or not _visible_pair(from_node, to_node):
		return false
	if not _has_wire_ports(graph, from_node, from_port, to_node, to_port) or graph.is_node_connected(from_node.name, from_port, to_node.name, to_port):
		return false
	_next_event += 1
	_routes[role] = {"phase":"wire", "eventId":str(_next_event), "graph":weakref(graph),
		"from":weakref(from_node), "fromPort":from_port, "to":weakref(to_node), "toPort":to_port}
	return true


func track_drag(role: String, from: Control, to: Control, verifier: Callable) -> bool:
	if role.is_empty() or not _visible_pair(from, to) or not verifier.is_valid():
		return false
	_next_event += 1
	_routes[role] = {"phase":"drag", "eventId":str(_next_event), "from":weakref(from), "to":weakref(to), "verifier":verifier}
	return true


func cancel(role: String) -> void:
	_routes.erase(role)


func clear() -> void:
	_routes.clear()


func sample(role: String, base: Control) -> Dictionary:
	if not _routes.has(role):
		return {}
	var route: Dictionary = _routes[role]
	var now := Time.get_ticks_msec()
	if route.has("completeUntil") and now >= int(route.completeUntil):
		cancel(role)
		return {}
	var from := route.from.get_ref() as Control
	var to := route.to.get_ref() as Control
	if not _visible(base) or base.size.x <= 0.0 or base.size.y <= 0.0 or not _visible_pair(from, to) or from.get_viewport() != base.get_viewport():
		return _hidden(role, route.eventId)
	var start: Vector2
	var finish: Vector2
	var completed := false
	if route.phase == "wire":
		var graph := route.graph.get_ref() as GraphEdit
		var from_node := from as GraphNode
		var to_node := to as GraphNode
		var from_port: int = route.fromPort
		var to_port: int = route.toPort
		if not _visible(graph) or not _has_wire_ports(graph, from_node, from_port, to_node, to_port):
			return _hidden(role, route.eventId)
		# Match GraphEdit's own pin geometry including the current zoom and scroll.
		var transform := graph.get_global_transform_with_canvas()
		start = transform * (from.position + from_node.get_output_port_position(from_port) * graph.zoom)
		finish = transform * (to.position + to_node.get_input_port_position(to_port) * graph.zoom)
		if not _contains(graph, start) or not _contains(graph, finish):
			return _hidden(role, route.eventId)
		completed = graph.is_node_connected(from.name, from_port, to.name, to_port)
	else:
		var verifier: Callable = route.verifier
		if not verifier.is_valid() or from.size.x <= 0.0 or from.size.y <= 0.0 or to.size.x <= 0.0 or to.size.y <= 0.0:
			return _hidden(role, route.eventId)
		start = from.get_global_transform_with_canvas() * (from.size * 0.5)
		finish = to.get_global_transform_with_canvas() * (to.size * 0.5)
	if not _visible_point(base, from, start) or not _visible_point(base, to, finish):
		return _hidden(role, route.eventId)
	if route.phase == "drag":
		completed = route.verifier.call() == true
	if completed and not route.has("completeUntil"):
		route.completeUntil = now + COMPLETION_MS
	elif not completed and route.has("completeUntil"):
		cancel(role)
		return {}
	var inverse := base.get_global_transform_with_canvas().affine_inverse()
	var start_normalized := (inverse * start) / base.size
	var finish_normalized := (inverse * finish) / base.size
	return {"phase":route.phase, "from":{"x":start_normalized.x,"y":start_normalized.y},
		"to":{"x":finish_normalized.x,"y":finish_normalized.y}, "completed":completed, "eventId":route.eventId}


func _has_wire_ports(graph: GraphEdit, from: GraphNode, from_port: int, to: GraphNode, to_port: int) -> bool:
	return from.get_parent() == graph and to.get_parent() == graph and from_port >= 0 and \
		from_port < from.get_output_port_count() and to_port >= 0 and to_port < to.get_input_port_count()


func _visible_pair(from: Control, to: Control) -> bool:
	return _visible(from) and _visible(to) and from.get_viewport() == to.get_viewport()


func _visible(control: Control) -> bool:
	return is_instance_valid(control) and not control.is_queued_for_deletion() and control.is_inside_tree() and control.is_visible_in_tree()


func _contains(control: Control, point: Vector2) -> bool:
	return Rect2(Vector2.ZERO, control.size).has_point(control.get_global_transform_with_canvas().affine_inverse() * point)


func _visible_point(base: Control, control: Control, point: Vector2) -> bool:
	if not _contains(base, point):
		return false
	var parent := control.get_parent()
	while parent != null and parent != base:
		if parent is Control and parent.clip_contents and not _contains(parent, point):
			return false
		parent = parent.get_parent()
	return true


func _hidden(role: String, event_id: String) -> Dictionary:
	cancel(role)
	return {"phase":"hidden", "from":null, "to":null, "completed":false, "eventId":event_id}
