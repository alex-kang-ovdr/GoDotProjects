class_name NetEventLog
extends RefCounted
## 구조화 JSON 이벤트 로그. stdout에는 `NETEV {json}` 한 줄로, 선택적으로 파일(JSONL)에도 쓴다.
## 비밀값(티켓 서명 키, 티켓 원문)은 기록하지 않는다.

const PREFIX := "NETEV "

var role: String = ""
var _file: FileAccess = null


func _init(p_role: String, file_path: String = "") -> void:
	role = p_role
	if not file_path.is_empty():
		_file = FileAccess.open(file_path, FileAccess.WRITE)


func emit(ev: String, data: Dictionary = {}) -> void:
	var rec := {"ev": ev, "role": role, "t_ms": Time.get_ticks_msec()}
	rec.merge(data, true)
	var line := JSON.stringify(rec)
	print(PREFIX + line)
	if _file != null:
		_file.store_line(line)
		_file.flush()


static func vec(v: Vector2) -> Array:
	return [snappedf(v.x, 0.001), snappedf(v.y, 0.001)]
