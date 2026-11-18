import { clearLine, segmentCircle } from './geometry.js';

const TAU = Math.PI * 2;
const COLORS = { friend: '#72c9be', enemy: '#f17d69', player: '#efd580', paper: '#edf0dc', muted: '#a5af98' };
const SIZES = { scout: { r: 18, l: 43, w: 28 }, medium: { r: 22, l: 51, w: 34 }, heavy: { r: 25, l: 58, w: 39 } };
const THEMES = {
  valley: { ground:['#69745b','#7a7c5a','#616e53'], road:'#969178', lane:'#898a6c', brush:['#667a48','#4d6842','#5a7246'], roof:'#7b826e', roofEdge:'#a19e84', rock:['#797b6a','#93907a','#686e5c'], fog:'rgba(11,20,17,.35)' },
  depot: { ground:['#66736b','#737c70','#59675f'], road:'#979b8e', lane:'#8b9488', brush:['#5b7660','#3e6252','#496c58'], roof:'#687d78', roofEdge:'#9caaa1', rock:['#7d8780','#a2a79a','#68796f'], fog:'rgba(12,24,23,.38)' },
  ridge: { ground:['#668277','#7c8e7a','#536e63'], road:'#99a18a', lane:'#8c9983', brush:['#58765b','#3c5e4f','#486b55'], roof:'#7c7866', roofEdge:'#a5a088', rock:['#87928a','#a3aa9b','#708278'], fog:'rgba(17,35,32,.33)' },
  training: { ground:['#6c785f','#7a836a','#5f7059'], road:'#a4a68d', lane:'#929c80', brush:['#677e4f','#4d6a44','#59734c'], roof:'#818975', roofEdge:'#b0b197', rock:['#858c77','#a3a68b','#737d67'], fog:'rgba(13,26,19,.30)' },
};
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, n) => a + (b - a) * n;
function random(seed = 7491) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function hash(value) { let n = 2166136261; for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }
function polygon(c, pts) { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); }
function rounded(c, x, y, w, h, r = 3) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function line(c, x1, y1, x2, y2, color, width = 1) { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function disk(c, x, y, r, fill) { c.fillStyle = fill; c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); c.fill(); }

/** Canvas-only presentation. Coordinates exposed by this class are CSS pixels. */
export class BattleRenderer {
  constructor(canvas, minimapCanvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.minimapCanvas = minimapCanvas || null;
    this.mini = minimapCanvas?.getContext('2d') || null;
    this.camera = { x: 1200, y: 800, scale: 1, width: 1200, height: 800 };
    this.width = 1200; this.height = 800; this.dpr = 1;
    this.terrain = null; this.terrainMap = null; this.state = null;
    this.coverLayer = null; this.coverVersion = -1; this.theme = THEMES.valley;
    this.coverSignature = ''; this.mapProjections = new WeakMap();
    this.tracks = []; this.lastPositions = new Map(); this.lastFrameTime = null;
    this.floating = []; this.eventCursor = 0; this.shakeAt = -1; this.shakeStrength = 0;
    this.motionReduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    this.camera.offsetX = 0; this.camera.offsetY = 0;
    this.garageTime = 0;
    this.resize(canvas.clientWidth || 1200, canvas.clientHeight || 800, window.devicePixelRatio || 1);
  }

  resize(width, height, dpr = 1) {
    this.width = Math.max(1, Math.round(width)); this.height = Math.max(1, Math.round(height));
    this.dpr = clamp(dpr, 1, 2);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.camera.width = this.width; this.camera.height = this.height;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  screenToWorld(x, y) { const c = this.camera; return { x: (x - this.width / 2 - (c.offsetX || 0)) / c.scale + c.x, y: (y - this.height / 2 - (c.offsetY || 0)) / c.scale + c.y }; }
  worldToScreen(x, y) { const c = this.camera; return { x: (x - c.x) * c.scale + this.width / 2 + (c.offsetX || 0), y: (y - c.y) * c.scale + this.height / 2 + (c.offsetY || 0) }; }

  createTerrain(map) {
    const canvas = document.createElement('canvas'); canvas.width = map.width; canvas.height = map.height;
    const c = canvas.getContext('2d'); const r = random(hash(map.id || 'valley'));
    this.theme = THEMES[map.theme] || THEMES.valley;
    const theme = this.theme;
    const ground = c.createLinearGradient(0, 0, map.width, map.height);
    ground.addColorStop(0, theme.ground[0]); ground.addColorStop(.45, theme.ground[1]); ground.addColorStop(1, theme.ground[2]);
    c.fillStyle = ground; c.fillRect(0, 0, map.width, map.height);

    // Broad meadow patches are baked once; they do not affect collision.
    for (let i = 0; i < 120; i++) {
      const x = r() * map.width, y = r() * map.height, radius = 70 + r() * 160;
      const g = c.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, i % 3 ? 'rgba(164,156,102,.13)' : 'rgba(38,64,43,.13)'); g.addColorStop(1, 'rgba(88,100,65,0)');
      c.fillStyle = g; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    // Weathered farm roads follow the three broad combat lanes.
    const roads = map.roads || [
      [[-40, 800], [590, 800], [950, 800], [1460, 800], [1820, 800], [2440, 800]],
      [[230, 800], [420, 420], [1000, 420], [1400, 420], [1980, 420], [2170, 800]],
      [[230, 800], [420, 1180], [990, 1180], [1410, 1180], [1980, 1180], [2170, 800]],
      [[1200, -40], [1200, 1640]],
    ];
    for (let j = 0; j < roads.length; j++) {
      const points = roads[j];
      const roadWidth = map.roadWidths?.[j] ?? (j === 0 ? 88 : 62);
      const path = width => { c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); points.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.stroke(); };
      c.strokeStyle = 'rgba(47,51,34,.10)'; path(roadWidth+18);
      c.strokeStyle = j === 0 ? theme.road : theme.lane; path(roadWidth);
      c.strokeStyle = 'rgba(203,189,150,.17)'; path(roadWidth*.67);
      c.strokeStyle = 'rgba(70,68,51,.12)'; c.setLineDash([20, 4, 3, 8]); path(2); c.setLineDash([]);
    }
    // Dust, grass blades, stones and tread marks avoid flat vector terrain.
    for (let i = 0; i < (map.theme === 'depot' ? 9000 : 15000); i++) {
      const x = r() * map.width, y = r() * map.height;
      const shade = r(); c.fillStyle = shade < .33 ? 'rgba(36,54,33,.13)' : shade < .66 ? 'rgba(214,201,148,.14)' : 'rgba(111,116,74,.20)';
      c.fillRect(x, y, .5 + r() * 2, .6 + r() * 2);
      if (i % 5 === 0) line(c, x, y, x + r() * 5 - 2, y - r() * 7, 'rgba(58,76,43,.12)', .7);
    }
    for (let i = 0; i < 190; i++) {
      const x = r() * map.width, y = r() * map.height;
      c.save(); c.translate(x, y); c.rotate(r() * TAU); c.fillStyle = 'rgba(49,54,37,.10)';
      for (let k = 0; k < 9; k++) { c.fillRect(k * 3, -10, 1, 5); c.fillRect(k * 3, 5, 1, 5); } c.restore();
    }
    // These hard-edged ellipses are exactly the surfaceAt() movement regions.
    for (const zone of map.surfaceZones || []) {
      if (!(zone.rx > 0 && zone.ry > 0)) continue;
      const mud = zone.type === 'mud', rnd = random(hash(zone.id));
      c.save(); c.translate(zone.x,zone.y); c.beginPath(); c.ellipse(0,0,zone.rx,zone.ry,0,0,TAU);
      c.fillStyle = mud ? '#72664b' : '#85816b'; c.fill(); c.save(); c.clip();
      for (let i=0;i<80;i++) {
        const x=(rnd()*2-1)*zone.rx,y=(rnd()*2-1)*zone.ry;
        if (mud) {
          c.fillStyle=i%3?'rgba(48,45,32,.17)':'rgba(160,149,106,.24)';
          c.beginPath();c.ellipse(x,y,5+rnd()*15,2+rnd()*5,-.2,0,TAU);c.fill();
        } else {
          c.fillStyle=['#a0a18b','#626d5d','#b0ac91'][i%3];
          c.save();c.translate(x,y);c.rotate(rnd()*TAU);c.fillRect(-2,-1,3+rnd()*5,2+rnd()*3);c.restore();
        }
      }
      c.restore();c.strokeStyle=mud?'rgba(194,172,113,.55)':'rgba(212,211,179,.48)';c.lineWidth=1.6;
      c.beginPath();c.ellipse(0,0,zone.rx,zone.ry,0,0,TAU);c.stroke();
      if (map.id==='training') { c.fillStyle='#ead6a4';c.font='600 12px system-ui,sans-serif';c.textAlign='center';c.fillText('진흙 · 속도 64%',0,zone.ry+22); }
      c.restore();
    }
    if (map.theme === 'depot') {
      // Concrete loading pads, freight rails and faded parking stripes are visual only.
      for (const obstacle of map.obstacles) if (obstacle.type === 'building') {
        c.fillStyle = 'rgba(177,183,163,.13)'; c.fillRect(obstacle.x - 28, obstacle.y - 24, obstacle.w + 56, obstacle.h + 48);
        c.strokeStyle = 'rgba(232,221,155,.27)'; c.lineWidth = 2;
        c.strokeRect(obstacle.x - 18, obstacle.y - 15, obstacle.w + 36, obstacle.h + 30);
        for (let k = 0; k < 4; k++) line(c, obstacle.x + k * 17, obstacle.y + obstacle.h + 12, obstacle.x + k * 17 - 8, obstacle.y + obstacle.h + 25, 'rgba(214,202,136,.30)', 3);
      }
      for (const railY of [110, 1490]) {
        line(c, 440, railY - 8, 1980, railY - 8, '#454f48', 3);
        line(c, 440, railY + 8, 1980, railY + 8, '#454f48', 3);
        for (let x = 440; x < 1980; x += 23) line(c, x, railY - 13, x, railY + 13, 'rgba(46,56,47,.35)', 4);
      }
    }
    if (map.contours) {
      c.strokeStyle = 'rgba(203,217,190,.10)'; c.lineWidth = 1.3;
      for (let band = 0; band < 16; band++) {
        c.beginPath();
        for (let x = 0; x <= map.width; x += 20) {
          const y = 70 + band * 96 + Math.sin(x / 210 + band * .3) * 34 + Math.sin(x / 95) * 12;
          if (x) c.lineTo(x,y); else c.moveTo(x,y);
        }
        c.stroke();
      }
    }
    if (map.trainingTargets) {
      for (const [index,target] of map.trainingTargets.entries()) {
        c.save(); c.translate(target.x,target.y); c.strokeStyle = ['#d1bc75','#9fc1ad','#b3ca93'][index];
        c.globalAlpha = .5; c.lineWidth = 2; c.setLineDash([10,7]); c.beginPath(); c.arc(0,0,72,0,TAU); c.stroke(); c.setLineDash([]);
        c.font = '600 16px ui-monospace, monospace'; c.textAlign = 'center'; c.fillStyle = c.strokeStyle;
        c.fillText(`${String.fromCharCode(65+index)}  /  ${Math.round((target.x-map.trainingSpawn.x)/10)} m`,0,108);
        c.globalAlpha = .2; c.fillRect(-43,-34,86,68); c.restore();
      }
      c.strokeStyle = 'rgba(228,226,179,.34)'; c.setLineDash([12,10]); c.lineWidth = 2;
      for (let x = 600; x <= 1400; x += 200) { c.beginPath(); c.moveTo(x,500); c.lineTo(x,1150); c.stroke(); }
      c.setLineDash([]);
    }
    c.font = '600 13px ui-monospace, system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(232,231,200,.27)';
    for (const label of map.landmarks || []) c.fillText(label.label, label.x, label.y);
    c.strokeStyle = 'rgba(226,228,196,.045)'; c.lineWidth = 1;
    for (let x = 0; x < map.width; x += 200) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, map.height); c.stroke(); }
    for (let y = 0; y < map.height; y += 200) { c.beginPath(); c.moveTo(0, y); c.lineTo(map.width, y); c.stroke(); }
    // Perimeter: a clear border, with visible tactical markings.
    c.strokeStyle = 'rgba(30,38,28,.35)'; c.lineWidth = 16; c.strokeRect(4, 4, map.width - 8, map.height - 8);
    c.setLineDash([10, 9]); c.strokeStyle = 'rgba(225,215,161,.33)'; c.lineWidth = 2; c.strokeRect(17, 17, map.width - 34, map.height - 34); c.setLineDash([]);
    this.terrain = canvas; this.terrainMap = map; this.coverVersion = -1;
  }

  createCoverLayer(map) {
    const obstacles=(map.obstacles||[]).filter(o=>!o.invisible&&o.type!=='wreck');
    const signature=`${map.id}|${map.theme}|${map.width}:${map.height}|`+obstacles.map(o=>`${o.id}:${o.type}:${o.style}:${o.x}:${o.y}:${o.w}:${o.h}:${Boolean(o.destroyed||o.hp<=0)}`).join('|')+';'+(map.bushes||[]).map(b=>`${b.x}:${b.y}:${b.r}`).join('|');
    if (this.coverLayer && this.coverSignature===signature) { this.coverVersion=map.version||0; return; }
    const layer = this.coverLayer || document.createElement('canvas');
    if(layer.width!==map.width || layer.height!==map.height){layer.width=map.width;layer.height=map.height;}
    const previous = this.ctx;
    try {
      this.ctx = layer.getContext('2d');
      this.ctx.setTransform(1,0,0,1,0,0);this.ctx.clearRect(0,0,map.width,map.height);this.ctx.globalAlpha=1;
      for (const bush of map.bushes || []) this.drawBush(bush);
      for (const obstacle of obstacles) this.drawObstacle(obstacle);
    } finally { this.ctx = previous; }
    this.coverLayer = layer; this.coverVersion = map.version || 0; this.coverSignature=signature;
  }

  inView(x,y,radius=70) {
    const c=this.camera; return Math.abs(x-c.x) < this.width/c.scale/2+radius && Math.abs(y-c.y) < this.height/c.scale/2+radius;
  }

  pointObserved(state,x,y,ignoreCloudId=null) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return state.tanks.some(t=>{
      if(!t.alive||t.team!==0)return false;
      const distance=Math.hypot(t.x-x,t.y-y);
      if(distance<=85)return true;
      if(distance>(t.viewRange||({scout:770,medium:660,heavy:590}[t.type]||590)) || !clearLine(state.map,t.x,t.y,x,y))return false;
      return !(state.smokeClouds||[]).some(cloud=>cloud.id!==ignoreCloudId && cloud.remaining>0 && segmentCircle(t.x,t.y,x,y,cloud));
    });
  }

  effectVisible(state,e) {
    const owner=e.ownerId ? state.tanks.find(t=>t.id===e.ownerId) : null;
    const target=e.targetId ? state.tanks.find(t=>t.id===e.targetId) : null;
    if (e.type==='muzzle') return owner ? owner.team===0 || owner.visibleToPlayer : e.team===0 || state.tanks.some(t=>t.visibleToPlayer && Math.hypot(t.x-e.x,t.y-e.y)<85);
    if (target) return target.team===0 || target.visibleToPlayer;
    if (owner?.team===0 || e.team===0) return true;
    if (owner?.team===1 && !owner.visibleToPlayer && !this.pointObserved(state,e.x,e.y)) return false;
    return this.pointObserved(state,e.x,e.y);
  }

  smokeVisible(state,cloud) {
    if (cloud.team === 0) return true;
    const owner = state.tanks.find(tank => tank.id === cloud.ownerId);
    return (cloud.visibleToPlayer === true || owner?.visibleToPlayer) && this.pointObserved(state,cloud.x,cloud.y,cloud.id);
  }

  collectFeedback(state) {
    for (const event of state.events || []) {
      if (event.id <= this.eventCursor) continue;
      this.eventCursor=event.id;
      const target=state.tanks.find(t=>t.id===event.target);
      const playerInvolved=event.actor===state.playerId || event.target===state.playerId;
      const knownTarget=target && (target.team===0 || target.visibleToPlayer);
      if (playerInvolved && knownTarget && (event.type==='hit' && event.damage>0 || event.type==='bounce')) {
        const bounceLabel=target.team===0&&event.actor===state.playerId?'아군 차단':event.ricochet?'도탄':'비관통';
        this.floating.push({x:event.x??target.x,y:event.y??target.y,time:state.elapsed,text:event.type==='hit'?`−${Math.round(event.damage)}`:bounceLabel,critical:event.module||null,incoming:event.target===state.playerId});
      }
      if (event.target===state.playerId && event.type==='hit' && event.damage>0) { this.shakeAt=state.elapsed; this.shakeStrength=3.5; }
      else if (event.actor===state.playerId && event.type==='fire') { this.shakeAt=state.elapsed; this.shakeStrength=Math.max(this.shakeStrength,1.7); }
    }
    this.floating=this.floating.filter(item=>state.elapsed-item.time<1.45).slice(-18);
  }

  render(state, options = {}) {
    if (!state?.map) return;
    const c = this.ctx, map = state.map, time = options.time ?? state.elapsed ?? 0;
    if (this.terrainMap !== map) this.createTerrain(map);
    if (this.coverVersion !== (map.version || 0)) this.createCoverLayer(map);
    const target = state.tanks.find(t => t.id === state.spectateId && t.alive) || state.tanks.find(t => t.id === state.playerId) || state.tanks[0];
    const width = this.width, height = this.height;
    const baseScale = width < 720 ? clamp(width / 630, .62, .85) : clamp(Math.min(width / 1100, height / 700), .72, 1.65);
    const scale = baseScale * clamp(options.zoom || 1, .65, 1.6);
    const halfW = width / scale / 2, halfH = height / scale / 2;
    const tx = target?.x ?? map.width / 2, ty = target?.y ?? map.height / 2;
    const scoped=(options.zoom||1)>1.2;
    const leadFactor = scoped ? .34 : .07;
    const aimLead = options.aim && target?.alive && !state.spectateId ? { x: clamp((options.aim.x - tx) * leadFactor, scoped ? -210 : -35, scoped ? 210 : 35), y: clamp((options.aim.y - ty) * leadFactor, scoped ? -150 : -35, scoped ? 150 : 35) } : { x: 0, y: 0 };
    const wantedX = halfW * 2 > map.width ? map.width / 2 : clamp(tx + aimLead.x, halfW, map.width - halfW);
    const wantedY = halfH * 2 > map.height ? map.height / 2 : clamp(ty + aimLead.y, halfH, map.height - halfH);
    if (this.state !== state) { this.camera.x = wantedX; this.camera.y = wantedY; this.tracks = []; this.lastPositions.clear(); this.state = state; this.lastFrameTime = time; this.floating=[];this.eventCursor=0;this.shakeAt=-10;this.shakeStrength=0; }
    const delta = clamp(time - (this.lastFrameTime ?? time), 0, .05); this.lastFrameTime = time;
    const smoothing = delta ? 1 - Math.exp(-delta * 8) : .14;
    this.camera.x = lerp(this.camera.x, wantedX, smoothing); this.camera.y = lerp(this.camera.y, wantedY, smoothing); this.camera.scale = scale;
    this.collectFeedback(state);
    const simTime = state.elapsed ?? time;
    const shake=this.motionReduced?0:this.shakeStrength*Math.max(0,1-(simTime-this.shakeAt)/.3);
    this.camera.offsetX=Math.sin(simTime*72)*shake;this.camera.offsetY=Math.cos(simTime*91)*shake;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.fillStyle = '#323c30'; c.fillRect(0, 0, width, height);
    c.save(); c.translate(width / 2+this.camera.offsetX, height / 2+this.camera.offsetY); c.scale(scale, scale); c.translate(-this.camera.x, -this.camera.y);
    c.drawImage(this.terrain, 0, 0);
    this.drawTracks(state, simTime);
    if (state.mode!=='training') for (const b of state.bases || []) this.drawBase(b, simTime);
    if (options.showGrid) this.drawGrid(map);
    c.drawImage(this.coverLayer,0,0);
    const visible = state.tanks.filter(t => (t.team === 0 || t.visibleToPlayer) && this.inView(t.x,t.y));
    for (const tank of visible.filter(t => !t.alive)) this.drawTank(tank, simTime, false, true);
    for (const tank of visible.filter(t => t.alive)) this.drawTank(tank, simTime);
    for (const p of state.projectiles || []) {
      const owner=state.tanks.find(t=>t.id===p.ownerId);
      if(this.inView(p.x,p.y) && (p.team===0 || owner?.visibleToPlayer))this.drawProjectile(p);
    }
    for (const e of state.effects || []) if(this.inView(e.x,e.y,100)&&this.effectVisible(state,e))this.drawEffect(e);
    for (const cloud of state.smokeClouds || []) if(this.inView(cloud.x,cloud.y,cloud.radius+20) && this.smokeVisible(state,cloud))this.drawSmokeCloud(cloud,simTime);
    for (const tank of visible.filter(t => t.alive)) this.drawTankLabel(tank);
    this.drawTacticalMarkers(state);
    if (target?.alive && target.isPlayer && options.aim && state.phase === 'playing') {
      this.drawAim(target, options.aim, simTime);
      if(options.showArmor) this.drawArmorFocus(visible,options.aim);
    }
    this.drawFloatingFeedback(state);
    c.restore();
    const vignette = c.createRadialGradient(width * .5, height * .43, height * .28, width * .5, height * .5, Math.max(width, height) * .72);
    vignette.addColorStop(0, 'rgba(12,21,16,0)'); vignette.addColorStop(1, this.theme.fog); c.fillStyle = vignette; c.fillRect(0, 0, width, height);
    const player=state.tanks.find(t=>t.id===state.playerId);
    if(player?.alive)this.drawHitDirection(player,simTime);
    if(scoped){c.strokeStyle='rgba(224,234,198,.13)';c.lineWidth=1;c.strokeRect(12,12,width-24,height-24);}
    this.drawOffscreenMarker(state);
    this.drawMinimap(state);
  }

  drawSmokeCloud(cloud,time) {
    const c=this.ctx,rnd=random(hash(cloud.id));
    const duration=cloud.duration||7,age=duration-cloud.remaining,fade=Math.min(1,Math.max(0,age*2),Math.max(0,cloud.remaining/.9));
    const radius=(cloud.radius||145)*Math.min(1,.42+age*1.1);
    c.save();c.translate(cloud.x,cloud.y);
    const gradient=c.createRadialGradient(0,0,radius*.15,0,0,radius);
    gradient.addColorStop(0,`rgba(131,145,134,${fade*.49})`);gradient.addColorStop(.68,`rgba(130,145,135,${fade*.38})`);gradient.addColorStop(1,'rgba(123,143,132,0)');
    c.fillStyle=gradient;c.fillRect(-radius,-radius,radius*2,radius*2);
    for(let i=0;i<12;i++){
      const a=rnd()*TAU,d=rnd()*radius*.69,size=radius*(.18+rnd()*.19),drift=Math.sin(time*.7+i)*4;
      disk(c,Math.cos(a)*d+drift,Math.sin(a)*d-drift*.6,size,`rgba(${i%2?'146,158,144':'112,133,125'},${fade*.19})`);
    }
    if(cloud.team===0){c.strokeStyle=`rgba(185,213,188,${fade*.27})`;c.setLineDash([5,12]);c.lineWidth=1/this.camera.scale;c.beginPath();c.arc(0,0,radius,0,TAU);c.stroke();}
    c.restore();
  }

  drawFloatingFeedback(state) {
    const c=this.ctx,scale=this.camera.scale;
    for(const text of this.floating){
      if(!this.inView(text.x,text.y,130))continue;
      const progress=clamp((state.elapsed-text.time)/1.45,0,1);
      c.save();c.translate(text.x,text.y-42-progress*28);c.scale(1/scale,1/scale);c.globalAlpha=Math.min(1,(1-progress)*2.4);
      c.textAlign='center';c.font='700 16px ui-monospace,monospace';c.lineWidth=3;c.strokeStyle='rgba(16,29,21,.9)';c.strokeText(text.text,0,0);c.fillStyle=text.incoming?'#ffab8d':'#f1e6ad';c.fillText(text.text,0,0);
      if(text.critical){c.font='600 9px system-ui,sans-serif';c.fillStyle='#e9d5b4';c.fillText(({engine:'엔진 손상',ammoRack:'탄약고 손상',track:'궤도 손상'})[text.critical]||'부품 손상',0,14);}
      c.restore();
    }
  }

  drawHitDirection(player,time) {
    const age=time-(player.lastHitAt??-10);
    if(age<0||age>1.5||!Number.isFinite(player.lastHitAngle))return;
    const c=this.ctx,p=this.worldToScreen(player.x,player.y),a=player.lastHitAngle+Math.PI;
    c.save();c.translate(p.x,p.y);c.rotate(a);c.globalAlpha=Math.min(1,(1.5-age)*1.4);c.strokeStyle='#ef9577';c.lineWidth=3;
    c.beginPath();c.arc(0,0,64,-.24,.24);c.stroke();c.fillStyle='#ef9577';polygon(c,[[72,0],[64,-5],[64,5]]);c.fill();c.restore();
  }

  drawArmorFocus(tanks,aim) {
    const tank=tanks.filter(t=>t.alive&&t.team===1&&t.visibleToPlayer).find(t=>Math.hypot(t.x-aim.x,t.y-aim.y)<(t.radius||22)+28);
    if(!tank)return;
    const c=this.ctx,r=(tank.radius||22)+12;c.save();c.translate(tank.x,tank.y);c.rotate(tank.angle);c.lineWidth=3/this.camera.scale;c.globalAlpha=.85;
    for(const [a,b,color] of [[-.75,.75,'#ef987a'],[.86,2.28,'#e3c784'],[2.4,3.9,'#a9d1af'],[4,5.42,'#e3c784']]){c.strokeStyle=color;c.beginPath();c.arc(0,0,r,a,b);c.stroke();}
    c.restore();
  }

  tacticalMarkers(state) {
    const visibleEnemy=id=>state.tanks.find(t=>t.id===id&&t.alive&&t.team===1&&t.visibleToPlayer)||null;
    const locked=visibleEnemy(state.lockTargetId);
    const focused=state.focusTarget?.until>state.elapsed?visibleEnemy(state.focusTarget.targetId):null;
    const order=state.order;
    const waypoint=order?.type==='move'&&order.until>state.elapsed&&Number.isFinite(order.x)&&Number.isFinite(order.y)?order:null;
    return {locked,focused,waypoint};
  }

  drawTargetBracket(c,x,y,r,scale,locked,focused) {
    c.save();c.translate(x,y);c.scale(1/scale,1/scale);
    c.strokeStyle=locked?COLORS.player:'#ffae85';c.lineWidth=1.7;
    const corner=Math.max(5,Math.min(10,r*.35));
    for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]]) {
      c.beginPath();c.moveTo(sx*(r-corner),sy*r);c.lineTo(sx*r,sy*r);c.lineTo(sx*r,sy*(r-corner));c.stroke();
    }
    if(focused){c.strokeStyle='#ffae85';c.lineWidth=1.2;c.beginPath();c.arc(0,0,r+4,-.55,.55);c.stroke();c.beginPath();c.arc(0,0,r+4,Math.PI-.55,Math.PI+.55);c.stroke();}
    c.restore();
  }

  drawTacticalMarkers(state) {
    const c=this.ctx,scale=this.camera.scale,{locked,focused,waypoint}=this.tacticalMarkers(state);
    for(const tank of new Set([locked,focused].filter(Boolean))) {
      if(!this.inView(tank.x,tank.y,100))continue;
      const isLocked=tank===locked,isFocused=tank===focused,r=(tank.radius+7)*scale+3;
      this.drawTargetBracket(c,tank.x,tank.y,r,scale,isLocked,isFocused);
      c.save();c.translate(tank.x,tank.y);c.scale(1/scale,1/scale);
      const label=isLocked&&isFocused?'조준 고정 · 집중 사격':isLocked?'조준 고정':'집중 사격';
      c.font='600 9px system-ui,sans-serif';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#17261ddd';c.strokeText(label,0,r+16);c.fillStyle=isLocked?COLORS.player:'#ffb492';c.fillText(label,0,r+16);c.restore();
    }
    if(waypoint&&this.inView(waypoint.x,waypoint.y,100)) {
      c.save();c.translate(waypoint.x,waypoint.y);c.scale(1/scale,1/scale);
      c.strokeStyle=COLORS.friend;c.lineWidth=1.4;c.setLineDash([4,5]);c.beginPath();c.arc(0,0,21,0,TAU);c.stroke();c.setLineDash([]);
      line(c,-4,8,-4,-16,COLORS.friend,1.5);polygon(c,[[-4,-16],[12,-10],[-4,-4]]);c.fillStyle=COLORS.friend;c.fill();
      const label=`이동 지점 · ${Math.ceil(waypoint.until-state.elapsed)}초`;c.font='600 9px system-ui,sans-serif';c.textAlign='center';c.strokeStyle='#16271ddd';c.lineWidth=3;c.strokeText(label,0,37);c.fillStyle='#a7e3d5';c.fillText(label,0,37);c.restore();
    }
  }

  drawOffscreenMarker(state) {
    if(state.phase!=='playing')return;
    const {locked,focused,waypoint}=this.tacticalMarkers(state),point=locked||focused||waypoint;
    if(!point)return;
    const screen=this.worldToScreen(point.x,point.y);
    if(screen.x>=0&&screen.x<=this.width&&screen.y>=0&&screen.y<=this.height)return;
    const c=this.ctx,cx=this.width/2,cy=this.height/2,dx=screen.x-cx,dy=screen.y-cy;
    const pad=this.width<720?22:28,top=Math.min(this.height*.22,104),bottom=this.height-Math.min(this.height*.32,190);
    const tx=dx>0?(this.width-pad-cx)/dx:dx<0?(pad-cx)/dx:Infinity;
    const ty=dy>0?(bottom-cy)/dy:dy<0?(top-cy)/dy:Infinity;
    const ratio=Math.max(0,Math.min(tx,ty)),x=cx+dx*ratio,y=cy+dy*ratio;
    const color=locked?COLORS.player:focused?'#ffae85':COLORS.friend;
    c.save();c.translate(x,y);c.rotate(Math.atan2(dy,dx));polygon(c,[[8,0],[-5,-5],[-2,0],[-5,5]]);c.fillStyle=color;c.strokeStyle='#17251c';c.lineWidth=2;c.stroke();c.fill();c.restore();
    const player=state.tanks.find(t=>t.id===state.playerId),distance=player?Math.round(Math.hypot(point.x-player.x,point.y-player.y)/10):0;
    const label=`${locked?'고정':focused?'집중':'이동'} ${distance}m`;
    c.save();c.font='600 8px system-ui,sans-serif';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#15251d';c.strokeText(label,x,y+18);c.fillStyle=color;c.fillText(label,x,y+18);c.restore();
  }

  drawGrid(map) {
    const c = this.ctx, step = 200; c.save(); c.strokeStyle = 'rgba(234,234,197,.17)'; c.lineWidth = 1 / this.camera.scale;
    c.font = '11px ui-monospace, monospace'; c.fillStyle = 'rgba(238,239,215,.45)';
    for (let x = 0; x < map.width; x += step) for (let y = 0; y < map.height; y += step) { c.strokeRect(x, y, step, step); c.fillText(`${String.fromCharCode(65 + y / step)}${x / step + 1}`, x + 9, y + 18); }
    c.restore();
  }

  drawTracks(state, time) {
    const c = this.ctx;
    for (const t of state.tanks) {
      if (!t.alive || (t.team !== 0 && !t.visibleToPlayer)) continue;
      const p = this.lastPositions.get(t.id);
      if (!p || Math.hypot(t.x - p.x, t.y - p.y) > 10) {
        if (p && Math.abs(t.speed || 0) > 5) this.tracks.push({ x: t.x, y: t.y, a: t.angle, type: t.type, time });
        this.lastPositions.set(t.id, { x: t.x, y: t.y });
      }
    }
    if (this.tracks.length > 1100) this.tracks.splice(0, this.tracks.length - 1100);
    this.tracks = this.tracks.filter(t => time - t.time < 36);
    for (const t of this.tracks) {
      if (!this.inView(t.x,t.y,40)) continue;
      c.save(); c.translate(t.x, t.y); c.rotate(t.a); c.fillStyle = `rgba(30,35,24,${.16 * Math.max(0, 1 - (time - t.time) / 36)})`;
      const off = (SIZES[t.type]?.w || 34) / 2;
      c.fillRect(-5, -off, 7, 4); c.fillRect(-5, off - 4, 7, 4); c.restore();
    }
  }

  drawBase(base, time) {
    const c = this.ctx, color = base.team === 0 ? COLORS.friend : COLORS.enemy;
    c.save(); c.translate(base.x, base.y);
    c.fillStyle = base.team === 0 ? 'rgba(55,117,108,.08)' : 'rgba(150,79,61,.07)'; c.beginPath(); c.arc(0, 0, base.r, 0, TAU); c.fill();
    c.strokeStyle = color; c.globalAlpha = .35; c.lineWidth = 2; c.setLineDash([11, 8]); c.beginPath(); c.arc(0, 0, base.r, 0, TAU); c.stroke(); c.setLineDash([]);
    c.globalAlpha = .7; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, base.r - 7, 0, TAU); c.stroke();
    if (base.capture > 0) { c.strokeStyle = base.capturingTeam === 0 ? COLORS.friend : COLORS.enemy; c.lineWidth = 6; c.globalAlpha = .8 + Math.sin(time * 5) * .15; c.beginPath(); c.arc(0, 0, base.r - 3, -Math.PI / 2, -Math.PI / 2 + TAU * base.capture / 100); c.stroke(); }
    c.globalAlpha = .7; c.strokeStyle = color; c.lineWidth = 2;
    polygon(c, [[0, -23], [19, -12], [19, 12], [0, 23], [-19, 12], [-19, -12]]); c.stroke();
    c.font = 'bold 17px ui-monospace, monospace'; c.textAlign = 'center'; c.fillStyle = color; c.fillText(base.team === 0 ? 'A' : 'B', 0, 6);
    c.font = '10px ui-monospace, monospace'; c.globalAlpha = .65; c.fillText(base.team === 0 ? 'ALLIED HQ' : 'ENEMY HQ', 0, 43); c.restore();
  }

  drawBush(bush) {
    const c = this.ctx, r = random(hash(`${bush.x},${bush.y}`)); c.save(); c.translate(bush.x, bush.y);
    c.fillStyle = 'rgba(30,47,28,.20)'; c.beginPath(); c.ellipse(5, 7, bush.r * 1.05, bush.r * .82, -.2, 0, TAU); c.fill();
    for (let j = 0; j < 13; j++) {
      const a = r() * TAU, d = r() * bush.r * .7, x = Math.cos(a) * d, y = Math.sin(a) * d, size = bush.r * (.22 + r() * .22);
      disk(c, x, y, size, this.theme.brush[j%3]);
      disk(c, x - 2, y - 3, size * .7, 'rgba(143,157,88,.20)');
      line(c, x - size * .3, y, x + size * .1, y - size * .5, 'rgba(40,65,37,.21)', 1);
    }
    for (let j = 0; j < 14; j++) { const a = r() * TAU, d = r() * bush.r; disk(c, Math.cos(a) * d, Math.sin(a) * d, 1.3, 'rgba(180,174,104,.35)'); }
    c.restore();
  }

  drawObstacle(o) {
    if(o.invisible || o.type==='wreck')return;
    const c = this.ctx, x = o.x, y = o.y, w = o.w, h = o.h; const r = random(hash(o.id ?? `${x},${y}`));
    if (o.destroyed || o.hp <= 0) {
      c.save(); c.translate(x, y); c.fillStyle = 'rgba(39,40,30,.25)'; rounded(c, -6, -4, w + 15, h + 17, 8); c.fill();
      for (let i = 0; i < 24; i++) { const a = r() * w, b = r() * h; c.fillStyle = ['#8a8974', '#626553', '#98917b'][i % 3]; c.save(); c.translate(a, b); c.rotate(r() * 3); c.fillRect(-4, -4, 6 + r() * 10, 4 + r() * 9); c.restore(); }
      c.restore(); return;
    }
    if (o.type === 'rock') {
      c.save(); c.translate(x + w / 2, y + h / 2); const pts = [];
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, rr = .8 + r() * .2; pts.push([Math.cos(a) * w / 2 * rr, Math.sin(a) * h / 2 * rr]); }
      c.save(); c.translate(7, 9); polygon(c, pts); c.fillStyle = 'rgba(34,41,30,.34)'; c.fill(); c.restore();
      polygon(c, pts); c.fillStyle = this.theme.rock[0]; c.fill(); c.strokeStyle = '#595f50'; c.lineWidth = 2; c.stroke();
      polygon(c, [pts[4], pts[5], pts[6], pts[7], [w * .05, -h * .08]]); c.fillStyle = this.theme.rock[1]; c.fill();
      polygon(c, [pts[0], pts[1], pts[2], [w * .05, -h * .08]]); c.fillStyle = this.theme.rock[2]; c.fill();
      line(c, pts[5][0], pts[5][1], w * .05, -h * .08, 'rgba(211,205,168,.23)', 1.5); c.restore(); return;
    }
    c.save(); c.translate(x, y);
    c.fillStyle = 'rgba(30,38,27,.29)'; rounded(c, 8, 10, w + 1, h + 2, 3); c.fill();
    if (o.type === 'wall') {
      c.fillStyle = '#666c59'; c.fillRect(1, 5, w, h); c.fillStyle = o.style==='container'?'#9c896b':'#aaa48a'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#7e826a'; c.lineWidth = 1; c.strokeRect(.5, .5, w - 1, h - 1);
      if (w > h) for (let a = 18; a < w; a += 23) line(c, a, 1, a - 2, h - 1, '#7d7e68', 1);
      else for (let a = 18; a < h; a += 23) line(c, 1, a, w - 1, a - 2, '#7d7e68', 1);
      line(c, 1, 1, w - 2, 1, '#c1baa0', 2); c.restore(); return;
    }
    // Low industrial warehouse: volume, bevel, roof seams and equipment.
    c.fillStyle = '#565f4d'; c.fillRect(1, 7, w, h); c.fillStyle = '#7f836d'; c.fillRect(0, 0, w, h);
    c.fillStyle = this.theme.roofEdge; c.fillRect(0, 0, w, 5); c.fillRect(0, 0, 4, h);
    c.fillStyle = '#666f5d'; c.fillRect(w - 5, 5, 5, h - 5); c.fillRect(4, h - 5, w - 5, 5);
    c.fillStyle = o.style==='cabin'?'#8d8068':this.theme.roof; c.fillRect(7, 8, w - 14, h - 16);
    c.strokeStyle = 'rgba(45,57,44,.25)'; c.lineWidth = 1;
    for (let k = 17; k < w - 6; k += 14) { c.beginPath(); c.moveTo(k, 8); c.lineTo(k, h - 8); c.stroke(); }
    c.strokeStyle = 'rgba(202,199,167,.13)'; for (let k = 18; k < w - 6; k += 14) { c.beginPath(); c.moveTo(k, 8); c.lineTo(k, h - 8); c.stroke(); }
    line(c, 6, h / 2, w - 6, h / 2, '#9b9e85', 3);
    for (let k = 0; k < Math.floor(w / 65); k++) {
      const px = 15 + k * 59, py = 15 + (k % 2) * Math.max(0, h - 52);
      c.fillStyle = 'rgba(39,48,36,.28)'; c.fillRect(px + 3, py + 4, 21, 16); c.fillStyle = '#a2a48b'; c.fillRect(px, py, 21, 16);
      c.fillStyle = '#66725e'; c.fillRect(px + 3, py + 3, 15, 10);
      for (let j = 0; j < 4; j++) line(c, px + 4, py + 4 + j * 2.4, px + 17, py + 4 + j * 2.4, '#91987d', 1);
    }
    c.fillStyle = '#414d40'; c.fillRect(Math.max(7, w / 2 - 11), h - 4, 23, 4);
    // Broken corners and small roof weathering provide map-scale landmarks.
    for (let k = 0; k < 18; k++) { c.fillStyle = 'rgba(54,67,49,.13)'; c.fillRect(8 + r() * Math.max(1, w - 18), 8 + r() * Math.max(1, h - 18), r() * 8 + 1, r() * 3 + 1); }
    if(o.style==='warehouse'){
      c.globalAlpha=.3;c.fillStyle='#d5dbbd';c.font='bold 20px ui-monospace,monospace';c.textAlign='center';c.fillText(`D${String(hash(o.id)%19+1).padStart(2,'0')}`,w*.5,h*.52+6);c.globalAlpha=1;
    }
    c.restore();
  }

  drawTank(tank, time = 0, garage = false, destroyed = false) {
    const c = this.ctx, s = SIZES[tank.type] || SIZES.medium, l = s.l, w = s.w;
    const alive = !destroyed && tank.alive !== false;
    const accent = tank.isPlayer ? COLORS.player : tank.team === 0 ? COLORS.friend : COLORS.enemy;
    const hull = !alive ? '#4d5143' : garage ? '#a8aa80' : tank.isPlayer ? '#aaa575' : tank.team === 0 ? '#839681' : '#a28d70';
    const light = !alive ? '#686b55' : garage ? '#c8c59b' : tank.isPlayer ? '#c6bb88' : tank.team === 0 ? '#a4b29a' : '#b5a080';
    c.save(); c.translate(tank.x, tank.y);
    if (alive && tank.isPlayer && !garage) {
      c.save(); c.rotate(-time * .08); c.strokeStyle = 'rgba(239,213,128,.57)'; c.lineWidth = 1.2; c.setLineDash([15, 9]); c.beginPath(); c.arc(0, 0, s.r + 12, 0, TAU); c.stroke(); c.restore();
      line(c, Math.cos(tank.angle) * (s.r + 14), Math.sin(tank.angle) * (s.r + 14), Math.cos(tank.angle) * (s.r + 21), Math.sin(tank.angle) * (s.r + 21), 'rgba(244,222,156,.8)', 2);
    }
    // The hull and turret are intentionally rotated independently.
    c.save(); c.translate(garage ? 3 : 4, garage ? 4 : 5); c.rotate(tank.angle || 0);
    c.fillStyle = 'rgba(12,20,15,.40)'; rounded(c, -l / 2 - 2, -w / 2 - 2, l + 4, w + 4, 5); c.fill(); c.restore();
    c.save(); c.rotate(tank.angle || 0);
    // Treads, with moving cleats.
    c.fillStyle = alive ? '#2e3830' : '#353b31'; rounded(c, -l / 2 - 1, -w / 2 - 2, l + 2, w + 4, 5); c.fill();
    const trackOffset = alive ? ((time * Math.abs(tank.speed || 0) * .35) % 5) : 0;
    for (let i = -l / 2 + 2 + trackOffset; i < l / 2 - 2; i += 4.8) {
      c.fillStyle = alive ? '#616957' : '#454c3e'; c.fillRect(i, -w / 2 - 1, 2.6, 5.5); c.fillRect(i, w / 2 - 4.5, 2.6, 5.5);
      c.fillStyle = 'rgba(174,181,145,.25)'; c.fillRect(i, -w / 2 - 1, 1, 4.5); c.fillRect(i, w / 2 - 3.5, 1, 4.5);
    }
    // Sloped chassis and dark edge bevels.
    polygon(c, [[-l / 2 + 2, -w / 2 + 5], [l / 2 - 8, -w / 2 + 5], [l / 2, -w / 2 + 10], [l / 2, w / 2 - 10], [l / 2 - 8, w / 2 - 5], [-l / 2 + 2, w / 2 - 5]]);
    c.fillStyle = hull; c.fill(); c.strokeStyle = '#4b5744'; c.lineWidth = 1; c.stroke();
    polygon(c, [[l / 2 - 12, -w / 2 + 6], [l / 2 - 4, -w / 2 + 7], [l / 2 - 1, -w / 2 + 11], [l / 2 - 1, w / 2 - 11], [l / 2 - 4, w / 2 - 7], [l / 2 - 12, w / 2 - 6]]);
    c.fillStyle = light; c.fill();
    line(c, -l / 2 + 3, -w / 2 + 5, l / 2 - 8, -w / 2 + 5, light, 1.1);
    line(c, -l / 2 + 3, w / 2 - 5, l / 2 - 8, w / 2 - 5, '#5c674e', 1.5);
    // Engine grille and rear stowage.
    c.fillStyle = '#59634b'; c.fillRect(-l / 2 + 5, -w / 2 + 8, l * .19, w - 16);
    for (let i = 0; i < 5; i++) line(c, -l / 2 + 6 + i * 1.8, -w / 2 + 9, -l / 2 + 6 + i * 1.8, w / 2 - 9, '#899071', .7);
    c.fillStyle = light; c.fillRect(-l / 2 + 1, -w / 2 + 7, 3, 5); c.fillRect(-l / 2 + 1, w / 2 - 12, 3, 5);
    if (tank.type === 'heavy') { c.fillStyle = '#737d60'; c.fillRect(-l / 2 + 4, -w / 2 + 4, 19, 3); c.fillRect(-l / 2 + 4, w / 2 - 7, 19, 3); }
    // Muted camouflage patches and a team identification stripe.
    c.fillStyle = 'rgba(45,65,42,.22)'; polygon(c, [[-6, -w / 2 + 6], [8, -w / 2 + 6], [0, -1], [-9, 2]]); c.fill();
    c.fillStyle = alive ? accent : '#73715a'; c.globalAlpha = .8; c.fillRect(-l / 2 + 4, -w / 2 + 3, 4, 2); c.fillRect(-l / 2 + 4, w / 2 - 5, 4, 2); c.globalAlpha = 1;
    c.fillStyle = '#e4d8a0'; c.fillRect(l / 2 - 5, -w / 2 + 8, 2, 2); c.fillRect(l / 2 - 5, w / 2 - 10, 2, 2);
    if (!alive) { c.strokeStyle = '#303a2e'; c.lineWidth = 2; c.beginPath(); c.moveTo(-l * .2, -w * .3); c.lineTo(3, 4); c.lineTo(l * .3, -3); c.stroke(); }
    c.restore();
    c.save(); c.rotate((tank.turretAngle ?? tank.angle) || 0);
    // Turret shadow, mantlet, bore and barrel collar.
    c.fillStyle = 'rgba(23,33,24,.30)'; disk(c, -1, 3, w * .35, 'rgba(23,33,24,.30)');
    const recoil = alive ? Math.max(0, (tank.reloadLeft || 0) - ((tank.reloadTime || 3) - .15)) * 20 : 0;
    const barrelEnd = l * .86 - recoil;
    c.fillStyle = '#3f4c3a'; c.fillRect(8, -2.6, barrelEnd - 8, 5.2);
    c.fillStyle = light; c.fillRect(9, -2.3, barrelEnd - 9, 2);
    c.fillStyle = hull; c.fillRect(9, -.5, barrelEnd - 9, 2);
    c.fillStyle = '#657355'; c.fillRect(barrelEnd - 6, -3.2, 7, 6.4); c.fillStyle = '#313e30'; c.fillRect(barrelEnd, -2.3, 1.7, 4.6);
    if (tank.type === 'heavy') { c.fillStyle = '#9a9f78'; c.fillRect(19, -3.1, 3.5, 6.2); }
    const tw = w * .33, tl = l * .29;
    polygon(c, [[-tl, -tw * .7], [-tl * .65, -tw], [tl * .48, -tw], [tl, -tw * .55], [tl, tw * .55], [tl * .5, tw], [-tl * .7, tw], [-tl, tw * .6]]);
    c.fillStyle = hull; c.fill(); c.strokeStyle = '#49563f'; c.lineWidth = 1.2; c.stroke();
    polygon(c, [[-tl + 1, -tw * .65], [-tl * .6, -tw + 1], [tl * .45, -tw + 1], [tl - 1, -tw * .5], [tl - 4, -tw * .2], [-tl + 3, -tw * .35]]); c.fillStyle = light; c.fill();
    c.fillStyle = '#697653'; c.fillRect(tl - 3, -4.3, 6, 8.6); c.fillStyle = '#aeb48a'; c.fillRect(tl - 3, -4.3, 6, 1.5);
    disk(c, -tl * .3, tw * .22, tw * .39, '#647151'); disk(c, -tl * .3 - .5, tw * .22 - .7, tw * .3, light);
    line(c, -tl * .3 - 2, tw * .22, -tl * .3 + 2, tw * .22, '#71805c', .8);
    c.fillStyle = '#3e503e'; c.fillRect(2, -tw * .64, 4, 2); c.fillStyle = '#b1d4bd'; c.fillRect(2.5, -tw * .64, 2.5, .8);
    line(c, -tl * .65, -tw * .5, -tl * .9, -tw * 1.7, '#404f3d', .65);
    c.fillStyle = alive ? accent : '#5d6450'; c.globalAlpha = .85; c.fillRect(-5, -2, 2.8, 3.5); c.fillRect(-1, -2, 1, 3.5); c.globalAlpha = 1;
    c.restore();
    if (!alive) {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 22); g.addColorStop(0, 'rgba(241,124,44,.28)'); g.addColorStop(1, 'rgba(26,33,24,0)'); c.fillStyle = g; c.fillRect(-22, -22, 44, 44);
    } else if (tank.trackDisabled > 0 && !garage) {
      c.strokeStyle = COLORS.player; c.lineWidth = 2; c.beginPath(); c.moveTo(-6, s.r + 17); c.lineTo(6, s.r + 29); c.moveTo(6, s.r + 17); c.lineTo(-6, s.r + 29); c.stroke();
    }
    if(alive && !garage && ((tank.modules?.engine||0)>0 || (tank.modules?.ammoRack||0)>0)){
      if(tank.modules.engine>0){const a=tank.angle+Math.PI;for(let i=0;i<3;i++)disk(c,Math.cos(a)*(s.r+5+i*4),Math.sin(a)*(s.r+5+i*4)-i*3,3+i*2,`rgba(47,51,43,${.25-i*.05})`);}
      c.save();c.translate(0,s.r+42/this.camera.scale);c.scale(1/this.camera.scale,1/this.camera.scale);c.fillStyle='#eab28b';c.font='600 8px system-ui,sans-serif';c.textAlign='center';
      c.fillText([tank.modules.engine>0?'엔진':'',tank.modules.ammoRack>0?'탄약고':''].filter(Boolean).join(' · '),0,0);c.restore();
    }
    c.restore();
  }

  drawTankLabel(tank) {
    if (tank.isPlayer) return;
    const c = this.ctx, scale = this.camera.scale, accent = tank.team === 0 ? COLORS.friend : COLORS.enemy;
    c.save(); c.translate(tank.x, tank.y - (SIZES[tank.type]?.r || 22) - 24 / scale); c.scale(1 / scale, 1 / scale);
    const hp = clamp(tank.hp / tank.maxHp, 0, 1);
    c.font = '600 10px ui-sans-serif, system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = '#17281f';
    c.fillText(tank.name || (tank.team === 0 ? '아군' : '적 전차'), 1, -8); c.fillStyle = '#eff0dc'; c.fillText(tank.name || (tank.team === 0 ? '아군' : '적 전차'), 0, -9);
    c.fillStyle = 'rgba(16,29,22,.76)'; c.fillRect(-26, -4, 52, 5); c.fillStyle = accent; c.fillRect(-25, -3, 50 * hp, 3);
    c.fillStyle = accent; polygon(c, [[-32, -5], [-29, -2], [-32, 1], [-35, -2]]); c.fill(); c.restore();
  }

  drawProjectile(p) {
    const c = this.ctx, dx = (p.vx || 0) * .028, dy = (p.vy || 0) * .028;
    const g = c.createLinearGradient(p.x - dx, p.y - dy, p.x, p.y); g.addColorStop(0, 'rgba(251,222,132,0)'); g.addColorStop(1, '#fff4c0');
    line(c, p.x - dx, p.y - dy, p.x, p.y, g, p.ammo === 'HE' ? 2.8 : 2);
    disk(c, p.x, p.y, p.ammo === 'HE' ? 2.6 : 1.8, '#fff9da');
  }

  drawEffect(e) {
    if (!(e.life > 0)) return;
    const c = this.ctx, progress = clamp(1 - e.life / (e.maxLife || 1), 0, 1), alpha = 1 - progress;
    const rnd = random(hash(e.id)); c.save(); c.translate(e.x, e.y);
    if (e.type === 'muzzle') {
      c.rotate(e.angle || 0); c.globalAlpha = alpha;
      const len = 12 + progress * 30; const g = c.createRadialGradient(3, 0, 0, 3, 0, len); g.addColorStop(0, '#fffbd0'); g.addColorStop(.3, 'rgba(255,211,108,.82)'); g.addColorStop(1, 'rgba(242,143,51,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(len * .25, 0, len, len * .46, 0, 0, TAU); c.fill();
    } else if (e.type === 'ricochet') {
      c.globalAlpha = alpha; c.strokeStyle = '#ffedaf'; c.lineWidth = 1.7;
      for (let i = 0; i < 8; i++) { const a = (e.angle || 0) + (rnd() - .5) * 2.3, d = progress * (22 + rnd() * 26); c.beginPath(); c.moveTo(Math.cos(a) * d * .55, Math.sin(a) * d * .55); c.lineTo(Math.cos(a) * d, Math.sin(a) * d); c.stroke(); }
    } else {
      const big = e.type === 'explosion', smoke = e.type === 'smoke', size = (big ? 68 : smoke ? 37 : 27) * (.2 + progress * .8);
      if (!smoke && progress < .45) {
        const g = c.createRadialGradient(0, 0, 0, 0, 0, size); g.addColorStop(0, `rgba(255,239,164,${alpha})`); g.addColorStop(.4, `rgba(248,151,57,${alpha * .8})`); g.addColorStop(1, 'rgba(133,92,47,0)'); c.fillStyle = g; c.fillRect(-size, -size, size * 2, size * 2);
      }
      if (big && progress < .6) { c.globalAlpha = alpha * .5; c.strokeStyle = '#f3d48d'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, size * 1.3, 0, TAU); c.stroke(); c.globalAlpha = 1; }
      for (let i = 0; i < (big ? 9 : 5); i++) {
        const a = rnd() * TAU, d = (8 + rnd() * size) * progress, radius = (big ? 10 : 6) + rnd() * size * .35;
        disk(c, Math.cos(a) * d + progress * 13, Math.sin(a) * d - progress * 15, radius, smoke ? `rgba(65,73,58,${alpha * .18})` : `rgba(81,78,58,${alpha * .20})`);
      }
      if (!smoke) for (let i = 0; i < (big ? 15 : 6); i++) { const a = rnd() * TAU, d = (14 + rnd() * size * 1.6) * progress; disk(c, Math.cos(a) * d, Math.sin(a) * d, 1.2 + rnd() * 2, `rgba(244,196,113,${alpha})`); }
    }
    c.restore();
  }

  drawAim(player, aim, time) {
    const c = this.ctx, scale = this.camera.scale;
    const distance = Math.hypot(aim.x - player.x, aim.y - player.y);
    c.save();
    c.strokeStyle = 'rgba(235,224,172,.15)'; c.lineWidth = 1 / scale;
    c.setLineDash([3 / scale, 7 / scale]);
    const barrelX = player.x + Math.cos(player.turretAngle) * distance;
    const barrelY = player.y + Math.sin(player.turretAngle) * distance;
    if (distance > 45) {
      c.beginPath();
      c.moveTo(player.x + Math.cos(player.turretAngle) * 42, player.y + Math.sin(player.turretAngle) * 42);
      c.lineTo(barrelX, barrelY); c.stroke();
    }
    c.setLineDash([]);
    // The app owns the cursor reticle. This dot shows the real barrel direction
    // while the turret catches up, so pointing and firing remain distinct.
    disk(c, barrelX, barrelY, 2.1 / scale, 'rgba(249,241,201,.72)');
    c.strokeStyle = 'rgba(233,231,189,.20)'; c.lineWidth = 1 / scale;
    const spreadRadius=clamp(distance*Math.tan(player.dispersion||.006),3/scale,65/scale);
    c.beginPath(); c.arc(barrelX, barrelY, spreadRadius, 0, TAU); c.stroke();
    c.restore();
  }

  drawMinimap(state) {
    if(this.minimapCanvas)this.drawMapCanvas(state,this.minimapCanvas,false);
  }

  renderTacticalMap(state,canvas,options={}) {
    return this.drawMapCanvas(state,canvas,true,options);
  }

  tacticalMapToWorld(canvas,cssX,cssY) {
    const p=this.mapProjections.get(canvas);
    if(!p||!Number.isFinite(cssX)||!Number.isFinite(cssY))return null;
    const x=(cssX-p.ox)/p.scale,y=(cssY-p.oy)/p.scale;
    if(x<0||x>p.mapWidth||y<0||y>p.mapHeight)return null;
    return {x,y};
  }

  minimapToWorld(cssX,cssY) { return this.tacticalMapToWorld(this.minimapCanvas,cssX,cssY); }

  drawMapCanvas(state,canvas,detailed=false,options={}) {
    if(!state?.map||!canvas)return false;
    const map=state.map,c=canvas.getContext('2d');if(!c)return false;
    if(this.terrainMap!==map)this.createTerrain(map);
    if(this.coverVersion!==(map.version||0))this.createCoverLayer(map);
    const bounds=canvas.getBoundingClientRect(),width=Math.max(80,Math.round(bounds.width||190)),height=Math.max(60,Math.round(bounds.height||132));
    const dpr=clamp(this.dpr,1,2);
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
    const padding=detailed?12:6,scale=Math.min((width-padding*2)/map.width,(height-padding*2)/map.height),ox=(width-map.width*scale)/2,oy=(height-map.height*scale)/2;
    this.mapProjections.set(canvas,{width,height,scale,ox,oy,mapWidth:map.width,mapHeight:map.height});
    c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);c.fillStyle='#17281f';c.fillRect(0,0,width,height);
    c.save();c.translate(ox,oy);c.scale(scale,scale);c.beginPath();c.rect(0,0,map.width,map.height);c.clip();
    c.globalAlpha=detailed?.87:.57;c.drawImage(this.terrain,0,0);c.globalAlpha=1;
    if(detailed){c.globalAlpha=.82;c.drawImage(this.coverLayer,0,0);c.globalAlpha=1;}
    else {c.fillStyle='rgba(181,184,150,.55)';for(const o of map.obstacles)if(!o.destroyed&&!o.invisible&&o.type!=='wreck')c.fillRect(o.x,o.y,o.w,o.h);}
    if(detailed){
      c.lineWidth=.7/scale;c.strokeStyle='rgba(229,237,199,.16)';
      for(let x=200;x<map.width;x+=200)line(c,x,0,x,map.height,'rgba(229,237,199,.16)',.7/scale);
      for(let y=200;y<map.height;y+=200)line(c,0,y,map.width,y,'rgba(229,237,199,.16)',.7/scale);
      c.font=`${9/scale}px ui-monospace,monospace`;c.fillStyle='rgba(240,241,210,.66)';c.textAlign='center';
      for(let x=0;x<map.width;x+=200)c.fillText(String(x/200+1),x+100,13/scale);
      c.textAlign='left';for(let y=0;y<map.height;y+=200)c.fillText(String.fromCharCode(65+y/200),7/scale,y+100+3/scale);
    }
    if(state.mode!=='training')for(const base of state.bases||[]){
      const color=base.team===0?COLORS.friend:COLORS.enemy;c.strokeStyle=color;c.lineWidth=1.2/scale;c.globalAlpha=.8;c.beginPath();c.arc(base.x,base.y,base.r,0,TAU);c.stroke();c.globalAlpha=1;
      if(base.capture>0){c.lineWidth=3/scale;c.beginPath();c.arc(base.x,base.y,base.r,-Math.PI/2,-Math.PI/2+TAU*base.capture/100);c.stroke();}
      if(detailed){c.fillStyle=color;c.font=`600 ${11/scale}px ui-monospace,monospace`;c.textAlign='center';c.fillText(base.team===0?'A':'B',base.x,base.y-base.r-7/scale);}
    }
    for(const cloud of state.smokeClouds||[]){if(!this.smokeVisible(state,cloud))continue;c.fillStyle='rgba(200,217,194,.25)';c.beginPath();c.arc(cloud.x,cloud.y,cloud.radius||145,0,TAU);c.fill();}
    for(const tank of state.tanks){
      // A hidden death must not remove stale intelligence before its ordinary expiry.
      if(tank.team!==0&&!tank.visibleToPlayer){
        if(tank.lastSeen&&state.elapsed-tank.lastSeen.time<24){
          const r=(detailed?4:2.5)/scale;c.globalAlpha=.4;c.strokeStyle=COLORS.enemy;c.lineWidth=1/scale;c.setLineDash([2/scale,2/scale]);c.strokeRect(tank.lastSeen.x-r,tank.lastSeen.y-r,r*2,r*2);c.setLineDash([]);
          if(detailed){c.font=`${8/scale}px system-ui,sans-serif`;c.textAlign='center';c.fillStyle='#ffb59b';c.fillText(`${Math.floor(state.elapsed-tank.lastSeen.time)}초 전`,tank.lastSeen.x,tank.lastSeen.y+15/scale);}c.globalAlpha=1;
        }
        continue;
      }
      if(!tank.alive){
        const r=(detailed?3:2)/scale;c.strokeStyle='#a3ad91';c.lineWidth=1/scale;c.strokeRect(tank.x-r,tank.y-r,r*2,r*2);line(c,tank.x-r,tank.y-r,tank.x+r,tank.y+r,'#a3ad91',1/scale);
        continue;
      }
      const color=tank.isPlayer?COLORS.player:tank.team===0?COLORS.friend:COLORS.enemy,size=detailed?6:5;
      c.save();c.translate(tank.x,tank.y);c.rotate(tank.angle||0);polygon(c,[[size/scale,0],[-size*.66/scale,-size*.66/scale],[-size*.3/scale,0],[-size*.66/scale,size*.66/scale]]);c.strokeStyle='#17271f';c.lineWidth=2/scale;c.stroke();c.fillStyle=color;c.fill();c.restore();
      if(tank.isPlayer){c.strokeStyle='rgba(243,224,158,.65)';c.lineWidth=1/scale;c.beginPath();c.arc(tank.x,tank.y,9/scale,0,TAU);c.stroke();}
      if(detailed){c.font=`500 ${9/scale}px system-ui,sans-serif`;c.textAlign='center';c.strokeStyle='#15251dcc';c.lineWidth=3/scale;c.strokeText(tank.isPlayer?'나':tank.name,tank.x,tank.y-12/scale);c.fillStyle=tank.isPlayer?'#f6e3a3':'#e9efda';c.fillText(tank.isPlayer?'나':tank.name,tank.x,tank.y-12/scale);}
    }
    const {locked,focused,waypoint}=this.tacticalMarkers(state);
    for(const tank of new Set([locked,focused].filter(Boolean)))this.drawTargetBracket(c,tank.x,tank.y,detailed?11:8,scale,tank===locked,tank===focused);
    if(state.order?.until>state.elapsed){
      const point=waypoint||(state.order.type==='follow'?state.tanks.find(t=>t.isPlayer):(state.bases||[]).find(base=>base.team===(state.order.type==='defend'?0:1)));
      if(point){
        c.strokeStyle=COLORS.friend;c.lineWidth=1.3/scale;c.setLineDash([3/scale,3/scale]);c.beginPath();c.arc(point.x,point.y,(detailed?13:10)/scale,0,TAU);c.stroke();c.setLineDash([]);
        if(waypoint){line(c,point.x-3/scale,point.y+6/scale,point.x-3/scale,point.y-9/scale,COLORS.friend,1.3/scale);polygon(c,[[point.x-3/scale,point.y-9/scale],[point.x+7/scale,point.y-5/scale],[point.x-3/scale,point.y-1/scale]]);c.fillStyle=COLORS.friend;c.fill();}
      }
    }
    const cam=this.camera;c.strokeStyle='rgba(247,242,208,.47)';c.lineWidth=1/scale;c.strokeRect(cam.x-this.width/cam.scale/2,cam.y-this.height/cam.scale/2,this.width/cam.scale,this.height/cam.scale);
    const cursor=options.cursor;
    if(detailed&&cursor&&Number.isFinite(cursor.x)&&Number.isFinite(cursor.y)){
      const x=clamp(cursor.x,0,map.width),y=clamp(cursor.y,0,map.height),r=8/scale;
      c.strokeStyle='#eef2c9';c.lineWidth=1.2/scale;c.beginPath();c.arc(x,y,r,0,TAU);c.stroke();
      for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]])line(c,x+dx*11/scale,y+dy*11/scale,x+dx*16/scale,y+dy*16/scale,'#eef2c9',1/scale);
      const sector=`${String.fromCharCode(65+Math.min(7,Math.floor(y/200)))}${Math.min(12,Math.floor(x/200)+1)}`;
      c.font=`${8/scale}px ui-monospace,monospace`;c.textAlign='center';c.lineWidth=3/scale;c.strokeStyle='#15251d';c.strokeText(sector,x,y+25/scale);c.fillStyle='#eef2c9';c.fillText(sector,x,y+25/scale);
    }
    c.restore();c.strokeStyle='rgba(211,218,180,.24)';c.lineWidth=1;c.strokeRect(ox+.5,oy+.5,map.width*scale-1,map.height*scale-1);
    return true;
  }

  renderGarage(tankClass = 'medium', time = 0) {
    const c = this.ctx, w = this.width, h = this.height, mobile = w < 700;
    const shortLandscape = h < 620 && w > h;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bg = c.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#172721'); bg.addColorStop(.58, '#344336'); bg.addColorStop(1, '#25362c'); c.fillStyle = bg; c.fillRect(0, 0, w, h);
    const x = w * (mobile ? .58 : shortLandscape ? .71 : .72);
    const y = h * (mobile ? .33 : shortLandscape ? .44 : .515);
    const glow = c.createRadialGradient(x, y, 10, x, y, Math.max(w * .47, h * .55)); glow.addColorStop(0, 'rgba(130,143,88,.24)'); glow.addColorStop(1, 'rgba(88,109,65,0)'); c.fillStyle = glow; c.fillRect(0, 0, w, h);
    // A measured, slightly tilted topographic drafting field behind the hero.
    c.save(); c.translate(x, y); c.rotate(-.16);
    c.strokeStyle = 'rgba(213,218,177,.065)'; c.lineWidth = 1;
    const grid = 54; for (let i = -24; i <= 24; i++) { c.beginPath(); c.moveTo(i * grid, -h); c.lineTo(i * grid, h); c.stroke(); c.beginPath(); c.moveTo(-w, i * grid); c.lineTo(w, i * grid); c.stroke(); }
    const r = random(3189); c.strokeStyle = 'rgba(188,202,149,.05)';
    for (let k = 0; k < 13; k++) { c.beginPath(); for (let i = 0; i <= 60; i++) { const a = i / 60 * TAU, rr = 190 + k * 34 + Math.sin(a * 3 + k * .12) * 28 + Math.cos(a * 5) * 18; const px = Math.cos(a) * rr * 1.15, py = Math.sin(a) * rr * .72; if (i) c.lineTo(px, py); else c.moveTo(px, py); } c.closePath(); c.stroke(); }
    for (let i = 0; i < 60; i++) { const px = (r() - .5) * w, py = (r() - .5) * h; line(c, px - 3, py, px + 3, py, 'rgba(205,215,174,.12)', .6); line(c, px, py - 3, px, py + 3, 'rgba(205,215,174,.12)', .6); }
    c.restore();
    const size = mobile ? clamp(Math.min(w / 115, (h - 450) / 105), 2.15, 4.5)
      : shortLandscape ? clamp(Math.min(w / 300, h / 155), 2.2, 4)
      : clamp(Math.min(w / 245, h / 135), 3.1, 7.2);
    const heroAngle = shortLandscape ? -.1 : -.48;
    c.save(); c.translate(x, y); c.rotate(-.06);
    c.strokeStyle = 'rgba(205,211,164,.11)'; c.lineWidth = 1; c.setLineDash([2, 7]); c.beginPath(); c.arc(0, 0, size * 42, 0, TAU); c.stroke(); c.setLineDash([]);
    c.strokeStyle = 'rgba(219,215,164,.28)';
    for (let i = 0; i < 4; i++) { const a = Math.PI * .25 + i * Math.PI / 2; c.beginPath(); c.arc(0, 0, size * 44, a - .12, a + .12); c.stroke(); }
    c.restore();
    c.save(); c.translate(x + size * 4, y + size * 5); c.rotate(heroAngle); c.scale(size, size);
    const shadow = c.createRadialGradient(0, 0, 3, 0, 0, 42); shadow.addColorStop(0, 'rgba(4,16,10,.55)'); shadow.addColorStop(1, 'rgba(4,16,10,0)'); c.fillStyle = shadow; c.fillRect(-48, -44, 96, 88); c.restore();
    c.save(); c.translate(x, y); c.scale(size, size);
    this.drawTank({ x: 0, y: 0, type: tankClass, isPlayer: true, team: 0, alive: true, angle: heroAngle + Math.sin(time * .16) * .018, turretAngle: heroAngle - .01 + Math.sin(time * .23) * .045, speed: 0, reloadLeft: 0 }, time, true);
    c.restore();
    const left = c.createLinearGradient(0, 0, w * (mobile ? 1 : .66), 0); left.addColorStop(0, mobile ? 'rgba(9,22,17,.13)' : 'rgba(9,22,17,.88)'); left.addColorStop(.58, mobile ? 'rgba(9,22,17,0)' : 'rgba(9,22,17,.44)'); left.addColorStop(1, 'rgba(9,22,17,0)'); c.fillStyle = left; c.fillRect(0, 0, w, h);
    if (mobile) { const bottom = c.createLinearGradient(0, h * .22, 0, h * .65); bottom.addColorStop(0, 'rgba(13,29,22,0)'); bottom.addColorStop(1, 'rgba(13,29,22,.94)'); c.fillStyle = bottom; c.fillRect(0, 0, w, h); }
    // Low cost film grain distributed deterministically in screen space.
    const noise = random(991); c.fillStyle = 'rgba(237,233,190,.018)'; for (let i = 0; i < 350; i++) c.fillRect(noise() * w, noise() * h, 1, 1);
  }
}
