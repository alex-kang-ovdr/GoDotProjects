--!strict
-- Server entry point: wires the data layer, then starts every service.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)

local DataService = require(script.Data.DataService)
local PlayerData = require(script.Data.PlayerData)
local RobloxStore = require(script.Data.RobloxStore)
local LeaderboardService = require(script.Services.LeaderboardService)
local Profiles = require(script.Services.Profiles)
local RoundService = require(script.Services.RoundService)
local ShopService = require(script.Services.ShopService)
local TrailService = require(script.Services.TrailService)

local store, persistent = RobloxStore.open(Config.Data.StoreName)
local cfg = Config.Data

Profiles.init(DataService.new({
	store = store,
	schema = PlayerData,
	-- JobId is empty in Studio; any unique string works as long as it is
	-- stable for this server's lifetime.
	jobId = if game.JobId ~= "" then game.JobId else "studio-" .. tostring(math.random(1, 1e9)),
	now = os.time,
	wait = function(seconds: number)
		task.wait(seconds)
	end,
	log = function(message: string)
		warn("[Data] " .. message)
	end,
	keyPrefix = cfg.KeyPrefix,
	lockTimeoutSeconds = cfg.LockTimeoutSeconds,
	lockWaitAttempts = cfg.LockWaitAttempts,
	lockWaitSeconds = cfg.LockWaitSeconds,
	maxRetries = cfg.MaxRetries,
	retryBaseSeconds = cfg.RetryBaseSeconds,
}))

TrailService.start()
ShopService.start()
RoundService.start()
LeaderboardService.start()

local function onPlayerAdded(player: Player)
	Profiles.load(player)
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in Players:GetPlayers() do
	task.spawn(onPlayerAdded, player)
end

Players.PlayerRemoving:Connect(function(player)
	Profiles.release(player)
end)

task.spawn(function()
	while true do
		task.wait(cfg.AutosaveSeconds)
		Profiles.saveAll(false)
	end
end)

game:BindToClose(function()
	task.spawn(LeaderboardService.flush)
	Profiles.saveAll(true)
end)

if not persistent then
	warn("[Data] Running without a DataStore: publish the place and enable API access to keep progress.")
end
