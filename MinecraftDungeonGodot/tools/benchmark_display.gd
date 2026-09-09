extends RefCounted


static func inventory() -> Array[Dictionary]:
	var screens: Array[Dictionary] = []
	for index in DisplayServer.get_screen_count():
		var usable := DisplayServer.screen_get_usable_rect(index)
		screens.append({"screen": index, "refresh_hz": DisplayServer.screen_get_refresh_rate(index),
			"position": xy(DisplayServer.screen_get_position(index)), "size": xy(DisplayServer.screen_get_size(index)),
			"usable_position": xy(usable.position), "usable_size": xy(usable.size),
			"scale": DisplayServer.screen_get_scale(index), "dpi": DisplayServer.screen_get_dpi(index)})
	return screens


static func window_sample() -> Dictionary:
	return {"screen": DisplayServer.window_get_current_screen(),
		"position": xy(DisplayServer.window_get_position()), "size": xy(DisplayServer.window_get_size()),
		"vsync": DisplayServer.window_get_vsync_mode()}


static func snapshot() -> Dictionary:
	var sample := window_sample()
	sample.screens = inventory()
	sample.refresh_hz = DisplayServer.screen_get_refresh_rate(sample.screen)
	sample.window_mode = DisplayServer.window_get_mode()
	sample.engine_max_fps = Engine.max_fps
	sample.renderer = RenderingServer.get_current_rendering_method()
	sample.display_server = DisplayServer.get_name()
	sample.engine = Engine.get_version_info().string
	return sample


static func place(screen: int) -> String:
	if DisplayServer.get_name() == "headless": return "actual display required"
	if screen < 0 or screen >= DisplayServer.get_screen_count(): return "screen index unavailable"
	var usable := DisplayServer.screen_get_usable_rect(screen)
	var size := Vector2i(1280, 720)
	if usable.size.x < size.x or usable.size.y < size.y: return "screen cannot fit native 1280x720 window"
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	DisplayServer.window_set_current_screen(screen)
	DisplayServer.window_set_size(size)
	DisplayServer.window_set_position(usable.position + Vector2i((usable.size - size) / 2))
	return ""


# Pure validation, also exercised with injected monitor/size/refresh changes.
static func errors(before: Dictionary, after: Dictionary, samples: Array, requested_screen: int) -> Array[String]:
	var found: Array[String] = []
	if requested_screen >= 0 and before.screen != requested_screen: found.append("requested screen not selected")
	if not is_finite(float(before.refresh_hz)) or float(before.refresh_hz) <= 0: found.append("refresh rate unavailable")
	for key in ["screen", "position", "size", "vsync", "refresh_hz", "screens", "window_mode", "engine_max_fps", "renderer"]:
		if before[key] != after[key]: found.append("display condition changed: " + key)
	if before.size != [1280, 720]: found.append("window is not native 1280x720")
	if samples.size() != 64: found.append("missing display samples")
	for sample: Dictionary in samples:
		for key in ["screen", "position", "size", "vsync"]:
			if sample[key] != before[key]:
				found.append("display condition changed during edits: " + key)
				return found
	return found


static func xy(value: Vector2i) -> Array[int]:
	return [value.x, value.y]
