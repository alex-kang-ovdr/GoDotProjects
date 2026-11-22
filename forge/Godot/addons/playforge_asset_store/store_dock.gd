@tool
extends VBoxContainer

signal dock_slot_requested(slot_mode: String)
signal library_refreshed(entries: Array)
signal plan_reviewed(plan: Dictionary)
signal package_applied(receipt: Dictionary)
signal operation_failed(error: Dictionary)

const PackageInstaller := preload("package_installer.gd")
const LOCAL_LIBRARY_FILE := "res://.playforge-store-library.json"
const SLOT_MODES := ["right", "left", "bottom"]
const SLOT_LABELS := ["우측 도크", "좌측 도크", "하단 패널"]
const STATE_LABELS := {
	"catalog_listed": "카탈로그",
	"saved_to_library": "라이브러리 저장됨",
	"license_verified": "권한 확인됨",
	"artifact_downloaded": "스테이징 검증됨",
	"plan_reviewed": "설치 계획 검토됨",
	"applied_to_project": "프로젝트에 적용됨",
	"update_available": "업데이트 가능",
}

var installer := PackageInstaller.new()
var store_web_url := "http://127.0.0.1:4173/store"
var store_api_url := "http://127.0.0.1:4173/api/asset-library/store"
var account_id := "default"
var staging_root := "user://playforge-store-staging"
var selected_project_id := "current"
var selected_project_root := "res://"

var _targets: Array[Dictionary] = [{"id": "current", "name": "현재 프로젝트 (res://)", "root": "res://"}]
var _library_entries: Array[Dictionary] = []
var _filtered_entries: Array[Dictionary] = []
var _artifact_cache := {}
var _staged_dirs := {}
var _selected_asset_id := ""
var _current_plan: Dictionary = {}
var _current_stage := ""
var _slot_mode := "right"
var _built := false
var _busy := false
var _shell_open_handler: Callable = Callable()
var _filesystem_scan_handler: Callable = Callable()

var _slot_selector: OptionButton
var _open_web_btn: Button
var _refresh_btn: Button
var _project_selector: OptionButton
var _search_input: LineEdit
var _kind_filter: OptionButton
var _library_list: ItemList
var _detail_title: Label
var _detail_meta: Label
var _detail_compat: Label
var _detail_state: Label
var _editorial_notice: Label
var _review_btn: Button
var _overwrite_check: CheckBox
var _apply_btn: Button
var _plan_summary: Label
var _status_label: Label
var _http: HTTPRequest
var _http_kind := ""
var _pending_review_entry: Dictionary = {}
var _pending_review_dependencies: Array = []


func _ready() -> void:
	if _built:
		return
	_built = true
	name = "PlayForgeStoreDock"
	var scale_factor := _editor_scale()
	custom_minimum_size = Vector2(260 * scale_factor, 220 * scale_factor)
	add_theme_constant_override(&"separation", roundi(6 * scale_factor))
	_build_ui(scale_factor)
	_http = HTTPRequest.new()
	_http.timeout = 15.0
	_http.max_redirects = 0
	_http.body_size_limit = 16 * 1024 * 1024
	add_child(_http)
	_http.request_completed.connect(_on_http_completed)
	_sync_project_selector()
	_sync_slot_selector()
	_refresh_filtered_list()


func _build_ui(scale_factor: float) -> void:
	var header := HBoxContainer.new()
	add_child(header)

	var heading := Label.new()
	heading.text = "PLAYFORGE STORE"
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(heading)

	_slot_selector = OptionButton.new()
	_slot_selector.name = "DockSlotSelector"
	_slot_selector.tooltip_text = "도크 위치 전환 (좌/우/하단)"
	for label in SLOT_LABELS:
		_slot_selector.add_item(label)
	_slot_selector.item_selected.connect(_on_slot_selected)
	header.add_child(_slot_selector)

	var actions := HBoxContainer.new()
	add_child(actions)

	_open_web_btn = Button.new()
	_open_web_btn.name = "OpenStoreWeb"
	_open_web_btn.text = "스토어 웹 열기"
	_open_web_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_open_web_btn.pressed.connect(func() -> void: open_store_web())
	actions.add_child(_open_web_btn)

	_refresh_btn = Button.new()
	_refresh_btn.name = "RefreshLibrary"
	_refresh_btn.text = "내 라이브러리 새로고침"
	_refresh_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_refresh_btn.pressed.connect(func() -> void: refresh_library())
	actions.add_child(_refresh_btn)

	var project_row := HBoxContainer.new()
	add_child(project_row)
	var proj_label := Label.new()
	proj_label.text = "대상 프로젝트"
	project_row.add_child(proj_label)
	_project_selector = OptionButton.new()
	_project_selector.name = "TargetProjectSelector"
	_project_selector.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_project_selector.item_selected.connect(_on_project_selected)
	project_row.add_child(_project_selector)

	var filter_row := HBoxContainer.new()
	add_child(filter_row)
	_search_input = LineEdit.new()
	_search_input.name = "LibrarySearch"
	_search_input.placeholder_text = "내 라이브러리 검색..."
	_search_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_search_input.text_changed.connect(func(_text: String) -> void: _refresh_filtered_list())
	filter_row.add_child(_search_input)

	_kind_filter = OptionButton.new()
	_kind_filter.name = "KindFilter"
	_kind_filter.add_item("전체")
	_kind_filter.add_item("package")
	_kind_filter.add_item("editorial")
	_kind_filter.item_selected.connect(func(_idx: int) -> void: _refresh_filtered_list())
	filter_row.add_child(_kind_filter)

	_library_list = ItemList.new()
	_library_list.name = "LibraryList"
	_library_list.custom_minimum_size = Vector2(0, roundi(120 * scale_factor))
	_library_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_library_list.item_selected.connect(_on_item_selected)
	add_child(_library_list)

	var detail_box := VBoxContainer.new()
	detail_box.name = "DetailSection"
	detail_box.add_theme_constant_override(&"separation", roundi(4 * scale_factor))
	add_child(detail_box)

	_detail_title = Label.new()
	_detail_title.name = "DetailTitle"
	_detail_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_box.add_child(_detail_title)

	_detail_meta = Label.new()
	_detail_meta.name = "DetailMeta"
	_detail_meta.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_box.add_child(_detail_meta)

	_detail_compat = Label.new()
	_detail_compat.name = "DetailCompat"
	_detail_compat.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_box.add_child(_detail_compat)

	_detail_state = Label.new()
	_detail_state.name = "DetailState"
	_detail_state.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_box.add_child(_detail_state)

	_editorial_notice = Label.new()
	_editorial_notice.name = "EditorialNotice"
	_editorial_notice.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_editorial_notice.text = "일반 콘텐츠(editorial)는 패키지 설치 대상이 아니며 웹 브라우저에서 열람합니다."
	_editorial_notice.visible = false
	detail_box.add_child(_editorial_notice)

	var apply_controls := HBoxContainer.new()
	detail_box.add_child(apply_controls)

	_review_btn = Button.new()
	_review_btn.name = "ReviewPlan"
	_review_btn.text = "설치 계획 검토"
	_review_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_review_btn.pressed.connect(func() -> void: review_selected_package())
	apply_controls.add_child(_review_btn)

	_apply_btn = Button.new()
	_apply_btn.name = "ApplyProject"
	_apply_btn.text = "선택 프로젝트에 적용"
	_apply_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_apply_btn.disabled = true
	_apply_btn.pressed.connect(func() -> void: apply_selected_package())
	apply_controls.add_child(_apply_btn)

	_overwrite_check = CheckBox.new()
	_overwrite_check.name = "AllowConflictOverwrite"
	_overwrite_check.text = "충돌 파일 덮어쓰기 허용"
	_overwrite_check.toggled.connect(func(_pressed: bool) -> void: _update_detail_view())
	detail_box.add_child(_overwrite_check)

	_plan_summary = Label.new()
	_plan_summary.name = "PlanSummary"
	_plan_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_box.add_child(_plan_summary)

	_status_label = Label.new()
	_status_label.name = "StoreStatus"
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status_label.text = "Store 웹에서 라이브러리에 저장한 항목을 새로고침하여 확인하세요."
	add_child(_status_label)


func _editor_scale() -> float:
	if Engine.is_editor_hint() and Engine.has_singleton(&"EditorInterface"):
		var iface: Object = Engine.get_singleton(&"EditorInterface")
		if iface != null and iface.has_method(&"get_editor_scale"):
			return float(iface.call(&"get_editor_scale"))
	return 1.0


func _scan_project_filesystem() -> void:
	if _filesystem_scan_handler.is_valid():
		_filesystem_scan_handler.call()
		return
	if Engine.is_editor_hint() and Engine.has_singleton(&"EditorInterface"):
		var iface: Object = Engine.get_singleton(&"EditorInterface")
		if iface != null and iface.has_method(&"get_resource_filesystem"):
			var fs: Object = iface.call(&"get_resource_filesystem")
			if fs != null and fs.has_method(&"scan"):
				fs.call(&"scan")


func set_endpoints(web_url: String, api_url: String) -> void:
	if not web_url.is_empty():
		store_web_url = web_url.trim_suffix("/")
	if not api_url.is_empty():
		store_api_url = api_url.trim_suffix("/")


func set_account_id(value: String) -> void:
	var trimmed := value.strip_edges()
	if not trimmed.is_empty():
		account_id = trimmed


func set_staging_root(path_value: String) -> void:
	if not path_value.is_empty():
		staging_root = path_value


func set_shell_open_handler(handler: Callable) -> void:
	_shell_open_handler = handler


func set_filesystem_scan_handler(handler: Callable) -> void:
	_filesystem_scan_handler = handler


func set_slot_mode(slot_mode: String) -> void:
	if slot_mode in SLOT_MODES:
		_slot_mode = slot_mode
		_sync_slot_selector()


func set_target_projects(projects: Array) -> void:
	_targets.clear()
	for proj in projects:
		if proj is Dictionary and not str(proj.get("id", "")).is_empty() and not str(proj.get("root", "")).is_empty():
			_targets.append({
				"id": str(proj.id),
				"name": str(proj.get("name", proj.id)),
				"root": str(proj.root),
			})
	if _targets.is_empty():
		_targets.append({"id": "current", "name": "현재 프로젝트 (res://)", "root": "res://"})
	var found := false
	for proj in _targets:
		if proj.id == selected_project_id:
			selected_project_root = proj.root
			found = true
			break
	if not found:
		selected_project_id = _targets[0].id
		selected_project_root = _targets[0].root
	_clear_plan()
	_sync_project_selector()
	_refresh_filtered_list()


func select_project(project_id: String) -> bool:
	for idx in range(_targets.size()):
		if _targets[idx].id == project_id:
			selected_project_id = _targets[idx].id
			selected_project_root = _targets[idx].root
			_clear_plan()
			if _project_selector != null:
				_project_selector.select(idx)
			_recompute_local_states()
			_refresh_filtered_list()
			return true
	return false


func set_library_entries(entries: Array) -> void:
	_library_entries.clear()
	for entry in entries:
		if entry is Dictionary:
			_library_entries.append(entry.duplicate(true))
	_clear_plan()
	_recompute_local_states()
	_refresh_filtered_list()
	library_refreshed.emit(_library_entries.duplicate(true))


func set_staged_artifact_bytes(release_id: String, bytes: PackedByteArray) -> void:
	_artifact_cache[release_id] = bytes


func open_store_web() -> Dictionary:
	var target_url := store_web_url
	var active := get_selected_entry()
	if not active.is_empty():
		var asset_id := str(active.get("asset_id", ""))
		if not asset_id.is_empty():
			target_url = "%s?asset=%s" % [store_web_url, asset_id.uri_encode()]
	var err := OK
	if _shell_open_handler.is_valid():
		var res: Variant = _shell_open_handler.call(target_url)
		err = int(res) if res is int else OK
	elif OS.has_feature("web"):
		var opened: Variant = JavaScriptBridge.eval("Boolean(window.open(%s, '_blank', 'noopener'))" % JSON.stringify(target_url), true)
		if not bool(opened):
			err = ERR_CANT_OPEN
	else:
		err = OS.shell_open(target_url)
	if err == OK:
		_set_status("브라우저에서 Store 웹 열기 요청: " + target_url)
		return {"ok": true, "url": target_url}
	if DisplayServer.has_feature(DisplayServer.FEATURE_CLIPBOARD):
		DisplayServer.clipboard_set(target_url)
	_set_status("브라우저 열기 실패(코드 %d). URL을 클립보드에 복사했습니다: %s" % [err, target_url])
	return {"ok": false, "url": target_url, "error": err}


func refresh_library() -> void:
	if FileAccess.file_exists(LOCAL_LIBRARY_FILE) and store_api_url.is_empty():
		_load_local_library_file()
		return
	if _http != null and not store_api_url.is_empty() and not _busy:
		_busy = true
		_http_kind = "library"
		_set_status("내 라이브러리 새로고침 중…")
		var query_url := "%s/library?account_id=%s&project_id=%s" % [
			store_api_url,
			account_id.uri_encode(),
			selected_project_id.uri_encode(),
		]
		var err := _http.request(query_url)
		if err == OK:
			return
		_busy = false
		_http_kind = ""
		_set_status("라이브러리 HTTP 요청 실패(코드 %d)." % err)
	if FileAccess.file_exists(LOCAL_LIBRARY_FILE):
		_load_local_library_file()
	else:
		_recompute_local_states()
		_refresh_filtered_list()
		library_refreshed.emit(_library_entries.duplicate(true))


func _load_local_library_file() -> void:
	var raw := FileAccess.get_file_as_string(LOCAL_LIBRARY_FILE)
	var parsed: Variant = JSON.parse_string(raw)
	if parsed is Dictionary and parsed.get("entries") is Array:
		set_library_entries(parsed.entries)
		_set_status("로컬 Store 라이브러리 %d건 로드 완료." % _library_entries.size())
	elif parsed is Array:
		set_library_entries(parsed)
		_set_status("로컬 Store 라이브러리 %d건 로드 완료." % _library_entries.size())
	else:
		_set_status("로컬 Store 라이브러리 파일 형식이 올바르지 않습니다.")


func get_selected_entry() -> Dictionary:
	if _selected_asset_id.is_empty():
		return _filtered_entries[0] if not _filtered_entries.is_empty() else {}
	for entry in _filtered_entries:
		if str(entry.get("asset_id", "")) == _selected_asset_id:
			return entry
	for entry in _library_entries:
		if str(entry.get("asset_id", "")) == _selected_asset_id:
			return entry
	return {}


func select_asset(asset_id: String) -> bool:
	for idx in range(_filtered_entries.size()):
		if str(_filtered_entries[idx].get("asset_id", "")) == asset_id:
			_selected_asset_id = asset_id
			_clear_plan()
			if _library_list != null:
				_library_list.select(idx)
			_update_detail_view()
			return true
	return false


func review_selected_package(target_engine: String = "", target_platform: String = "", dependencies: Array = [], usage_grants: Dictionary = {}) -> Dictionary:
	var entry := get_selected_entry()
	if entry.is_empty():
		var err := {"ok": false, "code": "NO_SELECTION", "error": "검토할 라이브러리 항목을 선택하세요."}
		_set_status(err.error)
		operation_failed.emit(err)
		return err

	# Stage 1: Library verification
	var s1 := installer.stage_1_verify_library_entry(entry, _library_entries)
	if not s1.ok:
		_set_status(str(s1.get("error", "라이브러리 검증 실패")))
		operation_failed.emit(s1)
		return s1

	# Stage 2: Usage grant / editorial rejection / compatibility check
	var s2 := installer.stage_2_verify_license(entry, target_engine, target_platform, usage_grants)
	if not s2.ok:
		_current_stage = "editorial_blocked" if s2.get("code") == "EDITORIAL_NOT_INSTALLABLE" else "error"
		_set_status(str(s2.get("error", "사용 권한/호환성 검증 실패")))
		_update_detail_view()
		operation_failed.emit(s2)
		return s2

	var release_id := str(entry.get("release_id", ""))
	if not _artifact_cache.has(release_id):
		if _http != null and not store_api_url.is_empty() and not _busy:
			_busy = true
			_http_kind = "artifact"
			_pending_review_entry = entry.duplicate(true)
			_pending_review_dependencies = dependencies.duplicate(true)
			_set_status("패키지 아티팩트 다운로드 및 SHA-256 검증 중…")
			var artifact_url := "%s/artifacts/%s" % [store_api_url, release_id.uri_encode()]
			var req_err := _http.request(artifact_url)
			if req_err == OK:
				return {"ok": true, "pending": true, "store_state": "license_verified"}
			_busy = false
			_http_kind = ""
			_pending_review_entry = {}
			_pending_review_dependencies = []
		var missing := {"ok": false, "code": "ARTIFACT_NOT_AVAILABLE", "error": "아티팩트 바이트를 내려받지 못했습니다."}
		_set_status(missing.error)
		operation_failed.emit(missing)
		return missing

	return _complete_review_with_bytes(entry, _artifact_cache[release_id], dependencies)


func _complete_review_with_bytes(entry: Dictionary, artifact_bytes: PackedByteArray, dependencies: Array = []) -> Dictionary:
	# Stage 3: SHA-256 digest verification & staging outside active project
	var s3 := installer.stage_3_verify_and_stage_artifact(entry, artifact_bytes, staging_root)
	if not s3.ok:
		_clear_plan()
		_current_stage = "error"
		_set_status(str(s3.get("error", "아티팩트 SHA-256 검증 실패")))
		_update_detail_view()
		operation_failed.emit(s3)
		return s3

	var release_id := str(entry.get("release_id", ""))
	_staged_dirs[release_id] = str(s3.staged_dir)

	# Stage 4: Install plan, conflict & dependency review on selected project only
	var s4 := installer.stage_4_review_install_plan(entry, selected_project_id, selected_project_root, dependencies)
	if not s4.ok:
		_clear_plan()
		_current_stage = "error"
		_set_status(str(s4.get("error", "설치 계획 검토 실패")))
		_update_detail_view()
		operation_failed.emit(s4)
		return s4

	_current_plan = s4
	_current_stage = "plan_reviewed"
	_update_detail_view()
	var conflicts_count: int = s4.conflicts.size()
	if conflicts_count > 0:
		_set_status("설치 계획 검토 완료: 충돌 %d건 감지. 덮어쓰기 허용 또는 확인 후 적용하세요." % conflicts_count)
	else:
		_set_status("설치 계획 검토 완료: %s에 %d개 파일 적용 준비됨." % [selected_project_id, s4.additions.size()])
	plan_reviewed.emit(s4.duplicate(true))
	return s4


func apply_selected_package(allow_overwrite_override: Variant = null) -> Dictionary:
	var entry := get_selected_entry()
	if entry.is_empty():
		var err := {"ok": false, "code": "NO_SELECTION", "error": "적용할 패키지를 선택하세요."}
		_set_status(err.error)
		operation_failed.emit(err)
		return err
	var editorial := PackageInstaller.reject_editorial_install(entry)
	if editorial.rejected:
		_set_status(str(editorial.error))
		operation_failed.emit(editorial)
		return editorial
	if _current_plan.is_empty() or str(_current_plan.get("store_state", "")) != "plan_reviewed":
		var not_reviewed := {"ok": false, "code": "PLAN_NOT_REVIEWED", "error": "먼저 '설치 계획 검토'를 실행하세요."}
		_set_status(not_reviewed.error)
		operation_failed.emit(not_reviewed)
		return not_reviewed

	var release_id := str(entry.get("release_id", ""))
	var staged_dir := str(_staged_dirs.get(release_id, ""))
	var overwrite: bool = bool(allow_overwrite_override) if allow_overwrite_override is bool else (_overwrite_check != null and _overwrite_check.button_pressed)

	# Stage 5: Apply only to selected project & record installation_record
	var s5 := installer.stage_5_apply_install_plan(entry, _current_plan, staged_dir, selected_project_id, selected_project_root, overwrite)
	if not s5.ok:
		_set_status(str(s5.get("error", "프로젝트 적용 실패")))
		operation_failed.emit(s5)
		return s5

	_current_stage = "applied_to_project"
	_current_plan = {}
	_recompute_local_states()
	_refresh_filtered_list()
	_scan_project_filesystem()
	_set_status("%s에 %s v%s 적용 완료 (파일 %d개)." % [
		selected_project_id,
		str(entry.get("asset_id", "")),
		str(entry.get("asset_version_id", "")),
		s5.written_files.size(),
	])
	package_applied.emit(s5.duplicate(true))
	return s5


func _on_http_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var kind := _http_kind
	var pending_entry := _pending_review_entry.duplicate(true)
	var pending_deps := _pending_review_dependencies.duplicate(true)
	_busy = false
	_http_kind = ""
	_pending_review_entry = {}
	_pending_review_dependencies = []

	if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
		var err := {"ok": false, "code": "HTTP_ERROR", "status": response_code, "error": "Store 서버 요청 실패 (HTTP %d, transport %d)." % [response_code, result]}
		_set_status(err.error)
		operation_failed.emit(err)
		return

	if kind == "library":
		var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
		if parsed is Dictionary and parsed.get("entries") is Array:
			if not str(parsed.get("store_web_url", "")).is_empty():
				store_web_url = str(parsed.store_web_url)
			set_library_entries(parsed.entries)
			_set_status("내 라이브러리 %d건을 새로고침했습니다." % _library_entries.size())
		else:
			var bad_json := {"ok": false, "code": "INVALID_LIBRARY_RESPONSE", "error": "Store 라이브러리 응답 형식이 올바르지 않습니다."}
			_set_status(bad_json.error)
			operation_failed.emit(bad_json)
	elif kind == "artifact":
		var release_id := str(pending_entry.get("release_id", ""))
		_artifact_cache[release_id] = body
		_complete_review_with_bytes(pending_entry, body, pending_deps)


func _recompute_local_states() -> void:
	var records := PackageInstaller.read_installation_records(selected_project_root)
	for idx in range(_library_entries.size()):
		var item: Dictionary = _library_entries[idx]
		var asset_id := str(item.get("asset_id", ""))
		if str(item.get("release_kind", "")) == "package" and records.has(asset_id):
			var rec: Dictionary = records[asset_id]
			if str(rec.get("project_id", "")) == selected_project_id and str(rec.get("status", "")) == "applied":
				var s6 := installer.stage_6_check_update(rec, item)
				item["installation_record"] = rec
				item["store_state"] = s6.store_state
				item["update_info"] = s6
				continue
		if item.get("installation_record", null) != null:
			var rec_existing: Variant = item.get("installation_record")
			if rec_existing is Dictionary and str(rec_existing.get("project_id", "")) != selected_project_id:
				item["installation_record"] = null
				item["store_state"] = "saved_to_library"


func _refresh_filtered_list() -> void:
	_filtered_entries.clear()
	var query := _search_input.text.strip_edges().to_lower() if _search_input != null else ""
	var kind_val := "all"
	if _kind_filter != null and _kind_filter.selected > 0:
		kind_val = _kind_filter.get_item_text(_kind_filter.selected)
	for item in _library_entries:
		var kind := str(item.get("release_kind", ""))
		if kind_val != "all" and kind != kind_val:
			continue
		if not query.is_empty():
			var haystack := "%s %s %s" % [str(item.get("title", "")), str(item.get("asset_id", "")), str(item.get("summary", ""))]
			if not haystack.to_lower().contains(query):
				continue
		_filtered_entries.append(item)

	if _library_list != null:
		_library_list.clear()
		var target_idx := -1
		for idx in range(_filtered_entries.size()):
			var entry: Dictionary = _filtered_entries[idx]
			var state_key := str(entry.get("store_state", "saved_to_library"))
			var state_txt := str(STATE_LABELS.get(state_key, state_key))
			var row_label := "[%s] %s · v%s (%s)" % [
				str(entry.get("release_kind", "")),
				str(entry.get("title", entry.get("asset_id", ""))),
				str(entry.get("asset_version_id", "0.0.0")),
				state_txt,
			]
			_library_list.add_item(row_label)
			if str(entry.get("asset_id", "")) == _selected_asset_id:
				target_idx = idx
		if target_idx < 0 and not _filtered_entries.is_empty():
			target_idx = 0
			_selected_asset_id = str(_filtered_entries[0].get("asset_id", ""))
		if target_idx >= 0:
			_library_list.select(target_idx)
	_update_detail_view()


func _update_detail_view() -> void:
	if not _built:
		return
	var entry := get_selected_entry()
	if entry.is_empty():
		_detail_title.text = "선택된 항목 없음"
		_detail_meta.text = "라이브러리를 새로고침하거나 Store 웹에서 패키지를 저장하세요."
		_detail_compat.text = ""
		_detail_state.text = ""
		_editorial_notice.visible = false
		_review_btn.visible = true
		_review_btn.disabled = true
		_apply_btn.visible = true
		_apply_btn.disabled = true
		_overwrite_check.visible = false
		_plan_summary.text = ""
		return

	var is_ed := PackageInstaller.is_editorial(entry)
	var version_str := str(entry.get("asset_version_id", ""))
	var release_id := str(entry.get("release_id", ""))
	var kind := str(entry.get("release_kind", ""))
	_detail_title.text = "%s (%s)" % [str(entry.get("title", "")), str(entry.get("asset_id", ""))]
	_detail_meta.text = "유형: %s · 버전: v%s · 릴리스: %s" % [kind, version_str, release_id]

	if is_ed:
		_detail_compat.text = "대상: 일반 문서/가이드 콘텐츠"
		_detail_state.text = "상태: %s (설치 불가)" % str(STATE_LABELS.get(str(entry.get("store_state", "")), "카탈로그"))
		_editorial_notice.visible = true
		_review_btn.visible = false
		_apply_btn.visible = false
		_overwrite_check.visible = false
		_plan_summary.text = ""
		return

	var compat: Dictionary = entry.get("engine_compatibility", {})
	var plats: Array = compat.get("platforms", [])
	var digest := str(entry.get("artifact_digest", ""))
	var short_digest := digest.left(20) + "…" + digest.right(6) if digest.length() > 28 else digest
	_detail_compat.text = "호환성: Godot %s+ (검증 %s) · %s · digest: %s" % [
		str(compat.get("godot_min", "?")),
		str(compat.get("godot_tested", "?")),
		", ".join(plats),
		short_digest,
	]
	var effective_state := _current_stage if not _current_stage.is_empty() else str(entry.get("store_state", "saved_to_library"))
	_detail_state.text = "상태: %s · 대상 프로젝트: %s" % [str(STATE_LABELS.get(effective_state, effective_state)), selected_project_id]
	_editorial_notice.visible = false
	_review_btn.visible = true
	_review_btn.disabled = false
	_apply_btn.visible = true
	_overwrite_check.visible = true

	if _current_plan.is_empty():
		_apply_btn.disabled = true
		_plan_summary.text = "설치 전 '설치 계획 검토'를 눌러 해시 검증과 충돌 파일을 확인하세요."
	else:
		var conflicts: Array = _current_plan.get("conflicts", [])
		var additions: Array = _current_plan.get("additions", [])
		var unchanged: Array = _current_plan.get("unchanged", [])
		var exec_addons: Array = _current_plan.get("executable_addons", [])
		var missing_deps: Array = _current_plan.get("missing_dependencies", [])
		var can_apply := bool(_current_plan.get("can_apply", false)) and (conflicts.is_empty() or _overwrite_check.button_pressed)
		_apply_btn.disabled = not can_apply
		_plan_summary.text = "계획(%s): 추가 %d · 동일 %d · 충돌 %d · 실행 Addon %d · 누락 의존성 %d" % [
			selected_project_id,
			additions.size(),
			unchanged.size(),
			conflicts.size(),
			exec_addons.size(),
			missing_deps.size(),
		]


func _clear_plan() -> void:
	_current_plan = {}
	_current_stage = ""
	if _overwrite_check != null:
		_overwrite_check.button_pressed = false


func _on_slot_selected(index: int) -> void:
	if index >= 0 and index < SLOT_MODES.size():
		var next_mode: String = SLOT_MODES[index]
		if next_mode != _slot_mode:
			_slot_mode = next_mode
			dock_slot_requested.emit(next_mode)


func _on_project_selected(index: int) -> void:
	if index >= 0 and index < _targets.size():
		select_project(_targets[index].id)


func _on_item_selected(index: int) -> void:
	if index >= 0 and index < _filtered_entries.size():
		_selected_asset_id = str(_filtered_entries[index].get("asset_id", ""))
		_clear_plan()
		_update_detail_view()


func _sync_project_selector() -> void:
	if _project_selector == null:
		return
	_project_selector.clear()
	var selected_idx := 0
	for idx in range(_targets.size()):
		_project_selector.add_item(_targets[idx].name)
		if _targets[idx].id == selected_project_id:
			selected_idx = idx
	_project_selector.select(selected_idx)


func _sync_slot_selector() -> void:
	if _slot_selector == null:
		return
	var idx := SLOT_MODES.find(_slot_mode)
	if idx >= 0:
		_slot_selector.select(idx)


func _set_status(message: String) -> void:
	if _status_label != null:
		_status_label.text = message


func get_diagnostics() -> Dictionary:
	return {
		"slot_mode": _slot_mode,
		"account_id": account_id,
		"store_web_url": store_web_url,
		"store_api_url": store_api_url,
		"selected_project_id": selected_project_id,
		"selected_project_root": selected_project_root,
		"selected_asset_id": _selected_asset_id,
		"search_query": _search_input.text if _search_input != null else "",
		"library_count": _library_entries.size(),
		"filtered_count": _filtered_entries.size(),
		"has_reviewed_plan": not _current_plan.is_empty(),
		"review_visible": _review_btn.visible if _review_btn != null else false,
		"apply_visible": _apply_btn.visible if _apply_btn != null else false,
		"apply_disabled": _apply_btn.disabled if _apply_btn != null else true,
		"status_text": _status_label.text if _status_label != null else "",
	}
