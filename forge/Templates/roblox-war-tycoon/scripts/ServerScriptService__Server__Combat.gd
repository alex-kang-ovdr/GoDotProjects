extends Node
# Auto-ported ModuleScript by PlayForge RobloxConverter v2 from: ServerScriptService/Server/Combat
# Strategy: runtime_adapter | Grades: D=0 A=1 R=5 X=0 V=2

var Players
var ReplicatedStorage
var Config
var Economy

func _ready() -> void:
	Players = RobloxCompat.get_service("Players")
	ReplicatedStorage = RobloxCompat.get_service("ReplicatedStorage")
	Config = RobloxCompat.require_module("Config")
	Economy = RobloxCompat.require_module("Economy")
	RobloxCompat.register_module("Combat", self)

func damage(humanoid, amount, attacker):
	if humanoid.health <= 0:
		return
	if attacker:
		RobloxCompat.set_attribute(humanoid, "LastAttacker", attacker.user_id)
	humanoid.take_damage(amount)

func watch(player, character):
	var humanoid = RobloxCompat.wait_for_child(character, "Humanoid")
	humanoid.died.connect(func():
		var id = RobloxCompat.get_attribute(humanoid, "LastAttacker")
		if not id or id == player.user_id:
			return
		var killer = RobloxCompat.get_player_by_user_id(id)
		if killer:
			Economy.add(killer, Config.KillReward)
			Economy.addKill(killer)
			Economy.notify(killer, "Éliminé : " + str(RobloxCompat.get_roblox_name(player)) + "  +$" + str(Config.KillReward))
	)
