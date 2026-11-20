-- Server entry point. Creates the remotes, then wires services together in
-- dependency order. Services receive their dependencies explicitly instead of
-- requiring each other, which keeps the graph flat and easy to follow.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local remotes = Instance.new("Folder")
remotes.Name = "Remotes"
for _, name in { "Punch", "BuyGear", "Rebirth", "Notify", "ToggleAutoTrain" } do
	local remote = Instance.new("RemoteEvent")
	remote.Name = name
	remote.Parent = remotes
end
remotes.Parent = ReplicatedStorage

local Data = require(script.Data)
local Monetization = require(script.Monetization)
local Training = require(script.Training)
local Shop = require(script.Shop)
local MapBuilder = require(script.MapBuilder)
local GlobalLeaderboard = require(script.GlobalLeaderboard)

local mapHandles = MapBuilder.build()

Data.start()
Monetization.start(Data)
Training.start(Data, Monetization, MapBuilder)
Shop.start(Data)
GlobalLeaderboard.start(Data, mapHandles.leaderboardPart)

print("[Server] Power Punch Simulator ready 💪")
