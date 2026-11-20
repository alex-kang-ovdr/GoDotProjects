extends SceneTree
## Headless renderer contract checks. These do not substitute for a GPU capture.
## Run: godot --headless --path . --script tests/render_smoke.gd

const World = preload("res://scripts/arena_world.gd")
const Sim = preload("res://scripts/arena_sim.gd")
var checks: Array = []
var failures: Array = []

func _initialize() -> void:
	call_deferred("_run")

func check(label: String, passed: bool, detail: String = "") -> void:
	checks.append({"name": label, "passed": passed, "detail": detail})
	if not passed:
		failures.append(label)

func _run() -> void:
	root.size = Vector2i(1280, 800)
	var world = World.new()
	root.add_child(world)
	world.setup()
	var child_count: int = world.get_child_count()
	world.setup()
	check("setup is idempotent", world.get_child_count() == child_count)
	var sim = Sim.new()
	world.sync(sim, 0.016)
	check("lobby shows real 3D rig", world._lobby.visible and world._hero.root.visible)
	check("lobby renders enemy vignette", world._counts.actors > 0)
	var snapshot_before: Dictionary = sim.snapshot()
	world.sync(sim, 0.016)
	check("renderer does not mutate simulation", JSON.stringify(snapshot_before) == JSON.stringify(sim.snapshot()))
	sim.start({"weapon": "kunai"}, 123)
	sim.director_enabled = false
	world.sync(sim, 0.016)
	check("lobby hides in combat", not world._lobby.visible)
	var center: Vector2 = world.camera.unproject_position(Vector3.ZERO)
	var up: Vector2 = world.camera.unproject_position(Vector3(0, 0, -1))
	var down: Vector2 = world.camera.unproject_position(Vector3(0, 0, 1))
	var right: Vector2 = world.camera.unproject_position(Vector3(1, 0, 0))
	check("W / negative Z projects upwards", up.y < center.y)
	check("S / positive Z projects downwards", down.y > center.y)
	check("D / positive X projects right", right.x > center.x)
	check("vertical movement does not rotate horizontal axis", absf(up.x - center.x) < 0.01)
	for dimensions in [Vector2i(390, 844), Vector2i(844, 390), Vector2i(1280, 800)]:
		root.size = dimensions
		world.sync(sim, 0.1)
		var a: Vector2 = world.camera.unproject_position(Vector3.ZERO)
		var b: Vector2 = world.camera.unproject_position(Vector3(0, 0, -1))
		check("screen-up at %dx%d" % [dimensions.x, dimensions.y], b.y < a.y)
	var palette: Array = []
	for chapter in range(3):
		sim.config.chapter = chapter
		world.sync(sim, 0.016)
		palette.append(world._ground_material.get_shader_parameter("tile_a"))
		check("chapter %d scenery built" % chapter, world._scenery.get_child_count() == 1)
	check("all 3 chapter palettes differ", palette[0] != palette[1] and palette[1] != palette[2] and palette[0] != palette[2])
	for weapon in sim.catalog.balance.mainWeapons:
		sim.config.weapon = weapon
		world.sync(sim, 0.016)
		check("hero mesh for " + weapon, world._last_weapon == weapon and is_instance_valid(world._hero_weapon))
	for key in ["guardian", "droneA", "droneB", "forcefield"]:
		sim.apply_upgrade(key)
	world.sync(sim, 0.016)
	check("guardian and drone geometry exists", not sim.guardian_nodes().is_empty() and sim.drone_positions().size() == 2 and world._counts.glow > 0)
	var types: Array = Sim.ENEMY_DATA.keys()
	for i in range(260):
		sim.spawn_enemy(types[i % types.size()], Vector2((i % 20 - 10) * 45, (i / 20 - 6) * 45))
	for i in range(650):
		var kind: String = sim.catalog.balance.weapons.keys()[i % sim.catalog.balance.weapons.size()]
		sim.shots.append({"id": 10000 + i, "kind": kind, "pos": Vector2((i % 30 - 15) * 20, (i / 30 - 10) * 20), "velocity": Vector2.from_angle(i) * 400, "r": 8.0, "color": "#f0d285"})
	for i in range(350):
		sim.enemy_shots.append({"id": 12000 + i, "kind": "bullet", "pos": Vector2((i % 25 - 12) * 25, (i / 25 - 7) * 25), "velocity": Vector2.DOWN * 180, "r": 6.0, "color": "#ff88aa"})
	for i in range(580):
		sim.gems.append({"id": 14000 + i, "type": "xp", "pos": Vector2((i % 29 - 14) * 25, (i / 29 - 10) * 25), "value": 3.0})
	world.sync(sim, 0.016)
	check("maximum enemy population renders", world._counts.actors >= 260 * 9)
	check("all 580 experience crystals render", world._counts.crystals == 580)
	for key in world._batches:
		check("bounded MultiMesh " + key, world._counts[key] <= world._batches[key].multimesh.instance_count)
	check("hostile projectiles have separate visible color geometry", world._counts.orbs >= 700)
	sim.effects = [{"id": 1, "kind": "hit", "pos": Vector2.ZERO, "color": "#ffffff", "life": 0.2, "max": 0.3, "text": "123"}]
	world.sync(sim, 0.016)
	check("damage text appears", world._floating_labels[0].visible and world._floating_labels[0].text == "123")
	var boss: Dictionary = {}
	for enemy in sim.enemies:
		if enemy.type == "boss":
			boss = enemy
			break
	for pattern in ["charge", "shockwave", "mortar", "summon", "laser", "ice"]:
		sim.threats.clear()
		sim.boss_pattern(boss, pattern)
		world.sync(sim, 0.016)
		check(pattern + " warning renders", world._counts.rings > 1 or world._counts.telegraphs > 0)
		for threat in sim.threats:
			threat.active = true
			threat.age = float(threat.warn) + float(threat.duration) * 0.5
			threat.delay = 0.0
		world.sync(sim, 0.016)
		check(pattern + " activation renders", world._counts.rings > 1 or world._counts.telegraphs > 0)
	var old_time: float = world._clock
	sim.state = "paused"
	world.sync(sim, 1.0)
	check("pause freezes cosmetic movement clock", is_equal_approx(world._clock, old_time))
	world.set_quality(false)
	check("low quality disables directional shadows", not world.sunlight.shadow_enabled)
	world.set_quality(true)
	check("high quality enables directional shadows", world.sunlight.shadow_enabled)
	sim.player.pos = Vector2(18000, -18000)
	world.sync(sim, 0.016)
	check("scenery follows distant travel", world._scenery.position.distance_to(Vector3(450, 0, -450)) < 30)
	var result = {"suite": "render_contract", "engine": Engine.get_version_info().string, "mode": "headless invariants; no GPU visual verification", "passed": checks.size() - failures.size(), "failed": failures.size(), "checks": checks}
	var file = FileAccess.open("res://tests/render_report.json", FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(result, "\t"))
	print("RENDER_SMOKE: %d passed, %d failed" % [result.passed, result.failed])
	for failure in failures:
		printerr("FAIL: " + failure)
	quit(0 if failures.is_empty() else 1)
