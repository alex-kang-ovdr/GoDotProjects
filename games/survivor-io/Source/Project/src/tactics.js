/* v12: distinct hero skills and optional defend-the-beacon field objectives.
   All gameplay uses the same XY ground plane in both render modes. */
let activeHero='assault';
let tactics={cooldown:0,casts:0,turrets:[],fields:[],beacons:[],completed:0,parts:0};
function resetTactics(){
 activeHero=Object.hasOwn(heroCatalog,selectedHero)?selectedHero:'assault';
 tactics={cooldown:0,casts:0,turrets:[],fields:[],beacons:[],completed:0,parts:0};
 runId='run_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,12);
 runMeta=normalizeProfile(profile);levelDraft=chestDraft=null;autosaveClock=0;
}
function castHeroSkill(){
 if(state!=='playing'||!player||paidRun||tactics.cooldown>0)return false;
 const h=heroCatalog[activeHero];tactics.cooldown=heroCooldown();tactics.casts++;if(hasPerk('capacitor'))perkHealing(player.maxHp*.08);
 if(activeHero==='assault'){
  const r=180,amount=140*attackPower();
  areas.push({kind:'heroPulse',x:player.x,y:player.y,r,life:.55,max:.55});
  for(const e of enemies){if(e.hp<=0||Math.hypot(e.x-player.x,e.y-player.y)>r+e.r)continue;
   damage(e,amount,'hero_burst');if(paidRun)break;
   if(e.hp>0&&e.type!=='boss'&&e.type!=='elite'){
    const dx=e.x-player.x,dy=e.y-player.y,d=Math.max(1,Math.hypot(dx,dy));
    e.x+=dx/d*65;e.y+=dy/d*65;e.stun=.7;
   }
  }
  for(const s of enemyShots)if(Math.hypot(s.x-player.x,s.y-player.y)<=r)s.life=0;
  player.inv=Math.max(player.inv,.8);effect(player.x,player.y,h.color,24,1.4);Sound.play('zap');
 }else if(activeHero==='engineer'){
  tactics.turrets.push({x:player.x+32,y:player.y,life:10,max:10,cool:0,yaw:player.facing,dmg:30*attackPower()});
  effect(player.x+32,player.y,h.color,15);Sound.play('upgrade');
 }else{
  tactics.fields.push({x:player.x,y:player.y,r:135,life:6,max:6});
  effect(player.x,player.y,h.color,18);Sound.play('level');
 }
 updateHud(true);saveRun();return true;
}
function spawnBeacon(id='beacon_'+tactics.beacons.length){
 if(tactics.beacons.some(b=>b.id===id)||elapsed>=300)return null;
 const a=rand(0,TAU),b={id,x:player.x+Math.cos(a)*245,y:player.y+Math.sin(a)*245,r:105,progress:0,goal:8,expires:elapsed+75,status:'active',engaged:false,contested:false,completedAt:0};
 tactics.beacons.push(b);toast('보급 거점 발견 · 영역을 8초 확보하면 상자 +70G +부품 2');Sound.play('warn');return b;
}
function updateTactics(dt){
 tactics.cooldown=Math.max(0,tactics.cooldown-dt);
 for(let i=tactics.turrets.length-1;i>=0;i--){
  const t=tactics.turrets[i];t.life-=dt;t.cool=Math.max(0,t.cool-dt);
  if(t.life<=0){tactics.turrets.splice(i,1);continue;}
  const e=nearest(t.x,t.y,420);if(e){t.yaw=Math.atan2(e.y-t.y,e.x-t.x);if(t.cool<=0){
   projectile('drill',t.x,t.y,t.yaw,540,t.dmg,{kind:'turret',source:'turret',r:5,life:1.1,pierce:0,color:'#ffd28b'});t.cool=.32;Sound.play('shot');
  }}
 }
 for(let i=tactics.fields.length-1;i>=0;i--){
  const f=tactics.fields[i],active=Math.min(f.life,dt);f.life-=dt;
  if(Math.hypot(player.x-f.x,player.y-f.y)<=f.r)player.hp=Math.min(player.maxHp,player.hp+player.maxHp*.05*active);
  if(f.life<=0)tactics.fields.splice(i,1);
 }
 if(!stageEvents.has('disabled'))for(const [time,id] of [[45,'beacon_1'],[190,'beacon_2']]){
  if(elapsed>=time&&!stageEvents.has(id)){stageEvents.add(id);spawnBeacon(id);}
 }
 for(const b of tactics.beacons){
  if(b.status!=='active')continue;
  if(elapsed>=b.expires||elapsed>=300){b.status='expired';toast('거점 신호 종료 · 전투를 계속하세요');continue;}
  const inside=Math.hypot(player.x-b.x,player.y-b.y)<=b.r;
  if(inside&&!b.engaged){
   b.engaged=true;
   for(let i=0;i<7&&enemies.length<260;i++){const a=i*TAU/7;spawnEnemy(i===0?'tank':i%3===0?'runner':'grunt',b.x+Math.cos(a)*210,b.y+Math.sin(a)*210);}
   toast('거점 방어 시작 · 적이 영역 안에 있으면 확보가 멈춥니다');
  }
  b.contested=enemies.some(e=>e.hp>0&&Math.hypot(e.x-b.x,e.y-b.y)<b.r+e.r);
  if(inside&&!b.contested)b.progress=Math.min(b.goal,b.progress+dt);
  if(b.progress>=b.goal){
   b.status='complete';b.completedAt=elapsed;tactics.completed++;tactics.parts+=2;player.gold+=70;
   gems.push({x:b.x,y:b.y,r:13,val:0,chest:true});
   for(let i=0;i<8;i++){const a=i*TAU/8;addXpGem(b.x+Math.cos(a)*50,b.y+Math.sin(a)*50,5);}
   effect(b.x,b.y,'#8ff4da',30);Sound.play('evolve');toast('거점 확보! 상자 · +70G · 정산 부품 +2');saveRun();
  }
 }
}
function updateTacticalHud(){
 if(!$('skillbutton'))return;
 const live=!!player&&state!=='menu',h=heroCatalog[activeHero];
 $('skillbutton').textContent=tactics.cooldown>0?h.skill+'\n'+tactics.cooldown.toFixed(1)+'s':h.skill+'\n'+(matchMedia('(pointer:coarse)').matches?'준비':'E');
 $('skillbutton').style.setProperty('--skill',h.color);$('skillbutton').style.setProperty('--ready',String(1-tactics.cooldown/heroCooldown()));
 $('skillbutton').setAttribute('aria-label',h.skill+(tactics.cooldown>0?' 재사용 '+Math.ceil(tactics.cooldown)+'초':' 사용 가능'));
 $('skillbutton').setAttribute('aria-disabled',String(!live||tactics.cooldown>0||state!=='playing'));
 const b=tactics.beacons.find(b=>b.status==='active'),el=$('tacticalHUD');el.style.display=live&&b?'block':'none';
 if(b){const near=Math.hypot(player.x-b.x,player.y-b.y)<=b.r;el.innerHTML=`<span class="mission-label">선택 거점 · ${Math.max(0,Math.ceil(b.expires-elapsed))}초 남음</span><b>${b.contested?'적을 정리하세요':near?'확보 중':'청록 신호를 따라 이동'}</b><span> ${b.progress.toFixed(1)} / ${b.goal}s</span><div class="capture-bar"><i style="width:${b.progress/b.goal*100}%"></i></div>`;}
}
function drawTacticalOverlay(is3D){
 const h=heroCatalog[activeHero];
 // 2D fallback renders the same heal radii and defend area, not decorative-only circles.
 if(!is3D){ctx.save();ctx.translate(W/2-player.x,H/2-player.y);
  for(const f of tactics.fields){ctx.fillStyle='#6cdec026';ctx.strokeStyle='#7be9cc';ctx.lineWidth=3;ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,TAU);ctx.fill();ctx.stroke();}
  for(const t of tactics.turrets){ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.yaw);ctx.fillStyle='#edb361';ctx.fillRect(-13,-13,26,26);ctx.fillStyle='#2f4a61';ctx.fillRect(0,-4,26,8);ctx.restore();}
  for(const b of tactics.beacons){if(b.status==='expired')continue;ctx.strokeStyle=b.status==='complete'?'#e7ce8e':b.contested?'#e99871':'#52e7c4';ctx.lineWidth=3;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.stroke();ctx.fillStyle='#51bfa8';ctx.fillRect(b.x-12,b.y-12,24,24);}
  for(const a of areas)if(a.kind==='heroPulse'){ctx.strokeStyle=h.color;ctx.lineWidth=5;ctx.beginPath();ctx.arc(a.x,a.y,a.r*(1-a.life/a.max),0,TAU);ctx.stroke();}
  ctx.restore();
 }
 for(const b of tactics.beacons){if(b.status==='expired'||(b.status==='complete'&&elapsed-b.completedAt>8))continue;const p=screenPoint(b.x,b.y,91);if(p.x<25||p.x>W-25||p.y<90||p.y>H-90)continue;
  ctx.font='800 11px system-ui';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#244e59';const label=b.status==='complete'?'거점 확보 ✓':b.contested?'점령 중단 · 적 접근':`보급 거점 ${Math.floor(b.progress/b.goal*100)}%`;ctx.strokeText(label,p.x,p.y);ctx.fillStyle='#e5ffed';ctx.fillText(label,p.x,p.y);
 }
 if(graphics.radar!==false&&H>520){
  const size=W<600?92:112,x=W<600?W-size-13:W-size-24,y=W<600?166:188,range=700;
  ctx.save();ctx.translate(x,y);ctx.fillStyle='#153749d9';ctx.strokeStyle='#cff4e557';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(0,0,size,size,12);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.rect(6,6,size-12,size-12);ctx.clip();
  const pos=(px,py)=>({x:size/2+(px-player.x)/range*(size/2-8),y:size/2+(py-player.y)/range*(size/2-8)});
  ctx.strokeStyle='#a6e5cc22';ctx.beginPath();ctx.moveTo(size/2,6);ctx.lineTo(size/2,size-6);ctx.moveTo(6,size/2);ctx.lineTo(size-6,size/2);ctx.stroke();
  for(const e of enemies){if(e.hp<=0)continue;const p=pos(e.x,e.y);ctx.fillStyle=e.type==='boss'?'#ff8d9e':e.type==='elite'?'#ffd17f':'#d3a6a1';const r=e.type==='boss'?4:2;ctx.fillRect(p.x-r,p.y-r,r*2,r*2);}
  for(const g of gems){if(!g.chest)continue;const p=pos(g.x,g.y);ctx.fillStyle='#ffe18c';ctx.fillRect(p.x-2.5,p.y-2.5,5,5);}
  for(const b of tactics.beacons){if(b.status!=='active')continue;const p=pos(b.x,b.y);ctx.strokeStyle='#7df1ce';ctx.lineWidth=2;ctx.strokeRect(p.x-4,p.y-4,8,8);}
  ctx.fillStyle='#d4ffed';ctx.beginPath();ctx.moveTo(size/2,size/2-5);ctx.lineTo(size/2-4,size/2+4);ctx.lineTo(size/2+4,size/2+4);ctx.fill();ctx.restore();
  ctx.font='700 8px system-ui';ctx.textAlign='right';ctx.fillStyle='#c8efdf';ctx.fillText('RADAR · N',x+size-7,y+size-6);
 }
}
