/* Crownfall Arena — original low-poly WebGL renderer, no external assets.
 * Rendering is a read-only view of the simulation. All picks use the same
 * orthographic camera as the GPU and intersect its ray with the ground plane.
 */

const W=480,H=640,TAU=Math.PI*2;
const FONT='"Noto Sans CJK KR", "Noto Sans KR", system-ui, sans-serif';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const num=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
const list=v=>Array.isArray(v)?v:v&&typeof v==='object'?Object.values(v):[];
const own=team=>team==='player'||team==='blue'||team==='home'||team===0;
const living=e=>e&&!e.destroyed&&num(e.hp,1)>0;
const mode=value=>value==='landscape'?'landscape':'portrait';
const spell=card=>card?.type==='spell'||['fireball','arrows','zap','poison'].includes(card?.id||card?.cardId);
const hash=value=>{let h=2166136261;for(const c of String(value??''))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const rgba=(hex,a=1)=>{const s=hex.replace('#','');return [parseInt(s.slice(0,2),16)/255,parseInt(s.slice(2,4),16)/255,parseInt(s.slice(4,6),16)/255,a];};
const TEAM={player:rgba('#59c7e0'),enemy:rgba('#ef8474')};
const teamColor=team=>own(team)?TEAM.player:TEAM.enemy;
const teamHex=team=>own(team)?'#79d8ea':'#ffab96';
const STONE=rgba('#dfd8bb'),STEEL=rgba('#a7bcc9'),DARK=rgba('#344753'),GOLD=rgba('#edc468');
const SKIN=rgba('#dfb58a'),BONE=rgba('#eee5cf'),WOOD=rgba('#a77b56'),GREEN=rgba('#8bc77b');
const THEMES={
  grove:{background:'#203a42',grass:'#78aa83',alternate:'#83b38e',stone:'#c9c3a6',water:'#58bdca',bank:'#618f77',path:'#a2b68d'},
  dusk:{background:'#26313f',grass:'#78818d',alternate:'#828c99',stone:'#baa998',water:'#4c98b0',bank:'#596e7e',path:'#9b9b94'},
  frost:{background:'#294351',grass:'#acc6cc',alternate:'#bdd5d7',stone:'#d4e2df',water:'#64b7cd',bank:'#86aeb8',path:'#cbdcda'}
};
const themeName=value=>typeof value==='string'&&Object.hasOwn(THEMES,value)?value:'grove';
const CARD_NAMES={knight:'기사',archers:'궁수',giant:'거인',goblins:'고블린',musketeer:'총사',bomber:'폭탄병',
  minions:'미니언',cannon:'대포',valkyrie:'전투 여전사',skeletons:'해골 병사',hog_rider:'돌격 기수',
  spear_goblins:'창 고블린',duelist:'강철 검사',ice_spirit:'얼음 정령',phalanx:'밀집보병'};

function inverse4(matrix) {
  const rows=Array.from({length:4},(_,r)=>Array.from({length:8},(_,c)=>c<4?matrix[c*4+r]:Number(c-4===r)));
  for(let c=0;c<4;c++) {
    let pivot=c;
    for(let r=c+1;r<4;r++)if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c]))pivot=r;
    if(Math.abs(rows[pivot][c])<1e-12)throw new Error('3D camera is not invertible.');
    [rows[c],rows[pivot]]=[rows[pivot],rows[c]];
    const divisor=rows[c][c];for(let k=0;k<8;k++)rows[c][k]/=divisor;
    for(let r=0;r<4;r++)if(r!==c){const factor=rows[r][c];for(let k=0;k<8;k++)rows[r][k]-=factor*rows[c][k];}
  }
  return Array.from({length:16},(_,i)=>rows[i%4][4+Math.floor(i/4)]);
}

function transformPoint(matrix,x,y,z) {
  const w=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];
  return [(matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12])/w,
    (matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13])/w,
    (matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14])/w];
}

/** Camera-space helpers are also used by the HUD and real ground picking. */
export function createCamera(orientation='portrait') {
  orientation=mode(orientation);
  const width=orientation==='landscape'?H:W,height=orientation==='landscape'?W:H;
  const elevation=58*Math.PI/180,s=Math.sin(elevation),c=Math.cos(elevation),sx=2/width,sy=2/height,depth=1000;
  // Vertices are [worldX - 240, altitude, worldY - 320]. Landscape rotates
  // the ground counterclockwise, placing the enemy on the left.
  const viewProjection=new Float32Array(orientation==='landscape'
    ?[0,sy*s,c/depth,0, 0,sy*c,-s/depth,0, sx,0,0,0, 0,0,0,1]
    :[sx,0,0,0, 0,sy*c,-s/depth,0, 0,-sy*s,-c/depth,0, 0,0,0,1]);
  return {orientation,width,height,elevation,viewProjection,inverseViewProjection:inverse4(viewProjection)};
}

export function projectGround(x,y,camera=createCamera(),altitude=0) {
  const p=transformPoint(camera.viewProjection,num(x)-W/2,num(altitude),num(y)-H/2);
  return {x:(p[0]+1)*camera.width/2,y:(1-p[1])*camera.height/2};
}

export function unprojectGround(viewX,viewY,camera=createCamera()) {
  const nx=num(viewX)/camera.width*2-1,ny=1-num(viewY)/camera.height*2;
  const near=transformPoint(camera.inverseViewProjection,nx,ny,-1),far=transformPoint(camera.inverseViewProjection,nx,ny,1);
  const dy=far[1]-near[1];
  if(Math.abs(dy)<1e-9)throw new Error('3D picking ray is parallel to the ground.');
  const t=-near[1]/dy;
  return {x:near[0]+(far[0]-near[0])*t+W/2,y:near[2]+(far[2]-near[2])*t+H/2};
}

function surfaceRect(canvas,camera) {
  const rect=canvas.getBoundingClientRect();
  const width=Math.max(1,num(rect.width)||num(canvas.clientWidth)||camera.width);
  const height=Math.max(1,num(rect.height)||num(canvas.clientHeight)||camera.height);
  const scale=Math.min(width/camera.width,height/camera.height);
  return {left:num(rect.left),top:num(rect.top),width,height,scale,
    offsetX:(width-camera.width*scale)/2,offsetY:(height-camera.height*scale)/2};
}

// Ten interleaved floats: position xyz, flat normal xyz, material rgba.
function triangle(out,a,b,c,color) {
  const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const length=Math.hypot(...normal)||1;
  for(const p of [a,b,c])out.push(...p,...normal.map(n=>n/length),...color);
}
function quad(out,a,b,c,d,color){triangle(out,a,b,c,color);triangle(out,a,c,d,color);}
function box(out,x,y,z,w,h,d,color) {
  const l=x-w/2,r=x+w/2,n=z-d/2,f=z+d/2,t=y+h;
  quad(out,[l,y,n],[l,y,f],[l,t,f],[l,t,n],color);
  quad(out,[r,y,f],[r,y,n],[r,t,n],[r,t,f],color);
  quad(out,[l,y,f],[r,y,f],[r,t,f],[l,t,f],color);
  quad(out,[r,y,n],[l,y,n],[l,t,n],[r,t,n],color);
  quad(out,[l,t,f],[r,t,f],[r,t,n],[l,t,n],color);
}
function cylinder(out,x,y,z,r,h,color,segments=8,topRadius=r) {
  for(let i=0;i<segments;i++) {
    const a=i*TAU/segments,b=(i+1)*TAU/segments;
    const p=[x+Math.cos(a)*r,y,z+Math.sin(a)*r],q=[x+Math.cos(b)*r,y,z+Math.sin(b)*r];
    const pt=[x+Math.cos(a)*topRadius,y+h,z+Math.sin(a)*topRadius],qt=[x+Math.cos(b)*topRadius,y+h,z+Math.sin(b)*topRadius];
    quad(out,p,pt,qt,q,color);
    triangle(out,[x,y+h,z],qt,pt,color);
  }
}
function gem(out,x,y,z,rx,ry,rz,color) {
  const p=[[x+rx,y,z],[x,y,z+rz],[x-rx,y,z],[x,y,z-rz]],top=[x,y+ry,z],bottom=[x,y-ry,z];
  for(let i=0;i<4;i++){triangle(out,top,p[(i+1)%4],p[i],color);triangle(out,bottom,p[i],p[(i+1)%4],color);}
}
function beam(out,a,b,r,color,segments=6) {
  const d=b.map((v,i)=>v-a[i]),len=Math.hypot(...d);if(len<.001)return;
  const n=d.map(v=>v/len),up=Math.abs(n[1])>.9?[1,0,0]:[0,1,0];
  let u=[n[1]*up[2]-n[2]*up[1],n[2]*up[0]-n[0]*up[2],n[0]*up[1]-n[1]*up[0]];
  const ul=Math.hypot(...u);u=u.map(v=>v/ul);
  const v=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
  const point=(base,angle)=>base.map((value,i)=>value+r*(Math.cos(angle)*u[i]+Math.sin(angle)*v[i]));
  for(let i=0;i<segments;i++){
    const aa=i*TAU/segments,bb=(i+1)*TAU/segments;
    quad(out,point(a,aa),point(b,aa),point(b,bb),point(a,bb),color);
    triangle(out,b,point(b,aa),point(b,bb),color);
  }
}
function placeModel(out,start,x,y,altitude,yaw=0,scale=1,alpha=1) {
  const c=Math.cos(yaw),s=Math.sin(yaw);
  for(let i=start;i<out.length;i+=10) {
    const px=out[i]*scale,pz=out[i+2]*scale,nx=out[i+3],nz=out[i+5];
    out[i]=x-W/2+c*px+s*pz;out[i+1]=altitude+out[i+1]*scale;out[i+2]=y-H/2-s*px+c*pz;
    out[i+3]=c*nx+s*nz;out[i+5]=-s*nx+c*nz;out[i+9]*=alpha;
  }
}

function buildTerrain(theme) {
  const out=[],stone=rgba(theme.stone),grass=rgba(theme.grass),alt=rgba(theme.alternate),water=rgba(theme.water);
  box(out,0,-19,0,480,13,640,rgba('#405b62'));
  box(out,0,-6,0,472,6,632,stone);
  box(out,0,-1,0,436,1,598,grass);
  for(let x=0;x<10;x++)for(let y=0;y<14;y++) {
    if((x+y)%2===0)box(out,-218+(x+.5)*43.6,.02,-299+(y+.5)*42.7,43.2,.12,42.3,alt);
  }
  for(const x of [-120,120]) {
    box(out,x,.18,-105,38,.2,173,rgba(theme.path));box(out,x,.18,105,38,.2,173,rgba(theme.path));
  }
  box(out,0,.4,0,438,.4,40,water);
  for(const z of [-23,23])box(out,0,.4,z,438,2,6,rgba(theme.bank));
  for(let i=0;i<13;i++)box(out,-208+i*34,.86,(i%3-1)*10,18,.12,1.7,rgba('#b8e8e6'));
  for(const x of [-229,229])box(out,x,0,0,9,11,622,stone);
  for(const z of [-311,311])box(out,0,0,z,466,11,9,stone);
  for(const x of [-229,229])for(const z of [-311,311])cylinder(out,x,0,z,10,17,STONE,6);
  for(const x of [-120,120]) {
    box(out,x,.9,0,54,3,54,WOOD);
    for(let j=-3;j<=3;j++)box(out,x,4,j*7.2,54,.9,6.5,rgba(j%2?'#ccac7e':'#ddbe91'));
    for(const side of [-1,1]) {
      box(out,x+side*28,8.5,0,3,3,57,STONE);
      for(const z of [-27,27])box(out,x+side*28,2,z,5,12,5,STONE);
    }
  }
  for(const [x,y,team]of[[40,135,'enemy'],[440,135,'enemy'],[40,505,'player'],[440,505,'player']]) {
    box(out,x-W/2,0,y-H/2,2,27,2,WOOD);
    box(out,x-W/2+7,16,y-H/2,12,10,1.4,teamColor(team));
  }
  return new Float32Array(out);
}

function towerModel(out,tower) {
  const start=out.length,r=num(tower.radius,tower.type==='king'?29:25),king=tower.type==='king',color=teamColor(tower.team);
  if(!living(tower)) {
    cylinder(out,0,0,0,r,3,rgba('#877f6c'),8);
    for(let i=0;i<6;i++)box(out,Math.cos(i*2.4)*r*.5,3,Math.sin(i*2.4)*r*.5,8,5+i%3*2,7,STONE);
  } else {
    cylinder(out,0,0,0,r+2,5,rgba('#aaa78d'),8);
    box(out,0,4,0,r*1.55,28,r*1.5,STONE);
    box(out,0,10,r*.77,r*.62,14,1.5,color);
    box(out,0,12,-r*.77,r*.62,12,1.5,color);
    box(out,0,6,r*.8,10,12,1.8,DARK);
    box(out,0,32,0,r*1.9,5,r*1.8,rgba('#eee6ca'));
    for(const sx of [-1,1])for(const sz of [-1,1])box(out,sx*r*.72,37,sz*r*.65,8,8,8,STONE);
    if(king) {
      cylinder(out,0,37,0,11,7,tower.active?color:rgba('#879391'),6,9);
      for(const [x,z]of[[-7,-4],[7,-4],[0,7]])gem(out,x,49,z,4,7,4,GOLD);
      box(out,0,43,0,16,4,15,GOLD);
    } else {
      cylinder(out,0,37,0,9,10,color,6,1);
      beam(out,[0,40,0],[0,40,18],3,DARK);
    }
    if(num(tower.hitFlash)>0)gem(out,0,33,0,r*.4,5,r*.4,rgba('#fff8d9'));
  }
  placeModel(out,start,num(tower.x),num(tower.y),0);
}

function unitAltitude(unit,time,reducedMotion) {
  const flying=Boolean(unit.flying),frozen=num(unit.stunRemaining)>0||num(unit.frostRemaining)>0;
  return flying?23+(!reducedMotion&&!frozen?Math.sin(time*4+hash(unit.id)%11)*2:0):unit.cardId==='ice_spirit'?5:0;
}
function unitScale(unit) {
  const id=unit.cardId,r=num(unit.radius,11);
  return id==='giant'?r/19:id==='cannon'?1:clamp(r/(['goblins','spear_goblins'].includes(id)?8:id==='skeletons'?7:id==='minions'?9:12),.75,1.25);
}
function unitHeight(unit) {
  const id=unit.cardId;
  const local=id==='giant'?46:id==='hog_rider'?42:id==='cannon'?23:id==='minions'?33:id==='ice_spirit'?27:
    id==='musketeer'?45:['goblins','spear_goblins','skeletons','bomber'].includes(id)?27:id==='phalanx'?43:id==='duelist'?40:35;
  return local*unitScale(unit);
}

function unitModel(out,unit,time,reducedMotion,ghost=false) {
  const start=out.length,id=unit.cardId||'knight',color=teamColor(unit.team),r=num(unit.radius,11);
  const attacking=num(unit.attackFlash)>0&&!reducedMotion&&num(unit.stunRemaining)<=0;
  const jab=attacking?num(unit.attackFlash)*3:0;
  if(id==='cannon'||unit.isBuilding||unit.kind==='building') {
    cylinder(out,0,0,0,r,5,STONE,8);cylinder(out,0,5,0,r*.65,9,color,8,10);
    beam(out,[0,14,-4],[0,16,23+jab],6,DARK,8);cylinder(out,-12,2,0,4,8,WOOD,6);cylinder(out,12,2,0,4,8,WOOD,6);
  } else if(id==='ice_spirit') {
    gem(out,0,10,0,9,12,9,rgba('#9de6f1'));gem(out,0,20,-2,5,7,4,rgba('#e2fbff'));
    box(out,-3,11,7,2,3,1,DARK);box(out,3,11,7,2,3,1,DARK);
  } else if(id==='minions') {
    gem(out,0,11,0,8,10,7,rgba('#7d97bc'));gem(out,0,21,3,7,7,7,rgba('#91abd0'));
    triangle(out,[-5,15,0],[-23,21,-6],[-13,5,5],rgba('#536d9c'));
    triangle(out,[5,15,0],[13,5,5],[23,21,-6],rgba('#536d9c'));
    gem(out,-5,28,3,2,5,2,BONE);gem(out,5,28,3,2,5,2,BONE);
    box(out,0,8,6,9,3,2,color);
  } else if(id==='hog_rider') {
    box(out,0,7,0,17,12,26,rgba('#a17b5d'));
    for(const sx of [-1,1])for(const sz of [-1,1])box(out,sx*6,0,sz*8,4,8,4,WOOD);
    gem(out,0,17,12,9,7,8,rgba('#c39b7a'));box(out,0,17,18,9,5,4,SKIN);
    cylinder(out,0,19,-3,6,11,color,6);gem(out,0,34,-3,6,7,6,rgba('#ba8665'));
    beam(out,[9,24,0],[9,37,7+jab],2,WOOD);box(out,9,35,7+jab,11,7,6,STEEL);
  } else if(id==='giant') {
    box(out,-6,0,0,8,11,10,WOOD);box(out,6,0,0,8,11,10,WOOD);
    cylinder(out,0,9,0,14,23,rgba('#c58e64'),6,12);box(out,0,12,0,27,5,22,WOOD);
    gem(out,0,36,1,10,10,9,SKIN);box(out,-17,14,2+jab,8,17,9,SKIN);box(out,17,14,2+jab,8,17,9,SKIN);
    box(out,0,23,11,18,6,2,color);
  } else {
    const goblin=id==='goblins'||id==='spear_goblins',bone=id==='skeletons'||id==='bomber';
    const small=goblin||bone,head=bone?BONE:goblin?GREEN:SKIN,body=bone?BONE:id==='duelist'?DARK:color;
    const height=small?12:17,leg=small?5:7,headY=height+leg+4;
    box(out,-3,0,0,4,leg,5,bone?BONE:WOOD);box(out,3,0,0,4,leg,5,bone?BONE:WOOD);
    cylinder(out,0,leg,0,small?5.5:7,height,body,6,small?5:6);
    gem(out,0,headY,1,small?6:7,small?6:7,6,head);
    box(out,-8,leg+4,jab,3,10,4,head);box(out,8,leg+4,jab,3,10,4,head);
    if(goblin) {
      triangle(out,[-4,headY,1],[-12,headY+2,-2],[-5,headY+5,-2],GREEN);
      triangle(out,[4,headY,1],[5,headY+5,-2],[12,headY+2,-2],GREEN);
    }
    if(['knight','duelist','phalanx'].includes(id)) {
      cylinder(out,0,headY+1,0,7.5,6,STEEL,6,6);box(out,0,headY,6.1,11,4,2,DARK);
      if(id!=='knight')box(out,0,headY+7,-1,2,5,9,GOLD);
      if(id==='duelist') {box(out,-10,leg+height-3,0,7,6,8,STEEL);box(out,10,leg+height-3,0,7,6,8,STEEL);}
      const shieldWall=id==='phalanx'&&Boolean(unit.formationProtected),shieldX=shieldWall?0:-9,shieldZ=shieldWall?8:5;
      box(out,shieldX,8,shieldZ,shieldWall?14:8,id==='phalanx'?17:12,3,color);
      box(out,shieldX,12,shieldZ+1.7,2,5,1,GOLD);
      if(shieldWall)box(out,0,23,8,14,2,3,STEEL);
    }
    if(id==='archers') {
      cylinder(out,0,headY+2,-1,7.5,5,rgba('#a27da5'),6,5);
      beam(out,[10,5,4],[13,14,7],1.1,WOOD);beam(out,[13,14,7],[10,23,4],1.1,WOOD);beam(out,[10,5,4],[10,23,4],.35,BONE);
    } else if(id==='musketeer') {
      cylinder(out,0,headY+1,0,8,5,STEEL,6);gem(out,3,headY+10,-3,3,7,3,rgba('#b786ae'));
      beam(out,[8,13,-3],[8,15,20+jab],2.4,DARK);box(out,8,10,0,5,5,10,WOOD);
    } else if(id==='bomber') {
      cylinder(out,0,headY+2,0,7,3,DARK,6);gem(out,10,12,7+jab,7,7,7,DARK);beam(out,[10,18,7],[13,21,7],1,GOLD);
    } else if(id==='spear_goblins'||id==='phalanx') {
      if(id==='phalanx'&&unit.formationState==='charge') {
        beam(out,[7,14,-5],[7,15,28+jab],.9,WOOD);gem(out,7,15,30+jab,2,2,5,STEEL);
      } else {
        beam(out,[7,4,-3],[7,small?31:37,10+jab],.9,WOOD);gem(out,7,small?32:38,10+jab,2,5,2,STEEL);
      }
    } else if(id==='valkyrie') {
      cylinder(out,0,headY,-1,8,8,rgba('#d99558'),6,5);
      beam(out,[10,4,2],[10,29,5+jab],1.3,WOOD);box(out,10,23,5+jab,13,7,3,STEEL);
    } else {
      beam(out,[8,10,3],[9,small?24:32,8+jab],id==='duelist'?2.7:1.4,STEEL);
      box(out,8,11,4,8,2,2,GOLD);
    }
  }
  const frozen=num(unit.frostRemaining)>0,deploying=num(unit.deployRemaining)>0;
  if(frozen)for(let i=0;i<3;i++)gem(out,Math.cos(i*TAU/3)*r,5,Math.sin(i*TAU/3)*r,3,9,3,rgba('#c5f5ff'));
  const yaw=Math.PI/2-num(unit.facing,own(unit.team)?-Math.PI/2:Math.PI/2);
  placeModel(out,start,num(unit.x),num(unit.y),unitAltitude(unit,time,reducedMotion),yaw,unitScale(unit),ghost?.42:deploying?.58:1);
}

function projectileModel(out,p) {
  const x=num(p.x)-W/2,z=num(p.y)-H/2,r=clamp(num(p.radius,3),1.5,6),kind=p.kind||p.type;
  if(kind==='arrow'||kind==='spear'||['archers','spear_goblins'].includes(p.cardId)) {
    const dx=num(p.tx,p.x)-num(p.x),dz=num(p.ty,p.y-1)-num(p.y),d=Math.hypot(dx,dz)||1;
    beam(out,[x-dx/d*8,15,z-dz/d*8],[x+dx/d*5,15,z+dz/d*5],.9,STONE);
    gem(out,x+dx/d*5,15,z+dz/d*5,2,2,2,STEEL);
  } else gem(out,x,kind==='bomb'?20:16,z,r,r,r,kind==='bomb'?DARK:rgba('#ffe9a0'));
}

function progress(effect) {
  const duration=Math.max(.01,num(effect.maxLife,num(effect.duration,.5)));
  return effect.life!=null?clamp(1-num(effect.life)/duration,0,1):clamp(num(effect.age)/duration,0,1);
}

function effectModel(out,e,time,reducedMotion) {
  const type=e.type||e.kind,p=progress(e);if(p>=1||type==='damage'||type==='announcement')return;
  const start=out.length,r=clamp(num(e.radius,10),3,100),seed=hash(e.id),fade=1-p;
  const color=type==='freeze'||e.cardId==='ice_spirit'?rgba('#b9f1ff',fade*.7):e.cardId==='poison'?rgba('#c7dc99',fade*.35):rgba('#ffdba0',fade*.8);
  if(type==='cast'&&e.cardId==='fireball')gem(out,0,reducedMotion?18:15+55*(1-p),0,9,12,9,rgba('#ffba68',.9));
  else if(e.cardId==='zap'||type==='stun') {
    for(let i=0;i<3;i++){const x=(i-1)*r*.45;beam(out,[x,2,0],[x+5,15,5],1.2,color);beam(out,[x+5,15,5],[x-3,32,0],1.2,color);}
  } else if(type==='spell'&&e.cardId==='arrows') {
    for(let i=0;i<9;i++) {const a=i*2.4,d=r*(.2+(i%3)*.23),x=Math.cos(a)*d,z=Math.sin(a)*d,h=reducedMotion?7:9+(1-p)*28;
      beam(out,[x-3,h+8,z],[x,h,z+2],.8,STONE);}
  } else if(type==='spell'||type==='freeze'||type==='towerDown'||type==='death'||type==='hit') {
    const count=type==='hit'?3:7;
    for(let i=0;i<count;i++) {const a=i*TAU/count+(seed%17)*.1,d=r*(.25+p*.75);
      gem(out,Math.cos(a)*d,reducedMotion?4:4+Math.sin(p*Math.PI)*15,Math.sin(a)*d,3+fade*3,4+fade*4,3+fade*3,color);}
    if(e.cardId==='fireball')gem(out,0,10,0,r*(.25+fade*.2),12+fade*12,r*(.25+fade*.2),rgba('#ffc773',fade*.55));
  } else if(type==='kingActive')gem(out,0,59,0,7,9,7,rgba('#ffe094',fade));
  placeModel(out,start,num(e.x),num(e.y),0);
}

function placementPreview(game,card,pointer,team='player') {
  const id=card.id||card.cardId,x=pointer.x,y=pointer.y;
  if(!Number.isFinite(x)||!Number.isFinite(y))return {ok:false,team,x:num(x),y:num(y),positions:[],affectedTargets:[]};
  if(typeof game?.previewDeployment==='function') {
    const result=game.previewDeployment(team,id,x,y);
    return {...result,team,x,y,positions:list(result?.positions),affectedTargets:list(result?.affectedTargets)};
  }
  const result=typeof game?.canDeploy==='function'?game.canDeploy(team,id,x,y):{ok:pointer.valid!==false};
  const r=num(card.radius,11),count=Math.max(1,num(card.count,1));
  const positions=spell(card)?[]:Array.from({length:count},(_,i)=>({x:x+(count===1?0:(i%3-1)*r*2.4),
    y:y+(count>3?Math.floor(i/3)*r*2.4:0)*(team==='enemy'?-1:1),radius:r,flying:Boolean(card.flying)}));
  return {...result,team,x,y,positions,affectedTargets:[]};
}

const VERTEX_SHADER=`
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec4 a_color;
uniform mat4 u_viewProjection;
varying lowp vec4 v_color;
void main() {
  vec3 sunlight=normalize(vec3(-0.35,0.85,0.45));
  float light=0.48+0.52*max(dot(normalize(a_normal),sunlight),0.0);
  v_color=vec4(a_color.rgb*light,a_color.a);
  gl_Position=u_viewProjection*vec4(a_position,1.0);
}`;
const FRAGMENT_SHADER=`
precision mediump float;
varying lowp vec4 v_color;
void main() { gl_FragColor=v_color; }
`;

/** The input/HUD canvas must have a transparent 2D context; WebGL sits below it. */
export class ArenaRenderer3D {
  constructor(hudCanvas,glCanvas,{onContextLost=null}={}) {
    if(!hudCanvas?.getContext||!glCanvas?.getContext||hudCanvas===glCanvas)throw new TypeError('3D rendering needs separate HUD and WebGL canvases.');
    this.canvas=hudCanvas;this.glCanvas=glCanvas;this.onContextLost=onContextLost;
    this.ctx=hudCanvas.getContext('2d',{alpha:true});
    if(!this.ctx)throw new Error('Canvas 2D HUD is not available.');
    if(this.ctx.getContextAttributes?.()?.alpha===false)throw new Error('3D rendering requires a transparent HUD canvas.');
    this.gl=glCanvas.getContext('webgl',{alpha:false,antialias:true,depth:true,premultipliedAlpha:false})||
      glCanvas.getContext('experimental-webgl',{alpha:false,antialias:true,depth:true,premultipliedAlpha:false});
    if(!this.gl)throw new Error('WebGL is not available.');
    this.orientation='portrait';this.camera=createCamera(this.orientation);this.viewWidth=W;this.viewHeight=H;
    this.width=W;this.height=H;this.scale=1;this.offsetX=0;this.offsetY=0;this.dpr=1;
    this.contextLost=false;this.destroyed=false;this.arenaTheme='grove';this.terrainCache=new Map();
    this._uploadedTheme=null;this._shaders=[];this._buffers=[];this.stats={drawCalls:0,triangles:0};
    this._sceneTime=0;this._sceneReducedMotion=true;
    this.resize=this.resize.bind(this);
    this._onLost=event=>{event?.preventDefault?.();this.contextLost=true;if(typeof this.onContextLost==='function')this.onContextLost();};
    this._onRestored=()=>{
      if(this.destroyed)return;
      this._shaders=[];this._buffers=[];this.program=null;
      try {this._initGL();this._uploadedTheme=null;this.contextLost=false;this.resize();}
      catch {this.contextLost=true;this._releaseGL();}
    };
    try {
      this._initGL();this.resize();
      glCanvas.addEventListener?.('webglcontextlost',this._onLost,false);
      glCanvas.addEventListener?.('webglcontextrestored',this._onRestored,false);
      if(typeof ResizeObserver!=='undefined'){this.observer=new ResizeObserver(this.resize);this.observer.observe(hudCanvas);}
      else if(typeof window!=='undefined')window.addEventListener('resize',this.resize,{passive:true});
    } catch(error){this.destroy();throw error;}
  }

  _initGL() {
    const gl=this.gl;
    const compile=(type,source)=>{
      const shader=gl.createShader(type);if(!shader)throw new Error('Could not allocate a WebGL shader.');
      this._shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(`WebGL shader compilation failed: ${gl.getShaderInfoLog(shader)||'unknown error'}`);
      return shader;
    };
    const vertex=compile(gl.VERTEX_SHADER,VERTEX_SHADER),fragment=compile(gl.FRAGMENT_SHADER,FRAGMENT_SHADER);
    this.program=gl.createProgram();if(!this.program)throw new Error('Could not allocate a WebGL program.');
    gl.attachShader(this.program,vertex);gl.attachShader(this.program,fragment);gl.linkProgram(this.program);
    if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw new Error(`WebGL program linking failed: ${gl.getProgramInfoLog(this.program)||'unknown error'}`);
    this._attributes={position:gl.getAttribLocation(this.program,'a_position'),normal:gl.getAttribLocation(this.program,'a_normal'),color:gl.getAttribLocation(this.program,'a_color')};
    this._matrixLocation=gl.getUniformLocation(this.program,'u_viewProjection');
    for(let i=0;i<3;i++){const buffer=gl.createBuffer();if(!buffer)throw new Error('Could not allocate a WebGL buffer.');this._buffers.push(buffer);}
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  }

  _releaseGL() {
    const gl=this.gl;if(!gl)return;
    for(const buffer of this._buffers||[])gl.deleteBuffer?.(buffer);
    for(const shader of this._shaders||[])gl.deleteShader?.(shader);
    if(this.program)gl.deleteProgram?.(this.program);
    this._buffers=[];this._shaders=[];this.program=null;
  }

  resize() {
    if(this.destroyed)return;
    const rect=surfaceRect(this.canvas,this.camera);
    this.width=rect.width;this.height=rect.height;this.scale=rect.scale;this.offsetX=rect.offsetX;this.offsetY=rect.offsetY;
    this.viewWidth=this.camera.width;this.viewHeight=this.camera.height;
    this.dpr=clamp(typeof window!=='undefined'?num(window.devicePixelRatio,1):1,1,3);
    const w=Math.max(1,Math.round(rect.width*this.dpr)),h=Math.max(1,Math.round(rect.height*this.dpr));
    for(const surface of [this.canvas,this.glCanvas]){if(surface.width!==w)surface.width=w;if(surface.height!==h)surface.height=h;}
    this.ctx.imageSmoothingEnabled=true;
  }

  setOrientation(value) {this.orientation=mode(value);this.camera=createCamera(this.orientation);this.resize();return this;}

  worldToScreen(x,y) {
    const rect=surfaceRect(this.canvas,this.camera),p=projectGround(x,y,this.camera);
    return {x:rect.offsetX+p.x*rect.scale,y:rect.offsetY+p.y*rect.scale};
  }

  screenToWorld(clientX,clientY) {
    const rect=surfaceRect(this.canvas,this.camera);
    return unprojectGround((num(clientX)-rect.left-rect.offsetX)/rect.scale,(num(clientY)-rect.top-rect.offsetY)/rect.scale,this.camera);
  }

  /** Inspect visible models without changing the ground-plane deployment pick.
   * A cheap projected bound rejects distant objects, then the actual low-poly
   * triangles choose the closest surface, including elevated heads and wings.
   */
  pickEntity(clientX,clientY,entities) {
    if(!Number.isFinite(clientX)||!Number.isFinite(clientY))return null;
    const rect=surfaceRect(this.canvas,this.camera),cx=clientX-rect.left,cy=clientY-rect.top;
    if(cx<0||cy<0||cx>=rect.width||cy>=rect.height)return null;
    const px=(cx-rect.offsetX)/rect.scale,py=(cy-rect.offsetY)/rect.scale;
    if(px<0||py<0||px>this.camera.width||py>this.camera.height)return null;
    let selected=null,closest=Infinity;
    for(const entity of list(entities)) {
      if(!entity||!Number.isFinite(entity.hp)||entity.hp<=0||entity.destroyed||
        !Number.isFinite(entity.x)||!Number.isFinite(entity.y))continue;
      const tower=entity.type==='king'||entity.type==='princess';
      if(!tower&&(!entity.cardId||spell({id:entity.cardId,type:entity.type})))continue;
      const altitude=tower?0:unitAltitude(entity,this._sceneTime,this._sceneReducedMotion);
      const height=tower?(entity.type==='king'?56:48):unitHeight(entity);
      const radius=tower?num(entity.radius,29)+4:Math.max(num(entity.radius,11)*1.6,entity.cardId==='minions'?24*unitScale(entity):0);
      const bottom=this._point(entity.x,entity.y,altitude),top=this._point(entity.x,entity.y,altitude+height);
      if(px<bottom.x-radius||px>bottom.x+radius||py<top.y-radius||py>bottom.y+radius)continue;
      const vertices=[];
      if(tower)towerModel(vertices,entity);else unitModel(vertices,entity,this._sceneTime,this._sceneReducedMotion);
      for(let i=0;i<vertices.length;i+=30) {
        const points=[];
        for(let j=0;j<3;j++) {
          const k=i+j*10,v=transformPoint(this.camera.viewProjection,vertices[k],vertices[k+1],vertices[k+2]);
          points.push([(v[0]+1)*this.camera.width/2,(1-v[1])*this.camera.height/2,v[2]]);
        }
        const [a,b,c]=points,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
        if(Math.abs(den)<1e-8)continue;
        const wa=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den;
        const wb=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den,wc=1-wa-wb;
        if(Math.min(wa,wb,wc)<-1e-7)continue;
        const depth=wa*a[2]+wb*b[2]+wc*c[2];
        if(depth<closest){closest=depth;selected=entity;}
      }
    }
    return selected;
  }

  _point(x,y,height=0){return projectGround(x,y,this.camera,height);}

  _batch(buffer,data,usage,upload=true) {
    if(!data.length)return;
    const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    if(upload)gl.bufferData(gl.ARRAY_BUFFER,data,usage);
    for(const [key,size,offset]of[['position',3,0],['normal',3,12],['color',4,24]]) {
      const location=this._attributes[key];if(location<0)continue;
      gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,40,offset);
    }
    gl.drawArrays(gl.TRIANGLES,0,data.length/10);this.stats.drawCalls++;this.stats.triangles+=data.length/30;
  }

  draw(game,{selectedCard=null,pointer=null,showRanges=false,reducedMotion=false,hoveredEntityId=null,
    selectedEntityId=null,trainingTarget=null,arenaTheme='grove',deploymentTeam='player'}={}) {
    if(this.destroyed)throw new Error('3D renderer has been destroyed.');
    if(this.contextLost||this.gl.isContextLost?.())throw new Error('WebGL context lost.');
    const rect=surfaceRect(this.canvas,this.camera),dpr=clamp(typeof window!=='undefined'?num(window.devicePixelRatio,1):1,1,3);
    if(rect.width!==this.width||rect.height!==this.height||dpr!==this.dpr)this.resize();
    const state=game?.state||game||{},t=num(state.time),motionTime=reducedMotion?0:t;
    deploymentTeam=deploymentTeam==='enemy'?'enemy':'player';
    const developer=selectedCard?game?.getDeveloperState?.():null;
    const freePlacement=Boolean(developer?.enabled&&developer.cheats?.freePlacement);
    this._sceneTime=motionTime;this._sceneReducedMotion=reducedMotion;
    const themeId=themeName(arenaTheme),theme=THEMES[themeId];this.arenaTheme=themeId;
    if(!this.terrainCache.has(themeId))this.terrainCache.set(themeId,buildTerrain(theme));
    const terrain=this.terrainCache.get(themeId),solid=[],transparent=[];
    const towers=list(state.towers),units=list(state.units).filter(living),areas=list(state.areas);
    for(const tower of towers)towerModel(solid,tower);
    for(const unit of units)unitModel(num(unit.deployRemaining)>0?transparent:solid,unit,motionTime,reducedMotion);
    for(const unit of units)if(unit.cardId==='phalanx'&&unit.formationState==='charge'&&num(unit.chargeRemaining)>0) {
      const angle=num(unit.facing),dx=Math.cos(angle),dz=Math.sin(angle),x=num(unit.x)-W/2,z=num(unit.y)-H/2;
      const color=[...teamColor(unit.team).slice(0,3),.45];
      for(const side of [-1,1])beam(transparent,[x-dx*7-dz*side*3,2,z-dz*7+dx*side*3],
        [x-dx*(reducedMotion?16:21)-dz*side*3,2,z-dz*(reducedMotion?16:21)+dx*side*3],.7,color,4);
    }
    for(const projectile of list(state.projectiles))projectileModel(solid,projectile);
    for(const area of areas) {
      if(area.life!=null&&num(area.life)<=0)continue;
      const x=num(area.x)-W/2,z=num(area.y)-H/2,r=num(area.radius,60);
      cylinder(transparent,x,1,z,r,1.3,rgba('#a4a288',.20),24);
      for(let i=0;i<5;i++){const a=i*2.4,d=r*.48;gem(transparent,x+Math.cos(a)*d,3+(reducedMotion?0:Math.sin(motionTime+i)*1.5),z+Math.sin(a)*d,r*.18,4,r*.18,rgba('#bdce8f',.16));}
    }
    for(const effect of list(state.effects))effectModel(transparent,effect,motionTime,reducedMotion);
    const preview=selectedCard&&pointer?placementPreview(game,selectedCard,pointer,deploymentTeam):null;
    if(preview&&!spell(selectedCard))for(const [i,position]of preview.positions.entries())unitModel(transparent,
      {...selectedCard,...position,id:`ghost-${i}`,cardId:selectedCard.id||selectedCard.cardId,team:deploymentTeam,
        facing:deploymentTeam==='enemy'?Math.PI/2:-Math.PI/2},motionTime,true,true);
    const gl=this.gl,background=rgba(theme.background);
    gl.viewport(0,0,this.glCanvas.width,this.glCanvas.height);gl.clearColor(...background);gl.clearDepth(1);
    gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
    const matrix=new Float32Array(this.camera.viewProjection);
    const clipX=this.camera.width*this.scale/this.width,clipY=this.camera.height*this.scale/this.height;
    for(let i=0;i<4;i++){matrix[i*4]*=clipX;matrix[i*4+1]*=clipY;}
    gl.uniformMatrix4fv(this._matrixLocation,false,matrix);
    this.stats={drawCalls:0,triangles:0};
    this._batch(this._buffers[0],terrain,gl.STATIC_DRAW,this._uploadedTheme!==themeId);this._uploadedTheme=themeId;
    this._batch(this._buffers[1],new Float32Array(solid),gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND);gl.depthMask(false);
    this._batch(this._buffers[2],new Float32Array(transparent),gl.DYNAMIC_DRAW);
    gl.depthMask(true);gl.disable(gl.BLEND);
    this._drawHUD(game,state,{selectedCard,preview,showRanges,reducedMotion,hoveredEntityId,selectedEntityId,trainingTarget,deploymentTeam,freePlacement});
  }

  _line(points,color,width=1.5,dash=[]) {
    if(points.length<2)return;
    const ctx=this.ctx;ctx.save();ctx.setLineDash(dash);ctx.beginPath();
    points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();ctx.restore();
  }

  _ring(x,y,r,color,width=1.5,fill=null,dash=[],fraction=1) {
    const ctx=this.ctx,steps=Math.max(3,Math.ceil(48*fraction));ctx.save();ctx.setLineDash(dash);ctx.beginPath();
    for(let i=0;i<=steps;i++) {
      const a=-Math.PI/2+i/steps*TAU*fraction,p=this._point(x+Math.cos(a)*r,y+Math.sin(a)*r,.8);
      if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);
    }
    if(fraction>=1)ctx.closePath();
    if(fill){ctx.fillStyle=fill;ctx.fill();}ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();ctx.restore();
  }

  _polygon(points,fill,stroke=null) {
    const ctx=this.ctx;ctx.save();ctx.beginPath();points.forEach(([x,y],i)=>{const p=this._point(x,y,.6);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});
    ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}ctx.restore();
  }

  _plate(text,x,y,{color='#fff1ce',background='rgba(24,44,52,.91)',size=10,accent=null}={}) {
    const ctx=this.ctx;ctx.save();ctx.font=`700 ${size}px ${FONT}`;
    const width=Math.max(24,Math.min(this.viewWidth-16,num(ctx.measureText(String(text))?.width,String(text).length*size*.65)+14));
    x=clamp(x,width/2+5,this.viewWidth-width/2-5);y=clamp(y,12,this.viewHeight-12);
    ctx.fillStyle=background;ctx.beginPath();ctx.roundRect?ctx.roundRect(x-width/2,y-9,width,18,5):ctx.rect(x-width/2,y-9,width,18);ctx.fill();
    if(accent){ctx.strokeStyle=accent;ctx.lineWidth=.8;ctx.stroke();}
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(String(text),x,y+.3);ctx.restore();
  }

  _health(entity,height,focused,game) {
    if(!living(entity))return;
    const ctx=this.ctx,p=this._point(num(entity.x),num(entity.y),height+5),tower=entity.type==='king'||entity.type==='princess';
    const width=tower?49:clamp(num(entity.radius,10)*2.2,23,37),x=clamp(p.x,width/2+5,this.viewWidth-width/2-5),y=clamp(p.y-7,13,this.viewHeight-15);
    const ratio=clamp(num(entity.hp)/Math.max(1,num(entity.maxHp,entity.hp)),0,1);
    ctx.fillStyle='rgba(16,34,43,.9)';ctx.fillRect(x-width/2-1,y-1,width+2,6);
    ctx.fillStyle=ratio<=.25?'#ffc27c':teamHex(entity.team);ctx.fillRect(x-width/2,y,Math.max(.2,width*ratio),4);
    if(tower)this._plate(String(Math.max(0,Math.ceil(num(entity.hp)))),x,y-12,{size:10,accent:ratio<=.25?'#ffc27c':null});
    if(focused) {
      const name=tower?(entity.type==='king'?'킹 타워':'수비 타워'):game?.getCard?.(entity.cardId,entity.team)?.name||game?.cards?.[entity.cardId]?.name||CARD_NAMES[entity.cardId]||entity.cardId||'병력';
      this._plate(`${name} · ${Math.ceil(num(entity.hp))} / ${Math.ceil(num(entity.maxHp,entity.hp))}`,x,y-27,{size:10,accent:'#edca77'});
      if(num(entity.lifetime)>0)this._plate(`${Math.ceil(entity.lifetime)}s`,x,y+13,{size:9});
    }
    const status=num(entity.frostRemaining)>0?'동결':num(entity.stunRemaining)>0?'기절':num(entity.slowRemaining)>0?'감속':null;
    if(status)this._plate(status,x+width/2+13,y-11,{size:8,color:status==='동결'?'#b6efff':status==='기절'?'#ffe6a4':'#d5eda7'});
  }

  _drawHUD(game,state,options) {
    const ctx=this.ctx,{selectedCard,preview,showRanges,reducedMotion,hoveredEntityId,selectedEntityId,trainingTarget,deploymentTeam='player',freePlacement=false}=options;
    // The facade shares this context with the 2D renderer. Reset all persistent
    // drawing state and clear to transparency before painting the 3D HUD.
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    ctx.setLineDash([]);ctx.lineDashOffset=0;ctx.setTransform(this.dpr*this.scale,0,0,this.dpr*this.scale,this.dpr*this.offsetX,this.dpr*this.offsetY);
    ctx.save();ctx.beginPath();ctx.rect(0,0,this.viewWidth,this.viewHeight);ctx.clip();
    const towers=list(state.towers),units=list(state.units),entities=[...towers,...units],alive=entities.filter(living);
    if(selectedCard) {
      const home=deploymentTeam!=='enemy',tint=home?'rgba(92,196,219,.075)':'rgba(239,132,112,.075)';
      const upper=[[22,21],[458,21],[458,300],[22,300]],lower=[[22,340],[458,340],[458,619],[22,619]];
      if(spell(selectedCard))this._polygon([[22,21],[458,21],[458,619],[22,619]],home?'rgba(237,204,128,.025)':'rgba(239,132,112,.045)');
      else {
        this._polygon(home?lower:upper,tint);
        this._polygon(home?upper:lower,freePlacement?tint:'rgba(16,35,45,.12)');
        if(!freePlacement)for(const tower of towers)if(tower.team!==deploymentTeam&&tower.type!=='king'&&!living(tower)) {
          const x=num(tower.x),top=home?115:340,bottom=home?300:525;
          this._polygon([[x-77,top],[x+77,top],[x+77,bottom],[x-77,bottom]],home?'rgba(92,196,219,.09)':'rgba(239,132,112,.09)');
        }
        if(!freePlacement)this._line([this._point(24,home?345:295),this._point(456,home?345:295)],home?'rgba(197,244,238,.65)':'rgba(255,193,172,.65)',1.2,[5,6]);
      }
    }
    const byId=new Map(alive.map(e=>[e.id,e]));
    for(const entity of alive) {
      const focused=entity.id===selectedEntityId,hovered=entity.id===hoveredEntityId,r=num(entity.radius,10);
      const entityRange=num(entity.range,num(entity.attackRange));
      if((showRanges||focused||hovered)&&entityRange>0&&entity.active!==false) {
        const reach=entity.splashOrigin==='self'&&num(entity.splashRadius)>0?Math.min(entityRange+r,num(entity.splashRadius)):entityRange+r;
        this._ring(entity.x,entity.y,reach,own(entity.team)?'rgba(108,208,230,.32)':'rgba(255,168,144,.3)',1,null,[4,6]);
      }
      this._ring(entity.x,entity.y,r+1,entity.formationProtected?'#d6f5fb':teamHex(entity.team),entity.formationProtected?1.6:1,'rgba(18,32,39,.08)',own(entity.team)?[]:[3,3]);
      if(focused||hovered)this._ring(entity.x,entity.y,r+(focused?7:5),focused?'#f7d580':'#fff0b5',focused?2.2:1.5);
      if((focused||hovered)&&entity.cardId==='phalanx'&&entity.formationState) {
        const label={forming:'집결',guard:'방진',charge:'돌격',regroup:'재집결'}[entity.formationState];
        if(label){const p=this._point(entity.x,entity.y);this._plate(label,p.x,p.y+23,{size:9,accent:teamHex(entity.team)});}
      }
      const target=byId.get(entity.targetId);
      if(target&&(showRanges||focused||hovered)) {
        this._line([this._point(entity.x,entity.y,1),this._point(target.x,target.y,1)],focused?'#ffe5a2':'rgba(248,230,174,.42)',1,[3,4]);
        this._ring(target.x,target.y,4,'#ffe5a2',1);
      }
      if(num(entity.deployRemaining)>0) {
        const duration=num(entity.deployDuration),remaining=num(entity.deployRemaining);
        this._ring(entity.x,entity.y,r+5,'rgba(253,232,173,.35)',3);
        if(duration>0)this._ring(entity.x,entity.y,r+5,'#ffe3a0',2,null,[],clamp(1-remaining/duration,.001,1));
        else {const p=this._point(entity.x,entity.y);this._plate(`${remaining.toFixed(1)}s`,p.x,p.y+17,{size:9});}
      }
    }
    for(const area of list(state.areas)) {
      if(area.life!=null&&num(area.life)<=0)continue;
      const r=num(area.radius,60),p=this._point(area.x,area.y+r,2),life=Math.max(0,num(area.life,8));
      this._ring(area.x,area.y,r,own(area.team)?'#b6e5af':'#f3bf99',1.6,'rgba(180,205,122,.06)',own(area.team)?[]:[5,4]);
      this._ring(area.x,area.y,r+2,own(area.team)?'#a8edcc':'#ffbd95',2,null,[],clamp(life/Math.max(.01,num(area.maxLife,8)),0,1));
      this._plate(`${Math.ceil(life)}s`,p.x,p.y+9,{size:10,color:'#e9f6d0'});
    }
    if(trainingTarget&&Number.isFinite(trainingTarget.x)&&Number.isFinite(trainingTarget.y)) {
      this._ring(trainingTarget.x,trainingTarget.y,clamp(num(trainingTarget.radius,28),8,180),'#f6dfa3',1.5,'rgba(255,226,139,.04)',[3,5]);
      const p=this._point(trainingTarget.x,trainingTarget.y);this._plate(String(trainingTarget.label||'목표 위치').slice(0,24),p.x,p.y-31,{accent:'#f6dfa3'});
    }
    for(const effect of list(state.effects)) {
      const type=effect.type||effect.kind,p=progress(effect);if(p>=1)continue;
      if(type==='cast'||type==='spell'||type==='freeze'||type==='poisonTick') {
        this._ring(num(effect.x),num(effect.y),Math.max(5,num(effect.radius,15)),
          effect.cardId==='poison'?'rgba(212,236,160,.6)':effect.cardId==='zap'?'#cff6ff':teamHex(effect.team),type==='cast'?1.5:1,
          null,type==='cast'?[4,4]:[]);
      }
      if(type==='announcement'&&effect.text){const point=this._point(effect.x,effect.y);this._plate(effect.text,point.x,point.y,{size:16,accent:'#f1cf83'});}
    }
    for(const tower of towers)this._health(tower,tower.type==='king'?55:47,tower.id===selectedEntityId||tower.id===hoveredEntityId,game);
    for(const unit of units)this._health(unit,unitHeight(unit)+unitAltitude(unit,num(state.time),reducedMotion),unit.id===selectedEntityId||unit.id===hoveredEntityId,game);
    this._drawDamage(list(state.effects),num(state.time),reducedMotion);
    if(preview)this._drawPreview(selectedCard,preview);
    ctx.restore();
  }

  _drawDamage(effects,time,reducedMotion) {
    const groups=new Map();
    for(const e of effects)if((e.type||e.kind)==='damage'&&num(e.amount)>0&&progress(e)<1) {
      const key=`${e.targetTeam||e.team}:${Math.round(num(e.x)/45)}:${Math.round(num(e.y)/45)}:${Math.floor((time-num(e.age))*5)}`;
      if(groups.has(key)){const g=groups.get(key);g.amount+=num(e.amount);g.count++;}
      else groups.set(key,{...e,amount:num(e.amount),count:1});
    }
    let count=0;
    for(const e of groups.values()) {
      if(count++>=8)break;
      const p=this._point(e.x,e.y,22+(reducedMotion?0:progress(e)*18));
      this._plate(`−${Math.min(9999,Math.ceil(e.amount))}`,p.x,p.y,{color:own(e.targetTeam)?'#ffc5ac':'#ffeda9',size:e.amount>=250?13:11,background:'rgba(26,43,49,.76)'});
    }
  }

  _drawPreview(card,preview) {
    const valid=Boolean(preview.ok),home=preview.team!=='enemy',color=valid?home?'#ddf5b6':'#ffb8a5':'#ffb49b',id=card.id||card.cardId;
    const radius=spell(card)?num(card.spellRadius,num(card.radius,55)):num(card.radius,11)+6;
    this._ring(preview.x,preview.y,radius,color,1.7,valid?home?'rgba(157,230,158,.08)':'rgba(239,132,112,.09)':'rgba(239,114,99,.09)',[4,4]);
    const p=this._point(preview.x,preview.y),ctx=this.ctx;
    this._line([{x:p.x-5,y:p.y},{x:p.x+5,y:p.y}],color,1.3);this._line([{x:p.x,y:p.y-5},{x:p.x,y:p.y+5}],color,1.3);
    if(!spell(card)) {
      for(const position of preview.positions) {
        this._ring(position.x,position.y,num(position.radius,num(card.radius,11)),color,1.2);
        if(card.type==='building'&&num(card.range)>0)this._ring(position.x,position.y,num(card.range)+num(card.radius),color,1,null,[3,6]);
      }
      if(preview.positions.length>1)this._plate(`×${preview.positions.length}`,p.x+22,p.y-19,{color,accent:color});
    } else if(valid) {
      for(const target of preview.affectedTargets) {
        this._ring(target.x,target.y,num(target.radius,10)+4,home?'#fff0b1':'#ffc3ae',1.5);
        if(target.kind==='tower'||target.type==='king'||target.type==='princess') {
          const point=this._point(target.x,target.y,58),damage=Math.ceil(Math.max(0,num(target.damage)));
          this._plate(`−${damage}${card.persistent?'/초':''}`,point.x,point.y-20,{color:'#fff0b1',size:10});
        }
      }
      const top=this._point(preview.x,preview.y-radius);
      this._plate(`현재 위치 · ${preview.affectedTargets.length} 대상`,top.x,top.y-12,{size:10,color});
    }
    if(!valid)this._plate('배치 불가',p.x,p.y-26,{color:'#ffd4bd',background:'rgba(113,54,48,.94)',accent:'#f6ae94'});
  }

  destroy() {
    if(this.destroyed)return;this.destroyed=true;
    this.observer?.disconnect();
    if(typeof window!=='undefined')window.removeEventListener('resize',this.resize);
    this.glCanvas?.removeEventListener?.('webglcontextlost',this._onLost,false);
    this.glCanvas?.removeEventListener?.('webglcontextrestored',this._onRestored,false);
    this._releaseGL();this.terrainCache?.clear();
  }
}
