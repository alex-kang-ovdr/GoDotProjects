@tool
extends Control

const INK := Color("111b2b")
const LIGHT := Color("eff5ff")
const TEXTURE_EXTENSIONS := ["svg", "png", "webp", "jpg", "jpeg"]

var _timeline: RefCounted
var _snapshot: Dictionary = {}
var _textures: Dictionary = {}


func configure(timeline: RefCounted) -> void:
	_timeline = timeline
	clip_contents = true
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	for definition: Dictionary in timeline.objects:
		var source := str(definition.get("texture", ""))
		if not source.is_empty() and not _textures.has(source):
			_textures[source] = _load_texture(source)


func present(snapshot: Dictionary) -> void:
	_snapshot = snapshot
	queue_redraw()


func _load_texture(source: String) -> Texture2D:
	var path := source if source.begins_with("res://") else "res://" + source
	var relative := path.trim_prefix("res://")
	if relative.is_absolute_path() or relative.contains(":") or relative.contains("\\") or relative.split("/").has(".."):
		return null
	if not TEXTURE_EXTENSIONS.has(path.get_extension().to_lower()):
		return null
	if ResourceLoader.exists(path, "Texture2D"):
		return ResourceLoader.load(path, "Texture2D") as Texture2D
	# Initial editor import may still be in progress when the plugin is enabled.
	if FileAccess.file_exists(path):
		var source_file := FileAccess.open(path, FileAccess.READ)
		if source_file != null and source_file.get_length() <= 1048576:
			var image := Image.new()
			if image.load(path) == OK:
				return ImageTexture.create_from_image(image)
	return null


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), INK.darkened(0.34))
	if _timeline == null or _snapshot.is_empty() or size.x <= 0.0 or size.y <= 0.0:
		return
	var view: Vector2 = _timeline.viewport_size
	var view_scale := minf(size.x / view.x, size.y / view.y)
	var offset := (size - view * view_scale) / 2.0
	draw_set_transform(offset, 0.0, Vector2.ONE * view_scale)
	draw_rect(Rect2(Vector2.ZERO, view), INK)
	for definition: Dictionary in _timeline.objects:
		var state: Dictionary = _snapshot.objects[definition.id]
		if state.visible:
			_draw_object(definition, state)
	draw_rect(Rect2(Vector2.ZERO, view), Color("8da6bf"), false, 1.0)
	draw_set_transform(Vector2.ZERO)


func _draw_object(definition: Dictionary, state: Dictionary) -> void:
	var bounds := Rect2(state.position, Vector2(float(definition.w), float(definition.h)))
	var color := Color.from_string(str(definition.get("color", "")), LIGHT)
	var label: String = state.label
	match str(definition.kind):
		"sprite":
			var texture: Texture2D = _textures.get(definition.get("texture", ""))
			if texture != null:
				draw_texture_rect(texture, bounds, false, color if definition.has("color") else Color.WHITE)
			else:
				draw_rect(bounds, color)
				draw_rect(bounds, color.lightened(0.28), false, 2.0)
				_draw_label(bounds, label, INK, false)
		"line":
			var points := PackedVector2Array()
			for point: Array in definition.points:
				points.append(bounds.position + Vector2(float(point[0]), float(point[1])))
			draw_polyline(points, color, clampf(float(definition.get("w", 2.0)), 1.0, 12.0), true)
		"text":
			_draw_label(bounds, label, color, false)
		"button", "platform", "rect":
			draw_rect(bounds, color)
			draw_rect(bounds, color.lightened(0.26), false, 1.0)
			_draw_label(bounds, label, INK if color.get_luminance() > 0.38 else LIGHT, definition.kind == "button")
		"background":
			draw_rect(bounds, color)


func _draw_label(bounds: Rect2, label: String, color: Color, centered: bool) -> void:
	if label.is_empty():
		return
	var font := get_theme_default_font()
	var font_size := clampi(roundi(bounds.size.y * 0.65), 13, 34)
	var lines := label.split("\n")
	var line_height := font.get_height(font_size)
	var first_baseline := (bounds.size.y - float(lines.size()) * line_height) / 2.0 + font.get_ascent(font_size)
	var alignment := HORIZONTAL_ALIGNMENT_CENTER if centered else HORIZONTAL_ALIGNMENT_LEFT
	for index in range(lines.size()):
		var origin := bounds.position + Vector2(7.0, first_baseline + float(index) * line_height)
		draw_string(font, origin, lines[index], alignment, maxf(1.0, bounds.size.x - 14.0), font_size, color)


class EditorCursorOverlay extends Control:
	const BACKGROUND := Color("202d41")
	const CAPTION_COLOR := Color("eff5ff")
	const PHASES := {
		"search": ["탐색", "a4c6ef", "search"], "target": ["대상", "88d9ed", "target"],
		"execute": ["실행", "ffc979", "click"], "change": ["변경", "dcadff", "change"],
		"progress": ["진행 중", "93c8ff", "import"], "success": ["완료", "9ae6ae", "success"],
		"failure": ["실패", "ffa09b", "error"], "hidden": ["대기", "bec8d6", "wait"],
		"drag": ["드래그", "85dfcc", "drag"], "wire": ["연결", "99c9ff", "wire"],
		"undo": ["실행 취소", "e5bbef", "undo"], "redo": ["다시 실행", "b7cdf8", "redo"],
	}
	const SYMBOLS := {"search": "🔍", "target": "◎", "click": "☞", "change": "↔", "import": "↓", "success": "✓",
		"error": "!", "wait": "…", "drag": "✥", "wire": "⌁", "undo": "↶", "redo": "↷"}
	var _cursors: Array[Dictionary] = []
	var _clocks := {}

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		clip_contents = true
		set_process(false)

	func present(cursors: Array[Dictionary]) -> void:
		if _cursors == cursors:
			return
		var clocks := {}
		for cursor in cursors:
			var effect: Dictionary = cursor.get("effect", {})
			var phase: String = effect.get("phase", "")
			if PHASES.has(phase):
				var previous: Dictionary = _clocks.get(cursor.id, {})
				if previous.get("phase") != phase or previous.get("event") != effect.get("eventId"):
					previous = {"phase": phase, "event": effect.get("eventId"), "start": Time.get_ticks_msec()}
				clocks[cursor.id] = previous
		_clocks = clocks
		_cursors = cursors.duplicate(true)
		visible = not _cursors.is_empty()
		set_process(visible and not _clocks.is_empty())
		queue_redraw()

	func active_cursors() -> Array[Dictionary]:
		return _cursors.duplicate(true)

	func _process(_delta: float) -> void:
		queue_redraw()

	func _motion(cursor: Dictionary) -> Dictionary:
		var e: Dictionary = cursor.get("effect", {})
		var phase: String = e.get("phase", "")
		var tip := Vector2(cursor.x, cursor.y) * size
		if not _clocks.has(cursor.id):
			return {"tip": tip, "pulse": 0.0, "squash": 0.0, "animate": false}
		var props: Array = PHASES[phase]
		var speed := clampf(float(e.get("speed", 1.0)), 0.1, 4.0)
		var strength := clampf(float(e.get("strength", 1.0)), 0.0, 1.0)
		var reduced := bool(e.get("reduceMotion", false)) or strength <= 0.0
		var elapsed := (Time.get_ticks_msec() - int(_clocks[cursor.id].start)) * speed
		var duration := clampf(float(e.get("durationMs", 200)), 1, 10000)
		var t := 1.0 if reduced else minf(1.0, elapsed / duration)
		var burst := sin(t * PI) * strength
		var loop := not reduced and phase in ["search", "progress"] and bool(e.get("pulse", true))
		var pulse := burst if e.get("pulse", true) else 0.0
		if loop:
			pulse = (0.5 - 0.5 * cos(TAU * elapsed / (1400.0 if phase == "search" else 850.0))) * strength
		var drag := bool(e.get("drag", phase == "drag"))
		var wire := bool(e.get("wire", phase == "wire"))
		var route := phase != "hidden" and (drag or wire) and _observed_point(e.get("from")) and _observed_point(e.get("to"))
		var verified := route and e.get("completed") is bool and bool(e.completed)
		var replay := verified and bool(e.get("replayPath", false))
		var travel := 1.0 if verified and not replay else smoothstep(0, 0.72 if replay else 1.0, t)
		var landed := verified and travel >= 1.0
		var impact := sin(clampf((t - 0.72) / 0.28, 0, 1) * PI) * strength if replay else burst
		var connected := wire and landed and bool(e.get("pulse", true))
		if wire:
			pulse = impact if connected else 0.0
		var icon := str(e.get("icon", props[2]))
		var detail := str(props[0])
		if phase == "change" and e.has_all(["before", "after"]):
			detail = "%s → %s" % [e.before, e.after]
		if phase == "progress" and (e.get("progress") is float or e.get("progress") is int) and e.progress >= 0 and e.progress <= 1:
			detail += " %d%%" % roundi(float(e.progress) * 100)
		if phase == "failure" and not str(e.get("reason", "")).is_empty():
			detail += " · " + str(e.reason)
		var fx := {"tip": tip, "phase": phase, "color": Color(props[1]), "text": str(SYMBOLS.get(icon, icon.left(3))) + " " + detail,
			"pulse": pulse, "squash": impact if e.get("squash", true) and (phase == "execute" or (drag and landed)) else 0.0,
			"shake": sin(t * TAU * 3) * (1 - t) * 4 * strength if phase == "failure" and e.get("shake", true) else 0.0,
			"animate": not reduced and (loop or t < 1)}
		if route:
			var start := Vector2(e.from.x, e.from.y) * size
			var end := Vector2(e.to.x, e.to.y) * size
			fx.tip = start.lerp(end, travel)
			fx.route = {"start": start, "end": end, "wire": wire, "landed": landed, "connected": connected}
		return fx

	func _observed_point(value: Variant) -> bool:
		if not value is Dictionary or not value.has_all(["x", "y"]):
			return false
		for coordinate: Variant in [value.x, value.y]:
			if not (coordinate is float or coordinate is int) or not is_finite(float(coordinate)) or coordinate < 0 or coordinate > 1:
				return false
		return true

	func _draw() -> void:
		var motions := {}
		var animating := false
		for cursor in _cursors:
			var fx := _motion(cursor)
			motions[cursor.id] = fx
			animating = animating or fx.animate
			if fx.has("route"):
				_draw_route(fx)
			if cursor.get("main", false) and cursor.has("target") and cursor.get("effect", {}).get("phase") not in ["hidden", "idle"]:
				_draw_target(cursor.target, Color.from_string(cursor.color, Color("90d5ff")), fx.pulse)
		set_process(animating)
		for cursor in _cursors:
			var fx: Dictionary = motions[cursor.id]
			var tip: Vector2 = fx.tip
			var color := Color.from_string(cursor.color, Color("90d5ff"))
			var cursor_scale := float(cursor.get("scale", 1.0))
			var badge_left := tip.x > size.x * 0.68
			var offset_x := (-4.0 if badge_left else 18.0) * cursor_scale
			var caption_y := -24.0 if tip.y > size.y * 0.85 else 22.0 * cursor_scale
			var role_bounds := _draw_badge(cursor.label, tip + Vector2(offset_x, 0), badge_left, color.darkened(0.65), CAPTION_COLOR, false, cursor_scale)
			if fx.has("phase"):
				var badge_x := role_bounds.position.x - 4 if badge_left else role_bounds.end.x + 4
				var badge_origin := Vector2(badge_x + float(fx.shake), role_bounds.position.y)
				_draw_badge(fx.text, badge_origin, badge_left, BACKGROUND, fx.color, true, 1.0 + 0.1 * float(fx.pulse), role_bounds)
			if cursor.get("effect", {}).get("phase") != "idle":
				_draw_badge(cursor.caption, tip + Vector2(offset_x, caption_y), badge_left, BACKGROUND, CAPTION_COLOR)
			var press := Vector2(1.0 + 0.18 * float(fx.squash), 1.0 - 0.2 * float(fx.squash)) * cursor_scale
			var arrow := PackedVector2Array([tip, tip + Vector2(4, 18) * press, tip + Vector2(8, 12) * press, tip + Vector2(16, 10) * press, tip])
			draw_colored_polygon(arrow.slice(0, 4), color)
			draw_polyline(arrow, Color("131925"), 2.0 * cursor_scale, true)

	func _draw_route(fx: Dictionary) -> void:
		var start: Vector2 = fx.route.start
		var end: Vector2 = fx.route.end
		var tip: Vector2 = fx.tip
		var color: Color = fx.color
		if start.distance_squared_to(end) < 0.01:
			return
		draw_line(start, end, Color(color, 0.28), 1.5, true)
		if fx.route.wire:
			draw_line(start, tip, color, 2, true)
			draw_circle(start, 3, color)
			draw_circle(end, 3, color, fx.route.connected, 1.5, true)
		else:
			var tail := tip.move_toward(start, 42)
			draw_line(tail, tip, Color(color, 0.72), 3, true)

	func _draw_target(target: Dictionary, color: Color, pulse: float) -> void:
		var bounds := Rect2(Vector2(target.x, target.y) * size, Vector2(target.w, target.h) * size)
		bounds = bounds.intersection(Rect2(Vector2.ZERO, size))
		if not bounds.has_area():
			return
		draw_rect(bounds, Color(color, 0.08))
		var width := minf(2.0 + pulse * 2, minf(bounds.size.x, bounds.size.y))
		draw_rect(bounds.grow(-width / 2.0), color, false, width)

	func _badge_bounds(text: String, origin: Vector2, align_left_of_tip: bool, zoom: float, avoid := Rect2()) -> Rect2:
		if text.is_empty():
			return Rect2()
		var font := get_theme_default_font()
		var font_size := roundi(maxf(11, get_theme_default_font_size() * 0.85) * zoom)
		var padding := Vector2(6.0, 3.0) * zoom
		var width := minf(font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x + 2 * padding.x, minf(250.0 * zoom, size.x))
		var height := font.get_height(font_size) + 2 * padding.y
		if align_left_of_tip:
			origin.x -= width
		var position := origin.clamp(Vector2.ZERO, (size - Vector2(width, height)).max(Vector2.ZERO))
		var bounds := Rect2(position, Vector2(width, height))
		return Rect2() if avoid.intersects(bounds) else bounds

	func _draw_badge(text: String, origin: Vector2, align_left_of_tip: bool, background: Color, color: Color, capsule := false, zoom := 1.0, avoid := Rect2()) -> Rect2:
		var bounds := _badge_bounds(text, origin, align_left_of_tip, zoom, avoid)
		if not bounds.has_area():
			return bounds
		var font := get_theme_default_font()
		var font_size := roundi(maxf(11, get_theme_default_font_size() * 0.85) * zoom)
		var padding := Vector2(6.0, 3.0) * zoom
		var badge := StyleBoxFlat.new()
		badge.bg_color = background
		badge.set_corner_radius_all(ceili(bounds.size.y / 2) if capsule else 4)
		if capsule:
			badge.set_border_width_all(1)
			badge.border_color = color.darkened(0.35)
		draw_style_box(badge, bounds)
		var line := TextLine.new()
		line.width = maxf(0.0, bounds.size.x - 2 * padding.x)
		line.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		line.add_string(text, font, font_size)
		line.draw(get_canvas_item(), bounds.position + padding, color)
		return bounds
