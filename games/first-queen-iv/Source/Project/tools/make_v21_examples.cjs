const fs=require('node:fs'),path=require('node:path'),{Game}=require('../src/engine.js');
const root=path.resolve(__dirname,'..');
function write(name,g){const p=g.export(),r=new Game();r.import(p);fs.writeFileSync(path.join(root,'examples',name),JSON.stringify(p,null,2));}
let g=new Game();g.newGame('hybrid-repoN-v19');write('observed-campaign-v21.json',g);
g.startBattle(1,true);g.issue('attackmove',false,{x:620,y:300});g.issue('attackmove',false,{x:780,y:300},true);for(let i=0;i<230;i++)g.tick();g.focusEnemy(g.battle.units.find(u=>u.team==='red'&&u.alive).id);write('attackmove-focus-v21.json',g);
g=new Game();g.newGame('hybrid-repoN-v19');g.startBattle(1,true);g.issue('attackmove',false,{x:700,y:300});for(let i=0;i<1100&&g.battle;i++)g.tick();if(g.battle)write('live-performance-v21.json',g);else throw Error('Example unexpectedly finished');
console.log('v21 examples exported and reimported successfully');
