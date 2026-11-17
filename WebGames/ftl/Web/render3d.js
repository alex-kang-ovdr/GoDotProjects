(function () {
  'use strict';

  // A dependency-free WebGL renderer. Simulation, selections and commands stay
  // in the existing game/UI; this file only reads them and reports pointer hits.
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const number = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
  const TAU = Math.PI * 2;
  const FLOOR = 0.22;
  const STRIDE = 14;
  const semantic = {
    friendly: '#80e1cc', enemy: '#f09d79', selected: '#ffe4a0', danger: '#f76d83',
    ion: '#91b7ff', hacking: '#c19af1', empty: '#668294'
  };
  const styles = {
    stellar: { id: 'stellar', name: '스텔라', label: '스텔라 · 미래형', colors: { ...semantic, background: '#07111c', hull: '#223b4b', floor: '#1b3342', wall: '#365362', grid: '#5b8696', rim: '#62929f' }, ambient: 0.42, diffuse: 0.68, edges: 0.35 },
    lowpoly: { id: 'lowpoly', name: '로우폴리', label: '로우폴리', colors: { ...semantic, background: '#151d2a', hull: '#626b7c', floor: '#71878e', wall: '#9aaba7', grid: '#394a59', rim: '#cad3c2' }, ambient: 0.32, diffuse: 0.88, edges: 0.18 },
    blueprint: { id: 'blueprint', name: '블루프린트', label: '블루프린트', colors: { ...semantic, background: '#061727', hull: '#0b334d', floor: '#0d3b55', wall: '#17516b', grid: '#6eb9d7', rim: '#a4deec' }, ambient: 0.75, diffuse: 0.3, edges: 0.88 }
  };
  for (const definition of Object.values(styles)) { Object.freeze(definition.colors); Object.freeze(definition); }
  Object.freeze(styles);
  const colorCache = new Map();
  function color(value, alpha = 1) {
    let base = colorCache.get(value);
    if (!base) { const hex = value.replace('#', ''); base = [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255]; colorCache.set(value, base); }
    return [base[0], base[1], base[2], alpha];
  }
  const shade = (c, strength, alpha = c[3]) => [c[0] * strength, c[1] * strength, c[2] * strength, alpha];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, n) => [a[0] * n, a[1] * n, a[2] * n];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const normal = a => { const n = Math.hypot(...a) || 1; return scale(a, 1 / n); };
  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return out;
  }
  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function lookAt(eye, target) {
    const z = normal(sub(eye, target)), x = normal(cross([0, 1, 0], z)), y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
  }
  function rotateY(p, angle) { const c = Math.cos(angle), s = Math.sin(angle); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; }

  class Batch {
    constructor(gl, capacity = 8192) { this.gl = gl; this.data = new Float32Array(capacity * STRIDE); this.count = 0; this.buffer = gl?.createBuffer()||null; this.gpuSize = 0; this.projected = null; }
    reset() { this.count = 0; }
    vertex(p, n, c, id = 0, emissive = 0) {
      const start = this.count++ * STRIDE;
      if (start + STRIDE > this.data.length) { const next = new Float32Array(this.data.length * 2); next.set(this.data); this.data = next; }
      const a = this.data;
      a[start] = p[0]; a[start + 1] = p[1]; a[start + 2] = p[2];
      a[start + 3] = n[0]; a[start + 4] = n[1]; a[start + 5] = n[2];
      a[start + 6] = c[0]; a[start + 7] = c[1]; a[start + 8] = c[2]; a[start + 9] = c[3] ?? 1;
      a[start + 10] = emissive;
      a[start + 11] = (id & 255) / 255; a[start + 12] = ((id >> 8) & 255) / 255; a[start + 13] = ((id >> 16) & 255) / 255;
    }
    triangle(a, b, c, tint, id = 0, emissive = 0) { const n = normal(cross(sub(b, a), sub(c, a))); this.vertex(a, n, tint, id, emissive); this.vertex(b, n, tint, id, emissive); this.vertex(c, n, tint, id, emissive); }
    quad(a, b, c, d, tint, id = 0, emissive = 0) { this.triangle(a, b, c, tint, id, emissive); this.triangle(a, c, d, tint, id, emissive); }
    box(center, size, tint, id = 0, angle = 0, emissive = 0) {
      const [x, y, z] = size.map(n => n / 2);
      const points = [[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]].map(p => add(center, angle ? rotateY(p, angle) : p));
      for (const face of [[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]]) this.quad(...face.map(i => points[i]), tint, id, emissive);
    }
    cylinder(a, b, radius, tint, id = 0, sides = 8, emissive = 0, tipRadius = radius) {
      if(!this.gl)sides=Math.min(sides,5);
      const axis = normal(sub(b, a));
      const u = normal(cross(axis, Math.abs(axis[1]) < 0.9 ? [0,1,0] : [1,0,0])), v = cross(axis, u);
      for (let i = 0; i < sides; i++) {
        const p = i / sides * TAU, q = (i + 1) / sides * TAU;
        const one = add(scale(u, Math.cos(p)), scale(v, Math.sin(p))), two = add(scale(u, Math.cos(q)), scale(v, Math.sin(q)));
        const a1 = add(a, scale(one, radius)), a2 = add(a, scale(two, radius)), b1 = add(b, scale(one, tipRadius)), b2 = add(b, scale(two, tipRadius));
        this.quad(a1, a2, b2, b1, tint, id, emissive); this.triangle(a, a2, a1, tint, id, emissive); this.triangle(b, b1, b2, tint, id, emissive);
      }
    }
    octa(center, size, tint, id = 0, emissive = 0) {
      const [x,y,z] = size, points = [[x,0,0],[-x,0,0],[0,y,0],[0,-y,0],[0,0,z],[0,0,-z]].map(p => add(center, p));
      for (const f of [[2,0,4],[2,4,1],[2,1,5],[2,5,0],[3,4,0],[3,1,4],[3,5,1],[3,0,5]]) this.triangle(points[f[0]],points[f[2]],points[f[1]],tint,id,emissive);
    }
    line(a, b, tint) { this.vertex(a, [0,1,0], tint, 0, 1); this.vertex(b, [0,1,0], tint, 0, 1); }
    upload() {
      if(!this.gl)return;
      const gl = this.gl; gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      if (this.gpuSize !== this.data.byteLength) { gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW); this.gpuSize = this.data.byteLength; }
      if (this.count) gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.count * STRIDE));
    }
    destroy() { this.gl?.deleteBuffer(this.buffer);this.projected=null; }
  }

  const vertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aNormal;
    attribute vec4 aColor;
    attribute float aEmissive;
    uniform mat4 uMatrix;
    varying vec3 vNormal;
    varying vec4 vColor;
    varying float vEmissive;
    void main() { gl_Position=uMatrix*vec4(aPosition,1.0); vNormal=aNormal; vColor=aColor; vEmissive=aEmissive; }
  `;
  const fragmentSource = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec4 vColor;
    varying float vEmissive;
    uniform vec3 uLight;
    uniform float uAmbient;
    uniform float uDiffuse;
    void main() {
      float diffuse=max(dot(normalize(vNormal),normalize(uLight)),0.0);
      float illumination=mix(uAmbient+uDiffuse*diffuse,1.0,clamp(vEmissive,0.0,1.0));
      gl_FragColor=vec4(vColor.rgb*illumination,vColor.a);
    }
  `;
  const pickVertexSource = `
    attribute vec3 aPosition;
    attribute vec3 aPickColor;
    uniform mat4 uMatrix;
    varying vec3 vPickColor;
    void main() { gl_Position=uMatrix*vec4(aPosition,1.0); vPickColor=aPickColor; }
  `;
  const pickFragmentSource = `
    precision mediump float;
    varying vec3 vPickColor;
    void main() { gl_FragColor=vec4(vPickColor,1.0); }
  `;
  function program(gl, vs, fs) {
    const compile = (type, source) => { const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const reason = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(reason || 'WebGL shader compilation failed'); } return shader; };
    const v = compile(gl.VERTEX_SHADER, vs), f = compile(gl.FRAGMENT_SHADER, fs), p = gl.createProgram();
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p); gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { const reason = gl.getProgramInfoLog(p); gl.deleteProgram(p); throw new Error(reason || 'WebGL program linking failed'); }
    return { program:p, position:gl.getAttribLocation(p,'aPosition'), normal:gl.getAttribLocation(p,'aNormal'), color:gl.getAttribLocation(p,'aColor'), emissive:gl.getAttribLocation(p,'aEmissive'), pickColor:gl.getAttribLocation(p,'aPickColor'), matrix:gl.getUniformLocation(p,'uMatrix'), light:gl.getUniformLocation(p,'uLight'), ambient:gl.getUniformLocation(p,'uAmbient'), diffuse:gl.getUniformLocation(p,'uDiffuse') };
  }
  function polygonTriangles(points) {
    const indices = points.map((_, i) => i), result = [];
    const area = points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0);
    const sign = area >= 0 ? 1 : -1;
    const turn = (a, b, c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const inside = (p, a, b, c) => sign*turn(a,b,p)>=-1e-9&&sign*turn(b,c,p)>=-1e-9&&sign*turn(c,a,p)>=-1e-9;
    let guard = 0;
    while (indices.length > 3 && guard++ < points.length * points.length) {
      let clipped = false;
      for (let at = 0; at < indices.length; at++) {
        const a = indices[(at+indices.length-1)%indices.length], b = indices[at], c = indices[(at+1)%indices.length];
        if (sign*turn(points[a],points[b],points[c])<=1e-9) continue;
        if (indices.some(i => i!==a&&i!==b&&i!==c&&inside(points[i],points[a],points[b],points[c]))) continue;
        result.push([a,b,c]); indices.splice(at,1); clipped=true; break;
      }
      if (!clipped) break;
    }
    if (indices.length===3) result.push(indices.slice());
    return result;
  }
  function layoutPlan(game, ship) {
    const layout = game.getLayout?.(ship) || globalThis.Starward?.DATA?.layouts?.[ship.layoutId] || {};
    const rooms = ship.rooms || [], doors = ship.doors || [];
    const minX = Math.min(...rooms.map(r=>r.x)), minY = Math.min(...rooms.map(r=>r.y)), maxX = Math.max(...rooms.map(r=>r.x+r.w)), maxY = Math.max(...rooms.map(r=>r.y+r.h));
    const outline = layout.outline?.length>=3 ? layout.outline : [[minX-.35,minY-.35],[maxX+.35,minY-.35],[maxX+.35,maxY+.35],[minX-.35,maxY+.35]];
    const bounds = {minX:Math.min(minX,...outline.map(p=>p[0])),maxX:Math.max(maxX,...outline.map(p=>p[0])),minY:Math.min(minY,...outline.map(p=>p[1])),maxY:Math.max(maxY,...outline.map(p=>p[1]))};
    const groups = new Map();
    const edge = (axis, fixed, start, end) => { const key=axis+':'+fixed; if(!groups.has(key))groups.set(key,{axis,fixed,ranges:[],cuts:[]}); const g=groups.get(key);g.ranges.push([start,end]);g.cuts.push(start,end); };
    for(const r of rooms){edge('x',r.x,r.y,r.y+r.h);edge('x',r.x+r.w,r.y,r.y+r.h);edge('z',r.y,r.x,r.x+r.w);edge('z',r.y+r.h,r.x,r.x+r.w);}
    const walls=[];
    for(const g of groups.values()) {
      const openings=doors.filter(d=>(g.axis==='x'?d.orientation==='vertical'&&Math.abs(d.x-g.fixed)<.001:d.orientation==='horizontal'&&Math.abs(d.y-g.fixed)<.001)).map(d=>[(g.axis==='x'?d.y:d.x)-.34,(g.axis==='x'?d.y:d.x)+.34]);
      for(const hole of openings)g.cuts.push(...hole);
      const cuts=[...new Set(g.cuts)].sort((a,b)=>a-b);
      for(let i=1;i<cuts.length;i++) {
        const a=cuts[i-1],b=cuts[i],mid=(a+b)/2;
        if(b-a<.005||!g.ranges.some(r=>mid>=r[0]&&mid<=r[1])||openings.some(h=>mid>h[0]&&mid<h[1]))continue;
        const x=g.axis==='x'?g.fixed:mid,z=g.axis==='x'?mid:g.fixed;
        const contains=(px,pz)=>rooms.some(r=>px>r.x+1e-5&&px<r.x+r.w-1e-5&&pz>r.y+1e-5&&pz<r.y+r.h-1e-5);
        const negative=contains(x-(g.axis==='x'?.02:0),z-(g.axis==='z'?.02:0)),positive=contains(x+(g.axis==='x'?.02:0),z+(g.axis==='z'?.02:0));
        walls.push({axis:g.axis,fixed:g.fixed,start:a,end:b,outer:negative!==positive,outward:negative?1:-1});
      }
    }
    return {bounds,outline,triangles:polygonTriangles(outline),walls};
  }

  class Renderer {
    constructor(options) {
      this.canvas=options.canvas;this.onPick=typeof options.onPick==='function'?options.onPick:()=>{};this.onUnavailable=typeof options.onUnavailable==='function'?options.onUnavailable:()=>{};
      this.supported=false;this.destroyed=false;this.lost=false;this.reported=false;this.style=styles.stellar;this.styleId='stellar';this.backend=null;
      this.yaw=-.22;this.pitch=.89;this.zoom=1;this.points=new Map();this.drag=null;this.pinch=null;this.listeners=[];this.planCache=new WeakMap();this.placements={};this.pickTable=[null];this.lastGame=null;this.lastUi=null;this.frames=0;
      if(!this.canvas||typeof this.canvas.getContext!=='function'){this.unavailable('3D 화면을 만들 수 없어 2D 모드를 사용합니다.');return;}
      try {
        this.gl=this.canvas.getContext('webgl',{alpha:false,antialias:true,depth:true,premultipliedAlpha:false,preserveDrawingBuffer:false})||this.canvas.getContext('experimental-webgl',{alpha:false,antialias:true,depth:true});
        if(this.gl){this.backend='webgl';this.initialize();}
        else {
          this.context2d=this.canvas.getContext('2d',{alpha:false});
          if(!this.context2d)throw new Error('WebGL and Canvas2D unavailable');
          this.backend='software';this.initializeSoftware();
        }
        this.attachEvents();this.supported=!this.reported;
      } catch(error) { this.reason=String(error?.message||error);globalThis.console?.warn?.('[STARWARD 3D]',this.reason);this.unavailable('이 환경에서 WebGL을 사용할 수 없어 2D 모드로 돌아갑니다.'); }
    }
    unavailable(message) { this.supported=false;if(!this.reported){this.reported=true;try{this.onUnavailable(message);}catch(_){/* UI fallback must not break the game. */}} }
    initialize() {
      const gl=this.gl;
      this.mainProgram=program(gl,vertexSource,fragmentSource);this.pickProgram=program(gl,pickVertexSource,pickFragmentSource);
      this.solid=new Batch(gl,32768);this.translucent=new Batch(gl,8192);this.lines=new Batch(gl,8192);this.pickFloor=new Batch(gl,2048);
      this.pickFramebuffer=null;this.pickTexture=null;this.pickDepth=null;this.width=0;this.height=0;
      this.maxDimension=Math.min(4096,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)||4096);
      this.attributeCount=gl.getParameter(gl.MAX_VERTEX_ATTRIBS)||8;
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
      this.resize();
    }
    initializeSoftware() {
      this.solid=new Batch(null,32768);this.translucent=new Batch(null,8192);this.lines=new Batch(null,8192);this.pickFloor=new Batch(null,2048);
      this.width=0;this.height=0;this.maxDimension=2560;this.softwareFaces=[];this.softwareFacePool=[];this.softwarePickFaces=[];this.softwarePickPool=[];this.softwareBackground=[];this.softwareColors=new Map();this.softwareLastFrame=-Infinity;
      this.softwareStateSignature=null;this.softwareViewSignature=null;this.softwareWasPaused=null;
      this.resize();
    }
    listen(target,type,handler,options) {target.addEventListener(type,handler,options);this.listeners.push([target,type,handler,options]);}
    attachEvents() {
      const canvas=this.canvas;canvas.style.touchAction='none';
      if(!canvas.hasAttribute('tabindex'))canvas.tabIndex=0;
      this.listen(canvas,'contextmenu',e=>e.preventDefault());
      this.listen(canvas,'webglcontextlost',e=>{if(this.backend!=='webgl')return;e.preventDefault();this.lost=true;this.unavailable('3D 그래픽 연결이 끊겨 2D 모드로 돌아갑니다. 항해 상태는 그대로 유지됩니다.');});
      this.listen(canvas,'webglcontextrestored',()=>{if(this.backend!=='webgl')return;try{this.lost=false;this.reported=false;this.initialize();this.supported=!this.reported;}catch(_){this.unavailable('3D 화면을 복구하지 못해 2D 모드를 유지합니다.');}});
      this.listen(canvas,'pointerdown',e=>{
        if(!this.supported||e.button>2)return;
        this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});
        try{canvas.setPointerCapture(e.pointerId);}catch(_){}
        if(this.points.size===1)this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:e.button!==0,hit:e.button===0?this.pick(e.clientX,e.clientY):null};
        else {if(this.drag)this.drag.moved=true;const p=[...this.points.values()];this.pinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);}
      });
      this.listen(canvas,'pointermove',e=>{
        if(!this.points.has(e.pointerId))return;
        this.points.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(this.points.size>1){const p=[...this.points.values()],distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(this.pinch&&distance>1)this.zoom=clamp(this.zoom*this.pinch/distance,.48,2.7);this.pinch=distance;return;}
        const d=this.drag;if(!d||d.id!==e.pointerId)return;
        if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>5)d.moved=true;
        if(d.moved){this.yaw+=(e.clientX-d.lastX)*.006;this.pitch=clamp(this.pitch+(e.clientY-d.lastY)*.004,.52,1.43);}
        d.lastX=e.clientX;d.lastY=e.clientY;
      });
      const end=(e,cancel)=>{
        const d=this.drag;this.points.delete(e.pointerId);this.pinch=null;
        if(d?.id===e.pointerId){if(!cancel&&!d.moved&&d.hit){try{this.onPick({...d.hit,shiftKey:Boolean(e.shiftKey)});}catch(error){setTimeout(()=>{throw error;},0);}}this.drag=null;}
        if(!this.points.size)this.drag=null;
      };
      this.listen(canvas,'pointerup',e=>end(e,false));this.listen(canvas,'pointercancel',e=>end(e,true));
      this.listen(canvas,'wheel',e=>{if(!this.supported)return;e.preventDefault();this.zoom=clamp(this.zoom*Math.exp(clamp(e.deltaY,-600,600)*.0012),.48,2.7);},{passive:false});
      this.listen(canvas,'keydown',e=>{
        if(e.key==='ArrowLeft')this.yaw-=.08;else if(e.key==='ArrowRight')this.yaw+=.08;else if(e.key==='ArrowUp')this.pitch=clamp(this.pitch-.06,.52,1.43);else if(e.key==='ArrowDown')this.pitch=clamp(this.pitch+.06,.52,1.43);else if(e.key==='+'||e.key==='=')this.zoom=clamp(this.zoom*.9,.48,2.7);else if(e.key==='-')this.zoom=clamp(this.zoom/ .9,.48,2.7);else if(e.key==='Home')this.resetCamera();else return;e.preventDefault();
      });
      if(typeof ResizeObserver!=='undefined'){this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);}
    }
    setStyle(id) {if(!Object.hasOwn(styles,id))return false;this.styleId=id;this.style=styles[id];return true;}
    resetCamera(){this.yaw=-.22;this.pitch=.89;this.zoom=1;}
    resize() {
      if((!this.gl&&!this.context2d)||this.lost||this.destroyed)return false;
      const rect=this.canvas.getBoundingClientRect();if(rect.width<2||rect.height<2)return false;
      const ratio=Math.min(number(globalThis.devicePixelRatio,1),this.backend==='software'?1.5:2,this.maxDimension/rect.width,this.maxDimension/rect.height);
      const width=Math.max(2,Math.round(rect.width*ratio)),height=Math.max(2,Math.round(rect.height*ratio));
      this.cssWidth=rect.width;this.cssHeight=rect.height;
      if(width===this.width&&height===this.height)return true;
      const gl=this.gl;this.width=width;this.height=height;this.canvas.width=width;this.canvas.height=height;
      if(this.backend==='software'){this.softwareLastFrame=-Infinity;return true;}
      if(this.pickTexture)gl.deleteTexture(this.pickTexture);if(this.pickDepth)gl.deleteRenderbuffer(this.pickDepth);if(this.pickFramebuffer)gl.deleteFramebuffer(this.pickFramebuffer);
      this.pickTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.pickTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      this.pickDepth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,this.pickDepth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,width,height);
      this.pickFramebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.pickFramebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.pickTexture,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.pickDepth);
      const ready=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      if(!ready){this.unavailable('3D 선택 버퍼를 만들 수 없어 2D 모드로 돌아갑니다.');return false;}
      return true;
    }
    plan(game,ship) {let found=this.planCache.get(ship);const signature=ship.layoutId+'|'+ship.rooms.map(r=>[r.id,r.x,r.y,r.w,r.h].join(',')).join(';')+'|'+ship.doors.map(d=>[d.id,d.x,d.y,d.orientation].join(',')).join(';');if(!found||found.signature!==signature){found={signature,...layoutPlan(game,ship)};this.planCache.set(ship,found);}return found;}
    placeShips(game) {
      const player=game.state.player,enemy=game.state.enemy,p=this.plan(game,player),e=enemy?this.plan(game,enemy):null;
      const pw=p.bounds.maxX-p.bounds.minX,ew=e?e.bounds.maxX-e.bounds.minX:0,gap=e?4.6:0,total=pw+ew+gap;
      this.placements={player:{ship:player,plan:p,origin:[-total/2-p.bounds.minX,0,-(p.bounds.minY+p.bounds.maxY)/2]}};
      if(e)this.placements.enemy={ship:enemy,plan:e,origin:[total/2-e.bounds.maxX,0,-(e.bounds.minY+e.bounds.maxY)/2]};
      this.sceneWidth=total;this.sceneDepth=Math.max(p.bounds.maxY-p.bounds.minY,e?e.bounds.maxY-e.bounds.minY:0);
    }
    camera() {
      const direction=[Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(this.yaw)*Math.cos(this.pitch)];
      const right=normal(cross([0,1,0],direction)),up=cross(direction,right),target=[0,.25,0],tan=Math.tan(.68/2),aspect=this.width/this.height;
      let fit=1;
      for(const x of [-this.sceneWidth/2-1,this.sceneWidth/2+1])for(const y of [-.6,1.6])for(const z of [-this.sceneDepth/2-1.4,this.sceneDepth/2+1.4]){const p=sub([x,y,z],target);fit=Math.max(fit,dot(direction,p)+Math.abs(dot(right,p))/(tan*aspect),dot(direction,p)+Math.abs(dot(up,p))/tan);}
      this.eye=add(target,scale(direction,(fit+1.2)*this.zoom));this.cameraRight=right;this.cameraUp=up;this.cameraDirection=direction;
      this.matrix=multiply(perspective(.68,aspect,.1,Math.max(180,fit*5)),lookAt(this.eye,target));
    }
    world(shipId,x,y,elevation=FLOOR) {const p=this.placements[shipId];return p?[p.origin[0]+x,elevation,p.origin[2]+y]:null;}
    project(shipId,x,y,elevation=FLOOR) {
      if(!this.matrix)return null;const p=this.world(shipId,x,y,elevation);if(!p)return null;
      const m=this.matrix,c=[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14],m[3]*p[0]+m[7]*p[1]+m[11]*p[2]+m[15]];
      if(Math.abs(c[3])<1e-7)return null;const xN=c[0]/c[3],yN=c[1]/c[3],zN=c[2]/c[3];
      return {x:(xN*.5+.5)*this.cssWidth,y:(.5-yN*.5)*this.cssHeight,depth:zN,visible:c[3]>0&&Math.abs(xN)<=1&&Math.abs(yN)<=1&&zN>=-1&&zN<=1};
    }
    register(payload){this.pickTable.push(payload);return this.pickTable.length-1;}
    tileList(game,ship) {
      if(typeof game.getShipTiles==='function')return game.getShipTiles(ship.id);
      const tiles=[];for(const r of ship.rooms)for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)tiles.push({id:r.id+':'+x+','+y,roomId:r.id,tileX:x,tileY:y,x:x+.5,y:y+.5,walkable:true});return tiles;
    }

    // Scene construction reads the same physical coordinates as the simulation.
    // Decorative meshes carry the ID of their actual tile, never a second map.
    ring(center,rx,rz,tint,batch=this.lines,segments=32) {
      if(this.backend==='software')segments=Math.min(segments,24);
      for(let i=0;i<segments;i++){const a=i/segments*TAU,b=(i+1)/segments*TAU;batch.line(add(center,[Math.cos(a)*rx,0,Math.sin(a)*rz]),add(center,[Math.cos(b)*rx,0,Math.sin(b)*rz]),tint);}
    }
    boxEdges(center,size,tint,angle=0) {
      const [x,y,z]=size.map(n=>n/2),p=[[-x,-y,-z],[x,-y,-z],[x,y,-z],[-x,y,-z],[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]].map(v=>add(center,angle?rotateY(v,angle):v));
      for(const [a,b]of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]])this.lines.line(p[a],p[b],tint);
    }
    modelBox(center,size,tint,id=0,angle=0,emissive=0) {
      this.solid.box(center,size,tint,id,angle,emissive);
      if(this.styleId==='blueprint')this.boxEdges(center,size,color(this.style.colors.rim,.66),angle);
    }
    billboard(center,width,height,tint,id=0,batch=this.solid) {
      const r=scale(this.cameraRight,width/2),u=scale(this.cameraUp,height/2);
      batch.quad(sub(sub(center,r),u),sub(add(center,r),u),add(add(center,r),u),add(sub(center,r),u),tint,id,1);
    }
    floorMark(shipId,x,y,tint,radius=.44) {
      const p=this.world(shipId,x,y,FLOOR+.045),r=radius,thickness=.035;
      for(const z of [-r,r])this.translucent.box(add(p,[0,0,z]),[r*2,thickness,thickness],tint,0,0,1);
      for(const dx of [-r,r])this.translucent.box(add(p,[dx,0,0]),[thickness,thickness,r*2],tint,0,0,1);
    }
    room(game,shipId,roomId) {return game.state[shipId]?.rooms.find(r=>r.id===roomId)||null;}
    systemRoom(game,shipId,id) {return this.room(game,shipId,game.getSystemRoom?.(shipId,id)||id);}
    roomCenter(game,shipId,roomId,elevation=.6) {const r=this.room(game,shipId,roomId);return r?this.world(shipId,r.x+r.w/2,r.y+r.h/2,elevation):null;}
    buildShip(game,ui,shipId) {
      const placement=this.placements[shipId],ship=placement.ship,plan=placement.plan,c=this.style.colors;
      const faction=color(shipId==='player'?c.friendly:c.enemy),hull=color(c.hull),rim=color(c.rim),floor=color(c.floor),wall=color(c.wall),grid=color(c.grid,.36);
      const time=number(game.state.time),cloaked=ship.cloakRemaining>0;
      const outline=plan.outline.map(p=>this.world(shipId,p[0],p[1],.075));
      for(const tri of plan.triangles){let [a,b,d]=tri.map(i=>outline[i]);if(cross(sub(b,a),sub(d,a))[1]<0)[b,d]=[d,b];this.solid.triangle(a,b,d,cloaked?shade(hull,.55):hull);}
      for(let i=0;i<outline.length;i++){
        const a=outline[i],b=outline[(i+1)%outline.length],lowA=[a[0],-.32,a[2]],lowB=[b[0],-.32,b[2]];
        this.solid.quad(a,b,lowB,lowA,shade(hull,.8));this.lines.line(a,b,cloaked?color(c.ion,.8):shade(rim,.8));
        if(this.styleId==='blueprint'){this.lines.line(lowA,lowB,color(c.rim,.6));this.lines.line(a,lowA,color(c.rim,.45));}
      }
      const tiles=this.tileList(game,ship),tileIds=new Map(),slotByRoom=new Map((game.getSystemSlots?.(shipId)||[]).map(s=>[s.roomId,s]));
      placement.tiles=tiles;placement.tileIds=tileIds;
      for(const tile of tiles){
        const id=this.register({kind:'tile',shipId,roomId:tile.roomId,tileX:tile.tileX,tileY:tile.tileY,x:tile.x,y:tile.y});tileIds.set(tile.id,id);
        const room=this.room(game,shipId,tile.roomId),slot=slotByRoom.get(tile.roomId),lowOxygen=room&&number(room.oxygen,100)<30;
        let tint=shade(floor,(tile.tileX+tile.tileY)%2?1:1.12);
        if(slot&&!slot.systemId)tint=mix(tint,color(c.empty),slot.unlocked?.12:.03);
        if(lowOxygen)tint=mix(tint,color(c.danger),.16);
        if(cloaked)tint=shade(tint,.6);
        this.solid.box(this.world(shipId,tile.x,tile.y,(FLOOR+.08)/2),[.975,FLOOR-.08,.975],tint,id,0,this.styleId==='blueprint'?.35:0);
        const p=this.world(shipId,tile.x,tile.y,FLOOR-.002),r=.5;
        this.pickFloor.quad(add(p,[-r,0,-r]),add(p,[-r,0,r]),add(p,[r,0,r]),add(p,[r,0,-r]),[0,0,0,1],id,1);
        for(const [a,b]of [[[-.5,0,-.5],[.5,0,-.5]],[[-.5,0,-.5],[-.5,0,.5]]])this.lines.line(add(p,a),add(p,b),grid);
        if(ui.selectedTile?.shipId===shipId&&ui.selectedTile.tileX===tile.tileX&&ui.selectedTile.tileY===tile.tileY)this.floorMark(shipId,tile.x,tile.y,color(c.selected,.95));
      }
      for(const segment of plan.walls){
        const facing=segment.outward*(segment.axis==='x'?this.cameraDirection[0]:this.cameraDirection[2]);
        const height=segment.outer?(facing>.12?.18:.72):.29,length=segment.end-segment.start;
        const point=segment.axis==='x'?this.world(shipId,segment.fixed,(segment.start+segment.end)/2,FLOOR+height/2):this.world(shipId,(segment.start+segment.end)/2,segment.fixed,FLOOR+height/2);
        const size=segment.axis==='x'?[.075,height,length]:[length,height,.075];this.modelBox(point,size,cloaked?shade(wall,.65):wall);
        this.lines.line(add(point,segment.axis==='x'?[0,height/2,-length/2]:[-length/2,height/2,0]),add(point,segment.axis==='x'?[0,height/2,length/2]:[length/2,height/2,0]),color(c.rim,this.style.edges));
      }
      for(const door of ship.doors){
        const dTile=door.tileA||{x:Math.floor(door.x-.01),y:Math.floor(door.y-.01)};
        const id=this.register({kind:'door',shipId,roomId:door.a,doorId:door.id,tileX:dTile.x,tileY:dTile.y,x:dTile.x+.5,y:dTile.y+.5});
        const vertical=door.orientation==='vertical',height=.42,opened=door.open||door.hp<=0,damaged=door.hp<=0;
        const at=(along,elevation)=>this.world(shipId,door.x+(vertical?0:along),door.y+(vertical?along:0),elevation);
        const tint=damaged?color(c.danger):door.airlock?mix(wall,faction,.4):mix(wall,rim,.3);
        for(const side of [-1,1])this.modelBox(at(side*.365,FLOOR+.28),vertical?[.11,.56,.09]:[.09,.56,.11],tint,id);
        if(!opened){this.modelBox(at(0,FLOOR+height/2),vertical?[.07,height,.64]:[.64,height,.07],tint,id);this.solid.box(at(0,FLOOR+height*.85),vertical?[.08,.035,.44]:[.44,.035,.08],color(c.selected),id,0,.85);}
        else for(const side of [-1,1])this.modelBox(at(side*.29,FLOOR+.11),vertical?[.07,.22,.11]:[.11,.22,.07],tint,id);
        this.lines.line(at(-.32,FLOOR+.018),at(.32,FLOOR+.018),color(damaged?c.danger:opened?c.friendly:c.selected,.7));
      }
      for(const room of ship.rooms){
        const system=game.getRoomSystem?.(shipId,room.id)||(!game.getRoomSystem?ship.systems?.[room.id]:null),slot=slotByRoom.get(room.id);
        const tile=tiles.find(t=>t.roomId===room.id&&t.tileX===Math.floor(room.x+room.w/2)&&t.tileY===room.y)||tiles.find(t=>t.roomId===room.id);
        const id=tile?tileIds.get(tile.id):0;
        if(system&&system.level>0)this.buildSystem(game,shipId,room,system,id);
        else if(slot)this.emptyBay(shipId,room,slot,id,ui);
        if(number(room.fire)>0){
          const n=Math.min(3,Math.ceil(room.fire));
          for(let i=0;i<n;i++){const x=room.x+.45+(i%2)*.7,y=room.y+room.h-.48-Math.floor(i/2)*.65,h=.4+.11*Math.sin(time*8+i*1.7);const a=this.world(shipId,x,y,FLOOR+.025),b=add(a,[0,h,0]);this.translucent.cylinder(a,b,.16,color('#ff854f',.9),0,5,1,0);this.translucent.octa(add(a,[0,.15,0]),[.08,.2,.08],color('#ffe49b',.95),0,1);}
        }
        if(number(room.breach)>0||room.breached){const p=this.world(shipId,room.x+room.w-.45,room.y+room.h-.45,FLOOR+.02);this.solid.cylinder(p,add(p,[0,.012,0]),.24,color('#02070e'),id,7);this.ring(add(p,[0,.025,0]),.27,.27,color(c.danger,.8),this.lines,10);}
        if(system?.ionStacks>0){const p=this.world(shipId,room.x+room.w/2,room.y+.5,.8);this.ring(p,.32,.32,color(c.ion,.9),this.lines,10);}
      }
      this.shipOrbits(game,shipId);
    }
    emptyBay(shipId,room,slot,id,ui) {
      const c=this.style.colors,x=room.x+room.w/2,z=room.y+.5,p=this.world(shipId,x,z,FLOOR+.035),tint=color(slot.unlocked?c.empty:c.hull);
      this.modelBox(p,[.9,.04,.66],shade(tint,.7),id);
      this.boxEdges(add(p,[0,.03,0]),[.84,.04,.6],color(slot.unlocked?c.empty:c.rim,.7));
      if(!slot.unlocked){for(const angle of [-.6,.6])this.solid.box(add(p,[0,.035,0]),[.65,.018,.045],color(c.empty),id,angle,.7);}
      else for(const dx of [-.32,.32])for(const dz of [-.2,.2])this.solid.box(add(p,[dx,.035,dz]),[.08,.035,.08],color(c.empty),id,0,.6);
      if(ui.selectedSlotId===slot.id&&shipId==='player')this.floorMark(shipId,x,room.y+room.h/2,color(c.selected),Math.min(room.w,room.h)/2-.1);
    }
    buildSystem(game,shipId,room,system,id) {
      const c=this.style.colors,low=this.styleId==='lowpoly',wire=this.styleId==='blueprint',sides=low?4:8;
      const p=this.world(shipId,room.x+room.w/2,room.y+.48,FLOOR),base=color(c.wall),hot=color(system.damage>0?c.danger:system.ionStacks>0?c.ion:shipId==='player'?c.friendly:c.enemy);
      const active=system.power>0||system.id==='bridge'||system.id==='battery'&&game.state[shipId].battery?.remaining>0;
      const glow=active?hot:shade(hot,.3),body=mix(base,hot,system.damage>0?.16:.04),addBox=(off,size,tint=body,angle=0,e=0)=>this.modelBox(add(p,off),size,tint,id,angle,e),cylinder=(a,b,r,tint=body,tip=r)=>this.solid.cylinder(add(p,a),add(p,b),r,tint,id,sides,active?.2:0,tip);
      addBox([0,.05,0],[.86,.1,.66],shade(base,.8));
      switch(system.id){
        case 'weapons':
          addBox([0,.21,0],[.56,.29,.39]);
          for(const dx of [-.16,.16]){addBox([dx,.31,-.24],[.095,.09,.46],body);addBox([dx,.32,-.48],[.1,.08,.05],glow,0,.85);}break;
        case 'shields':
          cylinder([0,.09,0],[0,.2,0],.3);this.solid.octa(add(p,[0,.42,0]),[.25,.28,.25],glow,id,.45);if(!low)this.ring(add(p,[0,.42,0]),.34,.34,glow);break;
        case 'engines':
          for(const dx of [-.23,.23]){cylinder([dx,.25,.24],[dx,.25,-.24],.18);cylinder([dx,.25,.25],[dx,.25,.29],.13,glow);}
          if(active&&!wire)this.translucent.cylinder(add(p,[0,.22,.25]),add(p,[0,.22,.55]),.1,color(c.ion,.45),0,5,1,0);break;
        case 'bridge':
          addBox([0,.19,0],[.7,.25,.38]);addBox([0,.33,-.08],[.57,.055,.19],glow,0,.9);addBox([0,.15,.31],[.2,.23,.19],body);break;
        case 'oxygen':
          for(const dx of [-.25,0,.25]){cylinder([dx,.11,0],[dx,.56,0],.105);cylinder([dx,.48,0],[dx,.54,0],.112,glow);}break;
        case 'medbay':
          addBox([0,.2,0],[.72,.13,.43]);addBox([-.27,.29,0],[.15,.1,.35],shade(base,1.6));addBox([.12,.28,0],[.22,.03,.065],glow,0,.8);addBox([.12,.28,0],[.065,.03,.22],glow,0,.8);break;
        case 'drones':
          addBox([0,.3,0],[.32,.38,.3]);for(const dx of [-.27,.27])addBox([dx,.41,0],[.23,.075,.16],glow,0,.5);this.solid.octa(add(p,[0,.56,0]),[.12,.1,.12],glow,id,.7);break;
        case 'teleporter':
          cylinder([0,.08,0],[0,.12,0],.36,shade(glow,.65));this.ring(add(p,[0,.14,0]),.31,.31,glow,this.lines,16);
          for(const dx of [-.34,.34])for(const dz of [-.23,.23]){addBox([dx,.29,dz],[.055,.45,.055]);addBox([dx,.54,dz],[.075,.05,.075],glow,0,.8);}break;
        case 'cloaking':
          this.solid.octa(add(p,[0,.4,0]),[.25,.37,.23],glow,id,.35);for(const dx of [-.32,.32])addBox([dx,.25,0],[.09,.3,.3]);break;
        case 'hacking':
          addBox([0,.19,0],[.55,.22,.38]);cylinder([0,.28,0],[0,.63,0],.035);addBox([0,.64,0],[.44,.06,.1],glow,0,.85);break;
        case 'mind':
          cylinder([0,.1,0],[0,.29,0],.16);this.solid.octa(add(p,[0,.47,0]),[.23,.25,.23],active?color(c.hacking):glow,id,.5);this.ring(add(p,[0,.47,0]),.29,.29,color(c.hacking,active?.85:.2),this.lines,12);break;
        case 'battery':
          for(const dx of [-.2,.2]){addBox([dx,.3,0],[.27,.48,.3]);addBox([dx,.49,.16],[.12,.055,.025],glow,0,.9);}break;
        default:addBox([0,.27,0],[.55,.42,.4]);addBox([0,.51,0],[.4,.04,.28],glow,0,.7);
      }
      const n=Math.min(8,Math.max(1,system.level));
      for(let i=0;i<n;i++)this.solid.box(add(p,[-.34+i*.68/Math.max(1,n-1),.075,.36]),[.055,.025,.035],i<system.power?hot:i>=system.level-system.damage?color(c.danger):shade(hot,.22),id,0,.9);
    }
    crewList(game,shipId) {return typeof game.getCrewOnShip==='function'?game.getCrewOnShip(shipId):[game.state.player,game.state.enemy].filter(Boolean).flatMap(s=>s.crew).filter(c=>c.shipId===shipId&&c.hp>0);}
    buildCrew(game,ui,shipId) {
      const time=number(game.state.time),c=this.style.colors,all=[game.state.player,game.state.enemy].filter(Boolean).flatMap(s=>s.crew),selected=new Set(ui.selectedCrewIds||[]),low=this.styleId==='lowpoly';
      for(const crew of this.crewList(game,shipId)){
        if(crew.hp<=0)continue;
        const p=this.world(shipId,crew.x,crew.y,FLOOR+.015),friendly=(game.getEffectiveFaction?.(crew)||crew.faction)==='player',tint=color(friendly?c.friendly:c.enemy),dark=shade(tint,.4),picked=selected.has(crew.id)||ui.selectedEnemyCrewId===crew.id;
        const id=this.register({kind:'crew',shipId,roomId:crew.roomId,crewId:crew.id,tileX:Number.isInteger(crew.tileX)?crew.tileX:Math.floor(crew.x),tileY:Number.isInteger(crew.tileY)?crew.tileY:Math.floor(crew.y),x:crew.x,y:crew.y});
        const target=all.find(t=>t.id===crew.attackTargetId&&t.hp>0&&t.shipId===crew.shipId),next=crew.tilePath?.[0],moving=Boolean(crew.movePath?.length||crew.tilePath?.length),face=target?[target.x-crew.x,target.y-crew.y]:next?[next.x+.5-crew.x,next.y+.5-crew.y]:[0,1],yaw=Math.atan2(face[0],face[1]);
        const swing=moving?Math.sin(time*12+crew.id.length)*.065:0,point=off=>add(p,rotateY(off,yaw)),box=(off,size,t=tint,e=0)=>this.modelBox(point(off),size,t,id,yaw,e);
        this.ring(add(p,[0,.012,0]),.26,.26,color(friendly?c.friendly:c.enemy,picked?.9:.42),this.lines,low?8:20);
        if(picked){this.ring(add(p,[0,.02,0]),.36,.36,color(c.selected),this.lines,low?8:24);this.floorMark(shipId,crew.x,crew.y,color(c.selected,.65),.4);}
        if(crew.controlledBy){this.ring(add(p,[0,.7,0]),.31,.31,color(c.hacking),this.lines,12);}
        const legs=crew.species==='rock'?.13:.085;
        for(const side of [-1,1])box([side*.12,.17,side*swing],[legs,.3,.15],dark);
        if(crew.species==='rock'){
          this.solid.octa(point([0,.56,0]),[.28,.36,.23],mix(tint,color('#a38f7e'),.45),id);this.solid.octa(point([0,.88,0]),[.19,.2,.18],tint,id);for(const side of [-1,1])this.solid.octa(point([side*.29,.51,0]),[.11,.26,.14],dark,id);
          box([0,.9,.16],[.2,.045,.035],color(c.selected),.8);
        }else if(crew.species==='engi'){
          box([0,.48,0],[.34,.36,.25]);box([0,.81,0],[.35,.24,.28],mix(tint,color(c.wall),.3));box([0,.82,.15],[.23,.065,.025],color(c.ion),1);
          for(const side of [-1,1])box([side*.25,.46,-side*swing],[.1,.31,.12],dark);box([.12,1.01,0],[.035,.18,.035],tint);
        }else if(crew.species==='mantis'){
          this.solid.octa(point([0,.52,0]),[.2,.3,.17],mix(tint,color('#a8cd77'),.35),id);this.solid.octa(point([0,.85,.02]),[.24,.19,.18],tint,id);
          for(const side of [-1,1]){this.solid.cylinder(point([side*.2,.64,0]),point([side*.35,.43,.12]),.055,dark,id,4);this.solid.cylinder(point([side*.35,.43,.12]),point([side*.3,.68,.27]),.065,tint,id,4,0,.015);}
          box([0,.88,.17],[.24,.04,.025],color(c.selected),1);
        }else{
          box([0,.5,0],[.32,.38,.25]);if(low)box([0,.82,0],[.29,.27,.28],shade(tint,1.12));else this.solid.octa(point([0,.83,0]),[.2,.2,.19],shade(tint,1.12),id);
          box([0,.84,.16],[.22,.07,.04],color('#112637'),.2);for(const side of [-1,1])box([side*.23,.49,-side*swing],[.1,.32,.12],dark);
          box([0,.56,.14],[.11,.08,.035],color(c.selected),.7);
        }
        const hp=clamp(crew.hp/Math.max(1,crew.maxHp),0,1),bar=add(p,[0,1.18,0]);this.billboard(bar,.59,.08,color('#020911'),id);this.billboard(add(bar,scale(this.cameraRight,-.275*(1-hp))),.55*hp,.045,color(hp<.3?c.danger:friendly?c.friendly:c.enemy),id);
        if(picked&&game.getCrewRoute){const route=game.getCrewRoute(crew.id);if(route?.shipId===shipId)for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i];this.translucent.cylinder(this.world(shipId,a.x,a.y,FLOOR+.065),this.world(shipId,b.x,b.y,FLOOR+.065),.025,color(c.selected,.8),0,4,1);}}
        if(number(crew.attackFlash)>0&&target){const a=point([0,.65,.24]),b=this.world(shipId,target.x,target.y,.82),t=clamp(crew.attackFlash/.24,0,1);this.translucent.cylinder(a,b,.04,color(c.selected,.85*t+.1),0,5,1);this.translucent.octa(b,[.12,.17,.12],color(c.danger,t),0,1);}
      }
    }
    shipOrbits(game,shipId) {
      const ship=game.state[shipId],placement=this.placements[shipId],b=placement.plan.bounds,c=this.style.colors,time=number(game.state.time),midX=(b.minX+b.maxX)/2,midY=(b.minY+b.maxY)/2,rx=(b.maxX-b.minX)/2+.25,rz=(b.maxY-b.minY)/2+.25;
      const shields=number(ship.shield),shieldColor=color(shipId==='player'?c.friendly:c.enemy,.22);
      if(shields>0||ship.superShield>0){for(const h of [.38,.85])this.ring(this.world(shipId,midX,midY,h),rx,rz,ship.superShield>0?color(c.hacking,.5):shieldColor,this.lines,48);}
      if(ship.cloakRemaining>0){for(let i=0;i<3;i++)this.ring(this.world(shipId,midX,midY,.32+i*.27),rx,rz,color(c.ion,.32),this.lines,48);}
      placement.dronePositions={};
      for(let i=0;i<(ship.drones||[]).length;i++){
        const drone=ship.drones[i];if(!drone.powered)continue;const phase=time*.28+i*2.3+(shipId==='enemy'?Math.PI:0),p=this.world(shipId,midX+Math.cos(phase)*(rx+.25),midY+Math.sin(phase)*(rz+.25),1.05);
        placement.dronePositions[drone.id]=p;const tint=color(drone.type==='defense'?c.ion:c.hacking);this.modelBox(p,[.25,.15,.24],tint,0,phase);for(const side of [-1,1])this.modelBox(add(p,rotateY([side*.23,0,0],phase)),[.22,.06,.12],shade(tint,.7),0,phase);this.solid.octa(add(p,[0,.1,0]),[.07,.08,.07],color(c.selected),0,1);
      }
    }
    buildEffects(game,ui) {
      const state=game.state,c=this.style.colors,time=number(state.time);
      for(const shot of state.projectiles||[]){
        if(shot.delay>0||shot.intercepted)continue;const from=shot.from,target=from==='player'?'enemy':'player';if(!this.placements[from]||!this.placements[target])continue;
        const source=this.systemRoom(game,from,shot.sourceRoom||'weapons'),a=this.placements[from].dronePositions?.[shot.droneId]||(source?this.world(from,source.x+source.w/2,source.y+.5,1.05):null),b=this.roomCenter(game,target,shot.targetRoom,.72);if(!a||!b)continue;
        const progress=clamp(number(shot.progress),0,1),tint=color(shot.color||c.selected);
        if(shot.weaponType==='beam'){
          const first=shot.beamStart?this.world(target,shot.beamStart.x,shot.beamStart.y,.7):b,last=shot.beamEnd?this.world(target,shot.beamEnd.x,shot.beamEnd.y,.7):b;
          this.translucent.cylinder(a,first,.019,shade(tint,1,.55),0,5,1);this.translucent.cylinder(first,last,.055,tint,0,6,1);this.translucent.octa(add(first,scale(sub(last,first),progress)),[.13,.24,.13],color('#ffffff',.85),0,1);
        }else{
          const p=add(a,scale(sub(b,a),progress)),direction=normal(sub(b,a));
          if(shot.weaponType==='missile'){this.solid.cylinder(sub(p,scale(direction,.17)),add(p,scale(direction,.08)),.065,shade(tint,.8),0,6);this.solid.cylinder(add(p,scale(direction,.08)),add(p,scale(direction,.22)),.075,tint,0,6,.2,0);this.translucent.cylinder(sub(p,scale(direction,.18)),sub(p,scale(direction,.55)),.07,color('#ff9b5f',.65),0,6,1,0);}
          else if(shot.weaponType==='ion'){this.translucent.octa(p,[.14,.18,.14],tint,0,1);this.ring(p,.23,.23,color(c.ion,.6),this.lines,12);}
          else this.translucent.cylinder(sub(p,scale(direction,.42)),add(p,scale(direction,.15)),.045,tint,0,6,1);
        }
      }
      const selected=state.player.weapons?.find(w=>w.id===ui.selectedWeapon||w.id===ui.selectedWeapon?.id)||state.player.weapons?.[Number.isInteger(ui.selectedWeapon)?ui.selectedWeapon:-1];
      if(selected?.type==='beam'&&selected.beamStart&&selected.beamEnd&&this.placements.enemy){const a=this.world('enemy',selected.beamStart.x,selected.beamStart.y,FLOOR+.08),b=this.world('enemy',selected.beamEnd.x,selected.beamEnd.y,FLOOR+.08);this.translucent.cylinder(a,b,.025,color(c.selected,.75),0,4,1);this.ring(a,.15,.15,color(c.selected));this.ring(b,.15,.15,color(c.selected));}
      if(ui.beamStart&&this.placements.enemy){const room=typeof ui.beamStart==='string'?this.room(game,'enemy',ui.beamStart):null,p=room?this.world('enemy',room.x+room.w/2,room.y+room.h/2,FLOOR+.06):Number.isFinite(ui.beamStart.x)?this.world('enemy',ui.beamStart.x,ui.beamStart.y,FLOOR+.06):null;if(p)this.ring(p,.27,.27,color(c.selected));}
      for(const effect of state.effects||[]){
        const p=this.roomCenter(game,effect.ship,effect.roomId,.68);if(!p||effect.ttl<=0)continue;const t=clamp(effect.ttl/(effect.type==='repair'?1.35:.9),0,1),good=effect.type==='repair',tint=color(good?c.friendly:effect.type==='shield'?c.ion:effect.type==='ion'?c.ion:effect.type==='miss'?c.empty:c.danger,t*.8);
        this.ring(p,.2+(1-t)*.65,.2+(1-t)*.65,tint,this.lines,16);
        if(effect.type!=='miss')for(let i=0;i<4;i++){const angle=i/4*TAU+time,off=[Math.cos(angle)*(1-t)*.5,(1-t)*.45,Math.sin(angle)*(1-t)*.5];this.translucent.octa(add(p,off),[.04+t*.06,.09,.04+t*.06],tint,0,1);}
      }
      for(const shipId of Object.keys(this.placements)){
        const ship=state[shipId],target=shipId==='player'?'enemy':'player',h=ship.hacking;
        if(h&&h.phase!=='idle'&&h.targetRoomId&&this.placements[target]){
          const dest=this.roomCenter(game,target,h.targetRoomId,.85),source=this.systemRoom(game,shipId,'hacking'),start=source?this.world(shipId,source.x+source.w/2,source.y+.5,1):dest;
          if(dest){const p=h.phase==='travel'?add(start,scale(sub(dest,start),clamp(1-h.timer/1.5,0,1))):dest;this.solid.octa(p,[.14,.1,.14],color(c.hacking),0,.8);if(h.phase==='active')this.ring(p,.45+.1*Math.sin(time*6),.45+.1*Math.sin(time*6),color(c.hacking,.8),this.lines,16);}
        }
      }
    }
    background() {
      const tint=color(this.style.colors.grid,this.styleId==='blueprint'?.2:.12),span=Math.max(16,this.sceneWidth*.8);
      for(let x=-span;x<=span;x+=2)this.lines.line([x,-.65,-span],[x,-.65,span],tint);
      for(let z=-span;z<=span;z+=2)this.lines.line([-span,-.65,z],[span,-.65,z],tint);
      if(this.styleId!=='blueprint')for(let i=0;i<50;i++){const x=Math.sin(i*23.71)*span*1.3,z=Math.sin(i*11.27+.3)*span*1.3,p=[x,-1.3,z],size=i%5===0?.055:.025;this.lines.line(add(p,[-size,0,0]),add(p,[size,0,0]),color('#d1e4f4',.18+(i%4)*.08));}
    }
    // The compatibility backend uses the identical vertex batches and MVP.
    // It performs back-face culling, screen projection and painter depth order;
    // input uses per-pixel triangle depth rather than draw order or room boxes.
    projectBatch(batch) {
      if(!batch.projected||batch.projected.length<batch.count*4)batch.projected=new Float32Array(batch.data.length/STRIDE*4);
      const p=batch.projected,a=batch.data,m=this.matrix,w=this.cssWidth/2,h=this.cssHeight/2;
      for(let i=0;i<batch.count;i++){
        const at=i*STRIDE,out=i*4,x=a[at],y=a[at+1],z=a[at+2],clipW=m[3]*x+m[7]*y+m[11]*z+m[15];
        p[out]=(1+(m[0]*x+m[4]*y+m[8]*z+m[12])/clipW)*w;
        p[out+1]=(1-(m[1]*x+m[5]*y+m[9]*z+m[13])/clipW)*h;
        p[out+2]=(m[2]*x+m[6]*y+m[10]*z+m[14])/clipW;p[out+3]=clipW;
      }
      return p;
    }
    softwareColor(batch,at,unlit=false) {
      const a=batch.data,emissive=unlit?1:clamp(a[at+10],0,1),lightLength=Math.hypot(-.4,.85,.5);
      const diffuse=Math.max(0,(-.4*a[at+3]+.85*a[at+4]+.5*a[at+5])/lightLength),lit=this.style.ambient+this.style.diffuse*diffuse,brightness=lit+(1-lit)*emissive;
      const r=Math.round(clamp(a[at+6]*brightness,0,1)*255),g=Math.round(clamp(a[at+7]*brightness,0,1)*255),b=Math.round(clamp(a[at+8]*brightness,0,1)*255),alpha=clamp(a[at+9],0,1),key=r+','+g+','+b+','+Math.round(alpha*100);
      let found=this.softwareColors.get(key);if(!found){found='rgba('+r+','+g+','+b+','+alpha.toFixed(3)+')';this.softwareColors.set(key,found);}return found;
    }
    collectSoftwareTriangles(batch,draw,pick) {
      const a=batch.data,p=this.projectBatch(batch),width=this.cssWidth,height=this.cssHeight;
      for(let i=0;i<batch.count;i+=3){
        const at=i*STRIDE,q=i*4;
        if(p[q+3]<=.01||p[q+7]<=.01||p[q+11]<=.01)continue;
        // All triangle normals in Batch are outward-facing flat normals.
        if(a[at+3]*(this.eye[0]-a[at])+a[at+4]*(this.eye[1]-a[at+1])+a[at+5]*(this.eye[2]-a[at+2])<=1e-7)continue;
        const x1=p[q],y1=p[q+1],z1=p[q+2],x2=p[q+4],y2=p[q+5],z2=p[q+6],x3=p[q+8],y3=p[q+9],z3=p[q+10];
        const minX=Math.min(x1,x2,x3),maxX=Math.max(x1,x2,x3),minY=Math.min(y1,y2,y3),maxY=Math.max(y1,y2,y3);
        if(maxX<0||minX>width||maxY<0||minY>height||Math.min(z1,z2,z3)>1||Math.max(z1,z2,z3)<-1)continue;
        const denominator=(y2-y3)*(x1-x3)+(x3-x2)*(y1-y3);
        if(Math.abs(denominator)<.12)continue;
        let face;
        if(draw){const index=this.softwareFaces.length;face=this.softwareFacePool[index]||(this.softwareFacePool[index]={});this.softwareFaces.push(face);}
        else {const index=this.softwarePickFaces.length;face=this.softwarePickPool[index]||(this.softwarePickPool[index]={});}
        face.kind=0;face.x1=x1;face.y1=y1;face.z1=z1;face.x2=x2;face.y2=y2;face.z2=z2;face.x3=x3;face.y3=y3;face.z3=z3;
        face.depth=(z1+z2+z3)/3;face.minX=minX;face.maxX=maxX;face.minY=minY;face.maxY=maxY;face.denominator=denominator;
        // Hull caps can span most of a ship. Their average camera depth must
        // never overpaint a raised deck behind that average. These horizontal
        // underlays are globally below every room/crew from the allowed camera
        // elevations; only the detail layer needs ordinary painter ordering.
        const top=Math.max(a[at+1],a[at+STRIDE+1],a[at+STRIDE*2+1]);
        face.layer=top<=.08?0:top<=FLOOR+.001?1:2;
        face.id=Math.round(a[at+11]*255)+(Math.round(a[at+12]*255)<<8)+(Math.round(a[at+13]*255)<<16);
        if(draw)face.color=this.softwareColor(batch,at);
        if(pick)this.softwarePickFaces.push(face);
      }
    }
    collectSoftwareLines() {
      const batch=this.lines,p=this.projectBatch(batch),a=batch.data;
      for(let i=0;i<batch.count;i+=2){
        const q=i*4;if(p[q+3]<=.01||p[q+7]<=.01)continue;
        const x1=p[q],y1=p[q+1],x2=p[q+4],y2=p[q+5];
        if(Math.max(x1,x2)<0||Math.min(x1,x2)>this.cssWidth||Math.max(y1,y2)<0||Math.min(y1,y2)>this.cssHeight||Math.hypot(x2-x1,y2-y1)<.4)continue;
        const index=this.softwareFaces.length,face=this.softwareFacePool[index]||(this.softwareFacePool[index]={});
        face.kind=1;face.x1=x1;face.y1=y1;face.x2=x2;face.y2=y2;face.depth=(p[q+2]+p[q+6])/2-1e-6;face.color=this.softwareColor(batch,i*STRIDE,true);
        const top=Math.max(a[i*STRIDE+1],a[(i+1)*STRIDE+1]);face.layer=top<=.08?0:top<=FLOOR+.001?1:2;this.softwareFaces.push(face);
        if(i<this.backgroundLineVertices){face.layer=-1;}
      }
    }
    renderSoftware() {
      this.softwareFaces.length=0;this.softwarePickFaces.length=0;this.softwareColors.clear();
      this.collectSoftwareTriangles(this.pickFloor,false,true);
      this.collectSoftwareTriangles(this.solid,true,true);
      this.collectSoftwareTriangles(this.translucent,true,false);this.collectSoftwareLines();
      this.softwareFaces.sort((a,b)=>a.layer-b.layer||b.depth-a.depth);
      const ctx=this.context2d;ctx.setTransform(this.width/this.cssWidth,0,0,this.height/this.cssHeight,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle=this.style.colors.background;ctx.fillRect(0,0,this.cssWidth,this.cssHeight);ctx.lineWidth=.8;ctx.lineJoin='round';ctx.lineCap='round';
      let lastFill='',lastStroke='';
      for(const face of this.softwareFaces){
        ctx.beginPath();ctx.moveTo(face.x1,face.y1);ctx.lineTo(face.x2,face.y2);
        if(face.kind===1){if(lastStroke!==face.color){ctx.strokeStyle=face.color;lastStroke=face.color;}ctx.stroke();}
        else {ctx.lineTo(face.x3,face.y3);ctx.closePath();if(lastFill!==face.color){ctx.fillStyle=face.color;lastFill=face.color;}ctx.fill();}
      }
    }
    pickSoftware(x,y) {
      let nearest=Infinity,hit=0;
      for(const f of this.softwarePickFaces){
        if(x<f.minX-.001||x>f.maxX+.001||y<f.minY-.001||y>f.maxY+.001)continue;
        const a=((f.y2-f.y3)*(x-f.x3)+(f.x3-f.x2)*(y-f.y3))/f.denominator;
        const b=((f.y3-f.y1)*(x-f.x3)+(f.x1-f.x3)*(y-f.y3))/f.denominator,c=1-a-b;
        if(a<-.0001||b<-.0001||c<-.0001)continue;
        const depth=a*f.z1+b*f.z2+c*f.z3;
        if(depth<nearest+1e-9){nearest=depth;hit=f.id;}
      }
      return this.pickTable[hit]||null;
    }
    drawBatch(batch,picking=false,mode) {
      if(!batch.count)return;
      const gl=this.gl,p=picking?this.pickProgram:this.mainProgram;gl.useProgram(p.program);gl.bindBuffer(gl.ARRAY_BUFFER,batch.buffer);
      for(let i=0;i<this.attributeCount;i++)gl.disableVertexAttribArray(i);
      const bind=(location,size,offset)=>{if(location>=0){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,STRIDE*4,offset*4);}};
      bind(p.position,3,0);if(picking)bind(p.pickColor,3,11);else{bind(p.normal,3,3);bind(p.color,4,6);bind(p.emissive,1,10);gl.uniform3f(p.light,-.4,.85,.5);gl.uniform1f(p.ambient,this.style.ambient);gl.uniform1f(p.diffuse,this.style.diffuse);}
      gl.uniformMatrix4fv(p.matrix,false,this.matrix);gl.drawArrays(mode||gl.TRIANGLES,0,batch.count);
    }
    render(game,ui={}) {
      if(!this.supported||this.destroyed||this.lost||!game?.state?.player)return false;
      try{
        if(!this.resize()||!this.supported)return false;
        if(ui.visualStyle&&ui.visualStyle!==this.styleId)this.setStyle(ui.visualStyle);
        let softwareState=null,softwareView=null,softwarePaused=false;
        if(this.backend==='software'){
          softwarePaused=game.state.paused||game.state.mode!=='combat';
          // UI and state objects are mutable. Snapshot values, not references,
          // so paused power/door/target orders and in-place selections redraw.
          softwareView=JSON.stringify([this.yaw,this.pitch,this.zoom,this.styleId,this.width,this.height,this.cssWidth,this.cssHeight,
            ui.selectedCrewIds||[],ui.selectedEnemyCrewId||null,ui.selectedWeapon||null,ui.selectedTile||null,ui.selectedSlotId||null,ui.intent||null,ui.beamStart||null]);
          if(softwarePaused)softwareState=JSON.stringify(game.state);
          const sameGame=this.lastGame===game,changedView=softwareView!==this.softwareViewSignature;
          if(sameGame&&softwarePaused&&this.softwareWasPaused&&softwareState===this.softwareStateSignature&&!changedView)return true;
          const now=typeof globalThis.performance?.now==='function'?globalThis.performance.now():Date.now();
          // A camera/selection/style/size change, pause transition or paused
          // command paints immediately. Only ordinary running frames are capped.
          if(sameGame&&!softwarePaused&&!changedView&&this.softwareWasPaused===false&&now-this.softwareLastFrame<1000/18)return true;
          this.softwareLastFrame=now;
        }
        this.lastGame=game;this.lastUi=ui;this.pickTable=[null];this.placeShips(game);this.camera();
        for(const batch of [this.solid,this.translucent,this.lines,this.pickFloor])batch.reset();
        this.background();this.backgroundLineVertices=this.lines.count;for(const id of Object.keys(this.placements))this.buildShip(game,ui,id);for(const id of Object.keys(this.placements))this.buildCrew(game,ui,id);this.buildEffects(game,ui);
        if(this.backend==='software'){
          this.renderSoftware();this.softwareStateSignature=softwareState;this.softwareViewSignature=softwareView;this.softwareWasPaused=softwarePaused;this.frames++;return true;
        }
        for(const batch of [this.solid,this.translucent,this.lines,this.pickFloor])batch.upload();
        const gl=this.gl,bg=color(this.style.colors.background);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.width,this.height);gl.clearColor(bg[0],bg[1],bg[2],1);gl.clearDepth(1);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        this.drawBatch(this.solid);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);this.drawBatch(this.translucent);gl.lineWidth(1);this.drawBatch(this.lines,false,gl.LINES);gl.depthMask(true);gl.disable(gl.BLEND);this.frames++;return true;
      }catch(error){this.reason=String(error?.message||error);this.unavailable('3D 화면을 그리는 중 문제가 발생하여 2D 모드로 돌아갑니다.');return false;}
    }
    pick(clientX,clientY) {
      if(!this.supported||!this.matrix||this.lost)return null;
      const rect=this.canvas.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top;if(x<0||y<0||x>=rect.width||y>=rect.height)return null;
      if(this.backend==='software')return this.pickSoftware(x,y);
      if(!this.pickFramebuffer)return null;
      const gl=this.gl,pixel=new Uint8Array(4);
      gl.bindFramebuffer(gl.FRAMEBUFFER,this.pickFramebuffer);gl.viewport(0,0,this.width,this.height);gl.clearColor(0,0,0,1);gl.clearDepth(1);gl.disable(gl.BLEND);gl.disable(gl.DITHER);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      this.drawBatch(this.pickFloor,true);this.drawBatch(this.solid,true);gl.readPixels(Math.floor(x/rect.width*this.width),this.height-1-Math.floor(y/rect.height*this.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.enable(gl.DITHER);
      return this.pickTable[pixel[0]+(pixel[1]<<8)+(pixel[2]<<16)]||null;
    }
    destroy() {
      if(this.destroyed)return;this.destroyed=true;this.supported=false;this.points.clear();this.drag=null;
      for(const [target,type,handler,options]of this.listeners)target.removeEventListener(type,handler,options);this.listeners=[];this.resizeObserver?.disconnect();
      for(const b of [this.solid,this.translucent,this.lines,this.pickFloor])b?.destroy();
      this.softwareFaces=[];this.softwareFacePool=[];this.softwarePickFaces=[];this.softwarePickPool=[];this.context2d=null;
      const gl=this.gl;if(!gl||this.lost)return;
      if(this.mainProgram)gl.deleteProgram(this.mainProgram.program);if(this.pickProgram)gl.deleteProgram(this.pickProgram.program);if(this.pickTexture)gl.deleteTexture(this.pickTexture);if(this.pickDepth)gl.deleteRenderbuffer(this.pickDepth);if(this.pickFramebuffer)gl.deleteFramebuffer(this.pickFramebuffer);
    }
  }

  globalThis.Starward3D = { styles, create: options => new Renderer(options || {}) };
})();
