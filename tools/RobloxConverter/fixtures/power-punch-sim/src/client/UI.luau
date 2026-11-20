-- UI.luau
-- Tiny declarative UI toolkit: an Instance factory, shared palette, styled
-- button factory, and a window manager (one window open at a time).
-- The whole interface is built from code -- no Studio-made GUIs.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local UI = {}

UI.Palette = {
	bg = Color3.fromRGB(34, 39, 54),
	panel = Color3.fromRGB(44, 51, 70),
	panelLight = Color3.fromRGB(58, 66, 89),
	accent = Color3.fromRGB(255, 176, 32),
	good = Color3.fromRGB(90, 210, 120),
	bad = Color3.fromRGB(235, 87, 87),
	locked = Color3.fromRGB(90, 97, 115),
	text = Color3.fromRGB(240, 243, 250),
	subtext = Color3.fromRGB(172, 180, 197),
}

function UI.create(className: string, props: { [string]: any }, children: { Instance }?): any
	local instance = Instance.new(className)
	for key, value in props do
		if key ~= "Parent" then
			instance[key] = value
		end
	end
	if children then
		for _, child in children do
			child.Parent = instance
		end
	end
	if props.Parent then
		instance.Parent = props.Parent
	end
	return instance
end

function UI.corner(radius: number): UICorner
	return UI.create("UICorner", { CornerRadius = UDim.new(0, radius) })
end

function UI.stroke(color: Color3, thickness: number?): UIStroke
	return UI.create("UIStroke", {
		Color = color,
		Thickness = thickness or 2,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	})
end

function UI.padding(px: number): UIPadding
	local pad = UDim.new(0, px)
	return UI.create("UIPadding", {
		PaddingTop = pad,
		PaddingBottom = pad,
		PaddingLeft = pad,
		PaddingRight = pad,
	})
end

-- Styled TextButton with a press-scale animation.
function UI.button(props: { [string]: any }): TextButton
	local color = props.Color or UI.Palette.accent
	local button = UI.create("TextButton", {
		Text = props.Text or "Button",
		Size = props.Size or UDim2.fromOffset(120, 44),
		Position = props.Position,
		AnchorPoint = props.AnchorPoint,
		LayoutOrder = props.LayoutOrder,
		BackgroundColor3 = color,
		TextColor3 = props.TextColor or Color3.fromRGB(30, 30, 30),
		Font = Enum.Font.FredokaOne,
		TextScaled = true,
		AutoButtonColor = true,
		Parent = props.Parent,
	}, {
		UI.corner(props.CornerRadius or 12),
		UI.stroke(Color3.new(0, 0, 0), 2),
		UI.create("UIScale", {}),
		UI.create("UITextSizeConstraint", { MaxTextSize = props.MaxTextSize or 22 }),
	})

	local scale = button:FindFirstChildOfClass("UIScale")
	button.MouseButton1Down:Connect(function()
		TweenService:Create(scale, TweenInfo.new(0.06), { Scale = 0.92 }):Play()
	end)
	button.MouseButton1Up:Connect(function()
		TweenService:Create(scale, TweenInfo.new(0.1), { Scale = 1 }):Play()
	end)
	button.MouseLeave:Connect(function()
		TweenService:Create(scale, TweenInfo.new(0.1), { Scale = 1 }):Play()
	end)

	return button
end

-- ============================== WINDOW MANAGER ==============================

local windowsGui: ScreenGui? = nil
local windows: { [string]: Frame } = {}

local function getWindowsGui(): ScreenGui
	if not windowsGui then
		windowsGui = UI.create("ScreenGui", {
			Name = "Windows",
			ResetOnSpawn = false,
			DisplayOrder = 10,
			Parent = Players.LocalPlayer:WaitForChild("PlayerGui"),
		})
	end
	return windowsGui
end

-- Creates a hidden, centered window and returns its content frame.
function UI.window(name: string, title: string, size: UDim2): Frame
	local frame = UI.create("Frame", {
		Name = name,
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = size,
		BackgroundColor3 = UI.Palette.panel,
		Visible = false,
		Parent = getWindowsGui(),
	}, {
		UI.corner(16),
		UI.stroke(UI.Palette.accent, 3),
		UI.create("TextLabel", {
			Name = "Title",
			Size = UDim2.new(1, -56, 0, 44),
			Position = UDim2.fromOffset(16, 4),
			BackgroundTransparency = 1,
			Text = title,
			TextColor3 = UI.Palette.text,
			Font = Enum.Font.FredokaOne,
			TextScaled = true,
			TextXAlignment = Enum.TextXAlignment.Left,
		}, {
			UI.create("UITextSizeConstraint", { MaxTextSize = 28 }),
		}),
	})

	local closeButton = UI.button({
		Text = "✕",
		Size = UDim2.fromOffset(36, 36),
		Position = UDim2.new(1, -44, 0, 8),
		Color = UI.Palette.bad,
		TextColor = UI.Palette.text,
		Parent = frame,
	})
	closeButton.Activated:Connect(function()
		frame.Visible = false
	end)

	local content = UI.create("Frame", {
		Name = "Content",
		Position = UDim2.fromOffset(12, 52),
		Size = UDim2.new(1, -24, 1, -64),
		BackgroundTransparency = 1,
		Parent = frame,
	})

	windows[name] = frame
	return content
end

function UI.toggleWindow(name: string)
	local target = windows[name]
	if not target then
		return
	end
	local wasVisible = target.Visible
	for _, frame in windows do
		frame.Visible = false
	end
	target.Visible = not wasVisible
end

return UI
