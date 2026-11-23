#!/usr/bin/env node
// PlayHub PlayerBot — Headless Accelerated Simulation Runner (Zero DOM / Zero User Input)
// Supports both standalone research games:
//   - playerbot-last-light (마지막 불빛 · PlayerBot)
//   - playerbot-frontier-colony (변방의 기록 · PlayerBot)
// Runs completely headlessly with automatic game/choice selection at maximum CPU speed.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const LAST_LIGHT_WEB = path.join(REPO_ROOT, 'games', 'playerbot-last-light', 'Web');
const FRONTIER_WEB = path.join(REPO_ROOT, 'games', 'playerbot-frontier-colony', 'Web');

async function loadLastLightModules() {
  const Core = await import(pathToFileURL(path.join(LAST_LIGHT_WEB, 'engine.js')).href);
  const Field = await import(pathToFileURL(path.join(LAST_LIGHT_WEB, 'expedition.js')).href);
  const BotRuntime = await import(pathToFileURL(path.join(LAST_LIGHT_WEB, 'bot-runtime.js')).href);
  return { Core, Field, BotRuntime };
}

async function loadFrontierModules() {
  const Engine = await import(pathToFileURL(path.join(FRONTIER_WEB, 'engine.js')).href);
  const ColonyBot = await import(pathToFileURL(path.join(FRONTIER_WEB, 'colony-bot.js')).href);
  return { Engine, ColonyBot };
}

/**
 * Run 마지막 불빛 · PlayerBot headlessly without any user choices.
 * Automatically manages daytime shelter tasks, visitors, night planning,
 * night expedition scavenging + AI companion 2PC constraints, and day transitions.
 */
export async function runHeadlessLastLight({
  seed = 20261123,
  difficulty = 'standard',
  maxDays = 12,
  virtualSpeed = 20,
} = {}) {
  const { Core, Field, BotRuntime } = await loadLastLightModules();
  const startedAt = performance.now();

  const state = Core.createGame(Number(seed) >>> 0, { difficulty });
  state.paused = false;
  state.speed = Math.max(0.5, Math.min(20, Number(virtualSpeed) || 20));
  let expedition = null;

  const runtime = BotRuntime.createBotRuntime({
    getState: () => state,
    getExpedition: () => expedition,
  });
  runtime.setAutoPlayMode(true);

  let simulatedSeconds = 0;
  let nightsCompleted = 0;
  let visitorsHandled = 0;
  let maxIterations = 250_000;
  const stepSec = 0.25; // fixed logical step (250ms sim time)

  while (state.phase !== 'ended' && !state.ending && state.day <= maxDays && maxIterations-- > 0) {
    if (state.phase === 'day') {
      if (state.paused) state.paused = false;
      if (state.visitor) {
        if (runtime.handleAutoVisitor(state)) visitorsHandled += 1;
      }
      Core.tickDay(state, stepSec);
      runtime.step(stepSec, { speed: 1 });
      simulatedSeconds += stepSec;
    } else if (state.phase === 'planning') {
      const plan = runtime.buildAutoNightPlan(state);
      if (!plan) break;
      const began = Core.beginNight(state, plan);
      if (began.ok && plan.scavengerId && plan.locationId) {
        expedition = Field.createExpedition(began.context, state);
      } else {
        Core.finishNight(state, { bag: {}, events: [] });
        expedition = null;
        nightsCompleted += 1;
      }
    } else if (state.phase === 'expedition' && expedition) {
      // Sub-step expedition at 0.05s for exact movement/collision physics
      const subStep = 0.05;
      for (let i = 0; i < 4 && expedition && !expedition.done; i++) {
        Field.stepExpedition(expedition, subStep, {});
        runtime.step(subStep, { speed: 1 });
        simulatedSeconds += subStep;
      }
      if (expedition.done) {
        Core.finishNight(state, Field.expeditionResult(expedition));
        expedition = null;
        nightsCompleted += 1;
      }
    } else if (state.phase === 'report') {
      if (state.day >= maxDays) break;
      const nextRes = Core.nextDay(state);
      if (!nextRes?.ok) break;
    } else {
      break;
    }
  }

  const realElapsedMs = Math.max(1, Math.round((performance.now() - startedAt) * 100) / 100);
  const effectiveSpeedup = Math.round((simulatedSeconds * 1000) / realElapsedMs);
  const alive = state.characters.filter(c => c.alive);
  const debug = runtime.getDebugSnapshot();

  return {
    game: 'playerbot-last-light',
    title: '마지막 불빛 · PlayerBot',
    seed: Number(seed) >>> 0,
    difficulty,
    outcome: state.ending ? state.ending.kind || state.ending.id || 'ended' : (state.day >= maxDays && alive.length > 0 ? 'survived_target_days' : 'stopped'),
    days_survived: state.day,
    survivors_alive: alive.length,
    survivors_total: state.characters.length,
    nights_completed: nightsCompleted,
    visitors_handled: visitorsHandled,
    inventory: {
      meal: state.inventory.meal || 0,
      raw: state.inventory.raw || 0,
      water: state.inventory.water || 0,
      wood: state.inventory.wood || 0,
      parts: state.inventory.parts || 0,
      meds: state.inventory.meds || 0,
      bandage: state.inventory.bandage || 0,
    },
    clock: debug.clock,
    commit_stats: debug.stats,
    simulated_seconds: Math.round(simulatedSeconds),
    real_elapsed_ms: realElapsedMs,
    effective_speedup: effectiveSpeedup,
  };
}

/**
 * Run 변방의 기록 · PlayerBot headlessly without any user choices.
 * Automatically seals shelter, builds beds, researches electricity & communications,
 * builds power/beacon, handles raids & fires, and runs at maximum CPU speed.
 */
export async function runHeadlessFrontierColony({
  seed = 20261123,
  difficulty = 'standard',
  maxSimSeconds = 3600,
  virtualSpeed = 20,
} = {}) {
  const { Engine, ColonyBot } = await loadFrontierModules();
  const startedAt = performance.now();

  let speed = Math.max(0.5, Math.min(20, Number(virtualSpeed) || 20));
  const game = new Engine.ColonyGame({ seed: Number(seed) >>> 0, difficulty });
  const bot = ColonyBot.createColonyBotController({
    container: null,
    getGame: () => game,
    getSpeed: () => speed,
    setSpeed: v => { speed = v; },
    toast: null,
  });
  bot.setAutoPlayMode(true);

  let simulatedSeconds = 0;
  const stepSec = 0.2;
  const maxSteps = Math.ceil(maxSimSeconds / stepSec);

  for (let i = 0; i < maxSteps; i++) {
    if (game.state.victory || game.state.gameOver) break;
    game.update(stepSec);
    // Feed logical step at speed=1 because game.step already receives exact sim seconds
    const prevSpeed = speed;
    speed = 1;
    bot.step(stepSec);
    speed = prevSpeed;
    simulatedSeconds += stepSec;
  }

  const realElapsedMs = Math.max(1, Math.round((performance.now() - startedAt) * 100) / 100);
  const effectiveSpeedup = Math.round((simulatedSeconds * 1000) / realElapsedMs);
  const summary = game.getSummary();
  const alive = game.state.colonists.filter(c => !c.dead);
  const debug = bot.getDebugSnapshot?.() || { clock: { game_sim_ms: Math.round(simulatedSeconds * 1000) }, stats: {} };

  return {
    game: 'playerbot-frontier-colony',
    title: '변방의 기록 · PlayerBot',
    seed: Number(seed) >>> 0,
    difficulty,
    outcome: game.state.victory ? 'victory' : (game.state.gameOver ? 'defeat' : 'simulated_limit_reached'),
    days_survived: summary.day || 1,
    survivors_alive: alive.length,
    survivors_total: game.state.colonists.length,
    indoor_beds: summary.indoorBeds || 0,
    research_unlocked: [...(game.state.research?.unlocked || [])],
    research_active: game.state.research?.active || null,
    resources: {
      wood: game.state.resources.wood || 0,
      steel: game.state.resources.steel || 0,
      meals: game.state.resources.meals || 0,
      rawfood: game.state.resources.rawfood || 0,
      medicine: game.state.resources.medicine || 0,
    },
    clock: debug.clock,
    commit_stats: debug.stats,
    simulated_seconds: Math.round(simulatedSeconds),
    real_elapsed_ms: realElapsedMs,
    effective_speedup: effectiveSpeedup,
  };
}

/**
 * Run one or both research games headlessly with auto-selection.
 * game = 'auto' | 'all' | 'playerbot-last-light' | 'playerbot-frontier-colony'
 */
export async function runHeadlessBatch({
  game = 'auto',
  runs = 1,
  seed = 20261123,
  difficulty = 'standard',
  maxDays = 12,
  maxSimSeconds = 1800,
} = {}) {
  const safeRuns = Math.max(1, Math.min(10, Number(runs) || 1));
  const baseSeed = Number(seed) || 20261123;
  const normalizedGame = String(game || 'auto').toLowerCase();

  let targets;
  if (normalizedGame === 'playerbot-last-light' || normalizedGame === 'last-light') {
    targets = ['playerbot-last-light'];
  } else if (normalizedGame === 'playerbot-frontier-colony' || normalizedGame === 'frontier-colony') {
    targets = ['playerbot-frontier-colony'];
  } else {
    // 'auto' or 'all': automatically run both standalone research games with zero user selection
    targets = ['playerbot-last-light', 'playerbot-frontier-colony'];
  }

  const startedAt = performance.now();
  const results = [];
  for (const target of targets) {
    for (let r = 0; r < safeRuns; r++) {
      const runSeed = (baseSeed + r * 997) >>> 0;
      if (target === 'playerbot-last-light') {
        results.push(await runHeadlessLastLight({ seed: runSeed, difficulty, maxDays }));
      } else {
        results.push(await runHeadlessFrontierColony({ seed: runSeed, difficulty, maxSimSeconds }));
      }
    }
  }

  const totalRealMs = Math.max(1, Math.round((performance.now() - startedAt) * 100) / 100);
  const totalSimSeconds = results.reduce((sum, item) => sum + (item.simulated_seconds || 0), 0);

  return {
    ok: true,
    mode: 'headless-auto',
    selected_games: targets,
    runs_per_game: safeRuns,
    total_runs: results.length,
    total_simulated_seconds: totalSimSeconds,
    total_real_elapsed_ms: totalRealMs,
    aggregate_speedup: Math.round((totalSimSeconds * 1000) / totalRealMs),
    results,
  };
}

// CLI execution
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const getArg = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
  };
  const game = getArg('--game', 'auto');
  const runs = Number(getArg('--runs', '1'));
  const seed = Number(getArg('--seed', '20261123'));
  const maxDays = Number(getArg('--days', '12'));
  const maxSimSeconds = Number(getArg('--sim-seconds', '1800'));
  const asJson = args.includes('--json');

  const summary = await runHeadlessBatch({ game, runs, seed, maxDays, maxSimSeconds });
  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\n=== PlayerBot Headless 가속 시뮬레이션 (${summary.selected_games.join(', ')}) ===`);
    for (const r of summary.results) {
      console.log(`- [${r.title}] seed=${r.seed} | 결과=${r.outcome} | 생존=${r.days_survived}일 (${r.survivors_alive}/${r.survivors_total}명) | 시뮬=${r.simulated_seconds}s / 실소요=${r.real_elapsed_ms}ms (${r.effective_speedup}×)`);
    }
    console.log(`총합: ${summary.total_runs}회 | 시뮬=${summary.total_simulated_seconds}s | 실소요=${summary.total_real_elapsed_ms}ms | 평균 가속=${summary.aggregate_speedup}×\n`);
  }
}
