--!strict
-- Puts the equipped cosmetic trail on each character.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shop = require(ReplicatedStorage.Shared.Shop)

local Profiles = require(script.Parent.Profiles)

local TrailService = {}

local PREFIX = "CosmeticTrail"

-- What each character currently wears, so coin updates don't rebuild trails.
local worn: { [Player]: string? } = {}

local function colorSequence(colors: { { number } }): ColorSequence
	local keypoints = {}
	for i, c in colors do
		local t = if #colors == 1 then 0 else (i - 1) / (#colors - 1)
		table.insert(keypoints, ColorSequenceKeypoint.new(t, Color3.fromRGB(c[1], c[2], c[3])))
	end
	if #keypoints == 1 then
		return ColorSequence.new(keypoints[1].Value)
	end
	return ColorSequence.new(keypoints)
end

local function rootOf(player: Player): BasePart?
	local character = player.Character
	return if character then character:FindFirstChild("HumanoidRootPart") :: BasePart? else nil
end

local function clear(root: BasePart)
	for _, child in root:GetChildren() do
		if string.sub(child.Name, 1, #PREFIX) == PREFIX then
			child:Destroy()
		end
	end
end

local function wear(player: Player, root: BasePart, trailId: string?)
	clear(root)
	worn[player] = trailId
	local def = if trailId then Shop.find(trailId) else nil
	if not def then
		return
	end

	-- A Trail draws between two attachments on the part it follows.
	local top = Instance.new("Attachment")
	top.Name = PREFIX .. "Top"
	top.Position = Vector3.new(0, 0.8, 0)
	top.Parent = root

	local bottom = Instance.new("Attachment")
	bottom.Name = PREFIX .. "Bottom"
	bottom.Position = Vector3.new(0, -0.8, 0)
	bottom.Parent = root

	local trail = Instance.new("Trail")
	trail.Name = PREFIX
	trail.Attachment0 = top
	trail.Attachment1 = bottom
	trail.Lifetime = 0.45
	trail.LightEmission = 0.6
	trail.Color = colorSequence(def.colors)
	trail.Transparency = NumberSequence.new(0.1, 1)
	trail.Parent = root
end

local function equipped(player: Player): string?
	local data = Profiles.get(player)
	return if data then data.equippedTrail else nil
end

function TrailService.start()
	local function watch(player: Player)
		player.CharacterAdded:Connect(function(character)
			local root = character:WaitForChild("HumanoidRootPart", 10) :: BasePart?
			if root then
				wear(player, root, equipped(player))
			end
		end)
	end

	Players.PlayerAdded:Connect(watch)
	for _, player in Players:GetPlayers() do
		watch(player)
	end
	Players.PlayerRemoving:Connect(function(player)
		worn[player] = nil
	end)

	Profiles.onChanged(function(player, data)
		local root = rootOf(player)
		if root and worn[player] ~= data.equippedTrail then
			wear(player, root, data.equippedTrail)
		end
	end)
end

return TrailService
