extends Node

signal died

var walk_speed: float = 16.0
var health: float = 100.0
var last_state: String = "Running"

func _character() -> Node:
	return get_parent()

func set_walk_speed(studs_per_sec: float) -> void:
	walk_speed = studs_per_sec
	var ch := _character()
	if ch != null and ch.has_method("set_walk_speed"):
		ch.call("set_walk_speed", studs_per_sec)

func take_damage(amount: float) -> void:
	set_health(health - amount)

func set_health(new_health: float) -> void:
	health = new_health
	var ch := _character()
	if health <= 0.0:
		died.emit()
	if ch != null and ch.has_method("set_health"):
		ch.call("set_health", new_health)
	if health <= 0.0:
		health = 100.0

func change_state(state_name: String) -> void:
	last_state = state_name
	var ch := _character()
	if ch != null and ch.has_method("change_state"):
		ch.call("change_state", state_name)
