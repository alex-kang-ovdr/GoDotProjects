@tool
extends VBoxContainer

const GlbImporter = preload("res://addons/playforge_tripo/glb_importer.gd")

signal asset_placed(result: Dictionary)

var _plugin: EditorPlugin
var _origin := "http://127.0.0.1:4173"
var _project_id := ""
var _http_api: HTTPRequest
var _http_glb: HTTPRequest
var _poll_timer: Timer

var _mode_badge: Label
var _model_option: OptionButton
var _prompt_input: TextEdit
var _pos_x: SpinBox
var _pos_y: SpinBox
var _pos_z: SpinBox
var _generate_btn: Button
var _status_label: Label
var _history_list: ItemList

var _request_kind := ""
var _active_job_id := ""
var _pending_manifest: Dictionary = {}
var _recent_assets: Array[Dictionary] = []


func configure(plugin: EditorPlugin, origin: String, project_id: String) -> void:
	_plugin = plugin
	_origin = origin.trim_suffix("/")
	_project_id = project_id
	if is_inside_tree():
		refresh_status()


func _ready() -> void:
	name = "Tripo 3D"
	custom_minimum_size = Vector2(260, 320)
	add_theme_constant_override("separation", 8)

	var header := HBoxContainer.new()
	var title := Label.new()
	title.text = "PlayForge Tripo 3D (v3 PoC)"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var refresh_btn := Button.new()
	refresh_btn.text = "새로고침"
	refresh_btn.pressed.connect(refresh_status)
	header.add_child(refresh_btn)
	add_child(header)

	_mode_badge = Label.new()
	_mode_badge.text = "Tripo API v3 상태 확인 중…"
	_mode_badge.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(_mode_badge)

	var model_row := HBoxContainer.new()
	var mdl_lbl := Label.new()
	mdl_lbl.text = "모델:"
	model_row.add_child(mdl_lbl)
	_model_option = OptionButton.new()
	_model_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_model_option.add_item("Tripo H3.1 (v3.1-20260211)", 0)
	_model_option.set_item_metadata(0, "v3.1-20260211")
	_model_option.add_item("Tripo P1 Smart Mesh (Quad)", 1)
	_model_option.set_item_metadata(1, "P1-20260311")
	_model_option.add_item("Tripo H3.0 (v3.0-20250812)", 2)
	_model_option.set_item_metadata(2, "v3.0-20250812")
	model_row.add_child(_model_option)
	add_child(model_row)

	var prompt_lbl := Label.new()
	prompt_lbl.text = "Text-to-3D 프롬프트"
	add_child(prompt_lbl)

	_prompt_input = TextEdit.new()
	_prompt_input.custom_minimum_size = Vector2(0, 72)
	_prompt_input.placeholder_text = "예: Stylized fantasy paladin knight in blue and gold armor, PBR"
	_prompt_input.text = "Stylized fantasy paladin knight in blue and gold armor, PBR"
	add_child(_prompt_input)

	var pos_row := HBoxContainer.new()
	var pos_lbl := Label.new()
	pos_lbl.text = "배치:"
	pos_row.add_child(pos_lbl)
	_pos_x = _make_coord_spin("X")
	_pos_y = _make_coord_spin("Y")
	_pos_z = _make_coord_spin("Z")
	pos_row.add_child(_pos_x)
	pos_row.add_child(_pos_y)
	pos_row.add_child(_pos_z)
	add_child(pos_row)

	_generate_btn = Button.new()
	_generate_btn.text = "Tripo 3D 생성 및 씬 배치"
	_generate_btn.pressed.connect(_on_generate_pressed)
	add_child(_generate_btn)

	_status_label = Label.new()
	_status_label.text = "대기 중 (Tripo 3D 드로어에서 이미지·멀티뷰·리깅 지원)"
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(_status_label)

	var hist_lbl := Label.new()
	hist_lbl.text = "생성된 Tripo 에셋 (더블 클릭으로 씬 배치)"
	add_child(hist_lbl)

	_history_list = ItemList.new()
	_history_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_history_list.custom_minimum_size = Vector2(0, 120)
	_history_list.item_activated.connect(_on_history_activated)
	add_child(_history_list)

	_http_api = HTTPRequest.new()
	_http_api.timeout = 45.0
	add_child(_http_api)
	_http_api.request_completed.connect(_on_api_completed)

	_http_glb = HTTPRequest.new()
	_http_glb.timeout = 60.0
	add_child(_http_glb)
	_http_glb.request_completed.connect(_on_glb_completed)

	_poll_timer = Timer.new()
	_poll_timer.wait_time = 0.85
	_poll_timer.one_shot = true
	add_child(_poll_timer)
	_poll_timer.timeout.connect(_poll_active_job)

	refresh_status()


func _make_coord_spin(axis: String) -> SpinBox:
	var spin := SpinBox.new()
	spin.prefix = axis + ":"
	spin.min_value = -500.0
	spin.max_value = 500.0
	spin.step = 0.5
	spin.value = 0.0
	spin.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return spin


func _csrf_headers() -> PackedStringArray:
	var headers := PackedStringArray(["Content-Type: application/json"])
	if OS.has_feature("web"):
		var token := str(JavaScriptBridge.eval("window.__playforgeCsrfToken || ''", true))
		if not token.is_empty():
			headers.append("X-PlayForge-CSRF: " + token)
	return headers


func refresh_status() -> void:
	if _http_api == null:
		return
	_request_kind = "status"
	_http_api.cancel_request()
	_http_api.request(_origin + "/api/tripo/status", PackedStringArray(), HTTPClient.METHOD_GET)


func _refresh_assets() -> void:
	if _http_api == null:
		return
	_request_kind = "assets"
	_http_api.cancel_request()
	var url := _origin + "/api/tripo/assets"
	if not _project_id.is_empty():
		url += "?projectId=" + _project_id.uri_encode()
	_http_api.request(url, PackedStringArray(), HTTPClient.METHOD_GET)


func _on_generate_pressed() -> void:
	var prompt := _prompt_input.text.strip_edges()
	if prompt.is_empty():
		_status_label.text = "프롬프트를 먼저 입력해 주세요."
		return
	var sel_idx := _model_option.selected
	var model_id := str(_model_option.get_item_metadata(sel_idx)) if sel_idx >= 0 else "v3.1-20260211"
	var body := {
		"taskType": "text_to_model",
		"prompt": prompt,
		"model": model_id,
		"texture": true,
		"pbr": true,
		"projectId": _project_id,
	}
	_generate_btn.disabled = true
	_status_label.text = "Tripo API v3 작업 생성 요청 중…"
	_request_kind = "submit"
	_http_api.cancel_request()
	_http_api.request(_origin + "/api/tripo/jobs", _csrf_headers(), HTTPClient.METHOD_POST, JSON.stringify(body))


func _poll_active_job() -> void:
	if _active_job_id.is_empty():
		return
	_request_kind = "poll"
	_http_api.cancel_request()
	_http_api.request(_origin + "/api/tripo/jobs/" + _active_job_id, PackedStringArray(), HTTPClient.METHOD_GET)


func _on_api_completed(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var text := body.get_string_from_utf8()
	var parsed = JSON.parse_string(text)
	if not (parsed is Dictionary):
		_generate_btn.disabled = false
		_status_label.text = "응답 파싱 오류 (HTTP %d)" % response_code
		return

	if _request_kind == "status":
		var mode := str(parsed.get("mode", "simulation")).to_upper()
		var bal: Variant = parsed.get("balance", {})
		var bal_str := str(bal.get("balance", "?")) if bal is Dictionary else "?"
		_mode_badge.text = "모드: %s · 크레딧: %s · 에셋: %d" % [mode, bal_str, int(parsed.get("assetsCount", 0))]
		_refresh_assets()
		return

	if _request_kind == "assets":
		_recent_assets.clear()
		_history_list.clear()
		var list: Variant = parsed.get("assets", [])
		if list is Array:
			for item in list:
				if item is Dictionary:
					_recent_assets.append(item)
					var tripo_info: Dictionary = item.get("tripo", {}) if item.get("tripo") is Dictionary else {}
					var tag := "[RIG]" if int(item.get("metrics", {}).get("skinCount", 0)) > 0 else "[3D]"
					_history_list.add_item("%s %s (%s)" % [tag, str(item.get("name", "Model")), str(tripo_info.get("mode", "sim"))])
		return

	if _request_kind == "submit":
		if response_code >= 400 or not bool(parsed.get("ok", false)):
			_generate_btn.disabled = false
			_status_label.text = "생성 오류: " + str(parsed.get("error", "HTTP %d" % response_code))
			return
		var job: Dictionary = parsed.get("job", {}) if parsed.get("job") is Dictionary else {}
		_active_job_id = str(job.get("jobId", ""))
		_status_label.text = "Tripo 생성 진행 중… (작업: %s)" % _active_job_id
		_poll_timer.start()
		return

	if _request_kind == "poll":
		var job: Dictionary = parsed.get("job", {}) if parsed.get("job") is Dictionary else {}
		var st := str(job.get("status", ""))
		var prog := int(job.get("progress", 0))
		if st == "queued" or st == "running":
			_status_label.text = "Tripo 생성 중… %d%% (%s)" % [prog, str(job.get("stage", st))]
			_poll_timer.start()
			return
		_active_job_id = ""
		_generate_btn.disabled = false
		if st == "succeeded" and job.get("asset") is Dictionary:
			var manifest: Dictionary = (job.get("asset") as Dictionary).duplicate(true)
			manifest["placement"] = {
				"position": [_pos_x.value, _pos_y.value, _pos_z.value],
				"rotationDeg": [0.0, 0.0, 0.0],
				"scale": [1.0, 1.0, 1.0],
			}
			import_asset_from_manifest(manifest)
			_refresh_assets()
		else:
			_status_label.text = "생성 실패: " + str(job.get("error", st))


func _on_history_activated(index: int) -> void:
	if index < 0 or index >= _recent_assets.size():
		return
	var manifest := _recent_assets[index].duplicate(true)
	manifest["placement"] = {
		"position": [_pos_x.value, _pos_y.value, _pos_z.value],
		"rotationDeg": [0.0, 0.0, 0.0],
		"scale": [1.0, 1.0, 1.0],
	}
	import_asset_from_manifest(manifest)


func import_asset_from_manifest(manifest: Dictionary) -> void:
	var artifact: Dictionary = manifest.get("artifact", {}) if manifest.get("artifact") is Dictionary else {}
	var glb_url := str(artifact.get("glbUrl", ""))
	if glb_url.is_empty():
		var asset_id := str(manifest.get("assetId", ""))
		if asset_id.is_empty():
			asset_placed.emit({"ok": false, "error": "MISSING_ASSET_ID"})
			return
		glb_url = "/api/tripo/assets/%s/model.glb" % asset_id
	if not glb_url.begins_with("http://") and not glb_url.begins_with("https://"):
		glb_url = _origin + glb_url

	_pending_manifest = manifest
	_status_label.text = "Tripo GLB 다운로드 및 Godot 임포트 중…"
	_http_glb.cancel_request()
	var err := _http_glb.request(glb_url, PackedStringArray(), HTTPClient.METHOD_GET)
	if err != OK:
		_status_label.text = "GLB 요청 실패 (%d)" % err
		asset_placed.emit({"ok": false, "error": "HTTP_REQUEST_ERR:%d" % err})


func _on_glb_completed(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if response_code != 200 or body.is_empty():
		_status_label.text = "GLB 다운로드 실패 (HTTP %d)" % response_code
		asset_placed.emit({"ok": false, "error": "GLB_HTTP_%d" % response_code})
		return

	var scene_root := EditorInterface.get_edited_scene_root()
	var undo_redo: Object = _plugin.get_undo_redo() if _plugin != null else null
	var res := GlbImporter.import_glb_bytes_into_scene(body, _pending_manifest, scene_root, undo_redo)
	if bool(res.get("ok", false)) and bool(res.get("placed", false)):
		var extra := ""
		if int(res.get("skeletonCount", 0)) > 0:
			extra = " · 뼈대 %d본" % int(res.get("boneCount", 0))
		var anims: Variant = res.get("animationNames", [])
		if anims is Array and not anims.is_empty():
			extra += " · 애니 %d종" % anims.size()
		_status_label.text = "배치 완료: %s (%s%s)" % [str(res.get("nodeName", "")), str(res.get("resGlbPath", "")), extra]
		EditorInterface.get_resource_filesystem().scan()
	elif bool(res.get("ok", false)):
		_status_label.text = "파일 저장 완료(%s). 3D 씬을 연 뒤 다시 배치하세요." % str(res.get("resGlbPath", ""))
	else:
		_status_label.text = "임포트 오류: " + str(res.get("error", "UNKNOWN"))
	asset_placed.emit(res)
