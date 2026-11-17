function hurtEnemy(e,raw,critChance=0){if(!e||e.hp<=0||!S.enemies.includes(e))return 0;if(e.type==='boss'&&!S.keyCount){float(e.x,e.y,'봉인','#edc97c');return 0;}
 const crit=random()<critChance,mult=e.modifier==='armored'?.7:1,dmg=Math.max(1,Math.round(raw*mult*(crit?1.75:1))),actual=Math.min(e.hp,dmg);e.hp-=dmg;e.flash=.12;e.activated=true;e.aggro=8;S.p.hp=Math.min(S.p.maxHp,S.p.hp+actual*stats().leech);float(e.x,e.y-8,(crit?'✦ ':'')+dmg,crit?'#ffe095':'#ffffff');eventVfx('impact',e.x,e.y,14,crit?'#ffe2a1':'#b5f0ee',.18);sound(crit?'crit':'hit');if(e.hp<=0)kill(e);return actual;
}
function kill(e){const i=S.enemies.indexOf(e);if(i<0)return;S.enemies.splice(i,1);S.kills++;if(!e.summoned)S.questKills++;const boss=e.type==='boss',elite=e.type==='elite',p=S.p;
 if(!e.summoned){if(random()<(boss?1:elite?.45:.14))S.materials.essence++;if(random()<(boss?1:elite?.18:.035))S.materials.runes++;p.gold+=rand(5,12)*S.floor*(boss?6:1);p.xp+=(boss?115:elite?35:18)*S.floor;
 if(random()<(boss?1:elite?.85:.53)){const kind=choose(['sword','axe','staff','armor','helm','ring','health','health','mana']);S.drops.push({x:e.x,y:e.y,item:makeItem(kind,boss)});}if(boss)S.drops.push({x:e.x+8,y:e.y,item:makeItem(choose(['sword','armor','ring']),true)});
 }else{p.xp+=3*S.floor;p.gold+=2;}
 if(e.modifier==='volatile')S.hazards.push({x:e.x,y:e.y,r:53,delay:.95,total:.95,damage:e.atk*1.4,kind:'blast'});
 if(boss){S.bossDead=true;S.enemies=S.enemies.filter(a=>!a.summoned);S.hazards=[];S.shots=S.shots.filter(s=>s.friendly);log('수호자 처치! 황금 계단에서 F로 다음 층에 진입하세요.');sound('reward');eventVfx('ring',e.x,e.y,115,'#f6d98c',1.2);}
 levelCheck();if(S.questKills>=S.questTarget&&!S.questRewarded){S.questRewarded=true;p.gold+=60*S.floor;p.points++;log('현상금 완료 · 골드와 스킬 포인트 +1');}
}
function damagePlayer(raw){const p=S.p;if(p.dead||p.invuln>0||S.completed)return 0;const st=stats(),d=Math.max(1,Math.round((raw-st.def*.5)*(1-st.resist/100)*(p.guard>0?.48:1)));if(random()<Math.min(.18,st.def*.003)){float(p.x,p.y,'방어','#9fd4fa');return 0;}p.hp=Math.max(0,p.hp-d);p.flash=.16;float(p.x,p.y-8,'−'+d,'#ff8b87');screenShake=motionReduced?0:3;sound('hurt');if(!p.hp){p.dead=true;clickGoal=null;pointer.down=false;log('쓰러졌습니다. 부활하면 현재 층의 탐험과 처치 기록은 유지됩니다.');refresh();}return d;
}
function attackAnim(o,angle,duration=.3){o.face=angle;o.attackAnim=duration;o.attackTotal=duration;}
function fireShot(from,angle,speed,damage,kind,friendly=true,aoe=0){S.shots.push({x:from.x,y:from.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,dmg:damage,kind,friendly,aoe,r:kind==='arrow'?3:5,life:1.6});}
function targetsInCone(p,angle,range,arc){return S.enemies.filter(e=>e.hp>0&&distance(e,p)<range+e.r&&Math.abs(Math.atan2(Math.sin(Math.atan2(e.y-p.y,e.x-p.x)-angle),Math.cos(Math.atan2(e.y-p.y,e.x-p.x)-angle)))<arc/2&&lineClear(p,e,1));}
function cast(n,target=pointer){if(!active())return false;if(n===5)return ultimate();const p=S.p,st=stats(),angle=Math.atan2(target.y-p.y,target.x-p.x),name=skillNames[S.hero][n-1];
 if(n===1){if(p.cd>0)return false;p.cd=S.hero==='knight'?.34:S.hero==='ranger'?.38:.44;attackAnim(p,angle);if(S.hero==='knight'){const hits=targetsInCone(p,angle,49,2.5).sort((a,b)=>distance(a,p)-distance(b,p));if(hits[0])hurtEnemy(hits[0],rand(Math.max(1,st.atk-2),st.atk+4),st.crit);eventVfx('slash',p.x,p.y,46,'#f4d78e',.22,angle);}else{fireShot(p,angle,S.hero==='ranger'?440:355,st.atk*(S.hero==='mage'?1.06:1),S.hero==='ranger'?'arrow':'arcane',true);eventVfx('muzzle',p.x,p.y,13,'#b8f7f5',.2,angle);}sound('swing');return true;}
 if(n===2){if(p.cd>0||p.mp<11)return false;p.mp-=11;p.cd=.48;attackAnim(p,angle,.4);
 if(S.hero==='knight'){for(const e of targetsInCone(p,angle,68,2.8).slice(0,4)){hurtEnemy(e,st.atk*1.2+p.skills.fire*7,st.crit);if(e.hp>0){e.stun=.6;e.windup=null;const d=distance(e,p)||1;move(e,(e.x-p.x)/d*15,(e.y-p.y)/d*15);}}eventVfx('slash',p.x,p.y,72,'#a9e8ff',.38,angle);}
 else if(S.hero==='ranger'){for(const spread of [-.14,0,.14])fireShot(p,angle+spread,465,10+p.skills.fire*7+st.atk*.6,'arrow',true,8);}
 else{fireShot(p,angle,310,17+p.skills.fire*9+st.atk*.45,'fire',true,43);}sound('cast');return true;}
 if(n===3){if(p.cd>0||p.mp<23)return false;p.mp-=23;p.cd=.8;attackAnim(p,angle,.6);const radius=S.hero==='mage'?115:88;for(const e of [...S.enemies])if(distance(e,p)<radius&&lineClear(p,e,1)){hurtEnemy(e,st.atk*.9+p.skills.whirl*13,st.crit);if(e.hp>0){e.stun=S.hero==='mage'?1:.3;e.windup=null;}}if(S.hero==='ranger')p.dashCd=0;eventVfx('ring',p.x,p.y,radius,S.hero==='mage'?'#9ee4ff':'#f5da9a',.65);sound('cast');return true;}
 if(n===4){if(p.globalCd>0||p.mp<20)return false;p.mp-=20;p.globalCd=5;if(S.hero==='knight'){p.hp=Math.min(p.maxHp,p.hp+40+p.skills.heal*23);p.guard=4;}else if(S.hero==='ranger'){p.hp=Math.min(p.maxHp,p.hp+22+p.skills.heal*15);for(const e of S.enemies)if(distance(e,p)<135&&lineClear(p,e,1)){e.stun=1.3;e.windup=null;}}else{p.hp=Math.min(p.maxHp,p.hp+32+p.skills.heal*20);p.mp=Math.min(p.maxMp,p.mp+15);}eventVfx('ring',p.x,p.y,72,'#78e9c0',.8);log(name+' 시전');sound('heal');return true;}
 return false;
}
function ultimate(){const p=S.p;if(!active()||p.level<3||p.ultimateCd>0||p.mp<40)return false;p.mp-=40;p.ultimateCd=16;const st=stats(),radius=S.hero==='knight'?170:245;for(const e of [...S.enemies])if(distance(p,e)<radius&&lineClear(p,e,1)){hurtEnemy(e,st.atk*2.4+45+p.skills.fire*5,st.crit+.1);if(e.hp>0){e.stun=1.8;e.windup=null;}}if(S.hero==='knight')p.guard=6;eventVfx('ring',p.x,p.y,radius,'#f5d48b',1);screenShake=motionReduced?0:5;attackAnim(p,p.face,.6);log('궁극기 · '+skillNames[S.hero][4]);sound('reward');return true;}
function dash(){const p=S.p;if(!active()||p.dashCd>0||p.mp<8)return;let dx=+(keys.d||keys.ArrowRight||false)-+(keys.a||keys.ArrowLeft||false),dy=+(keys.s||keys.ArrowDown||false)-+(keys.w||keys.ArrowUp||false);if(!dx&&!dy){dx=pointer.x-p.x;dy=pointer.y-p.y;}const d=Math.hypot(dx,dy)||1;p.mp-=8;p.dashCd=2.7;p.invuln=.22;eventVfx('ring',p.x,p.y,24,'#b2ebff',.3);move(p,dx/d*106,dy/d*106);clickGoal=null;clickPath=[];attackTarget=null;eventVfx('ring',p.x,p.y,30,'#b2ebff',.4);sound('dash');}
function updateSquads(dt){for(const squad of Object.values(S.squads)){const mates=S.enemies.filter(e=>e.squadId===squad.id&&e.hp>0);if(!mates.length)continue;const captain=mates.find(e=>e.tactic==='captain'),r=S.rooms[squad.room],seen=mates.some(e=>e.activated||distance(e,S.p)<175&&lineClear(e,S.p,1));
 if(squad.order==='dormant'&&!seen)continue;for(const e of mates)e.activated=true;
 const hp=mates.reduce((n,e)=>n+clamp(e.hp/e.maxHp,0,1),0)/mates.length,alive=mates.length/Math.max(1,squad.initialSize);const recovered=squad.order==='regroup'?.14:0;
 squad.morale=clamp(hp*.65+alive*.35-(captain?0:.27)+recovered,0,1);squad.orderTime+=dt;
 const minDistance=Math.min(...mates.map(e=>distance(e,S.p)));let next=squad.order;
 if(next==='dormant')next='engage';
 if(next==='engage'&&squad.morale<.32&&minDistance<180&&S.elapsed>=(squad.retreatUntil||0))next='retreat';
 else if(next==='retreat'&&(squad.orderTime>2.6||minDistance>210))next='regroup';
 else if(next==='regroup'&&(squad.orderTime>1.5||minDistance<70)){next='engage';squad.retreatUntil=S.elapsed+5;}
 if(next!==squad.order){squad.order=next;squad.orderTime=0;for(const e of mates){e.pathTime=0;e.goalTime=0;}}
 if(!captain&&!squad.leaderLost){squad.leaderLost=true;float(mates[0].x,mates[0].y,'지휘관 상실','#ffd28c');}
 for(const e of mates){e.squadOrder=squad.order;e.squadMorale=squad.morale;e.leaderId=(captain||mates[0]).id;}
 }}
function resolveWindup(e){const w=e.windup;e.windup=null;if(!w||e.hp<=0)return;attackAnim(e,w.angle,.28);
 if(w.kind==='melee'){if(distance(e,S.p)<e.r+S.p.r+w.reach&&lineClear(e,S.p,1)){damagePlayer(e.atk);if(e.modifier==='frost')S.p.slow=1.4;if(e.modifier==='vampiric')e.hp=Math.min(e.maxHp,e.hp+e.atk*.18);}eventVfx('slash',e.x,e.y,w.reach+20,'#ff9a7b',.22,w.angle);}
 else if(w.kind==='bolt'){fireShot(e,w.angle,190,e.atk,'shadow',false);}
 else if(w.kind==='bossFan'){for(let k=-1;k<=1;k++)fireShot(e,w.angle+k*.3,178+S.floor*8,e.atk*.8,'shadow',false);}
}
function startAttack(e,kind,seconds,angle,reach=18){e.windup={kind,left:seconds,total:seconds,angle,reach};e.face=angle;e.cd=kind==='melee'?1.35:2.1;}
function summonBoss(e){const max=4-S.enemies.filter(a=>a.summoned).length;if(max<=0)return;const r=S.rooms.at(-1),places=[];for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const p=center({x,y});if(walk(p.x,p.y,10)&&distance(p,S.p)>38&&distance(p,e)>20&&!S.enemies.some(a=>distance(a,p)<23))places.push(p);}const count=Math.min(2,max,places.length),id=`boss-${e.phase}`;
 if(count){S.squads[id]={id,initialSize:count,room:S.rooms.length-1,order:'engage',morale:1,orderTime:0,retreatUntil:0};for(let i=0;i<count;i++){const spot=places.splice(rand(0,places.length-1),1)[0];S.enemies.push(makeEnemy(spot.x,spot.y,i?'caster':'grunt',{summoned:true,activated:true,squadId:id,tactic:i?'skirmisher':'captain',formationIndex:i,home:{...spot}}));eventVfx('ring',spot.x,spot.y,25,'#bda2ff',.7);}log('보스가 수호 분대를 소환했습니다.');}}
function ai(e,dt){if(e.hp<=0)return;e.cd=Math.max(0,e.cd-dt);e.skillCd=Math.max(0,e.skillCd-dt);e.stun=Math.max(0,e.stun-dt);e.flash=Math.max(0,e.flash-dt);e.attackAnim=Math.max(0,e.attackAnim-dt);
 if(e.type==='boss'&&!S.keyCount)return;
 if(e.stun>0){e.windup=null;return;}
 if(e.windup){e.windup.left-=dt;if(e.windup.left<=0)resolveWindup(e);return;}
 const p=S.p,d=distance(e,p),squad=S.squads[e.squadId];
 if(e.type==='boss'){if(d<240&&lineClear(e,p,1))e.activated=true;if(!e.activated)return;const phase=e.hp/e.maxHp<=.33?2:e.hp/e.maxHp<=.66?1:0;if(phase>e.phase){e.phase=phase;summonBoss(e);e.skillCd=.8;log(e.bossName+' · '+(phase+1)+'페이즈');}
 if(e.skillCd<=0&&d<260&&lineClear(e,p,1)){S.hazards.push({x:p.x,y:p.y,r:50+S.floor*3,delay:1.15,total:1.15,damage:e.atk*1.5,kind:'meteor'});startAttack(e,'bossFan',.65,Math.atan2(p.y-e.y,p.x-e.x));e.skillCd=Math.max(2.7,4.6-e.phase*.6);return;}
 }else if(!e.activated)return;
 const order=squad?.order||'engage';
 if(order==='engage'&&d<e.r+p.r+19&&e.cd<=0&&lineClear(e,p,1)){startAttack(e,'melee',e.type==='boss'?.62:.43,Math.atan2(p.y-e.y,p.x-e.x),20);return;}
 if(order==='engage'&&e.type==='caster'&&d>65&&d<230&&e.cd<=0&&lineClear(e,p,1)){startAttack(e,'bolt',.66,Math.atan2(p.y-e.y,p.x-e.x));return;}
 e.goalTime=(e.goalTime||0)-dt;
 if(e.goalTime<=0||!e.goal||e.goalMode!==order){e.goalTime=.45+(e.id%4)*.06;e.goalMode=order;const leader=S.enemies.find(a=>a.id===e.leaderId)||e;
 if(order==='retreat')e.goal=tacticalPoint(e,p,'retreat');
 else if(order==='regroup'){const home=e.home||center(S.rooms[squad?.room||0].c);e.goal=tacticalPoint(e,home,'regroup');}
 else if(e.type==='caster')e.goal=tacticalPoint(e,p,'kite');
 else if(e.tactic==='guardian'&&leader!==e&&d>70&&distance(e,leader)>64){e.goal=tacticalPoint(e,{x:leader.x+(p.x-leader.x)*.28,y:leader.y+(p.y-leader.y)*.28},'guard');}
 else if(e.tactic==='flanker'&&d>65){let a=Math.atan2(p.y-leader.y,p.x-leader.x)+(e.formationIndex%2?1:-1)*1.15;const flank={x:p.x+Math.cos(a)*42,y:p.y+Math.sin(a)*42};e.goal=tacticalPoint(e,flank,'flank');}
 else e.goal={x:p.x,y:p.y};}
 const hold=order==='engage'&&((e.type==='caster'&&d>105&&d<180&&lineClear(e,p,1))||(e.type!=='caster'&&d<e.r+p.r+12));if(!hold)navigate(e,e.goal,dt,e.speed*(order==='retreat'?1.2:1)*(e.modifier==='swift'?1.35:1));
}
function reveal(){if(!S.discovered.length)S.discovered=Array.from({length:NY},()=>Array(NX).fill(false));S.visible=Array.from({length:NY},()=>Array(NX).fill(false));const a=tile(S.p.x,S.p.y);
 for(let y=Math.max(0,a.y-6);y<=Math.min(NY-1,a.y+6);y++)for(let x=Math.max(0,a.x-6);x<=Math.min(NX-1,a.x+6);x++){if(Math.hypot(x-a.x,y-a.y)>6)continue;const end=center({x,y}),d=distance(S.p,end),n=Math.max(1,Math.ceil(d/6));let visible=true;for(let i=1;i<n;i++){const t=tile(S.p.x+(end.x-S.p.x)*i/n,S.p.y+(end.y-S.p.y)*i/n);if(t.x===x&&t.y===y)break;if(S.map[t.y]?.[t.x]!==0||gateBlocked((t.x+.5)*T,(t.y+.5)*T)){visible=false;break;}}if(visible){S.visible[y][x]=true;S.discovered[y][x]=true;}}
}
function seen(o){const t=tile(o.x,o.y);return !!S.discovered[t.y]?.[t.x];}
function visible(o){const t=tile(o.x,o.y);return !!S.visible[t.y]?.[t.x];}
function updateProjectiles(dt){for(const s of [...S.shots]){s.life-=dt;let dead=s.life<=0;const n=Math.max(1,Math.ceil(Math.hypot(s.vx,s.vy)*dt/4));for(let k=0;k<n&&!dead;k++){s.x+=s.vx*dt/n;s.y+=s.vy*dt/n;if(!walk(s.x,s.y,s.r)){dead=true;break;}const hit=s.friendly?S.enemies.find(e=>e.hp>0&&distance(e,s)<e.r+s.r):distance(S.p,s)<S.p.r+s.r;
 if(hit){if(s.friendly){hurtEnemy(hit,s.dmg,stats().crit*.4);if(s.aoe>0)for(const e of [...S.enemies])if(e!==hit&&distance(e,s)<s.aoe+e.r&&lineClear(s,e,1))hurtEnemy(e,s.dmg*.65,0);}else damagePlayer(s.dmg);dead=true;}}
 if(dead){const idx=S.shots.indexOf(s);if(idx>=0)S.shots.splice(idx,1);eventVfx('impact',s.x,s.y,s.kind==='fire'?36:12,s.kind==='fire'?'#ffb174':'#b9a6f8',.25);}}
}
function update(dt){if(!active())return;S.elapsed+=dt;S.step++;const p=S.p;for(const k of ['cd','dashCd','globalCd','ultimateCd','guard','slow','invuln','attackAnim','flash'])p[k]=Math.max(0,(p[k]||0)-dt);p.mp=Math.min(p.maxMp,p.mp+dt*3.3);
 const dx=+(keys.d||keys.ArrowRight||false)-+(keys.a||keys.ArrowLeft||false),dy=+(keys.s||keys.ArrowDown||false)-+(keys.w||keys.ArrowUp||false);
 if(dx||dy){clickGoal=null;clickPath=[];attackTarget=null;const l=Math.hypot(dx,dy);move(p,dx/l*(p.slow>0?90:156)*dt,dy/l*(p.slow>0?90:156)*dt);}
 else if(attackTarget){const e=S.enemies.find(a=>a.id===attackTarget);if(!e||!visible(e)){attackTarget=null;clickPath=[];}else{pointer.x=e.x;pointer.y=e.y;const range=S.hero==='knight'?48:210;if(distance(p,e)<=range&&lineClear(p,e,1))cast(1,e);else navigate(p,e,dt,150);}}
 else if(clickGoal){if(distance(p,clickGoal)<7){clickGoal=null;p.path=[];}else{navigate(p,clickGoal,dt,p.slow>0?90:150);if(!p.path?.length)clickGoal=null;}}
 if(keys['1'])cast(1);if(keys['2'])cast(2);if(keys['3'])cast(3);if(keys['4'])cast(4);if(keys['5'])ultimate();
 if(S.step%5===0)reveal();updateSquads(dt);for(const e of [...S.enemies])ai(e,dt);updateProjectiles(dt);
 for(const h of [...S.hazards]){h.delay-=dt;if(h.delay<=0){if(distance(h,p)<h.r+p.r&&lineClear(h,p,1))damagePlayer(h.damage);eventVfx('impact',h.x,h.y,h.r,h.kind==='meteor'?'#ffb56e':'#f3757b',.5);const idx=S.hazards.indexOf(h);if(idx>=0)S.hazards.splice(idx,1);sound('blast');}}
 for(const o of S.director.objects)if(o.kind==='trap'&&!o.used&&distance(o,p)<27&&lineClear(o,p,1)){o.used=true;S.hazards.push({x:o.x,y:o.y,r:52,delay:1.05,total:1.05,damage:12+S.floor*5,kind:'blast'});log('압력판 작동! 붉은 원을 벗어나세요.');}
 S.fx=S.fx.filter(f=>(f.t-=dt)>0);S.vfx=S.vfx.filter(f=>(f.life-=dt)>0);autoSaveClock+=dt;if(autoSaveClock>=45){autoSaveClock=0;save(true);}uiClock+=dt;if(uiClock>.15){refresh();uiClock=0;}
}
function interactionTarget(){if(!S?.director)return null;return S.director.objects.filter(o=>!o.used&&['key','chest','shrine','trap'].includes(o.kind)&&distance(o,S.p)<53&&lineClear(S.p,o,1)).sort((a,b)=>distance(a,S.p)-distance(b,S.p))[0]||null;}
function interactContent(){if(!active())return;const o=interactionTarget();if(!o){log('가까운 오브젝트로 이동하세요. 벽 너머로는 상호작용할 수 없습니다.');return;}o.used=true;
 if(o.kind==='key'){S.keyCount=1;navVersion++;S.p.pathTime=0;eventVfx('ring',o.x,o.y,65,'#f5d081',.7);log('봉인 열쇠 획득! 보스 관문이 열렸습니다.');sound('reward');}
 if(o.kind==='chest'){S.p.gold+=45*S.floor;S.drops.push({x:o.x,y:o.y,item:makeItem(choose(['sword','armor','ring']),true)});log('보물 상자 · 희귀 장비와 골드 획득');sound('reward');}
 if(o.kind==='shrine'){S.p.hp=Math.min(S.p.maxHp,S.p.hp+S.p.maxHp*.45);S.p.mp=Math.min(S.p.maxMp,S.p.mp+S.p.maxMp*.45);eventVfx('ring',o.x,o.y,75,'#7fe5ce',.9);log('고대 성소 · 체력과 마나 45% 회복');sound('heal');}
 if(o.kind==='trap'){S.materials.essence++;log('압력판을 안전하게 해체했습니다. 정수 +1');}
 reveal();refresh();
}
function pickup(){if(!active())return;let n=0;for(const d of [...S.drops])if(distance(d,S.p)<58&&lineClear(S.p,d,1)){if(S.p.inv.length>=20){log('가방이 가득 찼습니다.');break;}S.p.inv.push(d.item);S.drops.splice(S.drops.indexOf(d),1);n++;}if(n){log(`아이템 ${n}개 획득`);sound('reward');}refresh();}
function shop(kind='health'){if(!active())return;if(!atTown()){log('시작 방에서 상점을 이용하세요.');return;}if(S.p.gold<35||S.p.inv.length>=20){log('35G와 가방 공간이 필요합니다.');return;}S.p.gold-=35;S.p.inv.push(makeItem(kind));log(itemDefs[kind][0]+' 구매 · 35G');refresh();}
function sell(){if(!active())return;if(!atTown()){log('판매는 시작 방에서 가능합니다.');return;}const i=S.p.inv.findIndex(x=>x.slot!=='consumable');if(i<0)return;const item=S.p.inv.splice(i,1)[0];S.p.gold+=item.value;log(item.name+' 판매 · '+item.value+'G');refresh();}
function descend(){if(!active())return;if(distance(S.p,S.exit)>48||!lineClear(S.p,S.exit,1)){log('황금 계단에 가까이 이동하세요.');return;}if(!S.keyCount||!S.bossDead){log('열쇠 획득과 보스 처치를 완료하세요.');return;}
 if(S.floor===5){S.completed=true;paused=true;resetTransient();log('심연 군주 처치! 5개 층을 모두 정복했습니다.');save(true);refresh();return;}
 S.floor++;const seed=(S.runSeed^Math.imul(S.floor,0x9e3779b1))>>>0,d=compileDungeon(seed,S.floor);S.p.x=d.start.x;S.p.y=d.start.y;S.p.hp=Math.min(S.p.maxHp,S.p.hp+40);S.p.mp=S.p.maxMp;S.p.path=[];S.p.invuln=1;S.discovered=[];S.visible=[];S.drops=[];S.shots=[];S.fx=[];S.vfx=[];S.hazards=[];applyContent(d);resetTransient();camera.x=S.p.x;camera.y=S.p.y;reveal();log(themes[S.floor-1].name+'에 진입했습니다.');save(true);refresh();
}
function revive(){if(!S?.p.dead)return;const p=S.p,start=center(S.rooms[0].c);p.dead=false;p.hp=p.maxHp*.8;p.mp=p.maxMp*.8;p.gold=Math.floor(p.gold*.8);p.xp=Math.floor(p.xp*.85);p.x=start.x;p.y=start.y;p.invuln=2;S.shots=[];S.hazards=[];paused=false;resetTransient();for(const e of S.enemies){e.windup=null;e.pathTime=0;if(distance(e,p)<90&&e.home&&walk(e.home.x,e.home.y,e.r)){e.x=e.home.x;e.y=e.home.y;}}reveal();log('시작 방에서 부활 · 골드 20%, 현재 경험치 15% 손실');refresh();}
