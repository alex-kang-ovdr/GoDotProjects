-- Interface (argent, aide, messages) et tir à la souris.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")

local Config = require(ReplicatedStorage.Shared.Config)

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local mouse = player:GetMouse()

local shootEvent = ReplicatedStorage:WaitForChild("Shoot") :: RemoteEvent
local notifyEvent = ReplicatedStorage:WaitForChild("Notify") :: RemoteEvent
local cash = player:WaitForChild("leaderstats"):WaitForChild("Argent") :: IntValue

---------------------------------------------------------------------
-- Interface
---------------------------------------------------------------------
local gui = Instance.new("ScreenGui")
gui.Name = "TycoonHUD"
gui.ResetOnSpawn = false
gui.Parent = playerGui

local function makeLabel(size: UDim2, position: UDim2, anchor: Vector2, textSize: number): TextLabel
	local l = Instance.new("TextLabel")
	l.Size = size
	l.Position = position
	l.AnchorPoint = anchor
	l.BackgroundColor3 = Color3.fromRGB(20, 20, 30)
	l.BackgroundTransparency = 0.35
	l.TextColor3 = Color3.new(1, 1, 1)
	l.Font = Enum.Font.GothamBold
	l.TextSize = textSize
	l.Parent = gui
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 12)
	corner.Parent = l
	local stroke = Instance.new("UIStroke")
	stroke.Color = Color3.fromRGB(255, 255, 255)
	stroke.Transparency = 0.75
	stroke.Thickness = 1.5
	stroke.Parent = l
	return l
end

local cashLabel = makeLabel(UDim2.fromOffset(220, 48), UDim2.new(0, 16, 1, -16), Vector2.new(0, 1), 26)
cashLabel.TextColor3 = Color3.fromRGB(120, 255, 140)

local hint = makeLabel(UDim2.fromOffset(680, 40), UDim2.new(0.5, 0, 0, 12), Vector2.new(0.5, 0), 18)
hint.Text = "Marche sur une plateforme verte « RÉCLAMER » pour prendre une base"

local toast = makeLabel(UDim2.fromOffset(460, 46), UDim2.new(0.5, 0, 0, 62), Vector2.new(0.5, 0), 20)
toast.Visible = false

local function format(n: number): string
	local s = tostring(math.floor(n))
	local reversed = s:reverse():gsub("(%d%d%d)", "%1,")
	local result = reversed:reverse():gsub("^,", "")
	return result
end

local function refreshCash()
	cashLabel.Text = "$ " .. format(cash.Value)
end
cash:GetPropertyChangedSignal("Value"):Connect(refreshCash)
refreshCash()

local function refreshHint()
	hint.Visible = not player:GetAttribute("HasBase")
end
player:GetAttributeChangedSignal("HasBase"):Connect(refreshHint)
refreshHint()

local toastId = 0
notifyEvent.OnClientEvent:Connect(function(text: string)
	toastId += 1
	local id = toastId
	toast.Text = text
	toast.Visible = true
	task.delay(3.5, function()
		if id == toastId then
			toast.Visible = false
		end
	end)
end)

---------------------------------------------------------------------
-- Tir : clic maintenu avec une arme en main
---------------------------------------------------------------------
local held = false
local lastFire = 0

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then
		return
	end
	if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
		held = true
	end
end)

UserInputService.InputEnded:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
		held = false
	end
end)

RunService.RenderStepped:Connect(function()
	if not held then
		return
	end
	local character = player.Character
	local tool = character and character:FindFirstChildOfClass("Tool")
	local def = tool and Config.Weapons[tool:GetAttribute("Weapon")]
	if def and os.clock() - lastFire >= def.cooldown then
		lastFire = os.clock()
		shootEvent:FireServer(mouse.Hit.Position)
	end
end)
