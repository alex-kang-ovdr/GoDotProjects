// XXVIII encounter adapters. These are explicit WEB combat profiles, not MonStats.txt.
// Damage budgets, phase thresholds, windups and summons remain the existing game rules.
// Poison below is an immediate resisted venom burst; it is not original poison-frame data.
const ENCOUNTER_ELEMENTS28 = Object.freeze({
 physical: Object.freeze({label:'물리',color:'#f2d79d'}),
 fire: Object.freeze({label:'화염',color:'#ff955a'}),
 cold: Object.freeze({label:'냉기',color:'#8cd8ff'}),
 lightning: Object.freeze({label:'번개',color:'#f5f0b0'}),
 poison: Object.freeze({label:'독',color:'#96d279'}),
 magic: Object.freeze({label:'마법',color:'#c5c5ff'})
});
const ENCOUNTER_PROFILES28 = Object.freeze({
 andariel: Object.freeze({id:'andariel',label:'독성 분출',shotElement:'poison',hazardElement:'poison',resistances:Object.freeze({poison:50}),adapter:true}),
 duriel: Object.freeze({id:'duriel',label:'빙결 파동',shotElement:'cold',hazardElement:'cold',resistances:Object.freeze({cold:40,physical:10}),adapter:true}),
 mephisto: Object.freeze({id:'mephisto',label:'번개와 서리',shotElement:'lightning',hazardElement:'cold',resistances:Object.freeze({lightning:40,cold:25}),adapter:true}),
 diablo: Object.freeze({id:'diablo',label:'번개와 화염',shotElement:'lightning',hazardElement:'fire',resistances:Object.freeze({fire:50,lightning:25}),adapter:true}),
 baal: Object.freeze({id:'baal',label:'서리와 화염',shotElement:'cold',hazardElement:'fire',resistances:Object.freeze({cold:40,fire:25}),adapter:true})
});
const ELITE_RESISTS28 = Object.freeze({armored:Object.freeze({physical:20}),frost:Object.freeze({cold:40}),volatile:Object.freeze({fire:40})});
const ACT_CASTER_ELEMENTS28 = Object.freeze(['poison','fire','lightning','fire','cold']);
function encounterProfile28(e){
 const profile=e&&ENCOUNTER_PROFILES28[e.questFlag];
 if(profile)return profile;
 const element=e?.modifier==='frost'?'cold':e?.type==='caster'?ACT_CASTER_ELEMENTS28[clamp((AREA[S.world.areaId]?.act||S.floor||1)-1,0,4)]:'magic';
 return {id:e?.modifier||'field',label:e?.modifier==='vampiric'?'흡혈':ENCOUNTER_ELEMENTS28[element].label+' 공격',shotElement:element,hazardElement:element,resistances:ELITE_RESISTS28[e?.modifier]||{},adapter:true};
}
const scaleEnemyBeforeEncounters28=scaleEnemy;
scaleEnemy=function(e,level){
 const enemy=scaleEnemyBeforeEncounters28(e,level),profile=ENCOUNTER_PROFILES28[enemy.questFlag],resists=profile?.resistances||ELITE_RESISTS28[enemy.modifier];
 if(resists)for(const [element,value]of Object.entries(resists))enemy.resists[element]=value;
 // Called only by new encounter generation; loading area snapshots never reapplies this.
 return enemy;
};
const fireShotBeforeEncounters28=fireShot;
fireShot=function(from,angle,speed,damage,kind,friendly=true,aoe=0){
 if(!friendly&&(from?.sealed||from?.hp<=0))return;
 fireShotBeforeEncounters28(from,angle,speed,damage,kind,friendly,aoe);
 if(friendly)return;
 const shot=S.shots.at(-1),profile=encounterProfile28(from),element=profile.shotElement;
 shot.element=element;shot.kind=element;shot.sourceId=from?.id;shot.encounterAdapter=28;
};
const aiBeforeEncounters28=ai;
ai=function(e,dt){
 if(e.sealed||e.hp<=0)return;
 const hazardStart=S.hazards.length;
 aiBeforeEncounters28(e,dt);
 if(e.windup)e.windup.element=e.windup.kind==='melee'?'physical':encounterProfile28(e).shotElement;
 // Only annotate this enemy's new telegraph. Existing hazards retain their own source.
 for(let i=hazardStart;i<S.hazards.length;i++){
  const hazard=S.hazards[i];
  if(!hazard.element){hazard.element=encounterProfile28(e).hazardElement;hazard.sourceId=e.id;hazard.encounterAdapter=28;}
 }
};
const resolveWindupBeforeEncounters28=resolveWindup;
resolveWindup=function(e){
 if(!e||e.sealed||e.hp<=0)return;
 const special=e.windup?.kind==='melee'&&['frost','vampiric'].includes(e.modifier);
 if(!special)return resolveWindupBeforeEncounters28(e);
 const beforeHp=S.p.hp,petHealth=S.minions.map(m=>[m,m.hp]);
 resolveWindupBeforeEncounters28(e);
 const playerDamage=Math.max(0,beforeHp-S.p.hp);
 const petDamage=petHealth.reduce((sum,[m,hp])=>sum+Math.max(0,Math.min(hp,hp-Math.max(0,m.hp))),0);
 // Effects require actual damage, so misses, blocks and invulnerability never trigger them.
 if(e.modifier==='frost'&&playerDamage>0&&!S.p.dead&&!stats().mods.cannotBeFrozen){
  S.p.slow=Math.max(S.p.slow||0,1.4);eventVfx('ring',S.p.x,S.p.y,22,ENCOUNTER_ELEMENTS28.cold.color,.3);
 }
 if(e.modifier==='vampiric'&&playerDamage+petDamage>0){
  const healed=Math.min(e.maxHp-e.hp,(playerDamage+petDamage)*.18);
  if(healed>0){e.hp+=healed;float(e.x,e.y-20,'흡혈 +'+Math.ceil(healed),'#d59eaf');}
 }
};
const restoredBeforeEncounters28=updateRestoredSystems;
updateRestoredSystems=function(dt){
 restoredBeforeEncounters28(dt);
 // Pressure traps and volatile deaths already create delayed blasts. Keep their
 // damage and delay, but classify those otherwise-untyped explosions as web fire.
 for(const hazard of S.hazards)if(!hazard.element&&hazard.kind==='blast'){
  hazard.element='fire';hazard.encounterAdapter=28;
 }
};
// Overlay uses the same projection as the game, without mutating state or consuming RNG.
// The existing orange danger area remains; its exact perimeter gets an element color/label.
function drawEncounterWarnings28(){
 if(!S||paused||S.p.dead||S.completed||mapExpanded)return;
 h.save();
 for(const hazard of S.hazards){
  if(!hazard.element||!seen(hazard))continue;
  const element=ENCOUNTER_ELEMENTS28[hazard.element]||ENCOUNTER_ELEMENTS28.magic,p=project(hazard.x,hazard.y,0);
  const sx=hazard.r/T/13.5*W/2*camera.zoom,sy=hazard.r/T*.84/8.9*H/2*camera.zoom;
  if(p.x+sx<0||p.x-sx>W||p.y+sy<0||p.y-sy>H)continue;
  h.beginPath();h.ellipse(p.x,p.y,sx,sy,0,0,TAU);h.strokeStyle=element.color;h.lineWidth=3;h.setLineDash([6,3]);h.stroke();h.setLineDash([]);
  label(element.label+' · '+Math.max(0,hazard.delay).toFixed(1)+'s',p.x,p.y-17,12,element.color);
 }
 for(const shot of S.shots){
  if(shot.friendly||!shot.element||!visible(shot))continue;
  const element=ENCOUNTER_ELEMENTS28[shot.element]||ENCOUNTER_ELEMENTS28.magic,p=project(shot.x,shot.y,renderMode==='3d'?.53:0);
  if(p.x<-10||p.x>W+10||p.y<-10||p.y>H+10)continue;
  h.beginPath();h.arc(p.x,p.y,4.5,0,TAU);h.fillStyle=element.color;h.fill();h.strokeStyle='#0b1017';h.lineWidth=1.5;h.stroke();
 }
 h.restore();
}
const renderHUDBeforeEncounters28=renderHUD;
renderHUD=function(){renderHUDBeforeEncounters28();drawEncounterWarnings28();};
