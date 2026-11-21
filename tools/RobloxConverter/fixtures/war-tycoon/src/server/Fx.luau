-- Effets visuels simples.
local Debris = game:GetService("Debris")
local Workspace = game:GetService("Workspace")

local Fx = {}

-- Trait lumineux d'un tir
function Fx.tracer(from: Vector3, to: Vector3)
	local dist = (to - from).Magnitude
	if dist < 0.5 then
		return
	end
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Material = Enum.Material.Neon
	p.Color = Color3.fromRGB(255, 230, 120)
	p.Size = Vector3.new(0.12, 0.12, dist)
	p.CFrame = CFrame.lookAt(from, to) * CFrame.new(0, 0, -dist / 2)
	p.Parent = Workspace
	Debris:AddItem(p, 0.07)
end

return Fx
