import {readNativeGasReference} from './native-gas-reference.mjs';
import {replayGasFrame} from '../../../Web/gas-comparison.js';
import {atmosphereOf} from '../../../Web/atmosphere.js';

const reference=await readNativeGasReference();
const fields={Oxygen:'oxygen',CarbonDioxide:'co2',Hydrogen:'hydrogen',Steam:'steam'};
const massToleranceG=.001;
function compare(restoredRules){
  let matchedFrames=0,totalFrames=0,totalCellReadings=0,differentElements=0,totalMassErrorG=0,maxMassErrorG=0;
  const cases=[];
  for(const sample of reference.cases){
    let matches=0,worstErrorG=0;
    for(let tick=1;tick<sample.frames.length;tick++){
      const world=replayGasFrame(reference,sample,tick,restoredRules);
      let match=true;
      for(const [x,y,element,mass] of sample.frames[tick]){
        const gas=atmosphereOf(world.cell(x,y)),sameElement=(fields[element]??null)===(gas?.element??null);
        const deltaG=1000*Math.abs((gas?.massKg??0)-mass);
        if(!sameElement)differentElements++;
        if(!sameElement||deltaG>massToleranceG)match=false;
        totalMassErrorG+=deltaG;worstErrorG=Math.max(worstErrorG,deltaG);totalCellReadings++;
      }
      if(match)matches++;
      totalFrames++;
    }
    matchedFrames+=matches;maxMassErrorG=Math.max(maxMassErrorG,worstErrorG);
    cases.push({id:sample.id,matchedFrames:matches,totalFrames:sample.frames.length-1,maxMassErrorG:worstErrorG});
  }
  return {matchedFrames,totalFrames,totalCellReadings,differentElements,meanAbsoluteMassErrorG:totalMassErrorG/totalCellReadings,maxMassErrorG,cases};
}
console.log(JSON.stringify({build:reference.build,caseCount:reference.cases.length,massToleranceG,previous:compare(false),current:compare(true)},null,2));
