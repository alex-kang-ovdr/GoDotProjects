import { createHash } from 'node:crypto';
import { createForgeGateway } from './forge-gateway.mjs';
const fail=(status,code)=>Object.assign(new Error(code),{status,code});
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
const ALLOWED_FORGE_ISSUERS = new Set([
  'accounts.google.com',
  'https://accounts.google.com',
  'https://playhub.local/auth/email',
  'https://playhub.local/auth/naver',
]);
function canonicalForgeIssuer(iss) {
  if (iss === 'accounts.google.com' || iss === 'https://accounts.google.com') return 'https://accounts.google.com';
  return ALLOWED_FORGE_ISSUERS.has(iss) ? iss : null;
}
function validSub(sub) {
  return typeof sub === 'string' && Boolean(sub) && sub.length <= 255 && !/[\x00-\x20\x7f]/.test(sub);
}
// Only a verified Hub session and its persisted registered identity (Google, email, or Naver) can select an owner.
export function googleIdentityForSession(db,session){
  if(!session?.principal_id || session.traffic_type==='qa')throw fail(401,'GOOGLE_LOGIN_REQUIRED');
  const user=db.prepare('SELECT kind FROM users WHERE id=?').get(session.principal_id);
  if(user?.kind!=='registered')throw fail(401,'GOOGLE_LOGIN_REQUIRED');
  const googleIds=db.prepare('SELECT subject FROM identities WHERE provider=? AND user_id=?').all('google',session.principal_id);
  if(googleIds.length>1)throw fail(401,'GOOGLE_LOGIN_REQUIRED');
  if(googleIds.length===1){
    const identity={iss:'https://accounts.google.com',sub:googleIds[0].subject};
    if(!validSub(identity.sub))throw fail(401,'GOOGLE_LOGIN_REQUIRED');
    return identity;
  }
  for(const provider of ['email','naver']){
    const rows=db.prepare('SELECT subject FROM identities WHERE provider=? AND user_id=?').all(provider,session.principal_id);
    if(rows.length===1 && validSub(rows[0].subject)){
      return {iss:`https://playhub.local/auth/${provider}`,sub:rows[0].subject};
    }
  }
  throw fail(401,'GOOGLE_LOGIN_REQUIRED');
}
export function forgeAccountKey(identity){
  const iss=canonicalForgeIssuer(identity?.iss);
  if(!iss||!validSub(identity?.sub))throw fail(401,'GOOGLE_LOGIN_REQUIRED');
  return createHash('sha256').update(iss+'\0'+identity.sub).digest('hex');
}
export function createHubForge({config={},db,requireSession,root,env=process.env,fetchImpl=globalThis.fetch,gateway}={}){
  if(config.enabled!==true)return {async handle(req,res,url){if(!url.pathname.startsWith('/api/platform/'))return false;send(res,503,{error:'FORGE_DISABLED'});return true;},close(){}};
  if(typeof requireSession!=='function')throw fail(503,'FORGE_CONFIGURATION_REQUIRED');
  // All Forge code and storage access goes through the gateway (see forge-gateway.mjs).
  const forge=gateway||createForgeGateway({config,root,env,fetchImpl});
  const ownsGateway=!gateway;
  const identity=req=>googleIdentityForSession(db,requireSession(req,'public'));
  return {async handle(req,res,url){
    if(!url.pathname.startsWith('/api/platform/'))return false;
    try{
      // Reject alternate identity channels. Hub owns authentication and CSRF.
      if(req.headers.authorization)throw fail(401,'HUB_SESSION_REQUIRED');
      const id=identity(req);
      return await forge.handlePlatform(req,res,url,{accountKey:forgeAccountKey(id),identity:id});
    }catch(e){send(res,[401,403,404,405].includes(e.status)?e.status:503,{error:[401,403,404,405].includes(e.status)?'ACCESS_DENIED':'SERVICE_UNAVAILABLE'});return true;}
  },close(){if(ownsGateway)forge.close();}};
}
