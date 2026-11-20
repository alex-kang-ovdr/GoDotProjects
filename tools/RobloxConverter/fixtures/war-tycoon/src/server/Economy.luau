-- Argent, éliminations et notifications.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)

local Economy = {}

local notifyEvent = Instance.new("RemoteEvent")
notifyEvent.Name = "Notify"
notifyEvent.Parent = ReplicatedStorage

function Economy.setup(player: Player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"

	local cash = Instance.new("IntValue")
	cash.Name = "Argent"
	cash.Value = Config.StartCash
	cash.Parent = stats

	local kills = Instance.new("IntValue")
	kills.Name = "Kills"
	kills.Parent = stats

	stats.Parent = player
end

local function stat(player: Player, name: string): IntValue?
	local stats = player:FindFirstChild("leaderstats")
	return stats and stats:FindFirstChild(name) :: IntValue?
end

function Economy.get(player: Player): number
	local v = stat(player, "Argent")
	return v and v.Value or 0
end

function Economy.add(player: Player, amount: number)
	local v = stat(player, "Argent")
	if v then
		v.Value += amount
	end
end

function Economy.spend(player: Player, amount: number): boolean
	if Economy.get(player) >= amount then
		Economy.add(player, -amount)
		return true
	end
	return false
end

function Economy.addKill(player: Player)
	local v = stat(player, "Kills")
	if v then
		v.Value += 1
	end
end

function Economy.notify(player: Player, text: string)
	notifyEvent:FireClient(player, text)
end

return Economy
