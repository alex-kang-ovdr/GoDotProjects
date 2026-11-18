const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRuntime}=require('./create_test_runtime.cjs');
const root=path.resolve(process.argv[2]||'.'),{run,sandbox}=createRuntime(root);
sandbox.__V26=fs.readFileSync(path.join(root,'tests/v26_fixture.json'),'utf8');
const report=run(`(()=>{const q=DarkDescentQA,old=JSON.parse(__V26).state;q.restore(__V26);const checks={version:q.S.version===28,hero:q.S.hero===old.hero,level:q.S.p.level===old.p.level,rng:old.rngState===q.S.rngState,map:JSON.stringify(old.map)===JSON.stringify(q.S.map),items:q.S.p.inv.length===old.p.inv.length};return{checks,pass:Object.values(checks).every(Boolean),from:old.version,to:q.S.version,hero:q.S.hero,level:q.S.p.level};})()`);
report.scope='Inherited v26_fixture.json from XXVII archive; tested restore, character, map and RNG in Node VM, not original client parity.';
report.htmlSHA256=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'index.html'))).digest('hex');
fs.writeFileSync(path.join(root,'tests/legacy_v26_results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));if(!report.pass)process.exitCode=1;
