--!strict
-- Client entry point: builds the UI and keeps it in sync with the server.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Effects = require(script.Effects)
local Hud = require(script.Hud)
local ShopUi = require(script.ShopUi)

local Round = ReplicatedStorage:WaitForChild("Round")
local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local Notice = Remotes:WaitForChild("Notice") :: RemoteEvent
local Profile = Remotes:WaitForChild("Profile") :: RemoteEvent
local ShopRequest = Remotes:WaitForChild("ShopRequest") :: RemoteFunction

local player = Players.LocalPlayer
local gui = Instance.new("ScreenGui")
gui.Name = "LantaiRuntuh"
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = player:WaitForChild("PlayerGui")

local hud = Hud.new(gui)
local effects = Effects.new()
local shop = ShopUi.new(gui, function(action: string, id: string?): ShopUi.Response
	return ShopRequest:InvokeServer(action, id)
end, function(text: string)
	hud:toastMessage(text)
end)

hud.shopButton.Activated:Connect(function()
	shop:toggle()
end)

local function number(value: any): number
	return if type(value) == "number" then value else 0
end

local function readRound(): Hud.RoundState
	local phase = Round:GetAttribute("Phase")
	local target = number(Round:GetAttribute("Target"))
	return {
		phase = if type(phase) == "string" then phase else "Waiting",
		endsAt = number(Round:GetAttribute("EndsAt")),
		wave = number(Round:GetAttribute("Wave")),
		target = if target > 0 then target else nil,
		alive = number(Round:GetAttribute("Alive")),
		participants = number(Round:GetAttribute("Participants")),
		inRound = player:GetAttribute("InRound") == true,
	}
end

-- Several attributes change together; re-render once per frame instead of
-- once per attribute so the bar never shows a half-updated state.
local dirty = true
local round: Hud.RoundState? = nil
Round.AttributeChanged:Connect(function()
	dirty = true
end)
player:GetAttributeChangedSignal("InRound"):Connect(function()
	dirty = true
end)

RunService.RenderStepped:Connect(function()
	if dirty then
		dirty = false
		local state = readRound()
		round = state
		hud:setRound(state)
		effects:onState(state)
	end
	local now = Workspace:GetServerTimeNow()
	hud:update(now)
	effects:update(round, now)
end)

Notice.OnClientEvent:Connect(function(text: string)
	hud:toastMessage(text)
end)

Profile.OnClientEvent:Connect(function(profile: ShopUi.Profile)
	hud:setCoins(profile.coins)
	shop:setProfile(profile)
end)
