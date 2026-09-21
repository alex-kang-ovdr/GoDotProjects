class_name ShipDestructionEffect
extends Node2D

const VisualData = preload("res://scripts/visual_tuning.gd")

signal fragment_requested(part_uid: int)
signal collapse_finished

var burst_points: Array[Vector2] = []
var burst_part_uids: Array[int] = []
var source_ship: Node2D
var source_local_points: Array[Vector2] = []
var last_world_points: Array[Vector2] = []
var bursts: Array[Dictionary] = []
var elapsed := 0.0
var next_burst_time := VisualData.SHIP_DESTRUCTION_BURST_INITIAL_DELAY
var burst_index := 0
var finished := false

func setup(points: Array[Vector2], part_uids: Array[int] = [], source: Node2D = null) -> void:
	burst_points = points.duplicate()
	burst_part_uids = part_uids.duplicate()
	source_ship = source
	last_world_points = points.duplicate()
	if source_ship != null and is_instance_valid(source_ship):
		for point in points:
			source_local_points.append(source_ship.to_local(point))
	# 작은 함선도 최소한의 연쇄 폭발은 보이게 한다.
	if burst_points.is_empty():
		burst_points.append(global_position)

func _process(delta: float) -> void:
	elapsed += delta
	while elapsed >= next_burst_time and next_burst_time < VisualData.SHIP_DESTRUCTION_BURST_DURATION:
		spawn_burst()
		next_burst_time += VisualData.SHIP_DESTRUCTION_BURST_INTERVAL
	if not finished and elapsed >= VisualData.SHIP_DESTRUCTION_BURST_DURATION:
		finished = true
		collapse_finished.emit()
	for index in range(bursts.size() - 1, -1, -1):
		bursts[index].age += delta
		if bursts[index].age >= VisualData.SHIP_DESTRUCTION_BURST_LIFETIME:
			bursts.remove_at(index)
	queue_redraw()
	if elapsed >= VisualData.SHIP_DESTRUCTION_BURST_DURATION + VisualData.SHIP_DESTRUCTION_BURST_LIFETIME:
		queue_free()

func spawn_burst() -> void:
	# 순서가 고정된 연쇄 폭발이다. 같은 입력이면 같은 부품 순서로 분해된다.
	var point_index := posmod(burst_index, burst_points.size())
	var world_point := resolved_world_point(point_index)
	bursts.append({"position": to_local(world_point), "age": 0.0, "seed": burst_index})
	if burst_index < burst_part_uids.size():
		fragment_requested.emit(burst_part_uids[burst_index])
	burst_index += 1

func resolved_world_point(point_index: int) -> Vector2:
	if source_ship != null and is_instance_valid(source_ship):
		var world_point := source_ship.to_global(source_local_points[point_index])
		last_world_points[point_index] = world_point
		return world_point
	return last_world_points[point_index]

func _draw() -> void:
	for burst in bursts:
		var progress := clampf(float(burst.age) / VisualData.SHIP_DESTRUCTION_BURST_LIFETIME, 0.0, 1.0)
		var center: Vector2 = burst.position
		var radius := lerpf(4.0, VisualData.SHIP_DESTRUCTION_BURST_RADIUS, progress)
		var alpha := 1.0 - progress
		draw_circle(center, radius * 0.38, Color(1.0, 0.78, 0.28, alpha * 0.78))
		draw_arc(center, radius, 0.0, TAU, 18, Color(1.0, 0.26, 0.06, alpha * 0.8), 2.0)
		for spark_index in 6:
			var angle := float(spark_index) * TAU / 6.0 + float(burst.seed) * 0.71
			var start := center + Vector2.RIGHT.rotated(angle) * radius * 0.32
			var end := center + Vector2.RIGHT.rotated(angle) * radius * (0.72 + progress * 0.55)
			draw_line(start, end, Color(1.0, 0.68, 0.18, alpha), 1.5)
