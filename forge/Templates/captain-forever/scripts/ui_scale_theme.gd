class_name UiScaleTheme
extends RefCounted

## 전역 2배 확대 UI 테마 & 슬라이더/스크롤 스타일 헬퍼.
## 모든 씬에서 동일한 고가독성 2배 폰트 크기·두꺼운 슬라이더 트랙·대형 터치 핸들을 공유한다.

static var _cached_font: Font = null
static var _cached_grabber: Texture2D = null
static var _cached_grabber_hi: Texture2D = null

static func load_ui_font() -> Font:
	if _cached_font != null:
		return _cached_font
	if FileAccess.file_exists("res://assets/fonts/captain-ui.txt"):
		var raw := FileAccess.get_file_as_string("res://assets/fonts/captain-ui.txt").strip_edges()
		if not raw.is_empty():
			var ff := FontFile.new()
			ff.data = Marshalls.base64_to_raw(raw)
			_cached_font = ff
			ThemeDB.fallback_font = ff
	return _cached_font if _cached_font != null else ThemeDB.fallback_font

static func _make_circle_tex(diam: int, ring_col: Color, fill_col: Color) -> Texture2D:
	var img := Image.create(diam, diam, false, Image.FORMAT_RGBA8)
	var c := Vector2(diam - 1, diam - 1) * 0.5
	var r_outer := float(diam) * 0.47
	var r_inner := float(diam) * 0.30
	for y in diam:
		for x in diam:
			var d := Vector2(x, y).distance_to(c)
			if d <= r_inner:
				img.set_pixel(x, y, fill_col)
			elif d <= r_outer:
				var aa := clampf(r_outer - d + 0.5, 0.0, 1.0)
				img.set_pixel(x, y, Color(ring_col.r, ring_col.g, ring_col.b, ring_col.a * aa))
			else:
				img.set_pixel(x, y, Color(0, 0, 0, 0))
	return ImageTexture.create_from_image(img)

static func make_box(bg: Color, border: Color, radius: int = 10, margin_h: int = 10, margin_v: int = 8, border_w: int = 2) -> StyleBoxFlat:
	var st := StyleBoxFlat.new()
	st.bg_color = bg
	st.border_color = border
	st.set_border_width_all(border_w)
	st.set_corner_radius_all(radius)
	st.content_margin_left = margin_h
	st.content_margin_right = margin_h
	st.content_margin_top = margin_v
	st.content_margin_bottom = margin_v
	return st

static func build_theme(hide_scrollbars: bool = true) -> Theme:
	var font := load_ui_font()
	var t := Theme.new()
	if font != null:
		t.default_font = font
	t.default_font_size = 22

	if _cached_grabber == null:
		_cached_grabber = _make_circle_tex(28, Color("#5ce8ff"), Color("#e8fdff"))
		_cached_grabber_hi = _make_circle_tex(30, Color("#ffd56b"), Color("#ffffff"))

	# HSlider: 2x thick groove & 28px glowing circular thumb
	var sl_bg := StyleBoxFlat.new()
	sl_bg.bg_color = Color("#102438")
	sl_bg.border_color = Color("#2e668c")
	sl_bg.set_border_width_all(1)
	sl_bg.set_corner_radius_all(7)
	sl_bg.content_margin_top = 7
	sl_bg.content_margin_bottom = 7

	var sl_fill := StyleBoxFlat.new()
	sl_fill.bg_color = Color("#39c9f5")
	sl_fill.set_corner_radius_all(7)
	sl_fill.content_margin_top = 7
	sl_fill.content_margin_bottom = 7

	var sl_fill_hi := StyleBoxFlat.new()
	sl_fill_hi.bg_color = Color("#74f2ce")
	sl_fill_hi.set_corner_radius_all(7)
	sl_fill_hi.content_margin_top = 7
	sl_fill_hi.content_margin_bottom = 7

	t.set_stylebox("slider", "HSlider", sl_bg)
	t.set_stylebox("grabber_area", "HSlider", sl_fill)
	t.set_stylebox("grabber_area_highlight", "HSlider", sl_fill_hi)
	t.set_icon("grabber", "HSlider", _cached_grabber)
	t.set_icon("grabber_highlight", "HSlider", _cached_grabber_hi)

	# Standard Controls 2x Typography & Padding
	for cls_name in ["Button", "OptionButton", "CheckButton", "LineEdit", "PopupMenu", "Label"]:
		t.set_font_size("font_size", cls_name, 22)
	t.set_font_size("normal_font_size", "RichTextLabel", 21)

	var btn_norm := make_box(Color(0.07, 0.15, 0.26, 0.94), Color(0.32, 0.74, 0.96, 0.85), 8, 10, 7, 2)
	var btn_hov := make_box(Color(0.11, 0.24, 0.38, 0.98), Color(0.55, 0.94, 1.0, 0.98), 8, 10, 7, 2)
	var btn_prs := make_box(Color(0.14, 0.34, 0.50, 0.98), Color(0.75, 0.98, 1.0, 1.0), 8, 10, 7, 2)
	var btn_dis := make_box(Color(0.05, 0.08, 0.13, 0.72), Color(0.22, 0.32, 0.42, 0.50), 8, 10, 7, 1)
	for b_cls in ["Button", "OptionButton", "CheckButton"]:
		t.set_stylebox("normal", b_cls, btn_norm)
		t.set_stylebox("hover", b_cls, btn_hov)
		t.set_stylebox("pressed", b_cls, btn_prs)
		t.set_stylebox("disabled", b_cls, btn_dis)

	var le_box := make_box(Color(0.04, 0.09, 0.16, 0.96), Color(0.36, 0.78, 0.98, 0.82), 8, 10, 6, 2)
	t.set_stylebox("normal", "LineEdit", le_box)
	t.set_stylebox("focus", "LineEdit", make_box(Color(0.06, 0.13, 0.22, 0.98), Color(0.62, 0.96, 1.0, 1.0), 8, 10, 6, 2))

	var pop_box := make_box(Color(0.04, 0.09, 0.16, 0.98), Color(0.45, 0.90, 1.0, 0.95), 10, 10, 8, 2)
	t.set_stylebox("panel", "PopupMenu", pop_box)

	if hide_scrollbars:
		var empty_sb := StyleBoxEmpty.new()
		for sb_kind in ["VScrollBar", "HScrollBar"]:
			for st_name in ["scroll", "scroll_focus", "grabber", "grabber_highlight", "grabber_pressed"]:
				t.set_stylebox(st_name, sb_kind, empty_sb)
	return t
