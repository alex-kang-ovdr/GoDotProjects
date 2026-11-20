--!strict
-- Ties DataService to live players: loading on join, leaderstats, pushing
-- the profile to the owning client, saving on leave and on shutdown.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local DataService = require(script.Parent.Parent.Data.DataService)
local PlayerData = require(script.Parent.Parent.Data.PlayerData)

local ProfileRemote = ReplicatedStorage.Remotes.Profile :: RemoteEvent

local Profiles = {}

local service: DataService.DataService
local changedCallbacks: { (Player, PlayerData.Data) -> () } = {}

function Profiles.init(dataService: DataService.DataService)
	service = dataService
end

function Profiles.onChanged(callback: (Player, PlayerData.Data) -> ())
	table.insert(changedCallbacks, callback)
end

function Profiles.isLoaded(player: Player): boolean
	return service:isLoaded(player.UserId)
end

function Profiles.get(player: Player): PlayerData.Data?
	return service:get(player.UserId)
end

local function syncLeaderstats(player: Player, data: PlayerData.Data)
	local stats = player:FindFirstChild("leaderstats")
	if not stats then
		local folder = Instance.new("Folder")
		folder.Name = "leaderstats"
		local coins = Instance.new("IntValue")
		coins.Name = "Coins"
		coins.Parent = folder
		local wins = Instance.new("IntValue")
		wins.Name = "Wins"
		wins.Parent = folder
		folder.Parent = player
		stats = folder
	end
	assert(stats, "leaderstats folder missing")
	local coinsValue = stats:FindFirstChild("Coins") :: IntValue
	local winsValue = stats:FindFirstChild("Wins") :: IntValue
	coinsValue.Value = data.coins
	winsValue.Value = data.wins
end

function Profiles.push(player: Player)
	local data = Profiles.get(player)
	if not data then
		return
	end
	syncLeaderstats(player, data)
	ProfileRemote:FireClient(player, {
		coins = data.coins,
		wins = data.wins,
		bestWave = data.bestWave,
		ownedTrails = table.clone(data.ownedTrails),
		equippedTrail = data.equippedTrail,
	})
	for _, callback in changedCallbacks do
		task.spawn(callback, player, data)
	end
end

-- Mutates the player's data in place and tells everyone who cares. The
-- change is persisted by the next autosave or when the player leaves.
function Profiles.mutate(player: Player, mutator: (PlayerData.Data) -> ()): boolean
	local data = Profiles.get(player)
	if not data then
		return false
	end
	mutator(data)
	Profiles.push(player)
	return true
end

function Profiles.load(player: Player): boolean
	local ok, result = service:load(player.UserId)
	if not ok then
		warn(string.format("[Data] load failed for %s: %s", player.Name, tostring(result)))
		player:Kick(tostring(result))
		return false
	end
	if player.Parent ~= Players then
		-- Left while we were loading. Release the lock right away.
		service:unload(player.UserId)
		return false
	end
	Profiles.push(player)
	return true
end

function Profiles.release(player: Player)
	local ok, err = service:unload(player.UserId)
	-- "not loaded": never loaded, or shutdown is already releasing it.
	if not ok and err ~= "not loaded" then
		warn(string.format("[Data] save on leave failed for %s: %s", player.Name, tostring(err)))
	end
end

local function kickIfLost(userId: number, err: string?)
	if err == "session lost" then
		local player = Players:GetPlayerByUserId(userId)
		if player then
			player:Kick("Your data was opened on another server. Please rejoin.")
		end
	end
end

function Profiles.saveAll(release: boolean)
	local pending = 0
	for _, userId in service:userIds() do
		pending += 1
		task.spawn(function()
			local ok, err
			if release then
				ok, err = service:unload(userId)
			else
				ok, err = service:save(userId, false)
			end
			if not ok and err ~= "not loaded" then
				warn(string.format("[Data] save failed for %d: %s", userId, tostring(err)))
				kickIfLost(userId, err)
			end
			pending -= 1
		end)
	end
	-- BindToClose gives the server 30 seconds in total.
	local deadline = os.clock() + 25
	while pending > 0 and os.clock() < deadline do
		task.wait(0.1)
	end
end

return Profiles
