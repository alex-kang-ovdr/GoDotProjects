@tool
extends EditorPlugin

const REPOSITORY := "PlayForge Local"
const STORE_SCREEN := "Asset Store"
const PACK_TEXTURE := "res://Assets/chicken.svg"
const PACK_AUDIO := "res://Assets/Audio/SFX_Click_01.tres"


func _enter_tree() -> void:
	_verify.call_deferred()


func _verify() -> void:
	var settings := EditorInterface.get_editor_settings()
	var base := EditorInterface.get_base_control()
	var local_url := OS.get_environment("PLAYFORGE_ASSET_LIBRARY_URL")
	var pack_title := OS.get_environment("PLAYFORGE_ASSET_LIBRARY_TITLE")
	var repositories: Dictionary = settings.get_setting("asset_store/available_urls")
	if repositories.get(REPOSITORY) != local_url or DirAccess.dir_exists_absolute("res://Assets"):
		_fail("The showcase add-on must register the local repository in a blank project.")
		return
	EditorInterface.set_main_screen_editor(STORE_SCREEN)
	var store := _find(base, func(node: Node) -> bool:
		return node.get_class() == "EditorAssetLibrary" and node.is_visible_in_tree()
	)
	if store == null:
		_fail("The engine's built-in Asset Store main screen is unavailable.")
		return
	var go_online := _visible_button(store, "Go Online")
	if go_online != null:
		go_online.pressed.emit()
	var repository := await _wait(func(): return _find(store, func(node: Node) -> bool:
		return node is OptionButton and _repository_index(node) >= 0
	)) as OptionButton
	if repository == null:
		_fail("The built-in repository dropdown did not list PlayForge Local.")
		return
	var index := _repository_index(repository)
	if repository.get_item_metadata(index) != local_url:
		_fail("The built-in repository dropdown pointed to the wrong endpoint.")
		return
	if repository.selected != index:
		repository.select(index)
		repository.item_selected.emit(index)
	var search := _find(store, func(node: Node) -> bool:
		return node is LineEdit and "Search assets" in node.placeholder_text
	) as LineEdit
	if search == null:
		_fail("The built-in asset search field is missing.")
		return
	search.text = "tappy chicken"
	search.text_changed.emit(search.text)
	var card := await _wait(func(): return _find(store, func(node: Node) -> bool:
		return node.get_class() == "EditorAssetLibraryItem" and _find(node, func(child: Node) -> bool:
			return child is Label and child.text == pack_title
		) != null
	)) as Control
	if card == null or not card.is_visible_in_tree():
		_fail("The built-in search did not render the local pack.")
		return
	var open_card := card.get_child(0) as Button
	if open_card == null:
		_fail("The search result has no built-in details action.")
		return
	open_card.emit_signal.call_deferred("pressed")
	var details := await _wait(func(): return _find(store, func(node: Node) -> bool:
		return node.get_class() == "EditorAssetLibraryItemDescription" and node.visible and not node.get_ok_button().disabled
	)) as ConfirmationDialog
	if details == null or details.get_ok_button().text != "Download":
		_fail("Asset details did not expose a compatible downloadable release.")
		return
	details.get_ok_button().emit_signal.call_deferred("pressed")
	var install := await _wait(func(): return _visible_button(store, "Install...")) as Button
	if install == null or DirAccess.dir_exists_absolute("res://Assets"):
		_fail("The built-in download did not verify the archive before installation.")
		return
	install.emit_signal.call_deferred("pressed")
	var installer := await _wait(func(): return _find(store, func(node: Node) -> bool:
		return node.get_class() == "EditorAssetInstaller" and node.visible and not node.get_ok_button().disabled
	)) as ConfirmationDialog
	if installer == null:
		_fail("The built-in asset installer did not open with files selected.")
		return
	# The native progress dialog pumps the main loop during installation.
	await get_tree().process_frame
	installer.get_ok_button().pressed.emit()
	await _wait(func(): return FileAccess.file_exists(PACK_TEXTURE) and FileAccess.file_exists(PACK_AUDIO))
	if not FileAccess.file_exists(PACK_TEXTURE) or not FileAccess.file_exists(PACK_AUDIO):
		_fail("The built-in installer did not extract texture and audio assets at the project root.")
		return
	await _wait(func(): return ResourceLoader.exists(PACK_TEXTURE, "Texture2D"))
	if not ResourceLoader.exists(PACK_TEXTURE, "Texture2D") or not load(PACK_AUDIO) is AudioStream:
		_fail("The engine could not resolve the installed texture and sound.")
		return
	print("PLAYFORGE_NATIVE_ASSET_LIBRARY_OK")
	get_tree().quit(0)


func _repository_index(options: OptionButton) -> int:
	for index in range(options.item_count):
		if options.get_item_text(index) == REPOSITORY:
			return index
	return -1


func _find(root: Node, predicate: Callable) -> Node:
	if predicate.call(root):
		return root
	for child in root.get_children(true):
		var match_node := _find(child, predicate)
		if match_node != null:
			return match_node
	return null


func _visible_button(root: Node, title: String) -> Button:
	return _find(root, func(node: Node) -> bool:
		return node is Button and node.text == title and node.is_visible_in_tree() and not node.disabled
	) as Button


func _wait(predicate: Callable) -> Variant:
	var deadline := Time.get_ticks_msec() + 6000
	while Time.get_ticks_msec() < deadline:
		var result: Variant = predicate.call()
		if result:
			return result
		await get_tree().create_timer(0.05).timeout
	return null


func _fail(message: String) -> void:
	push_error(message)
	get_tree().quit(1)
