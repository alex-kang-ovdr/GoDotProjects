/* v4 adapters: the live game consumes the same tested rules as the data exports. */
'use strict';
const HarborV4 = (() => {
  const copy = value => JSON.parse(JSON.stringify(value));
  const byId = id => document.getElementById(id);
  const put = (id, value) => { const el = byId(id); if (el) el.textContent = value; };
  const assert = (ok, message) => { if (!ok) throw new Error(message); };

  function install(Game) {
    const p = Game.prototype, base = {};
    for (const name of ['reset','bind','clearInput','pause','toTitle','fail','look','switchWeapon','reload','toggleCover','interact','updateTransition','step','capture','restore','exportSave','updateHUD','snapshot']) base[name] = p[name];
    HarborGameplay.applyWeaponData(GAME_DATA.weapons);
    // The authored contract owns its reward and depot coordinates.
    GAME_DATA.mission.reward = HarborContracts.harbor_recovery.reward;
    GAME_DATA.garage = HarborContracts.harbor_recovery.locations.garage.slice();
    const report = HarborLogic.Wanted.prototype.report;
    HarborLogic.Wanted.prototype.report = function(id,level,pos) {
      const pursuing = this.level > 0 && this.observers.size > 0, known = this.lastKnown.slice();
      if (!report.call(this,id,level,pos)) return false;
      this.maxSearch = HarborGameplayData.police.searchSeconds[this.level]; this.search = this.maxSearch;
      if (pursuing) { this.lastKnown = known; this.state = 'pursuit'; }
      return true;
    };

    p.reset = function(mode = 'mission', start = true) {
      this.sessionEpoch = (this.sessionEpoch || 0) + 1;
      this.reportQueue = new HarborPerception.ReportQueue({epoch:this.sessionEpoch});
      if (!this._v4EventsAccessor) {
        Object.defineProperty(this, 'events', {configurable:true, enumerable:true,
          get:() => this.reportQueue.pending,
          set:entries => { if (!this._restoringV4) this.reportQueue.replacePending(entries, {now:Math.max(0,this.time || 0)}); }
        });
        this._v4EventsAccessor = true;
      }
      const role = byId('abilitySelect')?.value || 'focus';
      this.approach = byId('approachSelect')?.value || 'quiet';
      this.ability = new HarborGameplay.Ability(role);
      this.contract = mode === 'free' ? null : new HarborMission.ContractRun(HarborContracts.harbor_recovery, this.approach);
      this.wheel = {open:false, selected:2, dx:0, dy:0};
      this.civilianCasualties = 0;
      this.acquireAt = 0;
      this.deliveryHold = 0;
      this.incidentBuckets = new Map();
      this.legacyMigrated = false;
      this.activeRealTime = 0;
      this.acc = 0;
      if (byId('weaponWheel')) byId('weaponWheel').hidden = true;
      base.reset.call(this, mode, start);
      if (start && mode !== 'free') this.toast(this.contract.objective().approachLabel + ' · ' + this.ability.config.label + ' / F 능력 · TAB 무기 선택', 4);
    };

    p.abilityContext = function() {
      const car = this.activeCar();
      return {alive:this.player.hp > 0, inVehicle:!!car,
        isDriver:!!car && car.seat.occupant === 'player', transitioning:!!this.player.transition};
    };
    p.toggleAbility = function() {
      if (!this.running || this.wheel.open) return false;
      const result = this.ability.toggle(this.abilityContext());
      const messages = {requires_driver:'차량 운전석에서 사용할 수 있습니다.', requires_on_foot:'차량에서 내린 뒤 사용할 수 있습니다.', transition:'승하차를 마친 뒤 사용하세요.', cooldown:'능력이 재충전 중입니다.', energy:'능력 에너지가 20 이상 필요합니다.', dead:'능력을 사용할 수 없습니다.'};
      this.toast(result.ok ? this.ability.config.label + (result.active ? ' 활성화' : ' 종료') : messages[result.reason] || '지금은 능력을 사용할 수 없습니다.', 1.7);
      this.updateHUD();
      return result.ok;
    };
    p.openWeaponWheel = function() {
      if (!this.running || this.player.hp <= 0 || this.player.carId || this.player.transition || this.wheel.open) return false;
      this.wheel = {open:true, selected:this.player.weapon, dx:0, dy:0};
      this.input.fire = false; this.input.firePressed = false; this.input.aim = false;
      this.player.jumpBuffer = 0;
      if (byId('weaponWheel')) byId('weaponWheel').hidden = false;
      this.updateWeaponWheel();
      return true;
    };
    p.closeWeaponWheel = function(commit = true) {
      if (!this.wheel?.open) return false;
      const selected = this.wheel.selected;
      this.wheel.open = false;
      if (byId('weaponWheel')) byId('weaponWheel').hidden = true;
      this.input.fire = false; this.input.firePressed = false;
      if (commit && this.running && this.player.hp > 0 && selected !== this.player.weapon) base.switchWeapon.call(this, selected);
      return true;
    };
    p.updateWeaponWheel = function() {
      if (!this.wheel?.open) return;
      const index = this.wheel.selected, w = GAME_DATA.weapons[index], m = this.mags[index];
      document.querySelectorAll('[data-wheel-index]').forEach(el => {
        const i = Number(el.dataset.wheelIndex), weapon = GAME_DATA.weapons[i], mag = this.mags[i];
        el.classList.toggle('selected', i === index);
        el.setAttribute('aria-pressed', String(i === index));
        el.innerHTML = '<kbd>'+(i+1)+'</kbd><strong>'+weapon.ko+'</strong><small>'+mag.ammo+' / '+mag.reserve+'</small>';
      });
      put('wheelName', w.name + ' / ' + w.ko);
      put('wheelInfo', (w.pellets > 1 ? w.damage+' × '+w.pellets : w.damage)+' 피해 · '+w.rpm+' RPM · 장전 '+w.reload.toFixed(1)+'초 · 유효 구간 '+w.rangeStart+'m');
      put('wheelHint', this.touch ? '무기를 터치해 선택 · 무기 버튼으로 확정' : '마우스 / 1–5 선택 · TAB 놓기 확정 · ESC 취소');
    };
    p.switchWeapon = function(index) {
      if (this.wheel?.open) { this.wheel.selected = (index + 5) % 5; this.updateWeaponWheel(); return; }
      return base.switchWeapon.call(this, index);
    };
    p.look = function(dx, dy) {
      if (!this.wheel?.open) return base.look.call(this, dx, dy);
      this.wheel.dx = Math.max(-180, Math.min(180, this.wheel.dx + dx));
      this.wheel.dy = Math.max(-180, Math.min(180, this.wheel.dy + dy));
      if (Math.hypot(this.wheel.dx, this.wheel.dy) > 22) {
        const angle = (Math.atan2(this.wheel.dy, this.wheel.dx) + Math.PI/2 + 2*Math.PI) % (2*Math.PI);
        this.wheel.selected = Math.round(angle / (2*Math.PI/5)) % 5;
        this.updateWeaponWheel();
      }
    };
    p.clearInput = function() { this.closeWeaponWheel(false); return base.clearInput.call(this); };
    for (const method of ['pause','toTitle','fail']) p[method] = function(...args) {
      this.ability?.stop(method); this.closeWeaponWheel(false); return base[method].apply(this, args);
    };
    for (const method of ['reload','toggleCover']) p[method] = function(...args) {
      if (this.wheel?.open) return; return base[method].apply(this,args);
    };
    p.interact = function() {
      const result = base.interact.call(this);
      if (this.player.transition) this.ability.stop('transition');
      return result;
    };
    p.updateTransition = function(dt) {
      base.updateTransition.call(this, dt);
      this.ability.update(0, this.abilityContext());
    };
    p.bind = function() {
      base.bind.call(this);
      // Capture before v3's key listener; selection cannot accidentally jump, fire or interact.
      document.addEventListener('keydown', e => {
        if (e.target?.matches?.('input,select,textarea')) return;
        if (e.code === 'Tab' && this.running) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.openWeaponWheel(); return; }
        if (e.code === 'KeyF' && this.running) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.toggleAbility(); return; }
        if (this.wheel?.open) {
          if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.closeWeaponWheel(false); return; }
          if (/^Digit[1-5]$/.test(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); this.switchWeapon(+e.code.slice(5)-1); return; }
          if (['Space','KeyE','KeyR','KeyQ'].includes(e.code)) { e.preventDefault(); e.stopImmediatePropagation(); }
        }
      }, true);
      document.addEventListener('keyup', e => { if (e.code === 'Tab') { e.preventDefault(); this.closeWeaponWheel(true); } }, true);
      this.canvas.addEventListener('mousedown', e => { if (this.wheel?.open) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
      this.canvas.addEventListener('wheel', e => { if (this.wheel?.open) { e.preventDefault(); e.stopImmediatePropagation(); this.switchWeapon(this.wheel.selected + Math.sign(e.deltaY)); } }, {capture:true, passive:false});
      document.querySelectorAll('[data-wheel-index]').forEach(el => {
        el.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); this.switchWeapon(Number(el.dataset.wheelIndex)); };
        el.onpointerenter = () => { if (this.wheel.open && !document.pointerLockElement) this.switchWeapon(Number(el.dataset.wheelIndex)); };
      });
      const wheelButton = document.querySelector('[data-action="weapon"]');
      if (wheelButton) wheelButton.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); this.wheel.open ? this.closeWeaponWheel(true) : this.openWeaponWheel(); };
      const abilityButton = document.querySelector('[data-action="ability"]');
      if (abilityButton) abilityButton.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); this.toggleAbility(); };
      byId('freeAfterBtn').onclick = () => { this.contract = null; this.phase = 'free'; this.resume(); };
    };

    p.visualEvidence = function(observer) {
      const player = this.player;
      return HarborPerception.visualEvidence(observer,
        {pos:player.pos, hp:player.hp, sneaking:!!player.sneak && !player.carId && !player.transition}, {
          los:(eye, target) => this.world.los(eye, target), alerted:!!observer.alert,
          targetHeight:player.cover && !player.aim ? .95 : 1.35, observedAt:this.time
        });
    };
    p.canSeePlayer = function(observer) { return this.visualEvidence(observer).observed; };
    p.queueEvidence = function(n, evidence, id, level) {
      if (!evidence.observed || this.cheats.noPolice || this.lab) return false;
      // Capacity exhaustion must not crash live play. Already accepted IDs remain deduplicated.
      try {
        return this.reportQueue.enqueue({incidentId:id, witnessId:n.id, witnessType:n.type,
          level, pos:evidence.position, observedAt:evidence.observedAt, epoch:this.sessionEpoch});
      } catch (error) {
        if (/capacity exceeded/.test(error.message)) return false;
        throw error;
      }
    };
    p.crime = function(level, kind) {
      if (this.lab || !this.player || this.player.hp <= 0) return;
      const origin = this.player.pos.slice();
      let id;
      if (kind === 'target_taken') id = 'theft:' + this.runId;
      else {
        const prior = this.incidentBuckets.get(kind);
        if (prior && this.time - prior.at < .6 && prior.level === level) id = prior.id;
        else { id = 'incident:' + this.sessionEpoch + ':' + this.nextId++; this.incidentBuckets.set(kind,{id,at:this.time,level}); }
      }
      // Only this generator can retire IDs: epoch + monotonic nextId are never
      // reused. Preserve the live aggregation buckets and the run's theft ID.
      if (this.reportQueue.incidentCount >= this.reportQueue.maxIncidents - 1 || this.wanted.events.size >= 2048) {
        const keepIds = new Set(['theft:' + this.runId,...[...this.incidentBuckets.values()].map(bucket => bucket.id)]);
        const pruned = this.reportQueue.pruneAccepted({keepIds,
          retainCount:Math.min(512,Math.max(0,this.reportQueue.maxIncidents - 1)),
          reclaimUnacceptedPrefix:'incident:' + this.sessionEpoch + ':'});
        for (const retiredId of pruned.removedIds) this.wanted.events.delete(retiredId);
      }
      // Capture vision BEFORE hearing changes behavior: sound never grants identity.
      const observations = this.npcs.filter(n => n.hp > 0).map(n => [n, this.visualEvidence(n)]);
      for (const [n, evidence] of observations) {
        if (kind === 'gunfire' && HarborPerception.hearingEvidence(n, origin).heard) {
          n.threatPos = origin.slice();
          if (n.type === 'civilian') n.panic = 10;
          else { n.suspicious = 6; n.goal = origin.slice(); }
        }
        if (evidence.observed) {
          n.threatPos = evidence.position.slice();
          if (n.type === 'civilian') n.panic = 10;
          else n.alert = true;
          this.queueEvidence(n, evidence, id, level);
        }
      }
    };
    p.reportTheft = function(n) {
      const evidence = this.visualEvidence(n);
      if (!evidence.observed) return false;
      const accepted = this.queueEvidence(n,evidence,'theft:' + this.runId,2);
      if (accepted) { n.reportedTheft = true; n.alert = true; n.threatPos = evidence.position.slice(); }
      return accepted;
    };
    p.acceptReports = function() {
      const reports = this.reportQueue.update(this.time, id => this.npcs.some(n => n.id === id && n.hp > 0));
      if (this.cheats.noPolice || this.lab) return;
      for (const report of reports) this.wanted.report(report.id, report.level, report.pos);
    };

    p.missionFacts = function() {
      const target = this.targetCar(), player = this.player;
      return {alive:player.hp > 0, playerPos:player.pos.slice(),
        inTarget:player.carId === 'target' && target?.seat.occupant === 'player' && !player.transition,
        targetPos:target ? [target.x,target.y || 0,target.z] : HarborContracts.harbor_recovery.locations.target.slice(),
        targetHp:target?.hp || 0, targetMaxHp:target?.maxHp || 240, targetSpeed:target?.speed || 0,
        wanted:this.wanted.level, pendingReports:this.reportQueue.pendingCount,
        shots:this.shotCount, civilianCasualties:this.civilianCasualties};
    };
    p.missionGoal = function() {
      if (this.contract && this.phase !== 'free') return this.contract.objective().goal.slice();
      return GAME_DATA.garage.slice();
    };
    p.updateMission = function(dt) {
      if (!this.running || !this.contract || this.phase === 'free' || this.phase === 'complete') return;
      const result = this.contract.update(dt, this.missionFacts());
      this.missionTime = this.contract.elapsed; this.deliveryHold = this.contract.hold;
      if (result.phase !== 'failed') this.phase = result.phase;
      for (const event of result.events) {
        if (event.type === 'recon_completed') this.toast('목표 구역 도착 · ' + this.contract.objective().routeCue,3);
        if (event.type === 'route_beacon_reached') this.toast('접근 지점 통과 · 노란 회수 차량으로 이동하세요.',2);
        if (event.type === 'vehicle_acquired') {
          this.acquireAt = this.time; this.makeCheckpoint();
          this.toast('목표 차량 확보 · 신고가 접수되기 전에 시야를 끊으세요.',3);
        }
        if (event.type === 'pursuit_cleared') this.toast('추격 없음 · 차고 구역에 정차해 차량을 인도하세요.',3);
        if (event.type === 'mission_failed') this.fail(this.contract.definition.failure[event.reason]);
        if (event.type === 'mission_completed') {
          this.ledger.grant(this.runId,event.reward);
          this.running = false; this.mode = 'completeScreen'; this.ability.stop('complete'); this.clearInput();
          if (document.pointerLockElement) document.exitPointerLock();
          byId('completeScreen').hidden = false;
          const minutes = Math.floor(this.missionTime/60), seconds = Math.floor(this.missionTime%60);
          byId('resultStats').innerHTML = '<strong class="resultRank">'+event.rank+' RANK</strong><p>'+minutes+'분 '+seconds+'초 · 발사 '+this.shotCount+'회 · '+this.ledger.wallet.toLocaleString()+' CREDIT</p>'+event.medals.map(m=>'<p class="resultMedal '+(m.earned?'earned':'missed')+'">'+(m.earned?'◆ ':'◇ ')+m.label+'</p>').join('')+(this.legacyMigrated?'<small>v3 이전 민간인 피해 기록은 포함되지 않습니다.</small>':'');
          this.audio.beep(830,.35); this.save(true);
        }
      }
    };

    p.worldTimeScale = function() { return Math.min(this.ability.worldScale, this.wheel.open ? HarborGameplayData.wheel.worldScale : 1); };
    // Only active real time drains abilities. Simulation continues at fixed 60 Hz.
    p.advanceReal = function(dt) {
      assert(Number.isFinite(dt) && dt >= 0 && dt <= 5, '활성 실시간 간격 오류');
      if (!this.running) return;
      let left = dt;
      while (left > 1e-9 && this.running) {
        const slice = Math.min(left,1/60); left -= slice;
        this.ability.update(0,this.abilityContext());
        const scale = this.worldTimeScale();
        this.activeRealTime += slice;
        this.acc += slice * scale;
        while (this.acc + 1e-10 >= 1/60 && this.running) {
          base.step.call(this,1/60); this.acc = Math.max(0,this.acc-1/60);
        }
        this.ability.update(slice,this.abilityContext());
      }
    };
    p.step = function(dt) {
      if (!this.running) return;
      // Existing deterministic hooks supply GAME seconds; translate for ability bookkeeping.
      this.ability.update(0,this.abilityContext());
      const real = dt / this.worldTimeScale();
      base.step.call(this,dt);
      this.activeRealTime += real;
      this.ability.update(real,this.abilityContext());
    };
    p.frame = function(now) {
      const raw = Math.max(0,(now-this.lastFrame)/1000), dt = Math.min(raw,HarborGameplayData.clock.maxUiFrameSeconds); this.lastFrame = now;
      if (this.running && !this.manualTesting && raw >= HarborGameplayData.clock.stallPauseSeconds) {
        this.pause(); this.toast('화면 갱신이 지연되어 일시정지했습니다. 준비되면 플레이를 재개하세요.',4);
      }
      if (raw > .0001) this.fps = HM.damp(this.fps,1/raw,2,dt);
      this.frameMS = HM.damp(this.frameMS,dt*1000,2,dt);
      if (this.running && !this.manualTesting) this.advanceReal(raw); else this.acc = 0;
      this.renderAlpha = this.running && !this.manualTesting ? HM.clamp(this.acc*60,0,1) : 1;
      this.renderWorld(); this.uiTimer -= dt;
      if (this.uiTimer <= 0) { this.updateHUD(); this.uiTimer = .075; }
      const car = this.activeCar();
      this.audio.update(car?.speed || 0,!!car,this.wanted.level > 0,this.time,!this.running);
      this.stats.frames++;
      requestAnimationFrame(this.frame);
    };

    p.capture = function() {
      const s = base.capture.call(this);
      s.gameplayV4 = {version:4, ability:this.ability.serialize(), contract:this.phase === 'free' ? null : this.contract?.snapshot() || null,
        reportQueue:this.reportQueue.snapshot(), approach:this.approach,
        civilianCasualties:this.civilianCasualties, activeRealTime:this.activeRealTime,
        legacyMigrated:!!this.legacyMigrated, sinceDamage:Math.max(0,this.time-this.lastDamage)};
      return s;
    };
    p.exportSave = function() {
      if (this.player.transition || this.player.hp <= 0) {
        put('saveStatus','승하차를 마치고 살아 있는 상태에서 JSON을 내보내세요.');
        return false;
      }
      return base.exportSave.call(this);
    };
    p.restore = function(raw) {
      const s = HarborLogic.validateSave(copy(raw)), ext = s.gameplayV4;
      const finite = (value, minimum, maximum) => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
      const count = value => Number.isSafeInteger(value) && value >= 0;
      // v1 omitted some optional counters. Missing values may be migrated, but
      // malformed present values must not reach ContractRun or camera matrices.
      for (const key of ['shotCount','kills']) {
        if (s[key] === undefined) s[key] = 0;
        assert(count(s[key]), '저장 통계 오류: ' + key);
      }
      if (s.nextId === undefined) s.nextId = 100;
      assert(Number.isSafeInteger(s.nextId) && s.nextId >= 1 && s.nextId < Number.MAX_SAFE_INTEGER - 10000, '저장 ID 순번 오류');
      if (s.acquireAt === undefined) s.acquireAt = 0;
      assert(finite(s.acquireAt,0,s.time + 1e-7), '차량 확보 시각 오류');
      assert(s.cam === undefined || (s.cam && typeof s.cam === 'object' && !Array.isArray(s.cam)), '카메라 저장 오류');
      s.cam = {yaw:s.cam?.yaw === undefined ? s.player.yaw : s.cam.yaw, pitch:s.cam?.pitch === undefined ? -.15 : s.cam.pitch};
      assert(finite(s.cam.yaw,-1e8,1e8) && finite(s.cam.pitch,-.95,.65), '카메라 저장 수치 오류');
      assert(s.wanted.events.every(id => typeof id === 'string' && id.length > 0 && id.length <= 160) && new Set(s.wanted.events).size === s.wanted.events.length, '수배 사건 식별자 오류');
      for (const n of s.npcs) {
        assert(n.armor === undefined || finite(n.armor,0,50), 'NPC 방어구 저장 오류');
        // v3 subtracts the last simulation tick before checking this countdown
        // again; its small negative remainder is a valid expired reaction.
        assert(n.panic === undefined || finite(n.panic,-.1,1e9), 'NPC 반응 시간 오류');
        if (n.panic !== undefined) n.panic = Math.max(0,n.panic);
        assert(n.alert === undefined || typeof n.alert === 'boolean', 'NPC 경계 상태 오류');
        assert(n.reportedTheft === undefined || typeof n.reportedTheft === 'boolean', 'NPC 신고 상태 오류');
        const suffix = /^npc(\d+)$/.exec(n.id);
        if (suffix) {
          const serial = Number(suffix[1]);
          assert(Number.isSafeInteger(serial) && serial < Number.MAX_SAFE_INTEGER - 10000, 'NPC 식별자 범위 오류');
          s.nextId = Math.max(s.nextId,serial + 1);
        }
      }
      for (const car of s.cars) {
        assert(car.hp <= GAME_DATA.vehicles[car.kind].hp, '차량 내구도 저장 범위 오류');
        assert(car.routeI === undefined || (Number.isSafeInteger(car.routeI) && car.routeI >= 0), '차량 경로 순번 오류');
        for (const key of ['traffic','police','deployed']) assert(car[key] === undefined || typeof car[key] === 'boolean', '차량 상태 오류: ' + key);
        const suffix = /^policeCar(\d+)$/.exec(car.id);
        if (suffix) assert(Number.isSafeInteger(Number(suffix[1])) && Number(suffix[1]) < Number.MAX_SAFE_INTEGER - 10000, '경찰차 식별자 범위 오류');
      }
      const savedTarget = s.cars.find(car => car.id === 'target');
      const savedActiveCar = s.player.carId ? s.cars.find(car => car.id === s.player.carId) : null;
      assert(!savedActiveCar || savedActiveCar.hp > 0, '파괴된 차량의 좌석은 복원할 수 없습니다.');
      const nextEpoch = (this.sessionEpoch || 0)+1;
      const queue = new HarborPerception.ReportQueue({epoch:nextEpoch});
      let ability = new HarborGameplay.Ability('focus'), contract = null, approach = 'quiet', casualties = 0, activeReal = s.time, legacy = true, sinceDamage = 0;
      // Stage every extension before touching live world, currency, queue or input.
      if (ext !== undefined) {
        assert(ext && ext.version === 4, '게임플레이 저장 버전 오류');
        ability.load(ext.ability);
        assert(['quiet','direct'].includes(ext.approach), '접근 방식 저장 오류'); approach = ext.approach;
        assert(Number.isSafeInteger(ext.civilianCasualties) && ext.civilianCasualties >= 0, '민간인 피해 저장 오류'); casualties = ext.civilianCasualties;
        assert(Number.isFinite(ext.activeRealTime) && ext.activeRealTime >= 0 && ext.activeRealTime <= 1e9, '실시간 저장 오류'); activeReal = ext.activeRealTime;
        assert(typeof ext.legacyMigrated === 'boolean', '이전 저장 변환 표시 오류'); legacy = ext.legacyMigrated;
        assert(Number.isFinite(ext.sinceDamage) && ext.sinceDamage >= 0 && ext.sinceDamage <= 1e9, '회복 저장 시간 오류'); sinceDamage = ext.sinceDamage;
        queue.load(ext.reportQueue,{epoch:nextEpoch,now:s.time});
        // The legacy events field is a compatibility mirror, not a second source
        // of evidence. Compare canonical legacy fields after explicit epoch rebasing.
        const mirrored = new HarborPerception.ReportQueue({epoch:nextEpoch});
        mirrored.replacePending(s.events.map(event => {
          assert(event.epoch === undefined || event.epoch === ext.reportQueue.epoch, '신고 사본 epoch 불일치');
          return {...event,epoch:nextEpoch};
        }),{now:s.time});
        const canonical = pending => pending.map(event => ({id:event.incidentId,witness:event.witness,level:event.level,time:event.time,pos:event.pos}))
          .sort((a,b) => JSON.stringify([a.id,a.witness]).localeCompare(JSON.stringify([b.id,b.witness])));
        assert(JSON.stringify(canonical(mirrored.pending)) === JSON.stringify(canonical(queue.pending)), '신고 대기열 사본 불일치');
        const authoritative = new Map(queue.pending.map(event => [JSON.stringify([event.incidentId,event.witness]),event]));
        for (const event of s.events) {
          const actual = authoritative.get(JSON.stringify([event.incidentId ?? event.id,event.witness ?? event.witnessId]));
          if (event.observedAt !== undefined) assert(event.observedAt === actual.observedAt, '신고 목격 시각 사본 불일치');
          if (event.witnessType !== undefined) assert(event.witnessType === actual.witnessType, '목격자 유형 사본 불일치');
        }
        if (ext.contract !== null) {
          contract = HarborMission.ContractRun.fromSnapshot(HarborContracts.harbor_recovery, ext.contract);
          assert(contract.approach === approach && contract.phase === s.phase, '임무 저장 상태 불일치');
          assert(Math.abs(contract.elapsed-s.missionTime)<1e-7, '임무 저장 시간 불일치');
          assert(savedTarget.hp > 0, '파괴된 목표 차량의 진행 임무는 복원할 수 없습니다.');
          assert(s.shotCount >= contract.metrics.shots && casualties >= contract.metrics.civilianCasualties, '누적 임무 통계보다 작은 저장 통계');
          assert(contract.lastFacts.inTarget === (s.player.carId === 'target'), '임무 좌석 기록 불일치');
          // Facts may trail a direct shot or a developer action by one tick. Do
          // not require their coordinates/counters to equal the latest world.
          // A completed contract is terminal, so its physical success is strict.
          if (contract.phase === 'complete') {
            const rules = contract.definition.rules, depot = contract.definition.locations.garage;
            assert(s.wanted.level === 0 && queue.pendingCount === 0 &&
              Math.abs(savedTarget.x-depot[0]) <= rules.deliveryHalfExtentM && Math.abs(savedTarget.z-depot[2]) <= rules.deliveryHalfExtentM,
              '완료 임무의 인도 조건 불일치');
            assert(s.rewardKeys.includes(s.runId + ':delivery'), '완료 임무의 보상 기록 누락');
          }
        } else assert(['free','complete'].includes(s.phase),'진행 임무 기록 누락');
      } else {
        queue.replacePending(s.events.map(event => { const e = {...event}; delete e.epoch; return e; }),{now:s.time});
        if (!['free','complete'].includes(s.phase)) {
          contract = new HarborMission.ContractRun(HarborContracts.harbor_recovery,approach);
          // Legacy saves lack graph state. Preserve clocks, then reevaluate actual world facts.
          contract.elapsed = s.missionTime;
          const target = s.cars.find(c => c.id === 'target');
          contract.update(0,{alive:true,playerPos:s.player.pos,
            inTarget:s.player.carId === 'target' && target.occupant === 'player',
            targetPos:[target.x,0,target.z],targetHp:target.hp,targetMaxHp:GAME_DATA.vehicles[target.kind].hp,targetSpeed:0,
            wanted:s.wanted.level,pendingReports:queue.pendingCount,shots:s.shotCount || 0,civilianCasualties:0});
          assert(contract.phase !== 'failed','파괴된 목표 차량 저장은 복원할 수 없습니다.');
          s.phase = contract.phase;
        }
      }
      this._restoringV4 = true;
      this.reportQueue = queue; this.sessionEpoch = nextEpoch; this.ability = ability;
      this.contract = contract; this.approach = approach; this.civilianCasualties = casualties;
      this.activeRealTime = activeReal; this.legacyMigrated = legacy; this.incidentBuckets = new Map();
      try { base.restore.call(this,s); } finally { this._restoringV4 = false; }
      this.lastDamage = this.time-sinceDamage; this.acc = 0;
      // Zero is a valid exhausted search timer; do not restore it to a full search.
      this.wanted.maxSearch = HarborGameplayData.police.searchSeconds[s.wanted.level];
      this.wanted.search = Math.min(s.wanted.search,this.wanted.maxSearch);
      this.wanted.events = new Set(s.wanted.events);
      this.policeSerial = this.cars.reduce((maximum, car) => {
        const match = /^policeCar(\d+)$/.exec(car.id);
        return match ? Math.max(maximum,Number(match[1])+1) : maximum;
      },0);
      if (contract) { this.phase = contract.phase; this.deliveryHold = contract.hold; this.missionTime = contract.elapsed; }
      this.cam.yaw = s.cam.yaw; this.cam.pitch = s.cam.pitch; this.updateCamera(1,true);
      if (byId('abilitySelect')) byId('abilitySelect').value = ability.role;
      if (byId('approachSelect')) byId('approachSelect').value = approach;
      this.updateHUD();
      return true;
    };

    p.updateHUD = function() {
      base.updateHUD.call(this);
      if (!this.ability) return;
      const a = this.ability, reason = a.eligibility(this.abilityContext());
      put('abilityTitle',a.config.label);
      put('abilityStatus',a.active ? '활성 · '+Math.ceil(a.energy)+'%' : a.cooldown > 0 ? '재충전 '+a.cooldown.toFixed(1)+'초' : reason === 'requires_driver' ? '운전석에서 F' : reason === 'requires_on_foot' ? '도보에서 F' : 'F 능력 · '+Math.floor(a.energy)+'%');
      if (byId('abilityFill')) byId('abilityFill').style.width = a.energy+'%';
      byId('abilityHud')?.classList.toggle('active',a.active);
      document.body.classList.toggle('abilityActive',a.active);
      if (!this.wanted.level && this.reportQueue.pendingCount) put('wantedStatus','목격자 신고 중 · '+this.reportQueue.pendingCount+'명');
      if (this.contract && this.phase !== 'free' && !this.lab) {
        const objective = this.contract.objective();
        put('objectiveTitle',objective.title); put('objectiveDesc',objective.description);
        put('missionIndex','CONTRACT 01 / '+objective.approachLabel);
        put('markerName',objective.markerLabel);
        byId('missionProgress').style.width = this.contract.progress*100+'%';
        const panel = byId('medalPanel');
        if (panel) { panel.hidden = false; panel.innerHTML = this.contract.medals().map(m=>'<span class="'+(m.status==='missed'?'missed':m.earned?'earned':'pending')+'" title="'+m.description+'">'+(m.earned?'◆':m.status==='missed'?'×':'◇')+' '+m.label+'</span>').join(''); }
        if (this.contract.hold > 0 && this.phase === 'deliver') put('prompt','인도 확인 '+Math.round(100*this.contract.hold/this.contract.definition.rules.deliveryHoldSeconds)+'%');
        else if (this.player.carId === 'target' && this.reportQueue.pendingCount && Math.hypot(this.player.pos[0]+108,this.player.pos[2]-104)<13) put('prompt','목격자 신고 처리가 끝나야 인도할 수 있습니다.');
      } else if (byId('medalPanel')) byId('medalPanel').hidden = true;
      if (this.wheel?.open) this.updateWeaponWheel();
      if (this.mode === 'devPanel') byId('devStats').textContent += '\nDATA '+HarborGameplayData.revision+' / '+HarborContracts.harbor_recovery.revision+'\nREAL '+this.activeRealTime.toFixed(1)+'s / SCALE '+this.worldTimeScale().toFixed(2)+'\nABILITY '+a.role+' '+a.energy.toFixed(1)+' / '+a.active+'\nREPORTS '+this.reportQueue.pendingCount+' / EPOCH '+this.sessionEpoch;
    };
    p.snapshot = function() {
      return {...base.snapshot.call(this), gameplayV4:{ability:this.ability.serialize(), wheel:{...this.wheel},
        worldScale:this.worldTimeScale(),activeRealTime:this.activeRealTime,approach:this.approach,
        pendingReports:this.reportQueue.pendingCount,epoch:this.sessionEpoch,contract:this.contract?.snapshot() || null}};
    };
  }
  return {install};
})();
