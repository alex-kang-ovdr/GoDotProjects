-- ZoneGates.luau
-- Gate walls are real (collidable) parts from the server. Unlocking is purely
-- client-side and cosmetic: your character's physics runs locally, so setting
-- CanCollide locally lets only YOU walk through. The actual zone bonus is
-- validated on the server, so sneaking past a gate gains nothing.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local ZoneGates = {}

local player = Players.LocalPlayer

local UNLOCKED_COLOR = Color3.fromRGB(90, 210, 120)
local LOCKED_COLOR = Color3.fromRGB(235, 87, 87)
local VIP_COLOR = Color3.fromRGB(255, 215, 0)

local function setGateState(gate: BasePart, unlocked: boolean)
	gate.CanCollide = not unlocked
	local isVip = gate:GetAttribute("VipOnly") == true
	local goalColor = if unlocked then UNLOCKED_COLOR elseif isVip then VIP_COLOR else LOCKED_COLOR
	TweenService:Create(gate, TweenInfo.new(0.5), {
		Transparency = unlocked and 0.9 or 0.2,
		Color = goalColor,
	}):Play()

	local gui = gate:FindFirstChildWhichIsA("BillboardGui")
	local label = gui and gui:FindFirstChildWhichIsA("TextLabel")
	if label and unlocked then
		label.Text = `✅ {gate:GetAttribute("ZoneName")}`
	end
end

function ZoneGates.start()
	local gatesFolder = workspace:WaitForChild("ZoneGates")
	local power = player:WaitForChild("leaderstats"):WaitForChild("Power")

	local gateStates = {} -- [gate] = currently unlocked?

	local function evaluate()
		for _, gate in gatesFolder:GetChildren() do
			local unlocked
			if gate:GetAttribute("VipOnly") == true then
				unlocked = player:GetAttribute("OwnsVIP") == true
			else
				unlocked = power.Value >= (gate:GetAttribute("PowerRequired") or 0)
			end
			if gateStates[gate] ~= unlocked then
				gateStates[gate] = unlocked
				setGateState(gate, unlocked)
			end
		end
	end

	power.Changed:Connect(evaluate)
	player:GetAttributeChangedSignal("OwnsVIP"):Connect(evaluate)
	gatesFolder.ChildAdded:Connect(function()
		task.defer(evaluate)
	end)
	evaluate()
end

return ZoneGates
