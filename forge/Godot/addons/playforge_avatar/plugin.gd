@tool
extends EditorPlugin

const AvatarCatalog = preload("res://addons/playforge_avatar/avatar_catalog.gd")
const SEALED_PREFIX := "res://addons/playforge_avatar/"
const SPAWN_SCRIPT := "res://addons/playforge_avatar/avatar_spawn.gd"

var _dock: VBoxContainer
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
	desc.text = "UEFN 방식 아바타 런타임은 PlayHub 소유로 봉인되어 포지에서 직접 수정할 수 없습니다. 씬에는 PlayForgeAvatarSpawn 노드를 배치해 TPS/FPS/TopDown 로코모션과 래그돌 설정만 지정하세요. 스킨·장착물·이모지는 PlayHub 아바타 락커(/?view=avatar)에서 구매 및 장착합니다."
	_dock.add_child(desc)

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
	var catalog := AvatarCatalog.new()
	var report := catalog.verify_seal_manifest()
	if bool(report.get("ok", false)):
		_integrity_label.text = "무결성 검증 통과 (%d개 파일 SHA-256 일치 · 카탈로그 %s)" % [int(report.get("checked", 0)), catalog.get_catalog_version()]
	else:
		var bad: Array = report.get("mismatches", []) + report.get("missing", [])
		_integrity_label.text = "경고: 봉인 경로 변조 감지 (%s). 저장·빌드 시 서버 정규본으로 자동 복원됩니다." % ", ".join(bad.slice(0, 3))


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
