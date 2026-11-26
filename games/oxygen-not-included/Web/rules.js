import { GAS_KG_PER_UNIT } from './environment.js';

export const MODERN_RULES = 'oni-4.3';
export const ORIGINAL_RULES = 'oni-base';
export const LEGACY_RULES = 'breath-4.1';

export function usesOriginalRates(ruleset) { return ruleset === ORIGINAL_RULES || ruleset === MODERN_RULES; }

export function cycleSecondsFor(ruleset) {
  return usesOriginalRates(ruleset) ? 600 : 120;
}

export function breathingUnitsPerSecond(ruleset) {
  return usesOriginalRates(ruleset) ? 0.1 / GAS_KG_PER_UNIT : 0.055;
}

// Negative wattages denote producers throughout the existing power network.
export const ORIGINAL_POWER = Object.freeze({
  diffuser:120, electrolyzer:120, pump:240, generator:-400, coalgen:-600, hydrogenGen:-800
});

export const BATTERY_LEAK_J_PER_S = 1000/600;

export const MEALWOOD = Object.freeze({
  growthSeconds:1800, dirtKgPerCycle:10, harvestKcal:600, minC:10, maxC:30, minGasKg:0.15
});
