-- Monetization.luau
-- Gamepass ownership (cached per player, exposed as attributes for the UI)
-- and developer product receipt processing. All grants happen server-side.

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)

local Monetization = {}

local ownership = {} -- [Player] = { [passKey] = boolean }
local handledReceipts = {} -- [PurchaseId] = true, session-level dedupe
local Data

local function refreshPasses(player: Player)
	local owned = {}
	for key, passId in Config.GamePasses do
		local owns = false
		if passId ~= 0 then
			local ok, result = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(player.UserId, passId)
			end)
			owns = ok and result == true
		end
		owned[key] = owns
		player:SetAttribute("Owns" .. key, owns)
	end
	ownership[player] = owned
end

local function processReceipt(receiptInfo)
	if handledReceipts[receiptInfo.PurchaseId] then
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end

	local player = Players:GetPlayerByUserId(receiptInfo.PlayerId)
	if not player or not Data.get(player) then
		-- Player left or their data hasn't loaded; Roblox will retry later.
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	for _, product in Config.DevProducts do
		if product.id == receiptInfo.ProductId then
			Data.addCoins(player, product.coins)
			handledReceipts[receiptInfo.PurchaseId] = true
			local notify = ReplicatedStorage.Remotes:FindFirstChild("Notify")
			if notify then
				notify:FireClient(player, "success", `Purchased {product.label}!`)
			end
			return Enum.ProductPurchaseDecision.PurchaseGranted
		end
	end

	warn(`[Monetization] Receipt for unknown product id {receiptInfo.ProductId}`)
	return Enum.ProductPurchaseDecision.NotProcessedYet
end

-- ============================== PUBLIC API ==============================

function Monetization.ownsPass(player: Player, passKey: string): boolean
	local owned = ownership[player]
	return owned ~= nil and owned[passKey] == true
end

function Monetization.start(dataService)
	Data = dataService

	Players.PlayerAdded:Connect(function(player)
		task.spawn(refreshPasses, player)
	end)
	for _, player in Players:GetPlayers() do
		task.spawn(refreshPasses, player)
	end
	Players.PlayerRemoving:Connect(function(player)
		ownership[player] = nil
	end)

	-- Update the cache instantly when a pass is bought in-game.
	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
		if not purchased then
			return
		end
		for key, id in Config.GamePasses do
			if id == passId then
				local owned = ownership[player]
				if owned then
					owned[key] = true
				end
				player:SetAttribute("Owns" .. key, true)
				local notify = ReplicatedStorage.Remotes:FindFirstChild("Notify")
				if notify then
					notify:FireClient(player, "success", `{Config.GamePassInfo[key].title} unlocked!`)
				end
			end
		end
	end)

	MarketplaceService.ProcessReceipt = processReceipt
end

return Monetization
