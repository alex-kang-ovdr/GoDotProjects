extends Node
# Auto-ported ModuleScript by PlayForge RobloxConverter v2 from: ReplicatedStorage/Shared/Config
# Strategy: native | Grades: D=1 A=0 R=0 X=0 V=0

var GameName
var Training
var Rebirth
var Gear
var Zones
var VipZone
var GamePasses
var GamePassInfo
var DevProducts

func _ready() -> void:
	GameName = "Power Punch Simulator"
	Training = { "BasePowerPerPunch": 1, "PunchCooldown": 0.15, "CoinsPerPowerGained": 0.5, "AutoTrainInterval": 0.6 }
	Rebirth = { "BaseCost": 10000, "CostGrowth": 3, "BonusPerRebirth": 0.5 }
	Gear = [{ "name": "Foam Gloves", "cost": 100, "multiplier": 2, "color": Color8(240, 200, 80) }, { "name": "Leather Gloves", "cost": 1000, "multiplier": 5, "color": Color8(160, 100, 50) }, { "name": "Iron Gauntlets", "cost": 10000, "multiplier": 12, "color": Color8(180, 180, 190) }, { "name": "Golden Fists", "cost": 100000, "multiplier": 30, "color": Color8(255, 200, 40) }, { "name": "Diamond Crushers", "cost": 1000000, "multiplier": 75, "color": Color8(120, 220, 255) }, { "name": "Void Knuckles", "cost": 10000000, "multiplier": 200, "color": Color8(140, 60, 220) }]
	Zones = [{ "name": "Beach", "powerRequired": 0, "multiplier": 1, "floorColor": Color8(238, 214, 160), "accentColor": Color8(60, 170, 90), "floorMaterial": "Sand" }, { "name": "City", "powerRequired": 5000, "multiplier": 3, "floorColor": Color8(112, 112, 118), "accentColor": Color8(80, 140, 210), "floorMaterial": "Concrete" }, { "name": "Volcano", "powerRequired": 50000, "multiplier": 8, "floorColor": Color8(62, 48, 46), "accentColor": Color8(255, 100, 30), "floorMaterial": "Basalt" }, { "name": "Space", "powerRequired": 500000, "multiplier": 20, "floorColor": Color8(42, 38, 62), "accentColor": Color8(90, 220, 255), "floorMaterial": "Slate" }]
	VipZone = { "name": "VIP Island", "multiplier": 50, "floorColor": Color8(235, 225, 180), "accentColor": Color8(255, 215, 0), "floorMaterial": "Marble" }
	GamePasses = { "DoublePower": 0, "DoubleCoins": 0, "AutoTrain": 0, "VIP": 0 }
	GamePassInfo = { "DoublePower": { "title": "2x Power", "desc": "Every punch gives double power, forever." }, "DoubleCoins": { "title": "2x Coins", "desc": "Every punch pays out double coins, forever." }, "AutoTrain": { "title": "Auto Train", "desc": "Hands-free training: punch automatically while you chill." }, "VIP": { "title": "VIP Island", "desc": "Unlock the exclusive x50 VIP training island." } }
	DevProducts = [{ "key": "SmallCoins", "id": 0, "coins": 25000, "label": "25K Coins" }, { "key": "MediumCoins", "id": 0, "coins": 150000, "label": "150K Coins" }, { "key": "LargeCoins", "id": 0, "coins": 1000000, "label": "1M Coins" }]
	RobloxCompat.register_module("Config", self)
