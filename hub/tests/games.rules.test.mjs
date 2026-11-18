import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const context=vm.createContext({module:{exports:{}},console});
vm.runInContext(readFileSync(fileURLToPath(new URL('../shared/game-logic.js',import.meta.url)),'utf8'),context);
const G=context.module.exports;
const plain=x=>JSON.parse(JSON.stringify(x));

test('all eight fresh states conform to their save-state invariants',()=>{
  assert.equal(Object.keys(G.games).length,8);
  for(const [id,game] of Object.entries(G.games))for(let seed=1;seed<=12;seed++)assert.ok(G.valid(id,game.newState(G.seeded(seed))),id);
  assert.equal(G.valid('merge-tiles',{score:Infinity}),false);
});
test('match3 starts without automatic matches and with a legal move',()=>{
  for(let seed=1;seed<=60;seed++){const state=G.match3.newState(G.seeded(seed));assert.equal(G.match3.matches(state.board).length,0);assert.equal(G.match3.hasMove(state.board),true);}
});
test('match3 consumes only a legal swap, scores cascades, and remains valid',()=>{
  const s=G.match3.newState(G.seeded(22));assert.equal(G.match3.swap(s,0,63).changed,false);assert.equal(s.moves,25);
  let result;for(let i=0;i<64&&!result;i++)for(const j of [i+1,i+8]){const trial=G.match3.swap(s,i,j,G.seeded(19));if(trial.changed){result=trial;break;}}
  assert.ok(result);assert.equal(result.state.moves,24);assert.ok(result.state.score>=30);assert.equal(G.match3.matches(result.state.board).length,0);assert.ok(G.valid('match3-garden',result.state));assert.equal(s.moves,25);
});
test('falling blocks clear consecutive full rows and preserve upper cells',()=>{
  const b=Array(180).fill(0);b.fill(1,160);b[153]=2;const r=G.falling.clearLines(b);assert.equal(r.cleared,2);assert.equal(r.board[173],2);assert.equal(r.board.slice(0,20).every(v=>v===0),true);
});
test('falling blocks rotate without adding cells and hard drop locks a piece',()=>{
  const s=G.falling.newState(G.seeded(2));const count=a=>a.flat().filter(Boolean).length;assert.equal(count(G.falling.rotate(s.piece.cells)),4);
  const dropped=G.falling.step(s,'drop',G.seeded(4));assert.equal(dropped.board.filter(Boolean).length,4);assert.ok(dropped.score>0);assert.equal(G.falling.collides(dropped.board,dropped.piece),false);
  let left=s;for(let i=0;i<20;i++)left=G.falling.step(left,'left');assert.equal(G.falling.collides(left.board,left.piece),false);
});
test('bubble split produces two smaller balls; the smallest is removed',()=>{
  const parts=G.bubble.split({x:100,y:100,level:2});assert.equal(parts.length,2);assert.equal(parts[0].level,1);assert.ok(parts[0].vx<0&&parts[1].vx>0);assert.equal(G.bubble.split({x:0,y:0,level:0}).length,0);
  const s=G.bubble.newState();s.balls=[{x:320,y:200,vx:0,vy:0,level:0}];s.harpoon={x:320,y:199};const n=G.bubble.step(s,.01);assert.equal(n.status,'won');assert.equal(n.score,100);
});
test('bubble contact uses invulnerability instead of draining all lives at once',()=>{
  let s=G.bubble.newState();s.balls=[{x:320,y:380,vx:0,vy:0,level:0}];s=G.bubble.step(s,.01);assert.equal(s.lives,2);s=G.bubble.step(s,.01);assert.equal(s.lives,2);
});
test('brick breaker loses one life on a miss and wins on the last brick',()=>{
  let s=G.brick.newState();s.ball={x:200,y:451,vx:10,vy:100,attached:false};s=G.brick.step(s,.01);assert.equal(s.lives,2);assert.equal(s.ball.attached,true);
  s=G.brick.newState();s.bricks=Array(40).fill(false);s.bricks[0]=true;s.ball={x:64,y:69,vx:0,vy:-320,attached:false};s=G.brick.step(s,.02);assert.equal(s.status,'won');assert.equal(s.score,25);
});
test('sliding puzzle shuffles only to solvable, unfinished positions',()=>{
  for(let seed=1;seed<=100;seed++){const s=G.slide.newState(G.seeded(seed));assert.ok(G.slide.solvable(s.board));assert.equal(G.slide.solved(s.board),false);}
  const s={...G.slide.newState(),board:[1,2,3,4,5,6,7,0,8],moves:0};assert.equal(G.slide.move(s,8).status,'won');assert.equal(G.slide.move(s,0),s);
});
test('mines first reveal and all eight neighbors are safe; exactly ten mines exist',()=>{
  for(let seed=1;seed<=30;seed++){const s=G.mines.reveal(G.mines.newState(),40,G.seeded(seed));assert.equal(s.mines.filter(Boolean).length,10);assert.equal([40,...G.mines.neighbors(40)].some(i=>s.mines[i]),false);assert.notEqual(s.status,'lost');}
});
test('mines win by revealing safe cells and flags never reveal a mine',()=>{
  let s=G.mines.reveal(G.mines.newState(),0,G.seeded(7));const mine=s.mines.findIndex(Boolean);s=G.mines.flag(s,mine);assert.equal(G.mines.reveal(s,mine),s);
  for(let i=0;i<81;i++)if(!s.mines[i])s=G.mines.reveal(s,i);assert.equal(s.status,'won');assert.equal(s.revealed.filter(Boolean).length,71);
});
test('memory cards cannot self-match and unmatched pair blocks a third flip',()=>{
  let s=G.memory.newState(G.seeded(1));s=G.memory.flip(s,0);assert.equal(G.memory.flip(s,0),s);const other=s.board.findIndex(v=>v!==s.board[0]);s=G.memory.flip(s,other);assert.equal(s.open.length,2);const third=[...Array(16).keys()].find(i=>!s.open.includes(i));assert.equal(G.memory.flip(s,third),s);assert.equal(G.memory.close(s).open.length,0);
});
test('memory completes after exactly eight correctly found pairs',()=>{
  let s=G.memory.newState(G.seeded(6));for(let v=0;v<8;v++){const ids=s.board.map((n,i)=>n===v?i:-1).filter(i=>i>=0);s=G.memory.flip(s,ids[0]);s=G.memory.flip(s,ids[1]);}assert.equal(s.status,'won');assert.equal(s.moves,8);assert.equal(s.score,2000);
});
test('merge tiles merges each tile at most once per move',()=>{
  assert.deepEqual(plain(G.merge.line([2,2,2,2])),{line:[4,4,0,0],score:8});assert.deepEqual(plain(G.merge.line([2,2,4,4])),{line:[4,8,0,0],score:12});
  assert.deepEqual(plain(G.merge.line([4,0,4,8])),{line:[8,8,0,0],score:8});
});
test('merge tiles does not spawn on unchanged moves and detects a blocked board',()=>{
  const s={...G.merge.newState(),board:[2,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0],moves:0};assert.deepEqual(plain(G.merge.move(s,'left').board),plain(s.board));assert.equal(G.merge.move(s,'left').moves,0);
  const full={...s,board:[2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2]};assert.equal(G.merge.canMove(full.board),false);assert.equal(G.merge.move(full,'left').status,'lost');
});
