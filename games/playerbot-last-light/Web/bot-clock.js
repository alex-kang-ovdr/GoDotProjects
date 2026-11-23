// Last Light PlayerBot — Triple Clock Contract (Research §3.2 R04)
// Strictly separates:
//  1. game_sim_ms   : authoritative simulation clock (respects pause & speed)
//  2. mono_proc_ms  : monotonic process clock (HTTP/LLM timeouts & latency measurement)
//  3. utc_server_ms : wall-clock UTC epoch ms (cooldowns, daily budgets, audit logs)

const finite = (value, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const clampSpeed = value => (typeof value === 'number' && Number.isFinite(value) ? Math.min(20, Math.max(0.5, value)) : 1);

export function createTripleClock(options = {}) {
  const monoNow = typeof options.monoNow === 'function'
    ? options.monoNow
    : () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
  const utcNow = typeof options.utcNow === 'function'
    ? options.utcNow
    : () => Date.now();
  return {
    game_sim_ms: Math.max(0, Math.floor(finite(options.game_sim_ms, 0))),
    sim_ticks: Math.max(0, Math.floor(finite(options.sim_ticks, 0))),
    paused: Boolean(options.paused),
    speed: clampSpeed(options.speed),
    _monoNow: monoNow,
    _utcNow: utcNow,
  };
}

export function advanceSimClock(clock, deltaSeconds, options = {}) {
  if (!clock) return 0;
  const paused = options.paused !== undefined ? Boolean(options.paused) : clock.paused;
  const speed = options.speed !== undefined ? clampSpeed(options.speed) : clampSpeed(clock.speed);
  clock.paused = paused;
  clock.speed = speed;
  if (paused || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
  const clamped = Math.min(deltaSeconds, 10);
  const deltaMs = Math.round(clamped * 1000 * speed);
  if (deltaMs <= 0) return 0;
  clock.game_sim_ms += deltaMs;
  clock.sim_ticks += 1;
  return deltaMs;
}

export function readTripleClock(clock) {
  const mono = clock?._monoNow ? clock._monoNow() : Date.now();
  const utc = clock?._utcNow ? clock._utcNow() : Date.now();
  return {
    game_sim_ms: Math.max(0, Math.floor(finite(clock?.game_sim_ms, 0))),
    mono_proc_ms: Math.round(finite(mono, 0) * 1000) / 1000,
    utc_server_ms: Math.floor(finite(utc, Date.now())),
    paused: Boolean(clock?.paused),
    speed: clampSpeed(clock?.speed),
  };
}

export function serializeClock(clock) {
  return {
    game_sim_ms: Math.max(0, Math.floor(finite(clock?.game_sim_ms, 0))),
    sim_ticks: Math.max(0, Math.floor(finite(clock?.sim_ticks, 0))),
  };
}

export function restoreClock(data, options = {}) {
  return createTripleClock({
    ...options,
    game_sim_ms: data?.game_sim_ms ?? 0,
    sim_ticks: data?.sim_ticks ?? 0,
  });
}
