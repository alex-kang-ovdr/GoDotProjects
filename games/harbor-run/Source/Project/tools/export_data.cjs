'use strict';
// Export the exact immutable authoring objects consumed by the offline build.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const gameplay = require('../src/gameplay-data.js');
const contracts = require('../src/mission-data.js');
const perception = require('../src/perception.js');
const outputs = {'gameplay_v4.json':gameplay,'mission_v4.json':contracts,'perception_v4.json':{
  revision:'4.0.0',classification:'PROPOSED_TUNING_NOT_GTA_MEASURED',defaults:perception.DEFAULTS,
  behavior:{unobservedTargetPositionReturned:false,hearingIdentifiesSuspect:false,reportDeduplicatedByIncident:true,
    reportLocation:'captured observation',deadWitnessBeforeAcceptance:'cancel candidate',deadWitnessAfterAcceptance:'keep report'}
}};
fs.mkdirSync(path.join(root,'data'),{recursive:true});
for(const [filename,data] of Object.entries(outputs))fs.writeFileSync(path.join(root,'data',filename),JSON.stringify(data,null,2)+'\n');
console.log('Exported '+Object.keys(outputs).join(', '));
