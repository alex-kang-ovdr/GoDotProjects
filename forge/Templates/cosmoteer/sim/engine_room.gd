extends RefCounted

const ID := "cosmoteer.lab_engine_room"
const REAL_ID := "cosmoteer.engine_room"
const ALL_IDS := [ID, REAL_ID]
const RADIATOR_ID := "cosmoteer.radiator"
const RADIATOR_COOLING := 6.0
const ROOM := {
	"id": ID, "size": [2, 2], "max_health": 2600, "health_type": "Operational",
	"density": 1.25, "resources": {"steel": 48, "coil": 18, "processor": 2}, "stats": {}
}
const FORCE_MULTIPLIER := 1.30
const POWER_MULTIPLIER := 1.45
const IDLE_COOLING := 16.0
const HEAT_LIMIT := 100.0
const RESET_HEAT := 35.0
const HEAT_PER_POWER := 0.025
const STOCK_HEAT_LIMIT := 14.0
const OVERCLOCK_HEAT := 26.0


static func adjacent(a: Dictionary, b: Dictionary) -> bool:
	var first := Rect2i(a.cell, a.size)
	var second := Rect2i(b.cell, b.size)
	if first.end.x == second.position.x or second.end.x == first.position.x:
		return mini(first.end.y, second.end.y) > maxi(first.position.y, second.position.y)
	if first.end.y == second.position.y or second.end.y == first.position.y:
		return mini(first.end.x, second.end.x) > maxi(first.position.x, second.position.x)
	return false


static func setup(ship: Dictionary) -> void:
	ship.overclock = false
	for uid in ship.engines:
		var engine: Dictionary = ship.parts[uid]
		engine.engine_rooms = []
		engine.heat = 0.0
		engine.heat_rate = 0.0
		engine.thermal_trip = false
		engine.total_power_rate = 0.0
		for rid in ALL_IDS:
			for room_uid in ship.ids.get(rid, []):
				if adjacent(engine, ship.parts[room_uid]):
					engine.engine_rooms.append(room_uid)


static func linked(ship: Dictionary, engine: Dictionary) -> bool:
	for uid in engine.engine_rooms:
		if ship.parts[uid].hp > 0:
			return true
	return false


static func available(ship: Dictionary) -> bool:
	if not ship.command:
		return false
	for uid in ship.engines:
		var engine: Dictionary = ship.parts[uid]
		if engine.hp > 0 and not engine.thermal_trip and linked(ship, engine):
			return true
	return false


static func apply_heat(engine: Dictionary, power_rate: float, overclock_load: float, dt: float, extra_cooling: float = 0.0) -> void:
	engine.total_power_rate = power_rate
	engine.heat_rate = minf(power_rate * HEAT_PER_POWER, STOCK_HEAT_LIMIT) + OVERCLOCK_HEAT * overclock_load
	engine.heat = clampf(engine.heat + (engine.heat_rate - (IDLE_COOLING + extra_cooling)) * dt, 0, HEAT_LIMIT)
	if engine.heat >= HEAT_LIMIT:
		engine.thermal_trip = true
	elif engine.heat <= RESET_HEAT:
		engine.thermal_trip = false


static func radiator_cooling(ship: Dictionary) -> float:
	var bonus := 0.0
	for uid in ship.ids.get(RADIATOR_ID, []):
		if ship.parts[uid].hp > 0:
			bonus += RADIATOR_COOLING
	return bonus


static func snapshot(ship: Dictionary) -> Dictionary:
	var state := {"installed": 0, "online": 0, "linked": 0, "active": false,
		"ready": false, "tripped": 0, "engines": []}
	if ship.is_empty():
		return state
	for rid in ALL_IDS:
		for uid in ship.ids.get(rid, []):
			state.installed += 1
			state.online += int(ship.parts[uid].hp > 0 and ship.command)
	state.active = ship.overclock
	for uid in ship.engines:
		var engine: Dictionary = ship.parts[uid]
		if engine.hp <= 0:
			continue
		var connected := linked(ship, engine)
		state.linked += int(connected)
		state.tripped += int(engine.thermal_trip)
		state.ready = state.ready or (connected and ship.command and not engine.thermal_trip)
		state.engines.append({
			"uid": uid, "id": engine.id, "linked": connected, "force": engine.actual_force,
			"power": engine.total_power_rate, "heat": engine.heat, "heat_rate": engine.heat_rate,
			"limit": HEAT_LIMIT, "tripped": engine.thermal_trip, "boosted": engine.get("boost_active", false)
		})
	return state
