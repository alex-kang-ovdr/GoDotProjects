extends SceneTree

const SMOKE_SEED := 314159
var game: Control
var last_action := ""
var last_result: Dictionary = {}
var checks := 0
var failures := 0
var ticks := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var save_path := "user://frontier-smoke-%d.json" % OS.get_process_id()
	game = load("res://main.tscn").instantiate()
	root.add_child(game)
	game.runtime.command_finished.connect(_record)
	game.runtime.failed.connect(func(message: String) -> void: _check(false, message))
	await _wait("start")
	if not _check(game.state.get("seed") == SMOKE_SEED and game.state.get("colonists", []).size() == 3, "정상 장면을 웹 v4 기본 시드로 시작"):
		quit(1)
		return

	game._set_tool("build:door")
	for cell in [Vector2i(27, 16), Vector2i(23, 19)]:
		game.board.tile_clicked.emit(cell, MOUSE_BUTTON_LEFT, false)
		await _wait("command")
		_check(last_result.get("ok", false) and game._tile(cell).building.type == "door", "지도 클릭으로 문 계획 지정 %s" % cell)
	game._set_tool("build:bed")
	game.board.tile_clicked.emit(Vector2i(25, 13), MOUSE_BUTTON_LEFT, false)
	await _wait("command")
	_check(last_result.get("ok", false), "세 번째 침대 계획 지정")
	game._set_tool("farm")
	game.board.zone_dragged.emit(Vector2i(24, 20), Vector2i(26, 21))
	await _wait("command")
	var farm_cells := 0
	for y in range(20, 22):
		for x in range(24, 27):
			farm_cells += int(game._tile(Vector2i(x, y)).zone == "farm")
	_check(last_result.get("ok", false) and farm_cells == 6, "사각형 경작 구역 6칸 지정")

	game._set_speed(6)
	await create_timer(1.2).timeout
	game._set_speed(0)
	_check(ticks >= 2 and float(game.state.time) > 1.0, "배속 버튼이 실시간 요청을 보내고 시간이 진행")
	while game.tick_pending:
		await process_frame
	last_action = ""
	game.runtime.request("tick", {"seconds": 40})
	await _wait("tick")
	_check(game.summary.indoorBeds == 3, "주민이 운반·시공을 끝내고 실내 침대 3개 확보")
	var researcher: String = game.state.colonists[2].id
	game._edit_priority(researcher, "haul", 2)
	await _wait("command")
	game._edit_priority(researcher, "research", -1)
	await _wait("command")
	game.runtime.request("tick", {"seconds": 110})
	await _wait("tick")
	_check("electricity" in game.state.research.unlocked, "연구대 작업으로 전기 공학 해금")

	for index in range(game.tabs.tab_count):
		game.tabs.current_tab = index
		await process_frame
		_check(game.panel_body.get_child_count() >= 2, "관리 탭 렌더링 %s" % game.tabs.get_tab_title(index))
	game._select_all()
	game._draft()
	for index in range(3):
		await _wait("command")
	_check(game._drafted_ids().size() == 3, "전원 선택 후 징집")
	game.board.tile_clicked.emit(Vector2i(24, 16), MOUSE_BUTTON_RIGHT, false)
	await _wait("command")
	_check(last_result.get("ok", false) and last_result.get("count", 0) == 3, "우클릭으로 3명 대형 이동")

	var saved_time: float = game.state.time
	game.runtime.request("save", {"path": save_path})
	await _wait("save")
	_check(last_result.get("ok", false) and FileAccess.file_exists(save_path), "JSON 저장")
	game.runtime.request("tick", {"seconds": 3})
	await _wait("tick")
	game.runtime.request("load", {"path": save_path})
	await _wait("load")
	_check(last_result.get("ok", false) and is_equal_approx(game.state.time, saved_time), "JSON 불러오기로 시간 복원")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(save_path))
	game.tabs.current_tab = 0
	game.selected.clear()
	game.board.set_selected(game.selected)
	game._set_tool("select")
	if DisplayServer.get_name() != "headless":
		for arg in OS.get_cmdline_user_args():
			if arg.begins_with("--screenshot="):
				await RenderingServer.frame_post_draw
				var destination := arg.trim_prefix("--screenshot=")
				_check(root.get_texture().get_image().save_png(destination) == OK, "Godot 실행 화면 캡처")
	print("Frontier Colony smoke: %d checks, %d failures" % [checks, failures])
	quit(0 if failures == 0 else 1)


func _wait(action: String) -> void:
	var began := Time.get_ticks_msec()
	while last_action != action and Time.get_ticks_msec() - began < 15000:
		await process_frame
	if last_action != action:
		_check(false, "%s 응답 시간 초과" % action)
		quit(1)
	last_action = ""


func _record(action: String, result: Dictionary) -> void:
	last_action = action
	last_result = result
	if action == "tick":
		ticks += 1


func _check(condition: bool, title: String) -> bool:
	checks += 1
	if condition:
		print("PASS ", title)
	else:
		failures += 1
		printerr("FAIL ", title, " ", last_result)
	return condition
