@tool
extends PanelContainer

signal view_changed

const CATALOG := "res://.playforge-store.json"
const TITLE := "PlayForge 에셋 스토어"
var _imports: Node
var _packs := {}
var _selected := ""
var _requested := ""
var _manual := false
var _auto_id := ""
var _dismissed_id := ""
var _catalog_error := ""
var _selector := OptionButton.new()
var _description := Label.new()
var _files := VBoxContainer.new()
var _status := Label.new()
var _import := Button.new()
var _close := Button.new()


func configure(importer: Node) -> void:
	_imports = importer
	_imports.changed.connect(refresh_receipt)
	_read_catalog()


func _read_catalog() -> void:
	if not FileAccess.file_exists(CATALOG):
		return
	var catalog: Variant = JSON.parse_string(FileAccess.get_file_as_string(CATALOG))
	if not catalog is Dictionary or not catalog.get("packs") is Array:
		_catalog_error = "에셋 스토어 목록을 읽을 수 없습니다."
		return
	for pack: Variant in catalog.packs:
		if not pack is Dictionary or not pack.get("id") is String or not pack.get("title") is String or not pack.get("files") is Array:
			continue
		if pack.id.is_empty() or pack.title.is_empty() or _packs.has(pack.id) or pack.files.is_empty() or pack.files.size() > 32:
			continue
		var paths := PackedStringArray()
		for file: Variant in pack.files:
			if not file is String or not file.begins_with("Assets/") or not file.ends_with(".svg"):
				break
			var leaf: String = file.trim_prefix("Assets/")
			if not leaf.is_valid_filename() or leaf.begins_with(".") or paths.has(file):
				break
			paths.append(file)
		if paths.size() == pack.files.size():
			_packs[pack.id] = pack


func _ready() -> void:
	name = "PlayForgeAssetStore"
	z_index = 85
	hide()
	var scale_factor := EditorInterface.get_editor_scale()
	var border := StyleBoxFlat.new()
	border.bg_color = get_theme_color(&"base_color", &"Editor").darkened(0.08)
	border.border_color = get_theme_color(&"accent_color", &"Editor").lerp(border.bg_color, 0.45)
	border.set_border_width_all(maxi(1, roundi(scale_factor)))
	border.set_corner_radius_all(roundi(6 * scale_factor))
	border.shadow_size = roundi(8 * scale_factor)
	for side in [SIDE_LEFT, SIDE_RIGHT, SIDE_TOP, SIDE_BOTTOM]:
		border.set_content_margin(side, 12 * scale_factor)
	add_theme_stylebox_override(&"panel", border)
	var body := VBoxContainer.new()
	body.add_theme_constant_override(&"separation", roundi(8 * scale_factor))
	add_child(body)
	var heading := HBoxContainer.new()
	body.add_child(heading)
	var title := Label.new()
	title.text = TITLE
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_theme_font_override(&"font", get_theme_font(&"bold", &"EditorFonts"))
	heading.add_child(title)
	_close.name = "CloseStore"
	_close.icon = get_theme_icon(&"Close", &"EditorIcons")
	_close.flat = true
	_close.tooltip_text = "닫기"
	_close.pressed.connect(close_manual)
	heading.add_child(_close)
	_selector.name = "PackSelector"
	_selector.fit_to_longest_item = false
	for id: String in _packs:
		_selector.add_item(_packs[id].title)
		_selector.set_item_metadata(_selector.item_count - 1, id)
	_selector.item_selected.connect(func(index: int): _select(_selector.get_item_metadata(index)))
	body.add_child(_selector)
	_description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.add_child(_description)
	var scroll := ScrollContainer.new()
	scroll.name = "StoreFiles"
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size.y = roundi(124 * scale_factor)
	body.add_child(scroll)
	_files.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_files)
	_status.name = "StoreReceipt"
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.add_child(_status)
	_import.name = "ImportPack"
	_import.text = "프로젝트로 가져오기"
	_import.icon = get_theme_icon(&"ImportCheck", &"EditorIcons")
	_import.pressed.connect(func(): import_pack(_selected, true))
	body.add_child(_import)
	_import.item_rect_changed.connect(_button_moved, CONNECT_DEFERRED)
	if _selector.item_count > 0:
		_select(_selector.get_item_metadata(0))
	else:
		_selector.hide()
		scroll.hide()
		_import.hide()
		_description.text = _catalog_error if not _catalog_error.is_empty() else "이 프로젝트에 등록된 에셋 팩이 없습니다."
	refresh_receipt()
	get_parent_control().resized.connect(_place)
	minimum_size_changed.connect(_place, CONNECT_DEFERRED)


func _select(id: String) -> void:
	if not _packs.has(id) or _selected == id:
		return
	_selected = id
	for index in _selector.item_count:
		if _selector.get_item_metadata(index) == id:
			_selector.select(index)
			break
	_description.text = str(_packs[id].get("description", ""))
	for child in _files.get_children():
		_files.remove_child(child)
		child.queue_free()
	for file: String in _packs[id].files:
		var row := HBoxContainer.new()
		var image := TextureRect.new()
		image.custom_minimum_size = Vector2.ONE * 34 * EditorInterface.get_editor_scale()
		image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		image.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		image.texture = _preview_texture(file)
		row.add_child(image)
		var label := Label.new()
		label.text = file
		label.tooltip_text = file
		label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		row.add_child(label)
		_files.add_child(row)
	refresh_receipt()
	view_changed.emit()


func _preview_texture(file: String) -> Texture2D:
	var source: String = _imports.store_source(file)
	if source.is_empty() or not FileAccess.file_exists(source):
		return null
	var handle := FileAccess.open(source, FileAccess.READ)
	if handle == null or handle.get_length() > 1048576:
		return null
	var image := Image.new()
	if image.load_svg_from_buffer(handle.get_buffer(handle.get_length())) != OK:
		return null
	return ImageTexture.create_from_image(image)


func open_manual() -> void:
	_manual = true
	mouse_behavior_recursive = Control.MOUSE_BEHAVIOR_ENABLED
	focus_behavior_recursive = Control.FOCUS_BEHAVIOR_ENABLED
	_close.show()
	show()
	_place()
	view_changed.emit()


func _button_moved() -> void:
	if visible:
		view_changed.emit()


func close_manual() -> void:
	_manual = false
	_dismissed_id = _auto_id
	hide()
	view_changed.emit()


func present_pack(id: String) -> void:
	if id != _auto_id:
		_dismissed_id = ""
	_auto_id = id
	if _manual:
		return
	if not _packs.has(id) or (not id.is_empty() and id == _dismissed_id):
		if visible:
			hide()
			view_changed.emit()
		return
	_select(id)
	if not visible:
		mouse_behavior_recursive = Control.MOUSE_BEHAVIOR_DISABLED
		focus_behavior_recursive = Control.FOCUS_BEHAVIOR_DISABLED
		_close.hide()
		show()
		_place()
		view_changed.emit()


func _place() -> void:
	if not visible or not is_inside_tree():
		return
	var base := get_parent_control()
	var region := EditorInterface.get_editor_main_screen().get_global_rect().intersection(base.get_global_rect())
	if not region.has_area():
		region = base.get_global_rect()
	var margin := 12 * EditorInterface.get_editor_scale()
	var width := minf(400 * EditorInterface.get_editor_scale(), base.size.x - margin * 2)
	size = Vector2(maxf(width, get_combined_minimum_size().x), get_combined_minimum_size().y)
	var corner := region.position - base.global_position + Vector2(margin, margin)
	position = corner.clamp(Vector2.ZERO, (base.size - size).max(Vector2.ZERO))


func pack_title(id: String) -> String:
	return str(_packs.get(id, {}).get("title", ""))


func preview_pack(id: String) -> Dictionary:
	if not _packs.has(id):
		return {"state": "error", "packId": id, "message": "에셋 스토어에 등록되지 않은 팩입니다."}
	var files: Array = _packs[id].files
	for file: String in files:
		if not FileAccess.file_exists(_imports.store_source(file)):
			return {"state": "error", "packId": id, "message": "스토어 원본 파일을 찾을 수 없습니다. " + file}
	return {"state": "preview", "packId": id, "files": files.duplicate(), "count": files.size(),
		"dryRun": true, "message": "가져올 텍스처 %d개" % files.size()}


func current_receipt() -> Dictionary:
	var receipt: Dictionary = _imports.receipt.duplicate(true)
	if not receipt.is_empty() and not _requested.is_empty():
		receipt.packId = _requested
	return receipt


func import_pack(id: String, manual := false, expected: Array = [], staged: Array = []) -> Dictionary:
	if _imports.receipt.get("state") in ["queued", "importing"]:
		return {"state": "busy", "packId": id, "message": "다른 에셋 임포트가 진행 중입니다."}
	_requested = id
	var preview := preview_pack(id)
	if preview.state == "error":
		_imports.reject(preview.message)
		return current_receipt()
	if not manual and _packs[id].files != expected:
		_imports.reject("스토어 팩과 요청한 파일 목록이 일치하지 않습니다.")
		return current_receipt()
	if manual:
		_imports.begin_run()
	var files: Array = _packs[id].files
	_imports.request(files, staged, true, manual)
	return current_receipt()


func refresh_receipt() -> void:
	var receipt: Dictionary = _imports.receipt
	var matches := not _selected.is_empty() and PackedStringArray(receipt.get("files", [])) == PackedStringArray(_packs[_selected].files)
	_status.text = str(receipt.get("message", "")) if matches or receipt.get("state") == "error" else ""
	_status.visible = not _status.text.is_empty()
	_import.disabled = _selected.is_empty() or receipt.get("state") in ["queued", "importing"]
	_import.text = "다시 가져오기" if matches and receipt.get("state") == "done" else "프로젝트로 가져오기"


func target(id: String, action: String) -> Dictionary:
	if not is_visible_in_tree() or _selected != id:
		return {}
	var control: Control = _selector
	var kind := "store_pack"
	var label: String = _packs[id].title
	if action == "import":
		control = _status if _status.visible and _imports.receipt.get("state") in ["done", "error"] else _import
		kind = "store_receipt" if control == _status else "store_import"
		label = _status.text if _status.visible else _import.text
	var rect := control.get_global_rect().intersection(get_parent_control().get_global_rect())
	return {"kind": kind, "label": label, "rect": rect} if rect.has_area() else {}


func normalized_rect(control: Control) -> Dictionary:
	if not is_instance_valid(control) or not control.is_visible_in_tree() or control.get_viewport() != get_viewport():
		return {}
	var bounds := get_parent_control().get_global_rect()
	var rect := control.get_global_rect().intersection(bounds)
	if not rect.has_area() or not bounds.has_area():
		return {}
	return {"x": (rect.position.x - bounds.position.x) / bounds.size.x, "y": (rect.position.y - bounds.position.y) / bounds.size.y,
		"w": rect.size.x / bounds.size.x, "h": rect.size.y / bounds.size.y}


func diagnostics() -> Dictionary:
	return {"visible": visible, "manual": _manual, "selectedPack": _selected,
		"files": _packs[_selected].files.duplicate() if not _selected.is_empty() else [],
		"receipt": current_receipt(), "importRect": normalized_rect(_import)}
