extends SceneTree

const DeveloperModeScript = preload("res://scripts/developer_mode.gd")
var failures: Array[String] = []
var selected := ""

func expect(condition: bool, label: String) -> void:
	if condition:
		print("[PASS] ", label)
	else:
		failures.append(label)
		push_error("[FAIL] " + label)

func _init() -> void:
	call_deferred("run_test")

func run_test() -> void:
	var overlay = DeveloperModeScript.new()
	get_root().add_child(overlay)
	overlay.mode_selected.connect(func(mode: String): selected = mode)
	await process_frame
	var definitions: Array = overlay._mode_definitions()
	expect(definitions.size() == 4, "개발자 모드 4개 선택 메뉴")
	expect(definitions.all(func(item): return item.has("id") and item.has("title") and item.has("description")), "개발자 모드 버튼 메타데이터")
	overlay.select_mode(DeveloperModeScript.MODE_PART_EDITOR)
	await process_frame
	expect(overlay.selected_mode == DeveloperModeScript.MODE_PART_EDITOR and overlay.content_root != null, "파트 편집 모드 진입")
	overlay.select_mode(DeveloperModeScript.MODE_TEST_PILOT)
	expect(selected == DeveloperModeScript.MODE_TEST_PILOT, "테스트 파일럿 모드 선택 신호")
	overlay.queue_free()
	if failures.is_empty():
		print("[PASS] developer-mode")
		quit(0)
	else:
		print("[FAIL] developer-mode: ", ", ".join(failures))
		quit(1)
