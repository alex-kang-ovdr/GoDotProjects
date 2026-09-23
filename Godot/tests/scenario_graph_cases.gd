extends RefCounted

const DefinitionScript = preload("res://scripts/scenario_definition.gd")
const CatalogScript = preload("res://scripts/scenario_catalog.gd")

var failures: Array[String] = []

func expect(condition: bool, label: String) -> void:
	if condition:
		print("[PASS] ", label)
	else:
		failures.append(label)
		push_error("[FAIL] " + label)

func errors_for(data: Variant) -> Array[String]:
	return DefinitionScript.validate(data)

func first_non_goal_system(data: Dictionary) -> Dictionary:
	for system in data.systems:
		if str(system.id) != str(data.goal_id):
			return system
	return {}

func append_valid_orphan(data: Dictionary, orphan_id: String) -> void:
	var mission_id := str(data.systems[0].mission_id)
	data.systems.append({
		"id": orphan_id,
		"display_name": "Orphan Test Node",
		"depth": 0,
		"mission_id": mission_id,
		"next": [],
		"station": false,
		"boss": ""
	})

func enumerate_paths(data: Dictionary, node_id: String, path: Array[String], result: Array[Array]) -> void:
	if result.size() >= 257 or path.has(node_id) or path.size() >= data.systems.size():
		return
	var next_path := path.duplicate()
	next_path.append(node_id)
	if node_id == str(data.goal_id):
		result.append(next_path)
		return
	var by_id: Dictionary = {}
	for system in data.systems:
		by_id[str(system.id)] = system
	if not by_id.has(node_id):
		return
	for next_id in by_id[node_id].next:
		enumerate_paths(data, str(next_id), next_path, result)

func run_tests() -> int:
	failures.clear()
	var valid := CatalogScript.default_definition()
	expect(errors_for(valid).is_empty(), "default definition validates")
	expect(valid is Dictionary, "default definition is a dictionary")
	if valid is Dictionary and valid.get("systems", null) is Array and not valid.systems.is_empty():
		var duplicate_id: Dictionary = valid.duplicate(true)
		duplicate_id.systems[1].id = duplicate_id.systems[0].id
		expect(not errors_for(duplicate_id).is_empty(), "duplicate system id rejected")

		var missing_mission: Dictionary = valid.duplicate(true)
		missing_mission.systems[0].mission_id = "__missing_mission__"
		expect(not errors_for(missing_mission).is_empty(), "missing mission reference rejected")

		var missing_next: Dictionary = valid.duplicate(true)
		missing_next.systems[0].next = ["__missing_system__"]
		expect(not errors_for(missing_next).is_empty(), "unknown next reference rejected")

		var invalid_type: Dictionary = valid.duplicate(true)
		invalid_type.missions[0].type = "teleport"
		expect(not errors_for(invalid_type).is_empty(), "invalid mission type rejected")

		var null_systems: Dictionary = valid.duplicate(true)
		null_systems.systems = null
		expect(not errors_for(null_systems).is_empty(), "null systems rejected")
		expect(not errors_for(null).is_empty(), "null top-level value rejected")
		expect(not errors_for(["not", "a", "dictionary"]).is_empty(), "non-dictionary top-level value rejected")

		var invalid_next: Dictionary = valid.duplicate(true)
		invalid_next.systems[0].next = "not-an-array"
		expect(not errors_for(invalid_next).is_empty(), "non-array next field rejected")

		var invalid_number: Dictionary = valid.duplicate(true)
		invalid_number.systems[0].depth = "deep"
		expect(not errors_for(invalid_number).is_empty(), "non-numeric depth rejected")
		var invalid_mission_number := valid.duplicate(true)
		var changed_numeric_field := false
		for mission in invalid_mission_number.missions:
			if str(mission.get("type", "")) == "escape":
				mission.charge_seconds = "soon"
				changed_numeric_field = true
				break
			if str(mission.get("type", "")) == "protect":
				mission.duration_seconds = "forever"
				changed_numeric_field = true
				break
			if str(mission.get("type", "")) == "acquire":
				mission.amount = "many"
				changed_numeric_field = true
				break
		if changed_numeric_field:
			expect(not errors_for(invalid_mission_number).is_empty(), "non-numeric mission field rejected")

		var empty_waves: Dictionary = valid.duplicate(true)
		for mission in empty_waves.missions:
			if str(mission.get("type", "")) == "eliminate":
				mission.waves = []
				break
		expect(not errors_for(empty_waves).is_empty(), "eliminate mission with empty waves rejected")

		var duplicate_targets: Dictionary = valid.duplicate(true)
		for mission in duplicate_targets.missions:
			if str(mission.get("type", "")) == "eliminate":
				mission.waves = [["repeat_target"], ["repeat_target"]]
				break
		expect(not errors_for(duplicate_targets).is_empty(), "duplicate eliminate target across waves rejected")

		var negative_charge: Dictionary = valid.duplicate(true)
		for mission in negative_charge.missions:
			if str(mission.get("type", "")) == "escape":
				mission.charge_seconds = -1.0
				break
		expect(not errors_for(negative_charge).is_empty(), "nonpositive escape charge rejected")

		var nan_duration: Dictionary = valid.duplicate(true)
		for mission in nan_duration.missions:
			if str(mission.get("type", "")) == "protect":
				mission.duration_seconds = NAN
				break
		expect(not errors_for(nan_duration).is_empty(), "non-finite protect duration rejected")

		var fractional_amount: Dictionary = valid.duplicate(true)
		for mission in fractional_amount.missions:
			if str(mission.get("type", "")) == "acquire":
				mission.amount = 1.5
				break
		expect(not errors_for(fractional_amount).is_empty(), "non-integer acquire amount rejected")

		var orphan: Dictionary = valid.duplicate(true)
		append_valid_orphan(orphan, "__orphan_test__")
		expect(not errors_for(orphan).is_empty(), "unreachable orphan system rejected")

		var dead_end: Dictionary = valid.duplicate(true)
		var dead_end_system: Dictionary = first_non_goal_system(dead_end)
		dead_end_system.next = []
		expect(not errors_for(dead_end).is_empty(), "non-goal dead end rejected")

		var bad_cycle: Dictionary = valid.duplicate(true)
		var start_system: Dictionary = {}
		for system in bad_cycle.systems:
			if str(system.id) == str(bad_cycle.start_id):
				start_system = system
				break
		if not start_system.is_empty():
			start_system.next.append(str(bad_cycle.start_id))
		expect(not errors_for(bad_cycle).is_empty(), "cycle rejected")

		var goal_outgoing: Dictionary = valid.duplicate(true)
		for system in goal_outgoing.systems:
			if str(system.id) == str(goal_outgoing.goal_id):
				system.next = [str(goal_outgoing.start_id)]
				break
		expect(not errors_for(goal_outgoing).is_empty(), "goal outgoing edge rejected")

		var paths: Array[Array] = []
		enumerate_paths(valid, str(valid.start_id), [], paths)
		expect(not paths.is_empty() and paths.size() <= 256, "default path enumeration is bounded and nonempty")
		expect(paths.size() == 8, "default has exactly eight branching routes")
		var path_counts_ok := not paths.is_empty()
		for path in paths:
			if path.size() != 9:
				path_counts_ok = false
				continue
			var stations := 0
			var mid_bosses := 0
			var final_bosses := 0
			for system_id in path:
				for system in valid.systems:
					if str(system.id) == system_id:
						stations += int(system.station)
						mid_bosses += int(str(system.boss) == "mid")
						final_bosses += int(str(system.boss) == "final")
			if stations != 3 or mid_bosses != 2 or final_bosses != 1:
				path_counts_ok = false
		expect(path_counts_ok, "every default path has 9 systems, 3 stations, 2 mid bosses, and 1 final boss")

		var mission_types := {}
		for mission in valid.missions:
			mission_types[str(mission.get("type", ""))] = true
		expect(mission_types.has("eliminate") and mission_types.has("escape") and mission_types.has("protect") and mission_types.has("acquire"), "default includes all four mission types")
	else:
		expect(false, "default definition has a nonempty systems array")

	var independent_a := CatalogScript.default_definition()
	var independent_b := CatalogScript.default_definition()
	var original_b_id := str(independent_b.systems[0].id) if independent_b.get("systems", []) is Array and not independent_b.systems.is_empty() else ""
	if independent_a.get("systems", []) is Array and not independent_a.systems.is_empty():
		independent_a.systems[0].id = "__mutated_copy__"
	if independent_b.get("systems", []) is Array and not independent_b.systems.is_empty():
		expect(str(independent_b.systems[0].id) == original_b_id and original_b_id != "__mutated_copy__", "default calls return independently mutable definitions")
	else:
		expect(false, "second default definition has systems")

	if failures.is_empty():
		print("[PASS] scenario-graph")
		return 0
	else:
		print("[FAIL] scenario-graph: ", ", ".join(failures))
		return 1
