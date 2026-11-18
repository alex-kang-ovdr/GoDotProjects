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
	var _cursors: Array[Dictionary] = []

	func present(cursors: Array[Dictionary]) -> void:
		if _cursors == cursors:
			return
		_cursors = cursors
		visible = not _cursors.is_empty()
		queue_redraw()

	func active_cursors() -> Array[Dictionary]:
		return _cursors.duplicate(true)

	func _draw() -> void:
		for cursor in _cursors:
			var tip := Vector2(cursor.x, cursor.y) * size
			var color := Color.from_string(cursor.color, Color("90d5ff"))
			var opacity := clampf(float(cursor.get("opacity", 1.0)), 0.0, 1.0)
			color.a = opacity
			var arrow := PackedVector2Array([tip, tip + Vector2(4, 18), tip + Vector2(8, 12), tip + Vector2(16, 10), tip])
			draw_colored_polygon(arrow.slice(0, 4), color)
			draw_polyline(arrow, Color(Color("131925"), opacity), 2.0, true)
			_draw_badge(cursor.label, tip + Vector2(18, 0), color.darkened(0.65), Color(CAPTION_COLOR, opacity))
			_draw_badge(cursor.caption, tip + Vector2(14, 22), Color(BACKGROUND, opacity), Color(CAPTION_COLOR, opacity))

	func _draw_badge(text: String, origin: Vector2, background: Color, color: Color) -> void:
		if text.is_empty():
			return
		var font := get_theme_default_font()
		var font_size := maxi(11, roundi(get_theme_default_font_size() * 0.85))
		var width := minf(font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x + 12.0, minf(250.0, size.x))
		var height := font.get_height(font_size) + 6.0
		var position := origin.clamp(Vector2.ZERO, (size - Vector2(width, height)).max(Vector2.ZERO))
		var badge := StyleBoxFlat.new()
		badge.bg_color = background
		badge.set_corner_radius_all(4)
		draw_style_box(badge, Rect2(position, Vector2(width, height)))
		var line := TextLine.new()
		line.width = width - 12.0
		line.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		line.add_string(text, font, font_size)
		line.draw(get_canvas_item(), position + Vector2(6.0, 3.0), color)
