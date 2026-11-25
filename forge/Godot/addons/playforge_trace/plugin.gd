@tool
extends EditorPlugin
## 플러그인을 켜면 PlayForgeTrace 오토로드를 등록한다. 수집은 실행 시 --trace-out 인자가 있을 때만 동작한다.

const AUTOLOAD_NAME := "PlayForgeTrace"
const AUTOLOAD_PATH := "res://addons/playforge_trace/trace_collector.gd"


func _enable_plugin() -> void:
	add_autoload_singleton(AUTOLOAD_NAME, AUTOLOAD_PATH)


func _disable_plugin() -> void:
	remove_autoload_singleton(AUTOLOAD_NAME)
