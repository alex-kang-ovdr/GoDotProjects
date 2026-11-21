class_name BlockOrientation
extends RefCounted

# Face x quarter-turn contract in Godot Y-up. State 0 is identity.
const NORMALS := [Vector3.UP, Vector3.DOWN, Vector3.RIGHT, Vector3.LEFT, Vector3.BACK, Vector3.FORWARD]
const COUNT := 24


static func from_hit(normal: Vector3, yaw: float) -> int:
	var face := 0
	var best := -INF
	for index in NORMALS.size():
		var score: float = normal.dot(NORMALS[index])
		if score > best:
			best = score
			face = index
	return face * 4 + posmod(roundi(yaw / (PI * 0.5)), 4)


static func rotation(state: int) -> Basis:
	var y: Vector3 = NORMALS[int(state / 4)]
	var x := Vector3.RIGHT if absf(y.y) > 0.5 else Vector3.UP
	var z := x.cross(y)
	# Integer quarter turns avoid trigonometric round-off at cell seams.
	for unused in state % 4:
		var previous := x
		x = -z
		z = previous
	return Basis(x, y, z)


static func log_uv(point: Vector3, normal: Vector3, state: int) -> Vector2:
	var inverse := rotation(state).transposed()
	var p := inverse * (point - Vector3.ONE * 0.5)
	var n := inverse * normal
	if absf(n.y) > 0.5:
		return Vector2(p.x * signf(n.y) + 0.5 + 64.0, p.z + 0.5)
	if absf(n.x) > 0.5: return Vector2(p.z * -signf(n.x) + 0.5, -p.y + 0.5)
	return Vector2(p.x * signf(n.z) + 0.5, -p.y + 0.5)
