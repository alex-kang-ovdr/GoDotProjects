"use strict";
const crypto = require('node:crypto');
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
function createGoogleIdVerifier({clientId, fetchImpl=fetch, now=Date.now}={}) {
  if (typeof clientId !== 'string' || !clientId.trim()) throw new TypeError('Google client ID required');
  let keys=[],expires=0,pending=null,lastRefresh=-Infinity;
  const fail=()=>{throw Object.assign(new Error('Invalid Google identity token'),{status:401});};
  async function refresh() {
    if(pending)return pending;
    if(now()-lastRefresh<30000) return;
    lastRefresh=now();
    pending=(async()=>{
      const r=await fetchImpl(JWKS_URL,{redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!r.ok)fail();
      const text=await r.text();if(Buffer.byteLength(text)>65536)fail();
      const data=JSON.parse(text);
      if(!Array.isArray(data.keys)||!data.keys.length||data.keys.length>20)fail();
      keys=data.keys.filter(k=>k.kty==='RSA'&&k.alg==='RS256'&&k.use==='sig'&&typeof k.kid==='string');
      const maxAge=/max-age=(\d+)/i.exec(r.headers.get('cache-control')||'');
      expires=now()+Math.min(3600,Math.max(0,Number(maxAge?.[1]||300)))*1000;
    })().finally(()=>{pending=null;});
    return pending;
  }
  return async function verify(token,{nonce}={}) {
    try {
      if(typeof token!=='string'||token.length>16384)fail();
      const parts=token.split('.');if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))fail();
      const h=JSON.parse(Buffer.from(parts[0],'base64url'));const c=JSON.parse(Buffer.from(parts[1],'base64url'));
      if(!h||h.alg!=='RS256'||typeof h.kid!=='string'||h.kid.length>128||h.crit||h.jku||h.jwk)fail();
      if(now()>=expires||!keys.some(k=>k.kid===h.kid))await refresh();
      if(now()>=expires)fail();
      const matches=keys.filter(k=>k.kid===h.kid);if(matches.length!==1)fail();
      const key=crypto.createPublicKey({key:matches[0],format:'jwk'});
      if(!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url')))fail();
      const seconds=now()/1000;
      if(!['accounts.google.com','https://accounts.google.com'].includes(c.iss)||
        typeof c.sub!=='string'||!c.sub||c.sub.length>255||/[\x00-\x20\x7f]/.test(c.sub)||
        !Number.isFinite(c.exp)||c.exp<=seconds||!Number.isFinite(c.iat)||c.iat>seconds+60||c.exp<=c.iat)fail();
      const audiences=typeof c.aud==='string'?[c.aud]:c.aud;
      if(!Array.isArray(audiences)||!audiences.includes(clientId)||audiences.some(a=>typeof a!=='string')||
        ((audiences.length>1||c.azp!==undefined)&&c.azp!==clientId))fail();
      if(c.nbf!==undefined&&(!Number.isFinite(c.nbf)||c.nbf>seconds+60))fail();
      if(nonce!==undefined&&(typeof nonce!=='string'||!nonce||c.nonce!==nonce))fail();
      return Object.freeze({iss:'https://accounts.google.com',sub:c.sub,exp:c.exp});
    } catch {fail();}
  };
}
module.exports={createGoogleIdVerifier,JWKS_URL};
