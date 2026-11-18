import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {randomBytes,scryptSync} from 'node:crypto';
import {createApp} from '../server/app.mjs';
import {createStaticServer} from './dev.mjs';
import {build,projectRoot} from './build.mjs';
import {runSmoke,saveReport} from './smoke.mjs';

// Every service and request lives in this invocation; no installed data is used.
export async function checkStack({report:reportPath=path.join(projectRoot,'reports/stack-smoke.json'),disabledGame=null}={}){
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'playhub-stack-'));
  const report=path.resolve(reportPath);
  let app,user,admin;
  const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
  try{
    for(const name of ['web','games','shared','catalog'])fs.cpSync(path.join(projectRoot,name),path.join(temporary,name),{recursive:true,dereference:false});
    build({root:temporary});
    user=createStaticServer(path.join(temporary,'dist/user'));admin=createStaticServer(path.join(temporary,'dist/admin'));
    const userPort=await listen(user),adminUiPort=await listen(admin);
    const password=randomBytes(24).toString('base64url'),salt=randomBytes(16).toString('hex');
    const config={publicHost:'127.0.0.1',adminHost:'127.0.0.1',publicPort:0,adminPort:0,userOrigins:[`http://127.0.0.1:${userPort}`],adminOrigins:[`http://127.0.0.1:${adminUiPort}`],userBaseUrl:`http://127.0.0.1:${userPort}`,adminBaseUrl:`http://127.0.0.1:${adminUiPort}`,publicBaseUrl:'http://127.0.0.1',dataDir:path.join(temporary,'data'),secureCookies:false,google:{clientId:'',clientSecret:'',redirectUri:''},admin:{username:'admin',salt,passwordHash:scryptSync(password,salt,64).toString('hex')}};
    app=createApp(config,{rootDir:temporary});
    if(disabledGame){
      const catalog=JSON.parse(fs.readFileSync(path.join(temporary,'catalog/games.json'),'utf8'));
      if(!catalog.entries.some(game=>game.id===disabledGame))throw new Error('Disabled-game scenario requires a registered game.');
      app.db.prepare('INSERT INTO game_overrides(game_id,enabled,updated_at) VALUES(?,?,?)').run(disabledGame,0,Date.now());
    }
    const addresses=await app.listen();
    config.publicPort=addresses.public.port;config.adminPort=addresses.admin.port;
    build({root:temporary,config});
    const data=await runSmoke({user:config.userBaseUrl,admin:config.adminBaseUrl,publicApi:`http://127.0.0.1:${addresses.public.port}`,adminApi:`http://127.0.0.1:${addresses.admin.port}`,report,requireAllGames:!disabledGame},{username:'admin',password});
    const check=(id,title,fn)=>{
      try{const result=fn();data.checks.push({id,title,status:'pass',...result});}
      catch(error){data.checks.push({id,title,status:'fail',message:String(error.message).slice(0,300)});}
    };
    check('STACK-QA-ISOLATION','격리 DB의 실제/QA 데이터 분리',()=>{
      const counts=app.db.prepare("SELECT (SELECT count(*) FROM events WHERE traffic_type='live') liveEvents,(SELECT count(*) FROM events WHERE traffic_type='qa') qaEvents,(SELECT count(*) FROM play_sessions WHERE traffic_type='live') livePlays,(SELECT count(*) FROM play_sessions WHERE traffic_type='qa') qaPlays").get();
      if(counts.liveEvents!==0 || counts.livePlays!==0 || counts.qaEvents<1 || counts.qaPlays<1)throw new Error('QA 요청이 실제 이용 영역에 섞였거나 QA 기록이 없습니다.');
      return {message:'실제 이벤트·플레이 0건, QA 영역에만 검증 기록 생성 확인',evidence:{...counts}};
    });
    if(disabledGame)check('STACK-DISABLED-PRESERVED','기존 비공개 상태 보존',()=>{
      const row=app.db.prepare('SELECT enabled FROM game_overrides WHERE game_id=?').get(disabledGame);
      if(row?.enabled!==0)throw new Error('기존 비공개 게임의 운영 상태가 변경됐습니다.');
      return {message:'다른 게임의 상태 변경·복구 검사 후에도 기존 비공개 상태를 유지했습니다.',evidence:{gameId:disabledGame}};
    });
    data.isolation={temporaryDatabase:true,installedDataModified:false,server:'Node static development server; not IIS',disabledGame};
    data.summary=Object.fromEntries(['pass','fail','warning','skip'].map(status=>[status,data.checks.filter(check=>check.status===status).length]));
    data.ok=data.summary.fail===0;
    saveReport(data,report);
    return data;
  }finally{
    for(const server of [user,admin])if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    if(app)await app.close();
    fs.rmSync(temporary,{recursive:true,force:true});
  }
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const options={},args=process.argv.slice(2);
  try{
    for(let i=0;i<args.length;i++){
      if(args[i]==='--help'){console.log('node tools/check-stack.mjs [--report FILE.json] [--disabled-game GAME_ID]');process.exit(0);}
      if(!['--report','--disabled-game'].includes(args[i]) || !args[i+1] || args[i+1].startsWith('--'))throw new Error('Use --help for supported options.');
      options[args[i]==='--report'?'report':'disabledGame']=args[++i];
    }
    const report=await checkStack(options);console.log(JSON.stringify({ok:report.ok,summary:report.summary,report:path.resolve(options.report||path.join(projectRoot,'reports/stack-smoke.json'))},null,2));process.exitCode=report.ok?0:1;
  }catch(error){console.error('Isolated stack check could not finish: '+String(error.message).slice(0,400));process.exitCode=2;}
}
