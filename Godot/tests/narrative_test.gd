extends SceneTree

const NarrativeData = preload("res://scripts/narrative_data.gd")
const DialogueOverlayScript = preload("res://scripts/dialogue_overlay.gd")

var failures: Array[String] = []

func expect(condition: bool, label: String) -> void:
	if condition:
		print("[PASS] ", label)
	else:
		failures.append(label)
		push_error("[FAIL] " + label)

func _init() -> void:
	var intro := NarrativeData.entry("tutorial_intro")
	expect(intro.get("choices", []).size() == 2, "출항 튜토리얼 선택지 2개")
	expect(str(intro.choices[0].action) == "begin_tutorial", "비행 절차 시작 액션")
	expect(NarrativeData.TUTORIAL_MOVE_SPEED > 0.0, "튜토리얼 실제 기동 임계값")
	var station := {"id": "kepler", "name": "KEPLER STATION", "description": "선체 정비소", "upgrade": "CORE HULL +30"}
	var station_entry := NarrativeData.station_approach(station)
	expect(str(station_entry.id) == "station_approach_kepler", "정거장 접근 이벤트 식별자")
	expect(str(station_entry.body).contains("E를 누르면"), "정거장 조작 안내")
	var boss_entry := NarrativeData.boss_encounter("RIFT BREAKER")
	expect(str(boss_entry.id) == "boss_rift_breaker" and str(boss_entry.icon) == "BOSS", "보스 조우 대화 데이터")
	var overlay = DialogueOverlayScript.new()
	overlay.enqueue(intro)
	expect(overlay.is_showing() and overlay.current_id() == "tutorial_intro", "대화 큐 첫 항목 표시")
	overlay.enqueue(NarrativeData.entry("tutorial_move"))
	expect(overlay.choose(0) == "begin_tutorial", "선택형 대화 액션 반환")
	expect(overlay.current_id() == "tutorial_move", "선택 뒤 다음 대화 표시")
	overlay.dismiss()
	expect(not overlay.is_showing(), "비선택 대화 ENTER/클릭 닫기")
	overlay.free()
	if failures.is_empty():
		print("[PASS] narrative-system")
		quit(0)
	else:
		print("[FAIL] narrative-system: ", ", ".join(failures))
		quit(1)
