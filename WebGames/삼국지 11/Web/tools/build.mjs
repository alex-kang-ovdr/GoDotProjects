/** Build data.js and the offline single-file distribution. Node 18+; zero dependencies. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/game-data.json'),'utf8'));
const literal=JSON.stringify(data,null,2).replace(/</g,'\\u003c');
const dataJS=`(function(root){\n'use strict';\nconst DATA = ${literal};\nif(typeof module!=='undefined' && module.exports) module.exports=DATA;\nelse root.RTK_DATA=DATA;\n})(typeof globalThis!=='undefined'?globalThis:this);\n`;
fs.writeFileSync(path.join(root,'js/data.js'),dataJS,'utf8');
let html=fs.readFileSync(path.join(root,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="css/style.css">','<style>\n'+fs.readFileSync(path.join(root,'css/style.css'),'utf8')+'\n</style>');
for(const name of ['data','engine','renderer','ui']){
 const code=fs.readFileSync(path.join(root,'js',name+'.js'),'utf8').replace(/<\/script/gi,'<\\/script');
 html=html.replace(`<script src="js/${name}.js"></script>`,'<script>\n'+code+'\n</script>');
}
if(/<script[^>]+src=|<link[^>]+stylesheet/.test(html))throw new Error('Unexpected external runtime resource.');
fs.writeFileSync(path.join(root,'PLAY.html'),html,'utf8');
console.log(`Built PLAY.html (${Buffer.byteLength(html).toLocaleString()} bytes), ${data.cities.length} cities, ${data.officers.length} catalogue officers.`);
