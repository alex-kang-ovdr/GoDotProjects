/* Original block-world renderer. World +X = right, +Y = down, +Z = height.
   No runtime dependencies. Geometry is built once, instances uploaded per frame. */
const renderer3d=(()=>{
  const canvas=$('world3d'),gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'high-performance'});
  const api={fallback:!gl,mode:'3D',lost:false,stats:{drawCalls:0,instances:0,instanced:false}};
  const cam={x:0,y:0,ready:false,zoom:1.35,cos:.74,sin:Math.sqrt(1-.74*.74),focus:-.12};
  const palette=[
    {grass:'#87bf73',grass2:'#8fc87c',road:'#536279',stripe:'#f5e6b8',pave:'#c5d7d6',curb:'#e6ece0',trunk:'#997754',leaf:'#439965',leaf2:'#67b875',fog:'#bad5c9',roof:['#60bac5','#e3a379','#98a6c7'],wall:['#e1e9d9','#ecdfc5','#d8e4e9']},
    {grass:'#d7bf87',grass2:'#dfc993',road:'#ac9276',stripe:'#f9e9b6',pave:'#e7d6b1',curb:'#f6e6be',trunk:'#a67c4e',leaf:'#6eaa7e',leaf2:'#8ab680',fog:'#e2d3b6',roof:['#e49a71','#79b9b1','#d3ab76'],wall:['#f0dfc1','#e5cdb0','#eee2c9']},
    {grass:'#c1dfe0',grass2:'#cfe9e8',road:'#69889b',stripe:'#eef9e7',pave:'#e0eded',curb:'#f5faf1',trunk:'#7b94a0',leaf:'#6ba8b6',leaf2:'#8fc9ce',fog:'#c9e4e8',roof:['#80bfce','#a0b8d3','#87bdbe'],wall:['#e4f0eb','#e9f1e8','#d8e9ec']}
  ];
  api.project=(x,y,z=0)=>({x:W/2+(x-cam.x)*cam.zoom,y:H*(.5-cam.focus/2)+((y-cam.y)*cam.cos-z*cam.sin)*cam.zoom});
  api.visibleHalf=()=>({x:W/(2*cam.zoom),y:H/(2*cam.zoom*cam.cos)});
  api.resetCamera=(x=player?.x||0,y=player?.y||0)=>{cam.x=x;cam.y=y;cam.ready=true;};
  api.getCamera=()=>({...cam});
  api.setMode=(mode)=>{api.mode=mode;canvas.style.display=mode==='2D'?'none':'block';};
  api.error=()=>gl?gl.getError():0;
  api.context=()=>gl;
  if(!gl){canvas.style.display='none';api.mode='2D';api.render=()=>draw2DLegacy();return api;}
  let ext,program,attrs={},uniforms={},meshes={};
  const vertex=`
    precision highp float;
    attribute vec3 aPosition; attribute vec3 aNormal;
    #ifdef INSTANCED
    attribute vec4 iCenter; attribute vec3 iScale; attribute vec3 iRotation; attribute vec4 iColor;
    #else
    uniform vec4 iCenter; uniform vec3 iScale; uniform vec3 iRotation; uniform vec4 iColor;
    #endif
    uniform vec4 uCamera; uniform vec4 uViewport; uniform vec3 uFog;
    varying vec3 vColor; varying vec2 vLocal; varying float vMode; varying float vAlpha;
    vec3 rotate(vec3 p){
      float c=cos(iRotation.y),s=sin(iRotation.y);p=vec3(p.x,p.y*c-p.z*s,p.y*s+p.z*c);
      c=cos(iRotation.z);s=sin(iRotation.z);p=vec3(p.x*c+p.z*s,p.y,-p.x*s+p.z*c);
      c=cos(iRotation.x);s=sin(iRotation.x);return vec3(p.x*c-p.y*s,p.x*s+p.y*c,p.z);
    }
    void main(){
      vec3 w=rotate(aPosition*iScale)+iCenter.xyz;
      float dx=w.x-uCamera.x,dy=w.y-uCamera.y;
      // +world Y projects DOWN. v9 had +Y in clip-up, reversing W/S visually.
      gl_Position=vec4(dx*uCamera.z*2./uViewport.x,(-dy*uCamera.w+w.z*uViewport.z)*uCamera.z*2./uViewport.y+uViewport.w,-(dy*uViewport.z+w.z*uCamera.w)/3500.,1.);
      vec3 n=normalize(rotate(aNormal/max(iScale,vec3(.001))));
      float lambert=max(0.,dot(n,normalize(vec3(-.45,-.55,.95))));
      vec3 lit=iColor.rgb*(vec3(.68,.72,.78)+vec3(.28,.25,.20)*lambert+n.z*.11);
      if(iCenter.w>.5)lit=iColor.rgb;
      float fog=smoothstep(700.,1550.,length(w.xy-uCamera.xy));
      vColor=mix(lit,uFog,fog*.35);vAlpha=iColor.a;vMode=iCenter.w;vLocal=aPosition.xy*2.;
    }`;
  const fragment=`precision mediump float;varying vec3 vColor;varying vec2 vLocal;varying float vMode;varying float vAlpha;
    void main(){float a=vAlpha;if(vMode>1.5){float r=length(vLocal);if(r>1.)discard;a*=pow(max(0.,1.-r*r),1.5);}if(a<.005)discard;gl_FragColor=vec4(vColor,a);}`;
  function shader(type,text){let s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  function geometry(type){
    const out=[];
    function tri(a,b,c,n){if(!n){const u=b.map((x,i)=>x-a[i]),v=c.map((x,i)=>x-a[i]);n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];let l=Math.hypot(...n)||1;n=n.map(x=>x/l);}for(let p of [a,b,c])out.push(...p,...n);}
    function quad(a,b,c,d,n){tri(a,b,c,n);tri(a,c,d,n);}
    if(type==='box'||type==='bevel'){
      const q=type==='bevel'?.43:.5;
      for(let axis=0;axis<3;axis++)for(let sign of [-1,1]){
        const u=(axis+1)%3,v=(axis+2)%3,points=[];
        for(let ab of [[-q,-q],[q,-q],[q,q],[-q,q]]){const p=[0,0,0];p[axis]=sign*.5;p[u]=ab[0];p[v]=ab[1];points.push(p);}
        const n=[0,0,0];n[axis]=sign;quad(...points,n);
      }
      if(type==='bevel'){
        for(let axis=0;axis<3;axis++){const u=(axis+1)%3,v=(axis+2)%3;
          for(let su of [-1,1])for(let sv of [-1,1]){const points=[];
            for(let aq of [[-q,.5,q],[q,.5,q],[q,q,.5],[-q,q,.5]]){const p=[0,0,0];p[axis]=aq[0];p[u]=su*aq[1];p[v]=sv*aq[2];points.push(p);}
            const n=[0,0,0];n[u]=su*.7071;n[v]=sv*.7071;quad(...points,n);
          }
        }
        for(let x of [-1,1])for(let y of [-1,1])for(let z of [-1,1])tri([x*.5,y*q,z*q],[x*q,y*.5,z*q],[x*q,y*q,z*.5],[x*.577,y*.577,z*.577]);
      }
    }else if(type==='quad')quad([-.5,-.5,0],[.5,-.5,0],[.5,.5,0],[-.5,.5,0],[0,0,1]);
    else if(type==='gem'){
      const eq=[[.5,0,0],[0,.5,0],[-.5,0,0],[0,-.5,0]];
      for(let i=0;i<4;i++){tri([0,0,.65],eq[i],eq[(i+1)%4]);tri([0,0,-.45],eq[(i+1)%4],eq[i]);}
    }else if(type==='ring'){
      for(let i=0;i<32;i++){let a=i*Math.PI/16,b=(i+1)*Math.PI/16;quad([Math.cos(a)*.5,Math.sin(a)*.5,0],[Math.cos(b)*.5,Math.sin(b)*.5,0],[Math.cos(b)*.46,Math.sin(b)*.46,0],[Math.cos(a)*.46,Math.sin(a)*.46,0],[0,0,1]);}
    }else if(type==='cylinder'){
      for(let i=0;i<12;i++){let a=i*Math.PI/6,b=(i+1)*Math.PI/6,p=[Math.cos(a)*.5,Math.sin(a)*.5,-.5],q=[Math.cos(b)*.5,Math.sin(b)*.5,-.5],P=[p[0],p[1],.5],Q=[q[0],q[1],.5];tri([0,0,.5],P,Q,[0,0,1]);quad(p,q,Q,P,[Math.cos((a+b)/2),Math.sin((a+b)/2),0]);}
    }
    return new Float32Array(out);
  }
  function init(){
    ext=gl.getExtension('ANGLE_instanced_arrays');api.stats.instanced=!!ext;
    program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,(ext?'#define INSTANCED\n':'')+vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    attrs.p=gl.getAttribLocation(program,'aPosition');attrs.n=gl.getAttribLocation(program,'aNormal');
    for(const n of ['iCenter','iScale','iRotation','iColor'])attrs[n]=ext?gl.getAttribLocation(program,n):gl.getUniformLocation(program,n);
    for(const n of ['uCamera','uViewport','uFog'])uniforms[n]=gl.getUniformLocation(program,n);
    meshes={};for(const name of ['box','bevel','quad','gem','ring','cylinder']){const v=geometry(name),buffer=gl.createBuffer(),instances=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,v,gl.STATIC_DRAW);meshes[name]={buffer,instances,count:v.length/6,opaque:[],transparent:[],storage:new Float32Array(0)};}
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  }
  try{init();}catch(e){console.error('WebGL setup:',e);api.fallback=true;api.mode='2D';canvas.style.display='none';api.render=()=>draw2DLegacy();return api;}
  const colors=new Map();
  function color(hex){if(colors.has(hex))return colors.get(hex);let s=hex.replace('#','');if(s.length===3)s=s.split('').map(v=>v+v).join('');const n=parseInt(s,16),c=[((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];colors.set(hex,c);return c;}
  function add(type,x,y,z,w,d,h,hex,rz=0,rx=0,ry=0,alpha=1,mode=0){const c=color(hex),dest=alpha<1||mode>1.5?meshes[type].transparent:meshes[type].opaque;dest.push(x,y,z,mode,w,d,h,rz,rx,ry,...c,alpha);}
  function box(x,y,z,w,d,h,c,rz=0,rx=0,ry=0,soft=false){add(soft?'bevel':'box',x,y,z,w,d,h,c,rz,rx,ry);}
  function ring(x,y,r,c,a=1,z=.7){add('ring',x,y,z,r*2,r*2,1,c,0,0,0,a,1);}
  function shadow(x,y,w,h,a=.28){add('quad',x+6,y+8,.17,w,h,1,'#183342',0,0,0,a,2);}
  const hash=(x,y,s=0)=>{let n=Math.sin(x*127.1+y*311.7+s*74.7)*43758.5453;return n-Math.floor(n);};
  function environment(cx,cy,p){
    const half=api.visibleHalf(),margin=210,tile=96;
    const x0=Math.floor((cx-half.x-margin)/tile),x1=Math.ceil((cx+half.x+margin)/tile);
    const y0=Math.floor((cy-half.y-margin)/tile),y1=Math.ceil((cy+half.y+margin)/tile);
    for(let gx=x0;gx<=x1;gx++)for(let gy=y0;gy<=y1;gy++){
      const x=gx*tile+48,y=gy*tile+48,ix=((gx%8)+8)%8,iy=((gy%8)+8)%8;
      const road=ix===0||ix===7||iy===0||iy===7,paved=!road&&(ix===1||ix===6||iy===1||iy===6);
      const c=road?p.road:paved?p.pave:hash(gx,gy)>.5?p.grass:p.grass2;
      box(x,y,-4,96.2,96.2,8,c);
      if(paved){box(x,y,.6,94,94,1.1,p.pave);}
      if(ix===1&&iy>0&&iy<7)box(x-47,y,2.1,3,96,4.1,p.curb);
      if(ix===6&&iy>0&&iy<7)box(x+47,y,2.1,3,96,4.1,p.curb);
      if(iy===1&&ix>0&&ix<7)box(x,y-47,2.1,96,3,4.1,p.curb);
      if(iy===6&&ix>0&&ix<7)box(x,y+47,2.1,96,3,4.1,p.curb);
      if(ix===0&&iy>1&&iy<6)box(gx*tile,y,.15,4,36,.25,p.stripe);
      if(iy===0&&ix>1&&ix<6)box(x,gy*tile,.15,36,4,.25,p.stripe);
      // Zebra crossings around every intersection.
      if(ix===0&&(iy===1||iy===6))for(let k=0;k<4;k++)box(gx*tile-76+k*42,y,.18,22,32,.3,p.curb);
      if(iy===0&&(ix===1||ix===6))for(let k=0;k<4;k++)box(x,gy*tile-76+k*42,.18,32,22,.3,p.curb);
      if(!road&&!paved&&hash(gx,gy,7)>.42){
        for(let k=0;k<3;k++){let tx=x+(hash(gx,gy,8+k)-.5)*65,ty=y+(hash(gx,gy,12+k)-.5)*65;box(tx,ty,1.4,6,10,2.8,p.grass);}
      }
      if(ix===2&&(iy===2||iy===5)||ix===5&&(iy===2||iy===5))tree(x,y,p,hash(gx,gy));
      if(ix===1&&iy===3){bench(x+8,y,Math.PI/2,p);lamp(x-28,y+38,p);}
      if(ix===6&&iy===4){bench(x-8,y,-Math.PI/2,p);lamp(x+28,y-38,p);}
      if(ix===4&&iy===2){crate(x,y,24,hash(gx,gy)>.5?'#f0b266':'#70bca9');crate(x+31,y+7,18,'#f2cc7d');}
      if(ix===4&&iy===4&&hash(Math.floor(gx/8),Math.floor(gy/8),9)>.25)kiosk(x+10,y+4,p,Math.floor(hash(gx,gy,5)*3));
      if(ix===7&&iy===4&&hash(gx,gy,4)>.38)car(x+4,y,p,hash(gx,gy,2));
    }
  }
  function tree(x,y,p,seed){
    const s=.8+seed*.35;shadow(x+6,y+9,72*s,69*s,.24);
    box(x,y,3,48*s,48*s,6,p.curb,0,0,0,true);box(x,y,6,40*s,40*s,3,'#768867');
    box(x,y,25*s,11*s,11*s,43*s,p.trunk,0,0,0,true);
    box(x,y,55*s,45*s,43*s,30*s,p.leaf,.12,0,0,true);
    box(x-9*s,y-6*s,72*s,33*s,34*s,25*s,p.leaf2,-.08,0,0,true);
    box(x+14*s,y+5*s,52*s,24*s,30*s,23*s,p.leaf2,.23,0,0,true);
  }
  function bench(x,y,angle,p){
    const c=Math.cos(angle),s=Math.sin(angle),part=(a,b,z,w,d,h,col)=>box(x+a*c-b*s,y+a*s+b*c,z,w,d,h,col,angle,0,0,true);
    shadow(x,y,72,38,.2);part(0,0,18,57,19,6,'#cea06d');part(0,-9,31,57,5,22,'#e0b27e');
    part(-20,0,9,5,16,17,'#536879');part(20,0,9,5,16,17,'#536879');
  }
  function lamp(x,y,p){shadow(x+9,y+10,34,46,.14);box(x,y,3,17,17,6,'#6a8090',0,0,0,true);box(x,y,40,5,5,76,'#658294');box(x,y,80,18,18,9,'#f7e9af',0,0,0,true);box(x,y,86,23,23,4,'#5d7789',0,0,0,true);}
  function crate(x,y,s,c){shadow(x,y,s*1.5,s*1.4,.18);box(x,y,s*.48,s,s,s*.96,c,0,0,0,true);box(x,y,s*.98,s*.9,4,1.1,'#f8d59b');box(x,y+s*.49,s*.48,4,1,s*.85,'#936b47');box(x+s*.49,y,s*.48,1,4,s*.85,'#936b47');}
  function car(x,y,p,seed){
    shadow(x,y,69,120,.25);const c=seed>.5?'#edb96b':'#76b8c7';box(x,y,17,49,86,22,c,0,0,0,true);box(x,y-8,34,43,44,19,c,0,0,0,true);box(x,y+15,34,37,2,12,'#aee6e4');box(x,y-30,34,37,2,12,'#9acbd4');
    for(let a of [-1,1])for(let b of [-1,1])box(x+a*26,y+b*26,10,7,17,17,'#3c4b5a',0,0,0,true);
    box(x-15,y+44,18,11,2,6,'#fff1b4');box(x+15,y+44,18,11,2,6,'#fff1b4');
  }
  function kiosk(x,y,p,k){
    // Decorative facade: translucent when near the survivor, so it cannot hide combat.
    const near=player&&Math.hypot(player.x-x,player.y-y)<125,alpha=near?.26:1;
    const part=(a,b,z,w,d,h,c)=>add('bevel',x+a,y+b,z,w,d,h,c,0,0,0,alpha);
    shadow(x,y,140,115,.23);part(0,0,31,108,78,62,p.wall[k]);part(0,0,66,122,92,10,p.roof[k]);part(0,-6,74,98,61,7,p.roof[k]);
    part(-29,40,34,27,2,30,'#7caabb');part(29,40,34,27,2,30,'#7caabb');part(0,40,23,17,3,43,'#587583');part(0,48,53,116,27,6,p.roof[k]);
    part(-54,5,34,2,36,28,'#91c5ca');part(0,49,41,28,1,10,'#ffe5a4');
  }
  function humanoid(x,y,s,yaw,gait,walk,style,hit=0,hero=false){
    const c=Math.cos(yaw),sn=Math.sin(yaw),bob=Math.abs(Math.sin(gait))*(walk?1.7:.3),t=style;
    const part=(a,b,z,w,d,h,col,rx=0,ry=0)=>box(x+(a*c-b*sn)*s,y+(a*sn+b*c)*s,(z+bob)*s,w*s,d*s,h*s,hit?'#fff5da':col,yaw,rx,ry,true);
    shadow(x,y,45*s,37*s,hero?.34:.26);
    const swing=Math.sin(gait)*(walk?.65:.05);
    // Individually hinged block limbs, with a run cycle rather than a sliding body.
    for(const side of [-1,1]){
      const a=swing*side,legY=Math.sin(a)*7,legZ=13-Math.cos(a)*7;
      part(side*6.2,legY,legZ+5,10.5,11,21,t.pants,a);
      part(side*6.2,legY+2,4+Math.max(0,Math.sin(a))*4,11,15,7,t.shoes,a*.4);
      const armAngle=hero?-a*.8:-.42-a*.55;
      part(side*17,Math.sin(armAngle)*7,33-Math.cos(armAngle)*7,9,10,23,t.shirt,armAngle);
      part(side*17,Math.sin(armAngle)*14,33-Math.cos(armAngle)*14,9.2,10.2,8,t.skin,armAngle);
    }
    part(0,0,31,26,16,25,t.shirt);part(0,0,18,25,16,5,t.pants);
    if(hero){
      part(0,8.5,30,20,3,19,t.accent||'#69dac0');part(-5,10,27,7,2,6,'#247d77');part(5,10,27,7,2,6,'#247d77');part(0,-12,30,18,9,21,'#e4ae61');part(0,-17,30,10,2,12,'#bf864f');
    }else{
      part(-5,8.4,31,7,1,5,t.patch||'#dce698');part(5,8.4,26,7,1,6,t.patch||'#dce698');
    }
    part(0,0,52,23,22,22,t.skin);part(0,-2,64,25,23,5,t.hat||t.pants);
    if(hero){part(0,2,66,26,22,7,t.cap||'#294e72');part(0,13,62,27,13,3,t.cap||'#345f82');part(0,13.5,67,6,1,4,'#ffc65d');}
    if(hero&&t.role==='medic'){part(0,-18,35,4,1,13,'#eafbf0');part(0,-18.5,35,12,1,4,'#eafbf0');part(0,12,54,21,2,9,'#d0eff1');}
    if(hero&&t.role==='engineer'){part(0,12,55,25,3,9,'#465c6b');part(-6,14,55,8,1,6,'#b3e6dd');part(6,14,55,8,1,6,'#b3e6dd');part(-19,-10,35,4,5,29,'#4d6377');}
    // Face is attached to head space: two eyes and a tiny smile / teeth.
    for(const side of [-1,1])part(side*4.7,11.3,54,2.6,1,3.6,hero?'#203a46':'#344647');
    part(0,11.5,47.5,6.8,1,1.5,hero?'#754d3c':'#496044');
    if(!hero&&style.teeth){part(-2,11.8,48.5,2.2,1,2,'#fff8da');part(2,11.8,48.5,2.2,1,2,'#fff8da');}
    if(t.helmet){part(0,0,65,29,27,8,t.helmet);part(0,12,60,28,4,7,t.helmet);}
    if(t.crown){part(0,0,65,28,26,6,'#ffd26b');for(let j=-1;j<=1;j++)part(j*9,8,71,5,7,9,'#ffe09a');}
    if(t.barrel){part(17,15,27,7,24,7,'#41576d');part(17,27,27,8,4,8,'#bfd7dc');}
  }
  const looks={
    player:{skin:'#ffdc9c',shirt:'#36bca0',pants:'#3c608b',shoes:'#30475c'},
    grunt:{skin:'#b6d889',shirt:'#79a1bc',pants:'#506b88',shoes:'#526577',hat:'#609653',teeth:true},
    runner:{skin:'#dfbd86',shirt:'#e9865d',pants:'#796885',shoes:'#f1d6a4',hat:'#af6d47',patch:'#ffd2a0'},
    tank:{skin:'#c4bcda',shirt:'#8b82b5',pants:'#5e668d',shoes:'#424e6c',hat:'#6c7093',helmet:'#747e9d',patch:'#c7c2ee'},
    ranged:{skin:'#a1d5c0',shirt:'#64aebc',pants:'#456d8d',shoes:'#465b75',hat:'#357e89',barrel:true},
    sniper:{skin:'#dbd5ba',shirt:'#d8819b',pants:'#6a668b',shoes:'#525774',hat:'#914e7c',barrel:true},
    splitter:{skin:'#d7b5ef',shirt:'#a483c8',pants:'#656f9e',shoes:'#675586',hat:'#9d6eb4',teeth:true,patch:'#eed5ff'},
    charger:{skin:'#f1c99c',shirt:'#dd8d62',pants:'#725c79',shoes:'#4d536c',hat:'#a16b50',helmet:'#9c684c',teeth:true},
    medic:{skin:'#c2e5c9',shirt:'#62ba9d',pants:'#487e7d',shoes:'#3c646d',hat:'#f7f5e3',patch:'#fcf2c2'},
    mini:{skin:'#e5b9e5',shirt:'#bd86d3',pants:'#7f6c9e',shoes:'#82628f',hat:'#af77be'},
    elite:{skin:'#e9cf8e',shirt:'#e2a34f',pants:'#777184',shoes:'#5e5c70',hat:'#bd853c',crown:true,teeth:true},
    boss:{skin:'#b7d58e',shirt:'#cf775f',pants:'#655d86',shoes:'#4f526a',hat:'#608f5a',helmet:'#635c80',teeth:true,patch:'#efb987'}
  };
  function segment(x1,y1,z1,x2,y2,z2,width,c,alpha=1){
    const dx=x2-x1,dy=y2-y1,dz=z2-z1,len=Math.hypot(dx,dy,dz),yaw=Math.atan2(dy,dx),pitch=-Math.atan2(dz,Math.hypot(dx,dy));
    add('box',(x1+x2)/2,(y1+y2)/2,(z1+z2)/2,len,width,width,c,yaw,0,pitch,alpha,1);
  }
  function pickup(g,t){
    const bob=Math.sin(t*3+g.x*.03)*2;
    if(g.chest){shadow(g.x,g.y,36,29,.22);box(g.x,g.y,10,25,19,18,'#e0a14d',0,0,0,true);box(g.x,g.y,20,27,20,7,'#ffd777',0,0,0,true);box(g.x,g.y+10,12,5,2,8,'#fff2bb');ring(g.x,g.y,19,'#ffe193',.65);}
    else if(g.heal){box(g.x,g.y,11+bob,17,16,17,'#fbf7df',t*.25,0,0,true);box(g.x,g.y+8.5,11+bob,11,1,3,'#ea6f78');box(g.x,g.y+8.5,11+bob,3,1,11,'#ea6f78');}
    else if(g.bomb){add('cylinder',g.x,g.y,12+bob,19,19,19,'#53677a');box(g.x,g.y,24+bob,4,4,7,'#e3b47c');add('gem',g.x,g.y,29+bob,6,6,6,'#ffd482',0,0,0,1,1);}
    else if(g.shield||g.magnetAll){add('gem',g.x,g.y,15+bob,23,23,23,g.shield?'#77efd3':'#c5a4ff',t*.6);ring(g.x,g.y,17,g.shield?'#65e9cd':'#bda3f7',.7);}
    else{const c=g.val>=20?'#f6d579':g.val>=5?'#83e8bd':'#74dcf3';add('gem',g.x,g.y,6+bob,8+Math.min(5,g.val/4),8+Math.min(5,g.val/4),11,c,t*.55);}
  }
  function weaponFx(t){
    for(const a of areas){
      const fade=clamp(a.life/a.max,0,1);
      if(a.kind==='fire'){
        add('cylinder',a.x,a.y,.6,a.r*2,a.r*2,.3,'#ed9d45',0,0,0,.2,1);ring(a.x,a.y,a.r,'#ffb762',.6);
        const n=graphics.quality==='low'?5:9;
        for(let j=0;j<n;j++){let an=j*2.399,r=a.r*Math.sqrt((j+.5)/n)*.85,x=a.x+Math.cos(an+t*.15)*r,y=a.y+Math.sin(an+t*.15)*r,h=14+10*Math.sin(t*8+j*1.5);add('bevel',x,y,h*.5+3,9,9,h,'#ffbb65',t+j,0,.15,.8,1);add('gem',x,y,h+4,6,6,11,'#fff2b8',0,0,0,.85,1);}
      }else if(a.kind==='link'){segment(a.x,a.y,28,a.x2,a.y2,28,3,'#c3f2ff',fade);
      }else if(a.kind==='heroPulse'){ring(a.x,a.y,a.r*(1-fade),'#9dffe1',fade,3);ring(a.x,a.y,a.r*(1-fade)*.82,'#e2ffcf',fade*.65,10);
      }else if(a.kind==='healpulse'){ring(a.x,a.y,a.r*(1-fade),'#96f4bf',fade,2);
      }else if(a.kind==='lightning'){
        segment(a.x-18,a.y,155,a.x+8,a.y,98,5,'#e7fcff',fade);segment(a.x+8,a.y,98,a.x-11,a.y,53,7,'#a3e8ff',fade);segment(a.x-11,a.y,53,a.x,a.y,5,6,'#fff6c3',fade);ring(a.x,a.y,30*(1-fade)+12,'#b8f3ff',fade);
      }else{
        ring(a.x,a.y,a.r*(1-fade*.55),'#ffe8a5',fade,2);add('gem',a.x,a.y,25,42*(fade+.3),42*(fade+.3),50*fade,'#ffcb77',t,0,0,fade*.5,1);
      }
    }
    for(const h of hazards){const warn=h.arming>0,c=warn?'#ffd470':'#ed647b';add('cylinder',h.x,h.y,.4,h.r*2,h.r*2,.2,c,0,0,0,warn?.16:.24,1);ring(h.x,h.y,h.r,c,.8+.2*Math.sin(t*7),1);ring(h.x,h.y,h.r*(warn?1-clamp(h.arming/1.3,0,1):.9),c,.5,1.2);}
    for(const s of shots){
      const angle=Math.atan2(s.vy,s.vx),d=Math.hypot(s.vx,s.vy)||1,ux=s.vx/d,uy=s.vy/d;
      if(s.drone){
        const z=36+Math.min(1,s.life/2.4)*28;add('bevel',s.x,s.y,z,15,6,6,s.color,angle,0,0,1);segment(s.x,s.y,z,s.x-ux*24,s.y-uy*24,z,3,s.color,.65);
      }else if(s.kind==='rocket'){
        box(s.x,s.y,28,23,10,10,'#e8e7ce',angle,0,0,true);add('gem',s.x+ux*14,s.y+uy*14,28,10,10,14,'#ee9164',angle,0,Math.PI/2);box(s.x-ux*7,s.y-uy*7,28,5,19,3,'#6d9ca9',angle);segment(s.x-ux*12,s.y-uy*12,28,s.x-ux*30,s.y-uy*30,28,6,'#ffc46f',.8);
      }else if(s.kind==='drill'){
        add('gem',s.x,s.y,26,24,10,10,'#84e4f1',angle,0,0);segment(s.x,s.y,26,s.x-ux*25,s.y-uy*25,26,3,'#b2f4f4',.5);
      }else{
        add('gem',s.x,s.y,28,20,8,5,s.color||'#ffda83',angle,t*12,0);segment(s.x-ux*3,s.y-uy*3,28,s.x-ux*18,s.y-uy*18,28,2,'#fff3bc',.55);
      }
    }
    for(const s of enemyShots){add('gem',s.x,s.y,20,s.r*1.8,s.r*1.8,s.r*1.8,s.color||'#f3849b',t*4,0,0,1,1);shadow(s.x,s.y,s.r*2,s.r*1.7,.12);}
    if(player?.levels.guardian){
      let lv=player.levels.guardian,n=2+Math.floor(lv/2)+(player.evolved.guardian?3:0),rad=(55+lv*7)*rangePower();
      ring(player.x,player.y,rad,'#8cd8e0',.28);
      for(let i=0;i<n;i++){let a=player.rot+i*Math.PI*2/n,x=player.x+Math.cos(a)*rad,y=player.y+Math.sin(a)*rad;add('bevel',x,y,26,23,7,5,'#cef7f2',a+t*5);add('bevel',x,y,26,7,23,5,'#83d9df',a+t*5);add('gem',x,y,29,9,9,7,player.evolved.guardian?'#ffdd83':'#fff4cf',t*5);}
    }
    const stride=graphics.quality==='low'?2:1;
    for(let i=0;i<particles.length;i+=stride){const p=particles[i],a=clamp(p.life/p.max,0,1),z=4+Math.sin(a*Math.PI)*23;add('bevel',p.x,p.y,z,p.r*1.4,p.r*1.4,p.r*1.4,p.color,t*7+i,t*4,0,a,1);}
  }

  // Telegraph geometry is generated from the same descriptors as collision.
  function bossEquipment(e,yaw,t,s=1){
    const c=Math.cos(yaw),sn=Math.sin(yaw),part=(x,y,z,w,d,h,col)=>box(e.x+(x*c-y*sn)*s,e.y+(x*sn+y*c)*s,z*s,w*s,d*s,h*s,col,yaw,0,0,true);
    if(chapter===0){
      part(-39,0,83,28,31,20,'#677993');part(39,0,83,28,31,20,'#677993');
      part(48,14,53,7,8,68,'#596c7a');part(48,14,86,30,28,26,e.phase===2?'#ef9b71':'#d3be8d');
      part(48,29,86,18,3,8,'#ffe6a3');part(0,20,72,30,6,28,'#657e8a');
    }else if(chapter===1){
      for(const side of [-1,1]){part(side*38,-5,105,23,36,22,'#886e63');part(side*38,14,105,19,3,18,'#534f61');
        for(const x of [-5,5])part(side*38+x,16,105,5,3,6,'#fbc379');}
      part(0,-22,70,39,13,45,'#a67e55');
    }else{
      for(const side of [-1,1]){const x=e.x+(side*39*c+4*sn)*s,y=e.y+(side*39*sn-4*c)*s;add('gem',x,y,(112+Math.sin(t*3+side)*5)*s,23*s,23*s,45*s,'#9ae6f1',t*1.4,0,0,.85,1);}
      part(43,13,62,24,42,25,'#547f9c');part(43,35,62,18,5,18,'#c8faff');part(0,20,78,17,4,20,'#aaf3fb');
    }
  }

  function renderThreats(t){
    for(const h of threats){
      const active=h.age>=h.warn,progress=clamp(h.age/h.warn,0,1),alpha=active?.34:.14;
      if(h.shape==='line'){
        const dx=h.x2-h.x,dy=h.y2-h.y,len=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
        add('box',(h.x+h.x2)/2,(h.y+h.y2)/2,1.8,len,h.width,1,h.color,a,0,0,alpha,1);
        for(const side of [-1,1]){const ox=-Math.sin(a)*h.width*.5*side,oy=Math.cos(a)*h.width*.5*side;segment(h.x+ox,h.y+oy,2.6,h.x2+ox,h.y2+oy,2.6,2,h.color,.8);}
        if(active&&h.kind==='laser'){
          segment(h.x,h.y,20,h.x2,h.y2,20,h.width*.8,'#8beaff',.5);
          segment(h.x,h.y,20,h.x2,h.y2,20,7,'#eaffff',.95);
        }else{
          const n=Math.max(2,Math.floor(len/35));for(let i=1;i<n;i++){const f=i/n;add('gem',h.x+dx*f,h.y+dy*f,4,10,10,2,h.color,a,0,0,.45+progress*.4,1);}
        }
        ring(h.x2,h.y2,Math.max(12,h.width*.5),h.color,.85,2.5);
      }else if(h.shape==='circle'){
        add('cylinder',h.x,h.y,.9,h.r*2,h.r*2,.5,h.color,0,0,0,alpha,1);
        ring(h.x,h.y,h.r,h.color,.9,2);if(!active)ring(h.x,h.y,h.r*progress,h.color,.65,2.3);
        if(active&&h.kind==='mortar'){
          add('gem',h.x,h.y,35,45,45,75,'#ffe1a4',t*3,0,0,.65,1);
          ring(h.x,h.y,h.r*1.1,'#fff1c0',.8,3);
        }
      }else{
        if(active){const r=h.r*clamp((h.age-h.warn)/h.duration,0,1);ring(h.x,h.y,r,h.color,1,4);ring(h.x,h.y,Math.max(1,r-h.width),h.color,.65,7);}
        else{ring(h.x,h.y,50,h.color,.8,2);ring(h.x,h.y,h.r,h.color,.24,1.8);add('cylinder',h.x,h.y,1,90,90,.5,h.color,0,0,0,.1+progress*.1,1);}
      }
    }
  }
  function renderDrones(t){
    for(const d of dronePositions()){
      const scale=d.kind==='destroyer'?1.25:1,col=d.kind==='droneA'?'#6bd0df':d.kind==='droneB'?'#edb475':'#f2ce74';
      shadow(d.x,d.y,37*scale,32*scale,.19);
      box(d.x,d.y,d.z,24*scale,18*scale,9*scale,col,t*.45,0,0,true);
      box(d.x,d.y+8,d.z,13*scale,3,5,'#e8fbff');
      for(const side of [-1,1]){
        box(d.x+side*17*scale,d.y,d.z+3,10,10,4,'#385b72',0,0,0,true);
        box(d.x+side*17*scale,d.y,d.z+6,23*scale,3,1,'#c1ede9',t*25*side);
        box(d.x+side*17*scale,d.y,d.z+6,3,23*scale,1,'#e1fff2',t*25*side);
      }
      if(d.kind==='destroyer')for(const side of [-1,1])box(d.x+side*8,d.y+12,d.z-5,6,16,5,'#45647e');
    }
  }

  function heroLook(key){const h=heroCatalog[key]||heroCatalog.assault;return {...looks.player,shirt:h.shirt,cap:h.hat,accent:h.color,role:key};}
  function renderTactics(t,visible){
    for(const b of tactics.beacons){
      if(b.status==='expired'||!visible(b.x,b.y,180))continue;
      const done=b.status==='complete',col=done?'#f2cc83':b.contested?'#f1a277':'#62dfc3';
      shadow(b.x,b.y,60,55,.22);box(b.x,b.y,4,42,42,8,'#445f73',0,0,0,true);
      box(b.x,b.y,16,28,28,18,'#deecdd',0,0,0,true);box(b.x,b.y,30,20,20,13,col,0,0,0,true);
      box(b.x,b.y,52,4,4,40,'#597b8a');add('gem',b.x,b.y,77,18,18,21,col,t*.8);
      if(!done){
        ring(b.x,b.y,b.r,col,.8,1.5);add('cylinder',b.x,b.y,.8,b.r*2,b.r*2,.4,col,0,0,0,.055,1);
        add('cylinder',b.x,b.y,60,13,13,110,col,0,0,0,.08,1);
        for(let j=0;j<8;j++){const a=j*TAU/8;box(b.x+Math.cos(a)*b.r,b.y+Math.sin(a)*b.r,5,10,10,7,j<b.progress?col:'#718a86',a,0,0,true);}
      }else ring(b.x,b.y,30,col,.7);
    }
    for(const f of tactics.fields){
      if(!visible(f.x,f.y,150))continue;
      ring(f.x,f.y,f.r,'#6fe3c5',.9,2);ring(f.x,f.y,f.r*(.65+.15*Math.sin(t*2)),'#c2ffec',.3,2);
      add('cylinder',f.x,f.y,.8,f.r*2,f.r*2,.4,'#54d5bc',0,0,0,.09,1);
      for(let j=0;j<5;j++){const a=j*2.399,r=f.r*.65,z=12+((t*18+j*11)%32),px=f.x+Math.cos(a)*r,py=f.y+Math.sin(a)*r;box(px,py,z,4,4,15,'#ceffea');box(px,py,z,14,4,4,'#ceffea');}
    }
    for(const a of tactics.turrets){
      if(!visible(a.x,a.y))continue;shadow(a.x,a.y,50,45,.25);
      for(let j=0;j<3;j++){const an=j*TAU/3;segment(a.x,a.y,22,a.x+Math.cos(an)*21,a.y+Math.sin(an)*21,3,6,'#526779');}
      box(a.x,a.y,24,26,23,19,'#dfa658',a.yaw,0,0,true);box(a.x,a.y,35,16,18,7,'#ffe6a2',a.yaw,0,0,true);
      const dx=Math.cos(a.yaw),dy=Math.sin(a.yaw);segment(a.x,a.y,26,a.x+dx*30,a.y+dy*30,26,8,'#3e566e');
      if(a.cool>.25)add('gem',a.x+dx*35,a.y+dy*35,26,13,13,13,'#ffe8ab',t*20,0,0,.8,1);
      ring(a.x,a.y,28,'#edc57d',.6);box(a.x,a.y,47,26,3,3,'#42666e');box(a.x-13+(a.life/a.max)*13,a.y,47,26*a.life/a.max,3,3,'#ffd58f');
    }
  }
  function batch(mesh,list){
    if(!list.length)return;
    gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.enableVertexAttribArray(attrs.p);gl.enableVertexAttribArray(attrs.n);gl.vertexAttribPointer(attrs.p,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(attrs.n,3,gl.FLOAT,false,24,12);
    const fields=[['iCenter',4,0],['iScale',3,4],['iRotation',3,7],['iColor',4,10]],count=list.length/14;
    if(ext){
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.instances);
      if(mesh.storage.length<list.length)mesh.storage=new Float32Array(Math.max(list.length,mesh.storage.length*2,2048));
      mesh.storage.set(list);gl.bufferData(gl.ARRAY_BUFFER,mesh.storage.subarray(0,list.length),gl.DYNAMIC_DRAW);
      for(const [n,size,off] of fields){gl.enableVertexAttribArray(attrs[n]);gl.vertexAttribPointer(attrs[n],size,gl.FLOAT,false,56,off*4);ext.vertexAttribDivisorANGLE(attrs[n],1);}
      ext.drawArraysInstancedANGLE(gl.TRIANGLES,0,mesh.count,count);api.stats.drawCalls++;
      for(const [n] of fields){ext.vertexAttribDivisorANGLE(attrs[n],0);gl.disableVertexAttribArray(attrs[n]);}
    }else{
      for(let i=0;i<count;i++){const off=i*14;for(const [n,size,start] of fields){if(size===4)gl.uniform4f(attrs[n],list[off+start],list[off+start+1],list[off+start+2],list[off+start+3]);else gl.uniform3f(attrs[n],list[off+start],list[off+start+1],list[off+start+2]);}gl.drawArrays(gl.TRIANGLES,0,mesh.count);api.stats.drawCalls++;}
    }
    api.stats.instances+=count;
  }
  let previous=0;
  api.render=()=>{
    if(api.mode==='2D'||api.fallback){draw2DLegacy();return;}
    if(api.lost)return;
    const now=performance.now()/1000,dt=Math.min(.05,now-previous||.016);previous=now;
    cam.zoom=(W<600?1.05:1.35)*(graphics.zoom||1);
    if(!cam.ready)api.resetCamera();
    if(player&&state!=='menu'){const k=1-Math.exp(-dt*12);cam.x+=(player.x-cam.x)*k;cam.y+=(player.y-cam.y)*k;}
    const p=palette[chapter],px=Math.min(devicePixelRatio||1,graphics.quality==='high'?2:graphics.quality==='low'?1:1.5),bw=Math.round(W*px),bh=Math.round(H*px);
    if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh;}
    const bg=color(p.fog);gl.viewport(0,0,bw,bh);gl.clearColor(...bg,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    for(const m of Object.values(meshes)){m.opaque.length=m.transparent.length=0;}
    api.stats.drawCalls=api.stats.instances=0;
    const half=api.visibleHalf(),visible=(x,y,margin=120)=>Math.abs(x-cam.x)<half.x+margin&&Math.abs(y-cam.y)<half.y+margin;
    environment(cam.x,cam.y,p);
    const t=player?elapsed:now*.7;
    if(player&&state!=='menu'){
      for(const g of gems)if(visible(g.x,g.y,50))pickup(g,t);
      for(const e of enemies){
        if(e.hp<=0||!visible(e.x,e.y))continue;
        const scale=e.type==='boss'?(e.role==='mid'?1.7:2.25):e.type==='elite'?1.38:e.type==='tank'?1.08:e.type==='mini'?.5:e.type==='runner'?.72:.78;
        const yaw=e.charging>0?Math.atan2(e.chargeTo.y-e.chargeFrom.y,e.chargeTo.x-e.chargeFrom.x)-Math.PI/2:Math.atan2(player.y-e.y,player.x-e.x)-Math.PI/2;
        let style=looks[e.type]||looks.grunt;
        if(e.type==='boss'&&chapter)style={...style,skin:chapter===1?'#e6bd83':'#b8e7ed',shirt:chapter===1?'#b98d65':'#86a6cf'};
        if(e.slow>0){style={...style,shirt:'#70b7d5',accent:'#b7eff9'};ring(e.x,e.y,e.r+5,'#9de9ff',.7,2);}
        if(e.affix){const aff=eliteAffixes[e.affix];ring(e.x,e.y,e.r+10,aff.color,.75,2);for(let j=0;j<3;j++){const a=t*1.4+j*TAU/3;add('gem',e.x+Math.cos(a)*(e.r+9),e.y+Math.sin(a)*(e.r+9),28+Math.sin(a)*4,8,8,12,aff.color,a,0,0,.75,1);}if(e.ward>0){ring(e.x,e.y,e.r+8,aff.color,.65,38);ring(e.x,e.y,e.r+8,aff.color,.35,57);}}
        humanoid(e.x,e.y,scale,yaw,e.age*(e.type==='runner'?13:8)+e.seed,(e.busy<=0&&(e.stun||0)<=0)||e.charging>0,style,e.hit);
        if(e.type==='boss'){
          bossEquipment(e,yaw,t,scale/2.25);
          ring(e.x,e.y,e.r+9,e.phase===2?'#f26b89':'#ecb46f',.65);
          if(e.charge>0){ring(e.x,e.y,85+20*(1-e.charge/1.1),'#ef7b85',.85,1.3);segment(e.x,e.y,1.4,e.chargeX,e.chargeY,1.4,4,'#f8ae86',.7);ring(e.chargeX,e.chargeY,24,'#f48691',.9);}
        }
      }
      renderTactics(t,visible);
      renderThreats(t);
      renderDrones(t);
      weaponFx(t);
      ring(player.x,player.y,22,'#f8e9ad',.95,1.3);
      if(doctrine.barrierReady){ring(player.x,player.y,30,'#9cddff',.8,30);ring(player.x,player.y,30,'#d4f5ff',.5,48);for(let i=0;i<4;i++){const a=t+i*TAU/4;box(player.x+Math.cos(a)*28,player.y+Math.sin(a)*28,31,5,5,12,'#ade9ff',a);}}
      if(player.inv>0){ring(player.x,player.y,26,'#9ff5e6',.75,8);ring(player.x,player.y,29,'#ccfff5',.35,23);}
      if(dashTime>0)for(let i=1;i<=4;i++){add('bevel',player.x-dashVector.x*i*10,player.y-dashVector.y*i*10,29,20,17,28,'#91eed2',player.facing,0,0,(5-i)*.07,1);}
      humanoid(player.x,player.y,1.03,(player.visualFacing??player.facing)-Math.PI/2,player.anim||0,!!player.moving,heroLook(activeHero),player.inv>.2&&player.inv<.7&&Math.floor(t*16)%2===0,true);
    }else{
      humanoid(0,0,1.17,0,t*2,false,heroLook(selectedHero),0,true);ring(0,0,25,'#fff0bc');
      for(let i=0;i<5;i++){const a=i*1.256+.5,x=Math.cos(a)*240,y=Math.sin(a)*240;humanoid(x,y,.78,Math.atan2(-y,-x)-Math.PI/2,t*7+i,true,looks[i%2?'runner':'grunt']);}
    }
    gl.useProgram(program);gl.uniform4f(uniforms.uCamera,cam.x,cam.y,cam.zoom,cam.cos);gl.uniform4f(uniforms.uViewport,W,H,cam.sin,cam.focus);gl.uniform3fv(uniforms.uFog,bg);
    gl.depthMask(true);gl.disable(gl.BLEND);for(const m of Object.values(meshes))batch(m,m.opaque);
    gl.depthMask(false);gl.enable(gl.BLEND);for(const m of Object.values(meshes))batch(m,m.transparent);gl.depthMask(true);
  };
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();api.lost=true;if(state==='playing')pause();saveRun();});
  canvas.addEventListener('webglcontextrestored',()=>{init();api.lost=false;});
  return api;
})();
