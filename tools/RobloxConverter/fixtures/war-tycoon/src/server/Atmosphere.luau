-- Ambiance : lumière de fin d'après-midi, brume légère, couleurs plus vives.
local Lighting = game:GetService("Lighting")

local Atmosphere = {}

local function replace(className: string, props: { [string]: any })
	local old = Lighting:FindFirstChildOfClass(className)
	if old then
		old:Destroy()
	end
	local inst = Instance.new(className)
	for k, v in props do
		(inst :: any)[k] = v
	end
	inst.Parent = Lighting
end

function Atmosphere.apply()
	Lighting.ClockTime = 16.3
	Lighting.Brightness = 3
	Lighting.Ambient = Color3.fromRGB(70, 76, 92)
	Lighting.OutdoorAmbient = Color3.fromRGB(115, 120, 132)
	Lighting.ColorShift_Top = Color3.fromRGB(255, 225, 180)
	Lighting.EnvironmentDiffuseScale = 1
	Lighting.EnvironmentSpecularScale = 1
	Lighting.GlobalShadows = true
	Lighting.ShadowSoftness = 0.25

	replace("Atmosphere", {
		Density = 0.3,
		Offset = 0.25,
		Color = Color3.fromRGB(205, 180, 150),
		Decay = Color3.fromRGB(110, 118, 135),
		Glare = 0.35,
		Haze = 1.4,
	})
	replace("ColorCorrectionEffect", {
		Contrast = 0.12,
		Saturation = 0.18,
		TintColor = Color3.fromRGB(255, 246, 232),
	})
	replace("BloomEffect", {
		Intensity = 0.4,
		Size = 24,
		Threshold = 1.4,
	})
	replace("SunRaysEffect", {
		Intensity = 0.1,
		Spread = 0.8,
	})
end

return Atmosphere
