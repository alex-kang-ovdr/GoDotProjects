-- Training.luau
-- The core loop: punch -> gain power + coins. The server is authoritative:
-- it rate-limits the remote, recomputes every multiplier itself, and validates
-- zone bonuses against the player's actual position and power. A client that
-- fires the remote faster or lies about its zone gains nothing.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Formulas = require(ReplicatedStorage.Shared.Formulas)

local Training = {}

local lastPunch = {} -- [Player] = os.clock() of last accepted punch
local Data, Monetization, MapBuilder

-- Which multiplier does this player actually earn, standing where they are?
local function zoneMultiplierFor(player: Player, profile): number
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then
		return 1
	end

	local zone = MapBuilder.getZoneAt(root.Position)
	if not zone then
		return 1
	end
	if zone.vipOnly then
		return Monetization.ownsPass(player, "VIP") and zone.multiplier or 1
	end
	if profile.power >= zone.powerRequired then
		return zone.multiplier
	end
	return 1
end

local function punch(player: Player, bypassCooldown: boolean?)
	local profile = Data.get(player)
	if not profile then
		return
	end

	if not bypassCooldown then
		local now = os.clock()
		-- 0.9 factor gives honest clients a little network-jitter tolerance.
		if now - (lastPunch[player] or 0) < Config.Training.PunchCooldown * 0.9 then
			return
		end
		lastPunch[player] = now
	end

	local powerGain = Formulas.powerPerPunch({
		gearLevel = profile.gearLevel,
		rebirths = profile.rebirths,
		zoneMultiplier = zoneMultiplierFor(player, profile),
		hasDoublePower = Monetization.ownsPass(player, "DoublePower"),
	})
	local coinsGain = Formulas.coinsForPower(powerGain, Monetization.ownsPass(player, "DoubleCoins"))

	Data.addPower(player, powerGain)
	Data.addCoins(player, coinsGain)

	-- Tell the client what it actually earned so the popup matches reality.
	ReplicatedStorage.Remotes.Punch:FireClient(player, powerGain, coinsGain)
end

function Training.start(dataService, monetizationService, mapBuilder)
	Data = dataService
	Monetization = monetizationService
	MapBuilder = mapBuilder

	local remotes = ReplicatedStorage.Remotes
	remotes.Punch.OnServerEvent:Connect(function(player)
		punch(player)
	end)

	remotes.ToggleAutoTrain.OnServerEvent:Connect(function(player, enabled)
		if Monetization.ownsPass(player, "AutoTrain") then
			player:SetAttribute("AutoTrainOn", enabled == true)
		end
	end)

	Players.PlayerRemoving:Connect(function(player)
		lastPunch[player] = nil
	end)

	-- Auto Train gamepass: server-driven punches, no client input needed.
	task.spawn(function()
		while true do
			task.wait(Config.Training.AutoTrainInterval)
			for _, player in Players:GetPlayers() do
				if player:GetAttribute("AutoTrainOn") and Monetization.ownsPass(player, "AutoTrain") then
					punch(player, true)
				end
			end
		end
	end)
end

return Training
