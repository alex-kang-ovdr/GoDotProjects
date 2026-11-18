const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRuntime}=require('./create_test_runtime.cjs');
const root=path.resolve(process.argv[2]);const output=path.resolve(process.argv[3]);const files=process.argv.slice(4);
if(!files.length)throw Error('Usage: node run_engine_cases.cjs ROOT OUTPUT CASE_FILE...');
const {run,sandbox}=createRuntime(root);const reports=[];
const fixturePath=path.join(root,'tests/v27_fixture.json');if(fs.existsSync(fixturePath))sandbox.__DD_V27_FIXTURE__=fs.readFileSync(fixturePath,'utf8');
const minionFixturePath=path.join(root,'tests/v27_minion_fixture.json');if(fs.existsSync(minionFixturePath))sandbox.__DD_V27_MINION_FIXTURE__=fs.readFileSync(minionFixturePath,'utf8');
for(const name of files){const file=path.isAbsolute(name)?name:path.join(root,name);let source=fs.readFileSync(file,'utf8');
source=source.replace("function test(name,f){const t=performance.now();", "function test(name,f){if(name.startsWith('Render keeps')){results.push({name,pass:false,skipped:true,reason:'Requires actual browser rendering, excluded from Node VM'});return;}const t=performance.now();");
const start=Date.now();const report=run('('+source+')()',180000);report.caseFile=name;report.sourceSHA256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');report.seconds=(Date.now()-start)/1000;
if(report.results){report.skipped=report.results.filter(x=>x.skipped).length;report.failed=report.results.filter(x=>!x.pass&&!x.skipped).length;report.passed=report.results.filter(x=>x.pass).length;}
reports.push(report);}
const out={execution:'Node VM with minimal DOM/Canvas test doubles. Original embedded game code executed without runtime modifications. Does not validate browser input, pixels, WebGL, layout, audio or durable storage.',node:process.version,htmlSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'index.html'))).digest('hex'),reports};
fs.writeFileSync(output,JSON.stringify(out,null,2));console.log(JSON.stringify(reports.map(r=>({caseFile:r.caseFile,passed:r.passed,failed:r.failed,skipped:r.skipped,seconds:r.seconds}))));
for(const r of reports)for(const test of r.results||[])if(!test.pass)console.log(test.name,test.error||test.reason);
if(reports.some(r=>r.failed>0))process.exitCode=1;
