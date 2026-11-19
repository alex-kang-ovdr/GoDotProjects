@tool
extends Node

const UPDATE_INTERVAL := 0.10
const MAX_COMMAND_LENGTH := 2 * 1024 * 1024
const MAX_PROMPT_BYTES := 65536

var _dock: EditorDock
var _panel: Control
var _submit: Callable
var _window: JavaScriptObject
var _callback: JavaScriptObject
var _previous := {}
var _elapsed := 0.0
var _bridged := false
var _modulate := Color.WHITE
var _focus_behavior := Control.FOCUS_BEHAVIOR_INHERITED
var _mouse_behavior := Control.MOUSE_BEHAVIOR_INHERITED


func _ready() -> void:
	set_process(_window != null)


func configure(dock: EditorDock, panel: Control, submit: Callable) -> void:
	if not OS.has_feature("web") or DisplayServer.get_name() == "headless":
		return
	_window = JavaScriptBridge.get_interface("window")
	if _window == null:
		return
	_dock = dock
	_panel = panel
	_submit = submit
	_callback = JavaScriptBridge.create_callback(_on_command)
	_window["__playforgeAgentDockCommand"] = _callback
	set_process(true)
	_publish()


func _exit_tree() -> void:
	_set_bridged(false)
	if _window != null and _callback != null:
		_window["__playforgeAgentDockCommand"] = null
		JavaScriptBridge.eval("""
			window.__playforgeAgentDockState = {visible:false};
			window.__playforgeAgentDockChanged?.(window.__playforgeAgentDockState);
		""", true)
	_callback = null
	_window = null


func _process(delta: float) -> void:
	_elapsed += delta
	if _elapsed >= UPDATE_INTERVAL:
		_elapsed = 0.0
		_publish()


func _set_bridged(bridged: bool) -> void:
	if _bridged == bridged:
		return
	_bridged = bridged
	if not is_instance_valid(_panel):
		return
	if bridged:
		_modulate = _panel.modulate
		_focus_behavior = _panel.focus_behavior_recursive
		_mouse_behavior = _panel.mouse_behavior_recursive
		var transparent := _modulate
		transparent.a = 0.0
		_panel.modulate = transparent
		_panel.focus_behavior_recursive = Control.FOCUS_BEHAVIOR_DISABLED
		_panel.mouse_behavior_recursive = Control.MOUSE_BEHAVIOR_DISABLED
		var focused := _panel.get_viewport().gui_get_focus_owner()
		if focused != null and _panel.is_ancestor_of(focused):
			focused.release_focus()
	else:
		_panel.modulate = _modulate
		_panel.focus_behavior_recursive = _focus_behavior
		_panel.mouse_behavior_recursive = _mouse_behavior


func _publish() -> void:
	if not is_instance_valid(_panel) or not is_instance_valid(_dock):
		return
	var rect := _normalized_rect()
	var has_host := _window["__playforgeAgentDockChanged"] != null
	var visible := has_host and rect.has_area()
	_set_bridged(visible and _window["__playforgeAgentDockReady"] == true)
	var snapshot := {"visible": visible}
	if visible:
		snapshot = _snapshot(rect)
	if snapshot == _previous:
		return
	_previous = snapshot
	JavaScriptBridge.eval("window.__playforgeAgentDockState = " + JSON.stringify(snapshot)
		+ "; window.__playforgeAgentDockChanged?.(window.__playforgeAgentDockState);", true)


func _normalized_rect() -> Rect2:
	if not _dock.is_visible_in_tree() or not _panel.is_visible_in_tree():
		return Rect2()
	var base := EditorInterface.get_base_control()
	var viewport := _panel.get_viewport()
	if viewport == null or viewport != base.get_viewport():
		return Rect2()
	var bounds := viewport.get_visible_rect()
	if not bounds.has_area():
		return Rect2()
	var area := _panel.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, _panel.size)
	var parent := _panel.get_parent()
	while parent != null and parent != viewport:
		if parent is Control and parent.clip_contents:
			var clipper := parent as Control
			area = area.intersection(clipper.get_global_transform_with_canvas() * Rect2(Vector2.ZERO, clipper.size))
		parent = parent.get_parent()
	area = area.intersection(bounds)
	return Rect2((area.position - bounds.position) / bounds.size, area.size / bounds.size)


func _snapshot(rect: Rect2) -> Dictionary:
	var transcript: Array = _panel.display_messages() if _panel.has_method(&"display_messages") else _panel.sessions.messages()
	var pending: String = _panel.get("_pending")
	if not pending.is_empty():
		transcript.append({"role": "user", "content": pending})
	var context = _panel.context
	var selection: Dictionary = context.request_context()
	selection["canStage"] = not context.get("_add_button").disabled
	var status: Label = _panel.get("_status")
	var proposal: Control = _panel.get("_proposal")
	return {
		"visible": true,
		"rect": {"x": rect.position.x, "y": rect.position.y, "width": rect.size.x, "height": rect.size.y},
		"messages": transcript,
		"partial": _panel.partial_response,
		"busy": not pending.is_empty(),
		"status": status.text if status.visible else "",
		"proposal": str(_panel.get("_proposal_text").text) if proposal.visible else "",
		"context": selection,
		"sessions": _panel.sessions.list(),
		"sessionId": _panel.sessions.active_id,
		"draft": str(_panel.get("_input").text),
		"replayAvailable": not get_parent().get("_latest").is_empty(),
	}


func _on_command(args: Array) -> void:
	if _window["__playforgeAgentDockReady"] != true or args.size() != 1 or not args[0] is String or args[0].length() > MAX_COMMAND_LENGTH:
		return
	if not is_instance_valid(_panel) or not _normalized_rect().has_area():
		return
	var json := JSON.new()
	if json.parse(args[0]) != OK or not json.data is Dictionary:
		return
	var command: Dictionary = json.data
	var type: Variant = command.get("type")
	if not type is String:
		return
	var busy: bool = not _panel.get("_pending").is_empty()
	var proposal: Control = _panel.get("_proposal")
	match type:
		"submit":
			var prompt: Variant = command.get("prompt")
			if not busy and prompt is String and not prompt.strip_edges().is_empty() and prompt.to_utf8_buffer().size() <= MAX_PROMPT_BYTES and _submit.is_valid():
				_submit.call(command)
		"cancel":
			if busy:
				_panel.stop_requested.emit()
		"approve", "decline":
			if busy and proposal.visible:
				_panel.proposal_decided.emit(type == "approve" and command.get("approved", true) == true)
		"new-session", "select-session", "rename-session", "delete-session":
			if not busy:
				_update_session(command)
		"attach-selection":
			if not busy:
				_panel.context.stage_selection()
		"remove-selection":
			if not busy:
				_remove_selection(command.get("path"))
		"replay":
			if not busy:
				_panel.replay_requested.emit()
	_publish()


func _update_session(command: Dictionary) -> void:
	var sessions = _panel.sessions
	var id: Variant = command.get("id")
	if command.type != "new-session" and (not id is String or not _has_session(id)):
		return
	var input: TextEdit = _panel.get("_input")
	var draft: Variant = command.get("draft")
	if draft is String and draft.to_utf8_buffer().size() <= MAX_PROMPT_BYTES:
		input.text = draft
	match command.type:
		"new-session":
			_panel.call("_create_thread")
		"select-session":
			_panel.call("_switch_thread", id)
		"rename-session":
			var title: Variant = command.get("title")
			if title is String and title.length() <= 160:
				_panel.get("_drafts")[sessions.active_id] = input.text
				sessions.rename(id, title)
				_panel.call("_refresh_thread")
		"delete-session":
			var previous_id: String = sessions.active_id
			_panel.get("_drafts")[previous_id] = input.text
			if sessions.remove(id):
				_panel.get("_drafts").erase(id)
				if previous_id != sessions.active_id:
					_panel.call("_clear_attachments")
			_panel.call("_refresh_thread")


func _has_session(id: String) -> bool:
	if id.length() != 24:
		return false
	for session: Dictionary in _panel.sessions.list():
		if session.id == id:
			return true
	return false


func _remove_selection(path: Variant) -> void:
	if not path is String or path.length() > 1024:
		return
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return
	var context = _panel.context
	context.request_context()
	for reference: WeakRef in context.get("_nodes"):
		var node := reference.get_ref() as Node
		if node != null and str(root.get_path_to(node)) == path:
			context.call("_remove_node", reference)
			return


