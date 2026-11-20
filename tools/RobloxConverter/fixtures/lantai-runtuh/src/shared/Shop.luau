--!strict
-- Trail catalog and the purchase rules. Shared so the client can render the
-- shop, but only the server's checks decide anything.

local Shop = {}

export type Trail = {
	id: string,
	name: string,
	price: number,
	colors: { { number } },
}

export type Wallet = {
	coins: number,
	ownedTrails: { [string]: boolean },
	equippedTrail: string?,
}

Shop.Trails = {
	{ id = "mint", name = "Mint", price = 50, colors = { { 152, 255, 200 }, { 64, 200, 160 } } },
	{ id = "ember", name = "Ember", price = 120, colors = { { 255, 196, 0 }, { 230, 60, 30 } } },
	{ id = "ocean", name = "Ocean", price = 200, colors = { { 120, 220, 255 }, { 20, 80, 200 } } },
	{ id = "sunset", name = "Sunset", price = 350, colors = { { 255, 120, 170 }, { 255, 170, 60 } } },
	{ id = "galaxy", name = "Galaxy", price = 600, colors = { { 40, 20, 110 }, { 200, 120, 255 } } },
	{
		id = "prism",
		name = "Prism",
		price = 1000,
		colors = { { 255, 80, 80 }, { 255, 220, 60 }, { 80, 220, 120 }, { 80, 160, 255 }, { 190, 100, 255 } },
	},
} :: { Trail }

local byId: { [string]: Trail } = {}
for _, trail in Shop.Trails do
	byId[trail.id] = trail
end

function Shop.find(id: string): Trail?
	return byId[id]
end

function Shop.canBuy(wallet: Wallet, id: string): (boolean, string?)
	local trail = byId[id]
	if not trail then
		return false, "Unknown item"
	end
	if wallet.ownedTrails[id] then
		return false, "Already owned"
	end
	if wallet.coins < trail.price then
		return false, "Not enough coins"
	end
	return true, nil
end

function Shop.buy(wallet: Wallet, id: string): (boolean, string?)
	local ok, reason = Shop.canBuy(wallet, id)
	if not ok then
		return false, reason
	end
	local trail = byId[id] :: Trail
	wallet.coins -= trail.price
	wallet.ownedTrails[id] = true
	return true, nil
end

-- id nil unequips.
function Shop.equip(wallet: Wallet, id: string?): (boolean, string?)
	if id ~= nil and not wallet.ownedTrails[id] then
		return false, "Not owned"
	end
	wallet.equippedTrail = id
	return true, nil
end

return Shop
