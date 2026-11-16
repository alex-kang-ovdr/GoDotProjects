/** Authored tactical spaces. Coordinates are world units; all geometry is fresh per match. */
export const MAPS = Object.freeze({
  valley: Object.freeze({ id: 'valley', name: '메마른 계곡', subtitle: 'DRY VALLEY', description: '세 갈래 농로와 낮은 담장 사이에서 기동 전투를 벌입니다.', tacticalTip: '중앙 도로는 빠르지만 노출됩니다. 농가 뒤에서 장전하고 측면으로 진입하세요.', theme: 'valley' }),
  depot: Object.freeze({ id: 'depot', name: '강철 보급소', subtitle: 'STEEL DEPOT', description: '창고와 적재 구역을 이용해 사선을 끊는 근접 교전입니다.', tacticalTip: '창고 모서리에서 정면 장갑을 활용하고, 낮은 담장을 파괴해 새 사선을 만드세요.', theme: 'depot' }),
  ridge: Object.freeze({ id: 'ridge', name: '안개 능선', subtitle: 'MIST RIDGE', description: '바위 능선과 수풀 사이에서 정찰과 우회가 승부를 가릅니다.', tacticalTip: '수풀에서 먼저 적을 발견하세요. 아군의 사격을 도우며 연막으로 이탈할 수 있습니다.', theme: 'ridge' }),
  training: Object.freeze({ id: 'training', name: '기초 사격장', subtitle: 'FIELD TRAINING', description: '움직이지 않는 세 표적으로 주행·조준·장갑 방향을 익힙니다.', tacticalTip: '전진해 첫 표적을 찾고, 포탑이 조준점에 도달한 뒤 발사하세요.', theme: 'training' }),
});

/** Shared movement materials. The renderer paints the same exact regions sampled here. */
export const SURFACES = Object.freeze({
  plain: Object.freeze({ id:'plain', label:'평지', speedMultiplier:1, accelerationMultiplier:1, turnMultiplier:1 }),
  road: Object.freeze({ id:'road', label:'도로', speedMultiplier:1.08, accelerationMultiplier:1.15, turnMultiplier:1 }),
  mud: Object.freeze({ id:'mud', label:'진흙', speedMultiplier:.64, accelerationMultiplier:.58, turnMultiplier:.78 }),
  rough: Object.freeze({ id:'rough', label:'험지', speedMultiplier:.82, accelerationMultiplier:.75, turnMultiplier:.88 }),
});

export function surfaceAt(map, x, y) {
  if (!map || !Number.isFinite(x) || !Number.isFinite(y)) return SURFACES.plain;
  for (const zone of map.surfaceZones || []) {
    if (!(zone.rx > 0 && zone.ry > 0) || !Object.hasOwn(SURFACES, zone.type)) continue;
    if (((x-zone.x)/zone.rx)**2 + ((y-zone.y)/zone.ry)**2 <= 1) return SURFACES[zone.type];
  }
  for (const [index,path] of (map.roads || []).entries()) {
    const radius = (map.roadWidths?.[index] ?? (index === 0 ? 88 : 62)) / 2;
    for (let i=1;i<path.length;i++) {
      const [ax,ay]=path[i-1], [bx,by]=path[i], dx=bx-ax, dy=by-ay;
      const lengthSquared=dx*dx+dy*dy;
      const along=lengthSquared ? Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/lengthSquared)) : 0;
      if ((x-ax-along*dx)**2 + (y-ay-along*dy)**2 <= radius*radius) return SURFACES.road;
    }
  }
  return SURFACES.plain;
}

const BASE_ROADS = [
  [[-40, 800], [590, 800], [1200, 800], [1820, 800], [2440, 800]],
  [[230, 800], [420, 420], [1000, 420], [1400, 420], [1980, 420], [2170, 800]],
  [[230, 800], [420, 1180], [990, 1180], [1410, 1180], [1980, 1180], [2170, 800]],
  [[1200, -40], [1200, 1640]],
];

const VALLEY_BUILDINGS = [
  [630,210,156,112],[936,175,104,152],[1300,223,162,113],[1635,165,125,156],
  [559,558,148,130],[836,562,105,136],[1110,530,148,115],[1486,558,116,144],[1760,566,126,112],
  [546,930,144,125],[813,956,116,140],[1140,942,142,114],[1470,952,148,130],[1750,927,110,136],
  [665,1284,138,113],[960,1312,100,128],[1324,1280,157,110],[1622,1290,115,130],
];
// The central rocks leave a full navigation cell beside each farmhouse pocket.
const VALLEY_ROCKS = [[413,392,63,46],[1020,790,60,47],[1325,752,64,49],[1910,1120,62,51],[360,1155,72,50],[1875,398,68,48],[1100,1123,58,43],[1220,395,56,43]];
const VALLEY_WALLS = [[720,842,112,22],[1555,752,115,22],[1002,446,105,22],[1300,1150,90,22]];
const VALLEY_BUSHES = [[475,610,57],[750,490,64],[985,655,49],[1120,744,48],[1435,490,65],[1675,676,48],[1940,600,60],[464,990,58],[745,1118,63],[970,935,53],[1298,859,48],[1410,1108,64],[1690,912,51],[1940,1020,62],[865,380,51],[1545,1238,52],[365,690,48],[2035,905,49],[1060,1210,50],[1360,395,52]];

function obstacleBuilder(map) {
  return (type, rect, extra = {}) => {
    const [x,y,w,h] = rect;
    const destructible = type === 'wall';
    map.obstacles.push({ id: `${map.id}-cover-${map.obstacles.length}`, type, x,y,w,h, hp: destructible ? 360 : 99999, maxHp: destructible ? 360 : 99999, destructible, destroyed: false, ...extra });
  };
}

function addBushes(map, positions) {
  for (const [x,y,r] of positions) map.bushes.push({ id: `${map.id}-bush-${map.bushes.length}`, x,y,r });
}

function addSurfaceZones(map, zones) {
  for (const [type,x,y,rx,ry] of zones) map.surfaceZones.push({id:`${map.id}-surface-${map.surfaceZones.length}`,type,x,y,rx,ry});
}

function makeValley(map, add) {
  for (const rect of VALLEY_BUILDINGS) add('building', rect);
  for (const rect of VALLEY_ROCKS) add('rock', rect);
  for (const rect of VALLEY_WALLS) add('wall', rect);
  addBushes(map, VALLEY_BUSHES);
  addSurfaceZones(map,[['mud',860,1180,100,62],['mud',1540,420,100,62],['rough',1110,800,86,86],['rough',1290,800,86,86]]);
  map.landmarks = [{x:1200,y:90,label:'북부 농로'},{x:1200,y:1490,label:'남부 우회로'}];
}

function makeDepot(map, add) {
  // Mirrored warehouses leave the main roads and five vertical passages connected.
  const leftBuildings = [[535,160,180,150],[825,170,195,145],[500,555,185,135],[830,535,165,145],[535,930,175,145],[845,955,165,150],[520,1300,185,145],[830,1290,190,145]];
  for (const rect of leftBuildings) {
    add('building',rect,{style:'warehouse'});
    add('building',[2400-rect[0]-rect[2],rect[1],rect[2],rect[3]],{style:'warehouse'});
  }
  for (const rect of [[1060,580,76,110],[1264,910,76,110]]) add('building',rect,{style:'control'});
  for (const rect of [[730,722,115,24],[1555,854,115,24],[1065,350,105,25],[1230,1225,105,25],[1075,864,105,24],[1220,710,105,24],[400,1060,24,100],[1976,440,24,100]]) add('wall',rect,{style:'container'});
  for (const rect of [[350,354,62,46],[1988,1200,62,46]]) add('rock',rect);
  addBushes(map,[[350,655,48],[2050,945,48],[760,487,42],[1640,1113,42],[1110,1150,47],[1290,450,47],[450,1230,44],[1950,370,44]]);
  map.roads = BASE_ROADS.map(path=>path.map(p=>[...p]));
  map.roads.push([[750,80],[750,1520]],[[1650,80],[1650,1520]]);
  addSurfaceZones(map,[['rough',750,800,105,56],['rough',1650,800,105,56],['mud',420,420,80,60],['mud',1980,1180,80,60]]);
  map.landmarks = [{x:1150,y:180,label:'NORTH FREIGHT'},{x:1220,y:1460,label:'SOUTH FREIGHT'}];
}

function makeRidge(map, add) {
  const rocks = [[545,245,120,82],[833,225,135,90],[1160,245,105,76],[1480,230,125,85],[1770,265,108,81],
    [570,568,92,95],[850,607,112,86],[1120,570,115,90],[1450,610,113,90],[1770,575,92,92],
    [590,970,115,78],[890,955,105,92],[1220,962,105,86],[1510,940,125,88],[1770,965,112,90],
    [540,1315,120,80],[900,1310,138,87],[1240,1320,105,82],[1550,1300,125,90],[1800,1280,110,80],
    [1050,760,65,48],[1290,789,67,49]];
  for (const rect of rocks) add('rock',rect);
  add('building',[355,540,100,88],{style:'cabin'});add('building',[1945,972,100,88],{style:'cabin'});
  for(const rect of [[775,844,100,22],[1525,734,100,22]])add('wall',rect);
  addBushes(map,[[430,665,68],[730,610,72],[990,665,61],[1240,665,58],[1580,550,72],[1910,650,68],
    [435,975,65],[780,985,71],[1100,960,63],[1360,980,66],[1695,1070,70],[1970,980,66],
    [640,382,58],[1020,405,62],[1370,410,68],[1685,385,61],[650,1190,65],[1080,1190,64],[1420,1200,67],[1740,1180,62],
    [960,795,45],[1405,800,46],[360,825,48],[2040,775,48],[1120,325,60],[1260,1275,57]]);
  map.roads = [
    [[-40,800],[590,800],[1200,800],[1820,800],[2440,800]],
    [[230,800],[445,430],[1000,420],[1460,420],[1960,430],[2170,800]],
    [[230,800],[445,1180],[990,1180],[1410,1180],[1960,1180],[2170,800]],
    [[730,70],[720,530],[760,860],[775,1530]],
    [[1660,70],[1630,600],[1630,1000],[1630,1530]],
  ];
  map.contours = true;
  addSurfaceZones(map,[['mud',970,420,105,60],['mud',1430,1180,105,60],['rough',755,795,90,115],['rough',1645,805,90,115],['rough',1200,800,105,76]]);
  map.landmarks = [{x:1200,y:110,label:'MIST RIDGE'},{x:1200,y:1490,label:'정찰 우회로'}];
}

function makeTraining(map, add) {
  map.trainingSpawn = {x:400,y:800,angle:0};
  map.trainingTargets = [
    {x:1000,y:620,angle:Math.PI,type:'scout',label:'표적 A · 정면'},
    {x:1200,y:820,angle:Math.PI/2,type:'medium',label:'표적 B · 측면'},
    {x:1380,y:1020,angle:0,type:'heavy',label:'표적 C · 후면'},
  ];
  for(const rect of [[260,450,150,100],[620,400,155,95],[1560,600,180,120],[1560,1180,180,110]])add('building',rect,{style:'range'});
  for(const rect of [[780,1050,150,24],[1420,450,150,24]])add('wall',rect);
  for(const rect of [[470,1100,75,50],[1840,850,80,58]])add('rock',rect);
  addBushes(map,[[660,700,60],[1760,1040,66],[540,1240,55]]);
  map.roads = [[[180,800],[680,800],[1520,800],[2070,800]],[[680,420],[680,1200]],[[1480,420],[1480,1200]]];
  addSurfaceZones(map,[['mud',720,800,90,90]]);
  map.landmarks = [{x:1050,y:370,label:'ARMOR TRAINING RANGE'},{x:400,y:1300,label:'FIELD MANUAL · 이동 / 조준 / 사격'}];
}

export function createMap(id = 'valley') {
  if (!Object.hasOwn(MAPS,id)) id = 'valley';
  const metadata = MAPS[id];
  const map = { ...metadata, width:2400, height:1600, version:0, obstacles:[], bushes:[], surfaceZones:[], lanes:[420,800,1180], roads:BASE_ROADS.map(path=>path.map(p=>[...p])) };
  const add = obstacleBuilder(map);
  ({valley:makeValley,depot:makeDepot,ridge:makeRidge,training:makeTraining})[id](map,add);
  map.roadWidths = map.roads.map((_,index)=>index===0?88:62);
  return map;
}
