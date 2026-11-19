"use strict";
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {createGoogleIdVerifier}=require('./google-id-verifier.cjs');
const {createAccountPlatformApi,accountKey}=require('./account-platform-api.cjs');
const {PlatformStore}=require('./platform-store.cjs');
const {createLoginSessions}=require('./login-sessions.cjs');
const {PlayHubDraftStore}=require('./playhub-draft-store.cjs');

// Legacy opt-in standalone account gateway (superseded by Hub Google login +
// single-domain /forge/* integration; see docs/architecture/hub-forge-integration.md).
// Disabled by default. Never falls through to the shared local server.
function createPrivatePlatformServer(options={}) {
  let api,verify; const sessions=createLoginSessions();
  const syncErrors=new Map();
  const drafts=new PlayHubDraftStore({enabled:options.playHubDrafts===true,directory:options.playHubDraftDirectory});
  const hubAccountRedirect=typeof options.hubAccountUrl==='string'&&options.hubAccountUrl.trim()?options.hubAccountUrl.trim():null;
  if(options.enabled===true) {
    if(!options.root||!options.directory)throw new TypeError('Explicit private storage paths required');
    const origin=new URL(options.publicOrigin);
    if(origin.protocol!=='https:'||origin.origin!==options.publicOrigin)throw new TypeError('Exact HTTPS origin required');
    verify=options.verifyToken||createGoogleIdVerifier({clientId:options.googleClientId});
    if(typeof verify!=='function')throw new TypeError('Token verifier required');
    api=createAccountPlatformApi({root:options.root,directory:options.directory,verifyIdentity:req=>req.verifiedIdentity, onStore:options.projectSync ? (key,store)=>options.projectSync.attachStore(key,store,{onError:e=>syncErrors.set(key+':'+e.projectId,'cloud_sync_failed')}) : undefined});
  }
  const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  const server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost');
      if(hubAccountRedirect && (url.pathname==='/account'||url.pathname.startsWith('/account/'))) {
        res.writeHead(302,{Location:hubAccountRedirect,'Cache-Control':'no-store'});return res.end();
      }
      if(options.accountUi===true && req.method==='GET') {
        if(url.pathname==='/api/auth/config')return send(res,200,{enabled:!!api,clientId:api?options.googleClientId||null:null,cloudSync:!!api&&!!options.projectSync,playHubDrafts:!!api&&options.playHubDrafts===true});
        const assets={'/account':'index.html','/account/':'index.html','/account/app.js':'app.js','/account/style.css':'style.css'};
        const asset=assets[url.pathname];
        if(asset){
          res.writeHead(200,{'Content-Type':asset.endsWith('.js')?'text/javascript; charset=utf-8':asset.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'self' https://accounts.google.com/gsi/client; connect-src 'self' https://accounts.google.com/gsi/; frame-src https://accounts.google.com/gsi/; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; img-src 'self' https://*.googleusercontent.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"});
          return res.end(fs.readFileSync(path.join(__dirname,'../PrivateAccount',asset)));
        }
      }
      if(!api)return send(res,503,{error:'Account service disabled'});
      if(req.headers.origin&&req.headers.origin!==options.publicOrigin)return send(res,403,{error:'Foreign origin'});
      if(url.pathname==='/api/auth/challenge'&&req.method==='POST') {
        if(req.headers.origin!==options.publicOrigin)return send(res,403,{error:'Origin required'});
        const challenge=sessions.challenge();res.setHeader('Set-Cookie',challenge.setCookie);
        return send(res,200,{nonce:challenge.nonce});
      }
      if(url.pathname==='/api/auth/login'&&req.method==='POST') {
        if(req.headers.origin!==options.publicOrigin)return send(res,403,{error:'Origin required'});
        if(!String(req.headers['content-type']||'').startsWith('application/json'))return send(res,415,{error:'JSON required'});
        if(Number(req.headers['content-length'])>20000)return send(res,413,{error:'Request too large'});
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>20000)return send(res,413,{error:'Request too large'});chunks.push(chunk);}
        let body;try{body=JSON.parse(Buffer.concat(chunks));}catch{return send(res,400,{error:'Invalid JSON'});}
        const nonce=sessions.consumeChallenge(req.headers.cookie);
        const identity=await verify(body?.credential,{nonce});
        const issued=sessions.issue(identity,req.headers.cookie);res.setHeader('Set-Cookie',issued.setCookie);
        return send(res,200,{authenticated:true,expiresAt:new Date(issued.expires).toISOString()});
      }
      if(url.pathname==='/api/auth/logout'&&req.method==='POST') {
        if(req.headers.origin!==options.publicOrigin)return send(res,403,{error:'Origin required'});
        res.setHeader('Set-Cookie',sessions.logout(req.headers.cookie));return send(res,200,{authenticated:false});
      }
      const auth=req.headers.authorization;
      if(auth!==undefined) {
        if(typeof auth!=='string'||!auth.startsWith('Bearer ')||auth.length>16400)return send(res,401,{error:'Authentication required'});
        req.verifiedIdentity=await verify(auth.slice(7));
        if(Number.isFinite(req.verifiedIdentity.exp)){const timer=setTimeout(()=>res.end(),Math.max(0,req.verifiedIdentity.exp*1000-Date.now()));timer.unref?.();res.once('close',()=>clearTimeout(timer));}
      } else {
        if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==options.publicOrigin)return send(res,403,{error:'Origin required'});
        const session=sessions.authenticate(req.headers.cookie);req.verifiedIdentity=session.identity;sessions.track(session.id,res);
      }
      accountKey(req.verifiedIdentity);
      if(url.pathname==='/api/auth/me'&&req.method==='GET')return send(res,200,{authenticated:true,accountId:accountKey(req.verifiedIdentity)});
      const cloud=url.pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})\/cloud(?:\/(history|retry\/([1-9][0-9]*)))?$/);
      if(cloud) {
        if(!options.projectSync)return send(res,503,{error:'Cloud sync disabled'});
        const key=accountKey(req.verifiedIdentity),id=cloud[1];
        const store=new PlatformStore(options.root,path.join(options.directory,key));store.getProject(id);
        const publicVersion=v=>({revision:v.revision,state:v.state,bytes:v.bytes,sha256:v.sha256,attempts:v.attempts,lastError:v.lastError});
        if(cloud[2]==='history'&&req.method==='GET')return send(res,200,{versions:options.projectSync.listVersions(key,id).map(publicVersion),lastSyncError:syncErrors.get(key+':'+id)||null});
        if(req.method==='POST'&&(!cloud[2]||cloud[3])) {
          const version=cloud[3]?await options.projectSync.retryVersion(key,id,Number(cloud[3])):await options.projectSync.syncProject(store,key,id);
          syncErrors.delete(key+':'+id);return send(res,200,{version:publicVersion(version),cloudCommitted:version.state==='committed'});
        }
        return send(res,405,{error:'Method not supported'});
      }
      const bridge=url.pathname.match(/^\/api\/playhub\/projects\/([a-f0-9]{24})\/(export|draft)$/);
      if(bridge&&((bridge[2]==='export'&&req.method==='GET')||(bridge[2]==='draft'&&req.method==='POST'))) {
        const store=new PlatformStore(options.root,path.join(options.directory,accountKey(req.verifiedIdentity)));
        const project=store.getProject(bridge[1]);
        const release=store.listReleases(project.id).find(r=>r.id===project.activeReleaseId);
        if(!release)return send(res,409,{error:'A project release is required'});
        if(bridge[2]==='draft')return send(res,201,drafts.stage(accountKey(req.verifiedIdentity),project,release));
        const id='playforge-'+project.id;
        return send(res,200,{schemaVersion:1,publicationPending:true,projectId:project.id,revision:release.revision,releaseId:release.id,
          catalogEntry:{id,path:id,enabled:false,priority:0,kind:'imported',displayName:project.name}});
      }
      if(await api(req,res,url))return;
      return send(res,404,{error:'Route not enabled'});
    }catch(error){return send(res,error.status===404?404:error.status===401?401:503,{error:error.status===404?'Project not found':error.status===401?'Authentication required':'Service unavailable'});}
  });
  server.on('upgrade',(_req,socket)=>{socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');});
  server.on('close',()=>{api?.close();sessions.close();});
  return server;
}
module.exports={createPrivatePlatformServer};
