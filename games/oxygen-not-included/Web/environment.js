import { ELEMENTS } from './elements.js';
import { atmosphereOf, atmosphereSpaceKg, stepAtmosphere, canBreatheAtmosphere } from './atmosphere.js';

// Historical saves use 12 kg per full water cell. Fresh worlds use Water.maxMass from liquid.yaml.
// The legacy mass table below preserves the 120-second colony's thermal behavior.
export const WATER_PER_CELL = 12;
export const ORIGINAL_WATER_PER_CELL = 1000;
// Retains the established 0.30 units/s display at 0.18 kg/s water input.
export const GAS_KG_PER_UNIT = 0.5328;

export function oxygenOutletSpace(cell, originalRules = false, modernRules=false, game=null) {
  if(modernRules)return atmosphereSpaceKg(game,cell,'oxygen')/GAS_KG_PER_UNIT;
  if (originalRules) return Math.max(0, (1.8 - (cell.steam || 0) - (cell.hydrogen || 0)) / GAS_KG_PER_UNIT - cell.oxygen - cell.co2);
  return Math.max(0, Math.min(3 - cell.oxygen, 2.5 - cell.oxygen - cell.co2 - (cell.steam || 0) / GAS_KG_PER_UNIT));
}

export function canBreathe(cell, modernRules=false) {
  if(modernRules)return canBreatheAtmosphere(cell);
  if (!cell || cell.solid || cell.water >= 0.7 || cell.oxygen <= 0.16) return false;
  const gas = cell.oxygen + cell.co2 + ((cell.steam || 0) + (cell.hydrogen || 0)) / GAS_KG_PER_UNIT;
  return cell.oxygen >= gas * 0.16;
}
const SOLIDS = {rock:'IgneousRock', dirt:'Dirt', copper:'Cuprite', algae:'Algae',
  coal:'Carbon', ice:'Ice', bedrock:'Granite', abyssalite:'Katairite', tile:'SandStone'};
const SOLID_MASS = {rock:24, dirt:16, copper:24, algae:12, coal:16, ice:12, bedrock:36, abyssalite:24, tile:8};
// Natural terrain uses the installed elements' defaultMass in kg.
// Constructed floors use the amount of rock paid by this game's blueprint.
export const NATURAL_MASS_KG = Object.freeze({
  rock:1840, dirt:1840, copper:800, algae:200, coal:600, ice:1000, abyssalite:500, bedrock:1840
});
const ORIGINAL_SOLID_MASS = {...NATURAL_MASS_KG, tile:3};
const PHASE_BAND = 1; // Web hysteresis in degrees C around each installed transition.
const water = ELEMENTS.Water, ice = ELEMENTS.Ice, steam = ELEMENTS.Steam;
const gasO2 = ELEMENTS.Oxygen, gasCO2 = ELEMENTS.CarbonDioxide;

export function materialFor(cell) {
  if (cell.solid) return ELEMENTS[SOLIDS[cell.solid]];
  if (cell.frost > 0 && cell.frost >= cell.water) return ice;
  if (cell.water > 0.01) return water;
  if ((cell.hydrogen || 0) > Math.max(cell.steam || 0, GAS_KG_PER_UNIT * Math.max(cell.oxygen, cell.co2))) return ELEMENTS.Hydrogen;
  if (cell.steam > GAS_KG_PER_UNIT * Math.max(cell.oxygen, cell.co2)) return steam;
  return cell.oxygen >= cell.co2 ? gasO2 : gasCO2;
}

export function conductivity(c) {
  if (!c.solid && !c.water && !c.frost && !c.steam && !c.hydrogen && !c.oxygen && !c.co2) return 0;
  return materialFor(c).thermalConductivity * (c.insulated ? 0.01 : 1);
}

function heatCapacity(c, waterKgPerCell, solidMass = SOLID_MASS, modernRules=false) {
  if (c.solid) return solidMass[c.solid] * materialFor(c).specificHeatCapacity;
  // Background capacity keeps a nearly evacuated cell numerically stable.
  if(modernRules){const state=atmosphereOf(c),field=state?.element==='co2'?'CarbonDioxide':state?.element==='hydrogen'?'Hydrogen':state?.element==='steam'?'Steam':'Oxygen';return 0.05+(state?.massKg||0)*ELEMENTS[field].specificHeatCapacity+c.water*waterKgPerCell*water.specificHeatCapacity+(c.frost||0)*waterKgPerCell*ice.specificHeatCapacity;}
  return 0.05 + GAS_KG_PER_UNIT * (c.oxygen * gasO2.specificHeatCapacity + c.co2 * gasCO2.specificHeatCapacity)
    + (c.hydrogen || 0) * ELEMENTS.Hydrogen.specificHeatCapacity
    + c.water * waterKgPerCell * water.specificHeatCapacity
    + (c.frost || 0) * waterKgPerCell * ice.specificHeatCapacity + (c.steam || 0) * steam.specificHeatCapacity;
}

const heatPerUnit = {oxygen:GAS_KG_PER_UNIT * gasO2.specificHeatCapacity, co2:GAS_KG_PER_UNIT * gasCO2.specificHeatCapacity,
  hydrogen:ELEMENTS.Hydrogen.specificHeatCapacity, water:WATER_PER_CELL * water.specificHeatCapacity, steam:steam.specificHeatCapacity,
  frost:WATER_PER_CELL * ice.specificHeatCapacity};

// Pipe packets carry kilograms, while room oxygen and CO2 retain the save format's units.
export function addGasKg(cell, field, kg, temperature, waterKgPerCell = WATER_PER_CELL) {
  if (kg <= 0) return;
  const units = field === 'oxygen' || field === 'co2' ? kg / GAS_KG_PER_UNIT : kg;
  const incoming = units * heatPerUnit[field];
  cell.temp += (temperature - cell.temp) * incoming / (heatCapacity(cell, waterKgPerCell) + incoming);
  cell[field] = (cell[field] || 0) + units;
}

export function addWarmOxygen(cell, units, minTempC, waterKgPerCell = WATER_PER_CELL) {
  if (units <= 0) return;
  addGasKg(cell, 'oxygen', units * GAS_KG_PER_UNIT, Math.max(cell.temp, minTempC), waterKgPerCell);
}

function move(from, to, field, amount, waterKgPerCell, modernRules=false) {
  if (amount <= 0) return;
  const wasEmpty=field==='water'&&to.water<=1e-12;
  const sourceLiquid=from.liquidElement==='dirtyWater'?'dirtyWater':'water';
  if(modernRules&&field==='water'){
    if(atmosphereOf(to))return;
    const targetLiquid=to.liquidElement==='dirtyWater'?'dirtyWater':'water';
    if(to.water>1e-12&&targetLiquid!==sourceLiquid)return;
    if(to.frost>1e-12&&to.liquidElement==='dirtyWater'&&sourceLiquid!=='dirtyWater')return;
  }
  const incoming = amount * (field === 'water' ? waterKgPerCell * water.specificHeatCapacity : heatPerUnit[field]);
  to.temp += (from.temp - to.temp) * incoming / (heatCapacity(to, waterKgPerCell) + incoming);
  from[field] -= amount;
  to[field] = (to[field] || 0) + amount;
  if(modernRules&&field==='water'){
    if(wasEmpty&&sourceLiquid==='dirtyWater')to.liquidElement='dirtyWater';
    else if(wasEmpty&&sourceLiquid==='water')delete to.liquidElement;
    if(from.water<=1e-12&&!from.frost)delete from.liquidElement;
  }
}

function exchangeGas(a, b, field, diff, limit, waterKgPerCell) {
  if (diff < 0) move(b, a, field, Math.min(-diff, b[field], Math.max(0, limit - (a[field] || 0))), waterKgPerCell);
  if (diff > 0) move(a, b, field, Math.min(diff, a[field], Math.max(0, limit - (b[field] || 0))), waterKgPerCell);
}

function exchangePair(a, b, vertical, permeable, dt, gasLimit, waterKgPerCell, solidMass, modernRules=false) {
  const delta = a.temp - b.temp;
  if (Math.abs(delta) > 0.000001) {
    const ka = conductivity(a), kb = conductivity(b);
    const ca = heatCapacity(a, waterKgPerCell, solidMass,modernRules), cb = heatCapacity(b, waterKgPerCell, solidMass,modernRules);
    // Limit to thermal equilibrium for this pair, even for a nearly empty cell.
    const energy = delta * Math.min(dt * 2 * ka * kb / (ka + kb || 1), ca * cb / (ca + cb));
    a.temp -= energy / ca;
    b.temp += energy / cb;
  }
  if (!permeable || a.solid || b.solid || modernRules) return;
  exchangeGas(a, b, 'oxygen', (a.oxygen - b.oxygen) * dt * 0.32, gasLimit, waterKgPerCell);
  exchangeGas(a, b, 'co2', ((a.co2 - b.co2) * 0.30 + (vertical ? a.co2 * 0.06 : 0)) * dt, gasLimit, waterKgPerCell);
  if (a.hydrogen || b.hydrogen) {
    const top = a.hydrogen || 0, bottom = b.hydrogen || 0;
    const flow = ((top - bottom) * 0.28 - (vertical ? bottom * 0.75 : 0)) * dt;
    exchangeGas(a, b, 'hydrogen', flow, 10, waterKgPerCell);
  }
  if (a.steam || b.steam) {
    const top = a.steam || 0, bottom = b.steam || 0;
    exchangeGas(a, b, 'steam', ((top - bottom) * 0.32 - (vertical ? bottom * 0.09 : 0)) * dt, waterKgPerCell, waterKgPerCell);
  }
}

function changeWaterPhase(c, waterKgPerCell) {
  if (c.solid) return;
  if (c.water > 0 && c.temp < water.lowTempC - PHASE_BAND) {
    c.frost = (c.frost || 0) + c.water;
    c.water = 0;
  } else if (c.frost > 0 && c.temp > ice.highTempC + PHASE_BAND) {
    c.water += c.frost;
    c.frost = 0;
  }
  if (c.water > 0 && c.temp > water.highTempC + PHASE_BAND) {
    const amount = Math.min(c.water * waterKgPerCell, waterKgPerCell - (c.steam || 0));
    c.steam = (c.steam || 0) + amount;
    c.water = Math.max(0, c.water - amount / waterKgPerCell);
  } else if (c.steam > 0 && c.temp < steam.lowTempC - PHASE_BAND) {
    const amount = Math.min(c.steam, waterKgPerCell * liquidSpace(c));
    c.water += amount / waterKgPerCell;
    c.steam -= amount;
  }
}

function liquidSpace(cell) {
  return Math.max(0, 1 - cell.water - (cell.frost || 0));
}

export function stepEnvironment(game, dt, cycleSeconds) {
  const {w, h, cells} = game;
  const gasLimit = game.originalRules ? 10 : 3;
  const waterKgPerCell = game.waterKgPerCell ?? WATER_PER_CELL;
  const solidMass = game.originalRules ? ORIGINAL_SOLID_MASS : SOLID_MASS;
  const modernRules=!!game.modernRules;
  const sealed = game._doorMap;
  const blocked = i => sealed?.has(i) && !sealed.get(i).doorOpen;
  // Alternate edge order to avoid a persistent preferred direction on level ground.
  const reverse = Math.floor(game.time * 5 + 0.5) % 2 === 1;
  for (let n = 0; n < cells.length; ++n) {
    const i = reverse ? cells.length - 1 - n : n;
    const a = cells[i];
    if (i % w + 1 < w) exchangePair(a, cells[i + 1], false, !blocked(i) && !blocked(i + 1), dt, gasLimit, waterKgPerCell, solidMass,modernRules);
    if (i + w < cells.length) exchangePair(a, cells[i + w], true, !blocked(i) && !blocked(i + w), dt, gasLimit, waterKgPerCell, solidMass,modernRules);
  }
  if(modernRules)stepAtmosphere(game,dt,cycleSeconds);
  for (const c of cells) {
    if (!modernRules&&c.steamVent && !c.solid && game.time % cycleSeconds < 36) {
      const mass = Math.min(dt * 0.2, Math.max(0, 2.5 - (c.steam || 0)));
      if (mass > 0) {
        const incomingHeatCapacity = mass * steam.specificHeatCapacity;
        c.temp += (165 - c.temp) * incomingHeatCapacity / (heatCapacity(c, waterKgPerCell) + incomingHeatCapacity);
        c.steam = (c.steam || 0) + mass;
        c.ventOutput += mass;
      }
    }
    if(!modernRules)changeWaterPhase(c, waterKgPerCell);
  }
  for (let y = h - 2; y > 0; --y) {
    for (let x = 1; x < w - 1; ++x) {
      const i = y * w + x, a = cells[i];
      if (a.solid || !a.water || blocked(i)) continue;
      const below = cells[i + w];
      if (!below.solid && !blocked(i + w)) move(a, below, 'water', Math.min(a.water, liquidSpace(below), 2 * dt), waterKgPerCell,modernRules);
      for (const offset of reverse ? [1, -1] : [-1, 1]) {
        const b = cells[i + offset];
        const unlike=modernRules&&a.water>0&&b.water>0&&(a.liquidElement==='dirtyWater')!==(b.liquidElement==='dirtyWater');
        if (!b.solid && !blocked(i + offset) && !unlike && a.water > b.water + 0.02) {
          move(a, b, 'water', Math.min((a.water - b.water) / 2, liquidSpace(b), 0.25 * dt), waterKgPerCell,modernRules);
        }
      }
    }
  }
}

// Plan the whole displacement first. A sealed pocket keeps the paid blueprint pending.
export function displaceForTile(game, x, y, apply = true) {
  const source = game.cell(x, y), moves = [];
  const neighbors = [[0,1], [-1,0], [1,0], [0,-1]].map(([dx,dy]) => {
    const c = game.cell(x + dx, y + dy);
    return c && !c.solid && !game._doorBlocksFluid(x + dx, y + dy) ? c : null;
  }).filter(Boolean);
  if (source.frost > 0) return false;
  const modernRules=!!game.modernRules;
  const gasLimit = modernRules?10/GAS_KG_PER_UNIT:game.originalRules ? 10 : 3;
  const waterKgPerCell = game.waterKgPerCell ?? WATER_PER_CELL;
  for (const [field, cap] of [['water',1], ['oxygen',gasLimit], ['co2',gasLimit], ['steam',waterKgPerCell], ['hydrogen',10]]) {
    let left = source[field] || 0;
    for (const c of neighbors) {
      if(modernRules&&field==='water'&&(atmosphereOf(c)||(c.water>1e-12&&(c.liquidElement==='dirtyWater')!==(source.liquidElement==='dirtyWater'))||(c.frost>1e-12&&c.liquidElement==='dirtyWater'&&source.liquidElement!=='dirtyWater')))continue;
      if(modernRules&&['oxygen','co2','steam','hydrogen'].includes(field)&&(c.water>1e-12||c.frost>1e-12))continue;
      if(modernRules&&['oxygen','co2','steam','hydrogen'].includes(field)){const occupied=atmosphereOf(c);if(occupied&&occupied.element!==field)continue;}
      const free = field === 'water' ? liquidSpace(c) : Math.max(0, cap - (c[field] || 0));
      const amount = Math.min(left, free);
      if (amount > 0) moves.push([c, field, amount]);
      left -= amount;
      if (left <= 0) break;
    }
    if (left > 1e-12) return false;
  }
  if (!apply) return true;
  for (const [c, field, amount] of moves) move(source, c, field, amount, waterKgPerCell,modernRules);
  return true;
}
