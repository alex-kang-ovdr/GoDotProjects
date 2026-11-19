@tool
extends VBoxContainer

const PROVIDER := "chatgpt-connect"
const MAX_IMAGES := 2
const MAX_BYTES := 512 * 1024

var _provider := ""
var _busy := false
var _images: Array[Dictionary] = []
var _chooser: EditorFileDialog
var _add_button: Button
var _chips: HFlowContainer
var _status: Label
var _web_callback: JavaScriptObject
var _picker_revision := 0


func _ready() -> void:
	_add_button = Button.new()
	_add_button.name = "ChatAddImage"
	_add_button.text = "이미지 첨부"
	_add_button.tooltip_text = "PNG, JPEG, WebP · 최대 2개, 각 512 KiB"
	_add_button.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_add_button.pressed.connect(_choose_images)
	add_child(_add_button)
	_chips = HFlowContainer.new()
	_chips.name = "ChatImageChips"
	add_child(_chips)
	_status = Label.new()
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(_status)
	_status.hide()
	_refresh()


func _exit_tree() -> void:
	if OS.has_feature("web") and _web_callback != null:
		JavaScriptBridge.get_interface("window")[_callback_name()] = null
		_web_callback = null


func set_provider(provider: String) -> void:
	if provider == _provider:
		return
	_provider = provider
	clear_attachments()


func set_busy(busy: bool) -> void:
	_busy = busy
	if busy:
		_cancel_picker()
	_refresh()


func request_images() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	if _provider == PROVIDER:
		for image in _images:
			result.append({"mime": image.mime, "data": image.data})
	return result


func clear_attachments() -> void:
	_cancel_picker()
	_images.clear()
	_show_status("")
	_refresh()


func _refresh() -> void:
	visible = _provider == PROVIDER
	if not is_instance_valid(_add_button):
		return
	_add_button.disabled = _busy or _images.size() >= MAX_IMAGES
	for chip in _chips.get_children():
		_chips.remove_child(chip)
		chip.queue_free()
	for index in _images.size():
		var chip := Button.new()
		chip.text = "%s  ×" % str(_images[index].name).left(50)
		chip.tooltip_text = "첨부에서 제거 · %s" % _images[index].name
		chip.disabled = _busy
		chip.pressed.connect(_remove_image.bind(index))
		_chips.add_child(chip)
	_chips.visible = not _images.is_empty()


func _show_status(message: String) -> void:
	if is_instance_valid(_status):
		_status.text = message
		_status.visible = not message.is_empty()


func _remove_image(index: int) -> void:
	if _busy or index >= _images.size():
		return
	_images.remove_at(index)
	_show_status("")
	_refresh()


func _cancel_picker() -> void:
	_picker_revision += 1
	if is_instance_valid(_chooser) and _chooser.visible:
		_chooser.hide()


func _choose_images() -> void:
	if _busy or _provider != PROVIDER or _images.size() >= MAX_IMAGES:
		return
	_show_status("")
	if OS.has_feature("web"):
		_choose_web_images()
		return
	if _chooser == null:
		_chooser = EditorFileDialog.new()
		_chooser.title = "첨부할 이미지 선택"
		_chooser.file_mode = EditorFileDialog.FILE_MODE_OPEN_FILES
		_chooser.access = EditorFileDialog.ACCESS_FILESYSTEM
		_chooser.add_filter("*.png, *.jpg, *.jpeg, *.webp", "PNG, JPEG, WebP")
		_chooser.files_selected.connect(_native_files_selected)
		add_child(_chooser)
	_chooser.popup_centered_ratio(0.65)


func _native_files_selected(paths: PackedStringArray) -> void:
	if _busy or _provider != PROVIDER:
		return
	if paths.size() > MAX_IMAGES - _images.size():
		_show_status("이미지를 최대 2개까지 첨부할 수 있습니다.")
		return
	for path in paths:
		var file := FileAccess.open(path, FileAccess.READ)
		if file == null or file.get_length() > MAX_BYTES:
			_show_status("512 KiB 이하의 읽을 수 있는 이미지가 필요합니다.")
			continue
		_add_image(path.get_file(), file.get_buffer(MAX_BYTES + 1))
	_refresh()


func _callback_name() -> String:
	return "__playforgeChatImages" + str(get_instance_id())


func _choose_web_images() -> void:
	if _web_callback == null:
		_web_callback = JavaScriptBridge.create_callback(_web_files_selected)
		JavaScriptBridge.get_interface("window")[_callback_name()] = _web_callback
	_picker_revision += 1
	JavaScriptBridge.eval("""
		((callbackName, revision, remaining, maxBytes) => {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp';
			input.multiple = remaining > 1;
			input.onchange = async () => {
				const files = [...input.files];
				if (files.length > remaining) {
					window[callbackName]?.(revision, '', '', 'count');
					return;
				}
				for (const file of files) {
					if (file.size < 1 || file.size > maxBytes) {
						window[callbackName]?.(revision, '', '', 'size');
						continue;
					}
					const reader = new FileReader();
					reader.onload = () => {
						const result = String(reader.result);
						window[callbackName]?.(revision, file.name, result.slice(result.indexOf(',') + 1), '');
					};
					reader.onerror = () => window[callbackName]?.(revision, '', '', 'size');
					reader.readAsDataURL(file);
					await new Promise(resolve => { reader.onloadend = resolve; });
				}
			};
			input.click();
		})(%s, %d, %d, %d)
		""" % [JSON.stringify(_callback_name()), _picker_revision, MAX_IMAGES - _images.size(), MAX_BYTES], true)


func _web_files_selected(args: Array) -> void:
	if args.size() != 4 or int(args[0]) != _picker_revision or _busy or _provider != PROVIDER:
		return
	var data := str(args[2])
	match str(args[3]):
		"count":
			_show_status("이미지를 최대 2개까지 첨부할 수 있습니다.")
		"size":
			_show_status("512 KiB 이하의 읽을 수 있는 이미지가 필요합니다.")
		"":
			if data.length() <= ceili(MAX_BYTES / 3.0) * 4:
				_add_image(str(args[1]), Marshalls.base64_to_raw(data))
				_refresh()


func _add_image(filename: String, bytes: PackedByteArray) -> void:
	if bytes.is_empty() or bytes.size() > MAX_BYTES:
		_show_status("512 KiB 이하의 읽을 수 있는 이미지가 필요합니다.")
		return
	var mime := _image_mime(bytes)
	if mime.is_empty():
		_show_status("PNG, JPEG, WebP 이미지를 선택해 주세요.")
		return
	if _images.size() >= MAX_IMAGES:
		_show_status("이미지를 최대 2개까지 첨부할 수 있습니다.")
		return
	_images.append({"name": filename, "mime": mime, "data": Marshalls.raw_to_base64(bytes)})


static func _image_mime(bytes: PackedByteArray) -> String:
	if bytes.size() >= 8 and bytes.slice(0, 8) == PackedByteArray([137, 80, 78, 71, 13, 10, 26, 10]):
		return "image/png"
	if bytes.size() >= 3 and bytes.slice(0, 3) == PackedByteArray([255, 216, 255]):
		return "image/jpeg"
	if bytes.size() >= 12 and bytes.slice(0, 4).get_string_from_ascii() == "RIFF" and bytes.slice(8, 12).get_string_from_ascii() == "WEBP":
		return "image/webp"
	return ""
