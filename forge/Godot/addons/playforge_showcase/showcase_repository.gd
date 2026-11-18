@tool
extends Node

const NAME := "PlayForge Local"
const SETTING := "asset_store/available_urls"
var url := ""
var error_message := ""
var _previous_url: Variant


func _ready() -> void:
	if OS.has_feature("web"):
		url = str(JavaScriptBridge.eval("['localhost','127.0.0.1','[::1]'].includes(location.hostname) ? location.origin + '/api/asset-library' : ''", true))
	else:
		url = OS.get_environment("PLAYFORGE_ASSET_LIBRARY_URL")
	if url.is_empty():
		return
	var settings := EditorInterface.get_editor_settings()
	var current: Dictionary = settings.get_setting(SETTING)
	_previous_url = current.get(NAME)
	var urls := {NAME: url}
	urls.merge(current)
	settings.set_setting(SETTING, urls)


func _exit_tree() -> void:
	if url.is_empty():
		return
	var settings := EditorInterface.get_editor_settings()
	var urls: Dictionary = settings.get_setting(SETTING).duplicate()
	if urls.get(NAME) == url:
		urls.erase(NAME)
		if _previous_url != null:
			urls[NAME] = _previous_url
		settings.set_setting(SETTING, urls)


func download_pack(id: String, files: PackedStringArray) -> Dictionary:
	error_message = ""
	var http := HTTPRequest.new()
	http.timeout = 15
	http.body_size_limit = 8 * 1024 * 1024
	http.max_redirects = 0
	add_child(http)
	var scratch := "/tmp" if OS.has_feature("web") else "res://.godot"
	var destination := scratch.path_join("playforge-pack-%d-%d.zip" % [get_instance_id(), Time.get_ticks_usec()])
	if not OS.has_feature("web"):
		http.download_file = destination
	var result := {}
	var start := http.request(url + "/packs/" + id.uri_encode() + ".zip")
	if start == OK:
		var response: Array = await http.request_completed
		if response[0] == HTTPRequest.RESULT_SUCCESS and response[1] == 200:
			# The browser fetch API streams responses without reporting a body length.
			# Godot can remove download_file on this path even after a successful fetch.
			if OS.has_feature("web"):
				var buffer := FileAccess.open(destination, FileAccess.WRITE)
				if buffer != null:
					buffer.store_buffer(response[3])
					buffer.close()
			var archive := ZIPReader.new()
			var opened := archive.open(destination)
			if opened == OK:
				for file in files:
					var entry := id + "/" + file
					if not archive.file_exists(entry):
						error_message = "ZIP에 파일이 없습니다. " + entry
						break
					result[file] = archive.read_file(entry)
				archive.close()
			else:
				error_message = "ZIP 열기 실패 (%s)" % error_string(opened)
		else:
			error_message = "HTTP %d, 전송 결과 %d" % [response[1], response[0]]
	else:
		error_message = error_string(start)
	http.queue_free()
	if FileAccess.file_exists(destination):
		DirAccess.remove_absolute(destination)
	return result if result.size() == files.size() else {}
