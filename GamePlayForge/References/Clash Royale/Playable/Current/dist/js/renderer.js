/* Crownfall Arena — original, asset-free canvas artwork. */

const W = 480;
const H = 640;
const PORTRAIT_VIEW = Object.freeze({ width: W, height: H });
const LANDSCAPE_VIEW = Object.freeze({ width: H, height: W });
const TAU = Math.PI * 2;
const UI_FONT = '"Noto Sans CJK KR", "Noto Sans KR", ui-sans-serif, system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const COLORS = {
  navy: '#152732', ink: '#24333a', paper: '#fff4d8', stone: '#eadfc2',
  stoneShade: '#b8ad95', gold: '#eabb62', blue: '#55b9d0', blueDeep: '#267a9e',
  red: '#eb7b68', redDeep: '#ab4c4d', grass: '#74aa83', water: '#58bdc8',
};
// Terrain-only palettes: team colors, towers, units and world geometry are shared.
const ARENA_THEMES = Object.freeze({
  grove: Object.freeze({
    outer:'#243d43',rim:'#a5ac91',frame:'#e0d5b5',frameLight:'#f7edcf',
    tileA:'#73ab82',tileB:'#79b088',seam:'rgba(237,244,197,.055)',mark:'rgba(43,111,76,.22)',
    paving:'rgba(226,220,170,.13)',bank:'#568f73',shore:'#a8c391',waterEdge:'#3c9eae',
    waterTop:'#57bcc8',waterMiddle:'#6fcbd0',waterBottom:'#52b3c2',waveLight:'rgba(226,250,225,.35)',waveDark:'rgba(31,143,164,.24)',
    wall:'#cfcaad',wallEdge:'#b2b69b',cap:'#f5e9cb',capEdge:'#a7ae94',rivet:'#c0a46b',pebble:'#b9c8a2',
    bridgeBase:'#bdaf88',bridgeEdge:'#788875',plankA:'#d8b88a',plankB:'#cbaa7e',plankSeam:'#ae8d68',rail:'#e6d7b5',railEdge:'#9f9d80',post:'#f0e2c2'
  }),
  dusk: Object.freeze({
    outer:'#28333f',rim:'#727e8a',frame:'#c9b49c',frameLight:'#e8d4b6',
    tileA:'#727e8b',tileB:'#798591',seam:'rgba(232,212,180,.075)',mark:'rgba(37,54,69,.24)',
    paving:'rgba(209,185,155,.17)',bank:'#576a77',shore:'#b5a990',waterEdge:'#377f96',
    waterTop:'#4c9db2',waterMiddle:'#64b6c6',waterBottom:'#438fa5',waveLight:'rgba(242,219,172,.38)',waveDark:'rgba(35,88,113,.3)',
    wall:'#aea799',wallEdge:'#7c8686',cap:'#e2d0b2',capEdge:'#8a8c83',rivet:'#b58a56',pebble:'#b2aea3',
    bridgeBase:'#9d998e',bridgeEdge:'#576d79',plankA:'#b59b7f',plankB:'#a48c75',plankSeam:'#7a7064',rail:'#c7bba3',railEdge:'#788582',post:'#e1ceb0'
  }),
  frost: Object.freeze({
    outer:'#2c4655',rim:'#89a8b2',frame:'#d5e2df',frameLight:'#f1f5e9',
    tileA:'#a3bdc4',tileB:'#acc6cc',seam:'rgba(241,251,242,.16)',mark:'rgba(236,249,243,.44)',
    paving:'rgba(231,243,235,.25)',bank:'#709ca9',shore:'#d9e8e5',waterEdge:'#377e96',
    waterTop:'#4a9caf',waterMiddle:'#65bdc8',waterBottom:'#418ca5',waveLight:'rgba(226,251,246,.48)',waveDark:'rgba(43,104,134,.26)',
    wall:'#c0d3d4',wallEdge:'#91afb6',cap:'#eef4e8',capEdge:'#9eb9bc',rivet:'#a1b7ab',pebble:'#e0ece3',
    bridgeBase:'#9faeac',bridgeEdge:'#678b9a',plankA:'#c8bdab',plankB:'#b4ad9f',plankSeam:'#8d9390',rail:'#e4eeea',railEdge:'#91adb4',post:'#f0f5e9'
  })
});
const themeName = value => typeof value==='string' && Object.hasOwn(ARENA_THEMES,value) ? value : 'grove';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const num = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const friendly = (team) => team === 'player' || team === 'blue' || team === 'home' || team === 0;
const teamColor = (team) => friendly(team) ? COLORS.blue : COLORS.red;
const teamDark = (team) => friendly(team) ? COLORS.blueDeep : COLORS.redDeep;
const arr = (v) => Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [];
const isSpellCard = card => card?.type === 'spell' || card?.kind === 'spell' ||
  ['fireball','arrows','zap','poison'].includes(card?.id || card?.cardId);

// Orientation is a presentation projection; every engine input stays in the
// original 480 × 640 world. Never clamp an outside/letterbox pointer into play.
// Landscape turns the battlefield counterclockwise: enemy left, player right.
const orientationName = value => value === 'landscape' ? 'landscape' : 'portrait';
const viewSize = orientation => orientation === 'landscape' ? LANDSCAPE_VIEW : PORTRAIT_VIEW;
const projectPoint = (x,y,orientation) => orientation === 'landscape' ? {x:y,y:W-x} : {x,y};
const unprojectPoint = (x,y,orientation) => orientation === 'landscape' ? {x:W-y,y:x} : {x,y};
function viewRect(canvas, orientation) {
  const bounds=viewSize(orientation),rect=canvas.getBoundingClientRect();
  const width=Math.max(1,num(rect.width)||num(canvas.clientWidth)||bounds.width);
  const height=Math.max(1,num(rect.height)||num(canvas.clientHeight)||bounds.height);
  const scale=Math.min(width/bounds.width,height/bounds.height);
  return {left:num(rect.left),top:num(rect.top),width,height,scale,
    offsetX:(width-bounds.width*scale)/2,offsetY:(height-bounds.height*scale)/2};
}
function projectEntity(entity, orientation) {
  if (!entity || orientation !== 'landscape') return entity;
  const copy={...entity,...projectPoint(num(entity.x),num(entity.y),orientation)};
  if(Number.isFinite(entity.facing))copy.viewFacing=entity.facing-Math.PI/2;
  if (entity.tx != null || entity.ty != null) {
    const target=projectPoint(num(entity.tx,entity.x),num(entity.ty,entity.y-1),orientation);
    copy.tx=target.x;copy.ty=target.y;
  }
  return copy;
}
function projectPreview(preview, orientation) {
  if (!preview || orientation !== 'landscape') return preview;
  return {...projectEntity(preview,orientation),
    positions:arr(preview.positions).map(p=>projectEntity(p,orientation)),
    affectedTargets:arr(preview.affectedTargets).map(p=>projectEntity(p,orientation))};
}
const towerBarY = (y,r,height) => y+r+35>height-20 ? Math.max(24,y-r-31) : y+r+12;
const fallbackFormationOffsets = count => count===6?[[-17,-10],[0,-10],[17,-10],[-17,10],[0,10],[17,10]]:
  count===3?[[-12,-6],[12,-6],[0,10]]:count===2?[[-12,0],[12,0]]:[[0,0]];

function drawEntityFocus(ctx,entity,hovered,selected) {
  const x=num(entity.x),y=num(entity.y),r=num(entity.radius,10);
  if(selected) {
    circle(ctx,x,y,r+7,null,'#f7d179',2.2);
    for(let i=0;i<4;i++) {
      const a=i*Math.PI/2,ca=Math.cos(a),sa=Math.sin(a);
      line(ctx,[[x+ca*(r+9),y+sa*(r+9)],[x+ca*(r+13),y+sa*(r+13)]],'#fff0b2',1.8);
    }
  }
  if(hovered)circle(ctx,x,y,r+(selected?11:6),null,'#fff0a8',selected?1:2);
}

// Engine range is an edge-to-edge distance. This ring reaches a point target;
// a target's own body radius is added when illustrating a specific engagement.
function attackRingRadius(entity) {
  const reach = Math.max(0,num(entity.range,num(entity.attackRange))) + Math.max(0,num(entity.radius));
  return entity.splashOrigin==='self' && num(entity.splashRadius)>0 ? Math.min(reach,num(entity.splashRadius)) : reach;
}
function targetReach(attacker, target) {
  const reach = Math.max(0,num(attacker.range,num(attacker.attackRange)))+Math.max(0,num(attacker.radius))+Math.max(0,num(target.radius));
  return attacker.splashOrigin==='self' && num(attacker.splashRadius)>0
    ? Math.min(reach,num(attacker.splashRadius)+num(target.radius)*.65) : reach;
}

function drawTeamRing(ctx,x,y,r,team,fill=null,width=1.5) {
  ctx.save();
  if (!friendly(team)) ctx.setLineDash([4,2.5]);
  circle(ctx,x,y,r,fill,teamColor(team),width);
  ctx.restore();
}

function hash(value) {
  const s = String(value ?? 'arena');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function random(seed, index) {
  let h = Math.imul((seed + index * 374761393) >>> 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function roundRect(ctx, x, y, w, h, r, fill, stroke, lineWidth = 1) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
function circle(ctx, x, y, r, fill, stroke, lineWidth = 1) {
  ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU);
  ctx.fillStyle = fill; ctx.fill();
}
function line(ctx, points, color, width = 1, close = false, fill = null) {
  if (!points.length) return;
  ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  if (close) ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (color) { ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
}
function label(ctx, text, x, y, size, color, weight = '700') {
  ctx.font = `${weight} ${size}px ${UI_FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color; ctx.fillText(String(text), x, y);
}
function crown(ctx, x, y, s, fill = COLORS.gold) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  line(ctx, [[-9, 5], [-11, -5], [-4, -1], [0, -8], [4, -1], [11, -5], [9, 5]],
    '#805830', 1.3, true, fill);
  roundRect(ctx, -9, 4, 18, 4, 1, '#d39743');
  circle(ctx, 0, 1, 1.5, '#f5fbf3'); ctx.restore();
}
function sword(ctx, x, y, scale = 1, angle = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  line(ctx, [[-2, 4], [-2, -12], [0, -17], [2, -12], [2, 4]], '#435763', 1, true, '#e1edf0');
  line(ctx, [[0, -13], [0, 3]], '#ffffff', 1);
  roundRect(ctx, -5, 3, 10, 3, 1, '#eabb62');
  roundRect(ctx, -1.5, 5, 3, 7, 1, '#7f5748'); ctx.restore();
}
function axe(ctx, x, y, scale = 1, angle = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  roundRect(ctx, -1.7, -12, 3.4, 28, 1, '#835642');
  line(ctx, [[-2, -9], [-12, -13], [-11, 0], [-3, -3], [3, -3], [11, 0], [12, -13], [2, -9]],
    '#4e6470', 1.3, true, '#d6e5e4');
  circle(ctx, 0, -6, 2.2, '#edbb62'); ctx.restore();
}
function skull(ctx, x, y, r = 8) {
  circle(ctx, x, y, r, '#f6ead0', '#7e8277', .8);
  roundRect(ctx, x - r * .55, y + r * .4, r * 1.1, r * .7, 2, '#f2e3c3');
  ellipse(ctx, x - r * .34, y + .3, r * .21, r * .28, '#30444c');
  ellipse(ctx, x + r * .34, y + .3, r * .21, r * .28, '#30444c');
  line(ctx, [[x, y + r * .23], [x - 1.2, y + r * .49], [x + 1.2, y + r * .49]], null, 1, true, '#6d776f');
}
function bolt(ctx, x, y, size = 10, color = '#ffe49a') {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 16, size / 16);
  line(ctx, [[2,-11],[-7,1],[-1,1],[-3,11],[8,-3],[2,-3]], '#58656b', 1.2, true, color);
  ctx.restore();
}
function snowflake(ctx, x, y, size = 9, color = '#ddf9ff') {
  ctx.save(); ctx.translate(x,y); ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.rotate(Math.PI / 3);
    line(ctx, [[-size,0],[size,0]], color, 1.5);
    line(ctx, [[size*.58,-size*.3],[size*.3,0],[size*.58,size*.3]], color, 1.1);
    line(ctx, [[-size*.58,-size*.3],[-size*.3,0],[-size*.58,size*.3]], color, 1.1);
  }
  ctx.restore();
}

/** A local silhouette, drawn toward negative y; no external sprites are used. */
function drawSprite(ctx, cardId, size, team, time = 0, moving = false, visual = null) {
  const s = size / 38;
  const blue = teamColor(team);
  const dark = teamDark(team);
  ctx.save(); ctx.scale(s, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const step = moving ? Math.sin(time * 12) * 1.3 : 0;
  const human = (body, head = '#efc7a2') => {
    roundRect(ctx, -8, 7 + step, 6, 8, 2, '#3d4b4c');
    roundRect(ctx, 2, 7 - step, 6, 8, 2, '#3d4b4c');
    roundRect(ctx, -10, -2, 20, 16, 5, body, '#34484f', 1.2);
    circle(ctx, 0, -7, 8, head, '#59615a', .9);
  };
  switch (cardId) {
    case 'phalanx': {
      // Each soldier is one body; the engine owns the six-member formation.
      const charging=num(visual?.chargeRemaining)>0,guarded=visual?.formationProtected===true;
      human(dark,'#e1c09c');
      roundRect(ctx,-8,-15,16,12,4,'#cbd4cf','#627a80',1.1);
      roundRect(ctx,-8,-8,16,3,1,'#435d68');
      roundRect(ctx,-2,-20,4,9,1.5,blue);
      line(ctx,[[13,14],[13,charging?-28:-22]],'#ad8d60',2.5);
      line(ctx,[[13,charging?-33:-27],[9,charging?-24:-18],[17,charging?-24:-18]],'#5d7880',.8,true,'#ecedda');
      const shieldX=charging?-7:0,shieldY=charging?3:-1;
      line(ctx,[[shieldX-10,shieldY-7],[shieldX+10,shieldY-7],[shieldX+9,shieldY+9],
        [shieldX,shieldY+15],[shieldX-9,shieldY+9]],guarded?'#f8dd91':'#b9c8c1',guarded?2:1.4,true,blue);
      line(ctx,[[shieldX,shieldY-4],[shieldX,shieldY+10]],'#e7dbad',1.7);
      line(ctx,[[shieldX-6,shieldY+2],[shieldX+6,shieldY+2]],'#e7dbad',1.7);
      if(guarded)circle(ctx,shieldX,shieldY+2,2.2,'#fff0bd');
      break;
    }
    case 'knight':
      human(blue);
      circle(ctx, 0, -9, 8, '#a9bfcb', '#4e6976', 1.2);
      roundRect(ctx, -8, -8, 16, 6, 2, '#cbdcdf');
      roundRect(ctx, -6, -6, 12, 2, 1, '#38515f');
      roundRect(ctx, -2, -18, 4, 10, 2, '#edbd62');
      sword(ctx, 13, -1, .9, .14);
      line(ctx, [[-14, -5], [-5, -5], [-5, 6], [-9.5, 11], [-14, 6]], '#f3d797', 1.4, true, dark);
      line(ctx, [[-9.5, -1], [-9.5, 6]], '#eabb62', 2);
      break;
    case 'archers':
      human('#5e9b83');
      ctx.fillStyle = '#aa648e'; ctx.beginPath(); ctx.arc(0, -8, 8.7, Math.PI, TAU); ctx.fill();
      roundRect(ctx, -9, -10, 4, 12, 2, '#aa648e');
      roundRect(ctx, 5, -10, 4, 12, 2, '#aa648e');
      roundRect(ctx, -7, 4, 14, 4, 1, blue);
      ctx.beginPath(); ctx.arc(10, -2, 11, -1.4, 1.4); ctx.strokeStyle = '#b47c49'; ctx.lineWidth = 2.5; ctx.stroke();
      line(ctx, [[12, -13], [12, 9]], '#f4e5b6', 1);
      line(ctx, [[8, -4], [21, -4]], '#e8dcc2', 1.4);
      line(ctx, [[21, -4], [17, -7], [17, -1]], null, 1, true, '#dce8e5');
      break;
    case 'giant':
      human('#ae7650');
      roundRect(ctx, -12, -1, 24, 18, 7, '#9a6849', '#654c39', 1.4);
      circle(ctx, 0, -8, 10.5, '#edb987', '#875d3f', 1);
      ctx.beginPath(); ctx.arc(0, -10, 10, Math.PI, TAU); ctx.fillStyle = '#d58b40'; ctx.fill();
      circle(ctx, -15, 4, 6.2, '#efbd8e', '#896147', 1);
      circle(ctx, 15, 4, 6.2, '#efbd8e', '#896147', 1);
      roundRect(ctx, -11, 9, 22, 5, 1.5, dark);
      roundRect(ctx, -3, 8.5, 6, 6, 1, '#efc867');
      break;
    case 'goblins':
    case 'spear_goblins':
      human(dark, '#83bc72');
      line(ctx, [[-7, -13], [-17, -13], [-9, -3]], '#4c8552', 1, true, '#82b66c');
      line(ctx, [[7, -13], [17, -13], [9, -3]], '#4c8552', 1, true, '#82b66c');
      circle(ctx, 0, -8, 8, '#89c577');
      circle(ctx, -3, -9, 1.5, '#f5e5aa'); circle(ctx, 3, -9, 1.5, '#f5e5aa');
      circle(ctx, -3, -9, .65, '#263e36'); circle(ctx, 3, -9, .65, '#263e36');
      line(ctx, [[-2, -5], [2, -5], [0, -2]], null, 1, true, '#e9edd3');
      if (cardId === 'spear_goblins') {
        line(ctx, [[12,17],[12,-25]], '#b99562', 2.5);
        line(ctx, [[12,-31],[8,-21],[12,-23],[16,-21]], '#527279', 1, true, '#e2e9d6');
        line(ctx, [[9,-17],[15,-17]], '#f0cb75', 2);
        roundRect(ctx, -7, -17, 14, 3, 1.5, blue);
      } else sword(ctx, 12, 3, .65, .3);
      break;
    case 'hog_rider':
      // The wider boar body and raised hammer remain readable at phone scale.
      ellipse(ctx, 0, 5, 15, 17, '#b68364');
      ellipse(ctx, 0, -7, 13, 12, '#c08d6d');
      roundRect(ctx, -9, -16, 18, 10, 5, '#d3a080', '#856450', 1);
      circle(ctx, -3, -12, 1.4, '#79604c'); circle(ctx, 3, -12, 1.4, '#79604c');
      line(ctx, [[-10,-12],[-16,-15],[-13,-6]], '#87634a', 1, true, '#d7a384');
      line(ctx, [[10,-12],[16,-15],[13,-6]], '#87634a', 1, true, '#d7a384');
      line(ctx, [[-8,-10],[-11,-17],[-6,-13]], null, 1, true, '#f5e8c5');
      line(ctx, [[8,-10],[11,-17],[6,-13]], null, 1, true, '#f5e8c5');
      roundRect(ctx, -10, 4, 20, 9, 3, dark);
      ellipse(ctx, 0, 2, 8, 9, '#9e6046');
      circle(ctx, 0, -4, 6, '#a76d50', '#704d3d', 1);
      roundRect(ctx, -2, -13, 4, 8, 1, '#30373b');
      line(ctx, [[-8,7],[-14,10]], '#9e6046', 4);
      line(ctx, [[8,5],[17,-3]], '#9e6046', 4);
      line(ctx, [[17,6],[17,-18]], '#94734d', 2.5);
      roundRect(ctx, 10, -22, 16, 10, 2, '#bccdd0', '#5c727a', 1.3);
      roundRect(ctx, 15, -21, 5, 8, 1, '#e3ca81');
      break;
    case 'duelist':
      human('#60747f');
      line(ctx, [[-11,-1],[-16,5],[-12,18],[0,14],[12,18],[16,5],[11,-1]], '#354c5c', 1, true, dark);
      roundRect(ctx, -11, -2, 22, 15, 4, '#8a9da8', '#3e5868', 1.4);
      line(ctx, [[-8,3],[0,8],[8,3]], '#d3e0df', 1.6);
      circle(ctx, 0, -10, 9, '#b2c5cc', '#425d6d', 1.4);
      roundRect(ctx, -8, -10, 16, 6, 2, '#304b61');
      line(ctx, [[-5,-7],[-1,-7],[2,-7],[5,-7]], '#87d9ef', 1.6);
      line(ctx, [[0,-21],[-3,-13],[3,-13]], '#805d41', .6, true, '#eabb62');
      sword(ctx, 15, -2, 1.2, -.12);
      roundRect(ctx, -7, 10, 14, 4, 1, '#e1bd70');
      break;
    case 'ice_spirit': {
      const pulse = moving ? Math.sin(time * 8) * 1.4 : 0;
      line(ctx, [[-8,12],[-13,3],[-11,-7],[-5,-4],[-2,-19],[5,-11],[8,-14],[13,0],[9,12]], '#7fc6dc', 1.3, true, '#b9ecf1');
      ellipse(ctx, 0, 3 + pulse, 9, 11, '#7ed4e6');
      circle(ctx, -3, -1 + pulse, 1.8, '#294d69'); circle(ctx, 4, -1 + pulse, 1.8, '#294d69');
      line(ctx, [[-2,5+pulse],[1,7+pulse],[4,4+pulse]], '#e9ffff', 1.6);
      line(ctx, [[-9,3],[-15,-1]], '#c8f7f2', 3);
      line(ctx, [[9,3],[15,-1]], '#c8f7f2', 3);
      roundRect(ctx, -6, 10, 12, 3, 1.5, blue);
      break;
    }
    case 'musketeer':
      human(blue);
      roundRect(ctx, -7, -18, 14, 10, 3, '#7b638f', '#4d4263', 1);
      ellipse(ctx, 0, -9, 11, 3.5, '#8f78a3');
      line(ctx, [[5, -17], [8, -23]], '#f1d991', 3);
      circle(ctx, 8, -23, 2.3, '#efc86d');
      roundRect(ctx, 10, -16, 4.5, 28, 1.5, '#9badb3', '#425966', 1);
      roundRect(ctx, 8, 3, 7, 12, 2, '#805944');
      roundRect(ctx, -6, 5, 12, 3, 1, '#e4ba69');
      break;
    case 'bomber':
      roundRect(ctx, -6, 2, 12, 13, 3, dark);
      line(ctx, [[-3, 11], [-6, 17]], '#e8dfca', 3);
      line(ctx, [[3, 11], [6, 17]], '#e8dfca', 3);
      skull(ctx, -3, -7, 8);
      circle(ctx, 10, 2, 10, '#344754', '#22303d', 1.5);
      circle(ctx, 7, -2, 3, '#68818b');
      line(ctx, [[13, -7], [16, -11], [18, -9]], '#c8b489', 2);
      circle(ctx, 18, -10, 2.2, '#f2b55d');
      circle(ctx, 18, -10, 1, '#fff1b8');
      break;
    case 'minions': {
      const flap = moving ? Math.sin(time * 10) * 2 : 0;
      line(ctx, [[-5, -3], [-20, -14 - flap], [-17, 5], [-10, 2], [-6, 9]], '#526e90', 1, true, '#7b83ba');
      line(ctx, [[5, -3], [20, -14 - flap], [17, 5], [10, 2], [6, 9]], '#526e90', 1, true, '#7b83ba');
      ellipse(ctx, 0, 1, 7.5, 11, '#5e7eae');
      circle(ctx, 0, -8, 7.5, '#839aca', '#435f8c', 1);
      line(ctx, [[-6, -12], [-8, -20], [-1, -14]], null, 1, true, '#d9dfce');
      line(ctx, [[6, -12], [8, -20], [1, -14]], null, 1, true, '#d9dfce');
      circle(ctx, -3, -9, 1.2, '#fff1a4'); circle(ctx, 3, -9, 1.2, '#fff1a4');
      roundRect(ctx, -5, 5, 10, 3, 1, blue);
      break;
    }
    case 'cannon':
      roundRect(ctx, -16, -5, 32, 23, 4, '#b69668', '#6a5b47', 1.5);
      roundRect(ctx, -20, 0, 6, 16, 2, '#354b51');
      roundRect(ctx, 14, 0, 6, 16, 2, '#354b51');
      circle(ctx, 0, 4, 11, '#68818a', '#2c4652', 2);
      roundRect(ctx, -6.5, -21, 13, 25, 3, '#617d89', '#2c4652', 1.5);
      roundRect(ctx, -7, -23, 14, 7, 2, '#8ca0a7', '#35515d', 1.4);
      ellipse(ctx, 0, -20, 4.5, 2, '#1e343f');
      roundRect(ctx, -10, 10, 20, 4, 1, blue);
      break;
    case 'valkyrie':
      human(blue);
      circle(ctx, 0, -8, 9, '#de8e43', '#805f45', 1);
      circle(ctx, 0, -5, 6.3, '#eec3a0');
      roundRect(ctx, -10, -6, 5, 17, 2.5, '#d47d36');
      roundRect(ctx, 5, -6, 5, 17, 2.5, '#d47d36');
      line(ctx, [[-8, -11], [0, -15], [8, -11]], '#dce7e8', 2.5);
      axe(ctx, 15, -1, .9, -.18);
      roundRect(ctx, -7, 8, 14, 3, 1, '#c19851');
      break;
    case 'skeletons':
      line(ctx, [[-3, 3], [-5, 14], [-10, 18]], '#e8e0cc', 3);
      line(ctx, [[3, 3], [5, 14], [10, 18]], '#e8e0cc', 3);
      line(ctx, [[-8, 0], [8, 0]], '#ece4ce', 3);
      line(ctx, [[0, -2], [0, 9]], '#ece4ce', 3);
      line(ctx, [[-4, 3], [4, 3]], '#ece4ce', 2);
      line(ctx, [[-3, 7], [3, 7]], '#ece4ce', 2);
      skull(ctx, 0, -10, 8.5);
      roundRect(ctx, -5, 9, 10, 3, 1, blue);
      sword(ctx, 13, 2, .65, .2);
      break;
    case 'fireball':
      line(ctx, [[-9, 7], [-14, -8], [-6, -5], [-1, -22], [7, -10], [13, -16], [14, 1], [8, 11]],
        null, 1, true, '#ed7b44');
      circle(ctx, 0, 3, 12, '#ee9143'); circle(ctx, 0, 4, 8, '#f7cb67');
      ellipse(ctx, -1, 5, 4, 6, '#fff0b1');
      break;
    case 'arrows':
      [-9, 0, 9].forEach((x, i) => {
        ctx.save(); ctx.translate(x, i === 1 ? -3 : 3); ctx.rotate((i - 1) * .13);
        line(ctx, [[0, 13], [0, -13]], '#b28b63', 2);
        line(ctx, [[0, -18], [-4, -10], [0, -12], [4, -10]], '#566f79', .8, true, '#dbe7e6');
        line(ctx, [[0, 8], [-4, 13], [-4, 18], [0, 14], [4, 18], [4, 13]], null, 1, true, '#e7a468');
        ctx.restore();
      });
      break;
    case 'zap':
      circle(ctx, 0, 0, 16, 'rgba(123,202,235,.2)', '#9ee5f0', 1);
      bolt(ctx, 0, 0, 27, '#ffe6a1');
      line(ctx, [[-16,-10],[-22,-15]], '#d1f5f8', 2);
      line(ctx, [[16,9],[22,14]], '#d1f5f8', 2);
      break;
    case 'poison':
      roundRect(ctx, -11, -9, 22, 25, 5, '#a98dbe', '#563f74', 1.3);
      roundRect(ctx, -7, -17, 14, 10, 2, '#c8b5d2');
      roundRect(ctx, -8, -20, 16, 6, 2, '#a88a5e');
      roundRect(ctx, -9, -1, 18, 14, 3, '#9fc369');
      skull(ctx, 0, 3, 5);
      circle(ctx, -13, -18, 3, 'rgba(181,224,133,.7)');
      circle(ctx, 12, -24, 4, 'rgba(181,224,133,.7)');
      break;
    default:
      human(blue); circle(ctx, 0, -8, 8, '#c2d4d8');
  }
  ctx.restore();
}

function makeBackground(name='grove') {
  const theme=ARENA_THEMES[themeName(name)];
  const canvas = document.createElement('canvas');
  // A doubled cache keeps stone outlines crisp on high-density displays.
  canvas.width = W * 2; canvas.height = H * 2;
  const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
  ctx.fillStyle = theme.outer; ctx.fillRect(0, 0, W, H);
  roundRect(ctx, 6, 5, 468, 630, 22, theme.rim);
  roundRect(ctx, 12, 11, 456, 618, 18, theme.frame, theme.frameLight, 2);
  roundRect(ctx, 21, 20, 438, 600, 12, theme.tileA);
  ctx.save(); roundRect(ctx, 21, 20, 438, 600, 12); ctx.clip();
  for (let row = 0; row < 19; row++) {
    for (let col = 0; col < 14; col++) {
      const x = 20 + col * 32, y = 16 + row * 32;
      ctx.fillStyle = (row + col) % 2 ? theme.tileA : theme.tileB;
      ctx.fillRect(x, y, 32, 32);
      ctx.fillStyle = theme.seam; ctx.fillRect(x, y, 31, 1);
      if(name==='dusk') {
        line(ctx,[[x+31,y+1],[x+31,y+31],[x+1,y+31]],'rgba(40,56,72,.10)',.8);
      }
      if ((row * 7 + col * 11) % 5 === 0) {
        const px = x + 8 + (col * 13 % 18), py = y + 13 + (row * 7 % 13);
        if(name==='frost') {
          line(ctx,[[px-2,py],[px+2,py]],theme.mark,1);
          line(ctx,[[px,py-2],[px,py+2]],theme.mark,1);
        } else if(name==='dusk') {
          line(ctx,[[px-4,py-2],[px,py],[px+2,py+4]],theme.mark,.8);
        } else line(ctx, [[px - 3, py], [px - 1, py - 4], [px, py], [px + 3, py - 3]], theme.mark, 1);
      }
    }
  }
  // Quiet paving suggests lanes without obscuring placement coordinates.
  [120, 360].forEach(x => {
    for (let y = 194; y <= 454; y += 24) {
      if (y > 284 && y < 350) continue;
      roundRect(ctx, x - 10 + ((y / 24 | 0) % 2 ? 3 : -2), y, 19, 13, 4, theme.paving);
    }
  });
  ctx.fillStyle = theme.bank; ctx.fillRect(20, 295, 440, 50);
  ctx.fillStyle = theme.shore; ctx.fillRect(20, 297, 440, 4); ctx.fillRect(20, 339, 440, 4);
  ctx.fillStyle = theme.waterEdge; ctx.fillRect(20, 301, 440, 38);
  const river = ctx.createLinearGradient(0, 302, 0, 338);
  river.addColorStop(0, theme.waterTop); river.addColorStop(.5, theme.waterMiddle); river.addColorStop(1, theme.waterBottom);
  ctx.fillStyle = river; ctx.fillRect(20, 304, 440, 32);
  // Decorative terrain always stays outside tower and bridge interaction space.
  for (const [x, y] of [[40,75],[440,75],[39,229],[440,229],[40,411],[441,411],[40,565],[440,565]]) {
    if(name==='dusk') {
      ellipse(ctx,x,y+4,8,4,'rgba(30,43,55,.18)');
      roundRect(ctx,x-4,y-5,8,13,2,'#9c9a8d','#64747c',.8);
      circle(ctx,x,y-5,11,'rgba(242,191,108,.085)');
      roundRect(ctx,x-4,y-11,8,9,2,'#5c6972','#d6b57a',.8);
      roundRect(ctx,x-2.2,y-9,4.4,5.5,1,'#f3cb82');
      line(ctx,[[x-5,y-11],[x,y-14],[x+5,y-11]],'#b2b4a1',1);
    } else if(name==='frost') {
      ellipse(ctx,x,y+6,10,4,'#dcebe5');
      line(ctx,[[x-7,y+4],[x,y-11],[x+7,y+4]],'#739a9e',.8,true,'#729b9b');
      line(ctx,[[x-5,y-2],[x,y-13],[x+5,y-2]],null,1,true,'#e6f0e6');
      line(ctx,[[x-7,y+4],[x-3,y],[x,y+2],[x+3,y],[x+7,y+4]],'#deeee4',1);
    } else {
      ellipse(ctx, x, y + 3, 9, 5, 'rgba(36,78,58,.15)');
      circle(ctx, x, y, 7, '#63976f'); circle(ctx, x - 4, y - 2, 5, '#86b780'); circle(ctx, x + 4, y - 3, 4, '#92c187');
      circle(ctx, x + 2, y - 5, 1.4, '#f4d986');
    }
  }
  for (let i = 0; i < 28; i++) {
    const x = i % 2 ? 29 : 450, y = 35 + i * 21;
    ellipse(ctx, x, y, name==='frost'?4:2.5, name==='frost'?2.2:1.7, theme.pebble);
  }
  ctx.restore();
  for (let y = 26; y < 620; y += 33) {
    roundRect(ctx, 11, y, 9, 28, 2, theme.wall, theme.wallEdge, .5);
    roundRect(ctx, 460, y, 9, 28, 2, theme.wall, theme.wallEdge, .5);
  }
  // Four carved corner caps.
  [[17,17],[463,17],[17,623],[463,623]].forEach(([x,y]) => {
    roundRect(ctx, x - 7, y - 7, 14, 14, 4, theme.cap, theme.capEdge, 1);
    circle(ctx, x, y, 2, theme.rivet);
  });
  return canvas;
}

function drawBridge(ctx, x, theme=ARENA_THEMES.grove) {
  ellipse(ctx, x + 2, 324, 31, 32, 'rgba(30,80,88,.13)');
  roundRect(ctx, x - 27, 291, 54, 58, 4, theme.bridgeBase, theme.bridgeEdge, 1.2);
  roundRect(ctx, x - 23, 291, 46, 58, 2, theme.plankB);
  for (let i = 0; i < 7; i++) {
    const y = 292 + i * 8;
    roundRect(ctx, x - 23, y, 46, 7, 1, i % 2 ? theme.plankA : theme.plankB);
    line(ctx, [[x - 20, y + 6.5],[x + 20, y + 6.5]], theme.plankSeam, .7);
  }
  roundRect(ctx, x - 29, 291, 6, 58, 2, theme.rail, theme.railEdge, 1);
  roundRect(ctx, x + 23, 291, 6, 58, 2, theme.rail, theme.railEdge, 1);
  [[-26,291],[26,291],[-26,349],[26,349]].forEach(([dx, y]) => {
    roundRect(ctx, x + dx - 4, y - 4, 8, 8, 2, theme.post, theme.capEdge, .8);
  });
}

function drawTower(ctx, tower, t, reducedMotion, bounds=PORTRAIT_VIEW) {
  const x = num(tower.x), y = num(tower.y), isKing = tower.type === 'king';
  const color = teamColor(tower.team), dark = teamDark(tower.team);
  const r = isKing ? 26 : 23;
  const dead = tower.destroyed || num(tower.hp, 1) <= 0;
  const ratio = clamp(num(tower.hp) / Math.max(1, num(tower.maxHp, tower.hp)), 0, 1);
  const critical=!dead && ratio<=.25;
  ctx.save(); ctx.translate(x, y);
  if (dead) {
    ellipse(ctx, 2, 6, r + 4, r * .62, 'rgba(42,65,47,.22)');
    circle(ctx, 0, 0, r - 3, 'rgba(75,102,72,.24)');
    for (let i = 0; i < 9; i++) {
      const a = i * 2.399, d = 5 + (i % 3) * 6;
      ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d * .7);
      ctx.rotate(a); roundRect(ctx, -5, -3, 10, 7, 1, i % 3 ? '#d2c9aa' : '#eee0be'); ctx.restore();
    }
    line(ctx, [[-15, -6], [-10, -13], [-4, -7]], color, 3);
    ctx.restore(); return;
  }
  if(critical) {
    ctx.globalAlpha=reducedMotion ? .8 : .72+Math.sin(t*2.5)*.12;
    ellipse(ctx,0,r+3,r+9,10,'rgba(240,175,83,.24)');
    ctx.globalAlpha=1;
  }
  ellipse(ctx, 3, 9, r + 7, r * .8, 'rgba(37,66,55,.22)');
  roundRect(ctx, -r - 4, -r + 4, r * 2 + 8, r * 2 + 3, 7, '#a3a98c');
  roundRect(ctx, -r - 2, -r + 1, r * 2 + 4, r * 2 + 1, 6, '#d6ccb0', '#8b9885', 1.2);
  roundRect(ctx, -r, -r - 3, r * 2, r * 2, 5, '#f1e5c6', '#9a9c82', 1.2);
  roundRect(ctx, -r + 6, -r + 3, r * 2 - 12, r * 2 - 12, 3, '#c1b69c');
  roundRect(ctx, -r + 8, -r + 4, r * 2 - 16, r * 2 - 16, 3, dark);
  ctx.fillStyle = '#d9ccb0'; ctx.fillRect(-r + 2, r - 8, r * 2 - 4, 8);
  // Front doorway and central banner establish the team at a glance.
  roundRect(ctx, -6, r - 10, 12, 12, 5, '#647166');
  roundRect(ctx, -5, r - 9, 10, 5, 2, '#394d4f');
  line(ctx, [[-8,-r + 7],[-8,5],[0,10],[8,5],[8,-r + 7]], null, 1, true, color);
  const corners = [[-r + 3, -r], [r - 3, -r], [-r + 3, r - 5], [r - 3, r - 5]];
  corners.forEach(([cx, cy]) => {
    roundRect(ctx, cx - 6, cy - 6, 12, 12, 2.5, '#f8edce', '#a5a58b', 1);
    ctx.fillStyle = '#d7caaa'; ctx.fillRect(cx - 3, cy - 6, 6, 3);
  });
  if (isKing) {
    const sleeping = tower.active === false;
    circle(ctx, 0, -5, 10, '#e9bc91', '#806850', 1);
    ellipse(ctx, 0, 1, 8, 4, '#875a3f');
    if (sleeping) {
      line(ctx, [[-6, -6],[-2,-6]], '#594b41', 1.5); line(ctx, [[2,-6],[6,-6]], '#594b41', 1.5);
      const drift = reducedMotion ? 0 : Math.sin(t * 2) * 1.5;
      label(ctx, 'z', 26, -25 + drift, 12, '#eaf4e3');
      label(ctx, 'Z', 33, -35 + drift, 15, '#eef5e4');
    } else {
      circle(ctx, -3.8, -6, 1.1, '#3a4240'); circle(ctx, 3.8, -6, 1.1, '#3a4240');
    }
    crown(ctx, 0, -17, .95);
  } else {
    circle(ctx, 0, -8, 7, '#edc7a3');
    ctx.beginPath(); ctx.arc(0, -10, 7.4, Math.PI, TAU); ctx.fillStyle = dark; ctx.fill();
    line(ctx, [[9,-12],[12,-7],[10,1]], '#e9c674', 2);
    line(ctx, [[8,-11],[10,1]], '#f0deb0', .8);
    circle(ctx, -2, -8, .75, '#4c4640'); circle(ctx, 2, -8, .75, '#4c4640');
  }
  if (num(tower.hitFlash) > 0) {
    ctx.globalAlpha = clamp(num(tower.hitFlash), 0, 1) * .65;
    roundRect(ctx, -r - 1, -r - 6, r * 2 + 2, r * 2 + 7, 5, '#fff8dd'); ctx.globalAlpha = 1;
  }
  if (num(tower.attackFlash)>0 && num(tower.stunRemaining)<=0) {
    ctx.globalAlpha = clamp(num(tower.attackFlash),0,1)*.8;
    circle(ctx,0,-r-3,4,'#fff2bc');
    line(ctx,[[-5,-r-4],[0,-r-10],[5,-r-4]],'#ffedba',1.5);
    ctx.globalAlpha = 1;
  }
  if (num(tower.stunRemaining)>0 || num(tower.frostRemaining)>0) {
    const frozen = num(tower.frostRemaining)>0;
    circle(ctx,r+5,-r-7,9,frozen?'#376d8b':'#5b5c62',frozen?'#bfefff':'#ffe4a1',1);
    if (frozen) snowflake(ctx,r+5,-r-7,6);
    else bolt(ctx,r+5,-r-7,11);
  }
  ctx.restore();
  // The bottom king has no room beneath its base: keep the entire readout
  // above that tower, clear of the arena's lower stone frame.
  const barY = towerBarY(y,r,bounds.height);
  roundRect(ctx, x - 28, barY - 4, 56, 8, 4, '#2b4548', critical?'#f4ca7e':'#e5e9ca', critical?1.4:.8);
  if (ratio > 0) roundRect(ctx, x - 26, barY - 2, Math.max(2, 52 * ratio), 4, 2, color);
  roundRect(ctx, x - 20, barY + 7, 40, 16, 6, critical?'#614d3b':'rgba(29,51,54,.76)');
  label(ctx, Math.max(0, Math.ceil(num(tower.hp))), x, barY + 15, 11, '#fff5dc');
  if(critical) {
    // This warning depends only on current HP, never estimated incoming damage.
    const bx=x+33,by=barY+15;
    line(ctx,[[bx,by-7],[bx+7,by+6],[bx-7,by+6]],'#72523a',.8,true,'#f1c47a');
    label(ctx,'!',bx,by+1,9,'#5a4433','900');
  }
}

function drawDeployProgress(ctx,unit,x,y,r,bounds=PORTRAIT_VIEW) {
  const remaining=num(unit.deployRemaining);
  if(remaining<=0)return;
  const duration=Number(unit.deployDuration),radius=r+5;
  ctx.save();ctx.lineCap='round';
  circle(ctx,x,y,radius,null,'rgba(34,59,68,.68)',3.8);
  if(Number.isFinite(duration)&&duration>0&&remaining<=duration+1e-7) {
    const progress=clamp(1-remaining/duration,0,1);
    if(progress>0) {
      ctx.beginPath();ctx.arc(x,y,radius,-Math.PI/2,-Math.PI/2+TAU*progress);
      ctx.strokeStyle='#f7e2a6';ctx.lineWidth=2.3;ctx.stroke();
    }
    circle(ctx,x,y-radius,1.6,'#f7e2a6');
  } else {
    // Old snapshots contain only remaining time. Do not invent a total duration.
    ctx.setLineDash([2,3]);circle(ctx,x,y,radius,null,'#f7e2a6',1.8);ctx.setLineDash([]);
    const px=clamp(x,17,bounds.width-17),py=clamp(y+r+12,23,bounds.height-23);
    roundRect(ctx,px-13,py-6.5,26,13,4,'#2e4850','#dac890',.6);
    label(ctx,`${remaining.toFixed(1)}s`,px,py,8,'#fff0c3');
  }
  ctx.restore();
}

function drawUnit(ctx, unit, t, reducedMotion, showRanges, hovered = false, selected = false, bounds=PORTRAIT_VIEW) {
  if (unit.dead || num(unit.hp, 1) <= 0) return;
  const x = num(unit.x), y = num(unit.y), r = clamp(num(unit.radius, 9), 5, 23);
  const cardId = unit.cardId || unit.type || 'knight';
  const isBuilding = unit.isBuilding || unit.kind === 'building' || cardId === 'cannon';
  const flying = Boolean(unit.flying);
  const deploying = num(unit.deployRemaining) > 0;
  const stunned = num(unit.stunRemaining) > 0;
  const frozen = num(unit.frostRemaining) > 0;
  const slowed = num(unit.slowRemaining) > 0;
  const charging=cardId==='phalanx'&&num(unit.chargeRemaining)>0;
  const attack = !stunned && !deploying ? clamp(num(unit.attackFlash), 0, 1) : 0;
  const facing = Number.isFinite(unit.facing) ? unit.facing + Math.PI / 2 : friendly(unit.team) ? 0 : Math.PI;
  const ranged = isBuilding || num(unit.projectileSpeed) > 0 || ['archers','musketeer','bomber','spear_goblins'].includes(cardId);
  const bob = flying && !reducedMotion && !stunned ? Math.sin(t * 5 + hash(unit.id) % 20) * 2 : 0;
  if (showRanges && num(unit.range, unit.attackRange) > 0) {
    ctx.save(); ctx.strokeStyle = friendly(unit.team) ? 'rgba(25,92,125,.23)' : 'rgba(166,63,55,.2)';
    ctx.lineWidth = .8; ctx.setLineDash([3,5]);
    circle(ctx, x, y, attackRingRadius(unit), null, ctx.strokeStyle, .8); ctx.restore();
  }
  ellipse(ctx, x + 1.5, y + 4, r * 1.22, r * .63, 'rgba(30,62,47,.2)');
  drawTeamRing(ctx,x,y+1,r+2,unit.team,friendly(unit.team)?'rgba(78,184,214,.24)':'rgba(234,111,93,.22)',1.5);
  drawEntityFocus(ctx,unit,hovered,selected);
  if(charging) {
    // Directional marks follow the projected movement vector, independently of
    // the upright sprite pose. They remain static when reduced motion is on.
    const angle=num(unit.viewFacing,num(unit.facing,friendly(unit.team)?-Math.PI/2:Math.PI/2));
    const dx=Math.cos(angle),dy=Math.sin(angle),px=-dy,py=dx;
    const pulse=reducedMotion?0:Math.sin(t*12)*1.1;
    for(const distance of [r+4+pulse,r+9+pulse]) {
      const cx=x-dx*distance,cy=y-dy*distance;
      line(ctx,[[cx-dx*3+px*3,cy-dy*3+py*3],[cx,cy],[cx-dx*3-px*3,cy-dy*3-py*3]],'#ffe1a0',1.4);
    }
  }
  if (flying) {
    ctx.save(); ctx.setLineDash([2,3]); circle(ctx, x, y + 4, r + 3.5, null, 'rgba(237,242,209,.6)', .8); ctx.restore();
  }
  ctx.save(); ctx.translate(x, y - (flying ? 7 : 0) + bob);
  // The engine's facing is atan2(dy, dx); sprites point along negative y.
  ctx.rotate(facing);
  if (attack > 0 && !reducedMotion) {
    if (ranged) ctx.translate(0, attack * 3.8);
    else { ctx.translate(0, -attack * 2.8); ctx.rotate((cardId === 'valkyrie' ? .65 : .22) * attack); }
  }
  if (deploying) ctx.globalAlpha = .62;
  const size = isBuilding ? r * 2.35 : ['giant','hog_rider'].includes(cardId) ? r * 2.15 : r * 2.8;
  drawSprite(ctx, cardId, size, unit.team, reducedMotion ? 0 : t, !deploying && !isBuilding && !reducedMotion && !stunned,unit);
  if (attack > .1) {
    ctx.globalAlpha = attack * .8;
    if (ranged) {
      if (cardId === 'cannon' || cardId === 'musketeer') {
        const ax = cardId === 'musketeer' ? r * .8 : 0, ay = -r * 1.25;
        line(ctx, [[ax-4,ay],[ax-2,ay-4],[ax,ay-2],[ax+2,ay-7],[ax+5,ay]], null, 1, true, '#fff0ad');
      }
    } else {
      ctx.beginPath();
      const spin = cardId === 'valkyrie';
      ctx.arc(0, -1, r * 1.55, spin ? -.2 : -2.55, spin ? TAU - .5 : -.4);
      ctx.strokeStyle = '#fff1bd'; ctx.lineWidth = spin ? 3.3 : 2.5; ctx.stroke();
    }
    ctx.globalAlpha = deploying ? .62 : 1;
  }
  if (num(unit.hitFlash) > 0) {
    ctx.globalAlpha = clamp(num(unit.hitFlash), 0, 1) * .65;
    circle(ctx, 0, 0, r, '#fff3c9');
  }
  ctx.restore();
  if (stunned || frozen || slowed) {
    const statusColor = frozen ? '#bceef9' : stunned ? '#ffe6a7' : '#d1e9a6';
    circle(ctx, x, y, r + 4, null, statusColor, 1.4);
    if (frozen) {
      line(ctx, [[x-r-1,y+4],[x-r-3,y-3],[x-r+3,y],[x-r+2,y-7]], '#d3f7ff', 1.5);
      line(ctx, [[x+r+1,y+4],[x+r+3,y-3],[x+r-3,y],[x+r-2,y-7]], '#d3f7ff', 1.5);
    }
    const sx = clamp(x+r+4,11,bounds.width-11), sy = clamp(y-r-(flying?10:1)+bob,12,bounds.height-12);
    circle(ctx, sx, sy, 7.5, frozen ? '#3c7c96' : stunned ? '#5b6065' : '#56684a', statusColor, .8);
    if (frozen) snowflake(ctx, sx, sy, 5, statusColor);
    else if (stunned) bolt(ctx, sx, sy, 9, statusColor);
    else {
      line(ctx,[[sx-3,sy-3],[sx,sy],[sx+3,sy-3]],statusColor,1.6);
      line(ctx,[[sx-3,sy+1],[sx,sy+4],[sx+3,sy+1]],statusColor,1.6);
    }
  }
  if (deploying) drawDeployProgress(ctx,unit,x,y,r,bounds);
  const ratio = clamp(num(unit.hp) / Math.max(1, num(unit.maxHp, unit.hp)), 0, 1);
  const barW = Math.max(21, Math.min(35, r * 2.6));
  const by = clamp(y-r-(flying?15:9)+bob,12,bounds.height-16),bx=clamp(x,barW/2+3,bounds.width-barW/2-3);
  roundRect(ctx, bx - barW / 2, by, barW, 4.6, 2.2, '#2c4447', 'rgba(255,247,216,.6)', .6);
  if (ratio > 0) roundRect(ctx, bx - barW / 2 + .8, by + .8, Math.max(1, (barW - 1.6) * ratio), 3, 1.5,
    ratio < .25 ? '#ffbd71' : teamColor(unit.team));
  if (hovered || selected) {
    const text = `${Math.max(0,Math.ceil(num(unit.hp)))} / ${Math.ceil(num(unit.maxHp,unit.hp))}`;
    const width = Math.max(56, text.length * 5.6 + 12);
    const lx=clamp(x,width/2+22,bounds.width-width/2-22),ly=y+r+25>bounds.height-20?Math.max(24,by-21):y+r+8;
    roundRect(ctx, lx-width/2, ly, width, 17, 5, '#243e47', '#dac78e', .7);
    label(ctx, text, lx, ly+8.5, 10, '#fff1cc');
  }
}

function drawFormationBadges(ctx,units,bounds=PORTRAIT_VIEW) {
  const groups=new Map();
  for(const unit of units) {
    if(unit.cardId!=='phalanx'||!unit.formationGroupId||unit.dead||num(unit.hp)<=0)continue;
    if(!groups.has(unit.formationGroupId))groups.set(unit.formationGroupId,[]);
    groups.get(unit.formationGroupId).push(unit);
  }
  for(const members of groups.values()) {
    const remaining=Math.max(0,...members.map(unit=>num(unit.chargeRemaining)));
    const protectedCount=members.filter(unit=>unit.formationProtected===true).length;
    const regrouping=members.some(unit=>unit.formationState==='regroup');
    if(!remaining&&!protectedCount&&!regrouping)continue;
    const charging=remaining>0,guarded=!charging&&protectedCount>0;
    const text=charging?`돌격 · ${Math.ceil(remaining)}s`:guarded?
      protectedCount===members.length?'방진':`방어 ${protectedCount}/${members.length}`:'재집결';
    const width=Math.max(49,text.length*8+23),center=members.reduce((sum,unit)=>sum+num(unit.x),0)/members.length;
    const x=clamp(center,width/2+22,bounds.width-width/2-22);
    const y=clamp(Math.max(...members.map(unit=>num(unit.y)+num(unit.radius,8)))+18,31,bounds.height-31);
    const accent=charging?'#ffe0a1':guarded?'#dbe7be':'#c4d5d7';
    const background=charging?'#64523a':guarded?teamDark(members[0].team):'#43585f';
    ctx.save();roundRect(ctx,x-width/2,y-8,width,16,5,background,accent,.7);
    const ix=x-width/2+9;
    if(charging) {
      line(ctx,[[ix-3,y-4],[ix+1,y],[ix-3,y+4]],accent,1.5);
      line(ctx,[[ix+1,y-4],[ix+5,y],[ix+1,y+4]],accent,1.5);
    } else if(guarded) {
      line(ctx,[[ix-4,y-5],[ix+4,y-5],[ix+4,y+1],[ix,y+5],[ix-4,y+1]],accent,1,true,'rgba(255,241,186,.15)');
    } else {circle(ctx,ix-2,y,1.3,accent);circle(ctx,ix+2,y,1.3,accent);}
    label(ctx,text,x+7,y,9.5,'#fff1d2');ctx.restore();
  }
}

function drawProjectile(ctx, p, reducedMotion) {
  const x = num(p.x), y = num(p.y), kind = p.kind || p.type || 'bullet';
  const radius = clamp(num(p.radius, 2.5), 1, 16);
  const angle = Math.atan2(num(p.ty, y - 1) - y, num(p.tx, x) - x);
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  if (kind === 'arrow' || kind === 'spear' || p.cardId === 'archers' || p.cardId === 'spear_goblins') {
    const spear = kind === 'spear' || p.cardId === 'spear_goblins';
    line(ctx, [[spear ? -13 : -8,0],[4,0]], '#decba2', spear ? 2.1 : 1.7);
    line(ctx, [[6,0],[1,-2.4],[1,2.4]], null, 1, true, '#f4f2de');
    if (!spear) line(ctx, [[-5,0],[-9,-2]], teamColor(p.team), 1.6);
  } else if (kind === 'bomb' || p.cardId === 'bomber') {
    circle(ctx, 0, 0, radius + 1.5, '#344653', '#f6d488', 1);
    circle(ctx, -1.2, -1.2, 1.5, '#8b9c9f');
    line(ctx, [[0,-radius],[-2,-radius-3]], '#e0b56e', 1.3);
  } else if (kind === 'fireball' || p.cardId === 'fireball') {
    if (!reducedMotion) ellipse(ctx, -8, 0, 13, 4, 'rgba(244,148,61,.48)');
    circle(ctx, 0, 0, radius + 3, '#f9b75d'); circle(ctx, 1, 0, radius, '#fff0b6');
  } else {
    if (!reducedMotion) line(ctx, [[-9,0],[0,0]], 'rgba(248,227,168,.58)', 2.2);
    circle(ctx, 0, 0, radius, '#fff0b7', '#94734e', .6);
  }
  ctx.restore();
}

function effectProgress(effect) {
  const duration = Math.max(.01, num(effect.maxLife, num(effect.duration, .5)));
  if (effect.life != null) return clamp(1 - num(effect.life) / duration, 0, 1);
  return clamp(num(effect.age) / duration, 0, 1);
}
function drawEffect(ctx, effect, reducedMotion) {
  const type = effect.type || effect.kind || 'hit';
  if (type === 'damage') return; // Rendered together so swarms do not flood the arena with text.
  const x = num(effect.x), y = num(effect.y), r = Math.max(5, num(effect.radius, 15));
  const p = effectProgress(effect), fade = 1 - p;
  if (fade <= 0) return;
  const seed = hash(effect.id ?? `${type}:${x}:${y}`);
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = fade;
  const color = teamColor(effect.team);
  if (type === 'poisonTick') {
    // A poison tick is a whole-zone pulse; it is not a melee impact at center.
    circle(ctx,0,0,r*(reducedMotion ? .98 : .92+p*.08),'rgba(191,217,136,.10)','#cce8a9',1.1*fade);
    if (!reducedMotion) {
      for(let i=0;i<5;i++) {
        const a=random(seed,i*2)*TAU,d=Math.sqrt(random(seed,i*2+1))*r*.8;
        circle(ctx,Math.cos(a)*d,Math.sin(a)*d-p*9,1.5+p,'#dcf0b0');
      }
    }
  } else if (type === 'cast') {
    const warning = effect.cardId === 'poison' ? '#d4efa0' : effect.cardId === 'zap' ? '#e8f6ff' : friendly(effect.team) ? '#b9f0e7' : '#ffc1a0';
    circle(ctx, 0, 0, r, friendly(effect.team) ? 'rgba(111,204,214,.09)' : 'rgba(234,115,87,.13)');
    ctx.setLineDash([5,5]);
    circle(ctx, 0, 0, r, null, warning, 1.5);
    ctx.setLineDash([]);
    circle(ctx, 0, 0, r * (reducedMotion ? .5 : Math.max(.12, 1 - p)), null, warning, 1);
    if (effect.cardId === 'fireball' && !reducedMotion) {
      const height = (1 - p) * 55;
      ellipse(ctx, 0, -height - 8, 6, 13, 'rgba(249,188,98,.45)');
      circle(ctx, 0, -height, 6, '#f8be68'); circle(ctx, 0, -height + 1, 3.5, '#fff0b7');
    }
  } else if (type === 'freeze' || effect.cardId === 'ice_spirit' && type === 'spell') {
    circle(ctx, 0, 0, r * (.65 + p * .4), 'rgba(160,221,244,.2)', '#d7f7fc', 1.5);
    for (let i=0;i<5;i++) {
      const a = i * TAU / 5 + .4, d = r * (.3 + p * .5);
      snowflake(ctx, Math.cos(a)*d, Math.sin(a)*d, 5 + p*2, '#e9fbff');
    }
    snowflake(ctx, 0, 0, 11, '#fffdf0');
  } else if (type === 'stun' || type === 'zap' || type === 'spell' && effect.cardId === 'zap') {
    circle(ctx, 0, 0, r * (.75 + p * .3), 'rgba(186,232,251,.16)', '#cfecfa', 1.8);
    const branches = reducedMotion ? 3 : 6;
    for (let i=0;i<branches;i++) {
      const a = i * TAU / branches, d = r * .85;
      line(ctx, [[0,0],[Math.cos(a+.25)*d*.35,Math.sin(a+.25)*d*.35],
        [Math.cos(a-.18)*d*.6,Math.sin(a-.18)*d*.6],[Math.cos(a)*d,Math.sin(a)*d]], '#edfcff', 2);
    }
    bolt(ctx, 0, 0, Math.min(28,r*.6), '#ffeab0');
  } else if (type === 'spell' && effect.cardId === 'poison') {
    circle(ctx, 0, 0, r * (.7 + p * .3), 'rgba(177,205,116,.17)', '#d0e8a4', 1.6);
    particleBurst(ctx, seed, p, r, '#d8eeb0', reducedMotion ? 3 : 9);
  } else if (type === 'attack') {
    ctx.rotate(num(effect.facing) + Math.PI / 2);
    ctx.beginPath(); ctx.arc(0,0,r*(.6+p*.45),-2.7,-.4);
    ctx.strokeStyle = '#fff1c0'; ctx.lineWidth = 3 * fade; ctx.stroke();
  } else if (type === 'spell') {
    const arrows = effect.cardId === 'arrows';
    circle(ctx, 0, 0, r * (.7 + p * .32), arrows ? 'rgba(239,229,200,.15)' : 'rgba(239,149,65,.22)');
    circle(ctx, 0, 0, r * (.45 + p * .58), null, arrows ? '#f8e7b5' : '#ffc675', 2.2 * fade);
    if (arrows) {
      for (let i = 0; i < 13; i++) {
        const a = random(seed,i * 2) * TAU, d = Math.sqrt(random(seed,i * 2+1)) * r * .88;
        const ax = Math.cos(a) * d, ay = Math.sin(a) * d;
        const lift = reducedMotion ? 0 : (1 - p) * 25;
        line(ctx, [[ax - 4,ay - 11 - lift],[ax + 2,ay + 2 - lift]], '#705b47', 1.3);
        line(ctx, [[ax+2,ay+2-lift],[ax-2,ay-lift],[ax+1,ay-3-lift]], null, 1, true, '#eef0df');
      }
    } else {
      const bloom = reducedMotion ? r * .35 : r * (.2 + p * .65);
      circle(ctx, 0, 0, bloom, '#f7a458'); circle(ctx, 0, 0, bloom * .62, '#fadd8c');
      particleBurst(ctx, seed, p, r, '#ffd68a', reducedMotion ? 0 : 12);
    }
  } else if (type === 'towerDown') {
    circle(ctx, 0, 0, r * (.5 + p * 1.8), null, '#f1dfae', Math.max(.2, 4 * fade));
    particleBurst(ctx, seed, p, Math.max(r, 28) * 1.6, '#e8d9b3', reducedMotion ? 0 : 19, true);
  } else if (type === 'kingActive') {
    circle(ctx, 0, 0, 22 + p * 16, null, '#f5cd70', 2 * fade);
    crown(ctx, 0, -32 - (reducedMotion ? 0 : p * 15), 1, '#f3cb6b');
  } else if (type === 'spawn') {
    circle(ctx, 0, 0, r * (.55 + p * .75), null, color, 2 * fade);
    if (!reducedMotion) particleBurst(ctx, seed, p, r, '#f4ebbd', 5);
  } else if (type === 'death') {
    ellipse(ctx, 0, 2, r * (.4 + p), r * (.2 + p * .55), 'rgba(226,220,180,.5)');
    particleBurst(ctx, seed, p, r * 1.4, '#e8e0bd', reducedMotion ? 0 : 5);
  } else {
    if (reducedMotion) {
      circle(ctx, 0, 0, 3, '#fff3be');
    } else {
      const len = Math.max(5, r * .6) * (.6 + p);
      line(ctx, [[-len,0],[len,0]], '#fff0be', 2 * fade);
      line(ctx, [[0,-len],[0,len]], '#fff0be', 2 * fade);
      circle(ctx, 0, 0, 3 * fade, '#fff7dc');
    }
  }
  if (effect.text) {
    label(ctx, String(effect.text).slice(0, 18), 0, -18 - (reducedMotion ? 0 : p * 14), 13, '#fff4d5');
  }
  ctx.restore();
}
function particleBurst(ctx, seed, progress, radius, color, count, debris = false) {
  for (let i = 0; i < count; i++) {
    const a = random(seed, i * 3) * TAU;
    const speed = .35 + random(seed, i * 3 + 1) * .7;
    const dist = radius * speed * (progress + .15);
    const px = Math.cos(a) * dist, py = Math.sin(a) * dist + progress * progress * 9;
    const size = (1.5 + random(seed, i * 3 + 2) * 2.5) * (1 - progress * .5);
    if (debris) {
      ctx.save(); ctx.translate(px,py); ctx.rotate(a + progress * 3);
      roundRect(ctx, -size, -size, size * 2, size * 1.3, .6, color); ctx.restore();
    } else circle(ctx, px, py, size, color);
  }
}

function drawArea(ctx, area, t, reducedMotion) {
  if (area.life != null && num(area.life) <= 0) return;
  const x = num(area.x), y = num(area.y), r = Math.max(4,num(area.radius,55));
  const total = Math.max(.01,num(area.maxLife,num(area.duration,8)));
  const remaining = clamp(num(area.life,total)/total,0,1);
  const seed = hash(area.id), fade = Math.min(1, remaining*7);
  ctx.save(); ctx.translate(x,y); ctx.globalAlpha = fade;
  if (!friendly(area.team)) ctx.setLineDash([5,4]);
  circle(ctx,0,0,r,'rgba(77,73,103,.18)',friendly(area.team)?'#a2d9b2':'#e9ac93',1.4);
  ctx.setLineDash([]);
  ctx.save(); circle(ctx,0,0,r); ctx.clip();
  for (let i=0;i<8;i++) {
    const a = random(seed,i*3)*TAU, d = Math.sqrt(random(seed,i*3+1))*r*.75;
    const drift = reducedMotion ? 0 : Math.sin(t*1.1+i)*3.5;
    const rr = r*(.24+random(seed,i*3+2)*.18);
    circle(ctx,Math.cos(a)*d+drift,Math.sin(a)*d-drift*.5,rr,
      i%2 ? 'rgba(162,191,107,.16)' : 'rgba(133,103,159,.17)');
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(0,0,r,-Math.PI/2,-Math.PI/2+TAU*remaining);
  ctx.strokeStyle = friendly(area.team) ? '#a2e5c1' : '#efb58c'; ctx.lineWidth = 2.4; ctx.stroke();
  ctx.restore();
}

function drawAreaTimer(ctx, area, entities, reserved, bounds=PORTRAIT_VIEW) {
  if (area.life!=null && num(area.life)<=0) return;
  const x=num(area.x),y=num(area.y),r=Math.max(4,num(area.radius,55));
  const candidates=[{x,y:y+r-3},{x,y:y-r+3},{x:x+r-12,y},{x:x-r+12,y}]
    .map(p=>({x:clamp(p.x,44,bounds.width-44),y:clamp(p.y,31,bounds.height-31)}));
  const obstacles=entities.filter(e=>!e.destroyed && num(e.hp,1)>0).map(e=>{
    const er=num(e.radius,10),tower=e.kind==='tower'||e.type==='king'||e.type==='princess';
    const by=tower?towerBarY(num(e.y),e.type==='king'?26:23,bounds.height):num(e.y);
    return {left:num(e.x)-Math.max(er+8,tower?44:0),right:num(e.x)+Math.max(er+8,tower?44:0),
      top:Math.min(num(e.y)-er-13,tower?by-6:Infinity),
      bottom:Math.max(num(e.y)+er+8,tower?by+24:-Infinity)};
  });
  obstacles.push(...reserved);
  const labelBounds=p=>({left:p.x-23,right:p.x+23,top:p.y-10,bottom:p.y+10});
  const penalty=p=>{
    const box=labelBounds(p);
    return obstacles.reduce((total,b)=>total+Math.max(0,Math.min(box.right,b.right)-Math.max(box.left,b.left))*
      Math.max(0,Math.min(box.bottom,b.bottom)-Math.max(box.top,b.top)),0);
  };
  const best=candidates.reduce((a,b)=>penalty(b)<penalty(a)?b:a);
  reserved.push(labelBounds(best));
  ctx.save();
  const own=friendly(area.team),color=own?'#b4e3ad':'#ffd0ab';
  roundRect(ctx,best.x-22,best.y-9,44,18,6,own?'#304b45':'#5c4545',color,.9);
  if(own)circle(ctx,best.x-12,best.y,3.1,color);
  else line(ctx,[[best.x-12,best.y-4],[best.x-8,best.y],[best.x-12,best.y+4],[best.x-16,best.y]],null,1,true,color);
  label(ctx,`${Math.ceil(Math.max(0,num(area.life,num(area.maxLife,8))))}s`,best.x+5,best.y+.2,11,'#f1f6d9');
  ctx.restore();
}

function drawTrainingTarget(ctx,target,bounds=PORTRAIT_VIEW) {
  if(!target || !Number.isFinite(target.x) || !Number.isFinite(target.y))return;
  const x=target.x,y=target.y,r=clamp(num(target.radius,28),8,180);
  ctx.save();ctx.setLineDash([3,6]);
  circle(ctx,x,y,r,'rgba(250,223,143,.045)','rgba(255,233,166,.78)',1.2);
  ctx.setLineDash([]);
  for(let i=0;i<4;i++) {
    const a=i*Math.PI/2;
    line(ctx,[[x+Math.cos(a)*(r+3),y+Math.sin(a)*(r+3)],
      [x+Math.cos(a)*(r+8),y+Math.sin(a)*(r+8)]],'#f9dfa1',1.3);
  }
  const text=String(target.label||'목표 위치').slice(0,24),width=clamp(text.length*11+18,72,288);
  const lx=clamp(x,width/2+22,bounds.width-width/2-22),ly=clamp(y-r-16,31,bounds.height-31);
  roundRect(ctx,lx-width/2,ly-9,width,18,5,'rgba(45,62,60,.9)','rgba(244,215,143,.6)',.7);
  label(ctx,text,lx,ly,10.5,'#ffedb5');ctx.restore();
}

function drawDamageNumbers(ctx, effects, time, reducedMotion, entities=[],bounds=PORTRAIT_VIEW) {
  const groups = new Map();
  for (const effect of effects) {
    if ((effect.type || effect.kind) !== 'damage' || num(effect.amount) <= 0) continue;
    const progress = effectProgress(effect);
    if (progress >= 1) continue;
    const age = num(effect.age, progress*Math.max(.01,num(effect.maxLife,.7)));
    // Combine simultaneous nearby impacts, while preserving team and moment.
    const key = `${effect.targetTeam || effect.team}:${Math.round(num(effect.x)/58)}:${Math.round(num(effect.y)/46)}:${Math.floor((time-age)*5)}`;
    const group = groups.get(key);
    if (group) {
      group.x = (group.x*group.count+num(effect.x))/(group.count+1);
      group.y = (group.y*group.count+num(effect.y))/(group.count+1);
      group.count++; group.amount += num(effect.amount);
      group.progress = Math.min(group.progress,progress); group.age = Math.min(group.age,age);
    } else groups.set(key,{key,x:num(effect.x),y:num(effect.y),amount:num(effect.amount),count:1,progress,age,
      targetTeam:effect.targetTeam, team:effect.team});
  }
  // Eight labels at most; the most recent damage wins when fights get crowded.
  const visible = [...groups.values()].sort((a,b)=>a.age-b.age || b.amount-a.amount || a.key.localeCompare(b.key)).slice(0,8);
  const reserved=[],hpBoxes=entities.filter(e=>!e.destroyed&&num(e.hp,1)>0).map(e=>{
    const tower=e.kind==='tower'||e.type==='king'||e.type==='princess';
    if(tower) {
      const r=e.type==='king'?26:23,by=towerBarY(num(e.y),r,bounds.height);
      return {x:num(e.x)-44,y:by-6,w:88,h:31};
    }
    const r=clamp(num(e.radius,9),5,23),w=Math.max(21,Math.min(35,r*2.6));
    return {x:clamp(num(e.x),w/2+3,bounds.width-w/2-3)-w/2-2,
      y:clamp(num(e.y)-r-(e.flying?15:9),12,bounds.height-16)-2,w:w+4,h:8};
  });
  const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*
    Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  const offsets=[[0,0]];
  for(let step=1;step<=5;step++)offsets.push([0,-step*20],[0,step*20],[-step*28,0],[step*28,0],
    [-step*28,-step*20],[step*28,-step*20],[-step*28,step*20],[step*28,step*20]);
  ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.lineJoin='round';
  for (const group of visible) {
    const value = Math.ceil(group.amount), text = `−${value > 9999 ? '9999+' : value}`;
    const size = value >= 250 ? 14 : 12;
    ctx.font = `800 ${size}px ${UI_FONT}`;
    const width=Math.ceil(num(ctx.measureText(text)?.width,text.length*size*.66)+8),height=size+7;
    const ax=clamp(group.x,width/2+22,bounds.width-width/2-22),ay=clamp(group.y-18-(reducedMotion?0:group.progress*20),height/2+22,bounds.height-height/2-22);
    const candidates=offsets.map(([dx,dy])=>{
      const x=clamp(ax+dx,width/2+22,bounds.width-width/2-22),y=clamp(ay+dy,height/2+22,bounds.height-height/2-22);
      return {x:x-width/2,y:y-height/2,w:width,h:height,cx:x,cy:y};
    });
    const score=box=>reserved.reduce((sum,b)=>sum+overlap(box,b)*100,0)+hpBoxes.reduce((sum,b)=>sum+overlap(box,b),0);
    let best=candidates[0],bestScore=score(best);
    for(let i=1;i<candidates.length&&bestScore>0;i++) {
      const candidate=candidates[i],penalty=score(candidate);
      if(penalty<bestScore){best=candidate;bestScore=penalty;}
    }
    reserved.push(best);
    const x=best.cx,y=best.cy,alpha=Math.min(1,(1-group.progress)*3);
    if(Math.hypot(x-ax,y-ay)>12) {
      ctx.globalAlpha=alpha*.35;
      line(ctx,[[ax,ay+4],[x,y+size*.45]],'#fff0bf',.8);
    }
    ctx.globalAlpha = alpha;
    ctx.lineWidth=3; ctx.strokeStyle='#33464b'; ctx.strokeText(text,x,y);
    ctx.fillStyle=group.targetTeam ? friendly(group.targetTeam)?'#ffcab1':'#fff0ad':friendly(group.team)?'#fff0ad':'#ffcab1';
    ctx.fillText(text,x,y);
  }
  ctx.restore();
}

function drawTargetLinks(ctx, entities, hoveredEntityId, showRanges, selectedEntityId=null) {
  const byId = new Map(entities.map(e=>[e.id,e]));
  ctx.save();
  for (const entity of entities) {
    const focused=entity.id===hoveredEntityId || entity.id===selectedEntityId;
    if ((!showRanges && !focused) || num(entity.hp,1)<=0 || entity.destroyed) continue;
    const target = byId.get(entity.targetId);
    if (!target || target.destroyed || num(target.hp,1)<=0) continue;
    const x=num(entity.x),y=num(entity.y),tx=num(target.x),ty=num(target.y);
    const d=Math.hypot(tx-x,ty-y),reach=targetReach(entity,target);
    const inReach=d<=reach+1e-7 && num(entity.stunRemaining)<=0 && num(entity.deployRemaining)<=0 && entity.active!==false;
    ctx.setLineDash(inReach?[]:[3,5]);
    line(ctx,[[x,y],[tx,ty]],focused?'rgba(255,238,169,.9)':friendly(entity.team)?'rgba(36,118,161,.42)':'rgba(150,66,66,.42)',1);
    circle(ctx,tx,ty,4,null,'rgba(255,241,188,.65)',1);
    if(focused && d>1) {
      const ex=x+(tx-x)/d*reach,ey=y+(ty-y)/d*reach;
      const px=-(ty-y)/d*5,py=(tx-x)/d*5;
      ctx.setLineDash([]);line(ctx,[[ex-px,ey-py],[ex+px,ey+py]],'#ffefbb',1.6);
    }
  }
  ctx.restore();
}

function placementPreview(game,card,pointer,team='player') {
  const id=card.id||card.cardId,x=pointer.x,y=pointer.y;
  if(!Number.isFinite(x)||!Number.isFinite(y))return {ok:false,team,x:num(x),y:num(y),positions:[],affectedTargets:[]};
  // Gameplay owns legality, formation, shore constraints and versioned rules.
  // In particular, a stale pointer.valid must never override the live engine.
  if(typeof game?.previewDeployment==='function') {
    const result=game.previewDeployment(team,id,x,y);
    return {...result,team,x,y,positions:arr(result?.positions),affectedTargets:arr(result?.affectedTargets)};
  }
  const result=typeof game?.canDeploy==='function'?game.canDeploy(team,id,x,y):{ok:pointer.valid!==false};
  const r=num(card.radius,11),count=num(card.count,1);
  const offsets=fallbackFormationOffsets(count);
  // Static/read-only fixtures have no engine; retain a conservative fallback.
  const positions=isSpellCard(card)?[]:offsets.map(([ox,oy])=>({x:clamp(x+ox,r,W-r),y:clamp(y+oy*(team==='enemy'?-1:1),18,H-18),radius:r,flying:Boolean(card.flying)}));
  return {...result,team,x,y,positions,affectedTargets:[]};
}

function drawImpactTargets(ctx,preview,card,bounds=PORTRAIT_VIEW) {
  if(!preview?.ok || !isSpellCard(card))return;
  const targets=arr(preview.affectedTargets);
  if(!targets.length)return;
  const persistent=Boolean(card.persistent),accent=preview.team==='enemy'?'#ffc3ae':persistent?'#e2efad':'#fff0b4';
  ctx.save();ctx.lineCap='round';
  for(const target of targets) {
    const x=num(target.x),y=num(target.y),r=Math.max(7,num(target.radius,10)+5),l=clamp(r*.36,4,10);
    for(const [sx,sy]of[[-1,-1],[1,-1],[-1,1],[1,1]]) {
      line(ctx,[[x+sx*(r-l),y+sy*r],[x+sx*r,y+sy*r],[x+sx*r,y+sy*(r-l)]],accent,1.8);
    }
  }
  // Towers are always the useful numeric case; keep mobile swarm previews quiet.
  const labels=targets.filter(target=>target.kind==='tower'||target.type==='king'||target.type==='princess')
    .sort((a,b)=>Math.hypot(a.x-preview.x,a.y-preview.y)-Math.hypot(b.x-preview.x,b.y-preview.y)).slice(0,3);
  for(const target of labels) {
    const damage=Math.max(0,Math.ceil(num(target.damage))),text=persistent?`−${damage}/초`:`−${damage}`;
    const width=Math.max(40,text.length*6.8+15),x=clamp(num(target.x),width/2+22,bounds.width-width/2-22);
    const y=clamp(num(target.y)-num(target.radius,25)-17,31,bounds.height-31);
    roundRect(ctx,x-width/2,y-9,width,18,5,'#4b5042',accent,.8);
    label(ctx,text,x,y,11,accent);
  }
  ctx.restore();
}

/** Owns only rendering and resizing. The application owns its animation loop. */
export class ArenaRenderer {
  constructor(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('ArenaRenderer needs a canvas element.');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Canvas 2D is not available.');
    this.orientation='portrait';this.viewWidth=W;this.viewHeight=H;
    this.width = W; this.height = H; this.scale = 1; this.offsetX = 0; this.offsetY = 0;
    this.dpr = 1; this.arenaTheme='grove';
    this.background = makeBackground(this.arenaTheme);
    this.backgroundCache = new Map([[this.arenaTheme,this.background]]);
    this.resize = this.resize.bind(this);
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(this.resize); this.observer.observe(canvas);
    } else if (typeof window !== 'undefined') window.addEventListener('resize', this.resize, { passive: true });
  }

  resize() {
    const rect=viewRect(this.canvas,this.orientation),bounds=viewSize(this.orientation);
    this.viewWidth=bounds.width;this.viewHeight=bounds.height;
    this.width=rect.width;this.height=rect.height;
    this.dpr = clamp(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 1, 3);
    const physicalW = Math.max(1, Math.round(this.width * this.dpr));
    const physicalH = Math.max(1, Math.round(this.height * this.dpr));
    if (this.canvas.width !== physicalW) this.canvas.width = physicalW;
    if (this.canvas.height !== physicalH) this.canvas.height = physicalH;
    this.scale=rect.scale;this.offsetX=rect.offsetX;this.offsetY=rect.offsetY;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  setOrientation(orientation) {
    this.orientation=orientationName(orientation);
    this.resize();
    return this;
  }

  /** World point to local canvas CSS pixels (add rect.left/top for client pixels). */
  worldToScreen(x,y) {
    const rect=viewRect(this.canvas,this.orientation),point=projectPoint(num(x),num(y),this.orientation);
    return {x:rect.offsetX+point.x*rect.scale,y:rect.offsetY+point.y*rect.scale};
  }

  screenToWorld(clientX, clientY) {
    // Derive from the live rect so a pointer during a layout transition stays correct.
    const rect=viewRect(this.canvas,this.orientation);
    return unprojectPoint((num(clientX)-rect.left-rect.offsetX)/rect.scale,
      (num(clientY)-rect.top-rect.offsetY)/rect.scale,this.orientation);
  }

  draw(game, { selectedCard = null, pointer = null, showRanges = false, reducedMotion = false, hoveredEntityId = null, selectedEntityId = null, trainingTarget = null, arenaTheme = 'grove', deploymentTeam = 'player' } = {}) {
    const ctx = this.ctx;
    // A CSS layout may change before ResizeObserver runs. Render and input must
    // still agree in that same frame; DPR never participates in pointer maths.
    const live=viewRect(this.canvas,this.orientation);
    const dpr=clamp(typeof window!=='undefined'?window.devicePixelRatio||1:1,1,3);
    if(live.width!==this.width || live.height!==this.height || dpr!==this.dpr)this.resize();
    const bounds=viewSize(this.orientation),project=entity=>projectEntity(entity,this.orientation);
    const nextTheme=themeName(arenaTheme);
    if(this.arenaTheme!==nextTheme) {
      if(!this.backgroundCache.has(nextTheme))this.backgroundCache.set(nextTheme,makeBackground(nextTheme));
      this.arenaTheme=nextTheme;this.background=this.backgroundCache.get(nextTheme);
    }
    const theme=ARENA_THEMES[this.arenaTheme];
    const state = game?.state || game || {};
    deploymentTeam=deploymentTeam==='enemy'?'enemy':'player';
    const developer=selectedCard?game?.getDeveloperState?.():null;
    const freePlacement=Boolean(developer?.enabled&&developer.cheats?.freePlacement);
    const t = reducedMotion ? 0 : num(state.time);
    // Authoritative placement queries receive world coordinates before projection.
    const preview=projectPreview(selectedCard&&pointer?placementPreview(game,selectedCard,pointer,deploymentTeam):null,this.orientation);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.outer; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.offsetX, this.dpr * this.offsetY);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, bounds.width, bounds.height); ctx.clip();
    ctx.save();
    if(this.orientation==='landscape')ctx.transform(0,-1,1,0,0,W);
    ctx.drawImage(this.background, 0, 0, W, H);
    // River light is deterministic and freezes with the game's own clock.
    ctx.save(); ctx.beginPath(); ctx.rect(21, 303, 438, 34); ctx.clip();
    for (let i = 0; i < 15; i++) {
      const x = ((i * 41 + t * 9) % 485) - 10, y = 307 + (i * 13 % 25);
      const wave = reducedMotion ? 0 : Math.sin(t * 1.8 + i) * 1.5;
      line(ctx, [[x,y],[x+8,y+wave],[x+18,y]], i % 3 ? theme.waveLight : theme.waveDark, 1.3);
    }
    ctx.restore();
    drawBridge(ctx, 120,theme); drawBridge(ctx, 360,theme);
    this.drawFlags(t, reducedMotion);
    if (selectedCard) this.drawDeploymentTint(state, selectedCard,deploymentTeam,freePlacement);
    ctx.restore();
    // Dynamic objects use projected anchors, not a rotated drawing context.
    // Their original sprite pose and all labels therefore remain upright.
    const towers=arr(state.towers).map(project),projectedUnits=arr(state.units).map(project);
    const areas=arr(state.areas).map(project);
    areas.forEach(area=>drawArea(ctx,area,t,reducedMotion));
    drawTrainingTarget(ctx,trainingTarget&&Number.isFinite(trainingTarget.x)&&Number.isFinite(trainingTarget.y)?project(trainingTarget):null,bounds);
    if (showRanges) {
      ctx.save(); ctx.setLineDash([5,7]);
      towers.forEach(tower => {
        if (tower.destroyed || tower.active === false) return;
        circle(ctx, num(tower.x), num(tower.y), attackRingRadius(tower), null,
          friendly(tower.team) ? 'rgba(38,109,134,.17)' : 'rgba(171,76,77,.16)', 1);
      });
      ctx.restore();
    }
    const allEntities = [...towers,...projectedUnits];
    if (showRanges || hoveredEntityId != null || selectedEntityId != null)
      drawTargetLinks(ctx,allEntities,hoveredEntityId,showRanges,selectedEntityId);
    for(const tower of towers) {
      const hovered=tower.id===hoveredEntityId,selected=tower.id===selectedEntityId;
      if ((hovered||selected) && !tower.destroyed && num(tower.hp,1)>0) {
        drawEntityFocus(ctx,tower,hovered,selected);
        ctx.save(); ctx.setLineDash([3,5]);
        circle(ctx,num(tower.x),num(tower.y),attackRingRadius(tower),null,'rgba(255,238,169,.45)',1);
        ctx.restore();
      }
    }
    towers.filter(tower => tower.destroyed || num(tower.hp, 1) <= 0).forEach(tower => drawTower(ctx, tower, t, reducedMotion,bounds));
    towers.filter(tower => !tower.destroyed && num(tower.hp, 1) > 0).forEach(tower => drawTower(ctx, tower, t, reducedMotion,bounds));
    const units = projectedUnits.slice().sort((a,b) => Number(Boolean(a.flying)) - Number(Boolean(b.flying)) || num(a.y) - num(b.y) || String(a.id).localeCompare(String(b.id)));
    units.forEach(unit => drawUnit(ctx, unit, t, reducedMotion, showRanges || unit.id===hoveredEntityId || unit.id===selectedEntityId,
      unit.id===hoveredEntityId,unit.id===selectedEntityId,bounds));
    drawFormationBadges(ctx,units,bounds);
    arr(state.projectiles).map(project).forEach(p => drawProjectile(ctx, p, reducedMotion));
    const effects = arr(state.effects).map(project);
    effects.forEach(effect => drawEffect(ctx, effect, reducedMotion));
    drawDamageNumbers(ctx,effects,num(state.time),reducedMotion,allEntities,bounds);
    const timerBounds=[];
    areas.forEach(area=>drawAreaTimer(ctx,area,allEntities,timerBounds,bounds));
    if (selectedCard && preview) {
      drawImpactTargets(ctx,preview,selectedCard,bounds);
      this.drawGhost(selectedCard, {...pointer,x:preview.x,y:preview.y,valid:Boolean(preview.ok)}, t, reducedMotion,preview);
    }
    ctx.restore();
  }

  drawFlags(t, reducedMotion) {
    const ctx = this.ctx;
    for (const [x,y,team] of [[42,136,'enemy'],[438,136,'enemy'],[42,504,'player'],[438,504,'player']]) {
      line(ctx, [[x,y-16],[x,y+14]], '#8e8162', 2);
      circle(ctx, x, y-17, 2, '#ebc577');
      const sway = reducedMotion ? 0 : Math.sin(t * 2 + y) * 1.5;
      const dir = x < 240 ? 1 : -1;
      line(ctx, [[x,y-14],[x+dir*13,y-12+sway],[x+dir*10,y-4+sway],[x,y-5]],
        null, 1, true, teamColor(team));
      circle(ctx, x+dir*5,y-9+sway*.4,1.5,'#f6e4ae');
    }
  }

  drawDeploymentTint(state, card,team='player',freePlacement=false) {
    const ctx = this.ctx;
    const isSpell = isSpellCard(card),home=team!=='enemy';
    const tint=home?'rgba(67,171,203,.105)':'rgba(231,123,104,.105)';
    ctx.save(); roundRect(ctx, 22, 21, 436, 598, 12); ctx.clip();
    if (isSpell) {
      ctx.fillStyle = home?'rgba(234,196,109,.045)':'rgba(231,123,104,.065)'; ctx.fillRect(22,21,436,598);
    } else {
      ctx.fillStyle = tint; ctx.fillRect(22,home?340:21,436,279);
      ctx.fillStyle = freePlacement?tint:'rgba(25,45,48,.105)'; ctx.fillRect(22,home?21:340,436,home?278:279);
      // Forward territory belongs to the acting team after an opposing tower falls.
      if(!freePlacement)arr(state.towers).forEach(tower => {
        if (tower.team!==team && tower.type !== 'king' && (tower.destroyed || num(tower.hp,1) <= 0)) {
          ctx.fillStyle = home?'rgba(67,171,203,.11)':'rgba(231,123,104,.11)';
          ctx.fillRect(num(tower.x) - 77,home?115:340,154,185);
        }
      });
      // Collision halos mirror the engine's forbidden placement radius.
      const blockers = arr(state.towers).filter(tower=>!tower.destroyed && num(tower.hp,1)>0);
      if (card.type==='building' || card.kind==='building') blockers.push(...arr(state.units).filter(unit=>
        (unit.isBuilding || unit.kind==='building') && num(unit.hp,1)>0));
      for (const blocker of blockers) {
        const radius = num(blocker.radius,25)+num(card.radius,11)+3;
        circle(ctx,num(blocker.x),num(blocker.y),radius,'rgba(44,61,64,.09)','rgba(255,212,178,.24)',1);
      }
      ctx.setLineDash([6,7]);
      if(!freePlacement)line(ctx, [[24,home?345:295],[456,home?345:295]],home?'rgba(195,240,239,.62)':'rgba(255,197,178,.62)',1.2);
    }
    ctx.restore();
  }

  drawGhost(card, pointer, t, reducedMotion,preview=null) {
    const ctx = this.ctx, x = num(pointer.x), y = num(pointer.y);
    const bounds=viewSize(this.orientation);
    const id = card.id || card.cardId || 'knight';
    const team=preview?.team==='enemy'?'enemy':'player',home=team==='player';
    const isSpell = isSpellCard(card);
    const count=num(card.count,1),r=clamp(num(card.radius,11),5,23);
    const offsets=fallbackFormationOffsets(count);
    const positions=preview?arr(preview.positions):isSpell?[]:offsets.map(([ox,oy])=>({x:clamp(x+ox,r,bounds.width-r),y:clamp(y+oy,18,bounds.height-18),radius:r,flying:Boolean(card.flying)}));
    let radius = isSpell ? Math.max(0,num(card.spellRadius, num(card.radius, num(card.splashRadius, id === 'arrows' ? 55 : 42))))
      : clamp(num(card.radius, 12) + 5 + (num(card.count,1)>1?12:0), 12, 48);
    if(!isSpell && positions.length)radius=Math.max(radius,...positions.map(p=>Math.hypot(num(p.x)-x,num(p.y)-y)+num(p.radius,r)+3));
    const valid = pointer.valid !== false;
    const color = valid ? home?'#dcf6c0':'#ffb8a5' : '#ffd0b1';
    ctx.save();
    if (!isSpell && (card.type==='building'||card.kind==='building') && num(card.range)>0) {
      ctx.setLineDash([3,6]);
      for(const position of positions)circle(ctx,num(position.x),num(position.y),num(card.range)+num(card.radius),null,
        valid?home?'rgba(193,238,230,.5)':'rgba(255,181,159,.5)':'rgba(249,183,153,.35)',1);
      ctx.setLineDash([]);
    }
    circle(ctx, x, y, radius, valid ? home?'rgba(121,221,163,.18)':'rgba(239,132,112,.18)' : 'rgba(226,101,83,.22)', color, 1.8);
    ctx.setLineDash([4,5]); ctx.lineDashOffset = reducedMotion ? 0 : -t * 9;
    circle(ctx, x, y, radius + 4, null, valid ? home?'rgba(226,250,202,.55)':'rgba(255,183,164,.55)' : 'rgba(255,188,154,.6)', 1);
    ctx.setLineDash([]);
    line(ctx, [[x-5,y],[x+5,y]], color, 1.2); line(ctx, [[x,y-5],[x,y+5]], color, 1.2);
    if (!isSpell) {
      ctx.save(); ctx.globalAlpha = valid ? .65 : .38; ctx.translate(x, y);
      const size = card.type==='building'?r*2.35:['giant','hog_rider'].includes(id)?r*2.15:r*2.8;
      for (const position of positions) {
        const dx=num(position.x)-x,dy=num(position.y)-y;
        if(Math.hypot(dx,dy)>22) {
          ctx.setLineDash([2,4]);line(ctx,[[0,0],[dx,dy]],color,.8);ctx.setLineDash([]);
        }
        circle(ctx,dx,dy,num(position.radius,r),home?'rgba(85,185,208,.12)':'rgba(235,123,104,.12)',color,1);
        ctx.save(); ctx.translate(dx,dy-(position.flying?7:0));
        drawSprite(ctx,id,size,team,t,false); ctx.restore();
      }
      ctx.restore();
      if(count>1) {
        const bx=clamp(x+radius-3,37,bounds.width-37),by=clamp(y-radius+2,31,bounds.height-31);
        roundRect(ctx,bx-13,by-9,26,18,6,valid?home?'#375e59':'#75483f':'#7a514b',color,.8);
        label(ctx,`×${positions.length||count}`,bx,by,11,'#fff3d4');
      }
    } else if(valid) {
      const count=arr(preview?.affectedTargets).length;
      const text=`현재 위치 · ${count?`${count} 대상`:'대상 없음'}`;
      const width=clamp(text.length*7+18,110,185),lx=clamp(x,width/2+22,bounds.width-width/2-22);
      const ly=clamp(y-radius-17<31?y+radius+17:y-radius-17,31,bounds.height-31);
      roundRect(ctx,lx-width/2,ly-10,width,20,6,'rgba(40,62,58,.93)','#d6e9be',.7);
      label(ctx,text,lx,ly,10.5,'#f2f4d2');
    }
    if (!valid) {
      const ix=clamp(x,31,bounds.width-31),iy=clamp(y-radius-12,31,bounds.height-31);
      circle(ctx, ix, iy, 8, '#c66154', '#ffdbbf', 1);
      line(ctx, [[ix-3,iy-3],[ix+3,iy+3]], '#fff4d9', 1.8);
      line(ctx, [[ix+3,iy-3],[ix-3,iy+3]], '#fff4d9', 1.8);
    }
    ctx.restore();
  }

  destroy() {
    this.observer?.disconnect();
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.resize);
    this.background = null;
    this.backgroundCache.clear();
  }
}

const ICONS = {
  phalanx: '<path d="M7 8v47m17-49v49M41 6v49M57 8v47" stroke="#b7a06f" stroke-width="2"/><path d="m7 2-4 9h8zm17-2-4 9h8zm17 0-4 9h8zm16 2-4 9h8z" fill="#e6ead9" stroke="#637e87" stroke-width=".8"/><g stroke="#597580" stroke-width="1.3"><path d="M5 25V17q0-8 8-8t8 8v8zM24 23V15q0-8 8-8t8 8v8zM43 25V17q0-8 8-8t8 8v8z" fill="#cbd7d5"/><path d="M6 17h14v5H6zm19-2h14v5H25zm19 2h14v5H44z" fill="#3f626f"/><path d="M3 26h20v16l-10 7-10-7zm19-2h20v16l-10 7-10-7zm19 2h20v16l-10 7-10-7z" fill="#3e8eaa" stroke="#e4ca86" stroke-width="1.8"/><path d="M5 42V33q0-8 8-8t8 8v9zM24 40V31q0-8 8-8t8 8v9zM43 42V33q0-8 8-8t8 8v9z" fill="#d6dfdc"/><path d="M6 33h14v5H6zm19-2h14v5H25zm19 2h14v5H44z" fill="#3d5967"/><path d="M3 42h20v14l-10 7-10-7zm19-2h20v16l-10 7-10-7zm19 2h20v14l-10 7-10-7z" fill="#55b9d0" stroke="#f0d799" stroke-width="1.8"/></g><path d="M13 45v13m-6-7h12m13-8v15m-6-8h12m13-5v13m-6-7h12" stroke="#f3e6b6" stroke-width="1.7"/><path d="M11 24h4v8h-4zm19-2h4v8h-4zm19 2h4v8h-4z" fill="#eabb62"/>',
  hog_rider: '<path d="M9 52q-3-20 23-20t23 20v9H9z" fill="#bb8a68" stroke="#765b48" stroke-width="2"/><path d="m13 39-8-10 14 3m32 7 8-10-14 3" fill="#d6a580" stroke="#84624c" stroke-width="2"/><ellipse cx="32" cy="53" rx="15" ry="9" fill="#e0ae8c"/><circle cx="27" cy="53" r="2" fill="#8b6753"/><circle cx="37" cy="53" r="2" fill="#8b6753"/><path d="m18 48-6-9 2 13m32-4 6-9-2 13" fill="#f8e8c8"/><path d="M22 37V26q0-8 10-8t10 8v11" fill="#a46a4d"/><circle cx="32" cy="16" r="10" fill="#b87c58" stroke="#78543d" stroke-width="1.5"/><path d="M29 3h6v13h-6z" fill="#2e3940"/><path d="M25 31h14v6H25z" fill="#55b9d0"/><path d="m42 30 9-9" stroke="#b87c58" stroke-width="7" stroke-linecap="round"/><path d="M52 12v30" stroke="#b79461" stroke-width="4"/><rect x="44" y="6" width="17" height="12" rx="2" fill="#c5d8d8" stroke="#547381" stroke-width="2"/><path d="M51 7h4v10h-4z" fill="#eabb62"/>',
  spear_goblins: '<path d="M18 57V41q0-10 13-10t13 10v16" fill="#427a89"/><path d="m18 19-13-4 12 20m26-16 12-4-11 20" fill="#8dc779" stroke="#4e8752" stroke-width="2"/><ellipse cx="31" cy="27" rx="14" ry="16" fill="#95cc7b"/><path d="M18 19h26v5H18z" fill="#62bdd2"/><path d="m23 27 5 1m6 0 5-1" stroke="#4b714c" stroke-width="2"/><circle cx="26" cy="29" r="2" fill="#fff2ba"/><circle cx="37" cy="29" r="2" fill="#fff2ba"/><path d="M26 36h10l-3 5-2-3-2 3z" fill="#f1edc9"/><path d="M53 17v43" stroke="#bd9b68" stroke-width="4"/><path d="m53 3-7 18 7-4 7 4z" fill="#e1e9dc" stroke="#547884" stroke-width="1.5"/><path d="M48 24h10" stroke="#eac574" stroke-width="3"/><path d="m43 42 10-4" stroke="#91c777" stroke-width="6" stroke-linecap="round"/>',
  duelist: '<path d="m18 34-9 23 23-5 23 5-9-23" fill="#306f8b" stroke="#264c62" stroke-width="2"/><path d="M17 56V39q0-11 15-11t15 11v17" fill="#90a6b0" stroke="#4b6879" stroke-width="2"/><path d="m22 40 10 7 10-7" fill="none" stroke="#d9e9e7" stroke-width="3"/><path d="M19 29V20q0-14 13-14t13 14v16H19" fill="#bfced3" stroke="#516c7c" stroke-width="2"/><path d="M20 21h24v11H20z" fill="#2d485d"/><path d="M24 26h6m4 0h6" stroke="#8de5f4" stroke-width="2.5"/><path d="m32 2-5 12h10z" fill="#eabb62"/><path d="M22 51h20v5H22z" fill="#ddbe7b"/><path d="m53 12-5 11v25h10V23z" fill="#d9e7e8" stroke="#587583" stroke-width="1.5"/><path d="M45 45h16v4H45z" fill="#edc873"/><path d="M51 49h4v11h-4z" fill="#986f4d"/>',
  zap: '<circle cx="32" cy="33" r="24" fill="#5ca1bb" opacity=".28"/><path d="m38 4-23 32h14l-4 25 26-37H36z" fill="#ffeab0" stroke="#92d4e8" stroke-width="2"/><path d="m35 17-11 15h12l-4 14 12-18H33z" fill="#fff9da"/><path d="m12 10 5 9M5 31l9 2m36-22-6 8m6 29 7 6m-42-5-7 6" stroke="#c4f3f6" stroke-width="2.5" stroke-linecap="round"/><circle cx="54" cy="34" r="2.5" fill="#d4f8ff"/>',
  poison: '<circle cx="12" cy="16" r="5" fill="#b8d78b" opacity=".7"/><circle cx="51" cy="10" r="4" fill="#b8d78b" opacity=".6"/><circle cx="52" cy="26" r="6" fill="#a4ca78" opacity=".5"/><path d="M24 16h16v10l9 8v21q0 6-17 6t-17-6V34l9-8z" fill="#aa8ac1" stroke="#6a547d" stroke-width="2"/><path d="M20 38h24v16q-12 7-24 0z" fill="#b1cb78"/><rect x="22" y="8" width="20" height="11" rx="3" fill="#b18b5a" stroke="#806e4b" stroke-width="1.5"/><path d="M25 26v9l-5 5" fill="none" stroke="#dfc9eb" stroke-width="2.5" stroke-linecap="round"/><path d="M25 46q-2-8 7-8t7 8l-3 3v5h-8v-5z" fill="#f2edcd"/><circle cx="29" cy="45" r="2" fill="#657748"/><circle cx="35" cy="45" r="2" fill="#657748"/><path d="m32 48-2 3h4z" fill="#84965b"/>',
  ice_spirit: '<path d="m18 55-9-17 5-21 9 8L28 3l12 15 8-8 8 27-7 18z" fill="#c9f1ef" stroke="#79bdd6" stroke-width="2"/><ellipse cx="32" cy="39" rx="17" ry="20" fill="#7cd0e3"/><path d="m13 37-9-5 4 13 11 2m32-10 9-5-4 13-11 2" fill="#bdeef1" stroke="#84ccdc" stroke-width="1.5"/><ellipse cx="26" cy="34" rx="3" ry="4" fill="#2d5874"/><ellipse cx="39" cy="34" rx="3" ry="4" fill="#2d5874"/><path d="m27 43 5 4 6-5" fill="none" stroke="#ecffff" stroke-width="3" stroke-linecap="round"/><path d="M23 53h19v5H23z" fill="#57afcf"/><path d="M10 8v10m-5-5h10m34 42v9m-4-4.5h8" stroke="#d9f8ff" stroke-width="1.5"/>',
  knight: '<path d="M17 55V39q0-9 15-9t15 9v16" fill="#55b9d0"/><path d="M19 27q0-16 13-16t13 16v10H19" fill="#bdcfd4" stroke="#526d7a" stroke-width="2"/><path d="M20 26h24v9H20z" fill="#e4ebdf"/><path d="M23 29h18" stroke="#374f5e" stroke-width="3"/><path d="M30 10h4v13h-4z" fill="#eabb62"/><path d="M11 35l14 1v14l-7 7-7-7z" fill="#31809e" stroke="#edd28e" stroke-width="2"/><path d="M18 39v11m-4-6h8" stroke="#eabb62" stroke-width="2"/><path d="M50 14l-3 7v24h6V21z" fill="#e4edf0" stroke="#56707a"/><path d="M44 43h12v4H44z" fill="#eabb62"/><path d="M48 47h4v9h-4z" fill="#8c654e"/>',
  archers: '<path d="M18 55V39q0-9 14-9t14 9v16" fill="#639d84"/><path d="M20 30q-2-18 12-18t12 18v12H20z" fill="#aa648e"/><circle cx="32" cy="28" r="10" fill="#efcaa5"/><path d="M21 25q2-15 20-7l3 8-8-4-15 3" fill="#ad6691"/><path d="M23 43h18v5H23z" fill="#e3c87b"/><path d="M49 15q18 19 0 39" fill="none" stroke="#b18456" stroke-width="3"/><path d="M49 15v39" stroke="#f4e4bb"/><path d="M40 33h17m-4-4l5 4-5 4" fill="none" stroke="#ebeee1" stroke-width="2"/>',
  giant: '<path d="M12 57V39q0-13 20-13t20 13v18" fill="#a77c51" stroke="#71563c" stroke-width="2"/><circle cx="32" cy="25" r="15" fill="#eec295"/><path d="M17 21q0-15 15-15t15 16l-9-7-21 6" fill="#d88e43"/><path d="M21 30q11 10 22 0v9H21" fill="#c58443"/><circle cx="11" cy="41" r="8" fill="#eec295"/><circle cx="53" cy="41" r="8" fill="#eec295"/><path d="M15 48h34v6H15z" fill="#47798e"/><path d="M28 47h8v8h-8z" fill="#edc365"/><path d="M25 24h3m8 0h3" stroke="#70503d" stroke-width="2"/>',
  goblins: '<path d="M18 56V41q0-10 14-10t14 10v15" fill="#467b87"/><path d="M19 17L6 15l12 18m27-16 13-2-12 18" fill="#79ae68" stroke="#4f8655" stroke-width="2"/><ellipse cx="32" cy="26" rx="15" ry="16" fill="#8cc578"/><path d="M20 23l9 2m6 0 9-2" stroke="#48714d" stroke-width="2"/><ellipse cx="26" cy="26" rx="3" ry="4" fill="#f3e6a7"/><ellipse cx="38" cy="26" rx="3" ry="4" fill="#f3e6a7"/><path d="M26 25v2m12-2v2" stroke="#2f4e40" stroke-width="2"/><path d="M27 35h10l-3 5-2-3-2 3z" fill="#f4edcf"/><path d="M48 37l5-12 3 12-4 15-4-1z" fill="#dce9e5" stroke="#617b7e"/>',
  fireball: '<path d="M18 52C6 42 10 27 20 20l-1 12C29 27 24 12 36 5c-2 14 15 16 12 30l9-8c5 18-5 31-20 33-8 1-15-2-19-8" fill="#df7745"/><path d="M24 51c-11-10-7-19 0-26l1 11c5-3 8-10 8-17 12 12 17 23 7 33-4 5-11 5-16-1" fill="#f4b651"/><path d="M28 51c-6-7-1-15 5-21 0 8 7 10 7 16 0 7-7 11-12 5" fill="#fff0ac"/><circle cx="12" cy="15" r="2" fill="#e8ab51"/><circle cx="53" cy="18" r="2.5" fill="#e8ab51"/>',
  arrows: '<g stroke-linejoin="round"><path d="M17 53L14 16M32 55V10m15 43 3-37" stroke="#bc9667" stroke-width="3"/><path d="m14 7-6 14 6-4 7 3zm18-4-7 15 7-4 7 4zm19 4-8 13 7-3 6 4z" fill="#e5eee4" stroke="#65818b" stroke-width="1.5"/><path d="m17 43-7 7 1 9 7-5 7 5-1-9zm15 0-7 8v10l7-6 7 6V51zm16 0-8 7-1 9 8-5 6 5 1-9z" fill="#d89360"/></g>',
  musketeer: '<path d="M17 56V40q0-10 15-10t15 10v16" fill="#55b9d0"/><circle cx="32" cy="28" r="11" fill="#ecc5a4"/><path d="M21 13q11-8 22 0v12H21" fill="#79668c" stroke="#51465f" stroke-width="2"/><ellipse cx="32" cy="25" rx="16" ry="4" fill="#9c87ab"/><path d="M39 13l4-9" stroke="#e9c368" stroke-width="4"/><path d="M21 45h22v5H21z" fill="#e9cd82"/><path d="M49 17h6v29h-6z" fill="#a0b5b9" stroke="#486371" stroke-width="1.5"/><path d="M46 41h11v16H46z" fill="#927052"/><path d="M48 15h8v5h-8z" fill="#d4e2dd"/>',
  bomber: '<path d="M19 57V40q0-7 11-7t12 7v17" fill="#527b8e"/><path d="M20 45l-7 10m20-10 7 10" stroke="#e9e3ce" stroke-width="4" stroke-linecap="round"/><path d="M18 28q-4-19 12-19t12 19l-5 5v9H23v-9z" fill="#f4e8ca" stroke="#9ca490" stroke-width="1.5"/><ellipse cx="24" cy="25" rx="4" ry="5" fill="#344b54"/><ellipse cx="36" cy="25" rx="4" ry="5" fill="#344b54"/><path d="M30 29l-3 5h6z" fill="#697b75"/><circle cx="46" cy="43" r="13" fill="#354b5b" stroke="#233b48" stroke-width="2"/><circle cx="42" cy="39" r="4" fill="#6e8790"/><path d="m50 31 3-8 5 2" fill="none" stroke="#ccb581" stroke-width="2"/><path d="m57 22 4 3-4 3" fill="#fac66b"/>',
  minions: '<path d="M24 27 5 12l4 30 9-5 5 12m17-22 19-15-4 30-9-5-5 12" fill="#828bc1" stroke="#536e99" stroke-width="2"/><ellipse cx="32" cy="41" rx="11" ry="16" fill="#657fae"/><circle cx="32" cy="24" r="13" fill="#91a4d1" stroke="#57719d" stroke-width="1.5"/><path d="m21 17-3-13 10 9m15 4 3-13-10 9" fill="#e4e6cf"/><path d="m23 22 6 2m6 0 6-2" stroke="#405b8c" stroke-width="2"/><circle cx="26" cy="26" r="2.5" fill="#fff2b6"/><circle cx="38" cy="26" r="2.5" fill="#fff2b6"/><path d="M26 47h12v5H26z" fill="#62c5d8"/><path d="M29 33h6l-3 4z" fill="#e5eddf"/>',
  cannon: '<path d="M11 38h42v20H11z" fill="#c3a677" stroke="#806d4c" stroke-width="2"/><rect x="6" y="37" width="8" height="22" rx="3" fill="#344e5b"/><rect x="50" y="37" width="8" height="22" rx="3" fill="#344e5b"/><circle cx="32" cy="39" r="16" fill="#77929b" stroke="#3a5868" stroke-width="2"/><path d="M23 12h18v30H23z" fill="#698692" stroke="#385666" stroke-width="2"/><rect x="21" y="9" width="22" height="12" rx="4" fill="#aec2c5" stroke="#385666" stroke-width="2"/><ellipse cx="32" cy="13" rx="7" ry="3" fill="#294352"/><path d="M19 51h26v5H19z" fill="#55b9d0"/><circle cx="13" cy="42" r="2" fill="#e6c783"/><circle cx="51" cy="42" r="2" fill="#e6c783"/>',
  valkyrie: '<path d="M17 56V40q0-10 15-10t15 10v16" fill="#5893a3"/><path d="M17 27q-1-18 15-18t15 18v18H17z" fill="#db8a42" stroke="#a46b35" stroke-width="1.5"/><circle cx="32" cy="27" r="10" fill="#eec5a4"/><path d="m19 20 13-7 13 7" fill="none" stroke="#d9e5e3" stroke-width="3"/><path d="M19 33v20m26-20v20" stroke="#d28339" stroke-width="7" stroke-linecap="round"/><path d="M25 47h14v4H25z" fill="#e8c779"/><path d="M51 18v40" stroke="#8b6749" stroke-width="4"/><path d="m50 21-12-7v19l12-5h2l11 5V14l-11 7z" fill="#cfdfdf" stroke="#67818c" stroke-width="1.5"/><circle cx="51" cy="25" r="3" fill="#eabb62"/>',
  skeletons: '<path d="M31 32v17m-10-9h20m-16 5h12m-10 4-7 10m16-10 7 10m-21-20-7 10m25-10 7 10" fill="none" stroke="#e8dfc8" stroke-width="4" stroke-linecap="round"/><path d="M19 27q-4-20 13-20t13 20l-6 6v9H25v-9z" fill="#f4ead1" stroke="#9aa38f" stroke-width="1.5"/><ellipse cx="26" cy="25" rx="4" ry="5" fill="#344c56"/><ellipse cx="38" cy="25" rx="4" ry="5" fill="#344c56"/><path d="m32 29-3 5h6z" fill="#6c7d72"/><path d="M27 38v4m5-4v4m5-4v4" stroke="#9fa68f"/><path d="M24 47h16v4H24z" fill="#55b9d0"/><path d="M53 25l-3 7v19h6V32z" fill="#e0e9e4" stroke="#6a8286"/><path d="M47 48h12v3H47z" fill="#e4bd6e"/>',
};

/** Safe SVG HTML: all artwork is static and unknown IDs use a fixed fallback. */
export function cardIcon(cardId, size = 48) {
  const safeSize = Math.round(clamp(num(size, 48), 12, 256));
  const id = typeof cardId === 'string' && Object.prototype.hasOwnProperty.call(ICONS, cardId) ? cardId : 'knight';
  const spell = ['fireball','arrows','zap','poison'].includes(id);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><circle cx="32" cy="33" r="29" fill="${spell ? '#293947' : '#283e47'}"/><circle cx="32" cy="33" r="25" fill="${spell ? '#4b4545' : '#34545c'}" opacity=".65"/><ellipse cx="32" cy="56" rx="21" ry="5" fill="#172d38" opacity=".36"/>${ICONS[id]}</svg>`;
}
