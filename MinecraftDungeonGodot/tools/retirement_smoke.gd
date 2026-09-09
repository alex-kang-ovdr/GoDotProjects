extends SceneTree

class TestWorld:
	extends VoxelWorld
	var hold_retirement := false
	var fail_retirement := false
	var delayed_retirement := false
	var release_gate := Semaphore.new()
	func _start_retirement_job(retired: Dictionary) -> Error:
		if fail_retirement: return ERR_CANT_CREATE
		if hold_retirement: return retirement_worker.start(_held_release.bind(retired, release_gate))
		if delayed_retirement: return retirement_worker.start(_delayed_release.bind(retired))
		return super._start_retirement_job(retired)
	static func _held_release(retired: Dictionary, gate: Semaphore) -> int:
		gate.wait()
		return VoxelWorld._release_retired_data(retired)
	static func _delayed_release(retired: Dictionary) -> int:
		OS.delay_msec(100)
		return VoxelWorld._release_retired_data(retired)

var failures: Array[String] = []
var assertions := 0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var world := TestWorld.new()
	root.add_child(world)
	world.generation_trace_enabled = true
	var old_layout: Dictionary = world.layout
	var old_store: VoxelChunkStore = world.chunk_store
	var old_masks: Dictionary = world.face_masks
	var old_geometry: Dictionary = world.plane_geometry
	var old_store_count := old_store.chunks.size()
	var old_mask_count := old_masks.size()
	var old_geometry_count := old_geometry.size()
	world.hold_retirement = true
	_expect(world.request_generation(-7, 43, false), "first replacement starts")
	await _wait_state(world, "SETTLING")
	_expect(world.generating and world.gameplay_locked() and world.retirement_worker != null, "retirement keeps gameplay locked")
	_expect(not world.request_generation(42, 41, true), "retirement cannot overlap a new generation")
	for unused in 5: await process_frame
	_expect(world.generating and world.generation_state == "SETTLING", "physics settling alone cannot release a live retirement worker")
	world.release_gate.post()
	await _wait_ready(world)
	_expect(world.generation_state == "READY" and not world.gameplay_locked() and world.retirement_worker == null, "retirement joined before unlocking")
	_expect(world.generation_retirement_mode == "worker", "worker retirement reports its mode")
	_expect(old_layout.cells.size() == 47146 and old_layout.signature == 2029358965, "retained immutable layout is not cleared")
	_expect(old_store.base_cells.size() == 47146 and old_store.chunks.size() == old_store_count, "retained old store is not mutated")
	_expect(old_masks.size() == old_mask_count and old_geometry.size() == old_geometry_count, "retained masks and plane geometry are not cleared")
	_expect(DeterministicWorldGenerator.signature(old_layout.cells) == 2029358965, "retained old cells keep their contents")
	_expect(world.plane_geometry.size() == world.chunk_nodes.size(), "new world owns matching cache and bodies")
	_expect(world.retired_bodies.is_empty(), "all old physics/render bodies retire before unlock")
	var labels := {}
	for sample: Dictionary in world.generation_stage_samples: labels[sample.stage] = true
	_expect(labels.has_all(["receive_worker", "chunk", "clear_old", "adopt_data", "retirement_dispatch", "retirement_join", "completion_listeners"]), "trace covers complete replacement lifecycle")
	world.hold_retirement = false
	world.fail_retirement = true
	_expect(world.request_generation(42, 41, true), "thread failure fallback replacement starts")
	await _wait_ready(world)
	_expect(world.generation_state == "PASS" and world.generation_retirement_mode == "inline_fallback", "thread start failure uses safe reported fallback")
	_expect(world.retirement_worker == null and not world.gameplay_locked(), "fallback does not leak thread or lock")
	_expect(world.layout.signature == 1765707479, "fallback preserves requested world hash")
	var floor_cell: Vector3i = world.layout.spawn + Vector3i.DOWN
	_expect(not world.get_target(Vector3(floor_cell) + Vector3(0.5, 4, 0.5), Vector3.DOWN).is_empty(), "replacement collision is live after fallback")
	world.fail_retirement = false
	world.delayed_retirement = true
	_expect(world.request_generation(1337, 41, false), "shutdown case starts")
	await _wait_state(world, "SETTLING")
	var worker := world.retirement_worker
	_expect(worker != null and worker.is_started(), "shutdown has an owned live retirement thread")
	var weak_world: WeakRef = weakref(world)
	world.queue_free()
	await process_frame
	await process_frame
	_expect(weak_world.get_ref() == null and not worker.is_started(), "world shutdown joins retirement before destruction")
	for failure in failures: push_error(failure)
	print("RETIREMENT SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _wait_state(world: VoxelWorld, state: String) -> void:
	var deadline := Time.get_ticks_msec() + 10000
	while world.generating and world.generation_state != state and Time.get_ticks_msec() < deadline: await process_frame
	_expect(world.generation_state == state, "bounded wait for " + state)


func _wait_ready(world: VoxelWorld) -> void:
	var deadline := Time.get_ticks_msec() + 10000
	while world.generating and Time.get_ticks_msec() < deadline: await process_frame
	_expect(not world.generating, "bounded retirement completion")


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
