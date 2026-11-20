extends SceneTree
## G2 render regressions. Run with Godot after the first editor import.
## Headless tests validate geometry/state contracts; real GPU captures are separate.

const World = preload("res://scripts/arena_world.gd")
const Sim = preload("res://scripts/arena_sim.gd")

class GeometryProbe:
	extends "res://scripts/arena_world.gd"
	# The headless dummy RenderingServer does not retain MultiMesh readback.
	# Capture the exact upload boundary, then delegate to the real renderer.
	var uploads: Dictionary = {}
	func _inst(key: String, transform: Transform3D, color: Color) -> void:
		if not uploads.has(key):
			uploads[key] = []
		uploads[key].append(transform)
		super._inst(key,transform,color)

var checks: Array = []
var failures: Array = []

func _initialize() -> void:
	call_deferred("_run")

func check(label: String, passed: bool, detail: String = "") -> void:
	checks.append({"name":label,"passed":passed,"detail":detail})
	if not passed:
		failures.append(label)

func _run() -> void:
	root.size = Vector2i(1280,800)
	var world = World.new()
	root.add_child(world)
	world.setup()
	var sim = Sim.new()
	world.set_preview(2,"revolver")
	for i in range(5):
		world.sync(sim,0.016)
	check("lobby preview persists against old run chapter", world._chapter == 2 and int(sim.config.chapter) == 0)
	check("lobby selected weapon is held by hero", world._last_weapon == "revolver")
	world.set_preview(1,"katana")
	world.sync(sim,0.016)
	check("changing preview rebuilds map and held weapon", world._chapter == 1 and world._last_weapon == "katana")
	world.set_preview(9,"invalid")
	world.sync(sim,0.016)
	check("invalid preview values have safe fallbacks", world._chapter == 2 and world._last_weapon == "kunai")

	sim.start({"weapon":"revolver","chapter":0},884)
	sim.director_enabled = false
	world.sync(sim,0.016)
	check("starting a run replaces preview with run map", world._chapter == 0 and world._last_weapon == "revolver" and not world._lobby.visible)
	var base_weapon_parts: int = world._hero_weapon.get_child_count()
	sim.player.levels.revolver = 5
	sim.player.evolved.revolver = true
	world.sync(sim,0.016)
	check("evolution changes held weapon geometry", world._last_evolved and world._hero_weapon.get_child_count() > base_weapon_parts)
	var parts: int = world._hero.right_arm.get_child_count()
	for i in range(12):
		sim.player.evolved.revolver = i % 2 == 0
		world.sync(sim,0.016)
	check("replacing weapon meshes does not accumulate attached nodes", world._hero.right_arm.get_child_count() == parts)

	var populations: Array = []
	var signatures: Array = []
	for chapter in range(3):
		sim.config.chapter = chapter
		world.sync(sim,0.016)
		var batch: MultiMeshInstance3D = world._scenery.get_child(0)
		populations.append(batch.multimesh.instance_count)
		signatures.append(world._scenery_signature)
		check("chapter %d scenery stays batched and bounded" % chapter, world._scenery.get_child_count() == 1 and batch.multimesh.instance_count < 1800)
		check("chapter %d ground theme matches selection" % chapter, int(world._ground_material.get_shader_parameter("biome")) == chapter)
	check("chapter props differ in geometry, not only color", populations[0] != populations[1] and populations[1] != populations[2] and signatures[0] != signatures[2], str(populations))

	sim.shots.clear()
	sim.areas.clear()
	sim.spawn_enemy("grunt",Vector2(160,-50))
	sim.fire("revolver")
	var before: String = JSON.stringify(sim.snapshot())
	world.sync(sim,0.016)
	check("firing drives visible recoil", world._recoil > 0.9 and world._hero_weapon.position.z < 0.13)
	check("firing draws muzzle core and projectile trail", world._shot_flash > 0 and world._counts.orbs > 0 and world._counts.trails > 0)
	check("feedback does not mutate combat or RNG", before == JSON.stringify(sim.snapshot()))
	world.sync(sim,0.3)
	check("an already-seen shot does not retrigger recoil", world._recoil == 0 and world._shot_flash == 0)

	sim.player.invuln = 0.0
	sim.hurt(25,"contact")
	world.sync(sim,0.016)
	check("real damage creates bounded optional camera feedback", world._hit_feedback > 0 and world._shake_offset.length() > 0 and world._shake_offset.length() < 0.2)
	var origin: Vector2 = world.camera.unproject_position(Vector3.ZERO)
	var up: Vector2 = world.camera.unproject_position(Vector3(0,0,-1))
	check("hit shake preserves W screen-up and horizontal alignment", up.y < origin.y and absf(up.x-origin.x) < 0.01)
	sim.state = "paused"
	var frozen: Array = [world._clock,world._recoil,world._hit_feedback,world._shake_offset,world.camera.transform]
	world.sync(sim,2.0)
	check("pause freezes hit and recoil clocks", world._clock == frozen[0] and world._recoil == frozen[1] and world._hit_feedback == frozen[2])
	check("pause freezes camera feedback", world._shake_offset == frozen[3] and world.camera.transform.is_equal_approx(frozen[4]))
	world.apply_settings({"screen_shake":false})
	world.sync(sim,0.016)
	check("camera shake setting takes effect immediately while paused", world._shake_offset == Vector3.ZERO)
	sim.state = "playing"
	sim.player.invuln = 0.0
	sim.hurt(10,"contact")
	world.sync(sim,0.016)
	check("disabled shake remains off for new damage", world._shake_offset == Vector3.ZERO and world._hit_feedback > 0)

	sim.effects = [{"id":8000,"kind":"hit","pos":Vector2.ZERO,"color":"#ffffff","life":0.3,"max":0.5,"text":"123"}]
	world.apply_settings({"damage_numbers":true})
	world.sync(sim,0.016)
	check("damage numbers enabled", world._floating_labels[0].visible and world._floating_labels[0].text == "123")
	world.apply_settings({"damage_numbers":false})
	world.sync(sim,0.016)
	check("damage numbers disabled without stale labels", not world._floating_labels[0].visible)
	sim.effects.append({"id":8001,"kind":"evolve","pos":Vector2.ZERO,"color":"#ffe8ac","life":0.8,"max":1.2,"text":"진화 완료"})
	world.sync(sim,0.016)
	check("evolution feedback survives damage-number setting", world._floating_labels[0].visible and world._floating_labels[0].text == "진화 완료")

	sim.effects.clear()
	for i in range(120):
		sim.effects.append({"id":9000+i,"kind":"kill","pos":Vector2(i%20*20,i/20*20),"color":"#91c980","life":0.3,"max":0.6,"text":""})
	world.apply_settings({"quality":true})
	world.sync(sim,0.016)
	check("kill impacts draw actual block debris", world._counts.debris > 0)
	var high_count: int = world._counts.debris
	world.apply_settings({"quality":false})
	world.sync(sim,0.016)
	check("low quality reduces cosmetic debris", world._counts.debris < high_count and world._counts.debris > 0)
	check("low quality disables shadows and MSAA", not world.sunlight.shadow_enabled and root.msaa_3d == Viewport.MSAA_DISABLED)
	for key in world._batches:
		check("G2 bounded geometry " + key, world._counts[key] <= world._batches[key].multimesh.instance_count)

	for dimensions in [Vector2i(390,844),Vector2i(844,390),Vector2i(1280,800)]:
		root.size = dimensions
		world.sync(sim,0.1)
		var center: Vector2 = world.camera.unproject_position(Vector3.ZERO)
		var north: Vector2 = world.camera.unproject_position(Vector3(0,0,-1))
		check("G2 screen-up at %dx%d" % [dimensions.x,dimensions.y], north.y < center.y)
	_check_oriented_geometry()

	var result = {"suite":"g2_render","engine":Engine.get_version_info().string,"mode":"headless geometry and state contracts; no GPU visual verification","passed":checks.size()-failures.size(),"failed":failures.size(),"checks":checks}
	var file = FileAccess.open("res://tests/g2_render_report.json",FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(result,"\t"))
	print("G2_RENDER: %d passed, %d failed" % [result.passed,result.failed])
	for failure in failures:
		printerr("FAIL: "+failure)
	quit(0 if failures.is_empty() else 1)

func _orthogonal(basis: Basis) -> bool:
	return absf(basis.x.normalized().dot(basis.y.normalized())) < 0.00001 and absf(basis.x.normalized().dot(basis.z.normalized())) < 0.00001 and absf(basis.y.normalized().dot(basis.z.normalized())) < 0.00001

func _check_oriented_geometry() -> void:
	# These are collision-space endpoints and widths. A camera screenshot can
	# disguise a global-axis scale as a thin/sheared polygon; verify world space.
	var world = GeometryProbe.new()
	root.add_child(world)
	world.setup()
	var from: Vector2 = Vector2(-137,83)
	for angle in [0.0,PI/4.0,PI/3.0,-PI/4.0,PI*0.7,PI]:
		var to: Vector2 = from+Vector2.from_angle(angle)*372.0
		for key in world._counts:
			world._counts[key] = 0
		world.uploads.clear()
		world._draw_threats([{"kind":"line","shape":"line","pattern":"charge","pos":from,"pos2":to,"width":84.0,"r":30.0,"delay":0.5,"warn":1.0,"active":false}])
		var corridor: Transform3D = world.uploads.telegraphs[0]
		var start: Vector3 = Vector3(from.x/40.0,0.07,from.y/40.0)
		var end: Vector3 = Vector3(to.x/40.0,0.07,to.y/40.0)
		var actual_start: Vector3 = corridor*Vector3(0,0,-0.5)
		var actual_end: Vector3 = corridor*Vector3(0,0,0.5)
		var label: String = "%.0f degrees" % rad_to_deg(angle)
		check("charge corridor endpoints match collision at "+label, actual_start.distance_to(start) < 0.0001 and actual_end.distance_to(end) < 0.0001)
		check("charge corridor center and width match collision at "+label, corridor.origin.distance_to((start+end)*0.5) < 0.0001 and is_equal_approx(corridor.basis.x.length(),84.0/40.0))
		check("charge corridor is rectangular at "+label, _orthogonal(corridor.basis) and is_equal_approx(corridor.basis.y.length(),0.035))
	var lines: Array = [
		[Vector3(-2,0.07,4),Vector3(6,0.07,-3)],
		[Vector3(3,1.7,-2),Vector3(-4,7.2,5)],
		[Vector3(1,-1,2),Vector3(1,8,2)]]
	for i in range(lines.size()):
		world._counts.glow = 0
		world.uploads.clear()
		var a: Vector3 = lines[i][0]
		var b: Vector3 = lines[i][1]
		world._line(a,b,0.12,Color.WHITE)
		var beam: Transform3D = world.uploads.glow[0]
		var one: Vector3 = beam*Vector3(0,0,-0.5)
		var two: Vector3 = beam*Vector3(0,0,0.5)
		check("3D beam %d endpoints align to source points" % i, (one.distance_to(a)<0.0001 and two.distance_to(b)<0.0001) or (one.distance_to(b)<0.0001 and two.distance_to(a)<0.0001))
		check("3D beam %d width stays uniform without shear" % i, _orthogonal(beam.basis) and is_equal_approx(beam.basis.x.length(),0.12) and is_equal_approx(beam.basis.y.length(),0.12))
	world._counts.actors = 0
	world.uploads.clear()
	var orientation: Basis = Basis(Vector3.UP,PI/4.0)
	var part_size: Vector3 = Vector3(0.4,0.8,0.2)
	world._enemy_part(Vector3(3,0,2),orientation,Vector3(1,0.5,0),part_size,Color.WHITE,2.0)
	var actor: Transform3D = world.uploads.actors[0]
	check("rotated actor parts retain local proportions", actor.basis.get_scale().is_equal_approx(part_size*2.0) and _orthogonal(actor.basis))
	check("rotated actor offsets match its facing basis", actor.origin.is_equal_approx(Vector3(3,0,2)+orientation*Vector3(2,1,0)))
	world.queue_free()
