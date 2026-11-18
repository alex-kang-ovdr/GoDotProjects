"""Heuristic natural-progress bot: no invulnerability or free upgrades.
Not a human playtest. 30Hz controlled simulation, UI choices, prototype rules.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json
R=Path(__file__).resolve().parents[1]
BOT=r'''({seed,start,duration})=>{
 let s=seed;Math.random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
 const t=__test;t.setProfile({});t.setChapter(0);t.setDifficulty('normal');t.referenceOptions.duration=duration;t.setStartingWeapon(start);t.reset();
 const samples=[];let next=30,step=0;
 const pair={kunai:'xp',bat:'hp',katana:'armor',shotgun:'atk',revolver:'atk'}[start];
 function priority(token){if(token.startsWith('E:'))return 100;const k=token,lv=t.player.levels[k]||0;const p={kunai:4,bat:4,katana:4,shotgun:4,revolver:4,atk:5,guardian:7,rocket:6,lightning:6,molotov:5,drill:4,droneA:3,droneB:3,soccer:5,brick:5,boomerang:4,forcefield:7,hp:4,heal:5,cooldown:5,speed:4,magnet:5,armor:3,range:4,duration:4,xp:4,projectile:2,gold:1};let v=(p[k]||0)+lv*1.2+(lv===4?4:0);if(k===start)v+=5;if(k===pair&&!lv)v+=6;return v;}
 for(;step<(duration+150)*30;step++){
  if(t.state==='win'||t.state==='dead')break;
  if(t.state==='chest'){document.getElementById('claim').click();continue;}
  if(t.state==='level'){const cards=[...document.querySelectorAll('[data-skill]')].sort((a,b)=>priority(b.dataset.skill)-priority(a.dataset.skill));cards[0]?.click();continue;}
  if(step%3===0){
   const p=t.player;let vx=0,vy=0;
   const target=t.gems.filter(g=>g.chest||g.val>0||g.heal).sort((a,b)=>{const cost=g=>Math.hypot(g.x-p.x,g.y-p.y)/(g.chest?4:g.heal&&p.hp<p.maxHp*.7?3:1);return cost(a)-cost(b);})[0];
   if(target){const d=Math.max(1,Math.hypot(target.x-p.x,target.y-p.y));vx=(target.x-p.x)/d;vy=(target.y-p.y)/d;}else{vx=Math.cos(t.time*.13);vy=Math.sin(t.time*.13);}
   for(const e of t.enemies){if(e.hp<=0)continue;const dx=p.x-e.x,dy=p.y-e.y,d=Math.max(1,Math.hypot(dx,dy));const limit=start==='bat'||start==='katana'?80:110;if(d<limit){const w=(limit-d)/(limit*.48);vx+=dx/d*w;vy+=dy/d*w;}}
   for(const h of t.threats){
    if(h.shape==='circle'&&h.age<h.warn+.3){const dx=p.x-h.x,dy=p.y-h.y,d=Math.max(1,Math.hypot(dx,dy));if(d<h.r+55){vx+=dx/d*4;vy+=dy/d*4;}}
    if(h.shape==='line'&&h.age<h.warn+.3){const ax=h.x2-h.x,ay=h.y2-h.y,len=Math.max(1,Math.hypot(ax,ay)),dist=Math.abs((p.x-h.x)*ay-(p.y-h.y)*ax)/len;if(dist<h.width/2+55){const side=Math.sign(ax*(p.y-h.y)-ay*(p.x-h.x))||1;vx+=-ay/len*side*4;vy+=ax/len*side*4;}}
   }
   // Directional mains must turn toward the target when their shot is due.
   // This uses real movement keys; it never sets facing, damage or HP directly.
   if(['shotgun','katana'].includes(start)){
    const e=t.enemies.filter(e=>e.hp>0).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
    if(e){const d=Math.hypot(e.x-p.x,e.y-p.y);if(d>50&&d<600&&(p.cool[start]||0)<.14){vx=(e.x-p.x)/d;vy=(e.y-p.y)/d;}}
   }
   const kk=[];if(vx>.2)kk.push('d');if(vx<-.2)kk.push('a');if(vy>.2)kk.push('s');if(vy<-.2)kk.push('w');t.setKeys(...kk);
  }
  t.update(1/30);
  if(t.time>=240&&!window.__naturalSample){window.__naturalSample=t.serializeRun();} if(t.time>=next){let err=null;try{t.parseRunSave(t.serializeRun());}catch(e){err=e.message;}samples.push({time:Math.round(t.time),hp:Math.round(t.player.hp),level:t.player.lv,kills:t.player.kills,evolved:{...t.player.evolved},checkpointError:err});next+=30;}
 }
 t.draw();return{seed,start,duration,state:t.state,time:Math.round(t.time),hp:Math.round(t.player.hp),level:t.player.lv,kills:t.player.kills,build:{...t.player.levels},evolved:{...t.player.evolved},chests:t.stats.chests,samples};
}'''
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=False,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':1280,'height':840});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate("location.hash='test';window.requestAnimationFrame=()=>0;window.__store={};Object.defineProperty(window,'localStorage',{value:{getItem:k=>__store[k]??null,setItem:(k,v)=>__store[k]=v,removeItem:k=>delete __store[k]}})");page.set_content((R/'index.html').read_text());runs=[]
 for args in [{'seed':124,'start':'kunai','duration':300},{'seed':145,'start':'shotgun','duration':300},{'seed':187,'start':'bat','duration':300},{'seed':203,'start':'katana','duration':300},{'seed':211,'start':'revolver','duration':300},{'seed':220,'start':'kunai','duration':900}]:
  out=page.evaluate(BOT,args);runs.append(out);print({k:v for k,v in out.items() if k!='samples'},flush=True)
  if args['start']=='kunai' and args['duration']==300:
   page.screenshot(path=str(R/'previews/bot_result.png'))
   sample=page.evaluate('window.__naturalSample');(R/'tests/natural_sample.json').write_text(sample)
   page.evaluate('s=>{__test.profile.settledRuns=[];__test.restoreRun(s);document.getElementById("resume")?.click();__test.draw()}',sample)
   page.screenshot(path=str(R/'previews/natural_combat.png'))
 b.close()
report={'method':'Fresh profile, no extra HP, free levels, invulnerability, artificial damage or forced evolutions. Heuristic picks actual UI cards and uses movement only. Does not represent human balancing. Six initial seeds with directional-main-aware steering only.','runs':runs,'errors':errors}
(R/'tests/balance_probe.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
