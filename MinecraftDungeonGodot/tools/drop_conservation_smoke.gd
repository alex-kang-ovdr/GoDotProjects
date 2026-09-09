extends SceneTree

var assertions := 0
var failures: Array[String] = []


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world: VoxelWorld = instance.get_node("VoxelWorld")
	var player: VoxelPlayer = instance.get_node("Player")
	player.set_physics_process(false)
	var y: int = Array(world.layout.heights).max() + 8
	player.position = Vector3(0.5, y, 0.5)
	for slot in 9: player.inventory.consume(slot, player.inventory.count(slot))
	var ledger := {"produced": 0, "consumed": 0, "callback_errors": 0, "callbacks": 0}
	var audit := func() -> void:
		ledger.callbacks += 1
		if _owned_items(world, player) != ledger.produced - ledger.consumed: ledger.callback_errors += 1
	player.inventory.changed.connect(audit)
	var transferred := 0
	var batch := 0
	var started := Time.get_ticks_msec()
	while transferred < 10000:
		var amount := mini(64, 10000 - transferred)
		var slot := batch % 9
		# With a dynamic backpack only a full 36-slot inventory blocks pickup.
		var blocked := batch % 10 == 0
		if blocked:
			ledger.produced += 64 * BlockInventory.SLOT_COUNT
			_expect(player.inventory.add(slot, 64 * BlockInventory.SLOT_COUNT), "full-backpack fixture uses inventory API")
		for unused in amount:
			ledger.produced += 1
			world.drops.spawn_item(slot, 1, player.position + Vector3(0.3, 0.7, 0), Vector3.ZERO, 0)
		if blocked:
			for unused in 3: await physics_frame
			_expect(world.drops.bodies.size() == amount and player.inventory.count(slot) == 64, "full stack keeps every spawned item")
			for index in BlockInventory.SLOT_COUNT:
				ledger.consumed += 64
				_expect(player.inventory.consume(index, 64), "capacity reopened through inventory API")
		var deadline := Time.get_ticks_msec() + 3000
		while not world.drops.bodies.is_empty() and Time.get_ticks_msec() < deadline: await physics_frame
		_expect(world.drops.bodies.is_empty() and player.inventory.total(slot) == amount, "batch transfers exactly once through real physics pickup")
		_expect(_owned_items(world, player) == ledger.produced - ledger.consumed, "batch item conservation")
		if not world.drops.bodies.is_empty(): break
		transferred += amount
		ledger.consumed += amount
		_expect(player.inventory.item_at(0) == slot and player.inventory.consume(0, amount), "consume transferred batch from first free slot")
		batch += 1
	_expect(transferred == 10000 and _owned_items(world, player) == 0, "10000 physical item transfers end with balanced ledger")
	_expect(ledger.callback_errors == 0 and ledger.callbacks >= 10000, "inventory callbacks never observe duplicate or missing ownership")
	player.inventory.changed.disconnect(audit)
	# Exercise the real maximum body count and atomic mining refusal, not only
	# the serialized-array validator. This short burst is not a sustained FPS test.
	world.drops.clear_items()
	player.inventory.add(0, 64 * BlockInventory.SLOT_COUNT)
	for unused in WorldDrops.MAX_DROPS:
		world.drops.spawn_item(0, 1, player.position + Vector3(0.3, 0.7, 0), Vector3.ZERO, 0)
	for unused in 5: await physics_frame
	_expect(world.drops.bodies.size() == WorldDrops.MAX_DROPS, "2048 real physics drops survive blocked pickup")
	var target := Vector3i(3, y, 0)
	world.set_cell_item(target, BlockRegistry.STONE)
	var wear := int(player.mining_tools.remaining[1])
	var mined := player.total_mined
	_expect(not world.finish_mining(target, BlockRegistry.STONE, player), "drop limit rejects mining commit")
	_expect(world.get_cell_item(target) == BlockRegistry.STONE and player.total_mined == mined and player.mining_tools.remaining[1] == wear, "drop limit preserves block/tool/counter atomically")
	_expect(WorldDrops.validate(world.drops.capture()).is_empty(), "maximum physical set remains saveable")
	world.drops.clear_items()
	for unused in 3: await process_frame
	for failure in failures: push_error(failure)
	print("DROP CONSERVATION: %d assertions, %d failures, transferred=%d callbacks=%d elapsed_ms=%d" % [assertions, failures.size(), transferred, ledger.callbacks, Time.get_ticks_msec() - started])
	instance.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)


func _owned_items(world: VoxelWorld, player: VoxelPlayer) -> int:
	var result := 0
	for slot in BlockInventory.SLOT_COUNT: result += player.inventory.count(slot)
	result += player.inventory.cursor[1]
	for body: RigidBody3D in world.drops.bodies: result += int(body.get_meta("amount"))
	return result


func _expect(condition: bool, label: String) -> void:
	assertions += 1
	if not condition:
		failures.append(label)
		print("DROP CONSERVATION FAIL: " + label)
