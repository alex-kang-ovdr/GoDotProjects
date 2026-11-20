-- Une base de tycoon : construction, réclamation, boutons d'achat, droppers, murs, tourelles.
local Debris = game:GetService("Debris")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage.Shared.Config)
local Combat = require(script.Parent.Combat)
local Economy = require(script.Parent.Economy)
local Fx = require(script.Parent.Fx)
local Props = require(script.Parent.Props)
local Weapons = require(script.Parent.Weapons)

local Tycoon = {}
Tycoon.__index = Tycoon

Tycoon.plotOf = {} :: { [Player]: any }

local TOP = 1 -- hauteur du dessus de la dalle
local V = Vector3.new
local C = Color3.fromRGB

local DARK = C(44, 47, 52)
local STEEL = C(88, 93, 100)
local CONCRETE = C(128, 130, 134)
local GREEN = C(70, 225, 115)

local block = Props.block

local function part(parent: Instance, name: string, size: Vector3, position: Vector3, color: Color3, material: Enum.Material?): Part
	return block(parent, name, size, CFrame.new(position), color, material)
end

-- Étiquette flottante : titre + sous-titre optionnel
local function sign(adornee: BasePart, title: string, subtitle: string?, height: number, accent: Color3): TextLabel
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(230, subtitle and 78 or 50)
	gui.StudsOffset = Vector3.new(0, height, 0)
	gui.Adornee = adornee
	gui.MaxDistance = 90
	gui.Parent = adornee

	local frame = Instance.new("Frame")
	frame.Size = UDim2.fromScale(1, 1)
	frame.BackgroundColor3 = C(14, 17, 23)
	frame.BackgroundTransparency = 0.2
	frame.Parent = gui
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 10)
	corner.Parent = frame
	local stroke = Instance.new("UIStroke")
	stroke.Color = accent
	stroke.Thickness = 2
	stroke.Parent = frame

	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, subtitle and 0.55 or 1)
	t.BackgroundTransparency = 1
	t.Text = title
	t.TextScaled = true
	t.Font = Enum.Font.GothamBold
	t.TextColor3 = C(255, 255, 255)
	t.Parent = frame

	if subtitle then
		local s = Instance.new("TextLabel")
		s.Position = UDim2.fromScale(0, 0.55)
		s.Size = UDim2.fromScale(1, 0.4)
		s.BackgroundTransparency = 1
		s.Text = subtitle
		s.TextScaled = true
		s.Font = Enum.Font.GothamMedium
		s.TextColor3 = accent
		s.Parent = frame
	end
	return t
end

local function playerFromHit(hit: BasePart): Player?
	local model = hit:FindFirstAncestorOfClass("Model")
	return model and Players:GetPlayerFromCharacter(model)
end

---------------------------------------------------------------------
-- Constructeurs d'objets achetables (un par "kind" de Config.Items)
---------------------------------------------------------------------
local builders = {}

function builders.dropper(self, item)
	local o = self.origin
	local x = -35 + (item.slot - 1) * 10
	local tint = Config.DropperColors[item.slot]
	local center = o + V(x, TOP + 10, -30)

	local model = Instance.new("Model")
	model.Name = item.name
	model.Parent = self.folder

	local body = part(model, "Corps", V(5, 4, 5), center, tint, Enum.Material.Metal)
	part(model, "Bande", V(5.3, 0.6, 5.3), center + V(0, 0.6, 0), tint:Lerp(C(255, 255, 255), 0.25), Enum.Material.Neon)
	part(model, "Tremie", V(7, 1.2, 7), center + V(0, 2.6, 0), DARK, Enum.Material.DiamondPlate)
	Props.cylinder(model, "Buse", center - V(0, 3, 0), 2.4, 2, DARK, Enum.Material.Metal)
	for _, dx in { -2.2, 2.2 } do
		part(model, "Pied", V(1, 8, 1), V(o.X + x + dx, TOP + 4, o.Z - 33.8), STEEL, Enum.Material.Metal)
	end
	part(model, "Traverse", V(5.4, 1, 1.6), center + V(0, -0.5, -3.3), STEEL, Enum.Material.Metal)
	sign(body, item.name, `${item.value} / billet`, 5, tint)

	task.spawn(function()
		while body.Parent do
			task.wait(Config.DropperInterval)
			if not body.Parent then
				break
			end
			if self.owner then
				local brick = Instance.new("Part")
				brick.Name = "Billet"
				brick.Size = V(1.8, 0.35, 1)
				brick.Color = C(105, 215, 110)
				brick.Material = Enum.Material.SmoothPlastic
				brick.Position = body.Position - V(0, 4, 0)
				brick:SetAttribute("CashValue", item.value)
				brick.Parent = self.folder
				brick:SetNetworkOwner(nil)
				Debris:AddItem(brick, 20)
			end
		end
	end)
end

function builders.walls(self, _item)
	local o = self.origin
	local size = Config.PlotSize
	local half = size / 2 - 1
	local cap = C(70, 72, 78)

	local function wall(name: string, wallSize: Vector3, pos: Vector3)
		part(self.folder, name, wallSize, o + pos, CONCRETE, Enum.Material.Concrete)
		part(self.folder, name .. "Chape", V(wallSize.X + (wallSize.X < 5 and 1 or 0), 0.8, wallSize.Z + (wallSize.Z < 5 and 1 or 0)), o + pos + V(0, wallSize.Y / 2 + 0.4, 0), cap, Enum.Material.Metal)
	end

	wall("MurGauche", V(2, 10, size), V(-half, TOP + 5, 0))
	wall("MurDroit", V(2, 10, size), V(half, TOP + 5, 0))
	wall("MurArriere", V(size, 10, 2), V(0, TOP + 5, -half))
	local seg = size / 2 - 7
	wall("MurAvantG", V(seg, 10, 2), V(-(7 + seg / 2), TOP + 5, half))
	wall("MurAvantD", V(seg, 10, 2), V(7 + seg / 2, TOP + 5, half))

	-- contreforts
	for _, p in { -37.5, -12.5, 12.5, 37.5 } do
		part(self.folder, "Contrefort", V(3, 11, 3), o + V(-half + 2.5, TOP + 5.5, p), STEEL, Enum.Material.Concrete)
		part(self.folder, "Contrefort", V(3, 11, 3), o + V(half - 2.5, TOP + 5.5, p), STEEL, Enum.Material.Concrete)
		part(self.folder, "Contrefort", V(3, 11, 3), o + V(p, TOP + 5.5, -half + 2.5), STEEL, Enum.Material.Concrete)
	end

	-- bandes d'avertissement à la couleur de l'équipe
	part(self.folder, "BandeEquipe", V(2.2, 1, size), o + V(-half, TOP + 8.5, 0), self.accent, Enum.Material.Neon)
	part(self.folder, "BandeEquipe", V(2.2, 1, size), o + V(half, TOP + 8.5, 0), self.accent, Enum.Material.Neon)
	part(self.folder, "BandeEquipe", V(size, 1, 2.2), o + V(0, TOP + 8.5, -half), self.accent, Enum.Material.Neon)
end

function builders.turret(self, item)
	local pos = self.origin + item.turretPos + V(0, TOP, 0)
	local model = Instance.new("Model")
	model.Name = "Tourelle"
	model.Parent = self.folder

	Props.cylinder(model, "Socle", pos + V(0, 0.75, 0), 6, 1.5, DARK, Enum.Material.DiamondPlate)
	Props.cylinder(model, "Colonne", pos + V(0, 2.5, 0), 2.4, 2.2, STEEL, Enum.Material.Metal)

	local headModel = Instance.new("Model")
	headModel.Name = "Tete"
	headModel.Parent = model
	local hc = pos + V(0, 4.3, 0)
	local core = part(headModel, "Noyau", V(2.8, 2, 3.2), hc, self.accent, Enum.Material.Metal)
	part(headModel, "Casque", V(2.4, 0.6, 2.8), hc + V(0, 1.2, 0), DARK, Enum.Material.Metal)
	part(headModel, "Plaque", V(3.2, 1.2, 1), hc + V(0, 0, -1.8), STEEL, Enum.Material.DiamondPlate)
	for _, dx in { -0.65, 0.65 } do
		Props.pipe(headModel, "Canon", CFrame.new(hc + V(dx, 0.1, -3.4)), 0.55, 4, DARK, Enum.Material.Metal)
		Props.pipe(headModel, "Bouche", CFrame.new(hc + V(dx, 0.1, -5.3)), 0.8, 0.5, C(25, 25, 28), Enum.Material.Metal)
	end
	part(headModel, "Oeil", V(1, 0.4, 0.15), hc + V(0, 0.55, -1.65), C(255, 60, 40), Enum.Material.Neon)
	headModel.PrimaryPart = core

	-- protection en sacs de sable
	Props.sandbags(model, pos + V(0, 0, 4.6), 0, 3)
	Props.sandbags(model, pos + V(4.6, 0, 0), math.rad(90), 3)
	Props.sandbags(model, pos + V(-4.6, 0, 0), math.rad(90), 3)

	task.spawn(function()
		local params = RaycastParams.new()
		params.FilterType = Enum.RaycastFilterType.Exclude
		params.FilterDescendantsInstances = { model }

		while core.Parent do
			task.wait(Config.TurretInterval)
			local owner = self.owner
			if not owner then
				continue
			end

			local bestHum: Humanoid? = nil
			local bestRoot: BasePart? = nil
			local bestDist = Config.TurretRange
			for _, p in Players:GetPlayers() do
				if p == owner then
					continue
				end
				local char = p.Character
				local hum = char and char:FindFirstChildOfClass("Humanoid")
				local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
				if char and hum and root and hum.Health > 0 then
					local d = (root.Position - hc).Magnitude
					if d < bestDist then
						-- ligne de vue : les murs bloquent les tirs
						local result = Workspace:Raycast(hc, root.Position - hc, params)
						if result and result.Instance:IsDescendantOf(char) then
							bestDist = d
							bestHum = hum
							bestRoot = root
						end
					end
				end
			end

			if bestHum and bestRoot then
				headModel:PivotTo(CFrame.lookAt(hc, bestRoot.Position))
				local muzzle = (headModel:GetPivot() * CFrame.new(0, 0.1, -5.6)).Position
				Fx.tracer(muzzle, bestRoot.Position)
				Combat.damage(bestHum, item.damage, owner)
			end
		end
	end)
end

function builders.weapon(self, item)
	local c = self.origin + item.padPos + V(0, TOP, 0)
	local blue = C(70, 150, 255)
	Props.cylinder(self.folder, "ArmeSocle", c + V(0, 0.25, 0), 8.4, 0.5, DARK, Enum.Material.Metal)
	local glow = Props.cylinder(self.folder, "Arme_" .. item.id, c + V(0, 0.6, 0), 6.6, 0.25, blue, Enum.Material.Neon)
	sign(glow, item.weapon, "(marche dessus)", 8, blue)

	-- vitrine tournante
	local display = Weapons.display(item.weapon)
	display.Parent = self.folder
	display:ScaleTo(1.8)
	local angle = 0
	local conn: RBXScriptConnection
	conn = RunService.Heartbeat:Connect(function(dt)
		if not display.Parent then
			conn:Disconnect()
			return
		end
		angle += dt
		display:PivotTo(CFrame.new(c + V(0, 4 + math.sin(angle * 2) * 0.3, 0)) * CFrame.Angles(0, angle, 0))
	end)

	glow.Touched:Connect(function(hit)
		local player = playerFromHit(hit)
		if player and player == self.owner then
			Weapons.give(player, item.weapon)
		end
	end)
	if self.owner then
		Weapons.unlock(self.owner, item.weapon)
	end
end

---------------------------------------------------------------------
-- Base
---------------------------------------------------------------------

function Tycoon.new(index: number, origin: Vector3)
	local self = setmetatable({}, Tycoon)
	self.index = index
	self.origin = origin
	self.owner = nil :: Player?
	self.accent = Config.PlotColors[(index - 1) % #Config.PlotColors + 1]
	self:build()
	return self
end

function Tycoon:build()
	local o = self.origin
	local size = Config.PlotSize
	local half = size / 2
	local accent = self.accent

	local folder = Instance.new("Folder")
	folder.Name = "Base" .. self.index
	folder.Parent = Workspace:WaitForChild("Plots")

	self.folder = folder
	self.owned = {}
	self.buttons = {}
	self.spawnPoint = o + V(0, TOP + 4, 30)

	-- Sol : dalle en béton avec dalle intérieure en tôle et liseré d'équipe
	part(folder, "Dalle", V(size, 1, size), o + V(0, 0.5, 0), C(92, 96, 100), Enum.Material.Concrete)
	part(folder, "Plateau", V(size - 8, 0.2, size - 8), o + V(0, TOP + 0.1, 0), C(118, 122, 126), Enum.Material.Concrete)
	for _, s in { -1, 1 } do
		part(folder, "Liseré", V(size - 2, 0.15, 1), o + V(0, TOP + 0.08, s * (half - 1)), accent, Enum.Material.Neon)
		part(folder, "Liseré", V(1, 0.15, size - 2), o + V(s * (half - 1), TOP + 0.08, 0), accent, Enum.Material.Neon)
	end

	-- Piliers de l'entrée
	for _, s in { -1, 1 } do
		part(folder, "Pilier", V(3, 13, 3), o + V(s * 8.5, TOP + 6.5, half - 1), STEEL, Enum.Material.Concrete)
		part(folder, "PilierChape", V(3.6, 1, 3.6), o + V(s * 8.5, TOP + 13.5, half - 1), accent, Enum.Material.Metal)
		part(folder, "PilierLampe", V(1.4, 0.4, 1.4), o + V(s * 8.5, TOP + 14.2, half - 1), C(255, 240, 200), Enum.Material.Neon)
	end

	-- Zone de réclamation
	Props.cylinder(folder, "ReclamerSocle", o + V(0, TOP + 0.25, 38), 13, 0.5, DARK, Enum.Material.Metal)
	local claim = Props.cylinder(folder, "Reclamer", o + V(0, TOP + 0.6, 38), 11, 0.25, accent, Enum.Material.Neon)
	self.claimPart = claim
	self.claimLabel = sign(claim, "RÉCLAMER CETTE BASE", nil, 5, accent)
	Props.flag(folder, o + V(8, TOP, 38), accent, 13)
	claim.Touched:Connect(function(hit)
		local player = playerFromHit(hit)
		if player then
			self:claim(player)
		end
	end)

	-- Tapis roulant : rails jaunes + collecteur
	local belt = part(folder, "Tapis", V(36, 0.6, 6), o + V(-22, TOP + 0.3, -30), C(36, 38, 42), Enum.Material.Metal)
	belt.AssemblyLinearVelocity = V(14, 0, 0)
	for _, s in { -1, 1 } do
		part(folder, "Rail", V(36, 1.1, 0.5), o + V(-22, TOP + 0.55, -30 + s * 3.25), C(240, 190, 40), Enum.Material.Metal)
	end
	for i = 0, 5 do
		part(folder, "Voyant", V(1.2, 0.1, 0.5), o + V(-37 + i * 6, TOP + 0.62, -30), C(255, 210, 60), Enum.Material.Neon)
	end

	local collector = part(folder, "Collecteur", V(4, 3, 6), o + V(-1, TOP + 1.5, -30), C(235, 140, 35), Enum.Material.Metal)
	part(folder, "CollecteurHaut", V(4.4, 0.4, 6.4), o + V(-1, TOP + 3.2, -30), C(255, 205, 80), Enum.Material.Neon)
	part(folder, "CollecteurCoffre", V(3, 2, 5), o + V(2.7, TOP + 1, -30), DARK, Enum.Material.DiamondPlate)
	sign(collector, "COLLECTEUR", nil, 4.5, C(255, 190, 70))
	collector.Touched:Connect(function(hit)
		local value = hit:GetAttribute("CashValue")
		if value and hit.Parent then
			hit:SetAttribute("CashValue", nil)
			hit:Destroy()
			if self.owner then
				Economy.add(self.owner, value)
			end
		end
	end)

	-- Décor militaire
	Props.crate(folder, o + V(40, TOP, -40), 4, 0.15)
	Props.crate(folder, o + V(44, TOP, -40), 4, -0.1)
	Props.crate(folder, o + V(42, TOP, -36.5), 4, 0.3)
	Props.crate(folder, o + V(42, TOP + 4, -40), 3.4, 0.5)
	Props.barrel(folder, o + V(-44, TOP, -42))
	Props.barrel(folder, o + V(-40.5, TOP, -42), C(60, 105, 60))
	Props.barrel(folder, o + V(-42, TOP, -38.5), C(175, 60, 45))
	Props.sandbags(folder, o + V(-14, TOP, 46), 0, 4)
	Props.sandbags(folder, o + V(14, TOP, 46), 0, 4)
	for _, p in { V(-44, 0, -44), V(44, 0, -44), V(-44, 0, 22), V(44, 0, 22) } do
		Props.lamp(folder, o + p + V(0, TOP, 0), 13)
	end

	self:showAvailableButtons()
end

function Tycoon:claim(player: Player)
	if self.owner then
		return
	end
	if Tycoon.plotOf[player] then
		Economy.notify(player, "Tu as déjà une base !")
		return
	end
	self.owner = player
	Tycoon.plotOf[player] = self
	player:SetAttribute("HasBase", true)
	self.claimLabel.Text = `Base de {player.Name}`
	self.claimPart.Color = C(110, 112, 116)
	self.claimPart.Material = Enum.Material.Metal
	Economy.notify(player, "Base réclamée ! Marche sur les boutons verts pour acheter.")
	Tycoon.teleportHome(player)

	-- armes déjà achetées (si la base a été reconstruite)
	for _, item in Config.Items do
		if self.owned[item.id] and item.kind == "weapon" then
			Weapons.unlock(player, item.weapon)
		end
	end
end

-- Libère la base (départ du joueur) et la remet à zéro
function Tycoon:release()
	self.owner = nil
	self.folder:Destroy()
	self:build()
end

function Tycoon:requirementsMet(item): boolean
	for _, id in item.requires or {} do
		if not self.owned[id] then
			return false
		end
	end
	return true
end

function Tycoon:showAvailableButtons()
	for _, item in Config.Items do
		if not self.owned[item.id] and not self.buttons[item.id] and self:requirementsMet(item) then
			self:makeButton(item)
		end
	end
end

function Tycoon:makeButton(item)
	local c = self.origin + item.pos + V(0, TOP, 0)
	local model = Instance.new("Model")
	model.Name = "Bouton_" .. item.id
	model.Parent = self.folder

	Props.cylinder(model, "Socle", c + V(0, 0.2, 0), 8, 0.4, DARK, Enum.Material.Metal)
	local pad = Props.cylinder(model, "Pad", c + V(0, 0.5, 0), 6.6, 0.25, GREEN, Enum.Material.Neon)
	sign(pad, item.name, `${item.price}`, 4.5, GREEN)
	self.buttons[item.id] = model

	local busy = false
	pad.Touched:Connect(function(hit)
		local player = playerFromHit(hit)
		if busy or not player or player ~= self.owner then
			return
		end
		busy = true
		self:buy(item, model)
		task.wait(0.6)
		busy = false
	end)
end

function Tycoon:buy(item, button: Instance)
	local owner = self.owner
	if not owner or self.owned[item.id] then
		return
	end
	if not Economy.spend(owner, item.price) then
		Economy.notify(owner, `Pas assez d'argent ({item.name} : ${item.price})`)
		return
	end
	self.owned[item.id] = true
	self.buttons[item.id] = nil
	button:Destroy()
	builders[item.kind](self, item)
	Economy.notify(owner, `Acheté : {item.name}`)
	self:showAvailableButtons()
end

-- Téléporte le joueur dans sa base (s'il en a une)
function Tycoon.teleportHome(player: Player)
	local plot = Tycoon.plotOf[player]
	local character = player.Character
	if plot and character then
		character:WaitForChild("HumanoidRootPart")
		character:PivotTo(CFrame.new(plot.spawnPoint))
	end
end

return Tycoon
