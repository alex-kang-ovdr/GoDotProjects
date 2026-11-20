-- Dégâts et récompenses d'élimination.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Economy = require(script.Parent.Economy)

local Combat = {}

-- Inflige des dégâts (le ForceField de protection est respecté par TakeDamage)
function Combat.damage(humanoid: Humanoid, amount: number, attacker: Player?)
	if humanoid.Health <= 0 then
		return
	end
	if attacker then
		humanoid:SetAttribute("LastAttacker", attacker.UserId)
	end
	humanoid:TakeDamage(amount)
end

-- À appeler à chaque apparition d'un personnage
function Combat.watch(player: Player, character: Model)
	local humanoid = character:WaitForChild("Humanoid") :: Humanoid
	humanoid.Died:Connect(function()
		local id = humanoid:GetAttribute("LastAttacker")
		if not id or id == player.UserId then
			return
		end
		local killer = Players:GetPlayerByUserId(id)
		if killer then
			Economy.add(killer, Config.KillReward)
			Economy.addKill(killer)
			Economy.notify(killer, `Éliminé : {player.Name}  +${Config.KillReward}`)
		end
	end)
end

return Combat
