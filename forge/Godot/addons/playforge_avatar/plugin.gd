@tool
extends EditorPlugin

const AvatarCatalog = preload("res://addons/playforge_avatar/avatar_catalog.gd")
const SEALED_PREFIX := "res://addons/playforge_avatar/"
const SPAWN_SCRIPT := "res://addons/playforge_avatar/avatar_spawn.gd"
const PIE_PREF_PATH := "user://playforge_pie_avatar.cfg"

var _dock: VBoxContainer
var _mode_label: Label
var _pie_toggle: CheckButton
var _status_label: Label
var _integrity_label: Label
var _violation_count := 0


func _enter_tree() -> void:
	var spawn_script := ResourceLoader.load(SPAWN_SCRIPT) as Script
	if spawn_script != null:
		add_custom_type("PlayForgeAvatarSpawn", "Marker3D", spawn_script, null)
	resource_saved.connect(_on_resource_saved)
	scene_saved.connect(_on_scene_saved)
	_build_status_panel()
	_refresh_integrity_status()


func _exit_tree() -> void:
	remove_custom_type("PlayForgeAvatarSpawn")
	if resource_saved.is_connected(_on_resource_saved):
		resource_saved.disconnect(_on_resource_saved)
	if scene_saved.is_connected(_on_scene_saved):
		scene_saved.disconnect(_on_scene_saved)
	if _dock != null and is_instance_valid(_dock):
		remove_control_from_bottom_panel(_dock)
		_dock.queue_free()
	_dock = null


func _build_status_panel() -> void:
	_dock = VBoxContainer.new()
	_dock.name = "PlayForgeAvatarSeal"
	var title := Label.new()
	title.text = "PLAYFORGE AVATAR · SEALED RUNTIME (READ-ONLY)"
	title.add_theme_font_size_override("font_size", 14)
	_dock.add_child(title)

	var desc := Label.new()
	desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	desc.text = "UEFN 방식 아바타 런타임은 PlayHub 소유로 봉인되어 포지에서 직접 수정할 수 없습니다. PlayHub 퍼블리시 빌드에는 게임 모드에 맞는 필수 아바타가 자동 포함되며, 일반 표준 Godot 내보내기(.zip/웹)에는 아바타가 포함되지 않습니다. 아바타 잠시 숨기기는 최대 30초 이내로만 가능하며 만료 시 자동 복구되고 숨기지 않은 동안 초당 0.2초씩 충전됩니다."
	_dock.add_child(desc)

	_mode_label = Label.new()
	_mode_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dock.add_child(_mode_label)

	_pie_toggle = CheckButton.new()
	_pie_toggle.button_pressed = _load_pie_enabled()
	_update_pie_toggle_label(_pie_toggle.button_pressed)
	_pie_toggle.toggled.connect(_on_pie_toggle_changed)
	_dock.add_child(_pie_toggle)

	_integrity_label = Label.new()
	_integrity_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dock.add_child(_integrity_label)

	_status_label = Label.new()
	_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_status_label.text = "상태: 정상 봉인됨"
	_dock.add_child(_status_label)

	var verify_btn := Button.new()
	verify_btn.text = "무결성 다시 검사"
	verify_btn.pressed.connect(_refresh_integrity_status)
	_dock.add_child(verify_btn)

	add_control_to_bottom_panel(_dock, "Avatar (Sealed)")


func _refresh_integrity_status() -> void:
	_refresh_mode_summary()
	var catalog := AvatarCatalog.new()
	var report := catalog.verify_seal_manifest()
	if bool(report.get("ok", false)):
		var on_demand := int(report.get("onDemand", 0))
		if on_demand > 0:
			_integrity_label.text = "무결성 검증 통과 (%d개 파일 SHA-256 일치 · %d개 GLB 온디맨드 스트리밍 · 카탈로그 %s)" % [int(report.get("checked", 0)), on_demand, catalog.get_catalog_version()]
		else:
			_integrity_label.text = "무결성 검증 통과 (%d개 파일 SHA-256 일치 · 카탈로그 %s)" % [int(report.get("checked", 0)), catalog.get_catalog_version()]
	else:
		var bad: Array = report.get("mismatches", []) + report.get("missing", [])
		_integrity_label.text = "경고: 봉인 경로 변조 감지 (%s). 저장·빌드 시 서버 정규본으로 자동 복원됩니다." % ", ".join(bad.slice(0, 3))


func _refresh_mode_summary() -> void:
	if _mode_label == null:
		return
	var mode := int(ProjectSettings.get_setting("playforge/avatar/presentation_mode", 0))
	var mode_names: Array[String] = ["3D 월드 아바타 (WORLD_3D)", "3D 상반신 초상 UI (PORTRAIT_UPPER_BODY)", "3D 전신 초상 UI (PORTRAIT_FULL_BODY)", "3D 월드 + 상반신 초상 (WORLD_3D_WITH_PORTRAIT)"]
	var corner_names: Array[String] = ["좌하단", "우상단", "우하단", "좌상단(HUD 아래)", "지정 좌표"]
	var mode_label: String = mode_names[clampi(mode, 0, mode_names.size() - 1)]
	if mode == 0:
		var sp: Variant = ProjectSettings.get_setting("playforge/avatar/spawn_position", Vector3(0.0, 0.2, 0.0))
		var binding := str(ProjectSettings.get_setting("playforge/avatar/world_binding", "standalone"))
		_mode_label.text = "현재 템플릿 아바타: %s · 배치 %s · 스폰 %s" % [mode_label, binding, str(sp)]
	else:
		var corner := int(ProjectSettings.get_setting("playforge/avatar/portrait_corner", 0))
		var sz: Variant = ProjectSettings.get_setting("playforge/avatar/portrait_size", Vector2(160.0, 240.0) if mode == 2 else Vector2(128.0, 128.0))
		var cname: String = corner_names[clampi(corner, 0, corner_names.size() - 1)]
		var sz_v: Vector2 = sz if sz is Vector2 else Vector2(128.0, 128.0)
		_mode_label.text = "현재 템플릿 아바타: %s · 위치 %s · 크기 %dx%d" % [mode_label, cname, int(sz_v.x), int(sz_v.y)]


func _load_pie_enabled() -> bool:
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		var web_val: Variant = JavaScriptBridge.eval("typeof window.__playforgeGetPieAvatarEnabled === 'function' ? window.__playforgeGetPieAvatarEnabled() : false", true)
		if web_val is bool:
			return web_val
	var cfg := ConfigFile.new()
	if cfg.load(PIE_PREF_PATH) == OK:
		return bool(cfg.get_value("pie", "avatar_and_hud_enabled", false))
	return false


func _update_pie_toggle_label(enabled: bool) -> void:
	if _pie_toggle == null:
		return
	_pie_toggle.text = "PIE 실행 미리보기: ON (실험기능 · 플랫폼 아바타+좌상단 HUD 적용)" if enabled else "PIE 실행 미리보기: OFF (기본값 · 실험기능 비활성)"


func _on_pie_toggle_changed(enabled: bool) -> void:
	_update_pie_toggle_label(enabled)
	var cfg := ConfigFile.new()
	cfg.set_value("pie", "avatar_and_hud_enabled", enabled)
	cfg.save(PIE_PREF_PATH)
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		JavaScriptBridge.eval("window.__playforgeSetPieAvatarEnabled && window.__playforgeSetPieAvatarEnabled(%s);" % ("true" if enabled else "false"), true)


func _on_resource_saved(resource: Resource) -> void:
	if resource == null:
		return
	var path := str(resource.resource_path)
	if path.to_lower().begins_with(SEALED_PREFIX):
		_flag_sealed_violation(path)


func _on_scene_saved(scene_path: String) -> void:
	if scene_path.to_lower().begins_with(SEALED_PREFIX):
		_flag_sealed_violation(scene_path)


func _flag_sealed_violation(path: String) -> void:
	_violation_count += 1
	var message := "PlayForge Avatar 봉인 경로(%s)는 포지에서 수정할 수 없습니다. 서버 저장이 차단되며 빌드/실행 시 정규본이 강제 주입됩니다." % path
	push_warning(message)
	if _status_label != null:
		_status_label.text = "차단됨 (#%d): %s" % [_violation_count, message]
	_refresh_integrity_status()
