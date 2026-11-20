-- Éléments de décor et briques de construction (tout est ancré).
local Props = {}

local function mk(
	parent: Instance,
	name: string,
	size: Vector3,
	cf: CFrame,
	color: Color3,
	material: Enum.Material?,
	shape: Enum.PartType?
): Part
	local p = Instance.new("Part")
	p.Name = name
	p.Size = size
	p.CFrame = cf
	p.Anchored = true
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	if shape then
		p.Shape = shape
	end
	p.Parent = parent
	return p
end

Props.block = mk

-- Cylindre debout (axe vertical). `center` = centre de la pièce.
function Props.cylinder(parent: Instance, name: string, center: Vector3, diameter: number, height: number, color: Color3, material: Enum.Material?): Part
	return mk(
		parent,
		name,
		Vector3.new(height, diameter, diameter),
		CFrame.new(center) * CFrame.Angles(0, 0, math.rad(90)),
		color,
		material,
		Enum.PartType.Cylinder
	)
end

-- Cylindre couché le long de l'axe Z du CFrame donné (canons, tuyaux).
function Props.pipe(parent: Instance, name: string, cf: CFrame, diameter: number, length: number, color: Color3, material: Enum.Material?): Part
	return mk(parent, name, Vector3.new(length, diameter, diameter), cf * CFrame.Angles(0, math.rad(90), 0), color, material, Enum.PartType.Cylinder)
end

function Props.crate(parent: Instance, position: Vector3, size: number, yaw: number?): Model
	local m = Instance.new("Model")
	m.Name = "Caisse"
	local base = CFrame.new(position + Vector3.new(0, size / 2, 0)) * CFrame.Angles(0, yaw or 0, 0)
	mk(m, "Corps", Vector3.new(size, size, size), base, Color3.fromRGB(150, 112, 68), Enum.Material.Wood)
	for _, off in { -0.32, 0.32 } do
		mk(m, "Sangle", Vector3.new(size + 0.1, size + 0.1, size * 0.12), base * CFrame.new(0, 0, off * size), Color3.fromRGB(58, 44, 30), Enum.Material.Wood)
	end
	m.Parent = parent
	return m
end

function Props.barrel(parent: Instance, position: Vector3, color: Color3?): Model
	local m = Instance.new("Model")
	m.Name = "Baril"
	local c = color or Color3.fromRGB(175, 60, 45)
	Props.cylinder(m, "Corps", position + Vector3.new(0, 1.8, 0), 2.6, 3.6, c, Enum.Material.Metal)
	Props.cylinder(m, "AnneauBas", position + Vector3.new(0, 0.7, 0), 2.75, 0.25, Color3.fromRGB(45, 45, 48), Enum.Material.Metal)
	Props.cylinder(m, "AnneauHaut", position + Vector3.new(0, 2.9, 0), 2.75, 0.25, Color3.fromRGB(45, 45, 48), Enum.Material.Metal)
	m.Parent = parent
	return m
end

function Props.sandbags(parent: Instance, position: Vector3, yaw: number, count: number): Model
	local m = Instance.new("Model")
	m.Name = "SacsDeSable"
	local base = CFrame.new(position) * CFrame.Angles(0, yaw, 0)
	local rng = Random.new(math.floor(position.X * 31 + position.Z * 17))
	for layer = 0, 1 do
		local n = count - layer
		for i = 1, n do
			local x = (i - (n + 1) / 2) * 3.3
			local shade = rng:NextInteger(-12, 12)
			mk(
				m,
				"Sac",
				Vector3.new(3.2, 1.2, 1.9),
				base * CFrame.new(x, 0.6 + layer * 1.15, 0) * CFrame.Angles(0, rng:NextNumber(-0.06, 0.06), 0),
				Color3.fromRGB(190 + shade, 170 + shade, 122 + shade),
				Enum.Material.Fabric
			)
		end
	end
	m.Parent = parent
	return m
end

function Props.tree(parent: Instance, position: Vector3, scale: number): Model
	local m = Instance.new("Model")
	m.Name = "Arbre"
	local rng = Random.new(math.floor(position.X * 13 + position.Z * 7))
	local s = scale
	Props.cylinder(m, "Tronc", position + Vector3.new(0, 3.5 * s, 0), 1.5 * s, 7 * s, Color3.fromRGB(92, 64, 40), Enum.Material.Wood)
	local green = Color3.fromRGB(rng:NextInteger(45, 70), rng:NextInteger(100, 130), rng:NextInteger(40, 60))
	local balls = {
		{ Vector3.new(0, 8.5, 0), 9 },
		{ Vector3.new(2.2, 7, 1.2), 6.5 },
		{ Vector3.new(-2, 7.4, -1.4), 7 },
	}
	for _, b in balls do
		local d = b[2] * s
		mk(m, "Feuillage", Vector3.new(d, d, d), CFrame.new(position + b[1] * s), green, Enum.Material.Grass, Enum.PartType.Ball)
	end
	m.Parent = parent
	return m
end

function Props.lamp(parent: Instance, position: Vector3, height: number?): Model
	local m = Instance.new("Model")
	m.Name = "Lampadaire"
	local h = height or 14
	local dark = Color3.fromRGB(50, 52, 56)
	Props.cylinder(m, "Mat", position + Vector3.new(0, h / 2, 0), 0.8, h, dark, Enum.Material.Metal)
	Props.cylinder(m, "Pied", position + Vector3.new(0, 0.4, 0), 1.8, 0.8, dark, Enum.Material.Metal)
	mk(m, "Bras", Vector3.new(0.5, 0.5, 3), CFrame.new(position + Vector3.new(0, h, -1.3)), dark, Enum.Material.Metal)
	local head = mk(m, "Lampe", Vector3.new(2.2, 0.5, 2.2), CFrame.new(position + Vector3.new(0, h - 0.4, -2.8)), Color3.fromRGB(255, 225, 160), Enum.Material.Neon)
	local light = Instance.new("PointLight")
	light.Color = Color3.fromRGB(255, 220, 160)
	light.Brightness = 1.6
	light.Range = 40
	light.Parent = head
	m.Parent = parent
	return m
end

function Props.rock(parent: Instance, position: Vector3, size: number, yaw: number?): Model
	local m = Instance.new("Model")
	m.Name = "Rocher"
	local rng = Random.new(math.floor(position.X * 5 + position.Z * 3))
	for i = 1, 3 do
		local s = size * (i == 1 and 1 or 0.6)
		local g = rng:NextInteger(95, 125)
		mk(
			m,
			"Pierre",
			Vector3.new(s * rng:NextNumber(1, 1.5), s * rng:NextNumber(0.7, 1), s * rng:NextNumber(1, 1.4)),
			CFrame.new(position + Vector3.new((i - 2) * size * 0.7, size * 0.25, (i - 2) * size * 0.4))
				* CFrame.Angles(rng:NextNumber(-0.3, 0.3), (yaw or 0) + i, rng:NextNumber(-0.3, 0.3)),
			Color3.fromRGB(g, g, g - 6),
			Enum.Material.Slate
		)
	end
	m.Parent = parent
	return m
end

function Props.flag(parent: Instance, position: Vector3, color: Color3, height: number?): Model
	local m = Instance.new("Model")
	m.Name = "Drapeau"
	local h = height or 14
	Props.cylinder(m, "Mat", position + Vector3.new(0, h / 2, 0), 0.5, h, Color3.fromRGB(190, 190, 195), Enum.Material.Metal)
	mk(m, "Tissu", Vector3.new(5.5, 3.2, 0.2), CFrame.new(position + Vector3.new(3, h - 2, 0)), color, Enum.Material.Fabric)
	mk(m, "Bande", Vector3.new(5.5, 0.6, 0.25), CFrame.new(position + Vector3.new(3, h - 2, 0)), Color3.fromRGB(245, 245, 245), Enum.Material.Fabric)
	m.Parent = parent
	return m
end

return Props
