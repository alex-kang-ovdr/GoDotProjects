import { readFile } from 'node:fs/promises';

export async function readNativeGasReference(){
  const base=new URL('../../../References/OxygenNotIncluded/GasTicks/',import.meta.url);
  const [anchor,batch]=await Promise.all(['native-gas-anchor-oxygen-15-16.json','native-gas-traces-4.4.json'].map(async name=>JSON.parse(await readFile(new URL(name,base),'utf8'))));
  if(anchor.simVersion!==batch.simVersion||anchor.gameBuild!==batch.gameBuild)throw new Error('Gas measurements must share the same simulator build.');
  const samples=[{...anchor.cases[0],caseId:'anchor-horizontal-Oxygen'},...batch.cases];
  return {build:batch.gameBuild,world:batch.world,seed:batch.seed,cases:samples.map(test=>({
    id:test.caseId,dt:test.dtSeconds,seed:test.seed??batch.seed,
    frames:test.frames.map(frame=>frame.cells.filter(c=>c.cellState!=='solid').map(c=>[c.x,c.y,c.element,c.massKg,c.tempC]))
  }))};
}
