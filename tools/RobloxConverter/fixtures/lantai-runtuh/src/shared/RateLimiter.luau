--!strict
-- Token bucket per key, for throttling remote calls from clients.

local RateLimiter = {}
RateLimiter.__index = RateLimiter

type Bucket = { tokens: number, at: number }

type State = {
	rate: number,
	burst: number,
	now: () -> number,
	buckets: { [any]: Bucket },
}

export type RateLimiter = typeof(setmetatable({} :: State, RateLimiter))

function RateLimiter.new(rate: number, burst: number, now: () -> number): RateLimiter
	assert(rate > 0 and burst >= 1, "invalid limits")
	return setmetatable({ rate = rate, burst = burst, now = now, buckets = {} }, RateLimiter)
end

function RateLimiter.allow(self: RateLimiter, key: any): boolean
	local t = self.now()
	local bucket = self.buckets[key]
	if not bucket then
		bucket = { tokens = self.burst, at = t }
		self.buckets[key] = bucket
	end
	bucket.tokens = math.min(self.burst, bucket.tokens + (t - bucket.at) * self.rate)
	bucket.at = t
	if bucket.tokens < 1 then
		return false
	end
	bucket.tokens -= 1
	return true
end

function RateLimiter.forget(self: RateLimiter, key: any)
	self.buckets[key] = nil
end

return RateLimiter
