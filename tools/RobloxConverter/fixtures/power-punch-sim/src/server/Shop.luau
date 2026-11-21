-- Shop.luau
-- Gear purchases and rebirths. All costs and prerequisites are validated
-- server-side; the client UI is just a pretty way to fire these remotes.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Formulas = require(ReplicatedStorage.Shared.Formulas)

local Shop = {}

function Shop.start(Data)
	local remotes = ReplicatedStorage.Remotes
	local notify = remotes.Notify

	remotes.BuyGear.OnServerEvent:Connect(function(player, level)
		local profile = Data.get(player)
		if not profile or type(level) ~= "number" or level % 1 ~= 0 then
			return
		end
		-- Gear is bought strictly in order.
		if level ~= profile.gearLevel + 1 then
			return
		end
		local gear = Config.Gear[level]
		if not gear then
			return
		end
		if not Data.trySpendCoins(player, gear.cost) then
			notify:FireClient(player, "error", "Not enough coins!")
			return
		end
		Data.setGearLevel(player, level)
		notify:FireClient(player, "success", `Bought {gear.name} (x{gear.multiplier} power)!`)
	end)

	remotes.Rebirth.OnServerEvent:Connect(function(player)
		local profile = Data.get(player)
		if not profile then
			return
		end
		local cost = Formulas.rebirthCost(profile.rebirths)
		if profile.power < cost then
			notify:FireClient(player, "error", `You need {Formulas.abbreviate(cost)} power to rebirth!`)
			return
		end
		Data.applyRebirth(player)
		local bonus = profile.rebirths * Config.Rebirth.BonusPerRebirth * 100
		notify:FireClient(player, "success", `Rebirth {profile.rebirths}! Permanent +{bonus}% power.`)
		-- Zones re-lock when power resets; respawn so nobody is trapped behind a gate.
		task.defer(function()
			player:LoadCharacter()
		end)
	end)
end

return Shop
