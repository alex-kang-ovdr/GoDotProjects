class_name BallKinematics
extends RefCounted

const EPSILON := 0.000000000001

static func simulate(
		start_position_m: Vector3,
		linear_velocity_mps: Vector3,
		duration_s: float,
		fixed_dt_s: float = 1.0 / 60.0,
		gravity_mps2: Vector3 = Vector3(0.0, -9.81, 0.0)
	) -> Array[Dictionary]:
	if duration_s < 0.0 or fixed_dt_s <= 0.0:
		return []

	var snapshots: Array[Dictionary] = [{
		"snapshot_index": 0,
		"time_s": 0.0,
		"position_m": start_position_m,
		"linear_velocity_mps": linear_velocity_mps,
	}]
	var position_m := start_position_m
	var velocity_mps := linear_velocity_mps
	var elapsed_s := 0.0
	var remaining_s := duration_s
	var snapshot_index := 0
	while remaining_s > EPSILON:
		var dt_s := minf(remaining_s, fixed_dt_s)
		position_m += velocity_mps * dt_s + gravity_mps2 * (0.5 * dt_s * dt_s)
		velocity_mps += gravity_mps2 * dt_s
		elapsed_s += dt_s
		remaining_s -= dt_s
		snapshot_index += 1
		snapshots.append({
			"snapshot_index": snapshot_index,
			"time_s": elapsed_s,
			"position_m": position_m,
			"linear_velocity_mps": velocity_mps,
		})
	return snapshots
