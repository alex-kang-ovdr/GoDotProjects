-- Réglages du War Tycoon. Tout se modifie ici : prix, dégâts, armes, boutiques.
local V = Vector3.new

local Config = {}

Config.StartCash = 300
Config.KillReward = 150 -- argent gagné par élimination
Config.PlotCount = 4
Config.PlotSpacing = 130
Config.PlotSize = 100
Config.RespawnTime = 3
Config.DropperInterval = 2 -- secondes entre deux billets
Config.TurretRange = 90
Config.TurretInterval = 0.4

-- Couleur d'équipe de chaque base
Config.PlotColors = {
	Color3.fromRGB(225, 65, 65),
	Color3.fromRGB(65, 125, 235),
	Color3.fromRGB(240, 165, 45),
	Color3.fromRGB(155, 85, 215),
}

Config.DropperColors = {
	Color3.fromRGB(120, 190, 90),
	Color3.fromRGB(90, 160, 230),
	Color3.fromRGB(235, 190, 60),
}

-- style : forme de l'arme (pistol, shotgun, rifle, sniper)
Config.Weapons = {
	["Pistolet"] = { style = "pistol", damage = 14, cooldown = 0.35, range = 250, spread = 0.01, pellets = 1, length = 1.4, color = Color3.fromRGB(60, 60, 66) },
	["Fusil à pompe"] = { style = "shotgun", damage = 9, cooldown = 0.9, range = 70, spread = 0.09, pellets = 8, length = 3.2, color = Color3.fromRGB(70, 70, 76) },
	["Fusil d'assaut"] = { style = "rifle", damage = 15, cooldown = 0.12, range = 300, spread = 0.03, pellets = 1, length = 3.2, color = Color3.fromRGB(70, 90, 60) },
	["Sniper"] = { style = "sniper", damage = 75, cooldown = 1.5, range = 700, spread = 0, pellets = 1, length = 4.2, color = Color3.fromRGB(45, 50, 58) },
}

-- pos : position du bouton d'achat (relative au centre de la base)
Config.Items = {
	-- Économie : des droppers lâchent des billets qui glissent jusqu'au collecteur
	{ id = "dropper1", name = "Dropper 1", price = 150, kind = "dropper", slot = 1, value = 10, pos = V(-40, 0, 10) },
	{ id = "dropper2", name = "Dropper 2", price = 500, requires = { "dropper1" }, kind = "dropper", slot = 2, value = 25, pos = V(-30, 0, 10) },
	{ id = "dropper3", name = "Dropper 3", price = 1500, requires = { "dropper2" }, kind = "dropper", slot = 3, value = 60, pos = V(-20, 0, 10) },

	-- Défense
	{ id = "murs", name = "Murs", price = 400, kind = "walls", pos = V(0, 0, 10) },
	{ id = "tourelle1", name = "Tourelle 1", price = 600, requires = { "murs" }, kind = "turret", damage = 6, turretPos = V(-22, 0, 44), pos = V(10, 0, 10) },
	{ id = "tourelle2", name = "Tourelle 2", price = 1200, requires = { "tourelle1" }, kind = "turret", damage = 7, turretPos = V(22, 0, 44), pos = V(20, 0, 10) },
	{ id = "tourelle3", name = "Tourelle 3", price = 2500, requires = { "tourelle2" }, kind = "turret", damage = 9, turretPos = V(-44, 0, 0), pos = V(30, 0, 10) },
	{ id = "tourelle4", name = "Tourelle 4", price = 4000, requires = { "tourelle3" }, kind = "turret", damage = 12, turretPos = V(44, 0, 0), pos = V(40, 0, 10) },

	-- Armurerie
	{ id = "pompe", name = "Fusil à pompe", price = 800, kind = "weapon", weapon = "Fusil à pompe", padPos = V(20, 0, -15), pos = V(-40, 0, -2) },
	{ id = "fusil", name = "Fusil d'assaut", price = 1500, requires = { "pompe" }, kind = "weapon", weapon = "Fusil d'assaut", padPos = V(30, 0, -15), pos = V(-30, 0, -2) },
	{ id = "sniper", name = "Sniper", price = 3000, requires = { "fusil" }, kind = "weapon", weapon = "Sniper", padPos = V(40, 0, -15), pos = V(-20, 0, -2) },
}

return Config
