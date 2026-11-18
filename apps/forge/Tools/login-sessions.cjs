"use strict";
const crypto=require('node:crypto');
const {accountKey}=require('./account-platform-api.cjs');
const SESSION='__Host-pf-session',CHALLENGE='__Host-pf-login';
const unauthorized=()=>Object.assign(new Error('Authentication required'),{status:401});
function cookieValue(header,name) {
 const values=String(header||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
 if(values.length!==1)return null;const value=values[0].slice(name.length+1);return /^[a-f0-9]{64}$/.test(value)?value:null;
}
function cookie(name,value,maxAge) {return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;}
function createLoginSessions({now=Date.now,maxEntries=1024,sessionSeconds=3600,challengeSeconds=300}={}) {
 if(!Number.isSafeInteger(maxEntries)||maxEntries<1||!Number.isSafeInteger(sessionSeconds)||sessionSeconds<1||sessionSeconds>86400||!Number.isSafeInteger(challengeSeconds)||challengeSeconds<1||challengeSeconds>600)throw new TypeError('Invalid session limits');
 const sessions=new Map(),challenges=new Map();
 const revoke=id=>{const entry=sessions.get(id);if(entry){sessions.delete(id);for(const res of entry.responses)res.end();entry.responses.clear();}};
 function prune(){for(const [id,e] of challenges)if(e.expires<=now())challenges.delete(id);for(const [id,e] of sessions)if(e.expires<=now())revoke(id);}
 return {
  challenge(){prune();if(challenges.size>=maxEntries)throw Object.assign(new Error('Login capacity reached'),{status:429});const id=crypto.randomBytes(32).toString('hex'),nonce=crypto.randomBytes(32).toString('hex');challenges.set(id,{nonce,expires:now()+challengeSeconds*1000});return {nonce,setCookie:cookie(CHALLENGE,id,challengeSeconds)};},
  consumeChallenge(header){prune();const id=cookieValue(header,CHALLENGE);const e=challenges.get(id);challenges.delete(id);if(!e)throw unauthorized();return e.nonce;},
  issue(identity,oldHeader){prune();accountKey(identity);if(!Number.isFinite(identity.exp)||identity.exp*1000<=now())throw unauthorized();if(sessions.size>=maxEntries)throw Object.assign(new Error('Session capacity reached'),{status:429});revoke(cookieValue(oldHeader,SESSION));const id=crypto.randomBytes(32).toString('hex');const expires=Math.min(now()+sessionSeconds*1000,identity.exp*1000);const e={identity:Object.freeze({iss:identity.iss,sub:identity.sub,exp:identity.exp}),expires,responses:new Set()};sessions.set(id,e);return {setCookie:[cookie(SESSION,id,Math.floor((expires-now())/1000)),cookie(CHALLENGE,'',0)],expires};},
  authenticate(header){prune();const id=cookieValue(header,SESSION),entry=sessions.get(id);if(!entry)throw unauthorized();return {id,...entry};},
  track(id,res){const e=sessions.get(id);if(!e)return; e.responses.add(res);const timer=setTimeout(()=>{e.responses.delete(res);res.end();},Math.max(0,e.expires-now()));timer.unref?.();res.once('close',()=>{clearTimeout(timer);e.responses.delete(res);});},
  logout(header){revoke(cookieValue(header,SESSION));return [cookie(SESSION,'',0),cookie(CHALLENGE,'',0)];},
  close(){for(const id of sessions.keys())revoke(id);challenges.clear();}
 };
}
module.exports={createLoginSessions,cookieValue,SESSION,CHALLENGE};
