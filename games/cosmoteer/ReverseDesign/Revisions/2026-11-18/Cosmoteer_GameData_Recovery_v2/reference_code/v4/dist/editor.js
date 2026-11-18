/* STARFORGE shipyard: atomic editing, reversible history and reusable designs. */
(function (root) {
  'use strict';
  const Sim = root.StarSim || (typeof require === 'function' ? require('./sim.js') : null);
  const copy = value => JSON.parse(JSON.stringify(value));
  const result = (ok, message, extra = {}) => ({ ok, message, ...extra });
  const cellKey = p => `${p.x},${p.y}`;
  const mirrorRotation = r => (4 - r) % 4;

  class Shipyard {
    constructor(game) {
      this.game = game;
      this.past = [];
      this.future = [];
      this.limit = 24;
      this._previewKey = '';
      this._previewValue = null;
      this._boundary = this._stamp();
    }
    _stamp() {
      const g = this.game;
      const inventory = ['ammo','sulfur'].map(kind => g.player.parts.filter(p=>p.hp>0).reduce((n,p)=>n+(p[kind]||0)+(kind==='sulfur'&&p.production?.batchActive?Sim.INDUSTRY.sulfurPerBatch:0),0)+g.player.crew.reduce((n,c)=>n+(c.cargo===kind?c.cargoAmount:0),0));
      const production = g.player.parts.filter(p=>p.production).map(p=>[p.id,p.production.enabled,p.production.batchActive,p.production.progress]);
      return `${JSON.stringify(inventory)}|${JSON.stringify(production)}|${g.mode}|${g.sector}|${g.player.id}|${g.credits}|${g.contractId || g.contract || ''}|${g.tactic || ''}|${g.targetPriority || ''}|${g.crewPolicy}|${g.repairPolicy || ''}|${JSON.stringify(g.upgrades || {})}|${g.player.repairStock ?? ''}|${g.serviceTargetId || ''}|${JSON.stringify(g.player.parts.map(p=>[p.id,p.hp,p.fire || 0]))}`;
    }
    _sync() { if (this._boundary !== this._stamp()) this.clearHistory(); }
    clearHistory() { this.past = []; this.future = []; this._previewKey = ''; this._boundary = this._stamp(); }
    get canUndo() { this._sync(); return this.game.mode === 'dock' && this.past.length > 0; }
    get canRedo() { this._sync(); return this.game.mode === 'dock' && this.future.length > 0; }
    _clone() {
      const snapshot = this.game.exportSave(), clone = new Sim.Game();
      const loaded = clone.importSave(snapshot);
      if (!loaded.ok) throw new Error(loaded.message);
      clone.log = copy(snapshot.log || []);
      return clone;
    }
    _restore(snapshot) {
      const loaded = this.game.importSave(copy(snapshot));
      if (loaded.ok) this.game.log = copy(snapshot.log || []);
      return loaded;
    }
    _transaction(label, action) {
      if (this.game.mode !== 'dock') return result(false, '함선 편집은 조선소에서 가능합니다.');
      this._sync();
      const before = copy(this.game.exportSave());
      try {
        const staged = this._clone(), outcome = action(staged);
        if (!outcome.ok) return outcome;
        const after = staged.exportSave(), committed = this._restore(after);
        if (!committed.ok) return committed;
        this.past.push({ before, after: copy(after), label });
        if (this.past.length > this.limit) this.past.shift();
        this.future = []; this._previewKey = ''; this._boundary = this._stamp();
        return { ...outcome, message: outcome.message || label };
      } catch (error) { return result(false, `편집하지 못했습니다: ${error.message}`); }
    }
    _cells(type, x, y, rot, mirror) {
      const cells = [{ type, x, y, rot }];
      if (mirror && x !== 0) cells.push({ type, x: -x, y, rot: mirrorRotation(rot), mirrored: true });
      return cells;
    }
    preview(type, x, y, rot = 0, mirror = false) {
      const cells = this._cells(type, x, y, rot, mirror);
      if (this.game.mode !== 'dock') return result(false, '조선소에서 배치하세요.', { cost: 0, cells: cells.map(c => ({ ...c, valid: false })) });
      const key = JSON.stringify([type, x, y, rot, mirror, this._stamp(), this.game.player.parts.map(p => [p.id,p.type,p.x,p.y,p.rot,p.hp])]);
      if (key === this._previewKey) return copy(this._previewValue);
      let outcome;
      try {
        const staged = this._clone();
        let cost = 0, failure = null;
        for (const c of cells) {
          const planned = staged.previewPlacement?.(c.type, c.x, c.y, c.rot);
          if (planned && !planned.ok) { failure = planned; break; }
          const placed = staged.place(c.type, c.x, c.y, c.rot);
          if (!placed.ok) { failure = placed; break; }
          cost += Sim.PARTS[c.type].cost;
        }
        outcome = result(!failure, failure?.message || `${cells.length}개 배치 · ${cost} C`, {
          cost: cells.reduce((sum,c) => sum + (Sim.PARTS[c.type]?.cost || 0), 0),
          cells: cells.map(c => ({ ...c, valid: !failure, message: failure?.message || '' }))
        });
      } catch (error) { outcome = result(false, error.message, { cost: 0, cells: cells.map(c => ({ ...c, valid: false })) }); }
      this._previewKey = key; this._previewValue = copy(outcome);
      return outcome;
    }
    place(type, x, y, rot = 0, mirror = false) {
      const cells = this._cells(type,x,y,rot,mirror);
      return this._transaction('부품 배치', staged => {
        for (const c of cells) { const r = staged.place(c.type,c.x,c.y,c.rot); if (!r.ok) return r; }
        return result(true, `${Sim.PARTS[type].name} ${cells.length}개 설치 · ${cells.length * Sim.PARTS[type].cost} C`);
      });
    }
    erase(x, y, mirror = false) {
      return this._transaction('부품 철거', staged => {
        const positions = this._cells('',x,y,0,mirror).filter(c => staged.player.parts.some(p => p.hp > 0 && p.x===c.x && p.y===c.y));
        if (!positions.length) return result(false, '철거할 부품이 없습니다.');
        const start = staged.credits, report={inventoryRefund:0,transferred:{ammo:0,sulfur:0},sold:{ammo:0,sulfur:0}};
        for (const c of positions) { const r = staged.erase(c.x,c.y); if (!r.ok) return r; report.inventoryRefund+=r.inventoryRefund||0; for(const kind of ['ammo','sulfur']){report.transferred[kind]+=r.transferred?.[kind]||0;report.sold[kind]+=r.sold?.[kind]||0;} }
        return result(true, `${positions.length}개 철거 · ${staged.credits-start} C 환급`+staged._inventoryMessage(report),report);
      });
    }
    rotate(x, y, dir = 1, mirror = false) {
      if (![1,-1].includes(dir)) return result(false, '회전 방향이 올바르지 않습니다.');
      return this._transaction('설치 부품 회전', staged => {
        const first = staged.player.parts.find(p => p.hp>0 && p.x===x && p.y===y);
        if (!first) return result(false, '회전할 부품을 선택하세요.');
        first.rot = (first.rot + dir + 4) % 4;
        if (mirror && x !== 0) {
          const second = staged.player.parts.find(p => p.hp>0 && p.x===-x && p.y===y);
          if (second) second.rot = mirrorRotation(first.rot);
        }
        staged._captureBlueprint();
        return result(true, `${Sim.PARTS[first.type].name} 방향 ${['↑','→','↓','←'][first.rot]}`);
      });
    }
    undo() {
      if (!this.canUndo) return result(false, '되돌릴 조립 작업이 없습니다.');
      const entry = this.past[this.past.length-1], r = this._restore(entry.before);
      if (!r.ok) return r;
      this.past.pop(); this.future.push(entry); this._previewKey=''; this._boundary=this._stamp();
      return result(true, `${entry.label} 되돌림`);
    }
    redo() {
      if (!this.canRedo) return result(false, '다시 적용할 조립 작업이 없습니다.');
      const entry = this.future[this.future.length-1], r = this._restore(entry.after);
      if (!r.ok) return r;
      this.future.pop(); this.past.push(entry); this._previewKey=''; this._boundary=this._stamp();
      return result(true, `${entry.label} 다시 적용`);
    }
    capture(name = this.game.player.name) {
      return { version: 1, name: String(name || '내 함선').trim().slice(0,40) || '내 함선',
        parts: this.game.player.parts.filter(p=>p.hp>0).map(p=>({type:p.type,x:p.x,y:p.y,rot:p.rot})) };
    }
    _validateDesign(input) {
      if (!input || typeof input !== 'object' || !Array.isArray(input.parts) || !input.parts.length || input.parts.length>160) throw new Error('1~160개 부품의 청사진이 필요합니다.');
      const used = new Set();
      const parts = input.parts.map(p => {
        if (!p || !Object.hasOwn(Sim.PARTS,p.type)) throw new Error('알 수 없는 부품입니다.');
        if (![p.x,p.y,p.rot].every(Number.isInteger) || Math.abs(p.x)>10 || Math.abs(p.y)>10 || p.rot<0 || p.rot>3) throw new Error('부품의 위치나 방향이 올바르지 않습니다.');
        if (used.has(cellKey(p))) throw new Error('부품이 겹칩니다.'); used.add(cellKey(p));
        return {type:p.type,x:p.x,y:p.y,rot:p.rot};
      });
      if (parts.filter(p=>p.type==='cockpit').length!==1) throw new Error('조종실 한 개가 필요합니다.');
      const bunks=parts.filter(p=>p.type==='bunk').length;
      if (!bunks || bunks>10 || !parts.some(p=>Sim.PARTS[p.type].powerSource) || !parts.some(p=>['laser','cannon'].includes(p.type))) throw new Error('원자로·무장·승무원실(최대 10개)이 필요합니다.');
      const seen=new Set([cellKey(parts[0])]),queue=[parts[0]],grid=new Map(parts.map(p=>[cellKey(p),p]));
      for(let i=0;i<queue.length;i++)for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const k=`${queue[i].x+dx},${queue[i].y+dy}`;if(grid.has(k)&&!seen.has(k)){seen.add(k);queue.push(grid.get(k));}}
      if (seen.size!==parts.length) throw new Error('분리된 부품이 있는 청사진입니다.');
      return { version:1, name:String(input.name||'내 함선').trim().slice(0,40)||'내 함선', parts };
    }
    _plan(input, ship = this.game.player) {
      const design=this._validateDesign(input),pools=new Map();
      for(const p of ship.parts.filter(p=>p.hp>0)) { if(!pools.has(p.type))pools.set(p.type,[]);pools.get(p.type).push(p); }
      for(const pool of pools.values())pool.sort((a,b)=>(b.hp/b.maxHp)-(a.hp/a.maxHp));
      let cost=0;
      const allocations=design.parts.map(spec=>{const existing=pools.get(spec.type)?.shift();if(!existing)cost+=Sim.PARTS[spec.type].cost;return{spec,existing};});
      const leftover=[...pools.values()].flat(),refund=leftover.reduce((n,p)=>n+Math.floor(Sim.PARTS[p.type].cost*.65*p.hp/p.maxHp),0);
      const remaining={parts:allocations.map(({spec,existing})=>existing?{...existing,production:existing.production?{...existing.production}:null}:{...spec,hp:Sim.PARTS[spec.type].hp,ammo:0,sulfur:0,production:null})};
      const inventory=this.game._reclaimInventory(remaining,leftover);
      return { design,allocations,leftover,cost,refund,inventory,inventoryRefund:inventory.inventoryRefund,netCost:cost-refund-inventory.inventoryRefund,total:design.parts.reduce((n,p)=>n+Sim.PARTS[p.type].cost,0),moduleCount:design.parts.length };
    }
    _prepareRefit(input, staged) {
      // Quotes and commits use the same settlement order on isolated state.
      // Returned cargo may enter a module that the design subsequently sells.
      for (const crew of staged.player.crew) staged._cancelJob(staged.player, crew);
      return this._plan(input, staged.player);
    }
    quote(input) {
      if(this.game.mode!=='dock')return result(false,'청사진 적용은 조선소에서 가능합니다.');
      try { const staged=this._clone(),p=this._prepareRefit(input,staged),affordable=staged.credits>=p.netCost;
        return result(affordable,affordable?'현재 부품을 재사용하고 차액을 정산합니다.':'크레딧이 부족합니다.',{cost:p.cost,refund:p.refund,inventoryRefund:p.inventoryRefund,transferred:p.inventory.transferred,sold:p.inventory.sold,netCost:p.netCost,total:p.total,moduleCount:p.moduleCount});
      } catch(e){return result(false,e.message);}
    }
    validateBlueprint(input) {
      try { return result(true,'청사진 형식 확인',{design:this._validateDesign(input)}); }
      catch(e) { return result(false,e.message); }
    }
    apply(input) {
      return this._transaction('청사진 적용', staged => {
        const ship=staged.player;
        const plan=this._prepareRefit(input,staged);
        if(staged.credits<plan.netCost)return result(false,'크레딧이 부족합니다.');
        ship.parts=plan.allocations.map(({spec,existing})=>existing?Object.assign(existing,spec):staged._makePart(spec,'player',1,false));
        const inventory=staged._reclaimInventory(ship,plan.leftover);
        staged._recordInventoryRefund(inventory);
        ship.name=plan.design.name;
        const home=ship.parts.find(p=>p.type==='bunk');
        for(const crew of ship.crew){const own=ship.parts.find(p=>p.id===crew.homeId&&p.type==='bunk')||home;crew.homeId=own.id;crew.x=own.x;crew.y=own.y;crew.job=null;}
        staged.credits-=plan.netCost;
        staged._topology(ship,false);
        for(const crew of ship.crew){
          staged._settleCargo(ship,crew);
          if(crew.cargoSourceId&&!ship._partById.has(crew.cargoSourceId))crew.cargoSourceId=null;
        }
        const capacity=Math.min(60,ship.parts.filter(p=>p.type==='bunk').length*Sim.PARTS.bunk.crewCapacity);
        // Keep occupied carriers when a design reduces quarters. Reject the
        // transaction if its remaining cargo cannot fit, instead of losing it.
        if(ship.crew.length>capacity){
          ship.crew.sort((a,b)=>(b.cargoAmount||0)-(a.cargoAmount||0));
          if(ship.crew.slice(capacity).some(c=>c.cargoAmount>0))return result(false,'운반 화물을 보관할 공간이 부족합니다. 탄약고·장치 공간을 확보한 뒤 적용하세요.');
        }
        staged._syncCrew(ship);staged._captureBlueprint();
        return result(true, `${plan.design.name} 적용 · ${plan.netCost>=0?`${plan.netCost} C 사용`:`${-plan.netCost} C 환급`}` + staged._inventoryMessage(inventory), inventory);
      });
    }
    getPresets() {
      const base=new Sim.Game().exportSave().blueprint.map(p=>({...p}));
      return [
        {id:'balanced',version:1,name:'KITE / 균형형',description:'레이저와 중포를 함께 운용하는 표준 설계. 첫 출격에 적합합니다.',parts:copy(base)},
        {id:'gunship',version:1,name:'ANVIL / 중포형',description:'중포 3문. 순간 화력이 높고 탄약 공급과 무장 사선 관리가 중요합니다.',parts:base.map(p=>({...p,type:p.type==='laser'?'cannon':p.type}))},
        {id:'lancer',version:1,name:'WISP / 레이저형',description:'레이저 3문. 탄약을 소비하지 않으며 원자로와 전지 수송 능력에 의존합니다.',parts:base.map(p=>({...p,type:p.type==='cannon'?'laser':p.type}))},
        {id:'industrial',version:1,name:'FORGE / 생산형',description:'중포 2문과 탄약 공장. 저장고의 황을 승무원이 옮겨 전투 중 탄약을 생산합니다.',parts:base.map(p=>({...p,type:p.x===-1&&p.y===0?'ammo_factory':p.x===-1&&p.y===-4?'cannon':p.type}))}
      ];
    }
  }
  const api={Shipyard,mirrorRotation};root.StarEditor=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
