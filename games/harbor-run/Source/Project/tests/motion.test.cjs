/* Rig math and contact invariants against the production code; no duplicate model. */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),ctx={console,Float32Array,Math};ctx.window=ctx;vm.createContext(ctx);
for(const name of ['engine.js','data.js','motion.js','models.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,'src',name),'utf8'),ctx);
const M=ctx.HM,A=ctx.HarborMotion,checks=[];
function check(name,ok,detail){checks.push({name,pass:!!ok,detail});console.log((ok?'PASS ':'FAIL ')+name);}
const len=v=>Math.hypot(...v),sub=(a,b)=>a.map((v,i)=>v-b[i]);
function actor(yaw=0){let a={type:'player',pos:[0,0,0],yaw,hp:100,grounded:true,weapon:2,vel:[0,0,0],aim:false};A.reset(a);return a;}
for(let i=0;i<8;i++){
 const yaw=i*Math.PI/4,f=[Math.sin(yaw),0,-Math.cos(yaw)],v=M.transform(A.root([0,0,0],yaw),[0,0,-1]).slice(0,3);
 check('Mesh forward agrees with gameplay heading '+i,M.dot(v,f)>.99999);
 const a=actor(yaw),p=[.27,.8,-.51],back=A.toLocal(a,A.toWorld(a,p));check('Local/world round trip '+i,len(sub(p,back))<1e-7);
 // Test actual emitted car headlights, not just a helper method.
 const calls=[],r={};for(const name of ['box','cylinder','sphere'])r[name]=(p,s,c,rot=[0,0,0],parent)=>{let m=M.compose(p,rot,s);if(parent)m=M.mm(parent,m);calls.push({p,s,c,m});};
 new ctx.HarborModels(r).car({x:0,z:0,yaw,hp:100,color:0x555555,kind:'coupe'},0);
 const lights=calls.filter(q=>q.p[2]===-2.067),mean=[0,0,0];for(const q of lights)for(let k=0;k<3;k++)mean[k]+=q.m[12+k]/lights.length;
 check('Rendered headlights point along car velocity '+i,M.dot(mean,f)>2.06);
}
let worst=0,finite=true;
for(let i=0;i<300;i++){
 const start=[.1,.97,.1],target=[Math.sin(i*3.71)*1.4,Math.cos(i*1.17)*1.2,Math.sin(i*.93)],s=A.ik(start,target,.47,.47,i%3?[0,0,-1]:[0,-1,0]);
 worst=Math.max(worst,Math.abs(len(sub(s.joint,start))-.47),Math.abs(len(sub(s.end,s.joint))-.47));finite&&=[...s.joint,...s.end].every(Number.isFinite);
}
check('Two-bone IK preserves limb lengths over 300 targets',worst<1e-7,{worst});check('IK handles unreachable and pole-parallel targets',finite);
const zero=A.ik([0,0,0],[0,0,0],.47,.47);check('Coincident IK endpoints do not create NaNs',[...zero.joint,...zero.end].every(Number.isFinite));
let a=actor(Math.PI/2),locked=0,drift=0,posesFinite=true,steps=0,lastStance=[true,true];
for(let tick=0;tick<240;tick++){
 const old=a.anim.feet.map(f=>({world:f.world.slice(),stance:f.stance}));a.pos[0]+=4.2/60;a.vel=[4.2,0,0];A.update(a,1/60);
 for(let i=0;i<2;i++){const f=a.anim.feet[i];if(f.stance&&old[i].stance&&tick>40){locked++;drift=Math.max(drift,Math.hypot(f.world[0]-old[i].world[0],f.world[2]-old[i].world[2]));}if(f.stance&&!lastStance[i])steps++;lastStance[i]=f.stance;}
 const p=A.pose(a);posesFinite&&=[p.hip,...p.legs.flatMap(l=>[...l.hip,...l.knee,...l.ankle])].every(Number.isFinite);
}
check('Running stance feet remain planted in world space',locked>50&&drift<1e-6,{locked,drift});check('Run cadence is not the original rapid pendulum',steps>=10&&steps<=20,{footfallsIn4Seconds:steps});check('Rig stays finite across a moving cycle',posesFinite);
let phase=a.anim.phase;for(let i=0;i<60;i++)A.update(a,1/60);check('A blocked/stationary actor does not advance the walk cycle',a.anim.phase===phase&&a.anim.speed<.01);
a.grounded=false;a.vel=[4.2,4,0];phase=a.anim.phase;for(let i=0;i<25;i++){a.pos[0]+=.07;a.pos[1]+=.025;A.update(a,1/60);}check('Gait phase is frozen in the air',a.anim.phase===phase&&a.anim.air>.99);
const air=A.pose(a);check('Air pose has raised, bent legs',air.legs.every(l=>l.ankle[1]>.15)&&air.legs.some(l=>l.knee[2]<-.1));
const before=JSON.stringify(a.anim);for(let i=0;i<30;i++)A.pose(a);check('Render pose sampling does not mutate simulation',before===JSON.stringify(a.anim));
a.grounded=true;a.pos[1]=0;a.vel=[0,0,0];a.landImpact=6;A.update(a,1/60);let minHip=2;for(let i=0;i<30;i++){A.update(a,1/60);minHip=Math.min(minHip,A.pose(a).hip);}
check('Landing absorbs impact then returns to neutral',minHip<.93&&A.pose(a).hip>.97,{minHip,finalHip:A.pose(a).hip});
const report={suite:'Production motion / rig invariants',passed:checks.filter(q=>q.pass).length,total:checks.length,results:checks};
fs.writeFileSync(path.join(ROOT,'reports/motion-unit-results.json'),JSON.stringify(report,null,2));console.log(`TOTAL ${report.passed}/${report.total}`);if(report.passed!==report.total)process.exitCode=1;
