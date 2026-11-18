function stats(){let p=S.p,eq=Object.values(p.eq).filter(Boolean);let sum=k=>eq.reduce((a,i)=>a+(i[k]||0),0);return{atk:p.baseAtk+sum('atk')+(p.passives?.power||0)*3,def:p.baseDef+sum('def')+(p.passives?.fortitude||0)*2,crit:clamp(p.crit+sum('crit'),0,.7),resist:clamp(sum('resist'),0,75),leech:sum('leech'),life:sum('life'),mf:(p.passives?.fortune||0)*18,bonusAtk:(p.passives?.power||0)*3,bonusDef:(p.passives?.fortitude||0)*2}}
function makeItem(kind,forceRare=false){let d=itemDefs[kind],rarity=kind==='health'||kind==='mana'?'normal':forceRare?'rare':choose(['normal','normal','normal','magic','magic','rare']);if(d[2]!=='consumable'&&!forceRare&&S?.p){let chance=(S.p.passives?.fortune||0)*.035;if(random()<chance)rarity='rare';else if(rarity==='normal'&&random()<chance*2)rarity='magic'}let mult=rarity==='rare'?2.1:rarity==='magic'?1.45:1,lv=S?.floor||1;let i={id:'item-'+(S.nextId++),kind,slot:d[2],name:(rarity==='rare'?'빛나는 ':rarity==='magic'?'마력의 ':'')+d[0],symbol:d[1],rarity,value:rand(8,22)*lv};if(i.slot==='weapon')i.atk=Math.ceil((rand(3,7)+lv*2)*mult);if(i.slot==='armor'||i.slot==='helm')i.def=Math.ceil((rand(1,4)+lv)*mult);if(i.slot==='ring')i.crit=Math.round((.02+lv*.005)*(mult)*100)/100;if(i.slot!=='consumable'&&i.slot!=='ring'&&random()<.38){i.sockets=rarity==='normal'?2:1;i.gems=[];i.name='홈이 있는 '+i.name}if(i.slot!=='consumable'&&rarity!=='normal'){let pool=[...affixes];for(let n=0;n<(rarity==='rare'?2:1);n++){let a=pool.splice(rand(0,pool.length-1),1)[0];i[a.atk?'atk':a.def?'def':a.crit?'crit':a.resist?'resist':a.leech?'leech':'life']=(i[a.atk?'atk':a.def?'def':a.crit?'crit':a.resist?'resist':a.leech?'leech':'life']||0)+Object.values(a)[1];i.name=a.name+' '+i.name}}return i}

function levelCheck(){let p=S.p;while(p.xp>=p.level*65){p.xp-=p.level*65;p.level++;p.points++;p.baseAtk+=2;p.baseDef++;p.maxHp+=14;p.maxMp+=9;p.hp=p.maxHp;p.mp=p.maxMp;log(`레벨 ${p.level}! 스킬 포인트 +1`)}}

function useItem(index){let p=S.p,it=p.inv[index];if(!it||S.p.dead||paused||S.completed)return;if(it.slot==='consumable'){if(it.kind==='health')p.hp=Math.min(p.maxHp,p.hp+75+p.level*8);else p.mp=Math.min(p.maxMp,p.mp+65+p.level*5);p.inv.splice(index,1);log(`${it.name} 사용`)}else{let old=p.eq[it.slot];p.eq[it.slot]=it;p.inv.splice(index,1);if(old)p.inv.push(old);log(`${it.name} 장착`)}refresh()}
function potion(kind){let i=S.p.inv.findIndex(x=>x.kind===kind);if(i<0){log('물약이 없습니다.');return}useItem(i)}
function equipOff(slot){let p=S.p;if(p.dead||paused||S.completed)return;if(!p.eq[slot])return;if(p.inv.length>=20){log('인벤토리가 가득 찼습니다.');return}p.inv.push(p.eq[slot]);p.eq[slot]=null;refresh()}
function upgrade(kind){let p=S.p;if(p.dead||paused||S.completed||!Object.hasOwn(p.skills,kind))return;if(p.points<=0){log('스킬 포인트가 부족합니다.');return}if(p.skills[kind]>=15){log('스킬 최대 레벨입니다.');return}p.points--;p.skills[kind]++;log(`${skillNames[S.hero][{fire:1,whirl:2,heal:3}[kind]]} 강화!`);refresh()}
function trainPassive(kind){let p=S.p;if(paused||p.dead||S.completed||!['power','fortitude','fortune'].includes(kind))return;if(p.points<1){log('스킬 포인트가 부족합니다.');return}p.passives??={power:0,fortitude:0,fortune:0};if((p.passives[kind]||0)>=5){log('패시브 최대 레벨 5');return}p.points--;p.passives[kind]++;if(kind==='fortitude'){p.maxHp+=12;p.hp+=12}log(({power:'전투 숙련',fortitude:'강인함',fortune:'행운'})[kind]+' 강화!');refresh()}

function atTown(){const r=S.rooms[0],t=tile(S.p.x,S.p.y);return t.x>=r.x&&t.x<r.x+r.w&&t.y>=r.y&&t.y<r.y+r.h;}
function materials(){if(!S.materials)S.materials={essence:0,runes:0};return S.materials}
function salvage(){if(!atTown()){log('제작은 시작 방에서만 가능합니다.');return}let idx=S.p.inv.findIndex(i=>i.slot!=='consumable');if(idx<0){log('분해할 장비가 없습니다.');return}let item=S.p.inv.splice(idx,1)[0],n=item.rarity==='rare'?4:item.rarity==='magic'?2:1;materials().essence+=n;log(`${item.name} 분해 → 정수 ${n}개`);refresh()}
function forge(){if(!atTown()){log('시작 방에서만 강화할 수 있습니다.');return}let p=S.p,m=materials(),slot=Object.keys(p.eq).find(k=>p.eq[k]);if(!slot){log('먼저 장비를 장착하세요.');return}if(m.essence<3||p.gold<100){log('강화에는 정수 3개와 100G가 필요합니다.');return}let item=p.eq[slot];if((item.enhance||0)>=5){log('강화 최대치 +5입니다.');return}m.essence-=3;p.gold-=100;item.enhance=(item.enhance||0)+1;if(slot==='weapon')item.atk=(item.atk||0)+3;else if(slot==='ring')item.crit=(item.crit||0)+.015;else item.def=(item.def||0)+2;item.name=item.name.replace(/ \+\d+$/,'')+' +'+item.enhance;log(`장비 강화 성공: ${item.name}`);refresh()}
function inscribe(){if(!atTown()){log('시작 방에서만 룬을 각인할 수 있습니다.');return}let p=S.p,m=materials();if(m.runes<2||m.essence<2){log('룬 2개와 정수 2개가 필요합니다.');return}let slot=Object.keys(p.eq).find(k=>p.eq[k]&&!p.eq[k].inscribed);if(!slot){log('룬을 각인할 미각인 장착 장비가 없습니다.');return}m.runes-=2;m.essence-=2;let it=p.eq[slot];it.inscribed=true;it.resist=(it.resist||0)+12;it.leech=(it.leech||0)+.025;it.name='ᚱ '+it.name;log('룬 각인: 저항 +12, 생명력 흡수 +2.5%');refresh()}
function gamble(){if(!atTown()){log('도박 상점은 시작 방에서만 이용 가능합니다.');return}let p=S.p;if(p.gold<120||p.inv.length>=20){log('120G 또는 인벤토리 공간이 필요합니다.');return}p.gold-=120;let it=makeItem(choose(['sword','axe','staff','armor','helm','ring']),random()<.2);p.inv.push(it);log(`도박 상점에서 ${it.name} 획득`);refresh()}



const runeNames=['ᚠ 화염','ᚢ 생명','ᚦ 수호'];
function socketRune(kind){
 if(S.p.dead||paused||S.completed)return;
 if(!atTown()){log('룬 소켓 작업은 시작 방에서만 가능합니다.');return}
 let m=materials(),p=S.p;
 if(m.runes<1){log('룬 재료가 1개 필요합니다.');return}
 let it=Object.values(p.eq).find(i=>i&&i.sockets&&(!i.gems||i.gems.length<i.sockets));
 if(!it){log('빈 소켓이 있는 장비를 먼저 장착하세요.');return}
 it.gems=it.gems||[];it.gems.push(kind);m.runes--;
 if(kind==='fire')it.atk=(it.atk||0)+4;
 if(kind==='life')it.def=(it.def||0)+3;
 if(kind==='ward')it.resist=(it.resist||0)+8;
 if(it.gems.length===2&&it.rarity==='normal'){
  const sequence=it.gems.join('-');
  if(sequence==='fire-life'){it.name='불사조의 맹세 '+itemDefs[it.kind][0];it.atk=(it.atk||0)+15;it.leech=(it.leech||0)+.08;it.runeword=true;log('룬워드 완성: 불사조의 맹세!')}
  else if(sequence==='ward-ward'){it.name='철벽의 서약 '+itemDefs[it.kind][0];it.def=(it.def||0)+18;it.resist=(it.resist||0)+18;it.runeword=true;log('룬워드 완성: 철벽의 서약!')}
  else log('룬 삽입 완료. 조합 효과 없음');
 }else log('룬 삽입 완료: '+runeNames[['fire','life','ward'].indexOf(kind)]);
 refresh();
}
