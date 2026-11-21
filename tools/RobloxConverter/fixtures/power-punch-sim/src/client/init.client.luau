-- Client entry point: waits for the server's remotes, then boots every
-- controller. Windows (Shop, Rebirth) register themselves with the UI window
-- manager; the HUD's buttons toggle them by name.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

ReplicatedStorage:WaitForChild("Remotes")
ReplicatedStorage:WaitForChild("Shared")

local Effects = require(script.Effects)
local ShopUi = require(script.ShopUi)
local RebirthUi = require(script.RebirthUi)
local Hud = require(script.Hud)
local ZoneGates = require(script.ZoneGates)

Effects.start()
ShopUi.build()
RebirthUi.build()
Hud.start()
ZoneGates.start()
