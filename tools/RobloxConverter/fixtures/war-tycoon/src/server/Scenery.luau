-- Décor global : terrain, route, zone de départ, arbres, rochers, lampadaires.
local Workspace = game:GetService("Workspace")

local Props = require(script.Parent.Props)

local Scenery = {}

local function surfaceText(part: BasePart, face: Enum.NormalId, title: string, subtitle: string)
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	gui.Parent = part

	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 0.62)
	t.BackgroundTransparency = 1
	t.Text = title
	t.TextScaled = true
	t.Font = Enum.Font.GothamBlack
	t.TextColor3 = Color3.fromRGB(255, 200, 70)
	t.Parent = gui

	local s = Instance.new("TextLabel")
	s.Position = UDim2.fromScale(0, 0.62)
	s.Size = UDim2.fromScale(1, 0.3)
	s.BackgroundTransparency = 1
	s.Text = subtitle
	s.TextScaled = true
	s.Font = Enum.Font.GothamMedium
	s.TextColor3 = Color3.fromRGB(235, 235, 240)
	s.Parent = gui
end

function Scenery.build()
	local folder = Instance.new("Folder")
	folder.Name = "Decor"
	folder.Parent = Workspace

	-- Terrain herbeux
	local terrain = Workspace.Terrain
	terrain:Clear()
	terrain:SetMaterialColor(Enum.Material.Grass, Color3.fromRGB(86, 112, 64))
	terrain:FillBlock(CFrame.new(0, -8, 40), Vector3.new(900, 16, 300), Enum.Material.Grass)

	-- Route devant les bases, avec ses pointillés
	Props.block(folder, "Route", Vector3.new(900, 0.3, 16), CFrame.new(0, 0.15, 78), Color3.fromRGB(58, 60, 64), Enum.Material.Asphalt)
	for x = -420, 420, 26 do
		Props.block(folder, "Ligne", Vector3.new(11, 0.05, 0.7), CFrame.new(x, 0.33, 78), Color3.fromRGB(235, 235, 225))
	end

	-- Place de départ
	Props.cylinder(folder, "Place", Vector3.new(0, 0.15, 112), 54, 0.3, Color3.fromRGB(125, 127, 130), Enum.Material.Concrete)
	Props.cylinder(folder, "PlaceCentre", Vector3.new(0, 0.2, 112), 30, 0.3, Color3.fromRGB(100, 103, 108), Enum.Material.DiamondPlate)

	-- Panneau d'accueil (visible depuis le point de départ)
	local board = Props.block(folder, "Panneau", Vector3.new(36, 9, 1.2), CFrame.new(0, 10, 94), Color3.fromRGB(28, 32, 38), Enum.Material.Metal)
	surfaceText(board, Enum.NormalId.Back, "WAR TYCOON", "Prends une base  •  Construis  •  Domine")
	Props.block(folder, "PanneauBord", Vector3.new(37.5, 0.8, 1.6), CFrame.new(0, 14.8, 94), Color3.fromRGB(255, 190, 60), Enum.Material.Metal)
	Props.block(folder, "PanneauBord", Vector3.new(37.5, 0.8, 1.6), CFrame.new(0, 5.2, 94), Color3.fromRGB(255, 190, 60), Enum.Material.Metal)
	for _, x in { -16, 16 } do
		Props.cylinder(folder, "PanneauPied", Vector3.new(x, 5, 94), 1.2, 10, Color3.fromRGB(60, 62, 68), Enum.Material.Metal)
	end

	-- Décor de la place
	Props.flag(folder, Vector3.new(-24, 0, 106), Color3.fromRGB(200, 55, 55), 16)
	Props.flag(folder, Vector3.new(24, 0, 106), Color3.fromRGB(60, 120, 230), 16)
	Props.sandbags(folder, Vector3.new(-18, 0, 128), math.rad(10), 4)
	Props.sandbags(folder, Vector3.new(18, 0, 128), math.rad(-10), 4)
	Props.crate(folder, Vector3.new(-30, 0, 120), 4, 0.3)
	Props.crate(folder, Vector3.new(-26, 0, 123), 4, -0.2)
	Props.crate(folder, Vector3.new(-28, 4, 121), 3.4, 0.6)
	Props.barrel(folder, Vector3.new(30, 0, 120))
	Props.barrel(folder, Vector3.new(33, 0, 122), Color3.fromRGB(60, 110, 60))
	Props.barrel(folder, Vector3.new(31.5, 0, 125), Color3.fromRGB(175, 60, 45))

	-- Lampadaires le long de la route
	for x = -360, 360, 90 do
		Props.lamp(folder, Vector3.new(x, 0, 68), 14)
	end

	-- Forêt tout autour
	local rng = Random.new(1234)
	local function treeAt(x: number, z: number)
		Props.tree(folder, Vector3.new(x + rng:NextNumber(-5, 5), 0, z + rng:NextNumber(-4, 4)), rng:NextNumber(0.85, 1.4))
	end
	for x = -430, 430, 22 do
		treeAt(x, -90)
		if rng:NextNumber() < 0.6 then
			treeAt(x + 10, -78)
		end
		if math.abs(x) > 40 then
			treeAt(x, 176)
		end
	end
	for z = -70, 170, 24 do
		treeAt(-436, z)
		treeAt(436, z)
	end

	-- Rochers derrière les bases
	for i = 1, 14 do
		Props.rock(folder, Vector3.new(rng:NextInteger(-420, 420), 0, rng:NextInteger(-72, -58)), rng:NextNumber(3, 6), rng:NextNumber(0, 6))
	end
end

return Scenery
