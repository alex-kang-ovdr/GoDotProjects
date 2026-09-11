class_name SurvivalState
extends RefCounted

signal changed

const MAX_VALUE := 100.0
const STEP_SECONDS := 0.25
const DAY_SECONDS := 120.0
const CYCLE_SECONDS := 180.0
const DAY_HUNGER_DRAIN := 0.045
const NIGHT_HUNGER_DRAIN := 0.075
const DAY_WARMTH_DRAIN := 0.012
const NIGHT_WARMTH_DRAIN := 0.22
const STARVATION_DAMAGE := 0.18
const COLD_DAMAGE := 0.32

var health := MAX_VALUE
var hunger := MAX_VALUE
var warmth := MAX_VALUE
var time_of_day := 0.0
var simulation_rate := 1.0
var elapsed_seconds := 0.0
var step_count := 0
var _pending_seconds := 0.0


func tick(delta: float) -> void:
	if not is_finite(delta) or delta <= 0.0 or simulation_rate <= 0.0:
		return
	_pending_seconds += delta * simulation_rate
	while _pending_seconds >= STEP_SECONDS:
		_pending_seconds -= STEP_SECONDS
		_advance_step(STEP_SECONDS)


func advance(seconds: float) -> bool:
	if not is_finite(seconds) or seconds < 0.0:
		return false
	var remaining := seconds
	while remaining > 0.000001:
		var step := minf(STEP_SECONDS, remaining)
		_advance_step(step)
		remaining -= step
	return true


func set_values(next_health: float, next_hunger: float, next_warmth: float) -> bool:
	if not is_finite(next_health) or not is_finite(next_hunger) or not is_finite(next_warmth):
		return false
	health = clampf(next_health, 0.0, MAX_VALUE)
	hunger = clampf(next_hunger, 0.0, MAX_VALUE)
	warmth = clampf(next_warmth, 0.0, MAX_VALUE)
	changed.emit()
	return true


func set_phase(night: bool) -> void:
	time_of_day = DAY_SECONDS if night else 0.0
	changed.emit()


func reset() -> void:
	health = MAX_VALUE
	hunger = MAX_VALUE
	warmth = MAX_VALUE
	time_of_day = 0.0
	elapsed_seconds = 0.0
	step_count = 0
	_pending_seconds = 0.0
	changed.emit()


func is_night() -> bool:
	return time_of_day >= DAY_SECONDS


func phase_name() -> String:
	return "NIGHT" if is_night() else "DAY"


func snapshot() -> Dictionary:
	return {
		"health": health,
		"hunger": hunger,
		"warmth": warmth,
		"time_of_day": time_of_day,
		"elapsed_seconds": elapsed_seconds,
		"step_count": step_count,
		"night": is_night(),
	}


func _advance_step(seconds: float) -> void:
	var night := is_night()
	hunger = maxf(0.0, hunger - seconds * (NIGHT_HUNGER_DRAIN if night else DAY_HUNGER_DRAIN))
	warmth = maxf(0.0, warmth - seconds * (NIGHT_WARMTH_DRAIN if night else DAY_WARMTH_DRAIN))
	if hunger <= 0.0:
		health = maxf(0.0, health - seconds * STARVATION_DAMAGE)
	if warmth <= 0.0:
		health = maxf(0.0, health - seconds * COLD_DAMAGE)
	time_of_day = fmod(time_of_day + seconds, CYCLE_SECONDS)
	elapsed_seconds += seconds
	step_count += 1
	changed.emit()
