class_name WorldDrops
extends Node3D

const MAX_DROPS := 2048
const PICKUP_DELAY := 0.35
var world: VoxelWorld
var player: VoxelPlayer
var bodies: Array[RigidBody3D] = []


func spawn_item(slot: int, amount: int, at: Vector3, motion := Vector3(0, 1, 0), delay := PICKUP_DELAY) -> void:
	var body := RigidBody3D.new()
	body.collision_layer = 2
	body.collision_mask = 1
	body.lock_rotation = true
	body.continuous_cd = true
	body.mass = 0.1
	body.linear_damp_mode = RigidBody3D.DAMP_MODE_REPLACE
	body.linear_damp = 0.5
	body.position = at
	body.linear_velocity = motion
	body.set_meta("slot", slot)
	body.set_meta("amount", amount)
	body.set_meta("delay", delay)
	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3.ONE * 0.25
	if slot < 9: box.material = world.materials[int(BlockRegistry.by_slot(slot).material)]
	else:
		var material := StandardMaterial3D.new()
		material.albedo_color = ItemRegistry.display_color(slot)
		box.material = material
	mesh.mesh = box
	if slot == 8:
		mesh.mesh = world.log_mesh
		mesh.scale = Vector3.ONE * 0.25
	body.add_child(mesh)
	var collision := CollisionShape3D.new()
	var shape := BoxShape3D.new()
	shape.size = box.size
	collision.shape = shape
	body.add_child(collision)
	add_child(body)
	if is_instance_valid(player): body.add_collision_exception_with(player)
	bodies.append(body)


func _physics_process(delta: float) -> void:
	if not is_instance_valid(world) or not is_instance_valid(player): return
	for body in bodies.duplicate():
		var locked := world.gameplay_locked()
		if locked != body.freeze:
			if locked: body.set_meta("paused_velocity", body.linear_velocity)
			body.freeze = locked
			if not locked: body.linear_velocity = body.get_meta("paused_velocity", Vector3.ZERO)
		if locked: continue
		# Preserve fallen loot in this bounded world instead of silently despawning.
		if body.position.y < -64 or body.position.y > 29000 or absf(body.position.x) > 29000 or absf(body.position.z) > 29000:
			body.position = world.spawn_position() + Vector3.UP
			body.linear_velocity = Vector3.ZERO
			body.set_meta("delay", PICKUP_DELAY)
		var delay := maxf(0.0, float(body.get_meta("delay")) - delta)
		body.set_meta("delay", delay)
		if delay > 0 or player.controls_open: continue
		var origin := player.global_position + Vector3.UP * 0.7
		if origin.distance_squared_to(body.global_position) > 1.5 * 1.5: continue
		var ray := PhysicsRayQueryParameters3D.create(origin, body.global_position, 1, [player.get_rid()])
		if not get_world_3d().direct_space_state.intersect_ray(ray).is_empty(): continue
		var slot := int(body.get_meta("slot"))
		var amount := int(body.get_meta("amount"))
		if not player.inventory.can_add(slot, amount): continue
		# Remove authoritative ownership before inventory.changed can capture a save.
		bodies.erase(body)
		body.collision_layer = 0
		body.collision_mask = 0
		body.freeze = true
		body.queue_free()
		player.inventory.add(slot, amount)
		world.action_feedback.emit("Picked up %s x%d" % [ItemRegistry.definition(slot).name, amount])


func clear_items() -> void:
	for body in bodies:
		remove_child(body)
		body.queue_free()
	bodies.clear()


func capture() -> Array:
	var result := []
	for body in bodies:
		var p := body.position
		var v: Vector3 = body.get_meta("paused_velocity", body.linear_velocity) if body.freeze else body.linear_velocity
		result.append({"slot": int(body.get_meta("slot")), "amount": int(body.get_meta("amount")), "position": [p.x, p.y, p.z], "velocity": [v.x, v.y, v.z], "delay": float(body.get_meta("delay"))})
	return result


func restore(rows: Array) -> void:
	clear_items()
	for row: Dictionary in rows:
		spawn_item(int(row.slot), int(row.amount), Vector3(row.position[0], row.position[1], row.position[2]), Vector3(row.velocity[0], row.velocity[1], row.velocity[2]), float(row.delay))


static func validate(rows: Variant) -> String:
	if not rows is Array or rows.size() > MAX_DROPS: return "drop list is invalid"
	for row: Variant in rows:
		if not row is Dictionary: return "drop is not an object"
		if not SavedPlayerState.integer_in_range(row.get("slot"), 0, ItemRegistry.FURNACE) or not SavedPlayerState.integer_in_range(row.get("amount"), 1, 64): return "drop stack is invalid"
		if not SavedPlayerState.finite_number(row.get("delay")) or row.delay < 0 or row.delay > PICKUP_DELAY: return "drop delay is invalid"
		for field in ["position", "velocity"]:
			var values: Variant = row.get(field)
			if not values is Array or values.size() != 3: return "drop vector is invalid"
			for value: Variant in values:
				if not SavedPlayerState.finite_number(value) or absf(float(value)) > (30000.0 if field == "position" else 200.0): return "drop coordinate/velocity is invalid"
	return ""
