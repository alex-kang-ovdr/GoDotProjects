extends SceneTree

const Operations := preload("res://sim/operations.gd")

var checks := 0
var failed := 0


func _initialize() -> void:
	var path := "user://test_operations_%d.json" % OS.get_process_id()
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	var ops := Operations.new(path)
	_check(ops.load_error.is_empty(), "operation catalog loads: " + ops.load_error)
	_check(ops.missions.size() == 3, "three data-driven operations load")
	if ops.missions.size() == 3:
		_check(ops.missions[0].id == "skirmish" and ops.missions[0].objective == "duel" and ops.missions[0].opponent == "flight" and ops.missions[0].distance == 120 and ops.missions[0].ai == "balanced" and ops.missions[0].requires == "", "skirmish catalog parameters match")
		_check(ops.missions[1].id == "disarm" and ops.missions[1].objective == "disarm" and ops.missions[1].opponent == "fast" and ops.missions[1].distance == 145 and ops.missions[1].ai == "pursuit" and ops.missions[1].requires == "skirmish", "disarm catalog parameters match")
		_check(ops.missions[2].id == "escort" and ops.missions[2].objective == "survive" and ops.missions[2].opponent == "siege" and ops.missions[2].distance == 135 and ops.missions[2].seconds == 32 and ops.missions[2].ai == "standoff" and ops.missions[2].requires == "disarm", "escort catalog parameters match")
	_check(ops.is_unlocked("skirmish") and not ops.is_unlocked("disarm") and not ops.is_unlocked("escort"), "only first operation starts unlocked")
	_check(not ops.record_win("disarm", 44, 10, 8) and ops.completed.is_empty(), "locked operation result is rejected")
	_check(not ops.record_win("skirmish", 0, 10, 8) and not ops.record_win("skirmish", 20, 4, 5), "invalid elapsed and hit counts are rejected")
	_check(ops.record_win("skirmish", 91.5, 20, 15), "first skirmish victory saves")
	_check(ops.is_unlocked("disarm") and not ops.is_unlocked("escort"), "first clear unlocks only its successor")
	_check(ops.record_win("skirmish", 100, 12, 12) and float(ops.completed.skirmish.elapsed) == 91.5, "slower replay preserves fastest clear")
	_check(ops.record_win("skirmish", 80, 18, 14) and float(ops.completed.skirmish.elapsed) == 80.0, "faster replay replaces best result")
	_check(ops.record_win("disarm", 75, 30, 16) and ops.is_unlocked("escort"), "first disarm victory unlocks escort")
	_check(ops.record_win("escort", 32, 0, 0), "survival result accepts zero shots and saves")
	var restored := Operations.new(path)
	_check(restored.load_error.is_empty() and restored.progress_error.is_empty(), "saved progression reloads without errors")
	_check(restored.completed.size() == 3 and restored.completed == ops.completed and restored.is_unlocked("escort"), "roundtrip preserves every best result and unlock")
	_test_malformed_progress(path)
	_test_failed_save()
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	print("Operations checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)


func _check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", label)


func _test_malformed_progress(path: String) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string(JSON.stringify({"version": 1, "completed": {"unknown": {"elapsed": 10, "shots": 1, "hits": 1}}}))
	file.close()
	var malformed := Operations.new(path)
	_check(not malformed.progress_error.is_empty() and malformed.completed.is_empty(), "malformed progress is rejected without partial restoration")
	_check(malformed.record_win("skirmish", 55, 3, 2), "a new successful result replaces malformed progress durably")
	var recovered := Operations.new(path)
	_check(recovered.progress_error.is_empty() and recovered.completed.has("skirmish"), "recovered progress reloads cleanly")


func _test_failed_save() -> void:
	var blocker := "user://operations_blocker_%d" % OS.get_process_id()
	var file := FileAccess.open(blocker, FileAccess.WRITE)
	file.store_string("file prevents directory creation")
	file.close()
	var ops := Operations.new(blocker + "/progress.json")
	var saved := ops.record_win("skirmish", 60, 2, 1)
	_check(not saved and not ops.progress_error.is_empty() and ops.completed.is_empty(), "failed save rolls back in-memory completion")
	_check(not FileAccess.file_exists(blocker + "/progress.json"), "failed save does not create partial destination")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(blocker))
