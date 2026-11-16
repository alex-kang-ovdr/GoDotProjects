import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { appHarness } from './ui-harness.mjs';
import { sandbox, until, issue, total } from './helpers.mjs';

test('real app renders all ten panels and bill controls pass complete production commands',()=>{
  const h=appHarness(),game=h.api.getGame();h.api.renderUI();
  const panes=['colony','inspect','work','industry','trade','schedule','care','research','systems','logs'];
  for(const pane of panes){h.click(`[data-pane="${pane}"]`);assert.equal(h.api.ui.pane,pane);assert.ok(h.select('#sidebar-content').innerHTML.includes('<h2>')||pane==='care');}
  h.click('[data-pane="industry"]');
  h.click('[data-bill-recipe="tool"][data-bill-delta="1"]');
  assert.equal(game.state.industry.bills.tool.target,1);
  h.click('[data-bill-recipe="tool"][data-bill-mode="maintain"]');
  assert.equal(game.state.industry.bills.tool.mode,'maintain');
  h.click('[data-bill-pause="tool"]');assert.equal(game.state.industry.bills.tool.paused,true);
  h.click('[data-bill-pause="tool"]');assert.equal(game.state.industry.bills.tool.paused,false);
  h.click('[data-bill-clear="tool"]');assert.equal(game.state.industry.bills.tool.target,0);
  h.click('[data-action="assign-crafter"]');assert.equal(game.state.colonists[0].priorities.craft,1);
  h.click('[data-action="build-workbench"]');assert.equal(h.api.ui.tool,'build:workbench');
  h.key('o');assert.equal(h.api.ui.pane,'trade');h.key('i');assert.equal(h.api.ui.pane,'industry');
  h.key('o',{ctrlKey:true});assert.equal(h.api.ui.pane,'industry');
  assert.equal(h.select('#resource-list').children.length,6);
});

test('real equipment buttons request physical pickup, show installed gear, and release one item',()=>{
  const game=sandbox({tool:1}),pawn=game.state.colonists[0],h=appHarness(game);
  h.api.ui.selectedIds=[pawn.id];h.api.ui.selectedId=pawn.id;h.api.setPane('inspect');
  assert.equal(h.select('[data-equip="tool"]').disabled,false);
  h.click('[data-equip="tool"]');assert.equal(pawn.job?.type,'equip');assert.equal(pawn.equipment.tool,null);
  assert.equal(h.select('[data-unequip="tool"]').disabled,false);
  h.click('[data-unequip="tool"]');assert.equal(pawn.job,null);assert.equal(game.state.resources.tool,1);
  h.click('[data-equip="tool"]');
  until(game,()=>pawn.equipment.tool==='tool',20,'UI equip must finish physical pickup');
  h.api.renderSidebar();assert.ok(h.select('[data-unequip="tool"]'));
  h.click('[data-unequip="tool"]');assert.equal(pawn.equipment.tool,null);assert.equal(total(game,'tool'),1);
  issue(game,'draft',{id:pawn.id,value:true});h.api.renderSidebar();assert.equal(h.select('[data-equip="tool"]').disabled,true);
});

test('real trade controls preserve number editing and send bounded orders to the displayed visitor',()=>{
  const game=sandbox({silver:60,wood:5}),h=appHarness(game);
  game.state.trade.nextVisitAt=0;
  until(game,()=>game.state.trade.visitor?.phase==='trading',80,'trader should arrive');
  h.api.setPane('trade');const trader=game.state.trade.visitor;
  h.click('[data-trade-item="medicine"]');h.change('#trade-count',2);
  assert.equal(h.api.ui.tradeCount,2);
  h.api.renderSidebar();const stale=h.select('[data-action="confirm-trade"]');
  assert.equal(stale.dataset.tradeTrader,trader.id);
  const input=h.select('#trade-count');input.focus();input.value='3';
  const contents=h.select('#sidebar-content').innerHTML;h.api.renderSidebar();assert.equal(h.select('#sidebar-content').innerHTML,contents);assert.equal(input.value,'3');
  h.change('#trade-count',2);h.document.activeElement=h.document.body;h.api.renderSidebar();
  h.click('[data-action="confirm-trade"]');assert.equal(game.state.resources.silver,24);assert.equal(game.state.resources.medicine,0);assert.equal(total(game,'medicine'),2);
  h.click('[data-trade-side="sell"]');h.click('[data-trade-item="wood"]');h.change('#trade-count',2);h.api.renderSidebar();h.click('[data-action="confirm-trade"]');
  assert.equal(game.state.resources.wood,3);assert.equal(game.state.resources.silver,24);assert.equal(total(game,'silver'),26);
  h.click('[data-trade-item="rawfood"]');assert.equal(h.select('[data-action="confirm-trade"]').disabled,true);
  h.change('#trade-count',-20);assert.equal(h.api.ui.tradeCount,1);h.change('#trade-count',101);assert.equal(h.api.ui.tradeCount,100);
  const before=game.toJSON();h.api.action('confirm-trade',{dataset:{tradeTrader:'expired-visitor'}});assert.deepEqual(game.toJSON(),before);
  h.select('#trade-count').focus();h.click('[data-pane="industry"]');assert.ok(h.select('#sidebar-content').innerHTML.includes('생산 주문'));
});

test('new panels retain corrupt save protection, legacy import and existing crisis pause policy',()=>{
  const legacy=JSON.parse(fs.readFileSync(new URL('./fixtures/v3-colony.json',import.meta.url),'utf8'));
  const h=appHarness(),game=h.api.getGame();
  const wrapper={format:'frontier-colony-save',version:1,game:legacy};
  assert.equal(h.api.readSave(JSON.stringify(wrapper)).state.version,4);
  h.api.ui.persistenceBlocked=true;h.memory.set('frontier-colony-save-v1','corrupt-original');h.api.saveGame();
  assert.equal(h.memory.get('frontier-colony-save-v1'),'corrupt-original');
  h.api.setSpeed(3);h.api.setPane('industry');issue(game,'raid');h.api.renderUI();assert.equal(h.api.ui.speed,0);
  h.api.setSpeed(3);h.api.renderUI();assert.equal(h.api.ui.speed,3);
  h.api.setPane('trade');h.key('i');assert.equal(h.api.ui.pane,'industry');
});
