--!strict
-- Small helpers for building UI from code.

local Ui = {}

Ui.Theme = {
	Panel = Color3.fromRGB(24, 27, 36),
	PanelLight = Color3.fromRGB(40, 45, 58),
	Text = Color3.fromRGB(240, 242, 247),
	Muted = Color3.fromRGB(160, 166, 182),
	Accent = Color3.fromRGB(255, 196, 0),
	Danger = Color3.fromRGB(231, 76, 60),
	Ok = Color3.fromRGB(46, 204, 113),
}

-- Creates an instance, applies properties, and parents children. The
-- return is untyped; callers cast to the class they asked for.
function Ui.make(className: string, props: { [string]: any }, children: { Instance }?): any
	local instance = Instance.new(className :: any)
	for key, value in props do
		if key ~= "Parent" then
			(instance :: any)[key] = value
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

function Ui.corner(radius: number): UICorner
	return Ui.make("UICorner", { CornerRadius = UDim.new(0, radius) })
end

function Ui.padding(px: number): UIPadding
	return Ui.make("UIPadding", {
		PaddingTop = UDim.new(0, px),
		PaddingBottom = UDim.new(0, px),
		PaddingLeft = UDim.new(0, px),
		PaddingRight = UDim.new(0, px),
	})
end

function Ui.label(props: { [string]: any }): TextLabel
	local defaults: { [string]: any } = {
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBold,
		TextColor3 = Ui.Theme.Text,
		TextScaled = true,
	}
	for key, value in props do
		if key ~= "MaxTextSize" then
			defaults[key] = value
		end
	end
	local label = Ui.make("TextLabel", defaults) :: TextLabel
	Ui.make("UITextSizeConstraint", { MaxTextSize = props.MaxTextSize or 28, Parent = label })
	return label
end

function Ui.button(props: { [string]: any }): TextButton
	local defaults: { [string]: any } = {
		AutoButtonColor = true,
		BackgroundColor3 = Ui.Theme.PanelLight,
		Font = Enum.Font.GothamBold,
		TextColor3 = Ui.Theme.Text,
		TextScaled = true,
	}
	for key, value in props do
		if key ~= "MaxTextSize" then
			defaults[key] = value
		end
	end
	local button = Ui.make("TextButton", defaults) :: TextButton
	Ui.corner(8).Parent = button
	Ui.padding(6).Parent = button
	Ui.make("UITextSizeConstraint", { MaxTextSize = props.MaxTextSize or 20, Parent = button })
	return button
end

function Ui.rgb(rgb: { number }): Color3
	return Color3.fromRGB(rgb[1], rgb[2], rgb[3])
end

return Ui
