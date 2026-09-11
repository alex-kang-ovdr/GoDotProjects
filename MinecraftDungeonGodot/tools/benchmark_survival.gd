extends SceneTree

const ROUNDS := 9
const SIMULATION_SECONDS := 1200.0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var samples: Array[int] = []
	for round in ROUNDS:
		var state := SurvivalState.new()
		var started := Time.get_ticks_usec()
		state.advance(SIMULATION_SECONDS)
		var elapsed := Time.get_ticks_usec() - started
		samples.append(elapsed)
		if state.step_count != int(SIMULATION_SECONDS / SurvivalState.STEP_SECONDS) or state.elapsed_seconds < SIMULATION_SECONDS - 0.001:
			push_error("Survival benchmark state drifted")
			quit(1)
			return
	samples.sort()
	var average := 0.0
	for sample in samples:
		average += sample
	average /= samples.size()
	var p95 := samples[ceili(samples.size() * 0.95) - 1]
	print("SURVIVAL BENCHMARK: rounds=%d simulated_seconds=%.0f steps=%d avg_us=%.1f p95_us=%d" % [ROUNDS, SIMULATION_SECONDS, int(SIMULATION_SECONDS / SurvivalState.STEP_SECONDS), average, p95])
	quit(0)
