#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function sourceFingerprint(base=root){
  const hash=createHash('sha256');let files=0;
  const visit=relative=>{
    const full=path.join(base,relative),stat=fs.lstatSync(full);
    if(stat.isSymbolicLink())throw new Error('Source fingerprint does not follow symbolic links.');
    if(stat.isDirectory())for(const item of fs.readdirSync(full).sort()){
      if(['node_modules','__pycache__','.git','reports'].includes(item))continue;
      visit(path.join(relative,item));
    }
    else if(stat.isFile()) {hash.update(relative.replaceAll(path.sep,'/')+'\0');hash.update(fs.readFileSync(full));hash.update('\0');files++;}
  };
  for(const relative of ['package.json','config/example.json','server','web','games','shared','catalog','tools','scripts','tests','qa/package.json','qa/browser.e2e.mjs','automation/platform_check','automation/tests','automation/requirements.txt'])if(fs.existsSync(path.join(base,relative)))visit(relative);
  return {sha256:hash.digest('hex'),files};
}
async function command(executable,args,cwd=root){
  return await new Promise(resolve=>{
    let child,settled=false;
    const finish=result=>{if(!settled){settled=true;resolve(result);}};
    try{child=spawn(executable,args,{cwd,stdio:['ignore','pipe','pipe'],windowsHide:true});}
    catch{return finish({exitCode:null,code:'START_FAILED'});}
    let output='';
    for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output=(output+chunk.toString()).slice(-8192);});
    child.once('error',error=>finish({exitCode:null,code:error.code==='ENOENT'?'TOOL_NOT_FOUND':'PROCESS_ERROR'}));
    child.once('close',(exitCode,signal)=>{
      const testCount=Number(output.match(/Ran (\d+) tests? in/)?.[1] || output.match(/# tests (\d+)/)?.[1] || 0);
      finish({exitCode,code:signal?'TERMINATED':exitCode===0?'OK':'CHECK_FAILED',...(testCount?{testCount}:{})});
    });
  });
}
export function writeAcceptance(report,destination){
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
  const rows=report.stages.map(s=>`<tr><td>${escape(s.title)}</td><td>${escape(s.status)}</td><td>${escape(s.message)}</td><td>${s.summary?escape(JSON.stringify(s.summary)):''}</td></tr>`).join('');
  const pending=report.environmentGates.map(g=>`<li><strong>${escape(g.title)}</strong>: ${escape(g.status)} — ${escape(g.nextAction)}</li>`).join('');
  fs.writeFileSync(destination.replace(/\.json$/i,'')+'.html',`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PlayHub PoC 통합 검증</title><style>body{font:15px/1.7 system-ui,sans-serif;color:#193c32;background:#f2f5f3;max-width:1180px;margin:30px auto;padding:22px}section,header{background:white;border:1px solid #d7e3db;border-radius:12px;padding:24px;margin:18px 0}table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #dce6df;padding:12px;text-align:left;vertical-align:top}code{overflow-wrap:anywhere;font-size:11px}h1{margin:0 0 12px}.pending{border-left:5px solid #bf8b39}</style><header><h1>PoC 코드 통합 검증</h1><p><strong>${escape(report.status)}</strong> · coreVerified ${report.coreVerified}</p><p>${escape(report.generatedAt)} · ${escape(report.environment.platform)} · ${escape(report.environment.node)}</p><p>이 보고서는 실행한 범위만 판정합니다. Windows/IIS·실브라우저·실계정 Google 확인은 아래 환경 게이트로 구분합니다.</p><code>Source SHA-256: ${escape(report.source.sha256)}</code></header><section><table><thead><tr><th>단계</th><th>상태</th><th>결과</th><th>하위 집계</th></tr></thead><tbody>${rows}</tbody></table><p>검사 단위가 다르고 회귀 검사가 패키지 검사에 포함되므로 테스트 수를 합산하지 않습니다.</p></section><section class="pending"><h2>대상 환경 확인</h2><ul>${pending}</ul></section></html>`);
}
export async function runAcceptance({report:pathValue=path.join(root,'reports/acceptance.json'),withPython=false}={}){
  const destination=path.resolve(pathValue),reportDir=path.dirname(destination);
  fs.mkdirSync(reportDir,{recursive:true});
  const report={schemaVersion:1,tool:'playhub-poc-acceptance',version:'0.2.0',generatedAt:new Date().toISOString(),status:'running',coreVerified:false,environment:{platform:process.platform,node:process.version},source:sourceFingerprint(),stages:[],environmentGates:[
    {id:'WINDOWS_IIS',title:'실제 Windows/IIS 설치와 공유',status:'not_run',nextAction:'설치 PC에서 scripts/Test-PoC.ps1 실행 후 두 번째 PC 접속·재부팅을 확인합니다.'},
    {id:'BROWSER',title:'실브라우저 8게임·저장·관리자 UI',status:'not_run',nextAction:'Test-Browser.ps1 -InstallTools -WithAdmin을 실행합니다.'},
    {id:'GOOGLE',title:'Google 실제 계정 연결',status:'not_run',nextAction:'본인 OAuth client 설정 후 계정 선택·취소·저장 연결·로그아웃을 확인합니다.'}
  ]};
  const stage=async(id,title,args,filename,executable=process.execPath,cwd=root)=>{
    console.log('Checking: '+title);
    const target=filename?path.join(reportDir,filename):null;
    if(target && fs.existsSync(target))fs.rmSync(target);
    const started=Date.now(),result=await command(executable,args,cwd);
    let evidence=null;
    if(target && fs.existsSync(target)){try{evidence=JSON.parse(fs.readFileSync(target,'utf8'));}catch{}}
    const valid=result.exitCode===0 && (!target || evidence && !evidence.summary?.fail && evidence.ok!==false);
    const testCount=evidence?.checks?.find(c=>c.id==='VERIFY-TESTS')?.evidence?.tests || result.testCount;
    const row={id,title,status:valid?'pass':'fail',exitCode:result.exitCode,durationMs:Date.now()-started,message:valid?'이번 실행에서 완료했습니다.':`실행 실패 (${result.code}). 해당 도구의 개별 보고서를 확인하세요.`,...(evidence?.summary?{summary:evidence.summary}:testCount?{summary:{tests:testCount}}:{}),...(testCount?{testCount}:{}),...(target?{reportFile:path.relative(root,target).replaceAll(path.sep,'/')}:{} )};
    if(id==='PYTHON_REGRESSION'){
      const regressionPath=path.join(reportDir,'python-regression.json');
      fs.writeFileSync(regressionPath,JSON.stringify({kind:'python-validator-regression',generatedAt:new Date().toISOString(),environment:{platform:process.platform},status:row.status,exitCode:result.exitCode,tests:testCount||null,command:'python -m unittest discover -s tests -q'},null,2)+'\n');
      row.reportFile=path.relative(root,regressionPath).replaceAll(path.sep,'/');
    }
    report.stages.push(row);return valid;
  };
  const built=await stage('BUILD','사용자·관리자·8게임 배포 빌드',['tools/build.mjs']);
  if(built){
    await stage('VERIFY','파일·구문·SEO와 전체 Node 회귀',['tools/verify.mjs','--tests','--report',path.join(reportDir,'verification.json')],'verification.json');
    await stage('HTTP','8종 공개 상태의 HTTP 전체 흐름',['tools/check-stack.mjs','--report',path.join(reportDir,'stack-smoke.json')],'stack-smoke.json');
    await stage('HTTP_DISABLED','기존 비공개 게임을 유지하는 HTTP 흐름',['tools/check-stack.mjs','--disabled-game','memory-pairs','--report',path.join(reportDir,'disabled-game-smoke.json')],'disabled-game-smoke.json');
  }else report.stages.push({id:'DEPENDENT_CHECKS',title:'빌드 이후 검사',status:'skip',message:'빌드가 실패해 오래된 산출물로 후속 검사를 수행하지 않았습니다.'});
  if(withPython && built){
    const interpreter=process.env.PLAYHUB_PYTHON || (process.platform==='win32'?'python':'python3');
    await stage('PYTHON_CONTRACTS','전체 JSON Schema·카탈로그·자산 검사',['-m','platform_check','all','--project',path.join(root,'dist/user'),'--report',path.join(reportDir,'python-static.json')],'python-static.json',interpreter,path.join(root,'automation'));
    await stage('PYTHON_REGRESSION','Python 검사기 회귀',['-m','unittest','discover','-s','tests','-q'],null,interpreter,path.join(root,'automation'));
  }else report.stages.push({id:'PYTHON_CONTRACTS',title:'선택형 Python 전체 계약 검사',status:'skip',message:built?'--with-python을 지정하면 실행합니다. Node 필수 검증과 별도입니다.':'빌드 실패로 오래된 산출물의 Python 검사를 생략했습니다.'});
  const after=sourceFingerprint();
  report.stages.push({id:'SOURCE_STABILITY',title:'검사 중 소스 변경 여부',status:after.sha256===report.source.sha256?'pass':'fail',message:after.sha256===report.source.sha256?'검사를 시작한 소스와 종료한 소스가 같습니다.':'검사 중 코드가 변경됐습니다. 최종 소스로 다시 실행해야 합니다.'});
  report.summary=Object.fromEntries(['pass','fail','skip'].map(status=>[status,report.stages.filter(s=>s.status===status).length]));
  report.coreVerified=report.summary.fail===0 && built;
  report.status=report.coreVerified?'code_verified_environment_pending':'failed';
  report.generatedAt=new Date().toISOString();writeAcceptance(report,destination);return report;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const options={},args=process.argv.slice(2);
  try{
    for(let i=0;i<args.length;i++){
      if(args[i]==='--with-python')options.withPython=true;
      else if(args[i]==='--report' && args[i+1] && !args[i+1].startsWith('--'))options.report=args[++i];
      else if(args[i]==='--help'){console.log('node tools/acceptance.mjs [--with-python] [--report FILE.json]\nRuns fresh build, Node regressions, isolated HTTP checks (including existing disabled content), and optional Python checks. Does not claim Windows, browser or Google verification.');process.exit(0);}
      else throw new Error('Unknown option. Use --help.');
    }
    const report=await runAcceptance(options);console.log(JSON.stringify({status:report.status,coreVerified:report.coreVerified,summary:report.summary,report:path.resolve(options.report||path.join(root,'reports/acceptance.json'))},null,2));process.exitCode=report.coreVerified?0:1;
  }catch(error){console.error('Acceptance could not finish: '+String(error.message).slice(0,400));process.exitCode=2;}
}
