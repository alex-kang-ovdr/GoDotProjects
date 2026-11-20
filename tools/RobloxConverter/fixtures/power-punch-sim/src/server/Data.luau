-- Data.luau
-- Player data: loading with retries, session cache, leaderstats, autosave,
-- and graceful fallback to in-memory data when DataStores are unavailable
-- (which is normal in unpublished Studio playtests).

local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")

local DATASTORE_NAME = "PlayerData_v1"
local AUTOSAVE_INTERVAL = 60
local LOAD_RETRIES = 3

local DEFAULT_DATA = {
	version = 1,
	power = 0,
	coins = 0,
	rebirths = 0,
	gearLevel = 0,
}

local Data = {}

local profiles = {} -- [Player] = profile table
local store = nil -- nil when DataStores are unavailable

local function deepCopy(source)
	local copy = {}
	for key, value in source do
		copy[key] = if type(value) == "table" then deepCopy(value) else value
	end
	return copy
end

local function keyFor(player: Player): string
	return "player_" .. player.UserId
end

-- Push the profile into leaderstats (auto-replicates to everyone's player list)
-- and attributes (used by the client UI).
local function sync(player: Player)
	local profile = profiles[player]
	local stats = player:FindFirstChild("leaderstats")
	if not profile or not stats then
		return
	end
	stats.Power.Value = profile.power
	stats.Coins.Value = profile.coins
	stats.Rebirths.Value = profile.rebirths
	player:SetAttribute("GearLevel", profile.gearLevel)
end

local function loadProfile(player: Player)
	local data
	if store then
		for attempt = 1, LOAD_RETRIES do
			local ok, result = pcall(function()
				return store:GetAsync(keyFor(player))
			end)
			if ok then
				data = result
				break
			end
			warn(`[Data] Load attempt {attempt} failed for {player.Name}: {result}`)
			task.wait(2 ^ attempt)
		end
	end
	data = data or deepCopy(DEFAULT_DATA)
	-- Fill in any fields added since this profile was saved.
	for key, value in DEFAULT_DATA do
		if data[key] == nil then
			data[key] = value
		end
	end
	return data
end

local function saveProfile(player: Player)
	local profile = profiles[player]
	if not profile or not store then
		return
	end
	local ok, err = pcall(function()
		store:UpdateAsync(keyFor(player), function()
			return profile
		end)
	end)
	if not ok then
		warn(`[Data] Save failed for {player.Name}: {err}`)
	end
end

local function onPlayerAdded(player: Player)
	local profile = loadProfile(player)
	if not player.Parent then
		return -- left while loading
	end
	profiles[player] = profile

	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	for _, statName in { "Power", "Coins", "Rebirths" } do
		local value = Instance.new("IntValue")
		value.Name = statName
		value.Parent = stats
	end
	stats.Parent = player

	sync(player)
end

-- ============================== PUBLIC API ==============================

function Data.get(player: Player)
	return profiles[player]
end

function Data.addPower(player: Player, amount: number)
	local profile = profiles[player]
	if profile then
		profile.power += amount
		sync(player)
	end
end

function Data.addCoins(player: Player, amount: number)
	local profile = profiles[player]
	if profile then
		profile.coins += amount
		sync(player)
	end
end

function Data.trySpendCoins(player: Player, amount: number): boolean
	local profile = profiles[player]
	if not profile or profile.coins < amount then
		return false
	end
	profile.coins -= amount
	sync(player)
	return true
end

function Data.setGearLevel(player: Player, level: number)
	local profile = profiles[player]
	if profile then
		profile.gearLevel = level
		sync(player)
	end
end

-- Reset progress in exchange for a permanent rebirth multiplier.
function Data.applyRebirth(player: Player)
	local profile = profiles[player]
	if profile then
		profile.power = 0
		profile.coins = 0
		profile.gearLevel = 0
		profile.rebirths += 1
		sync(player)
	end
end

function Data.start()
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(DATASTORE_NAME)
	end)
	if ok then
		store = result
	else
		warn("[Data] DataStores unavailable — using in-memory data. "
			.. "This is expected in unpublished Studio playtests.")
	end

	Players.PlayerAdded:Connect(function(player)
		task.spawn(onPlayerAdded, player)
	end)
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end

	Players.PlayerRemoving:Connect(function(player)
		saveProfile(player)
		profiles[player] = nil
	end)

	game:BindToClose(function()
		for _, player in Players:GetPlayers() do
			saveProfile(player)
		end
	end)

	task.spawn(function()
		while true do
			task.wait(AUTOSAVE_INTERVAL)
			for _, player in Players:GetPlayers() do
				saveProfile(player)
			end
		end
	end)
end

return Data
