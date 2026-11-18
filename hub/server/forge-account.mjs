import { resolve, isAbsolute, relative } from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const fail=(status,code)=>Object.assign(new Error(code),{status,code});
const send=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
// Only a verified Hub session and its persisted Google identity can select an owner.
export function googleIdentityForSession(db,session){
  if(!session?.principal_id || session.traffic_type==='qa')throw fail(401,'GOOGLE_LOGIN_REQUIRED');
  const user=db.prepare('SELECT kind FROM users WHERE id=?').get(session.principal_id);
  const identities=db.prepare('SELECT subject FROM identities WHERE provider=? AND user_id=?').all('google',session.principal_id);
  if(user?.kind!=='registered'||identities.length!==1)throw fail(401,'GOOGLE_LOGIN_REQUIRED');
  const identity={iss:'https://accounts.google.com',sub:identities[0].subject};if(typeof identity.sub!=='string'||!identity.sub||identity.sub.length>255||/[\x00-\x20\x7f]/.test(identity.sub))throw fail(401,'GOOGLE_LOGIN_REQUIRED');return identity;
}
export function createHubForge({config={},db,requireSession,root,env=process.env,fetchImpl=globalThis.fetch}={}){
  if(config.enabled!==true)return {async handle(req,res,url){if(!url.pathname.startsWith('/api/platform/'))return false;send(res,503,{error:'FORGE_DISABLED'});return true;},close(){}};
  const {createAccountPlatformApi,accountKey}=require('../../forge/Tools/account-platform-api.cjs');
  const {OwnedBuildPackages}=require('../../forge/Tools/owned-build-packages.cjs');
  const {PlatformStore}=require('../../forge/Tools/platform-store.cjs');
  const {DriveSnapshotStore}=require('../../forge/Tools/drive-snapshot-store.cjs');
  const {SubmissionDriveArchive}=require('../../forge/Tools/submission-drive-archive.cjs');
  const {ProjectDriveSync}=require('../../forge/Tools/project-drive-sync.cjs');
  const {createOperatorOAuthToken}=require('../../forge/Tools/operator-oauth-token.cjs');
  if(typeof requireSession!=='function'||!isAbsolute(config.directory||'')||!isAbsolute(root||''))throw fail(503,'FORGE_CONFIGURATION_REQUIRED');
  const rel=relative(root,config.directory);if(!rel||(!rel.startsWith('..')&&!isAbsolute(rel)))throw fail(503,'PRIVATE_STORAGE_MUST_BE_OUTSIDE_SOURCE');
  const builds=new OwnedBuildPackages({root:resolve(root,'forge'),directory:config.directory,enabled:config.builds?.enabled===true});
  let oauth,sync,submissions,deployments;const errors=new Map();
  if(config.drive?.enabled===true){
    oauth=createOperatorOAuthToken({enabled:true,fetchImpl,secretsProvider:()=>({clientId:env.PLAYHUB_DRIVE_CLIENT_ID,clientSecret:env.PLAYHUB_DRIVE_CLIENT_SECRET,refreshToken:env.PLAYHUB_DRIVE_REFRESH_TOKEN})});
    const drive=new DriveSnapshotStore({enabled:true,folderId:config.drive.folderId,getAccessToken:oauth.getAccessToken,fetchImpl});
    sync=new ProjectDriveSync({enabled:true,directory:resolve(config.directory,'cloud-manifests'),drive});
    if(config.packages?.enabled===true){
      if(!config.drive.packageFolderId||config.drive.packageFolderId===config.drive.folderId)throw fail(503,'SEPARATE_PACKAGE_FOLDER_REQUIRED');
      const {DeploymentZipArchive}=require('../../forge/Tools/deployment-zip-archive.cjs');
      const {DriveZipStore}=require('../../forge/Tools/drive-zip-store.cjs');
      const packageDrive=new DriveZipStore({enabled:true,folderId:config.drive.packageFolderId,getAccessToken:oauth.getAccessToken,fetchImpl});
      deployments=new DeploymentZipArchive({enabled:true,directory:resolve(config.directory,'deployment-manifests'),drive:packageDrive,resolveOwnedPackage:(key,id,release)=>builds.resolve(key,id,release)});
    }
    submissions=new SubmissionDriveArchive({enabled:true,directory:resolve(config.directory,'submission-manifests'),drive,
      resolveOwnedRelease:(key,projectId,releaseId)=>{
        const store=new PlatformStore(root,resolve(config.directory,'accounts',key));
        const project=store.read(projectId);const release=project.releases.find(r=>r.id===releaseId);
        if(!release)throw fail(404,'RELEASE_NOT_FOUND');
        return {accountKey:key,projectId,releaseId,revision:release.revision,files:release.files};
      }});
  }
  const directory=resolve(config.directory,'accounts');
  const identity=req=>googleIdentityForSession(db,requireSession(req,'public'));
  const api=createAccountPlatformApi({root,directory,verifyIdentity:identity,validateBuildForAccount:(key,buildId,id,revision)=>builds.validate(key,buildId,id,revision),onStore:sync?(key,store)=>sync.attachStore(key,store,{onError:e=>errors.set(key+':'+e.projectId,'CLOUD_SYNC_FAILED')}):undefined});
  const publicRow=({revision,state,bytes,sha256,attempts,lastError})=>({revision,state,bytes,sha256,attempts,lastError});
  return {async handle(req,res,url){
    if(!url.pathname.startsWith('/api/platform/'))return false;
    try{
      // Reject alternate identity channels. Hub owns authentication and CSRF.
      if(req.headers.authorization)throw fail(401,'HUB_SESSION_REQUIRED');
      const key=accountKey(identity(req));
      const buildRoute=url.pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})\/builds(?:\/([a-f0-9]{16}))?$/);
      if(buildRoute){
        const store=new PlatformStore(root,resolve(directory,key));const project=store.getProject(buildRoute[1]);
        if(req.method==='POST'&&!buildRoute[2]){send(res,202,{build:builds.enqueue(key,project.id,project.revision)});return true;}
        if(req.method==='GET'&&buildRoute[2]){send(res,200,{build:builds.publicJob(builds.job(key,project.id,buildRoute[2]))});return true;}
        throw fail(405,'METHOD_NOT_ALLOWED');
      }
      const deployment=url.pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})\/deployments\/([a-f0-9]{24})$/);
      if(deployment){
        if(!deployments)throw fail(503,'DEPLOYMENT_ARCHIVE_DISABLED');
        const input={accountKey:key,projectId:deployment[1],releaseId:deployment[2]};
        if(req.method==='POST'){send(res,200,await deployments.archive(input));return true;}
        if(req.method==='GET'){send(res,200,await deployments.status(input));return true;}
        throw fail(405,'METHOD_NOT_ALLOWED');
      }
      const submission=url.pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})\/submissions\/([a-f0-9]{24})$/);
      if(submission){
        if(!submissions)throw fail(503,'CLOUD_SYNC_DISABLED');
        const input={accountKey:key,projectId:submission[1],releaseId:submission[2]};
        if(req.method==='POST'){send(res,200,await submissions.archive(input));return true;}
        if(req.method==='GET'){send(res,200,await submissions.status(input));return true;}
        throw fail(405,'METHOD_NOT_ALLOWED');
      }
      const cloud=url.pathname.match(/^\/api\/platform\/projects\/([a-f0-9]{24})\/cloud(?:\/(history|retry\/([1-9][0-9]*)))?$/);
      if(cloud){
        if(!sync)throw fail(503,'CLOUD_SYNC_DISABLED');
        const store=new PlatformStore(root,resolve(directory,key));store.getProject(cloud[1]);
        if(req.method==='GET'&&cloud[2]==='history'){send(res,200,{versions:sync.listVersions(key,cloud[1]).map(publicRow),lastSyncError:errors.get(key+':'+cloud[1])||null});return true;}
        if(req.method==='POST'&&(!cloud[2]||cloud[3])){const row=cloud[3]?await sync.retryVersion(key,cloud[1],Number(cloud[3])):await sync.syncProject(store,key,cloud[1]);send(res,200,{version:publicRow(row),cloudCommitted:row.state==='committed'});return true;}
        throw fail(405,'METHOD_NOT_ALLOWED');
      }
      return await api(req,res,url);
    }catch(e){send(res,[401,403,404,405].includes(e.status)?e.status:503,{error:[401,403,404,405].includes(e.status)?'ACCESS_DENIED':'SERVICE_UNAVAILABLE'});return true;}
  },close(){api.close();builds.close();oauth?.close();}};
}
