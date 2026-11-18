"""Heuristic bot probes (not a human playtest or a balance acceptance test)."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
R=Path(__file__).resolve().parents[1]
BOT=r'''({seed,start,hero})=>{
 let s=seed;Math.random=()=>{s=(1664525*s+1013904223)>>>0;return s/4294967296;};
 const t=__test;t.setProfile({});t.setChapter(0);t.setDifficulty('normal');t.setStartingWeapon(start);t.setHero(hero);t.reset();
 const samples=[];let next=30,step=0;
 const priorities={kunai:9,atk:7,guardian:6,rocket:5,lightning:6,molotov:4,drill:5,droneA:start==='droneA'?9:3,droneB:start==='droneA'?10:3,hp:3,heal:5,cooldown:6,speed:3,magnet:5,armor:2,range:2};
 for(;step<360*30;step++){
  if(t.state==='win'||t.state==='dead')break;
  if(t.state==='perk'){const priority=['frost','barrier','execution','overclock','capacitor','scavenger','blast','dashPulse','fieldMedic'];const k=[...t.doctrine.draft].sort((a,b)=>priority.indexOf(a)-priority.indexOf(b))[0];t.choosePerk(k);continue;}
  if(t.state==='chest'){document.getElementById('claim').click();continue;}
  if(t.state==='level'){
   const cards=[...document.querySelectorAll('[data-skill]')];cards.sort((a,b)=>{const val=x=>{const k=x.dataset.skill,lv=t.player.levels[k]||0;return (priorities[k]||0)+lv*.9+(lv===4?3:0);};return val(b)-val(a);});cards[0]?.click();continue;
  }
  if(step%3===0){
   const p=t.player;let vx=0,vy=0;
   const target=t.gems.filter(g=>g.chest||g.val>0).sort((a,b)=>{const value=x=>Math.hypot(x.x-p.x,x.y-p.y)/(x.chest?4:1);return value(a)-value(b);})[0];
   if(target){const d=Math.max(1,Math.hypot(target.x-p.x,target.y-p.y));vx+=(target.x-p.x)/d;vy+=(target.y-p.y)/d;}
   else {vx=Math.cos(t.time*.13);vy=Math.sin(t.time*.13);}
   let near=999;
   for(const e of t.enemies){if(e.hp<=0)continue;const dx=p.x-e.x,dy=p.y-e.y,d=Math.max(1,Math.hypot(dx,dy));near=Math.min(near,d);const limit=t.owned('weapon').every(k=>k==='guardian')?65:110;if(d<limit){const w=(limit-d)/(limit*.5);vx+=dx/d*w;vy+=dy/d*w;}}
   for(const h of t.threats){if(h.shape==='circle'&&h.age<h.warn+.3){const dx=p.x-h.x,dy=p.y-h.y,d=Math.max(1,Math.hypot(dx,dy));if(d<h.r+45){vx+=dx/d*4;vy+=dy/d*4;}}}
   const kk=[];if(vx>.22)kk.push('d');if(vx<-.22)kk.push('a');if(vy>.22)kk.push('s');if(vy<-.22)kk.push('w');t.setKeys(...kk);if(near<53&&t.dashCooldown<=0)t.dash();
  }
  if(t.tactics.cooldown<=0&&(hero!=='medic'||t.player.hp<t.player.maxHp*.75))t.castHeroSkill();
  t.update(1/30);
  if(t.time>=next){samples.push({checkpoint:!!t.readRunSave(),checkpointError:(()=>{try{t.parseRunSave(__store.survivor_run_v12);return null;}catch(e){return e.stack;}})(),time:Math.round(t.time),hp:Math.round(t.player.hp),level:t.player.lv,kills:t.player.kills,build:{...t.player.levels},evolved:Object.keys(t.player.evolved),perks:[...t.doctrine.taken]});next+=30;}
 }
 return {seed,start,hero,perks:[...t.doctrine.taken],affixKills:t.doctrine.stats.affixKills,skillUses:t.tactics.casts,completedBeacons:t.tactics.completed,state:t.state,time:Math.round(t.time),hp:Math.round(t.player.hp),level:t.player.lv,kills:t.player.kills,evolutions:t.stats.evolutions,chests:t.stats.chests,steps:step,samples};
}'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page();page.evaluate("location.hash='test';window.requestAnimationFrame=()=>0;window.__store={};Object.defineProperty(window,'localStorage',{value:{getItem:k=>__store[k]||null,setItem:(k,v)=>__store[k]=v,removeItem:k=>delete __store[k]}})");page.set_content((R/'index.html').read_text());runs=[]
 for args in [{'seed':124,'start':'kunai','hero':'assault'},{'seed':145,'start':'droneA','hero':'engineer'},{'seed':187,'start':'kunai','hero':'medic'}]:
  out=page.evaluate(BOT,args);runs.append(out);print({k:v for k,v in out.items() if k!='samples'},flush=True)
 b.close()
(R/'tests/balance_probe.json').write_text(json.dumps({'note':'v13: default fresh profile, hero skills and earned trait choices enabled; no invulnerability/bonus levels. Checkpoint validation is sampled every 30 simulated seconds. Heuristic bot; not representative human balancing. Runs stop at 360*30 update attempts, including paused choice frames.','runs':runs},ensure_ascii=False,indent=2))
