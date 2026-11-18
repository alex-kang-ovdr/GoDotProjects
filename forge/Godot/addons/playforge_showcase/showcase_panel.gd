@tool
extends VBoxContainer

signal playback_changed

const PreviewCanvas := preload("showcase_canvas.gd")
const SPEEDS := [0.5, 1.0, 2.0, 4.0]

var current_time := 0.0
var speed := 1.0

var _timeline: RefCounted
var _playing := false
var _started := false
var _snapshot: Dictionary = {}
var _preview: Control
var _preview_body: HBoxContainer
var _slider: HSlider
var _time_label: Label
var _play_button: Button
var _captions: Dictionary = {}


func configure(timeline: RefCounted) -> void:
	_timeline = timeline


func _ready() -> void:
	set_process(false)
	if _timeline == null or _timeline.duration <= 0.0:
		var error := Label.new()
		error.text = _timeline.error_message if _timeline != null else "The template showcase is unavailable."
		add_child(error)
		return
	add_theme_constant_override("separation", 8)
	_build_toolbar()
	_build_preview()
	_refresh()


func is_playing() -> bool:
	return _playing


func has_active_run() -> bool:
	return _started and current_time < _timeline.duration


func role_states() -> Dictionary:
	return _snapshot.get("roles", {})


func play_from_start() -> void:
	if _timeline == null or _timeline.duration <= 0.0:
		return
	current_time = 0.0
	_set_playing(true)
	_refresh()


func seek(seconds: float) -> void:
	if _timeline == null or _timeline.duration <= 0.0 or not is_finite(seconds):
		return
	current_time = clampf(seconds, 0.0, _timeline.duration)
	if current_time >= _timeline.duration:
		_set_playing(false)
	_refresh()


func advance(delta: float) -> void:
	if _playing and delta >= 0.0:
		seek(current_time + delta * speed)


func _process(delta: float) -> void:
	advance(delta)


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
	_slider.value_changed.connect(seek)
	toolbar.add_child(_slider)
	_time_label = Label.new()
	_time_label.custom_minimum_size.x = 102.0
	_time_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	toolbar.add_child(_time_label)
	var show_preview := Button.new()
	show_preview.text = "미리보기"
	show_preview.toggle_mode = true
	show_preview.toggled.connect(_set_preview_visible)
	toolbar.add_child(show_preview)


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
	if not _playing and current_time >= _timeline.duration:
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
	if is_instance_valid(_preview):
		_snapshot = _timeline.evaluate(current_time)
		if _preview_body.visible:
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
