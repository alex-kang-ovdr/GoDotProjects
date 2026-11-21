extends Node
# Auto-ported ModuleScript by PlayForge RobloxConverter v2 from: ServerScriptService/Server/Economy
# Strategy: runtime_adapter | Grades: D=0 A=1 R=4 X=0 V=1

var ReplicatedStorage
var Config
var notifyEvent

func _ready() -> void:
	ReplicatedStorage = RobloxCompat.get_service("ReplicatedStorage")
	Config = RobloxCompat.require_module("Config")
	notifyEvent = RobloxCompat.instance_new("RemoteEvent")
	notifyEvent.set_meta("roblox_name", "Notify")
	RobloxCompat.set_parent(notifyEvent, ReplicatedStorage)
	RobloxCompat.register_module("Economy", self)

func setup(player):
	var stats = RobloxCompat.instance_new("Folder")
	stats.set_meta("roblox_name", "leaderstats")
	var cash = RobloxCompat.instance_new("IntValue")
	cash.set_meta("roblox_name", "Argent")
	cash.value = Config.StartCash
	RobloxCompat.set_parent(cash, stats)
	var kills = RobloxCompat.instance_new("IntValue")
	kills.set_meta("roblox_name", "Kills")
	RobloxCompat.set_parent(kills, stats)
	RobloxCompat.set_parent(stats, player)

func stat(player, name):
	var stats = RobloxCompat.find_first_child(player, "leaderstats")
	return (RobloxCompat.find_first_child(stats, name) if stats != null else null)

func rbx_get(player):
	var v = stat(player, "Argent")
	return (v.value if v else 0)

func add(player, amount):
	var v = stat(player, "Argent")
	if v:
		v.value += amount

func spend(player, amount):
	if rbx_get(player) >= amount:
		add(player, -amount)
		return true
	return false

func addKill(player):
	var v = stat(player, "Kills")
	if v:
		v.value += 1

func notify(player, text):
	notifyEvent.fire_client(player, text)
