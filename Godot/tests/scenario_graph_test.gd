extends SceneTree

const ScenarioGraphCases = preload("res://tests/scenario_graph_cases.gd")

func _init() -> void:
	var exit_code: int = ScenarioGraphCases.new().run_tests()
	quit(exit_code)
