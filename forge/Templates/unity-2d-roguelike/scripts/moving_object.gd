class_name MovingObject
extends Node2D

## Port of Assets/Scripts/MovingObject.cs
## Replaces Rigidbody2D.MovePosition + IEnumerator SmoothMovement with Godot Tween
## and Physics2D.Linecast(blockingLayer) with deterministic board blocking query.

var move_time: float = 0.1
var grid_pos: Vector2i = Vector2i.ZERO
var board: BoardManager
var is_moving: bool = false

func set_grid_position_immediate(pos: Vector2i) -> void:
	grid_pos = pos
	position = UnityCompat.unity_grid_to_godot_pos(pos)

func move_step(x_dir: int, y_dir: int) -> Dictionary:
	var target_grid := grid_pos + Vector2i(x_dir, y_dir)
	var blocker = board.get_blocking_at(target_grid)
	if blocker == null:
		board.move_blocking_unit(self, grid_pos, target_grid)
		grid_pos = target_grid
		_smooth_movement(UnityCompat.unity_grid_to_godot_pos(target_grid))
		return { "moved": true, "hit": null }
	return { "moved": false, "hit": blocker }

func _smooth_movement(end_pos: Vector2) -> void:
	is_moving = true
	if move_time <= 0.0:
		position = end_pos
		is_moving = false
		return
	var tween := create_tween()
	tween.tween_property(self, "position", end_pos, move_time)
	tween.finished.connect(func(): is_moving = false)

func attempt_move(x_dir: int, y_dir: int) -> Dictionary:
	var res := move_step(x_dir, y_dir)
	if not res.moved and res.hit != null:
		on_cant_move(res.hit)
	return res

func on_cant_move(_hit_target: Object) -> void:
	pass
