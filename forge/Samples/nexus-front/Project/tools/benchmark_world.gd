extends SceneTree
## Reproducible, headless native-world benchmark. Run from the editable project.
## Default: three map sizes, 180 simulated seconds each, dt=0.1 (stability).
## --mode=performance: map 2x, 60 seconds, dt=1/60 (CPU timing, no rendering).
## Options after Godot's -- separator: --mode=... --dt=... --seconds=... --output=...

const World = preload("res://scripts/sim_world.gd")
const SEED = 2601120
const HERO = "lol_ezreal"

func _initialize() -> void:
	var options: Dictionary = {}
	for argument in OS.get_cmdline_user_args():
		if argument == "--help":
			print("godot --headless --path . --script tools/benchmark_world.gd -- --mode=stability|performance [--dt=0.1] [--seconds=180] [--output=user://benchmark.json]")
			quit(0)
			return
		if not argument.begins_with("--") or not argument.contains("="):
			push_error("Unknown argument: " + argument + ". Use --help.")
			quit(2)
			return
		var parts = argument.substr(2).split("=", true, 1)
		if parts[0] not in ["mode", "dt", "seconds", "output"]:
			push_error("Unknown option: " + str(parts[0]))
			quit(2)
			return
		options[parts[0]] = parts[1]
	var mode = str(options.get("mode", "stability"))
	if mode not in ["stability", "performance"]:
		push_error("Mode must be stability or performance.")
		quit(2)
		return
	var dt = 0.1 if mode == "stability" else 1.0 / 60.0
	var seconds = 180.0 if mode == "stability" else 60.0
	for field in ["dt", "seconds"]:
		if options.has(field) and not str(options[field]).is_valid_float():
			push_error(field + " must be a finite number.")
			quit(2)
			return
	if options.has("dt"): dt = float(options.dt)
	if options.has("seconds"): seconds = float(options.seconds)
	if not is_finite(dt) or dt < 0.001 or dt > 0.1 or not is_finite(seconds) or seconds <= 0 or seconds > 3600:
		push_error("Require 0.001 <= dt <= 0.1 and 0 < seconds <= 3600. The world caps individual steps at 0.1 seconds.")
		quit(2)
		return
	var output = str(options.get("output", "res://docs/sustained_simulation.json" if mode == "stability" else "res://docs/performance.json"))
	var scales: Array = [1.0, 1.5, 2.0] if mode == "stability" else [2.0]
	var rows: Array = []
	var all_valid = true
	for map_scale in scales:
		var row = _run_world(float(map_scale), dt, seconds)
		rows.append(row)
		all_valid = all_valid and bool(row.finite_state)
		print(JSON.stringify(row))
	var report = {
		"mode": mode, "engine": Engine.get_version_info().string,
		"method": "headless CPU simulation; rendering and GPU excluded",
		"seed": SEED, "selected_hero": HERO,
		"player_control": "selected player is switched to the same bot AI as the other nine heroes",
		"difficulty": "standard", "dt": dt, "requested_sim_seconds": seconds,
		"fixed_dt_comparability": "Different dt values can produce different combat outcomes. Do not compare them as identical matches.",
		"runs": rows, "all_states_valid": all_valid
	}
	var file = FileAccess.open(output, FileAccess.WRITE)
	if file == null:
		push_error("Could not write " + output + ": " + error_string(FileAccess.get_open_error()))
		quit(3)
		return
	file.store_string(JSON.stringify(report, "  "))
	file.close()
	print("Benchmark report: " + ProjectSettings.globalize_path(output))
	quit(0 if all_valid else 1)

func _run_world(map_scale: float, dt: float, seconds: float) -> Dictionary:
	var world = World.new()
	world.setup({"hero_id": HERO, "map_scale": map_scale, "difficulty": "standard", "seed": SEED})
	# Only this benchmark switches the selected unit to AI; normal gameplay is manual.
	world.hero().is_player = false
	var iterations = int(ceil(seconds / dt))
	var step_times: Array[float] = []
	var peak_entities = world.entities.size()
	var start = Time.get_ticks_usec()
	for _index in iterations:
		var begin = Time.get_ticks_usec()
		world.step(dt)
		step_times.append(float(Time.get_ticks_usec() - begin) / 1000.0)
		peak_entities = maxi(peak_entities, world.entities.size())
		if world.winner >= 0: break
	var elapsed = float(Time.get_ticks_usec() - start) / 1000.0
	var finite_state = true
	for entity in world.entities:
		if not entity.pos.is_finite() or not is_finite(float(entity.hp)) or entity.hp < 0 or entity.hp > entity.max_hp + 0.001 or entity.pos.x < 0 or entity.pos.y < 0 or entity.pos.x > world.size or entity.pos.y > world.size:
			finite_state = false
	var heroes: Array = []
	for entity in world.entities:
		if entity.kind == "hero":
			heroes.append({"key": entity.key, "team": entity.team, "level": entity.level, "kills": entity.kills, "deaths": entity.deaths, "casts": entity.state.casts, "gold": entity.gold, "pos": [entity.pos.x, entity.pos.y]})
	step_times.sort()
	var count = step_times.size()
	var row = {
		"map_scale": map_scale, "time": world.time, "frames": count,
		"wall_ms": elapsed, "mean_step_ms": elapsed / maxi(1, count),
		"p95_step_ms": step_times[clampi(int(ceil(count * 0.95)) - 1, 0, count - 1)],
		"peak_step_ms": step_times[-1], "peak_entities": peak_entities,
		"wave": world.wave, "entities": world.entities.size(), "team_kills": world.team_kills.duplicate(),
		"damaged_structures": world.entities.filter(func(e): return e.kind in ["tower", "inhibitor", "nexus"] and e.hp < e.max_hp).size(),
		"destroyed_structures": world.entities.filter(func(e): return e.kind in ["tower", "inhibitor", "nexus"] and not e.alive).size(),
		"winner": world.winner, "finite_state": finite_state, "heroes": heroes
	}
	world.dispose()
	return row
