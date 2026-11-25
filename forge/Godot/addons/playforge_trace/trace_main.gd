extends SceneTree
## 프로젝트 설정(project.godot)을 건드리지 않고 메인 씬 + 수집기를 띄우는 헤드리스 진입점.
##   godot --headless --path forge/Godot -s res://addons/playforge_trace/trace_main.gd -- \
##         --trace-out=<abs.jsonl> --trace-frames=300 --trace-quit
## 추가 인자 --trace-scene=res://... 로 메인 씬 대신 다른 씬을 측정할 수 있다.

const Collector := preload("res://addons/playforge_trace/trace_collector.gd")


func _initialize() -> void:
	var scene_path := str(ProjectSettings.get_setting("application/run/main_scene", ""))
	var has_quit := false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--trace-scene="):
			scene_path = arg.get_slice("=", 1)
		elif arg == "--trace-quit":
			has_quit = true
	var collector: Node = Collector.new()
	collector.name = "PlayForgeTrace"
	root.add_child(collector)
	if not has_quit:
		collector.quit_when_done = true # -s 실행은 항상 수집 후 종료
	if not scene_path.is_empty():
		var packed := load(scene_path) as PackedScene
		if packed:
			root.add_child(packed.instantiate())
		else:
			push_error("PlayForgeTrace: 씬을 불러오지 못했습니다: %s" % scene_path)
