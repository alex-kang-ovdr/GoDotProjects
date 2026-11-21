extends Node
# Auto-ported ModuleScript by PlayForge RobloxConverter v2 from: ReplicatedStorage/Shared/Rewards
# Strategy: native | Grades: D=0 A=0 R=0 X=0 V=1


func _ready() -> void:
	pass
	RobloxCompat.register_module("Rewards", self)

func compute(rules, participants, survived, winners):
	var winnerSet = {}
	for userId in winners:
		winnerSet[userId] = true
	var payouts = {}
	for userId in participants:
		var waves = (survived.get(userId, null) if survived.get(userId, null) != null else 0)
		var won = winnerSet.get(userId, null) == true
		payouts[userId] = { "coins": rules.Participation + waves * rules.PerWave + (rules.WinBonus if won else 0), "won": won, "wavesSurvived": waves }
	return payouts
