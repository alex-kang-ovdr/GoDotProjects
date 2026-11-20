/* Versioned local progression and portable backups. No DOM or storage access. */
(function(G){
  'use strict';
  const TREES=['archer','barracks','mage','artillery','meteor','reinforcements'];
  const MODES=['campaign','heroic','iron'],RULES=['assisted','reference'],LAYOUTS=['authored','reconstructed'],DIFFICULTIES=['casual','normal','veteran'];
  const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
  const num=(v,max=1e9)=>Number.isFinite(v)?Math.max(0,Math.min(max,v)):0;
  const ranks=()=>Object.fromEntries(TREES.map(k=>[k,0]));
  function empty(){return{version:18,best:{},records:{},upgrades:ranks(),referenceUpgrades:ranks(),settings:{difficulty:'normal',sound:false,speed:1,ruleset:'assisted',layout:'reconstructed',tactics:false},tutorial:false};}
  function earned(s){return Object.values(s.best).reduce((n,v)=>n+v.stars,0);}
  function cost(data,key,rank,reference){return reference?(data.starUpgrades||[]).filter(u=>u.runtimeTree===key&&u.tier<=rank).reduce((n,u)=>n+u.costStars,0):rank*(rank+1)/2;}
  function fitBudget(data,s,reference){let left=earned(s),tree=reference?s.referenceUpgrades:s.upgrades;for(const k of TREES){while(tree[k]>0&&cost(data,k,tree[k],reference)>left)tree[k]--;left-=cost(data,k,tree[k],reference);}}
  function numberMap(source,ids){const out={};if(object(source))for(const id of ids){if(Number.isFinite(source[id])&&source[id]>=0)out[id]=num(source[id]);}return out;}
  function record(data,r,stageId,mode,ruleset,layout,difficulty){
    if(!object(r)||r.won!==true||r.cheated===true)return null;
    const out={won:true,cheated:false,stageId,mode,ruleset,layout,difficulty};
    for(const k of ['lives','maxLives','kills','duration','gold','goldEarned','damage','spent','leaks','escapedEnemies','lifeLoss','unitLosses','facilityHires','sunrayShots','stageEventSpawns'])if(Number.isFinite(r[k]))out[k]=num(r[k]);
    out.stars=Math.floor(num(r.stars,mode==='campaign'?3:1));
    for(const k of ['killsByEnemy','leaksByEnemy','lifeLossByEnemy'])out[k]=numberMap(r[k],Object.keys(data.enemies));
    out.damageByType=numberMap(r.damageByType,['physical','magic','magical','explosive','true']);out.spellCasts=numberMap(r.spellCasts,['meteor','reinforcements']);
    if(Array.isArray(r.towerPerformance))out.towerPerformance=r.towerPerformance.slice(0,2000).filter(t=>object(t)&&typeof t.defId==='string'&&(Object.hasOwn(data.towers,t.defId)||Object.hasOwn(data.specialComponents?.facilities||{},t.defId))).map(t=>({id:Math.floor(num(t.id)),defId:t.defId,nameKo:(data.towers[t.defId]?.nameKo||data.specialComponents.facilities[t.defId]?.name||t.defId),kind:data.towers[t.defId]?'tower':'facility',sold:t.sold===true,damage:num(t.damage),kills:Math.floor(num(t.kills)),invested:num(t.invested)}));
    return out;
  }
  function normalize(data,input){
    const out=empty();if(!object(input)||![15,16,17,18].includes(input.version))return out;
    for(const stage of data.stages)for(const mode of MODES){
      const key=stage.id+':'+mode,b=input.best?.[key];if(object(b))out.best[key]={stars:Math.floor(num(b.stars,mode==='campaign'?3:1)),bestKills:Math.floor(num(b.bestKills))};
      for(const rules of RULES)for(const layout of LAYOUTS)for(const diff of DIFFICULTIES){const rk=[key,rules,layout,diff].join(':'),r=record(data,input.records?.[rk],stage.id,mode,rules,layout,diff);if(r)out.records[rk]=r;}
    }
    for(const k of TREES){out.upgrades[k]=Math.floor(num(input.upgrades?.[k],3));out.referenceUpgrades[k]=Math.floor(num(input.referenceUpgrades?.[k],5));}
    const settings=input.settings||{};for(const [k,valid] of Object.entries({difficulty:DIFFICULTIES,ruleset:RULES,layout:LAYOUTS,speed:[.75,1,1.5,2]}))if(valid.includes(settings[k]))out.settings[k]=settings[k];
    out.settings.sound=settings.sound===true;out.settings.tactics=settings.tactics===true;out.tutorial=input.tutorial===true;
    fitBudget(data,out,false);fitBudget(data,out,true);return out;
  }
  function merge(data,current,incoming){
    const a=normalize(data,current),b=normalize(data,incoming),out=normalize(data,a);
    for(const [k,v] of Object.entries(b.best)){const old=out.best[k]||{};out.best[k]={stars:Math.max(old.stars||0,v.stars),bestKills:Math.max(old.bestKills||0,v.bestKills)};}
    for(const [k,r] of Object.entries(b.records)){const old=out.records[k];if(!old||r.stars>old.stars||r.stars===old.stars&&(r.lives||0)>(old.lives||0)||r.stars===old.stars&&r.lives===old.lives&&(r.duration||Infinity)<(old.duration||Infinity))out.records[k]=r;}
    // Keep the current user's controls and allocation; importing merges achievements.
    return out;
  }
  function backup(progress,session){return{format:'kingdom-rush-backup',version:18,exportedAt:new Date().toISOString(),progress,session:session||null};}
  function parseBackup(data,text){
    if(typeof text!=='string'||text.length>8*1024*1024)throw new Error('백업 파일은 8MB 이하여야 합니다.');
    let input;try{input=JSON.parse(text);}catch(_){throw new Error('JSON 형식의 백업 파일을 선택하세요.');}
    if(!object(input)||input.format!=='kingdom-rush-backup'||input.version!==18||!object(input.progress)||![15,16,17,18].includes(input.progress.version))throw new Error('이 파일은 호환되는 Kingdom Rush v18 백업이 아닙니다.');
    const progress=normalize(data,input.progress);let session=null;
    if(input.session!==null&&input.session!==undefined){
      const s=input.session;if(!object(s)||s.format!=='kingdom-rush-session'||s.version!==18)throw new Error('전투 저장 형식을 확인할 수 없습니다.');
      const info=G.KRCheckpoint.describe(data,s.battle);if(!info.valid)throw new Error('전투 복원 실패: '+info.reason);
      session={format:s.format,version:18,battle:s.battle,camera:G.KRCamera.normalize(s.camera)};
    }
    return{progress,session,stars:earned(progress),stageCount:Object.keys(progress.best).length};
  }
  G.KRProgress={empty,normalize,merge,backup,parseBackup,earned};
})(globalThis);
