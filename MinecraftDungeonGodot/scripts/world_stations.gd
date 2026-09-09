class_name WorldStations
extends Node3D

signal changed
var world: VoxelWorld
var visuals: Dictionary = {}
var observed_store: WeakRef
var observed_serial := -1


func _physics_process(delta: float) -> void:
	advance(delta)


func advance(delta: float) -> void:
	if world.gameplay_locked() or world.chunk_store.stations.is_empty(): return
	var store := world.chunk_store
	store.station_tick_remainder += delta
	var altered := false
	while store.station_tick_remainder + 0.000000001 >= 0.05:
		store.station_tick_remainder = maxf(0, store.station_tick_remainder - 0.05)
		for state: Dictionary in store.stations.values(): altered = StationState.tick(state) or altered
	if altered:
		_sync_heat()
		changed.emit()


func _process(_delta: float) -> void:
	if observed_store == null or observed_store.get_ref() != world.chunk_store or observed_serial != world.chunk_store.change_serial:
		refresh_visuals()


func refresh_visuals() -> void:
	for node: Node3D in visuals.values():
		remove_child(node)
		node.queue_free()
	visuals.clear()
	observed_store = weakref(world.chunk_store)
	observed_serial = world.chunk_store.change_serial
	for cell: Vector3i in world.chunk_store.stations:
		var state: Dictionary = world.chunk_store.stations[cell]
		var node := Node3D.new()
		node.position = Vector3(cell) + Vector3.ONE * 0.5
		add_child(node)
		visuals[cell] = node
		# Face details retain the shared voxel material and collision contract.
		var chest := int(state.kind) == ItemRegistry.CHEST
		for direction: Vector3 in [Vector3.FORWARD, Vector3.BACK, Vector3.LEFT, Vector3.RIGHT]:
			var face := MeshInstance3D.new()
			var box := BoxMesh.new()
			box.size = Vector3(0.68, 0.12 if chest else 0.4, 0.025)
			var material := StandardMaterial3D.new()
			material.albedo_color = Color("#3a2518") if chest else Color("#171c22")
			box.material = material
			face.mesh = box
			face.position = direction * 0.505 + Vector3.UP * (0.12 if chest else -0.04)
			face.rotation.y = atan2(direction.x, direction.z)
			node.add_child(face)
			if chest:
				var latch := MeshInstance3D.new()
				var latch_box := BoxMesh.new()
				latch_box.size = Vector3(0.12, 0.23, 0.04)
				var gold := StandardMaterial3D.new()
				gold.albedo_color = Color("#dab85f")
				latch_box.material = gold
				latch.mesh = latch_box
				latch.position = direction * 0.525
				latch.rotation.y = face.rotation.y
				node.add_child(latch)
	_sync_heat()
	changed.emit()


func _sync_heat() -> void:
	for cell: Vector3i in visuals:
		var state: Dictionary = world.chunk_store.stations.get(cell, {})
		if state.is_empty() or int(state.kind) != ItemRegistry.FURNACE: continue
		var node: Node3D = visuals[cell]
		var burning := int(state.burn) > 0
		if node.has_meta("burning") and bool(node.get_meta("burning")) == burning: continue
		node.set_meta("burning", burning)
		for face: MeshInstance3D in node.get_children():
			var material: StandardMaterial3D = face.mesh.material
			material.albedo_color = Color("#d16924") if burning else Color("#171c22")
			material.emission_enabled = burning
			material.emission = Color("#9b3416")


func target_cell(player: VoxelPlayer) -> Variant:
	var target := world.get_target(player.camera.global_position, -player.camera.global_basis.z)
	if target.has("hit") and world.chunk_store.stations.has(target.hit): return target.hit
	return null


func click(cell: Vector3i, slot: int, inventory: BlockInventory, half: bool = false) -> bool:
	if world.gameplay_locked() or not world.chunk_store.stations.has(cell): return false
	var result := StationState.click(world.chunk_store.stations[cell], inventory, slot, half)
	if result: changed.emit()
	return result
