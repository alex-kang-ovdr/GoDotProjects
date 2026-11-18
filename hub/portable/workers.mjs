import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {readInstanceConfig} from './prepare.mjs';
import {createAdminStaticServer} from './static-server.mjs';

/** Runs a child service. Authentication and database rules remain in the existing backend. */
export async function runWorker({role,appRoot,instanceRoot} = {}) {
  if(!['api','admin'].includes(role))throw new Error('Worker role must be api or admin.');
  const {layout,config}=readInstanceConfig({appRoot,instanceRoot});
  let resource,closing,requested=false,starting=true;
  async function close() {
    requested=true;
    if(closing)return closing;
    if(!resource||starting)return;
    closing=(async()=>{process.off('message',onMessage);process.off('disconnect',onDisconnect);process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);await resource.close();})();
    return closing;
  }
  async function shutdown() {
    try {await close();if(process.connected)await new Promise(resolve=>process.send({type:'stopped',role},()=>resolve()));}
    catch {process.exitCode=1;}
    finally {if(process.connected)process.disconnect();}
  }
  function onMessage(message){if(message?.type==='shutdown')void shutdown();}
  function onDisconnect(){void shutdown();}
  function onSignal(){void shutdown();}
  process.on('message',onMessage);process.once('disconnect',onDisconnect);process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
  try {
    let ready;
    if(role==='api') {
      const {createApp}=await import(pathToFileURL(path.join(layout.appRoot,'server/app.mjs')).href);
      resource=createApp(config,{rootDir:layout.workspaceRoot});
      if(requested){starting=false;await close();return {role,close};}
      const addresses=await resource.listen();ready={type:'ready',role,public:addresses.public,admin:addresses.admin};
    } else {
      resource=createAdminStaticServer({root:layout.adminRoot,port:config.adminUiPort,adminApiPort:config.adminPort});
      if(requested){starting=false;await close();return {role,close};}
      const address=await resource.listen();ready={type:'ready',role,address:address.address,port:address.port,url:`http://127.0.0.1:${address.port}`,service:'admin-static'};
    }
    starting=false;
    if(requested){await close();return {role,close};}
    if(process.connected)await new Promise((resolve,reject)=>process.send(ready,error=>error?reject(error):resolve()));
    return {role,ready,close,resource};
  } catch(error) {starting=false;await close();process.off('message',onMessage);process.off('disconnect',onDisconnect);process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);throw error;}
}
