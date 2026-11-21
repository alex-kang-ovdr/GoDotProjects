--!strict
-- Handles shop requests from clients. Treats every argument as hostile:
-- types are checked, calls are rate limited, and prices come from the
-- server's catalog, never from the client.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local RateLimiter = require(ReplicatedStorage.Shared.RateLimiter)
local Shop = require(ReplicatedStorage.Shared.Shop)

local Profiles = require(script.Parent.Profiles)

local ShopRequest = ReplicatedStorage.Remotes.ShopRequest :: RemoteFunction

local ShopService = {}

export type Response = { ok: boolean, message: string? }

local limiter = RateLimiter.new(Config.Shop.RequestsPerSecond, Config.Shop.Burst, os.clock)

local function handle(player: Player, action: unknown, itemId: unknown): Response
	if not limiter:allow(player) then
		return { ok = false, message = "Slow down" }
	end
	if type(action) ~= "string" then
		return { ok = false, message = "Bad request" }
	end
	if itemId ~= nil and (type(itemId) ~= "string" or #itemId > 32) then
		return { ok = false, message = "Bad request" }
	end
	if not Profiles.isLoaded(player) then
		return { ok = false, message = "Still loading your data" }
	end

	local id = itemId :: string?
	local ok, reason = false, "Unknown action" :: string?
	if action == "buy" and id then
		Profiles.mutate(player, function(data)
			ok, reason = Shop.buy(data, id)
		end)
	elseif action == "equip" then
		Profiles.mutate(player, function(data)
			ok, reason = Shop.equip(data, id)
		end)
	end
	return { ok = ok, message = reason }
end

function ShopService.start()
	ShopRequest.OnServerInvoke = function(player: Player, action: unknown, itemId: unknown): Response
		return handle(player, action, itemId)
	end
	Players.PlayerRemoving:Connect(function(player)
		limiter:forget(player)
	end)
end

return ShopService
