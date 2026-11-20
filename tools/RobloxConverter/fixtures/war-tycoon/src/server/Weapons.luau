-- Armes : création des Tools et gestion des tirs (le serveur décide de tout).
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage.Shared.Config)
local Combat = require(script.Parent.Combat)
local Fx = require(script.Parent.Fx)

local Weapons = {}

local owned: { [Player]: { [string]: boolean } } = {}
local lastShot: { [Player]: number } = {}
local rng = Random.new()

local shootEvent = Instance.new("RemoteEvent")
shootEvent.Name = "Shoot"
shootEvent.Parent = ReplicatedStorage

local DARK = Color3.fromRGB(34, 36, 40)
local WOOD = Color3.fromRGB(112, 76, 45)

-- Ajoute une pièce soudée au Handle (offset relatif au centre du Handle)
local function addPiece(tool: Tool, handle: Part, name: string, size: Vector3, offset: CFrame, color: Color3, material: Enum.Material?, cylinder: boolean?)
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.Color = color
	p.Material = material or Enum.Material.Metal
	p.CanCollide = false
	p.Massless = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	if cylinder then
		p.Shape = Enum.PartType.Cylinder
	end
	p.CFrame = handle.CFrame * offset
	p.Parent = tool

	local weld = Instance.new("WeldConstraint")
	weld.Part0 = handle
	weld.Part1 = p
	weld.Parent = p
end

-- Le canon pointe vers -Z (l'avant du Handle)
function Weapons.makeTool(name: string): Tool
	local def = Config.Weapons[name]
	local L = def.length
	local tool = Instance.new("Tool")
	tool.Name = name
	tool.CanBeDropped = false
	tool.RequiresHandle = true
	tool:SetAttribute("Weapon", name)

	local style = def.style
	local rec = style == "pistol" and L or L * 0.5 -- longueur du boîtier

	local handle = Instance.new("Part")
	handle.Name = "Handle"
	handle.Size = Vector3.new(style == "pistol" and 0.35 or 0.45, style == "pistol" and 0.6 or 0.8, rec)
	handle.Color = def.color
	handle.Material = Enum.Material.Metal
	handle.TopSurface = Enum.SurfaceType.Smooth
	handle.BottomSurface = Enum.SurfaceType.Smooth
	handle.Parent = tool

	if style == "pistol" then
		addPiece(tool, handle, "Crosse", Vector3.new(0.35, 1, 0.5), CFrame.new(0, -0.75, rec * 0.3) * CFrame.Angles(math.rad(-12), 0, 0), DARK, Enum.Material.Plastic)
		addPiece(tool, handle, "Canon", Vector3.new(0.25, 0.25, 0.35), CFrame.new(0, 0.05, -(rec / 2 + 0.17)), DARK)
	else
		local barrelLen = L * 0.5
		addPiece(tool, handle, "Canon", Vector3.new(barrelLen, 0.22, 0.22), CFrame.new(0, 0.14, -(rec / 2 + barrelLen / 2)) * CFrame.Angles(0, math.rad(90), 0), DARK, Enum.Material.Metal, true)
		addPiece(tool, handle, "Crosse", Vector3.new(0.4, 0.75, L * 0.3), CFrame.new(0, -0.05, rec / 2 + L * 0.15), style == "shotgun" and WOOD or DARK, style == "shotgun" and Enum.Material.Wood or Enum.Material.Plastic)
		addPiece(tool, handle, "Poignee", Vector3.new(0.32, 0.8, 0.4), CFrame.new(0, -0.75, rec * 0.3) * CFrame.Angles(math.rad(-10), 0, 0), DARK, Enum.Material.Plastic)

		if style == "shotgun" then
			addPiece(tool, handle, "Pompe", Vector3.new(0.55, 0.45, L * 0.25), CFrame.new(0, -0.1, -(rec / 2 + L * 0.12)), WOOD, Enum.Material.Wood)
		elseif style == "rifle" then
			addPiece(tool, handle, "Chargeur", Vector3.new(0.34, 1, 0.45), CFrame.new(0, -0.85, -rec * 0.18) * CFrame.Angles(math.rad(8), 0, 0), DARK, Enum.Material.Metal)
			addPiece(tool, handle, "Mire", Vector3.new(0.2, 0.3, 0.5), CFrame.new(0, 0.55, -rec * 0.2), DARK)
		elseif style == "sniper" then
			addPiece(tool, handle, "Lunette", Vector3.new(L * 0.32, 0.5, 0.5), CFrame.new(0, 0.75, -0.1) * CFrame.Angles(0, math.rad(90), 0), DARK, Enum.Material.Metal, true)
			addPiece(tool, handle, "SupportA", Vector3.new(0.2, 0.4, 0.2), CFrame.new(0, 0.5, -0.5), DARK)
			addPiece(tool, handle, "SupportB", Vector3.new(0.2, 0.4, 0.2), CFrame.new(0, 0.5, 0.35), DARK)
			addPiece(tool, handle, "Chargeur", Vector3.new(0.3, 0.6, 0.4), CFrame.new(0, -0.6, -rec * 0.15), DARK, Enum.Material.Metal)
		end
	end

	return tool
end

-- Modèle décoratif (ancré) d'une arme, pour les vitrines de la base
function Weapons.display(name: string): Model
	local tool = Weapons.makeTool(name)
	local model = Instance.new("Model")
	model.Name = "Vitrine_" .. name
	for _, child in tool:GetChildren() do
		if child:IsA("BasePart") then
			child.Anchored = true
			child.Parent = model
		end
	end
	model.PrimaryPart = model:FindFirstChild("Handle") :: BasePart
	tool:Destroy()
	return model
end

function Weapons.give(player: Player, name: string)
	local backpack = player:FindFirstChildOfClass("Backpack")
	if not backpack then
		return
	end
	if backpack:FindFirstChild(name) or (player.Character and player.Character:FindFirstChild(name)) then
		return
	end
	Weapons.makeTool(name).Parent = backpack
end

-- Débloque une arme pour toute la session (elle revient à chaque réapparition)
function Weapons.unlock(player: Player, name: string)
	owned[player] = owned[player] or {}
	owned[player][name] = true
	Weapons.give(player, name)
end

function Weapons.onSpawn(player: Player)
	task.spawn(function()
		task.wait(0.5) -- laisse le Backpack se recréer
		Weapons.give(player, "Pistolet")
		for name in owned[player] or {} do
			Weapons.give(player, name)
		end
	end)
end

function Weapons.cleanup(player: Player)
	owned[player] = nil
	lastShot[player] = nil
end

shootEvent.OnServerEvent:Connect(function(player: Player, target: any)
	if typeof(target) ~= "Vector3" then
		return
	end
	local character = player.Character
	local humanoid = character and character:FindFirstChildOfClass("Humanoid")
	local head = character and character:FindFirstChild("Head") :: BasePart?
	if not character or not humanoid or humanoid.Health <= 0 or not head then
		return
	end

	local tool = character:FindFirstChildOfClass("Tool")
	local name = tool and tool:GetAttribute("Weapon")
	local def = name and Config.Weapons[name]
	if not def then
		return
	end

	local now = os.clock()
	if now - (lastShot[player] or 0) < def.cooldown * 0.9 then
		return
	end
	lastShot[player] = now

	local origin = head.Position
	local offset = target - origin
	if offset.Magnitude < 0.1 then
		return
	end
	local dir = offset.Unit
	local muzzle = tool and tool:FindFirstChild("Handle") :: BasePart?
	local visualOrigin = muzzle and muzzle.Position or origin

	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { character }

	for _ = 1, def.pellets do
		local spread = Vector3.new(rng:NextNumber(-1, 1), rng:NextNumber(-1, 1), rng:NextNumber(-1, 1)) * def.spread
		local d = (dir + spread).Unit
		local result = Workspace:Raycast(origin, d * def.range, params)
		local endPos = result and result.Position or origin + d * def.range
		if result then
			local model = result.Instance:FindFirstAncestorOfClass("Model")
			local hum = model and model:FindFirstChildOfClass("Humanoid")
			if hum then
				Combat.damage(hum, def.damage, player)
			end
		end
		Fx.tracer(visualOrigin, endPos)
	end
end)

return Weapons
