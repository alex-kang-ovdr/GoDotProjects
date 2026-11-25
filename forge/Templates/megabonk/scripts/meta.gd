class_name GameMeta
extends RefCounted

## Direct port of dist/meta.js. Reward formula belongs to web v2.
static func integer(value, maximum: float = 1.0e9) -> int:
	if value == null:
		return 0
	var number = float(value) if (value is float or value is int or value is bool or (value is String and value.is_valid_float())) else 0.0
	return int(clampf(floor(number), 0.0, maximum)) if is_finite(number) else 0

static func normalizeMeta(profile: Dictionary) -> Dictionary:
	profile.silver = integer(profile.get("silver"))
	var old = profile.get("upgrades", {})
	if not old is Dictionary:
		old = {}
	profile.upgrades = {}
	for d in GameData.get_data().META_UPGRADES:
		profile.upgrades[d.id] = integer(old.get(d.id), d.maxLevel)
	profile.highestStage = integer(profile.get("highestStage"), 3)
	return profile

static func purchaseUpgrade(profile: Dictionary, id: String) -> Dictionary:
	var d = {}
	for entry in GameData.get_data().META_UPGRADES:
		if entry.id == id and entry.runtimeSupported:
			d = entry
	if d.is_empty():
		return {"ok":false,"reason":"unavailable"}
	var level = integer(profile.get("upgrades", {}).get(id), d.maxLevel)
	if level >= d.maxLevel:
		return {"ok":false,"reason":"max"}
	var cost = d.costs[level]
	if not is_finite(float(cost)) or cost < 0 or profile.silver < cost:
		return {"ok":false,"reason":"funds"}
	profile.silver -= cost
	profile.upgrades[id] = level + 1
	return {"ok":true,"cost":cost,"level":level + 1}

static func runMeta(profile: Dictionary, mode: String) -> Dictionary:
	var levels = profile.get("upgrades", {})
	var multiplier = 1.0 + integer(levels.get("Silver"), 20) * 0.025
	if mode == "quick":
		return {"weaponSlots":4,"tomeSlots":4,"rerolls":3,"silverMultiplier":multiplier}
	return {"weaponSlots":2 + integer(levels.get("Weapons"),2),"tomeSlots":2 + integer(levels.get("Tomes"),2),"rerolls":integer(levels.get("Refresh"),6),"silverMultiplier":multiplier}

static func calculateSilver(sim, profile: Dictionary) -> int:
	var won = sim.phase == "won"
	var completed = sim.stageCount if won else sim.stageIndex
	var base = floor(maxf(0,sim.time)/30.0) + floor(maxf(0,sim.kills)/50.0) + completed*10 + (20 if won else 0)
	return int(floor(base*(1.0+integer(profile.get("upgrades",{}).get("Silver"),20)*0.025)))
