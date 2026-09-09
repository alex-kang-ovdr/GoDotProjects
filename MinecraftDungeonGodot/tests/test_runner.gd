extends SceneTree

var failures: Array[String] = []
var assertions := 0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	_test_registry()
	_test_inventory()
	_test_chunk_coordinates()
	_test_chunk_store()
	_test_generation()
	if failures.is_empty():
		print("PASS: %d assertions across registry, inventory, chunk journal, persistence, and deterministic generation" % assertions)
		quit(0)
	else:
		for failure in failures:
			push_error(failure)
		print("FAIL: %d assertion(s)" % failures.size())
		quit(1)


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition:
		failures.append(message)


func _test_registry() -> void:
	_expect(BlockRegistry.validate().is_empty(), "registry must validate")
	_expect(BlockRegistry.DEFINITIONS.size() == 12, "registry must contain 12 materials")
	for slot in BlockRegistry.HOTBAR_SLOT_COUNT:
		_expect(not BlockRegistry.by_slot(slot).is_empty(), "slot %d must map exactly once" % slot)
	_expect(BlockRegistry.by_material(BlockRegistry.STONE).drop_slot == 0, "stone must drop cobblestone")
	_expect(not BlockRegistry.by_material(BlockRegistry.WATER).recoverable, "water must not be recoverable")
	_expect(not BlockRegistry.by_material(BlockRegistry.LEAVES).recoverable, "leaves must not be recoverable")


func _test_inventory() -> void:
	var inventory := BlockInventory.new(8)
	_expect(inventory.count(0) == 8, "inventory must start with 8 blocks")
	_expect(inventory.consume(0), "available item must be consumable")
	_expect(inventory.count(0) == 7, "consume must subtract exactly one")
	_expect(inventory.add(0), "space must accept one item")
	for unused in range(56):
		inventory.add(0)
	_expect(inventory.count(0) == 64, "stack must cap at 64")
	_expect(inventory.add(0) and inventory.count(9) == 1 and inventory.item_at(9) == 0, "full stack overflows into backpack")
	_expect(not inventory.consume(-1), "invalid slot must be rejected")


func _test_chunk_coordinates() -> void:
	_expect(DeterministicWorldGenerator.world_to_chunk(Vector3i(15, 0, 15)) == Vector3i(0, 0, 0), "positive chunk boundary")
	_expect(DeterministicWorldGenerator.world_to_chunk(Vector3i(16, 0, 16)) == Vector3i(1, 0, 1), "next positive chunk")
	_expect(DeterministicWorldGenerator.world_to_chunk(Vector3i(-1, 0, -1)) == Vector3i(-1, 0, -1), "negative coordinate must floor")
	_expect(DeterministicWorldGenerator.world_to_local(Vector3i(-1, 0, -1)) == Vector3i(15, 0, 15), "negative local coordinate")


func _test_chunk_store() -> void:
	var base := {Vector3i.ZERO: BlockRegistry.STONE, Vector3i(15, 0, 0): BlockRegistry.GRASS}
	var store := VoxelChunkStore.new()
	store.initialize(1337, 41, base)
	store.set_block(Vector3i.ZERO, -1)
	store.set_block(Vector3i(15, 0, 0), BlockRegistry.BRICK)
	_expect(store.get_block(Vector3i.ZERO) == -1, "edit must override generated block")
	_expect(store.edits.size() == 2, "only changed cells belong in the journal")
	var dirty := store.consume_dirty_chunks()
	_expect(dirty.has(Vector3i.ZERO), "edited chunk must be dirty")
	_expect(dirty.has(Vector3i.LEFT), "zero boundary must dirty the negative neighbor")
	_expect(dirty.has(Vector3i.RIGHT), "15 boundary must dirty the positive neighbor")
	var state := {"position": [1.0, 2.0, 3.0], "inventory": [8, 8, 8, 8, 8, 8, 8, 8, 8], "yaw": 0.0, "pitch": 0.0, "selected_slot": 0}
	state.tools = MiningTools.new().capture()
	state.inventory = BlockInventory.migrate_legacy(state.inventory)
	state.drops = []
	var encoded := store.encode(state)
	_expect(encoded == store.encode(state), "save serialization must be deterministic")
	var restored := VoxelChunkStore.new()
	restored.initialize(1337, 41, base)
	var result := restored.decode(encoded)
	_expect(result.ok and restored.edits == store.edits, "save journal must round trip")
	var wrong_world := VoxelChunkStore.new()
	wrong_world.initialize(42, 41, base)
	_expect(not wrong_world.decode(encoded).ok, "save from another seed must be rejected")
	var envelope: Dictionary = JSON.parse_string(encoded)
	var tampered_payload: Dictionary = JSON.parse_string(envelope.payload)
	tampered_payload.edits[0][3] = BlockRegistry.SAND
	envelope.payload = JSON.stringify(tampered_payload)
	_expect(not restored.decode(JSON.stringify(envelope)).ok, "modified payload must fail checksum validation")
	var bulk := VoxelChunkStore.new()
	bulk.initialize(-7, 185, {})
	for index in 1000:
		bulk.set_block(Vector3i(index - 500, index % 17, -index), index % BlockRegistry.MATERIAL_COUNT)
	var bulk_copy := VoxelChunkStore.new()
	bulk_copy.initialize(-7, 185, {})
	_expect(bulk_copy.decode(bulk.encode()).ok and bulk_copy.edits.size() == 1000, "1,000 edits must round trip")


func _test_generation() -> void:
	var first := DeterministicWorldGenerator.generate(1337, 41)
	var second := DeterministicWorldGenerator.generate(1337, 41)
	var other := DeterministicWorldGenerator.generate(-7, 41)
	_expect(first.signature == second.signature, "same seed and size must have the same signature")
	_expect(first.signature != other.signature, "different seeds should change the signature")
	_expect(first.cells.size() > 5000, "41 world must contain a playable terrain volume")
	var spawn: Vector3i = first.spawn
	_expect(not first.cells.has(spawn), "spawn cell must be empty")
	_expect(first.cells.has(spawn + Vector3i.DOWN), "spawn must have ground")
	_expect(first.biome_counts.size() == 6, "six biome counters must be present")
	_expect(first.cheese_caves.size() > 0, "cheese caves must be generated")
	_expect(first.spaghetti_caves.size() > 0, "spaghetti caves must be generated")
	_expect(first.ravine_cells.size() > 0, "a ravine must be generated")
	_expect(first.ore_cells.size() > 0, "ore markers must be generated")
	_expect(first.spring_cells.size() > 0, "a coast spring must be generated")
	_expect(first.structures.size() >= 4, "available biomes must receive landmarks")
	for cell: Vector3i in first.cheese_caves:
		_expect(not first.cells.has(cell), "cheese cave cells must remain empty")
		break
