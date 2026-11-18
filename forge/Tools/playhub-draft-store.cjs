"use strict";
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
class PlayHubDraftStore {
 constructor({enabled=false,directory}={}){this.enabled=enabled===true;if(this.enabled&&!directory)throw new TypeError('Private draft directory required');this.directory=directory&&path.resolve(directory);}
 file(account,project){if(!this.enabled)throw Object.assign(new Error('PlayHub draft staging disabled'),{status:503});if(!/^[a-f0-9]{64}$/.test(account)||!/^[a-f0-9]{24}$/.test(project))throw new TypeError('Invalid draft identity');return path.join(this.directory,account,project+'.json');}
 stage(account,project,release){const target=this.file(account,project.id);if(!release||!/^[a-f0-9]{24}$/.test(release.id)||!Number.isSafeInteger(release.revision)||release.revision<1)throw new TypeError('Release required');
 const id='playforge-'+project.id;const draft={schemaVersion:1,publicationPending:true,projectId:project.id,revision:release.revision,releaseId:release.id,catalogEntry:{id,path:id,enabled:false,priority:0,kind:'imported',displayName:project.name}};
 fs.mkdirSync(path.dirname(target),{recursive:true});const temporary=target+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';try{fs.writeFileSync(temporary,JSON.stringify(draft,null,2),{flag:'wx',mode:0o600});fs.renameSync(temporary,target);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}return draft;}
 get(account,project){try{return JSON.parse(fs.readFileSync(this.file(account,project),'utf8'));}catch(e){if(e.code==='ENOENT')throw Object.assign(new Error('Draft not found'),{status:404});throw e;}}
}
module.exports={PlayHubDraftStore};
