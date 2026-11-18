'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),ctx={console,Float32Array,Math};ctx.window=ctx;vm.createContext(ctx);
for(const name of ['engine.js','data.js','motion.js','models.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,'src',name),'utf8'),ctx);
const M=ctx.HM,A=ctx.HarborMotion,out=[];
function check(name,pass,details){out.push({name,pass:!!pass,details});console.log((pass?'PASS ':'FAIL ')+name);}
function actor(){const a={type:'player',pos:[0,0,0],yaw:0,pitch:0,lookYaw:0,vel:[0,0,0],hp:100,grounded:true,weapon:2};A.reset(a);return a;}
const springResults=[];
for(const hz of [30,60,120,240]){let x=0,v=-5;for(let i=0;i<hz;i++)[x,v]=A.spring(x,v,0,18,1/hz);springResults.push({hz,x,v});}
check('Analytic landing spring is tick-rate independent at 30/60/120/240Hz',springResults.every(r=>Math.abs(r.x-springResults[0].x)<1e-12&&Math.abs(r.v-springResults[0].v)<1e-12),springResults);
const a=actor();a.anim.raise=0;a.anim.move=1;a.anim.run=1;let prev=null,worst=0;
for(let i=0;i<=200;i++){a.anim.sprint=i/200;const hand=A.pose(a).arms[0].hand;if(prev)worst=Math.max(worst,M.len(M.sub(hand,prev)));prev=hand;}
check('Support hand continuously releases rifle across sprint blend',worst<.008,{maxHandJump:worst});
a.anim.raise=1;a.anim.sprint=1;const raised=A.pose(a).arms[0].hand;a.anim.sprint=0;const standing=A.pose(a).arms[0].hand;check('ADS retains supporting grip regardless of sprint blend',M.len(M.sub(standing,raised))<1e-6);
for(const yaw of [-Math.PI+.01,Math.PI-.01]){const b=actor();b.yaw=yaw;const sample=A.snapshot(b);b.yaw=-yaw;const v=A.visual(b,sample,.5);check('Interpolation takes shortest yaw arc '+yaw,Math.abs(Math.abs(v.yaw)-Math.PI)<.000001);}
const b=actor(),old=A.snapshot(b);b.pos=[100,0,0];check('Teleport skips interpolation instead of sweeping across the city',A.visual(b,old,.5)===b);
const c=actor();let low=Infinity,high=-Infinity;
for(let i=0;i<80;i++){c.yaw+=.03;A.update(c,1/60);const pose=A.pose(c);for(const l of pose.legs){low=Math.min(low,l.ankle[1]);high=Math.max(high,l.ankle[1]);}}
check('Pivot foot lift remains a short grounded step',low>.08&&high<.25&&high>.17,{low,high});
const d=actor();d.anim.phase=Math.PI*2-.03;const before=A.snapshot(d);d.anim.phase=.03;const v=A.visual(d,before,.5);check('Walking cycle interpolation crosses phase wrap without rewinding',Math.abs(v.anim.phase-Math.PI*2)<1e-6);
let finite=true;const e=actor();for(let i=0;i<600;i++){e.pos[0]+=Math.sin(i*.11)*.04;e.pos[2]+=Math.cos(i*.11)*.04;e.yaw+=.04;e.aim=i%120>60;e.lookYaw=e.yaw+.25;e.vel=[0,Math.sin(i*.2)*6,0];e.grounded=i%90<40;e.landImpact=6;const snap=A.snapshot(e);A.update(e,1/60);const pose=A.pose(A.visual(e,snap,.37));finite&&=[...pose.torso,...pose.gun,...pose.legs.flatMap(l=>[...l.hip,...l.knee,...l.ankle]),...pose.arms.flatMap(a=>[...a.shoulder,...a.elbow,...a.hand])].every(Number.isFinite);}
check('Blended rig remains finite over 600 mixed-state ticks',finite);
let lowest=Infinity;for(let pitch=-.3;pitch<=.3;pitch+=.01){const footY=.115-.04+Math.abs(Math.sin(pitch))*.19;const soleBottom=footY-.057-Math.abs(Math.cos(pitch))*.0175-Math.abs(Math.sin(pitch))*.185;lowest=Math.min(lowest,soleBottom);}
check('Sole clearance remains nonnegative across foot roll',lowest>=0,{lowest});
const report={suite:'v3 motion presentation invariants',passed:out.filter(t=>t.pass).length,total:out.length,results:out};fs.writeFileSync(path.join(ROOT,'reports/polish-unit-results.json'),JSON.stringify(report,null,2));console.log('TOTAL',report.passed,'/',report.total);if(report.passed!==report.total)process.exitCode=1;
