const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(process.argv[2]||'.'),output=path.resolve(process.argv[3]||'tests/normal_combat_results_v28_1.json');
const {createRuntime}=require('./create_test_runtime.cjs');
const {run}=createRuntime(root);
const result=run(`(()=>{const q=DarkDescentQA,result=[];for(const hero of q.data.classes.map(c=>c.id)){q.newGame(hero,2801);q.enterArea('a1_blood_moor');const p=q.S.p,e=q.S.enemies.find(e=>e.type==='grunt');const r=q.S.rooms[0],cx=r.c.x*32+16,cy=r.c.y*32+16;p.x=cx;p.y=cy;p.invuln=0;e.x=cx+30;e.y=cy;e.activated=true;e.home={x:e.x,y:e.y};e.squadId=null;q.S.enemies=[e];q.S.squads={};const before={hp:p.hp,mp:p.mp,xp:p.xp,level:p.level,enemyHp:e.hp};let casts=0,steps=0;for(;steps<1200&&q.S.enemies.includes(e)&&!p.dead;steps++){if(p.cd<=0){if(hero==='sorceress'&&q.skillUseReason('sorceress_fire_bolt')===''){if(q.castSkill('sorceress_fire_bolt',e))casts++;}else if(q.cast(1,e))casts++;}q.step();}result.push({hero,before,steps,seconds:steps/60,casts,won:!q.S.enemies.includes(e),died:p.dead,hp:p.hp,mp:p.mp,xp:p.xp,drops:q.S.drops.length});}return result;})()`);
fs.writeFileSync(output,JSON.stringify({htmlSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'index.html'))).digest('hex'),scope:'Node VM: single isolated level-1 actual field monster, moved near the player; original starting stats, normal damage, no invulnerability or damage override. This is not a full balance/campaign test.',result},null,2));
console.log(JSON.stringify(result,null,2));

if(result.some(r=>!r.won||r.died||!Number.isFinite(r.hp)))process.exitCode=1;
