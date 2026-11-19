@tool
extends RefCounted

const PRIVATE_DIR := "res://.godot"
const IGNORED_DIRECTORIES := [
	"addons/playforge_platform", "addons/playforge_replay", "addons/playforge_showcase", "addons/playforge_agent_chat",
]

var error_message := ""
var _pid := -1
var _scene_path := ""
var _web_window: JavaScriptObject
var _editor_screen := ""


func launch(root: Node) -> bool:
	stop()
	error_message = ""
	if not is_instance_valid(root):
		return _fail("실행할 시연 장면이 없습니다.")
	var packed := PackedScene.new()
	if packed.pack(root) != OK:
		return _fail("시연 장면을 실행용으로 묶지 못했습니다.")
	_scene_path = "%s/playforge-showcase-%d-%d.tscn" % [PRIVATE_DIR, OS.get_process_id(), Time.get_ticks_usec()]
	if ResourceSaver.save(packed, _scene_path) != OK:
		return _fail("시연 장면의 임시 파일을 만들지 못했습니다.")
	if OS.has_feature("web"):
		return _launch_web(root)
	var arguments := PackedStringArray(["--path", ProjectSettings.globalize_path("res://"), _scene_path])
	if DisplayServer.get_name() == "headless":
		arguments.insert(0, "--headless")
	_pid = OS.create_process(OS.get_executable_path(), arguments)
	if _pid <= 0:
		return _fail("시연 게임 프로세스를 시작하지 못했습니다.")
	return true


func stop() -> void:
	if _pid > 0 and OS.is_process_running(_pid):
		OS.kill(_pid)
	_pid = -1
	if _web_window != null:
		_web_window.__playforgeStopShowcaseGame()
		_web_window = null
		if not _editor_screen.is_empty():
			EditorInterface.set_main_screen_editor(_editor_screen)
	_editor_screen = ""
	if not _scene_path.is_empty():
		DirAccess.remove_absolute(_scene_path)
		_scene_path = ""


func _launch_web(root: Node) -> bool:
	if not bool(JavaScriptBridge.eval("typeof window.__playforgeBeginShowcaseGame === 'function'", true)):
		return _fail("웹 에디터에서 시연 게임을 시작할 수 없습니다.")
	_web_window = JavaScriptBridge.get_interface("window")
	_editor_screen = "3D" if root is Node3D else "2D"
	_web_window.__playforgeBeginShowcaseGame(_scene_path)
	if not _copy_directory("") or not _copy_directory(".godot/imported") or not _copy_file(_scene_path.trim_prefix("res://")):
		return _fail("시연 게임의 실행 파일을 준비하지 못했습니다.")
	for index_file in [".godot/uid_cache.bin", ".godot/global_script_class_cache.cfg"]:
		if FileAccess.file_exists("res://" + index_file) and not _copy_file(index_file):
			return _fail("시연 게임의 리소스 인덱스를 복사하지 못했습니다.")
	EditorInterface.set_main_screen_editor("Game")
	_web_window.__playforgePlayShowcaseGame()
	return true


func _copy_directory(relative: String) -> bool:
	var directory := DirAccess.open("res://" + relative)
	if directory == null:
		return relative == ".godot/imported"
	for file in directory.get_files():
		if file.begins_with("."):
			continue
		if not _copy_file(relative.path_join(file)):
			return false
	for child in directory.get_directories():
		var child_path := relative.path_join(child)
		if child.begins_with(".") or child_path in IGNORED_DIRECTORIES:
			continue
		if not _copy_directory(child_path):
			return false
	return true


func _copy_file(relative: String) -> bool:
	var file := FileAccess.open("res://" + relative, FileAccess.READ)
	if file == null:
		return false
	var bytes := file.get_buffer(file.get_length())
	return bool(_web_window.__playforgeAddShowcaseGameFile(relative, Marshalls.raw_to_base64(bytes)))


func _fail(message: String) -> bool:
	stop()
	error_message = message
	return false
