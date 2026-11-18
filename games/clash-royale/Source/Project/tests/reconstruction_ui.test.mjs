import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { Game, CARDS } from '../dist/js/engine.js';
import { BattleAI } from '../dist/js/ai.js';
import { OPPONENTS } from '../dist/js/decks.js';
import { DeveloperPanel } from '../dist/js/devtools.js';
import { DATA_PROFILES, DEFAULT_DATA_PROFILE, RECONSTRUCTED_OVERRIDES } from '../dist/js/reconstruction.js';
import { evidenceMarkup } from '../dist/js/evidence-ui.js';

// A bounded DOM model exercises the real app functions and panel event handlers.
// It records markup and state transitions; it is not a browser/layout emulator.
class Element {
  constructor(tag='div') {
    this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};this.listeners=new Map();
    this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.open=false;this.validity={valid:true};
    this._html='';this.details=[];this.style={setProperty(){}};
    const classes=new Set();
    this.classList={add:cls=>classes.add(cls),remove:cls=>classes.delete(cls),contains:cls=>classes.has(cls),
      toggle(cls,flag){if(flag===undefined)flag=!classes.has(cls);if(flag)classes.add(cls);else classes.delete(cls);return flag;}};
  }
  set innerHTML(value){this._html=String(value);this.details=Array.from(this._html.matchAll(/<details\b/g),()=>new Element('details'));}
  get innerHTML(){return this._html;}
  get options(){return this.children;}
  get firstElementChild(){if(!this.children.length)this.children.push(new Element('span'));return this.children[0];}
  replaceChildren(...children){this.children=children;}
  append(...children){this.children.push(...children);}
  setAttribute(key,value){this.attributes[key]=String(value);}
  addEventListener(type,handler){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(handler);}
  emit(type,target=this){for(const handler of this.listeners.get(type)||[])handler({target});}
  querySelectorAll(selector){
    if(selector==='details')return this.details;
    const all=this.children.flatMap(child=>[child,...child.querySelectorAll('*')]);
    return selector==='*'?all:all.filter(child=>child.tagName===selector.toUpperCase());
  }
  querySelector(selector){
    const key=selector.match(/^\[data-key="([^"]+)"\]$/)?.[1];
    return key?this.children.find(child=>child.dataset.key===key)||null:this.querySelectorAll(selector)[0]||null;
  }
  close(){this.open=false;}
  focus(){}
}
function dom() {
  const nodes=new Map();
  const $=id=>{if(!nodes.has(id)){const node=new Element(id==='balance-card'||id==='balance-team'?'select':'div');node.id=id;nodes.set(id,node);}return nodes.get(id);};
  const teams=['player','enemy'].map(team=>{const node=new Element('button');node.dataset.controlTeam=team;return node;});
  const document={body:new Element('body'),activeElement:null,getElementById:$,createElement:tag=>new Element(tag),
    querySelectorAll:selector=>selector==='[data-control-team]'?teams:[],querySelector:()=>null};
  return {$,document,nodes};
}

const app=readFileSync(new URL('../dist/js/app.js',import.meta.url),'utf8');
const functionNames=['isDeveloperGame','getControlTeam','currentCard','updateIntel','updateDataProfileUI','setDataProfile','refreshModeUI','restoreMatch'];
const appFunctions=functionNames.map(name=>{
  const start=app.indexOf(`function ${name}(`);assert.ok(start>=0,name);
  const next=app.indexOf('\nfunction ',start+1);return app.slice(start,next<0?undefined:next);
}).join('\n');
function appHarness(game) {
  const model=dom(),calls={persist:0,saved:0,restoreFailed:false,messages:[]};
  const globals={...model,Game,CARDS,BattleAI,DATA_PROFILES,DEFAULT_DATA_PROFILE,evidenceMarkup,game,
    intelCardId:'knight',dataProfile:DEFAULT_DATA_PROFILE,controlTeam:'player',training:null,replay:null,
    campaignContext:null,campaignResult:null,resultShown:false,started:false,countingDown:false,countdownRemaining:0,
    activeOpponentId:OPPONENTS[0].id,practice:false,practiceAI:false,practiceSpeed:1,arenaTheme:'grove',pendingMatch:null,
    cardIcon:id=>`<svg data-card="${id}"></svg>`,persist(){calls.persist++;},toast:text=>calls.messages.push(text),
    activeOpponent:()=>OPPONENTS[0],currentStage:()=>null,renderWorkspace(){},renderHUD(){},resetInspection(){},
    updateCountdownUI(){},announce(){},newMatchId:()=> 'restored-ui-test',saveMatch(){calls.saved++;},
    clearSavedMatch(){calls.restoreFailed=true;},difficultyName:()=> '보통'};
  const context=vm.createContext(globals);vm.runInContext(appFunctions,context);
  return {...model,calls,context,run:code=>vm.runInContext(code,context)};
}

test('the actual card inspector initializes safely before Game exists',()=>{
  const h=appHarness(undefined);
  assert.doesNotThrow(()=>h.run("updateIntel('knight')"));
  assert.equal(h.$('intel-name').textContent,CARDS.knight.name);
  assert.match(h.$('intel-evidence').innerHTML,/데이터 근거/);
  assert.match(h.$('intel-evidence').innerHTML,/자체 밸런스/);
});

test('changing the next-battle data profile preserves the running Game and reports the active profile separately',()=>{
  const game=new Game({seed:4501,dataProfile:DEFAULT_DATA_PROFILE}).start(),h=appHarness(game);
  const before=game.exportSnapshot();
  h.run("setDataProfile('prototype-v4')");
  assert.deepEqual(game.exportSnapshot(),before);assert.equal(h.context.dataProfile,'prototype-v4');
  assert.equal(h.$('data-profile').value,'prototype-v4');
  assert.match(h.$('data-profile-current').textContent,/공개 근거 반영/);
  assert.match(h.$('data-profile-note').textContent,/다음 전투: 자체 밸런스/);
  assert.equal(h.calls.persist,1);
  h.run("setDataProfile('__unknown__')");assert.equal(h.calls.persist,1);
  h.context.game=new Game({seed:4502,dataProfile:h.context.dataProfile}).start();
  h.run('updateDataProfileUI()');
  assert.match(h.$('data-profile-current').textContent,/자체 밸런스 · 규칙 5/);
  assert.equal(h.context.game.getCard('fireball').crownDamage,160);
});

test('restoreMatch refreshes evidence and profile for v5 and legacy saves without retaining an unavailable card',()=>{
  for(const rulesVersion of [4,5]) {
    const source=new Game({seed:4503,rulesVersion,practice:true,developerMode:true,
      ...(rulesVersion===5?{dataProfile:DEFAULT_DATA_PROFILE}:{})}).start();
    if(rulesVersion===5)assert.equal(source.setCardBalance('minion_giant',{damage:321},{team:'player'}).ok,true);
    const sourceAI=new BattleAI(source,{difficulty:source.difficulty,style:OPPONENTS[0].style});
    const h=appHarness(new Game({seed:2,dataProfile:DEFAULT_DATA_PROFILE}));
    h.run("updateIntel('minion_giant')");
    h.context.dataProfile='prototype-v4';
    h.context.pendingMatch={engine:source.exportSnapshot(),ai:sourceAI.exportSnapshot(),opponentId:OPPONENTS[0].id,
      training:null,campaign:null,controlTeam:'player',countdownRemaining:0,practiceAI:false,practiceSpeed:1};
    h.run('restoreMatch()');
    assert.equal(h.calls.restoreFailed,false,h.calls.messages.join('\n'));
    assert.equal(h.context.game.rulesVersion,rulesVersion);assert.equal(h.calls.saved,1);
    const selected=h.context.game.getCard(h.context.intelCardId);
    assert.ok(selected,'the inspector must switch away from a card unavailable in the restored rules');
    assert.equal(h.$('intel-name').textContent,selected.name);
    assert.match(h.$('data-profile-current').textContent,new RegExp(`규칙 ${rulesVersion}`));
    if(rulesVersion===4) {
      assert.match(h.$('intel-evidence').innerHTML,/자체 밸런스/);
      assert.match(h.$('data-profile-current').textContent,/자체 밸런스/);
    } else {
      assert.equal(selected.damage,321);
      assert.match(h.$('intel-evidence').innerHTML,/현재 값 다름/);
      assert.match(h.$('data-profile-current').textContent,/공개 근거 반영/);
      assert.match(h.$('data-profile-note').textContent,/다음 전투: 자체 밸런스/);
    }
  }
});

function withPanel(initialGame,run) {
  const prior=globalThis.document,model=dom(),changes=[];let game=initialGame;
  globalThis.document=model.document;
  try {
    const panel=new DeveloperPanel({cards:CARDS,icon:id=>`<svg data-card="${id}"></svg>`,getGame:()=>game,
      getTeam:()=> 'player',getSelection:()=>({team:'player',index:null,directCard:null}),onStart(){},onTeam(){},
      onHand(){},onSpawn(){},onCheat(){},onChange(){changes.push(game.exportSnapshot());}});
    panel.render();return run({...model,panel,changes,setGame(value){game=value;}});
  } finally {if(prior===undefined)delete globalThis.document;else globalThis.document=prior;}
}
const devGame=(rulesVersion=5,dataProfile='prototype-v4')=>new Game({seed:4504,rulesVersion,practice:true,developerMode:true,
  ...(rulesVersion===5?{dataProfile}:{})}).start();

test('the live panel rebuilds new-card fields, disables legacy cards, and resets all valid legacy cards through the button',()=>{
  withPanel(devGame(),({$,panel,setGame,changes})=>{
    assert.equal($('balance-card').options.length,21);
    $('balance-card').value='vines';$('balance-card').emit('change');
    assert.equal(panel.cardId,'vines');assert.ok(panel.fields.some(field=>field.key==='groundingDuration'));
    assert.equal($('balance-apply-evidence').disabled,true,'Vines has no confirmed numerical override');
    assert.match($('balance-evidence').innerHTML,/높은 HP 대상 최대 3개/);
    const legacy=devGame(4);assert.equal(legacy.setCardBalance('knight',{hp:5000},{team:'player'}).ok,true);
    setGame(legacy);assert.doesNotThrow(()=>panel.render());
    assert.equal(panel.cardId,'phalanx');assert.equal($('balance-card').value,'phalanx');
    for(const option of $('balance-card').options)assert.equal(option.disabled,['vines','minion_giant'].includes(option.value));
    assert.match($('balance-evidence').innerHTML,/자체 밸런스/);
    $('balance-reset-all').emit('click');
    assert.equal(legacy.getCard('knight','player').hp,CARDS.knight.hp);
    assert.equal(changes.length,1,'a successful legacy reset must execute the save/update callback');
    assert.match($('developer-feedback').textContent,/모든 카드 기본값을 복원/);
    assert.equal($('developer-feedback').classList.contains('error'),false);
    setGame(devGame());panel.render();
    assert.ok($('balance-card').options.every(option=>!option.disabled));
  });
});

test('apply confirmed values updates the chosen team, preserves custom HP and opened evidence details, and reports manual matches',()=>{
  const game=devGame();assert.equal(game.setCardBalance('minion_giant',{hp:3100},{team:'enemy'}).ok,true);
  withPanel(game,({$,panel,changes})=>{
    $('balance-card').value='minion_giant';$('balance-card').emit('change');
    $('balance-team').value='enemy';$('balance-team').emit('change');
    assert.equal($('balance-apply-evidence').disabled,false);
    const details=$('balance-evidence').querySelectorAll('details');assert.ok(details.length);details[0].open=true;
    $('balance-apply-evidence').emit('click');
    for(const [key,value]of Object.entries(RECONSTRUCTED_OVERRIDES.minion_giant))assert.equal(game.getCard('minion_giant','enemy')[key],value);
    assert.equal(game.getCard('minion_giant','enemy').hp,3100);
    assert.equal(game.getCard('minion_giant','player').damage,135);
    assert.match($('balance-evidence').innerHTML,/근거값 일치 · 수동 설정/);
    assert.equal($('balance-evidence').querySelectorAll('details')[0].open,true);
    assert.equal(changes.length,1);assert.equal(panel.scope,'enemy');
    $('balance-team').value='both';$('balance-team').emit('change');
    assert.match($('balance-evidence').innerHTML,/양 팀 값이 다릅니다/);
  });
});

test('data controls and evidence remain in the external panels or the requested card dialog, outside the mobile arena',()=>{
  const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8'),stack=[],paths=new Map();
  const voidTags=new Set(['meta','link','input','img','br','hr','source','area','base','embed','param','track','wbr']);
  for(const match of html.matchAll(/<(\/?)([a-z][\w:-]*)([^>]*)>/gi)) {
    const [,closing,tag,attributes]=match;
    if(closing){const index=stack.findLastIndex(node=>node.tag===tag);if(index>=0)stack.length=index;continue;}
    const node={tag,id:attributes.match(/\bid="([^"]+)"/)?.[1],classes:attributes.match(/\bclass="([^"]+)"/)?.[1]||'',attributes};
    if(node.id)paths.set(node.id,[...stack,node]);
    if(!voidTags.has(tag)&&!attributes.trimEnd().endsWith('/'))stack.push(node);
  }
  for(const id of ['data-profile','reconstruction-practice','balance-apply-evidence','balance-evidence']) {
    const path=paths.get(id);assert.ok(path?.some(node=>node.id==='workspace-settings-panel'),id);
    assert.ok(!path.some(node=>node.id==='mobile-game'));assert.doesNotMatch(path.at(-1).attributes,/data-landscape-slot/);
  }
  assert.ok(paths.get('intel-evidence').some(node=>node.tag==='aside'&&node.classes.includes('intel-panel')));
  assert.ok(paths.get('detail-evidence').some(node=>node.id==='card-dialog'));
  assert.ok(!paths.get('intel-evidence').some(node=>node.id==='mobile-game'));
});
