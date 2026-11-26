import { canBreathe, GAS_KG_PER_UNIT } from './environment.js';
import { buildingBounds, buildingPort, BUILDING_FOOTPRINTS } from './footprint.js';
import { atmosphereOf } from './atmosphere.js';
import { BUILDINGS } from './engine.js';

const TAU = Math.PI * 2;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const noise = (x, y = 0, salt = 0) => {
  let n = Math.imul((x | 0) + 17, 374761393) ^ Math.imul((y | 0) + 29, 668265263) ^ Math.imul(salt + 7, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};

const COLORS = {
  cave: '#102128', deep: '#08161e', ink: '#132129', mint: '#9aebc2',
  coral: '#ed987e', gold: '#dfc080', lilac: '#bab0df', paper: '#e9eee5',
};
const TERRAIN = {
  rock:    { base: '#655950', edge: '#8b7762', dark: '#403f3b', fleck: '#a49275' },
  dirt:    { base: '#896c4e', edge: '#b58b60', dark: '#574a3a', fleck: '#ccb18a' },
  copper:  { base: '#685857', edge: '#b78377', dark: '#463e42', fleck: '#e3a78e' },
  algae:   { base: '#405c50', edge: '#6a9a70', dark: '#2c4640', fleck: '#b0c990' },
  coal:    { base: '#383d45', edge: '#656476', dark: '#292f38', fleck: '#9390ad' },
  abyssalite: { base:'#564c68', edge:'#9e87b8', dark:'#332e44', fleck:'#b69bc8' },
  ice:     { base: '#788f9f', edge: '#c0d7d8', dark: '#546a83', fleck: '#e1e7e2' },
  bedrock: { base: '#34383f', edge: '#53505e', dark: '#232b33', fleck: '#77717d' },
  tile:    { base: '#65736d', edge: '#b2c3ac', dark: '#354a47', fleck: '#a9b6a5' },
};
const PIPE_LAYERS = [
  { key:'pipe', stored:'cleanWater', flow:'pipeFlow', x:.35, y:.37, color:'#86d7e7', dark:'#315564', label:'청수' },
  { key:'wastepipe', stored:'dirtyWater', flow:'wasteFlow', x:.65, y:.59, color:'#d2b074', dark:'#675844', label:'오수' },
  { key:'gaspipe', cellKey:'gasPipe', packet:'gasPacket', x:.5, y:.5, color:'#8bc8b7', dark:'#315b54', label:'기체', removeTool:'removeGasPipe' },
];
const GAS_PORTS = {gasPump:'out',gasVent:'in',hydrogenGen:'in'};
const FLUID_PORTS = {
  core:{water:'both'}, reservoir:{water:'both',waste:'both'}, pump:{water:'out'},
  farm:{water:'in'}, research:{water:'in'}, toilet:{water:'in',waste:'out'},
  sink:{water:'in',waste:'out'}, purifier:{water:'out',waste:'in'},
  steamTurbine:{water:'out'}, electrolyzer:{water:'in'}, cooler:{water:'in',waste:'out'}, kitchen:{water:'in'},
};
const CARGO = {
  soil:{label:'흙',color:'#ad8655',dark:'#594127'},
  rock:{label:'광석',color:'#c5ae89',dark:'#665746'},
  metal:{label:'금속',color:'#e0b4a1',dark:'#8a6461'},
  algae:{label:'조류',color:'#b6d494',dark:'#53765d'},
  coal:{label:'석탄',color:'#b3abc9',dark:'#454654'},
};
const ROOM_STYLES = {
  bedroom:{name:'침실',color:'#c7b6e6',fill:'rgba(177,151,212,.16)'},
  messhall:{name:'식당',color:'#e4c48f',fill:'rgba(216,180,117,.15)'},
  greenhouse:{name:'온실',color:'#a5d6a3',fill:'rgba(135,195,132,.16)'},
  generic:{name:'미분류',color:'#a2b2ae',fill:'rgba(132,158,151,.055)'},
};
const SKILL_STYLES = {
  dig:{color:'#dec08b',dark:'#645740'},
  engineering:{color:'#b7c4e5',dark:'#45516c'},
  life:{color:'#b8d5a0',dark:'#496550'},
};
const cargoStyle = resource => CARGO[resource] || {label:'자원',color:'#c0cbb4',dark:'#586b60'};
const quantity = amount => amount>=1000?`${(amount/1000).toFixed(1)}k`:String(Number(amount.toFixed(amount<10?1:0)));

function rounded(ctx, x, y, w, h, r, fill, stroke, width = .035) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function line(ctx, points, color, width = .035) {
  if (!points.length) return;
  ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function circle(ctx, x, y, r, fill, stroke, width = .035) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = fill; ctx.fill();
}
function polygon(ctx, points, fill, stroke, width = .025) {
  ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function droplet(ctx, x, y, r, fill, stroke, width = .02) {
  ctx.beginPath(); ctx.moveTo(x, y-r);
  ctx.bezierCurveTo(x-r*.32,y-r*.4,x-r*.8,y+r*.1,x-r*.68,y+r*.48);
  ctx.bezierCurveTo(x-r*.5,y+r,x+r*.5,y+r,x+r*.68,y+r*.48);
  ctx.bezierCurveTo(x+r*.8,y+r*.1,x+r*.32,y-r*.4,x,y-r);
  ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
}

/** Canvas-only presentation. All simulation changes remain in Game. */
export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = game;
    this.overlay = 'normal';
    this.tool = 'inspect';
    this.hover = null;
    this.selection = null;
    this.dragRect = null;
    this.cellSize = 26;
    this.offsetX = 0;
    this.offsetY = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this._fitted = false;
    this._crewPositions = new Map();
    this._tiles = this._makeTiles();
    this.resize();
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width || this.canvas.clientWidth || 800));
    const height = Math.max(1, Math.round(bounds.height || this.canvas.clientHeight || 600));
    const oldX = (this.width / 2 - this.offsetX) / this.cellSize;
    const oldY = (this.height / 2 - this.offsetY) / this.cellSize;
    this.width = width; this.height = height;
    this.dpr = Math.min(2.5, Math.max(1, finite(window.devicePixelRatio, 1)));
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    if (!this._fitted) this.fit();
    else {
      this.offsetX = width / 2 - oldX * this.cellSize;
      this.offsetY = height / 2 - oldY * this.cellSize;
      this._constrainCamera();
    }
    return this;
  }

  fit() {
    const core = this.game?.buildings?.find(b => b.type === 'core');
    const cx = core ? core.x + .5 : (this.game?.w || 48) / 2;
    const cy = core ? core.y + 2 : (this.game?.h || 28) / 2;
    this.cellSize = clamp(Math.min(this.width / 37, this.height / 21), 12, 30);
    this.offsetX = this.width / 2 - cx * this.cellSize;
    this.offsetY = this.height / 2 - cy * this.cellSize;
    this._fitted = true;
    this._constrainCamera();
    return this;
  }

  centerOn(x, y) {
    // World coordinates are continuous; crew positions already include the cell center.
    this.offsetX = this.width / 2 - finite(x) * this.cellSize;
    this.offsetY = this.height / 2 - finite(y) * this.cellSize;
    this._constrainCamera();
    return this;
  }

  pan(dx, dy) {
    this.offsetX += finite(dx); this.offsetY += finite(dy);
    this._constrainCamera();
    return this;
  }

  zoomAt(factor, clientX, clientY) {
    if (!Number.isFinite(factor) || factor <= 0) return this;
    const r = this.canvas.getBoundingClientRect();
    const x = finite(clientX, r.left + this.width / 2) - r.left;
    const y = finite(clientY, r.top + this.height / 2) - r.top;
    const wx = (x - this.offsetX) / this.cellSize;
    const wy = (y - this.offsetY) / this.cellSize;
    this.cellSize = clamp(this.cellSize * factor, 10, 76);
    this.offsetX = x - wx * this.cellSize;
    this.offsetY = y - wy * this.cellSize;
    this._constrainCamera();
    return this;
  }

  screenToCell(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: Math.floor((clientX - r.left - this.offsetX) / this.cellSize),
      y: Math.floor((clientY - r.top - this.offsetY) / this.cellSize),
    };
  }

  _constrainCamera() {
    const w = (this.game?.w || 48) * this.cellSize;
    const h = (this.game?.h || 28) * this.cellSize;
    const margin = this.cellSize * 2;
    this.offsetX = w < this.width - margin * 2 ? (this.width - w) / 2
      : clamp(this.offsetX, this.width - w - margin, margin);
    this.offsetY = h < this.height - margin * 2 ? (this.height - h) / 2
      : clamp(this.offsetY, this.height - h - margin, margin);
  }

  _cell(x, y) {
    if (x < 0 || y < 0 || x >= this.game.w || y >= this.game.h) return null;
    return this.game.cells[y * this.game.w + x];
  }

  _makeTiles() {
    const result = {};
    for (const [type, palette] of Object.entries(TERRAIN)) {
      result[type] = [];
      for (let variant = 0; variant < 4; variant++) {
        const tile = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(64, 64)
          : this.canvas.ownerDocument.createElement('canvas');
        tile.width = 64; tile.height = 64;
        const c = tile.getContext('2d');
        c.scale(64, 64); c.lineCap = 'round'; c.lineJoin = 'round';
        c.fillStyle = palette.base; c.fillRect(0, 0, 1, 1);
        if (type === 'tile') {
          c.fillStyle = palette.edge; c.fillRect(0, 0, 1, .12);
          c.fillStyle = palette.dark; c.fillRect(0, .78, 1, .22);
          line(c, [[.02, .17], [.98, .17]], '#d4dcc3', .025);
          line(c, [[.07, .27], [.07, .68], [.93, .68], [.93, .27]], '#7e8d7d', .025);
          circle(c, .17, .42, .035, '#bbc7b2'); circle(c, .83, .42, .035, '#bbc7b2');
          result[type].push(tile); continue;
        }
        for (let k = 0; k < 5; k++) {
          const x = noise(k, variant, 2), y = noise(k, variant, 3);
          const r = .13 + noise(k, variant, 4) * .3;
          polygon(c, [[x-r, y], [x-r*.5, y-r*.6], [x+r*.6, y-r*.4], [x+r, y+r*.4], [x, y+r*.6]],
            k % 2 ? palette.edge : palette.dark);
          c.globalAlpha = .15;
          line(c, [[x-r*.4, y-r*.2], [x+r*.3, y-r*.4]], '#f3dac0', .025);
          c.globalAlpha = 1;
        }
        c.fillStyle = palette.base; c.globalAlpha = .48; c.fillRect(0, 0, 1, 1); c.globalAlpha = 1;
        for (let k = 0; k < 8; k++) {
          const x = .08 + noise(k, variant, 8) * .84;
          const y = .08 + noise(k, variant, 9) * .84;
          const r = .015 + noise(k, variant, 10) * .035;
          if (type === 'copper') {
            polygon(c, [[x-r*2,y], [x-r*.4,y-r*2], [x+r*2,y-r], [x+r,y+r*2]],
              k % 2 ? '#c38f83' : '#deb098', '#6f5354', .02);
            line(c, [[x-r*.4,y-r*1.2], [x+r,y-r*.6]], '#f4ccb0', .018);
          } else if (type === 'algae') {
            ellipse(c, x, y, r*2.4, r*1.7, k % 2 ? '#8dae79' : '#537e5a');
            circle(c, x-r*.3, y-r*.3, r*.5, '#c7d49b');
          } else if (type === 'coal') {
            polygon(c, [[x-r*2,y-r], [x+r,y-r*2], [x+r*2,y+r], [x-r,y+r*1.4]], '#2a3039', '#777287', .018);
          } else if (type === 'ice') {
            polygon(c, [[x,y-r*2.4], [x+r*2,y], [x+r*.4,y+r*2], [x-r*1.4,y]], '#abc8d0');
            line(c, [[x,y-r*1.8], [x+r*.1,y+r*1.3]], '#e1eff0', .022);
          } else {
            ellipse(c, x, y, r*1.8, r, k % 2 ? palette.fleck : palette.dark);
          }
        }
        line(c, [[0, .03], [.48, .015], [1, .04]], palette.edge, .025);
        line(c, [[.015, 1], [.02, .65]], palette.dark, .035);
        c.fillStyle = 'rgba(15,22,27,.1)'; c.fillRect(0, .93, 1, .07);
        result[type].push(tile);
      }
    }
    return result;
  }

  render(nowSeconds = 0) {
    const g = this.game, ctx = this.ctx;
    if (!g?.cells || !ctx) return;
    const t = finite(nowSeconds), simulationTime = finite(g.time,t);
    const s = this.cellSize;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.setLineDash([]);
    const bg = ctx.createLinearGradient(0, 0, this.width, this.height);
    bg.addColorStop(0, '#162a30'); bg.addColorStop(.55, '#0d2028'); bg.addColorStop(1, '#091820');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, this.width, this.height);
    this._dust(ctx, t);
    ctx.save(); ctx.translate(this.offsetX, this.offsetY); ctx.scale(s, s);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const x0 = clamp(Math.floor(-this.offsetX / s) - 1, 0, g.w - 1);
    const y0 = clamp(Math.floor(-this.offsetY / s) - 1, 0, g.h - 1);
    const x1 = clamp(Math.ceil((this.width - this.offsetX) / s) + 1, 0, g.w);
    const y1 = clamp(Math.ceil((this.height - this.offsetY) / s) + 1, 0, g.h);

    this._ambientLight(ctx, t);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const cell = this._cell(x, y);
        if (!cell?.revealed) continue;
        if (cell.solid) this._terrain(ctx, cell, x, y);
        else this._caveCell(ctx, cell, x, y, simulationTime);
      }
    }
    if (this.overlay === 'oxygen' || this.overlay === 'temperature' || this.overlay === 'gas') {
      this._environmentOverlay(ctx, x0, y0, x1, y1);
    }
    if (this.overlay === 'power' || this.overlay === 'plumbing' || this.overlay === 'logistics') {
      ctx.fillStyle = this.overlay==='plumbing'?'rgba(8,19,25,.44)':'rgba(8,19,25,.28)';
      ctx.fillRect(x0, y0, x1-x0, y1-y0);
    }
    const visibleRooms=this._roomsOverlay(ctx,x0,y0,x1,y1);
    this._wires(ctx, x0, y0, x1, y1, simulationTime);
    this._pipes(ctx, x0, y0, x1, y1, simulationTime);

    const buildings = g.buildings || [];
    for (const b of buildings) {
      const bounds=this._bounds(b);
      if (bounds.x+bounds.width < x0 || bounds.y+bounds.height < y0 || bounds.x > x1 || bounds.y > y1 || !this._cell(b.x,b.y)?.revealed) continue;
      if (b.type === 'tile' && b.progress >= 1 && this._cell(b.x,b.y)?.solid === 'tile') continue;
      ctx.save(); ctx.translate(bounds.x,bounds.y); ctx.scale(bounds.width,bounds.height);
      if (b.progress < 1) ctx.globalAlpha = .34;
      else if(this.overlay==='plumbing')ctx.globalAlpha=.68;
      else if(this.overlay==='logistics'&&!['core','storage'].includes(b.type))ctx.globalAlpha=.52;
      this._machine(ctx, b, simulationTime);
      ctx.restore();
      if (b.progress < 1) {
        ctx.save(); ctx.setLineDash([.1,.08]);
        rounded(ctx,bounds.x+.06,bounds.y+.05,bounds.width-.12,bounds.height-.1,.06,null,'#98d8cf',.028); ctx.restore();
      } else this._machineStatus(ctx,b,simulationTime);
      this._machinePorts(ctx,b,simulationTime);
    }
    this._logisticsOverlay(ctx,x0,y0,x1,y1);
    this._debris(ctx,x0,y0,x1,y1);
    this._tasks(ctx,simulationTime);
    this._selectedPath(ctx);
    this._oxygenTransfers(ctx,x0,y0,x1,y1);
    for (const crew of g.crew || []) this._drawCrew(ctx,crew,simulationTime);
    this._roomLabels(ctx,visibleRooms);
    this._frontierLabels(ctx,x0,y0,x1,y1);

    this._fog(ctx,x0,y0,x1,y1,t);
    this._interaction(ctx,t);
    ctx.restore();
    this._vignette(ctx);
  }

  _dust(ctx,t) {
    for (let i=0;i<42;i++) {
      const x=(noise(i,7)*this.width + Math.sin(t*.05+i)*18 + this.width)%this.width;
      const y=(noise(i,13)*this.height - t*(.5+noise(i,9)) + this.height*1000)%this.height;
      ctx.fillStyle = i%5===0 ? 'rgba(157,217,185,.13)' : 'rgba(193,206,197,.06)';
      ctx.fillRect(x,y,i%7===0?2:1,i%7===0?2:1);
    }
  }

  _ambientLight(ctx,t) {
    const core=this.game.buildings?.find(b=>b.type==='core');
    if (!core) return;
    const glow=ctx.createRadialGradient(core.x+.5,core.y+.4,.1,core.x+.5,core.y+.4,9);
    glow.addColorStop(0,`rgba(106,168,133,${.16+Math.sin(t*.7)*.012})`);
    glow.addColorStop(.45,'rgba(79,129,114,.06)'); glow.addColorStop(1,'rgba(79,129,114,0)');
    ctx.fillStyle=glow; ctx.fillRect(core.x-9,core.y-9,19,19);
  }

  _terrain(ctx,cell,x,y) {
    const kind=TERRAIN[cell.solid]?cell.solid:'rock';
    const variant=Math.floor(noise(x,y,19)*4);
    ctx.drawImage(this._tiles[kind][variant],x,y,1,1);
    if (cell.insulated) {
      line(ctx,[[x+.08,y+.72],[x+.36,y+.28],[x+.64,y+.72],[x+.92,y+.28]],'#e8cd94',.07);
    }
    if (kind!=='tile') {
      const depth=clamp((y-13)/45,0,.2);
      if(depth){ctx.fillStyle=`rgba(11,19,27,${depth})`;ctx.fillRect(x,y,1,1);}
      const up=this._cell(x,y-1), left=this._cell(x-1,y), right=this._cell(x+1,y);
      if(up?.revealed && !up.solid) {
        line(ctx,[[x+.035,y+.045],[x+.96,y+.045]],TERRAIN[kind].edge,.065);
        ctx.fillStyle='rgba(7,15,20,.13)';ctx.fillRect(x,y-.04,1,.04);
      }
      if(left?.revealed && !left.solid)line(ctx,[[x+.035,y+.05],[x+.035,y+.95]],TERRAIN[kind].edge,.04);
      if(right?.revealed && !right.solid)line(ctx,[[x+.97,y+.08],[x+.97,y+.96]],TERRAIN[kind].dark,.055);
    }
  }

  _caveCell(ctx,cell,x,y,t) {
    const n=noise(x,y,11);
    if(n>.55) {
      ctx.fillStyle='rgba(127,149,139,.035)';
      polygon(ctx,[[x+.1,y+.8],[x+.2,y+.22],[x+.7,y+.13],[x+.95,y+.5]],ctx.fillStyle);
    }
    if (this.overlay==='normal') {
      const co2=clamp(finite(cell.co2),0,1.5);
      if(co2>.1) {ctx.fillStyle=`rgba(124,104,132,${co2*.09})`;ctx.fillRect(x,y,1,1);}
      else if(finite(cell.oxygen)>.55) {ctx.fillStyle='rgba(96,185,160,.018)';ctx.fillRect(x,y,1,1);}
    }
    const above=this._cell(x,y-1);
    if(above?.solid && above.revealed && above.solid!=='tile') {
      line(ctx,[[x,y+.015],[x+1,y+.015]],'rgba(3,10,15,.4)',.09);
      if(n>.67) {
        const length=.13+n*.15;
        line(ctx,[[x+.2,y],[x+.26,y+length],[x+.22,y+length+.08]],'#526b54',.035);
        if(n>.85)ellipse(ctx,x+.3,y+length*.7,.07,.035,'#6c8562');
      }
    }
    if(this.tool!=='inspect' && this.tool!=='pan' && this.tool!=='move') {
      ctx.fillStyle='rgba(174,207,187,.11)';ctx.fillRect(x-.015,y-.015,.03,.03);
    }
    const water=clamp(finite(cell.water),0,1);
    if(water>.005)this._water(ctx,x,y,water,t);
    if(cell.frost>.005){
      const depth=Math.min(1,cell.frost);
      ctx.fillStyle='#a4d4dc';ctx.fillRect(x,y+1-depth,1,depth);
      line(ctx,[[x,y+1-depth],[x+1,y+1-depth]],'#e3f6f6',.045);
    }
    if(cell.steam>.015){
      ctx.fillStyle=`rgba(231,240,245,${Math.min(.55,.08+cell.steam*.08)})`;
      ctx.fillRect(x,y,1,1);
    }
    if(cell.steamVent){
      polygon(ctx,[[x+.05,y+.99],[x+.3,y+.74],[x+.43,y+.79],[x+.61,y+.71],[x+.95,y+.99]],'#846759');
      line(ctx,[[x+.31,y+.8],[x+.49,y+.86],[x+.61,y+.76]],'#fbbd86',.055);
    }
    if(cell.spring)this._spring(ctx,x,y,t);
  }

  _spring(ctx,x,y,t) {
    ctx.save();
    ellipse(ctx,x+.5,y+.89,.31,.095,'#244e61');
    line(ctx,[[x+.21,y+.9],[x+.33,y+.79],[x+.48,y+.86],[x+.64,y+.78],[x+.8,y+.89]],'#87bfca',.045);
    droplet(ctx,x+.51,y+.52,.15,'#8cd4df','#d7f0d9',.025);
    circle(ctx,x+.51,y+.53,.055,'#d8f0de');
    if(this.overlay==='plumbing'||this.cellSize>=30){
      const fs=9/this.cellSize;ctx.font=`600 ${fs}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      rounded(ctx,x+.5-ctx.measureText('지하수').width/2-.1,y-.25,ctx.measureText('지하수').width+.2,fs+.13,.04,'rgba(16,44,54,.92)');
      ctx.fillStyle='#c0e6de';ctx.fillText('지하수',x+.5,y-.18+fs/2);
    }
    ctx.restore();
  }

  _water(ctx,x,y,amount,t) {
    const above=this._cell(x,y-1);
    const surface=!(above && above.water>.05 && !above.solid);
    const top=y+1-amount;
    const grad=ctx.createLinearGradient(0,top,0,y+1);
    grad.addColorStop(0,'rgba(91,178,196,.66)');grad.addColorStop(1,'rgba(49,108,144,.78)');
    ctx.fillStyle=grad;ctx.fillRect(x,top,1,amount+.01);
    if(surface) {
      ctx.beginPath();ctx.moveTo(x,top);
      for(let k=0;k<=8;k++)ctx.lineTo(x+k/8,top+Math.sin((x+k/8)*2.5+t*1.6)*.035);
      ctx.lineTo(x+1,top+.08);ctx.lineTo(x,top+.08);ctx.closePath();ctx.fillStyle='rgba(168,222,217,.43)';ctx.fill();
      line(ctx,[[x+.08,top+.015],[x+.38,top+.015]],'rgba(207,241,224,.5)',.018);
    }
    if(amount>.3 && noise(x,y,62)>.68) {
      const p=(t*.2+noise(x,y,8))%1;
      circle(ctx,x+.2+noise(x,y,9)*.6,y+1-p*amount,.022,'rgba(188,230,228,.45)');
    }
  }

  _environmentOverlay(ctx,x0,y0,x1,y1) {
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++) {
      const c=this._cell(x,y);if(!c?.revealed)continue;
      let color,h2Fraction=0,parcel=null;
      if(this.overlay==='oxygen') {
        if(c.solid)continue;
        const o=canBreathe(c)?clamp(finite(c.oxygen)/.8,0,1):0;
        color=o>.65?`rgba(97,204,165,${.13+o*.16})`:o>.25?'rgba(222,183,102,.24)':'rgba(217,112,103,.27)';
      } else if(this.overlay==='temperature') {
        const temp=finite(c.temp,20);
        color=temp<10?'rgba(123,157,211,.34)':temp<22?'rgba(105,184,176,.2)':temp<32?'rgba(219,180,107,.22)':temp<45?'rgba(229,130,92,.34)':'rgba(207,78,78,.44)';
      } else {
        if(this.game.modernRules){
          if(c.solid||c.water>1e-9||c.frost>1e-9)continue;
          parcel=atmosphereOf(c);
          const colors={oxygen:'83,199,165',co2:'173,143,105',steam:'220,226,241',hydrogen:'204,127,209'};
          color=parcel?`rgba(${colors[parcel.element]},${.2+.4*Math.min(1,parcel.massKg/2)})`:'rgba(19,20,32,.59)';
        }else{
        const hydrogenKg=Math.max(0,finite(c.hydrogen));
        const gasKg=Math.max(0,finite(c.oxygen))*GAS_KG_PER_UNIT+Math.max(0,finite(c.co2))*GAS_KG_PER_UNIT+Math.max(0,finite(c.steam))+hydrogenKg;
        h2Fraction=gasKg>1e-9?clamp(hydrogenKg/gasKg,0,1):0;
        color=h2Fraction>.001?`rgba(89,164,219,${.08+h2Fraction*.48})`:'rgba(122,153,158,.08)';
        }
      }
      ctx.fillStyle=color;ctx.fillRect(x,y,1.01,1.01);
      if(this.cellSize>40 && !c.solid && x%2===0 && y%2===0) {
        ctx.fillStyle='rgba(236,242,228,.68)';ctx.font=`${8/this.cellSize}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
        const label=this.overlay==='oxygen'?(canBreathe(c)?`${Math.round(clamp(c.oxygen/.8,0,1)*100)}%`:'×'):this.overlay==='temperature'?`${Math.round(c.temp)}°`:this.game.modernRules?(parcel?`${Math.round(parcel.massKg*1000)}g`:'진공'):`${Math.round(h2Fraction*100)}% H₂`;
        ctx.fillText(label,x+.5,y+.5);
      }
    }
  }

  _wires(ctx,x0,y0,x1,y1,t) {
    const highlighted=this.overlay==='power'||this.tool==='wire';
    const activePorts=highlighted?new Set((this.game.buildings||[]).filter(b=>b.progress>=1&&b.active&&b.enabled!==false&&Math.abs(finite(BUILDINGS[b.type]?.power))>0).map(b=>this.game.modernRules?(buildingPort(b,'power')||b):b).map(p=>p.y*this.game.w+p.x)):null;
    ctx.save();
    if(['plumbing','logistics'].includes(this.overlay)&&!highlighted)ctx.globalAlpha=.25;
    const color=highlighted?'#e4c888':'#627c71';
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++) {
      const c=this._cell(x,y);if(!c?.revealed||!c.wire)continue;
      const px=x+.5,py=y+.72;
      for(const [dx,dy] of [[1,0],[0,1]]) {
        const n=this._cell(x+dx,y+dy);if(!n?.revealed||!n.wire)continue;
        if(highlighted)line(ctx,[[px,py],[px+dx,py+dy]],'rgba(230,195,112,.11)',.18);
        line(ctx,[[px,py],[px+dx,py+dy]],'#10242a',highlighted?.105:.085);
        line(ctx,[[px,py],[px+dx,py+dy]],color,highlighted?.055:.033);
      }
      circle(ctx,px,py,highlighted?.055:.025,color);
      if(highlighted)circle(ctx,px,py,.023,'#37433b');
      if(activePorts?.has(y*this.game.w+x))circle(ctx,px,py,.025+.012*(1+Math.sin(t*4)),'#fff0b5');
    }
    ctx.restore();
  }

  _pipes(ctx,x0,y0,x1,y1,t) {
    const plumbing=this.overlay==='plumbing';
    for(const layer of PIPE_LAYERS){
      const gas=layer.key==='gaspipe',highlighted=gas?this.overlay==='gas'||this.tool===layer.key||this.tool===layer.removeTool:plumbing||this.tool===layer.key||this.tool===(layer.key==='pipe'?'removePipe':'removeWastepipe');
      ctx.save();ctx.globalAlpha=highlighted?1:this.overlay==='normal'?.43:.18;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
        const c=this._cell(x,y);if(!c?.revealed||!c[layer.cellKey||layer.key])continue;
        const px=x+layer.x,py=y+layer.y;
        for(const [dx,dy] of [[1,0],[0,1]]){
          const n=this._cell(x+dx,y+dy);if(!n?.revealed||!n[layer.cellKey||layer.key])continue;
          const points=[[px,py],[px+dx,py+dy]];
          line(ctx,points,'#10242b',highlighted?.15:.105);
          line(ctx,points,layer.dark,highlighted?.105:.075);
          if(layer.key==='wastepipe')ctx.setLineDash([.115,.065]);
          if(gas)ctx.setLineDash([.025,.045]);
          line(ctx,points,layer.color,highlighted?.055:.035);ctx.setLineDash([]);
        }
        const packet=layer.packet&&c[layer.packet],filled=gas?!!packet:finite(c[layer.stored])>.001;
        if(layer.key==='pipe'){
          circle(ctx,px,py,highlighted?.075:.045,'#16333d',layer.color,highlighted?.025:.018);
          if(filled||this.game.modernRules&&c.dirtyWater>0)circle(ctx,px,py,highlighted?.05:.027,c.dirtyWater>0&&this.game.modernRules?'#d6aa59':'#b9e6df');
        }else if(gas){
          polygon(ctx,[[px,py-.09],[px+.09,py],[px,py+.09],[px-.09,py]],'#183b39',layer.color,highlighted?.03:.018);
          if(filled){const colors={oxygen:'#c8f2df',co2:'#d5c5a2',steam:'#fff1cf',hydrogen:'#b9d7ef'};circle(ctx,px,py,.035,colors[packet.element]||'#d8eadb');}
        }else{
          rounded(ctx,px-.067,py-.067,.134,.134,.016,'#2f302b',layer.color,.023);
          if(filled)rounded(ctx,px-.03,py-.03,.06,.06,.006,'#e0c498');
        }
        if(highlighted&&(gas?filled:finite(c[layer.flow])>.0001)){
          // The public rate belongs to this cell; it does not establish the
          // direction or flux of any one of its neighboring segments.
          const pulse=.025+.018*(1+Math.sin(t*4+noise(x,y,17)*TAU));
          circle(ctx,px,py,pulse,gas?'#d9f3df':layer.key==='pipe'?'#e4f5df':'#fff0cc');
        }
      }
      ctx.restore();
    }
  }

  _worldLabel(ctx,text,x,y,color='#d5e6c8',background='rgba(17,37,41,.94)') {
    const fs=Math.max(8,Math.min(10,this.cellSize*.36))/this.cellSize;
    ctx.save();ctx.font=`600 ${fs}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    const width=ctx.measureText(text).width+.2;
    rounded(ctx,x-width/2,y-(fs+.13)/2,width,fs+.13,.05,background);
    ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.restore();
  }

  _roomsOverlay(ctx,x0,y0,x1,y1) {
    if(this.overlay!=='rooms')return [];
    const result=[],w=this.game.w,h=this.game.h;
    ctx.save();
    ctx.fillStyle='rgba(8,20,26,.23)';ctx.fillRect(x0,y0,x1-x0,y1-y0);
    for(const room of this.game.rooms||[]){
      if(!Array.isArray(room.cells)||!room.cells.length)continue;
      // Use the engine's actual component, never the room's bounding rectangle.
      // Hidden cells are neither tinted nor used as a label anchor.
      const cells=new Set(room.cells.filter(i=>Number.isInteger(i)&&i>=0&&i<w*h));
      const visible=[];
      for(const i of cells){
        const x=i%w,y=Math.floor(i/w),cell=this._cell(x,y);
        if(x>=x0&&x<x1&&y>=y0&&y<y1&&cell?.revealed&&!cell.solid)visible.push({x,y});
      }
      if(!visible.length)continue;
      const contains=at=>at&&Number.isInteger(at.x)&&Number.isInteger(at.y)&&at.x>=0&&at.x<w&&at.y>=0&&at.y<h&&cells.has(at.y*w+at.x);
      const selected=!!contains(this.selection),hovered=!!contains(this.hover);
      const style=ROOM_STYLES[room.type]||ROOM_STYLES.generic;
      ctx.fillStyle=style.fill;
      for(const {x,y} of visible)ctx.fillRect(x,y,1,1);
      if(selected||hovered){
        ctx.fillStyle=selected?'rgba(210,231,211,.065)':'rgba(210,231,211,.028)';
        for(const {x,y} of visible)ctx.fillRect(x,y,1,1);
      }
      ctx.setLineDash(room.valid?[]:[.13,.09]);
      ctx.strokeStyle=style.color;ctx.lineWidth=selected?.075:hovered?.05:.027;
      ctx.globalAlpha=selected?1:hovered?.88:room.valid?.72:.36;
      ctx.beginPath();
      for(const {x,y} of visible){
        const member=(nx,ny)=>nx>=0&&nx<w&&ny>=0&&ny<h&&cells.has(ny*w+nx);
        if(!member(x,y-1)){ctx.moveTo(x+.025,y+.035);ctx.lineTo(x+.975,y+.035);}
        if(!member(x,y+1)){ctx.moveTo(x+.025,y+.965);ctx.lineTo(x+.975,y+.965);}
        if(!member(x-1,y)){ctx.moveTo(x+.035,y+.025);ctx.lineTo(x+.035,y+.975);}
        if(!member(x+1,y)){ctx.moveTo(x+.965,y+.025);ctx.lineTo(x+.965,y+.975);}
      }
      ctx.stroke();ctx.globalAlpha=1;ctx.setLineDash([]);
      result.push({room,style,selected,hovered,visible});
    }
    ctx.restore();return result;
  }

  _roomLabels(ctx,rooms) {
    for(const {room,style,selected,hovered,visible} of rooms){
      if((!room.valid&&!selected&&!hovered)||(this.cellSize<18&&!selected&&!hovered))continue;
      let anchor;
      if(!room.valid&&(selected||hovered)&&finite(room.area)>64){
        const at=selected?this.selection:this.hover;
        anchor=visible.find(p=>p.x===at.x&&p.y===at.y);
      }
      if(!anchor){
        const top=Math.min(...visible.map(p=>p.y));
        const row=visible.filter(p=>p.y===top).sort((a,b)=>a.x-b.x);
        anchor=row[Math.floor(row.length/2)];
      }
      if(!anchor)continue;
      const name=String(room.name||style.name).slice(0,20);
      const area=Math.max(0,Math.round(finite(room.area,room.cells.length)));
      this._worldLabel(ctx,`${name} · ${area}칸`,anchor.x+.5,anchor.y+.31,style.color,selected?'rgba(29,47,48,.97)':'rgba(18,35,40,.92)');
      if(!room.valid&&(selected||hovered)&&room.reasons?.length){
        const reason=String(room.reasons[0]),short=reason.length>22?`${reason.slice(0,21)}…`:reason;
        this._worldLabel(ctx,short,anchor.x+.5,anchor.y+.78,'#e3bd94','rgba(56,43,36,.94)');
      }
    }
  }

  _refillingDock(c) {
    if(c._job?.kind!=='refillOxygen'||c.path?.length||c.maskMode==='off'||finite(c.health,100)<=0)return null;
    if(finite(c.portableOxygen)>=finite(c.portableCapacity)||!Number.isFinite(c.x)||!Number.isFinite(c.y))return null;
    return (this.game.buildings||[]).find(b=>b.id===c._job.targetId&&b.type==='oxygenDock'&&b.progress>=1&&b.enabled!==false&&finite(b.oxygenStored)>0&&finite(this._cell(b.x,b.y)?.water)<.5&&Math.hypot(c.x-b.x-.5,c.y-b.y-.5)<=.05)||null;
  }

  _oxygenTransfers(ctx,x0,y0,x1,y1) {
    for(const c of this.game.crew||[]){
      const dock=this._refillingDock(c);
      if(!dock||dock.x<x0-1||dock.x>x1||dock.y<y0-1||dock.y>y1||!this._cell(dock.x,dock.y)?.revealed||!this._cell(Math.floor(c.x),Math.floor(c.y))?.revealed)continue;
      // A connected hose describes an arrived refill job, not an inferred flux.
      // Compression is shown separately by the station's actual active flag.
      const start=[dock.x+.81,dock.y+.72],end=[c.x-.24*(c.facing===-1?-1:1),c.y+.035];
      const middle=[(start[0]+end[0])/2,Math.max(start[1],end[1])+.14];
      line(ctx,[start,middle,end],'#1c4248',.075);
      line(ctx,[start,middle,end],'#b3d8cd',.032);
      circle(ctx,start[0],start[1],.044,'#d5e6c5');
    }
  }

  _frontierLabels(ctx,x0,y0,x1,y1) {
    for(const b of this.game.buildings||[]){
      if(!['door','oxygenDock'].includes(b.type)||b.progress<1||b.x<x0||b.x>=x1||b.y<y0||b.y>=y1||!this._cell(b.x,b.y)?.revealed)continue;
      const selected=[this.hover,this.selection].some(at=>at?.x===b.x&&at?.y===b.y);
      if(b.type==='door'){
        if(!selected)continue;
        const mode={auto:'자동',open:'열림 유지',locked:'잠금'}[b.doorMode]||'자동';
        const state=b.doorOpen===true?'열림':'닫힘';
        this._worldLabel(ctx,`${mode} · ${state}`,b.x+.5,b.y-.19,b.doorMode==='locked'?'#edb090':'#c3dfc5');
      }else if(selected||(this.overlay==='oxygen'&&this.cellSize>=18)){
        const stored=clamp(finite(b.oxygenStored),0,Math.max(0,finite(b.oxygenCapacity)));
        const capacity=Math.max(0,finite(b.oxygenCapacity));
        this._worldLabel(ctx,`O₂ ${quantity(stored)} / ${quantity(capacity)}`,b.x+.5,b.y-.19,'#bce5d4');
        if(selected){
          const filling=(this.game.crew||[]).some(c=>this._refillingDock(c)?.id===b.id);
          const status=b.enabled===false?'압축 중지':b.active?'주변 산소 압축 중':'압축 대기';
          this._worldLabel(ctx,`${status}${filling?' · 장비 충전':''}`,b.x+.5,b.y+1.23,filling?'#d8e5ad':'#b4c9c1');
        }
      }
    }
  }

  _resourceGlyph(ctx,resource,x,y,size=1) {
    const palette=cargoStyle(resource);
    ctx.save();ctx.translate(x,y);ctx.scale(size,size);
    if(resource==='metal'){
      polygon(ctx,[[-.35,.04],[-.22,-.12],[.16,-.12],[.29,.04],[.2,.15],[-.27,.15]],palette.dark,'#e0baa4',.035);
      polygon(ctx,[[-.24,-.1],[-.12,-.28],[.26,-.28],[.38,-.1],[.26,.02],[-.12,.02]],palette.color,'#a57e71',.035);
      line(ctx,[[-.1,-.25],[.24,-.25]],'#f0d1b1',.03);
    }else if(resource==='algae'){
      for(const [px,py,a] of [[-.22,.04,-.5],[.02,-.1,.35],[.2,.02,.8]]){
        ctx.save();ctx.translate(px,py);ctx.rotate(a);ellipse(ctx,0,0,.22,.12,palette.dark);ellipse(ctx,0,-.03,.18,.09,palette.color);line(ctx,[[-.14,-.02],[.14,-.02]],'#d9dfa8',.023);ctx.restore();
      }
      line(ctx,[[-.2,.14],[.22,.14]],'#c8bc8c',.04);
    }else{
      const fill=resource==='coal'?'#444956':palette.color;
      polygon(ctx,[[-.38,.11],[-.35,-.09],[-.17,-.2],[.02,-.1],[.1,.13]],fill,palette.dark,.04);
      polygon(ctx,[[-.08,.13],[-.02,-.19],[.2,-.29],[.37,-.05],[.34,.14]],fill,palette.dark,.04);
      line(ctx,[[.03,-.14],[.18,-.23],[.3,-.04]],resource==='coal'?'#8d89a3':'#e0c8a1',.035);
      polygon(ctx,[[-.12,.18],[-.14,.02],[.04,-.04],[.19,.12],[.12,.2]],resource==='coal'?'#626075':'#ac987b',palette.dark,.035);
    }
    ctx.restore();
  }

  _debris(ctx,x0,y0,x1,y1) {
    const grouped=new Map();
    for(const pile of this.game.debris||[]){
      if(!Number.isInteger(pile.x)||!Number.isInteger(pile.y)||finite(pile.amount)<=.0001||pile.x<x0||pile.x>=x1||pile.y<y0||pile.y>=y1||!this._cell(pile.x,pile.y)?.revealed)continue;
      const key=`${pile.x},${pile.y}`;
      if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(pile);
    }
    for(const piles of grouped.values()){
      const {x,y}=piles[0],selected=[this.selection,this.hover].some(at=>at?.x===x&&at?.y===y),highlight=this.overlay==='logistics';
      const blocked=piles.some(p=>p.blockedReason),color=blocked?'#e7aa8a':'#d8c58f';
      ctx.save();
      if(!highlight&&!selected)ctx.globalAlpha=this.overlay==='normal'?.86:.55;
      if(selected||highlight){
        ellipse(ctx,x+.5,y+.91,.44,.085,blocked?'rgba(202,128,97,.18)':'rgba(222,198,135,.13)');
        line(ctx,[[x+.13,y+.94],[x+.87,y+.94]],color,.035);
      }
      const types=[...new Set(piles.map(p=>p.resource))].slice(0,4);
      types.forEach((resource,i)=>{
        const offset=types.length>1?(i-(types.length-1)/2)*.17:0;
        this._resourceGlyph(ctx,resource,x+.5+offset,y+.82-i*.025,selected?.95:types.length>1?.68:.82);
      });
      if(blocked&&(highlight||selected)){
        circle(ctx,x+.81,y+.53,.085,'#5c4037','#e7aa8a',.02);
        line(ctx,[[x+.81,y+.49],[x+.81,y+.54]],'#f5d9b3',.022);circle(ctx,x+.81,y+.575,.009,'#f5d9b3');
      }
      if(piles.some(p=>p.reservedBy!=null)&&(highlight||selected)){
        line(ctx,[[x+.1,y+.65],[x+.18,y+.73],[x+.31,y+.56]],'#acddbf',.035);
      }
      if(selected||(highlight&&this.cellSize>=20)){
        const amount=piles.reduce((sum,p)=>sum+finite(p.amount),0),label=types.length===1?cargoStyle(types[0]).label:'수거품';
        this._worldLabel(ctx,`${label} ${quantity(amount)}${blocked?' · 대기':''}`,x+.5,y+.37,color,blocked?'rgba(69,45,39,.96)':'rgba(43,47,35,.94)');
      }
      ctx.restore();
    }
  }

  _logisticsOverlay(ctx,x0,y0,x1,y1) {
    if(this.overlay!=='logistics')return;
    for(const b of this.game.buildings||[]){
      if(!['core','storage'].includes(b.type)||b.progress<1||b.x<x0||b.x>=x1||b.y<y0||b.y>=y1||!this._cell(b.x,b.y)?.revealed)continue;
      const available=b.enabled!==false,color=available?'#9cd7bc':'#c7ab88';
      ctx.save();ctx.setLineDash([.09,.07]);rounded(ctx,b.x+.03,b.y+.04,.94,.91,.1,null,color,.035);ctx.setLineDash([]);
      if(this.cellSize>=18||[this.hover,this.selection].some(at=>at?.x===b.x&&at?.y===b.y)){
        this._worldLabel(ctx,available?(b.type==='core'?'코어 수거':'수거 거점'):'수거 중지',b.x+.5,b.y-.13,color);
      }
      ctx.restore();
    }
    // Only the actual planned movement of hauling crew is shown. No inferred
    // depot connection or decorative movement is presented as a delivery.
    for(const c of this.game.crew||[]){
      if(finite(c.health,100)<=0||(!c.cargo&&c._job?.kind!=='haul')||!c.path?.length||!Number.isFinite(c.x)||!Number.isFinite(c.y)||!this._cell(Math.floor(c.x),Math.floor(c.y))?.revealed)continue;
      this._crewPath(ctx,c,c.cargo?'rgba(226,200,144,.7)':'rgba(155,210,184,.42)',false);
    }
  }

  _bounds(b){
    return this.game.modernRules?buildingBounds(b):{x:b.x,y:b.y,width:1,height:1};
  }

  _machine(ctx,b,t) {
    const active=!!b.active && b.enabled!==false && b.progress>=1;
    const phase=active?t:0;
    const frame='#273b40', light='#a6b8a5', shadow='#12242b';
    if(b.type!=='ladder' && b.type!=='tile')ellipse(ctx,.5,.98,.43,.065,'rgba(2,11,16,.3)');
    switch(b.type) {
      case 'tile':
        ctx.drawImage(this._tiles.tile[0],0,0,1,1);break;
      case 'ladder':
        line(ctx,[[.31,0],[.31,1]],'#16292c',.13);line(ctx,[[.69,0],[.69,1]],'#16292c',.13);
        for(const x of [.31,.69])line(ctx,[[x,0],[x,1]],'#9b9b80',.075);
        for(const y of [.15,.43,.71,.99]) {
          line(ctx,[[.31,y+.035],[.69,y+.035]],'#334c47',.085);
          line(ctx,[[.31,y],[.69,y]],'#b8b698',.06);
        }
        break;
      case 'door': {
        const opened=b.progress>=1&&b.doorOpen===true;
        const mode=['auto','open','locked'].includes(b.doorMode)?b.doorMode:'auto';
        const signal=mode==='locked'?'#e5aa8a':mode==='open'?'#e0c58e':'#b4d8bd';
        // The leaves follow doorOpen directly; the selected mode is the light.
        // An automatic door can therefore be visibly either open or shut.
        rounded(ctx,.04,.02,.92,.96,.065,opened?null:'#304a4b',shadow,.045);
        if(opened){
          for(const x of [.04,.81])rounded(ctx,x,.02,.15,.96,.035,'#304a4b');
          rounded(ctx,.13,.02,.74,.12,.03,'#304a4b');
        }
        rounded(ctx,.17,.12,.66,.82,.035,opened?null:'#10272d','#809a8c',.025);
        if(opened){
          rounded(ctx,.11,.16,.14,.75,.024,'#8caa9b','#b8c8ab',.022);
          rounded(ctx,.75,.16,.14,.75,.024,'#779789','#b8c8ab',.022);
          line(ctx,[[.19,.24],[.19,.81]],'#506f68',.028);
          line(ctx,[[.81,.24],[.81,.81]],'#506f68',.028);
        }else{
          rounded(ctx,.19,.16,.3,.75,.023,'#809e90','#b6c6aa',.025);
          rounded(ctx,.51,.16,.3,.75,.023,'#6f9185','#a4bfa8',.025);
          for(const x of [.255,.575]){
            rounded(ctx,x,.29,.17,.24,.04,'#274e53','#b5cdb6',.018);
            line(ctx,[[x+.035,.335],[x+.035,.425]],'#7ba8a2',.023);
          }
          line(ctx,[[.5,.18],[.5,.88]],'#28433f',.032);
          for(const x of [.43,.57])line(ctx,[[x,.62],[x,.72]],'#d8d9b5',.025);
        }
        rounded(ctx,.29,.025,.42,.115,.03,'#203b3e','#93b09b',.025);
        circle(ctx,.5,.082,.029,signal);
        for(const x of [.2,.4,.6,.8])line(ctx,[[x-.055,.965],[x+.015,.925]],'#c3b98c',.032);
        if(mode==='locked'){
          rounded(ctx,.402,.58,.196,.16,.035,'#735244','#e3bd94',.023);
          ctx.beginPath();ctx.arc(.5,.58,.06,Math.PI,TAU);ctx.strokeStyle='#e4c8a1';ctx.lineWidth=.03;ctx.stroke();
          circle(ctx,.5,.65,.022,'#e7cfaa');
        }else if(mode==='open'){
          line(ctx,[[.36,.08],[.31,.08],[.335,.055]],signal,.018);
          line(ctx,[[.64,.08],[.69,.08],[.665,.055]],signal,.018);
        }
        break;
      }
      case 'oxygenDock': {
        const capacity=Math.max(0,finite(b.oxygenCapacity));
        const stored=b.progress>=1?clamp(finite(b.oxygenStored),0,capacity):0;
        const fill=capacity>0?stored/capacity:0;
        rounded(ctx,.08,.84,.84,.11,.035,'#638b7e',shadow,.035);
        rounded(ctx,.13,.12,.42,.73,.14,'#406c66','#9dbfad',.035);
        rounded(ctx,.2,.23,.28,.51,.075,'#1b3d42','#769d8f',.02);
        if(fill>0)rounded(ctx,.225,.715-.46*fill,.23,.46*fill,.04,'#a3daca');
        line(ctx,[[.25,.29],[.25,.65]],'rgba(221,240,213,.38)',.022);
        for(let i=1;i<4;i++)line(ctx,[[.41,.715-i*.115],[.465,.715-i*.115]],'#3a6b65',.014);
        rounded(ctx,.245,.07,.19,.085,.02,'#b7cbb2','#476a60',.02);
        line(ctx,[[.34,.08],[.34,.015]],'#a1bca5',.035);
        line(ctx,[[.27,.015],[.41,.015]],'#ccd6b8',.03);
        rounded(ctx,.58,.37,.31,.46,.065,'#688d81','#acc6ad',.028);
        circle(ctx,.735,.53,.125,'#24454b','#a8c7b5',.025);
        this._fan(ctx,.735,.53,.09,phase*3.1,active?'#d4e5bf':'#72958c');
        circle(ctx,.735,.53,.027,'#c2d2ad');
        circle(ctx,.81,.72,.054,'#23494a','#bed5bb',.025);
        line(ctx,[[.81,.77],[.87,.82],[.91,.77]],'#8db7a7',.035);
        rounded(ctx,.63,.255,.2,.09,.025,'#214247','#97b9a7',.02);
        circle(ctx,.73,.3,.022,active?'#d7edb8':fill>=.999?'#9ed2bc':'#607e74');
        break;
      }
      case 'core': {
        const halo=ctx.createRadialGradient(.5,.46,.05,.5,.46,1.45);
        halo.addColorStop(0,'rgba(141,239,194,.21)');halo.addColorStop(1,'rgba(141,239,194,0)');
        ctx.fillStyle=halo;ctx.fillRect(-1,-1,3,3);
        rounded(ctx,.12,.84,.76,.12,.035,'#708f7d',shadow);
        rounded(ctx,.24,.21,.52,.63,.2,'#234d47','#9acbab',.045);
        rounded(ctx,.32,.27,.36,.45,.13,'#102c30');
        const sy=.47+Math.sin(t*1.6)*.045;
        ellipse(ctx,.5,sy,.13,.17,'#d4f3cf');ellipse(ctx,.54,sy-.03,.05,.1,'#a0deaa');
        line(ctx,[[.5,sy+.11],[.5,sy-.1]],'#7bb194',.018);
        circle(ctx,.5,.15,.08,'#d4e8bf','#799e88',.03);
        circle(ctx,.5,.15,.026,'#f3f7d7');
        for(let i=0;i<3;i++)circle(ctx,.38+i*.12,.9,.025,i===Math.floor(t)%3?'#e9f4c5':'#335e51');
        break;
      }
      case 'diffuser':
        rounded(ctx,.08,.8,.84,.14,.035,'#527b70',shadow);
        rounded(ctx,.12,.23,.36,.57,.11,'#467c70','#96caae',.04);
        rounded(ctx,.18,.32,.22,.37,.065,'#9ee3c1');
        line(ctx,[[.2,.36],[.2,.55]],'#d4f4d8',.025);
        rounded(ctx,.2,.17,.2,.1,.025,'#b3cab0');
        circle(ctx,.68,.53,.25,'#223f42','#7d9f8c',.045);
        this._fan(ctx,.68,.53,.19,phase*2.7,'#b5d2ba');
        circle(ctx,.68,.53,.045,'#e4e6bc');
        if(active)for(let i=0;i<3;i++) {
          const p=(t*.55+i*.31)%1;
          ctx.globalAlpha*=1-p;
          circle(ctx,.3+Math.sin(t+i)*.065,.15-p*.55,.035+p*.045,null,'#acedd2',.018);
          ctx.globalAlpha/=(1-p)||1;
        }
        break;
      case 'generator':
        line(ctx,[[.13,.91],[.48,.38],[.85,.91]],'#a99d70',.09);
        rounded(ctx,.08,.88,.84,.09,.03,'#756c52',shadow);
        circle(ctx,.49,.45,.34,'#1e3439','#c1b17f',.055);
        ctx.save();ctx.translate(.49,.45);ctx.rotate(phase*2.2);
        for(let i=0;i<6;i++){const a=i*TAU/6;line(ctx,[[0,0],[Math.cos(a)*.28,Math.sin(a)*.28]],'#a3b29d',.027);}
        circle(ctx,0,0,.07,'#ddc18a');ctx.restore();
        rounded(ctx,.72,.68,.19,.16,.04,'#53796d','#96b099',.025);
        break;
      case 'battery': {
        rounded(ctx,.2,.19,.6,.73,.085,'#645f83',shadow,.055);
        rounded(ctx,.26,.27,.48,.55,.045,'#273d47','#a19bc0',.022);
        const count=Math.max(1,(this.game.buildings||[]).filter(v=>v.type==='battery'&&v.progress>=1).length);
        const capacity=finite(b.capacity,finite(this.game.power?.capacity)/count)||1;
        const fill=clamp(Number.isFinite(b.charge)?b.charge/capacity:finite(this.game.power?.stored)/Math.max(1,finite(this.game.power?.capacity)),0,1);
        for(let k=0;k<4;k++)rounded(ctx,.32,.67-k*.105,.36,.067,.018,k/4<fill?'#a0ddb3':'#3c5056');
        rounded(ctx,.29,.12,.12,.1,.015,'#c7bfac');rounded(ctx,.59,.12,.12,.1,.015,'#c7bfac');
        line(ctx,[[.15,.47],[.2,.47]],'#c4ac82',.07);
        break;
      }
      case 'farm': {
        const growth=clamp(finite(b.growth,.4),0,1);
        rounded(ctx,.08,.75,.84,.18,.04,'#80634d',shadow);
        rounded(ctx,.13,.72,.74,.07,.02,'#b19169');
        rounded(ctx,.18,.77,.64,.055,.01,'#3c4933');
        for(let i=0;i<3;i++) {
          const x=.27+i*.23,h=.13+growth*.32+(i===1?.1:0);
          const lean=Math.sin(t*1.2+i)*.02;
          line(ctx,[[x,.76],[x+lean,.76-h]],'#a4bf83',.035);
          ctx.save();ctx.translate(x,.76-h*.55);ctx.rotate(-.35);
          ellipse(ctx,-.065,0,.095,.04,'#7faf79');ctx.restore();
          ctx.save();ctx.translate(x+lean,.76-h*.8);ctx.rotate(.4);
          ellipse(ctx,.06,0,.085,.04,'#b8cf8e');ctx.restore();
          if(growth>.85)circle(ctx,x+lean,.76-h-.025,.055,'#e6c183','#a09c66',.014);
        }
        break;
      }
      case 'storage': {
        rounded(ctx,.12,.15,.76,.76,.055,'#725f4c',shadow,.045);
        rounded(ctx,.19,.22,.62,.6,.025,'#263e3d','#bba982',.025);
        for(const y of [.48,.79])line(ctx,[[.17,y],[.83,y]],'#beac82',.045);
        for(const [x,y,w] of [[.23,.29,.24],[.52,.27,.23],[.24,.57,.29],[.57,.56,.18]]){
          rounded(ctx,x,y,w,.2,.015,'#8d815f','#cbb88d',.022);
          line(ctx,[[x+.03,y+.035],[x+w-.03,y+.165]],'#b6a279',.025);
          line(ctx,[[x+w-.03,y+.035],[x+.03,y+.165]],'#b6a279',.025);
        }
        for(const x of [.16,.76])rounded(ctx,x,.89,.1,.07,.015,'#8b9d8c');
        rounded(ctx,.37,.08,.26,.17,.035,'#436b5c','#a8c8a3',.025);
        line(ctx,[[.5,.115],[.5,.2]],'#e0e5bb',.023);
        line(ctx,[[.455,.16],[.5,.205],[.545,.16]],'#e0e5bb',.023);
        if(active&&b.workerId!=null)line(ctx,[[.28,.84],[.72,.84]],'#c4e5ac',.035);
        break;
      }
      case 'kitchen': {
        const cooking=active&&b.workerId!=null;
        rounded(ctx,.08,.63,.84,.28,.04,'#786659',shadow,.04);
        rounded(ctx,.04,.59,.92,.085,.025,'#c7bc9a','#5d6658',.025);
        rounded(ctx,.18,.71,.39,.135,.025,'#314448','#b4b694',.022);
        for(const x of [.68,.8])circle(ctx,x,.74,.034,cooking?'#e4be7a':'#9b9980');
        line(ctx,[[.13,.91],[.13,.98]],'#9ba58e',.055);line(ctx,[[.87,.91],[.87,.98]],'#9ba58e',.055);
        ellipse(ctx,.36,.56,.23,.05,cooking?'#b67e4e':'#4e5e54');
        rounded(ctx,.15,.35,.43,.22,.06,'#9eae9c','#d0d6b5',.03);
        ellipse(ctx,.365,.35,.215,.047,'#cee0bf');ellipse(ctx,.365,.35,.17,.028,cooking?'#d5ae70':'#5f7971');
        line(ctx,[[.11,.43],[.04,.43],[.04,.5],[.13,.5]],'#a6b7a0',.04);
        line(ctx,[[.62,.44],[.69,.44]],'#a6b7a0',.04);
        rounded(ctx,.72,.41,.14,.16,.025,'#b49a72','#d4c7a2',.022);
        line(ctx,[[.75,.4],[.72,.25]],'#ded4ae',.025);circle(ctx,.71,.225,.045,'#a6bbab');
        const progress=clamp(finite(b.recipeProgress),0,1);
        rounded(ctx,.21,.865,.58,.035,.01,'#334743');
        if(progress>0)rounded(ctx,.21,.865,.58*progress,.035,.01,'#d5c78b');
        if(cooking)for(let i=0;i<3;i++){
          const p=(t*.4+i*.31)%1;
          ctx.save();ctx.globalAlpha*=.55*(1-p);
          const x=.24+i*.12+Math.sin(t*.9+i)*.02;
          line(ctx,[[x,.3-p*.25],[x+.025,.25-p*.25],[x-.01,.2-p*.25]],'#e9dfb8',.022);ctx.restore();
        }
        break;
      }
      case 'mess': {
        const worker=(this.game.crew||[]).find(c=>c.id===b.workerId);
        const occupied=active&&worker&&!worker.path?.length;
        const dining=occupied&&worker._job?.kind==='eat';
        const relaxing=occupied&&worker._job?.kind==='relax';
        for(const x of [.14,.76]){
          line(ctx,[[x,.75],[x,.95]],'#7e9180',.055);
          rounded(ctx,x-.09,.65,.25,.09,.025,'#84a395',shadow,.025);
        }
        line(ctx,[[.3,.58],[.26,.94]],'#a39373',.06);line(ctx,[[.71,.58],[.75,.94]],'#a39373',.06);
        rounded(ctx,.1,.48,.8,.13,.04,'#b29b77',shadow,.04);
        rounded(ctx,.13,.455,.74,.045,.02,'#d1bd92');
        ellipse(ctx,.41,.46,.15,.037,'#d7dcc2');ellipse(ctx,.41,.46,.105,.021,'#94b1a5');
        if(dining){
          ellipse(ctx,.41,.45,.09,.025,'#d8b377');
          circle(ctx,.38,.43,.026,'#b6cc84');circle(ctx,.44,.44,.023,'#a3bc77');
        }
        rounded(ctx,.66,.34,.1,.12,.025,relaxing?'#c2d5ba':'#7c9e93','#c4d4b7',.018);
        ctx.beginPath();ctx.arc(.775,.395,.035,-Math.PI/2,Math.PI/2);ctx.strokeStyle='#aec2aa';ctx.lineWidth=.025;ctx.stroke();
        if(relaxing){const p=(t*.32)%1;ctx.save();ctx.globalAlpha*=.35*(1-p);line(ctx,[[.71,.29-p*.12],[.72,.24-p*.12]],'#d4e0bf',.02);ctx.restore();}
        break;
      }
      case 'fridge': {
        rounded(ctx,.18,.11,.64,.82,.075,'#a0b9b6',shadow,.045);
        rounded(ctx,.23,.17,.54,.26,.035,'#557d83','#cbddc7',.025);
        rounded(ctx,.23,.47,.54,.35,.035,'#779d9b','#cbddc7',.025);
        line(ctx,[[.3,.27],[.3,.36]],'#e0e6cf',.035);line(ctx,[[.3,.53],[.3,.68]],'#e0e6cf',.035);
        circle(ctx,.66,.25,.07,'#315b6a','#9bc8c5',.018);
        for(let i=0;i<3;i++){const a=i*Math.PI/3;line(ctx,[[.66-Math.cos(a)*.045,.25-Math.sin(a)*.045],[.66+Math.cos(a)*.045,.25+Math.sin(a)*.045]],active?'#d6efdc':'#92b3b2',.018);}
        for(let i=0;i<4;i++)line(ctx,[[.32+i*.1,.865],[.37+i*.1,.865]],'#4c747c',.025);
        circle(ctx,.73,.87,.025,active?'#b8eac7':'#435c63');
        if(active){
          const shimmer=.15+.09*Math.sin(t*1.5);
          rounded(ctx,.25,.49,.5,.31,.025,`rgba(190,233,221,${shimmer})`);
          line(ctx,[[.39,.54],[.39,.73]],'rgba(219,239,223,.45)',.023);
        }
        break;
      }
      case 'cot':
        line(ctx,[[.13,.76],[.13,.98]],'#8ca296',.07);line(ctx,[[.88,.76],[.88,.98]],'#8ca296',.07);
        rounded(ctx,.06,.59,.89,.23,.075,'#58747a',shadow,.04);
        rounded(ctx,.1,.6,.25,.15,.06,'#e4dfc6');
        rounded(ctx,.37,.58,.55,.23,.06,'#b78081');
        line(ctx,[[.44,.63],[.86,.63]],'#d69c93',.028);line(ctx,[[.44,.75],[.86,.75]],'#d69c93',.022);
        line(ctx,[[.06,.59],[.06,.85]],'#a1b3a1',.055);
        break;
      case 'steamRocket':
        polygon(ctx,[[.35,.74],[.35,.34],[.5,.05],[.65,.34],[.65,.74]],'#b7c7bd','#31454c',.035);
        circle(ctx,.5,.4,.085,'#518597','#d2e4dd',.025);
        polygon(ctx,[[.35,.56],[.2,.85],[.35,.78]],'#ce866f');
        polygon(ctx,[[.65,.56],[.8,.85],[.65,.78]],'#ce866f');
        rounded(ctx,.31,.75,.38,.11,.02,'#42575b','#a7a898',.025);
        break;
      case 'planetarium':
        rounded(ctx,.11,.7,.78,.19,.04,'#53696f','#adc1b5',.025);
        circle(ctx,.5,.49,.28,'#345c70','#a4c4be',.035);
        for(const [px,py] of [[.4,.4],[.58,.33],[.62,.55],[.44,.61]])circle(ctx,px,py,.018,'#f8d999');
        break;
      case 'supercomputer':
      case 'research':
        rounded(ctx,.08,.75,.84,.1,.025,'#8a9291',shadow);
        for(const x of [.17,.8])line(ctx,[[x,.84],[x,.98]],'#526c6d',.07);
        rounded(ctx,.12,.25,.48,.37,.05,'#a3a7b0',shadow,.035);
        rounded(ctx,.17,.3,.38,.26,.025,'#22464e');
        line(ctx,[[.21,.47],[.28,.4],[.35,.44],[.42,.35],[.51,.38]],active?'#b5edd4':'#6fa39c',.025);
        line(ctx,[[.35,.64],[.35,.72]],'#8d9e9b',.06);
        rounded(ctx,.17,.69,.43,.055,.02,'#c4c6b1');
        circle(ctx,.77,.52,.13,'#736b91','#bbb0d4',.035);
        ellipse(ctx,.77,.52,.19,.055,'rgba(180,178,217,.2)');
        ctx.save();ctx.translate(.77,.52);ctx.rotate(phase*1.7+.7);
        ctx.beginPath();ctx.ellipse(0,0,.19,.06,0,0,TAU);ctx.strokeStyle='#aaa6cc';ctx.lineWidth=.018;ctx.stroke();circle(ctx,.19,0,.026,'#dce6cd');ctx.restore();
        line(ctx,[[.77,.66],[.77,.74]],'#938eac',.04);
        break;
      case 'pump':
        line(ctx,[[.16,.9],[.16,.62],[.36,.62]],'#7394a0',.12);
        line(ctx,[[.16,.9],[.16,.62],[.36,.62]],'#3d596a',.065);
        rounded(ctx,.31,.35,.48,.51,.09,'#688e9a',shadow,.04);
        circle(ctx,.55,.58,.18,'#263f4d','#bdd1c6',.025);
        this._fan(ctx,.55,.58,.135,phase*2.2,'#8cbac0');
        line(ctx,[[.55,.34],[.55,.18],[.86,.18]],'#9eb9b9',.09);
        rounded(ctx,.27,.85,.58,.09,.025,'#476974');
        if(active)circle(ctx,.58,.25,.026,'#b7e6d5');
        break;
      case 'gasPump':
        line(ctx,[[.16,.9],[.16,.62],[.36,.62]],'#70a9b5',.12);
        line(ctx,[[.16,.9],[.16,.62],[.36,.62]],'#355b68',.065);
        rounded(ctx,.31,.35,.48,.51,.09,'#507b86',shadow,.04);
        circle(ctx,.55,.58,.18,'#203e49','#b8d8d3',.025);
        this._fan(ctx,.55,.58,.135,phase*2.2,'#9fd4d3');
        line(ctx,[[.55,.34],[.55,.18],[.86,.18]],'#a5c7c1',.09);
        rounded(ctx,.27,.85,.58,.09,.025,'#345a65');
        if(active)circle(ctx,.58,.25,.026,'#bce9d8');
        break;
      case 'gasBridge':
      case 'liquidBridge': {
        const horizontal=(b.rotation||0)%2===0;
        const points=horizontal?[[.08,.68],[.26,.26],[.74,.26],[.92,.68]]:[[.33,.06],[.7,.25],[.7,.75],[.33,.94]];
        line(ctx,points,'#1c3035',.19);
        line(ctx,points,b.type==='gasBridge'?'#86c3ae':'#79b6cf',.105);
        break;
      }
      case 'liquidVent':
      case 'gasVent':
        rounded(ctx,.1,.72,.8,.17,.045,'#547f79',shadow,.04);
        rounded(ctx,.18,.28,.64,.48,.07,'#345a58','#a9d4bf',.035);
        for(let i=0;i<5;i++){
          const x=.27+i*.115;
          line(ctx,[[x,.35],[x,.69]],active?'#d0e8c7':'#8ab5a6',.045);
        }
        line(ctx,[[.3,.2],[.3,.12],[.7,.12],[.7,.2]],'#b4d5c0',.045);
        if(active)for(let i=0;i<3;i++){
          const p=(t*.45+i*.31)%1,x=.32+i*.18;
          ctx.save();ctx.globalAlpha*=1-p;line(ctx,[[x,.29-p*.12],[x+.025,.23-p*.12],[x,.18-p*.12]],'#c7ecd1',.022);ctx.restore();
        }
        break;
      case 'scrubber':
        rounded(ctx,.12,.45,.76,.45,.07,'#536d69',shadow,.04);
        for(const x of [.22,.59]) {
          rounded(ctx,x,.14,.2,.44,.06,'#91b6a6','#344d4a',.035);
          for(let j=0;j<3;j++)line(ctx,[[x+.04,.24+j*.075],[x+.16,.24+j*.075]],'#466c62',.023);
        }
        circle(ctx,.5,.67,.12,'#25433b','#b3c9ac',.025);
        line(ctx,[[.44,.72],[.53,.58]],'#c2d8ac',.025);
        ellipse(ctx,.53,.63,.05,.025,'#b6cd9b');
        if(active)circle(ctx,.77,.8,.025,'#c6e1ad');
        break;
      case 'coalgen': {
        rounded(ctx,.12,.29,.73,.62,.075,'#765d57',shadow,.05);
        rounded(ctx,.63,.03,.17,.31,.025,'#6e7471','#3b4242',.035);
        rounded(ctx,.22,.45,.4,.31,.06,'#342f34','#b39b80',.03);
        if(active) {
          for(let i=0;i<3;i++)ellipse(ctx,.31+i*.09,.64,.055,.07+.035*Math.sin(t*8+i),'#e6a367');
          ellipse(ctx,.42,.67,.05,.065,'#f2cc87');
        } else line(ctx,[[.28,.68],[.54,.68]],'#65504a',.04);
        for(let i=0;i<3;i++)line(ctx,[[.67,.52+i*.1],[.77,.52+i*.1]],'#cfb095',.025);
        rounded(ctx,.07,.88,.83,.08,.025,'#4d5350');
        if(active)for(let i=0;i<3;i++) {
          const p=(t*.34+i*.32)%1;
          ctx.save();ctx.globalAlpha*=.25*(1-p);circle(ctx,.72+Math.sin(p*3+i)*.06,-p*.58,.06+p*.1,'#b6b1a2');ctx.restore();
        }
        break;
      }
      case 'toilet': {
        rounded(ctx,.12,.18,.28,.46,.055,'#bacfbd',shadow,.04);
        rounded(ctx,.17,.23,.18,.25,.035,'#e1e5cf');
        rounded(ctx,.28,.29,.075,.045,.015,'#9baf9d');
        line(ctx,[[.27,.62],[.27,.83],[.65,.83]],'#899e93',.08);
        rounded(ctx,.4,.62,.2,.29,.05,'#bac9b9',shadow,.025);
        rounded(ctx,.34,.86,.38,.09,.025,'#a5b9a7');
        ctx.beginPath();ctx.moveTo(.32,.5);ctx.lineTo(.88,.5);ctx.bezierCurveTo(.86,.8,.41,.82,.32,.5);ctx.fillStyle='#d4ddc7';ctx.fill();ctx.strokeStyle='#819e92';ctx.lineWidth=.03;ctx.stroke();
        ellipse(ctx,.6,.51,.28,.09,'#e7ead2');
        ellipse(ctx,.6,.515,.19,.045,'#527e82');
        if(active){
          ctx.save();ctx.translate(.6,.515);ctx.scale(1,.33);ctx.rotate(phase*3);
          ctx.beginPath();ctx.arc(0,0,.14,.3,Math.PI*1.6);ctx.strokeStyle='#b0e2d3';ctx.lineWidth=.035;ctx.stroke();ctx.restore();
        }
        break;
      }
      case 'sink':
        line(ctx,[[.22,.66],[.22,.93]],'#93b6ac',.09);line(ctx,[[.78,.66],[.78,.93]],'#93b6ac',.09);
        rounded(ctx,.1,.49,.8,.2,.055,'#c4d5c3',shadow,.04);
        ellipse(ctx,.51,.5,.32,.08,'#e3e7ce');ellipse(ctx,.51,.5,.24,.05,'#4f7c82');
        line(ctx,[[.31,.47],[.31,.21],[.62,.21],[.62,.31]],'#b9cebd',.075);
        line(ctx,[[.25,.25],[.38,.25]],'#88a6a2',.04);circle(ctx,.31,.25,.045,'#d1dec6');
        line(ctx,[[.49,.68],[.49,.81],[.63,.81]],'#6b9893',.07);
        if(active){
          line(ctx,[[.62,.32],[.62,.47]],'rgba(150,224,226,.75)',.035);
          for(let i=0;i<3;i++){const p=(t*1.5+i*.3)%1;circle(ctx,.56+Math.sin(i*2+t)*.09,.48-p*.08,.016,'#bcebdc');}
        }
        break;
      case 'reservoir': {
        rounded(ctx,.18,.13,.64,.78,.12,'#3c6876',shadow,.045);
        rounded(ctx,.25,.22,.5,.58,.055,'#193f50','#7eacb0',.025);
        for(const tank of [{x:.275,amount:b.cleanWater,capacity:b.cleanCapacity,color:'#83cbd3'},{x:.52,amount:b.dirtyWater,capacity:b.dirtyCapacity,color:'#c4a475'}]){
          const level=finite(tank.capacity)>0?clamp(finite(tank.amount)/tank.capacity,0,1):0;
          if(level>0){
            const top=.79-level*.56;
            rounded(ctx,tank.x,top,.2,.79-top,.015,tank.color);
            line(ctx,[[tank.x+.015,top+.01],[tank.x+.185,top+.01]],'#d8e4c2',.02);
          }
        }
        line(ctx,[[.5,.24],[.5,.8]],'#91b5af',.035);
        line(ctx,[[.31,.27],[.31,.69]],'rgba(196,228,218,.32)',.028);
        for(let i=0;i<4;i++)line(ctx,[[.65,.32+i*.11],[.72,.32+i*.11]],'#bbd8c8',.022);
        rounded(ctx,.13,.11,.74,.1,.035,'#9aaea2',shadow,.025);rounded(ctx,.14,.84,.72,.1,.03,'#8ea297',shadow,.025);
        line(ctx,[[.5,.84],[.5,.98]],'#a0b8a5',.06);circle(ctx,.5,.88,.055,'#d4c293');
        break;
      }
      case 'purifier': {
        rounded(ctx,.07,.78,.86,.14,.035,'#70867b',shadow,.04);
        for(const [x,c] of [[.14,'#bbac7f'],[.58,'#9dcebd']]){
          rounded(ctx,x,.2,.28,.57,.09,c,'#355754',.035);
          rounded(ctx,x+.055,.29,.17,.34,.025,'#2d5756');
          for(let j=0;j<4;j++)line(ctx,[[x+.065,.32+j*.075],[x+.205,.36+j*.075]],c,.018);
          rounded(ctx,x-.02,.19,.32,.07,.02,'#bdc9ac');
        }
        line(ctx,[[.28,.18],[.28,.09],[.72,.09],[.72,.18]],'#9fbaa8',.055);
        line(ctx,[[.43,.57],[.57,.57]],'#bed5bd',.055);
        circle(ctx,.5,.56,.075,'#273f43','#cfce9e',.018);
        this._fan(ctx,.5,.56,.053,phase*4,'#c8d8af');
        if(active){const p=(t*.8)%1;droplet(ctx,.28+.44*p,.085,.025,'#d5ead1');}
        break;
      }
      case 'electrolyzer': {
        rounded(ctx,.08,.8,.84,.12,.03,'#8b9e94',shadow,.04);
        for(const [x,c] of [[.16,'#96ddc8'],[.59,'#c0b4e5']]){
          rounded(ctx,x,.24,.25,.54,.09,'#264b52',c,.035);
          rounded(ctx,x+.035,.47,.18,.25,.045,c);
          line(ctx,[[x+.065,.3],[x+.065,.44]],'rgba(211,237,220,.45)',.025);
          rounded(ctx,x-.02,.19,.29,.08,.02,'#a9beb1');
          line(ctx,[[x+.125,.19],[x+.125,.09]],c,.045);
          if(active)for(let i=0;i<3;i++){const p=(t*.7+i*.3+x)%1;circle(ctx,x+.125+Math.sin(i*2+t)*.035,.69-p*.36,.023,c);}
        }
        line(ctx,[[.41,.6],[.59,.6]],'#c7d4b4',.05);
        polygon(ctx,[[.53,.29],[.44,.48],[.52,.46],[.47,.64],[.60,.41],[.51,.43]],active?'#f3df9d':'#abaf91');
        if(active)for(const [x,c] of [[.285,'#abe9cd'],[.715,'#c6bde9']]){
          const p=(t*.5+x)%1;ctx.save();ctx.globalAlpha*=1-p;circle(ctx,x,.05-p*.3,.025+p*.018,null,c,.015);ctx.restore();
        }
        break;
      }
      case 'steamTurbine': {
        rounded(ctx,.05,.69,.88,.23,.04,'#64838c',shadow,.04);
        rounded(ctx,.70,.46,.29,.13,.03,'#b0c7c8',shadow,.025);
        circle(ctx,.48,.47,.29,'#263c47','#abc6c8',.055);
        ctx.save();ctx.translate(.48,.47);ctx.rotate(phase*3);
        for(let i=0;i<6;i++){
          ctx.rotate(TAU/6);
          polygon(ctx,[[.03,0],[.18,-.07],[.23,.02],[.07,.07]],'#89b1b5');
        }
        ctx.restore();circle(ctx,.48,.47,.06,'#d9c895');
        break;
      }
      case 'hydrogenGen': {
        rounded(ctx,.07,.8,.86,.13,.03,'#787d91',shadow,.045);
        rounded(ctx,.12,.2,.3,.57,.14,'#7d769c','#b6adc9',.035);
        rounded(ctx,.17,.29,.2,.33,.06,'#494763');
        line(ctx,[[.27,.2],[.27,.1],[.68,.1],[.68,.3]],'#c2b6cc',.055);
        rounded(ctx,.23,.075,.12,.06,.02,'#d8c5ae');
        circle(ctx,.67,.55,.25,'#283c49','#b1a2c6',.045);
        ctx.save();ctx.translate(.67,.55);ctx.rotate(phase*2.5);
        for(let i=0;i<5;i++){const a=i*TAU/5;line(ctx,[[Math.cos(a)*.06,Math.sin(a)*.06],[Math.cos(a)*.18,Math.sin(a)*.18]],'#9d92c1',.045);}circle(ctx,0,0,.055,active?'#e6dbb1':'#8b85a3');ctx.restore();
        polygon(ctx,[[.27,.38],[.21,.51],[.27,.49],[.23,.6],[.33,.45],[.27,.47]],active?'#e7d7ad':'#a0a3b6');
        if(active)circle(ctx,.83,.82,.028,'#d6e9aa');
        break;
      }
      case 'cooler':
        rounded(ctx,.11,.2,.78,.69,.07,'#7895a3',shadow,.045);
        rounded(ctx,.16,.26,.54,.53,.04,'#2b4c59','#a2c6c6',.025);
        circle(ctx,.43,.52,.21,'#173c4a','#8eb6bc',.025);
        this._fan(ctx,.43,.52,.175,phase*3.5,'#c0d9cc');circle(ctx,.43,.52,.04,'#ebeed2');
        for(let i=0;i<5;i++)line(ctx,[[.75,.31+i*.095],[.83,.31+i*.095]],'#c0d2cb',.025);
        rounded(ctx,.2,.9,.15,.055,.02,'#456978');rounded(ctx,.65,.9,.15,.055,.02,'#456978');
        line(ctx,[[.43,.06],[.43,.17]],'#c0e2d8',.022);line(ctx,[[.38,.09],[.48,.14]],'#c0e2d8',.022);line(ctx,[[.38,.14],[.48,.09]],'#c0e2d8',.022);
        if(active)for(let i=0;i<3;i++){
          const p=(t*.55+i*.33)%1;ctx.save();ctx.globalAlpha*=.6*(1-p);line(ctx,[[.24+i*.19,.15-p*.3],[.26+i*.19,.09-p*.3]],'#b4e2de',.025);ctx.restore();
        }
        break;
      default:
        rounded(ctx,.16,.28,.68,.64,.08,'#637f77',shadow);
        line(ctx,[[.29,.44],[.71,.44],[.71,.73],[.29,.73],[.29,.44]],light,.03);
    }
    if(b.enabled===false && !['ladder','tile','door'].includes(b.type)) {
      ctx.save();ctx.globalAlpha*=.8;circle(ctx,.82,.2,.1,'#22373b','#b99c86',.025);
      line(ctx,[[.795,.155],[.795,.245]],'#d4baa0',.025);line(ctx,[[.845,.155],[.845,.245]],'#d4baa0',.025);ctx.restore();
    }
  }

  _fan(ctx,x,y,r,angle,color) {
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    for(let i=0;i<3;i++) {
      ctx.rotate(TAU/3);ctx.beginPath();ctx.moveTo(0,0);
      ctx.bezierCurveTo(r*.45,-r*.7,r*1.15,-r*.85,r*.92,-r*.2);
      ctx.bezierCurveTo(r*.7,r*.05,r*.35,r*.14,0,0);ctx.fillStyle=color;ctx.fill();
    }
    ctx.restore();
  }

  _machineStatus(ctx,b,t) {
    const d=BUILDINGS[b.type];
    const usesPower=d?.power>0 && !['generator','coalgen','battery'].includes(b.type);
    if(usesPower && b.connected===false) {
      circle(ctx,b.x+.84,b.y+.16,.09,'#213238','#d1ad77',.025);
      polygon(ctx,[[b.x+.84,b.y+.08],[b.x+.79,b.y+.17],[b.x+.84,b.y+.16],[b.x+.81,b.y+.24],[b.x+.9,b.y+.13],[b.x+.85,b.y+.14]],'#dcb67c');
    } else if(b.active && !['farm','ladder','tile','core','cot','door'].includes(b.type)) {
      circle(ctx,b.x+.87,b.y+.82,.035,`rgba(179,228,171,${.65+Math.sin(t*3)*.2})`);
    }
    const status=String(b.status||'');
    const fullDock=b.type==='oxygenDock'&&finite(b.oxygenCapacity)>0&&finite(b.oxygenStored)>=b.oxygenCapacity-.0001;
    if(b.enabled!==false && (/부족|막힘|침수|이탈/.test(status)||(!fullDock&&/가득/.test(status)))){
      circle(ctx,b.x+.12,b.y+.12,.095,'#623f38','#e8af8c',.025);
      line(ctx,[[b.x+.12,b.y+.065],[b.x+.12,b.y+.125]],'#f4dfbd',.025);
      circle(ctx,b.x+.12,b.y+.16,.012,'#f4dfbd');
    }
    if(b.automation && b.automation!=='always' && b.enabled!==false && !b.active && /자동|대기|충분/.test(status)){
      circle(ctx,b.x+.88,b.y+.36,.075,'#1b393e','#b4d3bf',.02);
      line(ctx,[[b.x+.88,b.y+.315],[b.x+.88,b.y+.36],[b.x+.918,b.y+.36]],'#cfe3c3',.02);
    }
  }

  _machinePorts(ctx,b,t) {
    if(this.game.modernRules){
      const spec=BUILDING_FOOTPRINTS[b.type],selected=this.selection&&this.game._buildingAt?.(this.selection.x,this.selection.y)===b;
      for(const key of Object.keys(spec?.ports||{})){
        const layer=key==='power'?'power':key.startsWith('gas')?'gas':'plumbing';
        if(this.overlay!==layer&&!selected&&b.progress!==0)continue;
        const pos=buildingPort(b,key),cell=this._cell(pos.x,pos.y);
        const connected=!!cell?.[layer==='power'?'wire':layer==='gas'?'gasPipe':'pipe'];
        const color=key==='power'?'#ffd988':key.endsWith('In')?'#f3f4e8':'#78e89f';
        const px=pos.x+.5,py=pos.y+(key==='power'?.74:.43);
        circle(ctx,px,py,.155,'#16383c',color,.04);
        if(!connected)ctx.setLineDash([.04,.04]);
        if(key==='power')line(ctx,[[px-.045,py+.065],[px+.035,py-.065]],color,.04);
        else polygon(ctx,[[px-.055,py-.08],[px+.08,py],[px-.055,py+.08]],color);
        ctx.setLineDash([]);
      }
      return;
    }
    const ports=FLUID_PORTS[b.type],cell=this._cell(b.x,b.y);
    if(!cell)return;
    const selected=[this.hover,this.selection].some(at=>at?.x===b.x&&at?.y===b.y);
    const plumbing=this.overlay==='plumbing'||['pipe','wastepipe','removePipe','removeWastepipe'].includes(this.tool)||this.tool===b.type;
    const gasPort=GAS_PORTS[b.type],gasLayer=PIPE_LAYERS[2],gasInstalled=!!cell.gasPipe,gasVisible=this.overlay==='gas'||['gaspipe','removeGasPipe','gasPump','gasVent'].includes(this.tool)||selected;
    if(gasPort&&(gasVisible||!gasInstalled)){const px=b.x+gasLayer.x,py=b.y+gasLayer.y,size=gasVisible||selected?.11:.075,color=gasInstalled?'#8bc8b7':'#eb9c87';circle(ctx,px,py,size,'#173934',color,.025);if(!gasInstalled){line(ctx,[[px-size*.38,py-size*.38],[px+size*.38,py+size*.38]],color,.025);line(ctx,[[px+size*.38,py-size*.38],[px-size*.38,py+size*.38]],color,.025);}else{const sign=gasPort==='in'?1:-1;polygon(ctx,[[px-sign*size*.43,py-size*.5],[px+sign*size*.45,py],[px-sign*size*.43,py+size*.5]],color);} }
    if(ports)for(const [kind,direction] of Object.entries(ports)){
      const clean=kind==='water',layer=PIPE_LAYERS[clean?0:1];
      const installed=!!cell[layer.key];
      const connected=installed && b[clean?'waterConnected':'wasteConnected']===true;
      const complete=b.progress>=1;
      if(!plumbing&&!selected&&(!complete||connected))continue;
      const px=b.x+layer.x,py=b.y+layer.y;
      const color=connected?layer.color:installed?'#dab879':'#eb9c87';
      const size=(plumbing||selected) ? .11 : .075;
      ctx.save();
      if(!complete){ctx.globalAlpha=.65;ctx.setLineDash([.035,.03]);}
      if(clean)circle(ctx,px,py,size,'#18313b',color,.025);
      else rounded(ctx,px-size,py-size,size*2,size*2,.025,'#2f302b',color,.025);
      ctx.setLineDash([]);
      if(!installed){
        line(ctx,[[px-size*.38,py-size*.38],[px+size*.38,py+size*.38]],color,.025);
        line(ctx,[[px+size*.38,py-size*.38],[px-size*.38,py+size*.38]],color,.025);
      }else if(direction==='both'){
        line(ctx,[[px-size*.5,py],[px+size*.5,py]],color,.025);
        circle(ctx,px,py,size*.2,color);
      }else{
        const sign=direction==='in'?1:-1;
        polygon(ctx,[[px-sign*size*.43,py-size*.5],[px+sign*size*.45,py],[px-sign*size*.43,py+size*.5]],color);
      }
      if(complete&&connected&&b.active&&finite(cell[layer.flow])>.0001){
        ctx.globalAlpha*=.35+.2*Math.sin(t*4);
        circle(ctx,px,py,size+.045,null,layer.color,.02);
      }
      ctx.restore();
    }
    if(this.overlay==='power' && (Math.abs(finite(BUILDINGS[b.type]?.power))>0||b.type==='battery')){
      const color=b.connected?'#ecd08e':'#ed9e85';
      circle(ctx,b.x+.5,b.y+.72,.105,'#263632',color,.025);
      polygon(ctx,[[b.x+.515,b.y+.65],[b.x+.445,b.y+.735],[b.x+.5,b.y+.72],[b.x+.475,b.y+.8],[b.x+.555,b.y+.695],[b.x+.505,b.y+.71]],color);
    }
    if(b.type==='core' && (plumbing||selected) && finite(b.cleanCapacity)>0){
      rounded(ctx,b.x+.17,b.y+1.035,.66,.06,.02,'#19343d','#71b8cc',.015);
      const level=clamp(finite(b.cleanWater)/b.cleanCapacity,0,1);
      if(level>0)rounded(ctx,b.x+.18,b.y+1.045,.64*level,.04,.01,'#99dce0');
    }
  }

  _tasks(ctx,t) {
    for(const task of this.game.tasks||[]) {
      const {x,y}=task;if(!this._cell(x,y)?.revealed)continue;
      const p=clamp(finite(task.progress),0,1);
      const blocked=!!task.blockedReason;
      const color=task.type==='deconstruct'?'#e8a18a':task.type==='dig'?'#dbc38d':'#a6d9c3';
      ctx.save();
      if(task.type==='dig') {
        ctx.fillStyle='rgba(224,192,126,.08)';ctx.fillRect(x+.04,y+.04,.92,.92);
        ctx.setLineDash([.07,.08]);rounded(ctx,x+.13,y+.13,.74,.74,.05,null,'rgba(235,208,149,.55)',.025);ctx.setLineDash([]);
        line(ctx,[[x+.37,y+.36],[x+.63,y+.64]],color,.045);
        line(ctx,[[x+.63,y+.36],[x+.37,y+.64]],color,.045);
      } else if(task.type==='deconstruct') {
        line(ctx,[[x+.27,y+.27],[x+.73,y+.73]],color,.06);
        line(ctx,[[x+.73,y+.27],[x+.27,y+.73]],color,.06);
      }
      if(p>0 || task.assigned!==null) {
        rounded(ctx,x+.18,y+.91,.64,.045,.018,'rgba(12,25,27,.8)');
        if(p>0)rounded(ctx,x+.18,y+.91,.64*p,.045,.018,color);
      }
      if(task.assigned!==null && p>0 && !blocked)for(let i=0;i<4;i++) {
        const ph=(t*1.7+i*.23)%1;
        const angle=-2.7+noise(i,task.id||0,4)*2.2;
        ctx.globalAlpha=(1-ph)*.75;
        const px=x+.5+Math.cos(angle)*ph*.38,py=y+.56+Math.sin(angle)*ph*.35+ph*ph*.15;
        ctx.fillStyle=color;ctx.fillRect(px,py,.035,.035);
      }
      ctx.globalAlpha=1;
      if(blocked){
        ctx.setLineDash([.07,.06]);rounded(ctx,x+.045,y+.045,.91,.91,.05,null,'rgba(229,147,121,.65)',.028);ctx.setLineDash([]);
        circle(ctx,x+.18,y+.16,.115,'#5a3d39','#e4ac88',.025);
        line(ctx,[[x+.13,y+.11],[x+.23,y+.21]],'#f0d5b0',.035);
        line(ctx,[[x+.13,y+.21],[x+.23,y+.11]],'#f0d5b0',.035);
        if(this.selection?.x===x&&this.selection?.y===y){
          const fs=9/this.cellSize;ctx.font=`600 ${fs}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
          const label='작업 대기',w=ctx.measureText(label).width+.2;
          rounded(ctx,x+.5-w/2,y-.21-fs,w,fs+.12,.04,'#573d38');ctx.fillStyle='#ecc5a4';ctx.fillText(label,x+.5,y-.15-fs/2);
        }
      }
      if(task.priority>=5 && this.cellSize>=18) {
        circle(ctx,x+.81,y+.17,.095,'#c4a770');
        ctx.fillStyle='#20332e';ctx.font=`bold ${8/this.cellSize}px system-ui,sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',x+.81,y+.175);
      }
      ctx.restore();
    }
  }

  _selectedPath(ctx) {
    const at=this.selection||this.hover;if(!at)return;
    const task=this.game.tasks?.find(v=>v.x===at.x&&v.y===at.y);
    const pile=this.game.debris?.find(v=>v.x===at.x&&v.y===at.y&&v.reservedBy!=null);
    const building=this.game.buildings?.find(v=>v.x===at.x&&v.y===at.y);
    const c=this.game.crew?.find(v=>Math.floor(v.x)===at.x&&Math.floor(v.y)===at.y)
      ||this.game.crew?.find(v=>task?.assigned===v.id||pile?.reservedBy===v.id)
      ||this.game.crew?.find(v=>building&&v._job?.targetId===building.id);
    if(!c?.path?.length)return;
    this._crewPath(ctx,c,c.cargo?'rgba(237,210,151,.9)':'rgba(176,226,199,.85)',true);
  }

  _crewPath(ctx,c,color,selected) {
    if(!Number.isFinite(c.x)||!Number.isFinite(c.y)||!Array.isArray(c.path))return;
    const points=[[c.x,c.y+.35]];
    for(const p of c.path.slice(0,48)){
      if(!Number.isInteger(p.x)||!Number.isInteger(p.y)||!this._cell(p.x,p.y)?.revealed)break;
      points.push([p.x+.5,p.y+.85]);
    }
    if(points.length<2)return;
    ctx.save();ctx.setLineDash(selected?[.055,.1]:[.08,.12]);line(ctx,points,color,selected?.04:.027);ctx.setLineDash([]);
    for(let i=2;i<points.length;i+=4){
      const [x,y]=points[i],[px,py]=points[i-1],a=Math.atan2(y-py,x-px);
      ctx.save();ctx.translate(x,y);ctx.rotate(a);line(ctx,[[-.1,-.07],[0,0],[-.1,.07]],color,selected?.026:.02);ctx.restore();
    }
    if(selected){const [x,y]=points[points.length-1];circle(ctx,x,y,.09,'#32574e',color,.025);}
    ctx.restore();
  }

  _portablePack(ctx,c) {
    const oxygen=Math.max(0,finite(c.portableOxygen)),capacity=Math.max(0,finite(c.portableCapacity));
    if(!oxygen&&!c.usingPortable&&c._job?.kind!=='refillOxygen')return;
    const fill=capacity>0?clamp(oxygen/capacity,0,1):0,off=c.maskMode==='off';
    rounded(ctx,-.325,-.095,.165,.33,.055,off?'#53696a':'#527b75','#253d40',.025);
    rounded(ctx,-.292,-.04,.095,.21,.03,'#26474c');
    if(fill>0)rounded(ctx,-.28,.155-.18*fill,.07,.18*fill,.022,off?'#93afa3':'#b9e1ce');
    rounded(ctx,-.278,-.13,.07,.06,.015,'#c0cdb1');
    line(ctx,[[-.19,-.035],[-.13,-.01]],'#a5baa3',.024);
  }

  _portableMask(ctx,c) {
    if(c.usingPortable!==true||finite(c.health,100)<=0)return;
    line(ctx,[[-.2,-.17],[-.09,-.12],[.13,-.12],[.2,-.17]],'#a1cfc0',.018);
    line(ctx,[[.01,-.105],[-.16,-.075],[-.24,-.02],[-.24,.035]],'#29484b',.045);
    line(ctx,[[.01,-.105],[-.16,-.075],[-.24,-.02],[-.24,.035]],'#aedbcc',.021);
    rounded(ctx,-.065,-.17,.19,.1,.035,'#accfc0','#456d68',.019);
    line(ctx,[[-.015,-.145],[.065,-.145]],'#e1ebcd',.014);
    circle(ctx,.028,-.11,.025,'#476f69','#c9e4cf',.012);
  }

  _skillBadge(ctx,skill,rank,x,y,r) {
    const style=SKILL_STYLES[skill];if(!style||rank<=0)return;
    ctx.save();ctx.translate(x,y);ctx.scale(r,r);
    circle(ctx,0,0,1,style.dark,style.color,.12);
    if(skill==='dig'){
      line(ctx,[[-.4,.52],[.35,-.4]],style.color,.18);
      line(ctx,[[-.48,-.3],[-.12,-.55],[.38,-.4],[.57,-.08]],style.color,.16);
    }else if(skill==='engineering'){
      circle(ctx,0,-.05,.38,null,style.color,.15);
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2;line(ctx,[[Math.cos(a)*.38,Math.sin(a)*.38-.05],[Math.cos(a)*.63,Math.sin(a)*.63-.05]],style.color,.17);
      }
      circle(ctx,0,-.05,.1,style.color);
    }else{
      ctx.save();ctx.rotate(-.6);ellipse(ctx,.06,-.12,.29,.48,style.color);
      line(ctx,[[.04,.5],[.04,-.34]],style.dark,.12);ctx.restore();
    }
    for(let i=0;i<rank;i++)circle(ctx,(i-(rank-1)/2)*.5,.91,.14,style.color,'#203a3c',.05);
    ctx.restore();
  }

  _drawCrew(ctx,c,t) {
    if(!Number.isFinite(c.x)||!Number.isFinite(c.y))return;
    const here=this._cell(Math.floor(c.x),Math.floor(c.y));if(!here?.revealed)return;
    const id=Number(c.id)||0, action=String(c.action||''),kind=c._job?.kind;
    const carrying=finite(c.cargo?.amount)>0,hasPath=!!c.path?.length;
    const old=this._crewPositions.get(c.id);
    const moved=old?Math.hypot(c.x-old.x,c.y-old.y):0;
    this._crewPositions.set(c.id,{x:c.x,y:c.y});
    const walking=moved>.001;
    const sleeping=!hasPath&&!walking&&(kind==='rest'||/sleep|rest|수면|잠/.test(action.toLowerCase()));
    const working=!carrying&&!hasPath&&!walking&&(['dig','build','deconstruct','operate','research','harvest','wash','cook'].includes(kind)||(!kind&&/dig|build|operate|research|farm|harvest|wash|채굴|굴착|건설|발전|연구|재배|수확|세면|손 씻/.test(action.toLowerCase())));
    const eating=!carrying&&!hasPath&&kind==='eat',relaxing=!carrying&&!hasPath&&kind==='relax';
    const refilling=!!this._refillingDock(c);
    const color=c.color||['#8dc4b1','#d59d8c','#b6a9d0'][id%3];
    const face=['#e7c39a','#c9a582','#dcbda4'][id%3];
    const faceLight=['#efd3ad','#ddba96','#e5cbb7'][id%3];
    const hair=['#3b4544','#6a4542','#4c465e'][id%3];
    const facing=c.facing===-1?-1:1;
    const bob=walking?Math.sin(t*12+id)*.025:Math.sin(t*2+id)*.009;
    const dead=finite(c.health,100)<=0;
    ctx.save();ctx.translate(c.x,c.y);
    ellipse(ctx,0,.44,.29,.075,'rgba(2,10,15,.34)');
    if(sleeping||dead) {
      ctx.save();ctx.translate(.03,.22);ctx.rotate(-Math.PI/2);
      this._portablePack(ctx,c);
      rounded(ctx,-.16,-.07,.32,.42,.1,dead?'#7c8582':color,'#25393a',.035);
      ellipse(ctx,0,-.25,.2,.19,face);
      ellipse(ctx,0,-.35,.2,.1,hair);
      line(ctx,[[.025,-.25],[.095,-.25]],'#33433d',.018);
      this._portableMask(ctx,c);
      rounded(ctx,-.16,.3,.13,.12,.035,'#34474a');rounded(ctx,.03,.3,.13,.12,.035,'#34474a');ctx.restore();
      if(!dead) {
        ctx.save();ctx.globalAlpha=.45+Math.sin(t*1.2)*.15;ctx.fillStyle='#c3cbb6';ctx.font=`${9/this.cellSize}px system-ui,sans-serif`;ctx.textAlign='center';ctx.fillText('z',.28,-.35-Math.sin(t)*.035);ctx.restore();
      }
    } else {
      ctx.translate(0,bob);
      ctx.save();ctx.scale(facing,1);this._portablePack(ctx,c);ctx.restore();
      const stride=walking?Math.sin(t*12+id)*.10:0;
      line(ctx,[[-.085,.21],[-.10+stride,.36]],'#526768',.10);
      line(ctx,[[.085,.21],[.10-stride,.36]],'#526768',.10);
      rounded(ctx,-.17+stride,.33,.18,.105,.035,'#24393d');rounded(ctx,.025-stride,.33,.18,.105,.035,'#24393d');
      rounded(ctx,-.17,-.08,.34,.35,.11,color,'#243b3e',.035);
      line(ctx,[[-.12,.03],[.12,.03]],'rgba(236,240,211,.6)',.034);
      rounded(ctx,-.058,.10,.116,.09,.018,'rgba(28,57,57,.28)');
      const swing=walking?Math.sin(t*12+id+Math.PI)*.07:0;
      line(ctx,[[-.16,-.015],[-.23,.13+swing]],color,.09);
      circle(ctx,-.23,.14+swing,.049,face);
      ctx.save();ctx.scale(facing,1);
      const armAngle=eating?-.5+Math.sin(t*3+id)*.14:relaxing?-.15:refilling?.25:working?-.7+Math.sin(t*7+id)*.5:0;
      ctx.save();ctx.translate(.15,.015);ctx.rotate(armAngle);
      line(ctx,[[0,0],[.09,.13-swing]],color,.09);circle(ctx,.1,.14-swing,.05,face);
      if(working) {
        line(ctx,[[.07,.22],[.16,-.10]],'#d8b98b',.036);
        if(kind==='cook')ellipse(ctx,.16,-.14,.045,.07,'#d5d7b9');
        else if(/dig|채굴|굴착/.test(action.toLowerCase()))line(ctx,[[.045,-.12],[.16,-.16],[.29,-.09]],'#bfccc1',.045);
        else rounded(ctx,.11,-.16,.12,.09,.025,'#bec8bd','#6f8980',.02);
      }
      ctx.restore();
      ellipse(ctx,0,-.235,.215,.205,face);
      ellipse(ctx,-.04,-.29,.15,.13,faceLight);
      if(id%3===0) {
        ctx.beginPath();ctx.moveTo(-.2,-.28);ctx.bezierCurveTo(-.22,-.52,.2,-.53,.21,-.26);ctx.lineTo(.1,-.37);ctx.lineTo(.025,-.31);ctx.lineTo(-.08,-.38);ctx.lineTo(-.2,-.28);ctx.fillStyle=hair;ctx.fill();
        ellipse(ctx,-.19,-.24,.045,.10,hair);
      } else if(id%3===1) {
        ellipse(ctx,-.19,-.34,.10,.11,hair);ellipse(ctx,-.015,-.39,.205,.11,hair);
        polygon(ctx,[[-.17,-.38],[.17,-.4],[.14,-.26],[.055,-.32],[-.04,-.29]],hair);
      } else {
        rounded(ctx,-.22,-.42,.43,.16,.09,'#b1a4c1','#756b8b',.02);
        rounded(ctx,-.235,-.32,.46,.055,.018,'#857d9b');circle(ctx,-.03,-.46,.065,'#c7b7ce');
      }
      circle(ctx,-.205,-.21,.048,face);circle(ctx,.205,-.21,.048,face);
      const blink=((t+id*1.27)%5.4)>.13;
      if(blink) {
        ellipse(ctx,-.054,-.22,.022,.032,'#293c39');ellipse(ctx,.078,-.22,.022,.032,'#293c39');
        circle(ctx,-.049,-.232,.006,'#f0ebd4');circle(ctx,.083,-.232,.006,'#f0ebd4');
      } else {line(ctx,[[-.075,-.22],[-.03,-.22]],'#35463d',.016);line(ctx,[[.055,-.22],[.10,-.22]],'#35463d',.016);}
      ellipse(ctx,.137,-.16,.037,.02,'rgba(178,102,87,.25)');
      if(finite(c.breath,100)<25)circle(ctx,.025,-.12,.026,null,'#6b6154',.013);
      else {ctx.beginPath();ctx.arc(.015,-.155,.045,.22,Math.PI-.22);ctx.strokeStyle='#7b6854';ctx.lineWidth=.014;ctx.stroke();}
      this._portableMask(ctx,c);
      ctx.restore();
      if(carrying){
        const palette=cargoStyle(c.cargo.resource);
        ctx.save();ctx.scale(facing,1);
        rounded(ctx,.045,.015,.4,.285,.035,'#75664d','#c5b28b',.03);
        line(ctx,[[.08,.045],[.41,.265]],'#ad9874',.028);line(ctx,[[.41,.045],[.08,.265]],'#ad9874',.028);
        rounded(ctx,.13,.065,.225,.15,.02,palette.dark);
        this._resourceGlyph(ctx,c.cargo.resource,.24,.14,.28);
        circle(ctx,.055,.15,.048,face);circle(ctx,.425,.15,.043,face);
        ctx.restore();
      }else if(eating){
        ctx.save();ctx.scale(facing,1);
        ellipse(ctx,.22,.21,.16,.05,'#d8ddc4');ellipse(ctx,.22,.2,.11,.033,'#b6bf83');
        line(ctx,[[.32,.11],[.2,-.06+Math.sin(t*3+id)*.025]],'#d6d7bb',.025);
        circle(ctx,.2,-.065+Math.sin(t*3+id)*.025,.025,'#c8c795');ctx.restore();
      }else if(relaxing){
        ctx.save();ctx.scale(facing,1);
        rounded(ctx,.2,.105,.11,.13,.023,'#bad3b9','#6b998e',.022);
        ctx.beginPath();ctx.arc(.34,.17,.032,-Math.PI/2,Math.PI/2);ctx.strokeStyle='#aac5a8';ctx.lineWidth=.022;ctx.stroke();ctx.restore();
      }
    }
    const selected=(this.selection?.x===Math.floor(c.x)&&this.selection?.y===Math.floor(c.y));
    const hovered=(this.hover?.x===Math.floor(c.x)&&this.hover?.y===Math.floor(c.y));
    if(this.cellSize>=21||selected||hovered) {
      const level=clamp(Math.floor(finite(c.level)),0,6);
      const name=`${String(c.name||'탐사대')}${level?` · Lv.${level}`:''}`;
      const fontSize=Math.max(9,Math.min(11,this.cellSize*.37));
      ctx.font=`600 ${fontSize/this.cellSize}px system-ui,-apple-system,sans-serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';
      const labelW=Math.max(.72,ctx.measureText(name).width+.24);
      const labelH=(fontSize+4)/this.cellSize;
      rounded(ctx,-labelW/2,-.58-labelH,labelW,labelH,.065,selected?'rgba(64,93,78,.96)':'rgba(15,34,39,.8)');
      ctx.fillStyle=selected?'#d6efd5':'#c2cebe';ctx.fillText(name,0,-.58-labelH/2);
      if(finite(c.skillPoints)>0&&!dead)circle(ctx,labelW/2+.075,-.58-labelH/2,.035,'#e5c68b','#665b42',.012);
      const ranks=Object.keys(SKILL_STYLES).map(skill=>({skill,rank:clamp(Math.floor(finite(c.skills?.[skill])),0,3)})).filter(entry=>entry.rank>0);
      ranks.sort((a,b)=>b.rank-a.rank);
      const badges=selected||hovered?ranks:ranks.slice(0,1),r=Math.max(.135,3.8/this.cellSize);
      badges.forEach(({skill,rank},i)=>this._skillBadge(ctx,skill,rank,-.39-r-i*(r*2+.075),.045,r));
    }
    if(finite(c.health,100)<55||finite(c.breath,100)<25) {
      const value=finite(c.breath,100)<25?finite(c.breath)/100:finite(c.health)/100;
      rounded(ctx,-.29,-.55,.58,.045,.015,'#243639');rounded(ctx,-.29,-.55,.58*clamp(value,0,1),.045,.015,'#e6957b');
    }
    if(!dead){
      const needs=[];
      if(Number.isFinite(c.bladder)&&c.bladder>=70)needs.push('toilet');
      if(Number.isFinite(c.hygiene)&&c.hygiene<=35)needs.push('wash');
      if(Number.isFinite(c.stress)&&c.stress>=65)needs.push('stress');
      const r=Math.max(.115,3.8/this.cellSize);
      for(let i=0;i<needs.length;i++){
        const x=.29+r,y=-.3+i*(r*2+.04),urgent=needs[i]==='toilet'&&c.bladder>=90;
        circle(ctx,x,y,r,urgent?'#67423b':'#3c4b43',urgent?'#e5a282':'#d2c392',.021);
        if(needs[i]==='stress'){
          line(ctx,[[x-r*.47,y-r*.42],[x-r*.02,y-r*.12],[x-r*.33,y+r*.1],[x+r*.4,y+r*.45]],'#eac39d',.026);
        }else if(needs[i]==='wash'){
          droplet(ctx,x,y,r*.61,'#b7ddd2');
          line(ctx,[[x-r*.5,y+r*.55],[x+r*.5,y-r*.55]],'#f0d9ac',.025);
        }else{
          rounded(ctx,x-r*.55,y-r*.53,r*.36,r*.65,.012,'#e3d8ba');
          line(ctx,[[x-r*.22,y],[x+r*.48,y]],'#e9dfc5',.04);
          ctx.beginPath();ctx.arc(x+r*.12,y,r*.35,0,Math.PI);ctx.strokeStyle='#e9dfc5';ctx.lineWidth=.04;ctx.stroke();
          line(ctx,[[x+r*.1,y+r*.28],[x+r*.1,y+r*.53]],'#e9dfc5',.04);
        }
      }
      if(carrying&&(this.overlay==='logistics'||selected||hovered)&&(this.cellSize>=18||selected||hovered)){
        const style=cargoStyle(c.cargo.resource);
        this._worldLabel(ctx,`${style.label} ${quantity(c.cargo.amount)}`,0,.66,style.color);
      }
      const portable=Math.max(0,finite(c.portableOxygen)),capacity=Math.max(0,finite(c.portableCapacity));
      if(capacity>0&&(selected||hovered||(this.overlay==='oxygen'&&(portable>0||refilling)))&&(this.cellSize>=18||selected||hovered)){
        const status=c.usingPortable===true?' · 사용':refilling?' · 충전':c.maskMode==='off'?' · 꺼짐':'';
        const label=`O₂ ${quantity(portable)} / ${quantity(capacity)}${status}`;
        this._worldLabel(ctx,label,0,carrying&&(selected||hovered)?1.09:.69,c.usingPortable===true?'#c6efd9':c.maskMode==='off'?'#b5b5a5':'#a9c8bf');
      }
      if((selected||hovered)&&c.schedule&&c.schedule!=='auto'&&['work','break','sleep'].includes(c.schedulePhase)){
        const text={work:'작업 시간',break:'여가 시간',sleep:'수면 시간'}[c.schedulePhase];
        this._worldLabel(ctx,text,0,-1.3,c.schedulePhase==='sleep'?'#c1bde6':c.schedulePhase==='break'?'#e2c894':'#bad7bb');
      }
    }
    ctx.restore();
  }

  _fog(ctx,x0,y0,x1,y1,t) {
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++) {
      const c=this._cell(x,y);if(!c||c.revealed)continue;
      ctx.fillStyle='#0a1921';ctx.fillRect(x-.005,y-.005,1.01,1.01);
      if(noise(x,y,31)>.74) {
        polygon(ctx,[[x,y+.1],[x+.6,y+.02],[x+1,y+.5],[x+.6,y+.87],[x,y+.6]],'#0d1d25');
      }
      const neighbors=[[0,-1],[0,1],[-1,0],[1,0]];
      for(const [dx,dy] of neighbors)if(this._cell(x+dx,y+dy)?.revealed) {
        const gx=x+.5+dx*.5,gy=y+.5+dy*.5;
        const fade=ctx.createLinearGradient(gx,gy,gx-dx*.42,gy-dy*.42);
        fade.addColorStop(0,'rgba(72,84,78,.25)');fade.addColorStop(1,'rgba(16,28,34,0)');
        ctx.fillStyle=fade;ctx.fillRect(x,y,1,1);
      }
      if(noise(x,y,57)>.985)circle(ctx,x+.5,y+.5,.025,'#34444a');
    }
  }

  _interaction(ctx,t) {
    const h=this.hover;
    const validCell=h&&h.x>=0&&h.y>=0&&h.x<this.game.w&&h.y<this.game.h;
    const networkDrag=!!this.dragRect&&['wire','pipe','wastepipe','gaspipe'].includes(this.tool);
    if(this.dragRect) {
      if(networkDrag)this._networkDrag(ctx,this.dragRect);
      else{
        const d=this.dragRect,x=Math.min(d.x1,d.x2),y=Math.min(d.y1,d.y2);
        const w=Math.abs(d.x2-d.x1)+1,ht=Math.abs(d.y2-d.y1)+1;
        const cancel=['cancel','deconstruct','removePipe','removeWastepipe','removeGasPipe'].includes(this.tool);
        ctx.save();ctx.setLineDash([.15,.12]);
        rounded(ctx,x+.02,y+.02,w-.04,ht-.04,.08,cancel?'rgba(230,139,117,.10)':'rgba(185,211,160,.09)',cancel?'#e6a18a':'#c6d9b1',.045);
        ctx.restore();
      }
    }
    if(this.selection && this.selection.x>=0 && this.selection.y>=0) {
      const {x,y}=this.selection;
      const selected=this.game.modernRules&&this.game._buildingAt?.(x,y);
      const bounds=selected?this._bounds(selected):{x,y,width:1,height:1};
      rounded(ctx,bounds.x+.025,bounds.y+.025,bounds.width-.05,bounds.height-.05,.07,'rgba(162,214,181,.035)','rgba(172,224,194,.75)',.033);
      this._corners(ctx,x,y,'#c7e8c5',.06);
    }
    if(!validCell)return;
    const {x,y}=h;
    let ok=true;
    if(this.tool && !['inspect','pan','move'].includes(this.tool)) {
      try{ok=this.game.canPlace(this.tool,x,y,this.game.buildRotation||0)?.ok!==false;}catch{ok=false;}
    }
    const isBuild=!!BUILDINGS[this.tool];
    const cell=this._cell(x,y);
    const blueprint={type:this.tool,x,y,rotation:this.game.buildRotation||0,progress:0,enabled:true,active:false,connected:false,growth:.5};
    const bounds=isBuild?this._bounds(blueprint):{x,y,width:1,height:1};
    if(isBuild && !this.dragRect) {
      ctx.save();ctx.translate(bounds.x,bounds.y);ctx.scale(bounds.width,bounds.height);ctx.globalAlpha=ok?.5:.24;
      this._machine(ctx,blueprint,t);
      ctx.restore();
      this._machinePorts(ctx,blueprint,t);
    }
    if(this.tool==='wire'&&!networkDrag) {
      line(ctx,[[x+.2,y+.72],[x+.8,y+.72]],ok?'#eed093':'#d68e7d',.065);
      circle(ctx,x+.5,y+.72,.07,ok?'#eed093':'#d68e7d');
    }
    const pipeLayer=PIPE_LAYERS.find(v=>v.key===this.tool||v.removeTool===this.tool||(v.key==='pipe'?'removePipe':'removeWastepipe')===this.tool);
    if(pipeLayer&&!networkDrag){
      const px=x+pipeLayer.x,py=y+pipeLayer.y,removing=this.tool.startsWith('remove');
      const pipeColor=!ok||removing?'#e4a184':pipeLayer.color;
      ctx.save();ctx.setLineDash([.08,.07]);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(this._cell(x+dx,y+dy)?.[pipeLayer.cellKey||pipeLayer.key])line(ctx,[[px,py],[px+dx*.5,py+dy*.5]],pipeColor,.065);
      ctx.setLineDash([]);
      if(pipeLayer.key==='pipe')circle(ctx,px,py,.105,'#183641',pipeColor,.035);
      else if(pipeLayer.key==='gaspipe')polygon(ctx,[[px,py-.12],[px+.12,py],[px,py+.12],[px-.12,py]],'#183b39',pipeColor,.035);
      else rounded(ctx,px-.1,py-.1,.2,.2,.02,'#3a3b30',pipeColor,.035);
      if(removing){line(ctx,[[px-.06,py-.06],[px+.06,py+.06]],pipeColor,.03);line(ctx,[[px+.06,py-.06],[px-.06,py+.06]],pipeColor,.03);}
      ctx.restore();
    }
    const color=!ok?'#e49a83':['cancel','deconstruct','removePipe','removeWastepipe','removeGasPipe'].includes(this.tool)?'#e7a18c':this.tool==='dig'?'#e6ca8c':pipeLayer?pipeLayer.color:'#c7e4c9';
    const tint=!ok?'rgba(216,122,104,.09)':this.tool==='dig'&&cell?.solid?'rgba(237,204,143,.14)':'rgba(183,225,193,.045)';
    rounded(ctx,bounds.x+.015,bounds.y+.015,bounds.width-.03,bounds.height-.03,.05,tint,color,.035);
    this._corners(ctx,x,y,color,.07);
    if(!ok && isBuild)line(ctx,[[x+.37,y+.38],[x+.63,y+.64]],'#e7a18c',.04);
  }

  _networkDrag(ctx,d) {
    const layer=PIPE_LAYERS.find(v=>v.key===this.tool)||{key:'wire',x:.5,y:.72,color:'#e8cb88'};
    const x1=d.x1,x2=d.x2,y1=d.y1,y2=d.y2;
    const points=[[x1+layer.x,y1+layer.y],[x2+layer.x,y1+layer.y],[x2+layer.x,y2+layer.y]];
    ctx.save();ctx.beginPath();ctx.rect(0,0,this.game.w,this.game.h);ctx.clip();
    line(ctx,points,'rgba(10,28,33,.85)',.17);ctx.setLineDash([.12,.08]);line(ctx,points,layer.color,.07);ctx.setLineDash([]);
    const cells=[],dx=x2>=x1?1:-1,dy=y2>=y1?1:-1;
    for(let x=x1;;x+=dx){cells.push({x,y:y1});if(x===x2)break;}
    if(y1!==y2)for(let y=y1+dy;;y+=dy){cells.push({x:x2,y});if(y===y2)break;}
    for(const {x,y} of cells){
      const cell=this._cell(x,y);if(!cell)continue;let valid=!!cell[layer.cellKey||layer.key];
      if(!valid){try{valid=this.game.canPlace(this.tool,x,y,this.game.buildRotation||0)?.ok===true;}catch{valid=false;}}
      const color=valid?layer.color:'#e69b83',px=x+layer.x,py=y+layer.y;
      if(layer.key==='wastepipe')rounded(ctx,px-.075,py-.075,.15,.15,.016,'#263a3a',color,.028);
      else if(layer.key==='gaspipe')polygon(ctx,[[px,py-.065],[px+.065,py],[px,py+.065],[px-.065,py]],'#183b39',color,.028);
      else circle(ctx,px,py,.065,'#16313c',color,.028);
      if(!valid)line(ctx,[[px-.04,py-.04],[px+.04,py+.04]],color,.025);
    }
    this._corners(ctx,x1,y1,layer.color,.045);
    this._corners(ctx,x2,y2,layer.color,.045);
    ctx.restore();
  }

  _corners(ctx,x,y,color,width) {
    for(const [cx,cy,dx,dy] of [[x+.01,y+.01,1,1],[x+.99,y+.01,-1,1],[x+.01,y+.99,1,-1],[x+.99,y+.99,-1,-1]]) {
      line(ctx,[[cx,cy+dy*.16],[cx,cy],[cx+dx*.16,cy]],color,width);
    }
  }

  _vignette(ctx) {
    const r=Math.max(this.width,this.height)*.7;
    const v=ctx.createRadialGradient(this.width*.5,this.height*.46,Math.min(this.width,this.height)*.3,this.width*.5,this.height*.46,r);
    v.addColorStop(0,'rgba(4,13,19,0)');v.addColorStop(1,'rgba(4,13,19,.24)');
    ctx.fillStyle=v;ctx.fillRect(0,0,this.width,this.height);
  }
}
