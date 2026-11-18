import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// This project deliberately uses a small, buildless ES-module subset.
// Package that known subset into one dependency-free HTML file; reject anything else.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dist=resolve(root,'dist'),modules=new Map(),order=[];
function collect(name){
 if(modules.has(name))return;
 let code=readFileSync(resolve(dist,name+'.js'),'utf8');const imports=[];
 code=code.replace(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?\s*$/gm,(_,binding,path)=>{
  if(!/^\.\/[a-z-]+\.js$/.test(path))throw Error('Only project-local imports are supported: '+path);
  const dependency=basename(path,'.js');imports.push(dependency);
  if(/^\* as \w+$/.test(binding.trim()))return 'const '+binding.trim().slice(5)+'=__modules["'+dependency+'"];';
  if(/^\{[\s\S]*\}$/.test(binding.trim()))return 'const '+binding.trim().replace(/\bas\b/g,':')+'=__modules["'+dependency+'"];';
  throw Error('Unsupported import binding: '+binding);
 });
 const names=[];
 code=code.replace(/^export\s+(const|let|class|function)\s+([A-Za-z_$][\w$]*)/gm,(_,kind,id)=>{names.push(id);return kind+' '+id;});
 if(/^\s*(import|export)\s/m.test(code))throw Error('Unsupported module syntax in '+name);
 modules.set(name,{code,names});imports.forEach(collect);order.push(name);
}
collect('app');
const bundle='(()=>{\n"use strict";\nconst __modules=Object.create(null);\n'+order.map(name=>{
 const m=modules.get(name);return '__modules["'+name+'"]=(function(){\n'+m.code+'\nreturn {'+m.names.join(',')+'};\n})();';
}).join('\n')+'\n})();';
new vm.Script(bundle,{filename:'last-light-offline.js'});
const css=readFileSync(resolve(dist,'styles.css'),'utf8');
const favicon=readFileSync(resolve(dist,'favicon.svg')).toString('base64');
let html=readFileSync(resolve(dist,'index.html'),'utf8');
html=html.replace('<html lang="ko">','<html lang="ko" data-offline="true">')
 .replace('<link rel="stylesheet" href="styles.css">','<style>\n'+css+'\n</style>')
 .replace('href="favicon.svg"','href="data:image/svg+xml;base64,'+favicon+'"')
 .replace('<script type="module" src="app.js"></script>','<script>\n'+bundle.replace(/<\/script/gi,'<\\/script')+'\n</script>');
writeFileSync(resolve(dist,'last-light.html'),html);
console.log('Standalone HTML generated: '+Buffer.byteLength(html)+' bytes, '+order.length+' modules.');
