-- War Tycoon : mise en place du monde et des joueurs.
local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage.Shared.Config)
local Atmosphere = require(script.Parent.Atmosphere)
local Combat = require(script.Parent.Combat)
local Economy = require(script.Parent.Economy)
local Scenery = require(script.Parent.Scenery)
local Tycoon = require(script.Parent.Tycoon)
local Weapons = require(script.Parent.Weapons)

Players.RespawnTime = Config.RespawnTime

-- Nettoyage du décor par défaut
for _, name in { "Baseplate", "Obby", "Plots", "Sol" } do
	local old = Workspace:FindFirstChild(name)
	if old then
		old:Destroy()
	end
end
for _, child in Workspace:GetChildren() do
	if child:IsA("SpawnLocation") then
		child:Destroy()
	end
end

-- Ambiance, terrain, route, arbres...
Atmosphere.apply()
for _, name in { "Decor" } do
	local old = Workspace:FindFirstChild(name)
	if old then
		old:Destroy()
	end
end
Scenery.build()

local lobby = Instance.new("SpawnLocation")
lobby.Name = "Lobby"
lobby.Size = Vector3.new(14, 0.4, 14)
lobby.Position = Vector3.new(0, 0.5, 112)
lobby.Anchored = true
lobby.Neutral = true
lobby.Color = Color3.fromRGB(70, 74, 82)
lobby.Material = Enum.Material.DiamondPlate
lobby.Parent = Workspace

-- Les bases
local plots = Instance.new("Folder")
plots.Name = "Plots"
plots.Parent = Workspace
for i = 1, Config.PlotCount do
	Tycoon.new(i, Vector3.new((i - (Config.PlotCount + 1) / 2) * Config.PlotSpacing, 0, 0))
end

-- Joueurs
local function onPlayer(player: Player)
	Economy.setup(player)
	player.CharacterAdded:Connect(function(character)
		Combat.watch(player, character)
		Weapons.onSpawn(player)
		Tycoon.teleportHome(player)

		local shield = Instance.new("ForceField") -- protection après réapparition
		shield.Parent = character
		Debris:AddItem(shield, 4)
	end)
end

Players.PlayerAdded:Connect(onPlayer)
for _, player in Players:GetPlayers() do
	task.spawn(onPlayer, player)
end

Players.PlayerRemoving:Connect(function(player)
	local plot = Tycoon.plotOf[player]
	if plot then
		Tycoon.plotOf[player] = nil
		plot:release()
	end
	Weapons.cleanup(player)
end)

-- Chute dans le vide
task.spawn(function()
	while true do
		task.wait(0.5)
		for _, player in Players:GetPlayers() do
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart") :: BasePart?
			local humanoid = character and character:FindFirstChildOfClass("Humanoid")
			if root and humanoid and humanoid.Health > 0 and root.Position.Y < -50 then
				humanoid.Health = 0
			end
		end
	end
end)

print("War Tycoon prêt :", Config.PlotCount, "bases")
