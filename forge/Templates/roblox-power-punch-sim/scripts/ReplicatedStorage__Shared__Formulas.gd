extends Node
# Auto-ported ModuleScript by PlayForge RobloxConverter v2 from: ReplicatedStorage/Shared/Formulas
# Strategy: runtime_adapter | Grades: D=5 A=0 R=1 X=0 V=0

var Config
var SUFFIXES

func _ready() -> void:
	Config = RobloxCompat.require_module("Config")
	SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi"]
	RobloxCompat.register_module("Formulas", self)

func gearMultiplier(gearLevel):
	if gearLevel <= 0:
		return 1
	var gear = Config.Gear[int(min(gearLevel, Config.Gear.size())) - 1]
	return gear.multiplier

func rebirthMultiplier(rebirths):
	return 1 + rebirths * Config.Rebirth.BonusPerRebirth

func powerPerPunch(state):
	var amount = Config.Training.BasePowerPerPunch * gearMultiplier(state.gearLevel) * rebirthMultiplier(state.rebirths) * ((state.zoneMultiplier if state.zoneMultiplier != null else 1))
	if state.hasDoublePower:
		amount *= 2
	return max(1, floori(amount + 0.5))

func coinsForPower(powerGained, hasDoubleCoins):
	var coins = powerGained * Config.Training.CoinsPerPowerGained
	if hasDoubleCoins:
		coins *= 2
	return floori(coins + 0.5)

func rebirthCost(rebirths):
	return floori(Config.Rebirth.BaseCost * pow(Config.Rebirth.CostGrowth, rebirths))

func abbreviate(n):
	n = floori(n)
	if n < 1000:
		return str(n)
	var index = min(floori(RobloxCompat.log10(n) / 3), SUFFIXES.size() - 1)
	var scaled = n / pow(1000, index)
	var formatted = null
	if scaled >= 100:
		formatted = RobloxCompat.string_format("%.0f", [scaled])
	elif scaled >= 10:
		formatted = RobloxCompat.string_format("%.1f", [scaled])
	else:
		formatted = RobloxCompat.string_format("%.2f", [scaled])
	return str(formatted) + str(SUFFIXES[int(index + 1) - 1])
