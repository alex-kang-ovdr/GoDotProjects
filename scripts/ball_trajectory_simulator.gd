class_name BallTrajectorySimulator
extends RefCounted

## Standalone trajectory generator and player. It does not access Godot physics APIs.
enum PlaybackState {
	SIMULATED,
	PLAYING,
	PAUSED,
	STOPPED,
}

const EPSILON := 0.000001

var snapshots: Array[Dictionary] = []
var playback_time_s := 0.0
var state := PlaybackState.STOPPED

func simulate(
		initial_position: Vector3,
		initial_velocity: Vector3,
		gravity: Vector3,
		floor_y: float,
		duration_s: float,
		fixed_dt_s: float,
		bounce_restitution: float,
	) -> bool:
	snapshots.clear()
	playback_time_s = 0.0
	state = PlaybackState.STOPPED
	if duration_s <= 0.0 or fixed_dt_s <= 0.0 or bounce_restitution < 0.0:
		return false

	var position := initial_position
	var velocity := initial_velocity
	var simulation_time_s := 0.0
	snapshots.append(_make_snapshot(simulation_time_s, position, velocity))
	while simulation_time_s + EPSILON < duration_s:
		var step_s := minf(fixed_dt_s, duration_s - simulation_time_s)
		var next_position := position + velocity * step_s + gravity * (0.5 * step_s * step_s)
		var next_velocity := velocity + gravity * step_s
		if next_position.y < floor_y:
			next_position.y = floor_y
			next_velocity.y = absf(next_velocity.y) * bounce_restitution
			next_velocity.x *= 0.96
			next_velocity.z *= 0.96
		position = next_position
		velocity = next_velocity
		simulation_time_s += step_s
		snapshots.append(_make_snapshot(simulation_time_s, position, velocity))

	state = PlaybackState.SIMULATED
	return true

func play() -> bool:
	if snapshots.is_empty() or state == PlaybackState.STOPPED:
		return false
	state = PlaybackState.PLAYING
	return true

func pause() -> void:
	if state == PlaybackState.PLAYING:
		state = PlaybackState.PAUSED

func toggle_playback() -> bool:
	if state == PlaybackState.PLAYING:
		pause()
		return false
	return play()

func stop() -> void:
	if snapshots.is_empty():
		return
	playback_time_s = float(snapshots.front()["time_s"])
	state = PlaybackState.STOPPED

func replay() -> bool:
	if snapshots.is_empty():
		return false
	playback_time_s = float(snapshots.front()["time_s"])
	state = PlaybackState.PLAYING
	return true

func advance_playback(render_delta_s: float) -> void:
	if state != PlaybackState.PLAYING or render_delta_s <= 0.0:
		return
	playback_time_s = minf(playback_time_s + render_delta_s, get_duration_s())
	if playback_time_s >= get_duration_s() - EPSILON:
		state = PlaybackState.PAUSED

func get_duration_s() -> float:
	if snapshots.is_empty():
		return 0.0
	return float(snapshots.back()["time_s"])

func get_current_snapshot() -> Dictionary:
	if snapshots.is_empty():
		return {}
	return _sample_at_time(playback_time_s)

func _make_snapshot(time_s: float, position: Vector3, velocity: Vector3) -> Dictionary:
	return {
		"time_s": time_s,
		"position": position,
		"velocity": velocity,
	}

func _sample_at_time(sample_time_s: float) -> Dictionary:
	var first: Dictionary = snapshots.front()
	var last: Dictionary = snapshots.back()
	if sample_time_s <= float(first["time_s"]):
		return first
	if sample_time_s >= float(last["time_s"]):
		return last
	for index in range(1, snapshots.size()):
		var next: Dictionary = snapshots[index]
		if sample_time_s > float(next["time_s"]):
			continue
		var previous: Dictionary = snapshots[index - 1]
		var frame_duration_s := float(next["time_s"]) - float(previous["time_s"])
		var weight := (sample_time_s - float(previous["time_s"])) / frame_duration_s
		var previous_position: Vector3 = previous["position"]
		var next_position: Vector3 = next["position"]
		var previous_velocity: Vector3 = previous["velocity"]
		var next_velocity: Vector3 = next["velocity"]
		return _make_snapshot(
			sample_time_s,
			previous_position.lerp(next_position, weight),
			previous_velocity.lerp(next_velocity, weight),
		)
	return last
