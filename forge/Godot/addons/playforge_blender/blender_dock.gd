@tool
extends VBoxContainer

const GlbImporter = preload("res://addons/playforge_blender/glb_importer.gd")

signal asset_placed(result: Dictionary)

var _plugin: EditorPlugin
var _origin := "http://127.0.0.1:4173"
var _project_id := ""
var _http_api: HTTPRequest
var _http_glb: HTTPRequest
var _poll_timer: Timer

var _engine_badge: Label
var _engine_option: OptionButton
var _ai_provider_option: OptionButton
var _ai_model_option: OptionButton
var _prompt_input: TextEdit
var _pos_x: SpinBox
var _pos_y: SpinBox
var _pos_z: SpinBox
var _plan_btn: Button
var _generate_btn: Button
var _status_label: Label
var _plan_box: RichTextLabel
var _history_list: ItemList

var _request_kind := ""
var _active_job_id := ""
var _pending_manifest: Dictionary = {}
var _recent_assets: Array[Dictionary] = []
var _ai_providers: Array = []


func configure(plugin: EditorPlugin, origin: String, project_id: String) -> void:
	_plugin = plugin
	_origin = origin.trim_suffix("/")
	_project_id = project_id
	if is_inside_tree():
		refresh_status()


func _ready() -> void:
	name = "AI 3D"
	custom_minimum_size = Vector2(260, 320)
	add_theme_constant_override("separation", 8)

	var header := HBoxContainer.new()
	var title := Label.new()
	title.text = "PlayForge AI 3D (Headless Blender)"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var refresh_btn := Button.new()
	refresh_btn.text = "상태 확인"
	refresh_btn.pressed.connect(refresh_status)
	header.add_child(refresh_btn)
	add_child(header)

	_engine_badge = Label.new()
	_engine_badge.text = "엔진 상태 확인 중…"
	_engine_badge.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(_engine_badge)

	var engine_row := HBoxContainer.new()
	var eng_lbl := Label.new()
	eng_lbl.text = "3D 엔진:"
	engine_row.add_child(eng_lbl)
	_engine_option = OptionButton.new()
	_engine_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_engine_option.add_item("Blender Headless CLI", 0)
	_engine_option.set_item_metadata(0, "blender-cli")
	_engine_option.add_item("Three.js Headless (초고속)", 1)
	_engine_option.set_item_metadata(1, "threejs-cli")
	engine_row.add_child(_engine_option)
	add_child(engine_row)

	var model_row := HBoxContainer.new()
	_ai_provider_option = OptionButton.new()
	_ai_provider_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ai_provider_option.add_item("자동 (연결된 AI)", 0)
	_ai_provider_option.set_item_metadata(0, "auto")
	_ai_provider_option.item_selected.connect(_on_ai_provider_selected)
	model_row.add_child(_ai_provider_option)

	_ai_model_option = OptionButton.new()
	_ai_model_option.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ai_model_option.add_item("기본 모델", 0)
	_ai_model_option.set_item_metadata(0, "")
	model_row.add_child(_ai_model_option)
	add_child(model_row)

	var prompt_lbl := Label.new()
	prompt_lbl.text = "자연어 3D 생성 프롬프트 (한국어/English)"
	add_child(prompt_lbl)

	_prompt_input = TextEdit.new()
	_prompt_input.custom_minimum_size = Vector2(0, 74)
	_prompt_input.placeholder_text = "예: 아이언맨 Mark 85 아머 슈트\n예: 황금 장식이 달린 판타지 보물상자\n예: 눈 덮인 소나무 높이 4m"
	_prompt_input.text = "아이언맨 Mark 85 아머 슈트"
	add_child(_prompt_input)

	var preset_row := HFlowContainer.new()
	for sample in [
		["아이언맨", "아이언맨 Mark 85 아머 슈트"],
		["보물상자", "황금 장식이 달린 판타지 보물상자"],
		["눈 소나무", "눈 덮인 소나무 높이 4m"],
		["크리스탈 검", "빛나는 파란 크리스탈 검"],
		["감시탑", "중세 돌 감시탑 높이 5m"],
	]:
		var chip := Button.new()
		chip.text = sample[0]
		var preset_text: String = sample[1]
		chip.pressed.connect(func(): _prompt_input.text = preset_text)
		preset_row.add_child(chip)
	add_child(preset_row)

	var pos_row := HBoxContainer.new()
	var pos_lbl := Label.new()
	pos_lbl.text = "배치 좌표:"
	pos_row.add_child(pos_lbl)
	_pos_x = _make_coord_spin("X")
	_pos_y = _make_coord_spin("Y")
	_pos_z = _make_coord_spin("Z")
	pos_row.add_child(_pos_x)
	pos_row.add_child(_pos_y)
	pos_row.add_child(_pos_z)
	add_child(pos_row)

	var btn_row := HBoxContainer.new()
	_plan_btn = Button.new()
	_plan_btn.text = "계획 미리보기"
	_plan_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_plan_btn.pressed.connect(_on_plan_pressed)
	btn_row.add_child(_plan_btn)

	_generate_btn = Button.new()
	_generate_btn.text = "생성 및 씬 배치"
	_generate_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_generate_btn.pressed.connect(_on_generate_pressed)
	btn_row.add_child(_generate_btn)
	add_child(btn_row)

	_status_label = Label.new()
	_status_label.text = "대기 중 (무수정 Blender CLI · JSON/파일 IPC)"
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(_status_label)

	_plan_box = RichTextLabel.new()
	_plan_box.custom_minimum_size = Vector2(0, 96)
	_plan_box.fit_content = false
	_plan_box.scroll_active = true
	_plan_box.text = "프롬프트를 입력하고 [생성 및 씬 배치]를 누르면 서버의 Headless Blender가 GLB를 생성해 현재 3D 씬에 자동 배치합니다."
	add_child(_plan_box)

	var hist_lbl := Label.new()
	hist_lbl.text = "최근 생성된 3D 에셋 (더블 클릭으로 씬 배치)"
	add_child(hist_lbl)

	_history_list = ItemList.new()
	_history_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_history_list.custom_minimum_size = Vector2(0, 100)
	_history_list.item_activated.connect(_on_history_activated)
	add_child(_history_list)

	_http_api = HTTPRequest.new()
	_http_api.timeout = 45.0
	add_child(_http_api)
	_http_api.request_completed.connect(_on_api_completed)

	_http_glb = HTTPRequest.new()
	_http_glb.timeout = 45.0
	add_child(_http_glb)
	_http_glb.request_completed.connect(_on_glb_completed)

	_poll_timer = Timer.new()
	_poll_timer.wait_time = 0.75
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
			headers.append("X-CSRF-Token: " + token)
	return headers


func refresh_status() -> void:
	if _http_api == null or _http_api.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		return
	_request_kind = "status"
	_http_api.request(_origin + "/api/blender/status")


func import_asset_from_manifest(manifest: Dictionary) -> void:
	var artifact: Dictionary = manifest.get("artifact", {}) if manifest.get("artifact") is Dictionary else {}
	var url_path := str(artifact.get("url", ""))
	if url_path.is_empty():
		var asset_id := str(manifest.get("assetId", ""))
		if asset_id.is_empty():
			_status_label.text = "오류: 에셋 URL이 없습니다."
			return
		url_path = "/api/blender/assets/%s/model.glb" % asset_id
	_pending_manifest = manifest
	_status_label.text = "GLB 다운로드 및 씬 임포트 중…"
	var full_url := url_path if url_path.begins_with("http") else _origin + url_path
	var err := _http_glb.request(full_url)
	if err != OK:
		_status_label.text = "GLB 요청 실패 (code=%d)" % err


func _set_busy(busy: bool) -> void:
	_plan_btn.disabled = busy
	_generate_btn.disabled = busy


func _selected_engine_id() -> String:
	if _engine_option == null or _engine_option.selected < 0:
		return "blender-cli"
	return str(_engine_option.get_item_metadata(_engine_option.selected))


func _selected_ai_provider() -> String:
	if _ai_provider_option == null or _ai_provider_option.selected < 0:
		return "auto"
	return str(_ai_provider_option.get_item_metadata(_ai_provider_option.selected))


func _selected_ai_model() -> String:
	if _ai_model_option == null or _ai_model_option.selected < 0:
		return ""
	return str(_ai_model_option.get_item_metadata(_ai_model_option.selected))


func _on_ai_provider_selected(_index: int) -> void:
	_rebuild_model_options(_selected_ai_provider())


func _rebuild_model_options(provider_id: String) -> void:
	_ai_model_option.clear()
	if provider_id == "auto":
		_ai_model_option.add_item("자동 추천 모델", 0)
		_ai_model_option.set_item_metadata(0, "")
		return
	for p in _ai_providers:
		if p is Dictionary and str(p.get("id", "")) == provider_id:
			var models: Array = p.get("models", [])
			if models.is_empty():
				var def_m := str(p.get("defaultModel", ""))
				_ai_model_option.add_item(def_m if not def_m.is_empty() else "기본 모델", 0)
				_ai_model_option.set_item_metadata(0, def_m)
			else:
				for i in models.size():
					var m := str(models[i])
					_ai_model_option.add_item(m, i)
					_ai_model_option.set_item_metadata(i, m)
			return


func _on_plan_pressed() -> void:
	var prompt := _prompt_input.text.strip_edges()
	if prompt.is_empty():
		_status_label.text = "프롬프트를 입력해 주세요."
		return
	_set_busy(true)
	_request_kind = "plan"
	_status_label.text = "AI 작업 계획 수립 중…"
	var payload := {
		"prompt": prompt,
		"aiProvider": _selected_ai_provider(),
		"aiModel": _selected_ai_model(),
		"placement": {"position": [_pos_x.value, _pos_y.value, _pos_z.value]},
	}
	var err := _http_api.request(_origin + "/api/blender/plan", _csrf_headers(), HTTPClient.METHOD_POST, JSON.stringify(payload))
	if err != OK:
		_set_busy(false)
		_status_label.text = "계획 요청 실패 (code=%d)" % err


func _on_generate_pressed() -> void:
	var prompt := _prompt_input.text.strip_edges()
	if prompt.is_empty():
		_status_label.text = "프롬프트를 입력해 주세요."
		return
	_set_busy(true)
	_request_kind = "submit_job"
	_status_label.text = "AI 3D 설계 및 Headless Blender 작업 제출 중…"
	var payload := {
		"prompt": prompt,
		"engineId": _selected_engine_id(),
		"aiProvider": _selected_ai_provider(),
		"aiModel": _selected_ai_model(),
		"projectId": _project_id,
		"placement": {"position": [_pos_x.value, _pos_y.value, _pos_z.value]},
		"autoImport": true,
	}
	var err := _http_api.request(_origin + "/api/blender/jobs", _csrf_headers(), HTTPClient.METHOD_POST, JSON.stringify(payload))
	if err != OK:
		_set_busy(false)
		_status_label.text = "작업 제출 실패 (code=%d)" % err


func _poll_active_job() -> void:
	if _active_job_id.is_empty():
		return
	_request_kind = "poll_job"
	var err := _http_api.request(_origin + "/api/blender/jobs/" + _active_job_id)
	if err != OK:
		_set_busy(false)
		_status_label.text = "작업 상태 조회 실패 (code=%d)" % err


func _on_history_activated(index: int) -> void:
	if index < 0 or index >= _recent_assets.size():
		return
	var manifest: Dictionary = _recent_assets[index].duplicate(true)
	manifest["placement"] = {
		"position": [_pos_x.value, _pos_y.value, _pos_z.value],
		"rotationDeg": [0.0, 0.0, 0.0],
		"scale": [1.0, 1.0, 1.0],
		"parentPath": ".",
	}
	import_asset_from_manifest(manifest)


func _on_api_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var kind := _request_kind
	_request_kind = ""
	if result != HTTPRequest.RESULT_SUCCESS:
		_set_busy(false)
		_status_label.text = "서버 통신 실패 (result=%d)" % result
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if not parsed is Dictionary:
		_set_busy(false)
		_status_label.text = "응답 JSON 파싱 실패 (HTTP %d)" % response_code
		return

	if kind == "status":
		if bool(parsed.get("available", false)):
			var engines: Array = parsed.get("engines", [])
			var ver := "unknown"
			if not engines.is_empty() and engines[0] is Dictionary:
				ver = str(engines[0].get("version", "unknown"))
			_engine_badge.text = "● Headless Blender %s 준비됨 (독립 프로세스 · JSON IPC)" % ver
		else:
			_engine_badge.text = "○ Blender 엔진 미감지 (서버 설정 확인)"
		_request_kind = "models"
		_http_api.request(_origin + "/api/blender/models")
		return

	if kind == "models":
		_ai_providers = parsed.get("providers", []) if parsed.get("providers") is Array else []
		_ai_provider_option.clear()
		var rec: Dictionary = parsed.get("recommended", {}) if parsed.get("recommended") is Dictionary else {}
		_ai_provider_option.add_item("자동 (%s)" % str(rec.get("provider", "heuristic")), 0)
		_ai_provider_option.set_item_metadata(0, "auto")
		var idx := 1
		for p in _ai_providers:
			if p is Dictionary and bool(p.get("configured", false)):
				_ai_provider_option.add_item(str(p.get("label", p.get("id", ""))), idx)
				_ai_provider_option.set_item_metadata(idx, str(p.get("id", "")))
				idx += 1
		_rebuild_model_options("auto")
		return

	if response_code >= 400 or not bool(parsed.get("ok", false)):
		_set_busy(false)
		_status_label.text = "오류: " + str(parsed.get("error", "HTTP %d" % response_code))
		return

	if kind == "plan":
		_set_busy(false)
		var plan: Dictionary = parsed.get("plan", {})
		var steps: Array = plan.get("steps", [])
		_plan_box.text = "[계획] %s\n%s" % [str(plan.get("summary", "")), "\n".join(steps)]
		_status_label.text = "작업 계획 준비 완료. [생성 및 씬 배치]를 눌러 실행하세요."
	elif kind == "submit_job":
		var job: Dictionary = parsed.get("job", {})
		_active_job_id = str(job.get("id", ""))
		var st0 := str(job.get("status", ""))
		_status_label.text = "1단계: AI 모델이 3D 설계도 작성 중… (%s)" % _active_job_id if st0 == "planning" else "2단계: Headless Blender 실행 중… (%s)" % _active_job_id
		_poll_timer.start()
	elif kind == "poll_job":
		var job: Dictionary = parsed.get("job", {})
		var st := str(job.get("status", ""))
		if st == "planning" or st == "queued" or st == "running":
			_status_label.text = "1단계: AI 모델 3D 파트 설계 중…" if st == "planning" else "2단계: Headless Blender 메시 생성 중… (%s)" % st
			_poll_timer.start()
		elif st == "succeeded":
			_active_job_id = ""
			var asset: Dictionary = job.get("asset", {})
			_recent_assets.push_front(asset)
			_history_list.add_item("%s (%s)" % [str(asset.get("name", "Prop")), str(asset.get("assetId", ""))])
			import_asset_from_manifest(asset)
		else:
			_active_job_id = ""
			_set_busy(false)
			_status_label.text = "생성 실패: " + str(job.get("error", "Unknown error"))


func _on_glb_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_set_busy(false)
	if result != HTTPRequest.RESULT_SUCCESS or response_code >= 400:
		_status_label.text = "GLB 다운로드 실패 (HTTP %d)" % response_code
		return

	var scene_root: Node = EditorInterface.get_edited_scene_root() if _plugin != null else null
	var undo_redo: Object = _plugin.get_undo_redo() if _plugin != null else null
	var import_result := GlbImporter.import_glb_bytes_into_scene(body, _pending_manifest, scene_root, undo_redo)

	if _plugin != null:
		EditorInterface.get_resource_filesystem().scan()

	if not bool(import_result.get("ok", false)):
		_status_label.text = "임포트 실패: " + str(import_result.get("error", "Unknown"))
		return

	if bool(import_result.get("placed", false)):
		var placed_node: Node = import_result.get("node")
		if _plugin != null and placed_node != null:
			var selection := EditorInterface.get_selection()
			selection.clear()
			selection.add_node(placed_node)
		var metrics: Dictionary = _pending_manifest.get("metrics", {})
		_status_label.text = "완료! '%s' 배치됨 (%d tris · %s)" % [
			str(import_result.get("nodeName", "")),
			int(metrics.get("triangleCount", 0)),
			str(import_result.get("resGlbPath", "")),
		]
	else:
		_status_label.text = "GLB 저장 완료 (%s) — 3D 씬을 연 뒤 배치하세요." % str(import_result.get("resGlbPath", ""))

	asset_placed.emit(import_result)
