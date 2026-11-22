extends RefCounted
## 표적의 평행 이동만 따르는 극좌표 명령. 회전 기준은 드래그 시작 시 고정한다.
var target: ShipBody
var active := false
var dragging := false
var distance := 0.0
var angle := 0.0
var minimum_range := 0.0
var base_direction := Vector2.RIGHT

func begin(ship: ShipBody, player_position: Vector2, clearance: float) -> void:
	cancel()
	if not is_instance_valid(ship) or not player_position.is_finite() or not is_finite(clearance):
		return
	target = ship
	if not valid():
		cancel()
		return
	minimum_range = maxf(clearance, 0.0)
	var offset := player_position - target.global_position
	if offset.length_squared() > 0.0001:
		base_direction = offset.normalized()
	distance = maxf(offset.length(), safe_radius())
	dragging = true

func valid() -> bool:
	if not is_instance_valid(target) or target.is_queued_for_deletion() or target.is_destroying:
		return false
	var core: PartData = target.model.core_part()
	return core != null and core.hp > 0.0 and target.global_position.is_finite()

func safe_radius() -> float:
	return minimum_range + target.hull_bound_radius if valid() else minimum_range

func update_pointer(world_point: Vector2) -> void:
	if not dragging or not valid() or not world_point.is_finite():
		return
	var offset := world_point - target.global_position
	distance = maxf(offset.length(), safe_radius())
	if offset.length_squared() > 0.0001:
		angle = base_direction.angle_to(offset)

func commit() -> bool:
	if not dragging or not valid():
		cancel()
		return false
	dragging = false
	active = true
	return true

func cancel() -> void:
	target = null
	active = false
	dragging = false
	distance = 0.0
	angle = 0.0
	minimum_range = 0.0
	base_direction = Vector2.RIGHT

func destination() -> Vector2:
	if not valid():
		return Vector2.ZERO
	return target.global_position + base_direction.rotated(angle) * maxf(distance, safe_radius())

func geometry() -> Dictionary:
	if not valid():
		return {}
	var radius := maxf(distance, safe_radius())
	return {"center": target.global_position, "base_end": target.global_position + base_direction * radius,
		"desired_end": destination(), "angle": angle, "radius": radius}
