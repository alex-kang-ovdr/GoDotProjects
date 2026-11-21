extends Node
# Auto-ported ModuleScript by PlayForge RobloxConverter v2 from: ReplicatedStorage/Shared/Config
# Strategy: adapter | Grades: D=1 A=1 R=0 X=0 V=0

var StartCash
var KillReward
var PlotCount
var PlotSpacing
var PlotSize
var RespawnTime
var DropperInterval
var TurretRange
var TurretInterval
var PlotColors
var DropperColors
var Weapons
var Items

func _ready() -> void:
	StartCash = 300
	KillReward = 150
	PlotCount = 4
	PlotSpacing = 130
	PlotSize = 100
	RespawnTime = 3
	DropperInterval = 2
	TurretRange = 90
	TurretInterval = 0.4
	PlotColors = [Color8(225, 65, 65), Color8(65, 125, 235), Color8(240, 165, 45), Color8(155, 85, 215)]
	DropperColors = [Color8(120, 190, 90), Color8(90, 160, 230), Color8(235, 190, 60)]
	Weapons = { "Pistolet": { "style": "pistol", "damage": 14, "cooldown": 0.35, "range": 250, "spread": 0.01, "pellets": 1, "length": 1.4, "color": Color8(60, 60, 66) }, "Fusil à pompe": { "style": "shotgun", "damage": 9, "cooldown": 0.9, "range": 70, "spread": 0.09, "pellets": 8, "length": 3.2, "color": Color8(70, 70, 76) }, "Fusil d'assaut": { "style": "rifle", "damage": 15, "cooldown": 0.12, "range": 300, "spread": 0.03, "pellets": 1, "length": 3.2, "color": Color8(70, 90, 60) }, "Sniper": { "style": "sniper", "damage": 75, "cooldown": 1.5, "range": 700, "spread": 0, "pellets": 1, "length": 4.2, "color": Color8(45, 50, 58) } }
	Items = [{ "id": "dropper1", "name": "Dropper 1", "price": 150, "kind": "dropper", "slot": 1, "value": 10, "pos": RobloxCompat.vec3(-40, 0, 10) }, { "id": "dropper2", "name": "Dropper 2", "price": 500, "requires": ["dropper1"], "kind": "dropper", "slot": 2, "value": 25, "pos": RobloxCompat.vec3(-30, 0, 10) }, { "id": "dropper3", "name": "Dropper 3", "price": 1500, "requires": ["dropper2"], "kind": "dropper", "slot": 3, "value": 60, "pos": RobloxCompat.vec3(-20, 0, 10) }, { "id": "murs", "name": "Murs", "price": 400, "kind": "walls", "pos": RobloxCompat.vec3(0, 0, 10) }, { "id": "tourelle1", "name": "Tourelle 1", "price": 600, "requires": ["murs"], "kind": "turret", "damage": 6, "turretPos": RobloxCompat.vec3(-22, 0, 44), "pos": RobloxCompat.vec3(10, 0, 10) }, { "id": "tourelle2", "name": "Tourelle 2", "price": 1200, "requires": ["tourelle1"], "kind": "turret", "damage": 7, "turretPos": RobloxCompat.vec3(22, 0, 44), "pos": RobloxCompat.vec3(20, 0, 10) }, { "id": "tourelle3", "name": "Tourelle 3", "price": 2500, "requires": ["tourelle2"], "kind": "turret", "damage": 9, "turretPos": RobloxCompat.vec3(-44, 0, 0), "pos": RobloxCompat.vec3(30, 0, 10) }, { "id": "tourelle4", "name": "Tourelle 4", "price": 4000, "requires": ["tourelle3"], "kind": "turret", "damage": 12, "turretPos": RobloxCompat.vec3(44, 0, 0), "pos": RobloxCompat.vec3(40, 0, 10) }, { "id": "pompe", "name": "Fusil à pompe", "price": 800, "kind": "weapon", "weapon": "Fusil à pompe", "padPos": RobloxCompat.vec3(20, 0, -15), "pos": RobloxCompat.vec3(-40, 0, -2) }, { "id": "fusil", "name": "Fusil d'assaut", "price": 1500, "requires": ["pompe"], "kind": "weapon", "weapon": "Fusil d'assaut", "padPos": RobloxCompat.vec3(30, 0, -15), "pos": RobloxCompat.vec3(-30, 0, -2) }, { "id": "sniper", "name": "Sniper", "price": 3000, "requires": ["fusil"], "kind": "weapon", "weapon": "Sniper", "padPos": RobloxCompat.vec3(40, 0, -15), "pos": RobloxCompat.vec3(-20, 0, -2) }]
	RobloxCompat.register_module("Config", self)
