--!strict
-- Coins and stats earned in one round.

local Rewards = {}

export type Rules = {
	PerWave: number,
	Participation: number,
	WinBonus: number,
}

export type Payout = {
	coins: number,
	won: boolean,
	wavesSurvived: number,
}

function Rewards.compute(
	rules: Rules,
	participants: { number },
	survived: { [number]: number },
	winners: { number }
): { [number]: Payout }
	local winnerSet: { [number]: boolean } = {}
	for _, userId in winners do
		winnerSet[userId] = true
	end

	local payouts: { [number]: Payout } = {}
	for _, userId in participants do
		local waves = survived[userId] or 0
		local won = winnerSet[userId] == true
		payouts[userId] = {
			coins = rules.Participation + waves * rules.PerWave + (if won then rules.WinBonus else 0),
			won = won,
			wavesSurvived = waves,
		}
	end
	return payouts
end

return Rewards
