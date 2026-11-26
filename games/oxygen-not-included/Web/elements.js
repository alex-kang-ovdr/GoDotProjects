// Numeric gameplay properties transcribed from the installed ONI element YAML.
// Temperatures are converted from the game's Kelvin values to degrees Celsius.
// Specific heat and conductivity retain the game's numeric units.
export const ELEMENTS = Object.freeze({
  Oxygen: Object.freeze({ state: 'gas', specificHeatCapacity: 1.005, thermalConductivity: 0.024, lowTempC: -182.96, lowTempTransitionTarget: 'LiquidOxygen', highTempC: null, highTempTransitionTarget: null, molarMass: 15.9994 }),
  CarbonDioxide: Object.freeze({ state: 'gas', specificHeatCapacity: 0.846, thermalConductivity: 0.0146, lowTempC: -48.15, lowTempTransitionTarget: 'LiquidCarbonDioxide', highTempC: null, highTempTransitionTarget: null, molarMass: 44.01 }),
  Hydrogen: Object.freeze({ state: 'gas', specificHeatCapacity: 2.4, thermalConductivity: 0.168, lowTempC: -252.15, lowTempTransitionTarget: 'LiquidHydrogen', highTempC: null, highTempTransitionTarget: null, molarMass: 1.00794 }),
  Water: Object.freeze({ state: 'liquid', specificHeatCapacity: 4.179, thermalConductivity: 0.609, lowTempC: -0.65, lowTempTransitionTarget: 'Ice', highTempC: 99.35, highTempTransitionTarget: 'Steam', molarMass: 18.01528 }),
  Ice: Object.freeze({ state: 'solid', specificHeatCapacity: 2.05, thermalConductivity: 2.18, lowTempC: null, lowTempTransitionTarget: null, highTempC: -0.65, highTempTransitionTarget: 'Water', molarMass: 18.01528 }),
  Steam: Object.freeze({ state: 'gas', specificHeatCapacity: 4.179, thermalConductivity: 0.184, lowTempC: 99.35, lowTempTransitionTarget: 'Water', highTempC: null, highTempTransitionTarget: null, molarMass: 18.01528 }),
  Dirt: Object.freeze({ state: 'solid', specificHeatCapacity: 1.48, thermalConductivity: 2, lowTempC: null, lowTempTransitionTarget: null, highTempC: 326.85, highTempTransitionTarget: 'Sand', molarMass: 50 }),
  IgneousRock: Object.freeze({ state: 'solid', specificHeatCapacity: 1, thermalConductivity: 2, lowTempC: null, lowTempTransitionTarget: null, highTempC: 1409.85, highTempTransitionTarget: 'Magma', molarMass: 50 }),
  SandStone: Object.freeze({ state: 'solid', specificHeatCapacity: 0.8, thermalConductivity: 2.9, lowTempC: null, lowTempTransitionTarget: null, highTempC: 926.85, highTempTransitionTarget: 'Magma', molarMass: 50 }),
  Algae: Object.freeze({ state: 'solid', specificHeatCapacity: 0.2, thermalConductivity: 2, lowTempC: null, lowTempTransitionTarget: null, highTempC: 125, highTempTransitionTarget: 'Dirt', molarMass: 4 }),
  IronOre: Object.freeze({ state: 'solid', specificHeatCapacity: 0.449, thermalConductivity: 4, lowTempC: null, lowTempTransitionTarget: null, highTempC: 1534.85, highTempTransitionTarget: 'MoltenIron', molarMass: 159.6882 }),
  Carbon: Object.freeze({ state: 'solid', specificHeatCapacity: 0.71, thermalConductivity: 1.25, lowTempC: null, lowTempTransitionTarget: null, highTempC: 276.85, highTempTransitionTarget: 'RefinedCarbon', molarMass: 12.0107 }),
  Granite: Object.freeze({ state: 'solid', specificHeatCapacity: 0.79, thermalConductivity: 3.39, lowTempC: null, lowTempTransitionTarget: null, highTempC: 668.85, highTempTransitionTarget: 'Magma', molarMass: 50 }),
  Obsidian: Object.freeze({ state: 'solid', specificHeatCapacity: 0.2, thermalConductivity: 2, lowTempC: null, lowTempTransitionTarget: null, highTempC: 2726.85, highTempTransitionTarget: 'Magma', molarMass: 50 }),
  Katairite: Object.freeze({ state: 'solid', specificHeatCapacity: 4, thermalConductivity: 0.00001, lowTempC: null, lowTempTransitionTarget: null, highTempC: 3421.85, highTempTransitionTarget: 'MoltenTungsten', molarMass: 341.76 }),
  Cuprite: Object.freeze({ state: 'solid', specificHeatCapacity: 0.386, thermalConductivity: 4.5, lowTempC: null, lowTempTransitionTarget: null, highTempC: 1083.85, highTempTransitionTarget: 'MoltenCopper', molarMass: 143.09 }),
});
