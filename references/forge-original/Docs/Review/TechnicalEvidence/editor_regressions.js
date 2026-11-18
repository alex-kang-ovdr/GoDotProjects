const fs=require('fs'),vm=require('vm'),assert=require('assert');
const file=process.argv[2]; if(!file)throw Error('Usage: node editor_regressions.js <v16-editor-index.html>');
const html=fs.readFileSync(file,'utf8');
const undo=html.match(/function undo\(\)\{[^\n]+/)[0],redo=html.match(/function redo\(\)\{[^\n]+/)[0];
const init=`const deep=x=>JSON.parse(JSON.stringify(x));let projects={A:{value:0},B:{value:10}},projectName='A',history=[],future=[];const cur=()=>projects[projectName];function render(){if(!cur())throw Error('current project undefined')}function save(){};`;
let c=vm.createContext({});vm.runInContext(init+undo+redo,c);
console.log('drag_undo_original_push:',html.match(/history.push\(pointerState.snapshot\)/)?.[0]);
try{vm.runInContext('history.push({value:0});projects.A.value=1;undo()',c);console.log('drag undo: no error')}catch(e){console.log('REPRODUCED drag undo throws:',e.message)}
c=vm.createContext({});vm.runInContext(init+undo+redo,c);
vm.runInContext("history.push({projectName:'A',state:{value:0}});projects.A.value=1;projectName='B';undo();redo();",c);
console.log('cross_project_after_redo:',vm.runInContext('JSON.stringify({projectName,projects})',c));
assert.equal(vm.runInContext('projects.A.value',c),0);console.log('REPRODUCED A edit not restored by redo after project switch (expected A.value=1)');
