@tool
extends VBoxContainer

signal playback_changed
signal store_requested

const PreviewCanvas := preload("showcase_canvas.gd")
const SPEEDS := [0.5, 1.0, 2.0, 4.0]

var current_time := 0.0
var speed := 1.0
var active_role := ""
var log_filter := ""
var transition_kind := ""
var transition_start := 0.0

var _timeline: RefCounted
var _prepare_replay: Callable
var _limit_time: Callable
var _deferred_seek := {}
var _playing := false
var _started := false
var _snapshot: Dictionary = {}
var _preview: Control
var _preview_body: HBoxContainer
var _slider: HSlider
var _time_label: Label
var _play_button: Button
var _store_button: Button
var _captions: Dictionary = {}
var _status: Label
var _role_ids := PackedStringArray([""])
var _roles: Dictionary = {}
var _active_selector: OptionButton
var _log_selector: OptionButton
var _log: RichTextLabel
var _result_grid: GridContainer
var _result_target: Label
var _result_value: Label
var _log_entries: Array[Dictionary] = []
var _logged_cue_count := 0
var _snapshot_cue_count := -1
var _seeking_slider := false
var _slider_start := 0.0


func configure(timeline: RefCounted, prepare_replay := Callable(), limit_time := Callable()) -> void:
	_timeline = timeline
	_prepare_replay = prepare_replay
	_limit_time = limit_time
	for role: Dictionary in timeline.roles:
		_role_ids.append(role.id)
		_roles[role.id] = role


func _ready() -> void:
	set_process(false)
	if _timeline == null or _timeline.duration <= 0.0:
		var error := Label.new()
		error.text = _timeline.error_message if _timeline != null else "The template showcase is unavailable."
		add_child(error)
		return
	add_theme_constant_override("separation", 8)
	_build_toolbar()
	_build_action_log()
	if _timeline.schema_version == 1:
		_build_preview()
	_status = Label.new()
	_status.hide()
	_status.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	add_child(_status)
	_refresh()


func is_playing() -> bool:
	return _playing


func has_active_run() -> bool:
	return _started and current_time < _timeline.duration


func has_started() -> bool:
	return _started


func current_snapshot() -> Dictionary:
	return _snapshot


func role_states() -> Dictionary:
	return _snapshot.get("roles", {})


func set_active_role(id: String) -> void:
	var index := _role_ids.find(id)
	if index == -1 or active_role == id:
		return
	active_role = id
	if is_instance_valid(_active_selector):
		_active_selector.select(index)
		playback_changed.emit()


func set_log_filter(id: String) -> void:
	var index := _role_ids.find(id)
	if index == -1 or log_filter == id:
		return
	log_filter = id
	if is_instance_valid(_log_selector):
		_log_selector.select(index)
		_clear_log()
		_refresh_log(_timeline.cue_count_at(current_time))
		playback_changed.emit()


func visible_log_entries() -> Array[Dictionary]:
	return _log_entries.duplicate(true)


func visible_log_count() -> int:
	return _log_entries.size()


func play_from_start() -> void:
	if _timeline == null or _timeline.duration <= 0.0:
		return
	if _prepare_replay.is_valid() and not _prepare_replay.call():
		return
	var previous := current_time
	_deferred_seek.clear()
	current_time = 0.0
	_set_playing(true)
	_refresh_transition("restart", previous)


func seek(seconds: float) -> void:
	_seek(seconds, "seek")


func apply_editor_history_time(seconds: float) -> void:
	_set_playing(false)
	_started = true
	_seek(seconds, "history")


func _seek(seconds: float, kind: String) -> void:
	if _timeline == null or _timeline.duration <= 0.0 or not is_finite(seconds):
		return
	if not _started:
		if _prepare_replay.is_valid() and not _prepare_replay.call():
			_slider.set_value_no_signal(current_time)
			return
		_started = true
	var previous := current_time
	var requested := clampf(seconds, 0.0, _timeline.duration)
	current_time = _limit_time.call(requested) if _limit_time.is_valid() else requested
	if kind != "clock":
		_deferred_seek = {"time": requested, "kind": kind} if current_time < requested else {}
	if current_time >= _timeline.duration:
		_set_playing(false)
	_refresh_transition(kind, previous)


func resume_deferred_seek() -> void:
	if not _deferred_seek.is_empty():
		_seek(_deferred_seek.time, _deferred_seek.kind)


func _refresh_transition(kind: String, previous: float) -> void:
	transition_kind = kind
	transition_start = previous
	_refresh()
	transition_kind = ""


func advance(delta: float) -> void:
	if _playing and delta >= 0.0:
		_seek(current_time + delta * speed, "clock")


func _process(delta: float) -> void:
	advance(delta)


func _start_slider_seek() -> void:
	_slider_start = current_time
	_seeking_slider = true
	_set_playing(false)


func _change_slider_seek(seconds: float) -> void:
	_seek(seconds, "drag" if _seeking_slider else "seek")


func _finish_slider_seek(_changed: bool) -> void:
	_seeking_slider = false
	_refresh_transition("seek", _slider_start)


func show_replay_status(message: String) -> void:
	_status.text = message
	_status.tooltip_text = message
	_status.visible = not message.is_empty()


func interrupt_replay(message: String) -> void:
	_set_playing(false)
	_started = false
	_play_button.text = "재생"
	show_replay_status(message)


func _build_toolbar() -> void:
	var toolbar := HBoxContainer.new()
	toolbar.add_theme_constant_override("separation", 8)
	add_child(toolbar)
	var title := Label.new()
	title.text = _timeline.title
	title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.tooltip_text = "미리 구성한 네 역할의 작업을 같은 타임라인에서 재생합니다."
	toolbar.add_child(title)
	_play_button = Button.new()
	_play_button.text = "재생"
	_play_button.pressed.connect(_toggle_playback)
	toolbar.add_child(_play_button)
	var restart := Button.new()
	restart.text = "처음부터"
	restart.pressed.connect(play_from_start)
	toolbar.add_child(restart)
	var rates := OptionButton.new()
	rates.tooltip_text = "재생 속도"
	for rate: float in SPEEDS:
		rates.add_item("%s×" % str(rate))
	rates.select(1)
	rates.item_selected.connect(_change_speed)
	toolbar.add_child(rates)
	_slider = HSlider.new()
	_slider.max_value = _timeline.duration
	_slider.step = 0.01
	_slider.custom_minimum_size.x = 110.0
	_slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_slider.tooltip_text = "재생 위치"
	_slider.drag_started.connect(_start_slider_seek)
	_slider.value_changed.connect(_change_slider_seek)
	_slider.drag_ended.connect(_finish_slider_seek)
	toolbar.add_child(_slider)
	_time_label = Label.new()
	_time_label.custom_minimum_size.x = 102.0
	_time_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	toolbar.add_child(_time_label)
	if _timeline.schema_version == 1:
		var show_preview := Button.new()
		show_preview.text = "미리보기"
		show_preview.toggle_mode = true
		show_preview.toggled.connect(_set_preview_visible)
		toolbar.add_child(show_preview)


func _build_action_log() -> void:
	var controls := HBoxContainer.new()
	add_child(controls)
	_log_selector = _add_role_selector(controls, "작업 로그", "모든 역할", "LogFilter")
	_log_selector.select(_role_ids.find(log_filter))
	_log_selector.item_selected.connect(func(index: int) -> void: set_log_filter(_role_ids[index]))
	_active_selector = _add_role_selector(controls, "화면 추적", "자유 보기", "ActiveRole")
	_active_selector.select(_role_ids.find(active_role))
	_active_selector.item_selected.connect(func(index: int) -> void: set_active_role(_role_ids[index]))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	controls.add_child(spacer)
	_store_button = Button.new()
	_store_button.name = "OpenAssetStore"
	_store_button.text = "에셋 스토어"
	_store_button.pressed.connect(func(): store_requested.emit())
	controls.add_child(_store_button)
	_log = RichTextLabel.new()
	_log.name = "ActionLog"
	_log.custom_minimum_size.y = 84
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_log.scroll_following = true
	_log.selection_enabled = true
	add_child(_log)
	_result_grid = GridContainer.new()
	_result_grid.name = "ActionResult"
	_result_grid.columns = 2
	_result_grid.hide()
	add_child(_result_grid)
	for title in ["작업 대상", "실행 결과"]:
		var heading := Label.new()
		heading.text = title
		_result_grid.add_child(heading)
	_result_target = _result_cell("ResultTarget")
	_result_value = _result_cell("ResultValue")


func _result_cell(cell_name: String) -> Label:
	var cell := Label.new()
	cell.name = cell_name
	cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cell.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_result_grid.add_child(cell)
	return cell


func show_action_result(target: String, value: String) -> void:
	if not is_instance_valid(_result_grid):
		return
	if value != _result_value.text or target != _result_target.text:
		_result_target.text = target
		_result_target.tooltip_text = target
		_result_value.text = value
		_result_value.tooltip_text = value
	_result_grid.visible = not value.is_empty()


func active_role_control() -> Control:
	return _active_selector


func store_button() -> Control:
	return _store_button


func _add_role_selector(controls: HBoxContainer, caption: String, first: String, control_name: String) -> OptionButton:
	var label := Label.new()
	label.text = caption
	controls.add_child(label)
	var selector := OptionButton.new()
	selector.name = control_name
	selector.tooltip_text = caption
	selector.add_item(first)
	for role: Dictionary in _timeline.roles:
		selector.add_item(role.label)
	controls.add_child(selector)
	return selector


func _clear_log() -> void:
	_log.clear()
	_log_entries.clear()
	_logged_cue_count = 0


func _refresh_log(due_count: int) -> void:
	if due_count < _logged_cue_count:
		_clear_log()
	for index in range(_logged_cue_count, due_count):
		var cue: Dictionary = _timeline.cue_at(index)
		if (not log_filter.is_empty() and cue.role != log_filter) or not _timeline.has_caption(cue):
			continue
		var role: Dictionary = _roles[cue.role]
		if not _log_entries.is_empty():
			_log.newline()
		_log_entries.append(cue)
		_log.push_color(Color.from_string(str(role.get("color", "")), _log.get_theme_color("default_color")))
		_log.add_text("%.2f초  %s" % [cue.at, role.label])
		_log.pop()
		_log.add_text("  " + cue.text)
	_logged_cue_count = due_count


func _build_preview() -> void:
	_preview_body = HBoxContainer.new()
	_preview_body.add_theme_constant_override("separation", 10)
	_preview_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_preview_body.hide()
	add_child(_preview_body)
	_preview = PreviewCanvas.new()
	_preview.configure(_timeline)
	_preview.custom_minimum_size = Vector2(200.0, 242.0)
	_preview.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_preview.resized.connect(_preview.queue_redraw)
	_preview_body.add_child(_preview)
	var legend := VBoxContainer.new()
	legend.custom_minimum_size.x = 252.0
	legend.add_theme_constant_override("separation", 6)
	_preview_body.add_child(legend)
	for role: Dictionary in _timeline.roles:
		var heading := Label.new()
		heading.text = "%s · %s" % [role.label, role.description]
		heading.tooltip_text = role.description
		heading.mouse_filter = Control.MOUSE_FILTER_PASS
		heading.add_theme_color_override("font_color", Color.from_string(str(role.get("color", "")), Color("90d5ff")))
		heading.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		legend.add_child(heading)
		var caption := Label.new()
		caption.custom_minimum_size.y = 24.0
		caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		caption.mouse_filter = Control.MOUSE_FILTER_PASS
		legend.add_child(caption)
		_captions[role.id] = caption


func _set_preview_visible(show_preview: bool) -> void:
	_preview_body.visible = show_preview
	_refresh()


func _toggle_playback() -> void:
	if not _playing and (not _started or current_time >= _timeline.duration):
		play_from_start()
		return
	_set_playing(not _playing)
	_refresh()


func _change_speed(index: int) -> void:
	speed = SPEEDS[index]
	playback_changed.emit()


func _set_playing(playing: bool) -> void:
	_playing = playing
	_started = _started or playing
	set_process(playing)


func _refresh() -> void:
	var due_count: int = _timeline.cue_count_at(current_time)
	if due_count != _snapshot_cue_count:
		_snapshot = _timeline.evaluate(current_time)
		_snapshot_cue_count = due_count
	else:
		_snapshot.time = current_time
	_refresh_log(due_count)
	if is_instance_valid(_preview) and _preview_body.visible:
		_preview.present(_snapshot)
		for role_id: String in _captions:
			var caption: Label = _captions[role_id]
			var text: String = _snapshot.roles[role_id].text
			if caption.text != text:
				caption.text = text
				caption.tooltip_text = text
	_slider.set_value_no_signal(current_time)
	_time_label.text = "%.1f / %.1f초" % [current_time, _timeline.duration]
	_play_button.text = "일시정지" if _playing else "재생"
	playback_changed.emit()
