extends SceneTree

const DeveloperModeScript = preload("res://scripts/developer_mode.gd")
const BalanceData = preload("res://scripts/balance.gd")
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
	expect(overlay.selected_mode == DeveloperModeScript.MODE_PART_EDITOR and overlay.content_root != null and overlay.part_table.get_root().get_child_count() == BalanceData.MODULES.size(), "모든 파트를 포함한 파트 편집 테이블")
	expect(overlay.part_search != null and overlay.part_filter != null and overlay.part_type_filter != null and overlay.part_material_filter != null and overlay.part_theme_filter != null and overlay.part_grade_filter != null and overlay.part_preview != null, "파트 검색·역할·타입·재질·분류 필터·미리보기 컨트롤")
	var initial_count: int = overlay.part_table.get_root().get_child_count()
	overlay.part_search.text = "프로토스"
	overlay._refresh_part_table()
	expect(overlay.part_table.get_root().get_child_count() > 0 and overlay.part_table.get_root().get_child_count() < initial_count, "한국어 테마 파트 테이블 검색 필터링")
	overlay.part_search.text = ""
	overlay.part_type_filter.select(2)
	overlay._refresh_part_table()
	expect(overlay.part_table.get_root().get_child_count() > 0 and overlay.part_table.get_root().get_child_count() < initial_count, "세부 구조 타입 필터링")
	overlay.part_type_filter.select(0)
	overlay.part_material_filter.select(3)
	overlay._refresh_part_table()
	expect(overlay.part_table.get_root().get_child_count() == 2, "고급 금속 재질 필터링")
	overlay.part_material_filter.select(0)
	overlay._set_part_sort(3)
	expect(overlay.part_sort_column == 3, "파트 테이블 등급 정렬 열 선택")
	expect(overlay.part_fields.has("mass") and overlay.part_fields.has("hull") and overlay.part_fields.has("material") and overlay.part_fields.has("design_theme") and overlay.part_fields.has("grade"), "파트 질량·Hull·재질·테마·등급 편집 필드")
	expect(DeveloperModeScript.validate_part_changes({"display_name":"TEST", "hull":"12", "mass":"1.5", "material":"standard", "power":"0", "thrust":"0", "reverse_thrust":"0", "rcs_thrust":"0", "weapon_type":"none"}).is_empty(), "유효 파트 튜닝 값 통과")
	expect(not DeveloperModeScript.validate_part_changes({"display_name":"TEST", "hull":"0", "mass":"-1", "material":"", "power":"x", "thrust":"-1", "reverse_thrust":"0", "rcs_thrust":"0"}).is_empty(), "잘못된 파트 튜닝 값 거부")
	overlay.select_mode(DeveloperModeScript.MODE_TEST_PILOT)
	expect(selected == DeveloperModeScript.MODE_TEST_PILOT, "테스트 파일럿 모드 선택 신호")
	overlay.queue_free()
	if failures.is_empty():
		print("[PASS] developer-mode")
		quit(0)
	else:
		print("[FAIL] developer-mode: ", ", ".join(failures))
		quit(1)
