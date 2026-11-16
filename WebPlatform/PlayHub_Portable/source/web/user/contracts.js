/* Small pure rules shared by the real portal and its automated contract tests. */
(function(root){
  'use strict';
  const trustedConnect=(event,active)=>Boolean(active&&!active.closed&&!active.port&&event.source===active.iframe.contentWindow&&event.origin==='null'&&event.data&&event.data.type==='playhub:connect'&&event.data.version===1&&event.data.nonce===active.nonce);
  const allowsLocal=error=>error?.code==='NETWORK'||[401,502,503,504].includes(error?.status);
  const eligibleImpression=(item,now,visible)=>Boolean(visible&&item.ratio>=.5&&!item.recorded&&now-item.started>=1000);
  const activeDelta=(active,now,visible)=>active.ready&&!active.paused&&visible&&active.ratio>=.5&&now>=active.lastPulse&&now-active.lastPulse<2600?Math.min(Math.max(now-active.lastTick,0),1000):0;
  const authFailure=error=>(error?.status===401&&error?.code!=='PLAY_FIRST')||(error?.status===403&&error?.code==='CSRF_INVALID');
  const sameSession=(before,after)=>Boolean(before?.csrfToken&&after?.csrfToken&&before.csrfToken===after.csrfToken);
  const saveLoadChoice=(cached,serverRevision)=>!cached?.dirty?'server':cached.baseRevision===serverRevision?'local':'conflict';
  const restoreRequest=(entry,mainRevision)=>{
    if(!Number.isInteger(mainRevision)||mainRevision<0)throw new Error('이어하기 기록의 버전을 확인해 주세요.');
    if(entry?.backupId&&typeof entry.backupId==='string')return {backupId:entry.backupId,expectedMainRevision:mainRevision};
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(entry?.slot||'')||entry.slot==='main'||!Number.isInteger(entry.revision)||entry.revision<1)throw new Error('복구할 보관 기록이 올바르지 않습니다.');
    return {sourceSlot:entry.slot,expectedSourceRevision:entry.revision,expectedMainRevision:mainRevision};
  };
  root.PortalRules={trustedConnect,allowsLocal,eligibleImpression,activeDelta,authFailure,sameSession,saveLoadChoice,restoreRequest};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.PortalRules;
})(globalThis);
