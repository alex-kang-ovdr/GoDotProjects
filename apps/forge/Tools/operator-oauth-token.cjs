"use strict";
const ENDPOINT='https://oauth2.googleapis.com/token';
const fail=code=>Object.assign(new Error(code),{code,status:503});
const safeSecret=value=>typeof value==='string'&&value.length>0&&value.length<=8192&&!/[\r\n\0]/.test(value);
function createOperatorOAuthToken({enabled=false,secretsProvider,fetchImpl=globalThis.fetch,now=Date.now,timeoutMs=15000}={}){
  if(enabled===true&&(typeof secretsProvider!=='function'||typeof fetchImpl!=='function'))throw fail('operator_oauth_configuration_required');
  if(typeof now!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw fail('operator_oauth_configuration_invalid');
  let cached=null,pending=null,generation=0,closed=false,lastError=null;
  const invalidate=()=>{generation++;cached=null;};
  async function refresh(epoch){
    let secrets;
    try{secrets=await secretsProvider();}catch{throw fail('operator_oauth_secrets_unavailable');}
    if(!secrets||!safeSecret(secrets.clientId)||!safeSecret(secrets.clientSecret)||!safeSecret(secrets.refreshToken))throw fail('operator_oauth_secrets_unavailable');
    const started=now();if(!Number.isFinite(started))throw fail('operator_oauth_clock_invalid');
    let response;
    try{
      response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({client_id:secrets.clientId,client_secret:secrets.clientSecret,refresh_token:secrets.refreshToken,grant_type:'refresh_token'}).toString()});
    }catch{throw fail('operator_oauth_transport_failed');}
    let data;
    try{data=await response.json();}catch{throw fail('operator_oauth_invalid_response');}
    if(!response.ok)throw fail(data?.error==='invalid_grant'?'operator_oauth_reauthorization_required':'operator_oauth_refresh_failed');
    if(!safeSecret(data?.access_token)||String(data.token_type).toLowerCase()!=='bearer'||!Number.isSafeInteger(data.expires_in)||data.expires_in<1||data.expires_in>86400)throw fail('operator_oauth_invalid_response');
    const expiresAt=started+data.expires_in*1000;
    const refreshAt=expiresAt-Math.min(60000,data.expires_in*500);
    if(closed||epoch!==generation)throw fail('operator_oauth_refresh_invalidated');
    if(now()>=expiresAt)throw fail('operator_oauth_response_expired');
    cached={token:data.access_token,expiresAt,refreshAt,issuedAt:started};lastError=null;return cached.token;
  }
  async function getAccessToken(){
    if(enabled!==true||closed)throw fail('operator_oauth_disabled');
    const time=now();
    if(cached&&Number.isFinite(time)&&time>=cached.issuedAt&&time<cached.refreshAt)return cached.token;
    if(pending)return pending;
    cached=null;
    const epoch=generation;
    const work=refresh(epoch).catch(e=>{cached=null;lastError=e.code||'operator_oauth_refresh_failed';throw fail(lastError);});
    pending=work;
    try{return await work;}finally{if(pending===work)pending=null;}
  }
  return Object.freeze({getAccessToken,invalidate,close(){closed=true;invalidate();},
    status(){return {enabled:enabled===true&&!closed,cached:!!cached,expiresAt:cached?.expiresAt||null,refreshing:!!pending,lastError};}});
}
module.exports={createOperatorOAuthToken};
