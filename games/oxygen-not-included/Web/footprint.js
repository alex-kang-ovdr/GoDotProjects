// Coordinates in this module use the building's lower-left occupied cell as
// the anchor. Map y grows down, while the installed game's CellOffset y grows up.
// Port coordinates below are normalized to the lower-left occupied cell.
const installed = (width, height, ports = {}, options = {}) => ({
  width, height, ports, evidence:'installed-dll', placement:'floor', ...options
});
const webOnly = (width=1, height=1, ports={}) => ({
  width, height, ports, evidence:'web-approximation', placement:'floor'
});

export const BUILDING_FOOTPRINTS = Object.freeze({
  // Exact BuildLocation footprint dimensions and relevant BuildingDef offsets
  // are read from the installed Assembly-CSharp.dll (see References/...).
  ladder:installed(1,1,{}, {placement:'free'}), tile:installed(1,1,{}, {placement:'free'}), diffuser:installed(1,2,{power:[0,0]}),
  generator:installed(2,2,{power:[0,0]}), battery:installed(1,2,{power:[0,0]}),
  farm:installed(1,1,{}, {placement:'free',passable:true}), cot:installed(2,2), research:installed(2,2,{power:[0,0]}),
  pump:installed(2,2,{power:[0,1],liquidOut:[1,1]},{placement:'free'}),
  scrubber:installed(2,2,{power:[1,0],liquidIn:[0,0],liquidOut:[1,1]}),
  coalgen:installed(3,3,{power:[0,0]}),
  toilet:installed(2,3,{liquidIn:[0,0],liquidOut:[1,1]}),
  sink:installed(2,3,{liquidIn:[0,0],liquidOut:[1,1]}),
  reservoir:installed(2,3,{liquidIn:[1,2],liquidOut:[0,0]}),
  purifier:installed(4,3,{power:[2,0],liquidIn:[-1,2],liquidOut:[2,2]}),
  electrolyzer:installed(2,2,{power:[1,0],liquidIn:[0,0]}),
  hydrogenGen:installed(4,3,{power:[1,0],gasIn:[-1,0]}),
  steamTurbine:installed(5,4,{power:[1,0],liquidOut:[0,0]}),
  cooler:installed(2,2,{power:[1,0],liquidIn:[0,0],liquidOut:[1,1]},
    {portEvidence:'web-adaptation'}),
  kitchen:installed(3,2,{power:[0,0],liquidIn:[0,0]},{portEvidence:'web-adaptation'}),
  fridge:installed(1,2,{power:[0,0]}),
  storage:installed(1,2), mess:installed(1,1), door:installed(1,2,{}, {passable:true}),
  oxygenDock:installed(2,3,{power:[0,0]}),
  gasPump:installed(2,2,{power:[0,1],gasOut:[1,1]},{placement:'free'}),
  gasVent:installed(1,1,{gasIn:[0,0]},{placement:'free'}), liquidVent:installed(1,1,{liquidIn:[0,0]},{placement:'free'}),
  gasBridge:installed(3,1,{gasIn:[-1,0],gasOut:[1,0]},{rotatable:true,placement:'conduit',overlay:true}),
  liquidBridge:installed(3,1,{liquidIn:[-1,0],liquidOut:[1,0]},{rotatable:true,placement:'conduit',overlay:true}),
  supercomputer:installed(3,3,{power:[0,0]}),
  planetarium:installed(4,4,{power:[0,0]},{portEvidence:'default-building-offset'}),
  steamRocket:installed(7,5,{gasIn:[2,3]},
    {attachmentPoint:[0,5],portEvidence:'installed-dll'}),
  researchModule:installed(5,5,{},
    {attachmentPoint:[0,5],attachablePosition:[0,0],placement:'attachment'}),
  commandModule:installed(5,5,{},
    {attachablePosition:[0,0],placement:'attachment'}),
  core:webOnly(2,2,{liquidOut:[0,0]}), steamVent:webOnly(1,1),
});

const specFor = building => BUILDING_FOOTPRINTS[typeof building==='string'?building:building?.type]
  ||webOnly();
const rotationFor = (building, spec) => spec.rotatable ? (((building?.rotation||0)%4)+4)%4 : 0;

function rotatedSize(spec, rotation) {
  return rotation%2 ? {width:spec.height,height:spec.width}
    : {width:spec.width,height:spec.height};
}

export function buildingBounds(building) {
  const spec=specFor(building), rotation=rotationFor(building,spec);
  const {width,height}=rotatedSize(spec,rotation);
  return {x:building.x,y:building.y-height+1,width,height};
}

function rotatePort([x,y],spec,rotation) {
  switch(rotation) {
    case 1:return {x:y,y:spec.width-1-x};
    case 2:return {x:spec.width-1-x,y:spec.height-1-y};
    case 3:return {x:spec.height-1-y,y:x};
    default:return {x,y};
  }
}

export function buildingPort(building,kind) {
  const spec=specFor(building),port=spec.ports[kind];
  if(!port)return null;
  // BuildingDef.GenerateOffsets centers odd-width footprints around its
  // placement cell; translate the installed port offset into our lower-left
  // anchor coordinates before rotation.
  return offsetCell(building,port,spec);
}

function offsetCell(building,offset,spec=specFor(building)) {
  const firstX=Math.floor(spec.width/2)-spec.width+1;
  const local=[offset[0]-firstX,offset[1]];
  const {x,y}=rotatePort(local,spec,rotationFor(building,spec));
  return {x:building.x+x,y:building.y-y};
}

export function buildingAttachmentPoint(building) {
  const spec=specFor(building);
  return spec.attachmentPoint?offsetCell(building,spec.attachmentPoint,spec):null;
}

export function buildingAttachableCell(building) {
  const spec=specFor(building);
  return spec.attachablePosition?offsetCell(building,spec.attachablePosition,spec):null;
}

export function buildingCells(building) {
  const bounds=buildingBounds(building),cells=[];
  for(let dy=0;dy<bounds.height;dy++)for(let dx=0;dx<bounds.width;dx++)
    cells.push({x:bounds.x+dx,y:bounds.y+dy});
  return cells;
}

export function buildingEvidence(type) {
  return specFor(type).evidence;
}
