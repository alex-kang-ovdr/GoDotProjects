extends SceneTree

const FortEngine = preload("res://scripts/fort_engine.gd")
const TERRAIN_KEYS = ["mapId", "width", "height", "solidCount", "version"]


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() != 1:
		fail("Expected a path to the parity fixture.")
		return
	var fixture: Variant = JSON.parse_string(FileAccess.get_file_as_string(args[0]))
	if not fixture is Dictionary:
		fail("Could not read the parity fixture.")
		return
	var seeded: Array = []
	for config in fixture.options:
		var match_report := seeded_match(FortEngine.new(config), fixture)
		if match_report.is_empty():
			return
		seeded.append(match_report)
	var completed := play_shot(FortEngine.new(fixture.options[0]), fixture)
	if completed.is_empty():
		return
	print("FORTRESS_WAR_PARITY ", JSON.stringify({"seeded": seeded, "completedShot": completed}))
	quit()


func select_fields(record: Dictionary, keys: Array) -> Dictionary:
	var selected: Dictionary = {}
	for key in keys:
		selected[key] = record[key]
	return selected


func seeded_match(engine, fixture: Dictionary) -> Dictionary:
	var aim: Dictionary = engine.get_aiming_state()
	var charge: Array = []
	for seconds in fixture.chargeTimes:
		charge.append(engine.get_charge_power(seconds))
	var tanks: Array = []
	for tank in engine.state.tanks:
		tanks.append(select_fields(tank, fixture.tankKeys))
	var surfaces: Array = []
	for x in fixture.surfaceColumns:
		surfaces.append(engine.surface_at(x))
	var angles: Array = []
	for angle in [-200, 200]:
		if not engine.set_angle(angle):
			return fail("Could not aim in the seeded hotseat match.")
		angles.append(engine.get_aiming_state().localAngle)
	var powers: Array = []
	for power in [-10, 37.8, 150]:
		if not engine.set_power(power):
			return fail("Could not set power in the seeded hotseat match.")
		powers.append(engine.get_aiming_state().power)
	return {
		"turn": select_fields(engine.state, fixture.turnKeys),
		"tanks": tanks,
		"terrain": select_fields(engine.terrain, TERRAIN_KEYS),
		"surfaces": surfaces,
		"aiming": aim,
		"charge": charge,
		"clampedAngles": angles,
		"clampedPowers": powers,
	}


func play_shot(engine, fixture: Dictionary) -> Dictionary:
	var shot: Dictionary = fixture.shot
	if not engine.set_angle(shot.angle) or not engine.set_power(shot.power) or not engine.fire():
		return fail("Could not fire the reference shot.")
	var snapshots: Array = []
	var step := 0
	while step < int(shot.maxSteps) and engine.state.turnNumber == 1:
		if float(step) in shot.sampleSteps:
			var projectiles: Array = []
			for projectile in engine.state.projectiles:
				projectiles.append(select_fields(projectile, fixture.projectileKeys))
			snapshots.append(projectiles)
		engine.tick(1.0 / 120.0)
		step += 1
	if step == int(shot.maxSteps):
		return fail("The reference shot did not settle within ten simulated seconds.")
	var hit_points: Array = []
	for tank in engine.state.tanks:
		hit_points.append(tank.hp)
	return {
		"steps": step,
		"projectiles": snapshots,
		"turn": select_fields(engine.state, fixture.turnKeys),
		"hitPoints": hit_points,
		"action": select_fields(engine.state.lastAction, fixture.actionKeys),
		"terrain": select_fields(engine.terrain, ["solidCount", "version"]),
	}


func fail(message: String) -> Dictionary:
	printerr(message)
	quit(1)
	return {}
