extends SceneTree

const PlayForgeService = preload("res://addons/playforge_service/plugin.gd")

var _backend_url := ""
var _build_url := ""


func _initialize() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--backend-url="):
			_backend_url = argument.trim_prefix("--backend-url=")
		elif argument.begins_with("--build-url="):
			_build_url = argument.trim_prefix("--build-url=")
	call_deferred("_run")


func _run() -> void:
	if PlayForgeService.parse_revision(1.0) != 1 or PlayForgeService.parse_revision(0.5) != 0:
		_fail("Plugin revision parser did not accept Godot JSON integer-as-float values safely")
		return
	if _backend_url.is_empty() or _build_url.is_empty():
		_fail("Test server URLs were not provided")
		return
	var initial := await _request(_backend_url + "/api/project", HTTPClient.METHOD_GET)
	var initial_revision = initial.body.get("revision")
	if not _ok(initial, 200) or not initial.body.get("source") is String or not (initial_revision is int or initial_revision is float):
		_fail("GET /api/project contract failed: status=%d keys=%s source_type=%s revision_type=%s" % [initial.status, initial.body.keys(), type_string(typeof(initial.body.get("source"))), type_string(typeof(initial_revision))])
		return
	var base_revision: int = initial.body.revision
	var changed_source: String = initial.body.source + "\n# plugin-service-test\n"
	var update := await _request(_backend_url + "/api/editor/source", HTTPClient.METHOD_PUT, {
		"source": changed_source,
		"baseRevision": base_revision,
		"clientId": "editor-headless-test",
	})
	var update_document = update.body.get("document", {})
	if not _ok(update, 200) or not (update_document.get("revision") is int or update_document.get("revision") is float):
		_fail("Editor source upload failed: %s" % update)
		return
	var revision := int(update.body.document.revision)
	if revision <= base_revision or update.body.document.source != changed_source:
		_fail("Editor upload response did not return the committed source revision")
		return
	var stale := await _request(_backend_url + "/api/editor/source", HTTPClient.METHOD_PUT, {
		"source": changed_source + "# stale\n",
		"baseRevision": base_revision,
		"clientId": "editor-headless-test",
	})
	if not _ok(stale, 409) or stale.body.get("error") != "revision_conflict" or stale.body.get("document", {}).get("revision") != revision:
		_fail("Stale editor source upload was not rejected: %s" % stale)
		return
	var started := await _request(_build_url + "/api/builds", HTTPClient.METHOD_POST, {"target": "web", "revision": revision})
	if not _ok(started, 202) or started.body.get("build", {}).get("status") != "queued":
		_fail("Build request contract failed: %s" % started)
		return
	var build_id: String = started.body.build.get("id", "")
	var running := await _request(_build_url + "/api/builds/" + build_id, HTTPClient.METHOD_GET)
	if not _ok(running, 200) or running.body.get("build", {}).get("status") != "running":
		_fail("Build polling running response failed: %s" % running)
		return
	var complete := await _request(_build_url + "/api/builds/" + build_id, HTTPClient.METHOD_GET)
	var build: Dictionary = complete.body.get("build", {})
	if not _ok(complete, 200) or build.get("status") != "succeeded" or build.get("revision") != revision \
	or build.get("previewUrl") != "/api/builds/" + build_id + "/files/index.html" \
	or build.get("downloadUrl") != "/api/builds/" + build_id + "/files/PlayForge-Web.zip":
		_fail("Build completion contract failed: %s" % complete)
		return
	print("PASS native Godot service contract: JSON float revision parsing, GET, PUT, stale 409, queued/running/succeeded web build")
	quit(0)


func _request(url: String, method: int, payload: Dictionary = {}) -> Dictionary:
	var request := HTTPRequest.new()
	request.timeout = 10.0
	root.add_child(request)
	var headers := PackedStringArray()
	var body := ""
	if method != HTTPClient.METHOD_GET:
		headers.append("Content-Type: application/json")
		body = JSON.stringify(payload)
	var start_error := request.request(url, headers, method, body)
	if start_error != OK:
		request.queue_free()
		return {"transport": start_error, "status": 0, "body": {}}
	var result: Array = await request.request_completed
	request.queue_free()
	var parsed = JSON.parse_string(result[3].get_string_from_utf8())
	return {"transport": result[0], "status": result[1], "body": parsed if parsed is Dictionary else {}}


func _ok(response: Dictionary, expected_status: int) -> bool:
	return response.get("transport", -1) == HTTPRequest.RESULT_SUCCESS and response.get("status", 0) == expected_status


func _fail(message: String) -> void:
	push_error(message)
	quit(1)
